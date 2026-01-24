import mongoose from 'mongoose';

const CartItemSchema = new mongoose.Schema({
  productId: { type: Number },
  name: { type: String },
  qty: { type: Number, default: 1 },
  price: { type: Number, default: 0 }
}, { _id: false });

const CartSchema = new mongoose.Schema({
  user: { type: String, required: true, index: true },
  items: { type: [CartItemSchema], default: [] },
  updatedAt: { type: Date, default: () => new Date() }
}, { timestamps: true });

export default mongoose.models.Cart || mongoose.model('Cart', CartSchema);
