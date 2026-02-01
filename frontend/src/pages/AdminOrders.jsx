import React, { useEffect, useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import apiFetch from '../utils/apiFetch';
import './AdminOrders.css';

const AdminOrders = () => {
  const { isAdmin } = useAuth();
  const [orders, setOrders] = useState([]);
  const [shopsMap, setShopsMap] = useState({});
  const [page, setPage] = useState(1);
  const [limit] = useState(20);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [shopName, setShopName] = useState('');
  const [shopId, setShopId] = useState('');
  const [orderStatus, setOrderStatus] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  useEffect(() => {
    if (!isAdmin) return;
    // fetch shops to map shopId -> shop name for display
    (async () => {
      try {
        const s = await apiFetch('/api/shops');
        const map = (s || []).reduce((acc, sh) => { acc[Number(sh.id)] = sh.name || null; return acc; }, {});
        setShopsMap(map);
        // refresh orders after shops map is available so names resolve
        try { await fetchOrders(); } catch (e) { }
      } catch (e) {
        // ignore
      }
    })();
  }, [isAdmin, page, search, shopId, orderStatus, startDate, endDate, customerName, shopName]);

  const fetchOrders = async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set('page', String(page));
      params.set('limit', String(limit));
      if (search) params.set('search', search);
      if (customerName) params.set('customerName', customerName);
      if (shopName) params.set('shopName', shopName);
      if (shopId) params.set('shopId', shopId);
      if (orderStatus) params.set('status', orderStatus);
      if (startDate) params.set('startDate', startDate);
      if (endDate) params.set('endDate', endDate);

      const data = await apiFetch(`/api/admin/orders?${params.toString()}`);
      const raw = data.orders || [];
      // Normalize backend shape to UI shape
      const normalized = raw.map(o => ({
        orderId: o.orderId || o.id || (o._id ? String(o._id) : ''),
        userId: (o.userId) || (o.customer && (o.customer.name || o.customer.fullName || o.customer.username)) || null,
        shopId: (o.shop && (o.shop.shopId || o.shop.id)) || o.shopId || null,
        shopName: (o.shop && (o.shop.name)) || shopsMap[((o.shop && (o.shop.shopId || o.shop.id)) || o.shopId)] || null,
        items: (o.items || []).map(it => ({ name: it.name || it.title || '', quantity: it.quantity ?? it.qty ?? it.qty ?? 0 })),
        totalAmount: o.total ?? o.amount ?? o.totalAmount ?? null,
        paymentStatus: o.paymentStatus ?? (o.payment && o.payment.status) ?? null,
        orderStatus: o.status ?? o.orderStatus ?? null,
        createdAt: o.createdAt || o.receivedAt || null,
      }));
      setOrders(normalized);
      setTotal(data.total || normalized.length || 0);
    } catch (err) {
      console.error(err);
      if (err && (err.status === 401 || err.status === 403)) {
        setError({ code: err.status, message: err.status === 403 ? 'Forbidden: admin only' : 'Not authenticated' });
        setOrders([]);
        setTotal(0);
      } else {
        setError({ message: err.message || 'Server error' });
      }
    } finally {
      setLoading(false);
    }
  };

  if (!isAdmin) {
    return (
      <div style={{ padding: '2rem' }}>
        <h2>403 Forbidden</h2>
        <p>You do not have permission to access this page.</p>
      </div>
    );
  }

  return (
    <div className="admin-orders">
      <h1>Admin — Orders (Read-Only)</h1>
      <div className="ao-controls">
        <input placeholder="Search by order ID or user email" value={search} onChange={e => setSearch(e.target.value)} />
        <input placeholder="Customer name or email" value={customerName} onChange={e => setCustomerName(e.target.value)} />
        <input placeholder="Shop name" value={shopName} onChange={e => setShopName(e.target.value)} />
        <input placeholder="Shop ID" value={shopId} onChange={e => setShopId(e.target.value)} />
        <select value={orderStatus} onChange={e => setOrderStatus(e.target.value)}>
          <option value="">All Statuses</option>
          <option value="pending">Pending</option>
          <option value="confirmed">Confirmed</option>
          <option value="picked_up">Picked Up</option>
          <option value="delivered">Delivered</option>
          <option value="cancelled">Cancelled</option>
        </select>
        <label>From: <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} /></label>
        <label>To: <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} /></label>
        <button onClick={() => { setPage(1); fetchOrders(); }}>Filter</button>
      </div>

      {loading ? (
        <div className="ao-loading">Loading…</div>
      ) : error ? (
        <div className="ao-error">
          <h3>{error.code ? `${error.code} — ${error.message}` : 'Error'}</h3>
          <p>{error.message}</p>
        </div>
      ) : (
        <>
          <div className="ao-summary">Showing {orders.length} of {total} orders</div>
          <div className="ao-table-wrap">
            <table className="ao-table">
              <thead>
                <tr>
                  <th>Order ID</th>
                  <th>User</th>
                  <th>Shop</th>
                  <th>Items</th>
                  <th>Total</th>
                  <th>Payment</th>
                  <th>Status</th>
                  <th>Created</th>
                </tr>
              </thead>
              <tbody>
                {orders.length === 0 && (
                  <tr><td colSpan={8}>No orders</td></tr>
                )}
                {orders.map(o => (
                  <tr key={String(o.orderId)}>
                    <td>{o.orderId}</td>
                    <td>{o.userId}</td>
                    <td>{o.shopName || o.shopId}</td>
                    <td>
                      {o.items && o.items.length ? (
                        o.items.slice(0,3).map((it, i) => <div key={i}>{it.name} × {it.quantity}</div>)
                      ) : '—'}
                    </td>
                    <td>{o.totalAmount}</td>
                    <td>{o.paymentStatus}</td>
                    <td>{o.orderStatus}</td>
                    <td>{o.createdAt ? new Date(o.createdAt).toLocaleString() : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="ao-pagination">
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}>Prev</button>
            <span>Page {page}</span>
            <button onClick={() => setPage(p => p + 1)} disabled={orders.length < limit}>Next</button>
          </div>
        </>
      )}

    </div>
  );
};

export default AdminOrders;
