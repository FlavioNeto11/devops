<script setup>
import { computed, onMounted, reactive, ref } from 'vue';
import { useAuthStore } from '../../stores/auth.js';
import { useSegurosStore } from '../../stores/segurosStore.js';
import { useNotification } from '../../composables/useNotification.js';
import {
  formatCurrencyBRL,
  formatDateBR,
  formatRatePercent,
  policyTypeLabel,
  resolveInsurancePolicyStatus
} from './transporteUiHelpers.js';
import SicatPageLayout from '../../components/sicat/SicatPageLayout.vue';
import SicatPageHeader from '../../components/shell/SicatPageHeader.vue';
import SicatCard from '../../components/sicat/SicatCard.vue';
import SicatMetricCard from '../../components/sicat/SicatMetricCard.vue';
import SicatDataTable from '../../components/sicat/SicatDataTable.vue';
import SicatStatusBadge from '../../components/sicat/SicatStatusBadge.vue';
import SicatInlineAlert from '../../components/sicat/SicatInlineAlert.vue';
import SicatHelpHint from '../../components/sicat/SicatHelpHint.vue';

/**
 * Apólices de seguro — visão CONSOLIDADA da conta (onda F7, REQ-SICAT-0037 com
 * os dados de REQ-SICAT-0028 rev.2 e REQ-SICAT-0034). Molde:
 * TransporteVeiculosListView.vue (lista + diálogos).
 *
 * Esta tela NÃO duplica o CRUD de apólice — ele vive no detalhe do
 * transportador (`/transporte/transportadores/{partyId}`), e cada linha aponta
 * para lá. O que só existe aqui é a leitura TRANSVERSAL do eixo comercial de
 * seguros: quantas apólices estão vigentes/vencendo/vencidas na conta inteira,
 * qual o LIMITE por viagem de cada uma (o teto que TR-SEG-004 confronta com a
 * carga) e qual a TAXA vigente + o custo mínimo mensal (os dois números que
 * decidem a conta do mês). As duas ações daqui são exatamente as que faltavam
 * no detalhe: cadastrar a taxa da apólice e ajustar o limite por viagem.
 *
 * De onde vêm os dados (o caminho é contraintuitivo e está documentado por
 * inteiro no cabeçalho de stores/segurosStore.js): `seguros/vencimentos` é um
 * feed de ALERTA, não um inventário — o inventário sai do fan-out
 * transportadores → apólices → taxas.
 */

const authStore = useAuthStore();
const store = useSegurosStore();
const notify = useNotification();

const {
  policies, policiesTruncated, loadingPolicies, policiesError,
  commandLoading, commandError,
  loadPolicies, createRateSchedule, updatePolicyLimit, clearCommandState
} = store;

/** Situação = vigência DERIVADA (janela de 30 dias), não o status de cadastro. */
const decoratedPolicies = computed(() =>
  policies.value.map((policy) => ({
    policy,
    validity: resolveInsurancePolicyStatus(policy)
  }))
);

const metricCards = computed(() => {
  let valid = 0;
  let expiring = 0;
  let expired = 0;
  for (const { validity } of decoratedPolicies.value) {
    if (validity.status === 'valid') valid += 1;
    else if (validity.status === 'expiring') expiring += 1;
    else if (validity.status === 'expired') expired += 1;
  }
  return [
    { key: 'valid', label: 'Vigentes', value: valid, icon: 'mdi-shield-check-outline', tone: 'success' },
    { key: 'expiring', label: 'Vencendo (30 dias)', value: expiring, icon: 'mdi-shield-alert-outline', tone: expiring > 0 ? 'warning' : 'neutral' },
    { key: 'expired', label: 'Vencidas', value: expired, icon: 'mdi-shield-off-outline', tone: expired > 0 ? 'error' : 'neutral' }
  ];
});

/** Apólice vencida COM viagem em aberto é a única que deixa carga descoberta agora. */
const policiesAtRisk = computed(() =>
  policies.value.filter((policy) => policy.alertType === 'expired_with_open_operation')
);

const headers = [
  { title: 'Transportador', key: 'partyLegalName', sortable: false },
  { title: 'Tipo', key: 'policyType', sortable: false },
  { title: 'Número', key: 'policyNumber', sortable: false },
  { title: 'Seguradora', key: 'insurerName', sortable: false },
  { title: 'Vigência', key: 'validity', sortable: false },
  { title: 'Limite por viagem', key: 'perTripLimit', sortable: false, align: 'end' },
  { title: 'Taxa vigente', key: 'ratePercent', sortable: false, align: 'end' },
  { title: 'Mínimo mensal', key: 'monthlyMinimum', sortable: false, align: 'end' },
  { title: 'Situação', key: 'validityStatus', sortable: false },
  { title: 'Ações', key: 'actions', sortable: false, align: 'end' }
];

