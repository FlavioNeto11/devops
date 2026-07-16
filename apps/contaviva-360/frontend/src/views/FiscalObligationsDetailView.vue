<template>
  <UiPageLayout
    eyebrow="Obrigações Fiscais"
    :title="loading ? 'Carregando…' : (obligation?.tipo ?? 'Detalhe da Obrigação')"
    :subtitle="loading ? '' : subtitleText"
    :loading="loading"
    :error="error ? (error.message || 'Erro ao carregar obrigação.') : null"
    :retryable="true"
    @retry="load"
  >
    <template #actions>
      <UiButton variant="ghost" to="/fiscal-obligations">Voltar à lista</UiButton>
    </template>

    <!-- Banner de alerta: destaque visual para obrigações críticas -->
    <template v-if="!loading && !error && obligation" #banner>
      <div class="alert-banner" :data-level="alertLevel" role="alert" aria-live="polite">
        <span class="alert-banner-icon" aria-hidden="true">{{ alertIcon }}</span>
        <div class="alert-banner-body">
          <strong class="alert-banner-title">{{ alertTitle }}</strong>
          <span class="alert-banner-desc">{{ alertDescription }}</span>
        </div>
        <UiStatusBadge :status="obligation.status" size="lg" />
      </div>
    </template>

    <!-- Corpo principal — só exibido com dados -->
    <template v-if="!loading && !error && obligation">

      <!-- Cartão de métricas de destaque -->
      <div class="metrics-row">
        <UiMetricCard
          label="Tipo de Obrigação"
          :value="obligation.tipo ?? '—'"
          :tone="alertLevel === 'critical' ? 'error' : alertLevel === 'warning' ? 'warning' : 'primary'"
        />
        <UiMetricCard
          label="Vencimento"
          :value="format.formatDate(obligation.data_vencimento)"
          :tone="dueTone"
          :hint="dueHint"
        />
        <UiMetricCard
          v-if="obligation.valor_estimado != null"
          label="Valor Estimado"
          :value="format.formatCurrency(obligation.valor_estimado)"
          tone="neutral"
        />
        <UiMetricCard
          label="Periodicidade"
          :value="obligation.periodicidade ? humanizePeriodicidade(obligation.periodicidade) : '—'"
          tone="neutral"
        />
      </div>

      <!-- Dados completos da obrigação -->
      <UiCard title="Dados da Obrigação" subtitle="Informações cadastrais completas">
        <template #actions>
          <UiStatusBadge :status="obligation.status" size="md" with-dot />
        </template>

        <dl class="detail-grid">
          <div class="detail-item">
            <dt class="detail-label">Tipo</dt>
            <dd class="detail-value">{{ obligation.tipo ?? '—' }}</dd>
          </div>
          <div class="detail-item">
            <dt class="detail-label">Status</dt>
            <dd class="detail-value">
              <UiStatusBadge :status="obligation.status" with-dot />
            </dd>
          </div>
          <div class="detail-item">
            <dt class="detail-label">Data de Vencimento</dt>
            <dd class="detail-value" :data-overdue="isOverdue ? 'true' : 'false'">
              {{ format.formatDate(obligation.data_vencimento) }}
              <span v-if="isOverdue" class="overdue-badge" aria-label="Atrasada">Em atraso</span>
            </dd>
          </div>
          <div class="detail-item">
            <dt class="detail-label">Periodicidade</dt>
            <dd class="detail-value">{{ obligation.periodicidade ? humanizePeriodicidade(obligation.periodicidade) : '—' }}</dd>
          </div>
          <div class="detail-item">
            <dt class="detail-label">Tipo de Entidade</dt>
            <dd class="detail-value">
              <span class="entity-type-chip" :data-kind="obligation.entidade_tipo">
                {{ obligation.entidade_tipo ?? '—' }}
              </span>
            </dd>
          </div>
          <div class="detail-item">
            <dt class="detail-label">Entidade Vinculada</dt>
            <dd class="detail-value">
              <template v-if="obligation.entidade_id && obligation.entidade_tipo">
                <RouterLink
                  :to="entityRoute"
                  class="entity-link"
                  :aria-label="'Ver ' + (obligation.entidade_tipo === 'PF' ? 'Pessoa Física' : 'Pessoa Jurídica') + ' #' + obligation.entidade_id"
                >
                  {{ obligation.entidade_tipo === 'PF' ? 'Pessoa Física' : 'Pessoa Jurídica' }} #{{ obligation.entidade_id }}
                  <span class="entity-link-arrow" aria-hidden="true">→</span>
                </RouterLink>
              </template>
              <template v-else>—</template>
            </dd>
          </div>
          <div v-if="obligation.valor_estimado != null" class="detail-item">
            <dt class="detail-label">Valor Estimado</dt>
            <dd class="detail-value detail-value--currency">{{ format.formatCurrency(obligation.valor_estimado) }}</dd>
          </div>
          <div v-if="obligation.descricao" class="detail-item detail-item--full">
            <dt class="detail-label">Descrição</dt>
            <dd class="detail-value detail-value--description">{{ obligation.descricao }}</dd>
          </div>
        </dl>
      </UiCard>

      <!-- Histórico de alertas emitidos -->
      <UiCard title="Histórico de Alertas" subtitle="Registro cronológico de alertas emitidos para esta obrigação">
        <template v-if="alertHistory.length">
          <ol class="timeline" aria-label="Histórico de alertas">
            <li
              v-for="(alert, idx) in alertHistory"
              :key="idx"
              class="timeline-item"
              :data-tone="resolveTone(alert.nivel || alert.level || 'neutral')"
            >
              <div class="timeline-dot" aria-hidden="true"></div>
              <div class="timeline-content">
                <div class="timeline-header">
                  <span class="timeline-label">
                    <UiStatusBadge
                      :status="alert.nivel || alert.level || 'info'"
                      :label="alertLevelLabel(alert.nivel || alert.level)"
                      size="sm"
                    />
                  </span>
                  <time class="timeline-time" :datetime="alert.emitido_em || alert.created_at">
                    {{ format.formatDateTime(alert.emitido_em || alert.created_at) }}
                  </time>
                </div>
                <p class="timeline-msg">{{ alert.mensagem || alert.message || 'Alerta emitido.' }}</p>
                <p v-if="alert.canal || alert.channel" class="timeline-channel">
                  Via {{ alert.canal || alert.channel }}
                </p>
              </div>
            </li>
          </ol>
        </template>
        <UiEmptyState
          v-else
          title="Nenhum alerta emitido"
          description="Esta obrigação não possui histórico de alertas até o momento."
          icon="clock"
          compact
        />
      </UiCard>

      <!-- Barra de ações -->
      <div class="action-bar" role="group" aria-label="Ações da obrigação">
        <UiButton
          v-if="canMarkPaid"
          variant="primary"
          :loading="actionLoading === 'paid'"
          :disabled="!!actionLoading"
          @click="markAsPaid"
        >
          Marcar como Pago
        </UiButton>
        <UiButton
          v-if="canApprove"
          variant="primary"
          :loading="actionLoading === 'approved'"
          :disabled="!!actionLoading"
          @click="approve"
        >
          Aprovar
        </UiButton>
        <UiButton
          v-if="canCancel"
          variant="danger"
          :loading="actionLoading === 'cancelled'"
          :disabled="!!actionLoading"
          @click="cancel"
        >
          Cancelar
        </UiButton>
        <UiButton
          variant="ghost"
          to="/fiscal-obligations"
        >
          Voltar
        </UiButton>
      </div>

    </template>

    <!-- Estado vazio: obrigação não encontrada -->
    <UiEmptyState
      v-if="!loading && !error && !obligation"
      title="Obrigação não encontrada"
      description="Não foi possível localizar esta obrigação fiscal. Ela pode ter sido removida."
      icon="search"
    >
      <template #action>
        <UiButton to="/fiscal-obligations">Ver lista de obrigações</UiButton>
      </template>
    </UiEmptyState>

  </UiPageLayout>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { RouterLink } from 'vue-router';
