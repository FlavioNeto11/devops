<template>
  <table class="dt">
    <thead><tr><th v-for="c in columns" :key="c.key" scope="col">{{ c.label }}</th></tr></thead>
    <tbody>
      <tr v-for="row in rows" :key="row.id">
        <td v-for="c in columns" :key="c.key">{{ row[c.key] }}</td>
      </tr>
    </tbody>
  </table>
</template>
<script setup>
defineProps({ columns: { type: Array, required: true }, rows: { type: Array, default: () => [] } });
</script>
