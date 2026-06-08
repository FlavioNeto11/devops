'use client';

import { useMutation } from '@tanstack/react-query';
import { Brain, X, Loader2, AlertTriangle, Lightbulb, Wrench } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { aiApi, type DelayAnalysis } from '@/lib/ai-api';

interface Props {
  activityId: string;
  activityTitle: string;
  onClose: () => void;
}

const RISK_CONFIG: Record<string, { label: string; className: string }> = {
  low:      { label: 'Baixo',    className: 'bg-green-100 text-green-800' },
  medium:   { label: 'Médio',    className: 'bg-amber-100 text-amber-800' },
  high:     { label: 'Alto',     className: 'bg-orange-100 text-orange-800' },
  critical: { label: 'Crítico',  className: 'bg-red-100 text-red-800' },
};

export function DelayAnalysisModal({ activityId, activityTitle, onClose }: Props) {
  const mutation = useMutation({
    mutationFn: () => aiApi.analyzeDelay(activityId),
    onError: () => toast.error('Falha ao analisar atividade'),
  });

  const analysis: DelayAnalysis | undefined = mutation.data?.data;
  const riskConfig = analysis ? (RISK_CONFIG[analysis.riskLevel] ?? RISK_CONFIG.medium) : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-xl border bg-background shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between border-b px-5 py-4">
          <div className="flex items-center gap-2">
            <Brain className="h-5 w-5 text-violet-500" />
            <h2 className="font-semibold text-sm">Análise de Atraso</h2>
          </div>
          <button onClick={onClose} className="rounded p-1 hover:bg-muted">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <p className="text-sm font-medium text-muted-foreground line-clamp-2">{activityTitle}</p>

          {!mutation.data && !mutation.isPending && (
            <div className="py-2 text-center">
              <p className="text-sm text-muted-foreground mb-4">
                A IA analisará o contexto desta atividade e identificará possíveis causas e ações.
              </p>
              <Button onClick={() => mutation.mutate()} className="gap-1.5">
                <Brain className="h-4 w-4" />
                Analisar
              </Button>
            </div>
          )}

          {mutation.isPending && (
            <div className="flex flex-col items-center gap-3 py-6 text-muted-foreground">
              <Loader2 className="h-8 w-8 animate-spin text-violet-500" />
              <p className="text-sm">Analisando contexto...</p>
            </div>
          )}

          {analysis && riskConfig && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${riskConfig.className}`}>
                  Risco {riskConfig.label}
                </span>
              </div>

              <p className="text-sm text-muted-foreground">{analysis.summary}</p>

              {analysis.possibleReasons.length > 0 && (
                <div>
                  <p className="text-xs font-medium flex items-center gap-1.5 mb-1.5">
                    <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                    Possíveis causas
                  </p>
                  <ul className="space-y-1">
                    {analysis.possibleReasons.map((r, i) => (
                      <li key={i} className="flex items-start gap-2 text-xs">
                        <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400" />
                        {r}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {analysis.suggestedActions.length > 0 && (
                <div>
                  <p className="text-xs font-medium flex items-center gap-1.5 mb-1.5">
                    <Lightbulb className="h-3.5 w-3.5 text-green-500" />
                    Ações sugeridas
                  </p>
                  <ul className="space-y-1">
                    {analysis.suggestedActions.map((a, i) => (
                      <li key={i} className="flex items-start gap-2 text-xs">
                        <Wrench className="mt-0.5 h-3 w-3 shrink-0 text-green-500" />
                        {a}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
