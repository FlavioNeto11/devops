<template>
  <UiPageLayout
    title="Fornecedores"
    eyebrow="StockPilot · Gateway de integração"
    subtitle="Fornecedores externos integrados pelo gateway resiliente: endpoint, autenticação e política de retry/timeout. Abra a trilha de auditoria do gateway para acompanhar as chamadas de reposição."
    width="wide"
    :error="r.error.value"
    @retry="reload"
  >
    <!-- Ações de página -->
    <template #actions>
      <UiButton variant="ghost" :loading="r.loading.value" @click="manualRefresh">
        <template #icon-left><span class="sup-ic" aria-hidden="true">↻</span></template>
        Atualizar
      </UiButton>
      <UiButton to="/orders">
        <template #icon-left><span class="sup-ic" aria-hidden="true">↗</span></template>
        Pedidos de reposição
      </UiButton>
    </template>

    <!-- KPIs derivados da carteira de fornecedores -->
    <div class="sup-kpis">
      <UiMetricCard
        label="Fornecedores"
        :value="r.loading.value ? null : kpis.total"
        :loading="r.loading.value"
        tone="primary"
        hint="integrados ao gateway"
        clickable
        @click="setActive('')"
      />
      <UiMetricCard
        label="Ativos"
        :value="r.loading.value ? null : kpis.active"
        :loading="r.loading.value"
        tone="success"
        hint="recebendo pedidos"
        clickable
        @click="setActive('true')"
      />
      <UiMetricCard
        label="Inativos"
        :value="r.loading.value ? null : kpis.inactive"
        :loading="r.loading.value"
        :tone="kpis.inactive > 0 ? 'warning' : 'neutral'"
        hint="pausados no gateway"
        clickable
        @click="setActive('false')"
      />
      <UiMetricCard
        label="Timeout médio"
        :value="r.loading.value ? null : kpis.avgTimeout"
        :loading="r.loading.value"
        tone="running"
        hint="janela por chamada"
      />
    </div>

    <!-- Filtros estruturados (busca + autenticação) -->
    <template #filters>
      <UiFiltersPanel
        v-model="filterDraft"
        :fields="filterFields"
        @apply="applyFilters"
        @clear="clearFilters"
      />
    </template>

    <UiCard title="Carteira de fornecedores" :subtitle="resultSummary">
      <template #actions>
        <div class="sup-chips" role="group" aria-label="Filtrar por situação">
          <button
            v-for="opt in activeOptions"
            :key="opt.value || 'all'"
            type="button"
            class="sup-chip"
            :data-active="filters.active === opt.value ? 'true' : null"
            :data-tone="opt.tone"
            :aria-pressed="filters.active === opt.value ? 'true' : 'false'"
            @click="setActive(opt.value)"
          >
            <span class="sup-chip-dot" aria-hidden="true" />
            {{ opt.label }}
            <span class="sup-chip-count">{{ opt.count }}</span>
          </button>
        </div>
      </template>

      <!-- Distribuição de autenticação (lê a carteira; some quando vazio/carregando) -->
      <div
        v-if="!r.loading.value && !r.error.value && authBreakdown.length"
        class="sup-authbar"
        role="group"
        aria-label="Distribuição por tipo de autenticação"
      >
        <button
          v-for="seg in authBreakdown"
          :key="seg.key"
          type="button"
          class="sup-authseg"
          :data-kind="seg.key"
          :data-active="filters.auth_type === seg.key ? 'true' : null"
          :aria-pressed="filters.auth_type === seg.key ? 'true' : 'false'"
          :data-share="seg.bucket"
          :title="seg.label + ': ' + seg.count + ' de ' + kpis.total + ' (' + seg.pct + '%)'"
          @click="toggleAuth(seg.key)"
        >
          <span class="sup-authseg-dot" aria-hidden="true" />
          <span class="sup-authseg-label">{{ seg.label }}</span>
          <span class="sup-authseg-count">{{ seg.count }}</span>
        </button>
      </div>

      <UiDataTable
        :columns="columns"
        :rows="pageRows"
        :loading="r.loading.value"
        row-key="id"
        clickable-rows
        :sort="sort"
        :page="page"
        :page-size="pageSize"
        :total="filteredRows.length"
        paginated
        :empty="emptyState"
        @update:sort="onSort"
        @update:page="onPage"
        @update:page-size="onPageSize"
        @row-click="openAudit"
      >
        <!-- Nome + URL do gateway -->
        <template #cell-name="{ row }">
          <span class="sup-name">
            <span class="sup-name-main">{{ row.name || ('Fornecedor #' + row.id) }}</span>
            <span v-if="row.gateway_url" class="sup-name-url ui-mono">{{ shortUrl(row.gateway_url) }}</span>
            <span v-else class="sup-name-url sup-name-missing">sem endpoint configurado</span>
          </span>
        </template>

        <!-- Tipo de autenticação -->
        <template #cell-auth_type="{ value }">
          <span class="sup-auth" :data-kind="normAuth(value)">
            <span class="sup-auth-dot" aria-hidden="true" />
            {{ authLabel(value) }}
          </span>
        </template>

        <!-- Política de retry/timeout -->
        <template #cell-policy="{ row }">
          <span class="sup-policy">
            <span class="sup-policy-pair" :title="'Timeout por chamada: ' + fmtMs(row.timeout_ms)">
              <span class="sup-policy-ic" aria-hidden="true">⏱</span>
              {{ fmtMs(row.timeout_ms) }}
            </span>
            <span class="sup-policy-sep" aria-hidden="true">·</span>
            <span class="sup-policy-pair" :title="retriesTitle(row.max_retries)">
              <span class="sup-policy-ic" aria-hidden="true">↻</span>
              {{ retriesLabel(row.max_retries) }}
            </span>
          </span>
        </template>

        <!-- Badge de situação (semáforo claro, nunca só cor) -->
        <template #cell-active="{ row }">
          <UiStatusBadge
            :tone="row.active ? 'success' : 'neutral'"
            :label="row.active ? 'Ativo' : 'Inativo'"
            :status="row.active ? 'active' : 'inactive'"
          />
        </template>

        <!-- Criado em -->
        <template #cell-created_at="{ value }">
          <span class="sup-time" :title="absoluteTime(value)">{{ value ? fmtDate(value) : '—' }}</span>
        </template>

        <!-- Ações por linha (menu CSP-safe, navegação por teclado) -->
        <template #cell-actions="{ row }">
          <div class="sup-rowactions" @click.stop>
            <UiButton variant="subtle" size="sm" @click="openAudit(row)">
              Auditoria
            </UiButton>
            <div class="sup-menu" :data-open="openMenuId === row.id ? 'true' : null">
              <button
                class="sup-menu-trigger"
                type="button"
                aria-haspopup="menu"
                :aria-expanded="openMenuId === row.id ? 'true' : 'false'"
                :aria-label="'Mais ações para ' + (row.name || ('fornecedor ' + row.id))"
                @click="toggleMenu(row.id)"
                @keydown.down.prevent="toggleMenu(row.id)"
              >
                <span aria-hidden="true">⋯</span>
              </button>
              <div v-if="openMenuId === row.id" class="sup-menu-list" role="menu">
                <button class="sup-menu-item" role="menuitem" type="button" @click="openAudit(row)">
                  <span class="sup-menu-ic" aria-hidden="true">▤</span> Ver auditoria
                </button>
                <button class="sup-menu-item" role="menuitem" type="button" @click="openDetail(row)">
                  <span class="sup-menu-ic" aria-hidden="true">→</span> Ver detalhe
                </button>
                <button class="sup-menu-item" role="menuitem" type="button" @click="openEdit(row)">
                  <span class="sup-menu-ic" aria-hidden="true">✎</span> Editar fornecedor
                </button>
                <button
                  class="sup-menu-item"
                  role="menuitem"
                  type="button"
                  :disabled="busyId === row.id"
                  @click="confirmToggle(row)"
                >
                  <span class="sup-menu-ic" aria-hidden="true">{{ row.active ? '⏸' : '▶' }}</span>
                  {{ row.active ? 'Pausar no gateway' : 'Reativar no gateway' }}
                </button>
              </div>
            </div>
          </div>
        </template>

        <template #empty-action>
          <UiButton v-if="hasActiveFilters" variant="ghost" @click="clearFilters">Limpar filtros</UiButton>
          <UiButton v-else to="/orders">Ver pedidos de reposição</UiButton>
        </template>
      </UiDataTable>
    </UiCard>

    <template #footer>
      <p>
        Gateway resiliente com trilha de auditoria (REQ-STOCKPILOT-0004): cada fornecedor define sua própria
        janela de timeout e política de retry/backoff. Cada chamada e seu desfecho ficam registrados na
        <RouterLink to="/audit" class="sup-footer-link">trilha de auditoria do gateway</RouterLink>.
      </p>
    </template>

    <!-- Detalhe rápido do fornecedor (sem sair da lista) -->
    <UiModal v-model:open="detailOpen" :title="detailTitle" width="md">
      <div v-if="selected" class="sup-detail">
        <div class="sup-detail-row">
          <span class="sup-detail-k">Situação</span>
          <UiStatusBadge
            :tone="selected.active ? 'success' : 'neutral'"
            :label="selected.active ? 'Ativo' : 'Inativo'"
            :status="selected.active ? 'active' : 'inactive'"
            size="lg"
          />
        </div>

        <dl class="sup-detail-grid">
          <div class="sup-detail-item sup-detail-wide">
            <dt>URL do gateway</dt>
            <dd class="ui-mono sup-break">{{ selected.gateway_url || '—' }}</dd>
          </div>
          <div class="sup-detail-item">
            <dt>Autenticação</dt>
            <dd>{{ authLabel(selected.auth_type) }}</dd>
          </div>
          <div class="sup-detail-item">
            <dt>Identificador</dt>
            <dd class="ui-mono">SUP-{{ selected.id }}</dd>
          </div>
          <div class="sup-detail-item">
            <dt>Timeout por chamada</dt>
            <dd>{{ fmtMs(selected.timeout_ms) }}</dd>
          </div>
          <div class="sup-detail-item">
            <dt>Máx. tentativas</dt>
            <dd>{{ retriesLabel(selected.max_retries) }}</dd>
          </div>
          <div class="sup-detail-item sup-detail-wide">
            <dt>Criado em</dt>
            <dd>{{ absoluteTime(selected.created_at) }}</dd>
          </div>
        </dl>

        <div v-if="selected.notes" class="sup-notes">
          <p class="sup-notes-title">Observações</p>
          <p class="sup-notes-body">{{ selected.notes }}</p>
        </div>
        <p v-else class="sup-notes-empty">Sem observações registradas para este fornecedor.</p>
      </div>

      <template #footer>
        <UiButton variant="ghost" @click="detailOpen = false">Fechar</UiButton>
        <UiButton v-if="selected" variant="subtle" @click="openEdit(selected)">Editar</UiButton>
        <UiButton
          v-if="selected"
          variant="subtle"
          :loading="busyId === (selected && selected.id)"
          @click="confirmToggle(selected)"
        >
          {{ selected && selected.active ? 'Pausar' : 'Reativar' }}
        </UiButton>
        <UiButton v-if="selected" @click="openAudit(selected)">Ver auditoria</UiButton>
      </template>
    </UiModal>
  </UiPageLayout>
