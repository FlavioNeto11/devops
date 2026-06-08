import { Check } from 'lucide-react';
import { Counter, Reveal, SectionHeading } from './ui';
import { asset } from '../lib/utils';

// ⚠️ PLACEHOLDERS — substituir pelos números OFICIAIS da empresa (ver nota ilustrativa abaixo).
const stats = [
  { to: 250, prefix: '+', label: 'Projetos analisados' },
  { to: 15, prefix: '+', label: 'Anos de experiência' },
  { to: 12, prefix: '', label: 'Estados atendidos' },
  { to: 30, prefix: '+', label: 'Especialistas multidisciplinares' },
];

const differentials = [
  'Atuação em todo o território nacional',
  'Especialistas multidisciplinares em uma só equipe',
  'Experiência em projetos técnicos complexos',
  'Relacionamento próximo com órgãos ambientais',
  'Soluções integradas: engenharia, meio ambiente e regularização',
];

export default function AuthoritySection() {
  return (
    <section className="relative overflow-hidden py-24">
      <div className="absolute inset-0" aria-hidden>
        <img src={asset('images/decor/mineracao.jpg')} alt="" className="h-full w-full object-cover opacity-[0.12]" />
        <div className="absolute inset-0 bg-gradient-to-r from-brand-bg via-brand-bg/88 to-brand-bg/70" />
      </div>
      <div className="absolute inset-0 bg-tech-grid opacity-30 [mask-image:radial-gradient(ellipse_at_center,black,transparent_80%)]" aria-hidden />
      <div className="container-wide relative grid gap-14 lg:grid-cols-2 lg:items-center">
        <div>
          <SectionHeading
            eyebrow="Autoridade"
            title={
              <>
                Sólida, técnica e <span className="text-gradient">confiável</span>
              </>
            }
            subtitle="Reunimos engenharia, ciência ambiental e visão regulatória para conduzir projetos que exigem responsabilidade e precisão."
          />
          <ul className="mt-8 space-y-3">
            {differentials.map((d, i) => (
              <Reveal key={d} delay={i * 0.06}>
                <li className="flex items-start gap-3 text-sm text-brand-text/90">
                  <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-brand-neon/15">
                    <Check className="h-3 w-3 text-brand-neon" />
                  </span>
                  {d}
                </li>
              </Reveal>
            ))}
          </ul>
        </div>

        <div className="grid grid-cols-2 gap-5">
          {stats.map((s, i) => (
            <Reveal key={s.label} delay={i * 0.08}>
              <div className="rounded-2xl border border-brand-text/10 bg-brand-surface/60 p-7 text-center">
                <div className="font-display text-4xl font-extrabold text-brand-text sm:text-5xl">
                  <Counter to={s.to} prefix={s.prefix} />
                </div>
                <div className="mt-2 text-sm leading-snug text-brand-muted">{s.label}</div>
              </div>
            </Reveal>
          ))}
          <p className="col-span-2 text-center text-xs text-brand-muted/70">
            * Indicadores ilustrativos — substituir pelos dados oficiais da RM Ambiental Brasil.
          </p>
        </div>
      </div>
    </section>
  );
}
