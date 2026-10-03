import { Request, Response } from 'express';
import { db } from '../db/connection.js';

export async function getMovies(req: Request, res: Response) {
  try {
    const { category, genre, language, city, search, trending, status } = req.query;
    let moviesRes = await db.query('SELECT * FROM movies');
    let list = moviesRes.rows;

    if (category) {
      list = list.filter((m: any) => (m.category || 'movie').toLowerCase() === (category as string).toLowerCase());
    }

    if (trending === 'true') {
      list = list.filter((m: any) => m.is_trending);
    }

    if (status === 'now_showing') {
      list = list.filter((m: any) => m.is_now_showing);
    } else if (status === 'upcoming') {
      list = list.filter((m: any) => m.is_upcoming);
    }

    if (genre) {
      const g = (genre as string).toLowerCase();
      list = list.filter((m: any) =>
        Array.isArray(m.genres)
          ? m.genres.some((item: string) => item.toLowerCase().includes(g))
          : (m.genres || '').toLowerCase().includes(g)
      );
    }

    if (language) {
      const l = (language as string).toLowerCase();
      list = list.filter((m: any) => (m.language || '').toLowerCase() === l);
    }

    if (search) {
      const q = (search as string).toLowerCase();
      list = list.filter((m: any) =>
        m.title.toLowerCase().includes(q) ||
        m.director.toLowerCase().includes(q) ||
        (Array.isArray(m.genres) ? m.genres.join(' ') : m.genres || '').toLowerCase().includes(q)
      );
    }

    return res.json({
      success: true,
      count: list.length,
      movies: list
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
}

export async function getMovieById(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const movieRes = await db.query('SELECT * FROM movies WHERE id = $1', [id]);
    if (movieRes.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Movie not found.' });
    }

    const movie = movieRes.rows[0];

    // Fetch distinct available dates and theatres for this movie
    const showsRes = await db.query('SELECT * FROM shows WHERE movie_id = $1', [id]);
    const shows = showsRes.rows;

    const availableDates = Array.from(new Set(shows.map((s: any) => s.date))).sort();
    const theatreIds = Array.from(new Set(shows.map((s: any) => s.theatre_id)));

    const theatresRes = await db.query('SELECT * FROM theatres');
    const theatres = theatresRes.rows.filter((t: any) => theatreIds.includes(t.id));

    return res.json({
      success: true,
      movie: {
        ...movie,
        availableDates,
        theatresCount: theatres.length
      }
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
}
