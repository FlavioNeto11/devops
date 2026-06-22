<template>
  <UiPageLayout
    eyebrow="Operação · Infraestrutura"
    title="Fila de Processamento"
    subtitle="Monitor da fila transacional: jobs por status, tentativas, chave de idempotência e último erro. Filtre por status/tipo e acompanhe ao vivo."
    width="wide"
    :error="listError"
    @retry="reloadAll"
  >
    <!-- ===== Ações do cabeçalho ===== -->
    <template #actions>
      <button
        type="button"
        class="jm-live"
        :data-on="live ? 'true' : 'false'"
        :aria-pressed="live ? 'true' : 'false'"
        :aria-label="live ? 'Atualização ao vivo ligada. Clique para pausar.' : 'Atualização ao vivo pausada. Clique para retomar.'"
        @click="toggleLive"
      >
        <span class="jm-live-dot" aria-hidden="true" />
        {{ live ? 'Ao vivo' : 'Pausado' }}
      </button>
      <UiButton variant="ghost" :loading="r.loading.value || healthLoading" @click="reloadAll">
        <template #icon-left><span class="jm-ico" aria-hidden="true">↻</span></template>
        Atualizar
      </UiButton>
      <UiButton variant="subtle" to="/observability">Observabilidade</UiButton>
    </template>

    <!-- ===== Banner: alerta de DLQ (jobs mortos exigem ação manual) ===== -->
    <template v-if="dlqCount > 0" #banner>
      <div class="jm-banner" role="alert">
        <span class="jm-banner-ico" aria-hidden="true">!</span>
        <span class="jm-banner-text">
          <strong>{{ dlqCount }}</strong> job(s) na fila morta (DLQ) — esgotaram as tentativas e
          aguardam reprocessamento manual.
        </span>
        <UiButton variant="ghost" size="sm" @click="quickStatus('dlq')">Ver fila morta</UiButton>
      </div>
    </template>

    <!-- ===== QueueDepthWidget: profundidade da fila por status ===== -->
    <section class="jm-depth" aria-label="Profundidade da fila por status">
      <UiMetricCard
        v-for="s in STATUS_ORDER"
        :key="s.value"
        :label="s.label"
        :value="depthDisplay(s.value)"
        :tone="s.tone"
        :hint="s.hint"
        :loading="healthLoading && depth[s.value] == null"
        clickable
        @click="quickStatus(s.value)"
      />
    </section>

    <!-- ===== Resumo agregado de saúde da fila ===== -->
    <div class="jm-summary" :data-state="healthState" role="status">
      <span class="jm-summary-dot" aria-hidden="true" />
      <span class="jm-summary-text">{{ healthSummary }}</span>
      <span class="jm-summary-source">· {{ depthSourceLabel }}</span>
      <span v-if="lastSyncLabel" class="jm-summary-sync">· {{ lastSyncLabel }}</span>
    </div>

    <!-- ===== FilterBar ===== -->
    <template #filters>
      <UiFiltersPanel
        v-model="filters"
        :fields="filterFields"
        @apply="applyFilters"
        @clear="onClear"
      />
    </template>

    <!-- ===== Chips de atalho por status (texto + contagem; cor nunca é o único sinal) ===== -->
    <div class="jm-chips" role="group" aria-label="Filtro rápido por status">
      <button
        type="button"
        class="jm-chip"
        :data-active="filters.status === '' ? 'true' : null"
        :aria-pressed="filters.status === '' ? 'true' : 'false'"
        @click="quickStatus('')"
      >
        Todos
        <span class="jm-chip-n">{{ totalDepth ?? '·' }}</span>
      </button>
      <button
        v-for="s in STATUS_ORDER"
        :key="'chip-' + s.value"
        type="button"
        class="jm-chip"
        :data-tone="s.tone"
        :data-active="filters.status === s.value ? 'true' : null"
        :aria-pressed="filters.status === s.value ? 'true' : 'false'"
        @click="quickStatus(s.value)"
      >
        {{ s.label }}
        <span class="jm-chip-n">{{ depth[s.value] ?? '·' }}</span>
      </button>
      <span class="jm-chips-spacer" />
      <button
        type="button"
        class="jm-density"
        :aria-pressed="density === 'compact' ? 'true' : 'false'"
        @click="toggleDensity"
      >
        {{ density === 'compact' ? 'Densidade confortável' : 'Densidade compacta' }}
      </button>
    </div>

    <!-- ===== Aviso de filtros ativos ===== -->
    <div v-if="hasActiveFilter" class="jm-active" role="status">
      <span class="jm-active-text">
        {{ activeFilterCount }} filtro(s) aplicado(s) — exibindo {{ r.total.value || 0 }} job(s).
      </span>
      <UiButton variant="subtle" size="sm" @click="onClear">Limpar filtros</UiButton>
    </div>

    <!-- ===== DataTable ===== -->
    <UiDataTable
      :columns="columns"
      :rows="r.items.value"
      :loading="r.loading.value"
      row-key="id"
      :density="density"
      clickable-rows
      server-mode
      :sort="r.sort.value"
      :page="r.page.value"
      :page-size="r.pageSize.value"
      :total="r.total.value"
      paginated
      :empty="emptyState"
      @row-click="openQuickView"
      @update:sort="r.setSort"
      @update:page="r.setPage"
      @update:pageSize="onPageSize"
      @retry="r.load"
    >
      <!-- Job (id mono) -->
      <template #cell-id="{ value }">
        <span class="jm-mono jm-id">#{{ value }}</span>
      </template>

      <!-- Tipo + worker que detém o lock -->
      <template #cell-type="{ row }">
        <span class="jm-type">
          <span class="jm-type-name">{{ row.type || '—' }}</span>
          <span v-if="row.locked_by" class="jm-type-worker" :title="'Worker: ' + row.locked_by">
            <span class="jm-type-worker-ico" aria-hidden="true">⚙</span>{{ row.locked_by }}
          </span>
        </span>
      </template>

      <!-- Status -->
      <template #cell-status="{ value }">
        <UiStatusBadge :status="value" :tone="statusTone(value)" :label="statusLabel(value)" with-dot />
      </template>

      <!-- Tentativas: n/max + barra de progresso (estado por data-attr, sem style inline) -->
      <template #cell-attempts="{ row }">
        <span class="jm-attempts" :data-state="attemptsState(row)">
          <span class="jm-attempts-n">
            {{ row.attempts ?? 0 }}<span class="jm-attempts-sep">/</span>{{ row.max_attempts ?? '—' }}
          </span>
          <span class="jm-attempts-bar" :data-fill="attemptsFill(row)" aria-hidden="true">
            <span class="jm-attempts-fill" />
          </span>
        </span>
      </template>

      <!-- Chave de idempotência -->
      <template #cell-job_key="{ value }">
        <span v-if="value" class="jm-key" :title="value">
          <span class="jm-key-ico" aria-hidden="true">⚿</span>
          <span class="jm-mono jm-key-text">{{ value }}</span>
        </span>
        <span v-else class="jm-dash">sem chave</span>
      </template>

      <!-- Último erro (truncado; clique abre o detalhe rápido) -->
      <template #cell-last_error="{ row }">
        <button
          v-if="row.last_error"
          type="button"
          class="jm-error"
          :title="row.last_error"
          @click.stop="openQuickView(row)"
        >
          <span class="jm-error-ico" aria-hidden="true">⚠</span>
          <span class="jm-error-text">{{ truncate(row.last_error, 70) }}</span>
        </button>
        <span v-else class="jm-dash">—</span>
      </template>

      <!-- Executar após (agendamento futuro destacado) -->
      <template #cell-run_after="{ value }">
        <span class="jm-when" :data-future="isFuture(value) ? 'true' : null">
          {{ value ? formatDateTime(value) : '—' }}
          <span v-if="isFuture(value)" class="jm-when-tag">agendado</span>
        </span>
      </template>

      <!-- Criado em -->
      <template #cell-created_at="{ value }">
        <span class="jm-dim">{{ value ? formatDateTime(value) : '—' }}</span>
      </template>

      <!-- Ações por linha -->
      <template #cell-actions="{ row }">
        <span class="jm-rowactions" @click.stop>
          <UiButton variant="subtle" size="sm" @click="openQuickView(row)">Detalhes</UiButton>
          <UiButton
            v-if="canRequeue(row)"
            variant="ghost"
            size="sm"
            :loading="busyId === row.id"
            @click="requeue(row)"
          >Reenfileirar</UiButton>
        </span>
      </template>

      <template #empty-action>
        <div class="jm-empty-actions">
          <UiButton v-if="hasActiveFilter" variant="ghost" @click="onClear">Limpar filtros</UiButton>
          <UiButton v-else variant="ghost" to="/observability">Ver observabilidade</UiButton>
        </div>
      </template>
    </UiDataTable>

    <template #footer>
      <span>{{ footerSummary }}</span>
    </template>

    <!-- ===== Modal: detalhe rápido do job ===== -->
    <UiModal v-model="detailOpen" :title="detailTitle" width="lg">
      <div v-if="current" class="jm-detail">
        <header class="jm-detail-head">
          <UiStatusBadge
            :status="current.status"
            :tone="statusTone(current.status)"
            :label="statusLabel(current.status)"
            size="lg"
            with-dot
          />
          <span class="jm-detail-type">{{ current.type || 'job' }}</span>
          <span class="jm-mono jm-detail-id">#{{ current.id }}</span>
        </header>

        <dl class="jm-dl">
          <div class="jm-dl-row">
            <dt>Tentativas</dt>
            <dd>
              <span class="jm-attempts-inline" :data-state="attemptsState(current)">
                {{ current.attempts ?? 0 }} de {{ current.max_attempts ?? '—' }}
              </span>
            </dd>
          </div>
          <div class="jm-dl-row">
            <dt>Chave de idempotência</dt>
            <dd class="jm-mono jm-dl-wrap">{{ current.job_key || '—' }}</dd>
          </div>
          <div class="jm-dl-row">
            <dt>Worker</dt>
            <dd>{{ current.locked_by || 'Nenhum' }}</dd>
          </div>
          <div class="jm-dl-row">
            <dt>Bloqueado em</dt>
            <dd>{{ current.locked_at ? formatDateTime(current.locked_at) : '—' }}</dd>
          </div>
          <div class="jm-dl-row">
            <dt>Executar após</dt>
            <dd>{{ current.run_after ? formatDateTime(current.run_after) : '—' }}</dd>
          </div>
          <div class="jm-dl-row">
            <dt>Criado em</dt>
            <dd>{{ current.created_at ? formatDateTime(current.created_at) : '—' }}</dd>
          </div>
          <div class="jm-dl-row">
            <dt>Atualizado em</dt>
            <dd>{{ current.updated_at ? formatDateTime(current.updated_at) : '—' }}</dd>
          </div>
        </dl>

        <div v-if="current.last_error" class="jm-errblock">
          <p class="jm-errblock-title">
            <span class="jm-error-ico" aria-hidden="true">⚠</span> Último erro
          </p>
          <pre class="jm-errblock-pre">{{ current.last_error }}</pre>
        </div>
        <p v-else class="jm-noerr">Nenhum erro registrado para este job.</p>
      </div>

      <template #footer>
        <UiButton variant="ghost" @click="detailOpen = false">Fechar</UiButton>
        <UiButton v-if="current" variant="subtle" :to="'/jobs/' + current.id">Abrir página do job</UiButton>
        <UiButton
          v-if="current && canRequeue(current)"
          variant="primary"
          :loading="busyId === (current && current.id)"
          @click="requeue(current)"
        >Reenfileirar job</UiButton>
      </template>
    </UiModal>
  </UiPageLayout>
