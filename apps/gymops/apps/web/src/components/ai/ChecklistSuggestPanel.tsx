'use client';

import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Sparkles, Loader2, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { aiApi, type ChecklistItem } from '@/lib/ai-api';

interface Props {
  activityId: string;
  onAddItems: (items: string[]) => void;
}

export function ChecklistSuggestPanel({ activityId, onAddItems }: Props) {
  const [suggestions, setSuggestions] = useState<ChecklistItem[] | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [expanded, setExpanded] = useState(false);

  const suggestMutation = useMutation({
    mutationFn: () => aiApi.suggestChecklist(activityId),
    onSuccess: (res) => {
      const items = res.data.items;
      setSuggestions(items);
      setSelected(new Set(items.map((_, i) => i).filter((i) => !items[i]?.optional)));
      setExpanded(true);
    },
    onError: () => toast.error('Falha ao sugerir checklist'),
  });

  const toggleItem = (idx: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  const handleAdd = () => {
    if (!suggestions) return;
    const items = [...selected].map((i) => suggestions[i]?.text).filter((t): t is string => !!t);
    if (items.length === 0) return;
    onAddItems(items);
    setSuggestions(null);
    setExpanded(false);
    toast.success(`${items.length} item${items.length > 1 ? 's adicionados' : ' adicionado'}`);
  };

  if (!expanded || !suggestions) {
    return (
      <Button
        variant="ghost"
        size="sm"
        className="gap-1.5 text-xs text-violet-600 hover:text-violet-700"
        onClick={() => suggestMutation.mutate()}
        disabled={suggestMutation.isPending}
      >
        {suggestMutation.isPending
          ? <><Loader2 className="h-3.5 w-3.5 animate-spin" />Sugerindo...</>
          : <><Sparkles className="h-3.5 w-3.5" />Sugerir checklist com IA</>}
      </Button>
    );
  }

  return (
    <div className="rounded-lg border border-violet-200 bg-violet-50 p-3 space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-violet-700 flex items-center gap-1.5">
          <Sparkles className="h-3.5 w-3.5" />
          Sugestões da IA
        </p>
        <button
          onClick={() => setExpanded(false)}
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          fechar
        </button>
      </div>

      <div className="space-y-1.5">
        {suggestions.map((item, i) => (
          <label key={i} className="flex items-start gap-2 cursor-pointer">
            <Checkbox
              checked={selected.has(i)}
              onCheckedChange={() => toggleItem(i)}
              className="mt-0.5"
            />
            <div className="min-w-0">
              <p className="text-xs leading-snug">{item.text}</p>
              {item.rationale && (
                <p className="text-xs text-muted-foreground mt-0.5">{item.rationale}</p>
              )}
              {item.optional && (
                <span className="text-xs text-muted-foreground">(opcional)</span>
              )}
            </div>
          </label>
        ))}
      </div>

      <Button
        size="sm"
        className="w-full gap-1.5"
        onClick={handleAdd}
        disabled={selected.size === 0}
      >
        <Plus className="h-3.5 w-3.5" />
        Adicionar {selected.size} selecionado{selected.size !== 1 ? 's' : ''}
      </Button>
    </div>
  );
}