import {
  UiPageLayout,
  UiCard,
  UiMetricCard,
  UiStatusBadge,
  UiEmptyState,
  UiButton,
  useToast,
  useConfirm,
  format,
  resolveTone,
  resolveGlyph,
} from '../ui/index.js';
import { resourceFactory, patchObligationStatus } from '../api.js';

// Props
const props = defineProps({
  id: { type: String, required: true },
});

// API — recurso garantido pelo integrador
const fiscalObligations = resourceFactory('fiscal-obligations');

// Estado
const obligation = ref(null);
const alertHistory = ref([]);
const loading = ref(true);
const error = ref(null);
const actionLoading = ref(null); // 'paid' | 'approved' | 'cancelled' | null

const toast = useToast();
const ask = useConfirm();

// Carregar dados
async function load() {
  loading.value = true;
  error.value = null;
  obligation.value = null;
  alertHistory.value = [];
  try {
    // Carrega obrigação e alertas em paralelo via integrador api.js
    const [obligationData, alertsData] = await Promise.all([
      fiscalObligations.get(props.id),
      // Sub-recurso /v1/fiscal-obligations/:id/alerts
      fiscalObligations.get(props.id + '/alerts').catch(() => null),
    ]);
    // O backend pode retornar { data: {...} } ou diretamente o objeto
    obligation.value = obligationData && obligationData.data ? obligationData.data : obligationData;
    // Alertas: preferência pelo endpoint dedicado; fallback no campo embutido
    if (alertsData) {
      alertHistory.value = Array.isArray(alertsData)
        ? alertsData
        : (alertsData.data || alertsData.items || []);
    } else {
      alertHistory.value = obligation.value?.alertas || obligation.value?.alert_history || [];
    }
  } catch (e) {
    error.value = e;
  } finally {
    loading.value = false;
  }
}

