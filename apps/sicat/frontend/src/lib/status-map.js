/**
 * Mapa central de status para badges/cores/labels.
 *
 * Fonte única consumida por SicatStatusBadge. Cada domínio (manifest, job, cdf, dmr)
 * declara seu próprio mapa de status -> tone e status -> label pt-BR.
 *
 * Tonalidades alinhadas a tokens.generated.css (--color-status-*) e ao tema Vuetify.
 *
 * Tones disponíveis:
 *   neutral  -> cinza claro    (queued, draft, cancelled)
 *   running  -> azul ciano     (processing, printing, retry)
 *   warning  -> amarelo        (retry_wait, pendente operacional, envio sem confirmação)
 *   success  -> verde          (succeeded, submitted, completed)
 *   error    -> vermelho       (failed, dlq, error)
 */

export const STATUS_TONES = Object.freeze(['neutral', 'running', 'warning', 'success', 'error']);

/**
 * Status INTERNO do manifesto quando o envio foi despachado para a CETESB e o
 * SICAT **não sabe** se o MTR nasceu (resposta perdida/ilegível do SIGOR).
 *
 * É um terceiro estado, não um sinônimo dos outros dois:
 *   - `submitted` = sabemos que nasceu;
 *   - `failed`    = sabemos que NÃO nasceu;
 *   - `submit_unconfirmed` = não sabemos.
 *
 * Exportado como constante porque o token é consumido fora deste módulo
 * (`features/mtr/list/manifestHelpers.js` decide ações a partir dele) — string
 * literal duplicada é como um dos dois lados sai do ar sem ninguém notar.
 */
export const MANIFEST_STATUS_SUBMIT_UNCONFIRMED = 'submit_unconfirmed';

const JOB_STATUS_TONES = Object.freeze({
  queued: 'neutral',
  pending: 'neutral',
  scheduled: 'neutral',
  running: 'running',
  retry_wait: 'warning',
  succeeded: 'success',
  submitted: 'success',
  finished: 'success',
  completed: 'success',
  failed: 'error',
  dlq: 'error',
  cancelled: 'neutral'
});

const JOB_STATUS_LABELS = Object.freeze({
  queued: 'Na fila',
  pending: 'Pendente',
  scheduled: 'Agendado',
  running: 'Executando',
  retry_wait: 'Aguardando retry',
  succeeded: 'Concluído',
  submitted: 'Submetido',
  finished: 'Finalizado',
  completed: 'Concluído',
  failed: 'Falhou',
  dlq: 'DLQ',
  cancelled: 'Cancelado'
});

const MANIFEST_STATUS_TONES = Object.freeze({
  draft: 'neutral',
  rascunho: 'neutral',
  queued: 'neutral',
  queued_submit: 'neutral',
  pending: 'running',
  processing: 'running',
  printing: 'running',
  submitted: 'success',
  succeeded: 'success',
  completed: 'success',
  received: 'success',
  cancelled: 'neutral',
  // Envio despachado, desfecho DESCONHECIDO. Tem de ser 'warning': sem entrada
  // própria a chave caía no fallback por substring (que não reconhece nada aqui)
  // e virava 'neutral' — cinza, indistinguível de rascunho, ESCONDENDO do
  // operador que existe um MTR possivelmente órfão na CETESB. Jogá-la no balde
  // de falha seria o erro oposto: a tela passaria a MENTIR dizendo que falhou.
  [MANIFEST_STATUS_SUBMIT_UNCONFIRMED]: 'warning',
  failed: 'error',
  error: 'error'
});

// Situações CETESB chegam em pt-BR livre ('Salvo', 'Recebido', 'Armazenado'...)
// e não casam com as chaves exatas acima — sem este fallback por substring,
// tudo vira cinza neutro e o operador perde a leitura de relance do que é
// acionável (Salvo = aguardando baixa; Recebido = pronto para CDF).
function resolveManifestToneBySubstring(key) {
  if (!key) return null;
  if (key.includes('receb')) return 'success';
  if (key.includes('salvo')) return 'running';
  if (key.includes('armazenado')) return 'warning';
  if (key.includes('cancel')) return 'neutral';
  if (key.includes('falha') || key.includes('erro') || key.includes('fail') || key.includes('error')) return 'error';
  return null;
}

