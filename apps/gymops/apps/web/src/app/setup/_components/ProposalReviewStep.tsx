'use client';

import { useEffect, useRef, useState } from 'react';
import {
  ChevronDown, ChevronUp, Lock, LockOpen, Plus, Sparkles, Trash2, X,
  AlertTriangle, CheckCircle2, MapPin,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { organizationApi, type BlueprintTemplate, type BlueprintUnit } from '@/lib/profile-api';
import { PALETTE, toKebabKey, toSlug, type EditableArea, type WizardState } from './setup-types';

type SlugStatus = 'idle' | 'checking' | 'available' | 'taken';

const PRIORITIES: Array<BlueprintTemplate['defaultPriority']> = ['baixa', 'media', 'alta', 'critica'];

/**
 * Revisão da proposta da IA (ou edição avançada): nome/slug, áreas com cor e
 * visibilidade, templates por área e unidades. NADA é criado aqui — o commit
 * acontece só no passo final (POST /organizations com blueprint).
 */
export function ProposalReviewStep({
  state,
  onPatch,
}: {
  state: WizardState;
  onPatch: (updates: Partial<WizardState>) => void;
}) {
  const [slugStatus, setSlugStatus] = useState<SlugStatus>('idle');
  const [expandedAreaKey, setExpandedAreaKey] = useState<string | null>(null);
  const [newAreaName, setNewAreaName] = useState('');
  const slugTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Checagem de slug com debounce (reusa GET /organizations/slug-available).
  useEffect(() => {
    if (!/^[a-z0-9-]{3,}$/.test(state.slug)) {
      setSlugStatus('idle');
      return undefined;
    }
    setSlugStatus('checking');
    if (slugTimer.current) clearTimeout(slugTimer.current);
    slugTimer.current = setTimeout(() => {
      organizationApi.checkSlug(state.slug)
        .then((res) => setSlugStatus(res.data.available ? 'available' : 'taken'))
        .catch(() => setSlugStatus('idle'));
    }, 500);
    return () => {
      if (slugTimer.current) clearTimeout(slugTimer.current);
    };
  }, [state.slug]);

  const patchArea = (key: string, updates: Partial<EditableArea>) => {
    onPatch({
      areas: state.areas.map((a) => (a.key === key ? { ...a, ...updates } : a)),
      areasDirty: true,
    });
  };

  const patchTemplate = (areaKey: string, idx: number, updates: Partial<BlueprintTemplate>) => {
    onPatch({
      areas: state.areas.map((a) =>
        a.key === areaKey
          ? { ...a, templates: a.templates.map((t, i) => (i === idx ? { ...t, ...updates } : t)) }
          : a,
      ),
      areasDirty: true,
    });
  };

  const removeTemplate = (areaKey: string, idx: number) => {
    onPatch({
      areas: state.areas.map((a) =>
        a.key === areaKey ? { ...a, templates: a.templates.filter((_, i) => i !== idx) } : a,
      ),
      areasDirty: true,
    });
  };

  const addArea = () => {
    const name = newAreaName.trim();
    if (!name || state.areas.length >= 10) return;
    let key = toKebabKey(name) || `area-${state.areas.length + 1}`;
    while (state.areas.some((a) => a.key === key)) key = `${key}-2`.slice(0, 40);
    const color = PALETTE[state.areas.length % PALETTE.length]!;
    onPatch({
      areas: [...state.areas, { key, name, color, visibilityDefault: 'inherited', templates: [], canonical: false }],
      areasDirty: true,
    });
    setNewAreaName('');
  };

  const confidencePct = Math.round((state.confidence ?? 0) * 100);

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">Revise a proposta</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Tudo aqui é editável — nada será criado até você confirmar no final.
        </p>
      </div>

      {/* Confiança + segmento (presentes só no fluxo IA) */}
      {state.aiProposed && state.confidence !== null && (
        <div className="rounded-xl border bg-muted/30 p-3 md:p-4">
          <div className="flex flex-wrap items-center gap-2">
            {state.segmentLabel && (
              <span className="inline-flex items-center gap-1.5 rounded-full border bg-background px-2.5 py-0.5 text-xs font-medium">
                <Sparkles className="h-3 w-3 text-violet-500" />
                {state.segmentLabel}
              </span>
            )}
            <span className="ml-auto inline-flex items-center gap-1.5 text-xs text-muted-foreground">
              {state.confidence >= 0.7
                ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                : <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />}
              Confiança da IA: {confidencePct}%
            </span>
          </div>
          {state.confidence < 0.5 && (
            <p className="mt-2 text-xs text-amber-700 dark:text-amber-400">
              A descrição ficou ampla — revise as áreas e rotinas com atenção antes de criar.
            </p>
          )}
          {state.reasoning && <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{state.reasoning}</p>}
        </div>
      )}

      {/* Nome + slug */}
      <div className="grid gap-3 md:grid-cols-2">
        <div>
          <label htmlFor="rv-orgname" className="mb-1 block text-sm font-medium">Nome da empresa *</label>
          <Input
            id="rv-orgname"
            value={state.orgName}
            onChange={(e) => {
              const name = e.target.value;
              onPatch({ orgName: name, ...(!state.slugManual ? { slug: toSlug(name).slice(0, 60) } : {}) });
            }}
            placeholder="Ex: Clínica Sorriso"
          />
        </div>
        <div>
          <label htmlFor="rv-slug" className="mb-1 block text-sm font-medium">Identificador (slug) *</label>
          <Input
            id="rv-slug"
            value={state.slug}
            onChange={(e) => onPatch({ slugManual: true, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-').slice(0, 60) })}
          />
          <p className={`mt-1 text-xs ${slugStatus === 'taken' ? 'text-red-600' : slugStatus === 'available' ? 'text-emerald-600' : 'text-muted-foreground'}`}>
            {slugStatus === 'checking' && 'Verificando disponibilidade…'}
            {slugStatus === 'available' && 'Disponível ✓'}
            {slugStatus === 'taken' && 'Este identificador já está em uso.'}
            {slugStatus === 'idle' && 'Letras minúsculas, números e hífens. Não muda depois.'}
          </p>
        </div>
      </div>

      {/* Áreas */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-semibold">Áreas funcionais ({state.areas.length})</h3>
          <span className="text-xs text-muted-foreground">{state.areas.reduce((n, a) => n + a.templates.length, 0)} rotinas propostas</span>
        </div>
        <div className="space-y-2">
          {state.areas.map((area) => {
            const expanded = expandedAreaKey === area.key;
            return (
              <div key={area.key} className="rounded-xl border bg-card">
                <div className="flex items-center gap-2 p-2.5 md:p-3">
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
                    className="h-7 w-7 text-muted-foreground"
                    aria-label={expanded ? 'Recolher rotinas' : `Ver rotinas (${area.templates.length})`}
                    onClick={() => setExpandedAreaKey(expanded ? null : area.key)}
                  >
                    {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
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

                {expanded && (
                  <div className="space-y-2 border-t px-3 pb-3 pt-2">
                    {area.templates.length === 0 && (
                      <p className="text-xs text-muted-foreground">
                        {area.canonical ? 'Esta área receberá as rotinas padrão do sistema.' : 'Sem rotinas — adicione abaixo ou deixe vazio.'}
                      </p>
                    )}
                    {area.templates.map((tmpl, idx) => (
                      <div key={`${area.key}-t-${idx}`} className="rounded-lg border bg-muted/20 p-2.5">
                        <div className="flex items-center gap-2">
                          <Input
                            value={tmpl.name}
                            onChange={(e) => patchTemplate(area.key, idx, { name: e.target.value.slice(0, 120) })}
                            className="h-7 flex-1 text-xs font-medium"
                            aria-label="Nome da rotina"
                          />
                          <select
                            value={tmpl.defaultPriority}
                            onChange={(e) => patchTemplate(area.key, idx, { defaultPriority: e.target.value as BlueprintTemplate['defaultPriority'] })}
                            className="h-7 rounded-md border bg-background px-1.5 text-xs"
                            aria-label="Prioridade padrão"
                          >
                            {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
                          </select>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 text-muted-foreground hover:text-red-600"
                            aria-label="Remover rotina"
                            onClick={() => removeTemplate(area.key, idx)}
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        </div>
                        {tmpl.defaultChecklist.length > 0 && (
                          <p className="mt-1.5 line-clamp-2 text-[11px] leading-relaxed text-muted-foreground">
                            {tmpl.defaultChecklist.length} passos: {tmpl.defaultChecklist.join(' · ')}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {state.areas.length < 10 && (
          <div className="mt-2 flex gap-2">
            <Input
              value={newAreaName}
              onChange={(e) => setNewAreaName(e.target.value)}
              placeholder="Nova área (ex: Compras)…"
              className="h-8 text-sm"
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addArea(); } }}
            />
            <Button variant="outline" size="sm" className="h-8 gap-1.5 shrink-0" onClick={addArea} disabled={!newAreaName.trim()}>
              <Plus className="h-3.5 w-3.5" />
              Adicionar
            </Button>
          </div>
        )}
      </div>

      {/* Unidades */}
      <div>
        <div className="mb-2 flex items-center gap-2">
          <MapPin className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold">Unidades ({state.units.length})</h3>
          <span className="text-xs text-muted-foreground">opcional — dá para criar depois</span>
        </div>
        <UnitListEditor units={state.units} onChange={(units) => onPatch({ units })} />
      </div>
    </div>
  );
}

export function UnitListEditor({
  units,
  onChange,
}: {
  units: BlueprintUnit[];
  onChange: (units: BlueprintUnit[]) => void;
}) {
  const patchUnit = (idx: number, updates: Partial<BlueprintUnit>) =>
    onChange(units.map((u, i) => (i === idx ? { ...u, ...updates } : u)));

  return (
    <div className="space-y-2">
      {units.map((unit, idx) => (
        <div key={`unit-${idx}`} className="flex flex-wrap items-center gap-2 rounded-lg border p-2">
          <Input
            value={unit.name}
            onChange={(e) => patchUnit(idx, { name: e.target.value.slice(0, 100) })}
            placeholder="Nome da unidade"
            className="h-8 min-w-[140px] flex-1 text-sm"
            aria-label="Nome da unidade"
          />
          <Input
            value={unit.code ?? ''}
            onChange={(e) => patchUnit(idx, { code: e.target.value.slice(0, 20) || undefined })}
            placeholder="Código"
            className="h-8 w-20 text-sm"
            aria-label="Código da unidade"
          />
          <Input
            value={unit.address ?? ''}
            onChange={(e) => patchUnit(idx, { address: e.target.value.slice(0, 255) || undefined })}
            placeholder="Endereço (opcional)"
            className="h-8 min-w-[160px] flex-[2] text-sm"
            aria-label="Endereço da unidade"
          />
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-muted-foreground hover:text-red-600"
            aria-label="Remover unidade"
            onClick={() => onChange(units.filter((_, i) => i !== idx))}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      ))}
      {units.length < 5 && (
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5"
          onClick={() => onChange([...units, { name: '' }])}
        >
          <Plus className="h-3.5 w-3.5" />
          Adicionar unidade
        </Button>
      )}
    </div>
  );
}
