<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAuthStore } from '../../stores/auth.js';
import { useTransporteStore } from '../../stores/transporteStore.js';
import {
  cargoRegimeLabel,
  commandIcon,
  commandLabel,
  complianceAlertTone,
  complianceStatusLabel,
  formatCurrencyBRL,
  formatDateTimeBR,
  FREIGHT_COMPONENTS,
  gateLabel,
  operationStatusLabel,
  routedAvailableCommands
} from './transporteUiHelpers.js';
import { useConfirmDialog } from '../../composables/useConfirmDialog.js';
import { useNotification } from '../../composables/useNotification.js';
import SicatPageLayout from '../../components/sicat/SicatPageLayout.vue';
import SicatPageHeader from '../../components/shell/SicatPageHeader.vue';
import SicatCard from '../../components/sicat/SicatCard.vue';
import SicatStatusBadge from '../../components/sicat/SicatStatusBadge.vue';
import SicatInlineAlert from '../../components/sicat/SicatInlineAlert.vue';
import SicatEmptyState from '../../components/sicat/SicatEmptyState.vue';
import SicatLoadingState from '../../components/sicat/SicatLoadingState.vue';
import SicatConfirmDialog from '../../components/sicat/SicatConfirmDialog.vue';

const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();
const store = useTransporteStore();
const notify = useNotification();
const {
  dialogVisible, dialogTitle, dialogMessage, dialogConfirmLabel, dialogCancelLabel,
  dialogDanger, dialogShowCancel, confirm, accept, cancel
} = useConfirmDialog();

const {
  selected,
  loadingDetail,
  detailError,
  complianceOverview,
  loadingCompliance,
  complianceError,
  commandLoading,
  commandError,
  loadById,
  loadCompliance,
  submitValidation,
  contract,
  reopen,
  cancel: cancelOperation,
  revalidateGate,
  clearCommandState
} = store;

const operationId = computed(() => String(route.params.operationId || '').trim());

const routedCommands = computed(() => routedAvailableCommands(selected.value?.availableCommands));
const hasCommand = (command) => routedCommands.value.includes(command);

const cancelReasonDraft = ref('');

const summaryItems = computed(() => {
  const operation = selected.value;
  if (!operation) return [];
  const originLabel = operation.route
    ? `${operation.route.originMunicipality}/${operation.route.originUf}`
    : '-';
  const destinationLabel = operation.route
    ? `${operation.route.destinationMunicipality}/${operation.route.destinationUf}`
    : '-';
  return [
    { label: 'Referência', value: operation.referenceCode || operation.id },
    { label: 'Regime de carga', value: cargoRegimeLabel(operation.cargoRegime) },
    { label: 'Rota', value: operation.route ? `${originLabel} → ${destinationLabel}` : 'Não informada' },
    { label: 'Moeda', value: operation.currency || '-' },
    { label: 'Forma de pagamento', value: operation.paymentMethod || '-' },
    { label: 'Prazo de pagamento', value: operation.paymentTermDays != null ? `${operation.paymentTermDays} dias` : '-' },
    { label: 'Criado em', value: formatDateTimeBR(operation.createdAt) },
    { label: 'Atualizado em', value: formatDateTimeBR(operation.updatedAt) }
  ];
});

const freightItems = computed(() => {
  const freight = selected.value?.freight || {};
  return FREIGHT_COMPONENTS.map(({ key, label }) => ({ key, label, value: formatCurrencyBRL(freight[key]) }));
});

async function loadAll(id) {
  if (!id) return;
  await loadById(id);
  await loadCompliance(id);
}

watch(operationId, async (next) => {
  if (next) await loadAll(next);
}, { immediate: false });

onMounted(async () => {
  if (operationId.value) await loadAll(operationId.value);
});

function goBack() {
  router.push('/transporte/operacoes');
}

async function runCommand({ title, message, confirmLabel, danger = false, action, successMessage }) {
  const ok = await confirm({ title, message, confirmLabel, danger });
  if (!ok) return;

  clearCommandState();
  try {
    await action();
    notify.success(successMessage);
  } catch {
    if (commandError.value) notify.error(commandError.value);
  }
}

function handleSubmitValidation() {
  return runCommand({
    title: 'Submeter validação',
    message: 'Avalia o GATE_PROPOSAL e move a operação para "pronta para contratar" (sem bloqueio) ou "bloqueada" (com bloqueio), no mesmo request.',
    confirmLabel: 'Submeter validação',
    action: submitValidation,
    successMessage: 'Validação submetida.'
  });
}