// Vocabulário CANÔNICO das situações CETESB (texto livre pt-BR vindo do SIGOR:
// 'Salvo', 'Recebido', 'Armazenado temporariamente'...). Sem este mapa a lista
// mostrava o termo CRU ('Salvo') enquanto o filtro da mesma tela chamava o mesmo
// estado de 'Aguardando baixa' — dois vocabulários para o mesmo status.
// Ordem importa: o primeiro fragmento que casar vence.
const MANIFEST_SITUATION_LABEL_RULES = Object.freeze([
  ['receb', 'Recebido'],
  ['salvo', 'Aguardando baixa'],
  ['armazenado', 'Armazenado temporariamente'],
  ['trâns', 'Em trânsito'],
  ['trans', 'Em trânsito'],
  ['rejeit', 'Rejeitado'],
  ['cancel', 'Cancelado']
]);

const MANIFEST_STATUS_LABELS = Object.freeze({
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
  // Linguagem de operador, não de máquina: sem esta entrada o humanizador
  // devolvia 'Submit Unconfirmed' (jargão em inglês) na coluna Situação.
  [MANIFEST_STATUS_SUBMIT_UNCONFIRMED]: 'Envio sem confirmação',
  failed: 'Falhou',
  error: 'Erro'
});

const CDF_STATUS_TONES = Object.freeze({
  pending: 'running',
  processing: 'running',
  generating: 'running',
  generated: 'success',
  ready: 'success',
  succeeded: 'success',
  completed: 'success',
  downloaded: 'success',
  failed: 'error',
  error: 'error',
  cancelled: 'neutral'
});

const CDF_STATUS_LABELS = Object.freeze({
  pending: 'Pendente',
  processing: 'Em processamento',
  generating: 'Gerando',
  generated: 'Gerado',
  ready: 'Pronto',
  succeeded: 'Concluído',
  completed: 'Concluído',
  downloaded: 'Baixado',
  failed: 'Falhou',
  error: 'Erro',
  cancelled: 'Cancelado'
});

const DMR_STATUS_TONES = Object.freeze({
  draft: 'neutral',
  rascunho: 'neutral',
  pending_review: 'warning',
  pending: 'warning',
  consolidating: 'running',
  consolidated: 'running',
  validating: 'running',
  submitting: 'running',
  submitted: 'success',
  succeeded: 'success',
  completed: 'success',
  failed_validation: 'error',
  failed_remote: 'error',
  failed: 'error',
  error: 'error',
  cancelled: 'neutral'
});

const DMR_STATUS_LABELS = Object.freeze({
  draft: 'Rascunho',
  rascunho: 'Rascunho',
  pending_review: 'Aguardando revisão',
  pending: 'Pendente',
  consolidating: 'Consolidando',
  consolidated: 'Consolidada',
  validating: 'Validando',
  submitting: 'Enviando',
  submitted: 'Enviada',
  succeeded: 'Concluída',
  completed: 'Concluída',
  failed_validation: 'Falha de validação',
  failed_remote: 'Falha no gateway',
  failed: 'Falhou',
  error: 'Erro',
  cancelled: 'Cancelada'
});

// -----------------------------------------------------------------------------
// Transporte (DL-103, programa Onda 1.5/PR-F1) — bounded context separado do
// ambiental. Três domínios novos: a máquina de estados de `TransportOperation`
// (13 estados — transport-state-machine.ts), o resultado PÓS-CLAMP de cada
// check do motor de compliance (PASS/WARN/BLOCK/NOT_APPLICABLE, sempre em
// MAIÚSCULO no contrato — normalizeKey já faz o lowercase na leitura) e o
// ciclo de vida do CIOT (Fase C — sem UI ainda nesta onda, mas o vocabulário
// nasce aqui para não duplicar quando a tela chegar).
// -----------------------------------------------------------------------------

