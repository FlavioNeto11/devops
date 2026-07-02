<!-- SINCRONIZADO de packages/ui-vue — NÃO editar aqui; edite o pacote e rode `node build.mjs`. -->
<template>
  <select
    class="ui-select"
    :id="id"
    :disabled="disabled"
    :aria-invalid="error ? 'true' : undefined"
    :aria-describedby="describedBy || undefined"
    :aria-required="required ? 'true' : undefined"
    :value="modelValue"
    @change="$emit('update:modelValue', $event.target.value)"
  >
    <slot />
  </select>
</template>
<script setup>
defineProps({
  modelValue: { type: String, default: '' },
  id: { type: String, default: undefined },
  disabled: Boolean,
  required: Boolean,
  error: { type: [String, Boolean], default: false },
  describedBy: { type: String, default: undefined },
});
defineEmits(['update:modelValue']);
</script>
<style scoped>
.ui-select {
  background: rgb(var(--ui-bg));
  color: rgb(var(--ui-fg));
  border: 1px solid rgb(var(--ui-border-strong));
  border-radius: var(--ui-radius-sm);
  padding: var(--ui-space-2) var(--ui-space-3);
  font: inherit;
  font-size: var(--ui-text-md);
  width: 100%;
  appearance: auto;
  cursor: pointer;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}
.ui-select:focus {
  outline: none;
  border-color: rgb(var(--ui-accent));
  box-shadow: 0 0 0 3px rgb(var(--ui-accent) / 0.15);
}
.ui-select[aria-invalid="true"] {
  border-color: rgb(var(--ui-danger));
}
.ui-select[aria-invalid="true"]:focus {
  box-shadow: 0 0 0 3px rgb(var(--ui-danger) / 0.15);
}
.ui-select:disabled {
  opacity: .55;
  cursor: not-allowed;
  background: rgb(var(--ui-surface-2));
}
</style>
