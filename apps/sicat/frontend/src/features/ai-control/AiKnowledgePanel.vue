<script setup>
import { computed, onMounted, ref } from 'vue';
import {
  getAiControlKnowledgeSources,
  listAiControlKnowledgeChunks,
  reindexAiControlKnowledge,
  setAiControlKnowledgeSourceEnabled,
  testAiControlRetrieval
} from '../../services/api.js';
import { formatDateTimeBr } from '../../utils/date-format.js';
import { useNotification } from '../../composables/useNotification.js';
import { useConfirmDialog } from '../../composables/useConfirmDialog.js';
import SicatCard from '../../components/sicat/SicatCard.vue';
import SicatMetricCard from '../../components/sicat/SicatMetricCard.vue';
import SicatDataTable from '../../components/sicat/SicatDataTable.vue';
import SicatInlineAlert from '../../components/sicat/SicatInlineAlert.vue';
import SicatEmptyState from '../../components/sicat/SicatEmptyState.vue';
import SicatLoadingState from '../../components/sicat/SicatLoadingState.vue';
import SicatErrorState from '../../components/sicat/SicatErrorState.vue';
import ConfirmDialog from '../../components/sicat/SicatConfirmDialog.vue';

const notify = useNotification();
const {
  dialogVisible,
  dialogTitle,
  dialogMessage,
  dialogConfirmLabel,
  dialogCancelLabel,
  dialogDanger,
  dialogShowCancel,
  confirm,
  accept,
  cancel
} = useConfirmDialog();

const loading = ref(false);
const error = ref(null);
const index = ref(null);
const sources = ref([]);
const actionLoading = ref('');

// Chunks browser
const chunkSearch = ref('');
const chunkSourceFilter = ref('');
const chunkLimit = ref(50);
const chunks = ref([]);
const chunksLoading = ref(false);
const chunksError = ref(null);
const chunkDialog = ref(false);
const chunkDetail = ref(null);

// Test retrieval
const question = ref('');
const retrievalK = ref(5);
const retrievalResults = ref([]);
const retrievalLoading = ref(false);
const retrievalError = ref(null);

// Reindex log
const reindexLog = ref('');

const sourceHeaders = [
  { title: 'Fonte', key: 'sourceKey' },
  { title: 'Tipo', key: 'sourceType' },
  { title: 'Chunks', key: 'chunkCount', align: 'end' },
  { title: 'Ativa', key: 'enabled', align: 'center' }
];

const chunkHeaders = [
  { title: 'Fonte', key: 'source' },
  { title: 'Título', key: 'title' },
  { title: 'Texto', key: 'text', sortable: false },
  { title: '', key: 'actions', sortable: false, align: 'end' }
];

const retrievalHeaders = [
  { title: 'Score', key: 'score', align: 'end' },
  { title: 'Fonte', key: 'source' },
  { title: 'Título', key: 'title' },
  { title: 'Texto', key: 'text', sortable: false },
  { title: '', key: 'actions', sortable: false, align: 'end' }
];

const sourceOptions = computed(() => sources.value.map((src) => src.sourceKey).filter(Boolean));

function truncate(text, length = 90) {
  const value = String(text || '');
  return value.length > length ? `${value.slice(0, length)}…` : value;
}

async function load() {
  loading.value = true;
  error.value = null;
  try {
    const data = await getAiControlKnowledgeSources();
    index.value = data?.index || data?.status || data || null;
    sources.value = Array.isArray(data?.sources) ? data.sources : (Array.isArray(data?.items) ? data.items : []);
  } catch (err) {
    error.value = err;
  } finally {
    loading.value = false;
  }
}

async function loadChunks() {
  chunksLoading.value = true;
  chunksError.value = null;
  try {
    const data = await listAiControlKnowledgeChunks({
      source: chunkSourceFilter.value || undefined,
      search: chunkSearch.value || undefined,
      limit: chunkLimit.value || undefined
    });
    const list = Array.isArray(data?.items) ? data.items : (Array.isArray(data?.chunks) ? data.chunks : (Array.isArray(data) ? data : []));
    chunks.value = list.map((chunk, i) => ({ ...chunk, id: chunk.id || chunk.chunkId || i }));
  } catch (err) {
    chunksError.value = err;
  } finally {
    chunksLoading.value = false;
  }
}

function openChunk(chunk) {
  chunkDetail.value = chunk;
  chunkDialog.value = true;
}

async function toggleSource(source) {
  const nextEnabled = !source.enabled;
  actionLoading.value = source.sourceKey;
  try {
    await setAiControlKnowledgeSourceEnabled(source.sourceKey, { enabled: nextEnabled });
    notify.success(`Fonte "${source.sourceKey}" ${nextEnabled ? 'habilitada' : 'desabilitada'}.`);
    await load();
  } catch (err) {
    notify.error(err?.message || 'Falha ao atualizar fonte.');
  } finally {
    actionLoading.value = '';
  }
}

