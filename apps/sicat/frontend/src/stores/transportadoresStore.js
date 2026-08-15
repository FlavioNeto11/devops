/**
 * Store de Transportadores (cadastro-base) — programa "SICAT Transporte"
 * (DL-103), PR-H2 (frontend completo). Molde: stores/transporteStore.js
 * (mesmo padrão: factory function chamada dentro do `<script setup>` de
 * quem usa — SEM estado de módulo compartilhado, cada chamada tem sua
 * própria instância reativa).
 *
 * Backend: `/v1/transporte/transportadores*` (CRUD com locking otimista via
 * `version`), `/v1/transporte/transportadores/{partyId}/verificar-rntrc`
 * (`manual` síncrono 200, `open_data` assíncrono 202), `/verificacoes-rntrc`
 * (histórico read-only), `/veiculos` (vínculo veículo↔transportador),
 * `/apolices*` (seguros RCTR-C/RC-DC/RC-V) e `/pgr` (Plano de Gerenciamento
 * de Risco). Tenancy obrigatória — `integrationAccountId` sempre explícito.
 */

import { reactive, ref } from 'vue';
import {
  createTransportCarrier,
  createTransportCarrierInsurancePolicy,
  createTransportCarrierPgr,
  getTransportCarrierById,
  linkTransportCarrierVehicle,
  listTransportCarrierInsurancePolicies,
  listTransportCarrierPgrs,
  listTransportCarrierRntrcVerifications,
  listTransportCarrierVehicleLinks,
  listTransportCarriers,
  updateTransportCarrier,
  updateTransportCarrierInsurancePolicy,
  verifyTransportCarrierInsurancePolicies,
  verifyTransportCarrierRntrc,
  buildTransporteIdempotencyKey
} from '../services/transporteService.js';
import { useAuthStore } from './auth.js';
import { useJobAwait } from '../composables/useJobAwait.js';

