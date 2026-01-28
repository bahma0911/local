// Simple API helper that respects Vite env `VITE_API_BASE`.
// When `VITE_API_BASE` is not set, default to the legacy backend host used by `useAuth` to
// avoid accidental relative requests landing on the frontend host (which return 404 for /api/*).
// Use: import { apiUrl, apiFetch } from '../utils/api';
export const apiBase = import.meta.env.VITE_API_BASE || 'https://nega-m5uz.onrender.com';
export const apiUrl = (path) => {
  if (!path) return apiBase || '';
  if (path.startsWith('http://') || path.startsWith('https://')) return path;
  // ensure leading slash
  if (!path.startsWith('/')) path = `/${path}`;
  return `${apiBase}${path}`;
};

export default { apiBase, apiUrl };
