import dotenv from 'dotenv';
import express from 'express';
import cors from 'cors';
import fs from 'fs';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import path from 'path';
import multer from 'multer';
import createCloudinaryStorage from 'multer-storage-cloudinary'; // CommonJS factory: returns a storage instance when called with opts
import cloudinary from './config/cloudinary.js';
import bcrypt from 'bcrypt';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import jwt from 'jsonwebtoken';
import { validate, schemas } from './validators.js';
import { info, warn, error as logError } from './logger.js';
import connectMongo from './mongo.js';
import User from './models/User.js';
import * as authController from './controllers/authController.js';
import * as emailController from './controllers/emailController.js';
import requireVerifiedEmail from './middleware/requireVerifiedEmail.js';
import ShopModel from './models/Shop.js';
import OrderModel from './models/Order.js';
import CartModel from './models/Cart.js';
import NotificationModel from './models/Notification.js';
import ProductModel from './models/Product.js';
import mongoose from 'mongoose';

dotenv.config();

// Authentication removed: running as public-only server (no JWT required)

// In production require FRONTEND_ORIGIN to be set so CORS and cookies are configured safely
const IS_PRODUCTION = (process.env.NODE_ENV === 'production' || process.env.NODE_ENV === 'prod');
if (IS_PRODUCTION && (!process.env.FRONTEND_ORIGIN || process.env.FRONTEND_ORIGIN.trim().length === 0)) {
  console.error('\nFATAL: FRONTEND_ORIGIN must be set in production to enable CORS and secure cookies.\n'
    + 'Set FRONTEND_ORIGIN to the frontend URL (e.g. https://app.example.com) in your environment.\n');
  process.exit(1);
}

const app = express();
// trust proxy so secure cookies work behind proxies (Heroku, nginx, dev proxies)
app.set('trust proxy', 1);
// Support multiple allowed origins via environment variable.
// The environment may provide a single origin in `FRONTEND_ORIGIN` or a
// comma-separated list in `FRONTEND_ORIGINS`. Values are normalized (trim,
// strip trailing slashes) and used to dynamically validate request origins.
const rawOrigins = (process.env.FRONTEND_ORIGINS && process.env.FRONTEND_ORIGINS.trim()) || (process.env.FRONTEND_ORIGIN && process.env.FRONTEND_ORIGIN.trim()) || '';
const allowedOrigins = rawOrigins.split(',').map(s => String(s || '').trim().replace(/\/+$/, '')).filter(Boolean);

const corsOptions = {
  origin: (origin, callback) => {
    // When no allowed origins configured, allow all (convenient for local dev).
    if (!allowedOrigins.length) return callback(null, true);
    // Allow non-browser requests (curl, server-to-server) where origin is not present.
    if (!origin) return callback(null, true);
    // Normalize incoming origin by stripping trailing slashes before comparison.
    const normalized = String(origin).replace(/\/+$/, '');
    if (allowedOrigins.includes(normalized)) return callback(null, true);
    return callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  // Include PATCH and commonly used custom headers to satisfy preflight checks
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-CSRF-Token", "X-Requested-With", "X-Captcha-Token", "x-captcha-token"],
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions));
app.use(helmet());
app.use(express.json({ limit: '1mb' }));

// simple request logger to help debug upload 404s
app.use((req, res, next) => {
  console.log(new Date().toISOString(), req.method, req.url);
  next();
});

// Disable caching for API responses in development and production to avoid stale data
app.use((req, res, next) => {
  try {
    if (req.path && req.path.startsWith('/api')) {
      // Strong no-cache headers to force clients and proxies to revalidate
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      res.setHeader('Surrogate-Control', 'no-store');
    }
  } catch (e) {
    // ignore header-setting errors
  }
  next();
});

// Request ID middleware: attach req.id and send X-Request-Id header
app.use((req, res, next) => {
  try {
    const rid = (typeof crypto.randomUUID === 'function') ? crypto.randomUUID() : `${Date.now()}-${Math.floor(Math.random()*100000)}`;
    req.id = rid;
    res.setHeader('X-Request-Id', rid);
  } catch (e) {
    // ignore
  }
  next();
});

// In-memory rate limiter factory (MVP). Uses Map to track timestamps per key.
const createRateLimiter = ({ windowMs = 60000, max = 60, keyFunc = (req) => req.ip, name = 'rate_limit' } = {}) => {
  const store = new Map();
  return (req, res, next) => {
    try {
      const key = keyFunc(req) || req.ip || 'unknown';
      const now = Date.now();
      const cutoff = now - windowMs;
      let arr = store.get(key) || [];
      // remove old timestamps
      while (arr.length && arr[0] <= cutoff) arr.shift();
      arr.push(now);
      store.set(key, arr);
      if (arr.length > max) {
        warn('Rate limit exceeded', { requestId: req.id, ip: req.ip, route: req.originalUrl, limit: name, key });
        return res.status(429).json({ success: false, message: 'Too many requests. Please try again later.' });
      }
    } catch (e) {
      // On error, allow request rather than fail closed
    }
    return next();
  };
};

// Specific limiters per requirements
const authWindowMs = 10 * 60 * 1000; // 10 minutes
const authMax = 5;
const loginRegisterLimiter = createRateLimiter({ windowMs: authWindowMs, max: authMax, keyFunc: (req) => req.ip, name: 'auth_10min' });

const ordersWindowMs = 60 * 60 * 1000; // 1 hour
const ordersMax = 20;
const ordersLimiter = createRateLimiter({ windowMs: ordersWindowMs, max: ordersMax, keyFunc: (req) => (req.user && req.user.username) ? `user:${req.user.username}` : `ip:${req.ip}`, name: 'orders_1h' });

// Minimal cookie parser (no external dependency). Populates req.cookies = { name: value }
app.use((req, _res, next) => {
  const header = req.headers?.cookie;
  req.cookies = {};
  if (header) {
    header.split(';').forEach(pair => {
      const idx = pair.indexOf('=');
      if (idx === -1) return;
      const name = pair.slice(0, idx).trim();
      const val = pair.slice(idx + 1).trim();
      try {
        req.cookies[name] = decodeURIComponent(val);
      } catch (e) {
        req.cookies[name] = val;
      }
    });
  }
  next();
});

// Passport/third-party auth removed for public-only mode

// Connect to MongoDB (if configured)
connectMongo().catch((err) => {
  console.warn('Mongo connection warning:', err && err.message ? err.message : err);
});

// Google auth routes removed

const PORT = process.env.PORT || 5000;

// Resolve backend `data` directory relative to this file so behavior is consistent
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.join(__dirname, 'data');
const SHOPS_FILE = path.join(DATA_DIR, 'shops.json');
const PUBLIC_DIR = path.join(process.cwd(), 'public');
const UPLOADS_DIR = path.join(PUBLIC_DIR, 'uploads');

// ensure uploads dir exists
if (!fs.existsSync(PUBLIC_DIR)) fs.mkdirSync(PUBLIC_DIR);
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

// serve uploaded files with cache disabled to ensure freshly uploaded assets are served
app.use('/uploads', express.static(UPLOADS_DIR, {
  setHeaders: (res, _path, _stat) => {
    try {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
    } catch (e) { /* ignore */ }
  },
  // explicit zero maxAge to prevent express from setting an Age header
  maxAge: 0
}));

// multer setup with Cloudinary-backed storage when Cloudinary client is fully configured,
// otherwise fall back to disk storage in `public/uploads` to preserve existing behavior.
// Prefer runtime check against the imported `cloudinary` client (exported from ./config/cloudinary.js)
const hasCloudinary = !!(
  cloudinary &&
  cloudinary.v2 &&
  cloudinary.v2.uploader &&
  typeof cloudinary.v2.uploader.upload === 'function' &&
  process.env.CLOUDINARY_CLOUD_NAME &&
  process.env.CLOUDINARY_API_KEY &&
  process.env.CLOUDINARY_API_SECRET
);
let upload; // WHY: will be assigned to a multer instance that either uses Cloudinary or disk storage

// only allow common image types by default
const allowedMime = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/jpg']; // WHY: restrict uploads to image MIME types

if (hasCloudinary) {
  // WHY: configure multer to stream uploads directly to Cloudinary (no local disk write)
  const clStorage = createCloudinaryStorage({
    cloudinary, // WHY: use configured cloudinary client above
    folder: 'negadras', // WHY: keep uploads organized under a single folder in Cloudinary
    allowed_formats: ['jpg', 'png', 'jpeg', 'webp'], // WHY: further validate allowed file formats server-side
    resource_type: 'auto', // WHY: let Cloudinary detect type (helps avoid "empty file" or resource-type mismatches)
  });
  upload = multer({
    storage: clStorage,
    limits: { fileSize: Number(process.env.UPLOAD_MAX_BYTES || 5 * 1024 * 1024) }, // WHY: protect server by capping upload size
    fileFilter: (req, file, cb) => { if (allowedMime.includes(file.mimetype)) return cb(null, true); cb(new Error('Unsupported file type')); } // WHY: ensure only expected image types accepted
  });
} else {
  // WHY: fallback to previous disk storage behavior when Cloudinary not configured
  const storage = multer.diskStorage({
    destination: function (req, file, cb) { cb(null, UPLOADS_DIR); }, // WHY: save uploads under public/uploads so they can be served
    filename: function (req, file, cb) { const safe = Date.now() + '-' + file.originalname.replace(/[^a-z0-9.\-\_]/gi, '_'); cb(null, safe); } // WHY: sanitize filename to avoid unsafe characters
  });
  upload = multer({
    storage,
    limits: { fileSize: Number(process.env.UPLOAD_MAX_BYTES || 5 * 1024 * 1024) }, // WHY: same size cap as above
    fileFilter: (req, file, cb) => { if (allowedMime.includes(file.mimetype)) return cb(null, true); cb(new Error('Unsupported file type')); } // WHY: same mime check
  });
}

// upload endpoint: receives multipart/form-data with field `file` and returns a JSON with `url` pointing to the image
app.post('/api/upload', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ message: 'No file uploaded' }); // WHY: validate presence of file early

  try {
    // Try multiple known fields that storage adapters may populate.
    // multer-storage-cloudinary commonly sets `req.file.path` (string URL) or `req.file.secure_url`/`req.file.url`.
    if (req.file) {
      // If storage provided a full URL, return it directly
      const possibleUrl = req.file.path || req.file.secure_url || req.file.url || req.file.location || null;
      if (possibleUrl && typeof possibleUrl === 'string' && possibleUrl.startsWith('http')) {
        return res.json({ url: possibleUrl });
      }

      // If the adapter wrote a local file path (disk storage), derive the public URL using the filename
      if (req.file.filename) {
        return res.json({ url: `/uploads/${req.file.filename}` });
      }

      if (req.file.path && typeof req.file.path === 'string') {
        // `req.file.path` may be an absolute filesystem path; convert to basename
        const fname = path.basename(req.file.path);
        if (fname) return res.json({ url: `/uploads/${fname}` });
      }
    }

    // If we reach here, multer reported a file but we couldn't determine a consumable URL.
    // Dump `req.file` to server logs for debugging and return a clearer message to client.
    console.error('Upload handler: no usable URL found; req.file =', req.file);
    const safeFile = req.file ? {
      originalname: req.file.originalname,
      mimetype: req.file.mimetype,
      size: req.file.size,
      filename: req.file.filename,
      path: req.file.path
    } : null;
    return res.status(500).json({ message: 'Upload succeeded but no usable URL found on server', file: safeFile });
  } catch (err) {
    console.error('Upload handler error:', err && err.message ? err.message : err); // WHY: log full error server-side for diagnostics
    return res.status(500).json({ message: 'Server error during upload', error: String(err) }); // WHY: return safe error message to client
  }
});

// --- Customers storage (moved server-side) ---
const CUSTOMERS_FILE = path.join(DATA_DIR, 'customers.json');
const ORDERS_FILE = path.join(DATA_DIR, 'orders.json');
const readCustomers = () => {
  try {
    const raw = fs.readFileSync(CUSTOMERS_FILE, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    return [];
  }
};
const writeCustomers = (c) => {
  try {
    fs.writeFileSync(CUSTOMERS_FILE, JSON.stringify(c, null, 2), 'utf8');
    return true;
  } catch (err) {
    console.error('Failed to write customers file', err.message);
    return false;
  }
};

const readOrders = () => {
  try {
    const raw = fs.readFileSync(ORDERS_FILE, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    return [];
  }
};

const writeOrders = (orders) => {
  try {
    fs.writeFileSync(ORDERS_FILE, JSON.stringify(orders, null, 2), 'utf8');
    return true;
  } catch (err) {
    console.error('Failed to write orders file', err.message);
    return false;
  }
};

// Authentication and CSRF removed for public-only mode
const getCookie = (req, name) => {
  const header = req.headers?.cookie;
  if (!header) return null;
  const match = header.split(';').map(s => s.trim()).find(s => s.startsWith(name + '='));
  if (!match) return null;
  return decodeURIComponent(match.split('=').slice(1).join('='));
};
// No-op authenticate middleware to keep route signatures stable in public-only mode
const authenticate = (req, _res, next) => { req.user = null; next(); };

// Require authentication middleware (reads auth cookie and verifies token)
const requireAuth = async (req, res, next) => {
  try {
    const payload = await getUserFromRequest(req);
    if (!payload) return res.status(401).json({ message: 'Not authenticated' });
    req.user = payload;
    return next();
  } catch (e) {
    return res.status(500).json({ message: 'Auth error' });
  }
};

const requireShopOwner = (req, res, next) => {
  if (!req.user || req.user.role !== 'shop_owner') return res.status(403).json({ message: 'Forbidden: shop owner only' });
  return next();
};

// Rate limiting - quick protection for auth & upload endpoints
const authLimiter = rateLimit({ windowMs: 60 * 1000, max: 20 });

// Cookie options for auth cookie
const AUTH_COOKIE_NAME = 'auth_token';
const AUTH_COOKIE_MAX_AGE = 12 * 60 * 60 * 1000; // 12 hours
// Determine SameSite cookie policy.
// - In production with a configured FRONTEND_ORIGIN we use 'none' so cross-site cookies work.
// - For local development you can opt-in to `SameSite=None` by setting `DEV_SAMESITE_NONE=1`.
//   Warning: many browsers require cookies with `SameSite=None` to be `Secure`. If you need
//   that behavior for local HTTPS testing, set `DEV_SAMESITE_SECURE=1` as well (this will
//   set the `secure` flag when not in production). Use these only for local/dev testing.
const determineSameSite = () => {
  if (app.get('env') === 'production' && process.env.FRONTEND_ORIGIN) return 'none';
  if (app.get('env') !== 'production' && process.env.DEV_SAMESITE_NONE === '1') return 'none';
  return 'lax';
};

const getAuthCookieOptions = () => ({
  httpOnly: true,
  // Secure in production; for dev you may enable secure via DEV_SAMESITE_SECURE=1 when using HTTPS locally
  secure: app.get('env') === 'production' || (process.env.DEV_SAMESITE_SECURE === '1'),
  sameSite: determineSameSite(),
  maxAge: AUTH_COOKIE_MAX_AGE,
});

// JWT helpers: sign and verify tokens stored in httpOnly cookie
const JWT_SECRET = process.env.JWT_SECRET || 'dev_jwt_secret_change_me';
const signToken = (payload, opts = {}) => {
  try {
    return jwt.sign(payload, JWT_SECRET, { expiresIn: '12h', ...(opts || {}) });
  } catch (e) {
    console.error('Failed to sign token', e && e.message ? e.message : e);
    return null;
  }
};

const verifyToken = (token) => {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (e) {
    return null;
  }
};

// Helper to read authenticated user payload from cookie (returns payload or null)
const getUserFromRequest = async (req) => {
  try {
    const cookie = getCookie(req, AUTH_COOKIE_NAME);
    if (!cookie) return null;
    const payload = verifyToken(cookie);
    if (!payload) return null;
    // For customers, attempt to fetch fresh data from Mongo if available
    if (payload.role === 'customer') {
      try {
        const UserModel = (await import('./models/User.js')).default;
        const user = await UserModel.findOne({ username: payload.username }).lean().exec();
        if (user) return { username: user.username, email: user.email, phone: user.phone, address: user.address, city: user.city, name: user.name, role: 'customer', emailVerified: !!user.emailVerified };
      } catch (e) {
        // ignore DB errors, fall back to token payload
      }
    }
    return payload;
  } catch (e) {
    return null;
  }
};

// On startup: migrate shop owner plaintext passwords to bcrypt hashes if needed
const migrateShopOwnerPasswords = async () => {
  try {
    const shops = readShops();
    let changed = false;
    for (const s of shops) {
      if (s.owner && s.owner.password && !s.owner.password.startsWith('$2')) {
        const hashed = await bcrypt.hash(String(s.owner.password), 10);
        s.owner.password = hashed;
        changed = true;
      }
    }
    if (changed) writeShops(shops);
  } catch (err) {
    console.warn('Password migration failed', err.message);
  }
};

// Auth endpoints: login/register/reset-password
app.post('/api/login', loginRegisterLimiter, validate(schemas.authLogin), async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ message: 'username and password required' });

  // 1) Admin via env
  if (process.env.ADMIN_USER && process.env.ADMIN_PASS && username === process.env.ADMIN_USER) {
    const match = username === process.env.ADMIN_USER && password === process.env.ADMIN_PASS;
    if (match) {
      const token = signToken({ username, role: 'admin' });
      res.cookie(AUTH_COOKIE_NAME, token, getAuthCookieOptions());
      info('Login success', { requestId: req.id, username, role: 'admin' });
      return res.json({ user: { username, role: 'admin' } });
    }
    warn('Login failed: admin credential mismatch', { requestId: req.id, username });
  }

  // 2) Shop owners (match against shops data)
  const shops = readShops();
  const shop = shops.find(s => s.owner?.username === username);
  if (shop && shop.owner && shop.owner.password) {
    const ok = await bcrypt.compare(String(password), String(shop.owner.password));
    if (ok) {
      const token = signToken({ username, role: 'shop_owner', shopId: shop.id });
      res.cookie(AUTH_COOKIE_NAME, token, getAuthCookieOptions());
      info('Login success', { requestId: req.id, username, role: 'shop_owner', shopId: shop.id });
      return res.json({ user: { username, role: 'shop_owner', shopId: shop.id, shopName: shop.name } });
    }
    warn('Login failed: shop owner credential mismatch', { requestId: req.id, username });
  }


  // 3) Customers (MongoDB)
  try {
    let customer = null;
    // Attempt MongoDB login when available
    if (mongoose.connection && mongoose.connection.readyState === 1) {
      try {
        const User = (await import('./models/User.js')).default;
        customer = await User.findOne({
          $or: [
            { username: username },
            { email: username }
          ],
          role: 'customer',
          password: { $exists: true, $ne: null }
        });
      } catch (e) {
        // continue to local fallback
        console.warn('Mongo lookup failed, falling back to local customers:', e && e.message ? e.message : e);
      }
    }

    // Local customers.json fallback
    if (!customer) {
      const locals = readCustomers();
      const lc = locals.find(c => (c.username === username) || (c.email === username));
      if (lc) customer = lc; // note: schema slightly different but has password
    }

    if (!customer) {
      warn('Login failed: customer not found', { requestId: req.id, username });
    }

    if (customer && customer.password) {
      const ok = await bcrypt.compare(String(password), String(customer.password));
      if (ok) {
        const token = signToken({ username: customer.username, role: 'customer' });
        const userSafe = { username: customer.username, email: customer.email, role: 'customer' };
        res.cookie(AUTH_COOKIE_NAME, token, getAuthCookieOptions());
        info('Login success', { requestId: req.id, username: customer.username, role: 'customer' });
        return res.json({ user: userSafe });
      }
      warn('Login failed: customer credential mismatch', { requestId: req.id, username });
    }
  } catch (err) {
    logError('Customer login error', err);
    return res.status(500).json({ message: 'Database error' });
  }

  return res.status(401).json({ message: 'Invalid credentials' });
});

