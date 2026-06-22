<!--
  CartDetailView — Detalhe do carrinho (REF-SHOPDESK-0012 / REQ-SHOPDESK-0003)
  Exibe os dados do carrinho em modo leitura: itens, cliente e subtotal.
  "Editar" navega para /carts/:id/edit. Checkout inicia o fluxo de pagamento.
  Estados: loading / empty / error / normal. CSP-safe. A11y. Responsivo.
  Apenas endpoints reais via ../api.js.
-->
<template>
  <UiPageLayout
    eyebrow="Carrinhos"
    :title="pageTitle"
    subtitle="Detalhes do carrinho — itens, cliente e situação atual."
    width="wide"
    :loading="loading"
    loading-message="Carregando carrinho…"
    :error="loadError"
    :retryable="true"
    @retry="reload"
  >
    <!-- ações de topo -->
    <template #actions>
      <UiButton variant="ghost" to="/carts">Voltar à lista</UiButton>
      <UiButton
        variant="subtle"
        :disabled="loading || !cart"
        :loading="refreshing"
        @click="reload"
      >
        Atualizar
      </UiButton>
      <UiButton
        v-if="cart && !isConverted"
        variant="subtle"
        :to="'/carts/' + cartId + '/edit'"
      >
        Editar
      </UiButton>
      <UiButton
        v-if="cart && !isConverted"
        variant="primary"
        :disabled="!canCheckout"
        @click="goToCheckout"
      >
        Avançar para o checkout
      </UiButton>
    </template>

    <!-- banner contextual -->
    <template #banner>
      <p v-if="cart && isConverted" class="cd-note" data-tone="success" role="status">
        <span class="cd-note-icon" aria-hidden="true">✓</span>
        Este carrinho já foi convertido em pedido. Disponível apenas para consulta.
      </p>
      <p v-else-if="cart && isAbandoned" class="cd-note" data-tone="warning" role="status">
        <span class="cd-note-icon" aria-hidden="true">⚠</span>
        Carrinho marcado como abandonado. Você pode editá-lo e retomar o checkout.
      </p>
      <p v-else-if="cart && isEmpty" class="cd-note" data-tone="neutral" role="status">
        <span class="cd-note-icon" aria-hidden="true">🛒</span>
        Carrinho sem itens — acesse a loja para adicionar produtos.
      </p>
    </template>

    <!-- ESTADO: carrinho não encontrado -->
    <UiEmptyState
      v-if="!loading && !loadError && !cart"
      icon="🔎"
      title="Carrinho não encontrado"
      :description="'Não localizamos o carrinho ' + cartLabel + '. Ele pode ter expirado ou sido removido.'"
    >
      <template #action>
        <UiButton variant="primary" to="/carts">Ver lista de carrinhos</UiButton>
      </template>
    </UiEmptyState>

    <!-- ESTADO NORMAL -->
    <div v-else-if="!loading && !loadError && cart" class="cd-grid">
      <!-- coluna principal: métricas + tabela de itens -->
      <div class="cd-main">
        <!-- KPIs -->
        <div class="cd-metrics">
          <UiMetricCard label="Itens" :value="format.formatNumber(itemsCount)" tone="primary" />
          <UiMetricCard
            label="Produtos distintos"
            :value="format.formatNumber(items.length)"
            hint="Linhas no carrinho"
          />
          <UiMetricCard
            label="Subtotal"
            :value="format.formatCurrency(subtotal)"
            tone="success"
            hint="Sem frete e impostos"
          />
        </div>

        <!-- tabela de itens (somente leitura) -->
        <UiCard title="Itens do carrinho" subtitle="Lista dos produtos neste carrinho.">
          <template #actions>
            <UiStatusBadge :status="cart.status" :label="statusLabel" />
          </template>

          <UiDataTable
            :columns="itemColumns"
            :rows="items"
            row-key="_k"
            :empty="emptyItems"
          >
            <template #cell-name="{ row }">
              <div class="cd-prod">
                <span class="cd-prod-name">{{ row.name || row.productName || 'Produto' }}</span>
                <span v-if="row.sku" class="cd-prod-sku ui-mono">{{ row.sku }}</span>
              </div>
            </template>

            <template #cell-unitPrice="{ row }">
              {{ format.formatCurrency(unitPriceOf(row)) }}
            </template>

            <template #cell-quantity="{ row }">
              <span class="cd-qty-value">{{ format.formatNumber(quantityOf(row)) }}</span>
            </template>

            <template #cell-lineTotal="{ row }">
              <strong>{{ format.formatCurrency(lineTotalOf(row)) }}</strong>
            </template>

            <template #empty-action>
              <UiButton
                v-if="!isConverted"
                variant="ghost"
                :to="'/carts/' + cartId + '/edit'"
              >
                Editar carrinho
              </UiButton>
            </template>
          </UiDataTable>

          <template #footer>
            <div class="cd-foot">
              <div class="cd-foot-totals">
                <span class="cd-foot-label">Subtotal</span>
                <span class="cd-foot-value">{{ format.formatCurrency(subtotal) }}</span>
              </div>
              <div class="cd-foot-actions">
                <UiButton
                  v-if="!isConverted"
                  variant="subtle"
                  :to="'/carts/' + cartId + '/edit'"
                >
                  Editar itens
                </UiButton>
                <UiButton variant="ghost" to="/loja">Continuar comprando</UiButton>
              </div>
            </div>
          </template>
        </UiCard>
      </div>

      <!-- coluna lateral: cliente + resumo do pedido -->
      <aside class="cd-side">
        <!-- CustomerInfo (somente leitura) -->
        <UiCard title="Cliente" subtitle="Quem está comprando.">
          <dl class="cd-kv">
            <div class="cd-kv-row">
              <dt>Nome</dt>
              <dd>{{ cart.customerName || cart.customer_name || 'Visitante' }}</dd>
            </div>
            <div class="cd-kv-row">
              <dt>Itens</dt>
              <dd>{{ format.formatNumber(itemsCount) }}</dd>
            </div>
            <div class="cd-kv-row">
              <dt>Situação</dt>
              <dd><UiStatusBadge :status="cart.status" :label="statusLabel" size="sm" /></dd>
            </div>
            <div class="cd-kv-row">
              <dt>Atualizado em</dt>
              <dd>{{ format.formatDateTime(cart.updatedAt || cart.updated_at) }}</dd>
            </div>
          </dl>
        </UiCard>

        <!-- Resumo + CheckoutButton -->
        <UiCard title="Resumo do pedido">
          <dl class="cd-summary">
            <div class="cd-sum-row">
              <dt>Itens</dt>
              <dd>{{ format.formatNumber(itemsCount) }}</dd>
            </div>
            <div class="cd-sum-row">
              <dt>Subtotal</dt>
              <dd>{{ format.formatCurrency(subtotal) }}</dd>
            </div>
            <div class="cd-sum-row cd-sum-total">
              <dt>Total a pagar</dt>
              <dd>{{ format.formatCurrency(subtotal) }}</dd>
            </div>
          </dl>
          <template #footer>
            <div class="cd-checkout">
              <UiButton
                v-if="!isConverted"
                variant="primary"
                size="lg"
                block
                :disabled="!canCheckout"
                @click="goToCheckout"
              >
                Avançar para o checkout
              </UiButton>
              <UiButton v-else variant="subtle" size="lg" block to="/carts">
                Ver carrinhos
              </UiButton>
              <p v-if="!isConverted && !canCheckout" class="cd-checkout-hint ui-muted">
                {{ checkoutHint }}
              </p>
              <p v-else-if="isConverted" class="cd-checkout-hint ui-muted">
                Carrinho já convertido em pedido.
              </p>
            </div>
          </template>
        </UiCard>
      </aside>
    </div>
  </UiPageLayout>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import {
  UiPageLayout,
  UiCard,
  UiButton,
  UiMetricCard,
  UiStatusBadge,
  UiDataTable,
  UiEmptyState,
  useToast,
  useConfirm,
  format,
} from '../ui/index.js';
import * as api from '../api.js';

