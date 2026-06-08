import { Link } from 'react-router-dom';
import { ArrowRight, Check, Package, Landmark, Sparkles, HelpCircle } from 'lucide-react';
import { serviceGroups } from '../data/services';
import { GridGlow } from '../components/backgrounds';
import { Reveal } from '../components/ui';
import { cn } from '../lib/utils';

function List({ title, icon: Icon, items }: { title: string; icon: typeof Check; items: string[] }) {
  return (
    <div>
      <h4 className="flex items-center gap-2 font-display text-sm font-bold text-white">
        <Icon className="h-4 w-4 text-brand-neon" /> {title}
      </h4>
      <ul className="mt-3 space-y-2">
        {items.map((it) => (
          <li key={it} className="flex items-start gap-2 text-sm text-brand-muted">
            <Check className="mt-0.5 h-4 w-4 shrink-0 text-brand-neon/70" />
            <span>{it}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function Solucoes() {
  return (
    <>
      {/* Page hero */}
      <section className="relative overflow-hidden pt-[72px]">
        <GridGlow />
        <div className="container-wide relative py-16 lg:py-20">
          <Reveal>
            <span className="eyebrow">Soluções</span>
          </Reveal>
          <Reveal delay={0.05}>
            <h1 className="mt-5 max-w-3xl font-display text-4xl font-extrabold leading-[1.08] tracking-tight text-white sm:text-5xl">
              Engenharia, licenciamento e gestão ambiental <span className="text-gradient">de ponta a ponta</span>
            </h1>
          </Reveal>
          <Reveal delay={0.1}>
            <p className="mt-4 max-w-2xl text-base text-brand-muted sm:text-lg">
              Quatro frentes integradas, conduzidas por uma equipe multidisciplinar — da viabilidade à operação.
            </p>
          </Reveal>
          <div className="mt-8 flex flex-wrap gap-2">
            {serviceGroups.map((g) => (
              <a
                key={g.id}
                href={`#${g.id}`}
                className="inline-flex items-center gap-2 rounded-full border border-white/10 px-4 py-2 text-sm font-medium text-brand-muted transition-colors hover:border-brand-neon/40 hover:text-white"
              >
                <g.icon className="h-4 w-4 text-brand-neon" />
                {g.title}
              </a>
            ))}
          </div>
        </div>
      </section>

      {/* Blocos detalhados */}
      {serviceGroups.map((g, idx) => (
        <section key={g.id} id={g.id} className={cn('relative py-20', idx % 2 === 1 && 'bg-brand-surface/30')}>
          <div className="container-wide">
            <Reveal>
              <div className="flex items-start gap-4">
                <span className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-brand-neon/20 to-brand-petrol/30 ring-1 ring-white/10">
                  <g.icon className="h-7 w-7 text-brand-neon" />
                </span>
                <div>
                  <h2 className="font-display text-2xl font-bold leading-tight text-white sm:text-3xl">{g.title}</h2>
                  <p className="mt-1 text-sm text-brand-neon/90">{g.tagline}</p>
                </div>
              </div>
            </Reveal>

            <Reveal delay={0.05}>
              <p className="mt-6 max-w-3xl text-base leading-relaxed text-brand-muted">{g.summary}</p>
            </Reveal>

            <div className="mt-9 grid gap-6 lg:grid-cols-2">
              <Reveal delay={0.08}>
                <div className="h-full rounded-2xl border border-white/10 bg-brand-surface/50 p-6">
                  <List title="Escopo de atuação" icon={Check} items={g.items} />
                  <div className="mt-6 rounded-xl border border-brand-neon/15 bg-brand-neon/[0.06] p-4">
                    <h4 className="flex items-center gap-2 font-display text-sm font-bold text-white">
                      <HelpCircle className="h-4 w-4 text-brand-neon" /> Quando contratar
                    </h4>
                    <p className="mt-2 text-sm leading-relaxed text-brand-muted">{g.whenToHire}</p>
                  </div>
                </div>
              </Reveal>

              <Reveal delay={0.12}>
                <div className="grid h-full content-start gap-6 rounded-2xl border border-white/10 bg-brand-surface/50 p-6">
                  <List title="Principais entregáveis" icon={Package} items={g.deliverables} />
                  <div className="grid gap-6 sm:grid-cols-2">
                    <List title="Órgãos envolvidos" icon={Landmark} items={g.orgaos} />
                    <List title="Benefícios" icon={Sparkles} items={g.benefits} />
                  </div>
                </div>
              </Reveal>
            </div>

            {/* processo */}
            <Reveal delay={0.1}>
              <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {g.steps.map((s, i) => (
                  <div key={s.title} className="relative rounded-2xl border border-white/10 bg-brand-bg/40 p-5">
                    <span className="font-display text-sm font-bold text-brand-neon">0{i + 1}</span>
                    <h4 className="mt-2 font-display text-sm font-bold text-white">{s.title}</h4>
                    <p className="mt-1 text-xs leading-relaxed text-brand-muted">{s.desc}</p>
                  </div>
                ))}
              </div>
            </Reveal>

            <Reveal delay={0.1}>
              <Link to="/contato" className="btn-primary mt-9">
                Falar com um especialista <ArrowRight className="h-4 w-4" />
              </Link>
            </Reveal>
          </div>
        </section>
      ))}
    </>
  );
}
