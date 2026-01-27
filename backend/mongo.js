
import dotenv from 'dotenv';
dotenv.config();
import mongoose from 'mongoose';
import { info } from './logger.js';

const MONGODB_URI = process.env.MONGODB_URI || process.env.MONGO_URI || '';

export const connectMongo = async () => {
  // Debug: MONGODB_URI value is read from environment
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
    // Default to the 'negadras' database when no explicit DB is configured.
    // This prevents accidental connections to the 'test' DB when the URI
    // does not include a database or when MONGODB_DB is not set.
    const dbName = process.env.MONGODB_DB || 'negadras';
    await mongoose.connect(MONGODB_URI, { dbName });
    info('Connected to MongoDB', { uriSet: true, dbName });
  } catch (err) {
    console.error('Failed to connect to MongoDB:', err && err.message ? err.message : err);
    if (process.env.NODE_ENV === 'production') process.exit(1);
  }
};

export default connectMongo;
