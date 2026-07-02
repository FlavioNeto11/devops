import { useEffect } from 'react';
import { Message } from '../types';
import { mediaUrl } from '../api/client';

export function MediaViewer({ message, onClose }: { message: Message; onClose: () => void }) {
  const uri = message.media?.id ? mediaUrl(message.media.id) : undefined;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 bg-black/90 grid place-items-center" onClick={onClose}>
      <button onClick={onClose} className="absolute top-4 right-5 text-white text-4xl leading-none" title="Fechar">
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
