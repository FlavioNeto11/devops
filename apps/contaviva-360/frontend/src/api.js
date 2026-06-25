// Client da API (base absoluta sob o subpath). Sem ${} — concatenação. Gerado pela Forge.
const BASE = import.meta.env.VITE_API_BASE_URL || '/contaviva-360/api';
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
export const records = resourceFactory('records');

// Controle Financeiro (REQ-CONTAVIVA360-0005)
export const accountsPayable = resourceFactory('accounts-payable');
export const accountsReceivable = resourceFactory('accounts-receivable');

export function cashFlow(horizon) {
  return request("GET", "/v1/cash-flow" + qs({ horizon }));
}

export function financialDashboard(params) {
  return request("GET", "/v1/dashboard/financial" + qs(params));
}

export function financialReport(params) {
  return request("GET", "/v1/reports/financial" + qs({ ...params, format: 'json' }));
}

export function financialReportExport(params) {
  const { format, ...rest } = params;
  const p = new URLSearchParams();
  for (const k in (rest || {})) { const v = rest[k]; if (v !== '' && v !== null && v !== undefined) p.append(k, v); }
  p.append('format', format || 'csv');
  return BASE + '/v1/reports/financial?' + p.toString();
}

// Assistente de IA (bloco control-ai-por-app). Aceita ARQUIVOS (multimodal): envia multipart/form-data
// quando há File[] (campo 'files'); senão JSON (retrocompat). NUNCA setamos Content-Type no multipart
// (o browser põe o boundary). Erros estruturados (status + message) sobem p/ a view.
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
