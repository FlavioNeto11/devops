import { motion } from 'framer-motion';
import { Sparkles, ShieldCheck, Brain, HeartPulse } from 'lucide-react';
import { GridGlow, PortraitCard } from './backgrounds';
import ProposalButton from './ProposalButton';
import { site } from '../lib/site';
import type { CSSProperties } from 'react';

const floating = [
  { icon: ShieldCheck, label: 'Adequação à NR-1', top: '6%', left: '-5%' },
  { icon: Brain, label: 'Neurodiversidade', top: '44%', right: '-6%' },
  { icon: HeartPulse, label: 'Saúde emocional', bottom: '8%', left: '-4%' },
];

export default function Hero() {
  return (
    <section id="inicio" className="relative overflow-hidden pt-[72px]">
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
            <Sparkles className="h-3.5 w-3.5" /> Saúde mental · Neurodiversidade · NR-1
          </motion.span>

          <motion.p
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.05 }}
            className="mt-6 font-display text-sm font-bold uppercase tracking-[0.3em] text-brand-neon"
          >
            {site.name}
          </motion.p>
          <motion.p
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.08 }}
            className="mt-1 text-sm font-medium text-brand-muted"
          >
            {site.role}
          </motion.p>

          <motion.h1
            initial={{ opacity: 0, y: 22 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.12 }}
            className="mt-5 font-display text-4xl font-extrabold leading-[1.06] tracking-tight text-brand-text sm:text-5xl lg:text-[3.2rem]"
          >
            Saúde emocional no trabalho como <span className="text-gradient">estratégia de prevenção</span> — e de conformidade com a NR-1.
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 22 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="mt-6 max-w-xl text-base leading-relaxed text-brand-muted sm:text-lg"
          >
            {site.intro}
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 22 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.28 }}
            className="mt-9 flex flex-wrap items-center gap-3"
          >
            <ProposalButton label="Solicitar proposta" />
            <a href="#palestras" className="btn-ghost">
              Ver palestras
            </a>
          </motion.div>

          {/* eixos de atuação */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.38 }}
            className="mt-12 grid max-w-lg grid-cols-3 gap-6 border-t border-brand-text/10 pt-7"
          >
            {[
              ['Prevenção', 'Riscos psicossociais (NR-1)'],
              ['Inclusão', 'Neurodiversidade nas equipes'],
              ['Liderança', 'Gestão mais humana e consciente'],
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
          className="relative mx-auto w-full max-w-sm"
        >
          <div className="glass relative rounded-[2rem] p-4 shadow-glass">
            <div className="absolute -inset-px rounded-[2rem] bg-gradient-to-br from-brand-neon/12 to-transparent" aria-hidden />
            <PortraitCard photo={site.photos.hero || undefined} className="relative" />
            <div className="relative mt-3 flex items-center justify-between rounded-xl border border-brand-text/10 bg-brand-surface2/70 px-4 py-3">
              <span className="text-xs uppercase tracking-widest text-brand-muted">Palestrante corporativa</span>
              <span className="font-display text-sm font-bold text-brand-neon">{site.shortName}</span>
            </div>
          </div>

          {floating.map((f, i) => (
            <motion.div
              key={f.label}
              className="absolute z-10 hidden items-center gap-2 rounded-xl border border-brand-text/10 bg-brand-surface/90 px-3.5 py-2.5 shadow-soft backdrop-blur-md sm:flex"
              style={{ top: f.top, left: f.left, right: f.right, bottom: f.bottom } as CSSProperties}
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.55 + i * 0.18 }}
            >
              <span className="grid h-7 w-7 place-items-center rounded-lg bg-brand-neon/15">
                <f.icon className="h-3.5 w-3.5 text-brand-neon" />
              </span>
              <span className="text-xs font-semibold text-brand-text">{f.label}</span>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
