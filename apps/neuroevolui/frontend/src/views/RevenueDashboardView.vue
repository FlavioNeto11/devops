<!--
  RevenueDashboardView — Painel de Receita (REQ-NEUROEVOLUI-0005).
  Receita por clínica / profissional / paciente, com filtros de período, séries por dia,
  totais agregados e drill-down até as transações (consultas cobradas).
  Endpoint REAL: GET /v1/dashboard/revenue
    query: date_from, date_to, professional_id, patient_id, page, limit
    → { data: [consultation rows], meta: { total, revenue_cents, page, limit } }
    requireRole('clinic_manager') → 403 para perfis abaixo de gestão.
  Apoio (filtros + rótulos de id→nome): GET /v1/patients · GET /v1/professionals → { data, total }.
  Restrito a clinic_manager+: o 403 vira um estado de "sem acesso" claro, nunca tela em branco.
  Atalhos navegam para listas de DOMÍNIO (/consultations, /patients, /professionals); o drill-down
  de uma transação abre o detalhe da consulta cobrada (/consultations/:id) — cada row é uma consulta.
  Caveat de fidelidade: a Receita autorizada do header vem do servidor (período inteiro, meta.revenue_cents),
  mas série diária / rankings / ticket / profissionais ativos são amostras da PÁGINA carregada (rótulos avisam).
