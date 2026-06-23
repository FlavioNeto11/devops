<template>
  <UiPageLayout
    width="wide"
    eyebrow="Times & Filas"
    :title="pageTitle"
    subtitle="Visão completa do time: membros, SLA padrão, fila de chamados atribuídos e saúde da fila."
    :loading="loading"
    :error="loadError"
    @retry="reload"
  >
    <template #actions>
      <UiButton variant="ghost" to="/teams">
        <template #icon-left><span class="td-ico" aria-hidden="true">←</span></template>
        Voltar aos times
      </UiButton>
      <UiButton variant="subtle" :loading="refreshing" @click="reload">
        <template #icon-left><span class="td-ico" aria-hidden="true">↻</span></template>
        Atualizar
      </UiButton>
      <UiButton v-if="team" variant="subtle" :to="'/teams/' + team.id + '/edit'">
        <template #icon-left><span class="td-ico" aria-hidden="true">✎</span></template>
        Editar time
      </UiButton>
      <UiButton
        v-if="team"
        :variant="isActive ? 'danger' : 'primary'"
        :loading="togglingStatus"
        @click="toggleStatus"
      >
        {{ isActive ? 'Desativar time' : 'Reativar time' }}
      </UiButton>
    </template>

    <!-- EntityHeader: cabeçalho de identidade do time -->
    <section v-if="team" class="td-header" aria-label="Identidade do time">
      <span class="td-header-avatar" aria-hidden="true">{{ teamInitials }}</span>
      <div class="td-header-id">
        <div class="td-header-titleline">
          <h2 class="td-header-name">{{ team.name || 'Time sem nome' }}</h2>
          <UiStatusBadge :status="statusValue" :tone="statusTone" :label="statusLabelText" size="lg" />
        </div>
        <p class="td-header-desc">{{ team.description || 'Sem descrição cadastrada para este time.' }}</p>
        <ul class="td-header-facts">
          <li class="td-fact">
            <span class="td-fact-icon" aria-hidden="true">★</span>
            <span class="td-fact-label">Líder</span>
            <span class="td-fact-value">{{ leadLabel }}</span>
          </li>
          <li class="td-fact">
            <span class="td-fact-icon" aria-hidden="true">⏱</span>
            <span class="td-fact-label">SLA padrão</span>
            <span class="td-fact-value">{{ slaLabel }}</span>
          </li>
          <li class="td-fact">
            <span class="td-fact-icon" aria-hidden="true">🛟</span>
            <span class="td-fact-label">Membros</span>
            <span class="td-fact-value">{{ members.length }} agente(s)</span>
          </li>
        </ul>
      </div>
    </section>

    <!-- Métricas da fila (KPIs derivados dos chamados atribuídos) -->
    <section v-if="team" class="td-metrics" aria-label="Métricas da fila do time">
      <UiMetricCard
        label="Chamados na fila"
        :value="queueMetrics.total"
        :loading="queueLoading"
        tone="primary"
        hint="Atribuídos a este time"
      />
      <UiMetricCard
        label="Abertos"
        :value="queueMetrics.open"
        :loading="queueLoading"
        tone="running"
        hint="Aguardando ação"
      />
      <UiMetricCard
        label="Em andamento"
        :value="queueMetrics.inProgress"
        :loading="queueLoading"
        tone="neutral"
        hint="Sendo tratados"
      />
      <UiMetricCard
        label="Urgentes"
        :value="queueMetrics.urgent"
        :loading="queueLoading"
        :tone="queueMetrics.urgent > 0 ? 'error' : 'success'"
        hint="Prioridade máxima"
      />
      <UiMetricCard
        label="Não atribuídos"
        :value="queueMetrics.unassigned"
        :loading="queueLoading"
        :tone="queueMetrics.unassigned > 0 ? 'warning' : 'success'"
        hint="Sem responsável"
      />
      <UiMetricCard
        label="SLA em risco"
        :value="queueMetrics.slaRisk"
        :loading="queueLoading"
        :tone="queueMetrics.slaRisk > 0 ? 'warning' : 'success'"
        hint="Vencidos ou < 2h"
      />
    </section>

    <div v-if="team" class="td-grid">
      <!-- PropertiesGrid: propriedades do time -->
      <UiCard title="Propriedades do time" subtitle="Configuração e responsáveis.">
        <template #actions>
          <UiStatusBadge :status="statusValue" :tone="statusTone" :label="statusLabelText" />
        </template>
        <dl class="td-props">
          <div class="td-prop">
            <dt>Nome</dt>
            <dd>{{ team.name || '—' }}</dd>
          </div>
          <div class="td-prop">
            <dt>Descrição</dt>
            <dd class="td-prop-long">{{ team.description || 'Sem descrição.' }}</dd>
          </div>
          <div class="td-prop">
            <dt>Líder</dt>
            <dd>
              <RouterLink v-if="leadAgent" class="td-link" :to="'/agents/' + leadAgent.id">
                {{ leadAgent.name || ('Agente #' + leadAgent.id) }}
              </RouterLink>
              <RouterLink v-else-if="team.lead_agent_id" class="td-link" :to="'/agents/' + team.lead_agent_id">
                Agente #{{ team.lead_agent_id }}
              </RouterLink>
              <span v-else class="td-muted">Sem líder definido</span>
            </dd>
          </div>
          <div class="td-prop">
            <dt>SLA padrão</dt>
            <dd>
              <RouterLink v-if="team.default_sla_policy_id" class="td-link" :to="'/sla-policies/' + team.default_sla_policy_id">
                {{ slaLabel }}
              </RouterLink>
              <span v-else class="td-muted">Não definido</span>
            </dd>
          </div>
          <div class="td-prop">
            <dt>Situação</dt>
            <dd><UiStatusBadge :status="statusValue" :tone="statusTone" :label="statusLabelText" /></dd>
          </div>
          <div class="td-prop">
            <dt>ID do time</dt>
            <dd class="td-mono">#{{ team.id }}</dd>
          </div>
        </dl>
      </UiCard>

      <!-- MemberList: agentes membros do time -->
      <UiCard title="Membros do time" :subtitle="membersSubtitle">
        <template #actions>
          <UiButton size="sm" variant="ghost" to="/agents">Ver agentes</UiButton>
        </template>

        <UiLoadingState v-if="membersLoading" variant="skeleton" :skeleton-lines="4" />

        <div v-else-if="membersError" class="td-inline-error" role="alert">
          <p class="td-inline-error-text">Não foi possível carregar os membros.</p>
          <UiButton size="sm" variant="ghost" @click="loadMembers">Tentar de novo</UiButton>
        </div>

        <UiEmptyState
          v-else-if="!members.length"
          title="Nenhum agente neste time"
          description="Atribua agentes a este time na tela de agentes para montar a fila de atendimento."
          icon="users"
        >
          <template #action>
            <UiButton size="sm" to="/agents">Gerenciar agentes</UiButton>
          </template>
        </UiEmptyState>

        <ul v-else class="td-members" aria-label="Membros do time">
          <li v-for="m in members" :key="m.id" class="td-member" :data-lead="m.id === team.lead_agent_id ? 'true' : null">
            <RouterLink class="td-member-link" :to="'/agents/' + m.id" :aria-label="'Abrir agente ' + (m.name || ('#' + m.id))">
              <span class="td-member-avatar" aria-hidden="true">{{ agentInitials(m.name) }}</span>
              <div class="td-member-id">
                <span class="td-member-name">
                  {{ m.name || ('Agente #' + m.id) }}
                  <span v-if="m.id === team.lead_agent_id" class="td-lead-tag">Líder</span>
                </span>
                <span class="td-member-mail">{{ m.email || '—' }}</span>
              </div>
            </RouterLink>
            <div class="td-member-meta">
              <UiStatusBadge :status="m.role" :tone="roleTone(m.role)" :label="roleLabel(m.role)" :with-dot="false" size="sm" />
              <UiStatusBadge :status="m.status" :with-dot="true" size="sm" />
            </div>
          </li>
        </ul>
      </UiCard>
    </div>

    <!-- QueueTicketsList: fila de chamados atribuídos ao time -->
    <UiCard v-if="team" title="Fila de chamados atribuídos" :subtitle="queueSubtitle">
      <template #actions>
        <div class="td-queue-filters" role="group" aria-label="Filtros rápidos da fila">
          <UiButton
            v-for="f in queueQuickFilters"
            :key="f.value"
            size="sm"
            :variant="queueStatusFilter === f.value ? 'subtle' : 'ghost'"
            @click="queueStatusFilter = f.value"
          >{{ f.label }}</UiButton>
        </div>
      </template>

      <UiDataTable
        :columns="queueColumns"
        :rows="filteredQueue"
        :loading="queueLoading"
        :error="queueError"
        row-key="id"
        density="comfortable"
        clickable-rows
        :empty="queueEmptyState"
        @row-click="openTicket"
        @retry="loadQueue"
      >
        <!-- Assunto + referência -->
        <template #cell-subject="{ row }">
          <div class="td-subject">
            <span class="td-subject-main">{{ row.subject || row.title || ('Chamado #' + row.id) }}</span>
            <span class="td-subject-ref">#{{ row.id }}</span>
          </div>
        </template>

        <!-- Status -->
        <template #cell-status="{ value }">
          <UiStatusBadge :status="value" :label="statusMap[value] || ''" />
        </template>

        <!-- Prioridade -->
        <template #cell-priority="{ value }">
          <UiStatusBadge :tone="priorityTone(value)" :label="priorityLabel(value)" :status="value" with-dot />
        </template>

        <!-- Responsável -->
        <template #cell-assignee_id="{ value }">
          <span v-if="value" class="td-person">
            <span class="td-person-avatar" aria-hidden="true">{{ assigneeInitials(value) }}</span>
            <span class="td-person-name">{{ assigneeName(value) }}</span>
          </span>
          <UiStatusBadge v-else tone="warning" label="Não atribuído" :with-dot="false" size="sm" />
        </template>

        <!-- SLA: contagem regressiva CSS-safe -->
        <template #cell-sla_due_at="{ row }">
          <span
            v-if="row.sla_due_at && !isClosed(row.status)"
            class="td-sla"
            :data-state="slaState(row.sla_due_at)"
            :title="formatDateTime(row.sla_due_at)"
          >
            <span class="td-sla-dot" aria-hidden="true" />
            {{ slaCountdown(row.sla_due_at) }}
          </span>
          <span v-else-if="isClosed(row.status)" class="td-dash">—</span>
          <span v-else class="td-sla" data-state="none">Sem SLA</span>
        </template>

        <!-- Atualizado -->
        <template #cell-updated_at="{ value }">
          <span class="td-dim">{{ value ? formatDateTime(value) : '—' }}</span>
        </template>

        <template #empty-action>
          <UiButton size="sm" to="/teams">Ver outros times</UiButton>
        </template>
      </UiDataTable>
    </UiCard>

    <!-- Estado vazio: time não encontrado (resposta sem erro de rede, ex.: 404) -->
    <UiEmptyState
      v-else-if="!loading && !loadError && notFound"
      icon="users"
      title="Time não encontrado"
      description="Este time pode ter sido removido ou o endereço está incorreto."
    >
      <template #action>
        <UiButton to="/teams">Voltar aos times</UiButton>
      </template>
    </UiEmptyState>

    <template v-if="team" #footer>
      <span>{{ footerSummary }}</span>
    </template>
  </UiPageLayout>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import {
  UiPageLayout,
  UiCard,
  UiMetricCard,
  UiStatusBadge,
  UiDataTable,
  UiButton,
  UiEmptyState,
  UiLoadingState,
  useToast,
  useConfirm,
  format,
} from '../ui/index.js';
import { resourceFactory, teamAgents, teamTickets } from '../api.js';