// Computed: nível de alerta (critical | warning | info | ok)
const alertLevel = computed(() => {
  if (!obligation.value) return 'info';
  const s = String(obligation.value.status || '').toLowerCase();
  if (isOverdue.value && !['pago', 'cancelado', 'approved', 'aprovado'].some(k => s.includes(k))) return 'critical';
  if (['pendente', 'pending', 'warning', 'atrasado', 'overdue'].some(k => s.includes(k))) return 'warning';
  if (['pago', 'paid', 'aprovado', 'approved', 'done', 'completed'].some(k => s.includes(k))) return 'ok';
  return 'info';
});

// Nome canônico do ícone de alerta — resolvido via resolveGlyph do kit (sem Unicode avulso)
const alertIconName = computed(() => {
  if (alertLevel.value === 'critical') return 'warn';
  if (alertLevel.value === 'warning') return 'warning';
  if (alertLevel.value === 'ok') return 'ok';
  return 'info';
});

const alertIcon = computed(() => resolveGlyph(alertIconName.value));

const alertTitle = computed(() => {
  if (alertLevel.value === 'critical') return 'Obrigação em atraso';
  if (alertLevel.value === 'warning') return 'Atenção requerida';
  if (alertLevel.value === 'ok') return 'Obrigação quitada';
  return 'Obrigação fiscal';
});

const alertDescription = computed(() => {
  if (!obligation.value) return '';
  if (alertLevel.value === 'critical') {
    return 'Esta obrigação está vencida e requer ação imediata para evitar penalidades.';
  }
  if (alertLevel.value === 'warning') {
    return 'Esta obrigação requer atenção. Verifique o prazo e o status atual.';
  }
  if (alertLevel.value === 'ok') {
    return 'Esta obrigação foi concluída ou aprovada com sucesso.';
  }
  return 'Consulte os detalhes abaixo e tome a ação adequada.';
});

// Computed: vencimento
const isOverdue = computed(() => {
  if (!obligation.value?.data_vencimento) return false;
  const due = new Date(obligation.value.data_vencimento + 'T23:59:59');
  return due < new Date();
});

const dueTone = computed(() => {
  if (isOverdue.value) return 'error';
  const daysLeft = daysUntilDue.value;
  if (daysLeft !== null && daysLeft <= 7) return 'warning';
  return 'neutral';
});

const daysUntilDue = computed(() => {
  if (!obligation.value?.data_vencimento) return null;
  const due = new Date(obligation.value.data_vencimento + 'T23:59:59');
  const now = new Date();
  return Math.ceil((due - now) / (1000 * 60 * 60 * 24));
});

