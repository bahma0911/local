// Simple API helper that respects Vite env `VITE_API_BASE`.
// In development prefer `/api/*` relative paths so Vite's dev server proxy forwards
// requests to the backend (see `frontend/vite.config.js`). In production set
// `VITE_API_BASE` to your API origin (e.g. https://api.example.com).
// Use: import { apiUrl, apiBase } from '../utils/api';
export const apiBase = import.meta.env.VITE_API_BASE || '';
export const apiUrl = (path) => {
  if (!path) return apiBase || '';
  if (path.startsWith('http://') || path.startsWith('https://')) return path;
  // If a proxied API path was provided, leave it as-is so it goes through Vite proxy
  if (path.startsWith('/api')) return path;
  // ensure leading slash
  if (!path.startsWith('/')) path = `/${path}`;
  return `${apiBase}${path}`;
};

export default { apiBase, apiUrl };
