<template>
  <UiPageLayout
    eyebrow="Service Desk"
    title="Times e Filas"
    subtitle="Filas de atendimento com líder, SLA padrão, agentes alocados e a carga de chamados aguardando."
    width="wide"
    :error="r.error.value"
    @retry="reload"
  >
    <template #actions>
      <UiButton variant="ghost" :loading="r.loading.value" @click="reload">
        <template #icon-left><span class="tm-ico" aria-hidden="true">↻</span></template>
        Atualizar
      </UiButton>
      <UiButton variant="subtle" to="/agents">Ver agentes</UiButton>
      <UiButton v-if="canMutateTeams" to="/teams/new">
        <template #icon-left><span class="tm-ico" aria-hidden="true">＋</span></template>
        Novo time
      </UiButton>
    </template>

    <template #filters>
      <UiFiltersPanel
        v-model="filters"
        :fields="filterFields"
        @apply="applyFilters"
        @clear="onClear"
      />
    </template>

    <!-- Resumo das filas (KPIs; clicáveis: aplicam filtro rápido). `total` é
         autoritativo (envelope do servidor); ativas/inativas são da página visível
         (hint explícito); "na fila" soma os contadores enriquecidos (fail-soft) dos
         times exibidos. -->
    <section class="tm-metrics" aria-label="Resumo das filas">
      <UiMetricCard
        label="Times / Filas"
        :value="metrics.total"
        :loading="r.loading.value"
        hint="Total cadastrado"
        tone="primary"
        clickable
        @click="quickStatus('')"
      />
      <UiMetricCard
        label="Ativas"
        :value="metrics.active"
        :loading="r.loading.value"
        :hint="scopedHint('Recebendo chamados')"
        tone="success"
        clickable
        @click="quickStatus('active')"
      />
      <UiMetricCard
        label="Inativas"
        :value="metrics.inactive"
        :loading="r.loading.value"
        :hint="scopedHint('Pausadas')"
        :tone="metrics.inactive > 0 ? 'warning' : 'neutral'"
        clickable
        @click="quickStatus('inactive')"
      />
      <UiMetricCard
        label="Na fila"
        :value="metrics.queued"
        :loading="r.loading.value || (enriching && !countsReady)"
        :hint="queueHint"
        :tone="metrics.queued > 0 ? 'running' : 'neutral'"
      />
    </section>

    <UiDataTable
      :columns="columns"
      :rows="r.items.value"
      :loading="r.loading.value"
      row-key="id"
      density="comfortable"
      clickable-rows
      server-mode
      :sort="r.sort.value"
      :page="r.page.value"
      :page-size="r.pageSize.value"
      :total="r.total.value"
      paginated
      :empty="emptyState"
      @row-click="openDetail"
      @update:sort="r.setSort"
      @update:page="r.setPage"
      @update:page-size="onPageSize"
      @retry="reload"
    >
      <!-- Time: marca de cor (tom por situação) + nome + descrição curta -->
      <template #cell-name="{ row }">
        <span class="tm-team">
          <span class="tm-team-mark" :data-on="isActive(row) ? 'true' : 'false'" aria-hidden="true">{{ teamGlyph(row.name) }}</span>
          <span class="tm-team-id">
            <span class="tm-team-name">{{ row.name || 'Sem nome' }}</span>
            <span class="tm-team-desc" :data-empty="row.description ? null : 'true'">{{ shortDesc(row.description) }}</span>
          </span>
        </span>
      </template>

      <!-- Líder: resolve para o nome do agente e linka para a ficha dele -->
      <template #cell-lead_agent_id="{ value }">
        <RouterLink
          v-if="value != null && value !== ''"
          class="tm-lead"
          :to="'/agents/' + value"
          @click.stop
        >
          <span class="tm-lead-avatar" aria-hidden="true">{{ leadInitials(value) }}</span>
          <span class="tm-lead-name">{{ agentLabel(value) }}</span>
        </RouterLink>
        <UiStatusBadge v-else tone="warning" label="Sem líder" :with-dot="false" size="sm" />
      </template>

      <!-- SLA padrão: resolve para o nome da política e linka para ela -->
      <template #cell-default_sla_policy_id="{ value }">
        <RouterLink
          v-if="value != null && value !== ''"
          class="tm-sla"
          :to="'/sla-policies/' + value"
          @click.stop
        >
          <span class="tm-sla-ico" aria-hidden="true">◔</span>
          <span class="tm-sla-name">{{ slaLabel(value) }}</span>
        </RouterLink>
        <UiStatusBadge v-else tone="warning" label="Sem SLA" :with-dot="false" size="sm" />
      </template>

      <!-- Agentes alocados ao time (contagem real, enriquecida; fail-soft → "…"/0) -->
      <template #cell-agents="{ row }">
        <span v-if="enriching && !countsReady" class="tm-na" aria-hidden="true">…</span>
        <span v-else class="tm-count" :data-empty="agentCount(row) === 0 ? 'true' : null" :title="agentsTitle(row)">
          <span class="tm-count-num">{{ agentCount(row) }}</span>
          <span class="tm-count-unit">{{ agentCount(row) === 1 ? 'agente' : 'agentes' }}</span>
        </span>
      </template>

      <!-- Chamados na fila: número + barra de carga (largura por classe, CSP-safe) -->
      <template #cell-queued="{ row }">
        <span v-if="enriching && !countsReady" class="tm-na" aria-hidden="true">…</span>
        <span v-else class="tm-queue" :data-load="queueLevel(row)" :title="queueTitle(row)">
          <span class="tm-queue-bar" aria-hidden="true">
            <span class="tm-queue-fill" :data-fill="queueFill(row)" />
          </span>
          <span class="tm-queue-num">{{ queuedCount(row) }}</span>
        </span>
      </template>

      <!-- Situação -->
      <template #cell-status="{ value }">
        <UiStatusBadge :status="value" :label="statusLabelOf(value)" />
      </template>

      <!-- Ações por linha -->
      <template #cell-actions="{ row }">
        <span class="tm-rowactions" @click.stop>
          <UiButton variant="subtle" size="sm" :to="'/teams/' + row.id">Abrir fila</UiButton>
          <UiButton
            v-if="canMutateTeams && isActive(row)"
            variant="ghost"
            size="sm"
            @click="setStatus(row, 'inactive')"
          >Pausar</UiButton>
          <UiButton
            v-else-if="canMutateTeams"
            variant="ghost"
            size="sm"
            @click="setStatus(row, 'active')"
          >Reativar</UiButton>
        </span>
      </template>

      <template #empty-action>
        <UiButton v-if="hasActiveFilter" variant="ghost" @click="onClear">Limpar filtros</UiButton>
        <UiButton v-else-if="canMutateTeams" to="/teams/new">Criar primeiro time</UiButton>
        <UiButton v-else variant="ghost" to="/tickets">Ver chamados</UiButton>
      </template>
    </UiDataTable>

    <template #footer>
      <span>{{ footerSummary }}</span>
    </template>
  </UiPageLayout>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { useRouter, RouterLink } from 'vue-router';
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
import { teams, agents, slaPolicies, tickets } from '../api.js';
import { loadMe, canMutate } from '../session.js';

