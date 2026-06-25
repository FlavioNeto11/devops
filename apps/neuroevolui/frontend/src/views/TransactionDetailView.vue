<!--
  TransactionDetailView — Detalhe da transação de pagamento (REQ-NEUROEVOLUI-0005).
  Mostra gateway, ID externo, valor, consulta vinculada, metadados e a TRILHA DE
  AUDITORIA do pagamento (cobrança + webhooks recebidos).

  Só endpoints REAIS (via ../api.js → resourceFactory):
    GET /v1/payment-transactions/:id   → registro da transação
    GET /v1/consultations/:id          → consulta vinculada (best-effort, fail-soft)
    GET /v1/audit?entity_id=&limit=    → trilha (payment.charged + webhooks)

  Relação de auditoria (ver backend):
    • payment.charged  → entity_type=payment, entity_id=<gateway_transaction_id>
    • webhook events   → entity_type=webhook, metadata.transactionId=<gateway_transaction_id>

  Kit-only (../ui/index.js) + tokens --ui-* + CSP-safe (sem style inline / v-html).
  Estados: loading (skeleton) · empty (CTA p/ domínio) · error (retry) · normal.
-->
<template>
  <UiPageLayout
    eyebrow="NeuroEvolui · Pagamentos"
    :title="pageTitle"
    :subtitle="pageSubtitle"
    width="wide"
    :loading="loading"
    :error="pageError"
    @retry="loadTransaction"
  >
    <!-- Ações do cabeçalho -->
    <template #actions>
      <UiButton variant="ghost" to="/transactions">Voltar</UiButton>
      <UiButton variant="subtle" :loading="refreshing" @click="refreshAll">Atualizar</UiButton>
      <UiButton v-if="consultationHref" :to="consultationHref">Ver agendamento</UiButton>
    </template>

    <!-- Banner de situação (cor nunca é o único sinal: sempre há texto) -->
    <template v-if="tx" #banner>
      <div class="td-banner" :data-tone="statusTone" role="status">
        <span class="td-banner-dot" aria-hidden="true" />
        <span class="td-banner-text">
          <strong>{{ statusText }}</strong>
          <span>{{ bannerMessage }}</span>
        </span>
        <UiStatusBadge :status="tx.status || 'pending'" :tone="statusTone" :label="statusText" size="lg" />
      </div>
    </template>

    <!-- Resumo / métricas -->
    <section class="td-metrics" aria-label="Resumo da transação">
      <UiMetricCard
        label="Valor"
        :value="loading ? null : amountLabel"
        :loading="loading"
        tone="primary"
        hint="Valor processado"
      />
      <UiMetricCard
        label="Situação"
        :value="loading ? null : statusText"
        :loading="loading"
        :tone="statusTone"
        hint="Status do pagamento"
      />
      <UiMetricCard
        label="Gateway"
        :value="loading ? null : gatewayLabel"
        :loading="loading"
        tone="neutral"
        hint="Provedor de pagamento"
      />
      <UiMetricCard
        label="Eventos"
        :value="loading ? null : auditCountLabel"
        :loading="loading"
        tone="neutral"
        hint="Trilha de auditoria"
      />
    </section>

    <div class="td-grid">
      <!-- Dados da transação -->
      <UiCard title="Transação" subtitle="Identificadores, valor e situação do pagamento.">
        <template #actions>
          <UiStatusBadge :status="tx && tx.status || 'pending'" :tone="statusTone" :label="statusText" size="lg" />
        </template>
        <dl class="td-kv">
          <div>
            <dt>ID interno</dt>
            <dd class="td-mono">{{ display(tx && tx.id) }}</dd>
          </div>
          <div>
            <dt>Gateway</dt>
            <dd>{{ gatewayLabel }}</dd>
          </div>
          <div>
            <dt>ID no gateway</dt>
            <dd class="td-ext">
              <span class="td-mono td-ellipsis">{{ display(gatewayTxId) }}</span>
              <UiButton
                v-if="gatewayTxId"
                variant="ghost"
                size="sm"
                aria-label="Copiar ID no gateway"
                @click="copy(gatewayTxId, 'ID no gateway')"
              >Copiar</UiButton>
            </dd>
          </div>
          <div>
            <dt>Chave de idempotência</dt>
            <dd class="td-ext">
              <span class="td-mono td-ellipsis">{{ display(tx && tx.idempotency_key) }}</span>
              <UiButton
                v-if="tx && tx.idempotency_key"
                variant="ghost"
                size="sm"
                aria-label="Copiar chave de idempotência"
                @click="copy(tx.idempotency_key, 'Chave de idempotência')"
              >Copiar</UiButton>
            </dd>
          </div>
          <div>
            <dt>Valor</dt>
            <dd class="td-amount">{{ amountLabel }}</dd>
          </div>
          <div>
            <dt>Moeda</dt>
            <dd>{{ display(tx && tx.currency || 'BRL') }}</dd>
          </div>
          <div>
            <dt>Situação</dt>
            <dd><UiStatusBadge :status="tx && tx.status || 'pending'" :tone="statusTone" :label="statusText" /></dd>
          </div>
          <div>
            <dt>Registrada por</dt>
            <dd>{{ display(tx && tx.created_by) }}</dd>
          </div>
          <div>
            <dt>Criada em</dt>
            <dd>{{ fmt.formatDateTime(tx && tx.created_at) }}</dd>
          </div>
        </dl>
      </UiCard>

      <!-- Consulta vinculada -->
      <UiCard title="Consulta vinculada" subtitle="Agendamento ao qual este pagamento pertence.">
        <template #actions>
          <UiButton v-if="consultationHref" variant="ghost" size="sm" :to="consultationHref">Abrir</UiButton>
        </template>

        <div v-if="!consultationId" class="td-pad">
          <UiEmptyState
            icon="link"
            title="Sem agendamento vinculado"
            description="Esta transação não está associada a uma consulta."
          />
        </div>

        <template v-else>
          <UiLoadingState v-if="consultLoading" variant="skeleton" :skeleton-lines="4" />
          <div v-else-if="consultError" class="td-pad">
            <UiErrorState :message="consultError" @retry="loadConsultation" />
          </div>
          <dl v-else class="td-kv">
            <div>
              <dt>Agendamento</dt>
              <dd class="td-mono">#{{ display(consultationId) }}</dd>
            </div>
            <div>
              <dt>Paciente</dt>
              <dd>
                <RouterLink v-if="patientHref" class="td-link" :to="patientHref">{{ patientLabel }}</RouterLink>
                <span v-else>{{ patientLabel }}</span>
              </dd>
            </div>
            <div>
              <dt>Profissional</dt>
              <dd>
                <RouterLink v-if="professionalHref" class="td-link" :to="professionalHref">{{ professionalLabel }}</RouterLink>
                <span v-else>{{ professionalLabel }}</span>
              </dd>
            </div>
            <div>
              <dt>Agendada para</dt>
              <dd>{{ fmt.formatDateTime(consultation.scheduled_at) }}</dd>
            </div>
            <div>
              <dt>Situação da consulta</dt>
              <dd><UiStatusBadge :status="consultation.status || 'scheduled'" /></dd>
            </div>
            <div>
              <dt>Pagamento da consulta</dt>
              <dd><UiStatusBadge :status="consultation.payment_status || 'pending'" /></dd>
            </div>
          </dl>
        </template>

        <template v-if="consultationHref" #footer>
          <div class="td-foot-actions">
            <UiButton variant="ghost" size="sm" :to="consultationHref">Ver agendamento</UiButton>
            <UiButton v-if="patientHref" variant="ghost" size="sm" :to="patientHref">Ver paciente</UiButton>
          </div>
        </template>
      </UiCard>
    </div>

    <!-- Metadados do gateway -->
    <UiCard title="Metadados" subtitle="Dados extras retornados pelo gateway no processamento.">
      <UiEmptyState
        v-if="!metadataRows.length"
        icon="doc"
        title="Sem metadados"
        description="Esta transação não trouxe metadados do gateway."
      />
      <dl v-else class="td-kv td-kv-3">
        <div v-for="m in metadataRows" :key="m.key">
          <dt>{{ m.label }}</dt>
          <dd class="td-meta-val" :class="{ 'td-mono': m.mono }">{{ m.value }}</dd>
        </div>
      </dl>
    </UiCard>

    <!-- Trilha de auditoria (cobrança + webhooks recebidos) -->
    <UiCard title="Trilha de auditoria" subtitle="Cobrança e webhooks recebidos para este pagamento.">
      <template #actions>
        <UiButton variant="ghost" size="sm" :loading="auditLoading" @click="loadAudit">Atualizar</UiButton>
      </template>
      <section aria-label="Trilha de auditoria do pagamento">
        <!-- Aviso de truncamento: o lote voltou no teto → eventos mais antigos podem ter ficado de fora. -->
        <p v-if="auditTruncated" class="td-warn" role="status">
          <span class="td-warn-dot" aria-hidden="true" />
          A trilha pode estar incompleta — só os eventos mais recentes foram carregados.
        </p>
        <UiDataTable
          :columns="auditColumns"
          :rows="auditRows"
          :loading="auditLoading"
          :error="auditError"
          row-key="_key"
          density="compact"
          :empty="auditEmpty"
          @retry="loadAudit"
        >
        <template #cell-created_at="{ value }">{{ fmt.formatDateTime(value) }}</template>
        <template #cell-entity_type="{ value }">{{ entityTypeLabel(value) }}</template>
        <template #cell-action="{ row }">
          <span class="td-action">
            <span class="td-action-dot" :data-tone="eventTone(row)" aria-hidden="true" />
            {{ actionLabel(row.action) }}
          </span>
        </template>
        <template #cell-payment_status="{ value }">
          <UiStatusBadge v-if="value" :status="value" />
          <span v-else>—</span>
        </template>
        <template #cell-actor="{ value }">{{ display(value) }}</template>
        <template #empty-action>
          <UiButton v-if="consultationHref" variant="subtle" size="sm" :to="consultationHref">Ver agendamento</UiButton>
        </template>
        </UiDataTable>
      </section>
    </UiCard>

    <template #footer>
      <span>Transação #{{ display(id) }} — leitura da trilha de pagamentos do tenant.</span>
    </template>
  </UiPageLayout>
