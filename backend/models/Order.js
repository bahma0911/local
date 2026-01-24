import mongoose from 'mongoose';

const OrderItemSchema = new mongoose.Schema({
  // productId can be a legacy numeric id or a Mongo ObjectId string — allow mixed
  productId: { type: mongoose.Schema.Types.Mixed },
  name: { type: String },
  qty: { type: Number, default: 1 },
  price: { type: Number, default: 0 }
}, { _id: false });

const StatusHistorySchema = new mongoose.Schema({
  status: { type: String, required: true },
  changedAt: { type: Date, default: () => new Date() }
}, { _id: false });

const OrderSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true, index: true },
  shopId: { type: Number, required: true, index: true },
  fingerprint: { type: String, index: true },
  customerId: { type: String, required: true, index: true },
  items: { type: [OrderItemSchema], default: [] },
  total: { type: Number, default: 0 },
  paymentStatus: { type: String, enum: ['pending', 'paid'], default: 'pending' },
  paymentMethod: { type: String, default: 'cash_on_delivery' },
  status: { type: String, enum: ['pending', 'confirmed', 'picked_up', 'delivered', 'cancelled'], default: 'pending' },
  statusHistory: { type: [StatusHistorySchema], default: [{ status: 'pending', changedAt: new Date() }] },
  customer: { type: Object, default: {} },
  createdAt: { type: Date, default: () => new Date() }
}, { timestamps: true });

export default mongoose.models.Order || mongoose.model('Order', OrderSchema);
