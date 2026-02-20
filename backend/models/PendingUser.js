import mongoose from 'mongoose';

const PendingUserSchema = new mongoose.Schema({
  email: { type: String, required: true, lowercase: true, trim: true, index: true },
  username: { type: String, required: false, trim: true, index: true },
  passwordHash: { type: String, required: false },
  verificationToken: { type: String, required: true, index: true },
  createdAt: { type: Date, default: () => new Date() },
  expiresAt: { type: Date, default: () => new Date(Date.now() + (15 * 60 * 1000)) } // 15 minutes
});

// TTL index to automatically remove expired pending registrations
PendingUserSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const PendingUser = mongoose.models.PendingUser || mongoose.model('PendingUser', PendingUserSchema);
export default PendingUser;
