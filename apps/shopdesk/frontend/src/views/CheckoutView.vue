<!-- CheckoutView — REF/REQ-SHOPDESK-0003: finalização de carrinho.
     Revisa o carrinho (CartSummary), aplica método de pagamento TOKENIZADO (PaymentMethodForm),
     confirma com Idempotency-Key estável (IdempotentSubmit) e mostra o resultado (ResultBanner).
     CSP-safe: só classes/atributos + tokens --ui-*; nada de estilo inline nem HTML cru. Só endpoints reais via ../api.js. -->
<template>
  <UiPageLayout
    eyebrow="Checkout"
    title="Finalizar compra"
    subtitle="Revise o carrinho, escolha um método de pagamento tokenizado e confirme com segurança."
    width="narrow"
    :loading="cart.loading.value"
    loading-message="Carregando carrinho…"
    :error="loadError"
    @retry="loadCart"
  >
    <template #actions>
      <UiButton variant="ghost" to="/loja">Voltar à loja</UiButton>
      <UiButton
        v-if="auditAvailable"
        variant="subtle"
        @click="openAudit"
      >Trilha de auditoria</UiButton>
    </template>

    <!-- ESTADO: carrinho inexistente -->
    <UiEmptyState
      v-if="notFound"
      icon="🛒"
      title="Carrinho não encontrado"
      :description="'Não localizamos o carrinho #' + cartId + '. Ele pode ter expirado ou já ter sido convertido.'"
    >
      <template #action>
        <UiButton to="/loja">Ir para a loja</UiButton>
      </template>
    </UiEmptyState>

    <!-- ESTADO: já convertido (não há o que finalizar) -->
    <UiCard v-else-if="alreadyConverted" title="Pedido já finalizado">
      <div class="ck-converted">
        <UiStatusBadge :status="cartData.status" size="lg" />
        <p class="ui-muted">Este carrinho já foi convertido em pedido. Não há cobrança pendente.</p>
        <UiButton to="/loja" variant="ghost">Voltar à loja</UiButton>
      </div>
    </UiCard>

    <!-- ESTADO NORMAL -->
    <template v-else-if="cartData">
      <!-- ResultBanner: resultado do checkout (aprovado/recusado) -->
      <UiCard v-if="result" class="ck-banner" :data-outcome="resultTone">
        <div class="ck-banner-row">
          <span class="ck-banner-icon" aria-hidden="true">{{ resultApproved ? '✓' : '✕' }}</span>
          <div
            class="ck-banner-text"
            role="status"
            :aria-live="resultApproved ? 'polite' : 'assertive'"
          >
            <p class="ck-banner-title">{{ resultApproved ? 'Pagamento aprovado' : 'Pagamento recusado' }}</p>
            <p class="ui-muted ck-banner-sub">
              {{ resultApproved
                ? 'Pedido criado com sucesso. Guarde o código da transação.'
                : 'A operadora recusou a cobrança. Tente outro método de pagamento.' }}
            </p>
            <dl class="ck-result-grid">
              <div class="ck-kv">
                <dt>Pedido</dt>
                <dd class="ui-mono">{{ result.orderId }}</dd>
              </div>
              <div class="ck-kv">
                <dt>Transação</dt>
                <dd class="ui-mono">{{ result.transactionId || '—' }}</dd>
              </div>
              <div class="ck-kv">
                <dt>Situação</dt>
                <dd><UiStatusBadge :status="result.status" /></dd>
              </div>
              <div class="ck-kv">
                <dt>Gateway</dt>
                <dd>{{ result.provider || '—' }}</dd>
              </div>
            </dl>
          </div>
        </div>
        <template #footer>
          <div class="ck-banner-actions">
            <UiButton v-if="resultApproved" to="/loja">Concluir</UiButton>
            <UiButton v-else variant="primary" @click="result = null">Tentar novamente</UiButton>
            <UiButton v-if="auditAvailable" variant="ghost" @click="openAudit">Ver auditoria</UiButton>
          </div>
        </template>
      </UiCard>

      <!-- CartSummary: revisão do carrinho -->
      <UiCard title="Resumo do carrinho" :subtitle="'Carrinho #' + cartId">
        <template #actions>
          <UiStatusBadge :status="cartData.status" />
        </template>
        <dl class="ck-summary">
          <div class="ck-kv">
            <dt>Cliente</dt>
            <dd>{{ cartData.customer_name || 'Visitante' }}</dd>
          </div>
          <div class="ck-kv">
            <dt>Itens</dt>
            <dd>{{ format.formatNumber(itemsCount) }}</dd>
          </div>
          <div class="ck-kv">
            <dt>Atualizado em</dt>
            <dd>{{ format.formatDateTime(cartData.updated_at) }}</dd>
          </div>
        </dl>
        <template #footer>
          <div class="ck-total-row">
            <span class="ck-total-label">Subtotal</span>
            <span class="ck-total-value">{{ format.formatCurrency(subtotal) }}</span>
          </div>
        </template>
      </UiCard>

      <!-- carrinho vazio (sem valor a cobrar) -->
      <UiEmptyState
        v-if="!hasChargeableAmount"
        compact
        icon="∅"
        title="Carrinho sem valor a cobrar"
        description="Adicione itens ao carrinho antes de finalizar a compra."
      >
        <template #action>
          <UiButton to="/loja" variant="ghost">Voltar à loja</UiButton>
        </template>
      </UiEmptyState>

      <!-- PaymentMethodForm + IdempotentSubmit -->
      <UiCard v-else title="Método de pagamento" subtitle="Apenas dados tokenizados — nunca pedimos o número do cartão.">
        <form class="ck-form" novalidate @submit.prevent="submitCheckout">
          <UiFormSection columns="2">
            <UiFormField label="Forma de pagamento" required :error="touchedError('method')">
              <template #default="{ id, describedBy }">
                <select
                  :id="id"
                  :aria-describedby="describedBy"
                  :value="form.values.method"
                  @change="onMethodChange"
                  @blur="form.validateField('method')"
                >
                  <option value="" disabled>Selecione…</option>
                  <option v-for="m in methods" :key="m.value" :value="m.value">{{ m.label }}</option>
                </select>
              </template>
            </UiFormField>

            <UiFormField
              label="Token do método"
              required
              hint="Identificador tokenizado emitido pelo cofre de pagamento (ex.: tok_visa_ok)."
              :error="touchedError('paymentMethodToken')"
            >
              <template #default="{ id, describedBy }">
                <input
                  :id="id"
                  :aria-describedby="describedBy"
                  type="text"
                  inputmode="latin"
                  autocomplete="off"
                  spellcheck="false"
                  placeholder="tok_…"
                  :value="form.values.paymentMethodToken"
                  @input="form.setField('paymentMethodToken', $event.target.value)"
                  @blur="form.validateField('paymentMethodToken')"
                />
              </template>
            </UiFormField>
          </UiFormSection>

          <!-- IdempotentSubmit: chave estável derivada do carrinho + anti-duplo-submit -->
          <div class="ck-idem">
            <div class="ck-idem-head">
              <span class="ck-idem-label">Idempotency-Key</span>
              <UiStatusBadge tone="success" label="Cobrança única garantida" :with-dot="true" status="ok" />
            </div>
            <code class="ck-idem-key ui-mono">{{ idempotencyKey }}</code>
            <p class="ui-muted ck-idem-note">
              Reenviar este checkout com a mesma chave não gera nova cobrança — a transação é reaproveitada.
            </p>
          </div>

          <div class="ck-charge">
            <span class="ui-muted">Total a cobrar</span>
            <strong class="ck-charge-value">{{ format.formatCurrency(subtotal) }}</strong>
          </div>

          <div class="ck-submit">
            <UiButton
              type="submit"
              size="lg"
              block
              :loading="form.submitting.value"
            >
              {{ form.submitting.value ? 'Processando pagamento…' : 'Confirmar e pagar ' + format.formatCurrency(subtotal) }}
            </UiButton>
          </div>
        </form>
      </UiCard>
    </template>

    <!-- Modal: trilha de auditoria do gateway -->
    <UiModal v-model:open="auditOpen" title="Trilha de auditoria do pagamento" width="lg">
      <UiLoadingState v-if="auditLoading" variant="skeleton" :skeleton-lines="4" />
      <UiErrorState
        v-else-if="auditError"
        :message="auditError"
        @retry="fetchAudit"
      />
      <UiEmptyState
        v-else-if="!auditRows.length"
        compact
        icon="🧾"
        title="Sem eventos de auditoria"
        description="Nenhuma cobrança foi registrada nesta sessão do gateway ainda."
      />
      <UiDataTable
        v-else
        :columns="auditColumns"
        :rows="auditRows"
        row-key="_k"
        density="compact"
      >
        <template #cell-at="{ value }">{{ format.formatDateTime(value) }}</template>
        <template #cell-status="{ value }"><UiStatusBadge :status="value" size="sm" /></template>
      </UiDataTable>
      <template #footer>
        <UiButton variant="ghost" @click="auditOpen = false">Fechar</UiButton>
      </template>
    </UiModal>
  </UiPageLayout>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import {
  UiPageLayout, UiCard, UiButton, UiFormField, UiFormSection, UiStatusBadge,
  UiEmptyState, UiLoadingState, UiErrorState, UiDataTable, UiModal,
  useResource, useForm, useToast, useConfirm, validators, format,
} from '../ui/index.js';
import * as api from '../api.js';

