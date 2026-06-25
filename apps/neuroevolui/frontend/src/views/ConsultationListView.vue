<template>
  <UiPageLayout
    eyebrow="Agenda clínica"
    title="Agendamentos"
    subtitle="Consultas do tenant — filtre por profissional, paciente, status e período. Alterne entre tabela e calendário semanal."
    width="wide"
    :error="pageError"
    @retry="reload"
  >
    <template #actions>
      <!-- Alternador de visão (tabela ↔ calendário) -->
      <div class="cl-view-toggle" role="group" aria-label="Alternar visão">
        <button
          class="cl-toggle-btn"
          :data-active="viewMode === 'table'"
          type="button"
          :aria-pressed="viewMode === 'table'"
          @click="viewMode = 'table'"
        >
          <span aria-hidden="true">⊞</span> Tabela
        </button>
        <button
          class="cl-toggle-btn"
          :data-active="viewMode === 'calendar'"
          type="button"
          :aria-pressed="viewMode === 'calendar'"
          @click="viewMode = 'calendar'"
        >
          <span aria-hidden="true">◫</span> Calendário
        </button>
      </div>
      <UiButton variant="ghost" :loading="loading" @click="reload">Atualizar</UiButton>
      <UiButton to="/consultations/new" variant="primary">Novo agendamento</UiButton>
    </template>

    <!-- KPIs -->
    <section class="cl-metrics" role="group" aria-label="Resumo da agenda">
      <UiMetricCard
        label="Total no período"
        :value="loading ? null : String(metrics.total)"
        :loading="loading"
        tone="primary"
        hint="Agendamentos filtrados"
      />
      <UiMetricCard
        label="Agendadas / Confirmadas"
        :value="loading ? null : String(metrics.scheduled)"
        :loading="loading"
        tone="running"
        hint="Aguardando atendimento"
      />
      <UiMetricCard
        label="Realizadas"
        :value="loading ? null : String(metrics.completed)"
        :loading="loading"
        tone="success"
        hint="Atendimentos concluídos"
      />
      <UiMetricCard
        label="Canceladas / Falta"
        :value="loading ? null : String(metrics.cancelled)"
        :loading="loading"
        tone="error"
        hint="Canceladas ou não compareceu"
      />
      <UiMetricCard
        label="Receita confirmada"
        :value="loading ? '—' : format.formatCurrency(metrics.paidRevenueCents / 100)"
        :loading="loading"
        tone="success"
        hint="Soma dos pagamentos confirmados"
      />
    </section>

    <!-- Filtros -->
    <template #filters>
      <UiFiltersPanel
        v-model="filters"
        :fields="filterFields"
        @apply="onApply"
        @clear="onClear"
      />
    </template>

    <!-- Banner de filtro ativo -->
    <template v-if="hasActiveFilters && !pageError" #banner>
      <div class="cl-banner" role="status">
        <span class="cl-banner-text">
          {{ filteredRows.length }} agendamento{{ filteredRows.length !== 1 ? 's' : '' }} com os filtros atuais
          (de {{ rows.length }} total{{ rows.length !== 1 ? 'is' : '' }}).
        </span>
        <UiButton variant="subtle" size="sm" @click="onClear">Limpar filtros</UiButton>
      </div>
    </template>

    <!-- ───────────────────────── VISÃO TABELA ───────────────────────── -->
    <template v-if="viewMode === 'table'">
      <UiDataTable
        :columns="columns"
        :rows="pagedRows"
        :loading="loading"
        :error="errorMessage"
        row-key="id"
        density="comfortable"
        clickable-rows
        :sort="sort"
        :paginated="false"
        :empty="emptyState"
        @row-click="open"
        @update:sort="onSort"
        @retry="reload"
      >
        <!-- Paciente -->
        <template #cell-patient_id="{ row }">
          <div class="cl-person">
            <span class="cl-avatar" aria-hidden="true">{{ initials(row.patient_name || row.patient_id) }}</span>
            <span class="cl-person-text">
              <span class="cl-person-name">{{ row.patient_name || row.patient_id || '—' }}</span>
              <span v-if="row.patient_name && row.patient_id" class="cl-sub">{{ String(row.patient_id).slice(0, 8) }}…</span>
            </span>
          </div>
        </template>

        <!-- Profissional -->
        <template #cell-professional_id="{ row }">
          <div class="cl-person">
            <span class="cl-pro-badge" aria-hidden="true">{{ initials(row.professional_name || row.professional_id) }}</span>
            <span class="cl-person-name cl-pro-name">{{ row.professional_name || row.professional_id || '—' }}</span>
          </div>
        </template>

        <!-- Data/hora início -->
        <template #cell-scheduled_at="{ value }">
          <div class="cl-when-block">
            <span class="cl-when-date">{{ formatDateShort(value) }}</span>
            <span class="cl-when-time">{{ formatTimeOnly(value) }}</span>
          </div>
        </template>

        <!-- Duração -->
        <template #cell-duration_minutes="{ row }">
          <span class="cl-duration">{{ durationLabel(row) }}</span>
        </template>

        <!-- Valor -->
        <template #cell-amount_cents="{ value }">
          <span class="cl-amount">{{ amountLabel(value) }}</span>
        </template>

        <!-- Status consulta -->
        <template #cell-status="{ value }">
          <UiStatusBadge :status="value" :tone="statusTone(value)" :label="statusText(value)" with-dot />
        </template>

        <!-- Status pagamento -->
        <template #cell-payment_status="{ value }">
          <UiStatusBadge :status="value" :tone="paymentTone(value)" :label="paymentText(value)" />
        </template>

        <!-- Ações inline -->
        <template #cell-_actions="{ row }">
          <div class="cl-row-actions">
            <UiButton
              v-if="canConfirm(row)"
              variant="subtle"
              size="sm"
              :loading="actionLoading[row.id] === 'confirm'"
              :aria-label="'Confirmar agendamento de ' + patientLabel(row)"
              @click.stop="confirmConsultation(row)"
            >Confirmar</UiButton>
            <UiButton
              v-if="canMarkDone(row)"
              variant="subtle"
              size="sm"
              :loading="actionLoading[row.id] === 'done'"
              :aria-label="'Marcar realizado ' + patientLabel(row)"
              @click.stop="markDone(row)"
            >Realizado</UiButton>
            <UiButton
              v-if="canCancel(row)"
              variant="danger"
              size="sm"
              :loading="actionLoading[row.id] === 'cancel'"
              :aria-label="'Cancelar agendamento de ' + patientLabel(row)"
              @click.stop="cancelConsultation(row)"
            >Cancelar</UiButton>
            <UiButton
              variant="ghost"
              size="sm"
              :to="'/consultations/' + row.id"
              :aria-label="'Abrir detalhe de ' + patientLabel(row)"
            >Ver</UiButton>
          </div>
        </template>

        <!-- CTA empty -->
        <template #empty-action>
          <div class="cl-empty-cta">
            <UiButton v-if="hasActiveFilters" variant="ghost" @click="onClear">Limpar filtros</UiButton>
            <UiButton to="/consultations/new" variant="primary">Novo agendamento</UiButton>
          </div>
        </template>
      </UiDataTable>

      <!-- Paginação local -->
      <UiPagination
        v-if="!loading && !errorMessage && filteredRows.length > pageSize"
        :page="page"
        :page-size="pageSize"
        :total="filteredRows.length"
        @update:page="page = $event"
        @update:page-size="onPageSize"
      />
    </template>

    <!-- ───────────────────────── VISÃO CALENDÁRIO ───────────────────────── -->
    <template v-else>
      <!-- Estado de carregamento no modo calendário -->
      <div v-if="loading" class="cl-cal-loading" role="status" aria-live="polite" aria-label="Carregando agenda">
        <UiLoadingState message="Carregando agenda…" />
      </div>

      <UiCard v-else :padded="false">
        <template #actions>
          <div class="cl-cal-nav" role="navigation" aria-label="Semana">
            <UiButton variant="ghost" size="sm" aria-label="Semana anterior" @click="shiftWeek(-1)">‹</UiButton>
            <span class="cl-cal-week-label" aria-live="polite">{{ weekLabel }}</span>
            <UiButton variant="ghost" size="sm" aria-label="Próxima semana" @click="shiftWeek(1)">›</UiButton>
            <UiButton variant="subtle" size="sm" @click="goToday">Hoje</UiButton>
          </div>
        </template>

        <!-- Grid do calendário semanal -->
        <div class="cl-cal" role="grid" :aria-label="'Agenda da semana de ' + weekLabel">
          <!-- Cabeçalho dos dias -->
          <div class="cl-cal-head" role="row">
            <div class="cl-cal-gutter" aria-hidden="true" />
            <div
              v-for="day in weekDays"
              :key="day.iso"
              class="cl-cal-dayhdr"
              :data-today="day.isToday"
              role="columnheader"
              :aria-label="day.longLabel"
            >
              <span class="cl-cal-dayname">{{ day.weekdayShort }}</span>
              <span class="cl-cal-daynum" :data-today="day.isToday">{{ day.dayNum }}</span>
            </div>
          </div>

          <!-- Corpo: horários de funcionamento (7h–20h) -->
          <div class="cl-cal-body" role="rowgroup">
            <div
              v-for="hour in calHours"
              :key="hour"
              class="cl-cal-row"
              role="row"
            >
              <!-- Label de hora -->
              <div class="cl-cal-gutter cl-cal-hour-label" role="rowheader" :aria-label="hour + ':00'">
                {{ String(hour).padStart(2, '0') }}:00
              </div>
              <!-- Célula de cada dia -->
              <div
                v-for="day in weekDays"
                :key="day.iso"
                class="cl-cal-cell"
                :data-today="day.isToday"
                role="gridcell"
                :aria-label="day.longLabel + ' ' + hour + ':00'"
              >
                <!-- Eventos que começam nessa hora/dia -->
                <button
                  v-for="ev in eventsFor(day.iso, hour)"
                  :key="ev.id"
                  class="cl-cal-event"
                  :data-tone="statusTone(ev.status)"
                  :aria-label="eventAriaLabel(ev)"
                  @click="open(ev)"
                >
                  <span class="cl-cal-ev-time">{{ formatTimeOnly(ev.scheduled_at) }}</span>
                  <span class="cl-cal-ev-name">{{ ev.patient_name || ev.patient_id || '—' }}</span>
                  <span class="cl-cal-ev-prof">{{ ev.professional_name || ev.professional_id || '—' }}</span>
                  <UiStatusBadge :status="ev.status" :tone="statusTone(ev.status)" :label="statusText(ev.status)" size="sm" :with-dot="false" />
                </button>
              </div>
            </div>
          </div>
        </div>

        <template #footer>
          <div class="cl-cal-legend" aria-label="Legenda de status">
            <span v-for="item in calLegend" :key="item.tone" class="cl-cal-leg-item">
              <span class="cl-cal-leg-dot" :data-tone="item.tone" aria-hidden="true" />
              {{ item.label }}
            </span>
          </div>
        </template>
      </UiCard>
    </template>

    <template #footer>
      <span>Dados em tempo real do tenant. Clique numa linha ou evento para ver o detalhe completo.</span>
    </template>
  </UiPageLayout>
