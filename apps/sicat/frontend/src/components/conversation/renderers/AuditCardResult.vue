<script setup>
import { computed } from 'vue';
import { asArray, asRecord, toNullableText } from './result-helpers.js';

const props = defineProps({
  data: {
    type: Object,
    default: () => ({})
  },
  correlationId: {
    type: String,
    default: ''
  }
});

const items = computed(() => asArray(props.data?.items));
const firstItem = computed(() => asRecord(items.value[0]));
const total = computed(() => items.value.length);
const correlation = computed(() => toNullableText(props.correlationId) || '-');
</script>

<template>
  <article class="result-card" aria-label="audit_card">
    <header class="result-card-header">
      <v-icon size="16">mdi-shield-search-outline</v-icon>
      <h4>Auditoria</h4>
    </header>

    <dl class="result-card-grid">
      <div class="result-row">
        <dt>Eventos</dt>
        <dd>{{ total }}</dd>
      </div>
      <div class="result-row">
        <dt>Correlation</dt>
        <dd>{{ correlation }}</dd>
      </div>
      <div class="result-row" v-if="toNullableText(firstItem.actionType)">
        <dt>Ultima acao</dt>
        <dd>{{ firstItem.actionType }}</dd>
      </div>
    </dl>
  </article>
</template>

<style scoped>
.result-card {
  border: 1px solid rgba(var(--v-theme-secondary), 0.24);
  border-radius: 12px;
  padding: 10px 12px;
  background: rgba(var(--v-theme-secondary), 0.05);
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