const route = useRoute();
const toast = useToast();
const confirm = useConfirm();

// id do carrinho da rota /checkout/:cartId (aceita variações de nome do param).
const cartId = computed(() => String(route.params.cartId ?? route.params.id ?? '').trim());

// ---- dados do carrinho (endpoint real GET /v1/carts/:id via api.carts) -----------------
const cart = useResource(api.carts);
const cartData = computed(() => cart.item.value);
const notFound = ref(false);

const loadError = computed(() => {
  if (notFound.value) return null; // tratado como empty-state, não como erro
  const e = cart.error.value;
  return e ? (e.message || 'Falha ao carregar o carrinho.') : null;
});

async function loadCart() {
  notFound.value = false;
  if (!cartId.value) { notFound.value = true; return; }
  try {
    await cart.get(cartId.value);
    if (!cart.item.value) notFound.value = true;
  } catch (e) {
    if (e && e.status === 404) { notFound.value = true; cart.error.value = null; }
  }
}

// ---- derivados do carrinho -------------------------------------------------------------
const itemsCount = computed(() => Number(cartData.value?.items_count ?? 0));
const subtotal = computed(() => Number(cartData.value?.subtotal ?? 0));
const hasChargeableAmount = computed(() => subtotal.value > 0);
const alreadyConverted = computed(() => String(cartData.value?.status || '').toLowerCase() === 'convertido');

