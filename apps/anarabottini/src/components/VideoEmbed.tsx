import { useState } from 'react';
import { Play, Clapperboard } from 'lucide-react';
import { youtubeEmbed, youtubePoster } from '../lib/site';
import { cn } from '../lib/utils';

/**
 * Player de YouTube com carregamento preguiçoso: mostra um poster com botão de
 * play e só insere o <iframe> após o clique (performance). Se `id` estiver vazio,
 * exibe um estado "vídeo em breve" — sem player quebrado.
 */
export default function VideoEmbed({
  id,
  title,
  className,
}: {
  id: string;
  title: string;
  className?: string;
}) {
  const [playing, setPlaying] = useState(false);
  const embed = youtubeEmbed(id, { autoplay: true });
  const poster = youtubePoster(id);

  const frame = cn('relative aspect-video w-full overflow-hidden rounded-2xl', className);

  if (!embed) {
    return (
      <div className={frame}>
        <div className="grid h-full w-full place-items-center bg-gradient-to-br from-brand-neon/15 via-brand-terra/12 to-brand-sage/12">
          <div className="text-center">
            <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-brand-surface/80 text-brand-neon shadow-soft">
              <Clapperboard className="h-6 w-6" />
            </span>
            <p className="mt-3 text-xs font-semibold uppercase tracking-[0.22em] text-brand-muted">Vídeo em breve</p>
          </div>
        </div>
      </div>
    );
  }

  if (playing) {
    return (
      <div className={frame}>
        <iframe
          src={embed}
          title={title}
          loading="lazy"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          className="absolute inset-0 h-full w-full"
        />
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setPlaying(true)}
      aria-label={`Reproduzir vídeo: ${title}`}
      className={cn(frame, 'group block')}
    >
      {poster && (
        <img
          src={poster}
          alt=""
          loading="lazy"
          className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
        />
      )}
      <span className="absolute inset-0 bg-gradient-to-t from-brand-ink/55 via-transparent to-transparent" aria-hidden />
      <span className="absolute inset-0 grid place-items-center">
        <span className="grid h-16 w-16 place-items-center rounded-full bg-brand-neon/95 text-brand-onNeon shadow-glow transition-transform duration-200 group-hover:scale-110">
          <Play className="h-7 w-7 translate-x-0.5" fill="currentColor" />
        </span>
      </span>
    </button>
  );
}
