<template>
  <div class="ui-dt-wrap">
    <UiErrorState v-if="error" :message="error" @retry="$emit('retry')" />
    <div v-else class="ui-dt-scroll">
      <table class="ui-dt" :data-density="density">
        <thead>
          <tr>
            <th v-if="selectable" class="ui-dt-check" scope="col">
              <input type="checkbox" :checked="allSelected" :aria-label="'Selecionar todos'" @change="toggleAll" />
            </th>
            <th v-for="c in columns" :key="c.key" scope="col" :data-align="c.align || 'left'"
                :data-sortable="c.sortable ? 'true' : null" :aria-sort="ariaSort(c)"
                :tabindex="c.sortable ? 0 : null"
                @click="c.sortable && requestSort(c.key)"
                @keydown.enter="c.sortable && requestSort(c.key)"
                @keydown.space.prevent="c.sortable && requestSort(c.key)">
              <span class="ui-dt-th">{{ c.label }}<span v-if="c.sortable" class="ui-dt-arrow" aria-hidden="true">{{ sortIcon(c.key) }}</span></span>
            </th>
          </tr>
        </thead>
        <tbody v-if="loading">
          <tr v-for="n in 5" :key="'sk' + n" class="ui-dt-skrow">
            <td v-if="selectable" />
            <td v-for="c in columns" :key="c.key"><span class="ui-dt-sk" /></td>
          </tr>
        </tbody>
        <tbody v-else>
          <tr v-for="row in viewRows" :key="row[rowKey]" :data-clickable="clickableRows ? 'true' : null"
              :tabindex="clickableRows ? 0 : null"
              @click="clickableRows && $emit('row-click', row)"
              @keydown.enter.self="clickableRows && $emit('row-click', row)"
              @keydown.space.self.prevent="clickableRows && $emit('row-click', row)">
            <td v-if="selectable" class="ui-dt-check" @click.stop>
              <input type="checkbox" :checked="isSelected(row)" :aria-label="'Selecionar linha'" @change="toggleRow(row)" />
            </td>
            <td v-for="c in columns" :key="c.key" :data-align="c.align || 'left'">
              <slot :name="'cell-' + c.key" :row="row" :value="row[c.key]">
                <UiStatusBadge v-if="c.format === 'badge'" :status="row[c.key]" />
                <span v-else>{{ fmt(row[c.key], c.format) }}</span>
              </slot>
            </td>
          </tr>
        </tbody>
      </table>
      <UiEmptyState v-if="!loading && !viewRows.length" v-bind="empty || {}">
        <template v-if="$slots['empty-action']" #action><slot name="empty-action" /></template>
      </UiEmptyState>
    </div>
    <UiPagination v-if="paginated && total > 0" :page="page" :page-size="pageSize" :total="total"
                  :page-size-options="pageSizeOptions" @update:page="$emit('update:page', $event)"
                  @update:page-size="$emit('update:pageSize', $event)" />
  </div>
</template>
<script setup>
import { computed } from 'vue';
import UiStatusBadge from './UiStatusBadge.vue';
import UiEmptyState from './UiEmptyState.vue';
import UiErrorState from './UiErrorState.vue';
import UiPagination from './UiPagination.vue';
import { formatValue } from '../lib/format.js';

const props = defineProps({
  columns: { type: Array, required: true }, // [{ key, label, align?, sortable?, format? }]
  rows: { type: Array, default: () => [] },
  rowKey: { type: String, default: 'id' },
  loading: Boolean,
  error: { type: [String, Object], default: null },
  empty: { type: Object, default: null },
  density: { type: String, default: 'comfortable' }, // comfortable | compact
  selectable: Boolean,
  selected: { type: Array, default: () => [] },
  clickableRows: Boolean,
  serverMode: Boolean,
  sort: { type: Object, default: null }, // { key, dir }
  page: { type: Number, default: 1 },
  pageSize: { type: Number, default: 25 },
  pageSizeOptions: { type: Array, default: () => [10, 25, 50, 100] },
  total: { type: Number, default: 0 },
  paginated: { type: Boolean, default: false },
});
const emit = defineEmits(['update:selected', 'update:sort', 'update:page', 'update:pageSize', 'row-click', 'retry']);

