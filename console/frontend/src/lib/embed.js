// ===========================================================================
// Modo EMBED do Console (E4, Forja 4.1) — helpers puros da superfície embutida.
// O Product Studio (/reqs) embute o editor de conteúdo do CMS via IFRAME
// same-origin: /devops/?embed=1#conteudo?projeto=<key>. Com ?embed=1 o App
// renderiza SÓ o editor (sem casca/sidebar/topbar) e conversa com o pai por
// postMessage — SEMPRE com targetOrigin = a própria origem (nunca '*').
// ADR: docs/decisions/0004-cms-embed-no-studio.md
// ===========================================================================

/** Identificador das mensagens deste embed (o receptor valida source + origem). */
export const EMBED_SOURCE = 'console-embed';

/** true quando a URL do Console pede a superfície embed (?embed=1). */
export function isEmbedMode(search) {
  try { return new URLSearchParams(search || '').get('embed') === '1'; } catch { return false; }
}

/**
 * Lê o deep-link por hash na MESMA gramática do App (E1): '#conteudo?projeto=x'
 * (com ou sem '/' após o '#') -> { view: 'conteudo', params }. null quando não casa.
 */
export function parseEmbedHash(hash) {
  const m = String(hash || '').replace(/^#\/?/, '').match(/^([a-z]+)(?:\?(.*))?$/);
  if (!m) return null;
  return { view: m[1], params: new URLSearchParams(m[2] || '') };
}

/** Monta o payload padrão das mensagens do embed ({ source, type, ...extra }). */
export function embedMessage(type, extra = {}) {
  return { source: EMBED_SOURCE, type, ...extra };
}
