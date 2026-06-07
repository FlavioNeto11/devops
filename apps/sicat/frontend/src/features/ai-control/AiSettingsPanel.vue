<script setup>
import { computed, onMounted, ref } from 'vue';
import { getAiControlHealth, getAiControlSettings } from '../../services/api.js';
import { useNotification } from '../../composables/useNotification.js';
import SicatCard from '../../components/sicat/SicatCard.vue';
import SicatInlineAlert from '../../components/sicat/SicatInlineAlert.vue';
import SicatLoadingState from '../../components/sicat/SicatLoadingState.vue';
import SicatErrorState from '../../components/sicat/SicatErrorState.vue';

const notify = useNotification();

const loading = ref(false);
const error = ref(null);
const settings = ref(null);

const healthLoading = ref(false);
const health = ref(null);

const provider = computed(() => settings.value?.provider || {});
const langfuse = computed(() => settings.value?.langfuse || {});
const flags = computed(() => settings.value || {});

function boolChip(value) {
  return value ? { color: 'success', label: 'Sim' } : { color: 'default', label: 'Não' };
}

function configuredChip(value) {
  return value
    ? { color: 'success', label: 'Configurada' }
    : { color: 'warning', label: 'Não configurada' };
}

async function load() {
  loading.value = true;
  error.value = null;
  try {
    settings.value = await getAiControlSettings();
  } catch (err) {
    error.value = err;
  } finally {
    loading.value = false;
  }
}

async function runHealthCheck() {
  healthLoading.value = true;
  try {
    health.value = await getAiControlHealth();
    notify.success('Health check executado.');
  } catch (err) {
    notify.error(err?.message || 'Falha no health check.');
  } finally {
    healthLoading.value = false;
  }
}

const healthOk = computed(() => {
  const h = health.value;
  if (!h) return false;
  if (h.ok === true || h.healthy === true) return true;
  const status = String(h.status || '').toLowerCase();
  return status === 'ok' || status === 'healthy';
});

const healthMessage = computed(() => {
  const h = health.value;
  if (!h) return '';
  if (h.message) return h.message;
  const parts = [];
  if (h.database) parts.push(`Banco: ${h.database.ok ? 'ok' : (h.database.error || 'erro')}`);
  if (h.provider) parts.push(`Provider: ${h.provider.status || (h.provider.configured ? 'configurado' : 'não configurado')}`);
  if (h.langfuse) parts.push(`Langfuse: ${h.langfuse.status || '—'}`);
  if (h.knowledge) parts.push(`Knowledge: ${h.knowledge.available ? 'disponível' : 'indisponível'}`);
  return parts.join(' · ') || `Status: ${h.status || (h.ok ? 'ok' : 'desconhecido')}`;
});

onMounted(load);
</script>

