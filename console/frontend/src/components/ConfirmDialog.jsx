import React, { useState } from 'react';
import Modal from './Modal.jsx';

/**
 * Diálogo de confirmação estilizado (substitui window.confirm). `onConfirm` pode ser
 * async; em caso de erro, o diálogo permanece aberto (o chamador mostra o toast).
 */
export default function ConfirmDialog({
  title = 'Confirmar ação',
  message,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  danger = false,
  onConfirm,
  onClose,
}) {
  const [busy, setBusy] = useState(false);
  const confirm = async () => {
    setBusy(true);
    try {
      await onConfirm?.();
      onClose?.();
    } catch {
      /* mantém aberto; erro é reportado pelo chamador (toast) */
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      title={title}
      onClose={busy ? () => {} : onClose}
      size="sm"
      footer={(
        <>
          <button className="btn" onClick={onClose} disabled={busy}>{cancelLabel}</button>
          <button
            className={`btn ${danger ? 'btn--danger' : 'btn--primary'}`}
            onClick={confirm}
            disabled={busy}
            aria-busy={busy}
          >
            {busy ? 'Processando…' : confirmLabel}
          </button>
        </>
      )}
    >
      <p style={{ margin: 0, lineHeight: 1.55 }}>{message}</p>
    </Modal>
  );
}
