<template>
  <UiPageLayout
    eyebrow="Atendimento · Acordos de nível de serviço"
    title="Políticas de SLA"
    subtitle="Tempos-alvo de 1ª resposta e de resolução por prioridade. Garantem que cada chamado seja atendido dentro do prazo combinado."
    width="wide"
    :error="pageError"
    @retry="reload"
  >
    <!-- Ações de cabeçalho -->
    <template #actions>
      <UiButton variant="ghost" :loading="loading" @click="reload">
        <template #icon-left><span class="sp-ico" aria-hidden="true">↻</span></template>
        Atualizar
      </UiButton>
      <UiButton variant="subtle" :disabled="!visiblePolicies.length || loading" @click="exportCsv">
        <template #icon-left><span class="sp-ico" aria-hidden="true">⬇</span></template>
        Exportar CSV
      </UiButton>
      <UiButton variant="ghost" to="/tickets">
        <template #icon-left><span class="sp-ico" aria-hidden="true">▤</span></template>
        Ver chamados
      </UiButton>
      <UiButton variant="primary" to="/sla-policies/new">
        <template #icon-left><span class="sp-ico" aria-hidden="true">＋</span></template>
        Nova política
      </UiButton>
    </template>

    <!-- KPIs + cobertura: banner sempre presente (com skeleton no loading) -->
    <template #banner>
      <section class="sp-kpis" role="group" aria-label="Resumo das políticas de SLA">
        <UiMetricCard
          label="Políticas cadastradas"
          :value="kpis.total"
          tone="primary"
          :hint="kpis.total ? kpis.active + ' ativa(s) · ' + kpis.inactive + ' inativa(s)' : 'Nenhuma definida'"
          :loading="loading"
        />
        <UiMetricCard
          label="Prioridades cobertas"
          :value="kpis.coveredLabel"
          :tone="kpis.coverageGap ? 'warning' : 'success'"
          :hint="kpis.coverageGap ? 'Faltam: ' + kpis.missingLabel : 'Todas as 4 prioridades têm política ativa'"
          :loading="loading"
        />
        <UiMetricCard
          label="1ª resposta mais rápida"
          :value="kpis.fastestResponse"
          tone="running"
          :hint="kpis.fastestResponseFor ? 'Prioridade ' + kpis.fastestResponseFor : 'Defina a primeira política'"
          :loading="loading"
        />
        <UiMetricCard
          label="Resolução mais longa"
          :value="kpis.slowestResolution"
          tone="neutral"
          :hint="kpis.slowestResolutionFor ? 'Prioridade ' + kpis.slowestResolutionFor : '—'"
          :loading="loading"
        />
      </section>

      <!-- Aviso de cobertura incompleta (derivado do conjunto real) -->
      <div
        v-if="!loading && !error && coverageGapList.length"
        class="sp-coverage"
        role="status"
      >
        <span class="sp-coverage-icon" aria-hidden="true">!</span>
        <div class="sp-coverage-body">
          <p class="sp-coverage-title">Cobertura incompleta de prioridades</p>
          <p class="sp-coverage-desc">
            Sem política <strong>ativa</strong> para
            <strong>{{ coverageGapList.map((p) => priorityLabel(p)).join(', ') }}</strong>.
            Chamados nessas prioridades ficam sem prazo-alvo definido.
          </p>
        </div>
        <UiButton variant="primary" size="sm" to="/sla-policies/new">Criar política</UiButton>
      </div>
    </template>

    <!-- Busca + chips de prioridade + situação + ordenação + alternador de visão -->
    <template #filters>
      <div class="sp-toolbar">
        <form class="sp-search" role="search" @submit.prevent>
          <span class="sp-search-icon" aria-hidden="true">⌕</span>
          <input
            id="sp-search-input"
            v-model="search"
            class="sp-search-input"
            type="search"
            placeholder="Buscar política pelo nome…"
            aria-label="Buscar políticas pelo nome"
          />
          <button
            v-if="search"
            class="sp-search-clear"
            type="button"
            aria-label="Limpar busca"
            @click="search = ''"
          >✕</button>
        </form>

        <div class="sp-chip-group" role="group" aria-label="Filtrar por prioridade">
          <span class="sp-chip-legend">Prioridade</span>
          <button
            v-for="opt in priorityOptions"
            :key="opt.value || 'all'"
            class="sp-chip"
            type="button"
            :data-active="priorityFilter === opt.value ? 'true' : null"
            :data-tone="opt.tone"
            :aria-pressed="priorityFilter === opt.value ? 'true' : 'false'"
            @click="priorityFilter = opt.value"
          >
            <span class="sp-chip-dot" aria-hidden="true" />
            {{ opt.label }}
            <span v-if="opt.count !== null" class="sp-chip-count">{{ opt.count }}</span>
          </button>
        </div>

        <div class="sp-sort">
          <label class="sp-sort-label" for="sp-status-select">Situação</label>
          <select id="sp-status-select" v-model="statusFilter" class="sp-sort-select">
            <option value="">Todas</option>
            <option value="active">Ativas</option>
            <option value="inactive">Inativas</option>
          </select>
          <label class="sp-sort-label" for="sp-sort-select">Ordenar</label>
          <select id="sp-sort-select" v-model="sortMode" class="sp-sort-select">
            <option value="priority">Prioridade (padrão)</option>
            <option value="first_response">1ª resposta</option>
            <option value="resolution">Resolução</option>
            <option value="name">Nome</option>
          </select>
        </div>
      </div>

      <div class="sp-toolbar-foot">
        <div v-if="hasActiveFilters" class="sp-active-filters">
          <span class="ui-muted">Mostrando {{ visiblePolicies.length }} de {{ policies.length }} política(s)</span>
          <UiButton variant="subtle" size="sm" @click="resetFilters">Limpar filtros</UiButton>
        </div>
        <span v-else class="sp-toolbar-spacer" />

        <div class="sp-viewtoggle" role="group" aria-label="Modo de exibição">
          <button
            type="button"
            class="sp-vt-btn"
            :data-active="viewMode === 'table' ? 'true' : null"
            :aria-pressed="viewMode === 'table' ? 'true' : 'false'"
            @click="viewMode = 'table'"
          >
            <span aria-hidden="true">▤</span> Tabela
          </button>
          <button
            type="button"
            class="sp-vt-btn"
            :data-active="viewMode === 'matrix' ? 'true' : null"
            :aria-pressed="viewMode === 'matrix' ? 'true' : 'false'"
            @click="viewMode = 'matrix'"
          >
            <span aria-hidden="true">▦</span> Cartões
          </button>
        </div>
      </div>
    </template>

    <!-- ===================== ERRO (refetch, com retry) ===================== -->
    <UiErrorState
      v-if="tableError"
      :message="tableError"
      :retryable="true"
      @retry="reload"
    >
      <template #action>
        <UiButton variant="ghost" to="/tickets">Ir para os chamados</UiButton>
      </template>
    </UiErrorState>

    <!-- ===================== TABELA ===================== -->
    <UiCard v-else-if="viewMode === 'table'" title="Catálogo de SLAs" :subtitle="tableSummary">
      <template #actions>
        <UiStatusBadge v-if="hasActiveFilters" tone="running" status="Filtro ativo" :with-dot="true" size="sm" />
      </template>

      <UiDataTable
        :columns="columns"
        :rows="visiblePolicies"
        row-key="id"
        density="comfortable"
        clickable-rows
        :loading="loading"
        :sort="tableSort"
        :empty="emptyState"
        @row-click="openPolicy"
        @update:sort="onTableSort"
      >
        <!-- Nome + situação + janela de contagem -->
        <template #cell-name="{ row }">
          <div class="sp-name-cell">
            <span class="sp-flag" :data-tone="priorityTone(row.priority)" aria-hidden="true" />
            <div class="sp-name-text">
              <span class="sp-name">{{ displayName(row) }}</span>
              <span class="sp-name-meta">
                <UiStatusBadge :tone="statusTone(row.status)" :status="row.status" :label="statusLabelFor(row.status)" size="sm" />
                <span class="sp-hours" :data-window="row.business_hours_only ? 'biz' : '24'">
                  <span aria-hidden="true">{{ row.business_hours_only ? '🕘' : '∞' }}</span>
                  {{ row.business_hours_only ? 'Horário comercial' : '24/7 · corrido' }}
                </span>
              </span>
            </div>
          </div>
        </template>

        <!-- Prioridade alvo -->
        <template #cell-priority="{ value }">
          <UiStatusBadge :tone="priorityTone(value)" :status="value" :label="priorityLabel(value)" />
        </template>

        <!-- 1ª resposta (barra comparativa CSP-safe) -->
        <template #cell-first_response_mins="{ row }">
          <div class="sp-time-cell">
            <span class="sp-time-figure" :data-tone="priorityTone(row.priority)">{{ humanMins(row.first_response_mins) }}</span>
            <div class="sp-bar" role="img" :aria-label="'1ª resposta em ' + humanMins(row.first_response_mins)">
              <span class="sp-bar-fill sp-bar-response" :data-pct="barBucket(row.first_response_mins)" />
            </div>
          </div>
        </template>

        <!-- Resolução (barra comparativa CSP-safe) -->
        <template #cell-resolution_mins="{ row }">
          <div class="sp-time-cell">
            <span class="sp-time-figure">{{ humanMins(row.resolution_mins) }}</span>
            <div class="sp-bar" role="img" :aria-label="'Resolução em ' + humanMins(row.resolution_mins)">
              <span class="sp-bar-fill sp-bar-resolution" :data-pct="barBucket(row.resolution_mins)" />
            </div>
          </div>
        </template>

        <!-- Ações por linha -->
        <template #cell-actions="{ row }">
          <div class="sp-actions" @click.stop>
            <UiButton variant="subtle" size="sm" @click="openPolicy(row)">Detalhes</UiButton>
            <UiButton variant="ghost" size="sm" :to="'/sla-policies/' + row.id + '/edit'">Editar</UiButton>
          </div>
        </template>

        <!-- Estado vazio contextual -->
        <template #empty-action>
          <UiButton v-if="hasActiveFilters" variant="ghost" @click="resetFilters">Limpar filtros</UiButton>
          <UiButton v-else variant="primary" to="/sla-policies/new">
            <template #icon-left><span aria-hidden="true">＋</span></template>
            Criar primeira política
          </UiButton>
        </template>
      </UiDataTable>
    </UiCard>

    <!-- ===================== CARTÕES / MATRIZ POR PRIORIDADE ===================== -->
    <UiCard v-else title="Cartões de SLA por prioridade" :subtitle="tableSummary">
      <template #actions>
        <UiStatusBadge v-if="hasActiveFilters" tone="running" status="Filtro ativo" :with-dot="true" size="sm" />
      </template>

      <!-- loading -->
      <UiLoadingState v-if="loading" variant="skeleton" :skeleton-lines="6" />

      <!-- empty -->
      <UiEmptyState
        v-else-if="!visiblePolicies.length"
        :title="emptyState.title"
        :description="emptyState.description"
        :icon="emptyState.icon"
      >
        <template #action>
          <UiButton v-if="hasActiveFilters" variant="ghost" @click="resetFilters">Limpar filtros</UiButton>
          <UiButton v-else variant="primary" to="/sla-policies/new">
            <template #icon-left><span aria-hidden="true">＋</span></template>
            Criar primeira política
          </UiButton>
        </template>
      </UiEmptyState>

      <!-- normal: grade de cartões -->
      <div v-else class="sp-grid" role="list">
        <article
          v-for="p in visiblePolicies"
          :key="p.id"
          class="sp-pcard"
          :data-tone="priorityTone(p.priority)"
          role="listitem"
          tabindex="0"
          :aria-label="'Política ' + displayName(p) + ', prioridade ' + priorityLabel(p.priority)"
          @click="openPolicy(p)"
          @keydown.enter="openPolicy(p)"
          @keydown.space.prevent="openPolicy(p)"
        >
          <header class="sp-pcard-head">
            <UiStatusBadge :tone="priorityTone(p.priority)" :status="p.priority" :label="priorityLabel(p.priority)" />
            <UiStatusBadge :tone="statusTone(p.status)" :status="p.status" :label="statusLabelFor(p.status)" size="sm" />
          </header>

          <h4 class="sp-pcard-name">{{ displayName(p) }}</h4>

          <dl class="sp-pcard-times">
            <div class="sp-pcard-time">
              <dt>1ª resposta</dt>
              <dd class="sp-pcard-figure sp-pcard-figure-response">{{ humanMins(p.first_response_mins) }}</dd>
              <div class="sp-bar" role="img" :aria-label="'1ª resposta em ' + humanMins(p.first_response_mins)">
                <span class="sp-bar-fill sp-bar-response" :data-pct="barBucket(p.first_response_mins)" />
              </div>
            </div>
            <div class="sp-pcard-time">
              <dt>Resolução</dt>
              <dd class="sp-pcard-figure">{{ humanMins(p.resolution_mins) }}</dd>
              <div class="sp-bar" role="img" :aria-label="'Resolução em ' + humanMins(p.resolution_mins)">
                <span class="sp-bar-fill sp-bar-resolution" :data-pct="barBucket(p.resolution_mins)" />
              </div>
            </div>
          </dl>

          <footer class="sp-pcard-foot">
            <span class="sp-hours" :data-window="p.business_hours_only ? 'biz' : '24'">
              <span aria-hidden="true">{{ p.business_hours_only ? '🕘' : '∞' }}</span>
              {{ p.business_hours_only ? 'Horário comercial' : '24/7 · corrido' }}
            </span>
            <span class="sp-pcard-go" aria-hidden="true">Detalhes →</span>
          </footer>
        </article>
      </div>
    </UiCard>

    <!-- Legenda da escala comparativa (interpretação das barras) -->
    <p v-if="!loading && !tableError && visiblePolicies.length" class="sp-legend" role="note">
      <span class="sp-legend-item"><span class="sp-legend-swatch sp-legend-response" aria-hidden="true" /> 1ª resposta</span>
      <span class="sp-legend-item"><span class="sp-legend-swatch sp-legend-resolution" aria-hidden="true" /> Resolução</span>
      <span class="sp-legend-note">As barras são proporcionais ao maior tempo do conjunto exibido ({{ humanMins(maxMins) }}). Menor é melhor.</span>
    </p>

    <!-- Atalhos de domínio (apenas rotas reais do service desk) -->
    <UiCard title="Continuar pelo atendimento" subtitle="Onde as políticas de SLA se conectam ao resto da operação.">
      <div class="sp-links" role="group" aria-label="Atalhos do service desk">
        <UiButton variant="ghost" to="/tickets">
          <template #icon-left><span aria-hidden="true">▤</span></template>
          Chamados
        </UiButton>
        <UiButton variant="ghost" to="/agents">
          <template #icon-left><span aria-hidden="true">👤</span></template>
          Agentes
        </UiButton>
        <UiButton variant="ghost" to="/teams">
          <template #icon-left><span aria-hidden="true">👥</span></template>
          Times
        </UiButton>
        <UiButton variant="ghost" to="/">
          <template #icon-left><span aria-hidden="true">◧</span></template>
          Painel geral
        </UiButton>
      </div>
    </UiCard>

    <template #footer>
      <span>Ancorado aos requisitos REQ-HELPFLOW-0003 e REQ-HELPFLOW-0004.</span>
    </template>

    <!-- Modal: detalhe da política (somente leitura — o recurso só expõe GET) -->
    <UiModal v-model:open="detailOpen" :title="detailTitle" width="md">
      <div v-if="detailTarget" class="sp-detail">
        <div class="sp-detail-head">
          <UiStatusBadge :tone="priorityTone(detailTarget.priority)" :status="detailTarget.priority" :label="priorityLabel(detailTarget.priority)" size="lg" />
          <UiStatusBadge :tone="statusTone(detailTarget.status)" :status="detailTarget.status" :label="statusLabelFor(detailTarget.status)" size="lg" />
        </div>

        <div class="sp-detail-times" role="group" aria-label="Tempos-alvo da política">
          <div class="sp-detail-time">
            <span class="sp-detail-time-label">1ª resposta</span>
            <span class="sp-detail-time-value sp-detail-time-response">{{ humanMins(detailTarget.first_response_mins) }}</span>
            <span class="sp-detail-time-hint">{{ format.formatNumber(detailTarget.first_response_mins) }} min</span>
          </div>
          <div class="sp-detail-time">
            <span class="sp-detail-time-label">Resolução</span>
            <span class="sp-detail-time-value sp-detail-time-resolution">{{ humanMins(detailTarget.resolution_mins) }}</span>
            <span class="sp-detail-time-hint">{{ format.formatNumber(detailTarget.resolution_mins) }} min</span>
          </div>
        </div>

        <dl class="sp-detail-meta">
          <div class="sp-detail-row">
            <dt>Política</dt>
            <dd>{{ displayName(detailTarget) }}</dd>
          </div>
          <div class="sp-detail-row">
            <dt>Contagem do prazo</dt>
            <dd>{{ detailTarget.business_hours_only ? 'Apenas horário comercial' : 'Tempo corrido (24/7)' }}</dd>
          </div>
          <div class="sp-detail-row">
            <dt>Identificador</dt>
            <dd class="ui-mono">{{ detailTarget.id }}</dd>
          </div>
        </dl>

        <p class="sp-detail-note">
          <span aria-hidden="true">ⓘ </span>
          O prazo de resposta é o tempo máximo até o primeiro retorno ao solicitante; o de resolução, até o
          encerramento do chamado. Chamados desta prioridade herdam estes alvos.
        </p>
      </div>
      <template #footer>
        <UiButton variant="ghost" @click="detailOpen = false">Fechar</UiButton>
        <UiButton v-if="detailTarget" variant="subtle" :to="'/sla-policies/' + detailTarget.id">
          <template #icon-left><span aria-hidden="true">↗</span></template>
          Abrir página
        </UiButton>
        <UiButton v-if="detailTarget" variant="primary" :to="'/sla-policies/' + detailTarget.id + '/edit'">
          <template #icon-left><span aria-hidden="true">✎</span></template>
          Editar
        </UiButton>
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
  UiEmptyState,
  UiLoadingState,
  UiErrorState,
  useToast,
  format,
} from '../ui/index.js';
import { slaPolicies, resourceFactory } from '../api.js';