const dueHint = computed(() => {
  if (!obligation.value?.data_vencimento) return '';
  if (isOverdue.value) {
    const d = Math.abs(daysUntilDue.value ?? 0);
    return d === 1 ? 'Venceu ontem' : `Venceu há ${d} dias`;
  }
  const d = daysUntilDue.value ?? 0;
  if (d === 0) return 'Vence hoje';
  if (d === 1) return 'Vence amanhã';
  if (d <= 7) return `Vence em ${d} dias`;
  return '';
});

// Computed: rota da entidade vinculada
const entityRoute = computed(() => {
  if (!obligation.value) return '/';
  const tipo = obligation.value.entidade_tipo;
  const id = obligation.value.entidade_id;
  if (!tipo || !id) return '/';
  // PF → /pf/:id, PJ → /pj/:id
  return tipo === 'PF' ? `/pf/${id}` : `/pj/${id}`;
});

// Computed: subtitle da página
const subtitleText = computed(() => {
  if (!obligation.value) return '';
  const parts = [];
  if (obligation.value.periodicidade) parts.push(humanizePeriodicidade(obligation.value.periodicidade));
  if (obligation.value.entidade_tipo) parts.push(obligation.value.entidade_tipo);
  if (obligation.value.data_vencimento) parts.push('Vencimento: ' + format.formatDate(obligation.value.data_vencimento));
  return parts.join(' · ');
});

// Computed: controle de visibilidade de ações por status
const currentStatus = computed(() => String(obligation.value?.status || '').toLowerCase());

const canMarkPaid = computed(() => {
  return !['pago', 'paid', 'cancelado', 'cancelled', 'canceled'].some(s => currentStatus.value.includes(s));
});

const canApprove = computed(() => {
  return ['pendente', 'pending', 'review', 'revisão', 'aguardando'].some(s => currentStatus.value.includes(s));
});

const canCancel = computed(() => {
  return !['cancelado', 'cancelled', 'canceled', 'pago', 'paid'].some(s => currentStatus.value.includes(s));
});

// Helpers
function humanizePeriodicidade(v) {
  const map = { mensal: 'Mensal', trimestral: 'Trimestral', anual: 'Anual' };
  return map[v] || v;
}

function alertLevelLabel(level) {
  const map = { critico: 'Crítico', critica: 'Crítico', critical: 'Crítico', warning: 'Aviso', info: 'Informativo', low: 'Baixo', high: 'Alto', medium: 'Médio' };
  return map[String(level || '').toLowerCase()] || String(level || 'Info');
}

// Ações — delegam ao integrador api.js (patchObligationStatus). Sem fetch() direto em views.
async function updateStatus(newStatus, loadingKey) {
  actionLoading.value = loadingKey;
  try {
    return await patchObligationStatus(props.id, newStatus);
  } finally {
    actionLoading.value = null;
  }
}

async function markAsPaid() {
  const ok = await ask({
    title: 'Marcar como Pago',
    message: 'Confirma que esta obrigação foi quitada? Esta ação alterará o status para "Pago".',
    confirmLabel: 'Marcar como Pago',
    danger: false,
  });
  if (!ok) return;
  try {
    await updateStatus('pago', 'paid');
    toast.success('Obrigação marcada como paga com sucesso.');
    await load();
  } catch (e) {
    toast.error(e.message || 'Erro ao atualizar status. Tente novamente.');
  }
}

async function approve() {
  const ok = await ask({
    title: 'Aprovar Obrigação',
    message: 'Deseja aprovar esta obrigação fiscal? O status será alterado para "Aprovado".',
    confirmLabel: 'Aprovar',
    danger: false,
  });
  if (!ok) return;
  try {
    await updateStatus('aprovado', 'approved');
    toast.success('Obrigação aprovada com sucesso.');
    await load();
  } catch (e) {
    toast.error(e.message || 'Erro ao aprovar. Tente novamente.');
  }
}

