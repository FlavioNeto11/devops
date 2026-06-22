<!-- OrderCreateView — REF/REQ-SHOPDESK-0003: criar pedido manual (venda balcão).
     Fluxo em 3 momentos numa só tela: (1) ProductPicker — catálogo real GET /v1/products com
     busca/estados; (2) CartEditor — monte/ajuste o carrinho com limite de estoque; (3) CustomerForm
     + CheckoutButton — identifique o cliente e finalize com cobrança IDEMPOTENTE (POST /v1/orders +
     POST /v1/checkout via ../api.js, Idempotency-Key estável por código de pedido).
     Contrato de UI: SÓ componentes do kit + tokens --ui-* ; sem style inline / :style / v-html ;
     todos os estados (loading/empty/error/normal) ; a11y + responsivo ; ação destrutiva via useConfirm ;
     toast em sucesso/erro. Links de domínio apenas (/orders, /products). -->
<template>
  <UiPageLayout
    eyebrow="Pedidos · Venda balcão"
    title="Novo pedido"
    subtitle="Escolha os produtos, monte o carrinho, identifique o cliente e finalize com pagamento idempotente."
    width="wide"
  >
    <template #actions>
      <UiButton variant="ghost" to="/orders">Voltar aos pedidos</UiButton>
      <UiButton variant="subtle" to="/products">Gerenciar catálogo</UiButton>
    </template>

    <!-- Trilha de progresso da venda balcão -->
    <template #banner>
      <ol class="oc-steps" aria-label="Etapas da venda">
        <li class="oc-step" :data-state="stepState(1)">
          <span class="oc-step-dot" aria-hidden="true">{{ stepDone(1) ? '✓' : '1' }}</span>
          <span class="oc-step-label">Selecionar produtos</span>
        </li>
        <li class="oc-step" :data-state="stepState(2)">
          <span class="oc-step-dot" aria-hidden="true">{{ stepDone(2) ? '✓' : '2' }}</span>
          <span class="oc-step-label">Conferir carrinho</span>
        </li>
        <li class="oc-step" :data-state="stepState(3)">
          <span class="oc-step-dot" aria-hidden="true">{{ stepDone(3) ? '✓' : '3' }}</span>
          <span class="oc-step-label">Cliente e pagamento</span>
        </li>
      </ol>
    </template>

    <div class="oc-grid">
      <!-- ============================ ProductPicker ============================ -->
      <section class="oc-catalog" aria-label="Catálogo de produtos">
        <UiCard title="Catálogo" subtitle="Toque em um produto para adicioná-lo ao carrinho.">
          <template #actions>
            <UiButton
              variant="subtle"
              size="sm"
              :loading="catalog.loading.value"
              @click="reloadCatalog"
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
                  inputmode="search"
                  autocomplete="off"
                  placeholder="Camiseta, SKU-001, Vestuário…"
                />
              </template>
            </UiFormField>
          </div>

          <!-- estado: carregando -->
          <UiLoadingState
            v-if="catalog.loading.value"
            variant="skeleton"
            :skeleton-lines="6"
            title="Carregando catálogo…"
          />

          <!-- estado: erro -->
          <UiErrorState
            v-else-if="catalog.error.value"
            :message="catalogErrorMessage"
            :code="catalogErrorCode"
            retryable
            @retry="reloadCatalog"
          />

          <!-- estado: vazio (sem produtos cadastrados) -->
          <UiEmptyState
            v-else-if="!catalog.items.value.length"
            icon="📦"
            title="Nenhum produto cadastrado"
            description="Cadastre produtos no catálogo para começar a montar pedidos de balcão."
          >
            <template #action>
              <UiButton variant="primary" to="/products/new">Cadastrar produto</UiButton>
            </template>
          </UiEmptyState>

          <!-- estado: vazio (busca sem resultado) -->
          <UiEmptyState
            v-else-if="!filteredProducts.length"
            icon="search"
            compact
            title="Nada encontrado"
            :description="'Nenhum produto corresponde a “' + query.trim() + '”.'"
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
              :data-incart="inCartQty(p) ? 'true' : null"
            >
              <div class="oc-product-main">
                <p class="oc-product-name">{{ p.name }}</p>
                <p class="oc-product-meta">
                  <span class="ui-mono">{{ p.sku || '—' }}</span>
                  <template v-if="p.category">
                    <span class="oc-dot" aria-hidden="true">·</span>
                    <span>{{ p.category }}</span>
                  </template>
                </p>
                <div class="oc-product-tags">
                  <UiStatusBadge :status="stockTone(p)" :label="stockLabel(p)" size="sm" />
                  <UiStatusBadge v-if="p.status" :status="p.status" size="sm" />
                  <span v-if="inCartQty(p)" class="oc-incart" aria-live="polite">
                    {{ inCartQty(p) }} no carrinho
                  </span>
                </div>
              </div>
              <div class="oc-product-side">
                <p class="oc-product-price">{{ money(p.price) }}</p>
                <UiButton
                  variant="primary"
                  size="sm"
                  :disabled="isOutOfStock(p) || atStockLimitFor(p)"
                  :aria-label="'Adicionar ' + p.name + ' ao carrinho'"
                  @click="addToCart(p)"
                >
                  {{ inCartQty(p) ? 'Adicionar mais' : 'Adicionar' }}
                </UiButton>
              </div>
            </li>
          </ul>
        </UiCard>
      </section>

      <!-- ===================== CartEditor + CustomerForm + Checkout ===================== -->
      <aside class="oc-aside" aria-label="Carrinho e finalização">
        <!-- ---------- CartEditor ---------- -->
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
            compact
            title="Carrinho vazio"
            description="Adicione produtos do catálogo ao lado para iniciar a venda."
          />

          <ul v-else class="oc-cart" aria-label="Itens do carrinho">
            <li v-for="item in cart" :key="item.id" class="oc-cart-item">
              <div class="oc-cart-info">
                <p class="oc-cart-name" :title="item.name">{{ item.name }}</p>
                <p class="oc-cart-unit">
                  <span class="ui-mono">{{ item.sku || '—' }}</span>
                  <span class="oc-dot" aria-hidden="true">·</span>
                  <span>{{ money(item.price) }} / un.</span>
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
              <p class="oc-cart-line">{{ money(item.price * item.qty) }}</p>
              <UiButton
                variant="ghost"
                size="sm"
                :aria-label="'Remover ' + item.name + ' do carrinho'"
                @click="removeItem(item)"
              >✕</UiButton>
            </li>
          </ul>

          <template v-if="cart.length" #footer>
            <dl class="oc-totals">
              <div class="oc-total-row">
                <dt>Itens</dt>
                <dd>{{ format.formatNumber(itemsCount) }}</dd>
              </div>
              <div class="oc-total-row oc-total-grand">
                <dt>Total</dt>
                <dd>{{ money(cartTotal) }}</dd>
              </div>
            </dl>
          </template>
        </UiCard>

        <!-- ---------- CustomerForm + CheckoutButton ---------- -->
        <UiCard title="Cliente e pagamento" subtitle="Identifique quem compra e finalize a venda.">
          <form class="oc-form" novalidate @submit.prevent="submitOrder">
            <UiFormSection :columns="1">
              <UiFormField
                label="Nome do cliente"
                required
                :error="customerError('customerName')"
                hint="Quem recebe a venda (use “Consumidor” para venda anônima)."
              >
                <template #default="{ id, describedBy, hasError }">
                  <input
                    :id="id"
                    :value="customer.values.customerName"
                    :aria-describedby="describedBy"
                    :aria-invalid="hasError ? 'true' : null"
                    type="text"
                    autocomplete="name"
                    placeholder="Ex.: Ana Souza"
                    @input="customer.setField('customerName', $event.target.value)"
                    @blur="customer.validateField('customerName')"
                  />
                </template>
              </UiFormField>

              <UiFormField
                label="E-mail do cliente"
                :error="customerError('customerEmail')"
                hint="Opcional — recibo e atualizações do pedido."
              >
                <template #default="{ id, describedBy, hasError }">
                  <input
                    :id="id"
                    :value="customer.values.customerEmail"
                    :aria-describedby="describedBy"
                    :aria-invalid="hasError ? 'true' : null"
                    type="email"
                    inputmode="email"
                    autocomplete="email"
                    placeholder="cliente@exemplo.com"
                    @input="customer.setField('customerEmail', $event.target.value)"
                    @blur="customer.validateField('customerEmail')"
                  />
                </template>
              </UiFormField>

              <UiFormField
                label="Forma de pagamento"
                required
                :error="customerError('method')"
              >
                <template #default="{ id, describedBy }">
                  <select
                    :id="id"
                    :aria-describedby="describedBy"
                    :value="customer.values.method"
                    @change="onMethodChange($event.target.value)"
                    @blur="customer.validateField('method')"
                  >
                    <option v-for="m in methods" :key="m.value" :value="m.value">{{ m.label }}</option>
                  </select>
                </template>
              </UiFormField>

              <UiFormField
                label="Token do método"
                required
                hint="Identificador tokenizado do cofre de pagamento (ex.: tok_card_…). Nunca pedimos o número do cartão."
                :error="customerError('paymentMethodToken')"
              >
                <template #default="{ id, describedBy, hasError }">
                  <input
                    :id="id"
                    :value="customer.values.paymentMethodToken"
                    :aria-describedby="describedBy"
                    :aria-invalid="hasError ? 'true' : null"
                    type="text"
                    inputmode="latin"
                    autocomplete="off"
                    spellcheck="false"
                    placeholder="tok_…"
                    @input="customer.setField('paymentMethodToken', $event.target.value)"
                    @blur="customer.validateField('paymentMethodToken')"
                  />
                </template>
              </UiFormField>
            </UiFormSection>

            <!-- Garantia de idempotência (CheckoutButton context) -->
            <div class="oc-idem">
              <div class="oc-idem-head">
                <span class="oc-idem-label">Idempotency-Key</span>
                <UiStatusBadge tone="success" status="ok" label="Cobrança única garantida" />
              </div>
              <code class="oc-idem-key ui-mono">{{ idempotencyKey }}</code>
              <p class="oc-idem-note ui-muted">
                Reenviar o mesmo pedido com esta chave não gera nova cobrança — a transação é reaproveitada.
              </p>
            </div>

            <div class="oc-charge">
              <span class="ui-muted">Total a cobrar</span>
              <strong class="oc-charge-value">{{ money(cartTotal) }}</strong>
            </div>

            <div class="oc-actions">
              <UiButton
                type="submit"
                variant="primary"
                size="lg"
                block
                :disabled="!cart.length"
                :loading="processing"
              >
                {{ processing ? 'Processando pagamento…' : 'Finalizar e pagar ' + money(cartTotal) }}
              </UiButton>
              <p v-if="!cart.length" class="oc-fineprint">
                Adicione ao menos um produto para finalizar.
              </p>
              <p v-else class="oc-fineprint">
                Cria o pedido e cobra de forma idempotente em uma única ação.
              </p>
            </div>
          </form>
        </UiCard>
      </aside>
    </div>

    <!-- ============================ Recibo (resultado) ============================ -->
    <UiModal v-model:open="receiptOpen" title="Pedido criado" width="md" persistent>
      <div v-if="receipt" class="oc-receipt">
        <div class="oc-receipt-head" :data-outcome="receiptTone">
          <span class="oc-receipt-icon" aria-hidden="true">{{ receiptApproved ? '✓' : '!' }}</span>
          <div class="oc-receipt-head-text" role="status" aria-live="polite">
            <p class="oc-receipt-title">
              {{ receiptApproved ? 'Pagamento aprovado' : 'Pedido registrado — pagamento pendente' }}
            </p>
            <p class="oc-receipt-code ui-muted">
              Pedido <span class="ui-mono">{{ receipt.code }}</span>
            </p>
          </div>
          <UiStatusBadge :status="receipt.paymentStatus" size="lg" />
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
            <dd>{{ format.formatNumber(receipt.itemsCount) }}</dd>
          </div>
          <div class="oc-receipt-row">
            <dt>Total</dt>
            <dd>{{ money(receipt.total) }}</dd>
          </div>
          <div class="oc-receipt-row">
            <dt>Situação do pedido</dt>
            <dd><UiStatusBadge :status="receipt.status" size="sm" /></dd>
          </div>
          <div v-if="receipt.transactionId" class="oc-receipt-row">
            <dt>Transação</dt>
            <dd class="ui-mono">{{ receipt.transactionId }}</dd>
          </div>
          <div v-if="receipt.provider" class="oc-receipt-row">
            <dt>Gateway</dt>
            <dd>{{ receipt.provider }}</dd>
          </div>
        </dl>
      </div>
      <template #footer>
        <UiButton v-if="receipt && receipt.id" variant="ghost" :to="'/orders/' + receipt.id">Ver pedido</UiButton>
        <UiButton v-else variant="ghost" to="/orders">Ver pedidos</UiButton>
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
  useResource,
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
 * Endpoints REAIS (só via ../api.js):
 *   GET  /v1/products  → api.products.list   (catálogo)
 *   POST /v1/orders    → api.orders.create   (pedido de domínio)
 *   POST /v1/checkout  → api.store.checkout  (cobrança idempotente, Idempotency-Key no header)
 * ------------------------------------------------------------------ */