</template>

<script setup>
import { ref, reactive, computed, onMounted, onUnmounted } from 'vue';
import {
  UiPageLayout,
  UiDataTable,
  UiButton,
  UiMetricCard,
  UiStatusBadge,
  UiFiltersPanel,
  UiModal,
  useResource,
  useToast,
  useConfirm,
  format,
} from '../ui/index.js';
import * as api from '../api.js';

const toast = useToast();
const ask = useConfirm();
const formatDateTime = format.formatDateTime;

// Recursos de domínio resolvidos de forma DEFENSIVA — não dependemos de augmentação
// implícita do api.js. Se o símbolo existir, usamos; senão, derivamos do factory/rota
// canônica. Nunca chamamos `undefined.list(...)` (que travaria a tela).
const jobsApi = api.jobs || api.resourceFactory('jobs');
const jobsHealthApi = api.jobsHealth || api.healthJobs || null;
const hasFn = (obj, name) => obj && typeof obj[name] === 'function';

// ----- domínio: status da fila transacional (rótulo + tom SEMPRE explícitos) -----
// Os 4 status canônicos do enum (queued/running/done/dlq). O tom é fixado aqui e não
// depende do auto-tom por palavra-chave; o rótulo acompanha sempre a cor (a11y).
const STATUS_ORDER = [
  { value: 'queued', label: 'Na fila', tone: 'running', hint: 'Aguardando processamento' },
  { value: 'running', label: 'Em execução', tone: 'primary', hint: 'Sendo processados agora' },
  { value: 'done', label: 'Concluídos', tone: 'success', hint: 'Finalizados com sucesso' },
  { value: 'dlq', label: 'Fila morta', tone: 'error', hint: 'Esgotaram as tentativas' },
];
const STATUS_MAP = STATUS_ORDER.reduce((acc, s) => { acc[s.value] = s; return acc; }, {});
const statusTone = (v) => (STATUS_MAP[String(v)] ? STATUS_MAP[String(v)].tone : 'neutral');
const statusLabel = (v) => (STATUS_MAP[String(v)] ? STATUS_MAP[String(v)].label : format.humanize(v));

