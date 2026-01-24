import React from 'react';
import StarRating from './StarRating';

const ReviewsList = ({ reviews = [], average = 0, count = 0 }) => {
  return (
    <div className="reviews-list">
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ fontSize: 18, fontWeight: 'bold' }}>{average.toFixed ? average.toFixed(1) : average}</div>
        <div><StarRating value={Math.round(average)} readOnly /></div>
        <div style={{ color: '#666' }}>({count} reviews)</div>
      </div>

      <ul style={{ listStyle: 'none', padding: 0, marginTop: 8 }}>
        {reviews.map(r => (
          <li key={r.id || r._id} style={{ borderTop: '1px solid #eee', padding: '8px 0' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontWeight: 600 }}>{r.user ? (r.user.username || r.user.email) : 'Anonymous'}</div>
              <div><StarRating value={r.rating || 0} readOnly /></div>
            </div>
            {r.verifiedPurchase && <div style={{ color: '#2a8', fontSize: 12 }}>Verified purchase</div>}
            {r.comment && <div style={{ marginTop: 6 }}>{r.comment}</div>}
            <div style={{ color: '#999', fontSize: 12, marginTop: 4 }}>{new Date(r.createdAt || r.date || Date.now()).toLocaleString()}</div>
          </li>
        ))}
        {reviews.length === 0 && <li style={{ color: '#666', paddingTop: 8 }}>No reviews yet.</li>}
      </ul>
    </div>
  );
};

export default ReviewsList;