// ---------------------------------------------------------------------------
// Endpoint REAL (único do recurso):  GET /v1/sla-policies
// Consumimos o símbolo de domínio nomeado exportado por api.js. Mantemos uma
// guarda defensiva que cai para a fábrica REST canônica (MESMO /v1/sla-policies)
// caso o export nomeado não exista — sem nunca inventar rota.
// ---------------------------------------------------------------------------
const slaResource =
  slaPolicies || (typeof resourceFactory === 'function' ? resourceFactory('sla-policies') : null);

const toast = useToast();

// ---------------------------------------------------------------------------
// Estado da lista — loading / error / normal / empty cobertos.
// ---------------------------------------------------------------------------
const policies = ref([]);
const loading = ref(false);
const error = ref(null);
const everLoaded = ref(false);

const messageOf = (e) => (e && e.message) || 'Falha ao carregar as políticas de SLA.';
// Erro de página inteira só no PRIMEIRO carregamento sem dados.
const pageError = computed(() =>
  error.value && !policies.value.length && !everLoaded.value ? messageOf(error.value) : null,
);
// Depois do 1º sucesso, erros de refetch ficam DENTRO do corpo (com retry).
const tableError = computed(() =>
  error.value && (everLoaded.value || policies.value.length) ? messageOf(error.value) : null,
);

