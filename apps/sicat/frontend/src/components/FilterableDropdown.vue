<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';

const props = defineProps({
  modelValue: {
    type: [String, Number],
    default: ''
  },
  options: {
    type: Array,
    default: () => []
  },
  optionValueKey: {
    type: String,
    default: 'code'
  },
  optionLabelKey: {
    type: String,
    default: 'name'
  },
  optionLabel: {
    type: Function,
    default: null
  },
  searchValue: {
    type: String,
    default: ''
  },
  disabled: {
    type: Boolean,
    default: false
  },
  loading: {
    type: Boolean,
    default: false
  },
  placeholder: {
    type: String,
    default: 'Digite para filtrar'
  },
  emptyText: {
    type: String,
    default: 'Nenhuma opção encontrada.'
  },
  noDataText: {
    type: String,
    default: 'Sem dados para seleção.'
  },
  ariaLabel: {
    type: String,
    default: 'Campo de seleção pesquisável'
  },
  clearable: {
    type: Boolean,
    default: false
  },
  clearAriaLabel: {
    type: String,
    default: 'Limpar campo'
  }
});

const emit = defineEmits(['update:modelValue', 'update:searchValue', 'search-change']);

const isOpen = ref(false);
const hasFocus = ref(false);
const localSearchValue = ref('');
const inputRef = ref(null);
const rootRef = ref(null);
const listRef = ref(null);
const opensUpward = ref(false);

const resolvedSearchValue = computed({
  get() {
    return localSearchValue.value;
  },
  set(nextValue) {
    localSearchValue.value = nextValue;
    emit('update:searchValue', nextValue);
    emit('search-change', nextValue);
  }
});

function normalize(value) {
  return String(value || '')
    .normalize('NFD')
    .replaceAll(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function getOptionValue(option) {
  return String(option?.[props.optionValueKey] ?? '');
}

function getOptionLabel(option) {
  if (props.optionLabel) {
    return String(props.optionLabel(option) || '');
  }

  return String(option?.[props.optionLabelKey] || option?.description || option?.name || getOptionValue(option));
}

const selectedOption = computed(() => {
  const selectedCode = String(props.modelValue || '');
  if (!selectedCode) {
    return null;
  }

  return props.options.find((item) => getOptionValue(item) === selectedCode) || null;
});

const filteredOptions = computed(() => {
  if (!Array.isArray(props.options) || props.options.length === 0) {
    return [];
  }

  const query = normalize(resolvedSearchValue.value.trim());
  if (!query) {
    return props.options.slice(0, 50);
  }

  return props.options
    .filter((item) => {
      const label = normalize(getOptionLabel(item));
      const value = normalize(getOptionValue(item));
      return label.includes(query) || value.includes(query);
    })
    .slice(0, 50);
});

const showClearButton = computed(() => {
  if (!props.clearable || props.disabled) {
    return false;
  }

  return String(resolvedSearchValue.value || '').trim().length > 0;
});

async function updateDropdownPlacement() {
  if (!isOpen.value) {
    opensUpward.value = false;
    return;
  }

  await nextTick();

  const rootElement = rootRef.value;
  const listElement = listRef.value;
  if (!rootElement || !listElement) {
    opensUpward.value = false;
    return;
  }

  const rect = rootElement.getBoundingClientRect();
  const viewportHeight = globalThis.innerHeight || document.documentElement.clientHeight || 0;
  const listHeight = Math.min(listElement.scrollHeight || 0, 260);
  const gap = 6;
  const spaceBelow = viewportHeight - rect.bottom;
  const spaceAbove = rect.top;

  opensUpward.value = spaceBelow < (listHeight + gap) && spaceAbove > spaceBelow;
}

watch(
  () => props.modelValue,
  () => {
    if (hasFocus.value) {
      return;
    }

    if (!selectedOption.value) {
      return;
    }

    localSearchValue.value = getOptionLabel(selectedOption.value);
  },
  { immediate: true }
);

watch(
  () => props.searchValue,
  (nextValue) => {
    if (nextValue !== undefined && nextValue !== null) {
      localSearchValue.value = String(nextValue);
    }
  },
  { immediate: true }
);

watch(isOpen, () => {
  updateDropdownPlacement();
});

watch(filteredOptions, () => {
  updateDropdownPlacement();
});

function handleInput(event) {
  resolvedSearchValue.value = event?.target?.value || '';
  emit('update:modelValue', '');
  isOpen.value = true;
  updateDropdownPlacement();
}

function handleFocus() {
  hasFocus.value = true;
  isOpen.value = true;
  updateDropdownPlacement();
}

function handleBlur() {
  hasFocus.value = false;

  setTimeout(() => {
    isOpen.value = false;

    if (selectedOption.value) {
      localSearchValue.value = getOptionLabel(selectedOption.value);
    }
  }, 120);
}

function selectOption(option) {
  const optionValue = getOptionValue(option);
  emit('update:modelValue', optionValue);

  const nextLabel = getOptionLabel(option);
  localSearchValue.value = nextLabel;
  emit('update:searchValue', nextLabel);
  isOpen.value = false;
}

function clearFieldAndFocus() {
  localSearchValue.value = '';
  emit('update:modelValue', '');
  emit('update:searchValue', '');
  emit('search-change', '');
  isOpen.value = true;

  requestAnimationFrame(() => {
    inputRef.value?.focus?.();
  });
}

function handleViewportChange() {
  updateDropdownPlacement();
}

onMounted(() => {
  globalThis.addEventListener('resize', handleViewportChange);
  globalThis.addEventListener('scroll', handleViewportChange, true);
});

onUnmounted(() => {
  globalThis.removeEventListener('resize', handleViewportChange);
  globalThis.removeEventListener('scroll', handleViewportChange, true);
});
</script>

<template>
  <div ref="rootRef" class="filterable-dropdown" :class="{ 'is-open': isOpen, 'opens-upward': opensUpward }">
    <div class="filterable-dropdown-input-wrap">
      <input
        ref="inputRef"
        class="filterable-dropdown-input"
        :class="{ 'has-clear': showClearButton }"
        type="text"
        :value="resolvedSearchValue"
        :placeholder="placeholder"
        :disabled="disabled"
        :aria-label="ariaLabel"
        autocomplete="off"
        @input="handleInput"
        @focus="handleFocus"
        @blur="handleBlur"
      />

      <button
        v-if="showClearButton"
        type="button"
        class="filterable-dropdown-clear"
        :aria-label="clearAriaLabel"
        @mousedown.prevent
        @click.prevent="clearFieldAndFocus"
      >
        <span aria-hidden="true">×</span>
      </button>
    </div>

    <div v-if="isOpen" ref="listRef" class="filterable-dropdown-list">
      <div v-if="loading" class="filterable-dropdown-state">Carregando...</div>
      <div v-else-if="!options.length" class="filterable-dropdown-state">{{ noDataText }}</div>
      <div v-else-if="!filteredOptions.length" class="filterable-dropdown-state">{{ emptyText }}</div>
      <button
        v-for="item in filteredOptions"
        v-else
        :key="`${optionValueKey}-${getOptionValue(item)}`"
        type="button"
        class="filterable-dropdown-option"
        :class="{ selected: String(modelValue || '') === getOptionValue(item) }"
        @mousedown.prevent="selectOption(item)"
      >
        <span>{{ getOptionLabel(item) }}</span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.filterable-dropdown {
  position: relative;
}

.filterable-dropdown-input {
  width: 100%;
  border-radius: 12px;
  border: 1px solid color-mix(in srgb, var(--color-border) 72%, transparent 28%);
  background: color-mix(in srgb, var(--color-surface-raised) 78%, var(--color-surface) 22%);
  color: var(--color-text);
  min-height: 46px;
  padding: 12px 14px;
  transition: border-color 0.16s ease, box-shadow 0.16s ease, background-color 0.16s ease;
}

.filterable-dropdown-input-wrap {
  position: relative;
}

.filterable-dropdown-input.has-clear {
  padding-right: 38px;
}

.filterable-dropdown-input:hover {
  border-color: var(--color-border-strong);
}

.filterable-dropdown-input:focus {
  border-color: var(--color-primary);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--color-primary) 16%, transparent 84%);
  outline: none;
}

