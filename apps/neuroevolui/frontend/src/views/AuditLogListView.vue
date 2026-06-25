<!--
  Auditoria — trilha de auditoria do tenant (REQ-NEUROEVOLUI-0005, REQ-NEUROEVOLUI-0002).
  Somente leitura. Restrita a clinic_manager+ no backend (401/403 = sem acesso, não erro fatal).

  Endpoint REAL:
    · GET /v1/audit-logs  (resourceFactory; coleção paginada server-side → { data, total })
      params suportados: page, pageSize, sort (id|entity_type|action|created_at), dir (asc|desc)
  Filtros por entidade/tipo/ação/status de pagamento são aplicados no cliente sobre a página
  carregada (o contrato da coleção não expõe filtros server-side — não inventamos rota).

  Estados: loading (skeleton via UiDataTable) · empty (com CTA p/ rotas de domínio) ·
           error (com retry) · normal. CSP-safe: zero style inline / :style / v-html —
           todo estado visual por class + data-* no <style scoped>.
-->
<template>
  <UiPageLayout
    eyebrow="Governança"
    title="Auditoria"
    subtitle="Trilha de auditoria do tenant: ações, autor, entidade afetada e pagamentos. Somente leitura, restrita a gestores da clínica."
    width="wide"
    :error="errorMessage"
    @retry="reload"
  >
    <template #actions>
      <UiButton variant="ghost" :loading="loading" @click="reload">Atualizar</UiButton>
      <UiButton variant="subtle" to="/transactions">Ver transações</UiButton>
    </template>

    <!-- KPIs — sempre visíveis; placeholders enquanto carrega -->
    <section class="au-metrics" aria-label="Resumo da auditoria">
      <UiMetricCard
        label="Eventos"
        :value="loading ? null : format.formatNumber(total)"
        :loading="loading"
        tone="primary"
        :hint="total === 1 ? 'registro na trilha' : 'registros na trilha'"
      />
      <UiMetricCard
        label="Na página"
        :value="loading ? null : format.formatNumber(metrics.pageCount)"
        :loading="loading"
        tone="neutral"
        :hint="pageRangeHint"
      />
      <UiMetricCard
        label="Tipos de entidade"
        :value="loading ? null : format.formatNumber(metrics.entityTypes)"
        :loading="loading"
        tone="neutral"
        hint="distintos nesta página"
      />
      <UiMetricCard
        label="Com pagamento"
        :value="loading ? null : format.formatNumber(metrics.withPayment)"
        :loading="loading"
        tone="success"
        :hint="metrics.withPayment === 1 ? 'evento financeiro' : 'eventos financeiros'"
      />
    </section>

    <!-- Filtros (client-side sobre a página carregada) -->
    <template #filters>
      <UiFiltersPanel
        v-model="filters"
        :fields="filterFields"
        @apply="onApply"
        @clear="onClear"
      />
    </template>

    <!-- Banner: acesso negado (RBAC clinic_manager+) -->
    <template v-if="accessDenied" #banner>
      <div class="au-banner au-banner--warn" role="status">
        <span class="au-banner-text">
          Seu perfil não tem acesso à trilha de auditoria. Esta área é restrita a gestores da clínica.
        </span>
      </div>
    </template>
    <!-- Banner: filtros ativos -->
    <template v-else-if="hasActiveFilters && !error" #banner>
      <div class="au-banner" role="status">
        <span class="au-banner-text">
          Mostrando {{ format.formatNumber(filteredRows.length) }} de
          {{ format.formatNumber(rows.length) }} eventos desta página com os filtros aplicados.
        </span>
        <UiButton variant="subtle" size="sm" @click="onClear">Limpar filtros</UiButton>
      </div>
    </template>

    <!-- Tabela — estados loading/error/empty/normal tratados pelo UiDataTable.
         server-mode: ordenação/paginação batem no backend; filtros são locais. -->
    <UiDataTable
      :columns="columns"
      :rows="filteredRows"
      :loading="loading"
      :error="tableError"
      row-key="id"
      density="comfortable"
      clickable-rows
      server-mode
      :sort="sort"
      :page="page"
      :page-size="pageSize"
      :total="total"
      :paginated="!hasActiveFilters"
      :empty="emptyState"
      @row-click="openDetail"
      @update:sort="onSort"
      @update:page="onPage"
      @update:page-size="onPageSize"
      @retry="reload"
    >
      <!-- Quando -->
      <template #cell-created_at="{ value }">
        <span class="au-when">{{ format.formatDateTime(value) }}</span>
      </template>

      <!-- Ação -->
      <template #cell-action="{ value }">
        <span class="au-action">{{ actionLabel(value) }}</span>
      </template>

      <!-- Entidade + ID -->
      <template #cell-entity_type="{ row }">
        <div class="au-entity">
          <span class="au-entity-name">{{ entityLabel(row.entity_type) }}</span>
          <span v-if="row.entity_id" class="au-entity-id">#{{ row.entity_id }}</span>
        </div>
      </template>

      <!-- Autor -->
      <template #cell-actor="{ value }">
        <span v-if="value" class="au-actor">{{ value }}</span>
        <span v-else class="au-muted">sistema</span>
      </template>

      <!-- Status de pagamento (só quando há) -->
      <template #cell-payment_status="{ row }">
        <UiStatusBadge
          v-if="row.payment_status"
          :status="row.payment_status"
          :tone="statusTone(row.payment_status)"
          :label="statusText(row.payment_status)"
          with-dot
        />
        <span v-else class="au-muted">—</span>
      </template>

      <!-- CTA dentro do empty da própria tabela -->
      <template #empty-action>
        <div class="au-empty-actions">
          <UiButton v-if="hasActiveFilters" variant="ghost" @click="onClear">Limpar filtros</UiButton>
          <UiButton variant="primary" to="/transactions">Ver transações</UiButton>
        </div>
      </template>
    </UiDataTable>

    <template #footer>
      <span>
        Fonte: trilha de auditoria do tenant (somente leitura). Clique numa linha para ver os detalhes do evento.
      </span>
    </template>

    <!-- Detalhe do evento (read-only) -->
    <UiModal v-model:open="detailOpen" :title="detailTitle" width="md">
      <dl v-if="selected" class="au-detail">
        <div class="au-detail-row">
          <dt>Ação</dt>
          <dd class="au-detail-strong">{{ actionLabel(selected.action) }}</dd>
        </div>
        <div class="au-detail-row">
          <dt>Entidade</dt>
          <dd>{{ entityLabel(selected.entity_type) }}</dd>
        </div>
        <div class="au-detail-row">
          <dt>ID da entidade</dt>
          <dd class="au-detail-mono">{{ selected.entity_id || '—' }}</dd>
        </div>
        <div class="au-detail-row">
          <dt>Autor</dt>
          <dd>{{ selected.actor || 'Sistema' }}</dd>
        </div>
        <div class="au-detail-row">
          <dt>Status de pagamento</dt>
          <dd>
            <UiStatusBadge
              v-if="selected.payment_status"
              :status="selected.payment_status"
              :tone="statusTone(selected.payment_status)"
              :label="statusText(selected.payment_status)"
              with-dot
            />
            <span v-else class="au-muted">não aplicável</span>
          </dd>
        </div>
        <div v-if="selected.amount_cents != null" class="au-detail-row">
          <dt>Valor</dt>
          <dd class="au-detail-amount">{{ amountLabel(selected) }}</dd>
        </div>
        <div v-if="selected.gateway" class="au-detail-row">
          <dt>Gateway</dt>
          <dd>{{ format.humanize(selected.gateway) }}</dd>
        </div>
        <div class="au-detail-row">
          <dt>Quando</dt>
          <dd>{{ format.formatDateTime(selected.created_at) }}</dd>
        </div>
        <div v-if="metadataText" class="au-detail-row au-detail-row--block">
          <dt>Detalhes</dt>
          <dd class="au-detail-meta">{{ metadataText }}</dd>
        </div>
      </dl>
      <template #footer>
        <UiButton variant="ghost" @click="detailOpen = false">Fechar</UiButton>
        <UiButton
          v-if="detailLink"
          variant="primary"
          :to="detailLink"
        >
          {{ detailLinkLabel }}
        </UiButton>
      </template>
    </UiModal>
  </UiPageLayout>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import {
  UiPageLayout,
  UiDataTable,
  UiFiltersPanel,
  UiStatusBadge,
  UiMetricCard,
  UiModal,
  UiButton,
  useToast,
  format,
} from '../ui/index.js';
import { resourceFactory } from '../api.js';