const fmt = (v, f) => formatValue(v, f);

// ordenação: server-mode só emite; client-mode ordena local.
const viewRows = computed(() => {
  if (props.serverMode || !props.sort || !props.sort.key) return props.rows;
  const { key, dir } = props.sort;
  const mul = dir === 'desc' ? -1 : 1;
  return [...props.rows].sort((a, b) => {
    const x = a[key], y = b[key];
    if (x == null) return 1; if (y == null) return -1;
    return (x > y ? 1 : x < y ? -1 : 0) * mul;
  });
});
function requestSort(key) {
  const cur = props.sort && props.sort.key === key ? props.sort.dir : null;
  const dir = cur === 'asc' ? 'desc' : 'asc';
  emit('update:sort', { key, dir });
}
const sortIcon = (key) => (props.sort && props.sort.key === key ? (props.sort.dir === 'asc' ? '▲' : '▼') : '↕');
const ariaSort = (c) => (!c.sortable ? null : props.sort && props.sort.key === c.key ? (props.sort.dir === 'asc' ? 'ascending' : 'descending') : 'none');

// seleção
const isSelected = (row) => props.selected.some((s) => s[props.rowKey] === row[props.rowKey]);
const allSelected = computed(() => props.rows.length > 0 && props.rows.every(isSelected));
function toggleRow(row) {
  const next = isSelected(row) ? props.selected.filter((s) => s[props.rowKey] !== row[props.rowKey]) : [...props.selected, row];
  emit('update:selected', next);
}
function toggleAll() { emit('update:selected', allSelected.value ? [] : [...props.rows]); }
</script>
<style scoped>
.ui-dt-wrap { display: flex; flex-direction: column; gap: var(--ui-space-3); }
.ui-dt-scroll { overflow-x: auto; background: rgb(var(--ui-surface)); border: 1px solid rgb(var(--ui-border)); border-radius: var(--ui-radius-lg); }
.ui-dt { width: 100%; border-collapse: collapse; font-size: var(--ui-text-sm); }
.ui-dt th, .ui-dt td { text-align: left; padding: 11px 14px; border-bottom: 1px solid rgb(var(--ui-border)); }
.ui-dt[data-density="compact"] th, .ui-dt[data-density="compact"] td { padding: 6px 12px; }
.ui-dt thead th { position: sticky; top: 0; background: rgb(var(--ui-surface-2)); color: rgb(var(--ui-muted)); font-weight: 600; font-size: var(--ui-text-xs); text-transform: uppercase; letter-spacing: .04em; white-space: nowrap; }
.ui-dt th[data-sortable="true"] { cursor: pointer; user-select: none; }
.ui-dt th[data-sortable="true"]:hover { color: rgb(var(--ui-fg)); }
.ui-dt th[data-align="right"], .ui-dt td[data-align="right"] { text-align: right; }
.ui-dt th[data-align="center"], .ui-dt td[data-align="center"] { text-align: center; }
.ui-dt-th { display: inline-flex; align-items: center; gap: 4px; }
.ui-dt-arrow { font-size: 9px; opacity: .7; }
.ui-dt tbody tr:last-child td { border-bottom: none; }
.ui-dt tbody tr[data-clickable="true"] { cursor: pointer; }
.ui-dt tbody tr[data-clickable="true"]:hover { background: rgb(var(--ui-accent) / 0.06); }
.ui-dt-check { width: 40px; }
.ui-dt-sk { display: block; height: 12px; width: 70%; border-radius: var(--ui-radius-sm); background: rgb(var(--ui-surface-2)); }
.ui-dt-skrow td { border-bottom: 1px solid rgb(var(--ui-border)); }
</style>
