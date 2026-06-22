<template>
  <UiPageLayout
    eyebrow="StockPilot · Conformidade"
    title="Auditoria do fornecedor"
    subtitle="Trilha completa e sanitizada das trocas com o fornecedor externo: operação, produto/pedido, desfecho, status HTTP, tentativa, duração e erro redigido. Segredos nunca vazam."
    width="wide"
    :error="pageError"
    @retry="reload"
  >
    <!-- Ações de cabeçalho — só rotas de DOMÍNIO reais do inventário -->
    <template #actions>
      <UiButton variant="ghost" :loading="loading" @click="manualRefresh">
        <template #icon-left><span aria-hidden="true">↻</span></template>
        Atualizar
      </UiButton>
      <UiButton variant="subtle" :disabled="!filteredRows.length || loading" @click="exportCsv">
        <template #icon-left><span aria-hidden="true">⬇</span></template>
        Exportar CSV
      </UiButton>
      <UiButton variant="ghost" to="/orders">
        <template #icon-left><span aria-hidden="true">🧾</span></template>
        Pedidos
      </UiButton>
    </template>

    <!-- Faixa de KPIs derivada do conjunto REAL retornado -->
    <template #banner>
      <div class="au-banner">
        <div class="au-kpis" role="group" aria-label="Resumo da trilha de auditoria">
          <UiMetricCard
            label="Trocas auditadas"
            :value="kpis.total"
            tone="primary"
            :hint="kpis.total ? 'registros carregados' : 'nenhuma troca ainda'"
            :loading="loading"
            clickable
            @click="setOutcome('')"
          />
          <UiMetricCard
            label="Sucessos"
            :value="kpis.success"
            tone="success"
            :hint="successRateLabel"
            :loading="loading"
            clickable
            @click="setOutcome('success')"
          />
          <UiMetricCard
            label="Falhas"
            :value="kpis.failure"
            :tone="kpis.failure > 0 ? 'error' : 'neutral'"
            :hint="kpis.failure > 0 ? 'exigem investigação' : 'nenhuma falha'"
            :loading="loading"
            clickable
            @click="setOutcome('failure')"
          />
          <UiMetricCard
            label="Duração mediana"
            :value="kpis.medianDurationLabel"
            tone="running"
            hint="por troca com o fornecedor"
            :loading="loading"
          />
        </div>

        <!-- Destaque de falhas: barra de insight que aparece SÓ quando há falhas -->
        <div
          v-if="!loading && kpis.failure > 0"
          class="au-spotlight"
          role="note"
          aria-label="Atenção a falhas na trilha"
        >
          <span class="au-spotlight-icon" aria-hidden="true">⚠</span>
          <span class="au-spotlight-text">
            <strong>{{ kpis.failure }}</strong>
            {{ kpis.failure === 1 ? 'troca falhou' : 'trocas falharam' }} com o fornecedor
            <template v-if="kpis.retried > 0">
              · <strong>{{ kpis.retried }}</strong> exigiram nova tentativa
            </template>
          </span>
          <UiButton
            v-if="outcomeFilter !== 'failure'"
            variant="subtle"
            size="sm"
            @click="setOutcome('failure')"
          >
            Ver só falhas
          </UiButton>
          <UiButton v-else variant="ghost" size="sm" @click="setOutcome('')">
            Limpar filtro
          </UiButton>
        </div>
      </div>
    </template>

    <!-- Toolbar: busca livre + chips por desfecho (OutcomeFilter) -->
    <template #filters>
      <div class="au-toolbar">
        <form class="au-search" role="search" @submit.prevent>
          <span class="au-search-icon" aria-hidden="true">⌕</span>
          <input
            id="au-search-input"
            v-model="search"
            class="au-search-input"
            type="search"
            placeholder="Buscar por operação, produto, pedido, status ou erro…"
            aria-label="Buscar na trilha de auditoria"
          />
          <button
            v-if="search"
            class="au-search-clear"
            type="button"
            aria-label="Limpar busca"
            @click="search = ''"
          >✕</button>
        </form>

        <div class="au-chip-group" role="group" aria-label="Filtrar por desfecho">
          <span class="au-chip-legend">Desfecho</span>
          <button
            v-for="opt in outcomeOptions"
            :key="opt.value || 'all'"
            class="au-chip"
            type="button"
            :data-active="outcomeFilter === opt.value ? 'true' : null"
            :data-tone="opt.tone"
            :aria-pressed="outcomeFilter === opt.value ? 'true' : 'false'"
            @click="setOutcome(opt.value)"
          >
            <span class="au-chip-dot" aria-hidden="true" />
            {{ opt.label }}
            <span class="au-chip-count">{{ opt.count }}</span>
          </button>
        </div>
      </div>

      <div v-if="hasActiveFilters" class="au-active-filters">
        <span class="ui-muted">Mostrando {{ filteredRows.length }} de {{ entries.length }} registro(s)</span>
        <UiButton variant="subtle" size="sm" @click="resetFilters">Limpar filtros</UiButton>
      </div>
    </template>

    <!-- Tabela: loading / empty / error / normal cobertos -->
    <UiCard title="Trilha de auditoria" :subtitle="tableSummary">
      <template #actions>
        <UiStatusBadge v-if="hasActiveFilters" tone="running" status="Filtro ativo" size="sm" />
      </template>

      <UiDataTable
        :columns="columns"
        :rows="pageRows"
        row-key="id"
        density="comfortable"
        :loading="loading"
        :error="tableError"
        server-mode
        :sort="sort"
        :page="page"
        :page-size="pageSize"
        :total="filteredRows.length"
        paginated
        clickable-rows
        :empty="emptyState"
        @retry="reload"
        @update:sort="onSort"
        @update:page="onPage"
        @update:page-size="onPageSize"
        @row-click="openDetail"
      >
        <!-- ID da troca -->
        <template #cell-id="{ value }">
          <span class="au-id ui-mono">#{{ value }}</span>
        </template>

        <!-- Operação -->
        <template #cell-operation="{ value }">
          <span class="au-op">{{ operationLabel(value) }}</span>
        </template>

        <!-- Contexto: produto + pedido -->
        <template #cell-context="{ row }">
          <div class="au-context">
            <span v-if="row.product_id != null" class="au-ctx-chip ui-mono">PROD-{{ row.product_id }}</span>
            <span v-if="row.order_id != null" class="au-ctx-chip ui-mono">PED-{{ row.order_id }}</span>
            <span v-if="row.product_id == null && row.order_id == null" class="au-muted">sem vínculo</span>
          </div>
        </template>

        <!-- Desfecho (OutcomeBadge) -->
        <template #cell-outcome="{ value }">
          <UiStatusBadge :tone="outcomeTone(value)" :status="value" :label="outcomeLabel(value)" />
        </template>

        <!-- Status HTTP -->
        <template #cell-status_code="{ value }">
          <span v-if="value != null" class="au-http" :data-tone="httpTone(value)">{{ value }}</span>
          <span v-else class="au-muted" title="sem resposta HTTP (timeout/rede)">—</span>
        </template>

        <!-- Tentativa -->
        <template #cell-attempt="{ value }">
          <span v-if="value != null" class="au-attempt" :data-warn="value > 1 ? 'true' : null">
            {{ value }}<span v-if="value > 1" class="au-attempt-tag">retry</span>
          </span>
          <span v-else class="au-muted">—</span>
        </template>

        <!-- Duração (DurationCell): valor + mini-barra por bucket (CSP-safe) -->
        <template #cell-duration_ms="{ value }">
          <span v-if="value != null" class="au-dur" :data-tone="durationTone(value)">
            <span class="au-dur-val">{{ formatDuration(value) }}</span>
            <span class="au-dur-bar" aria-hidden="true">
              <span class="au-dur-fill" :data-tone="durationTone(value)" :data-pct="durationBucket(value)" />
            </span>
          </span>
          <span v-else class="au-muted">—</span>
        </template>

        <!-- Erro redigido -->
        <template #cell-error_redacted="{ row }">
          <button
            v-if="row.error_redacted"
            class="au-errlink"
            type="button"
            :title="row.error_redacted"
            @click.stop="openDetail(row)"
          >
            <span class="au-errlink-icon" aria-hidden="true">⚠</span>
            <span class="au-errlink-text">{{ truncate(row.error_redacted, 56) }}</span>
          </button>
          <span v-else class="au-muted">—</span>
        </template>

        <!-- Quando -->
        <template #cell-created_at="{ value }">
          <span class="au-when" :title="absoluteTime(value)">{{ relativeTime(value) }}</span>
        </template>

        <!-- Ação por linha -->
        <template #cell-actions="{ row }">
          <UiButton variant="ghost" size="sm" @click.stop="openDetail(row)">Detalhes</UiButton>
        </template>

        <!-- Estado vazio contextual -->
        <template #empty-action>
          <UiButton v-if="hasActiveFilters" variant="ghost" @click="resetFilters">Limpar filtros</UiButton>
          <UiButton v-else variant="primary" to="/orders">Ver pedidos de reposição</UiButton>
        </template>
      </UiDataTable>
    </UiCard>

    <!-- Atalhos de domínio (só rotas reais do inventário) -->
    <UiCard title="Continuar pelo estoque" subtitle="De onde a auditoria se conecta ao resto da operação.">
      <div class="au-links" role="group" aria-label="Atalhos do domínio de estoque">
        <UiButton variant="ghost" to="/orders">
          <template #icon-left><span aria-hidden="true">🧾</span></template>
          Pedidos de reposição
        </UiButton>
        <UiButton variant="ghost" to="/products">
          <template #icon-left><span aria-hidden="true">📦</span></template>
          Catálogo de produtos
        </UiButton>
        <UiButton variant="ghost" to="/">
          <template #icon-left><span aria-hidden="true">📊</span></template>
          Painel geral
        </UiButton>
      </div>
    </UiCard>

    <template #footer>
      <span>
        Trilha sanitizada conforme REQ-STOCKPILOT-0004: cada tentativa de troca com o fornecedor gera
        um registro com erro redigido — segredos (tokens/API keys) nunca aparecem aqui.
      </span>
    </template>

    <!-- Detalhe de uma troca: registro sanitizado completo -->
    <UiModal v-model:open="detailOpen" :title="detailTitle" width="lg">
      <div v-if="selected" class="au-detail">
        <div class="au-detail-head">
          <UiStatusBadge
            :tone="outcomeTone(selected.outcome)"
            :status="selected.outcome"
            :label="outcomeLabel(selected.outcome)"
            size="lg"
          />
          <span class="au-detail-op">{{ operationLabel(selected.operation) }}</span>
        </div>

        <dl class="au-detail-grid">
          <div class="au-detail-item">
            <dt>ID da troca</dt>
            <dd class="ui-mono">#{{ selected.id }}</dd>
          </div>
          <div class="au-detail-item">
            <dt>Produto</dt>
            <dd class="ui-mono">{{ selected.product_id != null ? 'PROD-' + selected.product_id : '—' }}</dd>
          </div>
          <div class="au-detail-item">
            <dt>Pedido</dt>
            <dd class="ui-mono">{{ selected.order_id != null ? 'PED-' + selected.order_id : '—' }}</dd>
          </div>
          <div class="au-detail-item">
            <dt>Status HTTP</dt>
            <dd>
              <span v-if="selected.status_code != null" class="au-http" :data-tone="httpTone(selected.status_code)">
                {{ selected.status_code }}
              </span>
              <span v-else class="au-muted">— (sem resposta)</span>
            </dd>
          </div>
          <div class="au-detail-item">
            <dt>Tentativa</dt>
            <dd>{{ selected.attempt != null ? selected.attempt : '—' }}</dd>
          </div>
          <div class="au-detail-item">
            <dt>Duração</dt>
            <dd>{{ selected.duration_ms != null ? formatDuration(selected.duration_ms) : '—' }}</dd>
          </div>
          <div class="au-detail-item au-detail-wide">
            <dt>Quando</dt>
            <dd>{{ absoluteTime(selected.created_at) }}</dd>
          </div>
        </dl>

        <div v-if="selected.error_redacted" class="au-error">
          <p class="au-error-title">Erro redigido</p>
          <pre class="au-error-body ui-mono">{{ selected.error_redacted }}</pre>
        </div>

        <div v-if="hasPayload(selected.request_payload)" class="au-payload">
          <p class="au-payload-title">Payload da requisição (sanitizado)</p>
          <pre class="au-payload-body ui-mono">{{ prettyPayload(selected.request_payload) }}</pre>
        </div>

        <div v-if="hasPayload(selected.response_payload)" class="au-payload">
          <p class="au-payload-title">Payload da resposta (sanitizado)</p>
          <pre class="au-payload-body ui-mono">{{ prettyPayload(selected.response_payload) }}</pre>
        </div>

        <p class="au-detail-note">
          <span aria-hidden="true">🔒 </span>
          Payloads e erro são redigidos na gravação — segredos nunca são persistidos nem exibidos.
        </p>
      </div>

      <template #footer>
        <UiButton
          v-if="selected && selected.order_id != null"
          variant="subtle"
          to="/orders"
        >
          Ver pedidos
        </UiButton>
        <UiButton
          v-if="selected && selected.product_id != null"
          variant="subtle"
          to="/products"
        >
          Ver produtos
        </UiButton>
        <UiButton variant="ghost" @click="detailOpen = false">Fechar</UiButton>
      </template>
    </UiModal>
  </UiPageLayout>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import {
  UiPageLayout,
  UiCard,
  UiMetricCard,
  UiDataTable,
  UiStatusBadge,
  UiButton,
  UiModal,
  useToast,
  format,
} from '../ui/index.js';
import * as api from '../api.js';

