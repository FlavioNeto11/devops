<script setup>
import { computed, ref, watch } from 'vue';
import {
  averbarTransportOperation,
  cancelTransportAverbacao,
  listTransportCarrierInsurancePolicies,
  listTransportInsuranceRateSchedules,
  listTransportOperationAverbacoes,
  rectifyTransportAverbacao,
  buildTransporteIdempotencyKey
} from '../../services/transporteService.js';
import { selectCurrentRateSchedule } from '../../stores/segurosStore.js';
import { useConfirmDialog } from '../../composables/useConfirmDialog.js';
import { useNotification } from '../../composables/useNotification.js';
import {
  averbacaoAcceptsMutation,
  averbacaoEventLabel,
  averbacaoStatusLabel,
  estimateDeclarationPremium,
  formatCurrencyBRL,
  formatDateTimeBR,
  formatRatePercent,
  isAverbacaoLive,
  policyTypeLabel,
  resolveInsurancePolicyStatus
} from './transporteUiHelpers.js';
import SicatCard from '../../components/sicat/SicatCard.vue';
import SicatStatusBadge from '../../components/sicat/SicatStatusBadge.vue';
import SicatStatusTimeline from '../../components/sicat/SicatStatusTimeline.vue';
import SicatInlineAlert from '../../components/sicat/SicatInlineAlert.vue';
import SicatEmptyState from '../../components/sicat/SicatEmptyState.vue';
import SicatLoadingState from '../../components/sicat/SicatLoadingState.vue';
import SicatNextStep from '../../components/sicat/SicatNextStep.vue';
import SicatConfirmDialog from '../../components/sicat/SicatConfirmDialog.vue';
import SicatHelpHint from '../../components/sicat/SicatHelpHint.vue';

/**
 * "Seguro da viagem" — card do detalhe da operação (onda F7, REQ-SICAT-0034 e
 * REQ-SICAT-0028 rev.2; UI de REQ-SICAT-0037). Componente FILHO por decisão de
 * tamanho: o TransporteOperacaoDetailView já passa de 1100 linhas, e o ciclo de
 * averbação tem estado próprio (apólices do transportador, taxas, declarações e
 * a trilha de eventos de cada uma) que não se mistura com o resto da tela.
 * Segue o padrão dos vizinhos CIOT/VPO: um SicatCard com badge no header,
 * resumo, linha de ações e a trilha em `<details>`.
 *
 * O que só este card responde, e nenhuma outra tela responde: a carga desta
 * viagem CABE no limite de garantia da apólice? A conta é
 * `Σ declaredValue da carga × limite por viagem` — é o mesmo confronto que
 * TR-SEG-004 faz no GATE_PRE_BOARDING, antecipado aqui para o operador ver
 * ANTES de tentar embarcar.
 */

const props = defineProps({
  /** Operação carregada pelo pai (precisa de `parties` e `cargo`). */
  operation: { type: Object, default: null },
  /** Tenancy — resolvida pelo pai a partir da conta CETESB ativa. */
  integrationAccountId: { type: String, default: '' }
});

const emit = defineEmits(['changed']);

const notify = useNotification();
const {
  dialogVisible, dialogTitle, dialogMessage, dialogConfirmLabel, dialogCancelLabel,
  dialogDanger, dialogShowCancel, confirm, accept, cancel
} = useConfirmDialog();

const policies = ref([]);
const declarations = ref([]);
const loading = ref(false);
const loadError = ref('');
const commandLoading = ref(false);
const commandError = ref('');
const justAverbou = ref(false);

const carrierPartyId = computed(() => {
  const parties = Array.isArray(props.operation?.parties) ? props.operation.parties : [];
  return parties.find((party) => party.role === 'carrier')?.partyId || '';
});

/**
 * Σ dos valores DECLARADOS da carga. `null` quando nenhum item tem valor: é
 * caso diferente de zero — sem valor declarado não dá para confrontar limite
 * nem calcular prêmio, e o contrato recusa a averbação (409
 * TRANSPORTE_AVERBACAO_CARGO_VALUE_MISSING).
 */
