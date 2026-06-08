import { useCallback, useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ChevronLeft, ChevronRight, ZoomIn } from 'lucide-react';
import { galleryPhotos, galleryCategories } from '../data/projects';
import { SectionHeading } from './ui';
import { cn, asset } from '../lib/utils';

export default function ProjectsGallery() {
  const [filter, setFilter] = useState<(typeof galleryCategories)[number]>('Todos');
  const [index, setIndex] = useState<number | null>(null);

  const list = useMemo(
    () => (filter === 'Todos' ? galleryPhotos : galleryPhotos.filter((p) => p.category === filter)),
    [filter],
  );

  const close = useCallback(() => setIndex(null), []);
  const prev = useCallback(() => setIndex((i) => (i === null ? i : (i - 1 + list.length) % list.length)), [list.length]);
  const next = useCallback(() => setIndex((i) => (i === null ? i : (i + 1) % list.length)), [list.length]);

  useEffect(() => {
    if (index === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
      else if (e.key === 'ArrowLeft') prev();
      else if (e.key === 'ArrowRight') next();
    };
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [index, close, prev, next]);

  const active = index === null ? null : list[index];

  return (
    <section id="projetos" className="relative py-24">
      <div className="container-wide">
        <SectionHeading
          eyebrow="Galeria de trabalhos"
          title={
            <>
              Fotos que fazem parte da <span className="text-gradient">história da empresa</span>
            </>
          }
          subtitle="Registros reais de obras e terraplanagem, supressão vegetal, britagem, mineração e monitoramento ambiental. Clique para ampliar."
        />

        {/* filtros */}
        <div className="mt-10 flex flex-wrap gap-2">
          {galleryCategories.map((c) => (
            <button
              key={c}
              onClick={() => {
                setFilter(c);
                setIndex(null);
              }}
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
        <motion.div layout className="mt-8 grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-4">
          <AnimatePresence mode="popLayout">
            {list.map((p, i) => (
              <motion.button
                key={p.file}
                layout
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.96 }}
                transition={{ duration: 0.3 }}
                onClick={() => setIndex(i)}
                className="group relative aspect-[4/3] overflow-hidden rounded-2xl border border-white/10 bg-brand-surface"
              >
                <img
                  src={asset('images/' + p.file)}
                  alt={p.alt}
                  loading="lazy"
                  className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/5 to-transparent opacity-80 transition-opacity group-hover:opacity-100" />
                <span className="absolute left-2.5 top-2.5 rounded-full bg-black/45 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white backdrop-blur">
                  {p.category}
                </span>
                <span className="absolute right-2.5 top-2.5 grid h-7 w-7 place-items-center rounded-lg bg-black/45 text-white opacity-0 backdrop-blur transition-opacity group-hover:opacity-100">
                  <ZoomIn className="h-4 w-4" />
                </span>
                <p className="absolute inset-x-3 bottom-2.5 text-xs font-medium text-white/95 drop-shadow line-clamp-2">
                  {p.alt}
                </p>
              </motion.button>
            ))}
          </AnimatePresence>
        </motion.div>

        <p className="mt-6 text-center text-xs text-brand-muted/70">
          {list.length} {list.length === 1 ? 'foto' : 'fotos'} · acervo real de obras e serviços da RM Ambiental
        </p>
      </div>

      {/* lightbox */}
      <AnimatePresence>
        {active && index !== null && (
          <motion.div
            className="fixed inset-0 z-[70] flex items-center justify-center p-4 sm:p-8"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <div className="absolute inset-0 bg-black/85 backdrop-blur-sm" onClick={close} />

            <button
              onClick={close}
              className="absolute right-4 top-4 z-10 grid h-11 w-11 place-items-center rounded-xl bg-white/10 text-white backdrop-blur transition-colors hover:bg-white/20"
              aria-label="Fechar"
            >
              <X className="h-5 w-5" />
            </button>
            <button
              onClick={prev}
              className="absolute left-3 top-1/2 z-10 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-xl bg-white/10 text-white backdrop-blur transition-colors hover:bg-white/20 sm:left-6"
              aria-label="Anterior"
            >
              <ChevronLeft className="h-6 w-6" />
            </button>
            <button
              onClick={next}
              className="absolute right-3 top-1/2 z-10 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-xl bg-white/10 text-white backdrop-blur transition-colors hover:bg-white/20 sm:right-6"
              aria-label="Próxima"
            >
              <ChevronRight className="h-6 w-6" />
            </button>

            <motion.figure
              key={active.file}
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.25 }}
              className="relative z-[1] flex max-h-full max-w-4xl flex-col items-center"
            >
              <img
                src={asset('images/' + active.file)}
                alt={active.alt}
                className="max-h-[78vh] w-auto rounded-xl object-contain shadow-glass"
              />
              <figcaption className="mt-4 text-center">
                <span className="eyebrow">{active.category}</span>
                <p className="mt-2 text-sm text-white/90">{active.alt}</p>
                <p className="mt-1 text-xs text-white/50">
                  {index + 1} / {list.length}
                </p>
              </figcaption>
            </motion.figure>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
