<template>
  <UiPageLayout
    eyebrow="Pedidos"
    title="Novo pedido"
    subtitle="Venda balcão: escolha os produtos, monte o carrinho, identifique o cliente e prossiga ao checkout idempotente."
    width="wide"
  >
    <template #actions>
      <UiButton variant="ghost" to="/orders">Voltar aos pedidos</UiButton>
    </template>

    <div class="oc-grid">
      <!-- ===================== Coluna esquerda: catálogo ===================== -->
      <div class="oc-catalog">
        <UiCard title="Catálogo" subtitle="Selecione produtos para adicionar ao carrinho.">
          <template #actions>
            <UiButton
              variant="subtle"
              size="sm"
              :loading="catalog.loading.value"
              @click="catalog.refresh()"
            >Atualizar</UiButton>
          </template>

          <div class="oc-search">
            <UiFormField label="Buscar produto" hint="Filtra por nome, SKU ou categoria.">
              <template #default="{ id, describedBy }">
                <input
                  :id="id"
                  v-model="query"
                  :aria-describedby="describedBy"
                  type="search"
                  placeholder="Camiseta, SKU-001, Vestuário…"
                  autocomplete="off"
                />
              </template>
            </UiFormField>
          </div>

          <!-- estado: carregando -->
          <UiLoadingState
            v-if="catalog.loading.value"
            variant="skeleton"
            :skeleton-lines="5"
            title="Carregando catálogo…"
          />

          <!-- estado: erro -->
          <UiErrorState
            v-else-if="catalog.error.value"
            :message="catalogErrorMessage"
            :code="catalogErrorCode"
            retryable
            @retry="catalog.refresh()"
          />

          <!-- estado: vazio (sem produtos cadastrados) -->
          <UiEmptyState
            v-else-if="!catalog.items.value.length"
            icon="📦"
            title="Nenhum produto cadastrado"
            description="Cadastre produtos no catálogo para começar a montar pedidos."
          >
            <template #action>
              <UiButton variant="primary" to="/products">Ir para o catálogo</UiButton>
            </template>
          </UiEmptyState>

          <!-- estado: vazio (filtro sem resultado) -->
          <UiEmptyState
            v-else-if="!filteredProducts.length"
            icon="🔍"
            title="Nada encontrado"
            :description="'Nenhum produto corresponde a “' + query + '”.'"
            compact
          >
            <template #action>
              <UiButton variant="ghost" size="sm" @click="query = ''">Limpar busca</UiButton>
            </template>
          </UiEmptyState>

          <!-- estado: normal -->
          <ul v-else class="oc-products" aria-label="Produtos disponíveis">
            <li
              v-for="p in filteredProducts"
              :key="p.id"
              class="oc-product"
              :data-out="isOutOfStock(p) ? 'true' : null"
            >
              <div class="oc-product-main">
                <p class="oc-product-name">{{ p.name }}</p>
                <p class="oc-product-meta">
                  <span class="oc-mono">{{ p.sku }}</span>
                  <span v-if="p.category" class="oc-dot" aria-hidden="true">·</span>
                  <span v-if="p.category">{{ p.category }}</span>
                </p>
                <div class="oc-product-tags">
                  <UiStatusBadge :status="stockStatus(p)" :label="stockLabel(p)" size="sm" />
                  <UiStatusBadge
                    v-if="p.status"
                    :status="p.status"
                    size="sm"
                  />
                </div>
              </div>
              <div class="oc-product-side">
                <p class="oc-product-price">{{ formatMoney(unitPrice(p)) }}</p>
                <UiButton
                  variant="primary"
                  size="sm"
                  :disabled="isOutOfStock(p)"
                  :aria-label="'Adicionar ' + p.name + ' ao carrinho'"
                  @click="addToCart(p)"
                >
                  {{ inCartQty(p) ? 'Adicionar (+1)' : 'Adicionar' }}
                </UiButton>
              </div>
            </li>
          </ul>
        </UiCard>
      </div>

      <!-- ===================== Coluna direita: carrinho + cliente + checkout ===================== -->
      <div class="oc-aside">
        <!-- ---------- Carrinho ---------- -->
        <UiCard title="Carrinho" :subtitle="cartSubtitle">
          <template #actions>
            <UiButton
              v-if="cart.length"
              variant="ghost"
              size="sm"
              @click="clearCart"
            >Esvaziar</UiButton>
          </template>

          <UiEmptyState
            v-if="!cart.length"
            icon="🛒"
            title="Carrinho vazio"
            description="Adicione produtos do catálogo ao lado para iniciar a venda."
            compact
          />

          <ul v-else class="oc-cart" aria-label="Itens do carrinho">
            <li v-for="item in cart" :key="item.id" class="oc-cart-item">
              <div class="oc-cart-info">
                <p class="oc-cart-name">{{ item.name }}</p>
                <p class="oc-cart-unit">
                  <span class="oc-mono">{{ item.sku }}</span>
                  <span class="oc-dot" aria-hidden="true">·</span>
                  {{ formatMoney(item.price) }} / un.
                </p>
              </div>
              <div class="oc-qty" role="group" :aria-label="'Quantidade de ' + item.name">
                <UiButton
                  variant="ghost"
                  size="sm"
                  :aria-label="'Diminuir quantidade de ' + item.name"
                  @click="decrement(item)"
                >−</UiButton>
                <span class="oc-qty-val" aria-live="polite">{{ item.qty }}</span>
                <UiButton
                  variant="ghost"
                  size="sm"
                  :disabled="atStockLimit(item)"
                  :aria-label="'Aumentar quantidade de ' + item.name"
                  @click="increment(item)"
                >+</UiButton>
              </div>
              <p class="oc-cart-line">{{ formatMoney(item.price * item.qty) }}</p>
              <UiButton
                variant="ghost"
                size="sm"
                class="oc-cart-remove"
                :aria-label="'Remover ' + item.name + ' do carrinho'"
                @click="removeItem(item)"
              >✕</UiButton>
            </li>
          </ul>

          <template v-if="cart.length" #footer>
            <dl class="oc-totals">
              <div class="oc-total-row">
                <dt>Itens</dt>
                <dd>{{ itemsCount }}</dd>
              </div>
              <div class="oc-total-row oc-total-grand">
                <dt>Total</dt>
                <dd>{{ formatMoney(cartTotal) }}</dd>
              </div>
            </dl>
          </template>
        </UiCard>

        <!-- ---------- Cliente ---------- -->
        <UiCard title="Cliente" subtitle="Identifique quem está comprando.">
          <form class="oc-form" novalidate @submit.prevent="submitOrder">
            <UiFormSection :columns="1">
              <UiFormField
                label="Nome do cliente"
                required
                :error="customer.errors.customerName"
                hint="Nome de quem recebe a venda."
              >
                <template #default="{ id, describedBy }">
                  <input
                    :id="id"
                    :value="customer.values.customerName"
                    :aria-describedby="describedBy"
                    type="text"
                    autocomplete="name"
                    placeholder="Ex.: Ana Souza"
                    @input="customer.setField('customerName', $event.target.value)"
                  />
                </template>
              </UiFormField>

              <UiFormField
                label="E-mail do cliente"
                :error="customer.errors.customerEmail"
                hint="Opcional — recibo e atualizações do pedido."
              >
                <template #default="{ id, describedBy }">
                  <input
                    :id="id"
                    :value="customer.values.customerEmail"
                    :aria-describedby="describedBy"
                    type="email"
                    autocomplete="email"
                    placeholder="cliente@exemplo.com"
                    @input="customer.setField('customerEmail', $event.target.value)"
                  />
                </template>
              </UiFormField>
            </UiFormSection>

            <div class="oc-actions">
              <UiButton
                type="submit"
                variant="primary"
                block
                size="lg"
                :disabled="!cart.length"
                :loading="processing"
              >
                {{ processing ? 'Processando…' : 'Pagar ' + formatMoney(cartTotal) }}
              </UiButton>
              <p class="oc-fineprint">
                Pagamento idempotente — reenviar o mesmo pedido não cobra duas vezes.
              </p>
            </div>
          </form>
        </UiCard>
      </div>
    </div>

    <!-- ===================== Confirmação de venda concluída ===================== -->
    <UiModal v-model:open="receiptOpen" title="Pedido criado" width="md" persistent>
      <div v-if="receipt" class="oc-receipt">
        <div class="oc-receipt-head">
          <UiStatusBadge
            :status="receipt.paymentStatus"
            :label="receiptBadgeLabel"
            size="lg"
          />
          <p class="oc-receipt-code">Pedido <span class="oc-mono">{{ receipt.code }}</span></p>
        </div>
        <dl class="oc-receipt-list">
          <div class="oc-receipt-row">
            <dt>Cliente</dt>
            <dd>{{ receipt.customerName }}</dd>
          </div>
          <div v-if="receipt.customerEmail" class="oc-receipt-row">
            <dt>E-mail</dt>
            <dd>{{ receipt.customerEmail }}</dd>
          </div>
          <div class="oc-receipt-row">
            <dt>Itens</dt>
            <dd>{{ receipt.itemsCount }}</dd>
          </div>
          <div class="oc-receipt-row">
            <dt>Total</dt>
            <dd>{{ formatMoney(receipt.total) }}</dd>
          </div>
          <div v-if="receipt.transactionId" class="oc-receipt-row">
            <dt>Transação</dt>
            <dd class="oc-mono">{{ receipt.transactionId }}</dd>
          </div>
          <div v-if="receipt.provider" class="oc-receipt-row">
            <dt>Gateway</dt>
            <dd>{{ receipt.provider }}</dd>
          </div>
        </dl>
      </div>
      <template #footer>
        <UiButton variant="ghost" @click="closeReceipt">Fechar</UiButton>
        <UiButton variant="primary" @click="startNewOrder">Novo pedido</UiButton>
      </template>
    </UiModal>
  </UiPageLayout>
