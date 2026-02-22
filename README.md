# Nega
market


## Email Verification Flow

- Registration: when a user registers via `POST /api/register` the server:
	- hashes the password with `bcrypt`;
	- generates a cryptographically-random verification token with `crypto.randomBytes`;
	- sets `emailVerified: false`, stores `verificationToken` and `verificationExpires = now + 1 hour` on the user record;
	- saves the user and sends a verification email containing a link to:
		`https://www.bahma.com.et/verify-email?token=TOKEN` (or logs a dev fallback link if email sending is not configured).

- Verification: the verification link hits `GET /verify-email?token=TOKEN` (or `POST /api/auth/verify-email`):
	- server finds the user by `verificationToken` and verifies the token has not expired;
	- it sets `emailVerified = true` and clears `verificationToken` and `verificationExpires` to prevent reuse;
	- returns a success response.

- Login restriction: users with `emailVerified === false` are blocked from logging in; login returns `403` with message `Please verify your email before logging in`.

Running the test flow

- A convenience test script is provided at `backend/tests/auth.flow.test.js`.
- It performs: register → verify → login and logs each step.
- Run it with the backend running locally at `http://localhost:5000`:

```bash
# Optional: provide a MongoDB URI so the script can read the verification token direct from the DB
MONGODB_URI='mongodb://localhost:27017/negadras' node backend/tests/auth.flow.test.js
```

Notes:
- The test script expects Node 18+ (native fetch not required since it uses `axios`).
- Ensure `RESEND_API_KEY` and `RESEND_FROM` are configured in production if you want real email delivery; otherwise the server will log a dev fallback verification link.