-->
<template>
  <UiPageLayout
    title="Receita"
    eyebrow="NeuroEvolui · Financeiro"
    subtitle="Receita autorizada por clínica, profissional e paciente — com período, série diária e transações."
    width="wide"
    :error="fatalError"
    @retry="load"
  >
    <template #actions>
      <UiButton variant="subtle" :loading="loading" @click="load">Atualizar</UiButton>
      <UiButton to="/consultations">Ver agendamentos</UiButton>
    </template>

    <!-- Filtros de período / profissional / paciente -->
    <template #filters>
      <UiFiltersPanel
        v-model="filters"
        :fields="filterFields"
        @apply="onApply"
        @clear="onClear"
      />
    </template>

    <!-- Estado: sem acesso (403/401) — não é tela em branco, é uma mensagem clara -->
    <UiEmptyState
      v-if="denied"
      title="Acesso restrito"
      description="O painel de receita é exclusivo para gestores da clínica (clinic_manager ou acima). Fale com a administração para liberar seu perfil."
      icon="lock"
    >
      <template #action>
        <UiButton to="/consultations">Ir para agendamentos</UiButton>
      </template>
    </UiEmptyState>

    <template v-else>
      <!-- Indicadores agregados -->
      <section class="rev-metrics" aria-label="Indicadores de receita">
        <UiMetricCard
          label="Receita autorizada"
          :value="revenueDisplay"
          tone="success"
          :hint="revenueHint"
          :loading="loading"
        />
        <UiMetricCard
          label="Transações no período"
          :value="loading ? '—' : format.formatNumber(meta.total || 0)"
          tone="primary"
          :hint="periodLabel"
          :loading="loading"
          clickable
          @click="go('/consultations')"
        />
        <UiMetricCard
          label="Ticket médio"
          :value="ticketDisplay"
          tone="running"
          hint="receita ÷ transações do período"
          :loading="loading"
        />
        <UiMetricCard
          label="Profissionais ativos"
          :value="loading ? '—' : format.formatNumber(activeProfessionalsCount)"
          tone="neutral"
          hint="com receita na página atual"
          :loading="loading"
          clickable
          @click="go('/professionals')"
        />
      </section>

      <div class="rev-grid">
        <!-- Série diária (barras CSS-safe, sem libs) -->
        <UiCard title="Receita por dia" :subtitle="seriesSubtitle">
          <template #actions>
            <UiButton variant="ghost" size="sm" to="/consultations">Ver transações</UiButton>
          </template>

          <UiLoadingState v-if="loading" variant="skeleton" :skeleton-lines="6" />
          <UiErrorState
            v-else-if="error"
            :message="errorMsg"
            :code="error.status ? String(error.status) : null"
            @retry="load"
          />
          <UiEmptyState
            v-else-if="!dailySeries.length"
            title="Sem receita no período"
            description="Nenhuma cobrança autorizada para os filtros atuais. Ajuste o período ou registre cobranças."
            icon="chart"
          >
            <template #action>
              <UiButton to="/consultations">Abrir agendamentos</UiButton>
            </template>
          </UiEmptyState>
          <ul v-else class="rev-bars" role="list" aria-label="Receita autorizada por dia">
            <li
              v-for="b in dailySeries"
              :key="b.day"
              class="rev-bar-row"
              :aria-label="`${b.label}: ${b.display}`"
            >
              <span class="rev-bar-label" aria-hidden="true">{{ b.label }}</span>
              <span class="rev-bar-track" aria-hidden="true">
                <span class="rev-bar-fill" :data-pct="b.bucket" />
              </span>
              <span class="rev-bar-value" aria-hidden="true">{{ b.display }}</span>
            </li>
          </ul>
        </UiCard>

        <!-- Por profissional -->
        <UiCard
          title="Por profissional"
          subtitle="Receita autorizada por membro da equipe — amostra da página, não o período inteiro."
        >
          <template #actions>
            <UiButton variant="ghost" size="sm" to="/professionals">Equipe</UiButton>
          </template>

          <UiLoadingState v-if="loading" variant="skeleton" :skeleton-lines="5" />
          <UiErrorState v-else-if="error" :message="errorMsg" @retry="load" />
          <UiEmptyState
            v-else-if="!byProfessional.length"
            title="Sem dados"
            description="Nenhuma receita atribuída a profissionais no período."
            icon="inbox"
          />
          <ul v-else class="rev-rank" role="list">
            <li v-for="(p, idx) in byProfessional" :key="p.id" class="rev-rank-row">
              <span class="rev-rank-pos" aria-hidden="true">{{ idx + 1 }}</span>
              <span class="rev-rank-name">{{ p.name }}</span>
              <span class="rev-rank-meta">{{ p.count }} consulta(s)</span>
              <span class="rev-rank-value">{{ formatCents(p.revenue_cents) }}</span>
            </li>
          </ul>
        </UiCard>
      </div>

      <!-- Por paciente (top pagadores) -->
      <UiCard
        title="Por paciente"
        subtitle="Pacientes com maior receita autorizada — amostra da página, não o período inteiro."
      >
        <template #actions>
          <UiButton variant="ghost" size="sm" to="/patients">Pacientes</UiButton>
        </template>

        <UiLoadingState v-if="loading" variant="skeleton" :skeleton-lines="4" />
        <UiErrorState v-else-if="error" :message="errorMsg" @retry="load" />
        <UiEmptyState
          v-else-if="!byPatient.length"
          title="Sem dados"
          description="Nenhuma receita atribuída a pacientes no período."
          icon="inbox"
        >
          <template #action>
            <UiButton to="/patients">Ver pacientes</UiButton>
          </template>
        </UiEmptyState>
        <ul v-else class="rev-rank" role="list">
          <li v-for="(p, idx) in byPatient" :key="p.id" class="rev-rank-row">
            <span class="rev-rank-pos" aria-hidden="true">{{ idx + 1 }}</span>
            <span class="rev-rank-name">{{ p.name }}</span>
            <span class="rev-rank-meta">{{ p.count }} cobrança(s)</span>
            <span class="rev-rank-value">{{ formatCents(p.revenue_cents) }}</span>
          </li>
        </ul>
      </UiCard>

      <!-- Drill-down: transações do período -->
      <UiCard title="Transações" :subtitle="transactionsSubtitle">
        <template #actions>
          <UiButton variant="ghost" size="sm" to="/consultations">Abrir lista completa</UiButton>
        </template>

        <UiDataTable
          :columns="txColumns"
          :rows="rows"
          :loading="loading"
          :error="error ? errorMsg : null"
          row-key="id"
          density="compact"
          clickable-rows
          server-mode
          :sort="sort"
          :page="meta.page || 1"
          :page-size="pageSize"
          :total="meta.total || 0"
          paginated
          :empty="{
            title: 'Nenhuma transação',
            description: 'Não há cobranças para os filtros atuais.',
            icon: 'inbox',
          }"
          @update:sort="onSort"
          @update:page="onPage"
          @update:page-size="onPageSize"
          @row-click="openTransaction"
        >
          <template #cell-scheduled_at="{ value }">{{ format.formatDateTime(value) }}</template>
          <template #cell-professional_id="{ value }">{{ professionalName(value) }}</template>
          <template #cell-patient_id="{ value }">{{ patientName(value) }}</template>
          <template #cell-amount_cents="{ value }">{{ formatCents(value) }}</template>
          <template #cell-payment_status="{ value }">
            <UiStatusBadge :status="value || 'pending'" />
          </template>
          <template #cell-status="{ value }">
            <UiStatusBadge :status="value || 'scheduled'" />
          </template>
          <template #empty-action>
            <UiButton to="/consultations">Ir para agendamentos</UiButton>
          </template>
        </UiDataTable>
      </UiCard>
    </template>

    <template #footer>
      <span>Escopo automático por clínica (tenant). Receita = cobranças com pagamento autorizado. Atualizado: {{ lastUpdatedLabel }}.</span>
    </template>
  </UiPageLayout>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import {
  UiPageLayout,
  UiCard,
  UiMetricCard,
  UiDataTable,
  UiStatusBadge,
  UiButton,
  UiFiltersPanel,
  UiEmptyState,
  UiErrorState,
  UiLoadingState,
  useToast,
  format,
} from '../ui/index.js';
import { resourceFactory } from '../api.js';

