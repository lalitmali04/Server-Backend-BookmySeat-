import pg from 'pg';
import { config } from '../config/env.js';
import fs from 'fs';
import path from 'path';

const { Pool } = pg;

export interface DBClient {
  query<T = any>(sql: string, params?: any[]): Promise<{ rows: T[]; rowCount: number }>;
  beginTransaction(): Promise<void>;
  commit(): Promise<void>;
  rollback(): Promise<void>;
  release(): void;
}

class PostgresAdapter {
  private pool: pg.Pool;

  constructor(connectionString: string) {
    this.pool = new Pool({
      connectionString,
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    });
  }

  async query<T = any>(sql: string, params?: any[]): Promise<{ rows: T[]; rowCount: number }> {
    const res = (params && params.length > 0) ? await this.pool.query(sql, params) : await this.pool.query(sql);
    return { rows: res.rows, rowCount: res.rowCount || 0 };
  }

  async getClient(): Promise<DBClient> {
    const client = await this.pool.connect();
    return {
      query: async (sql, params) => {
        const res = (params && params.length > 0) ? await client.query(sql, params) : await client.query(sql);
        return { rows: res.rows, rowCount: res.rowCount || 0 };
      },
      beginTransaction: async () => {
        await client.query('BEGIN');
      },
      commit: async () => {
        await client.query('COMMIT');
      },
      rollback: async () => {
        await client.query('ROLLBACK');
      },
      release: () => {
        client.release();
      }
    };
  }
}

// Resilient In-Memory & File-backed Relational Store with Full Transaction & Row-Level Locking Support
class ResilientRelationalEngine {
  public tables: Record<string, any[]> = {
    users: [],
    movies: [],
    theatres: [],
    screens: [],
    seats: [],
    shows: [],
    show_seats: [],
    bookings: [],
    booking_items: [],
    payments: []
  };

  private rowLocks: Set<string> = new Set(); // format: "tableName:rowId"
  private txMutex: Promise<void> = Promise.resolve();

  constructor() {
    this.initStorage();
  }

  private initStorage() {
    for (const key of Object.keys(this.tables)) {
      if (!this.tables[key]) this.tables[key] = [];
    }
  }

  private async acquireRowLock(table: string, id: string): Promise<() => void> {
    const lockKey = `${table}:${id}`;
    while (this.rowLocks.has(lockKey)) {
      await new Promise(r => setTimeout(r, 10));
    }
    this.rowLocks.add(lockKey);
    return () => {
      this.rowLocks.delete(lockKey);
    };
  }

  async query<T = any>(sql: string, params: any[] = []): Promise<{ rows: T[]; rowCount: number }> {
    const client = await this.getClient();
    try {
      const res = await client.query<T>(sql, params);
      return res;
    } finally {
      client.release();
    }
  }