</template>

<script setup>
import { ref, computed, watch, onMounted } from 'vue';
import { RouterLink } from 'vue-router';
import {
  UiPageLayout, UiCard, UiMetricCard, UiStatusBadge, UiDataTable, UiButton,
  UiEmptyState, UiLoadingState, UiErrorState,
  useToast, format as fmt,
} from '../ui/index.js';
import { resourceFactory } from '../api.js';

const props = defineProps({ id: { type: [String, Number], required: true } });
const toast = useToast();

// ── Clientes de recurso (só endpoints REAIS) ────────────────────────────────────
//   payment-transactions / consultations / audit têm hífen ou query params → usamos
//   resourceFactory diretamente (monta /v1/<name>) em vez de identificadores JS.
const transactionsApi = resourceFactory('payment-transactions');
const consultationsApi = resourceFactory('consultations');
const auditApi = resourceFactory('audit');

// ── Estado: transação ───────────────────────────────────────────────────────────
const loading = ref(true);
const error = ref(null);
const tx = ref(null);

// ── Estado: consulta vinculada ──────────────────────────────────────────────────
const consultation = ref({});
const consultLoading = ref(false);
const consultError = ref(null);

// ── Estado: trilha de auditoria ─────────────────────────────────────────────────
const audit = ref([]);
const auditLoading = ref(false);
const auditError = ref(null);
// Verdadeiro quando algum lote da trilha voltou EXATAMENTE no teto → há eventos
// mais antigos que ficaram de fora (a busca não filtra por transação no servidor).
const auditTruncated = ref(false);

