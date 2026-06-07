<script setup>
import { computed, useId } from 'vue';

const props = defineProps({
  label: { type: String, default: '' },
  required: { type: Boolean, default: false },
  /** Mensagem de erro. Quando preenchida, exibe em vermelho abaixo do campo. */
  error: { type: [String, Boolean, null], default: null },
  hint: { type: String, default: '' },
  /** Faz o campo ocupar a largura total da grade (column span). */
  fullWidth: { type: Boolean, default: false }
});

const fieldId = useId();
const errorText = computed(() => (typeof props.error === 'string' ? props.error : ''));
const hasError = computed(() => Boolean(props.error));
</script>

<template>
  <div class="sicat-form-field" :data-full="fullWidth ? 'true' : 'false'">
    <label v-if="label" :for="fieldId" class="sicat-form-field__label">
      {{ label }}
      <span v-if="required" class="sicat-form-field__required" aria-hidden="true">*</span>
    </label>

    <div class="sicat-form-field__control">
      <slot :id="fieldId" :has-error="hasError" />
    </div>

    <p v-if="hasError && errorText" class="sicat-form-field__error" role="alert">{{ errorText }}</p>
    <p v-else-if="hint" class="sicat-form-field__hint">{{ hint }}</p>
  </div>
</template>

<style scoped>
.sicat-form-field {
  display: grid;
  gap: 6px;
  min-width: 0;
}

.sicat-form-field[data-full='true'] {
  grid-column: 1 / -1;
}

.sicat-form-field__label {
  font-size: 0.8rem;
  font-weight: 700;
  letter-spacing: 0.02em;
  color: rgba(var(--v-theme-on-surface), 0.7);
}

.sicat-form-field__required {
  color: rgb(var(--v-theme-error));
  margin-left: 2px;
}

.sicat-form-field__error {
  margin: 0;
  font-size: 0.78rem;
  color: rgb(var(--v-theme-error));
}

.sicat-form-field__hint {
  margin: 0;
  font-size: 0.78rem;
  color: rgba(var(--v-theme-on-surface), 0.55);
}
</style>
