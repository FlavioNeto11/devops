import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowRight, Check } from 'lucide-react';
import { serviceGroups } from '../data/services';
import { Reveal, SectionHeading } from './ui';

export default function ServicesSection() {
  return (
    <section id="solucoes" className="relative py-24">
      <div className="container-wide">
        <div className="flex flex-col items-start justify-between gap-6 lg:flex-row lg:items-end">
          <SectionHeading
            eyebrow="Soluções"
            title={
              <>
                Quatro frentes integradas para o seu <span className="text-gradient">projeto ambiental</span>
              </>
            }
            subtitle="Reorganizamos um portfólio técnico extenso em frentes claras — para você encontrar com rapidez a solução certa, do licenciamento à operação."
          />
          <Reveal>
            <Link to="/solucoes" className="btn-ghost shrink-0">
              Ver todas as soluções <ArrowRight className="h-4 w-4" />
            </Link>
          </Reveal>
        </div>

        <div className="mt-14 grid gap-6 lg:grid-cols-2">
          {serviceGroups.map((g, i) => (
            <Reveal key={g.id} delay={i * 0.08}>
              <motion.div
                whileHover={{ y: -6 }}
                transition={{ type: 'spring', stiffness: 260, damping: 22 }}
                className="group relative h-full overflow-hidden rounded-3xl border border-white/10 bg-brand-surface/60 p-7 shadow-card sm:p-8"
              >
                <div className="absolute right-0 top-0 h-40 w-40 translate-x-12 -translate-y-12 rounded-full bg-brand-petrolLight/10 blur-3xl transition-opacity duration-300 group-hover:opacity-100" />
                <div className="relative">
                  <div className="flex items-center gap-4">
                    <span className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-brand-neon/20 to-brand-petrol/30 ring-1 ring-white/10">
                      <g.icon className="h-7 w-7 text-brand-neon" />
                    </span>
                    <div>
                      <h3 className="font-display text-xl font-bold leading-tight text-white">{g.title}</h3>
                      <p className="mt-1 text-sm text-brand-muted">{g.tagline}</p>
                    </div>
                  </div>

                  <ul className="mt-6 grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {g.items.slice(0, 6).map((item) => (
                      <li key={item} className="flex items-start gap-2 text-sm text-brand-muted">
                        <Check className="mt-0.5 h-4 w-4 shrink-0 text-brand-neon/80" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>

                  <Link
                    to={`/solucoes#${g.id}`}
                    className="mt-7 inline-flex items-center gap-1.5 text-sm font-semibold text-brand-neon transition-all hover:gap-2.5"
                  >
                    Ver detalhes <ArrowRight className="h-4 w-4" />
                  </Link>
                </div>
              </motion.div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