// ----- colunas (label = rótulo do campo da entidade) -----
const columns = [
  { key: 'id', label: 'Job', sortable: true },
  { key: 'type', label: 'Tipo', sortable: true },
  { key: 'status', label: 'Status', sortable: true },
  { key: 'attempts', label: 'Tentativas', align: 'center', sortable: true },
  { key: 'job_key', label: 'Chave idempotência' },
  { key: 'last_error', label: 'Último erro' },
  { key: 'run_after', label: 'Executar após', sortable: true },
  { key: 'created_at', label: 'Criado em', sortable: true, align: 'right' },
  { key: 'actions', label: '', align: 'right' },
];

// ----- filtros (espelham os params aceitos por GET /v1/jobs: q/status/type) -----
const filterFields = [
  { key: 'q', label: 'Buscar', type: 'text', placeholder: 'tipo, chave ou #id' },
  { key: 'status', label: 'Status', type: 'select', options: STATUS_ORDER.map((s) => ({ value: s.value, label: s.label })) },
  { key: 'type', label: 'Tipo', type: 'text', placeholder: 'ex.: send_email' },
];
const EMPTY_FILTERS = { q: '', status: '', type: '' };
const filters = ref({ ...EMPTY_FILTERS });
const activeFilterCount = computed(
  () => Object.values(filters.value).filter((v) => v !== '' && v != null).length,
);
const hasActiveFilter = computed(() => activeFilterCount.value > 0);

