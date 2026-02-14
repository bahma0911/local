import mongoose from 'mongoose';

const UserSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true, index: true, trim: true, lowercase: true },
  username: { type: String, required: true, unique: false, index: true, trim: true },
  password: { type: String, required: true }, // Plain value (no bcrypt) per your request
  phone: { type: String, default: '' },
  address: { type: String, default: '' },
  city: { type: String, default: '' },
  name: { type: String, default: '' },
  googleId: { type: String, index: true, sparse: true },
  role: { type: String, enum: ['customer', 'admin', 'shop_owner'], default: 'customer' },
  joinDate: { type: Date, default: () => new Date() },
  createdAt: { type: Date, default: () => new Date() }
});

// Ensure model name is 'User' and reuse existing compiled model if present
export default mongoose.models.User || mongoose.model('User', UserSchema);
