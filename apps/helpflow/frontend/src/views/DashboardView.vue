<template>
  <UiPageLayout
    width="wide"
    eyebrow="HelpFlow · Service Desk"
    :title="pageTitle"
    subtitle="Chamados abertos por status e prioridade, sua fila de atendimento e a tendência da semana — com o estado dos gateways e da fila de processamento."
    :loading="loading"
    :error="errorMsg"
    @retry="load"
  >
    <template #actions>
      <UiButton variant="subtle" :loading="refreshing" @click="load">Atualizar</UiButton>
      <UiButton to="/tickets/new">Abrir chamado</UiButton>
    </template>

    <!-- Banner: alerta agregado quando há SLAs estourando, filas em DLQ ou gateways degradados -->
    <template v-if="hasIncidents" #banner>
      <div class="hf-banner" role="alert">
        <span class="hf-banner-icon" aria-hidden="true">{{ glyph('warn') }}</span>
        <div class="hf-banner-body">
          <p class="hf-banner-title">Atenção operacional</p>
          <p class="hf-banner-text">{{ incidentSummary }}</p>
        </div>
        <UiButton size="sm" variant="ghost" to="/tickets">Ver chamados</UiButton>
      </div>
    </template>

    <!-- KPIs principais — chamados primeiro, depois saúde da plataforma -->
    <section class="hf-kpis" aria-label="Indicadores do service desk">
      <UiMetricCard
        label="Chamados abertos"
        :value="ticketsError ? '—' : openTickets"
        :tone="openTickets > 0 ? 'primary' : 'success'"
        hint="aguardando ou em andamento"
        clickable
        @click="goTo('/tickets')"
      />
      <UiMetricCard
        label="Em andamento"
        :value="ticketsError ? '—' : statusCounts.in_progress"
        tone="running"
        hint="sendo tratados agora"
        clickable
        @click="goTo('/tickets')"
      />
      <UiMetricCard
        label="Urgentes"
        :value="ticketsError ? '—' : priorityCounts.urgent"
        :tone="priorityCounts.urgent > 0 ? 'error' : 'success'"
        hint="prioridade máxima na fila"
        clickable
        @click="goTo('/tickets')"
      />
      <UiMetricCard
        label="SLA estourando"
        :value="ticketsError ? '—' : slaBreaching"
        :tone="slaBreaching > 0 ? 'warning' : 'success'"
        hint="vencidos ou a vencer em 2h"
        clickable
        @click="goTo('/tickets')"
      />
      <UiMetricCard
        label="Falhas (DLQ)"
        :value="jobsError ? '—' : jobs.dlq"
        :tone="jobs.dlq > 0 ? 'error' : 'success'"
        hint="jobs sem reprocessar"
        clickable
        @click="goTo('/jobs')"
      />
      <UiMetricCard
        label="Gateways saudáveis"
        :value="gatewaysHealthyLabel"
        :tone="gatewaysTone"
        hint="integrações ativas"
        clickable
        @click="goTo('/integrations')"
      />
    </section>

    <!-- Tendência da semana (série temporal real) -->
    <UiCard
      title="Tendência de chamados"
      subtitle="Abertos vs. resolvidos nos últimos 7 dias."
    >
      <template #actions>
        <UiStatusBadge :status="trendBadge.status" :tone="trendBadge.tone" :label="trendBadge.label" />
      </template>

      <div v-if="ticketsError" class="hf-inline-error" role="alert">
        <p class="hf-inline-error-text">Não foi possível carregar os chamados para a tendência.</p>
        <UiButton size="sm" variant="ghost" @click="load">Tentar de novo</UiButton>
      </div>

      <UiEmptyState
        v-else-if="!hasTrendData"
        compact
        icon="chart"
        title="Sem histórico ainda"
        description="Conforme os chamados forem abertos e resolvidos, a tendência da semana aparece aqui."
      />

      <template v-else>
        <div class="hf-trend" role="img" :aria-label="trendAria">
          <svg class="hf-trend-svg" :viewBox="trendViewBox" preserveAspectRatio="none" aria-hidden="true">
            <g class="hf-trend-grid">
              <line v-for="g in trendGrid" :key="g" x1="0" :y1="g" :x2="TREND_W" :y2="g" />
            </g>
            <!-- área + linha de abertos -->
            <polygon class="hf-trend-area" data-series="open" :points="trendOpenArea" />
            <polyline class="hf-trend-line" data-series="open" :points="trendOpenLine" />
            <!-- linha de resolvidos -->
            <polyline class="hf-trend-line" data-series="resolved" :points="trendResolvedLine" />
            <g class="hf-trend-dots">
              <circle
                v-for="p in trendOpenDots"
                :key="'o' + p.key"
                class="hf-trend-dot"
                data-series="open"
                :cx="p.x"
                :cy="p.y"
                r="3"
              />
              <circle
                v-for="p in trendResolvedDots"
                :key="'r' + p.key"
                class="hf-trend-dot"
                data-series="resolved"
                :cx="p.x"
                :cy="p.y"
                r="3"
              />
            </g>
          </svg>
          <ul class="hf-trend-axis" aria-hidden="true">
            <li v-for="d in trendDays" :key="d.key" class="hf-trend-tick">{{ d.short }}</li>
          </ul>
        </div>
        <ul class="hf-legend hf-legend--inline">
          <li class="hf-legend-item">
            <span class="hf-legend-dot" data-tone="accent" aria-hidden="true" />
            <span class="hf-legend-label">Abertos no dia</span>
            <span class="hf-legend-value">{{ format.formatNumber(trendTotals.open) }}</span>
          </li>
          <li class="hf-legend-item">
            <span class="hf-legend-dot" data-tone="ok" aria-hidden="true" />
            <span class="hf-legend-label">Resolvidos no dia</span>
            <span class="hf-legend-value">{{ format.formatNumber(trendTotals.resolved) }}</span>
          </li>
        </ul>
      </template>
    </UiCard>

    <!-- Composição da fila de chamados: por status + por prioridade -->
    <section class="hf-grid-2">
      <UiCard title="Chamados por status" subtitle="Distribuição da fila aberta por estágio.">
        <template #actions>
          <UiButton size="sm" variant="ghost" to="/tickets">Ver fila</UiButton>
        </template>

        <div v-if="ticketsError" class="hf-inline-error" role="alert">
          <p class="hf-inline-error-text">Não foi possível ler os chamados.</p>
          <UiButton size="sm" variant="ghost" @click="load">Tentar de novo</UiButton>
        </div>
        <UiEmptyState
          v-else-if="tickets.length === 0"
          compact
          icon="inbox"
          title="Nenhum chamado na fila"
          description="Quando um chamado for aberto, ele aparece aqui por status."
        >
          <template #action><UiButton size="sm" to="/tickets/new">Abrir chamado</UiButton></template>
        </UiEmptyState>
        <ul v-else class="hf-bars" aria-label="Chamados por status">
          <li v-for="s in statusBreakdown" :key="s.key" class="hf-bar-row">
            <span class="hf-bar-label">{{ s.label }}</span>
            <svg class="hf-bar-svg" viewBox="0 0 100 10" preserveAspectRatio="none" aria-hidden="true">
              <rect class="hf-bar-track" x="0" y="0" width="100" height="10" rx="5" />
              <rect class="hf-bar-fill" :data-tone="s.tone" x="0" y="0" :width="s.pct" height="10" rx="5" />
            </svg>
            <span class="hf-bar-value">{{ format.formatNumber(s.value) }}</span>
          </li>
        </ul>
      </UiCard>

      <UiCard title="Chamados por prioridade" subtitle="Onde está a pressão da fila aberta.">
        <template #actions>
          <UiButton size="sm" variant="ghost" to="/tickets">Ver fila</UiButton>
        </template>

        <div v-if="ticketsError" class="hf-inline-error" role="alert">
          <p class="hf-inline-error-text">Não foi possível ler os chamados.</p>
          <UiButton size="sm" variant="ghost" @click="load">Tentar de novo</UiButton>
        </div>
        <UiEmptyState
          v-else-if="tickets.length === 0"
          compact
          icon="inbox"
          title="Nenhum chamado na fila"
          description="A distribuição por prioridade aparece quando houver chamados."
        >
          <template #action><UiButton size="sm" to="/tickets/new">Abrir chamado</UiButton></template>
        </UiEmptyState>
        <ul v-else class="hf-bars" aria-label="Chamados por prioridade">
          <li v-for="p in priorityBreakdown" :key="p.key" class="hf-bar-row">
            <span class="hf-bar-label">{{ p.label }}</span>
            <svg class="hf-bar-svg" viewBox="0 0 100 10" preserveAspectRatio="none" aria-hidden="true">
              <rect class="hf-bar-track" x="0" y="0" width="100" height="10" rx="5" />
              <rect class="hf-bar-fill" :data-tone="p.tone" x="0" y="0" :width="p.pct" height="10" rx="5" />
            </svg>
            <span class="hf-bar-value">{{ format.formatNumber(p.value) }}</span>
          </li>
        </ul>
      </UiCard>
    </section>

    <!-- Minha fila: chamados abertos com filtro de escopo (mim / sem responsável / todos), ordenados por SLA -->
    <UiCard title="Minha fila" :subtitle="queueSubtitle">
      <template #actions>
        <div class="hf-scope" role="group" aria-label="Escopo da fila">
          <button
            v-for="opt in scopeOptions"
            :key="opt.key"
            type="button"
            class="hf-scope-btn"
            :data-active="queueScope === opt.key ? 'true' : null"
            :aria-pressed="queueScope === opt.key ? 'true' : 'false'"
            @click="queueScope = opt.key"
          >
            {{ opt.label }}
            <span class="hf-scope-count">{{ format.formatNumber(opt.count) }}</span>
          </button>
        </div>
        <UiButton size="sm" variant="ghost" to="/tickets">Ver todos</UiButton>
      </template>
      <UiDataTable
        :columns="ticketColumns"
        :rows="queueTickets"
        :loading="loading"
        :error="ticketsError ? 'Não foi possível carregar os chamados.' : null"
        row-key="id"
        density="compact"
        clickable-rows
        :empty="queueEmpty"
        @retry="load"
        @row-click="openTicket"
      >
        <template #cell-subject="{ row }">
          <span class="hf-tk-subject">
            <span class="hf-tk-subject-main">{{ row.subject || 'Sem assunto' }}</span>
            <span class="hf-tk-ref">#{{ row.id }}</span>
          </span>
        </template>
        <template #cell-status="{ value }">
          <UiStatusBadge :status="value" :label="statusLabel(value)" />
        </template>
        <template #cell-priority="{ value }">
          <UiStatusBadge :status="value" :tone="priorityTone(value)" :label="priorityLabel(value)" with-dot />
        </template>
        <template #cell-assignee_id="{ value }">
          <span v-if="value && isMine(value)" class="hf-tk-mine">{{ glyph('user') }} Você</span>
          <span v-else-if="value" class="hf-tk-person">Agente #{{ value }}</span>
          <UiStatusBadge v-else tone="warning" label="Não atribuído" :with-dot="false" />
        </template>
        <template #cell-sla_due_at="{ row }">
          <span
            v-if="row.sla_due_at && !isClosed(row.status)"
            class="hf-sla"
            :data-state="slaState(row.sla_due_at)"
            :title="format.formatDateTime(row.sla_due_at)"
          >
            <span class="hf-sla-dot" aria-hidden="true" />
            {{ slaCountdown(row.sla_due_at) }}
          </span>
          <span v-else class="hf-dim">—</span>
        </template>
        <template #empty-action>
          <UiButton size="sm" to="/tickets/new">Abrir chamado</UiButton>
        </template>
      </UiDataTable>
    </UiCard>

    <!-- Saúde dos gateways + Fila de processamento (worker) lado a lado -->
    <section class="hf-grid-2">
      <UiCard title="Saúde dos gateways" subtitle="Integrações externas do service desk.">
        <template #actions>
          <UiButton size="sm" variant="ghost" to="/integrations">Gerenciar</UiButton>
        </template>
        <UiDataTable
          :columns="gatewayColumns"
          :rows="integrations"
          :loading="loading"
          row-key="id"
          density="compact"
          clickable-rows
          :empty="{ title: 'Nenhum gateway', description: 'Configure uma integração externa.', icon: 'link' }"
          @row-click="openIntegration"
        >
          <template #cell-status="{ value }">
            <UiStatusBadge :status="value" />
          </template>
          <template #cell-last_check_at="{ value }">{{ format.formatDateTime(value) }}</template>
          <template #empty-action>
            <UiButton size="sm" to="/integrations">Configurar gateway</UiButton>
          </template>
        </UiDataTable>
      </UiCard>

      <UiCard title="Fila de processamento" subtitle="Composição atual da fila do worker (não são chamados).">
        <template #actions>
          <UiStatusBadge :status="jobsHealthStatus" :label="jobsHealthLabel" />
        </template>

        <div v-if="jobsError" class="hf-inline-error" role="alert">
          <p class="hf-inline-error-text">Não foi possível ler a saúde da fila.</p>
          <UiButton size="sm" variant="ghost" @click="load">Tentar de novo</UiButton>
        </div>

        <template v-else>
          <div class="hf-chart" role="img" :aria-label="queueChartAria">
            <svg class="hf-chart-svg" viewBox="0 0 320 120" preserveAspectRatio="none" aria-hidden="true">
              <g class="hf-chart-grid">
                <line x1="0" y1="30" x2="320" y2="30" />
                <line x1="0" y1="60" x2="320" y2="60" />
                <line x1="0" y1="90" x2="320" y2="90" />
              </g>
              <g class="hf-chart-bars">
                <rect
                  v-for="(b, i) in queueBars"
                  :key="b.key"
                  class="hf-bar-rect"
                  :data-tone="b.tone"
                  :x="i * 80 + 26"
                  :y="120 - b.h"
                  :width="48"
                  :height="b.h"
                  rx="4"
                />
              </g>
            </svg>
          </div>
          <ul class="hf-legend">
            <li v-for="b in queueBars" :key="b.key" class="hf-legend-item">
              <span class="hf-legend-dot" :data-tone="b.tone" aria-hidden="true" />
              <span class="hf-legend-label">{{ b.label }}</span>
              <span class="hf-legend-value">{{ format.formatNumber(b.value) }}</span>
            </li>
          </ul>
          <div class="hf-jobs-foot">
            <UiButton size="sm" variant="ghost" to="/jobs">Abrir monitor de jobs</UiButton>
          </div>
        </template>
      </UiCard>
    </section>

    <!-- Atalhos rápidos -->
    <UiCard title="Atalhos" subtitle="Acesso rápido às áreas de atendimento.">
      <nav class="hf-quick" aria-label="Atalhos do service desk">
        <RouterLink
          v-for="q in quickActions"
          :key="q.to"
          :to="q.to"
          class="hf-quick-card"
        >
          <span class="hf-quick-icon" aria-hidden="true">{{ glyph(q.icon) }}</span>
          <span class="hf-quick-text">
            <span class="hf-quick-title">{{ q.title }}</span>
            <span class="hf-quick-desc">{{ q.desc }}</span>
          </span>
          <span class="hf-quick-arrow" aria-hidden="true">→</span>
        </RouterLink>
      </nav>
    </UiCard>

    <template #footer>
      <span>Atualizado {{ format.formatDateTime(updatedAt) }} · dados ao vivo do service desk.</span>
    </template>
  </UiPageLayout>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import {
  UiPageLayout,
  UiCard,
  UiMetricCard,
  UiDataTable,
  UiStatusBadge,
  UiEmptyState,
  UiButton,
  useToast,
  format,
  resolveGlyph,
} from '../ui/index.js';
import { resourceFactory } from '../api.js';
import { me, loadMe } from '../session.js';

