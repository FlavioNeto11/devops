<template>
  <UiPageLayout
    eyebrow="Service Desk"
    title="Chamados"
    subtitle="Acompanhe a fila de atendimento: status, prioridade, solicitante, responsável e prazo de SLA."
    width="wide"
    :error="errorMessage"
    @retry="reload"
  >
    <template #actions>
      <UiButton variant="ghost" :loading="r.loading.value" @click="reload">
        <template #icon-left><span class="tk-ico" aria-hidden="true">↻</span></template>
        Atualizar
      </UiButton>
      <UiButton to="/tickets/new">
        <template #icon-left><span class="tk-ico" aria-hidden="true">＋</span></template>
        Novo chamado
      </UiButton>
    </template>

    <!-- Resumo da fila: KPIs clicáveis que aplicam filtros rápidos -->
    <section class="tk-metrics" aria-label="Resumo da fila de chamados">
      <UiMetricCard
        label="Na fila"
        :value="metrics.total"
        :loading="r.loading.value"
        tone="primary"
        hint="Total de chamados visíveis"
        clickable
        @click="resetFilters"
      />
      <UiMetricCard
        label="Abertos"
        :value="metrics.open"
        :loading="r.loading.value"
        tone="running"
        :hint="pageScopedHint('Aguardando primeira ação')"
        clickable
        @click="quickStatus('open')"
      />
      <UiMetricCard
        label="Em andamento"
        :value="metrics.inProgress"
        :loading="r.loading.value"
        tone="neutral"
        :hint="pageScopedHint('Sendo tratados')"
        clickable
        @click="quickStatus('in_progress')"
      />
      <UiMetricCard
        label="Urgentes"
        :value="metrics.urgent"
        :loading="r.loading.value"
        tone="error"
        :hint="pageScopedHint('Prioridade máxima')"
        clickable
        @click="quickPriority('urgent')"
      />
      <UiMetricCard
        label="SLA em risco"
        :value="metrics.slaRisk"
        :loading="r.loading.value"
        :tone="metrics.slaRisk > 0 ? 'warning' : 'success'"
        :hint="pageScopedHint('Vencido ou vencendo em < 2h')"
      />
    </section>

    <template #filters>
      <UiFiltersPanel
        v-model="filters"
        :fields="filterFields"
        @apply="applyFilters"
        @clear="onClear"
      />
    </template>

    <!-- Atalhos de visão (chips com estado ativo). Não rotulam só por cor: têm texto. -->
    <div class="tk-views" role="group" aria-label="Visões rápidas da fila">
      <button
        v-for="view in quickViews"
        :key="view.id"
        type="button"
        class="tk-chip"
        :data-active="activeView === view.id ? 'true' : null"
        :aria-pressed="activeView === view.id ? 'true' : 'false'"
        @click="applyView(view)"
      >
        <span class="tk-chip-dot" :data-tone="view.tone" aria-hidden="true" />
        {{ view.label }}
      </button>
      <span class="tk-views-spacer" />
      <button
        type="button"
        class="tk-density"
        :aria-pressed="density === 'compact' ? 'true' : 'false'"
        @click="toggleDensity"
      >
        {{ density === 'compact' ? 'Densidade confortável' : 'Densidade compacta' }}
      </button>
    </div>

    <!-- Banner: aviso de filtros ativos / chave para limpar -->
    <div v-if="activeFilterCount" class="tk-active" role="status">
      <span class="tk-active-text">
        {{ activeFilterCount }} filtro(s) aplicado(s) — exibindo {{ r.total.value || 0 }} chamado(s).
      </span>
      <UiButton variant="subtle" size="sm" @click="resetFilters">Limpar filtros</UiButton>
    </div>

    <!-- Barra de seleção em lote (ações sobre vários chamados) -->
    <div v-if="selected.length" class="tk-bulk" role="region" aria-label="Ações em lote">
      <span class="tk-bulk-count">{{ selected.length }} chamado(s) selecionado(s)</span>
      <div class="tk-bulk-actions">
        <UiButton variant="subtle" size="sm" :loading="bulkBusy" @click="bulkUpdate('resolved', 'Resolver')">
          Marcar como resolvido
        </UiButton>
        <UiButton variant="danger" size="sm" :loading="bulkBusy" @click="bulkUpdate('closed', 'Encerrar')">
          Encerrar chamados
        </UiButton>
        <UiButton variant="ghost" size="sm" @click="clearSelection">Limpar seleção</UiButton>
      </div>
    </div>

    <UiDataTable
      :columns="columns"
      :rows="r.items.value"
      :loading="r.loading.value"
      row-key="id"
      :density="density"
      selectable
      v-model:selected="selected"
      clickable-rows
      server-mode
      :sort="r.sort.value"
      :page="r.page.value"
      :page-size="r.pageSize.value"
      :total="r.total.value"
      paginated
      :empty="emptyState"
      @update:sort="r.setSort"
      @update:page="r.setPage"
      @update:page-size="onPageSize"
      @row-click="open"
    >
      <!-- Assunto + referência + canal -->
      <template #cell-subject="{ row }">
        <div class="tk-subject">
          <span class="tk-subject-main">{{ row.subject || 'Sem assunto' }}</span>
          <span class="tk-subject-meta">
            <span class="tk-ref">#{{ row.id }}</span>
            <span v-if="row.external_ref" class="tk-extref">· ref {{ row.external_ref }}</span>
            <span v-if="row.channel" class="tk-channel" :data-channel="row.channel">
              {{ channelLabel(row.channel) }}
            </span>
          </span>
        </div>
      </template>

      <!-- Status -->
      <template #cell-status="{ value }">
        <UiStatusBadge :status="value" :tone="statusTone(value)" :label="statusLabel(value)" with-dot />
      </template>

      <!-- Prioridade (tom explícito por nível — não confia no auto-tom) -->
      <template #cell-priority="{ value }">
        <UiStatusBadge :status="value" :tone="priorityTone(value)" :label="priorityLabel(value)" with-dot />
      </template>

      <!-- Solicitante -->
      <template #cell-customer_id="{ value }">
        <span class="tk-person">
          <span class="tk-avatar" aria-hidden="true">{{ personInitial(value, 'C') }}</span>
          <span class="tk-person-name">{{ value ? 'Cliente #' + value : '—' }}</span>
        </span>
      </template>

      <!-- Responsável -->
      <template #cell-assignee_id="{ value }">
        <span v-if="value" class="tk-person">
          <span class="tk-avatar" data-assignee="true" aria-hidden="true">{{ personInitial(value, 'A') }}</span>
          <span class="tk-person-name">Agente #{{ value }}</span>
        </span>
        <UiStatusBadge v-else tone="warning" label="Não atribuído" :with-dot="false" />
      </template>

      <!-- Time / Fila -->
      <template #cell-team_id="{ value }">
        <span v-if="value" class="tk-team">Fila #{{ value }}</span>
        <span v-else class="tk-dash">—</span>
      </template>

      <!-- SLA: contagem regressiva CSS-safe (classe + data-state) -->
      <template #cell-sla_due_at="{ row }">
        <span
          v-if="row.sla_due_at && !isClosed(row.status)"
          class="tk-sla"
          :data-state="slaState(row.sla_due_at)"
          :title="formatDateTime(row.sla_due_at)"
        >
          <span class="tk-sla-dot" aria-hidden="true" />
          {{ slaCountdown(row.sla_due_at) }}
        </span>
        <span v-else-if="isClosed(row.status)" class="tk-dash" title="Chamado encerrado">—</span>
        <span v-else class="tk-sla" data-state="none">Sem SLA</span>
      </template>

      <!-- Atualizado em -->
      <template #cell-updated_at="{ value }">
        <span class="tk-dim" :title="value ? formatDateTime(value) : ''">{{ value ? formatDateTime(value) : '—' }}</span>
      </template>

      <template #empty-action>
        <div class="tk-empty-actions">
          <UiButton to="/tickets/new">Abrir primeiro chamado</UiButton>
          <UiButton v-if="activeFilterCount" variant="ghost" @click="resetFilters">Limpar filtros</UiButton>
        </div>
      </template>
    </UiDataTable>

    <template #footer>
      <span>{{ footerSummary }}</span>
    </template>
  </UiPageLayout>
