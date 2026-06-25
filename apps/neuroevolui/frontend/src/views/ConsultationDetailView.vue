<template>
  <UiPageLayout
    eyebrow="Agenda"
    :title="headerTitle"
    :subtitle="headerSubtitle"
    width="wide"
    :loading="loading"
    :error="pageError"
    @retry="load"
  >
    <!-- AÇÕES DO CABEÇALHO -->
    <template #actions>
      <UiButton variant="ghost" to="/consultations">Voltar</UiButton>
      <UiButton
        variant="subtle"
        :loading="reminding"
        :disabled="!canRemind"
        @click="resendReminder"
      >Reenviar lembrete</UiButton>
      <UiButton
        v-if="canComplete"
        :loading="acting"
        @click="markCompleted"
      >Marcar como concluída</UiButton>
      <UiButton
        v-if="canCancel"
        variant="danger"
        :loading="acting"
        @click="cancelConsultation"
      >Cancelar consulta</UiButton>
    </template>

    <!-- BANNERS DE SITUAÇÃO -->
    <template #banner>
      <div v-if="isCanceled" class="cd-banner cd-banner-danger" role="status">
        <span class="cd-banner-dot" aria-hidden="true" />
        <span>Esta consulta foi <strong>cancelada</strong> e não conta na agenda ativa.</span>
      </div>
      <div v-else-if="isNoShow" class="cd-banner cd-banner-warn" role="status">
        <span class="cd-banner-dot" aria-hidden="true" />
        <span>O paciente <strong>não compareceu</strong> a este atendimento.</span>
      </div>
      <div v-else-if="isCompleted" class="cd-banner cd-banner-ok" role="status">
        <span class="cd-banner-dot" aria-hidden="true" />
        <span>Atendimento <strong>concluído</strong>.</span>
      </div>
      <div v-else-if="paymentPending && !isCanceled" class="cd-banner cd-banner-warn" role="status">
        <span class="cd-banner-dot" aria-hidden="true" />
        <span>Pagamento <strong>pendente</strong> — o valor ainda não foi confirmado.</span>
      </div>
    </template>

    <!-- MÉTRICAS / RESUMO (dentro do slot default; só renderiza após o load do UiPageLayout) -->
    <section class="cd-metrics" aria-label="Resumo do agendamento">
      <UiMetricCard
        label="Valor"
        :value="amountLabel"
        tone="primary"
        hint="Valor do atendimento"
      />
      <UiMetricCard
        label="Status"
        :value="statusText(consultation.status)"
        :tone="statusTone(consultation.status)"
        hint="Situação do agendamento"
      />
      <UiMetricCard
        label="Pagamento"
        :value="paymentText(consultation.payment_status)"
        :tone="paymentTone(consultation.payment_status)"
        hint="Situação do pagamento"
      />
      <UiMetricCard
        label="Quando"
        :value="relativeWhen"
        :tone="whenTone"
        :hint="startLabel"
      />
    </section>

    <div class="cd-grid">
      <!-- DETALHE DO AGENDAMENTO -->
      <UiCard title="Agendamento" subtitle="Horário, duração e situação do atendimento">
        <template #actions>
          <UiStatusBadge
            :status="consultation.status || 'scheduled'"
            :tone="statusTone(consultation.status)"
            :label="statusText(consultation.status)"
            size="lg"
          />
        </template>
        <dl class="cd-kv">
          <div>
            <dt>Início</dt>
            <dd>{{ formatDateTime(consultation.scheduled_at) }}</dd>
          </div>
          <div>
            <dt>Término previsto</dt>
            <dd>{{ endLabel }}</dd>
          </div>
          <div>
            <dt>Duração</dt>
            <dd>{{ durationLabel }}</dd>
          </div>
          <div>
            <dt>Valor</dt>
            <dd class="cd-amount">{{ amountLabel }}</dd>
          </div>
          <div>
            <dt>Status</dt>
            <dd>
              <UiStatusBadge
                :status="consultation.status || 'scheduled'"
                :tone="statusTone(consultation.status)"
                :label="statusText(consultation.status)"
              />
            </dd>
          </div>
          <div>
            <dt>Pagamento</dt>
            <dd>
              <UiStatusBadge
                :status="consultation.payment_status || 'pending'"
                :tone="paymentTone(consultation.payment_status)"
                :label="paymentText(consultation.payment_status)"
              />
            </dd>
          </div>
        </dl>
      </UiCard>

      <!-- PARTICIPANTES -->
      <UiCard title="Participantes" subtitle="Paciente e profissional vinculados">
        <dl class="cd-kv">
          <div>
            <dt>Paciente</dt>
            <dd>
              <RouterLink v-if="patientHref" class="cd-link" :to="patientHref">{{ patientLabel }}</RouterLink>
              <span v-else>{{ patientLabel }}</span>
            </dd>
          </div>
          <div>
            <dt>ID do paciente</dt>
            <dd class="cd-mono">{{ display(consultation.patient_id) }}</dd>
          </div>
          <div>
            <dt>Profissional</dt>
            <dd>
              <RouterLink v-if="professionalHref" class="cd-link" :to="professionalHref">{{ professionalLabel }}</RouterLink>
              <span v-else>{{ professionalLabel }}</span>
            </dd>
          </div>
          <div>
            <dt>ID do profissional</dt>
            <dd class="cd-mono">{{ display(consultation.professional_id) }}</dd>
          </div>
        </dl>
        <template #footer>
          <div class="cd-foot-actions">
            <UiButton v-if="patientHref" variant="ghost" size="sm" :to="patientHref">Ver paciente</UiButton>
            <UiButton v-if="professionalHref" variant="ghost" size="sm" :to="professionalHref">Ver profissional</UiButton>
          </div>
        </template>
      </UiCard>
    </div>

    <!-- PAGAMENTO E TRANSAÇÃO VINCULADA -->
    <UiCard title="Pagamento" subtitle="Cobrança e transação vinculada ao atendimento">
      <template #actions>
        <UiStatusBadge
          :status="consultation.payment_status || 'pending'"
          :tone="paymentTone(consultation.payment_status)"
          :label="paymentText(consultation.payment_status)"
          size="lg"
        />
      </template>

      <dl class="cd-kv cd-kv-3">
        <div>
          <dt>Situação do pagamento</dt>
          <dd>
            <UiStatusBadge
              :status="consultation.payment_status || 'pending'"
              :tone="paymentTone(consultation.payment_status)"
              :label="paymentText(consultation.payment_status)"
            />
          </dd>
        </div>
        <div>
          <dt>Valor cobrado</dt>
          <dd class="cd-amount">{{ amountLabel }}</dd>
        </div>
        <div>
          <dt>Moeda</dt>
          <dd>{{ display(consultation.currency || 'BRL') }}</dd>
        </div>
      </dl>

      <!-- Estado da transação: nenhuma | resumo -->
      <div v-if="!hasTransaction" class="cd-tx-empty">
        <UiEmptyState
          title="Nenhuma transação vinculada"
          description="Este atendimento ainda não tem uma transação de pagamento registrada."
          icon="card"
        />
      </div>
      <div v-else class="cd-tx">
        <h4 class="cd-tx-title">Transação vinculada</h4>
        <dl class="cd-kv cd-kv-3">
          <div>
            <dt>ID da transação</dt>
            <dd class="cd-mono">{{ display(transaction.id) }}</dd>
          </div>
          <div>
            <dt>Situação</dt>
            <dd>
              <UiStatusBadge
                :status="transaction.status || consultation.payment_status || 'pending'"
                :tone="paymentTone(transaction.status || consultation.payment_status)"
                :label="paymentText(transaction.status || consultation.payment_status)"
              />
            </dd>
          </div>
          <div>
            <dt>Método</dt>
            <dd>{{ display(transaction.method || transaction.payment_method) }}</dd>
          </div>
          <div>
            <dt>Valor</dt>
            <dd class="cd-amount">{{ txAmountLabel }}</dd>
          </div>
          <div>
            <dt>Gateway</dt>
            <dd>{{ display(transaction.gateway || transaction.provider) }}</dd>
          </div>
          <div>
            <dt>Processado em</dt>
            <dd>{{ formatDateTime(transaction.processed_at || transaction.created_at) }}</dd>
          </div>
        </dl>
      </div>
    </UiCard>

    <!-- HISTÓRICO DE LEMBRETES / NOTIFICAÇÕES -->
    <UiCard title="Lembretes enviados" subtitle="Notificações disparadas para este agendamento">
      <template #actions>
        <UiButton
          variant="subtle"
          size="sm"
          :loading="reminding"
          :disabled="!canRemind"
          @click="resendReminder"
        >Reenviar lembrete</UiButton>
      </template>
      <UiDataTable
        :columns="reminderColumns"
        :rows="reminderRows"
        :loading="remindersLoading"
        :error="remindersErrorMessage"
        row-key="id"
        density="compact"
        :empty="reminderEmpty"
        @retry="loadReminders"
      >
        <template #cell-created_at="{ value }">{{ formatDateTime(value) }}</template>
        <template #cell-channel="{ value }">{{ channelLabel(value) }}</template>
        <template #cell-status="{ value }">
          <UiStatusBadge :status="value || 'pending'" :tone="notifyTone(value)" :label="notifyText(value)" />
        </template>
        <template #empty-action>
          <UiButton
            variant="subtle"
            size="sm"
            :loading="reminding"
            :disabled="!canRemind"
            @click="resendReminder"
          >Enviar lembrete</UiButton>
        </template>
      </UiDataTable>
    </UiCard>

    <template #footer>
      <span>Detalhe do agendamento #{{ display(id) }} — fonte: agenda em tempo real do tenant.</span>
    </template>
  </UiPageLayout>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue';
