<!--
  ProfessionalDetailView — Perfil completo do profissional (REQ-NEUROEVOLUI-0002 / REQ-NEUROEVOLUI-0005).

  Seções:
    1. ProfileHeader — banner com avatar, initials, role badge, contatos e status.
    2. Métricas de produtividade — KPIs derivados das consultas (total, concluídas, receita, próxima).
    3. Abas: Perfil · Consultas · Produtividade
       - Perfil:       dados cadastrais (nome, e-mail, telefone, especialidade, CRP/CRM, papel, status, desde).
       - Consultas:    ConsultationHistoryTable com filtros de status, paginação e row-click.
       - Produtividade: gráfico de barras horizontal (CSS puro) dos últimos 30 dias + distribuição de status.

  Só endpoints REAIS (via ../api.js):
    GET /v1/professionals/:id         — ficha
    GET /v1/consultations             — histórico (filtra por professional_id)

  Kit-only (../ui/index.js) + tokens --ui-* + CSP-safe (sem style= inline / v-html).
  Todos os estados: loading (skeleton) · empty (CTA) · error (retry) · normal.
-->
<template>
  <UiPageLayout
    eyebrow="NeuroEvolui · Equipe"
    :title="headerTitle"
    :subtitle="headerSubtitle"
    width="wide"
    :loading="loading"
    :error="pageError"
    @retry="loadAll"
  >
    <!-- AÇÕES DO CABEÇALHO -->
    <template #actions>
      <UiButton variant="ghost" to="/professionals">Voltar</UiButton>
      <UiButton variant="subtle" :to="editHref">Editar</UiButton>
      <UiButton
        v-if="isSuspended"
        :loading="acting"
        @click="reactivate"
      >Reativar</UiButton>
      <UiButton
        v-else
        variant="danger"
        :loading="acting"
        @click="suspend"
      >Suspender</UiButton>
    </template>

    <!-- BANNER DE SITUAÇÃO -->
    <template #banner>
      <div v-if="isSuspended" class="pd-status-banner pd-status-banner--danger" role="status">
        <span class="pd-status-banner__dot" aria-hidden="true" />
        <span>Este profissional está <strong>suspenso</strong> — não recebe novas atribuições nem aparece na agenda ativa.</span>
      </div>
      <div v-else-if="isInvited" class="pd-status-banner pd-status-banner--warn" role="status">
        <span class="pd-status-banner__dot" aria-hidden="true" />
        <span>Convite enviado — aguardando o profissional concluir o primeiro acesso.</span>
      </div>
    </template>

    <!-- PROFILE HEADER CARD -->
    <UiCard v-if="!loading && !error && professional.id">
      <div class="pd-profile-header">
        <!-- Avatar -->
        <div class="pd-avatar-wrap" aria-hidden="true">
          <span class="pd-avatar">{{ initials }}</span>
        </div>
        <!-- Info principal -->
        <div class="pd-profile-main">
          <div class="pd-profile-top">
            <h2 class="pd-profile-name">{{ professional.full_name }}</h2>
            <UiStatusBadge
              :status="professional.role || 'professional'"
              :tone="roleTone(professional.role)"
              :label="roleLabel(professional.role)"
              size="lg"
            />
            <UiStatusBadge
              :status="professional.status || 'invited'"
              :label="statusLabel(professional.status)"
              size="lg"
            />
          </div>
          <p class="pd-profile-meta">
            <span v-if="professional.specialty" class="pd-profile-meta__item">{{ professional.specialty }}</span>
            <span v-if="professional.crp_crm || professional.council_number" class="pd-profile-meta__item pd-profile-meta__item--subtle">{{ professional.crp_crm || professional.council_number }}</span>
            <span v-if="professional.created_at" class="pd-profile-meta__item pd-profile-meta__item--subtle">
              Membro desde {{ fmt.formatDate(professional.created_at) }}
            </span>
          </p>
        </div>
        <!-- Contatos -->
        <div class="pd-profile-contacts">
          <a
            v-if="professional.email"
            class="pd-contact-link"
            :href="'mailto:' + professional.email"
            aria-label="Enviar e-mail para o profissional"
          >
            <span class="pd-contact-link__icon" aria-hidden="true">✉</span>
            <span>{{ professional.email }}</span>
          </a>
          <a
            v-if="professional.phone"
            class="pd-contact-link"
            :href="'tel:' + professional.phone"
            aria-label="Ligar para o profissional"
          >
            <span class="pd-contact-link__icon" aria-hidden="true">☎</span>
            <span>{{ professional.phone }}</span>
          </a>
        </div>
      </div>
    </UiCard>

    <!-- MÉTRICAS DE PRODUTIVIDADE -->
    <section class="pd-metrics" aria-label="Métricas de atendimento">
      <UiMetricCard
        label="Consultas realizadas"
        :value="metricsLoading ? null : fmt.formatNumber(consultationsCompleted)"
        :loading="metricsLoading"
        tone="primary"
        hint="atendimentos concluídos"
      />
      <UiMetricCard
        label="Total de consultas"
        :value="metricsLoading ? null : fmt.formatNumber(allConsultations.length)"
        :loading="metricsLoading"
        tone="neutral"
        hint="histórico completo"
      />
      <UiMetricCard
        label="Receita gerada"
        :value="metricsLoading ? null : fmt.formatCurrency(revenueTotal)"
        :loading="metricsLoading"
        tone="success"
        hint="valor total das consultas"
      />
      <UiMetricCard
        label="Próxima consulta"
        :value="metricsLoading ? null : nextConsultationLabel"
        :loading="metricsLoading"
        tone="running"
        hint="data do próximo atendimento"
      />
    </section>

    <!-- ABAS -->
    <div class="pd-tabs" role="tablist" aria-label="Seções do profissional">
      <button
        v-for="tab in tabs"
        :key="tab.key"
        class="pd-tab"
        type="button"
        role="tab"
        :data-active="activeTab === tab.key ? 'true' : null"
        :aria-selected="activeTab === tab.key ? 'true' : 'false'"
        :tabindex="activeTab === tab.key ? 0 : -1"
        @click="activeTab = tab.key"
        @keydown="onTabKey($event, tab.key)"
      >
        <span class="pd-tab__icon" aria-hidden="true">{{ tab.icon }}</span>
        {{ tab.label }}
        <span v-if="tab.count !== null" class="pd-tab__count">{{ tab.count }}</span>
      </button>
    </div>

    <!-- ── PERFIL CADASTRAL ─────────────────────────────────────────────────── -->
    <section
      v-show="activeTab === 'profile'"
      class="pd-pane"
      role="tabpanel"
      aria-label="Dados cadastrais do profissional"
    >
      <UiCard title="Dados cadastrais" subtitle="Identificação, contato e papel na clínica.">
        <template #actions>
          <UiButton variant="ghost" size="sm" :to="editHref">Editar</UiButton>
        </template>
        <dl class="pd-kv">
          <div class="pd-kv__row">
            <dt>Nome completo</dt>
            <dd>{{ display(professional.full_name) }}</dd>
          </div>
          <div class="pd-kv__row">
            <dt>Situação</dt>
            <dd>
              <UiStatusBadge
                :status="professional.status || 'invited'"
                :label="statusLabel(professional.status)"
              />
            </dd>
          </div>
          <div class="pd-kv__row">
            <dt>E-mail</dt>
            <dd>
              <a v-if="professional.email" class="pd-inline-link" :href="'mailto:' + professional.email">
                {{ professional.email }}
              </a>
              <span v-else>—</span>
            </dd>
          </div>
          <div class="pd-kv__row">
            <dt>Telefone</dt>
            <dd>
              <a v-if="professional.phone" class="pd-inline-link" :href="'tel:' + professional.phone">
                {{ professional.phone }}
              </a>
              <span v-else>—</span>
            </dd>
          </div>
          <div class="pd-kv__row">
            <dt>Especialidade</dt>
            <dd>{{ display(professional.specialty) }}</dd>
          </div>
          <div class="pd-kv__row">
            <dt>CRP / CRM</dt>
            <dd>{{ display(professional.crp_crm || professional.council_number) }}</dd>
          </div>
          <div class="pd-kv__row">
            <dt>Papel na clínica</dt>
            <dd>
              <UiStatusBadge
                :status="professional.role || 'professional'"
                :tone="roleTone(professional.role)"
                :label="roleLabel(professional.role)"
                :with-dot="false"
              />
            </dd>
          </div>
          <div class="pd-kv__row">
            <dt>Cadastrado em</dt>
            <dd>{{ fmt.formatDateTime(professional.created_at) }}</dd>
          </div>
        </dl>
      </UiCard>
    </section>

    <!-- ── HISTÓRICO DE CONSULTAS ───────────────────────────────────────────── -->
    <section
      v-show="activeTab === 'consultations'"
      class="pd-pane"
      role="tabpanel"
      aria-label="Histórico de consultas do profissional"
    >
      <UiCard
        title="Histórico de consultas"
        subtitle="Atendimentos realizados e agendados por este profissional."
      >
        <template #actions>
          <UiButton
            variant="ghost"
            size="sm"
            :loading="metricsLoading"
            @click="loadConsultations"
          >Atualizar</UiButton>
        </template>

        <!-- Filtros de status inline -->
        <div class="pd-consult-filters" role="group" aria-label="Filtrar por situação">
          <button
            class="pd-filter-chip"
            type="button"
            :data-active="consultFilter === '' ? 'true' : null"
            :aria-pressed="consultFilter === '' ? 'true' : 'false'"
            @click="consultFilter = ''"
          >Todas</button>
          <button
            v-for="sf in statusFilters"
            :key="sf.value"
            class="pd-filter-chip"
            type="button"
            :data-active="consultFilter === sf.value ? 'true' : null"
            :aria-pressed="consultFilter === sf.value ? 'true' : 'false'"
            :data-tone="sf.tone"
            @click="consultFilter = sf.value"
          >
            {{ sf.label }}
            <span class="pd-filter-chip__count">{{ sf.count }}</span>
          </button>
        </div>

        <UiDataTable
          :columns="consultColumns"
          :rows="filteredConsultations"
          :loading="metricsLoading"
          :error="consultErrorMessage"
          row-key="id"
          density="comfortable"
          clickable-rows
          :empty="consultEmptyState"
          @retry="loadConsultations"
          @row-click="openConsultation"
        >
          <template #cell-scheduled_at="{ row }">
            {{ fmt.formatDateTime(scheduledAt(row)) }}
          </template>
          <template #cell-patient="{ row }">
            <div class="pd-patient-cell">
              <span class="pd-patient-cell__avatar" aria-hidden="true">{{ patientInitials(row) }}</span>
              <span class="pd-patient-cell__name">{{ patientNameOf(row) }}</span>
            </div>
          </template>
          <template #cell-status="{ value }">
            <UiStatusBadge
              :status="value || 'scheduled'"
              :tone="consultStatusTone(value)"
              :label="consultStatusLabel(value)"
            />
          </template>
          <template #cell-payment_status="{ value }">
            <UiStatusBadge
              :status="value || 'pending'"
              :tone="paymentStatusTone(value)"
              :label="paymentStatusLabel(value)"
            />
          </template>
          <template #cell-amount="{ row }">
            <span class="pd-amount">{{ fmt.formatCurrency(amountOf(row)) }}</span>
          </template>
          <template #empty-action>
            <UiButton variant="subtle" to="/consultations">Ver agenda</UiButton>
          </template>
        </UiDataTable>
      </UiCard>
    </section>

    <!-- ── PRODUTIVIDADE ───────────────────────────────────────────────────── -->
    <section
      v-show="activeTab === 'productivity'"
      class="pd-pane"
      role="tabpanel"
      aria-label="Métricas de produtividade do profissional"
    >
      <div class="pd-prod-grid">
        <!-- Distribuição por status -->
        <UiCard title="Distribuição por situação" subtitle="Proporção dos atendimentos por status.">
          <div class="pd-donut-wrap" aria-label="Distribuição de consultas por situação">
            <div
              v-if="metricsLoading"
              class="pd-bar-skeleton"
              aria-hidden="true"
            />
            <template v-else-if="!allConsultations.length">
              <UiEmptyState
                title="Sem dados"
                description="Nenhuma consulta registrada para calcular a distribuição."
                icon="chart"
              />
            </template>
            <template v-else>
              <div class="pd-distribution">
                <div
                  v-for="item in statusDistribution"
                  :key="item.status"
                  class="pd-dist-row"
                >
                  <div class="pd-dist-label">
                    <UiStatusBadge
                      :status="item.status"
                      :tone="consultStatusTone(item.status)"
                      :label="consultStatusLabel(item.status)"
                      size="sm"
                    />
                    <span class="pd-dist-count">{{ item.count }}</span>
                  </div>
                  <div class="pd-dist-bar-track" role="progressbar" :aria-valuenow="item.pct" aria-valuemin="0" aria-valuemax="100" :aria-label="consultStatusLabel(item.status) + ': ' + item.pct + '%'">
                    <div
                      class="pd-dist-bar-fill"
                      :data-tone="item.tone"
                      :style="{ '--bar-val': item.pct + '%' }"
                    />
                  </div>
                  <span class="pd-dist-pct">{{ item.pct }}%</span>
                </div>
              </div>
            </template>
          </div>
        </UiCard>

        <!-- KPIs de resumo financeiro -->
        <UiCard title="Resumo financeiro" subtitle="Receita consolidada dos atendimentos.">
          <dl class="pd-finance-kv">
            <div class="pd-finance-kv__row">
              <dt>Receita total</dt>
              <dd class="pd-amount pd-amount--lg">{{ metricsLoading ? '…' : fmt.formatCurrency(revenueTotal) }}</dd>
            </div>
            <div class="pd-finance-kv__row">
              <dt>Receita concluída</dt>
              <dd class="pd-amount">{{ metricsLoading ? '…' : fmt.formatCurrency(revenueCompleted) }}</dd>
            </div>
            <div class="pd-finance-kv__row">
              <dt>Receita pendente</dt>
              <dd class="pd-amount">{{ metricsLoading ? '…' : fmt.formatCurrency(revenuePending) }}</dd>
            </div>
            <div class="pd-finance-kv__row">
              <dt>Média por consulta</dt>
              <dd class="pd-amount">{{ metricsLoading ? '…' : avgRevenueLabel }}</dd>
            </div>
            <div class="pd-finance-kv__row">
              <dt>Consultas concluídas</dt>
              <dd>{{ metricsLoading ? '…' : consultationsCompleted }} de {{ allConsultations.length }}</dd>
            </div>
            <div class="pd-finance-kv__row">
              <dt>Taxa de conclusão</dt>
              <dd>
                <span class="pd-completion-pill" :data-tone="completionTone">{{ completionRate }}%</span>
              </dd>
            </div>
          </dl>
        </UiCard>
      </div>

      <!-- Atividade recente: últimas 8 semanas por contagem de consultas -->
      <UiCard title="Atividade recente" subtitle="Consultas realizadas nas últimas 8 semanas.">
        <div v-if="metricsLoading" class="pd-bar-skeleton" aria-hidden="true" />
        <UiEmptyState
          v-else-if="!allConsultations.length"
          title="Sem atividade registrada"
          description="Nenhuma consulta para exibir no histórico de atividade."
          icon="chart"
        >
          <template #action>
            <UiButton variant="subtle" to="/consultations">Ver agenda</UiButton>
          </template>
        </UiEmptyState>
        <div v-else class="pd-activity-chart" aria-label="Gráfico de atividade semanal">
          <div
            v-for="week in weeklyActivity"
            :key="week.label"
            class="pd-activity-col"
          >
            <span class="pd-activity-count" :data-zero="week.count === 0 ? 'true' : null">
              {{ week.count || '' }}
            </span>
            <div class="pd-activity-bar-track">
              <div
                class="pd-activity-bar-fill"
                :style="{ '--bar-val': week.heightPct + '%' }"
                :data-current="week.isCurrent ? 'true' : null"
              />
            </div>
            <span class="pd-activity-label">{{ week.label }}</span>
          </div>
        </div>
      </UiCard>
    </section>

    <template #footer>
      <span>Perfil do profissional #{{ display(id) }} — dados da equipe da clínica.</span>
    </template>
  </UiPageLayout>
