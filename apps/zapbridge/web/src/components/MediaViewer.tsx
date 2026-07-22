import { useEffect, useRef } from 'react';
import { Message } from '../types';
import { mediaUrl } from '../api/client';

export function MediaViewer({ message, onClose }: { message: Message; onClose: () => void }) {
  const uri = message.media?.id ? mediaUrl(message.media.id) : undefined;
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    // Foco entra no diálogo ao abrir e volta ao elemento anterior ao fechar,
    // para o fluxo de mídia ser alcançável e reversível por teclado. (WCAG 2.4.3)
    const prevFocus = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      prevFocus?.focus?.();
    };
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Visualizador de mídia"
      className="fixed inset-0 z-50 bg-black/90 grid place-items-center"
      onClick={onClose}
    >
      <button
        ref={closeRef}
        onClick={onClose}
        className="absolute top-4 right-5 text-white text-4xl leading-none rounded outline-none focus-visible:ring-2 focus-visible:ring-primary"
        title="Fechar"
        aria-label="Fechar"
      >
        ×
      </button>
      {uri && message.type === 'image' && (
        <img src={uri} className="max-w-[92vw] max-h-[88vh] object-contain" onClick={(e) => e.stopPropagation()} alt="" />
      )}
      {uri && message.type === 'video' && (
        <video src={uri} controls autoPlay className="max-w-[92vw] max-h-[88vh]" onClick={(e) => e.stopPropagation()} />
      )}
      {(!uri || (message.type !== 'image' && message.type !== 'video')) && (
        <div className="text-white/70">Mídia indisponível</div>
      )}
    </div>
  );
}
