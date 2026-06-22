<!--
  OrderEditView — Editar pedido (REQ-SHOPDESK-0005)
  Atualiza dados EDITÁVEIS do pedido antes do envio (cliente, endereço, rastreio, status logístico).
  NÃO altera a transação financeira: total e pagamento são exibidos somente-leitura.
  100% sobre o kit ui-vue · só tokens --ui-* · CSP-safe (sem style inline / v-html) · a11y · responsivo.
-->
<template>
  <UiPageLayout
    eyebrow="Pedidos"
    :title="pageTitle"
    subtitle="Atualize os dados editáveis antes do envio. A transação financeira não é alterada aqui."
    width="default"
    :loading="loading"
    loading-message="Carregando pedido…"
    :error="loadError"
    :retryable="true"
    @retry="reload"
  >
    <!-- ações de topo -->
    <template #actions>
      <UiButton variant="ghost" :to="backTo">Voltar ao pedido</UiButton>
      <UiButton
        variant="primary"
        :loading="form.submitting.value"
        :disabled="!isDirty"
        @click="save"
      >
        Salvar alterações
      </UiButton>
    </template>

    <!-- banner de mudanças não salvas -->
    <template #banner>
      <p v-if="isDirty && !loading && !loadError" class="oe-dirty" role="status">
        <span class="oe-dirty-dot" aria-hidden="true" />
        Há alterações não salvas neste pedido.
      </p>
    </template>

    <!-- ESTADO: pedido inexistente / vazio (id válido, sem dados) -->
    <!-- loading/erro ficam a cargo do UiPageLayout: este slot só renderiza no v-else. -->
    <UiEmptyState
      v-if="!order"
      title="Pedido não encontrado"
      description="Este pedido não existe mais ou o identificador está incorreto."
      icon="🔎"
    >
      <template #action>
        <UiButton variant="primary" to="/orders">Ver pedidos</UiButton>
      </template>
    </UiEmptyState>

    <!-- ESTADO NORMAL: formulário de edição -->
    <form v-else class="oe-form" novalidate @submit.prevent="save">
      <!-- resumo somente-leitura do pedido (contexto + trava financeira) -->
      <UiCard class="oe-summary">
        <template #header>
          <div class="oe-summary-head">
            <p class="oe-summary-code ui-mono">{{ order.code || ('#' + orderId) }}</p>
            <div class="oe-summary-badges">
              <UiStatusBadge :status="order.status" size="sm" />
              <UiStatusBadge
                v-if="order.paymentStatus"
                :status="order.paymentStatus"
                :label="paymentLabel(order.paymentStatus)"
                size="sm"
              />
            </div>
          </div>
        </template>
        <dl class="oe-kv">
          <div class="oe-kv-row">
            <dt>Total</dt>
            <dd class="oe-kv-strong">{{ format.formatCurrency(order.total) }}</dd>
          </div>
          <div class="oe-kv-row">
            <dt>Itens</dt>
            <dd>{{ format.formatNumber(order.itemsCount ?? 0) }}</dd>
          </div>
          <div class="oe-kv-row">
            <dt>Pagamento</dt>
            <dd>{{ paymentLabel(order.paymentStatus) }}</dd>
          </div>
          <div class="oe-kv-row">
            <dt>Criado em</dt>
            <dd>{{ format.formatDateTime(order.createdAt) }}</dd>
          </div>
        </dl>
        <template #footer>
          <p class="oe-lock">
            <span aria-hidden="true">🔒</span>
            Total e pagamento são definidos pela transação financeira e não podem ser editados aqui.
          </p>
        </template>
      </UiCard>

      <!-- SEÇÃO: dados do cliente -->
      <UiCard>
        <UiFormSection
          title="Cliente"
          description="Quem recebe o pedido. Usado na nota e nas notificações."
          :columns="2"
        >
          <UiFormField
            label="Nome do cliente"
            required
            :error="form.errors.customerName"
            v-slot="{ id, describedBy, hasError }"
          >
            <input
              :id="id"
              type="text"
              autocomplete="name"
              :aria-invalid="hasError || null"
              :aria-describedby="describedBy"
              :value="form.values.customerName"
              @input="onInput('customerName', $event)"
            />
          </UiFormField>

          <UiFormField
            label="E-mail do cliente"
            hint="Para confirmações e código de rastreio."
            :error="form.errors.customerEmail"
            v-slot="{ id, describedBy, hasError }"
          >
            <input
              :id="id"
              type="email"
              autocomplete="email"
              inputmode="email"
              placeholder="cliente@exemplo.com"
              :aria-invalid="hasError || null"
              :aria-describedby="describedBy"
              :value="form.values.customerEmail"
              @input="onInput('customerEmail', $event)"
            />
          </UiFormField>
        </UiFormSection>
      </UiCard>

      <!-- SEÇÃO: entrega -->
      <UiCard>
        <UiFormSection
          title="Entrega"
          description="Endereço de envio e código de rastreio da transportadora."
          :columns="2"
        >
          <UiFormField
            label="Endereço de entrega"
            full-width
            :error="form.errors.shippingAddress"
            v-slot="{ id, describedBy, hasError }"
          >
            <textarea
              :id="id"
              rows="3"
              autocomplete="street-address"
              placeholder="Rua, número, complemento, bairro, cidade — UF, CEP"
              :aria-invalid="hasError || null"
              :aria-describedby="describedBy"
              :value="form.values.shippingAddress"
              @input="onInput('shippingAddress', $event)"
            ></textarea>
          </UiFormField>

          <UiFormField
            label="Código de rastreio"
            hint="Preencha ao despachar para liberar o status “enviado”."
            :error="form.errors.trackingCode"
            v-slot="{ id, describedBy, hasError }"
          >
            <input
              :id="id"
              type="text"
              autocomplete="off"
              placeholder="Ex.: BR123456789BR"
              class="oe-mono-input ui-mono"
              :aria-invalid="hasError || null"
              :aria-describedby="describedBy"
              :value="form.values.trackingCode"
              @input="onInput('trackingCode', upperEvent($event))"
            />
          </UiFormField>

          <UiFormField
            label="Situação logística"
            required
            hint="Apenas o fluxo de envio. Não altera o pagamento."
            :error="form.errors.status"
            v-slot="{ id, describedBy, hasError }"
          >
            <select
              :id="id"
              :aria-invalid="hasError || null"
              :aria-describedby="describedBy"
              :value="form.values.status"
              @change="onStatusChange($event)"
            >
              <option v-for="opt in statusOptions" :key="opt.value" :value="opt.value">
                {{ opt.label }}
              </option>
            </select>
          </UiFormField>
        </UiFormSection>

        <!-- aviso contextual: enviado sem rastreio (status polido; role=alert fica só p/ o erro do campo) -->
        <p v-if="needsTracking" class="oe-warn" role="status" aria-live="polite">
          <span aria-hidden="true">⚠</span>
          Status “{{ statusLabelOf(form.values.status) }}” pede um código de rastreio.
        </p>
      </UiCard>

      <!-- FormActions -->
      <div class="oe-actions">
        <p class="oe-actions-hint ui-muted">
          {{ isDirty ? 'Revise e salve para aplicar as mudanças.' : 'Nenhuma alteração pendente.' }}
        </p>
        <div class="oe-actions-btns">
          <UiButton type="button" variant="ghost" :disabled="form.submitting.value" @click="cancel">
            Cancelar
          </UiButton>
          <UiButton
            type="button"
            variant="subtle"
            :disabled="!isDirty || form.submitting.value"
            @click="reset"
          >
            Descartar alterações
          </UiButton>
          <UiButton
            type="submit"
            variant="primary"
            :loading="form.submitting.value"
            :disabled="!isDirty"
          >
            Salvar alterações
          </UiButton>
        </div>
      </div>
    </form>
  </UiPageLayout>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import {
  UiPageLayout,
  UiCard,
  UiButton,
  UiFormField,
  UiFormSection,
  UiStatusBadge,
  UiEmptyState,
  useForm,
  useToast,
  useConfirm,
  validators,
  format,
} from '../ui/index.js';
import * as api from '../api.js';

