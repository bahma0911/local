// src/hooks/useCart.js - CORRECTED VERSION
import { useState, useEffect } from "react";
import { shops } from "../data/shopsData";

export const useCart = () => {
  const [cartItems, setCartItems] = useState(() => {
    try {
      const savedCart = localStorage.getItem("shopCart");
      if (savedCart) {
        const parsed = JSON.parse(savedCart);
        // normalize any legacy price objects to numeric prices
        return Array.isArray(parsed) ? parsed.map(it => ({
          ...it,
          price: (it && it.price && typeof it.price === 'object' && typeof it.price.amount !== 'undefined') ? Number(it.price.amount) : (typeof it.price === 'number' ? it.price : 0)
        })) : [];
      }
      return [];
    } catch (error) {
      console.error("Error loading cart from localStorage:", error);
      return [];
    }
  });
  
  const [deliveryOptions, setDeliveryOptions] = useState(() => {
    try {
      const savedOptions = localStorage.getItem("deliveryOptions");
      return savedOptions ? JSON.parse(savedOptions) : {};
    } catch (error) {
      console.error("Error loading delivery options:", error);
      return {};
    }
  });

  // ✅ Get current shops data for inventory checks
  const getCurrentShops = () => {
    const savedShops = localStorage.getItem("updatedShops");
    return savedShops ? JSON.parse(savedShops) : shops;
  };

  // ✅ Check product stock - SIMPLIFIED VERSION
  const checkProductStock = (productId = 1) => {
    const currentShops = getCurrentShops();
    const product = currentShops
      .flatMap(shop => shop.products || [])
      .find(p => String(p.id) === String(productId) || String(p._id || p._id?.$oid) === String(productId));

    if (!product) {
      return { inStock: false, available: 0, message: 'Product not found' };
    }

    const available = typeof product.stock !== 'undefined' ? Number(product.stock) : (product.inStock ? 1 : 0);
    if (!available || available <= 0) {
      return { inStock: false, available: 0, message: 'Product is out of stock' };
    }

    return { inStock: true, available, message: 'Product is available' };
  };

  // Save to localStorage
  useEffect(() => {
    try {
      localStorage.setItem("shopCart", JSON.stringify(cartItems));
      localStorage.setItem("deliveryOptions", JSON.stringify(deliveryOptions));
      // Notify other UI parts in this window that cart changed
      try { window.dispatchEvent(new CustomEvent('cart_updated')); } catch (e) { /* ignore */ }
    } catch (error) {
      console.error("Error saving to localStorage:", error);
    }
  }, [cartItems, deliveryOptions]);

  // Group cart items by shop
  const cartItemsByShop = cartItems.reduce((acc, item) => {
    const currentShops = getCurrentShops();
    const shop = currentShops.find(s => s.products.some(p => p.id === item.id));
    if (shop) {
      if (!acc[shop.id]) {
        acc[shop.id] = {
          shop,
          items: []
        };
      }
      acc[shop.id].items.push(item);
    }
    return acc;
  }, {});

  // Calculate delivery fees
  const deliveryFees = Object.entries(cartItemsByShop).reduce((fees, [shopId, shopData]) => {
    const deliveryOption = deliveryOptions[shopId] || "Pickup";
    fees[shopId] = deliveryOption === "Delivery" ? shopData.shop.deliveryFee : 0;
    return fees;
  }, {});

  // Calculate totals
  const itemsTotal = cartItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  const totalDeliveryFee = Object.values(deliveryFees).reduce((sum, fee) => sum + fee, 0);
  const cartTotal = itemsTotal + totalDeliveryFee;
  const totalItems = cartItems.reduce((sum, item) => sum + item.quantity, 0);

  // ✅ FIXED: addToCart with proper inventory check
  const addToCart = (product, option, shopId) => {
    if (!shopId) {
      console.error("Shop ID is required for addToCart");
      return false;
    }
    // Normalize product id and build item shape
    const pid = product.id ?? product.productId ?? product._id ?? product._id?.$oid ?? null;
    if (!pid) {
      console.warn('addToCart: product has no id', product);
      return false;
    }
    // Check inventory before adding
    const stockCheck = checkProductStock(pid);
    if (!stockCheck.inStock) {
      alert(`Sorry, ${stockCheck.message}`);
      return false;
    }

    setCartItems((prevItems) => {
      const existing = prevItems.find((item) => String(item.id) === String(pid));
      // normalize numeric price for cart items
      const numericPrice = (product && product.price && typeof product.price === 'object' && typeof product.price.amount !== 'undefined')
        ? Number(product.price.amount)
        : (typeof product.price === 'number' ? Number(product.price) : 0);

      if (existing) {
        const newQty = existing.quantity + 1;
        if (typeof stockCheck.available === 'number' && newQty > Number(stockCheck.available)) {
          alert(`Cannot add more than available stock (${stockCheck.available}) for ${existing.name || pid}`);
          return prevItems;
        }
        return prevItems.map((item) =>
          String(item.id) === String(pid) ? { ...item, quantity: newQty } : item
        );
      } else {
        if (typeof stockCheck.available === 'number' && 1 > Number(stockCheck.available)) {
          alert(`Cannot add item — no stock available for ${product.name || pid}`);
          return prevItems;
        }
        const itemToAdd = { ...product, id: pid, quantity: 1, shopId, price: numericPrice };
        return [...prevItems, itemToAdd];
      }
    });

    // Set delivery option for this shop
    if (option) {
      setDeliveryOptions(prev => ({
        ...prev,
        [shopId]: option
      }));
    }

    return true;
  };

  // ✅ FIXED: increaseQuantity with proper inventory check
  const increaseQuantity = (productId) => {
    const stockCheck = checkProductStock(productId);
    const existing = cartItems.find(it => String(it.id) === String(productId));
    const currentQty = existing ? Number(existing.quantity || 0) : 0;
    const available = Number(stockCheck.available || 0);
    if (!stockCheck.inStock || currentQty + 1 > available) {
      alert(`Cannot add more - only ${available} available`);
      return;
    }

    setCartItems((prevItems) =>
      prevItems.map((item) =>
        String(item.id) === String(productId) ? { ...item, quantity: item.quantity + 1 } : item
      )
    );
  };

  const removeFromCart = (productId) => {
    // Remove all items with the matching product id from the cart
    setCartItems((prevItems) => prevItems.filter((item) => String(item.id) !== String(productId)));
  };

  const updateDeliveryOption = (shopId, option) => {
    setDeliveryOptions(prev => ({
      ...prev,
      [shopId]: option
    }));
  };

  const decreaseQuantity = (productId) => {
    setCartItems((prevItems) =>
      prevItems
        .map((item) =>
          String(item.id) === String(productId) ? { ...item, quantity: item.quantity - 1 } : item
        )
        .filter((item) => item.quantity > 0)
    );
  };

  const clearCart = () => {
    setCartItems([]);
    setDeliveryOptions({});
  };

  // Apply server-side adjustments: array of { productId, requested, available }
  const applyAdjustments = (adjustments = []) => {
    if (!Array.isArray(adjustments) || adjustments.length === 0) return [];
    setCartItems(prevItems => {
      let items = prevItems.slice();
      for (const adj of adjustments) {
        const pid = adj.productId ?? adj.id ?? adj.productId;
        const idx = items.findIndex(it => String(it.id) === String(pid));
        if (idx === -1) continue;
        const available = Number(adj.available || 0);
        if (available <= 0) {
          items.splice(idx, 1);
        } else {
          items[idx] = { ...items[idx], quantity: Math.floor(available) };
        }
      }
      return items;
    });
    return adjustments;
  };

  // ✅ Get low stock alerts for shop owners
  const getLowStockProducts = (shopId) => {
    const currentShops = getCurrentShops();
    const shop = currentShops.find(s => s.id === parseInt(shopId));
    if (!shop) return [];
    
    return shop.products.filter(product => !product.inStock);
  };

  return {
    cartItems,
    cartItemsByShop,
    deliveryOptions,
    deliveryFees,
    itemsTotal,
    totalDeliveryFee,
    cartTotal,
    totalItems,
    addToCart,
    removeFromCart,
    updateDeliveryOption,
    increaseQuantity,
    decreaseQuantity,
    clearCart,
    checkProductStock,
    getLowStockProducts,
    applyAdjustments,
  };
};