import { Server as SocketIOServer, Socket } from 'socket.io';
import { Server as HTTPServer } from 'http';
import { config } from './config/env.js';

let io: SocketIOServer | null = null;

export function initSocket(httpServer: HTTPServer): SocketIOServer {
  io = new SocketIOServer(httpServer, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST']
    }
  });

  io.on('connection', (socket: Socket) => {
    // Join a specific show room for live seat updates
    socket.on('join_show', (showId: string) => {
      if (showId) {
        socket.join(`show:${showId}`);
      }
    });

    socket.on('leave_show', (showId: string) => {
      if (showId) {
        socket.leave(`show:${showId}`);
      }
    });

    socket.on('disconnect', () => {
      // client disconnected
    });
  });

  return io;
}

export function broadcastSeatLocked(showId: string, seatId: string, userToken: string, ttl: number) {
  if (io) {
    io.to(`show:${showId}`).emit('seat:locked', {
      showId,
      seatId,
      userToken,
      ttl
    });
  }
}

export function broadcastSeatUnlocked(showId: string, seatIds: string[]) {
  if (io) {
    io.to(`show:${showId}`).emit('seat:unlocked', {
      showId,
      seatIds
    });
  }
}

export function broadcastSeatBooked(showId: string, seatIds: string[]) {
  if (io) {
    io.to(`show:${showId}`).emit('seat:booked', {
      showId,
      seatIds
    });
  }
}
