import { OAuth2Client } from 'google-auth-library';
import crypto from 'crypto';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import UserModel from '../models/User.js';
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