async function load() {
  loading.value = true;
  error.value = null;
  if (!slaResource) {
    error.value = new Error('Recurso de SLA indisponível no cliente da API.');
    policies.value = [];
    loading.value = false;
    return;
  }
  try {
    const res = await slaResource.list();
    // resourceFactory resolve { data, total }; toleramos array cru também.
    policies.value = Array.isArray(res) ? res : res.data || res.items || [];
    everLoaded.value = true;
  } catch (e) {
    error.value = e;
    policies.value = [];
  } finally {
    loading.value = false;
  }
}
async function reload() {
  const wasLoaded = everLoaded.value;
  await load();
  if (error.value) {
    toast.error('Não foi possível atualizar as políticas', { detail: messageOf(error.value) });
  } else if (wasLoaded) {
    toast.success(policies.value.length + ' política(s) atualizada(s)');
  }
}

// ---------------------------------------------------------------------------
// Modelo de prioridade — ordena o que importa primeiro (urgente → baixa).
// ---------------------------------------------------------------------------
const PRIORITY_ORDER = { urgent: 0, high: 1, medium: 2, low: 3 };
const PRIORITY_LABELS = { urgent: 'Urgente', high: 'Alta', medium: 'Média', low: 'Baixa' };
const PRIORITY_TONES = { urgent: 'error', high: 'warning', medium: 'running', low: 'neutral' };
const ALL_PRIORITIES = ['urgent', 'high', 'medium', 'low'];

