import { db } from '../db/connection.js';
import { redisLockService } from './redisLockService.js';
import { broadcastSeatBooked, broadcastSeatUnlocked } from '../socket.js';
import { config } from '../config/env.js';
import { v4 as uuidv4 } from 'uuid';

export interface ConfirmBookingParams {
  userId: string;
  showId: string;
  seatIds: string[];
  userLockToken: string;
  paymentMethod: string;
  idempotencyKey?: string;
}

export class BookingService {
  private inFlightBookings: Map<string, Promise<any>> = new Map();

  /**
   * Validate checkout pricing and seat lock validity
   */
  async validateCheckout(showId: string, seatIds: string[], userLockToken: string) {
    if (!seatIds || seatIds.length === 0) {
      throw { status: 400, message: 'No seats selected.' };
    }

    // 1. Verify Redis Lock ownership
    const lockCheck = await redisLockService.verifySeatLocksOwnership(showId, seatIds, userLockToken);
    if (!lockCheck.valid) {
      throw {
        status: 409,
        message: `Your temporary hold on seat ${lockCheck.invalidSeat} has expired or was not found. Please select again.`
      };
    }

    // 2. Fetch seat details from DB
    const showSeats = (await db.query('SELECT * FROM show_seats WHERE show_id = $1', [showId])).rows.filter(
      (ss: any) => seatIds.includes(ss.seat_id)
    );

    if (showSeats.length !== seatIds.length) {
      throw { status: 400, message: 'Some selected seats are invalid for this show.' };
    }

    // Check if already booked
    const alreadyBooked = showSeats.find((ss: any) => ss.status === 'BOOKED');
    if (alreadyBooked) {
      throw { status: 409, message: 'One or more seats have already been booked.' };
    }

    // Fetch Seats and Show
    const seatsRes = await db.query('SELECT * FROM seats');
    const seatsMap = new Map(seatsRes.rows.map((s: any) => [s.id, s]));

    const items = showSeats.map((ss: any) => {
      const seat = seatsMap.get(ss.seat_id);
      const label = seat ? `${seat.row_label}${seat.seat_number}` : ss.seat_id;
      return {
        seatId: ss.seat_id,
        seatLabel: label,
        category: ss.category,
        price: Number(ss.price)
      };
    });

    const baseAmount = items.reduce((sum: number, item: any) => sum + item.price, 0);
    const convenienceFee = Math.round(baseAmount * config.convenienceFeePercentage);
    const tax = Math.round(convenienceFee * config.gstPercentage);
    const finalAmount = baseAmount + convenienceFee + tax;

    return {
      showId,
      items,
      baseAmount,
      convenienceFee,
      tax,
      finalAmount,
      currency: 'INR'
    };
  }

  /**
   * Final Booking Confirmation with ACID Transaction + Row-Level Locking + Idempotency
   */
  async confirmBooking(params: ConfirmBookingParams): Promise<any> {
    const { userId, showId, seatIds, userLockToken, paymentMethod, idempotencyKey } = params;

    // 1. Idempotency Check & In-flight Deduplication
    if (idempotencyKey) {
      if (this.inFlightBookings.has(idempotencyKey)) {
        return this.inFlightBookings.get(idempotencyKey);
      }

      const existingBookingRes = await db.query(
        'SELECT * FROM bookings WHERE idempotency_key = $1',
        [idempotencyKey]
      );
      if (existingBookingRes.rows.length > 0) {
        const existing = existingBookingRes.rows[0];
        const items = (await db.query('SELECT * FROM booking_items WHERE booking_id = $1', [existing.id])).rows;
        return {
          ...existing,
          items,
          isDuplicateRequest: true
        };
      }
    }

    const executionPromise = this.executeBookingTransaction(params);
    if (idempotencyKey) {
      this.inFlightBookings.set(idempotencyKey, executionPromise);
      executionPromise.catch(() => {}).finally(() => {
        this.inFlightBookings.delete(idempotencyKey);
      });
    }

    return executionPromise;
  }