const route = useRoute();
const router = useRouter();
const toast = useToast();
const ask = useConfirm();
const formatDateTime = format.formatDateTime;

// Recursos de DOMÍNIO reais (backend expõe /v1/<name>).
const teamsApi = resourceFactory('teams');
const slaApi = resourceFactory('sla-policies');

const teamId = computed(() => route.params.id);

// ---------- estado da entidade ----------
const team = ref(null);
const loading = ref(true);
const refreshing = ref(false);
const loadError = ref(null);
const notFound = ref(false);
const togglingStatus = ref(false);

// ---------- membros ----------
const members = ref([]);
const membersLoading = ref(false);
const membersError = ref(false);

// ---------- fila de chamados ----------
const queue = ref([]);
const queueLoading = ref(false);
const queueError = ref(null);
const queueStatusFilter = ref('');

// ---------- domínio: rótulos e tons ----------
const STATUS_LABELS = { active: 'Ativo', inactive: 'Inativo' };
const ROLES = {
  admin: { label: 'Admin', tone: 'error' },
  supervisor: { label: 'Supervisor', tone: 'warning' },
  agent: { label: 'Agente', tone: 'running' },
  viewer: { label: 'Leitor', tone: 'neutral' },
};
const TICKET_STATUS = {
  open: 'Aberto',
  in_progress: 'Em andamento',
  pending: 'Pendente',
  on_hold: 'Em espera',
  resolved: 'Resolvido',
  closed: 'Encerrado',
};
const statusMap = TICKET_STATUS;
const PRIORITY = {
  urgent: { label: 'Urgente', tone: 'error' },
  high: { label: 'Alta', tone: 'warning' },
  medium: { label: 'Média', tone: 'running' },
  low: { label: 'Baixa', tone: 'neutral' },
};

