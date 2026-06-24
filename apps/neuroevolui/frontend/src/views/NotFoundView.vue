<template>
  <UiPageLayout width="narrow">
    <UiEmptyState title="Página não encontrada" description="O endereço que você abriu não existe." icon="⚲">
      <template #action><UiButton to="/">Ir para o início</UiButton></template>
    </UiEmptyState>
  </UiPageLayout>
</template>
<script setup>
import { UiPageLayout, UiEmptyState, UiButton } from '../ui/index.js';
</script>
