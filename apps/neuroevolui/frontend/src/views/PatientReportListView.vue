<template>
  <UiPageLayout
    eyebrow="Relatórios"
    title="Relatórios de Pacientes"
    subtitle="Lista consolidada de todos os relatórios solicitados. Filtre por paciente, status ou período. Clique em uma linha para ver os detalhes."
    width="wide"
    :error="errorMessage"
    @retry="reload"
  >
    <template #actions>
      <UiButton variant="ghost" :loading="loading" @click="reload">Atualizar</UiButton>
      <UiButton variant="primary" to="/patient-reports/new">Solicitar Relatório</UiButton>
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
      clickable-rows
      :empty="emptyState"
      @row-click="openDetail"
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
      <template #cell-report_type="{ row }">
        <span v-if="reportType(row)" class="prl-type-badge">{{ reportType(row) }}</span>
        <span v-else class="prl-sub">—</span>
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

      <!-- Criado em (formato dd/MM/yyyy HH:mm) -->
      <template #cell-created_at="{ value }">
        <span class="prl-when">{{ formatDateTime(value) }}</span>
      </template>

      <!-- Ações por linha -->
      <template #cell-actions="{ row }">
        <div class="prl-actions">
          <UiButton
            variant="subtle"
            size="sm"
            @click.stop="openDetail(row)"
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
          <UiButton variant="primary" to="/patient-reports/new">Solicitar Relatório</UiButton>
        </div>
      </template>
    </UiDataTable>

    <template #footer>
      <span>Relatórios são processados de forma assíncrona. Atualize a lista para acompanhar o status de geração.</span>
    </template>
  </UiPageLayout>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import {
  UiPageLayout,
  UiDataTable,
  UiFiltersPanel,
  UiMetricCard,
  UiStatusBadge,
  UiButton,
  useToast,
  useConfirm,
  format,
} from '../ui/index.js';
import * as api from '../api.js';

const reports = api['patient-reports'] || api.patientReports;

const router = useRouter();
const route  = useRoute();
const toast  = useToast();
const ask    = useConfirm();
const { formatNumber, formatDate, formatDateTime, humanize } = format;

// ── Rótulos e tons canônicos do domínio ──────────────────────────────────────
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
const statusText  = (s) => STATUS_LABELS[norm(s)] || humanize(s);
const statusTone  = (s) => STATUS_TONES[norm(s)] || 'neutral';
const isReady      = (row) => norm(row && row.status) === 'ready';
const isInProgress = (row) => { const s = norm(row && row.status); return s === 'processing' || s === 'queued'; };

// Tipo de relatório — campo direto (`type`) ou dentro de `filters` (JSON).
function reportType(row) {
  if (!row) return '';
  if (row.type) return String(row.type);
  if (row.filters && row.filters.type) return String(row.filters.type);
  if (typeof row.filters === 'string') {
    try { const f = JSON.parse(row.filters); return f.type ? String(f.type) : ''; } catch { return ''; }
  }
  return '';
}

