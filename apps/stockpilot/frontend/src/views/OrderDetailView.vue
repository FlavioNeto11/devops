<template>
  <UiPageLayout
    width="wide"
    eyebrow="StockPilot — Reposição"
    :title="headerTitle"
    :subtitle="headerSubtitle"
    :loading="loading"
    :error="loadError"
    @retry="reload"
  >
    <!-- DetailHeader: ações -->
    <template #actions>
      <UiButton variant="ghost" to="/orders">
        <template #icon-left><span aria-hidden="true">←</span></template>
        Voltar aos pedidos
      </UiButton>
      <UiButton
        v-if="order && order.product_id != null"
        variant="ghost"
        :to="'/products/' + order.product_id"
      >Ver produto</UiButton>
      <UiButton variant="subtle" :loading="refreshing" @click="refreshAll">
        <template #icon-left><span aria-hidden="true">↻</span></template>
        Atualizar
      </UiButton>
    </template>

    <!-- estado VAZIO: pedido não encontrado (resposta válida, sem erro de rede) -->
    <UiCard v-if="loaded && !order">
      <UiEmptyState
        icon="order"
        title="Pedido não encontrado"
        :description="notFoundDescription"
      >
        <template #action>
          <UiButton to="/orders">Ver todos os pedidos</UiButton>
        </template>
      </UiEmptyState>
    </UiCard>

    <!-- estado NORMAL -->
    <template v-else-if="order">
      <!-- DetailHeader (faixa de status) -->
      <UiCard padded>
        <div class="od-hero" :data-status="statusTone">
          <div class="od-hero-main">
            <span class="od-hero-glyph" aria-hidden="true">{{ statusGlyph }}</span>
            <div class="od-hero-titles">
              <p class="od-hero-eyebrow">Pedido de reposição</p>
              <h2 class="od-hero-name">{{ productLabel }}</h2>
              <p class="od-hero-narr ui-muted">{{ statusNarrative }}</p>
            </div>
          </div>
          <div class="od-hero-aside">
            <UiStatusBadge :status="order.status" :label="statusLabelText" size="lg" />
            <dl class="od-hero-facts">
              <div v-if="order.supplier_id" class="od-fact">
                <dt>Fornecedor</dt>
                <dd>
                  <RouterLink :to="'/suppliers/' + order.supplier_id" class="od-supplier-link">
                    {{ order.supplier_name || ('Fornecedor #' + order.supplier_id) }}
                  </RouterLink>
                </dd>
              </div>
              <div class="od-fact">
                <dt>Ref. do fornecedor</dt>
                <dd>
                  <button
                    v-if="order.external_ref"
                    type="button"
                    class="od-ref"
                    :aria-label="'Copiar referência ' + order.external_ref"
                    @click="copy(order.external_ref, 'Referência copiada.')"
                  >
                    <span class="ui-mono">{{ order.external_ref }}</span>
                    <span class="od-ref-copy" aria-hidden="true">⧉</span>
                  </button>
                  <span v-else class="ui-muted">Ainda não emitida</span>
                </dd>
              </div>
              <div class="od-fact">
                <dt>Criado em</dt>
                <dd>{{ fmtDateTime(order.created_at) }}</dd>
              </div>
            </dl>
          </div>
        </div>
      </UiCard>

      <!-- Itens do pedido (lines) -->
      <UiCard title="Itens do pedido" subtitle="Produtos e quantidades desta reposição.">
        <UiDataTable
          :columns="linesColumns"
          :rows="orderLines"
          row-key="product_id"
          density="compact"
          :empty="linesEmpty"
        >
          <template #cell-product_name="{ row }">
            <RouterLink v-if="row.product_id != null" :to="'/products/' + row.product_id">
              {{ row.product_name || ('Produto #' + row.product_id) }}
            </RouterLink>
            <span v-else class="ui-muted">—</span>
          </template>
          <template #cell-current_stock="{ value }">
            <span v-if="value != null">{{ value }}</span>
            <span v-else class="ui-muted">—</span>
          </template>
          <template #cell-min_stock="{ value }">
            <span v-if="value != null">{{ value }}</span>
            <span v-else class="ui-muted">—</span>
          </template>
          <template #cell-reorder_qty="{ value }">
            <strong>{{ value }}</strong>
          </template>
        </UiDataTable>
      </UiCard>

      <!-- Fornecedor vinculado -->
      <UiCard title="Fornecedor vinculado" subtitle="Fornecedor responsável pelo processamento desta reposição.">
        <div v-if="supplierLoading" class="od-supplier-loading">
          <span class="ui-muted">Carregando fornecedor…</span>
        </div>
        <div v-else-if="supplierError" class="od-callout od-callout-warn" role="alert">
          <span class="od-callout-icon" aria-hidden="true">⚠</span>
          <div class="od-callout-body">
            <p class="od-callout-title">Não foi possível carregar o fornecedor</p>
            <UiButton variant="ghost" size="sm" @click="loadSupplier">Tentar novamente</UiButton>
          </div>
        </div>
        <template v-else-if="supplier">
          <dl class="od-kv">
            <div class="od-kv-row">
              <dt>Nome</dt>
              <dd>
                <RouterLink :to="'/suppliers/' + order.supplier_id">{{ supplier.name }}</RouterLink>
              </dd>
            </div>
            <div class="od-kv-row">
              <dt>Status</dt>
              <dd>
                <UiStatusBadge
                  :status="supplier.active ? 'active' : 'inactive'"
                  :tone="supplier.active ? 'success' : 'neutral'"
                  :label="supplier.active ? 'Ativo' : 'Inativo'"
                />
              </dd>
            </div>
            <div v-if="supplier.gateway_url" class="od-kv-row">
              <dt>Gateway</dt>
              <dd class="ui-mono od-truncate">{{ supplier.gateway_url }}</dd>
            </div>
            <div v-if="supplier.auth_type" class="od-kv-row">
              <dt>Autenticação</dt>
              <dd>{{ supplier.auth_type }}</dd>
            </div>
          </dl>
          <div class="od-supplier-action">
            <UiButton variant="ghost" size="sm" :to="'/suppliers/' + order.supplier_id">
              Ver fornecedor completo →
            </UiButton>
          </div>
        </template>
        <template v-else>
          <UiEmptyState
            icon="supplier"
            title="Sem fornecedor vinculado"
            description="Este pedido não tem um fornecedor específico atribuído."
          />
        </template>
      </UiCard>

      <!-- ErrorCallout: último erro reportado -->
      <UiCard v-if="order.last_error" padded>
        <div class="od-callout" role="alert">
          <span class="od-callout-icon" aria-hidden="true">⚠</span>
          <div class="od-callout-body">
            <p class="od-callout-title">Falha na submissão ao fornecedor</p>
            <p class="od-callout-msg ui-mono">{{ order.last_error }}</p>
            <p class="od-callout-hint ui-muted">
              Mensagem redigida — segredos nunca são exibidos. A trilha de auditoria abaixo registra
              cada tentativa de troca com o fornecedor.
            </p>
          </div>
        </div>
      </UiCard>

      <!-- KPIs de acompanhamento -->
      <div class="od-metrics">
        <UiMetricCard
          label="Status"
          :value="statusLabelText"
          :tone="statusTone"
          :hint="statusHint"
        />
        <UiMetricCard
          label="Tentativas"
          :value="attemptCount"
          :tone="attemptTone"
          :hint="attemptHint"
        />
        <UiMetricCard
          label="Última tentativa"
          :value="lastAttemptLabel"
          tone="neutral"
          :hint="lastAttemptHint"
        />
        <UiMetricCard
          label="Trocas auditadas"
          :value="auditError ? '—' : String(orderAudit.length)"
          :tone="auditError ? 'error' : orderAudit.length ? 'primary' : 'neutral'"
          :hint="auditError ? 'falha ao carregar' : 'registros desta ordem'"
        />
      </div>

      <div class="od-grid">
        <!-- Timeline de transições -->
        <UiCard title="Linha do tempo" subtitle="Transições do pedido até a entrega ou falha.">
          <ol class="od-timeline">
            <li
              v-for="step in timeline"
              :key="step.key"
              class="od-step"
              :data-state="step.state"
            >
              <span class="od-step-marker" aria-hidden="true">
                <span class="od-step-glyph">{{ step.glyph }}</span>
              </span>
              <div class="od-step-body">
                <p class="od-step-title">{{ step.title }}</p>
                <p class="od-step-desc ui-muted">{{ step.description }}</p>
                <p v-if="step.at" class="od-step-at ui-mono">{{ fmtDateTime(step.at) }}</p>
                <p v-else-if="step.state === 'current'" class="od-step-at od-step-now">
                  Em andamento
                </p>
              </div>
            </li>
          </ol>
        </UiCard>

        <!-- Detalhes do pedido (dt/dd) -->
        <UiCard title="Detalhes do pedido" subtitle="Campos completos desta ordem.">
          <dl class="od-kv">
            <div class="od-kv-row">
              <dt>ID do pedido</dt>
              <dd class="ui-mono">#{{ order.id != null ? order.id : id }}</dd>
            </div>
            <div class="od-kv-row">
              <dt>Status</dt>
              <dd><UiStatusBadge :status="order.status" :label="statusLabelText" /></dd>
            </div>
            <div class="od-kv-row">
              <dt>Produto</dt>
              <dd>
                <RouterLink v-if="order.product_id != null" :to="'/products/' + order.product_id">
                  {{ productLabel }}
                </RouterLink>
                <span v-else>{{ productLabel }}</span>
              </dd>
            </div>
            <div class="od-kv-row">
              <dt>Ref. do fornecedor</dt>
              <dd>
                <span v-if="order.external_ref" class="ui-mono">{{ order.external_ref }}</span>
                <span v-else class="ui-muted">—</span>
              </dd>
            </div>
            <div class="od-kv-row">
              <dt>Última tentativa</dt>
              <dd>{{ fmtDateTime(order.last_attempt_at) }}</dd>
            </div>
            <div class="od-kv-row">
              <dt>Criado em</dt>
              <dd>{{ fmtDateTime(order.created_at) }}</dd>
            </div>
          </dl>
        </UiCard>
      </div>

      <!-- AuditTrailTable -->
      <UiCard
        title="Trilha de auditoria"
        subtitle="Cada troca com o fornecedor (payloads sanitizados, erro redigido)."
      >
        <template #actions>
          <UiButton variant="ghost" size="sm" :loading="auditLoading" @click="loadAudit">
            Recarregar
          </UiButton>
        </template>
        <UiDataTable
          :columns="auditColumns"
          :rows="orderAudit"
          row-key="id"
          density="compact"
          clickable-rows
          :loading="auditLoading"
          :error="auditError"
          :sort="auditSort"
          :empty="auditEmpty"
          @retry="loadAudit"
          @row-click="openEntry"
          @update:sort="(s) => (auditSort = s)"
        >
          <template #cell-outcome="{ value }">
            <UiStatusBadge
              :status="value"
              :label="value === 'success' ? 'Sucesso' : 'Falha'"
              :tone="value === 'success' ? 'success' : 'error'"
            />
          </template>
          <template #cell-operation="{ value }">{{ value ? humanize(value) : '—' }}</template>
          <template #cell-attempt="{ value }">
            <span v-if="value != null" class="ui-mono">{{ value }}</span>
            <span v-else class="ui-muted">—</span>
          </template>
          <template #cell-status_code="{ value }">
            <span v-if="value != null" class="ui-mono">{{ value }}</span>
            <span v-else class="ui-muted">—</span>
          </template>
          <template #cell-duration_ms="{ value }">
            <span v-if="value != null">{{ value }} ms</span>
            <span v-else class="ui-muted">—</span>
          </template>
          <template #cell-error_redacted="{ value }">
            <span v-if="value" class="od-audit-err ui-mono">{{ value }}</span>
            <span v-else class="ui-muted">—</span>
          </template>
          <template #cell-created_at="{ value }">{{ fmtDateTime(value) }}</template>
          <template #empty-action>
            <UiButton variant="subtle" to="/orders">Ver todos os pedidos</UiButton>
          </template>
        </UiDataTable>
      </UiCard>
    </template>

    <!-- Inspeção de uma troca auditada -->
    <UiModal v-model:open="entryOpen" title="Detalhe da troca auditada" width="lg">
      <div v-if="activeEntry" class="od-entry">
        <div class="od-entry-head">
          <UiStatusBadge
            :status="activeEntry.outcome"
            :label="activeEntry.outcome === 'success' ? 'Sucesso' : 'Falha'"
            :tone="activeEntry.outcome === 'success' ? 'success' : 'error'"
            size="lg"
          />
          <span class="ui-muted">{{ fmtDateTime(activeEntry.created_at) }}</span>
        </div>
        <dl class="od-kv">
          <div class="od-kv-row">
            <dt>Operação</dt>
            <dd>{{ activeEntry.operation ? humanize(activeEntry.operation) : '—' }}</dd>
          </div>
          <div class="od-kv-row">
            <dt>Tentativa</dt>
            <dd class="ui-mono">{{ activeEntry.attempt ?? '—' }}</dd>
          </div>
          <div class="od-kv-row">
            <dt>HTTP</dt>
            <dd class="ui-mono">{{ activeEntry.status_code ?? '—' }}</dd>
          </div>
          <div class="od-kv-row">
            <dt>Duração</dt>
            <dd>{{ activeEntry.duration_ms != null ? activeEntry.duration_ms + ' ms' : '—' }}</dd>
          </div>
        </dl>
        <div v-if="activeEntry.error_redacted" class="od-callout" role="alert">
          <span class="od-callout-icon" aria-hidden="true">⚠</span>
          <div class="od-callout-body">
            <p class="od-callout-title">Erro (redigido)</p>
            <p class="od-callout-msg ui-mono">{{ activeEntry.error_redacted }}</p>
          </div>
        </div>
        <div class="od-payloads">
          <div class="od-payload">
            <p class="od-payload-label">Payload da requisição (sanitizado)</p>
            <pre class="od-payload-pre ui-mono">{{ prettyEntryRequest }}</pre>
          </div>
          <div class="od-payload">
            <p class="od-payload-label">Resposta (sanitizada)</p>
            <pre class="od-payload-pre ui-mono">{{ prettyEntryResponse }}</pre>
          </div>
        </div>
      </div>
      <template #footer>
        <UiButton variant="ghost" @click="entryOpen = false">Fechar</UiButton>
      </template>
    </UiModal>
  </UiPageLayout>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { RouterLink } from 'vue-router';