const props = defineProps({ id: { type: [String, Number], default: '' } });

const router = useRouter();
const toast = useToast();
const confirm = useConfirm();

// --- identidade da tela ---------------------------------------------------
const orderId = computed(() => String(props.id ?? '').trim());
const backTo = computed(() => '/orders/' + orderId.value);
const pageTitle = computed(() =>
  order.value && order.value.code ? 'Editar pedido ' + order.value.code : 'Editar pedido',
);

// --- estados de carga -----------------------------------------------------
const loading = ref(true);
const loadError = ref(null);
const order = ref(null);

// snapshot dos valores carregados (para detectar "sujeira" e descartar)
const snapshot = reactive({});

// --- catálogo de status LOGÍSTICOS (subconjunto editável; financeiro fica de fora) ---
const STATUS_LABELS = {
  pendente: 'Pendente',
  pago: 'Pago',
  falha_pagamento: 'Falha no pagamento',
  em_separacao: 'Em separação',
  enviado: 'Enviado',
  entregue: 'Entregue',
  reembolsado: 'Reembolsado',
  cancelado: 'Cancelado',
};
// editáveis aqui: somente o fluxo logístico (não mexe na transação financeira)
const LOGISTIC_STATUSES = ['pago', 'em_separacao', 'enviado', 'entregue', 'cancelado'];
const TRACKING_REQUIRED = ['enviado', 'entregue'];

