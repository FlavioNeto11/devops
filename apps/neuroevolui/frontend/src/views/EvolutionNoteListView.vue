<template>
  <UiPageLayout
    eyebrow="Prontuário"
    title="Evoluções"
    subtitle="Linha do tempo das evoluções clínicas. Filtre por paciente, tipo, profissional e período; clique para abrir o detalhe."
    width="wide"
  >
    <template #actions>
      <UiButton variant="ghost" :loading="r.loading.value" @click="reload">Atualizar</UiButton>
      <UiButton to="/evolution-notes/new" variant="primary">Nova evolução</UiButton>
    </template>

    <!-- Resumo (KPIs) — sempre visível; placeholders enquanto carrega -->
    <section class="en-metrics" aria-label="Resumo de evoluções">
      <UiMetricCard
        label="Evoluções"
        :value="r.loading.value ? null : format.formatNumber(r.total.value)"
        :loading="r.loading.value"
        tone="primary"
        hint="No filtro de servidor"
      />
      <UiMetricCard
        label="Sessões"
        :value="r.loading.value ? null : format.formatNumber(typeCounts.session)"
        :loading="r.loading.value"
        tone="running"
        hint="Nesta página"
      />
      <UiMetricCard
        label="Resultados de teste"
        :value="r.loading.value ? null : format.formatNumber(typeCounts.test_result)"
        :loading="r.loading.value"
        tone="success"
        hint="Nesta página"
      />
      <UiMetricCard
        label="Planos de intervenção"
        :value="r.loading.value ? null : format.formatNumber(typeCounts.intervention_plan)"
        :loading="r.loading.value"
        tone="warning"
        hint="Nesta página"
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

    <!-- Banner de filtro / alternador de visualização -->
    <template #banner>
      <div class="en-toolbar" role="region" aria-label="Visualização e filtros ativos">
        <div v-if="hasLocalFilters && !r.error.value" class="en-active" role="status">
          <span class="en-active-text">
            Exibindo {{ format.formatNumber(visibleRows.length) }} de
            {{ format.formatNumber(r.items.value.length) }} evoluções desta página.
          </span>
          <span v-if="hasMorePages" class="en-active-more">
            Há mais páginas — vá para a próxima para ver outras correspondências.
          </span>
          <UiButton variant="subtle" size="sm" @click="onClear">Limpar filtros</UiButton>
        </div>
        <span v-else class="en-hint">Linha do tempo das evoluções do tenant, da mais recente para a mais antiga.</span>

        <div class="en-views" role="tablist" aria-label="Modo de visualização">
          <button
            class="en-view-btn"
            type="button"
            role="tab"
            :aria-selected="view === 'timeline' ? 'true' : 'false'"
            :data-active="view === 'timeline' ? 'true' : null"
            @click="view = 'timeline'"
          >
            Linha do tempo
          </button>
          <button
            class="en-view-btn"
            type="button"
            role="tab"
            :aria-selected="view === 'table' ? 'true' : 'false'"
            :data-active="view === 'table' ? 'true' : null"
            @click="view = 'table'"
          >
            Tabela
          </button>
        </div>
      </div>
    </template>

    <!-- ESTADO: erro (vale para os dois modos) -->
    <UiErrorState
      v-if="r.error.value"
      :message="errorMessage"
      retryable
      @retry="reload"
    />

    <!-- ESTADO: carregando — esqueleto da linha do tempo -->
    <UiLoadingState
      v-else-if="r.loading.value && view === 'timeline'"
      variant="skeleton"
      :skeleton-lines="6"
    />

    <!-- ESTADO: vazio — CTA -->
    <UiEmptyState
      v-else-if="!r.loading.value && !visibleRows.length"
      v-bind="emptyState"
    >
      <template #action>
        <div class="en-empty-actions">
          <UiButton v-if="hasLocalFilters || hasServerFilters" variant="ghost" @click="onClear">Limpar filtros</UiButton>
          <UiButton to="/evolution-notes/new" variant="primary">Registrar primeira evolução</UiButton>
        </div>
      </template>
    </UiEmptyState>

    <!-- ESTADO: normal — LINHA DO TEMPO -->
    <ol v-else-if="view === 'timeline'" class="en-timeline" aria-label="Linha do tempo de evoluções">
      <li
        v-for="(group, gi) in groupedRows"
        :key="group.key"
        class="en-day"
      >
        <p class="en-day-label">{{ group.label }}</p>
        <ul class="en-day-items">
          <li
            v-for="row in group.items"
            :key="row.id"
            class="en-item"
            :data-type="typeKey(row.type)"
          >
            <button
              class="en-card"
              type="button"
              :aria-label="cardAria(row)"
              @click="open(row)"
            >
              <span class="en-marker" aria-hidden="true">{{ typeGlyph(row.type) }}</span>
              <span class="en-body">
                <span class="en-head">
                  <UiStatusBadge
                    :status="row.type"
                    :tone="typeTone(row.type)"
                    :label="typeLabel(row.type)"
                    size="sm"
                  />
                  <span v-if="isDeleted(row)" class="en-deleted">
                    <UiStatusBadge status="deleted" tone="error" label="Excluída" size="sm" />
                  </span>
                  <time class="en-time">{{ format.formatDateTime(row.note_date || row.created_at) }}</time>
                </span>
                <span class="en-summary">{{ summary(row) }}</span>
                <span class="en-meta">
                  <span class="en-chip">Paciente: {{ patientLabel(row) }}</span>
                  <span class="en-chip">Profissional: {{ professionalLabel(row) }}</span>
                </span>
              </span>
              <span class="en-go" aria-hidden="true">›</span>
            </button>
          </li>
        </ul>
        <span v-if="gi < groupedRows.length - 1" class="en-day-rule" aria-hidden="true" />
      </li>
    </ol>

    <!-- ESTADO: normal — TABELA (alternativa estruturada; trata seus próprios estados) -->
    <UiDataTable
      v-else
      :columns="columns"
      :rows="visibleRows"
      row-key="id"
      :loading="r.loading.value"
      density="comfortable"
      clickable-rows
      :sort="r.sort.value"
      :paginated="false"
      :empty="emptyState"
      @row-click="open"
      @update:sort="r.setSort"
    >
      <template #cell-note_date="{ row }">
        <span class="en-cell-when">{{ format.formatDateTime(row.note_date || row.created_at) }}</span>
      </template>
      <template #cell-type="{ value }">
        <UiStatusBadge :status="value" :tone="typeTone(value)" :label="typeLabel(value)" />
      </template>
      <template #cell-patient_id="{ row }">
        <span class="en-cell-id">{{ patientLabel(row) }}</span>
      </template>
      <template #cell-professional_id="{ row }">
        <span class="en-cell-id">{{ professionalLabel(row) }}</span>
      </template>
      <template #cell-summary="{ row }">
        <span class="en-cell-summary">{{ summary(row) }}</span>
      </template>
      <template #cell-status="{ value }">
        <UiStatusBadge :status="value || 'active'" :tone="statusTone(value)" :label="statusLabel(value)" />
      </template>
    </UiDataTable>

    <!-- Paginação do servidor (vale para os dois modos; permanece visível mesmo com -->
    <!-- filtro local, pois há correspondências em outras páginas que o recorte não alcança). -->
    <UiPagination
      v-if="!r.loading.value && !r.error.value && r.total.value > r.pageSize.value"
      :page="r.page.value"
      :page-size="r.pageSize.value"
      :total="r.total.value"
      @update:page="r.setPage"
      @update:page-size="onPageSize"
    />

    <template #footer>
      <span>Fonte: evoluções do tenant em tempo real. Paciente e tipo filtram no servidor; profissional e período recortam a página atual.</span>
    </template>
  </UiPageLayout>
