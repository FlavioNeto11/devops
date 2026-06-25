<template>
  <UiPageLayout
    eyebrow="Transações Financeiras"
    :title="pageTitle"
    subtitle="Detalhe da transação — auditoria financeira e suporte."
    width="default"
    :loading="loadingTx"
    :error="errorTx"
    @retry="loadAll"
  >
    <template #actions>
      <UiButton variant="ghost" to="/payment-transactions">
        ← Voltar às transações
      </UiButton>
      <UiButton
        v-if="tx && tx.status !== 'paid'"
        :loading="markingPaid"
        :disabled="markingPaid"
        @click="markAsPaid"
      >
        Marcar como Pago
      </UiButton>
    </template>

    <!-- ─── Estado 404: transação não encontrada ─── -->
    <template v-if="notFound">
      <div class="not-found-state" role="alert">
        <p class="not-found-code" aria-hidden="true">404</p>
        <p class="not-found-title">Transação não encontrada</p>
        <p class="not-found-desc">O ID informado não corresponde a nenhuma transação registrada.</p>
        <UiButton variant="ghost" to="/payment-transactions">← Voltar à lista de transações</UiButton>
      </div>
    </template>

    <!-- ─── Corpo principal ─── -->
    <template v-else-if="tx">
      <!-- ── Cabeçalho da transação ── -->
      <UiCard title="Resumo da Transação">
        <template #actions>
          <UiStatusBadge :status="tx.status" size="lg" with-dot />
        </template>

        <dl class="detail-grid">
          <!-- Valor -->
          <div class="detail-item detail-item--highlight">
            <dt class="detail-label">Valor</dt>
            <dd class="detail-value detail-value--amount">{{ formatAmount(tx.amount_cents, tx.currency) }}</dd>
          </div>

          <!-- Paciente -->
          <div v-if="tx.patient_id || tx.patient_name" class="detail-item">
            <dt class="detail-label">Paciente</dt>
            <dd class="detail-value">
              <span v-if="loadingPatient" class="patient-loading" aria-busy="true">Carregando…</span>
              <span v-else-if="displayPatientName">{{ displayPatientName }}</span>
              <span v-else class="detail-value--mono">{{ tx.patient_id }}</span>
            </dd>
          </div>

          <!-- Moeda -->
          <div class="detail-item">
            <dt class="detail-label">Moeda</dt>
            <dd class="detail-value">
              <span class="currency-pill" :data-currency="tx.currency">{{ tx.currency || '—' }}</span>
            </dd>
          </div>

          <!-- Método de pagamento -->
          <div class="detail-item">
            <dt class="detail-label">Método de Pagamento</dt>
            <dd class="detail-value">{{ paymentMethodLabel(tx.payment_method, tx.gateway_provider || tx.gateway) }}</dd>
          </div>

          <!-- Gateway -->
          <div class="detail-item">
            <dt class="detail-label">Gateway de Pagamento</dt>
            <dd class="detail-value">
              <span class="gateway-badge" :data-gateway="tx.gateway_provider || tx.gateway">
                <span class="gateway-dot" aria-hidden="true"></span>
                {{ gatewayLabel(tx.gateway_provider || tx.gateway) }}
              </span>
            </dd>
          </div>

          <!-- Tipo de evento -->
          <div class="detail-item">
            <dt class="detail-label">Tipo de Evento</dt>
            <dd class="detail-value detail-value--mono">{{ tx.event_type || '—' }}</dd>
          </div>

          <!-- ID externo -->
          <div class="detail-item">
            <dt class="detail-label">ID Externo (gateway)</dt>
            <dd class="detail-value detail-value--mono detail-value--copyable">
              <span class="copy-target">{{ tx.external_id || '—' }}</span>
              <button
                v-if="tx.external_id"
                type="button"
                class="copy-btn"
                :aria-label="'Copiar ID externo: ' + tx.external_id"
                :data-copied="copiedField === 'external_id'"
                @click="copyToClipboard(tx.external_id, 'external_id')"
              >
                <span aria-hidden="true">{{ copiedField === 'external_id' ? '✓' : '⎘' }}</span>
              </button>
            </dd>
          </div>

          <!-- ID interno -->
          <div class="detail-item">
            <dt class="detail-label">ID da Transação (interno)</dt>
            <dd class="detail-value detail-value--mono detail-value--copyable">
              <span class="copy-target">{{ tx.id || '—' }}</span>
              <button
                v-if="tx.id"
                type="button"
                class="copy-btn"
                :aria-label="'Copiar ID: ' + tx.id"
                :data-copied="copiedField === 'id'"
                @click="copyToClipboard(tx.id, 'id')"
              >
                <span aria-hidden="true">{{ copiedField === 'id' ? '✓' : '⎘' }}</span>
              </button>
            </dd>
          </div>

          <!-- Registrado em -->
          <div class="detail-item">
            <dt class="detail-label">Registrado em</dt>
            <dd class="detail-value">{{ formatDatetime(tx.created_at) }}</dd>
          </div>

          <!-- Observações -->
          <div v-if="txNotes" class="detail-item detail-item--full">
            <dt class="detail-label">Observações</dt>
            <dd class="detail-value detail-value--notes">{{ txNotes }}</dd>
          </div>
        </dl>
      </UiCard>

      <!-- ── Card da consulta vinculada ── -->
      <UiCard
        v-if="tx.consultation_id"
        title="Consulta Vinculada"
        subtitle="Agendamento associado a esta transação."
      >
        <template #actions>
          <UiButton
            variant="subtle"
            :to="'/consultations/' + tx.consultation_id"
            aria-label="Abrir detalhe da consulta vinculada"
          >
            Ver consulta
          </UiButton>
        </template>

        <!-- Estado de loading da consulta -->
        <div v-if="loadingConsultation" class="consultation-loading" aria-busy="true" aria-label="Carregando consulta…">
          <div class="skeleton-line skeleton-line--wide"></div>
          <div class="skeleton-line skeleton-line--medium"></div>
          <div class="skeleton-line skeleton-line--narrow"></div>
        </div>

        <!-- Estado de erro da consulta -->
        <div v-else-if="errorConsultation" class="consultation-error" role="alert">
          <span class="error-icon" aria-hidden="true">⚠</span>
          <span>Não foi possível carregar os dados da consulta.</span>
          <button type="button" class="retry-link" @click="loadConsultation(tx.consultation_id)">Tentar novamente</button>
        </div>

        <!-- Dados da consulta -->
        <dl v-else-if="consultation" class="detail-grid detail-grid--compact">
          <div v-if="consultation.id" class="detail-item">
            <dt class="detail-label">ID da Consulta</dt>
            <dd class="detail-value detail-value--mono">{{ consultation.id }}</dd>
          </div>
          <div v-if="consultation.status" class="detail-item">
            <dt class="detail-label">Status</dt>
            <dd class="detail-value">
              <UiStatusBadge :status="consultation.status" with-dot />
            </dd>
          </div>
          <div v-if="consultation.professional_id" class="detail-item">
            <dt class="detail-label">Profissional (ID)</dt>
            <dd class="detail-value detail-value--mono">{{ consultation.professional_id }}</dd>
          </div>
          <div v-if="consultation.patient_id" class="detail-item">
            <dt class="detail-label">Paciente (ID)</dt>
            <dd class="detail-value detail-value--mono">{{ consultation.patient_id }}</dd>
          </div>
          <div v-if="consultation.scheduled_at || consultation.date" class="detail-item">
            <dt class="detail-label">Data/hora agendada</dt>
            <dd class="detail-value">{{ formatDatetime(consultation.scheduled_at || consultation.date) }}</dd>
          </div>
          <div v-if="consultation.notes" class="detail-item detail-item--full">
            <dt class="detail-label">Observações</dt>
            <dd class="detail-value">{{ consultation.notes }}</dd>
          </div>
        </dl>

        <!-- Fallback: ID sem dados -->
        <div v-else class="consultation-id-only">
          <span class="detail-label">ID do Agendamento:</span>
          <span class="detail-value detail-value--mono">{{ tx.consultation_id }}</span>
        </div>
      </UiCard>

      <!-- ── Evento do Gateway — apenas campos não duplicados + payload bruto ── -->
      <UiCard title="Evento do Gateway" subtitle="Identificação do evento e payload bruto recebido do gateway.">
        <!-- Campos de identificação do evento (não duplicam o Resumo) -->
        <div v-if="tx.event_type || tx.external_id" class="metadata-section">
          <div v-if="tx.event_type" class="metadata-row">
            <span class="metadata-key">event_type</span>
            <span class="metadata-val">{{ tx.event_type }}</span>
          </div>
          <div v-if="tx.external_id" class="metadata-row">
            <span class="metadata-key">external_id</span>
            <span class="metadata-val metadata-val--mono">{{ tx.external_id }}</span>
          </div>
        </div>

        <!-- Payload bruto (quando disponível) -->
        <div v-if="tx.raw_payload" class="raw-payload-section">
          <p class="raw-payload-label">Payload bruto</p>
          <pre class="raw-payload">{{ formatRawPayload(tx.raw_payload) }}</pre>
        </div>

        <!-- Empty state quando nenhum dado de evento está disponível -->
        <UiEmptyState
          v-if="!tx.event_type && !tx.external_id && !tx.raw_payload"
          title="Sem dados de evento"
          description="Nenhum dado de evento disponível para esta transação."
        />
      </UiCard>
    </template>

    <!-- ─── Estado vazio fallback ─── -->
    <template v-else-if="!loadingTx && !errorTx && !notFound">
      <UiEmptyState
        title="Transação não encontrada"
        description="O ID informado não corresponde a nenhuma transação registrada."
      />
    </template>
  </UiPageLayout>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import {
  UiPageLayout,
  UiCard,
  UiButton,
  UiStatusBadge,
  UiEmptyState,
  useToast,
} from '../ui/index.js';
import { paymentTransactions, patients, consultations } from '../api.js';

