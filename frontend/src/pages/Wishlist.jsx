import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useReviewsWishlist } from '../hooks/useReviewsWishlist';
import { useCart } from '../hooks/useCart';
import "./Wishlist.css";

const Wishlist = () => {
  const { user } = useAuth();
  const { getUserWishlist, removeFromWishlist } = useReviewsWishlist();
  const { addToCart } = useCart();
  const navigate = useNavigate();
  
  const [wishlist, setWishlist] = useState([]);
  const [isLoaded, setIsLoaded] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);

  useEffect(() => {
    const checkAuth = () => {
      const savedUser = localStorage.getItem('user');
      if (!savedUser && !user) {
        setCheckingAuth(false);
        return;
      }
      
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

  useEffect(() => {
    if (user && !isLoaded && !checkingAuth) {
      const userWishlist = getUserWishlist(user.username);
      setWishlist(userWishlist);
      setIsLoaded(true);
    }
  }, [user, isLoaded, checkingAuth, getUserWishlist]);

  const navigateTo = (path) => {
    setTimeout(() => {
      navigate(path);
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