import { RouterLink } from 'vue-router';
import {
  UiPageLayout,
  UiCard,
  UiMetricCard,
  UiStatusBadge,
  UiDataTable,
  UiEmptyState,
  UiButton,
  useToast,
  useConfirm,
  format,
} from '../ui/index.js';
import * as api from '../api.js';

// Resolve os recursos de forma DEFENSIVA (mesmo padrão das views irmãs, ex.: ConsultationListView):
// usa o export nomeado quando existe; senão cai para resourceFactory(<name>) → /v1/<name>.
// Nunca fica undefined (à prova de regeneração do api.js pela Forge).
const consultations =
  api.consultations && typeof api.consultations.list === 'function'
    ? api.consultations
    : api.resourceFactory('consultations');
const notifications =
  api.notifications && typeof api.notifications.create === 'function'
    ? api.notifications
    : api.resourceFactory('notifications');

const { formatDateTime, formatCurrency, humanize } = format;

const props = defineProps({ id: { type: [String, Number], required: true } });

const toast = useToast();
const confirm = useConfirm();

// ---- estado principal ----
const loading = ref(true);
const error = ref(null);
const consultation = ref({});

// ---- estado das notificações/lembretes ----
const remindersLoading = ref(false);
const remindersError = ref(null);
const reminders = ref([]);