function handleContract() {
  return runCommand({
    title: 'Contratar operação',
    message: 'Ativa o GATE_CONTRACT. Se o gate bloquear, a operação permanece em "pronta para contratar".',
    confirmLabel: 'Contratar',
    action: contract,
    successMessage: 'Operação contratada.'
  });
}

function handleReopen() {
  return runCommand({
    title: 'Reabrir operação',
    message: 'Volta a operação para rascunho para correção dos dados. Limpa o motivo de bloqueio atual.',
    confirmLabel: 'Reabrir',
    action: reopen,
    successMessage: 'Operação reaberta para correção.'
  });
}

async function handleCancel() {
  const reason = cancelReasonDraft.value.trim();
  if (!reason) {
    notify.warning('Informe o motivo do cancelamento antes de continuar.');
    return;
  }

  await runCommand({
    title: 'Cancelar operação',
    message: `Motivo informado: "${reason}". Esta ação não pode ser desfeita.`,
    confirmLabel: 'Confirmar cancelamento',
    danger: true,
    action: async () => {
      await cancelOperation({ reason });
      await loadCompliance(operationId.value);
    },
    successMessage: 'Operação cancelada.'
  });

  if (!commandError.value) {
    cancelReasonDraft.value = '';
  }
}

async function handleRevalidateGate(gate) {
  clearCommandState();
  try {
    await revalidateGate(gate);
    notify.success(`Conformidade de ${gateLabel(gate)} revalidada.`);
  } catch {
    if (commandError.value) notify.error(commandError.value);
  }
}
</script>

