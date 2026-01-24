// src/hooks/useDelivery.js
import { useState, useEffect } from 'react';
import { deliveryServices } from '../data/shopsData';

export const useDelivery = () => {
  const [deliveryOptions, setDeliveryOptions] = useState(() => {
    const saved = localStorage.getItem('deliveryOptions');
    return saved ? JSON.parse(saved) : {};
  });

  const [trackingOrders, setTrackingOrders] = useState(() => {
    const saved = localStorage.getItem('trackingOrders');
    return saved ? JSON.parse(saved) : {};
  });

  // Calculate delivery cost
  const calculateDeliveryCost = (serviceId, distanceKm = 5) => {
    const service = Object.values(deliveryServices)
      .flatMap(provider => provider.services)
      .find(s => s.id === serviceId);
    
    if (!service) return 0;
    
    return service.baseCost + (service.costPerKm * distanceKm);
  };

  // Generate tracking number
  const generateTrackingNumber = (orderId) => {
    return `NEG${Date.now()}${orderId.toString().padStart(6, '0')}`;
  };

  // Update delivery status
  const updateDeliveryStatus = (orderId, status, trackingNumber = null) => {
    const trackingNum = trackingNumber || generateTrackingNumber(orderId);
    
    setTrackingOrders(prev => ({
      ...prev,
      [orderId]: {
        trackingNumber: trackingNum,
        status: status,
        updatedAt: new Date().toISOString(),
        history: [
          ...(prev[orderId]?.history || []),
          {
            status,
            timestamp: new Date().toISOString(),
            description: getStatusDescription(status)
          }
        ]
      }
    }));
  };

  const getStatusDescription = (status) => {
    const statusMap = {
      'pending': 'Order received',
      'confirmed': 'Order confirmed by seller',
      'picked_up': 'Picked up by delivery partner',
      'in_transit': 'Package in transit',
      'out_for_delivery': 'Out for delivery',
      'delivered': 'Delivered successfully',
      'cancelled': 'Delivery cancelled'
    };
    return statusMap[status] || 'Status updated';
  };

  // Save to localStorage
  useEffect(() => {
    localStorage.setItem('deliveryOptions', JSON.stringify(deliveryOptions));
  }, [deliveryOptions]);

  useEffect(() => {
    localStorage.setItem('trackingOrders', JSON.stringify(trackingOrders));
  }, [trackingOrders]);

  return {
    deliveryServices,
    deliveryOptions,
    trackingOrders,
    calculateDeliveryCost,
    updateDeliveryStatus,
    generateTrackingNumber,
    setDeliveryOptions
  };
};