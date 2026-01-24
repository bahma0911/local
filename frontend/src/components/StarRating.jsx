import React, { useState } from 'react';

const Star = ({ filled, onClick, onMouseEnter, onMouseLeave, label }) => (
  <button
    type="button"
    className={`star-btn ${filled ? 'filled' : ''}`}
    onClick={onClick}
    onMouseEnter={onMouseEnter}
    onMouseLeave={onMouseLeave}
    aria-label={label}
    style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20 }}
  >
    {filled ? '★' : '☆'}
  </button>
);

const StarRating = ({ value = 0, max = 5, onChange, readOnly = false }) => {
  const [hover, setHover] = useState(0);

  const handleClick = (v) => {
    if (readOnly) return;
    onChange && onChange(v);
  };

  return (
    <div className="star-rating" style={{ display: 'inline-flex', gap: 4 }}>
      {Array.from({ length: max }).map((_, i) => {
        const idx = i + 1;
        const filled = hover ? idx <= hover : idx <= value;
        return (
          <Star
            key={idx}
            filled={filled}
            onClick={() => handleClick(idx)}
            onMouseEnter={() => !readOnly && setHover(idx)}
            onMouseLeave={() => !readOnly && setHover(0)}
            label={`${idx} star`}
          />
        );
      })}
    </div>
  );
};

export default StarRating;
