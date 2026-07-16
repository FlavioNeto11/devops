<template>
  <UiPageLayout
    title="Obrigações Fiscais"
    eyebrow="Conformidade Fiscal"
    subtitle="Painel de controle de obrigações tributárias do tenant. Monitore vencimentos, status e conformidade."
    width="wide"
    :error="r.error.value ? (r.error.value.message || 'Erro ao carregar obrigações fiscais') : null"
    @retry="r.load"
  >
    <!-- ── ações do cabeçalho ── -->
    <template #actions>
      <UiButton variant="ghost" :loading="exportLoading" @click="exportCompliance">
        Exportar Compliance
      </UiButton>
      <UiButton variant="primary" to="/fiscal-obligations/new">
        Nova Obrigação
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

    <!-- ── cards de resumo por alerta ── -->
    <div class="fo-kpi-row" role="region" aria-label="Resumo de alertas de obrigações fiscais">
      <div class="fo-kpi-card fo-kpi-card--overdue" :data-active="activeAlert === 'atrasado'" role="button" tabindex="0" :aria-pressed="activeAlert === 'atrasado'" @click="toggleAlertFilter('atrasado')" @keydown.enter="toggleAlertFilter('atrasado')" @keydown.space.prevent="toggleAlertFilter('atrasado')">
        <span class="fo-kpi-icon" aria-hidden="true">{{ resolveGlyph('warn') }}</span>
        <span class="fo-kpi-count">{{ kpis.atrasado }}</span>
        <span class="fo-kpi-label">Atrasadas <span class="fo-kpi-scope" title="Contagem na página atual">*</span></span>
      </div>
      <div class="fo-kpi-card fo-kpi-card--today" :data-active="activeAlert === 'hoje'" role="button" tabindex="0" :aria-pressed="activeAlert === 'hoje'" @click="toggleAlertFilter('hoje')" @keydown.enter="toggleAlertFilter('hoje')" @keydown.space.prevent="toggleAlertFilter('hoje')">
        <span class="fo-kpi-icon" aria-hidden="true">{{ resolveGlyph('alert') }}</span>
        <span class="fo-kpi-count">{{ kpis.hoje }}</span>
        <span class="fo-kpi-label">Vencem Hoje <span class="fo-kpi-scope" title="Contagem na página atual">*</span></span>
      </div>
      <div class="fo-kpi-card fo-kpi-card--week" :data-active="activeAlert === '7d'" role="button" tabindex="0" :aria-pressed="activeAlert === '7d'" @click="toggleAlertFilter('7d')" @keydown.enter="toggleAlertFilter('7d')" @keydown.space.prevent="toggleAlertFilter('7d')">
        <span class="fo-kpi-icon" aria-hidden="true">{{ resolveGlyph('bell') }}</span>
        <span class="fo-kpi-count">{{ kpis.semana }}</span>
        <span class="fo-kpi-label">Em 7 dias <span class="fo-kpi-scope" title="Contagem na página atual">*</span></span>
      </div>
      <div class="fo-kpi-card fo-kpi-card--month" :data-active="activeAlert === '30d'" role="button" tabindex="0" :aria-pressed="activeAlert === '30d'" @click="toggleAlertFilter('30d')" @keydown.enter="toggleAlertFilter('30d')" @keydown.space.prevent="toggleAlertFilter('30d')">
        <span class="fo-kpi-icon" aria-hidden="true">{{ resolveGlyph('clock') }}</span>
        <span class="fo-kpi-count">{{ kpis.mes }}</span>
        <span class="fo-kpi-label">Em 30 dias <span class="fo-kpi-scope" title="Contagem na página atual">*</span></span>
      </div>
      <div class="fo-kpi-card fo-kpi-card--ok" :data-active="activeAlert === 'ok'" role="button" tabindex="0" :aria-pressed="activeAlert === 'ok'" @click="toggleAlertFilter('ok')" @keydown.enter="toggleAlertFilter('ok')" @keydown.space.prevent="toggleAlertFilter('ok')">
        <span class="fo-kpi-icon" aria-hidden="true">{{ resolveGlyph('ok') }}</span>
        <span class="fo-kpi-count">{{ kpis.ok }}</span>
        <span class="fo-kpi-label">Em Dia <span class="fo-kpi-scope" title="Contagem na página atual">*</span></span>
      </div>
    </div>

    <!-- ── tabela principal ── -->
    <UiDataTable
      :columns="columns"
      :rows="r.items.value"
      :loading="r.loading.value"
      row-key="id"
      server-mode
      :sort="r.sort.value"
      :page="r.page.value"
      :page-size="r.pageSize.value"
      :total="r.total.value"
      paginated
      :empty="{ title: 'Nenhuma obrigação fiscal encontrada', description: 'Cadastre a primeira obrigação fiscal do tenant ou ajuste os filtros aplicados.' }"
      @update:sort="r.setSort"
      @update:page="r.setPage"
    >
      <!-- tipo da obrigação -->
      <template #cell-tipo="{ value }">
        <span class="fo-tipo-tag">{{ value || '—' }}</span>
      </template>

      <!-- indicador visual de alerta por prazo -->
      <template #cell-data_vencimento="{ row }">
        <span class="fo-due-cell">
          <span class="fo-alert-chip" :data-level="alertLevel(row.data_vencimento, row.status)" role="status" :aria-label="alertLabel(row.data_vencimento, row.status)">
            {{ alertLabel(row.data_vencimento, row.status) }}
          </span>
          <span class="fo-due-date">{{ format.formatDate(row.data_vencimento) }}</span>
        </span>
      </template>

      <!-- tipo de entidade -->
      <template #cell-entidade_tipo="{ value }">
        <span class="fo-entity-pill" :data-kind="value">
          {{ value || '—' }}
        </span>
      </template>

      <!-- status badge -->
      <template #cell-status="{ value }">
        <UiStatusBadge :status="value" with-dot />
      </template>

      <!-- valor estimado -->
      <template #cell-valor_estimado="{ value }">
        <span class="fo-currency">{{ value != null && value !== '' ? format.formatCurrency(value) : '—' }}</span>
      </template>

      <!-- periodicidade -->
      <template #cell-periodicidade="{ value }">
        <span v-if="value" class="fo-period-tag">{{ value }}</span>
        <span v-else class="fo-muted">—</span>
      </template>

      <!-- coluna de ações em linha -->
      <template #cell-_actions="{ row }">
        <span class="fo-row-actions">
          <button
            v-if="canMarkPaid(row)"
            class="fo-action-btn fo-action-btn--pay"
            :aria-label="'Marcar obrigação ' + (row.tipo || row.id) + ' como paga'"
            :disabled="actionLoading[row.id] === 'pay'"
            @click.stop="markAsPaid(row)"
          >
            <span v-if="actionLoading[row.id] === 'pay'" class="fo-spin" aria-hidden="true" />
            <span v-else aria-hidden="true">✓</span>
            Pago
          </button>
          <button
            v-if="canApprove(row)"
            class="fo-action-btn fo-action-btn--approve"
            :aria-label="'Aprovar obrigação ' + (row.tipo || row.id)"
            :disabled="actionLoading[row.id] === 'approve'"
            @click.stop="approveObligation(row)"
          >
            <span v-if="actionLoading[row.id] === 'approve'" class="fo-spin" aria-hidden="true" />
            <span v-else aria-hidden="true">★</span>
            Aprovar
          </button>
        </span>
      </template>

      <!-- ação do estado vazio -->
      <template #empty-action>
        <UiButton variant="primary" to="/fiscal-obligations/new">
          Cadastrar primeira obrigação
        </UiButton>
      </template>
    </UiDataTable>
  </UiPageLayout>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue';
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
  resolveGlyph,
} from '../ui/index.js';
import { BASE, resourceFactory, patchObligationStatus, me } from '../api.js';

