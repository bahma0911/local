import dotenv from 'dotenv';
dotenv.config();

import * as cloudinaryPkg from 'cloudinary';
const cloudinary = cloudinaryPkg.v2;
import { PassThrough } from 'stream';

// Detect whether Cloudinary credentials are available
const hasCreds = Boolean(
  process.env.CLOUDINARY_URL || (
    process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET
  )
);

if (hasCreds) {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  });
}

// Export an object shaped like the cloudinary package so libraries expecting `cloudinary.v2` work
const noopV2 = {
  uploader: {
    upload: async () => Promise.reject(new Error('Cloudinary not configured')),
    upload_stream: (cb) => {
      const s = new PassThrough();
      process.nextTick(() => {
        const err = new Error('Cloudinary not configured');
        if (typeof cb === 'function') cb(err);
        s.emit('error', err);
      });
      return s;
    }
  },
  config: () => {}
};

const client = hasCreds ? { v2: cloudinary } : { v2: noopV2 };

export default client;
