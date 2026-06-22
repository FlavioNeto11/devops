<template>
  <div class="ui-pg">
    <label class="ui-pg-size">
      <span class="ui-muted">Por página</span>
      <select :value="pageSize" @change="$emit('update:pageSize', Number($event.target.value))">
        <option v-for="o in pageSizeOptions" :key="o" :value="o">{{ o }}</option>
      </select>
    </label>
    <div class="ui-pg-nav">
      <span class="ui-muted" aria-live="polite">{{ rangeStart }}–{{ rangeEnd }} de {{ total }}</span>
      <button class="ui-btn" data-variant="ghost" data-size="sm" :disabled="page <= 1" @click="$emit('update:page', page - 1)">‹ Anterior</button>
      <button class="ui-btn" data-variant="ghost" data-size="sm" :disabled="page >= pages" @click="$emit('update:page', page + 1)">Próxima ›</button>
    </div>
  </div>
</template>
<script setup>
import { computed } from 'vue';
const props = defineProps({
  page: { type: Number, default: 1 },
  pageSize: { type: Number, default: 25 },
  total: { type: Number, default: 0 },
  pageSizeOptions: { type: Array, default: () => [10, 25, 50, 100] },
});
defineEmits(['update:page', 'update:pageSize']);
const pages = computed(() => Math.max(1, Math.ceil(props.total / props.pageSize)));
const rangeStart = computed(() => (props.total === 0 ? 0 : (props.page - 1) * props.pageSize + 1));
const rangeEnd = computed(() => Math.min(props.page * props.pageSize, props.total));
</script>
<style scoped>
.ui-pg { display: flex; align-items: center; justify-content: space-between; gap: var(--ui-space-4); flex-wrap: wrap; font-size: var(--ui-text-sm); }
.ui-pg-size { display: inline-flex; align-items: center; gap: var(--ui-space-2); }
.ui-pg-size select { background: rgb(var(--ui-surface)); color: rgb(var(--ui-fg)); border: 1px solid rgb(var(--ui-border-strong)); border-radius: var(--ui-radius-sm); padding: 4px 8px; font: inherit; }
.ui-pg-nav { display: flex; align-items: center; gap: var(--ui-space-3); }
</style>
