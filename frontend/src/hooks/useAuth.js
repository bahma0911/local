import { useEffect, useState, useCallback } from 'react';
import { useApp } from '../contex/AppContext.jsx';
import apiFetch from '../utils/apiFetch';

export const useAuth = () => {
  const { state, dispatch } = useApp();
  const [loading, setLoading] = useState(true);

  const user = state?.user || null;

  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        const data = await apiFetch('/api/me');

        if (!mounted) return;

        dispatch({ type: 'SET_USER', payload: data.user });
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
      const data = await apiFetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });

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
              await apiFetch('/api/orders', {
                method: 'POST',
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
      await apiFetch('/api/logout', { method: 'POST' });
    } catch {
      // ignore
    }

    dispatch({ type: 'SET_USER', payload: null });
  }, [dispatch]);

  const register = useCallback(async (payload) => {
    try {
      const data = await apiFetch('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      dispatch({ type: 'SET_USER', payload: data.user });

      return { ok: true, user: data.user };
    } catch (err) {
      return { ok: false, message: (err && err.response && err.response.message) ? err.response.message : 'Network error' };
    }
  }, [dispatch]);

  const updateCustomerProfile = useCallback(async (payload) => {
    try {
      const data = await apiFetch('/api/me', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      // update local user state with returned user
      if (data && data.user) dispatch({ type: 'SET_USER', payload: data.user });
      return { ok: true, user: data && data.user ? data.user : null };
    } catch (err) {
      return { ok: false, message: (err && err.response && err.response.message) ? err.response.message : 'Failed to update profile', response: err && err.response };
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
    updateCustomerProfile,
    assignedShop,
  };
};
