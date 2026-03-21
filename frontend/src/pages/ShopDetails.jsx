import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import ProductList from '../components/ProductList';
import { useCart } from '../hooks/useCart';
import { shops as initialShops } from '../data/shopsData';
import apiFetch from '../utils/apiFetch';
import { API_BASE } from '../utils/api';
import './ShopDetails.css';

const ShopDetails = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [shop, setShop] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const {
    cartItems,
    addToCart,
    removeFromCart,
    updateDeliveryOption,
    increaseQuantity,
    decreaseQuantity,
  } = useCart();

  useEffect(() => {
    const loadShop = async () => {
      try {
        setLoading(true);

        // Try to load from API first
        const data = await apiFetch(`${API_BASE}/api/shops`);
        const foundShop = data.find(s => s.id == id);

        if (foundShop) {
          setShop(foundShop);
        } else {
          // Fallback to local data
          const savedShops = localStorage.getItem('updatedShops');
          const localShops = savedShops ? JSON.parse(savedShops) : initialShops;
          const localShop = localShops.find(s => s.id == id);

          if (localShop) {
            setShop(localShop);
          } else {
            setError('Shop not found');
          }
        }
      } catch (err) {
        console.error('Error loading shop:', err);
        // Fallback to local data
        const savedShops = localStorage.getItem('updatedShops');
        const localShops = savedShops ? JSON.parse(savedShops) : initialShops;
        const localShop = localShops.find(s => s.id == id);

        if (localShop) {
          setShop(localShop);
        } else {
          setError('Shop not found');
        }
      } finally {
        setLoading(false);
      }
    };

    loadShop();
  }, [id]);

  if (loading) {
    return (
      <div className="shop-details-page">
        <div className="loading">Loading shop details...</div>
      </div>
    );
  }

  if (error || !shop) {
    return (
      <div className="shop-details-page">
        <div className="error">
          <h2>Shop Not Found</h2>
          <p>The shop you're looking for doesn't exist.</p>
          <button onClick={() => navigate('/')} className="back-button">
            Back to Home
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="shop-details-page">
      <div className="shop-details-header">
        <button onClick={() => navigate('/')} className="back-button">
          ← Back to Shops
        </button>

        <div className="shop-info">
          {shop.logo && (
            <div className="shop-logo-large">
              <img
                src={shop.logo}
                alt={`${shop.name} logo`}
                onError={(e) => {
                  e.target.style.display = 'none';
                  e.target.nextSibling.style.display = 'flex';
                }}
              />
              <div className="shop-logo-fallback-large" style={{display:'none'}}>
                🏪
              </div>
            </div>
          )}

          <div className="shop-details">
            <h1 className="shop-title">{shop.name}</h1>
            <p className="shop-category">{shop.category}</p>
            <p className="shop-address">📍 {shop.address}</p>
            {shop.deliveryFee && (
              <p className="shop-delivery">🚚 Delivery: {shop.deliveryFee} ETB</p>
            )}
          </div>
        </div>
      </div>

      <div className="shop-products-section">
        <h2>Products ({shop.products?.length || 0})</h2>
        {shop.products && shop.products.length > 0 ? (
          <ProductList
            shop={shop}
            onAddToCart={addToCart}
            limitSingle={false}
          />
        ) : (
          <div className="no-products">
            <p>No products available at this shop.</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default ShopDetails;