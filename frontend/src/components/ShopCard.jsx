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
        <div style={{display:'flex', alignItems:'center', gap:'12px', width:'100%'}}>
          {shop.logo && (
            <div className="shop-logo">
              <img 
                src={shop.logo} 
                alt={`${shop.name} logo`}
                onError={(e) => { 
                  e.target.style.display = 'none'; 
                  e.target.nextSibling.style.display = 'flex';
                }}
              />
              <div className="shop-logo-fallback" style={{display:'none'}}>
                🏪
              </div>
            </div>
          )}
          <div style={{flex:1, minWidth:0}}>
            <h2 className="shop-name">{shop.name}</h2>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ShopCard;