import {
  UiPageLayout,
  UiCard,
  UiButton,
  UiStatusBadge,
  UiDataTable,
  UiMetricCard,
  UiEmptyState,
  UiModal,
  useToast,
  format,
} from '../ui/index.js';
import { orders, suppliers } from '../api.js';

const props = defineProps({ id: { type: [String, Number], required: true } });
const toast = useToast();

const fmtDateTime = (v) => format.formatDateTime(v);
const humanize = (v) => format.humanize(v);

// ---- estado: pedido ----------------------------------------------------------
const order = ref(null);
const loading = ref(true);
const loaded = ref(false);
const loadError = ref(null);
const refreshing = ref(false);

// ---- estado: auditoria -------------------------------------------------------
const auditRows = ref([]);
const auditLoading = ref(true);
const auditError = ref(null);
const auditSort = ref({ key: 'created_at', dir: 'desc' });

// ---- estado: fornecedor vinculado -------------------------------------------
const supplier = ref(null);
const supplierLoading = ref(false);
const supplierError = ref(null);

// ---- estado: modal de inspeção ----------------------------------------------
const entryOpen = ref(false);
const activeEntry = ref(null);

function unwrap(res) {
  if (res && typeof res === 'object' && res.data !== undefined) return res.data;
  return res;
}

