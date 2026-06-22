<template>
  <UiModal :open="confirmState.open" :title="confirmState.options.title" width="sm" persistent @close="cancel">
    <p class="ui-confirm-msg">{{ confirmState.options.message }}</p>
    <template #footer>
      <UiButton variant="ghost" @click="cancel">{{ confirmState.options.cancelLabel }}</UiButton>
      <UiButton :variant="confirmState.options.danger ? 'danger' : 'primary'" @click="confirm">{{ confirmState.options.confirmLabel }}</UiButton>
    </template>
  </UiModal>
</template>
<script setup>
// Host único da confirmação por promessa. Monte 1x no App.vue: <UiConfirmDialog />
import UiModal from './UiModal.vue';
import UiButton from './UiButton.vue';
import { confirmState, resolveConfirm } from '../composables/useConfirm.js';
const confirm = () => resolveConfirm(true);
const cancel = () => resolveConfirm(false);
</script>
<style scoped>
.ui-confirm-msg { margin: 0; color: rgb(var(--ui-fg)); }
</style>