const route = useRoute();
const toast = useToast();

// ── Estado da transação ──
const tx = ref(null);
const loadingTx = ref(false);
const errorTx = ref(null);
const notFound = ref(false);

// ── Estado do paciente (lazy) ──
const patientData = ref(null);
const loadingPatient = ref(false);
const errorPatient = ref(false);

// ── Estado da consulta vinculada ──
const consultation = ref(null);
const loadingConsultation = ref(false);
const errorConsultation = ref(null);

// ── UI state ──
const copiedField = ref(null);
const markingPaid = ref(false);

const pageTitle = computed(() => {
  if (!tx.value) return 'Detalhe da Transação';
  const id = tx.value.id || route.params.id;
  const short = String(id).slice(0, 8);
  return 'Transação #' + short;
});

const displayPatientName = computed(() => {
  if (tx.value && tx.value.patient_name) return tx.value.patient_name;
  if (patientData.value) return patientData.value.full_name || patientData.value.name || null;
  return null;
});

const txNotes = computed(() => {
  if (!tx.value) return null;
  return tx.value.notes || (tx.value.metadata && tx.value.metadata.notes) || null;
});

// ── Formatters ──
function formatAmount(cents, currency) {
  if (cents == null) return '—';
  const value = cents / 100;
  const locale = currency === 'USD' ? 'en-US' : 'pt-BR';
  const curr = currency || 'BRL';
  try {
    return new Intl.NumberFormat(locale, { style: 'currency', currency: curr }).format(value);
  } catch {
    return curr + ' ' + value.toFixed(2);
  }
}

