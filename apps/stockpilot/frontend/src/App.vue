<template>
  <UiAppShell :title="title" :nav="nav" me-url="/stockpilot/api/me">
    <RouterView />
  </UiAppShell>
  <UiToast />
  <UiConfirmDialog />
</template>
<script setup>
import { RouterView } from 'vue-router';
import { UiAppShell, UiToast, UiConfirmDialog } from './ui/index.js';
import { nav } from './nav.js';
const title = 'StockPilot — Reposicao de Estoque';
</script>
