/**
 * Vocabulário pt-BR de status de manifesto para a camada conversacional.
 *
 * Espelha `frontend/src/lib/status-map.js` (fonte única das telas) para que o
 * assistente fale a MESMA língua do app. Sem isto o chat devolvia rótulos crus
 * em inglês ("Filtro: status = received") e termos da CETESB ("Salvo") na mesma
 * resposta em que a tela mostra "Recebido" e "Aguardando baixa" — dois
 * vocabulários para o mesmo estado.
 *
 * Ordem de precedência (idêntica a `resolveManifestSituationLabel` do frontend):
 * situação CETESB (`externalStatus`, texto livre pt-BR) -> status interno.
 */

/** Situações CETESB chegam como texto livre; o primeiro fragmento que casar vence. */
const MANIFEST_SITUATION_LABEL_RULES: ReadonlyArray<readonly [string, string]> = Object.freeze([
  ['receb', 'Recebido'],
  ['salvo', 'Aguardando baixa'],
  ['armazenado', 'Armazenado temporariamente'],
  ['trâns', 'Em trânsito'],
  ['trans', 'Em trânsito'],
  ['rejeit', 'Rejeitado'],
  ['cancel', 'Cancelado']
]);

const MANIFEST_STATUS_LABELS: Readonly<Record<string, string>> = Object.freeze({
  draft: 'Rascunho',
  rascunho: 'Rascunho',
  queued: 'Na fila',
  queued_submit: 'Aguardando envio',
  pending: 'Em processamento',
  processing: 'Em processamento',
  printing: 'Imprimindo',
  submitted: 'Enviado',
  succeeded: 'Concluído',
  completed: 'Concluído',
  received: 'Recebido',
  cancelled: 'Cancelado',
  failed: 'Falhou',
  error: 'Erro'
});

function normalizeKey(value: unknown): string {
  return String(value ?? '').trim().toLowerCase();
}

function humanizeFallback(value: unknown): string {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  return raw
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/(^|\s)([a-zà-ÿ])/g, (_match, prefix: string, char: string) => `${prefix}${char.toUpperCase()}`);
}

/**
 * Rótulo pt-BR canônico da situação de um manifesto. `fallback` é devolvido
 * quando não há status algum (evita "sem status" cru na resposta do chat).
 */
export function resolveManifestSituationLabelPtBr(
  manifest: { status?: unknown; externalStatus?: unknown } | null | undefined,
  fallback = 'sem situação registrada'
): string {
  const externalKey = normalizeKey(manifest?.externalStatus);
  if (externalKey) {
    const rule = MANIFEST_SITUATION_LABEL_RULES.find(([fragment]) => externalKey.includes(fragment));
    if (rule) return rule[1];
    if (MANIFEST_STATUS_LABELS[externalKey]) return MANIFEST_STATUS_LABELS[externalKey];
    return humanizeFallback(manifest?.externalStatus) || fallback;
  }

  const internalKey = normalizeKey(manifest?.status);
  if (!internalKey) return fallback;
  return MANIFEST_STATUS_LABELS[internalKey] || humanizeFallback(manifest?.status) || fallback;
}

/**
 * Rótulo pt-BR de um valor de FILTRO de status, preservando o termo técnico
 * entre parênteses para rastreabilidade ("Recebido (received)").
 */
export function describeManifestStatusFilterPtBr(status: unknown): string | null {
  const key = normalizeKey(status);
  if (!key) return null;

  const label = resolveManifestSituationLabelPtBr({ externalStatus: key }, '')
    || resolveManifestSituationLabelPtBr({ status: key }, '');

  if (!label) return String(status);
  return label.toLowerCase() === key ? label : `${label} (${key})`;
}

/**
 * Vocabulário declarado ao planner/classificador para que o filtro escolhido
 * case com o que o operador vê na tela. "Aguardando baixa" é a situação CETESB
 * `Salvo` — NÃO é `received`; confundir os dois foi a causa da resposta errada
 * observada em produção.
 */
export const MANIFEST_STATUS_VOCABULARY_HINT =
  'VOCABULARIO DE SITUACAO DO MANIFESTO (o mesmo das telas): '
  + '"aguardando baixa" = situacao CETESB "Salvo" (selection.status="salvo"); '
  + '"recebido" = situacao CETESB "Recebido" (selection.status="received"); '
  + '"armazenado temporariamente" = "Armazenado"; "em transito"; "cancelado"; '
  + '"rascunho" = draft; "em processamento" = pending; "enviado" = submitted. '
  + 'NUNCA use "received" para "aguardando baixa" — sao estados OPOSTOS do ciclo. '
  + 'Ao relatar um filtro ou status ao usuario, escreva o rotulo em pt-BR desse vocabulario, nunca o termo tecnico em ingles.';
