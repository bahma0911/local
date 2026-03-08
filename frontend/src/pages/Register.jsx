import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { API_BASE } from '../utils/api';
import './AdminLogin.css';

const Register = () => {
  const navigate = useNavigate();
  const { register } = useAuth();
  const [form, setForm] = useState({ username: '', email: '', password: '' });
  const [showPassword, setShowPassword] = useState(false);
  const query = new URLSearchParams(window.location.search);
  const tokenFromQuery = query.get('token');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [awaitingVerification, setAwaitingVerification] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const cooldownSeconds = 120; // 2 minutes

  React.useEffect(() => {
    let t = null;
    if (cooldown > 0) {
      t = setInterval(() => setCooldown(c => Math.max(0, c - 1)), 1000);
    }
    return () => { if (t) clearInterval(t); };
  }, [cooldown]);

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
      setAwaitingVerification(true);
      setCooldown(cooldownSeconds);
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

  const handleResend = async () => {
    if (!form.email) return setError('Please provide your email to resend');
    try {
      setError(null);
      const resp = await fetch(`${API_BASE}/api/auth/resend-register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: form.email }),
      });
      const data = await resp.json();
      if (!resp.ok) {
        setError(data && data.message ? data.message : 'Failed to resend');
        return;
      }
      setAwaitingVerification(true);
      setCooldown(cooldownSeconds);
      if (data && data.fallback && data.link) {
        alert('Verification link (dev fallback): ' + data.link);
      }
    } catch (e) {
      setError('Network error');
    }
  };

  return (
    <div className="admin-login-page">
      <div className="admin-login-container" style={{ padding: '2rem' }}>
        <h2 style={{ textAlign: 'center', marginBottom: '1rem', color: 'var(--text-primary)', fontSize: '1.8rem', fontFamily: 'var(--hx-font-heading)' }}>Create an account</h2>
        <form onSubmit={handleSubmit} style={{ display: 'grid', gap: '1rem', maxWidth: 'none' }}>
          <div className="form-group">
            <label className="form-label">Username</label>
            <input className="form-input" name="username" value={form.username} onChange={handleChange} required />
          </div>
          <div className="form-group">
            <label className="form-label">Email</label>
            <input className="form-input" name="email" type="email" value={form.email} onChange={handleChange} required />
          </div>
          <div className="form-group password-group">
            <label className="form-label">Password</label>
            <div className="password-input-container">
              <input
                className="form-input"
                name="password"
                type={showPassword ? 'text' : 'password'}
                value={form.password}
                onChange={handleChange}
                required
                minLength={6}
              />
              <button
                type="button"
                onClick={() => setShowPassword(p => !p)}
                className="password-toggle-btn"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? 'Hide' : 'Show'}
              </button>
            </div>
          </div>
          {error && <div className="error-message">{error}</div>}
          <div style={{ display: 'flex', gap: 8, marginTop: '1rem' }}>
            <button type="submit" className="login-btn" disabled={loading} style={{ flex: 1 }}>
              {loading ? 'Creating...' : 'Create account'}
            </button>
            <button type="button" className="secondary-btn" onClick={() => navigate('/login')} style={{ flex: 1 }}>
              Back to login
            </button>
          </div>
        </form>
        {awaitingVerification && (
          <div style={{ marginTop: 12, padding: '12px', background: 'var(--overlay-1)', borderRadius: 'var(--hx-radius-sm)', border: '1px solid var(--border-color)' }}>
            <div style={{ color: 'var(--text-primary)' }}>Verification email sent to <strong>{form.email}</strong>.</div>
            <button
              onClick={handleResend}
              disabled={cooldown > 0}
              className="secondary-btn"
              style={{ marginTop: 8, width: '100%' }}
            >
              {cooldown > 0 ? `Resend available in ${Math.floor(cooldown/60)}:${String(cooldown%60).padStart(2,'0')}` : 'Resend verification email'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default Register;
