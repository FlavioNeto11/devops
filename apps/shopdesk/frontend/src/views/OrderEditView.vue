<!--
  OrderEditView — Editar pedido (REQ-SHOPDESK-0005)
  Atualiza dados EDITÁVEIS do pedido antes do envio: cliente, e-mail, endereço de entrega,
  código de rastreio e situação logística. NÃO altera a transação financeira — total e
  pagamento aparecem somente-leitura, com trava explícita.

  Contrato de UI: 100% sobre o kit ui-vue (import de ../ui/index.js) · só tokens --ui-* em CSS ·
  CSP-safe (sem style inline / :style / v-html) · todos os estados (loading/empty/error/normal) ·
  ações destrutivas via useConfirm · toast em sucesso/erro · a11y + responsivo.
  Rotas de domínio: volta/cancela vão para /orders e /orders/:id.
-->
<template>
  <UiPageLayout
    eyebrow="Pedidos"
    :title="pageTitle"
    subtitle="Ajuste o que pode mudar antes do envio. A transação financeira permanece intacta."
    width="wide"
    :loading="loading"
    loading-message="Carregando pedido…"
    :error="loadError"
    :retryable="true"
    @retry="reload"
  >
    <!-- AÇÕES DE TOPO -->
    <template #actions>
      <UiButton variant="ghost" :to="backTo">Voltar ao pedido</UiButton>
      <UiButton
        variant="primary"
        :loading="form.submitting.value"
        :disabled="!order || !isDirty"
        @click="save"
      >
        Salvar alterações
      </UiButton>
    </template>

    <!-- BANNER: mudanças não salvas (some no loading/erro pois o PageLayout não renderiza o corpo) -->
    <template #banner>
      <p v-if="order && isDirty" class="oe-dirty" role="status">
        <span class="oe-dirty-dot" aria-hidden="true" />
        Há alterações não salvas. {{ dirtyCount }} {{ dirtyCount === 1 ? 'campo alterado' : 'campos alterados' }}.
      </p>
    </template>

    <!-- ESTADO EMPTY: id válido mas pedido inexistente (404 / sem dados). loading e error
         são tratados pelo próprio UiPageLayout; este slot só renderiza no caminho "normal". -->
    <UiEmptyState
      v-if="!order"
      title="Pedido não encontrado"
      description="Este pedido não existe mais ou o identificador está incorreto. Verifique a lista de pedidos."
      icon="🔎"
    >
      <template #action>
        <UiButton variant="primary" to="/orders">Ver pedidos</UiButton>
      </template>
    </UiEmptyState>

    <!-- ESTADO NORMAL -->
    <form v-else class="oe-grid" novalidate @submit.prevent="save">
      <!-- ===================== COLUNA PRINCIPAL: edição ===================== -->
      <div class="oe-main">
        <!-- Trilha visual do fluxo logístico -->
        <UiCard title="Fluxo logístico" subtitle="Onde o pedido está no caminho até a entrega.">
          <template #actions>
            <UiStatusBadge :status="form.values.status" :label="statusLabelOf(form.values.status)" />
          </template>
          <ol class="oe-flow" aria-label="Etapas do envio do pedido">
            <li
              v-for="(step, i) in flowSteps"
              :key="step.value"
              class="oe-flow-step"
              :data-state="step.state"
            >
              <span class="oe-flow-marker" aria-hidden="true">
                <span class="oe-flow-glyph">{{ step.state === 'done' ? '✓' : i + 1 }}</span>
              </span>
              <span class="oe-flow-meta">
                <span class="oe-flow-label">{{ step.label }}</span>
                <span class="oe-flow-state ui-muted">{{ step.caption }}</span>
              </span>
            </li>
          </ol>
        </UiCard>

        <!-- SEÇÃO: Cliente -->
        <UiCard title="Cliente" subtitle="Quem recebe o pedido. Aparece na nota e nas notificações.">
          <UiFormSection :columns="2">
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
                placeholder="Nome de quem recebe"
                :aria-invalid="hasError || null"
                :aria-describedby="describedBy"
                :value="form.values.customerName"
                @input="onInput('customerName', $event)"
              />
            </UiFormField>

            <UiFormField
              label="E-mail do cliente"
              hint="Para confirmações e o código de rastreio."
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

        <!-- SEÇÃO: Entrega -->
        <UiCard title="Entrega" subtitle="Endereço de envio, situação logística e rastreio.">
          <UiFormSection :columns="2">
            <UiFormField
              label="Endereço de entrega"
              full-width
              hint="Rua, número, complemento, bairro, cidade — UF e CEP."
              :error="form.errors.shippingAddress"
              v-slot="{ id, describedBy, hasError }"
            >
              <textarea
                :id="id"
                rows="3"
                autocomplete="street-address"
                placeholder="Ex.: Av. Brasil, 1000, ap. 12, Centro, São Paulo — SP, 01000-000"
                :aria-invalid="hasError || null"
                :aria-describedby="describedBy"
                :value="form.values.shippingAddress"
                @input="onInput('shippingAddress', $event)"
              ></textarea>
            </UiFormField>

            <UiFormField
              label="Situação logística"
              required
              hint="Apenas o fluxo de envio — não toca no pagamento."
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

            <UiFormField
              label="Código de rastreio"
              :hint="trackingHint"
              :error="form.errors.trackingCode"
              v-slot="{ id, describedBy, hasError }"
            >
              <input
                :id="id"
                type="text"
                autocomplete="off"
                spellcheck="false"
                maxlength="40"
                placeholder="Ex.: BR123456789BR"
                class="oe-mono-input ui-mono"
                :aria-invalid="hasError || null"
                :aria-describedby="describedBy"
                :value="form.values.trackingCode"
                @input="onTrackingInput($event)"
              />
            </UiFormField>
          </UiFormSection>

          <!-- aviso cruzado: status pede rastreio mas o campo está vazio -->
          <p v-if="needsTracking" class="oe-warn" role="status" aria-live="polite">
            <span aria-hidden="true">⚠</span>
            “{{ statusLabelOf(form.values.status) }}” precisa de um código de rastreio para o cliente acompanhar.
          </p>
        </UiCard>

        <!-- BARRA DE AÇÕES (FormActions) -->
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
              @click="discard"
            >
              Descartar alterações
            </UiButton>
            <UiButton type="submit" variant="primary" :loading="form.submitting.value" :disabled="!isDirty">
              Salvar alterações
            </UiButton>
          </div>
        </div>
      </div>

      <!-- ===================== COLUNA LATERAL: resumo somente-leitura ===================== -->
      <aside class="oe-side" aria-label="Resumo do pedido">
        <UiCard class="oe-summary">
          <template #header>
            <div class="oe-summary-head">
              <div class="oe-summary-id">
                <p class="oe-summary-eyebrow ui-muted">Pedido</p>
                <p class="oe-summary-code ui-mono">{{ order.code || ('#' + orderId) }}</p>
              </div>
              <div class="oe-summary-badges">
                <UiStatusBadge :status="order.status" :label="statusLabelOf(order.status)" size="sm" />
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
            <div class="oe-kv-row oe-kv-total">
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
              <span class="oe-lock-icon" aria-hidden="true">🔒</span>
              <span>Total e pagamento vêm da transação financeira e <strong>não</strong> são editados aqui.</span>
            </p>
          </template>
        </UiCard>

        <!-- Diferenças pendentes: o que será enviado ao salvar -->
        <UiCard v-if="isDirty" title="Alterações pendentes" class="oe-diff">
          <ul class="oe-diff-list">
            <li v-for="d in changes" :key="d.key" class="oe-diff-item">
              <span class="oe-diff-field">{{ d.label }}</span>
              <span class="oe-diff-vals">
                <span class="oe-diff-from">{{ d.from || '—' }}</span>
                <span class="oe-diff-arrow" aria-hidden="true">→</span>
                <span class="oe-diff-to">{{ d.to || '—' }}</span>
              </span>
            </li>
          </ul>
        </UiCard>
      </aside>
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

