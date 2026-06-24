<template>
  <UiAppShell :title="title" :nav="nav" me-url="/forjademo/api/me">
    <RouterView />
  </UiAppShell>
  <UiToast />
  <UiConfirmDialog />
</template>
<script setup>
import { RouterView } from 'vue-router';
import { UiAppShell, UiToast, UiConfirmDialog } from './ui/index.js';
import { nav } from './nav.js';
const title = 'Forja Demo';
</script>
