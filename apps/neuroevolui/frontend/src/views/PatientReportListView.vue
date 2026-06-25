<template>
  <UiPageLayout
    eyebrow="Relatórios"
    title="Relatórios de Pacientes"
    subtitle="Lista consolidada de todos os relatórios solicitados. Filtre por paciente, status de geração ou período. Baixe quando estiver pronto."
    width="wide"
    :error="errorMessage"
    @retry="reload"
  >
    <template #actions>
      <UiButton variant="ghost" :loading="loading" @click="reload">Atualizar</UiButton>
      <UiButton variant="primary" @click="openGenerate">Novo relatório</UiButton>
    </template>

    <!-- KPIs de status (toda a consulta, não só a página) -->
    <section class="prl-metrics" aria-label="Resumo de relatórios">
      <UiMetricCard
        label="Total"
        :value="loading ? null : formatNumber(counts.total)"
        :loading="loading"
        tone="primary"
        hint="Todos os relatórios"
      />
      <UiMetricCard
        label="Em fila"
        :value="loading ? null : formatNumber(counts.queued)"
        :loading="loading"
        tone="warning"
        hint="Aguardando processamento"
        :clickable="counts.queued > 0"
        @click="filterByStatus('queued')"
      />
      <UiMetricCard
        label="Processando"
        :value="loading ? null : formatNumber(counts.processing)"
        :loading="loading"
        tone="info"
        hint="Em geração agora"
        :clickable="counts.processing > 0"
        @click="filterByStatus('processing')"
      />
      <UiMetricCard
        label="Prontos"
        :value="loading ? null : formatNumber(counts.ready)"
        :loading="loading"
        tone="success"
        hint="Disponíveis para download"
        :clickable="counts.ready > 0"
        @click="filterByStatus('ready')"
      />
      <UiMetricCard
        label="Com erro"
        :value="loading ? null : formatNumber(counts.error)"
        :loading="loading"
        tone="error"
        hint="Falha ao gerar"
        :clickable="counts.error > 0"
        @click="filterByStatus('error')"
      />
    </section>

    <!-- Filtros: paciente, status, período -->
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
      <div class="prl-banner" role="status">
        <span class="prl-banner-text">
          Filtrando
          <strong v-if="filters.patient_id">paciente {{ filters.patient_id }}</strong>
          <template v-if="filters.patient_id && filters.status"> · </template>
          <strong v-if="filters.status">{{ statusText(filters.status) }}</strong>
          <template v-if="(filters.patient_id || filters.status) && (filters.date_from || filters.date_to)"> · </template>
          <template v-if="filters.date_from || filters.date_to">
            período
            <strong v-if="filters.date_from">de {{ formatDate(filters.date_from) }}</strong>
            <strong v-if="filters.date_to"> até {{ formatDate(filters.date_to) }}</strong>
          </template>
        </span>
        <UiButton variant="subtle" size="sm" @click="clearFilters">Limpar filtros</UiButton>
      </div>
    </template>

    <!-- Tabela com todos os estados cobertos -->
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
      <!-- ID do relatório (monospace) -->
      <template #cell-id="{ value }">
        <span class="prl-code">#{{ value }}</span>
      </template>

      <!-- Paciente: identificador em destaque -->
      <template #cell-patient_id="{ row }">
        <div class="prl-patient">
          <span class="prl-avatar" aria-hidden="true">{{ patientInitials(row.patient_id) }}</span>
          <span class="prl-patient-info">
            <span class="prl-patient-id">{{ row.patient_id || '—' }}</span>
            <span v-if="row.professional_id" class="prl-sub">Prof: {{ row.professional_id }}</span>
          </span>
        </div>
      </template>

      <!-- Tipo de nota (se houver) -->
      <template #cell-type="{ value }">
        <span v-if="value" class="prl-type-badge">{{ value }}</span>
        <span v-else class="prl-sub">—</span>
      </template>

      <!-- Período solicitado -->
      <template #cell-period="{ row }">
        <div class="prl-period">
          <template v-if="row.date_from || row.date_to">
            <span class="prl-period-range">
              <span v-if="row.date_from">{{ formatDate(row.date_from) }}</span>
              <span v-else class="prl-sub">início</span>
              <span class="prl-period-sep" aria-hidden="true">→</span>
              <span v-if="row.date_to">{{ formatDate(row.date_to) }}</span>
              <span v-else class="prl-sub">hoje</span>
            </span>
          </template>
          <span v-else class="prl-sub">Todo o histórico</span>
        </div>
      </template>

      <!-- Status com badge colorido -->
      <template #cell-status="{ value }">
        <UiStatusBadge
          :status="value"
          :tone="statusTone(value)"
          :label="statusText(value)"
          with-dot
        />
      </template>

      <!-- Solicitado em -->
      <template #cell-created_at="{ value }">
        <span class="prl-when">{{ formatDateTime(value) }}</span>
      </template>

      <!-- Ações por linha -->
      <template #cell-actions="{ row }">
        <div class="prl-actions">
          <UiButton
            variant="subtle"
            size="sm"
            @click.stop="openView(row)"
          >Ver</UiButton>
          <UiButton
            v-if="isReady(row)"
            variant="ghost"
            size="sm"
            :loading="downloadingId === row.id"
            @click.stop="download(row)"
          >Baixar</UiButton>
          <UiButton
            variant="danger"
            size="sm"
            :loading="removingId === row.id"
            :disabled="(!!removingId && removingId !== row.id) || isInProgress(row)"
            :title="isInProgress(row) ? 'Não é possível remover um relatório em processamento.' : undefined"
            @click.stop="removeReport(row)"
          >Remover</UiButton>
        </div>
      </template>

      <template #empty-action>
        <div class="prl-empty-actions">
          <UiButton v-if="hasActiveFilters" variant="ghost" @click="clearFilters">Limpar filtros</UiButton>
          <UiButton variant="primary" @click="openGenerate">Gerar relatório</UiButton>
        </div>
      </template>
    </UiDataTable>

    <template #footer>
      <span>Relatórios são processados de forma assíncrona. Atualize a lista para acompanhar o status de geração.</span>
    </template>
  </UiPageLayout>

  <!-- Modal: Novo relatório -->
  <UiModal
    v-model:open="generateOpen"
    title="Novo relatório"
    width="md"
    :persistent="f.submitting.value"
  >
    <form class="prl-form" novalidate @submit.prevent="submitGenerate">
      <p class="prl-form-intro">
        Solicite um relatório consolidado de evolução para um paciente. O período e o tipo de nota são opcionais.
      </p>

      <UiFormField
        label="Paciente"
        required
        :error="f.errors.patient_id"
        hint="Identificador do paciente (patient_id)."
      >
        <template #default="{ id, describedBy }">
          <UiInput
            :id="id"
            :model-value="f.values.patient_id"
            type="text"
            autocomplete="off"
            placeholder="Ex.: pat_001"
            :described-by="describedBy"
            :error="!!f.errors.patient_id"
            @update:model-value="f.setField('patient_id', $event)"
          />
        </template>
      </UiFormField>

      <UiFormField
        label="Profissional solicitante"
        :error="f.errors.professional_id"
        hint="Opcional — filtra notas pelo profissional."
      >
        <template #default="{ id, describedBy }">
          <UiInput
            :id="id"
            :model-value="f.values.professional_id"
            type="text"
            autocomplete="off"
            placeholder="Id do profissional"
            :described-by="describedBy"
            :error="!!f.errors.professional_id"
            @update:model-value="f.setField('professional_id', $event)"
          />
        </template>
      </UiFormField>

      <UiFormField
        label="Tipo de nota"
        :error="f.errors.type"
        hint="Opcional — ex.: evolucao, anamnese, avaliacao."
      >
        <template #default="{ id, describedBy }">
          <UiInput
            :id="id"
            :model-value="f.values.type"
            type="text"
            autocomplete="off"
            placeholder="Ex.: evolucao"
            :described-by="describedBy"
            :error="!!f.errors.type"
            @update:model-value="f.setField('type', $event)"
          />
        </template>
      </UiFormField>

      <div class="prl-form-grid">
        <UiFormField
          label="Período de"
          :error="f.errors.date_from"
          hint="Início (opcional)."
        >
          <template #default="{ id, describedBy }">
            <UiInput
              :id="id"
              :model-value="f.values.date_from"
              type="date"
              :described-by="describedBy"
              :error="!!f.errors.date_from"
              @update:model-value="f.setField('date_from', $event)"
            />
          </template>
        </UiFormField>

        <UiFormField
          label="Período até"
          :error="f.errors.date_to"
          hint="Fim (opcional)."
        >
          <template #default="{ id, describedBy }">
            <UiInput
              :id="id"
              :model-value="f.values.date_to"
              type="date"
              :described-by="describedBy"
              :error="!!f.errors.date_to"
              @update:model-value="f.setField('date_to', $event)"
            />
          </template>
        </UiFormField>
      </div>
    </form>

    <template #footer>
      <UiButton variant="ghost" :disabled="f.submitting.value" @click="generateOpen = false">Cancelar</UiButton>
      <UiButton variant="primary" :loading="f.submitting.value" @click="submitGenerate">Solicitar</UiButton>
    </template>
  </UiModal>

  <!-- Modal: Visualizar relatório -->
  <UiModal
    v-model:open="viewOpen"
    :title="viewTitle"
    width="lg"
  >
    <UiLoadingState v-if="viewLoading" variant="skeleton" :skeleton-lines="7" />
    <UiErrorState
      v-else-if="viewError"
      :message="viewError"
      retryable
      @retry="reloadView"
    />
    <div v-else-if="viewReport" class="prl-detail">
      <!-- Cabeçalho do detalhe: status + botão de download -->
      <div class="prl-detail-head">
        <UiStatusBadge
          :status="viewReport.status"
          :tone="statusTone(viewReport.status)"
          :label="statusText(viewReport.status)"
          with-dot
        />
        <UiButton
          v-if="isReady(viewReport)"
          variant="ghost"
          size="sm"
          :loading="downloadingId === viewReport.id"
          @click="download(viewReport)"
        >Baixar JSON</UiButton>
      </div>

      <!-- Metadados estruturados -->
      <dl class="prl-meta">
        <div class="prl-meta-row">
          <dt>Relatório</dt>
          <dd class="prl-code">#{{ viewReport.id }}</dd>
        </div>
        <div class="prl-meta-row">
          <dt>Paciente</dt>
          <dd>{{ viewReport.patient_id || '—' }}</dd>
        </div>
        <div v-if="viewReport.professional_id" class="prl-meta-row">
          <dt>Profissional</dt>
          <dd>{{ viewReport.professional_id }}</dd>
        </div>
        <div v-if="viewReport.type" class="prl-meta-row">
          <dt>Tipo de nota</dt>
          <dd>{{ viewReport.type }}</dd>
        </div>
        <div class="prl-meta-row">
          <dt>Período</dt>
          <dd>
            <template v-if="viewReport.date_from || viewReport.date_to">
              {{ viewReport.date_from ? formatDate(viewReport.date_from) : 'início' }}
              →
              {{ viewReport.date_to ? formatDate(viewReport.date_to) : 'hoje' }}
            </template>
            <template v-else>Todo o histórico</template>
          </dd>
        </div>
        <div class="prl-meta-row">
          <dt>Solicitado em</dt>
          <dd>{{ formatDateTime(viewReport.created_at) }}</dd>
        </div>
      </dl>

      <!-- Alerta de erro no relatório -->
      <div v-if="isErrorStatus(viewReport)" class="prl-error-box" role="alert">
        <span class="prl-error-title">Falha ao gerar este relatório</span>
        <span class="prl-error-msg">{{ viewReport.error_message || 'O processador não forneceu detalhes do erro.' }}</span>
      </div>

      <!-- Conteúdo do relatório (quando pronto) -->
      <section v-if="viewReport.report_data" class="prl-data" aria-label="Conteúdo do relatório">
        <h3 class="prl-data-title">Conteúdo gerado</h3>
        <pre class="prl-pre">{{ prettyJson(viewReport.report_data) }}</pre>
      </section>
      <UiEmptyState
        v-else-if="!isErrorStatus(viewReport)"
        title="Aguardando processamento"
        description="Este relatório ainda não foi concluído. Atualize em instantes para verificar o progresso."
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
  UiInput,
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

