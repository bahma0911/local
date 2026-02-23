import React, { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import apiFetch from '../utils/apiFetch';
import { API_BASE } from '../utils/api';

const useQuery = () => {
  return new URLSearchParams(useLocation().search);
};

const VerifyEmail = () => {
  const query = useQuery();
  const token = query.get('token');
  const navigate = useNavigate();
  const [status, setStatus] = useState('verifying');
  const [message, setMessage] = useState('Verifying...');

  useEffect(() => {
    let mounted = true;
    (async () => {
      if (!token) {
        setStatus('error');
        setMessage('Missing verification token');
        return;
      }
      try {
        // First attempt: try to complete a pending two-step registration.
        // If the PendingUser stored a username and passwordHash, this will create the account.
        try {
          const complete = await apiFetch(`${API_BASE}/api/auth/complete-register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token }),
          });
          if (!mounted) return;
          setStatus('success');
          setMessage('Account created and verified — signing you in. Redirecting...');
          setTimeout(() => navigate('/'), 1400);
          return;
        } catch (errComplete) {
          // If complete-register failed because token not found, fall through to try verify-email.
          const msg = (errComplete && errComplete.response && errComplete.response.message) ? errComplete.response.message : '';
          // If error indicates missing username/password, redirect to register so user can finish.
          if (errComplete && (errComplete.status === 400 || /username required|Password required/i.test(msg))) {
            navigate('/register?token=' + encodeURIComponent(token));
            return;
          }
          // Otherwise, try verifying an existing User record.
        }

        const data = await apiFetch(`${API_BASE}/api/auth/verify-email`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token }),
        });
        if (!mounted) return;
        setStatus('success');
        setMessage('Email verified — signing you in. Redirecting...');
        setTimeout(() => navigate('/'), 1400);
      } catch (err) {
        const msg = (err && err.response && err.response.message) ? err.response.message : '';
        if (err && (err.status === 404 || /invalid token|not found/i.test(msg))) {
          navigate('/register?token=' + encodeURIComponent(token));
          return;
        }
        setStatus('error');
        setMessage(msg || 'Verification failed');
      }
    })();
    return () => { mounted = false; };
  }, [token, navigate]);

  return (
    <div style={{ padding: '2rem' }}>
      <h2>Email verification</h2>
      <p>{message}</p>
      {status === 'error' && <div><button onClick={() => navigate('/register')}>Back to register</button></div>}
    </div>
  );
};

export default VerifyEmail;