</template>

<script setup>
import { ref, reactive, computed } from 'vue';
import {
  UiPageLayout,
  UiCard,
  UiButton,
  UiFormField,
  UiFormSection,
  UiStatusBadge,
  UiEmptyState,
  UiLoadingState,
  UiErrorState,
  UiModal,
  useForm,
  useToast,
  useConfirm,
  validators,
  format,
} from '../ui/index.js';
import * as api from '../api.js';

const toast = useToast();
const confirm = useConfirm();

/* ------------------------------------------------------------------ *
 * Camada de dados — só endpoints REAIS do backend ShopDesk:
 *   GET  /v1/products  (catálogo)
 *   POST /v1/orders    (cria o pedido de domínio)
 *   POST /v1/checkout  (cobrança idempotente — via store.checkout do api.js)
 * Prefere os recursos do api.js quando o integrador os expõe (api.products /
 * api.orders); senão usa um cliente fino sobre a MESMA base do api.js.
 * ------------------------------------------------------------------ */
const API_BASE = import.meta.env.VITE_API_BASE_URL || '/shopdesk/api';
async function call(method, path, body) {
  const res = await fetch(API_BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error((data && data.error && data.error.message) || ('HTTP ' + res.status));
    err.status = res.status;
    throw err;
  }
  return data;
}

