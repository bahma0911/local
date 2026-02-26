import axios from "axios";

// verifyCaptcha now supports Cloudflare Turnstile
export async function verifyCaptcha(token) {
  if (!token) return false;
  try {
    const response = await axios.post(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      null,
      {
        params: {
          secret: process.env.TURNSTILE_SECRET,
          response: token,
        },
      }
    );

    return !!(response && response.data && response.data.success);
  } catch (err) {
    console.error('verifyCaptcha error', err && err.message ? err.message : err);
    return false;
  }
}
