<!--
  DashboardView — Painel da clínica (REQ-NEUROEVOLUI-0005 / 0004 / 0002).
  Visão geral: KPIs de receita, agendamentos do dia, evoluções recentes, saúde das filas/IA.
  Endpoints REAIS: GET /v1/dashboard/revenue · GET /v1/consultations · GET /v1/health/queue · GET /health.
  Cada bloco carrega de forma independente e fail-soft: um 403 (papel sem acesso) degrada SÓ aquele
  bloco — a tela nunca fica em branco. Cards de métrica e atalhos navegam para listas de DOMÍNIO.
-->
<template>
  <UiPageLayout
    title="Painel"
    eyebrow="NeuroEvolui"
    subtitle="Visão geral da clínica — receita, agenda do dia, evoluções e saúde do sistema."
    width="wide"
    :error="fatalError"
    @retry="loadAll"
  >
    <template #actions>
      <UiButton variant="subtle" :loading="anyLoading" @click="loadAll">Atualizar</UiButton>
      <UiButton to="/consultations/new">Novo agendamento</UiButton>
    </template>

    <!-- Atalhos de ação rápida -->
    <section class="dash-quick" aria-label="Ações rápidas">
      <RouterLink
        v-for="q in quickActions"
        :key="q.to"
        :to="q.to"
        class="dash-quick-card"
        :data-tone="q.tone"
      >
        <span class="dash-quick-icon" aria-hidden="true">{{ q.icon }}</span>
        <span class="dash-quick-body">
          <span class="dash-quick-title">{{ q.title }}</span>
          <span class="dash-quick-desc">{{ q.desc }}</span>
        </span>
        <span class="dash-quick-arrow" aria-hidden="true">→</span>
      </RouterLink>
    </section>

    <!-- KPIs clicáveis -->
    <section class="dash-metrics" aria-label="Indicadores">
      <UiMetricCard
        label="Receita autorizada"
        :value="revenueDenied ? 'Sem acesso' : revenueDisplay"
        :tone="revenueDenied ? 'neutral' : 'success'"
        :hint="revenueHint"
        :loading="revenue.loading"
        clickable
        @click="go('/consultations')"
      />
      <UiMetricCard
        label="Agendamentos hoje"
        :value="todayCount"
        tone="primary"
        :hint="appointmentsHint"
        :loading="consultations.loading"
        clickable
        @click="go('/consultations')"
      />
      <UiMetricCard
        label="Evoluções registradas"
        :value="evolutionNotesDisplay"
        tone="running"
        :hint="evolutionNotesHint"
        :loading="evolutionNotes.loading"
        clickable
        @click="go('/evolution-notes')"
      />
      <UiMetricCard
        label="Pendências na fila"
        :value="queuePendingDisplay"
        :tone="queueTone"
        :hint="queueHint"
        :loading="queue.loading"
        clickable
        @click="go('/async-jobs')"
      />
      <UiMetricCard
        label="Saúde da IA"
        :value="aiHealthLabel"
        :tone="aiHealthTone"
        :hint="aiHealthHint"
        :loading="queue.loading || api.loading"
        clickable
        @click="go('/assistant')"
      />
    </section>

    <div class="dash-grid">
      <!-- Agendamentos do dia -->
      <UiCard title="Agenda de hoje" :subtitle="agendaSubtitle">
        <template #actions>
          <UiButton variant="ghost" size="sm" to="/consultations">Ver todos</UiButton>
        </template>

        <UiErrorState
          v-if="consultations.error"
          :message="consultationsErrorMsg"
          @retry="loadConsultations"
        />
        <UiDataTable
          v-else
          :columns="agendaColumns"
          :rows="todayRows"
          :loading="consultations.loading"
          row-key="id"
          density="compact"
          clickable-rows
          :empty="{
            title: 'Nenhum agendamento para hoje',
            description: 'Crie um novo agendamento para começar o dia.',
            icon: 'clock',
          }"
          @row-click="go('/consultations')"
        >
          <template #cell-scheduled_at="{ value }">{{ format.formatDateTime(value) }}</template>
          <template #cell-amount_cents="{ value }">{{ formatCents(value) }}</template>
          <template #cell-payment_status="{ value }">
            <UiStatusBadge :status="value || 'pending'" />
          </template>
          <template #cell-status="{ value }">
            <UiStatusBadge :status="value || 'scheduled'" />
          </template>
          <template #empty-action>
            <UiButton to="/consultations/new">Novo agendamento</UiButton>
          </template>
        </UiDataTable>
      </UiCard>

      <!-- Saúde do sistema -->
      <UiCard title="Saúde do sistema" subtitle="Filas de processamento e disponibilidade.">
        <template #actions>
          <UiButton variant="ghost" size="sm" @click="loadHealth">Recarregar</UiButton>
        </template>

        <UiErrorState
          v-if="queue.error && api.error"
          :message="'Não foi possível ler a saúde do sistema.'"
          @retry="loadHealth"
        />
        <ul v-else class="dash-health" role="list">
          <li class="dash-health-row">
            <span class="dash-health-label">API</span>
            <UiStatusBadge
              :status="api.loading ? 'verificando' : apiOk ? 'online' : 'offline'"
              :tone="api.loading ? 'running' : apiOk ? 'success' : 'error'"
              :label="api.loading ? 'Verificando…' : apiOk ? 'No ar' : 'Fora'"
            />
          </li>
          <li class="dash-health-row">
            <span class="dash-health-label">Banco de dados</span>
            <UiStatusBadge
              :status="dbOk ? 'connected' : 'offline'"
              :tone="api.loading ? 'running' : dbOk ? 'success' : 'error'"
              :label="api.loading ? 'Verificando…' : dbOk ? 'Conectado' : 'Indisponível'"
            />
          </li>
          <li class="dash-health-row">
            <span class="dash-health-label">Fila de jobs (Redis)</span>
            <UiStatusBadge
              :status="redisOk ? 'active' : 'pending'"
              :tone="queue.loading ? 'running' : redisOk ? 'success' : 'warning'"
              :label="queue.loading ? 'Verificando…' : redisOk ? 'Ativa' : 'Modo inline'"
            />
          </li>
        </ul>

        <div v-if="redisOk" class="dash-queue-stats" aria-label="Estatísticas da fila">
          <div v-for="s in queueStats" :key="s.key" class="dash-queue-stat" :data-tone="s.tone">
            <span class="dash-queue-num">{{ s.value }}</span>
            <span class="dash-queue-key">{{ s.label }}</span>
          </div>
        </div>
        <p v-else-if="!queue.loading && !queue.error" class="dash-note">
          A fila está em modo inline (sem Redis): os jobs rodam de forma síncrona.
        </p>
      </UiCard>
    </div>

    <!-- Movimentações recentes (consultas) -->
    <UiCard title="Movimentações recentes" subtitle="Últimos agendamentos e cobranças da clínica.">
      <template #actions>
        <UiButton variant="ghost" size="sm" to="/consultations">Abrir lista</UiButton>
      </template>

      <UiErrorState
        v-if="consultations.error"
        :message="consultationsErrorMsg"
        @retry="loadConsultations"
      />
      <UiDataTable
        v-else
        :columns="recentColumns"
        :rows="recentRows"
        :loading="consultations.loading"
        row-key="id"
        clickable-rows
        :empty="{
          title: 'Sem movimentações',
          description: 'Quando houver agendamentos, eles aparecem aqui.',
          icon: 'inbox',
        }"
        @row-click="go('/consultations')"
      >
        <template #cell-scheduled_at="{ value }">{{ format.formatDateTime(value) }}</template>
        <template #cell-amount_cents="{ value }">{{ formatCents(value) }}</template>
        <template #cell-payment_status="{ value }">
          <UiStatusBadge :status="value || 'pending'" />
        </template>
        <template #cell-status="{ value }">
          <UiStatusBadge :status="value || 'scheduled'" />
        </template>
        <template #empty-action>
          <UiButton to="/consultations">Novo agendamento</UiButton>
        </template>
      </UiDataTable>
    </UiCard>

    <template #footer>
      <span>Escopo automático por clínica (tenant). Última atualização: {{ lastUpdatedLabel }}.</span>
    </template>
  </UiPageLayout>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue';
