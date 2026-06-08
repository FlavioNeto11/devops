'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation } from '@tanstack/react-query';
import { invitationsApi } from '@/lib/admin-api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2, Building2, CheckCircle2, AlertCircle } from 'lucide-react';

const ROLE_LABELS: Record<string, string> = {
  org_manager: 'Gestor da organização',
  unit_manager: 'Gerente de unidade',
  area_leader: 'Líder de área',
  executor: 'Executor',
  viewer: 'Visualizador',
};

export default function InvitePage() {
  const params = useParams();
  const router = useRouter();
  const token = params.token as string;

  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [formError, setFormError] = useState('');
  const [accepted, setAccepted] = useState(false);

  const { data, isLoading, error } = useQuery({
    queryKey: ['invitation', token],
    queryFn: () => invitationsApi.getByToken(token),
    retry: false,
  });

  const acceptMutation = useMutation({
    mutationFn: () => invitationsApi.accept(token, { name: name.trim(), password }),
    onSuccess: () => {
      setAccepted(true);
      setTimeout(() => router.push('/login'), 3000);
    },
    onError: (err: unknown) => {
      setFormError((err as { message?: string })?.message ?? 'Erro ao aceitar convite. O convite pode ter expirado.');
    },
  });

  const invitation = data?.data;
  const isExpired = invitation ? new Date(invitation.expiresAt) < new Date() : false;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    if (!name.trim()) { setFormError('Nome é obrigatório.'); return; }
    if (password.length < 6) { setFormError('Senha deve ter ao menos 6 caracteres.'); return; }
    if (password !== confirmPassword) { setFormError('As senhas não coincidem.'); return; }
    acceptMutation.mutate();
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground mb-4" />
        <p className="text-muted-foreground">Verificando convite...</p>
      </div>
    );
  }

  if (error || !invitation) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-6 text-center">
        <AlertCircle className="h-12 w-12 text-red-500 mb-4" />
        <h1 className="text-xl font-semibold mb-2">Convite inválido</h1>
        <p className="text-muted-foreground mb-6">Este convite não existe, foi cancelado ou já foi aceito.</p>
        <Button onClick={() => router.push('/login')}>Ir para o login</Button>
      </div>
    );
  }

  if (isExpired) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-6 text-center">
        <AlertCircle className="h-12 w-12 text-amber-500 mb-4" />
        <h1 className="text-xl font-semibold mb-2">Convite expirado</h1>
        <p className="text-muted-foreground mb-2">Este convite expirou em {new Intl.DateTimeFormat('pt-BR').format(new Date(invitation.expiresAt))}.</p>
        <p className="text-muted-foreground mb-6">Peça ao administrador para enviar um novo convite.</p>
        <Button onClick={() => router.push('/login')}>Ir para o login</Button>
      </div>
    );
  }

  if (accepted) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-6 text-center">
        <CheckCircle2 className="h-12 w-12 text-green-500 mb-4" />
        <h1 className="text-xl font-semibold mb-2">Cadastro concluído!</h1>
        <p className="text-muted-foreground mb-2">Bem-vindo(a) à {invitation.organization?.name}.</p>
        <p className="text-sm text-muted-foreground">Redirecionando para o login...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-6">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center h-14 w-14 rounded-xl bg-primary/10 mb-4">
            <Building2 className="h-7 w-7 text-primary" />
          </div>
          <h1 className="text-2xl font-bold">Você foi convidado(a)</h1>
          <p className="text-muted-foreground mt-2">
            Para entrar em <span className="font-medium text-foreground">{invitation.organization?.name}</span> como{' '}
            <span className="font-medium text-foreground">{ROLE_LABELS[invitation.role] ?? invitation.role}</span>.
          </p>
          <p className="text-sm text-muted-foreground mt-1">Conta: {invitation.email}</p>
        </div>

        <div className="rounded-xl border p-6 shadow-sm">
          <h2 className="text-base font-semibold mb-4">Criar sua conta</h2>
          {formError && (
            <div className="mb-4 p-3 rounded-md bg-red-50 text-red-700 border border-red-200 text-sm">
              {formError}
            </div>
          )}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="inv-name" className="block text-sm font-medium mb-1">Nome completo *</label>
              <Input
                id="inv-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Seu nome"
                required
              />
            </div>
            <div>
              <label htmlFor="inv-email" className="block text-sm font-medium mb-1">E-mail</label>
              <Input id="inv-email" value={invitation.email} disabled className="bg-muted" />
            </div>
            <div>
              <label htmlFor="inv-pass" className="block text-sm font-medium mb-1">Senha *</label>
              <Input
                id="inv-pass"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Mínimo 6 caracteres"
                required
              />
            </div>
            <div>
              <label htmlFor="inv-confirm" className="block text-sm font-medium mb-1">Confirmar senha *</label>
              <Input
                id="inv-confirm"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Repita a senha"
                required
              />
            </div>
            <Button type="submit" className="w-full gap-2" disabled={acceptMutation.isPending}>
              {acceptMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Criar conta e entrar
            </Button>
          </form>
        </div>

        <p className="text-center text-sm text-muted-foreground mt-4">
          Já tem uma conta?{' '}
          <button onClick={() => router.push('/login')} className="text-primary hover:underline">
            Fazer login
          </button>
        </p>
      </div>
    </div>
  );
}
