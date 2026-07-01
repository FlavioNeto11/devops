// Cliente da API BESC. Mesmo origin em producao (/besc/api). Em dev, o Vite faz proxy.
const BASE = '/besc/api';

async function req(method, path, body) {
  const opts = { method, headers: {} };
  if (body !== undefined) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  const res = await fetch(BASE + path, opts);
  const ct = res.headers.get('content-type') || '';
  const data = ct.includes('application/json') ? await res.json() : await res.text();
  if (!res.ok) throw new Error((data && data.error) || `Erro ${res.status}`);
  return data;
}

export const api = {
  meta: () => req('GET', '/meta'),
  list: () => req('GET', '/cases'),
  create: (b) => req('POST', '/cases', b),
  get: (id) => req('GET', `/cases/${id}`),
  update: (id, b) => req('PUT', `/cases/${id}`, b),
  remove: (id) => req('DELETE', `/cases/${id}`),
  addLawsuit: (id, b) => req('POST', `/cases/${id}/lawsuits`, b),
  updateLawsuit: (id, lid, b) => req('PUT', `/cases/${id}/lawsuits/${lid}`, b),
  deleteLawsuit: (id, lid) => req('DELETE', `/cases/${id}/lawsuits/${lid}`),
  updateDocument: (id, key, b) => req('PUT', `/cases/${id}/documents/${key}`, b),
  updateLegal: (id, key, b) => req('PUT', `/cases/${id}/legal/${key}`, b),
  updateTokenization: (id, key, b) => req('PUT', `/cases/${id}/tokenization/${key}`, b),
  updateCollateral: (id, b) => req('PUT', `/cases/${id}/collateral`, b),
  setStatus: (id, status) => req('POST', `/cases/${id}/status`, { status }),
  report: (id, type) => req('GET', `/cases/${id}/report?type=${encodeURIComponent(type)}`),
  reportHtmlUrl: (id, type) => `${BASE}/cases/${id}/report.html?type=${encodeURIComponent(type)}`,
};
