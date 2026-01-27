// src/App.jsx - DEBUG VERSION
import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import Home from "./pages/Home";
import CartPage from "./pages/CartPage";
import AdminLogin from "./pages/AdminLogin";
import AdminDashboard from "./pages/AdminDashboard";
import Checkout from "./pages/Checkout";
import Orders from "./pages/Orders";
import AdminOrders from "./pages/AdminOrders";
import UserProfile from "./pages/UserProfile";
import OrderTracking from "./pages/OrderTracking";
import Wishlist from "./pages/Wishlist";
import CustomerDashboard from "./pages/CustomerDashboard";
import ErrorBoundary from "./components/ErrorBoundary";
import Login from "./pages/Login";
import ProtectedRoute from "./components/ProtectedRoute";
import Register from "./pages/Register";
import { useAuth } from "./hooks/useAuth";
import "./App.css";

const RouteTester = () => {
  const navigate = useNavigate();
  return (
    <div style={{ padding: '2rem' }}>
      <h2>Route Tester</h2>
      <button onClick={() => navigate('/wishlist')}>Test Wishlist</button>
      <button onClick={() => navigate('/orders')}>Test Orders</button>
    </div>
  );
};

const AppContent = () => {
  const { isAdmin, isShopOwner, user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  // Debug logs removed

  const handleLogoClick = () => {
    // Debug log removed
    navigate("/");
  };

  // Enhanced navigation with error handling
  const navigateTo = (path, requireAuth = false) => {
    // Debug log removed
    
    if (requireAuth && !user) {
      alert("Please login to access this page");
      navigate("/admin/login");
      return;
    }
    
    navigate(path);
  };

  const handleLogout = () => {
    if (window.confirm("Are you sure you want to logout?")) {
      logout();
    }
  };

  // Cart badge that reads the centralized localStorage cart and
  // updates when the app dispatches the `cart_updated` event or when
  // localStorage changes (cross-tab).
  function CartBadge() {
    const [count, setCount] = useState(0);

    const readCount = () => {
      try {
        const raw = localStorage.getItem('shopCart');
        if (!raw) { setCount(0); return; }
        const items = JSON.parse(raw);
        if (!Array.isArray(items)) { setCount(0); return; }
        const hasQty = items.some(i => typeof i.quantity === 'number');
        const total = hasQty ? items.reduce((s, it) => s + (Number(it.quantity) || 0), 0) : items.length;
        setCount(total);
      } catch (e) {
        console.error('CartBadge read error', e);
        setCount(0);
      }
    };

    useEffect(() => {
      readCount();
      const onCart = () => readCount();
      window.addEventListener('cart_updated', onCart);
      const onStorage = (e) => { if (e.key === 'shopCart') readCount(); };
      window.addEventListener('storage', onStorage);
      return () => {
        window.removeEventListener('cart_updated', onCart);
        window.removeEventListener('storage', onStorage);
      };
    }, []);

    if (!count || count <= 0) return null;
    return (
      <span className="cart-badge" aria-hidden="true">{count}</span>
    );
  }

  return (
    <div className="App">
      {/* Navigation Bar */}
      <div className="app-header">
        <div className="app-header-content">
          <h1 
            className="app-logo" 
            onClick={handleLogoClick}
            style={{ cursor: 'pointer' }}
          >
            🛍️ Negadras Market
          </h1>
          
          <div className="app-nav-buttons">
            {/* Cart Button */}
            <button
              onClick={() => navigateTo('/cart')}
              className="nav-button"
              style={{ position: 'relative' }}
            >
              <span className="btn-icon">🛒</span>
              <span className="btn-text">Cart</span>
              <CartBadge />
            </button>

            {/* Wishlist Button */}
            <button
              onClick={() => navigateTo('/wishlist')}
              className="nav-button nav-button-wishlist"
            >
              <span className="btn-icon">❤️</span>
              <span className="btn-text">Wishlist</span>
            </button>

            {/* Orders Button */}
            <button
              onClick={() => navigateTo('/orders')}
              className="nav-button"
            >
              <span className="btn-icon">📦</span>
              <span className="btn-text">Orders</span>
            </button>

            {/* Track Button */}
            <button
              onClick={() => navigateTo('/tracking')}
              className="nav-button nav-button-track"
            >
              <span className="btn-icon">🚚</span>
              <span className="btn-text">Track</span>
            </button>

            {/* Admin link: visible to admin users and shop owners (shop owners use same dashboard for 'My Shop') */}
            {(isAdmin || isShopOwner) && (
              <button
                onClick={() => navigateTo('/admin/dashboard')}
                className="nav-button"
              >
                <span className="btn-icon">🏬</span>
                <span className="btn-text">Admin</span>
              </button>
            )}

            {/* Auth buttons: show Login when anonymous, or username + Logout when authenticated */}
            {user ? (
              <>
                <button
                  onClick={() => navigateTo('/profile')}
                  className="nav-button"
                >
                  <span className="btn-icon">👤</span>
                  <span className="btn-text">{user.username || user.email || 'Profile'}</span>
                </button>
              </>
            ) : (
              <button
                onClick={() => navigate('/login')}
                className="nav-button nav-button-login"
              >
                <span className="btn-icon">🔒</span>
                <span className="btn-text">Login</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <ErrorBoundary>
        <div className="app-main">
          <Routes>
            {/* Customer Routes */}
            <Route path="/" element={<Home />} />
            <Route path="/cart" element={<CartPage />} />
            <Route path="/checkout" element={<Checkout />} />
            <Route path="/orders" element={<ProtectedRoute><Orders /></ProtectedRoute>} />
            <Route path="/tracking" element={<OrderTracking />} />
            <Route path="/wishlist" element={<ProtectedRoute><Wishlist /></ProtectedRoute>} />
            <Route path="/profile" element={<ProtectedRoute><UserProfile /></ProtectedRoute>} />
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="/customer-dashboard" element={<CustomerDashboard />} />
            
            {/* Admin Routes */}
            <Route path="/admin/login" element={<AdminLogin />} />
            <Route path="/admin/dashboard" element={<AdminDashboard />} />
            <Route path="/admin/orders" element={<AdminOrders />} />
            
            <Route path="/test-routes" element={<RouteTester />} />
            
            {/* Fallback route */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </div>
      </ErrorBoundary>
    </div>
  );
};

function App() {
  return (
    <BrowserRouter>
      <AppContent />
    </BrowserRouter>
  );
}

export default App;