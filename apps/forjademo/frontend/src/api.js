// Client da API (base absoluta sob o subpath). Sem ${} — concatenação. Gerado pela Forge.
const BASE = import.meta.env.VITE_API_BASE_URL || '/forjademo/api';
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
