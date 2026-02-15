import fetch from 'node-fetch';
import crypto from 'crypto';

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const FRONTEND_URL = (process.env.FRONTEND_URL || '').replace(/\/+$/, '');
const FROM_EMAIL = process.env.RESEND_FROM || 'no-reply@negadras.local';

if (!RESEND_API_KEY) {
  console.warn('Warning: RESEND_API_KEY not set — emails will fail to send');
}

const sendEmail = async ({ to, subject, html }) => {
  if (!RESEND_API_KEY) {
    console.warn('sendEmail skipped — missing RESEND_API_KEY', { to, subject });
    return null;
  }
  try {
    const resp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${RESEND_API_KEY}`
      },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: Array.isArray(to) ? to : [to],
        subject,
        html
      })
    });
    if (!resp.ok) {
      const txt = await resp.text();
      console.warn('Resend API error', resp.status, txt);
      return null;
    }
    const data = await resp.json();
    return data;
  } catch (e) {
    console.error('sendEmail error', e && e.message ? e.message : e);
    return null;
  }
};

export const sendVerificationEmail = async (user, token) => {
  try {
    const link = `${FRONTEND_URL || ''}/verify-email?token=${encodeURIComponent(token)}`;
    // Always log the verification link to server console for easier local testing
    try { console.info('Verification link:', link); } catch (e) { /* ignore */ }
    const html = `
      <p>Hello ${user.name || user.username || ''},</p>
      <p>Thank you for creating an account. Please verify your email by clicking the link below:</p>
      <p><a href="${link}">Verify email</a></p>
      <p>If you did not sign up, you can ignore this message.</p>
    `;
    return await sendEmail({ to: user.email, subject: 'Please verify your email', html });
  } catch (e) {
    console.error('sendVerificationEmail error', e && e.message ? e.message : e);
    return null;
  }
};

export const sendOrderEmails = async (order, shopOwnerEmail, shopOwnerName) => {
  try {
    // send to shop owner
    const itemsHtml = (order.items || []).map(it => `<li>${it.name || it.title || it.productId} × ${it.qty || it.quantity || 1} — ${((it.price||0)*(it.qty||it.quantity||1)).toFixed ? ((it.price||0)*(it.qty||it.quantity||1)).toFixed(2) : (it.price||0)}</li>`).join('');
    const ownerHtml = `
      <p>Hello ${shopOwnerName || 'Shop Owner'},</p>
      <p>A new order <strong>${order.id}</strong> was received.</p>
      <p><strong>Customer:</strong> ${order.customer?.fullName || order.customer?.username || order.customer?.email || 'Guest'}</p>
      <p><strong>Phone:</strong> ${order.customer?.phone || ''}</p>
      <p><strong>Address:</strong> ${order.customer?.address || ''}</p>
      <p><strong>Items:</strong></p>
      <ul>${itemsHtml}</ul>
    `;
    await sendEmail({ to: shopOwnerEmail, subject: 'New Order Received', html: ownerHtml });

    // send to customer
    const customerEmail = order.customer && (order.customer.email || order.customer.emailAddress || order.customer.username) || null;
    if (customerEmail) {
      const custHtml = `
        <p>Hi ${order.customer?.fullName || ''},</p>
        <p>Thanks for your order <strong>${order.id}</strong>. Here is a summary:</p>
        <ul>${itemsHtml}</ul>
        <p>We will contact you soon.</p>
      `;
      await sendEmail({ to: customerEmail, subject: 'Order Confirmation', html: custHtml });
    }
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
    const html = `
      <p>Hi ${order.customer?.fullName || ''},</p>
      <p>Your order <strong>${order.id}</strong> status changed to <strong>${status}</strong>.</p>
      <p>If you have questions, please contact the shop.</p>
    `;
    return await sendEmail({ to: customerEmail, subject: `Order ${status}`, html });
  } catch (e) {
    console.error('sendOrderStatusEmail error', e && e.message ? e.message : e);
    return null;
  }
};
