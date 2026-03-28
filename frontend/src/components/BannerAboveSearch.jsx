import React, { useEffect, useState } from "react";
import AdBanner from "./AdBanner";
import apiFetch from '../utils/apiFetch';
import { API_BASE } from '../utils/api';

const BannerAboveSearch = () => {
  const [advertisements, setAdvertisements] = useState([]);
  const [currentAdIndex, setCurrentAdIndex] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchActiveAds = async () => {
      try {
        const ads = await apiFetch(`${API_BASE}/api/advertisements/active`);
        setAdvertisements(ads || []);
      } catch (error) {
        console.error('Error fetching advertisements:', error);
        // Fallback to default ad if API fails
        setAdvertisements([]);
      } finally {
        setLoading(false);
      }
    };

    fetchActiveAds();
  }, []);

  // Cycle through ads every 30 seconds if there are multiple
  useEffect(() => {
    if (advertisements.length > 1) {
      const interval = setInterval(() => {
        setCurrentAdIndex((prevIndex) => (prevIndex + 1) % advertisements.length);
      }, 30000); // 30 seconds

      return () => clearInterval(interval);
    }
  }, [advertisements.length]);

  const currentAd = advertisements[currentAdIndex];

  useEffect(() => {
    if (!currentAd || !currentAd._id) return;
    const trackImpression = async () => {
      try {
        await apiFetch(`${API_BASE}/api/advertisements/${currentAd._id}/impression`, {
          method: 'POST'
        });
      } catch (err) {
        console.warn('Failed to track ad impression:', err);
      }
    };
    trackImpression();
  }, [currentAd]);

  if (loading) {
    return (
      <div style={{ marginBottom: 12, textAlign: 'center', padding: '20px' }}>
        <div>Loading advertisement...</div>
      </div>
    );
  }

  if (advertisements.length === 0) {
    // Fallback to default ad if no active ads
    return (
      <div style={{ marginBottom: 12 }}>
        <AdBanner imageUrl="/uploads/sample-ad.jpg" link="" alt="Default advertisement" />
      </div>
    );
  }

  return (
    <div style={{ marginBottom: 12 }}>
      <AdBanner
        imageUrl={currentAd.imageUrl}
        link={currentAd.link}
        alt={currentAd.altText || "Advertisement"}
        adId={currentAd._id}
      />
      {advertisements.length > 1 && (
        <div style={{
          textAlign: 'center',
          fontSize: '12px',
          color: '#666',
          marginTop: '4px'
        }}>
          {currentAdIndex + 1} of {advertisements.length}
        </div>
      )}
    </div>
  );
};

export default BannerAboveSearch;
