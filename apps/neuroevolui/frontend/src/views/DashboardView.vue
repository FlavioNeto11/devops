<!--
  DashboardView — Dashboard Clínico (REQ-NEUROEVOLUI-0005 / 0004 / 0001).
  Visão consolidada: KPIs de receita, próximas consultas, pacientes ativos,
  status de filas assíncronas e alertas de jobs com falha.
  O gestor filtra por período e profissional.

  Endpoints REAIS:
    GET /v1/dashboard/revenue  → meta (revenue_cents, total, by_period[])
    GET /v1/patients           → lista de pacientes ativos
    GET /v1/consultations      → agenda / atendimentos
    GET /v1/async-jobs         → status das filas BullMQ

  Cada bloco carrega de forma independente (fail-soft): um erro degrada SÓ
  aquele bloco — a tela nunca fica em branco. Cards de métrica navegam para
  listas de domínio.
-->
<template>
  <UiPageLayout
    title="Dashboard Clínico"
    eyebrow="NeuroEvolui"
    subtitle="Receita do período, próximas consultas, pacientes ativos e status das filas."
    width="wide"
    :error="fatalError"
    @retry="loadAll(true)"
  >
    <!-- Ações do topo -->
    <template #actions>
      <UiButton variant="subtle" :loading="anyLoading" @click="loadAll(true)">Atualizar</UiButton>
      <UiButton to="/consultations/new">Novo agendamento</UiButton>
    </template>

    <!-- Barra de filtros: período + profissional -->
    <template #filters>
      <UiFiltersPanel
        v-model="filters"
        :fields="filterFields"
        @apply="applyFilters"
        @clear="applyFilters"
      />
    </template>

    <!-- ───── KPIs ───── -->
    <section class="dash-kpis" aria-label="Indicadores de desempenho">
      <UiMetricCard
        label="Receita do período"
        :value="kpiRevenue"
        :tone="revenueDenied ? 'neutral' : 'success'"
        :hint="kpiRevenueHint"
        :loading="revenue.loading"
        clickable
        @click="go('/financial')"
      />
      <UiMetricCard
        label="Pacientes ativos"
        :value="kpiPatients"
        tone="primary"
        :hint="kpiPatientsHint"
        :loading="patients.loading"
        clickable
        @click="go('/patients')"
      />
      <UiMetricCard
        label="Consultas no período"
        :value="kpiConsultations"
        tone="running"
        :hint="kpiConsultationsHint"
        :loading="consultations.loading"
        clickable
        @click="go('/consultations')"
      />
      <UiMetricCard
        label="Jobs com falha"
        :value="kpiFailedJobs"
        :tone="kpiJobsTone"
        :hint="kpiJobsHint"
        :loading="asyncJobs.loading"
        clickable
        @click="go('/async-jobs')"
      />
    </section>

    <!-- ───── Gráfico de receita + mini calendário ───── -->
    <div class="dash-row-main">

      <!-- Gráfico de receita por período -->
      <UiCard title="Receita por período" :subtitle="revenueChartSubtitle">
        <template #actions>
          <UiButton variant="ghost" size="sm" to="/financial">Ver detalhes</UiButton>
        </template>

        <UiErrorState
          v-if="revenue.error && !revenueDenied"
          message="Não foi possível carregar os dados de receita."
          :retryable="true"
          @retry="loadRevenue"
        />
        <div v-else-if="revenueDenied" class="dash-denied" role="status">
          <span class="dash-denied-icon" aria-hidden="true">◫</span>
          <span>Seu perfil não tem acesso à receita financeira.</span>
        </div>
        <div v-else class="dash-chart" aria-label="Gráfico de barras de receita por período" role="img">
          <div v-if="revenue.loading" class="dash-chart-loading" aria-live="polite" aria-busy="true">
            <div v-for="n in 6" :key="n" class="dash-chart-bar-sk" />
          </div>
          <template v-else-if="revenueByPeriod.length === 0">
            <UiEmptyState
              title="Nenhum dado de receita"
              description="Não há dados de receita para o período selecionado."
              icon="chart"
            >
              <template #action>
                <UiButton variant="ghost" size="sm" to="/payment-transactions">Ver transações</UiButton>
              </template>
            </UiEmptyState>
          </template>
          <template v-else>
            <!-- Eixo Y -->
            <div class="dash-chart-y" aria-hidden="true">
              <span v-for="tick in yTicks" :key="tick" class="dash-chart-ytick">{{ tick }}</span>
            </div>
            <!-- Barras -->
            <div class="dash-chart-bars" role="list">
              <div
                v-for="bar in chartBars"
                :key="bar.label"
                class="dash-chart-col"
                role="listitem"
                :aria-label="bar.label + ': ' + bar.valueLabel"
              >
                <div class="dash-chart-bar-wrap">
                  <div
                    class="dash-chart-bar"
                    :data-pct-bucket="bar.pctBucket"
                    :data-tone="bar.isCurrent ? 'primary' : 'neutral'"
                    :title="bar.label + ': ' + bar.valueLabel"
                  />
                </div>
                <span class="dash-chart-label">{{ bar.shortLabel }}</span>
                <span class="dash-chart-val">{{ bar.valueLabel }}</span>
              </div>
            </div>
          </template>
        </div>
      </UiCard>

      <!-- Mini calendário de consultas -->
      <UiCard title="Próximas consultas" :subtitle="calendarSubtitle">
        <template #actions>
          <UiButton variant="ghost" size="sm" to="/consultations">Ver todos</UiButton>
        </template>

        <UiErrorState
          v-if="consultations.error"
          :message="consultationsErrorMsg"
          :retryable="true"
          @retry="loadConsultations"
        />
        <div v-else class="dash-calendar">
          <!-- Cabeçalho visual dos dias da semana (decorativo: a data completa
               é anunciada no aria-label de cada item da lista abaixo) -->
          <div class="dash-cal-header" aria-hidden="true">
            <div
              v-for="day in weekDays"
              :key="day.isoDate"
              class="dash-cal-day-head"
              :data-today="day.isToday ? 'true' : null"
            >
              <span class="dash-cal-wday">{{ day.weekLabel }}</span>
              <span class="dash-cal-date">{{ day.dateLabel }}</span>
            </div>
          </div>
          <!-- Eventos por dia -->
          <div class="dash-cal-body" role="list" aria-label="Calendário semanal de consultas">
            <div
              v-for="day in weekDays"
              :key="day.isoDate + '-body'"
              class="dash-cal-cell"
              :data-today="day.isToday ? 'true' : null"
              role="listitem"
              :aria-label="day.fullLabel + ': ' + (day.consultations.length || 'nenhuma') + ' consulta(s)'"
            >
              <div
                v-if="consultations.loading"
                class="dash-cal-sk"
                aria-hidden="true"
              />
              <template v-else>
                <button
                  v-for="c in day.consultations.slice(0, 3)"
                  :key="c.id"
                  class="dash-cal-event"
                  :data-status="c.status || 'scheduled'"
                  :aria-label="fmtTime(c.scheduled_at) + ' — ' + eventPatientLabel(c)"
                  @click="go('/consultations/' + c.id)"
                >
                  <span class="dash-cal-event-time">{{ fmtTime(c.scheduled_at) }}</span>
                  <span class="dash-cal-event-label">{{ eventPatientLabel(c) }}</span>
                </button>
                <span
                  v-if="day.consultations.length > 3"
                  class="dash-cal-more"
                >+{{ day.consultations.length - 3 }}</span>
                <span
                  v-if="day.consultations.length === 0 && !consultations.loading"
                  class="dash-cal-empty"
                  aria-hidden="true"
                >—</span>
              </template>
            </div>
          </div>
        </div>
      </UiCard>
    </div>

    <!-- ───── Tabela de pacientes recentes + status das filas ───── -->
    <div class="dash-row-bottom">

      <!-- Pacientes recentes -->
      <UiCard title="Pacientes recentes" subtitle="Últimos cadastros no período.">
        <template #actions>
          <UiButton variant="ghost" size="sm" to="/patients">Ver todos</UiButton>
        </template>

        <UiErrorState
          v-if="patients.error && !patientsDenied"
          message="Não foi possível carregar os pacientes."
          :retryable="true"
          @retry="loadPatients"
        />
        <UiDataTable
          v-else
          :columns="patientsColumns"
          :rows="recentPatients"
          :loading="patients.loading"
          row-key="id"
          density="compact"
          clickable-rows
          :empty="{
            title: 'Nenhum paciente cadastrado',
            description: 'Cadastre o primeiro paciente da clínica.',
            icon: 'person',
          }"
          @row-click="(row) => go('/patients/' + row.id)"
        >
          <template #cell-status="{ value }">
            <UiStatusBadge :status="value || 'active'" />
          </template>
          <template #cell-created_at="{ value }">
            {{ format.formatDate(value) }}
          </template>
          <template #empty-action>
            <UiButton to="/patients/new">Cadastrar paciente</UiButton>
          </template>
        </UiDataTable>
      </UiCard>

      <!-- Status das filas assíncronas -->
      <UiCard title="Filas assíncronas" subtitle="Status dos jobs em processamento (BullMQ).">
        <template #actions>
          <UiButton variant="ghost" size="sm" to="/async-jobs">Ver monitor</UiButton>
        </template>

        <UiErrorState
          v-if="asyncJobs.error"
          message="Não foi possível carregar os jobs."
          :retryable="true"
          @retry="loadAsyncJobs"
        />
        <div v-else-if="asyncJobs.loading" class="dash-jobs-loading" aria-live="polite">
          <div v-for="n in 4" :key="n" class="dash-jobs-sk" />
        </div>
        <div v-else-if="recentJobs.length === 0" class="dash-jobs-empty">
          <UiEmptyState
            title="Nenhum job recente"
            description="Não há jobs no período selecionado."
            icon="check"
            compact
          />
        </div>
        <div v-else class="dash-jobs" role="list" aria-label="Jobs recentes">
          <div
            v-for="job in recentJobs"
            :key="job.id"
            class="dash-job-row"
            role="listitem"
          >
            <div class="dash-job-info">
              <span class="dash-job-name">{{ job.name || job.job_type || 'Job' }}</span>
              <span class="dash-job-meta">{{ format.formatDateTime(job.created_at || job.updated_at) }}</span>
            </div>
            <UiStatusBadge :status="job.status || 'pending'" with-dot />
          </div>
        </div>

        <!-- Sumário de contagens por status -->
        <div v-if="!asyncJobs.loading && !asyncJobs.error" class="dash-jobs-summary" aria-label="Sumário dos jobs">
          <div
            v-for="s in jobsSummary"
            :key="s.status"
            class="dash-jobs-count"
            :data-tone="s.tone"
          >
            <span class="dash-jobs-count-num">{{ s.count }}</span>
            <span class="dash-jobs-count-label">{{ s.label }}</span>
          </div>
        </div>
      </UiCard>
    </div>

    <!-- Footer -->
    <template #footer>
      Painel atualizado em {{ lastUpdatedLabel }}.
      Filtro: {{ filterPeriodLabel }} · {{ filterProfessionalLabel }}.
    </template>
  </UiPageLayout>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import {
  UiPageLayout,
  UiCard,
  UiMetricCard,
  UiDataTable,
  UiStatusBadge,
  UiButton,
  UiFiltersPanel,
  UiErrorState,
  UiEmptyState,
  useToast,
  format,
} from '../ui/index.js';
import {
  resourceFactory,
  patients as patientsApi,
  consultations as consultationsApi,
  asyncJobs as asyncJobsApi,
  professionals as professionalsApi,
} from '../api.js';

