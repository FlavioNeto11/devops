<script setup>
import { computed, onMounted, ref } from 'vue';
import { useAuthStore } from '../../stores/auth.js';
import { useSegurosStore } from '../../stores/segurosStore.js';
import { useConfirmDialog } from '../../composables/useConfirmDialog.js';
import { useNotification } from '../../composables/useNotification.js';
import {
  apuracaoPeriodoStatusLabel,
  billingBasisLabel,
  buildRecentPeriodOptions,
  formatCurrencyBRL,
  formatDateTimeBR,
  formatPeriodMonthBR,
  formatRatePercent,
  apuracaoRunTriggerLabel,
  policyTypeLabel
} from './transporteUiHelpers.js';
import SicatPageLayout from '../../components/sicat/SicatPageLayout.vue';
import SicatPageHeader from '../../components/shell/SicatPageHeader.vue';
import SicatCard from '../../components/sicat/SicatCard.vue';
import SicatMetricCard from '../../components/sicat/SicatMetricCard.vue';
import SicatDataTable from '../../components/sicat/SicatDataTable.vue';
import SicatStatusBadge from '../../components/sicat/SicatStatusBadge.vue';
import SicatInlineAlert from '../../components/sicat/SicatInlineAlert.vue';
import SicatEmptyState from '../../components/sicat/SicatEmptyState.vue';
import SicatConfirmDialog from '../../components/sicat/SicatConfirmDialog.vue';
import SicatHelpHint from '../../components/sicat/SicatHelpHint.vue';

/**
 * Apuração mensal do prêmio de averbação (onda F8, REQ-SICAT-0035/0037).
 * Molde: TransporteTransportadorDetailView.vue (tela em seções).
 *
 * A conta do mês é `max(Σ prêmios averbados, custo mínimo mensal)` — e o que a
 * tela precisa responder, antes de qualquer número, é QUAL DOS DOIS venceu:
 * quando o mínimo prevalece, transportar mais no mês seguinte não custa nada a
 * mais até cruzar o piso, e essa é a leitura comercial que o operador procura.
 * Por isso `billingBasis` vira destaque e alerta, não uma coluna discreta.
 *
 * Há UM período por apólice × mês (não um por conta): o mês é o seletor, a
 * tabela lista os períodos daquele mês, e o extrato (`statement.items` — cada
 * averbação que entrou na conta) só é carregado para o período selecionado,
 * junto da trilha append-only de recálculos (`runs`), que é o que torna a conta
 * reproduzível.
 */

const authStore = useAuthStore();
const store = useSegurosStore();
const notify = useNotification();
const {
  dialogVisible, dialogTitle, dialogMessage, dialogConfirmLabel, dialogCancelLabel,
  dialogDanger, dialogShowCancel, confirm, accept, cancel
} = useConfirmDialog();

const {
  periodMonth, periods, loadingPeriods, periodsError,
  periodDetail, loadingPeriodDetail, periodDetailError,
  policies, loadPolicies,
  commandLoading, commandError,
  fetchPeriods, loadPeriodDetail, recomputePeriod, closePeriod
} = store;

/** "Hoje" é resolvido UMA vez, aqui — o helper de opções é puro. */
const monthOptions = ref([]);

const policyById = computed(() => new Map(policies.value.map((policy) => [policy.id, policy])));

function policyLabel(policyId) {
  const policy = policyById.value.get(policyId);
  if (!policy) return policyId || '-';
  return `${policyTypeLabel(policy.policyType)} · ${policy.policyNumber}`;
}

const selectedPeriodId = ref('');
const selectedPeriod = computed(
  () => periodDetail.value || periods.value.find((entry) => entry.id === selectedPeriodId.value) || null
);

const periodHeaders = [
  { title: 'Apólice', key: 'policy', sortable: false },
  { title: 'Transportado', key: 'declaredTotalAmount', sortable: false, align: 'end' },
  { title: 'Prêmios', key: 'premiumTotalAmount', sortable: false, align: 'end' },
  { title: 'Mínimo', key: 'minimumAmount', sortable: false, align: 'end' },
  { title: 'Valor do mês', key: 'billedAmount', sortable: false, align: 'end' },
  { title: 'Base', key: 'billingBasis', sortable: false },
  { title: 'Situação', key: 'status', sortable: false }
];