// ─── recurso REST (integrador garante /v1/fiscal-obligations) ────────────────
const fiscalObligations = resourceFactory('fiscal-obligations');

// ─── estados e composables ───────────────────────────────────────────────────
const toast = useToast();
const ask = useConfirm();
const r = useResource(fiscalObligations);

// loading por linha para ações assíncronas
const actionLoading = reactive({});

// role do usuário — carregado via me() no mount para gate de aprovação (Contador/Admin)
// TODO: substituir por provide/inject de sessão OIDC quando store de sessão estiver disponível
const userRole = ref(null);

// loading do export
const exportLoading = ref(false);

// filtro de alerta ativo (clique no KPI card)
const activeAlert = ref(null);

// ─── colunas ─────────────────────────────────────────────────────────────────
const columns = [
  { key: 'tipo',            label: 'Tipo',            sortable: true },
  { key: 'data_vencimento', label: 'Vencimento',       sortable: true },
  { key: 'periodicidade',   label: 'Periodicidade',    sortable: false },
  { key: 'entidade_tipo',   label: 'Entidade',         sortable: true },
  { key: 'status',          label: 'Status',           sortable: true },
  { key: 'valor_estimado',  label: 'Valor Estimado',   sortable: true, align: 'right' },
  { key: '_actions',        label: 'Ações',            align: 'right' },
];

