import mongoose from 'mongoose';

const PriceSchema = new mongoose.Schema({
  amount: { type: Number, required: true },
  currency: { type: String, default: 'ETB' }
}, { _id: false });

const ProductSchema = new mongoose.Schema({
  name: { type: String, required: true },
  description: { type: String, default: '' },
  // Short description shown on listing/home pages
  details: { type: String, default: '' },
  price: { type: PriceSchema, required: true },
  images: { type: [String], default: [] },
  // Product condition: 'new' or 'used' (default to 'new')
  condition: { type: String, enum: ['new', 'used'], default: 'new' },
  // Contact info for the shop that created the product (optional)
  shopPhone: { type: String, default: '' },
  shopLocation: { type: String, default: '' },
  shopId: { type: mongoose.Schema.Types.ObjectId, ref: 'Shop', required: true },
  shopLegacyId: { type: Number },
  category: { type: String },
  stock: { type: Number, default: 0 },
  status: { type: String, enum: ['active', 'draft', 'archived'], default: 'draft' },
  attributes: { type: Map, of: String, default: {} }
}, { timestamps: true });

export default mongoose.models.Product || mongoose.model('Product', ProductSchema);
