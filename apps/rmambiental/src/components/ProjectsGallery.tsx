import { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MapPin, X, ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { projects, projectCategories, type Project } from '../data/projects';
import { Reveal, SectionHeading } from './ui';
import { cn, asset } from '../lib/utils';

export default function ProjectsGallery() {
  const [filter, setFilter] = useState<(typeof projectCategories)[number]>('Todos');
  const [active, setActive] = useState<Project | null>(null);

  const filtered = useMemo(
    () => (filter === 'Todos' ? projects : projects.filter((p) => p.category === filter)),
    [filter],
  );

  return (
    <section id="projetos" className="relative py-24">
      <div className="container-wide">
        <SectionHeading
          eyebrow="Projetos & Galeria"
          title={
            <>
              Fotos que fazem parte da <span className="text-gradient">história da empresa</span>
            </>
          }
          subtitle="Frentes reais de atuação em campo, obras e estudos ambientais. Clique para ver os detalhes."
        />

        {/* filtros */}
        <div className="mt-10 flex flex-wrap gap-2">
          {projectCategories.map((c) => (
            <button
              key={c}
              onClick={() => setFilter(c)}
              className={cn(
                'rounded-full border px-4 py-2 text-sm font-medium transition-all',
                filter === c
                  ? 'border-brand-neon/40 bg-brand-neon/15 text-brand-neon'
                  : 'border-white/10 text-brand-muted hover:border-white/25 hover:text-white',
              )}
            >
              {c}
            </button>
          ))}
        </div>

        {/* grid */}
        <motion.div layout className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          <AnimatePresence mode="popLayout">
            {filtered.map((p) => (
              <motion.button
                key={p.id}
                layout
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.96 }}
                transition={{ duration: 0.3 }}
                onClick={() => setActive(p)}
                className="group overflow-hidden rounded-2xl border border-white/10 bg-brand-surface/60 text-left transition-colors hover:border-brand-neon/30"
              >
                <div className="relative h-44 overflow-hidden">
                  <img
                    src={asset('images/' + p.image)}
                    alt={p.title}
                    loading="lazy"
                    className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/10 to-transparent" />
                  <span className="absolute left-3 top-3 rounded-full bg-black/50 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-white backdrop-blur">
                    {p.category}
                  </span>
                  <h3 className="absolute inset-x-3 bottom-3 font-display text-base font-bold leading-snug text-white drop-shadow">
                    {p.title}
                  </h3>
                </div>
                <div className="p-5">
                  <p className="flex items-center gap-1.5 text-xs text-brand-muted">
                    <MapPin className="h-3.5 w-3.5" /> {p.location}
                  </p>
                  <p className="mt-1 text-xs font-medium text-brand-neon/90">{p.service}</p>
                </div>
              </motion.button>
            ))}
          </AnimatePresence>
        </motion.div>
      </div>

      {/* modal */}
      <AnimatePresence>
        {active && (
          <motion.div
            className="fixed inset-0 z-[60] grid place-items-center p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <div className="absolute inset-0 bg-black/75 backdrop-blur-sm" onClick={() => setActive(null)} />
            <motion.div
              initial={{ opacity: 0, y: 24, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 24, scale: 0.97 }}
              className="relative w-full max-w-lg overflow-hidden rounded-3xl border border-white/10 bg-brand-surface shadow-glass"
            >
              <div className="relative h-52 overflow-hidden">
                <img src={asset('images/' + active.image)} alt={active.title} className="h-full w-full object-cover" />
                <div className="absolute inset-0 bg-gradient-to-t from-brand-surface via-transparent to-transparent" />
                <button
                  onClick={() => setActive(null)}
                  className="absolute right-3 top-3 grid h-9 w-9 place-items-center rounded-lg bg-black/50 text-white backdrop-blur transition-colors hover:bg-black/70"
                  aria-label="Fechar"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              <div className="p-7">
                <span className="eyebrow">{active.category}</span>
                <h3 className="mt-4 font-display text-xl font-bold text-white">{active.title}</h3>
                <p className="mt-1 flex items-center gap-1.5 text-sm text-brand-muted">
                  <MapPin className="h-4 w-4" /> {active.location}
                </p>
                <p className="mt-4 text-sm leading-relaxed text-brand-muted">{active.summary}</p>
                <p className="mt-4 text-sm font-semibold text-brand-neon">{active.service}</p>
                <Link to="/contato" className="btn-primary mt-6 w-full">
                  Falar sobre um projeto assim <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
