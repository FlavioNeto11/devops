<script setup>
import { computed, onMounted, ref } from 'vue';
import {
  activateAiControlPrompt,
  createAiControlPromptVersion,
  getAiControlPrompt,
  listAiControlPrompts,
  syncAiControlPrompt
} from '../../services/api.js';
import { useNotification } from '../../composables/useNotification.js';
import { useConfirmDialog } from '../../composables/useConfirmDialog.js';
import SicatCard from '../../components/sicat/SicatCard.vue';
import SicatDataTable from '../../components/sicat/SicatDataTable.vue';
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

const prompts = ref([]);
const loading = ref(false);
const error = ref(null);

const selectedName = ref('');
const detail = ref(null);
const detailLoading = ref(false);
const detailError = ref(null);
const actionLoading = ref('');

const previewDialog = ref(false);
const previewVersion = ref(null);

const newVersionDialog = ref(false);
const newVersionForm = ref({ promptText: '', version: '', label: '', model: '', description: '', activate: false });

// Diff: dois ids de versão selecionados.
const diffA = ref(null);
const diffB = ref(null);

const promptHeaders = [
  { title: 'Prompt', key: 'name' },
  { title: 'Origem', key: 'providerSource' },
  { title: 'Versão ativa', key: 'activeVersion' },
  { title: 'Versões', key: 'versionsCount', align: 'end' },
  { title: 'Fonte', key: 'source' },
  { title: '', key: 'actions', sortable: false, align: 'end' }
];

const normalizedPrompts = computed(() =>
  prompts.value.map((prompt, index) => ({
    ...prompt,
    // O DTO usa `promptName`; mapeamos para `name` (usado na tabela, seleção e detalhe).
    id: prompt.promptName || prompt.name || index,
    name: prompt.promptName || prompt.name || '—',
    versionsCount: prompt.versionsCount ?? (Array.isArray(prompt.versions) ? prompt.versions.length : 0)
  }))
);

const versions = computed(() => {
  const list = detail.value?.versions || [];
  return Array.isArray(list) ? list : [];
});

const versionOptions = computed(() =>
  versions.value.map((ver) => ({
    title: `v${ver.version ?? ver.id} ${ver.label ? `(${ver.label})` : ''}${(ver.active ?? ver.isActive) ? ' · ativa' : ''}`,
    value: ver.id ?? ver.versionId ?? ver.version
  }))
);

function versionById(id) {
  return versions.value.find((ver) => (ver.id ?? ver.versionId ?? ver.version) === id) || null;
}

const diffLines = computed(() => {
  const a = String(versionById(diffA.value)?.promptText || versionById(diffA.value)?.text || '').split('\n');
  const b = String(versionById(diffB.value)?.promptText || versionById(diffB.value)?.text || '').split('\n');
  const max = Math.max(a.length, b.length);
  const rows = [];
  for (let i = 0; i < max; i += 1) {
    const left = a[i] ?? '';
    const right = b[i] ?? '';
    let kind = 'equal';
    if (left !== right) {
      if (!left) kind = 'added';
      else if (!right) kind = 'removed';
      else kind = 'changed';
    }
    rows.push({ line: i + 1, left, right, kind });
  }
  return rows;
});

async function load() {
  loading.value = true;
  error.value = null;
  try {
    const data = await listAiControlPrompts();
    prompts.value = Array.isArray(data?.items) ? data.items : (Array.isArray(data) ? data : []);
  } catch (err) {
    error.value = err;
  } finally {
    loading.value = false;
  }
}

async function selectPrompt(prompt) {
  selectedName.value = prompt.name;
  detail.value = null;
  detailError.value = null;
  detailLoading.value = true;
  diffA.value = null;
  diffB.value = null;
  try {
    detail.value = await getAiControlPrompt(prompt.name);
  } catch (err) {
    detailError.value = err;
  } finally {
    detailLoading.value = false;
  }
}

function previewText(version) {
  previewVersion.value = version;
  previewDialog.value = true;
}

function openNewVersion() {
  newVersionForm.value = { promptText: '', version: '', label: '', model: '', description: '', activate: false };
  newVersionDialog.value = true;
}

async function saveNewVersion() {
  if (!selectedName.value) return;
  if (!newVersionForm.value.promptText.trim()) {
    notify.warning('Informe o texto do prompt.');
    return;
  }

  actionLoading.value = 'new-version';
  try {
    await createAiControlPromptVersion(selectedName.value, {
      promptText: newVersionForm.value.promptText,
      version: newVersionForm.value.version || undefined,
      label: newVersionForm.value.label || undefined,
      model: newVersionForm.value.model || undefined,
      description: newVersionForm.value.description || undefined,
      activate: Boolean(newVersionForm.value.activate)
    });
    notify.success('Nova versão do prompt criada.');
    newVersionDialog.value = false;
    await selectPrompt({ name: selectedName.value });
    await load();
  } catch (err) {
    notify.error(err?.message || 'Falha ao criar versão.');
  } finally {
    actionLoading.value = '';
  }
}

