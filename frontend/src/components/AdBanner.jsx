import React from "react";
import "./AdBanner.css";
import apiFetch from '../utils/apiFetch';
import { API_BASE } from '../utils/api';

const AdBanner = ({ imageUrl, link, alt, adId }) => {
  const handleAdClick = async () => {
    if (adId) {
      try {
        // Track the click asynchronously (don't block the navigation)
        apiFetch(`${API_BASE}/api/advertisements/${adId}/click`, {
          method: 'POST'
        }).catch(err => {
          console.warn('Failed to track ad click:', err);
        });
      } catch (err) {
        console.warn('Failed to track ad click:', err);
      }
    }
  };

  return (
    <div className="ad-banner">
      {link ? (
        <a
          href={link}
          target="_blank"
          rel="noopener noreferrer"
          onClick={handleAdClick}
        >
          <img src={imageUrl} alt={alt || "Ad banner"} />
        </a>
      ) : (
        <img src={imageUrl} alt={alt || "Ad banner"} />
      )}
    </div>
  );
};

export default AdBanner;
