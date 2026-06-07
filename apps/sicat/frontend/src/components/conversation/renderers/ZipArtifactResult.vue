<script setup>
import { computed } from 'vue';
import { asRecord, formatProgress, toNullableText, titleFromArtifact } from './result-helpers.js';

const props = defineProps({
  artifact: {
    type: Object,
    default: () => ({})
  }
});

const emit = defineEmits(['download']);

const payload = computed(() => asRecord(props.artifact?.payload));
const title = computed(() => titleFromArtifact(props.artifact, 'ZIP de documentos'));
const status = computed(() => toNullableText(payload.value.status) || 'collecting');
const fileName = computed(() => toNullableText(payload.value.fileName) || 'artifact.zip');
const artifactId = computed(() => toNullableText(payload.value.artifactId));
const progress = computed(() => formatProgress(payload.value.progress));
const canDownload = computed(() => status.value === 'available' || status.value === 'partial');

function onDownload() {
  if (!artifactId.value) {
    return;
  }

  emit('download', {
    artifactId: artifactId.value,
    artifactType: 'zip',
    fileName: fileName.value,
    status: status.value
  });
}
</script>

<template>
  <article class="result-card" aria-label="zip_artifact">
    <header class="result-card-header">
      <v-icon size="16">mdi-folder-zip-outline</v-icon>
      <h4>{{ title }}</h4>
    </header>

    <p class="artifact-meta">Status: <strong>{{ status }}</strong></p>
    <p class="artifact-meta" v-if="progress.total > 0">
      Progresso: {{ progress.completed }}/{{ progress.total }} ({{ progress.ratio }}%)
    </p>

    <v-progress-linear
      v-if="progress.total > 0"
      :model-value="progress.ratio"
      color="primary"
      height="6"
      rounded
      class="zip-progress"
    />

    <v-btn
      size="small"
      color="primary"
      variant="tonal"
      :disabled="!canDownload"
      @click="onDownload"
    >
      Baixar ZIP
    </v-btn>
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

.artifact-meta {
  margin: 0 0 6px;
  font-size: 0.8rem;
}

.zip-progress {
  margin: 2px 0 10px;
}
</style>