async function activateVersion(version) {
  const versionId = version.id ?? version.versionId ?? version.version;
  const confirmed = await confirm({
    title: 'Ativar versão do prompt',
    message: `Confirma ativar/reverter para a versão v${version.version ?? versionId} de "${selectedName.value}"? Isso muda o prompt em produção.`,
    confirmLabel: 'Ativar versão',
    danger: true
  });
  if (!confirmed) return;

  actionLoading.value = `activate-${versionId}`;
  try {
    await activateAiControlPrompt(selectedName.value, { versionId, confirmed: true });
    notify.success('Versão ativada.');
    await selectPrompt({ name: selectedName.value });
    await load();
  } catch (err) {
    notify.error(err?.message || 'Falha ao ativar versão.');
  } finally {
    actionLoading.value = '';
  }
}

async function syncLangfuse() {
  const confirmed = await confirm({
    title: 'Sincronizar com Langfuse',
    message: `Confirma sincronizar o prompt "${selectedName.value}" com o Langfuse?`,
    confirmLabel: 'Sincronizar',
    danger: true
  });
  if (!confirmed) return;

  actionLoading.value = 'sync';
  try {
    await syncAiControlPrompt(selectedName.value, { confirmed: true });
    notify.success('Prompt sincronizado com o Langfuse.');
    await selectPrompt({ name: selectedName.value });
  } catch (err) {
    notify.error(err?.message || 'Falha ao sincronizar com Langfuse.');
  } finally {
    actionLoading.value = '';
  }
}

onMounted(load);
</script>