const productsResource =
  api.products && typeof api.products.list === 'function'
    ? api.products
    : { list: (params) => call('GET', '/v1/products' + toQuery(params)) };

function toQuery(params) {
  const usp = new URLSearchParams();
  if (params && params.page) usp.set('page', params.page);
  if (params && params.pageSize) usp.set('pageSize', params.pageSize);
  const s = usp.toString();
  return s ? '?' + s : '';
}

function createOrder(payload) {
  if (api.orders && typeof api.orders.create === 'function') return api.orders.create(payload);
  return call('POST', '/v1/orders', payload);
}

function runCheckout(orderCode, amount) {
  // store.checkout (api.js) já envia paymentMethodToken e chama /v1/checkout.
  if (api.store && typeof api.store.checkout === 'function') {
    return api.store.checkout(orderCode, amount);
  }
  return call('POST', '/v1/checkout', {
    orderId: String(orderCode),
    amount: Number(amount),
    paymentMethodToken: 'tok_ok',
  });
}

/* ------------------------------------------------------------------ *
 * Catálogo de produtos (estados: loading / error / empty / normal)
 * ------------------------------------------------------------------ */
const products = ref([]);
const catalog = {
  items: products,
  loading: ref(false),
  error: ref(null),
  async load() {
    catalog.loading.value = true;
    catalog.error.value = null;
    try {
      const res = await productsResource.list({ page: 1, pageSize: 200 });
      const rows = Array.isArray(res) ? res : res.data || res.items || [];
      products.value = rows.map(normalizeProduct);
    } catch (e) {
      catalog.error.value = e;
      products.value = [];
    } finally {
      catalog.loading.value = false;
    }
  },
  refresh() {
    return catalog.load();
  },
};

