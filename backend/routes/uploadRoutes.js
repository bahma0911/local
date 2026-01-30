import express from 'express';
import path from 'path';
import fs from 'fs';
import multer from 'multer';

const router = express.Router();

// Resolve uploads dir relative to project root
const PUBLIC_DIR = path.join(process.cwd(), 'public');
const UPLOADS_DIR = path.join(PUBLIC_DIR, 'uploads');
if (!fs.existsSync(PUBLIC_DIR)) fs.mkdirSync(PUBLIC_DIR);
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

// Accept common image mime types
const allowedMime = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/jpg'];

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, UPLOADS_DIR);
  },
  filename: function (req, file, cb) {
    const safe = Date.now() + '-' + file.originalname.replace(/[^a-z0-9.\-\_]/gi, '_');
    cb(null, safe);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: Number(process.env.UPLOAD_MAX_BYTES || 5 * 1024 * 1024) },
  fileFilter: (req, file, cb) => {
    if (allowedMime.includes(file.mimetype)) return cb(null, true);
    cb(new Error('Unsupported file type'));
  }
});

// POST / - handle single file upload with field name 'image'
router.post('/', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'No file uploaded' });
    // Return path under /uploads so frontend can fetch same-origin
    const filename = req.file.filename;
    const imageUrl = `/uploads/${filename}`;
    return res.status(200).json({ success: true, imageUrl });
  } catch (err) {
    console.error('uploadRoutes error:', err && err.message ? err.message : err);
    return res.status(500).json({ message: err && err.message ? err.message : 'Server error' });
  }
});

export default router;
