<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { getAiControlEvalRun, listAiControlEvals, runAiControlEval } from '../../services/api.js';
import { formatDateTimeBr } from '../../utils/date-format.js';
import { useNotification } from '../../composables/useNotification.js';
import { useConfirmDialog } from '../../composables/useConfirmDialog.js';
import SicatCard from '../../components/sicat/SicatCard.vue';
import SicatDataTable from '../../components/sicat/SicatDataTable.vue';
import SicatStatusBadge from '../../components/sicat/SicatStatusBadge.vue';
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

const batteries = ref([]);
const runs = ref([]);
const loading = ref(false);
const error = ref(null);
const actionLoading = ref('');

const categoryInput = ref('');

const runDialog = ref(false);
const runDetail = ref(null);
const runDetailLoading = ref(false);
const runDetailError = ref(null);

let pollInterval = null;

const batteryHeaders = [
  { title: 'Bateria', key: 'label' },
  { title: 'Modo', key: 'mode' },
  { title: 'Cenários', key: 'totalScenarios', align: 'end' },
  { title: 'Bloqueada', key: 'blockedByDefault', align: 'center' }
];

const runHeaders = [
  { title: 'Modo', key: 'mode' },
  { title: 'Status', key: 'status' },
  { title: 'Passou/Falhou', key: 'passFail', sortable: false, align: 'end' },
  { title: 'Pass rate', key: 'passRate', align: 'end' },
  { title: 'Score médio', key: 'avgScore', align: 'end' },
  { title: 'Início', key: 'startedAt' },
  { title: '', key: 'actions', sortable: false, align: 'end' }
];

const normalizedRuns = computed(() =>
  runs.value.map((run, index) => {
    const s = run.summary || {};
    return {
      ...run,
      id: run.runId || run.id || index,
      // O resumo vem aninhado em run.summary; achatamos para a tabela.
      passed: s.passed ?? run.passed ?? 0,
      failed: s.failed ?? run.failed ?? 0,
      passRate: s.passRate ?? run.passRate ?? null,
      avgScore: s.avgScore ?? run.avgScore ?? null
    };
  })
);

// O detalhe retorna { run, cases }. Normalizamos para o template.
const detailRun = computed(() => runDetail.value?.run || runDetail.value || {});
const detailSummary = computed(() => detailRun.value?.summary || {});

function caseScore(item) {
  const raw = item?.score;
  const num = raw && typeof raw === 'object' ? raw.score : raw;
  return num != null && !Number.isNaN(Number(num)) ? Number(num).toFixed(3) : '—';
}
function casePassed(item) {
  return item?.status === 'passed' || item?.passed === true;
}

const fullBattery = computed(() => batteries.value.find((b) => b.mode === 'full') || null);
const fullAllowed = computed(() => fullBattery.value?.blockedByDefault === false);

function formatPercent(value) {
  if (value == null) return '—';
  const num = Number(value);
  if (Number.isNaN(num)) return String(value);
  // Aceita tanto fração (0–1) quanto porcentagem (0–100).
  const pct = num <= 1 ? num * 100 : num;
  return `${pct.toFixed(1)}%`;
}

async function load() {
  loading.value = true;
  error.value = null;
  try {
    const data = await listAiControlEvals();
    batteries.value = Array.isArray(data?.batteries) ? data.batteries : [];
    runs.value = Array.isArray(data?.runs) ? data.runs : [];
  } catch (err) {
    error.value = err;
  } finally {
    loading.value = false;
  }
}

async function refreshRuns() {
  try {
    const data = await listAiControlEvals();
    runs.value = Array.isArray(data?.runs) ? data.runs : runs.value;
  } catch {
    // silencioso no polling
  }
}

async function triggerRun(mode, extra = {}) {
  actionLoading.value = mode;
  try {
    const data = await runAiControlEval({ mode, ...extra });
    notify.success(`Execução (${mode}) iniciada.`);
    await load();
    const newRunId = data?.runId || data?.id;
    if (newRunId) {
      openRun({ runId: newRunId });
    }
  } catch (err) {
    notify.error(err?.message || 'Falha ao iniciar execução.');
  } finally {
    actionLoading.value = '';
  }
}

function runDry() {
  triggerRun('dry-run');
}

function runSample() {
  triggerRun('sample');
}

function runCategory() {
  const category = categoryInput.value.trim();
  if (!category) {
    notify.warning('Informe uma categoria.');
    return;
  }
  triggerRun('category', { category });
}

async function runFull() {
  if (!fullAllowed.value) {
    notify.warning('A bateria completa está bloqueada por padrão neste ambiente.');
    return;
  }
  const confirmed = await confirm({
    title: 'Executar bateria completa',
    message: 'A bateria completa de smoke pode consumir tempo e custo de LLM significativos. Confirma a execução total?',
    confirmLabel: 'Executar tudo',
    danger: true
  });
  if (!confirmed) return;
  triggerRun('full', { confirmed: true });
}

