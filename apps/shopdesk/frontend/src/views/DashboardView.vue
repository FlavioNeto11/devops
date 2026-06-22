<template>
  <section>
    <h1>Painel</h1>
    <StateBlock :loading="loading" :error="error">
      <div class="cards">
        <div class="card"><span class="big">{{ total }}</span><span>registros</span></div>
        <div class="card"><span class="big">{{ live ? 'no ar' : '—' }}</span><span>API</span></div>
      </div>
      <RouterLink class="btn" to="/records">Ver registros →</RouterLink>
    </StateBlock>
  </section>
</template>
<script setup>
import { ref, onMounted } from 'vue';
import { RouterLink } from 'vue-router';
import StateBlock from '../components/StateBlock.vue';
import { records, health } from '../api.js';
const loading = ref(true), error = ref(""), total = ref(0), live = ref(false);
onMounted(async () => {
  try { await health(); live.value = true; const rs = await records.list(); total.value = (rs || []).length; }
  catch (e) { error.value = e.message; } finally { loading.value = false; }
});
</script>
