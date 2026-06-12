<script setup>
import JSZip from 'jszip';
import { computed, onMounted, onUnmounted, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import ConfirmDialog from '../components/sicat/SicatConfirmDialog.vue';
import SicatDateInput from '../components/shared/inputs/SicatDateInput.vue';
import SicatPageLayout from '../components/sicat/SicatPageLayout.vue';
import SicatPageHeader from '../components/shell/SicatPageHeader.vue';
import SicatStatusBadge from '../components/sicat/SicatStatusBadge.vue';
import { useConfirmDialog } from '../composables/useConfirmDialog.js';
import { batchCancelManifests, batchSubmitManifests, cancelManifest, downloadManifestDocument, enqueueManifestReceive, getCatalog, getJobById, getManifestById, getReceiptResponsibles, printManifest, removeManifest, replicateManifest, submitManifest, syncManifests } from '../services/api.js';
import { useAuthStore } from '../stores/auth.js';
import { useManifestsStore } from '../stores/manifests.js';
import { brDateToIsoDate, getTodayBr, isoDateToBrDate, normalizeBrDateInput } from '../utils/date-format.js';
import { evaluateDateRange } from '../utils/date-range-validation.js';
import {
  buildBatchPrintZipFileName,
  buildFriendlyCancelFailureMessage,
  canCancelManifest,
  canPrintManifest,
  canReceiveOperationalManifest,
  canRecoverManifest,
  canRemoveManifest,
  canReplicateManifest,
  canSubmitManifest,
  canUseManifestForCdf,
  describeCdfManifestRestriction,
  describeReceiveManifestRestriction,
  formatDate,
  formatDateTime,
  formatManifestBatchLabel,
  formatManifestLabel,
  formatPartnerLabel,
  isCancelledStatus,
  isErrorManifest,
  normalizedStatusValue,
  parsePrintUrl,
  resolveManifestIdentifier,
  resolveManifestSnapshot,
  resolveManifestStatusLabel,
  sanitizeDownloadFileName,
  sleep,
  toIntegerOrNull,
  triggerBrowserDownload
} from '../features/mtr/list/manifestHelpers.js';

const router = useRouter();
const route = useRoute();
const store = useManifestsStore();
const authStore = useAuthStore();
const {
  dialogVisible,
  dialogTitle,
  dialogMessage,
  dialogConfirmLabel,
  dialogCancelLabel,
  dialogDanger,
  dialogShowCancel,
  confirm,
  accept,
  cancel
} = useConfirmDialog();

const {
  filters,
  items,
  page,
  totalPages,
  totalItems,
  loadingList,
  error,
  syncWarning,
  syncWarningMeta,
  search,
  changePage,
  syncWithActiveOperationalContext
} = store;

const pageDescription = computed(() => {
  const start = items.value.length ? (Number(page.value) - 1) * Number(filters.pageSize) + 1 : 0;
  const end = items.value.length ? start + items.value.length - 1 : 0;
  return { start, end };
});

const canGoPreviousPage = computed(() => Number(page.value) > 1 && !loadingList.value);
const canGoNextPage = computed(() => {
  if (loadingList.value) {
    return false;
  }

  if (Number(totalPages.value) > 0) {
    return Number(page.value) < Number(totalPages.value);
  }

  return items.value.length >= Number(filters.pageSize || 20);
});

const cancelModalVisible = ref(false);
const cancelReason = ref('');
const targetManifest = ref(null);
const cancelLoading = ref(false);
const cancelFeedback = ref('');
const cancelFeedbackError = ref('');
const cancelMonitoring = ref(false);
const recoverLoadingManifestId = ref('');
const submitLoadingManifestId = ref('');
const printLoadingManifestId = ref('');
const removeLoadingManifestId = ref('');
const cacheWarningModalVisible = ref(false);
const selectedManifestIds = ref([]);
const batchSubmitLoading = ref(false);
const batchCancelModalVisible = ref(false);
const batchCancelReason = ref('');
const batchCancelLoading = ref(false);
const batchPrintLoading = ref(false);
const receiveModalVisible = ref(false);
const receiveModalMode = ref('single');
const receiveModalTargetManifest = ref(null);
const receiveModalLoading = ref(false);
const replicateModalVisible = ref(false);
const replicateCount = ref(2);
const replicateLoading = ref(false);
const replicateTargetManifest = ref(null);
const dateFromFieldRef = ref(null);
const dateToFieldRef = ref(null);
const dateRangeHoverIso = ref('');
const dateFilterError = ref('');
const dateFilterInfo = ref('');
const operationalFeedback = ref('');
const operationalFeedbackError = ref('');
let cancelMonitorToken = 0;
const TERMINAL_JOB_STATUSES = new Set(['succeeded', 'failed', 'cancelled', 'dlq']);
const DATE_WINDOW_NOTICE_DAYS = 31;

function normalizeDateFilterInputs() {
  filters.dateFrom = normalizeBrDateInput(filters.dateFrom);
  filters.dateTo = normalizeBrDateInput(filters.dateTo);
}

function normalizeReceiverDateWindow() {
  normalizeDateFilterInputs();

  if (!isReceiverOperationalMode.value) {
    return;
  }

  const fromIso = brDateToIsoDate(filters.dateFrom);
  const toIso = brDateToIsoDate(filters.dateTo);
  const fallbackBr = getTodayBr();

  if (!fromIso && !toIso) {
    filters.dateFrom = fallbackBr;
    filters.dateTo = fallbackBr;
    return;
  }

  if (fromIso && !toIso) {
    filters.dateTo = isoDateToBrDate(fromIso) || fallbackBr;
    return;
  }

  if (!fromIso && toIso) {
    filters.dateFrom = isoDateToBrDate(toIso) || fallbackBr;
    return;
  }

  // Conta destinador agora aceita INTERVALO (range): o backend segmenta a busca
  // dia a dia na CETESB (DL-075, cetesb-gateway shouldSplitByDay), respeitando o
  // limite por dia do portal. Não forçamos mais data inicial = data final.
}

const receiveForm = reactive({
  receivedAt: new Date().toISOString().slice(0, 10),
  observation: '',
  printReceiptAfterReceive: true
});

// Responsável pelo recebimento (selecionado a partir da lista do SIGOR, com nome+cargo).
const selectedResponsible = ref(null);
const responsibleModalVisible = ref(false);
const responsiblesList = ref([]);
const responsiblesLoading = ref(false);
const responsiblesError = ref('');
// Resíduos editáveis do recebimento (Recebida/Tratamento/Justificativa por linha).
const receiveResidues = ref([]);
const receiveResiduesLoading = ref(false);
const treatmentOptions = ref([]);

const cacheWarningDetails = computed(() => {
  const meta = syncWarningMeta.value || null;
  return {
    remoteStatus: Number(meta?.remoteStatus || 0) || null,
    fallbackAt: meta?.fallbackAt || null
  };
});

const visibleSelectableManifestIds = computed(() => items.value
  .filter((manifest) => canBatchSelectManifest(manifest))
  .map((manifest) => resolveManifestIdentifier(manifest))
  .filter(Boolean));

const allVisibleSelected = computed(() => {
  const visibleIds = visibleSelectableManifestIds.value;
  return visibleIds.length > 0 && visibleIds.every((id) => selectedManifestIds.value.includes(id));
});

const selectedManifestCount = computed(() => selectedManifestIds.value.length);
const selectedSubmittableManifestIds = computed(() => items.value
  .filter((manifest) => selectedManifestIds.value.includes(resolveManifestIdentifier(manifest)))
  .filter((manifest) => canSubmitManifest(manifest))
  .map((manifest) => resolveManifestIdentifier(manifest))
  .filter(Boolean));
const selectedCancelableManifestIds = computed(() => items.value
  .filter((manifest) => selectedManifestIds.value.includes(resolveManifestIdentifier(manifest)))
  .filter((manifest) => canCancelManifest(manifest))
  .map((manifest) => resolveManifestIdentifier(manifest))
  .filter(Boolean));
const selectedPrintableManifests = computed(() => items.value
  .filter((manifest) => selectedManifestIds.value.includes(resolveManifestIdentifier(manifest)))
  .filter((manifest) => canPrintManifest(manifest)));
const activeAccount = computed(() => authStore.activeAccount.value || null);
const isReceiverOperationalMode = computed(() => String(activeAccount.value?.accountType || '').toLowerCase() === 'receiver');
const receiverOperationalSelection = computed(() => items.value
  .filter((manifest) => selectedManifestIds.value.includes(resolveManifestIdentifier(manifest))));
const selectedReceivableManifests = computed(() => receiverOperationalSelection.value.filter((manifest) => canReceiveOperationalManifest(manifest)));
const selectedCdfCandidateManifests = computed(() => receiverOperationalSelection.value.filter((manifest) => canUseManifestForCdf(manifest)));
const receiveModalManifests = computed(() => {
  if (receiveModalMode.value === 'single') {
    return receiveModalTargetManifest.value ? [receiveModalTargetManifest.value] : [];
  }

  return receiverOperationalSelection.value;
});
const receiveEligibleManifests = computed(() => receiveModalManifests.value.filter((manifest) => canReceiveOperationalManifest(manifest)));
const receiveBlockedManifestEntries = computed(() => receiveModalManifests.value
  .filter((manifest) => !canReceiveOperationalManifest(manifest))
  .map((manifest) => ({ manifest, reason: describeReceiveManifestRestriction(manifest) })));

watch(items, (nextItems) => {
  const validIds = new Set((Array.isArray(nextItems) ? nextItems : [])
    .map((manifest) => resolveManifestIdentifier(manifest))
    .filter(Boolean));
  selectedManifestIds.value = selectedManifestIds.value.filter((id) => validIds.has(id));
});

function clearOperationalFeedback() {
  operationalFeedback.value = '';
  operationalFeedbackError.value = '';
}

async function monitorCancelJob(jobId, manifestLabel) {
  const localToken = ++cancelMonitorToken;
  cancelMonitoring.value = true;

  const startedAt = Date.now();
  const timeoutMs = 90_000;
  const intervalMs = 2_500;

  try {
    while ((Date.now() - startedAt) < timeoutMs && localToken === cancelMonitorToken) {
      const job = await getJobById(jobId);
      const status = String(job?.status || '').toLowerCase();

      if (!TERMINAL_JOB_STATUSES.has(status)) {
        await sleep(intervalMs);
        continue;
      }

      await search();

      if (status === 'succeeded') {
        cancelFeedbackError.value = '';
        cancelFeedback.value = `Cancelamento concluído para ${manifestLabel}.`;
      } else {
        cancelFeedbackError.value = buildFriendlyCancelFailureMessage(job, manifestLabel);
      }
      return;
    }
  } catch {
    return;
  } finally {
    if (localToken === cancelMonitorToken) {
      cancelMonitoring.value = false;
    }
  }
}

async function resolveDocumentFromManifest(manifestId) {
  const detail = await getManifestById(manifestId);
  const documents = Array.isArray(detail?.documents) ? detail.documents : [];
  const preferred = documents.find((doc) => String(doc?.type || '').toLowerCase() === 'manifest_pdf') || documents[0] || null;
  if (!preferred?.id) {
    return null;
  }

  return {
    manifestId,
    documentId: preferred.id,
    manifestNumber: String(detail?.manifestNumber || detail?.externalReference?.manNumero || '').trim() || null
  };
}

async function waitForPrintJobAndFetchFile(jobId, manifestId, manifestNumberHint = null) {
  const startedAt = Date.now();
  const timeoutMs = 60_000;
  const intervalMs = 2_500;

  while ((Date.now() - startedAt) < timeoutMs) {
    const job = await getJobById(jobId);
    const status = String(job?.status || '').toLowerCase();

    if (status === 'failed') {
      throw new Error(job?.lastErrorMessage || `Falha no job de impressão (${jobId}).`);
    }

    if (status === 'succeeded') {
      const parsedFromJob = parsePrintUrl(job?.result?.printUrl || '');
      const parsed = parsedFromJob || await resolveDocumentFromManifest(manifestId);

      if (!parsed) {
        throw new Error('Impressão concluída, mas documento não foi localizado para download.');
      }

      const preferredManifestNumber = String(
        parsed?.manifestNumber
        || manifestNumberHint
        || ''
      ).trim();

      const file = await downloadManifestDocument(parsed.manifestId, parsed.documentId, {
        preferredManifestNumber: preferredManifestNumber || undefined
      });
      return {
        ...file,
        fileName: sanitizeDownloadFileName(file.fileName, `manifesto-${preferredManifestNumber || manifestId}.pdf`)
      };
    }

    await sleep(intervalMs);
  }

  throw new Error('Tempo esgotado aguardando conclusão da impressão.');
}

async function waitForPrintJobAndDownload(jobId, manifestId, manifestNumberHint = null) {
  const file = await waitForPrintJobAndFetchFile(jobId, manifestId, manifestNumberHint);
  if (!file?.blob) {
    throw new Error('Falha ao obter o PDF do manifesto para download.');
  }

  triggerBrowserDownload(file.blob, file.fileName);
  return file;
}

async function requestManifestPrintFile(manifest) {
  const manifestId = resolveManifestIdentifier(manifest);
  if (!manifestId || !canPrintManifest(manifest)) {
    return null;
  }

  const requestedBy = buildRequestedBy();
  const response = await printManifest(manifestId, {
    requestedBy,
    documentType: 'manifest_pdf',
    regenerateIfMissing: true
  });

  return waitForPrintJobAndFetchFile(response.jobId, manifestId, manifest?.manifestNumber || null);
}

const canBatchSelectManifest = (manifest) => {
  if (isReceiverOperationalMode.value) {
    return canReceiveOperationalManifest(manifest)
      || canUseManifestForCdf(manifest)
      || canCancelManifest(manifest)
      || canPrintManifest(manifest)
      || canRemoveManifest(manifest);
  }

  return canSubmitManifest(manifest) || canCancelManifest(manifest) || canPrintManifest(manifest);
};

function getIsoDateFieldValue(field) {
  return brDateToIsoDate(filters[field]) || '';
}

function setIsoDateFieldValue(field, isoValue) {
  filters[field] = isoDateToBrDate(isoValue) || '';
}

function updateDateFilterFeedback(options = {}) {
  const { showWideWindowInfo = true } = options;

  normalizeDateFilterInputs();

  const validation = evaluateDateRange({
    dateFrom: filters.dateFrom,
    dateTo: filters.dateTo,
    fromLabel: 'Data inicial',
    toLabel: 'Data final'
  });

  if (!validation.isValid) {
    dateFilterError.value = validation.errorMessage;
    dateFilterInfo.value = '';
    return false;
  }

  dateFilterError.value = '';

  if (showWideWindowInfo && Number.isFinite(Number(validation.spanDays)) && Number(validation.spanDays) > DATE_WINDOW_NOTICE_DAYS) {
    dateFilterInfo.value = 'O período escolhido é longo e a CETESB pode limitar a resposta. Se a busca voltar vazia ou incompleta, divida em recortes de até 2 semanas (ex.: 01/01–14/01 e depois 15/01–31/01).';
    return true;
  }

  dateFilterInfo.value = '';
  return true;
}

function syncDateFilterRange() {
  updateDateFilterFeedback({ showWideWindowInfo: false });
}

function onDateFieldCommit(field, nextValue) {
  filters[field] = normalizeBrDateInput(nextValue);
  syncDateFilterRange();
}

function handleDateRangeHover(isoValue) {
  dateRangeHoverIso.value = String(isoValue || '').trim();
}

function handleDatePicked(field, payload) {
  const pickedValue = typeof payload === 'string' ? payload : String(payload?.value || '');
  const pickedIso = typeof payload === 'string' ? brDateToIsoDate(payload) : String(payload?.iso || '').trim();
  onDateFieldCommit(field, pickedValue);

  const fromIso = brDateToIsoDate(filters.dateFrom);
  const toIso = brDateToIsoDate(filters.dateTo);

  if (!pickedIso) {
    return;
  }

  if (field === 'dateFrom' && fromIso && !toIso) {
    dateToFieldRef.value?.openPicker?.();
    return;
  }

  if (field === 'dateTo' && toIso && !fromIso) {
    dateFromFieldRef.value?.openPicker?.();
  }
}

function openCacheWarningModal() {
  if (!syncWarning.value) {
    return;
  }

  cacheWarningModalVisible.value = true;
}

function closeCacheWarningModal() {
  cacheWarningModalVisible.value = false;
}

function handleGlobalKeydown(event) {
  if (event?.key !== 'Escape') {
    return;
  }

  if (cancelModalVisible.value) {
    closeCancelModal();
    return;
  }

  if (receiveModalVisible.value) {
    closeReceiveModal();
    return;
  }

  if (cacheWarningModalVisible.value) {
    closeCacheWarningModal();
  }
}

async function applyFilters(event) {
  event?.preventDefault?.();
  filters.page = 1;
  normalizeReceiverDateWindow();
  if (!updateDateFilterFeedback()) {
    return;
  }
  await search();
}

async function clearFilters() {
  const today = getTodayBr();
  filters.status = '';
  filters.groupId = '';
  filters.manifestNumber = '';
  filters.carrierQuery = '';
  filters.receiverQuery = '';
  filters.dateFrom = today;
  filters.dateTo = today;
  filters.page = 1;
  updateDateFilterFeedback({ showWideWindowInfo: false });
  await search();
}

function openManifest(id) {
  router.push(`/manifestos/${id}`);
}

function openManifestFromRow(manifest) {
  const manifestId = resolveManifestIdentifier(manifest);
  if (!manifestId) {
    return;
  }

  openManifest(manifestId);
}

// CDF agora vive 100% na tela dedicada (/cdf/novo). Aqui apenas redirecionamos levando a seleção.
function goToCdfFlowForManifest(manifest) {
  const manifestId = resolveManifestIdentifier(manifest);
  if (!manifestId) {
    return;
  }

  router.push({ path: '/cdf/novo', query: { manifestId } });
}

function goToCdfFlowFromSelection() {
  const manifestIds = selectedCdfCandidateManifests.value
    .map((manifest) => resolveManifestIdentifier(manifest))
    .filter(Boolean);

  if (!manifestIds.length) {
    operationalFeedbackError.value = receiverOperationalSelection.value.length
      ? 'Selecione ao menos um manifesto recebido e sem CDF emitido para gerar o CDF.'
      : 'Selecione ao menos um manifesto para gerar o CDF.';
    operationalFeedback.value = '';
    return;
  }

  router.push({ path: '/cdf/novo', query: { manifestIds: manifestIds.join(',') } });
}

function buildRequestedBy() {
  const userEmailPrefix = String(authStore.user.value?.email || '').trim().split('@')[0];
  if (userEmailPrefix) {
    return userEmailPrefix;
  }

  const userName = String(authStore.user.value?.name || '').trim().toLowerCase().replaceAll(/\s+/g, '.');
  return userName || 'frontend.user';
}

function isManifestSelected(manifest) {
  const manifestId = resolveManifestIdentifier(manifest);
  return Boolean(manifestId) && selectedManifestIds.value.includes(manifestId);
}

function toggleManifestSelection(manifest) {
  if (!canBatchSelectManifest(manifest)) {
    return;
  }

  const manifestId = resolveManifestIdentifier(manifest);
  if (!manifestId) {
    return;
  }

  if (selectedManifestIds.value.includes(manifestId)) {
    selectedManifestIds.value = selectedManifestIds.value.filter((id) => id !== manifestId);
    return;
  }

  selectedManifestIds.value = [...selectedManifestIds.value, manifestId];
}

function toggleSelectAllVisible() {
  const visibleIds = visibleSelectableManifestIds.value;
  if (visibleIds.length === 0) {
    return;
  }

  if (allVisibleSelected.value) {
    selectedManifestIds.value = selectedManifestIds.value.filter((id) => !visibleIds.includes(id));
    return;
  }

  selectedManifestIds.value = Array.from(new Set([...selectedManifestIds.value, ...visibleIds]));
}

function clearManifestSelection() {
  selectedManifestIds.value = [];
}

function resetReceiveForm() {
  receiveForm.receivedAt = new Date().toISOString().slice(0, 10);
  receiveForm.observation = '';
  receiveForm.printReceiptAfterReceive = true;
  selectedResponsible.value = null;
  receiveResidues.value = [];
}

async function loadTreatmentOptions() {
  if (treatmentOptions.value.length) {
    return;
  }
  try {
    const response = await getCatalog('residueTreatments', { pageSize: 500 });
    const items = Array.isArray(response?.items) ? response.items : [];
    treatmentOptions.value = items
      .map((item) => {
        const code = item.code ?? item.traCodigo ?? item.id ?? null;
        const title = item.description ?? item.traDescricao ?? item.name ?? String(code ?? '');
        return code == null ? null : { value: code, title };
      })
      .filter(Boolean);
  } catch {
    treatmentOptions.value = [];
  }
}

async function loadReceiveResidues(manifest) {
  receiveResidues.value = [];
  const manifestId = manifest?.id || resolveManifestIdentifier(manifest);
  if (!manifestId) {
    return;
  }
  receiveResiduesLoading.value = true;
  try {
    const detail = await getManifestById(manifestId);
    const residues = Array.isArray(detail?.residues) ? detail.residues : [];
    receiveResidues.value = residues.map((residue, index) => ({
      lineNumber: residue.lineNumber ?? (index + 1),
      residueCode: residue.residue?.code ?? null,
      residueIbamaCode: residue.residue?.ibamaCode ?? null,
      residueDescription: residue.residue?.description ?? '-',
      unitSymbol: residue.unit?.symbol || residue.unit?.description || '',
      quantity: residue.quantity ?? null,
      receivedQuantity: residue.receivedQuantity ?? residue.quantity ?? 0,
      treatmentCode: residue.treatment?.code ?? null,
      treatmentDescription: residue.treatment?.description ?? '',
      justification: ''
    }));
  } catch {
    receiveResidues.value = [];
  } finally {
    receiveResiduesLoading.value = false;
  }
}

async function openResponsibleModal() {
  responsibleModalVisible.value = true;
  responsiblesError.value = '';
  if (responsiblesList.value.length) {
    return;
  }
  responsiblesLoading.value = true;
  try {
    const integrationAccountId = String(authStore.integrationAccountId.value || '').trim();
    const sessionContextId = String(authStore.sessionContext.value?.id || authStore.sessionContext.value?.sessionContextId || '').trim();
    const response = await getReceiptResponsibles({ integrationAccountId, sessionContextId });
    responsiblesList.value = Array.isArray(response?.items) ? response.items : [];
  } catch (error) {
    responsiblesError.value = error?.message || 'Falha ao carregar responsáveis pelo recebimento.';
    responsiblesList.value = [];
  } finally {
    responsiblesLoading.value = false;
  }
}

function selectResponsible(item) {
  selectedResponsible.value = item || null;
  responsibleModalVisible.value = false;
}

function openReceiveModal(manifest = null) {
  receiveModalMode.value = manifest ? 'single' : 'batch';
  receiveModalTargetManifest.value = manifest;
  receiveModalVisible.value = true;
  receiveModalLoading.value = false;
  resetReceiveForm();
  clearOperationalFeedback();
  loadTreatmentOptions();
  if (manifest) {
    loadReceiveResidues(manifest);
  }
}

function closeReceiveModal(options = {}) {
  if (receiveModalLoading.value && !options.force) {
    return;
  }

  receiveModalVisible.value = false;
  receiveModalTargetManifest.value = null;
  receiveResidues.value = [];
}

async function resolveReceiveOperationalContext() {
  const ready = await authStore.ensureSessionContextReady();
  const integrationAccountId = String(authStore.integrationAccountId.value || '').trim();
  const sessionContextId = String(authStore.sessionContext.value?.id || authStore.sessionContext.value?.sessionContextId || '').trim();
  if (!ready || !integrationAccountId || !sessionContextId) {
    throw new Error('Contexto operacional incompleto. Atualize a sessao CETESB antes de continuar.');
  }

  return { integrationAccountId, sessionContextId };
}

function resolveReceiptDateIso(dateValue) {
  const iso = String(dateValue || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    return null;
  }
  // Meio-dia evita deslocamento de dia por fuso ao converter para ISO.
  const parsed = new Date(`${iso}T12:00:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function toReceivedNumber(value) {
  if (value == null || value === '') {
    return null;
  }
  const numeric = Number(String(value).replace(',', '.'));
  return Number.isFinite(numeric) ? numeric : null;
}

function resolveReceiveRequestBase() {
  const responsibleCode = toIntegerOrNull(selectedResponsible.value?.rrmCodigo);
  if (!responsibleCode) {
    throw new Error('Selecione o responsável pelo recebimento.');
  }

  const remDataRecebimento = resolveReceiptDateIso(receiveForm.receivedAt);
  if (!remDataRecebimento) {
    throw new Error('Informe uma data válida para o recebimento.');
  }

  const remObservacao = String(receiveForm.observation || '').trim() || undefined;
  return { responsibleCode, remDataRecebimento, remObservacao };
}

function resolveReceiverPartnerCode(manifest) {
  return toIntegerOrNull(activeAccount.value?.partnerCode) || toIntegerOrNull(manifest?.receiver?.partnerCode);
}

async function enqueueReceiveForManifest(manifest, context, requestBase, requestedBy) {
  const receiverPartnerCode = resolveReceiverPartnerCode(manifest);
  if (!receiverPartnerCode) {
    throw new Error('destinador ativo nao identificado.');
  }

  const accepted = await enqueueManifestReceive({
    integrationAccountId: context.integrationAccountId,
    sessionContextId: context.sessionContextId,
    requestedBy,
    printReceiptAfterReceive: receiveForm.printReceiptAfterReceive,
    receiptPayload: {
      remDataRecebimento: requestBase.remDataRecebimento,
      remObservacao: requestBase.remObservacao,
      paaCodigo: receiverPartnerCode,
      rrmCodigo: requestBase.responsibleCode,
      manifesto: buildReceiveManifestPayload(manifest)
    }
  });

  return `${formatManifestLabel(manifest)} -> ${accepted.jobId}`;
}

// Em modo single, envia overrides por resíduo (Recebida/Tratamento/Justificativa) em
// formato CETESB; o backend faz o merge sobre o manifesto remoto (mergeReceiptManifestResidues).
function buildReceiveManifestPayload(manifest) {
  const snapshot = resolveManifestSnapshot(manifest);
  if (receiveModalMode.value !== 'single' || !receiveResidues.value.length) {
    return snapshot;
  }
  return {
    ...snapshot,
    listaManifestoResiduo: receiveResidues.value.map((residue) => {
      const line = {
        marNumeroLinha: residue.lineNumber ?? null,
        residuo: {
          resCodigo: residue.residueCode ?? null,
          resCodigoIbama: residue.residueIbamaCode ?? null
        },
        marQuantidadeRecebida: toReceivedNumber(residue.receivedQuantity),
        marJustificativa: String(residue.justification || '').trim() || null
      };
      if (residue.treatmentCode != null) {
        line.tratamento = {
          traCodigo: residue.treatmentCode,
          traDescricao: residue.treatmentDescription || null
        };
      }
      return line;
    })
  };
}

function buildReceiveSuccessMessage(acceptedCount, blockedCount) {
  let message = `${acceptedCount} recebimento(s) enfileirado(s) com sucesso.`;
  if (blockedCount) {
    message += ` ${blockedCount} manifesto(s) ficaram bloqueados antes do envio.`;
  }
  return message;
}

async function submitReceiveRequests() {
  if (receiveModalLoading.value) {
    return;
  }

  receiveModalLoading.value = true;
  clearOperationalFeedback();

  try {
    if (!receiveEligibleManifests.value.length) {
      throw new Error('Nenhum manifesto elegivel foi selecionado para recebimento.');
    }

    const context = await resolveReceiveOperationalContext();
    const requestBase = resolveReceiveRequestBase();
    const acceptedJobs = [];
    const failedJobs = [];
    const requestedBy = buildRequestedBy();

    for (const manifest of receiveEligibleManifests.value) {
      try {
        acceptedJobs.push(await enqueueReceiveForManifest(manifest, context, requestBase, requestedBy));
      } catch (error) {
        failedJobs.push(`${formatManifestLabel(manifest)}: ${error?.message || 'falha ao enfileirar recebimento.'}`);
      }
    }

    if (acceptedJobs.length) {
      operationalFeedback.value = buildReceiveSuccessMessage(acceptedJobs.length, receiveBlockedManifestEntries.value.length);
      closeReceiveModal({ force: true });
      if (receiveModalMode.value === 'batch') {
        clearManifestSelection();
      }
      await search();
    }

    const blockedMessages = receiveBlockedManifestEntries.value
      .map((entry) => `${formatManifestLabel(entry.manifest)}: ${entry.reason}`);
    const errorMessages = [...blockedMessages, ...failedJobs].filter(Boolean);
    if (errorMessages.length) {
      operationalFeedbackError.value = errorMessages.slice(0, 4).join(' | ');
    }
  } catch (error) {
    operationalFeedbackError.value = error?.message || 'Falha ao solicitar recebimento.';
  } finally {
    receiveModalLoading.value = false;
  }
}

function openCancelModal(manifest) {
  if (!canCancelManifest(manifest)) {
    return;
  }

  targetManifest.value = manifest;
  cancelReason.value = '';
  cancelFeedback.value = '';
  cancelFeedbackError.value = '';
  cancelModalVisible.value = true;
}

async function requestRemoveManifest(manifest) {
  const manifestId = resolveManifestIdentifier(manifest);
  if (!manifestId || !canRemoveManifest(manifest) || removeLoadingManifestId.value === manifestId) {
    return;
  }

  const displayId = manifest?.manifestNumber || manifestId;
  const confirmed = await confirm({
    title: 'Remover manifesto com falha',
    message: `Remover manifesto ${displayId}? Esta ação exclui o registro com falha.`,
    confirmLabel: 'Remover manifesto',
    danger: true
  });
  if (!confirmed) {
    return;
  }

  removeLoadingManifestId.value = manifestId;
  cancelFeedback.value = '';
  cancelFeedbackError.value = '';

  try {
    await removeManifest(manifestId);
    cancelFeedbackError.value = '';
    cancelFeedback.value = `Manifesto ${displayId} removido com sucesso.`;
    await search();
  } catch (err) {
    cancelFeedback.value = '';
    cancelFeedbackError.value = err.message || `Falha ao remover o manifesto ${displayId}.`;
  } finally {
    removeLoadingManifestId.value = '';
  }
}

async function requestRecoverManifest(manifest) {
  const manifestId = resolveManifestIdentifier(manifest);
  if (!manifestId || !canRecoverManifest(manifest)) {
    return;
  }

  const sessionContextId = String(manifest?.sessionContextId || authStore.sessionContext.value?.id || authStore.sessionContext.value?.sessionContextId || '').trim();
  if (!sessionContextId) {
    cancelFeedbackError.value = 'Sessão CETESB indisponível para reenvio. Faça login novamente.';
    return;
  }

  recoverLoadingManifestId.value = manifestId;
  cancelFeedback.value = '';
  cancelFeedbackError.value = '';

  try {
    const requestedBy = buildRequestedBy();
    const response = await submitManifest(manifestId, {
      sessionContextId,
      requestedBy,
      validateOnly: false,
      printAfterSubmit: false
    });

    cancelFeedback.value = `Reenvio enfileirado para ${manifest.manifestNumber || manifestId}. Job: ${response.jobId}.`;
    await search();
  } catch (err) {
    cancelFeedbackError.value = err.message || 'Falha ao reenfileirar envio do manifesto.';
  } finally {
    recoverLoadingManifestId.value = '';
  }
}

async function requestPrintManifest(manifest) {
  const manifestId = resolveManifestIdentifier(manifest);
  if (!manifestId || !canPrintManifest(manifest)) {
    return;
  }

  printLoadingManifestId.value = manifestId;
  cancelFeedback.value = '';
  cancelFeedbackError.value = '';

  try {
    cancelFeedback.value = `Impressão enfileirada para ${manifest.manifestNumber || manifestId}. Aguardando geração do PDF...`;
    const requestedBy = buildRequestedBy();
    const response = await printManifest(manifestId, {
      requestedBy,
      documentType: 'manifest_pdf',
      regenerateIfMissing: true
    });

    await waitForPrintJobAndDownload(response.jobId, manifestId, manifest?.manifestNumber || null);
    cancelFeedback.value = `PDF gerado e download iniciado para ${manifest.manifestNumber || manifestId}. Job: ${response.jobId}.`;
  } catch (err) {
    cancelFeedbackError.value = err.message || 'Falha ao solicitar impressão do manifesto.';
  } finally {
    printLoadingManifestId.value = '';
  }
}

async function requestBatchPrintManifests() {
  if (!selectedPrintableManifests.value.length || batchPrintLoading.value) {
    return;
  }

  batchPrintLoading.value = true;
  cancelFeedback.value = '';
  cancelFeedbackError.value = '';

  try {
    const printableManifests = selectedPrintableManifests.value.slice();
    const zip = new JSZip();
    const usedNames = new Set();
    let processed = 0;

    for (const manifest of printableManifests) {
      cancelFeedback.value = `Gerando PDF ${processed + 1} de ${printableManifests.length}...`;
      const file = await requestManifestPrintFile(manifest);

      if (!file?.blob) {
        throw new Error(`Falha ao obter o PDF do manifesto ${manifest.manifestNumber || resolveManifestIdentifier(manifest)}.`);
      }

      const baseName = sanitizeDownloadFileName(
        file.fileName,
        `manifesto-${manifest.manifestNumber || resolveManifestIdentifier(manifest) || processed + 1}.pdf`
      );
      let finalName = baseName;
      let duplicateIndex = 2;

      while (usedNames.has(finalName)) {
        finalName = baseName.replace(/\.pdf$/i, `-${duplicateIndex}.pdf`);
        duplicateIndex += 1;
      }

      usedNames.add(finalName);
      zip.file(finalName, await file.blob.arrayBuffer());
      processed += 1;
    }

    cancelFeedback.value = `Compactando ${printableManifests.length} PDF(s) em um arquivo ZIP...`;
    const zipBlob = await zip.generateAsync({ type: 'blob' });
    triggerBrowserDownload(zipBlob, buildBatchPrintZipFileName(printableManifests));

    cancelFeedbackError.value = '';
    cancelFeedback.value = `ZIP gerado com ${printableManifests.length} PDF(s). Download iniciado.`;
  } catch (err) {
    cancelFeedbackError.value = err.message || 'Falha ao solicitar impressão em lote.';
  } finally {
    batchPrintLoading.value = false;
  }
}

function closeCancelModal() {
  if (cancelLoading.value) {
    return;
  }

  cancelModalVisible.value = false;
  cancelReason.value = '';
  targetManifest.value = null;
}

function openBatchCancelModal() {
  if (!selectedCancelableManifestIds.value.length) {
    return;
  }

  batchCancelReason.value = '';
  cancelFeedbackError.value = '';
  batchCancelModalVisible.value = true;
}

function closeBatchCancelModal() {
  if (batchCancelLoading.value) {
    return;
  }

  batchCancelModalVisible.value = false;
  batchCancelReason.value = '';
}

async function confirmBatchCancelManifest() {
  if (batchCancelReason.value.trim().length < 3) {
    cancelFeedbackError.value = 'Informe um motivo com pelo menos 3 caracteres.';
    return;
  }

  batchCancelLoading.value = true;
  cancelFeedbackError.value = '';

  try {
    const requestedBy = buildRequestedBy();
    const response = await batchCancelManifests({
      manifestIds: selectedCancelableManifestIds.value,
      requestedBy,
      reason: batchCancelReason.value.trim()
    });

    cancelFeedback.value = `${response.total} cancelamentos enfileirados no grupo ${response.groupId}.`;
    closeBatchCancelModal();
    clearManifestSelection();
    await search();
  } catch (err) {
    cancelFeedbackError.value = err.message || 'Falha ao solicitar cancelamento em lote.';
  } finally {
    batchCancelLoading.value = false;
  }
}

async function requestSubmitManifest(manifest) {
  const manifestId = resolveManifestIdentifier(manifest);
  if (!manifestId || !canSubmitManifest(manifest) || submitLoadingManifestId.value === manifestId) {
    return;
  }

  const sessionContextId = String(manifest?.sessionContextId || authStore.sessionContext.value?.id || authStore.sessionContext.value?.sessionContextId || '').trim();
  if (!sessionContextId) {
    cancelFeedbackError.value = 'Sessão CETESB indisponível para envio. Faça login novamente.';
    return;
  }

  submitLoadingManifestId.value = manifestId;
  cancelFeedback.value = '';
  cancelFeedbackError.value = '';

  try {
    const requestedBy = buildRequestedBy();
    const response = await submitManifest(manifestId, {
      sessionContextId,
      requestedBy,
      validateOnly: false,
      printAfterSubmit: false
    });

    cancelFeedback.value = `Envio enfileirado para ${manifest.manifestNumber || manifestId}. Job: ${response.jobId}.`;
    clearManifestSelection();
    await search();
  } catch (err) {
    cancelFeedbackError.value = err.message || 'Falha ao enfileirar envio do manifesto.';
  } finally {
    submitLoadingManifestId.value = '';
  }
}

async function requestBatchSubmitManifests() {
  if (!selectedSubmittableManifestIds.value.length || batchSubmitLoading.value) {
    return;
  }

  const sessionContextId = String(authStore.sessionContext.value?.id || authStore.sessionContext.value?.sessionContextId || '').trim();
  if (!sessionContextId) {
    cancelFeedbackError.value = 'Sessão CETESB indisponível para envio em lote. Faça login novamente.';
    return;
  }

  batchSubmitLoading.value = true;
  cancelFeedback.value = '';
  cancelFeedbackError.value = '';

  try {
    const requestedBy = buildRequestedBy();
    const response = await batchSubmitManifests({
      manifestIds: selectedSubmittableManifestIds.value,
      sessionContextId,
      requestedBy,
      validateOnly: false,
      printAfterSubmit: false,
      groupId: filters.groupId || undefined
    });

    cancelFeedback.value = `${response.total} envios enfileirados no grupo ${response.groupId}.`;
    clearManifestSelection();
    await search();
  } catch (err) {
    cancelFeedbackError.value = err.message || 'Falha ao solicitar envio em lote.';
  } finally {
    batchSubmitLoading.value = false;
  }
}

function openReplicateModal(manifest) {
  const manifestId = resolveManifestIdentifier(manifest);
  if (!manifestId || !canReplicateManifest(manifest)) {
    cancelFeedbackError.value = 'A replicação está disponível apenas para manifestos em estado estável.';
    return;
  }

  replicateTargetManifest.value = manifest;
  replicateCount.value = 2;
  cancelFeedbackError.value = '';
  replicateModalVisible.value = true;
}

function closeReplicateModal() {
  if (replicateLoading.value) {
    return;
  }

  replicateModalVisible.value = false;
  replicateTargetManifest.value = null;
  replicateCount.value = 2;
}

async function confirmReplicateManifest() {
  const manifestId = resolveManifestIdentifier(replicateTargetManifest.value);
  const count = Number(replicateCount.value || 0);
  if (!manifestId) {
    cancelFeedbackError.value = 'Manifesto inválido para replicação.';
    return;
  }

  if (!Number.isInteger(count) || count < 1 || count > 100) {
    cancelFeedbackError.value = 'Informe uma quantidade entre 1 e 100 para replicação.';
    return;
  }

  replicateLoading.value = true;
  cancelFeedbackError.value = '';

  try {
    const requestedBy = buildRequestedBy();
    const response = await replicateManifest(manifestId, {
      count,
      requestedBy,
      sessionContextId: filters.sessionContextId || undefined
    });
    filters.groupId = response.groupId;
    filters.page = 1;
    cancelFeedback.value = `${response.total} cópias criadas no grupo ${response.groupId}.`;
    closeReplicateModal();
    await search();
  } catch (err) {
    cancelFeedbackError.value = err.message || 'Falha ao replicar manifesto.';
  } finally {
    replicateLoading.value = false;
  }
}

async function confirmCancelManifest() {
  const manifest = targetManifest.value;
  const primaryId = resolveManifestIdentifier(manifest);
  if (!primaryId) {
    cancelFeedbackError.value = 'Manifesto inválido para cancelamento.';
    return;
  }

  if (cancelReason.value.trim().length < 3) {
    cancelFeedbackError.value = 'Informe um motivo com pelo menos 3 caracteres.';
    return;
  }

  cancelLoading.value = true;
  cancelFeedbackError.value = '';

  try {
    const requestedBy = buildRequestedBy();
    const reason = cancelReason.value.trim();

    const candidateIds = Array.from(new Set([
      primaryId,
      manifest?.id,
      manifest?.manifestId,
      manifest?.entityId,
      manifest?.manifestNumber,
      manifest?.externalCode
    ].filter(Boolean).map((value) => String(value).trim())));

    let response = null;
    let lastError = null;
    for (const candidateId of candidateIds) {
      try {
        response = await cancelManifest(candidateId, { requestedBy, reason });
        break;
      } catch (err) {
        lastError = err;
        const message = String(err?.message || '');
        if (!message.includes('404')) {
          throw err;
        }
      }
    }

    if (!response) {
      throw lastError || new Error('Manifesto não encontrado para cancelamento.');
    }

    const manifestLabel = manifest.manifestNumber || primaryId;
    cancelFeedback.value = `Cancelamento enfileirado para ${manifestLabel}. Job: ${response.jobId}.`;
    cancelModalVisible.value = false;
    cancelReason.value = '';
    targetManifest.value = null;
    await search();
    void monitorCancelJob(response.jobId, manifestLabel);
  } catch (err) {
    cancelFeedbackError.value = err.message || 'Falha ao solicitar cancelamento do manifesto.';
  } finally {
    cancelLoading.value = false;
  }
}

function goToCreate() {
  router.push('/manifestos/novo');
}

// ── resync ────────────────────────────────────────────────────────────────────
const resyncLoading = ref(false);
const resyncFeedback = ref('');
const resyncFeedbackError = ref('');

async function resyncManifests() {
  resyncLoading.value = true;
  resyncFeedback.value = '';
  resyncFeedbackError.value = '';
  cancelFeedback.value = '';
  syncWarning.value = '';
  syncWarningMeta.value = null;
  cacheWarningModalVisible.value = false;

  try {
    const operationalContext = await syncWithActiveOperationalContext();
    if (!operationalContext.ready) {
      throw new Error('Ative uma conta CETESB para sincronizar manifestos.');
    }

    const params = {
      integrationAccountId: operationalContext.integrationAccountId,
      sessionContextId: operationalContext.sessionContextId || null,
      forceSync: true,
      pageSize: filters.pageSize || 20
    };
    const syncResponse = await syncManifests(params);
    await search();

    const summary = syncResponse?.syncSummary || null;
    if (summary && Number.isFinite(Number(summary.remoteItemsCount))) {
      const remoteItemsCount = Number(summary.remoteItemsCount);
      const deletedLocalMirrorCount = Number(summary.deletedLocalMirrorCount || 0);
      resyncFeedback.value = `Sincronização com CETESB concluída. ${remoteItemsCount} registro(s) remoto(s) processado(s); ${deletedLocalMirrorCount} registro(s) local(is) do espelho limpo(s).`;
    } else {
      resyncFeedback.value = 'Sincronização com CETESB concluída. Lista atualizada.';
    }
  } catch (err) {
    resyncFeedbackError.value = err.message || 'Falha ao ressincronizar manifestos.';
  } finally {
    resyncLoading.value = false;
  }
}

watch(
  () => [
    String(authStore.integrationAccountId.value || '').trim(),
    String(authStore.sessionContext.value?.sessionContextId || authStore.sessionContext.value?.id || '').trim()
  ],
  async ([nextIntegrationAccountId, nextSessionContextId], [previousIntegrationAccountId, previousSessionContextId]) => {
    if (!nextIntegrationAccountId || !nextSessionContextId) {
      return;
    }

    if (
      nextIntegrationAccountId === previousIntegrationAccountId
      && nextSessionContextId === previousSessionContextId
    ) {
      return;
    }

    await syncWithActiveOperationalContext({ resetPage: true });
  }
);

onMounted(async () => {
  globalThis.addEventListener('keydown', handleGlobalKeydown);

  const operationalContext = await syncWithActiveOperationalContext();

  const refreshRequested = String(route.query.refresh || '') === '1';
  const forceSyncRequested = String(route.query.forceSync || '') === '1';
  const integrationAccountFromQuery = String(route.query.integrationAccountId || '').trim();
  const groupIdFromQuery = String(route.query.groupId || '').trim();
  const batchCreated = String(route.query.batchCreated || '') === '1';
  const batchCountFromQuery = Number(route.query.count || 0);

  if (
    integrationAccountFromQuery
    && (!operationalContext.ready || integrationAccountFromQuery === operationalContext.integrationAccountId)
  ) {
    filters.integrationAccountId = integrationAccountFromQuery;
  }

  if (groupIdFromQuery) {
    filters.groupId = groupIdFromQuery;
  }

  normalizeReceiverDateWindow();

  if (refreshRequested) {
    if (forceSyncRequested) {
      await resyncManifests();
    } else if (updateDateFilterFeedback()) {
      await search();
    }

    if (batchCreated && groupIdFromQuery && Number.isFinite(batchCountFromQuery) && batchCountFromQuery > 0) {
      cancelFeedback.value = `${batchCountFromQuery} manifestos criados no grupo ${groupIdFromQuery}.`;
    }

    await router.replace({ path: '/manifestos' });
    return;
  }

  if (!items.value.length && updateDateFilterFeedback()) {
    await search();
  }
});

onUnmounted(() => {
  globalThis.removeEventListener('keydown', handleGlobalKeydown);
  cancelMonitorToken += 1;
  cancelMonitoring.value = false;
});
</script>

<template>
  <SicatPageLayout>
    <template #header>
      <SicatPageHeader
        :kicker="isReceiverOperationalMode ? 'Operação do destinador' : 'MTR'"
        title="Manifestos"
        :description="isReceiverOperationalMode ? 'Ponto de entrada para recebimento de MTR e fluxo de CDF.' : 'Gerencie e acompanhe todos os manifestos emitidos.'"
      >
        <template #actions>
          <v-btn variant="outlined" :loading="resyncLoading" prepend-icon="mdi-sync" @click="resyncManifests">Ressinc. CETESB</v-btn>
          <v-btn v-if="isReceiverOperationalMode" color="primary" variant="flat" prepend-icon="mdi-file-document-multiple" @click="goToCdfFlowFromSelection">Gerar CDF</v-btn>
          <v-btn v-else color="primary" variant="flat" prepend-icon="mdi-plus" @click="goToCreate">Novo Manifesto</v-btn>
        </template>
      </SicatPageHeader>
    </template>

        <!-- Filtros -->
        <v-card class="mb-4">
          <v-card-text>
            <div class="text-overline text-medium-emphasis mb-1">Busca operacional</div>
            <div class="text-h6 font-weight-semibold mb-3">Filtros</div>
            <v-form @submit.prevent="applyFilters">
              <v-row dense>
                <v-col cols="12" sm="6" md="3">
                  <v-select
                    v-model="filters.status"
                    label="Status"
                    :items="[{title:'Todos',value:''},{title:'Rascunho',value:'draft'},{title:'Pendente',value:'queued_submit'},{title:'Enviando',value:'submitting'},{title:'Executando',value:'processing'},{title:'Sucesso',value:'submitted'},{title:'Cancelado',value:'cancelled'},{title:'Falha',value:'failed'}]"
                    item-title="title"
                    item-value="value"
                    clearable
                  />
                </v-col>
                <v-col cols="12" sm="6" md="3">
                  <v-text-field v-model="filters.manifestNumber" label="Número MTR" placeholder="Ex.: 260010679516" clearable />
                </v-col>
                <v-col cols="12" sm="6" md="3">
                  <v-text-field v-model="filters.groupId" label="Grupo" placeholder="Ex.: grp_..." clearable />
                </v-col>
                <v-col cols="12" sm="6" md="3">
                  <v-text-field v-model="filters.carrierQuery" label="Transportador" placeholder="Nome ou código" clearable />
                </v-col>
                <v-col cols="12" sm="6" md="3">
                  <v-text-field v-model="filters.receiverQuery" label="Destinador" placeholder="Nome ou código" clearable />
                </v-col>
                <v-col cols="12" sm="6" md="4">
                  <SicatDateInput
                    ref="dateFromFieldRef"
                    id="dateFrom"
                    v-model="filters.dateFrom"
                    aria-label="Data inicial"
                    open-calendar-aria-label="Abrir calendário da Data inicial"
                    previous-day-aria-label="Dia anterior em Data inicial"
                    next-day-aria-label="Dia posterior em Data inicial"
                    range-mode
                    range-role="start"
                    :range-start-value="filters.dateFrom"
                    :range-end-value="filters.dateTo"
                    :range-hover-iso="dateRangeHoverIso"
                    @range-hover="handleDateRangeHover"
                    @date-picked="handleDatePicked('dateFrom', $event)"
                    @commit="onDateFieldCommit('dateFrom', $event)"
                  />
                </v-col>
                <v-col cols="12" sm="6" md="4">
                  <SicatDateInput
                    ref="dateToFieldRef"
                    id="dateTo"
                    v-model="filters.dateTo"
                    aria-label="Data final"
                    open-calendar-aria-label="Abrir calendário da Data final"
                    previous-day-aria-label="Dia anterior em Data final"
                    next-day-aria-label="Dia posterior em Data final"
                    range-mode
                    range-role="end"
                    :range-start-value="filters.dateFrom"
                    :range-end-value="filters.dateTo"
                    :range-hover-iso="dateRangeHoverIso"
                    @range-hover="handleDateRangeHover"
                    @date-picked="handleDatePicked('dateTo', $event)"
                    @commit="onDateFieldCommit('dateTo', $event)"
                  />
                </v-col>
                <v-col cols="12" sm="6" md="3">
                  <v-select
                    v-model.number="filters.pageSize"
                    label="Itens por página"
                    :items="[{title:'10',value:10},{title:'20',value:20},{title:'50',value:50}]"
                    item-title="title"
                    item-value="value"
                  />
                </v-col>
              </v-row>
              <div class="d-flex ga-2 mt-2">
                <v-btn color="primary" type="submit" :loading="loadingList">Aplicar Filtros</v-btn>
                <v-btn variant="outlined" type="button" @click="clearFilters">Limpar Filtros</v-btn>
              </div>
            </v-form>
          </v-card-text>
        </v-card>

        <!-- Alertas de feedback -->
        <v-alert v-if="dateFilterError" type="error" variant="tonal" class="mb-3" density="compact" aria-live="polite">{{ dateFilterError }}</v-alert>
        <v-alert v-if="dateFilterInfo && !dateFilterError" type="info" variant="tonal" class="mb-3" density="compact" aria-live="polite">{{ dateFilterInfo }}</v-alert>
        <v-alert v-if="error" type="error" variant="tonal" class="mb-3" density="compact" aria-live="polite">{{ error }}</v-alert>
        <v-alert v-if="syncWarning && !error" type="warning" variant="tonal" class="mb-3" density="compact" aria-live="polite">{{ syncWarning }}</v-alert>
        <v-alert v-if="resyncFeedback" type="success" variant="tonal" class="mb-3" density="compact" aria-live="polite">{{ resyncFeedback }}</v-alert>
        <v-alert v-if="resyncFeedbackError" type="error" variant="tonal" class="mb-3" density="compact" aria-live="polite">{{ resyncFeedbackError }}</v-alert>
        <v-alert v-if="cancelFeedback" type="success" variant="tonal" class="mb-3" density="compact" aria-live="polite">{{ cancelFeedback }}</v-alert>
        <v-alert v-if="operationalFeedback" type="success" variant="tonal" class="mb-3" density="compact" aria-live="polite">{{ operationalFeedback }}</v-alert>
        <v-alert v-if="operationalFeedbackError" type="error" variant="tonal" class="mb-3" density="compact" aria-live="polite">{{ operationalFeedbackError }}</v-alert>
        <!-- Toolbar de lote -->
        <v-card v-if="selectedManifestCount" class="mb-4" color="primary" variant="tonal">
          <v-card-text>
            <v-row align="center">
              <v-col>
                <strong>{{ selectedManifestCount }}</strong> manifesto(s) selecionado(s) para ação em lote.
              </v-col>
              <v-col cols="auto" class="d-flex flex-wrap ga-2">
                <v-btn v-if="isReceiverOperationalMode && selectedReceivableManifests.length" color="primary" size="small" :loading="receiveModalLoading" @click="openReceiveModal()">Receber selecionados</v-btn>
                <v-btn v-if="isReceiverOperationalMode && selectedCdfCandidateManifests.length" variant="outlined" size="small" prepend-icon="mdi-file-certificate" @click="goToCdfFlowFromSelection">Gerar CDF dos selecionados</v-btn>
                <v-btn v-if="selectedPrintableManifests.length" variant="outlined" size="small" :loading="batchPrintLoading" @click="requestBatchPrintManifests">Imprimir selecionados</v-btn>
                <v-btn v-if="!isReceiverOperationalMode && selectedSubmittableManifestIds.length" variant="outlined" size="small" :loading="batchSubmitLoading" @click="requestBatchSubmitManifests">Submeter selecionados</v-btn>
                <v-btn v-if="selectedCancelableManifestIds.length" color="error" size="small" @click="openBatchCancelModal">Cancelar selecionados</v-btn>
                <v-btn variant="text" size="small" @click="clearManifestSelection">Limpar seleção</v-btn>
              </v-col>
            </v-row>
          </v-card-text>
        </v-card>
        <!-- Tabela de resultados -->
        <v-card>
          <v-card-text class="pb-0">
            <v-row align="center">
              <v-col>
                <div class="text-h6 font-weight-semibold">Resultados</div>
                <div class="text-caption text-medium-emphasis">Mostrando {{ pageDescription.start }} até {{ pageDescription.end }} de {{ totalItems }} manifestos</div>
              </v-col>
              <v-col cols="auto">
                <v-btn
                  v-if="syncWarning"
                  variant="tonal"
                  color="warning"
                  size="small"
                  prepend-icon="mdi-database-alert"
                  @click="openCacheWarningModal"
                >
                  Dados em cache
                </v-btn>
              </v-col>
            </v-row>
          </v-card-text>
          <v-table density="compact" class="manifests-table-shell">
            <thead>
              <tr>
                <th scope="col" style="width:40px">
                  <v-checkbox-btn :model-value="allVisibleSelected" @change="toggleSelectAllVisible" density="compact" />
                </th>
                <th scope="col">Número MTR</th>
                <th scope="col">Data Emissão</th>
                <th scope="col">Transportador</th>
                <th scope="col">Destinador</th>
                <th scope="col">Situação CETESB</th>
                <th scope="col">Ações</th>
              </tr>
            </thead>
            <tbody>
              <tr v-if="loadingList">
                <td colspan="7" class="text-center text-medium-emphasis pa-4">Carregando manifestos...</td>
              </tr>
              <tr v-if="!items.length && !loadingList">
                <td colspan="7" class="text-center text-medium-emphasis pa-4">Nenhum manifesto encontrado.</td>
              </tr>
              <tr v-for="manifest in items" :key="resolveManifestIdentifier(manifest)">
                <td>
                  <v-checkbox-btn
                    v-if="canBatchSelectManifest(manifest)"
                    :model-value="isManifestSelected(manifest)"
                    density="compact"
                    @change="toggleManifestSelection(manifest)"
                  />
                </td>
                <td>
                  <div class="font-weight-medium" :title="manifest.manifestNumber || resolveManifestIdentifier(manifest) || '-'">
                    {{ manifest.manifestNumber || resolveManifestIdentifier(manifest) || '-' }}
                  </div>
                  <v-chip v-if="manifest.groupId" size="x-small" variant="tonal" color="secondary" :title="formatManifestBatchLabel(manifest)">
                    {{ formatManifestBatchLabel(manifest) }}
                  </v-chip>
                </td>
                <td>{{ formatDate(manifest.expeditionDate || manifest.createdAt) }}</td>
                <td>{{ formatPartnerLabel(manifest.carrier) }}</td>
                <td>{{ formatPartnerLabel(manifest.receiver) }}</td>
                <td>
                  <SicatStatusBadge
                    :status="manifest.externalStatus || manifest.status"
                    :label="resolveManifestStatusLabel(manifest)"
                    domain="manifest"
                    with-dot
                  />
                </td>
                <td class="manifest-actions-cell">
                  <v-menu location="bottom end">
                    <template #activator="{ props: menuProps }">
                      <v-btn v-bind="menuProps" variant="tonal" size="small" append-icon="mdi-chevron-down" aria-label="Ações do manifesto">Ações</v-btn>
                    </template>
                    <v-list density="compact" min-width="210">
                      <v-list-item
                        :disabled="!resolveManifestIdentifier(manifest)"
                        prepend-icon="mdi-eye-outline"
                        title="Visualizar"
                        @click="openManifestFromRow(manifest)"
                      />
                      <v-list-item
                        v-if="isReceiverOperationalMode && canReceiveOperationalManifest(manifest)"
                        :disabled="receiveModalLoading"
                        prepend-icon="mdi-inbox-arrow-down"
                        title="Receber MTR"
                        @click="openReceiveModal(manifest)"
                      />
                      <v-list-item
                        v-if="isReceiverOperationalMode && canUseManifestForCdf(manifest)"
                        prepend-icon="mdi-file-certificate"
                        title="Gerar CDF"
                        @click="goToCdfFlowForManifest(manifest)"
                      />
                      <v-list-item
                        v-if="!isReceiverOperationalMode && canReplicateManifest(manifest)"
                        :disabled="replicateLoading"
                        prepend-icon="mdi-content-copy"
                        title="Replicar"
                        @click="openReplicateModal(manifest)"
                      />
                      <v-list-item
                        v-if="!isReceiverOperationalMode && canSubmitManifest(manifest)"
                        :disabled="submitLoadingManifestId === resolveManifestIdentifier(manifest)"
                        prepend-icon="mdi-send"
                        :title="submitLoadingManifestId === resolveManifestIdentifier(manifest) ? 'Enviando…' : 'Submeter'"
                        @click="requestSubmitManifest(manifest)"
                      />
                      <v-list-item
                        v-if="!isErrorManifest(manifest)"
                        :disabled="!canPrintManifest(manifest) || printLoadingManifestId === resolveManifestIdentifier(manifest)"
                        prepend-icon="mdi-printer"
                        :title="printLoadingManifestId === resolveManifestIdentifier(manifest) ? 'Imprimindo…' : 'Imprimir'"
                        @click="requestPrintManifest(manifest)"
                      />
                      <v-list-item
                        v-if="!isReceiverOperationalMode && canRecoverManifest(manifest)"
                        :disabled="recoverLoadingManifestId === resolveManifestIdentifier(manifest)"
                        prepend-icon="mdi-refresh"
                        :title="recoverLoadingManifestId === resolveManifestIdentifier(manifest) ? 'Reenviando…' : 'Reenviar'"
                        @click="requestRecoverManifest(manifest)"
                      />
                      <v-divider v-if="canRemoveManifest(manifest) || (!isErrorManifest(manifest) && canCancelManifest(manifest))" />
                      <v-list-item
                        v-if="canRemoveManifest(manifest)"
                        :disabled="removeLoadingManifestId === resolveManifestIdentifier(manifest)"
                        prepend-icon="mdi-delete-outline"
                        class="text-error"
                        :title="removeLoadingManifestId === resolveManifestIdentifier(manifest) ? 'Removendo…' : 'Remover'"
                        @click="requestRemoveManifest(manifest)"
                      />
                      <v-list-item
                        v-if="!isErrorManifest(manifest)"
                        :disabled="!canCancelManifest(manifest) || cancelLoading"
                        prepend-icon="mdi-cancel"
                        class="text-error"
                        :title="isCancelledStatus(manifest) ? 'Cancelado' : 'Cancelar'"
                        @click="openCancelModal(manifest)"
                      />
                    </v-list>
                  </v-menu>
                </td>
              </tr>
            </tbody>
          </v-table>
          <v-card-text class="d-flex align-center justify-space-between pt-3">
            <span class="text-caption text-medium-emphasis">
              Mostrando {{ pageDescription.start }} até {{ pageDescription.end }} de {{ totalItems }} manifestos
            </span>
            <div class="d-flex ga-2">
              <v-btn variant="outlined" size="small" :disabled="!canGoPreviousPage" prepend-icon="mdi-chevron-left" @click="changePage(Number(page) - 1)">Anterior</v-btn>
              <v-btn variant="outlined" size="small" :disabled="!canGoNextPage" append-icon="mdi-chevron-right" @click="changePage(Number(page) + 1)">Próxima</v-btn>
            </div>
          </v-card-text>
        </v-card>
        <!-- Dialog: Cancelar manifesto -->
        <v-dialog v-model="cancelModalVisible" max-width="480" persistent>
          <v-card>
            <v-card-title class="d-flex align-center justify-space-between">
              <span>Cancelar manifesto</span>
              <v-btn icon="mdi-close" variant="text" :disabled="cancelLoading" @click="closeCancelModal" />
            </v-card-title>
            <v-card-text>
              <p class="text-body-2 mb-3">Manifesto: <strong>{{ targetManifest?.manifestNumber || targetManifest?.id }}</strong></p>
              <v-textarea v-model="cancelReason" label="Motivo do cancelamento *" rows="4" maxlength="500" placeholder="Ex.: erro no cadastro" :disabled="cancelLoading" counter />
              <v-alert v-if="cancelFeedbackError" type="error" variant="tonal" density="compact" class="mt-2">{{ cancelFeedbackError }}</v-alert>
            </v-card-text>
            <v-card-actions>
              <v-spacer />
              <v-btn variant="text" :disabled="cancelLoading" @click="closeCancelModal">Voltar</v-btn>
              <v-btn color="error" :loading="cancelLoading" @click="confirmCancelManifest">Confirmar cancelamento</v-btn>
            </v-card-actions>
          </v-card>
        </v-dialog>
        <!-- Dialog: Cancelar em lote -->
        <v-dialog v-model="batchCancelModalVisible" max-width="480" persistent>
          <v-card>
            <v-card-title class="d-flex align-center justify-space-between">
              <span>Cancelar manifestos em lote</span>
              <v-btn icon="mdi-close" variant="text" :disabled="batchCancelLoading" @click="closeBatchCancelModal" />
            </v-card-title>
            <v-card-text>
              <p class="text-body-2 mb-3">Manifestos selecionados: <strong>{{ selectedManifestCount }}</strong></p>
              <v-textarea v-model="batchCancelReason" label="Motivo do cancelamento *" rows="4" maxlength="500" placeholder="Ex.: erro no cadastro" :disabled="batchCancelLoading" counter />
              <v-alert v-if="cancelFeedbackError" type="error" variant="tonal" density="compact" class="mt-2">{{ cancelFeedbackError }}</v-alert>
            </v-card-text>
            <v-card-actions>
              <v-spacer />
              <v-btn variant="text" :disabled="batchCancelLoading" @click="closeBatchCancelModal">Voltar</v-btn>
              <v-btn color="error" :loading="batchCancelLoading" @click="confirmBatchCancelManifest">Confirmar cancelamento em lote</v-btn>
            </v-card-actions>
          </v-card>
        </v-dialog>
        <!-- Dialog: Receber manifesto -->
        <v-dialog v-model="receiveModalVisible" :max-width="receiveModalMode === 'single' ? 980 : 620" persistent scrollable>
          <v-card>
            <v-card-title class="d-flex align-center justify-space-between">
              <span>Recebimento de MTR</span>
              <v-btn icon="mdi-close" variant="text" :disabled="receiveModalLoading" @click="closeReceiveModal" />
            </v-card-title>
            <v-card-text>
              <!-- Cabeçalho: Nº, Motorista, Placa, Data de Recebimento -->
              <div v-if="receiveModalMode === 'single' && receiveModalTargetManifest" class="d-flex flex-wrap align-end mb-1" style="gap:20px">
                <div><div class="text-caption text-medium-emphasis">Nº</div><div class="font-weight-medium">{{ formatManifestLabel(receiveModalTargetManifest) }}</div></div>
                <div><div class="text-caption text-medium-emphasis">Motorista</div><div>{{ receiveModalTargetManifest.driverName || '-' }}</div></div>
                <div><div class="text-caption text-medium-emphasis">Placa</div><div>{{ receiveModalTargetManifest.vehiclePlate || '-' }}</div></div>
                <div style="min-width:180px"><v-text-field v-model="receiveForm.receivedAt" label="Data de Recebimento *" type="date" density="compact" hide-details variant="outlined" :disabled="receiveModalLoading" /></div>
              </div>
              <div v-else class="mb-2">
                <p class="text-body-2 mb-2">Manifestos selecionados: <strong>{{ receiveModalManifests.length }}</strong></p>
                <v-text-field v-model="receiveForm.receivedAt" label="Data de Recebimento *" type="date" density="compact" hide-details variant="outlined" :disabled="receiveModalLoading" style="max-width:220px" />
              </div>

              <!-- Responsável pelo Recebimento -->
              <div class="mt-4">
                <div class="text-subtitle-2 mb-1">Responsável pelo Recebimento</div>
                <div class="d-flex align-center flex-wrap" style="gap:12px">
                  <v-btn color="primary" variant="flat" size="small" :disabled="receiveModalLoading" @click="openResponsibleModal">Selecionar Responsável</v-btn>
                  <span v-if="selectedResponsible" class="text-body-2"><strong>Responsável:</strong> {{ selectedResponsible.name || '-' }} &nbsp; <strong>Cargo:</strong> {{ selectedResponsible.cargo || '-' }}</span>
                  <span v-else class="text-caption text-medium-emphasis">Nenhum responsável selecionado.</span>
                </div>
              </div>

              <!-- Lista de Resíduos (modo single) -->
              <div v-if="receiveModalMode === 'single'" class="mt-4">
                <div class="text-subtitle-2 mb-1">Resíduos</div>
                <v-progress-linear v-if="receiveResiduesLoading" indeterminate class="mb-2" />
                <v-table v-else density="compact" class="border rounded">
                  <thead>
                    <tr>
                      <th>Resíduo</th><th style="width:60px">Un.</th><th style="min-width:180px">Tratamento</th>
                      <th style="width:110px" class="text-right">Quantidade</th><th style="width:130px">Recebida</th><th style="min-width:160px">Just.</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="(residue, idx) in receiveResidues" :key="residue.lineNumber ?? idx">
                      <td>{{ residue.residueDescription }}</td>
                      <td>{{ residue.unitSymbol || '-' }}</td>
                      <td>
                        <v-select v-if="treatmentOptions.length" v-model="residue.treatmentCode" :items="treatmentOptions" item-title="title" item-value="value" density="compact" hide-details variant="outlined" :disabled="receiveModalLoading" />
                        <span v-else>{{ residue.treatmentDescription || '-' }}</span>
                      </td>
                      <td class="text-right">{{ residue.quantity ?? '-' }}</td>
                      <td><v-text-field v-model="residue.receivedQuantity" type="number" min="0" step="0.0001" density="compact" hide-details variant="outlined" :disabled="receiveModalLoading" /></td>
                      <td><v-text-field v-model="residue.justification" density="compact" hide-details variant="outlined" placeholder="Se divergir" :disabled="receiveModalLoading" /></td>
                    </tr>
                    <tr v-if="!receiveResidues.length">
                      <td colspan="6" class="text-center text-medium-emphasis py-3">Nenhum resíduo carregado para este manifesto.</td>
                    </tr>
                  </tbody>
                </v-table>
              </div>

              <v-textarea v-model="receiveForm.observation" label="Observação" rows="2" maxlength="500" :disabled="receiveModalLoading" class="mt-4" hide-details variant="outlined" />
              <v-checkbox v-model="receiveForm.printReceiptAfterReceive" label="Baixar e persistir comprovante PDF após o recebimento" :disabled="receiveModalLoading" density="compact" hide-details class="mt-2" />
              <v-alert v-if="receiveBlockedManifestEntries.length" type="info" variant="tonal" density="compact" class="mt-2">
                {{ receiveBlockedManifestEntries.length }} manifesto(s) serão ignorados por não estarem elegíveis.
              </v-alert>
            </v-card-text>
            <v-card-actions>
              <v-spacer />
              <v-btn variant="text" :disabled="receiveModalLoading" @click="closeReceiveModal">Cancelar</v-btn>
              <v-btn color="primary" :loading="receiveModalLoading" :disabled="!receiveEligibleManifests.length || !selectedResponsible" @click="submitReceiveRequests">Receber</v-btn>
            </v-card-actions>
          </v-card>
        </v-dialog>

        <!-- Sub-dialog: Selecionar Responsável pelo Recebimento (lista do SIGOR) -->
        <v-dialog v-model="responsibleModalVisible" max-width="640" scrollable>
          <v-card>
            <v-card-title class="d-flex align-center justify-space-between">
              <span>Responsável Recebimento MTR</span>
              <v-btn icon="mdi-close" variant="text" @click="responsibleModalVisible = false" />
            </v-card-title>
            <v-card-text>
              <v-progress-linear v-if="responsiblesLoading" indeterminate class="mb-2" />
              <v-alert v-if="responsiblesError" type="error" variant="tonal" density="compact" class="mb-2">{{ responsiblesError }}</v-alert>
              <v-table v-if="!responsiblesLoading" density="compact" class="border rounded">
                <thead><tr><th>Responsável</th><th>Cargo</th><th style="width:120px">Ações</th></tr></thead>
                <tbody>
                  <tr v-for="resp in responsiblesList" :key="resp.rrmCodigo">
                    <td>{{ resp.name || '-' }}</td>
                    <td>{{ resp.cargo || '-' }}</td>
                    <td><v-btn size="small" color="primary" variant="text" @click="selectResponsible(resp)">Selecionar</v-btn></td>
                  </tr>
                  <tr v-if="!responsiblesList.length">
                    <td colspan="3" class="text-center text-medium-emphasis py-3">Nenhum responsável cadastrado para esta conta.</td>
                  </tr>
                </tbody>
              </v-table>
            </v-card-text>
            <v-card-actions>
              <v-spacer />
              <v-btn variant="text" @click="responsibleModalVisible = false">Fechar</v-btn>
            </v-card-actions>
          </v-card>
        </v-dialog>
        <!-- Dialog: Replicar manifesto -->
        <v-dialog v-model="replicateModalVisible" max-width="440" persistent>
          <v-card>
            <v-card-title class="d-flex align-center justify-space-between">
              <span>Replicar manifesto</span>
              <v-btn icon="mdi-close" variant="text" :disabled="replicateLoading" @click="closeReplicateModal" />
            </v-card-title>
            <v-card-text>
              <p class="text-body-2 mb-1">Manifesto base: <strong>{{ replicateTargetManifest?.manifestNumber || replicateTargetManifest?.id }}</strong></p>
              <p class="text-body-2 text-medium-emphasis mb-3">As cópias serão criadas com a data de expedição atual e sem reaproveitar estados transitórios do manifesto original.</p>
              <v-text-field v-model.number="replicateCount" label="Quantidade de cópias *" type="number" min="1" max="100" :disabled="replicateLoading" />
              <v-alert v-if="cancelFeedbackError" type="error" variant="tonal" density="compact" class="mt-2">{{ cancelFeedbackError }}</v-alert>
            </v-card-text>
            <v-card-actions>
              <v-spacer />
              <v-btn variant="text" :disabled="replicateLoading" @click="closeReplicateModal">Voltar</v-btn>
              <v-btn color="primary" :loading="replicateLoading" @click="confirmReplicateManifest">Criar cópias</v-btn>
            </v-card-actions>
          </v-card>
        </v-dialog>
        <!-- Dialog: Cache warning -->
        <v-dialog v-model="cacheWarningModalVisible" max-width="440">
          <v-card>
            <v-card-title class="d-flex align-center justify-space-between">
              <span>Detalhes do fallback</span>
              <v-btn icon="mdi-close" variant="text" @click="closeCacheWarningModal" />
            </v-card-title>
            <v-card-text>
              <p class="text-body-2 mb-2">A listagem foi exibida com dados locais por indisponibilidade temporária da CETESB.</p>
              <p class="text-body-2"><strong>Status HTTP remoto:</strong> {{ cacheWarningDetails.remoteStatus || 'Não informado' }}</p>
              <p class="text-body-2"><strong>Horário do fallback:</strong> {{ formatDateTime(cacheWarningDetails.fallbackAt) }}</p>
            </v-card-text>
            <v-card-actions>
              <v-spacer />
              <v-btn color="primary" @click="closeCacheWarningModal">Fechar</v-btn>
            </v-card-actions>
          </v-card>
        </v-dialog>

        <ConfirmDialog
          :visible="dialogVisible"
          :title="dialogTitle"
          :message="dialogMessage"
          :confirm-label="dialogConfirmLabel"
          :cancel-label="dialogCancelLabel"
          :danger="dialogDanger"
          :show-cancel="dialogShowCancel"
          @confirm="accept"
          @cancel="cancel"
          @close="cancel"
        />
  </SicatPageLayout>
</template>
<style scoped>
.manifests-receive-summary {
  display: grid;
  gap: 8px;
}

.manifests-receive-summary-item {
  display: grid;
  gap: 2px;
  padding: 10px 12px;
  border-radius: 14px;
  border: 1px solid color-mix(in srgb, var(--color-border) 62%, transparent 38%);
  background: color-mix(in srgb, var(--color-surface-raised) 72%, var(--color-surface) 28%);
}

.manifests-receive-summary-item span {
  color: var(--color-text-muted);
  font-size: 0.84rem;
}

.manifests-receive-checkbox {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  color: var(--color-text);
  font-size: 0.92rem;
}

.manifests-hero {
  padding: 8px 4px 2px;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 14px;
}

.manifests-header-copy {
  display: grid;
  gap: 8px;
}

.manifests-select-col {
  width: 44px;
  text-align: center;
}

.manifest-group-chip {
  display: inline-flex;
  margin-top: 6px;
  width: fit-content;
  padding: 3px 8px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--color-primary) 10%, var(--color-surface) 90%);
  color: var(--color-primary);
  font-size: 0.72rem;
  font-weight: 700;
}

.manifests-kicker {
  display: inline-flex;
  width: fit-content;
  align-items: center;
  min-height: 30px;
  padding: 0 12px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--color-primary) 10%, var(--color-surface) 90%);
  color: var(--color-primary);
  font-size: 0.72rem;
  font-weight: 800;
  letter-spacing: 0.05em;
  text-transform: uppercase;
}

.manifests-kicker-muted {
  background: color-mix(in srgb, var(--color-surface-raised) 82%, var(--color-surface) 18%);
}

.manifests-header-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}

.manifests-filters-grid {
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
}

.manifests-filter-item {
  min-width: 0;
}

.manifests-filter-status,
.manifests-filter-manifest-number,
.manifests-filter-carrier,
.manifests-filter-receiver,
.manifests-filter-date-from,
.manifests-filter-date-to,
.manifests-filter-page-size {
  grid-column: span 1;
}

.manifests-filters {
  padding: 18px;
  border-color: color-mix(in srgb, var(--color-border) 62%, transparent 38%);
  background: linear-gradient(180deg, color-mix(in srgb, var(--color-surface) 92%, white 8%) 0%, color-mix(in srgb, var(--color-surface-raised) 72%, var(--color-surface) 28%) 100%);
}

.manifests-filters-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
  margin-bottom: 16px;
}

.manifests-filters-header h3 {
  margin: 6px 0 0;
  font-family: var(--font-family-display);
  font-size: 1.1rem;
}

.manifests-filters-actions {
  margin-top: 14px;
}

.manifests-table-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 16px 18px;
  border-bottom: 1px solid color-mix(in srgb, var(--color-border) 64%, transparent 36%);
}

.manifests-table-header h3 {
  margin: 0;
  font-size: 1.05rem;
  font-family: var(--font-family-display);
  color: var(--color-text);
}

.manifests-table-header-actions {
  display: flex;
  gap: 8px;
  align-items: center;
}

.manifests-results-card {
  overflow: visible;
}

.manifests-table-shell {
  padding: 0;
  overflow-x: auto;
  overflow-y: visible;
}

.manifest-code-cell {
  max-width: 160px;
}

.manifest-code-value {
  display: inline-block;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  vertical-align: bottom;
}

.manifest-actions-cell {
  text-align: left;
  vertical-align: top;
  padding: 8px !important;
}

.sicat-feedback-card.error {
  border-color: color-mix(in srgb, var(--color-error) 34%, var(--color-border) 66%);
  background: color-mix(in srgb, var(--color-error) 10%, var(--color-surface) 90%);
}

.sicat-feedback-card.warning {
  border-color: color-mix(in srgb, var(--color-warning) 32%, var(--color-border) 68%);
  background: color-mix(in srgb, var(--color-warning) 10%, var(--color-surface) 90%);
}

.sicat-feedback-card.success {
  border-color: color-mix(in srgb, var(--color-success) 32%, var(--color-border) 68%);
  background: color-mix(in srgb, var(--color-success) 10%, var(--color-surface) 90%);
}

.manifests-feedback-text {
  font-weight: 700;
}

.sicat-cache-badge {
  display: inline-flex;
  align-items: center;
  cursor: pointer;
  gap: 6px;
  padding: 4px 10px;
  border-radius: 999px;
  border: 1px solid #fcd34d;
  background: #fffbeb;
  color: #92400e;
  font-size: 0.78rem;
  font-weight: 600;
  line-height: 1;
}

.sicat-cache-badge:hover {
  background: #fef3c7;
}

.sicat-cache-badge:focus-visible {
  outline: 2px solid #f59e0b;
  outline-offset: 2px;
}

.sicat-cache-badge .material-symbols-outlined {
  font-size: 15px;
}

.sicat-btn-danger {
  border-color: color-mix(in srgb, var(--color-error) 24%, var(--color-border) 76%);
  background: color-mix(in srgb, var(--color-error) 8%, var(--color-surface) 92%);
  color: var(--color-error);
}

.sicat-btn-danger:hover:not(:disabled) {
  background: color-mix(in srgb, var(--color-error) 14%, var(--color-surface) 86%);
}

.sicat-btn-danger:disabled {
  opacity: 0.65;
  cursor: not-allowed;
}

.sicat-modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.45);
  display: grid;
  place-items: center;
  z-index: 50;
  padding: 16px;
}

.sicat-modal {
  width: min(640px, 100%);
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 22px;
  box-shadow: var(--shadow-lg);
}

.manifests-modal-body {
  display: grid;
  gap: 12px;
}

.manifests-modal-body .sicat-subtitle,
.manifests-modal-body .sicat-field > span,
.sicat-modal .sicat-card-header h3 {
  color: var(--color-text);
}

.manifests-modal-note {
  color: var(--color-text-muted);
}

.manifests-modal-error {
  color: var(--color-error);
}

.manifests-modal-actions {
  justify-content: flex-end;
}

.manifests-pagination-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

@media (max-width: 1199px) {
  .manifests-filters-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 767px) {
  .manifests-hero,
  .manifests-pagination-bar,
  .manifests-table-header {
    flex-direction: column;
    align-items: flex-start;
    gap: 10px;
  }

  .manifests-filters-grid {
    grid-template-columns: 1fr;
  }
}
</style>
