<script setup>
import { computed, onMounted, ref } from 'vue';
import { api } from '../api';

const meta = ref(null);
const error = ref('');
const loading = ref(true);

const AI_ROLES = [
  { key: 'cortex', label: 'Cortex', role: 'triagem rápida', cls: 'tag-cortex' },
  { key: 'gpt', label: 'GPT', role: 'lógica / dados', cls: 'tag-gpt' },
  { key: 'claude', label: 'Claude', role: 'redação / análise', cls: 'tag-claude' },
  { key: 'gemini', label: 'Gemini', role: 'documentos / visão', cls: 'tag-gemini' },
];

onMounted(async () => {
  try {
    meta.value = await api.meta();
  } catch (e) {
    error.value = e.message || 'falha ao carregar';
  } finally {
    loading.value = false;
  }
});

const aiStatus = computed(() => meta.value?.ai || {});
const modules = computed(() => meta.value?.modules || []);

function badgeCls(ai) {
  return `im-badge tag-${ai}`;
}
</script>

<template>
  <section class="im-hero">
    <h1>Do lead à escritura, com uma <span class="grad">orquestra de IAs</span>.</h1>
    <p>
      imobia é um ecossistema imobiliário + fintech onde o WhatsApp é o eixo central e quatro modelos
      atuam como funcionários especializados: <b>Cortex</b> tria, <b>GPT</b> executa a lógica,
      <b>Claude</b> redige laudos e cartas, <b>Gemini</b> lê documentos e fotos.
    </p>

    <div class="im-ai-legend">
      <div v-for="r in AI_ROLES" :key="r.key" class="im-ai-chip">
        <b :class="r.cls">{{ r.label }}</b>
        <span class="role">· {{ r.role }}</span>
        <span class="status" :class="aiStatus[r.key] ? 'on' : 'off'">
          {{ aiStatus[r.key] ? 'ativo' : 'dormente' }}
        </span>
      </div>
    </div>
  </section>

  <h2 class="im-section-title">Módulos</h2>

  <div v-if="loading" class="im-notice">Carregando módulos…</div>
  <div v-else-if="error" class="im-notice err">Erro ao carregar /meta: {{ error }}</div>

  <div v-else class="im-grid">
    <article v-for="m in modules" :key="m.key" class="im-card">
      <div class="head">
        <h3>{{ m.name }}</h3>
        <span class="phase">{{ m.phase }}</span>
      </div>
      <p>{{ m.summary }}</p>
      <div class="ai-row">
        <span v-for="a in m.ai" :key="a" :class="badgeCls(a)">{{ a }}</span>
      </div>
    </article>
  </div>
</template>
