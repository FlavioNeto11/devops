<template>
  <section>
    <h1>Registros</h1>
    <form class="new" @submit.prevent="create">
      <label for="t">Novo registro</label>
      <input id="t" v-model="title" placeholder="título" required />
      <button class="btn" type="submit">Criar</button>
    </form>
    <StateBlock :loading="loading" :error="error" :empty="!rows.length" empty-text="Nenhum registro ainda.">
      <DataTable :columns="columns" :rows="rows" />
    </StateBlock>
  </section>
</template>
<script setup>
import { ref, onMounted } from 'vue';
import StateBlock from '../components/StateBlock.vue';
import DataTable from '../components/DataTable.vue';
import { records } from '../api.js';
const columns = [{ key: 'id', label: 'ID' }, { key: 'title', label: 'Título' }, { key: 'status', label: 'Status' }];
const loading = ref(true), error = ref(""), rows = ref([]), title = ref("");
async function load() { loading.value = true; try { rows.value = await records.list(); } catch (e) { error.value = e.message; } finally { loading.value = false; } }
async function create() { if (!title.value) return; try { await records.create({ title: title.value }); title.value = ""; await load(); } catch (e) { error.value = e.message; } }
onMounted(load);
</script>
