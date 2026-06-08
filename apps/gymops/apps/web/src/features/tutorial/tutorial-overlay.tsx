'use client';

import { useTutorial } from './useTutorial';
import { TutorialHighlight } from './tutorial-highlight';
import { TutorialStepCard } from './tutorial-step-card';

/**
 * Componente raiz do tutorial em execução. Quando não há tutorial ativo,
 * não renderiza nada.
 */
export function TutorialOverlay() {
  const { tutorial, step, stepIndex, total, isFirst, isLast, goNext, goPrev, skip, stop, isFallback } =
    useTutorial();

  if (!tutorial || !step) return null;

  return (
    <>
      {/* Em modo fallback, não destacar elemento — overlay simples e card central */}
      <TutorialHighlight target={isFallback ? undefined : step.target} />
      <TutorialStepCard
        tutorial={tutorial}
        step={step}
        stepIndex={stepIndex}
        total={total}
        isFirst={isFirst}
        isLast={isLast}
        isFallback={isFallback}
        onPrev={goPrev}
        onNext={goNext}
        onSkip={skip}
        onClose={stop}
      />
    </>
  );
}