const DEFAULT_FILTERS = Object.freeze({
  integrationAccountId: '',
  search: '',
  rntrcStatus: '',
  role: '',
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

export function useTransportadoresStore() {
  const authStore = useAuthStore();
  const { awaitJob } = useJobAwait();

  const filters = reactive({ ...DEFAULT_FILTERS, integrationAccountId: resolveIntegrationAccountId(authStore) });

  const items = ref([]);
  const totalItems = ref(0);
  const totalPages = ref(0);
  const loadingList = ref(false);
  const listError = ref('');

  const selected = ref(null);
  const loadingDetail = ref(false);
  const detailError = ref('');

  const rntrcVerifications = ref([]);
  const loadingRntrcVerifications = ref(false);

  const vehicleLinks = ref([]);
  const loadingVehicleLinks = ref(false);

  const policies = ref([]);
  const loadingPolicies = ref(false);

  const pgrs = ref([]);
  const loadingPgrs = ref(false);

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
      const response = await listTransportCarriers({
        integrationAccountId: filters.integrationAccountId || ctx.integrationAccountId,
        search: filters.search || undefined,
        rntrcStatus: filters.rntrcStatus || undefined,
        role: filters.role || undefined,
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
      listError.value = extractErrorMessage(error, 'Falha ao listar transportadores.');
    } finally {
      loadingList.value = false;
    }
  }

  async function loadById(partyId) {
    if (!partyId) {
      selected.value = null;
      return null;
    }
    detailError.value = '';
    loadingDetail.value = true;
    try {
      const ctx = syncContext();
      selected.value = await getTransportCarrierById(partyId, {
        integrationAccountId: filters.integrationAccountId || ctx.integrationAccountId
      });
      return selected.value;
    } catch (error) {
      selected.value = null;
      detailError.value = extractErrorMessage(error, 'Falha ao carregar o transportador.');
      return null;
    } finally {
      loadingDetail.value = false;
    }
  }

  async function createCarrier(payload) {
    const ctx = syncContext();
    return executeCommand('Transportador cadastrado.', () =>
      createTransportCarrier({ integrationAccountId: filters.integrationAccountId || ctx.integrationAccountId, ...payload })
    );
  }

  async function updateCarrier(partyId, payload) {
    if (!partyId) return null;
    const ctx = syncContext();
    return executeCommand('Transportador atualizado.', async () => {
      const updated = await updateTransportCarrier(partyId, {
        integrationAccountId: filters.integrationAccountId || ctx.integrationAccountId,
        version: selected.value?.version,
        ...payload
      });
      if (selected.value?.id === partyId) selected.value = updated;
      return updated;
    });
  }

  async function loadRntrcVerifications(partyId) {
    const id = partyId || selected.value?.id;
    if (!id) return;
    loadingRntrcVerifications.value = true;
    try {
      const ctx = syncContext();
      const response = await listTransportCarrierRntrcVerifications(id, {
        integrationAccountId: filters.integrationAccountId || ctx.integrationAccountId
      });
      rntrcVerifications.value = Array.isArray(response.items) ? response.items : [];
    } catch {
      rntrcVerifications.value = [];
    } finally {
      loadingRntrcVerifications.value = false;
    }
  }

  /**
   * `strategy: 'manual'` responde 200 síncrono (grava direto); `'open_data'`
   * responde 202 — aguarda o job antes de recarregar (cache informativo da
   * ANTT, nunca prova de regularidade).
   */
  async function verificarRntrc({ strategy, manualEvidence } = {}) {
    if (!selected.value?.id) return null;
    const ctx = syncContext();
    return executeCommand(
      strategy === 'manual' ? 'Verificação de RNTRC registrada.' : 'Verificação de RNTRC (dados abertos) solicitada.',
      async () => {
        const payload = { integrationAccountId: filters.integrationAccountId || ctx.integrationAccountId, strategy };
        if (strategy === 'manual' && manualEvidence) payload.manualEvidence = manualEvidence;
        const response = await verifyTransportCarrierRntrc(selected.value.id, payload, {
          idempotencyKey: buildTransporteIdempotencyKey('rntrc-verificar')
        });
        if (response?.jobId) {
          await awaitJob(response.jobId);
        }
        await loadById(selected.value.id);
        await loadRntrcVerifications(selected.value.id);
        return response;
      }
    );
  }

  async function loadVehicleLinks(partyId) {
    const id = partyId || selected.value?.id;
    if (!id) return;
    loadingVehicleLinks.value = true;
    try {
      const ctx = syncContext();
      const response = await listTransportCarrierVehicleLinks(id, {
        integrationAccountId: filters.integrationAccountId || ctx.integrationAccountId
      });
      vehicleLinks.value = Array.isArray(response.items) ? response.items : [];
    } catch {
      vehicleLinks.value = [];
    } finally {
      loadingVehicleLinks.value = false;
    }
  }

  async function linkVehicle({ vehicleId, linkType, validFrom, validUntil, evidenceRef } = {}) {
    if (!selected.value?.id) return null;
    const ctx = syncContext();
    return executeCommand('Veículo vinculado.', async () => {
      const payload = { integrationAccountId: filters.integrationAccountId || ctx.integrationAccountId, vehicleId, linkType };
      if (validFrom) payload.validFrom = validFrom;
      if (validUntil) payload.validUntil = validUntil;
      if (evidenceRef) payload.evidenceRef = evidenceRef;
      const link = await linkTransportCarrierVehicle(selected.value.id, payload);
      await loadVehicleLinks(selected.value.id);
      return link;
    });
  }

  async function loadPolicies(partyId) {
    const id = partyId || selected.value?.id;
    if (!id) return;
    loadingPolicies.value = true;
    try {
      const ctx = syncContext();
      const response = await listTransportCarrierInsurancePolicies(id, {
        integrationAccountId: filters.integrationAccountId || ctx.integrationAccountId
      });
      policies.value = Array.isArray(response.items) ? response.items : [];
    } catch {
      policies.value = [];
    } finally {
      loadingPolicies.value = false;
    }
  }

  async function createPolicy(payload) {
    if (!selected.value?.id) return null;
    const ctx = syncContext();
    return executeCommand('Apólice registrada.', async () => {
      const policy = await createTransportCarrierInsurancePolicy(selected.value.id, {
        integrationAccountId: filters.integrationAccountId || ctx.integrationAccountId,
        ...payload
      });
      await loadPolicies(selected.value.id);
      return policy;
    });
  }

  async function updatePolicy(policyId, payload) {
    if (!selected.value?.id) return null;
    const ctx = syncContext();
    return executeCommand('Apólice atualizada.', async () => {
      const current = policies.value.find((entry) => entry.id === policyId);
      const policy = await updateTransportCarrierInsurancePolicy(selected.value.id, policyId, {
        integrationAccountId: filters.integrationAccountId || ctx.integrationAccountId,
        version: current?.version,
        ...payload
      });
      await loadPolicies(selected.value.id);
      return policy;
    });
  }

  /** Síncrono — roda o InsuranceVerificationProvider (mock nesta fase); 501 quando não configurado. */
  async function verificarApolices() {
    if (!selected.value?.id) return null;
    const ctx = syncContext();
    return executeCommand('Seguros verificados.', async () => {
      const response = await verifyTransportCarrierInsurancePolicies(selected.value.id, {
        integrationAccountId: filters.integrationAccountId || ctx.integrationAccountId
      });
      await loadPolicies(selected.value.id);
      return response;
    });
  }

  async function loadPgrs(partyId) {
    const id = partyId || selected.value?.id;
    if (!id) return;
    loadingPgrs.value = true;
    try {
      const ctx = syncContext();
      const response = await listTransportCarrierPgrs(id, {
        integrationAccountId: filters.integrationAccountId || ctx.integrationAccountId
      });
      pgrs.value = Array.isArray(response.items) ? response.items : [];
    } catch {
      pgrs.value = [];
    } finally {
      loadingPgrs.value = false;
    }
  }

  async function createPgr(payload) {
    if (!selected.value?.id) return null;
    const ctx = syncContext();
    return executeCommand('PGR registrado.', async () => {
      const pgr = await createTransportCarrierPgr(selected.value.id, {
        integrationAccountId: filters.integrationAccountId || ctx.integrationAccountId,
        ...payload
      });
      await loadPgrs(selected.value.id);
      return pgr;
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
    rntrcVerifications,
    loadingRntrcVerifications,
    vehicleLinks,
    loadingVehicleLinks,
    policies,
    loadingPolicies,
    pgrs,
    loadingPgrs,
    commandLoading,
    commandError,
    commandErrorCode,
    commandFeedback,
    fetchList,
    loadById,
    createCarrier,
    updateCarrier,
    loadRntrcVerifications,
    verificarRntrc,
    loadVehicleLinks,
    linkVehicle,
    loadPolicies,
    createPolicy,
    updatePolicy,
    verificarApolices,
    loadPgrs,
    createPgr,
    resetFilters,
    clearCommandState,
    syncContext
  };
}