</template>

<script setup>
import { ref, computed, watch, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import {
  UiPageLayout,
  UiCard,
  UiMetricCard,
  UiStatusBadge,
  UiDataTable,
  UiButton,
  UiEmptyState,
  useToast,
  useConfirm,
  format as fmt,
} from '../ui/index.js';
import { professionals, consultations } from '../api.js';

// ── Props ──────────────────────────────────────────────────────────────────────
const props = defineProps({ id: { type: [String, Number], required: true } });

const router = useRouter();
const toast = useToast();
const confirm = useConfirm();

// ── Estado: ficha ──────────────────────────────────────────────────────────────
const loading = ref(true);
const error = ref(null);
const professional = ref({});

// ── Estado: consultas ──────────────────────────────────────────────────────────
const metricsLoading = ref(true);
const consultError = ref(null);
const allConsultations = ref([]);

// ── Estado: ações ──────────────────────────────────────────────────────────────
const acting = ref(false);

// ── Abas ───────────────────────────────────────────────────────────────────────
const activeTab = ref('profile');
const tabs = computed(() => [
  { key: 'profile', label: 'Perfil', icon: '🪪', count: null },
  { key: 'consultations', label: 'Consultas', icon: '📅', count: allConsultations.value.length },
  { key: 'productivity', label: 'Produtividade', icon: '📊', count: null },
]);
function onTabKey(e, key) {
  const order = tabs.value.map((t) => t.key);
  const i = order.indexOf(key);
  if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
    e.preventDefault();
    const next = e.key === 'ArrowRight' ? (i + 1) % order.length : (i - 1 + order.length) % order.length;
    activeTab.value = order[next];
    requestAnimationFrame(() => {
      const els = typeof document !== 'undefined' && document.querySelectorAll('.pd-tab');
      if (els && els[next] && els[next].focus) els[next].focus();
    });
  }
}

