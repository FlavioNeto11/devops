<template>
  <UiPageLayout
    eyebrow="Acompanhamento"
    title="Relatórios"
    subtitle="Relatórios consolidados de evolução por paciente. Acompanhe o status, visualize o resultado e baixe quando estiver pronto."
    width="wide"
  >
    <template #actions>
      <UiButton variant="ghost" :loading="loading" @click="reload">Atualizar</UiButton>
      <UiButton variant="primary" @click="openGenerate">Gerar relatório</UiButton>
    </template>

    <!-- Resumo (KPIs) — sempre visível; placeholders enquanto carrega -->
    <section class="rl-metrics" aria-label="Resumo dos relatórios">
      <UiMetricCard
        label="Total"
        :value="loading ? null : formatNumber(counts.total)"
        :loading="loading"
        tone="primary"
        hint="Relatórios no tenant"
      />
      <UiMetricCard
        label="Em fila"
        :value="loading ? null : formatNumber(counts.queued)"
        :loading="loading"
        tone="warning"
        hint="Aguardando processamento"
      />
      <UiMetricCard
        label="Processando"
        :value="loading ? null : formatNumber(counts.processing)"
        :loading="loading"
        tone="running"
        hint="Em geração agora"
      />
      <UiMetricCard
        label="Concluídos"
        :value="loading ? null : formatNumber(counts.completed)"
        :loading="loading"
        tone="success"
        hint="Prontos para baixar"
      />
      <UiMetricCard
        label="Com erro"
        :value="loading ? null : formatNumber(counts.error)"
        :loading="loading"
        tone="error"
        hint="Falharam ao gerar"
      />
    </section>

    <!-- Filtros -->
    <template #filters>
      <UiFiltersPanel
        v-model="filters"
        :fields="filterFields"
        @apply="applyFilters"
        @clear="clearFilters"
      />
    </template>

    <!-- Banner de filtro ativo -->
    <template v-if="hasActiveFilters" #banner>
      <div class="rl-banner" role="status">
        <span class="rl-banner-text">
          Filtrando por
          <strong v-if="filters.patient_id">paciente {{ filters.patient_id }}</strong>
          <strong v-if="filters.patient_id && filters.status"> · </strong>
          <strong v-if="filters.status">{{ statusText(filters.status) }}</strong>.
        </span>
        <UiButton variant="subtle" size="sm" @click="clearFilters">Limpar filtros</UiButton>
      </div>
    </template>

    <!-- Tabela: estados loading/error/empty/normal cobertos pelo UiDataTable -->
    <UiDataTable
      :columns="columns"
      :rows="rows"
      :loading="loading"
      :error="errorMessage"
      row-key="id"
      density="comfortable"
      server-mode
      :sort="sort"
      :page="page"
      :page-size="pageSize"
      :total="total"
      paginated
      :empty="emptyState"
      @update:sort="onSort"
      @update:page="onPage"
      @update:page-size="onPageSize"
      @retry="reload"
    >
      <!-- Identificador do relatório -->
      <template #cell-id="{ value }">
        <span class="rl-code">#{{ value }}</span>
      </template>

      <!-- Paciente -->
      <template #cell-patient_id="{ value }">
        <span class="rl-patient">{{ value || '—' }}</span>
      </template>

      <!-- Status com rótulo amigável (cor nunca é o único sinal) -->
      <template #cell-status="{ value }">
        <UiStatusBadge :status="value" :tone="statusTone(value)" :label="statusText(value)" />
      </template>

      <!-- Solicitado em -->
      <template #cell-created_at="{ value }">
        <span class="rl-when">{{ formatDateTime(value) }}</span>
      </template>

      <!-- Concluído em -->
      <template #cell-completed_at="{ value }">
        <span v-if="value" class="rl-when">{{ formatDateTime(value) }}</span>
        <span v-else class="rl-sub">—</span>
      </template>

      <!-- Ações por linha -->
      <template #cell-actions="{ row }">
        <div class="rl-actions">
          <UiButton
            variant="subtle"
            size="sm"
            @click="view(row)"
          >Visualizar</UiButton>
          <UiButton
            v-if="isCompleted(row)"
            variant="ghost"
            size="sm"
            :loading="downloadingId === row.id"
            @click="download(row)"
          >Baixar</UiButton>
          <UiButton
            variant="danger"
            size="sm"
            :loading="removingId === row.id"
            @click="remove(row)"
          >Remover</UiButton>
        </div>
      </template>

      <template #empty-action>
        <div class="rl-empty-actions">
          <UiButton v-if="hasActiveFilters" variant="ghost" @click="clearFilters">Limpar filtros</UiButton>
          <UiButton variant="primary" @click="openGenerate">Gerar relatório</UiButton>
        </div>
      </template>
    </UiDataTable>

    <template #footer>
      <span>Os relatórios são gerados de forma assíncrona. Atualize a lista para acompanhar o status.</span>
    </template>
  </UiPageLayout>

  <!-- Modal: Gerar relatório -->
  <UiModal
    v-model:open="generateOpen"
    title="Gerar relatório"
    width="md"
    :persistent="f.submitting.value"
  >
    <form class="rl-form" novalidate @submit.prevent="submitGenerate">
      <p class="rl-form-intro">
        Solicite um relatório consolidado de evolução para um paciente. O período é opcional —
        deixe em branco para considerar todo o histórico.
      </p>

      <UiFormField
        label="Paciente"
        required
        :error="f.errors.patient_id"
        hint="Identificador do paciente (patient_id)."
      >
        <template #default="{ id, describedBy }">
          <input
            :id="id"
            :value="f.values.patient_id"
            type="text"
            name="patient_id"
            autocomplete="off"
            placeholder="Ex.: pat_001"
            :aria-describedby="describedBy"
            :aria-invalid="f.errors.patient_id ? 'true' : null"
            @input="f.setField('patient_id', $event.target.value)"
          />
        </template>
      </UiFormField>

      <div class="rl-form-grid">
        <UiFormField
          label="Período de"
          :error="f.errors.date_from"
          hint="Início (opcional)."
        >
          <template #default="{ id, describedBy }">
            <input
              :id="id"
              :value="f.values.date_from"
              type="date"
              name="date_from"
              :aria-describedby="describedBy"
              @input="f.setField('date_from', $event.target.value)"
            />
          </template>
        </UiFormField>

        <UiFormField
          label="Período até"
          :error="f.errors.date_to"
          hint="Fim (opcional)."
        >
          <template #default="{ id, describedBy }">
            <input
              :id="id"
              :value="f.values.date_to"
              type="date"
              name="date_to"
              :aria-describedby="describedBy"
              :aria-invalid="f.errors.date_to ? 'true' : null"
              @input="f.setField('date_to', $event.target.value)"
            />
          </template>
        </UiFormField>
      </div>

      <UiFormField
        label="Profissional"
        hint="Filtra por profissional responsável (opcional)."
      >
        <template #default="{ id, describedBy }">
          <input
            :id="id"
            :value="f.values.professional_id"
            type="text"
            name="professional_id"
            autocomplete="off"
            placeholder="Id do profissional"
            :aria-describedby="describedBy"
            @input="f.setField('professional_id', $event.target.value)"
          />
        </template>
      </UiFormField>
    </form>

    <template #footer>
      <UiButton variant="ghost" :disabled="f.submitting.value" @click="generateOpen = false">Cancelar</UiButton>
      <UiButton variant="primary" :loading="f.submitting.value" @click="submitGenerate">Solicitar relatório</UiButton>
    </template>
  </UiModal>

  <!-- Modal: Visualizar relatório -->
  <UiModal
    v-model:open="viewOpen"
    :title="viewTitle"
    width="lg"
  >
    <UiLoadingState v-if="viewLoading" variant="skeleton" :skeleton-lines="6" />
    <UiErrorState
      v-else-if="viewError"
      :message="viewError"
      retryable
      @retry="reloadView"
    />
    <div v-else-if="viewReport" class="rl-detail">
      <div class="rl-detail-head">
        <UiStatusBadge
          :status="viewReport.status"
          :tone="statusTone(viewReport.status)"
          :label="statusText(viewReport.status)"
          size="lg"
        />
        <UiButton
          v-if="isCompleted(viewReport)"
          variant="ghost"
          size="sm"
          :loading="downloadingId === viewReport.id"
          @click="download(viewReport)"
        >Baixar JSON</UiButton>
      </div>

      <dl class="rl-meta">
        <div class="rl-meta-row">
          <dt>Paciente</dt>
          <dd>{{ viewReport.patient_id || '—' }}</dd>
        </div>
        <div class="rl-meta-row">
          <dt>Solicitado em</dt>
          <dd>{{ formatDateTime(viewReport.created_at) }}</dd>
        </div>
        <div class="rl-meta-row">
          <dt>Concluído em</dt>
          <dd>{{ viewReport.completed_at ? formatDateTime(viewReport.completed_at) : '—' }}</dd>
        </div>
        <div class="rl-meta-row">
          <dt>Solicitado por</dt>
          <dd>{{ viewReport.created_by || '—' }}</dd>
        </div>
        <div v-if="filtersSummary(viewReport)" class="rl-meta-row">
          <dt>Filtros</dt>
          <dd>{{ filtersSummary(viewReport) }}</dd>
        </div>
      </dl>

      <div v-if="isError(viewReport)" class="rl-error-box" role="alert">
        <span class="rl-error-title">Falha ao gerar este relatório</span>
        <span class="rl-error-msg">{{ viewReport.error_message || 'Erro não detalhado pelo processador.' }}</span>
      </div>

      <section v-if="viewReport.report_data" class="rl-data" aria-label="Conteúdo do relatório">
        <h3 class="rl-data-title">Conteúdo</h3>
        <pre class="rl-pre">{{ prettyData(viewReport.report_data) }}</pre>
      </section>
      <UiEmptyState
        v-else-if="!isError(viewReport)"
        title="Ainda sem conteúdo"
        description="Este relatório ainda não foi processado. Atualize em instantes."
        icon="⏳"
      />
    </div>

    <template #footer>
      <UiButton variant="ghost" @click="viewOpen = false">Fechar</UiButton>
    </template>
  </UiModal>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import {
  UiPageLayout,
  UiDataTable,
  UiFiltersPanel,
  UiMetricCard,
  UiStatusBadge,
  UiButton,
  UiModal,
  UiFormField,
  UiLoadingState,
  UiErrorState,
  UiEmptyState,
  useToast,
  useConfirm,
  useForm,
  validators,
  format,
} from '../ui/index.js';
import * as api from '../api.js';