async function loadSupplier() {
  if (!order.value?.supplier_id) { supplier.value = null; return; }
  supplierLoading.value = true;
  supplierError.value = null;
  try {
    const res = await suppliers.get(order.value.supplier_id);
    supplier.value = unwrap(res);
  } catch (e) {
    supplierError.value = e;
  } finally {
    supplierLoading.value = false;
  }
}

async function loadOrder() {
  loading.value = true;
  loadError.value = null;
  try {
    // Detalhe canônico e autoritativo (GET /v1/orders/{id}): cobre TODOS os estados — incl. os
    // terminais delivered/failed que esta tela existe para mostrar. 404 (inexistente ou de outro
    // tenant) é resposta VÁLIDA → estado vazio "pedido não encontrado", não erro de rede.
    const data = unwrap(await orders.get(props.id));
    order.value = data && data.id !== undefined ? data : data || null;
    loaded.value = true;
    if (order.value?.supplier_id) loadSupplier();
  } catch (e) {
    if (e && e.status === 404) {
      order.value = null;
      loaded.value = true;
    } else {
      loadError.value = e;
    }
  } finally {
    loading.value = false;
  }
}

async function loadAudit() {
  auditLoading.value = true;
  auditError.value = null;
  try {
    // Trilha das trocas com o fornecedor PARA ESTE PEDIDO (GET /v1/orders/{id}/audit) — filtro de
    // domínio no servidor, escopado por tenant+pedido. Não baixa a trilha inteira do tenant.
    const res = await orders.audit(props.id);
    const list = Array.isArray(res) ? res : res && res.data ? res.data : [];
    auditRows.value = list;
  } catch (e) {
    auditError.value = e;
  } finally {
    auditLoading.value = false;
  }
}

