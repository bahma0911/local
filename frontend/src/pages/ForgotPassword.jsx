import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import './AdminLogin.css';

const ForgotPassword = () => {
  const navigate = useNavigate();
  const { checkEmail, resetPassword } = useAuth();
  const [step, setStep] = useState('email'); // email, reset, done
  const [email, setEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const handleEmailSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const res = await checkEmail(email);
    setLoading(false);
    if (res.ok) {
      setStep('reset');
    } else {
      setError(res.message || 'Email not found');
    }
  };

  const handleResetSubmit = async (e) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    setError(null);
    setLoading(true);
    const res = await resetPassword({ email, newPassword });
    setLoading(false);
    if (res.ok) {
      setStep('done');
    } else {
      setError(res.message || 'Reset failed');
    }
  };

  return (
    <div className="admin-login-page">
      <div className="admin-login-container" style={{ padding: '1.5rem' }}>
        <h2 className="admin-login-title">Forgot Password</h2>
        {(step === 'email' || step === 'reset') && (
          <form
            onSubmit={step === 'email' ? handleEmailSubmit : handleResetSubmit}
            className="admin-login-form"
          >
            {step === 'email' && (
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
            )}

            {step === 'reset' && (
              <>
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
              </>
            )}

            {error && <div className="error-message">{error}</div>}

            <button type="submit" className="login-btn" disabled={loading}>
              {loading
                ? step === 'email'
                  ? 'Checking...'
                  : 'Updating...'
                : step === 'email'
                ? 'Next'
                : 'Set password'}
            </button>
          </form>
        )}

        {step === 'done' && (
          <div style={{ textAlign: 'center' }}>
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
