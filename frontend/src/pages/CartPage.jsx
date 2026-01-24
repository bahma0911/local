import React from 'react';
import Cart from '../components/Cart';
import { useCart } from '../hooks/useCart';
import './CartPage.css';

const CartPage = () => {
  const {
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
  } = useCart();

  return (
    <div className="page-cart page-container">
      <Cart
        cartItems={cartItems}
        cartItemsByShop={cartItemsByShop}
        deliveryOptions={deliveryOptions}
        deliveryFees={deliveryFees}
        itemsTotal={itemsTotal}
        totalDeliveryFee={totalDeliveryFee}
        cartTotal={cartTotal}
        totalItems={totalItems}
        onRemove={removeFromCart}
        onIncreaseQuantity={increaseQuantity}
        onDecreaseQuantity={decreaseQuantity}
        onUpdateDeliveryOption={updateDeliveryOption}
        onClear={clearCart}
      />
    </div>
  );
};

export default CartPage;