const router = useRouter();
const toast = useToast();

// Glifo do kit (substitui emojis literais) — decorativos sempre com aria-hidden no template.
const glyph = (name) => resolveGlyph(name);

// Recursos de DOMÍNIO reais (backend expõe /v1/<name>).
const ticketsApi = resourceFactory('tickets');
const slaApi = resourceFactory('sla-policies');
const integrationsApi = resourceFactory('integrations');
// /v1/health/jobs devolve { status, jobs:{queued,running,done,dlq} }.
const jobsHealthApi = resourceFactory('health/jobs');

const loading = ref(true);
const refreshing = ref(false);
const errorMsg = ref(null);
const ticketsError = ref(false);
const jobsError = ref(false);
const updatedAt = ref(null);

const tickets = ref([]);
const slaPolicies = ref([]);
const integrations = ref([]);
const jobs = ref({ queued: 0, running: 0, done: 0, dlq: 0 });
const jobsHealthStatus = ref('');

// Identidade da borda (GET /me, fail-soft): saudação personalizada + escopo "atribuídos a mim".
// `me` pode ser nulo (sem SSO/dev local) — a tela degrada para a fila completa.
const firstName = computed(() => {
  const raw = me.value && (me.value.name || me.value.email);
  if (!raw) return '';
  return String(raw).split(/[\s@.]+/)[0].replace(/^./, (c) => c.toUpperCase());
});
const pageTitle = computed(() =>
  firstName.value ? 'Bom trabalho, ' + firstName.value : 'Painel do Service Desk',
);
// id do agente logado (quando o backend o expõe); usado para casar com assignee_id.
const myAgentId = computed(() => {
  const m = me.value;
  if (!m) return null;
  const id = m.agent_id ?? m.id;
  return id === null || id === undefined ? null : id;
});
const isMine = (assigneeId) =>
  myAgentId.value !== null && String(assigneeId) === String(myAgentId.value);