import { useRouter, RouterLink } from 'vue-router';
import {
  UiPageLayout,
  UiCard,
  UiMetricCard,
  UiDataTable,
  UiStatusBadge,
  UiButton,
  UiErrorState,
  useToast,
  format,
} from '../ui/index.js';
import { resourceFactory, health } from '../api.js';

const router = useRouter();
const toast = useToast();

// Recursos REAIS de domínio (resourceFactory → /v1/<name>).
const consultationsApi = resourceFactory('consultations');
const evolutionNotesApi = resourceFactory('evolution-notes');
const dashboardRevenueApi = resourceFactory('dashboard/revenue');
const queueHealthApi = resourceFactory('health/queue');

// Estado por bloco — cada um carrega/falha de forma independente (fail-soft).
const consultations = reactive({ loading: true, error: null, rows: [] });
const evolutionNotes = reactive({ loading: true, error: null, total: null });
const revenue = reactive({ loading: true, error: null, meta: null });
const queue = reactive({ loading: true, error: null, counts: null });
const api = reactive({ loading: true, error: null, status: null });
const lastUpdated = ref(null);

const revenueDenied = computed(() => isDenied(revenue.error));

// Atalhos de CRIAÇÃO: levam direto ao formulário "/new" (não à lista) — o propósito
// declarado é "novo X", então o usuário não deve cair na listagem e clicar de novo.
const quickActions = [
  { to: '/consultations/new', icon: '＋', tone: 'primary', title: 'Novo agendamento', desc: 'Marcar uma consulta' },
  { to: '/evolution-notes/new', icon: '✎', tone: 'running', title: 'Nova evolução', desc: 'Registrar atendimento' },
  { to: '/patients/new', icon: '☻', tone: 'success', title: 'Novo paciente', desc: 'Cadastrar paciente' },
  { to: '/assistant', icon: '✨', tone: 'neutral', title: 'Assistente de IA', desc: 'Tirar dúvidas clínicas' },
];

