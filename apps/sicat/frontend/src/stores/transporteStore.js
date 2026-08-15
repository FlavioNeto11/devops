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
  cancelTransportOperation,
  contractTransportOperation,
  getTransportOperationById,
  getTransportOperationCompliance,
  listTransportOperations,
  reopenTransportOperation,
  submitTransportOperationValidation,
  validateTransportOperationCompliance
} from '../services/transporteService.js';
import { useAuthStore } from './auth.js';

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
    syncContext
  };
}