</template>

<script setup>
import { ref, reactive, computed, onMounted, onBeforeUnmount } from 'vue';
import { useRouter, RouterLink } from 'vue-router';
import {
  UiPageLayout,
  UiCard,
  UiMetricCard,
  UiDataTable,
  UiButton,
  UiFiltersPanel,
  UiStatusBadge,
  UiModal,
  useResource,
  useToast,
  useConfirm,
  format,
} from '../ui/index.js';
import { suppliers } from '../api.js';

const router = useRouter();
const toast = useToast();
const ask = useConfirm();

// Carteira de fornecedores. O endpoint (GET /v1/suppliers) devolve a lista do tenant;
// filtramos/ordenamos/paginamos no cliente para que os chips e KPIs reajam sem round-trip.
const r = useResource(suppliers, { sort: { key: 'name', dir: 'asc' } });

// ---- filtros ---------------------------------------------------------------
const filters = reactive({ q: '', active: '', auth_type: '' });
const filterDraft = ref({ q: '', auth_type: '' });

const filterFields = [
  { key: 'q', label: 'Buscar', type: 'text', placeholder: 'nome ou URL do gateway' },
  {
    key: 'auth_type',
    label: 'Autenticação',
    type: 'select',
    options: [
      { value: 'api_key', label: 'API key' },
      { value: 'bearer', label: 'Bearer token' },
      { value: 'basic', label: 'Basic auth' },
      { value: 'none', label: 'Sem autenticação' },
    ],
  },
];

