import mongoose from 'mongoose';

const AdvertisementSchema = new mongoose.Schema({
  imageUrl: { type: String, required: true },
  link: { type: String, required: true },
  altText: { type: String, default: 'Advertisement' },
  isActive: { type: Boolean, default: true },
  createdBy: { type: String }, // admin username who created it
  clickCount: { type: Number, default: 0 },
  impressions: { type: Number, default: 0 }
}, { timestamps: true });

export default mongoose.models.Advertisement || mongoose.model('Advertisement', AdvertisementSchema);