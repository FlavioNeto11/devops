<template>
  <textarea
    class="ui-textarea"
    :id="id"
    :rows="rows"
    :placeholder="placeholder"
    :disabled="disabled"
    :readonly="readonly"
    :aria-invalid="error ? 'true' : undefined"
    :aria-describedby="describedBy || undefined"
    :aria-required="required ? 'true' : undefined"
    :value="modelValue"
    @input="$emit('update:modelValue', $event.target.value)"
    @change="$emit('change', $event.target.value)"
  ></textarea>
</template>
<script setup>
defineProps({
  modelValue: { type: String, default: '' },
  id: { type: String, default: undefined },
  rows: { type: [String, Number], default: 3 },
  placeholder: { type: String, default: '' },
  disabled: Boolean,
  readonly: Boolean,
  required: Boolean,
  error: { type: [String, Boolean], default: false },
  describedBy: { type: String, default: undefined },
});
defineEmits(['update:modelValue', 'change']);
</script>
<style scoped>
.ui-textarea {
  background: rgb(var(--ui-bg));
  color: rgb(var(--ui-fg));
  border: 1px solid rgb(var(--ui-border-strong));
  border-radius: var(--ui-radius-sm);
  padding: var(--ui-space-2) var(--ui-space-3);
  font: inherit;
  font-size: var(--ui-text-md);
  width: 100%;
  min-height: calc(var(--ui-space-6) * 3);
  resize: vertical;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}
.ui-textarea:focus {
  outline: none;
  border-color: rgb(var(--ui-accent));
  box-shadow: 0 0 0 3px rgb(var(--ui-accent) / 0.15);
}
.ui-textarea[aria-invalid="true"] {
  border-color: rgb(var(--ui-danger));
}
.ui-textarea[aria-invalid="true"]:focus {
  box-shadow: 0 0 0 3px rgb(var(--ui-danger) / 0.15);
}
.ui-textarea:disabled {
  opacity: .55;
  cursor: not-allowed;
  background: rgb(var(--ui-surface-2));
}
.ui-textarea::placeholder { color: rgb(var(--ui-faint)); }
</style>