const router = useRouter();
const toast = useToast();

// Recursos REAIS de domínio (resourceFactory → /v1/<name>).
const revenueApi = resourceFactory('dashboard/revenue');
const patientsApi = resourceFactory('patients');
const professionalsApi = resourceFactory('professionals');

// ── Estado ───────────────────────────────────────────────────────────────────
const loading = ref(true);
const error = ref(null);
const rows = ref([]);
const meta = reactive({ total: 0, revenue_cents: 0, page: 1, limit: 50 });
const pageSize = ref(50);
const sort = ref({ key: 'scheduled_at', dir: 'desc' });
const lastUpdated = ref(null);

// Mapas id→nome para profissionais/pacientes (carregados em paralelo, fail-soft).
const professionals = ref([]); // [{ id, full_name }]
const patients = ref([]); // [{ id, full_name }]

// Filtros expostos ao usuário (período + profissional + paciente).
const filters = reactive({ date_from: '', date_to: '', professional_id: '', patient_id: '' });

const denied = computed(() => isDenied(error.value));

// ── Campos do painel de filtros (a11y: label em cada campo via UiFiltersPanel) ──
const filterFields = computed(() => [
  { key: 'date_from', label: 'De', type: 'date' },
  { key: 'date_to', label: 'Até', type: 'date' },
  {
    key: 'professional_id',
    label: 'Profissional',
    type: 'select',
    options: professionals.value.map((p) => ({ value: String(p.id), label: nameOf(p) })),
  },
  {
    key: 'patient_id',
    label: 'Paciente',
    type: 'select',
    options: patients.value.map((p) => ({ value: String(p.id), label: nameOf(p) })),
  },
]);

// ── Colunas da tabela de transações (drill-down) ────────────────────────────────
// `sortable` aqui ordena apenas a PÁGINA atual (o backend ordena fixo por
// scheduled_at DESC e não aceita params de ordenação). O subtítulo da tabela
// explicita isso para o usuário.
const txColumns = [
  { key: 'scheduled_at', label: 'Data', sortable: true },
  { key: 'professional_id', label: 'Profissional' },
  { key: 'patient_id', label: 'Paciente' },
  { key: 'payment_status', label: 'Pagamento' },
  { key: 'status', label: 'Situação' },
  { key: 'amount_cents', label: 'Valor', align: 'right', sortable: true },
];

