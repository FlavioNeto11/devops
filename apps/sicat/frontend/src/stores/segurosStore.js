/**
 * Store de Seguros do Módulo Transportadora — ondas F7 (apólices/averbações) e
 * F8 (apuração mensal). REQ-SICAT-0037 (UI), com os dados de REQ-SICAT-0028
 * rev.2 (limite por viagem), REQ-SICAT-0034 (taxas + averbação) e
 * REQ-SICAT-0035 (apuração). Molde: stores/motoristasStore.js — factory chamada
 * dentro do `<script setup>` de quem usa, SEM estado de módulo compartilhado.
 *
 * ─── O CAMINHO REAL da visão consolidada de apólices ─────────────────────────
 * O contrato NÃO tem uma rota "todas as apólices da conta". As duas fontes são:
 *
 *   1. `GET /v1/transporte/seguros/vencimentos` — é um FEED DE ALERTA, não um
 *      inventário: só devolve apólices `active` vencendo dentro de `windowDays`
 *      (default 30) e apólices JÁ VENCIDAS que têm operação não-terminal em
 *      aberto. Uma apólice saudável (vence em 200 dias) NUNCA aparece aqui —
 *      usá-lo sozinho faria a tela dizer "0 apólices vigentes" numa conta com
 *      a casa em ordem.
 *   2. `GET /v1/transporte/transportadores?role=carrier` → `GET
 *      .../{partyId}/apolices` por transportador — este é o INVENTÁRIO, e é
 *      dele que saem `perTripLimitAmount`, `isCurrentlyValid` e `daysToExpiry`.
 *
 * Então a consolidação faz o fan-out (2) e usa (1) POR CIMA, só para marcar
 * quais apólices têm operação aberta dependendo delas (`openOperationIds` —
 * o alerta `expired_with_open_operation`). A taxa vigente e o custo mínimo
 * mensal vêm de um terceiro fan-out (`.../apolices/{policyId}/taxas`), porque
 * a apólice não carrega a taxa: taxa é recurso versionado à parte.
 *
 * O fan-out é LIMITADO (`maxCarriers`) e sinaliza `truncated` — conta de
 * laboratório tem poucos transportadores, mas a tela precisa dizer a verdade
 * quando não olhou tudo, em vez de mostrar um número consolidado errado.
 */

import { reactive, ref } from 'vue';
import {
  buildTransporteIdempotencyKey,
  closeTransportInsuranceBillingPeriod,
  createTransportInsuranceRateSchedule,
  getTransportInsuranceBillingPeriod,
  listTransportCarrierInsurancePolicies,
  listTransportCarriers,
  listTransportInsuranceBillingPeriods,
  listTransportInsuranceDeclarations,
  listTransportInsuranceExpiryAlerts,
  listTransportInsuranceRateSchedules,
  recomputeTransportInsuranceBillingPeriod,
  reopenTransportInsuranceBillingPeriod,
  updateTransportCarrierInsurancePolicy
} from '../services/transporteService.js';
import { AVERBACAO_PENDING_STATUSES } from '../views/transporte/transporteUiHelpers.js';
import { useAuthStore } from './auth.js';

/** Teto do fan-out de transportadores — ver o cabeçalho (`truncated`). */
const DEFAULT_MAX_CARRIERS = 25;