// Recurso REST garantido pelo integrador: resourceFactory('patient-reports') → GET /v1/patient-reports.
// Acesso via colchetes pois o nome do export contém hífen (ES named string export).
const reports = api['patient-reports'] || api.patientReports;

const toast = useToast();
const ask = useConfirm();
const { formatNumber, formatDate, formatDateTime, humanize } = format;

// ── Rótulos e tons canônicos do domínio ──────────────────────────────────────
// O backend expõe: queued | processing | ready | error
const STATUS_LABELS = {
  queued:     'Em fila',
  processing: 'Processando',
  ready:      'Pronto',
  error:      'Erro',
};
const STATUS_TONES = {
  queued:     'warning',
  processing: 'info',
  ready:      'success',
  error:      'error',
};
const norm = (s) => String(s || '').toLowerCase();
const statusText = (s) => STATUS_LABELS[norm(s)] || humanize(s);
const statusTone = (s) => STATUS_TONES[norm(s)] || 'neutral';
const isReady = (row) => norm(row && row.status) === 'ready';
const isErrorStatus = (row) => norm(row && row.status) === 'error';
const isInProgress = (row) => { const s = norm(row && row.status); return s === 'processing' || s === 'queued'; };

// ── Colunas da tabela ────────────────────────────────────────────────────────
const columns = [
  { key: 'id',         label: 'Relatório',    sortable: true },
  { key: 'patient_id', label: 'Paciente',     sortable: true },
  { key: 'type',       label: 'Tipo' },
  { key: 'period',     label: 'Período' },
  { key: 'status',     label: 'Status',       sortable: true },
  { key: 'created_at', label: 'Solicitado em',sortable: true, align: 'right' },
  { key: 'actions',    label: 'Ações',         align: 'right' },
];

