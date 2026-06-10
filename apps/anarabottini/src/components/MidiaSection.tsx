import { useState } from 'react';
import { Play, Youtube, Instagram, Clapperboard } from 'lucide-react';
import { Reveal, SectionHeading } from './ui';
import VideoLightbox from './VideoLightbox';
import { videos, videoTipoLabel } from '../data/videos';
import { site, hasYoutube, hasInstagram, youtubePoster } from '../lib/site';
import ProposalButton from './ProposalButton';

export default function MidiaSection() {
  const [index, setIndex] = useState<number | null>(null);
  // Só vídeos com id real entram na grade/lightbox (evita cards "play" sem destino).
  const disponiveis = videos.filter((v) => v.youtubeId.trim().length > 0);

  return (
    <section id="midia" className="relative overflow-hidden bg-brand-surface2/60 py-24">
      <div className="container-wide">
        <SectionHeading
          eyebrow="Mídia"
          title={
            <>
              Veja a Ana <span className="text-gradient">em ação</span>
            </>
          }
          subtitle="Trechos de palestras, entrevistas e depoimentos — para você sentir o tom e a abordagem antes de levar à sua empresa."
        />

        {disponiveis.length > 0 ? (
          <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {disponiveis.map((v, i) => {
              const poster = youtubePoster(v.youtubeId);
              return (
                <Reveal key={v.id} delay={(i % 3) * 0.07}>
                  <button
                    type="button"
                    onClick={() => setIndex(i)}
                    className="group relative block aspect-video w-full overflow-hidden rounded-2xl border border-brand-text/10 bg-brand-surface text-left shadow-card"
                  >
                    {poster ? (
                      <img
                        src={poster}
                        alt=""
                        loading="lazy"
                        className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                      />
                    ) : (
                      <span className="absolute inset-0 bg-gradient-to-br from-brand-neon/15 via-brand-terra/12 to-brand-sage/12" />
                    )}
                    <span className="absolute inset-0 bg-gradient-to-t from-brand-ink/65 via-transparent to-transparent" aria-hidden />
                    <span className="absolute left-3 top-3 rounded-full bg-brand-surface/85 px-2.5 py-0.5 text-[11px] font-semibold text-brand-neon">
                      {videoTipoLabel[v.tipo]}
                    </span>
                    <span className="absolute inset-0 grid place-items-center">
                      <span className="grid h-14 w-14 place-items-center rounded-full bg-brand-neon/95 text-brand-onNeon shadow-glow transition-transform duration-200 group-hover:scale-110">
                        <Play className="h-6 w-6 translate-x-0.5" fill="currentColor" />
                      </span>
                    </span>
                    <span className="absolute inset-x-3 bottom-3 line-clamp-2 text-sm font-semibold text-white">
                      {v.title}
                    </span>
                  </button>
                </Reveal>
              );
            })}
          </div>
        ) : (
          <Reveal>
            <div className="mt-12 overflow-hidden rounded-3xl border border-brand-text/10 bg-brand-surface/70 p-8 text-center shadow-card sm:p-12">
              <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-brand-neon/12 text-brand-neon">
                <Clapperboard className="h-7 w-7" />
              </span>
              <h3 className="mt-5 font-display text-xl font-bold text-brand-text">Vídeos em breve</h3>
              <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-brand-muted">
                Em breve, trechos de palestras, entrevistas e depoimentos estarão disponíveis aqui.
                Enquanto isso, fale comigo{hasYoutube || hasInstagram ? ' ou acompanhe os conteúdos nas redes' : ''}.
              </p>
              <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
                <ProposalButton label="Solicitar proposta" />
                {hasYoutube && (
                  <a href={site.media.youtube} target="_blank" rel="noopener noreferrer" className="btn-ghost">
                    <Youtube className="h-4 w-4" /> YouTube
                  </a>
                )}
                {hasInstagram && (
                  <a href={site.social.instagram} target="_blank" rel="noopener noreferrer" className="btn-ghost">
                    <Instagram className="h-4 w-4" /> Instagram
                  </a>
                )}
              </div>
            </div>
          </Reveal>
        )}
      </div>

      <VideoLightbox videos={disponiveis} index={index} onClose={() => setIndex(null)} onIndex={setIndex} />
    </section>
  );
}
