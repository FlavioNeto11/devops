// forge-launch.js — a UI da Forja "cria no git" SEM o reqhub-api escrever git: este módulo só
// DISPARA o workflow greenfield-launch.yml (GitHub repository_dispatch). O runner self-hosted é quem
// escreve os YAMLs, regenera a baseline e abre o PR. Fail-closed: sem GITHUB_DISPATCH_TOKEN, o endpoint
// responde 503. fetch nativo (Node 20) — sem octokit. Funções puras + dispatch injetável (testáveis).

const PRODUCT_RE = /^[a-z][a-z0-9-]{1,30}$/;
const MAX_PAYLOAD_BYTES = 60 * 1024; // teto defensivo (repository_dispatch client_payload ~64KB)
const MAX_REQS = 12;

// Produtos PROTEGIDOS — apps vivos e componentes de plataforma. A Forja NÃO pode scaffoldar/relançar
// (launch escreveria specs+apps/<p>+Application do Argo por cima de recurso vivo sob selfHeal) nem
// apagar. Espelha a denylist dos workflows greenfield-launch.yml / forge-delete.yml (defesa em camadas).
const PROTECTED = new Set([
  'sicat', 'gymops', 'rmambiental', 'anarabottini',
  'reqhub', 'console', 'devops-console', 'portal', 'portal-recorder',
  'keycloak', 'langfuse', 'ai-control-plane', 'devops-platform',
]);

const str = (v, max = 200) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

// (C2) Modos de USO da UI da Forja. INFORMATIVO: vai ao client_payload (e daí ao corpo do PR)
// como rastreabilidade de UX — NUNCA muda os artefatos (o writer escreve os requisitos verbatim).
const CREATION_MODES = new Set(['simples', 'guiado', 'profissional']);

/** Valida o corpo do POST /v1/forge/launch. -> { ok, value } | { ok:false, code, message }. */
export function validateLaunchInput(body) {
  const b = body || {};
  const product = String(b.product || '').trim().toLowerCase();
  if (!PRODUCT_RE.test(product)) return { ok: false, code: 'INVALID_PRODUCT', message: 'product inválido (slug minúsculo 2-31 chars: ^[a-z][a-z0-9-]{1,30}$)' };
  if (PROTECTED.has(product)) return { ok: false, code: 'PROTECTED', message: `'${product}' é protegido (app vivo ou componente de plataforma) — a Forja não pode scaffoldar/relançar sobre ele` };
  const mode = b.mode === 'release' ? 'release' : (b.mode === 'pr' ? 'pr' : null);
  if (!mode) return { ok: false, code: 'INVALID_MODE', message: "mode deve ser 'pr' ou 'release'" };
  const requirements = Array.isArray(b.requirements)
    ? b.requirements.filter((r) => r && typeof r === 'object' && !Array.isArray(r) && (r.title || r.statement))
    : [];
  if (!requirements.length) return { ok: false, code: 'NO_REQUIREMENTS', message: 'requirements (array não-vazio de objetos) é obrigatório' };
  if (requirements.length > MAX_REQS) return { ok: false, code: 'TOO_MANY', message: `máximo ${MAX_REQS} requisitos por lançamento` };
  const architecture = (b.architecture && typeof b.architecture === 'object' && !Array.isArray(b.architecture)) ? b.architecture : {};
  return {
    ok: true,
    value: {
      product, mode,
      displayName: str(b.displayName, 120) || product,
      blueprint: str(b.blueprint, 60),
      brief: str(b.brief, 8000),
      requirements,
      architecture,
      // opt-out do gate de preview (F3): só p/ fluxos legados que não usam preview. Default: gate ativo.
      skipPreviewGate: b.skipPreviewGate === true,
      // (C2) modo de uso da UI — opcional; valor fora do enum vira '' (ausente). Retrocompat total.
      creation_mode: CREATION_MODES.has(b.creation_mode) ? b.creation_mode : '',
    },
  };
}

/** Monta o client_payload do repository_dispatch (impõe o teto de tamanho). -> { ok, payload, bytes } | { ok:false, code, message }. */
export function buildClientPayload(value, identity) {
  const payload = {
    payload_version: 1,
    requested_by: str(identity, 120) || 'reqhub',
    product: value.product,
    display_name: value.displayName,
    blueprint: value.blueprint,
    brief: value.brief,
    mode: value.mode,
    requirements: value.requirements,
    architecture: value.architecture,
    // (C2) informativo (rastreabilidade de UX no PR); ausente em clientes antigos -> payload idêntico ao pré-C2.
    ...(value.creation_mode ? { creation_mode: value.creation_mode } : {}),
  };
  const bytes = Buffer.byteLength(JSON.stringify(payload), 'utf8');
  if (bytes > MAX_PAYLOAD_BYTES) {
    return { ok: false, code: 'PAYLOAD_TOO_LARGE', message: `payload ${Math.round(bytes / 1024)}KB excede ${Math.round(MAX_PAYLOAD_BYTES / 1024)}KB — reduza o escopo (menos requisitos)` };
  }
  return { ok: true, payload, bytes };
}

/** Dispara o repository_dispatch (event_type 'forge-launch'). GitHub responde 204 em sucesso. */
export async function dispatchForgeLaunch({ token, repo, payload, fetchImpl }) {
  const f = fetchImpl || fetch;
  const res = await f(`https://api.github.com/repos/${repo}/dispatches`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
      'User-Agent': 'reqhub-forge-launch',
    },
    body: JSON.stringify({ event_type: 'forge-launch', client_payload: payload }),
  });
  if (res.status === 204) return { ok: true };
  let detail = '';
  try { detail = (await res.text()).slice(0, 300); } catch { /* noop */ }
  return { ok: false, status: res.status, detail };
}

/** Valida o corpo do POST /v1/forge/delete. -> { ok, value } | { ok:false, code, message }. */
export function validateDeleteInput(body) {
  const product = String((body || {}).product || '').trim().toLowerCase();
  if (!PRODUCT_RE.test(product)) return { ok: false, code: 'INVALID_PRODUCT', message: 'product inválido (slug minúsculo 2-31 chars)' };
  if (PROTECTED.has(product)) return { ok: false, code: 'PROTECTED', message: `'${product}' é protegido (produto real ou componente de plataforma) e não pode ser apagado pela Forja` };
  return { ok: true, value: { product } };
}

/** Dispara o repository_dispatch 'forge-delete' (apaga um produto da Forja). GitHub responde 204. */
export async function dispatchForgeDelete({ token, repo, product, identity, fetchImpl }) {
  const f = fetchImpl || fetch;
  const res = await f(`https://api.github.com/repos/${repo}/dispatches`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
      'User-Agent': 'reqhub-forge-delete',
    },
    body: JSON.stringify({ event_type: 'forge-delete', client_payload: { product, requested_by: str(identity, 120) || 'reqhub' } }),
  });
  if (res.status === 204) return { ok: true };
  let detail = '';
  try { detail = (await res.text()).slice(0, 300); } catch { /* noop */ }
  return { ok: false, status: res.status, detail };
}

export const _internals = { PRODUCT_RE, MAX_PAYLOAD_BYTES, MAX_REQS, PROTECTED };
