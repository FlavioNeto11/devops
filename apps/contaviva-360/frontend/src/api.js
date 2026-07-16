// Client da API (base absoluta sob o subpath). Sem ${} — concatenacao. Gerado pela Forge.
export const BASE = import.meta.env.VITE_API_BASE_URL || '/contaviva-360/api';
export async function request(method, path, body, extraHeaders) {
  const headers = Object.assign({ 'Content-Type': 'application/json' }, extraHeaders || {});
  const res = await fetch(BASE + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) { const e = new Error((data && data.error && data.error.message) || ('HTTP ' + res.status)); e.status = res.status; throw e; }
  return data;
}
export function qs(params) {
  const p = new URLSearchParams();
  for (const k in (params || {})) { const v = params[k]; if (v !== '' && v !== null && v !== undefined) p.append(k, v); }
  const s = p.toString(); return s ? ('?' + s) : '';
}
// fabrica de recurso REST: o backend expoe /v1/<name>. list aceita page/pageSize/sort/dir/filtros.
export function resourceFactory(name) {
  const root = "/v1/" + name;
  return {
    list: (params) => request("GET", root + qs(params)).then((d) => (d && d.data !== undefined ? d : { data: d || [], total: (d || []).length })),
    get: (id) => request("GET", root + "/" + id),
    create: (body) => request("POST", root, body),
    update: (id, body) => request("PUT", root + "/" + id, body),
    patch: (id, body) => request("PATCH", root + "/" + id, body),
    remove: (id) => request("DELETE", root + "/" + id),
  };
}
export const health = () => request("GET", "/health");

// Pessoas Fisicas (REQ-CONTAVIVA360-0002)
export const pf = resourceFactory('pf');

// Pessoas Juridicas (REQ-CONTAVIVA360-0002)
export const pj = resourceFactory('pj');

// Documentos Fiscais — versoes (sub-recurso de /v1/documents/:id/versions).
export const documents = resourceFactory('documents');
export function listVersions(docId) {
  return request('GET', '/v1/documents/' + docId + '/versions').then((data) =>
    Array.isArray(data) ? data : (data.data || data.items || [])
  );
}
export async function createVersion(docId, formData) {
  const res = await fetch(BASE + '/v1/documents/' + docId + '/versions', { method: 'POST', body: formData });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) { const e = new Error((data && data.error && data.error.message) || ('HTTP ' + res.status)); e.status = res.status; throw e; }
  return data;
}

// Obrigacoes Fiscais (REQ-CONTAVIVA360-0003)
export const fiscalObligations = resourceFactory('fiscal-obligations');
export const concludeObligation = (id) => request('PATCH', '/v1/fiscal-obligations/' + id + '/concluir');
export const patchObligationStatus = (id, status) => request('PATCH', '/v1/fiscal-obligations/' + id + '/status', { status });

// Tarefas (REQ-CONTAVIVA360-0004)
const _tasksBase = resourceFactory('tasks');
export const tasks = Object.assign({}, _tasksBase, {
  listComments(id) {
    return request('GET', '/v1/tasks/' + id + '/comments').then((d) =>
      Array.isArray(d) ? d : (d.data || d.items || [])
    );
  },
  createComment(id, body) {
    return request('POST', '/v1/tasks/' + id + '/comments', { body });
  },
  listAttachments(id) {
    return request('GET', '/v1/tasks/' + id + '/attachments').then((d) =>
      Array.isArray(d) ? d : (d.data || d.items || [])
    );
  },
  async createAttachment(id, formData) {
    const res = await fetch(BASE + '/v1/tasks/' + id + '/attachments', { method: 'POST', body: formData });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { const e = new Error((data && data.error && data.error.message) || ('HTTP ' + res.status)); e.status = res.status; throw e; }
    return data;
  },
});

// Entidades secundarias de tarefas (REQ-CONTAVIVA360-0004)
export const taskComments = resourceFactory('task-comments');
export const taskAttachments = resourceFactory('task-attachments');

// Controle Financeiro: AP/AR (REQ-CONTAVIVA360-0005)
const _accountsPayableBase = resourceFactory('accounts-payable');
export const accountsPayable = Object.assign({}, _accountsPayableBase, {
  createIdempotent(body, key) {
    return request('POST', '/v1/accounts-payable', body, { 'Idempotency-Key': key });
  },
});
const _accountsReceivableBase = resourceFactory('accounts-receivable');
export const accountsReceivable = Object.assign({}, _accountsReceivableBase, {
  createWithKey(body, key) {
    return request('POST', '/v1/accounts-receivable', body, { 'Idempotency-Key': key });
  },
});

// Receitas e Despesas (REQ-CONTAVIVA360-0002)
export const incomeExpenses = resourceFactory('income-expenses');

