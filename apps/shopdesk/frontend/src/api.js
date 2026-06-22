// Client da API (base absoluta sob o subpath). Sem ${} — concatenação. Gerado pela Forge.
const BASE = import.meta.env.VITE_API_BASE_URL || '/shopdesk/api';
async function request(method, path, body, extraHeaders) {
  const headers = Object.assign({ 'Content-Type': 'application/json' }, extraHeaders || {});
  const res = await fetch(BASE + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) { const e = new Error((data && data.error && data.error.message) || ('HTTP ' + res.status)); e.status = res.status; throw e; }
  return data;
}
export const health = () => request("GET", "/health");
// saúde da fila de jobs (o backend expõe GET /v1/health/jobs -> { status, jobs:{queued,running,done,dlq} }).
export const healthJobs = () => request("GET", "/v1/health/jobs");
// recurso genérico `records` (o gerador de backend expõe /v1/records).
export const records = {
  list: () => request("GET", "/v1/records").then((d) => d.data || d),
  get: (id) => request("GET", "/v1/records/" + id),
  create: (rec) => request("POST", "/v1/records", rec),
  submit: (id) => request("POST", "/v1/records/" + id + "/submit", {}),
};
// querystring para listas (server-mode): paginação/ordenação/filtro. Vazios são omitidos.
// `sort` é mapeado de camelCase (contrato do front) para snake_case (coluna física do Postgres),
// pois o backend ordena por nome de coluna (ex.: createdAt -> created_at, stockQty -> stock_qty).
function toSnake(s) { return String(s).replace(/[A-Z]/g, (m) => "_" + m.toLowerCase()); }
function qs(params) {
  if (!params) return "";
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === "") continue;
    p.set(k, k === "sort" ? toSnake(v) : String(v));
  }
  const s = p.toString();
  return s ? "?" + s : "";
}
// CRUD de produtos (o gerador de backend expõe /v1/products; update via PUT, delete 204).
// list() devolve o ENVELOPE inteiro { data, total, page, pageSize } — o useResource (server-mode)
// lê res.total p/ a paginação; desembrulhar .data aqui quebraria a contagem total.
export const products = {
  list: (params) => request("GET", "/v1/products" + qs(params)),
  get: (id) => request("GET", "/v1/products/" + id),
  create: (body) => request("POST", "/v1/products", body),
  update: (id, body) => request("PUT", "/v1/products/" + id, body),
  remove: (id) => request("DELETE", "/v1/products/" + id),
};
// recurso de carrinho (o backend expõe /v1/carts; CRUD em api/src/server.js — update via PUT /v1/carts/:id).
// get por id + list desembrulha o envelope; update/create/remove alinhados às rotas reais (PUT, não PATCH).
export const carts = {
  get: (id) => request("GET", "/v1/carts/" + id),
  list: (params) => request("GET", "/v1/carts" + qs(params)).then((d) => d.data || d),
  create: (body) => request("POST", "/v1/carts", body),
  update: (id, body) => request("PUT", "/v1/carts/" + id, body),
  remove: (id) => request("DELETE", "/v1/carts/" + id),
};
// fábrica de recurso CRUD genérico sobre /v1/<name>. O gerador de backend expõe
// GET/GET:id/POST/PUT/DELETE para cada entidade (ver api/src/server.js).
// list() devolve o ENVELOPE inteiro { data, total, page, pageSize } (server-mode do useResource;
// desembrulhar .data aqui quebraria a contagem total) e qs() serializa
// {page,pageSize,sort,dir,q,status,payment_status,...} na querystring.
// EXPORTADA como `resourceFactory` (nome canônico que o integrador usa) — `resource` segue como
// alias interno para não quebrar os usos abaixo.
export const resourceFactory = (name) => ({
  list: (params) => request("GET", "/v1/" + name + qs(params)),
  get: (id) => request("GET", "/v1/" + name + "/" + id),
  create: (body) => request("POST", "/v1/" + name, body),
  update: (id, body) => request("PUT", "/v1/" + name + "/" + id, body),
  remove: (id) => request("DELETE", "/v1/" + name + "/" + id),
});
const resource = resourceFactory;
// recurso de pedidos (/v1/orders) — consumido por OrderListView/OrderDetailView/OrderCreateView etc.
export const orders = resource("orders");
// recurso de estoque (/v1/inventory) — consumido por Inventory*/ProductDetailView (posição por SKU).
export const inventory = resource("inventory");
// recurso de reposição (/v1/reorders) — consumido por Reorder*/InventoryDetailView.
export const reorders = resource("reorders");
// recurso de transações de pagamento (/v1/transactions) — consumido por TransactionListView
// (a tela checa `typeof api.transactions.list === 'function'` antes de usar; expor o factory liga
// a leitura real quando o backend publicar a rota). list() devolve o ENVELOPE { data, total, ... }.
export const transactions = resource("transactions");
// recurso de notificações (/v1/notifications) — consumido por NotificationListView, que prefere
// `api.notifications.list` e cai para `api.store.notifications()` quando o factory não existir.
// Expor o factory dá à tela a leitura paginada/ordenada (server-mode) quando o backend suportar.
export const notifications = resource("notifications");
// recurso de usuários/equipe (/v1/users) — consumido por User{List,Create,Edit}View (convite/papel/acesso).
// O backend expõe GET/GET:id/POST/PUT/DELETE (ver api/src/server.js linhas 98-102); update via PUT (não PATCH).
// list() devolve o ENVELOPE { data, total, ... }; as views desembrulham via normalizeList/res.data.
//
// NORMALIZAÇÃO snake→camel: o CRUD genérico devolve linhas CRUAS do Postgres (SELECT *), onde a
// coluna física é `last_login_at`. As telas leem `lastLoginAt` (contrato camelCase do front). Aqui
// expomos `lastLoginAt` SEM remover a chave snake_case (aditivo) em get/list/create/update, para que
// "Último acesso" funcione consistente na Lista e na Edição sem tocar nas demais telas.
function userFromRow(row) {
  if (!row || typeof row !== "object") return row;
  return row.last_login_at !== undefined && row.lastLoginAt === undefined
    ? Object.assign({}, row, { lastLoginAt: row.last_login_at })
    : row;
}
const usersResource = resource("users");
export const users = {
  list: (params) => usersResource.list(params).then((env) =>
    env && Array.isArray(env.data) ? Object.assign({}, env, { data: env.data.map(userFromRow) }) : env,
  ),
  get: (id) => usersResource.get(id).then(userFromRow),
  create: (body) => usersResource.create(body).then(userFromRow),
  update: (id, body) => usersResource.update(id, body).then(userFromRow),
  remove: (id) => usersResource.remove(id),
};
// trilha de auditoria (/v1/audit-logs) — consumido por AuditLogView (somente leitura).
// O backend expõe GET/GET:id/POST/PUT/DELETE (ver api/src/server.js linhas 104-108).
// list() devolve o ENVELOPE { data, total, page, pageSize } (server-mode do useResource) e qs()
// serializa {page,pageSize,sort,dir,q,action,actor,...} na querystring. A chave da rota tem hífen,
// então a view importa `auditLogs` (camelCase) diretamente — não há lookup por colchete.
export const auditLogs = resource("audit-logs");
// recurso de NF-e (fiscal). CONTRATO REAL do backend (apps/shopdesk/api/src/server.js):
//   POST /v1/invoices  → emite/reemite a nota (fiscal-service.emitInvoice).
// NÃO existem (ainda) GET /v1/invoices (lista) nem GET /v1/invoices/:id (detalhe): `invoices`
// não é entidade CRUD (ver repositories/entities.js). Por isso só expomos o que é REAL —
// `emit`/`reprocess` apontam para POST /v1/invoices. As views de detalhe/lista consomem o
// recurso de leitura DEFENSIVAMENTE (só se existir): quando a esteira publicar GET /v1/invoices
// e GET /v1/invoices/:id, basta adicionar `list`/`get` aqui e as telas passam a lê-los sem mudar.
export const invoices = {
  // emissão/reemissão (rota REAL e idempotente por pedido no backend).
  emit: (orderId, total) => request("POST", "/v1/invoices", { orderId: orderId, total: Number(total) }),
  // reprocessar = reenfileirar a emissão do mesmo pedido (mesma rota POST /v1/invoices).
  reprocess: (orderId, total) => request("POST", "/v1/invoices", { orderId: orderId, total: Number(total) }),
};
// domínio da loja: pagamento (payments-kit), nota fiscal (fiscal-kit), assistente IA (control-ai-kit).
export const store = {
  // checkout tokenizado + idempotente: o token validado vai no body; a Idempotency-Key vai no header.
  checkout: (orderId, amount, paymentMethodToken, idempotencyKey) =>
    request("POST", "/v1/checkout", { orderId: orderId, amount: Number(amount), paymentMethodToken: paymentMethodToken }, idempotencyKey ? { "Idempotency-Key": idempotencyKey } : undefined),
  // trilha de auditoria do gateway (GET /v1/checkout/audit → envelope { data }).
  checkoutAudit: () => request("GET", "/v1/checkout/audit").then((d) => d.data || d),
  emitInvoice: (orderId, total) => request("POST", "/v1/invoices", { orderId: orderId, total: Number(total) }),
  assistant: (message) => request("POST", "/v1/assistant", { message: message }),
  // saúde verificável do assistente de IA (GET /v1/assistant/health → { ai: boolean }).
  // fail-closed real: sem ANTHROPIC_API_KEY o backend reporta ai:false (e o /v1/assistant responde 503).
  assistantHealth: () => request("GET", "/v1/assistant/health"),
  notifications: () => request("GET", "/v1/notifications").then((d) => d.data || []),
};
// recurso de checkout (gateway de pagamento) — `audit` lê a trilha REAL GET /v1/checkout/audit
// (envelope { data }). Exportado como objeto próprio (além de api.store.checkout/checkoutAudit) para
// que OrderDetailView resolva `api.checkout.audit` sem cair no fallback. `run` é o checkout idempotente.
export const checkout = {
  audit: () => request("GET", "/v1/checkout/audit").then((d) => d.data || d),
  run: (orderId, amount, paymentMethodToken, idempotencyKey) =>
    request("POST", "/v1/checkout", { orderId: orderId, amount: Number(amount), paymentMethodToken: paymentMethodToken }, idempotencyKey ? { "Idempotency-Key": idempotencyKey } : undefined),
};
// dashboard: KPIs agregados server-side e eventos recentes (REF-SHOPDESK-0001).
// exportSalesUrl/exportStockUrl retornam a URL absoluta do CSV para download direto (não JSON).
export const dashboard = {
  summary: () => request("GET", "/v1/dashboard/summary"),
  recent: () => request("GET", "/v1/dashboard/recent"),
  exportSalesUrl: () => (BASE + "/v1/dashboard/export/sales"),
  exportStockUrl: () => (BASE + "/v1/dashboard/export/stock"),
};
// assistente de IA da loja (control-ai-kit) — `ask` chama a rota REAL POST /v1/assistant
// (fail-closed: 503 sem ANTHROPIC_API_KEY). Exportado como objeto próprio (além de api.store.assistant)
// para OrderDetailView resolver `api.assistant.ask` sem fallback. `health` espelha /v1/assistant/health.
export const assistant = {
  ask: (message) => request("POST", "/v1/assistant", { message: message }),
  health: () => request("GET", "/v1/assistant/health"),
};
