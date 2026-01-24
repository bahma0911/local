// src/pages/Wishlist.jsx - FIXED AUTH CHECK
import React, { useState, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';
import { useReviewsWishlist } from '../hooks/useReviewsWishlist';
import { useCart } from '../hooks/useCart';
import "./Wishlist.css";

const Wishlist = () => {
  const { user } = useAuth();
  const { getUserWishlist, removeFromWishlist } = useReviewsWishlist();
  const { addToCart } = useCart();
  
  const [wishlist, setWishlist] = useState([]);
  const [isLoaded, setIsLoaded] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);

  // ✅ FIXED: Better auth check with localStorage
  useEffect(() => {
    // Check if user is actually logged in
    const checkAuth = () => {
      const savedUser = localStorage.getItem('user');
      if (!savedUser && !user) {
        setCheckingAuth(false);
        return;
      }
      
      // If we have a user in localStorage but not in state, wait a bit
      if (savedUser && !user) {
        setTimeout(() => {
          setCheckingAuth(false);
        }, 500);
      } else {
        setCheckingAuth(false);
      }
    };

    checkAuth();
  }, [user]);

  // Load wishlist only after auth is confirmed
  useEffect(() => {
    if (user && !isLoaded && !checkingAuth) {
      const userWishlist = getUserWishlist(user.username);
      setWishlist(userWishlist);
      setIsLoaded(true);
    }
  }, [user, isLoaded, checkingAuth, getUserWishlist]);

  const navigateTo = (path) => {
    setTimeout(() => {
      window.location.href = path;
    }, 100);
  };

  const handleRemoveFromWishlist = (item) => {
    if (!user) return;
    removeFromWishlist(item.id, user.username);
    setWishlist(prev => prev.filter(w => w.id !== item.id));
  };

  const handleAddToCart = (item) => {
    if (!user) return;
    const shops = JSON.parse(localStorage.getItem('updatedShops') || '[]');
    const shop = shops.find(s => s.products.some(p => p.id === item.id));
    
    if (shop) {
      addToCart(item, "Delivery", shop.id);
      alert('Added to cart!');
    }
  };

  // ✅ Show loading while checking authentication
  if (checkingAuth) {
    return (
      <div className="wishlist-container">
        <div className="loading-state">
          <div className="loading-spinner"></div>
          <p>Checking authentication...</p>
        </div>
      </div>
    );
  }

  // ✅ Check both localStorage and React state for user
  const isUserLoggedIn = user || localStorage.getItem('user');

  if (!isUserLoggedIn) {
    return (
      <div className="wishlist-container">
        <h2>Please login to view your wishlist</h2>
        <button 
          onClick={() => navigateTo('/admin/login')}
          className="login-btn"
        >
          Login
        </button>
      </div>
    );
  }

  return (
    <div className="wishlist-container">
      <h1>My Wishlist</h1>
      
      {wishlist.length === 0 ? (
        <div className="empty-wishlist">
          <div className="empty-icon">❤️</div>
          <h3>Your wishlist is empty</h3>
          <p>Add products you love to your wishlist!</p>
          <button 
            onClick={() => navigateTo('/')}
            className="add-items-btn"
          >
            Continue Shopping
          </button>
        </div>
      ) : (
        <div className="wishlist-items">
          {wishlist.map(item => (
            <div key={`${item.id}-${item.addedAt}`} className="wishlist-item">
              <img 
                src={item.image} 
                alt={item.name}
                onError={(e) => {
                  e.target.src = "";
                }}
              />
              <div className="item-info">
                <h3>{item.name}</h3>
                <p className="item-price">{item.price} ETB</p>
                <p className="item-description">{item.description}</p>
                <div className="item-actions">
                  <button 
                    onClick={() => handleAddToCart(item)}
                    className="add-to-cart-btn"
                  >
                    Add to Cart
                  </button>
                  <button 
                    onClick={() => handleRemoveFromWishlist(item)}
                    className="remove-btn"
                  >
                    Remove
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default Wishlist;