const agendaColumns = [
  { key: 'scheduled_at', label: 'Horário' },
  { key: 'patient_id', label: 'Paciente' },
  { key: 'professional_id', label: 'Profissional' },
  { key: 'amount_cents', label: 'Valor', align: 'right' },
  { key: 'status', label: 'Situação' },
];

const recentColumns = [
  { key: 'scheduled_at', label: 'Agendado para' },
  { key: 'patient_id', label: 'Paciente' },
  { key: 'amount_cents', label: 'Valor', align: 'right' },
  { key: 'payment_status', label: 'Pagamento' },
  { key: 'status', label: 'Situação' },
];

// ── Helpers ───────────────────────────────────────────────────────────────────
function isDenied(err) {
  return !!err && (err.status === 403 || err.status === 401);
}
function formatCents(cents) {
  const n = Number(cents);
  if (!isFinite(n)) return '—';
  return format.formatCurrency(n / 100);
}
function go(to) {
  router.push(to);
}
function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}
function isToday(value) {
  if (!value) return false;
  const d = new Date(value);
  if (isNaN(d.getTime())) return false;
  const start = startOfToday();
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return d >= start && d < end;
}

// ── Derivados: agenda + recentes ────────────────────────────────────────────────
const todayRows = computed(() =>
  consultations.rows.filter((c) => isToday(c.scheduled_at)).slice(0, 8),
);
const recentRows = computed(() => consultations.rows.slice(0, 8));
const todayCount = computed(() => todayRows.value.length);

// KPI de evoluções: contagem REAL do recurso /v1/evolution-notes (não reaproveita
// a contagem de consultas). Degrada de forma graciosa (sem acesso / falha).
const evolutionNotesDenied = computed(() => isDenied(evolutionNotes.error));
const evolutionNotesDisplay = computed(() => {
  if (evolutionNotesDenied.value) return 'Sem acesso';
  if (evolutionNotes.error) return '—';
  if (evolutionNotes.total === null) return '—';
  return format.formatNumber(evolutionNotes.total);
});
const evolutionNotesHint = computed(() => {
  if (evolutionNotes.loading) return 'apurando…';
  if (evolutionNotesDenied.value) return 'requer acesso ao prontuário';
  if (evolutionNotes.error) return 'não foi possível carregar';
  return 'total no prontuário do tenant';
});