// ── Campos de filtro ─────────────────────────────────────────────────────────
const filterFields = [
  {
    key: 'patient_id',
    label: 'Paciente',
    type: 'text',
    placeholder: 'patient_id…',
  },
  {
    key: 'status',
    label: 'Status',
    type: 'select',
    options: [
      { value: 'queued',     label: 'Em fila' },
      { value: 'processing', label: 'Processando' },
      { value: 'ready',      label: 'Pronto' },
      { value: 'error',      label: 'Erro' },
    ],
  },
  { key: 'date_from', label: 'Solicitado de', type: 'date' },
  { key: 'date_to',   label: 'Solicitado até', type: 'date' },
];

// ── Estado da lista (server-mode) ────────────────────────────────────────────
const rows      = ref([]);
const total     = ref(0);
const loading   = ref(false);
const error     = ref(null);
const page      = ref(1);
const pageSize  = ref(25);
const sort      = ref({ key: 'created_at', dir: 'desc' });
const filters   = ref({ patient_id: '', status: '', date_from: '', date_to: '' });

const hasActiveFilters = computed(() =>
  !!(
    String(filters.value.patient_id || '').trim() ||
    String(filters.value.status     || '').trim() ||
    String(filters.value.date_from  || '').trim() ||
    String(filters.value.date_to    || '').trim()
  )
);

