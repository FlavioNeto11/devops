// promote.js — promoção de um contrato normalizado para o git, no padrão forge-launch:
// a API NÃO escreve git — só monta o EXPORT CANÔNICO (docs/portal-contracts, SEM
// sample_request/sample_response) e DISPARA o workflow portal-contract-promote.yml
// (GitHub repository_dispatch). O runner self-hosted é quem escreve a pasta datada
// e abre o PR. Fail-closed: sem GITHUB_DISPATCH_TOKEN o endpoint responde 503 (na
// rota). fetch nativo (Node 20+) — sem octokit. Funções PURAS (testáveis sem banco).

import crypto from 'node:crypto';

// Espelha o guard do workflow (e do padrão forge-launch). Slugs de portal que não
// casem aqui não são promovíveis — erro claro em vez de falha silenciosa no runner.
export const PROMOTE_SLUG_RE = /^[a-z][a-z0-9-]{1,30}$/;

// Teto defensivo do client_payload do repository_dispatch (~64KB no GitHub).
export const MAX_PAYLOAD_BYTES = 60 * 1024;

const REDACTION_POLICY = 'business-sensitive-v1';
const EVENT_TYPE = 'portal-contract-promote';
// Segmentos genéricos que não servem de grupo funcional (deriveGroup pula).
const GENERIC_SEGMENTS = new Set(['api', 'apis', 'rest', 'services', 'service', 'public', 'v1', 'v2', 'v3']);

const fail = (code, message) => ({ ok: false, code, message });

// ── hash canônico (idêntico ao scripts/portal-contracts/validate-portal-contract.mjs) ──
// Chaves ordenadas recursivamente; linhas unidas por \n; sha256 hex com prefixo.
export function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    const out = {};
    for (const key of Object.keys(value).sort()) out[key] = canonicalize(value[key]);
    return out;
  }
  return value;
}

export function contentHashOfEndpoints(records) {
  const canonical = records.map((r) => JSON.stringify(canonicalize(r))).join('\n');
  return `sha256:${crypto.createHash('sha256').update(canonical, 'utf8').digest('hex')}`;
}

// ── derivações puras ─────────────────────────────────────────────────────────
const dateOnly = (v) => {
  const d = v instanceof Date ? v : new Date(v || Date.now());
  return Number.isNaN(d.getTime()) ? new Date().toISOString().slice(0, 10) : d.toISOString().slice(0, 10);
};

const slugSegment = (seg) => String(seg || '').replace(/[{}]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '');

// Grupo funcional best-effort: primeiro segmento literal não-genérico do path.
// Observacional — o revisor do PR pode reclassificar à mão (auth/manifesto/...).
export function deriveGroup(pathTemplate) {
  const segs = String(pathTemplate || '').split('/').filter(Boolean);
  for (const seg of segs) {
    if (seg.startsWith('{')) continue; // param não é grupo
    const s = slugSegment(seg);
    if (s && !GENERIC_SEGMENTS.has(s)) return s;
  }
  return 'general';
}

// Id estável `^[a-z0-9]+(-[a-z0-9]+)+$`: <portal>-<método>-<segmentos do path>.
// `taken` (Set) garante unicidade no arquivo (colisão → sufixo -2, -3, ...).
export function endpointId(portalSlug, method, pathTemplate, taken = new Set()) {
  const parts = [
    slugSegment(portalSlug) || 'portal',
    slugSegment(method) || 'get',
    ...String(pathTemplate || '').split('/').map(slugSegment).filter(Boolean),
  ];
  const base = parts.join('-');
  let id = base;
  for (let i = 2; taken.has(id); i += 1) id = `${base}-${i}`;
  taken.add(id);
  return id;
}

// Converte UMA linha do banco (portal_endpoints) no shape canônico do
// docs/portal-contracts/schema — ALLOWLIST de campos: samples NUNCA entram
// (inflam tokens e risco; o schema observacional já decide o shape).
function toCanonicalEndpoint({ portalSlug, ep, capturedAt, taken }) {
  const method = String(ep.method || '').toUpperCase();
  const pathTemplate = String(ep.path_template || '');
  const pathParams = [...pathTemplate.matchAll(/\{([^}]+)\}/g)]
    .map((m) => ({ name: m[1], type: 'string', detected_from: 'capture' }));
  const sampleCount = Number.isInteger(ep.occurrence_count) && ep.occurrence_count >= 1 ? ep.occurrence_count : 1;
  const requiresAuth = Boolean(ep.requires_auth);
  return {
    id: endpointId(portalSlug, method, pathTemplate, taken),
    portal: portalSlug,
    group: deriveGroup(pathTemplate),
    title: `${method} ${pathTemplate}`,
    method,
    host: String(ep.host || ''), // informativo (o canônico ancora em manifest.base_url)
    path_template: pathTemplate,
    path_params: pathParams,
    // best-effort da captura: exige sessão → assume header Authorization; revisável no PR.
    auth: { required: requiresAuth, token_header_mode: requiresAuth ? 'authorization' : 'none', scopes: [] },
    request: { schema: ep.request_schema && typeof ep.request_schema === 'object' ? ep.request_schema : {} },
    response: { schema: ep.response_schema && typeof ep.response_schema === 'object' ? ep.response_schema : {} },
    requires_captcha: Boolean(ep.requires_captcha),
    observability: { sample_count: sampleCount, source: 'portal-recorder', first_seen: capturedAt, last_seen: capturedAt },
    redaction: { applied: true, policy: REDACTION_POLICY },
  };
}

