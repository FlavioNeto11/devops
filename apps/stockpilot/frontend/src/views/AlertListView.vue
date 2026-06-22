<template>
  <UiPageLayout
    eyebrow="Operação · Apagar incêndios"
    title="Alertas de estoque"
    subtitle="Produtos em RUPTURA ou com falha de envio ao fornecedor, priorizados por gravidade. Aja direto: reponha agora, peça uma sugestão à IA ou abra o produto."
    width="wide"
    :error="pageError"
    @retry="reload"
  >
    <!-- Ações de cabeçalho -->
    <template #actions>
      <UiButton variant="ghost" :loading="loading" @click="reload">
        <template #icon-left><span aria-hidden="true">↻</span></template>
        Atualizar
      </UiButton>
      <UiButton variant="subtle" :disabled="!alerts.length || loading" @click="exportCsv">
        <template #icon-left><span aria-hidden="true">⬇</span></template>
        Exportar CSV
      </UiButton>
      <UiButton variant="ghost" to="/products">
        <template #icon-left><span aria-hidden="true">▦</span></template>
        Catálogo de produtos
      </UiButton>
    </template>

    <!-- KPIs de gravidade (derivados do conjunto REAL retornado) -->
    <template #banner>
      <div class="al-kpis" role="group" aria-label="Resumo dos alertas">
        <UiMetricCard
          label="Alertas ativos"
          :value="kpis.total"
          tone="primary"
          :hint="kpis.total ? 'Exigem atenção agora' : 'Tudo sob controle'"
          :loading="loading"
        />
        <UiMetricCard
          label="Em ruptura"
          :value="kpis.ruptura"
          tone="error"
          hint="Abaixo do mínimo, sem cobertura"
          :loading="loading"
        />
        <UiMetricCard
          label="Falha de envio"
          :value="kpis.erro"
          tone="warning"
          hint="Pedido não chegou ao fornecedor"
          :loading="loading"
        />
        <UiMetricCard
          label="Sem pedido aberto"
          :value="kpis.semPedido"
          tone="running"
          hint="Ainda não há reposição a caminho"
          :loading="loading"
        />
      </div>

      <!-- Faixa de destaque do pior caso (ruptura sem cobertura) -->
      <div
        v-if="!loading && !error && topCritical"
        class="al-spotlight"
        role="alert"
      >
        <span class="al-spotlight-icon" aria-hidden="true">!</span>
        <div class="al-spotlight-body">
          <p class="al-spotlight-title">Prioridade máxima: {{ displayName(topCritical) }}</p>
          <p class="al-spotlight-desc">
            {{ format.formatNumber(topCritical.current_stock) }} em estoque para um mínimo de
            {{ format.formatNumber(topCritical.min_stock) }} ({{ shortfallLabel(topCritical) }}).
            Sem pedido aberto — reponha imediatamente.
          </p>
        </div>
        <div class="al-spotlight-actions">
          <UiButton
            variant="primary"
            size="sm"
            :loading="isBusy(topCritical.id, 'reorder')"
            @click="reorderNow(topCritical)"
          >
            Repor agora
          </UiButton>
        </div>
      </div>
    </template>

    <!-- Busca + chips de filtro por tipo + ordenação por gravidade -->
    <template #filters>
      <div class="al-toolbar">
        <form class="al-search" role="search" @submit.prevent>
          <span class="al-search-icon" aria-hidden="true">⌕</span>
          <input
            id="al-search-input"
            v-model="search"
            class="al-search-input"
            type="search"
            placeholder="Buscar produto pelo nome…"
            aria-label="Buscar alertas pelo nome do produto"
          />
          <button
            v-if="search"
            class="al-search-clear"
            type="button"
            aria-label="Limpar busca"
            @click="search = ''"
          >✕</button>
        </form>

        <div class="al-chip-group" role="group" aria-label="Filtrar por tipo de alerta">
          <span class="al-chip-legend">Tipo</span>
          <button
            v-for="opt in typeOptions"
            :key="opt.value"
            class="al-chip"
            type="button"
            :data-active="typeFilter === opt.value ? 'true' : null"
            :data-tone="opt.tone"
            :aria-pressed="typeFilter === opt.value"
            @click="typeFilter = opt.value"
          >
            <span class="al-chip-dot" aria-hidden="true" />
            {{ opt.label }}
            <span v-if="opt.count !== null" class="al-chip-count">{{ opt.count }}</span>
          </button>
        </div>

        <div class="al-sort">
          <label class="al-sort-label" for="al-sort-select">Ordenar</label>
          <select id="al-sort-select" v-model="sortMode" class="al-sort-select">
            <option value="severity">Gravidade (padrão)</option>
            <option value="shortfall">Maior déficit</option>
            <option value="name">Nome do produto</option>
          </select>
        </div>
      </div>

      <div v-if="hasActiveFilters" class="al-active-filters">
        <span class="ui-muted">Mostrando {{ visibleAlerts.length }} de {{ alerts.length }} alerta(s)</span>
        <UiButton variant="subtle" size="sm" @click="resetFilters">Limpar filtros</UiButton>
      </div>
    </template>

    <!-- Tabela: loading / empty / error / normal cobertos -->
    <UiCard title="Fila de atendimento" :subtitle="tableSummary">
      <template #actions>
        <UiStatusBadge v-if="hasActiveFilters" tone="running" status="Filtro ativo" size="sm" />
      </template>

      <UiDataTable
        :columns="columns"
        :rows="visibleAlerts"
        row-key="id"
        density="comfortable"
        :loading="loading"
        :error="tableError"
        :empty="emptyState"
        clickable-rows
        @row-click="navigateToProduct"
        @retry="reload"
      >
        <!-- Produto -->
        <template #cell-name="{ row }">
          <div class="al-product-cell">
            <span class="al-rank" :data-tone="severityTone(row)" :aria-label="rankLabel(row)">{{ severityRank(row) }}</span>
            <div class="al-product-text">
              <span class="al-product-name">{{ displayName(row) }}</span>
              <span class="al-product-id">ID {{ row.id }}</span>
            </div>
          </div>
        </template>

        <!-- Tipo de alerta -->
        <template #cell-alert_type="{ value }">
          <UiStatusBadge :tone="alertTypeTone(value)" :status="value" :label="alertTypeLabel(value)" />
        </template>

        <!-- Estoque atual vs mínimo (barra de cobertura CSP-safe) -->
        <template #cell-current_stock="{ row }">
          <div class="al-stock-cell">
            <div class="al-stock-figures">
              <span class="al-stock-now" :data-tone="severityTone(row)">{{ format.formatNumber(row.current_stock) }}</span>
              <span class="al-stock-min">/ {{ format.formatNumber(row.min_stock) }} mín.</span>
            </div>
            <div class="al-gauge" role="img" :aria-label="'Cobertura ' + coveragePct(row) + '% do estoque mínimo'">
              <span class="al-gauge-fill" :data-tone="severityTone(row)" :data-pct="coverageBucket(row)" />
            </div>
            <span class="al-stock-gap">{{ shortfallLabel(row) }}</span>
          </div>
        </template>

        <!-- Cobertura / pedido aberto -->
        <template #cell-has_open_order="{ row }">
          <UiStatusBadge v-if="row.has_open_order" tone="running" status="Reposição a caminho" size="sm" />
          <UiStatusBadge v-else tone="error" status="Sem pedido" size="sm" />
        </template>

        <!-- Última falha (erro de envio) -->
        <template #cell-last_error="{ row }">
          <button v-if="row.last_error" class="al-errlink" type="button" @click.stop="openError(row)">
            <span class="al-errlink-icon" aria-hidden="true">⚠</span>
            <span class="al-errlink-text">{{ truncate(row.last_error, 48) }}</span>
          </button>
          <span v-else class="ui-muted">—</span>
        </template>

        <!-- Última tentativa -->
        <template #cell-last_attempt_at="{ value }">
          <span class="al-when">{{ value ? format.formatDateTime(value) : '—' }}</span>
        </template>

        <!-- Ações por linha (RowActionMenu inline) -->
        <template #cell-actions="{ row }">
          <div class="al-actions" @click.stop>
            <UiButton
              variant="primary"
              size="sm"
              :disabled="row.has_open_order"
              :loading="isBusy(row.id, 'reorder')"
              @click="reorderNow(row)"
            >
              {{ row.has_open_order ? 'Em reposição' : 'Repor agora' }}
            </UiButton>
            <UiButton
              variant="ghost"
              size="sm"
              :loading="isBusy(row.id, 'suggest')"
              @click="suggestFor(row)"
            >
              <template #icon-left><span aria-hidden="true">✦</span></template>
              IA
            </UiButton>
            <UiButton variant="subtle" size="sm" :to="'/products/' + row.id">Ver</UiButton>
          </div>
        </template>

        <!-- Estado vazio contextual -->
        <template #empty-action>
          <UiButton v-if="hasActiveFilters" variant="ghost" @click="resetFilters">Limpar filtros</UiButton>
          <UiButton v-else variant="primary" to="/products">Ver catálogo de produtos</UiButton>
        </template>
      </UiDataTable>
    </UiCard>

    <!-- Atalhos do domínio (só rotas reais do inventário) -->
    <UiCard title="Continuar pelo estoque" subtitle="De onde os alertas se conectam ao resto da operação.">
      <div class="al-links" role="group" aria-label="Atalhos do domínio de estoque">
        <UiButton variant="ghost" to="/products">
          <template #icon-left><span aria-hidden="true">▦</span></template>
          Catálogo de produtos
        </UiButton>
        <UiButton variant="ghost" to="/orders">
          <template #icon-left><span aria-hidden="true">▤</span></template>
          Pedidos de reposição
        </UiButton>
        <UiButton variant="ghost" to="/">
          <template #icon-left><span aria-hidden="true">◧</span></template>
          Painel geral
        </UiButton>
      </div>
    </UiCard>

    <template #footer>
      <span>Ancorado aos requisitos REQ-STOCKPILOT-0007 e REQ-STOCKPILOT-0005.</span>
    </template>

    <!-- Modal: sugestão da IA (dry-run, requer confirmação) -->
    <UiModal v-model:open="aiOpen" :title="aiTitle" width="md">
      <UiLoadingState v-if="aiLoading" variant="spinner" title="Consultando a IA…" />
      <UiErrorState
        v-else-if="aiError"
        :message="aiError"
        :code="aiErrorCode"
        :retryable="aiRetryable"
        @retry="retryAi"
      >
        <template #action>
          <UiButton v-if="aiTarget" variant="primary" :to="'/products/' + aiTarget.id">Abrir produto</UiButton>
        </template>
      </UiErrorState>
      <div v-else-if="aiResult" class="al-ai">
        <div class="al-ai-headline">
          <span class="al-ai-qty">{{ format.formatNumber(aiSuggestion.suggested_quantity) }}</span>
          <span class="al-ai-qty-label">unidades sugeridas</span>
          <UiStatusBadge
            v-if="aiSuggestion.confidence"
            :tone="confidenceTone(aiSuggestion.confidence)"
            :status="aiSuggestion.confidence"
            :label="confidenceLabel(aiSuggestion.confidence)"
            size="sm"
          />
        </div>
        <p v-if="aiSuggestion.rationale" class="al-ai-rationale">{{ aiSuggestion.rationale }}</p>
        <div v-if="aiSources.length" class="al-ai-sources">
          <p class="al-ai-sources-title">Fundamentado em (dados reais)</p>
          <ul class="al-ai-source-list">
            <li v-for="(s, i) in aiSources" :key="i">{{ s }}</li>
          </ul>
        </div>
        <p class="al-ai-note">
          <span aria-hidden="true">ⓘ </span>
          Isto é um rascunho (dry-run): nenhum pedido foi criado. Confirme para registrar a reposição.
        </p>
      </div>
      <template #footer>
        <UiButton variant="subtle" @click="aiOpen = false">Fechar</UiButton>
        <UiButton
          v-if="aiResult && aiTarget && !aiTarget.has_open_order"
          variant="primary"
          :loading="isBusy(aiTarget.id, 'reorder')"
          @click="confirmFromAi"
        >
          Repor agora
        </UiButton>
      </template>
    </UiModal>

    <!-- Modal: detalhe do erro de envio -->
    <UiModal v-model:open="errOpen" title="Falha de envio ao fornecedor" width="md">
      <div v-if="errTarget" class="al-err">
        <dl class="al-err-meta">
          <div class="al-err-row">
            <dt>Produto</dt>
            <dd>{{ displayName(errTarget) }}</dd>
          </div>
          <div class="al-err-row">
            <dt>Última tentativa</dt>
            <dd>{{ errTarget.last_attempt_at ? format.formatDateTime(errTarget.last_attempt_at) : '—' }}</dd>
          </div>
        </dl>
        <p class="al-err-label">Mensagem retornada</p>
        <pre class="al-err-msg ui-mono">{{ errTarget.last_error }}</pre>
      </div>
      <template #footer>
        <UiButton v-if="errTarget" variant="subtle" :to="'/products/' + errTarget.id">Abrir produto</UiButton>
        <UiButton
          v-if="errTarget"
          variant="primary"
          :loading="isBusy(errTarget.id, 'reorder')"
          :disabled="errTarget.has_open_order"
          @click="reorderNow(errTarget)"
        >
          Tentar repor de novo
        </UiButton>
        <UiButton variant="ghost" @click="errOpen = false">Fechar</UiButton>
      </template>
    </UiModal>
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
  UiButton,
  UiModal,
  UiLoadingState,
  UiErrorState,
  useToast,
  useConfirm,
  format,
} from '../ui/index.js';
import { alerts as alertsApi } from '../api.js';

