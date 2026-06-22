<template>
  <UiPageLayout width="narrow">
    <UiEmptyState
      title="Acesso restrito"
      description="Esta área é exclusiva da administração e supervisão do service desk. Fale com um administrador se precisar de acesso."
      icon="⛒"
    >
      <template #action><UiButton to="/">Voltar ao painel</UiButton></template>
    </UiEmptyState>
  </UiPageLayout>
</template>
<script setup>
import { UiPageLayout, UiEmptyState, UiButton } from '../ui/index.js';
</script>
