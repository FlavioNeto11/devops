<template>
  <UiPageLayout
    title="Notas Fiscais"
    eyebrow="Módulo Fiscal"
    subtitle="Gerencie as notas fiscais emitidas pelo tenant. Acompanhe status, impostos e chaves SEFAZ."
    width="wide"
    :error="r.error.value ? (r.error.value.message || 'Erro ao carregar notas fiscais') : null"
    @retry="r.load"
  >
    <!-- ── ações do cabeçalho ── -->
    <template #actions>
      <UiButton variant="primary" to="/nf/new">
        Emitir Nota Fiscal
      </UiButton>
    </template>

    <!-- ── filtros ── -->
    <template #filters>
      <UiFiltersPanel
        v-model="filters"
        :fields="filterFields"
        @apply="applyFilters"
        @clear="clearFilters"
      />
    </template>

    <!-- ── cards de resumo por status ── -->
    <div class="nf-kpi-row" role="region" aria-label="Resumo de notas fiscais por status">
      <div
        v-for="kpi in kpiCardsWithCount"
        :key="kpi.key"
        class="nf-kpi-card"
        :data-tone="kpi.tone"
        :data-active="activeStatusFilter === kpi.key"
        role="button"
        tabindex="0"
        :aria-pressed="activeStatusFilter === kpi.key ? 'true' : 'false'"
        :aria-label="kpi.label + ': ' + kpi.count + ' notas'"
        @click="toggleStatusFilter(kpi.key)"
        @keydown.enter="toggleStatusFilter(kpi.key)"
        @keydown.space.prevent="toggleStatusFilter(kpi.key)"
      >
        <span class="nf-kpi-icon" aria-hidden="true">{{ kpi.iconChar }}</span>
        <span class="nf-kpi-count">{{ kpi.count }}</span>
        <span class="nf-kpi-label">{{ kpi.label }}</span>
      </div>
    </div>

    <!-- ── tabela principal ── -->
    <UiDataTable
      :columns="columns"
      :rows="r.items.value"
      :loading="r.loading.value"
      row-key="id"
      clickable-rows
      server-mode
      :sort="r.sort.value"
      :page="r.page.value"
      :page-size="r.pageSize.value"
      :total="r.total.value"
      paginated
      :empty="{
        title: 'Nenhuma nota fiscal encontrada',
        description: 'Emita a primeira nota fiscal do tenant ou ajuste os filtros aplicados.',
      }"
      @update:sort="r.setSort"
      @update:page="r.setPage"
      @row-click="openNf"
    >
      <!-- número NF -->
      <template #cell-numero_nf="{ value }">
        <span class="nf-number">{{ value || '—' }}</span>
      </template>

      <!-- série -->
      <template #cell-serie="{ value }">
        <span class="nf-serie-tag">{{ value || '—' }}</span>
      </template>

      <!-- cliente -->
      <template #cell-destinatario_razao_social="{ value }">
        <span class="nf-client">{{ value || '—' }}</span>
      </template>

      <!-- data de emissão -->
      <template #cell-data_emissao="{ value }">
        <span class="nf-date">{{ value ? format.formatDate(value) : '—' }}</span>
      </template>

      <!-- status badge -->
      <template #cell-status="{ value }">
        <UiStatusBadge :status="value" with-dot />
      </template>

      <!-- total NF -->
      <template #cell-total_nf="{ value }">
        <span class="nf-currency">{{ value != null && value !== '' ? format.formatCurrency(value) : '—' }}</span>
      </template>

      <!-- total impostos -->
      <template #cell-total_impostos="{ value }">
        <span class="nf-currency nf-currency--tax">{{ value != null && value !== '' ? format.formatCurrency(value) : '—' }}</span>
      </template>

      <!-- chave SEFAZ -->
      <template #cell-chave_acesso="{ value }">
        <span v-if="value" class="nf-chave" :title="value">{{ truncateChave(value) }}</span>
        <span v-else class="nf-muted">—</span>
      </template>

      <!-- ações em linha -->
      <template #cell-_actions="{ row }">
        <span class="nf-row-actions">
          <button
            v-if="canCancel(row)"
            class="nf-action-btn nf-action-btn--cancel"
            :aria-label="'Cancelar nota fiscal ' + (row.numero_nf || row.id)"
            :disabled="actionLoading[row.id] === 'cancel'"
            @click.stop="cancelNf(row)"
          >
            <span v-if="actionLoading[row.id] === 'cancel'" class="nf-spin" aria-hidden="true" />
            <span v-else aria-hidden="true">&#x2715;</span>
            Cancelar
          </button>
        </span>
      </template>

      <!-- ação do estado vazio -->
      <template #empty-action>
        <UiButton variant="primary" to="/nf/new">
          Emitir primeira nota fiscal
        </UiButton>
      </template>
    </UiDataTable>
  </UiPageLayout>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import {
  UiPageLayout,
  UiDataTable,
  UiButton,
  UiFiltersPanel,
  UiStatusBadge,
  useResource,
  useToast,
  useConfirm,
  format,
} from '../ui/index.js';
import { resourceFactory, nfCancel, getNfReport } from '../api.js';