/* ---------------------------- ProductPicker --------------------------- */
const catalog = useResource(api.products, { pageSize: 200 });

function reloadCatalog() {
  return catalog.load();
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

// normaliza snake_case do Postgres → camelCase usado na tela (mantém o cru intacto).
function product(row) {
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
const products = computed(() => catalog.items.value.map(product));

const query = ref('');
const filteredProducts = computed(() => {
  const q = query.value.trim().toLowerCase();
  if (!q) return products.value;
  return products.value.filter((p) =>
    [p.name, p.sku, p.category].some((f) => String(f || '').toLowerCase().includes(q)),
  );
});

function isOutOfStock(p) {
  return p.active === false || Number(p.stockQty) <= 0;
}
function stockTone(p) {
  if (isOutOfStock(p)) return 'esgotado';
  if (Number(p.stockQty) <= 5) return 'baixo';
  return 'ativo';
}
function stockLabel(p) {
  if (p.active === false) return 'Inativo';
  if (Number(p.stockQty) <= 0) return 'Sem estoque';
  if (Number(p.stockQty) <= 5) return 'Baixo · ' + p.stockQty + ' un.';
  return p.stockQty + ' em estoque';
}

/* ------------------------------ CartEditor ----------------------------- */
const cart = reactive([]);

const cartEntry = (p) => cart.find((i) => i.id === p.id);
const inCartQty = (p) => (cartEntry(p) ? cartEntry(p).qty : 0);

function stockOf(id) {
  const src = products.value.find((p) => p.id === id);
  return src ? Number(src.stockQty) : Infinity;
}
function atStockLimit(item) {
  return item.qty >= stockOf(item.id);
}
function atStockLimitFor(p) {
  const e = cartEntry(p);
  return e ? e.qty >= stockOf(p.id) : false;
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
    cart.push({ id: p.id, sku: p.sku, name: p.name, price: p.price, qty: 1 });
  }
  toast.success(p.name + ' adicionado.', { timeout: 1800 });
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
    ? format.formatNumber(itemsCount.value) + ' item(ns) · ' + money(cartTotal.value)
    : 'Nenhum item adicionado.',
);

/* ------------------------------ CustomerForm --------------------------- */
const methods = [
  { value: 'credit_card', label: 'Cartão de crédito (tokenizado)' },
  { value: 'pix', label: 'PIX' },
  { value: 'boleto', label: 'Boleto bancário' },
];
const TOKEN_RE = /^tok_[\w-]{2,}$/i;
const customer = useForm({
  initial: { customerName: '', customerEmail: '', method: 'credit_card', paymentMethodToken: '' },
  rules: {
    customerName: [validators.required('Informe o nome do cliente'), validators.minLen(2)],
    customerEmail: [validators.email()],
    method: [validators.required('Escolha uma forma de pagamento')],
    paymentMethodToken: [
      validators.required('Informe o token do método'),
      validators.pattern(TOKEN_RE, 'Token inválido — use o formato tok_…'),
    ],
  },
});
const customerError = (key) => (customer.touched[key] ? customer.errors[key] || '' : '');

function onMethodChange(value) {
  customer.setField('method', value);
  // sugestão de token só quando o operador ainda não digitou um próprio.
  if (!customer.values.paymentMethodToken || /^tok_(card|pix|boleto)_$/i.test(customer.values.paymentMethodToken)) {
    const prefix = { credit_card: 'tok_card_', pix: 'tok_pix_', boleto: 'tok_boleto_' }[value] || 'tok_';
    customer.setField('paymentMethodToken', prefix);
  }
}

/* ----------------------------- Idempotência --------------------------- */
// Código de pedido estável durante a montagem (recriado só ao iniciar nova venda) → chave constante.
const orderCode = ref(newOrderCode());
function newOrderCode() {
  return 'PED-' + Date.now().toString(36).toUpperCase().slice(-6);
}
const idempotencyKey = computed(() => 'order:' + orderCode.value);

/* --------------------------- CheckoutButton --------------------------- */
const processing = ref(false);
const receiptOpen = ref(false);
const receipt = ref(null);

const PAID_RE = /approv|aprovad|paid|success|ok|authorized|autorizad|pago/i;

async function submitOrder() {
  if (!cart.length) {
    toast.warning('Adicione ao menos um produto ao carrinho.');
    return;
  }
  if (!customer.validate()) {
    toast.error('Revise os dados do cliente e do pagamento.');
    return;
  }
  if (processing.value) return;

  const amount = cartTotal.value;
  const ok = await confirm({
    title: 'Finalizar pedido',
    message:
      'Cobrar ' + money(amount) + ' de ' + customer.values.customerName +
      ' (' + format.formatNumber(itemsCount.value) + ' item(ns)) pelo método tokenizado selecionado?',
    confirmLabel: 'Pagar agora',
    cancelLabel: 'Revisar',
  });
  if (!ok) return;

  processing.value = true;
  const code = orderCode.value;
  try {
    // 1) cria o pedido de domínio (POST /v1/orders)
    const created = await api.orders.create({
      code,
      customerName: customer.values.customerName,
      customerEmail: customer.values.customerEmail || null,
      total: amount,
      itemsCount: itemsCount.value,
      status: 'pendente',
      paymentStatus: 'aguardando',
    });

    // 2) cobrança idempotente (POST /v1/checkout) — Idempotency-Key estável por pedido.
    let paid = null;
    let paymentStatus = 'aguardando';
    let orderStatus = 'pendente';
    try {
      paid = await api.store.checkout(code, amount, customer.values.paymentMethodToken, idempotencyKey.value);
      const approved = paid && PAID_RE.test(String(paid.status || ''));
      paymentStatus = approved ? 'aprovado' : 'recusado';
      orderStatus = approved ? 'pago' : 'falha_pagamento';
      if (approved) {
        toast.success('Pagamento aprovado — pedido ' + code + '.', {
          detail: paid.transactionId ? 'Transação ' + paid.transactionId : '',
        });
      } else {
        toast.warning('Pagamento não aprovado. Pedido ' + code + ' registrado como pendente.');
      }
    } catch (payErr) {
      paymentStatus = 'recusado';
      orderStatus = 'falha_pagamento';
      toast.error('Falha no pagamento', {
        detail: (payErr && payErr.message) || 'Erro desconhecido. O pedido foi registrado.',
        code: payErr && payErr.status,
      });
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
      transactionId: (paid && paid.transactionId) || '',
      provider: (paid && paid.provider) || '',
    };
    receiptOpen.value = true;
  } catch (e) {
    toast.error('Não foi possível criar o pedido', {
      detail: (e && e.message) || 'Erro desconhecido.',
      code: e && e.status,
    });
  } finally {
    processing.value = false;
  }
}

const receiptApproved = computed(() => receipt.value && receipt.value.paymentStatus === 'aprovado');
const receiptTone = computed(() => (receiptApproved.value ? 'success' : 'warning'));

function startNewOrder() {
  receiptOpen.value = false;
  receipt.value = null;
  cart.splice(0, cart.length);
  customer.reset();
  query.value = '';
  orderCode.value = newOrderCode();
  toast.info('Pronto para um novo pedido.');
}

/* ------------------------------ Stepper UI ----------------------------- */
function stepDone(n) {
  if (n === 1) return cart.length > 0;
  if (n === 2) return cart.length > 0;
  if (n === 3) return !!receipt.value;
  return false;
}
function stepState(n) {
  if (stepDone(n)) return 'done';
  // ativo = o primeiro passo ainda não concluído.
  if (n === 1 && !cart.length) return 'active';
  if (n === 2 && cart.length && !receipt.value) return 'active';
  if (n === 3 && cart.length && !receipt.value) return 'active';
  return 'idle';
}

/* ------------------------------- Helpers ------------------------------- */
function money(value) {
  return format.formatCurrency(value);
}

catalog.load();
</script>

<style scoped>
/* ----------------------------- Stepper ----------------------------- */
.oc-steps {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-wrap: wrap;
  gap: var(--ui-space-3);
}
.oc-step {
  display: inline-flex;
  align-items: center;
  gap: var(--ui-space-2);
  padding: var(--ui-space-2) var(--ui-space-3);
  border: 1px solid rgb(var(--ui-border));
  border-radius: var(--ui-radius-pill);
  background: rgb(var(--ui-surface));
  font-size: var(--ui-text-sm);
  color: rgb(var(--ui-muted));
}
.oc-step[data-state='active'] {
  border-color: rgb(var(--ui-accent));
  color: rgb(var(--ui-fg));
}
.oc-step[data-state='done'] {
  border-color: rgb(var(--ui-ok) / 0.5);
  color: rgb(var(--ui-fg));
}
.oc-step-dot {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  font-size: var(--ui-text-xs);
  font-weight: 700;
  background: rgb(var(--ui-muted) / 0.18);
  color: rgb(var(--ui-muted));
}
.oc-step[data-state='active'] .oc-step-dot {
  background: rgb(var(--ui-accent));
  color: rgb(var(--ui-accent-fg));
}
.oc-step[data-state='done'] .oc-step-dot {
  background: rgb(var(--ui-ok) / 0.18);
  color: rgb(var(--ui-ok));
}
.oc-step-label {
  font-weight: 600;
}

/* ------------------------------ Layout ----------------------------- */
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

/* ------------------------------ Busca ------------------------------ */
.oc-search {
  margin-bottom: var(--ui-space-4);
}

/* --------------------------- ProductPicker ------------------------- */
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
.oc-product[data-incart='true'] {
  border-color: rgb(var(--ui-accent) / 0.5);
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
  align-items: center;
  gap: var(--ui-space-2);
  flex-wrap: wrap;
  margin-top: 2px;
}
.oc-incart {
  font-size: var(--ui-text-xs);
  font-weight: 600;
  color: rgb(var(--ui-accent-strong));
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
  font-variant-numeric: tabular-nums;
  color: rgb(var(--ui-fg));
}

/* ------------------------------ CartEditor ------------------------- */
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

/* ------------------------------ Totais ----------------------------- */
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

/* --------------------------- CustomerForm -------------------------- */
.oc-form {
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-4);
}

