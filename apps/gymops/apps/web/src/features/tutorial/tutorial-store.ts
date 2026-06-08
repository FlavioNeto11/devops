'use client';

import { create } from 'zustand';
import type { TutorialDefinition, TutorialProgress, TutorialStep } from './tutorial.types';
import type { UserRole } from '@/store/auth';
import { getTutorialById } from './tutorial.registry';

interface RunState {
  tutorialId: string;
  stepIndex: number;
  /** true quando o step é required mas o target está ausente — exibe fallback central. */
  isFallback: boolean;
}

interface TutorialState {
  /** Tutorial atualmente em execução (overlay visível). */
  run: RunState | null;
  /** Progresso carregado do backend, indexado por tutorialId. */
  progress: Record<string, TutorialProgress>;
  /** Convite de onboarding visível? */
  onboardingPromptVisible: boolean;
  /** Central de ajuda aberta como drawer? (a página /help também existe). */
  helpDrawerOpen: boolean;
  /** Tutorial aguardando navegação para a rota correta antes de iniciar. */
  pendingStart: string | null;

  /** Substitui o cache inteiro de progresso (após GET). */
  setProgress: (rows: TutorialProgress[]) => void;
  /** Insere/atualiza uma entrada. */
  upsertProgress: (row: TutorialProgress) => void;

  startTutorial: (tutorialId: string, stepIndex?: number) => void;
  stopTutorial: () => void;
  goToStep: (stepIndex: number) => void;
  nextStep: () => void;
  prevStep: () => void;

  setOnboardingPromptVisible: (v: boolean) => void;
  setHelpDrawerOpen: (v: boolean) => void;
  setPendingStart: (id: string | null) => void;
  setFallback: (v: boolean) => void;
}

export const useTutorialStore = create<TutorialState>((set, get) => ({
  run: null,
  progress: {},
  onboardingPromptVisible: false,
  helpDrawerOpen: false,
  pendingStart: null,

  setProgress: (rows) =>
    set({
      progress: Object.fromEntries(rows.map((r) => [r.tutorialId, r])),
    }),

  upsertProgress: (row) =>
    set((s) => ({ progress: { ...s.progress, [row.tutorialId]: row } })),

  startTutorial: (tutorialId, stepIndex = 0) =>
    set({ run: { tutorialId, stepIndex, isFallback: false }, helpDrawerOpen: false, onboardingPromptVisible: false }),

  stopTutorial: () => set({ run: null }),

  goToStep: (stepIndex) => {
    const run = get().run;
    if (!run) return;
    set({ run: { ...run, stepIndex, isFallback: false } });
  },

  nextStep: () => {
    const run = get().run;
    if (!run) return;
    set({ run: { ...run, stepIndex: run.stepIndex + 1, isFallback: false } });
  },

  prevStep: () => {
    const run = get().run;
    if (!run) return;
    set({ run: { ...run, stepIndex: Math.max(0, run.stepIndex - 1), isFallback: false } });
  },

  setFallback: (v) => {
    const run = get().run;
    if (!run) return;
    set({ run: { ...run, isFallback: v } });
  },

  setOnboardingPromptVisible: (v) => set({ onboardingPromptVisible: v }),
  setHelpDrawerOpen: (v) => set({ helpDrawerOpen: v }),
  setPendingStart: (id) => set({ pendingStart: id }),
}));

/**
 * Resolve os steps visíveis para um papel — ignora steps cujo rolesAllowed
 * não inclui o papel atual. Não filtra por DOM aqui (isso é feito no overlay
 * com skipIfTargetMissing).
 */
export function resolveStepsForRole(
  tutorial: TutorialDefinition,
  role: UserRole,
): TutorialStep[] {
  if (!role) return [];
  return tutorial.steps.filter((s) => !s.rolesAllowed || s.rolesAllowed.includes(role));
}

export function getCurrentTutorialAndStep(state: TutorialState): {
  tutorial: TutorialDefinition;
  step: TutorialStep;
  stepIndex: number;
} | null {
  if (!state.run) return null;
  const tutorial = getTutorialById(state.run.tutorialId);
  if (!tutorial) return null;
  const step = tutorial.steps[state.run.stepIndex];
  if (!step) return null;
  return { tutorial, step, stepIndex: state.run.stepIndex };
}
