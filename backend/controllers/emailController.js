import { sendVerificationEmail as sendVerification, sendOrderNotificationEmail, sendOrderConfirmationEmail, sendOrderStatusUpdateEmail } from '../services/email.service.js';

export const sendVerificationEmail = async (userOrEmail, token) => {
  const to = (userOrEmail && userOrEmail.email) ? userOrEmail.email : String(userOrEmail);
  return await sendVerification(to, token);
};

export const sendOrderEmails = async (order, shopOwnerEmail, shopOwnerName) => {
  try {
    // Send notification email to shop owner
    const orderDetails = {
      orderId: order.id,
      customerName: order.customer?.fullName || order.customer?.username || 'Customer',
      total: order.total,
      items: order.items || []
    };
    await sendOrderNotificationEmail(shopOwnerEmail, orderDetails);
    
    // Send confirmation to customer
    const customerEmail = order.customer && (order.customer.email || order.customer.emailAddress || order.customer.username) || null;
    if (customerEmail) await sendOrderConfirmationEmail(customerEmail, order.id, order.total);
    return true;
  } catch (e) {
    console.error('sendOrderEmails error', e && e.message ? e.message : e);
    return false;
  }
};

export const sendOrderStatusEmail = async (order, status) => {
  try {
    const customerEmail = order.customer && (order.customer.email || order.customer.emailAddress || order.customer.username) || null;
    if (!customerEmail) return null;
    await sendOrderStatusUpdateEmail(customerEmail, order.id, status);
    return true;
  } catch (e) {
    console.error('sendOrderStatusEmail error', e && e.message ? e.message : e);
    return null;
  }
};
