<!--
  InvoiceEditView — Editar NF-e (REF-SHOPDESK-0020 / /invoices/:id/edit).
  Tela de correção de dados de uma nota rejeitada ou na DLQ antes de reenfileirar.
  A nota chega via estado da navegação (InvoiceDetailView passa o objeto em router state);
  quando api.invoices.get existir, ela será lida diretamente. Sem state e sem rota de
  leitura → empty honesto (igual InvoiceDetailView). Ação: POST /v1/invoices com total
  corrigido (api.store.emitInvoice / api.invoices.emit / api.invoices.reprocess).
  CSP-safe: sem style inline / :style / v-html; tokens --ui-*; a11y; todos os estados.
-->
<template>
  <UiPageLayout
    width="default"
    eyebrow="Nota fiscal eletrônica"
    :title="pageTitle"
    subtitle="Corrija os dados antes de reenfileirar a nota para a SEFAZ."
    :loading="loading"
    loading-message="Carregando dados da NF-e…"
    :error="loadError"
    @retry="load"
  >
    <template #actions>
      <UiButton variant="ghost" :to="backTo">Cancelar</UiButton>
      <UiButton
        variant="primary"
        :loading="submitting"
        :disabled="!canSubmit"
        @click="save"
      >Salvar e reenfileirar</UiButton>
    </template>

    <!-- banner: nota autorizada (não reprocessável) -->
    <template v-if="invoice" #banner>
      <div v-if="isAuthorized" class="ie-banner" data-tone="warning" role="alert">
        <span class="ie-banner-text">
          Esta nota já está autorizada pela SEFAZ. Edição disponível apenas para notas
          rejeitadas ou na fila morta (DLQ).
        </span>
      </div>
      <div v-else-if="isDirty" class="ie-banner" data-tone="info" role="status">
        <span class="ie-banner-text">Há alterações não salvas.</span>
      </div>
    </template>

    <!-- EMPTY: sem dados da nota -->
    <UiEmptyState
      v-if="!loading && !loadError && !invoice"
      title="NF-e não encontrada"
      :description="notFoundReason"
      icon="search"
    >
      <template #action>
        <UiButton to="/invoices">Ver todas as notas</UiButton>
      </template>
    </UiEmptyState>

    <!-- NORMAL: formulário de correção -->
    <template v-else-if="invoice">
      <form class="ie-form" novalidate @submit.prevent="save">
        <!-- Dados de identificação (somente leitura) -->
        <UiCard title="Identificação da nota" subtitle="Dados de identificação — somente leitura.">
          <template #actions>
            <UiStatusBadge :status="invoice.status" :label="statusLabel(invoice.status)" />
          </template>
          <dl class="ie-dl">
            <div class="ie-dl-row">
              <dt>Referência do pedido</dt>
              <dd class="ui-mono">{{ invoice.orderId || '—' }}</dd>
            </div>
            <div class="ie-dl-row">
              <dt>Número da nota</dt>
              <dd class="ui-mono">{{ invoice.number || '—' }}</dd>
            </div>
            <div class="ie-dl-row">
              <dt>Situação atual</dt>
              <dd><UiStatusBadge :status="invoice.status" :label="statusLabel(invoice.status)" /></dd>
            </div>
            <div v-if="invoice.rejectionReason" class="ie-dl-row">
              <dt>Motivo de rejeição</dt>
              <dd class="ie-reject" role="alert">{{ invoice.rejectionReason }}</dd>
            </div>
          </dl>
        </UiCard>

        <!-- Campos editáveis -->
        <UiCard
          title="Dados para correção"
          subtitle="Corrija os campos abaixo antes de reenfileirar a emissão."
        >
          <UiFormSection>
            <UiFormField
              label="Valor total (R$)"
              hint="Valor que será submetido à SEFAZ na próxima tentativa de emissão."
              :error="totalError"
              required
            >
              <template #default="{ id, describedBy }">
                <input
                  :id="id"
                  v-model="formTotal"
                  :aria-describedby="describedBy"
                  type="number"
                  step="0.01"
                  min="0.01"
                  inputmode="decimal"
                  autocomplete="off"
                  placeholder="0,00"
                  :disabled="isAuthorized || submitting"
                />
              </template>
            </UiFormField>
          </UiFormSection>

          <!-- aviso quando nota está autorizada -->
          <p v-if="isAuthorized" class="ie-readonly-note ui-muted">
            Nota autorizada: os campos estão bloqueados. Reprocessamento só é permitido para
            notas rejeitadas ou na DLQ.
          </p>

          <template #footer>
            <div class="ie-foot">
              <UiButton variant="ghost" :to="backTo" :disabled="submitting">Cancelar</UiButton>
              <UiButton
                variant="primary"
                type="submit"
                :loading="submitting"
                :disabled="!canSubmit"
              >Reenfileirar NF-e</UiButton>
            </div>
          </template>
        </UiCard>
      </form>
    </template>
  </UiPageLayout>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import {
  UiPageLayout,
  UiCard,
  UiStatusBadge,
  UiButton,
  UiEmptyState,
  UiFormField,
  UiFormSection,
  useToast,
  useConfirm,
  format,
} from '../ui/index.js';
import * as api from '../api.js';

