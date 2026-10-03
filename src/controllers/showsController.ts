import { Request, Response } from 'express';
import { db } from '../db/connection.js';
import { redisLockService } from '../services/redisLockService.js';

export async function getShowsForMovieAndDate(req: Request, res: Response) {
  try {
    const { movieId, date, city } = req.query;

    if (!movieId) {
      return res.status(400).json({ success: false, message: 'movieId query parameter is required.' });
    }

    const targetDate = (date as string) || new Date().toISOString().split('T')[0];

    // Fetch shows for this movie and date
    let showsRes = await db.query('SELECT * FROM shows WHERE movie_id = $1', [movieId]);
    let shows = showsRes.rows.filter((s: any) => s.date === targetDate);

    // Fetch theatres
    const theatresRes = await db.query('SELECT * FROM theatres');
    let theatres = theatresRes.rows;

    if (city) {
      theatres = theatres.filter((t: any) => t.city.toLowerCase() === (city as string).toLowerCase());
      const theatreIds = theatres.map((t: any) => t.id);
      shows = shows.filter((s: any) => theatreIds.includes(s.theatre_id));
    }

    // Fetch screens
    const screensRes = await db.query('SELECT * FROM screens');
    const screensMap = new Map(screensRes.rows.map((scr: any) => [scr.id, scr]));

    // Group shows by Theatre
    const theatreMap = new Map();
    for (const t of theatres) {
      theatreMap.set(t.id, {
        theatreId: t.id,
        name: t.name,
        city: t.city,
        address: t.address,
        rating: t.rating,
        facilities: t.facilities,
        shows: []
      });
    }

    for (const s of shows) {
      const parentTheatre = theatreMap.get(s.theatre_id);
      if (!parentTheatre) continue;

      const screen = screensMap.get(s.screen_id);

      // Fetch dynamic show_seats status to calculate real-time availability
      const showSeatsRes = await db.query('SELECT * FROM show_seats WHERE show_id = $1', [s.id]);
      const totalSeats = showSeatsRes.rows.length || 80;
      const bookedCount = showSeatsRes.rows.filter((ss: any) => ss.status === 'BOOKED').length;

      // Check Redis active locks count
      const activeLocks = await redisLockService.getAllActiveLocksForShow(s.id);
      const lockedCount = Object.keys(activeLocks).length;

      const availableCount = Math.max(0, totalSeats - bookedCount - lockedCount);

      let statusBadge = 'Available';
      if (availableCount === 0) {
        statusBadge = 'Sold Out';
      } else if (availableCount <= totalSeats * 0.15) {
        statusBadge = 'Almost Full';
      } else if (availableCount <= totalSeats * 0.50) {
        statusBadge = 'Filling Fast';
      }

      // Min base price
      const minPrice = showSeatsRes.rows.reduce(
        (min: number, ss: any) => Math.min(min, Number(ss.price)),
        showSeatsRes.rows[0]?.price ? Number(showSeatsRes.rows[0].price) : 180
      );

      parentTheatre.shows.push({
        id: s.id,
        screenId: s.screen_id,
        screenName: screen?.name || 'Main Screen',
        format: s.format,
        startTime: s.start_time,
        endTime: s.end_time,
        date: s.date,
        language: s.language,
        totalSeats,
        availableSeats: availableCount,
        statusBadge,
        minPrice
      });
    }

    const resultTheatres = Array.from(theatreMap.values()).filter((t: any) => t.shows.length > 0);

    return res.json({
      success: true,
      date: targetDate,
      theatres: resultTheatres
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
}