// ----- recurso (server-mode) — GET /v1/jobs -----
const r = useResource(jobsApi, { pageSize: 25, sort: { key: 'id', dir: 'desc' } });
// O erro de CARGA da lista é o que bloqueia a tela (PageLayout :error + @retry).
// Falha apenas na profundidade (health) degrada graciosamente, sem derrubar a tela.
const listError = computed(() => {
  const e = r.error.value;
  if (!e) return null;
  return (e && e.message) || 'Não foi possível carregar a fila de processamento.';
});

// ----- profundidade da fila (QueueDepthWidget) — GET /v1/health/jobs -----
const depth = reactive({ queued: null, running: null, done: null, dlq: null });
const healthLoading = ref(false);
const healthError = ref(null);
const depthSource = ref('—'); // 'health' (endpoint) | 'page' (derivado da página) | 'erro'
const lastSync = ref(null);

async function loadDepth() {
  // Caminho canônico: GET /v1/health/jobs -> { status, jobs: { queued, running, done, dlq } }.
  // Sem o endpoint, derivamos da página já carregada (fail-soft) — NUNCA inventamos rota.
  if (!jobsHealthApi) { deriveDepthFromItems(); return; }
  healthLoading.value = true;
  healthError.value = null;
  try {
    const res = await jobsHealthApi();
    const payload = (res && res.data && (res.data.jobs || res.data.counts)) ? res.data : res;
    const counts = (payload && (payload.jobs || payload.counts)) || {};
    for (const s of STATUS_ORDER) depth[s.value] = Number(counts[s.value] || 0);
    depthSource.value = 'health';
    lastSync.value = Date.now();
  } catch (e) {
    healthError.value = e;
    deriveDepthFromItems('erro'); // fallback resiliente: estima pela página atual
  } finally {
    healthLoading.value = false;
  }
}

// Aproximação local quando não há endpoint de saúde (ou ele falhou): conta os status
// da página atual. Marca a fonte para o operador saber que o número é parcial.
function deriveDepthFromItems(source) {
  const rows = r.items.value || [];
  for (const s of STATUS_ORDER) depth[s.value] = rows.filter((j) => j.status === s.value).length;
  depthSource.value = source || 'page';
  lastSync.value = Date.now();
}

const depthSourceLabel = computed(() => {
  if (depthSource.value === 'health') return 'profundidade ao vivo do servidor';
  if (depthSource.value === 'erro') return 'estimativa pela página (saúde indisponível)';
  if (depthSource.value === 'page') return 'estimativa pela página atual';
  return 'medindo profundidade…';
});

const dlqCount = computed(() => Number(depth.dlq) || 0);
const totalDepth = computed(() => {
  const vals = STATUS_ORDER.map((s) => depth[s.value]);
  if (vals.some((v) => v == null)) return null;
  return vals.reduce((acc, v) => acc + (Number(v) || 0), 0);
});
const depthDisplay = (key) => (depth[key] == null ? '—' : depth[key]);

const healthState = computed(() => {
  if (depthSource.value === 'erro') return 'warn';
  if (dlqCount.value > 0) return 'warn';
  return 'ok';
});
const healthSummary = computed(() => {
  if (depthSource.value === 'erro') return 'Profundidade estimada — endpoint de saúde indisponível.';
  if (dlqCount.value > 0) return dlqCount.value + ' job(s) na fila morta exigem atenção.';
  const backlog = (Number(depth.queued) || 0) + (Number(depth.running) || 0);
  if (totalDepth.value === 0) return 'Fila vazia — nenhum job pendente de processamento.';
  if (backlog === 0) return 'Sem backlog — nada aguardando processamento agora.';
  return backlog + ' job(s) em andamento na fila transacional.';
});

// ----- ações de filtro -----
function applyFilters() {
  r.setFilters({ ...filters.value });
}
function quickStatus(status) {
  filters.value = { ...filters.value, status };
  applyFilters();
}
function onClear() {
  filters.value = { ...EMPTY_FILTERS };
  applyFilters();
}
function onPageSize(size) {
  r.pageSize.value = size;
  r.setPage(1);
}