const declaredCargoAmount = computed(() => {
  const cargo = Array.isArray(props.operation?.cargo) ? props.operation.cargo : [];
  const withValue = cargo.filter(
    (item) => item?.declaredValue !== null && item?.declaredValue !== undefined && Number.isFinite(Number(item.declaredValue))
  );
  if (!withValue.length) return null;
  return withValue.reduce((sum, item) => sum + Number(item.declaredValue), 0);
});

const hasCargoWithoutValue = computed(() => {
  const cargo = Array.isArray(props.operation?.cargo) ? props.operation.cargo : [];
  if (!cargo.length) return true;
  return cargo.some(
    (item) => item?.declaredValue === null || item?.declaredValue === undefined || !Number.isFinite(Number(item.declaredValue))
  );
});

/** Apólices VIGENTES do transportador — as vencidas não cobrem esta viagem. */
const livePolicies = computed(() =>
  policies.value
    .map((policy) => ({ policy, validity: resolveInsurancePolicyStatus(policy) }))
    .filter(({ validity }) => validity.status === 'valid' || validity.status === 'expiring')
);

/**
 * Confronto limite × carga, por apólice. `exceeded` é o que TR-SEG-004 barra;
 * apólice sem limite configurado não é "aprovada", é "não avaliável" — o gate
 * apenas avisa e a tela diz isso em vez de mostrar um verde falso.
 */
const limitChecks = computed(() => {
  const amount = declaredCargoAmount.value;
  return livePolicies.value.map(({ policy, validity }) => {
    const limit = policy.perTripLimitAmount;
    const hasLimit = limit !== null && limit !== undefined && Number.isFinite(Number(limit));
    const exceeded = hasLimit && amount !== null && Number(amount) > Number(limit);
    const rate = policy.currentRate?.ratePercent;
    return {
      policyId: policy.id,
      policyType: policy.policyType,
      policyNumber: policy.policyNumber,
      validityStatus: validity.status,
      validityLabel: validity.label,
      validityDetail: validity.detail,
      limit,
      hasLimit,
      exceeded,
      ratePercent: rate,
      estimatedPremium: amount === null ? null : estimateDeclarationPremium(amount, rate)
    };
  });
});

const exceededChecks = computed(() => limitChecks.value.filter((check) => check.exceeded));

const liveDeclarations = computed(() => declarations.value.filter((entry) => isAverbacaoLive(entry.status)));

const canAverbar = computed(() => {
  if (!carrierPartyId.value) return false;
  if (!livePolicies.value.length) return false;
  if (declaredCargoAmount.value === null) return false;
  // Uma averbação viva por operação×apólice: só resta o que ainda não tem viva.
  const liveByPolicy = new Set(liveDeclarations.value.map((entry) => entry.policyId));
  return livePolicies.value.some(({ policy }) => !liveByPolicy.has(policy.id));
});

function policyLabelById(policyId) {
  const policy = policies.value.find((entry) => entry.id === policyId);
  if (!policy) return policyId;
  return `${policyTypeLabel(policy.policyType)} · ${policy.policyNumber}`;
}

function declarationTimelineSteps(declaration) {
  const events = Array.isArray(declaration?.events) ? declaration.events : [];
  return events.map((event) => ({
    title: averbacaoEventLabel(event.eventType),
    timestamp: formatDateTimeBR(event.createdAt),
    state: event.eventType === 'rejected' ? 'error' : 'done'
  }));
}

async function load() {
  if (!props.operation?.id || !props.integrationAccountId) return;
  loading.value = true;
  loadError.value = '';
  try {
    const [declarationsResponse, policiesResponse] = await Promise.all([
      listTransportOperationAverbacoes(props.operation.id, {
        integrationAccountId: props.integrationAccountId
      }),
      carrierPartyId.value
        ? listTransportCarrierInsurancePolicies(carrierPartyId.value, {
          integrationAccountId: props.integrationAccountId
        })
        : Promise.resolve({ items: [] })
    ]);

    declarations.value = Array.isArray(declarationsResponse?.items) ? declarationsResponse.items : [];
    const loadedPolicies = Array.isArray(policiesResponse?.items) ? policiesResponse.items : [];

    // A taxa não vem na apólice (recurso versionado à parte) — é ela que dá o
    // prêmio ESTIMADO da confirmação, então vale o fan-out.
    await Promise.all(
      loadedPolicies.map(async (policy) => {
        try {
          const response = await listTransportInsuranceRateSchedules(carrierPartyId.value, policy.id, {
            integrationAccountId: props.integrationAccountId
          });
          policy.currentRate = selectCurrentRateSchedule(response?.items);
        } catch {
          policy.currentRate = null;
        }
      })
    );
    policies.value = loadedPolicies;
  } catch (error) {
    loadError.value = error?.detail || error?.message || 'Falha ao carregar os seguros desta viagem.';
  } finally {
    loading.value = false;
  }
}