async function load() {
  const first = loading.value;
  if (!first) refreshing.value = true;
  errorMsg.value = null;
  ticketsError.value = false;
  jobsError.value = false;
  try {
    // SLAs e gateways são essenciais ao painel → erro real propaga.
    const [sla, integ] = await Promise.all([
      slaApi.list({ pageSize: 50, sort: 'first_response_mins', dir: 'asc' }),
      integrationsApi.list({ pageSize: 50 }),
    ]);
    slaPolicies.value = sla.data || [];
    integrations.value = integ.data || [];

    // Chamados — degrada graciosamente: o resto do painel ainda funciona.
    try {
      const tk = await ticketsApi.list({ pageSize: 200, sort: 'sla_due_at', dir: 'asc' });
      tickets.value = tk.data || [];
    } catch {
      ticketsError.value = true;
      tickets.value = [];
    }

    // Saúde da fila do worker — degrada graciosamente se indisponível.
    try {
      const h = await jobsHealthApi.list();
      const payload = h && h.data && h.data.jobs ? h.data : h;
      const j = (payload && payload.jobs) || {};
      jobs.value = {
        queued: j.queued || 0,
        running: j.running || 0,
        done: j.done || 0,
        dlq: j.dlq || 0,
      };
      jobsHealthStatus.value = (payload && payload.status) || 'ok';
    } catch {
      jobsError.value = true;
      jobsHealthStatus.value = 'error';
    }

    updatedAt.value = new Date();
    if (!first) toast.success('Painel atualizado');
  } catch (e) {
    errorMsg.value = e && e.message ? e.message : 'Falha ao carregar o painel';
    if (!first) toast.error('Não foi possível atualizar o painel');
  } finally {
    loading.value = false;
    refreshing.value = false;
  }
}