async function cancel() {
  const ok = await ask({
    title: 'Cancelar Obrigação',
    message: 'Tem certeza que deseja cancelar esta obrigação fiscal? Esta ação não pode ser desfeita.',
    confirmLabel: 'Cancelar Obrigação',
    danger: true,
  });
  if (!ok) return;
  try {
    await updateStatus('cancelado', 'cancelled');
    toast.success('Obrigação cancelada.');
    await load();
  } catch (e) {
    toast.error(e.message || 'Erro ao cancelar. Tente novamente.');
  }
}

onMounted(load);
</script>

<style scoped>
/* ── Banner de alerta ──────────────────────────────────────────────── */
.alert-banner {
  display: flex;
  align-items: center;
  gap: var(--ui-space-3);
  padding: var(--ui-space-3) var(--ui-space-5);
  border-radius: var(--ui-radius-md);
  border: 1px solid transparent;
  flex-wrap: wrap;
}

.alert-banner[data-level="critical"] {
  background: rgb(var(--ui-danger) / 0.1);
  border-color: rgb(var(--ui-danger) / 0.35);
}

.alert-banner[data-level="warning"] {
  background: rgb(var(--ui-warn) / 0.1);
  border-color: rgb(var(--ui-warn) / 0.35);
}

.alert-banner[data-level="ok"] {
  background: rgb(var(--ui-ok) / 0.1);
  border-color: rgb(var(--ui-ok) / 0.35);
}

.alert-banner[data-level="info"] {
  background: rgb(var(--ui-accent) / 0.08);
  border-color: rgb(var(--ui-accent) / 0.25);
}

.alert-banner-icon {
  font-size: 1.5rem;
  flex-shrink: 0;
}

.alert-banner[data-level="critical"] .alert-banner-icon { color: rgb(var(--ui-danger)); }
.alert-banner[data-level="warning"] .alert-banner-icon { color: rgb(var(--ui-warn)); }
.alert-banner[data-level="ok"] .alert-banner-icon { color: rgb(var(--ui-ok)); }
.alert-banner[data-level="info"] .alert-banner-icon { color: rgb(var(--ui-accent-strong)); }

.alert-banner-body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-0\.5);
}

.alert-banner-title {
  font-size: var(--ui-text-sm);
  font-weight: 700;
  color: rgb(var(--ui-fg));
}

.alert-banner-desc {
  font-size: var(--ui-text-sm);
  color: rgb(var(--ui-muted));
}

/* ── Métricas ─────────────────────────────────────────────────────── */
.metrics-row {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: var(--ui-space-4);
}

/* ── Grade de detalhes ────────────────────────────────────────────── */
.detail-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: 0;
  margin: 0;
}

.detail-item {
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-1);
  padding: var(--ui-space-3) var(--ui-space-4);
  border-bottom: 1px solid rgb(var(--ui-border));
}

.detail-item:last-child {
  border-bottom: none;
}

.detail-item--full {
  grid-column: 1 / -1;
}

.detail-label {
  font-size: var(--ui-text-xs);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: rgb(var(--ui-muted));
  font-weight: 600;
}

.detail-value {
  font-size: var(--ui-text-base);
  color: rgb(var(--ui-fg));
  font-weight: 500;
  display: flex;
  align-items: center;
  gap: var(--ui-space-2);
  flex-wrap: wrap;
}

.detail-value[data-overdue="true"] {
  color: rgb(var(--ui-danger));
}

.detail-value--currency {
  font-family: var(--ui-font-display);
  font-size: var(--ui-text-lg);
  font-weight: 700;
}

.detail-value--description {
  font-weight: 400;
  line-height: 1.6;
  color: rgb(var(--ui-muted));
  white-space: pre-line;
}

.overdue-badge {
  font-size: var(--ui-text-xs);
  font-weight: 700;
  background: rgb(var(--ui-danger) / 0.15);
  color: rgb(var(--ui-danger));
  padding: var(--ui-space-px) var(--ui-space-2);
  border-radius: var(--ui-radius-pill);
}

/* ── Chip de tipo de entidade ─────────────────────────────────────── */
.entity-type-chip {
  display: inline-flex;
  align-items: center;
  font-size: var(--ui-text-sm);
  font-weight: 700;
  padding: var(--ui-space-0\.5) var(--ui-space-3);
  border-radius: var(--ui-radius-sm);
  background: rgb(var(--ui-surface-2));
  border: 1px solid rgb(var(--ui-border));
}

