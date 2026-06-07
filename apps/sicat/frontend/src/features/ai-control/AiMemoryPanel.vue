<script setup>
import { computed, ref } from 'vue';
import {
  clearAiControlMemory,
  exportAiControlMemory,
  getAiControlMemory,
  getAiControlMemoryHistory,
  rebuildAiControlMemory
} from '../../services/api.js';
import { formatDateTimeBr } from '../../utils/date-format.js';
import { useNotification } from '../../composables/useNotification.js';
import { useConfirmDialog } from '../../composables/useConfirmDialog.js';
import SicatCard from '../../components/sicat/SicatCard.vue';
import SicatDataTable from '../../components/sicat/SicatDataTable.vue';
import SicatEmptyState from '../../components/sicat/SicatEmptyState.vue';
import SicatLoadingState from '../../components/sicat/SicatLoadingState.vue';
import SicatErrorState from '../../components/sicat/SicatErrorState.vue';
import ConfirmDialog from '../../components/sicat/SicatConfirmDialog.vue';
import AiJsonViewer from './AiJsonViewer.vue';

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

const sessionId = ref('');
const integrationAccountId = ref('');

const snapshot = ref(null);
const loading = ref(false);
const error = ref(null);
const actionLoading = ref('');

const historyDialog = ref(false);
const history = ref([]);
const historyLoading = ref(false);
const historyError = ref(null);

const workingMemory = computed(() => snapshot.value?.workingMemory || snapshot.value?.working || null);
const patches = computed(() => {
  const list = snapshot.value?.memoryPatches || snapshot.value?.patches || [];
  return Array.isArray(list) ? list : [];
});
const vectorHits = computed(() => {
  const list = snapshot.value?.vectorMemory?.hits || snapshot.value?.vectorHits || [];
  return Array.isArray(list) ? list : [];
});
const messages = computed(() => {
  const list = snapshot.value?.recentMessages || snapshot.value?.messages || [];
  return Array.isArray(list) ? list : [];
});
const dateRange = computed(() => snapshot.value?.dateRange || null);

const chipGroups = computed(() => [
  { label: 'Manifestos ativos', items: snapshot.value?.activeManifestIds || [], color: 'primary' },
  { label: 'Manifestos perguntados', items: snapshot.value?.askedManifestIds || [], color: 'info' },
  { label: 'Jobs ativos', items: snapshot.value?.activeJobIds || [], color: 'warning' },
  { label: 'Artefatos', items: snapshot.value?.artifactIds || [], color: 'success' }
]);

const historyHeaders = [
  { title: 'Quando', key: 'at' },
  { title: 'Evento', key: 'type' },
  { title: 'Ator', key: 'actor' },
  { title: '', key: 'actions', sortable: false, align: 'end' }
];

function queryParams() {
  return integrationAccountId.value ? { integrationAccountId: integrationAccountId.value } : {};
}

async function load() {
  const id = sessionId.value.trim();
  if (!id) {
    notify.warning('Informe um conversationSessionId.');
    return;
  }
  loading.value = true;
  error.value = null;
  snapshot.value = null;
  try {
    snapshot.value = await getAiControlMemory(id, queryParams());
  } catch (err) {
    error.value = err;
  } finally {
    loading.value = false;
  }
}

function downloadJson(data, filename) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

async function exportSnapshot() {
  const id = sessionId.value.trim();
  if (!id) return;
  actionLoading.value = 'export';
  try {
    const data = await exportAiControlMemory(id, queryParams());
    downloadJson(data ?? snapshot.value ?? {}, `memory-${id}.json`);
    notify.success('Snapshot exportado.');
  } catch (err) {
    notify.error(err?.message || 'Falha ao exportar snapshot.');
  } finally {
    actionLoading.value = '';
  }
}

async function rebuildSummary() {
  const id = sessionId.value.trim();
  if (!id) return;
  actionLoading.value = 'rebuild';
  try {
    await rebuildAiControlMemory(id, queryParams());
    notify.success('Resumo reconstruído.');
    await load();
  } catch (err) {
    notify.error(err?.message || 'Falha ao reconstruir resumo.');
  } finally {
    actionLoading.value = '';
  }
}

async function clearMemory() {
  const id = sessionId.value.trim();
  if (!id) return;
  const confirmed = await confirm({
    title: 'Limpar memória da sessão',
    message: `Confirma apagar toda a memória da sessão "${id}"? Esta ação não pode ser desfeita.`,
    confirmLabel: 'Limpar memória',
    danger: true
  });
  if (!confirmed) return;

  actionLoading.value = 'clear';
  try {
    await clearAiControlMemory(id, queryParams(), { confirmed: true });
    notify.success('Memória da sessão apagada.');
    snapshot.value = null;
  } catch (err) {
    notify.error(err?.message || 'Falha ao limpar memória.');
  } finally {
    actionLoading.value = '';
  }
}