/**
 * Monta o export CANÔNICO (manifest + endpoints, sem samples) de um contrato do banco.
 * portal: linha de `portals`; contract: linha de `portal_contracts` (com created_at);
 * endpoints: linhas de `portal_endpoints`. `now` injetável (teste determinístico).
 * -> { ok, value: { manifest, endpoints } } | { ok:false, code, message }
 */
export function buildCanonicalExport({ portal, contract, endpoints, now = new Date() }) {
  if (!portal || !portal.slug) return fail('PORTAL_REQUIRED', 'portal do contrato não encontrado');
  if (!contract || !contract.id) return fail('CONTRACT_REQUIRED', 'contrato não encontrado');
  const list = Array.isArray(endpoints) ? endpoints : [];
  if (list.length === 0) return fail('NO_ENDPOINTS', 'contrato sem endpoints — normalize uma sessão com chamadas de API antes de promover');

  const capturedAt = dateOnly(contract.created_at);
  const taken = new Set();
  const seenMethodPath = new Set();
  const canonical = [];
  for (const ep of list) {
    const record = toCanonicalEndpoint({ portalSlug: portal.slug, ep, capturedAt, taken });
    const mp = `${record.method} ${record.path_template}`;
    if (seenMethodPath.has(mp)) {
      // fail-closed: o validador do repo rejeitaria (DUPLICATE_METHOD_PATH) — melhor
      // recusar aqui com contexto do que abrir um PR que o CI derruba.
      return fail('DUPLICATE_METHOD_PATH', `endpoints duplicados no contrato (${mp}) — mesmo método+path em hosts distintos não cabe no formato canônico; revise a captura`);
    }
    seenMethodPath.add(mp);
    canonical.push(record);
  }

  const version = dateOnly(now); // pasta datada docs/portal-contracts/<slug>/<yyyy-mm-dd>/
  const manifest = {
    portal: portal.slug,
    base_url: portal.base_origin || '',
    version,
    label: `promovido do portal-recorder (contrato ${contract.id}, v${contract.version}${contract.session_id ? `, sessão ${contract.session_id}` : ''})`,
    endpoint_count: canonical.length,
    capture_window: { from: capturedAt, to: capturedAt },
    content_hash: contentHashOfEndpoints(canonical),
    generated_by: `portal-recorder@${contract.id}`,
    redaction_policy: REDACTION_POLICY,
  };
  return { ok: true, value: { manifest, endpoints: canonical } };
}

/**
 * Monta o client_payload do repository_dispatch. O payload LEVA o export completo
 * (contratos canônicos sem samples são pequenos — o runner não alcança o Postgres
 * do app), com teto de 60KB e erro claro instruindo reduzir o escopo.
 * -> { ok, payload, bytes } | { ok:false, code, message }
 */
export function buildPromotePayload({ portalSlug, contractId, contractVersion, requestedBy, exportData }) {
  const payload = {
    payload_version: 1,
    requested_by: String(requestedBy || 'portal-recorder').trim().slice(0, 120) || 'portal-recorder',
    portal_slug: portalSlug,
    contract_id: contractId,
    contract_version: contractVersion,
    version: exportData.manifest.version,
    export: exportData,
  };
  const bytes = Buffer.byteLength(JSON.stringify(payload), 'utf8');
  if (bytes > MAX_PAYLOAD_BYTES) {
    return fail('PAYLOAD_TOO_LARGE', `export canônico com ${exportData.endpoints.length} endpoints tem ${Math.round(bytes / 1024)}KB e excede ${Math.round(MAX_PAYLOAD_BYTES / 1024)}KB — capture/normalize um escopo menor (menos endpoints por sessão) e promova de novo`);
  }
  return { ok: true, payload, bytes };
}

/** Dispara o repository_dispatch (event_type 'portal-contract-promote'). GitHub responde 204. */
export async function dispatchContractPromote({ token, repo, payload, fetchImpl }) {
  const f = fetchImpl || fetch;
  const res = await f(`https://api.github.com/repos/${repo}/dispatches`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
      'User-Agent': 'portal-recorder-contract-promote',
    },
    body: JSON.stringify({ event_type: EVENT_TYPE, client_payload: payload }),
  });
  if (res.status === 204) return { ok: true };
  let detail = '';
  try { detail = (await res.text()).slice(0, 300); } catch { /* noop */ }
  return { ok: false, status: res.status, detail };
}

export const _internals = { EVENT_TYPE, REDACTION_POLICY, GENERIC_SEGMENTS };
