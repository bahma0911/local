import ShopList from './ShopList';
import BannerAboveSearch from '../components/BannerAboveSearch';

const Home = () => {
  return (
    <div className="page-home">
      {/* Ad Banner between navbar and search bar */}
      <BannerAboveSearch />
      {/* Compact mode: limit shops on the home page and provide a small toggle to reveal the rest */}
      <ShopList compact />
    </div>
  );
};

export default Home;