// código de pedido determinístico derivado do carrinho (estável → idempotência).
const orderId = computed(() => 'CART-' + cartId.value);
// Idempotency-Key exibida ao operador (mesma semântica do backend: cobrança única por pedido).
const idempotencyKey = computed(() => 'order:' + orderId.value);

// ---- formulário de pagamento (tokenizado) ---------------------------------------------
const methods = [
  { value: 'credit_card', label: 'Cartão de crédito (tokenizado)' },
  { value: 'pix', label: 'PIX' },
  { value: 'boleto', label: 'Boleto bancário' },
];
const form = useForm({
  initial: { method: '', paymentMethodToken: '' },
  rules: {
    method: [validators.required('Escolha uma forma de pagamento')],
    paymentMethodToken: [
      validators.required('Informe o token do método'),
      validators.pattern(/^tok_[\w-]{2,}$/i, 'Token inválido — use o formato tok_…'),
    ],
  },
});
const touchedError = (key) => (form.touched[key] ? form.errors[key] || '' : '');
function onMethodChange(ev) {
  form.setField('method', ev.target.value);
  // sugestão de token só quando o operador ainda não digitou um (não sobrescreve a entrada dele).
  if (!form.values.paymentMethodToken) {
    const suggest = { credit_card: 'tok_card_', pix: 'tok_pix_', boleto: 'tok_boleto_' }[ev.target.value];
    if (suggest) form.setField('paymentMethodToken', suggest + cartId.value);
  }
}

// ---- resultado do checkout ------------------------------------------------------------
const result = ref(null);
const resultApproved = computed(() => {
  const s = String(result.value?.status || '').toLowerCase();
  return s === 'approved' || s === 'aprovado' || s === 'authorized' || s === 'autorizado' || s === 'paid' || s === 'pago';
});
const resultTone = computed(() => (resultApproved.value ? 'success' : 'error'));

async function submitCheckout() {
  if (!hasChargeableAmount.value) return;
  const ok = await confirm({
    title: 'Confirmar pagamento',
    message: 'Cobrar ' + format.formatCurrency(subtotal.value) + ' do método tokenizado selecionado para o carrinho #' + cartId.value + '?',
    confirmLabel: 'Pagar agora',
  });
  if (!ok) return;

  await form.handleSubmit(async (values) => {
    try {
      // endpoint real POST /v1/checkout — token tokenizado no body + Idempotency-Key no header
      // (mesma chave → mesma transação; o gateway reaproveita a cobrança).
      const res = await api.store.checkout(orderId.value, subtotal.value, values.paymentMethodToken, idempotencyKey.value);
      result.value = res;
      if (resultApproved.value) {
        toast.success('Pagamento aprovado', { detail: 'Transação ' + (res.transactionId || ''), code: res.status });
      } else {
        toast.warning('Pagamento recusado', { detail: 'A operadora não autorizou a cobrança.' });
      }
    } catch (e) {
      result.value = null;
      toast.error('Falha no checkout', { detail: e.message || 'Não foi possível concluir o pagamento.', code: e.status });
    }
  });
}

// ---- trilha de auditoria (endpoint real GET /v1/checkout/audit, quando exposto) --------
const auditAvailable = computed(() => typeof api.store?.checkoutAudit === 'function');
const auditOpen = ref(false);
const auditLoading = ref(false);
const auditError = ref('');
const auditRows = ref([]);
const auditColumns = [
  { key: 'at', label: 'Quando', sortable: true },
  { key: 'event', label: 'Evento' },
  { key: 'status', label: 'Situação' },
  { key: 'amount', label: 'Valor', align: 'right', format: 'currency' },
];

