// src/pages/OrderManagement.jsx
import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../hooks/useAuth';
import apiFetch from '../utils/apiFetch';
import { useDelivery } from '../hooks/useDelivery';
import "./OrderManagement.css";

const OrderManagement = () => {
  const { isAdmin, isShopOwner, assignedShop } = useAuth();
  const { trackingOrders = {}, updateDeliveryStatus } = useDelivery();
  const [orders, setOrders] = useState([]);
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    const fetchOrders = async () => {
      if (!isShopOwner || !assignedShop) return;
      try {
        const data = await apiFetch(`/api/shops/${assignedShop}/orders`);
        setOrders((data || []).reverse());
      } catch (err) {
        console.error('Failed to fetch shop orders', err);
      }
    };
    fetchOrders();
  }, [isAdmin, isShopOwner, assignedShop]);

  const filteredOrders = useMemo(() => {
    switch (filter) {
      case 'pending':
        return orders.filter(order => order.status === 'pending');
      case 'confirmed':
        return orders.filter(order => order.status === 'confirmed');
      case 'delivered':
        return orders.filter(order => 
          order.status === 'delivered' || trackingOrders?.[order.id]?.status === 'delivered'
        );
      default:
        return orders;
    }
  }, [filter, orders, trackingOrders]);

  const updateOrderStatus = (orderId, status) => {
    // Use centralized PATCH endpoint so both Mongo and legacy backends are updated
    const order = orders.find(o => o.id === orderId);
    const shopId = order?.shopId || assignedShop;
    if (!shopId) return;
    (async () => {
      try {
        await apiFetch(`/api/orders/${orderId}/status`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status })
        });
        // refresh orders from server to reflect canonical state
        try {
          const data = await apiFetch(`/api/shops/${assignedShop}/orders`);
          setOrders((data || []).reverse());
        } catch (e) {
          // ignore refresh errors
        }
        if (status === 'confirmed') updateDeliveryStatus(orderId, 'confirmed');
      } catch (err) {
        console.error('Failed to update order status', err);
        alert('Could not update order status');
      }
    })();
  };

  const getStatusBadge = (order) => {
    const deliveryStatus = trackingOrders?.[order.id]?.status;
    const status = deliveryStatus || order.status;
    
    const statusConfig = {
      'pending': { class: 'status-pending', text: 'Pending' },
      'confirmed': { class: 'status-confirmed', text: 'Confirmed' },
      'picked_up': { class: 'status-pickedup', text: 'Picked Up' },
      'in_transit': { class: 'status-transit', text: 'In Transit' },
      'out_for_delivery': { class: 'status-out', text: 'Out for Delivery' },
      'delivered': { class: 'status-delivered', text: 'Delivered' },
      'cancelled': { class: 'status-cancelled', text: 'Cancelled' }
    };
    
    const config = statusConfig[status] || statusConfig.pending;
    return <span className={`status-badge ${config.class}`}>{config.text}</span>;
  };

  const getFulfillmentMethod = (order) => {
    if (!order) return null;
    const raw = order.fulfillmentMethod || order.deliveryMethod || order.method || order.fulfillment || null;
    if (raw) return String(raw).toLowerCase();
    if (order.deliveryOptions && typeof order.deliveryOptions === 'object') {
      const sid = order.shopId || Object.keys(order.deliveryOptions)[0];
      const v = order.deliveryOptions[sid] ?? Object.values(order.deliveryOptions)[0];
      if (v) return String(v).toLowerCase();
    }
    if (order.itemsByShop && typeof order.itemsByShop === 'object') {
      const first = Object.values(order.itemsByShop)[0];
      if (first && (first.delivery || first.fulfillment)) return String(first.delivery || first.fulfillment).toLowerCase();
    }
    return null;
  };

  // Helpers to normalize different order item shapes
  const getOrderItems = (order) => {
    if (!order) return [];
    if (Array.isArray(order.items) && order.items.length) return order.items;
    if (Array.isArray(order.products) && order.products.length) return order.products;
    if (order.itemsByShop && typeof order.itemsByShop === 'object') {
      try { return Object.values(order.itemsByShop).flatMap(s => (s.items || s)).filter(Boolean); } catch (e) { /* ignore */ }
    }
    return [];
  };

  const normalizeItem = (item, idx) => {
    if (!item) return { id: `itm-${idx}`, name: 'Unknown', quantity: 0, price: 0 };
    const qty = Number(item.quantity ?? item.qty ?? item.count ?? 0) || 0;
    const price = Number(item.price ?? item.unitPrice ?? item.amount ?? 0) || 0;
    const id = item.id ?? item.productId ?? item._id ?? `itm-${idx}`;
    const name = item.name ?? item.title ?? item.productName ?? 'Item';
    return { id, name, quantity: qty, price };
  };

  return (
    <div className="order-management">
      <div className="order-header">
        <h1>Order Management</h1>
        <div className="order-filters">
          <button 
            className={filter === 'all' ? 'active' : ''}
            onClick={() => setFilter('all')}
          >
            All Orders
          </button>
          <button 
            className={filter === 'pending' ? 'active' : ''}
            onClick={() => setFilter('pending')}
          >
            Pending
          </button>
          <button 
            className={filter === 'confirmed' ? 'active' : ''}
            onClick={() => setFilter('confirmed')}
          >
            Confirmed
          </button>
          <button 
            className={filter === 'delivered' ? 'active' : ''}
            onClick={() => setFilter('delivered')}
          >
            Delivered
          </button>
        </div>
      </div>

      <div className="orders-list">
        {filteredOrders.length === 0 ? (
          <div className="no-orders">
            <p>No orders found</p>
          </div>
        ) : (
          filteredOrders.map((order, idx) => {
            const trackingInfo = trackingOrders?.[order.id];
            const orderItems = getOrderItems(order);
            const ordKey = order.id || order.orderId || order._id || idx;
            
            return (
            <div key={ordKey} className="order-card">
              <div className="order-header">
                <div className="order-info">
                  <h3>Order #{order.id}</h3>
                  <p className="order-date">
                    {new Date(order.createdAt).toLocaleDateString()}
                  </p>
                  <p className="customer-info">
                    {order.customer.fullName} • {order.customer.phone}
                  </p>
                </div>
                <div className="order-status">
                  {getStatusBadge(order)}
                  <p className="order-total">{(order.total ?? getOrderItems(order).reduce((s, it, i) => s + (Number(normalizeItem(it, i).price) * Number(normalizeItem(it, i).quantity)), 0))} ETB</p>
                </div>
              </div>

              <div className="order-details">
                <div className="order-items">
                  <h4>Items:</h4>
                  {orderItems.map((rawItem, i) => {
                    const it = normalizeItem(rawItem, i);
                    return (
                      <div key={it.id} className="order-item">
                        <span>{it.name} × {it.quantity}</span>
                        <span>{it.price * it.quantity} ETB</span>
                      </div>
                    );
                  })}
                </div>
                
                <div className="order-actions">
                  {order.status === 'pending' && (
                    <>
                      <button
                        onClick={() => updateOrderStatus(order.id, 'confirmed')}
                        className="btn-confirm"
                      >
                        Confirm Order
                      </button>
                      <button
                        onClick={() => updateOrderStatus(order.id, 'cancelled')}
                        className="btn-cancel"
                      >
                        Cancel
                      </button>
                    </>
                  )}

                  {order.status === 'confirmed' && (
                    (() => {
                      const fm = getFulfillmentMethod(order);
                      if (fm === 'pickup') {
                        return (
                          <button onClick={() => updateOrderStatus(order.id, 'picked_up')} className="btn-pickup">Mark Picked Up</button>
                        );
                      }
                      if (fm === 'delivery') {
                        return (
                          <button onClick={() => updateOrderStatus(order.id, 'delivered')} className="btn-deliver">Mark Delivered</button>
                        );
                      }
                      // unknown method: expose both actions
                      return (
                        <>
                          <button onClick={() => updateOrderStatus(order.id, 'delivered')} className="btn-deliver">Mark Delivered</button>
                          <button onClick={() => updateOrderStatus(order.id, 'picked_up')} className="btn-pickup">Mark Picked Up</button>
                        </>
                      );
                    })()
                  )}
                  
                  {trackingInfo && (
                    <div className="tracking-info">
                      <p>Tracking: {trackingInfo.trackingNumber}</p>
                      <button className="btn-track">
                        View Tracking
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
          })
        )}
      </div>
    </div>
  );
};

export default OrderManagement;