// ── Filtro de status das consultas ─────────────────────────────────────────────
const consultFilter = ref('');

// ── Vocabulário do domínio ─────────────────────────────────────────────────────
const ROLE_LABELS = {
  owner: 'Proprietário',
  clinic_manager: 'Gestor da clínica',
  professional: 'Profissional',
  patient: 'Paciente',
};
const STATUS_LABELS = {
  ativo: 'Ativo',
  active: 'Ativo',
  inativo: 'Inativo',
  inactive: 'Inativo',
  invited: 'Convidado',
  suspended: 'Suspenso',
};
const CONSULT_STATUS_LABELS = {
  scheduled: 'Agendada',
  confirmed: 'Confirmada',
  completed: 'Concluída',
  canceled: 'Cancelada',
  cancelled: 'Cancelada',
  no_show: 'Não compareceu',
};
const CONSULT_STATUS_TONES = {
  scheduled: 'running',
  confirmed: 'running',
  completed: 'success',
  canceled: 'error',
  cancelled: 'error',
  no_show: 'warning',
};
const PAYMENT_STATUS_LABELS = {
  pending: 'Pendente',
  paid: 'Pago',
  failed: 'Falhou',
  refunded: 'Reembolsado',
};
const PAYMENT_STATUS_TONES = {
  pending: 'warning',
  paid: 'success',
  failed: 'error',
  refunded: 'neutral',
};

