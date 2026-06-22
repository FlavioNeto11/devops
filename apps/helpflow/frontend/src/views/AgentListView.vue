<template>
  <UiPageLayout
    eyebrow="Equipe & RBAC"
    title="Agentes"
    subtitle="Pessoas com acesso ao service desk — papel, time, tenant, situação e último acesso."
    width="wide"
    :error="r.error.value"
    @retry="r.load"
  >
    <template #actions>
      <UiButton variant="ghost" :loading="r.loading.value" @click="reload">
        <template #icon-left><span class="hf-ico" aria-hidden="true">↻</span></template>
        Atualizar
      </UiButton>
      <UiButton v-if="canMutateAgents" to="/agents/new">
        <template #icon-left><span class="hf-ico" aria-hidden="true">＋</span></template>
        Novo agente
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

    <!-- KPIs do quadro de agentes (clicáveis: aplicam filtro rápido) -->
    <section class="hf-metrics" aria-label="Resumo da equipe">
      <UiMetricCard
        label="Agentes"
        :value="metrics.total"
        :loading="r.loading.value"
        hint="Total no resultado (todas as páginas)"
        tone="primary"
        clickable
        @click="quickRole('')"
      />
      <UiMetricCard
        label="Ativos"
        :value="metrics.active"
        :loading="r.loading.value"
        :hint="scopedHint('Com acesso')"
        tone="success"
        clickable
        @click="quickStatus('active')"
      />
      <UiMetricCard
        label="Inativos"
        :value="metrics.inactive"
        :loading="r.loading.value"
        :hint="scopedHint('Sem acesso')"
        :tone="metrics.inactive > 0 ? 'warning' : 'neutral'"
        clickable
        @click="quickStatus('inactive')"
      />
      <UiMetricCard
        label="Administradores"
        :value="metrics.admins"
        :loading="r.loading.value"
        :hint="scopedHint('Papel admin')"
        tone="error"
        clickable
        @click="quickRole('admin')"
      />
    </section>

    <!-- Ações em lote sobre a situação (somente quem pode mutar) -->
    <div v-if="canMutateAgents && selected.length" class="hf-bulk" role="region" aria-label="Ações em lote">
      <span class="hf-bulk-count">{{ selected.length }} selecionado(s)</span>
      <div class="hf-bulk-actions">
        <UiButton variant="subtle" size="sm" :loading="bulkBusy" @click="bulkStatus('active', 'Reativar')">
          Reativar acesso
        </UiButton>
        <UiButton variant="danger" size="sm" :loading="bulkBusy" @click="bulkStatus('inactive', 'Suspender')">
          Suspender acesso
        </UiButton>
        <UiButton variant="ghost" size="sm" @click="selected = []">Limpar seleção</UiButton>
      </div>
    </div>

    <UiDataTable
      :columns="columns"
      :rows="r.items.value"
      :loading="r.loading.value"
      row-key="id"
      density="comfortable"
      :selectable="canMutateAgents"
      v-model:selected="selected"
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
      @update:pageSize="onPageSize"
      @retry="r.load"
    >
      <!-- Agente: avatar (tom por papel) + nome + e-mail -->
      <template #cell-name="{ row }">
        <span class="hf-agent">
          <span class="hf-agent-avatar" :data-role="roleKey(row.role)" aria-hidden="true">{{ initials(row.name, row.email) }}</span>
          <span class="hf-agent-id">
            <span class="hf-agent-name">{{ row.name || '—' }}</span>
            <span class="hf-agent-mail">{{ row.email || '—' }}</span>
          </span>
        </span>
      </template>

      <!-- Papel RBAC: badge com tom próprio -->
      <template #cell-role="{ value }">
        <UiStatusBadge :status="value" :tone="roleTone(value)" :label="roleLabel(value)" />
      </template>

      <!-- Time (linka para a tela do time no domínio) -->
      <template #cell-team_id="{ value }">
        <RouterLink v-if="value != null && value !== ''" class="hf-team" :to="'/teams/' + value" @click.stop>
          {{ teamLabel(value) }}
        </RouterLink>
        <span v-else class="hf-dash">Sem time</span>
      </template>

      <!-- Tenant -->
      <template #cell-tenant_id="{ value }">
        <span class="hf-mono">{{ value != null && value !== '' ? ('#' + value) : '—' }}</span>
      </template>

      <!-- Situação -->
      <template #cell-status="{ value }">
        <UiStatusBadge :status="value" :label="statusLabel(value)" />
      </template>

      <!-- Último acesso (relativo, data completa no title) -->
      <template #cell-last_login_at="{ value }">
        <span v-if="value" class="hf-last" :title="format.formatDateTime(value)">{{ relativeSince(value) }}</span>
        <span v-else class="hf-last hf-last-never">Nunca acessou</span>
      </template>

      <!-- Ações por linha -->
      <template #cell-actions="{ row }">
        <span class="hf-rowactions" @click.stop>
          <UiButton variant="subtle" size="sm" :to="'/agents/' + row.id">Ver</UiButton>
          <UiButton
            v-if="canMutateAgents && isActive(row)"
            variant="ghost"
            size="sm"
            @click="setStatus(row, 'inactive')"
          >Desativar</UiButton>
          <UiButton
            v-else-if="canMutateAgents"
            variant="ghost"
            size="sm"
            @click="setStatus(row, 'active')"
          >Reativar</UiButton>
        </span>
      </template>

      <template #empty-action>
        <UiButton v-if="canMutateAgents" to="/agents/new">Cadastrar agente</UiButton>
        <UiButton v-else variant="ghost" @click="onClear">Limpar filtros</UiButton>
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
  UiFiltersPanel,
  UiMetricCard,
  UiStatusBadge,
  useResource,
  useToast,
  useConfirm,
  format,
} from '../ui/index.js';
import { agents, teams } from '../api.js';
import { loadMe, canMutate } from '../session.js';

