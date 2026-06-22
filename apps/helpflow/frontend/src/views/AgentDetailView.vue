<template>
  <UiPageLayout
    width="wide"
    eyebrow="Equipe & RBAC"
    :title="pageTitle"
    subtitle="Perfil do agente — papel, time, tenant, sessões recentes, carga de chamados atribuídos e desempenho."
    :loading="initialLoading"
    loading-message="Carregando o agente…"
    :error="agentError"
    @retry="reload"
  >
    <!-- ===================== AÇÕES DO CABEÇALHO ===================== -->
    <template #actions>
      <UiButton variant="ghost" to="/agents">
        <template #icon-left><span class="ag-ico" aria-hidden="true">←</span></template>
        Voltar à equipe
      </UiButton>
      <UiButton variant="subtle" :loading="refreshing" :disabled="!agent" @click="reload">
        <template #icon-left><span class="ag-ico" aria-hidden="true">↻</span></template>
        Atualizar
      </UiButton>
      <UiButton v-if="agent" variant="subtle" :to="'/agents/' + agent.id + '/edit'">Editar agente</UiButton>
      <UiButton
        v-if="agent && isActive"
        variant="danger"
        :loading="working"
        @click="deactivate"
      >Desativar agente</UiButton>
      <UiButton
        v-else-if="agent"
        variant="primary"
        :loading="working"
        @click="reactivate"
      >Reativar agente</UiButton>
    </template>

    <!-- ===================== ESTADO NORMAL ===================== -->
    <template v-if="agent">
      <!-- EntityHeader: identidade do agente -->
      <section class="ag-header" aria-label="Identidade do agente">
        <span class="ag-header-avatar" :data-tone="isActive ? 'active' : 'muted'" aria-hidden="true">
          {{ initials(agent.name) }}
        </span>
        <div class="ag-header-id">
          <div class="ag-header-titleline">
            <h2 class="ag-header-name">{{ agent.name || 'Agente sem nome' }}</h2>
            <!-- RoleBadge -->
            <UiStatusBadge :status="agent.role" :tone="roleTone(agent.role)" :label="roleLabel(agent.role)" size="lg" />
            <UiStatusBadge :status="agent.status" :tone="statusTone" :label="statusLabelText" size="lg" />
          </div>
          <p class="ag-header-mail">
            <span class="ag-header-mail-ico" aria-hidden="true">✉</span>
            <a v-if="agent.email" :href="'mailto:' + agent.email">{{ agent.email }}</a>
            <span v-else class="ag-muted">Sem e-mail cadastrado</span>
          </p>
          <ul class="ag-header-facts">
            <li class="ag-fact">
              <span class="ag-fact-ico" aria-hidden="true">🛟</span>
              <span class="ag-fact-label">Time</span>
              <RouterLink v-if="agent.team_id" class="ag-link" :to="'/teams/' + agent.team_id">{{ teamLabel }}</RouterLink>
              <span v-else class="ag-fact-value ag-muted">Sem time</span>
            </li>
            <li class="ag-fact">
              <span class="ag-fact-ico" aria-hidden="true">🏢</span>
              <span class="ag-fact-label">Tenant</span>
              <span class="ag-fact-value ag-mono">{{ tenantText }}</span>
            </li>
            <li class="ag-fact">
              <span class="ag-fact-ico" aria-hidden="true">⏱</span>
              <span class="ag-fact-label">Último acesso</span>
              <span class="ag-fact-value">{{ lastAccessLabel }}</span>
            </li>
          </ul>
        </div>
      </section>

      <!-- Métricas de desempenho / carga (derivadas dos chamados REAIS atribuídos) -->
      <section class="ag-metrics" aria-label="Métricas de desempenho do agente">
        <UiMetricCard
          label="Chamados atribuídos"
          :value="perf.assigned"
          :loading="ticketsLoading"
          hint="Carga total do agente"
          tone="primary"
          clickable
          :aria-label="'Ver chamados deste agente — ' + perf.assigned + ' atribuído(s)'"
          @click="goToTickets"
        />
        <UiMetricCard
          label="Em aberto"
          :value="perf.open"
          :loading="ticketsLoading"
          :tone="perf.open > 0 ? 'warning' : 'success'"
          hint="Aguardando ou pendentes"
        />
        <UiMetricCard
          label="Em andamento"
          :value="perf.inProgress"
          :loading="ticketsLoading"
          tone="running"
          hint="Sendo tratados agora"
        />
        <UiMetricCard
          label="Resolvidos"
          :value="perf.resolved"
          :loading="ticketsLoading"
          tone="success"
          hint="Concluídos pelo agente"
        />
        <UiMetricCard
          label="Taxa de resolução"
          :value="perf.resolutionLabel"
          :loading="ticketsLoading"
          :tone="perf.resolutionTone"
          hint="Resolvidos ÷ atribuídos"
        />
        <UiMetricCard
          label="Urgentes em aberto"
          :value="perf.urgentOpen"
          :loading="ticketsLoading"
          :tone="perf.urgentOpen > 0 ? 'error' : 'success'"
          hint="Prioridade máxima pendente"
        />
      </section>

      <div class="ag-grid">
        <!-- Coluna principal: AssignedTicketsList -->
        <div class="ag-col-main">
          <UiCard title="Chamados atribuídos" :subtitle="ticketsSubtitle">
            <template #actions>
              <div class="ag-quickfilters" role="group" aria-label="Filtros rápidos dos chamados">
                <UiButton
                  v-for="f in ticketQuickFilters"
                  :key="f.value"
                  size="sm"
                  :variant="ticketStatusFilter === f.value ? 'subtle' : 'ghost'"
                  :aria-pressed="ticketStatusFilter === f.value ? 'true' : 'false'"
                  @click="ticketStatusFilter = f.value"
                >{{ f.label }}</UiButton>
              </div>
            </template>

            <UiDataTable
              :columns="ticketColumns"
              :rows="filteredTickets"
              :loading="ticketsLoading"
              :error="ticketsError"
              row-key="id"
              density="comfortable"
              clickable-rows
              :empty="ticketsEmpty"
              @row-click="openTicket"
              @retry="loadTickets"
            >
              <template #cell-subject="{ row }">
                <span class="ag-ticket">
                  <span class="ag-ticket-subject">{{ ticketSubject(row) }}</span>
                  <span class="ag-ticket-id">#{{ row.id }}</span>
                </span>
              </template>

              <template #cell-priority="{ row }">
                <UiStatusBadge
                  :status="ticketPriority(row)"
                  :tone="priorityTone(ticketPriority(row))"
                  :label="priorityLabel(ticketPriority(row))"
                  with-dot
                />
              </template>

              <template #cell-status="{ row }">
                <UiStatusBadge
                  :status="ticketStatus(row)"
                  :tone="ticketStatusTone(row)"
                  :label="ticketStatusLabel(row)"
                />
              </template>

              <template #cell-updated_at="{ row }">
                <span class="ag-time">{{ relTime(row) }}</span>
              </template>

              <template #empty-action>
                <UiButton size="sm" to="/tickets">Abrir lista de chamados</UiButton>
              </template>
            </UiDataTable>
          </UiCard>
        </div>

        <!-- Coluna lateral: PropertiesGrid + SessionList -->
        <div class="ag-col-side">
          <!-- PropertiesGrid -->
          <UiCard title="Propriedades">
            <template #actions>
              <UiStatusBadge :status="agent.status" :tone="statusTone" :label="statusLabelText" />
            </template>
            <dl class="ag-props">
              <div class="ag-prop">
                <dt>Papel (RBAC)</dt>
                <dd><UiStatusBadge :status="agent.role" :tone="roleTone(agent.role)" :label="roleLabel(agent.role)" /></dd>
              </div>
              <div class="ag-prop">
                <dt>Situação</dt>
                <dd><UiStatusBadge :status="agent.status" :tone="statusTone" :label="statusLabelText" /></dd>
              </div>
              <div class="ag-prop">
                <dt>E-mail</dt>
                <dd class="ag-prop-strong">
                  <a v-if="agent.email" class="ag-link" :href="'mailto:' + agent.email">{{ agent.email }}</a>
                  <span v-else class="ag-muted">—</span>
                </dd>
              </div>
              <div class="ag-prop">
                <dt>Time</dt>
                <dd>
                  <RouterLink v-if="agent.team_id" class="ag-link" :to="'/teams/' + agent.team_id">{{ teamLabel }}</RouterLink>
                  <span v-else class="ag-muted">Sem time</span>
                </dd>
              </div>
              <div class="ag-prop">
                <dt>Tenant</dt>
                <dd class="ag-mono">{{ tenantText }}</dd>
              </div>
              <div class="ag-prop">
                <dt>Último acesso</dt>
                <dd :class="{ 'ag-muted': !agent.last_login_at }">{{ lastAccessLabel }}</dd>
              </div>
              <div class="ag-prop">
                <dt>ID do agente</dt>
                <dd class="ag-mono">#{{ agent.id }}</dd>
              </div>
            </dl>
          </UiCard>

          <!-- SessionList: linha do tempo de atividade do agente.
               Construída SOMENTE de sinais REAIS:
                 · o último acesso (agent.last_login_at), e
                 · a atividade recente nos chamados atribuídos (updated_at/created_at de /v1/tickets).
               Não existe endpoint /v1/sessions no backend; portanto NÃO inventamos uma
               lista de sessões — derivamos uma linha do tempo honesta a partir dos
               dados que o domínio realmente expõe. -->
          <UiCard title="Sessões & atividade recente" :subtitle="sessionsSubtitle">
            <UiLoadingState v-if="ticketsLoading && !sessionEvents.length" variant="skeleton" :skeleton-lines="4" />

            <UiEmptyState
              v-else-if="!sessionEvents.length"
              icon="clock"
              compact
              title="Sem atividade registrada"
              description="Este agente ainda não acessou o service desk nem movimentou chamados."
            />

            <ol v-else class="ag-timeline" aria-label="Atividade recente do agente">
              <li v-for="ev in sessionEvents" :key="ev.key" class="ag-event" :data-kind="ev.kind">
                <span class="ag-event-rail" aria-hidden="true">
                  <span class="ag-event-dot" :data-tone="ev.tone" />
                </span>
                <div class="ag-event-body">
                  <div class="ag-event-top">
                    <span class="ag-event-title">{{ ev.title }}</span>
                    <UiStatusBadge :tone="ev.tone" :label="ev.tag" :status="ev.tag" :with-dot="false" size="sm" />
                  </div>
                  <p class="ag-event-desc">
                    <RouterLink v-if="ev.to" class="ag-link" :to="ev.to">{{ ev.desc }}</RouterLink>
                    <span v-else>{{ ev.desc }}</span>
                  </p>
                  <span class="ag-event-when">{{ ev.whenLabel }}</span>
                </div>
              </li>
            </ol>

            <template v-if="sessionEvents.length" #footer>
              <span class="ag-foot-note">{{ sessionsFootnote }}</span>
            </template>
          </UiCard>
        </div>
      </div>
    </template>

    <!-- Estado vazio: agente não encontrado (resposta 404 sem erro de rede) -->
    <UiEmptyState
      v-else-if="!initialLoading && !agentError"
      icon="user"
      title="Agente não encontrado"
      description="Este agente pode ter sido removido ou o endereço está incorreto."
    >
      <template #action>
        <UiButton to="/agents">Voltar à equipe</UiButton>
      </template>
    </UiEmptyState>
  </UiPageLayout>
