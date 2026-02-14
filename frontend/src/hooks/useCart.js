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
      .flatMap(shop => shop.products)
      .find(p => String(p.id) === String(productId));
    
    if (!product) {
      return { inStock: false, available: 0, message: "Product not found" };
    }
    
    if (!product.inStock) {
      return { inStock: false, available: 0, message: "Product is out of stock" };
    }
    
    // For demo purposes - you can enhance this with actual stock tracking
    // Currently just checks if product.inStock is true
    return { 
      inStock: true, 
      available: 999, // Unlimited stock for demo
      message: "Product is available" 
    };
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
        return prevItems.map((item) =>
          String(item.id) === String(pid) ? { ...item, quantity: item.quantity + 1 } : item
        );
      } else {
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
    if (!stockCheck.inStock) {
      alert(`Cannot add more - ${stockCheck.message}`);
      return;
    }

    setCartItems((prevItems) =>
      prevItems.map((item) =>
        String(item.id) === String(productId) ? { ...item, quantity: item.quantity + 1 } : item
      )
    );
  };

  const removeFromCart = (productId) => {
    setCartItems((prevItems) =>
      prevItems
        .map((item) =>
          String(item.id) === String(productId) ? { ...item, quantity: item.quantity - 1 } : item
        )
        .filter((item) => item.quantity > 0)
    );
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
  };
};