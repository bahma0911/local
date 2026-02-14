// Simple API helper that respects Vite env `VITE_API_BASE`.
// In development prefer `/api/*` relative paths so Vite's dev server proxy forwards
// requests to the backend (see `frontend/vite.config.js`). In production set
// `VITE_API_BASE` to your API origin (e.g. https://api.example.com).
// Use: import { apiUrl, apiBase } from '../utils/api';
// Central API base constant for the app.
// Use `VITE_API_URL` at build time to set the absolute backend origin.
// Example: VITE_API_URL=https://local-q29j.onrender.com
// Primary API base: prefer VITE_API_URL, allow runtime override via window.__API_BASE__
export const API_BASE = (typeof window !== 'undefined' && window.__API_BASE__) ? window.__API_BASE__ : (import.meta.env.VITE_API_URL || '');

export const apiUrl = (path) => {
  if (!path) return API_BASE || '';
  if (path.startsWith('http://') || path.startsWith('https://')) return path;
  // ensure leading slash
  if (!path.startsWith('/')) path = `/${path}`;
  // If API_BASE is not configured, attempt a sensible heuristic fallback so deployed
  // frontends without env vars can still reach a companion backend in common setups.
  if (!API_BASE) {
    try {
      const host = (typeof window !== 'undefined' && window.location && window.location.hostname) ? window.location.hostname : '';
      // common pattern: replace 'front' with 'back' or 'local-front' with 'local-back'
      let inferred = host.replace('local-front', 'local-back').replace('front', 'back');
      if (inferred && inferred !== host) {
        const proto = (typeof window !== 'undefined' && window.location && window.location.protocol) ? window.location.protocol : 'https:';
        console.warn('API_BASE not set; inferring backend origin as', `${proto}//${inferred}`);
        return `${proto}//${inferred}${path}`;
      }
    } catch (e) {
      // ignore inference failures
    }
    console.warn('VITE_API_URL not configured; apiUrl will return relative path — set VITE_API_URL to point to your backend');
  }
  return `${API_BASE}${path}`;
};

export default { API_BASE, apiUrl };
