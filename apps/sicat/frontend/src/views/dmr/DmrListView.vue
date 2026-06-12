<script setup>
import { computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useDmrStore } from '../../stores/dmrStore.js';
import { useAuthStore } from '../../stores/auth.js';
import {
  DMR_ROLE_OPTIONS,
  DMR_STATUS_OPTIONS,
  formatDmrPeriodLabel,
  roleLabel,
  statusLabel
} from './dmrUiHelpers.js';
import SicatPageLayout from '../../components/sicat/SicatPageLayout.vue';
import SicatPageHeader from '../../components/shell/SicatPageHeader.vue';
import SicatCard from '../../components/sicat/SicatCard.vue';
import SicatFiltersPanel from '../../components/sicat/SicatFiltersPanel.vue';
import SicatDataTable from '../../components/sicat/SicatDataTable.vue';
import SicatStatusBadge from '../../components/sicat/SicatStatusBadge.vue';
import SicatInlineAlert from '../../components/sicat/SicatInlineAlert.vue';

const router = useRouter();
const authStore = useAuthStore();
const store = useDmrStore();

const {
  filters,
  items,
  total,
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
  { title: 'Período', key: 'period', sortable: false },
  { title: 'Papel', key: 'role', sortable: false },
  { title: 'CNPJ', key: 'cnpj', sortable: false },
  { title: 'Status', key: 'status', sortable: false },
  { title: 'Atualizada em', key: 'updatedAt', sortable: false },
  { title: 'Ações', key: 'actions', sortable: false, align: 'end' }
];

const rows = computed(() =>
  items.value.map((dmr) => ({
    id: dmr.id,
    period: formatDmrPeriodLabel(dmr),
    role: roleLabel(dmr.role),
    cnpj: dmr.cnpj || '-',
    status: dmr.status,
    statusLabel: statusLabel(dmr.status),
    updatedAt: dmr.updatedAt ? new Date(dmr.updatedAt).toLocaleString('pt-BR') : '-'
  }))
);

const activeChips = computed(() => {
  const chips = [];
  if (filters.status) chips.push({ key: 'status', label: `Status: ${statusLabel(filters.status)}` });
  if (filters.role) chips.push({ key: 'role', label: `Papel: ${roleLabel(filters.role)}` });
  if (filters.periodStart) chips.push({ key: 'periodStart', label: `De: ${filters.periodStart}` });
  if (filters.periodEnd) chips.push({ key: 'periodEnd', label: `Até: ${filters.periodEnd}` });
  return chips;
});

async function applyFilters() {
  filters.offset = 0;
  await fetchList();
}

function removeChip(key) {
  filters[key] = '';
  void applyFilters();
}

function goToDetail(dmrId) {
  router.push(`/dmr/${encodeURIComponent(dmrId)}`);
}

async function changeOffset(delta) {
  filters.offset = Math.max(Number(filters.offset || 0) + delta, 0);
  await fetchList();
}

const canPrevious = computed(() => Number(filters.offset || 0) > 0 && !loadingList.value);
const canNext = computed(() => {
  if (loadingList.value) return false;
  return Number(filters.offset || 0) + Number(filters.limit || 50) < Number(total.value || 0);
});

const totalLabel = computed(() => {
  const value = Number(total.value || 0);
  return `${value} ${value === 1 ? 'declaração encontrada' : 'declarações encontradas'}`;
});

onMounted(async () => {
  await fetchList();
});
</script>

<template>
  <SicatPageLayout>
    <template #header>
      <SicatPageHeader
        kicker="Resíduos · DMR"
        title="Declarações DMR"
        :description="`Crie, consolide e submeta declarações periódicas. Conta ativa: ${activeAccountLabel}.`"
      >
        <template #actions>
          <v-btn variant="outlined" prepend-icon="mdi-clock-alert-outline" :to="{ name: 'DmrPendentes' }">Pendentes</v-btn>
          <v-btn color="primary" variant="flat" prepend-icon="mdi-plus" :to="{ name: 'DmrNovo' }">Nova declaração</v-btn>
        </template>
      </SicatPageHeader>
    </template>

    <template #banner>
      <SicatInlineAlert
        v-if="!authStore.hasActiveCetesbAccount.value"
        tone="warning"
        message="Selecione uma conta CETESB para operar declarações DMR."
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
          :items="DMR_STATUS_OPTIONS"
          item-title="label"
          item-value="value"
          label="Status"
          density="comfortable"
          variant="outlined"
          hide-details="auto"
          clearable
        />
        <v-select
          v-model="filters.role"
          :items="[{ value: '', label: 'Todos' }, ...DMR_ROLE_OPTIONS]"
          item-title="label"
          item-value="value"
          label="Papel"
          density="comfortable"
          variant="outlined"
          hide-details="auto"
          clearable
        />
        <v-text-field
          v-model="filters.periodStart"
          label="Período início"
          type="date"
          density="comfortable"
          variant="outlined"
          hide-details="auto"
          clearable
        />
        <v-text-field
          v-model="filters.periodEnd"
          label="Período fim"
          type="date"
          density="comfortable"
          variant="outlined"
          hide-details="auto"
          clearable
        />
      </SicatFiltersPanel>
    </template>

    <SicatCard :title="totalLabel" flush-body>
      <SicatDataTable
        :headers="headers"
        :items="rows"
        :loading="loadingList"
        :error="listError"
        :empty="{ title: 'Nenhuma declaração encontrada', description: 'Ajuste os filtros ou crie uma nova DMR.', icon: 'mdi-file-tree-outline' }"
        @row-click="(row) => row?.id && goToDetail(row.id)"
      >
        <template #[`item.status`]="{ item }">
          <SicatStatusBadge :status="item.status" :label="item.statusLabel" domain="dmr" with-dot />
        </template>
        <template #[`item.actions`]="{ item }">
          <v-btn size="small" variant="text" @click.stop="goToDetail(item.id)">Detalhar</v-btn>
        </template>
        <template #footer>
          <v-btn variant="text" :disabled="!canPrevious" prepend-icon="mdi-chevron-left" @click="changeOffset(-Number(filters.limit || 50))">
            Anterior
          </v-btn>
          <span class="text-caption text-medium-emphasis">
            Exibindo {{ Math.min(Number(filters.offset || 0) + 1, Number(total || 0)) }}–{{ Math.min(Number(filters.offset || 0) + Number(filters.limit || 50), Number(total || 0)) }} de {{ Number(total || 0) }} declarações
          </span>
          <v-btn variant="text" :disabled="!canNext" append-icon="mdi-chevron-right" @click="changeOffset(Number(filters.limit || 50))">
            Próxima
          </v-btn>
        </template>
      </SicatDataTable>
    </SicatCard>
  </SicatPageLayout>
</template>
