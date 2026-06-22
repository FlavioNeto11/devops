<template>
  <UiPageLayout title="Página não encontrada">
    <UiEmptyState
      title="Não encontramos esta página"
      :description="'O endereço ' + route.fullPath + ' não corresponde a nenhuma tela do ShopDesk.'"
    >
      <template #action>
        <UiButton to="/">Voltar ao painel</UiButton>
      </template>
    </UiEmptyState>
  </UiPageLayout>
</template>
<script setup>
import { useRoute } from 'vue-router';
import { UiPageLayout, UiEmptyState, UiButton } from '../ui/index.js';
const route = useRoute();
</script>