// ---- estado de ações ----
const acting = ref(false);
const reminding = ref(false);

// ---- rótulos pt-BR dos enums (cor nunca é o único sinal) ----
const STATUS_LABELS = {
  scheduled: 'Agendada',
  confirmed: 'Confirmada',
  completed: 'Concluída',
  canceled: 'Cancelada',
  cancelled: 'Cancelada',
  no_show: 'Não compareceu',
};
const PAYMENT_LABELS = {
  pending: 'Pendente',
  paid: 'Pago',
  failed: 'Falhou',
  refunded: 'Reembolsado',
};
const NOTIFY_LABELS = {
  sent: 'Enviado',
  delivered: 'Entregue',
  pending: 'Pendente',
  queued: 'Na fila',
  failed: 'Falhou',
  read: 'Lido',
};
const STATUS_TONES = {
  scheduled: 'running',
  confirmed: 'running',
  completed: 'success',
  canceled: 'error',
  cancelled: 'error',
  no_show: 'warning',
};
const PAYMENT_TONES = {
  pending: 'warning',
  paid: 'success',
  failed: 'error',
  refunded: 'neutral',
};
const NOTIFY_TONES = {
  sent: 'success',
  delivered: 'success',
  read: 'success',
  pending: 'warning',
  queued: 'running',
  failed: 'error',
};
const CHANNEL_LABELS = {
  email: 'E-mail',
  sms: 'SMS',
  whatsapp: 'WhatsApp',
  push: 'Push',
  in_app: 'No app',
};

