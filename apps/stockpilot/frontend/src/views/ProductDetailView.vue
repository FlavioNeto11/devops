<template>
  <UiPageLayout
    width="wide"
    eyebrow="StockPilot — Reposição de estoque"
    :title="headerTitle"
    :subtitle="headerSubtitle"
    :loading="loading"
    :error="errorMessage"
    @retry="load"
  >
    <!-- ações de topo -->
    <template #actions>
      <UiButton variant="ghost" to="/products">
        <template #icon-left><span class="pd-ic" aria-hidden="true">←</span></template>
        Voltar ao catálogo
      </UiButton>
      <UiButton v-if="!notFound" variant="ghost" :loading="refreshing" :disabled="busy" @click="refresh">
        <template #icon-left><span class="pd-ic" aria-hidden="true">↻</span></template>
        Atualizar
      </UiButton>
      <UiButton v-if="!notFound" variant="subtle" :loading="ordering" :disabled="busy" @click="onManualOrder">
        <template #icon-left><span class="pd-ic" aria-hidden="true">＋</span></template>
        Pedido manual
      </UiButton>
      <UiButton
        v-if="!notFound"
        variant="primary"
        :loading="reordering"
        :disabled="busy || hasOpenOrder"
        @click="onReorder()"
      >
        {{ hasOpenOrder ? 'Pedido em aberto' : 'Repor estoque' }}
      </UiButton>
    </template>

    <!-- banner contextual por status -->
    <template #banner>
      <div
        v-if="!loading && statusTone !== 'success'"
        class="pd-banner"
        :data-tone="statusTone"
        role="status"
      >
        <span class="pd-banner-dot" aria-hidden="true" />
        <div class="pd-banner-text">
          <strong>{{ bannerTitle }}</strong>
          <span>{{ bannerDescription }}</span>
        </div>
        <UiButton
          v-if="!hasOpenOrder"
          size="sm"
          variant="primary"
          :loading="reordering"
          :disabled="busy"
          @click="onReorder()"
        >Repor agora</UiButton>
      </div>
    </template>

    <!-- estado dedicado: produto não encontrado (404 / corpo vazio) -->
    <UiEmptyState
      v-if="notFound"
      icon="search"
      title="Produto não encontrado"
      description="Este produto não existe ou não pertence a esta conta. Ele pode ter sido removido."
    >
      <template #action>
        <UiButton variant="primary" to="/products">Voltar ao catálogo</UiButton>
      </template>
    </UiEmptyState>

    <!-- conteúdo normal (só quando há produto) -->
    <template v-else>
    <!-- DetailHeader: identidade + status em destaque -->
    <UiCard padded>
      <div class="pd-hero">
        <div class="pd-hero-main">
          <span class="pd-hero-glyph" :data-tone="statusTone" aria-hidden="true">📦</span>
          <div class="pd-hero-titles">
            <p class="pd-hero-name">{{ product.name || ('Produto #' + id) }}</p>
            <p class="pd-hero-meta">
              <span v-if="product.sku" class="pd-hero-sku ui-mono">{{ product.sku }}</span>
              <span v-else class="pd-hero-sku ui-muted">sem SKU</span>
              <span class="pd-hero-sep" aria-hidden="true">·</span>
              <span class="ui-muted">ID {{ product.id ?? id }}</span>
            </p>
          </div>
        </div>
        <div class="pd-hero-status">
          <UiStatusBadge :status="product.status" :tone="statusTone" :label="statusLabel" size="lg" />
        </div>
      </div>
    </UiCard>

    <!-- KPIs -->
    <div class="pd-metrics">
      <UiMetricCard
        label="Estoque atual"
        :value="loading ? null : formatUnits(product.current_stock)"
        :loading="loading"
        :tone="metricTone"
        :hint="coverageHint"
      />
      <UiMetricCard
        label="Estoque mínimo"
        :value="loading ? null : formatUnits(product.min_stock)"
        :loading="loading"
        tone="neutral"
        hint="limite de reposição"
      />
      <UiMetricCard
        label="Pedido aberto"
        :value="loading ? null : (hasOpenOrder ? 'Sim' : 'Não')"
        :loading="loading"
        :tone="hasOpenOrder ? 'running' : 'neutral'"
        :hint="openOrdersCount ? (openOrdersCount + ' em andamento') : 'nenhum em curso'"
      />
      <UiMetricCard
        label="Último pedido"
        :value="loading ? null : lastOrderLabel"
        :loading="loading"
        tone="neutral"
        hint="data do mais recente"
      />
    </div>

    <div class="pd-grid">
      <!-- COLUNA PRINCIPAL -->
      <div class="pd-col">
        <!-- StockGauge: atual vs. mínimo -->
        <UiCard title="Cobertura de estoque" subtitle="Quanto há disponível em relação ao mínimo.">
          <div class="pd-gauge" :data-tone="statusTone">
            <div class="pd-gauge-head">
              <span class="pd-gauge-figure">
                <strong class="pd-gauge-cur">{{ formatUnits(product.current_stock) }}</strong>
                <span class="pd-gauge-sub">atual</span>
              </span>
              <span class="pd-gauge-target ui-muted">
                mín. {{ formatUnits(product.min_stock) }}
              </span>
            </div>
            <div
              class="pd-gauge-track"
              role="meter"
              :aria-valuenow="Number(product.current_stock) || 0"
              :aria-valuemin="0"
              :aria-valuemax="gaugeMax"
              :aria-label="gaugeAria"
            >
              <div class="pd-gauge-fill" :data-pct="gaugePctClass" />
              <div class="pd-gauge-min" :data-pos="gaugeMinPosClass" aria-hidden="true">
                <span class="pd-gauge-min-tip">mín.</span>
              </div>
            </div>
            <p class="pd-gauge-caption">{{ gaugeCaption }}</p>
          </div>
        </UiCard>

        <!-- Ficha do produto -->
        <UiCard title="Ficha do produto">
          <template #actions>
            <UiButton size="sm" variant="ghost" :to="'/products/' + id + '/edit'">Editar</UiButton>
          </template>
          <dl class="pd-kv">
            <div><dt>ID</dt><dd>{{ product.id ?? id }}</dd></div>
            <div><dt>SKU / código</dt><dd>{{ product.sku || '—' }}</dd></div>
            <div><dt>Status</dt><dd><UiStatusBadge :status="product.status" :tone="statusTone" :label="statusLabel" /></dd></div>
            <div><dt>Estoque atual</dt><dd>{{ formatUnits(product.current_stock) }}</dd></div>
            <div><dt>Estoque mínimo</dt><dd>{{ formatUnits(product.min_stock) }}</dd></div>
            <div><dt>Pedido em aberto</dt><dd>{{ hasOpenOrder ? 'Sim' : 'Não' }}</dd></div>
            <div><dt>Último pedido</dt><dd>{{ formatWhen(product.last_order_date) }}</dd></div>
            <div><dt>Criado em</dt><dd>{{ formatWhen(product.created_at) }}</dd></div>
            <div><dt>Atualizado em</dt><dd>{{ formatWhen(product.updated_at) }}</dd></div>
          </dl>
        </UiCard>

        <!-- OrderHistoryTable -->
        <UiCard title="Histórico de pedidos" :subtitle="ordersSubtitle">
          <template #actions>
            <UiButton size="sm" variant="ghost" to="/orders">Ver todos os pedidos</UiButton>
          </template>
          <UiDataTable
            :columns="orderColumns"
            :rows="orders"
            :loading="loading"
            row-key="id"
            density="compact"
            clickable-rows
            :empty="{
              title: 'Sem pedidos para este produto',
              description: 'Quando você repor o estoque, os pedidos aparecem aqui.',
              icon: 'clock',
            }"
            @row-click="openOrder"
          >
            <template #cell-id="{ value }"><span class="ui-mono">#{{ value }}</span></template>
            <template #cell-status="{ value }">
              <UiStatusBadge :status="value" />
            </template>
            <template #cell-quantity="{ value }">{{ value != null ? formatUnits(value) : '—' }}</template>
            <template #cell-created_at="{ value }">{{ formatWhen(value) }}</template>
            <template #cell-external_ref="{ value }">
              <span class="ui-mono">{{ value || '—' }}</span>
            </template>
            <template #cell-last_error="{ value }">
              <span class="pd-err" :data-has="value ? 'true' : 'false'">{{ value || '—' }}</span>
            </template>
            <template #empty-action>
              <UiButton
                size="sm"
                variant="primary"
                :disabled="busy || hasOpenOrder"
                :loading="reordering"
                @click="onReorder()"
              >Repor estoque</UiButton>
            </template>
          </UiDataTable>
        </UiCard>

        <!-- Alertas relacionados -->
        <UiCard title="Alertas relacionados" :subtitle="alertsSubtitle">
          <template #actions>
            <UiButton size="sm" variant="ghost" to="/alerts">Ver alertas</UiButton>
          </template>
          <ul v-if="alerts.length" class="pd-alerts">
            <li
              v-for="(al, i) in alerts"
              :key="(al.id ?? i) + '-' + (al.alert_type || al.status || '')"
              class="pd-alert"
              :data-tone="alertTone(al)"
            >
              <UiStatusBadge :status="al.alert_type || al.status" :tone="alertTone(al)" />
              <div class="pd-alert-body">
                <span class="pd-alert-msg">{{ alertMessage(al) }}</span>
                <span v-if="al.created_at" class="pd-alert-when ui-muted">{{ formatWhen(al.created_at) }}</span>
              </div>
            </li>
          </ul>
          <UiEmptyState
            v-else
            compact
            icon="ok"
            title="Nenhum alerta ativo"
            description="Este produto não tem alertas de estoque no momento."
          />
        </UiCard>
      </div>

      <!-- COLUNA LATERAL -->
      <aside class="pd-side">
        <!-- AiSuggestPanel -->
        <UiCard title="Reposição assistida por IA" subtitle="Sugestão fundamentada (dry-run). Você confirma.">
          <template #actions>
            <UiButton
              size="sm"
              variant="subtle"
              :loading="suggesting"
              :disabled="busy"
              @click="onSuggest"
            >{{ suggestion ? 'Recalcular' : 'Sugerir' }}</UiButton>
          </template>

          <!-- erro da sugestão (fail-closed / IA indisponível) -->
          <UiErrorState
            v-if="suggestError"
            :message="suggestError.message"
            :code="suggestError.code"
            :retryable="suggestError.retryable"
            @retry="onSuggest"
          />

          <!-- carregando -->
          <UiLoadingState
            v-else-if="suggesting"
            variant="skeleton"
            :skeleton-lines="4"
            title="Consultando a IA…"
          />

          <!-- sugestão pronta -->
          <div v-else-if="suggestion" class="pd-ai">
            <div class="pd-ai-headline">
              <div class="pd-ai-qty">
                <span class="pd-ai-qty-num">{{ formatUnits(suggestion.suggested_quantity) }}</span>
                <span class="pd-ai-qty-cap">sugerido para repor</span>
              </div>
              <span class="pd-ai-conf" :data-level="confidenceKey">
                <span class="pd-ai-conf-dot" aria-hidden="true" />
                Confiança {{ confidenceLabel }}
              </span>
            </div>

            <!-- medidor de confiança (CSP: largura por bucket) -->
            <div class="pd-conf-track" aria-hidden="true">
              <span class="pd-conf-fill" :data-level="confidenceKey" />
            </div>

            <p class="pd-ai-rationale">{{ suggestion.rationale || 'Sem justificativa textual.' }}</p>

            <div v-if="suggestionSources.length" class="pd-ai-sources">
              <p class="pd-ai-sources-title">Fontes (dados reais consultados)</p>
              <ul>
                <li v-for="(src, i) in suggestionSources" :key="i">{{ src }}</li>
              </ul>
            </div>

            <p class="pd-ai-foot">
              <span v-if="suggestionModel" class="pd-ai-model ui-mono">{{ suggestionModel }}</span>
              <span class="pd-ai-dry">Dry-run — nada foi alterado.</span>
            </p>

            <UiButton
              block
              variant="primary"
              :loading="reordering"
              :disabled="busy || hasOpenOrder"
              @click="onReorder(suggestion.suggested_quantity)"
            >{{ hasOpenOrder ? 'Pedido em aberto' : 'Confirmar reposição' }}</UiButton>
          </div>

          <!-- estado inicial / vazio -->
          <UiEmptyState
            v-else
            icon="search"
            title="Peça uma sugestão"
            description="A IA analisa estoque atual, mínimo e o histórico recente para sugerir quanto repor — sem alterar nada até você confirmar."
          >
            <template #action>
              <UiButton variant="primary" :loading="suggesting" :disabled="busy" @click="onSuggest">
                Sugerir reposição
              </UiButton>
            </template>
          </UiEmptyState>
        </UiCard>

        <!-- atalhos -->
        <UiCard title="Atalhos do inventário">
          <div class="pd-links">
            <UiButton variant="ghost" block to="/products">Catálogo de produtos</UiButton>
            <UiButton variant="ghost" block to="/orders">Pedidos de reposição</UiButton>
            <UiButton variant="ghost" block to="/alerts">Alertas de estoque</UiButton>
          </div>
        </UiCard>
      </aside>
    </div>

    <!-- ConfirmDialog (modal de reposição com quantidade) -->
    <UiModal v-model:open="confirmOpen" title="Confirmar reposição" width="sm" :persistent="reordering">
      <p class="pd-confirm-lead">
        Repor <strong>{{ product.name || ('produto #' + id) }}</strong>?
      </p>
      <UiFormField
        label="Quantidade a repor"
        required
        :error="reorderForm.errors.quantity"
        hint="A reposição é assíncrona e idempotente — não cria pedidos duplicados."
      >
        <template #default="{ id: fid, describedBy }">
          <input
            :id="fid"
            :value="reorderForm.values.quantity"
            type="number"
            min="0"
            inputmode="numeric"
            :aria-describedby="describedBy"
            @input="reorderForm.setField('quantity', $event.target.value === '' ? '' : Number($event.target.value))"
            @blur="reorderForm.validateField('quantity')"
          />
        </template>
      </UiFormField>
      <p class="pd-confirm-note">
        Será criado um pedido <em>pending</em> e enfileirado o envio ao fornecedor.
      </p>
      <template #footer>
        <UiButton variant="ghost" :disabled="reordering" @click="confirmOpen = false">Cancelar</UiButton>
        <UiButton variant="primary" :loading="reordering" @click="confirmReorder">Confirmar reposição</UiButton>
      </template>
    </UiModal>
    </template>
  </UiPageLayout>