// ─── filtros ─────────────────────────────────────────────────────────────────
const filterFields = [
  {
    key: 'tipo',
    label: 'Tipo',
    type: 'select',
    options: [
      { value: 'IRPF',       label: 'IRPF' },
      { value: 'IRPJ',       label: 'IRPJ' },
      { value: 'ICMS',       label: 'ICMS' },
      { value: 'ISS',        label: 'ISS' },
      { value: 'DARF',       label: 'DARF' },
      { value: 'ECF',        label: 'ECF' },
      { value: 'ECD',        label: 'ECD' },
      { value: 'e-Social',   label: 'e-Social' },
      { value: 'CAGED',      label: 'CAGED' },
      { value: 'Simples DAS',label: 'Simples DAS' },
      { value: 'PER',        label: 'PER' },
      { value: 'DIRF',       label: 'DIRF' },
      { value: 'RRA',        label: 'RRA' },
      { value: 'outro',      label: 'Outro' },
    ],
  },
  {
    key: 'status',
    label: 'Status',
    type: 'select',
    options: [
      { value: 'pendente',   label: 'Pendente' },
      { value: 'pago',       label: 'Pago' },
      { value: 'aprovado',   label: 'Aprovado' },
      { value: 'atrasado',   label: 'Atrasado' },
      { value: 'cancelado',  label: 'Cancelado' },
    ],
  },
  {
    key: 'entidade_tipo',
    label: 'Entidade',
    type: 'select',
    options: [
      { value: 'PF', label: 'Pessoa Física (PF)' },
      { value: 'PJ', label: 'Pessoa Jurídica (PJ)' },
    ],
  },
  {
    key: 'periodicidade',
    label: 'Periodicidade',
    type: 'select',
    options: [
      { value: 'mensal',      label: 'Mensal' },
      { value: 'trimestral',  label: 'Trimestral' },
      { value: 'anual',       label: 'Anual' },
    ],
  },
  {
    key: 'vencimento_de',
    label: 'Vencimento de',
    type: 'date',
  },
  {
    key: 'vencimento_ate',
    label: 'Vencimento até',
    type: 'date',
  },
];

const filters = ref({
  tipo: '',
  status: '',
  entidade_tipo: '',
  periodicidade: '',
  vencimento_de: '',
  vencimento_ate: '',
});

function applyFilters() {
  activeAlert.value = null;
  r.setFilters({ ...filters.value });
}

function clearFilters() {
  activeAlert.value = null;
  filters.value = {
    tipo: '',
    status: '',
    entidade_tipo: '',
    periodicidade: '',
    vencimento_de: '',
    vencimento_ate: '',
  };
  r.setFilters({});
}

// ─── KPI cards por nível de alerta ───────────────────────────────────────────
// today é recalculado a cada chamada para não ficar obsoleto em SPAs de longa duração.
function getDaysUntil(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return null;
  d.setHours(0, 0, 0, 0);
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return Math.round((d - now) / 86400000);
}

function alertLevel(dateStr, status) {
  const paidStatuses = ['pago', 'aprovado', 'cancelado'];
  if (status && paidStatuses.includes(String(status).toLowerCase())) return 'ok';
  const days = getDaysUntil(dateStr);
  if (days === null) return 'neutral';
  if (days < 0)  return 'overdue';
  if (days === 0) return 'today';
  if (days <= 7)  return 'week';
  if (days <= 30) return 'month';
  return 'ok';
}

