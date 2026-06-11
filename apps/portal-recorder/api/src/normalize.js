// normalize.js — lógica PURA de normalização: eventos de captura → endpoints do
// contrato. Sem I/O (testável com node:test). Detecta path params (segmento só
// vira {param} se variou em ≥2 amostras E parece id), infere requires_auth/captcha
// e um schema observacional simples. O store chama isto e persiste o resultado.

const ID_SEGMENT_RE = /^(\d+|[0-9a-f]{16,}|[0-9a-fA-F-]{20,}|%[0-9A-Fa-f]{2})/; // numérico, hash, uuid, encoded

function looksLikeId(seg) {
  if (!seg) return false;
  if (/^\d+$/.test(seg)) return true;                 // numérico
  if (/^[0-9a-f]{16,}$/i.test(seg)) return true;       // hash hex longo
  if (/^[0-9a-fA-F]{8}-[0-9a-fA-F-]{20,}$/.test(seg)) return true; // uuid
  if (seg.includes('%')) return true;                  // encoded
  return ID_SEGMENT_RE.test(seg);
}

// Agrupa paths de mesmo (método,host) por nº de segmentos e decide, posição a
// posição, se é param (variou em ≥2 amostras e todos id-like) ou literal.
function buildTemplate(paths) {
  const split = paths.map((p) => p.split('/'));
  const len = split[0].length;
  const out = [];
  for (let i = 0; i < len; i += 1) {
    const values = [...new Set(split.map((s) => s[i]))];
    const allIdLike = values.every((v) => looksLikeId(v));
    if (values.length >= 2 && allIdLike) out.push(`{p${i}}`);
    else if (values.length === 1) out.push(values[0]);
    else out.push(allIdLike ? `{p${i}}` : values[0]); // 1 amostra id-like → param (best-effort)
  }
  return out.join('/');
}

// Infere o schema observacional de um conjunto de corpos (objetos).
export function inferSchema(bodies) {
  const objects = bodies.filter((b) => b && typeof b === 'object' && !Array.isArray(b));
  if (objects.length === 0) {
    const arr = bodies.find((b) => Array.isArray(b));
    if (arr) return { type: 'array', items: inferSchema(arr.slice(0, 5)) };
    return {};
  }
  const total = objects.length;
  const counts = {};
  const types = {};
  for (const o of objects) {
    for (const [k, v] of Object.entries(o)) {
      counts[k] = (counts[k] || 0) + 1;
      const t = Array.isArray(v) ? 'array' : v === null ? 'null' : typeof v;
      (types[k] = types[k] || new Set()).add(t);
    }
  }
  const properties = {};
  const required = [];
  for (const [k, c] of Object.entries(counts)) {
    const ts = [...types[k]].filter((t) => t !== 'null');
    const prop = { type: ts[0] || 'string' };
    if (c < total) prop.optional = true; else required.push(k);
    if (types[k].has('null')) prop.nullable_observed = true;
    if (/senha|password|token|cookie|cpf|cnpj|email|recaptcha|authorization/i.test(k)) prop.sensitive = true;
    properties[k] = prop;
  }
  const schema = { type: 'object', properties };
  if (required.length) schema.required = required;
  return schema;
}

// events: [{ method, host, path, status_code, requires_auth_hint, req_body, resp_body, captcha_hint }]
// Retorna [{ method, host, path_template, requires_auth, requires_captcha, occurrence_count,
//            request_schema, response_schema, sample_request, sample_response }]
export function normalizeEvents(events) {
  const groups = new Map(); // key método+host+#seg
  for (const e of events) {
    if (!e.method || !e.host || !e.path) continue;
    const key = `${e.method} ${e.host} ${e.path.split('/').length}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(e);
  }
  // dentro de cada grupo de mesmo comprimento, gera template e re-agrupa
  const byTemplate = new Map();
  for (const [, list] of groups) {
    const template = buildTemplate(list.map((e) => e.path));
    const tkey = `${list[0].method} ${list[0].host} ${template}`;
    if (!byTemplate.has(tkey)) byTemplate.set(tkey, { method: list[0].method, host: list[0].host, path_template: template, items: [] });
    byTemplate.get(tkey).items.push(...list);
  }
  const endpoints = [];
  for (const [, g] of byTemplate) {
    const items = g.items;
    const requires_auth = items.some((e) => e.requires_auth_hint);
    const requires_captcha = items.some((e) => e.captcha_hint);
    endpoints.push({
      method: g.method,
      host: g.host,
      path_template: g.path_template,
      requires_auth,
      requires_captcha,
      occurrence_count: items.length,
      request_schema: inferSchema(items.map((e) => e.req_body).filter(Boolean)),
      response_schema: inferSchema(items.map((e) => e.resp_body).filter(Boolean)),
      sample_request: items.find((e) => e.req_body)?.req_body || {},
      sample_response: items.find((e) => e.resp_body)?.resp_body || {},
      source_event_ids: items.map((e) => e.id).filter(Boolean).slice(0, 20),
    });
  }
  return endpoints.sort((a, b) => (a.host + a.path_template).localeCompare(b.host + b.path_template));
}

export { looksLikeId, buildTemplate };
