// src/pages/CustomerDashboard.jsx
import React, { useState, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';
import { useReviewsWishlist } from '../hooks/useReviewsWishlist';
import { useNavigate } from 'react-router-dom';
import apiFetch from '../utils/apiFetch';
import { API_BASE } from '../utils/api';
import "./CustomerDashboard.css";

const CustomerDashboard = () => {
  const { user } = useAuth();
  const { getUserWishlist } = useReviewsWishlist();
  const navigate = useNavigate();
  
  const [recentOrders, setRecentOrders] = useState([]);
  const [wishlist, setWishlist] = useState([]);
  const [recommendedProducts, setRecommendedProducts] = useState([]);

  useEffect(() => {
    if (user) {
      // Load recent orders from server
      (async () => {
        try {
          const data = await apiFetch(`${API_BASE}/api/orders/my`);
          const filtered = (data || []).filter(order => {
            if (order.createdBy) return order.createdBy === user.username;
            if (order.customerMeta?.username) return order.customerMeta.username === user.username;
            return order.customer?.fullName === user.username;
          }).slice(0, 3).reverse();
          setRecentOrders(filtered);
        } catch (err) {
          console.error('Failed to load recent orders', err);
        }
      })();

      // Load wishlist
      const userWishlist = getUserWishlist(user.username).slice(0, 4);
      setWishlist(userWishlist);

      // Load recommended products (mock data for now)
      const shops = JSON.parse(localStorage.getItem('updatedShops') || '[]');
      const allProducts = shops.flatMap(shop => shop.products);
      const recommended = allProducts
        .filter(p => p.inStock)
        .sort(() => Math.random() - 0.5)
        .slice(0, 6);
      
      setRecommendedProducts(recommended);
    }
  }, [user, getUserWishlist]);

  if (!user) {
    return (
      <div className="customer-dashboard">
        <div className="login-prompt">
          <h2>Please login to access Customer Dashboard</h2>
          <button 
            onClick={() => navigate('/admin/login')}
            className="login-btn"
          >
            Login
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="customer-dashboard">
      {/* Welcome Section */}
      <div className="welcome-section">
        <h1>Welcome back, {user.username}! 👋</h1>
        <p>Here's what's happening with your account</p>
      </div>

      {/* Quick Stats */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-icon">📦</div>
          <div className="stat-info">
            <h3>{recentOrders.length}</h3>
            <p>Recent Orders</p>
          </div>
        </div>
        
        <div className="stat-card">
          <div className="stat-icon">❤️</div>
          <div className="stat-info">
            <h3>{wishlist.length}</h3>
            <p>Wishlist Items</p>
          </div>
        </div>
        
        <div className="stat-card">
          <div className="stat-icon">⭐</div>
          <div className="stat-info">
            <h3>Member</h3>
            <p>Since {new Date(user.joinDate).getFullYear()}</p>
          </div>
        </div>
      </div>

      <div className="dashboard-grid">
        {/* Recent Orders */}
        <div className="dashboard-section">
          <div className="section-header">
            <h2>Recent Orders</h2>
            <button 
              onClick={() => navigate('/orders')}
              className="view-all-btn"
            >
              View All
            </button>
          </div>
          
          {recentOrders.length === 0 ? (
            <div className="empty-state">
              <p>No orders yet</p>
              <button 
                onClick={() => navigate('/')}
                className="shop-now-btn"
              >
                Start Shopping
              </button>
            </div>
          ) : (
            <div className="orders-preview">
              {recentOrders.map((order, idx) => (
                <div key={order.id || order.orderId || order._id || idx} className="order-preview">
                  <div className="order-info">
                    <strong>Order #{order.id.slice(-6)}</strong>
                    <span>{order.total} ETB</span>
                  </div>
                  <div className="order-meta">
                    <span>{new Date(order.createdAt).toLocaleDateString()}</span>
                    <button 
                      onClick={() => navigate('/tracking')}
                      className="track-btn"
                    >
                      Track
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Wishlist Preview */}
        <div className="dashboard-section">
          <div className="section-header">
            <h2>Wishlist</h2>
            <button 
              onClick={() => navigate('/wishlist')}
              className="view-all-btn"
            >
              View All
            </button>
          </div>
          
          {wishlist.length === 0 ? (
            <div className="empty-state">
              <p>Your wishlist is empty</p>
              <button 
                onClick={() => navigate('/')}
                className="shop-now-btn"
              >
                Browse Products
              </button>
            </div>
          ) : (
            <div className="wishlist-preview">
              {wishlist.map(item => (
                <div key={item.id} className="wishlist-item-preview">
                  <img 
                    src={item.image} 
                    alt={item.name}
                    onError={(e) => {
                      e.target.src = "https://images.unsplash.com/photo-1560472354-b33ff0c44a43?w=400&h=300&fit=crop";
                    }}
                  />
                  <div className="item-details">
                    <h4>{item.name}</h4>
                    <p>{item.price} ETB</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Recommended Products */}
      <div className="dashboard-section full-width">
        <div className="section-header">
          <h2>Recommended For You</h2>
          <button 
            onClick={() => navigate('/')}
            className="view-all-btn"
          >
            Browse All
          </button>
        </div>
        
        <div className="recommended-products">
          {recommendedProducts.map(product => (
            <div 
              key={product.id} 
              className="product-preview"
              onClick={() => navigate('/')}
            >
              <img 
                src={product.image} 
                alt={product.name}
                onError={(e) => {
                  e.target.src = "https://images.unsplash.com/photo-1560472354-b33ff0c44a43?w=400&h=300&fit=crop";
                }}
              />
              <div className="product-info">
                <h4>{product.name}</h4>
                <p className="price">{product.price} ETB</p>
                {product.rating && (
                  <div className="rating">
                    ⭐ {product.rating.toFixed(1)}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Quick Actions */}
      <div className="quick-actions">
        <h3>Quick Actions</h3>
        <div className="action-buttons">
          <button 
            onClick={() => navigate('/profile')}
            className="action-btn"
          >
            👤 Edit Profile
          </button>
          <button 
            onClick={() => navigate('/orders')}
            className="action-btn"
          >
            📦 Order History
          </button>
          <button 
            onClick={() => navigate('/tracking')}
            className="action-btn"
          >
            🚚 Track Order
          </button>
          <button 
            onClick={() => navigate('/wishlist')}
            className="action-btn"
          >
            ❤️ My Wishlist
          </button>
        </div>
      </div>
    </div>
  );
};

export default CustomerDashboard;