<template>
  <component :is="clickable ? 'button' : 'div'" class="ui-metric" :data-tone="tone" :data-clickable="clickable ? 'true' : null"
             @click="clickable && $emit('click')">
    <span class="ui-metric-label">{{ label }}</span>
    <span v-if="loading" class="ui-metric-value ui-muted">…</span>
    <span v-else class="ui-metric-value">{{ value ?? '—' }}</span>
    <span v-if="hint" class="ui-metric-hint">{{ hint }}</span>
    <span v-if="trend !== null && trend !== undefined" class="ui-metric-trend" :data-dir="trend >= 0 ? 'up' : 'down'">
      {{ trend >= 0 ? '▲' : '▼' }} {{ Math.abs(trend) }}%
    </span>
  </component>
</template>
<script setup>
defineProps({
  label: { type: String, required: true },
  value: { type: [String, Number], default: null },
  hint: String,
  tone: { type: String, default: 'neutral' }, // neutral | primary | success | warning | error | running
  trend: { type: Number, default: null },
  loading: Boolean, clickable: Boolean,
});
defineEmits(['click']);
</script>
<style scoped>
.ui-metric { display: flex; flex-direction: column; gap: 2px; text-align: left; background: rgb(var(--ui-surface)); border: 1px solid rgb(var(--ui-border)); border-left: 3px solid rgb(var(--ui-faint)); border-radius: var(--ui-radius-lg); padding: var(--ui-space-4) var(--ui-space-5); box-shadow: var(--ui-shadow-sm); font: inherit; }
.ui-metric[data-clickable="true"] { cursor: pointer; transition: filter .15s ease; }
.ui-metric[data-clickable="true"]:hover { filter: brightness(1.02); border-left-color: rgb(var(--ui-accent)); }
.ui-metric[data-tone="primary"] { border-left-color: rgb(var(--ui-accent)); }
.ui-metric[data-tone="success"] { border-left-color: rgb(var(--ui-ok)); }
.ui-metric[data-tone="warning"] { border-left-color: rgb(var(--ui-warn)); }
.ui-metric[data-tone="error"] { border-left-color: rgb(var(--ui-danger)); }
.ui-metric[data-tone="running"] { border-left-color: rgb(var(--ui-accent)); }
.ui-metric-label { color: rgb(var(--ui-muted)); font-size: var(--ui-text-sm); }
.ui-metric-value { font-family: var(--ui-font-display); font-size: 1.7rem; font-weight: 700; }
.ui-metric-hint { color: rgb(var(--ui-muted)); font-size: var(--ui-text-xs); }
.ui-metric-trend { font-size: var(--ui-text-xs); font-weight: 600; }
.ui-metric-trend[data-dir="up"] { color: rgb(var(--ui-ok)); }
.ui-metric-trend[data-dir="down"] { color: rgb(var(--ui-danger)); }
</style>