const priorityLabel = (p) => PRIORITY_LABELS[p] || format.humanize(p);
const priorityTone = (p) => PRIORITY_TONES[p] || 'neutral';
const priorityRank = (p) => (p in PRIORITY_ORDER ? PRIORITY_ORDER[p] : 99);

// Tom explícito por situação (não confia no auto-tom por palavra-chave).
const STATUS_TONES = { active: 'success', inactive: 'neutral' };
const statusTone = (s) => STATUS_TONES[s] || 'neutral';
const statusLabelFor = (s) => (s === 'active' ? 'Ativa' : s === 'inactive' ? 'Inativa' : format.humanize(s));
const displayName = (p) => String((p && p.name) || ('Política #' + (p && p.id)));

// Minutos → rótulo humano compacto (sem libs externas).
function humanMins(mins) {
  const n = Number(mins);
  if (!isFinite(n) || n < 0) return '—';
  if (n === 0) return 'imediato';
  if (n < 60) return n + ' min';
  const days = Math.floor(n / 1440);
  const hours = Math.floor((n % 1440) / 60);
  const rem = n % 60;
  const parts = [];
  if (days) parts.push(days + ' d');
  if (hours) parts.push(hours + ' h');
  if (rem && !days) parts.push(rem + ' min');
  return parts.join(' ') || n + ' min';
}

// ---------------------------------------------------------------------------
// Escala das barras comparativas (CSP-safe: largura por bucket discreto, sem style).
// Normaliza contra o MAIOR tempo (resposta ou resolução) do conjunto carregado.
// ---------------------------------------------------------------------------
const maxMins = computed(() => {
  let m = 1;
  for (const p of policies.value) {
    m = Math.max(m, Number(p.resolution_mins) || 0, Number(p.first_response_mins) || 0);
  }
  return m;
});
function barBucket(mins) {
  const n = Number(mins) || 0;
  const pct = Math.round((n / maxMins.value) * 100);
  return String(Math.min(100, Math.max(5, Math.round(pct / 5) * 5)));
}

// ---------------------------------------------------------------------------
// Busca / filtros / ordenação (cliente — a API devolve o conjunto completo).
// ---------------------------------------------------------------------------
const search = ref('');
const priorityFilter = ref(''); // '' | urgent | high | medium | low
const statusFilter = ref(''); // '' | active | inactive
const sortMode = ref('priority'); // priority | first_response | resolution | name
const viewMode = ref('table'); // table | matrix

const countByPriority = (p) => policies.value.filter((x) => x.priority === p).length;

