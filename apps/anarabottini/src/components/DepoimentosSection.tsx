import { Quote } from 'lucide-react';
import { Reveal, SectionHeading } from './ui';
import { depoimentos, marcas, hasDepoimentos, hasMarcas } from '../data/depoimentos';
import { asset } from '../lib/utils';

/**
 * Prova social — OPT-IN. Só renderiza quando há depoimentos ou marcas REAIS
 * cadastrados em src/data/depoimentos.ts (nada inventado).
 */
export default function DepoimentosSection() {
  if (!hasDepoimentos && !hasMarcas) return null;

  return (
    <section id="depoimentos" className="relative py-24">
      <div className="container-wide">
        <SectionHeading
          center
          eyebrow="Quem já viveu"
          title={
            <>
              O que dizem sobre o <span className="text-gradient">trabalho da Ana</span>
            </>
          }
        />

        {hasDepoimentos && (
          <div className="mt-12 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {depoimentos.map((d, i) => (
              <Reveal key={d.id} delay={(i % 3) * 0.07}>
                <figure className="h-full rounded-3xl border border-brand-text/10 bg-brand-surface/70 p-7 shadow-card">
                  <Quote className="h-7 w-7 text-brand-neon/50" />
                  <blockquote className="mt-4 text-sm leading-relaxed text-brand-text">“{d.quote}”</blockquote>
                  <figcaption className="mt-5 text-sm">
                    <span className="font-display font-bold text-brand-text">{d.author}</span>
                    {d.role && <span className="block text-brand-muted">{d.role}</span>}
                  </figcaption>
                </figure>
              </Reveal>
            ))}
          </div>
        )}

        {hasMarcas && (
          <div className="mt-12 flex flex-wrap items-center justify-center gap-8 opacity-80">
            {marcas.map((m) =>
              m.logo ? (
                <img key={m.name} src={asset('images/marcas/' + m.logo)} alt={m.name} className="h-9 w-auto" />
              ) : (
                <span key={m.name} className="font-display text-lg font-bold text-brand-muted">
                  {m.name}
                </span>
              ),
            )}
          </div>
        )}
      </div>
    </section>
  );
}
