import React, { useRef, useState } from "react";
import "./AdUpload.css";

const AdUpload = ({ onUpload }) => {
  const fileInput = useRef();
  const [preview, setPreview] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setPreview(URL.createObjectURL(file));
      setError("");
    }
  };

  const handleUpload = async () => {
    const file = fileInput.current.files[0];
    if (!file) return setError("Please select an image.");
    setUploading(true);
    setError("");
    try {
      const fd = new FormData();
      fd.append('file', file);

      const res = await fetch(`/api/upload`, {
        method: 'POST',
        credentials: 'include',
        body: fd,
      });

      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`Upload failed (${res.status}): ${text}`);
      }

      const data = await res.json();
      if (!data || !data.url) throw new Error('Upload succeeded but no URL returned');

      // Persist the ad URL so it is shown on home across reloads
      localStorage.setItem('currentAdBannerUrl', data.url);
      onUpload && onUpload(data.url);
      setPreview(data.url);
      alert('Ad uploaded successfully!');
    } catch (e) {
      console.error('AdUpload upload error', e);
      setError('Upload failed. ' + (e.message || '')); 
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="ad-upload">
      <input type="file" accept="image/*" ref={fileInput} onChange={handleFileChange} />
      {preview && <img src={preview} alt="Preview" className="ad-preview" />}
      <button onClick={handleUpload} disabled={uploading}>{uploading ? "Uploading..." : "Upload Ad"}</button>
      {error && <div className="ad-upload-error">{error}</div>}
    </div>
  );
};

export default AdUpload;
