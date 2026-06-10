import { motion } from 'framer-motion';
import { Check } from 'lucide-react';
import { palestras } from '../data/palestras';
import { Reveal, SectionHeading } from './ui';

export default function PalestrasSection() {
  return (
    <section id="palestras" className="relative py-24">
      <div className="container-wide">
        <SectionHeading
          eyebrow="Portfólio corporativo"
          title={
            <>
              Palestras que conectam <span className="text-gradient">saúde mental e resultado</span>
            </>
          }
          subtitle="Conteúdos desenhados para RHs, SESMT, gestores e departamentos de pessoas — da prevenção dos riscos psicossociais às campanhas temáticas do calendário corporativo."
        />

        <div className="mt-14 grid gap-6 lg:grid-cols-2">
          {palestras.map((p, i) => (
            <Reveal key={p.id} delay={(i % 2) * 0.08}>
              <motion.div
                whileHover={{ y: -6 }}
                transition={{ type: 'spring', stiffness: 260, damping: 22 }}
                className="group relative flex h-full flex-col overflow-hidden rounded-3xl border border-brand-text/10 bg-brand-surface/70 p-7 shadow-card sm:p-8"
              >
                <div className="absolute right-0 top-0 h-40 w-40 translate-x-12 -translate-y-12 rounded-full bg-brand-terra/10 blur-3xl" />
                <div className="relative">
                  <div className="flex items-start gap-4">
                    <span className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-brand-neon/20 to-brand-terra/20 ring-1 ring-brand-text/10">
                      <p.icon className="h-7 w-7 text-brand-neon" />
                    </span>
                    <div>
                      {p.tag && (
                        <span className="mb-1.5 inline-block rounded-full bg-brand-gold/15 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-brand-goldNeuro">
                          {p.tag}
                        </span>
                      )}
                      <h3 className="font-display text-xl font-bold leading-tight text-brand-text">{p.title}</h3>
                      {p.subtitle && <p className="mt-1 text-sm italic text-brand-muted">{p.subtitle}</p>}
                    </div>
                  </div>

                  <p className="mt-5 text-sm leading-relaxed text-brand-muted">{p.objetivo}</p>

                  <p className="mt-6 text-xs font-bold uppercase tracking-[0.16em] text-brand-muted">
                    {p.temasLabel}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {p.temas.map((t) => (
                      <span
                        key={t}
                        className="rounded-full border border-brand-text/10 bg-brand-surface2/70 px-3 py-1 text-xs text-brand-text"
                      >
                        {t}
                      </span>
                    ))}
                  </div>

                  <p className="mt-6 text-xs font-bold uppercase tracking-[0.16em] text-brand-muted">
                    Benefícios para a empresa
                  </p>
                  <ul className="mt-3 grid gap-2 sm:grid-cols-2">
                    {p.beneficios.map((b) => (
                      <li key={b} className="flex items-start gap-2 text-sm text-brand-muted">
                        <Check className="mt-0.5 h-4 w-4 shrink-0 text-brand-neon/80" />
                        <span>{b}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </motion.div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