// Teto de eventos por lote da trilha. Como /v1/audit não filtra por transação no
// servidor, buscamos um lote amplo e filtramos no cliente; se o lote vier cheio,
// sinalizamos truncamento ao usuário (ver auditTruncated).
const AUDIT_LIMIT = 200;

const refreshing = ref(false);

const display = (v) => (v === null || v === undefined || v === '' ? '—' : String(v));
const unwrap = (res) => (res && typeof res === 'object' ? (res.data && typeof res.data === 'object' && !Array.isArray(res.data) ? res.data : res) : {});

// ── Rótulos de status (pt-BR; cor nunca é o único sinal) ─────────────────────────
const STATUS_LABELS = {
  pending: 'Pendente',
  authorized: 'Autorizada',
  succeeded: 'Concluída',
  paid: 'Paga',
  failed: 'Falhou',
  refunded: 'Reembolsada',
  canceled: 'Cancelada',
  cancelled: 'Cancelada',
};
const STATUS_TONES = {
  pending: 'warning',
  authorized: 'success',
  succeeded: 'success',
  paid: 'success',
  failed: 'error',
  refunded: 'neutral',
  canceled: 'error',
  cancelled: 'error',
};
const norm = (v) => String(v || '').toLowerCase().trim();
const statusText = computed(() => STATUS_LABELS[norm(tx.value && tx.value.status)] || (tx.value && tx.value.status ? fmt.humanize(tx.value.status) : 'Pendente'));
const statusTone = computed(() => STATUS_TONES[norm(tx.value && tx.value.status)] || 'neutral');
const bannerMessage = computed(() => {
  const s = norm(tx.value && tx.value.status);
  if (s === 'failed') return ' — o pagamento não foi concluído. Consulte os webhooks abaixo.';
  if (s === 'refunded') return ' — o valor foi devolvido ao paciente.';
  if (s === 'pending') return ' — aguardando confirmação do gateway.';
  if (s === 'succeeded' || s === 'paid' || s === 'authorized') return ' — pagamento confirmado pelo gateway.';
  return ' — situação atual desta transação.';
});