const rows = computed(() =>
  decoratedPolicies.value.map(({ policy, validity }) => ({
    id: policy.id,
    partyId: policy.partyId,
    partyLegalName: policy.partyLegalName || '-',
    policyType: policyTypeLabel(policy.policyType),
    policyNumber: policy.policyNumber || '-',
    insurerName: policy.insurerName || '-',
    validity: `${formatDateBR(policy.validFrom)} — ${formatDateBR(policy.validUntil)}`,
    perTripLimit: formatCurrencyBRL(policy.perTripLimitAmount),
    hasLimit: policy.perTripLimitAmount !== null && policy.perTripLimitAmount !== undefined,
    ratePercent: policy.currentRate ? formatRatePercent(policy.currentRate.ratePercent) : 'Sem taxa',
    hasRate: Boolean(policy.currentRate),
    monthlyMinimum: policy.currentRate ? formatCurrencyBRL(policy.currentRate.monthlyMinimumAmount) : '-',
    validityStatus: validity.status,
    validityLabel: validity.label,
    validityDetail: validity.detail,
    atRisk: policy.alertType === 'expired_with_open_operation'
  }))
);

const totalLabel = computed(() => {
  const value = rows.value.length;
  return `${value} ${value === 1 ? 'apólice encontrada' : 'apólices encontradas'}`;
});

// --- Cadastrar taxa de averbação -------------------------------------------
// `ratePercent` é o PERCENTUAL LITERAL do contrato: 0,097% se digita como
// 0.097. O campo diz isso explicitamente porque enviar a fração já dividida
// (0.00097) geraria um prêmio 100× menor sem erro nenhum na API.

const rateDialog = ref(false);
const rateTarget = ref(null);
const rateForm = reactive({ ratePercent: null, monthlyMinimumAmount: null, routeScope: '', validFrom: '' });

function openRateDialog(row) {
  rateTarget.value = policies.value.find((entry) => entry.id === row.id) || null;
  Object.assign(rateForm, {
    ratePercent: rateTarget.value?.currentRate?.ratePercent ?? null,
    monthlyMinimumAmount: rateTarget.value?.currentRate?.monthlyMinimumAmount ?? null,
    routeScope: '',
    validFrom: ''
  });
  clearCommandState();
  rateDialog.value = true;
}

async function submitRate() {
  if (!rateTarget.value) return;
  const ratePercent = Number(rateForm.ratePercent);
  if (!Number.isFinite(ratePercent) || ratePercent <= 0) {
    notify.warning('Informe a taxa percentual (maior que zero).');
    return;
  }
  if (!rateForm.validFrom) {
    notify.warning('Informe a data de início da vigência da taxa.');
    return;
  }
  try {
    const payload = { ratePercent, validFrom: rateForm.validFrom };
    if (rateForm.monthlyMinimumAmount !== null && rateForm.monthlyMinimumAmount !== '') {
      payload.monthlyMinimumAmount = Number(rateForm.monthlyMinimumAmount);
    }
    if (rateForm.routeScope.trim()) payload.routeScope = rateForm.routeScope.trim();
    await createRateSchedule(rateTarget.value.partyId, rateTarget.value.id, payload);
    notify.success('Taxa registrada. A anterior da mesma vigência ficou como substituída.');
    rateDialog.value = false;
  } catch {
    if (commandError.value) notify.error(commandError.value);
  }
}

// --- Ajustar limite por viagem ----------------------------------------------

const limitDialog = ref(false);
const limitTarget = ref(null);
const limitForm = reactive({ perTripLimitAmount: null, notes: '' });

function openLimitDialog(row) {
  limitTarget.value = policies.value.find((entry) => entry.id === row.id) || null;
  Object.assign(limitForm, {
    perTripLimitAmount: limitTarget.value?.perTripLimitAmount ?? null,
    notes: String(limitTarget.value?.limitConditions?.notes || '')
  });
  clearCommandState();
  limitDialog.value = true;
}

