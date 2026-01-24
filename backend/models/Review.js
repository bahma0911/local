import mongoose from 'mongoose';

const ReviewSchema = new mongoose.Schema({
  // productId may be stored as ObjectId (modern) or string/number for legacy products
  productId: { type: mongoose.Schema.Types.Mixed, required: true, index: true },
  shopId: { type: mongoose.Schema.Types.ObjectId, required: false, index: true },
  userId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
  rating: { type: Number, required: true, min: 1, max: 5 },
  comment: { type: String, default: '' },
  verifiedPurchase: { type: Boolean, default: false },
  createdAt: { type: Date, default: () => new Date() }
}, { timestamps: true });

// Compound unique: one review per product per user
ReviewSchema.index({ productId: 1, userId: 1 }, { unique: true });
ReviewSchema.index({ productId: 1 });
ReviewSchema.index({ shopId: 1 });
ReviewSchema.index({ userId: 1 });

export default mongoose.models.Review || mongoose.model('Review', ReviewSchema);