const priorityOptions = computed(() => [
  { value: '', label: 'Todas', tone: 'neutral', count: policies.value.length || null },
  { value: 'urgent', label: 'Urgente', tone: 'error', count: countByPriority('urgent') || null },
  { value: 'high', label: 'Alta', tone: 'warning', count: countByPriority('high') || null },
  { value: 'medium', label: 'Média', tone: 'running', count: countByPriority('medium') || null },
  { value: 'low', label: 'Baixa', tone: 'neutral', count: countByPriority('low') || null },
]);

const hasActiveFilters = computed(
  () => !!search.value.trim() || !!priorityFilter.value || !!statusFilter.value,
);
function resetFilters() {
  search.value = '';
  priorityFilter.value = '';
  statusFilter.value = '';
}

const visiblePolicies = computed(() => {
  const q = search.value.trim().toLowerCase();
  let rows = policies.value.filter((p) => {
    if (q && !displayName(p).toLowerCase().includes(q)) return false;
    if (priorityFilter.value && p.priority !== priorityFilter.value) return false;
    if (statusFilter.value && p.status !== statusFilter.value) return false;
    return true;
  });
  rows = [...rows];
  if (sortMode.value === 'name') {
    rows.sort((a, b) => displayName(a).localeCompare(displayName(b), 'pt-BR'));
  } else if (sortMode.value === 'first_response') {
    rows.sort((a, b) => (Number(a.first_response_mins) || 0) - (Number(b.first_response_mins) || 0));
  } else if (sortMode.value === 'resolution') {
    rows.sort((a, b) => (Number(a.resolution_mins) || 0) - (Number(b.resolution_mins) || 0));
  } else {
    rows.sort(
      (a, b) =>
        priorityRank(a.priority) - priorityRank(b.priority) ||
        (Number(a.first_response_mins) || 0) - (Number(b.first_response_mins) || 0),
    );
  }
  return rows;
});

// A ordenação por clique no cabeçalho da tabela alimenta o mesmo `sortMode`.
// Mapeamos a chave da coluna → modo de ordenação (e refletimos o estado visual).
const SORT_KEY_TO_MODE = {
  name: 'name',
  priority: 'priority',
  first_response_mins: 'first_response',
  resolution_mins: 'resolution',
};
const MODE_TO_SORT_KEY = {
  name: 'name',
  priority: 'priority',
  first_response: 'first_response_mins',
  resolution: 'resolution_mins',
};
const tableSort = computed(() => {
  const key = MODE_TO_SORT_KEY[sortMode.value];
  return key ? { key, dir: 'asc' } : null;
});
function onTableSort(s) {
  const mode = s && SORT_KEY_TO_MODE[s.key];
  if (mode) sortMode.value = mode;
}

// ---------------------------------------------------------------------------
// KPIs derivados (conjunto real). Inclui cobertura de prioridades.
// ---------------------------------------------------------------------------
const activePolicies = computed(() => policies.value.filter((p) => p.status === 'active'));
const coveredPriorities = computed(() => {
  const set = new Set(activePolicies.value.map((p) => p.priority));
  return ALL_PRIORITIES.filter((p) => set.has(p));
});
const coverageGapList = computed(() => {
  const set = new Set(activePolicies.value.map((p) => p.priority));
  return policies.value.length ? ALL_PRIORITIES.filter((p) => !set.has(p)) : [];
});

const kpis = computed(() => {
  const list = policies.value;
  const active = activePolicies.value.length;
  let fastest = null;
  let fastestFor = '';
  let slowest = null;
  let slowestFor = '';
  for (const p of list) {
    const fr = Number(p.first_response_mins);
    const rs = Number(p.resolution_mins);
    if (isFinite(fr) && (fastest === null || fr < fastest)) {
      fastest = fr;
      fastestFor = priorityLabel(p.priority);
    }
    if (isFinite(rs) && (slowest === null || rs > slowest)) {
      slowest = rs;
      slowestFor = priorityLabel(p.priority);
    }
  }
  return {
    total: list.length || (loading.value ? null : 0),
    active,
    inactive: list.length - active,
    coveredLabel: list.length ? coveredPriorities.value.length + '/4' : '—',
    coverageGap: coverageGapList.value.length > 0,
    missingLabel: coverageGapList.value.map((p) => priorityLabel(p)).join(', '),
    fastestResponse: fastest === null ? '—' : humanMins(fastest),
    fastestResponseFor: fastestFor,
    slowestResolution: slowest === null ? '—' : humanMins(slowest),
    slowestResolutionFor: slowestFor,
  };
});

const tableSummary = computed(() => {
  if (loading.value) return 'Carregando…';
  if (!policies.value.length) return 'Nenhuma política cadastrada';
  const shown = visiblePolicies.value.length;
  return hasActiveFilters.value
    ? shown + ' de ' + policies.value.length + ' política(s)'
    : policies.value.length + ' política(s) por prioridade';
});

const emptyState = computed(() =>
  hasActiveFilters.value
    ? {
        title: 'Nenhuma política no filtro',
        description: 'Nenhuma política corresponde à busca/filtros atuais. Ajuste os critérios ou limpe os filtros.',
        icon: 'search',
      }
    : {
        title: 'Nenhuma política de SLA',
        description: 'Ainda não há acordos de nível de serviço definidos. Os chamados são atendidos sem prazo-alvo até que uma política exista.',
        icon: 'clock',
      },
);

// ---------------------------------------------------------------------------
// Colunas (todas as de tempo/prioridade ordenáveis via cabeçalho).
// ---------------------------------------------------------------------------
const columns = [
  { key: 'name', label: 'Política', sortable: true },
  { key: 'priority', label: 'Prioridade', sortable: true },
  { key: 'first_response_mins', label: '1ª resposta', sortable: true },
  { key: 'resolution_mins', label: 'Resolução', sortable: true },
  { key: 'actions', label: 'Ações', align: 'right' },
];

