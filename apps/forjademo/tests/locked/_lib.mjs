// LOCKED — helper das suítes de teste geradas na concepção. NÃO EDITAR.
const API = (process.env.BASE_URL || 'http://nvit.localhost/forjademo/api').replace(/\/$/, '');
const H = (extra) => ({ "Content-Type": "application/json", ...(extra || {}) });
export const api = API;
export const get = (p, h) => fetch(API + p, { headers: H(h) }).then(async (r) => ({ s: r.status, j: await r.json().catch(() => ({})) }));
export const post = (p, b, h) => fetch(API + p, { method: "POST", headers: H(h), body: JSON.stringify(b || {}) }).then(async (r) => ({ s: r.status, j: await r.json().catch(() => ({})) }));
export const del = (p, h) => fetch(API + p, { method: "DELETE", headers: H(h) }).then((r) => r.status);
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const LIVE = !!process.env.BASE_URL || process.env.FORGE_LIVE === "1";
