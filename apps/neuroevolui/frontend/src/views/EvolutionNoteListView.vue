<template>
  <UiPageLayout
    eyebrow="Prontuário"
    title="Notas de Evolução"
    subtitle="Visão agregada de todas as notas clínicas do tenant. Filtre por paciente, tipo, profissional e período."
    width="wide"
    :error="r.error.value"
    @retry="reload"
  >
    <template #actions>
      <UiButton variant="ghost" :loading="r.loading.value" @click="reload">Atualizar</UiButton>
      <UiButton to="/evolution-notes/new" variant="primary">Nova nota</UiButton>
    </template>

    <!-- KPIs da produção clínica (página atual) -->
    <section class="en-metrics" aria-label="Resumo da produção clínica">
      <UiMetricCard
        label="Total (filtro)"
        :value="r.loading.value ? null : format.formatNumber(r.total.value)"
        :loading="r.loading.value"
        tone="primary"
        hint="Registros no servidor"
      />
      <UiMetricCard
        label="Notas clínicas"
        :value="r.loading.value ? null : format.formatNumber(typeCounts.nota_clinica)"
        :loading="r.loading.value"
        tone="running"
        hint="Nesta página"
      />
      <UiMetricCard
        label="Resultados de teste"
        :value="r.loading.value ? null : format.formatNumber(typeCounts.resultado_teste)"
        :loading="r.loading.value"
        tone="success"
        hint="Nesta página"
      />
      <UiMetricCard
        label="Planos de intervenção"
        :value="r.loading.value ? null : format.formatNumber(typeCounts.plano_intervencao)"
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

    <!-- Banner: filtros ativos + alternador de visualização -->
    <template #banner>
      <div class="en-toolbar" role="region" aria-label="Controles de visualização">
        <div v-if="hasLocalFilters && !r.error.value" class="en-active" role="status">
          <span class="en-active-text">
            {{ format.formatNumber(visibleRows.length) }} de
            {{ format.formatNumber(r.items.value.length) }} nesta página.
          </span>
          <span v-if="hasMorePages" class="en-active-more">
            Há mais páginas — navegue para ver outras correspondências.
          </span>
          <UiButton variant="subtle" size="sm" @click="onClear">Limpar filtros</UiButton>
        </div>
        <span v-else class="en-hint">Da nota mais recente para a mais antiga, em tempo real.</span>

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

    <!-- Estado: erro -->
    <UiErrorState
      v-if="r.error.value"
      :message="errorMessage"
      retryable
      @retry="reload"
    />

    <!-- Estado: carregando (skeleton — cobre ambos os modos) -->
    <UiLoadingState
      v-else-if="r.loading.value"
      variant="skeleton"
      :skeleton-lines="8"
    />

    <!-- Estado: vazio -->
    <UiEmptyState
      v-else-if="!r.loading.value && !visibleRows.length"
      v-bind="emptyState"
    >
      <template #action>
        <div class="en-empty-actions">
          <UiButton
            v-if="hasLocalFilters || hasServerFilters"
            variant="ghost"
            @click="onClear"
          >Limpar filtros</UiButton>
          <UiButton to="/evolution-notes/new" variant="primary">Registrar primeira nota</UiButton>
        </div>
      </template>
    </UiEmptyState>

    <!-- Estado: normal — LINHA DO TEMPO -->
    <ol
      v-else-if="view === 'timeline'"
      class="en-timeline"
      aria-label="Linha do tempo de notas de evolução"
    >
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
            :data-status="statusKey(row.status)"
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
                    :status="row.type || 'outro'"
                    :tone="typeTone(row.type)"
                    :label="typeLabel(row.type)"
                  />
                  <UiStatusBadge
                    v-if="!isAtivo(row)"
                    :status="row.status"
                    :tone="statusTone(row.status)"
                    :label="noteStatusLabel(row.status)"
                  />
                  <time class="en-time" :datetime="row.note_date || row.created_at">
                    {{ format.formatDateTime(row.note_date || row.created_at) }}
                  </time>
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
        <hr v-if="gi < groupedRows.length - 1" class="en-day-rule" aria-hidden="true" />
      </li>
    </ol>

    <!-- Estado: normal — TABELA -->
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
        <time
          class="en-cell-when"
          :datetime="row.note_date || row.created_at"
        >{{ format.formatDateTime(row.note_date || row.created_at) }}</time>
      </template>
      <template #cell-type="{ value }">
        <UiStatusBadge :status="value || 'outro'" :tone="typeTone(value)" :label="typeLabel(value)" />
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
        <UiStatusBadge
          :status="value || 'ativo'"
          :tone="statusTone(value)"
          :label="noteStatusLabel(value)"
        />
      </template>
      <template #empty-action>
        <UiButton to="/evolution-notes/new">Registrar nota</UiButton>
      </template>
    </UiDataTable>

    <!-- Paginação servidor (ambos os modos) -->
    <UiPagination
      v-if="!r.loading.value && !r.error.value && r.total.value > r.pageSize.value"
      :page="r.page.value"
      :page-size="r.pageSize.value"
      :total="r.total.value"
      @update:page="r.setPage"
      @update:page-size="onPageSize"
    />

    <template #footer>
      <span>Fonte: notas de evolução do tenant em tempo real. Paciente e tipo filtram no servidor; profissional e período recortam a página atual.</span>
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

