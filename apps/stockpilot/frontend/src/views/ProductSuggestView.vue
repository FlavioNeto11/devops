<template>
  <UiPageLayout
    width="narrow"
    eyebrow="StockPilot — Reposição de estoque"
    :title="headerTitle"
    subtitle="A IA analisa o histórico real e recomenda a quantidade ideal. Dry-run — você confirma antes de criar o pedido."
    :loading="loadingProduct"
    :error="pageError"
    @retry="loadProduct"
  >
    <template #actions>
      <UiButton variant="ghost" :to="'/products/' + id">
        <template #icon-left><span class="ps-ic" aria-hidden="true">←</span></template>
        Voltar ao produto
      </UiButton>
    </template>

    <!-- Painel de sugestão -->
    <UiCard title="Sugestão de reposição por IA" subtitle="Dry-run — nada é alterado até você confirmar.">
      <template #actions>
        <UiButton
          size="sm"
          variant="subtle"
          :loading="suggesting"
          :disabled="busy"
          @click="suggest"
        >{{ suggestion ? 'Recalcular' : 'Sugerir' }}</UiButton>
      </template>

      <!-- Erro da IA -->
      <UiErrorState
        v-if="suggestError"
        :message="suggestError.message"
        :code="suggestError.code"
        :retryable="suggestError.retryable"
        @retry="suggest"
      />

      <!-- Carregando sugestão -->
      <UiLoadingState
        v-else-if="suggesting"
        variant="skeleton"
        :skeleton-lines="5"
        title="Consultando a IA…"
      />

      <!-- Sugestão disponível -->
      <div v-else-if="suggestion" class="ps-result">
        <div class="ps-headline">
          <div class="ps-qty">
            <span class="ps-qty-num">{{ formatUnits(suggestion.suggested_quantity) }}</span>
            <span class="ps-qty-cap">sugerido para repor</span>
          </div>
          <span class="ps-conf" :data-level="confidenceKey">
            <span class="ps-conf-dot" aria-hidden="true" />
            Confiança {{ confidenceLabel }}
          </span>
        </div>

        <div class="ps-conf-track" aria-hidden="true">
          <span class="ps-conf-fill" :data-level="confidenceKey" />
        </div>

        <p class="ps-rationale">{{ suggestion.rationale || 'Sem justificativa textual.' }}</p>

        <div v-if="sources.length" class="ps-sources">
          <p class="ps-sources-title">Fontes consultadas</p>
          <ul>
            <li v-for="(src, i) in sources" :key="i">{{ src }}</li>
          </ul>
        </div>

        <p class="ps-foot">
          <span v-if="suggestionModel" class="ps-model ui-mono">{{ suggestionModel }}</span>
          <span class="ps-dry">Dry-run — nada foi alterado.</span>
        </p>

        <UiButton
          block
          variant="primary"
          :loading="reordering"
          :disabled="busy || hasOpenOrder"
          @click="confirmReorder"
        >{{ hasOpenOrder ? 'Pedido já em aberto' : 'Confirmar reposição (' + formatUnits(suggestion.suggested_quantity) + ')' }}</UiButton>
      </div>

      <!-- Estado inicial -->
      <UiEmptyState
        v-else
        icon="search"
        title="Aguardando sugestão"
        description="A IA analisa estoque atual, mínimo e histórico de pedidos para recomendar a quantidade ideal — sem alterar nada até você confirmar."
      >
        <template #action>
          <UiButton variant="primary" :loading="suggesting" :disabled="busy" @click="suggest">
            Sugerir reposição
          </UiButton>
        </template>
      </UiEmptyState>
    </UiCard>

    <!-- Contexto resumido do produto -->
    <UiCard v-if="product" title="Contexto do produto">
      <dl class="ps-kv">
        <div><dt>Produto</dt><dd>{{ product.name || ('Produto #' + id) }}</dd></div>
        <div><dt>SKU / código</dt><dd>{{ product.sku || '—' }}</dd></div>
        <div v-if="product.status"><dt>Status</dt><dd><UiStatusBadge :status="product.status" :tone="statusTone" :label="statusLabel" /></dd></div>
        <div><dt>Estoque atual</dt><dd>{{ formatUnits(product.current_stock) }}</dd></div>
        <div><dt>Estoque mínimo</dt><dd>{{ formatUnits(product.min_stock) }}</dd></div>
        <div><dt>Pedido em aberto</dt><dd>{{ hasOpenOrder ? 'Sim' : 'Não' }}</dd></div>
      </dl>
    </UiCard>
  </UiPageLayout>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import {
  UiPageLayout, UiCard, UiStatusBadge, UiButton,
  UiEmptyState, UiLoadingState, UiErrorState,
  useToast, format,
} from '../ui/index.js';
import { products } from '../api.js';

