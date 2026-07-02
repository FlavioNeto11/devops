<script setup>
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import Icon from '../../components/Icon.vue';
import { MODULES } from '../../nav';

const route = useRoute();
const mod = computed(() => MODULES.find((m) => route.path.startsWith(m.to)) || { label: 'Módulo', icon: 'folder', phase: '—' });
</script>

<template>
  <div class="ap-page">
    <div class="ap-page-head">
      <h1><Icon :name="mod.icon" :size="22" /> {{ mod.label }}</h1>
      <p>Este módulo entra na fase <b>{{ mod.phase }}</b> da esteira. A fundação (auth, dados, orquestração de IA) já está no ar.</p>
    </div>
    <div class="im-notice">🚧 Tela em construção — será entregue na fase {{ mod.phase }}.</div>
  </div>
</template>