const errorMessage = computed(() => {
  if (!error.value) return null;
  return (error.value && error.value.message) || 'Não foi possível carregar os relatórios.';
});

// KPIs: vêm do campo `summary` da resposta da API, se presente; caso contrário
// agregal a página corrente (comportamento degenerado mas não quebra a UI).
const summary = ref({ queued: 0, processing: 0, ready: 0, error: 0, total: 0 });
const counts = computed(() => ({
  total:      summary.value.total,
  queued:     summary.value.queued,
  processing: summary.value.processing,
  ready:      summary.value.ready,
  error:      summary.value.error,
}));

const emptyState = computed(() =>
  hasActiveFilters.value
    ? {
        title: 'Nenhum relatório encontrado',
        description: 'Nenhum relatório corresponde aos filtros aplicados. Ajuste a busca ou limpe os filtros.',
        icon: '◎',
      }
    : {
        title: 'Nenhum relatório ainda',
        description: 'Solicite o primeiro relatório consolidado de evolução para um paciente.',
        icon: '＋',
      }
);

// ── Auxiliares ───────────────────────────────────────────────────────────────
function patientInitials(patientId) {
  if (!patientId) return '?';
  const s = String(patientId).replace(/[^a-zA-Z0-9]/g, '');
  return s.slice(0, 2).toUpperCase() || '?';
}

function prettyJson(data) {
  try { return JSON.stringify(data, null, 2); }
  catch { return String(data); }
}

// ── Construção de params de listagem ─────────────────────────────────────────
function buildParams() {
  const p = {
    page:     page.value,
    pageSize: pageSize.value,
    sort:     sort.value.key === 'actions' || sort.value.key === 'period' ? 'created_at' : sort.value.key,
    dir:      sort.value.dir,
  };
  const pid = String(filters.value.patient_id || '').trim();
  if (pid) p.patient_id = pid;
  const st = norm(filters.value.status);
  if (st) p.status = st;
  const df = String(filters.value.date_from || '').trim();
  if (df) p.date_from = df;
  const dt = String(filters.value.date_to || '').trim();
  if (dt) p.date_to = dt;
  return p;
}

