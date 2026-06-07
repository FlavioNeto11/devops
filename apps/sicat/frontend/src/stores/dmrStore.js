/**
 * Store DMR — cadeia dmr-fluxo-base, fase 07-frontend-ux.
 *
 * Mantém estado mínimo: filtros, lista paginada, declaração ativa,
 * itens, status enriquecido e último erro. Actions delegam ao
 * dmrService.js, sem falar HTTP direto.
 */

import { reactive, ref } from 'vue';
import {
  addDmrItem,
  buildDmrIdempotencyKey,
  consolidateDmr,
  createDmr,
  deleteDmr,
  getDmrById,
  getDmrStatus,
  listDmr,
  listDmrItems,
  listPendingDmr,
  removeDmrItem,
  submitDmr
} from '../services/dmrService.js';
import { useAuthStore } from './auth.js';

const DMR_FILTERS_KEY = 'sicat_dmr_list_filters';

const DEFAULT_FILTERS = Object.freeze({
  integrationAccountId: '',
  status: '',
  role: '',
  periodStart: '',
  periodEnd: '',
  limit: 50,
  offset: 0
});

function loadPersistedFilters() {
  try {
    const raw = localStorage.getItem(DMR_FILTERS_KEY);
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
    localStorage.setItem(DMR_FILTERS_KEY, JSON.stringify({
      integrationAccountId: String(filters.integrationAccountId || '').trim(),
      status: String(filters.status || '').trim(),
      role: String(filters.role || '').trim(),
      periodStart: String(filters.periodStart || '').trim(),
      periodEnd: String(filters.periodEnd || '').trim(),
      limit: Number(filters.limit || 50),
      offset: Number(filters.offset || 0)
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
  // application/problem+json — preserva detail/title
  return error.detail || error.title || error.message || fallback;
}

export function useDmrStore() {
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
  const total = ref(0);
  const loadingList = ref(false);
  const listError = ref('');

  const pendingItems = ref([]);
  const loadingPending = ref(false);
  const pendingError = ref('');

  const selectedDmr = ref(null);
  const selectedItems = ref([]);
  const selectedStatus = ref(null);
  const loadingDetail = ref(false);
  const detailError = ref('');

  const commandLoading = ref(false);
  const commandError = ref('');
  const commandFeedback = ref('');

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
        role: filters.role || undefined,
        periodStart: filters.periodStart || undefined,
        periodEnd: filters.periodEnd || undefined,
        limit: Number(filters.limit || 50),
        offset: Number(filters.offset || 0)
      };
      const response = await listDmr(params);
      items.value = Array.isArray(response.items) ? response.items : [];
      total.value = Number(response.total || 0);
      persistFilters(filters);
    } catch (error) {
      items.value = [];
      total.value = 0;
      listError.value = extractErrorMessage(error, 'Falha ao listar DMRs.');
    } finally {
      loadingList.value = false;
    }
  }

  async function fetchPending() {
    pendingError.value = '';
    loadingPending.value = true;
    try {
      const ctx = syncContext();
      const params = {
        integrationAccountId: filters.integrationAccountId || ctx.integrationAccountId || undefined
      };
      const response = await listPendingDmr(params);
      pendingItems.value = Array.isArray(response.items) ? response.items : [];
    } catch (error) {
      pendingItems.value = [];
      pendingError.value = extractErrorMessage(error, 'Falha ao listar DMRs pendentes.');
    } finally {
      loadingPending.value = false;
    }
  }

  async function loadDmr(dmrId) {
    if (!dmrId) {
      selectedDmr.value = null;
      selectedItems.value = [];
      selectedStatus.value = null;
      return null;
    }

    detailError.value = '';
    loadingDetail.value = true;
    try {
      const detail = await getDmrById(dmrId);
      selectedDmr.value = detail;
      selectedItems.value = Array.isArray(detail?.items) ? detail.items : [];
      try {
        selectedStatus.value = await getDmrStatus(dmrId);
      } catch {
        selectedStatus.value = null;
      }
      return detail;
    } catch (error) {
      selectedDmr.value = null;
      selectedItems.value = [];
      selectedStatus.value = null;
      detailError.value = extractErrorMessage(error, 'Falha ao carregar DMR.');
      return null;
    } finally {
      loadingDetail.value = false;
    }
  }

  async function refreshSelectedItems() {
    if (!selectedDmr.value?.id) return;
    try {
      const response = await listDmrItems(selectedDmr.value.id);
      selectedItems.value = Array.isArray(response?.items) ? response.items : [];
    } catch (error) {
      detailError.value = extractErrorMessage(error, 'Falha ao recarregar itens.');
    }
  }

  async function executeCommand(label, fn) {
    commandError.value = '';
    commandFeedback.value = '';
    commandLoading.value = true;
    try {
      const result = await fn();
      commandFeedback.value = label;
      return result;
    } catch (error) {
      commandError.value = extractErrorMessage(error, label);
      throw error;
    } finally {
      commandLoading.value = false;
    }
  }

  async function createDmrDraft(payload) {
    return executeCommand('DMR rascunho criada com sucesso.', async () => {
      const created = await createDmr(payload, { idempotencyKey: buildDmrIdempotencyKey('dmr-create') });
      return created;
    });
  }

  async function consolidateSelected({ force = false } = {}) {
    if (!selectedDmr.value?.id) return null;
    return executeCommand('DMR consolidada.', async () => {
      const detail = await consolidateDmr(
        selectedDmr.value.id,
        { force },
        { idempotencyKey: buildDmrIdempotencyKey('dmr-consolidate') }
      );
      selectedDmr.value = detail;
      selectedItems.value = Array.isArray(detail?.items) ? detail.items : [];
      try {
        selectedStatus.value = await getDmrStatus(selectedDmr.value.id);
      } catch {
        selectedStatus.value = null;
      }
      return detail;
    });
  }

  async function submitSelected({ sessionContextId, validateOnly = false, requestedBy } = {}) {
    if (!selectedDmr.value?.id) return null;
    const ctx = syncContext();
    const resolvedSessionContextId = String(sessionContextId || ctx.sessionContextId || '').trim();
    if (!resolvedSessionContextId) {
      commandError.value = 'sessionContextId obrigatório (ative uma conta CETESB).';
      throw new Error(commandError.value);
    }
    return executeCommand('DMR enfileirada para envio.', async () => {
      const response = await submitDmr(
        selectedDmr.value.id,
        {
          sessionContextId: resolvedSessionContextId,
          validateOnly: Boolean(validateOnly),
          ...(requestedBy ? { requestedBy } : {})
        },
        { idempotencyKey: buildDmrIdempotencyKey('dmr-submit') }
      );
      try {
        selectedStatus.value = await getDmrStatus(selectedDmr.value.id);
      } catch {
        selectedStatus.value = null;
      }
      return response;
    });
  }

  async function cancelSelected() {
    if (!selectedDmr.value?.id) return null;
    return executeCommand('DMR cancelada.', async () => {
      const response = await deleteDmr(selectedDmr.value.id);
      selectedDmr.value = { ...selectedDmr.value, status: 'cancelled' };
      try {
        selectedStatus.value = await getDmrStatus(selectedDmr.value.id);
      } catch {
        selectedStatus.value = null;
      }
      return response;
    });
  }

  async function addItem(payload) {
    if (!selectedDmr.value?.id) return null;
    return executeCommand('Item adicionado à DMR.', async () => {
      const item = await addDmrItem(
        selectedDmr.value.id,
        payload,
        { idempotencyKey: buildDmrIdempotencyKey('dmr-item') }
      );
      await refreshSelectedItems();
      return item;
    });
  }

  async function removeItem(itemId) {
    if (!selectedDmr.value?.id || !itemId) return null;
    return executeCommand('Item removido da DMR.', async () => {
      const response = await removeDmrItem(selectedDmr.value.id, itemId);
      await refreshSelectedItems();
      return response;
    });
  }

  function resetFilters() {
    Object.assign(filters, DEFAULT_FILTERS);
    const ctx = resolveActiveContext(authStore);
    filters.integrationAccountId = ctx.integrationAccountId || '';
    items.value = [];
    total.value = 0;
    listError.value = '';
    persistFilters(filters);
  }

  function clearCommandState() {
    commandError.value = '';
    commandFeedback.value = '';
  }

  return {
    filters,
    items,
    total,
    loadingList,
    listError,
    pendingItems,
    loadingPending,
    pendingError,
    selectedDmr,
    selectedItems,
    selectedStatus,
    loadingDetail,
    detailError,
    commandLoading,
    commandError,
    commandFeedback,
    fetchList,
    fetchPending,
    loadDmr,
    refreshSelectedItems,
    createDmrDraft,
    consolidateSelected,
    submitSelected,
    cancelSelected,
    addItem,
    removeItem,
    resetFilters,
    clearCommandState,
    syncContext
  };
}