// Mount e reload coordenam os dois carregamentos (Promise.all), como refreshAll — evita dois
// ciclos de loading independentes (a auditoria não pisca seu skeleton separado).
function reload() {
  return Promise.all([loadOrder(), loadAudit()]);
}

async function refreshAll() {
  refreshing.value = true;
  try {
    await Promise.all([loadOrder(), loadAudit()]);
    if (!loadError.value && !auditError.value) toast.success('Pedido atualizado.');
    else toast.error('Não foi possível atualizar tudo.');
  } finally {
    refreshing.value = false;
  }
}

async function copy(text, okMsg) {
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(String(text));
      toast.success(okMsg || 'Copiado.');
    } else {
      toast.warning('Cópia automática indisponível neste navegador.');
    }
  } catch {
    toast.error('Não foi possível copiar.');
  }
}

// ---- inspeção de troca -------------------------------------------------------
function openEntry(row) {
  activeEntry.value = row;
  entryOpen.value = true;
}
function safeStringify(value) {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'string') {
    try {
      return JSON.stringify(JSON.parse(value), null, 2);
    } catch {
      return value;
    }
  }
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}
const prettyEntryRequest = computed(() => safeStringify(activeEntry.value?.request_payload));
const prettyEntryResponse = computed(() => safeStringify(activeEntry.value?.response_payload));