</template>

<script setup>
import { ref, computed, reactive, onMounted, watch } from 'vue';
import { useRouter } from 'vue-router';
import {
  UiPageLayout,
  UiDataTable,
  UiPagination,
  UiFiltersPanel,
  UiStatusBadge,
  UiMetricCard,
  UiCard,
  UiButton,
  UiLoadingState,
  useToast,
  useConfirm,
  format,
} from '../ui/index.js';
import * as api from '../api.js';

// --- Recurso de dados ---
const consultations =
  api.consultations && typeof api.consultations.list === 'function'
    ? api.consultations
    : api.resourceFactory('consultations');

const router = useRouter();
const toast = useToast();
const ask = useConfirm();

// --- Estado de dados ---
const rows = ref([]);
const loading = ref(false);
const error = ref(null);

// Quando o PageLayout está gerenciando o erro em nível de página (loading/error top-level),
// usamos pageError só na ausência de dados (1a carga). Depois mostramos inline.
const pageError = computed(() => {
  if (rows.value.length > 0) return null;
  return error.value ? errorMessage.value : null;
});

// Visão ativa: 'table' | 'calendar'
const viewMode = ref('table');

// Ordenação e paginação (client-side)
const sort = ref({ key: 'scheduled_at', dir: 'asc' });
const page = ref(1);
const pageSize = ref(25);

