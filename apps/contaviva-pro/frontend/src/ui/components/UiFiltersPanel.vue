<!-- SINCRONIZADO de packages/ui-vue — NÃO editar aqui; edite o pacote e rode `node build.mjs`. -->
<template>
  <form class="ui-filters" role="search" @submit.prevent="apply">
    <div v-for="f in fields" :key="f.key" class="ui-filters-field">
      <label :for="'flt-' + f.key" class="ui-filters-label">{{ f.label }}</label>
      <select v-if="f.type === 'select'" :id="'flt-' + f.key" :value="model[f.key] ?? ''" @change="set(f.key, $event.target.value)">
        <option value="">Todos</option>
        <option v-for="o in f.options || []" :key="optVal(o)" :value="optVal(o)">{{ optLabel(o) }}</option>
      </select>
      <input v-else :id="'flt-' + f.key" :type="f.type === 'date' ? 'date' : 'text'" :value="model[f.key] ?? ''"
             :placeholder="f.placeholder || ''" @input="set(f.key, $event.target.value)" />
    </div>
    <div class="ui-filters-actions">
      <button class="ui-btn" data-variant="primary" data-size="sm" type="submit">Filtrar</button>
      <button class="ui-btn" data-variant="ghost" data-size="sm" type="button" @click="clear">Limpar</button>
    </div>
  </form>
</template>
<script setup>
import { reactive, watch } from 'vue';
const props = defineProps({
  modelValue: { type: Object, default: () => ({}) },
  fields: { type: Array, default: () => [] }, // [{ key, label, type:text|select|date, options?, placeholder? }]
});
const emit = defineEmits(['update:modelValue', 'apply', 'clear']);
const model = reactive({ ...props.modelValue });
watch(() => props.modelValue, (v) => Object.assign(model, v || {}));
const optVal = (o) => (typeof o === 'object' ? o.value : o);
const optLabel = (o) => (typeof o === 'object' ? o.label : o);
function set(key, val) { model[key] = val; emit('update:modelValue', { ...model }); }
function apply() { emit('apply', { ...model }); }
function clear() { for (const k of Object.keys(model)) model[k] = ''; emit('update:modelValue', { ...model }); emit('clear'); }
</script>
<style scoped>
.ui-filters { display: flex; align-items: flex-end; gap: var(--ui-space-3); flex-wrap: wrap; background: rgb(var(--ui-surface)); border: 1px solid rgb(var(--ui-border)); border-radius: var(--ui-radius-lg); padding: var(--ui-space-4); }
.ui-filters-field { display: flex; flex-direction: column; gap: 4px; }
.ui-filters-label { font-size: var(--ui-text-xs); color: rgb(var(--ui-muted)); font-weight: 600; }
.ui-filters-field input, .ui-filters-field select { background: rgb(var(--ui-bg)); color: rgb(var(--ui-fg)); border: 1px solid rgb(var(--ui-border-strong)); border-radius: var(--ui-radius-sm); padding: 7px 10px; font: inherit; min-width: 160px; }
.ui-filters-actions { display: flex; gap: var(--ui-space-2); margin-left: auto; }
</style>
