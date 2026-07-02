<script setup>
import { computed, onMounted, ref } from 'vue';
import { RouterLink } from 'vue-router';
import Icon from '../../components/Icon.vue';
import { MODULES } from '../../nav';
import { api } from '../../api';
import { useAuthStore } from '../../stores/auth';

const auth = useAuthStore();
const aiStatus = ref(null);
onMounted(async () => { try { aiStatus.value = await api.aiStatus(); } catch { /* noop */ } });

const models = computed(() => [
  { key: 'cortex', label: 'Cortex', role: 'triagem', on: aiStatus.value ? !aiStatus.value.dormant : false, cls: 'tag-cortex' },
  { key: 'gpt', label: 'GPT', role: 'lógica', on: aiStatus.value?.providers?.openai, cls: 'tag-gpt' },
  { key: 'claude', label: 'Claude', role: 'redação', on: aiStatus.value?.providers?.anthropic, cls: 'tag-claude' },
  { key: 'gemini', label: 'Gemini', role: 'documentos', on: aiStatus.value?.providers?.gemini, cls: 'tag-gemini' },
]);
const tiles = MODULES.filter((m) => !['dashboard'].includes(m.key));
</script>

<template>
  <div class="ap-page">
    <div class="ap-page-head">
      <h1>Olá, {{ auth.user?.name?.split(' ')[0] }} 👋</h1>
      <p>{{ auth.organization?.name }} · seu ecossistema imobiliário com IA. Escolha um módulo para começar.</p>
    </div>

    <section class="ap-ai-strip">
      <div class="ap-ai-title"><Icon name="spark" :size="16" /> Orquestra de IAs</div>
      <div class="ap-ai-models">
        <span v-for="m in models" :key="m.key" class="ap-ai-chip" :class="{ off: !m.on }">
          <b :class="m.cls">{{ m.label }}</b><span>{{ m.role }}</span>
          <em :class="m.on ? 'on' : 'dorm'">{{ m.on ? 'ativo' : 'dormente' }}</em>
        </span>
      </div>
      <RouterLink to="/app/assistente" class="ap-ai-cta">Abrir assistente →</RouterLink>
    </section>

    <div class="ap-tiles">
      <RouterLink v-for="m in tiles" :key="m.key" :to="m.to" class="ap-tile">
        <div class="ap-tile-icon"><Icon :name="m.icon" :size="22" /></div>
        <div class="ap-tile-body">
          <strong>{{ m.label }}</strong>
          <span class="ap-tile-phase">{{ m.phase }}</span>
        </div>
      </RouterLink>
    </div>
  </div>
</template>
