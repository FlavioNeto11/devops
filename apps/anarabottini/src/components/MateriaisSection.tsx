import { motion } from 'framer-motion';
import { Download, ExternalLink, Lock } from 'lucide-react';
import { Reveal, SectionHeading } from './ui';
import { materiais, materialKindLabel } from '../data/materiais';
import { asset } from '../lib/utils';

export default function MateriaisSection() {
  return (
    <section id="materiais" className="relative py-24">
      <div className="container-wide">
        <SectionHeading
          eyebrow="Materiais & recursos"
          title={
            <>
              Conteúdos para <span className="text-gradient">apoiar o seu RH</span>
            </>
          }
          subtitle="Guias, e-books e checklists para ajudar a sua empresa a entender e endereçar os riscos psicossociais da NR-1 — gratuitos, à medida que ficam disponíveis."
        />

        <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {materiais.map((m, i) => {
            const ready = m.available && m.url.trim().length > 0;
            const href = m.kind === 'pdf' ? asset('materiais/' + m.url) : m.url;
            return (
              <Reveal key={m.id} delay={(i % 4) * 0.06}>
                <motion.div
                  whileHover={ready ? { y: -5 } : undefined}
                  transition={{ type: 'spring', stiffness: 260, damping: 22 }}
                  className="flex h-full flex-col rounded-3xl border border-brand-text/10 bg-brand-surface/70 p-6 shadow-card"
                >
                  <span className="grid h-12 w-12 place-items-center rounded-2xl bg-brand-neon/12 ring-1 ring-brand-text/10">
                    <m.icon className="h-6 w-6 text-brand-neon" />
                  </span>
                  <span className="mt-4 inline-flex w-fit rounded-full bg-brand-surface2/80 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-brand-muted">
                    {materialKindLabel[m.kind]}
                  </span>
                  <h3 className="mt-3 font-display text-base font-bold leading-snug text-brand-text">{m.title}</h3>
                  <p className="mt-2 flex-1 text-sm leading-relaxed text-brand-muted">{m.desc}</p>

                  <div className="mt-5">
                    {ready ? (
                      <a
                        href={href}
                        target={m.kind === 'pdf' ? undefined : '_blank'}
                        rel="noopener noreferrer"
                        {...(m.kind === 'pdf' ? { download: '' } : {})}
                        className="inline-flex items-center gap-2 text-sm font-semibold text-brand-neon transition-all hover:gap-2.5"
                      >
                        {m.kind === 'pdf' ? <Download className="h-4 w-4" /> : <ExternalLink className="h-4 w-4" />}
                        {m.kind === 'pdf' ? 'Baixar' : 'Acessar'}
                      </a>
                    ) : (
                      <span className="inline-flex items-center gap-2 text-sm font-medium text-brand-muted/70">
                        <Lock className="h-4 w-4" /> Em breve
                      </span>
                    )}
                  </div>
                </motion.div>
              </Reveal>
            );
          })}
        </div>
      </div>
    </section>
  );
}
