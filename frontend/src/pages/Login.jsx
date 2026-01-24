import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import './AdminLogin.css';

const Login = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { login } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const from = location.state?.from?.pathname || '/';

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const res = await login({ username, password });
    setLoading(false);
    if (res.ok) {
      navigate(from, { replace: true });
    } else {
      setError(res.message || 'Login failed');
    }
  };

  return (
    <div className="admin-login-page">
      <div className="admin-login-container" style={{ padding: '1.5rem' }}>
        <h2 className="admin-login-title">Sign in to Negadras</h2>
        <form onSubmit={handleSubmit} className="admin-login-form">
          <div className="form-group">
            <label className="form-label">Username or Email</label>
            <input className="form-input" placeholder="you@example.com" value={username} onChange={e => setUsername(e.target.value)} required />
          </div>

          <div className="form-group">
            <label className="form-label">Password</label>
            <input className="form-input" type="password" placeholder="••••••••" value={password} onChange={e => setPassword(e.target.value)} required />
          </div>

          {error && <div className="error-message">{error}</div>}

          <div style={{ display: 'flex', gap: 8, marginTop: '1rem' }}>
            <button type="submit" className="login-btn" disabled={loading}>{loading ? 'Signing in...' : 'Sign in'}</button>
            <button type="button" className="secondary-btn" onClick={() => navigate('/register')}>Create account</button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default Login;