async function handleAverbar() {
  const amount = declaredCargoAmount.value;
  const linhas = limitChecks.value
    .map((check) => {
      const premio = check.estimatedPremium === null
        ? 'sem taxa cadastrada'
        : `prêmio estimado ${formatCurrencyBRL(check.estimatedPremium)}`;
      return `• ${policyTypeLabel(check.policyType)} ${check.policyNumber}: ${premio}`;
    })
    .join('\n');

  const ok = await confirm({
    title: 'Averbar esta viagem',
    message: `Carga declarada de ${formatCurrencyBRL(amount)} será averbada nas apólices vigentes do transportador.\n\n${linhas}\n\nO valor da carga e o prêmio ficam CONGELADOS no ato — mudar a carga depois exige retificar.`,
    confirmLabel: 'Averbar'
  });
  if (!ok) return;

  commandLoading.value = true;
  commandError.value = '';
  try {
    await averbarTransportOperation(
      props.operation.id,
      { integrationAccountId: props.integrationAccountId },
      { idempotencyKey: buildTransporteIdempotencyKey('averbar') }
    );
    notify.success('Averbação enviada à seguradora. O resultado chega pela reconciliação.');
    justAverbou.value = true;
    await load();
    emit('changed');
  } catch (error) {
    commandError.value = error?.detail || error?.message || 'Falha ao averbar a viagem.';
    notify.error(commandError.value);
  } finally {
    commandLoading.value = false;
  }
}

async function handleRetificar(declaration) {
  const ok = await confirm({
    title: 'Retificar a averbação',
    message: `Re-congela o valor ATUAL da carga (${formatCurrencyBRL(declaredCargoAmount.value)}) com a MESMA taxa de ${formatRatePercent(declaration.appliedRatePercent)} já aplicada — retificar corrige o valor declarado, nunca renegocia a taxa.`,
    confirmLabel: 'Retificar'
  });
  if (!ok) return;

  commandLoading.value = true;
  commandError.value = '';
  try {
    await rectifyTransportAverbacao(
      declaration.id,
      { integrationAccountId: props.integrationAccountId },
      { idempotencyKey: buildTransporteIdempotencyKey('averbacao-retificar') }
    );
    notify.success('Retificação enviada.');
    await load();
    emit('changed');
  } catch (error) {
    commandError.value = error?.detail || error?.message || 'Falha ao retificar a averbação.';
    notify.error(commandError.value);
  } finally {
    commandLoading.value = false;
  }
}

async function handleCancelar(declaration) {
  const ok = await confirm({
    title: 'Cancelar a averbação',
    message: `Encerra a cobertura desta viagem em ${policyLabelById(declaration.policyId)} e libera a apólice para uma nova averbação. NÃO cancela a operação de transporte.`,
    confirmLabel: 'Cancelar averbação',
    danger: true
  });
  if (!ok) return;

  commandLoading.value = true;
  commandError.value = '';
  try {
    await cancelTransportAverbacao(
      declaration.id,
      { integrationAccountId: props.integrationAccountId },
      { idempotencyKey: buildTransporteIdempotencyKey('averbacao-cancelar') }
    );
    notify.success('Cancelamento enviado.');
    await load();
    emit('changed');
  } catch (error) {
    commandError.value = error?.detail || error?.message || 'Falha ao cancelar a averbação.';
    notify.error(commandError.value);
  } finally {
    commandLoading.value = false;
  }
}

watch(
  () => [props.operation?.id, props.integrationAccountId],
  () => {
    void load();
  },
  { immediate: true }
);
</script>

