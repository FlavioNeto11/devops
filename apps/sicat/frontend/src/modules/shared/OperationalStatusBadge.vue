<script setup>
import { computed } from 'vue';
import {
  describeOperationalStatus,
  severityToVuetifyColor
} from '../command-center/operationalStatus.js';

const props = defineProps({
  status: { type: String, default: '' },
  label: { type: String, default: '' },
  severity: { type: String, default: '' },
  size: { type: String, default: 'small' }
});

const descriptor = computed(() => describeOperationalStatus(props.status));

const resolvedLabel = computed(() => {
  if (props.label) return props.label;
  return descriptor.value?.label || props.status || '—';
});

const resolvedSeverity = computed(() => {
  if (props.severity) return props.severity;
  return descriptor.value?.severity || 'neutral';
});

const color = computed(() => severityToVuetifyColor(resolvedSeverity.value));
</script>

<template>
  <v-chip
    :color="color"
    :size="size"
    variant="tonal"
    class="op-status-badge"
    :data-status="props.status"
    :data-severity="resolvedSeverity"
    :title="descriptor?.recommendedAction || ''"
  >
    {{ resolvedLabel }}
  </v-chip>
</template>

<style scoped>
.op-status-badge {
  font-weight: 600;
  letter-spacing: 0.01em;
}
</style>
