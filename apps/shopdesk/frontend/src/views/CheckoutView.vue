<!--
  CheckoutView — Finalização de carrinho (REF/REQ-SHOPDESK-0003).
  Fluxo em 3 passos visíveis: (1) revisar carrinho [CartSummary], (2) método de pagamento
  TOKENIZADO [PaymentMethodForm], (3) confirmar com Idempotency-Key estável [IdempotentSubmit].
  O resultado (aprovado/recusado) é mostrado num banner persistente [ResultBanner] e cria o pedido.
  100% sobre o kit ui-vue · só tokens --ui-* · CSP-safe (sem style inline / :style / v-html) ·
  todos os estados (loading/empty/error/normal/processando) · a11y · responsivo.
  Só endpoints reais via ../api.js: GET /v1/carts/:id, POST /v1/checkout, GET /v1/checkout/audit.
  Ações destrutivas/irreversíveis (cobrança) via useConfirm; toast em sucesso e erro.
-->
<template>
  <UiPageLayout
    eyebrow="Checkout"
    title="Finalizar compra"
    subtitle="Revise o carrinho, escolha um método de pagamento tokenizado e confirme com segurança."
    width="default"
    :loading="loading"
    loading-message="Carregando carrinho…"
    :error="loadError"
    :retryable="true"
    @retry="loadCart"
  >
    <template #actions>
      <UiButton variant="ghost" to="/carts">Carrinhos</UiButton>
      <UiButton variant="ghost" :to="cartDetailRoute">Voltar ao carrinho</UiButton>
      <UiButton
        v-if="auditAvailable"
        variant="subtle"
        @click="openAudit"
      >Trilha de auditoria</UiButton>
    </template>

    <!-- ESTADO: carrinho inexistente / não encontrado -->
    <UiEmptyState
      v-if="notFound"
      icon="🛒"
      title="Carrinho não encontrado"
      :description="emptyDescription"
    >
      <template #action>
        <UiButton to="/carts">Ver carrinhos</UiButton>
      </template>
    </UiEmptyState>

    <!-- ESTADO: já convertido (não há cobrança pendente) -->
    <UiCard v-else-if="alreadyConverted" title="Pedido já finalizado">
      <div class="ck-converted">
        <span class="ck-converted-icon" aria-hidden="true">✓</span>
        <div class="ck-converted-text">
          <p class="ck-converted-title">Este carrinho já foi convertido em pedido</p>
          <p class="ui-muted">Não há cobrança pendente para o carrinho {{ cartLabel }}.</p>
          <UiStatusBadge :status="cartData.status" :label="statusLabel" size="lg" />
        </div>
      </div>
      <template #footer>
        <div class="ck-converted-actions">
          <UiButton :to="cartDetailRoute" variant="subtle">Ver carrinho</UiButton>
          <UiButton to="/orders" variant="primary">Ir para pedidos</UiButton>
        </div>
      </template>
    </UiCard>

    <!-- ESTADO NORMAL -->
    <template v-else-if="cartData">
      <!-- =============== ResultBanner =============== -->
      <UiCard v-if="result" class="ck-banner" :data-outcome="resultTone">
        <div class="ck-banner-row">
          <span class="ck-banner-icon" aria-hidden="true">{{ resultApproved ? '✓' : '✕' }}</span>
          <div
            class="ck-banner-text"
            role="status"
            :aria-live="resultApproved ? 'polite' : 'assertive'"
          >
            <p class="ck-banner-title">{{ resultApproved ? 'Pagamento aprovado' : 'Pagamento recusado' }}</p>
            <p class="ui-muted ck-banner-sub">{{ resultMessage }}</p>
            <dl class="ck-result-grid">
              <div class="ck-kv">
                <dt>Pedido</dt>
                <dd class="ui-mono">{{ result.orderId || orderId }}</dd>
              </div>
              <div class="ck-kv">
                <dt>Transação</dt>
                <dd class="ui-mono">{{ result.transactionId || '—' }}</dd>
              </div>
              <div class="ck-kv">
                <dt>Situação</dt>
                <dd><UiStatusBadge :status="result.status" :label="resultStatusLabel" /></dd>
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
            <UiButton v-if="resultApproved" to="/orders" variant="primary">Ver pedidos</UiButton>
            <UiButton v-if="resultApproved" :to="cartDetailRoute" variant="ghost">Ver carrinho</UiButton>
            <UiButton v-else variant="primary" @click="retryPayment">Tentar novamente</UiButton>
            <UiButton v-if="auditAvailable" variant="ghost" @click="openAudit">Ver auditoria</UiButton>
          </div>
        </template>
      </UiCard>

      <!-- indicador de passos (puro CSS/atributos) -->
      <ol class="ck-steps" aria-label="Etapas do checkout">
        <li
          v-for="(s, i) in steps"
          :key="s.key"
          class="ck-step"
          :data-state="stepState(i)"
          :aria-current="currentStep === i ? 'step' : null"
        >
          <span class="ck-step-mark" aria-hidden="true">{{ stepState(i) === 'done' ? '✓' : i + 1 }}</span>
          <span class="ck-step-label">{{ s.label }}</span>
        </li>
      </ol>

      <div class="ck-grid">
        <!-- COLUNA PRINCIPAL: pagamento -->
        <div class="ck-main">
          <!-- carrinho sem valor cobrável -->
          <UiCard v-if="!hasChargeableAmount" title="Método de pagamento">
            <UiEmptyState
              compact
              icon="∅"
              title="Carrinho sem valor a cobrar"
              description="Adicione itens ao carrinho antes de finalizar a compra. O total precisa ser maior que zero."
            >
              <template #action>
                <UiButton :to="cartDetailRoute" variant="primary">Editar carrinho</UiButton>
              </template>
            </UiEmptyState>
          </UiCard>

          <!-- =============== PaymentMethodForm =============== -->
          <UiCard
            v-else
            title="Método de pagamento"
            subtitle="Apenas dados tokenizados — nunca pedimos o número do cartão."
          >
            <template #actions>
              <span class="ck-secure" aria-label="Pagamento seguro">
                <span class="ck-secure-icon" aria-hidden="true">🔒</span>
                Tokenizado
              </span>
            </template>

            <form class="ck-form" novalidate @submit.prevent="submitCheckout">
              <UiFormSection title="Forma de pagamento" :columns="2">
                <UiFormField label="Forma de pagamento" required :error="fieldError('method')">
                  <template #default="{ id, describedBy }">
                    <select
                      :id="id"
                      :aria-describedby="describedBy"
                      :aria-invalid="!!fieldError('method') || null"
                      :value="form.values.method"
                      :disabled="form.submitting.value"
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
                  :error="fieldError('paymentMethodToken')"
                >
                  <template #default="{ id, describedBy }">
                    <input
                      :id="id"
                      :aria-describedby="describedBy"
                      :aria-invalid="!!fieldError('paymentMethodToken') || null"
                      type="text"
                      inputmode="latin"
                      autocomplete="off"
                      spellcheck="false"
                      placeholder="tok_…"
                      :value="form.values.paymentMethodToken"
                      :disabled="form.submitting.value"
                      @input="form.setField('paymentMethodToken', $event.target.value)"
                      @blur="form.validateField('paymentMethodToken')"
                    />
                  </template>
                </UiFormField>
              </UiFormSection>

              <!-- atalhos de token de teste do cofre (apenas referências tokenizadas) -->
              <div class="ck-tokens" role="group" aria-label="Tokens de teste do cofre">
                <span class="ck-tokens-label">Tokens de teste:</span>
                <button
                  v-for="t in tokenSamples"
                  :key="t.value"
                  type="button"
                  class="ck-token-chip"
                  :data-tone="t.tone"
                  :disabled="form.submitting.value"
                  @click="applyToken(t.value)"
                >{{ t.label }}</button>
              </div>

              <!-- =============== IdempotentSubmit =============== -->
              <div class="ck-idem">
                <div class="ck-idem-head">
                  <span class="ck-idem-label">Idempotency-Key</span>
                  <UiStatusBadge tone="success" label="Cobrança única garantida" :with-dot="true" status="ok" />
                </div>
                <div class="ck-idem-key-row">
                  <code class="ck-idem-key ui-mono">{{ idempotencyKey }}</code>
                  <button
                    type="button"
                    class="ck-copy"
                    :aria-label="copied ? 'Chave copiada' : 'Copiar Idempotency-Key'"
                    :disabled="form.submitting.value"
                    @click="copyKey"
                  >{{ copied ? 'Copiado ✓' : 'Copiar' }}</button>
                </div>
                <p class="ui-muted ck-idem-note">
                  Reenviar este checkout com a mesma chave não gera nova cobrança — a transação é
                  reaproveitada pelo gateway.
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
                  :disabled="alreadyApproved"
                >
                  {{ submitLabel }}
                </UiButton>
                <p v-if="alreadyApproved" class="ck-submit-hint ui-muted">
                  Pagamento já aprovado para este carrinho.
                </p>
                <p v-else class="ck-submit-hint ui-muted">
                  Ao confirmar, você autoriza a cobrança de {{ format.formatCurrency(subtotal) }}.
                </p>
              </div>
            </form>
          </UiCard>
        </div>

        <!-- COLUNA LATERAL: CartSummary -->
        <aside class="ck-side">
          <!-- =============== CartSummary =============== -->
          <UiCard :title="'Carrinho ' + cartLabel" subtitle="Resumo da compra.">
            <template #actions>
              <UiStatusBadge :status="cartData.status" :label="statusLabel" />
            </template>

            <div class="ck-metrics">
              <UiMetricCard label="Itens" :value="format.formatNumber(itemsCount)" tone="primary" />
              <UiMetricCard
                label="Subtotal"
                :value="format.formatCurrency(subtotal)"
                tone="success"
                hint="Sem frete e impostos"
              />
            </div>

            <dl class="ck-summary">
              <div class="ck-sum-row">
                <dt>Cliente</dt>
                <dd>{{ customerName }}</dd>
              </div>
              <div class="ck-sum-row">
                <dt>Itens</dt>
                <dd>{{ format.formatNumber(itemsCount) }}</dd>
              </div>
              <div class="ck-sum-row">
                <dt>Atualizado em</dt>
                <dd>{{ format.formatDateTime(cartData.updatedAt || cartData.updated_at) }}</dd>
              </div>
            </dl>

            <template #footer>
              <div class="ck-total-row">
                <span class="ck-total-label">Total a pagar</span>
                <span class="ck-total-value">{{ format.formatCurrency(subtotal) }}</span>
              </div>
            </template>
          </UiCard>

          <UiCard title="Compra protegida">
            <ul class="ck-trust">
              <li class="ck-trust-item">
                <span class="ck-trust-icon" aria-hidden="true">🔒</span>
                <span>Dados de cartão nunca trafegam — só o token do cofre.</span>
              </li>
              <li class="ck-trust-item">
                <span class="ck-trust-icon" aria-hidden="true">↺</span>
                <span>Idempotência impede cobrança duplicada em reenvios.</span>
              </li>
              <li class="ck-trust-item">
                <span class="ck-trust-icon" aria-hidden="true">🧾</span>
                <span>Cada cobrança fica registrada na trilha de auditoria.</span>
              </li>
            </ul>
          </UiCard>
        </aside>
      </div>
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
        <template #cell-amount="{ value }">{{ format.formatCurrency(value) }}</template>
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
  UiPageLayout, UiCard, UiButton, UiMetricCard, UiFormField, UiFormSection, UiStatusBadge,
  UiEmptyState, UiLoadingState, UiErrorState, UiDataTable, UiModal,
  useForm, useToast, useConfirm, validators, format,
} from '../ui/index.js';
import * as api from '../api.js';