async function openHistory() {
  const id = sessionId.value.trim();
  if (!id) return;
  historyDialog.value = true;
  history.value = [];
  historyError.value = null;
  historyLoading.value = true;
  try {
    const data = await getAiControlMemoryHistory(id);
    const list = Array.isArray(data?.events) ? data.events : (Array.isArray(data?.items) ? data.items : (Array.isArray(data) ? data : []));
    history.value = list.map((evt, i) => ({ ...evt, id: evt.id || i }));
  } catch (err) {
    historyError.value = err;
  } finally {
    historyLoading.value = false;
  }
}
</script>

<template>
  <div class="ai-memory">
    <SicatCard class="mb-3">
      <div class="ai-memory__form">
        <v-text-field
          v-model="sessionId"
          label="conversationSessionId"
          variant="outlined"
          density="comfortable"
          hide-details
          @keyup.enter="load"
        />
        <v-text-field
          v-model="integrationAccountId"
          label="integrationAccountId (opcional)"
          variant="outlined"
          density="comfortable"
          hide-details
        />
        <v-btn color="primary" :loading="loading" prepend-icon="mdi-database-search-outline" @click="load">Carregar</v-btn>
      </div>
    </SicatCard>

    <SicatLoadingState v-if="loading" title="Carregando memória…" />
    <SicatErrorState v-else-if="error" :message="error?.message || 'Falha ao carregar memória.'" retryable @retry="load" />

    <SicatEmptyState
      v-else-if="!snapshot"
      title="Nenhuma sessão carregada"
      description="Informe um conversationSessionId acima para inspecionar a memória."
      icon="mdi-brain"
    />

    <template v-else>
      <!-- Ações -->
      <SicatCard class="mb-3" flush-body>
        <div class="ai-memory__actions">
          <v-btn variant="tonal" prepend-icon="mdi-download-outline" :loading="actionLoading === 'export'" @click="exportSnapshot">Exportar snapshot</v-btn>
          <v-btn variant="tonal" prepend-icon="mdi-refresh" :loading="actionLoading === 'rebuild'" @click="rebuildSummary">Reconstruir resumo</v-btn>
          <v-btn variant="tonal" prepend-icon="mdi-history" @click="openHistory">Histórico</v-btn>
          <v-spacer />
          <v-btn color="error" variant="tonal" prepend-icon="mdi-delete-outline" :loading="actionLoading === 'clear'" @click="clearMemory">Limpar memória</v-btn>
        </div>
      </SicatCard>

      <!-- Chips de contexto -->
      <SicatCard title="Contexto da sessão" icon="mdi-tag-multiple-outline" class="mb-3">
        <div v-if="dateRange" class="ai-memory__muted mb-2">
          Período: {{ dateRange.start || dateRange.from || '—' }} → {{ dateRange.end || dateRange.to || '—' }}
        </div>
        <div class="ai-memory__chip-groups">
          <div v-for="group in chipGroups" :key="group.label" class="ai-memory__chip-group">
            <span class="ai-memory__chip-label">{{ group.label }}</span>
            <div class="d-flex flex-wrap ga-1">
              <v-chip v-for="id in group.items" :key="id" size="x-small" variant="tonal" :color="group.color">{{ id }}</v-chip>
              <span v-if="!group.items.length" class="ai-memory__muted">—</span>
            </div>
          </div>
        </div>
      </SicatCard>

      <div class="ai-memory__grid">
        <!-- Working memory (JSON colapsável) -->
        <SicatCard title="Memória de trabalho" icon="mdi-brain">
          <SicatEmptyState v-if="!workingMemory" compact title="Sem memória de trabalho" icon="mdi-brain" />
          <v-expansion-panels v-else variant="accordion">
            <v-expansion-panel title="Ver memória de trabalho (JSON)">
              <template #text>
                <pre class="ai-memory__pre">{{ JSON.stringify(workingMemory, null, 2) }}</pre>
              </template>
            </v-expansion-panel>
          </v-expansion-panels>
        </SicatCard>

        <!-- Vector memory -->
        <SicatCard :title="`Memória vetorial (${vectorHits.length})`" icon="mdi-vector-triangle">
          <SicatEmptyState v-if="!vectorHits.length" compact title="Nenhum hit vetorial" icon="mdi-vector-triangle" />
          <v-list v-else density="compact" class="ai-memory__list">
            <v-list-item v-for="(hit, index) in vectorHits" :key="hit.id || index">
              <v-list-item-title class="ai-memory__hit-title">{{ hit.title || hit.text || hit.content || 'hit' }}</v-list-item-title>
              <v-list-item-subtitle v-if="hit.score != null">score {{ Number(hit.score).toFixed(4) }}</v-list-item-subtitle>
            </v-list-item>
          </v-list>
        </SicatCard>
      </div>

      <!-- Patches -->
      <SicatCard :title="`Patches de memória (${patches.length})`" icon="mdi-vector-difference" class="mt-3">
        <SicatEmptyState v-if="!patches.length" compact title="Nenhum patch" icon="mdi-vector-difference" />
        <v-list v-else density="compact" class="ai-memory__list">
          <v-list-item v-for="(patch, index) in patches" :key="patch.id || index">
            <v-list-item-title class="ai-memory__hit-title">{{ patch.op || patch.type || 'patch' }} · {{ patch.path || patch.key || '' }}</v-list-item-title>
            <v-list-item-subtitle v-if="patch.at">{{ formatDateTimeBr(patch.at) }}</v-list-item-subtitle>
            <template #append>
              <AiJsonViewer :value="patch" label="Ver" button-variant="text" button-size="x-small" />
            </template>
          </v-list-item>
        </v-list>
      </SicatCard>

      <!-- Mensagens recentes -->
      <SicatCard :title="`Mensagens recentes (${messages.length})`" icon="mdi-message-text-outline" class="mt-3">
        <SicatEmptyState v-if="!messages.length" compact title="Nenhuma mensagem recente" icon="mdi-message-off-outline" />
        <v-list v-else density="compact" class="ai-memory__list">
          <v-list-item v-for="(msg, index) in messages" :key="msg.id || index">
            <template #prepend>
              <v-chip size="x-small" variant="tonal" class="mr-2">{{ msg.role || msg.author || '—' }}</v-chip>
            </template>
            <v-list-item-title class="ai-memory__msg">{{ msg.content || msg.text || '' }}</v-list-item-title>
            <v-list-item-subtitle v-if="msg.at || msg.createdAt">{{ formatDateTimeBr(msg.at || msg.createdAt) }}</v-list-item-subtitle>
          </v-list-item>
        </v-list>
      </SicatCard>
    </template>

    <!-- Dialog histórico -->
    <v-dialog v-model="historyDialog" max-width="820" scrollable>
      <v-card rounded="lg" title="Histórico de eventos da memória">
        <v-divider />
        <v-card-text style="max-height: 70vh">
          <SicatLoadingState v-if="historyLoading" compact title="Carregando histórico…" />
          <SicatErrorState v-else-if="historyError" compact :message="historyError?.message || 'Falha ao carregar histórico.'" />
          <SicatDataTable
            v-else
            :headers="historyHeaders"
            :items="history"
            item-value="id"
            density="compact"
            :empty="{ title: 'Sem eventos', icon: 'mdi-history' }"
          >
            <template #[`item.at`]="{ item }">{{ item.at ? formatDateTimeBr(item.at) : '—' }}</template>
            <template #[`item.actions`]="{ item }">
              <AiJsonViewer :value="item" label="Ver" button-variant="text" button-size="x-small" />
            </template>
          </SicatDataTable>
        </v-card-text>
        <v-card-actions class="justify-end">
          <v-btn variant="text" @click="historyDialog = false">Fechar</v-btn>
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
.ai-memory {
  display: flex;
  flex-direction: column;
}

.ai-memory__form {
  display: grid;
  grid-template-columns: 1fr 1fr auto;
  gap: var(--space-3);
  align-items: center;
}

.ai-memory__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  padding: var(--space-3) var(--space-4);
}

.ai-memory__grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
  gap: var(--space-3);
}

.ai-memory__chip-groups {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.ai-memory__chip-group {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.ai-memory__chip-label {
  font-size: 0.74rem;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: rgba(var(--v-theme-on-surface), 0.55);
}

.ai-memory__muted {
  color: rgba(var(--v-theme-on-surface), 0.5);
  font-size: 0.85rem;
}

.ai-memory__list {
  max-height: 280px;
  overflow: auto;
}

.ai-memory__hit-title,
.ai-memory__msg {
  font-size: 0.85rem;
  white-space: normal;
}

.ai-memory__pre {
  margin: 0;
  font-family: var(--font-family-mono, monospace);
  font-size: 0.78rem;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-word;
}

@media (max-width: 720px) {
  .ai-memory__form {
    grid-template-columns: 1fr;
  }
}
</style>