// ─── recurso REST (/v1/nf) ────────────────────────────────────────────────────
const nf = resourceFactory('nf');

// ─── composables ─────────────────────────────────────────────────────────────
const router = useRouter();
const toast = useToast();
const ask = useConfirm();
const r = useResource(nf);

// loading por linha (ação cancelar)
const actionLoading = reactive({});

// totalizadores reais vindos de GET /v1/nf/report (AC6)
const kpiSummary = ref({ rascunho: 0, processando: 0, emitida: 0, cancelada: 0, rejeitada: 0 });

async function loadKpiSummary() {
  try {
    const report = await getNfReport({});
    const resumo = (report && report.resumo) || {};
    kpiSummary.value = {
      rascunho:    Number(resumo.rascunho    ?? resumo.rascunhos    ?? 0),
      processando: Number(resumo.processando ?? 0),
      emitida:     Number(resumo.emitidas    ?? resumo.emitida     ?? 0),
      cancelada:   Number(resumo.canceladas  ?? resumo.cancelada   ?? 0),
      rejeitada:   Number(resumo.rejeitadas  ?? resumo.rejeitada   ?? 0),
    };
  } catch {
    // mantém contadores em 0 em caso de falha — não bloqueia a listagem
  }
}

// filtro de status ativo (clique nos KPI cards)
const activeStatusFilter = ref(null);

// ─── colunas ─────────────────────────────────────────────────────────────────
const columns = [
  { key: 'numero_nf',     label: 'Número',          sortable: true },
  { key: 'serie',         label: 'Série',            sortable: true },
  { key: 'destinatario_razao_social', label: 'Cliente', sortable: true },
  { key: 'data_emissao',  label: 'Data Emissão',     sortable: true },
  { key: 'status',        label: 'Status',           sortable: true },
  { key: 'total_nf',      label: 'Total NF',         sortable: true, align: 'right' },
  { key: 'total_impostos',label: 'Total Impostos',   sortable: true, align: 'right' },
  { key: 'chave_acesso',  label: 'Chave SEFAZ',      sortable: false },
  { key: '_actions',      label: 'Ações',            align: 'right' },
];

// ─── filtros ─────────────────────────────────────────────────────────────────
const filterFields = [
  {
    key: 'status',
    label: 'Status',
    type: 'select',
    options: [
      { value: 'rascunho',    label: 'Rascunho' },
      { value: 'processando', label: 'Processando' },
      { value: 'emitida',     label: 'Emitida' },
      { value: 'cancelada',   label: 'Cancelada' },
      { value: 'rejeitada',   label: 'Rejeitada' },
    ],
  },
  {
    key: 'nf_client_id',
    label: 'Cliente',
    type: 'text',
    placeholder: 'ID ou nome do cliente',
  },
  {
    key: 'serie',
    label: 'Série',
    type: 'text',
    placeholder: 'Ex.: A, B, 1',
  },
  {
    key: 'period_start',
    label: 'Emissão de',
    type: 'date',
  },
  {
    key: 'period_end',
    label: 'Emissão até',
    type: 'date',
  },
];

const filters = ref({
  status: '',
  nf_client_id: '',
  serie: '',
  period_start: '',
  period_end: '',
});

function applyFilters() {
  activeStatusFilter.value = null;
  r.setFilters({ ...filters.value });
}

function clearFilters() {
  activeStatusFilter.value = null;
  filters.value = {
    status: '',
    nf_client_id: '',
    serie: '',
    period_start: '',
    period_end: '',
  };
  r.setFilters({});
}

// ─── KPI cards por status ─────────────────────────────────────────────────────
const kpiCardDefs = [
  { key: 'rascunho',    label: 'Rascunho',    iconChar: '✏', tone: 'neutral' },
  { key: 'processando', label: 'Processando', iconChar: '↻', tone: 'running' },
  { key: 'emitida',     label: 'Emitidas',    iconChar: '✓', tone: 'success' },
  { key: 'cancelada',   label: 'Canceladas',  iconChar: '✕', tone: 'error' },
  { key: 'rejeitada',   label: 'Rejeitadas',  iconChar: '⚠', tone: 'warning' },
];

