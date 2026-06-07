<script setup>
import { computed } from 'vue';
import { asRecord, toNullableText } from './result-helpers.js';

const props = defineProps({
  artifact: {
    type: Object,
    default: () => ({})
  }
});

const payload = computed(() => asRecord(props.artifact?.payload));
</script>

<template>
  <article class="result-card" aria-label="job_card">
    <header class="result-card-header">
      <v-icon size="16">mdi-cog-outline</v-icon>
      <h4>Job Operacional</h4>
    </header>

    <dl class="result-card-grid">
      <div class="result-row" v-if="toNullableText(payload.jobId)">
        <dt>Job</dt>
        <dd>{{ payload.jobId }}</dd>
      </div>
      <div class="result-row" v-if="toNullableText(payload.operation || payload.jobType)">
        <dt>Operacao</dt>
        <dd>{{ payload.operation || payload.jobType }}</dd>
      </div>
      <div class="result-row" v-if="toNullableText(payload.status)">
        <dt>Status</dt>
        <dd>{{ payload.status }}</dd>
      </div>
    </dl>
  </article>
</template>

<style scoped>
.result-card {
  border: 1px solid rgba(var(--v-theme-warning), 0.24);
  border-radius: 12px;
  padding: 10px 12px;
  background: rgba(var(--v-theme-warning), 0.05);
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
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.result-card-grid {
  margin: 0;
  display: grid;
  gap: 6px;
}

.result-row {
  display: grid;
  grid-template-columns: minmax(86px, max-content) minmax(0, 1fr);
  gap: 8px;
}

.result-row dt {
  margin: 0;
  font-size: 0.74rem;
  color: rgba(var(--v-theme-on-surface), 0.66);
}

.result-row dd {
  margin: 0;
  font-size: 0.82rem;
  overflow-wrap: anywhere;
}
</style>