// Recurso REST garantido pelo integrador (resourceFactory('patient-reports') → /v1/patient-reports).
// Acesso por colchetes porque o nome do export tem hífen; fallback defensivo p/ a fábrica.
const reports = api['patient-reports'] || api.resourceFactory('patient-reports');
const toast = useToast();
const ask = useConfirm();
const { formatNumber, formatDateTime, humanize } = format;

// ── Rótulos canônicos dos status (backend usa 'failed'; o domínio chama de 'erro') ──
const STATUS_LABELS = {
  queued: 'Em fila',
  processing: 'Processando',
  completed: 'Concluído',
  error: 'Erro',
  failed: 'Erro',
};
const STATUS_TONES = {
  queued: 'warning',
  processing: 'running',
  completed: 'success',
  error: 'error',
  failed: 'error',
};
const normStatus = (s) => String(s || '').toLowerCase();
const statusText = (s) => STATUS_LABELS[normStatus(s)] || humanize(s);
const statusTone = (s) => STATUS_TONES[normStatus(s)] || 'neutral';
const isCompleted = (row) => normStatus(row && row.status) === 'completed';
const isError = (row) => {
  const k = normStatus(row && row.status);
  return k === 'error' || k === 'failed';
};

// ── Colunas (humanize do contrato) ──
const columns = [
  { key: 'id', label: 'Relatório', sortable: true },
  { key: 'patient_id', label: 'Paciente', sortable: true },
  { key: 'status', label: 'Status', sortable: true },
  { key: 'created_at', label: 'Solicitado em', sortable: true },
  { key: 'completed_at', label: 'Concluído em', sortable: true },
  { key: 'actions', label: 'Ações', align: 'right' },
];

