<script setup>
import { onMounted, ref, watch } from 'vue';
import {
  getAiControlDeeplink,
  getAiControlLangfuseStatus,
  getAiControlLangfuseTrace,
  listAiControlLangfuseTraces
} from '../../services/api.js';
import { formatDateTimeBr } from '../../utils/date-format.js';
import { useNotification } from '../../composables/useNotification.js';
import SicatCard from '../../components/sicat/SicatCard.vue';
import SicatDataTable from '../../components/sicat/SicatDataTable.vue';
import SicatInlineAlert from '../../components/sicat/SicatInlineAlert.vue';
import SicatLoadingState from '../../components/sicat/SicatLoadingState.vue';
import SicatErrorState from '../../components/sicat/SicatErrorState.vue';
import AiTraceTree from './AiTraceTree.vue';
import AiJsonViewer from './AiJsonViewer.vue';

const props = defineProps({
  /** Filtros iniciais (ex: { toolName } vindo do painel de runtime). */
  initialFilters: { type: Object, default: null }
});

const notify = useNotification();

const STATUS_OPTIONS = ['', 'success', 'error', 'pending', 'running'];

const filters = ref({
  conversationSessionId: '',
  conversationTurnId: '',
  correlationId: '',
  toolName: '',
  userId: '',
  status: '',
  limit: 50
});

const traces = ref([]);
const loading = ref(false);
const error = ref(null);
const status = ref(null);

const traceDialog = ref(false);
const traceDetail = ref(null);
const traceLoading = ref(false);
const traceError = ref(null);
const deeplink = ref('');

const headers = [
  { title: 'Trace', key: 'id' },
  { title: 'Nome', key: 'name' },
  { title: 'Status', key: 'status' },
  { title: 'Quando', key: 'timestamp' },
  { title: 'Latência', key: 'latencyMs', align: 'end' },
  { title: 'Tokens', key: 'totalTokens', align: 'end' },
  { title: '', key: 'actions', sortable: false, align: 'end' }
];

const isLocalFallback = () => {
  const provider = String(status.value?.provider || '').toLowerCase();
  const st = String(status.value?.status || '').toLowerCase();
  return provider === 'local' || st === 'disabled';
};

function statusColor(value) {
  const key = String(value || '').toLowerCase();
  if (key.includes('error') || key.includes('fail')) return 'error';
  if (key.includes('warn')) return 'warning';
  if (key.includes('success') || key.includes('ok')) return 'success';
  return 'default';
}

function normalizeTraces(data) {
  const list = Array.isArray(data?.items) ? data.items : (Array.isArray(data?.traces) ? data.traces : (Array.isArray(data) ? data : []));
  return list.map((trace, index) => ({
    ...trace,
    id: trace.id || trace.traceId || index,
    provider: data?.provider || trace.provider
  }));
}

async function loadStatus() {
  try {
    status.value = await getAiControlLangfuseStatus();
  } catch {
    status.value = null;
  }
}

async function search() {
  loading.value = true;
  error.value = null;
  try {
    const data = await listAiControlLangfuseTraces({
      conversationSessionId: filters.value.conversationSessionId || undefined,
      conversationTurnId: filters.value.conversationTurnId || undefined,
      correlationId: filters.value.correlationId || undefined,
      toolName: filters.value.toolName || undefined,
      userId: filters.value.userId || undefined,
      status: filters.value.status || undefined,
      limit: filters.value.limit || undefined
    });
    if (data?.provider) {
      status.value = { ...(status.value || {}), provider: data.provider };
    }
    traces.value = normalizeTraces(data);
  } catch (err) {
    error.value = err;
  } finally {
    loading.value = false;
  }
}

async function openTrace(trace) {
  const traceId = trace.id || trace.traceId;
  if (!traceId) return;
  traceDialog.value = true;
  traceDetail.value = null;
  traceError.value = null;
  deeplink.value = '';
  traceLoading.value = true;

  try {
    traceDetail.value = await getAiControlLangfuseTrace(traceId);
    // Deep link só faz sentido quando há provider remoto.
    if (!isLocalFallback()) {
      try {
        const link = await getAiControlDeeplink(traceId);
        deeplink.value = link?.url || link?.deeplink || (typeof link === 'string' ? link : '');
      } catch {
        deeplink.value = '';
      }
    }
  } catch (err) {
    traceError.value = err;
  } finally {
    traceLoading.value = false;
  }
}

function openDeeplink() {
  if (!deeplink.value) return;
  window.open(deeplink.value, '_blank', 'noopener');
}

function clearFilters() {
  filters.value = {
    conversationSessionId: '',
    conversationTurnId: '',
    correlationId: '',
    toolName: '',
    userId: '',
    status: '',
    limit: 50
  };
  search();
}

watch(
  () => props.initialFilters,
  (next) => {
    if (next && typeof next === 'object') {
      filters.value = { ...filters.value, ...next };
      search();
    }
  },
  { deep: true }
);

