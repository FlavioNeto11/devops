/**
 * Store de Veículos (cadastro-base) — programa "SICAT Transporte" (DL-103),
 * PR-H2 (frontend completo). Molde: stores/transporteStore.js.
 *
 * Backend: `/v1/transporte/veiculos*` — CRUD com locking otimista via
 * `version`. Tenancy obrigatória em toda leitura.
 */

import { reactive, ref } from 'vue';
import {
  createTransportVehicle,
  getTransportVehicleById,
  listTransportVehicles,
  updateTransportVehicle
} from '../services/transporteService.js';
import { useAuthStore } from './auth.js';

const DEFAULT_FILTERS = Object.freeze({
  integrationAccountId: '',
  search: '',
  vehicleType: '',
  page: 1,
  pageSize: 20
});

function resolveIntegrationAccountId(authStore) {
  return String(
    authStore.integrationAccountId.value
    || authStore.sessionContext.value?.integrationAccountId
    || ''
  ).trim();
}

function extractErrorMessage(error, fallback) {
  if (!error) return fallback;
  return error.detail || error.title || error.message || fallback;
}

function extractErrorCode(error) {
  return String(error?.payload?.code || error?.code || '').trim();
}

export function useVeiculosStore() {
  const authStore = useAuthStore();

  const filters = reactive({ ...DEFAULT_FILTERS, integrationAccountId: resolveIntegrationAccountId(authStore) });

  const items = ref([]);
  const totalItems = ref(0);
  const totalPages = ref(0);
  const loadingList = ref(false);
  const listError = ref('');

  const selected = ref(null);
  const loadingDetail = ref(false);
  const detailError = ref('');

  const commandLoading = ref(false);
  const commandError = ref('');
  const commandErrorCode = ref('');
  const commandFeedback = ref('');

  function syncContext() {
    const integrationAccountId = resolveIntegrationAccountId(authStore);
    if (integrationAccountId && !filters.integrationAccountId) {
      filters.integrationAccountId = integrationAccountId;
    }
    return { integrationAccountId: filters.integrationAccountId || integrationAccountId };
  }

  function clearCommandState() {
    commandError.value = '';
    commandErrorCode.value = '';
    commandFeedback.value = '';
  }

  async function executeCommand(label, fn) {
    clearCommandState();
    commandLoading.value = true;
    try {
      const result = await fn();
      commandFeedback.value = label;
      return result;
    } catch (error) {
      commandError.value = extractErrorMessage(error, label);
      commandErrorCode.value = extractErrorCode(error);
      throw error;
    } finally {
      commandLoading.value = false;
    }
  }

  async function fetchList() {
    listError.value = '';
    loadingList.value = true;
    try {
      const ctx = syncContext();
      const response = await listTransportVehicles({
        integrationAccountId: filters.integrationAccountId || ctx.integrationAccountId,
        search: filters.search || undefined,
        vehicleType: filters.vehicleType || undefined,
        page: Number(filters.page || 1),
        pageSize: Number(filters.pageSize || 20)
      });
      items.value = Array.isArray(response.items) ? response.items : [];
      totalItems.value = Number(response.total || 0);
      const pageSize = Number(response.pageSize || filters.pageSize || 20);
      totalPages.value = pageSize > 0 ? Math.ceil(totalItems.value / pageSize) : 0;
    } catch (error) {
      items.value = [];
      totalItems.value = 0;
      totalPages.value = 0;
      listError.value = extractErrorMessage(error, 'Falha ao listar veículos.');
    } finally {
      loadingList.value = false;
    }
  }

  async function loadById(vehicleId) {
    if (!vehicleId) {
      selected.value = null;
      return null;
    }
    detailError.value = '';
    loadingDetail.value = true;
    try {
      const ctx = syncContext();
      selected.value = await getTransportVehicleById(vehicleId, {
        integrationAccountId: filters.integrationAccountId || ctx.integrationAccountId
      });
      return selected.value;
    } catch (error) {
      selected.value = null;
      detailError.value = extractErrorMessage(error, 'Falha ao carregar o veículo.');
      return null;
    } finally {
      loadingDetail.value = false;
    }
  }

  async function createVehicle(payload) {
    const ctx = syncContext();
    return executeCommand('Veículo cadastrado.', () =>
      createTransportVehicle({ integrationAccountId: filters.integrationAccountId || ctx.integrationAccountId, ...payload })
    );
  }

  async function updateVehicle(vehicleId, payload) {
    if (!vehicleId) return null;
    const ctx = syncContext();
    return executeCommand('Veículo atualizado.', async () => {
      const updated = await updateTransportVehicle(vehicleId, {
        integrationAccountId: filters.integrationAccountId || ctx.integrationAccountId,
        version: selected.value?.version,
        ...payload
      });
      if (selected.value?.id === vehicleId) selected.value = updated;
      return updated;
    });
  }

  function resetFilters() {
    Object.assign(filters, DEFAULT_FILTERS);
    filters.integrationAccountId = resolveIntegrationAccountId(authStore) || '';
    items.value = [];
    totalItems.value = 0;
    totalPages.value = 0;
    listError.value = '';
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
    commandLoading,
    commandError,
    commandErrorCode,
    commandFeedback,
    fetchList,
    loadById,
    createVehicle,
    updateVehicle,
    resetFilters,
    clearCommandState,
    syncContext
  };
}
