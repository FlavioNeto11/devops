import { motion } from 'framer-motion';
import { Compass } from 'lucide-react';
import { diagnostico, trilhas } from '../data/trilhas';
import { Reveal, SectionHeading } from './ui';

export default function ConsultoriaSection() {
  return (
    <section id="consultoria" className="relative overflow-hidden bg-brand-surface2/60 py-24">
      <div className="container-wide">
        <SectionHeading
          eyebrow="Consultoria educativa para empresas"
          title={
            <>
              Do diagnóstico ao plano de <span className="text-gradient">ações educativas</span>
            </>
          }
          subtitle="Além das palestras, estruturo programas contínuos de educação corporativa — começando por entender o seu contexto antes de propor caminhos."
        />

        {/* Diagnóstico Educativo Organizacional */}
        <div className="mt-14">
          <Reveal>
            <h3 className="font-display text-xl font-bold text-brand-text">Diagnóstico Educativo Organizacional</h3>
          </Reveal>
          <div className="mt-6 grid gap-5 md:grid-cols-2 lg:grid-cols-4">
            {diagnostico.map((d, i) => (
              <Reveal key={d.title} delay={i * 0.07}>
                <motion.div
                  whileHover={{ y: -5 }}
                  transition={{ type: 'spring', stiffness: 260, damping: 22 }}
                  className="relative h-full rounded-3xl border border-brand-text/10 bg-brand-surface/80 p-6 shadow-card"
                >
                  <span className="font-display text-sm font-bold text-brand-neon/70">
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <span className="mt-3 grid h-11 w-11 place-items-center rounded-xl bg-brand-neon/12 ring-1 ring-brand-text/10">
                    <d.icon className="h-5 w-5 text-brand-neon" />
                  </span>
                  <h4 className="mt-4 font-display text-base font-bold leading-snug text-brand-text">{d.title}</h4>
                  <p className="mt-2 text-sm leading-relaxed text-brand-muted">{d.desc}</p>
                </motion.div>
              </Reveal>
            ))}
          </div>
        </div>

        {/* Trilhas de Desenvolvimento */}
        <div className="mt-12">
          <Reveal>
            <div className="rounded-3xl border border-brand-text/10 bg-brand-surface/70 p-7 shadow-card sm:p-8">
              <div className="flex items-center gap-3">
                <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-brand-terra/12 ring-1 ring-brand-text/10">
                  <Compass className="h-6 w-6 text-brand-terra" />
                </span>
                <div>
                  <h3 className="font-display text-xl font-bold leading-tight text-brand-text">
                    Trilhas de Desenvolvimento
                  </h3>
                  <p className="mt-0.5 text-sm text-brand-muted">
                    Jornadas de educação corporativa contínua, combináveis conforme a necessidade.
                  </p>
                </div>
              </div>
              <div className="mt-6 flex flex-wrap gap-2.5">
                {trilhas.map((t) => (
                  <span
                    key={t}
                    className="rounded-full border border-brand-neon/25 bg-brand-neon/8 px-4 py-2 text-sm font-medium text-brand-text"
                  >
                    {t}
                  </span>
                ))}
              </div>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