// ---- derivações --------------------------------------------------------------
// A trilha já vem escopada ao pedido pelo servidor (GET /v1/orders/{id}/audit). O filtro por
// order_id aqui é só uma SALVAGUARDA defensiva; a ordenação é local (controla a coluna clicada).
const orderAudit = computed(() => {
  if (!order.value) return [];
  const oid = Number(order.value.id != null ? order.value.id : props.id);
  const rows = auditRows.value.filter((r) => Number(r.order_id) === oid);
  const dir = auditSort.value.dir === 'asc' ? 1 : -1;
  const key = auditSort.value.key || 'created_at';
  return [...rows].sort((a, b) => {
    const x = a[key];
    const y = b[key];
    if (x == null) return 1;
    if (y == null) return -1;
    return (x > y ? 1 : x < y ? -1 : 0) * dir;
  });
});

const productLabel = computed(() => {
  if (!order.value) return 'Produto';
  return (
    order.value.product_name ||
    (order.value.product_id != null ? 'Produto #' + order.value.product_id : 'Produto')
  );
});

const headerTitle = computed(() =>
  order.value ? 'Pedido #' + (order.value.id != null ? order.value.id : props.id) : 'Pedido #' + props.id,
);
const headerSubtitle = computed(() => {
  if (loadError.value) return 'Detalhe do pedido de reposição.';
  if (!order.value) return 'Detalhe do pedido de reposição.';
  return 'Acompanhamento da reposição de ' + productLabel.value + '.';
});

const notFoundDescription = computed(() =>
  'O pedido #' +
  props.id +
  ' não existe, foi removido ou pertence a outro tenant. Volte para a lista de pedidos de reposição.',
);

// ---- status ------------------------------------------------------------------
const STATUS = {
  pending: {
    label: 'Pendente',
    tone: 'warning',
    glyph: '🕘',
    hint: 'aguardando processamento',
    narrative: 'Pedido criado e aguardando o worker assumir o job na fila.',
  },
  processing: {
    label: 'Processando',
    tone: 'running',
    glyph: '🚚',
    hint: 'enviando ao fornecedor',
    narrative: 'O worker assumiu o job e está submetendo o pedido ao fornecedor externo.',
  },
  delivered: {
    label: 'Entregue',
    tone: 'success',
    glyph: '✓',
    hint: 'confirmado pelo fornecedor',
    narrative: 'O fornecedor confirmou o pedido. Reposição concluída.',
  },
  failed: {
    label: 'Falhou',
    tone: 'error',
    glyph: '✕',
    hint: 'tentativas esgotadas (DLQ)',
    narrative: 'A submissão ao fornecedor falhou após esgotar as tentativas (DLQ).',
  },
};
const statusMeta = computed(
  () =>
    STATUS[order.value?.status] || {
      label: order.value?.status ? humanize(order.value.status) : 'Desconhecido',
      tone: 'neutral',
      glyph: '•',
      hint: '',
      narrative: 'Status do pedido de reposição.',
    },
);
const statusLabelText = computed(() => statusMeta.value.label);
const statusTone = computed(() => statusMeta.value.tone);
const statusGlyph = computed(() => statusMeta.value.glyph);
const statusHint = computed(() => statusMeta.value.hint);
const statusNarrative = computed(() => statusMeta.value.narrative);

// ---- tentativas / última tentativa ------------------------------------------
// Prefere o campo AUTORITATIVO do pedido (order.attempts), quando o detalhe canônico o expuser.
// Só então recorre à auditoria (Math.max do attempt registrado) como detalhamento das trocas —
// nunca como fonte primária da contagem.
const attemptCount = computed(() => {
  if (!order.value) return '0';
  if (Number.isFinite(Number(order.value.attempts))) return String(Number(order.value.attempts));
  if (order.value.status === 'pending') return '0';
  const attempts = orderAudit.value
    .map((r) => Number(r.attempt))
    .filter((n) => Number.isFinite(n));
  if (attempts.length) return String(Math.max(...attempts));
  return String(orderAudit.value.length);
});
const attemptTone = computed(() => {
  if (order.value?.status === 'failed') return 'error';
  if (order.value?.status === 'delivered') return 'success';
  return 'neutral';
});
const attemptHint = computed(() =>
  order.value?.status === 'failed' ? 'esgotadas (DLQ)' : 'submissões ao fornecedor',
);

