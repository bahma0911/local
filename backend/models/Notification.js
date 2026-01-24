import mongoose from 'mongoose';

// In-app notification model
const NotificationSchema = new mongoose.Schema({
  // Recipient user identifier (username or user id) used for lookup and authorization
  recipientUserId: { type: String, required: true, index: true },
  // Optional: which shop this notification is related to
  shopId: { type: Number, index: true },
  // Type of notification
  type: { type: String, enum: ['new_order', 'order_confirmed', 'order_delivered', 'order_cancelled'], required: true, index: true },
  // Reference to order id (string)
  orderId: { type: String, required: true, index: true },
  // Human readable message
  message: { type: String, required: true },
  // Read flag
  isRead: { type: Boolean, default: false, index: true },
  // Created time
  createdAt: { type: Date, default: () => new Date(), index: true }
}, { timestamps: true });

export default mongoose.models.Notification || mongoose.model('Notification', NotificationSchema);
