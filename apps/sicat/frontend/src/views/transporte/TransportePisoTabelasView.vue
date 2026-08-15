<script setup>
import { computed, onMounted } from 'vue';
import { useTransportePendenciasStore } from '../../stores/transportePendenciasStore.js';
import { formatDateBR, pisoTabelaReviewStatusLabel, pisoTableCodeLabel } from './transporteUiHelpers.js';
import SicatPageLayout from '../../components/sicat/SicatPageLayout.vue';
import SicatPageHeader from '../../components/shell/SicatPageHeader.vue';
import SicatCard from '../../components/sicat/SicatCard.vue';
import SicatDataTable from '../../components/sicat/SicatDataTable.vue';
import SicatStatusBadge from '../../components/sicat/SicatStatusBadge.vue';
import SicatInlineAlert from '../../components/sicat/SicatInlineAlert.vue';

/**
 * Tela READ-ONLY das versões de tabela de piso mínimo de frete carregadas
 * via `npm run load:freight-floor` (DL-103, PR-H2). Catálogo GLOBAL, sem
 * tenancy — molde: TransporteRegrasView.vue (consulta simples, sem store
 * dedicada de operações — reaproveita transportePendenciasStore por já
 * existir para o mesmo endpoint na tela de Pendências).
 */

const store = useTransportePendenciasStore();
const { floorTables, loadingFloorTables, floorTablesError, loadFloorTables } = store;

const headers = [
  { title: 'Referência normativa', key: 'normativeReference', sortable: false },
  { title: 'Tabela', key: 'tableCode', sortable: false },
  { title: 'Situação da revisão', key: 'reviewStatus', sortable: false },
  { title: 'Vigência', key: 'validity', sortable: false },
  { title: 'Coeficientes', key: 'coefficientsCount', sortable: false },
  { title: 'Fonte', key: 'sourceUrl', sortable: false }
];

const rows = computed(() =>
  floorTables.value.map((table) => ({
    normativeReference: table.normativeReference,
    tableCode: table.tableCode,
    tableCodeLabel: pisoTableCodeLabel(table.tableCode),
    reviewStatus: table.reviewStatus,
    validity: `${formatDateBR(table.effectiveFrom)} – ${table.effectiveUntil ? formatDateBR(table.effectiveUntil) : 'em vigor'}`,
    coefficientsCount: table.coefficientsCount,
    sourceUrl: table.sourceUrl
  }))
);

const hasPendingReview = computed(() => floorTables.value.some((table) => table.reviewStatus === 'pending_review'));

onMounted(loadFloorTables);
</script>

<template>
  <SicatPageLayout>
    <template #header>
      <SicatPageHeader
        kicker="Transporte · Piso mínimo"
        title="Tabelas de piso mínimo de frete"
        description="Versões de tabela carregadas a partir das resoluções da ANTT. Consulta read-only — não altera nada."
      />
    </template>

    <template #banner>
      <SicatInlineAlert
        v-if="hasPendingReview"
        tone="warning"
        title="Coeficientes em revisão"
        message="As tabelas marcadas 'Em revisão' ainda não passaram por revisão jurídica formal — o cálculo de piso mínimo continua em MODO SHADOW (não bloqueia nenhuma operação por si só) até essa pendência ser resolvida."
      />
    </template>

    <SicatCard title="Tabelas carregadas" flush-body>
      <SicatDataTable
        :headers="headers"
        :items="rows"
        :loading="loadingFloorTables"
        :error="floorTablesError"
        item-value="normativeReference"
        :items-per-page="25"
        :empty="{ title: 'Nenhuma tabela de piso carregada', description: 'Rode npm run load:freight-floor no backend.', icon: 'mdi-table' }"
      >
        <template #[`item.tableCode`]="{ item }">
          {{ item.tableCodeLabel }}
        </template>
        <template #[`item.reviewStatus`]="{ item }">
          <SicatStatusBadge :status="item.reviewStatus" domain="piso-tabela-review" with-dot />
        </template>
        <template #[`item.sourceUrl`]="{ item }">
          <a v-if="item.sourceUrl" :href="item.sourceUrl" target="_blank" rel="noopener noreferrer">Fonte oficial</a>
          <span v-else>-</span>
        </template>
      </SicatDataTable>
    </SicatCard>
  </SicatPageLayout>
</template>
