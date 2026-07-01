// Client da API (base absoluta sob o subpath). Sem ${} — concatenação. Gerado pela Forge.
const BASE = import.meta.env.VITE_API_BASE_URL || '/neuroevolui/api';
async function request(method, path, body, extraHeaders) {
  const headers = { 'Content-Type': 'application/json', ...(extraHeaders || {}) };
  const res = await fetch(BASE + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) { const e = new Error((data && data.error && data.error.message) || ('HTTP ' + res.status)); e.status = res.status; throw e; }
  return data;
}
// Opções por chamada → headers. Hoje encaminha Idempotency-Key (cobrança/criação única);
// extensível p/ outros headers de contrato sem mexer nas assinaturas das views.
function headersFor(opts) {
  if (!opts) return undefined;
  const h = {};
  if (opts.idempotencyKey) h['Idempotency-Key'] = opts.idempotencyKey;
  return Object.keys(h).length ? h : undefined;
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
    // 2º arg opcional { idempotencyKey } → header Idempotency-Key (criação única; mesma chave p/ retries).
    create: (body, opts) => request("POST", root, body, headersFor(opts)),
    update: (id, body, opts) => request("PUT", root + "/" + id, body, headersFor(opts)),
    remove: (id) => request("DELETE", root + "/" + id),
  };
}
export const health = () => request("GET", "/health");

// Identidade do usuário corrente (RBAC). Erro estruturado (status + message) sobe p/ a view,
// que decide o fail-safe (sem identidade => modo visualização). Mantém o caminho de dados
// dentro do contrato do api.js (sem fetch solto nas views).
export const me = () => request("GET", "/me");

// Recursos de DOMÍNIO do neuroevolui (etapa do integrador). Cada um é um cliente REST
// sobre /v1/<name> (list/get/create/update/remove). As views consomem estes nomes camelCase.
// Convenção "só endpoints REAIS": todo recurso abaixo tem a rota /v1/<name> REAL no server.js.
export const patients = resourceFactory('patients');
export const professionals = resourceFactory('professionals');
export const evolutionNotes = resourceFactory('evolution-notes');
export const patientReports = resourceFactory('patient-reports');
export const paymentTransactions = resourceFactory('payment-transactions');
export const notificationPreferences = resourceFactory('notification-preferences');
export const auditLogs = resourceFactory('audit-logs');
export async function exportAuditLogs(params) {
  const p = new URLSearchParams();
  for (const k in (params || {})) { const v = params[k]; if (v !== '' && v !== null && v !== undefined) p.append(k, v); }
  const query = p.toString() ? '?' + p.toString() : '';
  const res = await fetch(BASE + '/v1/audit-logs/export' + query);
  if (!res.ok) { const d = await res.json().catch(() => ({})); const e = new Error((d && d.error && d.error.message) || 'HTTP ' + res.status); e.status = res.status; throw e; }
  return res.blob();
}
export const asyncJobs = resourceFactory('async-jobs');
// Aliases de nome-de-export com hífen (ES2022 string export names) — as views acessam o
// recurso por `api['evolution-notes']` / `api['patient-reports']` (espelho do nome da rota
// /v1/<name>). Mantém o acesso direto (sem cair no fallback resourceFactory) e o build limpo.
export {
  evolutionNotes as 'evolution-notes',
  patientReports as 'patient-reports',
  paymentTransactions as 'payment-transactions',
  notificationPreferences as 'notification-preferences',
  auditLogs as 'audit-logs',
  asyncJobs as 'async-jobs',
};
// `consultations` é o recurso REST padrão + o método dedicado `schedule` (POST /v1/consultations/schedule,
// que valida conflito de horário no backend — ver server.js). As views usam `consultations.schedule(body)`.
export const consultations = Object.assign(resourceFactory('consultations'), {
  schedule: (body, opts) => resourceFactory('consultations/schedule').create(body, opts),
});
// Notificações multicanal (bloco notificacoes-multicanal). Estes 5 caminhos são bespoke
// (corpo fixo, fora do shape REST puro do resourceFactory), então ficam num cliente de
// DOMÍNIO próprio — mas sempre sobre a MESMA base `request()` (contrato único: nenhuma
// view faz fetch solto). Caminhos reais no server.js:
//   GET    /v1/notifications/vapid-public-key       → string (chave pública)
//   GET    /v1/notifications/preferences            → { data:[{channel,enabled,contact_value}] }
//   PUT    /v1/notifications/preferences            { channel, enabled, contact_value }
//   POST   /v1/notifications/subscriptions          { endpoint, keys:{ p256dh, auth } }
//   DELETE /v1/notifications/subscriptions          { endpoint }
export const notificationPrefs = {
  list: () => request('GET', '/v1/notifications/preferences').then((d) => ({ data: (d && d.data) || [] })),
  put: (channel, enabled, contactValue) =>
    request('PUT', '/v1/notifications/preferences', { channel, enabled, contact_value: contactValue || '' }),
  vapidKey: () => request('GET', '/v1/notifications/vapid-public-key').then((d) => (d && d.vapid_public_key) || ''),
  subscribe: (endpoint, p256dh, auth) =>
    request('POST', '/v1/notifications/subscriptions', { endpoint, keys: { p256dh, auth } }),
  unsubscribe: (endpoint) => request('DELETE', '/v1/notifications/subscriptions', { endpoint }),
};