// ---------------------------------------------------------------------------
// Endpoints REAIS (documentados no OpenAPI canônico do app):
//   • GET  /v1/alerts                          -> lista de alertas do tenant
//   • POST /v1/products/{id}/reorder           -> reposição idempotente
//   • POST /v1/products/{id}/suggest-reorder   -> sugestão da IA (dry-run)
// O recurso `alerts` da api.js cobre a listagem. As rotas de ação são
// sub-recursos de /v1/products que a fábrica REST genérica não expõe; chamamos
// os endpoints REAIS documentados via fetch ao MESMO base path da api.js.
// ---------------------------------------------------------------------------

// Base idêntica à de api.js (subpath sob o ingress). Sem template literals,
// só concatenação — espelha exatamente o cliente gerado pela Forge.
const API_BASE = (import.meta.env && import.meta.env.VITE_API_BASE_URL) || '/stockpilot/api';
async function postSubresource(resource, id, action, body) {
  const res = await fetch(API_BASE + '/v1/' + resource + '/' + id + '/' + action, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const e = new Error((data && data.error && data.error.message) || ('HTTP ' + res.status));
    e.status = res.status;
    throw e;
  }
  return data;
}
const reorderFn = (id) => postSubresource('products', id, 'reorder');
const suggestFn = (id) => postSubresource('products', id, 'suggest-reorder');