const toast = useToast();

// Recurso REAL: a coleção de topo vive em /v1/audit-logs (nome com hífen → instanciamos
// pela fábrica diretamente; o integrador garante este endpoint).
const auditApi = resourceFactory('audit-logs');

// ── Estado de dados ──────────────────────────────────────────────────────────────
const rows = ref([]);
const total = ref(0);
const loading = ref(false);
const error = ref(null);

// server-mode: o backend só ordena por id|entity_type|action|created_at.
const SERVER_SORTABLE = new Set(['id', 'entity_type', 'action', 'created_at']);
const sort = ref({ key: 'created_at', dir: 'desc' });
const page = ref(1);
const pageSize = ref(25);

const filters = ref({ q: '', entity_type: '', action: '', payment_status: '' });

// Detalhe
const detailOpen = ref(false);
const selected = ref(null);

// ── Rótulos (a cor NUNCA é o único sinal — sempre há texto) ───────────────────────
const PAYMENT_LABELS = {
  pending: 'Pendente',
  succeeded: 'Aprovado',
  paid: 'Pago',
  failed: 'Falhou',
  refunded: 'Reembolsado',
  cancelled: 'Cancelado',
  canceled: 'Cancelado',
};
const ENTITY_LABELS = {
  patient: 'Paciente',
  patients: 'Paciente',
  consultation: 'Agendamento',
  consultations: 'Agendamento',
  professional: 'Profissional',
  professionals: 'Profissional',
  'evolution-note': 'Evolução',
  evolution_note: 'Evolução',
  report: 'Relatório',
  reports: 'Relatório',
  'patient-report': 'Relatório',
  payment: 'Pagamento',
  'payment-transaction': 'Transação',
  transaction: 'Transação',
  'knowledge-source': 'Fonte de conhecimento',
};
const ACTION_LABELS = {
  create: 'Criou',
  created: 'Criou',
  update: 'Atualizou',
  updated: 'Atualizou',
  delete: 'Excluiu',
  deleted: 'Excluiu',
  submit: 'Enviou',
  submitted: 'Enviou',
  schedule: 'Agendou',
  scheduled: 'Agendou',
  pay: 'Cobrou',
  payment: 'Cobrança',
  refund: 'Reembolsou',
  cancel: 'Cancelou',
  login: 'Acessou',
  export: 'Exportou',
};

