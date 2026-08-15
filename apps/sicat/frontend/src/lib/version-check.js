/**
 * VERIFICAÇÃO DE VERSÃO EM RUNTIME — módulo PURO.
 *
 * O problema medido em produção: `Cache-Control: no-store` no `index.html` só
 * governa entradas criadas A PARTIR do deploy do nginx novo — ele NÃO desaloja a
 * cópia que o navegador já guardou sob os cabeçalhos antigos. Medição: uma
 * navegação normal para /sicat/manifestos carregou `index-Yyrg84HD.js` (duas
 * publicações atrás) com `deliveryType: "cache"` e `transferSize: 0`, sem
 * service worker e com a Cache API vazia — era o cache de disco do documento.
 *
 * Pior: a rede de segurança de chunk 404 (`stale-bundle-recovery.js`) NUNCA
 * dispara nesse estado. O bundle antigo pede assets antigos, que também vêm do
 * cache com `transferSize: 0` — não há 404, não há erro, não há sintoma. A aba
 * fica presa na versão velha SILENCIOSAMENTE, e só ctrl+shift+r resolve.
 *
 * A saída é não depender do cache HTTP para descobrir a versão: o build embute
 * um identificador no bundle e emite um `version.json` com o MESMO
 * identificador; em runtime a SPA busca esse arquivo com `cache: "no-store"` e
 * compara. Diferente = há publicação nova rodando no servidor.
 *
 * Aqui fica só a DECISÃO (pura, testável). O efeito (fetch, listeners, toast,
 * `location.reload`) vive em `version-watch.js`.
 *
 * Duas regras inegociáveis, cobertas por teste:
 *  - falha silenciosa: identificador ausente/inválido (offline, proxy engolindo
 *    o arquivo, build sem id) NUNCA avisa e NUNCA recarrega;
 *  - sem laço: um mesmo identificador servido só rende UM aviso por sessão.
 */

/** Nome do arquivo emitido pelo build (ver plugin em `vite.config.js`). */
export const VERSION_MANIFEST_FILE = 'version.json';

/** Piso entre duas checagens — foco/rota mudam muito; não queremos polling. */
export const VERSION_CHECK_MIN_INTERVAL_MS = 30000;

export const NEW_VERSION_MESSAGE = 'Uma versão mais nova do SICAT já está no ar.';
export const NEW_VERSION_DETAIL =
  'Esta aba ainda está com a versão anterior, guardada pelo navegador. Atualize para trabalhar com a versão publicada — o que estiver preenchido na tela será perdido.';
export const NEW_VERSION_ACTION_LABEL = 'Atualizar agora';

/**
 * Normaliza um identificador de build. Devolve '' para tudo que não sirva para
 * comparar — o chamador trata '' como "não sei", nunca como "mudou".
 */
export function normalizeBuildId(value) {
  if (typeof value !== 'string') return '';

  const trimmed = value.trim();
  if (!trimmed) return '';

  // Sentinelas de build mal configurado: um `undefined` embutido como STRING
  // compararia diferente de tudo e avisaria o operador para sempre.
  if (trimmed === 'undefined' || trimmed === 'null' || trimmed === 'NaN') return '';

  // Nada legítimo passa disso; string gigante = resposta errada (HTML de erro,
  // página de portal cativo) que virou JSON por acidente.
  if (trimmed.length > 200) return '';

  return trimmed;
}

/**
 * Extrai o identificador do corpo do `version.json`.
 * Qualquer formato inesperado vira '' (falha silenciosa).
 */
export function readServedBuildId(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return '';
  return normalizeBuildId(payload.buildId);
}

/**
 * Decide se o operador deve ser avisado de que há versão nova.
 *
 * @param {string} embedded   identificador embutido no bundle em build-time
 * @param {string} served     identificador que o servidor está entregando agora
 * @param {string} handledBuildId  identificador pelo qual JÁ avisamos nesta sessão
 * @returns {boolean}
 */
export function shouldPromptReload(embedded, served, handledBuildId = '') {
  const mine = normalizeBuildId(embedded);
  const theirs = normalizeBuildId(served);

  // Sem um dos lados não há comparação possível — calar é a resposta certa.
  if (!mine || !theirs) return false;

  if (mine === theirs) return false;

  // Trava de laço: se já avisamos (ou já recarregamos) por ESTE identificador e
  // ainda assim continuamos no bundle antigo, insistir viraria recarregamento
  // em ciclo. Avisamos uma vez e paramos.
  if (normalizeBuildId(handledBuildId) === theirs) return false;

  return true;
}

/**
 * Debounce da checagem: foco/visibilidade e troca de rota disparam muito.
 * `force` (montagem do app) é decidido pelo chamador, não aqui.
 */
export function shouldCheckNow(lastCheckAt, now = Date.now(), minIntervalMs = VERSION_CHECK_MIN_INTERVAL_MS) {
  const previous = Number(lastCheckAt);
  if (!Number.isFinite(previous) || previous <= 0) return true;

  const elapsed = now - previous;
  // Relógio para trás (ajuste de horário) não pode congelar a checagem.
  if (elapsed < 0) return true;

  return elapsed >= minIntervalMs;
}

/**
 * URL do manifesto COM cache-busting. O `cache: "no-store"` do fetch já deveria
 * bastar, mas proxies intermediários (o túnel do host público remove ETag, por
 * exemplo) podem devolver cópia guardada para a mesma URL — a query única tira
 * essa chance.
 */
export function buildVersionManifestUrl(baseUrl = '/', now = Date.now()) {
  const base = String(baseUrl || '/');
  const withSlash = base.endsWith('/') ? base : `${base}/`;
  return `${withSlash}${VERSION_MANIFEST_FILE}?_=${now}`;
}
