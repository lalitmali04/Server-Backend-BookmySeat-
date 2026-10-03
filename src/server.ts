import express, { Request, Response, NextFunction } from 'express';
import http from 'http';
import cors from 'cors';
import { config } from './config/env.js';
import { initSocket } from './socket.js';
import { seedDatabase } from './db/seed.js';

import authRoutes from './routes/authRoutes.js';
import moviesRoutes from './routes/moviesRoutes.js';
import theatresRoutes from './routes/theatresRoutes.js';
import showsRoutes from './routes/showsRoutes.js';
import seatsRoutes from './routes/seatsRoutes.js';
import bookingsRoutes from './routes/bookingsRoutes.js';
import adminRoutes from './routes/adminRoutes.js';

const app = express();
const server = http.createServer(app);

// Initialize Socket.io
initSocket(server);

// Middleware
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-user-lock-token']
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logging in development
app.use((req: Request, res: Response, next: NextFunction) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    if (process.env.NODE_ENV !== 'test') {
      console.log(`${req.method} ${req.originalUrl} ${res.statusCode} - ${duration}ms`);
    }
  });
  next();
});

// Health check endpoint
app.get('/api/health', (req: Request, res: Response) => {
  res.json({
    status: 'UP',
    platform: 'BookMySeat Production Server',
    version: '1.0.0',
    timestamp: new Date().toISOString()
  });
});

// Mount Routes
app.use('/api/auth', authRoutes);
app.use('/api/movies', moviesRoutes);
app.use('/api/theatres', theatresRoutes);
app.use('/api/shows', showsRoutes);
app.use('/api/seats', seatsRoutes);
app.use('/api/bookings', bookingsRoutes);
app.use('/api/admin', adminRoutes);

// Global Error Handler
app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  console.error('Unhandled Error:', err);
  const status = err.status || 500;
  const message = err.message || 'Internal Server Error';
  res.status(status).json({ success: false, message });
});

// Auto-seed and start listening
async function startServer() {
  await seedDatabase();

  server.listen(config.port, () => {
    console.log(`🚀 BookMySeat Server running on http://localhost:${config.port}`);
    console.log(`🔌 WebSocket server live for real-time seat locks.`);
  });
}

// Start if not loaded in test mode
if (process.env.NODE_ENV !== 'test') {
  startServer();
}

export { app, server };
