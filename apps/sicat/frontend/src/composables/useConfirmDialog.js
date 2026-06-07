import { ref } from 'vue';

const DEFAULT_TITLE = 'Confirmar ação';
const DEFAULT_CONFIRM_LABEL = 'Confirmar';
const DEFAULT_CANCEL_LABEL = 'Cancelar';

export function useConfirmDialog() {
  const dialogVisible = ref(false);
  const dialogTitle = ref(DEFAULT_TITLE);
  const dialogMessage = ref('');
  const dialogConfirmLabel = ref(DEFAULT_CONFIRM_LABEL);
  const dialogCancelLabel = ref(DEFAULT_CANCEL_LABEL);
  const dialogDanger = ref(false);
  const dialogShowCancel = ref(true);

  let resolveAction = null;

  function resetDialog() {
    dialogVisible.value = false;
    dialogTitle.value = DEFAULT_TITLE;
    dialogMessage.value = '';
    dialogConfirmLabel.value = DEFAULT_CONFIRM_LABEL;
    dialogCancelLabel.value = DEFAULT_CANCEL_LABEL;
    dialogDanger.value = false;
    dialogShowCancel.value = true;
  }

  function resolveAndReset(value) {
    if (resolveAction) {
      resolveAction(value);
      resolveAction = null;
    }
    resetDialog();
  }

  function confirm(options = {}) {
    return new Promise((resolve) => {
      resolveAction = resolve;
      dialogTitle.value = String(options.title || DEFAULT_TITLE).trim() || DEFAULT_TITLE;
      dialogMessage.value = String(options.message || '').trim();
      dialogConfirmLabel.value = String(options.confirmLabel || DEFAULT_CONFIRM_LABEL).trim() || DEFAULT_CONFIRM_LABEL;
      dialogCancelLabel.value = String(options.cancelLabel || DEFAULT_CANCEL_LABEL).trim() || DEFAULT_CANCEL_LABEL;
      dialogDanger.value = Boolean(options.danger);
      dialogShowCancel.value = options.showCancel !== false;
      dialogVisible.value = true;
    });
  }

  function alert(options = {}) {
    return confirm({
      ...options,
      showCancel: false,
      confirmLabel: options.confirmLabel || 'Entendi',
      danger: Boolean(options.danger)
    });
  }

  function accept() {
    resolveAndReset(true);
  }

  function cancel() {
    resolveAndReset(false);
  }

  return {
    dialogVisible,
    dialogTitle,
    dialogMessage,
    dialogConfirmLabel,
    dialogCancelLabel,
    dialogDanger,
    dialogShowCancel,
    confirm,
    alert,
    accept,
    cancel
  };
}
