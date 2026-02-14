// src/components/ProductCard.jsx
import React, { useState, useEffect } from 'react';
import { useReviewsWishlist } from '../hooks/useReviewsWishlist';
import { useAuth } from '../hooks/useAuth';
import { useNavigate } from 'react-router-dom';
import "./ProductCard.css";

const ProductCard = ({ product, onAddToCart, shopId }) => {
  const { getProductRating, addToWishlist, removeFromWishlist, isInWishlist } = useReviewsWishlist();
  const { user } = useAuth();

  const rating = getProductRating(product.id);
  const inWishlist = user ? isInWishlist(product.id, user.username) : false;

  // local trigger to force re-render when a review for this product is created elsewhere
  const [version, setVersion] = useState(0);
  useEffect(() => {
    const handler = (e) => {
      try {
        const detail = e && e.detail ? e.detail : null;
        if (!detail || !detail.productId) return;
        if (String(detail.productId) === String(product.id)) {
          setVersion(v => v + 1);
        }
      } catch (err) { /* ignore */ }
    };
    window.addEventListener('review:created', handler);
    return () => window.removeEventListener('review:created', handler);
  }, [product.id]);

  const handleWishlistToggle = () => {
    if (!user) {
      alert('Please login to add items to wishlist');
      return;
    }

    if (inWishlist) {
      removeFromWishlist(product.id, user.username);
    } else {
      addToWishlist(product, user.username);
    }
  };

  const renderStars = (rating, maxStars = 5) => {
    return Array.from({ length: maxStars }, (_, index) => (
      <span 
        key={index} 
        className={`star ${index < rating ? 'filled' : ''}`}
      >
        {index < rating ? '★' : '☆'}
      </span>
    ));
  };

  const available = (typeof product.inStock !== 'undefined') ? product.inStock : ((typeof product.stock !== 'undefined') ? (product.stock > 0) : true);
  const navigate = useNavigate();

  return (
    <div className={`product-card ${available ? 'in-stock' : 'out-of-stock'}`}>
      <div className="product-image-container">
        <img 
          src={product.image || (product.images && product.images[0])} 
          alt={product.name}
          className="product-image"
          onError={(e) => { e.target.src = "https://images.unsplash.com/photo-1560472354-b33ff0c44a43?w=400&h=300&fit=crop"; }}
          onClick={() => navigate(`/product/${product.id || product._id || product.id}`)}
        />
        {!available && (
          <div className="out-of-stock-overlay">Out of Stock</div>
        )}
        
        <button 
          className={`wishlist-btn ${inWishlist ? 'in-wishlist' : ''}`}
          onClick={handleWishlistToggle}
        >
          {inWishlist ? '❤️' : '🤍'}
        </button>
      </div>
      
      <h3 className="product-name">{product.name}</h3>
      
      <div className="product-rating">
        <div className="stars">
          {renderStars(Math.round(rating))}
          <span className="rating-text">({rating.toFixed(1)})</span>
        </div>
      </div>
      
      <p className="product-price">Price: {product.price} ETB
        <span style={{ marginLeft: 8, color: '#9ad' }}>
          {typeof product.stock !== 'undefined'
            ? (product.stock > 0 ? `${product.stock} in stock` : 'Out of stock')
            : (available ? 'In stock' : 'Out of stock')}
        </span>
      </p>
      
      {product.description && (
        <p className="product-description">{(function(){
          const txt = String(product.description || '');
          return txt.length > 120 ? txt.slice(0, 120).trim() + '…' : txt;
        })()}</p>
      )}
      
      <div className="product-actions">
        <button
          onClick={() => onAddToCart(product, "Pickup", shopId)}
          className="product-action-btn pickup"
          disabled={!available}
        >
          Pickup
        </button>
        <button
          onClick={() => onAddToCart(product, "Delivery", shopId)}
          className="product-action-btn delivery"
          disabled={!available}
        >
          Delivery
        </button>
      </div>

    </div>
  );
};

export default ProductCard;