const filterFields = [
  { key: 'patient_id', label: 'Paciente', type: 'text', placeholder: 'patient_id…' },
  {
    key: 'status',
    label: 'Status',
    type: 'select',
    options: [
      { value: 'queued', label: 'Em fila' },
      { value: 'processing', label: 'Processando' },
      { value: 'completed', label: 'Concluído' },
      { value: 'error', label: 'Erro' },
    ],
  },
];

// ── Estado da lista (paginação/ordenação/filtro server-side) ──
const rows = ref([]);
const total = ref(0);
const loading = ref(false);
const error = ref(null);

const page = ref(1);
const pageSize = ref(25);
const sort = ref({ key: 'created_at', dir: 'desc' });
const filters = ref({ patient_id: '', status: '' });

const hasActiveFilters = computed(() =>
  !!(String(filters.value.patient_id || '').trim() || String(filters.value.status || '').trim())
);

const errorMessage = computed(() => {
  if (!error.value) return null;
  return error.value.message || 'Não foi possível carregar os relatórios.';
});

// Contagens AGREGADAS por status (tenant inteiro [+ paciente]) — vêm do summary do backend
// (GET /v1/patient-reports → { data, total, summary }), não da página atual. 'error' = 'failed'.
const summary = ref({ queued: 0, processing: 0, completed: 0, failed: 0, total: 0 });
const counts = computed(() => ({
  total: summary.value.total,
  queued: summary.value.queued,
  processing: summary.value.processing,
  completed: summary.value.completed,
  error: summary.value.failed,
}));

