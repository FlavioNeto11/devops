<script setup>
import { computed } from 'vue';
import { asArray, toText } from './result-helpers.js';

const props = defineProps({
  fields: {
    type: Array,
    default: () => []
  }
});

const items = computed(() => asArray(props.fields).map((item) => toText(item)).filter(Boolean));
</script>

<template>
  <article class="result-card" aria-label="missing_fields">
    <header class="result-card-header">
      <v-icon size="16">mdi-alert-circle-outline</v-icon>
      <h4>Campos faltantes</h4>
    </header>

    <ul class="missing-list">
      <li v-for="field in items" :key="field">{{ field }}</li>
    </ul>
  </article>
</template>

<style scoped>
.result-card {
  border: 1px solid rgba(var(--v-theme-error), 0.3);
  border-radius: 12px;
  padding: 10px 12px;
  background: rgba(var(--v-theme-error), 0.05);
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

.missing-list {
  margin: 0;
  padding-left: 18px;
  display: grid;
  gap: 4px;
  font-size: 0.8rem;
}
</style>
