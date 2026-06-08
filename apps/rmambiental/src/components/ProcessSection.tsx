import { motion } from 'framer-motion';
import { Search, FileSearch, Map, FileCheck2, BadgeCheck } from 'lucide-react';
import { SectionHeading } from './ui';

const steps = [
  { icon: Search, title: 'Diagnóstico inicial', desc: 'Entendemos o projeto, os riscos e os objetivos para definir a estratégia.' },
  { icon: FileSearch, title: 'Levantamento técnico e documental', desc: 'Reunimos dados, estudos, documentação e o enquadramento legal aplicável.' },
  { icon: Map, title: 'Planejamento da estratégia ambiental', desc: 'Desenhamos o caminho regulatório, os marcos e os responsáveis técnicos.' },
  { icon: FileCheck2, title: 'Execução, estudos e protocolos', desc: 'Elaboramos estudos, projetos e conduzimos protocolos junto aos órgãos.' },
  { icon: BadgeCheck, title: 'Acompanhamento até a aprovação', desc: 'Tratamos exigências e acompanhamos até a aprovação ou a entrega final.' },
];

export default function ProcessSection() {
  return (
    <section id="processo" className="relative bg-brand-surface/30 py-24">
      <div className="container-wide">
        <SectionHeading
          center
          eyebrow="Como trabalhamos"
          title={
            <>
              Um método claro, do <span className="text-gradient">diagnóstico à aprovação</span>
            </>
          }
          subtitle="Conduzimos cada projeto por etapas bem definidas, com responsáveis e marcos transparentes."
        />

        <div className="relative mx-auto mt-16 max-w-3xl">
          <div className="absolute bottom-0 left-[27px] top-2 w-px bg-gradient-to-b from-brand-neon/50 via-brand-text/10 to-transparent md:left-1/2" aria-hidden />
          <div className="space-y-8">
            {steps.map((s, i) => (
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
                <div className="flex-1 rounded-2xl border border-white/10 bg-brand-surface/70 p-5 md:max-w-[44%]">
                  <h3 className="font-display text-base font-bold text-brand-text">{s.title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-brand-muted">{s.desc}</p>
                </div>
                <div className="hidden flex-1 md:block" aria-hidden />
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