// Base de conhecimento (RAG). Recurso REST padrão + métodos dedicados:
//  - reindex(id): POST /v1/knowledge-sources/:id/reindex (reprocessa; ingested_at=now()).
//  - stats():     GET  /v1/knowledge-sources/stats (agregados REAIS de toda a coleção).
//  - createSource(payload, files): ENVIA O CONTEÚDO REAL para a ingestão (chunking+embedding
//    no SERVIDOR). Com File[] → multipart/form-data (campo 'files'; o backend extrai o texto,
//    inclusive de PDF); sem arquivos → JSON { ..., content } (texto colado). O content_hash e o
//    chunk_count são computados no servidor sobre o conteúdo real — a view não fabrica mais hash
//    de filename. NUNCA setamos Content-Type no multipart (o browser põe o boundary).
// A view usa knowledgeSources.list({ q }) p/ busca server-side por título/ID.
export const knowledgeSources = Object.assign(resourceFactory('knowledge-sources'), {
  reindex: (id) => request('POST', '/v1/knowledge-sources/' + id + '/reindex'),
  stats: () => request('GET', '/v1/knowledge-sources/stats'),
  async createSource(payload, files) {
    const list = Array.isArray(files) ? files.filter(Boolean) : [];
    const fields = payload || {};
    if (list.length) {
      const fd = new FormData();
      for (const k of Object.keys(fields)) {
        const v = fields[k];
        if (v !== undefined && v !== null && v !== '') fd.append(k, String(v));
      }
      for (const f of list) fd.append('files', f, f.name);
      const res = await fetch(BASE + '/v1/knowledge-sources', { method: 'POST', body: fd });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { const e = new Error((data && data.error && data.error.message) || ('HTTP ' + res.status)); e.status = res.status; e.code = data && data.error && data.error.code; throw e; }
      return data;
    }
    return request('POST', '/v1/knowledge-sources', fields);
  },
});

// Assistente de IA (bloco control-ai-por-app, REQ-NEUROEVOLUI-0006). ÚNICO cliente do endpoint.
// Contrato REAL do backend (server.js POST /v1/assistant): campo `question` (NÃO `message`) +
// `context_type` ('professional'|'patient'). Resposta { answer, sources, confidence, actions }.
// Fail-closed: 503 { error.code:'AI_DISABLED' } sem chave de IA; 400 { error.code:'VALIDATION_ERROR' }
// se question vazio. Aceita ARQUIVOS (multimodal): multipart/form-data quando há File[] (campo 'files'),
// senão JSON. NUNCA setamos Content-Type no multipart (o browser põe o boundary).
// Assinatura: assistant(question, files?, opts?) — `files` é File[]; `opts` = { contextType, signal }.
// `signal` (AbortController) habilita timeout/cancelamento na view. Erros estruturados
// (status + code + message) sobem p/ a view.
export async function assistant(question, files, opts) {
  const list = Array.isArray(files) ? files.filter(Boolean) : [];
  const contextType = (opts && opts.contextType) || 'professional';
  const signal = opts && opts.signal;
  let res;
  if (list.length) {
    const fd = new FormData();
    fd.append('question', String(question || ''));
    fd.append('context_type', contextType);
    for (const f of list) fd.append('files', f, f.name);
    res = await fetch(BASE + '/v1/assistant', { method: 'POST', body: fd, signal });
  } else {
    res = await fetch(BASE + '/v1/assistant', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ question: String(question || ''), context_type: contextType }), signal });
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) { const e = new Error((data && data.error && data.error.message) || ('HTTP ' + res.status)); e.status = res.status; e.code = data && data.error && data.error.code; throw e; }
  return data;
}

// Probe fail-closed do assistente. O backend NÃO expõe /v1/assistant/health; o estado fail-closed é
// inferido pelo próprio endpoint, que valida `aiEnabled()` ANTES de validar o payload:
//   - 503 / AI_DISABLED  → IA desligada (fail-closed) → { aiDisabled: true }
//   - 400 / VALIDATION_ERROR (question vazio) → a IA está ATIVA e validou o payload → { aiDisabled: false }
// Mandamos question vazio de propósito (nunca chega ao modelo: barra na validação). Centraliza aqui a
// heurística para a view não fazer fetch cru. Erros inesperados sobem (a view mostra retry).
export async function assistantProbe(opts) {
  try {
    await assistant('', [], opts);
    return { aiDisabled: false };
  } catch (e) {
    if (e.status === 503 || e.code === 'AI_DISABLED') return { aiDisabled: true };
    if (e.status === 400 || e.code === 'VALIDATION_ERROR') return { aiDisabled: false };
    throw e;
  }
}