<template>
  <SicatPageLayout :loading="loadingDetail && !selected" :error="detailError">
    <template #header>
      <SicatPageHeader
        kicker="Transporte · Operação"
        :title="selected?.referenceCode || selected?.id || 'Carregando…'"
        :description="selected ? `ID: ${selected.id}` : ''"
      >
        <template #actions>
          <v-btn variant="outlined" prepend-icon="mdi-arrow-left" @click="goBack">Voltar</v-btn>
          <v-btn
            v-if="hasCommand('submit_validation')"
            color="primary"
            variant="flat"
            :prepend-icon="commandIcon('submit_validation')"
            :loading="commandLoading"
            @click="handleSubmitValidation"
          >
            {{ commandLabel('submit_validation') }}
          </v-btn>
          <v-btn
            v-if="hasCommand('contract')"
            color="primary"
            variant="flat"
            :prepend-icon="commandIcon('contract')"
            :loading="commandLoading"
            @click="handleContract"
          >
            {{ commandLabel('contract') }}
          </v-btn>
          <v-btn
            v-if="hasCommand('reopen')"
            variant="tonal"
            :prepend-icon="commandIcon('reopen')"
            :loading="commandLoading"
            @click="handleReopen"
          >
            {{ commandLabel('reopen') }}
          </v-btn>
        </template>
      </SicatPageHeader>
    </template>

    <div v-if="selected" class="transp-detail__badges">
      <SicatStatusBadge :status="selected.status" :label="operationStatusLabel(selected.status)" domain="transport-operation" with-dot />
      <v-chip v-if="selected.blockedReasonCode" size="small" color="error" variant="tonal" prepend-icon="mdi-block-helper">
        Bloqueada: {{ selected.blockedReasonCode }}
      </v-chip>
      <v-chip v-if="selected.cancelledReason" size="small" color="error" variant="tonal" prepend-icon="mdi-cancel">
        Cancelada: {{ selected.cancelledReason }}
      </v-chip>
    </div>

    <SicatCard v-if="selected" title="Resumo">
      <div class="transp-detail__summary">
        <div v-for="item in summaryItems" :key="item.label" class="transp-detail__summary-item">
          <span class="transp-detail__summary-label">{{ item.label }}</span>
          <strong class="transp-detail__summary-value">{{ item.value }}</strong>
        </div>
      </div>
    </SicatCard>

    <SicatCard v-if="selected" title="Frete (decomposto)" subtitle="VPO nunca é somado ao frete.">
      <div class="transp-detail__summary">
        <div v-for="item in freightItems" :key="item.key" class="transp-detail__summary-item">
          <span class="transp-detail__summary-label">{{ item.label }}</span>
          <strong class="transp-detail__summary-value">{{ item.value }}</strong>
        </div>
      </div>
    </SicatCard>

    <SicatCard v-if="selected && hasCommand('cancel')" title="Cancelar operação" variant="system">
      <div class="transp-detail__cancel">
        <v-textarea
          v-model="cancelReasonDraft"
          label="Motivo do cancelamento"
          placeholder="Obrigatório — descreva o motivo do cancelamento."
          rows="2"
          auto-grow
          density="comfortable"
          variant="outlined"
          hide-details="auto"
        />
        <v-btn
          color="error"
          variant="tonal"
          :prepend-icon="commandIcon('cancel')"
          :disabled="!cancelReasonDraft.trim()"
          :loading="commandLoading"
          @click="handleCancel"
        >
          {{ commandLabel('cancel') }}
        </v-btn>
      </div>
    </SicatCard>

    <section v-if="selected" class="transp-detail__gates-section">
      <h2 class="transp-detail__gates-title">Painel de conformidade</h2>

      <SicatInlineAlert
        v-if="complianceError"
        tone="error"
        title="Falha ao carregar o painel de conformidade"
        :message="complianceError"
      />
      <SicatLoadingState v-else-if="loadingCompliance && !complianceOverview" title="Carregando conformidade…" compact />

      <div v-else-if="complianceOverview" class="transp-detail__gates">
        <SicatCard v-for="gateEntry in complianceOverview.gates" :key="gateEntry.gate" :title="gateLabel(gateEntry.gate)">
          <template #header-actions>
            <SicatStatusBadge
              v-if="gateEntry.latestEvaluation"
              :status="gateEntry.latestEvaluation.overallStatus"
              :label="complianceStatusLabel(gateEntry.latestEvaluation.overallStatus)"
              domain="compliance"
              with-dot
            />
            <v-btn
              size="small"
              variant="text"
              prepend-icon="mdi-refresh"
              :loading="commandLoading"
              @click="handleRevalidateGate(gateEntry.gate)"
            >
              Revalidar conformidade
            </v-btn>
          </template>

          <div v-if="gateEntry.latestEvaluation" class="transp-detail__checks">
            <SicatInlineAlert
              v-for="check in gateEntry.latestEvaluation.checks"
              :key="check.ruleCode"
              :tone="complianceAlertTone(check.status)"
              :title="`${check.ruleCode} · ${complianceStatusLabel(check.status)}`"
              :message="check.humanMessage"
            >
              <div class="transp-detail__check-meta">
                <span v-if="check.reasonCode" class="transp-detail__check-meta-item">Motivo: {{ check.reasonCode }}</span>
                <span v-if="check.rawStatus && check.rawStatus !== check.status" class="transp-detail__check-meta-item">
                  Bloquearia se a regra fosse vigente/bloqueante (status original: {{ complianceStatusLabel(check.rawStatus) }})
                </span>
                <span v-if="check.legalBasis?.length" class="transp-detail__check-meta-item">
                  Base legal: {{ check.legalBasis.map((entry) => entry.reference).join('; ') }}
                </span>
              </div>
            </SicatInlineAlert>
          </div>
          <SicatEmptyState
            v-else
            title="Ainda não avaliado"
            description="Use &quot;Revalidar conformidade&quot; para rodar o motor pela primeira vez neste gate."
            icon="mdi-clipboard-text-clock-outline"
            compact
          />
        </SicatCard>
      </div>
    </section>

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
  </SicatPageLayout>
</template>

<style scoped>
.transp-detail__badges {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.transp-detail__summary {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: var(--space-4);
}

.transp-detail__summary-item {
  display: grid;
  gap: 2px;
}

.transp-detail__summary-label {
  font-size: 0.72rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: rgba(var(--v-theme-on-surface), 0.55);
  font-weight: 700;
}

.transp-detail__summary-value {
  font-size: 0.95rem;
  color: rgba(var(--v-theme-on-surface), 0.9);
  word-break: break-word;
}

.transp-detail__cancel {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  gap: var(--space-3);
}

.transp-detail__cancel :deep(.v-textarea) {
  flex: 1;
  min-width: 260px;
}

.transp-detail__gates-section {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.transp-detail__gates-title {
  margin: 0;
  font-size: 1.05rem;
  font-weight: 700;
  color: rgba(var(--v-theme-on-surface), 0.9);
}

.transp-detail__gates {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(360px, 1fr));
  gap: var(--space-4);
}

.transp-detail__checks {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.transp-detail__check-meta {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin-top: 4px;
  font-size: 0.82rem;
  color: rgba(var(--v-theme-on-surface), 0.68);
}
</style>
