'use client';

import { useEffect, useRef } from 'react';
import { X, ChevronLeft, ChevronRight, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { TutorialDefinition, TutorialStep } from './tutorial.types';
import { useStepCardPosition } from './tutorial-highlight';
import { TUTORIAL_STEP_PREVIEWS } from './tutorial-preview-components';

interface Props {
  tutorial: TutorialDefinition;
  step: TutorialStep;
  stepIndex: number;
  total: number;
  isFirst: boolean;
  isLast: boolean;
  /** true quando o target está ausente e o step é required — exibe fallback. */
  isFallback?: boolean;
  onPrev: () => void;
  onNext: () => void;
  onSkip: () => void;
  onClose: () => void;
}

export function TutorialStepCard({
  tutorial,
  step,
  stepIndex,
  total,
  isFirst,
  isLast,
  isFallback = false,
  onPrev,
  onNext,
  onSkip,
  onClose,
}: Props) {
  const cardRef = useRef<HTMLDivElement>(null);
  // Em modo fallback, centralizar o card independente do placement
  const style = useStepCardPosition(
    isFallback ? undefined : step.target,
    isFallback ? 'center' : (step.placement ?? 'bottom'),
  );

  const displayTitle = isFallback ? (step.fallbackTitle ?? step.title) : step.title;
  const displayBody = isFallback ? (step.fallbackBody ?? step.body) : step.body;

  useEffect(() => {
    cardRef.current?.focus();
  }, [step.id]);

  return (
    <div
      ref={cardRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="tutorial-step-title"
      tabIndex={-1}
      data-testid="tutorial-step-card"
      className="fixed z-[70] max-w-[calc(100vw-16px)] w-[360px] rounded-xl border bg-card text-card-foreground shadow-2xl focus:outline-none"
      style={style}
    >
      <div className="flex items-start justify-between gap-2 p-4 pb-2">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            {tutorial.title}
          </p>
          <h2 id="tutorial-step-title" className="text-base font-semibold mt-0.5 leading-tight">
            {displayTitle}
          </h2>
        </div>
        <button
          onClick={onClose}
          aria-label="Fechar tutorial"
          className="shrink-0 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {isFallback && (() => {
        const PreviewComponent = step.target ? TUTORIAL_STEP_PREVIEWS[step.target] : undefined;
        if (PreviewComponent) {
          return (
            <div className="mx-4 mb-1">
              <PreviewComponent />
            </div>
          );
        }
        return null;
      })()}

      <div className="px-4 pb-3 max-h-[40vh] overflow-y-auto">
        <p className="text-sm text-muted-foreground leading-relaxed">{displayBody}</p>
        {step.actionHint && !isFallback && (
          <p className="mt-3 text-xs font-medium text-primary">{step.actionHint}</p>
        )}
      </div>

      <div className="flex items-center justify-between gap-2 border-t p-3">
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground tabular-nums">
            {stepIndex + 1} / {total}
          </span>
          <button
            onClick={onSkip}
            className="text-xs text-muted-foreground hover:text-foreground underline-offset-2 hover:underline"
            data-testid="tutorial-skip"
          >
            Pular
          </button>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={onPrev}
            disabled={isFirst}
            aria-label="Passo anterior"
            data-testid="tutorial-prev"
          >
            <ChevronLeft className="h-4 w-4" />
            Voltar
          </Button>
          <Button
            size="sm"
            onClick={onNext}
            aria-label={isLast ? 'Concluir tutorial' : 'Próximo passo'}
            data-testid="tutorial-next"
            className="gap-1"
          >
            {isLast ? (
              <>
                Concluir <Check className="h-4 w-4" />
              </>
            ) : (
              <>
                Próximo <ChevronRight className="h-4 w-4" />
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
