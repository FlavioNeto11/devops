<script setup>
import { computed, onMounted } from 'vue';
import { useAuthStore } from '../../stores/auth.js';
import { useSegurosStore } from '../../stores/segurosStore.js';
import {
  AVERBACAO_STATUS_OPTIONS,
  averbacaoStatusLabel,
  formatCurrencyBRL,
  formatDateTimeBR,
  formatRatePercent,
  policyTypeLabel
} from './transporteUiHelpers.js';
import SicatPageLayout from '../../components/sicat/SicatPageLayout.vue';
import SicatPageHeader from '../../components/shell/SicatPageHeader.vue';
import SicatCard from '../../components/sicat/SicatCard.vue';
import SicatFiltersPanel from '../../components/sicat/SicatFiltersPanel.vue';
import SicatDataTable from '../../components/sicat/SicatDataTable.vue';
import SicatStatusBadge from '../../components/sicat/SicatStatusBadge.vue';
import SicatInlineAlert from '../../components/sicat/SicatInlineAlert.vue';
import SicatHelpHint from '../../components/sicat/SicatHelpHint.vue';

/**
 * Averbações da conta (onda F7, REQ-SICAT-0034/0037) — o EXTRATO por período.
 * Molde: TransporteVeiculosListView.vue (filtros + paginação servidora).
 *
 * Esta tela é de LEITURA: averbar/retificar/cancelar acontecem no card "Seguro
 * da viagem" do detalhe da operação, porque a averbação é sempre de UMA viagem
 * — é lá que estão a carga, o valor declarado e as apólices aplicáveis. Aqui o
 * operador vê o conjunto: quanto foi averbado no período, com que taxa, e o que
 * ainda não fechou com a seguradora.
 *
 * O contrato devolve a averbação com `policyId` cru (sem número/tipo da
 * apólice), então a tela consolida as apólices da conta para traduzir o id em
 * "RCTR-C · nº 2026-000123" — o mesmo insumo alimenta o filtro por apólice.
 */

const authStore = useAuthStore();
const store = useSegurosStore();

const {
  declarationFilters: filters, declarations, declarationsTotal, declarationsTotalPages,
  loadingDeclarations, declarationsError, fetchDeclarations, resetDeclarationFilters,
  policies, loadingPolicies, loadPolicies
} = store;

/** id da apólice → rótulo legível (o extrato só traz o id). */
const policyById = computed(() => new Map(policies.value.map((policy) => [policy.id, policy])));

const policyOptions = computed(() => [
  { value: '', label: 'Todas' },
  ...policies.value.map((policy) => ({
    value: policy.id,
    label: `${policyTypeLabel(policy.policyType)} · ${policy.policyNumber} (${policy.partyLegalName})`
  }))
]);

function policyLabel(policyId) {
  const policy = policyById.value.get(policyId);
  if (!policy) return policyId || '-';
  return `${policyTypeLabel(policy.policyType)} · ${policy.policyNumber}`;
}

const headers = [
  { title: 'Operação', key: 'operationId', sortable: false },
  { title: 'Apólice', key: 'policy', sortable: false },
  { title: 'Valor da carga', key: 'declaredCargoAmount', sortable: false, align: 'end' },
  { title: 'Taxa aplicada', key: 'appliedRatePercent', sortable: false, align: 'end' },
  { title: 'Prêmio', key: 'premiumAmount', sortable: false, align: 'end' },
  { title: 'Situação', key: 'status', sortable: false },
  { title: 'Data', key: 'createdAt', sortable: false }
];

const rows = computed(() =>
  declarations.value.map((declaration) => ({
    id: declaration.id,
    operationId: declaration.operationId,
    policy: policyLabel(declaration.policyId),
    declaredCargoAmount: formatCurrencyBRL(declaration.declaredCargoAmount),
    appliedRatePercent: formatRatePercent(declaration.appliedRatePercent),
    premiumAmount: formatCurrencyBRL(declaration.premiumAmount),
    status: declaration.status,
    statusLabel: averbacaoStatusLabel(declaration.status),
    lastErrorCode: declaration.lastErrorCode || '',
    createdAt: formatDateTimeBR(declaration.createdAt)
  }))
);

const activeChips = computed(() => {
  const chips = [];
  if (filters.from) chips.push({ key: 'from', label: `De: ${filters.from}` });
  if (filters.to) chips.push({ key: 'to', label: `Até: ${filters.to}` });
  if (filters.status) chips.push({ key: 'status', label: `Situação: ${averbacaoStatusLabel(filters.status)}` });
  if (filters.policyId) chips.push({ key: 'policyId', label: `Apólice: ${policyLabel(filters.policyId)}` });
  return chips;
});

/** Prêmio somado da PÁGINA — a soma do mês inteiro é a tela de Apuração. */
const pagePremiumTotal = computed(() =>
  declarations.value.reduce((sum, declaration) => sum + Number(declaration.premiumAmount || 0), 0)
);

async function applyFilters() {
  filters.page = 1;
  await fetchDeclarations();
}

function removeChip(key) {
  filters[key] = '';
  void applyFilters();
}

async function clearFilters() {
  resetDeclarationFilters();
  await fetchDeclarations();
}

async function changePage(delta) {
  filters.page = Math.max(Number(filters.page || 1) + delta, 1);
  await fetchDeclarations();
}