</template>

<script setup>
import { ref, computed, watch, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import {
  UiPageLayout,
  UiCard,
  UiMetricCard,
  UiStatusBadge,
  UiDataTable,
  UiEmptyState,
  UiLoadingState,
  UiButton,
  useToast,
  useConfirm,
  format,
} from '../ui/index.js';
// Recursos de DOMÍNIO reais (o backend expõe /v1/<name> em api/src/server.js):
//  - agents  → GET/PUT /v1/agents/:id (carregar, desativar, reativar)
//  - teams   → GET /v1/teams/:id      (resolver o nome do time do agente)
//  - tickets → GET /v1/tickets        (chamados atribuídos; filtramos por assignee_id
//              no cliente, pois o crudList genérico só honra page/pageSize/sort/dir —
//              ver crud-repo.js). NUNCA consumimos o placeholder /v1/records.
import { agents, teams as teamsApi, tickets as ticketsApi } from '../api.js';

const route = useRoute();
const router = useRouter();
const toast = useToast();
const ask = useConfirm();

const agentId = computed(() => route.params.id);

// ---- papéis RBAC (alinhado ao enum do schema agents.role) ----
const ROLES = {
  admin: { label: 'Admin', tone: 'error' },
  supervisor: { label: 'Supervisor', tone: 'warning' },
  agent: { label: 'Agente', tone: 'running' },
  viewer: { label: 'Leitor', tone: 'neutral' },
};
const STATUS_LABELS = { active: 'Ativo', inactive: 'Inativo' };

// ===================== estado do agente =====================
const agent = ref(null);
const agentError = ref(null);
const initialLoading = ref(true);
const refreshing = ref(false);
const working = ref(false);

// ===================== time resolvido (endpoint REAL /v1/teams/:id) =====================
const team = ref(null);

// ===================== chamados atribuídos (endpoint REAL /v1/tickets) =====================
const tickets = ref([]);
const ticketsLoading = ref(false);
const ticketsError = ref(null);
const ticketStatusFilter = ref('');

// ---------- derivados de identidade ----------
const isActive = computed(() => String(agent.value && agent.value.status).toLowerCase() === 'active');
const statusTone = computed(() => (isActive.value ? 'success' : 'neutral'));
const statusLabelText = computed(() => {
  const s = String(agent.value && agent.value.status).toLowerCase();
  return STATUS_LABELS[s] || format.humanize(agent.value && agent.value.status) || '—';
});
const pageTitle = computed(() => (agent.value && agent.value.name) || 'Detalhe do agente');
const tenantText = computed(() => {
  const t = agent.value && agent.value.tenant_id;
  return t !== null && t !== undefined && t !== '' ? '#' + t : '—';
});
const teamLabel = computed(() => {
  if (team.value) return team.value.name || ('Time #' + team.value.id);
  const id = agent.value && agent.value.team_id;
  return id ? 'Time #' + id : 'Sem time';
});
const lastAccessLabel = computed(() => {
  const v = agent.value && agent.value.last_login_at;
  return v ? format.formatDateTime(v) : 'Nunca acessou';
});

function roleTone(role) {
  const r = ROLES[String(role || '').toLowerCase()];
  return r ? r.tone : 'neutral';
}
function roleLabel(role) {
  const r = ROLES[String(role || '').toLowerCase()];
  return r ? r.label : format.humanize(role) || '—';
}
function initials(name) {
  if (!name) return '–';
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '–';
  const first = parts[0][0] || '';
  const last = parts.length > 1 ? parts[parts.length - 1][0] : '';
  return (first + last).toUpperCase();
}

// ===================== chamados: rótulos, tons e colunas =====================
const ticketColumns = [
  { key: 'subject', label: 'Chamado' },
  { key: 'priority', label: 'Prioridade' },
  { key: 'status', label: 'Situação' },
  { key: 'updated_at', label: 'Atualizado', align: 'right' },
];

const ticketQuickFilters = [
  { value: '', label: 'Todos' },
  { value: 'open', label: 'Abertos' },
  { value: 'in_progress', label: 'Em andamento' },
  { value: 'resolved', label: 'Resolvidos' },
];

const TICKET_STATUS_LABEL = {
  open: 'Aberto',
  in_progress: 'Em andamento',
  pending: 'Pendente',
  on_hold: 'Em espera',
  resolved: 'Resolvido',
  closed: 'Encerrado',
};
const TICKET_STATUS_TONE = {
  open: 'warning',
  pending: 'warning',
  on_hold: 'neutral',
  in_progress: 'running',
  resolved: 'success',
  closed: 'success',
};
const PRIORITY_TONE = {
  urgent: 'error', critical: 'error', high: 'warning', alta: 'warning',
  medium: 'running', normal: 'running', media: 'running', low: 'neutral', baixa: 'neutral',
};
const PRIORITY_LABEL = {
  urgent: 'Urgente', critical: 'Crítica', high: 'Alta', alta: 'Alta',
  medium: 'Média', normal: 'Normal', media: 'Média', low: 'Baixa', baixa: 'Baixa',
};

function ticketSubject(row) {
  return row.subject || row.title || row.name || 'Chamado #' + row.id;
}
function ticketStatus(row) {
  return row.status || 'open';
}
function ticketPriority(row) {
  return row.priority || 'medium';
}
function ticketStatusLabel(row) {
  const s = String(ticketStatus(row)).toLowerCase();
  return TICKET_STATUS_LABEL[s] || format.humanize(ticketStatus(row));
}
function ticketStatusTone(row) {
  const s = String(ticketStatus(row)).toLowerCase();
  return TICKET_STATUS_TONE[s] || 'neutral';
}
function priorityTone(p) {
  return PRIORITY_TONE[String(p).toLowerCase()] || 'neutral';
}
function priorityLabel(p) {
  return PRIORITY_LABEL[String(p).toLowerCase()] || format.humanize(p);
}
function relTime(row) {
  const v = row.updated_at || row.created_at || row.updatedAt;
  return v ? format.formatDateTime(v) : '—';
}

// classificação de estado dos chamados (para métricas)
const OPEN_STATES = ['open', 'pending', 'on_hold', 'waiting', 'aberto', 'pendente', 'aguardando'];
const IN_PROGRESS_STATES = ['in_progress', 'em andamento'];
const DONE_STATES = ['resolved', 'closed', 'done', 'completed', 'resolvido', 'fechado', 'encerrado', 'concluido', 'concluído'];
const URGENT_STATES = ['urgent', 'critical', 'alta', 'high'];

function inStates(row, list) {
  return list.includes(String(ticketStatus(row)).toLowerCase());
}
const isOpenTicket = (row) => inStates(row, OPEN_STATES);
const isInProgressTicket = (row) => inStates(row, IN_PROGRESS_STATES);
const isResolvedTicket = (row) => inStates(row, DONE_STATES);
const isUrgentOpen = (row) =>
  URGENT_STATES.includes(String(ticketPriority(row)).toLowerCase()) && !isResolvedTicket(row);

const filteredTickets = computed(() => {
  const list = tickets.value || [];
  switch (ticketStatusFilter.value) {
    case 'open':
      return list.filter(isOpenTicket);
    case 'in_progress':
      return list.filter(isInProgressTicket);
    case 'resolved':
      return list.filter(isResolvedTicket);
    default:
      return list;
  }
});

const ticketsSubtitle = computed(() => {
  const n = tickets.value.length;
  if (ticketsLoading.value) return 'Carregando carga de trabalho…';
  if (!n) return 'Carga de trabalho corrente deste agente.';
  return n + ' chamado(s) atribuído(s) a este agente.';
});
const ticketsEmpty = computed(() => {
  if (ticketStatusFilter.value) {
    return {
      title: 'Nenhum chamado neste filtro',
      description: 'Não há chamados com esse status atribuídos ao agente.',
      icon: 'search',
    };
  }
  return {
    title: 'Nenhum chamado atribuído',
    description: 'Quando este agente assumir chamados, eles aparecem aqui.',
    icon: 'inbox',
  };
});

// ===================== métricas de desempenho (derivadas dos chamados REAIS) =====================
const perf = computed(() => {
  const list = tickets.value || [];
  const assigned = list.length;
  const resolved = list.filter(isResolvedTicket).length;
  const rate = assigned ? Math.round((resolved / assigned) * 100) : null;
  return {
    assigned,
    open: list.filter(isOpenTicket).length,
    inProgress: list.filter(isInProgressTicket).length,
    resolved,
    urgentOpen: list.filter(isUrgentOpen).length,
    resolutionLabel: rate === null ? '—' : rate + '%',
    resolutionTone: rate === null ? 'neutral' : rate >= 70 ? 'success' : rate >= 40 ? 'warning' : 'error',
  };
});

// ===================== SessionList: linha do tempo a partir de dados REAIS =====================
const sessionsSubtitle = computed(() =>
  agent.value && agent.value.last_login_at
    ? 'Último acesso e movimentações recentes do agente.'
    : 'Movimentações recentes do agente no service desk.',
);
const sessionsFootnote = 'Derivado do último acesso e da atividade nos chamados atribuídos (sem registro de sessão dedicado).';

const sessionEvents = computed(() => {
  const events = [];

  // (1) Último acesso — sinal real de "sessão" mais recente do agente.
  const login = agent.value && agent.value.last_login_at;
  if (login) {
    const t = new Date(login).getTime();
    events.push({
      key: 'login',
      kind: 'login',
      tone: 'success',
      tag: 'Acesso',
      title: 'Último acesso ao service desk',
      desc: 'O agente entrou na plataforma.',
      to: null,
      ts: isNaN(t) ? 0 : t,
      whenLabel: format.formatDateTime(login),
    });
  }

  // (2) Atividade recente nos chamados atribuídos (até 5 mais recentes).
  const recent = [...(tickets.value || [])]
    .map((row) => {
      const v = row.updated_at || row.created_at;
      const t = v ? new Date(v).getTime() : 0;
      return { row, v, t: isNaN(t) ? 0 : t };
    })
    .filter((x) => x.v)
    .sort((a, b) => b.t - a.t)
    .slice(0, 5);

  for (const x of recent) {
    events.push({
      key: 'ticket-' + x.row.id,
      kind: 'ticket',
      tone: ticketStatusTone(x.row),
      tag: ticketStatusLabel(x.row),
      title: 'Chamado #' + x.row.id + ' atualizado',
      desc: ticketSubject(x.row),
      to: '/tickets/' + x.row.id,
      ts: x.t,
      whenLabel: format.formatDateTime(x.v),
    });
  }

  return events.sort((a, b) => b.ts - a.ts);
});

// ===================== navegação / ações =====================
function openTicket(row) {
  if (row && row.id != null) router.push('/tickets/' + row.id);
}
function goToTickets() {
  router.push('/tickets');
}

// ===================== carregamento =====================
async function loadAgent() {
  agentError.value = null;
  try {
    const data = await agents.get(agentId.value);
    agent.value = data && data.data ? data.data : data;
  } catch (e) {
    if (e && e.status === 404) {
      agent.value = null; // estado "não encontrado"
    } else {
      agentError.value = e;
      agent.value = null;
    }
  }
}

async function loadTeam() {
  team.value = null;
  const id = agent.value && agent.value.team_id;
  if (!id) return;
  try {
    const data = await teamsApi.get(id);
    team.value = data && data.data ? data.data : data;
  } catch {
    // degradação graciosa: caímos para "Time #<id>" sem nome resolvido
    team.value = null;
  }
}

async function loadTickets() {
  if (!agentId.value) return;
  ticketsLoading.value = true;
  ticketsError.value = null;
  try {
    // Endpoint REAL de domínio GET /v1/tickets. O list genérico ignora filtros
    // arbitrários (só page/pageSize/sort/dir), então puxamos a página ordenada
    // e filtramos por assignee_id no cliente — mesma rede de segurança das telas irmãs.
    const res = await ticketsApi.list({ pageSize: 200, sort: 'updated_at', dir: 'desc' });
    const rows = Array.isArray(res) ? res : res && res.data ? res.data : [];
    tickets.value = rows.filter((t) => String(t.assignee_id) === String(agentId.value));
  } catch (e) {
    ticketsError.value = e;
    tickets.value = [];
  } finally {
    ticketsLoading.value = false;
  }
}

async function reload() {
  refreshing.value = true;
  await loadAgent();
  if (agent.value) {
    await Promise.all([loadTeam(), loadTickets()]);
  }
  refreshing.value = false;
}

async function bootstrap() {
  initialLoading.value = true;
  ticketStatusFilter.value = '';
  await loadAgent();
  initialLoading.value = false;
  if (agent.value) {
    loadTeam();
    loadTickets();
  }
}

// ===================== ações de status (destrutivas via useConfirm) =====================
async function setStatus(nextStatus, opts) {
  if (!agent.value) return;
  const who = agent.value.name || agent.value.email || '#' + agent.value.id;
  const ok = await ask({
    title: opts.title,
    message: opts.message.replace('{who}', who),
    confirmLabel: opts.confirmLabel,
    danger: !!opts.danger,
  });
  if (!ok) return;
  working.value = true;
  try {
    await agents.update(agent.value.id, { status: nextStatus });
    agent.value = { ...agent.value, status: nextStatus };
    toast.success(opts.success);
  } catch (e) {
    toast.error(opts.fail, { detail: e && e.message, code: e && e.status });
  } finally {
    working.value = false;
  }
}

function deactivate() {
  return setStatus('inactive', {
    title: 'Desativar agente',
    message: 'Remover o acesso de "{who}"? A pessoa não poderá mais entrar no service desk.',
    confirmLabel: 'Desativar',
    danger: true,
    success: 'Agente desativado.',
    fail: 'Não foi possível desativar o agente.',
  });
}
function reactivate() {
  return setStatus('active', {
    title: 'Reativar agente',
    message: 'Restaurar o acesso de "{who}" ao service desk?',
    confirmLabel: 'Reativar',
    danger: false,
    success: 'Agente reativado.',
    fail: 'Não foi possível reativar o agente.',
  });
}

watch(() => route.params.id, () => bootstrap());
onMounted(bootstrap);
</script>

<style scoped>
.ag-ico {
  font-weight: 700;
  line-height: 1;
}

/* ===================== EntityHeader ===================== */
.ag-header {
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
.ag-header-avatar {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 64px;
  height: 64px;
  flex-shrink: 0;
  border-radius: var(--ui-radius-pill);
  font-family: var(--ui-font-display);
  font-weight: 700;
  font-size: var(--ui-text-xl);
  letter-spacing: 0.02em;
}
.ag-header-avatar[data-tone="active"] {
  background: rgb(var(--ui-accent) / 0.14);
  color: rgb(var(--ui-accent-strong));
}
.ag-header-avatar[data-tone="muted"] {
  background: rgb(var(--ui-muted) / 0.16);
  color: rgb(var(--ui-muted));
}
.ag-header-id {
  flex: 1;
  min-width: 0;
}
.ag-header-titleline {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--ui-space-3);
}
.ag-header-name {
  margin: 0;
  font-family: var(--ui-font-display);
  font-size: var(--ui-text-xl);
  font-weight: 700;
  color: rgb(var(--ui-fg));
}
.ag-header-mail {
  margin: var(--ui-space-2) 0 0;
  display: inline-flex;
  align-items: center;
  gap: var(--ui-space-2);
  color: rgb(var(--ui-muted));
  font-size: var(--ui-text-sm);
}
.ag-header-mail-ico {
  color: rgb(var(--ui-accent-strong));
}
.ag-header-facts {
  list-style: none;
  margin: var(--ui-space-4) 0 0;
  padding: 0;
  display: flex;
  flex-wrap: wrap;
  gap: var(--ui-space-2) var(--ui-space-5);
}
.ag-fact {
  display: inline-flex;
  align-items: center;
  gap: var(--ui-space-2);
  font-size: var(--ui-text-sm);
}
.ag-fact-ico {
  color: rgb(var(--ui-accent-strong));
}
.ag-fact-label {
  color: rgb(var(--ui-muted));
}
.ag-fact-value {
  font-weight: 600;
  color: rgb(var(--ui-fg));
}

/* ===================== métricas ===================== */
.ag-metrics {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: var(--ui-space-4);
}

/* ===================== grade principal ===================== */
.ag-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.7fr) minmax(0, 1fr);
  gap: var(--ui-space-4);
  align-items: start;
}
.ag-col-main,
.ag-col-side {
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-4);
  min-width: 0;
}

