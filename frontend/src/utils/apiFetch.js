// src/utils/apiFetch.js - Reusable API helper with CSRF and credentials

/**
 * apiFetch - fetch wrapper for API calls with credentials and CSRF support
 * @param {string} url - relative or absolute URL
 * @param {object} options - fetch options (method, headers, body, etc)
 * @returns {Promise<any>} - parsed JSON response
 * @throws {Error} - if response is not ok, throws with status and text
 *
 * Usage:
 * import apiFetch from '../utils/apiFetch';
 * const data = await apiFetch('/api/login', { method: 'POST', body: JSON.stringify({ username, password }) });
 */
import { API_BASE } from './api';

function getCookie(name) {
  const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
  return match ? decodeURIComponent(match[2]) : null;
}

async function apiFetch(url, options = {}) {
  const opts = { ...options };
  opts.credentials = 'include';
  opts.headers = { ...(opts.headers || {}) };

  // Resolve url against configured API base. Call sites should pass absolute API URLs
  // in the form `${API_BASE}/api/...` but we still handle a leading `/api` path here.
  let fullUrl = url;
  if (!fullUrl.startsWith('http://') && !fullUrl.startsWith('https://')) {
    if (fullUrl.startsWith('/api')) fullUrl = `${API_BASE}${fullUrl}`;
    else if (fullUrl.startsWith('api')) fullUrl = `${API_BASE}/${fullUrl}`;
    else fullUrl = `${API_BASE}${fullUrl.startsWith('/') ? '' : '/'}${fullUrl}`;
  }

  // Attach CSRF token for state-changing requests
  const method = (opts.method || 'GET').toUpperCase();
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
    const csrf = getCookie('_csrf') || getCookie('csrf_token');
    if (csrf) opts.headers['X-CSRF-Token'] = csrf;
  }

  // Development-only: allow local dev bypass for server-side checks (e.g. review eligibility)
  // This sets the same header the backend recognizes when NODE_ENV !== 'production'.
  try {
    if (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.DEV) {
      opts.headers['X-Dev-Bypass'] = '1';
    }
  } catch (e) {
    // ignore if import.meta is unavailable in this environment
  }

  const res = await fetch(fullUrl, opts);
  let text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch (e) {
    data = text;
  }
  if (!res.ok) {
    const err = new Error(data && data.message ? data.message : res.statusText);
    err.status = res.status;
    err.response = data;
    throw err;
  }
  return data;
}

export default apiFetch;