function applyFilters(v) {
  const next = v || filterDraft.value || {};
  filters.q = String(next.q || '').trim();
  filters.auth_type = String(next.auth_type || '');
  page.value = 1;
}

function clearFilters() {
  filters.q = '';
  filters.auth_type = '';
  filters.active = '';
  filterDraft.value = { q: '', auth_type: '' };
  page.value = 1;
}

function setActive(value) {
  filters.active = filters.active === value ? '' : value;
  page.value = 1;
}

function toggleAuth(key) {
  filters.auth_type = filters.auth_type === key ? '' : key;
  filterDraft.value = { ...filterDraft.value, auth_type: filters.auth_type };
  page.value = 1;
}

const hasActiveFilters = computed(() =>
  Boolean(filters.q || filters.auth_type || filters.active),
);

// ---- autenticação (rótulos legíveis; sem mapa de domínio chumbado fora destes 4) ----
const AUTH_LABELS = {
  api_key: 'API key',
  bearer: 'Bearer token',
  basic: 'Basic auth',
  none: 'Sem autenticação',
};
const AUTH_ORDER = ['api_key', 'bearer', 'basic', 'none'];
function normAuth(value) {
  return String(value || 'none').toLowerCase();
}
function authLabel(value) {
  const key = normAuth(value);
  return AUTH_LABELS[key] || format.humanize(value);
}