const emptyState = computed(() =>
  hasActiveFilters.value
    ? {
        title: 'Nenhum relatório encontrado',
        description: 'Nenhum relatório corresponde aos filtros atuais. Ajuste a busca ou limpe os filtros.',
        icon: '◎',
      }
    : {
        title: 'Nenhum relatório ainda',
        description: 'Gere o primeiro relatório consolidado de evolução para um paciente.',
        icon: '＋',
      }
);

// Filtros SERVER-SIDE: a rota GET /v1/patient-reports aceita patient_id + status (+ page/pageSize/sort/dir).
// O backend usa 'failed'; a UI rotula de 'erro' (valor 'error' no filtro) → mapeia aqui.
function buildParams() {
  const p = {
    page: page.value,
    pageSize: pageSize.value,
    sort: sort.value.key === 'actions' ? 'created_at' : sort.value.key,
    dir: sort.value.dir,
  };
  const pid = String(filters.value.patient_id || '').trim();
  if (pid) p.patient_id = pid;
  const st = normStatus(filters.value.status);
  if (st) p.status = st === 'error' ? 'failed' : st;
  return p;
}

async function load() {
  loading.value = true;
  error.value = null;
  try {
    const res = await reports.list(buildParams());
    const data = Array.isArray(res) ? res : (res && res.data) || [];
    rows.value = data; // filtro de status agora é server-side (buildParams) — sem filtragem por página
    total.value = typeof (res && res.total) === 'number' ? res.total : data.length;
    if (res && res.summary) summary.value = res.summary;
  } catch (e) {
    error.value = e;
    rows.value = [];
    total.value = 0;
    summary.value = { queued: 0, processing: 0, completed: 0, failed: 0, total: 0 };
    toast.error(errorMessage.value);
  } finally {
    loading.value = false;
  }
}

async function reload() {
  await load();
  if (!error.value) toast.success('Lista de relatórios atualizada.');
}

function onSort(s) {
  sort.value = s;
  page.value = 1;
  load();
}
function onPage(p) {
  page.value = p;
  load();
}
function onPageSize(size) {
  pageSize.value = size;
  page.value = 1;
  load();
}
function applyFilters(values) {
  filters.value = {
    patient_id: (values && values.patient_id) || '',
    status: (values && values.status) || '',
  };
  page.value = 1;
  load();
}
function clearFilters() {
  filters.value = { patient_id: '', status: '' };
  page.value = 1;
  load();
}

// ── Gerar relatório (modal + POST) ──
// Estado, validação e anti-duplo-submit pelo composable do kit (padrão SICAT/GymOps).
const generateOpen = ref(false);

