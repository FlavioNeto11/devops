<template>
  <UiAppShell :title="title" :nav="nav" me-url="/helpflow/api/me">
    <RouterView />
  </UiAppShell>
  <UiToast />
  <UiConfirmDialog />
</template>
<script setup>
import { RouterView } from 'vue-router';
import { UiAppShell, UiToast, UiConfirmDialog } from './ui/index.js';
import { nav } from './nav.js';
const title = 'HelpFlow - Service Desk';
</script>
