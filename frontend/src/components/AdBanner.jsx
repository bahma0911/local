import React from "react";
import "./AdBanner.css";

const AdBanner = ({ imageUrl, link, alt }) => {
  return (
    <div className="ad-banner">
      {link ? (
        <a href={link} target="_blank" rel="noopener noreferrer">
          <img src={imageUrl} alt={alt || "Ad banner"} />
        </a>
      ) : (
        <img src={imageUrl} alt={alt || "Ad banner"} />
      )}
    </div>
  );
};

export default AdBanner;
