// validators.js — regras de validação PURAS. Cada uma retorna (value, all) => '' (ok) | 'mensagem'.
// Componíveis: rules = { campo: [required(), minLen(3)] }. Testáveis sem DOM.
export const required = (msg = 'Obrigatório') => (v) =>
  v === null || v === undefined || (typeof v === 'string' && v.trim() === '') || (Array.isArray(v) && v.length === 0) ? msg : '';

export const minLen = (n, msg) => (v) => (v && String(v).length < n ? (msg || ('Mínimo de ' + n + ' caracteres')) : '');
export const maxLen = (n, msg) => (v) => (v && String(v).length > n ? (msg || ('Máximo de ' + n + ' caracteres')) : '');

export const email = (msg = 'E-mail inválido') => (v) => (!v ? '' : /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v)) ? '' : msg);

export const numeric = (msg = 'Número inválido') => (v) => (v === '' || v === null || v === undefined ? '' : isFinite(Number(v)) ? '' : msg);
export const min = (n, msg) => (v) => (v === '' || v === null || v === undefined ? '' : Number(v) < n ? (msg || ('Mínimo ' + n)) : '');
export const max = (n, msg) => (v) => (v === '' || v === null || v === undefined ? '' : Number(v) > n ? (msg || ('Máximo ' + n)) : '');

export const pattern = (re, msg = 'Formato inválido') => (v) => (!v ? '' : re.test(String(v)) ? '' : msg);

// roda uma lista de regras e devolve a 1ª mensagem de erro (ou '').
export function runRules(rules, value, all) {
  for (const rule of rules || []) { const m = rule(value, all); if (m) return m; }
  return '';
}
