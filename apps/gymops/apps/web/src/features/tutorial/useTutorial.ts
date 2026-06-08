'use client';

import { useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/auth';
import { useTutorialStore, resolveStepsForRole } from './tutorial-store';
import { getTutorialById } from './tutorial.registry';
import { tutorialProgressApi } from './tutorial-progress-api';
import type { TutorialStep } from './tutorial.types';

/**
 * Hook principal para controlar o ciclo do tutorial em execução: avançar,
 * voltar, pular, concluir. Sincroniza com o backend de forma fire-and-forget.
 */
export function useTutorial() {
  const router = useRouter();
  const { userRole } = useAuthStore();
  const run = useTutorialStore((s) => s.run);
  const upsertProgress = useTutorialStore((s) => s.upsertProgress);
  const startStore = useTutorialStore((s) => s.startTutorial);
  const stop = useTutorialStore((s) => s.stopTutorial);

  const tutorial = run ? getTutorialById(run.tutorialId) : null;
  const allSteps = tutorial ? resolveStepsForRole(tutorial, userRole) : [];
  const total = allSteps.length;
  const stepIndex = run?.stepIndex ?? 0;
  const step: TutorialStep | undefined = allSteps[stepIndex];
  const isFallback = run?.isFallback ?? false;

  const save = useCallback(
    async (
      tutorialId: string,
      data: Parameters<typeof tutorialProgressApi.update>[1],
    ) => {
      try {
        const res = await tutorialProgressApi.update(tutorialId, data);
        if (res.data) upsertProgress(res.data);
      } catch {
        // sem-op: progresso é melhoria; manter UX fluida
      }
    },
    [upsertProgress],
  );

  const start = useCallback(
    (tutorialId: string, stepIndexArg = 0) => {
      const def = getTutorialById(tutorialId);
      if (!def) return;
      startStore(tutorialId, stepIndexArg);
      const first = def.steps[stepIndexArg];
      void save(tutorialId, {
        status: 'in_progress',
        currentStepId: first?.id ?? null,
      });
    },
    [save, startStore],
  );

  const restart = useCallback(
    async (tutorialId: string) => {
      try {
        const res = await tutorialProgressApi.restart(tutorialId);
        if (res.data) upsertProgress(res.data);
      } catch {
        // ignore
      }
      start(tutorialId, 0);
    },
    [start, upsertProgress],
  );

  const goNext = useCallback(() => {
    if (!tutorial || !run) return;
    const next = run.stepIndex + 1;
    const nextStep = allSteps[next];
    if (!nextStep) {
      // finalizar
      void save(tutorial.id, {
        status: 'completed',
        currentStepId: null,
        completedSteps: allSteps.map((s) => s.id),
      });
      stop();
      return;
    }
    // navegação opcional antes de avançar
    if (step?.nextRoute) router.push(step.nextRoute);
    useTutorialStore.getState().goToStep(next);
    void save(tutorial.id, {
      status: 'in_progress',
      currentStepId: nextStep.id,
      completedSteps: allSteps.slice(0, next).map((s) => s.id),
    });
  }, [allSteps, router, run, save, step?.nextRoute, stop, tutorial]);

  const goPrev = useCallback(() => {
    if (!tutorial || !run) return;
    const prev = Math.max(0, run.stepIndex - 1);
    const prevStep = allSteps[prev];
    useTutorialStore.getState().goToStep(prev);
    void save(tutorial.id, {
      status: 'in_progress',
      currentStepId: prevStep?.id ?? null,
    });
  }, [allSteps, run, save, tutorial]);

  const skip = useCallback(() => {
    if (!tutorial) return;
    void save(tutorial.id, { status: 'skipped' });
    stop();
  }, [save, stop, tutorial]);

  const finish = useCallback(() => {
    if (!tutorial) return;
    void save(tutorial.id, {
      status: 'completed',
      currentStepId: null,
      completedSteps: allSteps.map((s) => s.id),
    });
    stop();
  }, [allSteps, save, stop, tutorial]);

  // Controla comportamento quando target não existe:
  // - required: exibe fallback central (não pula)
  // - skipIfTargetMissing: pula automaticamente (passos opcionais)
  // - Nenhuma flag: nenhuma ação automática
  useEffect(() => {
    if (!step?.target) return;
    if (typeof document === 'undefined') return;
    if (!step.skipIfTargetMissing && !step.required) return;

    const waitMs = step.waitForTargetMs ?? 600;
    const id = window.setTimeout(() => {
      const el = document.querySelector(`[data-tutorial="${step.target}"]`);
      if (!el) {
        if (step.required) {
          useTutorialStore.getState().setFallback(true);
        } else if (step.skipIfTargetMissing) {
          goNext();
        }
      } else {
        // target existe — garantir que o fallback está desativado
        useTutorialStore.getState().setFallback(false);
      }
    }, waitMs);
    return () => window.clearTimeout(id);
  }, [step, goNext]);

  // Fechar com Escape
  useEffect(() => {
    if (!run) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') skip();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [run, skip]);

  return {
    tutorial,
    step,
    stepIndex,
    total,
    isLast: stepIndex >= total - 1,
    isFirst: stepIndex === 0,
    isFallback,
    start,
    restart,
    stop,
    goNext,
    goPrev,
    skip,
    finish,
  };
}
