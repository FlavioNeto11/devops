<script setup>
import { computed } from 'vue';
import { asArray, asRecord, toNullableText } from './result-helpers.js';

const props = defineProps({
  data: {
    type: Object,
    default: () => ({})
  }
});

const groupKey = computed(() => toNullableText(props.data.groupBy || 'gerador'));
const groups = computed(() => {
  const items = asArray(props.data.items || props.data.manifestItems || []);
  const groupMap = {};

  items.forEach((item) => {
    const normalized = asRecord(item);
    let groupValue = '';

    if (groupKey.value === 'gerador') {
      groupValue = toNullableText(
        normalized.generator?.description || 
        normalized.generatorName || 
        normalized.gerador ||
        'Sem Gerador'
      );
    } else if (groupKey.value === 'status') {
      groupValue = toNullableText(
        normalized.externalStatus || 
        normalized.status || 
        'Indefinido'
      );
    } else {
      groupValue = toNullableText(normalized[groupKey.value] || 'Outro');
    }

    if (!groupMap[groupValue]) {
      groupMap[groupValue] = [];
    }
    groupMap[groupValue].push(normalized);
  });

  return Object.entries(groupMap).map(([key, items]) => ({
    groupLabel: key,
    count: items.length,
    items
  }));
});

const totalItems = computed(() => {
  return groups.value.reduce((sum, g) => sum + g.count, 0);
});
</script>

<template>
  <article class="result-card grouped-manifests" aria-label="grouped_manifestos">
    <header class="result-card-header">
      <v-icon size="16" color="primary">mdi-folder-multiple</v-icon>
      <h4>Manifestos Agrupados ({{ totalItems }} total)</h4>
    </header>

    <div class="groups-container">
      <div v-for="(group, index) in groups" :key="index" class="group">
        <div class="group-header">
          <h5 class="group-title">{{ group.groupLabel }}</h5>
          <span class="group-count">{{ group.count }}</span>
        </div>
        <ul class="group-items">
          <li v-for="item in group.items.slice(0, 3)" :key="item.manifestId || item.id" class="group-item">
            <v-icon size="12">mdi-file-document-outline</v-icon>
            <span class="item-number">{{ toNullableText(item.manifestNumber || item.manifestId) }}</span>
            <span class="item-date">{{ toNullableText(item.createdAt || item.emissionDate)?.substring(0, 10) }}</span>
          </li>
          <li v-if="group.count > 3" class="group-more">
            <v-icon size="12">mdi-plus-circle-outline</v-icon>
            <span>{{ group.count - 3 }} mais...</span>
          </li>
        </ul>
      </div>
    </div>
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
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.groups-container {
  display: grid;
  gap: 8px;
}

.group {
  border-radius: 8px;
  border: 1px solid rgba(var(--v-theme-on-surface), 0.12);
  overflow: hidden;
  background: rgba(var(--v-theme-surface-variant), 0.5);
}

.group-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  background: rgba(var(--v-theme-primary), 0.08);
  border-bottom: 1px solid rgba(var(--v-theme-on-surface), 0.08);
}

.group-title {
  margin: 0;
  font-size: 0.76rem;
  font-weight: 600;
  color: rgba(var(--v-theme-on-surface), 0.87);
}

.group-count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 24px;
  height: 20px;
  border-radius: 4px;
  background: rgba(var(--v-theme-primary), 0.15);
  color: rgba(var(--v-theme-primary), 1);
  font-size: 0.7rem;
  font-weight: 700;
}

.group-items {
  margin: 0;
  padding: 4px 0;
  list-style: none;
}

.group-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 8px;
  font-size: 0.76rem;
  border-bottom: 1px solid rgba(var(--v-theme-on-surface), 0.06);
}

.group-item:last-child {
  border-bottom: none;
}

.item-number {
  flex: 1;
  font-weight: 500;
  color: rgba(var(--v-theme-on-surface), 0.87);
}

.item-date {
  font-size: 0.7rem;
  color: rgba(var(--v-theme-on-surface), 0.64);
}

.group-more {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 8px;
  font-size: 0.75rem;
  color: rgba(var(--v-theme-primary), 1);
  background: rgba(var(--v-theme-primary), 0.06);
}
</style>