// normaliza snake_case do Postgres → camelCase usado na tela.
function normalizeProduct(row) {
  return {
    id: row.id,
    sku: row.sku || '',
    name: row.name || 'Produto sem nome',
    category: row.category || '',
    price: Number(row.price != null ? row.price : 0),
    stockQty: Number(row.stockQty != null ? row.stockQty : row.stock_qty != null ? row.stock_qty : 0),
    active: row.active === undefined ? true : !!row.active,
    status: row.status || '',
  };
}

const catalogErrorMessage = computed(() => {
  const e = catalog.error.value;
  if (!e) return '';
  return e.message || 'Não foi possível carregar o catálogo.';
});
const catalogErrorCode = computed(() => {
  const e = catalog.error.value;
  return e && e.status ? String(e.status) : '';
});

/* ------------------------------------------------------------------ *
 * Busca / filtro do catálogo
 * ------------------------------------------------------------------ */
const query = ref('');
const filteredProducts = computed(() => {
  const q = query.value.trim().toLowerCase();
  const list = products.value;
  if (!q) return list;
  return list.filter((p) =>
    [p.name, p.sku, p.category].some((field) => String(field || '').toLowerCase().includes(q)),
  );
});

function unitPrice(p) {
  return Number(p.price || 0);
}
function isOutOfStock(p) {
  return p.active === false || Number(p.stockQty) <= 0;
}
function stockStatus(p) {
  if (isOutOfStock(p)) return 'esgotado';
  if (Number(p.stockQty) <= 5) return 'baixo';
  return 'ativo';
}
function stockLabel(p) {
  if (p.active === false) return 'Inativo';
  if (Number(p.stockQty) <= 0) return 'Sem estoque';
  return Number(p.stockQty) + ' em estoque';
}

/* ------------------------------------------------------------------ *
 * Carrinho
 * ------------------------------------------------------------------ */
const cart = reactive([]);

function cartEntry(p) {
  return cart.find((i) => i.id === p.id);
}
function inCartQty(p) {
  const e = cartEntry(p);
  return e ? e.qty : 0;
}
function atStockLimit(item) {
  const source = products.value.find((p) => p.id === item.id);
  if (!source) return false;
  return item.qty >= Number(source.stockQty);
}

function addToCart(p) {
  if (isOutOfStock(p)) {
    toast.warning('Produto sem estoque disponível.');
    return;
  }
  const entry = cartEntry(p);
  if (entry) {
    if (atStockLimit(entry)) {
      toast.warning('Quantidade no limite do estoque de ' + p.name + '.');
      return;
    }
    entry.qty += 1;
  } else {
    cart.push({ id: p.id, sku: p.sku, name: p.name, price: unitPrice(p), qty: 1 });
  }
  toast.success(p.name + ' adicionado ao carrinho.', { timeout: 2200 });
}
function increment(item) {
  if (atStockLimit(item)) {
    toast.warning('Quantidade no limite do estoque.');
    return;
  }
  item.qty += 1;
}
function decrement(item) {
  if (item.qty <= 1) {
    removeItem(item);
    return;
  }
  item.qty -= 1;
}
function removeItem(item) {
  const idx = cart.findIndex((i) => i.id === item.id);
  if (idx >= 0) cart.splice(idx, 1);
}
async function clearCart() {
  if (!cart.length) return;
  const ok = await confirm({
    title: 'Esvaziar carrinho',
    message: 'Remover todos os ' + itemsCount.value + ' item(ns) do carrinho? Esta ação não pode ser desfeita.',
    confirmLabel: 'Esvaziar',
    cancelLabel: 'Manter',
    danger: true,
  });
  if (!ok) return;
  cart.splice(0, cart.length);
  toast.info('Carrinho esvaziado.');
}

const itemsCount = computed(() => cart.reduce((acc, i) => acc + i.qty, 0));
const cartTotal = computed(() => cart.reduce((acc, i) => acc + i.price * i.qty, 0));
const cartSubtitle = computed(() =>
  cart.length
    ? itemsCount.value + ' item(ns) · ' + formatMoney(cartTotal.value)
    : 'Nenhum item adicionado.',
);

/* ------------------------------------------------------------------ *
 * Cliente (formulário validado)
 * ------------------------------------------------------------------ */