onMounted(async () => {
  if (props.initialFilters && typeof props.initialFilters === 'object') {
    filters.value = { ...filters.value, ...props.initialFilters };
  }
  await loadStatus();
  await search();
});

defineExpose({ applyFilters: (next) => { filters.value = { ...filters.value, ...next }; search(); } });
</script>

<template>
  <div class="ai-langfuse">
    <SicatInlineAlert
      v-if="isLocalFallback()"
      tone="info"
      title="Fallback local de traces"
      message="O Langfuse está desativado ou indisponível. Exibindo traces locais (provider: local)."
      class="mb-3"
    />

    <SicatCard class="mb-3">
      <div class="ai-langfuse__filters">
        <v-text-field v-model="filters.conversationSessionId" label="Session ID" variant="outlined" density="compact" hide-details clearable />
        <v-text-field v-model="filters.conversationTurnId" label="Turn ID" variant="outlined" density="compact" hide-details clearable />
        <v-text-field v-model="filters.correlationId" label="Correlation ID" variant="outlined" density="compact" hide-details clearable />
        <v-text-field v-model="filters.toolName" label="Ferramenta" variant="outlined" density="compact" hide-details clearable />
        <v-text-field v-model="filters.userId" label="User ID" variant="outlined" density="compact" hide-details clearable />
        <v-select v-model="filters.status" :items="STATUS_OPTIONS" label="Status" variant="outlined" density="compact" hide-details clearable />
        <div class="ai-langfuse__filter-actions">
          <v-btn color="primary" :loading="loading" prepend-icon="mdi-magnify" @click="search">Buscar</v-btn>
          <v-btn variant="text" @click="clearFilters">Limpar</v-btn>
        </div>
      </div>
    </SicatCard>

    <SicatLoadingState v-if="loading" title="Carregando traces…" />
    <SicatErrorState v-else-if="error" :message="error?.message || 'Falha ao carregar traces.'" retryable @retry="search" />
    <SicatCard v-else flush-body>
      <SicatDataTable
        :headers="headers"
        :items="traces"
        item-value="id"
        density="compact"
        :empty="{ title: 'Nenhum trace encontrado', description: 'Ajuste os filtros e tente novamente.', icon: 'mdi-chart-timeline-variant' }"
      >
        <template #[`item.id`]="{ item }">
          <code class="ai-langfuse__mono">{{ item.id }}</code>
        </template>
        <template #[`item.status`]="{ item }">
          <v-chip :color="statusColor(item.status)" size="x-small" variant="tonal">{{ item.status || '—' }}</v-chip>
        </template>
        <template #[`item.timestamp`]="{ item }">
          {{ item.timestamp || item.createdAt ? formatDateTimeBr(item.timestamp || item.createdAt) : '—' }}
        </template>
        <template #[`item.latencyMs`]="{ item }">
          {{ item.latencyMs != null ? `${item.latencyMs} ms` : '—' }}
        </template>
        <template #[`item.totalTokens`]="{ item }">
          {{ item.totalTokens ?? item.tokens ?? '—' }}
        </template>
        <template #[`item.actions`]="{ item }">
          <v-btn variant="text" size="small" prepend-icon="mdi-file-tree-outline" @click="openTrace(item)">Árvore</v-btn>
        </template>
      </SicatDataTable>
    </SicatCard>

    <!-- Dialog: árvore do trace -->
    <v-dialog v-model="traceDialog" max-width="900" scrollable>
      <v-card rounded="lg">
        <v-card-title class="d-flex align-center justify-space-between ga-2">
          <span>Trace</span>
          <div class="d-flex align-center ga-1">
            <v-btn v-if="deeplink" variant="tonal" size="small" prepend-icon="mdi-open-in-new" @click="openDeeplink">Abrir no Langfuse</v-btn>
            <AiJsonViewer v-if="traceDetail" :value="traceDetail" label="JSON bruto" button-variant="text" button-size="small" />
            <v-btn icon="mdi-close" variant="text" size="small" aria-label="Fechar" @click="traceDialog = false" />
          </div>
        </v-card-title>
        <v-divider />
        <v-card-text style="max-height: 70vh">
          <SicatLoadingState v-if="traceLoading" compact title="Carregando árvore do trace…" />
          <SicatErrorState v-else-if="traceError" compact :message="traceError?.message || 'Falha ao carregar trace.'" />
          <AiTraceTree v-else :nodes="traceDetail?.nodes || traceDetail?.children || (traceDetail ? [traceDetail] : [])" />
        </v-card-text>
      </v-card>
    </v-dialog>
  </div>
</template>

<style scoped>
.ai-langfuse__filters {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: var(--space-3);
  align-items: center;
}

.ai-langfuse__filter-actions {
  display: flex;
  gap: 8px;
  align-items: center;
}

.ai-langfuse__mono {
  font-family: var(--font-family-mono, monospace);
  font-size: 0.78rem;
}
</style>
