import React, { useState, useEffect } from "react";
import { useNavigate } from 'react-router-dom';
import { categories as fallbackCategories } from '../data/shopsData';
import { useAuth } from "../hooks/useAuth";
import apiFetch from '../utils/apiFetch';
import { API_BASE } from '../utils/api';
import ReviewsList from '../components/ReviewsList';
import AdUpload from '../components/AdUpload';
import "./AdminDashboard.css";

const AdminDashboard = () => {
  const [shops, setShops] = useState([]);
  const [selectedShop, setSelectedShop] = useState(null);
  const [activeTab, setActiveTab] = useState("shops"); // default to shops
  const [shopOrders, setShopOrders] = useState([]);
  const [newShop, setNewShop] = useState({
    email: ""
  });
  const [detailsShop, setDetailsShop] = useState(null);

  // Ad banner state
  const [adLink, setAdLink] = useState("");
  const [adError, setAdError] = useState("");
  const [adSuccess, setAdSuccess] = useState("");

  // Categories state
  const [categories, setCategories] = useState([]); // backend categories
  const [newCategory, setNewCategory] = useState("");

  // Advertisements state
  const [advertisements, setAdvertisements] = useState([]);

  // Product-driven categories (from products)
  // (removed duplicate declaration of shopCategories)

  // derive product categories from available products (exclude empty string)
  const shopCategories = React.useMemo(() => {
    const s = new Set();
    for (const sh of shops) {
      for (const p of (sh.products || [])) {
        const c = (p && p.category) ? String(p.category).trim() : '';
        if (c) s.add(c);
      }
    }
    const derived = Array.from(s);
    // fallback to static categories from data if no product-level categories found
    if (derived.length === 0) {
      if (Array.isArray(fallbackCategories)) return fallbackCategories.filter(c => c !== 'All');
    }
    return derived;
  }, [shops]);

  // Merged categories for product forms (union of backend and product-driven)
  const mergedCategories = React.useMemo(() => {
    // shopCategories: product-driven, categories: backend
    const set = new Set([...(categories || [])
      .map(c => typeof c === 'string' ? c : c.name), ...(shopCategories || [])]);
    return Array.from(set).filter(Boolean);
  }, [categories, shopCategories]);

  // Owner tab for shop-owner UI: 'orders' | 'products' | 'add'
  const [ownerTab, setOwnerTab] = useState('orders');

  // reviews state for shop-owner view
  const [shopReviewsByProduct, setShopReviewsByProduct] = useState({});

  // shop info form state
  const [shopInfoForm, setShopInfoForm] = useState({
    name: '',
    phone: '',
    address: '',
    deliveryFee: 0,
    logo: '',
    logoFile: null
  });

  const { logout, isAdmin, isShopOwner, assignedShop, user, csrfToken } = useAuth();
  const navigate = useNavigate();

  // ===================== API Calls =====================
  const fetchShops = async () => {
    try {
      const data = await apiFetch(`${API_BASE}/api/shops`);
      setShops(data);
      try {
        localStorage.setItem('updatedShops', JSON.stringify(data));
      } catch (e) {
        // ignore storage errors
      }
      if (isShopOwner) {
        // Try match by assignedShop id first, then by owner's username as fallback
        let myShop = null;
        if (typeof assignedShop !== 'undefined' && assignedShop !== null) myShop = data.find(shop => Number(shop.id) === Number(assignedShop));
        if (!myShop && user && user.username) myShop = data.find(shop => shop.owner && (shop.owner.username === user.username));
        setSelectedShop(myShop);
        // fetch orders for the assigned shop once shops are loaded
        if (myShop) fetchShopOrders(myShop.id);
        // fetch latest products from `/api/products` to ensure numeric `stock` is current
        if (myShop) {
          try {
            const plist = await apiFetch(`${API_BASE}/api/products?shopId=${myShop.id}`);
            if (plist) {
              const norm = (plist || []).map(pp => ({
                id: pp.id || pp._id,
                name: pp.name,
                price: (pp.price && pp.price.amount) ? pp.price.amount : (typeof pp.price === 'number' ? pp.price : 0),
                image: (pp.images && pp.images.length) ? pp.images[0] : (pp.image || ''),
                category: pp.category || '',
                description: pp.description || '',
                stock: typeof pp.stock !== 'undefined' ? Number(pp.stock) : ((typeof pp.inStock !== 'undefined') ? (pp.inStock ? 1 : 0) : 0),
                inStock: typeof pp.stock !== 'undefined' ? (Number(pp.stock) > 0) : ((typeof pp.inStock !== 'undefined') ? !!pp.inStock : true)
              }));
              // merge normalized products into shop object used by UI
              const updatedShop = { ...myShop, products: norm };
              setSelectedShop(updatedShop);
              setShops(prev => prev.map(s => s.id === updatedShop.id ? updatedShop : s));
            }
          } catch (e) { /* ignore fetch errors */ }
        }
      }
    } catch (err) {
      console.error(err);
      alert("Error loading shops");
    }
  };

  // refetch shops when auth role/assignment changes so shop owners see their shop
  useEffect(() => {
    fetchShops();
  }, [isShopOwner, assignedShop]);

  // fetch orders for current shop (shop owner view)
  const fetchShopOrders = async (shopId) => {
    if (!shopId) return setShopOrders([]);
    try {
      const data = await apiFetch(`${API_BASE}/api/shops/${shopId}/orders`);
      if (!data) throw new Error('Failed to fetch shop orders');
      // Ensure newest orders appear first
      const sorted = (data || []).slice().sort((a, b) => {
        const aTime = new Date(a.createdAt || a.receivedAt || a.updatedAt).getTime() || 0;
        const bTime = new Date(b.createdAt || b.receivedAt || b.updatedAt).getTime() || 0;
        return bTime - aTime;
      });
      setShopOrders(sorted);
    } catch (err) {
      console.error('fetchShopOrders error', err);
      setShopOrders([]);
    }
  };

      // Helpers to normalize order item shapes for shop owner view
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

  // Update order status for a shop (e.g., 'confirmed', 'delivered', 'picked_up')
  const updateOrderStatus = async (shopId, orderId, status) => {
    try {
      await apiFetch(`${API_BASE}/api/orders/${orderId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}) },
        body: JSON.stringify({ status })
      });
      // refresh orders after a successful update
      fetchShopOrders(shopId);
    } catch (err) {
      console.error('updateOrderStatus error', err);
      alert('Failed to update order status: ' + (err.message || err));
    }
  };

  // Confirm payment for an order (shop owner action)
  const confirmOrderPayment = async (shopId, orderId) => {
    try {
      await apiFetch(`${API_BASE}/api/orders/${orderId}/payment/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}) }
      });
      // refresh orders so paymentStatus updates in the UI
      fetchShopOrders(shopId);
    } catch (err) {
      console.error('confirmOrderPayment error', err);
      alert('Failed to mark order as paid: ' + (err.message || err));
    }
  };

  const getBuyerName = (o) => {
    if (!o) return 'Unknown';
    const c = o.customer || {};
    if (typeof c === 'string' && c.trim()) return c;
    // possible shapes: { fullName, name, username, email } or simple fields on order
    return c.fullName || c.name || c.username || c.email || o.createdBy || o.customerName || 'Unknown';
  };

  const getFulfillmentMethod = (order) => {
    if (!order) return null;
    const raw = order.fulfillmentMethod || order.deliveryMethod || order.method || order.fulfillment || null;
    if (raw) return String(raw).toLowerCase();
    if (order.deliveryOptions && typeof order.deliveryOptions === 'object') {
      const sid = order.shopId || order.shop?.id || Object.keys(order.deliveryOptions)[0];
      const v = order.deliveryOptions[sid] ?? Object.values(order.deliveryOptions)[0];
      if (v) return String(v).toLowerCase();
    }
    if (order.itemsByShop && typeof order.itemsByShop === 'object') {
      const first = Object.values(order.itemsByShop)[0];
      if (first && (first.delivery || first.fulfillment)) return String(first.delivery || first.fulfillment).toLowerCase();
    }
    return null;
  };

  // Delete an order notification (manual delete) for the shop
  const deleteOrderAPI = async (shopId, orderId) => {
    if (!window.confirm('Permanently delete this order? This cannot be undone.')) return;
    try {
      await apiFetch(`${API_BASE}/api/shops/${shopId}/orders/${orderId}`, { method: 'DELETE', headers: { ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}) } });
      // refresh the order list after delete
      fetchShopOrders(shopId);
    } catch (err) {
      console.error('deleteOrderAPI error', err);
      alert('Failed to delete order: ' + (err.message || err));
    }
  };

  useEffect(() => {
    if (isShopOwner && selectedShop) {
      fetchShopOrders(selectedShop.id || selectedShop);
    } else if (isShopOwner && assignedShop) {
      fetchShopOrders(assignedShop);
    } else {
      setShopOrders([]);
    }
  }, [isShopOwner, selectedShop, assignedShop]);

  // Poll shop orders while shop-owner is viewing the Orders tab so new orders appear without manual refresh
  useEffect(() => {
    if (!isShopOwner) return undefined;
    let interval = null;
    const shopIdToUse = (selectedShop && (selectedShop.id || selectedShop)) || assignedShop;
    if (ownerTab === 'orders' && shopIdToUse) {
      // initial fetch already handled by other effect; start polling
      interval = setInterval(() => {
        fetchShopOrders(shopIdToUse);
      }, 8000);
    }
    return () => { if (interval) clearInterval(interval); };
  }, [isShopOwner, selectedShop, assignedShop, ownerTab]);

  // Fetch reviews for all products in the selected shop when ownerTab === 'reviews'
  const fetchShopReviews = async (shop) => {
    if (!shop) return setShopReviewsByProduct({});
    const products = shop.products || [];
    const byProd = {};
    await Promise.all((products || []).map(async (p) => {
      try {
        const data = await apiFetch(`${API_BASE}/api/products/${p.id}/reviews`);
        byProd[p.id] = { reviews: data.reviews || [], average: data.average || 0, count: data.count || 0, product: p };
      } catch (e) {
        byProd[p.id] = { reviews: [], average: 0, count: 0, product: p };
      }
    }));
    setShopReviewsByProduct(byProd);
  };

  useEffect(() => {
    if (ownerTab === 'reviews') {
      const shopToUse = selectedShop || (typeof assignedShop !== 'undefined' ? shops.find(s => Number(s.id) === Number(assignedShop)) : null);
      if (shopToUse) fetchShopReviews(shopToUse);
    }
  }, [ownerTab, selectedShop, assignedShop, shops]);

  // Fetch categories when categories tab is active
  useEffect(() => {
    if (activeTab === 'categories') {
      fetchCategories();
    }
  }, [activeTab]);

  // Listen for new reviews so shop-owner view updates in near-real-time
  useEffect(() => {
    const handler = (e) => {
      try {
        const detail = e && e.detail ? e.detail : null;
        if (!detail || !detail.productId) return;
        const shopToUse = selectedShop || (typeof assignedShop !== 'undefined' ? shops.find(s => Number(s.id) === Number(assignedShop)) : null);
        if (!shopToUse) return;
        const prodIds = (shopToUse.products || []).map(p => String(p.id));
        if (prodIds.includes(String(detail.productId))) {
          // refresh reviews for the shop
          fetchShopReviews(shopToUse);
        }
      } catch (err) { /* ignore */ }
    };
    window.addEventListener('review:created', handler);
    return () => window.removeEventListener('review:created', handler);
  }, [selectedShop, assignedShop, shops]);

  const inviteShopAPI = async () => {
    if (!newShop.email.trim()) {
      alert("Please enter the shop owner's email");
      return;
    }
    const payload = { email: newShop.email.trim() };

    try {
      await apiFetch(`${API_BASE}/api/admin/invite-shop`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}) },
        body: JSON.stringify(payload)
      });
      setNewShop({ email: "" });
      alert("Invitation sent successfully!");
    } catch (err) {
      console.error(err);
      alert("Error sending invitation");
    }
  };



  const deleteShopAPI = async (shopId) => {
    if (!window.confirm("Are you sure you want to delete this shop? This cannot be undone.")) return;

    try {
      await apiFetch(`${API_BASE}/api/shops/${shopId}`, { method: "DELETE", headers: { ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}) } });
      setShops(prev => prev.filter(shop => shop.id !== shopId));
      try { localStorage.setItem('updatedShops', JSON.stringify(shops.filter(shop => shop.id !== shopId))); } catch {}
      if (selectedShop?.id === shopId) setSelectedShop(null);
      alert("Shop deleted successfully!");
    } catch (err) {
      console.error(err);
      alert("Error deleting shop");
    }
  };

  // ---------------- Product management for shop owners ----------------
  // helper to upload a file; try proxied path first, then absolute backend URL if 404
  const uploadFile = async (fd) => {
    const tryUrls = [
      `${API_BASE}/api/upload`,
      'http://localhost:5000/api/upload',
      'http://127.0.0.1:5000/api/upload',
    ];
    // try a host using current hostname with port 5000 (handles custom hosts)
    try {
      const hostUrl = `${window.location.protocol}//${window.location.hostname}:5000/api/upload`;
      if (!tryUrls.includes(hostUrl)) tryUrls.push(hostUrl);
    } catch {
      // ignore building host fallback
    }

    // expose attempted URLs for easier debugging from console
    window._lastUploadAttempts = tryUrls.slice();

    let lastNonOk = null;
    for (const url of tryUrls) {
      try {
        console.debug(`uploadFile: trying ${url}`);
        const up = await fetch(url, { method: 'POST', credentials: 'include', body: fd, headers: { ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}) } });
        console.debug(`uploadFile: ${url} responded with status ${up.status}`);
        // prefer successful responses (2xx). If non-OK, continue trying fallbacks.
        if (up && up.ok) {
          if (url !== `${API_BASE}/api/upload`) console.warn(`uploadFile: used fallback URL ${url}`);
          window._lastSuccessfulUploadUrl = url;
          return up;
        }
        // keep the last non-404/non-ok response so caller can inspect errors
        if (up && up.status !== 404) lastNonOk = { url, status: up.status };
      } catch (err) {
        console.warn(`uploadFile: request to ${url} failed:`, err && err.message ? err.message : err);
        // continue to next url
      }
    }

    console.error('uploadFile: all upload attempts failed', tryUrls, 'lastNonOk=', lastNonOk);
    // if we saw a non-ok response (e.g., 500), return null so caller shows attempted URLs
    return null;
  };

  const addProductAPI = async (shopId, product) => {
    try {
      let payload = { ...product };
      // Support uploading multiple image files (imageFiles) or single imageFile
      if (Array.isArray(product.imageFiles) && product.imageFiles.length > 0) {
        payload.images = payload.images || [];
        const ALLOWED = ['image/jpeg', 'image/png', 'image/webp'];
        const MAX_BYTES = Number(import.meta.env.VITE_UPLOAD_MAX_BYTES ?? 5 * 1024 * 1024);
        for (const f of product.imageFiles) {
          if (!ALLOWED.includes(f.type)) throw new Error('Unsupported image type. Use JPG/PNG/WEBP.');
          if (f.size > MAX_BYTES) throw new Error('Image too large. Max 5MB.');
          const fd = new FormData();
          fd.append('file', f);
          const up = await uploadFile(fd);
          if (!up) {
            const attempts = (window._lastUploadAttempts || []).join(', ');
            throw new Error(`Image upload failed: no response from server. Attempted: ${attempts}`);
          }
          if (!up.ok) {
            const text = await up.text().catch(() => '');
            throw new Error(`Image upload failed (${up.status}): ${text}`);
          }
          const upText = await up.text().catch(() => '');
          let j;
          try { j = upText ? JSON.parse(upText) : {}; } catch (e) { j = upText; }
          if (j && j.url) payload.images.push(j.url);
        }
      } else if (product.imageFile) {
        // Client-side validation: enforce file type and size limits before uploading
        const ALLOWED = ['image/jpeg', 'image/png', 'image/webp']; // WHY: match server-side allowed types
        const MAX_BYTES = Number(import.meta.env.VITE_UPLOAD_MAX_BYTES ?? 5 * 1024 * 1024);
        if (!ALLOWED.includes(product.imageFile.type)) throw new Error('Unsupported image type. Use JPG/PNG/WEBP.');
        if (product.imageFile.size > MAX_BYTES) throw new Error('Image too large. Max 5MB.');
        const fd = new FormData();
        fd.append('file', product.imageFile);
        const up = await uploadFile(fd);
        if (!up) {
          const attempts = (window._lastUploadAttempts || []).join(', ');
          throw new Error(`Image upload failed: no response from server. Attempted: ${attempts}`);
        }
        if (!up.ok) {
          const text = await up.text().catch(() => '');
          throw new Error(`Image upload failed (${up.status}): ${text}`);
        }
        const upText = await up.text().catch(() => '');
        let j;
        try { j = upText ? JSON.parse(upText) : {}; } catch (e) { j = upText; }
        console.debug('uploadFile response JSON:', j);
        payload.image = j.url;
        payload.images = [j.url];
      }
      delete payload.imageFile;
      // normalize price into object expected by the API
      if (typeof payload.price === 'number' || typeof payload.price === 'string') {
        payload.price = { amount: Math.floor(Number(payload.price) || 0), currency: 'ETB' };
      } else if (payload.price && typeof payload.price === 'object' && typeof payload.price.amount !== 'undefined') {
        payload.price = { amount: Math.floor(Number(payload.price.amount) || 0), currency: payload.price.currency || 'ETB' };
      } else {
        // ensure price is present as object
        payload.price = { amount: Math.floor(Number(payload.price) || 0), currency: 'ETB' };
      }
      // include shopId in body and send to JSON product creation endpoint
      payload.shopId = shopId;
      // include short description and detailed description
      payload.description = product.description || '';
      payload.details = product.details || product.description || '';
      // include product condition and shop contact details
      if (typeof product.condition !== 'undefined' && product.condition !== '') {
        payload.condition = product.condition;
      } else {
        delete payload.condition;
      }
      if (typeof product.unit !== 'undefined' && product.unit !== '') {
        payload.unit = product.unit;
      }
      payload.shopPhone = product.shopPhone || '';
      payload.shopLocation = product.shopLocation || '';
      // Ensure stock is sent as a number. If an explicit stock value was provided, use it.
      if (typeof payload.stock !== 'undefined' && payload.stock !== null) {
        const n = Number(payload.stock);
        payload.stock = (Number.isFinite(n) && !Number.isNaN(n)) ? Math.max(0, Math.floor(n)) : (payload.inStock ? 1 : 0);
      } else if (typeof payload.inStock !== 'undefined') {
        payload.stock = payload.inStock ? 1 : 0;
      } else {
        payload.stock = 0;
      }
      console.debug('Final product payload (JSON):', payload);
        const res = await fetch(`${API_BASE}/api/products`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}) },
        body: JSON.stringify(payload)
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`Failed to add product (${res.status}): ${text}`);
      }
      {
        const txt = await res.text().catch(() => '');
        try { return txt ? JSON.parse(txt) : {}; } catch (e) { return txt; }
      }
    } catch (err) {
      console.error('addProductAPI error:', err);
      alert('Error adding product: ' + (err.message || err));
      return null;
    }
  };

  const updateProductAPI = async (shopId, productId, product) => {
    try {
      let payload = { ...product };
      // Support multiple image uploads for updates as well
      if (Array.isArray(product.imageFiles) && product.imageFiles.length > 0) {
        payload.images = payload.images || [];
        const ALLOWED = ['image/jpeg', 'image/png', 'image/webp'];
        const MAX_BYTES = Number(import.meta.env.VITE_UPLOAD_MAX_BYTES ?? 5 * 1024 * 1024);
        for (const f of product.imageFiles) {
          if (!ALLOWED.includes(f.type)) throw new Error('Unsupported image type. Use JPG/PNG/WEBP.');
          if (f.size > MAX_BYTES) throw new Error('Image too large. Max 5MB.');
          const fd = new FormData();
          fd.append('file', f);
          const up = await uploadFile(fd);
          if (!up) throw new Error('Image upload failed: no response from server');
          if (!up.ok) {
            const text = await up.text().catch(() => '');
            throw new Error(`Image upload failed (${up.status}): ${text}`);
          }
          const upText = await up.text().catch(() => '');
          let j;
          try { j = upText ? JSON.parse(upText) : {}; } catch (e) { j = upText; }
          if (j && j.url) payload.images.push(j.url);
        }
      } else if (product.imageFile) {
        const fd = new FormData();
        fd.append('file', product.imageFile);
        const up = await uploadFile(fd);
        if (!up) throw new Error('Image upload failed: no response from server');
        if (!up.ok) {
          const text = await up.text().catch(() => '');
          throw new Error(`Image upload failed (${up.status}): ${text}`);
        }
        const upText = await up.text().catch(() => '');
        let j;
        try { j = upText ? JSON.parse(upText) : {}; } catch (e) { j = upText; }
        payload.image = j.url;
        payload.images = [j.url];
      }
      // Ensure stock is sent as a number. Prefer the explicit stock value when provided.
      if (typeof payload.stock !== 'undefined' && payload.stock !== null) {
        const n = Number(payload.stock);
        payload.stock = (Number.isFinite(n) && !Number.isNaN(n)) ? Math.max(0, Math.floor(n)) : (payload.inStock ? 1 : 0);
      } else if (typeof payload.inStock !== 'undefined') {
        payload.stock = payload.inStock ? 1 : 0;
      } else {
        payload.stock = 0;
      }
      // include short and detailed description when provided
      if (typeof product.description !== 'undefined') payload.description = product.description;
      if (typeof product.details !== 'undefined') payload.details = product.details;
      // include updated condition/contact info when provided
      if (typeof product.condition !== 'undefined') {
        if (product.condition === '') delete payload.condition;
        else payload.condition = product.condition;
      }
      if (typeof product.unit !== 'undefined') payload.unit = product.unit;
      if (typeof product.shopPhone !== 'undefined') payload.shopPhone = product.shopPhone;
      if (typeof product.shopLocation !== 'undefined') payload.shopLocation = product.shopLocation;
      delete payload.imageFile;
      const res = await fetch(`${API_BASE}/api/shops/${shopId}/products/${productId}`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}) },
        body: JSON.stringify(payload)
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`Failed to update product (${res.status}): ${text}`);
      }
      {
        const txt = await res.text().catch(() => '');
        try { return txt ? JSON.parse(txt) : {}; } catch (e) { return txt; }
      }
    } catch (err) {
      console.error('updateProductAPI error:', err);
      alert('Error updating product: ' + (err.message || err));
      return null;
    }
  };

  const deleteProductAPI = async (shopId, productId) => {
    if (!window.confirm('Delete this product?')) return false;
    try {
      const res = await fetch(`${API_BASE}/api/shops/${shopId}/products/${productId}`, { method: 'DELETE', credentials: 'include', headers: { ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}) } });
      if (!res.ok) throw new Error('Failed to delete product');
      return true;
    } catch (err) {
      console.error(err);
      alert('Error deleting product');
      return false;
    }
  };

  // ===================== Other Helpers =====================
  const handleLogout = () => {
    if (window.confirm("Logout?")) {
      logout().catch(err => console.error('Logout error', err));
    }
  };

    // image handling removed

  const _accessibleShops = isAdmin ? shops : shops.filter(shop => shop.id === assignedShop);
  const currentShop = shops.find(shop => shop.id === selectedShop?.id) || selectedShop;

  // ===================== Input Handlers =====================
  const handleNewShopInputChange = (e) => {
    const { name, value } = e.target;
    setNewShop(prev => ({ ...prev, [name]: value }));
  };



  // Optional geolocation capture
  const captureGeoForNewShop = () => {
    if (!navigator.geolocation) {
      alert('Geolocation is not supported by your browser');
      return;
    }
    navigator.geolocation.getCurrentPosition((pos) => {
      setNewShop(prev => ({ ...prev, geo: { lat: pos.coords.latitude, lng: pos.coords.longitude } }));
    }, (err) => {
      console.warn('Geo error', err);
      alert('Unable to get your location. You can enter the address manually.');
    }, { timeout: 10000 });
  };

  // ==================== Category Management ====================
  const fetchCategories = async () => {
    try {
      const data = await apiFetch(`${API_BASE}/api/categories`);
      setCategories(data || []);
    } catch (err) {
      console.error('Error fetching categories:', err);
      setCategories([]);
    }
  };

  const addCategoryAPI = async () => {
    if (!newCategory.trim()) {
      alert('Please enter a category name');
      return;
    }
    try {
      await apiFetch(`${API_BASE}/api/categories`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}) },
        body: JSON.stringify({ name: newCategory.trim() })
      });
      setNewCategory('');
      fetchCategories(); // Refresh the list
      alert('Category added successfully!');
    } catch (err) {
      console.error('Error adding category:', err);
      alert('Failed to add category: ' + (err.message || err));
    }
  };

  const deleteCategoryAPI = async (categoryId) => {
    if (!confirm('Are you sure you want to delete this category?')) return;
    try {
      await apiFetch(`${API_BASE}/api/categories/${categoryId}`, {
        method: 'DELETE',
        headers: { ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}) }
      });
      fetchCategories(); // Refresh the list
      alert('Category deleted successfully!');
    } catch (err) {
      console.error('Error deleting category:', err);
      alert('Failed to delete category: ' + (err.message || err));
    }
  };

  const showDetails = async (shop) => {
    setDetailsShop(shop);

    // If the shop record doesn't already include owner contact details, try to fetch the
    // owner profile via a protected admin endpoint (this is safe for admin users).
    if (isAdmin && shop?.owner?.username) {
      try {
        const data = await apiFetch(`${API_BASE}/api/admin/users/${encodeURIComponent(shop.owner.username)}`);
        if (data) {
          setDetailsShop(prev => ({
            ...prev,
            owner: {
              ...prev.owner,
              ...data
            }
          }));
        }
      } catch (e) {
        // ignore missing user or permission errors
      }
    }
  };

  const hideDetails = () => {
    setDetailsShop(null);
  };

  // ==================== Advertisement Management ====================
  const fetchAdvertisements = async () => {
    try {
      const data = await apiFetch(`${API_BASE}/api/admin/advertisements`);
      setAdvertisements(data || []);
    } catch (err) {
      console.error('Error fetching advertisements:', err);
      setAdvertisements([]);
    }
  };

  const createAdvertisement = async (adData) => {
    try {
      const newAd = await apiFetch(`${API_BASE}/api/admin/advertisements`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}) },
        body: JSON.stringify(adData)
      });
      fetchAdvertisements(); // Refresh the list
      setAdSuccess('Advertisement created successfully!');
      setAdError('');
      return newAd;
    } catch (err) {
      console.error('Error creating advertisement:', err);
      const message = err && err.message ? err.message : 'Unknown error. Please try again in a moment.';
      setAdError(`Failed to create advertisement: ${message}`);
      setAdSuccess('');
      throw err;
    }
  };

  const updateAdvertisement = async (id, adData) => {
    try {
      const updatedAd = await apiFetch(`${API_BASE}/api/admin/advertisements/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}) },
        body: JSON.stringify(adData)
      });
      fetchAdvertisements(); // Refresh the list
      setAdSuccess('Advertisement updated successfully!');
      setAdError('');
      return updatedAd;
    } catch (err) {
      console.error('Error updating advertisement:', err);
      const message = err && err.message ? err.message : 'Unknown error. Please try again in a moment.';
      setAdError(`Failed to update advertisement: ${message}`);
      setAdSuccess('');
      throw err;
    }
  };

  const deleteAdvertisement = async (id) => {
    if (!confirm('Are you sure you want to delete this advertisement?')) return;
    try {
      await apiFetch(`${API_BASE}/api/admin/advertisements/${id}`, {
        method: 'DELETE',
        headers: { ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}) }
      });
      fetchAdvertisements(); // Refresh the list
      setAdSuccess('Advertisement deleted successfully!');
      setAdError('');
    } catch (err) {
      console.error('Error deleting advertisement:', err);
      const message = err && err.message ? err.message : 'Unknown error. Please try again in a moment.';
      setAdError(`Failed to delete advertisement: ${message}`);
      setAdSuccess('');
    }
  };

  // Handler for ad upload (persist to database)
  const handleAdUpload = (value) => {
    const imageUrl = typeof value === 'string' ? value : (value?.url || null);
    if (imageUrl) {
      // Normalize the ad link to ensure it's an absolute URL
      let normalizedLink = adLink.trim();
      if (normalizedLink && !normalizedLink.match(/^https?:\/\//)) {
        normalizedLink = 'https://' + normalizedLink;
      }

      createAdvertisement({
        imageUrl,
        link: normalizedLink,
        altText: '',
        isActive: true
      }).then(() => {
        setAdLink(''); // Clear the link input
      }).catch(() => {
        // Error already handled in createAdvertisement
      });
    } else {
      setAdError('The uploaded asset could not be located. Please try a different image file.');
      setAdSuccess('');
    }
  };
    // product controls removed

  // product form state for shop owners
  const [newProduct, setNewProduct] = useState({ name: '', price: '', image: '', images: [], imageFile: null, imageFiles: [], description: '', details: '', condition: '', unit: 'piece', shopPhone: '', shopLocation: '', inStock: true, stock: 1, category: '' });
  const [editingProductId, setEditingProductId] = useState(null);
  const [editingProduct, setEditingProduct] = useState(null);
  // declared above near top to ensure effects can reference it

  // ===================== Render =====================

  useEffect(() => {
    fetchCategories();
    if (isAdmin) {
      fetchAdvertisements();
    }
  }, [isAdmin]);

  // Populate product form with shop contact info when shop changes
  useEffect(() => {
    if (isShopOwner && currentShop) {
      setNewProduct(prev => ({
        ...prev,
        shopPhone: currentShop.owner?.phone || prev.shopPhone || '',
        shopLocation: currentShop.address || prev.shopLocation || ''
      }));
    }
  }, [isShopOwner, currentShop]);

  // Initialize shop info form when currentShop changes or when shop-info tab is selected
  useEffect(() => {
    if (currentShop && ownerTab === 'shop-info') {
      setShopInfoForm({
        name: currentShop.name || '',
        phone: currentShop.owner?.phone || '',
        address: currentShop.address || '',
        deliveryFee: currentShop.deliveryFee || 0,
        logo: currentShop.logo || '',
        logoFile: null
      });
    }
  }, [currentShop, ownerTab]);

  return (
    <div className="admin-dashboard">
      {/* HEADER */}
      <div className="admin-header">
        <h1 className="admin-title">{isAdmin ? "Admin Dashboard" : "My Shop Dashboard"}</h1>
        <div>
          {isAdmin && <button onClick={fetchShops}>Refresh Shops</button>}
          {isShopOwner && currentShop && <button className="refresh-orders-btn" onClick={() => window.location.reload()}>Refresh Orders</button>}
          <button className="admin-logout-btn" onClick={handleLogout}>Logout</button>
        </div>
      </div>

      {/* TABS */}
      {isAdmin && (
        <div className="admin-tabs">
          <button className={activeTab === "shops" ? "active" : ""} onClick={() => setActiveTab("shops")}>🏪 Manage Shops</button>
          <button className={activeTab === "ads" ? "active" : ""} onClick={() => setActiveTab("ads")}>📢 Manage Ads</button>
          <button className="" onClick={() => navigate('/admin/orders')}>📋 Manage Orders</button>
          <button className={activeTab === "categories" ? "active" : ""} onClick={() => setActiveTab("categories")}>📂 Manage Categories</button>
        </div>
      )}

      {/* SHOP MANAGEMENT */}
      {isAdmin && activeTab === "shops" && (
        <div className="shop-management">
          {/* INVITE SHOP OWNER */}
          <div className="create-shop-section">
            <h3>Invite Shop Owner</h3>
            <input name="email" type="email" placeholder="Shop owner's email" value={newShop.email} onChange={handleNewShopInputChange} />
            <button onClick={inviteShopAPI}>Send Invitation</button>
          </div>

          {/* EXISTING SHOPS */}
          <div className="shops-list">
            {shops.map(shop => (
              <div key={shop.id} className="shop-card">
                {detailsShop?.id === shop.id ? (
                  <div>
                    <h4>Shop Details</h4>
                    <p><strong>Name:</strong> {detailsShop.name}</p>
                    <p><strong>Address:</strong> {detailsShop.address}</p>
                    <p><strong>Delivery Fee:</strong> {detailsShop.deliveryFee} ETB</p>

                    <h5>Owner Info</h5>
                    <p><strong>Name:</strong> {detailsShop.owner?.name || '—'}</p>
                    <p><strong>Username:</strong> {detailsShop.owner?.username || '—'}</p>
                    <p><strong>Email:</strong> {detailsShop.owner?.email || detailsShop.owner?.username || '—'}</p>
                    <p><strong>Phone:</strong> {detailsShop.owner?.phone || '—'}</p>
                    {detailsShop.owner?.address ? <p><strong>Address:</strong> {detailsShop.owner.address}</p> : null}
                    {detailsShop.owner?.city ? <p><strong>City:</strong> {detailsShop.owner.city}</p> : null}
                    <button onClick={hideDetails}>Close</button>
                  </div>
                ) : (
                  <div>
                    <p>{shop.name} | Delivery: {shop.deliveryFee} ETB</p>
                    <p>Owner: {shop.owner.username}</p>
                    <button onClick={() => showDetails(shop)}>Details</button>
                    <button onClick={() => deleteShopAPI(shop.id)}>Delete</button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ADS MANAGEMENT */}
      {isAdmin && activeTab === "ads" && (
        <div className="ads-management" style={{ marginTop: 24 }}>
          <h3>Manage Advertisements</h3>

          {adError && <div className="error-message">{adError}</div>}
          {adSuccess && <div className="success-message">{adSuccess}</div>}

          {/* Create New Ad Section */}
          <div style={{ marginBottom: 24, padding: 16, border: '1px solid #ddd', borderRadius: 8 }}>
            <h4>Create New Advertisement</h4>
            <div style={{ marginBottom: 12 }}>
              <label style={{ display: 'block', marginBottom: 4, fontWeight: 500 }}>
                Ad Link (optional):
              </label>
              <input
                type="url"
                placeholder="https://example.com or example.com"
                value={adLink}
                onChange={(e) => setAdLink(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  border: '1px solid #ddd',
                  borderRadius: 4,
                  fontSize: 14
                }}
              />
              <div style={{ fontSize: 12, color: '#666', marginTop: 4 }}>
                https:// will be added automatically if not included
              </div>
            </div>
            <AdUpload onUpload={handleAdUpload} />
          </div>

          {/* Existing Ads List */}
          <div style={{ marginTop: 24 }}>
            <h4>Existing Advertisements</h4>
            <button
              onClick={fetchAdvertisements}
              style={{ marginBottom: 16, padding: '8px 16px', backgroundColor: '#007bff', color: 'white', border: 'none', borderRadius: 4 }}
            >
              Refresh List
            </button>

            {advertisements.length === 0 ? (
              <div style={{ color: '#999', padding: 16, textAlign: 'center' }}>
                No advertisements found. Create your first advertisement above.
              </div>
            ) : (
              <div style={{ display: 'grid', gap: 16 }}>
                {advertisements.map((ad) => (
                  <div key={ad._id} style={{ border: '1px solid #ddd', borderRadius: 8, padding: 16 }}>
                    <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                      <div style={{ flex: '1 1 220px', minWidth: 120, maxWidth: 220, width: '100%' }}>
                        <img
                          src={ad.imageUrl}
                          alt={ad.altText || 'Advertisement'}
                          style={{ width: '100%', height: 'auto', borderRadius: 4, maxHeight: 120, objectFit: 'cover' }}
                        />
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ marginBottom: 8 }}>
                          <strong>Status:</strong>
                          <span style={{
                            color: ad.isActive ? '#28a745' : '#dc3545',
                            marginLeft: 8,
                            fontWeight: 'bold'
                          }}>
                            {ad.isActive ? 'Active' : 'Inactive'}
                          </span>
                        </div>
                        {ad.link && (
                          <div style={{ marginBottom: 8 }}>
                            <strong>Link:</strong>
                            <a
                              href={ad.link}
                              target="_blank"
                              rel="noopener noreferrer"
                              style={{ marginLeft: 8, color: '#007bff', textDecoration: 'none' }}
                            >
                              {ad.link}
                            </a>
                          </div>
                        )}
                        {ad.altText && (
                          <div style={{ marginBottom: 8 }}>
                            <strong>Alt Text:</strong> <span style={{ marginLeft: 8 }}>{ad.altText}</span>
                          </div>
                        )}
                        <div style={{ marginBottom: 8 }}>
                          <strong>Clicks:</strong> <span style={{ marginLeft: 8 }}>{ad.clickCount || 0}</span>
                          <strong style={{ marginLeft: 16 }}>Impressions:</strong> <span style={{ marginLeft: 8 }}>{ad.impressions || 0}</span>
                        </div>
                        <div style={{ marginBottom: 8 }}>
                          <strong>Created:</strong> <span style={{ marginLeft: 8 }}>{new Date(ad.createdAt).toLocaleDateString()}</span>
                          <strong style={{ marginLeft: 16 }}>By:</strong> <span style={{ marginLeft: 8 }}>{ad.createdBy || 'Unknown'}</span>
                        </div>
                        <div style={{ marginTop: 12 }}>
                          <button
                            onClick={() => updateAdvertisement(ad._id, { ...ad, isActive: !ad.isActive })}
                            style={{
                              padding: '6px 12px',
                              marginRight: 8,
                              backgroundColor: ad.isActive ? '#dc3545' : '#28a745',
                              color: 'white',
                              border: 'none',
                              borderRadius: 4,
                              cursor: 'pointer'
                            }}
                          >
                            {ad.isActive ? 'Deactivate' : 'Activate'}
                          </button>
                          <button
                            onClick={() => {
                              const newLink = prompt('Enter new link URL:', ad.link || '');
                              if (newLink !== null) {
                                updateAdvertisement(ad._id, { ...ad, link: newLink.trim() });
                              }
                            }}
                            style={{
                              padding: '6px 12px',
                              marginRight: 8,
                              backgroundColor: '#ffc107',
                              color: 'black',
                              border: 'none',
                              borderRadius: 4,
                              cursor: 'pointer'
                            }}
                          >
                            Edit Link
                          </button>
                          <button
                            onClick={() => deleteAdvertisement(ad._id)}
                            style={{
                              padding: '6px 12px',
                              backgroundColor: '#dc3545',
                              color: 'white',
                              border: 'none',
                              borderRadius: 4,
                              cursor: 'pointer'
                            }}
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* CATEGORY MANAGEMENT (Admin only) */}
      {isAdmin && activeTab === "categories" && (
        <div className="category-management" style={{ marginTop: 24 }}>
          <h3>Manage Categories</h3>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 16 }}>
            <input
              type="text"
              placeholder="Add new category"
              value={newCategory}
              onChange={e => setNewCategory(e.target.value)}
              style={{ minWidth: 200 }}
            />
            <button onClick={addCategoryAPI}>Add Category</button>
          </div>
          <div className="categories-list" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {categories.length === 0 ? (
              <div style={{ color: '#999' }}>No categories found.</div>
            ) : (
              categories.map(cat => (
                <div
                  key={cat.id || cat._id || cat.name}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    border: '1px solid #eee',
                    borderRadius: 6,
                    padding: 8,
                    gap: 12
                  }}
                >
                  <span style={{ fontWeight: 500 }}>{cat.name}</span>
                  <button
                    style={{ background: '#f55', color: '#fff', border: 'none', borderRadius: 4, padding: '2px 12px', marginLeft: 16 }}
                    onClick={() => deleteCategoryAPI(cat.id || cat._id)}
                  >
                    Delete
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      )}
      {isShopOwner && currentShop && (
        <div className="product-management">
          <h3>Manage — {currentShop.name}</h3>

          {/* Owner tabs: Orders / Products / Add Product */}
          <div className="owner-tabs" style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button className={ownerTab === 'orders' ? 'active' : ''} onClick={() => { setOwnerTab('orders'); fetchShopOrders(currentShop.id || assignedShop); }}>Orders</button>
            <button className={ownerTab === 'products' ? 'active' : ''} onClick={() => setOwnerTab('products')}>Products</button>
            <button className={ownerTab === 'add' ? 'active' : ''} onClick={() => setOwnerTab('add')}>Add Product</button>
            <button className={ownerTab === 'reviews' ? 'active' : ''} onClick={() => setOwnerTab('reviews')}>Reviews</button>
            <button className={ownerTab === 'shop-info' ? 'active' : ''} onClick={() => setOwnerTab('shop-info')}>Shop Info</button>
          </div>

          {ownerTab === 'orders' && (
            <div className="shop-orders" style={{ marginTop: 20 }}>
              <h4>Recent Orders</h4>
              {(!shopOrders || shopOrders.length === 0) ? (
                <div style={{ color: '#999' }}>No orders yet.</div>
              ) : (
                <ul>
                  {shopOrders.map((o, idx) => {
                    const ordId = o.orderId || o.id || o._id || idx;
                    const receivedAt = o.receivedAt || o.createdAt || o.updatedAt;
                    const items = getOrderItems(o).map((it, i) => normalizeItem(it, i));
                    const itemsTotal = items.reduce((s, it) => s + (it.price * it.quantity), 0);
                    return (
                      <li key={ordId} className="shop-order-card">
                        <div><strong>Order:</strong> {ordId}</div>
                        <div><strong>Buyer:</strong> {getBuyerName(o)}</div>
                        <div><strong>Status:</strong> {o.status || 'new'}</div>
                        {receivedAt && <div style={{ color: '#aaa', fontSize: 12 }}>Updated: {new Date(receivedAt).toLocaleString()}</div>}

                        {items && items.length > 0 && (
                          <div style={{ marginTop: 8 }}>
                            <strong>Items:</strong>
                            <ul style={{ marginTop: 6 }}>
                              {items.map(it => (
                                <li key={it.id} style={{ fontSize: 13 }}>
                                  {it.name} — {it.quantity} × {it.price} ETB = {it.quantity * it.price} ETB
                                </li>
                              ))}
                            </ul>
                            <div style={{ fontSize: 13, color: '#aaa' }}><strong>Items Total:</strong> {itemsTotal} ETB</div>
                          </div>
                        )}

                        <div style={{ marginTop: 6, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                          {(() => {
                            const st = (o.status || 'new');
                            const isInitial = (st === 'new' || st === 'pending');
                            const isConfirmed = (st === 'confirmed');
                            const isFinal = (st === 'cancelled' || st === 'delivered' || st === 'picked_up');
                            const fm = getFulfillmentMethod(o);
                            return (
                              <>
                                {isInitial && (
                                  <button onClick={() => updateOrderStatus(((currentShop && currentShop.id) || assignedShop), ordId, 'confirmed')}>Confirm</button>
                                )}
                                {isConfirmed && (
                                  <>
                                    {fm === 'pickup' ? (
                                      <button onClick={() => updateOrderStatus(((currentShop && currentShop.id) || assignedShop), ordId, 'picked_up')}>Mark Picked Up</button>
                                    ) : fm === 'delivery' ? (
                                      <button onClick={() => updateOrderStatus(((currentShop && currentShop.id) || assignedShop), ordId, 'delivered')}>Mark Delivered</button>
                                    ) : (
                                      <>
                                        <button onClick={() => updateOrderStatus(((currentShop && currentShop.id) || assignedShop), ordId, 'delivered')}>Mark Delivered</button>
                                        <button onClick={() => updateOrderStatus(((currentShop && currentShop.id) || assignedShop), ordId, 'picked_up')}>Mark Picked Up</button>
                                      </>
                                    )}
                                    {/* (Paid action will be shown after delivery/pickup choice) */}
                                  </>
                                )}
                                {!isFinal && (
                                  <button onClick={() => updateOrderStatus(((currentShop && currentShop.id) || assignedShop), ordId, 'cancelled')}>Cancel</button>
                                )}
                                {(o.status === 'cancelled') && (
                                  <button onClick={() => deleteOrderAPI(((currentShop && currentShop.id) || assignedShop), ordId)} style={{ background: '#a33', color: 'rgba(170, 51, 51, 0.76)' }}>Delete</button>
                                )}
                              </>
                            );
                          })()}
                        </div>
                        <div style={{ color: '#aaa', fontSize: 12 }}>Received: {receivedAt ? new Date(receivedAt).toLocaleString() : '—'}</div>
                        {/* Show 'Mark Paid' only after order is delivered or picked up (appear after owner chooses) */}
                        {((o.status === 'delivered' || o.status === 'picked_up') && !(o.paymentStatus === 'paid' || (o.payment && (o.payment.status === 'paid' || o.payment.paidAt)))) && (
                          <div style={{ marginTop: 8 }}>
                            <button onClick={() => confirmOrderPayment(((currentShop && currentShop.id) || assignedShop), ordId)}>Mark Paid</button>
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          )}

          {ownerTab === 'add' && (
            <div className="add-product-form" style={{ marginTop: 20 }}>
              <input placeholder="Product name" value={newProduct.name} onChange={e => setNewProduct(prev => ({ ...prev, name: e.target.value }))} />
              <select value={newProduct.category} onChange={e => setNewProduct(prev => ({ ...prev, category: e.target.value }))}>
                <option value="">Select category</option>
                {mergedCategories.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <select value={newProduct.unit} onChange={e => setNewProduct(prev => ({ ...prev, unit: e.target.value }))}>
                <option value="piece">Piece</option>
                <option value="kg">Kg</option>
              </select>
              <input placeholder="Price in ETB" type="number" value={newProduct.price} onChange={e => setNewProduct(prev => ({ ...prev, price: Number(e.target.value) }))} />
                <input placeholder="Short description" value={newProduct.description} onChange={e => setNewProduct(prev => ({ ...prev, description: e.target.value }))} />
                <input type="file" accept="image/*" multiple onChange={e => {
                  const files = e.target.files ? Array.from(e.target.files) : [];
                  setNewProduct(prev => ({ ...prev, imageFiles: files, imageFile: files.length === 1 ? files[0] : null }));
                }} />
                <textarea placeholder="Detailed description" value={newProduct.details} onChange={e => setNewProduct(prev => ({ ...prev, details: e.target.value }))} />
                <select value={newProduct.condition} onChange={e => setNewProduct(prev => ({ ...prev, condition: e.target.value }))}>
                  <option value="">Condition (optional)</option>
                  <option value="new">New</option>
                  <option value="used">Used</option>
                </select>
                <input placeholder="Shop phone number" value={newProduct.shopPhone} onChange={e => setNewProduct(prev => ({ ...prev, shopPhone: e.target.value }))} />
                <input placeholder="Shop location / address" value={newProduct.shopLocation} onChange={e => setNewProduct(prev => ({ ...prev, shopLocation: e.target.value }))} />
              <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                  <input type="checkbox" checked={newProduct.inStock} onChange={e => setNewProduct(prev => ({ ...prev, inStock: e.target.checked }))} /> In stock
                </label>
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                  Stock:
                  <input type="number" min="0" value={newProduct.stock} onChange={e => setNewProduct(prev => ({ ...prev, stock: Number(e.target.value) || 0 }))} style={{ width: 80 }} />
                </label>
              </div>
              <div style={{ marginTop: 8 }}>
                <button onClick={async () => {
                  const created = await addProductAPI(currentShop.id, newProduct);
                  if (created) { 
                    const shopPhone = currentShop?.owner?.phone || '';
                    const shopLocation = currentShop?.address || '';
                    setNewProduct({ name: '', price: '', image: '', images: [], imageFile: null, imageFiles: [], description: '', details: '', condition: '', unit: 'piece', shopPhone, shopLocation, inStock: true, stock: 1, category: '' }); 
                    fetchShops(); 
                    setOwnerTab('products'); 
                  }
                }}>Add Product</button>
              </div>
            </div>
          )}

          {ownerTab === 'products' && (
            <div className="products-list" style={{ marginTop: 20 }}>
              {(currentShop.products || []).map(p => (
                <div key={p.id} className={`product-item ${((typeof p.stock !== 'undefined') ? (p.stock > 0 ? '' : 'out-of-stock') : (p.inStock ? '' : 'out-of-stock'))}`}>
                  <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                    {p.image && <img src={p.image} alt={p.name} style={{ width: 80, height: 80, objectFit: 'cover', borderRadius: 8 }} />}
                    <div className="product-info">
                      <div className="name">{p.name}</div>
                      <div className="description">{p.description}</div>
                      <div className="price-stock">
                        <span className="price">{p.price} ETB</span>
                        {typeof p.stock !== 'undefined' ? (
                          p.stock > 0 ? <span className="stock-number">{p.stock} left</span> : <span className="stock-number out-of-stock">Out of stock</span>
                        ) : (
                          p.inStock ? <span className="stock-number">In stock ({(typeof p.stock !== 'undefined') ? p.stock : 1})</span> : <span className="stock-number out-of-stock">Out of stock</span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <button onClick={() => { setEditingProductId(p.id); setEditingProduct({ ...p }); }}>Edit</button>
                    <button onClick={async () => { const ok = await deleteProductAPI(currentShop.id, p.id); if (ok) fetchShops(); }}>Delete</button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {ownerTab === 'reviews' && (
            <div className="shop-reviews" style={{ marginTop: 20 }}>
              <h4>Product Reviews</h4>
              {(!selectedShop || !(selectedShop.products && selectedShop.products.length)) ? (
                <div style={{ color: '#999' }}>No products to show reviews for.</div>
              ) : (
                Object.values(shopReviewsByProduct).length === 0 ? (
                  <div style={{ color: '#666' }}>No reviews yet. <button onClick={() => fetchShopReviews(selectedShop || shops.find(s => Number(s.id) === Number(assignedShop)))}>Refresh</button></div>
                ) : (
                  <div style={{ display: 'grid', gap: 16 }}>
                    {Object.values(shopReviewsByProduct).map(pr => (
                      <div key={pr.product.id} style={{ border: '1px solid #eee', padding: 12, borderRadius: 6 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div style={{ fontWeight: 700 }}>{pr.product.name}</div>
                          <div style={{ color: '#666' }}>{pr.count} reviews • Avg {Number(pr.average || 0).toFixed(1)}</div>
                        </div>
                        <div style={{ marginTop: 8 }}>
                          <ReviewsList reviews={pr.reviews} average={pr.average} count={pr.count} />
                        </div>
                      </div>
                    ))}
                  </div>
                )
              )}
            </div>
          )}

          {ownerTab === 'shop-info' && (
            <div className="shop-info" style={{ marginTop: 20 }}>
              <h4>Shop Information</h4>
              <p style={{ color: '#666', marginBottom: 20, fontSize: '14px' }}>
                Manage your shop's public information that customers see on product listings. 
                This is separate from your personal profile.
              </p>
              
              <div style={{ 
                display: 'grid', 
                gap: 16, 
                maxWidth: 500,
                background: '#f8f9fa',
                padding: 20,
                borderRadius: 8,
                border: '1px solid #e9ecef'
              }}>
                <div>
                  <label style={{ display: 'block', marginBottom: 6, fontWeight: 600, color: '#333' }}>
                    Shop Name
                  </label>
                  <input
                    type="text"
                    value={shopInfoForm.name}
                    onChange={e => setShopInfoForm(prev => ({ ...prev, name: e.target.value }))}
                    style={{ 
                      width: '100%', 
                      padding: '10px 12px', 
                      border: '1px solid #ced4da', 
                      borderRadius: 6,
                      fontSize: '14px',
                      background: 'white'
                    }}
                    placeholder="Enter your shop name"
                  />
                </div>
                
                <div>
                  <label style={{ display: 'block', marginBottom: 6, fontWeight: 600, color: '#333' }}>
                    Shop Phone <span style={{ fontWeight: 400, color: '#666', fontSize: '12px' }}>(shown on products)</span>
                  </label>
                  <input
                    type="tel"
                    value={shopInfoForm.phone}
                    onChange={e => setShopInfoForm(prev => ({ ...prev, phone: e.target.value }))}
                    style={{ 
                      width: '100%', 
                      padding: '10px 12px', 
                      border: '1px solid #ced4da', 
                      borderRadius: 6,
                      fontSize: '14px',
                      background: 'white'
                    }}
                    placeholder="Phone number displayed on your products"
                  />
                </div>
                
                <div>
                  <label style={{ display: 'block', marginBottom: 6, fontWeight: 600, color: '#333' }}>
                    Shop Address
                  </label>
                  <input
                    type="text"
                    value={shopInfoForm.address}
                    onChange={e => setShopInfoForm(prev => ({ ...prev, address: e.target.value }))}
                    style={{ 
                      width: '100%', 
                      padding: '10px 12px', 
                      border: '1px solid #ced4da', 
                      borderRadius: 6,
                      fontSize: '14px',
                      background: 'white'
                    }}
                    placeholder="Enter your shop address"
                  />
                </div>
                
                <div>
                  <label style={{ display: 'block', marginBottom: 6, fontWeight: 600, color: '#333' }}>
                    Shop Logo
                  </label>
                  {shopInfoForm.logo && (
                    <div style={{ marginBottom: 8 }}>
                      <img 
                        src={shopInfoForm.logo} 
                        alt="Current logo" 
                        style={{ 
                          maxWidth: 120, 
                          maxHeight: 120, 
                          border: '2px solid #dee2e6', 
                          borderRadius: 8,
                          background: 'white',
                          padding: 4
                        }} 
                      />
                    </div>
                  )}
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={e => {
                      const file = e.target.files[0];
                      if (file) {
                        // Validate file type
                        const ALLOWED = ['image/jpeg', 'image/png', 'image/webp'];
                        if (!ALLOWED.includes(file.type)) {
                          alert('Please select a JPG, PNG, or WEBP image file.');
                          e.target.value = '';
                          return;
                        }
                        // Validate file size (5MB max)
                        const MAX_BYTES = 5 * 1024 * 1024;
                        if (file.size > MAX_BYTES) {
                          alert('Image file is too large. Maximum size is 5MB.');
                          e.target.value = '';
                          return;
                        }
                        // Store the file for upload
                        setShopInfoForm(prev => ({ ...prev, logoFile: file }));
                      }
                    }}
                    style={{ 
                      width: '100%', 
                      padding: '8px 12px', 
                      border: '1px solid #ced4da', 
                      borderRadius: 6,
                      fontSize: '14px',
                      background: 'white'
                    }}
                  />
                  <small style={{ color: '#666', display: 'block', marginTop: 6, fontSize: '12px' }}>
                    Upload a new logo image (JPG, PNG, or WEBP, max 5MB). Leave empty to keep current logo.
                  </small>
                </div>
                
                <div>
                  <label style={{ display: 'block', marginBottom: 6, fontWeight: 600, color: '#333' }}>
                    Delivery Fee (ETB)
                  </label>
                  <input
                    type="number"
                    value={shopInfoForm.deliveryFee}
                    onChange={e => setShopInfoForm(prev => ({ ...prev, deliveryFee: Number(e.target.value) || 0 }))}
                    style={{ 
                      width: '100%', 
                      padding: '10px 12px', 
                      border: '1px solid #ced4da', 
                      borderRadius: 6,
                      fontSize: '14px',
                      background: 'white'
                    }}
                    min="0"
                    step="0.01"
                  />
                </div>
                
                <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid #dee2e6' }}>
                  <button 
                    onClick={async () => {
                      if (!currentShop) return;
                      try {
                        let logoUrl = shopInfoForm.logo; // Keep existing logo by default
                        
                        // Upload new logo if selected
                        if (shopInfoForm.logoFile) {
                          const fd = new FormData();
                          fd.append('file', currentShop.logoFile);
                          const up = await uploadFile(fd);
                          if (!up) {
                            const attempts = (window._lastUploadAttempts || []).join(', ');
                            throw new Error(`Logo upload failed: no response from server. Attempted: ${attempts}`);
                          }
                          if (!up.ok) {
                            const text = await up.text().catch(() => '');
                            throw new Error(`Logo upload failed (${up.status}): ${text}`);
                          }
                          const upText = await up.text().catch(() => '');
                          let j;
                          try { j = upText ? JSON.parse(upText) : {}; } catch (e) { j = upText; }
                          if (j && j.url) {
                            logoUrl = j.url;
                          } else {
                            throw new Error('Logo upload failed: no URL returned from server');
                          }
                        }
                        
                        const payload = {
                          name: shopInfoForm.name,
                          address: shopInfoForm.address,
                          phone: shopInfoForm.phone || '',
                          logo: logoUrl,
                          deliveryFee: shopInfoForm.deliveryFee || 0,
                          deliveryServices: currentShop.deliveryServices || [],
                          owner: {
                            ...currentShop.owner,
                            phone: shopInfoForm.phone || '',
                            name: currentShop.owner?.name || '',
                            address: currentShop.owner?.address || ''
                          }
                        };
                        
                        const response = await fetch(`${API_BASE}/api/shops/${currentShop.id}`, {
                          method: 'PUT',
                          credentials: 'include',
                          headers: { 'Content-Type': 'application/json', ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}) },
                          body: JSON.stringify(payload)
                        });
                        
                        if (response.ok) {
                          alert('Shop information updated successfully!');
                          // Clear the logoFile after successful upload
                          setShopInfoForm(prev => ({ ...prev, logoFile: null, logo: logoUrl }));
                          fetchShops(); // Refresh shop data
                        } else {
                          const error = await response.text();
                          alert('Failed to update shop information: ' + error);
                        }
                      } catch (err) {
                        console.error('Update shop info error:', err);
                        alert('Error updating shop information: ' + (err.message || err));
                      }
                    }}
                    style={{ 
                      background: '#007bff', 
                      color: 'white', 
                      border: 'none', 
                      padding: '12px 24px', 
                      borderRadius: 6, 
                      cursor: 'pointer',
                      fontSize: '14px',
                      fontWeight: 500,
                      width: '100%'
                    }}
                  >
                    Save Shop Information
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Edit product modal-ish area */}
          {editingProductId && editingProduct && (
            <div className="edit-product-form">
              <h4>Edit Product</h4>
              <select value={editingProduct.category || ''} onChange={e => setEditingProduct(prev => ({ ...prev, category: e.target.value }))}>
                <option value="">Select category</option>
                {mergedCategories.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <input value={editingProduct.name} onChange={e => setEditingProduct(prev => ({ ...prev, name: e.target.value }))} />
              <input type="number" placeholder="Price in ETB" value={editingProduct.price} onChange={e => setEditingProduct(prev => ({ ...prev, price: Number(e.target.value) }))} />
              <select value={editingProduct.unit || 'piece'} onChange={e => setEditingProduct(prev => ({ ...prev, unit: e.target.value }))}>
                <option value="piece">Piece</option>
                <option value="kg">Kg</option>
              </select>
              <select value={editingProduct.condition || ''} onChange={e => setEditingProduct(prev => ({ ...prev, condition: e.target.value }))}>
                <option value="">Condition (optional)</option>
                <option value="new">New</option>
                <option value="used">Used</option>
              </select>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input type="file" accept="image/*" multiple onChange={e => {
                  const files = e.target.files ? Array.from(e.target.files) : [];
                  setEditingProduct(prev => ({ ...prev, imageFiles: files, imageFile: files.length === 1 ? files[0] : null }));
                }} />
                {editingProduct.image && <img src={editingProduct.image} alt="preview" style={{ width: 60, height: 60, objectFit: 'cover', borderRadius: 6 }} />}
              </div>
              <input value={editingProduct.description} onChange={e => setEditingProduct(prev => ({ ...prev, description: e.target.value }))} />
              <textarea placeholder="Detailed description" value={editingProduct.details || ''} onChange={e => setEditingProduct(prev => ({ ...prev, details: e.target.value }))} />
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                <input type="checkbox" checked={editingProduct.inStock} onChange={e => setEditingProduct(prev => ({ ...prev, inStock: e.target.checked }))} /> In stock
              </label>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, marginLeft: 12 }}>
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                  Stock:
                  <input type="number" min="0" value={typeof editingProduct.stock !== 'undefined' ? editingProduct.stock : (editingProduct.inStock ? 1 : 0)} onChange={e => setEditingProduct(prev => ({ ...prev, stock: Number(e.target.value) || 0 }))} style={{ width: 80 }} />
                </label>
              </div>
              <div style={{ marginTop: 8 }}>
                <button onClick={async () => {
                  const updated = await updateProductAPI(currentShop.id, editingProductId, editingProduct);
                  if (updated) { setEditingProductId(null); setEditingProduct(null); fetchShops(); }
                }}>Save</button>
                <button onClick={() => { setEditingProductId(null); setEditingProduct(null); }}>Cancel</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default AdminDashboard;