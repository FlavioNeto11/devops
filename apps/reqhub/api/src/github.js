// github.js — helpers do dispatch para o GitHub (repository_dispatch). Centraliza a autenticação e a
// SANITIZAÇÃO de erro para os fluxos do Forge (preview/launch/delete). Motivação: um token de dispatch
// inválido/placeholder fazia o GitHub responder 401 "Bad credentials" e essa mensagem CRUA vazava para a
// UI (além de estourar no meio do stream SSE do preview). Aqui:
//   - classifyDispatchToken(): OFFLINE (sem rede) — 'missing' | 'placeholder' | 'present'. Pega o caso
//     comum (token = CHANGE_ME) instantaneamente, permitindo falhar cedo e claro ANTES do sseStart.
//   - validateDispatchToken(): validação VIVA com cache curto (GET /rate_limit) — pega token expirado.
//   - dispatchErrorPayload(): erro AMIGÁVEL {code,message} por status, sem NUNCA repassar o corpo do GitHub.
// R1: só lê /rate_limit e dispara repository_dispatch; nunca loga o token.

// Prefixos reais de token do GitHub (classic ghp_/gho_/ghs_/ghu_/ghr_; fine-grained github_pat_).
const TOKEN_PREFIXES = ['ghp_', 'github_pat_', 'gho_', 'ghs_', 'ghu_', 'ghr_'];
// Placeholders comuns em secret.example (CHANGE_ME etc.) — tratados como "não configurado".
const PLACEHOLDER_RE = /^(change[_-]?me|replace[_-]?me|your[_-]?token|placeholder|todo|x{3,}|<.*>|\.\.\.)$/i;

export function dispatchToken() { return String(process.env.GITHUB_DISPATCH_TOKEN || '').trim(); }

// Classifica o token SEM tocar na rede. 'present' só quando parece um PAT de verdade.
export function classifyDispatchToken(tokenArg) {
  const t = tokenArg != null ? String(tokenArg).trim() : dispatchToken();
  if (!t) return 'missing';
  if (PLACEHOLDER_RE.test(t)) return 'placeholder';
  if (t.length < 20) return 'placeholder';
  if (!TOKEN_PREFIXES.some((p) => t.startsWith(p))) return 'placeholder';
  return 'present';
}

// Validação VIVA com cache curto — evita bater no GitHub a cada preview. Só o 401 (credencial inválida)
// deve BLOQUEAR no pré-flight; rede/5xx/outros não bloqueiam (o dispatch depois falha de forma sanitizada).
let _cache = null; // { at, token, ok, status }
const TTL_MS = 60 * 1000;
export function __resetTokenCacheForTest() { _cache = null; }
export async function validateDispatchToken({ token, fetchImpl, now } = {}) {
  const t = token != null ? String(token).trim() : dispatchToken();
  const ts = typeof now === 'function' ? now() : Date.now();
  if (_cache && _cache.token === t && (ts - _cache.at) < TTL_MS) return { ok: _cache.ok, status: _cache.status, cached: true };
  const f = fetchImpl || fetch;
  let status = 0;
  try {
    const res = await f('https://api.github.com/rate_limit', {
      headers: { Authorization: `Bearer ${t}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'reqhub-forge' },
    });
    status = Number(res && res.status) || 0;
  } catch { status = 0; } // rede indisponível -> não bloqueia
  const ok = status !== 401; // apenas "Bad credentials" bloqueia
  _cache = { at: ts, token: t, ok, status };
  return { ok, status };
}

// Erro AMIGÁVEL por status do GitHub — NUNCA inclui o corpo cru do provedor. `action` contextualiza a
// mensagem ('gerar o preview' | 'criar o sistema' | 'excluir o sistema').
export function dispatchErrorPayload(status, action = 'concluir a operação') {
  const s = Number(status) || 0;
  if (s === 401) return { code: 'PREVIEW_UPSTREAM_AUTH', message: `Falha ao autenticar com o serviço externo (GitHub) ao ${action} — o token de dispatch está inválido ou expirado. Verifique a configuração e tente de novo.` };
  if (s === 403) return { code: 'PREVIEW_UPSTREAM_FORBIDDEN', message: `O serviço externo (GitHub) recusou a operação ao ${action} (permissão insuficiente ou limite atingido). Tente novamente em instantes.` };
  if (s === 404) return { code: 'PREVIEW_UPSTREAM_NOTFOUND', message: `Não foi possível localizar o recurso externo ao ${action}. Verifique a configuração do repositório.` };
  return { code: 'PREVIEW_UPSTREAM', message: `Falha no serviço externo (GitHub) ao ${action}. Tente novamente; se persistir, avise o suporte.` };
}