// Regra de intervalo: data final não pode ser anterior à inicial (ambas opcionais).
// Um "rule" do kit é uma função pura (v, all) => '' | 'mensagem'.
const dateRangeRule = (v, all) => {
  if (!all.date_from || !v) return '';
  const a = new Date(all.date_from).getTime();
  const b = new Date(v).getTime();
  return isFinite(a) && isFinite(b) && a > b ? 'A data final deve ser posterior à inicial.' : '';
};

const f = useForm({
  initial: { patient_id: '', date_from: '', date_to: '', professional_id: '' },
  rules: {
    patient_id: [validators.required('Informe o paciente.')],
    date_to: [dateRangeRule],
  },
});

function openGenerate() {
  f.reset();
  generateOpen.value = true;
}

function submitGenerate() {
  return f.handleSubmit(async (vals) => {
    try {
      const payload = { patient_id: String(vals.patient_id).trim() };
      if (vals.date_from) payload.date_from = vals.date_from;
      if (vals.date_to) payload.date_to = vals.date_to;
      const prof = String(vals.professional_id || '').trim();
      if (prof) payload.professional_id = prof;
      await reports.create(payload);
      toast.success('Relatório solicitado. Ele aparecerá na lista assim que for processado.');
      generateOpen.value = false;
      f.reset();
      page.value = 1;
      await load();
    } catch (e) {
      toast.error((e && e.message) || 'Não foi possível solicitar o relatório.');
    }
  });
}

// ── Visualizar relatório (modal + GET por id) ──
const viewOpen = ref(false);
const viewLoading = ref(false);
const viewError = ref(null);
const viewReport = ref(null);
const viewId = ref(null);

const viewTitle = computed(() =>
  viewId.value ? 'Relatório #' + viewId.value : 'Relatório'
);

async function fetchView(id) {
  viewLoading.value = true;
  viewError.value = null;
  try {
    viewReport.value = await reports.get(id);
  } catch (e) {
    viewError.value = (e && e.message) || 'Não foi possível carregar o relatório.';
    viewReport.value = null;
  } finally {
    viewLoading.value = false;
  }
}

function view(row) {
  viewId.value = row.id;
  viewReport.value = row; // mostra o que já temos enquanto busca o detalhe
  viewOpen.value = true;
  fetchView(row.id);
}

function reloadView() {
  if (viewId.value != null) fetchView(viewId.value);
}

function filtersSummary(report) {
  const f = report && report.filters;
  if (!f || typeof f !== 'object') return '';
  const bits = [];
  if (f.dateFrom || f.date_from) bits.push('de ' + format.formatDate(f.dateFrom || f.date_from));
  if (f.dateTo || f.date_to) bits.push('até ' + format.formatDate(f.dateTo || f.date_to));
  if (f.professionalId || f.professional_id) bits.push('prof. ' + (f.professionalId || f.professional_id));
  if (f.type) bits.push('tipo ' + f.type);
  return bits.join('  ·  ');
}

function prettyData(data) {
  try {
    return JSON.stringify(data, null, 2);
  } catch {
    return String(data);
  }
}

// ── Baixar relatório (Blob, CSP-safe) ──
const downloadingId = ref(null);

async function download(row) {
  if (downloadingId.value) return;
  downloadingId.value = row.id;
  try {
    // Garante o conteúdo completo (a lista não traz report_data).
    let report = row;
    if (!report.report_data) report = await reports.get(row.id);
    const blob = new Blob([prettyData(report.report_data ?? report)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'relatorio-' + row.id + '.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success('Download iniciado.');
  } catch (e) {
    toast.error((e && e.message) || 'Não foi possível baixar o relatório.');
  } finally {
    downloadingId.value = null;
  }
}

// ── Remover relatório (destrutivo → confirmação) ──
const removingId = ref(null);

async function remove(row) {
  const ok = await ask({
    title: 'Remover relatório',
    message: 'Remover o relatório #' + row.id + '? Esta ação não pode ser desfeita.',
    confirmLabel: 'Remover',
    danger: true,
  });
  if (!ok) return;
  removingId.value = row.id;
  try {
    await reports.remove(row.id);
    toast.success('Relatório removido.');
    if (viewOpen.value && viewId.value === row.id) viewOpen.value = false;
    // Se a página ficar vazia após remover, volta uma página.
    if (rows.value.length === 1 && page.value > 1) page.value -= 1;
    await load();
  } catch (e) {
    toast.error((e && e.message) || 'Não foi possível remover o relatório.');
  } finally {
    removingId.value = null;
  }
}

onMounted(load);
</script>

<style scoped>
.rl-metrics {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: var(--ui-space-4);
}

.rl-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ui-space-3);
  flex-wrap: wrap;
  background: rgb(var(--ui-accent) / 0.08);
  border: 1px solid rgb(var(--ui-accent) / 0.28);
  border-radius: var(--ui-radius-lg);
  padding: var(--ui-space-3) var(--ui-space-4);
}

