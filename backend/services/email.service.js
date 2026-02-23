import { Resend } from 'resend';

const API_KEY = process.env.RESEND_API_KEY;
const resend = API_KEY ? new Resend(API_KEY) : null;

const FRONTEND_URL = (process.env.FRONTEND_URL || 'http://localhost:5173').replace(/\/+$/, '');
const FROM_EMAIL = process.env.RESEND_FROM || `no-reply@${(process.env.FRONTEND_URL || 'negadras.local').replace(/^https?:\/\//, '')}`;

async function sendVerificationEmail(toEmail, token) {
  if (!resend) {
    const err = new Error('RESEND_API_KEY not configured');
    err.code = 'NO_RESEND_KEY';
    throw err;
  }

  const link = `${FRONTEND_URL}/verify-email?token=${encodeURIComponent(token)}`;
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

export default sendVerificationEmail;
export { sendVerificationEmail };
