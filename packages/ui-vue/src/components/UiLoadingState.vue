<template>
  <div class="ui-loading" role="status" aria-live="polite" :aria-busy="true">
    <template v-if="variant === 'skeleton'">
      <div v-for="n in skeletonLines" :key="n" class="ui-sk" />
    </template>
    <template v-else>
      <span class="ui-spin" aria-hidden="true" />
      <span class="ui-loading-text">{{ title || 'Carregando…' }}</span>
    </template>
  </div>
</template>
<script setup>
defineProps({
  variant: { type: String, default: 'spinner' }, // spinner | skeleton
  title: String,
  skeletonLines: { type: Number, default: 4 },
});
</script>
<style scoped>
.ui-loading { display: flex; flex-direction: column; gap: var(--ui-space-3); padding: var(--ui-space-4); align-items: stretch; }
.ui-loading-text { color: rgb(var(--ui-muted)); font-size: var(--ui-text-sm); }
.ui-loading > .ui-spin { font-size: 1.2rem; color: rgb(var(--ui-accent)); align-self: flex-start; }
.ui-sk { height: 14px; border-radius: var(--ui-radius-sm); background: linear-gradient(90deg, rgb(var(--ui-surface-2)) 25%, rgb(var(--ui-border)) 37%, rgb(var(--ui-surface-2)) 63%); background-size: 400% 100%; animation: ui-sk 1.4s ease infinite; width: 90%; }
/* larguras variadas (parecem conteúdo real) sem style inline — via nth-child */
.ui-sk:nth-child(2) { width: 76%; }
.ui-sk:nth-child(3) { width: 84%; }
.ui-sk:nth-child(4) { width: 62%; }
.ui-sk:nth-child(5) { width: 80%; }
.ui-sk:nth-child(6) { width: 70%; }
@keyframes ui-sk { 0% { background-position: 100% 50%; } 100% { background-position: 0 50%; } }
@media (prefers-reduced-motion: reduce) { .ui-sk { animation: none; } }
</style>
