import { Request, Response } from 'express';
import { db } from '../db/connection.js';

export async function getTheatres(req: Request, res: Response) {
  try {
    const { city } = req.query;
    let theatresRes = await db.query('SELECT * FROM theatres');
    let list = theatresRes.rows;

    if (city) {
      list = list.filter((t: any) => t.city.toLowerCase() === (city as string).toLowerCase());
    }

    return res.json({
      success: true,
      theatres: list
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
}

export async function getTheatreById(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const theatreRes = await db.query('SELECT * FROM theatres WHERE id = $1', [id]);
    if (theatreRes.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Theatre not found.' });
    }

    const screensRes = await db.query('SELECT * FROM screens WHERE theatre_id = $1', [id]);
    return res.json({
      success: true,
      theatre: {
        ...theatreRes.rows[0],
        screens: screensRes.rows
      }
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
}
