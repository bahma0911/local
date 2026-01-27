#!/usr/bin/env node
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import mongoose from 'mongoose';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// Load backend/.env by default
dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

const uri = process.env.MONGODB_URI || '';
if (!uri) {
  console.error('MONGODB_URI not set in backend/.env — please add it before running this script');
  process.exit(1);
}

(async () => {
  try {
    console.log('Attempting to connect to MongoDB...');
    console.log('DEBUG uri preview:', uri.startsWith('mongodb+srv:') ? 'mongodb+srv://...' : uri);
    await mongoose.connect(uri, { dbName: process.env.MONGODB_DB || undefined });
    console.log('Connected to MongoDB (readyState=' + mongoose.connection.readyState + ')');

    try {
      const User = (await import('../models/User.js')).default;
      const sample = await User.find().limit(5).lean().exec();
      console.log('Sample users (up to 5):');
      console.log(JSON.stringify(sample, null, 2));
    } catch (e) {
      console.error('Could not read users collection:', e && e.message ? e.message : e);
    }

    await mongoose.disconnect();
    console.log('Disconnected.');
    process.exit(0);
  } catch (err) {
    console.error('Connection failed:', err && err.message ? err.message : err);
    process.exit(1);
  }
})();