const router = useRouter();
const toast = useToast();
const ask = useConfirm();

// Gate de ações mutativas: só admin/supervisor cria/altera agentes. O route guard
// já barra papéis sem acesso à tela; isto é a 2ª camada (esconde a ação) caso a
// rota seja alcançada com papel insuficiente. Backend = fonte de verdade do RBAC.
const MUTATE_ROLES = ['admin', 'supervisor'];
const canMutateAgents = computed(() => canMutate(MUTATE_ROLES));

// ------- domínio: papéis (RBAC) — rótulo + tom explícitos (cor nunca é o único sinal) -------
const ROLES = [
  { value: 'admin', label: 'Admin', tone: 'error' },
  { value: 'supervisor', label: 'Supervisor', tone: 'warning' },
  { value: 'agent', label: 'Agente', tone: 'running' },
  { value: 'viewer', label: 'Leitor', tone: 'neutral' },
];
const ROLE_MAP = ROLES.reduce((acc, role) => { acc[role.value] = role; return acc; }, {});
const roleKey = (role) => String(role || '').toLowerCase();
const roleTone = (role) => (ROLE_MAP[roleKey(role)] || {}).tone || 'neutral';
const roleLabel = (role) => (ROLE_MAP[roleKey(role)] || {}).label || format.humanize(role);

// ------- situação -------
const STATUS = [
  { value: 'active', label: 'Ativo' },
  { value: 'inactive', label: 'Inativo' },
];
const STATUS_MAP = Object.fromEntries(STATUS.map((s) => [s.value, s.label]));
const statusLabel = (value) => STATUS_MAP[String(value || '').toLowerCase()] || '';
const isActive = (row) => String(row && row.status).toLowerCase() === 'active';

const columns = [
  { key: 'name', label: 'Agente', sortable: true },
  { key: 'role', label: 'Papel' },
  { key: 'team_id', label: 'Time', sortable: true },
  { key: 'tenant_id', label: 'Tenant', align: 'center' },
  { key: 'status', label: 'Situação' },
  { key: 'last_login_at', label: 'Último acesso', sortable: true },
  { key: 'actions', label: '', align: 'right' },
];

const filterFields = computed(() => [
  { key: 'q', label: 'Buscar', type: 'text', placeholder: 'nome ou e-mail' },
  { key: 'role', label: 'Papel', type: 'select', options: ROLES.map((role) => ({ value: role.value, label: role.label })) },
  { key: 'team_id', label: 'Time', type: 'select', options: teamOptions.value },
  { key: 'status', label: 'Situação', type: 'select', options: STATUS },
]);
const filters = ref({ q: '', role: '', team_id: '', status: '' });

const r = useResource(agents, { sort: { key: 'name', dir: 'asc' } });
const selected = ref([]);
const bulkBusy = ref(false);

// Times reais p/ rótulo (coluna/link) e p/ o filtro por time. Degrada
// graciosamente: se a lista de times falhar, o filtro fica só com "Todos" e o
// rótulo cai no ID cru — a tela de agentes continua funcionando (fail-soft).
const teamMap = ref({});
const teamOptions = computed(() => {
  const opts = Object.keys(teamMap.value).map((id) => ({ value: id, label: teamMap.value[id] }));
  opts.sort((a, b) => a.label.localeCompare(b.label, 'pt-BR'));
  return [{ value: '', label: 'Todos os times' }, ...opts];
});
const teamLabel = (id) => teamMap.value[String(id)] || ('Time #' + id);