// ----- densidade da tabela -----
const density = ref('comfortable');
function toggleDensity() {
  density.value = density.value === 'compact' ? 'comfortable' : 'compact';
}

// ----- detalhe rápido (modal) -----
const detailOpen = ref(false);
const current = ref(null);
const detailTitle = computed(() => (current.value ? 'Job #' + current.value.id : 'Detalhes do job'));
function openQuickView(row) {
  current.value = row;
  detailOpen.value = true;
}

// ----- reenfileirar (recuperação de DLQ / pendente) — confirmado + toast -----
const busyId = ref(null);
function canRequeue(row) {
  return !!row && (row.status === 'dlq' || row.status === 'queued');
}
async function requeue(row) {
  if (!row || busyId.value) return;
  const ok = await ask({
    title: 'Reenfileirar job',
    message:
      'Reenfileirar o job #' + row.id + ' (' + (row.type || 'job') + ')? ' +
      'Ele volta para a fila, com tentativas e agendamento zerados. A chave de idempotência ' +
      'continua impedindo duplicidade.',
    confirmLabel: 'Reenfileirar',
    danger: row.status === 'dlq',
  });
  if (!ok) return;
  if (!hasFn(jobsApi, 'requeue')) {
    toast.error('Reenfileiramento indisponível neste ambiente.');
    return;
  }
  busyId.value = row.id;
  try {
    // Ação de domínio idempotente: POST /v1/jobs/{id}/requeue.
    await jobsApi.requeue(row.id);
    toast.success('Job #' + row.id + ' reenfileirado.');
    detailOpen.value = false;
    await reloadAll();
  } catch (e) {
    toast.error('Não foi possível reenfileirar o job.', { detail: e && e.message, code: e && e.status });
  } finally {
    busyId.value = null;
  }
}

// ----- atualização em conjunto (lista + profundidade) -----
async function reloadAll() {
  // A profundidade roda em paralelo e não derruba a tela se falhar (fail-soft).
  await Promise.all([r.load(), loadDepth()]);
  // Se NÃO há endpoint de saúde, a estimativa precisa da página recém-carregada.
  if (!jobsHealthApi) deriveDepthFromItems();
}

// ----- atualização ao vivo (polling fail-soft; respeita aba oculta) -----
const live = ref(true);
let timer = null;
const POLL_MS = 8000;
function startPolling() {
  stopPolling();
  timer = setInterval(() => {
    if (live.value && typeof document !== 'undefined' && !document.hidden) {
      loadDepth();
      if (!r.loading.value) r.load().then(() => { if (!jobsHealthApi) deriveDepthFromItems(); });
    }
  }, POLL_MS);
}
function stopPolling() {
  if (timer) { clearInterval(timer); timer = null; }
}
function toggleLive() {
  live.value = !live.value;
  if (live.value) reloadAll();
  toast.info(live.value ? 'Atualização ao vivo ligada.' : 'Atualização ao vivo pausada.');
}

// ----- relógio leve p/ rótulo "atualizado há …" e detecção de agendamento futuro -----
const nowTs = ref(Date.now());
let clock = null;
const lastSyncLabel = computed(() => {
  if (!lastSync.value) return '';
  const secs = Math.max(0, Math.round((nowTs.value - lastSync.value) / 1000));
  if (secs < 5) return 'atualizado agora';
  if (secs < 60) return 'atualizado há ' + secs + 's';
  const mins = Math.floor(secs / 60);
  return 'atualizado há ' + mins + 'min';
});

// ----- helpers de célula -----
function truncate(s, n) {
  const str = String(s || '');
  return str.length > n ? str.slice(0, n).trimEnd() + '…' : str;
}
function isFuture(value) {
  if (!value) return false;
  const t = new Date(value).getTime();
  return !isNaN(t) && t > nowTs.value;
}
function attemptsFill(row) {
  const max = Number(row.max_attempts) || 0;
  const n = Number(row.attempts) || 0;
  if (max <= 0) return '0';
  const pct = Math.min(100, Math.round((n / max) * 100));
  // Discretiza em passos de 10 p/ data-attr (CSS-safe; sem style/width inline).
  return String(Math.round(pct / 10) * 10);
}
function attemptsState(row) {
  if (!row) return 'none';
  const max = Number(row.max_attempts) || 0;
  const n = Number(row.attempts) || 0;
  if (row.status === 'dlq') return 'exhausted';
  if (max > 0 && n >= max) return 'exhausted';
  if (max > 0 && n >= max - 1) return 'high';
  if (n > 0) return 'some';
  return 'none';
}

// ----- estado vazio (com CTA) e rodapé -----
const emptyState = computed(() =>
  hasActiveFilter.value
    ? {
        title: 'Nenhum job para este filtro',
        description: 'Ajuste o status, o tipo ou limpe a busca para ver toda a fila.',
        icon: 'search',
      }
    : {
        title: 'Fila vazia',
        description:
          'Nenhum job na fila de processamento agora. Eventos do service desk (envio de e-mail, ' +
          'integrações, indexação da base) aparecem aqui ao serem enfileirados.',
        icon: 'inbox',
      },
);

