<template>
  <UiAppShell title="ShopDesk" :nav="nav" me-url="/shopdesk/api/me">
    <slot />
  </UiAppShell>
</template>
<script setup>
import { UiAppShell } from '../ui/index.js';
import { nav } from '../nav.js';
</script>
