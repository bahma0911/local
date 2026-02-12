import axios from "axios";

export async function verifyCaptcha(token) {
  if (!token) return false;
  try {
    const response = await axios.post(
      "https://www.google.com/recaptcha/api/siteverify",
      null,
      {
        params: {
          secret: process.env.RECAPTCHA_SECRET,
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
