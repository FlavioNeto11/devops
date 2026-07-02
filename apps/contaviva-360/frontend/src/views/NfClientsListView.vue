<template>
  <UiPageLayout
    title="Clientes NF"
    eyebrow="Emissão de Nota Fiscal"
    subtitle="Clientes cadastrados para emissão de nota fiscal. Gerencie razão social, CNPJ e inscrições."
    width="wide"
    :error="r.error.value ? (r.error.value.message || 'Erro ao carregar clientes NF') : null"
    @retry="r.load"
  >
    <!-- ── ações do cabeçalho ── -->
    <template #actions>
      <UiButton variant="primary" to="/nf-clients/new">
        Novo Cliente NF
      </UiButton>
    </template>

    <!-- ── filtros ── -->
    <template #filters>
      <UiFiltersPanel
        v-model="filters"
        :fields="filterFields"
        @apply="applyFilters"
        @clear="clearFilters"
      />
    </template>

    <!-- ── cards de resumo por tipo ── -->
    <div class="nfc-summary-row" role="region" aria-label="Resumo de clientes por tipo">
      <div
        class="nfc-summary-card"
        :data-active="activeTypeFilter === 'empresa'"
        role="button"
        tabindex="0"
        :aria-pressed="activeTypeFilter === 'empresa'"
        aria-label="Filtrar por Empresas"
        @click="toggleTypeFilter('empresa')"
        @keydown.enter="toggleTypeFilter('empresa')"
        @keydown.space.prevent="toggleTypeFilter('empresa')"
      >
        <span class="nfc-summary-icon" aria-hidden="true">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/><line x1="12" y1="12" x2="12" y2="16"/><line x1="10" y1="14" x2="14" y2="14"/></svg>
        </span>
        <span class="nfc-summary-count">{{ typeCounts.empresa }}</span>
        <span class="nfc-summary-label">Empresas</span>
      </div>
      <div
        class="nfc-summary-card"
        :data-active="activeTypeFilter === 'consumidor_final'"
        role="button"
        tabindex="0"
        :aria-pressed="activeTypeFilter === 'consumidor_final'"
        aria-label="Filtrar por Consumidores Finais"
        @click="toggleTypeFilter('consumidor_final')"
        @keydown.enter="toggleTypeFilter('consumidor_final')"
        @keydown.space.prevent="toggleTypeFilter('consumidor_final')"
      >
        <span class="nfc-summary-icon" aria-hidden="true">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
        </span>
        <span class="nfc-summary-count">{{ typeCounts.consumidor_final }}</span>
        <span class="nfc-summary-label">Consumidores</span>
      </div>
      <div
        class="nfc-summary-card"
        :data-active="activeTypeFilter === 'orgao_publico'"
        role="button"
        tabindex="0"
        :aria-pressed="activeTypeFilter === 'orgao_publico'"
        aria-label="Filtrar por Órgãos Públicos"
        @click="toggleTypeFilter('orgao_publico')"
        @keydown.enter="toggleTypeFilter('orgao_publico')"
        @keydown.space.prevent="toggleTypeFilter('orgao_publico')"
      >
        <span class="nfc-summary-icon" aria-hidden="true">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 22V8l9-6 9 6v14H3z"/><rect x="9" y="14" width="6" height="8"/><line x1="12" y1="2" x2="12" y2="8"/></svg>
        </span>
        <span class="nfc-summary-count">{{ typeCounts.orgao_publico }}</span>
        <span class="nfc-summary-label">Órgãos Públicos</span>
      </div>
      <div
        class="nfc-summary-card nfc-summary-card--total"
        role="status"
        aria-label="Total de clientes carregados"
      >
        <span class="nfc-summary-icon" aria-hidden="true">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><circle cx="3" cy="6" r="1"/><circle cx="3" cy="12" r="1"/><circle cx="3" cy="18" r="1"/></svg>
        </span>
        <span class="nfc-summary-count">{{ r.total.value }}</span>
        <span class="nfc-summary-label">Total</span>
      </div>
    </div>

    <!-- ── tabela principal ── -->
    <UiDataTable
      :columns="columns"
      :rows="r.items.value"
      :loading="r.loading.value"
      row-key="id"
      server-mode
      clickable-rows
      :sort="r.sort.value"
      :page="r.page.value"
      :page-size="r.pageSize.value"
      :total="r.total.value"
      paginated
      :empty="{ title: 'Nenhum cliente NF encontrado', description: 'Cadastre o primeiro cliente para emissão de nota fiscal ou ajuste os filtros aplicados.' }"
      @update:sort="r.setSort"
      @update:page="r.setPage"
      @row-click="openClient"
    >
      <!-- razão social com destaque visual -->
      <template #cell-razao_social="{ value, row }">
        <span class="nfc-razao-cell">
          <span class="nfc-razao-avatar" aria-hidden="true">
            {{ avatarInitials(value) }}
          </span>
          <span class="nfc-razao-info">
            <span class="nfc-razao-name">{{ value || '—' }}</span>
          </span>
        </span>
      </template>

      <!-- CNPJ formatado -->
      <template #cell-cnpj="{ value }">
        <span class="nfc-cnpj-tag">{{ formatCnpj(value) }}</span>
      </template>

      <!-- tipo de cliente badge -->
      <template #cell-tipo_cliente="{ value }">
        <span
          v-if="value"
          class="nfc-type-badge"
          :data-tipo="value"
          :aria-label="tipoLabel(value)"
        >
          {{ tipoLabel(value) }}
        </span>
        <span v-else class="nfc-muted">—</span>
      </template>

      <!-- inscrições agrupadas -->
      <template #cell-inscricoes="{ row }">
        <span class="nfc-inscricoes">
          <span
            v-if="row.inscricao_estadual"
            class="nfc-inscricao-chip"
            data-kind="ie"
            :aria-label="'IE: ' + row.inscricao_estadual"
          >
            <span class="nfc-inscricao-chip-label">IE</span>
            <span class="nfc-inscricao-chip-value">{{ row.inscricao_estadual }}</span>
          </span>
          <span
            v-if="row.inscricao_municipal"
            class="nfc-inscricao-chip"
            data-kind="im"
            :aria-label="'IM: ' + row.inscricao_municipal"
          >
            <span class="nfc-inscricao-chip-label">IM</span>
            <span class="nfc-inscricao-chip-value">{{ row.inscricao_municipal }}</span>
          </span>
          <span v-if="!row.inscricao_estadual && !row.inscricao_municipal" class="nfc-muted">—</span>
        </span>
      </template>

      <!-- ação de ver detalhes em linha -->
      <template #cell-_actions="{ row }">
        <button
          class="nfc-row-action-btn"
          :aria-label="'Ver detalhes de ' + (row.razao_social || row.id)"
          @click.stop="openClient(row)"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="9 18 15 12 9 6"/></svg>
          Ver
        </button>
      </template>

      <!-- ação no estado vazio -->
      <template #empty-action>
        <UiButton variant="primary" to="/nf-clients/new">
          Cadastrar primeiro cliente NF
        </UiButton>
      </template>
    </UiDataTable>
  </UiPageLayout>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import {
  UiPageLayout,
  UiDataTable,
  UiButton,
  UiFiltersPanel,
  useResource,
} from '../ui/index.js';
import { resourceFactory } from '../api.js';