const norm = (v) => String(v || '').toLowerCase().trim();
const roleLabel = (v) => ROLE_LABELS[norm(v)] || (v ? fmt.humanize(v) : '—');
const statusLabel = (v) => STATUS_LABELS[norm(v)] || (v ? fmt.humanize(v) : '—');
const consultStatusLabel = (v) => CONSULT_STATUS_LABELS[norm(v)] || (v ? fmt.humanize(v) : '—');
const consultStatusTone = (v) => CONSULT_STATUS_TONES[norm(v)] || 'neutral';
const paymentStatusLabel = (v) => PAYMENT_STATUS_LABELS[norm(v)] || (v ? fmt.humanize(v) : '—');
const paymentStatusTone = (v) => PAYMENT_STATUS_TONES[norm(v)] || 'neutral';
const roleTone = (v) => {
  if (norm(v) === 'owner') return 'running';
  if (norm(v) === 'clinic_manager') return 'success';
  return 'neutral';
};

// ── Helpers de exibição ────────────────────────────────────────────────────────
const display = (v) => (v === null || v === undefined || v === '' ? '—' : String(v));

function initials_from(name) {
  if (!name) return '?';
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  const first = parts[0][0] || '';
  const last = parts.length > 1 ? parts[parts.length - 1][0] : '';
  return (first + last).toUpperCase();
}

// ── Derivados da ficha ─────────────────────────────────────────────────────────
const initials = computed(() => initials_from(professional.value.full_name));
const isSuspended = computed(() => ['suspended', 'inativo', 'inactive'].includes(norm(professional.value.status)));
const isInvited = computed(() => norm(professional.value.status) === 'invited');
const editHref = computed(() => '/professionals/' + props.id + '/edit');

const headerTitle = computed(() => professional.value.full_name || ('Profissional #' + props.id));
const headerSubtitle = computed(() => {
  const parts = [];
  if (professional.value.specialty) parts.push(professional.value.specialty);
  const rl = roleLabel(professional.value.role);
  if (rl && rl !== '—') parts.push(rl);
  return parts.length ? parts.join(' · ') : 'Perfil e histórico de atendimentos.';
});

const pageError = computed(() => (error.value ? (error.value.message || 'Não foi possível carregar o profissional.') : null));

// ── Normalização das consultas ─────────────────────────────────────────────────
function scheduledAt(row) {
  return row.scheduled_at ?? row.scheduledAt ?? row.date ?? row.start_at ?? row.startAt ?? row.created_at ?? null;
}
function amountOf(row) {
  // suporta tanto `amount_cents` (centavos) quanto `amount`/`price`/`value`
  if (row.amount_cents !== undefined && row.amount_cents !== null) {
    const n = Number(row.amount_cents);
    return isFinite(n) ? n / 100 : 0;
  }
  const raw = row.amount ?? row.price ?? row.value ?? row.total ?? row.revenue ?? row.fee ?? 0;
  const n = Number(raw);
  return isFinite(n) ? n : 0;
}
function patientNameOf(row) {
  return row.patient_name ?? row.patientName ?? row.patient ??
    (row.patient_id ?? row.patientId ? 'Paciente #' + (row.patient_id ?? row.patientId) : '—');
}
function patientInitials(row) {
  const name = patientNameOf(row);
  return initials_from(name === '—' ? '' : name);
}