const router = useRouter();
const toast = useToast();

// Recurso do dashboard/revenue — não está no barrel, usa resourceFactory direto.
const dashboardRevenueApi = resourceFactory('dashboard/revenue');

// ── Estado de filtros ──────────────────────────────────────────────────────────
const filters = ref({ period: 'month', professional_id: '' });
const professionalsOptions = ref([]);

const filterFields = computed(() => [
  {
    key: 'period',
    label: 'Período',
    type: 'select',
    options: [
      { value: 'today', label: 'Hoje' },
      { value: 'week', label: 'Esta semana' },
      { value: 'month', label: 'Este mês' },
      { value: 'quarter', label: 'Este trimestre' },
      { value: 'year', label: 'Este ano' },
    ],
  },
  {
    key: 'professional_id',
    label: 'Profissional',
    type: 'select',
    options: professionalsOptions.value.map((p) => ({
      value: String(p.id),
      label: p.name || p.full_name || ('Profissional ' + p.id),
    })),
  },
]);

// ── Estados por bloco (fail-soft) ─────────────────────────────────────────────
const revenue   = reactive({ loading: true, error: null, meta: null, byPeriod: [] });
const patients  = reactive({ loading: true, error: null, rows: [], total: 0 });
const consultations = reactive({ loading: true, error: null, rows: [] });
const asyncJobs = reactive({ loading: true, error: null, rows: [] });
const lastUpdated = ref(null);

