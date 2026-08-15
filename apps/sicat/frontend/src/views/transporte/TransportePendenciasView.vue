<script setup>
import { computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useTransportePendenciasStore } from '../../stores/transportePendenciasStore.js';
import { formatDateBR, gateLabel } from './transporteUiHelpers.js';
import SicatPageLayout from '../../components/sicat/SicatPageLayout.vue';
import SicatPageHeader from '../../components/shell/SicatPageHeader.vue';
import SicatCard from '../../components/sicat/SicatCard.vue';
import SicatMetricCard from '../../components/sicat/SicatMetricCard.vue';
import SicatDataTable from '../../components/sicat/SicatDataTable.vue';
import SicatInlineAlert from '../../components/sicat/SicatInlineAlert.vue';
import SicatEmptyState from '../../components/sicat/SicatEmptyState.vue';

/**
 * Centro Operacional da vertical Transporte (DL-103, PR-H1/PR-H2) — consome
 * `GET /v1/transporte/operations/overview` (POR CONTA, exceto
 * `watch.pendingHumanReviewGlobal`, que é GLOBAL) e complementa com
 * fornecedoras de VPO (cadastro configurável, GLOBAL) — o item 5 dos
 * entregáveis pede essa lista "como item ou dentro de pendências"; escolhida
 * aqui para não abrir uma rota extra para um cadastro read-only pequeno.
 */

const router = useRouter();
const store = useTransportePendenciasStore();
const {
  overview, loadingOverview, overviewError, loadOverview,
  vpoProviders, loadingVpoProviders, loadVpoProviders,
  insuranceAlerts, loadingInsuranceAlerts, loadInsuranceAlerts
} = store;

onMounted(async () => {
  await Promise.all([loadOverview(), loadVpoProviders(), loadInsuranceAlerts()]);
});

const operationsByStatusTotal = computed(() => {
  const map = overview.value?.operationsByStatus || {};
  return Object.values(map).reduce((sum, count) => sum + Number(count || 0), 0);
});

const topBlockedRulesHeaders = [
  { title: 'Regra', key: 'ruleCode', sortable: false },
  { title: 'Bloqueios (pós-clamp)', key: 'blockCount', sortable: false },
  { title: 'Bloqueios brutos', key: 'rawBlockCount', sortable: false }
];

const topBlockedRulesRows = computed(() => overview.value?.compliance?.topBlockedRules || []);

const insuranceAlertHeaders = [
  { title: 'Transportador', key: 'partyLegalName', sortable: false },
  { title: 'Apólice', key: 'policyLabel', sortable: false },
  { title: 'Vence em', key: 'validUntil', sortable: false },
  { title: 'Dias', key: 'daysToExpiry', sortable: false },
  { title: 'Alerta', key: 'alertLabel', sortable: false }
];

const insuranceAlertRows = computed(() =>
  insuranceAlerts.value.map((alert) => ({
    id: alert.policyId,
    partyLegalName: alert.partyLegalName,
    policyLabel: `${alert.policyType} · ${alert.policyNumber}`,
    validUntil: formatDateBR(alert.validUntil),
    daysToExpiry: alert.daysToExpiry,
    alertLabel: alert.alertType === 'expired_with_open_operation' ? 'Vencida com operação em aberto' : 'Vencendo em breve'
  }))
);

function goToWatch() {
  router.push('/transporte/watch');
}

function goToPisoTabelas() {
  router.push('/transporte/piso/tabelas');
}
</script>