function roleTone(role) {
  const r = ROLES[String(role || '').toLowerCase()];
  return r ? r.tone : 'neutral';
}
function roleLabel(role) {
  const r = ROLES[String(role || '').toLowerCase()];
  return r ? r.label : format.humanize(role);
}
function priorityTone(p) {
  const r = PRIORITY[String(p || '').toLowerCase()];
  return r ? r.tone : 'neutral';
}
function priorityLabel(p) {
  const r = PRIORITY[String(p || '').toLowerCase()];
  return r ? r.label : format.humanize(p) || '—';
}
const isClosed = (status) => status === 'closed' || status === 'resolved';

// ---------- iniciais ----------
function makeInitials(name, fallback) {
  if (!name) return fallback;
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return fallback;
  const first = parts[0][0] || '';
  const last = parts.length > 1 ? parts[parts.length - 1][0] : '';
  return (first + last).toUpperCase();
}
const agentInitials = (name) => makeInitials(name, '–');
const teamInitials = computed(() => makeInitials(team.value && team.value.name, 'T'));

// ---------- header derivados ----------
const isActive = computed(() => String(team.value && team.value.status).toLowerCase() === 'active');
const statusValue = computed(() => (team.value && team.value.status) || 'inactive');
const statusTone = computed(() => (isActive.value ? 'success' : 'neutral'));
const statusLabelText = computed(() => STATUS_LABELS[statusValue.value] || format.humanize(statusValue.value));
const pageTitle = computed(() => (team.value && team.value.name) || 'Detalhe do time');