const props = defineProps({ id: { type: [String, Number], required: true } });
const router = useRouter();
const toast = useToast();

const loadingProduct = ref(true);
const pageError = ref(null);
const product = ref(null);

const suggesting = ref(false);
const suggestError = ref(null);
const suggestion = ref(null);
const sources = ref([]);
const suggestionModel = ref('');
const reordering = ref(false);

const busy = computed(() => loadingProduct.value || suggesting.value || reordering.value);
const hasOpenOrder = computed(() => Boolean(product.value && product.value.has_open_order));

const STATUS_TONE = { OK: 'success', ALERTA: 'warning', RUPTURA: 'error' };
const STATUS_LABEL = { OK: 'OK', ALERTA: 'Alerta', RUPTURA: 'Ruptura' };
const statusKey = computed(() => String((product.value && product.value.status) || '').toUpperCase());
const statusTone = computed(() => STATUS_TONE[statusKey.value] || 'success');
const statusLabel = computed(() => STATUS_LABEL[statusKey.value] || statusKey.value || 'OK');

const headerTitle = computed(() => {
  if (loadingProduct.value) return 'Carregando…';
  const name = product.value && product.value.name;
  return 'Sugerir reposição' + (name ? ' — ' + name : '');
});

const confidenceKey = computed(() => {
  const c = String((suggestion.value && suggestion.value.confidence) || 'medium').toLowerCase();
  return ['low', 'medium', 'high'].includes(c) ? c : 'medium';
});
const confidenceLabel = computed(
  () => ({ low: 'baixa', medium: 'média', high: 'alta' })[confidenceKey.value],
);

function formatUnits(v) {
  if (v === null || v === undefined || v === '') return '—';
  const n = Number(v);
  if (!isFinite(n)) return String(v);
  return format.formatNumber(n) + ' un.';
}

async function loadProduct() {
  loadingProduct.value = true;
  pageError.value = null;
  try {
    const detail = await products.get(props.id);
    const p = detail && detail.product ? detail.product : detail;
    product.value = (p && (p.id != null || p.name != null)) ? p : null;
  } catch (e) {
    pageError.value = e && e.message ? e.message : 'Falha ao carregar o produto.';
  } finally {
    loadingProduct.value = false;
  }
}

async function suggest() {
  suggesting.value = true;
  suggestError.value = null;
  try {
    const res = await products.suggestReorder(props.id);
    const s = (res && res.suggestion) || res || {};
    suggestion.value = s;
    const fromSuggestion = Array.isArray(s.sources) ? s.sources : [];
    const fromGrounding = res && res.grounding && Array.isArray(res.grounding.sources) ? res.grounding.sources : [];
    sources.value = fromSuggestion.length ? fromSuggestion : fromGrounding;
    suggestionModel.value = (res && res.model) || '';
    toast.success('Sugestão gerada. Revise antes de confirmar.');
  } catch (e) {
    suggestion.value = null;
    sources.value = [];
    suggestionModel.value = '';
    suggestError.value = {
      message: e.status === 503
        ? 'Assistente de IA indisponível (chave não configurada). A reposição manual ainda funciona em /products/' + props.id + '.'
        : e.status === 502
          ? 'A IA retornou uma resposta inválida. Tente novamente em instantes.'
          : (e.message || 'Não foi possível gerar a sugestão.'),
      code: e.status ? String(e.status) : '',
      retryable: e.status !== 503,
    };
  } finally {
    suggesting.value = false;
  }
}

