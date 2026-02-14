// src/hooks/useReviewsWishlist.js
import { useState, useEffect } from 'react';

export const useReviewsWishlist = () => {
  const [reviews, setReviews] = useState(() => {
    const saved = localStorage.getItem('productReviews');
    try {
      const parsed = saved ? JSON.parse(saved) : [];
      return Array.isArray(parsed) ? parsed.map(r => ({ ...r, productId: typeof r.productId === 'undefined' ? r.product : String(r.productId) })) : [];
    } catch (err) {
      return [];
    }
  });

  const [wishlist, setWishlist] = useState(() => {
    const saved = localStorage.getItem('userWishlist');
    return saved ? JSON.parse(saved) : [];
  });

  // Review functions
  const addReview = (productId, rating, comment, username) => {
    const newReview = {
      id: Date.now(),
      productId: String(productId),
      rating,
      comment,
      username,
      date: new Date().toISOString(),
      verified: false
    };
    
    setReviews(prev => [...prev, newReview]);
  };

  const getProductReviews = (productId) => {
    return reviews.filter(review => String(review.productId) === String(productId));
  };

  const getProductRating = (productId) => {
    const productReviews = getProductReviews(productId);
    if (productReviews.length === 0) return 0;
    
    const total = productReviews.reduce((sum, review) => sum + review.rating, 0);
    return total / productReviews.length;
  };

  // Wishlist functions
  const addToWishlist = (product, username) => {
    setWishlist(prev => {
      const existing = prev.find(item => item.id === product.id && item.username === username);
      if (existing) return prev;
      
      return [...prev, { ...product, username, addedAt: new Date().toISOString() }];
    });
  };

  const removeFromWishlist = (productId, username) => {
    setWishlist(prev => prev.filter(item => 
      !(item.id === productId && item.username === username)
    ));
  };

  const isInWishlist = (productId, username) => {
    return wishlist.some(item => item.id === productId && item.username === username);
  };

  const getUserWishlist = (username) => {
    return wishlist.filter(item => item.username === username);
  };

  // Save to localStorage
  useEffect(() => {
    localStorage.setItem('productReviews', JSON.stringify(reviews));
  }, [reviews]);

  // Listen for global review events (dispatched after server POST) to keep UI in sync
  useEffect(() => {
    const handler = (e) => {
      try {
        const detail = e && e.detail ? e.detail : null;
        if (!detail || !detail.productId) return;
        const r = detail.review || {};
        const newReview = {
          id: r._id || r.id || Date.now(),
          productId: String(detail.productId),
          rating: Number(r.rating) || 0,
          comment: r.comment || '',
          username: (r.user && r.user.username) || r.username || 'you',
          date: r.createdAt || new Date().toISOString(),
          verified: !!r.verifiedPurchase
        };
        setReviews(prev => {
          // avoid duplicates by id
          if (prev.some(rv => String(rv.id) === String(newReview.id))) return prev;
          return [...prev, newReview];
        });
      } catch (err) {
        // ignore
      }
    };
    window.addEventListener('review:created', handler);
    return () => window.removeEventListener('review:created', handler);
  }, []);

  useEffect(() => {
    localStorage.setItem('userWishlist', JSON.stringify(wishlist));
  }, [wishlist]);

  return {
    reviews,
    wishlist,
    addReview,
    getProductReviews,
    getProductRating,
    addToWishlist,
    removeFromWishlist,
    isInWishlist,
    getUserWishlist
  };
};