const router = useRouter();
const toast = useToast();
const ask = useConfirm();

// Gate de ações mutativas: só admin/supervisor cria/altera filas. O route guard já
// barra papéis sem acesso à tela; isto é a 2ª camada (esconde a ação) caso a rota
// seja alcançada com papel insuficiente. Backend = fonte de verdade do RBAC.
const MUTATE_ROLES = ['admin', 'supervisor'];
const canMutateTeams = computed(() => canMutate(MUTATE_ROLES));

// ------- domínio: situação (rótulo sempre presente; cor nunca é o único sinal) -------
const STATUS_OPTIONS = [
  { value: 'active', label: 'Ativa' },
  { value: 'inactive', label: 'Inativa' },
];
const STATUS_LABEL = Object.fromEntries(STATUS_OPTIONS.map((o) => [o.value, o.label]));
const statusLabelOf = (v) => STATUS_LABEL[String(v || '').toLowerCase()] || format.humanize(v);
const isActive = (row) => String(row && row.status).toLowerCase() === 'active';

// ------- colunas -------
const columns = [
  { key: 'name', label: 'Time / Fila', sortable: true },
  { key: 'lead_agent_id', label: 'Líder', sortable: true },
  { key: 'default_sla_policy_id', label: 'SLA padrão' },
  { key: 'agents', label: 'Agentes', align: 'center' },
  { key: 'queued', label: 'Na fila', align: 'right' },
  { key: 'status', label: 'Situação', sortable: true },
  { key: 'actions', label: '', align: 'right' },
];