const router = useRouter();
const toast = useToast();
const confirm = useConfirm();

function navigateToProduct(row) {
  router.push('/products/' + row.id);
}

// ---------------------------------------------------------------------------
// Estado da lista (loading / error / normal / empty cobertos).
// ---------------------------------------------------------------------------
const alerts = ref([]);
const loading = ref(false);
const error = ref(null);

// Erro de página (whole-page) só quando NUNCA carregou nada (primeiro fetch).
const pageError = computed(() =>
  error.value && !alerts.value.length && !everLoaded.value ? messageOf(error.value) : null,
);
// Depois do primeiro sucesso, erros de refetch ficam DENTRO da tabela (com retry).
const tableError = computed(() =>
  error.value && (everLoaded.value || alerts.value.length) ? messageOf(error.value) : null,
);
const everLoaded = ref(false);
const messageOf = (e) => (e && e.message) || 'Falha ao carregar alertas.';

async function load() {
  loading.value = true;
  error.value = null;
  try {
    // Contrato único do resourceFactory: list() resolve { data, total }.
    const res = await alertsApi.list();
    alerts.value = res.data || [];
    everLoaded.value = true;
  } catch (e) {
    error.value = e;
    alerts.value = [];
  } finally {
    loading.value = false;
  }
}
const reload = load;

