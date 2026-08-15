/**
 * Store de Operações de Transporte — programa "SICAT Transporte" (DL-103),
 * Onda 1.5/PR-F1 (frontend mínimo). Molde: stores/mtrProvisorioStore.js.
 *
 * Mantém estado mínimo: filtros persistidos, lista paginada, operação ativa
 * (agregado completo), overview de conformidade da operação ativa e comando
 * assíncrono em andamento. Actions delegam ao transporteService.js — sem
 * falar HTTP direto.
 *
 * Backend (Fase A, sempre síncrono — sem 202/job):
 *  - GET  /v1/transporte/operacoes                              → lista paginada (tenancy obrigatória)
 *  - GET  /v1/transporte/operacoes/{id}                          → agregado completo + availableCommands
 *  - GET  /v1/transporte/operacoes/{id}/conformidade             → última avaliação por gate (8 gates)
 *  - POST /v1/transporte/operacoes/{id}/validar-conformidade     → avalia UM gate ad-hoc, sem transição
 *  - POST /v1/transporte/operacoes/{id}/submeter-validacao       → draft → validating → ready_for_contract|blocked
 *  - POST /v1/transporte/operacoes/{id}/contratar                → ready_for_contract → contracted
 *  - POST /v1/transporte/operacoes/{id}/reabrir                  → blocked → draft
 *  - POST /v1/transporte/operacoes/{id}/cancelar                 → qualquer status não-terminal → cancelled
 *
 * `submeter-validacao` e `contratar` respondem `{ operation, evaluation }`
 * (a operação já refletindo a transição + a avaliação de gate que decidiu);
 * `reabrir` e `cancelar` respondem o agregado da operação direto.
 */

import { reactive, ref } from 'vue';
import {
  acquireTransportOperationVpo,
  buildTransporteIdempotencyKey,
  calculateTransportOperationFloor,
  cancelTransportOperation,
  cancelTransportDfeIssuance,
  cancelTransportOperationCiot,
  closeTransportOperationCiot,
  contractTransportOperation,
  evaluateTransportOperationVpoApplicability,
  getTransportOperationById,
  getTransportOperationCiot,
  getTransportOperationCompliance,
  getTransportOperationVpo,
  importTransportFiscalDocument,
  linkTransportFiscalDocument,
  listTransportOperationDfeIssuances,
  listTransportOperationFiscalDocuments,
  listTransportOperationFloorCalculations,
  listTransportOperations,
  preValidateTransportOperationCiot,
  rectifyTransportOperationCiot,
  registerTransportOperationVpoAcquisition,
  reopenTransportOperation,
  requestTransportOperationCiot,
  requestTransportOperationDfeIssuance,
  revalidateTransportFiscalDocument,
  submitTransportOperationValidation,
  unlinkTransportFiscalDocument,
  validateTransportOperationCompliance
} from '../services/transporteService.js';
import { useAuthStore } from './auth.js';
import { useJobAwait } from '../composables/useJobAwait.js';

const FILTERS_KEY = 'sicat_transporte_operacoes_list_filters';

const DEFAULT_FILTERS = Object.freeze({
  integrationAccountId: '',
  status: '',
  page: 1,
  pageSize: 20
});

