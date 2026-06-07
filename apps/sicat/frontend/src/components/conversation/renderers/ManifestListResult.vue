<script setup>
import { computed } from 'vue';
import { asArray, asRecord, toNullableText } from './result-helpers.js';

const props = defineProps({
  artifact: {
    type: Object,
    default: () => ({})
  }
});

const items = computed(() => {
  const payload = asRecord(props.artifact?.payload);
  return asArray(payload.items).map((item) => asRecord(item));
});
</script>

<template>
  <section class="result-card" aria-label="manifest_list">
    <header class="result-card-header">
      <v-icon size="16">mdi-format-list-bulleted-square</v-icon>
      <h4>Manifestos</h4>
    </header>

    <ul class="manifest-list">
      <li v-for="item in items" :key="item.manifestId || item.position" class="manifest-item">
        <span class="manifest-title">{{ item.position }}. {{ item.manifestNumber || item.manifestId || '-' }}</span>
        <span class="manifest-meta">{{ toNullableText(item.status) || 'Sem status' }}</span>
      </li>
    </ul>
  </section>
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

.manifest-list {
  margin: 0;
  padding: 0;
  list-style: none;
  display: grid;
  gap: 6px;
}

.manifest-item {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  padding: 6px 8px;
  border-radius: 8px;
  background: rgba(var(--v-theme-primary), 0.06);
}

.manifest-title {
  font-size: 0.82rem;
  font-weight: 600;
}

.manifest-meta {
  font-size: 0.78rem;
  color: rgba(var(--v-theme-on-surface), 0.72);
}
</style>