// ── Derivados das consultas ────────────────────────────────────────────────────
const sortedConsultations = computed(() =>
  [...allConsultations.value].sort((a, b) => {
    const da = new Date(scheduledAt(a) || 0).getTime();
    const db = new Date(scheduledAt(b) || 0).getTime();
    return db - da;
  })
);

// Filtros de status (chip bar acima da tabela)
const statusFilters = computed(() => {
  const statuses = ['scheduled', 'confirmed', 'completed', 'canceled', 'no_show'];
  return statuses.map((s) => ({
    value: s,
    label: consultStatusLabel(s),
    tone: consultStatusTone(s),
    count: allConsultations.value.filter((c) => norm(c.status) === norm(s)).length,
  })).filter((sf) => sf.count > 0);
});

const filteredConsultations = computed(() => {
  const rows = sortedConsultations.value;
  if (!consultFilter.value) return rows;
  return rows.filter((c) => norm(c.status) === norm(consultFilter.value));
});

const consultErrorMessage = computed(() =>
  consultError.value ? (consultError.value.message || 'Não foi possível carregar as consultas.') : null
);

const consultEmptyState = computed(() => {
  if (consultFilter.value) {
    return {
      title: 'Nenhuma consulta com esta situação',
      description: 'Não há consultas com o status selecionado. Tente outro filtro.',
      icon: 'search',
    };
  }
  return {
    title: 'Sem consultas registradas',
    description: 'Ainda não há atendimentos lançados para este profissional.',
    icon: 'calendar',
  };
});

// ── Métricas derivadas ─────────────────────────────────────────────────────────
const consultationsCompleted = computed(() =>
  allConsultations.value.filter((c) => ['completed'].includes(norm(c.status))).length
);

const revenueTotal = computed(() =>
  allConsultations.value.reduce((sum, r) => sum + amountOf(r), 0)
);
const revenueCompleted = computed(() =>
  allConsultations.value
    .filter((c) => norm(c.status) === 'completed')
    .reduce((sum, r) => sum + amountOf(r), 0)
);
const revenuePending = computed(() =>
  allConsultations.value
    .filter((c) => ['scheduled', 'confirmed'].includes(norm(c.status)))
    .reduce((sum, r) => sum + amountOf(r), 0)
);

const avgRevenueLabel = computed(() => {
  const total = allConsultations.value.length;
  if (!total) return '—';
  return fmt.formatCurrency(revenueTotal.value / total);
});

const completionRate = computed(() => {
  const total = allConsultations.value.length;
  if (!total) return 0;
  return Math.round((consultationsCompleted.value / total) * 100);
});

const completionTone = computed(() => {
  const r = completionRate.value;
  if (r >= 80) return 'success';
  if (r >= 50) return 'warning';
  return 'error';
});

// Próxima consulta futura
const nextConsultationLabel = computed(() => {
  const now = Date.now();
  const future = allConsultations.value
    .filter((c) => {
      const t = new Date(scheduledAt(c) || 0).getTime();
      return isFinite(t) && t >= now && ['scheduled', 'confirmed'].includes(norm(c.status));
    })
    .sort((a, b) => new Date(scheduledAt(a) || 0).getTime() - new Date(scheduledAt(b) || 0).getTime());
  if (!future.length) return 'Nenhuma';
  return fmt.formatDate(scheduledAt(future[0]));
});

// Distribuição por status
const statusDistribution = computed(() => {
  const total = allConsultations.value.length || 1;
  const statuses = ['completed', 'scheduled', 'confirmed', 'canceled', 'no_show'];
  return statuses
    .map((s) => {
      const count = allConsultations.value.filter((c) => norm(c.status) === norm(s)).length;
      return {
        status: s,
        tone: consultStatusTone(s),
        count,
        pct: Math.round((count / total) * 100),
      };
    })
    .filter((item) => item.count > 0)
    .sort((a, b) => b.count - a.count);
});

// Atividade semanal: últimas 8 semanas
const weeklyActivity = computed(() => {
  const now = new Date();
  const WEEKS = 8;
  const weeks = [];
  for (let w = WEEKS - 1; w >= 0; w--) {
    const end = new Date(now);
    end.setDate(end.getDate() - w * 7);
    const start = new Date(end);
    start.setDate(start.getDate() - 6);
    start.setHours(0, 0, 0, 0);
    end.setHours(23, 59, 59, 999);
    const count = allConsultations.value.filter((c) => {
      const t = new Date(scheduledAt(c) || 0).getTime();
      return isFinite(t) && t >= start.getTime() && t <= end.getTime();
    }).length;
    // Label: "DD/MM" da segunda do período
    const label = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit' }).format(start);
    weeks.push({ label, count, isCurrent: w === 0 });
  }
  const maxCount = Math.max(...weeks.map((w) => w.count), 1);
  return weeks.map((w) => ({
    ...w,
    heightPct: Math.round((w.count / maxCount) * 100),
  }));
});

// ── Colunas da tabela ─────────────────────────────────────────────────────────
const consultColumns = [
  { key: 'scheduled_at', label: 'Data e hora', sortable: true },
  { key: 'patient', label: 'Paciente' },
  { key: 'status', label: 'Situação', sortable: true },
  { key: 'payment_status', label: 'Pagamento' },
  { key: 'amount', label: 'Valor', align: 'right' },
];