function formatDatetime(raw) {
  if (!raw) return '—';
  try {
    return new Intl.DateTimeFormat('pt-BR', {
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit',
      timeZone: 'America/Sao_Paulo',
    }).format(new Date(raw));
  } catch {
    return raw;
  }
}

function paymentMethodLabel(method, gateway) {
  const map = {
    credit_card: 'Cartão de Crédito',
    debit_card: 'Cartão de Débito',
    pix: 'Pix',
    boleto: 'Boleto',
    bank_transfer: 'Transferência Bancária',
    cash: 'Dinheiro',
    manual: 'Manual',
  };
  return map[method] || method || gatewayLabel(gateway) || '—';
}

function gatewayLabel(gw) {
  const map = { stripe: 'Stripe', pagseguro: 'PagSeguro', pagarme: 'Pagar.me', mercadopago: 'Mercado Pago', sandbox: 'Sandbox', manual: 'Manual' };
  return map[gw] || gw || '—';
}

function formatRawPayload(payload) {
  if (!payload) return '';
  if (typeof payload === 'string') {
    try { return JSON.stringify(JSON.parse(payload), null, 2); } catch { return payload; }
  }
  try { return JSON.stringify(payload, null, 2); } catch { return String(payload); }
}

// ── Copiar para clipboard ──
function copyToClipboard(text, field) {
  if (!text) return;
  navigator.clipboard.writeText(text).then(() => {
    copiedField.value = field;
    toast.success('Copiado para a área de transferência.');
    setTimeout(() => { copiedField.value = null; }, 2000);
  }).catch(() => {
    toast.error('Não foi possível copiar.');
  });
}

