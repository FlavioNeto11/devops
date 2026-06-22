const BASE = (import.meta.env.VITE_API_BASE_URL || '/stockpilot/api').replace(/\/$/, '');

async function request(path, opts = {}) {
  const res = await fetch(BASE + path, opts);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw Object.assign(new Error(err.error?.message || `HTTP ${res.status}`), { status: res.status });
  }
  return res.json();
}

export const api = {
  products: {
    list: () => request('/v1/products').then((r) => r.data),
    createOrder: (id) =>
      request(`/v1/products/${id}/order`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      }),
  },
  orders: {
    list: () => request('/v1/orders').then((r) => r.data),
  },
  alerts: {
    list: () => request('/v1/alerts').then((r) => r.data),
  },
};
