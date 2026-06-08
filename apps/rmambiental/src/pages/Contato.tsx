import { Reveal } from '../components/ui';
import { GridGlow } from '../components/backgrounds';
import ContactSection from '../components/ContactSection';

export default function Contato() {
  return (
    <>
      <section className="relative overflow-hidden pt-[72px]">
        <GridGlow />
        <div className="container-wide relative py-16 text-center lg:py-20">
          <Reveal>
            <span className="eyebrow">Fale com um especialista</span>
          </Reveal>
          <Reveal delay={0.05}>
            <h1 className="mx-auto mt-5 max-w-3xl font-display text-4xl font-extrabold leading-tight tracking-tight text-brand-text sm:text-5xl">
              Solicite um <span className="text-gradient">diagnóstico</span> ou uma proposta
            </h1>
          </Reveal>
          <Reveal delay={0.1}>
            <p className="mx-auto mt-4 max-w-2xl text-base text-brand-muted sm:text-lg">
              Conte sobre o seu projeto. Nossa equipe multidisciplinar retorna com a melhor estratégia técnica e
              regulatória.
            </p>
          </Reveal>
        </div>
      </section>
      <ContactSection />
    </>
  );
}