// ── Derivados da transação ───────────────────────────────────────────────────────
const gatewayLabel = computed(() => {
  const g = tx.value && (tx.value.gateway_provider || tx.value.gateway);
  return g ? fmt.humanize(g) : '—';
});
const gatewayTxId = computed(() => (tx.value && (tx.value.gateway_transaction_id || tx.value.gateway_id)) || '');
const amountLabel = computed(() => {
  const cents = tx.value && tx.value.amount_cents;
  const n = Number(cents);
  if (!isFinite(n)) return '—';
  return fmt.formatCurrency(n / 100, (tx.value && tx.value.currency) || 'BRL');
});

const pageTitle = computed(() => (amountLabel.value !== '—' ? 'Transação ' + amountLabel.value : 'Transação #' + display(props.id)));
const pageSubtitle = computed(() => {
  const parts = [];
  if (gatewayLabel.value !== '—') parts.push(gatewayLabel.value);
  if (gatewayTxId.value) parts.push(gatewayTxId.value);
  return parts.length ? parts.join(' · ') : 'Detalhe do pagamento e trilha de auditoria.';
});

// ── Metadados (jsonb) → linhas dt/dd ─────────────────────────────────────────────
const metadataRows = computed(() => {
  const md = tx.value && tx.value.metadata;
  if (!md || typeof md !== 'object' || Array.isArray(md)) return [];
  const out = [];
  for (const k of Object.keys(md)) {
    const raw = md[k];
    if (raw === null || raw === undefined || raw === '') continue;
    const isObj = typeof raw === 'object';
    out.push({
      key: k,
      label: fmt.humanize(k),
      value: isObj ? JSON.stringify(raw) : String(raw),
      mono: isObj || /id|key|token|hash/i.test(k),
    });
  }
  return out;
});

// ── Consulta vinculada ────────────────────────────────────────────────────────────
const consultationId = computed(() => (tx.value && (tx.value.consultation_id || tx.value.consultationId)) || null);
const consultationHref = computed(() => (consultationId.value ? '/consultations/' + consultationId.value : null));
const patientLabel = computed(
  () => consultation.value.patient_name || (consultation.value.patient_id ? 'Paciente #' + consultation.value.patient_id : '—')
);
const professionalLabel = computed(
  () => consultation.value.professional_name || (consultation.value.professional_id ? 'Profissional #' + consultation.value.professional_id : '—')
);
const patientHref = computed(() => (consultation.value.patient_id ? '/patients/' + consultation.value.patient_id : null));
const professionalHref = computed(() => (consultation.value.professional_id ? '/professionals/' + consultation.value.professional_id : null));