// ---- KPIs (sempre sobre a carteira completa carregada) ---------------------
const kpis = computed(() => {
  const all = r.items.value || [];
  const active = all.filter((s) => !!s.active).length;
  const timeouts = all
    .map((s) => Number(s.timeout_ms))
    .filter((n) => isFinite(n) && n > 0);
  const avg = timeouts.length
    ? Math.round(timeouts.reduce((a, b) => a + b, 0) / timeouts.length)
    : 0;
  return {
    total: all.length,
    active,
    inactive: all.length - active,
    avgTimeout: timeouts.length ? fmtMs(avg) : '—',
  };
});

const activeOptions = computed(() => {
  const all = r.items.value || [];
  const active = all.filter((s) => !!s.active).length;
  return [
    { value: '', label: 'Todos', tone: 'neutral', count: all.length },
    { value: 'true', label: 'Ativos', tone: 'success', count: active },
    { value: 'false', label: 'Inativos', tone: 'warning', count: all.length - active },
  ];
});

// Distribuição por tipo de autenticação (carteira completa). Vira chips clicáveis
// que cruzam com o filtro de autenticação; o "bucket" é só uma faixa de densidade visual.
const authBreakdown = computed(() => {
  const all = r.items.value || [];
  if (!all.length) return [];
  const counts = new Map();
  for (const s of all) {
    const key = normAuth(s.auth_type);
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  const keys = [...new Set([...AUTH_ORDER, ...counts.keys()])].filter((k) => counts.get(k));
  return keys.map((key) => {
    const count = counts.get(key) || 0;
    const pct = Math.round((count / all.length) * 100);
    return {
      key,
      label: AUTH_LABELS[key] || format.humanize(key),
      count,
      pct,
      bucket: pct >= 60 ? 'high' : pct >= 30 ? 'mid' : 'low',
    };
  });
});

// ---- filtragem + ordenação + paginação (client-side) -----------------------
const filteredRows = computed(() => {
  const q = filters.q.toLowerCase();
  return (r.items.value || []).filter((s) => {
    if (filters.active === 'true' && !s.active) return false;
    if (filters.active === 'false' && s.active) return false;
    if (filters.auth_type && normAuth(s.auth_type) !== filters.auth_type) return false;
    if (!q) return true;
    const hay = [s.name, s.gateway_url, 'sup-' + s.id, authLabel(s.auth_type)]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    return hay.includes(q);
  });
});

const sort = ref({ key: 'name', dir: 'asc' });
function sortValue(row, key) {
  if (key === 'name') return String(row.name || '').toLowerCase();
  if (key === 'policy') return Number(row.timeout_ms) || 0;
  if (key === 'active') return row.active ? 1 : 0;
  if (key === 'created_at') return new Date(row.created_at || 0).getTime() || 0;
  if (key === 'auth_type') return normAuth(row.auth_type);
  return row[key];
}
const sortedRows = computed(() => {
  const { key, dir } = sort.value || {};
  if (!key) return filteredRows.value;
  const mul = dir === 'desc' ? -1 : 1;
  return [...filteredRows.value].sort((a, b) => {
    const x = sortValue(a, key);
    const y = sortValue(b, key);
    if (x == null) return 1;
    if (y == null) return -1;
    return (x > y ? 1 : x < y ? -1 : 0) * mul;
  });
});

const page = ref(1);
const pageSize = ref(25);
const pageRows = computed(() => {
  const start = (page.value - 1) * pageSize.value;
  return sortedRows.value.slice(start, start + pageSize.value);
});

function onSort(s) { sort.value = s; page.value = 1; }
function onPage(p) { page.value = p; }
function onPageSize(ps) { pageSize.value = ps; page.value = 1; }

const resultSummary = computed(() => {
  if (r.loading.value) return 'Carregando carteira de fornecedores…';
  const n = filteredRows.value.length;
  const total = (r.items.value || []).length;
  const base = n === 1 ? '1 fornecedor' : n + ' fornecedores';
  if (n === total) return base;
  return n + ' de ' + total + ' fornecedores (filtro aplicado)';
});

const emptyState = computed(() =>
  hasActiveFilters.value
    ? {
        title: 'Nenhum fornecedor no filtro',
        description: 'Ajuste a busca, a autenticação ou a situação para ver resultados.',
        icon: 'search',
      }
    : {
        title: 'Nenhum fornecedor integrado',
        description: 'Os fornecedores aparecem aqui assim que forem integrados ao gateway de reposição.',
        icon: 'box',
      });

// ---- colunas ---------------------------------------------------------------
const columns = [
  { key: 'name', label: 'Fornecedor', sortable: true },
  { key: 'auth_type', label: 'Autenticação', sortable: true },
  { key: 'policy', label: 'Timeout · tentativas', sortable: true },
  { key: 'active', label: 'Situação', sortable: true, align: 'center' },
  { key: 'created_at', label: 'Criado em', sortable: true },
  { key: 'actions', label: 'Ações', align: 'right' },
];

// ---- formatação ------------------------------------------------------------
const fmtDate = (v) => format.formatDate(v);

function fmtMs(value) {
  const n = Number(value);
  if (!isFinite(n) || n <= 0) return '—';
  if (n >= 1000) {
    const s = n / 1000;
    const txt = Number.isInteger(s) ? String(s) : s.toFixed(1).replace('.', ',');
    return txt + ' s';
  }
  return format.formatNumber(n) + ' ms';
}

function retriesLabel(value) {
  const n = Number(value);
  if (!isFinite(n) || n < 0) return '—';
  if (n === 0) return 'sem retry';
  return n + (n === 1 ? ' tentativa' : ' tentativas');
}
function retriesTitle(value) {
  const n = Number(value);
  if (!isFinite(n) || n < 0) return 'Política de retry não definida';
  if (n === 0) return 'Sem novas tentativas em caso de falha';
  return 'Até ' + n + ' nova(s) tentativa(s) com backoff antes da falha';
}

function shortUrl(url) {
  const raw = String(url || '');
  if (!raw) return '';
  const stripped = raw.replace(/^https?:\/\//i, '').replace(/\/+$/, '');
  return stripped.length > 48 ? stripped.slice(0, 47) + '…' : stripped;
}

function absoluteTime(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (isNaN(d.getTime())) return String(value);
  try {
    return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(d);
  } catch {
    return d.toISOString();
  }
}

// ---- menu de ações por linha ----------------------------------------------
const openMenuId = ref(null);
function toggleMenu(id) { openMenuId.value = openMenuId.value === id ? null : id; }
function closeMenu() { openMenuId.value = null; }
function onDocClick() { closeMenu(); }
function onEsc(e) {
  if (e.key === 'Escape') {
    closeMenu();
    detailOpen.value = false;
  }
}

// ---- navegação / auditoria -------------------------------------------------
// A trilha de auditoria do gateway vive em GET /v1/audit (AuditListView), NÃO em /orders
// (que lista só pedidos ABERTOS e não filtra por fornecedor). O modelo de dados da auditoria
// (gateway_audit) é escopado por tenant e vinculado a produto/pedido — NÃO há coluna supplier_id —,
// então não forjamos um filtro "por fornecedor" que o backend não honra: roteamos para a
// superfície REAL de auditoria do tenant (só rotas reais — sem placeholders do scaffold).
function openAudit(row) {
  if (!row) return;
  closeMenu();
  detailOpen.value = false;
  router.push('/audit');
}
function openDetail(row) {
  closeMenu();
  selected.value = row;
  detailOpen.value = true;
}
// Editar o fornecedor (URL/auth/timeout/retry/notes) → SupplierEditView (PUT /v1/suppliers/:id).
function openEdit(row) {
  if (!row) return;
  closeMenu();
  detailOpen.value = false;
  router.push('/suppliers/' + row.id + '/edit');
}

// ---- detalhe rápido --------------------------------------------------------
const detailOpen = ref(false);
const selected = ref(null);
const detailTitle = computed(() =>
  selected.value ? (selected.value.name || ('Fornecedor #' + selected.value.id)) : 'Fornecedor');

// ---- ativar / pausar no gateway (ação destrutiva → confirmação) ------------
const busyId = ref(null);
async function confirmToggle(row) {
  if (!row) return;
  closeMenu();
  const turningOff = !!row.active;
  const name = row.name || ('fornecedor #' + row.id);
  const ok = await ask({
    title: turningOff ? 'Pausar fornecedor' : 'Reativar fornecedor',
    message: turningOff
      ? 'Pausar "' + name + '" no gateway? Novos pedidos deixarão de ser enviados a ele até a reativação.'
      : 'Reativar "' + name + '" no gateway? Ele voltará a receber pedidos de reposição.',
    confirmLabel: turningOff ? 'Pausar' : 'Reativar',
    danger: turningOff,
  });
  if (!ok) return;

  busyId.value = row.id;
  try {
    await suppliers.update(row.id, { active: !row.active });
    toast.success(
      turningOff
        ? '"' + name + '" pausado no gateway.'
        : '"' + name + '" reativado no gateway.',
    );
    detailOpen.value = false;
    await r.load();
  } catch (e) {
    toast.error('Não foi possível atualizar o fornecedor.', {
      detail: errMsg(e),
      code: e && e.status ? String(e.status) : '',
    });
  } finally {
    busyId.value = null;
  }
}

function errMsg(e) {
  if (!e) return 'Erro desconhecido.';
  return e.message || 'Erro inesperado.';
}

// ---- carregamento ----------------------------------------------------------
async function reload() {
  await r.load();
}
async function manualRefresh() {
  try {
    await r.load();
    if (!r.error.value) {
      toast.success('Carteira atualizada', {
        detail: kpis.value.total + ' fornecedor(es) carregado(s).',
      });
    } else {
      toast.error('Falha ao atualizar a carteira de fornecedores.');
    }
  } catch (e) {
    toast.error('Falha ao atualizar a carteira de fornecedores.', { detail: errMsg(e) });
  }
}

onMounted(() => {
  reload();
  document.addEventListener('click', onDocClick);
  document.addEventListener('keydown', onEsc);
});
onBeforeUnmount(() => {
  document.removeEventListener('click', onDocClick);
  document.removeEventListener('keydown', onEsc);
});
</script>

<style scoped>
/* KPIs */
.sup-kpis {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
  gap: var(--ui-space-4);
}

.sup-ic { font-size: var(--ui-text-md); line-height: 1; }

/* Tamanhos sem token de 1ª classe, derivados de tokens p/ consistência (pontos/contadores).
   Declarados nos contêineres que realmente os consomem (chips de situação e barra de auth). */
.sup-chips, .sup-authbar {
  --sup-dot: var(--ui-space-2);          /* 8px — ponto/indicador */
  --sup-count-size: calc(var(--ui-space-4) + var(--ui-space-1)); /* 20px — badge de contagem */
  --sup-count-text: var(--ui-text-xs);   /* texto do contador */
}

/* Chips de situação no cabeçalho do card */
.sup-chips { display: flex; gap: var(--ui-space-2); flex-wrap: wrap; }
.sup-chip {
  display: inline-flex;
  align-items: center;
  gap: var(--ui-space-2);
  font: inherit;
  font-size: var(--ui-text-xs);
  font-weight: 600;
  color: rgb(var(--ui-muted));
  background: rgb(var(--ui-surface-2));
  border: 1px solid rgb(var(--ui-border));
  border-radius: var(--ui-radius-pill);
  padding: var(--ui-space-1) var(--ui-space-3);
  cursor: pointer;
  transition: color .15s ease, border-color .15s ease, background .15s ease;
}
.sup-chip:hover { color: rgb(var(--ui-fg)); border-color: rgb(var(--ui-border-strong)); }
.sup-chip:focus-visible { outline: 2px solid rgb(var(--ui-accent)); outline-offset: 2px; }
.sup-chip[data-active="true"] {
  color: rgb(var(--ui-accent-fg));
  background: rgb(var(--ui-accent));
  border-color: rgb(var(--ui-accent));
}
.sup-chip-dot { width: var(--sup-dot); height: var(--sup-dot); border-radius: 50%; background: rgb(var(--ui-faint)); }
.sup-chip[data-tone="success"] .sup-chip-dot { background: rgb(var(--ui-ok)); }
.sup-chip[data-tone="warning"] .sup-chip-dot { background: rgb(var(--ui-warn)); }
.sup-chip[data-active="true"] .sup-chip-dot { background: rgb(var(--ui-accent-fg)); }
.sup-chip-count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: var(--sup-count-size);
  height: var(--sup-count-size);
  padding: 0 var(--ui-space-1);
  border-radius: var(--ui-radius-pill);
  background: rgb(var(--ui-bg) / 0.7);
  color: inherit;
  font-size: var(--sup-count-text);
  font-weight: 700;
}
.sup-chip[data-active="true"] .sup-chip-count { background: rgb(var(--ui-surface) / 0.25); }

/* Barra de distribuição por autenticação */
.sup-authbar {
  display: flex;
  flex-wrap: wrap;
  gap: var(--ui-space-2);
  margin-bottom: var(--ui-space-4);
}
.sup-authseg {
  display: inline-flex;
  align-items: center;
  gap: var(--ui-space-2);
  font: inherit;
  font-size: var(--ui-text-xs);
  font-weight: 600;
  color: rgb(var(--ui-muted));
  background: rgb(var(--ui-surface-2));
  border: 1px solid rgb(var(--ui-border));
  border-radius: var(--ui-radius-md);
  padding: var(--ui-space-1) var(--ui-space-3);
  cursor: pointer;
  transition: color .15s ease, border-color .15s ease, background .15s ease;
}
.sup-authseg:hover { color: rgb(var(--ui-fg)); border-color: rgb(var(--ui-border-strong)); }
.sup-authseg:focus-visible { outline: 2px solid rgb(var(--ui-accent)); outline-offset: 2px; }
.sup-authseg[data-active="true"] { border-color: rgb(var(--ui-accent)); color: rgb(var(--ui-fg)); }
.sup-authseg-dot { width: var(--sup-dot); height: var(--sup-dot); border-radius: var(--ui-radius-sm); background: rgb(var(--ui-faint)); }
.sup-authseg[data-kind="api_key"] .sup-authseg-dot { background: rgb(var(--ui-accent)); }
.sup-authseg[data-kind="bearer"] .sup-authseg-dot { background: rgb(var(--ui-info)); }
.sup-authseg[data-kind="basic"] .sup-authseg-dot { background: rgb(var(--ui-warn)); }
.sup-authseg[data-kind="none"] .sup-authseg-dot { background: rgb(var(--ui-faint)); }
.sup-authseg-label { color: inherit; }
.sup-authseg-count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: var(--sup-count-size);
  height: var(--sup-count-size);
  padding: 0 var(--ui-space-1);
  border-radius: var(--ui-radius-pill);
  background: rgb(var(--ui-bg) / 0.7);
  font-size: var(--sup-count-text);
  font-weight: 700;
}
.sup-authseg[data-share="high"] { background: rgb(var(--ui-accent) / 0.10); }