<template>
  <SicatPageLayout :error="overviewError" :retryable="true" @retry="loadOverview">
    <template #header>
      <SicatPageHeader
        kicker="Transporte"
        title="Pendências"
        description="Centro Operacional da vertical Transporte: compliance, CIOT, VPO, documentos fiscais, seguros, RNTRC, fila e Regulatory Watch, tudo num só lugar."
      />
    </template>

    <div class="transp-pend__metrics">
      <SicatMetricCard
        label="Operações"
        :value="String(operationsByStatusTotal)"
        icon="mdi-truck-fast-outline"
        tone="neutral"
        :loading="loadingOverview"
      />
      <SicatMetricCard
        label="Abaixo do piso"
        :value="String(overview?.compliance?.belowFloorOffers ?? 0)"
        icon="mdi-scale-balance"
        tone="warning"
        :loading="loadingOverview"
        clickable
        @click="goToPisoTabelas"
      />
      <SicatMetricCard
        label="CIOT sem confirmação"
        :value="String(overview?.ciot?.unconfirmedPending ?? 0)"
        icon="mdi-file-question-outline"
        tone="warning"
        :loading="loadingOverview"
      />
      <SicatMetricCard
        label="VPO devido sem aquisição"
        :value="String(overview?.vpo?.applicableNotAcquired ?? 0)"
        icon="mdi-cash-multiple"
        tone="warning"
        :loading="loadingOverview"
      />
      <SicatMetricCard
        label="Documentos fiscais inválidos"
        :value="String(overview?.fiscalDocuments?.invalid ?? 0)"
        :hint="`+ ${overview?.fiscalDocuments?.warnings ?? 0} com avisos`"
        icon="mdi-file-alert-outline"
        tone="error"
        :loading="loadingOverview"
      />
      <SicatMetricCard
        label="Apólices vencendo/vencidas"
        :value="String(overview?.insurance?.expiringOrExpiredCount ?? 0)"
        :hint="`Janela de ${overview?.insurance?.windowDays ?? 30} dias`"
        icon="mdi-shield-alert-outline"
        tone="warning"
        :loading="loadingOverview"
      />
      <SicatMetricCard
        label="RNTRC desatualizado"
        :value="String(overview?.rntrc?.staleCarriers ?? 0)"
        :hint="`> ${overview?.rntrc?.freshnessDays ?? 90} dias`"
        icon="mdi-shield-search-outline"
        tone="warning"
        :loading="loadingOverview"
      />
      <SicatMetricCard
        label="Fila (retry + DLQ)"
        :value="`${overview?.jobs?.retryWait ?? 0} + ${overview?.jobs?.dlq ?? 0}`"
        icon="mdi-tray-alert"
        tone="error"
        :loading="loadingOverview"
      />
      <SicatMetricCard
        label="Watch aguardando revisão"
        :value="String(overview?.watch?.pendingHumanReviewGlobal ?? 0)"
        hint="Global — todas as contas"
        icon="mdi-radar"
        tone="warning"
        :loading="loadingOverview"
        clickable
        @click="goToWatch"
      />
    </div>

    <SicatCard title="Top regras que mais bloqueiam" subtitle="Considera só a avaliação mais recente de cada operação/gate." flush-body>
      <SicatDataTable
        :headers="topBlockedRulesHeaders"
        :items="topBlockedRulesRows"
        :loading="loadingOverview"
        item-value="ruleCode"
        :show-footer="false"
        :items-per-page="-1"
        :empty="{ title: 'Nenhum bloqueio registrado', icon: 'mdi-check-decagram-outline' }"
      />
    </SicatCard>

    <SicatCard title="Apólices vencendo/vencidas" flush-body>
      <SicatDataTable
        :headers="insuranceAlertHeaders"
        :items="insuranceAlertRows"
        :loading="loadingInsuranceAlerts"
        item-value="id"
        :show-footer="false"
        :items-per-page="-1"
        :empty="{ title: 'Nenhum alerta de seguro', icon: 'mdi-shield-check-outline' }"
      />
    </SicatCard>

    <SicatCard title="Fornecedoras de VPO habilitadas" subtitle="Cadastro configurável — nunca hardcoded." flush-body>
      <div v-if="loadingVpoProviders" class="transp-pend__loading">
        <v-progress-linear indeterminate color="primary" />
      </div>
      <SicatEmptyState v-else-if="!vpoProviders.length" title="Nenhuma fornecedora cadastrada" icon="mdi-cash-remove" compact />
      <ul v-else class="transp-pend__providers">
        <li v-for="provider in vpoProviders" :key="provider.id" class="transp-pend__provider">
          <span class="transp-pend__provider-name">{{ provider.name }}</span>
          <v-chip size="small" :color="provider.isActive ? 'success' : undefined" variant="tonal">
            {{ provider.isActive ? 'Ativa' : 'Inativa' }}
          </v-chip>
        </li>
      </ul>
    </SicatCard>

    <SicatInlineAlert
      v-if="topBlockedRulesRows.some((rule) => rule.rawBlockCount > rule.blockCount)"
      tone="info"
      title="Há regras com bloqueios brutos maiores que os efetivos"
      :message="`Bloqueios 'brutos' (${gateLabel('GATE_PROPOSAL')} e demais gates) contam o que a regra bloquearia se já fosse vigente/bloqueante no catálogo — não confundir com o bloqueio pós-clamp, que é o que de fato impede a transição.`"
    />
  </SicatPageLayout>
</template>

<style scoped>
.transp-pend__metrics {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: var(--space-4);
}

.transp-pend__loading {
  padding: var(--space-4);
}

.transp-pend__providers {
  list-style: none;
  margin: 0;
  padding: var(--space-2) var(--space-6) var(--space-5);
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.transp-pend__provider {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 6px 0;
  border-bottom: 1px solid rgba(var(--v-border-color), 0.1);
}

.transp-pend__provider-name {
  font-weight: 600;
  font-size: 0.9rem;
}
</style>
