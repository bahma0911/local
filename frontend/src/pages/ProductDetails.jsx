import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { API_BASE } from '../utils/api';
import apiFetch from '../utils/apiFetch';
import { useCart } from '../hooks/useCart';
import './ProductDetails.css';

const ProductDetails = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [product, setProduct] = useState(null);
  const [reviews, setReviews] = useState([]);
  const [reviewsMeta, setReviewsMeta] = useState({ average: 0, count: 0 });
  const [mainIndex, setMainIndex] = useState(0);
  const { addToCart } = useCart();

  useEffect(() => {
    const load = async () => {
      try {
        const data = await apiFetch(`/api/products/${id}`);
        setProduct(data);
        setMainIndex(0);
      } catch (e) {
        console.error(e);
        alert('Product not found');
        navigate('/');
      }
    };
    load();
  }, [id]);

  const loadReviews = async () => {
    try {
      const j = await apiFetch(`/api/products/${id}/reviews`);
      setReviews(j.reviews || []);
      setReviewsMeta({ average: j.average || 0, count: j.count || 0 });
    } catch (err) {
      // swallow - reviews may be unavailable to anonymous users
      console.debug('Failed to load reviews', err && err.message ? err.message : err);
    }
  };

  useEffect(() => { loadReviews(); }, [id]);

  const [newRating, setNewRating] = useState(5);
  const [newComment, setNewComment] = useState('');
  const [posting, setPosting] = useState(false);

  const handleSubmitReview = async (e) => {
    e.preventDefault();
    if (!newComment && !newRating) return;
    setPosting(true);
    try {
      const payload = { rating: Number(newRating), comment: newComment };
      await apiFetch(`/api/products/${id}/reviews`, { method: 'POST', body: JSON.stringify(payload), headers: { 'Content-Type': 'application/json' } });
      setNewComment('');
      setNewRating(5);
      await loadReviews();
      try { window.dispatchEvent(new CustomEvent('review:created', { detail: { productId: id, review: {} } })); } catch (e) {}
    } catch (err) {
      console.error('Failed to post review', err);
      alert(err && err.response && err.response.message ? err.response.message : 'Failed to post review');
    } finally {
      setPosting(false);
    }
  };

  if (!product) return <div style={{ padding: 20 }}>Loading...</div>;
  const images = (product.images && product.images.length) ? product.images : (product.image ? [product.image] : []);
  const mainSrc = images[mainIndex] || images[0] || 'https://images.unsplash.com/photo-1560472354-b33ff0c44a43?w=800&h=600&fit=crop';
  const available = typeof product.inStock !== 'undefined' ? product.inStock : ((typeof product.stock !== 'undefined') ? product.stock > 0 : true);
  const priceAmount = (product && product.price && typeof product.price === 'object' && typeof product.price.amount !== 'undefined')
    ? product.price.amount
    : (typeof product.price === 'number' ? product.price : 0);

  const renderStars = (count) => {
    const stars = [];
    for (let i = 1; i <= 5; i++) {
      if (i <= count) stars.push(<span key={i} style={{ color: '#f59e0b', marginRight: 4 }}>★</span>);
      else stars.push(<span key={i} style={{ color: '#cbd5e1', marginRight: 4 }}>☆</span>);
    }
    return stars;
  };

  return (
    <div className="product-details" style={{ padding: 16 }}>
      <div className="pd-container">
        <div className="pd-gallery">
          <div className="pd-main">
            <img src={mainSrc} alt={product.name} onError={(e) => { e.target.src = 'https://images.unsplash.com/photo-1560472354-b33ff0c44a43?w=800&h=600&fit=crop'; }} />
          </div>
          {images && images.length > 1 && (
            <div className="pd-thumbs">
              {images.map((src, i) => (
                <img key={i} src={src} alt={`${product.name}-${i}`} onClick={() => setMainIndex(i)} className={i === mainIndex ? 'active' : ''} onError={(e) => { e.target.style.display = 'none'; }} />
              ))}
            </div>
          )}
        </div>

        <div className="pd-info">
          <h2>{product.name}</h2>
          <div style={{ margin: '8px 0' }}><strong>Price:</strong> {priceAmount} ETB</div>
          <div style={{ margin: '8px 0' }}>
            <strong>Condition:</strong> <span style={{ padding: '4px 8px', background: product.condition === 'used' ? '#ffc' : 'rgb(233, 132, 31)', borderRadius: 6 }}>{(product.condition || 'new').toUpperCase()}</span>
          </div>

          <div style={{ marginTop: 12 }}>
            <strong>Details</strong>
            <p style={{ whiteSpace: 'pre-wrap' }}>{product.details || product.description || ''}</p>
          </div>

          <div style={{ marginTop: 12 }}>
            <strong>Shop Phone:</strong> {product.shopPhone ? (<a href={`tel:${product.shopPhone}`}>{product.shopPhone}</a>) : 'Not provided'}
          </div>
          <div style={{ marginTop: 6 }}>
            <strong>Shop Location:</strong> {product.shopLocation || 'Not provided'}
          </div>

          <div style={{ marginTop: 16, display: 'flex', gap: 8 }}>
            <button disabled={!available} onClick={() => addToCart(product, 'Pickup', product.shopId || product.shopLegacyId || null)} style={{ padding: '10px 16px' }}>Add to Cart</button>
            <button disabled={!available} onClick={() => addToCart(product, 'Delivery', product.shopId || product.shopLegacyId || null)} style={{ padding: '10px 16px' }}>Buy with Delivery</button>
          </div>
          
          <div style={{ marginTop: 24 }} className="pd-reviews">
            <h3>Reviews ({reviewsMeta.count}) — Average: {reviewsMeta.average}</h3>
            {reviews.length === 0 && <p>No reviews yet.</p>}
            {reviews.map((rv) => (
              <div key={rv.id} className="pd-review-item">
                <div className="pd-review-head">
                  <strong className="pd-review-user">{rv.user ? rv.user.username : 'Anonymous'}</strong>
                  <div className="pd-review-stars">{renderStars(rv.rating)}</div>
                  {rv.verifiedPurchase && <span className="pd-review-verified">Verified</span>}
                </div>
                <div className="pd-review-comment">{rv.comment}</div>
                <div className="pd-review-meta">{new Date(rv.createdAt).toLocaleDateString()}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProductDetails;