const props = defineProps({ id: { type: [String, Number], default: '' } });

const route = useRoute();
const router = useRouter();
const toast = useToast();
const confirm = useConfirm();

const cartId = computed(() => String(props.id ?? route.params.id ?? '').trim());
const cartLabel = computed(() => '#' + (cartId.value || '—'));
const pageTitle = computed(() => (cartId.value ? 'Carrinho ' + cartLabel.value : 'Carrinho'));

// estados de carga
const loading = ref(true);
const refreshing = ref(false);
const loadError = ref(null);
const cart = ref(null);

function normalizeItems(data) {
  if (!data) return [];
  const raw = data.items || data.lineItems || data.line_items || [];
  if (!Array.isArray(raw)) return [];
  return raw.map((it, i) => ({ _k: it.id ?? it.sku ?? i, ...it }));
}

const items = ref([]);

const unitPriceOf = (it) => Number(it.unitPrice ?? it.unit_price ?? it.price ?? 0);
const quantityOf = (it) => Number(it.quantity ?? it.qty ?? 0);
const lineTotalOf = (it) => unitPriceOf(it) * quantityOf(it);

const itemsCount = computed(() => {
  if (items.value.length) return items.value.reduce((s, it) => s + quantityOf(it), 0);
  return Number(cart.value?.itemsCount ?? cart.value?.items_count ?? 0);
});
const subtotal = computed(() => {
  if (items.value.length) return items.value.reduce((s, it) => s + lineTotalOf(it), 0);
  return Number(cart.value?.subtotal ?? 0);
});

