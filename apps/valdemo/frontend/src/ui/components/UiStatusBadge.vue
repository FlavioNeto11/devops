<!-- SINCRONIZADO de packages/ui-vue — NÃO editar aqui; edite o pacote e rode `node build.mjs`. -->
<template>
  <span class="ui-badge" :data-tone="resolvedTone" :data-size="size" role="status">
    <span v-if="withDot" class="ui-badge-dot" aria-hidden="true" />
    {{ text }}
  </span>
</template>
<script setup>
import { computed } from 'vue';
import { resolveTone, statusLabel } from '../lib/status-map.js';
const props = defineProps({
  status: { type: [String, Number], default: '' },
  label: { type: String, default: '' },
  tone: { type: String, default: null }, // sobrescreve a resolução automática
  size: { type: String, default: 'md' }, // sm | md | lg
  withDot: { type: Boolean, default: true },
});
const resolvedTone = computed(() => props.tone || resolveTone(props.status));
const text = computed(() => statusLabel(props.status, props.label));
</script>
<style scoped>
.ui-badge { display: inline-flex; align-items: center; gap: 6px; font-weight: 600; font-size: var(--ui-text-xs); padding: 3px 9px; border-radius: var(--ui-radius-pill); line-height: 1.4; white-space: nowrap; }
.ui-badge[data-size="lg"] { font-size: var(--ui-text-sm); padding: 4px 11px; }
.ui-badge-dot { width: 6px; height: 6px; border-radius: 50%; background: currentColor; }
.ui-badge[data-tone="neutral"] { background: rgb(var(--ui-muted) / 0.16); color: rgb(var(--ui-muted)); }
.ui-badge[data-tone="success"] { background: rgb(var(--ui-ok) / 0.16); color: rgb(var(--ui-ok)); }
.ui-badge[data-tone="warning"] { background: rgb(var(--ui-warn) / 0.18); color: rgb(var(--ui-warn)); }
.ui-badge[data-tone="error"] { background: rgb(var(--ui-danger) / 0.16); color: rgb(var(--ui-danger)); }
.ui-badge[data-tone="running"] { background: rgb(var(--ui-accent) / 0.16); color: rgb(var(--ui-accent-strong)); }
</style>