// ------- filtros -------
const filterFields = computed(() => [
  { key: 'q', label: 'Buscar', type: 'text', placeholder: 'nome ou descrição' },
  { key: 'status', label: 'Situação', type: 'select', options: STATUS_OPTIONS },
  { key: 'default_sla_policy_id', label: 'SLA padrão', type: 'select', options: slaOptions.value },
]);
const filters = ref({ q: '', status: '', default_sla_policy_id: '' });

// ------- recurso (server-mode) -------
const r = useResource(teams, { pageSize: 25, sort: { key: 'name', dir: 'asc' } });

// ------- enriquecimento fail-soft -------
// Os rótulos (líder, SLA) e os contadores (agentes por time, chamados na fila) vêm
// de recursos vizinhos REAIS — GET /v1/teams faz SELECT * sem JOIN. Tudo degrada
// graciosamente: se uma chamada falhar, o rótulo cai para o ID cru e a contagem
// para 0/"—"; o restante da tela segue funcionando.
const agentMap = ref({}); // id -> { name, email }
const slaMap = ref({}); // id -> name
const agentCounts = ref({}); // teamId -> nº agentes
const queueCounts = ref({}); // teamId -> nº chamados na fila
const enriching = ref(false);
const countsReady = ref(false);

const agentLabel = (id) => {
  const a = agentMap.value[String(id)];
  return (a && (a.name || a.email)) || ('Agente #' + id);
};
const slaLabel = (id) => slaMap.value[String(id)] || ('Política #' + id);

const slaOptions = computed(() => {
  const opts = Object.keys(slaMap.value).map((id) => ({ value: id, label: slaMap.value[id] }));
  opts.sort((a, b) => a.label.localeCompare(b.label, 'pt-BR'));
  return opts;
});

const agentCount = (row) => agentCounts.value[String(row.id)] || 0;
const queuedCount = (row) => queueCounts.value[String(row.id)] || 0;

// carga visual da fila: nível semântico + preenchimento em degraus fixos (sem style inline)
const QUEUE_SOON = 10;
const QUEUE_HIGH = 25;
function queueLevel(row) {
  const n = queuedCount(row);
  if (n <= 0) return 'empty';
  if (n >= QUEUE_HIGH) return 'high';
  if (n >= QUEUE_SOON) return 'soon';
  return 'ok';
}
function queueFill(row) {
  const n = queuedCount(row);
  if (n <= 0) return '0';
  if (n >= QUEUE_HIGH) return '100';
  if (n >= QUEUE_SOON) return '66';
  if (n >= 3) return '33';
  return '15';
}
const agentsTitle = (row) => agentCount(row) + ' agente(s) alocado(s) a esta fila';
const queueTitle = (row) => queuedCount(row) + ' chamado(s) aguardando atendimento';

// ------- helpers de apresentação -------
function shortDesc(desc) {
  const s = (desc == null ? '' : String(desc)).trim();
  if (!s) return 'Sem descrição';
  return s.length > 72 ? s.slice(0, 72).trimEnd() + '…' : s;
}
function teamGlyph(name) {
  const s = (name == null ? '' : String(name)).trim();
  if (!s) return '#';
  const parts = s.replace(/[._-]+/g, ' ').trim().split(/\s+/).filter(Boolean);
  const first = parts[0] ? parts[0][0] : '';
  const last = parts.length > 1 ? parts[parts.length - 1][0] : '';
  return (first + last).toUpperCase() || '#';
}
function leadInitials(id) {
  const a = agentMap.value[String(id)];
  const src = (a && (a.name || a.email)) || '';
  if (!src) return 'A';
  const base = src.split('@')[0].replace(/[._-]+/g, ' ').trim().split(/\s+/).filter(Boolean);
  if (!base.length) return 'A';
  const first = base[0][0] || '';
  const last = base.length > 1 ? base[base.length - 1][0] : '';
  return (first + last).toUpperCase();
}

