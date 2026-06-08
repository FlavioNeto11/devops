'use client';

import { HelpCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuthStore } from '@/store/auth';
import { useTutorial } from './useTutorial';
import { getTutorialById } from './tutorial.registry';

interface Props {
  tutorialId: string;
  /** Label do botão. Default: "Ver tutorial". */
  label?: string;
  variant?: 'ghost' | 'outline' | 'default';
  size?: 'sm' | 'default' | 'icon';
  className?: string;
}

/**
 * Botão reutilizável que inicia um tutorial pelo ID. Renderiza nada se o
 * tutorial não estiver disponível para o papel atual — assim não polui
 * telas de viewer com botões inúteis.
 */
export function TutorialTrigger({ tutorialId, label = 'Ver tutorial', variant = 'ghost', size = 'sm', className }: Props) {
  const { userRole } = useAuthStore();
  const { start } = useTutorial();
  const def = getTutorialById(tutorialId);

  if (!def || !userRole || !def.rolesAllowed.includes(userRole)) return null;

  return (
    <Button
      type="button"
      variant={variant}
      size={size}
      className={className}
      onClick={() => start(tutorialId)}
      data-testid={`tutorial-trigger-${tutorialId}`}
    >
      <HelpCircle className="h-4 w-4" />
      {size !== 'icon' && <span className="ml-1.5">{label}</span>}
    </Button>
  );
}
