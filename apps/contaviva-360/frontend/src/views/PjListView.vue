<template>
  <UiPageLayout
    title="Pessoas Jurídicas"
    eyebrow="Cadastro"
    subtitle="Lista de empresas e seus dados fiscais no tenant."
    width="wide"
    :error="errorMessage"
    @retry="r.load"
  >
    <template #actions>
      <UiButton variant="primary" to="/pj/novo">Nova Pessoa Jurídica</UiButton>
    </template>

    <template #filters>
      <UiFiltersPanel
        v-model="filters"
        :fields="filterFields"
        @apply="applyFilters"
        @clear="clearFilters"
      />
    </template>

    <UiDataTable
      :columns="columns"
      :rows="r.items.value"
      :loading="r.loading.value"
      :error="null"
      row-key="id"
      clickable-rows
      server-mode
      :sort="r.sort.value"
      :page="r.page.value"
      :page-size="r.pageSize.value"
      :total="r.total.value"
      paginated
      :empty="{
        title: 'Nenhuma Pessoa Jurídica cadastrada',
        description: 'Cadastre a primeira empresa para começar a gerenciar obrigações fiscais e financeiras.'
      }"
      @update:sort="r.setSort"
      @update:page="r.setPage"
      @row-click="openDetail"
    >
      <template #cell-cnpj="{ value }">
        <span class="pj-cnpj">{{ formatCnpj(value) }}</span>
      </template>

      <template #cell-regime_tributario="{ value }">
        <UiStatusBadge
          :status="value"
          :label="regimeLabel(value)"
          :tone="regimeTone(value)"
          :with-dot="false"
        />
      </template>

      <template #cell-status_fiscal="{ value }">
        <UiStatusBadge :status="value || 'ativo'" :with-dot="true" />
      </template>

      <template #empty-action>
        <UiButton variant="primary" to="/pj/novo">Cadastrar empresa</UiButton>
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
  UiStatusBadge,
  useResource,
} from '../ui/index.js';
import { resourceFactory } from '../api.js';

const pj = resourceFactory('pj');
const router = useRouter();

// ── Colunas da tabela ────────────────────────────────────────────────────────
const columns = [
  { key: 'razao_social', label: 'Razão Social', sortable: true },
  { key: 'cnpj', label: 'CNPJ' },
  { key: 'regime_tributario', label: 'Regime Tributário' },
  { key: 'status_fiscal', label: 'Status Fiscal', align: 'center' },
];

// ── Filtros ──────────────────────────────────────────────────────────────────
const filterFields = [
  { key: 'razao_social', label: 'Razão Social', type: 'text', placeholder: 'Buscar por razão social…' },
  { key: 'cnpj', label: 'CNPJ', type: 'text', placeholder: '00.000.000/0000-00' },
];

const filters = ref({ razao_social: '', cnpj: '' });

// ── Recurso ──────────────────────────────────────────────────────────────────
const r = useResource(pj);

const errorMessage = computed(() => {
  if (!r.error.value) return null;
  return r.error.value?.message || 'Erro ao carregar Pessoas Jurídicas.';
});

function applyFilters() {
  r.setFilters({ ...filters.value });
}

function clearFilters() {
  filters.value = { razao_social: '', cnpj: '' };
  r.setFilters({ razao_social: '', cnpj: '' });
}

function openDetail(row) {
  router.push('/pj/' + row.id);
}

// ── Formatação de CNPJ ───────────────────────────────────────────────────────
function formatCnpj(value) {
  if (!value) return '—';
  const digits = String(value).replace(/\D/g, '');
  if (digits.length !== 14) return value;
  return digits.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
}

// ── Regime tributário ────────────────────────────────────────────────────────
const REGIME_LABELS = {
  simples: 'Simples Nacional',
  lucro_presumido: 'Lucro Presumido',
  lucro_real: 'Lucro Real',
};

const REGIME_TONES = {
  simples: 'success',
  lucro_presumido: 'warning',
  lucro_real: 'running',
};

function regimeLabel(value) {
  return REGIME_LABELS[value] || value || '—';
}

function regimeTone(value) {
  return REGIME_TONES[value] || 'neutral';
}

// ── Inicialização ────────────────────────────────────────────────────────────
onMounted(r.load);
</script>

<style scoped>
.pj-cnpj {
  font-family: var(--ui-font-mono, monospace);
  font-size: var(--ui-text-sm);
  color: rgb(var(--ui-muted));
  letter-spacing: 0.02em;
  white-space: nowrap;
}
</style>