// ─── recurso REST (/v1/nf-clients) ───────────────────────────────────────────
const nfClients = resourceFactory('nf-clients');

// ─── composables ─────────────────────────────────────────────────────────────
const router = useRouter();
const r = useResource(nfClients);

// ─── colunas da tabela ───────────────────────────────────────────────────────
const columns = [
  { key: 'razao_social',   label: 'Razão Social',      sortable: true },
  { key: 'cnpj',           label: 'CNPJ',              sortable: true },
  { key: 'tipo_cliente',   label: 'Tipo de Cliente',   sortable: true },
  { key: 'inscricoes',     label: 'Inscrições',        sortable: false },
  { key: '_actions',       label: '',                  align: 'right' },
];

// ─── filtros ─────────────────────────────────────────────────────────────────
const filterFields = [
  {
    key: 'q',
    label: 'Buscar por CNPJ',
    type: 'text',
    placeholder: 'Digite o CNPJ',
  },
  {
    key: 'tipo_cliente',
    label: 'Tipo de Cliente',
    type: 'select',
    options: [
      { value: 'empresa',          label: 'Empresa' },
      { value: 'consumidor_final', label: 'Consumidor Final' },
      { value: 'orgao_publico',    label: 'Órgão Público' },
    ],
  },
];

const filters = ref({ q: '', tipo_cliente: '' });

// tipo ativo para o filtro rápido por card
const activeTypeFilter = ref(null);

