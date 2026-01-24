import React from "react";
import "./ShopCard.css"; // Add this line

const ShopCard = ({ shop, isSelected, onClick, productCount }) => {
  return (
    <div
      onClick={onClick}
      className={`shop-card ${isSelected ? 'selected' : ''}`} // Replace inline styles
    >
      <div className="shop-card-header">
        <h2 className="shop-name">{shop.name}</h2>
        <p className="shop-category">{shop.category}</p>
        {/* Show product count when provided */}
        {productCount !== undefined && (
          <p className="shop-product-count">
            {productCount} product{productCount !== 1 ? 's' : ''}
          </p>
        )}
      </div>
    </div>
  );
};

export default ShopCard;