<template>
  <SicatCard title="Seguro da viagem" icon="mdi-shield-check-outline">
    <template #header-actions>
      <SicatHelpHint term="averbacao" />
      <v-btn size="small" variant="text" :loading="loading" prepend-icon="mdi-refresh" @click="load">Atualizar</v-btn>
    </template>

    <SicatInlineAlert v-if="loadError" tone="error" :message="loadError" />
    <SicatLoadingState v-else-if="loading && !policies.length && !declarations.length" title="Carregando seguros…" compact />

    <template v-else>
      <SicatInlineAlert v-if="commandError" tone="error" :message="commandError" />

      <SicatInlineAlert
        v-if="!carrierPartyId"
        tone="warning"
        message="Esta operação ainda não tem transportador vinculado — sem transportador não há apólice para averbar."
      />
      <SicatInlineAlert
        v-else-if="!livePolicies.length"
        tone="warning"
        message="O transportador desta viagem não tem apólice vigente. Cadastre ou renove a apólice antes do embarque — a carga sai descoberta."
      />

      <!-- Confronto limite de garantia × valor da carga (antecipa TR-SEG-004). -->
      <SicatInlineAlert
        v-if="hasCargoWithoutValue"
        tone="warning"
        message="Há carga sem valor declarado nesta viagem. Sem valor não dá para conferir o limite da apólice nem calcular o prêmio — a averbação é recusada."
      />
      <SicatInlineAlert
        v-if="exceededChecks.length"
        tone="error"
        :message="`A carga declarada (${formatCurrencyBRL(declaredCargoAmount)}) ESTOURA o limite por viagem de ${exceededChecks.length} apólice(s). Sem endosso, a diferença fica descoberta e o pré-embarque acusa (TR-SEG-004).`"
      />

      <div v-if="limitChecks.length" class="transp-seguro__policies">
        <article v-for="check in limitChecks" :key="check.policyId" class="transp-seguro__policy" :data-exceeded="check.exceeded ? 'true' : 'false'">
          <header class="transp-seguro__policy-head">
            <strong>{{ policyTypeLabel(check.policyType) }} · {{ check.policyNumber }}</strong>
            <SicatStatusBadge
              :status="check.validityStatus"
              :label="check.validityLabel"
              domain="insurance-policy"
              with-dot
            />
          </header>
          <dl class="transp-seguro__policy-fields">
            <div>
              <dt>Limite por viagem</dt>
              <dd>{{ check.hasLimit ? formatCurrencyBRL(check.limit) : 'Não configurado' }}</dd>
            </div>
            <div>
              <dt>Carga declarada</dt>
              <dd>{{ declaredCargoAmount === null ? 'Sem valor declarado' : formatCurrencyBRL(declaredCargoAmount) }}</dd>
            </div>
            <div>
              <dt>Taxa</dt>
              <dd>{{ check.ratePercent === undefined || check.ratePercent === null ? 'Sem taxa' : formatRatePercent(check.ratePercent) }}</dd>
            </div>
            <div>
              <dt>Prêmio estimado</dt>
              <dd>{{ check.estimatedPremium === null ? '-' : formatCurrencyBRL(check.estimatedPremium) }}</dd>
            </div>
          </dl>
        </article>
      </div>

      <div class="transp-seguro__actions">
        <v-btn
          color="primary"
          variant="flat"
          prepend-icon="mdi-shield-plus-outline"
          :disabled="!canAverbar"
          :loading="commandLoading"
          @click="handleAverbar"
        >
          Averbar viagem
        </v-btn>
        <span v-if="!canAverbar && livePolicies.length" class="transp-seguro__hint">
          Todas as apólices vigentes já têm averbação viva nesta viagem.
        </span>
      </div>

      <SicatNextStep
        v-if="justAverbou"
        title="Averbação enviada — e agora?"
        message="A seguradora confirma pela reconciliação; enquanto isso, siga a viagem: garanta o CIOT e a emissão fiscal nos cartões logo abaixo."
      />

      <!-- Averbações desta viagem (histórico completo, inclusive terminais). -->
      <div v-if="declarations.length" class="transp-seguro__declarations">
        <article v-for="declaration in declarations" :key="declaration.id" class="transp-seguro__declaration">
          <header class="transp-seguro__declaration-head">
            <SicatStatusBadge
              :status="declaration.status"
              :label="averbacaoStatusLabel(declaration.status)"
              domain="averbacao"
              with-dot
            />
            <span class="transp-seguro__declaration-policy">{{ policyLabelById(declaration.policyId) }}</span>
            <strong class="transp-seguro__declaration-premium">{{ formatCurrencyBRL(declaration.premiumAmount) }}</strong>
          </header>

          <p class="transp-seguro__declaration-meta">
            Carga congelada em {{ formatCurrencyBRL(declaration.declaredCargoAmount) }} ·
            taxa {{ formatRatePercent(declaration.appliedRatePercent) }}
            <template v-if="declaration.providerDeclarationRef">
              · protocolo {{ declaration.providerDeclarationRef }}
            </template>
            <template v-if="declaration.lastErrorCode">
              · <span class="transp-seguro__declaration-error">{{ declaration.lastErrorCode }}</span>
            </template>
          </p>

          <div v-if="averbacaoAcceptsMutation(declaration.status)" class="transp-seguro__declaration-actions">
            <v-btn size="small" variant="tonal" :loading="commandLoading" @click="handleRetificar(declaration)">Retificar</v-btn>
            <v-btn size="small" variant="text" color="error" :loading="commandLoading" @click="handleCancelar(declaration)">
              Cancelar averbação
            </v-btn>
          </div>

          <details v-if="declarationTimelineSteps(declaration).length" class="transp-seguro__timeline">
            <summary>Eventos ({{ declarationTimelineSteps(declaration).length }})</summary>
            <SicatStatusTimeline :steps="declarationTimelineSteps(declaration)" />
          </details>
        </article>
      </div>
      <SicatEmptyState
        v-else
        title="Esta viagem ainda não foi averbada"
        description="Averbar registra a carga na seguradora e congela o prêmio do embarque. Exige a operação contratada e todo o valor da carga declarado."
        icon="mdi-shield-outline"
        compact
      />
    </template>

    <SicatConfirmDialog
      :visible="dialogVisible"
      :title="dialogTitle"
      :message="dialogMessage"
      :confirm-label="dialogConfirmLabel"
      :cancel-label="dialogCancelLabel"
      :danger="dialogDanger"
      :show-cancel="dialogShowCancel"
      @confirm="accept"
      @cancel="cancel"
      @close="cancel"
    />
  </SicatCard>
