import "./ShopCard.css";

const ShopCard = ({ shop, isSelected, onClick }) => {
  return (
    <div
      onClick={onClick}
      className={`shop-card ${isSelected ? 'selected' : ''}`}
      role="button"
      tabIndex={0}
    >
      <div className="shop-card-header">
        <div style={{display:'flex', flexDirection:'column', alignItems:'center', gap:'8px', width:'100%'}}>
          <div className="shop-logo">
            {shop.logo ? (
              <img 
                src={shop.logo} 
                alt={`${shop.name} logo`}
                onError={(e) => { 
                  e.target.style.display = 'none'; 
                  e.target.nextSibling.style.display = 'flex';
                }}
              />
            ) : null}
            <div className="shop-logo-fallback" style={{display: shop.logo ? 'none' : 'flex'}}>
              🏪
            </div>
          </div>
          <div style={{width:'100%', textAlign:'center'}}>
            <h2 className="shop-name">{shop.name}</h2>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ShopCard;