const statusOf = computed(() => String(cart.value?.status || '').toLowerCase());
const isConverted = computed(() => statusOf.value === 'convertido');
const isAbandoned = computed(() => statusOf.value === 'abandonado');
const isEmpty = computed(() => itemsCount.value <= 0 && subtotal.value <= 0);
const statusLabel = computed(() => format.humanize(cart.value?.status || ''));

const canCheckout = computed(() => !!cart.value && !isConverted.value && !isEmpty.value);
const checkoutHint = computed(() =>
  isEmpty.value ? 'Adicione itens ao carrinho antes de finalizar.' : 'Carrinho indisponível para checkout.',
);

const itemColumns = [
  { key: 'name', label: 'Produto' },
  { key: 'unitPrice', label: 'Preço un.', align: 'right' },
  { key: 'quantity', label: 'Qtd.', align: 'center' },
  { key: 'lineTotal', label: 'Total', align: 'right' },
];
const emptyItems = {
  title: 'Carrinho vazio',
  description: 'Ainda não há produtos neste carrinho.',
  icon: '🛒',
};

async function load(opts = {}) {
  if (opts.refresh) refreshing.value = true; else loading.value = true;
  loadError.value = null;
  if (!cartId.value) {
    cart.value = null;
    loading.value = false;
    refreshing.value = false;
    return;
  }
  try {
    const data = await api.carts.get(cartId.value);
    cart.value = data || null;
    items.value = normalizeItems(data);
  } catch (e) {
    if (e && e.status === 404) {
      cart.value = null;
    } else {
      loadError.value = e;
    }
  } finally {
    loading.value = false;
    refreshing.value = false;
  }
}
const reload = () => load({ refresh: !!cart.value });

async function goToCheckout() {
  if (!canCheckout.value) return;
  const ok = await confirm({
    title: 'Avançar para o checkout',
    message:
      'Finalizar o carrinho ' +
      cartLabel.value +
      ' com subtotal de ' +
      format.formatCurrency(subtotal.value) +
      '?',
    confirmLabel: 'Ir para o checkout',
    cancelLabel: 'Continuar',
  });
  if (!ok) return;
  router.push('/checkout/' + cartId.value);
}

onMounted(() => load());
</script>

