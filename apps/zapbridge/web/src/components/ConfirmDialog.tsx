import { ReactNode, useEffect, useRef } from 'react';

// Diálogo de confirmação acessível (tema escuro). Usado para ações destrutivas
// que precisam de intenção explícita — ex.: desconectar o aparelho (expurga
// dados de IA). role=dialog + aria-modal, foco gerido, Escape cancela, foco
// preso enquanto aberto e devolvido ao fechar.
export function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  danger = false,
  busy = false,
  error,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  children: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  busy?: boolean;
  error?: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const titleId = useRef(`confirm-title-${Math.random().toString(36).slice(2)}`).current;

  // Ao abrir: guarda o foco anterior, foca o botão Cancelar (padrão seguro para
  // ação destrutiva) e devolve o foco ao elemento anterior ao fechar.
  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    cancelRef.current?.focus();
    return () => previouslyFocused?.focus?.();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) {
        e.stopPropagation();
        onCancel();
        return;
      }
      // Prende o foco (Tab/Shift+Tab) dentro do diálogo.
      if (e.key === 'Tab') {
        const focusables = dialogRef.current?.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        );
        if (!focusables || focusables.length === 0) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [open, busy, onCancel]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 grid place-items-center px-6"
      onClick={() => {
        if (!busy) onCancel();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="w-full max-w-sm rounded-2xl bg-surface border border-line p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id={titleId} className="text-white text-lg font-semibold">
          {title}
        </h2>
        <div className="text-muted text-sm mt-2 leading-relaxed">{children}</div>

        {error && <div className="text-danger text-sm mt-3">{error}</div>}

        <div className="flex justify-end gap-2 mt-5">
          <button
            ref={cancelRef}
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="rounded-xl px-4 py-2.5 text-sm font-semibold text-white bg-surfaceAlt hover:bg-line outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className={`rounded-xl px-4 py-2.5 text-sm font-bold outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-60 ${
              danger ? 'bg-danger text-white' : 'bg-primary text-bg'
            }`}
          >
            {busy ? 'Processando…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