// Register a new customer
app.post('/api/register', loginRegisterLimiter, validate(schemas.authRegister), authController.registerWithVerification);

// Two-step registration: reserve email/username and send verification
app.post('/api/auth/start-register', loginRegisterLimiter, authController.startRegister);
// Complete registration after email verification: provide token + username + password
app.post('/api/auth/complete-register', loginRegisterLimiter, authController.completeRegister);

// Google OAuth verification endpoint
app.post('/api/auth/google', validate(schemas.authGoogle), authController.handleGoogleAuth);

// Email verification endpoint
app.post('/api/auth/verify-email', authController.handleVerifyEmail);

// Resend verification token (authenticated)
app.post('/api/auth/resend-verification', requireAuth, authController.resendVerification);

// continue existing register error handling fallback (if any)
// (register handled above by authController.registerWithVerification)

// Temporary test route (no CSRF needed)
app.post("/api/test-login", async (req, res) => {
  try {
    const user = await User.findOne({});
    const result = await bcrypt.compare("admin123", user.password);

    res.json({
      emailInDb: user.email,
      bcryptResult: result,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

  app.post('/api/logout', (req, res) => {
    try {
      res.clearCookie(AUTH_COOKIE_NAME, getAuthCookieOptions());
      return res.json({ message: 'Logged out' });
    } catch (e) {
      return res.status(500).json({ message: 'Failed to logout' });
    }
  });

  // Return current authenticated user (if any) based on auth cookie
  app.get('/api/me', async (req, res) => {
    try {
      const payload = await getUserFromRequest(req);
      if (!payload) return res.status(401).json({ message: 'Not authenticated' });

      // Enrich shop owner payload with shop name when possible
      if (payload.role === 'shop_owner' && payload.shopId) {
        try {
          const shops = readShops();
          const shop = shops.find(s => Number(s.id) === Number(payload.shopId));
          if (shop) payload.shopName = shop.name;
        } catch (e) { /** ignore */ }
      }

      return res.json({ user: payload });
    } catch (e) {
      return res.status(500).json({ message: 'Server error' });
    }
  });

  // PUT /api/me - update current authenticated customer's profile
  app.put('/api/me', authenticate, validate(schemas.profileUpdate), async (req, res) => {
    try {
      const authUser = await getUserFromRequest(req);
      if (!authUser) return res.status(401).json({ message: 'Not authenticated' });

      // Only customers stored in Mongo can update their persisted profile here
      if (authUser.role !== 'customer') {
        return res.status(403).json({ message: 'Only customers can update profile' });
      }

      const payload = req.body || {};

      // Persist to MongoDB if available
      if (mongoose.connection && mongoose.connection.readyState === 1) {
        try {
          const UserModel = (await import('./models/User.js')).default;
          const update = {
            ...(payload.name ? { name: payload.name } : {}),
            ...(payload.email ? { email: payload.email } : {}),
            ...(payload.phone ? { phone: payload.phone } : {}),
            ...(payload.address ? { address: payload.address } : {}),
            ...(payload.city ? { city: payload.city } : {}),
          };

          if (payload.password) {
            update.password = await bcrypt.hash(String(payload.password), 10);
          }

          const updated = await UserModel.findOneAndUpdate({ username: authUser.username }, { $set: update }, { new: true }).lean().exec();
          if (!updated) return res.status(500).json({ message: 'Failed to update profile' });

          // Return sanitized user info
          const safe = { username: updated.username, email: updated.email, phone: updated.phone, address: updated.address, city: updated.city, name: updated.name, role: 'customer' };
          return res.json({ user: safe });
        } catch (err) {
          console.error('PUT /api/me - update error', err && err.message ? err.message : err);
          return res.status(500).json({ message: 'Failed to update profile' });
        }
      }

      // If Mongo isn't available, return 503
      return res.status(503).json({ message: 'Profile updates are not available' });
    } catch (e) {
      console.error('PUT /api/me unexpected error', e && e.message ? e.message : e);
      return res.status(500).json({ message: 'Server error' });
    }
  });

// Temporary debug route: allows GET/POST to check bcrypt against first Mongo user.
// IMPORTANT: paste this route BEFORE any global CSRF middleware in server.js so it is not blocked.
app.all('/api/test-login', (req, res, next) => {
  // log incoming request for debugging
  console.log(new Date().toISOString(), req.method, req.originalUrl);
  next();
}, async (req, res) => {
  try {
    const User = (await import('./models/User.js')).default;
    const user = await User.findOne().lean().exec();
    if (!user) {
      return res.status(404).json({ message: 'No user found' });
    }

    // compare hard-coded plaintext "123456" with stored hash
    const bcryptResult = await bcrypt.compare('123456', String(user.password || ''));
    return res.json({ emailInDb: user.email, bcryptResult: !!bcryptResult });
  } catch (err) {
    console.error('Test-login route error:', err && (err.stack || err));
    return res.status(500).json({ message: 'Server error' });
  }
});

// Authentication endpoints removed for public-only deployment

// protect modifying shop/product/order endpoints below

const readShops = () => {
  try {
    const raw = fs.readFileSync(SHOPS_FILE, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    console.warn('Could not read shops file, returning empty list', err.message);
    return [];
  }
};

const writeShops = (shops) => {
  try {
    fs.writeFileSync(SHOPS_FILE, JSON.stringify(shops, null, 2), 'utf8');
    return true;
  } catch (err) {
    console.error('Failed to write shops file', err.message);
    return false;
  }
};

// scheduled deletion timers for cancelled orders (key = `${shopId}:${orderId}`)
const scheduledDeletionTimers = new Map();
const CANCEL_DELETE_GRACE_SECONDS = Number(process.env.CANCEL_DELETE_GRACE_SECONDS || '0');

const scheduleOrderDeletion = (shopId, orderId, delayMs) => {
  const key = `${shopId}:${orderId}`;
  // clear any existing timer
  if (scheduledDeletionTimers.has(key)) {
    clearTimeout(scheduledDeletionTimers.get(key));
    scheduledDeletionTimers.delete(key);
  }
  if (delayMs <= 0) return null;
  const t = setTimeout(() => {
    try {
      const shops = readShops();
      const sIdx = shops.findIndex(s => s.id === shopId);
      if (sIdx === -1) return;
      shops[sIdx].orders = (shops[sIdx].orders || []).filter(o => String(o.orderId) !== String(orderId));
      writeShops(shops);
      scheduledDeletionTimers.delete(key);
      console.log(`Auto-deleted cancelled order ${orderId} for shop ${shopId}`);
    } catch (err) {
      console.error('Error in scheduled order deletion', err && err.message ? err.message : err);
    }
  }, delayMs);
  scheduledDeletionTimers.set(key, t);
  return t;
};

// Health endpoint
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', service: 'Negadras backend (chapa disabled)' });
});

// Simple non-API health endpoint for uptime checks (some platforms expect '/health')
app.get('/health', (_req, res) => {
  res.status(200).send('OK');
});

// GET /api/shops - list shops
app.get('/api/shops', async (req, res) => {
  try {
    // Prefer Mongo when available
    if (mongoose.connection && mongoose.connection.readyState === 1) {
        const docs = await ShopModel.find().lean().exec();
        if (docs && docs.length) {
          // If ProductModel contains products for these shops, merge them into the shop.products
          const legacyIds = docs.map(d => d.legacyId).filter(id => typeof id !== 'undefined');
          let productsByShop = {};
          try {
            const prods = await ProductModel.find({ shopLegacyId: { $in: legacyIds } }).lean().exec();
            productsByShop = prods.reduce((acc, p) => {
              const key = Number(p.shopLegacyId || 0);
              acc[key] = acc[key] || [];
              acc[key].push(p);
              return acc;
            }, {});
          } catch (e) {
            // ignore product lookup failures and continue with existing shop.products
            console.warn('Failed to fetch products for shops:', e && e.message ? e.message : e);
          }

          const shops = (docs || []).map(d => {
            const legacyId = d.legacyId || d._id;
            // Prefer products from ProductModel (Mongo) when available for this shop,
            // otherwise fall back to the legacy `d.products` embedded array.
            const prodList = (productsByShop[legacyId] && productsByShop[legacyId].length) ? productsByShop[legacyId] : ((d.products && d.products.length) ? d.products : []);
            // normalize product entries coming from ProductModel to legacy shape when needed
            const normalized = (prodList || []).map(p => {
              if (!p) return p;
              // If product came from ProductModel it will have fields like price.amount and images
              if (p.price && typeof p.price.amount !== 'undefined') {
                return {
                  id: p.id || p._id || p.id,
                  name: p.name,
                  price: p.price.amount,
                  image: (p.images && p.images.length) ? p.images[0] : (p.image || ''),
                  description: p.description || '',
                  details: p.details || p.description || '',
                  shopLocation: p.shopLocation || d.address || '',
                  shopPhone: p.shopPhone || (d && d.owner && d.owner.phone) || '',
                  category: (p.category || '').toString(),
                  stock: (typeof p.stock !== 'undefined') ? Number(p.stock) : 0,
                  inStock: (typeof p.stock !== 'undefined') ? (p.stock > 0) : true
                };
              }
              // assume already legacy-shaped: normalize to include numeric `stock` and boolean `inStock`
              const legacyPrice = (typeof p.price === 'number') ? Math.floor(p.price) : (p.price && typeof p.price === 'object' && typeof p.price.amount !== 'undefined' ? Math.floor(Number(p.price.amount)) : 0);
              return {
                id: p.id || p._id || null,
                name: p.name,
                price: legacyPrice,
                image: p.image || (p.images && p.images.length ? p.images[0] : ''),
                description: p.description || '',
                details: p.details || p.description || '',
                shopLocation: p.shopLocation || d.address || '',
                shopPhone: p.shopPhone || (d && d.owner && d.owner.phone) || '',
                category: (p.category || '').toString(),
                stock: (typeof p.stock !== 'undefined') ? Number(p.stock) : ((typeof p.inStock !== 'undefined') ? (p.inStock ? 1 : 0) : 0),
                inStock: (typeof p.stock !== 'undefined') ? (Number(p.stock) > 0) : ((typeof p.inStock !== 'undefined') ? !!p.inStock : true)
              };
            });

            return {
              id: d.legacyId || d._id,
              name: d.name,
              category: d.category,
              address: d.address,
              deliveryFee: d.deliveryFee,
              deliveryServices: d.deliveryServices || [],
              owner: d.owner || {},
              products: normalized,
              orders: d.orders || []
            };
          });
          return res.json(shops);
        }
      // if Mongo returns no docs, fall back to legacy JSON so UI still shows products
      const legacy = readShops();
      return res.json(legacy || []);
    }
    const shops = readShops();
    return res.json(shops || []);
  } catch (err) {
    console.error('GET /api/shops error', err && err.message ? err.message : err);
    const shops = readShops();
    return res.json(shops || []);
  }
});

// Temporary debug endpoint: report shops file path, file contents and Mongo shop counts
app.get('/api/_debug/shops-info', async (_req, res) => {
  try {
    const info = { DATA_DIR, SHOPS_FILE };
    try {
      const stat = fs.statSync(SHOPS_FILE);
      info.shopsFileExists = true;
      info.shopsFileSize = stat.size;
      const shopsFromFile = readShops();
      info.shopsFileCount = Array.isArray(shopsFromFile) ? shopsFromFile.length : 0;
      info.shopsFileSample = shopsFromFile && shopsFromFile.length ? shopsFromFile[0] : null;
    } catch (e) {
      info.shopsFileExists = false;
      info.shopsFileSize = 0;
      info.shopsFileCount = 0;
      info.shopsFileSample = null;
      info.shopsFileError = e && e.message ? e.message : String(e);
    }

    try {
      info.mongoConnected = !!(mongoose.connection && mongoose.connection.readyState === 1);
      if (info.mongoConnected) {
        const mongoCount = await ShopModel.countDocuments().exec();
        info.mongoShopCount = mongoCount;
        const s = await ShopModel.findOne().lean().exec();
        info.mongoFirstShop = s || null;
      } else {
        info.mongoShopCount = 0;
        info.mongoFirstShop = null;
      }
    } catch (e) {
      info.mongoError = e && e.message ? e.message : String(e);
    }

    return res.json(info);
  } catch (err) {
    console.error('Debug shops-info error', err && err.message ? err.message : err);
    return res.status(500).json({ message: 'Debug error' });
  }
});

// --- Mongo-backed endpoints (mirror of JSON endpoints) ---
// These allow switching the frontend to Mongo persistence without breaking the legacy routes.
app.get('/api/db/shops', async (req, res) => {
  try {
    if (!mongoose.connection || mongoose.connection.readyState !== 1) return res.status(503).json({ message: 'MongoDB not connected' });
    const docs = await ShopModel.find().lean().exec();
    // Map legacy shape: use legacyId if present, else fallback to numeric ObjectId hash
    const shops = docs.map(d => ({ ...d, id: d.legacyId || d._id }));
    return res.json(shops);
  } catch (e) {
    console.error('GET /api/db/shops error', e && e.message ? e.message : e);
    return res.status(500).json({ message: 'Server error' });
  }
});

app.post('/api/db/shops', authenticate, validate(schemas.shopCreate), async (req, res) => {
  try {
    if (!mongoose.connection || mongoose.connection.readyState !== 1) return res.status(503).json({ message: 'MongoDB not connected' });
    const payload = req.body;
    console.log(`[PUT] /api/shops/${shopId}/products/${rawProductId} payload:`, JSON.stringify(payload));
    if (payload.owner && payload.owner.password) payload.owner.password = await bcrypt.hash(String(payload.owner.password), 10);
    // determine next legacyId
    const max = await ShopModel.findOne().sort({ legacyId: -1 }).lean().exec();
    const nextId = (max && max.legacyId) ? (max.legacyId + 1) : 1;
    const shop = await ShopModel.create({ ...payload, legacyId: nextId });
    return res.status(201).json({ ...shop.toObject(), id: shop.legacyId });
  } catch (e) {
    console.error('POST /api/db/shops error', e && e.message ? e.message : e);
    return res.status(500).json({ message: 'Server error' });
  }
});

app.get('/api/db/shops/:id/products', async (req, res) => {
  try {
    if (!mongoose.connection || mongoose.connection.readyState !== 1) return res.status(503).json({ message: 'MongoDB not connected' });
    const id = Number(req.params.id);
    const shop = await ShopModel.findOne({ legacyId: id }).lean().exec();
    if (!shop) return res.status(404).json({ message: 'Shop not found' });
    return res.json(shop.products || []);
  } catch (e) {
    console.error('GET /api/db/shops/:id/products error', e && e.message ? e.message : e);
    return res.status(500).json({ message: 'Server error' });
  }
});

// Dev-only: list users from MongoDB for debugging (only available when not in production)
app.get('/api/db/users', async (req, res) => {
  try {
    if (process.env.NODE_ENV === 'production') return res.status(404).json({ message: 'Not found' });
    if (!mongoose.connection || mongoose.connection.readyState !== 1) return res.status(503).json({ message: 'MongoDB not connected' });
    const docs = await User.find().limit(100).lean().exec();
    return res.json({ count: docs.length, users: docs.map(d => ({ username: d.username, email: d.email, role: d.role, _id: d._id })) });
  } catch (e) {
    console.error('GET /api/db/users error', e && e.message ? e.message : e);
    return res.status(500).json({ message: 'Server error' });
  }
});

// Create product (shop owners only)
app.post('/api/products', requireAuth, requireVerifiedEmail, requireShopOwner, validate(schemas.productCreate), async (req, res) => {
  try {
    if (!mongoose.connection || mongoose.connection.readyState !== 1) return res.status(503).json({ message: 'MongoDB not connected' });
    // Ensure client sent JSON (no multipart/form-data here)
    if (!req.is || !req.is('application/json')) return res.status(415).json({ message: 'Content-Type must be application/json' });
    // Determine legacy shop id: prefer explicit body.shopId, else authenticated shop owner shopId
    const legacyShopId = (typeof req.body.shopId !== 'undefined') ? Number(req.body.shopId) : (req.user && req.user.shopId ? Number(req.user.shopId) : undefined);
    if (!legacyShopId) return res.status(400).json({ message: 'shopId is required' });
    const shop = await ShopModel.findOne({ legacyId: legacyShopId }).exec();
    if (!shop) return res.status(404).json({ message: 'Shop not found' });

    const { name, description = '', details = '', price, images = [], category, stock, inStock, status = 'draft', attributes = {}, condition = 'new', shopPhone = '', shopLocation = '' } = req.body;
    // Basic required-field validation with clear messages
    if (!name || String(name).trim().length === 0) return res.status(400).json({ message: 'Product name is required' });
    // Normalize price into { amount, currency }
    let priceObj = { amount: 0, currency: 'ETB' };
    if (typeof price === 'number') priceObj.amount = Math.floor(price);
    else if (price && typeof price === 'object' && typeof price.amount !== 'undefined') priceObj.amount = Math.floor(Number(price.amount));

    // Validate price.amount
    if (typeof priceObj.amount !== 'number' || Number.isNaN(priceObj.amount)) {
      return res.status(400).json({ message: 'price.amount is required and must be a number' });
    }

    // Validate images array (accept single string as well)
    const imagesArr = Array.isArray(images) ? images : (images ? [images] : []);
    if (!Array.isArray(imagesArr) || imagesArr.length === 0) {
      return res.status(400).json({ message: 'images is required and must include at least one image URL' });
    }

    // Validate condition field
    if (condition && !['new', 'used'].includes(String(condition))) {
      return res.status(400).json({ message: 'condition must be either "new" or "used"' });
    }

    const product = await ProductModel.create({
      name,
      description,
      details: details || '',
      price: priceObj,
      images: imagesArr,
      condition: String(condition) || 'new',
      shopPhone: shopPhone || '',
      // Default shopLocation to the shop's stored address when not provided
      shopLocation: (shopLocation && String(shopLocation).trim()) ? shopLocation : (shop.address || ''),
      shopId: shop._id,
      shopLegacyId: shop.legacyId,
      category,
      // prefer explicit inStock boolean to set stock quantity; default to 1 (in stock) when inStock true, else 0
      stock: (typeof inStock !== 'undefined') ? (inStock ? 1 : 0) : (Number(stock) || 0),
      status: status || 'draft',
      attributes: attributes || {}
    });

    // Return a friendly shape including `inStock` boolean for immediate UI use
    // Ensure output shape is friendly for the frontend and provides backward-compatibility
    const prodObj = product.toObject();
    if ((!prodObj.images || prodObj.images.length === 0) && prodObj.image) prodObj.images = [prodObj.image];
    const prodOut = {
      ...prodObj,
      inStock: typeof prodObj.stock !== 'undefined' ? (prodObj.stock > 0) : true
    };

    return res.status(201).json(prodOut);
  } catch (e) {
    console.error('POST /api/products error', e && e.message ? e.message : e);
    return res.status(500).json({ message: 'Server error' });
  }
});

// Public product listing
app.get('/api/products', async (req, res) => {
  try {
    const { page = 1, limit = 50, shopId, category, search, status } = req.query;
    const p = Math.max(1, Number(page) || 1);
    const l = Math.min(200, Math.max(1, Number(limit) || 50));

    if (mongoose.connection && mongoose.connection.readyState === 1) {
      const q = {};
      if (typeof shopId !== 'undefined') {
        // allow legacy numeric shop id
        const s = await ShopModel.findOne({ legacyId: Number(shopId) }).lean().exec();
        if (s) q.shopId = s._id;
        else return res.json([]);
      }
      if (category) q.category = category;
      if (status) q.status = status;
      if (search) q.name = { $regex: String(search), $options: 'i' };

      const docs = await ProductModel.find(q).sort({ createdAt: -1 }).skip((p - 1) * l).limit(l).lean().exec();
      // If no products in Mongo, fall back to legacy JSON so frontend still shows products
      if (!docs || docs.length === 0) {
        // fallback to legacy JSON below
      } else {
          // Build a map of shop info to enrich products when shopLocation/shopPhone are missing
          const legacyIds = Array.from(new Set((docs || []).map(d => d.shopLegacyId).filter(id => typeof id !== 'undefined' && id !== null)));
          const shopsMap = {};
          if (legacyIds.length) {
            try {
              const shopDocs = await ShopModel.find({ legacyId: { $in: legacyIds } }).lean().exec();
              for (const s of shopDocs || []) shopsMap[s.legacyId] = s;
            } catch (e) {
              // ignore shop lookup failures
            }
          }

          // sanitize shape for public consumption and prefer shop address when product lacks shopLocation
          const out = docs.map(d => ({
            id: d._id,
            name: d.name,
            description: d.description,
            details: d.details || '',
            price: d.price || { amount: 0, currency: 'ETB' },
            images: d.images || (d.image ? [d.image] : []),
            condition: d.condition || 'new',
            shopPhone: d.shopPhone || (shopsMap[d.shopLegacyId] ? shopsMap[d.shopLegacyId].phone || '' : ''),
            shopLocation: (d.shopLocation && String(d.shopLocation).trim()) ? d.shopLocation : (shopsMap[d.shopLegacyId] ? shopsMap[d.shopLegacyId].address || '' : ''),
            shopId: d.shopLegacyId || null,
            category: d.category || null,
            stock: d.stock || 0,
            status: d.status || 'draft',
            attributes: d.attributes || {},
            createdAt: d.createdAt,
            updatedAt: d.updatedAt
          }));
          return res.json(out);
      }
    }

    // Fallback to legacy JSON shops/products
    const shops = readShops();
    let pool = shops.flatMap(s => {
      const shopLegacyId = s.id;
      const prods = (s.products || []).map(p => ({
        id: `${shopLegacyId}-${p.id}`,
        name: p.name,
        description: p.description || '',
        details: p.details || p.description || '',
        price: { amount: Math.floor(Number(p.price || 0)), currency: 'ETB' },
        images: p.image ? [p.image] : [],
        shopId: shopLegacyId,
        shopPhone: s.phone || '',
        shopLocation: s.address || '',
        category: p.category || null,
        stock: (typeof p.inStock !== 'undefined') ? (p.inStock ? 1 : 0) : 0,
        status: 'active',
        attributes: {}
      }));
      return prods;
    });

    if (shopId) pool = pool.filter(p => Number(p.shopId) === Number(shopId));
    if (category) pool = pool.filter(p => p.category === category);
    if (search) pool = pool.filter(p => (p.name || '').toLowerCase().includes(String(search).toLowerCase()));

    const start = (p - 1) * l;
    const sliced = pool.slice(start, start + l);
    return res.json(sliced);
  } catch (e) {
    console.error('GET /api/products error', e && e.message ? e.message : e);
    return res.status(500).json({ message: 'Server error' });
  }
});

// GET single product by id (supports Mongo _id or legacy `${shopId}-${prodId}` format)
app.get('/api/products/:id', async (req, res) => {
  try {
    const pid = req.params.id;
    // Try MongoDB first when available
    if (mongoose.connection && mongoose.connection.readyState === 1) {
      let doc = null;
      try {
        // Support legacy hyphenated ids like "<shopLegacyId>-<mongoObjectId>"
        const hyphenMatch = String(pid).match(/^(\d+)-([0-9a-fA-F]{24})$/);
        if (hyphenMatch) {
          const possibleId = hyphenMatch[2];
          if (mongoose.Types.ObjectId.isValid(possibleId)) {
            doc = await ProductModel.findById(possibleId).lean().exec();
            // ensure product belongs to indicated shop when possible
            if (doc && typeof doc.shopLegacyId !== 'undefined' && Number(doc.shopLegacyId) !== Number(hyphenMatch[1])) {
              doc = null; // mismatch, ignore
            }
          }
        }
        // Fallback: direct ObjectId lookup when pid itself is an ObjectId
        if (!doc && mongoose.Types.ObjectId.isValid(pid)) {
          doc = await ProductModel.findById(pid).lean().exec();
        }
        // last resort: try matching by string id field (some old entries may store id differently)
        if (!doc) doc = await ProductModel.findOne({ _id: pid }).lean().exec();
      } catch (e) {
        // ignore and fall back to legacy JSON below
      }

      if (doc) {
        const out = { ...doc };
        // Backwards compatibility: if `images` missing but `image` present, convert
        if ((!out.images || out.images.length === 0) && out.image) out.images = [out.image];
        out.id = out._id;
        out.shopId = out.shopLegacyId || null;
        out.condition = out.condition || 'new';
        out.shopPhone = out.shopPhone || '';
        // If product doesn't include shopLocation, try to read it from the Shop collection
        if (!out.shopLocation || String(out.shopLocation).trim() === '') {
          try {
            if (typeof out.shopLegacyId !== 'undefined' && out.shopLegacyId !== null) {
              const s = await ShopModel.findOne({ legacyId: Number(out.shopLegacyId) }).lean().exec();
              if (s) out.shopLocation = s.address || '';
            }
          } catch (e) {
            // ignore lookup failures
          }
        }
        out.shopLocation = out.shopLocation || '';
        out.inStock = typeof out.stock !== 'undefined' ? (out.stock > 0) : true;
        return res.json(out);
      }
    }

    // Fallback to legacy shops.json products
    const shops = readShops();
    for (const s of (shops || [])) {
      const shopLegacyId = s.id;
      for (const p of (s.products || [])) {
        const candidateId = `${shopLegacyId}-${p.id}`;
        if (String(candidateId) === String(pid) || String(p.id) === String(pid)) {
          const out = {
            id: candidateId,
            name: p.name,
            description: p.description || '',
            details: p.details || p.description || '',
            price: { amount: Math.floor(Number(p.price || 0)), currency: 'ETB' },
            images: p.image ? [p.image] : [],
            shopId: shopLegacyId,
            category: p.category || null,
            stock: (typeof p.stock !== 'undefined') ? Number(p.stock) : ((typeof p.inStock !== 'undefined') ? (p.inStock ? 1 : 0) : 0),
            inStock: (typeof p.stock !== 'undefined') ? (Number(p.stock) > 0) : ((typeof p.inStock !== 'undefined') ? !!p.inStock : true),
            status: 'active',
            attributes: p.attributes || {},
            condition: p.condition || 'new',
            shopPhone: p.shopPhone || (s.phone || '') || '',
            shopLocation: p.shopLocation || s.address || ''
          };
          return res.json(out);
        }
      }
    }

    return res.status(404).json({ message: 'Product not found' });
  } catch (err) {
    console.error('GET /api/products/:id error', err && err.message ? err.message : err);
    return res.status(500).json({ message: 'Server error' });
  }
});

app.post('/api/db/shops/:id/products', authenticate, validate(schemas.productCreate), async (req, res) => {
  try {
    if (!mongoose.connection || mongoose.connection.readyState !== 1) return res.status(503).json({ message: 'MongoDB not connected' });
    const shopId = Number(req.params.id);
    const payload = req.body;
    const shop = await ShopModel.findOne({ legacyId: shopId }).exec();
    if (!shop) return res.status(404).json({ message: 'Shop not found' });
    // compute global max product id
    const all = await ShopModel.find().lean().exec();
    const allProductIds = all.flatMap(s => (s.products || []).map(p => p.id || 0));
    const maxPid = allProductIds.reduce((m, v) => Math.max(m, v), 0);
    const newProduct = { ...payload, id: maxPid + 1 };
    shop.products = shop.products || [];
    shop.products.push(newProduct);
    await shop.save();
    return res.status(201).json(newProduct);
  } catch (e) {
    console.error('POST /api/db/shops/:id/products error', e && e.message ? e.message : e);
    return res.status(500).json({ message: 'Server error' });
  }
});

// Orders via Mongo
app.post('/api/db/orders', authenticate, ordersLimiter, validate(schemas.orderCreate), async (req, res) => {
  try {
    // Admins are read-only and cannot create orders
    if (req.user && req.user.role === 'admin') return res.status(403).json({ message: 'Admins are read-only' });
    if (!mongoose.connection || mongoose.connection.readyState !== 1) return res.status(503).json({ message: 'MongoDB not connected' });
    const payload = req.body || {};
    const { shopId, items: rawItems, total, paymentMethod } = payload;
    const items = (Array.isArray(rawItems) ? rawItems : []).map(i => ({
      productId: i.productId ?? i.id ?? i.product ?? null,
      name: i.name ?? i.title ?? '',
      qty: Number(i.quantity ?? i.qty ?? 1),
      price: Number(i.price ?? i.unitPrice ?? 0)
    }));
    if (!shopId || !Array.isArray(items) || items.length === 0 || typeof total === 'undefined') {
      return res.status(400).json({ message: 'Missing required order fields: shopId, items, total' });
    }
    const orderId = `ORD-${Date.now()}`;
    const orderDoc = await OrderModel.create({ id: orderId, shopId: Number(shopId), items, total, customer: payload.customer || {}, status: 'pending' });
    // also add to shop.orders for notification
    const shop = await ShopModel.findOne({ legacyId: Number(shopId) }).exec();
    if (shop) {
      shop.orders = shop.orders || [];
      shop.orders.unshift({ orderId, receivedAt: new Date().toISOString(), items, customer: payload.customer || {}, total, status: 'new' });
      await shop.save();
    }
    return res.status(201).json({ message: 'Order created', order: orderDoc });
  } catch (e) {
    console.error('POST /api/db/orders error', e && e.message ? e.message : e);
    return res.status(500).json({ message: 'Server error' });
  }
});

app.get('/api/db/orders/my', async (req, res) => {
  try {
    if (!mongoose.connection || mongoose.connection.readyState !== 1) return res.status(503).json({ message: 'MongoDB not connected' });
    // If user authenticated, filter by username/email in customer.username
    const userPayload = await getUserFromRequest(req);
    if (userPayload && userPayload.username) {
      const orders = await OrderModel.find({ 'customer.username': userPayload.username }).lean().exec();
      return res.json(orders || []);
    }
    // otherwise return all (public-only mode)
    const orders = await OrderModel.find().lean().exec();
    return res.json(orders || []);
  } catch (e) {
    console.error('GET /api/db/orders/my error', e && e.message ? e.message : e);
    return res.status(500).json({ message: 'Server error' });
  }
});

// Cart endpoints
app.get('/api/db/cart/:username', async (req, res) => {
  try {
    if (!mongoose.connection || mongoose.connection.readyState !== 1) return res.status(503).json({ message: 'MongoDB not connected' });
    const username = req.params.username;
    const cart = await CartModel.findOne({ user: username }).lean().exec();
    return res.json(cart || { user: username, items: [] });
  } catch (e) {
    console.error('GET /api/db/cart error', e && e.message ? e.message : e);
    return res.status(500).json({ message: 'Server error' });
  }
});

app.post('/api/db/cart/:username', async (req, res) => {
  try {
    if (!mongoose.connection || mongoose.connection.readyState !== 1) return res.status(503).json({ message: 'MongoDB not connected' });
    const username = req.params.username;
    const payload = req.body || {};
    const cart = await CartModel.findOneAndUpdate({ user: username }, { items: payload.items || [], updatedAt: new Date() }, { upsert: true, new: true }).exec();
    return res.json(cart);
  } catch (e) {
    console.error('POST /api/db/cart error', e && e.message ? e.message : e);
    return res.status(500).json({ message: 'Server error' });
  }
});

// POST /api/shops - create a new shop
app.post('/api/shops', authenticate, validate(schemas.shopCreate), async (req, res) => {
  // Public: allow creating shops in public-only mode
  const payload = req.body;
  if (!payload || !payload.name || !payload.owner || !payload.owner.username) {
    return res.status(400).json({ message: 'Invalid shop payload' });
  }
  // hash owner password before saving if provided
  if (payload.owner && payload.owner.password) {
    payload.owner.password = await bcrypt.hash(String(payload.owner.password), 10);
  }
  if (!payload.address || !String(payload.address).trim()) payload.address = 'Location not provided';
  const shops = readShops();
  const maxId = shops.reduce((m, s) => Math.max(m, s.id || 0), 0);
  const newShop = { ...payload, id: maxId + 1 };

  // If MongoDB is available, persist there as well using legacyId for compatibility
  if (mongoose.connection && mongoose.connection.readyState === 1) {
    try {
      const shopDoc = await ShopModel.create({
        legacyId: Number(newShop.id),
        name: newShop.name,
        address: newShop.address,
        phone: newShop.phone || '',
        deliveryFee: newShop.deliveryFee || '',
        deliveryServices: newShop.deliveryServices || [],
        owner: newShop.owner || {},
        products: newShop.products || []
      });
      // keep JSON file in sync below
    } catch (err) {
      console.error('POST /api/shops - Mongo create error', err && err.message ? err.message : err);
      return res.status(500).json({ message: 'Failed to persist shop to MongoDB' });
    }
  }

  shops.push(newShop);
  if (!writeShops(shops)) return res.status(500).json({ message: 'Failed to persist shop' });
  res.status(201).json(newShop);
});

// PUT /api/shops/:id - update shop
app.put('/api/shops/:id', authenticate, validate(schemas.shopUpdate), async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const payload = req.body;
  const shops = readShops();
  const idx = shops.findIndex(s => s.id === id);
  if (idx === -1) return res.status(404).json({ message: 'Shop not found' });
  // Public: allow updating shops in public-only mode

  // don't allow changing id
  const updated = { ...shops[idx], ...payload, id };
  // if owner password provided, hash it
  if (payload.owner && payload.owner.password) {
    updated.owner = { ...updated.owner, password: bcrypt.hashSync(String(payload.owner.password), 10) };
  }

  // If Mongo is available, persist updates using legacyId
  if (mongoose.connection && mongoose.connection.readyState === 1) {
    try {
      await ShopModel.findOneAndUpdate({ legacyId: id }, {
        name: updated.name,
        address: updated.address,
        phone: updated.phone || '',
        deliveryFee: updated.deliveryFee,
        deliveryServices: updated.deliveryServices || [],
        owner: updated.owner || {},
        products: updated.products || []
      }, { upsert: true, new: true }).exec();
    } catch (err) {
      console.error('PUT /api/shops/:id - Mongo update error', err && err.message ? err.message : err);
      return res.status(500).json({ message: 'Failed to persist shop to MongoDB' });
    }
  }

  shops[idx] = updated;
  if (!writeShops(shops)) return res.status(500).json({ message: 'Failed to persist shop' });
  res.json(updated);
});

// DELETE /api/shops/:id - delete shop
app.delete('/api/shops/:id', authenticate, async (req, res) => {
  // Public: allow deleting shops in public-only mode
  const id = parseInt(req.params.id, 10);
  const shops = readShops();
  const idx = shops.findIndex(s => s.id === id);
  if (idx === -1) return res.status(404).json({ message: 'Shop not found' });

  // If Mongo is available, delete there as well
  if (mongoose.connection && mongoose.connection.readyState === 1) {
    try {
      await ShopModel.findOneAndDelete({ legacyId: id }).exec();
    } catch (err) {
      console.error('DELETE /api/shops/:id - Mongo delete error', err && err.message ? err.message : err);
      return res.status(500).json({ message: 'Failed to delete shop from MongoDB' });
    }
  }

  shops.splice(idx, 1);
  if (!writeShops(shops)) return res.status(500).json({ message: 'Failed to persist shop' });
  res.json({ message: 'Shop deleted' });
});

// -------------------- Product endpoints --------------------
// GET products for a shop
app.get('/api/shops/:id/products', async (req, res) => {
  try {
    const legacyId = Number(req.params.id);
    // If Mongo available, prefer ProductModel products for this shop
    if (mongoose.connection && mongoose.connection.readyState === 1) {
      try {
        const prods = await ProductModel.find({ shopLegacyId: legacyId }).lean().exec();
        if (prods && prods.length) {
          const mapped = prods.map(p => ({
            id: p._id,
            name: p.name,
            price: p.price ? p.price.amount : 0,
            image: (p.images && p.images.length) ? p.images[0] : '',
            description: p.description || '',
            inStock: typeof p.stock !== 'undefined' ? (p.stock > 0) : true,
            category: p.category || null
          }));
          return res.json(mapped);
        }
      } catch (e) {
        console.warn('GET /api/shops/:id/products product lookup failed', e && e.message ? e.message : e);
      }
    }
    const shops = readShops();
    const shop = shops.find(s => s.id === legacyId);
    if (!shop) return res.status(404).json({ message: 'Shop not found' });
    res.json(shop.products || []);
  } catch (err) {
    console.error('GET /api/shops/:id/products error', err && err.message ? err.message : err);
    return res.status(500).json({ message: 'Server error' });
  }
});

// POST add product to a shop
app.post('/api/shops/:id/products', authenticate, validate(schemas.productCreate), (req, res) => {
  const id = parseInt(req.params.id, 10);
  const payload = req.body;
  if (!payload || !payload.name) return res.status(400).json({ message: 'Invalid product payload' });
  const shops = readShops();
  const shop = shops.find(s => s.id === id);
  if (!shop) return res.status(404).json({ message: 'Shop not found' });
  // Public: allow adding products in public-only mode

  // generate product id globally
  const allProductIds = shops.flatMap(s => (s.products || []).map(p => p.id || 0));
  const maxPid = allProductIds.reduce((m, v) => Math.max(m, v), 0);
  // ensure inStock true by default when created from legacy endpoint
  const inStock = (typeof payload.inStock !== 'undefined') ? !!payload.inStock : true;
  // Ensure category is persisted for legacy JSON products; do not fall back to shop.category
  const newProduct = { ...payload, id: maxPid + 1, inStock };
  if (typeof newProduct.category === 'undefined' || newProduct.category === null) {
    newProduct.category = '';
  }
  shop.products = shop.products || [];
  shop.products.push(newProduct);
  if (!writeShops(shops)) return res.status(500).json({ message: 'Failed to persist product' });
  res.status(201).json(newProduct);
});

// PUT update product
app.put('/api/shops/:shopId/products/:productId', authenticate, validate(schemas.productCreate), async (req, res) => {
  try {
    const shopId = Number(req.params.shopId);
    const rawProductId = req.params.productId;
    const payload = req.body;

    // If productId looks like a Mongo ObjectId and Mongo is available, update ProductModel
    const isObjectId = /^[0-9a-fA-F]{24}$/.test(rawProductId);
    if (isObjectId && mongoose.connection && mongoose.connection.readyState === 1) {
      const prod = await ProductModel.findById(rawProductId).exec();
      if (!prod) return res.status(404).json({ message: 'Product not found' });
      // ensure product belongs to the shop (by legacy id)
      if (Number(prod.shopLegacyId) !== Number(shopId)) return res.status(404).json({ message: 'Product not found' });

      // fetch shop document to allow defaulting of shopLocation when missing
      let shopDoc = null;
      try { shopDoc = await ShopModel.findOne({ legacyId: prod.shopLegacyId }).lean().exec(); } catch (e) { /* ignore */ }

      // apply updates (accept same fields as product creation)
      if (typeof payload.name !== 'undefined') prod.name = payload.name;
      if (typeof payload.description !== 'undefined') prod.description = payload.description;
      if (typeof payload.details !== 'undefined') prod.details = payload.details;
      if (typeof payload.images !== 'undefined') prod.images = Array.isArray(payload.images) ? payload.images : (payload.images ? [payload.images] : []);
      if (typeof payload.category !== 'undefined') prod.category = payload.category;
      if (typeof payload.stock !== 'undefined' && payload.stock !== null) {
        const s = Number(payload.stock);
        prod.stock = (Number.isFinite(s) && !Number.isNaN(s)) ? Math.max(0, Math.floor(s)) : prod.stock;
      }
      if (typeof payload.status !== 'undefined') prod.status = payload.status;
      if (typeof payload.attributes !== 'undefined') prod.attributes = payload.attributes;
      if (typeof payload.price !== 'undefined') {
        if (typeof payload.price === 'number') prod.price = { amount: Math.floor(payload.price), currency: 'ETB' };
        else if (payload.price && typeof payload.price === 'object' && typeof payload.price.amount !== 'undefined') prod.price = { amount: Math.floor(Number(payload.price.amount)), currency: payload.price.currency || 'ETB' };
      }

      // additional fields supported by creation: details, condition, shopPhone, shopLocation
      if (typeof payload.condition !== 'undefined') {
        const c = String(payload.condition || '').toLowerCase();
        if (c === 'new' || c === 'used') prod.condition = c;
      }
      if (typeof payload.shopPhone !== 'undefined') prod.shopPhone = payload.shopPhone || '';
      if (typeof payload.shopLocation !== 'undefined') {
        prod.shopLocation = payload.shopLocation || '';
      } else {
        // default to shop address when product lacks shopLocation
        if ((!prod.shopLocation || String(prod.shopLocation).trim() === '') && shopDoc && shopDoc.address) prod.shopLocation = shopDoc.address;
      }

      await prod.save();
      console.log(`[PUT] Updated product ${rawProductId} stock ->`, prod.stock);
      return res.json(prod);
    }

    // Fallback to legacy JSON products
    const productId = parseInt(rawProductId, 10);
    const shops = readShops();
    const shop = shops.find(s => s.id === shopId);
    if (!shop) return res.status(404).json({ message: 'Shop not found' });
    shop.products = shop.products || [];
    const idx = shop.products.findIndex(p => p.id === productId);
    if (idx === -1) return res.status(404).json({ message: 'Product not found' });
    const updated = { ...shop.products[idx], ...payload, id: productId };
    // ensure numeric stock is stored for legacy products when provided
    if (typeof payload.stock !== 'undefined' && payload.stock !== null) {
      const s = Number(payload.stock);
      updated.stock = (Number.isFinite(s) && !Number.isNaN(s)) ? Math.max(0, Math.floor(s)) : updated.stock;
    }
    // default shopLocation to shop address when not provided
    if (typeof payload.shopLocation === 'undefined' && (!updated.shopLocation || String(updated.shopLocation).trim() === '')) {
      updated.shopLocation = shop.address || '';
    }
    // ensure legacy products have a details field (fallback to description)
    if (typeof updated.details === 'undefined' || updated.details === null) updated.details = updated.description || '';
    shop.products[idx] = updated;
    if (!writeShops(shops)) return res.status(500).json({ message: 'Failed to persist product' });
    return res.json(updated);
  } catch (err) {
    console.error('PUT /api/shops/:shopId/products/:productId error', err && err.message ? err.message : err);
    return res.status(500).json({ message: 'Server error' });
  }
});

// DELETE product
app.delete('/api/shops/:shopId/products/:productId', authenticate, async (req, res) => {
  try {
    const shopId = Number(req.params.shopId);
    const rawProductId = req.params.productId;
    const isObjectId = /^[0-9a-fA-F]{24}$/.test(rawProductId);
    if (isObjectId && mongoose.connection && mongoose.connection.readyState === 1) {
      const prod = await ProductModel.findById(rawProductId).exec();
      if (!prod) return res.status(404).json({ message: 'Product not found' });
      if (Number(prod.shopLegacyId) !== Number(shopId)) return res.status(404).json({ message: 'Product not found' });
      await ProductModel.deleteOne({ _id: rawProductId }).exec();
      return res.json({ message: 'Product deleted' });
    }

    const productId = parseInt(rawProductId, 10);
    const shops = readShops();
    const shop = shops.find(s => s.id === shopId);
    if (!shop) return res.status(404).json({ message: 'Shop not found' });
    shop.products = shop.products || [];
    const idx = shop.products.findIndex(p => p.id === productId);
    if (idx === -1) return res.status(404).json({ message: 'Product not found' });
    shop.products.splice(idx, 1);
    if (!writeShops(shops)) return res.status(500).json({ message: 'Failed to persist product' });
    return res.json({ message: 'Product deleted' });
  } catch (err) {
    console.error('DELETE /api/shops/:shopId/products/:productId error', err && err.message ? err.message : err);
    return res.status(500).json({ message: 'Server error' });
  }
});

// Debug endpoint - non-sensitive server info to help with local troubleshooting
app.get('/api/debug', (req, res) => {
  const routes = [
    '/api/health',
    '/api/shops',
    '/api/shops/:id',
    '/api/shops/:id/products',
    '/api/shops/:shopId/products/:productId',
    '/api/upload'
  ];
  res.json({ cwd: process.cwd(), port: PORT, routes });
});

// POST /api/shops/:id/orders - accept an order notification for a shop
app.post('/api/shops/:id/orders', validate(schemas.shopOrderNotify), (req, res) => {
  const id = parseInt(req.params.id, 10);
  const payload = req.body;
  if (!payload || !payload.orderId) return res.status(400).json({ message: 'Invalid order payload' });
  const shops = readShops();
  const shopIdx = shops.findIndex(s => s.id === id);
  if (shopIdx === -1) return res.status(404).json({ message: 'Shop not found' });

  shops[shopIdx].orders = shops[shopIdx].orders || [];
  // store a minimal notification record
  const note = {
    orderId: payload.orderId,
    receivedAt: new Date().toISOString(),
    items: payload.items || [],
    customer: payload.customer || {},
    total: payload.total || 0,
    status: 'new',
  };
  shops[shopIdx].orders.unshift(note);
  if (!writeShops(shops)) return res.status(500).json({ message: 'Failed to persist order notification' });
  // Also persist centrally to orders.json when possible (avoid duplicates)
  try {
    const orders = readOrders();
    const exists = orders.find(o => String(o.id) === String(payload.orderId));
    if (!exists) {
      const central = {
        id: payload.orderId,
        shopId: id,
        items: payload.items || [],
        total: payload.total || 0,
        customer: payload.customer || {},
        status: 'new',
        createdAt: new Date().toISOString(),
      };
      orders.unshift(central);
      writeOrders(orders);
    }
  } catch (err) {
    console.warn('Failed to persist central order record:', err && err.message ? err.message : err);
  }
  // In a real app: push notification, email, SMS, etc.
  info('Shop notified of order', { requestId: req.id, shopId: id, orderId: payload.orderId });
  res.status(201).json({ message: 'Shop notified', note });
});

// ---------------- Reviews API ----------------
// GET /api/products/:productId/reviews - public: list reviews, avg and count
app.get('/api/products/:productId/reviews', async (req, res) => {
  try {
    const { productId } = req.params;
    const ReviewModel = (await import('./models/Review.js')).default;
    const mongoose = (await import('mongoose')).default;

    const pidCandidates = [productId];
    try {
      // support hyphenated ids like "<shopLegacyId>-<mongoObjectId>"
      const hyphenMatch = String(productId).match(/^\d+-([0-9a-fA-F]{24})$/);
      if (hyphenMatch && mongoose.Types.ObjectId.isValid(hyphenMatch[1])) {
        pidCandidates.push(new mongoose.Types.ObjectId(hyphenMatch[1]));
      }
    } catch (e) {}
    try {
      if (mongoose.Types.ObjectId.isValid(productId)) pidCandidates.push(new mongoose.Types.ObjectId(productId));
    } catch (e) {}

    const match = { productId: { $in: pidCandidates } };

    const [reviews, agg] = await Promise.all([
      ReviewModel.find(match).sort({ createdAt: -1 }).lean().exec(),
      ReviewModel.aggregate([
        { $match: match },
        { $group: { _id: '$productId', avg: { $avg: '$rating' }, count: { $sum: 1 } } }
      ]).exec()
    ]);

    const stats = (agg && agg.length) ? agg[0] : { avg: 0, count: 0 };

    // enrich reviews with username where possible
    const UserModel = (await import('./models/User.js')).default;
    const userIds = Array.from(new Set((reviews || []).map(r => String(r.userId)).filter(Boolean)));
    const users = userIds.length ? await UserModel.find({ _id: { $in: userIds } }).lean().exec() : [];
    const userMap = (users || []).reduce((acc, u) => { acc[String(u._id)] = u; return acc; }, {});

    const out = (reviews || []).map(r => ({
      id: r._id,
      productId: r.productId,
      shopId: r.shopId,
      user: userMap[String(r.userId)] ? { username: userMap[String(r.userId)].username, email: userMap[String(r.userId)].email } : null,
      rating: r.rating,
      comment: r.comment,
      verifiedPurchase: !!r.verifiedPurchase,
      createdAt: r.createdAt || r.createdAt
    }));

    return res.json({ reviews: out, average: Number((stats.avg || 0).toFixed(2)), count: stats.count || 0 });
  } catch (err) {
    console.error('GET /api/products/:productId/reviews error', err && err.message ? err.message : err);
    return res.status(500).json({ message: 'Server error' });
  }
});

// GET eligibility - authenticated customers only
app.get('/api/products/:productId/reviews/eligibility', requireAuth, async (req, res) => {
  try {
    const { productId } = req.params;
    const ReviewModel = (await import('./models/Review.js')).default;
    const UserModel = (await import('./models/User.js')).default;
    const OrderModel = (await import('./models/Order.js')).default;
    const mongoose = (await import('mongoose')).default;

    const requester = req.user;
    if (!requester || requester.role !== 'customer') return res.status(403).json({ message: 'Only customers may check review eligibility' });

    const user = await UserModel.findOne({ username: requester.username }).lean().exec();
    if (!user) return res.json({ canReview: false, reason: 'not_purchased' });

    // Build product id candidates (legacy id and ObjectId when valid)
    const pidCandidates = [productId];
    try { pidCandidates.push(new mongoose.Types.ObjectId(productId)); } catch (e) {}

    // Check already reviewed using any matching product id form
    const already = await ReviewModel.exists({ productId: { $in: pidCandidates }, userId: user._id });
    if (already) return res.json({ canReview: false, reason: 'already_reviewed' });

    // Verify purchase: look for an order by this user that contains the product and has final status
    const hasOrder = await OrderModel.findOne({ customerId: requester.username, 'items.productId': { $in: pidCandidates }, status: { $in: ['picked_up', 'delivered'] } }).lean().exec();
    if (!hasOrder) {
      const devBypass = (req.headers && (req.headers['x-dev-bypass'] === '1' || req.headers['x-dev-bypass'] === 'true')) && (process.env.NODE_ENV !== 'production');
      if (!devBypass) return res.json({ canReview: false, reason: 'not_purchased' });
      return res.json({ canReview: true, reason: 'dev_bypass' });
    }

    return res.json({ canReview: true, reason: 'eligible' });
  } catch (err) {
    console.error('GET eligibility error', err && err.message ? err.message : err);
    return res.status(500).json({ message: 'Server error' });
  }
});

// POST create review - authenticated customers only
app.post('/api/products/:productId/reviews', requireAuth, async (req, res) => {
  try {
    const { productId } = req.params;
    const { rating, comment } = req.body || {};
    const ReviewModel = (await import('./models/Review.js')).default;
    const ProductModel = (await import('./models/Product.js')).default;
    const UserModel = (await import('./models/User.js')).default;
    const OrderModel = (await import('./models/Order.js')).default;
    const mongoose = (await import('mongoose')).default;

    const requester = req.user;
    if (!requester || requester.role !== 'customer') return res.status(403).json({ message: 'Only customers may create reviews' });

    const user = await UserModel.findOne({ username: requester.username }).exec();
    if (!user) return res.status(400).json({ message: 'User record not found' });

    if (!rating || typeof rating !== 'number' || rating < 1 || rating > 5) return res.status(400).json({ message: 'Rating must be a number 1-5' });

    // Make sure product exists
    let prod;
    try { prod = await ProductModel.findById(productId).lean().exec(); } catch (e) { prod = null; }
    if (!prod) return res.status(404).json({ message: 'Product not found' });

    // Check duplicate using both legacy and ObjectId forms when possible
    const pidCandidates = [productId];
    try { pidCandidates.push(new mongoose.Types.ObjectId(productId)); } catch (e) {}
    const existing = await ReviewModel.findOne({ productId: { $in: pidCandidates }, userId: user._id }).lean().exec();
    if (existing) return res.status(409).json({ message: 'You have already reviewed this product' });

    // Verify purchase
    const order = await OrderModel.findOne({ customerId: requester.username, 'items.productId': { $in: pidCandidates }, status: { $in: ['picked_up', 'delivered'] } }).lean().exec();
    if (!order) {
      // Development-only bypass: allow review creation when header `X-Dev-Bypass: 1` is present
      // This helps local testing when it's inconvenient to transition order status via shop-owner flows.
      const devBypass = (req.headers && (req.headers['x-dev-bypass'] === '1' || req.headers['x-dev-bypass'] === 'true')) && (process.env.NODE_ENV !== 'production');
      if (!devBypass) return res.status(403).json({ message: 'No qualifying purchase found' });
    }

    let storedProductId = productId;
    try { storedProductId = new mongoose.Types.ObjectId(productId); } catch (e) { }

    const reviewDoc = await ReviewModel.create({ productId: storedProductId, shopId: prod.shopId || null, userId: user._id, rating: Math.round(rating), comment: String(comment || '').trim(), verifiedPurchase: true });

    return res.status(201).json({ message: 'Review created', review: reviewDoc });
  } catch (err) {
    console.error('POST /api/products/:productId/reviews error', err && err.message ? err.message : err);
    if (err && err.code === 11000) return res.status(409).json({ message: 'Duplicate review' });
    return res.status(500).json({ message: 'Server error' });
  }
});


// GET /api/shops/:id/orders - return stored order notifications for a shop
// Protected: only shop owner or admin may view
app.get('/api/shops/:id/orders', requireAuth, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  try {
    // Verify requester is shop owner for this shop or admin
    const shop = readShops().find(s => s.id === id);
    // If shop not in JSON, try Mongo
    let shopDoc = shop || null;
    if (!shopDoc && mongoose.connection && mongoose.connection.readyState === 1) {
      shopDoc = await ShopModel.findOne({ legacyId: id }).lean().exec();
    }
    if (!shopDoc) return res.status(404).json({ message: 'Shop not found' });

    const requester = req.user;
    const isAdminUser = requester && requester.role === 'admin';
    const isShopOwnerUser = requester && requester.role === 'shop_owner' && (Number(requester.shopId) === Number(id) || (shopDoc.owner && shopDoc.owner.username === requester.username));
    if (!isAdminUser && !isShopOwnerUser) return res.status(403).json({ message: 'Forbidden' });

    // Return orders from Mongo if available, otherwise legacy JSON
    if (mongoose.connection && mongoose.connection.readyState === 1) {
      const orders = await OrderModel.find({ shopId: id }).lean().exec();
      return res.json(orders || []);
    }
    // fallback to legacy storage in shops.json
    return res.json((shopDoc.orders || []).map(o => ({ ...o })) || []);
  } catch (err) {
    console.error('GET /api/shops/:id/orders error', err && err.message ? err.message : err);
    return res.status(500).json({ message: 'Server error' });
  }
});

// POST /api/orders - create an order as an authenticated customer
app.post('/api/orders', ordersLimiter, validate(schemas.orderCreate), async (req, res) => {
  const payload = req.body || {};
  // Require authenticated user for creating orders
  const authUser = await getUserFromRequest(req);
  if (!authUser) return res.status(401).json({ message: 'Authentication required' });
  // require verified email
  if (typeof authUser.emailVerified !== 'undefined' && !authUser.emailVerified) return res.status(403).json({ message: 'Please verify your email before placing orders' });
  const { shopId, items: rawItems, total, paymentMethod } = payload;
  // authUser already resolved above (used to decide captcha requirement)
  // Development debug logging to help diagnose order creation issues
  if (process.env.NODE_ENV !== 'production') {
    try {
      console.log('POST /api/orders - requestId=', req.id, 'user=', authUser ? { username: authUser.username, role: authUser.role } : null, 'shopId=', shopId, 'itemsCount=', Array.isArray(rawItems) ? rawItems.length : 0, 'total=', total);
    } catch (e) { /* ignore logging errors */ }
  }
  const items = (Array.isArray(rawItems) ? rawItems : []).map(i => ({
    productId: i.productId ?? i.id ?? i.product ?? null,
    name: i.name ?? i.title ?? '',
    qty: Number(i.quantity ?? i.qty ?? 1),
    price: Number(i.price ?? i.unitPrice ?? 0)
  }));
  if (!shopId || !Array.isArray(items) || items.length === 0 || typeof total === 'undefined') {
    return res.status(400).json({ message: 'Missing required order fields: shopId, items, total' });
  }

  const orderId = `ORD-${Date.now()}`;
  const customerPayload = payload.customer || {};
  const createdBy = authUser && authUser.username ? authUser.username : (customerPayload.username || null);
  const customerUsername = customerPayload.username || (authUser && authUser.username ? authUser.username : null);
  const customerEmail = customerPayload.email || (authUser && authUser.email ? authUser.email : null);
  const orderBase = {
    id: orderId,
    shopId: Number(shopId),
    items,
    total,
    paymentMethod: paymentMethod || 'cash_on_delivery',
    status: 'pending',
    createdAt: new Date().toISOString(),
    createdBy,
    customer: {
      username: customerUsername,
      email: customerEmail,
    }
  };

  // compute fingerprint for deduplication (shop, items, total, customer identity)
  try {
    const normItemsForFp = items.map(i => ({ productId: String(i.productId || i.id || ''), qty: Number(i.qty || i.quantity || 1), price: Number(i.price || 0) }));
    const fpSourceTop = JSON.stringify({ shopId: Number(shopId), items: normItemsForFp, total: Number(total), customer: orderBase.customer && (orderBase.customer.username || orderBase.customer.email) });
    const fingerprint = crypto.createHash('sha256').update(fpSourceTop).digest('hex');
    // expose fingerprint to outer scope via orderBase.__fingerprint
    orderBase.__fingerprint = fingerprint;
  } catch (e) {
    // ignore fingerprint errors
  }

  try {
    // If fingerprint present, check for a recent identical order (last 30s) to avoid duplicates
    try {
      const fp = orderBase.__fingerprint;
      if (fp) {
        const recent = await OrderModel.findOne({ fingerprint: fp, createdAt: { $gte: new Date(Date.now() - 30 * 1000) } }).lean().exec();
        if (recent) return res.status(200).json({ message: 'Duplicate order detected; returning existing order', order: recent });
      }
    } catch (e) {
      // ignore fingerprint lookup errors
    }
    // Persist to Mongo if available. First, validate and decrement stock for each item.
    let adjustments = [];
    if (mongoose.connection && mongoose.connection.readyState === 1) {
      // Validate stock availability
      for (const it of items) {
        const pid = it.productId;
        const qty = Number(it.qty || it.quantity || it.qty || 1);
        const isOid = typeof pid === 'string' && /^[0-9a-fA-F]{24}$/.test(pid);
        if (isOid) {
          const prod = await ProductModel.findById(pid).exec();
          if (!prod) return res.status(404).json({ message: `Product not found: ${pid}` });
          const avail = Number(prod.stock || 0);
          if (avail <= 0) {
            adjustments.push({ productId: pid, name: prod.name || pid, requested: qty, available: 0 });
            it._adjustedQty = 0;
          } else if (avail < qty) {
            adjustments.push({ productId: pid, name: prod.name || pid, requested: qty, available: avail });
            it._adjustedQty = avail;
          }
        } else {
          // legacy product id: try to find in ShopModel embedded products
          const shopDoc = await ShopModel.findOne({ legacyId: Number(shopId) }).exec();
          if (shopDoc) {
            const pidx = (shopDoc.products || []).findIndex(p => String(p.id) === String(pid));
            if (pidx !== -1) {
              const p = shopDoc.products[pidx];
              const avail = typeof p.stock !== 'undefined' ? Number(p.stock) : (p.inStock ? 1 : 0);
              if (avail <= 0) {
                adjustments.push({ productId: pid, name: p.name || pid, requested: qty, available: 0 });
                it._adjustedQty = 0;
              } else if (avail < qty) {
                adjustments.push({ productId: pid, name: p.name || pid, requested: qty, available: avail });
                it._adjustedQty = avail;
              }
            }
          } else {
            // fallback to shops.json
            const shops = readShops();
            const shopIdx = shops.findIndex(s => s.id === Number(shopId));
            if (shopIdx !== -1) {
              const prodLegacy = (shops[shopIdx].products || []).find(p => String(p.id) === String(pid));
              if (prodLegacy) {
                const avail = typeof prodLegacy.stock !== 'undefined' ? Number(prodLegacy.stock) : (prodLegacy.inStock ? 1 : 0);
                if (avail <= 0) {
                  adjustments.push({ productId: pid, name: prodLegacy.name || pid, requested: qty, available: 0 });
                  it._adjustedQty = 0;
                } else if (avail < qty) {
                  adjustments.push({ productId: pid, name: prodLegacy.name || pid, requested: qty, available: avail });
                  it._adjustedQty = avail;
                }
              }
            }
          }
        }
      }

      // Apply adjustments: set qty fields or remove zero-qty items
      for (let i = items.length - 1; i >= 0; i--) {
        const it = items[i];
        if (typeof it._adjustedQty !== 'undefined') {
          const newQty = Math.floor(Number(it._adjustedQty || 0));
          if (newQty <= 0) {
            items.splice(i, 1);
          } else {
            it.qty = newQty;
            it.quantity = newQty;
          }
          delete it._adjustedQty;
        }
      }
      if (!items || items.length === 0) return res.status(400).json({ message: 'All requested items are out of stock', adjustedItems: adjustments });

      // Decrement stock for validated items
      for (const it of items) {
        const pid = it.productId;
        const qty = Number(it.qty || it.quantity || it.qty || 1);
        const isOid = typeof pid === 'string' && /^[0-9a-fA-F]{24}$/.test(pid);
        if (isOid) {
          await ProductModel.findByIdAndUpdate(pid, { $inc: { stock: -Math.floor(qty) } }).exec();
        } else {
          // update embedded product in ShopModel if present
          const shopDoc = await ShopModel.findOne({ legacyId: Number(shopId) }).exec();
          if (shopDoc) {
            const pidx = (shopDoc.products || []).findIndex(p => String(p.id) === String(pid));
            if (pidx !== -1) {
              const prev = typeof shopDoc.products[pidx].stock !== 'undefined' ? Number(shopDoc.products[pidx].stock) : (shopDoc.products[pidx].inStock ? 1 : 0);
              shopDoc.products[pidx].stock = Math.max(0, prev - Math.floor(qty));
              shopDoc.products[pidx].inStock = shopDoc.products[pidx].stock > 0;
              await shopDoc.save();
            } else {
              // fallback to JSON file
              const shops = readShops();
              const sidx = shops.findIndex(s => s.id === Number(shopId));
              if (sidx !== -1) {
                shops[sidx].products = shops[sidx].products || [];
                const pidx2 = shops[sidx].products.findIndex(p => String(p.id) === String(pid));
                if (pidx2 !== -1) {
                  const prev = typeof shops[sidx].products[pidx2].stock !== 'undefined' ? Number(shops[sidx].products[pidx2].stock) : (shops[sidx].products[pidx2].inStock ? 1 : 0);
                  shops[sidx].products[pidx2].stock = Math.max(0, prev - Math.floor(qty));
                  shops[sidx].products[pidx2].inStock = shops[sidx].products[pidx2].stock > 0;
                  writeShops(shops);
                }
              }
            }
          } else {
            // fallback to JSON file
            const shops = readShops();
            const sidx = shops.findIndex(s => s.id === Number(shopId));
            if (sidx !== -1) {
              shops[sidx].products = shops[sidx].products || [];
              const pidx2 = shops[sidx].products.findIndex(p => String(p.id) === String(pid));
              if (pidx2 !== -1) {
                const prev = typeof shops[sidx].products[pidx2].stock !== 'undefined' ? Number(shops[sidx].products[pidx2].stock) : (shops[sidx].products[pidx2].inStock ? 1 : 0);
                shops[sidx].products[pidx2].stock = Math.max(0, prev - Math.floor(qty));
                shops[sidx].products[pidx2].inStock = shops[sidx].products[pidx2].stock > 0;
                writeShops(shops);
              }
            }
          }
        }
      }

      // All stock decremented successfully; now create the order document
      const customerId = orderBase.customer && orderBase.customer.username ? orderBase.customer.username : (orderBase.createdBy || 'guest');
      const orderDoc = await OrderModel.create({ ...orderBase, customerId, fingerprint: orderBase.__fingerprint || null, statusHistory: [{ status: 'pending', changedAt: new Date() }] });
      // create shop owner notification record
      try {
        const shop = await ShopModel.findOne({ legacyId: Number(shopId) }).lean().exec();
        if (shop && shop.owner && shop.owner.username) {
          await NotificationModel.create({
            recipientUserId: shop.owner.username,
            shopId: Number(shopId),
            type: 'new_order',
            orderId: orderId,
            message: `New order ${orderId} received`,
            isRead: false
          });
        }
        // Also store lightweight entry in shop.orders for legacy UI
        if (shop) {
          await ShopModel.updateOne({ legacyId: Number(shopId) }, { $push: { orders: { $each: [{ orderId, receivedAt: new Date().toISOString(), items, customer: orderBase.customer, total, status: 'new' }], $position: 0 } } }).exec();
        }
      } catch (e) {
        console.warn('Failed to create notification or update shop orders', e && e.message ? e.message : e);
      }
      // send notification emails (best-effort)
      try {
        const shop = await ShopModel.findOne({ legacyId: Number(shopId) }).lean().exec();
        const shopOwnerEmail = shop && shop.owner && shop.owner.email ? shop.owner.email : null;
        const shopOwnerName = shop && shop.owner && shop.owner.username ? shop.owner.username : null;
        if (shopOwnerEmail) await emailController.sendOrderEmails(orderDoc.toObject ? orderDoc.toObject() : orderDoc, shopOwnerEmail, shopOwnerName);
      } catch (e) {
        console.warn('Failed to send order emails', e && e.message ? e.message : e);
      }
      info('Order created (mongo)', { requestId: req.id, orderId, shopId, createdBy: orderBase.createdBy });
      return res.status(201).json({ message: 'Order created', adjustedItems: adjustments, order: orderDoc });
    }

    // Fallback to legacy JSON storage
    // Validate and decrement stock in legacy `shops.json` before persisting order
    const shops = readShops();
    const shopIdx = shops.findIndex(s => s.id === Number(shopId));
    if (shopIdx === -1) return res.status(404).json({ message: 'Shop not found' });
      // Validate availability and apply automatic capping where needed
      for (const it of items) {
        const pid = it.productId;
        const qty = Number(it.qty || it.quantity || 1);
        const pidx = (shops[shopIdx].products || []).findIndex(p => String(p.id) === String(pid));
        if (pidx === -1) continue; // product may not be listed, skip
        const prod = shops[shopIdx].products[pidx];
        const avail = typeof prod.stock !== 'undefined' ? Number(prod.stock) : (prod.inStock ? 1 : 0);
        if (avail <= 0) {
          adjustments.push({ productId: pid, name: prod.name || pid, requested: qty, available: 0 });
          it._adjustedQty = 0;
        } else if (avail < qty) {
          adjustments.push({ productId: pid, name: prod.name || pid, requested: qty, available: avail });
          it._adjustedQty = avail;
        }
      }
      // Apply adjustments: set qty fields or remove zero-qty items
      for (let i = items.length - 1; i >= 0; i--) {
        const it = items[i];
        if (typeof it._adjustedQty !== 'undefined') {
          const newQty = Math.floor(Number(it._adjustedQty || 0));
          if (newQty <= 0) {
            items.splice(i, 1);
          } else {
            it.qty = newQty;
            it.quantity = newQty;
          }
          delete it._adjustedQty;
        }
      }

    // Decrement stock
    if (!items || items.length === 0) return res.status(400).json({ message: 'All requested items are out of stock', adjustedItems: adjustments });
    for (const it of items) {
      const pid = it.productId;
      const qty = Number(it.qty || it.quantity || 1);
      const pidx = (shops[shopIdx].products || []).findIndex(p => String(p.id) === String(pid));
      if (pidx === -1) continue;
      const prod = shops[shopIdx].products[pidx];
      const prev = typeof prod.stock !== 'undefined' ? Number(prod.stock) : (prod.inStock ? 1 : 0);
      shops[shopIdx].products[pidx].stock = Math.max(0, prev - Math.floor(qty));
      shops[shopIdx].products[pidx].inStock = shops[shopIdx].products[pidx].stock > 0;
    }

    // Persist updated shops and orders
    if (!writeShops(shops)) return res.status(500).json({ message: 'Failed to persist shop stock changes' });
    // Legacy JSON storage: avoid duplicates by checking the computed fingerprint
    const orders = readOrders();
    try {
      const fp = orderBase.__fingerprint;
      if (fp) {
        const recent = orders.find(o => o && o.fingerprint === fp && ((Date.now() - (new Date(o.createdAt).getTime())) <= (30 * 1000)));
        if (recent) return res.status(200).json({ message: 'Duplicate order detected; returning existing order', order: recent });
      }
    } catch (e) {
      // ignore fingerprint lookup errors
    }

    const order = { ...orderBase, fingerprint: orderBase.__fingerprint || null };
    orders.unshift(order);
    if (!writeOrders(orders)) return res.status(500).json({ message: 'Failed to persist order' });

    try {
      if (shopIdx !== -1) {
        shops[shopIdx].orders = shops[shopIdx].orders || [];
        shops[shopIdx].orders.unshift({ orderId, receivedAt: new Date().toISOString(), items, customer: order.customer, total, status: 'new' });
        writeShops(shops);
      }
    } catch (err) {
      console.warn('Failed to add legacy shop order record:', err && err.message ? err.message : err);
    }

    // attempt to send emails (best-effort)
    try {
      const shop = shops[shopIdx];
      const shopOwnerEmail = shop && shop.owner && shop.owner.email ? shop.owner.email : null;
      const shopOwnerName = shop && shop.owner && shop.owner.username ? shop.owner.username : null;
      if (shopOwnerEmail) await emailController.sendOrderEmails(order, shopOwnerEmail, shopOwnerName);
    } catch (e) {
      console.warn('Failed to send legacy order emails', e && e.message ? e.message : e);
    }
    info('Order created (legacy)', { requestId: req.id, orderId, shopId, createdBy: order.createdBy });
    return res.status(201).json({ message: 'Order created', adjustedItems: adjustments, order });
  } catch (err) {
    console.error('POST /api/orders error', err && err.message ? err.message : err);
    return res.status(500).json({ message: 'Failed to create order' });
  }
});

// GET /api/orders/my - customer order history (authenticated)
app.get('/api/orders/my', requireAuth, async (req, res) => {
  try {
    const user = req.user;
    if (!user || !user.username) return res.status(401).json({ message: 'Not authenticated' });
    // If Mongo connected, query orders by customer.username
    if (mongoose.connection && mongoose.connection.readyState === 1) {
      const orders = await OrderModel.find({ 'customer.username': user.username }).lean().exec();
      return res.json(orders || []);
    }
    // fallback to JSON file
    const orders = readOrders();
    const my = orders.filter(o => (o.customer && o.customer.username && o.customer.username === user.username) || (o.createdBy && o.createdBy === user.username));
    return res.json(my || []);
  } catch (err) {
    console.error('GET /api/orders/my error', err && err.message ? err.message : err);
    return res.status(500).json({ message: 'Failed to read orders' });
  }
});

// PATCH /api/orders/:id/status - update order status (shop owners / admin)
app.patch('/api/orders/:id/status', requireAuth, validate(schemas.orderStatusUpdate), async (req, res) => {
  const orderId = req.params.id;
  const { status } = req.body || {};
  if (!status) return res.status(400).json({ message: 'Missing status in request body' });

  // Normalize some incoming status aliases: 'new' -> 'pending'
  const normalizedStatus = (s => {
    if (!s) return s;
    if (s === 'new') return 'pending';
    return s;
  })(status);

  // Allowed transitions (include 'picked_up' as a first-class status)
  const allowedNext = {
    pending: ['confirmed', 'cancelled'],
    confirmed: ['delivered', 'picked_up', 'cancelled'],
    picked_up: [],
    delivered: [],
    cancelled: []
  };

  try {
    // Prefer Mongo storage
    if (mongoose.connection && mongoose.connection.readyState === 1) {
      const order = await OrderModel.findOne({ id: orderId }).exec();
      if (!order) return res.status(404).json({ message: 'Order not found' });
      // Ensure requester owns the shop for this order or is admin
      const shop = await ShopModel.findOne({ legacyId: Number(order.shopId) }).lean().exec();
      const requester = req.user;
      // Admins are not allowed to mutate orders
      if (requester && requester.role === 'admin') return res.status(403).json({ message: 'Admins are read-only' });
      const isOwner = requester && requester.role === 'shop_owner' && (Number(requester.shopId) === Number(order.shopId) || (shop && shop.owner && shop.owner.username === requester.username));
      if (!isOwner) return res.status(403).json({ message: 'Forbidden' });

      const current = String(order.status || 'pending');
      if (!Object.prototype.hasOwnProperty.call(allowedNext, current)) return res.status(400).json({ message: 'Invalid current order status' });
      if (!allowedNext[current].includes(normalizedStatus)) return res.status(400).json({ message: `Invalid status transition from ${current} to ${normalizedStatus}` });

      order.status = normalizedStatus;
      order.statusHistory = order.statusHistory || [];
      order.statusHistory.push({ status: normalizedStatus, changedAt: new Date() });
      // If order is marked delivered, record payment as paid (cash on delivery completed)
      try {
        // If order is marked delivered, record payment as paid (cash on delivery completed)
        // Also treat `confirmed` as payment completed for non-cash methods (e.g., online payments)
        if (normalizedStatus === 'delivered' || (normalizedStatus === 'confirmed' && order.paymentMethod && order.paymentMethod !== 'cash_on_delivery')) {
          order.paymentStatus = 'paid'; // WHY: reflect that payment has been received for the order
        }
      } catch (e) { /* ignore */ }
      await order.save();

      // create notification for customer and shop owner
      try {
        // notify customer about status change
        const customerId = (order.customer && (order.customer.username || order.customerId)) || order.customerId || order.customer?.email || null;
        if (customerId) {
          const typeMap = { confirmed: 'order_confirmed', delivered: 'order_delivered', cancelled: 'order_cancelled' };
          const ntype = typeMap[normalizedStatus] || 'order_confirmed';
          await NotificationModel.create({
            recipientUserId: customerId,
            shopId: Number(order.shopId),
            type: ntype,
            orderId: orderId,
            message: `Your order ${orderId} status is now ${normalizedStatus}`,
            isRead: false
          });
        }
        // Send status update email (best-effort) for confirmed or cancelled
        if (['confirmed', 'cancelled'].includes(normalizedStatus)) {
          try { await emailController.sendOrderStatusEmail(order.toObject ? order.toObject() : order, normalizedStatus); } catch (e) { console.warn('Failed to send order status email', e && e.message ? e.message : e); }
        }
      } catch (e) {
        console.warn('Failed to create notification', e && e.message ? e.message : e);
      }

      return res.json({ message: 'Order status updated', order: order.toObject() });
    }

    // Legacy JSON path: find in shops.json
    const shops = readShops();
    const shopIdx = shops.findIndex(s => (s.orders || []).some(o => String(o.orderId) === String(orderId)));
    if (shopIdx === -1) return res.status(404).json({ message: 'Order not found' });
    const shop = shops[shopIdx];
    const ordIdx = shop.orders.findIndex(o => String(o.orderId) === String(orderId));
    if (ordIdx === -1) return res.status(404).json({ message: 'Order not found' });

    const requester = req.user;
    if (requester && requester.role === 'admin') return res.status(403).json({ message: 'Admins are read-only' });
    const isOwner = requester && requester.role === 'shop_owner' && Number(requester.shopId) === Number(shop.id);
    if (!isOwner) return res.status(403).json({ message: 'Forbidden' });

    const current = String(shop.orders[ordIdx].status || 'new');
    // Map legacy statuses to allowedNext mapping base (preserve picked_up)
    const legacyToBase = { new: 'pending', confirmed: 'confirmed', delivered: 'delivered', picked_up: 'picked_up', cancelled: 'cancelled' };
    const baseCurrent = legacyToBase[current] || 'pending';
    if (!allowedNext[baseCurrent].includes(normalizedStatus)) return res.status(400).json({ message: `Invalid status transition from ${baseCurrent} to ${normalizedStatus}` });

    shop.orders[ordIdx].status = status === 'picked_up' ? 'picked_up' : normalizedStatus;
    shop.orders[ordIdx].updatedAt = new Date().toISOString();
    // Also update central orders.json for legacy path so customers see the updated status
    try {
      const orders = readOrders();
      let cidx = orders.findIndex(o => String(o.id) === String(orderId) || String(o.orderId) === String(orderId));
      if (cidx === -1) {
        // WHY: fallback - some flows create shop notifications with a different orderId
        // Attempt to match by shopId + total + timestamp proximity (within 2 minutes)
        const shopOrder = shop.orders[ordIdx] || {};
        const targetTotal = Number(shopOrder.total || 0);
        const targetShopId = Number(shop.id || shopOrder.shopId || shopId);
        const targetTime = new Date(shopOrder.receivedAt || shopOrder.createdAt || shopOrder.updatedAt || Date.now()).getTime();
        cidx = orders.findIndex(o => {
          try {
            const oShopId = Number(o.shopId || o.shop?.id || o.shopId || 0);
            const oTotal = Number(o.total || 0);
            const oTime = new Date(o.createdAt || o.receivedAt || o.updatedAt || 0).getTime();
            return oShopId === targetShopId && oTotal === targetTotal && Math.abs(oTime - targetTime) <= (2 * 60 * 1000);
          } catch (e) { return false; }
        });
      }
      if (cidx !== -1) {
        orders[cidx].status = shop.orders[ordIdx].status; // WHY: keep central order status in sync
        orders[cidx].updatedAt = shop.orders[ordIdx].updatedAt; // WHY: reflect latest update timestamp
        writeOrders(orders);
      }
    } catch (e) { /* ignore */ }
    // mark payment status as paid when delivered
    // Also mark as paid when shop 'confirms' the order for non-cash payment methods
    let shouldMarkPaidLegacy = false;
    if (normalizedStatus === 'delivered') {
      shouldMarkPaidLegacy = true;
    } else if (normalizedStatus === 'confirmed') {
      // Attempt to infer payment method from legacy central orders.json or the shop order entry
      try {
        const orders = readOrders();
        const cidx = orders.findIndex(o => String(o.id) === String(orderId) || String(o.orderId) === String(orderId));
        const centralPm = cidx !== -1 ? (orders[cidx].paymentMethod || null) : null;
        const localPm = shop.orders[ordIdx] && shop.orders[ordIdx].paymentMethod ? shop.orders[ordIdx].paymentMethod : null;
        const pm = localPm || centralPm || 'cash_on_delivery';
        if (pm && pm !== 'cash_on_delivery') {
          shouldMarkPaidLegacy = true; // WHY: online payments are considered completed when shop confirms the order
        }
      } catch (e) { /* ignore */ }
    }

    if (shouldMarkPaidLegacy) {
      try { shop.orders[ordIdx].paymentStatus = 'paid'; } catch (e) { /* ignore */ }
      // also update central orders.json paymentStatus if present
      try {
        const orders = readOrders();
        let cidx = orders.findIndex(o => String(o.id) === String(orderId) || String(o.orderId) === String(orderId));
        if (cidx === -1) {
          // WHY: fallback - try matching central order by shopId+total+time when id differs
          const shopOrder = shop.orders[ordIdx] || {};
          const targetTotal = Number(shopOrder.total || 0);
          const targetShopId = Number(shop.id || shopOrder.shopId || shopId);
          const targetTime = new Date(shopOrder.receivedAt || shopOrder.createdAt || shopOrder.updatedAt || Date.now()).getTime();
          cidx = orders.findIndex(o => {
            try {
              const oShopId = Number(o.shopId || o.shop?.id || o.shopId || 0);
              const oTotal = Number(o.total || 0);
              const oTime = new Date(o.createdAt || o.receivedAt || o.updatedAt || 0).getTime();
              return oShopId === targetShopId && oTotal === targetTotal && Math.abs(oTime - targetTime) <= (2 * 60 * 1000);
            } catch (e) { return false; }
          });
        }
        if (cidx !== -1) {
          orders[cidx].paymentStatus = 'paid'; // WHY: mark central record paid for customer visibility
          writeOrders(orders);
        }
      } catch (e) { /* ignore */ }
    }
    if (!writeShops(shops)) return res.status(500).json({ message: 'Failed to persist order status' });

    // create notification in Mongo if available
    try {
      if (mongoose.connection && mongoose.connection.readyState === 1) {
        // best-effort: if customer info exists in the shop order entry, notify them
        const cust = shop.orders[ordIdx] && (shop.orders[ordIdx].customer?.username || shop.orders[ordIdx].customer?.email);
        const typeMap = { confirmed: 'order_confirmed', delivered: 'order_delivered', cancelled: 'order_cancelled' };
        const ntype = typeMap[normalizedStatus] || 'order_confirmed';
        if (cust) {
          await NotificationModel.create({ recipientUserId: cust, shopId: Number(shop.id), type: ntype, orderId, message: `Your order ${orderId} status is now ${status}`, isRead: false });
        }
      }
    } catch (e) {
      console.warn('Failed to create notification (legacy path)', e && e.message ? e.message : e);
    }

    info('Order status updated (legacy)', { requestId: req.id, shopId: shop.id, orderId, status });
    return res.json({ message: 'Order status updated', order: shop.orders[ordIdx] });
  } catch (err) {
    console.error('PATCH /api/orders/:id/status error', err && err.message ? err.message : err);
    return res.status(500).json({ message: 'Failed to update order status' });
  }
});

// POST /api/orders/:id/payment/confirm - mark an order as paid (shop owner confirms receipt)
app.post('/api/orders/:id/payment/confirm', requireAuth, async (req, res) => { // WHY: new endpoint so shop owners can explicitly mark payment received, separate from status transitions
  const orderId = req.params.id; // WHY: use path param to identify the order to update
  try {
    // Prefer Mongo storage when available
    if (mongoose.connection && mongoose.connection.readyState === 1) { // WHY: operate on Mongo orders when DB connected
      let order = await OrderModel.findOne({ id: orderId }).exec(); // WHY: try to find order by legacy `id` field in Mongo
      if (!order) order = await OrderModel.findOne({ orderId: orderId }).exec(); // WHY: fallback to `orderId` field if present
      if (!order) return res.status(404).json({ message: 'Order not found' }); // WHY: short-circuit if order is missing

      // Verify requester is authorized (shop owner for the shop)
      const shop = await ShopModel.findOne({ legacyId: Number(order.shopId) }).lean().exec(); // WHY: fetch shop to validate ownership
      const requester = req.user; // WHY: requester payload set by `requireAuth` middleware
      // Admins are read-only
      if (requester && requester.role === 'admin') return res.status(403).json({ message: 'Admins are read-only' });
      const isOwner = requester && requester.role === 'shop_owner' && (Number(requester.shopId) === Number(order.shopId) || (shop && shop.owner && shop.owner.username === requester.username)); // WHY: shop owners must own the shop for this order
      if (!isOwner) return res.status(403).json({ message: 'Forbidden' }); // WHY: prevent unauthorized payment confirmation

      // Apply payment confirmation updates in Mongo
      const nowIso = new Date().toISOString();
      order.paymentStatus = 'paid'; // record canonical payment state in the order document
      order.payment = order.payment || {}; // ensure `payment` object exists for storing metadata
      order.payment.paidAt = nowIso; // timestamp when payment was recorded
      await order.save(); // persist changes to MongoDB

      // Best-effort: mark related orders from the same checkout as paid too
      try {
        const createdAtTs = new Date(order.createdAt || order.createdAt);
        const windowMs = 2 * 60 * 1000; // 2 minutes
        const from = new Date(createdAtTs.getTime() - windowMs);
        const to = new Date(createdAtTs.getTime() + windowMs);
        if (order.customerId) {
          await OrderModel.updateMany({
            _id: { $ne: order._id },
            customerId: order.customerId,
            paymentStatus: { $ne: 'paid' },
            createdAt: { $gte: from, $lte: to }
          }, { $set: { paymentStatus: 'paid', 'payment.paidAt': nowIso } }).exec();
        }
      } catch (e) {
        console.warn('Failed to mark related orders paid in Mongo:', e && e.message ? e.message : e);
      }

      return res.json({ message: 'Payment confirmed', order: order.toObject() }); // return updated order for client consumption
    }

    // Legacy JSON fallback: update central orders.json and the shop's orders entry
    const orders = readOrders(); // WHY: read legacy orders store
    let idx = orders.findIndex(o => String(o.id) === String(orderId) || String(o.orderId) === String(orderId)); // WHY: attempt direct id match first
    if (idx === -1) {
      // WHY: fallback matching - try shopId + total + timestamp proximity (helps when shop notifications use different ids)
      const shops = readShops(); // WHY: we will use shops data to help match the order
      let found = null; // WHY: placeholder for matched central order index
      for (const s of shops) { // WHY: iterate shops to find candidate shop orders
        const cand = (s.orders || []).find(o => String(o.orderId) === String(orderId)); // WHY: check if shop already has an entry with this orderId
        if (cand) {
          // If shop has the entry, try to find matching central order by shopId+total+time
          const targetTotal = Number(cand.total || 0); // WHY: numeric total to compare
          const targetShopId = Number(s.id || 0); // WHY: shop id to compare
          const targetTime = new Date(cand.receivedAt || cand.createdAt || cand.updatedAt || Date.now()).getTime(); // WHY: timestamp for proximity
          idx = orders.findIndex(o => {
            try {
              const oShopId = Number(o.shopId || 0); // WHY: central record's shopId
              const oTotal = Number(o.total || 0); // WHY: central record's total
              const oTime = new Date(o.createdAt || o.receivedAt || o.updatedAt || 0).getTime(); // WHY: central record time
              return oShopId === targetShopId && oTotal === targetTotal && Math.abs(oTime - targetTime) <= (2 * 60 * 1000); // WHY: match if within 2 minutes
            } catch (e) { return false; }
          });
        }
        if (idx !== -1) { found = idx; break; } // WHY: stop when a match is found
      }
      if (found !== null) idx = found; // WHY: ensure idx is set from found match
    }

    // Update central orders.json if found
    if (idx !== -1) {
      orders[idx].paymentStatus = 'paid'; // WHY: mark central record as paid for customer visibility
      orders[idx].payment = orders[idx].payment || {}; // WHY: ensure payment object exists
      orders[idx].payment.paidAt = new Date().toISOString(); // WHY: record paid timestamp
      writeOrders(orders); // WHY: persist central orders.json changes
    }

    // Update shop's orders entry in shops.json when present
    try {
      const shops = readShops(); // WHY: load shops to update the in-shop notification record
      let shopIdx = shops.findIndex(s => (s.orders || []).some(o => String(o.orderId) === String(orderId))); // WHY: find shop that has an order with matching orderId
      if (shopIdx === -1) {
        // fallback: match by shopId present in central order (if we found central order)
        if (idx !== -1 && orders[idx] && orders[idx].shopId) shopIdx = shops.findIndex(s => Number(s.id) === Number(orders[idx].shopId)); // WHY: try to find shop by central order shopId
      }
      if (shopIdx !== -1) {
        const ordIdx = shops[shopIdx].orders.findIndex(o => String(o.orderId) === String(orderId)); // WHY: index of shop order entry
        if (ordIdx !== -1) {
          shops[shopIdx].orders[ordIdx].paymentStatus = 'paid'; // WHY: mark shop-level order notification as paid
          shops[shopIdx].orders[ordIdx].payment = shops[shopIdx].orders[ordIdx].payment || {}; // WHY: ensure payment object exists
          shops[shopIdx].orders[ordIdx].payment.paidAt = new Date().toISOString(); // WHY: record timestamp for shop notification
          writeShops(shops); // WHY: persist change to shops.json
        }
      }
    } catch (e) { /* ignore non-fatal legacy write errors */ }

    // Return a best-effort response including central order if available
    return res.json({ message: 'Payment confirmed', order: (idx !== -1 ? orders[idx] : null) }); // WHY: give caller feedback about the update
  } catch (err) {
    console.error('Payment confirm error:', err && err.message ? err.message : err); // WHY: log server error for debugging
    return res.status(500).json({ message: 'Failed to confirm payment' }); // WHY: return generic failure to client
  }
});

// DELETE /api/orders/:id - delete an order (admin, shop owner for the shop, or the customer who placed it)
app.delete('/api/orders/:id', requireAuth, async (req, res) => {
  const id = req.params.id;
  try {
    // Prefer Mongo deletion when available
    if (mongoose.connection && mongoose.connection.readyState === 1) {
      // Find order by possible id fields
      let order = null;
      try { order = await OrderModel.findById(id).exec(); } catch (e) { /* ignore */ }
      if (!order) order = await OrderModel.findOne({ $or: [{ orderId: id }, { id: id }] }).exec();
      if (!order) return res.status(404).json({ message: 'Order not found' });

      const requester = req.user;
      // Admins are not allowed to delete orders
      if (requester && requester.role === 'admin') return res.status(403).json({ message: 'Admins are read-only' });
      const isCustomer = requester && requester.role === 'customer' && requester.username && (
        String(order.customerId) === String(requester.username) || String(order.customer?.username) === String(requester.username)
      );
      let isOwner = false;
      if (requester && requester.role === 'shop_owner') {
        try {
          const shop = await ShopModel.findOne({ $or: [{ legacyId: Number(order.shopId) }, { _id: order.shopId }] }).lean().exec();
          if (shop && shop.owner && shop.owner.username === requester.username) isOwner = true;
        } catch (e) {
          // ignore
        }
      }

      if (!isOwner && !isCustomer) return res.status(403).json({ message: 'Forbidden' });

      await OrderModel.deleteOne({ _id: order._id }).exec();
      return res.json({ message: 'Order deleted' });
    }

    // Legacy JSON fallback: remove from orders.json
    const orders = readOrders();
    const ord = orders.find(o => String(o.id || o.orderId || o._id) === String(id));
    if (!ord) return res.status(404).json({ message: 'Order not found' });
    const requesterLegacy = req.user;
    if (requesterLegacy && requesterLegacy.role === 'admin') return res.status(403).json({ message: 'Admins are read-only' });
    const isCustomerLegacy = requesterLegacy && requesterLegacy.role === 'customer' && requesterLegacy.username && (
      String(ord.customer?.username) === String(requesterLegacy.username) || String(ord.createdBy) === String(requesterLegacy.username)
    );
    let isOwnerLegacy = false;
    if (requesterLegacy && requesterLegacy.role === 'shop_owner') {
      const shops = readShops();
      const shop = shops.find(s => (s.orders || []).some(o => String(o.orderId) === String(id) || String(o.id) === String(id)));
      if (shop && ((shop.owner && shop.owner.username === requesterLegacy.username) || Number(requesterLegacy.shopId) === Number(shop.id))) isOwnerLegacy = true;
    }
    if (!isCustomerLegacy && !isOwnerLegacy) return res.status(403).json({ message: 'Forbidden' });
    const filtered = orders.filter(o => {
      const oid = o.id || o.orderId || o._id;
      return String(oid) !== String(id);
    });
    if (!writeOrders(filtered)) return res.status(500).json({ message: 'Failed to persist order deletion' });
    return res.json({ message: 'Order deleted' });
  } catch (e) {
    console.error('DELETE /api/orders/:id error', e && e.message ? e.message : e);
    return res.status(500).json({ message: 'Server error' });
  }
});

// --- Admin read-only order endpoints ---
// GET /api/admin/orders - list all orders with filters and pagination (admin only)
app.get('/api/admin/orders', requireAuth, async (req, res) => {
  try {
    const requester = req.user;
    if (!requester || requester.role !== 'admin') return res.status(403).json({ message: 'Forbidden' });

    const { status, shopId, startDate, endDate, page = 1, limit = 50, search, customerName, shopName } = req.query || {};
    const p = Math.max(1, Number(page) || 1);
    const l = Math.min(200, Math.max(1, Number(limit) || 50));
    const skip = (p - 1) * l;

    // Prefer Mongo when available
    if (mongoose.connection && mongoose.connection.readyState === 1) {
      if (req.query && (req.query.debugEcho === '1' || req.query.debugEcho === 'true')) return res.json({ query: req.query });
      const filter = {};
      if (status) filter.status = status;
      if (shopId) filter.shopId = Number(shopId);
      if (startDate || endDate) filter.createdAt = {};
      if (startDate) filter.createdAt.$gte = new Date(startDate);
      if (endDate) filter.createdAt.$lte = new Date(endDate);

      // Search support: generic `search` or specific `customerName` / `shopName` params
      const searchQuery = (search || customerName || '').trim();
      const shopNameQuery = (shopName || '').trim();
      if (searchQuery || shopNameQuery) {
        const escapeRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const or = [];
        if (searchQuery) {
          const esc = escapeRegex(searchQuery);
          const rx = new RegExp(esc, 'i');
          or.push({ 'customer.email': rx });
          or.push({ 'customer.username': rx });
          or.push({ 'customer.fullName': rx });
          or.push({ 'customer.name': rx });
          or.push({ orderId: rx });
          or.push({ id: rx });
        }
        if (shopNameQuery) {
          const esc2 = escapeRegex(shopNameQuery);
          const rx2 = new RegExp(esc2, 'i');
          const matchingShops = await ShopModel.find({ name: { $regex: rx2 } }).lean().exec();
          const legacyIds = (matchingShops || []).map(s => s.legacyId).filter(Boolean);
          if (legacyIds.length) or.push({ shopId: { $in: legacyIds } });
        }
        // also, if generic searchQuery, try matching shop names too
        if (searchQuery && !shopNameQuery) {
          const esc = escapeRegex(searchQuery);
          const rx = new RegExp(esc, 'i');
          const matchingShops2 = await ShopModel.find({ name: { $regex: rx } }).lean().exec();
          const legacyIds2 = (matchingShops2 || []).map(s => s.legacyId).filter(Boolean);
          if (legacyIds2.length) or.push({ shopId: { $in: legacyIds2 } });
        }
        if (or.length) filter.$or = or;
      }

      console.log('ADMIN ORDERS FILTER:', JSON.stringify(filter));
      try {
        const replacer = (k, v) => {
          if (v instanceof RegExp) return { __isRegExp: true, source: v.source, flags: v.flags };
          return v;
        };
        fs.appendFileSync('/tmp/admin_orders_filter.log', JSON.stringify({ ts: new Date().toISOString(), filter }, replacer) + '\n');
      } catch (e) { /* ignore */ }
      // If search/shopName provided, fetch all matching docs and apply in-memory filtering
      let docs = [];
      if (searchQuery || shopNameQuery) {
        docs = await OrderModel.find(filter).sort({ createdAt: -1 }).lean().exec();
        if (!docs || docs.length === 0) {
          docs = readOrders() || [];
        }
        // Build shop name map (Mongo) and legacy shops fallback
        const shopsAll = await ShopModel.find().lean().exec();
        const shopNameMap = (shopsAll || []).reduce((acc, s) => { if (s.legacyId) acc[s.legacyId] = s.name || ''; return acc; }, {});
        const legacyShops = readShops() || [];
        legacyShops.forEach(s => { if (s && (s.id || s.legacyId) && !shopNameMap[s.id]) shopNameMap[s.id] = s.name || ''; });
        // Build legacy orders map to enrich missing customer fields
        const legacyOrders = readOrders() || [];
        const legacyOrderMap = (legacyOrders || []).reduce((acc, o) => { const k = o.orderId || o.id || (o._id ? String(o._id) : undefined); if (k) acc[k] = o; return acc; }, {});
        const sq = (searchQuery || '').toLowerCase();
        const snq = (shopNameQuery || '').toLowerCase();
        const filtered = (docs || []).filter(o => {
          let ok = true;
          if (sq) {
            const cust = o.customer || {};
            const legacy = legacyOrderMap[o.orderId || o.id] || {};
            const combined = [cust.email || legacy.customer?.email, cust.fullName || legacy.customer?.fullName, cust.name || legacy.customer?.name, cust.username || legacy.customer?.username, o.orderId, o.id].filter(Boolean).join(' ').toLowerCase();
            const shopName = String(shopNameMap[o.shopId] || '').toLowerCase();
            if (!(combined.includes(sq) || shopName.includes(sq))) ok = false;
          }
          if (snq) {
            const shopName = String(shopNameMap[o.shopId] || '').toLowerCase();
            if (!shopName.includes(snq)) ok = false;
          }
          return ok;
        });

        const total = filtered.length;
        const pageSlice = filtered.slice(skip, skip + l);
        const shopIds = Array.from(new Set(pageSlice.map(d => Number(d.shopId)).filter(Boolean)));
        const shops = shopIds.length ? await ShopModel.find({ legacyId: { $in: shopIds } }).lean().exec() : [];
        const shopMap = (shops || []).reduce((acc, s) => { acc[s.legacyId] = s; return acc; }, {});

        const results = pageSlice.map(o => ({
          orderId: o.id || o.orderId || null,
          customer: { name: (o.customer && (o.customer.fullName || o.customer.name || o.customer.username)) || null, email: o.customer && o.customer.email ? o.customer.email : null },
          shop: { shopId: o.shopId || (o.shop && o.shop.id), name: (shopMap[o.shopId] || shopMap[o.shop?.id]) ? (shopMap[o.shopId] || shopMap[o.shop?.id]).name : null },
          items: o.items || [],
          total: o.total || null,
          status: o.status || null,
          paymentStatus: o.paymentStatus || (o.payment && o.payment.status) || null,
          createdAt: o.createdAt || o.receivedAt || null,
        }));

        // optional debug output
        if (req.query && (req.query.debugFilter === '1' || req.query.debugFilter === 'true')) {
          const replacer = (k, v) => { if (v instanceof RegExp) return { __isRegExp: true, source: v.source, flags: v.flags }; return v; };
          let debugFilter; try { debugFilter = JSON.parse(JSON.stringify(filter, replacer)); } catch (e) { debugFilter = { error: 'serialize_failed' }; }
          return res.json({ total, page: p, limit: l, orders: results, debugFilter });
        }

        return res.json({ total, page: p, limit: l, orders: results });
      }

      // No search/shopName provided — use DB pagination directly
      const docsPage = await OrderModel.find(filter).sort({ createdAt: -1 }).skip(skip).limit(l).lean().exec();
      const totalCount = await OrderModel.countDocuments(filter).exec();
      const shopIdsPage = Array.from(new Set((docsPage || []).map(d => Number(d.shopId)).filter(Boolean)));
      const pageShops = shopIdsPage.length ? await ShopModel.find({ legacyId: { $in: shopIdsPage } }).lean().exec() : [];
      const pageShopMap = (pageShops || []).reduce((acc, s) => { acc[s.legacyId] = s; return acc; }, {});
      const pageResults = (docsPage || []).map(o => ({
        orderId: o.id || o.orderId || null,
        customer: { name: (o.customer && (o.customer.fullName || o.customer.name || o.customer.username)) || null, email: o.customer && o.customer.email ? o.customer.email : null },
        shop: { shopId: o.shopId || (o.shop && o.shop.id), name: (pageShopMap[o.shopId] || pageShopMap[o.shop?.id]) ? (pageShopMap[o.shopId] || pageShopMap[o.shop?.id]).name : null },
        items: o.items || [],
        total: o.total || null,
        status: o.status || null,
        paymentStatus: o.paymentStatus || (o.payment && o.payment.status) || null,
        createdAt: o.createdAt || o.receivedAt || null,
      }));

      // optional debug output for paginated DB path
      if (req.query && (req.query.debugFilter === '1' || req.query.debugFilter === 'true')) {
        const replacer = (k, v) => { if (v instanceof RegExp) return { __isRegExp: true, source: v.source, flags: v.flags }; return v; };
        let debugFilter; try { debugFilter = JSON.parse(JSON.stringify(filter, replacer)); } catch (e) { debugFilter = { error: 'serialize_failed' }; }
        return res.json({ total: totalCount, page: p, limit: l, orders: pageResults, debugFilter });
      }

      return res.json({ total: totalCount, page: p, limit: l, orders: pageResults });
    }

    // Legacy JSON fallback
    let orders = readOrders() || [];
    if (status) orders = orders.filter(o => String(o.status) === String(status));
    if (shopId) orders = orders.filter(o => Number(o.shopId) === Number(shopId));
    if (startDate) orders = orders.filter(o => new Date(o.createdAt || o.receivedAt || o.updatedAt || 0) >= new Date(startDate));
    if (endDate) orders = orders.filter(o => new Date(o.createdAt || o.receivedAt || o.updatedAt || 0) <= new Date(endDate));

    const searchQueryLegacy = (req.query.search || req.query.customerName || '').trim();
    const shopNameQueryLegacy = (req.query.shopName || '').trim();
    const shops = readShops() || [];
    if (searchQueryLegacy) {
      const q = searchQueryLegacy.toLowerCase();
      orders = orders.filter(o => {
        const cust = o.customer || {};
        const byCust = (cust.email && String(cust.email).toLowerCase().includes(q)) || (cust.fullName && String(cust.fullName).toLowerCase().includes(q)) || (cust.name && String(cust.name).toLowerCase().includes(q)) || (cust.username && String(cust.username).toLowerCase().includes(q));
        const byOrder = String(o.orderId || o.id || o._id || '').toLowerCase().includes(q);
        return byCust || byOrder;
      });
      // also filter by shop name matches
      const matching = shops.filter(s => (s.name || '').toLowerCase().includes(q)).map(s => s.id || s.legacyId);
      if (matching.length) orders = orders.filter(o => matching.includes(o.shopId) || matching.includes(o.shop && o.shop.id));
    }
    if (shopNameQueryLegacy) {
      const q2 = shopNameQueryLegacy.toLowerCase();
      const matching2 = shops.filter(s => (s.name || '').toLowerCase().includes(q2)).map(s => s.id || s.legacyId);
      if (matching2.length) orders = orders.filter(o => matching2.includes(o.shopId) || matching2.includes(o.shop && o.shop.id));
    }
    const total = orders.length;
    const pageSlice = orders.slice(skip, skip + l);
    const shopsList = readShops() || [];
    const shopMap = (shopsList || []).reduce((acc, s) => { acc[s.id] = s; return acc; }, {});
    const results = pageSlice.map(o => ({
      orderId: o.id || o.orderId,
      customer: { name: (o.customer && (o.customer.fullName || o.customer.name || o.customer.username)) || null, email: o.customer && o.customer.email ? o.customer.email : null },
      shop: { shopId: o.shopId || (o.shop && o.shop.id), name: (shopMap[o.shopId] || shopMap[o.shop?.id]) ? (shopMap[o.shopId] || shopMap[o.shop?.id]).name : null },
      items: o.items || [],
      total: o.total || null,
      status: o.status || null,
      paymentStatus: o.paymentStatus || null,
      createdAt: o.createdAt || o.receivedAt || null,
    }));
    return res.json({ total, page: p, limit: l, orders: results });
  } catch (err) {
    console.error('GET /api/admin/orders error', err && err.message ? err.message : err);
    return res.status(500).json({ message: 'Server error' });
  }
});

// GET /api/admin/orders/:orderId - admin read-only order details
app.get('/api/admin/orders/:orderId', requireAuth, async (req, res) => {
  try {
    const requester = req.user;
    if (!requester || requester.role !== 'admin') return res.status(403).json({ message: 'Forbidden' });
    const oid = req.params.orderId;
    if (mongoose.connection && mongoose.connection.readyState === 1) {
      const order = await OrderModel.findOne({ $or: [{ id: oid }, { orderId: oid }, { _id: oid }] }).lean().exec();
      if (!order) return res.status(404).json({ message: 'Order not found' });
      return res.json(order);
    }
    const orders = readOrders() || [];
    const order = orders.find(o => String(o.id || o.orderId || o._id) === String(oid));
    if (!order) return res.status(404).json({ message: 'Order not found' });
    return res.json(order);
  } catch (err) {
    console.error('GET /api/admin/orders/:orderId error', err && err.message ? err.message : err);
    return res.status(500).json({ message: 'Server error' });
  }
});

// -------------------- Notifications API --------------------
// GET /api/notifications - fetch notifications for logged-in user
app.get('/api/notifications', requireAuth, async (req, res) => {
  try {
    const user = req.user;
    if (!user || !user.username) return res.status(401).json({ message: 'Not authenticated' });
    if (!mongoose.connection || mongoose.connection.readyState !== 1) {
      // If Mongo not available, return empty list (legacy fallback)
      return res.json([]);
    }
    const notes = await NotificationModel.find({ recipientUserId: user.username }).sort({ createdAt: -1 }).lean().exec();
    return res.json(notes || []);
  } catch (e) {
    console.error('GET /api/notifications error', e && e.message ? e.message : e);
    return res.status(500).json({ message: 'Server error' });
  }
});

// PATCH /api/notifications/:id/read - mark a notification as read
app.patch('/api/notifications/:id/read', requireAuth, async (req, res) => {
  try {
    const user = req.user;
    if (!user || !user.username) return res.status(401).json({ message: 'Not authenticated' });
    if (!mongoose.connection || mongoose.connection.readyState !== 1) return res.status(503).json({ message: 'MongoDB not connected' });
    const id = req.params.id;
    const note = await NotificationModel.findById(id).exec();
    if (!note) return res.status(404).json({ message: 'Notification not found' });
    if (String(note.recipientUserId) !== String(user.username)) return res.status(403).json({ message: 'Forbidden' });
    note.isRead = true;
    await note.save();
    return res.json({ success: true, notification: note.toObject() });
  } catch (e) {
    console.error('PATCH /api/notifications/:id/read error', e && e.message ? e.message : e);
    return res.status(500).json({ message: 'Server error' });
  }
});

// PUT /api/shops/:shopId/orders/:orderId - update order status for a shop notification
app.put('/api/shops/:shopId/orders/:orderId', authenticate, validate(schemas.orderStatusUpdate), (req, res) => {
  const shopId = parseInt(req.params.shopId, 10);
  const orderIdParam = req.params.orderId;
  const { status } = req.body;
  if (!status) return res.status(400).json({ message: 'Missing status in request body' });

  const shops = readShops();
  const shopIdx = shops.findIndex(s => s.id === shopId);
  if (shopIdx === -1) return res.status(404).json({ message: 'Shop not found' });

  const orders = shops[shopIdx].orders || [];
  const ordIdx = orders.findIndex(o => String(o.orderId) === String(orderIdParam));
  if (ordIdx === -1) return res.status(404).json({ message: 'Order not found' });

  // allow limited set of statuses for simple validation
  const allowed = ['new', 'confirmed', 'delivered', 'picked_up', 'cancelled'];
  if (!allowed.includes(status)) return res.status(400).json({ message: 'Invalid status value' });

  // Public: allow updating order status via this endpoint (suitable for notifications)

  // if status is being set to cancelled, either schedule deletion or remove immediately
  if (status === 'cancelled') {
    // update status first
    shops[shopIdx].orders[ordIdx] = {
      ...shops[shopIdx].orders[ordIdx],
      status,
      updatedAt: new Date().toISOString()
    };
    if (!writeShops(shops)) return res.status(500).json({ message: 'Failed to persist order status' });

    const delayMs = Math.max(0, CANCEL_DELETE_GRACE_SECONDS * 1000);
    if (delayMs > 0) {
      scheduleOrderDeletion(shopId, orderIdParam, delayMs);
      return res.json({ message: 'Order cancelled and scheduled for deletion', scheduledInSeconds: CANCEL_DELETE_GRACE_SECONDS, order: shops[shopIdx].orders[ordIdx] });
    }

    // no delay configured: delete immediately
    shops[shopIdx].orders = (shops[shopIdx].orders || []).filter(o => String(o.orderId) !== String(orderIdParam));
    if (!writeShops(shops)) return res.status(500).json({ message: 'Failed to persist order deletion' });
    return res.json({ message: 'Order cancelled and removed' });
  }

  // For non-cancel statuses: clear any pending scheduled deletion timer
  const key = `${shopId}:${orderIdParam}`;
  if (scheduledDeletionTimers.has(key)) {
    clearTimeout(scheduledDeletionTimers.get(key));
    scheduledDeletionTimers.delete(key);
  }

  shops[shopIdx].orders[ordIdx] = {
    ...shops[shopIdx].orders[ordIdx],
    status,
    updatedAt: new Date().toISOString()
  };

  if (!writeShops(shops)) return res.status(500).json({ message: 'Failed to persist order status' });
  info('Order status updated', { requestId: req.id, shopId, orderId: orderIdParam, status });
  res.json({ message: 'Order status updated', order: shops[shopIdx].orders[ordIdx] });
});

// DELETE /api/shops/:shopId/orders/:orderId - remove an order notification (manual delete)
app.delete('/api/shops/:shopId/orders/:orderId', authenticate, async (req, res) => {
  const shopId = parseInt(req.params.shopId, 10);
  const orderIdParam = req.params.orderId;
  // If MongoDB is connected, try deleting the order from the Orders collection first
  if (mongoose.connection && mongoose.connection.readyState === 1) {
    try {
      // Try matching by multiple possible id fields
      const deleted = await (async () => {
        // attempt by _id or by orderId/id fields
        let d = null;
        try { d = await OrderModel.findOneAndDelete({ _id: orderIdParam }).exec(); } catch (e) { /* ignore */ }
        if (d) return d;
        d = await OrderModel.findOneAndDelete({ $or: [{ orderId: orderIdParam }, { id: orderIdParam }] }).exec();
        return d;
      })();
      if (deleted) {
        // also clear any scheduled deletion timers using legacy key
        const key = `${shopId}:${orderIdParam}`;
        if (scheduledDeletionTimers.has(key)) {
          clearTimeout(scheduledDeletionTimers.get(key));
          scheduledDeletionTimers.delete(key);
        }
        return res.json({ message: 'Order deleted', order: deleted.toObject() });
      }
      // if not found in Mongo, fall through to legacy JSON deletion
    } catch (err) {
      console.error('Error deleting order from Mongo', err && err.message ? err.message : err);
      // fall back to JSON deletion
    }
  }

  const shops = readShops();
  const shopIdx = shops.findIndex(s => s.id === shopId);
  if (shopIdx === -1) return res.status(404).json({ message: 'Shop not found' });

  const before = (shops[shopIdx].orders || []).length;
  shops[shopIdx].orders = (shops[shopIdx].orders || []).filter(o => {
    // support legacy shapes: orderId, id, or _id
    const oid = o.orderId || o.id || o._id;
    return String(oid) !== String(orderIdParam);
  });
  const after = (shops[shopIdx].orders || []).length;
  if (before === after) return res.status(404).json({ message: 'Order not found' });

  // clear any scheduled deletion timer for this order
  const key = `${shopId}:${orderIdParam}`;
  if (scheduledDeletionTimers.has(key)) {
    clearTimeout(scheduledDeletionTimers.get(key));
    scheduledDeletionTimers.delete(key);
  }

  if (!writeShops(shops)) return res.status(500).json({ message: 'Failed to persist order deletion' });
  res.json({ message: 'Order deleted' });
});

// Run migration for owner passwords then start
migrateShopOwnerPasswords().finally(() => {
  app.listen(PORT, () => {
    info('Backend server listening', { port: PORT, env: process.env.NODE_ENV || app.get('env'), frontendOrigin: process.env.FRONTEND_ORIGIN ? true : false });
    console.log(`Backend server listening on port ${PORT}`);
  });
});

// Centralized error handler (must be after routes)
app.use((err, req, res, _next) => {
  // Respect status if the error set it
  const status = err && err.status && Number(err.status) ? Number(err.status) : 500;
  // Log error with stack for debugging (stack kept out of responses)
  try {
    logError('Unhandled error', { requestId: req && req.id ? req.id : undefined, message: err && err.message ? err.message : undefined, stack: err && err.stack ? err.stack : undefined });
  } catch (e) {
    console.error('Error logging failed', e && e.message ? e.message : e);
  }

  // Preserve expected client errors
  if (status === 400 || status === 401 || status === 403) {
    return res.status(status).json({ success: false, message: err.message || 'Request error' });
  }

  // Generic 500 safe response
  return res.status(500).json({ success: false, message: 'Internal server error', requestId: req && req.id ? req.id : undefined });
});

// Capture unhandled rejection / exceptions for better observability
process.on('unhandledRejection', (reason) => {
  logError('Unhandled Rejection', { reason: (reason && reason.stack) ? reason.stack : String(reason) });
});
process.on('uncaughtException', (err) => {
  logError('Uncaught Exception', { message: err && err.message, stack: err && err.stack });
  // In many production systems it's best to exit on uncaught exceptions after logging.
  // For this MVP we just log and allow the platform to restart if needed.
});