const agendaSubtitle = computed(() =>
  consultations.loading
    ? 'Carregando…'
    : todayCount.value
      ? `${todayCount.value} agendamento(s) para hoje`
      : 'Nada marcado para hoje',
);
const appointmentsHint = computed(() =>
  consultations.error ? 'não foi possível carregar' : 'marcados para hoje',
);
const consultationsErrorMsg = computed(() =>
  isDenied(consultations.error)
    ? 'Seu perfil não tem acesso aos agendamentos.'
    : 'Não foi possível carregar os agendamentos.',
);

// ── Derivados: receita ──────────────────────────────────────────────────────────
const revenueDisplay = computed(() => {
  if (!revenue.meta) return '—';
  return formatCents(revenue.meta.revenue_cents);
});
const revenueHint = computed(() => {
  if (revenue.loading) return 'apurando…';
  if (revenueDenied.value) return 'requer perfil de gestão';
  if (revenue.error) return 'falha ao apurar';
  const total = revenue.meta?.total ?? 0;
  return total ? `de ${format.formatNumber(total)} consulta(s)` : 'nenhuma cobrança ainda';
});

// ── Derivados: fila ─────────────────────────────────────────────────────────────
const redisOk = computed(() => !!queue.counts && queue.counts.redis === true);
const queuePending = computed(() => {
  if (!redisOk.value) return 0;
  const c = queue.counts;
  return (Number(c.waiting) || 0) + (Number(c.active) || 0) + (Number(c.delayed) || 0);
});
const queueFailed = computed(() => (redisOk.value ? Number(queue.counts.failed) || 0 : 0));
const queuePendingDisplay = computed(() => {
  if (queue.loading) return '—';
  if (queue.error) return '—';
  if (!redisOk.value) return 'inline';
  return format.formatNumber(queuePending.value);
});
const queueTone = computed(() => {
  if (queue.error) return 'error';
  if (queueFailed.value > 0) return 'error';
  if (queuePending.value > 0) return 'warning';
  return 'success';
});
const queueHint = computed(() => {
  if (queue.loading) return 'lendo a fila…';
  if (queue.error) return 'fila indisponível';
  if (!redisOk.value) return 'jobs rodam de forma síncrona';
  if (queueFailed.value > 0) return `${queueFailed.value} job(s) com falha`;
  return queuePending.value ? 'aguardando processamento' : 'tudo processado';
});
const queueStats = computed(() => {
  const c = queue.counts || {};
  return [
    { key: 'waiting', label: 'Aguardando', value: Number(c.waiting) || 0, tone: 'warning' },
    { key: 'active', label: 'Em execução', value: Number(c.active) || 0, tone: 'running' },
    { key: 'completed', label: 'Concluídos', value: Number(c.completed) || 0, tone: 'success' },
    { key: 'failed', label: 'Com falha', value: Number(c.failed) || 0, tone: 'error' },
    { key: 'delayed', label: 'Agendados', value: Number(c.delayed) || 0, tone: 'neutral' },
  ];
});

// ── Derivados: API/DB ───────────────────────────────────────────────────────────
const apiOk = computed(() => !api.error && api.status?.status === 'ok');
const dbOk = computed(() => !api.error && api.status?.db === 'connected');

// ── Derivados: saúde da IA (a partir de sinais REAIS: API + fila de processamento) ─
const aiHealthLabel = computed(() => {
  if (api.loading || queue.loading) return '…';
  if (!apiOk.value) return 'Indisponível';
  if (queueFailed.value > 0) return 'Degradada';
  return 'Operante';
});
const aiHealthTone = computed(() => {
  if (api.loading || queue.loading) return 'neutral';
  if (!apiOk.value) return 'error';
  if (queueFailed.value > 0) return 'warning';
  return 'success';
});
const aiHealthHint = computed(() => {
  if (!apiOk.value && !api.loading) return 'serviço fora do ar';
  if (queueFailed.value > 0) return 'jobs de IA com falha';
  return 'processamento assistido';
});