.filterable-dropdown-clear {
  position: absolute;
  top: 50%;
  right: 8px;
  transform: translateY(-50%);
  width: 24px;
  height: 24px;
  border-radius: 999px;
  border: 1px solid color-mix(in srgb, var(--color-border) 72%, transparent 28%);
  background: color-mix(in srgb, var(--color-surface) 92%, var(--color-surface-raised) 8%);
  color: var(--color-text-muted);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  line-height: 1;
  cursor: pointer;
  padding: 0;
}

.filterable-dropdown-clear:hover {
  background: color-mix(in srgb, var(--color-bg-accent) 34%, var(--color-surface) 66%);
  color: var(--color-text);
}

.filterable-dropdown-list {
  position: absolute;
  left: 0;
  right: 0;
  top: calc(100% + 6px);
  border: 1px solid color-mix(in srgb, var(--color-border) 68%, transparent 32%);
  border-radius: 16px;
  background: color-mix(in srgb, var(--color-surface) 94%, transparent 6%);
  box-shadow: var(--shadow-md);
  backdrop-filter: blur(16px);
  z-index: 20;
  max-height: 260px;
  overflow-y: auto;
  padding: 6px;
}

.filterable-dropdown.opens-upward .filterable-dropdown-list {
  top: auto;
  bottom: calc(100% + 6px);
}

.filterable-dropdown-state {
  padding: 8px 10px;
  color: var(--color-text-muted);
  font-size: 0.84rem;
}

.filterable-dropdown-option {
  width: 100%;
  border: 1px solid transparent;
  border-radius: 12px;
  background: transparent;
  color: var(--color-text);
  text-align: left;
  padding: 10px 12px;
  cursor: pointer;
}

.filterable-dropdown-option:hover {
  background: color-mix(in srgb, var(--color-bg-accent) 34%, var(--color-surface) 66%);
  border-color: var(--color-border-strong);
}

.filterable-dropdown-option.selected {
  background: color-mix(in srgb, var(--color-primary) 16%, var(--color-surface) 84%);
  color: var(--color-primary);
  border-color: color-mix(in srgb, var(--color-primary) 44%, var(--color-border) 56%);
}
</style>