// ------- métricas -------
// `total` é autoritativo (envelope do servidor). `active`/`inactive` são da PÁGINA
// visível (hint deixa claro). `queued` soma os contadores enriquecidos dos times
// exibidos (fail-soft) — sinalizamos no hint quando há paginação.
const metrics = computed(() => {
  const rows = r.items.value || [];
  let active = 0;
  let queued = 0;
  for (const row of rows) {
    if (isActive(row)) active += 1;
    queued += queueCounts.value[String(row.id)] || 0;
  }
  return {
    total: r.total.value || rows.length,
    active,
    inactive: rows.length - active,
    queued,
  };
});
const isPaged = computed(() => (r.total.value || 0) > (r.items.value || []).length);
const scopedHint = (base) => (isPaged.value ? base + ' · nesta página' : base);
const queueHint = computed(() => {
  if (enriching.value && !countsReady.value) return 'Somando filas…';
  if (!countsReady.value) return 'Soma indisponível';
  return isPaged.value ? 'Somatório desta página' : 'Aguardando atendimento';
});

const hasActiveFilter = computed(
  () => !!(filters.value.q || filters.value.status || filters.value.default_sla_policy_id),
);
const emptyState = computed(() =>
  hasActiveFilter.value
    ? {
        title: 'Nenhuma fila para este filtro',
        description: 'Ajuste os filtros ou limpe a busca para ver todos os times.',
        icon: 'search',
      }
    : {
        title: 'Nenhum time cadastrado',
        description: 'Crie filas de atendimento para distribuir chamados entre os agentes.',
        icon: 'users',
      },
);

const footerSummary = computed(() => {
  if (r.loading.value) return 'Carregando times…';
  const t = r.total.value || 0;
  if (!t) return 'Nenhum time cadastrado.';
  const key = r.sort.value ? r.sort.value.key : 'name';
  const col = columns.find((c) => c.key === key);
  return t + ' time(s) · ordenado por ' + (col ? col.label.toLowerCase() : 'nome');
});

// ------- carga de dados vizinhos (fail-soft, isolada por recurso) -------
function rowsOf(res) {
  return Array.isArray(res) ? res : (res && (res.data || res.items)) || [];
}

async function loadAgentsRef() {
  try {
    const res = await agents.list({ pageSize: 500, sort: 'name', dir: 'asc' });
    const map = {};
    const counts = {};
    for (const a of rowsOf(res)) {
      if (!a || a.id == null) continue;
      map[String(a.id)] = { name: a.name, email: a.email };
      const tid = a.team_id;
      if (tid != null && tid !== '') counts[String(tid)] = (counts[String(tid)] || 0) + 1;
    }
    agentMap.value = map;
    agentCounts.value = counts;
  } catch {
    // mantém os mapas atuais; colunas caem para ID cru / 0
  }
}

async function loadSlaRef() {
  try {
    const res = await slaPolicies.list({ pageSize: 200, sort: 'name', dir: 'asc' });
    const map = {};
    for (const s of rowsOf(res)) {
      if (s && s.id != null) map[String(s.id)] = s.name || s.title || ('Política #' + s.id);
    }
    slaMap.value = map;
  } catch {
    slaMap.value = {};
  }
}