// ── Estados globais da moldura ──────────────────────────────────────────────────
const anyLoading = computed(
  () =>
    consultations.loading ||
    evolutionNotes.loading ||
    revenue.loading ||
    queue.loading ||
    api.loading,
);
// Só vira erro FATAL (tela inteira) se TUDO falhar — caso contrário cada bloco degrada sozinho.
const fatalError = computed(() => {
  const allDone = !consultations.loading && !revenue.loading && !queue.loading && !api.loading;
  const allFailed = consultations.error && queue.error && api.error;
  return allDone && allFailed ? 'Não foi possível carregar o painel.' : null;
});
const lastUpdatedLabel = computed(() =>
  lastUpdated.value ? format.formatDateTime(lastUpdated.value) : '—',
);

// ── Carregamento (fail-soft por bloco) ──────────────────────────────────────────
async function loadConsultations() {
  consultations.loading = true;
  consultations.error = null;
  try {
    const r = await consultationsApi.list();
    consultations.rows = Array.isArray(r?.data) ? r.data : Array.isArray(r) ? r : [];
  } catch (e) {
    consultations.error = e;
  } finally {
    consultations.loading = false;
  }
}

async function loadEvolutionNotes() {
  evolutionNotes.loading = true;
  evolutionNotes.error = null;
  try {
    // pageSize: 1 — só precisamos do total do servidor para o KPI (não da lista).
    const r = await evolutionNotesApi.list({ pageSize: 1 });
    const total = r && typeof r.total === 'number' ? r.total : Array.isArray(r?.data) ? r.data.length : 0;
    evolutionNotes.total = total;
  } catch (e) {
    evolutionNotes.error = e;
    if (!isDenied(e)) evolutionNotes.total = null;
  } finally {
    evolutionNotes.loading = false;
  }
}

async function loadRevenue() {
  revenue.loading = true;
  revenue.error = null;
  try {
    const r = await dashboardRevenueApi.list();
    revenue.meta = r?.meta || { revenue_cents: 0, total: (r?.data || []).length };
  } catch (e) {
    revenue.error = e;
    if (!isDenied(e)) revenue.meta = null;
  } finally {
    revenue.loading = false;
  }
}

async function loadQueue() {
  queue.loading = true;
  queue.error = null;
  try {
    const r = await queueHealthApi.list();
    // /v1/health/queue → { status, queue: {...} }; resourceFactory embrulha sem 'data' → usa direto.
    queue.counts = (r && r.queue) || (r && r.data && r.data.queue) || null;
  } catch (e) {
    queue.error = e;
    queue.counts = null;
  } finally {
    queue.loading = false;
  }
}

async function loadApiHealth() {
  api.loading = true;
  api.error = null;
  try {
    api.status = await health();
  } catch (e) {
    api.error = e;
    api.status = null;
  } finally {
    api.loading = false;
  }
}
const loadHealth = () => Promise.all([loadQueue(), loadApiHealth()]);

async function loadAll() {
  // Cada loader é fail-soft (nunca lança): allSettled apenas paraleliza os 4 blocos.
  await Promise.allSettled([
    loadConsultations(),
    loadEvolutionNotes(),
    loadRevenue(),
    loadQueue(),
    loadApiHealth(),
  ]);
  lastUpdated.value = new Date().toISOString();
  // Cada bloco falha de forma independente; o resumo reflete o estado real após o load.
  const blockErrors = [consultations.error, queue.error, api.error].filter(Boolean).length;
  if (blockErrors === 0) {
    toast.success('Painel atualizado');
  } else if (blockErrors < 3) {
    toast.warning('Painel atualizado com pendências em alguns blocos');
  } else {
    toast.error('Falha ao atualizar o painel');
  }
}

onMounted(loadAll);
</script>