const canPrevious = computed(() => Number(filters.page || 1) > 1 && !loadingDeclarations.value);
const canNext = computed(() => {
  if (loadingDeclarations.value) return false;
  return Number(filters.page || 1) < Number(declarationsTotalPages.value || 0);
});

const totalLabel = computed(() => {
  const value = Number(declarationsTotal.value || 0);
  return `${value} ${value === 1 ? 'averbação encontrada' : 'averbações encontradas'}`;
});

onMounted(async () => {
  // As apólices vêm em paralelo: são o dicionário do extrato, não um bloqueio.
  await Promise.all([fetchDeclarations(), loadPolicies()]);
});
</script>

<template>
  <SicatPageLayout>
    <template #header>
      <SicatPageHeader
        kicker="Transporte · Seguros"
        title="Averbações"
        description="Cada viagem averbada, com o valor da carga congelado no ato, a taxa aplicada e o prêmio devido."
      >
        <template #actions>
          <v-btn variant="text" :loading="loadingDeclarations" prepend-icon="mdi-refresh" @click="fetchDeclarations">
            Atualizar
          </v-btn>
        </template>
      </SicatPageHeader>
    </template>

    <template #banner>
      <SicatInlineAlert
        v-if="!authStore.hasActiveCetesbAccount.value"
        tone="warning"
        message="Selecione uma conta para listar as averbações."
      />
      <SicatInlineAlert v-else-if="declarationsError" tone="error" :message="declarationsError">
        <template #actions>
          <v-btn size="small" variant="text" :loading="loadingDeclarations" @click="fetchDeclarations">Tentar novamente</v-btn>
        </template>
      </SicatInlineAlert>
    </template>

    <template #filters>
      <SicatFiltersPanel
        :active-chips="activeChips"
        :loading="loadingDeclarations"
        @apply="applyFilters"
        @clear="clearFilters"
        @remove="removeChip"
      >
        <v-text-field
          v-model="filters.from"
          label="De"
          type="date"
          density="comfortable"
          variant="outlined"
          hide-details="auto"
        />
        <v-text-field
          v-model="filters.to"
          label="Até"
          type="date"
          density="comfortable"
          variant="outlined"
          hide-details="auto"
        />
        <v-select
          v-model="filters.status"
          :items="AVERBACAO_STATUS_OPTIONS"
          item-title="label"
          item-value="value"
          label="Situação"
          density="comfortable"
          variant="outlined"
          hide-details="auto"
        />
        <v-select
          v-model="filters.policyId"
          :items="policyOptions"
          :loading="loadingPolicies"
          item-title="label"
          item-value="value"
          label="Apólice"
          density="comfortable"
          variant="outlined"
          hide-details="auto"
        />
      </SicatFiltersPanel>
    </template>

    <SicatCard :title="totalLabel" flush-body>
      <template #header-actions>
        <span class="transp-averb__page-total">
          Prêmio nesta página: <strong>{{ formatCurrencyBRL(pagePremiumTotal) }}</strong>
        </span>
        <SicatHelpHint term="averbacao" />
      </template>

      <SicatDataTable
        :headers="headers"
        :items="rows"
        :loading="loadingDeclarations"
        :error="declarationsError"
        :show-footer="false"
        :items-per-page="-1"
        :empty="{
          title: 'Nenhuma averbação no período',
          description: 'A averbação nasce na viagem: abra a operação em Minhas operações e use o cartão “Seguro da viagem” para averbar nas apólices vigentes. O resultado aparece aqui.',
          icon: 'mdi-shield-check-outline'
        }"
      >
        <template #[`item.operationId`]="{ item }">
          <router-link class="transp-averb__link" :to="`/transporte/operacoes/${item.operationId}`">
            {{ item.operationId }}
          </router-link>
        </template>

        <template #[`item.status`]="{ item }">
          <div class="transp-averb__status">
            <SicatStatusBadge :status="item.status" :label="item.statusLabel" domain="averbacao" with-dot />
            <span v-if="item.lastErrorCode" class="transp-averb__error-code">{{ item.lastErrorCode }}</span>
          </div>
        </template>

        <template #footer>
          <v-btn variant="text" :disabled="!canPrevious" prepend-icon="mdi-chevron-left" @click="changePage(-1)">Anterior</v-btn>
          <span class="text-caption text-medium-emphasis">
            Página {{ filters.page || 1 }} de {{ declarationsTotalPages || 1 }} · {{ Number(declarationsTotal || 0) }} no total
          </span>
          <v-btn variant="text" :disabled="!canNext" append-icon="mdi-chevron-right" @click="changePage(1)">Próxima</v-btn>
        </template>
      </SicatDataTable>
    </SicatCard>
  </SicatPageLayout>
</template>

<style scoped>
.transp-averb__link {
  color: rgb(var(--v-theme-primary));
  font-weight: 600;
  text-decoration: none;
}

.transp-averb__link:hover {
  text-decoration: underline;
}

.transp-averb__status {
  display: flex;
  flex-direction: column;
  gap: 4px;
  align-items: flex-start;
}

.transp-averb__error-code {
  font-size: 0.72rem;
  color: rgb(var(--v-theme-error));
}

.transp-averb__page-total {
  font-size: 0.82rem;
  color: rgba(var(--v-theme-on-surface), 0.72);
}
</style>
