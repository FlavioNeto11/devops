<template>
  <UiPageLayout
    eyebrow="Agenda"
    title="Agendamentos"
    subtitle="Consultas agendadas com filtros por data, profissional, paciente, status e pagamento."
    width="wide"
  >
    <template #actions>
      <UiButton variant="ghost" :loading="loading" @click="reload">Atualizar</UiButton>
      <UiButton to="/consultations/new">Novo agendamento</UiButton>
    </template>

    <!-- Resumo (KPIs) — sempre visível; mostra placeholders enquanto carrega -->
    <section class="cl-metrics" aria-label="Resumo da agenda">
      <UiMetricCard
        label="Agendamentos"
        :value="loading ? null : metrics.total"
        :loading="loading"
        tone="primary"
        hint="No período filtrado"
      />
      <UiMetricCard
        label="Agendadas"
        :value="loading ? null : metrics.scheduled"
        :loading="loading"
        tone="running"
        hint="Aguardando atendimento"
      />
      <UiMetricCard
        label="Concluídas"
        :value="loading ? null : metrics.completed"
        :loading="loading"
        tone="success"
        hint="Atendimentos realizados"
      />
      <UiMetricCard
        label="Pagamentos pendentes"
        :value="loading ? null : metrics.unpaid"
        :loading="loading"
        tone="warning"
        hint="Aguardando pagamento"
      />
      <UiMetricCard
        label="Receita confirmada"
        :value="loading ? '—' : format.formatCurrency(metrics.paidRevenueCents / 100)"
        :loading="loading"
        tone="success"
        hint="Soma dos pagos"
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
    <template v-if="hasActiveFilters && !error" #banner>
      <div class="cl-banner" role="status">
        <span class="cl-banner-text">
          Mostrando {{ filteredRows.length }} de {{ rows.length }} agendamentos com os filtros aplicados.
        </span>
        <UiButton variant="subtle" size="sm" @click="onClear">Limpar filtros</UiButton>
      </div>
    </template>

    <!-- Tabela: estados loading/error/empty/normal são tratados pelo UiDataTable -->
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
      <!-- Paciente / Profissional -->
      <template #cell-patient_id="{ row }">
        <span class="cl-id">{{ patientLabel(row) }}</span>
      </template>
      <template #cell-professional_id="{ row }">
        <span class="cl-id">{{ professionalLabel(row) }}</span>
      </template>

      <!-- Início (data/hora) -->
      <template #cell-scheduled_at="{ value }">
        <span class="cl-when">{{ format.formatDateTime(value) }}</span>
      </template>

      <!-- Duração -->
      <template #cell-duration_minutes="{ row }">
        <span>{{ durationLabel(row) }}</span>
      </template>

      <!-- Valor -->
      <template #cell-amount_cents="{ value }">
        <span class="cl-amount">{{ amountLabel(value) }}</span>
      </template>

      <!-- Status do agendamento -->
      <template #cell-status="{ value }">
        <UiStatusBadge :status="value" :tone="statusTone(value)" :label="statusText(value)" />
      </template>

      <!-- Status do pagamento -->
      <template #cell-payment_status="{ value }">
        <UiStatusBadge :status="value" :tone="paymentTone(value)" :label="paymentText(value)" />
      </template>

      <!-- Abrir detalhe — caminho ACESSÍVEL (foco/teclado/leitor de tela). A linha
           inteira também é clicável (mouse), mas este link é o que cumpre a a11y. -->
      <template #cell-_open="{ row }">
        <UiButton
          variant="subtle"
          size="sm"
          :to="'/consultations/' + row.id"
          :aria-label="'Abrir agendamento de ' + patientLabel(row)"
        >Abrir</UiButton>
      </template>

      <!-- CTA dentro do empty da própria tabela -->
      <template #empty-action>
        <div class="cl-empty-actions">
          <UiButton v-if="hasActiveFilters" variant="ghost" @click="onClear">Limpar filtros</UiButton>
          <UiButton to="/consultations/new">Novo agendamento</UiButton>
        </div>
      </template>
    </UiDataTable>

    <!-- Paginação local (a API entrega tudo de uma vez; paginamos no cliente) -->
    <UiPagination
      v-if="!loading && !error && filteredRows.length > pageSize"
      :page="page"
      :page-size="pageSize"
      :total="filteredRows.length"
      @update:page="page = $event"
      @update:page-size="onPageSize"
    />

    <template #footer>
      <span>Fonte: agenda em tempo real do tenant. Clique numa linha — ou use o botão "Abrir" — para ver o detalhe.</span>
    </template>
  </UiPageLayout>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import {
  UiPageLayout,
  UiDataTable,
  UiPagination,
  UiFiltersPanel,
  UiStatusBadge,
  UiMetricCard,
  UiButton,
  useToast,
  format,
} from '../ui/index.js';
import * as api from '../api.js';