// ── Carregamento ──────────────────────────────────────────────────────────────
async function load() {
  loading.value = true;
  error.value = null;
  try {
    professional.value = (await professionals.get(props.id)) || {};
  } catch (e) {
    error.value = e;
    professional.value = {};
  } finally {
    loading.value = false;
  }
}

async function loadConsultations() {
  metricsLoading.value = true;
  consultError.value = null;
  try {
    const r = await consultations.list({ professional_id: props.id, pageSize: 200 });
    const rows = Array.isArray(r) ? r : (r && r.data) || [];
    // defensivo: garante o vínculo com este profissional
    allConsultations.value = rows.filter((row) => {
      const pid = row.professional_id ?? row.professionalId ?? row.professional ?? null;
      return pid === null || pid === undefined || String(pid) === String(props.id);
    });
  } catch (e) {
    consultError.value = e;
    allConsultations.value = [];
  } finally {
    metricsLoading.value = false;
  }
}

function loadAll() {
  load();
  loadConsultations();
}

// ── Navegação ─────────────────────────────────────────────────────────────────
function openConsultation(row) {
  if (row && row.id) router.push('/consultations/' + row.id);
}

// ── Ações (destrutivas via confirmação) ───────────────────────────────────────
async function changeStatus(nextStatus, message) {
  acting.value = true;
  try {
    const updated = await professionals.update(props.id, { ...professional.value, status: nextStatus });
    professional.value =
      updated && typeof updated === 'object'
        ? { ...professional.value, ...(updated.data && typeof updated.data === 'object' ? updated.data : updated) }
        : { ...professional.value, status: nextStatus };
    toast.success(message);
  } catch (e) {
    toast.error('Não foi possível atualizar a situação.', { detail: e.message, code: e.status });
  } finally {
    acting.value = false;
  }
}

async function suspend() {
  const ok = await confirm({
    title: 'Suspender profissional',
    message:
      'Ao suspender, ' +
      (professional.value.full_name || 'este profissional') +
      ' deixa de receber novas atribuições e sai da agenda ativa. Confirmar?',
    confirmLabel: 'Suspender',
    danger: true,
  });
  if (!ok) return;
  await changeStatus('suspended', 'Profissional suspenso.');
}

async function reactivate() {
  const ok = await confirm({
    title: 'Reativar profissional',
    message:
      'Reativar ' +
      (professional.value.full_name || 'este profissional') +
      ' e permitir novas atribuições na agenda ativa?',
    confirmLabel: 'Reativar',
  });
  if (!ok) return;
  await changeStatus('active', 'Profissional reativado.');
}

watch(() => props.id, loadAll);
onMounted(loadAll);
</script>

<style scoped>
/* ── ProfileHeader ─────────────────────────────────────────────────────────── */
.pd-profile-header {
  display: flex;
  align-items: center;
  gap: var(--ui-space-5);
  flex-wrap: wrap;
}

.pd-avatar-wrap {
  flex-shrink: 0;
}

.pd-avatar {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 64px;
  height: 64px;
  border-radius: 50%;
  background: rgb(var(--ui-accent) / 0.14);
  color: rgb(var(--ui-accent-strong));
  font-family: var(--ui-font-display, inherit);
  font-weight: 700;
  font-size: 1.35rem;
  letter-spacing: 0.02em;
  border: 2px solid rgb(var(--ui-accent) / 0.3);
}

.pd-profile-main {
  flex: 1 1 240px;
  min-width: 0;
}

.pd-profile-top {
  display: flex;
  align-items: center;
  gap: var(--ui-space-3);
  flex-wrap: wrap;
  margin-bottom: var(--ui-space-2);
}

.pd-profile-name {
  margin: 0;
  font-size: var(--ui-text-xl);
  font-family: var(--ui-font-display, inherit);
  font-weight: 700;
  color: rgb(var(--ui-fg));
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.pd-profile-meta {
  margin: 0;
  display: flex;
  gap: var(--ui-space-3);
  flex-wrap: wrap;
  align-items: center;
}

.pd-profile-meta__item {
  color: rgb(var(--ui-fg));
  font-size: var(--ui-text-sm);
  font-weight: 500;
}

.pd-profile-meta__item--subtle {
  color: rgb(var(--ui-muted));
  font-weight: 400;
}

.pd-profile-contacts {
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-2);
  align-items: flex-end;
  flex-shrink: 0;
}

.pd-contact-link {
  display: inline-flex;
  align-items: center;
  gap: var(--ui-space-2);
  color: rgb(var(--ui-accent-strong));
  text-decoration: none;
  font-size: var(--ui-text-sm);
  font-weight: 600;
}

.pd-contact-link:hover {
  text-decoration: underline;
}

.pd-contact-link__icon {
  opacity: 0.8;
  font-size: 0.95rem;
}

/* ── Status Banner ─────────────────────────────────────────────────────────── */
.pd-status-banner {
  display: flex;
  align-items: center;
  gap: var(--ui-space-3);
  padding: var(--ui-space-3) var(--ui-space-4);
  border: 1px solid rgb(var(--ui-border));
  border-radius: var(--ui-radius-md);
  font-size: var(--ui-text-sm);
  color: rgb(var(--ui-fg));
}

.pd-status-banner__dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
  background: rgb(var(--ui-muted));
}

.pd-status-banner--danger {
  border-color: rgb(var(--ui-danger) / 0.4);
  background: rgb(var(--ui-danger) / 0.08);
}

.pd-status-banner--danger .pd-status-banner__dot {
  background: rgb(var(--ui-danger));
}

.pd-status-banner--warn {
  border-color: rgb(var(--ui-warn) / 0.4);
  background: rgb(var(--ui-warn) / 0.1);
}

