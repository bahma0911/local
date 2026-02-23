import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { API_BASE } from '../utils/api';

const Register = () => {
  const navigate = useNavigate();
  const { register } = useAuth();
  const [form, setForm] = useState({ username: '', email: '', password: '' });
  const query = new URLSearchParams(window.location.search);
  const tokenFromQuery = query.get('token');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleChange = (e) => setForm(prev => ({ ...prev, [e.target.name]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    let res;
    if (tokenFromQuery) {
      // Complete two-step registration using token
      try {
        const data = await fetch(`${API_BASE}/api/auth/complete-register`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: tokenFromQuery, username: form.username, password: form.password, phone: '', address: '' }),
          credentials: 'include'
        });
        const payload = await data.json();
        if (!data.ok) {
          res = { ok: false, message: payload && payload.message ? payload.message : 'Registration failed' };
        } else {
          res = { ok: true, user: payload.user };
        }
      } catch (err) {
        res = { ok: false, message: 'Network error' };
      }
    } else {
      res = await register(form);
    }
    setLoading(false);
    if (res.ok) {
      // Inform user to check email for verification link/token
      if (res.fallback && res.link) {
        setError(null);
        alert('Verification link (dev fallback): ' + res.link);
        // support absolute or relative links returned by dev fallback
        try {
          const parsed = new URL(res.link, window.location.origin);
          const token = parsed.searchParams.get('token') || '';
          navigate('/verify-email?token=' + encodeURIComponent(token));
        } catch (e) {
          // fallback: try to extract token with simple regex
          const m = String(res.link).match(/[?&]token=([^&]+)/);
          const token = m ? decodeURIComponent(m[1]) : '';
          navigate('/verify-email?token=' + encodeURIComponent(token));
        }
        return;
      }
      setError('Check your email for a verification link');
    } else {
      setError(res.message || 'Registration failed');
    }
  };

  return (
    <div style={{ padding: '2rem' }}>
      <h2>Create an account</h2>
      <form onSubmit={handleSubmit} style={{ display: 'grid', gap: '0.5rem', maxWidth: 360 }}>
        <label>Username<input name="username" value={form.username} onChange={handleChange} required /></label>
        <label>Email<input name="email" type="email" value={form.email} onChange={handleChange} required /></label>
        <label>Password<input name="password" type="password" value={form.password} onChange={handleChange} required minLength={6} /></label>
        {error && <div style={{ color: 'red' }}>{error}</div>}
        <div>
          <button type="submit" disabled={loading}>{loading ? 'Creating...' : 'Create account'}</button>
          <button type="button" onClick={() => navigate('/login')} style={{ marginLeft: 8 }}>Back to login</button>
        </div>
      </form>
    </div>
  );
};

export default Register;
