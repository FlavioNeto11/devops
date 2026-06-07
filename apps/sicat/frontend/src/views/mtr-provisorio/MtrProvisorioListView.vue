<script setup>
import { computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '../../stores/auth.js';
import { useMtrProvisorioStore } from '../../stores/mtrProvisorioStore.js';
import { MTR_PROVISORIO_STATUS_OPTIONS, statusLabel } from './mtrProvisorioUiHelpers.js';
import SicatPageLayout from '../../components/sicat/SicatPageLayout.vue';
import SicatPageHeader from '../../components/shell/SicatPageHeader.vue';
import SicatCard from '../../components/sicat/SicatCard.vue';
import SicatFiltersPanel from '../../components/sicat/SicatFiltersPanel.vue';
import SicatDataTable from '../../components/sicat/SicatDataTable.vue';
import SicatStatusBadge from '../../components/sicat/SicatStatusBadge.vue';
import SicatInlineAlert from '../../components/sicat/SicatInlineAlert.vue';

const router = useRouter();
const authStore = useAuthStore();
const store = useMtrProvisorioStore();

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
  { title: 'ID', key: 'id', sortable: false },
  { title: 'Nº provisório', key: 'provisionalNumber', sortable: false },
  { title: 'Status', key: 'status', sortable: false },
  { title: 'Atualizado em', key: 'updatedAt', sortable: false },
  { title: 'Ações', key: 'actions', sortable: false, align: 'end' }
];

const rows = computed(() =>
  items.value.map((mtr) => ({
    id: mtr.id,
    kind: mtr.kind || 'provisorio',
    provisionalNumber: mtr.provisionalNumber || '-',
    status: mtr.status,
    statusLabel: statusLabel(mtr.status),
    updatedAt: mtr.updatedAt ? new Date(mtr.updatedAt).toLocaleString('pt-BR') : '-'
  }))
);

const activeChips = computed(() => {
  const chips = [];
  if (filters.status) chips.push({ key: 'status', label: `Status: ${statusLabel(filters.status)}` });
  if (filters.dateFrom) chips.push({ key: 'dateFrom', label: `De: ${filters.dateFrom}` });
  if (filters.dateTo) chips.push({ key: 'dateTo', label: `Até: ${filters.dateTo}` });
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
  router.push(`/mtr-provisorio/${encodeURIComponent(id)}`);
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
  return `${value} ${value === 1 ? 'MTR provisório encontrado' : 'MTRs provisórios encontrados'}`;
});

onMounted(async () => {
  await fetchList();
});
</script>

<template>
  <SicatPageLayout>
    <template #header>
      <SicatPageHeader
        kicker="MTR Provisório"
        title="Manifestos provisórios"
        :description="`Emissão emergencial assíncrona, com impressão sob demanda. Conta ativa: ${activeAccountLabel}.`"
      >
        <template #actions>
          <v-btn color="primary" variant="flat" prepend-icon="mdi-plus" :to="{ name: 'MtrProvisorioNovo' }">Novo MTR provisório</v-btn>
        </template>
      </SicatPageHeader>
    </template>

    <template #banner>
      <SicatInlineAlert
        v-if="!authStore.hasActiveCetesbAccount.value"
        tone="warning"
        message="Selecione uma conta CETESB para emitir MTR provisório."
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
          :items="MTR_PROVISORIO_STATUS_OPTIONS"
          item-title="label"
          item-value="value"
          label="Status"
          density="comfortable"
          variant="outlined"
          hide-details="auto"
          clearable
        />
        <v-text-field
          v-model="filters.dateFrom"
          label="Data inicial"
          type="date"
          density="comfortable"
          variant="outlined"
          hide-details="auto"
          clearable
        />
        <v-text-field
          v-model="filters.dateTo"
          label="Data final"
          type="date"
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
      <SicatDataTable
        :headers="headers"
        :items="rows"
        :loading="loadingList"
        :error="listError"
        :empty="{ title: 'Nenhum MTR provisório encontrado', description: 'Ajuste os filtros ou emita um novo.', icon: 'mdi-file-clock-outline' }"
        @row-click="(row) => row?.id && goToDetail(row.id)"
      >
        <template #[`item.status`]="{ item }">
          <SicatStatusBadge :status="item.status" :label="item.statusLabel" domain="manifest" with-dot />
        </template>
        <template #[`item.actions`]="{ item }">
          <v-btn size="small" variant="text" @click.stop="goToDetail(item.id)">Detalhar</v-btn>
        </template>
        <template #footer>
          <v-btn variant="text" :disabled="!canPrevious" prepend-icon="mdi-chevron-left" @click="changePage(-1)">Anterior</v-btn>
          <span class="text-caption text-medium-emphasis">página {{ filters.page || 1 }} de {{ totalPages || 1 }}</span>
          <v-btn variant="text" :disabled="!canNext" append-icon="mdi-chevron-right" @click="changePage(1)">Próxima</v-btn>
        </template>
      </SicatDataTable>
    </SicatCard>
  </SicatPageLayout>
</template>