const leadAgent = computed(() => {
  const id = team.value && team.value.lead_agent_id;
  if (!id) return null;
  return members.value.find((m) => String(m.id) === String(id)) || null;
});
const leadLabel = computed(() => {
  if (leadAgent.value) return leadAgent.value.name || ('Agente #' + leadAgent.value.id);
  if (team.value && team.value.lead_agent_id) return 'Agente #' + team.value.lead_agent_id;
  return 'Sem líder definido';
});
const slaLabel = computed(() => {
  const id = team.value && team.value.default_sla_policy_id;
  if (!id) return 'Não definido';
  const p = slaPolicy.value;
  return p ? (p.name || ('Política #' + id)) : ('Política #' + id);
});
const slaPolicy = ref(null);

const membersSubtitle = computed(() =>
  members.value.length ? members.value.length + ' agente(s) neste time' : 'Agentes atribuídos a este time',
);

// ---------- métricas da fila ----------
const now = ref(Date.now());
let clockId = null;

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

const queueMetrics = computed(() => {
  const rows = queue.value || [];
  let open = 0;
  let inProgress = 0;
  let urgent = 0;
  let unassigned = 0;
  let slaRisk = 0;
  for (const row of rows) {
    if (row.status === 'open') open += 1;
    if (row.status === 'in_progress') inProgress += 1;
    if (String(row.priority).toLowerCase() === 'urgent') urgent += 1;
    if (!row.assignee_id && !isClosed(row.status)) unassigned += 1;
    if (row.sla_due_at && !isClosed(row.status)) {
      const s = slaState(row.sla_due_at);
      if (s === 'breached' || s === 'soon') slaRisk += 1;
    }
  }
  return { total: rows.length, open, inProgress, urgent, unassigned, slaRisk };
});