const TRANSPORT_OPERATION_STATUS_TONES = Object.freeze({
  draft: 'neutral',
  validating: 'running',
  blocked: 'error',
  ready_for_contract: 'neutral',
  contracted: 'success',
  ciot_pending: 'running',
  ciot_registered: 'neutral',
  fiscal_pending: 'running',
  ready_for_release: 'neutral',
  in_transit: 'running',
  completion_pending: 'running',
  completed: 'success',
  cancelled: 'error'
});

const TRANSPORT_OPERATION_STATUS_LABELS = Object.freeze({
  draft: 'Rascunho',
  validating: 'Validando',
  blocked: 'Bloqueada',
  ready_for_contract: 'Pronta para contratar',
  contracted: 'Contratada',
  ciot_pending: 'CIOT pendente',
  ciot_registered: 'CIOT registrado',
  fiscal_pending: 'Fiscal pendente',
  ready_for_release: 'Pronta para liberação',
  in_transit: 'Em trânsito',
  completion_pending: 'Conclusão pendente',
  completed: 'Concluída',
  cancelled: 'Cancelada'
});

// Status PÓS-CLAMP de UM check de compliance (`TransporteConformidadeCheckResource.status`
// e `overallStatus` da avaliação de gate) — o contrato devolve sempre em
// MAIÚSCULO (PASS/WARN/BLOCK/NOT_APPLICABLE); `normalizeKey` faz o lowercase.
const COMPLIANCE_STATUS_TONES = Object.freeze({
  pass: 'success',
  warn: 'warning',
  block: 'error',
  not_applicable: 'neutral'
});

const COMPLIANCE_STATUS_LABELS = Object.freeze({
  pass: 'Conforme',
  warn: 'Atenção',
  block: 'Bloqueado',
  not_applicable: 'Não aplicável'
});

// Ciclo de vida do CIOT — Fase C do programa (sem tela nesta onda). Vocabulário
// mínimo registrado agora para a UI futura não inventar um segundo léxico.
const CIOT_STATUS_TONES = Object.freeze({
  pre_validation: 'neutral',
  requested: 'running',
  registered: 'success',
  rectified: 'warning',
  closed: 'success',
  cancelled: 'neutral',
  rejected: 'error',
  blocked: 'error'
});

const CIOT_STATUS_LABELS = Object.freeze({
  pre_validation: 'Pré-validação',
  requested: 'Solicitado',
  registered: 'Registrado',
  rectified: 'Retificado',
  closed: 'Encerrado',
  cancelled: 'Cancelado',
  rejected: 'Rejeitado',
  blocked: 'Bloqueado'
});

const ACCOUNT_HEALTH_TONES = Object.freeze({
  authenticated: 'success',
  ok: 'success',
  healthy: 'success',
  degraded: 'warning',
  pending: 'warning',
  expiring: 'warning',
  expired: 'error',
  error: 'error',
  failed: 'error',
  unknown: 'neutral'
});

const ACCOUNT_HEALTH_LABELS = Object.freeze({
  authenticated: 'Autenticada',
  ok: 'OK',
  healthy: 'Saudável',
  degraded: 'Degradada',
  pending: 'Pendente',
  expiring: 'Expirando',
  expired: 'Expirada',
  error: 'Erro',
  failed: 'Falhou',
  unknown: 'Desconhecido'
});

const TONE_TO_VUETIFY_COLOR = Object.freeze({
  neutral: 'default',
  running: 'info',
  warning: 'warning',
  success: 'success',
  error: 'error'
});

const DOMAIN_TONES = Object.freeze({
  job: JOB_STATUS_TONES,
  manifest: MANIFEST_STATUS_TONES,
  cdf: CDF_STATUS_TONES,
  dmr: DMR_STATUS_TONES,
  'account-health': ACCOUNT_HEALTH_TONES,
  'transport-operation': TRANSPORT_OPERATION_STATUS_TONES,
  compliance: COMPLIANCE_STATUS_TONES,
  ciot: CIOT_STATUS_TONES
});