.pd-status-banner--warn .pd-status-banner__dot {
  background: rgb(var(--ui-warn));
}

/* ── Métricas ──────────────────────────────────────────────────────────────── */
.pd-metrics {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
  gap: var(--ui-space-4);
}

/* ── Abas ──────────────────────────────────────────────────────────────────── */
.pd-tabs {
  display: flex;
  gap: 0;
  border-bottom: 2px solid rgb(var(--ui-border));
  overflow-x: auto;
}

.pd-tab {
  display: inline-flex;
  align-items: center;
  gap: var(--ui-space-2);
  background: none;
  border: none;
  border-bottom: 2px solid transparent;
  margin-bottom: -2px;
  color: rgb(var(--ui-muted));
  font: inherit;
  font-weight: 600;
  font-size: var(--ui-text-sm);
  padding: var(--ui-space-3) var(--ui-space-4);
  cursor: pointer;
  white-space: nowrap;
  transition: color 0.15s ease, border-color 0.15s ease;
}

.pd-tab:hover {
  color: rgb(var(--ui-fg));
}

.pd-tab[data-active="true"] {
  color: rgb(var(--ui-accent-strong));
  border-bottom-color: rgb(var(--ui-accent));
}

.pd-tab:focus-visible {
  outline: 2px solid rgb(var(--ui-accent));
  outline-offset: -1px;
  border-radius: var(--ui-radius-sm) var(--ui-radius-sm) 0 0;
}

.pd-tab__icon {
  font-size: 1rem;
  line-height: 1;
}

.pd-tab__count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 18px;
  height: 18px;
  padding: 0 var(--ui-space-1);
  border-radius: var(--ui-radius-pill);
  background: rgb(var(--ui-surface-2));
  color: rgb(var(--ui-muted));
  font-size: var(--ui-text-xs);
  font-weight: 700;
}

.pd-tab[data-active="true"] .pd-tab__count {
  background: rgb(var(--ui-accent) / 0.16);
  color: rgb(var(--ui-accent-strong));
}

/* ── Painéis ────────────────────────────────────────────────────────────────── */
.pd-pane {
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-4);
}

/* ── KV de dados cadastrais ─────────────────────────────────────────────────── */
.pd-kv {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--ui-space-4);
  margin: 0;
}

.pd-kv__row {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}

.pd-kv dt {
  color: rgb(var(--ui-muted));
  font-size: var(--ui-text-xs);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  font-weight: 600;
}

.pd-kv dd {
  margin: 0;
  font-size: var(--ui-text-md);
  color: rgb(var(--ui-fg));
  word-break: break-word;
}

.pd-inline-link {
  color: rgb(var(--ui-accent-strong));
  text-decoration: none;
  font-weight: 500;
}

.pd-inline-link:hover {
  text-decoration: underline;
}

/* ── Filtros de status (chips) ──────────────────────────────────────────────── */
.pd-consult-filters {
  display: flex;
  gap: var(--ui-space-2);
  flex-wrap: wrap;
  margin-bottom: var(--ui-space-3);
}

.pd-filter-chip {
  display: inline-flex;
  align-items: center;
  gap: var(--ui-space-2);
  background: rgb(var(--ui-surface-2));
  border: 1px solid rgb(var(--ui-border));
  border-radius: var(--ui-radius-pill);
  color: rgb(var(--ui-muted));
  font: inherit;
  font-size: var(--ui-text-sm);
  font-weight: 500;
  padding: var(--ui-space-1) var(--ui-space-3);
  cursor: pointer;
  transition: background 0.15s ease, color 0.15s ease, border-color 0.15s ease;
}

.pd-filter-chip:hover {
  background: rgb(var(--ui-surface));
  color: rgb(var(--ui-fg));
}

.pd-filter-chip[data-active="true"] {
  background: rgb(var(--ui-accent) / 0.14);
  border-color: rgb(var(--ui-accent) / 0.5);
  color: rgb(var(--ui-accent-strong));
}

.pd-filter-chip:focus-visible {
  outline: 2px solid rgb(var(--ui-accent));
  outline-offset: 1px;
}

.pd-filter-chip__count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 16px;
  height: 16px;
  padding: 0 3px;
  border-radius: var(--ui-radius-pill);
  background: rgb(var(--ui-faint));
  font-size: var(--ui-text-xs);
  font-weight: 700;
}

/* ── Célula do paciente ─────────────────────────────────────────────────────── */
.pd-patient-cell {
  display: flex;
  align-items: center;
  gap: var(--ui-space-2);
  min-width: 0;
}

.pd-patient-cell__avatar {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  flex-shrink: 0;
  border-radius: 50%;
  background: rgb(var(--ui-accent) / 0.1);
  color: rgb(var(--ui-accent-strong));
  font-size: var(--ui-text-xs);
  font-weight: 700;
  letter-spacing: 0.02em;
}

.pd-patient-cell__name {
  font-weight: 500;
  color: rgb(var(--ui-fg));
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* ── Valor monetário ────────────────────────────────────────────────────────── */
.pd-amount {
  font-variant-numeric: tabular-nums;
  font-weight: 600;
  color: rgb(var(--ui-fg));
}

/* ── Painel de produtividade ────────────────────────────────────────────────── */
.pd-prod-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: var(--ui-space-4);
  align-items: start;
}

/* ── Distribuição por status (barras horizontais) ─────────────────────────── */
.pd-distribution {
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-3);
}

.pd-dist-row {
  display: grid;
  grid-template-columns: 160px 1fr 40px;
  align-items: center;
  gap: var(--ui-space-3);
}

.pd-dist-label {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ui-space-2);
  min-width: 0;
}