const PAYMENT_LABELS = {
  aguardando: 'Aguardando',
  aprovado: 'Aprovado',
  recusado: 'Recusado',
  estornado: 'Estornado',
};

const statusOptions = computed(() => {
  // garante que o status atual do pedido apareça mesmo se for um estado não-logístico
  const set = new Set(LOGISTIC_STATUSES);
  const current = form.values.status;
  if (current) set.add(current);
  return Array.from(set).map((value) => ({ value, label: STATUS_LABELS[value] || format.humanize(value) }));
});

const statusLabelOf = (s) => STATUS_LABELS[s] || format.humanize(s || '');
const paymentLabel = (s) => (s ? PAYMENT_LABELS[s] || format.humanize(s) : '—');

// --- formulário -----------------------------------------------------------
const form = useForm({
  initial: { customerName: '', customerEmail: '', shippingAddress: '', trackingCode: '', status: '' },
  rules: {
    customerName: [validators.required('Informe o nome do cliente'), validators.minLen(2)],
    customerEmail: [validators.email()],
    status: [validators.required('Selecione a situação logística')],
    trackingCode: [
      (v, all) =>
        TRACKING_REQUIRED.includes(all.status) && !String(v || '').trim()
          ? 'Código de rastreio é obrigatório para “' + statusLabelOf(all.status) + '”'
          : '',
    ],
  },
});

const needsTracking = computed(
  () => TRACKING_REQUIRED.includes(form.values.status) && !String(form.values.trackingCode || '').trim(),
);

const isDirty = computed(() => {
  for (const k of Object.keys(snapshot)) {
    if (String(form.values[k] ?? '') !== String(snapshot[k] ?? '')) return true;
  }
  return false;
});

// --- handlers de input (CSP-safe: sem :style/inline) ----------------------
function onInput(field, eventOrValue) {
  const value = typeof eventOrValue === 'string' ? eventOrValue : eventOrValue.target.value;
  form.setField(field, value);
}
function upperEvent(event) {
  return String(event.target.value || '').toUpperCase();
}
function onStatusChange(event) {
  form.setField('status', event.target.value);
  // revalida o rastreio (regra cruzada) ao trocar de status
  form.validateField('trackingCode');
}

// --- carregamento ---------------------------------------------------------
async function load() {
  loading.value = true;
  loadError.value = null;
  order.value = null;
  if (!orderId.value) {
    loading.value = false;
    return;
  }
  // contrato canônico: o recurso de pedidos é injetado pelo integrador como api.orders
  // (resourceFactory → /v1/orders). Sem ele, falha controlada (não derruba em TypeError).
  if (!api.orders || typeof api.orders.get !== 'function') {
    loadError.value = new Error('Recurso de pedidos indisponível.');
    loading.value = false;
    return;
  }
  try {
    const r = await api.orders.get(orderId.value);
    const data = r && r.data ? r.data : r;
    order.value = data;
    hydrate(data);
  } catch (e) {
    if (e && e.status === 404) {
      order.value = null; // cai no empty-state
    } else {
      loadError.value = e;
    }
  } finally {
    loading.value = false;
  }
}
const reload = load;

function hydrate(data) {
  const next = {
    customerName: data.customerName || '',
    customerEmail: data.customerEmail || '',
    shippingAddress: data.shippingAddress || data.address || '',
    trackingCode: data.trackingCode || '',
    status: data.status || '',
  };
  for (const [k, v] of Object.entries(next)) {
    form.setField(k, v);
    snapshot[k] = v;
  }
  // limpa "touched"/erros após hidratar (estado limpo)
  for (const k of Object.keys(form.errors)) delete form.errors[k];
  for (const k of Object.keys(form.touched)) delete form.touched[k];
}

// --- ações ----------------------------------------------------------------
async function save() {
  if (!isDirty.value) {
    toast.info('Nada para salvar — não há alterações.');
    return;
  }
  await form.handleSubmit(async (values) => {
    try {
      const payload = {
        customerName: values.customerName.trim(),
        customerEmail: values.customerEmail.trim(),
        shippingAddress: values.shippingAddress.trim(),
        trackingCode: values.trackingCode.trim(),
        status: values.status,
      };
      if (!api.orders || typeof api.orders.update !== 'function') {
        throw new Error('Recurso de pedidos indisponível.');
      }
      const r = await api.orders.update(orderId.value, payload);
      const updated = r && r.data ? r.data : r;
      if (updated && typeof updated === 'object') {
        order.value = { ...order.value, ...updated };
      } else {
        order.value = { ...order.value, ...payload };
      }
      // novo baseline (deixa de estar "sujo")
      for (const k of Object.keys(snapshot)) snapshot[k] = form.values[k];
      toast.success('Pedido atualizado com sucesso.');
      router.push(backTo.value);
    } catch (e) {
      toast.error('Não foi possível salvar o pedido.', {
        detail: (e && e.message) || '',
        code: e && e.status ? 'HTTP ' + e.status : '',
      });
      throw e;
    }
  });
}