const props = defineProps({ cartId: { type: [String, Number], default: '' } });
const route = useRoute();
const toast = useToast();
const confirm = useConfirm();

// --- identidade da tela: prop :cartId (router props:true) ou param da rota ---------------
const cartId = computed(() => String(props.cartId ?? route.params.cartId ?? route.params.id ?? '').trim());
const cartLabel = computed(() => '#' + (cartId.value || '—'));
const cartDetailRoute = computed(() => (cartId.value ? '/carrinhos/' + cartId.value : '/carts'));

// --- dados do carrinho (endpoint real GET /v1/carts/:id) --------------------------------
const cartData = ref(null);
const loading = ref(true);
const rawError = ref(null);
const notFound = ref(false);

const loadError = computed(() => {
  if (notFound.value) return null; // tratado como empty-state, não como erro
  const e = rawError.value;
  if (!e) return null;
  return e.message || 'Falha ao carregar o carrinho.';
});
const emptyDescription = computed(
  () => 'Não localizamos o carrinho ' + cartLabel.value + '. Ele pode ter expirado ou já ter sido convertido.',
);

async function loadCart() {
  loading.value = true;
  rawError.value = null;
  notFound.value = false;
  cartData.value = null;
  if (!cartId.value) {
    notFound.value = true;
    loading.value = false;
    return;
  }
  try {
    const data = await api.carts.get(cartId.value);
    if (!data || typeof data !== 'object') notFound.value = true;
    else cartData.value = data;
  } catch (e) {
    if (e && e.status === 404) notFound.value = true;
    else rawError.value = e;
  } finally {
    loading.value = false;
  }
}