/* Coluna nome + URL */
.sup-name { display: flex; flex-direction: column; gap: 2px; min-width: 180px; }
.sup-name-main { font-weight: 600; color: rgb(var(--ui-fg)); }
.sup-name-url {
  font-size: var(--ui-text-xs);
  color: rgb(var(--ui-muted));
  letter-spacing: .01em;
}
.sup-name-missing { color: rgb(var(--ui-warn)); font-style: italic; }

/* Coluna autenticação */
.sup-auth {
  --sup-dot: var(--ui-space-2);
  display: inline-flex;
  align-items: center;
  gap: var(--ui-space-2);
  font-size: var(--ui-text-sm);
  color: rgb(var(--ui-fg));
  white-space: nowrap;
}
.sup-auth-dot {
  width: var(--sup-dot);
  height: var(--sup-dot);
  border-radius: var(--ui-radius-sm);
  background: rgb(var(--ui-faint));
}
.sup-auth[data-kind="api_key"] .sup-auth-dot { background: rgb(var(--ui-accent)); }
.sup-auth[data-kind="bearer"] .sup-auth-dot { background: rgb(var(--ui-info)); }
.sup-auth[data-kind="basic"] .sup-auth-dot { background: rgb(var(--ui-warn)); }
.sup-auth[data-kind="none"] .sup-auth-dot { background: rgb(var(--ui-faint)); }
.sup-auth[data-kind="none"] { color: rgb(var(--ui-muted)); }

