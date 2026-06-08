'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Sparkles, X, ChevronRight } from 'lucide-react';
import { aiApi, type DailySummary } from '@/lib/ai-api';

interface Props {
  unitId: string;
}

export function DailySummaryBadge({ unitId }: Props) {
  const [open, setOpen] = useState(false);

  const { data } = useQuery({
    queryKey: ['daily-summary', unitId],
    queryFn: () => aiApi.getDailySummary(unitId),
    staleTime: 15 * 60 * 1000,
  });

  const summary: DailySummary | null = data?.data ?? null;
  if (!summary) return null;

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 rounded-full border border-violet-200 bg-violet-50 px-3 py-1 text-xs font-medium text-violet-700 hover:bg-violet-100 transition-colors"
      >
        <Sparkles className="h-3.5 w-3.5" />
        Resumo de hoje disponível
        <ChevronRight className="h-3 w-3" />
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-xl border bg-background shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b px-5 py-4">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-violet-500" />
                <h2 className="font-semibold text-sm">Resumo Diário — {summary.unitName}</h2>
              </div>
              <button onClick={() => setOpen(false)} className="rounded p-1 hover:bg-muted">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <p className="text-sm leading-relaxed text-muted-foreground">{summary.summary}</p>

              {summary.highlights.length > 0 && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                    Destaques
                  </p>
                  <ul className="space-y-1.5">
                    {summary.highlights.map((h, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm">
                        <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-violet-500" />
                        {h}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {summary.alertCount > 0 && (
                <div className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
                  {summary.alertCount} item{summary.alertCount !== 1 ? 's' : ''} requer{summary.alertCount === 1 ? '' : 'em'} ação imediata
                </div>
              )}

              <p className="text-xs text-muted-foreground">
                Gerado às {new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(new Date(summary.generatedAt))}
              </p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