</template>

<style scoped>
.transp-seguro__policies {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: var(--space-3);
}

.transp-seguro__policy {
  border: 1px solid rgba(var(--v-border-color), 0.16);
  border-radius: var(--radius-md);
  padding: var(--space-3);
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.transp-seguro__policy[data-exceeded='true'] {
  border-color: rgba(var(--v-theme-error), 0.5);
  background: rgba(var(--v-theme-error), 0.05);
}

.transp-seguro__policy-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  flex-wrap: wrap;
}

.transp-seguro__policy-fields {
  display: grid;
  gap: 6px;
  margin: 0;
}

.transp-seguro__policy-fields > div {
  display: flex;
  justify-content: space-between;
  gap: 8px;
}

.transp-seguro__policy-fields dt {
  font-size: 0.76rem;
  font-weight: 700;
  color: rgba(var(--v-theme-on-surface), 0.6);
}

.transp-seguro__policy-fields dd {
  margin: 0;
  font-size: 0.86rem;
  text-align: right;
}

.transp-seguro__actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.transp-seguro__hint {
  font-size: 0.84rem;
  color: rgba(var(--v-theme-on-surface), 0.68);
}

.transp-seguro__declarations {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.transp-seguro__declaration {
  border-top: 1px solid rgba(var(--v-border-color), 0.14);
  padding-top: var(--space-3);
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.transp-seguro__declaration-head {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.transp-seguro__declaration-policy {
  font-weight: 600;
  font-size: 0.88rem;
}

.transp-seguro__declaration-premium {
  margin-left: auto;
  font-size: 0.95rem;
}

.transp-seguro__declaration-meta {
  margin: 0;
  font-size: 0.82rem;
  color: rgba(var(--v-theme-on-surface), 0.7);
}

.transp-seguro__declaration-error {
  color: rgb(var(--v-theme-error));
  font-weight: 600;
}

.transp-seguro__declaration-actions {
  display: flex;
  gap: 8px;
}

.transp-seguro__timeline summary {
  cursor: pointer;
  font-size: 0.84rem;
  font-weight: 600;
}
</style>