// ── Helpers ───────────────────────────────────────────────────────────────────
function isDenied(err) {
  return !!err && (err.status === 403 || err.status === 401);
}
function go(to) { router.push(to); }
function isoDate(date) {
  const d = date instanceof Date ? date : new Date(date);
  if (isNaN(d.getTime())) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
function fmtTime(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (isNaN(d.getTime())) return '—';
  try {
    return new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(d);
  } catch {
    return '—';
  }
}

// ── Derivados: filtros ─────────────────────────────────────────────────────────
const PERIOD_LABELS = {
  today: 'Hoje',
  week: 'Esta semana',
  month: 'Este mês',
  quarter: 'Este trimestre',
  year: 'Este ano',
};
const filterPeriodLabel = computed(
  () => PERIOD_LABELS[filters.value.period] || filters.value.period || 'Este mês',
);
const filterProfessionalLabel = computed(() => {
  if (!filters.value.professional_id) return 'Todos os profissionais';
  const found = professionalsOptions.value.find(
    (p) => String(p.id) === String(filters.value.professional_id),
  );
  return found ? (found.name || found.full_name || 'Profissional') : 'Profissional';
});

// ── Derivados: receita ────────────────────────────────────────────────────────
const revenueDenied = computed(() => isDenied(revenue.error));
const kpiRevenue = computed(() => {
  if (revenueDenied.value) return 'Sem acesso';
  if (revenue.error) return '—';
  if (revenue.meta === null) return '—';
  const cents = revenue.meta.revenue_cents ?? 0;
  return format.formatCurrency(cents / 100);
});
const kpiRevenueHint = computed(() => {
  if (revenue.loading) return 'apurando…';
  if (revenueDenied.value) return 'requer perfil de gestão';
  if (revenue.error) return 'falha ao apurar';
  const total = revenue.meta?.total ?? 0;
  return total ? `de ${format.formatNumber(total)} consulta(s)` : 'sem cobranças no período';
});
const revenueByPeriod = computed(() => revenue.byPeriod || []);
const revenueChartSubtitle = computed(() => {
  if (revenue.loading) return 'Carregando…';
  if (revenueDenied.value) return 'Acesso restrito';
  return filterPeriodLabel.value;
});

// Normaliza barras para o gráfico (sem `:style`, usa data-pct-bucket para CSS)
const chartBars = computed(() => {
  const bars = revenueByPeriod.value;
  if (!bars.length) return [];
  const maxVal = Math.max(...bars.map((b) => Number(b.revenue_cents ?? b.value ?? 0)), 1);
  const today = isoDate(new Date());
  return bars.map((b) => {
    const raw = Number(b.revenue_cents ?? b.value ?? 0);
    const pct = maxVal > 0 ? Math.round((raw / maxVal) * 100) : 0;
    // Bucket: 0-9 → 10, 10-19 → 20, …, 90-100 → 100 (10 buckets for CSS)
    const pctBucket = Math.max(10, Math.ceil(pct / 10) * 10);
    const label = b.label || b.period || b.date || '—';
    const shortLabel = label.length > 6 ? label.slice(-5) : label;
    const isCurrent = b.date === today || b.period === today;
    return {
      label,
      shortLabel,
      valueLabel: format.formatCurrency(raw / 100),
      pct,
      pctBucket,
      isCurrent,
    };
  });
});
const yTicks = computed(() => {
  const bars = revenueByPeriod.value;
  if (!bars.length) return [];
  const maxVal = Math.max(...bars.map((b) => Number(b.revenue_cents ?? b.value ?? 0)), 1);
  const top = maxVal / 100; // convert cents → reais
  return [
    format.formatCurrency(top),
    format.formatCurrency(top * 0.75),
    format.formatCurrency(top * 0.5),
    format.formatCurrency(top * 0.25),
    'R$ 0',
  ];
});

// ── Derivados: mini calendário semanal ───────────────────────────────────────
const weekDays = computed(() => {
  const now = new Date();
  const dow = now.getDay(); // 0=Sun
  // Semana começa na segunda (1). Se hoje é dom(0), voltar 6 dias; senão dow-1.
  const startOffset = dow === 0 ? -6 : -(dow - 1);
  const days = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(now);
    d.setDate(now.getDate() + startOffset + i);
    const iso = isoDate(d);
    const isToday = iso === isoDate(now);
    const dayConsultations = consultations.rows.filter((c) => {
      if (!c.scheduled_at) return false;
      return isoDate(new Date(c.scheduled_at)) === iso;
    });
    days.push({
      isoDate: iso,
      isToday,
      weekLabel: ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'][d.getDay()],
      dateLabel: String(d.getDate()).padStart(2, '0'),
      fullLabel: new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: 'numeric', month: 'short' }).format(d),
      consultations: dayConsultations,
    });
  }
  return days;
});
const calendarSubtitle = computed(() => {
  // Recorte fixo: este card mostra sempre a SEMANA ATUAL, independentemente do
  // filtro de período que rege os KPIs — deixamos isso explícito no rótulo.
  if (consultations.loading) return 'Semana atual · carregando…';
  const today = weekDays.value.find((d) => d.isToday);
  const n = today ? today.consultations.length : 0;
  return `Semana atual · ${n ? `${n} consulta(s) hoje` : 'nenhuma consulta hoje'}`;
});

