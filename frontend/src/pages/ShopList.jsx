import React, { useState, useEffect } from "react";
import CategoryFilter from "../components/CategoryFilter";
import ShopCard from "../components/ShopCard";
import ProductList from "../components/ProductList";
import { shops as initialShops, categories as fallbackCategories } from "../data/shopsData";
import { useCart } from "../hooks/useCart";
import { useNavigate } from "react-router-dom";
import apiFetch from "../utils/apiFetch";
import { API_BASE } from '../utils/api';
import "./ShopList.css";

const ShopList = ({ compact = false }) => {
  const navigate = useNavigate();
  const [shops, setShops] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [searchTerm, setSearchTerm] = useState("");
  // priceRange: [min, max] — use `null` for unlimited max
  const [priceRange, setPriceRange] = useState([0, null]);

  // compact mode: show all shops horizontally on home page
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);

  const load = async () => {
    try {
      const data = await apiFetch(`${API_BASE}/api/shops`);
      setShops(data);
      try { localStorage.setItem('updatedShops', JSON.stringify(data)); } catch (e) {}
      return;
    } catch (e) {
      // ignore and fallback
    }

    const savedShops = localStorage.getItem('updatedShops');
    if (savedShops) setShops(JSON.parse(savedShops));
    else setShops(initialShops);
  };

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    const handleShopsUpdate = () => {
      load();
    };
    window.addEventListener('shopsUpdated', handleShopsUpdate);
    return () => window.removeEventListener('shopsUpdated', handleShopsUpdate);
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
      // keep original product-level category only (do NOT inherit from shop)
      category: product.category || '',
      // normalized category for case-insensitive comparisons
      categoryNormalized: (product.category || '').toLowerCase().trim(),
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

  // Build categories dynamically from product-level categories
  const categories = React.useMemo(() => {
    const set = new Set();
    set.add('All');
    for (const p of allProducts) {
      const c = (p.category || '').toString().trim();
      if (c) set.add(c);
    }
    const derived = Array.from(set);
    if (derived.length <= 1 && Array.isArray(fallbackCategories) && fallbackCategories.length > 1) {
      return Array.from(new Set(fallbackCategories));
    }
    return derived;
  }, [allProducts]);

  // Search and filter logic (use case-insensitive product-level category)
  const selectedCategoryNormalized = (selectedCategory || 'All').toLowerCase().trim();
  const filteredProducts = allProducts.filter(product => {
    const matchesSearch = product.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         product.shopName.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesPrice = product.price >= priceRange[0] && (priceRange[1] === null || product.price <= priceRange[1]);
    const matchesCategory = selectedCategoryNormalized === 'all' || (product.category && product.category.toLowerCase().trim() === selectedCategoryNormalized);
    return matchesSearch && matchesPrice && matchesCategory;
  });

  // (Removed shop-level filtering) — products are filtered in `filteredProducts` and per-shop where needed

  // Featured categories sections: show products from all categories
  const featuredCategoriesData = React.useMemo(() => {
    const categoryList = categories.filter(cat => cat !== 'All'); // Exclude 'All' category
    return categoryList.map(category => {
      const pool = shops.flatMap(shop =>
        (shop.products || [])
          .filter(p => (p.category || '').toLowerCase().trim() === category.toLowerCase())
          .map(p => ({ ...p, shopName: shop.name, shopId: shop.id }))
      );

      // Filter for in-stock products and take first 8 for horizontal scrolling
      const inStockPool = pool.filter(p => {
        const available = typeof p.inStock !== 'undefined' ? p.inStock : ((typeof p.stock !== 'undefined') ? p.stock > 0 : true);
        return available;
      });

      return {
        category,
        products: inStockPool.slice(0, 8) // Show up to 8 products per category
      };
    }).filter(section => section.products.length > 0); // Only show categories that have products
  }, [shops, categories]);

  // For normal shop list view, show all shops when no filters are active.
  // When any filter (search/price/category) is active, only show shops that have matching products.
  const filteredShops = shops;
  const hasActiveFilters = Boolean(searchTerm) || (priceRange[1] !== null && priceRange[1] < 1000000000) || (selectedCategory !== 'All');
  const displayedShops = hasActiveFilters
    ? filteredShops.filter(shop => filteredProducts.some(p => p.shopId === shop.id))
    : filteredShops;

  return (
    <div className="shop-list-container">
      {/* Unified Search Bar with Advanced Filters Toggle */}
      <div className="search-section">
        <div className="search-bar-container">
          <input
            type="text"
            placeholder="🔍 Search products or shops..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="search-input"
          />
          <button
            className="advanced-filters-toggle"
            onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
            aria-expanded={showAdvancedFilters}
          >
            ⚙️ Advanced
            <span className={`toggle-icon ${showAdvancedFilters ? 'expanded' : ''}`}>▼</span>
          </button>
        </div>

        {/* Collapsible Advanced Filters */}
        {showAdvancedFilters && (
          <div className="advanced-filters">
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

                <button
                  className="clear-filters-btn"
                  onClick={() => setPriceRange([0, null])}
                  style={{ marginLeft: '0.6rem' }}
                >
                  Reset
                </button>
              </div>
            </div>

            {/* Category Filter (compact/home only) */}
            {compact && (
              <CategoryFilter
                categories={categories}
                selectedCategory={selectedCategory}
                onSelect={(cat) => {
                  setSelectedCategory(cat);
                  setSearchTerm("");
                  if (selectedShop && selectedShop.id) {
                    const shopFull = shops.find(s => s.id === selectedShop.id) || selectedShop;
                    const matchingProducts = (shopFull.products || []).filter(p => cat === 'All' ? true : ((p.category || '') === cat));
                    setSelectedShop(cat === 'All' ? shopFull : { ...shopFull, products: matchingProducts });
                  }
                }}
              />
            )}
          </div>
        )}
      </div>

      <h1 className="shop-list-title">Shops</h1>

      {/* Search Results OR Normal Shop List */}
      {searchTerm || (priceRange[1] !== null && priceRange[1] < 1000000000) || (selectedCategory !== 'All') ? (
        // Search Results View
        <div>
          <h2 className="search-results-header">
            {filteredProducts.length} products found
            {searchTerm ? ` for "${searchTerm}"` : (selectedCategory !== 'All' ? ` in "${selectedCategory}"` : '')}
          </h2>
          
          <div className={`shop-grid ${compact ? 'shop-grid-horizontal' : ''}`}>
            {displayedShops.map((shop) => {
              return (
                <ShopCard
                  key={shop.id}
                  shop={shop}
                  isSelected={false}
                  onClick={() => navigate(`/shop/${shop.id}`)}
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
                    onClick={() => {
                      const pid = String(product.id || product._id || '');
                      const navId = pid.includes('-') ? pid : `${product.shopId}-${pid}`;
                      window.location.hash = `#/product/${navId}`;
                    }}
                  >
                    <div className="search-product-media">
                      <img
                        src={product.image || product.imageUrl || ''}
                        alt={product.name}
                        className="search-product-image"
                        onError={(e) => { e.target.onerror = null; e.target.src = 'https://images.unsplash.com/photo-1560472354-b33ff0c44a43?w=400&h=300&fit=crop'; }}
                      />
                    </div>
                    <h3 className="search-product-name">{product.name}</h3>
                    <p className="search-product-shop">
                      {product.shopName}
                    </p>
                    <p className="search-product-price">
                      {product.price} ETB
                    </p>
                    <div className="search-product-actions">
                      <button
                        onClick={(e) => { e.stopPropagation(); const inCartLocal = cartItems && cartItems.some(it => String(it.id) === String(product.id)); if (compact && inCartLocal) return; addToCart(product, "Pickup", product.shopId); }}
                        className="product-action-btn pickup"
                        disabled={compact && cartItems && cartItems.some(it => String(it.id) === String(product.id))}
                      >
                        Pickup
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); const inCartLocal = cartItems && cartItems.some(it => String(it.id) === String(product.id)); if (compact && inCartLocal) return; addToCart(product, "Delivery", product.shopId); }}
                        className="product-action-btn delivery"
                        disabled={compact && cartItems && cartItems.some(it => String(it.id) === String(product.id))}
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
          <div className={`shop-grid ${compact ? 'shop-grid-horizontal' : ''}`}>
            {displayedShops.map((shop) => {
              const matchingProducts = (shop.products || []).filter(p => {
                if (!p) return false;
                if (selectedCategoryNormalized === 'all') return true;
                return (p.category || '').toLowerCase().trim() === selectedCategoryNormalized;
              });

              return (
                <ShopCard
                  key={shop.id}
                  shop={shop}
                  isSelected={false}
                  onClick={() => navigate(`/shop/${shop.id}`)}
                />
              );
            })}
          </div>

          {/* Featured Categories Products */}
          {featuredCategoriesData.map(({ category, products }) => (
            products.length > 0 && (
              <div key={category} className="featured-products-section">
                <h2 className="featured-products-title">{category}</h2>
                <div className="featured-products-grid featured-products-horizontal">
                  {products.map(p => (
                    <div
                      key={`${p.id}-${p.shopId}`}
                      className="featured-product-card"
                      onClick={() => {
                        const pid = String(p.id || p._id || '');
                        const navId = pid.includes('-') ? pid : `${p.shopId}-${pid}`;
                        window.location.hash = `#/product/${navId}`;
                      }}
                    >
                      <img src={p.image} alt={p.name} onError={(e)=>{e.target.src='https://images.unsplash.com/photo-1560472354-b33ff0c44a43?w=400&h=300&fit=crop'}} />
                      <div className="fpc-info">
                        <div className="fpc-name">{p.name}</div>
                        <div className="fpc-shop">{p.shopName}</div>
                        <div className="fpc-price">{p.price} ETB</div>
                        <div className="fpc-actions">
                          <button onClick={(e) => { e.stopPropagation(); const inCartLocal = cartItems && cartItems.some(it => String(it.id) === String(p.id)); if (compact && inCartLocal) return; addToCart(p, 'Pickup', p.shopId); }} className="fpc-btn pickup" disabled={compact && cartItems && cartItems.some(it => String(it.id) === String(p.id))}>Pickup</button>
                          <button onClick={(e) => { e.stopPropagation(); const inCartLocal = cartItems && cartItems.some(it => String(it.id) === String(p.id)); if (compact && inCartLocal) return; addToCart(p, 'Delivery', p.shopId); }} className="fpc-btn delivery" disabled={compact && cartItems && cartItems.some(it => String(it.id) === String(p.id))}>Delivery</button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )
          ))}
        </>
      )}

      {/* NOTE: Cart moved to its own page at /cart */}
    </div>
  );
};

export default ShopList;