const periodRows = computed(() =>
  periods.value.map((period) => ({
    id: period.id,
    policy: policyLabel(period.policyId),
    declaredTotalAmount: formatCurrencyBRL(period.declaredTotalAmount),
    premiumTotalAmount: formatCurrencyBRL(period.premiumTotalAmount),
    minimumAmount: formatCurrencyBRL(period.minimumAmount),
    billedAmount: formatCurrencyBRL(period.billedAmount),
    billingBasis: billingBasisLabel(period.billingBasis),
    status: period.status,
    statusLabel: apuracaoPeriodoStatusLabel(period.status)
  }))
);

const metricCards = computed(() => {
  const period = selectedPeriod.value;
  if (!period) return [];
  const minimumWon = period.billingBasis === 'minimum';
  return [
    {
      key: 'declared',
      label: 'Total transportado',
      value: formatCurrencyBRL(period.declaredTotalAmount),
      icon: 'mdi-package-variant-closed',
      tone: 'neutral'
    },
    {
      key: 'premium',
      label: 'Soma dos prêmios',
      value: formatCurrencyBRL(period.premiumTotalAmount),
      icon: 'mdi-shield-check-outline',
      tone: minimumWon ? 'neutral' : 'success'
    },
    {
      key: 'minimum',
      label: 'Custo mínimo mensal',
      value: formatCurrencyBRL(period.minimumAmount),
      icon: 'mdi-arrow-collapse-down',
      tone: minimumWon ? 'warning' : 'neutral'
    },
    {
      key: 'billed',
      label: 'Valor do mês',
      value: formatCurrencyBRL(period.billedAmount),
      hint: `Base: ${billingBasisLabel(period.billingBasis)}`,
      icon: 'mdi-cash-multiple',
      tone: 'primary'
    }
  ];
});

/** A explicação didática muda conforme a base — não é o mesmo recado. */
const basisAlert = computed(() => {
  const period = selectedPeriod.value;
  if (!period) return null;
  if (period.billingBasis === 'minimum') {
    return {
      tone: 'warning',
      message: `Neste mês o CUSTO MÍNIMO prevaleceu: as averbações somaram ${formatCurrencyBRL(period.premiumTotalAmount)}, abaixo do mínimo de ${formatCurrencyBRL(period.minimumAmount)} da apólice. A cobrança é o mínimo — averbar mais viagens até cruzar esse piso não aumenta a conta.`
    };
  }
  return {
    tone: 'info',
    message: `Neste mês a SOMA DOS PRÊMIOS prevaleceu (${formatCurrencyBRL(period.premiumTotalAmount)}), acima do mínimo de ${formatCurrencyBRL(period.minimumAmount)}. Daqui em diante cada viagem averbada soma ao valor do mês.`
  };
});

const statementHeaders = [
  { title: 'Operação', key: 'operationId', sortable: false },
  { title: 'Valor da carga', key: 'declaredCargoAmount', sortable: false, align: 'end' },
  { title: 'Taxa', key: 'appliedRatePercent', sortable: false, align: 'end' },
  { title: 'Prêmio', key: 'premiumAmount', sortable: false, align: 'end' },
  { title: 'Averbada em', key: 'declaredAt', sortable: false }
];

const statementRows = computed(() => {
  const items = periodDetail.value?.statement?.items;
  if (!Array.isArray(items)) return [];
  return items.map((item) => ({
    id: item.declarationId,
    operationId: item.operationId,
    declaredCargoAmount: formatCurrencyBRL(item.declaredCargoAmount),
    appliedRatePercent: formatRatePercent(item.appliedRatePercent),
    premiumAmount: formatCurrencyBRL(item.premiumAmount),
    declaredAt: formatDateTimeBR(item.declaredAt)
  }));
});

const statementNotes = computed(() => {
  const notes = periodDetail.value?.statement?.notes;
  return Array.isArray(notes) ? notes : [];
});

const runs = computed(() => (Array.isArray(periodDetail.value?.runs) ? periodDetail.value.runs : []));

const periodIsOpen = computed(() => selectedPeriod.value?.status === 'open');

async function changeMonth(month) {
  selectedPeriodId.value = '';
  periodDetail.value = null;
  await fetchPeriods(month);
  await autoSelectFirstPeriod();
}

/** Um período só? Abre direto — clicar para ver o único item é atrito puro. */
async function autoSelectFirstPeriod() {
  if (periods.value.length === 1) {
    await selectPeriod(periods.value[0].id);
  }
}