/* --------------------------- Idempotência -------------------------- */
.oc-idem {
  border: 1px dashed rgb(var(--ui-border-strong));
  border-radius: var(--ui-radius-md);
  padding: var(--ui-space-4);
  background: rgb(var(--ui-surface-2));
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-2);
}
.oc-idem-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ui-space-3);
  flex-wrap: wrap;
}
.oc-idem-label {
  font-size: var(--ui-text-xs);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: rgb(var(--ui-muted));
  font-weight: 700;
}
.oc-idem-key {
  display: block;
  font-size: var(--ui-text-sm);
  color: rgb(var(--ui-fg));
  word-break: break-all;
  background: rgb(var(--ui-bg));
  border: 1px solid rgb(var(--ui-border));
  border-radius: var(--ui-radius-sm);
  padding: var(--ui-space-2) var(--ui-space-3);
}
.oc-idem-note {
  margin: 0;
  font-size: var(--ui-text-xs);
}

.oc-charge {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--ui-space-4);
}
.oc-charge-value {
  font-family: var(--ui-font-display);
  font-size: var(--ui-text-xl);
}

/* ------------------------------ Ações ------------------------------ */
.oc-actions {
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-2);
}
.oc-fineprint {
  margin: 0;
  text-align: center;
  font-size: var(--ui-text-xs);
  color: rgb(var(--ui-muted));
}