// ---- Domínio: status e prioridade (rótulos + tons; sem heurística de cor) ----
const STATUS = [
  { key: 'open', label: 'Aberto', tone: 'running' },
  { key: 'in_progress', label: 'Em andamento', tone: 'accent' },
  { key: 'pending', label: 'Pendente', tone: 'warn' },
  { key: 'on_hold', label: 'Em espera', tone: 'warn' },
  { key: 'resolved', label: 'Resolvido', tone: 'ok' },
  { key: 'closed', label: 'Encerrado', tone: 'muted' },
];
const STATUS_LABEL = Object.fromEntries(STATUS.map((s) => [s.key, s.label]));
const statusLabel = (v) => STATUS_LABEL[String(v || '').toLowerCase()] || format.humanize(v);

const PRIORITY = [
  { key: 'urgent', label: 'Urgente', tone: 'danger' },
  { key: 'high', label: 'Alta', tone: 'warn' },
  { key: 'medium', label: 'Média', tone: 'running' },
  { key: 'low', label: 'Baixa', tone: 'muted' },
];
const PRIORITY_LABEL = Object.fromEntries(PRIORITY.map((p) => [p.key, p.label]));
const PRIORITY_BADGE_TONE = { urgent: 'error', high: 'warning', medium: 'running', low: 'neutral' };
const priorityLabel = (v) => PRIORITY_LABEL[String(v || '').toLowerCase()] || format.humanize(v);
const priorityTone = (v) => PRIORITY_BADGE_TONE[String(v || '').toLowerCase()] || 'neutral';

const OPEN_STATUSES = new Set(['open', 'in_progress', 'pending', 'on_hold']);
const isClosed = (status) => status === 'closed' || status === 'resolved';
const isOpen = (t) => OPEN_STATUSES.has(String(t.status || '').toLowerCase());

// ---- Contagens de chamados por status e prioridade ----
const statusCounts = computed(() => {
  const acc = Object.fromEntries(STATUS.map((s) => [s.key, 0]));
  for (const t of tickets.value) {
    const k = String(t.status || '').toLowerCase();
    if (k in acc) acc[k] += 1;
  }
  return acc;
});
const priorityCounts = computed(() => {
  const acc = Object.fromEntries(PRIORITY.map((p) => [p.key, 0]));
  for (const t of tickets.value) {
    if (!isOpen(t)) continue;
    const k = String(t.priority || '').toLowerCase();
    if (k in acc) acc[k] += 1;
  }
  return acc;
});
const openTickets = computed(() => tickets.value.filter(isOpen).length);

// SLA: vencido ou a vencer em <= 2h, considerando só chamados não fechados.
const SLA_SOON_MS = 2 * 3600 * 1000;
function slaMillis(due) {
  const t = new Date(due).getTime();
  if (isNaN(t)) return null;
  return t - Date.now();
}
function slaState(due) {
  const ms = slaMillis(due);
  if (ms === null) return 'none';
  if (ms <= 0) return 'breached';
  if (ms <= SLA_SOON_MS) return 'soon';
  return 'ok';
}
function slaCountdown(due) {
  const ms = slaMillis(due);
  if (ms === null) return '—';
  const mins = Math.floor(Math.abs(ms) / 60000);
  const days = Math.floor(mins / 1440);
  const hours = Math.floor((mins % 1440) / 60);
  const rem = mins % 60;
  let label;
  if (days > 0) label = days + 'd ' + hours + 'h';
  else if (hours > 0) label = hours + 'h ' + rem + 'm';
  else label = rem + 'm';
  return ms <= 0 ? 'Vencido há ' + label : 'Em ' + label;
}
const slaBreaching = computed(
  () =>
    tickets.value.filter((t) => {
      if (isClosed(t.status) || !t.sla_due_at) return false;
      const s = slaState(t.sla_due_at);
      return s === 'breached' || s === 'soon';
    }).length,
);

