'use client';

import { Sparkles, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useTutorialStore } from './tutorial-store';
import { useTutorial } from './useTutorial';
import { TUTORIAL_REGISTRY } from './tutorial.registry';
import { tutorialProgressApi } from './tutorial-progress-api';

/**
 * Toast persistente, canto inferior direito, convidando o usuário ao tour
 * de primeiros passos. Pode ser ignorado, adiado ou pulado para sempre.
 */
export function OnboardingPrompt() {
  const visible = useTutorialStore((s) => s.onboardingPromptVisible);
  const setVisible = useTutorialStore((s) => s.setOnboardingPromptVisible);
  const upsertProgress = useTutorialStore((s) => s.upsertProgress);
  const { start } = useTutorial();

  const onboarding = TUTORIAL_REGISTRY.find((t) => t.isOnboarding);
  if (!visible || !onboarding) return null;

  const handleStart = () => {
    setVisible(false);
    start(onboarding.id, 0);
  };

  const handleLater = async () => {
    setVisible(false);
    try {
      const res = await tutorialProgressApi.update(onboarding.id, { status: 'deferred' });
      if (res.data) upsertProgress(res.data);
    } catch {
      // ignore
    }
  };

  const handleNeverAgain = async () => {
    setVisible(false);
    try {
      const res = await tutorialProgressApi.update(onboarding.id, { status: 'skipped' });
      if (res.data) upsertProgress(res.data);
    } catch {
      // ignore
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="false"
      aria-labelledby="onboarding-prompt-title"
      data-testid="onboarding-prompt"
      className="fixed bottom-4 right-4 left-4 sm:left-auto z-[55] max-w-sm rounded-xl border bg-card shadow-xl"
    >
      <div className="flex items-start gap-3 p-4">
        <div className="shrink-0 flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Sparkles className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 id="onboarding-prompt-title" className="text-sm font-semibold">
            Quer fazer um tour rápido pelo GymOps?
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Cerca de {onboarding.estimatedMinutes} minutos. Você pode parar a qualquer momento.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" onClick={handleStart} data-testid="onboarding-start">
              Começar agora
            </Button>
            <Button size="sm" variant="outline" onClick={handleLater} data-testid="onboarding-later">
              Depois
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="text-muted-foreground"
              onClick={handleNeverAgain}
              data-testid="onboarding-never"
            >
              Não mostrar mais
            </Button>
          </div>
        </div>
        <button
          onClick={handleLater}
          aria-label="Fechar"
          className="shrink-0 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