</template>

<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import {
  UiPageLayout,
  UiDataTable,
  UiButton,
  UiMetricCard,
  UiStatusBadge,
  UiFiltersPanel,
  useResource,
  useToast,
  useConfirm,
  format,
} from '../ui/index.js';
import * as api from '../api.js';

// api.js exporta `tickets` (resourceFactory('tickets') + ações de domínio); o fallback
// defensivo espelha as demais telas e evita white-screen caso o símbolo suma.
const tickets = api.tickets || api.resourceFactory('tickets');

const router = useRouter();
const route = useRoute();
const toast = useToast();
const confirm = useConfirm();
const formatDateTime = format.formatDateTime;

// ------- domínio: rótulos e tons (sempre com rótulo; cor nunca é o único sinal) -------
const STATUS_OPTIONS = [
  { value: 'open', label: 'Aberto' },
  { value: 'in_progress', label: 'Em andamento' },
  { value: 'pending', label: 'Pendente' },
  { value: 'on_hold', label: 'Em espera' },
  { value: 'resolved', label: 'Resolvido' },
  { value: 'closed', label: 'Encerrado' },
];
const STATUS_LABEL = Object.fromEntries(STATUS_OPTIONS.map((o) => [o.value, o.label]));
// Tom explícito por status do domínio (não depende do auto-tom por palavra-chave).
const STATUS_TONE = {
  open: 'running',
  in_progress: 'running',
  pending: 'warning',
  on_hold: 'warning',
  resolved: 'success',
  closed: 'neutral',
};
const statusLabel = (v) => STATUS_LABEL[v] || format.humanize(v);
const statusTone = (v) => STATUS_TONE[String(v || '').toLowerCase()] || 'neutral';