// ---- Breakdown (barras horizontais proporcionais) ----
const statusBreakdown = computed(() => {
  const rows = STATUS.filter((s) => s.key !== 'closed').map((s) => ({
    ...s,
    value: statusCounts.value[s.key] || 0,
  }));
  const max = Math.max(1, ...rows.map((r) => r.value));
  return rows.map((r) => ({ ...r, pct: Math.round((r.value / max) * 100) }));
});
const priorityBreakdown = computed(() => {
  const rows = PRIORITY.map((p) => ({ ...p, value: priorityCounts.value[p.key] || 0 }));
  const max = Math.max(1, ...rows.map((r) => r.value));
  return rows.map((r) => ({ ...r, pct: Math.round((r.value / max) * 100) }));
});

// ---- Minha fila: abertos ordenados por SLA, com escopo (mim / sem responsável / todos) ----
const openQueue = computed(() =>
  tickets.value
    .filter(isOpen)
    .slice()
    .sort((a, b) => {
      const ta = a.sla_due_at ? new Date(a.sla_due_at).getTime() : Infinity;
      const tb = b.sla_due_at ? new Date(b.sla_due_at).getTime() : Infinity;
      return ta - tb;
    }),
);
const mineCount = computed(() =>
  myAgentId.value === null
    ? 0
    : openQueue.value.filter((t) => isMine(t.assignee_id)).length,
);
const unassignedCount = computed(
  () => openQueue.value.filter((t) => !t.assignee_id).length,
);
// Escopo: "mim" só aparece quando há identidade que case com um responsável.
const scopeOptions = computed(() => {
  const opts = [];
  if (myAgentId.value !== null) {
    opts.push({ key: 'mine', label: 'Atribuídos a mim', count: mineCount.value });
  }
  opts.push({ key: 'unassigned', label: 'Sem responsável', count: unassignedCount.value });
  opts.push({ key: 'all', label: 'Toda a fila', count: openQueue.value.length });
  return opts;
});
// Default: começa em "mim" quando há identidade, senão na fila completa.
const queueScope = ref('all');
const queueTickets = computed(() => {
  let rows = openQueue.value;
  if (queueScope.value === 'mine') rows = rows.filter((t) => isMine(t.assignee_id));
  else if (queueScope.value === 'unassigned') rows = rows.filter((t) => !t.assignee_id);
  return rows.slice(0, 8);
});
const queueSubtitle = computed(() => {
  if (queueScope.value === 'mine') return 'Chamados atribuídos a você, ordenados pelo prazo de SLA.';
  if (queueScope.value === 'unassigned') return 'Chamados abertos sem responsável — pegue um para atender.';
  return 'Todos os chamados abertos, ordenados pelo prazo de SLA.';
});
const queueEmpty = computed(() => {
  if (queueScope.value === 'mine')
    return { title: 'Nada na sua fila', description: 'Você não tem chamados abertos atribuídos. Bom trabalho!', icon: 'ok' };
  if (queueScope.value === 'unassigned')
    return { title: 'Tudo atribuído', description: 'Não há chamados abertos sem responsável.', icon: 'ok' };
  return { title: 'Fila vazia', description: 'Nenhum chamado aberto no momento. Bom trabalho!', icon: 'inbox' };
});
const ticketColumns = [
  { key: 'subject', label: 'Chamado' },
  { key: 'status', label: 'Status' },
  { key: 'priority', label: 'Prioridade' },
  { key: 'assignee_id', label: 'Responsável' },
  { key: 'sla_due_at', label: 'SLA' },
];

// ---- Tendência (série temporal real, 7 dias) ----
const TREND_W = 700;
const TREND_H = 160;
const trendViewBox = '0 0 ' + TREND_W + ' ' + TREND_H;
const trendGrid = [0.2, 0.4, 0.6, 0.8].map((f) => Math.round(TREND_H * f));

function dayKey(d) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
const trendDays = computed(() => {
  const out = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const fmt = new Intl.DateTimeFormat('pt-BR', { weekday: 'short' });
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today.getTime());
    d.setDate(d.getDate() - i);
    out.push({ key: dayKey(d), date: d, short: fmt.format(d).replace('.', '') });
  }
  return out;
});

// Série: abertos por dia (created_at) e resolvidos por dia (updated_at quando status resolved/closed).
const trendSeries = computed(() => {
  const opened = Object.fromEntries(trendDays.value.map((d) => [d.key, 0]));
  const resolved = Object.fromEntries(trendDays.value.map((d) => [d.key, 0]));
  for (const t of tickets.value) {
    if (t.created_at) {
      const k = dayKey(new Date(t.created_at));
      if (k in opened) opened[k] += 1;
    }
    if (isClosed(t.status) && t.updated_at) {
      const k = dayKey(new Date(t.updated_at));
      if (k in resolved) resolved[k] += 1;
    }
  }
  return { opened, resolved };
});
const hasTrendData = computed(() => {
  const { opened, resolved } = trendSeries.value;
  return Object.values(opened).some((v) => v > 0) || Object.values(resolved).some((v) => v > 0);
});
const trendTotals = computed(() => {
  const { opened, resolved } = trendSeries.value;
  const sum = (o) => Object.values(o).reduce((a, b) => a + b, 0);
  return { open: sum(opened), resolved: sum(resolved) };
});

