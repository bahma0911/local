// src/pages/Checkout.jsx - CLEAN WORKING VERSION
import React, { useState, useEffect } from 'react';
/* Cloudflare Turnstile replaces reCAPTCHA */
import { useNavigate } from 'react-router-dom';
import { useCart } from '../hooks/useCart';
import { useAuth } from '../hooks/useAuth';
import "./Checkout.css";
import apiFetch from '../utils/apiFetch';
import { API_BASE } from '../utils/api';

const Checkout = () => {
  const { 
    cartItems, 
    cartItemsByShop = {},
    itemsTotal, 
    totalItems,
    clearCart,
    deliveryOptions,
    applyAdjustments,
    checkProductStock
  } = useCart();

  const { user, csrfToken } = useAuth();
  const navigate = useNavigate();
  
  const [customerInfo, setCustomerInfo] = useState({
    fullName: user?.username || '',
    email: user?.email || '',
    phone: user?.phone || '',
    address: user?.address || '',
    city: user?.city || '',
  });

  // persist the form so reloads (e.g. after adjustments) don't wipe it
  useEffect(() => {
    try {
      const saved = localStorage.getItem('checkoutCustomerInfo');
      if (saved) {
        setCustomerInfo(prev => ({ ...prev, ...JSON.parse(saved) }));
      }
    } catch (e) { /* ignore parse errors */ }
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem('checkoutCustomerInfo', JSON.stringify(customerInfo));
    } catch (e) { /* ignore */ }
  }, [customerInfo]);

  const [isProcessing, setIsProcessing] = useState(false);
  const [preflightAdjustments, setPreflightAdjustments] = useState([]);
  const [showPreflightModal, setShowPreflightModal] = useState(false);
  const [showVerifyModal, setShowVerifyModal] = useState(false);
  const [orderCompleted, setOrderCompleted] = useState(false);
  const [captchaToken, setCaptchaToken] = useState(null);
  const [widgetId, setWidgetId] = useState(null);
  const widgetRef = React.useRef(null);
  if (import.meta.env.DEV && !import.meta.env.VITE_TURNSTILE_SITE_KEY) {
    console.warn('Turnstile site key not set; captcha will not work');
  }
  // load turnstile script once and render invisible widget programmatically
  useEffect(() => {
    // remove any leftover reCAPTCHA library just in case an old page added it
    document.querySelectorAll('script[src*="recaptcha"]').forEach(s => s.remove());

    if (!window.turnstile) {
      const s = document.createElement('script');
      s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js';
      s.async = true;
      s.onload = () => renderWidget();
      document.body.appendChild(s);
    } else {
      renderWidget();
    }

    function renderWidget() {
      if (!widgetRef.current || widgetId !== null) return;
      const id = window.turnstile.render(widgetRef.current, {
        sitekey: import.meta.env.VITE_TURNSTILE_SITE_KEY,
        // Turnstile does not actually support "invisible" size (it logs an error),
        // so use the normal widget and hide it ourselves. the user will never see it
        size: 'normal',
        callback: (token) => setCaptchaToken(token),
        'expired-callback': () => setCaptchaToken(null),
        'error-callback': () => setCaptchaToken(null)
      });
      setWidgetId(id);
    }

    return () => {
      window.onTurnstileSuccess = null;
      window.onTurnstileExpired = null;
    };
  }, [widgetId]);
  const [orderNumber, setOrderNumber] = useState('');
  const [completionMessage, setCompletionMessage] = useState('');
  const [recentCheckoutUrl, setRecentCheckoutUrl] = useState('');
  const [recentCreatedOrders, setRecentCreatedOrders] = useState([]);
  const [pickupLocations, setPickupLocations] = useState([]);
  const [showDeliveryPaymentMessage, setShowDeliveryPaymentMessage] = useState(false);
  const [finalTotal, setFinalTotal] = useState(null);
  const [serverAdjustments, setServerAdjustments] = useState([]);
  
  // deliveryOptions will be used to detect per-shop pickup vs delivery

  const validateCustomerInfo = () => {
    // simple trim-check to ensure user didn't submit only whitespace
    const f = (s) => typeof s === 'string' && s.trim() !== '';
    if (!f(customerInfo.fullName) || !f(customerInfo.email) || !f(customerInfo.phone) || !f(customerInfo.address) || !f(customerInfo.city)) {
      alert('Please fill in all required fields');
      return false;
    }
    return true;
  };

  const buildItemsByShop = () => {
    return Object.entries(cartItemsByShop).reduce((acc, [shopId, shopData]) => {
      acc[shopId] = {
        shop: {
          id: shopData.shop.id,
          name: shopData.shop.name,
          deliveryFee: shopData.shop.deliveryFee,
        },
        items: (shopData.items || []).map(item => ({
          id: item.id,
          name: item.name,
          price: item.price,
          quantity: item.quantity,
          shopId: shopId,
        })),
      };
      return acc;
    }, {});
  };

  const buildOrderPayload = (overrides = {}) => {
    const itemsByShop = buildItemsByShop();
    const customerIdentity = {
      username: user?.username || customerInfo.fullName,
      email: user?.email || customerInfo.email,
      phone: user?.phone || customerInfo.phone,
    };

    const baseOrder = {
      id: `ORD-${Date.now()}`,
      customer: {
        fullName: customerInfo.fullName,
        email: customerInfo.email,
        phone: customerInfo.phone,
        address: customerInfo.address,
        city: customerInfo.city
      },
      customerMeta: customerIdentity,
      // explicit creator identity to ensure order visibility is limited to creator
      createdBy: user?.username || customerIdentity.username || null,
      items: cartItems.map(item => ({
        id: item.id,
        name: item.name,
        price: item.price,
        quantity: item.quantity,
        shopId: item.shopId,
        image: item.image,
      })),
      itemsByShop,
      deliveryOptions: Object.keys(itemsByShop).reduce((acc, shopId) => {
        acc[shopId] = (deliveryOptions && deliveryOptions[shopId]) || 'Pickup';
        return acc;
      }, {}),
      subtotal: computedItemsTotal,
      deliveryTotal: deliveryFee,
      total: computedItemsTotal + deliveryFee,
      payment: {
        method: 'cash_on_delivery',
        status: 'pending',
        amount: computedItemsTotal + deliveryFee,
        currency: 'ETB',
      },
      status: 'pending',
      createdAt: new Date().toISOString()
    };

    return {
      ...baseOrder,
      ...overrides,
      payment: {
        ...baseOrder.payment,
        ...(overrides.payment || {})
      }
    };
  };

  const persistOrder = (order) => {
    // client-side persistence removed - orders are now persisted server-side
    return false;
  };

  const completeOrderFlow = (order, message, { checkoutUrl } = {}, pickupLocationsForOrder = []) => {
    // Orders are persisted on the server; any shop notifications are created by the server
    setOrderNumber(order.id);
    setCompletionMessage(message);
    setRecentCheckoutUrl(checkoutUrl || '');
    setOrderCompleted(true);
    setPickupLocations(pickupLocationsForOrder || []);
    // capture the final total before clearing the cart (order payload should include total)
    const final = (order && (order.total || (order.payment && order.payment.amount))) || (computedItemsTotal + deliveryFee);
    setFinalTotal(final);
    clearCart();
  };

  // Compute delivery fee per shop based on selected delivery options
  const deliveryFee = Object.entries(cartItemsByShop).reduce((sum, [shopId, shopData]) => {
    const opt = (deliveryOptions && deliveryOptions[shopId]) || 'Pickup';
    if (opt === 'Delivery') {
      return sum + (shopData.shop.deliveryFee || 0);
    }
    return sum;
  }, 0);

  // Compute items total locally from cartItems to ensure correctness and reactivity
  const computedItemsTotal = Array.isArray(cartItems)
    ? cartItems.reduce((sum, item) => sum + (Number(item.price || 0) * Number(item.quantity || 0)), 0)
    : 0;

  const totalAmount = computedItemsTotal + deliveryFee;

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setCustomerInfo(prev => ({
      ...prev,
      [name]: value
    }));
  };

  // when the user object becomes available, pre-populate the form
  useEffect(() => {
    if (user) {
      setCustomerInfo(prev => ({
        fullName: prev.fullName || user.fullName || user.username || '',
        email: prev.email || user.email || '',
        phone: prev.phone || user.phone || '',
        address: prev.address || user.address || '',
        city: prev.city || user.city || ''
      }));
    }
  }, [user]);

  const handleSubmitOrder = async (e) => {
    if (e && typeof e.preventDefault === 'function') e.preventDefault();

    // log current customer info and persisted copy for debugging
    try {
      console.debug('handleSubmitOrder start; customerInfo=', customerInfo, 'localStorage=', localStorage.getItem('checkoutCustomerInfo'));
    } catch (e) {
      /* ignore */
    }

    if (isProcessing) {
      console.debug('handleSubmitOrder aborted because isProcessing');
      return;
    }

    if (!validateCustomerInfo()) {
      console.debug('handleSubmitOrder validation failed, customerInfo=', customerInfo);
      return;
    }

    // Require login before placing order
    if (!user) {
      alert('Please login to place an order');
      navigate('/login');
      return;
    }

    // Ensure captcha is solved
    if (!captchaToken) {
      // if we have a widget id we can reset before executing to avoid reuse warning
      if (window.turnstile && widgetId !== null) {
        try {
          window.turnstile.reset(widgetId);
        } catch (e) {
          // ignore if reset isn't supported
        }
        window.turnstile.execute(widgetId);
        // user will need to submit again after callback sets token
        return;
      }
      // if Turnstile isn't initialized, let the request fail validation server-side
      alert('Please verify that you are not a robot');
      return;
    }

    // If user's email is not verified, block checkout and prompt to verify
    if (user && user.emailVerified === false) {
      setShowVerifyModal(true);
      return;
    }

    // Preflight: check local availability and block if any item qty > available
    const localAdjustments = [];
    for (const it of cartItems) {
      const pid = it.id ?? it.productId ?? it._id;
      const qty = Number(it.quantity ?? it.qty ?? it.quantity ?? 1);
      const stock = checkProductStock(pid);
      if (!stock.inStock || stock.available < qty) {
        localAdjustments.push({ productId: pid, name: it.name || it.title || pid, requested: qty, available: stock.available });
      }
    }
    if (localAdjustments.length > 0) {
      setPreflightAdjustments(localAdjustments);
      setShowPreflightModal(true);
      return; // stop submission until user confirms adjustments
    }

    setIsProcessing(true);

    try {
      await new Promise(resolve => setTimeout(resolve, 2000));

      const order = buildOrderPayload({
        payment: {
          method: 'cash_on_delivery',
          status: 'pending'
        }
      });

      // collect pickup locations for shops that are Pickup
      const pickupLocationsForOrder = Object.entries(cartItemsByShop).reduce((acc, [shopId, shopData]) => {
        const opt = (deliveryOptions && deliveryOptions[shopId]) || 'Pickup';
        if (opt === 'Pickup') {
          acc.push({
            shopId,
            name: shopData.shop.name,
            address: shopData.shop.address || 'Shop address not available. Please contact the shop.'
          });
        }
        return acc;
      }, []);

      // Persist orders server-side: create one server-side order per shop in the cart
      // Authentication is cookie-based (HttpOnly cookie). Send credentials with the request.
      const serverResults = [];
      for (const [shopId, shopData] of Object.entries(buildItemsByShop())) {
        const shopItems = shopData.items || [];
        // ensure we always send all five keys (use empty string instead of undefined)
        const payload = {
          shopId: Number(shopId),
          items: shopItems.map(i => ({ id: i.id, name: i.name, price: i.price, quantity: i.quantity })),
          total: shopItems.reduce((s, it) => s + (it.price * it.quantity), 0),
          paymentMethod: 'cash_on_delivery',
          customer: {
            username: user?.username || '',
            fullName: customerInfo.fullName || '',
            email: customerInfo.email || '',
            phone: customerInfo.phone || '',
            address: customerInfo.address || '',
            city: customerInfo.city || ''
          }
        };
        console.debug('built order payload for shop', shopId, payload.customer);
        // warn if address or city are still blank despite validation
        if (!payload.customer.address || !payload.customer.city) {
          console.warn('Submitting order with empty address/city', payload.customer);
        }
        // debug: ensure payload contains all expected customer fields
        try { console.debug('Submitting order payload', payload); } catch (e) {}
        try {
          const data = await apiFetch(`${API_BASE}/api/orders`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}), 'x-captcha-token': captchaToken },
            body: JSON.stringify(payload)
          });
          serverResults.push({ shopId, ok: true, data });
        } catch (err) {
          serverResults.push({ shopId, ok: false, error: String(err && err.message ? err.message : err) });
        }
      }

      // Log any failures but proceed with client confirmation
      const anyFailure = serverResults.some(r => !r.ok);

      // Persist successful server-created orders for guest users so they can view them locally
      try {
        const created = serverResults.filter(r => r.ok).map(r => (r.data && r.data.order) ? r.data.order : null).filter(Boolean);
        // collect any server-side adjustments (should be rare if preflight passed)
        const adjustments = serverResults.filter(r => r.ok && r.data && Array.isArray(r.data.adjustedItems)).flatMap(r => r.data.adjustedItems || []);
        if (adjustments.length > 0) {
          // show a modal instead of silently applying adjustments
          setPreflightAdjustments(adjustments);
          setShowPreflightModal(true);
          setIsProcessing(false);
          return;
        }
        if (created && created.length) {
          const existing = JSON.parse(localStorage.getItem('guestOrders') || '[]');
          const merged = (existing || []).concat(created);
          localStorage.setItem('guestOrders', JSON.stringify(merged));
          // expose the created orders for the confirmation view
          setRecentCreatedOrders(created);
          // prefer showing server-created order id as the canonical order number
          setOrderNumber(String(created[0].id || created[0]._id || created[0].orderId || created[0].order_id || ''));
        }
      } catch (e) {
        console.warn('Failed to persist guest orders locally', e && e.message ? e.message : e);
      }

      // Determine whether any shop in the order used Delivery
      const hadDelivery = Object.entries(cartItemsByShop).some(([shopId]) => {
        const opt = (deliveryOptions && deliveryOptions[shopId]) || 'Pickup';
        return opt === 'Delivery';
      });

      setShowDeliveryPaymentMessage(hadDelivery);

      completeOrderFlow(
        order,
        anyFailure ? 'Order created (some shop notifications failed). Please contact support if needed.' : 'Thank you for your purchase!',
        {},
        pickupLocationsForOrder
      );
    } catch (error) {
      console.error('Error saving order:', error);
      alert('Something went wrong while placing your order. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleResendVerification = async () => {
    try {
      await apiFetch(`${API_BASE}/api/auth/resend-verification`, { method: 'POST' });
      alert('Verification email resent. Please check your inbox (and spam).');
    } catch (e) {
      console.error('Resend verification failed', e);
      alert('Failed to resend verification email. Please try again later.');
    }
  };

  // Notify each shop about the order by POSTing to the backend
  async function notifyShops(order) {
    if (!order || !order.itemsByShop) return;
    const shops = Object.keys(order.itemsByShop || {});
    const promises = shops.map(async (shopId) => {
      try {
        const shopItems = order.itemsByShop[shopId];
        const payload = {
          orderId: order.id,
          items: shopItems.items || shopItems,
          customer: {
            fullName: order.customer?.fullName || order.customerMeta?.username,
            email: order.customer?.email || order.customerMeta?.email,
            phone: order.customer?.phone || order.customerMeta?.phone,
          },
          total: order.subtotal || order.total || 0,
        };
        try {
          const d = await apiFetch(`${API_BASE}/api/shops/${shopId}/orders`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          });
          return d;
        } catch (err) {
          throw err;
        }
      } catch (err) {
        console.warn('Failed to notify shop', shopId, err && err.message ? err.message : err);
        return null;
      }
    });

    return Promise.all(promises);
  }

  // User confirms to apply adjustments and continue checkout
  const confirmAdjustmentsAndProceed = async (applyAndProceed = true) => {
    setShowPreflightModal(false);
    if (!applyAndProceed) {
      // user chose to review cart instead
      return;
    }
    try {
      // apply adjustments to local cart
      applyAdjustments(preflightAdjustments || []);
      setServerAdjustments(preflightAdjustments || []);
      // re-run submission after applying adjustments
      // build a new order and submit automatically so user doesn't need to reload
      // small delay to ensure cart state updates
      await new Promise(r => setTimeout(r, 200));
      // call handleSubmitOrder again programmatically to continue
      // simulate a submit event since we don't have one handy
      await handleSubmitOrder({ preventDefault: () => {} });
    } catch (e) {
      console.error('Failed to apply adjustments', e);
    }
  };
  

  if (orderCompleted) {
    // wipe the persisted form to avoid leaking into future checkouts
    try { localStorage.removeItem('checkoutCustomerInfo'); } catch (e) {}
    return (
      <div className="order-confirmation">
        <div className="confirmation-card">
          <div className="confirmation-icon">✅</div>
          <h2 className="confirmation-title">Order Created!</h2>
          <p className="confirmation-message">
            {completionMessage || (
              <>
                Thank you for your purchase, <strong>{customerInfo.fullName}</strong>!
                {showDeliveryPaymentMessage && (
                  <span> Please prepare cash when the delivery arrives.</span>
                )}
              </>
            )}
          </p>
          <p className="confirmation-details">
            Your order number is: 
            {recentCreatedOrders && recentCreatedOrders.length > 0 ? (
              <>
                {recentCreatedOrders.map((o, idx) => (
                  <span key={o.id || o._id || idx} style={{ display: 'inline-block', marginRight: 8 }}>
                    <a
                      href="#"
                      onClick={(e) => { e.preventDefault(); navigate('/orders', { state: { openOrderId: String(o.id || o._id || o.orderId || o.order_id) } }); }}
                      className="order-link"
                    >
                      <strong>{String(o.id || o._id || o.orderId || o.order_id)}</strong>
                    </a>
                  </span>
                ))}
              </>
            ) : (
              <strong>{orderNumber}</strong>
            )}
          </p>
          <p className="confirmation-total">
            Total Amount: <strong>{(finalTotal ?? totalAmount)} ETB</strong>
          </p>
          {serverAdjustments && serverAdjustments.length > 0 && (
            <div className="adjustments-summary">
              <h4>Order adjustments</h4>
              <p>The server adjusted some item quantities due to limited stock:</p>
              <ul>
                {serverAdjustments.map((a, i) => (
                  <li key={`${a.productId}-${i}`}>
                    {a.name || a.productId}: requested {a.requested}, available {a.available}
                  </li>
                ))}
              </ul>
              <p>Please review your cart — items have been updated to match availability.</p>
            </div>
          )}
          {/* Show pickup locations if any */}
          {pickupLocations && pickupLocations.length > 0 && (
            <div className="pickup-locations">
              <h4>Pickup Locations</h4>
              <ul>
                {pickupLocations.map(loc => (
                  <li key={loc.shopId}>
                    <strong>{loc.name}:</strong> {loc.address}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="confirmation-actions">
            <button
              onClick={() => navigate('/')}
              className="continue-shopping-btn"
            >
              Continue Shopping
            </button>
            <button
              onClick={() => navigate('/orders')}
              className="view-tracking-btn"
            >
              View My Orders
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Preflight modal UI: show when some quantities exceed available stock
  const PreflightModal = () => {
    if (!showPreflightModal) return null;
    return (
      <div className="preflight-modal-overlay">
        <div className="preflight-modal">
          <h3>Stock limits detected</h3>
          <p>Some items in your cart exceed current stock. You can either adjust the quantities to available amounts and continue, or cancel to review your cart.</p>
          <ul>
            {preflightAdjustments.map((a, i) => (
              <li key={`${a.productId}-${i}`}>
                {a.name || a.productId}: requested {a.requested}, available {a.available}
              </li>
            ))}
          </ul>
          <div className="preflight-actions">
            <button onClick={() => confirmAdjustmentsAndProceed(true)} className="apply-adjustments-btn">Adjust quantities and continue</button>
            <button onClick={() => { setShowPreflightModal(false); }} className="cancel-adjustments-btn">Cancel and review cart</button>
          </div>
        </div>
      </div>
    );
  };

  // Verify email modal: shown when user attempts checkout without verified email
  const VerifyEmailModal = () => {
    if (!showVerifyModal) return null;
    return (
      <div className="preflight-modal-overlay">
        <div className="preflight-modal">
          <h3>Please verify your email</h3>
          <p>
            Your account email appears to be unverified. Please verify your email before placing orders.
            We sent the original verification to <strong>{user?.email || 'your email'}</strong>.
          </p>
          <div style={{ marginTop: 12 }}>
            <button onClick={handleResendVerification} className="apply-adjustments-btn">Resend verification email</button>
            <button onClick={() => { setShowVerifyModal(false); }} className="cancel-adjustments-btn" style={{ marginLeft: 8 }}>Cancel</button>
            <button onClick={() => { setShowVerifyModal(false); window.location.reload(); }} className="apply-adjustments-btn" style={{ marginLeft: 8 }}>I have verified — refresh</button>
          </div>
          <p style={{ marginTop: 10, fontSize: 13 }}>If you still don't receive the email, check your spam folder or update your address in your <a href="/profile">profile</a>.</p>
        </div>
      </div>
    );
  };

  if (cartItems.length === 0) {
    return (
      <div className="empty-cart">
        <h2>Your cart is empty</h2>
        <p>Add some items to your cart before checking out.</p>
        <button
          onClick={() => navigate('/')}
          className="continue-shopping-btn-large"
        >
          Continue Shopping
        </button>
      </div>
    );
  }

  

  return (
    <div className="checkout-container">
      <PreflightModal />
      <VerifyEmailModal />
      <div className="checkout-grid">
        <div className="customer-form">
          <h1 className="checkout-title">Checkout</h1>
          <form onSubmit={handleSubmitOrder}>
            <div className="form-section">
              <h3 className="form-section-title">Customer Information</h3>
              
              <div className="form-grid">
                <div className="form-group">
                  <label className="form-label">Full Name *</label>
                  <input
                    type="text"
                    name="fullName"
                    value={customerInfo.fullName}
                    onChange={handleInputChange}
                    required
                    className="form-input"
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Email *</label>
                  <input
                    type="email"
                    name="email"
                    value={customerInfo.email}
                    onChange={handleInputChange}
                    required
                    className="form-input"
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Phone *</label>
                  <input
                    type="tel"
                    name="phone"
                    value={customerInfo.phone}
                    onChange={handleInputChange}
                    required
                    className="form-input"
                    placeholder="09XXXXXXXX"
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Delivery Address *</label>
                  <textarea
                    name="address"
                    value={customerInfo.address}
                    onChange={handleInputChange}
                    required
                    rows="3"
                    className="form-input form-textarea"
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">City *</label>
                  <input
                    type="text"
                    name="city"
                    value={customerInfo.city}
                    onChange={handleInputChange}
                    required
                    className="form-input"
                  />
                </div>
              </div>
            </div>

            {/* Inline Order Summary placed after customer information */}
            <div className="order-summary-inline">
              <h3 className="order-summary-title">Order Summary</h3>

              {Object.entries(cartItemsByShop).map(([shopId, shopData]) => {
                const shop = shopData.shop;
                const shopItems = shopData.items || [];

                return (
                  <div key={shopId} className="shop-breakdown">
                    <div className="shop-name">🏪 {shop.name}</div>
                    {shopItems.map(item => (
                      <div key={item.id} className="shop-item">
                        <span>{item.name} × {item.quantity}</span>
                        <span>{(item.price || 0) * (item.quantity || 0)} ETB</span>
                      </div>
                    ))}
                  </div>
                );
              })}

              <div className="order-totals">
                <div className="total-row">
                  <span>Items ({totalItems}):</span>
                  <span>{computedItemsTotal} ETB</span>
                </div>
                <div className="total-row">
                  <span>Delivery Fee:</span>
                  <span>{deliveryFee} ETB</span>
                </div>
                <div className="total-final">
                  <span>Total:</span>
                  <span>{totalAmount} ETB</span>
                </div>
              </div>
            </div>

            {/* Turnstile widget - required before placing order */}
            {/* container is visually hidden; token is acquired programmatically */}
            <div
              style={{
                position: 'absolute',
                left: '-9999px',
                width: 1,
                height: 1,
                overflow: 'hidden',
              }}
              ref={widgetRef}
            />

            <button
              type="submit"
              disabled={isProcessing}
              className="submit-order-btn"
            >
              {isProcessing ? 'Processing Order...' : `Place Order - ${totalAmount} ETB`}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default Checkout;