function loadPersistedFilters() {
  try {
    const raw = localStorage.getItem(FILTERS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    return parsed;
  } catch {
    return null;
  }
}

function persistFilters(filters) {
  try {
    localStorage.setItem(FILTERS_KEY, JSON.stringify({
      integrationAccountId: String(filters.integrationAccountId || '').trim(),
      status: String(filters.status || '').trim(),
      page: Number(filters.page || 1),
      pageSize: Number(filters.pageSize || 20)
    }));
  } catch {
    // ignore storage failures
  }
}

function resolveIntegrationAccountId(authStore) {
  return String(
    authStore.integrationAccountId.value
    || authStore.sessionContext.value?.integrationAccountId
    || ''
  ).trim();
}

/** application/problem+json — preserva detail/title, cai no fallback sem vazar stack. */
function extractErrorMessage(error, fallback) {
  if (!error) return fallback;
  return error.detail || error.title || error.message || fallback;
}

function extractErrorCode(error) {
  return String(error?.payload?.code || error?.code || '').trim();
}

export function useTransporteStore() {
  const authStore = useAuthStore();
  const persisted = loadPersistedFilters();
  const initialIntegrationAccountId = resolveIntegrationAccountId(authStore);

  const filters = reactive({
    ...DEFAULT_FILTERS,
    ...persisted,
    integrationAccountId: initialIntegrationAccountId
      || String(persisted?.integrationAccountId || '').trim()
  });

  const items = ref([]);
  const totalItems = ref(0);
  const totalPages = ref(0);
  const loadingList = ref(false);
  const listError = ref('');

  const selected = ref(null);
  const loadingDetail = ref(false);
  const detailError = ref('');
  const detailErrorCode = ref('');

  const complianceOverview = ref(null);
  const loadingCompliance = ref(false);
  const complianceError = ref('');

  const commandLoading = ref(false);
  const commandError = ref('');
  const commandErrorCode = ref('');
  const commandFeedback = ref('');
  const lastCommand = ref(null);

  // ---------------------------------------------------------------------
  // PR-H2 (frontend completo) — estado escopado à operação SELECIONADA:
  // piso mínimo (histórico append-only), CIOT (tentativa atual + eventos),
  // VPO (alocação atual + eventos), documentos fiscais vinculados e
  // emissões de DF-e. Comandos assíncronos (202) usam `useJobAwait` e
  // recarregam o recurso ao concluir — o mesmo padrão de `submitValidation`/
  // `contract` acima, só que com um `await job` no meio.
  // ---------------------------------------------------------------------

  const pisoCalculations = ref([]);
  const loadingPiso = ref(false);
  const pisoError = ref('');

  const ciotState = ref(null); // { ciot, events }
  const loadingCiot = ref(false);
  const ciotError = ref('');

  const vpoState = ref(null); // { allocation, events }
  const loadingVpo = ref(false);
  const vpoError = ref('');

  const fiscalDocuments = ref([]);
  const loadingFiscalDocuments = ref(false);
  const fiscalDocumentsError = ref('');

  const emissoes = ref([]);
  const loadingEmissoes = ref(false);
  const emissoesError = ref('');

  const { awaitJob } = useJobAwait();

  function syncContext() {
    const integrationAccountId = resolveIntegrationAccountId(authStore);
    if (integrationAccountId && !filters.integrationAccountId) {
      filters.integrationAccountId = integrationAccountId;
    }
    return { integrationAccountId: filters.integrationAccountId || integrationAccountId };
  }

  async function fetchList() {
    listError.value = '';
    loadingList.value = true;
    try {
      const ctx = syncContext();
      const params = {
        integrationAccountId: filters.integrationAccountId || ctx.integrationAccountId || undefined,
        status: filters.status || undefined,
        page: Number(filters.page || 1),
        pageSize: Number(filters.pageSize || 20)
      };
      const response = await listTransportOperations(params);
      items.value = Array.isArray(response.items) ? response.items : [];
      totalItems.value = Number(response.total || 0);
      const pageSize = Number(response.pageSize || filters.pageSize || 20);
      totalPages.value = pageSize > 0 ? Math.ceil(totalItems.value / pageSize) : 0;
      persistFilters(filters);
    } catch (error) {
      items.value = [];
      totalItems.value = 0;
      totalPages.value = 0;
      listError.value = extractErrorMessage(error, 'Falha ao listar operações de transporte.');
    } finally {
      loadingList.value = false;
    }
  }

  async function loadById(operationId) {
    if (!operationId) {
      selected.value = null;
      return null;
    }
    detailError.value = '';
    detailErrorCode.value = '';
    loadingDetail.value = true;
    try {
      const ctx = syncContext();
      const detail = await getTransportOperationById(operationId, {
        integrationAccountId: filters.integrationAccountId || ctx.integrationAccountId || undefined
      });
      selected.value = detail;
      return detail;
    } catch (error) {
      selected.value = null;
      detailError.value = extractErrorMessage(error, 'Falha ao carregar a operação de transporte.');
      detailErrorCode.value = extractErrorCode(error);
      return null;
    } finally {
      loadingDetail.value = false;
    }
  }

  async function loadCompliance(operationId) {
    if (!operationId) {
      complianceOverview.value = null;
      return null;
    }
    complianceError.value = '';
    loadingCompliance.value = true;
    try {
      const ctx = syncContext();
      const overview = await getTransportOperationCompliance(operationId, {
        integrationAccountId: filters.integrationAccountId || ctx.integrationAccountId || undefined
      });
      complianceOverview.value = overview;
      return overview;
    } catch (error) {
      complianceOverview.value = null;
      complianceError.value = extractErrorMessage(error, 'Falha ao carregar o painel de conformidade.');
      return null;
    } finally {
      loadingCompliance.value = false;
    }
  }

  async function executeCommand(label, fn) {
    commandError.value = '';
    commandErrorCode.value = '';
    commandFeedback.value = '';
    commandLoading.value = true;
    try {
      const result = await fn();
      commandFeedback.value = label;
      lastCommand.value = result || null;
      return result;
    } catch (error) {
      commandError.value = extractErrorMessage(error, label);
      commandErrorCode.value = extractErrorCode(error);
      throw error;
    } finally {
      commandLoading.value = false;
    }
  }

  /** Aplica o `{ operation, evaluation }` das transições ativadas por gate ao estado local. */
  function applyOperationWithEvaluation(response) {
    if (response?.operation) {
      selected.value = response.operation;
    }
    return response;
  }

  async function submitValidation() {
    if (!selected.value?.id) return null;
    const ctx = syncContext();
    return executeCommand('Validação submetida.', async () => {
      const response = await submitTransportOperationValidation(selected.value.id, {
        integrationAccountId: filters.integrationAccountId || ctx.integrationAccountId,
        version: selected.value.version
      });
      applyOperationWithEvaluation(response);
      await loadCompliance(selected.value.id);
      return response;
    });
  }

  async function contract({ contractedAmount } = {}) {
    if (!selected.value?.id) return null;
    const ctx = syncContext();
    return executeCommand('Operação contratada.', async () => {
      const payload = {
        integrationAccountId: filters.integrationAccountId || ctx.integrationAccountId,
        version: selected.value.version
      };
      if (contractedAmount !== undefined && contractedAmount !== null && contractedAmount !== '') {
        payload.contractedAmount = Number(contractedAmount);
      }
      const response = await contractTransportOperation(selected.value.id, payload);
      applyOperationWithEvaluation(response);
      await loadCompliance(selected.value.id);
      return response;
    });
  }

  async function reopen() {
    if (!selected.value?.id) return null;
    const ctx = syncContext();
    return executeCommand('Operação reaberta para correção.', async () => {
      const response = await reopenTransportOperation(selected.value.id, {
        integrationAccountId: filters.integrationAccountId || ctx.integrationAccountId,
        version: selected.value.version
      });
      selected.value = response;
      return response;
    });
  }

  async function cancel({ reason } = {}) {
    if (!selected.value?.id) return null;
    const ctx = syncContext();
    return executeCommand('Operação cancelada.', async () => {
      const response = await cancelTransportOperation(selected.value.id, {
        integrationAccountId: filters.integrationAccountId || ctx.integrationAccountId,
        version: selected.value.version,
        reason
      });
      selected.value = response;
      return response;
    });
  }

  /** Reavalia UM gate ad-hoc (sem transição) e recarrega o overview de conformidade. */
  async function revalidateGate(gate) {
    if (!selected.value?.id || !gate) return null;
    const ctx = syncContext();
    return executeCommand('Conformidade revalidada.', async () => {
      const evaluation = await validateTransportOperationCompliance(selected.value.id, {
        integrationAccountId: filters.integrationAccountId || ctx.integrationAccountId,
        gate
      });
      await loadCompliance(selected.value.id);
      return evaluation;
    });
  }

  // ---------------------------------------------------------------------
  // Piso mínimo de frete.
  // ---------------------------------------------------------------------

  async function loadPisoCalculations(operationId) {
    const id = operationId || selected.value?.id;
    if (!id) return;
    pisoError.value = '';
    loadingPiso.value = true;
    try {
      const ctx = syncContext();
      const response = await listTransportOperationFloorCalculations(id, {
        integrationAccountId: filters.integrationAccountId || ctx.integrationAccountId
      });
      pisoCalculations.value = Array.isArray(response.items) ? response.items : [];
    } catch (error) {
      pisoCalculations.value = [];
      pisoError.value = extractErrorMessage(error, 'Falha ao carregar o histórico de cálculos de piso.');
    } finally {
      loadingPiso.value = false;
    }
  }

  /** Calcula e persiste o piso (SEMPRE grava uma linha, mesmo sem `outcome=calculated`). */
  async function calcularPiso({ referenceDate } = {}) {
    if (!selected.value?.id) return null;
    const ctx = syncContext();
    return executeCommand('Piso mínimo calculado.', async () => {
      const payload = {
        integrationAccountId: filters.integrationAccountId || ctx.integrationAccountId,
        version: selected.value.version
      };
      if (referenceDate) payload.referenceDate = referenceDate;
      const calculation = await calculateTransportOperationFloor(selected.value.id, payload);
      // `outcome=calculated` atualiza freight.floorAmount no cabeçalho — recarrega
      // o agregado para refletir (mesmo CAS de version das demais transições).
      await loadById(selected.value.id);
      await loadPisoCalculations(selected.value.id);
      return calculation;
    });
  }

  // ---------------------------------------------------------------------
  // CIOT.
  // ---------------------------------------------------------------------

  async function loadCiot(operationId) {
    const id = operationId || selected.value?.id;
    if (!id) return;
    ciotError.value = '';
    loadingCiot.value = true;
    try {
      const ctx = syncContext();
      ciotState.value = await getTransportOperationCiot(id, {
        integrationAccountId: filters.integrationAccountId || ctx.integrationAccountId
      });
    } catch (error) {
      ciotState.value = null;
      ciotError.value = extractErrorMessage(error, 'Falha ao carregar o CIOT da operação.');
    } finally {
      loadingCiot.value = false;
    }
  }

  /** Síncrono — roda GATE_CIOT sem criar `ciot_operations` nem enfileirar nada. */
  async function preValidarCiot() {
    if (!selected.value?.id) return null;
    const ctx = syncContext();
    return executeCommand('Pré-validação de CIOT concluída.', () =>
      preValidateTransportOperationCiot(selected.value.id, {
        integrationAccountId: filters.integrationAccountId || ctx.integrationAccountId
      })
    );
  }

  /** 202 — cria/retenta `ciot_operations` e aguarda o job antes de recarregar. */
  async function solicitarCiot({ responsibleParty } = {}) {
    if (!selected.value?.id) return null;
    const ctx = syncContext();
    return executeCommand('CIOT solicitado.', async () => {
      const payload = { integrationAccountId: filters.integrationAccountId || ctx.integrationAccountId };
      if (responsibleParty) payload.responsibleParty = responsibleParty;
      const accepted = await requestTransportOperationCiot(selected.value.id, payload, {
        idempotencyKey: buildTransporteIdempotencyKey('ciot-solicitar')
      });
      await awaitJob(accepted.jobId);
      await loadCiot(selected.value.id);
      await loadById(selected.value.id);
      return accepted;
    });
  }

  async function retificarCiot() {
    if (!selected.value?.id) return null;
    const ctx = syncContext();
    return executeCommand('Retificação de CIOT solicitada.', async () => {
      const accepted = await rectifyTransportOperationCiot(selected.value.id, {
        integrationAccountId: filters.integrationAccountId || ctx.integrationAccountId
      }, { idempotencyKey: buildTransporteIdempotencyKey('ciot-retificar') });
      await awaitJob(accepted.jobId);
      await loadCiot(selected.value.id);
      return accepted;
    });
  }

  /** NÃO cancela a operação de transporte — ciclo distinto (ver openapi). */
  async function cancelarCiot({ reason } = {}) {
    if (!selected.value?.id) return null;
    const ctx = syncContext();
    return executeCommand('Cancelamento de CIOT solicitado.', async () => {
      const payload = { integrationAccountId: filters.integrationAccountId || ctx.integrationAccountId };
      if (reason) payload.reason = reason;
      const accepted = await cancelTransportOperationCiot(selected.value.id, payload, {
        idempotencyKey: buildTransporteIdempotencyKey('ciot-cancelar')
      });
      await awaitJob(accepted.jobId);
      await loadCiot(selected.value.id);
      return accepted;
    });
  }

  async function encerrarCiot() {
    if (!selected.value?.id) return null;
    const ctx = syncContext();
    return executeCommand('Encerramento de CIOT solicitado.', async () => {
      const accepted = await closeTransportOperationCiot(selected.value.id, {
        integrationAccountId: filters.integrationAccountId || ctx.integrationAccountId
      }, { idempotencyKey: buildTransporteIdempotencyKey('ciot-encerrar') });
      await awaitJob(accepted.jobId);
      await loadCiot(selected.value.id);
      await loadById(selected.value.id);
      return accepted;
    });
  }

  // ---------------------------------------------------------------------
  // VPO (Vale-Pedágio Obrigatório).
  // ---------------------------------------------------------------------

  async function loadVpo(operationId) {
    const id = operationId || selected.value?.id;
    if (!id) return;
    vpoError.value = '';
    loadingVpo.value = true;
    try {
      const ctx = syncContext();
      vpoState.value = await getTransportOperationVpo(id, {
        integrationAccountId: filters.integrationAccountId || ctx.integrationAccountId
      });
    } catch (error) {
      vpoState.value = null;
      vpoError.value = extractErrorMessage(error, 'Falha ao carregar o VPO da operação.');
    } finally {
      loadingVpo.value = false;
    }
  }

  /** Síncrono — roda o VpoApplicabilityEngine e faz upsert em `vpo_allocations`. */
  async function avaliarVpo() {
    if (!selected.value?.id) return null;
    const ctx = syncContext();
    return executeCommand('Aplicabilidade de VPO avaliada.', async () => {
      const allocation = await evaluateTransportOperationVpoApplicability(selected.value.id, {
        integrationAccountId: filters.integrationAccountId || ctx.integrationAccountId
      });
      await loadVpo(selected.value.id);
      return allocation;
    });
  }

  /** Síncrono — aquisição MANUAL (evidência declarada). Atualiza `freight.vpoAmount` (CAS). */
  async function registrarAquisicaoVpo({ providerId, providerReference, amount, evidence }) {
    if (!selected.value?.id) return null;
    const ctx = syncContext();
    return executeCommand('Aquisição de VPO registrada.', async () => {
      const payload = {
        integrationAccountId: filters.integrationAccountId || ctx.integrationAccountId,
        version: selected.value.version,
        providerId,
        amount: Number(amount),
        evidence: evidence && Object.keys(evidence).length ? evidence : { notes: 'Aquisição manual declarada.' }
      };
      if (providerReference) payload.providerReference = providerReference;
      const allocation = await registerTransportOperationVpoAcquisition(selected.value.id, payload);
      await loadVpo(selected.value.id);
      await loadById(selected.value.id);
      return allocation;
    });
  }

  /** 202 — aquisição via provedor (mock nesta fase). */
  async function adquirirVpo({ providerId }) {
    if (!selected.value?.id) return null;
    const ctx = syncContext();
    return executeCommand('Aquisição de VPO solicitada ao provedor.', async () => {
      const accepted = await acquireTransportOperationVpo(selected.value.id, {
        integrationAccountId: filters.integrationAccountId || ctx.integrationAccountId,
        providerId
      }, { idempotencyKey: buildTransporteIdempotencyKey('vpo-adquirir') });
      await awaitJob(accepted.jobId);
      await loadVpo(selected.value.id);
      await loadById(selected.value.id);
      return accepted;
    });
  }

  // ---------------------------------------------------------------------
  // Documentos fiscais (DF-e) vinculados à operação.
  // ---------------------------------------------------------------------

  async function loadFiscalDocuments(operationId) {
    const id = operationId || selected.value?.id;
    if (!id) return;
    fiscalDocumentsError.value = '';
    loadingFiscalDocuments.value = true;
    try {
      const ctx = syncContext();
      const response = await listTransportOperationFiscalDocuments(id, {
        integrationAccountId: filters.integrationAccountId || ctx.integrationAccountId
      });
      fiscalDocuments.value = Array.isArray(response.items) ? response.items : [];
    } catch (error) {
      fiscalDocuments.value = [];
      fiscalDocumentsError.value = extractErrorMessage(error, 'Falha ao carregar os documentos fiscais da operação.');
    } finally {
      loadingFiscalDocuments.value = false;
    }
  }

  /** Importa (e opcionalmente já vincula, quando `operationId` está preenchido). */
  async function importarDocumentoFiscal({ xmlContent, linkToSelected = true }) {
    const ctx = syncContext();
    return executeCommand('Documento fiscal importado.', async () => {
      const payload = { integrationAccountId: filters.integrationAccountId || ctx.integrationAccountId, xmlContent };
      if (linkToSelected && selected.value?.id) payload.operationId = selected.value.id;
      const document = await importTransportFiscalDocument(payload);
      if (linkToSelected && selected.value?.id) await loadFiscalDocuments(selected.value.id);
      return document;
    });
  }

  async function vincularDocumentoFiscal(documentId) {
    if (!selected.value?.id) return null;
    const ctx = syncContext();
    return executeCommand('Documento fiscal vinculado.', async () => {
      const document = await linkTransportFiscalDocument(documentId, {
        integrationAccountId: filters.integrationAccountId || ctx.integrationAccountId,
        operationId: selected.value.id
      });
      await loadFiscalDocuments(selected.value.id);
      return document;
    });
  }

  async function desvincularDocumentoFiscal(documentId) {
    const ctx = syncContext();
    return executeCommand('Documento fiscal desvinculado.', async () => {
      const document = await unlinkTransportFiscalDocument(documentId, {
        integrationAccountId: filters.integrationAccountId || ctx.integrationAccountId
      });
      if (selected.value?.id) await loadFiscalDocuments(selected.value.id);
      return document;
    });
  }

  async function revalidarDocumentoFiscal(documentId) {
    const ctx = syncContext();
    return executeCommand('Documento fiscal revalidado.', async () => {
      const document = await revalidateTransportFiscalDocument(documentId, {
        integrationAccountId: filters.integrationAccountId || ctx.integrationAccountId
      });
      if (selected.value?.id) await loadFiscalDocuments(selected.value.id);
      return document;
    });
  }

  // ---------------------------------------------------------------------
  // Emissão de DF-e (sandbox-ready).
  // ---------------------------------------------------------------------

  async function loadEmissoes(operationId) {
    const id = operationId || selected.value?.id;
    if (!id) return;
    emissoesError.value = '';
    loadingEmissoes.value = true;
    try {
      const ctx = syncContext();
      const response = await listTransportOperationDfeIssuances(id, {
        integrationAccountId: filters.integrationAccountId || ctx.integrationAccountId
      });
      emissoes.value = Array.isArray(response.items) ? response.items : [];
    } catch (error) {
      emissoes.value = [];
      emissoesError.value = extractErrorMessage(error, 'Falha ao carregar as emissões de DF-e da operação.');
    } finally {
      loadingEmissoes.value = false;
    }
  }

  /** 202 — recusa 409 DFE_ISSUANCE_FEATURE_DISABLED quando DFE_ISSUANCE_MODE=off. */
  async function solicitarEmissao({ documentType }) {
    if (!selected.value?.id) return null;
    const ctx = syncContext();
    return executeCommand('Emissão de DF-e solicitada.', async () => {
      const accepted = await requestTransportOperationDfeIssuance(selected.value.id, {
        integrationAccountId: filters.integrationAccountId || ctx.integrationAccountId,
        documentType
      }, { idempotencyKey: buildTransporteIdempotencyKey('dfe-emissao') });
      await awaitJob(accepted.jobId);
      await loadEmissoes(selected.value.id);
      return accepted;
    });
  }

  async function cancelarEmissao(issuanceId) {
    const ctx = syncContext();
    return executeCommand('Cancelamento de emissão solicitado.', async () => {
      const accepted = await cancelTransportDfeIssuance(issuanceId, {
        integrationAccountId: filters.integrationAccountId || ctx.integrationAccountId
      }, { idempotencyKey: buildTransporteIdempotencyKey('dfe-cancelar') });
      await awaitJob(accepted.jobId);
      if (selected.value?.id) await loadEmissoes(selected.value.id);
      return accepted;
    });
  }

  function resetFilters() {
    Object.assign(filters, DEFAULT_FILTERS);
    filters.integrationAccountId = resolveIntegrationAccountId(authStore) || '';
    items.value = [];
    totalItems.value = 0;
    totalPages.value = 0;
    listError.value = '';
    persistFilters(filters);
  }

  function clearCommandState() {
    commandError.value = '';
    commandErrorCode.value = '';
    commandFeedback.value = '';
  }

  return {
    filters,
    items,
    totalItems,
    totalPages,
    loadingList,
    listError,
    selected,
    loadingDetail,
    detailError,
    detailErrorCode,
    complianceOverview,
    loadingCompliance,
    complianceError,
    commandLoading,
    commandError,
    commandErrorCode,
    commandFeedback,
    lastCommand,
    fetchList,
    loadById,
    loadCompliance,
    submitValidation,
    contract,
    reopen,
    cancel,
    revalidateGate,
    resetFilters,
    clearCommandState,
    syncContext,

    // Piso mínimo.
    pisoCalculations,
    loadingPiso,
    pisoError,
    loadPisoCalculations,
    calcularPiso,

    // CIOT.
    ciotState,
    loadingCiot,
    ciotError,
    loadCiot,
    preValidarCiot,
    solicitarCiot,
    retificarCiot,
    cancelarCiot,
    encerrarCiot,

    // VPO.
    vpoState,
    loadingVpo,
    vpoError,
    loadVpo,
    avaliarVpo,
    registrarAquisicaoVpo,
    adquirirVpo,

    // Documentos fiscais.
    fiscalDocuments,
    loadingFiscalDocuments,
    fiscalDocumentsError,
    loadFiscalDocuments,
    importarDocumentoFiscal,
    vincularDocumentoFiscal,
    desvincularDocumentoFiscal,
    revalidarDocumentoFiscal,

    // Emissão de DF-e.
    emissoes,
    loadingEmissoes,
    emissoesError,
    loadEmissoes,
    solicitarEmissao,
    cancelarEmissao
  };
}