function applyFilters() {
  activeTypeFilter.value = filters.value.tipo_cliente || null;
  r.setFilters({ ...filters.value });
}

function clearFilters() {
  activeTypeFilter.value = null;
  filters.value = { q: '', tipo_cliente: '' };
  r.setFilters({});
}

function toggleTypeFilter(tipo) {
  if (activeTypeFilter.value === tipo) {
    activeTypeFilter.value = null;
    filters.value.tipo_cliente = '';
    r.setFilters({ ...filters.value });
  } else {
    activeTypeFilter.value = tipo;
    filters.value.tipo_cliente = tipo;
    r.setFilters({ ...filters.value });
  }
}

// ─── contadores por tipo (computed sobre página atual) ───────────────────────
const typeCounts = computed(() => {
  const items = r.items.value || [];
  return {
    empresa:          items.filter((c) => c.tipo_cliente === 'empresa').length,
    consumidor_final: items.filter((c) => c.tipo_cliente === 'consumidor_final').length,
    orgao_publico:    items.filter((c) => c.tipo_cliente === 'orgao_publico').length,
  };
});

// ─── helpers de formatação ────────────────────────────────────────────────────
function formatCnpj(value) {
  if (!value) return '—';
  const digits = String(value).replace(/\D/g, '');
  if (digits.length === 14) {
    return digits.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
  }
  return value;
}

function tipoLabel(tipo) {
  switch (tipo) {
    case 'empresa':          return 'Empresa';
    case 'consumidor_final': return 'Consumidor Final';
    case 'orgao_publico':    return 'Órgão Público';
    default:                 return tipo || '—';
  }
}

function avatarInitials(razaoSocial) {
  if (!razaoSocial) return '?';
  const words = String(razaoSocial).trim().split(/\s+/);
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
  return String(razaoSocial).slice(0, 2).toUpperCase();
}

// ─── navegação ───────────────────────────────────────────────────────────────
function openClient(row) {
  router.push('/nf-clients/' + row.id);
}

// ─── init ─────────────────────────────────────────────────────────────────────
onMounted(r.load);
</script>

<style scoped>
/* ── cards de resumo por tipo ── */
.nfc-summary-row {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: var(--ui-space-3);
  margin-bottom: var(--ui-space-2);
}

@media (max-width: 860px) {
  .nfc-summary-row {
    grid-template-columns: repeat(2, 1fr);
  }
}

@media (max-width: 480px) {
  .nfc-summary-row {
    grid-template-columns: 1fr 1fr;
  }
}

.nfc-summary-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--ui-space-1);
  padding: var(--ui-space-4) var(--ui-space-3);
  border-radius: var(--ui-radius-lg);
  border: 2px solid transparent;
  background: rgb(var(--ui-surface));
  cursor: pointer;
  transition: box-shadow 0.15s, border-color 0.15s, background 0.15s;
  text-align: center;
  user-select: none;
  outline: none;
}

.nfc-summary-card:focus-visible {
  outline: 2px solid rgb(var(--ui-accent));
  outline-offset: 2px;
}

.nfc-summary-card:hover {
  box-shadow: 0 4px 16px rgb(0 0 0 / 0.08);
  border-color: rgb(var(--ui-accent) / 0.35);
  background: rgb(var(--ui-accent) / 0.04);
}

.nfc-summary-card[data-active="true"] {
  border-color: rgb(var(--ui-accent) / 0.7);
  background: rgb(var(--ui-accent) / 0.08);
  box-shadow: 0 4px 20px rgb(var(--ui-accent) / 0.15);
}

.nfc-summary-card--total {
  cursor: default;
  border-color: rgb(var(--ui-border));
}

.nfc-summary-card--total:hover {
  border-color: rgb(var(--ui-border));
  background: rgb(var(--ui-surface));
  box-shadow: none;
}

.nfc-summary-icon {
  color: rgb(var(--ui-accent));
  display: flex;
  align-items: center;
  justify-content: center;
}

.nfc-summary-card--total .nfc-summary-icon {
  color: rgb(var(--ui-muted));
}

.nfc-summary-count {
  font-size: 2rem;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
  line-height: 1;
  color: rgb(var(--ui-fg));
}