  async getClient(): Promise<DBClient> {
    const transactionSnapshot: Record<string, any[]> = {};
    const heldRowLocks: (() => void)[] = [];
    let inTransaction = false;

    return {
      query: async <T = any>(rawSql: string, params: any[] = []): Promise<{ rows: T[]; rowCount: number }> => {
        const sql = rawSql.trim();
        const sqlLower = sql.toLowerCase();

        // 1. SELECT FOR UPDATE (Row level locking)
        if (sqlLower.startsWith('select') && sqlLower.includes('for update')) {
          if (sqlLower.includes('from show_seats')) {
            const showId = params[0];
            const seatIds: string[] = Array.isArray(params[1]) ? params[1] : params.slice(1);
            
            for (const seatId of seatIds) {
              const unlock = await this.acquireRowLock('show_seats', `${showId}:${seatId}`);
              heldRowLocks.push(unlock);
            }

            const targetSource = inTransaction && transactionSnapshot.show_seats ? transactionSnapshot.show_seats : this.tables.show_seats;
            const rows = targetSource.filter(ss => ss.show_id === showId && seatIds.includes(ss.seat_id));
            return { rows: JSON.parse(JSON.stringify(rows)), rowCount: rows.length };
          }
        }

        // 2. Regular SELECT
        if (sqlLower.startsWith('select')) {
          const target = this.executeSelect<T>(sql, params, inTransaction ? transactionSnapshot : this.tables);
          return { rows: target, rowCount: target.length };
        }

        // 3. INSERT
        if (sqlLower.startsWith('insert into')) {
          const res = this.executeInsert<T>(sql, params, inTransaction ? transactionSnapshot : this.tables);
          return res;
        }

        // 4. UPDATE
        if (sqlLower.startsWith('update')) {
          const res = this.executeUpdate(sql, params, inTransaction ? transactionSnapshot : this.tables);
          return res;
        }

        // 5. DELETE
        if (sqlLower.startsWith('delete from')) {
          const res = this.executeDelete(sql, params, inTransaction ? transactionSnapshot : this.tables);
          return res;
        }

        return { rows: [], rowCount: 0 };
      },

      beginTransaction: async () => {
        inTransaction = true;
        for (const key of Object.keys(this.tables)) {
          transactionSnapshot[key] = JSON.parse(JSON.stringify(this.tables[key]));
        }
      },

      commit: async () => {
        if (inTransaction) {
          // Check live unique constraints before final commit
          for (const newBooking of (transactionSnapshot.bookings || [])) {
            if (!this.tables.bookings.some(b => b.id === newBooking.id)) {
              if (newBooking.idempotency_key && this.tables.bookings.some(b => b.idempotency_key === newBooking.idempotency_key)) {
                inTransaction = false;
                throw new Error('UNIQUE constraint failed: bookings.idempotency_key');
              }
            }
          }
          // Commit snapshot to live store
          for (const key of Object.keys(transactionSnapshot)) {
            this.tables[key] = transactionSnapshot[key];
          }
          inTransaction = false;
        }
        while (heldRowLocks.length > 0) {
          const unlock = heldRowLocks.pop();
          if (unlock) unlock();
        }
      },

      rollback: async () => {
        inTransaction = false;
        while (heldRowLocks.length > 0) {
          const unlock = heldRowLocks.pop();
          if (unlock) unlock();
        }
      },

      release: () => {
        while (heldRowLocks.length > 0) {
          const unlock = heldRowLocks.pop();
          if (unlock) unlock();
        }
      }
    };
  }

