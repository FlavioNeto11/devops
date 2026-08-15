/**
 * Store de dados de referência/consolidados da vertical Transporte — programa
 * "SICAT Transporte" (DL-103), PR-H2 (frontend completo). Alimenta
 * TransportePendenciasView (overview + fornecedoras VPO + vencimentos de
 * seguro) e TransportePisoTabelasView (tabelas de piso carregadas). Molde:
 * stores/transporteStore.js — sem estado de módulo compartilhado.
 *
 * Backend:
 *  - GET /v1/transporte/operations/overview       (Centro Operacional — POR CONTA, exceto
 *                                                    watch.pendingHumanReviewGlobal)
 *  - GET /v1/transporte/piso/tabelas                (GLOBAL, sem tenancy)
 *  - GET /v1/transporte/vpo/fornecedoras            (GLOBAL, sem tenancy)
 *  - GET /v1/transporte/seguros/vencimentos         (POR CONTA)
 */

import { ref } from 'vue';
import {
  getTransportOperationsOverview,
  listTransportFloorTables,
  listTransportInsuranceExpiryAlerts,
  listTransportVpoProviders
} from '../services/transporteService.js';
import { useAuthStore } from './auth.js';

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

export function useTransportePendenciasStore() {
  const authStore = useAuthStore();

  const overview = ref(null);
  const loadingOverview = ref(false);
  const overviewError = ref('');

  const floorTables = ref([]);
  const loadingFloorTables = ref(false);
  const floorTablesError = ref('');

  const vpoProviders = ref([]);
  const loadingVpoProviders = ref(false);
  const vpoProvidersError = ref('');

  const insuranceAlerts = ref([]);
  const insuranceAlertsWindowDays = ref(30);
  const loadingInsuranceAlerts = ref(false);
  const insuranceAlertsError = ref('');

  async function loadOverview() {
    overviewError.value = '';
    loadingOverview.value = true;
    try {
      const integrationAccountId = resolveIntegrationAccountId(authStore);
      overview.value = await getTransportOperationsOverview({ integrationAccountId });
    } catch (error) {
      overview.value = null;
      overviewError.value = extractErrorMessage(error, 'Falha ao carregar o Centro Operacional da vertical Transporte.');
    } finally {
      loadingOverview.value = false;
    }
  }

  async function loadFloorTables() {
    floorTablesError.value = '';
    loadingFloorTables.value = true;
    try {
      const response = await listTransportFloorTables();
      floorTables.value = Array.isArray(response.items) ? response.items : [];
    } catch (error) {
      floorTables.value = [];
      floorTablesError.value = extractErrorMessage(error, 'Falha ao carregar as tabelas de piso mínimo.');
    } finally {
      loadingFloorTables.value = false;
    }
  }

  async function loadVpoProviders() {
    vpoProvidersError.value = '';
    loadingVpoProviders.value = true;
    try {
      const response = await listTransportVpoProviders();
      vpoProviders.value = Array.isArray(response.items) ? response.items : [];
    } catch (error) {
      vpoProviders.value = [];
      vpoProvidersError.value = extractErrorMessage(error, 'Falha ao carregar as fornecedoras de VPO.');
    } finally {
      loadingVpoProviders.value = false;
    }
  }

  async function loadInsuranceAlerts({ windowDays } = {}) {
    insuranceAlertsError.value = '';
    loadingInsuranceAlerts.value = true;
    try {
      const integrationAccountId = resolveIntegrationAccountId(authStore);
      const response = await listTransportInsuranceExpiryAlerts({
        integrationAccountId,
        windowDays: windowDays || undefined
      });
      insuranceAlerts.value = Array.isArray(response.items) ? response.items : [];
      insuranceAlertsWindowDays.value = Number(response.windowDays || windowDays || 30);
    } catch (error) {
      insuranceAlerts.value = [];
      insuranceAlertsError.value = extractErrorMessage(error, 'Falha ao carregar os alertas de vencimento de seguro.');
    } finally {
      loadingInsuranceAlerts.value = false;
    }
  }

  return {
    overview,
    loadingOverview,
    overviewError,
    loadOverview,
    floorTables,
    loadingFloorTables,
    floorTablesError,
    loadFloorTables,
    vpoProviders,
    loadingVpoProviders,
    vpoProvidersError,
    loadVpoProviders,
    insuranceAlerts,
    insuranceAlertsWindowDays,
    loadingInsuranceAlerts,
    insuranceAlertsError,
    loadInsuranceAlerts
  };
}