const PRIORITY_OPTIONS = [
  { value: 'urgent', label: 'Urgente' },
  { value: 'high', label: 'Alta' },
  { value: 'medium', label: 'Média' },
  { value: 'low', label: 'Baixa' },
];
const PRIORITY_LABEL = Object.fromEntries(PRIORITY_OPTIONS.map((o) => [o.value, o.label]));
const PRIORITY_TONE = { urgent: 'error', high: 'warning', medium: 'running', low: 'neutral' };
const priorityLabel = (v) => PRIORITY_LABEL[v] || format.humanize(v);
const priorityTone = (v) => PRIORITY_TONE[String(v || '').toLowerCase()] || 'neutral';

const CHANNEL_LABEL = {
  email: 'E-mail',
  portal: 'Portal',
  phone: 'Telefone',
  chat: 'Chat',
  api: 'API',
};
const channelLabel = (v) => CHANNEL_LABEL[v] || format.humanize(v);

const isClosed = (status) => status === 'closed' || status === 'resolved';
const personInitial = (id, prefix) => (id ? prefix + String(id).slice(-1) : '?');

// ------- colunas -------
const columns = [
  { key: 'subject', label: 'Assunto', sortable: true },
  { key: 'status', label: 'Status', sortable: true },
  { key: 'priority', label: 'Prioridade', sortable: true },
  { key: 'customer_id', label: 'Solicitante' },
  { key: 'assignee_id', label: 'Responsável' },
  { key: 'team_id', label: 'Time/Fila' },
  { key: 'sla_due_at', label: 'SLA', sortable: true },
  { key: 'updated_at', label: 'Atualizado', sortable: true, align: 'right' },
];

