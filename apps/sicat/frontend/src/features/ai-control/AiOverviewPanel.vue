<script setup>
import { computed, onMounted, ref } from 'vue';
import { getAiControlHealth, getAiControlOverview } from '../../services/api.js';
import { formatDateTimeBr } from '../../utils/date-format.js';
import SicatCard from '../../components/sicat/SicatCard.vue';
import SicatMetricCard from '../../components/sicat/SicatMetricCard.vue';
import SicatDataTable from '../../components/sicat/SicatDataTable.vue';
import SicatInlineAlert from '../../components/sicat/SicatInlineAlert.vue';
import SicatEmptyState from '../../components/sicat/SicatEmptyState.vue';
import SicatLoadingState from '../../components/sicat/SicatLoadingState.vue';
import SicatErrorState from '../../components/sicat/SicatErrorState.vue';

const props = defineProps({
  /** Eventos ao vivo vindos do SSE (forma { type, at, payload }). */
  liveEvents: { type: Array, default: () => [] },
  streaming: { type: Boolean, default: false },
  streamError: { type: [Object, String, null], default: null }
});

const loading = ref(false);
const error = ref(null);
const overview = ref(null);
const health = ref(null);

const metrics = computed(() => overview.value?.metrics || {});
// O DTO expõe outcomes aninhados em metrics.outcomes + metrics.totalTurns/artifactsGeneratedTotal.
const turns = computed(() => {
  const m = metrics.value || {};
  const o = m.outcomes || overview.value?.turns || {};
  return {
    total: m.totalTurns ?? o.total ?? 0,
    executed: o.executed ?? 0,
    blocked: o.blocked ?? 0,
    failed: o.failed ?? 0,
    responded: o.responded ?? 0,
    artifacts: m.artifactsGeneratedTotal ?? o.artifacts ?? 0
  };
});
const provider = computed(() => overview.value?.provider || health.value?.provider || {});
const langfuse = computed(() => overview.value?.langfuse || health.value?.langfuse || {});
const cost = computed(() => metrics.value?.cost || overview.value?.cost || null);

const topTools = computed(() => {
  const list = overview.value?.topTools || metrics.value?.topTools || [];
  return Array.isArray(list) ? list : [];
});

const policyBlocks = computed(() => {
  const raw = overview.value?.policyBlocksByReason || metrics.value?.policyBlocksByReason || {};
  return Object.entries(raw).map(([reason, count]) => ({ reason, count }));
});

const errorsByCode = computed(() => {
  const raw = overview.value?.errorsByCode || metrics.value?.errorsByCode || {};
  return Object.entries(raw).map(([code, count]) => ({ code, count }));
});

const confirmationCounters = computed(() => {
  const c = overview.value?.confirmations || metrics.value?.confirmation || {};
  return {
    requested: c.requested ?? c.requiredTotal ?? 0,
    confirmed: c.confirmed ?? c.confirmedTotal ?? 0,
    denied: c.denied ?? c.blockedMissingTotal ?? 0
  };
});

const langfuseStatus = computed(() => String(langfuse.value?.status || '').toLowerCase());
const providerStatus = computed(() => String(provider.value?.status || '').toLowerCase());

const topToolHeaders = [
  { title: 'Ferramenta', key: 'toolName' },
  { title: 'Total', key: 'total', align: 'end' },
  { title: 'Executadas', key: 'executed', align: 'end' },
  { title: 'Bloqueadas', key: 'blocked', align: 'end' }
];

const normalizedTopTools = computed(() =>
  topTools.value.map((tool, index) => ({
    id: tool.toolName || tool.name || index,
    toolName: tool.toolName || tool.name || '—',
    total: tool.total ?? tool.stats?.total ?? 0,
    executed: tool.executed ?? tool.stats?.executed ?? 0,
    blocked: tool.blocked ?? tool.stats?.blocked ?? 0
  }))
);

const recentEvents = computed(() => [...props.liveEvents].reverse());

function formatNumber(value) {
  if (value == null) return '—';
  const num = Number(value);
  if (Number.isNaN(num)) return String(value);
  return num.toLocaleString('pt-BR');
}

function formatMoney(value) {
  if (value == null) return '—';
  const num = Number(value);
  if (Number.isNaN(num)) return String(value);
  return num.toLocaleString('pt-BR', { style: 'currency', currency: 'USD' });
}

function eventTone(type) {
  const key = String(type || '').toLowerCase();
  if (key.includes('error') || key.includes('fail') || key.includes('blocked')) return 'error';
  if (key.includes('warn')) return 'warning';
  if (key.includes('executed') || key.includes('success') || key.includes('complete')) return 'success';
  return 'neutral';
}

