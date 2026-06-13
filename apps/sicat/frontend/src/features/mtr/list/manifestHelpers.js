/**
 * Helpers puros de manifestos (sem estado reativo).
 *
 * Extraídos de ManifestsView para reduzir o tamanho da view e permitir reuso
 * e teste isolado. Toda função aqui depende apenas de argumentos + utilitários
 * de data; nenhuma fecha sobre stores, refs ou DOM.
 */

import {
  brDateToIsoDate,
  formatDateBr,
  formatDateTimeBr
} from '../../../utils/date-format.js';

export const MANIFEST_STATUS_LABELS = Object.freeze({
  draft: 'Rascunho',
  queued_submit: 'Pendente',
  submitting: 'Enviando',
  processing: 'Executando',
  submitted: 'Sucesso',
  printing: 'Imprimindo',
  printed: 'Sucesso',
  cancelling: 'Cancelando',
  cancelled: 'Cancelado',
  succeeded: 'Sucesso',
  failed: 'Falha',
  error: 'Falha'
});

export function resolveManifestStatusLabel(manifest) {
  const externalStatus = String(manifest?.externalStatus || '').trim();
  if (externalStatus) {
    return externalStatus;
  }
  const internalStatus = String(manifest?.status || '').trim();
  return MANIFEST_STATUS_LABELS[internalStatus] || internalStatus || '-';
}

export function normalizedStatusClass(status) {
  const value = String(status || '').toLowerCase();
  if (value.includes('queue') || value.includes('pend')) return 'queued';
  if (value.includes('run') || value.includes('process')) return 'running';
  if (value.includes('cancel')) return 'failed';
  if (value.includes('falh') || value.includes('erro') || value.includes('error') || value.includes('dlq')) return 'failed';
  if (value.includes('salvo') || value.includes('receb') || value.includes('trâns') || value.includes('transit')) return 'succeeded';
  if (value.includes('print')) return 'succeeded';
  if (value.includes('succ') || value.includes('submit')) return 'succeeded';
  return 'failed';
}

export function isSingleDayDateWindow(dateFrom, dateTo) {
  const fromIso = brDateToIsoDate(dateFrom);
  const toIso = brDateToIsoDate(dateTo);
  if (!fromIso || !toIso) {
    return true;
  }
  return fromIso === toIso;
}

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function pad2(value) {
  return String(value).padStart(2, '0');
}

export function formatLocalDateInput(date = new Date()) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