async function selectPeriod(periodId) {
  selectedPeriodId.value = periodId;
  await loadPeriodDetail(periodId);
}

async function handleRecompute() {
  const period = selectedPeriod.value;
  if (!period) return;
  const ok = await confirm({
    title: 'Recalcular o período',
    message: `Refaz a conta de ${formatPeriodMonthBR(period.periodMonth)} a partir das averbações confirmadas do mês. A trilha registra o recálculo.`,
    confirmLabel: 'Recalcular'
  });
  if (!ok) return;
  try {
    await recomputePeriod(period.id);
    notify.success('Período recalculado.');
  } catch {
    if (commandError.value) notify.error(commandError.value);
  }
}

async function handleClose() {
  const period = selectedPeriod.value;
  if (!period) return;
  const ok = await confirm({
    title: 'Fechar o período',
    message: `Recalcula e FECHA ${formatPeriodMonthBR(period.periodMonth)} em ${formatCurrencyBRL(period.billedAmount)}. Depois de fechado, corrigir exige reabertura administrativa, que fica registrada na trilha.`,
    confirmLabel: 'Fechar o mês',
    danger: true
  });
  if (!ok) return;
  try {
    await closePeriod(period.id);
    notify.success('Período fechado.');
  } catch {
    if (commandError.value) notify.error(commandError.value);
  }
}

onMounted(async () => {
  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  monthOptions.value = buildRecentPeriodOptions(currentMonth, 12);
  periodMonth.value = currentMonth;
  await Promise.all([fetchPeriods(currentMonth), loadPolicies()]);
  await autoSelectFirstPeriod();
});
</script>

