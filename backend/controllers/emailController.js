import { sendVerificationEmail as sendVerification } from '../services/email.service.js';

export const sendVerificationEmail = async (userOrEmail, token) => {
  const to = (userOrEmail && userOrEmail.email) ? userOrEmail.email : String(userOrEmail);
  return await sendVerification(to, token);
};

export const sendOrderEmails = async (order, shopOwnerEmail, shopOwnerName) => {
  try {
    // For now reuse the resend-based service to notify owners/customers with a simple message.
    // Consider adding a generic `sendEmail` helper in services/email.service.js for richer emails.
    const ownerMsg = `New order ${order.id} received`;
    await sendVerification(shopOwnerEmail, ownerMsg);
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