async function loadTeams() {
  try {
    const res = await teams.list({ pageSize: 200, sort: 'name', dir: 'asc' });
    const rows = Array.isArray(res) ? res : res.data || res.items || [];
    const map = {};
    for (const t of rows) {
      if (t && t.id != null) map[String(t.id)] = t.name || t.title || ('Time #' + t.id);
    }
    teamMap.value = map;
  } catch {
    teamMap.value = {};
  }
}

// ------- métricas -------
// "Agentes" usa o total do servidor (r.total). Os demais derivam SÓ da página
// carregada (r.items, máx. pageSize): quando há mais de uma página, esses números
// referem-se a esta página — sinalizamos no hint para não enganar o operador.
const metrics = computed(() => {
  const rows = r.items.value || [];
  return {
    total: r.total.value || rows.length,
    active: rows.filter(isActive).length,
    inactive: rows.filter((a) => !isActive(a)).length,
    admins: rows.filter((a) => roleKey(a.role) === 'admin').length,
  };
});
const isPaged = computed(() => (r.total.value || 0) > (r.items.value || []).length);
const scopedHint = (base) => (isPaged.value ? base + ' · nesta página' : base);

const hasActiveFilter = computed(() =>
  !!(filters.value.q || filters.value.role || filters.value.team_id || filters.value.status),
);
const emptyState = computed(() =>
  hasActiveFilter.value
    ? { title: 'Nenhum agente encontrado', description: 'Ajuste os filtros ou limpe a busca para ver toda a equipe.', icon: 'search' }
    : { title: 'Nenhum agente cadastrado', description: 'Quando agentes tiverem acesso, eles aparecem aqui.', icon: 'users' },
);

const footerSummary = computed(() => {
  const total = r.total.value || 0;
  if (r.loading.value) return 'Carregando agentes…';
  if (!total) return 'Nenhum agente no quadro.';
  const orderKey = r.sort.value ? r.sort.value.key : 'name';
  const col = columns.find((c) => c.key === orderKey);
  return total + ' agente(s) · ordenado por ' + (col && col.label ? col.label.toLowerCase() : orderKey);
});

// ------- iniciais (nome → e-mail como fallback) -------
function initials(name, email) {
  const src = (name && name.trim()) || (email && email.split('@')[0]) || '';
  if (!src) return '–';
  const parts = src.replace(/[._-]+/g, ' ').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '–';
  const first = parts[0][0] || '';
  const last = parts.length > 1 ? parts[parts.length - 1][0] : '';
  return (first + last).toUpperCase();
}

// ------- "último acesso" relativo (puro, sem libs) -------
function relativeSince(value) {
  const t = new Date(value).getTime();
  if (isNaN(t)) return String(value);
  const diff = Date.now() - t;
  if (diff < 0) return format.formatDateTime(value);
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'agora há pouco';
  if (mins < 60) return 'há ' + mins + ' min';
  const hours = Math.floor(mins / 60);
  if (hours < 24) return 'há ' + hours + 'h';
  const days = Math.floor(hours / 24);
  if (days < 30) return 'há ' + days + ' dia' + (days > 1 ? 's' : '');
  const months = Math.floor(days / 30);
  if (months < 12) return 'há ' + months + ' mês' + (months > 1 ? 'es' : '');
  const years = Math.floor(days / 365);
  return 'há ' + years + ' ano' + (years > 1 ? 's' : '');
}

// ------- filtros / navegação -------
function applyFilters() {
  selected.value = [];
  r.setFilters({ ...filters.value });
}
function onClear() {
  filters.value = { q: '', role: '', team_id: '', status: '' };
  applyFilters();
}
function quickRole(role) {
  filters.value = { ...filters.value, role, status: '' };
  applyFilters();
}
function quickStatus(status) {
  filters.value = { ...filters.value, status, role: '' };
  applyFilters();
}
function onPageSize(size) {
  r.pageSize.value = size;
  r.setPage(1);
}
function openDetail(row) {
  router.push('/agents/' + row.id);
}
async function reload() {
  selected.value = [];
  try {
    await Promise.all([r.load(), loadTeams()]);
  } catch (e) {
    toast.error('Não foi possível atualizar o quadro de agentes.', { detail: e && e.message });
  }
}

// ------- ação por linha: alterar situação (suspender = destrutiva → confirma + toast) -------
async function setStatus(row, targetStatus) {
  const deactivating = targetStatus === 'inactive';
  const who = row.name || row.email || ('#' + row.id);
  const ok = await ask({
    title: deactivating ? 'Suspender acesso' : 'Reativar acesso',
    message: deactivating
      ? 'Remover o acesso de "' + who + '"? A pessoa não poderá mais entrar no service desk até ser reativada.'
      : 'Liberar novamente o acesso de "' + who + '" ao service desk?',
    confirmLabel: deactivating ? 'Suspender' : 'Reativar',
    danger: deactivating,
  });
  if (!ok) return;
  try {
    await r.update(row.id, { status: targetStatus });
    toast.success(deactivating ? 'Acesso suspenso.' : 'Acesso reativado.');
    await r.load();
  } catch (e) {
    toast.error('Não foi possível alterar a situação.', { detail: e && e.message, code: e && e.status });
  }
}