const PAD = 8;
// escala compartilhada (mesmo eixo Y para abertos e resolvidos → comparável)
const trendMax = computed(() => {
  const { opened, resolved } = trendSeries.value;
  return Math.max(1, ...trendDays.value.map((d) => Math.max(opened[d.key] || 0, resolved[d.key] || 0)));
});
function pointsForShared(map) {
  const days = trendDays.value;
  const max = trendMax.value;
  const stepX = days.length > 1 ? (TREND_W - PAD * 2) / (days.length - 1) : 0;
  return days.map((d, i) => ({
    key: d.key,
    x: Math.round(PAD + i * stepX),
    y: Math.round(TREND_H - PAD - ((map[d.key] || 0) / max) * (TREND_H - PAD * 2)),
  }));
}
const trendOpenDots = computed(() => pointsForShared(trendSeries.value.opened));
const trendResolvedDots = computed(() => pointsForShared(trendSeries.value.resolved));
const trendOpenLine = computed(() => trendOpenDots.value.map((p) => p.x + ',' + p.y).join(' '));
const trendResolvedLine = computed(() => trendResolvedDots.value.map((p) => p.x + ',' + p.y).join(' '));
const trendOpenArea = computed(() => {
  const pts = trendOpenDots.value;
  if (!pts.length) return '';
  const base = TREND_H - PAD;
  return pts[0].x + ',' + base + ' ' + pts.map((p) => p.x + ',' + p.y).join(' ') + ' ' + pts[pts.length - 1].x + ',' + base;
});
const trendAria = computed(() => {
  const { opened, resolved } = trendSeries.value;
  return (
    'Tendência de 7 dias. ' +
    trendDays.value
      .map((d) => d.short + ': ' + (opened[d.key] || 0) + ' abertos, ' + (resolved[d.key] || 0) + ' resolvidos')
      .join('. ')
  );
});
const trendBadge = computed(() => {
  if (ticketsError.value) return { status: 'error', tone: 'error', label: 'Indisponível' };
  const { open, resolved } = trendTotals.value;
  if (resolved >= open) return { status: 'ok', tone: 'success', label: 'Resolvendo em dia' };
  return { status: 'warning', tone: 'warning', label: 'Entrada acima da saída' };
});

// ---- Gateways ----
const HEALTHY = new Set(['active', 'ok', 'healthy', 'up']);
const gatewaysHealthy = computed(
  () => integrations.value.filter((g) => HEALTHY.has(String(g.status).toLowerCase())).length,
);
const gatewaysHealthyLabel = computed(() => gatewaysHealthy.value + '/' + integrations.value.length);
const gatewaysTone = computed(() => {
  if (!integrations.value.length) return 'neutral';
  if (gatewaysHealthy.value === integrations.value.length) return 'success';
  if (gatewaysHealthy.value === 0) return 'error';
  return 'warning';
});
const gatewaysDown = computed(() => integrations.value.length - gatewaysHealthy.value);

// ---- Banner de incidentes ----
const hasIncidents = computed(
  () => slaBreaching.value > 0 || jobs.value.dlq > 0 || gatewaysDown.value > 0,
);
const incidentSummary = computed(() => {
  const parts = [];
  if (slaBreaching.value > 0) parts.push(slaBreaching.value + ' chamado(s) com SLA estourando');
  if (jobs.value.dlq > 0) parts.push(jobs.value.dlq + ' job(s) na fila morta (DLQ)');
  if (gatewaysDown.value > 0) parts.push(gatewaysDown.value + ' gateway(s) fora do estado saudável');
  return parts.join(' · ') + '. Verifique antes que afete o atendimento.';
});

// ---- Saúde da fila do worker (badge + barras) ----
const queueOpenJobs = computed(() => jobs.value.queued + jobs.value.running);
const jobsHealthLabel = computed(() => {
  if (jobsError.value) return 'Indisponível';
  if (jobs.value.dlq > 0) return 'Com falhas';
  if (queueOpenJobs.value > 0) return 'Processando';
  return 'Em dia';
});
const queueBars = computed(() => {
  const data = [
    { key: 'queued', label: 'Aguardando', value: jobs.value.queued, tone: 'running' },
    { key: 'running', label: 'Processando', value: jobs.value.running, tone: 'accent' },
    { key: 'dlq', label: 'Falhas (DLQ)', value: jobs.value.dlq, tone: 'danger' },
    { key: 'done', label: 'Concluídos', value: jobs.value.done, tone: 'ok' },
  ];
  const max = Math.max(1, ...data.map((d) => d.value));
  return data.map((d) => ({ ...d, h: Math.max(4, Math.round((d.value / max) * 104)) }));
});
const queueChartAria = computed(
  () => 'Composição da fila do worker: ' + queueBars.value.map((b) => b.label + ' ' + b.value).join(', '),
);

// ---- Colunas das tabelas ----
const gatewayColumns = [
  { key: 'name', label: 'Gateway' },
  { key: 'kind', label: 'Tipo' },
  { key: 'status', label: 'Status', format: 'badge' },
  { key: 'last_check_at', label: 'Última checagem' },
];

// ---- Atalhos (rotas de DOMÍNIO reais; ícones por nome do kit, nunca emoji literal) ----
const quickActions = [
  { to: '/tickets', icon: 'inbox', title: 'Chamados', desc: 'Fila de atendimento' },
  { to: '/customers', icon: 'users', title: 'Solicitantes', desc: 'Base de quem você atende' },
  { to: '/agents', icon: 'user', title: 'Agentes', desc: 'Equipe de atendimento' },
  { to: '/teams', icon: 'team', title: 'Times', desc: 'Filas e responsáveis' },
  { to: '/sla-policies', icon: 'clock', title: 'SLAs', desc: 'Tempos de resposta' },
  { to: '/kb-articles', icon: 'doc', title: 'Base de conhecimento', desc: 'Artigos e respostas' },
  { to: '/integrations', icon: 'link', title: 'Integrações', desc: 'Gateways externos' },
];