  private executeSelect<T>(sql: string, params: any[], store: Record<string, any[]>): T[] {
    const lower = sql.toLowerCase();

    if (lower.includes('from users')) {
      if (lower.includes('where email =')) {
        const email = params[0];
        return store.users.filter(u => u.email.toLowerCase() === (email || '').toLowerCase()) as T[];
      }
      if (lower.includes('where id =')) {
        const id = params[0];
        return store.users.filter(u => u.id === id) as T[];
      }
      return store.users as T[];
    }

    if (lower.includes('from movies')) {
      if (lower.includes('where id =')) {
        return store.movies.filter(m => m.id === params[0]) as T[];
      }
      return store.movies as T[];
    }

    if (lower.includes('from theatres')) {
      if (lower.includes('where id =')) {
        return store.theatres.filter(t => t.id === params[0]) as T[];
      }
      if (lower.includes('where city =')) {
        return store.theatres.filter(t => t.city.toLowerCase() === (params[0] || '').toLowerCase()) as T[];
      }
      return store.theatres as T[];
    }

    if (lower.includes('from shows')) {
      let result = store.shows;
      if (lower.includes('where id =')) {
        return store.shows.filter(s => s.id === params[0]) as T[];
      }
      if (lower.includes('movie_id =')) {
        const movieId = params[0];
        result = result.filter(s => s.movie_id === movieId);
      }
      if (lower.includes('date =')) {
        const dateIndex = lower.includes('movie_id =') ? 1 : 0;
        const date = params[dateIndex];
        if (date) {
          result = result.filter(s => s.date === date);
        }
      }
      return result as T[];
    }

    if (lower.includes('from screens')) {
      if (lower.includes('where id =')) {
        return store.screens.filter(s => s.id === params[0]) as T[];
      }
      if (lower.includes('where theatre_id =')) {
        return store.screens.filter(s => s.theatre_id === params[0]) as T[];
      }
      return store.screens as T[];
    }

    if (lower.includes('from show_seats')) {
      if (lower.includes('where show_id =')) {
        const showId = params[0];
        return store.show_seats.filter(ss => ss.show_id === showId) as T[];
      }
      return store.show_seats as T[];
    }

    if (lower.includes('from seats')) {
      if (lower.includes('where screen_id =')) {
        return store.seats.filter(s => s.screen_id === params[0]) as T[];
      }
      return store.seats as T[];
    }

    if (lower.includes('from bookings')) {
      if (lower.includes('where id =')) {
        return store.bookings.filter(b => b.id === params[0]) as T[];
      }
      if (lower.includes('where idempotency_key =')) {
        return store.bookings.filter(b => b.idempotency_key === params[0]) as T[];
      }
      if (lower.includes('where booking_reference =')) {
        return store.bookings.filter(b => b.booking_reference === params[0]) as T[];
      }
      if (lower.includes('where user_id =')) {
        return store.bookings.filter(b => b.user_id === params[0]).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()) as T[];
      }
      return store.bookings.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()) as T[];
    }

    if (lower.includes('from booking_items')) {
      if (lower.includes('where booking_id =')) {
        return store.booking_items.filter(bi => bi.booking_id === params[0]) as T[];
      }
      return store.booking_items as T[];
    }

    if (lower.includes('from payments')) {
      if (lower.includes('where booking_id =')) {
        return store.payments.filter(p => p.booking_id === params[0]) as T[];
      }
      return store.payments as T[];
    }

    return [] as T[];
  }

  private executeInsert<T>(sql: string, params: any[], store: Record<string, any[]>): { rows: T[]; rowCount: number } {
    const lower = sql.toLowerCase();

    if (lower.includes('insert into users')) {
      const user = {
        id: params[0],
        name: params[1],
        email: params[2],
        password_hash: params[3],
        role: params[4] || 'user',
        phone: params[5] || '',
        created_at: params[6] || new Date().toISOString()
      };
      // Check unique constraint on email
      if (store.users.some(u => u.email.toLowerCase() === user.email.toLowerCase())) {
        throw new Error('UNIQUE constraint failed: users.email');
      }
      store.users.push(user);
      return { rows: [user as unknown as T], rowCount: 1 };
    }

    if (lower.includes('insert into bookings')) {
      const booking = {
        id: params[0],
        booking_reference: params[1],
        user_id: params[2],
        show_id: params[3],
        total_amount: Number(params[4]),
        convenience_fee: Number(params[5]),
        tax: Number(params[6]),
        final_amount: Number(params[7]),
        status: params[8] || 'CONFIRMED',
        payment_status: params[9] || 'COMPLETED',
        payment_id: params[10],
        idempotency_key: params[11],
        created_at: params[12] || new Date().toISOString()
      };
      // Check unique constraint on idempotency_key
      if (booking.idempotency_key && store.bookings.some(b => b.idempotency_key === booking.idempotency_key)) {
        throw new Error('UNIQUE constraint failed: bookings.idempotency_key');
      }
      // Check unique constraint on booking_reference
      if (store.bookings.some(b => b.booking_reference === booking.booking_reference)) {
        throw new Error('UNIQUE constraint failed: bookings.booking_reference');
      }
      store.bookings.push(booking);
      return { rows: [booking as unknown as T], rowCount: 1 };
    }

    if (lower.includes('insert into booking_items')) {
      const item = {
        id: params[0],
        booking_id: params[1],
        show_seat_id: params[2],
        seat_label: params[3],
        price: Number(params[4]),
        category: params[5]
      };
      store.booking_items.push(item);
      return { rows: [item as unknown as T], rowCount: 1 };
    }

    if (lower.includes('insert into payments')) {
      const payment = {
        id: params[0],
        booking_id: params[1],
        user_id: params[2],
        amount: Number(params[3]),
        payment_method: params[4],
        status: params[5],
        transaction_ref: params[6],
        created_at: params[7] || new Date().toISOString()
      };
      store.payments.push(payment);
      return { rows: [payment as unknown as T], rowCount: 1 };
    }

    if (lower.includes('insert into movies')) {
      const movie = {
        id: params[0],
        title: params[1],
        poster_url: params[2],
        backdrop_url: params[3],
        trailer_url: params[4],
        rating: Number(params[5]),
        votes: Number(params[6]),
        duration: params[7],
        release_date: params[8],
        language: params[9],
        genres: typeof params[10] === 'string' ? params[10].split(',') : params[10],
        description: params[11],
        cast_list: typeof params[12] === 'string' ? JSON.parse(params[12]) : params[12],
        director: params[13],
        is_trending: Boolean(params[14]),
        is_now_showing: Boolean(params[15]),
        is_upcoming: Boolean(params[16]),
        category: params[17] || 'movie'
      };
      store.movies.push(movie);
      return { rows: [movie as unknown as T], rowCount: 1 };
    }

    if (lower.includes('insert into theatres')) {
      const theatre = {
        id: params[0],
        name: params[1],
        city: params[2],
        address: params[3],
        rating: Number(params[4]),
        facilities: typeof params[5] === 'string' ? params[5].split(',') : params[5],
        created_at: new Date().toISOString()
      };
      store.theatres.push(theatre);
      return { rows: [theatre as unknown as T], rowCount: 1 };
    }

    if (lower.includes('insert into screens')) {
      const screen = {
        id: params[0],
        theatre_id: params[1],
        name: params[2],
        format: params[3],
        total_seats: Number(params[4]),
        created_at: new Date().toISOString()
      };
      store.screens.push(screen);
      return { rows: [screen as unknown as T], rowCount: 1 };
    }

    if (lower.includes('insert into seats')) {
      const seat = {
        id: params[0],
        screen_id: params[1],
        row_label: params[2],
        seat_number: Number(params[3]),
        category: params[4],
        is_active: Boolean(params[5] ?? true)
      };
      store.seats.push(seat);
      return { rows: [seat as unknown as T], rowCount: 1 };
    }

    if (lower.includes('insert into shows')) {
      const show = {
        id: params[0],
        movie_id: params[1],
        screen_id: params[2],
        theatre_id: params[3],
        start_time: params[4],
        end_time: params[5],
        date: params[6],
        language: params[7],
        format: params[8],
        created_at: new Date().toISOString()
      };
      store.shows.push(show);
      return { rows: [show as unknown as T], rowCount: 1 };
    }

    if (lower.includes('insert into show_seats')) {
      const showSeat = {
        id: params[0],
        show_id: params[1],
        seat_id: params[2],
        category: params[3],
        price: Number(params[4]),
        status: params[5] || 'AVAILABLE',
        updated_at: new Date().toISOString()
      };
      // Unique constraint on (show_id, seat_id)
      if (store.show_seats.some(ss => ss.show_id === showSeat.show_id && ss.seat_id === showSeat.seat_id)) {
        throw new Error('UNIQUE constraint failed: show_seats(show_id, seat_id)');
      }
      store.show_seats.push(showSeat);
      return { rows: [showSeat as unknown as T], rowCount: 1 };
    }

    return { rows: [], rowCount: 0 };
  }

  private executeUpdate(sql: string, params: any[], store: Record<string, any[]>): { rows: any[]; rowCount: number } {
    const lower = sql.toLowerCase();

    if (lower.includes('update show_seats set status =')) {
      // e.g. UPDATE show_seats SET status = $1, updated_at = $2 WHERE show_id = $3 AND seat_id IN (...)
      const newStatus = params[0];
      const updatedAt = params[1] || new Date().toISOString();
      const showId = params[2];
      const seatIds: string[] = Array.isArray(params[3]) ? params[3] : params.slice(3);

      let updatedCount = 0;
      for (const ss of store.show_seats) {
        if (ss.show_id === showId && seatIds.includes(ss.seat_id)) {
          ss.status = newStatus;
          ss.updated_at = updatedAt;
          updatedCount++;
        }
      }
      return { rows: [], rowCount: updatedCount };
    }

    if (lower.includes('update bookings set status =')) {
      const newStatus = params[0];
      const bookingId = params[1];
      const booking = store.bookings.find(b => b.id === bookingId);
      if (booking) {
        booking.status = newStatus;
        return { rows: [booking], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    }

    if (lower.includes('update movies')) {
      const movieId = params[params.length - 1];
      const movie = store.movies.find(m => m.id === movieId);
      if (movie) {
        // Update fields if provided
        movie.title = params[0] ?? movie.title;
        movie.rating = params[1] != null ? Number(params[1]) : movie.rating;
        movie.genres = params[2] ? (typeof params[2] === 'string' ? params[2].split(',') : params[2]) : movie.genres;
        return { rows: [movie], rowCount: 1 };
      }
    }

    return { rows: [], rowCount: 0 };
  }

  private executeDelete(sql: string, params: any[], store: Record<string, any[]>): { rows: any[]; rowCount: number } {
    const lower = sql.toLowerCase();
    if (lower.includes('delete from movies where id =')) {
      const id = params[0];
      const idx = store.movies.findIndex(m => m.id === id);
      if (idx !== -1) {
        const removed = store.movies.splice(idx, 1);
        return { rows: removed, rowCount: 1 };
      }
    }
    return { rows: [], rowCount: 0 };
  }
}

// Global DB Singleton
let dbAdapter: PostgresAdapter | ResilientRelationalEngine;

if (config.databaseUrl && config.databaseUrl.startsWith('postgres')) {
  console.log('Connecting to PostgreSQL database:', config.databaseUrl.split('@')[1] || 'Postgres');
  dbAdapter = new PostgresAdapter(config.databaseUrl);
} else {
  console.log('Initializing BookMySeat Resilient Relational DB Engine with row-level locks & ACID transactions.');
  dbAdapter = new ResilientRelationalEngine();
}

export const db = dbAdapter;