// ── Trilha de auditoria ────────────────────────────────────────────────────────────
const ENTITY_LABELS = { payment: 'Cobrança', webhook: 'Webhook', consultation: 'Consulta' };
const ACTION_LABELS = {
  'payment.charged': 'Cobrança iniciada',
  'payment.authorized': 'Pagamento autorizado',
  'payment.confirmed': 'Pagamento confirmado',
  'payment.failed': 'Pagamento falhou',
  'payment.refunded': 'Pagamento reembolsado',
};
const entityTypeLabel = (v) => ENTITY_LABELS[norm(v)] || (v ? fmt.humanize(v) : '—');
const actionLabel = (v) => ACTION_LABELS[norm(v)] || (v ? fmt.humanize(v) : '—');
const eventTone = (row) => {
  const a = norm(row && row.action);
  const ps = norm(row && row.payment_status);
  if (a.includes('failed') || ps === 'failed') return 'error';
  if (a.includes('refund') || ps === 'refunded') return 'neutral';
  if (a.includes('authorized') || a.includes('confirmed') || ['authorized', 'succeeded', 'paid'].includes(ps)) return 'success';
  if (a.includes('charged') || ps === 'pending') return 'warning';
  return 'neutral';
};

const auditColumns = [
  { key: 'created_at', label: 'Quando', sortable: true },
  { key: 'entity_type', label: 'Origem' },
  { key: 'action', label: 'Evento' },
  { key: 'payment_status', label: 'Situação' },
  { key: 'actor', label: 'Por' },
];
const auditEmpty = {
  title: 'Nenhum evento registrado',
  description: 'Ainda não há cobrança ou webhooks na trilha desta transação.',
  icon: 'clock',
};
const auditRows = computed(() =>
  [...audit.value]
    .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))
    .map((e, idx) => ({ ...e, _key: (e.id != null ? 'a' + e.id : 'e' + idx) }))
);
const auditCountLabel = computed(() => (auditLoading.value ? '…' : String(audit.value.length)));

// ── Carregamento ─────────────────────────────────────────────────────────────────
async function loadTransaction() {
  loading.value = true; error.value = null;
  try {
    tx.value = unwrap(await transactionsApi.get(props.id));
  } catch (e) {
    error.value = e && e.status === 404 ? 'Transação não encontrada.' : (e.message || 'Falha ao carregar a transação.');
    tx.value = null;
  } finally {
    loading.value = false;
  }
}

async function loadConsultation() {
  if (!consultationId.value) { consultation.value = {}; return; }
  consultLoading.value = true; consultError.value = null;
  try {
    consultation.value = unwrap(await consultationsApi.get(consultationId.value));
  } catch (e) {
    // fail-soft: a transação ainda é útil sem a consulta
    consultError.value = e && e.status === 404 ? 'Agendamento não encontrado.' : (e.message || 'Falha ao carregar o agendamento.');
    consultation.value = {};
  } finally {
    consultLoading.value = false;
  }
}

