<script setup>
import { computed } from 'vue';
import { asRecord, toNullableText } from './result-helpers.js';

const props = defineProps({
  manifest: {
    type: Object,
    default: () => ({})
  }
});

const data = computed(() => asRecord(props.manifest));

const rows = computed(() => {
  const record = data.value;

  return [
    { key: 'Manifesto', value: toNullableText(record.manifestNumber || record.id || record.manifestId) },
    { key: 'Status', value: toNullableText(record.externalStatus || record.status) },
    { key: 'Data', value: toNullableText(record.expeditionDate || record.createdAt) },
    { key: 'Gerador', value: toNullableText(record.generator?.description || record.generatorName) },
    { key: 'Transportador', value: toNullableText(record.carrier?.description || record.carrierName) },
    { key: 'Destinador', value: toNullableText(record.receiver?.description || record.receiverName) },
    { key: 'CDF', value: toNullableText(record.externalHashCode) }
  ].filter((item) => item.value);
});
</script>

<template>
  <article class="result-card manifest-card" aria-label="manifest_card">
    <header class="result-card-header">
      <v-icon size="16">mdi-file-document-outline</v-icon>
      <h4>Manifesto</h4>
    </header>

    <dl class="result-card-grid">
      <div v-for="item in rows" :key="item.key" class="result-row">
        <dt>{{ item.key }}</dt>
        <dd>{{ item.value }}</dd>
      </div>
    </dl>
  </article>
</template>

<style scoped>
.result-card {
  border: 1px solid rgba(var(--v-theme-primary), 0.2);
  border-radius: 12px;
  padding: 10px 12px;
  background: rgba(var(--v-theme-surface), 0.9);
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
  grid-template-columns: minmax(92px, max-content) minmax(0, 1fr);
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

@media (max-width: 560px) {
  .result-row {
    grid-template-columns: 1fr;
  }
}
</style>
