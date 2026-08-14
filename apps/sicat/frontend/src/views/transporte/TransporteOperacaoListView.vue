<script setup>
import { computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '../../stores/auth.js';
import { useTransporteStore } from '../../stores/transporteStore.js';
import {
  cargoRegimeLabel,
  formatCurrencyBRL,
  formatDateTimeBR,
  operationStatusLabel,
  TRANSPORT_OPERATION_STATUS_OPTIONS
} from './transporteUiHelpers.js';
import SicatPageLayout from '../../components/sicat/SicatPageLayout.vue';
import SicatPageHeader from '../../components/shell/SicatPageHeader.vue';
import SicatCard from '../../components/sicat/SicatCard.vue';
import SicatFiltersPanel from '../../components/sicat/SicatFiltersPanel.vue';
import SicatDataTable from '../../components/sicat/SicatDataTable.vue';
import SicatStatusBadge from '../../components/sicat/SicatStatusBadge.vue';
import SicatInlineAlert from '../../components/sicat/SicatInlineAlert.vue';

const router = useRouter();
const authStore = useAuthStore();
const store = useTransporteStore();

const {
  filters,
  items,
  totalItems,
  totalPages,
  loadingList,
  listError,
  fetchList,
  resetFilters
} = store;

const activeAccountLabel = computed(() => {
  const account = authStore.activeAccount.value || null;
  if (!account) return 'não selecionada';
  const name = String(account.partnerName || '').trim();
  const code = String(account.partnerCode || '').trim();
  if (name && code) return `${name} (cód. ${code})`;
  return name || code || account.accountId || 'conta ativa';
});

const headers = [
  { title: 'Referência', key: 'referenceCode', sortable: false },
  { title: 'Status', key: 'status', sortable: false },
  { title: 'Regime', key: 'cargoRegime', sortable: false },
  { title: 'Frete', key: 'freight', sortable: false },
  { title: 'Atualizado em', key: 'updatedAt', sortable: false },
  { title: 'Ações', key: 'actions', sortable: false, align: 'end' }
];

const rows = computed(() =>
  items.value.map((operation) => ({
    id: operation.id,
    referenceCode: operation.referenceCode || operation.id,
    status: operation.status,
    statusLabel: operationStatusLabel(operation.status),
    cargoRegimeLabel: cargoRegimeLabel(operation.cargoRegime),
    freightLabel: formatCurrencyBRL(operation.freight?.contractedAmount ?? operation.freight?.offeredAmount),
    updatedAt: formatDateTimeBR(operation.updatedAt)
  }))
);

const activeChips = computed(() => {
  const chips = [];
  if (filters.status) chips.push({ key: 'status', label: `Status: ${operationStatusLabel(filters.status)}` });
  return chips;
});

async function applyFilters() {
  filters.page = 1;
  await fetchList();
}

function removeChip(key) {
  filters[key] = '';
  void applyFilters();
}

function goToDetail(id) {
  router.push(`/transporte/operacoes/${encodeURIComponent(id)}`);
}

async function changePage(delta) {
  filters.page = Math.max(Number(filters.page || 1) + delta, 1);
  await fetchList();
}

const canPrevious = computed(() => Number(filters.page || 1) > 1 && !loadingList.value);
const canNext = computed(() => {
  if (loadingList.value) return false;
  return Number(filters.page || 1) < Number(totalPages.value || 0);
});

const totalLabel = computed(() => {
  const value = Number(totalItems.value || 0);
  return `${value} ${value === 1 ? 'operação de transporte encontrada' : 'operações de transporte encontradas'}`;
});

onMounted(async () => {
  await fetchList();
});
</script>

<template>
  <SicatPageLayout>
    <template #header>
      <SicatPageHeader
        kicker="Transporte"
        title="Operações de transporte"
        :description="`Acompanhe operações e a conformidade regulatória de cada uma. Conta ativa: ${activeAccountLabel}.`"
      />
    </template>

    <template #banner>
      <SicatInlineAlert
        v-if="!authStore.hasActiveCetesbAccount.value"
        tone="warning"
        message="Selecione uma conta para listar operações de transporte."
      />
    </template>

    <template #filters>
      <SicatFiltersPanel
        :active-chips="activeChips"
        :loading="loadingList"
        @apply="applyFilters"
        @clear="resetFilters"
        @remove="removeChip"
      >
        <v-select
          v-model="filters.status"
          :items="TRANSPORT_OPERATION_STATUS_OPTIONS"
          item-title="label"
          item-value="value"
          label="Status"
          density="comfortable"
          variant="outlined"
          hide-details="auto"
          clearable
        />
        <v-text-field
          v-model.number="filters.pageSize"
          label="Tamanho da página"
          type="number"
          min="1"
          max="200"
          density="comfortable"
          variant="outlined"
          hide-details="auto"
        />
      </SicatFiltersPanel>
    </template>

    <SicatCard :title="totalLabel" flush-body>
      <!-- Paginação SERVIDORA (mesmo padrão de MtrProvisorioListView/DmrListView):
           footer padrão do v-data-table pagina só as linhas já baixadas. -->
      <SicatDataTable
        :headers="headers"
        :items="rows"
        :loading="loadingList"
        :error="listError"
        :show-footer="false"
        :items-per-page="-1"
        :empty="{ title: 'Nenhuma operação de transporte encontrada', description: 'Ajuste os filtros ou crie uma operação pela API.', icon: 'mdi-truck-outline' }"
        @row-click="(row) => row?.id && goToDetail(row.id)"
      >
        <template #[`item.status`]="{ item }">
          <SicatStatusBadge :status="item.status" :label="item.statusLabel" domain="transport-operation" with-dot />
        </template>
        <template #[`item.freight`]="{ item }">
          {{ item.freightLabel }}
        </template>
        <template #[`item.actions`]="{ item }">
          <v-btn size="small" variant="text" @click.stop="goToDetail(item.id)">Detalhar</v-btn>
        </template>
        <template #footer>
          <v-btn variant="text" :disabled="!canPrevious" prepend-icon="mdi-chevron-left" @click="changePage(-1)">Anterior</v-btn>
          <span class="text-caption text-medium-emphasis">
            Página {{ filters.page || 1 }} de {{ totalPages || 1 }} · {{ Number(totalItems || 0) }} no total
          </span>
          <v-btn variant="text" :disabled="!canNext" append-icon="mdi-chevron-right" @click="changePage(1)">Próxima</v-btn>
        </template>
      </SicatDataTable>
    </SicatCard>
  </SicatPageLayout>
</template>
