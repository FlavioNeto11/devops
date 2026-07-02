// SINCRONIZADO de packages/ui-vue — NÃO editar aqui; edite o pacote e rode `node build.mjs`.
// useToast.js — fila de toasts global (singleton reativo) + composable.
// useToast() -> { success, error, warning, info, notify, dismiss, dismissAll, items }
import { reactive } from 'vue';

const TIMEOUTS = { success: 4000, info: 5000, warning: 7000, error: 0 }; // error = pega até fechar
const state = reactive({ items: [] });
let seq = 0;

function push(tone, message, opts = {}) {
  const id = ++seq;
  const item = { id, tone, message: message || '', detail: opts.detail || '', code: opts.code || '', actionLabel: opts.actionLabel || '', onAction: opts.onAction || null };
  state.items.push(item);
  if (state.items.length > 4) state.items.splice(0, state.items.length - 4);
  const ms = opts.timeout !== undefined ? opts.timeout : TIMEOUTS[tone];
  if (ms > 0) setTimeout(() => dismiss(id), ms);
  return id;
}
function dismiss(id) { const i = state.items.findIndex((t) => t.id === id); if (i >= 0) state.items.splice(i, 1); }
function dismissAll() { state.items.splice(0); }

export function useToast() {
  return {
    items: state.items,
    notify: (tone, msg, opts) => push(tone, msg, opts),
    success: (msg, opts) => push('success', msg, opts),
    error: (msg, opts) => push('error', msg, opts),
    warning: (msg, opts) => push('warning', msg, opts),
    info: (msg, opts) => push('info', msg, opts),
    dismiss,
    dismissAll,
  };
}
