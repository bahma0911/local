import ProductCard from "./ProductCard";
import "./ProductList.css"; // Add this line

const ProductList = ({ shop, onAddToCart }) => {
  return (
    <div className="product-list-section">
      <div className="product-list-header">
        <h2 className="product-list-title">{shop.name} - Products</h2>
        <p className="product-list-delivery">
          Delivery fee: <strong>{shop.deliveryFee} ETB</strong>
        </p>
      </div>
      <div className="product-list-grid">
        {shop.products.map((product) => (
          <ProductCard 
            key={product.id}
            product={product} 
            shopId={shop.id}
            onAddToCart={onAddToCart} 
          />
        ))}
      </div>
    </div>
  );
};

export default ProductList;