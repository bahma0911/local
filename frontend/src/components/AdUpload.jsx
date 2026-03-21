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
      // Simulate upload, replace with real API call
      setTimeout(() => {
        setUploading(false);
        onUpload && onUpload(file);
        alert("Ad uploaded!");
      }, 1000);
    } catch (e) {
      setError("Upload failed");
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
