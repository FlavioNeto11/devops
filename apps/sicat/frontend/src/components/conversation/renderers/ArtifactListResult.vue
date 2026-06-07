<script setup>
import { computed } from 'vue';
import { asArray, asRecord, toNullableText } from './result-helpers.js';

const props = defineProps({
  artifacts: {
    type: Array,
    default: () => []
  }
});

const emit = defineEmits(['download']);

const items = computed(() => asArray(props.artifacts).map((item) => {
  const artifact = asRecord(item);
  const payload = asRecord(artifact.payload);
  const status = toNullableText(payload.status) || 'pending';
  const artifactId = toNullableText(payload.artifactId);
  const fileName = toNullableText(payload.fileName) || (artifact.type === 'zip_bundle' ? 'artifact.zip' : 'artifact.pdf');

  return {
    title: toNullableText(artifact.title) || 'Artifact',
    type: artifact.type,
    status,
    artifactId,
    fileName
  };
}));

function onDownload(item) {
  if (!item.artifactId) {
    return;
  }

  emit('download', {
    artifactId: item.artifactId,
    artifactType: item.type === 'zip_bundle' ? 'zip' : 'document',
    fileName: item.fileName,
    status: item.status
  });
}
</script>

<template>
  <section class="result-card" aria-label="artifact_list">
    <header class="result-card-header">
      <v-icon size="16">mdi-file-multiple-outline</v-icon>
      <h4>Artifacts</h4>
    </header>

    <ul class="artifact-list">
      <li v-for="item in items" :key="`${item.artifactId}-${item.fileName}`" class="artifact-item">
        <div class="artifact-info">
          <strong>{{ item.title }}</strong>
          <span>{{ item.status }}</span>
        </div>
        <v-btn
          size="x-small"
          variant="text"
          color="primary"
          :disabled="!['available', 'partial'].includes(item.status)"
          @click="onDownload(item)"
        >
          Baixar
        </v-btn>
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
}

.artifact-list {
  margin: 0;
  padding: 0;
  list-style: none;
  display: grid;
  gap: 6px;
}

.artifact-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  border-radius: 8px;
  background: rgba(var(--v-theme-primary), 0.06);
}

.artifact-info {
  display: grid;
  gap: 2px;
}

.artifact-info strong {
  font-size: 0.8rem;
}

.artifact-info span {
  font-size: 0.74rem;
  color: rgba(var(--v-theme-on-surface), 0.68);
}
</style>
