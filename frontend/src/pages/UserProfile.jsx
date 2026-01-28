// src/pages/UserProfile.jsx
import React, { useState, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';
import { useReviewsWishlist } from '../hooks/useReviewsWishlist';
import apiFetch from '../utils/apiFetch';
import "./UserProfile.css";

const UserProfile = () => {
  const { user, updateCustomerProfile, logout } = useAuth();
  const { getUserWishlist } = useReviewsWishlist();
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
        const data = await apiFetch('/api/orders/my');
        const userOrders = (data || []).filter(order => {
          if (order.createdBy) return order.createdBy === user.username;
          if (order.customerMeta?.username) return order.customerMeta.username === user.username;
          return order.customer?.fullName === user.username;
        }).reverse();
        setOrders(userOrders);
      } catch (err) {
        console.error('Failed to fetch user orders', err);
      }
    };
    fetchOrders();
  }, [user]);

  const handleProfileUpdate = (e) => {
    e.preventDefault();
    if (updateCustomerProfile(profileData)) {
      alert('Profile updated successfully!');
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
              orders.map((order, idx) => (
                <div key={order.id || order.orderId || order._id || idx} className="order-item">
                  <div className="order-summary">
                    <strong>Order #{order.id}</strong>
                    <span>{order.total} ETB</span>
                    <span>{new Date(order.createdAt).toLocaleDateString()}</span>
                  </div>
                </div>
              ))
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