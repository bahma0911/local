import "./ShopCard.css";

const ShopCard = ({ shop, isSelected, onClick, productCount, isExpanded }) => {
  return (
    <div
      onClick={onClick}
      className={`shop-card ${isSelected ? 'selected' : ''}`}
      role="button"
      tabIndex={0}
    >
      <div className="shop-card-header">
        <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', width:'100%'}}>
          <h2 className="shop-name">{shop.name}</h2>
          <div className={`expand-indicator ${isExpanded ? 'expanded' : ''}`} aria-hidden>
            ▾
          </div>
        </div>

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