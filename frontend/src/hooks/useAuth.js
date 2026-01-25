import { useEffect, useState, useCallback } from 'react';
import { useApp } from '../contex/AppContext.jsx';

export const useAuth = () => {
  const { state, dispatch } = useApp();
  const [loading, setLoading] = useState(true);

  const user = state?.user || null;

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const res = await fetch('/api/me', { credentials: 'include' });
        if (!mounted) return;
        if (res.ok) {
          const data = await res.json();
          dispatch({ type: 'SET_USER', payload: data.user });
        } else {
          dispatch({ type: 'SET_USER', payload: null });
        }
      } catch (e) {
        dispatch({ type: 'SET_USER', payload: null });
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [dispatch]);

  const login = useCallback(async ({ username, password }) => {
    try {
      const res = await fetch(`${import.meta.env.https://nega-m5uz.onrender.com}/api/login`,
, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ username, password }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        return { ok: false, message: err.message || 'Login failed' };
      }
      const data = await res.json();
      dispatch({ type: 'SET_USER', payload: data.user });
      // After login, merge any locally-saved guest orders into server-side orders
      try {
        const guest = JSON.parse(localStorage.getItem('guestOrders') || '[]');
        if (Array.isArray(guest) && guest.length) {
          for (const g of guest) {
            try {
              const payload = {
                shopId: g.shopId || g.shopId,
                items: (g.items || []).map(i => ({ productId: i.productId ?? i.id ?? i._id, qty: i.qty ?? i.quantity ?? 1, price: i.price ?? i.unitPrice ?? 0, name: i.name })),
                total: g.total || (g.payment && g.payment.amount) || 0,
                customer: g.customer || {}
              };
              await fetch('/api/orders', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
            } catch (e) {
              // ignore individual merge failures
            }
          }
          // clear guest orders after attempting merge
          localStorage.removeItem('guestOrders');
        }
      } catch (e) {
        // ignore merge errors
      }
      return { ok: true, user: data.user };
    } catch (e) {
      return { ok: false, message: 'Network error' };
    }
  }, [dispatch]);

  const logout = useCallback(async () => {
    try {
      await fetch('/api/logout', { method: 'POST', credentials: 'include' });
    } catch (e) {
      // ignore
    }
    dispatch({ type: 'SET_USER', payload: null });
  }, [dispatch]);

  const register = useCallback(async (payload) => {
    try {
      const res = await fetch('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        return { ok: false, message: err.message || 'Registration failed' };
      }
      const data = await res.json();
      dispatch({ type: 'SET_USER', payload: data.user });
      return { ok: true, user: data.user };
    } catch (e) {
      return { ok: false, message: 'Network error' };
    }
  }, []);

  const assignedShop = user && (typeof user.shopId !== 'undefined' && user.shopId !== null) ? Number(user.shopId) : null;

  return {
    user,
    isAdmin: !!(user && user.role === 'admin'),
    isShopOwner: !!(user && user.role === 'shop_owner'),
    isCustomer: !!(user && user.role === 'customer'),
    loading,
    login,
    logout,
    register,
    assignedShop,
  };
};

