import { Reveal, SectionHeading } from './ui';
import Accordion from './Accordion';
import { faq } from '../data/faq';

export default function FaqSection() {
  return (
    <section id="faq" className="relative overflow-hidden bg-brand-surface2/60 py-24">
      <div className="container-wide">
        <SectionHeading
          center
          eyebrow="Perguntas frequentes"
          title={
            <>
              Tudo o que o RH pergunta sobre a <span className="text-gradient">NR-1</span>
            </>
          }
          subtitle="Respostas diretas sobre a norma, os riscos psicossociais e como funcionam as palestras e a consultoria."
        />
        <div className="mx-auto mt-12 max-w-3xl">
          <Reveal>
            <Accordion items={faq.map((f) => ({ q: f.q, a: f.a }))} />
          </Reveal>
        </div>
      </div>
    </section>
  );
}
