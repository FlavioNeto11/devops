// Client da API (base absoluta sob o subpath). Sem ${} — concatenação. Gerado pela Forge.
const BASE = import.meta.env.VITE_API_BASE_URL || '/stockpilot/api';
async function request(method, path, body) {
  const res = await fetch(BASE + path, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) { const e = new Error((data && data.error && data.error.message) || ('HTTP ' + res.status)); e.status = res.status; throw e; }
  return data;
}
function qs(params) {
  const p = new URLSearchParams();
  for (const k in (params || {})) { const v = params[k]; if (v !== '' && v !== null && v !== undefined) p.append(k, v); }
  const s = p.toString(); return s ? ('?' + s) : '';
}
// fábrica de recurso REST: o backend expõe /v1/<name>. list aceita page/pageSize/sort/dir/filtros.
export function resourceFactory(name) {
  const root = "/v1/" + name;
  return {
    list: (params) => request("GET", root + qs(params)).then((d) => (d && d.data !== undefined ? d : { data: d || [], total: (d || []).length })),
    get: (id) => request("GET", root + "/" + id),
    create: (body) => request("POST", root, body),
    update: (id, body) => request("PUT", root + "/" + id, body),
    remove: (id) => request("DELETE", root + "/" + id),
  };
}
export const health = () => request("GET", "/health");

// Recursos de DOMÍNIO do StockPilot — mapeiam para as rotas REST reais sob /v1/<name>.
// Cada um expõe list/get/create/update/remove; ex.: products.get(id) -> GET /v1/products/{id}.
// products também expõe as ações de domínio (rotas reais em server.js), para que as telas chamem SÓ
// endpoints de domínio sem montar URLs:
//   reorder         POST /v1/products/:id/reorder        — reposição assíncrona idempotente ({order,deduped,enqueued})
//   order           POST /v1/products/:id/order          — pedido manual (cria order)
//   suggestReorder  POST /v1/products/:id/suggest-reorder — sugestão de quantidade via IA (dry-run, {suggestion,...})
export const products = {
  ...resourceFactory('products'),
  reorder: (id, body = {}) => request('POST', '/v1/products/' + id + '/reorder', body),
  order: (id, body = {}) => request('POST', '/v1/products/' + id + '/order', body),
  suggestReorder: (id) => request('POST', '/v1/products/' + id + '/suggest-reorder', {}),
};
// orders.get(id) → GET /v1/orders/{id} (detalhe canônico, TODOS os estados).
// orders.audit(id) → GET /v1/orders/{id}/audit (trilha das trocas com o fornecedor PARA este pedido).
export const orders = {
  ...resourceFactory('orders'),
  audit: (id) => request('GET', '/v1/orders/' + id + '/audit'),
};
export const alerts = resourceFactory('alerts');
// notifications é LIST-ONLY no backend (server.js só expõe GET /v1/notifications, REQ-STOCKPILOT-0007).
// NÃO chame notifications.get(id) — não há GET /v1/notifications/{id}; o detalhe reaproveita o objeto
// da linha já carregado pela listagem.
export const notifications = resourceFactory('notifications');
export const channels = resourceFactory('channels');
export const suppliers = {
  ...resourceFactory('suppliers'),
  orders: (id) => request('GET', '/v1/suppliers/' + id + '/orders'),
};
export const audit = resourceFactory('audit');