// ---------------------------------------------------------------------------
// Detalhe (modal, somente leitura — o recurso só expõe GET).
// ---------------------------------------------------------------------------
const detailOpen = ref(false);
const detailTarget = ref(null);
const detailTitle = computed(() =>
  detailTarget.value ? 'Política · ' + displayName(detailTarget.value) : 'Detalhe da política',
);
function openPolicy(row) {
  detailTarget.value = row;
  detailOpen.value = true;
}

// ---------------------------------------------------------------------------
// Exportar CSV (cliente, sobre o conjunto visível; CSP-safe via Blob).
// ---------------------------------------------------------------------------
function csvCell(v) {
  const s = v == null ? '' : String(v);
  return /[",\n;]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
function exportCsv() {
  const rows = visiblePolicies.value;
  if (!rows.length) {
    toast.warning('Nada para exportar.');
    return;
  }
  const head = ['Política', 'Prioridade', '1ª resposta (min)', 'Resolução (min)', 'Só horário comercial', 'Situação'];
  const lines = [head.join(';')];
  for (const p of rows) {
    lines.push(
      [
        csvCell(p.name),
        csvCell(priorityLabel(p.priority)),
        csvCell(p.first_response_mins),
        csvCell(p.resolution_mins),
        csvCell(p.business_hours_only ? 'Sim' : 'Não'),
        csvCell(statusLabelFor(p.status)),
      ].join(';'),
    );
  }
  try {
    const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'politicas-sla-' + new Date().toISOString().slice(0, 10) + '.csv';
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    toast.success('CSV exportado (' + rows.length + ' política(s)).');
  } catch (e) {
    toast.error('Falha ao exportar CSV', { detail: e && e.message });
  }
}

onMounted(load);
</script>

<style scoped>
.sp-ico {
  font-weight: 700;
  line-height: 1;
}

/* ---- KPIs ---- */
.sp-kpis {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: var(--ui-space-4);
}

/* ---- Faixa de cobertura incompleta ---- */
.sp-coverage {
  display: flex;
  align-items: center;
  gap: var(--ui-space-4);
  margin-top: var(--ui-space-4);
  padding: var(--ui-space-4) var(--ui-space-5);
  border: 1px solid rgb(var(--ui-warn) / 0.4);
  border-left: 4px solid rgb(var(--ui-warn));
  border-radius: var(--ui-radius-lg);
  background: rgb(var(--ui-warn) / 0.08);
}
.sp-coverage-icon {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  border-radius: var(--ui-radius-pill);
  background: rgb(var(--ui-warn));
  color: rgb(var(--ui-accent-fg));
  font-family: var(--ui-font-display);
  font-weight: 800;
  line-height: 1;
}
.sp-coverage-body { flex: 1 1 auto; min-width: 0; }
.sp-coverage-title { margin: 0; font-weight: 700; color: rgb(var(--ui-fg)); font-family: var(--ui-font-display); }
.sp-coverage-desc { margin: 2px 0 0; color: rgb(var(--ui-muted)); font-size: var(--ui-text-sm); }

/* ---- Toolbar (busca + chips + selects) ---- */
.sp-toolbar {
  display: flex;
  align-items: center;
  gap: var(--ui-space-4);
  flex-wrap: wrap;
}
.sp-search {
  position: relative;
  display: flex;
  align-items: center;
  flex: 1 1 280px;
  min-width: 240px;
}
.sp-search-icon {
  position: absolute;
  left: 12px;
  color: rgb(var(--ui-muted));
  font-size: 1.05rem;
  pointer-events: none;
}
.sp-search-input {
  width: 100%;
  font: inherit;
  color: rgb(var(--ui-fg));
  background: rgb(var(--ui-surface));
  border: 1px solid rgb(var(--ui-border-strong));
  border-radius: var(--ui-radius-md);
  padding: 9px 34px;
}
.sp-search-input::placeholder { color: rgb(var(--ui-faint)); }
.sp-search-input:focus { border-color: rgb(var(--ui-accent)); outline: none; }
.sp-search-clear {
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
.sp-search-clear:hover { background: rgb(var(--ui-border)); color: rgb(var(--ui-fg)); }
.sp-search-clear:focus-visible { outline: 2px solid rgb(var(--ui-accent)); outline-offset: 2px; }

.sp-chip-group { display: flex; align-items: center; gap: var(--ui-space-2); flex-wrap: wrap; }
.sp-chip-legend {
  font-size: var(--ui-text-xs);
  font-weight: 600;
  color: rgb(var(--ui-muted));
  text-transform: uppercase;
  letter-spacing: .04em;
}
.sp-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
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
.sp-chip:hover { border-color: rgb(var(--ui-accent)); color: rgb(var(--ui-fg)); }
.sp-chip:focus-visible { outline: 2px solid rgb(var(--ui-accent)); outline-offset: 2px; }
.sp-chip[data-active="true"] {
  background: rgb(var(--ui-accent) / 0.12);
  border-color: rgb(var(--ui-accent));
  color: rgb(var(--ui-accent-strong));
}
.sp-chip-dot { width: 7px; height: 7px; border-radius: 50%; background: rgb(var(--ui-faint)); }
.sp-chip[data-tone="error"] .sp-chip-dot { background: rgb(var(--ui-danger)); }
.sp-chip[data-tone="warning"] .sp-chip-dot { background: rgb(var(--ui-warn)); }
.sp-chip[data-tone="running"] .sp-chip-dot { background: rgb(var(--ui-accent)); }
.sp-chip[data-tone="neutral"] .sp-chip-dot { background: rgb(var(--ui-faint)); }
.sp-chip-count {
  background: rgb(var(--ui-surface-2));
  color: rgb(var(--ui-muted));
  border-radius: var(--ui-radius-pill);
  padding: 0 6px;
  font-size: var(--ui-text-xs);
  min-width: 16px;
  text-align: center;
}
.sp-chip[data-active="true"] .sp-chip-count {
  background: rgb(var(--ui-accent) / 0.2);
  color: rgb(var(--ui-accent-strong));
}

.sp-sort { display: flex; align-items: center; gap: var(--ui-space-2); margin-left: auto; flex-wrap: wrap; }
.sp-sort-label {
  font-size: var(--ui-text-xs);
  font-weight: 600;
  color: rgb(var(--ui-muted));
  text-transform: uppercase;
  letter-spacing: .04em;
}
.sp-sort-select {
  font: inherit;
  color: rgb(var(--ui-fg));
  background: rgb(var(--ui-surface));
  border: 1px solid rgb(var(--ui-border-strong));
  border-radius: var(--ui-radius-sm);
  padding: 7px 10px;
}
.sp-sort-select:focus { border-color: rgb(var(--ui-accent)); outline: none; }

/* ---- Rodapé da toolbar: filtros ativos + alternador de visão ---- */
.sp-toolbar-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ui-space-3);
  flex-wrap: wrap;
}
.sp-toolbar-spacer { flex: 1 1 auto; }
.sp-active-filters {
  display: flex;
  align-items: center;
  gap: var(--ui-space-3);
  font-size: var(--ui-text-sm);
}
.sp-viewtoggle {
  display: inline-flex;
  gap: 2px;
  padding: 3px;
  background: rgb(var(--ui-surface-2));
  border: 1px solid rgb(var(--ui-border));
  border-radius: var(--ui-radius-pill);
}
.sp-vt-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font: inherit;
  font-size: var(--ui-text-xs);
  font-weight: 600;
  color: rgb(var(--ui-muted));
  background: transparent;
  border: none;
  border-radius: var(--ui-radius-pill);
  padding: 5px 13px;
  cursor: pointer;
  transition: background .15s ease, color .15s ease;
}
.sp-vt-btn:hover { color: rgb(var(--ui-fg)); }
.sp-vt-btn:focus-visible { outline: 2px solid rgb(var(--ui-accent)); outline-offset: 2px; }
.sp-vt-btn[data-active="true"] {
  background: rgb(var(--ui-surface));
  color: rgb(var(--ui-accent-strong));
  box-shadow: var(--ui-shadow-sm);
}