// Resolução defensiva: camelCase → alias com hífen → factory (fallback).
function resource(name) {
  const camel = name.replace(/[-_](\w)/g, (_, c) => c.toUpperCase());
  const candidate = api[camel] || api[name];
  if (candidate && typeof candidate.list === 'function') return candidate;
  return api.resourceFactory(name);
}
const evolutionNotesApi = resource('evolution-notes');
const patientsApi = resource('patients');

// ── Catálogo de tipos (enum da entidade) ─────────────────────────────────────
const TYPE_META = {
  nota_clinica:        { label: 'Nota clínica',         tone: 'running',  glyph: '📋' },
  resultado_teste:     { label: 'Resultado de teste',    tone: 'success',  glyph: '📊' },
  plano_intervencao:   { label: 'Plano de intervenção',  tone: 'warning',  glyph: '🧭' },
  anamnese:            { label: 'Anamnese',              tone: 'primary',  glyph: '📝' },
  outro:               { label: 'Outro',                 tone: 'neutral',  glyph: '•'  },
};
const typeKey    = (t) => String(t || '').toLowerCase();
const typeMeta   = (t) => TYPE_META[typeKey(t)] || TYPE_META.outro;
const typeLabel  = (t) => typeMeta(t).label;
const typeTone   = (t) => typeMeta(t).tone;
const typeGlyph  = (t) => typeMeta(t).glyph;

// ── Catálogo de status (enum da entidade) ────────────────────────────────────
const STATUS_META = {
  ativo:    { label: 'Ativa',    tone: 'success' },
  editado:  { label: 'Editada',  tone: 'warning' },
  excluido: { label: 'Excluída', tone: 'error'   },
};
const statusKey      = (s) => String(s || 'ativo').toLowerCase();
const statusMeta     = (s) => STATUS_META[statusKey(s)] || STATUS_META.ativo;
const noteStatusLabel = (s) => statusMeta(s).label;
const statusTone     = (s) => statusMeta(s).tone;
const isAtivo        = (row) => statusKey(row.status) === 'ativo' || !row.status;

// ── Colunas da tabela ────────────────────────────────────────────────────────
const columns = [
  { key: 'note_date',       label: 'Data',          sortable: true  },
  { key: 'type',            label: 'Tipo',           sortable: true  },
  { key: 'patient_id',      label: 'Paciente',       sortable: true  },
  { key: 'professional_id', label: 'Profissional'                    },
  { key: 'summary',         label: 'Resumo'                          },
  { key: 'status',          label: 'Status',         sortable: true  },
];

// ── Filtros ──────────────────────────────────────────────────────────────────
const filters = ref({ patient: '', type: '', professional: '', from: '', to: '' });