  private async executeBookingTransaction(params: ConfirmBookingParams) {
    const { userId, showId, seatIds, userLockToken, paymentMethod, idempotencyKey } = params;

    // 2. Verify Redis Lock ownership BEFORE opening DB transaction
    const lockCheck = await redisLockService.verifySeatLocksOwnership(showId, seatIds, userLockToken);
    if (!lockCheck.valid) {
      throw {
        status: 409,
        message: `Your temporary hold on seat ${lockCheck.invalidSeat} has expired. Booking rejected to prevent double-booking.`
      };
    }

    // 3. Acquire DB Client for ACID Transaction
    const client = await (db as any).getClient();

    try {
      await client.beginTransaction();

      // 4. Row-level Lock in DB: SELECT ... FOR UPDATE
      const lockedRowsRes = await client.query(
        'SELECT * FROM show_seats WHERE show_id = $1 AND seat_id = ANY($2) FOR UPDATE',
        [showId, seatIds]
      );

      const targetSeats = lockedRowsRes.rows.length > 0 
        ? lockedRowsRes.rows 
        : (await client.query('SELECT * FROM show_seats WHERE show_id = $1', [showId])).rows.filter(
            (ss: any) => seatIds.includes(ss.seat_id)
          );

      if (targetSeats.length !== seatIds.length) {
        throw { status: 400, message: 'Mismatch in seat records for this show.' };
      }

      // Check if any seat is already booked in database
      const bookedSeat = targetSeats.find((s: any) => s.status === 'BOOKED');
      if (bookedSeat) {
        throw { status: 409, message: `Seat ${bookedSeat.seat_id} is already confirmed booked by another customer.` };
      }

      // 5. Calculate Total Pricing
      const baseAmount = targetSeats.reduce((sum: number, s: any) => sum + Number(s.price), 0);
      const convenienceFee = Math.round(baseAmount * config.convenienceFeePercentage);
      const tax = Math.round(convenienceFee * config.gstPercentage);
      const finalAmount = baseAmount + convenienceFee + tax;

      // 6. Update show_seats status to BOOKED
      await client.query(
        'UPDATE show_seats SET status = $1, updated_at = $2 WHERE show_id = $3 AND seat_id = ANY($4)',
        ['BOOKED', new Date().toISOString(), showId, seatIds]
      );

      // 7. Create Booking Record
      const bookingId = uuidv4();
      const bookingRef = 'BMS-' + Math.floor(10000000 + Math.random() * 90000000);
      const paymentId = 'PAY-' + uuidv4().substring(0, 8).toUpperCase();
      const now = new Date().toISOString();

      const bookingRes = await client.query(
        `INSERT INTO bookings (id, booking_reference, user_id, show_id, total_amount, convenience_fee, tax, final_amount, status, payment_status, payment_id, idempotency_key, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) RETURNING *`,
        [
          bookingId,
          bookingRef,
          userId,
          showId,
          baseAmount,
          convenienceFee,
          tax,
          finalAmount,
          'CONFIRMED',
          'COMPLETED',
          paymentId,
          idempotencyKey || null,
          now
        ]
      );

      const booking = bookingRes.rows[0] || {
        id: bookingId,
        booking_reference: bookingRef,
        user_id: userId,
        show_id: showId,
        total_amount: baseAmount,
        convenience_fee: convenienceFee,
        tax,
        final_amount: finalAmount,
        status: 'CONFIRMED',
        payment_status: 'COMPLETED',
        payment_id: paymentId,
        idempotency_key: idempotencyKey,
        created_at: now
      };

      // 8. Create Booking Items
      const seatsRes = await client.query('SELECT * FROM seats');
      const seatsMap = new Map(seatsRes.rows.map((s: any) => [s.id, s]));

      const bookingItems = [];
      for (const ss of targetSeats) {
        const itemId = uuidv4();
        const seat = seatsMap.get(ss.seat_id);
        const seatLabel = seat ? `${seat.row_label}${seat.seat_number}` : ss.seat_id;

        await client.query(
          `INSERT INTO booking_items (id, booking_id, show_seat_id, seat_label, price, category)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [itemId, bookingId, ss.id || ss.seat_id, seatLabel, ss.price, ss.category]
        );

        bookingItems.push({
          id: itemId,
          booking_id: bookingId,
          seat_label: seatLabel,
          price: ss.price,
          category: ss.category
        });
      }

      // 9. Create Payment Record
      await client.query(
        `INSERT INTO payments (id, booking_id, user_id, amount, payment_method, status, transaction_ref, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [uuidv4(), bookingId, userId, finalAmount, paymentMethod || 'UPI', 'SUCCESS', paymentId, now]
      );

      // 10. Commit DB Transaction
      await client.commit();

      // 11. Release Redis locks
      for (const seatId of seatIds) {
        await redisLockService.forceReleaseSeatLock(showId, seatId);
      }

      // 12. Broadcast real-time booking update via WebSocket
      broadcastSeatBooked(showId, seatIds);

      return {
        ...booking,
        items: bookingItems
      };
    } catch (err: any) {
      await client.rollback();

      // If unique constraint on idempotency_key failed due to concurrent execution
      if (idempotencyKey && (err.message || '').includes('bookings.idempotency_key')) {
        const existingBookingRes = await db.query(
          'SELECT * FROM bookings WHERE idempotency_key = $1',
          [idempotencyKey]
        );
        if (existingBookingRes.rows.length > 0) {
          const existing = existingBookingRes.rows[0];
          const items = (await db.query('SELECT * FROM booking_items WHERE booking_id = $1', [existing.id])).rows;
          return {
            ...existing,
            items,
            isDuplicateRequest: true
          };
        }
      }

      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Cancel an existing booking and release seats back to AVAILABLE
   */
  async cancelBooking(bookingId: string, userId: string, isAdmin: boolean = false) {
    const bookingRes = await db.query('SELECT * FROM bookings WHERE id = $1', [bookingId]);
    if (bookingRes.rows.length === 0) {
      throw { status: 404, message: 'Booking not found.' };
    }

    const booking = bookingRes.rows[0];
    if (!isAdmin && booking.user_id !== userId) {
      throw { status: 403, message: 'You are not authorized to cancel this booking.' };
    }

    if (booking.status === 'CANCELLED') {
      throw { status: 400, message: 'This booking is already cancelled.' };
    }

    const items = (await db.query('SELECT * FROM booking_items WHERE booking_id = $1', [bookingId])).rows;
    const client = await (db as any).getClient();

    try {
      await client.beginTransaction();

      // 1. Update booking status
      await client.query('UPDATE bookings SET status = $1 WHERE id = $2', ['CANCELLED', bookingId]);

      // 2. Fetch seats and release them back to AVAILABLE
      const seatIds = items.map((i: any) => i.show_seat_id);
      await client.query(
        'UPDATE show_seats SET status = $1, updated_at = $2 WHERE show_id = $3 AND seat_id = ANY($4)',
        ['AVAILABLE', new Date().toISOString(), booking.show_id, seatIds]
      );

      // 3. Record refund payment
      await client.query(
        `INSERT INTO payments (id, booking_id, user_id, amount, payment_method, status, transaction_ref, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          uuidv4(),
          bookingId,
          booking.user_id,
          booking.final_amount,
          'REFUND',
          'REFUNDED',
          'REF-' + uuidv4().substring(0, 8).toUpperCase(),
          new Date().toISOString()
        ]
      );

      await client.commit();

      // 4. Broadcast unlocked seats via WebSocket
      broadcastSeatUnlocked(booking.show_id, seatIds);

      return {
        success: true,
        message: 'Booking cancelled successfully. Refund initiated.',
        bookingId
      };
    } catch (err) {
      await client.rollback();
      throw err;
    } finally {
      client.release();
    }
  }
}

export const bookingService = new BookingService();
