import { sendVerificationEmail as sendVerification, sendOrderNotificationEmail } from '../services/email.service.js';

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
    if (customerEmail) await sendVerification(customerEmail, `Order ${order.id} confirmation`);
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
    await sendVerification(customerEmail, `Order ${order.id} status: ${status}`);
    return true;
  } catch (e) {
    console.error('sendOrderStatusEmail error', e && e.message ? e.message : e);
    return null;
  }
};
