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
        const data = await apiFetch(`${API_BASE}/api/auth/complete-register`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token }),
        });
        if (!mounted) return;
        setStatus('success');
        setMessage('Email verified — signing you in. Redirecting...');
        setTimeout(() => navigate('/'), 1400);
      } catch (err) {
        setStatus('error');
        setMessage((err && err.response && err.response.message) ? err.response.message : 'Verification failed');
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
