<script setup>
import { computed, onMounted, ref } from 'vue';
import { getOperationsOverview } from '../../services/operationsService.js';
import OperationalStatusBadge from '../shared/OperationalStatusBadge.vue';
import SicatPageLayout from '../../components/sicat/SicatPageLayout.vue';
import SicatPageHeader from '../../components/shell/SicatPageHeader.vue';
import SicatCard from '../../components/sicat/SicatCard.vue';
import SicatMetricCard from '../../components/sicat/SicatMetricCard.vue';

const overview = ref(null);
const loading = ref(false);
const error = ref('');

function fmt(value) {
  if (value === null || value === undefined) return '—';
  return String(value);
}

const kpis = computed(() => {
  const jobs = overview.value?.jobs || {};
  return [
    { key: 'queued', label: 'Jobs em fila', value: fmt(jobs.queued), tone: 'neutral', icon: 'mdi-tray-full' },
    { key: 'running', label: 'Em execução', value: fmt(jobs.running), tone: 'running', icon: 'mdi-cog-sync' },
    { key: 'retry', label: 'Aguardando retry', value: fmt(jobs.retry_wait), tone: 'warning', icon: 'mdi-restore' },
    { key: 'succeeded', label: 'Sucessos 24h', value: fmt(jobs.succeeded_24h), tone: 'success', icon: 'mdi-check-circle-outline' },
    { key: 'failed', label: 'Falhas 24h', value: fmt(jobs.failed_24h), tone: 'error', icon: 'mdi-alert-circle-outline' },
    { key: 'dlq', label: 'DLQ', value: fmt(jobs.dlq_total), tone: 'error', icon: 'mdi-inbox-remove-outline' }
  ];
});

const manifestRows = computed(() => {
  const m = overview.value?.manifests;
  if (!m) return [];
  return [
    { label: 'Total', value: fmt(m.total) },
    { label: 'Submetidos', value: fmt(m.submitted) },
    { label: 'Impressos', value: fmt(m.printed) },
    { label: 'Cancelados', value: fmt(m.cancelled) },
    { label: 'Rascunho/falha', value: fmt(m.draft_or_failed) }
  ];
});

const sessionRows = computed(() => {
  const s = overview.value?.sessions;
  if (!s) return [];
  return [
    { label: 'Ativas', value: fmt(s.active) },
    { label: 'Pendentes', value: fmt(s.pending_auth) },
    { label: 'Expiradas', value: fmt(s.expired) },
    { label: 'Inválidas', value: fmt(s.invalid) },
    { label: 'Revogadas', value: fmt(s.revoked) }
  ];
});

async function load() {
  loading.value = true;
  error.value = '';
  try {
    overview.value = await getOperationsOverview();
  } catch (err) {
    error.value = err?.message || 'Falha ao carregar visão geral operacional.';
  } finally {
    loading.value = false;
  }
}

onMounted(load);
</script>

<template>
  <SicatPageLayout :loading="loading && !overview" :error="error" retryable @retry="load">
    <template #header>
      <SicatPageHeader
        title="Visão geral operacional"
        description="KPIs derivados de jobs, manifestos, contas e sessões CETESB."
      >
        <template #actions>
          <v-btn prepend-icon="mdi-refresh" variant="tonal" color="primary" :loading="loading" @click="load">Atualizar</v-btn>
        </template>
      </SicatPageHeader>
    </template>

    <div v-if="overview" class="ops-kpi-grid">
      <SicatMetricCard
        v-for="kpi in kpis"
        :key="kpi.key"
        :label="kpi.label"
        :value="kpi.value"
        :tone="kpi.tone"
        :icon="kpi.icon"
      />
    </div>

    <div v-if="overview" class="ops-grid-2">
      <SicatCard v-if="overview.manifests" title="Manifestos">
        <div class="ops-info-list">
          <div v-for="row in manifestRows" :key="row.label"><span>{{ row.label }}</span><strong>{{ row.value }}</strong></div>
        </div>
      </SicatCard>

      <SicatCard v-if="overview.sessions" title="Sessões CETESB">
        <div class="ops-info-list">
          <div v-for="row in sessionRows" :key="row.label"><span>{{ row.label }}</span><strong>{{ row.value }}</strong></div>
        </div>
      </SicatCard>
    </div>

    <SicatCard v-if="overview?.recentJobs?.length" title="Últimos jobs" flush-body>
      <v-list density="comfortable">
        <v-list-item
          v-for="item in overview.recentJobs"
          :key="item.jobId"
          :to="`/sistema/jobs?correlationId=${item.correlationId || ''}`"
        >
          <template #prepend>
            <OperationalStatusBadge :status="item.operationalStatus" :label="item.label" :severity="item.severity" />
          </template>
          <v-list-item-title>{{ item.operation }} · {{ item.entityType }}</v-list-item-title>
          <v-list-item-subtitle class="text-caption">{{ item.entityId }} · {{ item.recommendedAction }}</v-list-item-subtitle>
        </v-list-item>
      </v-list>
    </SicatCard>

    <SicatCard v-if="overview?.recentErrors?.length" title="Erros recentes" flush-body>
      <v-list density="comfortable">
        <v-list-item
          v-for="item in overview.recentErrors"
          :key="item.jobId"
          :to="`/operacao/auditoria/${item.correlationId || ''}`"
        >
          <template #prepend>
            <OperationalStatusBadge :status="item.operationalStatus" :label="item.label" :severity="item.severity" />
          </template>
          <v-list-item-title>{{ item.operation }} · {{ item.lastErrorCode || 'sem código' }}</v-list-item-title>
          <v-list-item-subtitle class="text-caption">{{ item.lastErrorMessage || item.dlqReason || item.recommendedAction }}</v-list-item-subtitle>
        </v-list-item>
      </v-list>
    </SicatCard>

    <SicatCard v-if="overview?.recentDlq?.length" title="DLQ recente" flush-body>
      <v-list density="comfortable">
        <v-list-item v-for="item in overview.recentDlq" :key="item.jobId">
          <template #prepend>
            <OperationalStatusBadge :status="item.operationalStatus" :label="item.label" :severity="item.severity" />
          </template>
          <v-list-item-title>{{ item.operation }} · {{ item.entityType }}</v-list-item-title>
          <v-list-item-subtitle class="text-caption">{{ item.dlqReason || item.recommendedAction }}</v-list-item-subtitle>
        </v-list-item>
      </v-list>
    </SicatCard>
  </SicatPageLayout>
</template>

<style scoped>
.ops-kpi-grid {
  display: grid;
  gap: var(--space-4);
  grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
}

.ops-grid-2 {
  display: grid;
  gap: var(--space-4);
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
}

.ops-info-list {
  display: grid;
  gap: 8px;
}

.ops-info-list div {
  display: flex;
  justify-content: space-between;
  gap: 12px;
}

.ops-info-list span {
  color: rgba(var(--v-theme-on-surface), 0.62);
}

.ops-info-list strong {
  color: rgba(var(--v-theme-on-surface), 0.92);
}
</style>
