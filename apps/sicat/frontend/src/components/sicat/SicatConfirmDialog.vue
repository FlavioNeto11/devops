<script setup>
const props = defineProps({
  visible: { type: Boolean, default: false },
  title: { type: String, default: 'Confirmar ação' },
  message: { type: String, default: '' },
  confirmLabel: { type: String, default: 'Confirmar' },
  cancelLabel: { type: String, default: 'Cancelar' },
  danger: { type: Boolean, default: false },
  showCancel: { type: Boolean, default: true }
});

const emit = defineEmits(['confirm', 'cancel', 'close']);

function handleCancel() {
  emit('cancel');
}

function handleConfirm() {
  emit('confirm');
}

function handleClose(value) {
  if (!value) {
    emit('close');
  }
}
</script>

<template>
  <v-dialog
    :model-value="props.visible"
    max-width="480"
    persistent
    role="dialog"
    aria-modal="true"
    @update:model-value="handleClose"
  >
    <v-card :title="props.title" rounded="lg">
      <v-card-text class="sicat-confirm-dialog__message">{{ props.message }}</v-card-text>
      <v-card-actions class="justify-end">
        <v-btn v-if="props.showCancel" variant="text" @click="handleCancel">
          {{ props.cancelLabel }}
        </v-btn>
        <v-btn
          :color="props.danger ? 'error' : 'primary'"
          variant="flat"
          @click="handleConfirm"
        >
          {{ props.confirmLabel }}
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<style scoped>
.sicat-confirm-dialog__message {
  font-size: 0.95rem;
  line-height: 1.5;
  color: rgba(var(--v-theme-on-surface), 0.85);
  white-space: pre-line;
}
</style>
