// src/pages/UserProfile.jsx
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useReviewsWishlist } from '../hooks/useReviewsWishlist';
import apiFetch from '../utils/apiFetch';
import { API_BASE } from '../utils/api';
import "./UserProfile.css";

const UserProfile = () => {
  const { user, updateCustomerProfile, logout } = useAuth();
  const { getUserWishlist } = useReviewsWishlist();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('profile');
  const [profileData, setProfileData] = useState({
    email: user?.email || '',
    phone: user?.phone || '',
    address: user?.address || '',
    city: user?.city || ''
  });

  const wishlist = user ? getUserWishlist(user.username) : [];
  const [orders, setOrders] = useState([]);

  useEffect(() => {
    const fetchOrders = async () => {
      if (!user) return;
      try {
        const data = await apiFetch(`${API_BASE}/api/orders/my`);
        const matchesUser = (order) => {
          if (!order) return false;
          const uname = String(user.username || '').toLowerCase();
          const uemail = String(user.email || '').toLowerCase();
          const uid = String(user.id || user._id || user.userId || '').toLowerCase();

          const createdBy = String(order.createdBy || order.created_by || '').toLowerCase();
          if (createdBy && (createdBy === uname || createdBy === uemail || createdBy === uid)) return true;

          const metaUser = String(order.customerMeta?.username || order.customerMeta?.user || '').toLowerCase();
          const metaEmail = String(order.customerMeta?.email || '').toLowerCase();
          if (metaUser && (metaUser === uname || metaUser === uemail)) return true;
          if (metaEmail && (metaEmail === uemail || metaEmail === uname)) return true;

          const cust = order.customer || {};
          const custName = String(cust.fullName || cust.name || cust.username || '').toLowerCase();
          const custEmail = String(cust.email || '').toLowerCase();
          if (custName && (custName === uname || custName === uemail)) return true;
          if (custEmail && (custEmail === uemail || custEmail === uname)) return true;

          // fallback: check order.email or order.userId
          const orderEmail = String(order.email || '').toLowerCase();
          const orderUserId = String(order.userId || order.user_id || order.customerId || '').toLowerCase();
          if (orderEmail && (orderEmail === uemail || orderEmail === uname)) return true;
          if (orderUserId && (orderUserId === uid)) return true;

          return false;
        };

        const userOrders = (data || []).filter(matchesUser).reverse();
        setOrders(userOrders);
      } catch (err) {
        console.error('Failed to fetch user orders', err);
      }
    };
    fetchOrders();
  }, [user]);

  const handleProfileUpdate = async (e) => {
    e.preventDefault();
    try {
      const res = await updateCustomerProfile(profileData);
      if (res && res.ok) {
        alert('Profile updated successfully!');
      } else {
        alert(`Failed to update profile: ${res && res.message ? res.message : 'Unknown error'}`);
      }
    } catch (err) {
      console.error('Profile update error', err);
      alert('Failed to update profile');
    }
  };

  if (!user) {
    return (
      <div className="user-profile">
        <h2>Please login to view your profile</h2>
      </div>
    );
  }

  return (
    <div className="user-profile">
      <div className="profile-header">
        <h1>My Account</h1>
        <p>Welcome back, {user.username}!</p>
      </div>

      <div className="profile-tabs">
        <button 
          className={activeTab === 'profile' ? 'active' : ''}
          onClick={() => setActiveTab('profile')}
        >
          Profile
        </button>
        <button 
          className={activeTab === 'orders' ? 'active' : ''}
          onClick={() => setActiveTab('orders')}
        >
          Order History
        </button>
        <button 
          className={activeTab === 'wishlist' ? 'active' : ''}
          onClick={() => setActiveTab('wishlist')}
        >
          Wishlist
        </button>
      </div>

      <div className="profile-content">
        {activeTab === 'profile' && (
          <div className="profile-form">
            <h3>Personal Information</h3>
            <form onSubmit={handleProfileUpdate}>
              <div className="form-group">
                <label>Email</label>
                <input
                  type="email"
                  value={profileData.email}
                  onChange={(e) => setProfileData(prev => ({...prev, email: e.target.value}))}
                />
              </div>
              <div className="form-group">
                <label>Phone</label>
                <input
                  type="tel"
                  value={profileData.phone}
                  onChange={(e) => setProfileData(prev => ({...prev, phone: e.target.value}))}
                />
              </div>
              <div className="form-group">
                <label>Address</label>
                <textarea
                  value={profileData.address}
                  onChange={(e) => setProfileData(prev => ({...prev, address: e.target.value}))}
                  rows="3"
                />
              </div>
              <div className="form-group">
                <label>City</label>
                <input
                  type="text"
                  value={profileData.city}
                  onChange={(e) => setProfileData(prev => ({...prev, city: e.target.value}))}
                />
              </div>
              <button type="submit" className="btn-save">Save Changes</button>
            </form>
            
            <div className="logout-section">
              <button onClick={logout} className="btn-logout">
                Logout
              </button>
            </div>
          </div>
        )}

        {activeTab === 'orders' && (
          <div className="orders-tab">
            <h3>Order History</h3>
            {orders.length === 0 ? (
              <p>No orders yet</p>
            ) : (
              orders.map((order, idx) => {
                const oid = String(order.id || order._id || order.orderId || order.order_id || idx);
                return (
                  <div key={order.id || order.orderId || order._id || idx} className="order-item">
                    <div className="order-summary">
                      <a
                        href="#"
                        onClick={(e) => { e.preventDefault(); navigate('/orders', { state: { openOrderId: oid } }); }}
                        className="order-link"
                      >
                        <strong>Order #{oid}</strong>
                      </a>
                      <span>{order.total} ETB</span>
                      <span>{new Date(order.createdAt).toLocaleDateString()}</span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}

        {activeTab === 'wishlist' && (
          <div className="wishlist-tab">
            <h3>My Wishlist</h3>
            {wishlist.length === 0 ? (
              <p>Your wishlist is empty</p>
            ) : (
              <div className="wishlist-items">
                {wishlist.map(item => (
                  <div key={item.id} className="wishlist-item">
                    <img src={item.image} alt={item.name} />
                    <div className="item-info">
                      <h4>{item.name}</h4>
                      <p>{item.price} ETB</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default UserProfile;