// ── Colunas da tabela ────────────────────────────────────────────────────────
const columns = [
  { key: 'id',          label: 'Relatório',     sortable: true },
  { key: 'patient_id',  label: 'Paciente',      sortable: true },
  { key: 'report_type', label: 'Tipo' },
  { key: 'status',      label: 'Status',        sortable: true },
  { key: 'created_at',  label: 'Solicitado em', sortable: true, align: 'right' },
  { key: 'actions',     label: 'Ações',          align: 'right' },
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

const summary = ref({ queued: 0, processing: 0, ready: 0, error: 0, total: 0 });
const counts  = computed(() => ({
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

// ── Query params: sync bidireccional ─────────────────────────────────────────
function filtersToQuery() {
  const q = {};
  const pid = String(filters.value.patient_id || '').trim();
  if (pid) q.patient_id = pid;
  const st = norm(filters.value.status);
  if (st) q.status = st;
  const df = String(filters.value.date_from || '').trim();
  if (df) q.date_from = df;
  const dt = String(filters.value.date_to || '').trim();
  if (dt) q.date_to = dt;
  return q;
}

function readFiltersFromQuery() {
  const q = route.query || {};
  return {
    patient_id: String(q.patient_id || ''),
    status:     String(q.status     || ''),
    date_from:  String(q.date_from  || ''),
    date_to:    String(q.date_to    || ''),
  };
}

// ── Construção de params de listagem ─────────────────────────────────────────
function buildParams() {
  const p = {
    page:     page.value,
    pageSize: pageSize.value,
    sort:     sort.value.key === 'actions' || sort.value.key === 'report_type' ? 'created_at' : sort.value.key,
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
      const acc = { queued: 0, processing: 0, ready: 0, error: 0, total: total.value };
      for (const r of data) {
        const k = norm(r.status);
        if (k === 'queued')          acc.queued     += 1;
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
function onSort(s)     { sort.value = s; page.value = 1; load(); }
function onPage(p)     { page.value = p; load(); }
function onPageSize(s) { pageSize.value = s; page.value = 1; load(); }

function applyFilters(values) {
  filters.value = {
    patient_id: (values && values.patient_id) || '',
    status:     (values && values.status)     || '',
    date_from:  (values && values.date_from)  || '',
    date_to:    (values && values.date_to)    || '',
  };
  page.value = 1;
  router.replace({ query: filtersToQuery() });
  load();
}

function clearFilters() {
  filters.value = { patient_id: '', status: '', date_from: '', date_to: '' };
  page.value    = 1;
  router.replace({ query: {} });
  load();
}

function filterByStatus(status) {
  filters.value = { ...filters.value, status };
  page.value    = 1;
  router.replace({ query: filtersToQuery() });
  load();
}

// ── Navegação para detalhe ────────────────────────────────────────────────────
function openDetail(row) {
  router.push('/patient-reports/' + row.id);
}

// ── Download (Blob, CSP-safe) ────────────────────────────────────────────────
const downloadingId = ref(null);

async function download(row) {
  if (downloadingId.value) return;
  downloadingId.value = row.id;
  try {
    let data = row;
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

// ── Remover relatório ────────────────────────────────────────────────────────
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
    if (rows.value.length === 1 && page.value > 1) page.value -= 1;
    await load();
  } catch (e) {
    toast.error((e && e.message) || 'Não foi possível remover o relatório.');
  } finally {
    removingId.value = null;
  }
}

onMounted(() => {
  filters.value = readFiltersFromQuery();
  load();
});
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
  width: var(--ui-space-8, 2rem);
  height: var(--ui-space-8, 2rem);
  flex: 0 0 auto;
  border-radius: var(--ui-radius-md);
  background: rgb(var(--ui-accent) / 0.14);
  color: rgb(var(--ui-accent-strong));
  font-size: var(--ui-text-xs);
  font-weight: 700;
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

/* ── Célula: tipo de relatório ─────────────────────────────────────────────── */
.prl-type-badge {
  display: inline-block;
  background: rgb(var(--ui-surface-2));
  border: 1px solid rgb(var(--ui-border));
  border-radius: var(--ui-radius-sm);
  padding: 1px var(--ui-space-2);
  font-size: var(--ui-text-xs);
  font-weight: 500;
  color: rgb(var(--ui-fg));
  text-transform: capitalize;
  white-space: nowrap;
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

/* ── Responsivo ────────────────────────────────────────────────────────────── */
/* 860px ≈ breakpoint-md, 520px ≈ breakpoint-sm */
@media (max-width: 860px) {
  .prl-metrics {
    grid-template-columns: repeat(3, 1fr);
  }
}

@media (max-width: 520px) {
  .prl-metrics {
    grid-template-columns: repeat(2, 1fr);
  }
}
</style>
