import { reactive, readonly } from 'vue';

/**
 * Sistema global de notificações (toasts).
 *
 * Uso:
 *   const notify = useNotification();
 *   notify.success('MTR emitido com sucesso.');
 *   notify.error('Falha ao gerar CDF', { detail: 'Tempo esgotado.', code: 'CDF_TIMEOUT' });
 *   notify.warning('Conta CETESB expira em 3 dias.');
 *   notify.info('Job 4321 enfileirado.');
 *
 * Limites:
 *   - Stack máximo de 3 toasts simultâneos. Quando excedido, descarta o mais antigo.
 *   - Auto-dismiss padrão por tone (success 4s, info 5s, warning 7s, error não fecha).
 *   - Toasts dispensáveis manualmente via close button ou notify.dismiss(id).
 */

const MAX_TOASTS = 3;
const DEFAULT_TIMEOUTS = Object.freeze({
  success: 4000,
  info: 5000,
  warning: 7000,
  error: 0
});

const state = reactive({
  toasts: []
});

let idCounter = 0;
function nextId() {
  idCounter += 1;
  return `sicat-toast-${idCounter}`;
}

function push(tone, message, options = {}) {
  if (!message || typeof message !== 'string') {
    return null;
  }

  const id = nextId();
  const timeout = options.timeout ?? DEFAULT_TIMEOUTS[tone] ?? 5000;
  const toast = {
    id,
    tone,
    message,
    detail: options.detail || '',
    code: options.code || '',
    actionLabel: options.actionLabel || '',
    onAction: typeof options.onAction === 'function' ? options.onAction : null,
    timeout,
    createdAt: Date.now()
  };

  state.toasts.push(toast);
  while (state.toasts.length > MAX_TOASTS) {
    state.toasts.shift();
  }

  if (timeout > 0) {
    setTimeout(() => dismiss(id), timeout);
  }

  return id;
}

function dismiss(id) {
  const index = state.toasts.findIndex((toast) => toast.id === id);
  if (index >= 0) {
    state.toasts.splice(index, 1);
  }
}

function dismissAll() {
  state.toasts.splice(0, state.toasts.length);
}

function triggerAction(id) {
  const toast = state.toasts.find((entry) => entry.id === id);
  if (!toast) return;
  if (toast.onAction) {
    try {
      toast.onAction();
    } catch (error) {
      console.error('[useNotification] action handler failed', error);
    }
  }
  dismiss(id);
}

export function useNotification() {
  return {
    toasts: readonly(state.toasts),
    success: (message, options) => push('success', message, options),
    error: (message, options) => push('error', message, options),
    warning: (message, options) => push('warning', message, options),
    info: (message, options) => push('info', message, options),
    notify: (tone, message, options) => push(tone, message, options),
    dismiss,
    dismissAll,
    triggerAction
  };
}