<style scoped>
/* banner contextual */
.cd-note {
  display: flex;
  align-items: center;
  gap: var(--ui-space-2);
  margin: 0;
  padding: var(--ui-space-2) var(--ui-space-4);
  border-radius: var(--ui-radius-md);
  font-size: var(--ui-text-sm);
  font-weight: 600;
  border: 1px solid rgb(var(--ui-border));
}
.cd-note[data-tone="success"] { background: rgb(var(--ui-ok) / 0.1); color: rgb(var(--ui-ok)); border-color: rgb(var(--ui-ok) / 0.4); }
.cd-note[data-tone="warning"] { background: rgb(var(--ui-warn) / 0.1); color: rgb(var(--ui-warn)); border-color: rgb(var(--ui-warn) / 0.4); }
.cd-note[data-tone="neutral"] { background: rgb(var(--ui-surface-2)); color: rgb(var(--ui-muted)); }
.cd-note-icon { flex-shrink: 0; }

/* layout em 2 colunas */
.cd-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 340px;
  gap: var(--ui-space-5);
  align-items: start;
}
.cd-main { display: flex; flex-direction: column; gap: var(--ui-space-4); min-width: 0; }
.cd-side { display: flex; flex-direction: column; gap: var(--ui-space-4); min-width: 0; }

/* KPIs */
.cd-metrics {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: var(--ui-space-3);
}

/* célula de produto */
.cd-prod { display: flex; flex-direction: column; gap: var(--ui-space-1); min-width: 0; }
.cd-prod-name { font-weight: 600; color: rgb(var(--ui-fg)); }
.cd-prod-sku { font-size: var(--ui-text-xs); color: rgb(var(--ui-muted)); }

/* quantidade (somente leitura) */
.cd-qty-value { font-weight: 600; font-variant-numeric: tabular-nums; }

/* rodapé da tabela */
.cd-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ui-space-4);
  flex-wrap: wrap;
}
.cd-foot-totals { display: flex; align-items: baseline; gap: var(--ui-space-3); }
.cd-foot-label { color: rgb(var(--ui-muted)); font-size: var(--ui-text-sm); }
.cd-foot-value { font-family: var(--ui-font-display); font-size: var(--ui-text-xl); font-weight: 700; }
.cd-foot-actions { display: flex; gap: var(--ui-space-2); flex-wrap: wrap; }

/* CustomerInfo */
.cd-kv { margin: 0; display: flex; flex-direction: column; gap: var(--ui-space-3); }
.cd-kv-row { display: flex; align-items: baseline; justify-content: space-between; gap: var(--ui-space-3); }
.cd-kv dt { margin: 0; font-size: var(--ui-text-xs); text-transform: uppercase; letter-spacing: .06em; color: rgb(var(--ui-muted)); font-weight: 600; }
.cd-kv dd { margin: 0; font-weight: 600; text-align: right; word-break: break-word; min-width: 0; }

/* resumo do pedido */
.cd-summary { margin: 0; display: flex; flex-direction: column; gap: var(--ui-space-2); }
.cd-sum-row { display: flex; align-items: baseline; justify-content: space-between; gap: var(--ui-space-3); }
.cd-sum-row dt { color: rgb(var(--ui-muted)); font-size: var(--ui-text-sm); margin: 0; }
.cd-sum-row dd { margin: 0; font-weight: 600; }
.cd-sum-total { padding-top: var(--ui-space-2); border-top: 1px solid rgb(var(--ui-border)); }
.cd-sum-total dt { color: rgb(var(--ui-fg)); font-weight: 700; font-size: var(--ui-text-md); }
.cd-sum-total dd { font-family: var(--ui-font-display); font-size: var(--ui-text-lg); font-weight: 700; }

/* checkout */
.cd-checkout { display: flex; flex-direction: column; gap: var(--ui-space-2); }
.cd-checkout-hint { margin: 0; font-size: var(--ui-text-xs); text-align: center; }

/* responsivo */
@media (max-width: 980px) {
  .cd-grid { grid-template-columns: 1fr; }
  .cd-side { flex-direction: row; flex-wrap: wrap; }
  .cd-side > * { flex: 1 1 280px; }
}
@media (max-width: 640px) {
  .cd-metrics { grid-template-columns: 1fr; }
  .cd-side { flex-direction: column; }
}
</style>