// ------- filtros -------
const filterFields = [
  { key: 'q', label: 'Buscar', type: 'text', placeholder: 'assunto, ref. ou #id' },
  { key: 'status', label: 'Status', type: 'select', options: STATUS_OPTIONS },
  { key: 'priority', label: 'Prioridade', type: 'select', options: PRIORITY_OPTIONS },
  { key: 'channel', label: 'Canal', type: 'select', options: [
    { value: 'email', label: 'E-mail' },
    { value: 'portal', label: 'Portal' },
    { value: 'phone', label: 'Telefone' },
    { value: 'chat', label: 'Chat' },
    { value: 'api', label: 'API' },
  ] },
  { key: 'team_id', label: 'Time/Fila', type: 'text', placeholder: 'nº da fila' },
  { key: 'assignee_id', label: 'Responsável', type: 'text', placeholder: 'nº do agente' },
];
const EMPTY_FILTERS = { q: '', status: '', priority: '', channel: '', team_id: '', assignee_id: '' };
const filters = ref({ ...EMPTY_FILTERS });

// ------- recurso (server-mode) -------
const r = useResource(tickets, {
  pageSize: 25,
  sort: { key: 'updated_at', dir: 'desc' },
});

const selected = ref([]);
const bulkBusy = ref(false);
const density = ref('comfortable');

// A mensagem do erro de carga (Error → string) para o PageLayout/ErrorState.
const errorMessage = computed(() => {
  const e = r.error.value;
  if (!e) return null;
  return (e && e.message) || 'Não foi possível carregar a fila de chamados.';
});

// ------- atalhos de visão (chips) -------
const quickViews = [
  { id: 'all', label: 'Toda a fila', tone: 'neutral', patch: {} },
  { id: 'open', label: 'Abertos', tone: 'running', patch: { status: 'open' } },
  { id: 'in_progress', label: 'Em andamento', tone: 'running', patch: { status: 'in_progress' } },
  { id: 'urgent', label: 'Urgentes', tone: 'error', patch: { priority: 'urgent' } },
  { id: 'unassigned', label: 'Sem responsável', tone: 'warning', patch: { assignee_id: '0' } },
];

// Visão ativa = a que bate exatamente com os campos do patch (e nada mais marcado nesses campos).
const activeView = computed(() => {
  const f = filters.value;
  for (const view of quickViews) {
    const keys = Object.keys(view.patch);
    if (view.id === 'all') {
      if (activeFilterCount.value === 0) return 'all';
      continue;
    }
    const matches = keys.every((k) => String(f[k] ?? '') === String(view.patch[k]));
    // Garante que nenhum OUTRO campo de filtro de visão esteja preenchido (evita falso-positivo).
    const otherClean = ['status', 'priority', 'assignee_id'].every(
      (k) => keys.includes(k) || !f[k]
    );
    if (matches && otherClean) return view.id;
  }
  return null;
});

function applyView(view) {
  filters.value = { ...EMPTY_FILTERS, ...view.patch };
  applyFilters();
}

const activeFilterCount = computed(
  () => Object.values(filters.value).filter((v) => v !== '' && v != null).length
);

// ------- ações de filtro -------
function applyFilters() {
  selected.value = [];
  r.setFilters({ ...filters.value });
}
function onClear() {
  filters.value = { ...EMPTY_FILTERS };
  applyFilters();
}
function resetFilters() {
  filters.value = { ...EMPTY_FILTERS };
  applyFilters();
}
function quickStatus(status) {
  filters.value = { ...EMPTY_FILTERS, status };
  applyFilters();
}
function quickPriority(priority) {
  filters.value = { ...EMPTY_FILTERS, priority };
  applyFilters();
}
function onPageSize(size) {
  r.pageSize.value = size;
  r.setPage(1);
}
function toggleDensity() {
  density.value = density.value === 'compact' ? 'comfortable' : 'compact';
}
function clearSelection() {
  selected.value = [];
}
async function reload() {
  selected.value = [];
  try {
    await r.load();
    if (!r.error.value) toast.success('Fila atualizada');
  } catch (e) {
    toast.error('Não foi possível atualizar a fila', { detail: e && e.message });
  }
}
function open(row) {
  router.push('/tickets/' + row.id);
}