// Filtros
const filters = ref({
  patient: '',
  professional: '',
  from: '',
  to: '',
  status: '',
  payment: '',
});

// Loading por ação inline (id → 'confirm'|'done'|'cancel')
const actionLoading = reactive({});

// ─── Semana do calendário ───────────────────────────────────────────────────

// Segunda da semana exibida (Date na meia-noite local)
const calWeekStart = ref(mondayOf(new Date()));

function mondayOf(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay(); // 0=dom
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d;
}

function shiftWeek(delta) {
  const d = new Date(calWeekStart.value);
  d.setDate(d.getDate() + delta * 7);
  calWeekStart.value = d;
}

function goToday() {
  calWeekStart.value = mondayOf(new Date());
}

const weekDays = computed(() => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const WK = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
  const WKLONG = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(calWeekStart.value);
    d.setDate(d.getDate() + i);
    const iso = d.toISOString().slice(0, 10);
    return {
      iso,
      dayNum: d.getDate(),
      weekdayShort: WK[d.getDay()],
      longLabel: WKLONG[d.getDay()] + ' ' + d.getDate() + '/' + (d.getMonth() + 1),
      isToday: d.getTime() === today.getTime(),
    };
  });
});

const weekLabel = computed(() => {
  const first = weekDays.value[0];
  const last = weekDays.value[6];
  const fmt = (iso) => {
    const [, m, d] = iso.split('-');
    return d + '/' + m;
  };
  return fmt(first.iso) + ' – ' + fmt(last.iso);
});

// Horas visíveis no calendário (07:00–20:00)
const calHours = Array.from({ length: 14 }, (_, i) => 7 + i);