async function submitLimit() {
  if (!limitTarget.value) return;
  try {
    const limitConditions = limitForm.notes.trim() ? { notes: limitForm.notes.trim() } : undefined;
    await updatePolicyLimit(limitTarget.value.partyId, limitTarget.value.id, {
      perTripLimitAmount: limitForm.perTripLimitAmount,
      limitConditions
    });
    notify.success('Limite por viagem atualizado.');
    limitDialog.value = false;
  } catch {
    if (commandError.value) notify.error(commandError.value);
  }
}

onMounted(async () => {
  await loadPolicies();
});
</script>

<template>
  <SicatPageLayout>
    <template #header>
      <SicatPageHeader
        kicker="Transporte · Seguros"
        title="Apólices"
        description="A cobertura de todas as transportadoras da conta num lugar só: vigência, limite por viagem, taxa de averbação e custo mínimo mensal."
      >
        <template #actions>
          <v-btn variant="text" :loading="loadingPolicies" prepend-icon="mdi-refresh" @click="loadPolicies()">
            Atualizar
          </v-btn>
        </template>
      </SicatPageHeader>
    </template>

    <template #banner>
      <SicatInlineAlert
        v-if="!authStore.hasActiveCetesbAccount.value"
        tone="warning"
        message="Selecione uma conta para consolidar as apólices."
      />
      <SicatInlineAlert v-else-if="policiesError" tone="error" :message="policiesError">
        <template #actions>
          <v-btn size="small" variant="text" :loading="loadingPolicies" @click="loadPolicies()">Tentar novamente</v-btn>
        </template>
      </SicatInlineAlert>
      <SicatInlineAlert
        v-else-if="policiesTruncated"
        tone="warning"
        message="A conta tem mais transportadores do que esta consolidação alcança — os números abaixo cobrem os primeiros 25. Abra o transportador para ver as apólices dele por inteiro."
      />
      <SicatInlineAlert
        v-else-if="policiesAtRisk.length"
        tone="error"
        :message="`${policiesAtRisk.length} apólice(s) vencida(s) com viagem em aberto dependendo delas — a carga está na estrada sem cobertura vigente.`"
      />
    </template>

    <SicatCard title="Situação das coberturas" icon="mdi-shield-check-outline">
      <template #header-actions>
        <SicatHelpHint term="averbacao" />
      </template>
      <div class="transp-seg__metrics">
        <SicatMetricCard
          v-for="card in metricCards"
          :key="card.key"
          :label="card.label"
          :value="card.value"
          :icon="card.icon"
          :tone="card.tone"
          :loading="loadingPolicies"
        />
      </div>
    </SicatCard>

    <SicatCard :title="totalLabel" flush-body>
      <SicatDataTable
        :headers="headers"
        :items="rows"
        :loading="loadingPolicies"
        :error="policiesError"
        :show-footer="false"
        :items-per-page="-1"
        :empty="{
          title: 'Nenhuma apólice cadastrada',
          description: 'Cadastre a apólice no detalhe do transportador — RCTR-C, RC-DC e RC-V são registradas por transportadora.',
          icon: 'mdi-shield-outline'
        }"
      >
        <template #[`item.perTripLimit`]="{ item }">
          <span v-if="item.hasLimit">{{ item.perTripLimit }}</span>
          <span v-else class="transp-seg__missing">Não configurado</span>
        </template>

        <template #[`item.ratePercent`]="{ item }">
          <span v-if="item.hasRate">{{ item.ratePercent }}</span>
          <span v-else class="transp-seg__missing">Sem taxa</span>
        </template>

        <template #[`item.validityStatus`]="{ item }">
          <div class="transp-seg__situation">
            <SicatStatusBadge
              :status="item.validityStatus"
              :label="item.validityLabel"
              domain="insurance-policy"
              with-dot
            />
            <span class="transp-seg__situation-detail">{{ item.validityDetail }}</span>
            <v-chip v-if="item.atRisk" size="x-small" color="error" variant="tonal" prepend-icon="mdi-truck-alert-outline">
              Viagem em aberto
            </v-chip>
          </div>
        </template>

        <template #[`item.actions`]="{ item }">
          <v-btn size="small" variant="text" prepend-icon="mdi-percent-outline" @click.stop="openRateDialog(item)">
            Taxa
          </v-btn>
          <v-btn size="small" variant="text" prepend-icon="mdi-scale-balance" @click.stop="openLimitDialog(item)">
            Limite
          </v-btn>
          <v-btn size="small" variant="text" :to="`/transporte/transportadores/${item.partyId}`">
            Gerenciar apólices
          </v-btn>
        </template>
      </SicatDataTable>
    </SicatCard>

    <!-- Cadastrar taxa de averbação (create supersede, versionada por vigência) -->
    <v-dialog v-model="rateDialog" max-width="560" persistent role="dialog" aria-modal="true">
      <v-card rounded="lg" title="Cadastrar taxa de averbação">
        <v-card-text class="d-flex flex-column ga-3">
          <SicatInlineAlert v-if="commandError" tone="error" :message="commandError" />
          <SicatInlineAlert
            tone="info"
            message="A taxa nova SUBSTITUI a anterior da mesma apólice e percurso — a antiga fica no histórico, para o prêmio de averbações passadas continuar reproduzível."
          />

          <div class="transp-seg__field-row">
            <v-text-field
              v-model.number="rateForm.ratePercent"
              label="Taxa (% sobre o valor da carga)"
              hint="Percentual literal: 0,097% se digita como 0.097 — nunca a fração já dividida."
              persistent-hint
              type="number"
              step="0.001"
              min="0"
              density="comfortable"
              variant="outlined"
            />
            <SicatHelpHint term="averbacao" />
          </div>

          <div class="transp-seg__field-row">
            <v-text-field
              v-model.number="rateForm.monthlyMinimumAmount"
              label="Custo mínimo mensal (R$)"
              hint="A conta do mês é o MAIOR entre a soma dos prêmios e este mínimo."
              persistent-hint
              type="number"
              min="0"
              density="comfortable"
              variant="outlined"
            />
            <SicatHelpHint term="custo_minimo_mensal" />
          </div>

          <v-text-field
            v-model="rateForm.validFrom"
            label="Vigente a partir de"
            type="date"
            density="comfortable"
            variant="outlined"
            hide-details="auto"
          />
          <v-text-field
            v-model="rateForm.routeScope"
            label="Percurso (opcional, ex.: SP-PR)"
            hint="Só para RC-V por percurso; em branco vale como taxa padrão da apólice."
            persistent-hint
            density="comfortable"
            variant="outlined"
          />
        </v-card-text>
        <v-card-actions class="justify-end">
          <v-btn variant="text" @click="rateDialog = false">Cancelar</v-btn>
          <v-btn color="primary" variant="flat" :loading="commandLoading" @click="submitRate">Registrar taxa</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Ajustar limite de garantia por viagem (PATCH da apólice) -->
    <v-dialog v-model="limitDialog" max-width="560" persistent role="dialog" aria-modal="true">
      <v-card rounded="lg" title="Ajustar limite por viagem">
        <v-card-text class="d-flex flex-column ga-3">
          <SicatInlineAlert v-if="commandError" tone="error" :message="commandError" />
          <SicatInlineAlert
            tone="info"
            message="O limite por viagem é o teto que a conformidade confronta com a soma dos valores declarados da carga (TR-SEG-004). Em branco, o gate volta a apenas avisar."
          />

          <div class="transp-seg__field-row">
            <v-text-field
              v-model.number="limitForm.perTripLimitAmount"
              label="Limite por viagem (R$)"
              type="number"
              min="0"
              density="comfortable"
              variant="outlined"
              hide-details="auto"
              clearable
            />
            <SicatHelpHint term="limite_garantia" />
          </div>

          <v-textarea
            v-model="limitForm.notes"
            label="Anotação sobre o limite (opcional)"
            hint="Nota curta — nunca cláusulas, franquia ou prêmio negociado."
            persistent-hint
            rows="2"
            auto-grow
            density="comfortable"
            variant="outlined"
          />
        </v-card-text>
        <v-card-actions class="justify-end">
          <v-btn variant="text" @click="limitDialog = false">Cancelar</v-btn>
          <v-btn color="primary" variant="flat" :loading="commandLoading" @click="submitLimit">Salvar limite</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </SicatPageLayout>
</template>

<style scoped>
.transp-seg__metrics {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: var(--space-3);
}

.transp-seg__situation {
  display: flex;
  flex-direction: column;
  gap: 4px;
  align-items: flex-start;
}

.transp-seg__situation-detail {
  font-size: 0.76rem;
  color: rgba(var(--v-theme-on-surface), 0.66);
}

.transp-seg__missing {
  font-size: 0.82rem;
  color: rgba(var(--v-theme-on-surface), 0.55);
  font-style: italic;
}

.transp-seg__field-row {
  display: flex;
  align-items: flex-start;
  gap: 8px;
}

.transp-seg__field-row > :first-child {
  flex: 1 1 auto;
  min-width: 0;
}
</style>