// Catálogo id→paciente (a partir dos pacientes já carregados no painel) para
// rotular os eventos do calendário com o nome em vez do ID cru.
const patientsById = computed(() => {
  const map = {};
  for (const p of patients.rows) if (p && p.id != null) map[p.id] = p;
  return map;
});
function eventPatientLabel(c) {
  if (c && c.patient_name) return c.patient_name;
  const p = c && c.patient_id != null ? patientsById.value[c.patient_id] : null;
  return (p && (p.full_name || p.name)) || 'Paciente';
}

// ── Derivados: pacientes ──────────────────────────────────────────────────────
const patientsDenied = computed(() => isDenied(patients.error));
const kpiPatients = computed(() => {
  if (patientsDenied.value) return 'Sem acesso';
  if (patients.error) return '—';
  return format.formatNumber(patients.total);
});
const kpiPatientsHint = computed(() => {
  if (patients.loading) return 'apurando…';
  if (patientsDenied.value) return 'requer acesso ao prontuário';
  if (patients.error) return 'falha ao carregar';
  return 'cadastrados na clínica';
});
const recentPatients = computed(() => patients.rows.slice(0, 8));
const patientsColumns = [
  { key: 'name', label: 'Paciente', sortable: false },
  { key: 'document', label: 'CPF' },
  { key: 'created_at', label: 'Cadastro', format: 'date' },
  { key: 'status', label: 'Situação', format: 'badge' },
];