</template>

<script setup>
import { ref, computed, watch, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import {
  UiPageLayout,
  UiDataTable,
  UiPagination,
  UiFiltersPanel,
  UiMetricCard,
  UiStatusBadge,
  UiEmptyState,
  UiLoadingState,
  UiErrorState,
  UiButton,
  useResource,
  useToast,
  format,
} from '../ui/index.js';
import * as api from '../api.js';

const router = useRouter();
const toast = useToast();

// --- Resolução defensiva de recursos REST ----------------------------------
// O integrador anexa nomes camelCase a api.js (ex.: `patients`, `consultations`).
// Para evolution-notes usamos o nome convencional se existir e, em qualquer caso,
// caímos para o factory que aponta para o endpoint REAL /v1/evolution-notes.
function resource(name) {
  const camel = name.replace(/[-_](\w)/g, (_, c) => c.toUpperCase());
  const candidate = api[camel] || api[name];
  if (candidate && typeof candidate.list === 'function') return candidate;
  return api.resourceFactory(name);
}
const evolutionNotes = resource('evolution-notes');
const patientsApi = resource('patients');

// --- Catálogo de tipos (enum do contrato) ----------------------------------
const TYPE_LABELS = {
  session: 'Sessão',
  test_result: 'Resultado de teste',
  intervention_plan: 'Plano de intervenção',
  observation: 'Observação',
};
const TYPE_TONES = {
  session: 'running',
  test_result: 'success',
  intervention_plan: 'warning',
  observation: 'neutral',
};
const TYPE_GLYPHS = {
  session: '🗣',
  test_result: '📊',
  intervention_plan: '🧭',
  observation: '📝',
};
const typeKey = (t) => String(t || '').toLowerCase();
const typeLabel = (t) => TYPE_LABELS[typeKey(t)] || format.humanize(t) || 'Evolução';
const typeTone = (t) => TYPE_TONES[typeKey(t)] || 'neutral';
const typeGlyph = (t) => TYPE_GLYPHS[typeKey(t)] || '•';

const STATUS_LABELS = { active: 'Ativa', deleted: 'Excluída' };
const statusLabel = (s) => STATUS_LABELS[String(s || 'active').toLowerCase()] || format.humanize(s);
const statusTone = (s) => (String(s || '').toLowerCase() === 'deleted' ? 'error' : 'success');
const isDeleted = (row) =>
  String(row.status || '').toLowerCase() === 'deleted' || !!row.deleted_at;

// --- Colunas da tabela ------------------------------------------------------
const columns = [
  { key: 'note_date', label: 'Data', sortable: true },
  { key: 'type', label: 'Tipo', sortable: true },
  { key: 'patient_id', label: 'Paciente', sortable: true },
  { key: 'professional_id', label: 'Profissional' },
  { key: 'summary', label: 'Resumo' },
  { key: 'status', label: 'Status', sortable: true },
];

// --- Filtros ----------------------------------------------------------------
// `ref` (não reactive) para o v-model do UiFiltersPanel escrever de volta sem warning.
const filters = ref({ patient: '', type: '', professional: '', from: '', to: '' });

const patientMap = ref({}); // id -> nome
const patientOptions = ref([]); // [{ value, label }]

const filterFields = computed(() => [
  {
    key: 'patient',
    label: 'Paciente',
    type: patientOptions.value.length ? 'select' : 'text',
    options: patientOptions.value,
    placeholder: 'Id do paciente…',
  },
  {
    key: 'type',
    label: 'Tipo',
    type: 'select',
    options: [
      { value: 'session', label: 'Sessão' },
      { value: 'test_result', label: 'Resultado de teste' },
      { value: 'intervention_plan', label: 'Plano de intervenção' },
      { value: 'observation', label: 'Observação' },
    ],
  },
  { key: 'professional', label: 'Profissional', type: 'text', placeholder: 'Id do profissional…' },
  { key: 'from', label: 'De', type: 'date' },
  { key: 'to', label: 'Até', type: 'date' },
]);

// --- Recurso (server-mode): paginação/ordenação + filtros de servidor -------
// O backend /v1/evolution-notes filtra por patient_id e type; profissional e
// período são recortados no cliente sobre a página carregada.
const r = useResource(evolutionNotes, {
  pageSize: 25,
  sort: { key: 'note_date', dir: 'desc' },
  filters: { patient_id: '', type: '' },
});

// --- Rótulos de exibição ----------------------------------------------------
const patientLabel = (row) =>
  row.patient_name || patientMap.value[String(row.patient_id)] || row.patient_id || '—';
const professionalLabel = (row) =>
  row.professional_name || row.professional_id || 'Não informado';

function summary(row) {
  const raw = String(row.summary || row.text || '').replace(/\s+/g, ' ').trim();
  if (!raw) return 'Sem resumo registrado.';
  return raw.length > 160 ? raw.slice(0, 159) + '…' : raw;
}

// --- Filtragem local (profissional + período) -------------------------------
const hasServerFilters = computed(() => !!(filters.value.patient || filters.value.type));
const hasLocalFilters = computed(
  () => !!(filters.value.professional || filters.value.from || filters.value.to)
);
// Há registros do filtro de servidor além da página atual? Com filtro local ativo,
// outras correspondências podem estar nessas páginas — guiamos o usuário a paginar.
const hasMorePages = computed(() => r.total.value > r.pageSize.value);

function inRange(value, from, to) {
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
function matchesText(needle, ...hay) {
  const q = String(needle || '').trim().toLowerCase();
  if (!q) return true;
  return hay.some((h) => String(h ?? '').toLowerCase().includes(q));
}

const visibleRows = computed(() =>
  (r.items.value || []).filter((row) => {
    if (!matchesText(filters.value.professional, row.professional_id, row.professional_name)) return false;
    if (!inRange(row.note_date || row.created_at, filters.value.from, filters.value.to)) return false;
    return true;
  })
);

// --- Agrupamento por dia (linha do tempo) -----------------------------------
function dayKey(value) {
  const d = value ? new Date(value) : null;
  if (!d || isNaN(d.getTime())) return 'sem-data';
  return d.toISOString().slice(0, 10);
}
function dayLabel(key, sample) {
  if (key === 'sem-data') return 'Sem data';
  return format.formatDate(sample);
}
const groupedRows = computed(() => {
  const map = new Map();
  for (const row of visibleRows.value) {
    const when = row.note_date || row.created_at;
    const key = dayKey(when);
    if (!map.has(key)) map.set(key, { key, label: dayLabel(key, when), items: [] });
    map.get(key).items.push(row);
  }
  return [...map.values()];
});

// --- Métricas (página atual) ------------------------------------------------
const typeCounts = computed(() => {
  const acc = { session: 0, test_result: 0, intervention_plan: 0, observation: 0 };
  for (const row of visibleRows.value) {
    const k = typeKey(row.type);
    if (k in acc) acc[k] += 1;
  }
  return acc;
});

// --- Estados ----------------------------------------------------------------
const errorMessage = computed(() => {
  const e = r.error.value;
  if (!e) return null;
  return (e && e.message) || 'Não foi possível carregar as evoluções.';
});

const emptyState = computed(() => {
  const filtering = hasServerFilters.value || hasLocalFilters.value;
  return filtering
    ? {
        title: 'Nenhuma evolução encontrada',
        description: 'Nenhum registro corresponde aos filtros atuais. Ajuste os critérios ou limpe os filtros.',
        icon: '◎',
      }
    : {
        title: 'Nenhuma evolução registrada',
        description: 'Comece registrando a primeira evolução clínica para montar a linha do tempo do paciente.',
        icon: '＋',
      };
});

// --- a11y dos cartões -------------------------------------------------------
const cardAria = (row) =>
  typeLabel(row.type) +
  ' de ' +
  patientLabel(row) +
  ' em ' +
  format.formatDateTime(row.note_date || row.created_at) +
  '. Abrir detalhe.';

// --- Visualização -----------------------------------------------------------
const view = ref('timeline');

// --- Ações ------------------------------------------------------------------
function open(row) {
  router.push('/evolution-notes/' + row.id);
}

function onApply(values) {
  filters.value = { ...filters.value, ...(values || {}) };
  r.setFilters({ patient_id: filters.value.patient || '', type: filters.value.type || '' });
}
function onClear() {
  filters.value = { patient: '', type: '', professional: '', from: '', to: '' };
  r.setFilters({ patient_id: '', type: '' });
}
function onPageSize(size) {
  r.pageSize.value = size;
  r.setPage(1);
}

async function reload() {
  await r.load();
  if (!r.error.value) toast.success('Evoluções atualizadas.');
  else toast.error('Falha ao atualizar.', { detail: errorMessage.value });
}

// Carrega pacientes para resolver nomes e popular o filtro (fail-soft: sem
// pacientes, o filtro vira campo de texto e os ids aparecem crus).
async function loadPatients() {
  try {
    const res = await patientsApi.list({ pageSize: 200, sort: 'full_name', dir: 'asc' });
    const list = Array.isArray(res) ? res : res && res.data ? res.data : [];
    const map = {};
    const opts = [];
    for (const p of list) {
      const id = String(p.id);
      const name = p.full_name || p.name || id;
      map[id] = name;
      opts.push({ value: id, label: name });
    }
    patientMap.value = map;
    patientOptions.value = opts;
  } catch {
    patientMap.value = {};
    patientOptions.value = [];
  }
}

// Toast quando uma carga falha (além do estado de erro na tela).
watch(
  () => r.error.value,
  (e) => {
    if (e) toast.error(errorMessage.value);
  }
);

onMounted(() => {
  loadPatients();
  r.load();
});
</script>

<style scoped>
.en-metrics {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: var(--ui-space-4);
}

/* Toolbar do banner: filtros ativos + alternador de visão */
.en-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ui-space-3);
  flex-wrap: wrap;
}
.en-active {
  display: flex;
  align-items: center;
  gap: var(--ui-space-3);
  flex-wrap: wrap;
}
.en-active-text {
  color: rgb(var(--ui-fg));
  font-size: var(--ui-text-sm);
  font-weight: 600;
}
.en-active-more {
  color: rgb(var(--ui-muted));
  font-size: var(--ui-text-xs);
}
.en-hint {
  color: rgb(var(--ui-muted));
  font-size: var(--ui-text-sm);
}
.en-views {
  display: inline-flex;
  gap: 2px;
  padding: 3px;
  background: rgb(var(--ui-surface-2));
  border: 1px solid rgb(var(--ui-border));
  border-radius: var(--ui-radius-pill);
}
.en-view-btn {
  font: inherit;
  font-size: var(--ui-text-sm);
  font-weight: 600;
  color: rgb(var(--ui-muted));
  background: transparent;
  border: none;
  padding: 5px 14px;
  border-radius: var(--ui-radius-pill);
  cursor: pointer;
}
.en-view-btn:hover {
  color: rgb(var(--ui-fg));
}
.en-view-btn[data-active='true'] {
  background: rgb(var(--ui-surface));
  color: rgb(var(--ui-fg));
  box-shadow: var(--ui-shadow-sm);
}
.en-view-btn:focus-visible {
  outline: 2px solid rgb(var(--ui-accent));
  outline-offset: 2px;
}

