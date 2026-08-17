/**
 * Store de Gerenciamento de Risco (GR) — Módulo Transportadora, onda F9
 * (REQ-SICAT-0036/REQ-SICAT-0037). Molde: stores/motoristasStore.js (factory
 * chamada dentro do `<script setup>` de quem usa, SEM estado de módulo
 * compartilhado).
 *
 * Backend (I5, migration 038): `/v1/transporte/gr/screenings` — pesquisa
 * cadastral append-only de motorista OU veículo, exigida pela apólice de roubo
 * (RC-DC) e avaliada por TR-GR-001 no pré-embarque. `RISK_SCREENING_MODE=off`
 * recusa a CRIAÇÃO com 501 (`RISK_SCREENING_DISABLED`) — a LISTA continua
 * respondendo, então um ambiente sem provedor mostra o histórico e explica a
 * ausência da ação, em vez de aparentar tela quebrada.
 *
 * A lista do contrato NÃO é paginada (`items` + `total`) e filtra por
 * `subjectType`/`driverId`/`vehicleId`. A tela quer as duas seções (motoristas
 * e veículos) lado a lado, então a carga é UMA chamada sem filtro e a separação
 * é local — dois GETs por render seriam round-trip sem ganho.
 *
 * Os NOMES dos alvos (motorista/placa) não vêm no resource — por LGPD ele
 * guarda só o vínculo, o veredito e a validade. Por isso a store carrega os
 * cadastros de motoristas e veículos da conta: são a mesma fonte que o diálogo
 * de solicitação precisa, e evitam a tabela mostrar ID cru.
 */

import { computed, ref } from 'vue';
import {
  buildTransporteIdempotencyKey,
  createTransportGrScreening,
  listTransportDrivers,
  listTransportGrScreenings,
  listTransportVehicles
} from '../services/transporteService.js';
import { RISK_SCREENING_DISABLED_CODE, RISK_SCREENING_DISABLED_MESSAGE } from '../views/transporte/transporteUiHelpers.js';
import { useAuthStore } from './auth.js';

/** Teto do carregamento de cadastros para rótulo/seleção (conta de operação real cabe folgado). */
const SUBJECT_PAGE_SIZE = 200;

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

export function useGrStore() {
  const authStore = useAuthStore();

  const integrationAccountId = ref(resolveIntegrationAccountId(authStore));

  const screenings = ref([]);
  const loadingScreenings = ref(false);
  const screeningsError = ref('');

  const drivers = ref([]);
  const vehicles = ref([]);
  const loadingSubjects = ref(false);

  const commandLoading = ref(false);
  const commandError = ref('');
  const commandErrorCode = ref('');

  /** Provedor desligado (501) — a tela troca o botão por explicação. */
  const screeningDisabled = computed(() => commandErrorCode.value === RISK_SCREENING_DISABLED_CODE);

  const driverScreenings = computed(() => screenings.value.filter((entry) => entry.subjectType === 'driver'));
  const vehicleScreenings = computed(() => screenings.value.filter((entry) => entry.subjectType === 'vehicle'));

  function syncContext() {
    const resolved = resolveIntegrationAccountId(authStore);
    if (resolved) integrationAccountId.value = resolved;
    return integrationAccountId.value;
  }

  function clearCommandState() {
    commandError.value = '';
    commandErrorCode.value = '';
  }

  async function fetchScreenings() {
    screeningsError.value = '';
    loadingScreenings.value = true;
    try {
      const accountId = syncContext();
      const response = await listTransportGrScreenings({ integrationAccountId: accountId });
      screenings.value = Array.isArray(response?.items) ? response.items : [];
    } catch (error) {
      screenings.value = [];
      screeningsError.value = extractErrorMessage(error, 'Falha ao listar as pesquisas cadastrais.');
    } finally {
      loadingScreenings.value = false;
    }
  }

  /**
   * Cadastros da conta para rótulo da tabela e seleção do diálogo. FAIL-SOFT:
   * um erro aqui degrada o rótulo (mostra o ID) — nunca esconde as pesquisas.
   */
  async function loadSubjects() {
    loadingSubjects.value = true;
    try {
      const accountId = syncContext();
      const [driversResponse, vehiclesResponse] = await Promise.all([
        listTransportDrivers({ integrationAccountId: accountId, page: 1, pageSize: SUBJECT_PAGE_SIZE }).catch(() => ({ items: [] })),
        listTransportVehicles({ integrationAccountId: accountId, page: 1, pageSize: SUBJECT_PAGE_SIZE }).catch(() => ({ items: [] }))
      ]);
      drivers.value = Array.isArray(driversResponse?.items) ? driversResponse.items : [];
      vehicles.value = Array.isArray(vehiclesResponse?.items) ? vehiclesResponse.items : [];
    } finally {
      loadingSubjects.value = false;
    }
  }

  async function requestScreening({ subjectType, driverId, vehicleId, referenceDate } = {}) {
    clearCommandState();
    commandLoading.value = true;
    try {
      const accountId = syncContext();
      const payload = { integrationAccountId: accountId, subjectType };
      if (subjectType === 'driver') payload.driverId = driverId;
      if (subjectType === 'vehicle') payload.vehicleId = vehicleId;
      if (referenceDate) payload.referenceDate = referenceDate;

      const screening = await createTransportGrScreening(payload, {
        idempotencyKey: buildTransporteIdempotencyKey('gr-screening')
      });
      await fetchScreenings();
      return screening;
    } catch (error) {
      commandErrorCode.value = extractErrorCode(error);
      commandError.value = commandErrorCode.value === RISK_SCREENING_DISABLED_CODE
        ? RISK_SCREENING_DISABLED_MESSAGE
        : extractErrorMessage(error, 'Falha ao solicitar a pesquisa cadastral.');
      throw error;
    } finally {
      commandLoading.value = false;
    }
  }

  return {
    integrationAccountId,
    screenings,
    driverScreenings,
    vehicleScreenings,
    loadingScreenings,
    screeningsError,
    drivers,
    vehicles,
    loadingSubjects,
    commandLoading,
    commandError,
    commandErrorCode,
    screeningDisabled,
    fetchScreenings,
    loadSubjects,
    requestScreening,
    clearCommandState,
    syncContext
  };
}
