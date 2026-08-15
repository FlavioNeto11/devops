import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface QueryErrorStateProps {
  /** Título curto do erro. */
  title?: string;
  /** Descrição opcional explicando o próximo passo. */
  description?: string;
  /** Re-executa a(s) query(ies) que falharam (ex.: refetch do React Query). */
  onRetry?: () => void;
  className?: string;
}

/**
 * Estado de erro padronizado para queries (React Query): banner com aviso
 * acessível (role="alert") + ação "Tentar novamente". Irmão do EmptyState —
 * usar quando `isError` for true, em vez de renderizar dados zerados.
 */
export function QueryErrorState({
  title = 'Não foi possível carregar os dados',
  description = 'Verifique sua conexão e tente novamente.',
  onRetry,
  className,
}: QueryErrorStateProps) {
  return (
    <div
      role="alert"
      className={cn(
        'flex flex-col items-center justify-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-8 text-center',
        className,
      )}
    >
      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-destructive/10 text-destructive">
        <AlertTriangle className="h-5 w-5" aria-hidden="true" />
      </div>
      <p className="text-sm font-medium text-foreground">{title}</p>
      {description && <p className="max-w-sm text-xs text-muted-foreground">{description}</p>}
      {onRetry && (
        <Button variant="outline" size="sm" className="mt-1 gap-1.5" onClick={onRetry}>
          <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
          Tentar novamente
        </Button>
      )}
    </div>
  );
}