// Fluxo de caixa e relatorios (REQ-CONTAVIVA360-0005)
export function cashFlow(horizon) {
  return request("GET", "/v1/cash-flow" + qs({ horizon }));
}
export function financialDashboard(params) {
  return request("GET", "/v1/dashboard/financial" + qs(params));
}
export function financialReport(params) {
  return request("GET", "/v1/reports/financial" + qs({ ...params, format: 'json' }));
}
export function financialReportGenerate(params) {
  return request('POST', '/v1/reports/financial/generate', params);
}
export function financialReportExport(params) {
  const { format, ...rest } = params;
  const p = new URLSearchParams();
  for (const k in (rest || {})) { const v = rest[k]; if (v !== '' && v !== null && v !== undefined) p.append(k, v); }
  p.append('format', format || 'csv');
  return BASE + '/v1/reports/financial?' + p.toString();
}

// Clientes NF (REQ-CONTAVIVA360-0006)
export const nfClients = resourceFactory('nf-clients');

// Produtos/Servicos NF (REQ-CONTAVIVA360-0009)
const _nfProductsBase = resourceFactory('nf-products');
export const nfProducts = Object.assign({}, _nfProductsBase, {
  create(body, idempotencyKey) {
    return request('POST', '/v1/nf-products', body, idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : undefined);
  },
});

// Notas Fiscais (REQ-CONTAVIVA360-0006)
export const nf = resourceFactory('nf');
export const nfCancel = (id, motivo) => request('POST', '/v1/nf/' + id + '/cancel', { motivo: motivo || '' });
export function nfDownloadPdfUrl(id) { return BASE + '/v1/nf/' + id + '/pdf'; }
export function nfDownloadXmlUrl(id) { return BASE + '/v1/nf/' + id + '/xml'; }

// Relatorio de Notas Fiscais (REQ-CONTAVIVA360-0006)
export function getNfReport(params) {
  return request('GET', '/v1/nf/report' + qs(params));
}
export function getNfReportExportUrl(params) {
  const p = new URLSearchParams();
  for (const k in (params || {})) { const v = params[k]; if (v !== '' && v !== null && v !== undefined) p.append(k, v); }
  p.set('format', 'csv');
  return BASE + '/v1/nf/report?' + p.toString();
}

// Assistente de IA contabil (bloco control-ai-por-app). Aceita ARQUIVOS (multimodal).
export async function assistant(message, files) {
  const list = Array.isArray(files) ? files.filter(Boolean) : [];
  let res;
  if (list.length) {
    const fd = new FormData();
    fd.append('message', String(message || ''));
    for (const f of list) fd.append('files', f, f.name);
    res = await fetch(BASE + '/v1/assistant', { method: 'POST', body: fd });
  } else {
    res = await fetch(BASE + '/v1/assistant', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: String(message || '') }) });
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) { const e = new Error((data && data.error && data.error.message) || ('HTTP ' + res.status)); e.status = res.status; throw e; }
  return data;
}
export const assistantHealth = () => request('GET', '/v1/assistant/health');
export const confirmDraft = (draft) => request('POST', '/v1/assistant/confirm-draft', { draft });

// Auditoria do assistente IA (REQ-CONTAVIVA360-0007/0009)
export const assistantAudit = resourceFactory('assistant-audit');

// Gateways Fiscais — operacoes administrativas (REQ-CONTAVIVA360-0009)
export const gatewayAudit = resourceFactory('gateway-audit');
export const gatewayHealth = () => request('GET', '/v1/gateways/health');
export const sefazConsultar = (body) => request('POST', '/v1/gateways/sefaz/consultar', body);
export const sefazInutilizar = (body) => request('POST', '/v1/gateways/sefaz/inutilizar', body);
export const rfbCadastral = (cnpj) => request('GET', '/v1/gateways/rfb/cadastral/' + encodeURIComponent(cnpj));
export const esocialEventos = (body) => request('POST', '/v1/gateways/esocial/eventos', body);

// Sub-entidades de PF/PJ (REQ-CONTAVIVA360-0002)
export const pfAssets = resourceFactory('pf-assets');
export const pfLiabilities = resourceFactory('pf-liabilities');
export const pjPartners = resourceFactory('pj-partners');

// Identidade do usuario (SSO borda)
export const me = () => request('GET', '/me');

// Dashboards por role (REQ-CONTAVIVA360-0008)
export const dashboardRolePf = () => request('GET', '/v1/dashboard/role/pf');
export const dashboardRolePj = () => request('GET', '/v1/dashboard/role/pj');
export const dashboardRoleContador = () => request('GET', '/v1/dashboard/role/contador');
export const dashboardRoleAdmin = () => request('GET', '/v1/dashboard/role/admin');

// SSE para real-time updates (AC6). Retorna funcao de cleanup.
export function dashboardEvents(onEvent) {
  if (typeof EventSource === 'undefined') return () => {};
  let es = null;
  let dead = false;
  function connect() {
    if (dead) return;
    es = new EventSource(BASE + '/v1/events/dashboard');
    es.onmessage = (e) => { try { onEvent(JSON.parse(e.data)); } catch {} };
    es.onerror = () => { if (!dead) { if (es) { es.close(); es = null; } setTimeout(connect, 5000); } };
  }
  connect();
  return () => { dead = true; if (es) { es.close(); es = null; } };
}
