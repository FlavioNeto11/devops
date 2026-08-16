/**
 * Store de Motoristas (cadastro-base) — Módulo Transportadora, onda F6
 * (REQ-SICAT-0033/REQ-SICAT-0037). Molde: stores/transportadoresStore.js
 * (mesmo padrão: factory function chamada dentro do `<script setup>` de quem
 * usa — SEM estado de módulo compartilhado, cada chamada tem sua própria
 * instância reativa).
 *
 * Backend (I1, migration 034): `/v1/transporte/motoristas*` — motorista é
 * extensão 1:1 de uma parte PF (papel `driver` adicionado no POST), CNH
 * DECLARADA, PATCH com locking otimista via `version`; vínculos
 * motorista↔transportador (`fleet`/`aggregated`) com vigência, encerramento é
 * UPDATE (`status: ended` + `validUntil`), nunca delete. Todas as rotas são
 * síncronas — sem `useJobAwait` aqui (nenhum 202/job neste recurso).
 * Tenancy obrigatória — `integrationAccountId` sempre explícito.
 */

import { reactive, ref } from 'vue';
import {
  createTransportDriver,
  createTransportDriverCarrierLink,
  getTransportDriverById,
  listTransportDriverCarrierLinks,
  listTransportDrivers,
  updateTransportDriver,
  updateTransportDriverCarrierLink,
  buildTransporteIdempotencyKey
} from '../services/transporteService.js';
import { useAuthStore } from './auth.js';

const DEFAULT_FILTERS = Object.freeze({
  integrationAccountId: '',
  search: '',
  status: '',
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

export function useMotoristasStore() {
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

  const carrierLinks = ref([]);
  const loadingCarrierLinks = ref(false);

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
      const response = await listTransportDrivers({
        integrationAccountId: filters.integrationAccountId || ctx.integrationAccountId,
        search: filters.search || undefined,
        status: filters.status || undefined,
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
      listError.value = extractErrorMessage(error, 'Falha ao listar motoristas.');
    } finally {
      loadingList.value = false;
    }
  }

  async function loadById(driverId) {
    if (!driverId) {
      selected.value = null;
      return null;
    }
    detailError.value = '';
    loadingDetail.value = true;
    try {
      const ctx = syncContext();
      selected.value = await getTransportDriverById(driverId, {
        integrationAccountId: filters.integrationAccountId || ctx.integrationAccountId
      });
      return selected.value;
    } catch (error) {
      selected.value = null;
      detailError.value = extractErrorMessage(error, 'Falha ao carregar o motorista.');
      return null;
    } finally {
      loadingDetail.value = false;
    }
  }

  /** POST idempotente — replay com a mesma chave devolve a MESMA resposta (contrato). */
  async function createDriver(payload) {
    const ctx = syncContext();
    return executeCommand('Motorista cadastrado.', () =>
      createTransportDriver(
        { integrationAccountId: filters.integrationAccountId || ctx.integrationAccountId, ...payload },
        { idempotencyKey: buildTransporteIdempotencyKey('motorista-criar') }
      )
    );
  }

  /**
   * PATCH parcial com locking otimista — `version` vem do registro carregado
   * (409 se defasada); `partyId` NUNCA vai no payload (identidade 1:1).
   */
  async function updateDriver(driverId, payload) {
    if (!driverId) return null;
    const ctx = syncContext();
    return executeCommand('Motorista atualizado.', async () => {
      const updated = await updateTransportDriver(driverId, {
        integrationAccountId: filters.integrationAccountId || ctx.integrationAccountId,
        version: selected.value?.version,
        ...payload
      });
      if (selected.value?.id === driverId) selected.value = updated;
      return updated;
    });
  }

  async function loadCarrierLinks(driverId) {
    const id = driverId || selected.value?.id;
    if (!id) return;
    loadingCarrierLinks.value = true;
    try {
      const ctx = syncContext();
      const response = await listTransportDriverCarrierLinks(id, {
        integrationAccountId: filters.integrationAccountId || ctx.integrationAccountId
      });
      carrierLinks.value = Array.isArray(response.items) ? response.items : [];
    } catch {
      carrierLinks.value = [];
    } finally {
      loadingCarrierLinks.value = false;
    }
  }

  async function createCarrierLink({ carrierPartyId, linkType, validFrom, validUntil } = {}) {
    if (!selected.value?.id) return null;
    const ctx = syncContext();
    return executeCommand('Vínculo criado.', async () => {
      const payload = {
        integrationAccountId: filters.integrationAccountId || ctx.integrationAccountId,
        carrierPartyId,
        linkType,
        validFrom
      };
      if (validUntil) payload.validUntil = validUntil;
      const link = await createTransportDriverCarrierLink(selected.value.id, payload, {
        idempotencyKey: buildTransporteIdempotencyKey('motorista-vinculo')
      });
      await loadCarrierLinks(selected.value.id);
      return link;
    });
  }

  /**
   * Encerrar = PATCH do vínculo (`validUntil` default hoje no backend) com a
   * `version` do PRÓPRIO vínculo — vínculo já encerrado responde 409.
   */
  async function endCarrierLink(linkId, { validUntil } = {}) {
    if (!selected.value?.id || !linkId) return null;
    const ctx = syncContext();
    return executeCommand('Vínculo encerrado.', async () => {
      const current = carrierLinks.value.find((entry) => entry.id === linkId);
      const payload = {
        integrationAccountId: filters.integrationAccountId || ctx.integrationAccountId,
        version: current?.version
      };
      if (validUntil) payload.validUntil = validUntil;
      const link = await updateTransportDriverCarrierLink(selected.value.id, linkId, payload);
      await loadCarrierLinks(selected.value.id);
      return link;
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
    carrierLinks,
    loadingCarrierLinks,
    commandLoading,
    commandError,
    commandErrorCode,
    commandFeedback,
    fetchList,
    loadById,
    createDriver,
    updateDriver,
    loadCarrierLinks,
    createCarrierLink,
    endCarrierLink,
    resetFilters,
    clearCommandState,
    syncContext
  };
}
