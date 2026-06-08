import { Leaf, Recycle, ShieldAlert, ScrollText, Sprout, Scale } from 'lucide-react';
import { Reveal, SectionHeading } from './ui';
import { asset } from '../lib/utils';

const pillars = [
  { icon: Leaf, title: 'Responsabilidade ambiental', desc: 'Compromisso com a preservação em cada decisão de projeto.' },
  { icon: Sprout, title: 'Desenvolvimento sustentável', desc: 'Equilíbrio entre crescimento econômico e meio ambiente.' },
  { icon: ShieldAlert, title: 'Redução de riscos', desc: 'Antecipação de passivos e mitigação de impactos.' },
  { icon: ScrollText, title: 'Conformidade', desc: 'Aderência integral à legislação e às boas práticas.' },
  { icon: Recycle, title: 'Impacto positivo', desc: 'Soluções que geram valor ambiental e social duradouro.' },
  { icon: Scale, title: 'Integração estratégica', desc: 'Crescimento e preservação caminhando juntos.' },
];

export default function ESGSection() {
  return (
    <section id="esg" className="relative overflow-hidden py-24">
      <div className="absolute inset-0" aria-hidden>
        <img src={asset('images/floresta.jpg')} alt="" className="h-full w-full object-cover opacity-20" />
        <div className="absolute inset-0 bg-gradient-to-r from-brand-bg via-brand-bg/92 to-brand-bg/75" />
      </div>
      <div className="absolute -left-32 top-1/2 h-[420px] w-[420px] -translate-y-1/2 rounded-full bg-brand-greenMid/10 blur-[130px]" aria-hidden />
      <div className="container-wide relative grid gap-12 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
        <SectionHeading
          eyebrow="ESG & Sustentabilidade"
          title={
            <>
              Crescimento com <span className="text-gradient">responsabilidade</span>
            </>
          }
          subtitle="Acreditamos que projetos sólidos nascem da integração entre desenvolvimento, conformidade e preservação. A sustentabilidade é parte da engenharia — não um detalhe à parte."
        />

        <div className="grid gap-4 sm:grid-cols-2">
          {pillars.map((p, i) => (
            <Reveal key={p.title} delay={i * 0.06}>
              <div className="flex h-full items-start gap-4 rounded-2xl border border-white/10 bg-brand-surface/60 p-5">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-brand-neon/12 ring-1 ring-brand-neon/20">
                  <p.icon className="h-5 w-5 text-brand-neon" />
                </span>
                <div>
                  <h3 className="font-display text-sm font-bold text-white">{p.title}</h3>
                  <p className="mt-1 text-xs leading-relaxed text-brand-muted">{p.desc}</p>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