// Resolve o recurso de forma DEFENSIVA (padrão das views irmãs): funciona tanto se o
// integrador já anexou `export const consultations` quanto se ainda não — caindo para
// resourceFactory('consultations'), que monta /v1/consultations. Nunca fica undefined.
const consultations =
  api.consultations && typeof api.consultations.list === 'function'
    ? api.consultations
    : api.resourceFactory('consultations');

const router = useRouter();
const toast = useToast();

// --- Estado de dados (a API GET /v1/consultations devolve { data: [...] } sem paginar/filtrar) ---
const rows = ref([]);
const loading = ref(false);
const error = ref(null);

const sort = ref({ key: 'scheduled_at', dir: 'desc' });
const page = ref(1);
const pageSize = ref(25);

const filters = ref({ patient: '', professional: '', from: '', to: '', status: '', payment: '' });

// --- Rótulos pt-BR dos enums (cor nunca é o único sinal) ---
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
// Tons explícitos onde o resolvedor por palavra-chave erraria (ex.: no_show, refunded).
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

// Normalizador ÚNICO de status: minúsculo + colapsa as duas grafias de "cancelada"
// (backend ora manda 'cancelled', ora 'canceled'). Usado em filtro E métricas — uma só
// fonte da verdade, sem aninhamento que esconda bug quando um enum novo entrar.
const normStatus = (s) => String(s || '').toLowerCase().replace('cancelled', 'canceled');

const statusText = (v) => STATUS_LABELS[String(v || '').toLowerCase()] || format.humanize(v);
const paymentText = (v) => PAYMENT_LABELS[String(v || '').toLowerCase()] || format.humanize(v);
const statusTone = (v) => STATUS_TONES[String(v || '').toLowerCase()] || 'neutral';
const paymentTone = (v) => PAYMENT_TONES[String(v || '').toLowerCase()] || 'neutral';

// --- Colunas (humanize do contrato) ---
const columns = [
  { key: 'scheduled_at', label: 'Início', sortable: true },
  { key: 'patient_id', label: 'Paciente', sortable: true },
  { key: 'professional_id', label: 'Profissional', sortable: true },
  { key: 'duration_minutes', label: 'Duração', align: 'right' },
  { key: 'amount_cents', label: 'Valor', align: 'right', sortable: true },
  { key: 'status', label: 'Status', sortable: true },
  { key: 'payment_status', label: 'Pagamento', sortable: true },
  // Coluna de ação: caminho de abertura ACESSÍVEL por teclado/leitor de tela.
  // O kit renderiza <tr @click> só-mouse (sem tabindex/role); este UiButton :to é a
  // affordance focável que cumpre a régua de a11y sem editar o kit sincronizado.
  { key: '_open', label: 'Ações', align: 'right' },
];

const filterFields = computed(() => [
  { key: 'patient', label: 'Paciente', type: 'text', placeholder: 'ID ou nome…' },
  { key: 'professional', label: 'Profissional', type: 'text', placeholder: 'ID ou nome…' },
  { key: 'from', label: 'De', type: 'date' },
  { key: 'to', label: 'Até', type: 'date' },
  {
    key: 'status',
    label: 'Status',
    type: 'select',
    options: [
      { value: 'scheduled', label: 'Agendada' },
      { value: 'confirmed', label: 'Confirmada' },
      { value: 'completed', label: 'Concluída' },
      { value: 'canceled', label: 'Cancelada' },
      { value: 'no_show', label: 'Não compareceu' },
    ],
  },
  {
    key: 'payment',
    label: 'Pagamento',
    type: 'select',
    options: [
      { value: 'pending', label: 'Pendente' },
      { value: 'paid', label: 'Pago' },
      { value: 'failed', label: 'Falhou' },
      { value: 'refunded', label: 'Reembolsado' },
    ],
  },
]);

// --- Helpers de exibição ---
const patientLabel = (row) => row.patient_name || row.patient_id || '—';
const professionalLabel = (row) => row.professional_name || row.professional_id || '—';

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
  // amount_cents está em centavos; formatCurrency espera unidades.
  return format.formatCurrency(n / 100);
}

