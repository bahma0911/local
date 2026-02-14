import api from '../utils/api';

const cache = new Map();
const pending = new Map();

const fetchRating = async (id) => {
  if (!id) return null;
  const key = String(id);
  if (cache.has(key)) return cache.get(key);
  if (pending.has(key)) return pending.get(key);

  const url = api.apiUrl(`/api/products/${key}/reviews`);

  const p = (async () => {
    try {
      const res = await fetch(url);
      if (!res.ok) return null;
      const data = await res.json();
      const val = (data && typeof data.average !== 'undefined') ? Number(data.average) : null;
      cache.set(key, val);
      return val;
    } catch (err) {
      return null;
    } finally {
      pending.delete(key);
    }
  })();

  pending.set(key, p);
  return p;
};

const getCachedRating = (id) => {
  if (!id) return null;
  return cache.get(String(id)) ?? null;
};

export default {
  fetchRating,
  getCachedRating,
};