// ── Marcar como Pago ──
async function markAsPaid() {
  if (!tx.value || tx.value.status === 'paid') return;
  markingPaid.value = true;
  try {
    const updated = await paymentTransactions.update(route.params.id, { status: 'paid' });
    const data = updated && updated.data ? updated.data : updated;
    tx.value.status = (data && data.status) || 'paid';
    toast.success('Transação marcada como paga.');
  } catch (err) {
    toast.error((err && err.message) || 'Erro ao atualizar o status.');
  } finally {
    markingPaid.value = false;
  }
}

// ── Carregamento ──
async function loadPatient(id) {
  if (!id) return;
  loadingPatient.value = true;
  errorPatient.value = false;
  try {
    const data = await patients.get(id);
    patientData.value = data && data.data ? data.data : data;
  } catch {
    errorPatient.value = true;
  } finally {
    loadingPatient.value = false;
  }
}

async function loadTransaction(id) {
  loadingTx.value = true;
  errorTx.value = null;
  notFound.value = false;
  tx.value = null;
  try {
    const data = await paymentTransactions.get(id);
    tx.value = data && data.data ? data.data : data;
    // Carrega paciente se nome não vier na resposta
    if (tx.value && tx.value.patient_id && !tx.value.patient_name) {
      loadPatient(tx.value.patient_id);
    }
    // Carrega consulta vinculada se existir
    if (tx.value && tx.value.consultation_id) {
      loadConsultation(tx.value.consultation_id);
    }
  } catch (err) {
    if (err && err.status === 404) {
      notFound.value = true;
    } else {
      errorTx.value = (err && err.message) || 'Erro ao carregar a transação.';
      toast.error(errorTx.value);
    }
  } finally {
    loadingTx.value = false;
  }
}

async function loadConsultation(id) {
  if (!id) return;
  loadingConsultation.value = true;
  errorConsultation.value = null;
  try {
    const data = await consultations.get(id);
    consultation.value = data && data.data ? data.data : data;
  } catch {
    errorConsultation.value = 'Erro ao carregar a consulta.';
  } finally {
    loadingConsultation.value = false;
  }
}

function loadAll() {
  const id = route.params.id;
  if (id) loadTransaction(id);
}

onMounted(loadAll);
</script>

<style scoped>
/* ── Grade de detalhes ── */
.detail-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: var(--ui-space-4) var(--ui-space-6);
  padding: 0;
  margin: 0;
}

.detail-grid--compact {
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: var(--ui-space-3) var(--ui-space-5);
}

.detail-item {
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-1);
}

.detail-item--highlight {
  grid-column: span 2;
}

.detail-item--full {
  grid-column: 1 / -1;
}

.detail-label {
  font-size: var(--ui-text-xs);
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: rgb(var(--ui-muted));
}