<template>
  <div class="ai-prompts">
    <SicatLoadingState v-if="loading" title="Carregando prompts…" />
    <SicatErrorState v-else-if="error" :message="error?.message || 'Falha ao carregar prompts.'" retryable @retry="load" />

    <template v-else>
      <SicatCard flush-body class="mb-3">
        <SicatDataTable
          :headers="promptHeaders"
          :items="normalizedPrompts"
          item-value="id"
          density="compact"
          :empty="{ title: 'Nenhum prompt registrado', icon: 'mdi-text-box-outline' }"
        >
          <template #[`item.providerSource`]="{ item }">
            <v-chip size="x-small" variant="tonal">{{ item.providerSource || '—' }}</v-chip>
          </template>
          <template #[`item.source`]="{ item }">
            <v-chip size="x-small" variant="tonal">{{ item.source || '—' }}</v-chip>
          </template>
          <template #[`item.actions`]="{ item }">
            <v-btn
              size="small"
              :variant="selectedName === item.name ? 'flat' : 'tonal'"
              :color="selectedName === item.name ? 'primary' : undefined"
              @click="selectPrompt(item)"
            >
              {{ selectedName === item.name ? 'Selecionado' : 'Detalhes' }}
            </v-btn>
          </template>
        </SicatDataTable>
      </SicatCard>

      <SicatCard v-if="selectedName" :title="`Versões · ${selectedName}`" icon="mdi-history">
        <template #header-actions>
          <v-btn size="small" variant="tonal" prepend-icon="mdi-plus" @click="openNewVersion">Nova versão</v-btn>
          <v-btn size="small" variant="tonal" color="warning" prepend-icon="mdi-sync" :loading="actionLoading === 'sync'" @click="syncLangfuse">Sync Langfuse</v-btn>
        </template>

        <SicatLoadingState v-if="detailLoading" compact title="Carregando versões…" />
        <SicatErrorState v-else-if="detailError" compact :message="detailError?.message || 'Falha ao carregar versões.'" />
        <template v-else>
          <v-table density="compact">
            <thead>
              <tr>
                <th scope="col">Versão</th>
                <th scope="col">Label</th>
                <th scope="col">Modelo</th>
                <th scope="col">Ativa</th>
                <th scope="col">Ações</th>
              </tr>
            </thead>
            <tbody>
              <tr v-if="!versions.length">
                <td colspan="5" class="text-center text-medium-emphasis pa-4">Nenhuma versão.</td>
              </tr>
              <tr v-for="(ver, index) in versions" :key="ver.id ?? ver.version ?? index">
                <td>v{{ ver.version ?? ver.id }}</td>
                <td>{{ ver.label || '—' }}</td>
                <td>{{ ver.model || '—' }}</td>
                <td>
                  <v-icon :color="(ver.active ?? ver.isActive) ? 'success' : undefined" size="18">
                    {{ (ver.active ?? ver.isActive) ? 'mdi-check-circle' : 'mdi-minus' }}
                  </v-icon>
                </td>
                <td>
                  <div class="d-flex ga-1">
                    <v-btn size="x-small" variant="text" prepend-icon="mdi-eye-outline" @click="previewText(ver)">Preview</v-btn>
                    <v-btn
                      v-if="!(ver.active ?? ver.isActive)"
                      size="x-small"
                      variant="tonal"
                      color="primary"
                      :loading="actionLoading === `activate-${ver.id ?? ver.versionId ?? ver.version}`"
                      @click="activateVersion(ver)"
                    >
                      Ativar / Rollback
                    </v-btn>
                  </div>
                </td>
              </tr>
            </tbody>
          </v-table>

          <!-- Diff simples entre duas versões -->
          <div v-if="versions.length > 1" class="ai-prompts__diff mt-4">
            <div class="ai-prompts__diff-controls">
              <v-select v-model="diffA" :items="versionOptions" label="Versão A" variant="outlined" density="compact" hide-details />
              <v-icon>mdi-compare-horizontal</v-icon>
              <v-select v-model="diffB" :items="versionOptions" label="Versão B" variant="outlined" density="compact" hide-details />
            </div>
            <div v-if="diffA != null && diffB != null" class="ai-prompts__diff-body">
              <div
                v-for="row in diffLines"
                :key="row.line"
                class="ai-prompts__diff-row"
                :data-kind="row.kind"
              >
                <span class="ai-prompts__diff-num">{{ row.line }}</span>
                <span class="ai-prompts__diff-left">{{ row.left }}</span>
                <span class="ai-prompts__diff-right">{{ row.right }}</span>
              </div>
            </div>
            <SicatEmptyState v-else compact title="Selecione duas versões para comparar" icon="mdi-compare" />
          </div>
        </template>
      </SicatCard>
      <SicatEmptyState
        v-else
        title="Selecione um prompt"
        description="Escolha um prompt acima para ver suas versões, preview e diff."
        icon="mdi-text-box-search-outline"
      />
    </template>

    <!-- Dialog preview -->
    <v-dialog v-model="previewDialog" max-width="820" scrollable>
      <v-card rounded="lg" :title="`Preview · v${previewVersion?.version ?? ''}`">
        <v-divider />
        <v-card-text style="max-height: 70vh">
          <pre class="ai-prompts__pre">{{ previewVersion?.promptText || previewVersion?.text || '—' }}</pre>
        </v-card-text>
        <v-card-actions class="justify-end">
          <v-btn variant="text" @click="previewDialog = false">Fechar</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Dialog nova versão -->
    <v-dialog v-model="newVersionDialog" max-width="760">
      <v-card rounded="lg" :title="`Nova versão · ${selectedName}`">
        <v-card-text class="d-flex flex-column ga-3">
          <v-textarea v-model="newVersionForm.promptText" label="Texto do prompt" variant="outlined" rows="10" auto-grow hide-details />
          <div class="ai-prompts__form-grid">
            <v-text-field v-model="newVersionForm.version" label="Versão (opcional)" variant="outlined" density="comfortable" hide-details />
            <v-text-field v-model="newVersionForm.label" label="Label (opcional)" variant="outlined" density="comfortable" hide-details />
            <v-text-field v-model="newVersionForm.model" label="Modelo (opcional)" variant="outlined" density="comfortable" hide-details />
          </div>
          <v-text-field v-model="newVersionForm.description" label="Descrição (opcional)" variant="outlined" density="comfortable" hide-details />
          <v-switch v-model="newVersionForm.activate" color="primary" label="Ativar esta versão imediatamente" hide-details />
        </v-card-text>
        <v-card-actions class="justify-end">
          <v-btn variant="text" @click="newVersionDialog = false">Cancelar</v-btn>
          <v-btn color="primary" variant="flat" :loading="actionLoading === 'new-version'" @click="saveNewVersion">Criar versão</v-btn>
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
.ai-prompts {
  display: flex;
  flex-direction: column;
}

.ai-prompts__pre {
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

.ai-prompts__form-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: var(--space-3);
}

.ai-prompts__diff-controls {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

.ai-prompts__diff-body {
  margin-top: var(--space-3);
  border: 1px solid rgba(var(--v-border-color), 0.14);
  border-radius: 10px;
  overflow: auto;
  max-height: 360px;
  font-family: var(--font-family-mono, monospace);
  font-size: 0.76rem;
}

.ai-prompts__diff-row {
  display: grid;
  grid-template-columns: 48px 1fr 1fr;
  border-bottom: 1px solid rgba(var(--v-border-color), 0.08);
}

.ai-prompts__diff-row[data-kind='added'] {
  background: rgba(var(--v-theme-success), 0.08);
}

.ai-prompts__diff-row[data-kind='removed'] {
  background: rgba(var(--v-theme-error), 0.08);
}

.ai-prompts__diff-row[data-kind='changed'] {
  background: rgba(var(--v-theme-warning), 0.08);
}

.ai-prompts__diff-num {
  padding: 2px 6px;
  color: rgba(var(--v-theme-on-surface), 0.45);
  text-align: right;
}

.ai-prompts__diff-left,
.ai-prompts__diff-right {
  padding: 2px 8px;
  white-space: pre-wrap;
  word-break: break-word;
}

.ai-prompts__diff-left {
  border-right: 1px solid rgba(var(--v-border-color), 0.12);
}
</style>
