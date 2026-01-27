#!/usr/bin/env node
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import mongoose from 'mongoose';
import bcrypt from 'bcrypt';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

const MONGODB_URI = process.env.MONGODB_URI || '';
if (!MONGODB_URI) {
  console.error('MONGODB_URI not set in backend/.env');
  process.exit(1);
}

const SRC_DB = process.env.SOURCE_DB || process.env.SOURCE_MONGODB_DB || 'test';
const TGT_DB = process.env.TARGET_DB || process.env.MONGODB_DB || 'negadras';
const BCRYPT_ROUNDS = Number(process.env.MIGRATE_BCRYPT_ROUNDS || 10);

const userSchema = new mongoose.Schema({
  username: String,
  email: String,
  password: String,
  role: String,
}, { strict: false });

const run = async () => {
  console.log(`Connecting to MongoDB cluster: ${MONGODB_URI}`);
  const srcConn = await mongoose.createConnection(MONGODB_URI, { dbName: SRC_DB, connectTimeoutMS: 10000, serverSelectionTimeoutMS: 10000 });
  const tgtConn = await mongoose.createConnection(MONGODB_URI, { dbName: TGT_DB, connectTimeoutMS: 10000, serverSelectionTimeoutMS: 10000 });

  const SrcUser = srcConn.model('User', userSchema, 'users');
  const TgtUser = tgtConn.model('User', userSchema, 'users');

  try {
    const srcCount = await SrcUser.countDocuments().exec();
    console.log(`Source DB '${SRC_DB}' users: ${srcCount}`);
    if (srcCount === 0) {
      console.log('No users to migrate. Exiting.');
      await srcConn.close();
      await tgtConn.close();
      process.exit(0);
    }

    const cursor = SrcUser.find().cursor();
    let inserted = 0;
    let skipped = 0;
    for (let doc = await cursor.next(); doc != null; doc = await cursor.next()) {
      const username = doc.username;
      const email = doc.email;
      if (!username && !email) {
        skipped++;
        continue;
      }

      const exists = await TgtUser.findOne({ $or: [{ username }, { email }] }).lean().exec();
      if (exists) {
        skipped++;
        continue;
      }

      let password = doc.password || '';
      if (typeof password === 'string' && !password.startsWith('$2')) {
        try {
          password = await bcrypt.hash(String(password || ''), BCRYPT_ROUNDS);
        } catch (e) {
          console.warn('Password hashing failed for', username || email, e && e.message ? e.message : e);
          password = '';
        }
      }

      const toInsert = { ...doc.toObject ? doc.toObject() : doc, password };
      delete toInsert._id;

      try {
        await TgtUser.create(toInsert);
        inserted++;
      } catch (e) {
        console.error('Failed to insert user', username || email, e && e.message ? e.message : e);
      }
    }

    console.log(`Migration complete. Inserted: ${inserted}, Skipped: ${skipped}`);
    await srcConn.close();
    await tgtConn.close();
    process.exit(0);
  } catch (err) {
    console.error('Migration failed', err && err.message ? err.message : err);
    try { await srcConn.close(); } catch (_) {}
    try { await tgtConn.close(); } catch (_) {}
    process.exit(1);
  }
};

run();