// ------- ação em lote (altera status → confirmação + toast) -------
async function bulkUpdate(targetStatus, verb) {
  const rows = selected.value.slice();
  if (!rows.length) return;
  const ok = await confirm({
    title: verb + ' chamados',
    message:
      verb +
      ' ' +
      rows.length +
      ' chamado(s) como "' +
      (STATUS_LABEL[targetStatus] || targetStatus) +
      '"? Esta ação altera o status dos chamados selecionados.',
    confirmLabel: verb,
    danger: targetStatus === 'closed',
  });
  if (!ok) return;
  bulkBusy.value = true;
  let done = 0;
  let failed = 0;
  for (const row of rows) {
    try {
      await tickets.update(row.id, { status: targetStatus });
      done += 1;
    } catch {
      failed += 1;
    }
  }
  bulkBusy.value = false;
  selected.value = [];
  if (done) toast.success(done + ' chamado(s) atualizado(s)');
  if (failed) toast.error(failed + ' chamado(s) não puderam ser atualizados');
  await r.load();
}

// ------- SLA: contagem regressiva pura (estado por data-attr, sem style inline) -------
// O relógio só roda quando há ao menos um chamado com SLA aberto E a aba está visível;
// caso contrário, é suspenso para não disparar reatividade da tabela toda a cada 30s.
const now = ref(Date.now());
let clockId = null;

function hasActiveSla() {
  const rows = r.items.value || [];
  for (const row of rows) {
    if (row.sla_due_at && !isClosed(row.status)) return true;
  }
  return false;
}
function stopClock() {
  if (clockId) {
    clearInterval(clockId);
    clockId = null;
  }
}
function syncClock() {
  const shouldRun = hasActiveSla() && (typeof document === 'undefined' || !document.hidden);
  if (shouldRun && !clockId) {
    now.value = Date.now(); // ressincroniza ao religar
    clockId = setInterval(() => {
      now.value = Date.now();
    }, 30000);
  } else if (!shouldRun && clockId) {
    stopClock();
  }
}

watch(() => r.items.value, syncClock, { deep: false });

function onVisibility() {
  if (document.hidden) stopClock();
  else syncClock();
}

onMounted(() => {
  if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onVisibility);
});
onUnmounted(() => {
  stopClock();
  if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onVisibility);
});

function slaMillis(due) {
  const t = new Date(due).getTime();
  if (isNaN(t)) return null;
  return t - now.value;
}
function slaState(due) {
  const ms = slaMillis(due);
  if (ms === null) return 'none';
  if (ms <= 0) return 'breached';
  if (ms <= 2 * 3600 * 1000) return 'soon';
  return 'ok';
}
function slaCountdown(due) {
  const ms = slaMillis(due);
  if (ms === null) return '—';
  const abs = Math.abs(ms);
  const mins = Math.floor(abs / 60000);
  const days = Math.floor(mins / 1440);
  const hours = Math.floor((mins % 1440) / 60);
  const rem = mins % 60;
  let label;
  if (days > 0) label = days + 'd ' + hours + 'h';
  else if (hours > 0) label = hours + 'h ' + rem + 'm';
  else label = rem + 'm';
  return ms <= 0 ? 'Vencido há ' + label : 'Em ' + label;
}

// ------- métricas da fila -------
// "Na fila" (total) vem do servidor (r.total). Os demais contadores derivam SÓ da
// página carregada (r.items, máx. pageSize); quando há mais de uma página o número
// subestima o total — então o hint sinaliza "nesta página" para não enganar o operador.
const metrics = computed(() => {
  const rows = r.items.value || [];
  let open = 0;
  let inProgress = 0;
  let urgent = 0;
  let slaRisk = 0;
  for (const row of rows) {
    if (row.status === 'open') open += 1;
    if (row.status === 'in_progress') inProgress += 1;
    if (row.priority === 'urgent') urgent += 1;
    if (row.sla_due_at && !isClosed(row.status)) {
      const s = slaState(row.sla_due_at);
      if (s === 'breached' || s === 'soon') slaRisk += 1;
    }
  }
  return { total: r.total.value || rows.length, open, inProgress, urgent, slaRisk };
});