async function reset() {
  if (!isDirty.value) return;
  const ok = await confirm({
    title: 'Descartar alterações?',
    message: 'As mudanças não salvas serão perdidas e o formulário volta aos dados originais.',
    confirmLabel: 'Descartar',
    cancelLabel: 'Continuar editando',
    danger: true,
  });
  if (!ok) return;
  for (const [k, v] of Object.entries(snapshot)) form.setField(k, v);
  for (const k of Object.keys(form.errors)) delete form.errors[k];
  toast.info('Alterações descartadas.');
}

async function cancel() {
  if (isDirty.value) {
    const ok = await confirm({
      title: 'Sair sem salvar?',
      message: 'Você tem alterações não salvas neste pedido. Deseja sair mesmo assim?',
      confirmLabel: 'Sair sem salvar',
      cancelLabel: 'Continuar editando',
      danger: true,
    });
    if (!ok) return;
  }
  router.push(backTo.value);
}

onMounted(load);
</script>

<style scoped>
/* banner de mudanças não salvas */
.oe-dirty {
  display: flex;
  align-items: center;
  gap: var(--ui-space-2);
  margin: 0;
  padding: var(--ui-space-2) var(--ui-space-4);
  border: 1px solid rgb(var(--ui-warn) / 0.4);
  background: rgb(var(--ui-warn) / 0.1);
  color: rgb(var(--ui-warn));
  border-radius: var(--ui-radius-md);
  font-size: var(--ui-text-sm);
  font-weight: 600;
}
.oe-dirty-dot {
  width: var(--ui-space-2);
  height: var(--ui-space-2);
  border-radius: 50%; /* círculo — px cru aceitável (sem token de raio circular) */
  background: currentColor;
  flex-shrink: 0;
}

/* formulário */
.oe-form {
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-4);
}

/* resumo somente-leitura */
.oe-summary {
  background: rgb(var(--ui-surface));
}
.oe-summary-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ui-space-3);
  flex-wrap: wrap;
  width: 100%;
}
.oe-summary-code {
  font-size: var(--ui-text-lg);
  font-weight: 700;
  color: rgb(var(--ui-fg));
  margin: 0;
}
.oe-summary-badges {
  display: flex;
  gap: var(--ui-space-2);
  flex-wrap: wrap;
}
.oe-kv {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: var(--ui-space-4);
  margin: 0;
}
.oe-kv-row {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.oe-kv dt {
  font-size: var(--ui-text-xs);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: rgb(var(--ui-muted));
  font-weight: 600;
}
.oe-kv dd {
  margin: 0;
  font-size: var(--ui-text-md);
  color: rgb(var(--ui-fg));
}
.oe-kv-strong {
  font-weight: 700;
  font-size: var(--ui-text-lg);
}
.oe-lock {
  display: flex;
  align-items: center;
  gap: var(--ui-space-2);
  margin: 0;
  font-size: var(--ui-text-xs);
  color: rgb(var(--ui-muted));
}

/* campo monoespaçado (rastreio) */
.oe-mono-input {
  letter-spacing: 0.04em;
}

/* aviso contextual */
.oe-warn {
  display: flex;
  align-items: center;
  gap: var(--ui-space-2);
  margin: var(--ui-space-3) 0 0;
  padding: var(--ui-space-2) var(--ui-space-3);
  border-radius: var(--ui-radius-sm);
  background: rgb(var(--ui-warn) / 0.12);
  color: rgb(var(--ui-warn));
  font-size: var(--ui-text-sm);
  font-weight: 600;
}

/* barra de ações */
.oe-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ui-space-4);
  flex-wrap: wrap;
  padding: var(--ui-space-4) var(--ui-space-5);
  border: 1px solid rgb(var(--ui-border));
  border-radius: var(--ui-radius-lg);
  background: rgb(var(--ui-surface-2));
  position: sticky;
  bottom: var(--ui-space-4);
  box-shadow: var(--ui-shadow-sm);
}
.oe-actions-hint {
  margin: 0;
  font-size: var(--ui-text-sm);
}
.oe-actions-btns {
  display: flex;
  gap: var(--ui-space-2);
  flex-wrap: wrap;
}

@media (max-width: 860px) {
  .oe-kv {
    grid-template-columns: repeat(2, 1fr);
  }
  .oe-actions {
    flex-direction: column;
    align-items: stretch;
    position: static;
  }
  .oe-actions-btns {
    justify-content: flex-end;
  }
}
</style>