/* Linha do tempo */
.en-timeline {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-5);
}
.en-day {
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-3);
}
.en-day-label {
  margin: 0;
  font-size: var(--ui-text-xs);
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: rgb(var(--ui-muted));
}
.en-day-items {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-3);
}
.en-item {
  position: relative;
}

.en-card {
  display: flex;
  align-items: flex-start;
  gap: var(--ui-space-4);
  width: 100%;
  text-align: left;
  font: inherit;
  background: rgb(var(--ui-surface));
  border: 1px solid rgb(var(--ui-border));
  border-left: 3px solid rgb(var(--ui-faint));
  border-radius: var(--ui-radius-lg);
  padding: var(--ui-space-4);
  cursor: pointer;
  box-shadow: var(--ui-shadow-sm);
  transition: border-color 0.15s ease, transform 0.15s ease;
}
.en-card:hover {
  border-color: rgb(var(--ui-border-strong));
  transform: translateY(-1px);
}
.en-card:focus-visible {
  outline: 2px solid rgb(var(--ui-accent));
  outline-offset: 2px;
}
.en-item[data-type='session'] .en-card { border-left-color: rgb(var(--ui-accent)); }
.en-item[data-type='test_result'] .en-card { border-left-color: rgb(var(--ui-ok)); }
.en-item[data-type='intervention_plan'] .en-card { border-left-color: rgb(var(--ui-warn)); }
.en-item[data-type='observation'] .en-card { border-left-color: rgb(var(--ui-muted)); }