<template>
  <SicatPageLayout>
    <template #header>
      <SicatPageHeader
        kicker="Transporte · Seguros"
        title="Apuração mensal"
        description="Quanto o seguro de carga custa no mês: a soma dos prêmios averbados contra o custo mínimo da apólice — vale o maior dos dois."
      >
        <template #actions>
          <v-btn variant="text" :loading="loadingPeriods" prepend-icon="mdi-refresh" @click="fetchPeriods()">
            Atualizar
          </v-btn>
        </template>
      </SicatPageHeader>
    </template>

    <template #banner>
      <SicatInlineAlert
        v-if="!authStore.hasActiveCetesbAccount.value"
        tone="warning"
        message="Selecione uma conta para ver a apuração."
      />
      <SicatInlineAlert v-else-if="periodsError" tone="error" :message="periodsError">
        <template #actions>
          <v-btn size="small" variant="text" :loading="loadingPeriods" @click="fetchPeriods()">Tentar novamente</v-btn>
        </template>
      </SicatInlineAlert>
      <SicatInlineAlert v-else-if="periodDetailError" tone="error" :message="periodDetailError" />
    </template>

    <SicatCard title="Mês de referência" icon="mdi-calendar-month-outline">
      <template #header-actions>
        <SicatHelpHint term="apuracao_seguros" />
      </template>
      <v-select
        :model-value="periodMonth"
        :items="monthOptions"
        item-title="label"
        item-value="value"
        label="Mês"
        density="comfortable"
        variant="outlined"
        hide-details="auto"
        class="transp-apur__month"
        @update:model-value="changeMonth"
      />
    </SicatCard>

    <SicatCard :title="`Períodos de ${formatPeriodMonthBR(periodMonth)}`" flush-body>
      <SicatDataTable
        :headers="periodHeaders"
        :items="periodRows"
        :loading="loadingPeriods"
        :error="periodsError"
        :show-footer="false"
        :items-per-page="-1"
        :empty="{
          title: 'Nenhum período apurado neste mês',
          description: 'A apuração nasce das averbações do mês. Sem viagem averbada, não há conta a fechar.',
          icon: 'mdi-calendar-remove-outline'
        }"
        @row-click="(row) => row?.id && selectPeriod(row.id)"
      >
        <template #[`item.status`]="{ item }">
          <SicatStatusBadge :status="item.status" :label="item.statusLabel" domain="apuracao-periodo" with-dot />
        </template>
      </SicatDataTable>
    </SicatCard>

    <template v-if="selectedPeriod">
      <SicatCard :title="`Extrato · ${policyLabel(selectedPeriod.policyId)}`" icon="mdi-receipt-text-outline">
        <template #header-actions>
          <SicatStatusBadge
            :status="selectedPeriod.status"
            :label="apuracaoPeriodoStatusLabel(selectedPeriod.status)"
            domain="apuracao-periodo"
            with-dot
          />
        </template>

        <SicatInlineAlert v-if="commandError" tone="error" :message="commandError" />

        <div class="transp-apur__metrics">
          <SicatMetricCard
            v-for="card in metricCards"
            :key="card.key"
            :label="card.label"
            :value="card.value"
            :hint="card.hint || ''"
            :icon="card.icon"
            :tone="card.tone"
            :loading="loadingPeriodDetail"
          />
        </div>

        <SicatInlineAlert v-if="basisAlert" :tone="basisAlert.tone" :message="basisAlert.message" />

        <ul v-if="statementNotes.length" class="transp-apur__notes">
          <li v-for="(note, index) in statementNotes" :key="index">{{ note }}</li>
        </ul>

        <div class="transp-apur__actions">
          <v-btn
            v-if="periodIsOpen"
            variant="tonal"
            prepend-icon="mdi-calculator-variant-outline"
            :loading="commandLoading"
            @click="handleRecompute"
          >
            Recalcular
          </v-btn>
          <v-btn
            v-if="periodIsOpen"
            color="primary"
            variant="flat"
            prepend-icon="mdi-lock-check-outline"
            :loading="commandLoading"
            @click="handleClose"
          >
            Fechar o mês
          </v-btn>
          <span v-else class="transp-apur__closed-hint">
            Mês fechado em {{ formatDateTimeBR(selectedPeriod.closedAt) }} — reabrir é ação administrativa e deixa rastro na trilha.
          </span>
        </div>
      </SicatCard>

      <SicatCard title="Averbações que entraram na conta" flush-body>
        <SicatDataTable
          :headers="statementHeaders"
          :items="statementRows"
          :loading="loadingPeriodDetail"
          :show-footer="false"
          :items-per-page="-1"
          density="compact"
          :empty="{
            title: 'Extrato vazio',
            description: 'Nenhuma averbação confirmada entrou nesta conta — o valor do mês é o custo mínimo da apólice.',
            icon: 'mdi-receipt-text-outline'
          }"
        >
          <template #[`item.operationId`]="{ item }">
            <router-link class="transp-apur__link" :to="`/transporte/operacoes/${item.operationId}`">
              {{ item.operationId }}
            </router-link>
          </template>
        </SicatDataTable>
      </SicatCard>

      <SicatCard title="Trilha de recálculos" icon="mdi-history">
        <details class="transp-apur__runs">
          <summary>Ver a trilha ({{ runs.length }})</summary>
          <SicatEmptyState
            v-if="!runs.length"
            title="Sem recálculos registrados"
            description="A trilha é append-only: cada recálculo ou fechamento deixa uma linha aqui."
            icon="mdi-history"
            compact
          />
          <ol v-else class="transp-apur__runs-list">
            <li v-for="run in runs" :key="run.id">
              <strong>{{ apuracaoRunTriggerLabel(run.trigger) }}</strong>
              <span class="transp-apur__run-date">{{ formatDateTimeBR(run.createdAt) }}</span>
              <span v-if="run.result?.reopened" class="transp-apur__run-reopened">Reabertura</span>
            </li>
          </ol>
        </details>
      </SicatCard>
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
  </SicatPageLayout>
</template>

<style scoped>
.transp-apur__month {
  max-width: 260px;
}

.transp-apur__metrics {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: var(--space-3);
}

.transp-apur__notes {
  margin: 0;
  padding-left: 18px;
  font-size: 0.86rem;
  color: rgba(var(--v-theme-on-surface), 0.72);
}

.transp-apur__actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.transp-apur__closed-hint {
  font-size: 0.85rem;
  color: rgba(var(--v-theme-on-surface), 0.7);
}

.transp-apur__link {
  color: rgb(var(--v-theme-primary));
  font-weight: 600;
  text-decoration: none;
}

.transp-apur__link:hover {
  text-decoration: underline;
}

.transp-apur__runs summary {
  cursor: pointer;
  font-size: 0.88rem;
  font-weight: 600;
}

.transp-apur__runs-list {
  margin: var(--space-3) 0 0;
  padding-left: 18px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 0.86rem;
}

.transp-apur__run-date {
  margin-left: 8px;
  color: rgba(var(--v-theme-on-surface), 0.62);
}

.transp-apur__run-reopened {
  margin-left: 8px;
  color: rgb(var(--v-theme-warning));
  font-weight: 600;
}
</style>
