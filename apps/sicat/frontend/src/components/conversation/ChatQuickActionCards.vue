<script setup>
const props = defineProps({
  items: {
    type: Array,
    default: () => []
  },
  disabled: {
    type: Boolean,
    default: false
  }
});

const emit = defineEmits(['select']);

function onSelect(item) {
  if (props.disabled) {
    return;
  }

  emit('select', item);
}
</script>

<template>
  <div class="quick-pills-row" aria-label="Ações guiadas">
    <button
      v-for="item in items"
      :key="item.id"
      type="button"
      class="quick-pill"
      :disabled="disabled"
      @click="onSelect(item)"
    >
      <v-icon v-if="item.icon" size="13">{{ item.icon }}</v-icon>
      {{ item.title }}
    </button>
  </div>
</template>

<style scoped>
.quick-pills-row {
  display: flex;
  gap: 7px;
  overflow-x: auto;
  padding-bottom: 2px;
  scrollbar-width: none;
}

.quick-pills-row::-webkit-scrollbar {
  display: none;
}

.quick-pill {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 4px 12px;
  min-height: 28px;
  border: 1px solid rgba(var(--v-theme-primary), 0.2);
  border-radius: 999px;
  background: rgba(var(--v-theme-surface), 0.88);
  color: rgba(var(--v-theme-on-surface), 0.84);
  font-size: 0.8rem;
  font-weight: 500;
  white-space: nowrap;
  cursor: pointer;
  transition: border-color 0.14s ease, box-shadow 0.14s ease;
}

.quick-pill:hover:not(:disabled),
.quick-pill:focus-visible {
  border-color: rgba(var(--v-theme-primary), 0.36);
  box-shadow: 0 4px 12px rgba(var(--v-theme-primary), 0.1);
  outline: none;
}

.quick-pill:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