</template>

<script setup>
import { ref, computed, watch, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import {
  UiPageLayout, UiCard, UiMetricCard, UiStatusBadge, UiDataTable, UiButton,
  UiModal, UiFormField, UiEmptyState, UiLoadingState, UiErrorState,
  useToast, useConfirm, useForm, validators, format,
} from '../ui/index.js';
import { products } from '../api.js';

const props = defineProps({ id: { type: [String, Number], required: true } });
const router = useRouter();
const toast = useToast();
const ask = useConfirm();

// ---- estado da tela ----
const loading = ref(true);
const refreshing = ref(false);
const error = ref(null);
const notFound = ref(false);
const product = ref({});
const orders = ref([]);
const alerts = ref([]);

// ações
const suggesting = ref(false);
const suggestError = ref(null);
const suggestion = ref(null);
const suggestionSources = ref([]);
const suggestionModel = ref('');
const reordering = ref(false);
const ordering = ref(false);

// diálogo de reposição — quantidade gerida por useForm (validação do kit: obrigatória, ≥ 0).
const confirmOpen = ref(false);
const reorderForm = useForm({
  initial: { quantity: 0 },
  rules: { quantity: [validators.required('Informe a quantidade.'), validators.numeric(), validators.min(0)] },
});

const busy = computed(
  () => loading.value || refreshing.value || suggesting.value || reordering.value || ordering.value,
);
const errorMessage = computed(() =>
  error.value ? (error.value.message || 'Falha ao carregar o produto.') : null,
);
const hasOpenOrder = computed(() => Boolean(product.value.has_open_order) || openOrdersCount.value > 0);

const headerTitle = computed(() => {
  if (loading.value) return 'Carregando produto…';
  if (notFound.value) return 'Produto não encontrado';
  return product.value.name || ('Produto #' + props.id);
});
const headerSubtitle = computed(() => {
  if (loading.value) return '';
  if (notFound.value) return 'O produto solicitado não existe nesta conta.';
  return 'Ficha completa, histórico de pedidos e reposição assistida por IA.';
});

// ---- carga ----
async function load() {
  loading.value = true;
  error.value = null;
  notFound.value = false;
  try {
    const detail = await products.get(props.id);
    // o detalhe pode vir achatado OU dentro de { product, orders, alerts }
    const p = detail && detail.product ? detail.product : detail;
    // 200 sem produto utilizável (corpo vazio) é tratado como "não encontrado",
    // não como estado normal com placeholders.
    if (!p || (p.id == null && p.name == null)) {
      notFound.value = true;
      product.value = {};
      orders.value = [];
      alerts.value = [];
      return;
    }
    product.value = p;
    orders.value = normalizeOrders(detail);
    alerts.value = normalizeAlerts(detail);
  } catch (e) {
    if (e && e.status === 404) {
      notFound.value = true;
    } else {
      error.value = e;
    }
  } finally {
    loading.value = false;
  }
}

async function refresh() {
  refreshing.value = true;
  try {
    const detail = await products.get(props.id);
    const p = detail && detail.product ? detail.product : detail;
    if (!p || (p.id == null && p.name == null)) {
      notFound.value = true;
      return;
    }
    product.value = p;
    orders.value = normalizeOrders(detail);
    alerts.value = normalizeAlerts(detail);
    toast.success('Dados do produto atualizados.');
  } catch (e) {
    if (e && e.status === 404) {
      notFound.value = true;
      toast.info('Este produto não existe mais.');
    } else {
      toast.error('Falha ao atualizar.', { detail: e.message, code: e.status ? String(e.status) : '' });
    }
  } finally {
    refreshing.value = false;
  }
}

function normalizeOrders(detail) {
  const raw = (detail && (detail.orders || detail.order_history || detail.history)) || [];
  const list = Array.isArray(raw) ? raw : (raw.data || []);
  return list.slice().sort((a, b) => orderTime(b) - orderTime(a));
}
function normalizeAlerts(detail) {
  const raw = (detail && detail.alerts) || [];
  const list = Array.isArray(raw) ? raw : (raw.data || []);
  return list.slice();
}
function orderTime(o) {
  const t = new Date(o && (o.created_at || o.last_order_date)).getTime();
  return isNaN(t) ? 0 : t;
}

// ---- derivações de UI ----
const STATUS_TONE = { OK: 'success', ALERTA: 'warning', RUPTURA: 'error' };
const STATUS_LABEL = { OK: 'OK', ALERTA: 'Alerta', RUPTURA: 'Ruptura' };
const statusKey = computed(() => String(product.value.status || '').toUpperCase());
const statusTone = computed(() => STATUS_TONE[statusKey.value] || 'success');
const statusLabel = computed(() => STATUS_LABEL[statusKey.value] || (statusKey.value ? statusKey.value : 'OK'));
const metricTone = computed(() =>
  statusTone.value === 'success' ? 'success' : statusTone.value === 'error' ? 'error' : 'warning',
);

const openOrdersCount = computed(
  () => orders.value.filter((o) => o.status === 'pending' || o.status === 'processing').length,
);
const lastOrderLabel = computed(() => {
  const d = product.value.last_order_date || (orders.value[0] && orders.value[0].created_at);
  return d ? format.formatDate(d) : 'Nunca';
});
const coverageHint = computed(() => {
  const cur = Number(product.value.current_stock);
  const min = Number(product.value.min_stock);
  if (!isFinite(cur) || !isFinite(min) || min <= 0) return 'sem referência';
  return Math.round((cur / min) * 100) + '% do mínimo';
});

const bannerTitle = computed(() =>
  statusTone.value === 'error' ? 'Produto em RUPTURA' : 'Estoque em ALERTA',
);
const bannerDescription = computed(() => {
  if (statusTone.value === 'error') {
    return hasOpenOrder.value
      ? 'Abaixo do mínimo, mas já há um pedido em andamento.'
      : 'Abaixo do mínimo e sem pedido aberto. Reponha o quanto antes.';
  }
  return 'Próximo do mínimo. Avalie repor para evitar ruptura.';
});

// medidor (sem :style — largura por classe de faixa de 5%)
const gaugeMax = computed(() => {
  const min = Number(product.value.min_stock) || 0;
  const cur = Number(product.value.current_stock) || 0;
  return Math.max(min * 2, cur, 1);
});
const gaugePctClass = computed(() => bucket((Number(product.value.current_stock) || 0) / gaugeMax.value));
const gaugeMinPosClass = computed(() => bucket((Number(product.value.min_stock) || 0) / gaugeMax.value));
// arredonda para passos de 5% → classes estáticas (CSP: nada de :style)
function bucket(ratio) {
  let pct = Math.round(Math.max(0, Math.min(1, ratio)) * 100 / 5) * 5;
  if (pct < 0) pct = 0;
  if (pct > 100) pct = 100;
  return String(pct);
}
const gaugeAria = computed(
  () => 'Estoque atual ' + (product.value.current_stock ?? 0) + ' de mínimo ' + (product.value.min_stock ?? 0),
);
const gaugeCaption = computed(() => {
  if (statusTone.value === 'error') return 'Abaixo do mínimo — risco de ruptura.';
  if (statusTone.value === 'warning') return 'Próximo do limite mínimo.';
  return 'Acima do mínimo — operação saudável.';
});

const ordersSubtitle = computed(() => {
  const n = orders.value.length;
  if (loading.value) return 'Carregando…';
  if (!n) return 'Nenhum pedido registrado.';
  return n + (n === 1 ? ' pedido' : ' pedidos') + ' · ' + openOrdersCount.value + ' em aberto';
});
const orderColumns = [
  { key: 'id', label: 'Pedido' },
  { key: 'status', label: 'Status' },
  { key: 'quantity', label: 'Qtd.', align: 'right' },
  { key: 'external_ref', label: 'Ref. externa' },
  { key: 'created_at', label: 'Criado em' },
  { key: 'last_error', label: 'Erro' },
];

const alertsSubtitle = computed(() => {
  const n = alerts.value.length;
  if (loading.value) return 'Carregando…';
  return n ? (n === 1 ? '1 alerta ativo' : n + ' alertas ativos') : 'Sem alertas no momento.';
});

// ---- confiança da IA ----
const confidenceKey = computed(() => {
  const c = String((suggestion.value && suggestion.value.confidence) || 'medium').toLowerCase();
  return ['low', 'medium', 'high'].includes(c) ? c : 'medium';
});
const confidenceLabel = computed(
  () => ({ low: 'baixa', medium: 'média', high: 'alta' })[confidenceKey.value],
);

// ---- alertas ----
function alertTone(al) {
  const t = String(al.alert_type || al.status || '').toUpperCase();
  return t === 'RUPTURA' ? 'error' : 'warning';
}
function alertMessage(al) {
  const t = String(al.alert_type || al.status || '').toUpperCase();
  if (t === 'RUPTURA') {
    return 'Estoque abaixo do mínimo (' + formatUnits(al.current_stock) + ' de ' + formatUnits(al.min_stock) + ').';
  }
  if (al.last_error) return 'Falha no envio ao fornecedor: ' + al.last_error;
  if (al.message) return String(al.message);
  return 'Alerta de estoque ativo.';
}

// ---- formatadores ----
function formatUnits(v) {
  if (v === null || v === undefined || v === '') return '—';
  const n = Number(v);
  if (!isFinite(n)) return String(v);
  return format.formatNumber(n) + ' un.';
}
function formatWhen(v) {
  return format.formatDateTime(v);
}

// ---- navegação ----
function openOrder(row) {
  if (row && row.id != null) router.push('/orders/' + row.id);
}

// ---- IA: sugerir (dry-run) ----
async function onSuggest() {
  suggesting.value = true;
  suggestError.value = null;
  try {
    const res = await products.suggestReorder(props.id);
    const s = (res && res.suggestion) || res || {};
    suggestion.value = s;
    const fromSuggestion = Array.isArray(s.sources) ? s.sources : [];
    const fromGrounding = res && res.grounding && Array.isArray(res.grounding.sources) ? res.grounding.sources : [];
    suggestionSources.value = fromSuggestion.length ? fromSuggestion : fromGrounding;
    suggestionModel.value = (res && res.model) || '';
    toast.success('Sugestão gerada. Revise antes de confirmar.');
  } catch (e) {
    suggestion.value = null;
    suggestionSources.value = [];
    suggestionModel.value = '';
    suggestError.value = {
      message: e.status === 503
        ? 'Assistente de IA indisponível no momento (chave não configurada). A reposição manual continua funcionando.'
        : e.status === 502
          ? 'A IA retornou uma resposta inválida. Tente novamente em instantes.'
          : (e.message || 'Não foi possível gerar a sugestão.'),
      code: e.status ? String(e.status) : '',
      retryable: e.status !== 503,
    };
    toast.error('Falha ao gerar a sugestão da IA.', { detail: e.message, code: e.status ? String(e.status) : '' });
  } finally {
    suggesting.value = false;
  }
}

// ---- reposição (abre confirmação com quantidade) ----
function onReorder(qty) {
  if (hasOpenOrder.value) {
    toast.info('Já existe um pedido em aberto para este produto.');
    return;
  }
  const fallback = Math.max(
    0,
    (Number(product.value.min_stock) || 0) - (Number(product.value.current_stock) || 0),
  );
  reorderForm.reset();
  reorderForm.setField('quantity', Number(qty) > 0 ? Number(qty) : fallback);
  confirmOpen.value = true;
}

async function confirmReorder() {
  // validação vem do kit (useForm + validators) — gateia o submit.
  if (!reorderForm.validate()) return;
  reordering.value = true;
  try {
    const qty = Number(reorderForm.values.quantity);
    const res = await products.reorder(props.id, { quantity: qty > 0 ? qty : undefined });
    confirmOpen.value = false;
    if (res && res.deduped) {
      toast.info('Pedido já estava em aberto — usamos o existente (idempotente).');
    } else {
      toast.success('Reposição iniciada. O pedido foi enfileirado ao fornecedor.');
    }
    await load();
  } catch (e) {
    toast.error('Falha ao iniciar a reposição.', { detail: e.message, code: e.status ? String(e.status) : '' });
  } finally {
    reordering.value = false;
  }
}

// ---- pedido manual (confirmação) ----
async function onManualOrder() {
  const ok = await ask({
    title: 'Criar pedido manual',
    message: 'Criar um pedido manual para "' + (product.value.name || ('produto #' + props.id))
      + '"? Ele será registrado no histórico e enviado ao fornecedor.',
    confirmLabel: 'Criar pedido',
  });
  if (!ok) return;
  ordering.value = true;
  try {
    await products.order(props.id);
    toast.success('Pedido manual criado.');
    await load();
  } catch (e) {
    toast.error('Falha ao criar o pedido manual.', { detail: e.message, code: e.status ? String(e.status) : '' });
  } finally {
    ordering.value = false;
  }
}

// recarrega ao trocar de :id
watch(() => props.id, load);
onMounted(load);
</script>

<style scoped>
.pd-ic { font-size: var(--ui-text-md); line-height: 1; }

/* ---- banner contextual ---- */
.pd-banner {
  display: flex;
  align-items: center;
  gap: var(--ui-space-3);
  padding: var(--ui-space-3) var(--ui-space-4);
  border: 1px solid rgb(var(--ui-border));
  border-radius: var(--ui-radius-md);
  background: rgb(var(--ui-surface));
}
.pd-banner[data-tone="error"] { border-color: rgb(var(--ui-danger) / 0.5); background: rgb(var(--ui-danger) / 0.08); }
.pd-banner[data-tone="warning"] { border-color: rgb(var(--ui-warn) / 0.5); background: rgb(var(--ui-warn) / 0.10); }
.pd-banner-dot { width: 10px; height: 10px; border-radius: var(--ui-radius-pill); flex-shrink: 0; background: rgb(var(--ui-muted)); }
.pd-banner[data-tone="error"] .pd-banner-dot { background: rgb(var(--ui-danger)); }
.pd-banner[data-tone="warning"] .pd-banner-dot { background: rgb(var(--ui-warn)); }
.pd-banner-text { display: flex; flex-direction: column; gap: 1px; flex: 1 1 auto; }
.pd-banner-text strong { font-size: var(--ui-text-sm); }
.pd-banner-text span { color: rgb(var(--ui-muted)); font-size: var(--ui-text-sm); }

/* ---- DetailHeader ---- */
.pd-hero { display: flex; align-items: center; justify-content: space-between; gap: var(--ui-space-4); flex-wrap: wrap; }
.pd-hero-main { display: flex; align-items: center; gap: var(--ui-space-4); min-width: 0; }
.pd-hero-glyph {
  display: inline-flex; align-items: center; justify-content: center;
  width: 52px; height: 52px; flex-shrink: 0;
  font-size: 1.6rem; border-radius: var(--ui-radius-lg);
  background: rgb(var(--ui-accent) / 0.12);
  border: 1px solid rgb(var(--ui-accent) / 0.22);
}
.pd-hero-glyph[data-tone="warning"] { background: rgb(var(--ui-warn) / 0.14); border-color: rgb(var(--ui-warn) / 0.3); }
.pd-hero-glyph[data-tone="error"] { background: rgb(var(--ui-danger) / 0.12); border-color: rgb(var(--ui-danger) / 0.3); }
.pd-hero-titles { min-width: 0; }
.pd-hero-name { margin: 0; font-family: var(--ui-font-display); font-size: var(--ui-text-xl); font-weight: 700; line-height: 1.15; }
.pd-hero-meta { margin: 4px 0 0; display: flex; align-items: center; gap: var(--ui-space-2); flex-wrap: wrap; font-size: var(--ui-text-sm); }
.pd-hero-sku { font-size: var(--ui-text-sm); }
.pd-hero-sep { color: rgb(var(--ui-faint)); }
.pd-hero-status { flex-shrink: 0; }

/* ---- KPIs ---- */
.pd-metrics {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: var(--ui-space-4);
}

/* ---- layout 2 colunas ---- */
.pd-grid {
  display: grid;
  grid-template-columns: minmax(0, 2fr) minmax(0, 1fr);
  gap: var(--ui-space-4);
  align-items: start;
}
.pd-col, .pd-side { display: flex; flex-direction: column; gap: var(--ui-space-4); min-width: 0; }

/* ---- ficha (dl) ---- */
.pd-kv {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
  gap: var(--ui-space-3) var(--ui-space-4);
  margin: 0;
}
.pd-kv > div { display: flex; flex-direction: column; gap: 2px; }
.pd-kv dt { color: rgb(var(--ui-muted)); font-size: var(--ui-text-xs); text-transform: uppercase; letter-spacing: .04em; }
.pd-kv dd { margin: 0; font-weight: 500; }

/* ---- StockGauge ---- */
.pd-gauge { display: flex; flex-direction: column; gap: var(--ui-space-3); }
.pd-gauge-head { display: flex; align-items: baseline; justify-content: space-between; gap: var(--ui-space-2); }
.pd-gauge-figure { display: inline-flex; align-items: baseline; gap: var(--ui-space-2); }
.pd-gauge-cur { font-family: var(--ui-font-display); font-size: 1.6rem; font-weight: 700; }
.pd-gauge[data-tone="success"] .pd-gauge-cur { color: rgb(var(--ui-ok)); }
.pd-gauge[data-tone="warning"] .pd-gauge-cur { color: rgb(var(--ui-warn)); }
.pd-gauge[data-tone="error"] .pd-gauge-cur { color: rgb(var(--ui-danger)); }
.pd-gauge-sub { font-size: var(--ui-text-xs); color: rgb(var(--ui-muted)); text-transform: uppercase; letter-spacing: .04em; }
.pd-gauge-target { font-size: var(--ui-text-sm); }
.pd-gauge-track {
  position: relative;
  height: 16px;
  border-radius: var(--ui-radius-pill);
  background: rgb(var(--ui-surface-2));
  border: 1px solid rgb(var(--ui-border));
  overflow: hidden;
  margin-top: var(--ui-space-3);
}
.pd-gauge-fill {
  position: absolute;
  inset: 0 auto 0 0;
  height: 100%;
  border-radius: var(--ui-radius-pill);
  background: rgb(var(--ui-ok));
  transition: width .3s ease;
}
.pd-gauge[data-tone="warning"] .pd-gauge-fill { background: rgb(var(--ui-warn)); }
.pd-gauge[data-tone="error"] .pd-gauge-fill { background: rgb(var(--ui-danger)); }
/* marca do mínimo (linha vertical) */
.pd-gauge-min {
  position: absolute;
  top: -3px;
  bottom: -3px;
  width: 2px;
  background: rgb(var(--ui-fg) / 0.55);
}
.pd-gauge-min-tip {
  position: absolute;
  top: -16px;
  left: 50%;
  transform: translateX(-50%);
  font-size: 9px;
  color: rgb(var(--ui-muted));
  white-space: nowrap;
}
.pd-gauge-caption { margin: 0; font-size: var(--ui-text-xs); color: rgb(var(--ui-muted)); }

/* faixas de largura/posição em passos de 5% (CSP: sem :style) */
.pd-gauge-fill[data-pct="0"] { width: 0; }
.pd-gauge-fill[data-pct="5"] { width: 5%; }
.pd-gauge-fill[data-pct="10"] { width: 10%; }
.pd-gauge-fill[data-pct="15"] { width: 15%; }
.pd-gauge-fill[data-pct="20"] { width: 20%; }
.pd-gauge-fill[data-pct="25"] { width: 25%; }
.pd-gauge-fill[data-pct="30"] { width: 30%; }
.pd-gauge-fill[data-pct="35"] { width: 35%; }
.pd-gauge-fill[data-pct="40"] { width: 40%; }
.pd-gauge-fill[data-pct="45"] { width: 45%; }
.pd-gauge-fill[data-pct="50"] { width: 50%; }
.pd-gauge-fill[data-pct="55"] { width: 55%; }
.pd-gauge-fill[data-pct="60"] { width: 60%; }
.pd-gauge-fill[data-pct="65"] { width: 65%; }
.pd-gauge-fill[data-pct="70"] { width: 70%; }
.pd-gauge-fill[data-pct="75"] { width: 75%; }
.pd-gauge-fill[data-pct="80"] { width: 80%; }
.pd-gauge-fill[data-pct="85"] { width: 85%; }
.pd-gauge-fill[data-pct="90"] { width: 90%; }
.pd-gauge-fill[data-pct="95"] { width: 95%; }
.pd-gauge-fill[data-pct="100"] { width: 100%; }
.pd-gauge-min[data-pos="0"] { left: 0; }
.pd-gauge-min[data-pos="5"] { left: 5%; }
.pd-gauge-min[data-pos="10"] { left: 10%; }
.pd-gauge-min[data-pos="15"] { left: 15%; }
.pd-gauge-min[data-pos="20"] { left: 20%; }
.pd-gauge-min[data-pos="25"] { left: 25%; }
.pd-gauge-min[data-pos="30"] { left: 30%; }
.pd-gauge-min[data-pos="35"] { left: 35%; }
.pd-gauge-min[data-pos="40"] { left: 40%; }
.pd-gauge-min[data-pos="45"] { left: 45%; }
.pd-gauge-min[data-pos="50"] { left: 50%; }
.pd-gauge-min[data-pos="55"] { left: 55%; }
.pd-gauge-min[data-pos="60"] { left: 60%; }
.pd-gauge-min[data-pos="65"] { left: 65%; }
.pd-gauge-min[data-pos="70"] { left: 70%; }
.pd-gauge-min[data-pos="75"] { left: 75%; }
.pd-gauge-min[data-pos="80"] { left: 80%; }
.pd-gauge-min[data-pos="85"] { left: 85%; }
.pd-gauge-min[data-pos="90"] { left: 90%; }
.pd-gauge-min[data-pos="95"] { left: 95%; }
.pd-gauge-min[data-pos="100"] { left: 100%; }

/* ---- histórico: erro por célula ---- */
.pd-err[data-has="true"] { color: rgb(var(--ui-danger)); }
.pd-err[data-has="false"] { color: rgb(var(--ui-muted)); }

/* ---- alertas relacionados ---- */
.pd-alerts { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--ui-space-2); }
.pd-alert {
  display: flex; align-items: center; gap: var(--ui-space-3);
  padding: var(--ui-space-3);
  border: 1px solid rgb(var(--ui-border));
  border-radius: var(--ui-radius-md);
  background: rgb(var(--ui-surface-2));
}
.pd-alert[data-tone="error"] { border-color: rgb(var(--ui-danger) / 0.4); }
.pd-alert[data-tone="warning"] { border-color: rgb(var(--ui-warn) / 0.4); }
.pd-alert-body { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
.pd-alert-msg { font-size: var(--ui-text-sm); color: rgb(var(--ui-fg)); }
.pd-alert-when { font-size: var(--ui-text-xs); }

/* ---- AiSuggestPanel ---- */
.pd-ai { display: flex; flex-direction: column; gap: var(--ui-space-3); }
.pd-ai-headline { display: flex; align-items: center; justify-content: space-between; gap: var(--ui-space-3); flex-wrap: wrap; }
.pd-ai-qty { display: flex; flex-direction: column; }
.pd-ai-qty-num { font-family: var(--ui-font-display); font-size: 2rem; font-weight: 700; color: rgb(var(--ui-accent-strong)); line-height: 1.1; }
.pd-ai-qty-cap { font-size: var(--ui-text-xs); color: rgb(var(--ui-muted)); }
.pd-ai-conf {
  display: inline-flex; align-items: center; gap: 6px;
  font-size: var(--ui-text-xs); font-weight: 600; padding: 3px 9px;
  border-radius: var(--ui-radius-pill); white-space: nowrap;
  background: rgb(var(--ui-muted) / 0.16); color: rgb(var(--ui-muted));
}
.pd-ai-conf-dot { width: 6px; height: 6px; border-radius: var(--ui-radius-pill); background: currentColor; }
.pd-ai-conf[data-level="high"] { background: rgb(var(--ui-ok) / 0.16); color: rgb(var(--ui-ok)); }
.pd-ai-conf[data-level="medium"] { background: rgb(var(--ui-warn) / 0.18); color: rgb(var(--ui-warn)); }
.pd-ai-conf[data-level="low"] { background: rgb(var(--ui-danger) / 0.14); color: rgb(var(--ui-danger)); }

/* medidor de confiança (largura por nível, CSP-safe) */
.pd-conf-track { height: 6px; border-radius: var(--ui-radius-pill); background: rgb(var(--ui-surface-2)); border: 1px solid rgb(var(--ui-border)); overflow: hidden; }
.pd-conf-fill { display: block; height: 100%; border-radius: var(--ui-radius-pill); }
.pd-conf-fill[data-level="low"] { width: 33%; background: rgb(var(--ui-danger)); }
.pd-conf-fill[data-level="medium"] { width: 66%; background: rgb(var(--ui-warn)); }
.pd-conf-fill[data-level="high"] { width: 100%; background: rgb(var(--ui-ok)); }

.pd-ai-rationale {
  margin: 0; font-size: var(--ui-text-sm); line-height: 1.5;
  padding: var(--ui-space-3); border-left: 3px solid rgb(var(--ui-accent));
  background: rgb(var(--ui-accent) / 0.06); border-radius: var(--ui-radius-sm);
}
.pd-ai-sources { display: flex; flex-direction: column; gap: 4px; }
.pd-ai-sources-title { margin: 0; font-size: var(--ui-text-xs); font-weight: 600; color: rgb(var(--ui-muted)); text-transform: uppercase; letter-spacing: .04em; }
.pd-ai-sources ul { margin: 0; padding-left: var(--ui-space-4); display: flex; flex-direction: column; gap: 2px; }
.pd-ai-sources li { font-size: var(--ui-text-xs); color: rgb(var(--ui-fg)); }
.pd-ai-foot { display: flex; flex-wrap: wrap; align-items: center; gap: var(--ui-space-2); margin: 0; font-size: var(--ui-text-xs); color: rgb(var(--ui-muted)); }
.pd-ai-dry { font-weight: 600; }

/* ---- atalhos ---- */
.pd-links { display: flex; flex-direction: column; gap: var(--ui-space-2); }

/* ---- modal de confirmação ---- */
.pd-confirm-lead { margin: 0 0 var(--ui-space-3); }
.pd-confirm-note { margin: var(--ui-space-3) 0 0; font-size: var(--ui-text-xs); color: rgb(var(--ui-muted)); }

/* ---- responsivo ---- */
@media (max-width: 860px) {
  .pd-grid { grid-template-columns: 1fr; }
  .pd-hero-name { font-size: var(--ui-text-lg); }
}
</style>
