import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import './AdminLogin.css';

const ForgotPassword = () => {
  const navigate = useNavigate();
  const { requestPasswordReset, resetPassword } = useAuth();
  const [step, setStep] = useState('email'); // email, sent, reset, done
  const [email, setEmail] = useState('');
  const [token, setToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const handleEmailSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await requestPasswordReset(email);
      if (res.ok) {
        setStep('sent');
        if (res.fallback && res.link) {
          alert('Reset link (dev fallback): ' + res.link);
        }
      } else {
        setError(res.message || 'Request failed');
      }
    } catch (err) {
      setError((err && err.message) ? err.message : 'Request failed');
    } finally {
      setLoading(false);
    }
  };

  const handleResetSubmit = async (e) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    if (!token) {
      setError('Missing reset token');
      return;
    }
    setError(null);
    setLoading(true);
    try {
      // Debug: log payload so we can confirm the token being sent
      try { console.debug('Reset submit payload', { token, newPassword }); } catch (e) { /* ignore */ }
      const res = await resetPassword({ token, newPassword });
      if (res.ok) {
        setStep('done');
      } else {
        setError(res.message || 'Reset failed');
      }
    } catch (err) {
      setError((err && err.message) ? err.message : 'Reset failed');
    } finally {
      setLoading(false);
    }
  };

  // determine token from query if present
  React.useEffect(() => {
    // Support both regular querystring (`/forgot-password?token=...`) and
    // hash-based routing used by the app (`/#/forgot-password?token=...`).
    const q = new URLSearchParams(window.location.search || '');
    let t = q.get('token');
    if (!t) {
      // window.location.hash may look like "#/forgot-password?token=..."
      const hash = window.location.hash || '';
      const idx = hash.indexOf('?');
      if (idx !== -1) {
        const hashQuery = hash.slice(idx + 1);
        const hq = new URLSearchParams(hashQuery);
        t = hq.get('token');
      }
    }

    if (t) {
      try {
        setToken(decodeURIComponent(t));
      } catch (e) {
        setToken(t);
      }
      setStep('reset');
    }
  }, []);

  return (
    <div className="admin-login-page">
      <div className="admin-login-container" style={{ padding: '1.5rem' }}>
        <h2 className="admin-login-title">Forgot Password</h2>

        {step === 'email' && (
          <form onSubmit={handleEmailSubmit} className="admin-login-form">
            <div className="form-group">
              <label className="form-label">Email address</label>
              <input
                className="form-input"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
              />
            </div>
            {error && <div className="error-message">{error}</div>}
            <button type="submit" className="login-btn" disabled={loading}>
              {loading ? 'Sending...' : 'Send reset link'}
            </button>
          </form>
        )}

        {step === 'sent' && (
          <div style={{ textAlign: 'center' }} className="forgot-info-message">
            <p>If an account exists for <strong>{email}</strong>, you will receive an email with a reset link.</p>
            <p>Check your inbox and follow the instructions.</p>
          </div>
        )}

        {(step === 'reset' || step === 'sent') && token && (
          <form onSubmit={handleResetSubmit} className="admin-login-form" style={{ marginTop: step === 'sent' ? '1rem' : 0 }}>
            <div className="form-group" style={{ position: 'relative' }}>
              <label className="form-label">New password</label>
              <input
                className="form-input"
                type={showPassword ? 'text' : 'password'}
                placeholder="••••••••"
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(p => !p)}
                style={{
                  position: 'absolute',
                  right: '12px',
                  top: '35px',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: '0.9rem',
                  color: '#4f46e5'
                }}
              >
                {showPassword ? 'Hide' : 'Show'}
              </button>
            </div>

            <div className="form-group">
              <label className="form-label">Confirm password</label>
              <input
                className="form-input"
                type={showPassword ? 'text' : 'password'}
                placeholder="••••••••"
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                required
              />
            </div>

            {error && <div className="error-message">{error}</div>}

            <button type="submit" className="login-btn" disabled={loading}>
              {loading ? 'Updating...' : 'Set password'}
            </button>
          </form>
        )}

        {step === 'done' && (
          <div style={{ textAlign: 'center' }} className="info-message">
            <p>Password updated successfully.</p>
            <button className="login-btn" onClick={() => navigate('/login')}>Go to login</button>
          </div>
        )}

        <div style={{ marginTop: '1rem', textAlign: 'center' }}>
          <button className="secondary-btn" onClick={() => navigate('/login')}>Back to login</button>
        </div>
      </div>
    </div>
  );
};

export default ForgotPassword;
