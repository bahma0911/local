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
  const [mainIndex, setMainIndex] = useState(0);
  const { addToCart } = useCart();

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/products/${id}`);
        if (!res.ok) throw new Error('Failed to load product');
        const data = await res.json();
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

  if (!product) return <div style={{ padding: 20 }}>Loading...</div>;

  const images = (product.images && product.images.length) ? product.images : (product.image ? [product.image] : []);
  const mainSrc = images[mainIndex] || images[0] || 'https://images.unsplash.com/photo-1560472354-b33ff0c44a43?w=800&h=600&fit=crop';
  const available = typeof product.inStock !== 'undefined' ? product.inStock : ((typeof product.stock !== 'undefined') ? product.stock > 0 : true);

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
          <div style={{ margin: '8px 0' }}><strong>Price:</strong> {product.price && product.price.amount ? product.price.amount : (product.price || 0)} ETB</div>
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
        </div>
      </div>
    </div>
  );
};

export default ProductDetails;