// Chamados na fila por time: contamos os chamados em estados "abertos/aguardando"
// agrupados por team_id. Pedimos um recorte amplo e contamos no cliente — se o
// backend não expor o campo, a coluna mostra 0 sem quebrar (fail-soft).
const OPEN_STATES = ['open', 'new', 'pending', 'waiting', 'queued', 'aberto', 'pendente', 'aguardando', 'em_fila'];
async function loadQueueCounts() {
  try {
    const res = await tickets.list({ pageSize: 500, sort: 'created_at', dir: 'desc' });
    const counts = {};
    for (const t of rowsOf(res)) {
      if (!t) continue;
      const tid = t.team_id;
      if (tid == null || tid === '') continue;
      const st = String(t.status || '').toLowerCase();
      const isOpen = !st || OPEN_STATES.some((w) => st === w || st.includes(w));
      if (isOpen) counts[String(tid)] = (counts[String(tid)] || 0) + 1;
    }
    queueCounts.value = counts;
  } catch {
    queueCounts.value = {};
  }
}

async function enrich() {
  enriching.value = true;
  try {
    await Promise.allSettled([loadAgentsRef(), loadSlaRef(), loadQueueCounts()]);
    countsReady.value = true;
  } finally {
    enriching.value = false;
  }
}

// ------- interações -------
function applyFilters() {
  r.setFilters({ ...filters.value });
}
function onClear() {
  filters.value = { q: '', status: '', default_sla_policy_id: '' };
  r.setFilters({ ...filters.value });
}
function quickStatus(status) {
  filters.value = { ...filters.value, status };
  applyFilters();
}
function onPageSize(size) {
  r.pageSize.value = size;
  r.setPage(1);
}
function openDetail(row) {
  router.push('/teams/' + row.id);
}
async function reload() {
  try {
    await Promise.all([r.load(), enrich()]);
  } catch (e) {
    toast.error('Não foi possível atualizar as filas.', { detail: e && e.message });
  }
}

// alterar situação da fila (ação com efeito → confirmação + toast)
async function setStatus(row, target) {
  const toInactive = target === 'inactive';
  const verb = toInactive ? 'Pausar' : 'Reativar';
  const name = row.name || ('#' + row.id);
  const ok = await ask({
    title: verb + ' fila',
    message: toInactive
      ? 'Pausar a fila "' + name + '"? Novos chamados deixam de ser roteados para este time até a reativação. Os chamados já abertos não são removidos.'
      : 'Reativar a fila "' + name + '"? O time volta a receber chamados.',
    confirmLabel: verb,
    danger: toInactive,
  });
  if (!ok) return;
  try {
    await r.update(row.id, { status: target });
    toast.success(toInactive ? 'Fila pausada.' : 'Fila reativada.');
    await r.load();
  } catch (e) {
    toast.error('Não foi possível alterar a situação da fila.', { detail: e && e.message, code: e && e.status });
  }
}

onMounted(() => {
  r.load();
  enrich();
  loadMe();
});
</script>

<style scoped>
.tm-ico {
  font-weight: 700;
  line-height: 1;
}

/* KPIs */
.tm-metrics {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: var(--ui-space-4);
}