// ---------------------------------------------------------------------------
// Modelo de gravidade. Ranqueia o que o operador deve atacar primeiro:
//   1) RUPTURA sem pedido aberto  (sangrando, sem cobertura)
//   2) RUPTURA com pedido aberto  (cobertura a caminho)
//   3) ERROR  sem pedido aberto   (envio falhou e nada a caminho)
//   4) ERROR  com pedido aberto
//   5) demais. Dentro do nível, maior déficit relativo vem antes.
// ---------------------------------------------------------------------------
const isRuptura = (a) => a.alert_type === 'RUPTURA' || a.status === 'RUPTURA';

function shortfall(a) {
  return Math.max(0, (Number(a.min_stock) || 0) - (Number(a.current_stock) || 0));
}
function coveragePct(a) {
  const min = Number(a.min_stock) || 0;
  if (min <= 0) return 100;
  return Math.max(0, Math.min(100, Math.round(((Number(a.current_stock) || 0) / min) * 100)));
}
function coverageBucket(a) {
  // Bucket discreto p/ a largura da barra (CSP-safe: largura por classe, sem style).
  return String(Math.min(100, Math.max(0, Math.round(coveragePct(a) / 10) * 10)));
}
function severityScore(a) {
  const noOrder = !a.has_open_order;
  let base;
  if (isRuptura(a) && noOrder) base = 0;
  else if (isRuptura(a)) base = 1;
  else if (a.alert_type === 'ERROR' && noOrder) base = 2;
  else if (a.alert_type === 'ERROR') base = 3;
  else base = 4;
  const min = Number(a.min_stock) || 0;
  const rel = min > 0 ? shortfall(a) / min : 0;
  return base - Math.min(0.99, rel); // déficit relativo desempata
}
function severityTone(a) {
  if (isRuptura(a)) return 'error';
  if (a.alert_type === 'ERROR') return 'warning';
  return 'neutral';
}

// ---------------------------------------------------------------------------
// Filtros / busca / ordenação (cliente — a API devolve o conjunto completo).
// ---------------------------------------------------------------------------
const search = ref('');
const typeFilter = ref(''); // '' | 'RUPTURA' | 'ERROR' | 'no-order'
const sortMode = ref('severity'); // severity | shortfall | name

const countRuptura = computed(() => alerts.value.filter(isRuptura).length);
const countErro = computed(() => alerts.value.filter((a) => a.alert_type === 'ERROR').length);
const countNoOrder = computed(() => alerts.value.filter((a) => !a.has_open_order).length);

const typeOptions = computed(() => [
  { value: '', label: 'Todos', tone: 'neutral', count: alerts.value.length || null },
  { value: 'RUPTURA', label: 'Ruptura', tone: 'error', count: countRuptura.value || null },
  { value: 'ERROR', label: 'Falha de envio', tone: 'warning', count: countErro.value || null },
  { value: 'no-order', label: 'Sem pedido', tone: 'running', count: countNoOrder.value || null },
]);

const hasActiveFilters = computed(() => !!search.value.trim() || !!typeFilter.value);
function resetFilters() {
  search.value = '';
  typeFilter.value = '';
}

const visibleAlerts = computed(() => {
  const q = search.value.trim().toLowerCase();
  let rows = alerts.value.filter((a) => {
    if (q && !displayName(a).toLowerCase().includes(q)) return false;
    if (typeFilter.value === 'RUPTURA') return isRuptura(a);
    if (typeFilter.value === 'ERROR') return a.alert_type === 'ERROR';
    if (typeFilter.value === 'no-order') return !a.has_open_order;
    return true;
  });
  rows = [...rows];
  if (sortMode.value === 'name') {
    rows.sort((a, b) => displayName(a).localeCompare(displayName(b), 'pt-BR'));
  } else if (sortMode.value === 'shortfall') {
    rows.sort((a, b) => shortfall(b) - shortfall(a));
  } else {
    rows.sort((a, b) => severityScore(a) - severityScore(b));
  }
  return rows;
});

// Posição (1-based) na ordenação por gravidade — exibida como "rank".
const severityOrder = computed(() => {
  const ordered = [...alerts.value].sort((a, b) => severityScore(a) - severityScore(b));
  const map = new Map();
  ordered.forEach((a, i) => map.set(a.id, i + 1));
  return map;
});
const severityRank = (a) => severityOrder.value.get(a.id) ?? '·';
// Rótulo acessível: a posição de gravidade (rank) é numérica e visualmente
// pequena; AT precisa do contexto "Prioridade N de TOTAL por gravidade".
function rankLabel(a) {
  const pos = severityOrder.value.get(a.id);
  if (!pos) return 'Prioridade não classificada';
  return 'Prioridade ' + pos + ' de ' + alerts.value.length + ' por gravidade';
}

