import { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, ArrowRight } from 'lucide-react';
import { palestras, palestraCategorias, type Palestra, type PalestraFiltro } from '../data/palestras';
import { Reveal, SectionHeading } from './ui';
import { cn } from '../lib/utils';
import PalestraModal from './PalestraModal';

export default function PalestrasSection() {
  const [filtro, setFiltro] = useState<PalestraFiltro>('todas');
  const [selected, setSelected] = useState<Palestra | null>(null);

  const lista = useMemo(
    () => (filtro === 'todas' ? palestras : palestras.filter((p) => p.categoria === filtro)),
    [filtro],
  );

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
          subtitle="Conteúdos para RHs, SESMT, gestores e departamentos de pessoas — da prevenção dos riscos psicossociais às campanhas temáticas. Clique para ver detalhes, vídeos e materiais."
        />

        {/* filtro por categoria */}
        <Reveal>
          <div className="mt-10 flex flex-wrap gap-2.5">
            {palestraCategorias.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setFiltro(c.id)}
                aria-pressed={filtro === c.id}
                className={cn(
                  'rounded-full border px-4 py-2 text-sm font-medium transition-all',
                  filtro === c.id
                    ? 'border-brand-neon/40 bg-brand-neon/15 text-brand-neon'
                    : 'border-brand-text/12 text-brand-muted hover:border-brand-text/25 hover:text-brand-text',
                )}
              >
                {c.label}
              </button>
            ))}
          </div>
        </Reveal>

        <motion.div layout className="mt-10 grid gap-6 lg:grid-cols-2">
          <AnimatePresence mode="popLayout">
            {lista.map((p, i) => (
              <motion.button
                key={p.id}
                type="button"
                layout
                onClick={() => setSelected(p)}
                initial={{ opacity: 0, y: 18 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.97 }}
                transition={{ duration: 0.35, delay: (i % 2) * 0.05 }}
                whileHover={{ y: -6 }}
                className="group relative flex h-full flex-col overflow-hidden rounded-3xl border border-brand-text/10 bg-brand-surface/70 p-7 text-left shadow-card sm:p-8"
              >
                <div className="absolute right-0 top-0 h-40 w-40 translate-x-12 -translate-y-12 rounded-full bg-brand-terra/10 blur-3xl" />
                <div className="relative">
                  <div className="flex items-start gap-4">
                    <span className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-brand-neon/20 to-brand-terra/20 ring-1 ring-brand-text/10">
                      <p.icon className="h-7 w-7 text-brand-neon" />
                    </span>
                    <div>
                      {p.tag && (
                        <span className="mb-1.5 inline-block rounded-full bg-brand-neon/12 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-brand-neon">
                          {p.tag}
                        </span>
                      )}
                      <h3 className="font-display text-xl font-bold leading-tight text-brand-text">{p.title}</h3>
                      {p.subtitle && <p className="mt-1 text-sm italic text-brand-muted">{p.subtitle}</p>}
                    </div>
                  </div>

                  <p className="mt-5 text-sm leading-relaxed text-brand-muted">{p.objetivo}</p>

                  <div className="mt-5 flex flex-wrap gap-2">
                    {p.temas.slice(0, 4).map((t) => (
                      <span
                        key={t}
                        className="rounded-full border border-brand-text/10 bg-brand-surface2/70 px-3 py-1 text-xs text-brand-text"
                      >
                        {t}
                      </span>
                    ))}
                    {p.temas.length > 4 && (
                      <span className="rounded-full px-2 py-1 text-xs text-brand-muted">+{p.temas.length - 4}</span>
                    )}
                  </div>

                  <ul className="mt-5 grid gap-2 sm:grid-cols-2">
                    {p.beneficios.slice(0, 4).map((b) => (
                      <li key={b} className="flex items-start gap-2 text-sm text-brand-muted">
                        <Check className="mt-0.5 h-4 w-4 shrink-0 text-brand-neon/80" />
                        <span>{b}</span>
                      </li>
                    ))}
                  </ul>

                  <span className="mt-6 inline-flex items-center gap-1.5 text-sm font-semibold text-brand-neon transition-all group-hover:gap-2.5">
                    Ver detalhes <ArrowRight className="h-4 w-4" />
                  </span>
                </div>
              </motion.button>
            ))}
          </AnimatePresence>
        </motion.div>
      </div>

      <PalestraModal palestra={selected} onClose={() => setSelected(null)} />
    </section>
  );
}
