import { motion } from 'framer-motion';
import { Search, PencilRuler, Presentation, Repeat } from 'lucide-react';
import { SectionHeading } from './ui';

/** Etapas honestas do método (sem números/estatísticas inventados). */
const etapas = [
  {
    icon: Search,
    title: 'Diagnóstico',
    desc: 'Entendo o contexto da empresa, o público (RH, SESMT, lideranças) e os pontos de atenção.',
  },
  {
    icon: PencilRuler,
    title: 'Conteúdo sob medida',
    desc: 'Adapto temas, linguagem e formato (palestra, workshop ou treinamento) ao seu objetivo.',
  },
  {
    icon: Presentation,
    title: 'Execução',
    desc: 'Conduzo o encontro — presencial ou online — com escuta, prática e foco em prevenção.',
  },
  {
    icon: Repeat,
    title: 'Continuidade',
    desc: 'Sugiro próximos passos e trilhas para sustentar a cultura de cuidado ao longo do tempo.',
  },
];

export default function ComoTrabalhoSection() {
  return (
    <section id="como-trabalho" className="relative py-24">
      <div className="container-wide">
        <SectionHeading
          eyebrow="Como trabalho"
          title={
            <>
              Do contexto da empresa à <span className="text-gradient">ação preventiva</span>
            </>
          }
          subtitle="Um caminho simples e adaptável — pensado para gerar evidência de prevenção e impacto real na cultura."
        />

        <div className="relative mt-14">
          <div
            className="absolute bottom-2 left-[27px] top-2 w-px bg-gradient-to-b from-brand-neon/50 via-brand-text/10 to-transparent md:left-1/2"
            aria-hidden
          />
          <div className="space-y-8">
            {etapas.map((s, i) => (
              <motion.div
                key={s.title}
                initial={{ opacity: 0, x: -16 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true, margin: '-60px' }}
                transition={{ duration: 0.5, delay: i * 0.06 }}
                className="relative flex items-start gap-5 md:odd:flex-row-reverse md:odd:text-right"
              >
                <span className="relative z-10 grid h-14 w-14 shrink-0 place-items-center rounded-2xl border border-brand-neon/30 bg-brand-bg text-brand-neon shadow-glow">
                  <s.icon className="h-6 w-6" />
                  <span className="absolute -right-1 -top-1 grid h-5 w-5 place-items-center rounded-full bg-brand-neon text-[11px] font-bold text-brand-onNeon">
                    {i + 1}
                  </span>
                </span>
                <div className="flex-1 rounded-2xl border border-brand-text/10 bg-brand-surface/70 p-5 shadow-soft md:max-w-[44%]">
                  <h3 className="font-display text-base font-bold text-brand-text">{s.title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-brand-muted">{s.desc}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
