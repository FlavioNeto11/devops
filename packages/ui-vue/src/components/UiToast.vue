<template>
  <Teleport to="body">
    <div class="ui-toasts" aria-live="polite" aria-atomic="false">
      <div v-for="t in items" :key="t.id" class="ui-toast" :data-tone="t.tone" role="status">
        <div class="ui-toast-body">
          <p class="ui-toast-msg">{{ t.message }}</p>
          <p v-if="t.detail" class="ui-toast-detail">{{ t.detail }}</p>
          <p v-if="t.code" class="ui-toast-code ui-mono">{{ t.code }}</p>
        </div>
        <button v-if="t.actionLabel" class="ui-toast-action" @click="runAction(t)">{{ t.actionLabel }}</button>
        <button class="ui-toast-x" aria-label="Fechar" @click="dismiss(t.id)">✕</button>
      </div>
    </div>
  </Teleport>
</template>
<script setup>
// Host único dos toasts. Monte 1x no App.vue: <UiToast />
import { useToast } from '../composables/useToast.js';
const { items, dismiss } = useToast();
function runAction(t) { if (t.onAction) t.onAction(); dismiss(t.id); }
</script>
<style scoped>
.ui-toasts { position: fixed; right: var(--ui-space-4); bottom: var(--ui-space-4); z-index: var(--ui-z-modal); display: flex; flex-direction: column; gap: var(--ui-space-2); max-width: min(92vw, 380px); }
.ui-toast { display: flex; align-items: flex-start; gap: var(--ui-space-3); background: rgb(var(--ui-surface)); border: 1px solid rgb(var(--ui-border)); border-left: 3px solid rgb(var(--ui-muted)); border-radius: var(--ui-radius-md); box-shadow: var(--ui-shadow-md); padding: var(--ui-space-3) var(--ui-space-4); }
.ui-toast[data-tone="success"] { border-left-color: rgb(var(--ui-ok)); }
.ui-toast[data-tone="error"] { border-left-color: rgb(var(--ui-danger)); }
.ui-toast[data-tone="warning"] { border-left-color: rgb(var(--ui-warn)); }
.ui-toast[data-tone="info"] { border-left-color: rgb(var(--ui-accent)); }
.ui-toast-body { flex: 1; }
.ui-toast-msg { margin: 0; font-weight: 600; font-size: var(--ui-text-sm); }
.ui-toast-detail { margin: 2px 0 0; color: rgb(var(--ui-muted)); font-size: var(--ui-text-xs); }
.ui-toast-code { margin: 2px 0 0; color: rgb(var(--ui-muted)); font-size: var(--ui-text-xs); }
.ui-toast-action { background: none; border: none; color: rgb(var(--ui-accent-strong)); font-weight: 600; cursor: pointer; font-size: var(--ui-text-sm); }
.ui-toast-x { background: none; border: none; color: rgb(var(--ui-muted)); cursor: pointer; font-size: .9rem; padding: 0 2px; }
.ui-toast-x:hover { color: rgb(var(--ui-fg)); }
</style>
