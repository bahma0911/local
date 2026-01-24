// Simple API helper that respects Vite env `VITE_API_BASE`.
// Use: import { apiUrl, apiFetch } from '../utils/api';
export const apiBase = import.meta.env.VITE_API_BASE || '';
export const apiUrl = (path) => {
  if (!path) return apiBase || '';
  if (path.startsWith('http://') || path.startsWith('https://')) return path;
  // ensure leading slash
  if (!path.startsWith('/')) path = `/${path}`;
  return `${apiBase}${path}`;
};

export default { apiBase, apiUrl };
