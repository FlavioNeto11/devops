<!-- SINCRONIZADO de packages/ui-vue — NÃO editar aqui; edite o pacote e rode `node build.mjs`. -->
<template>
  <div class="ui-error" role="alert">
    <span class="ui-error-icon" aria-hidden="true">{{ icon || '⚠' }}</span>
    <p class="ui-error-msg">{{ resolvedMessage }}</p>
    <p v-if="code" class="ui-error-code ui-mono">{{ code }}</p>
    <div class="ui-error-actions">
      <slot name="action" />
      <UiButton v-if="retryable" variant="ghost" size="sm" @click="$emit('retry')">Tentar de novo</UiButton>
    </div>
  </div>
</template>
<script setup>
import { computed } from 'vue';
import UiButton from './UiButton.vue';
const props = defineProps({
  message: { type: [String, Object], default: '' },
  code: { type: [String, Number], default: '' },
  retryable: { type: Boolean, default: true },
  icon: String,
});
defineEmits(['retry']);
const resolvedMessage = computed(() => {
  const m = props.message;
  if (!m) return 'Algo deu errado.';
  if (typeof m === 'string') return m;
  return m.message || (m.error && m.error.message) || 'Algo deu errado.';
});
</script>
<style scoped>
.ui-error { display: flex; flex-direction: column; align-items: center; text-align: center; gap: var(--ui-space-2); padding: var(--ui-space-6) var(--ui-space-4); }
.ui-error-icon { font-size: 1.8rem; color: rgb(var(--ui-danger)); }
.ui-error-msg { margin: 0; font-weight: 600; }
.ui-error-code { margin: 0; font-size: var(--ui-text-xs); color: rgb(var(--ui-muted)); }
.ui-error-actions { display: flex; gap: var(--ui-space-2); margin-top: var(--ui-space-2); }
</style>