.rl-banner-text {
  color: rgb(var(--ui-fg));
  font-size: var(--ui-text-sm);
}

.rl-code {
  font-family: var(--ui-font-mono, monospace);
  font-weight: 600;
  color: rgb(var(--ui-fg));
}

.rl-patient {
  font-family: var(--ui-font-mono, monospace);
  font-size: var(--ui-text-sm);
}

.rl-when {
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.rl-sub {
  color: rgb(var(--ui-muted));
  font-size: var(--ui-text-xs);
}

.rl-actions {
  display: flex;
  gap: var(--ui-space-2);
  justify-content: flex-end;
  flex-wrap: wrap;
}

.rl-empty-actions {
  display: flex;
  gap: var(--ui-space-2);
  flex-wrap: wrap;
  justify-content: center;
}

/* ── Modal: formulário ── */
.rl-form {
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-4);
}

.rl-form-intro {
  margin: 0;
  color: rgb(var(--ui-muted));
  font-size: var(--ui-text-sm);
}

.rl-form-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--ui-space-4);
}

/* ── Modal: detalhe ── */
.rl-detail {
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-4);
}

.rl-detail-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ui-space-3);
  flex-wrap: wrap;
}

.rl-meta {
  margin: 0;
  display: grid;
  gap: var(--ui-space-2);
}

.rl-meta-row {
  display: grid;
  grid-template-columns: 140px 1fr;
  gap: var(--ui-space-3);
  align-items: baseline;
}

.rl-meta-row dt {
  color: rgb(var(--ui-muted));
  font-size: var(--ui-text-xs);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  font-weight: 600;
}

.rl-meta-row dd {
  margin: 0;
  color: rgb(var(--ui-fg));
  font-size: var(--ui-text-sm);
}

.rl-error-box {
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-1);
  background: rgb(var(--ui-danger) / 0.1);
  border: 1px solid rgb(var(--ui-danger) / 0.3);
  border-radius: var(--ui-radius-md);
  padding: var(--ui-space-3) var(--ui-space-4);
}

.rl-error-title {
  font-weight: 700;
  color: rgb(var(--ui-danger));
  font-size: var(--ui-text-sm);
}

.rl-error-msg {
  color: rgb(var(--ui-fg));
  font-size: var(--ui-text-sm);
}

.rl-data-title {
  margin: 0 0 var(--ui-space-2);
  font-size: var(--ui-text-sm);
  color: rgb(var(--ui-muted));
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.rl-pre {
  margin: 0;
  max-height: 320px;
  overflow: auto;
  background: rgb(var(--ui-surface-2));
  border: 1px solid rgb(var(--ui-border));
  border-radius: var(--ui-radius-md);
  padding: var(--ui-space-3);
  font-family: var(--ui-font-mono, monospace);
  font-size: var(--ui-text-xs);
  line-height: 1.5;
  color: rgb(var(--ui-fg));
  white-space: pre-wrap;
  word-break: break-word;
}

@media (max-width: 860px) {
  .rl-metrics {
    grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
    gap: var(--ui-space-3);
  }
  .rl-form-grid {
    grid-template-columns: 1fr;
  }
  .rl-meta-row {
    grid-template-columns: 1fr;
    gap: var(--ui-space-1);
  }
}
</style>
