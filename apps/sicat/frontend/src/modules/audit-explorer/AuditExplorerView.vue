<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { searchAuditEntries, getAuditByCorrelationId } from '../../services/auditService.js';
import SicatPageLayout from '../../components/sicat/SicatPageLayout.vue';
import SicatPageHeader from '../../components/shell/SicatPageHeader.vue';
import SicatCard from '../../components/sicat/SicatCard.vue';
import SicatFiltersPanel from '../../components/sicat/SicatFiltersPanel.vue';
import SicatDataTable from '../../components/sicat/SicatDataTable.vue';
import SicatLoadingState from '../../components/sicat/SicatLoadingState.vue';
import SicatErrorState from '../../components/sicat/SicatErrorState.vue';

const route = useRoute();
const router = useRouter();

const filters = reactive({
  correlationId: String(route.params.correlationId || route.query.correlationId || ''),
  entityType: '', component: '', direction: '', dateFrom: '', dateTo: '',
  page: 1, pageSize: 20
});

const items = ref([]);
const totalItems = ref(0);
const loading = ref(false);
const error = ref('');

const trail = ref(null);
const trailLoading = ref(false);
const trailError = ref('');

const headers = [
  { title: 'Data', key: 'occurredAt', sortable: false },
  { title: 'Componente', key: 'component', sortable: false },
  { title: 'Direção', key: 'direction', sortable: false },
  { title: 'HTTP', key: 'http', sortable: false },
  { title: 'Endpoint', key: 'endpoint', sortable: false },
  { title: 'Correlation', key: 'correlation', sortable: false }
];

const rows = computed(() =>
  items.value.map((item) => ({
    id: `${item.correlationId}-${item.occurredAt}-${item.endpoint}`,
    occurredAt: item.occurredAt,
    component: item.component,
    direction: item.direction,
    http: `${item.httpMethod || ''} ${item.httpStatus || ''}`.trim(),
    endpoint: item.endpoint,
    correlationId: item.correlationId
  }))
);

const activeChips = computed(() => {
  const chips = [];
  for (const key of ['correlationId', 'entityType', 'component', 'direction', 'dateFrom', 'dateTo']) {
    if (filters[key]) chips.push({ key, label: `${key}: ${filters[key]}` });
  }
  return chips;
});

function buildSearchParams() {
  const params = {};
  Object.entries(filters).forEach(([key, value]) => {
    if (value === null || value === undefined || value === '') return;
    if (key === 'correlationId') return;
    params[key] = value;
  });
  if (filters.correlationId) params.correlationId = filters.correlationId;
  return params;
}

async function search() {
  loading.value = true;
  error.value = '';
  try {
    const response = await searchAuditEntries(buildSearchParams());
    items.value = Array.isArray(response?.items) ? response.items : [];
    totalItems.value = Number(response?.totalItems || 0);
  } catch (err) {
    error.value = err?.message || 'Falha ao buscar auditoria.';
    items.value = [];
  } finally {
    loading.value = false;
  }
}

async function loadTrail(correlationId) {
  if (!correlationId) {
    trail.value = null;
    return;
  }
  trailLoading.value = true;
  trailError.value = '';
  try {
    trail.value = await getAuditByCorrelationId(correlationId);
  } catch (err) {
    trailError.value = err?.message || 'Falha ao carregar timeline.';
    trail.value = null;
  } finally {
    trailLoading.value = false;
  }
}

function applyFilters() {
  filters.page = 1;
  void search();
  if (filters.correlationId) void loadTrail(filters.correlationId);
}

function clearFilters() {
  Object.assign(filters, { correlationId: '', entityType: '', component: '', direction: '', dateFrom: '', dateTo: '', page: 1 });
  trail.value = null;
  void search();
}

function removeChip(key) {
  filters[key] = '';
  applyFilters();
}

function openTrail(correlationId) {
  filters.correlationId = correlationId;
  router.replace({ path: `/operacao/auditoria/${correlationId}` });
  void loadTrail(correlationId);
}

watch(() => route.params.correlationId, (next) => {
  const value = String(next || '');
  if (value && value !== filters.correlationId) {
    filters.correlationId = value;
    void loadTrail(value);
  }
});

onMounted(() => {
  void search();
  if (filters.correlationId) void loadTrail(filters.correlationId);
});
</script>

<template>
  <SicatPageLayout :error="error">
    <template #header>
      <SicatPageHeader
        title="Audit explorer"
        description="Busca de eventos de auditoria sanitizados e timeline por correlationId."
      />
    </template>

    <template #filters>
      <SicatFiltersPanel :active-chips="activeChips" :loading="loading" @apply="applyFilters" @clear="clearFilters" @remove="removeChip">
        <v-text-field v-model="filters.correlationId" label="Correlation ID" density="comfortable" variant="outlined" hide-details="auto" />
        <v-text-field v-model="filters.entityType" label="Tipo de entidade" density="comfortable" variant="outlined" hide-details="auto" />
        <v-text-field v-model="filters.component" label="Componente" density="comfortable" variant="outlined" hide-details="auto" />
        <v-select v-model="filters.direction" :items="['', 'inbound', 'outbound']" label="Direção" density="comfortable" variant="outlined" hide-details="auto" />
        <v-text-field v-model="filters.dateFrom" label="De (ISO)" density="comfortable" variant="outlined" hide-details="auto" />
        <v-text-field v-model="filters.dateTo" label="Até (ISO)" density="comfortable" variant="outlined" hide-details="auto" />
      </SicatFiltersPanel>
    </template>

    <SicatCard title="Eventos" flush-body>
      <SicatDataTable
        :headers="headers"
        :items="rows"
        :loading="loading"
        density="compact"
        :empty="{ title: 'Nenhum evento', description: 'Ajuste os filtros e busque novamente.', icon: 'mdi-text-search' }"
      >
        <template #[`item.correlation`]="{ item }">
          <a href="#" @click.prevent="openTrail(item.correlationId)">{{ item.correlationId?.slice(0, 14) }}…</a>
        </template>
      </SicatDataTable>
    </SicatCard>

    <SicatCard v-if="filters.correlationId" :title="`Timeline · ${filters.correlationId}`" flush-body>
      <SicatLoadingState v-if="trailLoading" compact title="Carregando timeline…" />
      <SicatErrorState v-else-if="trailError" compact :message="trailError" />
      <pre v-else-if="trail" class="audit-trail-pre">{{ JSON.stringify(trail, null, 2) }}</pre>
      <p v-else class="text-medium-emphasis pa-4">Nenhum dado carregado.</p>
    </SicatCard>
  </SicatPageLayout>
</template>

<style scoped>
.audit-trail-pre {
  max-height: 480px;
  overflow: auto;
  font-size: 0.78rem;
  background: rgba(var(--v-theme-on-surface), 0.04);
  padding: 14px;
  margin: 0;
  font-family: var(--font-family-mono);
}
</style>
