<template>
  <UiPageLayout title="Registros" subtitle="Todos os registros do sistema." :error="r.error.value" @retry="r.load">
    <template #actions><UiButton to="/records/new">Novo registro</UiButton></template>
    <UiDataTable :columns="columns" :rows="r.items.value" :loading="r.loading.value" row-key="id" clickable-rows
      :sort="r.sort.value" @update:sort="r.setSort"
      :empty="{ title: 'Nenhum registro', description: 'Comece criando um novo registro.' }" @row-click="open">
      <template #empty-action><UiButton to="/records/new">Criar registro</UiButton></template>
    </UiDataTable>
    <p v-if="capped" class="list-note ui-muted" role="status">
      Exibindo os primeiros {{ CAP }} registros. Refine a busca para ver os demais.
    </p>
  </UiPageLayout>
</template>
<script setup>
import { computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { UiPageLayout, UiDataTable, UiButton, useResource } from '../ui/index.js';
import { records } from '../api.js';
const router = useRouter();
const CAP = 200; // backend lista no máximo 200 linhas (LIMIT); acima disso o corte é silencioso.
const columns = [{ key: 'id', label: 'ID' }, { key: 'title', label: 'Título', sortable: true }, { key: 'status', label: 'Status', format: 'badge' }];
const r = useResource(records);
const capped = computed(() => !r.loading.value && r.items.value.length >= CAP);
const open = (row) => router.push('/records/' + row.id);
onMounted(r.load);
</script>
<style scoped>
.list-note { margin: var(--ui-space-3) 0 0; font-size: var(--ui-text-sm); }
</style>
