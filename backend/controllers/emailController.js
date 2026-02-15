import fetch from 'node-fetch';
import crypto from 'crypto';

const RESEND_API_KEY = process.env.RESEND_API_KEY;
// Default to localhost frontend in non-production so verification links are usable during local development
const _rawFrontend = (process.env.FRONTEND_URL && process.env.FRONTEND_URL.trim()) ? process.env.FRONTEND_URL : (process.env.NODE_ENV === 'production' ? '' : 'http://localhost:5173');
const FRONTEND_URL = (_rawFrontend || '').replace(/\/+$/, '');
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
      // Attempt to parse JSON body when possible for better diagnostics
      let body = null;
      try {
        const ct = resp.headers.get && resp.headers.get('content-type');
        if (ct && ct.includes('application/json')) body = await resp.json();
        else body = await resp.text();
      } catch (e) {
        try { body = await resp.text(); } catch (e2) { body = null; }
      }
      console.warn('Resend API error', resp.status, body);

      // Dev fallback: if Resend rejects because the sending domain isn't verified,
      // log the full email and return a harmless success marker so flows can continue locally.
      try {
        const messageText = (body && (body.message || body.error || body.detail)) ? String(body.message || body.error || body.detail).toLowerCase() : '';
        if (resp.status === 403 && messageText && (messageText.includes('domain') || messageText.includes('not verified') || messageText.includes('verification'))) {
          console.warn('Resend rejected sending due to domain verification. Using dev fallback: logging email instead of sending.');
          try { console.info('DEV EMAIL LOG — to:', to, 'subject:', subject, '\nhtml:\n', html); } catch (e) { /* ignore logging errors */ }
          return { fallback: true };
        }
      } catch (e) {
        // ignore fallback detection errors and continue to return null below
      }

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
