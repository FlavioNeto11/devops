<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref, useId, watch } from 'vue';

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
  /**
   * Nº mínimo de caracteres antes de a busca (normalmente remota) acontecer.
   * Só com isso o componente consegue distinguir "ainda faltam caracteres" de
   * "a busca rodou e não achou nada" — antes o estado vazio mentia, exibindo
   * "Digite pelo menos 2 caracteres" mesmo com 7 caracteres digitados e a API
   * respondendo 200 com zero resultados.
   */
  minSearchLength: {
    type: Number,
    default: 0
  },
  minSearchText: {
    type: String,
    default: ''
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

const listboxId = `${useId()}-listbox`;
const isOpen = ref(false);
const hasFocus = ref(false);
const localSearchValue = ref('');
const inputRef = ref(null);
const rootRef = ref(null);
const listRef = ref(null);
const opensUpward = ref(false);
/**
 * Índice da opção DESTACADA pelo teclado. Começa (e volta) em -1 de propósito:
 * sem destaque explícito o Enter não escolhe nada. É a garantia de que nenhuma
 * sugestão vira seleção só porque o operador digitou e apertou Enter.
 */
const activeIndex = ref(-1);
/**
 * Âncora do popover em coordenadas de viewport (`position: fixed`).
 *
 * A lista era `position: absolute` dentro do campo, então QUALQUER ancestral com
 * `overflow: hidden` a recortava — e o wizard de MTR fica dentro de um
 * `v-card` (Vuetify aplica `overflow: hidden`) na view hospedeira, além do card
 * do próprio stepper. Resultado: a primeira sugestão aparecia cortada ao meio e
 * as demais sumiam atrás do card "Voltar / Próximo passo". Com `fixed` o
 * elemento é posicionado pelo viewport e deixa de ser recortado por ancestrais;
 * o preço é recalcular a âncora em scroll/resize (já feito abaixo).
 */
const listStyle = ref({});
const LIST_MAX_HEIGHT = 260;
const LIST_MIN_HEIGHT = 120;
const LIST_GAP = 6;

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

/** Ainda faltam caracteres para a busca remota disparar. */
const needsMoreCharacters = computed(() => {
  if (!props.minSearchLength || props.minSearchLength <= 0) {
    return false;
  }

  return String(resolvedSearchValue.value || '').trim().length < props.minSearchLength;
});

const resolvedMinSearchText = computed(() => {
  return props.minSearchText
    || `Digite pelo menos ${props.minSearchLength} caracteres para buscar.`;
});

const showClearButton = computed(() => {
  if (!props.clearable || props.disabled) {
    return false;
  }

  return String(resolvedSearchValue.value || '').trim().length > 0;
});

/**
 * Recalcula a âncora do popover a partir do retângulo do campo. `desiredHeight`
 * é a altura real da lista quando ela já existe no DOM; antes disso usamos o
 * teto para decidir o lado — assim o primeiro frame já sai no lugar certo.
 */
function measureDropdownAnchor(desiredHeight) {
  const rootElement = rootRef.value;
  if (!rootElement) {
    return;
  }

  const rect = rootElement.getBoundingClientRect();
  const viewportHeight = globalThis.innerHeight || document.documentElement.clientHeight || 0;
  const spaceBelow = viewportHeight - rect.bottom - LIST_GAP;
  const spaceAbove = rect.top - LIST_GAP;
  const height = Math.min(desiredHeight || LIST_MAX_HEIGHT, LIST_MAX_HEIGHT);
  const upward = spaceBelow < height && spaceAbove > spaceBelow;
  const available = Math.max(LIST_MIN_HEIGHT, Math.floor(upward ? spaceAbove : spaceBelow));

  opensUpward.value = upward;
  listStyle.value = {
    left: `${Math.round(rect.left)}px`,
    width: `${Math.round(rect.width)}px`,
    maxHeight: `${Math.min(LIST_MAX_HEIGHT, available)}px`,
    ...(upward
      ? { bottom: `${Math.round(viewportHeight - rect.top + LIST_GAP)}px`, top: 'auto' }
      : { top: `${Math.round(rect.bottom + LIST_GAP)}px`, bottom: 'auto' })
  };
}

async function updateDropdownPlacement() {
  if (!isOpen.value) {
    opensUpward.value = false;
    return;
  }

  measureDropdownAnchor();

  await nextTick();

  if (!isOpen.value) {
    return;
  }

  measureDropdownAnchor(listRef.value?.scrollHeight);
}

function optionDomId(index) {
  return `${listboxId}-option-${index}`;
}

function scrollActiveOptionIntoView() {
  nextTick(() => {
    if (activeIndex.value < 0) {
      return;
    }

    const element = listRef.value?.querySelector(`[data-option-index="${activeIndex.value}"]`);
    element?.scrollIntoView?.({ block: 'nearest' });
  });
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

watch(isOpen, (open) => {
  if (!open) {
    activeIndex.value = -1;
  }

  updateDropdownPlacement();
});

watch(filteredOptions, () => {
  // Lista nova = destaque zerado. Nunca herdamos o índice anterior: ele poderia
  // apontar para outro parceiro depois que os resultados mudam.
  activeIndex.value = -1;
  updateDropdownPlacement();
});

function handleInput(event) {
  resolvedSearchValue.value = event?.target?.value || '';
  // Digitar SEMPRE desfaz a seleção: o texto no campo é uma busca, não uma
  // escolha. Só `selectOption` (clique ou Enter numa opção destacada) comita.
  emit('update:modelValue', '');
  activeIndex.value = -1;
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
    activeIndex.value = -1;

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
  activeIndex.value = -1;
  isOpen.value = false;
}

function moveActiveOption(step) {
  const total = filteredOptions.value.length;
  if (total === 0) {
    return;
  }

  if (!isOpen.value) {
    isOpen.value = true;
    updateDropdownPlacement();
  }

  activeIndex.value = activeIndex.value < 0
    ? (step > 0 ? 0 : total - 1)
    : (activeIndex.value + step + total) % total;

  scrollActiveOptionIntoView();
}

/**
 * Teclado: setas destacam, Enter confirma o DESTAQUE.
 *
 * Enter sem destaque (`activeIndex === -1`) não faz nada de propósito — é o que
 * impede que "digitei e apertei Enter" vire "escolhi o primeiro resultado".
 */
function handleKeydown(event) {
  switch (event.key) {
    case 'ArrowDown': {
      event.preventDefault();
      moveActiveOption(1);
      break;
    }

    case 'ArrowUp': {
      event.preventDefault();
      moveActiveOption(-1);
      break;
    }

    case 'Home': {
      if (isOpen.value && filteredOptions.value.length > 0) {
        event.preventDefault();
        activeIndex.value = 0;
        scrollActiveOptionIntoView();
      }

      break;
    }

    case 'End': {
      if (isOpen.value && filteredOptions.value.length > 0) {
        event.preventDefault();
        activeIndex.value = filteredOptions.value.length - 1;
        scrollActiveOptionIntoView();
      }

      break;
    }

    case 'Enter': {
      if (isOpen.value && activeIndex.value >= 0) {
        event.preventDefault();
        selectOption(filteredOptions.value[activeIndex.value]);
      }

      break;
    }

    case 'Escape': {
      if (isOpen.value) {
        event.preventDefault();
        isOpen.value = false;
      }

      break;
    }

    case 'Tab': {
      isOpen.value = false;
      break;
    }

    default: {
      break;
    }
  }
}

function clearFieldAndFocus() {
  localSearchValue.value = '';
  emit('update:modelValue', '');
  emit('update:searchValue', '');
  emit('search-change', '');
  activeIndex.value = -1;
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
        role="combobox"
        aria-autocomplete="list"
        :aria-expanded="isOpen"
        :aria-controls="listboxId"
        :aria-activedescendant="isOpen && activeIndex >= 0 ? optionDomId(activeIndex) : undefined"
        autocomplete="off"
        @input="handleInput"
        @focus="handleFocus"
        @blur="handleBlur"
        @keydown="handleKeydown"
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

    <div
      v-if="isOpen"
      :id="listboxId"
      ref="listRef"
      class="filterable-dropdown-list"
      role="listbox"
      :aria-label="ariaLabel"
      :style="listStyle"
    >
      <div v-if="loading" class="filterable-dropdown-state">Carregando...</div>
      <div v-else-if="needsMoreCharacters" class="filterable-dropdown-state">{{ resolvedMinSearchText }}</div>
      <div v-else-if="!options.length" class="filterable-dropdown-state">{{ noDataText }}</div>
      <div v-else-if="!filteredOptions.length" class="filterable-dropdown-state">{{ emptyText }}</div>
      <button
        v-for="(item, index) in filteredOptions"
        v-else
        :id="optionDomId(index)"
        :key="`${optionValueKey}-${getOptionValue(item)}`"
        type="button"
        role="option"
        class="filterable-dropdown-option"
        :data-option-index="index"
        :aria-selected="String(modelValue || '') === getOptionValue(item)"
        :class="{ selected: String(modelValue || '') === getOptionValue(item), active: activeIndex === index }"
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

/*
  `fixed` (com âncora calculada em JS) e não `absolute`: qualquer ancestral com
  `overflow: hidden` — e o wizard vive dentro de `v-card`s do Vuetify, que têm —
  recortava a lista. Com o viewport como bloco contêiner, o popover deixa de ser
  cortado pelo card e de ser coberto pela barra "Voltar / Próximo passo".
  `z-index` alto pelo mesmo motivo: cada `v-card` é um contexto de empilhamento.
*/
.filterable-dropdown-list {
  position: fixed;
  border: 1px solid color-mix(in srgb, var(--color-border) 68%, transparent 32%);
  border-radius: 16px;
  background: color-mix(in srgb, var(--color-surface) 94%, transparent 6%);
  box-shadow: var(--shadow-md);
  backdrop-filter: blur(16px);
  z-index: 2400;
  max-height: 260px;
  overflow-y: auto;
  padding: 6px;
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

.filterable-dropdown-option:hover,
.filterable-dropdown-option.active {
  background: color-mix(in srgb, var(--color-bg-accent) 34%, var(--color-surface) 66%);
  border-color: var(--color-border-strong);
}

/* Destaque do teclado precisa ser visível por si só (não depende do hover). */
.filterable-dropdown-option.active {
  outline: 2px solid color-mix(in srgb, var(--color-primary) 52%, transparent 48%);
  outline-offset: -2px;
}

.filterable-dropdown-option.selected {
  background: color-mix(in srgb, var(--color-primary) 16%, var(--color-surface) 84%);
  color: var(--color-primary);
  border-color: color-mix(in srgb, var(--color-primary) 44%, var(--color-border) 56%);
}
</style>
