import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowRight, Compass, ShieldCheck, Users, MapPin } from 'lucide-react';
import { GridGlow, CoverageMap } from './backgrounds';
import { asset } from '../lib/utils';

const floating = [
  { icon: MapPin, label: 'Atuação nacional', top: '8%', left: '-4%' },
  { icon: Users, label: 'Equipe multidisciplinar', top: '40%', right: '-6%' },
  { icon: ShieldCheck, label: 'Licenciamento e regularização', bottom: '6%', left: '6%' },
];

export default function Hero() {
  return (
    <section id="inicio" className="relative overflow-hidden pt-[72px]">
      <div className="absolute inset-0" aria-hidden>
        <img src={asset('images/hero.jpg')} alt="" className="h-full w-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-b from-brand-bg/90 via-brand-bg/82 to-brand-bg" />
        <div className="absolute inset-0 bg-gradient-to-r from-brand-bg via-brand-bg/55 to-transparent" />
      </div>
      <GridGlow />

      <div className="container-wide relative grid items-center gap-14 py-20 lg:grid-cols-[1.05fr_0.95fr] lg:py-28">
        {/* Texto */}
        <div>
          <motion.span
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="eyebrow"
          >
            <Compass className="h-3.5 w-3.5" /> Engenharia · Meio ambiente · Regularização
          </motion.span>

          <motion.h1
            initial={{ opacity: 0, y: 22 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.06 }}
            className="mt-6 font-display text-4xl font-extrabold leading-[1.05] tracking-tight text-white sm:text-5xl lg:text-[3.4rem]"
          >
            Engenharia, licenciamento e soluções ambientais para{' '}
            <span className="text-gradient">projetos complexos</span> em todo o Brasil.
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 22 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.14 }}
            className="mt-6 max-w-xl text-base leading-relaxed text-brand-muted sm:text-lg"
          >
            A RM Ambiental Brasil integra especialistas multidisciplinares para entregar segurança técnica,
            conformidade regulatória e eficiência em projetos ambientais, urbanos, industriais e de infraestrutura.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 22 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.22 }}
            className="mt-9 flex flex-wrap items-center gap-3"
          >
            <Link to="/contato" className="btn-primary">
              Solicitar diagnóstico <ArrowRight className="h-4 w-4" />
            </Link>
            <Link to="/solucoes" className="btn-ghost">
              Conhecer soluções
            </Link>
          </motion.div>

          {/* indicadores de autoridade */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.34 }}
            className="mt-12 grid max-w-lg grid-cols-3 gap-6 border-t border-white/10 pt-7"
          >
            {[
              ['Nacional', 'Atuação em todo o Brasil'],
              ['Multidisciplinar', 'Engenharia + meio ambiente'],
              ['Regulatório', 'Relacionamento com órgãos'],
            ].map(([t, d]) => (
              <div key={t}>
                <div className="font-display text-sm font-bold text-brand-neon">{t}</div>
                <div className="mt-1 text-xs leading-snug text-brand-muted">{d}</div>
              </div>
            ))}
          </motion.div>
        </div>

        {/* Visual */}
        <motion.div
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.8, delay: 0.2 }}
          className="relative mx-auto w-full max-w-md"
        >
          <div className="glass relative rounded-3xl p-5 shadow-glass">
            <div className="absolute -inset-px rounded-3xl bg-gradient-to-br from-brand-neon/10 to-transparent" aria-hidden />
            <div className="relative aspect-[420/480] w-full">
              <CoverageMap className="h-full w-full" />
            </div>
            <div className="relative mt-2 flex items-center justify-between rounded-xl border border-white/10 bg-black/20 px-4 py-3">
              <span className="text-xs uppercase tracking-widest text-brand-muted">Pontos de atuação</span>
              <span className="font-display text-sm font-bold text-brand-neon">Brasil · multirregião</span>
            </div>
          </div>

          {floating.map((f, i) => (
            <motion.div
              key={f.label}
              className="absolute z-10 hidden items-center gap-2 rounded-xl border border-white/10 bg-brand-surface/90 px-3.5 py-2.5 shadow-glass backdrop-blur-md sm:flex"
              style={{ top: f.top, left: f.left, right: f.right, bottom: f.bottom } as React.CSSProperties}
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.5 + i * 0.18 }}
            >
              <span className="grid h-7 w-7 place-items-center rounded-lg bg-brand-neon/15">
                <f.icon className="h-3.5 w-3.5 text-brand-neon" />
              </span>
              <span className="text-xs font-semibold text-white">{f.label}</span>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