const norm = (v) => String(v || '').toLowerCase().trim();
const statusText = (v) => STATUS_LABELS[norm(v)] || (v ? humanize(v) : '—');
const paymentText = (v) => PAYMENT_LABELS[norm(v)] || (v ? humanize(v) : '—');
const notifyText = (v) => NOTIFY_LABELS[norm(v)] || (v ? humanize(v) : 'Pendente');
const statusTone = (v) => STATUS_TONES[norm(v)] || 'neutral';
const paymentTone = (v) => PAYMENT_TONES[norm(v)] || 'neutral';
const notifyTone = (v) => NOTIFY_TONES[norm(v)] || 'neutral';
const channelLabel = (v) => CHANNEL_LABELS[norm(v)] || (v ? humanize(v) : '—');

const display = (v) => (v === null || v === undefined || v === '' ? '—' : String(v));

// ---- situação derivada ----
const isCompleted = computed(() => norm(consultation.value.status) === 'completed');
const isCanceled = computed(() => ['canceled', 'cancelled'].includes(norm(consultation.value.status)));
const isNoShow = computed(() => norm(consultation.value.status) === 'no_show');
const paymentPending = computed(() => ['pending', 'failed'].includes(norm(consultation.value.payment_status)));

// terminal = não permite concluir/cancelar
const isTerminal = computed(() => isCompleted.value || isCanceled.value || isNoShow.value);
const canComplete = computed(() => !loading.value && !error.value && !isTerminal.value);
const canCancel = computed(() => !loading.value && !error.value && !isCanceled.value && !isCompleted.value);
const canRemind = computed(() => !loading.value && !error.value && !isCanceled.value && !isCompleted.value);

// ---- cabeçalho ----
const headerTitle = computed(() => {
  const who = patientLabel.value;
  return who && who !== '—' ? 'Consulta — ' + who : 'Consulta #' + display(props.id);
});
const headerSubtitle = computed(() => {
  const parts = [];
  if (consultation.value.scheduled_at) parts.push(formatDateTime(consultation.value.scheduled_at));
  if (professionalLabel.value && professionalLabel.value !== '—') parts.push('com ' + professionalLabel.value);
  return parts.length ? parts.join(' · ') : 'Detalhe do agendamento.';
});

// ---- participantes ----
const patientLabel = computed(
  () => consultation.value.patient_name || (consultation.value.patient_id ? 'Paciente #' + consultation.value.patient_id : '—')
);
const professionalLabel = computed(
  () => consultation.value.professional_name || (consultation.value.professional_id ? 'Profissional #' + consultation.value.professional_id : '—')
);
const patientHref = computed(() => (consultation.value.patient_id ? '/patients/' + consultation.value.patient_id : null));
const professionalHref = computed(() => (consultation.value.professional_id ? '/professionals/' + consultation.value.professional_id : null));

// ---- horário / duração ----
const durationMinutes = computed(() => {
  let mins = Number(consultation.value.duration_minutes);
  if ((!isFinite(mins) || mins <= 0) && consultation.value.scheduled_at && consultation.value.scheduled_end_at) {
    const a = new Date(consultation.value.scheduled_at).getTime();
    const b = new Date(consultation.value.scheduled_end_at).getTime();
    if (isFinite(a) && isFinite(b) && b > a) mins = Math.round((b - a) / 60000);
  }
  return isFinite(mins) && mins > 0 ? mins : null;
});
const durationLabel = computed(() => (durationMinutes.value ? durationMinutes.value + ' min' : '—'));

const startLabel = computed(() => (consultation.value.scheduled_at ? formatDateTime(consultation.value.scheduled_at) : 'Sem horário definido'));