// Pior caso ativo: ruptura sem pedido, maior déficit.
const topCritical = computed(() => {
  const critical = alerts.value
    .filter((a) => isRuptura(a) && !a.has_open_order)
    .sort((a, b) => shortfall(b) - shortfall(a));
  return critical[0] || null;
});

// ---------------------------------------------------------------------------
// KPIs (derivados do conjunto real).
// ---------------------------------------------------------------------------
const kpis = computed(() => ({
  total: alerts.value.length,
  ruptura: countRuptura.value,
  erro: countErro.value,
  semPedido: countNoOrder.value,
}));

const tableSummary = computed(() => {
  if (loading.value) return 'Carregando…';
  if (!alerts.value.length) return 'Nenhum alerta ativo';
  const shown = visibleAlerts.value.length;
  return hasActiveFilters.value
    ? shown + ' de ' + alerts.value.length + ' alerta(s)'
    : alerts.value.length + ' alerta(s) priorizados por gravidade';
});

const emptyState = computed(() =>
  hasActiveFilters.value
    ? {
        title: 'Nenhum alerta no filtro',
        description: 'Nenhum alerta corresponde à busca/filtros atuais. Ajuste os critérios ou limpe os filtros.',
        icon: 'search',
      }
    : {
        title: 'Tudo sob controle',
        description: 'Nenhum produto em ruptura nem falha de envio ao fornecedor. Os alertas aparecem aqui assim que surgirem.',
        icon: 'ok',
      },
);

// ---------------------------------------------------------------------------
// Colunas + rótulos/tons de apoio.
// ---------------------------------------------------------------------------
const columns = [
  { key: 'name', label: 'Produto' },
  { key: 'alert_type', label: 'Tipo' },
  { key: 'current_stock', label: 'Estoque / mínimo' },
  { key: 'has_open_order', label: 'Cobertura' },
  { key: 'last_error', label: 'Último erro' },
  { key: 'last_attempt_at', label: 'Última tentativa' },
  { key: 'actions', label: 'Ações', align: 'right' },
];

const displayName = (a) => String((a && a.name) || ('Produto #' + (a && a.id)));
function alertTypeLabel(v) {
  if (v === 'RUPTURA') return 'Ruptura';
  if (v === 'ERROR') return 'Falha de envio';
  return format.humanize(v);
}
function alertTypeTone(v) {
  if (v === 'RUPTURA') return 'error';
  if (v === 'ERROR') return 'warning';
  return 'neutral';
}
function shortfallLabel(a) {
  const gap = shortfall(a);
  return gap <= 0 ? 'no mínimo' : 'faltam ' + format.formatNumber(gap);
}
function truncate(s, n) {
  const str = String(s || '');
  return str.length > n ? str.slice(0, n - 1) + '…' : str;
}
function confidenceLabel(c) {
  return { low: 'Confiança baixa', medium: 'Confiança média', high: 'Confiança alta' }[c] || format.humanize(c);
}
function confidenceTone(c) {
  return { low: 'warning', medium: 'running', high: 'success' }[c] || 'neutral';
}

// ---------------------------------------------------------------------------
// Estado de "ocupado" por linha+ação (spinner no botão certo).
// ---------------------------------------------------------------------------
const busyId = ref(null);
const busyAction = ref('');
const isBusy = (id, action) => busyId.value === id && busyAction.value === action;

// ---------------------------------------------------------------------------
// Repor agora (POST /v1/products/{id}/reorder) — confirmação + toast + refresh.
// 200 = idempotente (já havia pedido aberto → deduped); 201 = criado.
// ---------------------------------------------------------------------------
async function reorderNow(row) {
  if (!row || row.has_open_order) return;
  const ok = await confirm({
    title: 'Repor estoque agora',
    message:
      'Criar um pedido de reposição para "' +
      displayName(row) +
      '"? O pedido é enviado ao fornecedor de forma assíncrona e idempotente.',
    confirmLabel: 'Repor agora',
    cancelLabel: 'Cancelar',
  });
  if (!ok) return;
  busyId.value = row.id;
  busyAction.value = 'reorder';
  try {
    const res = await reorderFn(row.id);
    if (res && res.deduped) {
      toast.info('Já havia uma reposição aberta para "' + displayName(row) + '". Nada duplicado.');
    } else {
      toast.success('Reposição criada para "' + displayName(row) + '" e enviada ao fornecedor.');
    }
    if (errTarget.value && errTarget.value.id === row.id) errOpen.value = false;
    if (aiTarget.value && aiTarget.value.id === row.id) aiOpen.value = false;
    await load();
  } catch (e) {
    toast.error('Não foi possível criar a reposição.', {
      detail: e && e.message,
      code: e && e.status ? 'HTTP ' + e.status : '',
    });
  } finally {
    busyId.value = null;
    busyAction.value = '';
  }
}

// ---------------------------------------------------------------------------
// Sugestão da IA (POST /v1/products/{id}/suggest-reorder) — dry-run em modal.
// Fail-closed: 503 (sem chave) e 502 (saída fora do schema) viram mensagens
// claras; não cria pedido — o operador confirma via "Repor agora".
// ---------------------------------------------------------------------------
const aiOpen = ref(false);
const aiLoading = ref(false);
const aiError = ref('');
const aiErrorCode = ref('');
const aiRetryable = ref(true);
const aiResult = ref(null);
const aiTarget = ref(null);

