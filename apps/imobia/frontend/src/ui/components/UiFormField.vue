<!-- SINCRONIZADO de packages/ui-vue — NÃO editar aqui; edite o pacote e rode `node build.mjs`. -->
<script>
// contador de id em ESCOPO DE MÓDULO (roda 1x) — garante id único por instância.
let _seq = 0;
export function nextFieldId() { return 'uif-' + (++_seq); }
</script>
<script setup>
import { computed } from 'vue';
const props = defineProps({
  label: String, required: Boolean, hint: String,
  error: { type: [String, Boolean], default: '' },
  id: { type: String, default: '' },
  fullWidth: Boolean,
});
const uid = nextFieldId();
const fieldId = computed(() => props.id || uid);
const describedBy = computed(() => (props.error ? fieldId.value + '-err' : props.hint ? fieldId.value + '-hint' : undefined));
</script>
<template>
  <div class="ui-field" :data-full="fullWidth ? 'true' : null">
    <label v-if="label" :for="fieldId" class="ui-field-label">
      {{ label }}<span v-if="required" class="ui-field-req" aria-hidden="true"> *</span>
    </label>
    <slot :id="fieldId" :has-error="!!error" :described-by="describedBy" />
    <p v-if="error" :id="fieldId + '-err'" class="ui-field-error" role="alert">{{ error }}</p>
    <p v-else-if="hint" :id="fieldId + '-hint'" class="ui-field-hint">{{ hint }}</p>
  </div>
</template>
<style scoped>
.ui-field { display: flex; flex-direction: column; gap: 5px; }
.ui-field[data-full="true"] { grid-column: 1 / -1; }
.ui-field-label { font-size: var(--ui-text-sm); font-weight: 600; color: rgb(var(--ui-fg)); }
.ui-field-req { color: rgb(var(--ui-danger)); }
.ui-field-error { margin: 0; font-size: var(--ui-text-xs); color: rgb(var(--ui-danger)); }
.ui-field-hint { margin: 0; font-size: var(--ui-text-xs); color: rgb(var(--ui-muted)); }
.ui-field :deep(input), .ui-field :deep(select), .ui-field :deep(textarea) {
  background: rgb(var(--ui-bg)); color: rgb(var(--ui-fg)); border: 1px solid rgb(var(--ui-border-strong));
  border-radius: var(--ui-radius-sm); padding: 8px 11px; font: inherit; width: 100%;
}
.ui-field :deep(textarea) { min-height: 90px; resize: vertical; }
</style>
