import { Resend } from 'resend';

const API_KEY = process.env.RESEND_API_KEY;
const resend = API_KEY ? new Resend(API_KEY) : null;

const FRONTEND_URL = (process.env.FRONTEND_URL || 'https://www.bahma.com.et').replace(/\/+$/, '');
const FROM_EMAIL = process.env.RESEND_FROM || `no-reply@${(process.env.FRONTEND_URL || 'negadras.local').replace(/^https?:\/\//, '')}`;

async function sendVerificationEmail(toEmail, token) {
  if (!resend) {
    const err = new Error('RESEND_API_KEY not configured');
    err.code = 'NO_RESEND_KEY';
    throw err;
  }

  const link = `${FRONTEND_URL}/#/verify-email?token=${encodeURIComponent(token)}`;
  const html = `
    <p>Hello,</p>
    <p>Please verify your email by clicking the link below:</p>
    <p><a href="${link}">Verify email</a></p>
    <p>If you did not sign up, you can ignore this message.</p>
  `;

  try {
    const resp = await resend.emails.send({
      from: FROM_EMAIL,
      to: toEmail,
      subject: 'Please verify your email',
      html
    });
    return { ok: true, id: resp.id, resp };
  } catch (e) {
    // Surface useful info while keeping error opaque for callers
    const out = new Error('Failed to send verification email');
    out.cause = e;
    throw out;
  }
}

async function sendPasswordResetEmail(toEmail, token) {
  if (!resend) {
    const err = new Error('RESEND_API_KEY not configured');
    err.code = 'NO_RESEND_KEY';
    throw err;
  }

  const link = `${FRONTEND_URL}/#/forgot-password?token=${encodeURIComponent(token)}`;
  const html = `
    <p>Hello,</p>
    <p>You requested to reset your password. Click the link below to choose a new password:</p>
    <p><a href="${link}">Reset password</a></p>
    <p>If you didn't request this, you can safely ignore this message.</p>
  `;

  try {
    const resp = await resend.emails.send({
      from: FROM_EMAIL,
      to: toEmail,
      subject: 'Reset your password',
      html
    });
    return { ok: true, id: resp.id, resp };
  } catch (e) {
    const out = new Error('Failed to send password reset email');
    out.cause = e;
    throw out;
  }
}

async function sendOrderNotificationEmail(toEmail, orderDetails) {
  if (!resend) {
    const err = new Error('RESEND_API_KEY not configured');
    err.code = 'NO_RESEND_KEY';
    throw err;
  }

  const { orderId, customerName, total, items } = orderDetails;
  const itemsList = items.map(item => `${item.name} × ${item.quantity} - ${item.price * item.quantity} ETB`).join('<br>');
  
  const html = `
    <p>Hello,</p>
    <p>You have received a new order!</p>
    <p><strong>Order ID:</strong> ${orderId}</p>
    <p><strong>Customer:</strong> ${customerName}</p>
    <p><strong>Items:</strong><br>${itemsList}</p>
    <p><strong>Total:</strong> ${total} ETB</p>
    <p>Please log in to your dashboard to manage this order.</p>
  `;

  try {
    const resp = await resend.emails.send({
      from: FROM_EMAIL,
      to: toEmail,
      subject: 'New Order Received - Negadras Market',
      html
    });
    return { ok: true, id: resp.id, resp };
  } catch (e) {
    const out = new Error('Failed to send order notification email');
    out.cause = e;
    throw out;
  }
}

export default sendVerificationEmail;
export { sendVerificationEmail, sendPasswordResetEmail, sendOrderNotificationEmail };