const lastAttemptAt = computed(() => {
  if (order.value?.last_attempt_at) return order.value.last_attempt_at;
  const ts = orderAudit.value
    .map((r) => r.created_at)
    .filter(Boolean)
    .sort();
  return ts.length ? ts[ts.length - 1] : null;
});
const lastAttemptLabel = computed(() =>
  lastAttemptAt.value ? fmtDateTime(lastAttemptAt.value) : 'Nenhuma',
);
const lastAttemptHint = computed(() =>
  lastAttemptAt.value ? 'troca mais recente' : 'ainda não houve troca',
);

// ---- timeline determinística -------------------------------------------------
const ORDER_FLOW = ['pending', 'processing', 'delivered'];
function auditTimeFor(predicate) {
  const hit = orderAudit.value
    .filter(predicate)
    .map((r) => r.created_at)
    .filter(Boolean)
    .sort();
  return hit.length ? hit[0] : null;
}
const timeline = computed(() => {
  const status = order.value?.status || 'pending';
  const failed = status === 'failed';
  const idx = ORDER_FLOW.indexOf(status);
  const firstAuditAt = auditTimeFor(() => true);
  const failAuditAt = auditTimeFor((r) => r.outcome === 'failure');
  const okAuditAt = auditTimeFor((r) => r.outcome === 'success');

  const stateFor = (stepIndex) => {
    if (idx < 0) return stepIndex === 0 ? 'current' : 'pending';
    if (stepIndex < idx) return 'done';
    if (stepIndex === idx) return 'current';
    return 'pending';
  };

  const steps = [
    {
      key: 'pending',
      title: 'Pedido criado',
      description: 'Reposição registrada e enfileirada (status pendente).',
      glyph: '①',
      at: order.value?.created_at || null,
      state: failed ? 'done' : stateFor(0),
    },
    {
      key: 'processing',
      title: 'Em processamento',
      description: 'Worker assumiu o job e está submetendo ao fornecedor.',
      glyph: '②',
      at: firstAuditAt,
      state: failed ? 'done' : stateFor(1),
    },
  ];

  if (failed) {
    steps.push({
      key: 'failed',
      title: 'Falha na entrega',
      description: 'Tentativas esgotadas (DLQ). Veja o último erro e a auditoria.',
      glyph: '✕',
      at: failAuditAt || lastAttemptAt.value,
      state: 'failed',
    });
  } else {
    steps.push({
      key: 'delivered',
      title: 'Entregue',
      description: 'Fornecedor confirmou o pedido (status entregue).',
      glyph: '✓',
      at: okAuditAt || (status === 'delivered' ? lastAttemptAt.value : null),
      state: stateFor(2),
    });
  }
  return steps;
});

// ---- Itens do pedido (lines) -------------------------------------------------
const linesColumns = [
  { key: 'product_name', label: 'Produto' },
  { key: 'current_stock', label: 'Estoque atual', align: 'right' },
  { key: 'min_stock', label: 'Estoque mínimo', align: 'right' },
  { key: 'reorder_qty', label: 'Qtd. reposição', align: 'right' },
];

const orderLines = computed(() => {
  if (!order.value) return [];
  return Array.isArray(order.value.lines) ? order.value.lines : [];
});

const linesEmpty = computed(() => ({
  title: 'Sem itens',
  description: 'Nenhum item de reposição registrado para este pedido.',
  icon: 'order',
}));

// ---- AuditTrailTable ---------------------------------------------------------
const auditColumns = [
  { key: 'created_at', label: 'Quando', sortable: true },
  { key: 'operation', label: 'Operação' },
  { key: 'outcome', label: 'Desfecho' },
  { key: 'attempt', label: 'Tentativa', align: 'right', sortable: true },
  { key: 'status_code', label: 'HTTP', align: 'right' },
  { key: 'duration_ms', label: 'Duração', align: 'right', sortable: true },
  { key: 'error_redacted', label: 'Erro (redigido)' },
];

const auditEmpty = computed(() => ({
  title: 'Sem trocas auditadas',
  description:
    order.value?.status === 'pending'
      ? 'Este pedido ainda não foi processado pelo worker.'
      : 'Nenhum registro de auditoria encontrado para este pedido.',
  icon: 'history',
}));