// --- Filtragem (client-side) ---
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
    // 'canceled' no filtro casa com 'cancelled' do backend — sempre comparar normalizado.
    if (f.status && normStatus(r.status) !== normStatus(f.status)) return false;
    if (f.payment && String(r.payment_status || '').toLowerCase() !== String(f.payment).toLowerCase()) return false;
    return true;
  });
});

// --- Ordenação (client-side) ---
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

// --- Paginação (client-side) ---
const pagedRows = computed(() => {
  const start = (page.value - 1) * pageSize.value;
  return sortedRows.value.slice(start, start + pageSize.value);
});

// --- Métricas ---
const metrics = computed(() => {
  const src = filteredRows.value;
  let scheduled = 0;
  let completed = 0;
  let unpaid = 0;
  let paidRevenueCents = 0;
  for (const r of src) {
    const st = normStatus(r.status);
    if (st === 'scheduled' || st === 'confirmed') scheduled += 1;
    if (st === 'completed') completed += 1;
    const ps = String(r.payment_status || '').toLowerCase();
    if (ps === 'pending' || ps === 'failed') unpaid += 1;
    if (ps === 'paid') paidRevenueCents += Number(r.amount_cents) || 0;
  }
  return { total: src.length, scheduled, completed, unpaid, paidRevenueCents };
});

// --- Estados / mensagens ---
const errorMessage = computed(() => {
  if (!error.value) return null;
  return error.value.message || 'Não foi possível carregar os agendamentos.';
});

const emptyState = computed(() =>
  hasActiveFilters.value
    ? {
        title: 'Nenhum agendamento encontrado',
        description: 'Nenhuma consulta corresponde aos filtros aplicados. Ajuste ou limpe os filtros.',
        icon: 'search',
      }
    : {
        title: 'Nenhum agendamento ainda',
        description: 'Crie o primeiro agendamento para começar a montar a agenda.',
        icon: 'clock',
      }
);

// --- Ações ---
function open(row) {
  router.push('/consultations/' + row.id);
}

function onSort(s) {
  sort.value = s;
  page.value = 1;
  // Reordena no servidor quando ele honrar sort/dir; senão sortedRows reordena local.
  load();
}

function onApply() {
  page.value = 1;
  // Re-busca com os filtros como parâmetros de servidor; a filtragem client-side
  // continua sobre o retorno (fallback), então funciona honre o backend ou não.
  load();
}

function onClear() {
  filters.value = { patient: '', professional: '', from: '', to: '', status: '', payment: '' };
  page.value = 1;
  load();
}

function onPageSize(size) {
  pageSize.value = size;
  page.value = 1;
}

// Monta os parâmetros de servidor a partir dos filtros/ordenação ativos. O backend
// (resourceFactory.list → /v1/consultations?…) ignora chaves vazias; se ele honrar os
// filtros, baixamos só o recorte — se não, a filtragem/ordenação/paginação client-side
// abaixo continua válida sobre o que voltar (fallback fail-soft, sem dupla verdade).
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
  // Só envia patient/professional quando parecem um ID (a busca textual por nome
  // continua client-side; não há contrato server-side para "nome contém").
  if (/^[\w-]+$/.test(String(f.patient || '').trim())) params.patient_id = f.patient.trim();
  if (/^[\w-]+$/.test(String(f.professional || '').trim())) params.professional_id = f.professional.trim();
  return params;
}

async function load() {
  loading.value = true;
  error.value = null;
  try {
    const res = await consultations.list(buildListParams());
    const data = Array.isArray(res) ? res : res && res.data ? res.data : [];
    rows.value = data;
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

onMounted(load);
</script>

<style scoped>
.cl-metrics {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
  gap: var(--ui-space-4);
}

.cl-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ui-space-3);
  flex-wrap: wrap;
  background: rgb(var(--ui-accent) / 0.08);
  border: 1px solid rgb(var(--ui-accent) / 0.28);
  border-radius: var(--ui-radius-lg);
  padding: var(--ui-space-3) var(--ui-space-4);
}

.cl-banner-text {
  color: rgb(var(--ui-fg));
  font-size: var(--ui-text-sm);
  font-weight: 600;
}

.cl-when {
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.cl-id {
  font-family: var(--ui-font-mono, monospace);
  font-size: var(--ui-text-sm);
}

.cl-amount {
  font-variant-numeric: tabular-nums;
  font-weight: 600;
}

.cl-empty-actions {
  display: flex;
  gap: var(--ui-space-2);
  flex-wrap: wrap;
  justify-content: center;
}

@media (max-width: 860px) {
  .cl-metrics {
    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
    gap: var(--ui-space-3);
  }
}
</style>
