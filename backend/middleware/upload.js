import path from 'path';
import multer from 'multer';
import createCloudinaryStorage from 'multer-storage-cloudinary';
import cloudinary from '../config/cloudinary.js';

// Determine if Cloudinary is fully configured and usable (mirror logic in server.js)
const hasCloudinary = !!(
  cloudinary &&
  cloudinary.v2 &&
  cloudinary.v2.uploader &&
  typeof cloudinary.v2.uploader.upload === 'function' &&
  process.env.CLOUDINARY_CLOUD_NAME &&
  process.env.CLOUDINARY_API_KEY &&
  process.env.CLOUDINARY_API_SECRET
);

let storage;
if (hasCloudinary) {
  // Pass the v2 client which the storage adapter expects (it looks for `uploader` on the object)
  storage = createCloudinaryStorage({
    cloudinary: cloudinary.v2,
    folder: 'ecommerce-products',
    allowed_formats: ['jpg', 'png', 'jpeg', 'webp', 'gif'],
  });
} else {
  // Fallback to disk storage when Cloudinary is not configured so uploads still work locally
  const UPLOADS_DIR = path.join(process.cwd(), 'public', 'uploads');
  const diskStorage = multer.diskStorage({
    destination: function (req, file, cb) { cb(null, UPLOADS_DIR); },
    filename: function (req, file, cb) { const safe = Date.now() + '-' + file.originalname.replace(/[^a-z0-9.\-\_]/gi, '_'); cb(null, safe); }
  });
  storage = diskStorage;
}

const upload = multer({
  storage,
  limits: { fileSize: Number(process.env.UPLOAD_MAX_BYTES || 5 * 1024 * 1024) },
  fileFilter: (req, file, cb) => { const allowedMime = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/jpg']; if (allowedMime.includes(file.mimetype)) return cb(null, true); cb(new Error('Unsupported file type')); }
});

export default upload;