/* Coluna política timeout/retry */
.sup-policy {
  display: inline-flex;
  align-items: center;
  gap: var(--ui-space-2);
  font-size: var(--ui-text-sm);
  color: rgb(var(--ui-fg));
  white-space: nowrap;
}
.sup-policy-pair { display: inline-flex; align-items: center; gap: var(--ui-space-1); }
.sup-policy-ic { color: rgb(var(--ui-accent-strong)); font-size: var(--ui-text-xs); }
.sup-policy-sep { color: rgb(var(--ui-faint)); }

/* Coluna tempo */
.sup-time { color: rgb(var(--ui-muted)); font-size: var(--ui-text-sm); white-space: nowrap; }

/* Ações por linha + menu */
.sup-rowactions { display: inline-flex; align-items: center; gap: var(--ui-space-2); justify-content: flex-end; }
.sup-menu {
  position: relative;
  --sup-trigger-size: calc(var(--ui-space-6) - var(--ui-space-1)); /* 28px — gatilho do menu */
  --sup-menu-min: calc(var(--ui-space-6) * 7);                     /* 224px — largura mínima do menu */
}
.sup-menu-trigger {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: var(--sup-trigger-size);
  height: var(--sup-trigger-size);
  padding: 0;
  background: transparent;
  border: 1px solid rgb(var(--ui-border-strong));
  border-radius: var(--ui-radius-sm);
  color: rgb(var(--ui-muted));
  cursor: pointer;
  font-size: var(--ui-text-lg);
  line-height: 1;
}
.sup-menu-trigger:hover { background: rgb(var(--ui-surface-2)); color: rgb(var(--ui-fg)); }
.sup-menu-trigger:focus-visible { outline: 2px solid rgb(var(--ui-accent)); outline-offset: 2px; }

