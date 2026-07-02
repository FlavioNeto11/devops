<script setup>
import { onMounted, ref } from 'vue';
import { RouterLink, RouterView } from 'vue-router';
import { api } from '../api';
import { useAuthStore } from '../stores/auth';

const auth = useAuthStore();
const health = ref(null);
onMounted(async () => { try { health.value = await api.health(); } catch { /* noop */ } });
</script>

<template>
  <div class="im-shell">
    <header class="im-topbar">
      <RouterLink to="/" class="im-brand"><span class="dot" /> imobia <small>Imobiliária&nbsp;+&nbsp;IA</small></RouterLink>
      <nav class="im-nav">
        <RouterLink to="/">Início</RouterLink>
        <RouterLink to="/arquitetura">Arquitetura</RouterLink>
      </nav>
      <div class="im-spacer" />
      <span v-if="health" class="im-pill ok"><span class="led" /> API · {{ health.phase }}</span>
      <RouterLink v-if="auth.isAuthenticated" to="/app" class="im-login-link">Abrir painel</RouterLink>
      <RouterLink v-else to="/login" class="im-login-link">Entrar</RouterLink>
    </header>
    <main class="im-main"><RouterView /></main>
    <footer class="im-footer">imobia · plataforma DevOps local (nvit) · fundação em fases · IA fail-soft (dorme sem chaves)</footer>
  </div>
</template>
