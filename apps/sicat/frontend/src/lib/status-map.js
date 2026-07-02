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
 *   warning  -> amarelo        (retry_wait, pendente operacional)
 *   success  -> verde          (succeeded, submitted, completed)
 *   error    -> vermelho       (failed, dlq, error)
 */

export const STATUS_TONES = Object.freeze(['neutral', 'running', 'warning', 'success', 'error']);

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
  'account-health': ACCOUNT_HEALTH_TONES
});

const DOMAIN_LABELS = Object.freeze({
  job: JOB_STATUS_LABELS,
  manifest: MANIFEST_STATUS_LABELS,
  cdf: CDF_STATUS_LABELS,
  dmr: DMR_STATUS_LABELS,
  'account-health': ACCOUNT_HEALTH_LABELS
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
  ACCOUNT_HEALTH_LABELS
};