async function confirmReorder() {
  if (hasOpenOrder.value) {
    toast.info('Já existe um pedido em aberto para este produto.');
    return;
  }
  const qty = suggestion.value && Number(suggestion.value.suggested_quantity);
  reordering.value = true;
  try {
    const res = await products.reorder(props.id, { quantity: qty > 0 ? qty : undefined });
    if (res && res.deduped) {
      toast.info('Pedido já estava em aberto — usamos o existente (idempotente).');
    } else {
      toast.success('Reposição iniciada. O pedido foi enfileirado ao fornecedor.');
    }
    router.push('/products/' + props.id);
  } catch (e) {
    toast.error('Falha ao iniciar a reposição.', { detail: e.message, code: e.status ? String(e.status) : '' });
  } finally {
    reordering.value = false;
  }
}

onMounted(loadProduct);
</script>

<style scoped>
.ps-ic { font-size: var(--ui-text-md); line-height: 1; }

/* resultado da sugestão */
.ps-result { display: flex; flex-direction: column; gap: var(--ui-space-3); }
.ps-headline { display: flex; align-items: center; justify-content: space-between; gap: var(--ui-space-3); flex-wrap: wrap; }
.ps-qty { display: flex; flex-direction: column; }
.ps-qty-num { font-family: var(--ui-font-display); font-size: 2rem; font-weight: 700; color: rgb(var(--ui-accent-strong)); line-height: 1.1; }
.ps-qty-cap { font-size: var(--ui-text-xs); color: rgb(var(--ui-muted)); }

.ps-conf {
  display: inline-flex; align-items: center; gap: 6px;
  font-size: var(--ui-text-xs); font-weight: 600; padding: 3px 9px;
  border-radius: var(--ui-radius-pill); white-space: nowrap;
  background: rgb(var(--ui-muted) / 0.16); color: rgb(var(--ui-muted));
}
.ps-conf-dot { width: 6px; height: 6px; border-radius: var(--ui-radius-pill); background: currentColor; }
.ps-conf[data-level="high"] { background: rgb(var(--ui-ok) / 0.16); color: rgb(var(--ui-ok)); }
.ps-conf[data-level="medium"] { background: rgb(var(--ui-warn) / 0.18); color: rgb(var(--ui-warn)); }
.ps-conf[data-level="low"] { background: rgb(var(--ui-danger) / 0.14); color: rgb(var(--ui-danger)); }

.ps-conf-track { height: 6px; border-radius: var(--ui-radius-pill); background: rgb(var(--ui-surface-2)); border: 1px solid rgb(var(--ui-border)); overflow: hidden; }
.ps-conf-fill { display: block; height: 100%; border-radius: var(--ui-radius-pill); }
.ps-conf-fill[data-level="low"] { width: 33%; background: rgb(var(--ui-danger)); }
.ps-conf-fill[data-level="medium"] { width: 66%; background: rgb(var(--ui-warn)); }
.ps-conf-fill[data-level="high"] { width: 100%; background: rgb(var(--ui-ok)); }

.ps-rationale {
  margin: 0; font-size: var(--ui-text-sm); line-height: 1.5;
  padding: var(--ui-space-3); border-left: 3px solid rgb(var(--ui-accent));
  background: rgb(var(--ui-accent) / 0.06); border-radius: var(--ui-radius-sm);
}
.ps-sources { display: flex; flex-direction: column; gap: 4px; }
.ps-sources-title { margin: 0; font-size: var(--ui-text-xs); font-weight: 600; color: rgb(var(--ui-muted)); text-transform: uppercase; letter-spacing: .04em; }
.ps-sources ul { margin: 0; padding-left: var(--ui-space-4); display: flex; flex-direction: column; gap: 2px; }
.ps-sources li { font-size: var(--ui-text-xs); }
.ps-foot { display: flex; flex-wrap: wrap; align-items: center; gap: var(--ui-space-2); margin: 0; font-size: var(--ui-text-xs); color: rgb(var(--ui-muted)); }
.ps-dry { font-weight: 600; }

/* ficha de contexto */
.ps-kv {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: var(--ui-space-3) var(--ui-space-4);
  margin: 0;
}
.ps-kv > div { display: flex; flex-direction: column; gap: 2px; }
.ps-kv dt { color: rgb(var(--ui-muted)); font-size: var(--ui-text-xs); text-transform: uppercase; letter-spacing: .04em; }
.ps-kv dd { margin: 0; font-weight: 500; }
</style>