function norm(v) {
  return String(v ?? '').trim().toLowerCase();
}
const statusText = (v) => PAYMENT_LABELS[norm(v)] || format.humanize(v);
const statusTone = (v) => {
  const s = norm(v);
  if (s === 'succeeded' || s === 'paid') return 'success';
  if (s === 'pending') return 'warning';
  if (s === 'failed') return 'error';
  if (s === 'refunded' || s === 'cancelled' || s === 'canceled') return 'neutral';
  return 'neutral';
};
const entityLabel = (v) => ENTITY_LABELS[norm(v)] || (v ? format.humanize(v) : '—');
const actionLabel = (v) => ACTION_LABELS[norm(v)] || (v ? format.humanize(v) : '—');

function amountLabel(row) {
  const n = Number(row && row.amount_cents);
  if (!isFinite(n)) return '—';
  return format.formatCurrency(n / 100);
}

// ── Colunas ───────────────────────────────────────────────────────────────────────
const columns = [
  { key: 'created_at', label: 'Quando', sortable: true },
  { key: 'action', label: 'Ação', sortable: true },
  { key: 'entity_type', label: 'Entidade', sortable: true },
  { key: 'actor', label: 'Autor' },
  { key: 'payment_status', label: 'Pagamento' },
];

// Opções descobertas dinamicamente a partir dos dados reais da página.
function distinctOptions(field, labeller) {
  const seen = new Map();
  for (const r of rows.value) {
    const key = norm(r[field]);
    if (key && !seen.has(key)) seen.set(key, labeller(r[field]));
  }
  return [...seen.entries()]
    .map(([value, label]) => ({ value, label }))
    .sort((a, b) => a.label.localeCompare(b.label, 'pt-BR'));
}

const filterFields = computed(() => [
  { key: 'q', label: 'Buscar', type: 'text', placeholder: 'Autor, ação, ID da entidade…' },
  { key: 'entity_type', label: 'Entidade', type: 'select', options: distinctOptions('entity_type', entityLabel) },
  { key: 'action', label: 'Ação', type: 'select', options: distinctOptions('action', actionLabel) },
  { key: 'payment_status', label: 'Pagamento', type: 'select', options: distinctOptions('payment_status', statusText) },
]);