// ── Derivados: consultas ──────────────────────────────────────────────────────
const kpiConsultations = computed(() => {
  if (consultations.error) return '—';
  return format.formatNumber(consultations.rows.length);
});
const kpiConsultationsHint = computed(() => {
  if (consultations.loading) return 'apurando…';
  if (consultations.error) return 'falha ao carregar';
  const upcoming = consultations.rows.filter((c) => {
    if (!c.scheduled_at) return false;
    return new Date(c.scheduled_at) >= new Date();
  }).length;
  return upcoming ? `${upcoming} futura(s) agendada(s)` : 'no período';
});
const consultationsErrorMsg = computed(() =>
  isDenied(consultations.error)
    ? 'Seu perfil não tem acesso aos agendamentos.'
    : 'Não foi possível carregar os agendamentos.',
);

// ── Derivados: async jobs ─────────────────────────────────────────────────────
const failedJobsCount = computed(
  () => asyncJobs.rows.filter((j) => j.status === 'failed' || j.status === 'error').length,
);
const kpiFailedJobs = computed(() => {
  if (asyncJobs.error) return '—';
  return format.formatNumber(failedJobsCount.value);
});
const kpiJobsTone = computed(() => {
  if (asyncJobs.error) return 'error';
  if (failedJobsCount.value > 0) return 'error';
  const pending = asyncJobs.rows.filter((j) => j.status === 'pending' || j.status === 'running').length;
  return pending > 0 ? 'warning' : 'success';
});
const kpiJobsHint = computed(() => {
  if (asyncJobs.loading) return 'verificando filas…';
  if (asyncJobs.error) return 'fila indisponível';
  if (failedJobsCount.value > 0) return `${failedJobsCount.value} job(s) requerem atenção`;
  return 'todas as filas operando';
});
const recentJobs = computed(() => asyncJobs.rows.slice(0, 8));
const jobsSummary = computed(() => {
  const rows = asyncJobs.rows;
  const count = (statuses) => rows.filter((j) => statuses.includes(j.status)).length;
  return [
    { status: 'completed', label: 'Concluídos', tone: 'success', count: count(['completed', 'done', 'paid']) },
    { status: 'running', label: 'Em execução', tone: 'running', count: count(['running', 'active', 'processing']) },
    { status: 'pending', label: 'Aguardando', tone: 'warning', count: count(['pending', 'waiting', 'queued']) },
    { status: 'failed', label: 'Com falha', tone: 'error', count: count(['failed', 'error', 'dlq']) },
  ];
});

// ── Estados globais ───────────────────────────────────────────────────────────
const anyLoading = computed(
  () => revenue.loading || patients.loading || consultations.loading || asyncJobs.loading,
);
const fatalError = computed(() => {
  const allDone = !revenue.loading && !patients.loading && !consultations.loading && !asyncJobs.loading;
  const allFailed = revenue.error && patients.error && consultations.error && asyncJobs.error;
  return allDone && allFailed ? 'Não foi possível carregar o painel clínico.' : null;
});
const lastUpdatedLabel = computed(
  () => (lastUpdated.value ? format.formatDateTime(lastUpdated.value) : '—'),
);