const goTo = (to) => router.push(to);
const openTicket = (row) => router.push('/tickets/' + row.id);
const openIntegration = (row) => router.push('/integrations/' + row.id);

onMounted(async () => {
  // Identidade primeiro (fail-soft): define a saudação e o escopo padrão da "minha fila".
  await loadMe();
  if (myAgentId.value !== null) queueScope.value = 'mine';
  await load();
});
</script>

<style scoped>
/* KPIs */
.hf-kpis {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
  gap: var(--ui-space-4);
}

/* Grades de 2 colunas */
.hf-grid-2 {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(340px, 1fr));
  gap: var(--ui-space-4);
  align-items: start;
}

/* Banner de incidentes */
.hf-banner {
  display: flex;
  align-items: center;
  gap: var(--ui-space-4);
  padding: var(--ui-space-4) var(--ui-space-5);
  border: 1px solid rgb(var(--ui-warn) / 0.4);
  background: rgb(var(--ui-warn) / 0.1);
  border-radius: var(--ui-radius-lg);
}
.hf-banner-icon {
  font-size: 1.4rem;
  color: rgb(var(--ui-warn));
}
.hf-banner-body {
  flex: 1;
  min-width: 0;
}
.hf-banner-title {
  margin: 0;
  font-weight: 700;
  color: rgb(var(--ui-fg));
}
.hf-banner-text {
  margin: 2px 0 0;
  font-size: var(--ui-text-sm);
  color: rgb(var(--ui-muted));
}

/* Erro inline */
.hf-inline-error {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ui-space-3);
  padding: var(--ui-space-4);
  border: 1px dashed rgb(var(--ui-danger) / 0.4);
  border-radius: var(--ui-radius-md);
  background: rgb(var(--ui-danger) / 0.06);
}
.hf-inline-error-text {
  margin: 0;
  font-size: var(--ui-text-sm);
  color: rgb(var(--ui-danger));
}

/* Tendência (linha/área) */
.hf-trend {
  width: 100%;
}
.hf-trend-svg {
  width: 100%;
  height: 180px;
  display: block;
}
.hf-trend-grid line {
  stroke: rgb(var(--ui-border));
  stroke-width: 1;
  stroke-dasharray: 3 4;
}
.hf-trend-line {
  fill: none;
  stroke-width: 2.5;
  stroke-linejoin: round;
  stroke-linecap: round;
}
.hf-trend-line[data-series="open"] {
  stroke: rgb(var(--ui-accent));
}
.hf-trend-line[data-series="resolved"] {
  stroke: rgb(var(--ui-ok));
}
.hf-trend-area[data-series="open"] {
  fill: rgb(var(--ui-accent) / 0.12);
  stroke: none;
}
.hf-trend-dot[data-series="open"] {
  fill: rgb(var(--ui-accent));
}
.hf-trend-dot[data-series="resolved"] {
  fill: rgb(var(--ui-ok));
}
.hf-trend-axis {
  list-style: none;
  margin: var(--ui-space-2) 0 0;
  padding: 0 var(--ui-space-1);
  display: flex;
  justify-content: space-between;
}
.hf-trend-tick {
  font-size: var(--ui-text-xs);
  color: rgb(var(--ui-muted));
  text-transform: capitalize;
}

/* Barras horizontais (breakdown por status/prioridade) */
.hf-bars {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-3);
}
.hf-bar-row {
  display: grid;
  grid-template-columns: 120px 1fr auto;
  align-items: center;
  gap: var(--ui-space-3);
}
.hf-bar-label {
  font-size: var(--ui-text-sm);
  color: rgb(var(--ui-muted));
}
/* barra proporcional via SVG (width é atributo de apresentação, CSP-safe) */
.hf-bar-svg {
  width: 100%;
  height: 10px;
  display: block;
}
.hf-bar-track {
  fill: rgb(var(--ui-muted) / 0.12);
}
.hf-bar-fill {
  transition: width 0.25s ease;
}
.hf-bar-fill[data-tone="running"] { fill: rgb(var(--ui-accent) / 0.7); }
.hf-bar-fill[data-tone="accent"] { fill: rgb(var(--ui-accent)); }
.hf-bar-fill[data-tone="warn"] { fill: rgb(var(--ui-warn)); }
.hf-bar-fill[data-tone="danger"] { fill: rgb(var(--ui-danger)); }
.hf-bar-fill[data-tone="ok"] { fill: rgb(var(--ui-ok)); }
.hf-bar-fill[data-tone="muted"] { fill: rgb(var(--ui-muted) / 0.5); }
.hf-bar-value {
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  color: rgb(var(--ui-fg));
  font-size: var(--ui-text-sm);
  min-width: 2ch;
  text-align: right;
}

/* Escopo da "minha fila" (segmented control acessível) */
.hf-scope {
  display: inline-flex;
  gap: 2px;
  padding: 2px;
  background: rgb(var(--ui-surface-2));
  border: 1px solid rgb(var(--ui-border));
  border-radius: var(--ui-radius-pill);
}
.hf-scope-btn {
  display: inline-flex;
  align-items: center;
  gap: var(--ui-space-2);
  border: none;
  background: transparent;
  color: rgb(var(--ui-muted));
  font: inherit;
  font-size: var(--ui-text-xs);
  font-weight: 600;
  padding: 5px 12px;
  border-radius: var(--ui-radius-pill);
  cursor: pointer;
  white-space: nowrap;
  transition: background 0.15s ease, color 0.15s ease;
}
.hf-scope-btn:hover {
  color: rgb(var(--ui-fg));
}
.hf-scope-btn[data-active="true"] {
  background: rgb(var(--ui-accent));
  color: rgb(var(--ui-accent-fg));
}
.hf-scope-btn:focus-visible {
  outline: 2px solid rgb(var(--ui-accent));
  outline-offset: 2px;
}
.hf-scope-count {
  font-variant-numeric: tabular-nums;
  padding: 0 6px;
  border-radius: var(--ui-radius-pill);
  background: rgb(var(--ui-muted) / 0.18);
  color: inherit;
}
.hf-scope-btn[data-active="true"] .hf-scope-count {
  background: rgb(var(--ui-accent-fg) / 0.22);
}