const route = useRoute();
const router = useRouter();
const toast = useToast();
const confirm = useConfirm();

// ---- estado ----
const invoice = ref(null);
const loading = ref(false);
const loadError = ref('');
const unavailable = ref(false);
const submitting = ref(false);

const invoiceId = computed(() => route.params.id);

// ---- formulário ----
const formTotal = ref('');
const originalTotal = ref(null);

const isDirty = computed(() => {
  const v = Number(formTotal.value);
  return Number.isFinite(v) && v !== originalTotal.value;
});

const totalError = computed(() => {
  if (formTotal.value === '' || formTotal.value == null) return '';
  const v = Number(formTotal.value);
  if (!Number.isFinite(v) || v <= 0) return 'Informe um valor maior que zero.';
  return '';
});

// ---- rótulos do domínio NF-e ----
const STATUS_LABELS = {
  enfileirada: 'Enfileirada',
  processando: 'Processando',
  autorizada: 'Autorizada',
  rejeitada: 'Rejeitada',
  dlq: 'DLQ (falha)',
};
const STATUS_ALIASES = {
  authorized: 'autorizada',
  autorizado: 'autorizada',
  approved: 'autorizada',
  received: 'processando',
  processing: 'processando',
  queued: 'enfileirada',
  pending: 'enfileirada',
  enqueued: 'enfileirada',
  rejected: 'rejeitada',
  rejeitado: 'rejeitada',
  denied: 'rejeitada',
  failed: 'dlq',
  dead: 'dlq',
  dlq: 'dlq',
};
function normalizeStatus(status) {
  if (!status) return 'enfileirada';
  const key = String(status).toLowerCase();
  return STATUS_ALIASES[key] || key;
}
function statusLabel(status) {
  if (!status) return '—';
  const key = normalizeStatus(status);
  return STATUS_LABELS[key] || format.humanize(status);
}

const isDlq = computed(() => invoice.value && normalizeStatus(invoice.value.status) === 'dlq');
const isRejected = computed(() => invoice.value && normalizeStatus(invoice.value.status) === 'rejeitada');
const isAuthorized = computed(() => invoice.value && normalizeStatus(invoice.value.status) === 'autorizada');

const canSubmit = computed(() =>
  !submitting.value &&
  !isAuthorized.value &&
  (isDlq.value || isRejected.value) &&
  Number(formTotal.value) > 0 &&
  !totalError.value,
);

// ---- leitura da nota (nav state → api.invoices.get quando disponível) ----
function invoiceFromNavState() {
  const st = (history && history.state) || {};
  if (st && st.invoice && typeof st.invoice === 'object') return st.invoice;
  const q = route.query || {};
  if (q.orderId || q.status || q.total != null) {
    return {
      id: invoiceId.value,
      orderId: q.orderId || q.order || null,
      total: q.total != null ? Number(q.total) : null,
      status: q.status || null,
    };
  }
  return null;
}

function normalizeInvoice(raw) {
  if (!raw) return null;
  const d = raw.data ? raw.data : raw;
  return {
    id: d.id != null ? d.id : invoiceId.value,
    orderId: d.orderId || d.order_id || null,
    number: d.number || d.numero || null,
    total: d.total != null ? d.total : null,
    status: normalizeStatus(d.status),
    rejectionReason: d.rejectionReason || d.reason || d.lastError || d.last_error || null,
  };
}

async function load() {
  loading.value = true;
  loadError.value = '';
  unavailable.value = false;
  try {
    let raw = null;
    if (api.invoices && typeof api.invoices.get === 'function') {
      raw = await api.invoices.get(invoiceId.value);
    } else {
      raw = invoiceFromNavState();
      if (!raw) unavailable.value = true;
    }
    if (raw) {
      invoice.value = normalizeInvoice(raw);
      const t = invoice.value.total;
      formTotal.value = t != null ? String(t) : '';
      originalTotal.value = t != null ? t : null;
    } else {
      invoice.value = null;
    }
  } catch (e) {
    if (e && e.status === 404) {
      invoice.value = null;
    } else {
      loadError.value = (e && e.message) || 'Falha ao carregar a NF-e.';
    }
  } finally {
    loading.value = false;
  }
}