const aiSuggestion = computed(() => (aiResult.value && aiResult.value.suggestion) || {});
const aiSources = computed(() => {
  const s = aiSuggestion.value.sources;
  if (Array.isArray(s) && s.length) return s;
  const g = aiResult.value && aiResult.value.grounding;
  return (g && Array.isArray(g.sources) && g.sources) || [];
});
const aiTitle = computed(() =>
  aiTarget.value ? 'Sugestão da IA · ' + displayName(aiTarget.value) : 'Sugestão da IA',
);

async function suggestFor(row) {
  if (!row) return;
  aiTarget.value = row;
  busyId.value = row.id;
  busyAction.value = 'suggest';
  aiOpen.value = true;
  await runSuggest(row);
  busyId.value = null;
  busyAction.value = '';
}
async function runSuggest(row) {
  aiLoading.value = true;
  aiError.value = '';
  aiErrorCode.value = '';
  aiResult.value = null;
  try {
    aiResult.value = await suggestFn(row.id);
  } catch (e) {
    const status = e && e.status;
    aiErrorCode.value = status ? 'HTTP ' + status : '';
    if (status === 503) {
      aiError.value = 'Assistente de IA indisponível no momento (não configurado). Você ainda pode repor manualmente.';
      aiRetryable.value = false;
    } else if (status === 502) {
      aiError.value = 'A IA retornou uma resposta fora do formato esperado. Tente novamente em instantes.';
      aiRetryable.value = true;
    } else {
      aiError.value = (e && e.message) || 'Não foi possível obter a sugestão da IA.';
      aiRetryable.value = true;
    }
  } finally {
    aiLoading.value = false;
  }
}
function retryAi() {
  if (aiTarget.value) runSuggest(aiTarget.value);
}
async function confirmFromAi() {
  if (aiTarget.value) await reorderNow(aiTarget.value);
}

// ---------------------------------------------------------------------------
// Detalhe do erro de envio (modal).
// ---------------------------------------------------------------------------
const errOpen = ref(false);
const errTarget = ref(null);
function openError(row) {
  errTarget.value = row;
  errOpen.value = true;
}

