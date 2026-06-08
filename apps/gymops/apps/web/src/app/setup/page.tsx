'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation } from '@tanstack/react-query';
import { organizationApi } from '@/lib/profile-api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Building2, ChevronRight, ChevronLeft, Loader2, Check, MapPin } from 'lucide-react';

type Step = 'org' | 'owner' | 'unit' | 'confirm';

interface WizardData {
  orgName: string;
  slug: string;
  ownerName: string;
  ownerEmail: string;
  ownerPassword: string;
  confirmPassword: string;
  unitName: string;
  unitCode: string;
  unitAddress: string;
  skipUnit: boolean;
}

const INITIAL: WizardData = {
  orgName: '',
  slug: '',
  ownerName: '',
  ownerEmail: '',
  ownerPassword: '',
  confirmPassword: '',
  unitName: '',
  unitCode: '',
  unitAddress: '',
  skipUnit: false,
};

const STEPS: Step[] = ['org', 'owner', 'unit', 'confirm'];
const STEP_LABELS: Record<Step, string> = {
  org: 'Organização',
  owner: 'Administrador',
  unit: 'Unidade',
  confirm: 'Confirmar',
};

function toSlug(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function StepIndicator({ current }: { current: Step }) {
  const idx = STEPS.indexOf(current);
  return (
    <div className="flex items-center justify-center gap-1 mb-8">
      {STEPS.map((s, i) => (
        <div key={s} className="flex items-center gap-1">
          <div className="flex flex-col items-center gap-1">
            <div className={`h-7 w-7 rounded-full flex items-center justify-center text-xs font-semibold transition-colors ${i < idx ? 'bg-primary text-primary-foreground' : i === idx ? 'bg-primary text-primary-foreground ring-4 ring-primary/20' : 'bg-muted text-muted-foreground'}`}>
              {i < idx ? <Check className="h-3.5 w-3.5" /> : i + 1}
            </div>
            <span className="text-[10px] text-muted-foreground whitespace-nowrap hidden sm:block">{STEP_LABELS[s]}</span>
          </div>
          {i < STEPS.length - 1 && <div className={`h-0.5 w-6 mb-4 ${i < idx ? 'bg-primary' : 'bg-muted'}`} />}
        </div>
      ))}
    </div>
  );
}

export default function SetupPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>('org');
  const [data, setData] = useState<WizardData>(INITIAL);
  const [error, setError] = useState('');
  const [slugManual, setSlugManual] = useState(false);
  const [success, setSuccess] = useState(false);

  const createMutation = useMutation({
    mutationFn: () => organizationApi.create({
      name: data.orgName.trim(),
      slug: data.slug.trim(),
      ownerEmail: data.ownerEmail.trim(),
      ownerName: data.ownerName.trim(),
      ownerPassword: data.ownerPassword,
      ...((!data.skipUnit && data.unitName.trim()) ? {
        initialUnit: {
          name: data.unitName.trim(),
          code: data.unitCode.trim() || undefined,
          address: data.unitAddress.trim() || undefined,
        },
      } : {}),
    }),
    onSuccess: () => {
      setSuccess(true);
      setTimeout(() => router.push('/login?setup=1'), 3500);
    },
    onError: (err: unknown) => {
      setError((err as { message?: string })?.message ?? 'Erro ao criar organização. Tente novamente.');
    },
  });

  const patch = (updates: Partial<WizardData>) => setData((prev) => ({ ...prev, ...updates }));

  const validateOrg = (): string | null => {
    if (!data.orgName.trim()) return 'Nome da organização é obrigatório.';
    if (!data.slug.trim()) return 'Slug é obrigatório.';
    if (!/^[a-z0-9-]{3,}$/.test(data.slug)) return 'Slug: apenas letras minúsculas, números e hífens, mínimo 3 caracteres.';
    return null;
  };

  const validateOwner = (): string | null => {
    if (!data.ownerName.trim()) return 'Nome é obrigatório.';
    if (!data.ownerEmail.trim() || !data.ownerEmail.includes('@')) return 'E-mail válido é obrigatório.';
    if (data.ownerPassword.length < 8) return 'Senha deve ter ao menos 8 caracteres.';
    if (data.ownerPassword !== data.confirmPassword) return 'As senhas não coincidem.';
    return null;
  };

  const goNext = () => {
    setError('');
    if (step === 'org') {
      const e = validateOrg();
      if (e) { setError(e); return; }
      setStep('owner');
    } else if (step === 'owner') {
      const e = validateOwner();
      if (e) { setError(e); return; }
      setStep('unit');
    } else if (step === 'unit') {
      setStep('confirm');
    } else {
      createMutation.mutate();
    }
  };

  const goBack = () => {
    setError('');
    if (step === 'owner') setStep('org');
    else if (step === 'unit') setStep('owner');
    else if (step === 'confirm') setStep('unit');
  };

  const hasUnit = !data.skipUnit && data.unitName.trim().length > 0;

  if (success) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-6 text-center">
        <div className="inline-flex items-center justify-center h-16 w-16 rounded-full bg-green-100 mb-4">
          <Check className="h-8 w-8 text-green-600" />
        </div>
        <h1 className="text-2xl font-bold mb-2">Organização criada!</h1>
        <p className="text-muted-foreground mb-1">
          Pronto! Sua organização está configurada. Redirecionando para o login...
        </p>
        <p className="text-sm text-muted-foreground">6 áreas e 24 templates já estão disponíveis.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-4 md:p-6">
      <div className="w-full max-w-md">
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center h-12 w-12 rounded-xl bg-primary/10 mb-3">
            <Building2 className="h-6 w-6 text-primary" />
          </div>
          <h1 className="text-2xl font-bold">Configurar organização</h1>
          <p className="text-sm text-muted-foreground mt-1">Crie sua organização no GymOps em 4 passos.</p>
        </div>

        <StepIndicator current={step} />

        <div className="rounded-xl border p-5 md:p-6 shadow-sm">
          {error && (
            <div className="mb-4 p-3 rounded-md bg-red-50 text-red-700 border border-red-200 text-sm">
              {error}
            </div>
          )}

          {step === 'org' && (
            <div className="space-y-4">
              <h2 className="text-base font-semibold">1. Sobre a organização</h2>
              <div>
                <label htmlFor="s-orgname" className="block text-sm font-medium mb-1">Nome da organização *</label>
                <Input
                  id="s-orgname"
                  value={data.orgName}
                  onChange={(e) => {
                    const name = e.target.value;
                    patch({ orgName: name, ...(!slugManual ? { slug: toSlug(name) } : {}) });
                  }}
                  placeholder="Ex: SkyFit Academia"
                />
              </div>
              <div>
                <label htmlFor="s-slug" className="block text-sm font-medium mb-1">Identificador único (slug) *</label>
                <Input
                  id="s-slug"
                  value={data.slug}
                  onChange={(e) => {
                    setSlugManual(true);
                    patch({ slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-') });
                  }}
                  placeholder="skyfit"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Usado na URL. Apenas letras minúsculas, números e hífens. Não pode ser alterado depois.
                </p>
              </div>
            </div>
          )}

          {step === 'owner' && (
            <div className="space-y-4">
              <h2 className="text-base font-semibold">2. Conta do administrador</h2>
              <div>
                <label htmlFor="s-name" className="block text-sm font-medium mb-1">Nome completo *</label>
                <Input
                  id="s-name"
                  value={data.ownerName}
                  onChange={(e) => patch({ ownerName: e.target.value })}
                  placeholder="Seu nome"
                />
              </div>
              <div>
                <label htmlFor="s-email" className="block text-sm font-medium mb-1">E-mail *</label>
                <Input
                  id="s-email"
                  type="email"
                  value={data.ownerEmail}
                  onChange={(e) => patch({ ownerEmail: e.target.value })}
                  placeholder="admin@empresa.com"
                />
              </div>
              <div>
                <label htmlFor="s-pass" className="block text-sm font-medium mb-1">Senha *</label>
                <Input
                  id="s-pass"
                  type="password"
                  value={data.ownerPassword}
                  onChange={(e) => patch({ ownerPassword: e.target.value })}
                  placeholder="Mínimo 8 caracteres"
                />
              </div>
              <div>
                <label htmlFor="s-confirm" className="block text-sm font-medium mb-1">Confirmar senha *</label>
                <Input
                  id="s-confirm"
                  type="password"
                  value={data.confirmPassword}
                  onChange={(e) => patch({ confirmPassword: e.target.value })}
                  placeholder="Repita a senha"
                />
              </div>
            </div>
          )}

          {step === 'unit' && (
            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <div className="h-9 w-9 rounded-lg bg-muted flex items-center justify-center shrink-0 mt-0.5">
                  <MapPin className="h-5 w-5 text-muted-foreground" />
                </div>
                <div>
                  <h2 className="text-base font-semibold">3. Unidade inicial (opcional)</h2>
                  <p className="text-sm text-muted-foreground">
                    Você pode criar a primeira unidade agora ou fazer isso depois em Configurações.
                  </p>
                </div>
              </div>

              {!data.skipUnit ? (
                <>
                  <div>
                    <label htmlFor="s-unit-name" className="block text-sm font-medium mb-1">Nome da unidade</label>
                    <Input
                      id="s-unit-name"
                      value={data.unitName}
                      onChange={(e) => patch({ unitName: e.target.value })}
                      placeholder="Ex: Vila Xavier"
                    />
                  </div>
                  <div>
                    <label htmlFor="s-unit-code" className="block text-sm font-medium mb-1">Código</label>
                    <Input
                      id="s-unit-code"
                      value={data.unitCode}
                      onChange={(e) => patch({ unitCode: e.target.value })}
                      placeholder="Ex: VX"
                    />
                  </div>
                  <div>
                    <label htmlFor="s-unit-address" className="block text-sm font-medium mb-1">Endereço</label>
                    <Input
                      id="s-unit-address"
                      value={data.unitAddress}
                      onChange={(e) => patch({ unitAddress: e.target.value })}
                      placeholder="Rua, número, bairro, cidade"
                    />
                  </div>
                  <button
                    type="button"
                    className="text-sm text-muted-foreground underline underline-offset-2 hover:text-foreground"
                    onClick={() => patch({ skipUnit: true, unitName: '', unitCode: '', unitAddress: '' })}
                  >
                    Pular — criarei a unidade depois
                  </button>
                </>
              ) : (
                <div className="rounded-lg border border-dashed p-4 text-center">
                  <p className="text-sm text-muted-foreground mb-2">Nenhuma unidade será criada agora.</p>
                  <button
                    type="button"
                    className="text-sm text-primary underline underline-offset-2 hover:opacity-80"
                    onClick={() => patch({ skipUnit: false })}
                  >
                    Quero criar uma unidade
                  </button>
                </div>
              )}
            </div>
          )}

          {step === 'confirm' && (
            <div className="space-y-4">
              <h2 className="text-base font-semibold">4. Confirmar e criar</h2>
              <div className="rounded-lg bg-muted/50 p-4 space-y-2.5 text-sm">
                <div className="flex justify-between gap-2">
                  <span className="text-muted-foreground shrink-0">Organização</span>
                  <span className="font-medium text-right truncate">{data.orgName}</span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-muted-foreground shrink-0">Slug</span>
                  <code className="text-xs bg-background px-1.5 py-0.5 rounded border">{data.slug}</code>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-muted-foreground shrink-0">Administrador</span>
                  <span className="font-medium text-right truncate">{data.ownerName}</span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-muted-foreground shrink-0">E-mail</span>
                  <span className="font-medium text-right truncate">{data.ownerEmail}</span>
                </div>
                {hasUnit && (
                  <div className="flex justify-between gap-2">
                    <span className="text-muted-foreground shrink-0">Unidade inicial</span>
                    <span className="font-medium text-right truncate">{data.unitName}</span>
                  </div>
                )}
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Vamos criar: organização <strong>{data.orgName}</strong>, owner <strong>{data.ownerName}</strong>,{' '}
                6 áreas operacionais, 24 templates de tarefas{' '}
                {hasUnit ? <>e a unidade <strong>{data.unitName}</strong> com todas as áreas vinculadas.</> : 'e nenhuma unidade (você poderá criar depois).'}
                {' '}Você poderá personalizar tudo em Configurações.
              </p>
            </div>
          )}
        </div>

        <div className="flex justify-between mt-4">
          <Button
            variant="outline"
            onClick={step === 'org' ? () => router.push('/login') : goBack}
            disabled={createMutation.isPending}
          >
            {step === 'org' ? 'Já tenho conta' : (
              <><ChevronLeft className="h-4 w-4 mr-1" />Voltar</>
            )}
          </Button>
          <Button onClick={goNext} disabled={createMutation.isPending} className="gap-2">
            {createMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            {step === 'confirm' ? 'Criar organização' : (
              <>Continuar<ChevronRight className="h-4 w-4 ml-1" /></>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
