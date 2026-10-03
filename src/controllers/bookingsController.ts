import { Request, Response } from 'express';
import { db } from '../db/connection.js';
import { bookingService } from '../services/bookingService.js';
import { AuthRequest } from '../middleware/authMiddleware.js';

export async function validateCheckout(req: AuthRequest, res: Response) {
  try {
    const { showId, seatIds, userLockToken } = req.body;
    const result = await bookingService.validateCheckout(showId, seatIds, userLockToken);
    return res.json({ success: true, checkout: result });
  } catch (err: any) {
    return res.status(err.status || 500).json({ success: false, message: err.message || 'Error validating checkout.' });
  }
}

export async function confirmBooking(req: AuthRequest, res: Response) {
  try {
    const { showId, seatIds, userLockToken, paymentMethod, idempotencyKey } = req.body;

    if (!req.user) {
      return res.status(401).json({ success: false, message: 'Authentication required to confirm booking.' });
    }

    if (!showId || !seatIds || !Array.isArray(seatIds) || seatIds.length === 0) {
      return res.status(400).json({ success: false, message: 'showId and seatIds are required.' });
    }

    if (!userLockToken) {
      return res.status(400).json({ success: false, message: 'userLockToken is required to verify seat hold.' });
    }

    const booking = await bookingService.confirmBooking({
      userId: req.user.userId,
      showId,
      seatIds,
      userLockToken,
      paymentMethod: paymentMethod || 'UPI',
      idempotencyKey
    });

    // Fetch related movie and theatre details for full ticket response
    const show = (await db.query('SELECT * FROM shows WHERE id = $1', [showId])).rows[0];
    const movie = show ? (await db.query('SELECT * FROM movies WHERE id = $1', [show.movie_id])).rows[0] : null;
    const theatre = show ? (await db.query('SELECT * FROM theatres WHERE id = $1', [show.theatre_id])).rows[0] : null;
    const screen = show ? (await db.query('SELECT * FROM screens WHERE id = $1', [show.screen_id])).rows[0] : null;

    return res.status(201).json({
      success: true,
      message: 'Booking confirmed successfully!',
      booking: {
        ...booking,
        show,
        movie,
        theatre,
        screen
      }
    });
  } catch (err: any) {
    return res.status(err.status || 500).json({
      success: false,
      message: err.message || 'Error confirming booking. Seats may have been released.'
    });
  }
}

export async function getUserBookings(req: AuthRequest, res: Response) {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    const bookingsRes = await db.query('SELECT * FROM bookings WHERE user_id = $1 ORDER BY created_at DESC', [req.user.userId]);
    const bookings = bookingsRes.rows;

    const enrichedBookings = [];
    for (const b of bookings) {
      const items = (await db.query('SELECT * FROM booking_items WHERE booking_id = $1', [b.id])).rows;
      const show = (await db.query('SELECT * FROM shows WHERE id = $1', [b.show_id])).rows[0];
      const movie = show ? (await db.query('SELECT * FROM movies WHERE id = $1', [show.movie_id])).rows[0] : null;
      const theatre = show ? (await db.query('SELECT * FROM theatres WHERE id = $1', [show.theatre_id])).rows[0] : null;
      const screen = show ? (await db.query('SELECT * FROM screens WHERE id = $1', [show.screen_id])).rows[0] : null;

      enrichedBookings.push({
        ...b,
        items,
        show,
        movie,
        theatre,
        screen
      });
    }

    return res.json({
      success: true,
      bookings: enrichedBookings
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
}

export async function getBookingById(req: AuthRequest, res: Response) {
  try {
    const { id } = req.params;
    const bookingRes = await db.query('SELECT * FROM bookings WHERE id = $1', [id]);
    if (bookingRes.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Booking not found.' });
    }

    const booking = bookingRes.rows[0];
    if (req.user?.role !== 'admin' && booking.user_id !== req.user?.userId) {
      return res.status(403).json({ success: false, message: 'Unauthorized access to this booking.' });
    }

    const items = (await db.query('SELECT * FROM booking_items WHERE booking_id = $1', [booking.id])).rows;
    const show = (await db.query('SELECT * FROM shows WHERE id = $1', [booking.show_id])).rows[0];
    const movie = show ? (await db.query('SELECT * FROM movies WHERE id = $1', [show.movie_id])).rows[0] : null;
    const theatre = show ? (await db.query('SELECT * FROM theatres WHERE id = $1', [show.theatre_id])).rows[0] : null;
    const screen = show ? (await db.query('SELECT * FROM screens WHERE id = $1', [show.screen_id])).rows[0] : null;

    return res.json({
      success: true,
      booking: {
        ...booking,
        items,
        show,
        movie,
        theatre,
        screen
      }
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
}

export async function cancelBooking(req: AuthRequest, res: Response) {
  try {
    const { id } = req.params;
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    const isAdmin = req.user.role === 'admin';
    const result = await bookingService.cancelBooking(id, req.user.userId, isAdmin);

    return res.json(result);
  } catch (err: any) {
    return res.status(err.status || 500).json({ success: false, message: err.message || 'Error cancelling booking.' });
  }
}