// ── Carregamento (fail-soft por bloco) ────────────────────────────────────────
async function loadRevenue() {
  revenue.loading = true;
  revenue.error = null;
  try {
    const params = { period: filters.value.period };
    if (filters.value.professional_id) params.professional_id = filters.value.professional_id;
    const r = await dashboardRevenueApi.list(params);
    // Suporta: { meta, data: [...] } ou { data: [...], total }
    const rows = Array.isArray(r?.data) ? r.data : Array.isArray(r) ? r : [];
    revenue.meta = r?.meta || { revenue_cents: rows.reduce((s, x) => s + (x.revenue_cents ?? 0), 0), total: rows.length };
    revenue.byPeriod = rows;
  } catch (e) {
    revenue.error = e;
    revenue.meta = null;
    revenue.byPeriod = [];
  } finally {
    revenue.loading = false;
  }
}

async function loadPatients() {
  patients.loading = true;
  patients.error = null;
  try {
    const params = { period: filters.value.period, pageSize: 50 };
    if (filters.value.professional_id) params.professional_id = filters.value.professional_id;
    const r = await patientsApi.list(params);
    const rows = Array.isArray(r?.data) ? r.data : Array.isArray(r) ? r : [];
    patients.rows = rows;
    patients.total = r?.total ?? rows.length;
  } catch (e) {
    patients.error = e;
    patients.rows = [];
    patients.total = 0;
  } finally {
    patients.loading = false;
  }
}

async function loadConsultations() {
  consultations.loading = true;
  consultations.error = null;
  try {
    const params = { period: filters.value.period, pageSize: 100 };
    if (filters.value.professional_id) params.professional_id = filters.value.professional_id;
    const r = await consultationsApi.list(params);
    consultations.rows = Array.isArray(r?.data) ? r.data : Array.isArray(r) ? r : [];
  } catch (e) {
    consultations.error = e;
    consultations.rows = [];
  } finally {
    consultations.loading = false;
  }
}

async function loadAsyncJobs() {
  asyncJobs.loading = true;
  asyncJobs.error = null;
  try {
    const r = await asyncJobsApi.list({ pageSize: 50 });
    asyncJobs.rows = Array.isArray(r?.data) ? r.data : Array.isArray(r) ? r : [];
  } catch (e) {
    asyncJobs.error = e;
    asyncJobs.rows = [];
  } finally {
    asyncJobs.loading = false;
  }
}

async function loadProfessionals() {
  try {
    const r = await professionalsApi.list({ pageSize: 100 });
    professionalsOptions.value = Array.isArray(r?.data) ? r.data : Array.isArray(r) ? r : [];
  } catch {
    // Não crítico — o filtro fica sem opções, funciona com "Todos"
    professionalsOptions.value = [];
  }
}

// `manual` distingue o refresh acionado pelo usuário (botão Atualizar / filtros)
// do carregamento inicial no mount. Só o refresh manual emite o toast de status —
// o carregamento inicial é silencioso (erros por bloco já aparecem inline).
async function loadAll(manual = false) {
  await Promise.allSettled([
    loadRevenue(),
    loadPatients(),
    loadConsultations(),
    loadAsyncJobs(),
  ]);
  lastUpdated.value = new Date().toISOString();
  if (!manual) return;
  const blockErrors = [revenue.error, patients.error, consultations.error, asyncJobs.error].filter(Boolean).length;
  if (blockErrors === 0) {
    toast.success('Painel atualizado');
  } else if (blockErrors < 4) {
    toast.warning('Painel atualizado com pendências em alguns blocos');
  } else {
    toast.error('Falha ao atualizar o painel');
  }
}

function applyFilters() {
  loadAll(true);
}

onMounted(async () => {
  await loadProfessionals();
  await loadAll(false);
});
</script>

<style scoped>
/* ── KPIs ─────────────────────────────────────────────────────────────────── */
.dash-kpis {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: var(--ui-space-4);
}

/* ── Layout principal (gráfico + calendário) ──────────────────────────────── */
.dash-row-main {
  display: grid;
  grid-template-columns: 1.6fr 1fr;
  gap: var(--ui-space-4);
  align-items: start;
}

/* ── Layout inferior (tabela pacientes + jobs) ────────────────────────────── */
.dash-row-bottom {
  display: grid;
  grid-template-columns: 1.6fr 1fr;
  gap: var(--ui-space-4);
  align-items: start;
}

/* ── Aviso de acesso negado ───────────────────────────────────────────────── */
.dash-denied {
  display: flex;
  align-items: center;
  gap: var(--ui-space-3);
  padding: var(--ui-space-5);
  color: rgb(var(--ui-muted));
  font-size: var(--ui-text-sm);
}
.dash-denied-icon {
  font-size: var(--ui-text-xl);
  opacity: 0.5;
}