const DOMAIN_LABELS = Object.freeze({
  job: JOB_STATUS_LABELS,
  manifest: MANIFEST_STATUS_LABELS,
  cdf: CDF_STATUS_LABELS,
  dmr: DMR_STATUS_LABELS,
  'account-health': ACCOUNT_HEALTH_LABELS,
  'transport-operation': TRANSPORT_OPERATION_STATUS_LABELS,
  compliance: COMPLIANCE_STATUS_LABELS,
  ciot: CIOT_STATUS_LABELS
});

function normalizeKey(value) {
  return String(value || '').trim().toLowerCase();
}

function humanizeFallback(value) {
  const key = String(value || '').trim();
  if (!key) return 'Indefinido';
  return key
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/(^|\s)([a-zà-ÿ])/g, (_, prefix, char) => `${prefix}${char.toUpperCase()}`);
}

export function resolveJobStatusTone(status) {
  return JOB_STATUS_TONES[normalizeKey(status)] || 'neutral';
}

export function resolveManifestStatusTone(status) {
  const key = normalizeKey(status);
  return MANIFEST_STATUS_TONES[key] || resolveManifestToneBySubstring(key) || 'neutral';
}

export function resolveStatusTone(domain, status) {
  const map = DOMAIN_TONES[domain];
  if (!map) return 'neutral';
  const key = normalizeKey(status);
  if (map[key]) return map[key];
  if (domain === 'manifest') {
    return resolveManifestToneBySubstring(key) || 'neutral';
  }
  return 'neutral';
}

export function resolveStatusLabel(domain, status, { fallback = null } = {}) {
  const map = DOMAIN_LABELS[domain];
  const key = normalizeKey(status);
  if (map && map[key]) return map[key];
  if (fallback) return fallback;
  return humanizeFallback(status);
}

/**
 * Rótulo canônico da SITUAÇÃO de um manifesto, na ordem de precedência real:
 * situação CETESB (externalStatus, texto livre) -> status interno -> humanizado.
 *
 * Fonte ÚNICA das telas de MTR (lista, relatório e dashboard) para o mesmo
 * manifesto não ser rotulado de três jeitos diferentes.
 */
export function resolveManifestSituationLabel(manifest) {
  const externalKey = normalizeKey(manifest?.externalStatus);
  if (externalKey) {
    const rule = MANIFEST_SITUATION_LABEL_RULES.find(([fragment]) => externalKey.includes(fragment));
    if (rule) return rule[1];
    if (MANIFEST_STATUS_LABELS[externalKey]) return MANIFEST_STATUS_LABELS[externalKey];
    return humanizeFallback(manifest?.externalStatus);
  }

  const internalKey = normalizeKey(manifest?.status);
  if (!internalKey) return '-';
  return MANIFEST_STATUS_LABELS[internalKey] || humanizeFallback(manifest?.status);
}

/**
 * Termo CRU da CETESB, para expor como tooltip/legenda ao lado do rótulo
 * canônico (rastreabilidade: o operador ainda consegue casar com o SIGOR).
 */
export function resolveManifestRawSituation(manifest) {
  return String(manifest?.externalStatus || manifest?.status || '').trim();
}

export function toneToVuetifyColor(tone) {
  return TONE_TO_VUETIFY_COLOR[tone] || 'default';
}

export {
  JOB_STATUS_TONES,
  JOB_STATUS_LABELS,
  MANIFEST_STATUS_TONES,
  MANIFEST_STATUS_LABELS,
  CDF_STATUS_TONES,
  CDF_STATUS_LABELS,
  DMR_STATUS_TONES,
  DMR_STATUS_LABELS,
  ACCOUNT_HEALTH_TONES,
  ACCOUNT_HEALTH_LABELS,
  TRANSPORT_OPERATION_STATUS_TONES,
  TRANSPORT_OPERATION_STATUS_LABELS,
  COMPLIANCE_STATUS_TONES,
  COMPLIANCE_STATUS_LABELS,
  CIOT_STATUS_TONES,
  CIOT_STATUS_LABELS
};