// ── Helpers ──────────────────────────────────────────────────────────────────
function isDenied(err) {
  return !!err && (err.status === 403 || err.status === 401);
}
function nameOf(p) {
  return (p && (p.full_name || p.name)) || ('#' + (p && p.id));
}
function formatCents(cents) {
  const n = Number(cents);
  if (!isFinite(n)) return '—';
  return format.formatCurrency(n / 100);
}
function go(to) {
  router.push(to);
}
function unwrap(res) {
  if (Array.isArray(res)) return res;
  if (res && Array.isArray(res.data)) return res.data;
  return [];
}

// id → nome (cai para o id quando o catálogo não resolveu / sem acesso).
const professionalName = (id) => {
  const hit = professionals.value.find((p) => String(p.id) === String(id));
  return hit ? nameOf(hit) : id ? '#' + id : '—';
};
const patientName = (id) => {
  const hit = patients.value.find((p) => String(p.id) === String(id));
  return hit ? nameOf(hit) : id ? '#' + id : '—';
};

// ── Derivados: totais ──────────────────────────────────────────────────────────
const revenueDisplay = computed(() => formatCents(meta.revenue_cents));
const revenueHint = computed(() => {
  if (loading.value) return 'apurando…';
  if (error.value) return 'falha ao apurar';
  return meta.total ? `de ${format.formatNumber(meta.total)} transação(ões)` : 'nenhuma cobrança no período';
});
const ticketDisplay = computed(() => {
  if (loading.value || !meta.total) return '—';
  return formatCents(meta.revenue_cents / meta.total);
});
const periodLabel = computed(() => {
  if (!filters.date_from && !filters.date_to) return 'todo o histórico';
  const from = filters.date_from ? format.formatDate(filters.date_from) : 'início';
  const to = filters.date_to ? format.formatDate(filters.date_to) : 'hoje';
  return `${from} → ${to}`;
});

// ── Derivado: receita autorizada por dia (série) ────────────────────────────────
const authorizedRows = computed(() =>
  rows.value.filter((r) => r.payment_status === 'authorized'),
);
const dailySeries = computed(() => {
  const map = new Map();
  for (const r of authorizedRows.value) {
    const d = new Date(r.scheduled_at);
    if (isNaN(d.getTime())) continue;
    const key = d.toISOString().slice(0, 10);
    map.set(key, (map.get(key) || 0) + (Number(r.amount_cents) || 0));
  }
  const entries = [...map.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1));
  const max = entries.reduce((m, [, v]) => Math.max(m, v), 0) || 1;
  return entries.map(([day, cents]) => ({
    day,
    label: format.formatDate(day),
    cents,
    display: formatCents(cents),
    // bucket 0..20 (passo de 5) — largura via data-attr no CSS (sem style inline, CSP-safe).
    bucket: Math.max(1, Math.round((cents / max) * 20)) * 5,
  }));
});
const seriesSubtitle = computed(() => {
  if (loading.value) return 'Carregando…';
  const n = dailySeries.value.length;
  return n
    ? `${n} dia(s) com receita · amostra da página (não o período inteiro)`
    : 'Sem receita autorizada na amostra da página';
});

// ── Derivados: ranking por profissional / paciente (sobre a página carregada) ────
function groupBy(getId, getName) {
  const map = new Map();
  for (const r of authorizedRows.value) {
    const id = getId(r);
    if (id === null || id === undefined || id === '') continue;
    const cur = map.get(id) || { id, name: getName(id), revenue_cents: 0, count: 0 };
    cur.revenue_cents += Number(r.amount_cents) || 0;
    cur.count += 1;
    map.set(id, cur);
  }
  return [...map.values()].sort((a, b) => b.revenue_cents - a.revenue_cents).slice(0, 8);
}
const byProfessional = computed(() =>
  groupBy((r) => r.professional_id, (id) => professionalName(id)),
);
const byPatient = computed(() => groupBy((r) => r.patient_id, (id) => patientName(id)));
const activeProfessionalsCount = computed(() => {
  const set = new Set();
  for (const r of authorizedRows.value) {
    if (r.professional_id !== null && r.professional_id !== undefined) set.add(r.professional_id);
  }
  return set.size;
});

