<script setup>
import { computed, ref } from 'vue';

const props = defineProps({
  title: { type: String, default: 'Filtros' },
  /**
   * Chips de filtros ativos: [{ key, label }]. O X de cada chip emite @remove(key).
   */
  activeChips: { type: Array, default: () => [] },
  /** Painel inicia recolhido? Por padrão abre se houver filtros ativos. */
  collapsible: { type: Boolean, default: true },
  loading: { type: Boolean, default: false },
  /** Mostra botão "Aplicar" explícito. */
  showApply: { type: Boolean, default: true },
  applyLabel: { type: String, default: 'Buscar' },
  clearLabel: { type: String, default: 'Limpar' }
});

const emit = defineEmits(['apply', 'clear', 'remove']);

const open = ref(!props.collapsible || props.activeChips.length > 0);
const hasActiveChips = computed(() => props.activeChips.length > 0);

function toggle() {
  if (props.collapsible) open.value = !open.value;
}
</script>

<template>
  <section class="sicat-filters-panel">
    <header class="sicat-filters-panel__head">
      <button
        type="button"
        class="sicat-filters-panel__toggle"
        :aria-expanded="open"
        @click="toggle"
      >
        <v-icon size="18">mdi-filter-variant</v-icon>
        <span>{{ title }}</span>
        <v-chip v-if="hasActiveChips" size="x-small" color="primary" variant="tonal">
          {{ activeChips.length }}
        </v-chip>
        <v-icon v-if="collapsible" size="18" class="sicat-filters-panel__chevron" :data-open="open">
          mdi-chevron-down
        </v-icon>
      </button>

      <button
        v-if="hasActiveChips"
        type="button"
        class="sicat-filters-panel__clear"
        @click="emit('clear')"
      >
        <v-icon size="14">mdi-close-circle-outline</v-icon>
        {{ clearLabel }} tudo
      </button>
    </header>

    <div v-if="hasActiveChips" class="sicat-filters-panel__chips">
      <v-chip
        v-for="chip in activeChips"
        :key="chip.key"
        size="small"
        variant="tonal"
        closable
        @click:close="emit('remove', chip.key)"
      >
        {{ chip.label }}
      </v-chip>
    </div>

    <v-expand-transition>
      <div v-show="open" class="sicat-filters-panel__body">
        <div class="sicat-filters-panel__fields">
          <slot />
        </div>

        <div class="sicat-filters-panel__actions">
          <slot name="actions">
            <v-btn variant="text" :disabled="loading" @click="emit('clear')">{{ clearLabel }}</v-btn>
            <v-btn
              v-if="showApply"
              color="primary"
              variant="flat"
              :loading="loading"
              @click="emit('apply')"
            >
              {{ applyLabel }}
            </v-btn>
          </slot>
        </div>
      </div>
    </v-expand-transition>
  </section>
</template>

<style scoped>
.sicat-filters-panel {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  padding: var(--space-4);
  border: 1px solid rgba(var(--v-border-color), 0.16);
  border-radius: var(--radius-md);
  background: rgb(var(--v-theme-surface));
}

.sicat-filters-panel__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.sicat-filters-panel__toggle {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  background: transparent;
  border: none;
  cursor: pointer;
  font-size: 0.95rem;
  font-weight: 700;
  color: rgba(var(--v-theme-on-surface), 0.85);
}

.sicat-filters-panel__chevron {
  transition: transform 0.2s ease;
}

.sicat-filters-panel__chevron[data-open='true'] {
  transform: rotate(180deg);
}

.sicat-filters-panel__clear {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  background: transparent;
  border: none;
  cursor: pointer;
  font-size: 0.82rem;
  font-weight: 600;
  color: rgba(var(--v-theme-primary), 0.95);
}

.sicat-filters-panel__chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.sicat-filters-panel__body {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.sicat-filters-panel__fields {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: var(--space-3);
}

.sicat-filters-panel__actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
}
</style>