const endLabel = computed(() => {
  if (consultation.value.scheduled_end_at) return formatDateTime(consultation.value.scheduled_end_at);
  const start = consultation.value.scheduled_at ? new Date(consultation.value.scheduled_at).getTime() : NaN;
  if (isFinite(start) && durationMinutes.value) return formatDateTime(new Date(start + durationMinutes.value * 60000));
  return '—';
});

const relativeWhen = computed(() => {
  const t = consultation.value.scheduled_at ? new Date(consultation.value.scheduled_at).getTime() : NaN;
  if (!isFinite(t)) return '—';
  const diffMin = Math.round((t - Date.now()) / 60000);
  const abs = Math.abs(diffMin);
  const future = diffMin >= 0;
  let label;
  if (abs < 60) label = abs + ' min';
  else if (abs < 60 * 24) label = Math.round(abs / 60) + ' h';
  else label = Math.round(abs / (60 * 24)) + ' d';
  return future ? 'em ' + label : 'há ' + label;
});
const whenTone = computed(() => {
  if (isTerminal.value) return 'neutral';
  const t = consultation.value.scheduled_at ? new Date(consultation.value.scheduled_at).getTime() : NaN;
  if (!isFinite(t)) return 'neutral';
  return t >= Date.now() ? 'running' : 'warning';
});

// ---- valores (centavos -> unidades) ----
function moneyFromCents(cents, currency) {
  const n = Number(cents);
  if (!isFinite(n)) return '—';
  return formatCurrency(n / 100, currency || consultation.value.currency || 'BRL');
}
const amountLabel = computed(() => moneyFromCents(consultation.value.amount_cents, consultation.value.currency));

// ---- transação vinculada (campos variáveis no domínio) ----
const transaction = computed(() => {
  const c = consultation.value;
  const tx = c.transaction || c.payment_transaction || c.payment || null;
  if (tx && typeof tx === 'object') return tx;
  // transação "achatada" no próprio registro da consulta
  if (c.transaction_id || c.payment_id) {
    return {
      id: c.transaction_id || c.payment_id,
      status: c.payment_status,
      method: c.payment_method,
      gateway: c.payment_gateway,
      amount_cents: c.amount_cents,
      processed_at: c.paid_at || c.payment_processed_at,
    };
  }
  return null;
});
const hasTransaction = computed(() => {
  const tx = transaction.value;
  return !!(tx && (tx.id || tx.amount_cents || tx.status));
});
const txAmountLabel = computed(() => {
  const tx = transaction.value;
  if (!tx) return '—';
  if (tx.amount_cents !== undefined && tx.amount_cents !== null) return moneyFromCents(tx.amount_cents, tx.currency);
  if (tx.amount !== undefined && tx.amount !== null) {
    const n = Number(tx.amount);
    return isFinite(n) ? formatCurrency(n, tx.currency || consultation.value.currency || 'BRL') : '—';
  }
  return amountLabel.value;
});

// ---- lembretes / notificações ----
// Sem `sortable`: reminderRows entrega a lista já ordenada por data desc (ordenação
// determinística = intenção da tela). Evita o ruído de re-ordenar sobre dados pré-ordenados.
const reminderColumns = [
  { key: 'created_at', label: 'Enviado em' },
  { key: 'channel', label: 'Canal' },
  { key: 'status', label: 'Situação' },
];
const reminderRows = computed(() =>
  [...reminders.value].sort((a, b) => {
    const da = new Date(a.created_at || a.sent_at || 0).getTime();
    const db = new Date(b.created_at || b.sent_at || 0).getTime();
    return db - da;
  }).map((n) => ({ ...n, created_at: n.created_at || n.sent_at || n.queued_at }))
);
const remindersErrorMessage = computed(() => (remindersError.value ? remindersError.value.message || 'Não foi possível carregar os lembretes.' : null));
const reminderEmpty = {
  title: 'Nenhum lembrete enviado',
  description: 'Ainda não há lembretes disparados para este agendamento.',
  icon: 'bell',
};

