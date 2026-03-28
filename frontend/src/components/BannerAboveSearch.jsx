import React, { useEffect, useState } from "react";
import AdBanner from "./AdBanner";

const BannerAboveSearch = () => {
  const [imageUrl, setImageUrl] = useState('/uploads/sample-ad.jpg');
  const [link, setLink] = useState('');

  useEffect(() => {
    const persistedUrl = localStorage.getItem('currentAdBannerUrl');
    const persistedLink = localStorage.getItem('currentAdBannerLink');
    if (persistedUrl) {
      setImageUrl(persistedUrl);
    }
    if (persistedLink) {
      setLink(persistedLink);
    }
  }, []);

  return (
    <div style={{ marginBottom: 12 }}>
      <AdBanner imageUrl={imageUrl} link={link} alt="Ad banner" />
    </div>
  );
};

export default BannerAboveSearch;