const DEFAULT_DECLARATION_FILTERS = Object.freeze({
  from: '',
  to: '',
  status: '',
  policyId: '',
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

/**
 * Taxa APLICÁVEL hoje entre o histórico devolvido pelo contrato. O histórico
 * vem completo de propósito (`active`/`superseded`/`cancelled`) para reproduzir
 * prêmios antigos; para a COLUNA "taxa vigente" o recorte é: `active`, sem
 * `routeScope` (a taxa default da apólice — as de percurso são do RC-V e não
 * representam a apólice inteira), e a de `validFrom` mais recente.
 */
export function selectCurrentRateSchedule(schedules) {
  const items = Array.isArray(schedules) ? schedules : [];
  const actives = items.filter((entry) => String(entry?.status || '') === 'active');
  const defaults = actives.filter((entry) => !entry?.routeScope);
  const pool = defaults.length ? defaults : actives;
  if (!pool.length) return null;
  return pool.slice().sort((a, b) => String(b?.validFrom || '').localeCompare(String(a?.validFrom || '')))[0];
}

/**
 * Inventário consolidado de apólices da conta (ver o cabeçalho do módulo).
 * Função SOLTA (não exige instanciar a store) porque a home do Transportador
 * também precisa da contagem de apólices vigentes para o checklist.
 *
 * @param {object} options
 * @param {string} options.integrationAccountId tenancy obrigatória
 * @param {number} [options.maxCarriers] teto do fan-out
 * @param {boolean} [options.withRates] busca a taxa vigente de cada apólice
 *   (a home NÃO precisa — só conta vigentes; a tela consolidada precisa)
 */
export async function fetchAccountInsuranceSnapshot({
  integrationAccountId,
  maxCarriers = DEFAULT_MAX_CARRIERS,
  withRates = true
} = {}) {
  const carriersResponse = await listTransportCarriers({
    integrationAccountId,
    role: 'carrier',
    page: 1,
    pageSize: maxCarriers
  });
  const carriers = Array.isArray(carriersResponse?.items) ? carriersResponse.items : [];
  const carriersTotal = Number(carriersResponse?.total ?? carriers.length);

  const policiesByCarrier = await Promise.all(
    carriers.map(async (carrier) => {
      try {
        const response = await listTransportCarrierInsurancePolicies(carrier.id, { integrationAccountId });
        const items = Array.isArray(response?.items) ? response.items : [];
        return items.map((policy) => ({
          ...policy,
          partyId: policy.partyId || carrier.id,
          partyLegalName: carrier.legalName || carrier.tradeName || carrier.id
        }));
      } catch {
        // Um transportador sem acesso/erro pontual não pode zerar a tela toda —
        // o consolidado segue com os demais (a contagem `truncated` avisa).
        return [];
      }
    })
  );

  const policies = policiesByCarrier.flat();

  if (withRates) {
    await Promise.all(
      policies.map(async (policy) => {
        try {
          const response = await listTransportInsuranceRateSchedules(policy.partyId, policy.id, {
            integrationAccountId
          });
          const schedules = Array.isArray(response?.items) ? response.items : [];
          policy.rateSchedules = schedules;
          policy.currentRate = selectCurrentRateSchedule(schedules);
        } catch {
          policy.rateSchedules = [];
          policy.currentRate = null;
        }
      })
    );
  }

  return {
    policies,
    carriers,
    carriersTotal,
    truncated: carriersTotal > carriers.length
  };
}

/**
 * Averbações que ainda pedem acompanhamento na conta. O contrato filtra por UM
 * status por vez (`status` é enum simples), então a contagem é a soma dos
 * `total` de uma chamada por status — `pageSize: 1` mantém o payload mínimo:
 * o que interessa é o total, não os itens.
 */
export async function countPendingInsuranceDeclarations({ integrationAccountId } = {}) {
  const totals = await Promise.all(
    AVERBACAO_PENDING_STATUSES.map(async (status) => {
      try {
        const response = await listTransportInsuranceDeclarations({
          integrationAccountId,
          status,
          page: 1,
          pageSize: 1
        });
        return Number(response?.total || 0);
      } catch {
        return 0;
      }
    })
  );
  return totals.reduce((sum, value) => sum + value, 0);
}

export function useSegurosStore() {
  const authStore = useAuthStore();

  const integrationAccountId = ref(resolveIntegrationAccountId(authStore));

  // --- Apólices consolidadas -------------------------------------------------
  const policies = ref([]);
  const expiryAlerts = ref([]);
  const policiesTruncated = ref(false);
  const loadingPolicies = ref(false);
  const policiesError = ref('');

  // --- Averbações da conta ---------------------------------------------------
  const declarationFilters = reactive({ ...DEFAULT_DECLARATION_FILTERS });
  const declarations = ref([]);
  const declarationsTotal = ref(0);
  const declarationsTotalPages = ref(0);
  const loadingDeclarations = ref(false);
  const declarationsError = ref('');

  // --- Apuração mensal -------------------------------------------------------
  const periodMonth = ref('');
  const periods = ref([]);
  const loadingPeriods = ref(false);
  const periodsError = ref('');
  const periodDetail = ref(null);
  const loadingPeriodDetail = ref(false);
  const periodDetailError = ref('');

  const commandLoading = ref(false);
  const commandError = ref('');
  const commandErrorCode = ref('');
  const commandFeedback = ref('');

  function syncContext() {
    const resolved = resolveIntegrationAccountId(authStore);
    if (resolved) integrationAccountId.value = resolved;
    return integrationAccountId.value;
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

  /**
   * Consolidado + alertas em paralelo. O alerta entra como enriquecimento
   * (`alertType`/`openOperationIds`) da apólice correspondente: a tela precisa
   * distinguir "vencida" de "vencida COM viagem em aberto" — a segunda é a que
   * deixa carga descoberta na estrada agora.
   */
  async function loadPolicies({ maxCarriers = DEFAULT_MAX_CARRIERS } = {}) {
    policiesError.value = '';
    loadingPolicies.value = true;
    try {
      const accountId = syncContext();
      const [snapshot, alertsResponse] = await Promise.all([
        fetchAccountInsuranceSnapshot({ integrationAccountId: accountId, maxCarriers, withRates: true }),
        listTransportInsuranceExpiryAlerts({ integrationAccountId: accountId }).catch(() => ({ items: [] }))
      ]);

      const alerts = Array.isArray(alertsResponse?.items) ? alertsResponse.items : [];
      const alertByPolicyId = new Map(alerts.map((alert) => [alert.policyId, alert]));

      policies.value = snapshot.policies.map((policy) => {
        const alert = alertByPolicyId.get(policy.id) || null;
        return {
          ...policy,
          alertType: alert?.alertType || '',
          openOperationIds: Array.isArray(alert?.openOperationIds) ? alert.openOperationIds : []
        };
      });
      expiryAlerts.value = alerts;
      policiesTruncated.value = snapshot.truncated;
    } catch (error) {
      policies.value = [];
      expiryAlerts.value = [];
      policiesTruncated.value = false;
      policiesError.value = extractErrorMessage(error, 'Falha ao consolidar as apólices da conta.');
    } finally {
      loadingPolicies.value = false;
    }
  }

  /** Taxa nova = create supersede (a anterior da mesma chave lógica vira `superseded`). */
  async function createRateSchedule(partyId, policyId, payload) {
    const accountId = syncContext();
    return executeCommand('Taxa registrada.', async () => {
      const rate = await createTransportInsuranceRateSchedule(
        partyId,
        policyId,
        { integrationAccountId: accountId, ...payload },
        { idempotencyKey: buildTransporteIdempotencyKey('seguro-taxa') }
      );
      await loadPolicies();
      return rate;
    });
  }

  /**
   * PATCH da apólice com locking otimista — só o LIMITE por viagem (o CRUD
   * completo da apólice vive no detalhe do transportador; esta tela não o
   * duplica). `version` sai da linha já carregada; defasada responde 409.
   */
  async function updatePolicyLimit(partyId, policyId, { perTripLimitAmount, limitConditions } = {}) {
    const accountId = syncContext();
    return executeCommand('Limite por viagem atualizado.', async () => {
      const current = policies.value.find((entry) => entry.id === policyId);
      const payload = {
        integrationAccountId: accountId,
        version: current?.version,
        // `null` explícito LIMPA o limite (TR-SEG-004 volta a avisar em vez de
        // confrontar) — por isso o campo vai mesmo quando é null.
        perTripLimitAmount: perTripLimitAmount === '' || perTripLimitAmount === undefined
          ? null
          : Number(perTripLimitAmount)
      };
      if (limitConditions) payload.limitConditions = limitConditions;
      const policy = await updateTransportCarrierInsurancePolicy(partyId, policyId, payload);
      await loadPolicies();
      return policy;
    });
  }

  async function fetchDeclarations() {
    declarationsError.value = '';
    loadingDeclarations.value = true;
    try {
      const accountId = syncContext();
      const response = await listTransportInsuranceDeclarations({
        integrationAccountId: accountId,
        from: declarationFilters.from || undefined,
        to: declarationFilters.to || undefined,
        status: declarationFilters.status || undefined,
        policyId: declarationFilters.policyId || undefined,
        page: Number(declarationFilters.page || 1),
        pageSize: Number(declarationFilters.pageSize || 20)
      });
      declarations.value = Array.isArray(response?.items) ? response.items : [];
      declarationsTotal.value = Number(response?.total || 0);
      const pageSize = Number(response?.pageSize || declarationFilters.pageSize || 20);
      declarationsTotalPages.value = pageSize > 0 ? Math.ceil(declarationsTotal.value / pageSize) : 0;
    } catch (error) {
      declarations.value = [];
      declarationsTotal.value = 0;
      declarationsTotalPages.value = 0;
      declarationsError.value = extractErrorMessage(error, 'Falha ao listar as averbações.');
    } finally {
      loadingDeclarations.value = false;
    }
  }

  function resetDeclarationFilters() {
    Object.assign(declarationFilters, DEFAULT_DECLARATION_FILTERS);
    declarations.value = [];
    declarationsTotal.value = 0;
    declarationsTotalPages.value = 0;
    declarationsError.value = '';
  }

  /** Um período por apólice × mês — sem `period` o contrato devolve todos. */
  async function fetchPeriods(month) {
    if (month !== undefined) periodMonth.value = month;
    periodsError.value = '';
    loadingPeriods.value = true;
    try {
      const accountId = syncContext();
      const response = await listTransportInsuranceBillingPeriods({
        integrationAccountId: accountId,
        period: periodMonth.value || undefined
      });
      periods.value = Array.isArray(response?.items) ? response.items : [];
    } catch (error) {
      periods.value = [];
      periodsError.value = extractErrorMessage(error, 'Falha ao carregar a apuração do mês.');
    } finally {
      loadingPeriods.value = false;
    }
  }

  /** O detalhe é o que traz `statement.items` (extrato) e `runs` (trilha). */
  async function loadPeriodDetail(periodId) {
    if (!periodId) {
      periodDetail.value = null;
      return null;
    }
    periodDetailError.value = '';
    loadingPeriodDetail.value = true;
    try {
      const accountId = syncContext();
      periodDetail.value = await getTransportInsuranceBillingPeriod(periodId, {
        integrationAccountId: accountId
      });
      return periodDetail.value;
    } catch (error) {
      periodDetail.value = null;
      periodDetailError.value = extractErrorMessage(error, 'Falha ao carregar o extrato do período.');
      return null;
    } finally {
      loadingPeriodDetail.value = false;
    }
  }

  async function recomputePeriod(periodId) {
    const accountId = syncContext();
    return executeCommand('Período recalculado.', async () => {
      const period = await recomputeTransportInsuranceBillingPeriod(
        periodId,
        { integrationAccountId: accountId },
        { idempotencyKey: buildTransporteIdempotencyKey('apuracao-recalcular') }
      );
      await Promise.all([fetchPeriods(), loadPeriodDetail(periodId)]);
      return period;
    });
  }

  async function closePeriod(periodId) {
    const accountId = syncContext();
    return executeCommand('Período fechado.', async () => {
      const period = await closeTransportInsuranceBillingPeriod(
        periodId,
        { integrationAccountId: accountId },
        { idempotencyKey: buildTransporteIdempotencyKey('apuracao-fechar') }
      );
      await Promise.all([fetchPeriods(), loadPeriodDetail(periodId)]);
      return period;
    });
  }

  async function reopenPeriod(periodId, reason) {
    const accountId = syncContext();
    return executeCommand('Período reaberto.', async () => {
      const payload = { integrationAccountId: accountId };
      if (reason) payload.reason = reason;
      const period = await reopenTransportInsuranceBillingPeriod(periodId, payload, {
        idempotencyKey: buildTransporteIdempotencyKey('apuracao-reabrir')
      });
      await Promise.all([fetchPeriods(), loadPeriodDetail(periodId)]);
      return period;
    });
  }

  return {
    integrationAccountId,

    policies,
    expiryAlerts,
    policiesTruncated,
    loadingPolicies,
    policiesError,
    loadPolicies,
    createRateSchedule,
    updatePolicyLimit,

    declarationFilters,
    declarations,
    declarationsTotal,
    declarationsTotalPages,
    loadingDeclarations,
    declarationsError,
    fetchDeclarations,
    resetDeclarationFilters,

    periodMonth,
    periods,
    loadingPeriods,
    periodsError,
    periodDetail,
    loadingPeriodDetail,
    periodDetailError,
    fetchPeriods,
    loadPeriodDetail,
    recomputePeriod,
    closePeriod,
    reopenPeriod,

    commandLoading,
    commandError,
    commandErrorCode,
    commandFeedback,
    clearCommandState,
    syncContext
  };
}