// ── Carga de dados ───────────────────────────────────────────────────────────
async function load() {
  loading.value = true;
  error.value   = null;
  try {
    const res  = await reports.list(buildParams());
    const data = Array.isArray(res) ? res : (res && res.data) || [];
    rows.value  = data;
    total.value = typeof (res && res.total) === 'number' ? res.total : data.length;
    if (res && res.summary) {
      summary.value = {
        queued:     res.summary.queued     || 0,
        processing: res.summary.processing || 0,
        ready:      res.summary.ready      || res.summary.completed || 0,
        error:      res.summary.error      || res.summary.failed    || 0,
        total:      res.summary.total      || total.value,
      };
    } else {
      // Agrega da página corrente como fallback
      const acc = { queued: 0, processing: 0, ready: 0, error: 0, total: total.value };
      for (const r of data) {
        const k = norm(r.status);
        if (k === 'queued')     acc.queued     += 1;
        else if (k === 'processing') acc.processing += 1;
        else if (k === 'ready')      acc.ready      += 1;
        else if (k === 'error')      acc.error      += 1;
      }
      summary.value = acc;
    }
  } catch (e) {
    error.value = e;
    rows.value  = [];
    total.value = 0;
    summary.value = { queued: 0, processing: 0, ready: 0, error: 0, total: 0 };
    toast.error(errorMessage.value);
  } finally {
    loading.value = false;
  }
}

async function reload() {
  await load();
  if (!error.value) toast.success('Lista de relatórios atualizada.');
}

// ── Handlers de paginação / ordenação / filtro ───────────────────────────────
function onSort(s)    { sort.value = s; page.value = 1; load(); }
function onPage(p)    { page.value = p; load(); }
function onPageSize(s){ pageSize.value = s; page.value = 1; load(); }

function applyFilters(values) {
  filters.value = {
    patient_id: (values && values.patient_id) || '',
    status:     (values && values.status)     || '',
    date_from:  (values && values.date_from)  || '',
    date_to:    (values && values.date_to)    || '',
  };
  page.value = 1;
  load();
}

function clearFilters() {
  filters.value = { patient_id: '', status: '', date_from: '', date_to: '' };
  page.value    = 1;
  load();
}

function filterByStatus(status) {
  filters.value = { ...filters.value, status };
  page.value    = 1;
  load();
}

// ── Modal: Gerar relatório ───────────────────────────────────────────────────
const generateOpen = ref(false);

const dateRangeRule = (v, all) => {
  if (!all.date_from || !v) return '';
  const a = new Date(all.date_from).getTime();
  const b = new Date(v).getTime();
  return isFinite(a) && isFinite(b) && a > b
    ? 'A data final deve ser posterior à inicial.'
    : '';
};

const f = useForm({
  initial: { patient_id: '', professional_id: '', type: '', date_from: '', date_to: '' },
  rules: {
    patient_id: [validators.required('Informe o paciente.')],
    date_to:    [dateRangeRule],
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
      const prof = String(vals.professional_id || '').trim();
      if (prof)         payload.professional_id = prof;
      const type = String(vals.type || '').trim();
      if (type)         payload.type = type;
      if (vals.date_from) payload.date_from = vals.date_from;
      if (vals.date_to)   payload.date_to   = vals.date_to;
      await reports.create(payload);
      toast.success('Relatório solicitado. Ele aparecerá na lista quando o processamento iniciar.');
      generateOpen.value = false;
      f.reset();
      page.value = 1;
      await load();
    } catch (e) {
      toast.error((e && e.message) || 'Não foi possível solicitar o relatório.');
    }
  });
}

// ── Modal: Visualizar relatório ──────────────────────────────────────────────
const viewOpen    = ref(false);
const viewLoading = ref(false);
const viewError   = ref(null);
const viewReport  = ref(null);
const viewId      = ref(null);

const viewTitle = computed(() =>
  viewId.value != null ? 'Relatório #' + viewId.value : 'Relatório'
);

async function fetchView(id) {
  viewLoading.value = true;
  viewError.value   = null;
  try {
    viewReport.value = await reports.get(id);
  } catch (e) {
    viewError.value = (e && e.message) || 'Não foi possível carregar o detalhe do relatório.';
    viewReport.value = null;
  } finally {
    viewLoading.value = false;
  }
}

