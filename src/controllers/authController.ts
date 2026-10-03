import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../db/connection.js';
import { config } from '../config/env.js';
import { AuthRequest } from '../middleware/authMiddleware.js';

export async function register(req: Request, res: Response) {
  try {
    const { name, email, password, phone } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ success: false, message: 'Name, email, and password are required.' });
    }

    if (password.length < 6) {
      return res.status(400).json({ success: false, message: 'Password must be at least 6 characters long.' });
    }

    // Check existing email
    const existing = await db.query('SELECT id FROM users WHERE email = $1', [email]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ success: false, message: 'An account with this email already exists.' });
    }

    const userId = 'usr_' + uuidv4().substring(0, 8);
    const passwordHash = await bcrypt.hash(password, 10);
    const now = new Date().toISOString();

    await db.query(
      `INSERT INTO users (id, name, email, password_hash, role, phone, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [userId, name, email.toLowerCase(), passwordHash, 'user', phone || '', now]
    );

    const token = jwt.sign({ userId, email: email.toLowerCase(), role: 'user', name }, config.jwtSecret, {
      expiresIn: '7d'
    });

    return res.status(201).json({
      success: true,
      message: 'Account registered successfully.',
      token,
      user: {
        id: userId,
        name,
        email: email.toLowerCase(),
        role: 'user',
        phone: phone || ''
      }
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message || 'Internal server error during registration.' });
  }
}

export async function login(req: Request, res: Response) {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Email and password are required.' });
    }

    const userRes = await db.query('SELECT * FROM users WHERE email = $1', [email.toLowerCase()]);
    if (userRes.rows.length === 0) {
      return res.status(401).json({ success: false, message: 'Invalid email or password.' });
    }

    const user = userRes.rows[0];
    const isPasswordValid = await bcrypt.compare(password, user.password_hash);
    if (!isPasswordValid) {
      return res.status(401).json({ success: false, message: 'Invalid email or password.' });
    }

    const token = jwt.sign(
      { userId: user.id, email: user.email, role: user.role, name: user.name },
      config.jwtSecret,
      { expiresIn: '7d' }
    );

    return res.json({
      success: true,
      message: 'Logged in successfully.',
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        phone: user.phone || ''
      }
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message || 'Internal server error during login.' });
  }
}

export async function getProfile(req: AuthRequest, res: Response) {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    let userRes = await db.query('SELECT id, name, email, role, phone, created_at FROM users WHERE id = $1', [req.user.userId]);
    if (userRes.rows.length === 0 && req.user.email) {
      userRes = await db.query('SELECT id, name, email, role, phone, created_at FROM users WHERE email = $1', [req.user.email]);
    }

    if (userRes.rows.length === 0) {
      return res.status(401).json({ success: false, message: 'Session expired. Please log in again.' });
    }

    const user = userRes.rows[0];
    const bookingsRes = await db.query('SELECT COUNT(*) as count FROM bookings WHERE user_id = $1', [user.id]);
    const totalBookings = parseInt(bookingsRes.rows[0]?.count || '0', 10);

    return res.json({
      success: true,
      user: {
        ...user,
        totalBookings,
        membershipTier: totalBookings > 5 ? 'VIP Platinum' : totalBookings > 2 ? 'Gold Member' : 'Silver Member',
        loyaltyPoints: totalBookings * 120
      }
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
}
