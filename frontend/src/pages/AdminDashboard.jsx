import React, { useState, useEffect } from "react";
import { useNavigate } from 'react-router-dom';
// product categories are computed dynamically from products (do not import shop-based categories)
import { useAuth } from "../hooks/useAuth";
import apiFetch from '../utils/apiFetch';
import { API_BASE } from '../utils/api';
import ReviewsList from '../components/ReviewsList';
import "./AdminDashboard.css";

const AdminDashboard = () => {
  const [shops, setShops] = useState([]);
  const [selectedShop, setSelectedShop] = useState(null);
  const [activeTab, setActiveTab] = useState("shops"); // default to shops
  const [shopOrders, setShopOrders] = useState([]);
  const [newShop, setNewShop] = useState({
    name: "",
    deliveryFee: '',
    address: '',
    phone: '',
    geo: null, // optional { lat, lng }
    owner: { username: "", password: "" }
  });
  const [editingShop, setEditingShop] = useState(null);

  // Owner tab for shop-owner UI: 'orders' | 'products' | 'add'
  const [ownerTab, setOwnerTab] = useState('orders');

  // reviews state for shop-owner view
  const [shopReviewsByProduct, setShopReviewsByProduct] = useState({});

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

  const createNewShopAPI = async () => {
    if (!newShop.name.trim() || !newShop.owner.username || !newShop.owner.password || !newShop.address || !String(newShop.address).trim()) {
      alert("Please fill in required fields (Shop name, Owner username/password, and Shop address)");
      return;
    }
    const payload = { ...newShop };

    try {
      const data = await apiFetch(`${API_BASE}/api/shops`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}) },
        body: JSON.stringify(payload)
      });
      setShops(prev => [...prev, data]);
      try { localStorage.setItem('updatedShops', JSON.stringify([...shops, data])); } catch {}
      setNewShop({ name: "", deliveryFee: 50, address: '', phone: '', owner: { username: "", password: "" } });
      alert("Shop created successfully!");
    } catch (err) {
      console.error(err);
      alert("Error creating shop");
    }
  };

  const updateShopAPI = async (shopId) => {
    if (!editingShop.name.trim() || !editingShop.owner.username || !editingShop.address || !String(editingShop.address).trim()) {
      alert("Please fill in Shop Name, Owner Username, and Shop Address");
      return;
    }

    // Build payload and strip fields that would fail validation (e.g. empty password)
    const payload = { ...editingShop };
    if (payload.owner) {
      // if password is empty or too short, remove it so backend validation (min 6) won't fail
      if (!payload.owner.password || String(payload.owner.password).trim().length < 6) {
        const { password, ...ownerNoPass } = payload.owner;
        payload.owner = ownerNoPass;
      }
      // if owner object now has no keys, remove it entirely
      if (Object.keys(payload.owner).length === 0) delete payload.owner;
    }

    try {
      const data = await apiFetch(`${API_BASE}/api/shops/${shopId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}) },
        body: JSON.stringify(payload)
      });
      setShops(prev => prev.map(shop => shop.id === shopId ? data : shop));
      try { localStorage.setItem('updatedShops', JSON.stringify(shops.map(shop => shop.id === shopId ? data : shop))); } catch {}
      setEditingShop(null);
      alert("Shop updated successfully!");
    } catch (err) {
      console.error('updateShopAPI error', err);
      // surface validation details from backend when available
      if (err && err.response && err.response.errors && Array.isArray(err.response.errors)) {
        const msg = err.response.errors.map(e => `${e.path || 'field'}: ${e.message}`).join('\n');
        alert(`Validation failed:\n${msg}`);
      } else if (err && err.response && err.response.message) {
        alert(`Error updating shop: ${err.response.message}`);
      } else {
        alert("Error updating shop");
      }
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
      payload.condition = product.condition || 'new';
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
      if (typeof product.condition !== 'undefined') payload.condition = product.condition;
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
    if (window.confirm("Logout?")) logout();
  };

    // image handling removed

  const _accessibleShops = isAdmin ? shops : shops.filter(shop => shop.id === assignedShop);
  const currentShop = shops.find(shop => shop.id === selectedShop?.id) || selectedShop;
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
      try {
        // dynamic import to avoid top-level dependency if file changes
        const { categories: fallback } = require('../data/shopsData');
        if (Array.isArray(fallback)) return fallback.filter(c => c !== 'All');
      } catch (e) {
        // ignore and return empty
      }
    }
    return derived;
  }, [shops]);

  // ===================== Input Handlers =====================
  const handleNewShopInputChange = (e) => {
    const { name, value } = e.target;
    if (name.startsWith("owner.")) {
      const field = name.split(".")[1];
      setNewShop(prev => ({ ...prev, owner: { ...prev.owner, [field]: value } }));
    } else setNewShop(prev => ({ ...prev, [name]: value }));
  };

  const handleEditShopInputChange = (e) => {
    const { name, value } = e.target;
    if (name.startsWith("owner.")) {
      const field = name.split(".")[1];
      setEditingShop(prev => ({ ...prev, owner: { ...prev.owner, [field]: value } }));
    } else setEditingShop(prev => ({ ...prev, [name]: value }));
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

  const captureGeoForEditShop = () => {
    if (!navigator.geolocation) {
      alert('Geolocation is not supported by your browser');
      return;
    }
    navigator.geolocation.getCurrentPosition((pos) => {
      setEditingShop(prev => ({ ...prev, geo: { lat: pos.coords.latitude, lng: pos.coords.longitude } }));
    }, (err) => {
      console.warn('Geo error', err);
      alert('Unable to get your location. You can enter the address manually.');
    }, { timeout: 10000 });
  };

  const startEditingShop = (shop) => {
    setEditingShop({ ...shop, owner: { ...shop.owner, password: "" } });
  };

  const cancelEditingShop = () => setEditingShop(null);

    // product controls removed

  // product form state for shop owners
  const [newProduct, setNewProduct] = useState({ name: '', price: '', image: '', images: [], imageFile: null, imageFiles: [], description: '', details: '', condition: 'new', shopPhone: '', shopLocation: '', inStock: true, stock: 1, category: '' });
  const [editingProductId, setEditingProductId] = useState(null);
  const [editingProduct, setEditingProduct] = useState(null);
  // declared above near top to ensure effects can reference it

  // ===================== Render =====================
  return (
    <div className="admin-dashboard">
      {/* HEADER */}
      <div className="admin-header">
        <h1 className="admin-title">{isAdmin ? "Admin Dashboard" : "My Shop Dashboard"}</h1>
        <div>
          {isAdmin && <button onClick={fetchShops}>Refresh Shops</button>}
          {isShopOwner && currentShop && <button className="refresh-orders-btn" onClick={() => fetchShopOrders(currentShop.id)}>Refresh Orders</button>}
          <button className="admin-logout-btn" onClick={handleLogout}>Logout</button>
        </div>
      </div>

      {/* TABS */}
      {isAdmin && (
        <div className="admin-tabs">
          <button className={activeTab === "shops" ? "active" : ""} onClick={() => setActiveTab("shops")}>🏪 Manage Shops</button>
          <button className="" onClick={() => navigate('/admin/orders')}>📋 Manage Orders</button>
        </div>
      )}

      {/* SHOP MANAGEMENT */}
      {isAdmin && activeTab === "shops" && (
        <div className="shop-management">
          {/* CREATE NEW SHOP */}
          <div className="create-shop-section">
            <h3>Create New Shop</h3>
            <input name="name" placeholder="Shop Name" value={newShop.name} onChange={handleNewShopInputChange} />
            {/* Category removed from shop creation; categories are chosen per-product now */}
            <input name="address" placeholder="Shop address" value={newShop.address} onChange={handleNewShopInputChange} />
            <input type="number" name="deliveryFee" placeholder="Delivery fee" value={newShop.deliveryFee} onChange={handleNewShopInputChange} />
            <input name="phone" placeholder="Shop phone number" value={newShop.phone} onChange={handleNewShopInputChange} />
            <input name="owner.username" value={newShop.owner.username} onChange={handleNewShopInputChange} placeholder="Owner Username" />
            <input type="password" name="owner.password" value={newShop.owner.password} onChange={handleNewShopInputChange} placeholder="Owner Password" />
              <div style={{ fontSize: 12, color: '#666', marginTop: 6 }}>Please provide the shop's address/location — this is required.</div>
            <button onClick={createNewShopAPI}>Create New Shop</button>
          </div>

          {/* EXISTING SHOPS */}
          <div className="shops-list">
            {shops.map(shop => (
              <div key={shop.id} className="shop-card">
                {editingShop?.id === shop.id ? (
                  <div>
                    <input name="name" value={editingShop.name} onChange={handleEditShopInputChange} />
                    <input type="number" name="deliveryFee" placeholder="Delivery fee" value={editingShop.deliveryFee} onChange={handleEditShopInputChange} />
                    <input name="phone" placeholder="Shop phone number" value={editingShop.phone || ''} onChange={handleEditShopInputChange} />
                    <input name="owner.username" value={editingShop.owner.username} onChange={handleEditShopInputChange} />
                    <input type="password" name="owner.password" value={editingShop.owner.password} onChange={handleEditShopInputChange} placeholder="New password" />
                    <button onClick={() => updateShopAPI(shop.id)}>Save</button>
                    <button onClick={cancelEditingShop}>Cancel</button>
                  </div>
                ) : (
                  <div>
                    <p>{shop.name} | Delivery: {shop.deliveryFee} ETB</p>
                    <p>Owner: {shop.owner.username}</p>
                    <button onClick={() => startEditingShop(shop)}>Edit</button>
                    <button onClick={() => deleteShopAPI(shop.id)}>Delete</button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* SHOP OWNER: Product management for assigned shop */}
      {isShopOwner && currentShop && (
        <div className="product-management">
          <h3>Manage — {currentShop.name}</h3>

          {/* Owner tabs: Orders / Products / Add Product */}
          <div className="owner-tabs" style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button className={ownerTab === 'orders' ? 'active' : ''} onClick={() => { setOwnerTab('orders'); fetchShopOrders(currentShop.id || assignedShop); }}>Orders</button>
            <button className={ownerTab === 'products' ? 'active' : ''} onClick={() => setOwnerTab('products')}>Products</button>
            <button className={ownerTab === 'reviews' ? 'active' : ''} onClick={() => setOwnerTab('reviews')}>Reviews</button>
            <button className={ownerTab === 'add' ? 'active' : ''} onClick={() => setOwnerTab('add')}>Add Product</button>
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
                      <li key={ordId} style={{ padding: '8px 0', borderBottom: '1px dashed rgba(255,255,255,0.04)' }}>
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
                            <div style={{ fontSize: 13, color: '#eee' }}><strong>Items Total:</strong> {itemsTotal} ETB</div>
                          </div>
                        )}

                        <div style={{ marginTop: 6, display: 'flex', gap: 8, alignItems: 'center' }}>
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
                                  <button onClick={() => deleteOrderAPI(((currentShop && currentShop.id) || assignedShop), ordId)} style={{ background: '#a33', color: '#fff' }}>Delete</button>
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
                {shopCategories.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <input placeholder="Price in ETB" type="number" value={newProduct.price} onChange={e => setNewProduct(prev => ({ ...prev, price: Number(e.target.value) }))} />
                <input placeholder="Short description" value={newProduct.description} onChange={e => setNewProduct(prev => ({ ...prev, description: e.target.value }))} />
                <input type="file" accept="image/*" multiple onChange={e => {
                  const files = e.target.files ? Array.from(e.target.files) : [];
                  setNewProduct(prev => ({ ...prev, imageFiles: files, imageFile: files.length === 1 ? files[0] : null }));
                }} />
                <textarea placeholder="Detailed description" value={newProduct.details} onChange={e => setNewProduct(prev => ({ ...prev, details: e.target.value }))} />
                <select value={newProduct.condition} onChange={e => setNewProduct(prev => ({ ...prev, condition: e.target.value }))}>
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
                  if (created) { setNewProduct({ name: '', price: '', image: '', images: [], imageFile: null, imageFiles: [], description: '', details: '', condition: 'new', shopPhone: '', shopLocation: '', inStock: true, stock: 1 }); fetchShops(); setOwnerTab('products'); }
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

          {/* Edit product modal-ish area */}
          {editingProductId && editingProduct && (
            <div className="edit-product-form">
              <h4>Edit Product</h4>
              <select value={editingProduct.category || ''} onChange={e => setEditingProduct(prev => ({ ...prev, category: e.target.value }))}>
                <option value="">Select category</option>
                {shopCategories.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <input value={editingProduct.name} onChange={e => setEditingProduct(prev => ({ ...prev, name: e.target.value }))} />
              <input type="number" placeholder="Price in ETB" value={editingProduct.price} onChange={e => setEditingProduct(prev => ({ ...prev, price: Number(e.target.value) }))} />
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