onMounted(reload);
</script>

<style scoped>
/* ---- Hero / DetailHeader ---- */
.od-hero {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ui-space-5);
  flex-wrap: wrap;
}
.od-hero-main {
  display: flex;
  align-items: center;
  gap: var(--ui-space-4);
  min-width: 0;
}
.od-hero-glyph {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 56px;
  height: 56px;
  flex-shrink: 0;
  font-size: 1.7rem;
  border-radius: var(--ui-radius-lg);
  background: rgb(var(--ui-accent) / 0.12);
  border: 1px solid rgb(var(--ui-accent) / 0.28);
  color: rgb(var(--ui-accent-strong));
}
.od-hero[data-status='success'] .od-hero-glyph {
  background: rgb(var(--ui-ok) / 0.14);
  border-color: rgb(var(--ui-ok) / 0.3);
  color: rgb(var(--ui-ok));
}
.od-hero[data-status='warning'] .od-hero-glyph {
  background: rgb(var(--ui-warn) / 0.14);
  border-color: rgb(var(--ui-warn) / 0.3);
  color: rgb(var(--ui-warn));
}
.od-hero[data-status='error'] .od-hero-glyph {
  background: rgb(var(--ui-danger) / 0.12);
  border-color: rgb(var(--ui-danger) / 0.3);
  color: rgb(var(--ui-danger));
}
.od-hero-titles {
  min-width: 0;
}
.od-hero-eyebrow {
  margin: 0;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  font-size: var(--ui-text-xs);
  color: rgb(var(--ui-muted));
  font-weight: 700;
}
.od-hero-name {
  margin: 2px 0 0;
  font-size: var(--ui-text-xl);
}
.od-hero-narr {
  margin: 4px 0 0;
  font-size: var(--ui-text-sm);
}
.od-hero-aside {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: var(--ui-space-3);
  min-width: 0;
}
.od-hero-facts {
  display: flex;
  gap: var(--ui-space-5);
  margin: 0;
  flex-wrap: wrap;
  justify-content: flex-end;
}
.od-fact {
  text-align: right;
}
.od-fact dt {
  font-size: var(--ui-text-xs);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: rgb(var(--ui-muted));
  font-weight: 700;
}
.od-fact dd {
  margin: 4px 0 0;
  font-size: var(--ui-text-sm);
}
.od-ref {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: transparent;
  border: none;
  padding: 0;
  cursor: pointer;
  color: rgb(var(--ui-accent-strong));
  font: inherit;
}
.od-ref:hover {
  text-decoration: underline;
}
.od-ref-copy {
  font-size: var(--ui-text-xs);
  opacity: 0.75;
}

/* ---- ErrorCallout ---- */
.od-callout {
  display: flex;
  gap: var(--ui-space-4);
  align-items: flex-start;
  padding: var(--ui-space-4);
  border-radius: var(--ui-radius-md);
  border: 1px solid rgb(var(--ui-danger) / 0.35);
  background: rgb(var(--ui-danger) / 0.07);
}
.od-callout-icon {
  font-size: 1.4rem;
  color: rgb(var(--ui-danger));
  line-height: 1;
  flex-shrink: 0;
}
.od-callout-body {
  min-width: 0;
}
.od-callout-title {
  margin: 0;
  font-weight: 700;
  color: rgb(var(--ui-danger));
}
.od-callout-msg {
  margin: 6px 0 0;
  font-size: var(--ui-text-sm);
  word-break: break-word;
}
.od-callout-hint {
  margin: 6px 0 0;
  font-size: var(--ui-text-xs);
}

/* ---- Métricas ---- */
.od-metrics {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
  gap: var(--ui-space-4);
}

/* ---- Grid: timeline + detalhes ---- */
.od-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.1fr) minmax(0, 0.9fr);
  gap: var(--ui-space-4);
  align-items: start;
}

