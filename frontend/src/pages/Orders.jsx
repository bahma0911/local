// src/pages/Orders.jsx - COMPLETE ENHANCED VERSION
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCart } from '../hooks/useCart';
import { useAuth } from '../hooks/useAuth';
import "./Orders.css";
import apiFetch from '../utils/apiFetch';
import { API_BASE } from '../utils/api';
import ReviewForm from '../components/ReviewForm';
import ReviewsList from '../components/ReviewsList';

const Orders = () => { 
  const { addToCart } = useCart();
  const [orders, setOrders] = useState([]);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [reviewsByProduct, setReviewsByProduct] = useState({});
  const [canReviewByProduct, setCanReviewByProduct] = useState({});
  const [loadingReviewsByProduct, setLoadingReviewsByProduct] = useState({});
  const [filter, setFilter] = useState('all');

  // Load user and orders from localStorage
  const { user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    const fetchMyOrders = async () => {
      if (!user || user.role !== 'customer') {
        // If no authenticated customer, load any locally-saved guest orders
        try {
          const guest = JSON.parse(localStorage.getItem('guestOrders') || '[]');
          if (guest && guest.length) {
            setOrders(guest.slice().sort((a,b)=> new Date(b.createdAt||b.receivedAt||b.updatedAt).getTime() - new Date(a.createdAt||a.receivedAt||a.updatedAt).getTime()));
          }
        } catch (e) { /* ignore */ }
        return;
      }
      try {
        let data = await apiFetch(`${API_BASE}/api/orders/my`);
        // Remove cancelled orders older than 7 days
        const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
        data = (data || []).filter(o => {
          if (!o) return false;
          const status = (o.status || '').toLowerCase();
          if (status !== 'cancelled') return true;
          const time = new Date(o.updatedAt || o.receivedAt || o.createdAt).getTime() || 0;
          return time >= sevenDaysAgo;
        });
        // Sort orders so newest appear first (robust to different timestamp fields)
        const sorted = data.slice().sort((a, b) => {
          const aTime = new Date(a.createdAt || a.receivedAt || a.updatedAt).getTime() || 0;
          const bTime = new Date(b.createdAt || b.receivedAt || b.updatedAt).getTime() || 0;
          return bTime - aTime;
        });
        setOrders(sorted);
      } catch (err) {
        console.error('Failed to fetch orders', err);
      }
    };
    fetchMyOrders();
  }, [user]);

  // When viewing a selected order, fetch reviews & eligibility for its items
  useEffect(() => {
    if (!selectedOrder) return;
    const items = getOrderItems(selectedOrder).map((it, idx) => normalizeItem(it, idx));

    const fetchForProduct = async (productId) => {
      if (!productId) return;
      setLoadingReviewsByProduct(prev => ({ ...prev, [productId]: true }));
      try {
        const data = await apiFetch(`${API_BASE}/api/products/${productId}/reviews`);
        setReviewsByProduct(prev => ({ ...prev, [productId]: { reviews: data.reviews || [], average: data.average || 0, count: data.count || 0 } }));
      } catch (e) {
        setReviewsByProduct(prev => ({ ...prev, [productId]: { reviews: [], average: 0, count: 0 } }));
      }
      try {
        const elig = await apiFetch(`${API_BASE}/api/products/${productId}/reviews/eligibility`);
        setCanReviewByProduct(prev => ({ ...prev, [productId]: !!(elig && elig.canReview) }));
      } catch (e) {
        setCanReviewByProduct(prev => ({ ...prev, [productId]: false }));
      }
      setLoadingReviewsByProduct(prev => ({ ...prev, [productId]: false }));
    };

    items.forEach(it => fetchForProduct(it.id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedOrder]);
  


  const filteredOrders = orders.filter(order => {
    if (filter === 'all') return true;
    return order.status === filter;
  });

  const getStatusBadge = (order) => {
    const statusConfig = {
      'pending': { class: 'status-pending', text: 'Pending', icon: '⏳' },
      'confirmed': { class: 'status-confirmed', text: 'Confirmed', icon: '✅' },
      'picked_up': { class: 'status-pickedup', text: 'Picked Up', icon: '🏁' },
      'delivered': { class: 'status-delivered', text: 'Delivered', icon: '🎉' },
      'cancelled': { class: 'status-cancelled', text: 'Cancelled', icon: '❌' }
    };
    
    const config = statusConfig[order.status] || statusConfig.pending;
    return (
      <span className={`status-badge ${config.class}`}>
        {config.icon} {config.text}
      </span>
    );
  };

  // Normalize order item shapes from different backend storage formats
  const getOrderItems = (order) => {
    if (!order) return [];
    if (Array.isArray(order.items) && order.items.length) return order.items;
    if (Array.isArray(order.products) && order.products.length) return order.products;
    if (order.itemsByShop && typeof order.itemsByShop === 'object') {
      try {
        return Object.values(order.itemsByShop).flatMap(s => (s.items || s)).filter(Boolean);
      } catch (e) { /* ignore */ }
    }
    return [];
  };

  const normalizeItem = (item, idx) => {
    if (!item) return { id: `itm-${idx}`, name: 'Unknown', quantity: 0, price: 0 };
    const qty = Number(item.quantity ?? item.qty ?? item.count ?? 0) || 0;
    const price = Number(item.price ?? item.unitPrice ?? item.amount ?? 0) || 0;
    const id = item.id ?? item.productId ?? item._id ?? `itm-${idx}`;
    const name = item.name ?? item.title ?? item.productName ?? 'Item';
    const image = item.image || item.photo || item.thumbnail || '';
    return { id, name, quantity: qty, price, image };
  };

  // Customer extraction helpers (handle varied backend shapes)
  const getCustomerObject = (order) => {
    if (!order) return {};
    const c = order.customer || {};
    const meta = order.customerMeta || {};
    if (typeof c === 'string') return { username: c, email: meta.email || '', phone: meta.phone || '' };
    return { ...meta, ...c };
  };

  const looksLikeEmail = (v) => typeof v === 'string' && v.includes('@');
  const looksLikePhone = (v) => typeof v === 'string' && /\d{6,}/.test((v || '').replace(/[^0-9]/g, ''));

  const getDisplayEmail = (order) => {
    const c = getCustomerObject(order);
    if (looksLikeEmail(c.email)) return c.email;
    if (looksLikeEmail(c.username)) return c.username;
    if (looksLikeEmail(order.email)) return order.email;
    return null;
  };

  const getDisplayPhone = (order) => {
    const c = getCustomerObject(order);
    if (looksLikePhone(c.phone)) return c.phone;
    if (looksLikePhone(order.phone)) return order.phone;
    return null;
  };

  const getDisplayAddress = (order) => {
    const c = getCustomerObject(order);
    return c.address || order.address || null;
  };

  const getDisplayCity = (order) => {
    const c = getCustomerObject(order);
    return c.city || order.city || null;
  };

  const handleCancelOrder = (orderId) => {
    if (!orderId) return;
    if (!window.confirm('Are you sure you want to cancel this order?')) return;

    (async () => {
      try {
      await apiFetch(`${API_BASE}/api/orders/${orderId}`, { method: 'DELETE' });
        // remove from local state
        setOrders(prev => prev.filter(o => String(o.id || o.orderId || o._id) !== String(orderId)));
        // if currently viewing details for this order, go back
        if (selectedOrder && String(selectedOrder.id || selectedOrder.orderId || selectedOrder._id) === String(orderId)) {
          setSelectedOrder(null);
        }
        alert('Order cancelled successfully');
      } catch (err) {
        console.error('Cancel order error', err);
        alert('Failed to cancel order due to network error');
      }
    })();
  };

  const handleReorder = (order) => {
    if (!window.confirm('Add items from this order to your cart?')) return;

    let successCount = 0;
    getOrderItems(order).forEach(item => {
      const raw = normalizeItem(item);
      const shops = JSON.parse(localStorage.getItem('updatedShops') || '[]');
      const shop = shops.find(s => s.products.some(p => p.id === raw.id));
      if (shop) {
        const added = addToCart({ id: raw.id, name: raw.name, price: raw.price, quantity: raw.quantity }, "Delivery", shop.id);
        if (added) successCount++;
      }
    });

    alert(`Added ${successCount} items to cart!`);
    setTimeout(() => {
      navigate('/');
    }, 100);
  };

  const navigateTo = (path) => {
    setTimeout(() => {
      navigate(path);
    }, 100);
  };

  const getTotalItems = (order) => {
    const items = getOrderItems(order).map(normalizeItem);
    return items.reduce((sum, it) => sum + (Number(it.quantity) || 0), 0);
  };

  if (!user) {
    return (
      <div className="orders-container">
        <h2>Please login to view your orders</h2>
        <button onClick={() => navigateTo('/admin/login')} className="login-btn">
          Login
        </button>
      </div>
    );
  }

  if (selectedOrder) {
    return (
      <div className="order-details-container">
        <div className="order-details-header">
          <button onClick={() => setSelectedOrder(null)} className="back-btn">
            ← Back to Orders
          </button>
          <h1>Order Details</h1>
        </div>

        <div className="order-details-card">
          <div className="order-details-section">
            <h3>Order Information</h3>
            <div className="order-info-grid">
              <div className="info-item">
                <strong>Order ID:</strong>
                <span>{selectedOrder.id}</span>
              </div>
              <div className="info-item">
                <strong>Order Date:</strong>
                <span>{new Date(selectedOrder.createdAt).toLocaleDateString()}</span>
              </div>
              <div className="info-item">
                <strong>Status:</strong>
                <span>{getStatusBadge(selectedOrder)}</span>
              </div>
              <div className="info-item">
                <strong>Total Amount:</strong>
                <span>{(selectedOrder.total ?? getOrderItems(selectedOrder).reduce((s, it, i) => s + (Number(normalizeItem(it, i).price) * Number(normalizeItem(it, i).quantity)), 0))} ETB</span>
              </div>
            </div>
          </div>

          <div className="order-details-section">
            <h3>Customer Information</h3>
            <div className="customer-info">
              <p><strong>Name:</strong> {selectedOrder.customer?.fullName || selectedOrder.customer?.name || selectedOrder.customer?.username || selectedOrder.createdBy || 'Unknown'}</p>
              <p><strong>Email:</strong> {getDisplayEmail(selectedOrder) || '—'}</p>
              <p><strong>Phone:</strong> {getDisplayPhone(selectedOrder) || '—'}</p>
              <p><strong>Address:</strong> {getDisplayAddress(selectedOrder) || '—'}</p>
              <p><strong>City:</strong> {getDisplayCity(selectedOrder) || '—'}</p>
            </div>
          </div>

          <div className="order-details-section">
            <h3>Payment Information</h3>
            <div className="payment-info">
              <p><strong>Method:</strong> {selectedOrder.paymentMethod || selectedOrder.payment?.method || 'Cash'}</p>
              <p><strong>Status:</strong> {(selectedOrder.payment?.status || selectedOrder.paymentStatus || (selectedOrder.status === 'delivered' ? 'Paid' : 'Pending'))}</p>
              <p><strong>Amount:</strong> {(selectedOrder.payment?.amount ?? selectedOrder.total ?? getOrderItems(selectedOrder).reduce((s, it, i) => s + (Number(normalizeItem(it, i).price) * Number(normalizeItem(it, i).quantity)), 0))} ETB</p>
              {((selectedOrder.payment && selectedOrder.payment.paidAt) || selectedOrder.paymentStatus === 'paid') && (
                <p><strong>Paid At:</strong> {selectedOrder.payment?.paidAt ? new Date(selectedOrder.payment.paidAt).toLocaleString() : '—'}</p>
              )}
            </div>
          </div>

          <div className="order-details-section">
            <h3>Order Items</h3>
            <div className="order-items-list">
              {getOrderItems(selectedOrder).map((rawItem, idx) => {
                const item = normalizeItem(rawItem, idx);
                return (
                  <div key={item.id} className="order-item-detail">
                    <img
                      src={item.image}
                      alt={item.name}
                      onError={(e) => { e.target.src = "https://images.unsplash.com/photo-1560472354-b33ff0c44a43?w=400&h=300&fit=crop"; }}
                    />
                    <div className="item-detail-info">
                      <h4>{item.name}</h4>
                      <p className="item-price">{item.price} ETB each</p>
                      <p className="item-quantity">Quantity: {item.quantity}</p>
                      <p className="item-total">Total: {item.price * item.quantity} ETB</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="order-actions">
            {selectedOrder.status === 'pending' && (
              <button onClick={() => handleCancelOrder(selectedOrder.id)} className="cancel-order-btn">
                Cancel Order
              </button>
            )}
            <button onClick={() => handleReorder(selectedOrder)} className="reorder-btn">
              Reorder Items
            </button>
            <button onClick={() => navigateTo('/tracking')} className="track-order-btn">
              Track Order
            </button>
          </div>

          {(selectedOrder.status === 'picked_up' || selectedOrder.status === 'delivered') && (
            <div className="order-details-section">
              <h3>Reviews for items in this order</h3>
              {getOrderItems(selectedOrder).map((rawItem, idx) => {
                const item = normalizeItem(rawItem, idx);
                const prodId = item.id;
                const data = reviewsByProduct[prodId] || { reviews: [], average: 0, count: 0 };
                const loading = loadingReviewsByProduct[prodId];
                const canReview = !!canReviewByProduct[prodId];

                return (
                  <div key={prodId} style={{ borderTop: '1px solid #eee', paddingTop: 10, marginTop: 10 }}>
                    <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                      <img src={item.image} alt={item.name} style={{ width: 64, height: 64, objectFit: 'cover', borderRadius: 6 }} onError={e => e.target.src = 'https://images.unsplash.com/photo-1560472354-b33ff0c44a43?w=400&h=300&fit=crop'} />
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 700 }}>{item.name}</div>
                        <div style={{ color: '#666', fontSize: 13 }}>{item.quantity} × {item.price} ETB</div>
                      </div>
                    </div>

                    {loading ? (
                      <div style={{ marginTop: 8 }}>Loading reviews…</div>
                    ) : (
                      <div style={{ marginTop: 8 }}>
                        <ReviewsList reviews={data.reviews} average={data.average} count={data.count} />
                        {canReview ? (
                          <div style={{ marginTop: 8 }}>
                            <ReviewForm productId={prodId} onSubmitted={async () => {
                              // refresh that product
                              try {
                                const d = await apiFetch(`${API_BASE}/api/products/${prodId}/reviews`);
                                setReviewsByProduct(prev => ({ ...prev, [prodId]: { reviews: d.reviews || [], average: d.average || 0, count: d.count || 0 } }));
                                setCanReviewByProduct(prev => ({ ...prev, [prodId]: false }));
                              } catch (e) { console.error(e); }
                            }} />
                          </div>
                        ) : (
                          <div style={{ marginTop: 8, color: '#666' }}>You cannot review this item for this order.</div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="orders-container">
      <div className="orders-header">
        <h1>My Orders</h1>
        <div className="order-filters">
          <button className={filter === 'all' ? 'active' : ''} onClick={() => setFilter('all')}>
            All Orders
          </button>
          <button className={filter === 'pending' ? 'active' : ''} onClick={() => setFilter('pending')}>
            Pending
          </button>
          <button className={filter === 'confirmed' ? 'active' : ''} onClick={() => setFilter('confirmed')}>
            Confirmed
          </button>
          <button className={filter === 'delivered' ? 'active' : ''} onClick={() => setFilter('delivered')}>
            Delivered
          </button>
        </div>
      </div>
      
      {filteredOrders.length === 0 ? (
        <div className="no-orders">
          <div className="no-orders-icon">📦</div>
          <h3>No orders found</h3>
          <p>{filter === 'all' ? "You haven't placed any orders yet." : `No ${filter} orders found.`}</p>
          <button onClick={() => navigateTo('/')} className="shop-now-btn">
            Start Shopping
          </button>
        </div>
      ) : (
        <div className="orders-list">
          {filteredOrders.map(order => (
            <div key={order.id || order._id || order.orderId} className="order-card">
              <div className="order-card-header">
                <div className="order-info">
                  <h3>Order #{order.id.slice(-8)}</h3>
                  <p className="order-date">
                    {new Date(order.createdAt).toLocaleDateString()} • 
                    {getTotalItems(order)} items • 
                    {order.itemsByShop ? Object.keys(order.itemsByShop).length : 1} shop(s)
                  </p>
                </div>
                <div className="order-status-section">
                  {getStatusBadge(order)}
                  <p className="order-total">{(order.total ?? getOrderItems(order).reduce((s, it, i) => s + (Number(normalizeItem(it, i).price) * Number(normalizeItem(it, i).quantity)), 0))} ETB</p>
                </div>
              </div>
              
              <div className="order-items-preview">
                {getOrderItems(order).slice(0, 2).map((rawItem, idx) => {
                  const it = normalizeItem(rawItem, idx);
                  return (
                    <span key={it.id} className="order-item-preview">
                      {it.name} × {it.quantity}
                    </span>
                  );
                })}
                {getOrderItems(order).length > 2 && (
                  <span className="more-items">
                    +{getOrderItems(order).length - 2} more
                  </span>
                )}
              </div>
              
              <div className="order-card-actions">
                <button onClick={() => setSelectedOrder(order)} className="view-details-btn">
                  View Details
                </button>
                {order.status === 'pending' && (
                  <button onClick={() => handleCancelOrder(order.id)} className="cancel-btn">
                    Cancel Order
                  </button>
                )}
                <button onClick={() => handleReorder(order)} className="reorder-btn">
                  Reorder
                </button>
                <button onClick={() => navigateTo('/tracking')} className="track-btn">
                  Track Order
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default Orders;