export function formatLocalDateTimeInput(date = new Date()) {
  return `${formatLocalDateInput(date)}T${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}

export function toDateTimeIso(value) {
  const normalized = String(value || '').trim();
  if (!normalized) return '';
  const candidate = new Date(normalized);
  return Number.isNaN(candidate.getTime()) ? '' : candidate.toISOString();
}

export function toIntegerOrNull(value) {
  const normalized = String(value ?? '').trim();
  if (!normalized) {
    return null;
  }
  const parsed = Number(normalized);
  return Number.isInteger(parsed) ? parsed : null;
}

export function normalizeDocument(value) {
  return String(value || '').replaceAll(/\D/g, '');
}

export function resolveManifestIdentifiers(manifest) {
  const externalReference = manifest?.externalReference || manifest?.externalSnapshot || {};
  const externalSnapshot = manifest?.externalSnapshot || {};
  // As linhas da LISTAGEM (mapManifestListItem) vêm achatadas (manifestNumber/
  // externalCode) — sem o fallback, a baixa em lote perdia manNumero/manCodigo
  // e a busca CETESB por número (server-side) nunca era usada.
  return {
    manCodigo: externalReference?.manCodigo ?? externalSnapshot?.manCodigo ?? manifest?.externalCode ?? null,
    manNumero: externalReference?.manNumero ?? externalSnapshot?.manNumero ?? manifest?.manifestNumber ?? null,
    manHashCode: manifest?.externalHashCode || externalSnapshot?.manHashCode || null
  };
}

export function resolveManifestSnapshot(manifest) {
  if (!manifest) {
    return null;
  }
  const identifiers = resolveManifestIdentifiers(manifest);
  const generatorDocument = normalizeDocument(manifest?.generator?.document);
  return {
    ...identifiers,
    parceiroGerador: generatorDocument ? { parCnpj: generatorDocument } : undefined
  };
}

export function buildFriendlyCancelFailureMessage(job, manifestLabel) {
  const code = String(job?.lastErrorCode || '').trim().toUpperCase();
  const reason = String(job?.lastErrorMessage || '').trim();
  if (code === 'MANIFEST_CANCEL_NOT_CONFIRMED') {
    return `Cancelamento solicitado para ${manifestLabel}, mas a CETESB ainda não confirmou a alteração. O manifesto permanece com o status anterior no SIGOR.`;
  }
  if (code === 'MANIFEST_NOT_READY_FOR_CANCEL') {
    return `O manifesto ${manifestLabel} ainda não está pronto para cancelamento na CETESB. Tente novamente em alguns instantes.`;
  }
  return reason || `Cancelamento finalizado com status ${String(job?.status || '').toLowerCase()} para ${manifestLabel}.`;
}

export function triggerBrowserDownload(blob, fileName) {
  const blobUrl = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = blobUrl;
  anchor.download = fileName || 'manifesto.pdf';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(blobUrl);
}

export function sanitizeDownloadFileName(fileName, fallbackName = 'manifesto.pdf') {
  const normalized = String(fileName || '').trim();
  const safeName = normalized || fallbackName;
  return safeName.replaceAll(/[\\/:*?"<>|]+/g, '-');
}

export function getManifestDisplayCode(manifest) {
  return String(
    manifest?.manifestNumber
    || manifest?.externalCode
    || resolveManifestIdentifier(manifest)
    || ''
  ).trim();
}

export function buildBatchPrintZipFileName(printableManifests) {
  const manifests = Array.isArray(printableManifests) ? printableManifests : [];
  const total = manifests.length;
  const stamp = new Date().toISOString().slice(0, 10);
  const manifestCodes = manifests
    .map((manifest) => getManifestDisplayCode(manifest))
    .filter(Boolean);

  const uniqueGroupIds = [...new Set(manifests.map((manifest) => String(manifest?.groupId || '').trim()).filter(Boolean))];
  const hasSingleBatchGroup = uniqueGroupIds.length === 1 && total > 1;

  if (manifestCodes.length >= 2) {
    const firstCode = manifestCodes[0];
    const lastCode = manifestCodes[manifestCodes.length - 1];
    const prefix = hasSingleBatchGroup ? 'lote-manifestos' : 'manifestos';
    return sanitizeDownloadFileName(`${prefix}-${firstCode}-a-${lastCode}-${stamp}.zip`, `manifestos-${total}-itens-${stamp}.zip`);
  }

  if (manifestCodes.length === 1) {
    const prefix = hasSingleBatchGroup ? 'lote-manifesto' : 'manifesto';
    return sanitizeDownloadFileName(`${prefix}-${manifestCodes[0]}-${stamp}.zip`, `manifestos-${total}-itens-${stamp}.zip`);
  }

  if (hasSingleBatchGroup) {
    return `lote-manifestos-${total || 0}-itens-${stamp}.zip`;
  }

  return `manifestos-${total || 0}-itens-${stamp}.zip`;
}

export function parsePrintUrl(printUrl) {
  const match = String(printUrl || '').match(/^\/v1\/manifestos\/([^/]+)\/documents\/([^/]+)$/);
  if (!match) {
    return null;
  }
  return {
    manifestId: decodeURIComponent(match[1]),
    documentId: decodeURIComponent(match[2])
  };
}

export function normalizedStatusValue(manifest) {
  return `${String(manifest?.status || '').toLowerCase()} ${String(manifest?.externalStatus || '').toLowerCase()}`.trim();
}

export function hasIssuedCdfReference(manifest) {
  const externalSnapshot = manifest?.externalSnapshot || {};
  const externalReference = manifest?.externalReference || {};
  return [
    manifest?.cdfEmitidoNumero,
    externalSnapshot?.cdfEmitidoNumero,
    externalReference?.cdfEmitidoNumero,
    manifest?.certificateCode,
    manifest?.certificateId
  ].some((value) => String(value ?? '').trim());
}

export function resolveManifestIdentifier(manifest) {
  return String(
    manifest?.id
    || manifest?.manifestId
    || manifest?.entityId
    || manifest?.manifestNumber
    || manifest?.externalCode
    || ''
  ).trim();
}

export function isCancelledStatus(manifest) {
  return normalizedStatusValue(manifest).includes('cancel');
}

export function isErrorManifest(manifest) {
  const status = String(manifest?.status || '').toLowerCase();
  const externalStatus = String(manifest?.externalStatus || '').toLowerCase();
  const combinedStatus = `${status} ${externalStatus}`;
  return combinedStatus.includes('fail')
    || combinedStatus.includes('error')
    || combinedStatus.includes('falha')
    || combinedStatus.includes('erro')
    || combinedStatus.includes('dlq');
}

export function canCancelManifest(manifest) {
  if (!resolveManifestIdentifier(manifest)) {
    return false;
  }
  const hasExternalHash = Boolean(String(manifest?.externalHashCode || '').trim());
  if (!hasExternalHash) {
    return false;
  }
  const status = normalizedStatusValue(manifest);
  if (!status) {
    return false;
  }
  if (
    status.includes('draft')
    || status.includes('queue')
    || status.includes('process')
    || status.includes('cancel')
    || status.includes('fail')
    || status.includes('error')
  ) {
    return false;
  }
  return status.includes('submit') || status.includes('print') || status.includes('success');
}

export function canRecoverManifest(manifest) {
  const manifestId = resolveManifestIdentifier(manifest);
  if (!manifestId) {
    return false;
  }
  const isRecoverableStatus = isErrorManifest(manifest);
  const hasExternalNumber = Boolean(String(manifest?.manifestNumber || '').trim());
  const hasExternalCode = Boolean(String(manifest?.externalCode || '').trim());
  return isRecoverableStatus && !hasExternalNumber && !hasExternalCode;
}

export function canSubmitManifest(manifest) {
  if (!resolveManifestIdentifier(manifest)) {
    return false;
  }
  if (canRecoverManifest(manifest)) {
    return false;
  }
  const hasExternalHash = Boolean(String(manifest?.externalHashCode || '').trim());
  if (hasExternalHash) {
    return false;
  }
  const status = normalizedStatusValue(manifest);
  if (!status) {
    return true;
  }
  return status.includes('draft') || status.includes('pending_submission');
}

export function canReplicateManifest(manifest) {
  const manifestId = resolveManifestIdentifier(manifest);
  if (!manifestId) {
    return false;
  }
  const status = normalizedStatusValue(manifest);
  if (!status) {
    return true;
  }
  return !['queue', 'process', 'cancel', 'fail', 'error', 'dlq'].some((fragment) => status.includes(fragment));
}

export function canReceiveOperationalManifest(manifest) {
  const snapshot = resolveManifestSnapshot(manifest);
  if (!snapshot || !(snapshot.manCodigo || snapshot.manNumero || snapshot.manHashCode)) {
    return false;
  }
  const status = normalizedStatusValue(manifest);
  if (!status) {
    return true;
  }
  if (
    status.includes('draft')
    || status.includes('queue')
    || status.includes('process')
    || status.includes('cancel')
    || status.includes('receb')
    || status.includes('fail')
    || status.includes('error')
    || status.includes('dlq')
  ) {
    return false;
  }
  return true;
}

export function canUseManifestForCdf(manifest) {
  const snapshot = resolveManifestSnapshot(manifest);
  if (!snapshot || !(snapshot.manCodigo || snapshot.manNumero || snapshot.manHashCode)) {
    return false;
  }
  const status = normalizedStatusValue(manifest);
  if (!status) {
    return false;
  }
  return status.includes('receb')
    && !hasIssuedCdfReference(manifest)
    && !status.includes('cancel')
    && !status.includes('fail')
    && !status.includes('error')
    && !status.includes('dlq');
}

export function canPrintManifest(manifest) {
  if (!resolveManifestIdentifier(manifest)) {
    return false;
  }
  const hasExternalHash = Boolean(String(manifest?.externalHashCode || '').trim());
  if (!hasExternalHash) {
    return false;
  }
  const status = normalizedStatusValue(manifest);
  if (!status) {
    return false;
  }
  if (
    status.includes('draft')
    || status.includes('queue')
    || status.includes('process')
    || status.includes('error')
    || status.includes('fail')
  ) {
    return false;
  }
  return status.includes('submit') || status.includes('print') || status.includes('success') || status.includes('cancel');
}

export function canRemoveManifest(manifest) {
  return Boolean(resolveManifestIdentifier(manifest)) && isErrorManifest(manifest);
}

export function describeCdfManifestRestriction(manifest) {
  const snapshot = resolveManifestSnapshot(manifest);
  if (!snapshot || !(snapshot.manCodigo || snapshot.manNumero || snapshot.manHashCode)) {
    return 'Sem identificadores CETESB para CDF.';
  }
  const status = normalizedStatusValue(manifest);
  if (hasIssuedCdfReference(manifest)) {
    return 'Manifesto ja associado a CDF emitido.';
  }
  if (status.includes('cancel')) {
    return 'Manifesto cancelado.';
  }
  if (status.includes('fail') || status.includes('error') || status.includes('dlq')) {
    return 'Manifesto com falha operacional.';
  }
  if (!status.includes('receb')) {
    return 'Aguardando recebimento confirmado.';
  }
  return 'Manifesto indisponivel para CDF.';
}

export function describeReceiveManifestRestriction(manifest) {
  const snapshot = resolveManifestSnapshot(manifest);
  if (!snapshot || !(snapshot.manCodigo || snapshot.manNumero || snapshot.manHashCode)) {
    return 'Sem identificadores CETESB para recebimento.';
  }
  const status = normalizedStatusValue(manifest);
  if (status.includes('receb')) {
    return 'Manifesto ja recebido.';
  }
  if (status.includes('cancel')) {
    return 'Manifesto cancelado.';
  }
  if (status.includes('fail') || status.includes('error') || status.includes('dlq')) {
    return 'Manifesto com falha operacional.';
  }
  if (status.includes('draft') || status.includes('queue') || status.includes('process')) {
    return 'Manifesto ainda nao esta estavel para recebimento.';
  }
  return 'Manifesto indisponivel para recebimento.';
}

export function formatDate(value) {
  return formatDateBr(value);
}

export function formatManifestBatchLabel(manifest) {
  const batchSize = Number(manifest?.batchSize || 0);
  const batchIndex = Number(manifest?.batchIndex || 0);
  if (Number.isInteger(batchSize) && batchSize > 1) {
    const safeIndex = Number.isInteger(batchIndex) && batchIndex > 0 ? batchIndex : 1;
    return `Lote ${safeIndex} de ${batchSize}`;
  }
  return 'Criado em lote';
}

export function formatPartnerLabel(partner) {
  const description = String(partner?.description || '').trim();
  const partnerCode = String(partner?.partnerCode || '').trim();
  if (!description && !partnerCode) {
    return '-';
  }
  if (/^\d{11,14}$/.test(description)) {
    return partnerCode ? `CNPJ/CPF ${description} (cód. ${partnerCode})` : `CNPJ/CPF ${description}`;
  }
  if (description) {
    return description;
  }
  return `Código ${partnerCode}`;
}

export function formatManifestLabel(manifest) {
  return String(manifest?.manifestNumber || manifest?.externalCode || resolveManifestIdentifier(manifest) || 'manifesto').trim();
}

export function formatDateTime(value) {
  if (!value) return 'Não informado';
  return formatDateTimeBr(value);
}
