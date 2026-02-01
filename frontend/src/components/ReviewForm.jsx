import React, { useState } from 'react';
import apiFetch from '../utils/apiFetch';
import { API_BASE } from '../utils/api';
import StarRating from './StarRating';

const ReviewForm = ({ productId, onSubmitted }) => {
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await apiFetch(`${API_BASE}/api/products/${productId}/reviews`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rating, comment }) });
      setComment('');
      setRating(5);
      // Dispatch a global event so other components (home product cards) can update ratings
      try {
        const detail = { productId, review: res && res.review ? res.review : { rating, comment, createdAt: new Date().toISOString() } };
        window.dispatchEvent(new CustomEvent('review:created', { detail }));
      } catch (e) { /* ignore dispatch errors */ }

      // Also persist to localStorage so pages that weren't mounted at dispatch time pick it up
      try {
        const stored = JSON.parse(localStorage.getItem('productReviews') || '[]');
        const r = res && res.review ? res.review : { _id: Date.now(), rating, comment, createdAt: new Date().toISOString(), user: { username: 'you' } };
        const exists = stored.some(rv => String(rv.id || rv._id) === String(r._id || r.id));
        if (!exists) {
          stored.push({ id: r._id || r.id || Date.now(), productId, rating: Number(r.rating) || rating, comment: r.comment || comment, username: (r.user && r.user.username) || 'you', date: r.createdAt || new Date().toISOString(), verified: !!r.verifiedPurchase });
          localStorage.setItem('productReviews', JSON.stringify(stored));
        }
      } catch (e) { /* ignore localStorage errors */ }
      onSubmitted && onSubmitted();
    } catch (err) {
      setError(err && err.message ? err.message : 'Failed to submit review');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} style={{ marginTop: 12 }}>
      <label style={{ display: 'block', marginBottom: 6 }}>Your rating</label>
      <StarRating value={rating} onChange={setRating} />

      <label style={{ display: 'block', marginTop: 8 }}>Comment (optional)</label>
      <textarea value={comment} onChange={e => setComment(e.target.value)} rows={4} style={{ width: '100%', marginTop: 6 }} />

      {error && <div style={{ color: 'red', marginTop: 6 }}>{error}</div>}

      <div style={{ marginTop: 8 }}>
        <button type="submit" disabled={submitting} className="product-action-btn pickup">
          {submitting ? 'Submitting…' : 'Submit Review'}
        </button>
      </div>
    </form>
  );
};

export default ReviewForm;
