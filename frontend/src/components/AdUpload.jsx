import React, { useRef, useState } from "react";
import { API_BASE } from "../utils/api";
import "./AdUpload.css";

const AdUpload = ({ onUpload }) => {
  const fileInput = useRef();
  const [preview, setPreview] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setPreview(URL.createObjectURL(file));
      setError("");
      setSuccess("");
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

      const res = await fetch(`${API_BASE}/api/upload`, {
        method: 'POST',
        credentials: 'include',
        body: fd,
      });

      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`Upload failed (${res.status}): ${text}`);
      }

      let data;
      const text = await res.text().catch(() => '');
      if (!text) {
        throw new Error('Upload succeeded but no response body received');
      }
      try {
        data = JSON.parse(text);
      } catch {
        data = { url: text.trim() };
      }
      if (!data || !data.url) {
        throw new Error(`Upload succeeded but no URL returned. Response: ${text}`);
      }

      onUpload && onUpload(data.url);
      setPreview(data.url);
      setSuccess('Ad uploaded successfully!');
      setError('');
    } catch (e) {
      console.error('AdUpload upload error', e);
      setError('Upload failed. ' + (e.message || 'Please try again.'));
      setSuccess('');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="ad-upload">
      <input type="file" accept="image/*" ref={fileInput} onChange={handleFileChange} />
      {preview && <img src={preview} alt="Preview" className="ad-preview" />}
      <button onClick={handleUpload} disabled={uploading}>{uploading ? "Uploading..." : "Upload Ad"}</button>
      {error && <div className="error-message">{error}</div>}
      {success && <div className="success-message">{success}</div>}
    </div>
  );
};

export default AdUpload;