const customer = useForm({
  initial: { customerName: '', customerEmail: '' },
  rules: {
    customerName: [validators.required('Informe o nome do cliente'), validators.minLen(2)],
    customerEmail: [validators.email()],
  },
});

/* ------------------------------------------------------------------ *
 * Submissão: cria pedido (POST /v1/orders) + checkout idempotente (POST /v1/checkout)
 * ------------------------------------------------------------------ */
const processing = ref(false);
const receiptOpen = ref(false);
const receipt = ref(null);

function newOrderCode() {
  return 'PED-' + Date.now().toString(36).toUpperCase().slice(-6);
}

async function submitOrder() {
  if (!cart.length) {
    toast.warning('Adicione ao menos um produto ao carrinho.');
    return;
  }
  if (!customer.validate()) {
    toast.error('Revise os dados do cliente.');
    return;
  }
  if (processing.value) return;

  processing.value = true;
  const code = newOrderCode();
  const amount = cartTotal.value;
  try {
    // 1) cria o pedido de domínio
    const created = await createOrder({
      code,
      customerName: customer.values.customerName,
      customerEmail: customer.values.customerEmail || null,
      total: amount,
      itemsCount: itemsCount.value,
      status: 'pendente',
      paymentStatus: 'aguardando',
    });

    // 2) cobrança idempotente
    let paid = null;
    let paymentStatus = 'aguardando';
    let orderStatus = 'pendente';
    try {
      paid = await runCheckout(code, amount);
      const okPay = paid && /approv|aprovad|paid|success|ok|authorized|autorizad/i.test(String(paid.status || ''));
      paymentStatus = okPay ? 'aprovado' : 'recusado';
      orderStatus = okPay ? 'pago' : 'falha_pagamento';
      if (okPay) toast.success('Pagamento aprovado — pedido ' + code + '.');
      else toast.warning('Pagamento não aprovado. Pedido ' + code + ' registrado como pendente.');
    } catch (payErr) {
      paymentStatus = 'recusado';
      orderStatus = 'falha_pagamento';
      toast.error('Falha no pagamento: ' + (payErr.message || 'erro desconhecido') + '. Pedido registrado.');
    }

    receipt.value = {
      code,
      id: created && created.id,
      customerName: customer.values.customerName,
      customerEmail: customer.values.customerEmail || '',
      itemsCount: itemsCount.value,
      total: amount,
      status: orderStatus,
      paymentStatus,
      transactionId: paid && paid.transactionId ? paid.transactionId : '',
      provider: paid && paid.provider ? paid.provider : '',
    };
    receiptOpen.value = true;
  } catch (e) {
    toast.error('Não foi possível criar o pedido: ' + (e.message || 'erro desconhecido'));
  } finally {
    processing.value = false;
  }
}

const receiptBadgeLabel = computed(() => {
  if (!receipt.value) return '';
  return receipt.value.paymentStatus === 'aprovado'
    ? 'Pagamento aprovado'
    : 'Pagamento pendente';
});

function closeReceipt() {
  receiptOpen.value = false;
}
function startNewOrder() {
  receiptOpen.value = false;
  receipt.value = null;
  cart.splice(0, cart.length);
  customer.reset();
  query.value = '';
  toast.info('Pronto para um novo pedido.');
}

/* ------------------------------------------------------------------ *
 * Helpers de formatação
 * ------------------------------------------------------------------ */
function formatMoney(value) {
  return format.formatCurrency(value);
}

catalog.load();
</script>

<style scoped>
.oc-grid {
  display: grid;
  grid-template-columns: 1.6fr 1fr;
  gap: var(--ui-space-5);
  align-items: start;
}
.oc-aside {
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-4);
  position: sticky;
  top: var(--ui-space-5);
}

/* ---------- busca ---------- */
.oc-search {
  margin-bottom: var(--ui-space-4);
}

