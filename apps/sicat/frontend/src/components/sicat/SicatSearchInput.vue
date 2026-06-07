<script setup>
import { ref, watch } from 'vue';

const props = defineProps({
  modelValue: { type: String, default: '' },
  placeholder: { type: String, default: 'Buscar…' },
  label: { type: String, default: '' },
  debounce: { type: Number, default: 300 },
  density: { type: String, default: 'comfortable' },
  disabled: { type: Boolean, default: false },
  clearable: { type: Boolean, default: true }
});

const emit = defineEmits(['update:modelValue', 'search']);

const local = ref(props.modelValue);
let timer = null;

watch(
  () => props.modelValue,
  (value) => {
    if (value !== local.value) local.value = value;
  }
);

function onInput(value) {
  local.value = value ?? '';
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    emit('update:modelValue', local.value);
    emit('search', local.value);
  }, props.debounce);
}

function onEnter() {
  if (timer) clearTimeout(timer);
  emit('update:modelValue', local.value);
  emit('search', local.value);
}
</script>

<template>
  <v-text-field
    :model-value="local"
    :label="label || undefined"
    :placeholder="placeholder"
    :density="density"
    :disabled="disabled"
    :clearable="clearable"
    variant="outlined"
    hide-details="auto"
    prepend-inner-icon="mdi-magnify"
    @update:model-value="onInput"
    @keyup.enter="onEnter"
  />
</template>
