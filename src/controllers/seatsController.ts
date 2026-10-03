import { Request, Response } from 'express';
import { db } from '../db/connection.js';
import { redisLockService } from '../services/redisLockService.js';
import { broadcastSeatLocked, broadcastSeatUnlocked } from '../socket.js';
import { config } from '../config/env.js';

export async function getShowSeats(req: Request, res: Response) {
  try {
    const { showId } = req.params;
    const userLockToken = (req.headers['x-user-lock-token'] as string) || (req.query.userLockToken as string) || '';

    // 1. Fetch Show Details
    const showRes = await db.query('SELECT * FROM shows WHERE id = $1', [showId]);
    if (showRes.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Show not found.' });
    }
    const show = showRes.rows[0];

    // 2. Fetch Movie & Theatre & Screen info
    const movie = (await db.query('SELECT id, title, poster_url, backdrop_url, duration, language, rating FROM movies WHERE id = $1', [show.movie_id])).rows[0];
    const theatre = (await db.query('SELECT id, name, city, address FROM theatres WHERE id = $1', [show.theatre_id])).rows[0];
    const screen = (await db.query('SELECT id, name, format, total_seats FROM screens WHERE id = $1', [show.screen_id])).rows[0];

    // 3. Fetch Show Seats and Physical Seats
    const showSeatsRes = await db.query('SELECT * FROM show_seats WHERE show_id = $1', [showId]);
    const physicalSeatsRes = await db.query('SELECT * FROM seats WHERE screen_id = $1', [show.screen_id]);
    const physicalSeatsMap = new Map(physicalSeatsRes.rows.map((s: any) => [s.id, s]));

    // 4. Fetch Active Redis Temporary Locks
    const activeLocks = await redisLockService.getAllActiveLocksForShow(showId);

    // 5. Build Seat Grid Map
    const categorizedSeats: Record<string, { category: string; price: number; rows: Record<string, any[]> }> = {
      RECLINER: { category: 'RECLINER', price: 450, rows: {} },
      PRIME: { category: 'PRIME', price: 280, rows: {} },
      CLASSIC: { category: 'CLASSIC', price: 180, rows: {} }
    };

    let totalAvailable = 0;
    let totalBooked = 0;
    let totalLocked = 0;

    for (const ss of showSeatsRes.rows) {
      const physicalSeat = physicalSeatsMap.get(ss.seat_id);
      if (!physicalSeat) continue;

      const category = ss.category || physicalSeat.category || 'CLASSIC';
      const row = physicalSeat.row_label;

      if (!categorizedSeats[category]) {
        categorizedSeats[category] = { category, price: Number(ss.price), rows: {} };
      }
      if (!categorizedSeats[category].rows[row]) {
        categorizedSeats[category].rows[row] = [];
      }

      const activeLock = activeLocks[ss.seat_id];
      const isLockedByMe = Boolean(activeLock && userLockToken && activeLock.lockedBy === userLockToken);
      const isLockedByOther = Boolean(activeLock && (!userLockToken || activeLock.lockedBy !== userLockToken));

      let effectiveStatus = ss.status; // 'AVAILABLE' or 'BOOKED'
      if (effectiveStatus !== 'BOOKED') {
        if (isLockedByOther) {
          effectiveStatus = 'LOCKED';
          totalLocked++;
        } else if (isLockedByMe) {
          effectiveStatus = 'SELECTED';
          totalAvailable++;
        } else {
          effectiveStatus = 'AVAILABLE';
          totalAvailable++;
        }
      } else {
        totalBooked++;
      }

      categorizedSeats[category].price = Number(ss.price);
      categorizedSeats[category].rows[row].push({
        seatId: ss.seat_id,
        showSeatId: ss.id,
        rowLabel: physicalSeat.row_label,
        seatNumber: physicalSeat.seat_number,
        category: category,
        price: Number(ss.price),
        status: effectiveStatus,
        isLockedByMe,
        remainingTtl: activeLock ? activeLock.ttl : 0
      });
    }

    // Sort seat numbers within each row
    for (const catKey of Object.keys(categorizedSeats)) {
      for (const rowKey of Object.keys(categorizedSeats[catKey].rows)) {
        categorizedSeats[catKey].rows[rowKey].sort((a, b) => a.seatNumber - b.seatNumber);
      }
    }

    return res.json({
      success: true,
      show: {
        id: show.id,
        startTime: show.start_time,
        endTime: show.end_time,
        date: show.date,
        language: show.language,
        format: show.format,
        movie,
        theatre,
        screen
      },
      stats: {
        totalSeats: showSeatsRes.rows.length,
        available: totalAvailable,
        booked: totalBooked,
        locked: totalLocked
      },
      lockTtlSeconds: config.lockTtlSeconds,
      categories: Object.values(categorizedSeats)
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
}

export async function lockSeats(req: Request, res: Response) {
  try {
    const { showId, seatIds, userLockToken } = req.body;

    if (!showId || !seatIds || !Array.isArray(seatIds) || seatIds.length === 0) {
      return res.status(400).json({ success: false, message: 'showId and seatIds array are required.' });
    }

    if (!userLockToken) {
      return res.status(400).json({ success: false, message: 'userLockToken is required for concurrency session tracking.' });
    }

    // Limit maximum seats selectable in one booking
    if (seatIds.length > 10) {
      return res.status(400).json({ success: false, message: 'Maximum 10 seats can be selected per booking.' });
    }

    // 1. Verify DB status: Ensure seats are not permanently BOOKED
    const showSeatsRes = await db.query('SELECT * FROM show_seats WHERE show_id = $1', [showId]);
    const targetSeats = showSeatsRes.rows.filter((ss: any) => seatIds.includes(ss.seat_id));

    if (targetSeats.length !== seatIds.length) {
      return res.status(404).json({ success: false, message: 'One or more selected seats do not exist for this show.' });
    }

    const alreadyBooked = targetSeats.find((ss: any) => ss.status === 'BOOKED');
    if (alreadyBooked) {
      return res.status(409).json({
        success: false,
        message: `Sorry, seat ${alreadyBooked.seat_id} is already booked.`
      });
    }

    // 2. Perform Atomic Redis Multi-Seat Lock with Automatic Rollback
    const lockResult = await redisLockService.acquireMultipleSeatLocks(
      showId,
      seatIds,
      userLockToken,
      config.lockTtlSeconds
    );

    if (!lockResult.success) {
      return res.status(409).json({
        success: false,
        message: `Sorry, seat ${lockResult.failedSeat} was just selected by another user.`
      });
    }

    // 3. Broadcast real-time socket events for other users
    for (const seatId of seatIds) {
      broadcastSeatLocked(showId, seatId, userLockToken, config.lockTtlSeconds);
    }

    return res.status(200).json({
      success: true,
      message: 'Seats temporarily locked successfully.',
      lockedSeats: lockResult.lockedSeats,
      ttl: lockResult.ttl,
      expiresAt: Date.now() + lockResult.ttl * 1000
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
}

export async function unlockSeats(req: Request, res: Response) {
  try {
    const { showId, seatIds, userLockToken } = req.body;

    if (!showId || !seatIds || !Array.isArray(seatIds) || seatIds.length === 0) {
      return res.status(400).json({ success: false, message: 'showId and seatIds array are required.' });
    }

    if (!userLockToken) {
      return res.status(400).json({ success: false, message: 'userLockToken is required.' });
    }

    await redisLockService.releaseMultipleSeatLocks(showId, seatIds, userLockToken);

    // Broadcast socket event
    broadcastSeatUnlocked(showId, seatIds);

    return res.json({
      success: true,
      message: 'Seats released successfully.',
      releasedSeats: seatIds
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
}