function openView(row) {
  viewId.value     = row.id;
  viewReport.value = row; // exibe o que temos imediatamente; substitui após fetch
  viewOpen.value   = true;
  fetchView(row.id);
}

function reloadView() {
  if (viewId.value != null) fetchView(viewId.value);
}

// ── Download (Blob, CSP-safe) ────────────────────────────────────────────────
const downloadingId = ref(null);

async function download(row) {
  if (downloadingId.value) return;
  downloadingId.value = row.id;
  try {
    let data = row;
    // A listagem pode não trazer report_data; buscamos o detalhe completo.
    if (!data.report_data) data = await reports.get(row.id);
    const blob = new Blob([prettyJson(data.report_data ?? data)], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
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

// ── Remover relatório (destrutivo → confirmação obrigatória) ─────────────────
const removingId = ref(null);

async function removeReport(row) {
  const ok = await ask({
    title:        'Remover relatório',
    message:      'Remover o relatório #' + row.id + ' do paciente ' + (row.patient_id || row.id) + '? Esta ação não pode ser desfeita.',
    confirmLabel: 'Remover',
    danger:       true,
  });
  if (!ok) return;
  removingId.value = row.id;
  try {
    await reports.remove(row.id);
    toast.success('Relatório #' + row.id + ' removido.');
    if (viewOpen.value && viewId.value === row.id) viewOpen.value = false;
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
/* ── KPIs ──────────────────────────────────────────────────────────────────── */
.prl-metrics {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: var(--ui-space-3);
}

/* ── Banner de filtro ativo ────────────────────────────────────────────────── */
.prl-banner {
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

.prl-banner-text {
  color: rgb(var(--ui-fg));
  font-size: var(--ui-text-sm);
}

/* ── Célula: código do relatório ───────────────────────────────────────────── */
.prl-code {
  font-family: var(--ui-font-mono, monospace);
  font-weight: 600;
  font-size: var(--ui-text-sm);
  color: rgb(var(--ui-fg));
}

/* ── Célula: paciente ──────────────────────────────────────────────────────── */
.prl-patient {
  display: flex;
  align-items: center;
  gap: var(--ui-space-2);
  min-width: 0;
}

.prl-avatar {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  /* 30px → var(--ui-space-8) (kit: 1rem = 16px × 2 = 32px ≈ 30px; exceção justificada se token ausente) */
  width: var(--ui-space-8, 2rem);
  height: var(--ui-space-8, 2rem);
  flex: 0 0 auto;
  border-radius: var(--ui-radius-md);
  background: rgb(var(--ui-accent) / 0.14);
  color: rgb(var(--ui-accent-strong));
  font-size: var(--ui-text-xs);
  font-weight: 700;
  /* letter-spacing sem token de kit — exceção justificada: avatar monogram */
  letter-spacing: 0.02em;
}

.prl-patient-info {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.prl-patient-id {
  font-family: var(--ui-font-mono, monospace);
  font-size: var(--ui-text-sm);
  font-weight: 600;
  color: rgb(var(--ui-fg));
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* ── Célula: tipo de nota ──────────────────────────────────────────────────── */
.prl-type-badge {
  display: inline-block;
  background: rgb(var(--ui-surface-2));
  border: 1px solid rgb(var(--ui-border));
  border-radius: var(--ui-radius-sm);
  /* padding vertical 1px sem token equivalente — exceção justificada: badge compacto */
  padding: 1px var(--ui-space-2);
  font-size: var(--ui-text-xs);
  font-weight: 500;
  color: rgb(var(--ui-fg));
  text-transform: capitalize;
  white-space: nowrap;
}

/* ── Célula: período ───────────────────────────────────────────────────────── */
.prl-period {
  min-width: 0;
}

.prl-period-range {
  display: flex;
  align-items: center;
  gap: var(--ui-space-1);
  flex-wrap: nowrap;
  font-variant-numeric: tabular-nums;
  font-size: var(--ui-text-sm);
  white-space: nowrap;
  color: rgb(var(--ui-fg));
}

.prl-period-sep {
  color: rgb(var(--ui-muted));
  font-size: var(--ui-text-xs);
}

/* ── Célula: data/hora ─────────────────────────────────────────────────────── */
.prl-when {
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  font-size: var(--ui-text-sm);
  color: rgb(var(--ui-fg));
}

/* ── Texto secundário / placeholder ───────────────────────────────────────── */
.prl-sub {
  color: rgb(var(--ui-muted));
  font-size: var(--ui-text-xs);
}

/* ── Ações por linha ───────────────────────────────────────────────────────── */
.prl-actions {
  display: flex;
  gap: var(--ui-space-2);
  justify-content: flex-end;
  flex-wrap: wrap;
}

/* ── Empty state: ações ────────────────────────────────────────────────────── */
.prl-empty-actions {
  display: flex;
  gap: var(--ui-space-2);
  flex-wrap: wrap;
  justify-content: center;
}

/* ── Modal: formulário ─────────────────────────────────────────────────────── */
.prl-form {
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-4);
}

.prl-form-intro {
  margin: 0;
  color: rgb(var(--ui-muted));
  font-size: var(--ui-text-sm);
}

.prl-form-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--ui-space-4);
}

/* ── Modal: detalhe ────────────────────────────────────────────────────────── */
.prl-detail {
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-4);
}

.prl-detail-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ui-space-3);
  flex-wrap: wrap;
}

.prl-meta {
  margin: 0;
  display: grid;
  gap: var(--ui-space-2);
}

.prl-meta-row {
  display: grid;
  /* 140px fixo → max-content deixa o dt crescer com o conteúdo sem valor arbitrário */
  grid-template-columns: max-content 1fr;
  gap: var(--ui-space-3);
  align-items: baseline;
}

.prl-meta-row dt {
  color: rgb(var(--ui-muted));
  font-size: var(--ui-text-xs);
  text-transform: uppercase;
  /* letter-spacing sem token de kit — exceção justificada: label uppercase legibilidade */
  letter-spacing: 0.04em;
  font-weight: 600;
}

.prl-meta-row dd {
  margin: 0;
  color: rgb(var(--ui-fg));
  font-size: var(--ui-text-sm);
}

/* ── Caixa de erro do relatório ────────────────────────────────────────────── */
.prl-error-box {
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-1);
  background: rgb(var(--ui-danger) / 0.1);
  border: 1px solid rgb(var(--ui-danger) / 0.3);
  border-radius: var(--ui-radius-md);
  padding: var(--ui-space-3) var(--ui-space-4);
}

.prl-error-title {
  font-weight: 700;
  color: rgb(var(--ui-danger));
  font-size: var(--ui-text-sm);
}

.prl-error-msg {
  color: rgb(var(--ui-fg));
  font-size: var(--ui-text-sm);
}

/* ── Conteúdo do relatório (pre) ───────────────────────────────────────────── */
.prl-data-title {
  margin: 0 0 var(--ui-space-2);
  font-size: var(--ui-text-sm);
  color: rgb(var(--ui-muted));
  text-transform: uppercase;
  /* letter-spacing sem token de kit — exceção justificada: label uppercase legibilidade */
  letter-spacing: 0.04em;
  font-weight: 600;
}

.prl-pre {
  margin: 0;
  /* Sem max-height: o modal cresce com o conteúdo evitando scroll aninhado.
     overflow-x: auto cobre apenas linhas muito longas horizontalmente. */
  overflow-x: auto;
  overflow-y: hidden;
  background: rgb(var(--ui-surface-2));
  border: 1px solid rgb(var(--ui-border));
  border-radius: var(--ui-radius-md);
  padding: var(--ui-space-3);
  font-family: var(--ui-font-mono, monospace);
  font-size: var(--ui-text-xs);
  /* line-height sem token de kit — exceção justificada: pre mono legibilidade */
  line-height: 1.5;
  color: rgb(var(--ui-fg));
  white-space: pre-wrap;
  word-break: break-word;
}

/* ── Responsivo ────────────────────────────────────────────────────────────── */
/* Media queries em px: kit não expõe --ui-breakpoint-* como custom properties CSS;
   860px ≈ breakpoint-md, 520px ≈ breakpoint-sm — exceção justificada. */
@media (max-width: 860px) {
  .prl-metrics {
    grid-template-columns: repeat(3, 1fr);
  }

  .prl-form-grid {
    grid-template-columns: 1fr;
  }

  .prl-meta-row {
    grid-template-columns: 1fr;
    gap: var(--ui-space-1);
  }
}

@media (max-width: 520px) {
  .prl-metrics {
    grid-template-columns: repeat(2, 1fr);
  }
}
</style>
