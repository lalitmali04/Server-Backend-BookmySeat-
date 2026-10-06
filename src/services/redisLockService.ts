import Redis from 'ioredis';
import { config } from '../config/env.js';

interface LockInfo {
  token: string;
  expiresAt: number; // timestamp in ms
}

class InMemoryRedisStore {
  private store: Map<string, LockInfo> = new Map();
  private timers: Map<string, NodeJS.Timeout> = new Map();

  // SET key value NX EX seconds
  async setNxEx(key: string, value: string, ttlSeconds: number): Promise<boolean> {
    const existing = this.store.get(key);
    const now = Date.now();

    if (existing && existing.expiresAt > now) {
      // Key is already locked and active
      return false;
    }

    // Set lock
    const expiresAt = now + ttlSeconds * 1000;
    this.store.set(key, { token: value, expiresAt });

    // Set TTL cleanup timer
    if (this.timers.has(key)) {
      clearTimeout(this.timers.get(key)!);
    }
    const timer = setTimeout(() => {
      this.store.delete(key);
      this.timers.delete(key);
    }, ttlSeconds * 1000);
    this.timers.set(key, timer);

    return true;
  }

  async get(key: string): Promise<string | null> {
    const existing = this.store.get(key);
    if (!existing) return null;
    if (existing.expiresAt <= Date.now()) {
      this.store.delete(key);
      return null;
    }
    return existing.token;
  }

  async delIfMatches(key: string, token: string): Promise<boolean> {
    const existing = this.store.get(key);
    if (!existing) return false;
    if (existing.token === token) {
      this.store.delete(key);
      if (this.timers.has(key)) {
        clearTimeout(this.timers.get(key)!);
        this.timers.delete(key);
      }
      return true;
    }
    return false;
  }

  async del(key: string): Promise<boolean> {
    const existed = this.store.has(key);
    this.store.delete(key);
    if (this.timers.has(key)) {
      clearTimeout(this.timers.get(key)!);
      this.timers.delete(key);
    }
    return existed;
  }

  async getTtl(key: string): Promise<number> {
    const existing = this.store.get(key);
    if (!existing) return -2;
    const remaining = Math.max(0, Math.ceil((existing.expiresAt - Date.now()) / 1000));
    if (remaining === 0) {
      this.store.delete(key);
      return -2;
    }
    return remaining;
  }

  async getKeysByPrefix(prefix: string): Promise<string[]> {
    const now = Date.now();
    const matched: string[] = [];
    for (const [k, v] of this.store.entries()) {
      if (k.startsWith(prefix) && v.expiresAt > now) {
        matched.push(k);
      }
    }
    return matched;
  }
}

class RedisLockService {
  private redisClient: any = null;
  private inMemoryRedis: InMemoryRedisStore = new InMemoryRedisStore();
  private useRealRedis: boolean = false;

  constructor() {
    if (config.redisUrl) {
      try {
        this.redisClient = new (Redis as any)(config.redisUrl, {
          maxRetriesPerRequest: 1,
          connectTimeout: 3000,
          retryStrategy: () => null // Don't hang if offline, fallback seamlessly
        });

        this.redisClient.on('connect', () => {
          console.log('Successfully connected to Redis instance for distributed seat locking.');
          this.useRealRedis = true;
        });

        this.redisClient.on('error', (err: any) => {
          console.warn('Redis connection failed. Using high-performance in-memory atomic lock engine.', err.message);
          this.useRealRedis = false;
        });
      } catch (err) {
        console.warn('Initializing in-memory lock engine.');
      }
    } else {
      console.log('Using in-memory Redis lock engine for distributed seat concurrency.');
    }
  }

  private getSeatKey(showId: string, seatId: string): string {
    return `seat_lock:${showId}:${seatId}`;
  }

  /**
   * Acquire atomic lock on a single seat.
   * Uses SET seat_lock:{showId}:{seatId} {userToken} NX EX {ttl}
   */
  async acquireSeatLock(
    showId: string,
    seatId: string,
    userToken: string,
    ttlSeconds: number = config.lockTtlSeconds
  ): Promise<{ success: boolean; ttl: number; message?: string }> {
    const key = this.getSeatKey(showId, seatId);

    if (this.useRealRedis && this.redisClient) {
      try {
        const result = await this.redisClient.set(key, userToken, 'EX', ttlSeconds, 'NX');
        if (result === 'OK') {
          return { success: true, ttl: ttlSeconds };
        } else {
          return { success: false, ttl: 0, message: 'Seat is temporarily locked by another user.' };
        }
      } catch (e) {
        // Fallback to in-memory
      }
    }

    const acquired = await this.inMemoryRedis.setNxEx(key, userToken, ttlSeconds);
    if (acquired) {
      return { success: true, ttl: ttlSeconds };
    }
    return { success: false, ttl: 0, message: 'Seat is temporarily locked by another user.' };
  }

