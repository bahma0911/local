import mongoose from 'mongoose';

const ProductSchema = new mongoose.Schema({
  id: { type: Number },
  name: { type: String, required: true },
  price: { type: Number, required: true },
  image: { type: String },
  description: { type: String },
  inStock: { type: Boolean, default: true },
  rating: { type: Number, default: 0 },
  reviewCount: { type: Number, default: 0 }
}, { _id: false });

const OwnerSchema = new mongoose.Schema({
  username: { type: String },
  password: { type: String }
}, { _id: false });

const ShopSchema = new mongoose.Schema({
  legacyId: { type: Number, index: true, unique: true, sparse: true },
  name: { type: String, required: true },
  category: { type: String },
  address: { type: String },
  phone: { type: String },
  deliveryFee: { type: Number, default: 0 },
  deliveryServices: { type: [String], default: [] },
  owner: { type: OwnerSchema, default: {} },
  products: { type: [ProductSchema], default: [] },
  orders: { type: [Object], default: [] }
}, { timestamps: true });

export default mongoose.models.Shop || mongoose.model('Shop', ShopSchema);
