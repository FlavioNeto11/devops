// Client da API (base absoluta sob o subpath). Sem ${} — concatenação. Gerado pela Forge.
const BASE = import.meta.env.VITE_API_BASE_URL || '/teamflow/api';
async function request(method, path, body) {
  const res = await fetch(BASE + path, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) { const e = new Error((data && data.error && data.error.message) || ('HTTP ' + res.status)); e.status = res.status; throw e; }
  return data;
}
export const health = () => request("GET", "/health");
// recurso genérico `records` (o gerador de backend expõe /v1/records).
export const records = {
  list: () => request("GET", "/v1/records").then((d) => d.data || d),
  get: (id) => request("GET", "/v1/records/" + id),
  create: (rec) => request("POST", "/v1/records", rec),
  submit: (id) => request("POST", "/v1/records/" + id + "/submit", {}),
};