// ---- carregamento ----
// O backend deste domínio expõe a agenda por LISTA (GET /v1/consultations → { data: [...] });
// derivamos o registro pelo id. Se o integrador habilitar GET /v1/consultations/:id no futuro,
// usamos esse caminho direto (mais barato) e caímos para a lista como fallback — sem dupla verdade.
function unwrap(res) {
  if (!res || typeof res !== 'object') return null;
  if (res.data && typeof res.data === 'object' && !Array.isArray(res.data)) return res.data;
  return res;
}

async function load() {
  loading.value = true;
  error.value = null;
  try {
    let found = null;
    // 1) tenta o get por id (só se o backend honrar /:id) — fail-soft p/ a lista.
    try {
      const direct = unwrap(await consultations.get(props.id));
      if (direct && (direct.id !== undefined || direct.scheduled_at)) found = direct;
    } catch {
      found = null; // sem rota /:id → cai para a lista abaixo
    }
    // 2) fallback canônico: lista do tenant + busca pelo id (contrato list-only).
    if (!found) {
      const res = await consultations.list({ pageSize: 200 });
      const rows = Array.isArray(res) ? res : res && Array.isArray(res.data) ? res.data : [];
      found = rows.find((c) => String(c.id) === String(props.id)) || null;
    }
    if (!found) {
      const e = new Error('Agendamento #' + props.id + ' não encontrado na agenda do tenant.');
      e.status = 404;
      throw e;
    }
    consultation.value = found;
  } catch (e) {
    error.value = e;
    consultation.value = {};
  } finally {
    loading.value = false;
  }
}

async function loadReminders() {
  remindersLoading.value = true;
  remindersError.value = null;
  try {
    // O canal de notificações é assíncrono (POST /v1/notifications enfileira). Se o backend
    // expuser uma listagem (GET /v1/notifications), mostramos o histórico; senão fail-soft
    // (lista vazia → empty state "nenhum lembrete"), nunca quebrando a tela.
    if (typeof notifications.list !== 'function') {
      reminders.value = [];
      return;
    }
    const r = await notifications.list({ consultation_id: props.id, pageSize: 50 });
    const rows = Array.isArray(r) ? r : r && r.data ? r.data : [];
    // defensivo: só notificações deste agendamento, se o backend não filtrar
    reminders.value = rows.filter((n) => {
      const cid = n.consultation_id ?? n.consultationId ?? n.reference_id ?? null;
      return cid === null || cid === undefined || String(cid) === String(props.id);
    });
  } catch (e) {
    remindersError.value = e;
    reminders.value = [];
  } finally {
    remindersLoading.value = false;
  }
}

const pageError = computed(() => (error.value ? error.value.message || 'Não foi possível carregar a consulta.' : null));

// ---- ações ----
async function applyStatus(nextStatus, successMessage) {
  acting.value = true;
  try {
    const updated = await consultations.update(props.id, { ...consultation.value, status: nextStatus });
    consultation.value =
      updated && typeof updated === 'object'
        ? { ...consultation.value, ...(updated.data && typeof updated.data === 'object' ? updated.data : updated) }
        : { ...consultation.value, status: nextStatus };
    toast.success(successMessage);
  } catch (e) {
    toast.error('Não foi possível atualizar a consulta', { detail: e.message, code: e.status });
  } finally {
    acting.value = false;
  }
}

async function markCompleted() {
  const ok = await confirm({
    title: 'Marcar como concluída',
    message: 'Confirmar que este atendimento de ' + (patientLabel.value !== '—' ? patientLabel.value : 'paciente') + ' foi realizado? A consulta será marcada como concluída.',
    confirmLabel: 'Concluir',
  });
  if (!ok) return;
  await applyStatus('completed', 'Consulta marcada como concluída.');
}

async function cancelConsultation() {
  const ok = await confirm({
    title: 'Cancelar consulta',
    message: 'Ao cancelar, o horário é liberado e a consulta sai da agenda ativa. Esta ação não pode ser desfeita. Confirmar?',
    confirmLabel: 'Cancelar consulta',
    cancelLabel: 'Voltar',
    danger: true,
  });
  if (!ok) return;
  await applyStatus('canceled', 'Consulta cancelada.');
}

