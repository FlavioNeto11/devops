import { Building2, ShieldCheck, UserCog, Users } from 'lucide-react';
import { Reveal, SectionHeading } from './ui';

const publicos = [
  { icon: Building2, title: 'RH e Gestão de Pessoas', desc: 'Áreas que buscam fortalecer cultura, clima e desenvolvimento humano.' },
  { icon: ShieldCheck, title: 'SESMT', desc: 'Times de saúde e segurança que precisam endereçar os riscos psicossociais da NR-1.' },
  { icon: UserCog, title: 'Gestores e lideranças', desc: 'Líderes que querem conduzir equipes com mais escuta e consciência emocional.' },
  { icon: Users, title: 'Departamentos de pessoas', desc: 'Quem busca prevenção, engajamento e redução de afastamentos e conflitos.' },
];

export default function PublicoSection() {
  return (
    <section id="publico" className="relative py-24">
      <div className="container-wide">
        <SectionHeading
          center
          eyebrow="Para quem"
          title={
            <>
              Um posicionamento que conversa com quem decide sobre <span className="text-gradient">pessoas</span>
            </>
          }
          subtitle="Profissionais que estão procurando apoio justamente para a prevenção dos riscos psicossociais previstos na norma."
        />

        <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {publicos.map((p, i) => (
            <Reveal key={p.title} delay={i * 0.07}>
              <div className="h-full rounded-3xl border border-brand-text/10 bg-brand-surface/70 p-6 text-center shadow-card">
                <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-brand-neon/12 ring-1 ring-brand-text/10">
                  <p.icon className="h-6 w-6 text-brand-neon" />
                </span>
                <h3 className="mt-4 font-display text-base font-bold text-brand-text">{p.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-brand-muted">{p.desc}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