/* ===================== AssignedTicketsList ===================== */
.ag-quickfilters {
  display: inline-flex;
  gap: var(--ui-space-2);
  flex-wrap: wrap;
}
.ag-ticket {
  display: inline-flex;
  flex-direction: column;
  min-width: 0;
  line-height: 1.25;
}
.ag-ticket-subject {
  font-weight: 600;
  color: rgb(var(--ui-fg));
  overflow: hidden;
  text-overflow: ellipsis;
}
.ag-ticket-id {
  font-size: var(--ui-text-xs);
  color: rgb(var(--ui-muted));
  font-family: var(--ui-font-mono);
}
.ag-time {
  color: rgb(var(--ui-muted));
  font-size: var(--ui-text-sm);
  white-space: nowrap;
}

/* ===================== PropertiesGrid ===================== */
.ag-props {
  margin: 0;
  display: flex;
  flex-direction: column;
}
.ag-prop {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ui-space-4);
  padding: var(--ui-space-3) 0;
  border-bottom: 1px solid rgb(var(--ui-border));
}
.ag-prop:last-child {
  border-bottom: none;
}
.ag-prop dt {
  color: rgb(var(--ui-muted));
  font-size: var(--ui-text-sm);
  font-weight: 600;
  flex-shrink: 0;
}
.ag-prop dd {
  margin: 0;
  color: rgb(var(--ui-fg));
  text-align: right;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}
