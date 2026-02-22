import axios from 'axios';
import mongoose from 'mongoose';

const BASE = process.env.BACKEND_URL || 'http://localhost:5000';
const MONGODB_URI = process.env.MONGODB_URI || process.env.MONGO_URI || '';

const wait = ms => new Promise(r => setTimeout(r, ms));

async function getTokenFromMongo(email) {
  if (!MONGODB_URI) return null;
  try {
    await mongoose.connect(MONGODB_URI, { dbName: process.env.MONGO_DBNAME || undefined });
    const User = mongoose.model('User', new mongoose.Schema({}, { strict: false }), 'users');
    const u = await User.findOne({ email }).lean().exec();
    await mongoose.disconnect();
    if (!u) return null;
    return u.verificationToken || null;
  } catch (e) {
    try { await mongoose.disconnect(); } catch (e2) {}
    return null;
  }
}

async function main() {
  const ts = Date.now();
  const email = `test+${ts}@example.com`;
  const username = `testuser${ts}`;
  const password = 'Password123!';

  console.log('STEP 1: Registering user', email);
  let regResp;
  try {
    regResp = await axios.post(`${BASE}/api/register`, { username, email, password }, { timeout: 10000 });
    console.log('REGISTER =>', regResp.status, regResp.data);
  } catch (err) {
    const status = err.response ? err.response.status : 'NO_RESPONSE';
    console.error('REGISTER ERROR =>', status, err.response ? err.response.data : err.message);
    process.exit(1);
  }

  // Try to read token from response (dev fallback may return link)
  let token = null;
  try {
    if (regResp.data && typeof regResp.data === 'object') {
      if (regResp.data.link && typeof regResp.data.link === 'string') {
        const m = regResp.data.link.match(/[?&]token=([^&]+)/);
        if (m) token = decodeURIComponent(m[1]);
      }
    }
  } catch (e) {}

  if (!token) {
    console.log('Token not found in response; attempting to read from MongoDB (set MONGODB_URI).');
    token = await getTokenFromMongo(email);
  }

  if (!token) {
    console.error('Could not obtain verification token automatically. Check server logs or set MONGODB_URI.');
    process.exit(1);
  }

  console.log('STEP 2: Verifying token');
  try {
    const v = await axios.get(`${BASE}/verify-email?token=${encodeURIComponent(token)}`, { timeout: 10000 });
    console.log('VERIFY =>', v.status, v.data);
  } catch (err) {
    const status = err.response ? err.response.status : 'NO_RESPONSE';
    console.error('VERIFY ERROR =>', status, err.response ? err.response.data : err.message);
    process.exit(1);
  }

  await wait(500);

  console.log('STEP 3: Logging in (email as username)');
  try {
    const login = await axios.post(`${BASE}/api/login`, { username: email, password }, { timeout: 10000 });
    console.log('LOGIN =>', login.status, login.data);
  } catch (err) {
    const status = err.response ? err.response.status : 'NO_RESPONSE';
    console.error('LOGIN ERROR =>', status, err.response ? err.response.data : err.message);
    process.exit(1);
  }

  console.log('Auth flow completed successfully');
  process.exit(0);
}

main().catch(err => { console.error('Test script error', err); process.exit(2); });
