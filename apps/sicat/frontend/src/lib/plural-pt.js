/**
 * PLURAL pt-BR — o fim do "manifesto(s)".
 *
 * A tela dizia "20 manifesto(s) selecionado(s)", "1 item(ns)" e
 * "243 manifesto(s)": pluralização MECÂNICA, que empurra para o operador o
 * trabalho de ler o parêntese e decidir o número. O app já sabe a contagem —
 * então ele escreve a palavra certa.
 *
 * Uso: `pluralize(n, 'manifesto')` → "manifesto" (n = 1) / "manifestos".
 * O plural pode (e deve, quando irregular) vir explícito:
 * `pluralize(n, 'declaração', 'declarações')`. A derivação automática cobre os
 * casos regulares do vocabulário do SICAT e serve de rede de segurança — nunca
 * de adivinhação para palavras novas e difíceis.
 *
 * Módulo PURO (sem Vue, sem DOM) — testado em tests/unit/plural-pt.test.js.
 */

/**
 * Derivação regular do plural pt-BR para o vocabulário do app.
 * - "declaração" → "declarações"   (-ão → -ões)
 * - "item"       → "itens"         (-m  → -ns)
 * - "local"      → "locais"        (-l  → -is)
 * - "mulher"     → "mulheres"      (-r/-z → +es)
 * - "lápis"      → "lápis"         (-s invariável)
 * - "manifesto"  → "manifestos"    (regra geral)
 */
export function pluralOf(singular) {
  const word = String(singular ?? '').trim();
  if (!word) {
    return '';
  }

  const lower = word.toLowerCase();

  if (lower.endsWith('ão')) {
    return `${word.slice(0, -2)}ões`;
  }

  if (lower.endsWith('m')) {
    return `${word.slice(0, -1)}ns`;
  }

  if (lower.endsWith('l')) {
    return `${word.slice(0, -1)}is`;
  }

  if (lower.endsWith('r') || lower.endsWith('z')) {
    return `${word}es`;
  }

  if (lower.endsWith('s')) {
    return word;
  }

  return `${word}s`;
}

/**
 * Devolve a forma correta da palavra para a contagem (só a palavra, sem o
 * número). Contagem inválida/ausente é tratada como plural — "0 manifestos".
 */
export function pluralize(count, singular, plural) {
  const word = String(singular ?? '').trim();
  if (!word) {
    return '';
  }

  const numeric = Number(count);
  const isSingular = Number.isFinite(numeric) && Math.abs(numeric) === 1;

  if (isSingular) {
    return word;
  }

  const explicitPlural = String(plural ?? '').trim();
  return explicitPlural || pluralOf(word);
}

/** "1 manifesto" / "20 manifestos" — número + palavra concordados. */
export function pluralizeWithCount(count, singular, plural) {
  const numeric = Number(count);
  const safeCount = Number.isFinite(numeric) ? numeric : 0;
  return `${safeCount} ${pluralize(safeCount, singular, plural)}`.trim();
}