.ag-prop-strong {
  font-weight: 600;
}

/* ===================== SessionList (timeline) ===================== */
.ag-timeline {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
}
.ag-event {
  display: flex;
  gap: var(--ui-space-3);
  padding-bottom: var(--ui-space-4);
}
.ag-event:last-child {
  padding-bottom: 0;
}
.ag-event-rail {
  position: relative;
  display: flex;
  justify-content: center;
  width: 14px;
  flex-shrink: 0;
}
.ag-event-rail::before {
  content: "";
  position: absolute;
  top: 14px;
  bottom: -2px;
  width: 2px;
  background: rgb(var(--ui-border));
}
.ag-event:last-child .ag-event-rail::before {
  display: none;
}
.ag-event-dot {
  position: relative;
  z-index: 1;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  margin-top: 3px;
  border: 2px solid rgb(var(--ui-surface));
  background: rgb(var(--ui-faint));
}
.ag-event-dot[data-tone="success"] {
  background: rgb(var(--ui-ok));
}
.ag-event-dot[data-tone="warning"] {
  background: rgb(var(--ui-warn));
}
.ag-event-dot[data-tone="error"] {
  background: rgb(var(--ui-danger));
}
.ag-event-dot[data-tone="running"] {
  background: rgb(var(--ui-accent));
}
.ag-event-dot[data-tone="neutral"] {
  background: rgb(var(--ui-muted));
}
.ag-event-body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.ag-event-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ui-space-2);
}
.ag-event-title {
  font-weight: 600;
  font-size: var(--ui-text-sm);
  color: rgb(var(--ui-fg));
}
.ag-event-desc {
  margin: 0;
  font-size: var(--ui-text-sm);
  color: rgb(var(--ui-muted));
  overflow: hidden;
  text-overflow: ellipsis;
}
.ag-event-when {
  font-size: var(--ui-text-xs);
  color: rgb(var(--ui-faint));
  font-family: var(--ui-font-mono);
}
.ag-foot-note {
  font-size: var(--ui-text-xs);
  color: rgb(var(--ui-muted));
}

/* ===================== utilidades ===================== */
.ag-mono {
  font-family: var(--ui-font-mono);
  font-size: var(--ui-text-sm);
}
.ag-muted {
  color: rgb(var(--ui-muted));
}
.ag-link {
  color: rgb(var(--ui-accent-strong));
  text-decoration: none;
  font-weight: 600;
}
.ag-link:hover {
  text-decoration: underline;
}
.ag-link:focus-visible {
  outline: 2px solid rgb(var(--ui-accent));
  outline-offset: 2px;
  border-radius: var(--ui-radius-sm);
}

/* ===================== responsivo ===================== */
@media (max-width: 1180px) {
  .ag-metrics {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}
@media (max-width: 980px) {
  .ag-grid {
    grid-template-columns: 1fr;
  }
}
@media (max-width: 620px) {
  .ag-metrics {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .ag-header {
    flex-direction: column;
    align-items: flex-start;
    gap: var(--ui-space-4);
  }
  .ag-header-avatar {
    width: 52px;
    height: 52px;
    font-size: var(--ui-text-lg);
  }
  .ag-prop {
    flex-direction: column;
    align-items: flex-start;
    gap: 2px;
  }
  .ag-prop dd {
    text-align: left;
  }
}
</style>
