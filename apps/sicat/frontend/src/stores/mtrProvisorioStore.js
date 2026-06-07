/**
 * Store MTR Provisório — cadeia mtr-provisorio-fluxo-base, fase 07-frontend-ux.
 *
 * Mantém estado mínimo: filtros, lista paginada, item ativo, comando
 * assíncrono em andamento e último erro. Actions delegam ao
 * mtrProvisorioService.js, sem falar HTTP direto.
 *
 * Backend:
 *  - GET    /v1/mtr-provisorio                  → lista paginada (page/pageSize)
 *  - POST   /v1/mtr-provisorio                  → 202 command-accepted (manifest.submit)
 *  - GET    /v1/mtr-provisorio/{id}             → detalhe enriquecido
 *  - DELETE /v1/mtr-provisorio/{id}             → cancela rascunho local
 *  - POST   /v1/mtr-provisorio/{id}/print       → 202 command-accepted (manifest.print)
 */

import { reactive, ref } from 'vue';
import {
  buildMtrProvisorioIdempotencyKey,
  cancelMtrProvisorio,
  createMtrProvisorio,
  getMtrProvisorioById,
  listMtrProvisorio,
  printMtrProvisorio
} from '../services/mtrProvisorioService.js';
import { useAuthStore } from './auth.js';

const FILTERS_KEY = 'sicat_mtr_provisorio_list_filters';

const DEFAULT_FILTERS = Object.freeze({
  integrationAccountId: '',
  status: '',
  dateFrom: '',
  dateTo: '',
  page: 1,
  pageSize: 50
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
      dateFrom: String(filters.dateFrom || '').trim(),
      dateTo: String(filters.dateTo || '').trim(),
      page: Number(filters.page || 1),
      pageSize: Number(filters.pageSize || 50)
    }));
  } catch {
    // ignore storage failures
  }
}

function resolveActiveContext(authStore) {
  return {
    integrationAccountId: String(
      authStore.integrationAccountId.value
      || authStore.sessionContext.value?.integrationAccountId
      || ''
    ).trim(),
    sessionContextId: String(
      authStore.sessionContext.value?.sessionContextId
      || authStore.sessionContext.value?.id
      || ''
    ).trim()
  };
}

function extractErrorMessage(error, fallback) {
  if (!error) return fallback;
  // application/problem+json — preserva detail/title.
  return error.detail || error.title || error.message || fallback;
}

export function useMtrProvisorioStore() {
  const authStore = useAuthStore();
  const persisted = loadPersistedFilters();
  const initialContext = resolveActiveContext(authStore);

  const filters = reactive({
    ...DEFAULT_FILTERS,
    ...persisted,
    integrationAccountId: initialContext.integrationAccountId
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

  const commandLoading = ref(false);
  const commandError = ref('');
  const commandErrorCode = ref('');
  const commandFeedback = ref('');
  const lastCommand = ref(null);

  function syncContext() {
    const ctx = resolveActiveContext(authStore);
    if (ctx.integrationAccountId && !filters.integrationAccountId) {
      filters.integrationAccountId = ctx.integrationAccountId;
    }
    return ctx;
  }

  async function fetchList() {
    listError.value = '';
    loadingList.value = true;
    try {
      const ctx = syncContext();
      const params = {
        integrationAccountId: filters.integrationAccountId || ctx.integrationAccountId || undefined,
        status: filters.status || undefined,
        dateFrom: filters.dateFrom || undefined,
        dateTo: filters.dateTo || undefined,
        page: Number(filters.page || 1),
        pageSize: Number(filters.pageSize || 50)
      };
      const response = await listMtrProvisorio(params);
      items.value = Array.isArray(response.items) ? response.items : [];
      totalItems.value = Number(response.totalItems || 0);
      totalPages.value = Number(response.totalPages || 0);
      persistFilters(filters);
    } catch (error) {
      items.value = [];
      totalItems.value = 0;
      totalPages.value = 0;
      listError.value = extractErrorMessage(error, 'Falha ao listar MTRs provisórios.');
    } finally {
      loadingList.value = false;
    }
  }

  async function loadById(id) {
    if (!id) {
      selected.value = null;
      return null;
    }
    detailError.value = '';
    detailErrorCode.value = '';
    loadingDetail.value = true;
    try {
      const detail = await getMtrProvisorioById(id);
      selected.value = detail;
      return detail;
    } catch (error) {
      selected.value = null;
      detailError.value = extractErrorMessage(error, 'Falha ao carregar MTR provisório.');
      detailErrorCode.value = String(error?.payload?.code || error?.code || '').trim();
      return null;
    } finally {
      loadingDetail.value = false;
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
      commandErrorCode.value = String(error?.payload?.code || error?.code || '').trim();
      throw error;
    } finally {
      commandLoading.value = false;
    }
  }

  async function createDraft(payload) {
    return executeCommand('MTR provisório enfileirado para envio.', async () => {
      const created = await createMtrProvisorio(payload, {
        idempotencyKey: buildMtrProvisorioIdempotencyKey('mtr-provisorio-create')
      });
      return created;
    });
  }

  async function cancelSelected() {
    if (!selected.value?.id) return null;
    return executeCommand('MTR provisório cancelado.', async () => {
      const response = await cancelMtrProvisorio(selected.value.id);
      selected.value = { ...selected.value, status: 'cancelled' };
      return response;
    });
  }

  async function printSelected({ sessionContextId, requestedBy } = {}) {
    if (!selected.value?.id) return null;
    const ctx = syncContext();
    const resolvedSessionContextId = String(
      sessionContextId || ctx.sessionContextId || ''
    ).trim();
    return executeCommand('Impressão do MTR provisório enfileirada.', async () => {
      const response = await printMtrProvisorio(
        selected.value.id,
        {
          ...(resolvedSessionContextId ? { sessionContextId: resolvedSessionContextId } : {}),
          ...(requestedBy ? { requestedBy } : {})
        },
        { idempotencyKey: buildMtrProvisorioIdempotencyKey('mtr-provisorio-print') }
      );
      // Recarrega o detalhe para refletir possível atualização do status.
      try {
        await loadById(selected.value.id);
      } catch {
        // mantém detalhe atual em caso de falha de reload
      }
      return response;
    });
  }

  function resetFilters() {
    Object.assign(filters, DEFAULT_FILTERS);
    const ctx = resolveActiveContext(authStore);
    filters.integrationAccountId = ctx.integrationAccountId || '';
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
    commandLoading,
    commandError,
    commandErrorCode,
    commandFeedback,
    lastCommand,
    fetchList,
    loadById,
    createDraft,
    cancelSelected,
    printSelected,
    resetFilters,
    clearCommandState,
    syncContext
  };
}