/* ------------------------------ Recibo ----------------------------- */
.oc-receipt {
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-4);
}
.oc-receipt-head {
  display: flex;
  align-items: center;
  gap: var(--ui-space-3);
  flex-wrap: wrap;
  padding-bottom: var(--ui-space-3);
  border-bottom: 1px solid rgb(var(--ui-border));
}
.oc-receipt-icon {
  flex-shrink: 0;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  font-size: var(--ui-text-lg);
  background: rgb(var(--ui-muted) / 0.16);
  color: rgb(var(--ui-muted));
}
.oc-receipt-head[data-outcome='success'] .oc-receipt-icon {
  background: rgb(var(--ui-ok) / 0.16);
  color: rgb(var(--ui-ok));
}
.oc-receipt-head[data-outcome='warning'] .oc-receipt-icon {
  background: rgb(var(--ui-warn) / 0.18);
  color: rgb(var(--ui-warn));
}
.oc-receipt-head-text {
  min-width: 0;
  flex: 1 1 auto;
}
.oc-receipt-title {
  margin: 0;
  font-family: var(--ui-font-display);
  font-weight: 700;
  font-size: var(--ui-text-lg);
}
.oc-receipt-code {
  margin: 2px 0 0;
  font-size: var(--ui-text-sm);
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

/* --------------------------- Utilitários --------------------------- */
.oc-dot {
  color: rgb(var(--ui-border-strong));
}

/* ----------------------------- Responsivo -------------------------- */
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
  .oc-cart-item > .ui-btn {
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