// ---------- fila: filtros e colunas ----------
const queueQuickFilters = [
  { value: '', label: 'Todos' },
  { value: 'open', label: 'Abertos' },
  { value: 'in_progress', label: 'Em andamento' },
  { value: 'pending', label: 'Pendentes' },
  { value: 'resolved', label: 'Resolvidos' },
];
const filteredQueue = computed(() => {
  if (!queueStatusFilter.value) return queue.value;
  return queue.value.filter((t) => t.status === queueStatusFilter.value);
});
const queueColumns = [
  { key: 'subject', label: 'Assunto' },
  { key: 'status', label: 'Status' },
  { key: 'priority', label: 'Prioridade' },
  { key: 'assignee_id', label: 'Responsável' },
  { key: 'sla_due_at', label: 'SLA' },
  { key: 'updated_at', label: 'Atualizado', align: 'right' },
];

const queueSubtitle = computed(() => {
  const t = queue.value.length;
  if (!t) return 'Chamados encaminhados a este time.';
  return t + ' chamado(s) atribuído(s) a este time.';
});
const queueEmptyState = computed(() => {
  if (queueStatusFilter.value) {
    return {
      title: 'Nenhum chamado neste filtro',
      description: 'Não há chamados com esse status na fila deste time.',
      icon: 'search',
    };
  }
  return {
    title: 'Fila vazia',
    description: 'Nenhum chamado está atribuído a este time no momento.',
    icon: 'inbox',
  };
});

function assigneeName(id) {
  const m = members.value.find((x) => String(x.id) === String(id));
  return m ? (m.name || ('Agente #' + id)) : 'Agente #' + id;
}
function assigneeInitials(id) {
  const m = members.value.find((x) => String(x.id) === String(id));
  return makeInitials(m && m.name, 'A');
}

// Abrir um chamado da fila → detalhe canônico /tickets/:id (deep-link).
function openTicket(row) {
  if (row && row.id != null) router.push('/tickets/' + row.id);
}

const footerSummary = computed(() => {
  if (loading.value) return 'Carregando detalhes do time…';
  return (
    members.value.length +
    ' membro(s) · ' +
    queue.value.length +
    ' chamado(s) na fila · time ' +
    statusLabelText.value.toLowerCase()
  );
});

// ---------- carregamento ----------
async function loadTeam() {
  loadError.value = null;
  notFound.value = false;
  let data;
  try {
    data = await teamsApi.get(teamId.value);
  } catch (e) {
    // 404 → estado "não encontrado" (não é falha de rede); demais erros sobem
    // para o estado de erro com retry da página.
    if (e && e.status === 404) {
      team.value = null;
      notFound.value = true;
      return;
    }
    throw e;
  }
  team.value = data && data.data ? data.data : data;
  // SLA padrão (degradação graciosa se indisponível)
  slaPolicy.value = null;
  const slaId = team.value && team.value.default_sla_policy_id;
  if (slaId) {
    try {
      const s = await slaApi.get(slaId);
      slaPolicy.value = s && s.data ? s.data : s;
    } catch {
      slaPolicy.value = null;
    }
  }
}