// true quando há mais chamados na fila do que os exibidos nesta página.
const isPaged = computed(() => (r.total.value || 0) > (r.items.value || []).length);
const pageScopedHint = (base) => (isPaged.value ? base + ' · nesta página' : base);

const emptyState = computed(() => {
  return activeFilterCount.value
    ? {
        title: 'Nenhum chamado para este filtro',
        description: 'Ajuste os filtros ou limpe a busca para ver toda a fila.',
        icon: 'search',
      }
    : {
        title: 'Nenhum chamado na fila',
        description:
          'Quando um cliente abrir um chamado, ele aparece aqui. Você também pode abrir um manualmente.',
        icon: 'inbox',
      };
});

const footerSummary = computed(() => {
  const t = r.total.value || 0;
  if (r.loading.value) return 'Carregando chamados…';
  if (!t) return 'Nenhum chamado na fila.';
  const sortLabel = r.sort.value ? labelForKey(r.sort.value.key) : 'atualização';
  return t + ' chamado(s) na fila · ordenado por ' + sortLabel;
});
function labelForKey(key) {
  const c = columns.find((x) => x.key === key);
  return c ? c.label.toLowerCase() : key;
}

onMounted(() => {
  // Lê filtros iniciais da query string — permite navegação do dashboard com filtro pré-aplicado.
  const q = route.query;
  if (q.status || q.priority) {
    if (q.status) filters.value.status = String(q.status);
    if (q.priority) filters.value.priority = String(q.priority);
    applyFilters();
  } else if (q.sort) {
    r.sort.value = { key: String(q.sort), dir: String(q.dir || 'desc') };
    r.load();
  } else {
    r.load();
  }
});
</script>

<style scoped>
.tk-ico {
  font-weight: 700;
  line-height: 1;
}

/* KPIs */
.tk-metrics {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: var(--ui-space-4);
}

/* atalhos de visão (chips) + densidade */
.tk-views {
  display: flex;
  align-items: center;
  gap: var(--ui-space-2);
  flex-wrap: wrap;
}
.tk-views-spacer {
  flex: 1 1 auto;
}
.tk-chip {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  font: inherit;
  font-size: var(--ui-text-sm);
  font-weight: 600;
  color: rgb(var(--ui-muted));
  background: rgb(var(--ui-surface));
  border: 1px solid rgb(var(--ui-border-strong));
  border-radius: var(--ui-radius-pill);
  padding: 6px 13px;
  cursor: pointer;
  transition: background 0.15s ease, color 0.15s ease, border-color 0.15s ease;
}
.tk-chip:hover {
  background: rgb(var(--ui-surface-2));
  color: rgb(var(--ui-fg));
}
.tk-chip[data-active="true"] {
  background: rgb(var(--ui-accent) / 0.12);
  border-color: rgb(var(--ui-accent) / 0.45);
  color: rgb(var(--ui-accent-strong));
}
.tk-chip-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: rgb(var(--ui-faint));
}
.tk-chip-dot[data-tone="running"] {
  background: rgb(var(--ui-accent));
}
.tk-chip-dot[data-tone="error"] {
  background: rgb(var(--ui-danger));
}
.tk-chip-dot[data-tone="warning"] {
  background: rgb(var(--ui-warn));
}
.tk-chip-dot[data-tone="neutral"] {
  background: rgb(var(--ui-faint));
}
.tk-density {
  font: inherit;
  font-size: var(--ui-text-xs);
  font-weight: 600;
  color: rgb(var(--ui-muted));
  background: transparent;
  border: 1px solid rgb(var(--ui-border));
  border-radius: var(--ui-radius-pill);
  padding: 5px 12px;
  cursor: pointer;
  transition: background 0.15s ease, color 0.15s ease;
}
.tk-density:hover {
  background: rgb(var(--ui-surface-2));
  color: rgb(var(--ui-fg));
}

