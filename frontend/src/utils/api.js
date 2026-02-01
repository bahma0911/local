// Simple API helper that respects Vite env `VITE_API_BASE`.
// In development prefer `/api/*` relative paths so Vite's dev server proxy forwards
// requests to the backend (see `frontend/vite.config.js`). In production set
// `VITE_API_BASE` to your API origin (e.g. https://api.example.com).
// Use: import { apiUrl, apiBase } from '../utils/api';
// Central API base constant for the app.
// Use `VITE_API_URL` at build time to set the absolute backend origin.
// Example: VITE_API_URL=https://local-q29j.onrender.com
export const API_BASE = import.meta.env.VITE_API_URL || '';

export const apiUrl = (path) => {
  if (!path) return API_BASE || '';
  if (path.startsWith('http://') || path.startsWith('https://')) return path;
  // ensure leading slash
  if (!path.startsWith('/')) path = `/${path}`;
  return `${API_BASE}${path}`;
};

export default { API_BASE, apiUrl };
