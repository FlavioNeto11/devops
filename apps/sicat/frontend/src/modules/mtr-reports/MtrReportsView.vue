<script setup>
import { computed, onMounted, reactive, ref } from 'vue';
import { getMtrReports, downloadMtrReportsCsv } from '../../services/mtrReportsService.js';
import { useNotification } from '../../composables/useNotification.js';
import SicatPageLayout from '../../components/sicat/SicatPageLayout.vue';
import SicatPageHeader from '../../components/shell/SicatPageHeader.vue';
import SicatCard from '../../components/sicat/SicatCard.vue';
import SicatFiltersPanel from '../../components/sicat/SicatFiltersPanel.vue';
import SicatDataTable from '../../components/sicat/SicatDataTable.vue';
import SicatStatusBadge from '../../components/sicat/SicatStatusBadge.vue';

const notify = useNotification();

const filters = reactive({
  dateFrom: '', dateTo: '', status: '', externalStatus: '', manifestType: '', partnerCode: '',
  page: 1, pageSize: 20
});

const items = ref([]);
const totalItems = ref(0);
const totalPages = ref(0);
const loading = ref(false);
const exporting = ref(false);
const error = ref('');

const headers = [
  { title: 'Manifesto', key: 'manifest', sortable: false },
  { title: 'Status', key: 'status', sortable: false },
  { title: 'Tipo', key: 'manifestType', sortable: false },
  { title: 'Expedição', key: 'expeditionDate', sortable: false },
  { title: 'Gerador', key: 'generator', sortable: false },
  { title: 'Transportador', key: 'carrier', sortable: false },
  { title: 'Destinador', key: 'receiver', sortable: false }
];

const rows = computed(() =>
  items.value.map((item) => ({
    id: item.id,
    manifestNumber: item.manifestNumber || item.id,
    externalCode: item.externalCode || '—',
    status: item.status,
    externalStatus: item.externalStatus || '—',
    manifestType: item.manifestType || '—',
    expeditionDate: item.expeditionDate || '—',
    generator: item.generator?.description || '—',
    carrier: item.carrier?.description || '—',
    receiver: item.receiver?.description || '—'
  }))
);

const activeChips = computed(() => {
  const chips = [];
  for (const key of ['dateFrom', 'dateTo', 'status', 'externalStatus', 'manifestType', 'partnerCode']) {
    if (filters[key]) chips.push({ key, label: `${key}: ${filters[key]}` });
  }
  return chips;
});

function buildParams() {
  const params = {};
  Object.entries(filters).forEach(([key, value]) => {
    if (value === null || value === undefined || value === '') return;
    params[key] = value;
  });
  return params;
}

async function load() {
  loading.value = true;
  error.value = '';
  try {
    const response = await getMtrReports(buildParams());
    items.value = Array.isArray(response?.items) ? response.items : [];
    totalItems.value = Number(response?.totalItems || 0);
    totalPages.value = Number(response?.totalPages || 0);
  } catch (err) {
    error.value = err?.message || 'Falha ao carregar relatório.';
    items.value = [];
  } finally {
    loading.value = false;
  }
}

function applyFilters() {
  filters.page = 1;
  void load();
}

function clearFilters() {
  Object.assign(filters, { dateFrom: '', dateTo: '', status: '', externalStatus: '', manifestType: '', partnerCode: '', page: 1 });
  void load();
}

function removeChip(key) {
  filters[key] = '';
  applyFilters();
}

function changePage(delta) {
  filters.page = Math.max(filters.page + delta, 1);
  void load();
}

async function handleExport() {
  exporting.value = true;
  try {
    const params = { ...buildParams() };
    delete params.page;
    delete params.pageSize;
    const { blob, fileName } = await downloadMtrReportsCsv(params);
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    notify.success(`Exportado: ${fileName}`);
  } catch (err) {
    notify.error(err?.message || 'Falha ao exportar CSV.');
  } finally {
    exporting.value = false;
  }
}

onMounted(load);
</script>

<template>
  <SicatPageLayout :error="error">
    <template #header>
      <SicatPageHeader
        title="Relatório de MTRs"
        description="Pesquisa paginada com export CSV (limite 5.000 linhas)."
      >
        <template #actions>
          <v-btn prepend-icon="mdi-download" variant="tonal" color="primary" :loading="exporting" @click="handleExport">Exportar CSV</v-btn>
          <v-btn prepend-icon="mdi-refresh" variant="text" :loading="loading" @click="load">Atualizar</v-btn>
        </template>
      </SicatPageHeader>
    </template>

    <template #filters>
      <SicatFiltersPanel :active-chips="activeChips" :loading="loading" @apply="applyFilters" @clear="clearFilters" @remove="removeChip">
        <v-text-field v-model="filters.dateFrom" label="De" placeholder="2026-04-01" density="comfortable" variant="outlined" hide-details="auto" />
        <v-text-field v-model="filters.dateTo" label="Até" placeholder="2026-04-30" density="comfortable" variant="outlined" hide-details="auto" />
        <v-text-field v-model="filters.status" label="Status interno" density="comfortable" variant="outlined" hide-details="auto" />
        <v-text-field v-model="filters.externalStatus" label="Status externo" density="comfortable" variant="outlined" hide-details="auto" />
        <v-text-field v-model="filters.manifestType" label="Tipo (1/2/3)" density="comfortable" variant="outlined" hide-details="auto" />
        <v-text-field v-model="filters.partnerCode" label="Cód. parceiro" density="comfortable" variant="outlined" hide-details="auto" />
      </SicatFiltersPanel>
    </template>

    <SicatCard flush-body>
      <SicatDataTable
        :headers="headers"
        :items="rows"
        :loading="loading"
        density="compact"
        :empty="{ title: 'Nenhum manifesto encontrado', description: 'Ajuste os filtros e busque novamente.', icon: 'mdi-file-search-outline' }"
      >
        <template #[`item.manifest`]="{ item }">
          <div>{{ item.manifestNumber }}</div>
          <small class="text-medium-emphasis">{{ item.externalCode }}</small>
        </template>
        <template #[`item.status`]="{ item }">
          <SicatStatusBadge :status="item.status" domain="manifest" with-dot />
          <small class="text-medium-emphasis d-block">{{ item.externalStatus }}</small>
        </template>
        <template #footer>
          <span class="text-caption text-medium-emphasis">Página {{ filters.page }} de {{ totalPages || 1 }} · {{ totalItems }} resultados</span>
          <div>
            <v-btn variant="text" :disabled="filters.page <= 1" @click="changePage(-1)">Anterior</v-btn>
            <v-btn variant="text" :disabled="filters.page >= totalPages" @click="changePage(1)">Próxima</v-btn>
          </div>
        </template>
      </SicatDataTable>
    </SicatCard>
  </SicatPageLayout>
</template>
