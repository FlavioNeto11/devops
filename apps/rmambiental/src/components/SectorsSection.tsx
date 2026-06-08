import { motion } from 'framer-motion';
import { sectors } from '../data/sectors';
import { Reveal, SectionHeading } from './ui';

export default function SectorsSection() {
  return (
    <section id="setores" className="relative bg-brand-surface/30 py-24">
      <div className="container-wide">
        <SectionHeading
          center
          eyebrow="Setores atendidos"
          title={
            <>
              Experiência aplicada a <span className="text-gradient">cada segmento</span>
            </>
          }
          subtitle="Adaptamos a abordagem técnica e regulatória à realidade de cada setor."
        />

        <div className="mt-14 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          {sectors.map((s, i) => (
            <Reveal key={s.label} delay={i * 0.04}>
              <motion.div
                whileHover={{ y: -5 }}
                transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                className="group h-full rounded-2xl border border-white/10 bg-brand-surface/60 p-5 transition-colors hover:border-brand-neon/30"
              >
                <span className="grid h-11 w-11 place-items-center rounded-xl bg-brand-neon/12 ring-1 ring-brand-neon/20 transition-colors group-hover:bg-brand-neon/20">
                  <s.icon className="h-5 w-5 text-brand-neon" />
                </span>
                <h3 className="mt-4 font-display text-sm font-bold text-white">{s.label}</h3>
                <p className="mt-1 text-xs leading-snug text-brand-muted">{s.desc}</p>
              </motion.div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