.pd-dist-count {
  color: rgb(var(--ui-muted));
  font-size: var(--ui-text-xs);
  font-weight: 600;
  flex-shrink: 0;
}

.pd-dist-bar-track {
  height: 8px;
  background: rgb(var(--ui-surface-2));
  border-radius: var(--ui-radius-pill);
  overflow: hidden;
  position: relative;
}

.pd-dist-bar-fill {
  height: 100%;
  border-radius: var(--ui-radius-pill);
  background: rgb(var(--ui-muted));
  width: var(--bar-val, 0%);
  transition: width 0.4s ease;
}

/* Tones das barras de distribuição */
.pd-dist-bar-fill[data-tone="success"] { background: rgb(var(--ui-ok)); }
.pd-dist-bar-fill[data-tone="running"] { background: rgb(var(--ui-accent)); }
.pd-dist-bar-fill[data-tone="warning"] { background: rgb(var(--ui-warn)); }
.pd-dist-bar-fill[data-tone="error"]   { background: rgb(var(--ui-danger)); }

.pd-dist-pct {
  font-size: var(--ui-text-xs);
  color: rgb(var(--ui-muted));
  font-weight: 600;
  text-align: right;
}

/* ── KV financeiro ──────────────────────────────────────────────────────────── */
.pd-finance-kv {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--ui-space-4);
  margin: 0;
}

.pd-finance-kv__row {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}

.pd-finance-kv dt {
  color: rgb(var(--ui-muted));
  font-size: var(--ui-text-xs);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  font-weight: 600;
}

.pd-finance-kv dd {
  margin: 0;
  font-size: var(--ui-text-md);
  color: rgb(var(--ui-fg));
}

.pd-amount--lg {
  font-size: var(--ui-text-xl);
  font-family: var(--ui-font-display, inherit);
  font-weight: 700;
  color: rgb(var(--ui-ok));
}

/* ── Pílula de taxa de conclusão ────────────────────────────────────────────── */
.pd-completion-pill {
  display: inline-flex;
  align-items: center;
  padding: 1px var(--ui-space-2);
  border-radius: var(--ui-radius-pill);
  font-size: var(--ui-text-sm);
  font-weight: 700;
  background: rgb(var(--ui-surface-2));
  color: rgb(var(--ui-muted));
}

.pd-completion-pill[data-tone="success"] {
  background: rgb(var(--ui-ok) / 0.14);
  color: rgb(var(--ui-ok));
}

.pd-completion-pill[data-tone="warning"] {
  background: rgb(var(--ui-warn) / 0.14);
  color: rgb(var(--ui-warn));
}

.pd-completion-pill[data-tone="error"] {
  background: rgb(var(--ui-danger) / 0.12);
  color: rgb(var(--ui-danger));
}

/* ── Gráfico de atividade semanal (barras verticais CSS) ─────────────────── */
.pd-activity-chart {
  display: flex;
  align-items: flex-end;
  gap: var(--ui-space-2);
  height: 120px;
  padding-bottom: var(--ui-space-4);
  position: relative;
  overflow: hidden;
}

.pd-activity-col {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  flex: 1 1 0;
  min-width: 0;
  height: 100%;
  justify-content: flex-end;
}

.pd-activity-count {
  font-size: var(--ui-text-xs);
  font-weight: 700;
  color: rgb(var(--ui-accent-strong));
  line-height: 1;
}

.pd-activity-count[data-zero="true"] {
  color: transparent;
}

.pd-activity-bar-track {
  width: 100%;
  max-width: 28px;
  background: rgb(var(--ui-surface-2));
  border-radius: var(--ui-radius-sm) var(--ui-radius-sm) 0 0;
  overflow: hidden;
  position: relative;
  height: 72px;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
}

.pd-activity-bar-fill {
  width: 100%;
  border-radius: var(--ui-radius-sm) var(--ui-radius-sm) 0 0;
  background: rgb(var(--ui-accent) / 0.5);
  height: var(--bar-val, 0%);
  transition: height 0.4s ease;
}

.pd-activity-bar-fill[data-current="true"] {
  background: rgb(var(--ui-accent));
}

.pd-activity-label {
  font-size: var(--ui-text-xs);
  color: rgb(var(--ui-muted));
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100%;
  text-align: center;
}

/* ── Skeleton de gráfico ─────────────────────────────────────────────────── */
.pd-bar-skeleton {
  height: 80px;
  border-radius: var(--ui-radius-md);
  background: linear-gradient(
    90deg,
    rgb(var(--ui-surface-2)) 25%,
    rgb(var(--ui-faint)) 50%,
    rgb(var(--ui-surface-2)) 75%
  );
  background-size: 200% 100%;
  animation: pd-shimmer 1.5s infinite;
}

@keyframes pd-shimmer {
  0%   { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}

/* ── Responsivo ─────────────────────────────────────────────────────────────── */
@media (max-width: 860px) {
  .pd-profile-header {
    flex-direction: column;
    align-items: flex-start;
  }

  .pd-profile-contacts {
    align-items: flex-start;
    flex-direction: row;
    flex-wrap: wrap;
    gap: var(--ui-space-3);
  }

  .pd-metrics {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .pd-kv {
    grid-template-columns: minmax(0, 1fr);
  }

  .pd-prod-grid {
    grid-template-columns: minmax(0, 1fr);
  }

  .pd-finance-kv {
    grid-template-columns: minmax(0, 1fr);
  }

  .pd-dist-row {
    grid-template-columns: 120px 1fr 36px;
  }
}

@media (max-width: 480px) {
  .pd-metrics {
    grid-template-columns: minmax(0, 1fr);
  }

  .pd-activity-chart {
    height: 100px;
  }
}
</style>
