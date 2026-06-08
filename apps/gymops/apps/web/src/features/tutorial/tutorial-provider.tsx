'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '@/store/auth';
import { tutorialProgressApi } from './tutorial-progress-api';
import { useTutorialStore } from './tutorial-store';
import { TUTORIAL_REGISTRY, getTutorialById } from './tutorial.registry';
import { TutorialOverlay } from './tutorial-overlay';
import { OnboardingPrompt } from './onboarding-prompt';

/**
 * Carrega o progresso de tutoriais do usuário autenticado e decide se
 * deve abrir o convite de onboarding. Renderiza o overlay e o prompt.
 *
 * Também monitora `pendingStart`: quando a Central de Ajuda navega para a
 * rota canônica de um tutorial, este provider detecta a chegada e inicia
 * o overlay automaticamente — evitando iniciar na rota /help.
 */
export function TutorialProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { isAuthenticated, sessionReady, hasHydrated } = useAuthStore();
  const setProgress = useTutorialStore((s) => s.setProgress);
  const setOnboardingPromptVisible = useTutorialStore((s) => s.setOnboardingPromptVisible);
  const pendingStart = useTutorialStore((s) => s.pendingStart);
  const run = useTutorialStore((s) => s.run);

  const { data } = useQuery({
    queryKey: ['tutorial-progress'],
    queryFn: tutorialProgressApi.list,
    enabled: hasHydrated && sessionReady && isAuthenticated,
    staleTime: 5 * 60 * 1000,
  });

  useEffect(() => {
    if (!data?.data) return;
    setProgress(data.data);

    const onboarding = TUTORIAL_REGISTRY.find((t) => t.isOnboarding);
    if (!onboarding) return;
    const existing = data.data.find((p) => p.tutorialId === onboarding.id);
    const finished = existing && ['completed', 'skipped'].includes(existing.status);
    if (!finished) {
      // pequena espera para não pular na cara do usuário
      const id = window.setTimeout(() => setOnboardingPromptVisible(true), 800);
      return () => window.clearTimeout(id);
    }
  }, [data, setProgress, setOnboardingPromptVisible]);

  // Monitora tutorial pendente de início após navegação da Central de Ajuda.
  // Quando chegamos à rota correta (ou se o tutorial não tem rota específica),
  // inicia o overlay e limpa o estado pendente.
  useEffect(() => {
    if (!pendingStart || run) return;
    const def = getTutorialById(pendingStart);
    if (!def) {
      useTutorialStore.getState().setPendingStart(null);
      return;
    }
    const startRoute = def.startRoute ?? def.steps.find((s) => s.route)?.route;
    if (!startRoute || pathname.startsWith(startRoute)) {
      useTutorialStore.getState().startTutorial(pendingStart);
      useTutorialStore.getState().setPendingStart(null);
    }
  }, [pendingStart, pathname, run]);

  return (
    <>
      {children}
      <OnboardingPrompt />
      <TutorialOverlay />
    </>
  );
}