/* aviso de filtros ativos */
.tk-active {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ui-space-3);
  flex-wrap: wrap;
  background: rgb(var(--ui-surface-2));
  border: 1px solid rgb(var(--ui-border));
  border-radius: var(--ui-radius-md);
  padding: var(--ui-space-2) var(--ui-space-4);
}
.tk-active-text {
  font-size: var(--ui-text-sm);
  color: rgb(var(--ui-muted));
}

/* barra de ações em lote */
.tk-bulk {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ui-space-4);
  flex-wrap: wrap;
  background: rgb(var(--ui-accent) / 0.08);
  border: 1px solid rgb(var(--ui-accent) / 0.3);
  border-radius: var(--ui-radius-lg);
  padding: var(--ui-space-3) var(--ui-space-4);
}
.tk-bulk-count {
  font-weight: 700;
  color: rgb(var(--ui-accent-strong));
  font-size: var(--ui-text-sm);
}
.tk-bulk-actions {
  display: flex;
  gap: var(--ui-space-2);
  flex-wrap: wrap;
}

/* coluna assunto */
.tk-subject {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 200px;
}
.tk-subject-main {
  font-weight: 600;
  color: rgb(var(--ui-fg));
}
.tk-subject-meta {
  display: inline-flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  font-size: var(--ui-text-xs);
  color: rgb(var(--ui-muted));
}
.tk-ref {
  font-family: var(--ui-font-mono);
  color: rgb(var(--ui-accent-strong));
}
.tk-channel {
  border: 1px solid rgb(var(--ui-border-strong));
  border-radius: var(--ui-radius-pill);
  padding: 0 8px;
  line-height: 1.6;
  color: rgb(var(--ui-muted));
}

/* pessoas (solicitante / responsável) */
.tk-person {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  white-space: nowrap;
}
.tk-person-name {
  font-size: var(--ui-text-sm);
}
.tk-avatar {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  font-size: var(--ui-text-xs);
  font-weight: 700;
  background: rgb(var(--ui-muted) / 0.18);
  color: rgb(var(--ui-muted));
}
.tk-avatar[data-assignee="true"] {
  background: rgb(var(--ui-accent) / 0.16);
  color: rgb(var(--ui-accent-strong));
}

.tk-team {
  font-size: var(--ui-text-sm);
  color: rgb(var(--ui-fg));
}
.tk-dash,
.tk-dim {
  color: rgb(var(--ui-muted));
}
.tk-dim {
  font-size: var(--ui-text-xs);
  white-space: nowrap;
}

/* SLA countdown */
.tk-sla {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: var(--ui-text-xs);
  font-weight: 600;
  padding: 2px 9px;
  border-radius: var(--ui-radius-pill);
  white-space: nowrap;
}
.tk-sla-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: currentColor;
}
.tk-sla[data-state="ok"] {
  background: rgb(var(--ui-ok) / 0.14);
  color: rgb(var(--ui-ok));
}
.tk-sla[data-state="soon"] {
  background: rgb(var(--ui-warn) / 0.18);
  color: rgb(var(--ui-warn));
}
.tk-sla[data-state="breached"] {
  background: rgb(var(--ui-danger) / 0.16);
  color: rgb(var(--ui-danger));
}
.tk-sla[data-state="none"] {
  background: rgb(var(--ui-muted) / 0.14);
  color: rgb(var(--ui-muted));
  font-weight: 500;
}

/* ações da tabela vazia */
.tk-empty-actions {
  display: inline-flex;
  gap: var(--ui-space-2);
  flex-wrap: wrap;
}

@media (max-width: 1100px) {
  .tk-metrics {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
@media (max-width: 560px) {
  .tk-metrics {
    grid-template-columns: 1fr;
  }
  .tk-bulk,
  .tk-active {
    flex-direction: column;
    align-items: flex-start;
  }
  .tk-views-spacer {
    display: none;
  }
}
</style>
