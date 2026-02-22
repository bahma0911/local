import mongoose from 'mongoose';

const UserSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true, index: true, trim: true, lowercase: true },
  username: { type: String, required: true, unique: false, index: true, trim: true },
  password: { type: String, required: false }, // optional for OAuth users
  phone: { type: String, default: '' },
  address: { type: String, default: '' },
  city: { type: String, default: '' },
  name: { type: String, default: '' },
  googleId: { type: String, index: true, sparse: true },
  // Email verification: initially false until user verifies their email address
  emailVerified: { type: Boolean, default: false },
  // cryptographically-random token stored for verification; cleared after use
  verificationToken: { type: String, default: null },
  // expiration timestamp for the verification token (Date)
  verificationExpires: { type: Date, default: null },
  role: { type: String, enum: ['customer', 'admin', 'shop_owner'], default: 'customer' },
  joinDate: { type: Date, default: () => new Date() },
  createdAt: { type: Date, default: () => new Date() }
});

// Ensure model name is 'User' and reuse existing compiled model if present
export default mongoose.models.User || mongoose.model('User', UserSchema);
