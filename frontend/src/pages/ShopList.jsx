import React, { useState, useEffect } from "react";
import CategoryFilter from "../components/CategoryFilter";
import ShopCard from "../components/ShopCard";
import ProductList from "../components/ProductList";
import { shops as initialShops, categories } from "../data/shopsData";
import { useCart } from "../hooks/useCart";
import apiFetch from "../utils/apiFetch";
import { API_BASE } from '../utils/api';
import "./ShopList.css";

const ShopList = ({ compact = false }) => {
  const [shops, setShops] = useState([]);
  const [selectedShop, setSelectedShop] = useState(null);
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [searchTerm, setSearchTerm] = useState("");
  // priceRange: [min, max] — use `null` for unlimited max
  const [priceRange, setPriceRange] = useState([0, null]);

  // compact mode: show limited number on home page and toggle to reveal others
  const [showAllShops, setShowAllShops] = useState(false);
  const [visibleCount, setVisibleCount] = useState(3);

  useEffect(() => {
    if (!compact) return;
    const mq = window.matchMedia('(max-width: 640px)');
    const update = () => setVisibleCount(mq.matches ? 2 : 3);
    update();
    if (mq.addEventListener) mq.addEventListener('change', update);
    else mq.addListener(update);
    return () => {
      if (mq.removeEventListener) mq.removeEventListener('change', update);
      else mq.removeListener(update);
    };
  }, [compact]);
  
  // Prefer loading shops from backend API (returns normalized `stock`), fallback to localStorage/initial data
  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const data = await apiFetch(`${API_BASE}/api/shops`);
        if (mounted) {
          setShops(data);
          try { localStorage.setItem('updatedShops', JSON.stringify(data)); } catch (e) {}
        }
        return;
      } catch (e) {
        // ignore and fallback
      }

      const savedShops = localStorage.getItem('updatedShops');
      if (savedShops) setShops(JSON.parse(savedShops));
      else setShops(initialShops);
    };
    load();
    return () => { mounted = false; };
  }, []);

  const {
    cartItems,
    cartItemsByShop,
    deliveryOptions,
    deliveryFees,
    itemsTotal,
    totalDeliveryFee,
    cartTotal,
    totalItems,
    addToCart,
    removeFromCart,
    updateDeliveryOption,
    increaseQuantity,
    decreaseQuantity,
    clearCart,
  } = useCart();

  // Get all products for search (flatten all shop products)
  const allProducts = shops.flatMap(shop => 
    (shop.products || []).map(product => ({
      ...product,
      shopName: shop.name,
      shopCategory: shop.category,
      category: product.category || shop.category || '',
      shopId: shop.id
    }))
  );

  // Ensure each product has an `inStock` boolean for UI consistency
  for (const p of allProducts) {
    if (typeof p.inStock === 'undefined') {
      if (typeof p.stock !== 'undefined') p.inStock = (p.stock > 0);
      else p.inStock = true;
    }
  }

  // Search and filter logic
  const filteredProducts = allProducts.filter(product => {
    const matchesSearch = product.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         product.shopName.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesPrice = product.price >= priceRange[0] && (priceRange[1] === null || product.price <= priceRange[1]);
    const matchesCategory = selectedCategory === "All" || (product.category && product.category === selectedCategory);
    
    return matchesSearch && matchesPrice && matchesCategory;
  });

  // (Removed shop-level filtering) — products are filtered in `filteredProducts` and per-shop where needed

  // Random products section: pick up to 6 random products from all shops
  const randomProducts = React.useMemo(() => {
    const pool = shops.flatMap(shop => (shop.products || []).map(p => ({ ...p, shopName: shop.name, shopId: shop.id })));
    if (!pool || pool.length === 0) return [];
    // simple shuffle and take first 6
    const shuffled = pool.slice().sort(() => Math.random() - 0.5);
    return shuffled.slice(0, 6);
  }, [shops]);

  // For normal shop list view, always show shops; product lists per-shop are filtered by `selectedCategory`
  const filteredShops = shops;

  return (
    <div className="shop-list-container">
      <h1 className="shop-list-title">Shops</h1>

      {/* Search Bar */}
      <div className="search-section">
        <input
          type="text"
          placeholder="🔍 Search products or shops..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="search-input"
        />
      </div>

      {/* Price Filter - editable numeric inputs for precise control */}
      <div className="price-filter">
        <h3 className="price-filter-title">Price Range</h3>
        <div className="price-range-container price-inputs">
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            Min:
            <input
              type="number"
              min="0"
              value={priceRange[0]}
              onChange={(e) => {
                const val = e.target.value === '' ? 0 : Number(e.target.value);
                setPriceRange([isNaN(val) ? 0 : val, priceRange[1]]);
              }}
              className="price-number-input"
              aria-label="Minimum price"
            />
            ETB
          </label>

          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            Max:
            <input
              type="number"
              min="0"
              value={priceRange[1] ?? ''}
              onChange={(e) => {
                // empty input means unlimited
                if (e.target.value === '') {
                  setPriceRange([priceRange[0], null]);
                  return;
                }
                const val = Number(e.target.value);
                setPriceRange([priceRange[0], isNaN(val) ? priceRange[0] : val]);
              }}
              className="price-number-input"
              aria-label="Maximum price"
              placeholder="Unlimited"
            />
            ETB
          </label>

          {/* slider removed to avoid native controls in some browsers (Firefox) */}

          <button
            className="clear-filters-btn"
            onClick={() => setPriceRange([0, null])}
            style={{ marginLeft: '0.6rem' }}
          >
            Reset
          </button>
        </div>
      </div>

      {/* Category Filter */}
      <CategoryFilter
        categories={categories}
        selectedCategory={selectedCategory}
        onSelect={(cat) => {
          setSelectedCategory(cat);
          setSelectedShop(null);
          setSearchTerm("");
        }}
      />

      {/* Search Results OR Normal Shop List */}
      {searchTerm || (priceRange[1] !== null && priceRange[1] < 1000000000) ? (
        // Search Results View
        <div>
          <h2 className="search-results-header">
            {filteredProducts.length} products found
            {searchTerm && ` for "${searchTerm}"`}
          </h2>
          
          <div className="shop-grid">
            {shops.map((shop) => {
              const matchingCount = filteredProducts.filter(p => p.shopId === shop.id).length;
              return (
                <ShopCard
                  key={shop.id}
                  shop={shop}
                  isSelected={selectedShop?.id === shop.id}
                  onClick={() => setSelectedShop({ ...shop, products: filteredProducts.filter(p => p.shopId === shop.id) })}
                  productCount={matchingCount}
                />
              );
            })}
          </div>
{/* Show products from all shops that match search */}
          {filteredProducts.length > 0 && (
            <div className="mt-4">
              <h2 className="search-results-header">Search Results</h2>
              <div className="search-results-grid">
                {filteredProducts.map((product) => (
                  <div
                    key={product.id + '-' + product.shopId}
                    className="search-product-card"
                  >
                    <h3 className="search-product-name">{product.name}</h3>
                    <p className="search-product-shop">
                      {product.shopName}
                    </p>
                    <p className="search-product-price">
                      {product.price} ETB
                    </p>
                    <div className="search-product-actions">
                      <button
                        onClick={() => addToCart(product, "Pickup", product.shopId)}
                        className="product-action-btn pickup"
                      >
                        Pickup
                      </button>
                      <button
                        onClick={() => addToCart(product, "Delivery", product.shopId)}
                        className="product-action-btn delivery"
                      >
                        Delivery
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {filteredProducts.length === 0 && (
            <div className="no-results">
              <h3>No products found</h3>
              <p>Try adjusting your search or price range</p>
              <button
                onClick={() => {
                  setSearchTerm("");
                  setPriceRange([0, null]);
                }}
                className="clear-filters-btn"
              >
                Clear Filters
              </button>
            </div>
          )}
        </div>
      ) : (
        // Normal Shop View (when no search)
        <>
          {/* Compact header: small toggle button on the right to reveal more shops */}
          {compact && (
            <div className="shops-header">
              <div />
              <button className="compact-shops-toggle" onClick={() => setShowAllShops(s => !s)}>
                {showAllShops ? 'Hide' : 'Shops'}
              </button>
            </div>
          )}

          <div className="shop-grid">
            {(compact && !showAllShops ? filteredShops.slice(0, visibleCount) : filteredShops).map((shop) => {
              const matchingProducts = (shop.products || []).filter(p => selectedCategory === 'All' ? true : ((p.category || shop.category) === selectedCategory));
              return (
                <ShopCard
                  key={shop.id}
                  shop={shop}
                  isSelected={selectedShop?.id === shop.id}
                  onClick={() => setSelectedShop(selectedCategory === 'All' ? shop : { ...shop, products: matchingProducts })}
                  productCount={matchingProducts.length}
                />
              );
            })}
          </div>

          {/* If a shop is selected, show its products BEFORE random picks */}
          {selectedShop && <ProductList shop={selectedShop} onAddToCart={addToCart} />}

          {/* Random Picks */}
          {randomProducts.length > 0 && (
            <div className="random-products-section">
              <h2 className="random-products-title">Random Picks</h2>
              <div className="random-products-grid">
                {randomProducts.map(p => (
                  <div key={`${p.id}-${p.shopId}`} className="random-product-card">
                    <img src={p.image} alt={p.name} onError={(e)=>{e.target.src='https://images.unsplash.com/photo-1560472354-b33ff0c44a43?w=400&h=300&fit=crop'}} />
                    <div className="rpc-info">
                      <div className="rpc-name">{p.name}</div>
                      <div className="rpc-shop">{p.shopName}</div>
                      <div className="rpc-price">{p.price} ETB</div>
                      <div className="rpc-actions">
                        <button onClick={() => addToCart(p, 'Pickup', p.shopId)} className="rpc-btn pickup">Pickup</button>
                        <button onClick={() => addToCart(p, 'Delivery', p.shopId)} className="rpc-btn delivery">Delivery</button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* NOTE: Cart moved to its own page at /cart */}
    </div>
  );
};

export default ShopList;