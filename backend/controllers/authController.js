import { OAuth2Client } from 'google-auth-library';
import crypto from 'crypto';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import UserModel from '../models/User.js';
import PendingUser from '../models/PendingUser.js';
import { sendVerificationEmail } from './emailController.js';

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const oauthClient = new OAuth2Client(GOOGLE_CLIENT_ID);
const JWT_SECRET = process.env.JWT_SECRET || 'dev_jwt_secret_change_me';

export const handleGoogleAuth = async (req, res) => {
  try {
    const { idToken } = req.body || {};
    if (!idToken) return res.status(400).json({ message: 'Missing idToken in request body' });
    const ticket = await oauthClient.verifyIdToken({ idToken, audience: GOOGLE_CLIENT_ID });
    const payload = ticket.getPayload();
    if (!payload) return res.status(400).json({ message: 'Invalid Google ID token' });
    const email = payload.email;
    const name = payload.name || '';
    const googleId = payload.sub;
    const picture = payload.picture || '';

    if (!email) return res.status(400).json({ message: 'Google token did not include email' });

    let user = await UserModel.findOne({ email }).exec();
    if (!user) {
      // create user
      const username = email.split('@')[0];
      user = await UserModel.create({ username, email, name, googleId, emailVerified: true });
    } else {
      // update googleId/emailVerified if needed
      let changed = false;
      if (!user.googleId) { user.googleId = googleId; changed = true; }
      if (!user.emailVerified) { user.emailVerified = true; changed = true; }
      if (changed) await user.save();
    }

    const token = jwt.sign({ username: user.username, role: user.role }, JWT_SECRET, { expiresIn: '12h' });
    res.cookie('auth_token', token, { httpOnly: true });
    return res.json({ user: { username: user.username, email: user.email, name: user.name, role: user.role } });
  } catch (e) {
    console.error('handleGoogleAuth error', e && e.message ? e.message : e);
    return res.status(500).json({ message: 'Google auth failed' });
  }
};

export const handleVerifyEmail = async (req, res) => {
  try {
    const token = req.body && req.body.token ? req.body.token : (req.query && req.query.token ? req.query.token : null);
    if (!token) return res.status(400).json({ message: 'Missing token' });
    const user = await UserModel.findOne({ verificationToken: token }).exec();
    if (!user) return res.status(404).json({ message: 'Invalid token' });
    user.emailVerified = true;
    user.verificationToken = null;
    await user.save();
    return res.json({ message: 'Email verified successfully' });
  } catch (e) {
    console.error('handleVerifyEmail error', e && e.message ? e.message : e);
    return res.status(500).json({ message: 'Email verification failed' });
  }
};

export const startRegister = async (req, res) => {
  try {
    const { email, username, password } = req.body || {};
    if (!email) return res.status(400).json({ message: 'email required' });

    // Check existing users
    const existsQuery = username ? { $or: [{ email }, { username }] } : { email };
    const exists = await UserModel.findOne(existsQuery).lean().exec();
    if (exists) return res.status(409).json({ message: 'User with that email or username already exists' });

    // Check pending reservations
    const pendingExistsQuery = username ? { $or: [{ email }, { username }] } : { email };
    const pendingExists = await PendingUser.findOne(pendingExistsQuery).lean().exec();
    if (pendingExists) return res.status(409).json({ message: 'A registration is already pending for that email or username' });

    const verificationToken = crypto.randomBytes(24).toString('hex');
    const expiresAt = new Date(Date.now() + (15 * 60 * 1000)); // 15 minutes
    let passwordHash = null;
    if (password) {
      try { passwordHash = await bcrypt.hash(String(password), 10); } catch (e) { /* ignore */ }
    }

    const pending = await PendingUser.create({ email, username: username || null, passwordHash: passwordHash || null, verificationToken, expiresAt });

    let sendResult = null;
    try { sendResult = await sendVerificationEmail(pending, verificationToken); } catch (e) { console.warn('Failed to send verification email', e && e.message ? e.message : e); }

    if (sendResult && sendResult.fallback) {
      const frontend = (process.env.FRONTEND_URL && process.env.FRONTEND_URL.trim()) ? process.env.FRONTEND_URL.replace(/\/+$/, '') : (process.env.NODE_ENV === 'production' ? '' : 'http://localhost:5173');
      const link = `${frontend || ''}/verify-email?token=${encodeURIComponent(verificationToken)}`;
      return res.json({ message: 'Verification email logged (dev fallback)', fallback: true, link });
    }

    return res.json({ message: 'Verification email sent' });
  } catch (e) {
    console.error('startRegister error', e && e.message ? e.message : e);
    return res.status(500).json({ message: 'Failed to start registration' });
  }
};