/* ---- Timeline ---- */
.od-timeline {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
}
.od-step {
  display: grid;
  grid-template-columns: 32px 1fr;
  gap: var(--ui-space-3);
  position: relative;
  padding-bottom: var(--ui-space-5);
}
.od-step:last-child {
  padding-bottom: 0;
}
.od-step::before {
  content: '';
  position: absolute;
  left: 15px;
  top: 30px;
  bottom: 0;
  width: 2px;
  background: rgb(var(--ui-border));
}
.od-step:last-child::before {
  display: none;
}
.od-step-marker {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 2px solid rgb(var(--ui-border-strong));
  background: rgb(var(--ui-surface));
  color: rgb(var(--ui-muted));
  font-weight: 700;
  font-size: var(--ui-text-sm);
  z-index: 1;
}
.od-step[data-state='done'] .od-step-marker {
  border-color: rgb(var(--ui-accent));
  background: rgb(var(--ui-accent) / 0.12);
  color: rgb(var(--ui-accent-strong));
}
.od-step[data-state='current'] .od-step-marker {
  border-color: rgb(var(--ui-accent));
  background: rgb(var(--ui-accent));
  color: rgb(var(--ui-accent-fg));
}
.od-step[data-state='failed'] .od-step-marker {
  border-color: rgb(var(--ui-danger));
  background: rgb(var(--ui-danger) / 0.14);
  color: rgb(var(--ui-danger));
}
.od-step[data-state='done']::before,
.od-step[data-state='current']::before {
  background: rgb(var(--ui-accent));
}
.od-step-glyph {
  line-height: 1;
}
.od-step-body {
  padding-top: 4px;
  min-width: 0;
}
.od-step-title {
  margin: 0;
  font-weight: 600;
}
.od-step[data-state='pending'] .od-step-title {
  color: rgb(var(--ui-muted));
}
.od-step-desc {
  margin: 2px 0 0;
  font-size: var(--ui-text-sm);
}
.od-step-at {
  margin: 4px 0 0;
  font-size: var(--ui-text-xs);
  color: rgb(var(--ui-faint));
}
.od-step-now {
  color: rgb(var(--ui-accent-strong));
  font-weight: 600;
}

/* ---- Detalhes dt/dd ---- */
.od-kv {
  display: grid;
  gap: var(--ui-space-3);
  margin: 0;
}
.od-kv-row {
  display: grid;
  grid-template-columns: 150px 1fr;
  gap: var(--ui-space-3);
  align-items: baseline;
  padding-bottom: var(--ui-space-3);
  border-bottom: 1px solid rgb(var(--ui-border));
}
.od-kv-row:last-child {
  padding-bottom: 0;
  border-bottom: none;
}
.od-kv dt {
  color: rgb(var(--ui-muted));
  font-size: var(--ui-text-sm);
}
.od-kv dd {
  margin: 0;
  word-break: break-word;
}

/* ---- Auditoria ---- */
.od-audit-err {
  color: rgb(var(--ui-danger));
  font-size: var(--ui-text-xs);
}

/* ---- Modal de inspeção ---- */
.od-entry {
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-4);
}
.od-entry-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ui-space-3);
  flex-wrap: wrap;
}
.od-payloads {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--ui-space-4);
}
.od-payload {
  min-width: 0;
}
.od-payload-label {
  margin: 0 0 var(--ui-space-2);
  font-size: var(--ui-text-xs);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: rgb(var(--ui-muted));
  font-weight: 700;
}
.od-payload-pre {
  margin: 0;
  padding: var(--ui-space-3);
  background: rgb(var(--ui-surface-2));
  border: 1px solid rgb(var(--ui-border));
  border-radius: var(--ui-radius-md);
  font-size: var(--ui-text-xs);
  line-height: 1.5;
  max-height: 240px;
  overflow: auto;
  white-space: pre-wrap;
  word-break: break-word;
}

/* ---- Fornecedor vinculado ---- */
.od-supplier-link {
  color: rgb(var(--ui-accent-strong));
  text-decoration: none;
  font-weight: 500;
}
.od-supplier-link:hover {
  text-decoration: underline;
}
.od-supplier-loading {
  padding: var(--ui-space-4) 0;
}
.od-supplier-action {
  margin-top: var(--ui-space-4);
  padding-top: var(--ui-space-3);
  border-top: 1px solid rgb(var(--ui-border));
}
.od-callout-warn {
  border-color: rgb(var(--ui-warn) / 0.35);
  background: rgb(var(--ui-warn) / 0.07);
}
.od-callout-warn .od-callout-icon {
  color: rgb(var(--ui-warn));
}
.od-callout-warn .od-callout-title {
  color: rgb(var(--ui-warn));
}
.od-truncate {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 300px;
  display: inline-block;
  vertical-align: bottom;
}

/* ---- Responsivo ---- */
@media (max-width: 860px) {
  .od-grid {
    grid-template-columns: 1fr;
  }
  .od-hero {
    align-items: flex-start;
  }
  .od-hero-aside {
    align-items: flex-start;
  }
  .od-hero-facts {
    justify-content: flex-start;
    gap: var(--ui-space-4);
  }
  .od-fact {
    text-align: left;
  }
  .od-payloads {
    grid-template-columns: 1fr;
  }
  .od-truncate {
    max-width: 180px;
  }
}
</style>