// --- identidade da tela ----------------------------------------------------
const orderId = computed(() => String(props.id ?? '').trim());
const backTo = computed(() => (orderId.value ? '/orders/' + orderId.value : '/orders'));
const pageTitle = computed(() =>
  order.value && order.value.code ? 'Editar pedido ' + order.value.code : 'Editar pedido',
);

// --- estados de carga ------------------------------------------------------
const loading = ref(true);
const loadError = ref(null);
const order = ref(null);

// snapshot dos valores carregados (base para "sujeira" e descarte)
const snapshot = reactive({});

// --- catálogos (rótulos pt-BR; o status-map só humaniza, então passamos label explícito) ---
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
// editáveis aqui: só o fluxo logístico (não mexe na transação financeira).
const LOGISTIC_STATUSES = ['pago', 'em_separacao', 'enviado', 'entregue', 'cancelado'];
// passos do "caminho feliz" exibidos na trilha visual (cancelado fica fora do fluxo linear).
const FLOW_ORDER = ['pago', 'em_separacao', 'enviado', 'entregue'];
const TRACKING_REQUIRED = ['enviado', 'entregue'];

const PAYMENT_LABELS = {
  aguardando: 'Aguardando',
  aprovado: 'Aprovado',
  recusado: 'Recusado',
  estornado: 'Estornado',
};

const FIELD_LABELS = {
  customerName: 'Nome do cliente',
  customerEmail: 'E-mail do cliente',
  shippingAddress: 'Endereço de entrega',
  trackingCode: 'Código de rastreio',
  status: 'Situação logística',
};

