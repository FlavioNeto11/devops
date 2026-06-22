<template>
  <div class="shell">
    <header class="topbar">
      <span class="brand">TeamFlow — Operação de Equipes</span>
      <nav aria-label="Navegação principal">
        <RouterLink to="/">Painel</RouterLink>
        <RouterLink to="/records">Registros</RouterLink>
      </nav>
    </header>
    <main class="content"><slot /></main>
  </div>
</template>
<script setup>
import { RouterLink } from 'vue-router';
</script>
