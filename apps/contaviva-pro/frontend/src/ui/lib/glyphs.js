// SINCRONIZADO de packages/ui-vue — NÃO editar aqui; edite o pacote e rode `node build.mjs`.
// glyphs.js — mapa nome→glifo para ícones de estado (UiEmptyState / UiErrorState).
//
// PROBLEMA que resolve: os componentes de estado renderizam a prop `icon` como TEXTO.
// Chamadas que passam um NOME canônico (ex.: icon="doc") acabavam mostrando a palavra
// literal ("doc") em vez de um glifo. Aqui um nome conhecido vira um glifo; um glifo/emoji
// passado direto é mantido como veio. CSP-safe (texto puro, sem estilo inline).
//
// Determinístico e sem dependências. Estender o mapa conforme novos nomes aparecerem.

const GLYPHS = {
  doc: '📄',
  document: '📄',
  invoice: '🧾',
  receipt: '🧾',
  clock: '🕘',
  time: '🕘',
  history: '🕘',
  search: '🔎',
  filter: '🔎',
  inbox: '📥',
  empty: '📭',
  box: '📦',
  package: '📦',
  cart: '🛒',
  order: '🛒',
  user: '👤',
  users: '👥',
  team: '👥',
  warn: '⚠',
  warning: '⚠',
  error: '⚠',
  alert: '🚨',
  info: 'ℹ',
  ok: '✓',
  check: '✓',
  success: '✅',
  ban: '🚫',
  blocked: '🚫',
  lock: '🔒',
  chart: '📊',
  stats: '📊',
  money: '💰',
  payment: '💳',
  card: '💳',
  bell: '🔔',
  mail: '✉',
  email: '✉',
  link: '🔗',
  star: '★',
  pin: '📌',
  tag: '🏷',
  list: '📋',
  none: '∅',
};

// Heurística mínima e segura para distinguir "nome" de "glifo/emoji já pronto":
// um nome canônico é só letras ASCII (a-z, dígitos, hífen/underscore). Qualquer outra
// coisa (emoji, símbolo, palavra acentuada) é tratada como glifo literal e devolvida intacta.
const NAME_RE = /^[a-z0-9][a-z0-9_-]*$/i;

/**
 * Resolve a prop `icon` para um glifo exibível.
 * @param {string|undefined|null} icon - nome canônico OU glifo/emoji direto.
 * @param {string} [fallback='∅'] - glifo quando `icon` é vazio.
 * @returns {string}
 */
export function resolveGlyph(icon, fallback = '∅') {
  if (icon === null || icon === undefined || icon === '') return fallback;
  const raw = String(icon);
  const key = raw.toLowerCase();
  if (Object.prototype.hasOwnProperty.call(GLYPHS, key)) return GLYPHS[key];
  // nome canônico desconhecido (só letras/dígitos) → não vaza a palavra literal; usa o fallback.
  if (NAME_RE.test(raw)) return fallback;
  // já é um glifo/emoji/símbolo → devolve intacto.
  return raw;
}

export { GLYPHS };