const patientMap     = ref({});
const patientOptions = ref([]);

const filterFields = computed(() => [
  {
    key:         'patient',
    label:       'Paciente',
    type:        patientOptions.value.length ? 'select' : 'text',
    options:     patientOptions.value,
    placeholder: 'Id ou nome do paciente…',
  },
  {
    key:     'type',
    label:   'Tipo',
    type:    'select',
    options: [
      { value: 'nota_clinica',      label: 'Nota clínica'         },
      { value: 'resultado_teste',   label: 'Resultado de teste'   },
      { value: 'plano_intervencao', label: 'Plano de intervenção' },
      { value: 'anamnese',          label: 'Anamnese'             },
      { value: 'outro',             label: 'Outro'                },
    ],
  },
  { key: 'professional', label: 'Profissional', type: 'text',  placeholder: 'Id do profissional…' },
  { key: 'from',         label: 'De',           type: 'date'                                       },
  { key: 'to',           label: 'Até',          type: 'date'                                       },
]);

// ── Recurso (server-mode) ────────────────────────────────────────────────────
const r = useResource(evolutionNotesApi, {
  pageSize: 25,
  sort:    { key: 'note_date', dir: 'desc' },
  filters: { patient_id: '', type: '' },
});

// ── Rótulos de exibição ──────────────────────────────────────────────────────
const patientLabel = (row) =>
  row.patient_name || patientMap.value[String(row.patient_id)] || row.patient_id || '—';

const professionalLabel = (row) =>
  row.professional_name || row.professional_id || 'Não informado';

function summary(row) {
  const raw = String(row.summary || row.text || '').replace(/\s+/g, ' ').trim();
  if (!raw) return 'Sem resumo registrado.';
  return raw.length > 160 ? raw.slice(0, 159) + '…' : raw;
}

// ── Filtragem local (profissional + período) ─────────────────────────────────
// O backend filtra patient_id e type; profissional e período recortam a página.
const hasServerFilters = computed(() => !!(filters.value.patient || filters.value.type));
const hasLocalFilters  = computed(
  () => !!(filters.value.professional || filters.value.from || filters.value.to)
);
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

// ── Agrupamento por dia (linha do tempo) ─────────────────────────────────────
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
    const key  = dayKey(when);
    if (!map.has(key)) map.set(key, { key, label: dayLabel(key, when), items: [] });
    map.get(key).items.push(row);
  }
  return [...map.values()];
});

// ── Métricas de tipo (página atual) ─────────────────────────────────────────
const typeCounts = computed(() => {
  const acc = { nota_clinica: 0, resultado_teste: 0, plano_intervencao: 0, anamnese: 0, outro: 0 };
  for (const row of visibleRows.value) {
    const k = typeKey(row.type);
    if (k in acc) acc[k] += 1;
    else acc.outro += 1;
  }
  return acc;
});

// ── Estados ──────────────────────────────────────────────────────────────────
const errorMessage = computed(() => {
  const e = r.error.value;
  if (!e) return null;
  return (e && e.message) || 'Não foi possível carregar as notas de evolução.';
});

const emptyState = computed(() => {
  const filtering = hasServerFilters.value || hasLocalFilters.value;
  return filtering
    ? {
        title:       'Nenhuma nota encontrada',
        description: 'Nenhum registro corresponde aos filtros. Ajuste os critérios ou limpe.',
        icon:        '◎',
      }
    : {
        title:       'Nenhuma nota registrada',
        description: 'Comece registrando a primeira nota de evolução clínica para montar a linha do tempo.',
        icon:        '＋',
      };
});

// ── a11y dos cartões ─────────────────────────────────────────────────────────
const cardAria = (row) =>
  typeLabel(row.type) +
  ' de ' +
  patientLabel(row) +
  ' em ' +
  format.formatDateTime(row.note_date || row.created_at) +
  '. Abrir detalhe.';

// ── Visualização ─────────────────────────────────────────────────────────────
const view = ref('timeline');