.en-marker {
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 38px;
  height: 38px;
  border-radius: var(--ui-radius-md);
  background: rgb(var(--ui-surface-2));
  font-size: 1.05rem;
  line-height: 1;
}
.en-body {
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-2);
  min-width: 0;
  flex: 1 1 auto;
}
.en-head {
  display: flex;
  align-items: center;
  gap: var(--ui-space-2);
  flex-wrap: wrap;
}
.en-time {
  color: rgb(var(--ui-muted));
  font-size: var(--ui-text-xs);
  font-variant-numeric: tabular-nums;
  margin-left: auto;
}
.en-summary {
  color: rgb(var(--ui-fg));
  font-size: var(--ui-text-sm);
  line-height: 1.5;
  overflow-wrap: anywhere;
}
.en-meta {
  display: flex;
  gap: var(--ui-space-2);
  flex-wrap: wrap;
}
.en-chip {
  font-size: var(--ui-text-xs);
  color: rgb(var(--ui-muted));
  background: rgb(var(--ui-surface-2));
  border-radius: var(--ui-radius-pill);
  padding: 2px 10px;
}
.en-deleted {
  display: inline-flex;
}
.en-go {
  flex: 0 0 auto;
  align-self: center;
  color: rgb(var(--ui-muted));
  font-size: 1.4rem;
  line-height: 1;
}
.en-day-rule {
  height: 1px;
  background: rgb(var(--ui-border));
  margin-top: var(--ui-space-2);
}

/* Células da tabela */
.en-cell-when {
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.en-cell-id {
  font-size: var(--ui-text-sm);
}
.en-cell-summary {
  color: rgb(var(--ui-muted));
  font-size: var(--ui-text-sm);
}

.en-empty-actions {
  display: flex;
  gap: var(--ui-space-2);
  flex-wrap: wrap;
  justify-content: center;
}

@media (max-width: 860px) {
  .en-metrics {
    grid-template-columns: repeat(2, 1fr);
    gap: var(--ui-space-3);
  }
  .en-toolbar {
    align-items: flex-start;
  }
  .en-time {
    margin-left: 0;
  }
}

@media (max-width: 520px) {
  .en-metrics {
    grid-template-columns: 1fr;
  }
  .en-card {
    flex-wrap: wrap;
  }
  .en-go {
    display: none;
  }
}
</style>