/* ---------- lista de produtos ---------- */
.oc-products {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-2);
}
.oc-product {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ui-space-4);
  padding: var(--ui-space-3) var(--ui-space-4);
  border: 1px solid rgb(var(--ui-border));
  border-radius: var(--ui-radius-md);
  background: rgb(var(--ui-surface));
  transition: border-color 0.15s ease, background 0.15s ease;
}
.oc-product:hover {
  border-color: rgb(var(--ui-border-strong));
  background: rgb(var(--ui-surface-2));
}
.oc-product[data-out='true'] {
  opacity: 0.7;
}
.oc-product-main {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.oc-product-name {
  margin: 0;
  font-weight: 600;
  color: rgb(var(--ui-fg));
}
.oc-product-meta {
  margin: 0;
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
  font-size: var(--ui-text-sm);
  color: rgb(var(--ui-muted));
}
.oc-product-tags {
  display: flex;
  gap: var(--ui-space-2);
  flex-wrap: wrap;
  margin-top: 2px;
}
.oc-product-side {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: var(--ui-space-2);
  flex-shrink: 0;
}
.oc-product-price {
  margin: 0;
  font-weight: 700;
  font-size: var(--ui-text-md);
  color: rgb(var(--ui-fg));
}

/* ---------- carrinho ---------- */
.oc-cart {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-3);
}
.oc-cart-item {
  display: grid;
  grid-template-columns: 1fr auto auto auto;
  align-items: center;
  gap: var(--ui-space-3);
}
.oc-cart-info {
  min-width: 0;
}
.oc-cart-name {
  margin: 0;
  font-weight: 600;
  color: rgb(var(--ui-fg));
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.oc-cart-unit {
  margin: 2px 0 0;
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: var(--ui-text-xs);
  color: rgb(var(--ui-muted));
}
.oc-qty {
  display: inline-flex;
  align-items: center;
  gap: var(--ui-space-2);
}
.oc-qty-val {
  min-width: 1.6ch;
  text-align: center;
  font-variant-numeric: tabular-nums;
  font-weight: 600;
}
.oc-cart-line {
  margin: 0;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.oc-cart-remove {
  color: rgb(var(--ui-muted));
}

/* ---------- totais ---------- */
.oc-totals {
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.oc-total-row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
}
.oc-total-row dt {
  color: rgb(var(--ui-muted));
  font-size: var(--ui-text-sm);
}
.oc-total-row dd {
  margin: 0;
  font-variant-numeric: tabular-nums;
}
.oc-total-grand dt {
  color: rgb(var(--ui-fg));
  font-weight: 700;
  font-size: var(--ui-text-md);
}
.oc-total-grand dd {
  font-weight: 700;
  font-size: var(--ui-text-lg);
  color: rgb(var(--ui-accent-strong));
}

/* ---------- formulário cliente / ações ---------- */
.oc-form {
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-2);
}
.oc-actions {
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-2);
  margin-top: var(--ui-space-2);
}
.oc-fineprint {
  margin: 0;
  text-align: center;
  font-size: var(--ui-text-xs);
  color: rgb(var(--ui-muted));
}

/* ---------- recibo (modal) ---------- */
.oc-receipt {
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-4);
}
.oc-receipt-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ui-space-3);
  flex-wrap: wrap;
}
.oc-receipt-code {
  margin: 0;
  color: rgb(var(--ui-muted));
}
.oc-receipt-list {
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-2);
}
.oc-receipt-row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--ui-space-4);
  border-bottom: 1px solid rgb(var(--ui-border));
  padding-bottom: 6px;
}
.oc-receipt-row:last-child {
  border-bottom: none;
}
.oc-receipt-row dt {
  color: rgb(var(--ui-muted));
  font-size: var(--ui-text-sm);
}
.oc-receipt-row dd {
  margin: 0;
  font-weight: 600;
  text-align: right;
}

/* ---------- utilitários locais ---------- */
.oc-mono {
  font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
  font-size: 0.92em;
}
.oc-dot {
  color: rgb(var(--ui-border-strong));
}

/* ---------- responsivo ---------- */
@media (max-width: 960px) {
  .oc-grid {
    grid-template-columns: 1fr;
  }
  .oc-aside {
    position: static;
  }
}
@media (max-width: 520px) {
  .oc-product {
    flex-direction: column;
    align-items: stretch;
  }
  .oc-product-side {
    flex-direction: row;
    align-items: center;
    justify-content: space-between;
  }
  .oc-cart-item {
    grid-template-columns: 1fr auto;
    grid-template-areas:
      'info remove'
      'qty line';
    row-gap: var(--ui-space-2);
  }
  .oc-cart-info {
    grid-area: info;
  }
  .oc-cart-remove {
    grid-area: remove;
    justify-self: end;
  }
  .oc-qty {
    grid-area: qty;
  }
  .oc-cart-line {
    grid-area: line;
    justify-self: end;
  }
}
</style>