<style scoped>
/* Atalhos rápidos */
.dash-quick {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: var(--ui-space-3);
}
.dash-quick-card {
  display: flex;
  align-items: center;
  gap: var(--ui-space-3);
  padding: var(--ui-space-4);
  background: rgb(var(--ui-surface));
  border: 1px solid rgb(var(--ui-border));
  border-radius: var(--ui-radius-lg);
  box-shadow: var(--ui-shadow-sm);
  text-decoration: none;
  color: rgb(var(--ui-fg));
  transition:
    transform 0.14s ease,
    border-color 0.14s ease,
    box-shadow 0.14s ease;
}
.dash-quick-card:hover {
  transform: translateY(-2px);
  border-color: rgb(var(--ui-accent));
  box-shadow: var(--ui-shadow-md);
}
.dash-quick-card:focus-visible {
  outline: 2px solid rgb(var(--ui-accent));
  outline-offset: 2px;
}
.dash-quick-icon {
  display: grid;
  place-items: center;
  /* 40px construído a partir da régua de espaçamento (32 + 8) — sem valor cru. */
  width: calc(var(--ui-space-6) + var(--ui-space-2));
  height: calc(var(--ui-space-6) + var(--ui-space-2));
  flex-shrink: 0;
  border-radius: var(--ui-radius-md);
  font-size: var(--ui-text-xl);
  background: rgb(var(--ui-accent) / 0.12);
  color: rgb(var(--ui-accent-strong));
}
.dash-quick-card[data-tone="success"] .dash-quick-icon {
  background: rgb(var(--ui-ok) / 0.14);
  color: rgb(var(--ui-ok));
}
.dash-quick-card[data-tone="running"] .dash-quick-icon {
  background: rgb(var(--ui-accent) / 0.12);
  color: rgb(var(--ui-accent-strong));
}
.dash-quick-card[data-tone="neutral"] .dash-quick-icon {
  background: rgb(var(--ui-muted) / 0.14);
  color: rgb(var(--ui-muted));
}
.dash-quick-body {
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-1);
  min-width: 0;
}
.dash-quick-title {
  font-weight: 600;
  font-size: var(--ui-text-md);
}
.dash-quick-desc {
  color: rgb(var(--ui-muted));
  font-size: var(--ui-text-xs);
}
.dash-quick-arrow {
  margin-left: auto;
  color: rgb(var(--ui-faint));
  font-size: var(--ui-text-lg);
  transition: transform 0.14s ease;
}
.dash-quick-card:hover .dash-quick-arrow {
  transform: translateX(3px);
  color: rgb(var(--ui-accent));
}

/* KPIs */
.dash-metrics {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
  gap: var(--ui-space-4);
}

/* Grid de cartões principais */
.dash-grid {
  display: grid;
  grid-template-columns: 1.6fr 1fr;
  gap: var(--ui-space-4);
  align-items: start;
}

/* Saúde do sistema */
.dash-health {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-3);
}
.dash-health-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ui-space-3);
}
.dash-health-label {
  color: rgb(var(--ui-muted));
  font-size: var(--ui-text-sm);
}
.dash-queue-stats {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(78px, 1fr));
  gap: var(--ui-space-2);
  margin-top: var(--ui-space-4);
  padding-top: var(--ui-space-4);
  border-top: 1px solid rgb(var(--ui-border));
}
.dash-queue-stat {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--ui-space-1);
  padding: var(--ui-space-2);
  border-radius: var(--ui-radius-md);
  background: rgb(var(--ui-surface-2));
}
.dash-queue-num {
  font-family: var(--ui-font-display);
  font-size: var(--ui-text-xl);
  font-weight: 700;
}
.dash-queue-stat[data-tone="success"] .dash-queue-num {
  color: rgb(var(--ui-ok));
}
.dash-queue-stat[data-tone="warning"] .dash-queue-num {
  color: rgb(var(--ui-warn));
}
.dash-queue-stat[data-tone="error"] .dash-queue-num {
  color: rgb(var(--ui-danger));
}
.dash-queue-stat[data-tone="running"] .dash-queue-num {
  color: rgb(var(--ui-accent-strong));
}
.dash-queue-key {
  color: rgb(var(--ui-muted));
  font-size: var(--ui-text-xs);
  text-align: center;
}
.dash-note {
  margin: var(--ui-space-2) 0 0;
  color: rgb(var(--ui-muted));
  font-size: var(--ui-text-sm);
}

@media (max-width: 860px) {
  .dash-grid {
    grid-template-columns: 1fr;
  }
}
</style>