export const completeRegister = async (req, res) => {
  try {
    const { token, username, password, phone, address } = req.body || {};
    if (!token) return res.status(400).json({ message: 'token required' });

    const pending = await PendingUser.findOne({ verificationToken: token }).exec();
    if (!pending) return res.status(404).json({ message: 'Invalid or expired token' });
    if (pending.expiresAt && pending.expiresAt < new Date()) return res.status(410).json({ message: 'Token expired' });
    // Determine username to use: prefer provided, then pending stored username
    const finalUsername = username || pending.username;
    if (!finalUsername) return res.status(400).json({ message: 'username required' });

    // Ensure username/email not taken by existing user
    const conflict = await UserModel.findOne({ $or: [{ username: finalUsername }, { email: pending.email }] }).lean().exec();
    if (conflict) return res.status(409).json({ message: 'Username or email already in use' });

    let passwordToUseHash = null;
    if (password) {
      passwordToUseHash = await bcrypt.hash(String(password), 10);
    } else if (pending.passwordHash) {
      passwordToUseHash = pending.passwordHash;
    } else {
      return res.status(400).json({ message: 'Password required' });
    }

    const userDoc = await UserModel.create({ username: finalUsername, email: pending.email, password: passwordToUseHash, phone: phone || '', address: address || '', role: 'customer', emailVerified: true });

    // Clean up pending reservation
    try { await PendingUser.deleteOne({ _id: pending._id }).exec(); } catch (e) { /* ignore cleanup errors */ }

    const jwtToken = jwt.sign({ username: userDoc.username, role: 'customer' }, JWT_SECRET, { expiresIn: '12h' });
    res.cookie('auth_token', jwtToken, { httpOnly: true });
    const userSafe = { username: userDoc.username, email: userDoc.email, role: 'customer' };
    return res.status(201).json({ user: userSafe });
  } catch (e) {
    console.error('completeRegister error', e && e.message ? e.message : e);
    return res.status(500).json({ message: 'Failed to complete registration' });
  }
};

export const registerWithVerification = async (req, res) => {
  try {
    const { username, password, email, phone, address } = req.body || {};
    if (!username || !password || !email) return res.status(400).json({ message: 'username, password and email required' });
    const exists = await UserModel.findOne({ $or: [{ username }, { email }] }).lean().exec();
    if (exists) return res.status(409).json({ message: 'User with that username or email already exists' });
    const hashed = await bcrypt.hash(String(password), 10);
    const verificationToken = crypto.randomBytes(24).toString('hex');
    const userDoc = await UserModel.create({ username, email, password: hashed, phone: phone || '', address: address || '', role: 'customer', emailVerified: false, verificationToken });
    // send verification email
    try { await sendVerificationEmail(userDoc, verificationToken); } catch (e) { console.warn('Failed to send verification email', e && e.message ? e.message : e); }
    const token = jwt.sign({ username: userDoc.username, role: 'customer' }, JWT_SECRET, { expiresIn: '12h' });
    res.cookie('auth_token', token, { httpOnly: true });
    const userSafe = { username: userDoc.username, email: userDoc.email, role: 'customer' };
    return res.status(201).json({ user: userSafe });
  } catch (e) {
    console.error('registerWithVerification error', e && e.message ? e.message : e);
    return res.status(500).json({ message: 'Register error' });
  }
};

export const resendVerification = async (req, res) => {
  try {
    const username = req.user && req.user.username ? req.user.username : null;
    if (!username) return res.status(401).json({ message: 'Not authenticated' });
    const user = await UserModel.findOne({ username }).exec();
    if (!user) return res.status(404).json({ message: 'User not found' });
    if (user.emailVerified) return res.status(400).json({ message: 'Email already verified' });
    const token = crypto.randomBytes(24).toString('hex');
    user.verificationToken = token;
    await user.save();
    let sendResult = null;
    try { sendResult = await sendVerificationEmail(user, token); } catch (e) { console.warn('Failed to resend verification email', e && e.message ? e.message : e); }
    // If email controller indicated a dev fallback (e.g., Resend domain not verified), surface that to the client
    if (sendResult && sendResult.fallback) {
      const frontend = (process.env.FRONTEND_URL && process.env.FRONTEND_URL.trim()) ? process.env.FRONTEND_URL.replace(/\/+$/, '') : (process.env.NODE_ENV === 'production' ? '' : 'http://localhost:5173');
      const link = `${frontend || ''}/verify-email?token=${encodeURIComponent(token)}`;
      return res.json({ message: 'Verification email logged (dev fallback)', fallback: true, link });
    }
    return res.json({ message: 'Verification email sent' });
  } catch (e) {
    console.error('resendVerification error', e && e.message ? e.message : e);
    return res.status(500).json({ message: 'Failed to resend verification' });
  }
};