/* ---- Célula: nome + faixa de prioridade ---- */
.sp-name-cell { display: flex; align-items: center; gap: var(--ui-space-3); }
.sp-flag {
  flex-shrink: 0;
  width: 4px;
  height: 34px;
  border-radius: var(--ui-radius-pill);
  background: rgb(var(--ui-faint));
}
.sp-flag[data-tone="error"] { background: rgb(var(--ui-danger)); }
.sp-flag[data-tone="warning"] { background: rgb(var(--ui-warn)); }
.sp-flag[data-tone="running"] { background: rgb(var(--ui-accent)); }
.sp-flag[data-tone="neutral"] { background: rgb(var(--ui-faint)); }
.sp-name-text { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.sp-name { font-weight: 600; color: rgb(var(--ui-fg)); }
.sp-name-meta { display: inline-flex; align-items: center; gap: var(--ui-space-2); flex-wrap: wrap; }
.sp-hours {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: var(--ui-text-xs);
  color: rgb(var(--ui-muted));
  white-space: nowrap;
}
.sp-hours[data-window="24"] { color: rgb(var(--ui-faint)); }

/* ---- Célula: tempos com barra comparativa ---- */
.sp-time-cell { display: flex; flex-direction: column; gap: 5px; min-width: 12ch; }
.sp-time-figure { font-weight: 700; font-variant-numeric: tabular-nums; color: rgb(var(--ui-fg)); white-space: nowrap; }
.sp-time-figure[data-tone="error"] { color: rgb(var(--ui-danger)); }
.sp-time-figure[data-tone="warning"] { color: rgb(var(--ui-warn)); }
.sp-bar {
  position: relative;
  height: 6px;
  width: 100%;
  max-width: 160px;
  background: rgb(var(--ui-surface-2));
  border-radius: var(--ui-radius-pill);
  overflow: hidden;
}
.sp-bar-fill {
  position: absolute;
  inset: 0 auto 0 0;
  height: 100%;
  border-radius: var(--ui-radius-pill);
  transition: width .2s ease;
}
.sp-bar-response { background: rgb(var(--ui-accent)); }
.sp-bar-resolution { background: rgb(var(--ui-faint)); }
/* Largura por bucket discreto (CSP-safe: sem style inline). */
.sp-bar-fill[data-pct="5"] { width: 5%; }
.sp-bar-fill[data-pct="10"] { width: 10%; }
.sp-bar-fill[data-pct="15"] { width: 15%; }
.sp-bar-fill[data-pct="20"] { width: 20%; }
.sp-bar-fill[data-pct="25"] { width: 25%; }
.sp-bar-fill[data-pct="30"] { width: 30%; }
.sp-bar-fill[data-pct="35"] { width: 35%; }
.sp-bar-fill[data-pct="40"] { width: 40%; }
.sp-bar-fill[data-pct="45"] { width: 45%; }
.sp-bar-fill[data-pct="50"] { width: 50%; }
.sp-bar-fill[data-pct="55"] { width: 55%; }
.sp-bar-fill[data-pct="60"] { width: 60%; }
.sp-bar-fill[data-pct="65"] { width: 65%; }
.sp-bar-fill[data-pct="70"] { width: 70%; }
.sp-bar-fill[data-pct="75"] { width: 75%; }
.sp-bar-fill[data-pct="80"] { width: 80%; }
.sp-bar-fill[data-pct="85"] { width: 85%; }
.sp-bar-fill[data-pct="90"] { width: 90%; }
.sp-bar-fill[data-pct="95"] { width: 95%; }
.sp-bar-fill[data-pct="100"] { width: 100%; }

/* ---- Ações por linha ---- */
.sp-actions {
  display: inline-flex;
  align-items: center;
  gap: var(--ui-space-2);
  justify-content: flex-end;
  flex-wrap: wrap;
}

/* ---- Grade de cartões (visão matriz) ---- */
.sp-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: var(--ui-space-4);
}
.sp-pcard {
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-3);
  padding: var(--ui-space-4) var(--ui-space-5);
  background: rgb(var(--ui-surface));
  border: 1px solid rgb(var(--ui-border));
  border-left: 4px solid rgb(var(--ui-faint));
  border-radius: var(--ui-radius-lg);
  box-shadow: var(--ui-shadow-sm);
  cursor: pointer;
  transition: border-color .15s ease, box-shadow .15s ease, transform .15s ease;
}
.sp-pcard:hover { box-shadow: var(--ui-shadow-md); transform: translateY(-1px); }
.sp-pcard:focus-visible { outline: 2px solid rgb(var(--ui-accent)); outline-offset: 2px; }
.sp-pcard[data-tone="error"] { border-left-color: rgb(var(--ui-danger)); }
.sp-pcard[data-tone="warning"] { border-left-color: rgb(var(--ui-warn)); }
.sp-pcard[data-tone="running"] { border-left-color: rgb(var(--ui-accent)); }
.sp-pcard[data-tone="neutral"] { border-left-color: rgb(var(--ui-faint)); }
.sp-pcard-head { display: flex; align-items: center; justify-content: space-between; gap: var(--ui-space-2); flex-wrap: wrap; }
.sp-pcard-name {
  margin: 0;
  font-family: var(--ui-font-display);
  font-size: var(--ui-text-lg);
  font-weight: 700;
  color: rgb(var(--ui-fg));
  line-height: 1.25;
}
.sp-pcard-times { margin: 0; display: grid; grid-template-columns: 1fr 1fr; gap: var(--ui-space-3); }
.sp-pcard-time { display: flex; flex-direction: column; gap: 4px; }
.sp-pcard-time dt {
  font-size: var(--ui-text-xs);
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: .04em;
  color: rgb(var(--ui-muted));
}
.sp-pcard-figure {
  margin: 0;
  font-family: var(--ui-font-display);
  font-size: 1.25rem;
  font-weight: 700;
  line-height: 1.1;
  font-variant-numeric: tabular-nums;
  color: rgb(var(--ui-fg));
}
.sp-pcard-figure-response { color: rgb(var(--ui-accent-strong)); }
.sp-pcard-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ui-space-2);
  padding-top: var(--ui-space-2);
  border-top: 1px solid rgb(var(--ui-border));
}
.sp-pcard-go { font-size: var(--ui-text-xs); font-weight: 600; color: rgb(var(--ui-accent-strong)); }

