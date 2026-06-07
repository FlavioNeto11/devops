<script setup>
import { onMounted, ref } from 'vue';
import { useAiControlStream } from '../../composables/useAiControlStream.js';
import SicatPageLayout from '../../components/sicat/SicatPageLayout.vue';
import SicatPageHeader from '../../components/shell/SicatPageHeader.vue';
import AiOverviewPanel from '../../features/ai-control/AiOverviewPanel.vue';
import AiRuntimeToolsPanel from '../../features/ai-control/AiRuntimeToolsPanel.vue';
import AiLangfuseTracesPanel from '../../features/ai-control/AiLangfuseTracesPanel.vue';
import AiPromptsPanel from '../../features/ai-control/AiPromptsPanel.vue';
import AiKnowledgePanel from '../../features/ai-control/AiKnowledgePanel.vue';
import AiMemoryPanel from '../../features/ai-control/AiMemoryPanel.vue';
import AiEvalsPanel from '../../features/ai-control/AiEvalsPanel.vue';
import AiSettingsPanel from '../../features/ai-control/AiSettingsPanel.vue';

const TABS = [
  { value: 'overview', label: 'Overview', icon: 'mdi-view-dashboard-outline' },
  { value: 'runtime', label: 'Runtime SICAT', icon: 'mdi-cog-outline' },
  { value: 'langfuse', label: 'Langfuse', icon: 'mdi-chart-timeline-variant' },
  { value: 'prompts', label: 'Prompts', icon: 'mdi-text-box-outline' },
  { value: 'knowledge', label: 'Knowledge Base', icon: 'mdi-database-outline' },
  { value: 'memory', label: 'Memória', icon: 'mdi-brain' },
  { value: 'evals', label: 'Evals/Smoke', icon: 'mdi-format-list-checks' },
  { value: 'settings', label: 'Settings', icon: 'mdi-tune-variant' }
];

const activeTab = ref('overview');

// Lazy render: cada painel só monta quando sua aba é visitada pela primeira vez.
const visited = ref({ overview: true });

function visitTab(value) {
  if (!visited.value[value]) {
    visited.value = { ...visited.value, [value]: true };
  }
}

// Filtros passados para o painel Langfuse quando o Runtime pede "traces relacionados".
const langfuseFilters = ref(null);

function openRelatedTraces(filters) {
  langfuseFilters.value = { ...filters };
  activeTab.value = 'langfuse';
  visitTab('langfuse');
}

// SSE: stream de eventos em tempo real, alimentando o painel Overview.
const { events: liveEvents, streaming, streamError, start } = useAiControlStream();

onMounted(async () => {
  try {
    await start();
  } catch {
    // o streamError já é refletido no painel Overview; não bloqueia a tela.
  }
});
</script>

<template>
  <SicatPageLayout width="wide">
    <template #header>
      <SicatPageHeader
        title="AI Control Center"
        description="Governança, observabilidade e runtime da IA SICAT"
        :breadcrumbs="['Sistema', 'AI Control Center']"
      >
        <template #actions>
          <v-chip :color="streaming ? 'success' : 'default'" variant="tonal" size="small">
            <v-icon start size="12" :icon="streaming ? 'mdi-circle' : 'mdi-circle-outline'" />
            {{ streaming ? 'Eventos ao vivo' : 'Stream offline' }}
          </v-chip>
        </template>
      </SicatPageHeader>
    </template>

    <v-card>
      <v-tabs v-model="activeTab" color="primary" show-arrows @update:model-value="visitTab">
        <v-tab v-for="tab in TABS" :key="tab.value" :value="tab.value" :prepend-icon="tab.icon">
          {{ tab.label }}
        </v-tab>
      </v-tabs>
      <v-divider />

      <v-window v-model="activeTab" class="ai-control__window">
        <v-window-item value="overview">
          <div class="ai-control__panel">
            <AiOverviewPanel
              v-if="visited.overview"
              :live-events="liveEvents"
              :streaming="streaming"
              :stream-error="streamError"
            />
          </div>
        </v-window-item>

        <v-window-item value="runtime">
          <div class="ai-control__panel">
            <AiRuntimeToolsPanel v-if="visited.runtime" @open-traces="openRelatedTraces" />
          </div>
        </v-window-item>

        <v-window-item value="langfuse">
          <div class="ai-control__panel">
            <AiLangfuseTracesPanel v-if="visited.langfuse" :initial-filters="langfuseFilters" />
          </div>
        </v-window-item>

        <v-window-item value="prompts">
          <div class="ai-control__panel">
            <AiPromptsPanel v-if="visited.prompts" />
          </div>
        </v-window-item>

        <v-window-item value="knowledge">
          <div class="ai-control__panel">
            <AiKnowledgePanel v-if="visited.knowledge" />
          </div>
        </v-window-item>

        <v-window-item value="memory">
          <div class="ai-control__panel">
            <AiMemoryPanel v-if="visited.memory" />
          </div>
        </v-window-item>

        <v-window-item value="evals">
          <div class="ai-control__panel">
            <AiEvalsPanel v-if="visited.evals" />
          </div>
        </v-window-item>

        <v-window-item value="settings">
          <div class="ai-control__panel">
            <AiSettingsPanel v-if="visited.settings" />
          </div>
        </v-window-item>
      </v-window>
    </v-card>
  </SicatPageLayout>
</template>

<style scoped>
.ai-control__window {
  min-height: 320px;
}

.ai-control__panel {
  padding: var(--space-5);
}

@media (max-width: 599px) {
  .ai-control__panel {
    padding: var(--space-4);
  }
}
</style>