.sup-menu-list {
  position: absolute;
  right: 0;
  top: calc(100% + var(--ui-space-1));
  z-index: var(--ui-z-bar);
  min-width: var(--sup-menu-min);
  display: flex;
  flex-direction: column;
  background: rgb(var(--ui-surface));
  border: 1px solid rgb(var(--ui-border));
  border-radius: var(--ui-radius-md);
  box-shadow: var(--ui-shadow-md);
  padding: var(--ui-space-1);
  overflow: hidden;
}
.sup-menu-item {
  display: flex;
  align-items: center;
  gap: var(--ui-space-2);
  width: 100%;
  text-align: left;
  background: transparent;
  border: none;
  cursor: pointer;
  padding: var(--ui-space-2) var(--ui-space-3);
  border-radius: var(--ui-radius-sm);
  color: rgb(var(--ui-fg));
  font: inherit;
  font-size: var(--ui-text-sm);
}
.sup-menu-item:hover { background: rgb(var(--ui-accent) / 0.10); color: rgb(var(--ui-accent-strong)); }
.sup-menu-item:focus-visible { outline: 2px solid rgb(var(--ui-accent)); outline-offset: -2px; }
.sup-menu-item:disabled { opacity: .55; cursor: not-allowed; }
.sup-menu-ic { width: var(--ui-space-4); text-align: center; color: rgb(var(--ui-accent-strong)); }

