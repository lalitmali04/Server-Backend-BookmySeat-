import dotenv from 'dotenv';
dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || '5000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  jwtSecret: process.env.JWT_SECRET || '',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  databaseUrl: process.env.DATABASE_URL || '',
  redisUrl: process.env.REDIS_URL || '',
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  lockTtlSeconds: parseInt(process.env.SEAT_LOCK_TTL || '300', 10), // 5 minutes default
  convenienceFeePercentage: 0.10, // 10%
  gstPercentage: 0.18, // 18% GST on convenience fee
};