async function loadMembers() {
  membersLoading.value = true;
  membersError.value = false;
  try {
    const res = await teamAgents(teamId.value);
    const rows = res && res.data ? res.data : Array.isArray(res) ? res : [];
    members.value = rows;
  } catch {
    membersError.value = true;
    members.value = [];
  } finally {
    membersLoading.value = false;
  }
}

async function loadQueue() {
  queueLoading.value = true;
  queueError.value = null;
  try {
    const res = await teamTickets(teamId.value);
    const rows = res && res.data ? res.data : Array.isArray(res) ? res : [];
    queue.value = rows;
  } catch (e) {
    queueError.value = e && e.message ? e.message : 'Falha ao carregar a fila';
    queue.value = [];
  } finally {
    queueLoading.value = false;
  }
}

async function load() {
  const first = loading.value;
  if (!first) refreshing.value = true;
  loading.value = true;
  loadError.value = null;
  try {
    await loadTeam();
    if (notFound.value) {
      // Sem time: não há membros/fila para carregar.
      members.value = [];
      queue.value = [];
      return;
    }
    // membros e fila em paralelo (degradam de forma independente)
    await Promise.all([loadMembers(), loadQueue()]);
    if (!first) toast.success('Time atualizado');
  } catch (e) {
    loadError.value = e && e.message ? e.message : 'Não foi possível carregar o time';
    team.value = null;
  } finally {
    loading.value = false;
    refreshing.value = false;
  }
}
function reload() {
  load();
}

async function toggleStatus() {
  if (!team.value) return;
  const target = isActive.value ? 'inactive' : 'active';
  const ok = await ask({
    title: isActive.value ? 'Desativar time' : 'Reativar time',
    message: isActive.value
      ? 'Desativar o time "' + (team.value.name || ('#' + team.value.id)) + '"? Novos chamados deixarão de ser encaminhados a esta fila.'
      : 'Reativar o time "' + (team.value.name || ('#' + team.value.id)) + '"? A fila volta a receber chamados.',
    confirmLabel: isActive.value ? 'Desativar' : 'Reativar',
    danger: isActive.value,
  });
  if (!ok) return;
  togglingStatus.value = true;
  try {
    await teamsApi.update(team.value.id, { status: target });
    team.value = { ...team.value, status: target };
    toast.success(isActive.value ? 'Time desativado.' : 'Time reativado.');
  } catch (e) {
    toast.error('Não foi possível alterar a situação do time.', { detail: e && e.message, code: e && e.status });
  } finally {
    togglingStatus.value = false;
  }
}

watch(
  () => route.params.id,
  () => {
    queueStatusFilter.value = '';
    load();
  },
);

onMounted(() => {
  load();
  clockId = setInterval(() => {
    now.value = Date.now();
  }, 30000);
});
onUnmounted(() => {
  if (clockId) clearInterval(clockId);
});
</script>

<style scoped>
.td-ico {
  font-weight: 700;
  line-height: 1;
}

