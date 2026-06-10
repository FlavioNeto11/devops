import { motion } from 'framer-motion';
import {
  ScrollText,
  ShieldAlert,
  Check,
  FileCheck2,
  GraduationCap,
  BookOpen,
  Megaphone,
  Sprout,
  TrendingDown,
} from 'lucide-react';
import { Reveal, SectionHeading } from './ui';

/** Fatores de risco psicossocial citados pela NR-1. */
const fatores = [
  'Sobrecarga',
  'Assédio',
  'Metas abusivas',
  'Falhas de comunicação',
  'Conflitos',
  'Organização inadequada do trabalho',
];

/** O que Ana entrega (atuação preventiva) — substitui a ideia de "transferir responsabilidade". */
const entregas = [
  { icon: FileCheck2, label: 'Evidências de prevenção' },
  { icon: GraduationCap, label: 'Capacitação das lideranças' },
  { icon: BookOpen, label: 'Educação corporativa' },
  { icon: Megaphone, label: 'Programas de conscientização' },
  { icon: Sprout, label: 'Fortalecimento da cultura organizacional' },
  { icon: TrendingDown, label: 'Estratégias de redução dos riscos psicossociais' },
];

export default function NR1Section() {
  return (
    <section id="nr1" className="relative py-24">
      <div className="container-wide">
        <SectionHeading
          eyebrow="NR-1 · vigência 2026"
          title={
            <>
              O que mudou na NR-1 — e por que virou <span className="text-gradient">pauta do RH e do SESMT</span>
            </>
          }
          subtitle="A atualização da Norma Regulamentadora nº 1 passou a exigir que as empresas incluam os riscos psicossociais relacionados ao trabalho dentro do Gerenciamento de Riscos Ocupacionais (GRO)."
        />

        <div className="mt-12 grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          {/* Contexto da norma */}
          <Reveal>
            <div className="h-full rounded-3xl border border-brand-text/10 bg-brand-surface/70 p-7 shadow-card sm:p-8">
              <span className="grid h-12 w-12 place-items-center rounded-2xl bg-brand-neon/12 ring-1 ring-brand-text/10">
                <ScrollText className="h-6 w-6 text-brand-neon" />
              </span>
              <p className="mt-5 text-base leading-relaxed text-brand-muted">
                A partir de 2026, a exigência entrou em vigor de forma expressa, ampliando a
                responsabilidade das organizações na prevenção de fatores que podem levar ao
                adoecimento mental relacionado ao trabalho. Esses fatores precisam ser{' '}
                <strong className="text-brand-text">identificados, avaliados e tratados</strong> pela empresa:
              </p>
              <div className="mt-6 flex flex-wrap gap-2">
                {fatores.map((f) => (
                  <span
                    key={f}
                    className="rounded-full border border-brand-text/10 bg-brand-surface2/70 px-3.5 py-1.5 text-sm text-brand-text"
                  >
                    {f}
                  </span>
                ))}
              </div>
            </div>
          </Reveal>

          {/* Enquadramento honesto */}
          <Reveal delay={0.08}>
            <div className="relative h-full overflow-hidden rounded-3xl border border-brand-terra/30 bg-brand-terra/[0.06] p-7 shadow-card sm:p-8">
              <div className="flex items-center gap-3">
                <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-brand-terra/15 ring-1 ring-brand-terra/20">
                  <ShieldAlert className="h-6 w-6 text-brand-terra" />
                </span>
                <h3 className="font-display text-xl font-bold leading-tight text-brand-text">
                  Você não transfere a responsabilidade da empresa
                </h3>
              </div>
              <p className="mt-5 text-base leading-relaxed text-brand-muted">
                Nenhum consultor, palestrante ou profissional externo elimina a responsabilidade legal
                da organização. O que eu ofereço é ajudar a empresa a{' '}
                <strong className="text-brand-text">demonstrar atuação preventiva</strong> e a construir
                um ambiente mais saudável — reduzindo riscos de adoecimento, afastamentos, conflitos e
                passivos trabalhistas.
              </p>
            </div>
          </Reveal>
        </div>

        {/* O que entrego */}
        <div className="mt-10">
          <Reveal>
            <p className="font-display text-sm font-bold uppercase tracking-[0.18em] text-brand-muted">
              O que eu ofereço
            </p>
          </Reveal>
          <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {entregas.map((e, i) => (
              <Reveal key={e.label} delay={i * 0.06}>
                <motion.div
                  whileHover={{ y: -4 }}
                  transition={{ type: 'spring', stiffness: 260, damping: 22 }}
                  className="flex items-center gap-3 rounded-2xl border border-brand-text/10 bg-brand-surface/70 px-5 py-4 shadow-soft"
                >
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-neon/12">
                    <e.icon className="h-5 w-5 text-brand-neon" />
                  </span>
                  <span className="flex items-start gap-1.5 text-sm font-medium text-brand-text">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-brand-neon/80" />
                    {e.label}
                  </span>
                </motion.div>
              </Reveal>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
