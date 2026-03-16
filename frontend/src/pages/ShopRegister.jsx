import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import apiFetch from '../utils/apiFetch';
import { API_BASE } from '../utils/api';

const ShopRegister = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    ownerName: '',
    shopName: '',
    phone: '',
    address: '',
    password: ''
  });
  const [token, setToken] = useState('');
  const [isValidToken, setIsValidToken] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const tokenFromUrl = searchParams.get('token');
    if (!tokenFromUrl) {
      alert('Invalid invitation link');
      navigate('/');
      return;
    }
    setToken(tokenFromUrl);
    verifyToken(tokenFromUrl);
  }, [searchParams, navigate]);

  const verifyToken = async (token) => {
    try {
      const response = await apiFetch(`${API_BASE}/api/shop/verify-invitation?token=${encodeURIComponent(token)}`);
      if (response.valid) {
        setIsValidToken(true);
      } else {
        alert('Invalid or expired invitation');
        navigate('/');
      }
    } catch (error) {
      console.error('Token verification failed:', error);
      alert('Invalid or expired invitation');
      navigate('/');
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.ownerName.trim() || !formData.shopName.trim() || !formData.address.trim() || !formData.password) {
      alert('Please fill in all required fields');
      return;
    }
    if (formData.password.length < 6) {
      alert('Password must be at least 6 characters');
      return;
    }

    setSubmitting(true);
    try {
      const payload = { ...formData, token };
      await apiFetch(`${API_BASE}/api/shop/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      alert('Shop registered successfully! You can now log in with your email and password.');
      navigate('/login');
    } catch (error) {
      console.error('Registration failed:', error);
      alert('Registration failed. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <div className="shop-register">Verifying invitation...</div>;
  }

  if (!isValidToken) {
    return <div className="shop-register">Invalid invitation</div>;
  }

  return (
    <div className="shop-register">
      <h2>Register Your Shop</h2>
      <form onSubmit={handleSubmit}>
        <div>
          <label>Owner Name *</label>
          <input
            type="text"
            name="ownerName"
            value={formData.ownerName}
            onChange={handleInputChange}
            required
          />
        </div>
        <div>
          <label>Shop Name *</label>
          <input
            type="text"
            name="shopName"
            value={formData.shopName}
            onChange={handleInputChange}
            required
          />
        </div>
        <div>
          <label>Phone</label>
          <input
            type="tel"
            name="phone"
            value={formData.phone}
            onChange={handleInputChange}
          />
        </div>
        <div>
          <label>Shop Address *</label>
          <input
            type="text"
            name="address"
            value={formData.address}
            onChange={handleInputChange}
            required
          />
        </div>
        <div>
          <label>Password *</label>
          <input
            type="password"
            name="password"
            value={formData.password}
            onChange={handleInputChange}
            required
            minLength={6}
          />
        </div>
        <button type="submit" disabled={submitting}>
          {submitting ? 'Registering...' : 'Register Shop'}
        </button>
      </form>
    </div>
  );
};

export default ShopRegister;