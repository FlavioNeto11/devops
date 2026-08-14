<script setup>
import { computed, onMounted, reactive, ref } from 'vue';
import { listTransportRules } from '../../services/transporteService.js';
import {
  formatDateBR,
  gateLabel,
  implementationStateLabel,
  regulatoryDomainLabel,
  COMPLIANCE_GATE_OPTIONS,
  REGULATORY_DOMAIN_OPTIONS
} from './transporteUiHelpers.js';
import SicatPageLayout from '../../components/sicat/SicatPageLayout.vue';
import SicatPageHeader from '../../components/shell/SicatPageHeader.vue';
import SicatCard from '../../components/sicat/SicatCard.vue';
import SicatFiltersPanel from '../../components/sicat/SicatFiltersPanel.vue';
import SicatDataTable from '../../components/sicat/SicatDataTable.vue';
import SicatHelpHint from '../../components/sicat/SicatHelpHint.vue';

/**
 * Tela READ-ONLY do catálogo regulatório de transporte (DL-103, Onda 1.5/PR-F1).
 * Sem store dedicada — molde de telas de consulta simples já existentes (ex.:
 * CetesbAccountsHealthView.vue): chama o service direto, sem regra de negócio.
 */

const filters = reactive({ domain: '', gate: '', vigenteEm: '' });

const rules = ref([]);
const referenceDate = ref('');
const totalItems = ref(0);
const loading = ref(false);
const error = ref('');

const headers = [
  { title: 'Código', key: 'code', sortable: false },
  { title: 'Título', key: 'title', sortable: false },
  { title: 'Gate', key: 'gate', sortable: false },
  { title: 'Estado da versão', key: 'implementationState', sortable: false },
  { title: 'Bloqueante', key: 'blocking', sortable: false },
  { title: 'Vigência', key: 'validity', sortable: false }
];

const rows = computed(() =>
  rules.value.map((rule) => {
    const version = rule.currentVersion;
    return {
      code: rule.code,
      title: rule.title,
      gate: gateLabel(rule.defaultGate),
      implementationState: version ? implementationStateLabel(version.implementationState) : 'Sem versão vigente',
      blocking: version ? (version.blocking ? 'Sim' : 'Não') : '-',
      validity: version
        ? `${formatDateBR(version.effectiveFrom)} – ${version.effectiveUntil ? formatDateBR(version.effectiveUntil) : 'em vigor'}`
        : '-'
    };
  })
);

const activeChips = computed(() => {
  const chips = [];
  if (filters.domain) chips.push({ key: 'domain', label: `Domínio: ${regulatoryDomainLabel(filters.domain)}` });
  if (filters.gate) chips.push({ key: 'gate', label: `Gate: ${gateLabel(filters.gate)}` });
  if (filters.vigenteEm) chips.push({ key: 'vigenteEm', label: `Vigente em: ${formatDateBR(filters.vigenteEm)}` });
  return chips;
});

async function fetchRules() {
  error.value = '';
  loading.value = true;
  try {
    const response = await listTransportRules({
      domain: filters.domain || undefined,
      gate: filters.gate || undefined,
      vigenteEm: filters.vigenteEm || undefined
    });
    rules.value = Array.isArray(response.items) ? response.items : [];
    referenceDate.value = response.referenceDate || '';
    totalItems.value = Number(response.totalItems || 0);
  } catch (err) {
    rules.value = [];
    totalItems.value = 0;
    error.value = err?.detail || err?.title || err?.message || 'Falha ao listar as regras regulatórias.';
  } finally {
    loading.value = false;
  }
}

function resetFilters() {
  filters.domain = '';
  filters.gate = '';
  filters.vigenteEm = '';
  void fetchRules();
}

function removeChip(key) {
  filters[key] = '';
  void fetchRules();
}

const totalLabel = computed(() => {
  const value = totalItems.value;
  const suffix = value === 1 ? 'regra encontrada' : 'regras encontradas';
  const referenceLabel = referenceDate.value ? ` · vigência resolvida em ${formatDateBR(referenceDate.value)}` : '';
  return `${value} ${suffix}${referenceLabel}`;
});

onMounted(fetchRules);
</script>

<template>
  <SicatPageLayout>
    <template #header>
      <SicatPageHeader
        kicker="Transporte"
        title="Regras regulatórias"
        description="Catálogo de regras TR-* do motor de compliance, com a versão vigente na data de referência. Consulta read-only — não altera nada."
      />
    </template>

    <template #filters>
      <SicatFiltersPanel
        :active-chips="activeChips"
        :loading="loading"
        @apply="fetchRules"
        @clear="resetFilters"
        @remove="removeChip"
      >
        <v-select
          v-model="filters.domain"
          :items="REGULATORY_DOMAIN_OPTIONS"
          item-title="label"
          item-value="value"
          label="Domínio"
          density="comfortable"
          variant="outlined"
          hide-details="auto"
          clearable
        />
        <v-select
          v-model="filters.gate"
          :items="COMPLIANCE_GATE_OPTIONS"
          item-title="label"
          item-value="value"
          label="Gate"
          density="comfortable"
          variant="outlined"
          hide-details="auto"
          clearable
        />
        <v-text-field
          v-model="filters.vigenteEm"
          label="Vigente em"
          type="date"
          density="comfortable"
          variant="outlined"
          hide-details="auto"
          clearable
        />
      </SicatFiltersPanel>
    </template>

    <div class="transp-regras__glossary">
      <span class="transp-regras__glossary-label">Termos frequentes:</span>
      <span class="transp-regras__glossary-item">
        CIOT
        <SicatHelpHint term="ciot" />
      </span>
    </div>

    <SicatCard :title="totalLabel" flush-body>
      <SicatDataTable
        :headers="headers"
        :items="rows"
        :loading="loading"
        :error="error"
        item-value="code"
        :items-per-page="25"
        :empty="{ title: 'Nenhuma regra encontrada', description: 'Ajuste os filtros de domínio, gate ou vigência.', icon: 'mdi-gavel' }"
      />
    </SicatCard>
  </SicatPageLayout>
</template>

<style scoped>
.transp-regras__glossary {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  font-size: 0.85rem;
  color: rgba(var(--v-theme-on-surface), 0.7);
}

.transp-regras__glossary-label {
  font-weight: 700;
}

.transp-regras__glossary-item {
  display: inline-flex;
  align-items: center;
  gap: 2px;
}
</style>