// Mapa de eventos por dia-ISO+hora para o calendário
function eventsFor(isoDate, hour) {
  return filteredRows.value.filter((r) => {
    if (!r.scheduled_at) return false;
    const d = new Date(r.scheduled_at);
    const rowIso = d.toISOString().slice(0, 10);
    return rowIso === isoDate && d.getHours() === hour;
  });
}

const calLegend = [
  { tone: 'running', label: 'Agendada/Confirmada' },
  { tone: 'success', label: 'Realizada' },
  { tone: 'error', label: 'Cancelada/No-show' },
  { tone: 'warning', label: 'Pendente' },
];

// ─── Rótulos e tons dos status ──────────────────────────────────────────────

const STATUS_LABELS = {
  agendado: 'Agendada',
  confirmado: 'Confirmada',
  realizado: 'Realizada',
  cancelado: 'Cancelada',
  no_show: 'Não compareceu',
  scheduled: 'Agendada',
  confirmed: 'Confirmada',
  completed: 'Realizada',
  canceled: 'Cancelada',
  cancelled: 'Cancelada',
};
const PAYMENT_LABELS = {
  pendente: 'Pendente',
  pago: 'Pago',
  estornado: 'Estornado',
  falhou: 'Falhou',
  pending: 'Pendente',
  paid: 'Pago',
  refunded: 'Estornado',
  failed: 'Falhou',
};
const STATUS_TONES = {
  agendado: 'running',
  confirmado: 'running',
  realizado: 'success',
  cancelado: 'error',
  no_show: 'warning',
  scheduled: 'running',
  confirmed: 'running',
  completed: 'success',
  canceled: 'error',
  cancelled: 'error',
};
const PAYMENT_TONES = {
  pendente: 'warning',
  pago: 'success',
  estornado: 'neutral',
  falhou: 'error',
  pending: 'warning',
  paid: 'success',
  refunded: 'neutral',
  failed: 'error',
};

const normStatus = (s) =>
  String(s || '')
    .toLowerCase()
    .replace('cancelled', 'canceled');

const statusText = (v) => STATUS_LABELS[String(v || '').toLowerCase()] || format.humanize(v);
const paymentText = (v) => PAYMENT_LABELS[String(v || '').toLowerCase()] || format.humanize(v);
const statusTone = (v) => STATUS_TONES[String(v || '').toLowerCase()] || 'neutral';
const paymentTone = (v) => PAYMENT_TONES[String(v || '').toLowerCase()] || 'neutral';

// ─── Colunas da tabela ──────────────────────────────────────────────────────

const columns = [
  { key: 'scheduled_at', label: 'Início', sortable: true },
  { key: 'patient_id', label: 'Paciente', sortable: true },
  { key: 'professional_id', label: 'Profissional', sortable: true },
  { key: 'duration_minutes', label: 'Duração', align: 'right' },
  { key: 'amount_cents', label: 'Valor', align: 'right', sortable: true },
  { key: 'status', label: 'Status', sortable: true },
  { key: 'payment_status', label: 'Pagamento', sortable: true },
  { key: '_actions', label: 'Ações', align: 'right' },
];

// ─── Campos de filtro ───────────────────────────────────────────────────────

const filterFields = computed(() => [
  { key: 'patient', label: 'Paciente', type: 'text', placeholder: 'Nome ou ID…' },
  { key: 'professional', label: 'Profissional', type: 'text', placeholder: 'Nome ou ID…' },
  { key: 'from', label: 'De', type: 'date' },
  { key: 'to', label: 'Até', type: 'date' },
  {
    key: 'status',
    label: 'Status',
    type: 'select',
    options: [
      { value: 'agendado', label: 'Agendada' },
      { value: 'confirmado', label: 'Confirmada' },
      { value: 'realizado', label: 'Realizada' },
      { value: 'cancelado', label: 'Cancelada' },
      { value: 'no_show', label: 'Não compareceu' },
    ],
  },
  {
    key: 'payment',
    label: 'Pagamento',
    type: 'select',
    options: [
      { value: 'pendente', label: 'Pendente' },
      { value: 'pago', label: 'Pago' },
      { value: 'estornado', label: 'Estornado' },
      { value: 'falhou', label: 'Falhou' },
    ],
  },
]);

// ─── Helpers de exibição ────────────────────────────────────────────────────

const patientLabel = (row) => row.patient_name || row.patient_id || '—';
const professionalLabel = (row) => row.professional_name || row.professional_id || '—';

const initials = (name) => {
  const parts = String(name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) return '?';
  const first = parts[0][0] || '';
  const last = parts.length > 1 ? parts[parts.length - 1][0] || '' : '';
  return (first + last).toUpperCase();
};