// ---------------------------------------------------------------------------
// Exportar CSV (cliente, sobre o conjunto visível; CSP-safe via Blob).
// ---------------------------------------------------------------------------
function csvCell(v) {
  const s = v == null ? '' : String(v);
  return /[",\n;]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
function exportCsv() {
  const rows = visibleAlerts.value;
  if (!rows.length) {
    toast.warning('Nada para exportar.');
    return;
  }
  const head = ['Produto', 'ID', 'Tipo', 'Estoque atual', 'Estoque mínimo', 'Pedido aberto', 'Último erro', 'Última tentativa'];
  const lines = [head.join(';')];
  for (const a of rows) {
    lines.push(
      [
        csvCell(a.name),
        csvCell(a.id),
        csvCell(alertTypeLabel(a.alert_type)),
        csvCell(a.current_stock),
        csvCell(a.min_stock),
        csvCell(a.has_open_order ? 'Sim' : 'Não'),
        csvCell(a.last_error),
        csvCell(a.last_attempt_at),
      ].join(';'),
    );
  }
  try {
    const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'alertas-estoque-' + new Date().toISOString().slice(0, 10) + '.csv';
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    toast.success('CSV exportado (' + rows.length + ' alerta(s)).');
  } catch (e) {
    toast.error('Falha ao exportar CSV', { detail: e && e.message });
  }
}

onMounted(load);
</script>

<style scoped>
/* ---- KPIs ---- */
.al-kpis {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: var(--ui-space-4);
}

/* ---- Faixa de destaque (pior caso) ---- */
.al-spotlight {
  display: flex;
  align-items: center;
  gap: var(--ui-space-4);
  margin-top: var(--ui-space-4);
  padding: var(--ui-space-4) var(--ui-space-5);
  border: 1px solid rgb(var(--ui-danger) / 0.4);
  border-left: 4px solid rgb(var(--ui-danger));
  border-radius: var(--ui-radius-lg);
  background: rgb(var(--ui-danger) / 0.08);
}
.al-spotlight-icon {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: var(--ui-radius-pill);
  background: rgb(var(--ui-danger));
  color: rgb(var(--ui-accent-fg));
  font-family: var(--ui-font-display);
  font-weight: 800;
  line-height: 1;
}
.al-spotlight-body { flex: 1 1 auto; min-width: 0; }
.al-spotlight-title {
  margin: 0;
  font-weight: 700;
  color: rgb(var(--ui-fg));
  font-family: var(--ui-font-display);
}
.al-spotlight-desc { margin: 2px 0 0; color: rgb(var(--ui-muted)); font-size: var(--ui-text-sm); }
.al-spotlight-actions { flex-shrink: 0; }

/* ---- Toolbar (busca + chips + ordenar) ---- */
.al-toolbar {
  display: flex;
  align-items: center;
  gap: var(--ui-space-4);
  flex-wrap: wrap;
}
.al-search {
  position: relative;
  display: flex;
  align-items: center;
  flex: 1 1 280px;
  min-width: 240px;
}
.al-search-icon {
  position: absolute;
  left: 12px;
  color: rgb(var(--ui-muted));
  font-size: 1.05rem;
  pointer-events: none;
}
.al-search-input {
  width: 100%;
  font: inherit;
  color: rgb(var(--ui-fg));
  background: rgb(var(--ui-surface));
  border: 1px solid rgb(var(--ui-border-strong));
  border-radius: var(--ui-radius-md);
  padding: 9px 34px;
}
.al-search-input::placeholder { color: rgb(var(--ui-faint)); }
.al-search-input:focus { border-color: rgb(var(--ui-accent)); outline: none; }
.al-search-clear {
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
.al-search-clear:hover { background: rgb(var(--ui-border)); color: rgb(var(--ui-fg)); }
.al-search-clear:focus-visible { outline: 2px solid rgb(var(--ui-accent)); outline-offset: 2px; }

.al-chip-group { display: flex; align-items: center; gap: var(--ui-space-2); flex-wrap: wrap; }
.al-chip-legend {
  font-size: var(--ui-text-xs);
  font-weight: 600;
  color: rgb(var(--ui-muted));
  text-transform: uppercase;
  letter-spacing: .04em;
}
.al-chip {
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
.al-chip:hover { border-color: rgb(var(--ui-accent)); color: rgb(var(--ui-fg)); }
.al-chip:focus-visible { outline: 2px solid rgb(var(--ui-accent)); outline-offset: 2px; }
.al-chip[data-active="true"] {
  background: rgb(var(--ui-accent) / 0.12);
  border-color: rgb(var(--ui-accent));
  color: rgb(var(--ui-accent-strong));
}
.al-chip-dot { width: 7px; height: 7px; border-radius: 50%; background: rgb(var(--ui-faint)); }
.al-chip[data-tone="error"] .al-chip-dot { background: rgb(var(--ui-danger)); }
.al-chip[data-tone="warning"] .al-chip-dot { background: rgb(var(--ui-warn)); }
.al-chip[data-tone="running"] .al-chip-dot { background: rgb(var(--ui-accent)); }
.al-chip[data-tone="neutral"] .al-chip-dot { background: rgb(var(--ui-faint)); }
.al-chip-count {
  background: rgb(var(--ui-surface-2));
  color: rgb(var(--ui-muted));
  border-radius: var(--ui-radius-pill);
  padding: 0 6px;
  font-size: var(--ui-text-xs);
  min-width: 16px;
  text-align: center;
}
.al-chip[data-active="true"] .al-chip-count {
  background: rgb(var(--ui-accent) / 0.2);
  color: rgb(var(--ui-accent-strong));
}

.al-sort { display: flex; align-items: center; gap: var(--ui-space-2); margin-left: auto; }
.al-sort-label {
  font-size: var(--ui-text-xs);
  font-weight: 600;
  color: rgb(var(--ui-muted));
  text-transform: uppercase;
  letter-spacing: .04em;
}
.al-sort-select {
  font: inherit;
  color: rgb(var(--ui-fg));
  background: rgb(var(--ui-surface));
  border: 1px solid rgb(var(--ui-border-strong));
  border-radius: var(--ui-radius-sm);
  padding: 7px 10px;
}
.al-sort-select:focus { border-color: rgb(var(--ui-accent)); outline: none; }

.al-active-filters {
  display: flex;
  align-items: center;
  gap: var(--ui-space-3);
  font-size: var(--ui-text-sm);
}

/* ---- Célula: produto + rank ---- */
.al-product-cell { display: flex; align-items: center; gap: var(--ui-space-3); }
.al-rank {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border-radius: var(--ui-radius-pill);
  font-size: var(--ui-text-xs);
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  background: rgb(var(--ui-surface-2));
  color: rgb(var(--ui-muted));
  border: 1px solid rgb(var(--ui-border));
}
.al-rank[data-tone="error"] {
  background: rgb(var(--ui-danger) / 0.14);
  color: rgb(var(--ui-danger));
  border-color: rgb(var(--ui-danger) / 0.3);
}
.al-rank[data-tone="warning"] {
  background: rgb(var(--ui-warn) / 0.16);
  color: rgb(var(--ui-warn));
  border-color: rgb(var(--ui-warn) / 0.3);
}
.al-product-text { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
.al-product-name { font-weight: 600; color: rgb(var(--ui-fg)); }
.al-product-id { font-size: var(--ui-text-xs); color: rgb(var(--ui-faint)); font-variant-numeric: tabular-nums; }

/* ---- Célula: estoque + gauge ---- */
.al-stock-cell { display: flex; flex-direction: column; gap: 4px; min-width: 18ch; }
.al-stock-figures { display: flex; align-items: baseline; gap: 6px; }
.al-stock-now { font-weight: 700; font-variant-numeric: tabular-nums; color: rgb(var(--ui-fg)); }
.al-stock-now[data-tone="error"] { color: rgb(var(--ui-danger)); }
.al-stock-now[data-tone="warning"] { color: rgb(var(--ui-warn)); }
.al-stock-min { font-size: var(--ui-text-xs); color: rgb(var(--ui-muted)); }
.al-gauge {
  position: relative;
  height: 6px;
  width: 100%;
  background: rgb(var(--ui-surface-2));
  border-radius: var(--ui-radius-pill);
  overflow: hidden;
}
.al-gauge-fill {
  position: absolute;
  inset: 0 auto 0 0;
  height: 100%;
  border-radius: var(--ui-radius-pill);
  background: rgb(var(--ui-faint));
  transition: width .2s ease;
}
.al-gauge-fill[data-tone="error"] { background: rgb(var(--ui-danger)); }
.al-gauge-fill[data-tone="warning"] { background: rgb(var(--ui-warn)); }
/* Largura por bucket discreto (CSP-safe: sem style inline). */
.al-gauge-fill[data-pct="0"] { width: 3%; }
.al-gauge-fill[data-pct="10"] { width: 10%; }
.al-gauge-fill[data-pct="20"] { width: 20%; }
.al-gauge-fill[data-pct="30"] { width: 30%; }
.al-gauge-fill[data-pct="40"] { width: 40%; }
.al-gauge-fill[data-pct="50"] { width: 50%; }
.al-gauge-fill[data-pct="60"] { width: 60%; }
.al-gauge-fill[data-pct="70"] { width: 70%; }
.al-gauge-fill[data-pct="80"] { width: 80%; }
.al-gauge-fill[data-pct="90"] { width: 90%; }
.al-gauge-fill[data-pct="100"] { width: 100%; }
.al-stock-gap { font-size: var(--ui-text-xs); color: rgb(var(--ui-muted)); }

/* ---- Célula: link de erro ---- */
.al-errlink {
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
.al-errlink:hover .al-errlink-text { text-decoration: underline; }
.al-errlink:focus-visible { outline: 2px solid rgb(var(--ui-accent)); outline-offset: 2px; border-radius: var(--ui-radius-sm); }
.al-errlink-icon { flex-shrink: 0; }
.al-errlink-text { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.al-when { font-size: var(--ui-text-sm); color: rgb(var(--ui-muted)); white-space: nowrap; }

/* ---- Ações por linha ---- */
.al-actions {
  display: inline-flex;
  align-items: center;
  gap: var(--ui-space-2);
  justify-content: flex-end;
  flex-wrap: wrap;
}

/* ---- Atalhos de domínio ---- */
.al-links { display: flex; flex-wrap: wrap; gap: var(--ui-space-3); }

/* ---- Modal: sugestão da IA ---- */
.al-ai { display: flex; flex-direction: column; gap: var(--ui-space-4); }
.al-ai-headline { display: flex; align-items: baseline; gap: var(--ui-space-3); flex-wrap: wrap; }
.al-ai-qty {
  font-family: var(--ui-font-display);
  font-size: 2.2rem;
  font-weight: 700;
  line-height: 1;
  color: rgb(var(--ui-accent-strong));
  font-variant-numeric: tabular-nums;
}
.al-ai-qty-label { color: rgb(var(--ui-muted)); font-size: var(--ui-text-sm); }
.al-ai-rationale {
  margin: 0;
  color: rgb(var(--ui-fg));
  line-height: 1.55;
  padding: var(--ui-space-3) var(--ui-space-4);
  background: rgb(var(--ui-surface-2));
  border-radius: var(--ui-radius-md);
  border-left: 3px solid rgb(var(--ui-accent));
}
.al-ai-sources-title {
  margin: 0 0 var(--ui-space-2);
  font-size: var(--ui-text-xs);
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: .04em;
  color: rgb(var(--ui-muted));
}
.al-ai-source-list {
  margin: 0;
  padding-left: var(--ui-space-5);
  display: flex;
  flex-direction: column;
  gap: 2px;
  color: rgb(var(--ui-muted));
  font-size: var(--ui-text-sm);
}
.al-ai-note { margin: 0; font-size: var(--ui-text-sm); color: rgb(var(--ui-muted)); }

/* ---- Modal: erro de envio ---- */
.al-err { display: flex; flex-direction: column; gap: var(--ui-space-4); }
.al-err-meta { margin: 0; display: grid; gap: var(--ui-space-2); }
.al-err-row { display: grid; grid-template-columns: 140px 1fr; gap: var(--ui-space-3); align-items: center; }
.al-err-row dt { color: rgb(var(--ui-muted)); font-size: var(--ui-text-sm); font-weight: 600; }
.al-err-row dd { margin: 0; color: rgb(var(--ui-fg)); }
.al-err-label {
  margin: 0;
  font-size: var(--ui-text-xs);
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: .04em;
  color: rgb(var(--ui-muted));
}
.al-err-msg {
  margin: 0;
  padding: var(--ui-space-3) var(--ui-space-4);
  background: rgb(var(--ui-danger) / 0.08);
  border: 1px solid rgb(var(--ui-danger) / 0.3);
  border-radius: var(--ui-radius-md);
  color: rgb(var(--ui-fg));
  font-size: var(--ui-text-sm);
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 240px;
  overflow: auto;
}

/* ---- Responsivo ---- */
@media (max-width: 1080px) {
  .al-kpis { grid-template-columns: repeat(2, 1fr); }
}
@media (max-width: 860px) {
  .al-toolbar { flex-direction: column; align-items: stretch; }
  .al-sort { margin-left: 0; }
  .al-actions { justify-content: flex-start; }
  .al-spotlight { flex-direction: column; align-items: flex-start; }
}
@media (max-width: 560px) {
  .al-kpis { grid-template-columns: 1fr; }
  .al-err-row { grid-template-columns: 1fr; gap: 2px; }
}
</style>
