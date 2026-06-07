<script setup>
import { computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useDmrStore } from '../../stores/dmrStore.js';
import { formatDmrPeriodLabel, roleLabel, statusLabel } from './dmrUiHelpers.js';
import SicatPageLayout from '../../components/sicat/SicatPageLayout.vue';
import SicatPageHeader from '../../components/shell/SicatPageHeader.vue';
import SicatCard from '../../components/sicat/SicatCard.vue';
import SicatDataTable from '../../components/sicat/SicatDataTable.vue';
import SicatStatusBadge from '../../components/sicat/SicatStatusBadge.vue';

const router = useRouter();
const store = useDmrStore();

const {
  pendingItems,
  loadingPending,
  pendingError,
  fetchPending
} = store;

const headers = [
  { title: 'Período', key: 'period', sortable: false },
  { title: 'Papel', key: 'role', sortable: false },
  { title: 'CNPJ', key: 'cnpj', sortable: false },
  { title: 'Status', key: 'status', sortable: false },
  { title: 'Atualizada em', key: 'updatedAt', sortable: false },
  { title: 'Ações', key: 'actions', sortable: false, align: 'end' }
];

const rows = computed(() =>
  pendingItems.value.map((dmr) => ({
    id: dmr.id,
    period: formatDmrPeriodLabel(dmr),
    role: roleLabel(dmr.role),
    cnpj: dmr.cnpj || '-',
    status: dmr.status,
    statusLabel: statusLabel(dmr.status),
    updatedAt: dmr.updatedAt ? new Date(dmr.updatedAt).toLocaleString('pt-BR') : '-'
  }))
);

function goToDetail(dmrId) {
  router.push(`/dmr/${encodeURIComponent(dmrId)}`);
}

onMounted(async () => {
  await fetchPending();
});
</script>

<template>
  <SicatPageLayout>
    <template #header>
      <SicatPageHeader
        kicker="Resíduos · DMR"
        title="DMRs aguardando submissão"
        description="Declarações em rascunho, em revisão ou com falha de validação que ainda não foram submetidas à CETESB."
      >
        <template #actions>
          <v-btn variant="outlined" prepend-icon="mdi-arrow-left" :to="{ name: 'DmrList' }">Voltar</v-btn>
          <v-btn color="primary" variant="flat" prepend-icon="mdi-refresh" :loading="loadingPending" @click="fetchPending">Atualizar</v-btn>
        </template>
      </SicatPageHeader>
    </template>

    <SicatCard title="Pendências de DMR" flush-body>
      <SicatDataTable
        :headers="headers"
        :items="rows"
        :loading="loadingPending"
        :error="pendingError"
        :empty="{ title: 'Sem DMRs pendentes', description: 'Não há declarações aguardando submissão para a conta ativa.', icon: 'mdi-check-circle-outline' }"
        @row-click="(row) => row?.id && goToDetail(row.id)"
      >
        <template #[`item.status`]="{ item }">
          <SicatStatusBadge :status="item.status" :label="item.statusLabel" domain="dmr" with-dot />
        </template>
        <template #[`item.actions`]="{ item }">
          <v-btn size="small" variant="text" @click.stop="goToDetail(item.id)">Detalhar</v-btn>
        </template>
      </SicatDataTable>
    </SicatCard>
  </SicatPageLayout>
</template>