function alertLabel(dateStr, status) {
  const level = alertLevel(dateStr, status);
  switch (level) {
    case 'overdue': return 'Atrasada';
    case 'today':   return 'Hoje';
    case 'week':    return '7 dias';
    case 'month':   return '30 dias';
    case 'ok':      return 'Em dia';
    default:        return '—';
  }
}

const kpis = computed(() => {
  const items = r.items.value || [];
  return {
    atrasado: items.filter((row) => alertLevel(row.data_vencimento, row.status) === 'overdue').length,
    hoje:     items.filter((row) => alertLevel(row.data_vencimento, row.status) === 'today').length,
    semana:   items.filter((row) => alertLevel(row.data_vencimento, row.status) === 'week').length,
    mes:      items.filter((row) => alertLevel(row.data_vencimento, row.status) === 'month').length,
    ok:       items.filter((row) => alertLevel(row.data_vencimento, row.status) === 'ok').length,
  };
});

function toggleAlertFilter(level) {
  if (activeAlert.value === level) {
    activeAlert.value = null;
    r.setFilters({ ...filters.value });
  } else {
    activeAlert.value = level;
    // filtra client-side por enquanto — o servidor aceita o campo alert_level se implementado
    const alertMap = { atrasado: 'atrasado', hoje: 'hoje', '7d': '7d', '30d': '30d', ok: 'ok' };
    r.setFilters({ ...filters.value, alert_level: alertMap[level] });
  }
}

// ─── permissões de ação (role via header, simulado por flag meta-role) ────────
// O RBAC real vem do token OIDC/sessão. Aqui expõe flags simples
// que o integrador pode injetar via provide/inject ou store.
// Por ora, aprovação aparece para todos (o backend valida role Contador/Admin).
function canMarkPaid(row) {
  const inactiveStatuses = ['pago', 'aprovado', 'cancelado'];
  return !inactiveStatuses.includes(String(row.status || '').toLowerCase());
}

function canApprove(row) {
  // Aprovação: apenas Contador/Admin (spec). Gate no role do usuário carregado via me().
  // TODO: substituir por provide/inject de sessão OIDC quando store de sessão estiver disponível.
  const allowedRoles = ['contador', 'admin'];
  if (userRole.value && !allowedRoles.includes(String(userRole.value).toLowerCase())) return false;
  const doneStatuses = ['aprovado', 'pago', 'cancelado'];
  return !doneStatuses.includes(String(row.status || '').toLowerCase());
}

// ─── ação: Marcar como Pago (PATCH /v1/fiscal-obligations/:id/status) ─────────
async function markAsPaid(row) {
  const confirmed = await ask({
    title: 'Marcar como Pago',
    message: `Confirma que a obrigação "${row.tipo || 'selecionada'}" (venc. ${format.formatDate(row.data_vencimento)}) foi paga?`,
    confirmLabel: 'Sim, marcar como pago',
    danger: false,
  });
  if (!confirmed) return;

  actionLoading[row.id] = 'pay';
  try {
    await patchObligationStatus(row.id, 'pago');
    toast.success('Obrigação marcada como paga com sucesso.');
    r.load();
  } catch (e) {
    toast.error(e.message || 'Erro ao marcar obrigação como paga. Tente novamente.');
  } finally {
    delete actionLoading[row.id];
  }
}

// ─── ação: Aprovar (PATCH /v1/fiscal-obligations/:id/status com status=aprovado) ─
async function approveObligation(row) {
  const confirmed = await ask({
    title: 'Aprovar Obrigação',
    message: `Confirma a aprovação da obrigação "${row.tipo || 'selecionada'}" (venc. ${format.formatDate(row.data_vencimento)})?`,
    confirmLabel: 'Sim, aprovar',
    danger: false,
  });
  if (!confirmed) return;

  actionLoading[row.id] = 'approve';
  try {
    await patchObligationStatus(row.id, 'aprovado');
    toast.success('Obrigação aprovada com sucesso.');
    r.load();
  } catch (e) {
    toast.error(e.message || 'Erro ao aprovar obrigação. Tente novamente.');
  } finally {
    delete actionLoading[row.id];
  }
}

