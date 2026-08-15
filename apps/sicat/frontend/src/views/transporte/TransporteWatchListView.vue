<script setup>
import { computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useWatchStore } from '../../stores/watchStore.js';
import { useNotification } from '../../composables/useNotification.js';
import { formatDateTimeBR, watchItemStatusLabel } from './transporteUiHelpers.js';
import SicatPageLayout from '../../components/sicat/SicatPageLayout.vue';
import SicatPageHeader from '../../components/shell/SicatPageHeader.vue';
import SicatCard from '../../components/sicat/SicatCard.vue';
import SicatFiltersPanel from '../../components/sicat/SicatFiltersPanel.vue';
import SicatDataTable from '../../components/sicat/SicatDataTable.vue';
import SicatStatusBadge from '../../components/sicat/SicatStatusBadge.vue';
import SicatInlineAlert from '../../components/sicat/SicatInlineAlert.vue';

/**
 * Fila do Regulatory Watch (DL-103, PR-H1/PR-H2) — GLOBAL, sem tenancy.
 * Molde: TransporteOperacaoListView.vue.
 */

const router = useRouter();
const store = useWatchStore();
const notify = useNotification();

const {
  filters, items, totalItems, totalPages, loadingList, listError,
  commandLoading, commandError, commandFeedback,
  fetchList, verificarAgora, resetFilters, clearCommandState
} = store;

const STATUS_OPTIONS = [
  { value: '', label: 'Todos' },
  { value: 'detected', label: watchItemStatusLabel('detected') },
  { value: 'ingested', label: watchItemStatusLabel('ingested') },
  { value: 'ai_analyzed', label: watchItemStatusLabel('ai_analyzed') },
  { value: 'ai_skipped', label: watchItemStatusLabel('ai_skipped') },
  { value: 'human_review', label: watchItemStatusLabel('human_review') },
  { value: 'approved', label: watchItemStatusLabel('approved') },
  { value: 'rejected', label: watchItemStatusLabel('rejected') },
  { value: 'tested', label: watchItemStatusLabel('tested') },
  { value: 'scheduled', label: watchItemStatusLabel('scheduled') },
  { value: 'active_applied', label: watchItemStatusLabel('active_applied') }
];

const headers = [
  { title: 'Fonte', key: 'sourceId', sortable: false },
  { title: 'Status', key: 'status', sortable: false },
  { title: 'Detectado em', key: 'createdAt', sortable: false },
  { title: 'Atualizado em', key: 'updatedAt', sortable: false },
  { title: 'Ações', key: 'actions', sortable: false, align: 'end' }
];

const rows = computed(() =>
  items.value.map((item) => ({
    id: item.id,
    sourceId: item.sourceId,
    status: item.status,
    statusLabel: watchItemStatusLabel(item.status),
    createdAt: formatDateTimeBR(item.createdAt),
    updatedAt: formatDateTimeBR(item.updatedAt)
  }))
);

const activeChips = computed(() => {
  const chips = [];
  if (filters.status) chips.push({ key: 'status', label: `Status: ${watchItemStatusLabel(filters.status)}` });
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
  router.push(`/transporte/watch/${encodeURIComponent(id)}`);
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
  return `${value} ${value === 1 ? 'item no Regulatory Watch' : 'itens no Regulatory Watch'}`;
});

async function handleVerificarAgora() {
  clearCommandState();
  try {
    await verificarAgora();
    notify.success(commandFeedback.value || 'Varredura concluída.');
  } catch {
    if (commandError.value) notify.error(commandError.value);
  }
}

onMounted(async () => {
  await fetchList();
});
</script>

<template>
  <SicatPageLayout>
    <template #header>
      <SicatPageHeader
        kicker="Transporte · Regulatory Watch"
        title="Regulatory Watch"
        description="Fila de mudanças normativas detectadas em fontes monitoradas — do rascunho automático até virar versão de regra no catálogo."
      >
        <template #actions>
          <v-btn
            variant="tonal"
            prepend-icon="mdi-radar"
            :loading="commandLoading"
            @click="handleVerificarAgora"
          >
            Verificar agora
          </v-btn>
        </template>
      </SicatPageHeader>
    </template>

    <template #banner>
      <SicatInlineAlert
        tone="info"
        message="Mudança detectada nunca vira regra bloqueante automaticamente: a versão criada em 'Aplicar' nasce sempre não-bloqueante — promover a bloqueante exige revisão humana separada em Regras regulatórias."
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
          :items="STATUS_OPTIONS"
          item-title="label"
          item-value="value"
          label="Status"
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
        :show-footer="false"
        :items-per-page="-1"
        :empty="{ title: 'Nenhum item no Regulatory Watch', description: 'Dispare \'Verificar agora\' ou aguarde a varredura periódica.', icon: 'mdi-radar' }"
        @row-click="(row) => row?.id && goToDetail(row.id)"
      >
        <template #[`item.status`]="{ item }">
          <SicatStatusBadge :status="item.status" :label="item.statusLabel" domain="watch-item" with-dot />
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
