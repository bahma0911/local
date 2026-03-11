// src/hooks/useOrders.js
import { useState, useEffect } from 'react';
import { useAuth } from './useAuth';
import apiFetch from '../utils/apiFetch';
import { API_BASE } from '../utils/api';

export const useOrders = () => {
  const { isShopOwner, assignedShop } = useAuth();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchOrders = async () => {
      if (!isShopOwner || !assignedShop) {
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        const data = await apiFetch(`${API_BASE}/api/shops/${assignedShop}/orders`);
        setOrders((data || []).reverse());
        setError(null);
      } catch (err) {
        console.error('Failed to fetch orders', err);
        setError(err.message || 'Failed to fetch orders');
      } finally {
        setLoading(false);
      }
    };

    fetchOrders();
  }, [isShopOwner, assignedShop]);

  const pendingCount = orders.filter(order => order.status === 'pending').length;

  return {
    orders,
    pendingCount,
    loading,
    error,
    refetch: () => {
      if (isShopOwner && assignedShop) {
        apiFetch(`${API_BASE}/api/shops/${assignedShop}/orders`)
          .then(data => setOrders((data || []).reverse()))
          .catch(err => console.error('Failed to refetch orders', err));
      }
    }
  };
};