/* ── Gráfico de receita ───────────────────────────────────────────────────── */
.dash-chart {
  display: flex;
  gap: var(--ui-space-3);
  min-height: 180px;
  align-items: stretch;
}
.dash-chart-loading {
  display: flex;
  gap: var(--ui-space-2);
  align-items: flex-end;
  flex: 1;
  padding-bottom: var(--ui-space-4);
}
.dash-chart-bar-sk {
  flex: 1;
  border-radius: var(--ui-radius-sm) var(--ui-radius-sm) 0 0;
  background: rgb(var(--ui-surface-2));
  min-height: 40px;
  animation: dash-pulse 1.4s ease-in-out infinite;
}
.dash-chart-bar-sk:nth-child(1) { height: 60%; }
.dash-chart-bar-sk:nth-child(2) { height: 85%; }
.dash-chart-bar-sk:nth-child(3) { height: 45%; }
.dash-chart-bar-sk:nth-child(4) { height: 90%; }
.dash-chart-bar-sk:nth-child(5) { height: 70%; }
.dash-chart-bar-sk:nth-child(6) { height: 55%; }

@keyframes dash-pulse {
  0%, 100% { opacity: 0.6; }
  50% { opacity: 1; }
}

.dash-chart-y {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  padding-bottom: var(--ui-space-5);
  min-width: 52px;
  text-align: right;
}
.dash-chart-ytick {
  color: rgb(var(--ui-muted));
  font-size: var(--ui-text-xs);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.dash-chart-bars {
  flex: 1;
  display: flex;
  gap: var(--ui-space-2);
  align-items: flex-end;
  padding-bottom: 0;
  overflow-x: auto;
}
.dash-chart-col {
  flex: 1;
  min-width: 32px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--ui-space-1);
}
.dash-chart-bar-wrap {
  width: 100%;
  height: 140px;
  display: flex;
  align-items: flex-end;
}
.dash-chart-bar {
  width: 100%;
  border-radius: var(--ui-radius-sm) var(--ui-radius-sm) 0 0;
  background: rgb(var(--ui-accent) / 0.35);
  transition: background 0.2s ease, transform 0.2s ease;
  min-height: 4px;
}
.dash-chart-bar:hover {
  background: rgb(var(--ui-accent) / 0.7);
  transform: scaleY(1.03);
  transform-origin: bottom;
}
.dash-chart-bar[data-tone="primary"] {
  background: rgb(var(--ui-accent));
}
.dash-chart-bar[data-pct-bucket="10"]  { height: 10%; }
.dash-chart-bar[data-pct-bucket="20"]  { height: 20%; }
.dash-chart-bar[data-pct-bucket="30"]  { height: 30%; }
.dash-chart-bar[data-pct-bucket="40"]  { height: 40%; }
.dash-chart-bar[data-pct-bucket="50"]  { height: 50%; }
.dash-chart-bar[data-pct-bucket="60"]  { height: 60%; }
.dash-chart-bar[data-pct-bucket="70"]  { height: 70%; }
.dash-chart-bar[data-pct-bucket="80"]  { height: 80%; }
.dash-chart-bar[data-pct-bucket="90"]  { height: 90%; }
.dash-chart-bar[data-pct-bucket="100"] { height: 100%; }
.dash-chart-label {
  font-size: var(--ui-text-xs);
  color: rgb(var(--ui-muted));
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100%;
}
.dash-chart-val {
  font-size: var(--ui-text-xs);
  color: rgb(var(--ui-fg));
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

/* ── Mini calendário semanal ──────────────────────────────────────────────── */
.dash-calendar {
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-2);
}
.dash-cal-header,
.dash-cal-body {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: var(--ui-space-1);
}
.dash-cal-day-head {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  padding: var(--ui-space-1);
  border-radius: var(--ui-radius-sm);
}
.dash-cal-day-head[data-today] {
  background: rgb(var(--ui-accent) / 0.12);
}
.dash-cal-wday {
  font-size: var(--ui-text-xs);
  color: rgb(var(--ui-muted));
  font-weight: 700;
  text-transform: uppercase;
}
.dash-cal-date {
  font-size: var(--ui-text-sm);
  font-weight: 600;
}
.dash-cal-day-head[data-today] .dash-cal-date {
  color: rgb(var(--ui-accent-strong));
}
.dash-cal-cell {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-height: 64px;
  padding: var(--ui-space-1);
  border-radius: var(--ui-radius-sm);
  border: 1px solid rgb(var(--ui-border));
  background: rgb(var(--ui-surface));
  overflow: hidden;
}
.dash-cal-cell[data-today] {
  border-color: rgb(var(--ui-accent) / 0.5);
  background: rgb(var(--ui-accent) / 0.04);
}
.dash-cal-sk {
  height: 18px;
  border-radius: var(--ui-radius-sm);
  background: rgb(var(--ui-surface-2));
  animation: dash-pulse 1.4s ease-in-out infinite;
}
.dash-cal-event {
  display: flex;
  flex-direction: column;
  padding: 2px var(--ui-space-1);
  border-radius: 3px;
  background: rgb(var(--ui-accent) / 0.14);
  border: none;
  font: inherit;
  cursor: pointer;
  text-align: left;
  transition: background 0.12s;
  width: 100%;
}
.dash-cal-event:hover { background: rgb(var(--ui-accent) / 0.28); }
.dash-cal-event:focus-visible { outline: 2px solid rgb(var(--ui-accent)); outline-offset: 1px; }
.dash-cal-event[data-status="cancelled"] { background: rgb(var(--ui-danger) / 0.12); }
.dash-cal-event[data-status="completed"] { background: rgb(var(--ui-ok) / 0.14); }
.dash-cal-event-time {
  font-size: 10px;
  color: rgb(var(--ui-accent-strong));
  font-weight: 700;
  line-height: 1.2;
}
.dash-cal-event-label {
  font-size: 10px;
  color: rgb(var(--ui-fg));
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 100%;
  line-height: 1.2;
}
.dash-cal-more {
  font-size: 10px;
  color: rgb(var(--ui-muted));
  padding-left: var(--ui-space-1);
}
.dash-cal-empty {
  font-size: var(--ui-text-xs);
  color: rgb(var(--ui-faint));
  text-align: center;
  margin: auto;
}

