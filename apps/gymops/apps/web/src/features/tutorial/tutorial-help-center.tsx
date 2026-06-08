'use client';

import { useMemo, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { Search, Play, RotateCcw, CheckCircle2, SkipForward, Clock, BookOpen } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useAuthStore } from '@/store/auth';
import { useTutorialStore } from './tutorial-store';
import {
  TUTORIAL_REGISTRY,
  TUTORIAL_CATEGORY_LABELS,
  getTutorialById,
} from './tutorial.registry';
import { tutorialProgressApi } from './tutorial-progress-api';
import type { TutorialCategory, TutorialDefinition } from './tutorial.types';

const STATUS_LABELS: Record<string, { label: string; icon: React.ElementType; className: string }> = {
  not_started: { label: 'Não iniciado', icon: BookOpen, className: 'text-muted-foreground' },
  in_progress: { label: 'Em andamento', icon: Clock, className: 'text-amber-600' },
  deferred: { label: 'Adiado', icon: Clock, className: 'text-muted-foreground' },
  completed: { label: 'Concluído', icon: CheckCircle2, className: 'text-green-600' },
  skipped: { label: 'Pulado', icon: SkipForward, className: 'text-muted-foreground' },
};

/** Rota canônica de início para um tutorial (startRoute > primeiro step com route). */
function getStartRoute(tutorialId: string): string | undefined {
  const def = getTutorialById(tutorialId);
  if (!def) return undefined;
  return def.startRoute ?? def.steps.find((s) => s.route)?.route;
}

export function TutorialHelpCenter() {
  const router = useRouter();
  const pathname = usePathname();
  const { userRole } = useAuthStore();
  const progress = useTutorialStore((s) => s.progress);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<TutorialCategory | 'all'>('all');

  /**
   * Lógica central: se o tutorial tem uma rota canônica e não estamos nela,
   * armazena como pendingStart e navega. O TutorialProvider deteta a chegada
   * na rota e inicia o overlay no momento certo.
   * Se já estamos na rota correta (ou o tutorial não tem rota), inicia imediatamente.
   */
  function navigateOrStart(tutorialId: string) {
    const targetRoute = getStartRoute(tutorialId);
    if (targetRoute && !pathname.startsWith(targetRoute)) {
      useTutorialStore.getState().setPendingStart(tutorialId);
      router.push(targetRoute);
    } else {
      useTutorialStore.getState().startTutorial(tutorialId);
    }
  }

  async function handleStart(tutorialId: string) {
    navigateOrStart(tutorialId);
  }

  async function handleRestart(tutorialId: string) {
    // Resetar progresso no backend antes de iniciar
    try {
      const res = await tutorialProgressApi.restart(tutorialId);
      if (res.data) useTutorialStore.getState().upsertProgress(res.data);
    } catch {
      // ignore — UX não deve travar por falha de progresso
    }
    navigateOrStart(tutorialId);
  }

  const visible = useMemo(() => {
    if (!userRole) return [] as TutorialDefinition[];
    const q = search.trim().toLowerCase();
    return TUTORIAL_REGISTRY.filter((t) => t.rolesAllowed.includes(userRole))
      .filter((t) => categoryFilter === 'all' || t.category === categoryFilter)
      .filter((t) =>
        !q ||
        t.title.toLowerCase().includes(q) ||
        t.description.toLowerCase().includes(q) ||
        t.steps.some((s) => s.title.toLowerCase().includes(q) || s.body.toLowerCase().includes(q)),
      );
  }, [userRole, search, categoryFilter]);

  const grouped = useMemo(() => {
    const acc = new Map<TutorialCategory, TutorialDefinition[]>();
    for (const t of visible) {
      const list = acc.get(t.category) ?? [];
      list.push(t);
      acc.set(t.category, list);
    }
    return acc;
  }, [visible]);

  const categories = (Object.keys(TUTORIAL_CATEGORY_LABELS) as TutorialCategory[]).filter((c) =>
    grouped.has(c),
  );

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold">Central de ajuda</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Tutoriais guiados para usar o GymOps no dia a dia. Cada tutorial mostra a tela real com destaques contextuais.
        </p>
      </header>

      {/* Filtros */}
      <div className="space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por tópico ou palavra..."
            className="pl-9"
            data-testid="help-search"
          />
        </div>
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => setCategoryFilter('all')}
            className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
              categoryFilter === 'all' ? 'bg-primary text-primary-foreground border-primary' : 'border-border hover:bg-muted'
            }`}
          >
            Todos
          </button>
          {(Object.entries(TUTORIAL_CATEGORY_LABELS) as Array<[TutorialCategory, string]>).map(([cat, label]) => (
            <button
              key={cat}
              onClick={() => setCategoryFilter(cat)}
              className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                categoryFilter === cat ? 'bg-primary text-primary-foreground border-primary' : 'border-border hover:bg-muted'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {visible.length === 0 ? (
        <div className="text-center py-16 border rounded-lg">
          <BookOpen className="h-10 w-10 mx-auto mb-3 text-muted-foreground opacity-50" />
          <p className="font-medium">Nenhum tutorial encontrado</p>
          <p className="text-sm text-muted-foreground mt-1">Ajuste a busca ou troque o filtro.</p>
        </div>
      ) : (
        categories.map((cat) => {
          const items = grouped.get(cat) ?? [];
          return (
            <section key={cat} className="space-y-3">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                {TUTORIAL_CATEGORY_LABELS[cat]}
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {items.map((t) => {
                  const p = progress[t.id];
                  const statusKey = p?.status ?? 'not_started';
                  const sCfg = STATUS_LABELS[statusKey]!;
                  const SIcon = sCfg.icon;
                  const isStarted = p && p.status !== 'not_started';

                  return (
                    <div
                      key={t.id}
                      className="rounded-lg border p-4 hover:bg-muted/30 transition-colors flex flex-col"
                      data-testid={`tutorial-card-${t.id}`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="font-semibold text-sm leading-tight">{t.title}</h3>
                        <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                          {t.estimatedMinutes} min
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed flex-1">{t.description}</p>
                      <div className="mt-3 flex items-center justify-between gap-2">
                        <Badge variant="outline" className="gap-1 text-[10px]">
                          <SIcon className={`h-3 w-3 ${sCfg.className}`} />
                          {sCfg.label}
                        </Badge>
                        <div className="flex gap-1">
                          {isStarted && (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleRestart(t.id)}
                              className="h-7 text-xs gap-1"
                              data-testid={`tutorial-restart-${t.id}`}
                            >
                              <RotateCcw className="h-3 w-3" />
                              Reiniciar
                            </Button>
                          )}
                          <Button
                            size="sm"
                            onClick={() => handleStart(t.id)}
                            className="h-7 text-xs gap-1"
                            data-testid={`tutorial-start-${t.id}`}
                          >
                            <Play className="h-3 w-3" />
                            {p?.status === 'in_progress' ? 'Continuar' : 'Começar'}
                          </Button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          );
        })
      )}
    </div>
  );
}