// ── Filtragem (client-side sobre a página carregada) ──────────────────────────────
function matchesText(needle, ...haystack) {
  const q = norm(needle);
  if (!q) return true;
  return haystack.some((h) => String(h ?? '').toLowerCase().includes(q));
}

const hasActiveFilters = computed(() =>
  Object.values(filters.value).some((v) => norm(v) !== ''),
);

const filteredRows = computed(() => {
  const f = filters.value;
  if (!hasActiveFilters.value) return rows.value;
  return rows.value.filter((r) => {
    if (!matchesText(f.q, r.actor, r.action, r.entity_type, r.entity_id, r.id)) return false;
    if (f.entity_type && norm(r.entity_type) !== norm(f.entity_type)) return false;
    if (f.action && norm(r.action) !== norm(f.action)) return false;
    if (f.payment_status && norm(r.payment_status) !== norm(f.payment_status)) return false;
    return true;
  });
});

// ── Métricas (derivadas da página) ────────────────────────────────────────────────
const metrics = computed(() => {
  const src = rows.value;
  const types = new Set();
  let withPayment = 0;
  for (const r of src) {
    if (r.entity_type) types.add(norm(r.entity_type));
    if (r.payment_status) withPayment += 1;
  }
  return { pageCount: src.length, entityTypes: types.size, withPayment };
});

const pageRangeHint = computed(() => {
  if (!rows.value.length) return 'nenhum nesta página';
  const start = (page.value - 1) * pageSize.value + 1;
  const end = start + rows.value.length - 1;
  return start + '–' + end + ' de ' + format.formatNumber(total.value);
});

// ── Estados / mensagens ─────────────────────────────────────────────────────────────
function isDenied(err) {
  return !!err && (err.status === 401 || err.status === 403);
}
const accessDenied = computed(() => isDenied(error.value));
const errorMessage = computed(() => {
  if (!error.value || accessDenied.value) return null;
  return error.value.message || 'Não foi possível carregar a trilha de auditoria.';
});
// Acesso negado vira banner + empty informativo (não erro de tabela).
const tableError = computed(() => null);

const emptyState = computed(() => {
  if (accessDenied.value) {
    return {
      title: 'Acesso restrito',
      description: 'A trilha de auditoria é visível apenas para gestores da clínica.',
      icon: 'lock',
    };
  }
  if (hasActiveFilters.value) {
    return {
      title: 'Nenhum evento encontrado',
      description: 'Nenhum evento desta página corresponde aos filtros. Ajuste ou limpe os filtros.',
      icon: 'search',
    };
  }
  return {
    title: 'Nenhum evento registrado',
    description: 'Assim que houver ações no sistema (cadastros, agendamentos, cobranças), elas aparecerão aqui.',
    icon: 'clock',
  };
});

// ── Detalhe ────────────────────────────────────────────────────────────────────────
const detailTitle = computed(() => {
  if (!selected.value) return 'Evento de auditoria';
  return actionLabel(selected.value.action) + ' · ' + entityLabel(selected.value.entity_type);
});

const metadataText = computed(() => {
  const m = selected.value && selected.value.metadata;
  if (!m) return '';
  if (typeof m === 'string') return m.trim();
  try {
    const keys = Object.keys(m);
    if (!keys.length) return '';
    return JSON.stringify(m, null, 2);
  } catch {
    return '';
  }
});

// Link de domínio p/ a entidade afetada — só rotas reais do domínio clínico.
const ENTITY_ROUTES = {
  patient: '/patients/',
  patients: '/patients/',
  consultation: '/consultations/',
  consultations: '/consultations/',
  professional: '/professionals/',
  professionals: '/professionals/',
  'evolution-note': '/evolution-notes/',
  evolution_note: '/evolution-notes/',
  report: '/reports/',
  reports: '/reports/',
  'patient-report': '/reports/',
  'payment-transaction': '/transactions/',
  transaction: '/transactions/',
};
const detailLink = computed(() => {
  const s = selected.value;
  if (!s || !s.entity_id) return null;
  const base = ENTITY_ROUTES[norm(s.entity_type)];
  return base ? base + s.entity_id : null;
});
const detailLinkLabel = computed(() => {
  const s = selected.value;
  if (!s) return 'Abrir';
  return 'Abrir ' + entityLabel(s.entity_type).toLowerCase();
});

