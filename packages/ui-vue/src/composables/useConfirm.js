// useConfirm.js — confirmação por PROMESSA (singleton reativo) + composable.
// const ask = useConfirm(); if (await ask({ title, message, danger:true })) { ... }
// O host <UiConfirmDialog/> (montado 1x no App.vue) lê este estado e resolve a promessa.
import { reactive } from 'vue';

export const confirmState = reactive({ open: false, options: {}, _resolve: null });

function ask(options = {}) {
  // se já houver um aberto, resolve-o como cancelado antes de abrir o próximo
  if (confirmState._resolve) { confirmState._resolve(false); }
  return new Promise((resolve) => {
    confirmState.options = {
      title: options.title || 'Confirmar',
      message: options.message || 'Tem certeza?',
      confirmLabel: options.confirmLabel || 'Confirmar',
      cancelLabel: options.cancelLabel || 'Cancelar',
      danger: !!options.danger,
    };
    confirmState._resolve = resolve;
    confirmState.open = true;
  });
}

export function resolveConfirm(value) {
  const r = confirmState._resolve;
  confirmState.open = false;
  confirmState._resolve = null;
  if (r) r(!!value);
}

export function useConfirm() { return ask; }