// --- derivados do carrinho (tolera snake_case e camelCase) ------------------------------
const customerName = computed(
  () => cartData.value?.customerName || cartData.value?.customer_name || 'Visitante',
);
const itemsCount = computed(() => Number(cartData.value?.itemsCount ?? cartData.value?.items_count ?? 0));
const subtotal = computed(() => Number(cartData.value?.subtotal ?? 0));
const hasChargeableAmount = computed(() => subtotal.value > 0);
const statusOf = computed(() => String(cartData.value?.status || '').toLowerCase());
const alreadyConverted = computed(() => statusOf.value === 'convertido');
const statusLabel = computed(() => format.humanize(cartData.value?.status || ''));

// código de pedido determinístico derivado do carrinho (estável → idempotência).
const orderId = computed(() => 'CART-' + cartId.value);
// Idempotency-Key exibida ao operador (mesma semântica do backend: cobrança única por pedido).
const idempotencyKey = computed(() => 'order:' + orderId.value);

// --- formulário de pagamento (tokenizado) ----------------------------------------------
const methods = [
  { value: 'credit_card', label: 'Cartão de crédito (tokenizado)' },
  { value: 'pix', label: 'PIX' },
  { value: 'boleto', label: 'Boleto bancário' },
];
const tokenSamples = [
  { value: 'tok_visa_ok', label: 'Aprovado', tone: 'success' },
  { value: 'tok_visa_declined', label: 'Recusado', tone: 'error' },
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
const fieldError = (key) => (form.touched[key] ? form.errors[key] || '' : '');

function onMethodChange(ev) {
  form.setField('method', ev.target.value);
  // sugestão de token só quando o operador ainda não digitou um (não sobrescreve a entrada dele).
  if (!form.values.paymentMethodToken) {
    const suggest = { credit_card: 'tok_card_', pix: 'tok_pix_', boleto: 'tok_boleto_' }[ev.target.value];
    if (suggest) form.setField('paymentMethodToken', suggest + cartId.value);
  }
}
function applyToken(value) {
  form.setField('paymentMethodToken', value);
  if (!form.values.method) form.setField('method', 'credit_card');
}

// --- copiar Idempotency-Key (CSP-safe; degrada se a API não existir) --------------------
const copied = ref(false);
let copyTimer = null;
async function copyKey() {
  try {
    if (navigator?.clipboard?.writeText) {
      await navigator.clipboard.writeText(idempotencyKey.value);
      copied.value = true;
      if (copyTimer) clearTimeout(copyTimer);
      copyTimer = setTimeout(() => { copied.value = false; }, 2000);
    } else {
      toast.info('Copie manualmente a chave de idempotência.');
    }
  } catch {
    toast.error('Não foi possível copiar a chave.');
  }
}

// --- passos do checkout ----------------------------------------------------------------
const steps = [
  { key: 'review', label: 'Revisar carrinho' },
  { key: 'pay', label: 'Pagamento' },
  { key: 'confirm', label: 'Confirmação' },
];
const currentStep = computed(() => {
  if (result.value && resultApproved.value) return 2;
  const hasPayment = form.values.method && form.values.paymentMethodToken && !form.errors.paymentMethodToken;
  return hasPayment ? 2 : 1;
});
function stepState(i) {
  if (result.value && resultApproved.value) return i < 2 ? 'done' : 'current';
  if (i < currentStep.value) return 'done';
  if (i === currentStep.value) return 'current';
  return 'pending';
}

// --- resultado do checkout -------------------------------------------------------------
const result = ref(null);
const approvedStatuses = ['approved', 'aprovado', 'authorized', 'autorizado', 'paid', 'pago', 'succeeded'];
const resultApproved = computed(() => approvedStatuses.includes(String(result.value?.status || '').toLowerCase()));
const resultTone = computed(() => (resultApproved.value ? 'success' : 'error'));
const alreadyApproved = computed(() => !!result.value && resultApproved.value);
const resultStatusLabel = computed(() => format.humanize(result.value?.status || ''));
const resultMessage = computed(() => {
  if (resultApproved.value) return 'Pedido criado com sucesso. Guarde o código da transação.';
  return result.value?.message
    || result.value?.reason
    || 'A operadora recusou a cobrança. Tente outro método de pagamento.';
});

const submitLabel = computed(() => {
  if (form.submitting.value) return 'Processando pagamento…';
  if (alreadyApproved.value) return 'Pagamento concluído';
  return 'Confirmar e pagar ' + format.formatCurrency(subtotal.value);
});

async function submitCheckout() {
  if (!hasChargeableAmount.value || alreadyApproved.value) return;
  // valida antes de pedir a confirmação (não abre o diálogo com o formulário inválido).
  if (!form.validate()) return;

  const ok = await confirm({
    title: 'Confirmar pagamento',
    message:
      'Cobrar ' + format.formatCurrency(subtotal.value) +
      ' do método tokenizado selecionado para o carrinho ' + cartLabel.value + '?',
    confirmLabel: 'Pagar agora',
    cancelLabel: 'Revisar',
  });
  if (!ok) return;

  await form.handleSubmit(async (values) => {
    try {
      // endpoint real POST /v1/checkout — token no body + Idempotency-Key no header
      // (mesma chave → mesma transação; o gateway reaproveita a cobrança).
      const res = await api.store.checkout(
        orderId.value, subtotal.value, values.paymentMethodToken, idempotencyKey.value,
      );
      result.value = res || {};
      if (resultApproved.value) {
        toast.success('Pagamento aprovado', {
          detail: res.transactionId ? 'Transação ' + res.transactionId : 'Pedido criado.',
          code: res.status,
        });
        if (cartData.value) cartData.value = { ...cartData.value, status: 'convertido' };
      } else {
        toast.warning('Pagamento recusado', { detail: resultMessage.value });
      }
    } catch (e) {
      result.value = null;
      toast.error('Falha no checkout', {
        detail: e.message || 'Não foi possível concluir o pagamento.',
        code: e.status ? 'HTTP ' + e.status : '',
      });
      throw e;
    }
  });
}

function retryPayment() {
  result.value = null;
  form.setField('paymentMethodToken', '');
}

// --- trilha de auditoria (endpoint real GET /v1/checkout/audit, quando exposto) ---------
const auditAvailable = computed(
  () => typeof api.checkout?.audit === 'function' || typeof api.store?.checkoutAudit === 'function',
);
const auditOpen = ref(false);
const auditLoading = ref(false);
const auditError = ref('');
const auditRows = ref([]);
const auditColumns = [
  { key: 'at', label: 'Quando', sortable: true },
  { key: 'event', label: 'Evento' },
  { key: 'status', label: 'Situação' },
  { key: 'amount', label: 'Valor', align: 'right' },
];

async function fetchAudit() {
  if (!auditAvailable.value) return;
  auditLoading.value = true;
  auditError.value = '';
  try {
    const fn = api.checkout?.audit || api.store?.checkoutAudit;
    const rows = await fn();
    const list = Array.isArray(rows) ? rows : rows?.data || [];
    auditRows.value = list.map((r, i) => ({ _k: r.id ?? i, ...r }));
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
/* indicador de passos */
.ck-steps {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  gap: var(--ui-space-3);
  flex-wrap: wrap;
}
.ck-step {
  display: flex;
  align-items: center;
  gap: var(--ui-space-2);
  flex: 1 1 160px;
  padding: var(--ui-space-3) var(--ui-space-4);
  border: 1px solid rgb(var(--ui-border));
  border-radius: var(--ui-radius-md);
  background: rgb(var(--ui-surface));
  color: rgb(var(--ui-muted));
  font-size: var(--ui-text-sm);
  font-weight: 600;
}
.ck-step[data-state="current"] { border-color: rgb(var(--ui-accent)); color: rgb(var(--ui-fg)); }
.ck-step[data-state="done"] { border-color: rgb(var(--ui-ok) / 0.5); color: rgb(var(--ui-fg)); }
.ck-step-mark {
  flex-shrink: 0;
  width: var(--ui-space-5);
  height: var(--ui-space-5);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  font-size: var(--ui-text-xs);
  font-weight: 700;
  background: rgb(var(--ui-surface-2));
  color: rgb(var(--ui-muted));
}
.ck-step[data-state="current"] .ck-step-mark { background: rgb(var(--ui-accent) / 0.18); color: rgb(var(--ui-accent-strong)); }
.ck-step[data-state="done"] .ck-step-mark { background: rgb(var(--ui-ok) / 0.18); color: rgb(var(--ui-ok)); }

/* layout em 2 colunas (pagamento + resumo) */
.ck-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 340px;
  gap: var(--ui-space-5);
  align-items: start;
}
.ck-main { display: flex; flex-direction: column; gap: var(--ui-space-4); min-width: 0; }
.ck-side { display: flex; flex-direction: column; gap: var(--ui-space-4); min-width: 0; }

/* selo seguro no header do form */
.ck-secure {
  display: inline-flex;
  align-items: center;
  gap: var(--ui-space-1);
  font-size: var(--ui-text-xs);
  font-weight: 700;
  color: rgb(var(--ui-ok));
  background: rgb(var(--ui-ok) / 0.14);
  border-radius: var(--ui-radius-pill);
  padding: 3px 10px;
}
.ck-secure-icon { font-size: var(--ui-text-sm); }

/* PaymentMethodForm */
.ck-form { display: flex; flex-direction: column; gap: var(--ui-space-4); }

/* chips de token de teste */
.ck-tokens { display: flex; align-items: center; gap: var(--ui-space-2); flex-wrap: wrap; }
.ck-tokens-label { font-size: var(--ui-text-xs); color: rgb(var(--ui-muted)); font-weight: 600; }
.ck-token-chip {
  font: inherit;
  font-size: var(--ui-text-xs);
  font-weight: 600;
  cursor: pointer;
  border-radius: var(--ui-radius-pill);
  padding: 3px 11px;
  border: 1px solid rgb(var(--ui-border-strong));
  background: rgb(var(--ui-surface));
  color: rgb(var(--ui-fg));
}
.ck-token-chip:hover:not(:disabled) { border-color: rgb(var(--ui-accent)); color: rgb(var(--ui-accent-strong)); }
.ck-token-chip:disabled { opacity: 0.5; cursor: not-allowed; }
.ck-token-chip[data-tone="success"]:hover:not(:disabled) { border-color: rgb(var(--ui-ok)); color: rgb(var(--ui-ok)); }
.ck-token-chip[data-tone="error"]:hover:not(:disabled) { border-color: rgb(var(--ui-danger)); color: rgb(var(--ui-danger)); }

/* IdempotentSubmit */
.ck-idem {
  border: 1px dashed rgb(var(--ui-border-strong));
  border-radius: var(--ui-radius-md);
  padding: var(--ui-space-4);
  background: rgb(var(--ui-surface-2));
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-2);
}
.ck-idem-head { display: flex; align-items: center; justify-content: space-between; gap: var(--ui-space-3); flex-wrap: wrap; }
.ck-idem-label { font-size: var(--ui-text-xs); text-transform: uppercase; letter-spacing: .06em; color: rgb(var(--ui-muted)); font-weight: 700; }
.ck-idem-key-row { display: flex; align-items: stretch; gap: var(--ui-space-2); }
.ck-idem-key {
  flex: 1 1 auto;
  min-width: 0;
  display: block;
  font-size: var(--ui-text-sm);
  color: rgb(var(--ui-fg));
  word-break: break-all;
  background: rgb(var(--ui-bg));
  border: 1px solid rgb(var(--ui-border));
  border-radius: var(--ui-radius-sm);
  padding: var(--ui-space-2) var(--ui-space-3);
}
.ck-copy {
  flex-shrink: 0;
  font: inherit;
  font-size: var(--ui-text-xs);
  font-weight: 600;
  cursor: pointer;
  border: 1px solid rgb(var(--ui-border-strong));
  background: rgb(var(--ui-surface));
  color: rgb(var(--ui-fg));
  border-radius: var(--ui-radius-sm);
  padding: 0 var(--ui-space-3);
}
.ck-copy:hover:not(:disabled) { border-color: rgb(var(--ui-accent)); color: rgb(var(--ui-accent-strong)); }
.ck-copy:disabled { opacity: 0.5; cursor: not-allowed; }
.ck-idem-note { margin: 0; font-size: var(--ui-text-xs); }

.ck-charge { display: flex; align-items: baseline; justify-content: space-between; gap: var(--ui-space-4); padding-top: var(--ui-space-1); border-top: 1px solid rgb(var(--ui-border)); }
.ck-charge-value { font-family: var(--ui-font-display); font-size: var(--ui-text-xl); font-weight: 700; }
.ck-submit { display: flex; flex-direction: column; gap: var(--ui-space-2); margin-top: var(--ui-space-1); }
.ck-submit-hint { margin: 0; font-size: var(--ui-text-xs); text-align: center; }

/* CartSummary */
.ck-metrics { display: grid; grid-template-columns: repeat(2, 1fr); gap: var(--ui-space-3); margin-bottom: var(--ui-space-4); }
.ck-summary { margin: 0; display: flex; flex-direction: column; gap: var(--ui-space-3); }
.ck-sum-row { display: flex; align-items: baseline; justify-content: space-between; gap: var(--ui-space-3); }
.ck-sum-row dt { margin: 0; color: rgb(var(--ui-muted)); font-size: var(--ui-text-sm); }
.ck-sum-row dd { margin: 0; font-weight: 600; text-align: right; word-break: break-word; min-width: 0; }
.ck-total-row { display: flex; align-items: baseline; justify-content: space-between; gap: var(--ui-space-4); }
.ck-total-label { color: rgb(var(--ui-muted)); font-size: var(--ui-text-sm); }
.ck-total-value { font-family: var(--ui-font-display); font-size: var(--ui-text-xl); font-weight: 700; }

/* trust list */
.ck-trust { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--ui-space-3); }
.ck-trust-item { display: flex; align-items: flex-start; gap: var(--ui-space-2); font-size: var(--ui-text-sm); color: rgb(var(--ui-fg)); }
.ck-trust-icon { flex-shrink: 0; }

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

