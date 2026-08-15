<script setup>
import { RouterLink } from 'vue-router';
import { useAuthStore } from '../stores/auth';

const auth = useAuthStore();
</script>

<template>
  <div class="im-shell">
    <header class="im-topbar">
      <RouterLink to="/" class="im-brand"><span class="dot" /> imobia <small>Imobiliária&nbsp;+&nbsp;IA</small></RouterLink>
    </header>
    <main class="im-main nf-wrap">
      <div class="nf-card">
        <div class="nf-code">404</div>
        <h1>Página não encontrada</h1>
        <p>O endereço que você abriu não existe ou foi movido. Verifique o link ou volte para um lugar conhecido.</p>
        <div class="nf-actions">
          <RouterLink v-if="auth.isAuthenticated" to="/app/dashboard" class="im-btn-primary">Ir para o painel</RouterLink>
          <RouterLink to="/" class="im-linkbtn">Voltar ao início</RouterLink>
        </div>
      </div>
    </main>
  </div>
</template>

<style scoped>
.nf-wrap { display: flex; align-items: center; justify-content: center; min-height: 60vh; }
.nf-card { text-align: center; max-width: 440px; padding: 40px 24px; }
.nf-code { font-size: 64px; font-weight: 800; letter-spacing: -0.03em; line-height: 1; background: linear-gradient(120deg, var(--im-accent), var(--im-accent-2)); -webkit-background-clip: text; background-clip: text; color: transparent; }
.nf-card h1 { font-size: 24px; margin: 12px 0 8px; letter-spacing: -0.02em; }
.nf-card p { color: var(--im-muted); margin: 0 0 24px; font-size: 15px; line-height: 1.55; }
.nf-actions { display: flex; gap: 12px; justify-content: center; align-items: center; flex-wrap: wrap; }
</style>