.entity-type-chip[data-kind="PF"] {
  background: rgb(var(--ui-accent) / 0.1);
  color: rgb(var(--ui-accent-strong));
  border-color: rgb(var(--ui-accent) / 0.25);
}

.entity-type-chip[data-kind="PJ"] {
  background: rgb(var(--ui-ok) / 0.1);
  color: rgb(var(--ui-ok));
  border-color: rgb(var(--ui-ok) / 0.25);
}

/* ── Link de entidade ─────────────────────────────────────────────── */
.entity-link {
  display: inline-flex;
  align-items: center;
  gap: var(--ui-space-1);
  color: rgb(var(--ui-accent-strong));
  font-weight: 600;
  text-decoration: none;
  border-radius: var(--ui-radius-sm);
  padding: var(--ui-space-px) var(--ui-space-1);
  transition: background 0.12s;
}

.entity-link:hover {
  background: rgb(var(--ui-accent) / 0.1);
  text-decoration: underline;
}

.entity-link:focus-visible {
  outline: 2px solid rgb(var(--ui-accent));
  outline-offset: 2px;
}

.entity-link-arrow {
  font-size: var(--ui-text-sm);
  opacity: 0.7;
}

/* ── Timeline de alertas ──────────────────────────────────────────── */
.timeline {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0;
}

.timeline-item {
  display: flex;
  gap: var(--ui-space-4);
  padding: var(--ui-space-3) var(--ui-space-4);
  position: relative;
}

.timeline-item + .timeline-item {
  border-top: 1px solid rgb(var(--ui-border));
}

.timeline-dot {
  flex-shrink: 0;
  width: var(--ui-space-2);
  height: var(--ui-space-2);
  border-radius: 50%;
  margin-top: var(--ui-space-1);
  background: rgb(var(--ui-muted));
  border: 2px solid rgb(var(--ui-surface));
  box-shadow: 0 0 0 1px rgb(var(--ui-border));
}

.timeline-item[data-tone="error"] .timeline-dot { background: rgb(var(--ui-danger)); box-shadow: 0 0 0 1px rgb(var(--ui-danger) / 0.4); }
.timeline-item[data-tone="warning"] .timeline-dot { background: rgb(var(--ui-warn)); box-shadow: 0 0 0 1px rgb(var(--ui-warn) / 0.4); }
.timeline-item[data-tone="success"] .timeline-dot { background: rgb(var(--ui-ok)); box-shadow: 0 0 0 1px rgb(var(--ui-ok) / 0.4); }
.timeline-item[data-tone="running"] .timeline-dot { background: rgb(var(--ui-accent)); box-shadow: 0 0 0 1px rgb(var(--ui-accent) / 0.4); }

.timeline-content {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-1);
}

.timeline-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: var(--ui-space-3);
  flex-wrap: wrap;
}

.timeline-label {
  display: flex;
  align-items: center;
}

.timeline-time {
  font-size: var(--ui-text-xs);
  color: rgb(var(--ui-muted));
  white-space: nowrap;
}

.timeline-msg {
  margin: 0;
  font-size: var(--ui-text-sm);
  color: rgb(var(--ui-fg));
  line-height: 1.5;
}

.timeline-channel {
  margin: 0;
  font-size: var(--ui-text-xs);
  color: rgb(var(--ui-muted));
}

/* ── Barra de ações ───────────────────────────────────────────────── */
.action-bar {
  display: flex;
  gap: var(--ui-space-3);
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-end;
  padding: var(--ui-space-4) 0;
  border-top: 1px solid rgb(var(--ui-border));
}

/* ── Responsivo ───────────────────────────────────────────────────── */
@media (max-width: 860px) {
  .metrics-row {
    grid-template-columns: repeat(2, 1fr);
  }

  .detail-grid {
    grid-template-columns: 1fr;
  }

  .action-bar {
    flex-direction: column-reverse;
    align-items: stretch;
  }
}

@media (max-width: 560px) {
  .metrics-row {
    grid-template-columns: 1fr;
  }

  .alert-banner {
    flex-direction: column;
    align-items: flex-start;
  }
}
</style>