/* ---- Legenda da escala ---- */
.sp-legend {
  display: flex;
  align-items: center;
  gap: var(--ui-space-4);
  flex-wrap: wrap;
  margin: 0;
  font-size: var(--ui-text-xs);
  color: rgb(var(--ui-muted));
}
.sp-legend-item { display: inline-flex; align-items: center; gap: 6px; font-weight: 600; }
.sp-legend-swatch { width: 14px; height: 8px; border-radius: var(--ui-radius-pill); }
.sp-legend-response { background: rgb(var(--ui-accent)); }
.sp-legend-resolution { background: rgb(var(--ui-faint)); }
.sp-legend-note { color: rgb(var(--ui-faint)); }

/* ---- Atalhos de domínio ---- */
.sp-links { display: flex; flex-wrap: wrap; gap: var(--ui-space-3); }

/* ---- Modal: detalhe ---- */
.sp-detail { display: flex; flex-direction: column; gap: var(--ui-space-4); }
.sp-detail-head { display: flex; align-items: center; gap: var(--ui-space-2); flex-wrap: wrap; }
.sp-detail-times {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--ui-space-3);
}
.sp-detail-time {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: var(--ui-space-4);
  background: rgb(var(--ui-surface-2));
  border: 1px solid rgb(var(--ui-border));
  border-radius: var(--ui-radius-md);
}
.sp-detail-time-label {
  font-size: var(--ui-text-xs);
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: .04em;
  color: rgb(var(--ui-muted));
}
.sp-detail-time-value {
  font-family: var(--ui-font-display);
  font-size: 1.6rem;
  font-weight: 700;
  line-height: 1.1;
  font-variant-numeric: tabular-nums;
}
.sp-detail-time-response { color: rgb(var(--ui-accent-strong)); }
.sp-detail-time-resolution { color: rgb(var(--ui-fg)); }
.sp-detail-time-hint { font-size: var(--ui-text-xs); color: rgb(var(--ui-muted)); }
.sp-detail-meta { margin: 0; display: grid; gap: var(--ui-space-2); }
.sp-detail-row { display: grid; grid-template-columns: 160px 1fr; gap: var(--ui-space-3); align-items: center; }
.sp-detail-row dt { color: rgb(var(--ui-muted)); font-size: var(--ui-text-sm); font-weight: 600; }
.sp-detail-row dd { margin: 0; color: rgb(var(--ui-fg)); }
.sp-detail-note {
  margin: 0;
  font-size: var(--ui-text-sm);
  color: rgb(var(--ui-muted));
  line-height: 1.55;
  padding: var(--ui-space-3) var(--ui-space-4);
  background: rgb(var(--ui-accent) / 0.06);
  border-left: 3px solid rgb(var(--ui-accent));
  border-radius: var(--ui-radius-md);
}

/* ---- Responsivo ---- */
@media (max-width: 1080px) {
  .sp-kpis { grid-template-columns: repeat(2, 1fr); }
}
@media (max-width: 860px) {
  .sp-toolbar { flex-direction: column; align-items: stretch; }
  .sp-sort { margin-left: 0; }
  .sp-actions { justify-content: flex-start; }
  .sp-coverage { flex-direction: column; align-items: flex-start; }
  .sp-grid { grid-template-columns: 1fr; }
}
@media (max-width: 560px) {
  .sp-kpis { grid-template-columns: 1fr; }
  .sp-detail-times { grid-template-columns: 1fr; }
  .sp-detail-row { grid-template-columns: 1fr; gap: 2px; }
  .sp-pcard-times { grid-template-columns: 1fr; }
}
</style>
