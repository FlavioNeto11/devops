import { useEffect, useRef, type ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '../lib/utils';

type ModalProps = {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  label?: string;
  onPrev?: () => void;
  onNext?: () => void;
  size?: 'lg' | 'xl';
  className?: string;
};

/**
 * Modal genérico (base de PalestraModal e VideoLightbox). Extrai a mecânica do
 * lightbox do rmambiental: AnimatePresence, trava de scroll do body, Esc/setas,
 * clique no backdrop e botão de fechar. Acessível (role=dialog, foco inicial).
 */
export default function Modal({ open, onClose, children, label, onPrev, onNext, size = 'lg', className }: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  // Callbacks via ref para o efeito depender só de `open` (evita re-disparo a cada render).
  const cb = useRef({ onClose, onPrev, onNext });
  cb.current = { onClose, onPrev, onNext };

  useEffect(() => {
    if (!open) return;
    const prevFocused = document.activeElement as HTMLElement | null;

    const focusables = () =>
      Array.from(
        panelRef.current?.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ) ?? [],
      ).filter((el) => el.offsetParent !== null);

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') return cb.current.onClose();
      if (e.key === 'ArrowLeft') return cb.current.onPrev?.();
      if (e.key === 'ArrowRight') return cb.current.onNext?.();
      if (e.key === 'Tab') {
        const f = focusables();
        if (f.length === 0) {
          e.preventDefault();
          panelRef.current?.focus();
          return;
        }
        const first = f[0];
        const last = f[f.length - 1];
        const active = document.activeElement;
        if (e.shiftKey && (active === first || active === panelRef.current)) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && active === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    const t = setTimeout(() => panelRef.current?.focus(), 30);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
      clearTimeout(t);
      prevFocused?.focus?.(); // devolve o foco ao elemento que abriu o modal
    };
  }, [open]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[70] flex items-center justify-center p-4 sm:p-6"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          <div className="absolute inset-0 bg-brand-ink/70 backdrop-blur-sm" onClick={onClose} aria-hidden />

          {onPrev && (
            <button
              onClick={onPrev}
              aria-label="Anterior"
              className="absolute left-3 top-1/2 z-10 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full bg-white/90 text-brand-ink shadow-soft transition-transform hover:scale-105 sm:left-6"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
          )}
          {onNext && (
            <button
              onClick={onNext}
              aria-label="Próximo"
              className="absolute right-3 top-1/2 z-10 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full bg-white/90 text-brand-ink shadow-soft transition-transform hover:scale-105 sm:right-6"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          )}

          <motion.div
            ref={panelRef}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-label={label}
            onClick={(e) => e.stopPropagation()}
            initial={{ opacity: 0, scale: 0.96, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 8 }}
            transition={{ duration: 0.22, ease: [0.22, 0.61, 0.36, 1] }}
            className={cn(
              'relative max-h-[90vh] w-full overflow-y-auto rounded-3xl border border-brand-text/10 bg-brand-surface shadow-glass outline-none',
              size === 'xl' ? 'max-w-4xl' : 'max-w-2xl',
              className,
            )}
          >
            <button
              onClick={onClose}
              aria-label="Fechar"
              className="absolute right-4 top-4 z-10 grid h-9 w-9 place-items-center rounded-full border border-brand-text/10 bg-brand-surface/90 text-brand-text transition-colors hover:border-brand-neon/40 hover:text-brand-neon"
            >
              <X className="h-4 w-4" />
            </button>
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
