// prompt-source.js — resolucao de prompts versionados FORA do caminho critico.
//
// Regra de design (inegociavel, ver apps/ai-control-plane): o ai-control-plane
// e consultado com timeout curto + cache + FALLBACK local (prompt versionado no
// repo do app). Se o control-plane cair, NENHUM turno de IA quebra: caimos para
// o fallback embarcado. So lancamos quando NAO ha nem remoto nem fallback —
// nesse caso o app esta de fato sem prompt (erro de configuracao).
//
// Endpoint (contrato do ai-control-plane):
//   GET ${controlPlaneUrl}/v1/prompts/${app}.${promptName}/active
//   -> 200 { data: { promptText, ... } }  (sucesso)  | { text } (forma legada)
//   -> 404 PROMPT_NOT_FOUND / NO_ACTIVE_VERSION       (cai p/ fallback)

import { ControlAiConfigError } from './errors.js';

const DEFAULT_CACHE_TTL_MS = 5 * 60 * 1000; // 5 min
const DEFAULT_TIMEOUT_MS = 2000; // control-plane FORA do caminho critico

/**
 * Extrai o texto do prompt de um payload do control-plane, tolerando as formas
 * { data: { promptText } } (contrato atual) e { text } / { promptText } (legado).
 * @param {any} body
 * @returns {string|null}
 */
function extractPromptText(body) {
  if (!body || typeof body !== 'object') return null;
  const node = body.data && typeof body.data === 'object' ? body.data : body;
  const text = node.promptText ?? node.text ?? node.prompt;
  return typeof text === 'string' && text.length > 0 ? text : null;
}

/**
 * Cria a fonte de prompts (cache + timeout + fallback offline).
 *
 * @param {object} opts
 * @param {string} [opts.controlPlaneUrl]  base do ai-control-plane (sem barra final). Ausente => so fallback.
 * @param {string} opts.app                 namespace do app (prefixo `${app}.${promptName}`).
 * @param {Record<string,string>} [opts.fallback]  prompts versionados no repo (default {}).
 * @param {number} [opts.cacheTtlMs]        TTL do cache em ms (default 5 min).
 * @param {number} [opts.timeoutMs]         timeout do fetch em ms (default 2000).
 * @param {typeof fetch} [opts.fetchImpl]   fetch injetavel (default global fetch) — testes offline.
 * @param {() => number} [opts.clock]       relogio injetavel (default Date.now) — testes de TTL.
 */
export function createPromptSource({
  controlPlaneUrl,
  app,
  fallback = {},
  cacheTtlMs = DEFAULT_CACHE_TTL_MS,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  fetchImpl,
  clock,
} = {}) {
  if (!app || typeof app !== 'string') {
    throw new ControlAiConfigError('createPromptSource: `app` obrigatorio');
  }
  const now = typeof clock === 'function' ? clock : () => Date.now();
  const doFetch = fetchImpl || (typeof fetch === 'function' ? fetch : null);
  const cache = new Map(); // promptName -> { text, expiresAt }

  /**
   * Busca a versao ativa no control-plane. NUNCA lanca: qualquer falha
   * (sem url, sem fetch, timeout, !ok, rede, parse) retorna null para cair no fallback.
   * @param {string} promptName
   * @returns {Promise<string|null>}
   */
  async function fetchRemote(promptName) {
    if (!controlPlaneUrl || !doFetch) return null;
    const url = `${String(controlPlaneUrl).replace(/\/$/, '')}/v1/prompts/${encodeURIComponent(`${app}.${promptName}`)}/active`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await doFetch(url, { signal: controller.signal });
      if (!res || !res.ok) return null;
      const body = await res.json();
      return extractPromptText(body);
    } catch {
      // timeout (abort) / rede / parse — control-plane FORA do caminho critico.
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Resolve o texto do prompt: cache -> remoto -> fallback local.
   * @param {string} promptName
   * @returns {Promise<string>}
   */
  async function resolve(promptName) {
    if (!promptName || typeof promptName !== 'string') {
      throw new ControlAiConfigError('promptSource.resolve: `promptName` obrigatorio');
    }

    // (a) cache com TTL
    const cached = cache.get(promptName);
    if (cached && cached.expiresAt > now()) return cached.text;

    // (b) remoto (best-effort)
    const remote = await fetchRemote(promptName);
    if (remote != null) {
      cache.set(promptName, { text: remote, expiresAt: now() + cacheTtlMs });
      return remote;
    }

    // (c) fallback local versionado no repo
    const local = fallback[promptName];
    if (typeof local === 'string' && local.length > 0) {
      cache.set(promptName, { text: local, expiresAt: now() + cacheTtlMs });
      return local;
    }

    // nem remoto nem fallback => o app esta sem prompt (config).
    throw new ControlAiConfigError(
      `prompt "${promptName}" indisponivel: sem versao ativa no control-plane e sem fallback no repo`,
    );
  }

  /** Limpa o cache (util para testes / rotacao manual de prompt). */
  function clearCache() {
    cache.clear();
  }

  return { app, resolve, clearCache };
}