const kpiCardsWithCount = computed(() =>
  kpiCardDefs.map((card) => ({
    ...card,
    count: kpiSummary.value[card.key] ?? 0,
  }))
);

function toggleStatusFilter(key) {
  if (activeStatusFilter.value === key) {
    activeStatusFilter.value = null;
    r.setFilters({ ...filters.value });
  } else {
    activeStatusFilter.value = key;
    r.setFilters({ ...filters.value, status: key });
  }
}

// ─── helpers ─────────────────────────────────────────────────────────────────
function truncateChave(chave) {
  if (!chave) return '—';
  const s = String(chave);
  if (s.length <= 16) return s;
  return s.slice(0, 8) + '…' + s.slice(-8);
}

// Pode cancelar: apenas NFs emitidas ou processando
function canCancel(row) {
  const cancelableStatuses = ['emitida', 'processando'];
  return cancelableStatuses.includes(String(row.status || '').toLowerCase());
}

// ─── ações ───────────────────────────────────────────────────────────────────
function openNf(row) {
  router.push('/nf/' + row.id);
}

async function cancelNf(row) {
  const label = row.numero_nf ? ('NF ' + row.numero_nf) : 'a nota selecionada';
  const confirmed = await ask({
    title: 'Cancelar Nota Fiscal',
    message: 'Deseja cancelar ' + label + '? Esta ação não pode ser desfeita.',
    confirmLabel: 'Sim, cancelar NF',
    danger: true,
  });
  if (!confirmed) return;

  actionLoading[row.id] = 'cancel';
  try {
    await nfCancel(row.id);
    toast.success('Nota fiscal cancelada com sucesso.');
    await loadKpiSummary();
    r.load();
  } catch (e) {
    toast.error(e.message || 'Erro ao cancelar nota fiscal. Tente novamente.');
  } finally {
    delete actionLoading[row.id];
  }
}

// ─── init ─────────────────────────────────────────────────────────────────────
onMounted(() => { r.load(); loadKpiSummary(); });
</script>

<style scoped>
/* ── grid de KPI cards ── */
.nf-kpi-row {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: var(--ui-space-3);
  margin-bottom: var(--ui-space-2);
}

@media (max-width: 860px) {
  .nf-kpi-row {
    grid-template-columns: repeat(3, 1fr);
  }
}

@media (max-width: 540px) {
  .nf-kpi-row {
    grid-template-columns: repeat(2, 1fr);
  }
}

.nf-kpi-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--ui-space-1);
  padding: var(--ui-space-4) var(--ui-space-3);
  border-radius: var(--ui-radius-lg);
  border: 2px solid transparent;
  background: rgb(var(--ui-surface));
  cursor: pointer;
  transition: box-shadow 0.15s, border-color 0.15s, background 0.15s;
  text-align: center;
  user-select: none;
  outline: none;
}

.nf-kpi-card:focus-visible {
  outline: 2px solid rgb(var(--ui-accent));
  outline-offset: 2px;
}

/* tone: success (emitida) */
.nf-kpi-card[data-tone="success"] {
  border-color: rgb(var(--ui-ok) / 0.2);
}
.nf-kpi-card[data-tone="success"]:hover,
.nf-kpi-card[data-tone="success"][data-active="true"] {
  background: rgb(var(--ui-ok) / 0.07);
  border-color: rgb(var(--ui-ok) / 0.55);
  box-shadow: var(--ui-shadow-sm);
}

/* tone: error (cancelada) */
.nf-kpi-card[data-tone="error"] {
  border-color: rgb(var(--ui-danger) / 0.2);
}
.nf-kpi-card[data-tone="error"]:hover,
.nf-kpi-card[data-tone="error"][data-active="true"] {
  background: rgb(var(--ui-danger) / 0.07);
  border-color: rgb(var(--ui-danger) / 0.55);
  box-shadow: var(--ui-shadow-sm);
}

/* tone: warning (rejeitada) */
.nf-kpi-card[data-tone="warning"] {
  border-color: rgb(var(--ui-warn) / 0.2);
}
.nf-kpi-card[data-tone="warning"]:hover,
.nf-kpi-card[data-tone="warning"][data-active="true"] {
  background: rgb(var(--ui-warn) / 0.07);
  border-color: rgb(var(--ui-warn) / 0.5);
  box-shadow: var(--ui-shadow-sm);
}