.detail-value {
  font-size: var(--ui-text-sm);
  color: rgb(var(--ui-fg));
  font-weight: 500;
}

.detail-value--amount {
  font-size: 1.75rem;
  font-weight: 700;
  letter-spacing: -0.02em;
  color: rgb(var(--ui-fg));
  line-height: 1.1;
}

.detail-value--mono {
  font-family: var(--ui-font-mono, 'Menlo', 'Consolas', monospace);
  font-size: var(--ui-text-xs);
  background: rgb(var(--ui-surface-2));
  border: 1px solid rgb(var(--ui-border));
  border-radius: var(--ui-radius-sm);
  padding: 2px 7px;
  display: inline-block;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.detail-value--copyable {
  display: flex;
  align-items: center;
  gap: var(--ui-space-2);
}

.detail-value--notes {
  white-space: pre-wrap;
  word-break: break-word;
}

/* ── Botão copiar ── */
.copy-btn {
  flex-shrink: 0;
  background: none;
  border: 1px solid rgb(var(--ui-border));
  border-radius: var(--ui-radius-sm);
  padding: 2px 7px;
  cursor: pointer;
  font-size: var(--ui-text-xs);
  color: rgb(var(--ui-muted));
  transition: background 0.15s, color 0.15s, border-color 0.15s;
  line-height: 1.4;
}

.copy-btn:hover,
.copy-btn:focus-visible {
  background: rgb(var(--ui-accent) / 0.1);
  color: rgb(var(--ui-accent-strong));
  border-color: rgb(var(--ui-accent) / 0.4);
  outline: none;
}

.copy-btn[data-copied="true"] {
  background: rgb(var(--ui-ok) / 0.12);
  color: rgb(var(--ui-ok));
  border-color: rgb(var(--ui-ok) / 0.3);
}

/* ── Currency pill ── */
.currency-pill {
  display: inline-flex;
  align-items: center;
  font-size: var(--ui-text-xs);
  font-weight: 700;
  padding: 2px 10px;
  border-radius: var(--ui-radius-pill);
  background: rgb(var(--ui-accent) / 0.12);
  color: rgb(var(--ui-accent-strong));
  letter-spacing: 0.05em;
}

/* ── Gateway badge ── */
.gateway-badge {
  display: inline-flex;
  align-items: center;
  gap: var(--ui-space-2);
  font-size: var(--ui-text-sm);
  font-weight: 600;
  color: rgb(var(--ui-fg));
}

.gateway-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: rgb(var(--ui-muted));
  flex-shrink: 0;
}

.gateway-badge[data-gateway="stripe"] .gateway-dot {
  background: rgb(var(--ui-gateway-stripe));
}

.gateway-badge[data-gateway="pagseguro"] .gateway-dot {
  background: rgb(var(--ui-gateway-pagseguro));
}

/* ── Loading do paciente ── */
.patient-loading {
  font-size: var(--ui-text-sm);
  color: rgb(var(--ui-muted));
  font-style: italic;
}

/* ── Metadados ── */
.metadata-section {
  display: flex;
  flex-direction: column;
  gap: 0;
  border: 1px solid rgb(var(--ui-border));
  border-radius: var(--ui-radius-md);
  overflow: hidden;
}

.metadata-row {
  display: flex;
  align-items: baseline;
  gap: var(--ui-space-4);
  padding: var(--ui-space-2) var(--ui-space-4);
  border-bottom: 1px solid rgb(var(--ui-border));
}

.metadata-row:last-child {
  border-bottom: none;
}

.metadata-row:nth-child(odd) {
  background: rgb(var(--ui-surface-2) / 0.5);
}

.metadata-key {
  font-family: var(--ui-font-mono, 'Menlo', 'Consolas', monospace);
  font-size: var(--ui-text-xs);
  font-weight: 600;
  color: rgb(var(--ui-accent-strong));
  min-width: 120px;
  flex-shrink: 0;
}

