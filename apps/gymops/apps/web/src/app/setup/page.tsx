'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation } from '@tanstack/react-query';
import {
  ChevronLeft, ChevronRight, Check, Loader2, Sparkles, SlidersHorizontal, MapPin,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { organizationApi, type OrgBlueprint } from '@/lib/profile-api';
import { SetupShell, type ShellStep } from './_components/SetupShell';
import { ProposalReviewStep, UnitListEditor } from './_components/ProposalReviewStep';
import { AreasManualStep, buildCanonicalAreas } from './_components/AreasManualStep';
import {
  CANONICAL_AREAS_DISPLAY, INITIAL_WIZARD, toSlug,
  type SetupStep, type WizardState,
} from './_components/setup-types';

const CANONICAL_KEYS = new Set(CANONICAL_AREAS_DISPLAY.map((a) => a.key));

const AI_STEPS: ShellStep[] = [
  { id: 'mode', label: 'Como começar' },
  { id: 'describe', label: 'Seu negócio' },
  { id: 'review', label: 'Proposta' },
  { id: 'owner', label: 'Administrador' },
  { id: 'confirm', label: 'Confirmar' },
];

const MANUAL_STEPS: ShellStep[] = [
  { id: 'mode', label: 'Como começar' },
  { id: 'org', label: 'Organização' },
  { id: 'areas', label: 'Áreas' },
  { id: 'owner', label: 'Administrador' },
  { id: 'units', label: 'Unidades' },
  { id: 'confirm', label: 'Confirmar' },
];

export default function SetupPage() {
  const router = useRouter();
  const [step, setStep] = useState<SetupStep>('mode');
  const [state, setState] = useState<WizardState>(INITIAL_WIZARD);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const patch = (updates: Partial<WizardState>) => setState((prev) => ({ ...prev, ...updates }));

  const steps = state.mode === 'manual' ? MANUAL_STEPS : AI_STEPS;

  // ── Rascunho da IA (proposta; nada é criado aqui) ──────────────────────────
  const draftMutation = useMutation({
    mutationFn: () => organizationApi.setupDraft(state.businessDescription.trim(), state.orgName.trim() || undefined),
    onSuccess: (res) => {
      const draft = res.data;
      const name = state.orgName.trim() || draft.organizationName || '';
      patch({
        orgName: name,
        slug: state.slugManual && state.slug ? state.slug : (draft.suggestedSlug || toSlug(name).slice(0, 60)),
        segmentLabel: draft.segmentLabel ?? null,
        confidence: draft.confidence,
        reasoning: draft.reasoning ?? null,
        aiProposed: true,
        areas: draft.areas.map((a) => ({ ...a, templates: a.templates, canonical: false })),
        areasDirty: true,
        units: (draft.unitsSuggested ?? []).slice(0, 5),
      });
      setError('');
      setStep('review');
    },
    onError: (err: unknown) => {
      const message = (err as { message?: string })?.message ?? '';
      if (/AI_UNAVAILABLE|503/.test(message)) {
        setError('A IA está indisponível agora. Você pode tentar de novo em instantes ou seguir pelo caminho manual.');
      } else if (/429|rate/i.test(message)) {
        setError('Muitas tentativas em sequência — aguarde alguns minutos ou siga pelo caminho manual.');
      } else {
        setError('Não foi possível gerar a proposta agora. Tente novamente ou siga pelo caminho manual.');
      }
    },
  });

  // ── Criação (commit — só aqui algo é persistido) ───────────────────────────
  const buildBlueprint = (): OrgBlueprint | undefined => {
    if (state.mode === 'ai') {
      return {
        areas: state.areas.map((a) => ({
          key: a.key,
          name: a.name.trim(),
          color: a.color,
          visibilityDefault: a.visibilityDefault,
          templates: a.templates,
        })),
        units: state.units.filter((u) => u.name.trim()).map((u) => ({ ...u, name: u.name.trim() })),
      };
    }
    // Manual: sem edição de áreas e com ≤1 unidade → caminho canônico puro.
    const cleanUnits = state.units.filter((u) => u.name.trim()).map((u) => ({ ...u, name: u.name.trim() }));
    if (!state.areasDirty && cleanUnits.length <= 1) return undefined;
    return {
      areas: state.areas.map((a) => ({
        key: a.key,
        name: a.name.trim(),
        color: a.color,
        visibilityDefault: a.visibilityDefault,
        // Key canônica intocada estruturalmente → backend anexa as rotinas do
        // sistema; área custom vai com a lista explícita (vazia = sem rotinas).
        ...(a.canonical && CANONICAL_KEYS.has(a.key) ? {} : { templates: a.templates }),
      })),
      units: cleanUnits,
    };
  };

  const createMutation = useMutation({
    mutationFn: () => {
      const blueprint = buildBlueprint();
      const cleanUnits = state.units.filter((u) => u.name.trim());
      return organizationApi.create({
        name: state.orgName.trim(),
        slug: state.slug.trim(),
        ownerEmail: state.ownerEmail.trim(),
        ownerName: state.ownerName.trim(),
        ownerPassword: state.ownerPassword,
        ...(blueprint
          ? { blueprint }
          : (cleanUnits[0] ? { initialUnit: cleanUnits[0] } : {})),
        setupMeta: {
          mode: state.mode ?? 'manual',
          ...(state.segmentLabel ? { segmentLabel: state.segmentLabel } : {}),
        },
      });
    },
    onSuccess: () => {
      setSuccess(true);
      setTimeout(() => router.push('/login?setup=1'), 3500);
    },
    onError: (err: unknown) => {
      const message = (err as { message?: string })?.message ?? '';
      if (/SLUG_TAKEN/.test(message)) {
        setError('Este identificador (slug) já está em uso — escolha outro.');
        setStep(state.mode === 'ai' ? 'review' : 'org');
      } else if (/EMAIL_TAKEN/.test(message)) {
        setError('Este e-mail já possui conta — use outro ou faça login.');
        setStep('owner');
      } else {
        setError('Erro ao criar a organização. Tente novamente.');
      }
    },
  });

  // ── Validações por passo ───────────────────────────────────────────────────
  const validateOrgFields = (): string | null => {
    if (!state.orgName.trim()) return 'Informe o nome da empresa.';
    if (!/^[a-z0-9-]{3,}$/.test(state.slug)) return 'Identificador (slug): mínimo 3 caracteres — letras minúsculas, números e hífens.';
    return null;
  };

  const validateAreas = (): string | null => {
    if (state.areas.length === 0) return 'Mantenha ao menos uma área.';
    if (state.areas.some((a) => !a.name.trim())) return 'Toda área precisa de um nome.';
    return null;
  };

  const validateOwner = (): string | null => {
    if (!state.ownerName.trim()) return 'Informe seu nome.';
    if (!state.ownerEmail.includes('@')) return 'Informe um e-mail válido.';
    if (state.ownerPassword.length < 8) return 'A senha precisa de ao menos 8 caracteres.';
    if (state.ownerPassword !== state.confirmPassword) return 'As senhas não coincidem.';
    return null;
  };

  const goNext = () => {
    setError('');
    if (step === 'describe') {
      if (state.businessDescription.trim().length < 10) {
        setError('Descreva o negócio com um pouco mais de detalhe (mínimo 10 caracteres).');
        return;
      }
      draftMutation.mutate();
      return;
    }
    if (step === 'review') {
      const e = validateOrgFields() ?? validateAreas();
      if (e) { setError(e); return; }
      setStep('owner');
      return;
    }
    if (step === 'org') {
      const e = validateOrgFields();
      if (e) { setError(e); return; }
      setStep('areas');
      return;
    }
    if (step === 'areas') {
      const e = validateAreas();
      if (e) { setError(e); return; }
      setStep('owner');
      return;
    }
    if (step === 'owner') {
      const e = validateOwner();
      if (e) { setError(e); return; }
      setStep(state.mode === 'ai' ? 'confirm' : 'units');
      return;
    }
    if (step === 'units') {
      setStep('confirm');
      return;
    }
    if (step === 'confirm') {
      createMutation.mutate();
    }
  };

  const goBack = () => {
    setError('');
    const order: SetupStep[] = state.mode === 'ai'
      ? ['mode', 'describe', 'review', 'owner', 'confirm']
      : ['mode', 'org', 'areas', 'owner', 'units', 'confirm'];
    const idx = order.indexOf(step);
    if (idx > 0) setStep(order[idx - 1]!);
  };

  const pickMode = (mode: 'ai' | 'manual') => {
    setError('');
    if (mode === 'manual') {
      patch({ mode, areas: state.areas.length ? state.areas : buildCanonicalAreas(), areasDirty: state.areasDirty });
      setStep('org');
    } else {
      patch({ mode });
      setStep('describe');
    }
  };

  const totalTemplates = state.areas.reduce(
    (n, a) => n + (a.canonical && CANONICAL_KEYS.has(a.key)
      ? (CANONICAL_AREAS_DISPLAY.find((c) => c.key === a.key)?.templateCount ?? 0)
      : a.templates.length),
    0,
  );
  const cleanUnits = state.units.filter((u) => u.name.trim());
  const usesCanonical = state.mode === 'manual' && !state.areasDirty;

  // ── Telas ──────────────────────────────────────────────────────────────────
  if (success) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center p-4 text-center md:p-6">
        <div className="mb-4 inline-flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-950">
          <Check className="h-8 w-8 text-emerald-600" />
        </div>
        <h1 className="mb-2 text-2xl font-semibold tracking-tight">Tudo pronto, {state.ownerName.split(' ')[0]}!</h1>
        <p className="mb-1 text-muted-foreground">
          <strong>{state.orgName}</strong> foi criada — redirecionando para o login…
        </p>
        <p className="text-sm text-muted-foreground">
          {usesCanonical ? '6 áreas e 24 rotinas' : `${state.areas.length} área(s) e ${totalTemplates} rotina(s)`}
          {cleanUnits.length > 0 ? ` · ${cleanUnits.length} unidade(s)` : ''} já disponíveis.
        </p>
      </div>
    );
  }

  return (
    <SetupShell steps={steps} activeStepId={step}>
      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300" role="alert">
          {error}
          {step === 'describe' && (
            <button
              type="button"
              className="ml-2 font-medium underline underline-offset-2"
              onClick={() => pickMode('manual')}
            >
              Continuar manualmente
            </button>
          )}
        </div>
      )}

      {/* ── Passo 0: como começar ── */}
      {step === 'mode' && (
        <div className="space-y-5">
          <div>
            <h2 className="text-xl font-semibold tracking-tight">Como você quer configurar?</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Vamos montar a estrutura da sua operação — para qualquer tipo de empresa.
            </p>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <button
              type="button"
              className="group relative rounded-2xl border-2 border-transparent bg-zinc-950 p-5 text-left text-zinc-50 transition-all hover:scale-[1.01] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:p-6"
              onClick={() => pickMode('ai')}
            >
              <span className="absolute right-4 top-4 rounded-full bg-white/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider">
                Recomendado
              </span>
              <Sparkles className="h-6 w-6 text-violet-300" />
              <h3 className="mt-3 text-base font-semibold">Configurar com IA</h3>
              <p className="mt-1 text-sm leading-relaxed text-zinc-400">
                Descreva seu negócio em poucas linhas e receba áreas, rotinas e
                unidades sob medida — você revisa tudo antes de criar.
              </p>
            </button>
            <button
              type="button"
              className="group rounded-2xl border-2 bg-card p-5 text-left transition-all hover:border-foreground/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:p-6"
              onClick={() => pickMode('manual')}
            >
              <SlidersHorizontal className="h-6 w-6 text-muted-foreground" />
              <h3 className="mt-3 text-base font-semibold">Configurar manualmente</h3>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                Comece com a estrutura padrão (6 áreas e 24 rotinas) e ajuste
                nomes, cores e unidades do seu jeito.
              </p>
            </button>
          </div>
          <button
            type="button"
            className="text-sm text-muted-foreground underline underline-offset-2 hover:text-foreground"
            onClick={() => router.push('/login')}
          >
            Já tenho conta — fazer login
          </button>
        </div>
      )}

      {/* ── (IA) Descreva o negócio ── */}
      {step === 'describe' && (
        <div className="space-y-4">
          <div>
            <h2 className="text-xl font-semibold tracking-tight">Conte sobre o seu negócio</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Segmento, tamanho, unidades/filiais e como a operação funciona no dia a dia.
            </p>
          </div>
          <div>
            <label htmlFor="d-orgname" className="mb-1 block text-sm font-medium">Nome da empresa (opcional)</label>
            <Input
              id="d-orgname"
              value={state.orgName}
              onChange={(e) => patch({ orgName: e.target.value })}
              placeholder="Se deixar em branco, a IA sugere um nome"
            />
          </div>
          <div>
            <label htmlFor="d-desc" className="mb-1 block text-sm font-medium">Descrição do negócio *</label>
            <Textarea
              id="d-desc"
              autoFocus
              value={state.businessDescription}
              onChange={(e) => patch({ businessDescription: e.target.value.slice(0, 1500) })}
              placeholder={'Ex.: "Rede de clínicas odontológicas com 3 unidades em Araraquara. A operação envolve recepção e agendamento, faturamento de convênios, esterilização de instrumentais, compras de insumos e marketing local."'}
              className="min-h-[140px] text-sm leading-relaxed"
            />
            <p className="mt-1 text-right text-xs text-muted-foreground">{state.businessDescription.length}/1500</p>
          </div>
        </div>
      )}

      {/* ── (IA) Proposta editável ── */}
      {step === 'review' && <ProposalReviewStep state={state} onPatch={patch} />}

      {/* ── (Manual) Organização ── */}
      {step === 'org' && (
        <div className="space-y-4">
          <div>
            <h2 className="text-xl font-semibold tracking-tight">Sobre a empresa</h2>
            <p className="mt-1 text-sm text-muted-foreground">Como ela aparece na plataforma.</p>
          </div>
          <div>
            <label htmlFor="m-orgname" className="mb-1 block text-sm font-medium">Nome da empresa *</label>
            <Input
              id="m-orgname"
              value={state.orgName}
              onChange={(e) => {
                const name = e.target.value;
                patch({ orgName: name, ...(!state.slugManual ? { slug: toSlug(name).slice(0, 60) } : {}) });
              }}
              placeholder="Ex: Rede Bem-Estar"
            />
          </div>
          <div>
            <label htmlFor="m-slug" className="mb-1 block text-sm font-medium">Identificador único (slug) *</label>
            <Input
              id="m-slug"
              value={state.slug}
              onChange={(e) => patch({ slugManual: true, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-').slice(0, 60) })}
              placeholder="rede-bem-estar"
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Usado na URL. Letras minúsculas, números e hífens — não muda depois.
            </p>
          </div>
        </div>
      )}

      {/* ── (Manual) Áreas ── */}
      {step === 'areas' && <AreasManualStep state={state} onPatch={patch} />}

      {/* ── Conta do administrador ── */}
      {step === 'owner' && (
        <div className="space-y-4">
          <div>
            <h2 className="text-xl font-semibold tracking-tight">Sua conta de administrador</h2>
            <p className="mt-1 text-sm text-muted-foreground">Você será o owner de {state.orgName || 'sua empresa'}.</p>
          </div>
          <div>
            <label htmlFor="o-name" className="mb-1 block text-sm font-medium">Nome completo *</label>
            <Input id="o-name" value={state.ownerName} onChange={(e) => patch({ ownerName: e.target.value })} placeholder="Seu nome" />
          </div>
          <div>
            <label htmlFor="o-email" className="mb-1 block text-sm font-medium">E-mail *</label>
            <Input id="o-email" type="email" value={state.ownerEmail} onChange={(e) => patch({ ownerEmail: e.target.value })} placeholder="voce@empresa.com" />
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <label htmlFor="o-pass" className="mb-1 block text-sm font-medium">Senha *</label>
              <Input id="o-pass" type="password" value={state.ownerPassword} onChange={(e) => patch({ ownerPassword: e.target.value })} placeholder="Mínimo 8 caracteres" />
            </div>
            <div>
              <label htmlFor="o-confirm" className="mb-1 block text-sm font-medium">Confirmar senha *</label>
              <Input id="o-confirm" type="password" value={state.confirmPassword} onChange={(e) => patch({ confirmPassword: e.target.value })} placeholder="Repita a senha" />
            </div>
          </div>
        </div>
      )}

      {/* ── (Manual) Unidades ── */}
      {step === 'units' && (
        <div className="space-y-4">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted">
              <MapPin className="h-5 w-5 text-muted-foreground" />
            </div>
            <div>
              <h2 className="text-xl font-semibold tracking-tight">Unidades</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Locais físicos da operação (até 5 agora — dá para criar mais depois, ou pular).
              </p>
            </div>
          </div>
          <UnitListEditor units={state.units} onChange={(units) => patch({ units })} />
        </div>
      )}

      {/* ── Confirmar ── */}
      {step === 'confirm' && (
        <div className="space-y-4">
          <div>
            <h2 className="text-xl font-semibold tracking-tight">Confirmar e criar</h2>
            <p className="mt-1 text-sm text-muted-foreground">Revise o resumo — depois é só entrar e operar.</p>
          </div>
          <div className="space-y-2.5 rounded-xl border bg-muted/30 p-4 text-sm">
            <div className="flex justify-between gap-2">
              <span className="shrink-0 text-muted-foreground">Empresa</span>
              <span className="truncate text-right font-medium">{state.orgName}</span>
            </div>
            <div className="flex justify-between gap-2">
              <span className="shrink-0 text-muted-foreground">Identificador</span>
              <code className="rounded border bg-background px-1.5 py-0.5 text-xs">{state.slug}</code>
            </div>
            {state.segmentLabel && (
              <div className="flex justify-between gap-2">
                <span className="shrink-0 text-muted-foreground">Segmento</span>
                <span className="truncate text-right font-medium">{state.segmentLabel}</span>
              </div>
            )}
            <div className="flex justify-between gap-2">
              <span className="shrink-0 text-muted-foreground">Administrador</span>
              <span className="truncate text-right font-medium">{state.ownerName} · {state.ownerEmail}</span>
            </div>
            <div className="border-t pt-2.5">
              <p className="mb-1.5 text-muted-foreground">Áreas ({state.areas.length})</p>
              <div className="flex flex-wrap gap-1.5">
                {state.areas.map((a) => (
                  <span key={a.key} className="inline-flex items-center gap-1.5 rounded-full border bg-background px-2 py-0.5 text-xs font-medium">
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: a.color }} />
                    {a.name}
                  </span>
                ))}
              </div>
            </div>
            <div className="flex justify-between gap-2">
              <span className="shrink-0 text-muted-foreground">Rotinas (templates)</span>
              <span className="font-medium">{totalTemplates}</span>
            </div>
            <div className="flex justify-between gap-2">
              <span className="shrink-0 text-muted-foreground">Unidades</span>
              <span className="truncate text-right font-medium">
                {cleanUnits.length > 0 ? cleanUnits.map((u) => u.name).join(', ') : 'nenhuma agora'}
              </span>
            </div>
          </div>
          <p className="text-xs leading-relaxed text-muted-foreground">
            Tudo pode ser ajustado depois em Configurações — áreas, rotinas, unidades e equipe.
          </p>
        </div>
      )}

      {/* ── Navegação ── */}
      {step !== 'mode' && (
        <div className="mt-6 flex justify-between">
          <Button variant="outline" onClick={goBack} disabled={createMutation.isPending || draftMutation.isPending}>
            <ChevronLeft className="mr-1 h-4 w-4" />
            Voltar
          </Button>
          <Button onClick={goNext} disabled={createMutation.isPending || draftMutation.isPending} className="gap-2">
            {(createMutation.isPending || draftMutation.isPending) && <Loader2 className="h-4 w-4 animate-spin" />}
            {step === 'describe'
              ? (draftMutation.isPending ? 'Analisando seu negócio…' : (<><Sparkles className="h-4 w-4" />Gerar proposta</>))
              : step === 'confirm'
                ? (createMutation.isPending ? 'Criando…' : 'Criar e começar')
                : (<>Continuar<ChevronRight className="ml-1 h-4 w-4" /></>)}
          </Button>
        </div>
      )}
    </SetupShell>
  );
}
