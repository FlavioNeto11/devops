<!-- SINCRONIZADO de packages/ui-vue — NÃO editar aqui; edite o pacote e rode `node build.mjs`. -->
<template>
  <span v-if="prefix" class="ui-input-wrap">
    <span class="ui-input-prefix" aria-hidden="true">{{ prefix }}</span>
    <input
      class="ui-input ui-input--prefixed"
      :type="type"
      :id="id"
      :value="modelValue"
      :placeholder="placeholder"
      :disabled="disabled"
      :readonly="readonly"
      :autocomplete="autocomplete"
      :inputmode="inputmode || undefined"
      :min="min !== undefined && min !== null && min !== '' ? min : undefined"
      :max="max !== undefined && max !== null && max !== '' ? max : undefined"
      :step="step !== undefined && step !== null && step !== '' ? step : undefined"
      :aria-invalid="error ? 'true' : undefined"
      :aria-describedby="describedBy || undefined"
      :aria-required="required ? 'true' : undefined"
      @input="$emit('update:modelValue', $event.target.value)"
      @change="$emit('change', $event.target.value)"
    />
  </span>
  <input
    v-else
    class="ui-input"
    :type="type"
    :id="id"
    :value="modelValue"
    :placeholder="placeholder"
    :disabled="disabled"
    :readonly="readonly"
    :autocomplete="autocomplete"
    :inputmode="inputmode || undefined"
    :min="min !== undefined && min !== null && min !== '' ? min : undefined"
    :max="max !== undefined && max !== null && max !== '' ? max : undefined"
    :step="step !== undefined && step !== null && step !== '' ? step : undefined"
    :aria-invalid="error ? 'true' : undefined"
    :aria-describedby="describedBy || undefined"
    :aria-required="required ? 'true' : undefined"
    @input="$emit('update:modelValue', $event.target.value)"
    @change="$emit('change', $event.target.value)"
  />
</template>
<script setup>
defineProps({
  modelValue: { type: [String, Number], default: '' },
  type: { type: String, default: 'text' },
  id: { type: String, default: undefined },
  placeholder: { type: String, default: '' },
  disabled: Boolean,
  readonly: Boolean,
  required: Boolean,
  autocomplete: { type: String, default: undefined },
  // Native input constraints/hints — bound to the DOM so date/number fields
  // actually enforce limits and trigger the right mobile keyboard.
  inputmode: { type: String, default: undefined },
  min: { type: [String, Number], default: undefined },
  max: { type: [String, Number], default: undefined },
  step: { type: [String, Number], default: undefined },
  error: { type: [String, Boolean], default: false },
  describedBy: { type: String, default: undefined },
  // Inline prefix label (e.g. "R$", "€", "@"). Renders a wrapper + prefix glyph.
  prefix: { type: String, default: undefined },
});
defineEmits(['update:modelValue', 'change']);
</script>
<style scoped>
.ui-input-wrap {
  position: relative;
  display: flex;
  align-items: center;
  width: 100%;
}
.ui-input-prefix {
  position: absolute;
  left: var(--ui-space-3);
  font-size: var(--ui-text-sm);
  font-weight: 600;
  color: rgb(var(--ui-muted));
  pointer-events: none;
  user-select: none;
  z-index: 1;
}
.ui-input {
  background: rgb(var(--ui-bg));
  color: rgb(var(--ui-fg));
  border: 1px solid rgb(var(--ui-border-strong));
  border-radius: var(--ui-radius-sm);
  padding: var(--ui-space-2) var(--ui-space-3);
  font: inherit;
  font-size: var(--ui-text-md);
  width: 100%;
  transition: border-color .15s ease, box-shadow .15s ease;
}
.ui-input--prefixed {
  padding-left: var(--ui-space-6);
}
.ui-input:focus {
  outline: none;
  border-color: rgb(var(--ui-accent));
  box-shadow: 0 0 0 3px rgb(var(--ui-accent) / 0.15);
}
.ui-input[aria-invalid="true"] {
  border-color: rgb(var(--ui-danger));
}
.ui-input[aria-invalid="true"]:focus {
  box-shadow: 0 0 0 3px rgb(var(--ui-danger) / 0.15);
}
.ui-input:disabled {
  opacity: .55;
  cursor: not-allowed;
  background: rgb(var(--ui-surface-2));
}
.ui-input::placeholder { color: rgb(var(--ui-faint)); }
</style>
