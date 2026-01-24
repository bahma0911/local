// src/components/RouteTester.jsx - NEW FILE (for testing)
import React from 'react';
import { useNavigate } from 'react-router-dom';

const RouteTester = () => {
  const navigate = useNavigate();

  return (
    <div style={{ padding: '2rem' }}>
      <h2>Route Tester - Check if navigation works</h2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <button onClick={() => navigate('/')}>Home</button>
        <button onClick={() => navigate('/wishlist')}>Wishlist</button>
        <button onClick={() => navigate('/orders')}>Orders</button>
        <button onClick={() => navigate('/tracking')}>Tracking</button>
        <button onClick={() => navigate('/profile')}>Profile</button>
        <button onClick={() => navigate('/checkout')}>Checkout</button>
        <button onClick={() => navigate('/admin/login')}>Admin Login</button>
      </div>
    </div>
  );
};

export default RouteTester;