<template>
  <div class="ai-settings">
    <SicatLoadingState v-if="loading" title="Carregando configurações…" />
    <SicatErrorState v-else-if="error" :message="error?.message || 'Falha ao carregar configurações.'" retryable @retry="load" />

    <template v-else>
      <!-- Health check -->
      <SicatCard title="Health check" icon="mdi-heart-pulse" class="mb-3">
        <template #header-actions>
          <v-btn variant="tonal" size="small" prepend-icon="mdi-heart-pulse" :loading="healthLoading" @click="runHealthCheck">Executar health</v-btn>
        </template>
        <SicatInlineAlert
          v-if="health"
          :tone="healthOk ? 'success' : 'warning'"
          :title="healthOk ? 'Saudável' : 'Atenção'"
          :message="healthMessage"
        />
        <p v-else class="ai-settings__muted">Clique em "Executar health" para verificar o estado do subsistema de IA.</p>
      </SicatCard>

      <!-- Provider -->
      <SicatCard title="Provider de IA" icon="mdi-robot-outline" class="mb-3">
        <dl class="ai-settings__list">
          <div class="ai-settings__row">
            <dt>Provider configurado</dt>
            <dd><v-chip :color="boolChip(provider.configured).color" size="small" variant="tonal">{{ boolChip(provider.configured).label }}</v-chip></dd>
          </div>
          <div class="ai-settings__row"><dt>Modelo (agente)</dt><dd>{{ provider.agentModel || '—' }}</dd></div>
          <div class="ai-settings__row"><dt>Modelo (síntese)</dt><dd>{{ provider.synthesisModel || '—' }}</dd></div>
          <div class="ai-settings__row"><dt>Modelo (escalation)</dt><dd>{{ provider.escalationModel || '—' }}</dd></div>
          <div class="ai-settings__row"><dt>Modelo (juiz)</dt><dd>{{ provider.judgeModel || '—' }}</dd></div>
          <div class="ai-settings__row"><dt>Modelo de embedding</dt><dd>{{ flags.knowledgeEmbeddingModel || provider.embeddingModel || '—' }}</dd></div>
          <div class="ai-settings__row">
            <dt>LangSmith</dt>
            <dd><v-chip :color="boolChip(flags.langSmithEnabled).color" size="small" variant="tonal">{{ boolChip(flags.langSmithEnabled).label }}</v-chip></dd>
          </div>
        </dl>
      </SicatCard>

      <!-- Langfuse -->
      <SicatCard title="Langfuse" icon="mdi-chart-timeline-variant" class="mb-3">
        <dl class="ai-settings__list">
          <div class="ai-settings__row">
            <dt>Habilitado</dt>
            <dd><v-chip :color="boolChip(langfuse.enabled).color" size="small" variant="tonal">{{ boolChip(langfuse.enabled).label }}</v-chip></dd>
          </div>
          <div class="ai-settings__row"><dt>Status</dt><dd>{{ langfuse.status || '—' }}</dd></div>
          <div class="ai-settings__row"><dt>Base URL</dt><dd>{{ langfuse.baseUrl || '—' }}</dd></div>
          <div class="ai-settings__row"><dt>Project ID</dt><dd>{{ langfuse.projectId || '—' }}</dd></div>
          <div class="ai-settings__row">
            <dt>Public key</dt>
            <dd><v-chip :color="configuredChip(langfuse.publicKeyConfigured).color" size="small" variant="tonal">{{ configuredChip(langfuse.publicKeyConfigured).label }}</v-chip></dd>
          </div>
          <div class="ai-settings__row">
            <dt>Secret key</dt>
            <dd><v-chip :color="configuredChip(langfuse.secretKeyConfigured).color" size="small" variant="tonal">{{ configuredChip(langfuse.secretKeyConfigured).label }}</v-chip></dd>
          </div>
          <div class="ai-settings__row"><dt>Flush interval</dt><dd>{{ langfuse.flushIntervalMs ?? flags.flushIntervalMs ?? '—' }} ms</dd></div>
          <div class="ai-settings__row"><dt>Sync timeout</dt><dd>{{ langfuse.syncTimeoutMs ?? flags.syncTimeoutMs ?? '—' }} ms</dd></div>
        </dl>
      </SicatCard>

      <!-- Flags de runtime -->
      <SicatCard title="Runtime / flags" icon="mdi-tune-variant" class="mb-3">
        <dl class="ai-settings__list">
          <div class="ai-settings__row">
            <dt>Read-only</dt>
            <dd><v-chip :color="boolChip(flags.readOnly).color" size="small" variant="tonal">{{ boolChip(flags.readOnly).label }}</v-chip></dd>
          </div>
          <div class="ai-settings__row">
            <dt>Debug</dt>
            <dd><v-chip :color="boolChip(flags.debug).color" size="small" variant="tonal">{{ boolChip(flags.debug).label }}</v-chip></dd>
          </div>
          <div class="ai-settings__row">
            <dt>SSE habilitado</dt>
            <dd><v-chip :color="boolChip(flags.enableSse).color" size="small" variant="tonal">{{ boolChip(flags.enableSse).label }}</v-chip></dd>
          </div>
          <div class="ai-settings__row">
            <dt>Smoke completo permitido</dt>
            <dd><v-chip :color="boolChip(flags.allowFullSmoke).color" size="small" variant="tonal">{{ boolChip(flags.allowFullSmoke).label }}</v-chip></dd>
          </div>
          <div class="ai-settings__row"><dt>Retenção de traces</dt><dd>{{ flags.traceRetentionDays ?? '—' }} dias</dd></div>
        </dl>
      </SicatCard>
    </template>
  </div>
</template>

<style scoped>
.ai-settings {
  display: flex;
  flex-direction: column;
}

.ai-settings__muted {
  margin: 0;
  color: rgba(var(--v-theme-on-surface), 0.6);
  font-size: 0.88rem;
}

.ai-settings__list {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: var(--space-3) var(--space-6);
  margin: 0;
}

.ai-settings__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  padding: 6px 0;
  border-bottom: 1px solid rgba(var(--v-border-color), 0.08);
}

.ai-settings__row dt {
  font-size: 0.82rem;
  font-weight: 600;
  color: rgba(var(--v-theme-on-surface), 0.6);
}

.ai-settings__row dd {
  margin: 0;
  font-size: 0.9rem;
  color: rgba(var(--v-theme-on-surface), 0.9);
  text-align: right;
  word-break: break-word;
}
</style>