async function runRetrieval() {
  if (!question.value.trim()) {
    notify.warning('Informe uma pergunta para testar a recuperação.');
    return;
  }
  retrievalLoading.value = true;
  retrievalError.value = null;
  retrievalResults.value = [];
  try {
    const data = await testAiControlRetrieval({ question: question.value, k: retrievalK.value || undefined });
    const list = Array.isArray(data?.results) ? data.results : (Array.isArray(data?.items) ? data.items : (Array.isArray(data) ? data : []));
    retrievalResults.value = list.map((row, i) => ({ ...row, id: row.id || row.chunkId || i }));
  } catch (err) {
    retrievalError.value = err;
  } finally {
    retrievalLoading.value = false;
  }
}

async function reindex() {
  const confirmed = await confirm({
    title: 'Reindexar base de conhecimento',
    message: 'Confirma reindexar toda a base de conhecimento? Isso pode levar alguns minutos e substitui o índice atual.',
    confirmLabel: 'Reindexar',
    danger: true
  });
  if (!confirmed) return;

  actionLoading.value = 'reindex';
  reindexLog.value = '';
  try {
    const data = await reindexAiControlKnowledge({ confirmed: true });
    reindexLog.value = data?.logTail || data?.log || (typeof data === 'string' ? data : JSON.stringify(data || {}, null, 2));
    notify.success('Reindexação concluída.');
    await load();
  } catch (err) {
    notify.error(err?.message || 'Falha ao reindexar.');
  } finally {
    actionLoading.value = '';
  }
}

onMounted(() => {
  load();
  loadChunks();
});
</script>

