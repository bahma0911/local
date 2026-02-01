import ShopList from './ShopList';

const Home = () => {
  return (
    <div className="page-home">
      {/* Compact mode: limit shops on the home page and provide a small toggle to reveal the rest */}
      <ShopList compact />
    </div>
  );
};

export default Home;
