'use client';

import { Building2, Check } from 'lucide-react';
import type { ReactNode } from 'react';

export interface ShellStep {
  id: string;
  label: string;
}

/**
 * Shell do onboarding: split-screen elegante — painel de marca grafite à
 * esquerda (claim segment-neutra + trilha de passos vertical) e o formulário à
 * direita. No mobile o painel vira um cabeçalho compacto com stepper de pontos.
 */
export function SetupShell({
  steps,
  activeStepId,
  children,
}: {
  steps: ShellStep[];
  activeStepId: string;
  children: ReactNode;
}) {
  const activeIdx = Math.max(0, steps.findIndex((s) => s.id === activeStepId));

  return (
    <div className="min-h-screen md:grid md:grid-cols-[minmax(300px,2fr)_3fr]">
      {/* Painel de marca — grafite nos dois temas */}
      <aside className="bg-zinc-950 text-zinc-50">
        {/* Desktop */}
        <div className="hidden h-full flex-col justify-between p-6 md:flex md:p-10">
          <div>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10">
                <Building2 className="h-5 w-5" />
              </div>
              <div>
                <p className="text-lg font-semibold leading-tight">GymOps</p>
                <p className="text-xs text-zinc-400">Gestão operacional multiunidade</p>
              </div>
            </div>

            <h1 className="mt-12 max-w-sm text-3xl font-semibold leading-tight tracking-tight">
              A operação do seu negócio, organizada desde o primeiro dia.
            </h1>
            <p className="mt-3 max-w-sm text-sm leading-relaxed text-zinc-400">
              Unidades, áreas funcionais e rotinas prontas — montadas pela IA a
              partir da descrição do seu negócio, ou do seu jeito, manualmente.
            </p>

            <ol className="mt-12 space-y-1">
              {steps.map((s, i) => {
                const done = i < activeIdx;
                const active = i === activeIdx;
                return (
                  <li key={s.id} className="flex items-center gap-3 rounded-lg px-3 py-2">
                    <span
                      className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold transition-colors ${
                        done ? 'bg-white text-zinc-950' : active ? 'bg-white/90 text-zinc-950 ring-4 ring-white/15' : 'bg-white/10 text-zinc-400'
                      }`}
                    >
                      {done ? <Check className="h-3.5 w-3.5" /> : i + 1}
                    </span>
                    <span className={`text-sm ${active ? 'font-medium text-zinc-50' : done ? 'text-zinc-300' : 'text-zinc-500'}`}>
                      {s.label}
                    </span>
                  </li>
                );
              })}
            </ol>
          </div>

          <p className="text-xs text-zinc-600">Plataforma de gestão operacional © 2026</p>
        </div>

        {/* Mobile: cabeçalho compacto + stepper horizontal */}
        <div className="flex items-center justify-between gap-3 p-4 md:hidden">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/10">
              <Building2 className="h-4 w-4" />
            </div>
            <span className="text-sm font-semibold">GymOps</span>
          </div>
          <div className="flex items-center gap-1.5" aria-label={`Passo ${activeIdx + 1} de ${steps.length}: ${steps[activeIdx]?.label}`}>
            {steps.map((s, i) => (
              <span
                key={s.id}
                className={`h-1.5 rounded-full transition-all ${i === activeIdx ? 'w-5 bg-white' : i < activeIdx ? 'w-1.5 bg-white/70' : 'w-1.5 bg-white/20'}`}
              />
            ))}
          </div>
        </div>
      </aside>

      {/* Área do formulário */}
      <main className="flex min-h-0 flex-col bg-background md:max-h-screen md:overflow-y-auto">
        <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col p-3 pb-10 md:p-6 md:pt-12">
          <p className="mb-1 text-xs font-medium uppercase tracking-wider text-muted-foreground md:hidden">
            {steps[activeIdx]?.label}
          </p>
          {children}
        </div>
      </main>
    </div>
  );
}
