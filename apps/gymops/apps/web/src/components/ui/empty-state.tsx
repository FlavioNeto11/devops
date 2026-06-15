import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface EmptyStateProps {
  /** Ícone Lucide (ou qualquer componente de ícone). */
  icon?: React.ElementType;
  /** Título curto do estado vazio. */
  title: string;
  /** Descrição opcional explicando o estado / próximo passo. */
  description?: string;
  /** Ação opcional (ex.: botão para criar o primeiro item). */
  action?: ReactNode;
  className?: string;
}

/**
 * Estado vazio padronizado: ícone + título + descrição + ação opcional.
 * Substitui textos crus como "Nenhum X encontrado".
 */
export function EmptyState({ icon: Icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-2 px-4 py-10 text-center',
        className,
      )}
    >
      {Icon && (
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <Icon className="h-5 w-5" aria-hidden="true" />
        </div>
      )}
      <p className="text-sm font-medium text-foreground">{title}</p>
      {description && (
        <p className="max-w-sm text-xs text-muted-foreground">{description}</p>
      )}
      {action && <div className="pt-1">{action}</div>}
    </div>
  );
}
