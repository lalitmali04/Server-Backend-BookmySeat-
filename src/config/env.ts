import dotenv from 'dotenv';
dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || '5000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  jwtSecret: process.env.JWT_SECRET || 'bookmyseat-super-secret-jwt-key-2026',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  databaseUrl: process.env.DATABASE_URL || 'postgresql://neondb_owner:npg_Z9gaWS6tXbqD@ep-wispy-snow-b5zstkbo-pooler.c-7.us-east-2.aws.neon.tech/neondb?sslmode=require&channel_binding=require',
  redisUrl: process.env.REDIS_URL || 'rediss://default:gQAAAAAAAvLWAAIgcDExMzg3NDYyMmQxZTM0NThjYmU2NzhjNDk0ODU2ODQ5YQ@communal-seahorse-193238.upstash.io:6379',
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  lockTtlSeconds: parseInt(process.env.SEAT_LOCK_TTL || '300', 10), // 5 minutes default
  convenienceFeePercentage: 0.10, // 10%
  gstPercentage: 0.18, // 18% GST on convenience fee
};
