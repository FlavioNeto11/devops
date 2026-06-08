'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Loader2, ArrowLeft, Power } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { platformApi } from '@/lib/platform-api';
import { ApiError } from '@/lib/api';

function Stat({ label, value }: { readonly label: string; readonly value: number }) {
  return (
    <div className="rounded-lg border bg-card p-3 text-center">
      <div className="text-2xl font-bold tabular-nums">{value}</div>
      <div className="text-xs uppercase text-muted-foreground">{label}</div>
    </div>
  );
}

export default function PlatformOrgDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const router = useRouter();
  const qc = useQueryClient();
  const [name, setName] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['platform-org', id],
    queryFn: () => platformApi.getOrganization(id),
  });
  const org = data?.data;

  const save = useMutation({
    mutationFn: (patch: { name?: string; isActive?: boolean }) => platformApi.updateOrganization(id, patch),
    onSuccess: () => {
      toast.success('Academia atualizada');
      qc.invalidateQueries({ queryKey: ['platform-org', id] });
      qc.invalidateQueries({ queryKey: ['platform-orgs'] });
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Erro'),
  });

  if (isLoading) return <div className="p-6 text-center"><Loader2 className="mx-auto h-5 w-5 animate-spin" /></div>;
  if (!org) return <div className="p-6 text-muted-foreground">Academia não encontrada.</div>;

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Button variant="ghost" size="sm" className="gap-1" onClick={() => router.push('/admin/organizations')}>
        <ArrowLeft className="h-4 w-4" /> Voltar
      </Button>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold md:text-2xl">{org.name}</h1>
          <p className="text-sm text-muted-foreground">/{org.slug} · {org.isActive ? 'Ativa' : 'Inativa'}</p>
        </div>
        <Button
          variant={org.isActive ? 'destructive' : 'default'}
          size="sm"
          className="gap-1"
          disabled={save.isPending}
          onClick={() => save.mutate({ isActive: !org.isActive })}
        >
          <Power className="h-3.5 w-3.5" /> {org.isActive ? 'Inativar' : 'Ativar'}
        </Button>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Stat label="Unidades" value={org.counts.units} />
        <Stat label="Membros" value={org.counts.members} />
        <Stat label="Atividades" value={org.counts.activities} />
      </div>

      <div className="space-y-3 rounded-lg border bg-card p-4">
        <h2 className="font-semibold">Editar nome</h2>
        <Input defaultValue={org.name} onChange={(e) => setName(e.target.value)} />
        <Button size="sm" disabled={save.isPending || !name || name === org.name} onClick={() => save.mutate({ name })}>
          Salvar
        </Button>
      </div>

      <div className="rounded-lg border bg-card p-4">
        <h2 className="mb-2 font-semibold">Administradores (owners)</h2>
        {org.owners.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum owner cadastrado.</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {org.owners.map((o) => (
              <li key={o.id}>{o.name} · <span className="text-muted-foreground">{o.email}</span></li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
