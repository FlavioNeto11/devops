import { ShieldCheck, BadgeCheck, Gauge, Workflow } from 'lucide-react';
import { Reveal, SectionHeading } from './ui';
import { TopoLines } from './backgrounds';
import { asset } from '../lib/utils';

const pillars = [
  {
    icon: ShieldCheck,
    title: 'Segurança técnica',
    desc: 'Responsabilidade técnica formal e decisões embasadas em dados, normas e engenharia.',
  },
  {
    icon: BadgeCheck,
    title: 'Conformidade ambiental',
    desc: 'Aderência integral à legislação e às exigências dos órgãos reguladores.',
  },
  {
    icon: Gauge,
    title: 'Agilidade regulatória',
    desc: 'Condução eficiente dos processos para reduzir prazos e destravar projetos.',
  },
  {
    icon: Workflow,
    title: 'Gestão completa do projeto',
    desc: 'Coordenação multidisciplinar do diagnóstico à aprovação ou entrega final.',
  },
];

export default function Positioning() {
  return (
    <section id="sobre" className="relative overflow-hidden py-24">
      <TopoLines className="absolute -right-24 top-0 h-[520px] w-[520px] text-brand-petrolLight/40" />
      <div className="container-wide relative">
        <SectionHeading
          eyebrow="Posicionamento"
          title={
            <>
              Soluções ambientais com visão <span className="text-gradient">técnica, jurídica e estratégica</span>
            </>
          }
          subtitle="Somos um grupo multidisciplinar de especialistas focado em soluções eficazes para problemas complexos. Atuamos em todo o território nacional, com responsabilidade e seriedade — unindo precisão de engenharia, segurança jurídica e gestão ambiental de ponta a ponta."
        />

        <div className="mt-12 overflow-hidden rounded-3xl border border-brand-text/10 shadow-card">
          <img
            src={asset('images/decor/consultoria.jpg')}
            alt="Consultoria técnica e documental"
            className="h-56 w-full object-cover sm:h-80"
          />
        </div>

        <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {pillars.map((p, i) => (
            <Reveal key={p.title} delay={i * 0.08}>
              <div className="group h-full rounded-2xl border border-brand-text/10 bg-brand-surface/60 p-6 transition-all duration-300 hover:-translate-y-1 hover:border-brand-neon/30 hover:bg-brand-surface">
                <span className="grid h-12 w-12 place-items-center rounded-xl bg-brand-neon/12 ring-1 ring-brand-neon/20 transition-colors group-hover:bg-brand-neon/20">
                  <p.icon className="h-6 w-6 text-brand-neon" />
                </span>
                <h3 className="mt-5 font-display text-lg font-bold text-brand-text">{p.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-brand-muted">{p.desc}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