/* ── Jobs assíncronos ─────────────────────────────────────────────────────── */
.dash-jobs-loading {
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-2);
  padding: var(--ui-space-2) 0;
}
.dash-jobs-sk {
  height: 36px;
  border-radius: var(--ui-radius-sm);
  background: rgb(var(--ui-surface-2));
  animation: dash-pulse 1.4s ease-in-out infinite;
}
.dash-jobs-empty {
  padding: var(--ui-space-2) 0;
}
.dash-jobs {
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-2);
}
.dash-job-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ui-space-3);
  padding: var(--ui-space-2) var(--ui-space-3);
  border: 1px solid rgb(var(--ui-border));
  border-radius: var(--ui-radius-md);
  background: rgb(var(--ui-surface));
  transition: background 0.12s;
}
.dash-job-row:hover {
  background: rgb(var(--ui-surface-2));
}
.dash-job-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.dash-job-name {
  font-size: var(--ui-text-sm);
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.dash-job-meta {
  font-size: var(--ui-text-xs);
  color: rgb(var(--ui-muted));
}
.dash-jobs-summary {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: var(--ui-space-2);
  margin-top: var(--ui-space-4);
  padding-top: var(--ui-space-4);
  border-top: 1px solid rgb(var(--ui-border));
}
.dash-jobs-count {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  padding: var(--ui-space-2);
  border-radius: var(--ui-radius-md);
  background: rgb(var(--ui-surface-2));
}
.dash-jobs-count-num {
  font-family: var(--ui-font-display);
  font-size: var(--ui-text-xl);
  font-weight: 700;
}
.dash-jobs-count[data-tone="success"] .dash-jobs-count-num { color: rgb(var(--ui-ok)); }
.dash-jobs-count[data-tone="warning"] .dash-jobs-count-num { color: rgb(var(--ui-warn)); }
.dash-jobs-count[data-tone="error"] .dash-jobs-count-num { color: rgb(var(--ui-danger)); }
.dash-jobs-count[data-tone="running"] .dash-jobs-count-num { color: rgb(var(--ui-accent-strong)); }
.dash-jobs-count-label {
  font-size: var(--ui-text-xs);
  color: rgb(var(--ui-muted));
  text-align: center;
}

/* ── Responsivo ───────────────────────────────────────────────────────────── */
@media (max-width: 860px) {
  .dash-row-main,
  .dash-row-bottom {
    grid-template-columns: 1fr;
  }
  .dash-kpis {
    grid-template-columns: repeat(2, 1fr);
  }
  .dash-chart {
    flex-direction: column;
  }
  .dash-chart-y {
    flex-direction: row;
    padding-bottom: 0;
    padding-right: 0;
    justify-content: space-between;
    min-width: unset;
  }
  .dash-jobs-summary {
    grid-template-columns: repeat(2, 1fr);
  }
}
@media (max-width: 480px) {
  .dash-kpis {
    grid-template-columns: 1fr;
  }
  .dash-cal-header,
  .dash-cal-body {
    grid-template-columns: repeat(7, minmax(0, 1fr));
  }
  .dash-cal-event-label { display: none; }
}
</style>