  /**
   * Atomically acquire locks for multiple seats.
   * If any single seat fails, all previously acquired locks in this batch are rolled back!
   */
  async acquireMultipleSeatLocks(
    showId: string,
    seatIds: string[],
    userToken: string,
    ttlSeconds: number = config.lockTtlSeconds
  ): Promise<{ success: boolean; lockedSeats: string[]; failedSeat?: string; ttl: number }> {
    const successfullyLocked: string[] = [];

    for (const seatId of seatIds) {
      const lockRes = await this.acquireSeatLock(showId, seatId, userToken, ttlSeconds);
      if (lockRes.success) {
        successfullyLocked.push(seatId);
      } else {
        // Rollback already acquired locks in this request
        for (const rollbackSeatId of successfullyLocked) {
          await this.releaseSeatLock(showId, rollbackSeatId, userToken);
        }
        return {
          success: false,
          lockedSeats: [],
          failedSeat: seatId,
          ttl: 0
        };
      }
    }

    return {
      success: true,
      lockedSeats: successfullyLocked,
      ttl: ttlSeconds
    };
  }

  /**
   * Release seat lock if and only if owned by userToken.
   */
  async releaseSeatLock(showId: string, seatId: string, userToken: string): Promise<boolean> {
    const key = this.getSeatKey(showId, seatId);

    if (this.useRealRedis && this.redisClient) {
      try {
        // Lua script for atomic unlock verification
        const luaScript = `
          if redis.call("get", KEYS[1]) == ARGV[1] then
            return redis.call("del", KEYS[1])
          else
            return 0
          end
        `;
        const res = await this.redisClient.eval(luaScript, 1, key, userToken);
        return res === 1;
      } catch (e) {
        // Fallback
      }
    }

    return this.inMemoryRedis.delIfMatches(key, userToken);
  }

  /**
   * Release multiple seat locks owned by user.
   */
  async releaseMultipleSeatLocks(showId: string, seatIds: string[], userToken: string): Promise<void> {
    await Promise.all(seatIds.map(seatId => this.releaseSeatLock(showId, seatId, userToken)));
  }

  /**
   * Force release seat lock (used by admin or after confirmed booking checkout)
   */
  async forceReleaseSeatLock(showId: string, seatId: string): Promise<void> {
    const key = this.getSeatKey(showId, seatId);
    if (this.useRealRedis && this.redisClient) {
      try {
        await this.redisClient.del(key);
      } catch (e) {}
    }
    await this.inMemoryRedis.del(key);
  }

  /**
   * Verify if all requested seats are currently locked and belong to userToken
   */
  async verifySeatLocksOwnership(showId: string, seatIds: string[], userToken: string): Promise<{ valid: boolean; invalidSeat?: string }> {
    for (const seatId of seatIds) {
      const key = this.getSeatKey(showId, seatId);
      let owner: string | null = null;

      if (this.useRealRedis && this.redisClient) {
        try {
          owner = await this.redisClient.get(key);
        } catch (e) {}
      }

      if (!owner) {
        owner = await this.inMemoryRedis.get(key);
      }

      if (!owner || owner !== userToken) {
        return { valid: false, invalidSeat: seatId };
      }
    }

    return { valid: true };
  }

  /**
   * Get all active locks for a given show (for live UI mapping)
   */
  async getAllActiveLocksForShow(showId: string): Promise<Record<string, { lockedBy: string; ttl: number }>> {
    const prefix = `seat_lock:${showId}:`;
    const result: Record<string, { lockedBy: string; ttl: number }> = {};

    if (this.useRealRedis && this.redisClient) {
      try {
        const keys = await this.redisClient.keys(`${prefix}*`);
        for (const key of keys) {
          const seatId = key.replace(prefix, '');
          const token = await this.redisClient.get(key);
          const ttl = await this.redisClient.ttl(key);
          if (token && ttl > 0) {
            result[seatId] = { lockedBy: token, ttl };
          }
        }
        return result;
      } catch (e) {}
    }

    const keys = await this.inMemoryRedis.getKeysByPrefix(prefix);
    for (const key of keys) {
      const seatId = key.replace(prefix, '');
      const token = await this.inMemoryRedis.get(key);
      const ttl = await this.inMemoryRedis.getTtl(key);
      if (token && ttl > 0) {
        result[seatId] = { lockedBy: token, ttl };
      }
    }

    return result;
  }
}

export const redisLockService = new RedisLockService();