/* coluna: time (marca + nome + descrição) */
.tm-team {
  display: inline-flex;
  align-items: center;
  gap: var(--ui-space-3);
  min-width: 0;
}
.tm-team-mark {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 38px;
  height: 38px;
  flex-shrink: 0;
  border-radius: var(--ui-radius-md);
  font-family: var(--ui-font-display);
  font-weight: 700;
  font-size: var(--ui-text-sm);
  letter-spacing: 0.02em;
  background: rgb(var(--ui-accent) / 0.14);
  color: rgb(var(--ui-accent-strong));
}
.tm-team-mark[data-on="false"] {
  background: rgb(var(--ui-muted) / 0.16);
  color: rgb(var(--ui-muted));
}
.tm-team-id {
  display: flex;
  flex-direction: column;
  min-width: 0;
  line-height: 1.3;
}
.tm-team-name {
  font-weight: 600;
  color: rgb(var(--ui-fg));
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.tm-team-desc {
  font-size: var(--ui-text-xs);
  color: rgb(var(--ui-muted));
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 320px;
}
.tm-team-desc[data-empty="true"] {
  font-style: italic;
  opacity: 0.8;
}

/* líder */
.tm-lead {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  white-space: nowrap;
  color: rgb(var(--ui-accent-strong));
  text-decoration: none;
  font-weight: 500;
  min-width: 0;
}
.tm-lead:hover {
  text-decoration: underline;
}
.tm-lead-avatar {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  flex-shrink: 0;
  border-radius: 50%;
  font-size: 10px;
  font-weight: 700;
  background: rgb(var(--ui-accent) / 0.16);
  color: rgb(var(--ui-accent-strong));
}
.tm-lead-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* SLA */
.tm-sla {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  white-space: nowrap;
  color: rgb(var(--ui-accent-strong));
  text-decoration: none;
  font-weight: 500;
  min-width: 0;
}
.tm-sla:hover {
  text-decoration: underline;
}
.tm-sla-ico {
  color: rgb(var(--ui-accent-strong));
  font-size: var(--ui-text-md);
  flex-shrink: 0;
}
.tm-sla-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* contagem de agentes */
.tm-count {
  display: inline-flex;
  align-items: baseline;
  gap: 5px;
  justify-content: center;
  white-space: nowrap;
}
.tm-count-num {
  font-family: var(--ui-font-display);
  font-weight: 700;
  font-size: var(--ui-text-lg);
  color: rgb(var(--ui-fg));
}
.tm-count-unit {
  font-size: var(--ui-text-xs);
  color: rgb(var(--ui-muted));
}
.tm-count[data-empty="true"] .tm-count-num {
  color: rgb(var(--ui-muted));
}

/* fila: barra de carga + número (níveis por data-attr; largura por classe data-fill, sem style inline) */
.tm-queue {
  display: inline-flex;
  align-items: center;
  gap: var(--ui-space-3);
  justify-content: flex-end;
  white-space: nowrap;
}
.tm-queue-bar {
  position: relative;
  display: inline-block;
  width: 84px;
  height: 8px;
  border-radius: var(--ui-radius-pill);
  background: rgb(var(--ui-muted) / 0.18);
  overflow: hidden;
}
.tm-queue-fill {
  position: absolute;
  inset: 0 auto 0 0;
  width: 0;
  border-radius: var(--ui-radius-pill);
  background: rgb(var(--ui-faint));
  transition: width 0.25s ease;
}
.tm-queue-fill[data-fill="0"] { width: 0; }
.tm-queue-fill[data-fill="15"] { width: 15%; }
.tm-queue-fill[data-fill="33"] { width: 33%; }
.tm-queue-fill[data-fill="66"] { width: 66%; }
.tm-queue-fill[data-fill="100"] { width: 100%; }
.tm-queue[data-load="ok"] .tm-queue-fill { background: rgb(var(--ui-ok)); }
.tm-queue[data-load="soon"] .tm-queue-fill { background: rgb(var(--ui-warn)); }
.tm-queue[data-load="high"] .tm-queue-fill { background: rgb(var(--ui-danger)); }
.tm-queue-num {
  font-family: var(--ui-font-display);
  font-weight: 700;
  font-size: var(--ui-text-md);
  color: rgb(var(--ui-fg));
  min-width: 18px;
  text-align: right;
}
.tm-queue[data-load="empty"] .tm-queue-num {
  color: rgb(var(--ui-muted));
}
.tm-queue[data-load="soon"] .tm-queue-num {
  color: rgb(var(--ui-warn));
}
.tm-queue[data-load="high"] .tm-queue-num {
  color: rgb(var(--ui-danger));
}

/* valor ainda carregando (enriquecimento) */
.tm-na {
  display: inline-block;
  color: rgb(var(--ui-muted));
  font-weight: 700;
}

/* ações por linha */
.tm-rowactions {
  display: inline-flex;
  gap: var(--ui-space-2);
  justify-content: flex-end;
}

@media (max-width: 860px) {
  .tm-team-desc {
    display: none;
  }
  .tm-lead-name,
  .tm-sla-name {
    max-width: 120px;
  }
  .tm-queue-bar {
    width: 56px;
  }
  .tm-rowactions {
    flex-direction: column;
    align-items: flex-end;
  }
}
</style>
