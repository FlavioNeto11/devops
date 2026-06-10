import { Heart, ShieldCheck, Sparkles, Users } from 'lucide-react';
import { Reveal, SectionHeading } from './ui';

const valores = [
  {
    icon: Heart,
    title: 'Cuidado humano',
    desc: 'Saúde emocional tratada com acolhimento e responsabilidade — pessoas no centro.',
  },
  {
    icon: ShieldCheck,
    title: 'Prevenção real',
    desc: 'Foco em evidência de prevenção e na construção de ambientes mais saudáveis.',
  },
  {
    icon: Sparkles,
    title: 'Base científica',
    desc: 'Neuropsicopedagogia e educação aplicadas ao contexto corporativo.',
  },
  {
    icon: Users,
    title: 'Inclusão',
    desc: 'Neurodiversidade e diversidade como caminho para equipes mais fortes.',
  },
];

export default function ValoresSection() {
  return (
    <section id="valores" className="relative overflow-hidden bg-brand-surface2/60 py-24">
      <div className="container-wide">
        <SectionHeading
          center
          eyebrow="Abordagem"
          title={
            <>
              Princípios que guiam <span className="text-gradient">cada encontro</span>
            </>
          }
        />
        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {valores.map((v, i) => (
            <Reveal key={v.title} delay={i * 0.07}>
              <div className="group h-full rounded-3xl border border-brand-text/10 bg-brand-surface/70 p-6 text-center shadow-card transition-all duration-300 hover:-translate-y-1 hover:border-brand-neon/30">
                <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-brand-neon/12 ring-1 ring-brand-neon/20 transition-colors group-hover:bg-brand-neon/20">
                  <v.icon className="h-6 w-6 text-brand-neon" />
                </span>
                <h3 className="mt-5 font-display text-base font-bold text-brand-text">{v.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-brand-muted">{v.desc}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
