<template>
  <section>
    <RouterLink to="/records">← Registros</RouterLink>
    <StateBlock :loading="loading" :error="error">
      <h1>Registro #{{ rec.id }}</h1>
      <dl class="kv"><dt>Título</dt><dd>{{ rec.title }}</dd><dt>Status</dt><dd>{{ rec.status }}</dd></dl>
    </StateBlock>
  </section>
</template>
<script setup>
import { ref, onMounted } from 'vue';
import { RouterLink } from 'vue-router';
import StateBlock from '../components/StateBlock.vue';
import { records } from '../api.js';
const props = defineProps({ id: String });
const loading = ref(true), error = ref(""), rec = ref({});
onMounted(async () => { try { rec.value = await records.get(props.id); } catch (e) { error.value = e.message; } finally { loading.value = false; } });
</script>
