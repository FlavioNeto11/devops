import { reactive, ref } from 'vue';
import { getManifestById, listManifests } from '../services/api.js';
import { useAuthStore } from './auth.js';
import { getTodayBr, isoDateToBrDate, normalizeBrDateInput, toApiDate } from '../utils/date-format.js';

const INTEGRATION_ACCOUNT_ID_KEY = 'sicat_active_integration_account_id';
const MANIFEST_FILTERS_KEY = 'sicat_manifest_list_filters';
const DEFAULT_INTEGRATION_ACCOUNT_ID = (import.meta.env.VITE_INTEGRATION_ACCOUNT_ID || '').trim();

function loadDefaultIntegrationAccountId() {
  const persisted = localStorage.getItem(INTEGRATION_ACCOUNT_ID_KEY);
  if (persisted) {
    return persisted;
  }

  if (DEFAULT_INTEGRATION_ACCOUNT_ID) {
    return DEFAULT_INTEGRATION_ACCOUNT_ID;
  }

  return '';
}

function loadPersistedManifestFilters() {
  try {
    const raw = localStorage.getItem(MANIFEST_FILTERS_KEY);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

function persistManifestFilters(filters) {
  const payload = {
    integrationAccountId: String(filters.integrationAccountId || '').trim(),
    status: String(filters.status || '').trim(),
    groupId: String(filters.groupId || '').trim(),
    manifestNumber: String(filters.manifestNumber || '').trim(),
    carrierQuery: String(filters.carrierQuery || '').trim(),
    receiverQuery: String(filters.receiverQuery || '').trim(),
    dateFrom: String(filters.dateFrom || '').trim(),
    dateTo: String(filters.dateTo || '').trim(),
    page: Number(filters.page || 1),
    pageSize: Number(filters.pageSize || 20)
  };

  localStorage.setItem(MANIFEST_FILTERS_KEY, JSON.stringify(payload));
}

function resolveActiveOperationalContext(authStore) {
  const integrationAccountId = String(
    authStore.integrationAccountId.value
    || authStore.sessionContext.value?.integrationAccountId
    || ''
  ).trim();
  const sessionContextId = String(
    authStore.sessionContext.value?.sessionContextId
    || authStore.sessionContext.value?.id
    || ''
  ).trim();

  return {
    integrationAccountId,
    sessionContextId
  };
}

function resolveInitialIntegrationAccountId(authStore, persistedFilters) {
  const activeContext = resolveActiveOperationalContext(authStore);
  if (activeContext.integrationAccountId) {
    return activeContext.integrationAccountId;
  }

  return String(persistedFilters?.integrationAccountId || loadDefaultIntegrationAccountId()).trim();
}

function applySingleDayWindow(requestParams, fallbackIso) {
  const singleDayIso = requestParams.dateTo || requestParams.dateFrom || fallbackIso;
  requestParams.dateFrom = singleDayIso;
  requestParams.dateTo = singleDayIso;
  return singleDayIso;
}

function normalizeMessageForMatch(message) {
  return String(message || '')
    .normalize('NFD')
    .replaceAll(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function hasCetesbSingleDayIntervalError(message) {
  const normalized = normalizeMessageForMatch(message);
  const hasIntervalContext = normalized.includes('intervalo')
    && normalized.includes('datas')
    && normalized.includes('maior que');

  const hasSingleDayHint = normalized.includes('0 dias') || normalized.includes('zero dias');

  return hasIntervalContext && hasSingleDayHint;
}

export function useManifestsStore() {
  const authStore = useAuthStore();
  const persistedFilters = loadPersistedManifestFilters();

  const filters = reactive({
    integrationAccountId: resolveInitialIntegrationAccountId(authStore, persistedFilters),
    status: String(persistedFilters?.status || '').trim(),
    groupId: String(persistedFilters?.groupId || '').trim(),
    manifestNumber: String(persistedFilters?.manifestNumber || '').trim(),
    carrierQuery: String(persistedFilters?.carrierQuery || '').trim(),
    receiverQuery: String(persistedFilters?.receiverQuery || '').trim(),
    dateFrom: String(persistedFilters?.dateFrom || getTodayBr()).trim(),
    dateTo: String(persistedFilters?.dateTo || getTodayBr()).trim(),
    page: Number(persistedFilters?.page || 1),
    pageSize: Number(persistedFilters?.pageSize || 20)
  });

  const items = ref([]);
  const page = ref(1);
  const pageSize = ref(20);
  const totalItems = ref(0);
  const totalPages = ref(0);

  const loadingList = ref(false);
  const loadingDetail = ref(false);
  const error = ref('');
  const syncWarning = ref('');
  const syncWarningMeta = ref(null);

  const selectedManifestId = ref('');
  const selectedManifest = ref(null);

  const hasSearched = ref(false);

  async function syncWithActiveOperationalContext({ force = false, resetPage = false } = {}) {
    await authStore.ensureSessionContextReady({ force });

    const activeContext = resolveActiveOperationalContext(authStore);
    if (!activeContext.integrationAccountId || !activeContext.sessionContextId) {
      return {
        ready: false,
        integrationAccountId: '',
        sessionContextId: ''
      };
    }

    filters.integrationAccountId = activeContext.integrationAccountId;

    if (resetPage) {
      filters.page = 1;
    }

    localStorage.setItem(INTEGRATION_ACCOUNT_ID_KEY, activeContext.integrationAccountId);
    persistManifestFilters(filters);

    return {
      ready: true,
      integrationAccountId: activeContext.integrationAccountId,
      sessionContextId: activeContext.sessionContextId
    };
  }

  function buildManifestRequestParams(operationalContext) {
    const normalizedDateFrom = normalizeBrDateInput(filters.dateFrom);
    const normalizedDateTo = normalizeBrDateInput(filters.dateTo);

    filters.dateFrom = normalizedDateFrom;
    filters.dateTo = normalizedDateTo;

    const manifestNumber = String(filters.manifestNumber || '').trim() || undefined;
    // Busca por número ignora o período: a API não exige datas e o backend
    // AND-a número com a janela — com o default "hoje", um MTR de semana
    // passada voltaria vazio sem explicação.
    const skipDateWindow = Boolean(manifestNumber);

    return {
      integrationAccountId: operationalContext.integrationAccountId,
      sessionContextId: operationalContext.sessionContextId || undefined,
      status: String(filters.status || '').trim() || undefined,
      groupId: String(filters.groupId || '').trim() || undefined,
      manifestNumber,
      carrierQuery: String(filters.carrierQuery || '').trim() || undefined,
      receiverQuery: String(filters.receiverQuery || '').trim() || undefined,
      dateFrom: skipDateWindow ? undefined : (toApiDate(normalizedDateFrom) || undefined),
      dateTo: skipDateWindow ? undefined : (toApiDate(normalizedDateTo) || undefined),
      page: filters.page,
      pageSize: filters.pageSize
    };
  }

  function syncVisibleFiltersWithIsoDate(isoDate) {
    const normalizedDate = isoDateToBrDate(isoDate);
    if (!normalizedDate) {
      return;
    }

    filters.dateFrom = normalizedDate;
    filters.dateTo = normalizedDate;
  }

  function isBootstrapMetadataError(message) {
    return String(message || '').includes('bootstrap/refresh de sessão real é obrigatório informar partnerCode, login, email e senha no metadata');
  }

  async function retrySearchAfterSessionBootstrap(requestParams, requestError) {
    const rehydrated = await authStore.ensureSessionContextReady({ force: true });
    if (!rehydrated) {
      throw requestError;
    }

    const refreshedContext = await syncWithActiveOperationalContext();
    if (!refreshedContext.ready) {
      throw requestError;
    }

    requestParams.integrationAccountId = refreshedContext.integrationAccountId;
    requestParams.sessionContextId = refreshedContext.sessionContextId || undefined;

    return listManifests(requestParams);
  }

  async function executeSearchWithRecovery(requestParams, todayIso) {
    try {
      return await listManifests(requestParams);
    } catch (requestError) {
      const message = String(requestError?.message || '');

      if (hasCetesbSingleDayIntervalError(message)) {
        const fallbackSingleDayIso = applySingleDayWindow(requestParams, todayIso);
        if (!fallbackSingleDayIso) {
          throw requestError;
        }

        syncVisibleFiltersWithIsoDate(fallbackSingleDayIso);
        return listManifests(requestParams);
      }

      if (!isBootstrapMetadataError(message)) {
        throw requestError;
      }

      return retrySearchAfterSessionBootstrap(requestParams, requestError);
    }
  }

  async function search() {
    hasSearched.value = true;
    error.value = '';
    syncWarning.value = '';
    syncWarningMeta.value = null;

    const operationalContext = await syncWithActiveOperationalContext();

    if (!operationalContext.ready) {
      error.value = 'Ative uma conta CETESB para buscar manifestos.';
      items.value = [];
      totalItems.value = 0;
      totalPages.value = 0;
      return;
    }

    loadingList.value = true;

    try {
      const todayIso = toApiDate(getTodayBr()) || undefined;
      const requestParams = buildManifestRequestParams(operationalContext);

      // Conta destinador agora pesquisa por INTERVALO (range): NÃO forçamos mais
      // janela de dia único. O backend segmenta a busca dia a dia na CETESB (DL-075).
      // Se a CETESB rejeitar o intervalo, executeSearchWithRecovery degrada de forma
      // resiliente para dia único (hasCetesbSingleDayIntervalError).
      const response = await executeSearchWithRecovery(requestParams, todayIso);

      items.value = Array.isArray(response.items) ? response.items : [];
      page.value = Number(response.page || filters.page || 1);
      pageSize.value = Number(response.pageSize || filters.pageSize || 20);
      totalItems.value = Number(response.totalItems || 0);
      totalPages.value = Number(response.totalPages || 0);
      syncWarning.value = String(response?.syncWarning?.message || '').trim();
      syncWarningMeta.value = response?.syncWarning || null;

      if (items.value.length === 0) {
        selectedManifestId.value = '';
        selectedManifest.value = null;
      }

      persistManifestFilters(filters);
    } catch (requestError) {
      const rawMessage = String(requestError?.message || '').trim();
      const isReceiverDateWindowError = hasCetesbSingleDayIntervalError(rawMessage);

      error.value = isReceiverDateWindowError
        ? 'Conta destinador exige busca diária. Ajuste os filtros para a mesma data inicial e final.'
        : (rawMessage || 'Falha ao carregar manifestos.');
      syncWarning.value = '';
      syncWarningMeta.value = null;
      items.value = [];
      totalItems.value = 0;
      totalPages.value = 0;
    } finally {
      loadingList.value = false;
    }
  }

  async function selectManifest(id) {
    if (!id) {
      selectedManifestId.value = '';
      selectedManifest.value = null;
      return;
    }

    selectedManifestId.value = id;
    loadingDetail.value = true;
    error.value = '';

    try {
      selectedManifest.value = await getManifestById(id);
    } catch (requestError) {
      error.value = requestError.message || 'Falha ao carregar detalhe do manifesto.';
      selectedManifest.value = null;
    } finally {
      loadingDetail.value = false;
    }
  }

  function clearSelection() {
    selectedManifestId.value = '';
    selectedManifest.value = null;
  }

  function resetFilters() {
    const activeContext = resolveActiveOperationalContext(authStore);
    filters.integrationAccountId = activeContext.integrationAccountId || loadDefaultIntegrationAccountId();
    filters.status = '';
    filters.groupId = '';
    filters.manifestNumber = '';
    filters.carrierQuery = '';
    filters.receiverQuery = '';
    filters.dateFrom = getTodayBr();
    filters.dateTo = getTodayBr();
    filters.page = 1;
    filters.pageSize = 20;
    error.value = '';
    syncWarning.value = '';
    syncWarningMeta.value = null;
    items.value = [];
    totalItems.value = 0;
    totalPages.value = 0;
    hasSearched.value = false;
    clearSelection();
    persistManifestFilters(filters);
  }

  async function changePage(nextPage) {
    if (nextPage < 1) {
      return;
    }

    filters.page = nextPage;
    persistManifestFilters(filters);
    await search();
  }

  function updatePageSize(nextPageSize) {
    filters.pageSize = Number(nextPageSize);
    filters.page = 1;
    persistManifestFilters(filters);
  }

  return {
    filters,
    items,
    page,
    pageSize,
    totalItems,
    totalPages,
    loadingList,
    loadingDetail,
    error,
    syncWarning,
    syncWarningMeta,
    selectedManifestId,
    selectedManifest,
    hasSearched,
    search,
    syncWithActiveOperationalContext,
    selectManifest,
    clearSelection,
    resetFilters,
    changePage,
    updatePageSize
  };
}