const footerSummary = computed(() => {
  if (r.loading.value) return 'Carregando fila…';
  const shown = r.total.value || (r.items.value ? r.items.value.length : 0);
  const total = totalDepth.value;
  let base = shown + ' job(s) no resultado';
  if (total != null && total !== shown) base += ' · ' + total + ' na fila ao todo';
  if (r.sort.value) base += ' · ordenado por ' + labelForKey(r.sort.value.key);
  return base;
});
function labelForKey(key) {
  const c = columns.find((x) => x.key === key);
  return c && c.label ? c.label.toLowerCase() : key;
}

function onVisibility() {
  if (typeof document === 'undefined') return;
  if (!document.hidden && live.value) reloadAll();
}

onMounted(() => {
  reloadAll();
  startPolling();
  clock = setInterval(() => { nowTs.value = Date.now(); }, 1000);
  if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onVisibility);
});
onUnmounted(() => {
  stopPolling();
  if (clock) clearInterval(clock);
  if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onVisibility);
});
</script>

<style scoped>
/* ===== cabeçalho: botão "ao vivo" ===== */
.jm-ico { font-weight: 700; line-height: 1; }
.jm-live {
  display: inline-flex;
  align-items: center;
  gap: var(--ui-space-2);
  font: inherit;
  font-weight: 600;
  font-size: var(--ui-text-xs);
  padding: 6px 12px;
  border-radius: var(--ui-radius-pill);
  border: 1px solid rgb(var(--ui-border-strong));
  background: rgb(var(--ui-surface));
  color: rgb(var(--ui-muted));
  cursor: pointer;
  transition: background 0.15s ease, color 0.15s ease, border-color 0.15s ease;
}
.jm-live:hover { background: rgb(var(--ui-surface-2)); color: rgb(var(--ui-fg)); }
.jm-live[data-on="true"] {
  border-color: rgb(var(--ui-ok) / 0.5);
  background: rgb(var(--ui-ok) / 0.12);
  color: rgb(var(--ui-ok));
}
.jm-live-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: rgb(var(--ui-muted));
}
.jm-live[data-on="true"] .jm-live-dot {
  background: rgb(var(--ui-ok));
  animation: jm-pulse 1.6s ease-in-out infinite;
}
@keyframes jm-pulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.45; transform: scale(0.7); }
}

/* ===== banner DLQ ===== */
.jm-banner {
  display: flex;
  align-items: center;
  gap: var(--ui-space-3);
  flex-wrap: wrap;
  background: rgb(var(--ui-danger) / 0.10);
  border: 1px solid rgb(var(--ui-danger) / 0.35);
  border-radius: var(--ui-radius-lg);
  padding: var(--ui-space-3) var(--ui-space-4);
}
.jm-banner-ico {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  flex-shrink: 0;
  border-radius: 50%;
  background: rgb(var(--ui-danger) / 0.18);
  color: rgb(var(--ui-danger));
  font-weight: 700;
  font-size: var(--ui-text-sm);
}
.jm-banner-text { flex: 1 1 auto; font-size: var(--ui-text-sm); color: rgb(var(--ui-fg)); }
.jm-banner-text strong { color: rgb(var(--ui-danger)); }

/* ===== QueueDepthWidget ===== */
.jm-depth {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: var(--ui-space-4);
}

/* ===== resumo de saúde ===== */
.jm-summary {
  display: flex;
  align-items: center;
  gap: var(--ui-space-2);
  flex-wrap: wrap;
  font-size: var(--ui-text-sm);
  color: rgb(var(--ui-muted));
}
.jm-summary-dot {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: rgb(var(--ui-muted));
  flex-shrink: 0;
}
.jm-summary[data-state="ok"] .jm-summary-dot { background: rgb(var(--ui-ok)); }
.jm-summary[data-state="warn"] .jm-summary-dot { background: rgb(var(--ui-warn)); }
.jm-summary[data-state="error"] .jm-summary-dot { background: rgb(var(--ui-danger)); }
.jm-summary[data-state="warn"] .jm-summary-text { color: rgb(var(--ui-warn)); }
.jm-summary[data-state="error"] .jm-summary-text { color: rgb(var(--ui-danger)); }
.jm-summary-text { font-weight: 600; }
.jm-summary-source, .jm-summary-sync { color: rgb(var(--ui-faint)); font-weight: 500; }