// ── Ações ────────────────────────────────────────────────────────────────────────
function openDetail(row) {
  selected.value = row;
  detailOpen.value = true;
}
function onSort(s) {
  // Server-mode só ordena pelas colunas suportadas; ignora as demais.
  if (!s || !SERVER_SORTABLE.has(s.key)) return;
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
function onApply() {
  // Filtros são client-side sobre a página atual; nada a recarregar.
}
function onClear() {
  filters.value = { q: '', entity_type: '', action: '', payment_status: '' };
}

// ── Carga ────────────────────────────────────────────────────────────────────────
async function load() {
  loading.value = true;
  error.value = null;
  try {
    const res = await auditApi.list({
      page: page.value,
      pageSize: pageSize.value,
      sort: sort.value.key,
      dir: sort.value.dir,
    });
    const data = Array.isArray(res) ? res : res && res.data ? res.data : [];
    rows.value = data;
    total.value = res && typeof res.total === 'number' ? res.total : data.length;
  } catch (e) {
    error.value = e;
    rows.value = [];
    total.value = 0;
  } finally {
    loading.value = false;
  }
}

async function reload() {
  await load();
  if (accessDenied.value) {
    toast.error('Sem acesso à auditoria.', { detail: 'Esta área é restrita a gestores da clínica.' });
  } else if (error.value) {
    toast.error('Falha ao atualizar a auditoria.', { detail: errorMessage.value });
  } else {
    toast.success('Trilha de auditoria atualizada.');
  }
}

onMounted(load);
</script>

<style scoped>
.au-metrics {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
  gap: var(--ui-space-4);
}

.au-banner {
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

.au-banner--warn {
  background: rgb(var(--ui-warn) / 0.1);
  border-color: rgb(var(--ui-warn) / 0.35);
}

.au-banner-text {
  color: rgb(var(--ui-fg));
  font-size: var(--ui-text-sm);
  font-weight: 600;
}

.au-when {
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.au-action {
  font-weight: 600;
}

.au-entity {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.au-entity-name {
  font-weight: 600;
}

.au-entity-id {
  font-family: var(--ui-font-mono, monospace);
  font-size: var(--ui-text-xs);
  color: rgb(var(--ui-muted));
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 220px;
}

.au-actor {
  color: rgb(var(--ui-fg));
}

.au-muted {
  color: rgb(var(--ui-muted));
}

.au-empty-actions {
  display: flex;
  gap: var(--ui-space-2);
  flex-wrap: wrap;
  justify-content: center;
}

/* Detalhe (modal) */
.au-detail {
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-1);
  margin: 0;
}

.au-detail-row {
  display: grid;
  grid-template-columns: 170px 1fr;
  gap: var(--ui-space-3);
  align-items: center;
  padding: var(--ui-space-2) 0;
  border-bottom: 1px solid rgb(var(--ui-border));
}

.au-detail-row:last-child {
  border-bottom: none;
}

.au-detail-row--block {
  align-items: start;
}

.au-detail dt {
  color: rgb(var(--ui-muted));
  font-size: var(--ui-text-sm);
  font-weight: 600;
}

.au-detail dd {
  margin: 0;
  color: rgb(var(--ui-fg));
  font-size: var(--ui-text-sm);
}

.au-detail-strong {
  font-weight: 700;
}

.au-detail-amount {
  font-variant-numeric: tabular-nums;
  font-weight: 700;
  font-size: var(--ui-text-md);
}

.au-detail-mono {
  font-family: var(--ui-font-mono, monospace);
  word-break: break-all;
}

.au-detail-meta {
  font-family: var(--ui-font-mono, monospace);
  font-size: var(--ui-text-xs);
  color: rgb(var(--ui-muted));
  white-space: pre-wrap;
  word-break: break-word;
  background: rgb(var(--ui-surface-2));
  border: 1px solid rgb(var(--ui-border));
  border-radius: var(--ui-radius-sm);
  padding: var(--ui-space-2) var(--ui-space-3);
  max-height: 220px;
  overflow: auto;
}

@media (max-width: 860px) {
  .au-metrics {
    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
    gap: var(--ui-space-3);
  }

  .au-detail-row {
    grid-template-columns: 1fr;
    gap: 2px;
    align-items: start;
  }
}
</style>
