<template>
  <UiAppShell :title="title" :nav="nav" me-url="/contaviva-360/api/me">
    <RouterView />
  </UiAppShell>
  <UiToast />
  <UiConfirmDialog />
</template>
<script setup>
import { RouterView } from 'vue-router';
import { UiAppShell, UiToast, UiConfirmDialog } from './ui/index.js';
import { nav } from './nav.js';
const title = 'ContaViva 360';
</script>
