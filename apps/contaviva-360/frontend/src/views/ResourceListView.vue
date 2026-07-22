<template>
  <UiPageLayout title="Registros" subtitle="Todos os registros do sistema." :error="r.error.value" @retry="r.load">
    <template #actions><UiButton to="/records/new">Novo registro</UiButton></template>
    <UiDataTable :columns="columns" :rows="r.items.value" :loading="r.loading.value" row-key="id" clickable-rows
      :sort="sort" @update:sort="s => (sort = s)"
      :empty="{ title: 'Nenhum registro', description: 'Comece criando um novo registro.' }" @row-click="open">
      <template #empty-action><UiButton to="/records/new">Criar registro</UiButton></template>
    </UiDataTable>
  </UiPageLayout>
</template>
<script setup>
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { UiPageLayout, UiDataTable, UiButton, useResource } from '../ui/index.js';
import { records } from '../api.js';
const router = useRouter();
const columns = [{ key: 'id', label: 'ID' }, { key: 'title', label: 'Título', sortable: true }, { key: 'status', label: 'Status', format: 'badge' }];
const r = useResource(records);
// Ordenação client-side sobre as linhas já carregadas (UX-CV360-011): torna funcional o cabeçalho
// marcado como sortable sem depender de suporte a sort no backend.
const sort = ref(null);
const open = (row) => router.push('/records/' + row.id);
onMounted(r.load);
</script>
