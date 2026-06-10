import { useEffect, useState } from 'react';
import Modal from './Modal';
import VideoEmbed from './VideoEmbed';
import { videoTipoLabel, type Video } from '../data/videos';

/**
 * Lightbox de vídeos: abre o vídeo selecionado num Modal, com navegação
 * anterior/próximo (setas do teclado também). Mantém o último vídeo visível
 * durante a animação de saída.
 */
export default function VideoLightbox({
  videos,
  index,
  onClose,
  onIndex,
}: {
  videos: Video[];
  index: number | null;
  onClose: () => void;
  onIndex: (i: number) => void;
}) {
  const [shown, setShown] = useState<Video | null>(index === null ? null : videos[index]);
  useEffect(() => {
    if (index !== null) setShown(videos[index]);
  }, [index, videos]);

  const hasNav = videos.length > 1;
  const prev = () => index !== null && onIndex((index - 1 + videos.length) % videos.length);
  const next = () => index !== null && onIndex((index + 1) % videos.length);

  return (
    <Modal
      open={index !== null}
      onClose={onClose}
      label={shown?.title}
      size="xl"
      onPrev={hasNav ? prev : undefined}
      onNext={hasNav ? next : undefined}
    >
      {shown && (
        <div>
          {/* key força remount ao trocar de vídeo (reseta o estado "playing") */}
          <VideoEmbed key={shown.id} id={shown.youtubeId} title={shown.title} className="rounded-b-none" />
          <div className="flex items-center justify-between gap-4 p-5 sm:p-6">
            <h3 className="font-display text-base font-bold text-brand-text sm:text-lg">{shown.title}</h3>
            <span className="shrink-0 rounded-full bg-brand-neon/12 px-3 py-1 text-xs font-semibold text-brand-neon">
              {videoTipoLabel[shown.tipo]}
            </span>
          </div>
        </div>
      )}
    </Modal>
  );
}