function formatDateShort(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

function formatTimeOnly(value) {
  if (!value) return '';
  const d = new Date(value);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function durationLabel(row) {
  let mins = Number(row.duration_minutes);
  if ((!isFinite(mins) || mins <= 0) && row.scheduled_at && row.scheduled_end_at) {
    const a = new Date(row.scheduled_at).getTime();
    const b = new Date(row.scheduled_end_at).getTime();
    if (isFinite(a) && isFinite(b) && b > a) mins = Math.round((b - a) / 60000);
  }
  if (!isFinite(mins) || mins <= 0) return '—';
  return mins + ' min';
}

function amountLabel(cents) {
  const n = Number(cents);
  if (!isFinite(n)) return '—';
  return format.formatCurrency(n / 100);
}

function eventAriaLabel(ev) {
  const who = ev.patient_name || ev.patient_id || 'paciente';
  const when = format.formatDateTime(ev.scheduled_at);
  const st = statusText(ev.status);
  return who + ' — ' + when + ' (' + st + ')';
}

// ─── Lógica de ações inline ──────────────────────────────────────────────────

const canConfirm = (row) => {
  const s = normStatus(row.status);
  return s === 'agendado' || s === 'scheduled';
};
const canMarkDone = (row) => {
  const s = normStatus(row.status);
  return s === 'agendado' || s === 'confirmado' || s === 'scheduled' || s === 'confirmed';
};
const canCancel = (row) => {
  const s = normStatus(row.status);
  return s !== 'realizado' && s !== 'completed' && s !== 'cancelado' && s !== 'canceled' && s !== 'no_show';
};

async function confirmConsultation(row) {
  const ok = await ask({
    title: 'Confirmar agendamento',
    message: 'Confirmar a consulta de ' + patientLabel(row) + ' em ' + format.formatDateTime(row.scheduled_at) + '?',
    confirmLabel: 'Confirmar',
  });
  if (!ok) return;
  actionLoading[row.id] = 'confirm';
  try {
    await consultations.update(row.id, { status: 'confirmado' });
    toast.success('Agendamento confirmado.');
    await load();
  } catch (e) {
    toast.error('Não foi possível confirmar.', { detail: e && e.message });
  } finally {
    delete actionLoading[row.id];
  }
}

async function markDone(row) {
  const ok = await ask({
    title: 'Registrar realização',
    message: 'Marcar a consulta de ' + patientLabel(row) + ' como realizada?',
    confirmLabel: 'Marcar realizado',
  });
  if (!ok) return;
  actionLoading[row.id] = 'done';
  try {
    await consultations.update(row.id, { status: 'realizado' });
    toast.success('Consulta marcada como realizada.');
    await load();
  } catch (e) {
    toast.error('Não foi possível registrar a realização.', { detail: e && e.message });
  } finally {
    delete actionLoading[row.id];
  }
}

async function cancelConsultation(row) {
  const ok = await ask({
    title: 'Cancelar agendamento',
    message: 'Cancelar a consulta de ' + patientLabel(row) + ' em ' + format.formatDateTime(row.scheduled_at) + '? Esta ação não pode ser desfeita.',
    confirmLabel: 'Cancelar consulta',
    danger: true,
  });
  if (!ok) return;
  actionLoading[row.id] = 'cancel';
  try {
    await consultations.update(row.id, { status: 'cancelado' });
    toast.success('Agendamento cancelado.');
    await load();
  } catch (e) {
    toast.error('Não foi possível cancelar.', { detail: e && e.message });
  } finally {
    delete actionLoading[row.id];
  }
}

// ─── Filtragem (client-side) ─────────────────────────────────────────────────

function matchesText(needle, ...haystack) {
  const q = String(needle || '').trim().toLowerCase();
  if (!q) return true;
  return haystack.some((h) => String(h ?? '').toLowerCase().includes(q));
}

function inDateRange(value, from, to) {
  if (!from && !to) return true;
  if (!value) return false;
  const t = new Date(value).getTime();
  if (!isFinite(t)) return false;
  if (from) {
    const f = new Date(from + 'T00:00:00').getTime();
    if (isFinite(f) && t < f) return false;
  }
  if (to) {
    const e = new Date(to + 'T23:59:59').getTime();
    if (isFinite(e) && t > e) return false;
  }
  return true;
}

const hasActiveFilters = computed(() =>
  Object.values(filters.value).some((v) => String(v || '').trim() !== '')
);

const filteredRows = computed(() => {
  const f = filters.value;
  return rows.value.filter((r) => {
    if (!matchesText(f.patient, r.patient_id, r.patient_name)) return false;
    if (!matchesText(f.professional, r.professional_id, r.professional_name)) return false;
    if (!inDateRange(r.scheduled_at, f.from, f.to)) return false;
    if (f.status && normStatus(r.status) !== normStatus(f.status)) return false;
    if (f.payment && String(r.payment_status || '').toLowerCase() !== String(f.payment).toLowerCase()) return false;
    return true;
  });
});

// ─── Ordenação (client-side) ─────────────────────────────────────────────────

const sortedRows = computed(() => {
  const s = sort.value;
  if (!s || !s.key) return filteredRows.value;
  const mul = s.dir === 'desc' ? -1 : 1;
  const numeric = s.key === 'amount_cents' || s.key === 'duration_minutes';
  const dated = s.key === 'scheduled_at';
  return [...filteredRows.value].sort((a, b) => {
    let x = a[s.key];
    let y = b[s.key];
    if (dated) {
      x = x ? new Date(x).getTime() : 0;
      y = y ? new Date(y).getTime() : 0;
    } else if (numeric) {
      x = Number(x) || 0;
      y = Number(y) || 0;
    } else {
      x = String(x ?? '').toLowerCase();
      y = String(y ?? '').toLowerCase();
    }
    if (x == null) return 1;
    if (y == null) return -1;
    return (x > y ? 1 : x < y ? -1 : 0) * mul;
  });
});

// ─── Paginação (client-side) ─────────────────────────────────────────────────

const pagedRows = computed(() => {
  const start = (page.value - 1) * pageSize.value;
  return sortedRows.value.slice(start, start + pageSize.value);
});

// ─── Métricas ─────────────────────────────────────────────────────────────────

const metrics = computed(() => {
  const src = filteredRows.value;
  let scheduled = 0;
  let completed = 0;
  let cancelled = 0;
  let paidRevenueCents = 0;
  for (const r of src) {
    const st = normStatus(r.status);
    if (st === 'agendado' || st === 'confirmado' || st === 'scheduled' || st === 'confirmed') scheduled += 1;
    if (st === 'realizado' || st === 'completed') completed += 1;
    if (st === 'cancelado' || st === 'canceled' || st === 'no_show') cancelled += 1;
    const ps = String(r.payment_status || '').toLowerCase();
    if (ps === 'pago' || ps === 'paid') paidRevenueCents += Number(r.amount_cents) || 0;
  }
  return { total: src.length, scheduled, completed, cancelled, paidRevenueCents };
});

// ─── Erros e estados ─────────────────────────────────────────────────────────

const errorMessage = computed(() => {
  if (!error.value) return null;
  return (error.value && error.value.message) || 'Não foi possível carregar os agendamentos.';
});

const emptyState = computed(() =>
  hasActiveFilters.value
    ? {
        title: 'Nenhum agendamento encontrado',
        description: 'Nenhuma consulta corresponde aos filtros aplicados. Ajuste ou limpe os filtros.',
        icon: '◎',
      }
    : {
        title: 'Nenhum agendamento ainda',
        description: 'Crie o primeiro agendamento para começar a montar a agenda clínica.',
        icon: '＋',
      }
);

// ─── Carregamento ─────────────────────────────────────────────────────────────

function buildListParams() {
  const f = filters.value;
  const params = {
    from: f.from || undefined,
    to: f.to || undefined,
    status: f.status ? normStatus(f.status) : undefined,
    payment_status: f.payment || undefined,
    sort: sort.value && sort.value.key ? sort.value.key : undefined,
    dir: sort.value && sort.value.dir ? sort.value.dir : undefined,
  };
  if (/^[\w-]{3,}$/.test(String(f.patient || '').trim())) params.patient_id = f.patient.trim();
  if (/^[\w-]{3,}$/.test(String(f.professional || '').trim())) params.professional_id = f.professional.trim();
  return params;
}

async function load() {
  loading.value = true;
  error.value = null;
  try {
    const res = await consultations.list(buildListParams());
    rows.value = Array.isArray(res) ? res : res && res.data ? res.data : [];
  } catch (e) {
    error.value = e;
    rows.value = [];
  } finally {
    loading.value = false;
  }
}

async function reload() {
  await load();
  if (!error.value) toast.success('Agenda atualizada.');
  else toast.error('Falha ao atualizar a agenda.', { detail: errorMessage.value });
}

// ─── Handlers de navegação e filtro ──────────────────────────────────────────

function open(row) {
  router.push('/consultations/' + row.id);
}

function onSort(s) {
  sort.value = s;
  page.value = 1;
}

function onApply() {
  page.value = 1;
}

function onClear() {
  filters.value = { patient: '', professional: '', from: '', to: '', status: '', payment: '' };
  page.value = 1;
}

function onPageSize(size) {
  pageSize.value = size;
  page.value = 1;
}

// Avisa por toast ao falhar (além do estado inline na tabela)
watch(
  () => error.value,
  (e) => {
    if (e && rows.value.length > 0) toast.error(errorMessage.value);
  }
);

onMounted(load);
</script>

<style scoped>
/* ── Variáveis CSS locais para dimensões sem token canônico ── */
/* Declaradas nos contêineres diretos que herdam para os filhos, isolando magic numbers. */
.cl-person {
  --_avatar-size: 30px;
}

.cl-cal {
  --_daynum-size: 26px;
  --_cal-gutter: 52px;
  --_cal-row-min-height: 52px;
}

.cl-cal-legend {
  --_legend-dot-size: 8px;
}

/* ── Métricas ── */
.cl-metrics {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
  gap: var(--ui-space-4);
}

/* ── Alternador de visão ── */
.cl-view-toggle {
  display: inline-flex;
  border: 1px solid rgb(var(--ui-border));
  border-radius: var(--ui-radius-md);
  overflow: hidden;
  flex-shrink: 0;
}

.cl-toggle-btn {
  display: inline-flex;
  align-items: center;
  gap: var(--ui-space-1);
  padding: var(--ui-space-1) var(--ui-space-3);
  font: inherit;
  font-size: var(--ui-text-sm);
  font-weight: 500;
  background: rgb(var(--ui-surface));
  color: rgb(var(--ui-muted));
  border: none;
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
}

.cl-toggle-btn[data-active="true"] {
  background: rgb(var(--ui-accent) / 0.12);
  color: rgb(var(--ui-accent-strong));
  font-weight: 700;
}

.cl-toggle-btn:not([data-active="true"]):hover {
  background: rgb(var(--ui-surface-2));
  color: rgb(var(--ui-fg));
}

/* ── Banner de filtro ── */
.cl-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ui-space-3);
  flex-wrap: wrap;
  background: rgb(var(--ui-accent) / 0.07);
  border: 1px solid rgb(var(--ui-accent) / 0.25);
  border-radius: var(--ui-radius-lg);
  padding: var(--ui-space-3) var(--ui-space-4);
}

