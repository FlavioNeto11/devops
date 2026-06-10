import { Reveal } from './ui';
import { InfinityMotif } from './backgrounds';
import ProposalButton from './ProposalButton';

export default function CTASection() {
  return (
    <section id="cta" className="relative py-24">
      <div className="container-wide">
        <Reveal>
          <div className="relative overflow-hidden rounded-[2.5rem] border border-brand-text/10 bg-gradient-to-br from-brand-surface to-brand-surface2 px-7 py-14 text-center shadow-card sm:px-12 sm:py-16">
            <InfinityMotif className="pointer-events-none absolute -left-8 -top-6 h-32 w-64 opacity-25" />
            <InfinityMotif className="pointer-events-none absolute -bottom-8 -right-6 h-32 w-64 rotate-180 opacity-20" />
            <div className="relative mx-auto max-w-2xl">
              <h2 className="font-display text-3xl font-bold leading-[1.12] tracking-tight text-brand-text sm:text-4xl">
                Vamos construir um ambiente de trabalho mais <span className="text-gradient">saudável</span>?
              </h2>
              <p className="mt-5 text-base leading-relaxed text-brand-muted sm:text-lg">
                Conte o momento da sua empresa — palestra, campanha temática, treinamento de lideranças
                ou um programa contínuo de educação corporativa. Eu ajudo a desenhar o caminho.
              </p>
              <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
                <ProposalButton label="Solicitar proposta" />
                <a href="#palestras" className="btn-ghost">
                  Rever as palestras
                </a>
              </div>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
