
import dotenv from 'dotenv';
dotenv.config();
import mongoose from 'mongoose';
import { info } from './logger.js';

const MONGODB_URI = process.env.MONGODB_URI || process.env.MONGO_URI || '';

export const connectMongo = async () => {
  // Debug: print MONGODB_URI value
  console.log('DEBUG: process.env.MONGODB_URI =', process.env.MONGODB_URI);
  if (!MONGODB_URI) {
    if (process.env.NODE_ENV === 'production') {
      console.error('FATAL: MONGODB_URI must be set in production');
      process.exit(1);
    }
    // In development, skip if missing
    console.warn('MONGODB_URI not set; skipping MongoDB connection (development)');
    return;
  }

  try {
    await mongoose.connect(MONGODB_URI, { dbName: process.env.MONGODB_DB || undefined });
    info('Connected to MongoDB', { uriSet: true });
  } catch (err) {
    console.error('Failed to connect to MongoDB:', err && err.message ? err.message : err);
    if (process.env.NODE_ENV === 'production') process.exit(1);
  }
};

export default connectMongo;