// ── Estados da moldura / tabela ──────────────────────────────────────────────────
const errorMsg = computed(() =>
  isDenied(error.value)
    ? 'Seu perfil não tem acesso à receita da clínica.'
    : 'Não foi possível carregar a receita. Tente novamente.',
);
// Só é erro FATAL (moldura inteira) quando NÃO é 403 — o 403 vira o estado "Acesso restrito".
const fatalError = computed(() => (error.value && !denied.value ? errorMsg.value : null));
const transactionsSubtitle = computed(() =>
  loading.value
    ? 'Carregando transações…'
    : `${format.formatNumber(meta.total || 0)} transação(ões) no período · clique para abrir`,
);
const lastUpdatedLabel = computed(() =>
  lastUpdated.value ? format.formatDateTime(lastUpdated.value) : '—',
);

// ── Carregamento ─────────────────────────────────────────────────────────────
async function loadCatalogs() {
  // Catálogos para rótulos e filtros — fail-soft: se faltar acesso, caímos para id.
  const [pr, pa] = await Promise.allSettled([
    professionalsApi.list({ pageSize: 200 }),
    patientsApi.list({ pageSize: 200 }),
  ]);
  professionals.value = pr.status === 'fulfilled' ? unwrap(pr.value) : [];
  patients.value = pa.status === 'fulfilled' ? unwrap(pa.value) : [];
}

async function loadRevenue() {
  loading.value = true;
  error.value = null;
  try {
    const params = {
      date_from: filters.date_from || undefined,
      date_to: filters.date_to || undefined,
      professional_id: filters.professional_id || undefined,
      patient_id: filters.patient_id || undefined,
      page: meta.page || 1,
      limit: pageSize.value,
    };
    const res = await revenueApi.list(params);
    rows.value = unwrap(res);
    const m = (res && res.meta) || {};
    meta.total = Number(m.total) || rows.value.length;
    meta.revenue_cents = Number(m.revenue_cents) || 0;
    meta.page = Number(m.page) || params.page;
    meta.limit = Number(m.limit) || pageSize.value;
  } catch (e) {
    error.value = e;
    rows.value = [];
    if (!isDenied(e)) meta.total = 0;
  } finally {
    loading.value = false;
  }
}

async function load() {
  await Promise.allSettled([loadCatalogs(), loadRevenue()]);
  lastUpdated.value = new Date().toISOString();
  if (error.value && !denied.value) toast.error('Falha ao carregar a receita');
}

// ── Interações ───────────────────────────────────────────────────────────────
function onApply() {
  meta.page = 1;
  loadRevenue();
  toast.success('Filtros aplicados');
}
function onClear() {
  filters.date_from = '';
  filters.date_to = '';
  filters.professional_id = '';
  filters.patient_id = '';
  meta.page = 1;
  loadRevenue();
}
function onSort(next) {
  // O backend ordena fixo por scheduled_at DESC e NÃO aceita params de ordenação,
  // então a ordenação é deliberadamente só-da-página: reordenamos as rows já
  // carregadas SEM resetar meta.page nem refazer fetch (resetar a página sem
  // refetch deixaria paginação e ordem inconsistentes). O cabeçalho das colunas
  // ordenáveis avisa que a ordenação cobre apenas a página atual.
  sort.value = next;
  rows.value = [...rows.value].sort((a, b) => {
    const x = a[next.key];
    const y = b[next.key];
    if (x == null) return 1;
    if (y == null) return -1;
    return (x > y ? 1 : x < y ? -1 : 0) * (next.dir === 'desc' ? -1 : 1);
  });
}
function onPage(p) {
  meta.page = p;
  loadRevenue();
}
function onPageSize(s) {
  pageSize.value = s;
  meta.page = 1;
  loadRevenue();
}
function openTransaction(row) {
  // Drill-down REAL até a transação: cada row de receita é uma consulta cobrada
  // (o endpoint seleciona `c.id ... FROM consultations`), então abrimos o
  // detalhe da consulta. Sem id (linha degenerada) caímos na lista de domínio.
  const id = row && (row.id ?? row.consultation_id);
  router.push(id ? `/consultations/${id}` : '/consultations');
}

onMounted(load);
</script>

<style scoped>
/* Indicadores */
.rev-metrics {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: var(--ui-space-4);
}