.nfc-summary-label {
  font-size: var(--ui-text-xs);
  font-weight: 600;
  color: rgb(var(--ui-muted));
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

/* ── célula razão social com avatar ── */
.nfc-razao-cell {
  display: flex;
  align-items: center;
  gap: var(--ui-space-3);
  min-width: 0;
}

.nfc-razao-avatar {
  flex-shrink: 0;
  width: 36px;
  height: 36px;
  border-radius: var(--ui-radius-md);
  background: rgb(var(--ui-accent) / 0.12);
  color: rgb(var(--ui-accent-strong));
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: var(--ui-text-xs);
  font-weight: 800;
  letter-spacing: 0.02em;
}

.nfc-razao-info {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.nfc-razao-name {
  font-size: var(--ui-text-sm);
  font-weight: 600;
  color: rgb(var(--ui-fg));
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 260px;
}

/* ── CNPJ tag ── */
.nfc-cnpj-tag {
  display: inline-block;
  font-family: ui-monospace, 'Cascadia Code', 'Fira Mono', monospace;
  font-size: var(--ui-text-sm);
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.04em;
  color: rgb(var(--ui-fg));
  background: rgb(var(--ui-surface-2));
  border-radius: var(--ui-radius-sm);
  padding: 2px 8px;
  white-space: nowrap;
  border: 1px solid rgb(var(--ui-border));
}

/* ── tipo de cliente badge ── */
.nfc-type-badge {
  display: inline-flex;
  align-items: center;
  font-size: var(--ui-text-xs);
  font-weight: 700;
  letter-spacing: 0.04em;
  border-radius: var(--ui-radius-pill);
  padding: 3px 10px;
  white-space: nowrap;
  text-transform: uppercase;
}

.nfc-type-badge[data-tipo="empresa"] {
  background: rgb(var(--ui-accent) / 0.12);
  color: rgb(var(--ui-accent-strong));
}

.nfc-type-badge[data-tipo="consumidor_final"] {
  background: rgb(var(--ui-ok) / 0.12);
  color: rgb(var(--ui-ok));
}

.nfc-type-badge[data-tipo="orgao_publico"] {
  background: rgb(var(--ui-warn) / 0.14);
  color: rgb(var(--ui-warn));
}

.nfc-type-badge:not([data-tipo="empresa"]):not([data-tipo="consumidor_final"]):not([data-tipo="orgao_publico"]) {
  background: rgb(var(--ui-muted) / 0.12);
  color: rgb(var(--ui-muted));
}

/* ── inscrições ── */
.nfc-inscricoes {
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-1);
}

.nfc-inscricao-chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  border-radius: var(--ui-radius-sm);
  overflow: hidden;
  font-size: var(--ui-text-xs);
  border: 1px solid transparent;
  max-width: 200px;
}

.nfc-inscricao-chip[data-kind="ie"] {
  border-color: rgb(var(--ui-accent) / 0.25);
}

.nfc-inscricao-chip[data-kind="im"] {
  border-color: rgb(var(--ui-ok) / 0.25);
}

.nfc-inscricao-chip-label {
  font-weight: 700;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  padding: 1px 6px;
  flex-shrink: 0;
}

.nfc-inscricao-chip[data-kind="ie"] .nfc-inscricao-chip-label {
  background: rgb(var(--ui-accent) / 0.12);
  color: rgb(var(--ui-accent-strong));
}

.nfc-inscricao-chip[data-kind="im"] .nfc-inscricao-chip-label {
  background: rgb(var(--ui-ok) / 0.12);
  color: rgb(var(--ui-ok));
}

.nfc-inscricao-chip-value {
  font-variant-numeric: tabular-nums;
  color: rgb(var(--ui-fg));
  padding: 1px 6px 1px 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 140px;
}

/* ── muted placeholder ── */
.nfc-muted {
  color: rgb(var(--ui-muted));
}

/* ── botão de ação em linha ── */
.nfc-row-action-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: var(--ui-text-xs);
  font-weight: 600;
  border-radius: var(--ui-radius-sm);
  padding: 4px 10px;
  cursor: pointer;
  border: 1px solid rgb(var(--ui-border-strong));
  background: rgb(var(--ui-surface));
  color: rgb(var(--ui-muted));
  transition: background 0.12s, color 0.12s, border-color 0.12s;
  white-space: nowrap;
  outline: none;
  font-family: inherit;
}

.nfc-row-action-btn:focus-visible {
  outline: 2px solid rgb(var(--ui-accent));
  outline-offset: 2px;
}

.nfc-row-action-btn:hover {
  background: rgb(var(--ui-accent) / 0.08);
  border-color: rgb(var(--ui-accent) / 0.45);
  color: rgb(var(--ui-accent-strong));
}
</style>