async function fetchAudit() {
  if (!auditAvailable.value) return;
  auditLoading.value = true;
  auditError.value = '';
  try {
    const rows = await api.store.checkoutAudit();
    const list = Array.isArray(rows) ? rows : rows?.data || [];
    auditRows.value = list.map((r, i) => ({ _k: i, ...r }));
  } catch (e) {
    auditError.value = e.message || 'Não foi possível carregar a auditoria.';
  } finally {
    auditLoading.value = false;
  }
}
function openAudit() {
  auditOpen.value = true;
  fetchAudit();
}

onMounted(loadCart);
</script>

<style scoped>
/* CartSummary / detalhes em dt-dd */
.ck-summary { margin: 0; display: grid; grid-template-columns: repeat(2, 1fr); gap: var(--ui-space-4) var(--ui-space-5); }
.ck-kv { margin: 0; display: flex; flex-direction: column; gap: var(--ui-space-1); min-width: 0; }
.ck-kv dt { margin: 0; font-size: var(--ui-text-xs); text-transform: uppercase; letter-spacing: .06em; color: rgb(var(--ui-muted)); }
.ck-kv dd { margin: 0; font-weight: 600; word-break: break-word; }

.ck-total-row { display: flex; align-items: baseline; justify-content: space-between; gap: var(--ui-space-4); }
.ck-total-label { color: rgb(var(--ui-muted)); font-size: var(--ui-text-sm); }
.ck-total-value { font-family: var(--ui-font-display); font-size: var(--ui-text-xl); font-weight: 700; }

/* PaymentMethodForm */
.ck-form { display: flex; flex-direction: column; gap: var(--ui-space-4); }

/* IdempotentSubmit */
.ck-idem { border: 1px dashed rgb(var(--ui-border-strong)); border-radius: var(--ui-radius-md); padding: var(--ui-space-4); background: rgb(var(--ui-surface-2)); display: flex; flex-direction: column; gap: var(--ui-space-2); }
.ck-idem-head { display: flex; align-items: center; justify-content: space-between; gap: var(--ui-space-3); flex-wrap: wrap; }
.ck-idem-label { font-size: var(--ui-text-xs); text-transform: uppercase; letter-spacing: .06em; color: rgb(var(--ui-muted)); font-weight: 700; }
.ck-idem-key { display: block; font-size: var(--ui-text-sm); color: rgb(var(--ui-fg)); word-break: break-all; background: rgb(var(--ui-bg)); border: 1px solid rgb(var(--ui-border)); border-radius: var(--ui-radius-sm); padding: var(--ui-space-2) var(--ui-space-3); }
.ck-idem-note { margin: 0; font-size: var(--ui-text-xs); }

.ck-charge { display: flex; align-items: baseline; justify-content: space-between; gap: var(--ui-space-4); padding-top: var(--ui-space-1); }
.ck-charge-value { font-family: var(--ui-font-display); font-size: var(--ui-text-xl); }
.ck-submit { margin-top: var(--ui-space-1); }

/* ResultBanner */
.ck-banner { border-left: 3px solid rgb(var(--ui-border-strong)); }
.ck-banner[data-outcome="success"] { border-left-color: rgb(var(--ui-ok)); }
.ck-banner[data-outcome="error"] { border-left-color: rgb(var(--ui-danger)); }
.ck-banner-row { display: flex; align-items: flex-start; gap: var(--ui-space-4); }
.ck-banner-icon { flex-shrink: 0; width: 36px; height: 36px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; font-weight: 700; font-size: var(--ui-text-lg); }
.ck-banner[data-outcome="success"] .ck-banner-icon { background: rgb(var(--ui-ok) / 0.16); color: rgb(var(--ui-ok)); }
.ck-banner[data-outcome="error"] .ck-banner-icon { background: rgb(var(--ui-danger) / 0.16); color: rgb(var(--ui-danger)); }
.ck-banner-text { min-width: 0; flex: 1 1 auto; }
.ck-banner-title { margin: 0; font-family: var(--ui-font-display); font-weight: 700; font-size: var(--ui-text-lg); }
.ck-banner-sub { margin: var(--ui-space-1) 0 var(--ui-space-3); font-size: var(--ui-text-sm); }
.ck-result-grid { margin: 0; display: grid; grid-template-columns: repeat(2, 1fr); gap: var(--ui-space-3) var(--ui-space-5); }
.ck-banner-actions { display: flex; gap: var(--ui-space-2); flex-wrap: wrap; }

/* já convertido */
.ck-converted { display: flex; flex-direction: column; align-items: flex-start; gap: var(--ui-space-3); }

@media (max-width: 640px) {
  .ck-summary, .ck-result-grid { grid-template-columns: 1fr; }
}
</style>
