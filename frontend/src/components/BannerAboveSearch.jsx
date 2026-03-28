import React, { useEffect, useState } from "react";
import AdBanner from "./AdBanner";

const BannerAboveSearch = () => {
  const [imageUrl, setImageUrl] = useState('/uploads/sample-ad.jpg');

  useEffect(() => {
    const persisted = localStorage.getItem('currentAdBannerUrl');
    if (persisted) {
      setImageUrl(persisted);
    }
  }, []);

  return (
    <div style={{ marginBottom: 12 }}>
      <AdBanner imageUrl={imageUrl} alt="Ad banner" />
    </div>
  );
};

export default BannerAboveSearch;