async function resendReminder() {
  const ok = await confirm({
    title: 'Reenviar lembrete',
    message: 'Enviar um novo lembrete para ' + (patientLabel.value !== '—' ? patientLabel.value : 'o paciente') + ' sobre este agendamento?',
    confirmLabel: 'Enviar lembrete',
  });
  if (!ok) return;
  reminding.value = true;
  try {
    await notifications.create({
      consultation_id: props.id,
      type: 'appointment_reminder',
      channel: 'email',
      patient_id: consultation.value.patient_id,
    });
    toast.success('Lembrete reenviado.');
    await loadReminders();
  } catch (e) {
    toast.error('Não foi possível reenviar o lembrete', { detail: e.message, code: e.status });
  } finally {
    reminding.value = false;
  }
}

watch(
  () => props.id,
  () => {
    load();
    loadReminders();
  }
);
onMounted(() => {
  load();
  loadReminders();
});
</script>

<style scoped>
.cd-metrics {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
  gap: var(--ui-space-4);
}

.cd-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: var(--ui-space-4);
  align-items: start;
}

.cd-kv {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--ui-space-4);
  margin: 0;
}

.cd-kv-3 {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.cd-kv > div {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.cd-kv dt {
  color: rgb(var(--ui-muted));
  font-size: var(--ui-text-xs);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  font-weight: 600;
}

.cd-kv dd {
  margin: 0;
  font-size: var(--ui-text-md);
  word-break: break-word;
}

.cd-amount {
  font-variant-numeric: tabular-nums;
  font-weight: 600;
}

.cd-mono {
  font-family: var(--ui-font-mono, monospace);
  font-size: var(--ui-text-sm);
}

.cd-link {
  color: rgb(var(--ui-accent-strong));
  text-decoration: none;
  font-weight: 500;
}

.cd-link:hover {
  text-decoration: underline;
}

.cd-foot-actions {
  display: flex;
  gap: var(--ui-space-2);
  flex-wrap: wrap;
}

.cd-tx {
  margin-top: var(--ui-space-4);
  padding-top: var(--ui-space-4);
  border-top: 1px solid rgb(var(--ui-border));
}

.cd-tx-title {
  margin: 0 0 var(--ui-space-3);
  font-size: var(--ui-text-sm);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: rgb(var(--ui-muted));
}

.cd-tx-empty {
  margin-top: var(--ui-space-4);
  padding-top: var(--ui-space-4);
  border-top: 1px solid rgb(var(--ui-border));
}

.cd-banner {
  display: flex;
  align-items: center;
  gap: var(--ui-space-3);
  padding: var(--ui-space-3) var(--ui-space-4);
  border-radius: var(--ui-radius-md);
  font-size: var(--ui-text-sm);
  color: rgb(var(--ui-fg));
  border: 1px solid rgb(var(--ui-border));
}

.cd-banner-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
  background: rgb(var(--ui-muted));
}

.cd-banner-danger {
  border-color: rgb(var(--ui-danger) / 0.4);
  background: rgb(var(--ui-danger) / 0.08);
}
.cd-banner-danger .cd-banner-dot {
  background: rgb(var(--ui-danger));
}

.cd-banner-warn {
  border-color: rgb(var(--ui-warn) / 0.4);
  background: rgb(var(--ui-warn) / 0.1);
}
.cd-banner-warn .cd-banner-dot {
  background: rgb(var(--ui-warn));
}

.cd-banner-ok {
  border-color: rgb(var(--ui-ok) / 0.4);
  background: rgb(var(--ui-ok) / 0.08);
}
.cd-banner-ok .cd-banner-dot {
  background: rgb(var(--ui-ok));
}

@media (max-width: 860px) {
  .cd-grid {
    grid-template-columns: minmax(0, 1fr);
  }
  .cd-kv,
  .cd-kv-3 {
    grid-template-columns: minmax(0, 1fr);
  }
  .cd-metrics {
    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  }
}
</style>
