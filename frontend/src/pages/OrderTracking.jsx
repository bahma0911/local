// src/pages/OrderTracking.jsx
import React, { useState } from 'react';
import { useDelivery } from '../hooks/useDelivery';
import "./OrderTracking.css";

const OrderTracking = () => {
  const { trackingOrders } = useDelivery();
  const [trackingNumber, setTrackingNumber] = useState('');
  const [currentOrder, setCurrentOrder] = useState(null);

  const handleTrackOrder = () => {
    const order = Object.entries(trackingOrders).find(
      ([ data]) => data.trackingNumber === trackingNumber
    );
    
    if (order) {
      setCurrentOrder({
        orderId: order[0],
        ...order[1]
      });
    } else {
      alert('Tracking number not found. Please check and try again.');
    }
  };

  const getStatusColor = (status) => {
    const colors = {
      'pending': '#ffc107',
      'confirmed': '#17a2b8',
      'picked_up': '#6610f2',
      'in_transit': '#fd7e14',
      'out_for_delivery': '#20c997',
      'delivered': '#28a745',
      'cancelled': '#dc3545'
    };
    return colors[status] || '#6c757d';
  };

  return (
    <div className="order-tracking-container">
      <h1 className="tracking-title">Track Your Order</h1>
      
      <div className="tracking-search">
        <input
          type="text"
          placeholder="Enter your tracking number"
          value={trackingNumber}
          onChange={(e) => setTrackingNumber(e.target.value)}
          className="tracking-input"
        />
        <button onClick={handleTrackOrder} className="track-button">
          Track Order
        </button>
      </div>

      {currentOrder && (
        <div className="tracking-results">
          <div className="tracking-header">
            <h2>Order Tracking</h2>
            <div className="tracking-number">
              Tracking #: <strong>{currentOrder.trackingNumber}</strong>
            </div>
          </div>

          <div className="status-indicator">
            <div 
              className="current-status"
              style={{ backgroundColor: getStatusColor(currentOrder.status) }}
            >
              {currentOrder.status.replace('_', ' ').toUpperCase()}
            </div>
          </div>

          <div className="tracking-timeline">
            <h3>Delivery Timeline</h3>
            {currentOrder.history?.map((event, index) => (
              <div key={index} className="timeline-event">
                <div className="timeline-marker"></div>
                <div className="timeline-content">
                  <div className="event-status">{event.description}</div>
                  <div className="event-time">
                    {new Date(event.timestamp).toLocaleString()}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default OrderTracking;