<template>
  <div class="ai-knowledge">
    <SicatLoadingState v-if="loading" title="Carregando base de conhecimento…" />
    <SicatErrorState v-else-if="error" :message="error?.message || 'Falha ao carregar base.'" retryable @retry="load" />

    <template v-else>
      <SicatInlineAlert
        v-if="index && index.available === false"
        tone="warning"
        title="Índice indisponível"
        message="A base de conhecimento ainda não foi indexada. Use o botão Reindexar para construí-la."
        class="mb-3"
      />

      <!-- Status do índice -->
      <div class="ai-knowledge__metrics mb-3">
        <SicatMetricCard
          label="Disponível"
          :value="index?.available === false ? 'Não' : 'Sim'"
          icon="mdi-database-check-outline"
          :tone="index?.available === false ? 'error' : 'success'"
        />
        <SicatMetricCard label="Total de chunks" :value="index?.totalChunks ?? '—'" icon="mdi-file-document-multiple-outline" tone="primary" />
        <SicatMetricCard label="Modelo de embedding" :value="index?.embeddingModel || '—'" icon="mdi-vector-triangle" tone="neutral" />
        <SicatMetricCard label="Construído em" :value="index?.builtAt ? formatDateTimeBr(index.builtAt) : '—'" icon="mdi-clock-outline" tone="running" />
      </div>

      <div class="ai-knowledge__actions mb-3">
        <v-btn color="warning" variant="tonal" prepend-icon="mdi-database-refresh-outline" :loading="actionLoading === 'reindex'" @click="reindex">
          Reindexar base
        </v-btn>
      </div>

      <SicatInlineAlert v-if="reindexLog" tone="success" title="Log da reindexação" class="mb-3">
        <pre class="ai-knowledge__log">{{ reindexLog }}</pre>
      </SicatInlineAlert>

      <!-- Fontes -->
      <SicatCard title="Fontes" icon="mdi-source-branch" flush-body class="mb-3">
        <SicatDataTable
          :headers="sourceHeaders"
          :items="sources"
          item-value="sourceKey"
          density="compact"
          :empty="{ title: 'Nenhuma fonte registrada', icon: 'mdi-source-branch' }"
        >
          <template #[`item.sourceType`]="{ item }">
            <v-chip size="x-small" variant="tonal">{{ item.sourceType || '—' }}</v-chip>
          </template>
          <template #[`item.enabled`]="{ item }">
            <v-switch
              :model-value="item.enabled"
              color="success"
              density="compact"
              hide-details
              :loading="actionLoading === item.sourceKey"
              @update:model-value="toggleSource(item)"
            />
          </template>
        </SicatDataTable>
      </SicatCard>

      <!-- Test retrieval -->
      <SicatCard title="Testar recuperação (RAG)" icon="mdi-magnify-scan" class="mb-3">
        <div class="ai-knowledge__retrieval-controls">
          <v-text-field
            v-model="question"
            label="Pergunta"
            variant="outlined"
            density="comfortable"
            hide-details
            @keyup.enter="runRetrieval"
          />
          <v-text-field v-model.number="retrievalK" type="number" label="k" variant="outlined" density="comfortable" hide-details style="max-width: 90px" />
          <v-btn color="primary" :loading="retrievalLoading" prepend-icon="mdi-magnify" @click="runRetrieval">Testar</v-btn>
        </div>

        <SicatErrorState v-if="retrievalError" compact class="mt-3" :message="retrievalError?.message || 'Falha na recuperação.'" />
        <SicatDataTable
          v-else-if="retrievalResults.length"
          class="mt-3"
          :headers="retrievalHeaders"
          :items="retrievalResults"
          item-value="id"
          density="compact"
        >
          <template #[`item.score`]="{ item }">{{ item.score != null ? Number(item.score).toFixed(4) : '—' }}</template>
          <template #[`item.source`]="{ item }">
            <v-chip size="x-small" variant="tonal">{{ item.source || item.sourceKey || '—' }}</v-chip>
          </template>
          <template #[`item.text`]="{ item }">{{ truncate(item.text || item.content) }}</template>
          <template #[`item.actions`]="{ item }">
            <v-btn variant="text" size="x-small" @click="openChunk(item)">Ver</v-btn>
          </template>
        </SicatDataTable>
      </SicatCard>

      <!-- Chunks browser -->
      <SicatCard title="Explorar chunks" icon="mdi-text-search" flush-body>
        <template #header-actions>
          <div class="ai-knowledge__chunk-filters">
            <v-text-field
              v-model="chunkSearch"
              label="Buscar"
              variant="outlined"
              density="compact"
              hide-details
              prepend-inner-icon="mdi-magnify"
              clearable
              @keyup.enter="loadChunks"
            />
            <v-select v-model="chunkSourceFilter" :items="sourceOptions" label="Fonte" variant="outlined" density="compact" hide-details clearable />
            <v-btn variant="tonal" size="small" :loading="chunksLoading" @click="loadChunks">Aplicar</v-btn>
          </div>
        </template>

        <SicatLoadingState v-if="chunksLoading" compact title="Carregando chunks…" />
        <SicatErrorState v-else-if="chunksError" compact :message="chunksError?.message || 'Falha ao carregar chunks.'" />
        <SicatDataTable
          v-else
          :headers="chunkHeaders"
          :items="chunks"
          item-value="id"
          density="compact"
          :empty="{ title: 'Nenhum chunk encontrado', icon: 'mdi-text-search' }"
        >
          <template #[`item.source`]="{ item }">
            <v-chip size="x-small" variant="tonal">{{ item.source || item.sourceKey || '—' }}</v-chip>
          </template>
          <template #[`item.title`]="{ item }">{{ item.title || '—' }}</template>
          <template #[`item.text`]="{ item }">{{ truncate(item.text || item.content) }}</template>
          <template #[`item.actions`]="{ item }">
            <v-btn variant="text" size="x-small" @click="openChunk(item)">Ver</v-btn>
          </template>
        </SicatDataTable>
      </SicatCard>
    </template>

    <!-- Dialog chunk -->
    <v-dialog v-model="chunkDialog" max-width="780" scrollable>
      <v-card rounded="lg" :title="chunkDetail?.title || 'Chunk'">
        <v-divider />
        <v-card-text style="max-height: 70vh">
          <div class="mb-2 d-flex flex-wrap ga-2">
            <v-chip v-if="chunkDetail?.source || chunkDetail?.sourceKey" size="small" variant="tonal">{{ chunkDetail?.source || chunkDetail?.sourceKey }}</v-chip>
            <v-chip v-if="chunkDetail?.score != null" size="small" variant="tonal" color="primary">score {{ Number(chunkDetail.score).toFixed(4) }}</v-chip>
          </div>
          <pre class="ai-knowledge__pre">{{ chunkDetail?.text || chunkDetail?.content || '—' }}</pre>
        </v-card-text>
        <v-card-actions class="justify-end">
          <v-btn variant="text" @click="chunkDialog = false">Fechar</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <ConfirmDialog
      :visible="dialogVisible"
      :title="dialogTitle"
      :message="dialogMessage"
      :confirm-label="dialogConfirmLabel"
      :cancel-label="dialogCancelLabel"
      :show-cancel="dialogShowCancel"
      :danger="dialogDanger"
      @confirm="accept"
      @cancel="cancel"
      @close="cancel"
    />
  </div>
</template>

<style scoped>
.ai-knowledge {
  display: flex;
  flex-direction: column;
}

.ai-knowledge__metrics {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: var(--space-3);
}

.ai-knowledge__retrieval-controls {
  display: flex;
  gap: var(--space-3);
  align-items: center;
  flex-wrap: wrap;
}

.ai-knowledge__chunk-filters {
  display: flex;
  gap: var(--space-2);
  align-items: center;
  flex-wrap: wrap;
  min-width: 320px;
}

.ai-knowledge__pre,
.ai-knowledge__log {
  margin: 0;
  padding: 12px 14px;
  border-radius: 10px;
  background: rgba(var(--v-theme-on-surface), 0.06);
  font-family: var(--font-family-mono, monospace);
  font-size: 0.8rem;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-word;
}

.ai-knowledge__log {
  max-height: 220px;
  overflow: auto;
}
</style>