/* Grid série + ranking */
.rev-grid {
  display: grid;
  grid-template-columns: 1.5fr 1fr;
  gap: var(--ui-space-4);
  align-items: start;
}

/* Série diária — barras horizontais CSS-safe (largura por data-pct, sem style inline) */
.rev-bars {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-3);
}
.rev-bar-row {
  display: grid;
  grid-template-columns: 92px 1fr auto;
  align-items: center;
  gap: var(--ui-space-3);
}
.rev-bar-label {
  color: rgb(var(--ui-muted));
  font-size: var(--ui-text-xs);
  white-space: nowrap;
}
.rev-bar-track {
  position: relative;
  height: 14px;
  border-radius: var(--ui-radius-pill);
  background: rgb(var(--ui-surface-2));
  overflow: hidden;
}
.rev-bar-fill {
  display: block;
  height: 100%;
  border-radius: var(--ui-radius-pill);
  background: linear-gradient(
    90deg,
    rgb(var(--ui-accent) / 0.55),
    rgb(var(--ui-accent-strong))
  );
  transition: width 0.4s ease;
}
.rev-bar-value {
  font-family: var(--ui-font-display);
  font-weight: 600;
  font-size: var(--ui-text-sm);
  white-space: nowrap;
}
/* Buckets de largura (5..100). Sem :style — CSP-safe. */
.rev-bar-fill[data-pct="5"] { width: 5%; }
.rev-bar-fill[data-pct="10"] { width: 10%; }
.rev-bar-fill[data-pct="15"] { width: 15%; }
.rev-bar-fill[data-pct="20"] { width: 20%; }
.rev-bar-fill[data-pct="25"] { width: 25%; }
.rev-bar-fill[data-pct="30"] { width: 30%; }
.rev-bar-fill[data-pct="35"] { width: 35%; }
.rev-bar-fill[data-pct="40"] { width: 40%; }
.rev-bar-fill[data-pct="45"] { width: 45%; }
.rev-bar-fill[data-pct="50"] { width: 50%; }
.rev-bar-fill[data-pct="55"] { width: 55%; }
.rev-bar-fill[data-pct="60"] { width: 60%; }
.rev-bar-fill[data-pct="65"] { width: 65%; }
.rev-bar-fill[data-pct="70"] { width: 70%; }
.rev-bar-fill[data-pct="75"] { width: 75%; }
.rev-bar-fill[data-pct="80"] { width: 80%; }
.rev-bar-fill[data-pct="85"] { width: 85%; }
.rev-bar-fill[data-pct="90"] { width: 90%; }
.rev-bar-fill[data-pct="95"] { width: 95%; }
.rev-bar-fill[data-pct="100"] { width: 100%; }

/* Ranking por profissional / paciente */
.rev-rank {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
}
.rev-rank-row {
  display: grid;
  grid-template-columns: 22px 1fr auto;
  grid-template-areas: "pos name value" "pos meta value";
  align-items: center;
  column-gap: var(--ui-space-3);
  padding: var(--ui-space-3) 0;
  border-bottom: 1px solid rgb(var(--ui-border));
}
.rev-rank-row:last-child {
  border-bottom: none;
}
.rev-rank-pos {
  grid-area: pos;
  display: grid;
  place-items: center;
  width: 22px;
  height: 22px;
  border-radius: var(--ui-radius-pill);
  background: rgb(var(--ui-accent) / 0.12);
  color: rgb(var(--ui-accent-strong));
  font-size: var(--ui-text-xs);
  font-weight: 700;
}
.rev-rank-name {
  grid-area: name;
  font-weight: 600;
  font-size: var(--ui-text-sm);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.rev-rank-meta {
  grid-area: meta;
  color: rgb(var(--ui-muted));
  font-size: var(--ui-text-xs);
}
.rev-rank-value {
  grid-area: value;
  font-family: var(--ui-font-display);
  font-weight: 700;
  font-size: var(--ui-text-sm);
  white-space: nowrap;
}

@media (max-width: 860px) {
  .rev-grid {
    grid-template-columns: 1fr;
  }
  .rev-bar-row {
    grid-template-columns: 76px 1fr auto;
  }
}
</style>
