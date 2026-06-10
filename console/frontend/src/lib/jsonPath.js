/**
 * jsonPath.js
 * -----------
 * getAt/setAt imutáveis por caminho com pontos ("title", "cards.0.title",
 * "heading.subtitle"). Usados pelo editor visual (VisualEditor) para aplicar
 * edições inline/painel sobre o `data` (jsonb) de uma seção sem mutar o objeto
 * original (preserva arrays como arrays).
 */

/** Lê o valor em `path` (string com pontos). path vazio => o próprio obj. */
export function getAt(obj, path) {
  if (!path) return obj;
  return String(path)
    .split('.')
    .reduce((acc, k) => (acc == null ? undefined : acc[k]), obj);
}

/** Retorna uma cópia de `obj` com `path` definido como `value` (imutável). */
export function setAt(obj, path, value) {
  const keys = String(path).split('.');
  const root = Array.isArray(obj) ? obj.slice() : { ...(obj || {}) };
  let cur = root;
  for (let i = 0; i < keys.length - 1; i++) {
    const k = keys[i];
    const child = cur[k];
    const copy = Array.isArray(child) ? child.slice() : { ...(child || {}) };
    cur[k] = copy;
    cur = copy;
  }
  cur[keys[keys.length - 1]] = value;
  return root;
}