// ---------------------------------------------------------------------------
// Recurso REAL: GET /v1/audit (api.audit.list — garantido pelo integrador).
// A rota devolve { data: [...] } SEM paginação/ordenação/filtro no servidor —
// então toda a triagem é feita no cliente sobre o conjunto real retornado.
// Resolução DEFENSIVA do fio (fail-closed): se o recurso não existir no
// cliente, a tela mostra um erro de borda em vez de quebrar.
// ---------------------------------------------------------------------------
const auditResource = api.audit || null;
const resourceReady = computed(
  () => !!auditResource && typeof auditResource.list === 'function',
);

const toast = useToast();

// ---- estado da lista -------------------------------------------------------
const entries = ref([]);
const loading = ref(false);
const error = ref(null);

// Erro de borda (página inteira): só quando o recurso nem existe no cliente.
const pageError = computed(() =>
  resourceReady.value
    ? null
    : 'Auditoria indisponível: a API de auditoria não está conectada ao cliente.',
);
// Erro de fetch (recurso existe, mas a chamada falhou) é mostrado DENTRO da tabela com retry.
const tableError = computed(() =>
  resourceReady.value && error.value
    ? (error.value.message || 'Falha ao carregar a trilha de auditoria.')
    : null,
);

async function load() {
  if (!resourceReady.value) return;
  loading.value = true;
  error.value = null;
  try {
    const res = await auditResource.list();
    entries.value = Array.isArray(res) ? res : res.data || res.items || [];
  } catch (e) {
    error.value = e;
    entries.value = [];
  } finally {
    loading.value = false;
  }
}
function reload() {
  load();
}
async function manualRefresh() {
  await load();
  if (!resourceReady.value) return;
  if (!error.value) {
    toast.success('Trilha atualizada', { detail: entries.value.length + ' registro(s) carregado(s).' });
  } else {
    toast.error('Falha ao atualizar a trilha', { detail: error.value && error.value.message });
  }
}