.cl-banner-text {
  color: rgb(var(--ui-fg));
  font-size: var(--ui-text-sm);
  font-weight: 600;
}

/* ── Células da tabela ── */
.cl-person {
  display: flex;
  align-items: center;
  gap: var(--ui-space-2);
  min-width: 0;
}

.cl-avatar {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  width: var(--_avatar-size);
  height: var(--_avatar-size);
  border-radius: var(--ui-radius-md);
  background: rgb(var(--ui-accent) / 0.13);
  color: rgb(var(--ui-accent-strong));
  font-size: var(--ui-text-xs);
  font-weight: 700;
}

.cl-pro-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  width: var(--_avatar-size);
  height: var(--_avatar-size);
  border-radius: 50%;
  background: rgb(var(--ui-ok) / 0.13);
  color: rgb(var(--ui-ok));
  font-size: var(--ui-text-xs);
  font-weight: 700;
}

.cl-person-text {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.cl-person-name {
  font-weight: 600;
  color: rgb(var(--ui-fg));
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.cl-pro-name {
  font-weight: 500;
}

.cl-sub {
  color: rgb(var(--ui-muted));
  font-size: var(--ui-text-xs);
}

.cl-when-block {
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.cl-when-date {
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.cl-when-time {
  color: rgb(var(--ui-muted));
  font-size: var(--ui-text-xs);
  font-variant-numeric: tabular-nums;
}

.cl-duration {
  color: rgb(var(--ui-muted));
  font-size: var(--ui-text-sm);
  font-variant-numeric: tabular-nums;
}

.cl-amount {
  font-variant-numeric: tabular-nums;
  font-weight: 600;
  color: rgb(var(--ui-fg));
}

/* ── Ações inline ── */
.cl-row-actions {
  display: flex;
  gap: var(--ui-space-1);
  flex-wrap: nowrap;
  align-items: center;
  justify-content: flex-end;
}

/* ── Empty CTA ── */
.cl-empty-cta {
  display: flex;
  gap: var(--ui-space-2);
  flex-wrap: wrap;
  justify-content: center;
}

/* ── Calendário ── */
.cl-cal-nav {
  display: flex;
  align-items: center;
  gap: var(--ui-space-2);
}

.cl-cal-week-label {
  font-size: var(--ui-text-sm);
  font-weight: 600;
  color: rgb(var(--ui-fg));
  min-width: 110px;
  text-align: center;
}

.cl-cal {
  display: flex;
  flex-direction: column;
  overflow-x: auto;
  min-width: 0;
}

.cl-cal-head {
  display: grid;
  grid-template-columns: var(--_cal-gutter) repeat(7, 1fr);
  position: sticky;
  top: 0;
  z-index: 2;
  background: rgb(var(--ui-surface-2));
  border-bottom: 2px solid rgb(var(--ui-border));
}

.cl-cal-gutter {
  border-right: 1px solid rgb(var(--ui-border));
}

.cl-cal-dayhdr {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: var(--ui-space-2) var(--ui-space-1);
  gap: var(--ui-space-1);
  border-right: 1px solid rgb(var(--ui-border));
}

.cl-cal-dayname {
  font-size: var(--ui-text-xs);
  font-weight: 600;
  color: rgb(var(--ui-muted));
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

.cl-cal-daynum {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: var(--_daynum-size);
  height: var(--_daynum-size);
  border-radius: 50%;
  font-size: var(--ui-text-sm);
  font-weight: 600;
  color: rgb(var(--ui-fg));
}

.cl-cal-daynum[data-today="true"] {
  background: rgb(var(--ui-accent));
  color: rgb(var(--ui-surface));
}

.cl-cal-body {
  display: flex;
  flex-direction: column;
}

.cl-cal-row {
  display: grid;
  grid-template-columns: var(--_cal-gutter) repeat(7, 1fr);
  min-height: var(--_cal-row-min-height);
  border-bottom: 1px solid rgb(var(--ui-border));
}

.cl-cal-row:last-child {
  border-bottom: none;
}

.cl-cal-hour-label {
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding-top: var(--ui-space-1);
  font-size: var(--ui-text-xs);
  color: rgb(var(--ui-muted));
  font-variant-numeric: tabular-nums;
}

.cl-cal-cell {
  border-right: 1px solid rgb(var(--ui-border));
  padding: var(--ui-space-1);
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-1);
  min-height: var(--_cal-row-min-height);
}

.cl-cal-cell[data-today="true"] {
  background: rgb(var(--ui-accent) / 0.04);
}

.cl-cal-event {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 1px;
  padding: var(--ui-space-1) var(--ui-space-2);
  border-radius: var(--ui-radius-sm);
  border-left: 3px solid;
  font: inherit;
  font-size: var(--ui-text-xs);
  cursor: pointer;
  text-align: left;
  width: 100%;
  background: rgb(var(--ui-surface));
  border-bottom: 1px solid rgb(var(--ui-border));
  border-top: 1px solid rgb(var(--ui-border));
  border-right: 1px solid rgb(var(--ui-border));
  transition: filter 0.12s;
}

.cl-cal-event[data-tone="running"] {
  border-left-color: rgb(var(--ui-accent));
  background: rgb(var(--ui-accent) / 0.07);
}

.cl-cal-event[data-tone="success"] {
  border-left-color: rgb(var(--ui-ok));
  background: rgb(var(--ui-ok) / 0.07);
}

.cl-cal-event[data-tone="error"] {
  border-left-color: rgb(var(--ui-danger));
  background: rgb(var(--ui-danger) / 0.07);
}

.cl-cal-event[data-tone="warning"] {
  border-left-color: rgb(var(--ui-warn));
  background: rgb(var(--ui-warn) / 0.07);
}

.cl-cal-event[data-tone="neutral"] {
  border-left-color: rgb(var(--ui-border-strong));
  background: rgb(var(--ui-surface-2));
}

.cl-cal-event:hover {
  filter: brightness(0.96);
}

.cl-cal-ev-time {
  font-size: var(--ui-text-xs);
  font-weight: 700;
  color: rgb(var(--ui-muted));
  font-variant-numeric: tabular-nums;
}

.cl-cal-ev-name {
  font-weight: 600;
  color: rgb(var(--ui-fg));
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100%;
}

.cl-cal-ev-prof {
  font-size: var(--ui-text-xs);
  color: rgb(var(--ui-muted));
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100%;
}

/* Legenda do calendário */
.cl-cal-legend {
  display: flex;
  align-items: center;
  gap: var(--ui-space-4);
  flex-wrap: wrap;
}

.cl-cal-leg-item {
  display: inline-flex;
  align-items: center;
  gap: var(--ui-space-1);
  font-size: var(--ui-text-xs);
  color: rgb(var(--ui-muted));
}

.cl-cal-leg-dot {
  width: var(--_legend-dot-size);
  height: var(--_legend-dot-size);
  border-radius: 2px;
  flex-shrink: 0;
}

.cl-cal-leg-dot[data-tone="running"] { background: rgb(var(--ui-accent)); }
.cl-cal-leg-dot[data-tone="success"] { background: rgb(var(--ui-ok)); }
.cl-cal-leg-dot[data-tone="error"] { background: rgb(var(--ui-danger)); }
.cl-cal-leg-dot[data-tone="warning"] { background: rgb(var(--ui-warn)); }

/* ── Calendário: estado de loading ── */
.cl-cal-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--ui-space-6) var(--ui-space-4);
  min-height: 240px;
}

/* ── Responsivo ── */
@media (max-width: 860px) {
  .cl-metrics {
    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
    gap: var(--ui-space-3);
  }

  .cl-row-actions {
    flex-wrap: wrap;
    gap: var(--ui-space-1);
  }

  .cl-cal-head,
  .cl-cal-row {
    --_cal-gutter: 42px;
    grid-template-columns: var(--_cal-gutter) repeat(7, minmax(80px, 1fr));
  }

  .cl-cal-event {
    font-size: var(--ui-text-xs);
  }
}

@media (max-width: 520px) {
  .cl-metrics {
    grid-template-columns: repeat(2, 1fr);
  }
}
</style>