// ------- ação em lote: situação de vários agentes -------
async function bulkStatus(targetStatus, verb) {
  const rows = selected.value.slice();
  if (!rows.length) return;
  const destructive = targetStatus === 'inactive';
  const ok = await ask({
    title: verb + ' acesso',
    message:
      verb + ' o acesso de ' + rows.length + ' agente(s)? ' +
      (destructive
        ? 'Eles deixarão de conseguir entrar até serem reativados.'
        : 'Eles voltarão a conseguir entrar no service desk.'),
    confirmLabel: verb,
    danger: destructive,
  });
  if (!ok) return;
  bulkBusy.value = true;
  let done = 0;
  let failed = 0;
  for (const row of rows) {
    try {
      await r.update(row.id, { status: targetStatus });
      done += 1;
    } catch {
      failed += 1;
    }
  }
  bulkBusy.value = false;
  selected.value = [];
  if (done) toast.success(done + ' agente(s) atualizado(s).');
  if (failed) toast.error(failed + ' agente(s) não puderam ser atualizados.');
  await r.load();
}

onMounted(() => {
  r.load();
  loadTeams();
  loadMe();
});
</script>

<style scoped>
.hf-ico {
  font-weight: 700;
  line-height: 1;
}

.hf-metrics {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: var(--ui-space-4);
}

/* barra de ações em lote */
.hf-bulk {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ui-space-4);
  flex-wrap: wrap;
  background: rgb(var(--ui-accent) / 0.08);
  border: 1px solid rgb(var(--ui-accent) / 0.30);
  border-radius: var(--ui-radius-lg);
  padding: var(--ui-space-3) var(--ui-space-4);
}
.hf-bulk-count {
  font-weight: 700;
  color: rgb(var(--ui-accent-strong));
  font-size: var(--ui-text-sm);
}
.hf-bulk-actions {
  display: flex;
  gap: var(--ui-space-2);
  flex-wrap: wrap;
}

/* célula de agente: avatar + identidade */
.hf-agent { display: inline-flex; align-items: center; gap: var(--ui-space-3); min-width: 0; }
.hf-agent-avatar {
  display: inline-flex; align-items: center; justify-content: center;
  width: 34px; height: 34px; flex-shrink: 0;
  border-radius: var(--ui-radius-pill);
  background: rgb(var(--ui-muted) / 0.16);
  color: rgb(var(--ui-muted));
  font-family: var(--ui-font-display);
  font-weight: 700;
  font-size: var(--ui-text-xs);
  letter-spacing: .02em;
}
/* tinge o avatar pelo papel; o badge da coluna "Papel" carrega o rótulo textual */
.hf-agent-avatar[data-role="admin"] { background: rgb(var(--ui-danger) / 0.16); color: rgb(var(--ui-danger)); }
.hf-agent-avatar[data-role="supervisor"] { background: rgb(var(--ui-warn) / 0.18); color: rgb(var(--ui-warn)); }
.hf-agent-avatar[data-role="agent"] { background: rgb(var(--ui-accent) / 0.16); color: rgb(var(--ui-accent-strong)); }
.hf-agent-id { display: flex; flex-direction: column; min-width: 0; line-height: 1.25; }
.hf-agent-name { font-weight: 600; color: rgb(var(--ui-fg)); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.hf-agent-mail { font-size: var(--ui-text-xs); color: rgb(var(--ui-muted)); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.hf-team { color: rgb(var(--ui-accent-strong)); text-decoration: none; font-weight: 500; }
.hf-team:hover { text-decoration: underline; }
.hf-dash { color: rgb(var(--ui-muted)); font-style: italic; }
.hf-mono { font-family: var(--ui-font-mono); font-size: var(--ui-text-sm); }

.hf-last { color: rgb(var(--ui-fg)); white-space: nowrap; }
.hf-last-never { color: rgb(var(--ui-muted)); font-style: italic; }

.hf-rowactions { display: inline-flex; gap: var(--ui-space-2); justify-content: flex-end; }

@media (max-width: 860px) {
  .hf-agent-mail { display: none; }
  .hf-rowactions { flex-direction: column; align-items: flex-end; }
  .hf-bulk { flex-direction: column; align-items: flex-start; }
}
</style>