// ── Ações ─────────────────────────────────────────────────────────────────────
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
  if (!r.error.value) toast.success('Notas atualizadas.');
  else toast.error('Falha ao atualizar.', { detail: errorMessage.value });
}

// Carrega pacientes para resolver nomes e popular o filtro (fail-soft).
async function loadPatients() {
  try {
    const res  = await patientsApi.list({ pageSize: 200, sort: 'full_name', dir: 'asc' });
    const list = Array.isArray(res) ? res : res && res.data ? res.data : [];
    const map  = {};
    const opts = [];
    for (const p of list) {
      const id   = String(p.id);
      const name = p.full_name || p.name || id;
      map[id] = name;
      opts.push({ value: id, label: name });
    }
    patientMap.value     = map;
    patientOptions.value = opts;
  } catch {
    patientMap.value     = {};
    patientOptions.value = [];
  }
}

// Toast ao falhar a carga automática.
watch(
  () => r.error.value,
  (e) => { if (e) toast.error(errorMessage.value); }
);

onMounted(() => {
  loadPatients();
  r.load();
});
</script>

<style scoped>
/* KPIs */
.en-metrics {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: var(--ui-space-4);
}

/* Toolbar do banner */
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

/* Alternador de visualização */
.en-views {
  display: inline-flex;
  gap: var(--ui-space-1);
  padding: var(--ui-space-1);
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
  padding: var(--ui-space-1) var(--ui-space-3);
  border-radius: var(--ui-radius-pill);
  cursor: pointer;
  transition: color var(--ui-duration-fast, 0.12s);
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
  gap: var(--ui-space-6);
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
  letter-spacing: var(--ui-tracking-wide, 0.07em);
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

/* Cartão de nota */
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
  transition: border-color var(--ui-duration-fast, 0.15s), box-shadow var(--ui-duration-fast, 0.15s), transform var(--ui-duration-fast, 0.15s);
}
.en-card:hover {
  border-color: rgb(var(--ui-border-strong));
  box-shadow: var(--ui-shadow-md);
  transform: translateY(-1px);
}
.en-card:focus-visible {
  outline: 2px solid rgb(var(--ui-accent));
  outline-offset: 2px;
}

/* Borda lateral colorida por tipo */
.en-item[data-type='nota_clinica'] .en-card      { border-left-color: rgb(var(--ui-accent)); }
.en-item[data-type='resultado_teste'] .en-card   { border-left-color: rgb(var(--ui-ok)); }
.en-item[data-type='plano_intervencao'] .en-card { border-left-color: rgb(var(--ui-warn)); }
.en-item[data-type='anamnese'] .en-card          { border-left-color: rgb(var(--ui-info, var(--ui-accent))); }
.en-item[data-type='outro'] .en-card             { border-left-color: rgb(var(--ui-muted)); }

/* Opacidade para notas excluídas */
.en-item[data-status='excluido'] .en-card {
  opacity: 0.62;
}

.en-marker {
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: calc(var(--ui-space-5) + var(--ui-space-4));
  height: calc(var(--ui-space-5) + var(--ui-space-4));
  border-radius: var(--ui-radius-md);
  background: rgb(var(--ui-surface-2));
  font-size: var(--ui-text-lg);
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
  white-space: nowrap;
}
.en-summary {
  color: rgb(var(--ui-fg));
  font-size: var(--ui-text-sm);
  line-height: var(--ui-leading-normal, 1.55);
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
  border: 1px solid rgb(var(--ui-border));
  border-radius: var(--ui-radius-pill);
  padding: var(--ui-space-1) var(--ui-space-2);
}
.en-go {
  flex: 0 0 auto;
  align-self: center;
  color: rgb(var(--ui-muted));
  font-size: var(--ui-text-xl);
  line-height: 1;
}
.en-day-rule {
  border: none;
  border-top: 1px solid rgb(var(--ui-border));
  margin: var(--ui-space-2) 0 0;
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

/* CTA vazio */
.en-empty-actions {
  display: flex;
  gap: var(--ui-space-2);
  flex-wrap: wrap;
  justify-content: center;
}

/* Responsivo */
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