// ---- ação: salvar e reenfileirar ----
async function save() {
  if (!canSubmit.value || !invoice.value) return;
  const total = Number(formTotal.value);
  const orderId = invoice.value.orderId || invoice.value.id;
  const ok = await confirm({
    title: 'Reenfileirar NF-e',
    message:
      'Enviar a nota do pedido ' + orderId +
      ' com total ' + format.formatCurrency(total) +
      ' para a fila de emissão da SEFAZ?',
    confirmLabel: 'Reenfileirar',
    danger: false,
  });
  if (!ok) return;
  submitting.value = true;
  try {
    let r;
    if (api.invoices && typeof api.invoices.reprocess === 'function') {
      r = await api.invoices.reprocess(orderId, total);
    } else if (api.invoices && typeof api.invoices.emit === 'function') {
      r = await api.invoices.emit(orderId, total);
    } else if (api.store && typeof api.store.emitInvoice === 'function') {
      r = await api.store.emitInvoice(orderId, total);
    } else {
      throw new Error('Reenfileiramento indisponível para este recurso.');
    }
    toast.success('NF-e reenfileirada com sucesso.', {
      detail: 'Pedido ' + orderId + ' — total ' + format.formatCurrency(total) + '.',
    });
    const updated = { ...invoice.value, total, status: 'enfileirada' };
    if (r && typeof r === 'object') Object.assign(updated, r);
    router.push({
      name: 'invoice',
      params: { id: String(invoiceId.value) },
      state: { invoice: updated },
    });
  } catch (e) {
    toast.error('Falha ao reenfileirar a NF-e.', { detail: (e && e.message) || '' });
  } finally {
    submitting.value = false;
  }
}

// ---- derivados de apresentação ----
const pageTitle = computed(() => {
  if (!invoice.value) return 'Editar NF-e';
  if (invoice.value.number) return 'Editar NF-e ' + invoice.value.number;
  return 'Editar NF-e do pedido ' + (invoice.value.orderId || invoice.value.id);
});

const backTo = computed(() => '/invoices/' + invoiceId.value);

const notFoundReason = computed(() => {
  if (unavailable.value) {
    return (
      'Abra a nota a partir da lista ou da tela de detalhe para editar. ' +
      'Quando o backend expuser GET /v1/invoices/:id, esta tela carregará diretamente.'
    );
  }
  return 'Não localizamos esta NF-e. O endereço pode estar incorreto.';
});

onMounted(load);
</script>

<style scoped>
.ie-banner {
  display: flex;
  align-items: center;
  gap: var(--ui-space-3);
  padding: var(--ui-space-3) var(--ui-space-4);
  border: 1px solid rgb(var(--ui-border));
  border-left: 4px solid rgb(var(--ui-faint));
  border-radius: var(--ui-radius-lg);
  background: rgb(var(--ui-surface));
}
.ie-banner[data-tone="warning"] {
  border-left-color: rgb(var(--ui-warn));
  background: rgb(var(--ui-warn) / 0.05);
}
.ie-banner[data-tone="info"] {
  border-left-color: rgb(var(--ui-accent));
  background: rgb(var(--ui-accent) / 0.05);
}
.ie-banner-text {
  font-size: var(--ui-text-sm);
  color: rgb(var(--ui-fg));
}

.ie-form {
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-4);
}

.ie-dl {
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-2);
  margin: 0;
}
.ie-dl-row {
  display: grid;
  grid-template-columns: 180px 1fr;
  gap: var(--ui-space-3);
  align-items: baseline;
  padding-bottom: var(--ui-space-2);
  border-bottom: 1px solid rgb(var(--ui-border));
}
.ie-dl-row:last-child {
  border-bottom: none;
  padding-bottom: 0;
}
.ie-dl dt {
  color: rgb(var(--ui-muted));
  font-size: var(--ui-text-sm);
}
.ie-dl dd {
  margin: 0;
  font-weight: 500;
  word-break: break-word;
}

.ie-reject {
  color: rgb(var(--ui-danger));
  font-size: var(--ui-text-sm);
  font-weight: 500;
}

.ie-readonly-note {
  margin: var(--ui-space-3) 0 0;
  font-size: var(--ui-text-sm);
}

.ie-foot {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: var(--ui-space-2);
  flex-wrap: wrap;
}

.ui-mono {
  font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
  font-size: 0.92em;
}
.ui-muted {
  color: rgb(var(--ui-muted));
}

@media (max-width: 560px) {
  .ie-dl-row {
    grid-template-columns: 1fr;
    gap: 2px;
  }
}
</style>