async function load() {
  loading.value = true;
  error.value = null;
  try {
    const [overviewData, healthData] = await Promise.all([
      getAiControlOverview(),
      getAiControlHealth().catch(() => null)
    ]);
    overview.value = overviewData;
    health.value = healthData;
  } catch (err) {
    error.value = err;
  } finally {
    loading.value = false;
  }
}

onMounted(load);
</script>

<template>
  <div class="ai-overview">
    <SicatLoadingState v-if="loading" title="Carregando visão geral da IA…" />
    <SicatErrorState
      v-else-if="error"
      :message="error?.message || 'Falha ao carregar visão geral.'"
      :code="error?.correlationId || ''"
      retryable
      @retry="load"
    />

    <template v-else>
      <!-- Avisos de provider / Langfuse -->
      <SicatInlineAlert
        v-if="langfuseStatus === 'degraded'"
        tone="warning"
        title="Langfuse degradado"
        message="A observabilidade remota está degradada. Métricas podem estar atrasadas; o fallback local segue ativo."
      />
      <SicatInlineAlert
        v-else-if="langfuseStatus === 'disabled'"
        tone="info"
        title="Langfuse desativado"
        message="Observabilidade remota desativada. Estamos usando o fallback local de traces e métricas."
      />
      <SicatInlineAlert
        v-if="streamError"
        tone="warning"
        title="Stream de eventos interrompido"
        :message="typeof streamError === 'string' ? streamError : (streamError?.message || 'Falha no stream ao vivo.')"
      />

      <!-- Métricas principais -->
      <div class="ai-overview__metrics">
        <SicatMetricCard label="Turnos" :value="formatNumber(turns.total ?? metrics.totalTurns)" icon="mdi-message-text-outline" tone="primary" />
        <SicatMetricCard label="Executados" :value="formatNumber(turns.executed ?? metrics.executed)" icon="mdi-check-circle-outline" tone="success" />
        <SicatMetricCard label="Bloqueados" :value="formatNumber(turns.blocked ?? metrics.blocked)" icon="mdi-shield-alert-outline" tone="warning" />
        <SicatMetricCard label="Falhas" :value="formatNumber(turns.failed ?? metrics.failed)" icon="mdi-alert-circle-outline" tone="error" />
        <SicatMetricCard label="Artefatos" :value="formatNumber(turns.artifacts ?? metrics.artifacts)" icon="mdi-file-document-outline" tone="neutral" />
      </div>

      <!-- Custo / tokens / latência (quando disponível) -->
      <div v-if="cost" class="ai-overview__metrics">
        <SicatMetricCard label="Custo" :value="formatMoney(cost.totalCost ?? cost.totalUsd ?? cost.usd ?? cost.total)" icon="mdi-cash" tone="primary" />
        <SicatMetricCard label="Tokens" :value="formatNumber(cost.totalTokens ?? ((cost.inputTokens ?? 0) + (cost.outputTokens ?? 0)))" icon="mdi-counter" tone="neutral" />
        <SicatMetricCard label="Latência média" :value="cost.avgLatencyMs != null ? `${formatNumber(cost.avgLatencyMs)} ms` : '—'" icon="mdi-timer-outline" tone="running" />
      </div>

      <div class="ai-overview__grid">
        <!-- Status do provider -->
        <SicatCard title="Provider de IA" icon="mdi-robot-outline">
          <div class="ai-overview__status-row">
            <v-chip
              :color="providerStatus === 'ok' || providerStatus === 'healthy' ? 'success' : (providerStatus === 'degraded' ? 'warning' : 'error')"
              variant="tonal"
              size="small"
            >
              {{ provider.status || 'desconhecido' }}
            </v-chip>
            <span class="ai-overview__muted">{{ provider.model || provider.defaultModel || '' }}</span>
          </div>
          <div v-if="provider.embeddingModel" class="ai-overview__muted mt-1">
            Embeddings: {{ provider.embeddingModel }}
          </div>
        </SicatCard>

        <!-- Status Langfuse -->
        <SicatCard title="Observabilidade (Langfuse)" icon="mdi-chart-timeline-variant">
          <div class="ai-overview__status-row">
            <v-chip
              :color="langfuseStatus === 'ok' || langfuseStatus === 'enabled' || langfuseStatus === 'healthy' ? 'success' : (langfuseStatus === 'degraded' ? 'warning' : 'default')"
              variant="tonal"
              size="small"
            >
              {{ langfuse.status || 'desconhecido' }}
            </v-chip>
            <span v-if="langfuse.provider" class="ai-overview__muted">{{ langfuse.provider }}</span>
          </div>
          <div v-if="langfuse.baseUrl" class="ai-overview__muted mt-1">{{ langfuse.baseUrl }}</div>
        </SicatCard>
      </div>

      <div class="ai-overview__grid">
        <!-- Top tools -->
        <SicatCard title="Ferramentas mais usadas" icon="mdi-tools" flush-body>
          <SicatDataTable
            :headers="topToolHeaders"
            :items="normalizedTopTools"
            item-value="id"
            density="compact"
            :empty="{ title: 'Sem uso de ferramentas no período', icon: 'mdi-tools' }"
          />
        </SicatCard>

        <!-- Confirmações -->
        <SicatCard title="Confirmações" icon="mdi-shield-check-outline">
          <div class="ai-overview__counters">
            <div class="ai-overview__counter">
              <span class="ai-overview__counter-label">Solicitadas</span>
              <strong>{{ formatNumber(confirmationCounters.requested) }}</strong>
            </div>
            <div class="ai-overview__counter">
              <span class="ai-overview__counter-label">Confirmadas</span>
              <strong>{{ formatNumber(confirmationCounters.confirmed) }}</strong>
            </div>
            <div class="ai-overview__counter">
              <span class="ai-overview__counter-label">Negadas</span>
              <strong>{{ formatNumber(confirmationCounters.denied) }}</strong>
            </div>
          </div>
        </SicatCard>
      </div>

      <div class="ai-overview__grid">
        <!-- Bloqueios por motivo -->
        <SicatCard title="Bloqueios por motivo" icon="mdi-shield-alert-outline">
          <SicatEmptyState
            v-if="!policyBlocks.length"
            compact
            title="Nenhum bloqueio registrado"
            icon="mdi-shield-check-outline"
          />
          <div v-else class="ai-overview__chips">
            <v-chip v-for="block in policyBlocks" :key="block.reason" size="small" variant="tonal" color="warning">
              {{ block.reason }}: {{ formatNumber(block.count) }}
            </v-chip>
          </div>
        </SicatCard>

        <!-- Erros por código -->
        <SicatCard title="Erros por código" icon="mdi-alert-circle-outline">
          <SicatEmptyState
            v-if="!errorsByCode.length"
            compact
            title="Nenhum erro registrado"
            icon="mdi-check-circle-outline"
          />
          <div v-else class="ai-overview__chips">
            <v-chip v-for="item in errorsByCode" :key="item.code" size="small" variant="tonal" color="error">
              {{ item.code }}: {{ formatNumber(item.count) }}
            </v-chip>
          </div>
        </SicatCard>
      </div>

      <!-- Feed ao vivo -->
      <SicatCard title="Últimos eventos (ao vivo)" icon="mdi-broadcast">
        <template #header-actions>
          <v-chip :color="streaming ? 'success' : 'default'" variant="tonal" size="small">
            <v-icon start size="12" :icon="streaming ? 'mdi-circle' : 'mdi-circle-outline'" />
            {{ streaming ? 'Conectado' : 'Desconectado' }}
          </v-chip>
        </template>

        <SicatEmptyState
          v-if="!recentEvents.length"
          compact
          title="Aguardando eventos…"
          description="Os eventos da IA aparecerão aqui em tempo real."
          icon="mdi-broadcast-off"
        />
        <v-list v-else density="compact" class="ai-overview__feed">
          <v-list-item v-for="(evt, index) in recentEvents" :key="`${evt.at || ''}-${index}`">
            <template #prepend>
              <v-icon size="12" :color="eventTone(evt.type) === 'neutral' ? undefined : eventTone(evt.type)">mdi-circle-medium</v-icon>
            </template>
            <v-list-item-title class="ai-overview__feed-title">{{ evt.type }}</v-list-item-title>
            <v-list-item-subtitle class="ai-overview__feed-sub">
              <span v-if="evt.at">{{ formatDateTimeBr(evt.at) }}</span>
              <span v-if="evt.payload?.toolName" class="ml-2">· {{ evt.payload.toolName }}</span>
              <span v-if="evt.payload?.status" class="ml-2">· {{ evt.payload.status }}</span>
            </v-list-item-subtitle>
          </v-list-item>
        </v-list>
      </SicatCard>
    </template>
  </div>
</template>

<style scoped>
.ai-overview {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.ai-overview__metrics {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: var(--space-3);
}

.ai-overview__grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
  gap: var(--space-3);
}

.ai-overview__status-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.ai-overview__muted {
  color: rgba(var(--v-theme-on-surface), 0.6);
  font-size: 0.85rem;
}

.ai-overview__chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.ai-overview__counters {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-4);
}

.ai-overview__counter {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.ai-overview__counter-label {
  font-size: 0.74rem;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: rgba(var(--v-theme-on-surface), 0.55);
}

.ai-overview__counter strong {
  font-size: 1.4rem;
}

.ai-overview__feed {
  max-height: 320px;
  overflow: auto;
}

.ai-overview__feed-title {
  font-size: 0.85rem;
  font-weight: 600;
}

.ai-overview__feed-sub {
  font-size: 0.78rem;
}
</style>