async function loadAudit() {
  auditLoading.value = true; auditError.value = null; auditTruncated.value = false;
  try {
    // 1) eventos cuja entidade É o id do gateway (cobrança = entity_id do gateway tx) —
    //    filtrado no servidor por entity_id, então não trunca os webhooks desta transação.
    // 2) lote amplo (consulta vinculada / webhooks com transactionId no metadata) filtrado
    //    client-side. Este lote NÃO é filtrado no servidor → pode vir no teto e truncar.
    const gtid = gatewayTxId.value;
    const cid = consultationId.value;
    const broad = auditApi.list({ limit: AUDIT_LIMIT });
    const calls = [broad];
    if (gtid) calls.push(auditApi.list({ entity_id: gtid, limit: AUDIT_LIMIT }));
    const results = await Promise.all(calls.map((p) => p.catch(() => ({ data: [], _failed: true }))));

    const seen = new Set();
    const merged = [];
    results.forEach((res, idx) => {
      const rows = Array.isArray(res) ? res : (res && res.data) || [];
      // Só o lote amplo (idx 0, sem filtro de servidor) pode esconder eventos antigos.
      if (idx === 0 && !res._failed && rows.length >= AUDIT_LIMIT) auditTruncated.value = true;
      for (const e of rows) {
        if (!relatesToThisTx(e, gtid, cid)) continue;
        const sig = e.id != null ? 'id:' + e.id : [e.entity_type, e.entity_id, e.action, e.created_at].join('|');
        if (seen.has(sig)) continue;
        seen.add(sig);
        merged.push(e);
      }
    });
    audit.value = merged;
  } catch (e) {
    auditError.value = e.message || 'Falha ao carregar a trilha de auditoria.';
    audit.value = [];
  } finally {
    auditLoading.value = false;
  }
}

// Só entradas realmente ligadas a esta transação (id do gateway no entity_id ou no
// metadata.transactionId; ou a própria consulta vinculada). Sem id do gateway nem
// consulta, não há como vincular com segurança → não exibe nada (fail-closed).
function relatesToThisTx(entry, gtid, cid) {
  if (!entry) return false;
  if (gtid) {
    if (String(entry.entity_id) === String(gtid)) return true;
    const md = entry.metadata;
    if (md && typeof md === 'object') {
      const txInMeta = md.transactionId || md.transaction_id;
      if (txInMeta && String(txInMeta) === String(gtid)) return true;
    }
  }
  if (cid && norm(entry.entity_type) === 'consultation' && String(entry.entity_id) === String(cid)) return true;
  return false;
}

// ── Ações ────────────────────────────────────────────────────────────────────────
async function copy(value, label) {
  const text = String(value == null ? '' : value);
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
      toast.success((label || 'Valor') + ' copiado.');
    } else {
      toast.error('Cópia não suportada neste navegador.');
    }
  } catch (e) {
    toast.error('Não foi possível copiar.', { detail: e && e.message });
  }
}

async function refreshAll() {
  refreshing.value = true;
  try {
    await loadTransaction();
    await Promise.all([loadConsultation(), loadAudit()]);
    if (!error.value) toast.success('Dados atualizados.');
  } finally {
    refreshing.value = false;
  }
}

// ── Erros de página ────────────────────────────────────────────────────────────────
const pageError = computed(() => error.value);

// ── Boot: transação primeiro; consulta + trilha dependem do id do gateway ──────────
async function loadAll() {
  await loadTransaction();
  if (tx.value) {
    loadConsultation();
    loadAudit();
  }
}
watch(() => props.id, loadAll);
onMounted(loadAll);
</script>

<style scoped>
/* Tamanhos dos "dots" decorativos (aria-hidden) — extraídos p/ var local em vez de
   números mágicos, alinhando ao padrão de zero literais cruos. */
:where(.td-banner, .td-action) { --td-dot-lg: 9px; --td-dot-sm: 8px; }

/* ── Banner de situação ───────────────────────────────────────────────────────── */
.td-banner {
  display: flex;
  align-items: center;
  gap: var(--ui-space-3);
  padding: var(--ui-space-3) var(--ui-space-4);
  border-radius: var(--ui-radius-md);
  border: 1px solid rgb(var(--ui-border));
  background: rgb(var(--ui-surface));
  font-size: var(--ui-text-sm);
  color: rgb(var(--ui-fg));
  flex-wrap: wrap;
}
.td-banner-text { display: flex; gap: var(--ui-space-1); flex: 1 1 240px; min-width: 0; flex-wrap: wrap; }
.td-banner-dot { width: var(--td-dot-lg); height: var(--td-dot-lg); border-radius: var(--ui-radius-pill); flex-shrink: 0; background: rgb(var(--ui-muted)); }
.td-banner[data-tone="success"] { border-color: rgb(var(--ui-ok) / 0.4); background: rgb(var(--ui-ok) / 0.08); }
.td-banner[data-tone="success"] .td-banner-dot { background: rgb(var(--ui-ok)); }
.td-banner[data-tone="warning"] { border-color: rgb(var(--ui-warn) / 0.4); background: rgb(var(--ui-warn) / 0.1); }
.td-banner[data-tone="warning"] .td-banner-dot { background: rgb(var(--ui-warn)); }
.td-banner[data-tone="error"] { border-color: rgb(var(--ui-danger) / 0.4); background: rgb(var(--ui-danger) / 0.08); }
.td-banner[data-tone="error"] .td-banner-dot { background: rgb(var(--ui-danger)); }