.metadata-val {
  font-size: var(--ui-text-sm);
  color: rgb(var(--ui-fg));
  word-break: break-all;
}

.metadata-val--mono {
  font-family: var(--ui-font-mono, 'Menlo', 'Consolas', monospace);
  font-size: var(--ui-text-xs);
  color: rgb(var(--ui-muted));
}

/* ── Loading skeleton da consulta ── */
.consultation-loading {
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-3);
  padding: var(--ui-space-2) 0;
}

.skeleton-line {
  height: 14px;
  border-radius: var(--ui-radius-sm);
  background: linear-gradient(90deg, rgb(var(--ui-border)) 25%, rgb(var(--ui-surface-2)) 50%, rgb(var(--ui-border)) 75%);
  background-size: 200% 100%;
  animation: skeleton-shimmer 1.4s infinite;
}

.skeleton-line--wide { width: 75%; }
.skeleton-line--medium { width: 55%; }
.skeleton-line--narrow { width: 35%; }

@keyframes skeleton-shimmer {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}

/* ── Erro consulta ── */
.consultation-error {
  display: flex;
  align-items: center;
  gap: var(--ui-space-3);
  padding: var(--ui-space-3) var(--ui-space-4);
  background: rgb(var(--ui-danger) / 0.06);
  border: 1px solid rgb(var(--ui-danger) / 0.2);
  border-radius: var(--ui-radius-md);
  font-size: var(--ui-text-sm);
  color: rgb(var(--ui-danger));
}

.error-icon {
  font-size: var(--ui-text-base);
  flex-shrink: 0;
}

.retry-link {
  background: none;
  border: none;
  padding: 0;
  cursor: pointer;
  font-size: var(--ui-text-sm);
  color: rgb(var(--ui-accent-strong));
  font-weight: 600;
  text-decoration: underline;
  margin-left: auto;
}

.retry-link:hover,
.retry-link:focus-visible {
  color: rgb(var(--ui-fg));
  outline: none;
}

/* ── Fallback ID-only ── */
.consultation-id-only {
  display: flex;
  align-items: center;
  gap: var(--ui-space-3);
  font-size: var(--ui-text-sm);
  color: rgb(var(--ui-muted));
}

/* ── Payload bruto do gateway ── */
.raw-payload-section {
  margin-top: var(--ui-space-4);
}

.raw-payload-label {
  font-size: var(--ui-text-xs);
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: rgb(var(--ui-muted));
  margin: 0 0 var(--ui-space-2) 0;
}

.raw-payload {
  font-family: var(--ui-font-mono, 'Menlo', 'Consolas', monospace);
  font-size: var(--ui-text-xs);
  color: rgb(var(--ui-fg));
  background: rgb(var(--ui-surface-2));
  border: 1px solid rgb(var(--ui-border));
  border-radius: var(--ui-radius-md);
  padding: var(--ui-space-3) var(--ui-space-4);
  overflow: auto;
  max-height: 320px;
  white-space: pre;
  word-break: normal;
  margin: 0;
  line-height: 1.55;
}

/* ── Estado 404 ── */
.not-found-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--ui-space-3);
  padding: var(--ui-space-12) var(--ui-space-6);
  text-align: center;
}

.not-found-code {
  font-size: 4rem;
  font-weight: 800;
  letter-spacing: -0.04em;
  color: rgb(var(--ui-border));
  line-height: 1;
  margin: 0;
}

.not-found-title {
  font-size: var(--ui-text-lg);
  font-weight: 600;
  color: rgb(var(--ui-fg));
  margin: 0;
}

.not-found-desc {
  font-size: var(--ui-text-sm);
  color: rgb(var(--ui-muted));
  margin: 0;
  max-width: 380px;
}

/* ── Responsivo ≤860px ── */
@media (max-width: 860px) {
  .detail-grid {
    grid-template-columns: 1fr;
  }

  .detail-item--highlight {
    grid-column: span 1;
  }

  .detail-value--amount {
    font-size: 1.4rem;
  }

  .metadata-key {
    min-width: 90px;
  }
}
</style>
