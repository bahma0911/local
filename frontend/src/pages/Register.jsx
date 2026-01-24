import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

const Register = () => {
  const navigate = useNavigate();
  const { register } = useAuth();
  const [form, setForm] = useState({ username: '', email: '', password: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleChange = (e) => setForm(prev => ({ ...prev, [e.target.name]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const res = await register(form);
    setLoading(false);
    if (res.ok) {
      navigate('/');
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
