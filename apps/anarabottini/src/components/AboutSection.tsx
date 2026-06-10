import { GraduationCap, Brain, Mic } from 'lucide-react';
import { Reveal } from './ui';
import { InfinityMotif, PortraitCard } from './backgrounds';
import VideoEmbed from './VideoEmbed';
import { site } from '../lib/site';
import { videos } from '../data/videos';

const credenciais = [
  { icon: Brain, label: 'Neuropsicopedagoga' },
  { icon: GraduationCap, label: 'Psicopedagoga Institucional' },
  { icon: Mic, label: 'Palestrante Corporativa' },
];

/** Vídeo de apresentação (só aparece quando há um id real configurado). */
const apresentacao = videos.find((v) => v.featured && v.youtubeId.trim().length > 0);

export default function AboutSection() {
  return (
    <section id="sobre" className="relative overflow-hidden bg-brand-surface2/60 py-24">
      <InfinityMotif className="pointer-events-none absolute -right-10 top-10 h-40 w-80 opacity-30" />
      <div className="container-wide relative">
        <div className="grid items-center gap-12 lg:grid-cols-[0.85fr_1.15fr]">
          {/* Retrato */}
          <Reveal>
            <div className="glass relative mx-auto w-full max-w-xs rounded-[2rem] p-4 shadow-glass lg:max-w-sm">
              <PortraitCard photo={site.photos.about || undefined} />
            </div>
          </Reveal>

          {/* Texto */}
          <div>
            <Reveal>
              <span className="eyebrow">Sobre Ana Rabottini</span>
            </Reveal>
            <Reveal delay={0.05}>
              <h2 className="mt-5 font-display text-3xl font-bold leading-[1.12] tracking-tight text-brand-text sm:text-4xl">
                Desenvolvimento humano com base em <span className="text-gradient">neurociência e educação</span>
              </h2>
            </Reveal>
            <Reveal delay={0.1}>
              <p className="mt-5 max-w-2xl text-base leading-relaxed text-brand-muted sm:text-lg">
                Especialista em desenvolvimento humano, neurodiversidade e estratégias para promoção da
                saúde emocional no ambiente de trabalho. {site.intro}
              </p>
            </Reveal>
            <Reveal delay={0.15}>
              <p className="mt-4 max-w-2xl rounded-2xl border-l-4 border-brand-neon/60 bg-brand-surface/70 px-5 py-4 text-base font-medium leading-relaxed text-brand-text">
                {site.positioning}
              </p>
            </Reveal>

            <div className="mt-7 flex flex-wrap gap-3">
              {credenciais.map((c) => (
                <Reveal key={c.label}>
                  <span className="inline-flex items-center gap-2 rounded-full border border-brand-text/10 bg-brand-surface px-4 py-2 text-sm font-semibold text-brand-text shadow-soft">
                    <c.icon className="h-4 w-4 text-brand-neon" /> {c.label}
                  </span>
                </Reveal>
              ))}
            </div>
          </div>
        </div>

        {/* Vídeo de apresentação (condicional) */}
        {apresentacao && (
          <Reveal>
            <div className="mx-auto mt-14 max-w-3xl">
              <p className="mb-3 text-center text-xs font-bold uppercase tracking-[0.18em] text-brand-muted">
                Apresentação
              </p>
              <VideoEmbed id={apresentacao.youtubeId} title={apresentacao.title} />
            </div>
          </Reveal>
        )}
      </div>
    </section>
  );
}