/* ---------- EntityHeader ---------- */
.td-header {
  display: flex;
  align-items: flex-start;
  gap: var(--ui-space-5);
  padding: var(--ui-space-5);
  background: rgb(var(--ui-surface));
  border: 1px solid rgb(var(--ui-border));
  border-left: 3px solid rgb(var(--ui-accent));
  border-radius: var(--ui-radius-lg);
  box-shadow: var(--ui-shadow-sm);
}
.td-header-avatar {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 64px;
  height: 64px;
  flex-shrink: 0;
  border-radius: var(--ui-radius-lg);
  background: rgb(var(--ui-accent) / 0.14);
  color: rgb(var(--ui-accent-strong));
  font-family: var(--ui-font-display);
  font-weight: 700;
  font-size: var(--ui-text-xl);
  letter-spacing: 0.02em;
}
.td-header-id {
  flex: 1;
  min-width: 0;
}
.td-header-titleline {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--ui-space-3);
}
.td-header-name {
  margin: 0;
  font-family: var(--ui-font-display);
  font-size: var(--ui-text-xl);
  font-weight: 700;
  color: rgb(var(--ui-fg));
}
.td-header-desc {
  margin: var(--ui-space-2) 0 0;
  color: rgb(var(--ui-muted));
  font-size: var(--ui-text-sm);
  max-width: 70ch;
}
.td-header-facts {
  list-style: none;
  margin: var(--ui-space-4) 0 0;
  padding: 0;
  display: flex;
  flex-wrap: wrap;
  gap: var(--ui-space-2) var(--ui-space-5);
}
.td-fact {
  display: inline-flex;
  align-items: center;
  gap: var(--ui-space-2);
  font-size: var(--ui-text-sm);
}
.td-fact-icon {
  color: rgb(var(--ui-accent-strong));
}
.td-fact-label {
  color: rgb(var(--ui-muted));
}
.td-fact-value {
  font-weight: 600;
  color: rgb(var(--ui-fg));
}

/* ---------- métricas ---------- */
.td-metrics {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: var(--ui-space-4);
}

/* ---------- grade de 2 colunas (props + membros) ---------- */
.td-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(340px, 1fr));
  gap: var(--ui-space-4);
  align-items: start;
}

/* ---------- PropertiesGrid ---------- */
.td-props {
  margin: 0;
  display: flex;
  flex-direction: column;
}
.td-prop {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--ui-space-4);
  padding: var(--ui-space-3) 0;
  border-bottom: 1px solid rgb(var(--ui-border));
}
.td-prop:last-child {
  border-bottom: none;
}
.td-prop dt {
  color: rgb(var(--ui-muted));
  font-size: var(--ui-text-sm);
  font-weight: 600;
  flex-shrink: 0;
}
.td-prop dd {
  margin: 0;
  color: rgb(var(--ui-fg));
  text-align: right;
}
.td-prop-long {
  text-align: right;
  max-width: 42ch;
  font-size: var(--ui-text-sm);
  color: rgb(var(--ui-muted));
}
.td-mono {
  font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace;
  font-size: var(--ui-text-sm);
  color: rgb(var(--ui-muted));
}
.td-muted {
  color: rgb(var(--ui-muted));
  font-style: italic;
}
.td-link {
  color: rgb(var(--ui-accent-strong));
  text-decoration: none;
  font-weight: 600;
}
.td-link:hover {
  text-decoration: underline;
}
.td-link:focus-visible {
  outline: 2px solid rgb(var(--ui-accent));
  outline-offset: 2px;
  border-radius: var(--ui-radius-sm);
}

