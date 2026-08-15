// LOCKED — helper das suítes de teste geradas na concepção. NÃO EDITAR.
const API = (process.env.BASE_URL || 'http://nvit.localhost/contaviva-pro/api').replace(/\/$/, '');
// identidade de teste injetada pelo GATE (forge-tests): headers-default p/ TODA chamada;
// vem de apps/contaviva-pro/tests/test-identity.json (não-locked). O teste sobrescreve via extra.
const IDH = (() => { const raw = process.env.FORGE_TEST_HEADERS; if (!raw) return {}; try { return JSON.parse(raw); } catch (e) { throw new Error("FORGE_TEST_HEADERS invalido (esperado JSON de headers): " + e.message); } })();
const H = (extra) => ({ "Content-Type": "application/json", ...IDH, ...(extra || {}) });
export const api = API;
export const get = (p, h) => fetch(API + p, { headers: H(h) }).then(async (r) => ({ s: r.status, j: await r.json().catch(() => ({})) }));
export const post = (p, b, h) => fetch(API + p, { method: "POST", headers: H(h), body: JSON.stringify(b || {}) }).then(async (r) => ({ s: r.status, j: await r.json().catch(() => ({})) }));
export const del = (p, h) => fetch(API + p, { method: "DELETE", headers: H(h) }).then((r) => r.status);
// helper retrocompatível: monta o header Bearer p/ rotas protegidas (get/post aceitam headers extras).
export const auth = (token) => (token ? { Authorization: "Bearer " + token } : {});
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const LIVE = !!process.env.BASE_URL || process.env.FORGE_LIVE === "1";