/* kv (result grid) */
.ck-kv { margin: 0; display: flex; flex-direction: column; gap: var(--ui-space-1); min-width: 0; }
.ck-kv dt { margin: 0; font-size: var(--ui-text-xs); text-transform: uppercase; letter-spacing: .06em; color: rgb(var(--ui-muted)); }
.ck-kv dd { margin: 0; font-weight: 600; word-break: break-word; }

/* já convertido */
.ck-converted { display: flex; align-items: flex-start; gap: var(--ui-space-4); }
.ck-converted-icon { flex-shrink: 0; width: 40px; height: 40px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; font-weight: 700; font-size: var(--ui-text-xl); background: rgb(var(--ui-ok) / 0.16); color: rgb(var(--ui-ok)); }
.ck-converted-text { display: flex; flex-direction: column; gap: var(--ui-space-2); align-items: flex-start; }
.ck-converted-title { margin: 0; font-weight: 700; font-size: var(--ui-text-md); }
.ck-converted-actions { display: flex; gap: var(--ui-space-2); flex-wrap: wrap; }

/* responsivo */
@media (max-width: 980px) {
  .ck-grid { grid-template-columns: 1fr; }
  .ck-side { flex-direction: row; flex-wrap: wrap; }
  .ck-side > * { flex: 1 1 280px; }
}
@media (max-width: 640px) {
  .ck-summary, .ck-result-grid, .ck-metrics { grid-template-columns: 1fr; }
  .ck-side { flex-direction: column; }
  .ck-converted { flex-direction: column; }
}
</style>
