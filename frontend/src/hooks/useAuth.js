import { useEffect, useState, useCallback } from 'react';
import { useApp } from '../contex/AppContext.jsx';

const API_BASE = 'https://nega-m5uz.onrender.com';

export const useAuth = () => {
  const { state, dispatch } = useApp();
  const [loading, setLoading] = useState(true);

  const user = state?.user || null;

  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        const res = await fetch(`${API_BASE}/api/me`, {
          credentials: 'include',
        });

        if (!mounted) return;

        if (res.ok) {
          const data = await res.json();
          dispatch({ type: 'SET_USER', payload: data.user });
        } else {
          dispatch({ type: 'SET_USER', payload: null });
        }
      } catch {
        dispatch({ type: 'SET_USER', payload: null });
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [dispatch]);

  const login = useCallback(async ({ username, password }) => {
    try {
      const res = await fetch(`${API_BASE}/api/login`, {
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

      // merge guest orders after login
      try {
        const guest = JSON.parse(localStorage.getItem('guestOrders') || '[]');

        if (Array.isArray(guest) && guest.length) {
          for (const g of guest) {
            const payload = {
              shopId: g.shopId,
              items: (g.items || []).map(i => ({
                productId: i.productId ?? i.id ?? i._id,
                qty: i.qty ?? i.quantity ?? 1,
                price: i.price ?? i.unitPrice ?? 0,
                name: i.name,
              })),
              total: g.total || g.payment?.amount || 0,
              customer: g.customer || {},
            };

            try {
              await fetch(`${API_BASE}/api/orders`, {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
              });
            } catch {
              // ignore individual order failures
            }
          }

          localStorage.removeItem('guestOrders');
        }
      } catch {
        // ignore merge errors
      }

      return { ok: true, user: data.user };
    } catch {
      return { ok: false, message: 'Network error' };
    }
  }, [dispatch]);

  const logout = useCallback(async () => {
    try {
      await fetch(`${API_BASE}/api/logout`, {
        method: 'POST',
        credentials: 'include',
      });
    } catch {
      // ignore
    }

    dispatch({ type: 'SET_USER', payload: null });
  }, [dispatch]);

  const register = useCallback(async (payload) => {
    try {
      const res = await fetch(`${API_BASE}/api/register`, {
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
    } catch {
      return { ok: false, message: 'Network error' };
    }
  }, [dispatch]);

  const assignedShop =
    user && user.shopId !== undefined && user.shopId !== null
      ? Number(user.shopId)
      : null;

  return {
    user,
    isAdmin: user?.role === 'admin',
    isShopOwner: user?.role === 'shop_owner',
    isCustomer: user?.role === 'customer',
    loading,
    login,
    logout,
    register,
    assignedShop,
  };
};