/* ===== chips de status + densidade ===== */
.jm-chips {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--ui-space-2);
}
.jm-chips-spacer { flex: 1 1 auto; }
.jm-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font: inherit;
  font-size: var(--ui-text-xs);
  font-weight: 600;
  padding: 5px 11px;
  border-radius: var(--ui-radius-pill);
  border: 1px solid rgb(var(--ui-border-strong));
  background: rgb(var(--ui-surface));
  color: rgb(var(--ui-muted));
  cursor: pointer;
  transition: background 0.15s ease, color 0.15s ease, border-color 0.15s ease;
}
.jm-chip:hover { border-color: rgb(var(--ui-accent) / 0.5); color: rgb(var(--ui-fg)); }
.jm-chip[data-active="true"] {
  background: rgb(var(--ui-accent) / 0.14);
  border-color: rgb(var(--ui-accent) / 0.5);
  color: rgb(var(--ui-accent-strong));
}
.jm-chip[data-tone="error"][data-active="true"] {
  background: rgb(var(--ui-danger) / 0.14);
  border-color: rgb(var(--ui-danger) / 0.5);
  color: rgb(var(--ui-danger));
}
.jm-chip[data-tone="success"][data-active="true"] {
  background: rgb(var(--ui-ok) / 0.14);
  border-color: rgb(var(--ui-ok) / 0.5);
  color: rgb(var(--ui-ok));
}
.jm-chip-n {
  font-family: var(--ui-font-mono);
  font-size: var(--ui-text-xs);
  background: rgb(var(--ui-muted) / 0.18);
  color: inherit;
  border-radius: var(--ui-radius-sm);
  padding: 0 5px;
  line-height: 1.5;
}
.jm-density {
  font: inherit;
  font-size: var(--ui-text-xs);
  font-weight: 600;
  color: rgb(var(--ui-muted));
  background: transparent;
  border: 1px solid rgb(var(--ui-border));
  border-radius: var(--ui-radius-pill);
  padding: 5px 12px;
  cursor: pointer;
  transition: background 0.15s ease, color 0.15s ease;
}
.jm-density:hover { background: rgb(var(--ui-surface-2)); color: rgb(var(--ui-fg)); }

/* ===== aviso de filtros ativos ===== */
.jm-active {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ui-space-3);
  flex-wrap: wrap;
  background: rgb(var(--ui-surface-2));
  border: 1px solid rgb(var(--ui-border));
  border-radius: var(--ui-radius-md);
  padding: var(--ui-space-2) var(--ui-space-4);
}
.jm-active-text { font-size: var(--ui-text-sm); color: rgb(var(--ui-muted)); }

/* ===== células da tabela ===== */
.jm-mono { font-family: var(--ui-font-mono); }
.jm-id { color: rgb(var(--ui-accent-strong)); font-weight: 600; }
.jm-dash { color: rgb(var(--ui-muted)); font-style: italic; font-size: var(--ui-text-xs); }
.jm-dim { color: rgb(var(--ui-muted)); font-size: var(--ui-text-xs); white-space: nowrap; }