/* tone: running (processando) */
.nf-kpi-card[data-tone="running"] {
  border-color: rgb(var(--ui-accent) / 0.2);
}
.nf-kpi-card[data-tone="running"]:hover,
.nf-kpi-card[data-tone="running"][data-active="true"] {
  background: rgb(var(--ui-accent) / 0.07);
  border-color: rgb(var(--ui-accent) / 0.5);
  box-shadow: var(--ui-shadow-sm);
}

/* tone: neutral (rascunho) */
.nf-kpi-card[data-tone="neutral"] {
  border-color: rgb(var(--ui-border));
}
.nf-kpi-card[data-tone="neutral"]:hover,
.nf-kpi-card[data-tone="neutral"][data-active="true"] {
  background: rgb(var(--ui-surface-2));
  border-color: rgb(var(--ui-muted) / 0.4);
  box-shadow: var(--ui-shadow-sm);
}

.nf-kpi-icon {
  font-size: var(--ui-text-xl);
  line-height: 1;
  color: rgb(var(--ui-muted));
}

.nf-kpi-count {
  font-size: var(--ui-text-2xl);
  font-weight: 800;
  font-variant-numeric: tabular-nums;
  line-height: 1;
  color: rgb(var(--ui-fg));
}

.nf-kpi-label {
  font-size: var(--ui-text-xs);
  font-weight: 600;
  color: rgb(var(--ui-muted));
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

/* ── número NF ── */
.nf-number {
  font-variant-numeric: tabular-nums;
  font-weight: 700;
  font-size: var(--ui-text-sm);
  color: rgb(var(--ui-fg));
  white-space: nowrap;
}

/* ── série tag ── */
.nf-serie-tag {
  display: inline-block;
  font-size: var(--ui-text-xs);
  font-weight: 700;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: rgb(var(--ui-accent-strong));
  background: rgb(var(--ui-accent) / 0.1);
  border-radius: var(--ui-radius-sm);
  padding: 2px 8px;
  white-space: nowrap;
}

/* ── cliente ── */
.nf-client {
  font-size: var(--ui-text-sm);
  color: rgb(var(--ui-fg));
}

/* ── data ── */
.nf-date {
  font-size: var(--ui-text-sm);
  font-variant-numeric: tabular-nums;
  color: rgb(var(--ui-fg));
  white-space: nowrap;
}

/* ── valores monetários ── */
.nf-currency {
  font-variant-numeric: tabular-nums;
  font-size: var(--ui-text-sm);
  font-weight: 600;
  color: rgb(var(--ui-fg));
  white-space: nowrap;
}

.nf-currency--tax {
  color: rgb(var(--ui-muted));
  font-weight: 400;
}

/* ── chave SEFAZ truncada ── */
.nf-chave {
  font-size: var(--ui-text-xs);
  font-family: ui-monospace, 'Cascadia Code', 'Fira Mono', monospace;
  color: rgb(var(--ui-muted));
  letter-spacing: 0.03em;
  cursor: default;
}

/* ── muted placeholder ── */
.nf-muted {
  color: rgb(var(--ui-muted));
}

/* ── ações em linha ── */
.nf-row-actions {
  display: inline-flex;
  align-items: center;
  gap: var(--ui-space-2);
}

.nf-action-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: var(--ui-text-xs);
  font-weight: 600;
  border-radius: var(--ui-radius-sm);
  padding: 4px 10px;
  cursor: pointer;
  border: 1px solid transparent;
  background: none;
  transition: background 0.12s, color 0.12s, border-color 0.12s;
  white-space: nowrap;
  outline: none;
  font-family: inherit;
}

.nf-action-btn:focus-visible {
  outline: 2px solid rgb(var(--ui-accent));
  outline-offset: 2px;
}

.nf-action-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.nf-action-btn--cancel {
  color: rgb(var(--ui-danger));
  border-color: rgb(var(--ui-danger) / 0.3);
  background: rgb(var(--ui-danger) / 0.05);
}

.nf-action-btn--cancel:not(:disabled):hover {
  background: rgb(var(--ui-danger) / 0.14);
  border-color: rgb(var(--ui-danger) / 0.6);
}

/* ── spinner inline ── */
.nf-spin {
  display: inline-block;
  width: 11px;
  height: 11px;
  border: 2px solid currentColor;
  border-top-color: transparent;
  border-radius: 50%;
  animation: nf-spin 0.6s linear infinite;
}

@keyframes nf-spin {
  to { transform: rotate(360deg); }
}
</style>
