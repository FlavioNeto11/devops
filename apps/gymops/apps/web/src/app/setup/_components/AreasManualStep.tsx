'use client';

import { useState } from 'react';
import { Lock, LockOpen, Plus, RotateCcw, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { CANONICAL_AREAS_DISPLAY, PALETTE, toKebabKey, type EditableArea, type WizardState } from './setup-types';

export function buildCanonicalAreas(): EditableArea[] {
  return CANONICAL_AREAS_DISPLAY.map((a) => ({
    key: a.key,
    name: a.name,
    color: a.color,
    visibilityDefault: a.visibilityDefault,
    templates: [],
    canonical: true,
  }));
}

/**
 * Passo manual de áreas: as 6 padrão vêm pré-carregadas (com as rotinas do
 * sistema anexadas pelo backend); o usuário pode renomear, recolorir,
 * restringir, remover ou adicionar áreas próprias. Sem NENHUMA edição, a
 * criação segue o caminho canônico puro (sem blueprint).
 */
export function AreasManualStep({
  state,
  onPatch,
}: {
  state: WizardState;
  onPatch: (updates: Partial<WizardState>) => void;
}) {
  const [newAreaName, setNewAreaName] = useState('');

  // Renomear/recolorir/restringir NÃO quebra `canonical`: a key é o contrato —
  // o backend anexa as rotinas do sistema às keys canônicas sem `templates`.
  const patchArea = (key: string, updates: Partial<EditableArea>) => {
    onPatch({
      areas: state.areas.map((a) => (a.key === key ? { ...a, ...updates } : a)),
      areasDirty: true,
    });
  };

  const addArea = () => {
    const name = newAreaName.trim();
    if (!name || state.areas.length >= 10) return;
    let key = toKebabKey(name) || `area-${state.areas.length + 1}`;
    while (state.areas.some((a) => a.key === key)) key = `${key}-2`.slice(0, 40);
    onPatch({
      areas: [...state.areas, {
        key,
        name,
        color: PALETTE[state.areas.length % PALETTE.length]!,
        visibilityDefault: 'inherited',
        templates: [],
        canonical: false,
      }],
      areasDirty: true,
    });
    setNewAreaName('');
  };

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">Áreas funcionais</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          São os recortes de trabalho da sua operação. Mantenha as sugeridas,
          renomeie ou crie as suas — áreas padrão vêm com rotinas prontas.
        </p>
      </div>

      <div className="space-y-2">
        {state.areas.map((area) => (
          <div key={area.key} className="flex items-center gap-2 rounded-xl border bg-card p-2.5 md:p-3">
            <label className="relative h-5 w-5 shrink-0 cursor-pointer" aria-label={`Cor da área ${area.name}`}>
              <span className="absolute inset-0 rounded-full border" style={{ backgroundColor: area.color }} />
              <input
                type="color"
                value={area.color}
                onChange={(e) => patchArea(area.key, { color: e.target.value })}
                className="absolute inset-0 cursor-pointer opacity-0"
              />
            </label>
            <Input
              value={area.name}
              onChange={(e) => patchArea(area.key, { name: e.target.value.slice(0, 60) })}
              className="h-8 flex-1 border-transparent bg-transparent px-2 text-sm font-medium focus-visible:border-input"
              aria-label="Nome da área"
            />
            {area.canonical && (
              <span className="hidden shrink-0 rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground md:inline">
                rotinas inclusas
              </span>
            )}
            <Button
              variant="ghost"
              size="icon"
              className={`h-7 w-7 ${area.visibilityDefault === 'restricted' ? 'text-amber-600' : 'text-muted-foreground'}`}
              aria-label={area.visibilityDefault === 'restricted' ? 'Área restrita (clique para tornar herdada)' : 'Área herdada (clique para restringir)'}
              onClick={() => patchArea(area.key, { visibilityDefault: area.visibilityDefault === 'restricted' ? 'inherited' : 'restricted' })}
            >
              {area.visibilityDefault === 'restricted' ? <Lock className="h-3.5 w-3.5" /> : <LockOpen className="h-3.5 w-3.5" />}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground hover:text-red-600"
              aria-label="Remover área"
              disabled={state.areas.length <= 1}
              onClick={() => onPatch({ areas: state.areas.filter((a) => a.key !== area.key), areasDirty: true })}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        ))}
      </div>

      {state.areas.length < 10 && (
        <div className="flex gap-2">
          <Input
            value={newAreaName}
            onChange={(e) => setNewAreaName(e.target.value)}
            placeholder="Nova área (ex: Compras)…"
            className="h-9 text-sm"
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addArea(); } }}
          />
          <Button variant="outline" className="h-9 shrink-0 gap-1.5" onClick={addArea} disabled={!newAreaName.trim()}>
            <Plus className="h-4 w-4" />
            Adicionar
          </Button>
        </div>
      )}

      {state.areasDirty && (
        <button
          type="button"
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
          onClick={() => onPatch({ areas: buildCanonicalAreas(), areasDirty: false })}
        >
          <RotateCcw className="h-3 w-3" />
          Restaurar áreas padrão
        </button>
      )}
    </div>
  );
}