/* Detalhe rápido */
.sup-detail { display: flex; flex-direction: column; gap: var(--ui-space-4); }
.sup-detail-row { display: flex; align-items: center; gap: var(--ui-space-3); }
.sup-detail-k { color: rgb(var(--ui-muted)); font-size: var(--ui-text-sm); font-weight: 600; }
.sup-detail-grid {
  margin: 0;
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: var(--ui-space-3) var(--ui-space-4);
}
.sup-detail-wide { grid-column: 1 / -1; }
.sup-detail-item dt {
  color: rgb(var(--ui-muted));
  font-size: var(--ui-text-xs);
  text-transform: uppercase;
  letter-spacing: .04em;
  margin-bottom: 2px;
}
.sup-detail-item dd { margin: 0; color: rgb(var(--ui-fg)); font-size: var(--ui-text-sm); }
.sup-break { word-break: break-all; }

.sup-notes {
  background: rgb(var(--ui-surface-2));
  border: 1px solid rgb(var(--ui-border));
  border-radius: var(--ui-radius-md);
  padding: var(--ui-space-3) var(--ui-space-4);
}
.sup-notes-title {
  margin: 0 0 4px;
  font-size: var(--ui-text-xs);
  font-weight: 700;
  color: rgb(var(--ui-muted));
  text-transform: uppercase;
  letter-spacing: .04em;
}
.sup-notes-body { margin: 0; color: rgb(var(--ui-fg)); font-size: var(--ui-text-sm); line-height: 1.55; white-space: pre-wrap; }
.sup-notes-empty { margin: 0; color: rgb(var(--ui-faint)); font-size: var(--ui-text-sm); font-style: italic; }

/* Link de rota no rodapé (trilha de auditoria) */
.sup-footer-link { color: rgb(var(--ui-accent-strong)); font-weight: 600; text-decoration: none; }
.sup-footer-link:hover { text-decoration: underline; }
.sup-footer-link:focus-visible { outline: 2px solid rgb(var(--ui-accent)); outline-offset: 2px; border-radius: var(--ui-radius-sm); }

@media (max-width: 860px) {
  .sup-name { min-width: 140px; }
  .sup-menu { --sup-menu-min: calc(var(--ui-space-6) * 6); } /* 192px em telas estreitas */
  .sup-detail-grid { grid-template-columns: 1fr; }
}
</style>