/* Gráfico de fila (worker) */
.hf-chart {
  width: 100%;
  height: 140px;
}
.hf-chart-svg {
  width: 100%;
  height: 100%;
  display: block;
}
.hf-chart-grid line {
  stroke: rgb(var(--ui-border));
  stroke-width: 1;
  stroke-dasharray: 3 4;
}
.hf-bar-rect {
  transition: opacity 0.15s ease;
}
.hf-bar-rect[data-tone="running"] { fill: rgb(var(--ui-warn)); }
.hf-bar-rect[data-tone="accent"] { fill: rgb(var(--ui-accent)); }
.hf-bar-rect[data-tone="danger"] { fill: rgb(var(--ui-danger)); }
.hf-bar-rect[data-tone="ok"] { fill: rgb(var(--ui-ok)); }

/* Legenda */
.hf-legend {
  list-style: none;
  margin: var(--ui-space-4) 0 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
  gap: var(--ui-space-2) var(--ui-space-4);
}
.hf-legend--inline {
  grid-template-columns: repeat(auto-fit, minmax(170px, max-content));
}
.hf-legend-item {
  display: flex;
  align-items: center;
  gap: var(--ui-space-2);
  font-size: var(--ui-text-sm);
}
.hf-legend-dot {
  width: 10px;
  height: 10px;
  border-radius: var(--ui-radius-sm);
  flex-shrink: 0;
}
.hf-legend-dot[data-tone="running"] { background: rgb(var(--ui-warn)); }
.hf-legend-dot[data-tone="accent"] { background: rgb(var(--ui-accent)); }
.hf-legend-dot[data-tone="danger"] { background: rgb(var(--ui-danger)); }
.hf-legend-dot[data-tone="ok"] { background: rgb(var(--ui-ok)); }
.hf-legend-label {
  color: rgb(var(--ui-muted));
}
.hf-legend-value {
  margin-left: auto;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  color: rgb(var(--ui-fg));
}

.hf-jobs-foot {
  margin-top: var(--ui-space-3);
}

/* Chamados na tabela da fila */
.hf-tk-subject {
  display: inline-flex;
  align-items: baseline;
  gap: var(--ui-space-2);
  min-width: 0;
}
.hf-tk-subject-main {
  font-weight: 600;
  color: rgb(var(--ui-fg));
}
.hf-tk-ref {
  font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace;
  font-size: var(--ui-text-xs);
  color: rgb(var(--ui-accent-strong));
}
.hf-tk-person {
  font-size: var(--ui-text-sm);
  color: rgb(var(--ui-fg));
}
.hf-tk-mine {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: var(--ui-text-xs);
  font-weight: 600;
  padding: 2px 9px;
  border-radius: var(--ui-radius-pill);
  background: rgb(var(--ui-accent) / 0.16);
  color: rgb(var(--ui-accent-strong));
}
.hf-dim {
  color: rgb(var(--ui-muted));
}

/* SLA countdown */
.hf-sla {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: var(--ui-text-xs);
  font-weight: 600;
  padding: 2px 9px;
  border-radius: var(--ui-radius-pill);
  white-space: nowrap;
}
.hf-sla-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: currentColor;
}
.hf-sla[data-state="ok"] { background: rgb(var(--ui-ok) / 0.14); color: rgb(var(--ui-ok)); }
.hf-sla[data-state="soon"] { background: rgb(var(--ui-warn) / 0.18); color: rgb(var(--ui-warn)); }
.hf-sla[data-state="breached"] { background: rgb(var(--ui-danger) / 0.16); color: rgb(var(--ui-danger)); }
.hf-sla[data-state="none"] { background: rgb(var(--ui-muted) / 0.14); color: rgb(var(--ui-muted)); font-weight: 500; }

/* Atalhos */
.hf-quick {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: var(--ui-space-3);
}
.hf-quick-card {
  display: flex;
  align-items: center;
  gap: var(--ui-space-3);
  padding: var(--ui-space-4);
  border: 1px solid rgb(var(--ui-border));
  border-radius: var(--ui-radius-md);
  background: rgb(var(--ui-surface-2));
  color: rgb(var(--ui-fg));
  text-decoration: none;
  transition: border-color 0.15s ease, transform 0.15s ease;
}
.hf-quick-card:hover {
  border-color: rgb(var(--ui-accent));
  transform: translateY(-1px);
}
.hf-quick-card:focus-visible {
  outline: 2px solid rgb(var(--ui-accent));
  outline-offset: 2px;
}
.hf-quick-icon {
  font-size: 1.4rem;
  flex-shrink: 0;
}
.hf-quick-text {
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.hf-quick-title {
  font-weight: 600;
}
.hf-quick-desc {
  font-size: var(--ui-text-xs);
  color: rgb(var(--ui-muted));
}
.hf-quick-arrow {
  margin-left: auto;
  color: rgb(var(--ui-faint));
  font-size: 1.1rem;
}
.hf-quick-card:hover .hf-quick-arrow {
  color: rgb(var(--ui-accent));
}

@media (max-width: 860px) {
  .hf-grid-2 {
    grid-template-columns: 1fr;
  }
  .hf-bar-row {
    grid-template-columns: 96px 1fr auto;
  }
  .hf-scope {
    flex-wrap: wrap;
  }
}
</style>
