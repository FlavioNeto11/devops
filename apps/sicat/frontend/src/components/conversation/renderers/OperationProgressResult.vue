<script setup>
import { computed } from 'vue';
import { formatProgress } from './result-helpers.js';

const props = defineProps({
  title: {
    type: String,
    default: 'operation_progress'
  },
  progress: {
    type: Object,
    default: () => ({})
  },
  status: {
    type: String,
    default: 'running'
  }
});

const normalized = computed(() => formatProgress(props.progress));
</script>

<template>
  <article class="result-card" aria-label="operation_progress">
    <header class="result-card-header">
      <v-icon size="16">mdi-timer-sand</v-icon>
      <h4>{{ title }}</h4>
    </header>

    <p class="progress-line">Status: <strong>{{ status }}</strong></p>
    <p class="progress-line" v-if="normalized.total > 0">
      {{ normalized.completed }}/{{ normalized.total }} concluido ({{ normalized.ratio }}%)
    </p>
    <v-progress-linear
      :model-value="normalized.ratio"
      color="primary"
      height="6"
      rounded
    />
  </article>
</template>

<style scoped>
.result-card {
  border: 1px solid rgba(var(--v-theme-info), 0.24);
  border-radius: 12px;
  padding: 10px 12px;
  background: rgba(var(--v-theme-info), 0.05);
}

.result-card-header {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 8px;
}

.result-card-header h4 {
  margin: 0;
  font-size: 0.82rem;
}

.progress-line {
  margin: 0 0 8px;
  font-size: 0.8rem;
}
</style>
