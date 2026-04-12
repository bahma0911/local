import { sendVerificationEmail as sendVerification, sendOrderNotificationEmail, sendOrderConfirmationEmail, sendOrderStatusUpdateEmail } from '../services/email.service.js';

export const sendVerificationEmail = async (userOrEmail, token) => {
  const to = (userOrEmail && userOrEmail.email) ? userOrEmail.email : String(userOrEmail);
  return await sendVerification(to, token);
};

export const sendOrderEmails = async (order, shopOwnerEmail, shopOwnerName) => {
  try {
    const orderDetails = {
      orderId: order.id,
      customerName: order.customer?.fullName || order.customer?.username || 'Customer',
      total: order.total,
      items: order.items || []
    };

    if (shopOwnerEmail) {
      try {
        await sendOrderNotificationEmail(shopOwnerEmail, orderDetails);
      } catch (e) {
        console.error('Failed to send shop owner notification email', e && e.message ? e.message : e);
      }
    }

    const customerEmail = order.customer && (order.customer.email || order.customer.emailAddress || order.customer.username) || null;
    if (customerEmail) {
      try {
        await sendOrderConfirmationEmail(customerEmail, order.id, order.total);
      } catch (e) {
        console.error('Failed to send customer confirmation email', e && e.message ? e.message : e);
      }
    }

    return true;
  } catch (e) {
    console.error('sendOrderEmails unexpected error', e && e.message ? e.message : e);
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