// ─── exportar compliance (GET /v1/dashboard/obligations/compliance) ───────────
async function exportCompliance() {
  exportLoading.value = true;
  try {
    const res = await fetch(BASE + '/v1/dashboard/obligations/compliance', {
      headers: { 'Accept': 'application/octet-stream,application/json' },
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error((data && data.error && data.error.message) || ('HTTP ' + res.status));
    }
    // tenta download via blob
    const blob = await res.blob();
    const contentDisposition = res.headers.get('content-disposition') || '';
    const match = contentDisposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
    const filename = match ? match[1].replace(/['"]/g, '') : 'compliance-obrigacoes.pdf';
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success('Relatório de compliance exportado com sucesso.');
  } catch (e) {
    toast.error(e.message || 'Erro ao exportar relatório de compliance.');
  } finally {
    exportLoading.value = false;
  }
}

// ─── init ─────────────────────────────────────────────────────────────────────
onMounted(async () => {
  r.load();
  try {
    const user = await me();
    userRole.value = (user && (user.role || user.perfil)) || null;
  } catch {
    // se me() falhar (ex.: sessão não iniciada), userRole permanece null
    // e canApprove() não filtra por role — o backend garante a rejeição
  }
});
</script>

<style scoped>
/* ── KPI cards de alerta ── */
.fo-kpi-row {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: var(--ui-space-3);
}

@media (max-width: 860px) {
  .fo-kpi-row {
    grid-template-columns: repeat(3, 1fr);
  }
}

@media (max-width: 540px) {
  .fo-kpi-row {
    grid-template-columns: repeat(2, 1fr);
  }
}

.fo-kpi-card {
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
.fo-kpi-card:focus-visible {
  outline: 2px solid rgb(var(--ui-accent));
  outline-offset: 2px;
}
.fo-kpi-card[data-active="true"],
.fo-kpi-card:hover {
  box-shadow: 0 4px 16px rgb(0 0 0 / 0.1);
}

.fo-kpi-card--overdue {
  border-color: rgb(var(--ui-danger) / 0.25);
}
.fo-kpi-card--overdue[data-active="true"],
.fo-kpi-card--overdue:hover {
  background: rgb(var(--ui-danger) / 0.07);
  border-color: rgb(var(--ui-danger) / 0.6);
}

.fo-kpi-card--today {
  border-color: rgb(var(--ui-danger) / 0.2);
}
.fo-kpi-card--today[data-active="true"],
.fo-kpi-card--today:hover {
  background: rgb(var(--ui-danger) / 0.05);
  border-color: rgb(var(--ui-danger) / 0.45);
}

.fo-kpi-card--week {
  border-color: rgb(var(--ui-warn) / 0.25);
}
.fo-kpi-card--week[data-active="true"],
.fo-kpi-card--week:hover {
  background: rgb(var(--ui-warn) / 0.07);
  border-color: rgb(var(--ui-warn) / 0.55);
}

.fo-kpi-card--month {
  border-color: rgb(var(--ui-warn) / 0.18);
}
.fo-kpi-card--month[data-active="true"],
.fo-kpi-card--month:hover {
  background: rgb(var(--ui-warn) / 0.05);
  border-color: rgb(var(--ui-warn) / 0.4);
}

.fo-kpi-card--ok {
  border-color: rgb(var(--ui-ok) / 0.2);
}
.fo-kpi-card--ok[data-active="true"],
.fo-kpi-card--ok:hover {
  background: rgb(var(--ui-ok) / 0.06);
  border-color: rgb(var(--ui-ok) / 0.5);
}

.fo-kpi-icon {
  font-size: 1.4rem;
  line-height: 1;
}

.fo-kpi-count {
  font-size: 2rem;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
  line-height: 1;
  color: rgb(var(--ui-fg));
}

.fo-kpi-label {
  font-size: var(--ui-text-xs);
  font-weight: 600;
  color: rgb(var(--ui-muted));
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.fo-kpi-scope {
  font-size: var(--ui-text-xs);
  font-weight: 400;
  color: rgb(var(--ui-muted) / 0.6);
  cursor: help;
  text-transform: none;
  letter-spacing: 0;
}

/* ── célula de vencimento com chip de alerta ── */
.fo-due-cell {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.fo-alert-chip {
  display: inline-flex;
  align-items: center;
  font-size: var(--ui-text-xs);
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  border-radius: var(--ui-radius-pill);
  padding: 2px 8px;
  white-space: nowrap;
}

.fo-alert-chip[data-level="overdue"] {
  background: rgb(var(--ui-danger) / 0.15);
  color: rgb(var(--ui-danger));
  outline: 1px solid rgb(var(--ui-danger) / 0.35);
}

.fo-alert-chip[data-level="today"] {
  background: rgb(var(--ui-danger) / 0.1);
  color: rgb(var(--ui-danger));
}

.fo-alert-chip[data-level="week"] {
  background: rgb(var(--ui-warn) / 0.15);
  color: rgb(var(--ui-warn));
}

.fo-alert-chip[data-level="month"] {
  background: rgb(var(--ui-warn) / 0.15);
  color: rgb(var(--ui-warn));
}

.fo-alert-chip[data-level="ok"] {
  background: rgb(var(--ui-ok) / 0.12);
  color: rgb(var(--ui-ok));
}

.fo-alert-chip[data-level="neutral"] {
  background: rgb(var(--ui-muted) / 0.1);
  color: rgb(var(--ui-muted));
}

.fo-due-date {
  font-size: var(--ui-text-sm);
  font-variant-numeric: tabular-nums;
  color: rgb(var(--ui-fg));
}

/* ── tipo tag ── */
.fo-tipo-tag {
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

/* ── entidade pill ── */
.fo-entity-pill {
  display: inline-flex;
  align-items: center;
  font-size: var(--ui-text-xs);
  font-weight: 600;
  border-radius: var(--ui-radius-pill);
  padding: 2px 10px;
  white-space: nowrap;
}

.fo-entity-pill[data-kind="PF"] {
  background: rgb(var(--ui-ok) / 0.12);
  color: rgb(var(--ui-ok));
}

.fo-entity-pill[data-kind="PJ"] {
  background: rgb(var(--ui-warn) / 0.14);
  color: rgb(var(--ui-warn));
}

.fo-entity-pill:not([data-kind="PF"]):not([data-kind="PJ"]) {
  background: rgb(var(--ui-muted) / 0.12);
  color: rgb(var(--ui-muted));
}

/* ── periodicidade ── */
.fo-period-tag {
  display: inline-block;
  font-size: var(--ui-text-xs);
  font-weight: 600;
  border-radius: var(--ui-radius-sm);
  padding: 2px 8px;
  background: rgb(var(--ui-surface-2));
  color: rgb(var(--ui-muted));
  text-transform: capitalize;
}

/* ── valores monetários ── */
.fo-currency {
  font-variant-numeric: tabular-nums;
  font-size: var(--ui-text-sm);
  color: rgb(var(--ui-fg));
  white-space: nowrap;
}

/* ── muted placeholder ── */
.fo-muted {
  color: rgb(var(--ui-muted));
}

/* ── ações em linha ── */
.fo-row-actions {
  display: inline-flex;
  align-items: center;
  gap: var(--ui-space-2);
}

.fo-action-btn {
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

.fo-action-btn:focus-visible {
  outline: 2px solid rgb(var(--ui-accent));
  outline-offset: 2px;
}

.fo-action-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.fo-action-btn--pay {
  color: rgb(var(--ui-ok));
  border-color: rgb(var(--ui-ok) / 0.35);
  background: rgb(var(--ui-ok) / 0.06);
}
.fo-action-btn--pay:not(:disabled):hover {
  background: rgb(var(--ui-ok) / 0.16);
  border-color: rgb(var(--ui-ok) / 0.6);
}

.fo-action-btn--approve {
  color: rgb(var(--ui-accent-strong));
  border-color: rgb(var(--ui-accent) / 0.35);
  background: rgb(var(--ui-accent) / 0.06);
}
.fo-action-btn--approve:not(:disabled):hover {
  background: rgb(var(--ui-accent) / 0.16);
  border-color: rgb(var(--ui-accent) / 0.6);
}

/* ── spinner inline ── */
.fo-spin {
  display: inline-block;
  width: 11px;
  height: 11px;
  border: 2px solid currentColor;
  border-top-color: transparent;
  border-radius: 50%;
  animation: fo-spin 0.6s linear infinite;
}

@keyframes fo-spin {
  to { transform: rotate(360deg); }
}
</style>