/* ── Métricas ─────────────────────────────────────────────────────────────────── */
.td-metrics { display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: var(--ui-space-4); }

/* ── Grid principal ────────────────────────────────────────────────────────────── */
.td-grid { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: var(--ui-space-4); align-items: start; }

/* ── Pares chave/valor ─────────────────────────────────────────────────────────── */
.td-kv { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--ui-space-4); margin: 0; }
.td-kv-3 { grid-template-columns: repeat(3, minmax(0, 1fr)); }
.td-kv > div { display: flex; flex-direction: column; gap: var(--ui-space-1); min-width: 0; }
.td-kv dt { color: rgb(var(--ui-muted)); font-size: var(--ui-text-xs); text-transform: uppercase; letter-spacing: .04em; font-weight: 600; }
.td-kv dd { margin: 0; font-size: var(--ui-text-md); overflow-wrap: anywhere; }

.td-amount { font-variant-numeric: tabular-nums; font-weight: 700; font-size: var(--ui-text-lg); }
.td-mono { font-family: var(--ui-font-mono, monospace); font-size: var(--ui-text-sm); }
.td-ellipsis { display: block; overflow: hidden; text-overflow: ellipsis; }
.td-ext { display: flex; align-items: center; gap: var(--ui-space-2); min-width: 0; }
.td-ext .td-mono { flex: 1 1 auto; min-width: 0; }
.td-meta-val { overflow-wrap: anywhere; }

.td-link { color: rgb(var(--ui-accent-strong)); text-decoration: none; font-weight: 500; }
.td-link:hover { text-decoration: underline; }

.td-foot-actions { display: flex; gap: var(--ui-space-2); flex-wrap: wrap; }
.td-pad { padding: var(--ui-space-2) 0; }

/* ── Aviso de trilha truncada (cor + texto; nunca só cor) ───────────────────────── */
.td-warn {
  --td-dot-sm: 8px;
  display: flex; align-items: center; gap: var(--ui-space-2);
  margin: 0 0 var(--ui-space-3);
  padding: var(--ui-space-2) var(--ui-space-3);
  border-radius: var(--ui-radius-md);
  border: 1px solid rgb(var(--ui-warn) / 0.4);
  background: rgb(var(--ui-warn) / 0.1);
  color: rgb(var(--ui-fg));
  font-size: var(--ui-text-sm);
}
.td-warn-dot { width: var(--td-dot-sm); height: var(--td-dot-sm); border-radius: var(--ui-radius-pill); flex-shrink: 0; background: rgb(var(--ui-warn)); }

/* ── Evento na trilha (ponto colorido + rótulo) ────────────────────────────────── */
.td-action { display: inline-flex; align-items: center; gap: var(--ui-space-2); }
.td-action-dot { width: var(--td-dot-sm); height: var(--td-dot-sm); border-radius: var(--ui-radius-pill); flex-shrink: 0; background: rgb(var(--ui-muted)); }
.td-action-dot[data-tone="success"] { background: rgb(var(--ui-ok)); }
.td-action-dot[data-tone="warning"] { background: rgb(var(--ui-warn)); }
.td-action-dot[data-tone="error"] { background: rgb(var(--ui-danger)); }
.td-action-dot[data-tone="neutral"] { background: rgb(var(--ui-faint)); }

/* ── Responsivo ────────────────────────────────────────────────────────────────── */
@media (max-width: 860px) {
  .td-grid { grid-template-columns: minmax(0, 1fr); }
  .td-kv, .td-kv-3 { grid-template-columns: minmax(0, 1fr); }
  .td-metrics { grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); }
}
</style>
