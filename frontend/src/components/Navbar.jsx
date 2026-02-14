import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import styles from './Navbar.module.css';
import NotificationBell from './NotificationBell';

// Small badge component that reads the existing cart from localStorage
// and updates reactively when other parts of the app dispatch the
// "cart_updated" event or when localStorage changes in another tab.
function CartBadge() {
  const [count, setCount] = useState(0);

  const readCount = () => {
    try {
      const raw = localStorage.getItem('shopCart');
      if (!raw) {
        setCount(0);
        return;
      }
      const items = JSON.parse(raw);
      if (!Array.isArray(items)) {
        setCount(0);
        return;
      }
      const hasQty = items.some(i => typeof i.quantity === 'number');
      const total = hasQty ? items.reduce((s, it) => s + (Number(it.quantity) || 0), 0) : items.length;
      setCount(total);
    } catch (e) {
      console.error('CartBadge: failed to read cart', e);
      setCount(0);
    }
  };

  useEffect(() => {
    readCount();
    const onCartUpdated = () => readCount();
    window.addEventListener('cart_updated', onCartUpdated);
    const onStorage = (e) => {
      if (e.key === 'shopCart') readCount();
    };
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener('cart_updated', onCartUpdated);
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  if (!count || count <= 0) return null;

  return (
    <span className={styles.badge} aria-hidden="true">{count}</span>
  );
}

export default function Navbar() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  // Build nav items here so we can use `navigate` for internal routes
  const NAV_ITEMS = [
    // keep Cart in the menu for mobile/expanded menu, but render a
    // dedicated cart icon with badge in the header for visibility
    { icon: '🛒', label: 'Cart', path: '/cart' },
    { icon: '❤️', label: 'Wishlist', path: '/wishlist' },
    { icon: '📦', label: 'Orders', path: '/orders' },
    { icon: '🔐', label: 'Login', path: '/admin/login' },
  ];

  // Close menu on nav click (mobile)
  const handleNavClick = (cb) => {
    setOpen(false);
    cb && cb();
  };

  return (
    <nav className={styles.navbar}>
      <div className={styles.navbarContent}>
        <div className={styles.logo} onClick={() => navigate('/') }>
          <span className={styles.logoIcon}>🛍️</span>
          <span className={styles.logoText}>Negadras Market</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
          {/* Cart icon with live badge */}
          <button
            className={styles.iconButton}
            aria-label="Open cart"
            onClick={() => navigate('/cart')}
            style={{ position: 'relative' }}
          >
            <span style={{ fontSize: '1.15rem' }}>🛒</span>
            {/** badge shown only when count > 0 (managed below) */}
            {typeof window !== 'undefined' && (
              <CartBadge />
            )}
          </button>

          <NotificationBell />
        </div>
        <button
          className={styles.hamburger}
          aria-label={open ? 'Close menu' : 'Open menu'}
          onClick={() => setOpen((v) => !v)}
        >
          <span>{open ? '✖' : '☰'}</span>
        </button>
        <div
          className={
            styles.menu +
            ' ' +
            (open ? styles.open : '')
          }
          style={open ? { pointerEvents: 'auto' } : { pointerEvents: 'none' }}
        >
          {NAV_ITEMS.map((item) => (
            <button
              key={item.label}
              className={styles.menuButton}
              onClick={() => handleNavClick(() => { if (item.path) navigate(item.path); else if (item.onClick) item.onClick(); })}
              style={{ fontSize: '1.1rem', display: 'flex', alignItems: 'center', gap: '0.5em', background: 'none' }}
            >
              <span>{item.icon}</span>
              <span style={{ fontSize: '1em' }}>{item.label}</span>
            </button>
          ))}
        </div>
      </div>
    </nav>
  );
}

// Theme toggle was moved to the profile page
