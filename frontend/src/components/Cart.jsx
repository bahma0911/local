
import React from "react";import { useNavigate } from "react-router-dom";
import "./Cart.css"; // Add this line

const Cart = ({
  cartItems = [],
  cartItemsByShop = {}, 
  deliveryOptions = {},
  deliveryFees = {},
  itemsTotal = 0,
  totalDeliveryFee = 0,
  cartTotal = 0,
  onRemove,
  onIncreaseQuantity,
  onDecreaseQuantity,
  onUpdateDeliveryOption,
  onClear,
  totalItems = 0,
}) => {
  const navigate = useNavigate();
  const safeCartItemsByShop = cartItemsByShop || {};
  const safeDeliveryOptions = deliveryOptions || {};
  const safeDeliveryFees = deliveryFees || {};
  
  const shopCount = Object.keys(safeCartItemsByShop).length;
  const deliveryShopCount = Object.keys(safeCartItemsByShop).filter(id => safeDeliveryOptions[id] === "Delivery").length;

  return (
    <div className="cart-container">
      {/* Cart Header */}
      <div className="cart-header">
        <div>
          <h2 className="cart-title">🛒 Shopping Cart</h2>
          {totalItems > 0 && (
            <p className="cart-summary">
              {totalItems} item{totalItems !== 1 ? 's' : ''} in cart • {shopCount} shop{shopCount !== 1 ? 's' : ''}
            </p>
          )}
        </div>
      </div>

      {cartItems.length === 0 ? (
        <div className="cart-empty">
          <div className="cart-empty-icon">🛒</div>
          <h3>Your cart is empty</h3>
          <p>Add some products to get started!</p>
        </div>
      ) : (
        <>
          {/* cart items and shop sections (order summary and checkout will appear below) */}

          <div className="cart-main-grid">
            <div className="cart-main-left">
              {/* Show items grouped by shop */}
              {Object.entries(safeCartItemsByShop).map(([shopId, shopData]) => {
            const shop = shopData.shop;
            const shopItems = shopData.items || [];
            const shopDeliveryOption = safeDeliveryOptions[shopId] || "Pickup";
            const shopDeliveryFee = safeDeliveryFees[shopId] || 0;
            const shopItemsTotal = shopItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);
            const shopTotal = shopItemsTotal + shopDeliveryFee;
            return (
              <div key={shopId} className="shop-cart-section">
                {/* Shop Header */}
                <div className="shop-cart-header">
                  <h3 className="shop-cart-name">🏪 {shop.name}</h3>
                  <p className="shop-cart-category">{shop.category}</p>
                </div>

                {/* Delivery Option for this Shop */}
                <div className="shop-delivery-options">
                  <div className="shop-delivery-header">
                    <span className="shop-delivery-title">Delivery Option:</span>
                    <div className="delivery-buttons">
                      <button
                        onClick={() => onUpdateDeliveryOption && onUpdateDeliveryOption(shopId, "Pickup")}
                        className={`delivery-btn pickup ${shopDeliveryOption === "Pickup" ? 'active' : ''}`}
                      >
                        Pickup 🏪
                      </button>
                      <button
                        onClick={() => onUpdateDeliveryOption && onUpdateDeliveryOption(shopId, "Delivery")}
                        className={`delivery-btn delivery ${shopDeliveryOption === "Delivery" ? 'active' : ''}`}
                      >
                        Delivery 🚚 ({shop.deliveryFee} ETB)
                      </button>
                    </div>
                  </div>
                </div>

                <div className="shop-cart-body">
                  {/* Shop Items */}
                  <div className="cart-items">
                    {shopItems.map((item) => (
                      <div key={item.id} className="cart-item">
                        <div className="cart-item-info">
                          <div className="cart-item-name">{item.name}</div>
                          <div className="cart-item-price">{item.price} ETB each</div>
                        </div>
                        <div className="cart-item-controls">
                          <button 
                            onClick={() => onDecreaseQuantity && onDecreaseQuantity(item.id)} 
                            disabled={item.quantity <= 1} 
                            className="quantity-btn decrease"
                          >
                            -
                          </button>
                          <span className="cart-item-quantity">{item.quantity}</span>
                          <button 
                            onClick={() => onIncreaseQuantity && onIncreaseQuantity(item.id)} 
                            className="quantity-btn increase"
                          >
                            +
                          </button>
                        </div>
                        <div className="cart-item-total">{item.price * item.quantity} ETB</div>
                        <button 
                          onClick={() => onRemove && onRemove(item.id)} 
                          className="cart-item-remove"
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>

                  {/* Shop Summary */}
                  <div className="shop-cart-summary">
                    <div className="shop-summary-row">
                      <span>Items subtotal:</span>
                      <span>{shopItemsTotal} ETB</span>
                    </div>
                    <div className="shop-summary-row">
                      <span>Delivery:</span>
                      <span>{shopDeliveryFee} ETB</span>
                    </div>
                    <div className="shop-summary-total">
                      <span>Shop Total:</span>
                      <span>{shopTotal} ETB</span>
                    </div>
                  </div>
                </div>
              </div>
            );
              })}
            </div>
          </div>

          {/* Order Summary placed at the bottom */}
          <div className="order-summary">
            <h3 className="order-summary-title">Order Summary</h3>
            <div className="order-summary-row">
              <span>Items ({totalItems}):</span>
              <span>{itemsTotal} ETB</span>
            </div>
            <div className="order-summary-row">
              <span>Delivery ({deliveryShopCount} shops):</span>
              <span>{totalDeliveryFee} ETB</span>
            </div>
            <div className="order-summary-total">
              <span>Total:</span>
              <span>{cartTotal} ETB</span>
            </div>
          </div>

          {/* Checkout controls placed at the bottom */}
          <div className="checkout-section">
            <div className="cart-footer">
              <div className="cart-footer-left">
                {cartItems.length > 0 && (
                  <button onClick={onClear} className="cart-clear-btn">
                    Clear Cart
                  </button>
                )}
              </div>
              <div className="cart-footer-right">
                <span className="cart-footer-count">{totalItems} item{totalItems !== 1 ? 's' : ''}</span>
              </div>
            </div>

            <button 
              onClick={() => navigate('/checkout')}
              className="checkout-btn"
            >
              Proceed to Checkout
            </button>
            <p className="checkout-note">
            </p>
          </div>
        </>
      )}
    </div>
  );
};

export default Cart;