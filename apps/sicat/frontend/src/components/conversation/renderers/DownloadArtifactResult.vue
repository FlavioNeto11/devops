<script setup>
import { computed } from 'vue';
import { asRecord, toNullableText, titleFromArtifact } from './result-helpers.js';

const props = defineProps({
  artifact: {
    type: Object,
    default: () => ({})
  }
});

const emit = defineEmits(['download']);

const payload = computed(() => asRecord(props.artifact?.payload));
const title = computed(() => titleFromArtifact(props.artifact, 'Documento PDF'));
const status = computed(() => toNullableText(payload.value.status) || 'pending');
const fileName = computed(() => toNullableText(payload.value.fileName) || 'artifact.pdf');
const artifactId = computed(() => toNullableText(payload.value.artifactId));
const canDownload = computed(() => status.value === 'available' || status.value === 'partial');

function onDownload() {
  if (!artifactId.value) {
    return;
  }

  emit('download', {
    artifactId: artifactId.value,
    artifactType: 'document',
    fileName: fileName.value,
    status: status.value
  });
}
</script>

<template>
  <article class="result-card" aria-label="download_artifact">
    <header class="result-card-header">
      <v-icon size="16">mdi-file-pdf-box</v-icon>
      <h4>{{ title }}</h4>
    </header>

    <p class="artifact-meta">Status: <strong>{{ status }}</strong></p>
    <v-btn
      size="small"
      color="primary"
      variant="tonal"
      :disabled="!canDownload"
      @click="onDownload"
    >
      Baixar PDF
    </v-btn>
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
}

.artifact-meta {
  margin: 0 0 8px;
  font-size: 0.8rem;
}
</style>