.jm-type { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.jm-type-name { font-weight: 600; color: rgb(var(--ui-fg)); }
.jm-type-worker {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-family: var(--ui-font-mono);
  font-size: var(--ui-text-xs);
  color: rgb(var(--ui-muted));
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 160px;
}
.jm-type-worker-ico { font-size: var(--ui-text-xs); }

/* tentativas: número + barra (estado por data-attr, fill por largura discreta) */
.jm-attempts { display: inline-flex; flex-direction: column; align-items: center; gap: 4px; min-width: 64px; }
.jm-attempts-n { font-family: var(--ui-font-mono); font-size: var(--ui-text-sm); font-weight: 600; color: rgb(var(--ui-fg)); }
.jm-attempts-sep { color: rgb(var(--ui-muted)); margin: 0 1px; }
.jm-attempts-bar {
  width: 56px;
  height: 5px;
  border-radius: var(--ui-radius-pill);
  background: rgb(var(--ui-muted) / 0.20);
  overflow: hidden;
}
.jm-attempts-fill { display: block; height: 100%; width: 0; border-radius: inherit; background: rgb(var(--ui-accent)); transition: width 0.2s ease; }
.jm-attempts-bar[data-fill="10"] .jm-attempts-fill { width: 10%; }
.jm-attempts-bar[data-fill="20"] .jm-attempts-fill { width: 20%; }
.jm-attempts-bar[data-fill="30"] .jm-attempts-fill { width: 30%; }
.jm-attempts-bar[data-fill="40"] .jm-attempts-fill { width: 40%; }
.jm-attempts-bar[data-fill="50"] .jm-attempts-fill { width: 50%; }
.jm-attempts-bar[data-fill="60"] .jm-attempts-fill { width: 60%; }
.jm-attempts-bar[data-fill="70"] .jm-attempts-fill { width: 70%; }
.jm-attempts-bar[data-fill="80"] .jm-attempts-fill { width: 80%; }
.jm-attempts-bar[data-fill="90"] .jm-attempts-fill { width: 90%; }
.jm-attempts-bar[data-fill="100"] .jm-attempts-fill { width: 100%; }
.jm-attempts[data-state="some"] .jm-attempts-fill { background: rgb(var(--ui-accent)); }
.jm-attempts[data-state="high"] .jm-attempts-fill { background: rgb(var(--ui-warn)); }
.jm-attempts[data-state="exhausted"] .jm-attempts-fill { background: rgb(var(--ui-danger)); }
.jm-attempts[data-state="exhausted"] .jm-attempts-n { color: rgb(var(--ui-danger)); }
.jm-attempts[data-state="high"] .jm-attempts-n { color: rgb(var(--ui-warn)); }

/* tentativas inline (modal) */
.jm-attempts-inline { font-family: var(--ui-font-mono); font-weight: 600; }
.jm-attempts-inline[data-state="exhausted"] { color: rgb(var(--ui-danger)); }
.jm-attempts-inline[data-state="high"] { color: rgb(var(--ui-warn)); }

/* chave de idempotência */
.jm-key { display: inline-flex; align-items: center; gap: 6px; max-width: 220px; }
.jm-key-ico { color: rgb(var(--ui-muted)); font-size: var(--ui-text-sm); }
.jm-key-text {
  font-size: var(--ui-text-xs);
  color: rgb(var(--ui-fg));
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* último erro */
.jm-error {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  max-width: 280px;
  font: inherit;
  font-size: var(--ui-text-xs);
  text-align: left;
  border: none;
  background: none;
  color: rgb(var(--ui-danger));
  cursor: pointer;
  padding: 0;
}
.jm-error:hover .jm-error-text { text-decoration: underline; }
.jm-error-ico { flex-shrink: 0; }
.jm-error-text { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

/* execução agendada */
.jm-when { display: inline-flex; align-items: center; gap: 6px; font-size: var(--ui-text-xs); color: rgb(var(--ui-fg)); white-space: nowrap; }
.jm-when[data-future="true"] { color: rgb(var(--ui-warn)); }
.jm-when-tag {
  font-size: var(--ui-text-xs);
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  background: rgb(var(--ui-warn) / 0.18);
  color: rgb(var(--ui-warn));
  border-radius: var(--ui-radius-sm);
  padding: 1px 5px;
}

.jm-rowactions { display: inline-flex; gap: var(--ui-space-2); justify-content: flex-end; }
.jm-empty-actions { display: inline-flex; gap: var(--ui-space-2); flex-wrap: wrap; }

/* ===== modal de detalhe ===== */
.jm-detail { display: flex; flex-direction: column; gap: var(--ui-space-5); }
.jm-detail-head { display: flex; align-items: center; gap: var(--ui-space-3); flex-wrap: wrap; }
.jm-detail-type { font-family: var(--ui-font-display); font-weight: 700; font-size: var(--ui-text-lg); }
.jm-detail-id { color: rgb(var(--ui-muted)); font-size: var(--ui-text-sm); }

.jm-dl { margin: 0; display: grid; grid-template-columns: 1fr 1fr; gap: 0 var(--ui-space-5); }
.jm-dl-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--ui-space-4);
  padding: var(--ui-space-3) 0;
  border-bottom: 1px solid rgb(var(--ui-border));
}
.jm-dl-row dt { color: rgb(var(--ui-muted)); font-size: var(--ui-text-sm); font-weight: 600; }
.jm-dl-row dd { margin: 0; color: rgb(var(--ui-fg)); text-align: right; min-width: 0; }
.jm-dl-wrap { word-break: break-all; text-align: right; font-size: var(--ui-text-xs); }

.jm-errblock {
  border: 1px solid rgb(var(--ui-danger) / 0.3);
  background: rgb(var(--ui-danger) / 0.07);
  border-radius: var(--ui-radius-md);
  padding: var(--ui-space-4);
}
.jm-errblock-title {
  margin: 0 0 var(--ui-space-2);
  font-weight: 700;
  font-size: var(--ui-text-sm);
  color: rgb(var(--ui-danger));
  display: flex;
  align-items: center;
  gap: 6px;
}
.jm-errblock-pre {
  margin: 0;
  font-family: var(--ui-font-mono);
  font-size: var(--ui-text-xs);
  color: rgb(var(--ui-fg));
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 240px;
  overflow: auto;
}
.jm-noerr { color: rgb(var(--ui-muted)); font-size: var(--ui-text-sm); margin: 0; }

/* ===== responsivo ===== */
@media (max-width: 1100px) {
  .jm-depth { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
@media (max-width: 860px) {
  .jm-dl { grid-template-columns: 1fr; }
  .jm-chips-spacer { display: none; }
}
@media (max-width: 560px) {
  .jm-depth { grid-template-columns: 1fr; }
  .jm-active { flex-direction: column; align-items: flex-start; }
  .jm-rowactions { flex-direction: column; align-items: flex-end; }
}

@media (prefers-reduced-motion: reduce) {
  .jm-live[data-on="true"] .jm-live-dot { animation: none; }
  .jm-attempts-fill { transition: none; }
}
</style>