/* ---------- MemberList ---------- */
.td-members {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
}
.td-member {
  display: flex;
  align-items: center;
  gap: var(--ui-space-3);
  padding: var(--ui-space-3) 0;
  border-bottom: 1px solid rgb(var(--ui-border));
}
.td-member:last-child {
  border-bottom: none;
}
.td-member[data-lead="true"] {
  background: rgb(var(--ui-accent) / 0.05);
  border-radius: var(--ui-radius-md);
  padding-left: var(--ui-space-3);
  padding-right: var(--ui-space-3);
}
.td-member-link {
  display: flex;
  align-items: center;
  gap: var(--ui-space-3);
  flex: 1;
  min-width: 0;
  text-decoration: none;
  color: inherit;
  border-radius: var(--ui-radius-md);
}
.td-member-link:hover .td-member-name {
  color: rgb(var(--ui-accent-strong));
  text-decoration: underline;
}
.td-member-link:focus-visible {
  outline: 2px solid rgb(var(--ui-accent));
  outline-offset: 2px;
}
.td-member-avatar {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  flex-shrink: 0;
  border-radius: var(--ui-radius-pill);
  background: rgb(var(--ui-muted) / 0.16);
  color: rgb(var(--ui-muted));
  font-weight: 700;
  font-size: var(--ui-text-xs);
}
.td-member[data-lead="true"] .td-member-avatar {
  background: rgb(var(--ui-accent) / 0.16);
  color: rgb(var(--ui-accent-strong));
}
.td-member-id {
  display: flex;
  flex-direction: column;
  min-width: 0;
  flex: 1;
  line-height: 1.3;
}
.td-member-name {
  font-weight: 600;
  color: rgb(var(--ui-fg));
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.td-lead-tag {
  margin-left: var(--ui-space-2);
  font-size: var(--ui-text-xs);
  font-weight: 700;
  color: rgb(var(--ui-accent-strong));
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.td-member-mail {
  font-size: var(--ui-text-xs);
  color: rgb(var(--ui-muted));
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.td-member-meta {
  display: inline-flex;
  align-items: center;
  gap: var(--ui-space-2);
  flex-shrink: 0;
}

/* ---------- erro inline ---------- */
.td-inline-error {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ui-space-3);
  padding: var(--ui-space-4);
  border: 1px dashed rgb(var(--ui-danger) / 0.4);
  border-radius: var(--ui-radius-md);
  background: rgb(var(--ui-danger) / 0.06);
}
.td-inline-error-text {
  margin: 0;
  font-size: var(--ui-text-sm);
  color: rgb(var(--ui-danger));
}

/* ---------- QueueTicketsList ---------- */
.td-queue-filters {
  display: inline-flex;
  gap: var(--ui-space-2);
  flex-wrap: wrap;
}
.td-subject {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 180px;
}
.td-subject-main {
  font-weight: 600;
  color: rgb(var(--ui-fg));
}
.td-subject-ref {
  font-size: var(--ui-text-xs);
  font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace;
  color: rgb(var(--ui-accent-strong));
}
.td-person {
  display: inline-flex;
  align-items: center;
  gap: var(--ui-space-2);
  white-space: nowrap;
}
.td-person-avatar {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  font-size: var(--ui-text-xs);
  font-weight: 700;
  background: rgb(var(--ui-accent) / 0.16);
  color: rgb(var(--ui-accent-strong));
}
.td-person-name {
  font-size: var(--ui-text-sm);
}
.td-dash,
.td-dim {
  color: rgb(var(--ui-muted));
}
.td-dim {
  font-size: var(--ui-text-xs);
  white-space: nowrap;
}

/* SLA countdown */
.td-sla {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: var(--ui-text-xs);
  font-weight: 600;
  padding: 2px 9px;
  border-radius: var(--ui-radius-pill);
  white-space: nowrap;
}
.td-sla-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: currentColor;
}
.td-sla[data-state="ok"] {
  background: rgb(var(--ui-ok) / 0.14);
  color: rgb(var(--ui-ok));
}
.td-sla[data-state="soon"] {
  background: rgb(var(--ui-warn) / 0.18);
  color: rgb(var(--ui-warn));
}
.td-sla[data-state="breached"] {
  background: rgb(var(--ui-danger) / 0.16);
  color: rgb(var(--ui-danger));
}
.td-sla[data-state="none"] {
  background: rgb(var(--ui-muted) / 0.14);
  color: rgb(var(--ui-muted));
  font-weight: 500;
}

/* ---------- responsivo ---------- */
@media (max-width: 1100px) {
  .td-metrics {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}
@media (max-width: 860px) {
  .td-grid {
    grid-template-columns: 1fr;
  }
  .td-header {
    flex-direction: column;
  }
  .td-member-mail {
    display: none;
  }
}
@media (max-width: 560px) {
  .td-metrics {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .td-prop {
    flex-direction: column;
    gap: 2px;
  }
  .td-prop dd,
  .td-prop-long {
    text-align: left;
  }
}
</style>