const statusLabelOf = (s) => (s ? STATUS_LABELS[s] || format.humanize(s) : '—');
const paymentLabel = (s) => (s ? PAYMENT_LABELS[s] || format.humanize(s) : '—');

const statusOptions = computed(() => {
  // garante que o status atual apareça mesmo se for um estado não-logístico (ex.: pendente).
  const set = new Set(LOGISTIC_STATUSES);
  if (form.values.status) set.add(form.values.status);
  return Array.from(set).map((value) => ({ value, label: statusLabelOf(value) }));
});

// --- trilha visual do fluxo ------------------------------------------------
const flowSteps = computed(() => {
  const current = form.values.status;
  const idx = FLOW_ORDER.indexOf(current);
  const cancelled = current === 'cancelado';
  return FLOW_ORDER.map((value, i) => {
    let state = 'todo';
    let caption = 'Pendente';
    if (cancelled) {
      state = 'off';
      caption = 'Pedido cancelado';
    } else if (idx >= 0 && i < idx) {
      state = 'done';
      caption = 'Concluído';
    } else if (idx >= 0 && i === idx) {
      state = 'current';
      caption = 'Etapa atual';
    }
    return { value, label: statusLabelOf(value), state, caption };
  });
});

// --- formulário ------------------------------------------------------------
const form = useForm({
  initial: { customerName: '', customerEmail: '', shippingAddress: '', trackingCode: '', status: '' },
  rules: {
    customerName: [validators.required('Informe o nome do cliente'), validators.minLen(2)],
    customerEmail: [validators.email()],
    status: [validators.required('Selecione a situação logística')],
    trackingCode: [
      validators.maxLen(40),
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

const trackingHint = computed(() => {
  const len = String(form.values.trackingCode || '').length;
  if (TRACKING_REQUIRED.includes(form.values.status)) {
    return 'Obrigatório para liberar o status atual. ' + len + '/40 caracteres.';
  }
  return 'Preencha ao despachar para o cliente acompanhar. ' + len + '/40 caracteres.';
});

// campos alterados em relação ao snapshot
const changes = computed(() =>
  Object.keys(snapshot)
    .filter((k) => String(form.values[k] ?? '') !== String(snapshot[k] ?? ''))
    .map((k) => ({
      key: k,
      label: FIELD_LABELS[k] || format.humanize(k),
      from: k === 'status' ? statusLabelOf(snapshot[k]) : String(snapshot[k] ?? ''),
      to: k === 'status' ? statusLabelOf(form.values[k]) : String(form.values[k] ?? ''),
    })),
);
const isDirty = computed(() => changes.value.length > 0);
const dirtyCount = computed(() => changes.value.length);

// --- handlers de input (CSP-safe: nada de :style/inline) -------------------
function onInput(field, event) {
  form.setField(field, event.target.value);
}
function onTrackingInput(event) {
  form.setField('trackingCode', String(event.target.value || '').toUpperCase());
}
function onStatusChange(event) {
  form.setField('status', event.target.value);
  // regra cruzada: revalida o rastreio ao mudar de status.
  form.validateField('trackingCode');
}

// --- carregamento ----------------------------------------------------------
async function load() {
  loading.value = true;
  loadError.value = null;
  order.value = null;
  if (!orderId.value) {
    loading.value = false;
    return; // sem id → empty-state
  }
  // contrato canônico: o recurso de pedidos é api.orders (resourceFactory → /v1/orders).
  // Falha controlada se o integrador não o tiver provido (não derruba em TypeError).
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
      order.value = null; // empty-state
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
  // estado limpo após hidratar
  for (const k of Object.keys(form.errors)) delete form.errors[k];
  for (const k of Object.keys(form.touched)) delete form.touched[k];
}

// --- ações -----------------------------------------------------------------
async function save() {
  if (!order.value) return;
  if (!isDirty.value) {
    toast.info('Nada para salvar — não há alterações.');
    return;
  }
  await form.handleSubmit(async (values) => {
    if (!api.orders || typeof api.orders.update !== 'function') {
      toast.error('Recurso de pedidos indisponível.');
      throw new Error('orders.update indisponível');
    }
    try {
      const payload = {
        customerName: values.customerName.trim(),
        customerEmail: values.customerEmail.trim(),
        shippingAddress: values.shippingAddress.trim(),
        trackingCode: values.trackingCode.trim(),
        status: values.status,
      };
      const r = await api.orders.update(orderId.value, payload);
      const updated = r && r.data ? r.data : r;
      order.value =
        updated && typeof updated === 'object'
          ? { ...order.value, ...updated }
          : { ...order.value, ...payload };
      // novo baseline → deixa de estar "sujo"
      for (const k of Object.keys(snapshot)) snapshot[k] = form.values[k];
      toast.success('Pedido atualizado com sucesso.');
    } catch (e) {
      toast.error('Não foi possível salvar o pedido.', {
        detail: (e && e.message) || '',
        code: e && e.status ? 'HTTP ' + e.status : '',
      });
      throw e;
    }
  });
}

async function discard() {
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
  border-radius: var(--ui-radius-pill);
  background: currentColor;
  flex-shrink: 0;
}

/* layout em 2 colunas: edição + resumo */
.oe-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 340px;
  gap: var(--ui-space-4);
  align-items: start;
}
.oe-main {
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-4);
  min-width: 0;
}
.oe-side {
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-4);
  position: sticky;
  top: var(--ui-space-4);
}

/* trilha do fluxo logístico */
.oe-flow {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: var(--ui-space-3);
}
.oe-flow-step {
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-2);
  padding-top: var(--ui-space-2);
  border-top: 3px solid rgb(var(--ui-border));
}
.oe-flow-step[data-state='done'] {
  border-top-color: rgb(var(--ui-ok));
}
.oe-flow-step[data-state='current'] {
  border-top-color: rgb(var(--ui-accent));
}
.oe-flow-step[data-state='off'] {
  border-top-color: rgb(var(--ui-danger) / 0.5);
  opacity: 0.7;
}
.oe-flow-marker {
  width: 26px;
  height: 26px;
  border-radius: var(--ui-radius-pill);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: var(--ui-text-xs);
  font-weight: 700;
  background: rgb(var(--ui-muted) / 0.16);
  color: rgb(var(--ui-muted));
}
.oe-flow-step[data-state='done'] .oe-flow-marker {
  background: rgb(var(--ui-ok) / 0.18);
  color: rgb(var(--ui-ok));
}
.oe-flow-step[data-state='current'] .oe-flow-marker {
  background: rgb(var(--ui-accent) / 0.18);
  color: rgb(var(--ui-accent-strong));
}
.oe-flow-step[data-state='off'] .oe-flow-marker {
  background: rgb(var(--ui-danger) / 0.16);
  color: rgb(var(--ui-danger));
}
.oe-flow-glyph {
  line-height: 1;
}
.oe-flow-meta {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.oe-flow-label {
  font-weight: 600;
  font-size: var(--ui-text-sm);
  color: rgb(var(--ui-fg));
}
.oe-flow-state {
  font-size: var(--ui-text-xs);
}

/* campo monoespaçado (rastreio) */
.oe-mono-input {
  letter-spacing: 0.04em;
}

/* aviso contextual (rastreio faltante) */
.oe-warn {
  display: flex;
  align-items: center;
  gap: var(--ui-space-2);
  margin: var(--ui-space-4) 0 0;
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

/* resumo lateral */
.oe-summary-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--ui-space-3);
  flex-wrap: wrap;
  width: 100%;
}
.oe-summary-eyebrow {
  margin: 0;
  font-size: var(--ui-text-xs);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  font-weight: 600;
}
.oe-summary-code {
  font-size: var(--ui-text-lg);
  font-weight: 700;
  color: rgb(var(--ui-fg));
  margin: 2px 0 0;
}
.oe-summary-badges {
  display: flex;
  gap: var(--ui-space-2);
  flex-wrap: wrap;
  justify-content: flex-end;
}
.oe-kv {
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-3);
  margin: 0;
}
.oe-kv-row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--ui-space-3);
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
  text-align: right;
}
.oe-kv-total {
  padding-bottom: var(--ui-space-3);
  border-bottom: 1px solid rgb(var(--ui-border));
}
.oe-kv-strong {
  font-weight: 700;
  font-size: var(--ui-text-lg);
}
.oe-lock {
  display: flex;
  align-items: flex-start;
  gap: var(--ui-space-2);
  margin: 0;
  font-size: var(--ui-text-xs);
  color: rgb(var(--ui-muted));
  line-height: 1.5;
}
.oe-lock-icon {
  flex-shrink: 0;
}

/* diff de alterações pendentes */
.oe-diff-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-3);
}
.oe-diff-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.oe-diff-field {
  font-size: var(--ui-text-xs);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: rgb(var(--ui-muted));
  font-weight: 600;
}
.oe-diff-vals {
  display: flex;
  align-items: center;
  gap: var(--ui-space-2);
  flex-wrap: wrap;
  font-size: var(--ui-text-sm);
}
.oe-diff-from {
  color: rgb(var(--ui-muted));
  text-decoration: line-through;
}
.oe-diff-arrow {
  color: rgb(var(--ui-accent-strong));
}
.oe-diff-to {
  color: rgb(var(--ui-fg));
  font-weight: 600;
}

@media (max-width: 980px) {
  .oe-grid {
    grid-template-columns: 1fr;
  }
  .oe-side {
    position: static;
  }
}

@media (max-width: 860px) {
  .oe-flow {
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
