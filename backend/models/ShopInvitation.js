import mongoose from 'mongoose';

const ShopInvitationSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  token: { type: String, required: true, unique: true },
  expiresAt: { type: Date, required: true },
  used: { type: Boolean, default: false }
}, { timestamps: true });

// Index for token lookup and expiration
ShopInvitationSchema.index({ token: 1 });
ShopInvitationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export default mongoose.models.ShopInvitation || mongoose.model('ShopInvitation', ShopInvitationSchema);