async function openRun(run) {
  const runId = run.runId || run.id;
  if (!runId) return;
  runDialog.value = true;
  runDetail.value = null;
  runDetailError.value = null;
  runDetailLoading.value = true;
  try {
    runDetail.value = await getAiControlEvalRun(runId);
  } catch (err) {
    runDetailError.value = err;
  } finally {
    runDetailLoading.value = false;
  }
}

const runCases = computed(() => {
  const list = runDetail.value?.cases || runDetail.value?.results || [];
  return Array.isArray(list) ? list.map((c, i) => ({ ...c, id: c.id || c.caseId || i })) : [];
});

const caseHeaders = [
  { title: 'Caso', key: 'name' },
  { title: 'Categoria', key: 'category' },
  { title: 'Resultado', key: 'passed', align: 'center' },
  { title: 'Score', key: 'score', align: 'end' },
  { title: '', key: 'actions', sortable: false, align: 'end' }
];

onMounted(() => {
  load();
  pollInterval = setInterval(refreshRuns, 8000);
});

onUnmounted(() => {
  if (pollInterval) clearInterval(pollInterval);
});
</script>

<template>
  <div class="ai-evals">
    <SicatLoadingState v-if="loading" title="Carregando baterias e execuções…" />
    <SicatErrorState v-else-if="error" :message="error?.message || 'Falha ao carregar evals.'" retryable @retry="load" />

    <template v-else>
      <!-- Ações de execução -->
      <SicatCard title="Executar smoke / evals" icon="mdi-play-circle-outline" class="mb-3">
        <div class="ai-evals__run-controls">
          <v-btn variant="tonal" color="primary" prepend-icon="mdi-play-outline" :loading="actionLoading === 'dry-run'" @click="runDry">Dry-run</v-btn>
          <v-btn variant="tonal" color="primary" prepend-icon="mdi-play-speed" :loading="actionLoading === 'sample'" @click="runSample">Amostra</v-btn>
          <div class="ai-evals__category">
            <v-text-field v-model="categoryInput" label="Categoria" variant="outlined" density="compact" hide-details style="max-width: 220px" @keyup.enter="runCategory" />
            <v-btn variant="tonal" prepend-icon="mdi-tag-outline" :loading="actionLoading === 'category'" @click="runCategory">Rodar categoria</v-btn>
          </div>
          <v-tooltip v-if="!fullAllowed" text="Bateria completa bloqueada por padrão neste ambiente." location="top">
            <template #activator="{ props: tipProps }">
              <span v-bind="tipProps">
                <v-btn variant="tonal" color="error" prepend-icon="mdi-play-box-multiple-outline" disabled>Bateria completa</v-btn>
              </span>
            </template>
          </v-tooltip>
          <v-btn v-else variant="tonal" color="error" prepend-icon="mdi-play-box-multiple-outline" :loading="actionLoading === 'full'" @click="runFull">Bateria completa</v-btn>
          <v-spacer />
          <v-btn variant="text" prepend-icon="mdi-refresh" @click="load">Atualizar</v-btn>
        </div>
      </SicatCard>

      <!-- Baterias -->
      <SicatCard title="Baterias" icon="mdi-format-list-checks" flush-body class="mb-3">
        <SicatDataTable
          :headers="batteryHeaders"
          :items="batteries"
          item-value="key"
          density="compact"
          :empty="{ title: 'Nenhuma bateria configurada', icon: 'mdi-format-list-checks' }"
        >
          <template #[`item.mode`]="{ item }">
            <v-chip size="x-small" variant="tonal">{{ item.mode }}</v-chip>
          </template>
          <template #[`item.blockedByDefault`]="{ item }">
            <v-icon :color="item.blockedByDefault ? 'error' : 'success'" size="18">
              {{ item.blockedByDefault ? 'mdi-lock' : 'mdi-lock-open-variant-outline' }}
            </v-icon>
          </template>
        </SicatDataTable>
      </SicatCard>

      <!-- Execuções recentes -->
      <SicatCard title="Execuções recentes" icon="mdi-history" flush-body>
        <SicatDataTable
          :headers="runHeaders"
          :items="normalizedRuns"
          item-value="id"
          density="compact"
          :empty="{ title: 'Nenhuma execução ainda', icon: 'mdi-history' }"
        >
          <template #[`item.mode`]="{ item }">
            <v-chip size="x-small" variant="tonal">{{ item.mode }}</v-chip>
          </template>
          <template #[`item.status`]="{ item }">
            <SicatStatusBadge :status="item.status" domain="job" with-dot size="sm" />
          </template>
          <template #[`item.passFail`]="{ item }">
            <span class="ai-evals__passfail">
              <span class="text-success">{{ item.passed ?? 0 }}</span> /
              <span class="text-error">{{ item.failed ?? 0 }}</span>
            </span>
          </template>
          <template #[`item.passRate`]="{ item }">{{ formatPercent(item.passRate) }}</template>
          <template #[`item.avgScore`]="{ item }">{{ item.avgScore != null ? Number(item.avgScore).toFixed(3) : '—' }}</template>
          <template #[`item.startedAt`]="{ item }">{{ item.startedAt ? formatDateTimeBr(item.startedAt) : '—' }}</template>
          <template #[`item.actions`]="{ item }">
            <v-btn variant="text" size="small" prepend-icon="mdi-eye-outline" @click="openRun(item)">Detalhe</v-btn>
          </template>
        </SicatDataTable>
      </SicatCard>
    </template>

    <!-- Dialog detalhe da execução -->
    <v-dialog v-model="runDialog" max-width="960" scrollable>
      <v-card rounded="lg">
        <v-card-title class="d-flex align-center justify-space-between ga-2">
          <span>Detalhe da execução</span>
          <div class="d-flex align-center ga-1">
            <AiJsonViewer v-if="runDetail" :value="runDetail" label="JSON" button-variant="text" button-size="small" />
            <v-btn icon="mdi-close" variant="text" size="small" aria-label="Fechar" @click="runDialog = false" />
          </div>
        </v-card-title>
        <v-divider />
        <v-card-text style="max-height: 72vh">
          <SicatLoadingState v-if="runDetailLoading" compact title="Carregando execução…" />
          <SicatErrorState v-else-if="runDetailError" compact :message="runDetailError?.message || 'Falha ao carregar execução.'" />
          <template v-else-if="runDetail">
            <!-- Resumo -->
            <div class="ai-evals__summary mb-3">
              <div class="ai-evals__summary-item">
                <span class="ai-evals__summary-label">Status</span>
                <SicatStatusBadge :status="detailRun.status" domain="job" with-dot size="sm" />
              </div>
              <div class="ai-evals__summary-item">
                <span class="ai-evals__summary-label">Pass rate</span>
                <strong>{{ formatPercent(detailSummary.passRate) }}</strong>
              </div>
              <div class="ai-evals__summary-item">
                <span class="ai-evals__summary-label">Score médio</span>
                <strong>{{ detailSummary.avgScore != null ? Number(detailSummary.avgScore).toFixed(3) : '—' }}</strong>
              </div>
              <div class="ai-evals__summary-item">
                <span class="ai-evals__summary-label">Passou/Falhou</span>
                <strong>{{ detailSummary.passed ?? 0 }} / {{ detailSummary.failed ?? 0 }}</strong>
              </div>
            </div>

            <div v-if="(detailSummary.topReasonCodes && detailSummary.topReasonCodes.length) || (detailSummary.failedCategories && detailSummary.failedCategories.length)" class="mb-3">
              <div v-if="detailSummary.topReasonCodes && detailSummary.topReasonCodes.length" class="mb-2">
                <span class="ai-evals__summary-label">Principais motivos</span>
                <div class="d-flex flex-wrap ga-1 mt-1">
                  <v-chip v-for="(reason, i) in detailSummary.topReasonCodes" :key="i" size="x-small" variant="tonal" color="warning">
                    {{ reason.code || reason }}<template v-if="reason.count"> · {{ reason.count }}</template>
                  </v-chip>
                </div>
              </div>
              <div v-if="detailSummary.failedCategories && detailSummary.failedCategories.length">
                <span class="ai-evals__summary-label">Categorias com falha</span>
                <div class="d-flex flex-wrap ga-1 mt-1">
                  <v-chip v-for="(catItem, i) in detailSummary.failedCategories" :key="i" size="x-small" variant="tonal" color="error">
                    {{ catItem.category || catItem }}<template v-if="catItem.count"> · {{ catItem.count }}</template>
                  </v-chip>
                </div>
              </div>
            </div>

            <!-- Casos -->
            <SicatEmptyState v-if="!runCases.length" compact title="Sem casos nesta execução" icon="mdi-format-list-checks" />
            <SicatDataTable
              v-else
              :headers="caseHeaders"
              :items="runCases"
              item-value="id"
              density="compact"
            >
              <template #[`item.name`]="{ item }">
                <span class="ai-evals__case-id">{{ item.caseId || item.name || item.prompt || '—' }}</span>
              </template>
              <template #[`item.passed`]="{ item }">
                <v-icon :color="casePassed(item) ? 'success' : 'error'" size="18">
                  {{ casePassed(item) ? 'mdi-check-circle' : 'mdi-close-circle' }}
                </v-icon>
              </template>
              <template #[`item.score`]="{ item }">{{ caseScore(item) }}</template>
              <template #[`item.actions`]="{ item }">
                <AiJsonViewer :value="item" label="Ver" button-variant="text" button-size="x-small" />
              </template>
            </SicatDataTable>
          </template>
        </v-card-text>
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
.ai-evals {
  display: flex;
  flex-direction: column;
}

.ai-evals__run-controls {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}

.ai-evals__category {
  display: flex;
  gap: 8px;
  align-items: center;
}

.ai-evals__passfail {
  font-family: var(--font-family-mono, monospace);
  font-weight: 700;
}

.ai-evals__summary {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-5);
}

.ai-evals__summary-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.ai-evals__summary-label {
  font-size: 0.74rem;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: rgba(var(--v-theme-on-surface), 0.55);
}
</style>