// ---- filtros / busca -------------------------------------------------------
const search = ref('');
const outcomeFilter = ref(''); // '' | 'success' | 'failure'

function setOutcome(value) {
  outcomeFilter.value = outcomeFilter.value === value ? '' : value;
  page.value = 1;
}

const hasActiveFilters = computed(() => !!search.value.trim() || !!outcomeFilter.value);
function resetFilters() {
  search.value = '';
  outcomeFilter.value = '';
  page.value = 1;
}

const filteredRows = computed(() => {
  const q = search.value.trim().toLowerCase();
  return entries.value.filter((e) => {
    if (outcomeFilter.value && String(e.outcome || '').toLowerCase() !== outcomeFilter.value) return false;
    if (!q) return true;
    const hay = [
      operationLabel(e.operation),
      e.product_id != null ? 'prod-' + e.product_id : '',
      e.order_id != null ? 'ped-' + e.order_id : '',
      e.status_code != null ? String(e.status_code) : '',
      '#' + e.id,
      e.error_redacted,
      outcomeLabel(e.outcome),
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    return hay.includes(q);
  });
});

// ---- ordenação (cliente) ---------------------------------------------------
const sort = ref({ key: 'created_at', dir: 'desc' });
function sortValue(row, key) {
  if (key === 'created_at') return new Date(row.created_at || 0).getTime() || 0;
  if (key === 'duration_ms' || key === 'status_code' || key === 'attempt') {
    return row[key] == null ? -1 : Number(row[key]);
  }
  if (key === 'operation') return String(row.operation || '').toLowerCase();
  if (key === 'outcome') return String(row.outcome || '').toLowerCase();
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

// ---- paginação (cliente) ---------------------------------------------------
const page = ref(1);
const pageSize = ref(25);
const pageRows = computed(() => {
  const start = (page.value - 1) * pageSize.value;
  return sortedRows.value.slice(start, start + pageSize.value);
});
function onSort(s) { sort.value = s; page.value = 1; }
function onPage(p) { page.value = p; }
function onPageSize(ps) { pageSize.value = ps; page.value = 1; }

// ---- KPIs (derivados do conjunto real) -------------------------------------
const kpis = computed(() => {
  const all = entries.value || [];
  const success = all.filter((e) => String(e.outcome).toLowerCase() === 'success').length;
  const failure = all.filter((e) => String(e.outcome).toLowerCase() === 'failure').length;
  const retried = all.filter((e) => e.attempt != null && Number(e.attempt) > 1).length;
  const durations = all
    .map((e) => (e.duration_ms == null ? null : Number(e.duration_ms)))
    .filter((d) => d != null && isFinite(d))
    .sort((a, b) => a - b);
  let median = null;
  if (durations.length) {
    const mid = Math.floor(durations.length / 2);
    median = durations.length % 2 ? durations[mid] : Math.round((durations[mid - 1] + durations[mid]) / 2);
  }
  return {
    total: all.length,
    success,
    failure,
    retried,
    medianDurationLabel: median == null ? '—' : formatDuration(median),
  };
});

const successRateLabel = computed(() => {
  const total = kpis.value.total;
  if (!total) return 'sem trocas';
  return Math.round((kpis.value.success / total) * 100) + '% das trocas';
});

const outcomeOptions = computed(() => [
  { value: '', label: 'Todos', tone: 'neutral', count: kpis.value.total },
  { value: 'success', label: 'Sucesso', tone: 'success', count: kpis.value.success },
  { value: 'failure', label: 'Falha', tone: 'error', count: kpis.value.failure },
]);

const tableSummary = computed(() => {
  if (loading.value) return 'Carregando…';
  if (!entries.value.length) return 'Nenhuma troca auditada';
  const shown = filteredRows.value.length;
  return hasActiveFilters.value
    ? shown + ' de ' + entries.value.length + ' registro(s)'
    : entries.value.length + ' troca(s) auditada(s) · mais recentes primeiro';
});

const emptyState = computed(() =>
  hasActiveFilters.value
    ? {
        title: 'Nenhum registro no filtro',
        description: 'Nenhuma troca corresponde à busca/desfecho atuais. Ajuste os critérios ou limpe os filtros.',
        icon: 'search',
      }
    : {
        title: 'Trilha de auditoria vazia',
        description: 'Ainda não há trocas com o fornecedor. Os registros aparecem aqui assim que um pedido de reposição é enviado.',
        icon: 'history',
      },
);

// ---- colunas ---------------------------------------------------------------
const columns = [
  { key: 'id', label: 'Troca' },
  { key: 'operation', label: 'Operação', sortable: true },
  { key: 'context', label: 'Produto / Pedido' },
  { key: 'outcome', label: 'Desfecho', sortable: true },
  { key: 'status_code', label: 'HTTP', sortable: true, align: 'center' },
  { key: 'attempt', label: 'Tentativa', sortable: true, align: 'center' },
  { key: 'duration_ms', label: 'Duração', sortable: true },
  { key: 'error_redacted', label: 'Erro (redigido)' },
  { key: 'created_at', label: 'Quando', sortable: true, align: 'right' },
  { key: 'actions', label: '', align: 'right' },
];

// ---- rótulos / tons (sem mapa de domínio chumbado no kit) ------------------
const OPERATION_LABELS = {
  submeter_pedido: 'Submeter pedido',
  submit_order: 'Submeter pedido',
};
function operationLabel(v) {
  if (!v) return '—';
  return OPERATION_LABELS[String(v)] || format.humanize(v);
}
function outcomeLabel(v) {
  const s = String(v || '').toLowerCase();
  if (s === 'success') return 'Sucesso';
  if (s === 'failure') return 'Falha';
  return format.humanize(v);
}
function outcomeTone(v) {
  const s = String(v || '').toLowerCase();
  if (s === 'success') return 'success';
  if (s === 'failure') return 'error';
  return 'neutral';
}
function httpTone(code) {
  const n = Number(code);
  if (!isFinite(n)) return 'neutral';
  if (n >= 500) return 'error';
  if (n >= 400) return 'warning';
  if (n >= 200 && n < 300) return 'success';
  return 'neutral';
}

// Duração: tons + bucket discreto (CSP-safe, sem style inline) p/ a mini-barra.
function durationTone(ms) {
  const n = Number(ms);
  if (!isFinite(n)) return 'neutral';
  if (n >= 3000) return 'error';
  if (n >= 1000) return 'warning';
  return 'success';
}
function durationBucket(ms) {
  // 0..100 em passos de 10, escala linear ancorada em 5s.
  const n = Math.max(0, Number(ms) || 0);
  const pct = Math.min(100, Math.round((n / 5000) * 100));
  return String(Math.min(100, Math.max(0, Math.round(pct / 10) * 10)));
}
function formatDuration(ms) {
  const n = Number(ms);
  if (!isFinite(n)) return '—';
  if (n < 1000) return Math.round(n) + ' ms';
  if (n < 60000) return (n / 1000).toFixed(n < 10000 ? 2 : 1) + ' s';
  const min = Math.floor(n / 60000);
  const sec = Math.round((n % 60000) / 1000);
  return min + ' min ' + sec + ' s';
}

function truncate(s, n) {
  const str = String(s || '');
  return str.length > n ? str.slice(0, n - 1) + '…' : str;
}

// ---- detalhe (modal) -------------------------------------------------------
const detailOpen = ref(false);
const selected = ref(null);
const detailTitle = computed(() =>
  selected.value ? 'Troca #' + selected.value.id + ' · ' + operationLabel(selected.value.operation) : 'Detalhe da troca',
);
function openDetail(row) {
  selected.value = row;
  detailOpen.value = true;
}

function hasPayload(p) {
  if (p == null) return false;
  if (typeof p === 'string') return p.trim().length > 0;
  if (Array.isArray(p)) return p.length > 0;
  if (typeof p === 'object') return Object.keys(p).length > 0;
  return true;
}
function prettyPayload(p) {
  if (p == null) return '';
  if (typeof p === 'string') {
    try { return JSON.stringify(JSON.parse(p), null, 2); } catch { return p; }
  }
  try { return JSON.stringify(p, null, 2); } catch { return String(p); }
}

// ---- tempo (puro) ----------------------------------------------------------
function relativeTime(value) {
  if (!value) return '—';
  const then = new Date(value).getTime();
  if (!then || isNaN(then)) return '—';
  const diff = Math.round((Date.now() - then) / 1000);
  const abs = Math.abs(diff);
  if (abs < 45) return 'agora mesmo';
  const units = [
    [60, 'min', 60],
    [3600, 'h', 3600],
    [86400, 'd', 86400],
    [2592000, 'sem', 604800],
    [Infinity, 'mês', 2592000],
  ];
  for (const [limit, label, div] of units) {
    if (abs < limit) {
      const nn = Math.max(1, Math.round(abs / div));
      return nn + ' ' + label + ' atrás';
    }
  }
  return '—';
}
function absoluteTime(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (isNaN(d.getTime())) return String(value);
  try {
    return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium', timeStyle: 'medium' }).format(d);
  } catch {
    return d.toISOString();
  }
}

// ---- exportar CSV (cliente, sobre o conjunto filtrado; CSP-safe via Blob) ---
function csvCell(v) {
  const s = v == null ? '' : String(v);
  return /[",\n;]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
function exportCsv() {
  const rows = filteredRows.value;
  if (!rows.length) {
    toast.warning('Nada para exportar.');
    return;
  }
  const head = ['ID', 'Operacao', 'Produto', 'Pedido', 'Desfecho', 'HTTP', 'Tentativa', 'Duracao (ms)', 'Erro (redigido)', 'Quando'];
  const lines = [head.join(';')];
  for (const e of rows) {
    lines.push(
      [
        csvCell(e.id),
        csvCell(operationLabel(e.operation)),
        csvCell(e.product_id),
        csvCell(e.order_id),
        csvCell(outcomeLabel(e.outcome)),
        csvCell(e.status_code),
        csvCell(e.attempt),
        csvCell(e.duration_ms),
        csvCell(e.error_redacted),
        csvCell(e.created_at),
      ].join(';'),
    );
  }
  try {
    const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'auditoria-fornecedor-' + new Date().toISOString().slice(0, 10) + '.csv';
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    toast.success('CSV exportado (' + rows.length + ' registro(s)).');
  } catch (e) {
    toast.error('Falha ao exportar CSV', { detail: e && e.message });
  }
}

onMounted(reload);
</script>

<style scoped>
/* ---- Banner (KPIs + destaque) ---- */
.au-banner { display: flex; flex-direction: column; gap: var(--ui-space-3); }

.au-kpis {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: var(--ui-space-4);
}

/* Destaque de falhas: marca StockPilot (faixa de atenção) */
.au-spotlight {
  display: flex;
  align-items: center;
  gap: var(--ui-space-3);
  padding: 10px var(--ui-space-4);
  border-radius: var(--ui-radius-lg);
  background: rgb(var(--ui-danger) / 0.08);
  border: 1px solid rgb(var(--ui-danger) / 0.28);
}
.au-spotlight-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border-radius: var(--ui-radius-pill);
  background: rgb(var(--ui-danger) / 0.16);
  color: rgb(var(--ui-danger));
  flex-shrink: 0;
}
.au-spotlight-text { flex: 1 1 auto; font-size: var(--ui-text-sm); color: rgb(var(--ui-fg)); }
.au-spotlight-text strong { color: rgb(var(--ui-danger)); font-variant-numeric: tabular-nums; }

/* ---- Toolbar (busca + chips) ---- */
.au-toolbar {
  display: flex;
  align-items: center;
  gap: var(--ui-space-4);
  flex-wrap: wrap;
}
.au-search {
  position: relative;
  display: flex;
  align-items: center;
  flex: 1 1 320px;
  min-width: 240px;
}
.au-search-icon {
  position: absolute;
  left: 12px;
  color: rgb(var(--ui-muted));
  font-size: 1.05rem;
  pointer-events: none;
}
.au-search-input {
  width: 100%;
  font: inherit;
  color: rgb(var(--ui-fg));
  background: rgb(var(--ui-surface));
  border: 1px solid rgb(var(--ui-border-strong));
  border-radius: var(--ui-radius-md);
  padding: 9px 34px;
}
.au-search-input::placeholder { color: rgb(var(--ui-faint)); }
.au-search-input:focus { border-color: rgb(var(--ui-accent)); outline: none; }
.au-search-clear {
  position: absolute;
  right: 8px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border: none;
  border-radius: var(--ui-radius-pill);
  background: rgb(var(--ui-surface-2));
  color: rgb(var(--ui-muted));
  cursor: pointer;
  font-size: var(--ui-text-xs);
}
.au-search-clear:hover { background: rgb(var(--ui-border)); color: rgb(var(--ui-fg)); }
.au-search-clear:focus-visible { outline: 2px solid rgb(var(--ui-accent)); outline-offset: 2px; }

.au-chip-group { display: flex; align-items: center; gap: var(--ui-space-2); flex-wrap: wrap; }
.au-chip-legend {
  font-size: var(--ui-text-xs);
  font-weight: 600;
  color: rgb(var(--ui-muted));
  text-transform: uppercase;
  letter-spacing: .04em;
}
.au-chip {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  font: inherit;
  font-size: var(--ui-text-xs);
  font-weight: 600;
  color: rgb(var(--ui-muted));
  background: rgb(var(--ui-surface));
  border: 1px solid rgb(var(--ui-border-strong));
  border-radius: var(--ui-radius-pill);
  padding: 5px 12px;
  cursor: pointer;
  transition: background .15s ease, border-color .15s ease, color .15s ease;
}
.au-chip:hover { border-color: rgb(var(--ui-accent)); color: rgb(var(--ui-fg)); }
.au-chip:focus-visible { outline: 2px solid rgb(var(--ui-accent)); outline-offset: 2px; }
.au-chip[data-active="true"] {
  background: rgb(var(--ui-accent) / 0.12);
  border-color: rgb(var(--ui-accent));
  color: rgb(var(--ui-accent-strong));
}
.au-chip-dot { width: 7px; height: 7px; border-radius: 50%; background: rgb(var(--ui-faint)); }
.au-chip[data-tone="success"] .au-chip-dot { background: rgb(var(--ui-ok)); }
.au-chip[data-tone="error"] .au-chip-dot { background: rgb(var(--ui-danger)); }
.au-chip[data-tone="neutral"] .au-chip-dot { background: rgb(var(--ui-faint)); }
.au-chip-count {
  background: rgb(var(--ui-surface-2));
  color: rgb(var(--ui-muted));
  border-radius: var(--ui-radius-pill);
  padding: 0 6px;
  font-size: 10px;
  min-width: 16px;
  text-align: center;
  font-variant-numeric: tabular-nums;
}
.au-chip[data-active="true"] .au-chip-count {
  background: rgb(var(--ui-accent) / 0.2);
  color: rgb(var(--ui-accent-strong));
}

.au-active-filters {
  display: flex;
  align-items: center;
  gap: var(--ui-space-3);
  font-size: var(--ui-text-sm);
  margin-top: var(--ui-space-3);
}

/* ---- Células ---- */
.au-id { color: rgb(var(--ui-muted)); font-weight: 600; }
.au-op { font-weight: 600; color: rgb(var(--ui-fg)); }

.au-context { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.au-ctx-chip {
  display: inline-flex;
  align-items: center;
  font-size: var(--ui-text-xs);
  font-weight: 600;
  color: rgb(var(--ui-muted));
  background: rgb(var(--ui-surface-2));
  border: 1px solid rgb(var(--ui-border));
  border-radius: var(--ui-radius-sm);
  padding: 2px 7px;
}
.au-muted { color: rgb(var(--ui-faint)); font-size: var(--ui-text-sm); font-style: italic; }

.au-http {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 38px;
  padding: 2px 8px;
  border-radius: var(--ui-radius-sm);
  font-weight: 700;
  font-size: var(--ui-text-xs);
  font-variant-numeric: tabular-nums;
  background: rgb(var(--ui-muted) / 0.14);
  color: rgb(var(--ui-muted));
}
.au-http[data-tone="success"] { background: rgb(var(--ui-ok) / 0.16); color: rgb(var(--ui-ok)); }
.au-http[data-tone="warning"] { background: rgb(var(--ui-warn) / 0.18); color: rgb(var(--ui-warn)); }
.au-http[data-tone="error"] { background: rgb(var(--ui-danger) / 0.16); color: rgb(var(--ui-danger)); }

.au-attempt {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  color: rgb(var(--ui-fg));
}
.au-attempt[data-warn="true"] { color: rgb(var(--ui-warn)); }
.au-attempt-tag {
  font-size: 9px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: .04em;
  color: rgb(var(--ui-warn));
  background: rgb(var(--ui-warn) / 0.16);
  border-radius: var(--ui-radius-sm);
  padding: 1px 5px;
}

/* Duração (DurationCell): valor + mini-barra por bucket */
.au-dur { display: inline-flex; flex-direction: column; gap: 3px; min-width: 92px; }
.au-dur-val { font-weight: 600; font-variant-numeric: tabular-nums; color: rgb(var(--ui-fg)); }
.au-dur[data-tone="warning"] .au-dur-val { color: rgb(var(--ui-warn)); }
.au-dur[data-tone="error"] .au-dur-val { color: rgb(var(--ui-danger)); }
.au-dur-bar {
  position: relative;
  height: 4px;
  width: 100%;
  background: rgb(var(--ui-surface-2));
  border-radius: var(--ui-radius-pill);
  overflow: hidden;
}
.au-dur-fill {
  position: absolute;
  inset: 0 auto 0 0;
  height: 100%;
  border-radius: var(--ui-radius-pill);
  background: rgb(var(--ui-ok));
}
.au-dur-fill[data-tone="warning"] { background: rgb(var(--ui-warn)); }
.au-dur-fill[data-tone="error"] { background: rgb(var(--ui-danger)); }
.au-dur-fill[data-pct="0"] { width: 4%; }
.au-dur-fill[data-pct="10"] { width: 10%; }
.au-dur-fill[data-pct="20"] { width: 20%; }
.au-dur-fill[data-pct="30"] { width: 30%; }
.au-dur-fill[data-pct="40"] { width: 40%; }
.au-dur-fill[data-pct="50"] { width: 50%; }
.au-dur-fill[data-pct="60"] { width: 60%; }
.au-dur-fill[data-pct="70"] { width: 70%; }
.au-dur-fill[data-pct="80"] { width: 80%; }
.au-dur-fill[data-pct="90"] { width: 90%; }
.au-dur-fill[data-pct="100"] { width: 100%; }

.au-errlink {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  max-width: 100%;
  font: inherit;
  font-size: var(--ui-text-sm);
  color: rgb(var(--ui-danger));
  background: none;
  border: none;
  padding: 0;
  cursor: pointer;
  text-align: left;
}
.au-errlink:hover .au-errlink-text { text-decoration: underline; }
.au-errlink:focus-visible { outline: 2px solid rgb(var(--ui-accent)); outline-offset: 2px; border-radius: var(--ui-radius-sm); }
.au-errlink-icon { flex-shrink: 0; }
.au-errlink-text { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.au-when { font-size: var(--ui-text-sm); color: rgb(var(--ui-muted)); white-space: nowrap; }

/* ---- Atalhos de domínio ---- */
.au-links { display: flex; flex-wrap: wrap; gap: var(--ui-space-3); }

/* ---- Detalhe (modal) ---- */
.au-detail { display: flex; flex-direction: column; gap: var(--ui-space-4); }
.au-detail-head { display: flex; align-items: center; gap: var(--ui-space-3); flex-wrap: wrap; }
.au-detail-op { font-weight: 600; color: rgb(var(--ui-fg)); font-family: var(--ui-font-display); }
.au-detail-grid {
  margin: 0;
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: var(--ui-space-3) var(--ui-space-4);
}
.au-detail-item.au-detail-wide { grid-column: 1 / -1; }
.au-detail-item dt {
  color: rgb(var(--ui-muted));
  font-size: var(--ui-text-xs);
  text-transform: uppercase;
  letter-spacing: .04em;
  margin-bottom: 2px;
}
.au-detail-item dd { margin: 0; color: rgb(var(--ui-fg)); font-size: var(--ui-text-sm); }

.au-error {
  background: rgb(var(--ui-danger) / 0.08);
  border: 1px solid rgb(var(--ui-danger) / 0.3);
  border-radius: var(--ui-radius-md);
  padding: var(--ui-space-3) var(--ui-space-4);
}
.au-error-title { margin: 0 0 6px; font-weight: 700; font-size: var(--ui-text-sm); color: rgb(var(--ui-danger)); }
.au-error-body {
  margin: 0;
  font-size: var(--ui-text-sm);
  color: rgb(var(--ui-fg));
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 200px;
  overflow: auto;
}

.au-payload {
  background: rgb(var(--ui-surface-2));
  border: 1px solid rgb(var(--ui-border));
  border-radius: var(--ui-radius-md);
  padding: var(--ui-space-3) var(--ui-space-4);
}
.au-payload-title {
  margin: 0 0 6px;
  font-size: var(--ui-text-xs);
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: .04em;
  color: rgb(var(--ui-muted));
}
.au-payload-body {
  margin: 0;
  font-size: var(--ui-text-xs);
  color: rgb(var(--ui-fg));
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 240px;
  overflow: auto;
}
.au-detail-note { margin: 0; font-size: var(--ui-text-sm); color: rgb(var(--ui-muted)); }

/* ---- Responsivo ---- */
@media (max-width: 1080px) {
  .au-kpis { grid-template-columns: repeat(2, 1fr); }
}
@media (max-width: 860px) {
  .au-toolbar { flex-direction: column; align-items: stretch; }
  .au-detail-grid { grid-template-columns: 1fr 1fr; }
}
@media (max-width: 560px) {
  .au-kpis { grid-template-columns: 1fr; }
  .au-detail-grid { grid-template-columns: 1fr; }
  .au-spotlight { flex-wrap: wrap; }
}
</style>
