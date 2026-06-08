'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Loader2, Plus, Power } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { platformApi, type PlatformOrg } from '@/lib/platform-api';
import { ApiError } from '@/lib/api';

function slugify(s: string) {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 60);
}

export default function PlatformOrganizationsPage() {
  const qc = useQueryClient();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<'all' | 'active' | 'inactive'>('all');
  const [showCreate, setShowCreate] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['platform-orgs', status, q],
    queryFn: () => platformApi.listOrganizations({ status, q: q || undefined }),
  });
  const orgs = data?.data ?? [];

  const toggle = useMutation({
    mutationFn: (o: PlatformOrg) => platformApi.updateOrganization(o.id, { isActive: !o.isActive }),
    onSuccess: (_r, o) => {
      toast.success(o.isActive ? 'Academia inativada' : 'Academia ativada');
      qc.invalidateQueries({ queryKey: ['platform-orgs'] });
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Erro'),
  });

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold md:text-2xl">Academias</h1>
          <p className="text-sm text-muted-foreground">Gerencie todas as academias da plataforma.</p>
        </div>
        <Button className="gap-2" onClick={() => setShowCreate(true)}>
          <Plus className="h-4 w-4" /> Nova academia
        </Button>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Input placeholder="Buscar por nome ou slug…" value={q} onChange={(e) => setQ(e.target.value)} className="max-w-xs" />
        <div className="flex gap-1">
          {(['all', 'active', 'inactive'] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setStatus(s)}
              className={cn(
                'rounded-md border px-3 py-1.5 text-sm',
                status === s ? 'border-primary bg-primary/10 text-foreground' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {s === 'all' ? 'Todas' : s === 'active' ? 'Ativas' : 'Inativas'}
            </button>
          ))}
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border bg-card">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/40 text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="p-3">Academia</th>
              <th className="p-3">Status</th>
              <th className="p-3 text-right">Unid.</th>
              <th className="p-3 text-right">Membros</th>
              <th className="p-3 text-right">Ativid.</th>
              <th className="p-3" />
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={6} className="p-6 text-center text-muted-foreground"><Loader2 className="mx-auto h-5 w-5 animate-spin" /></td></tr>
            ) : orgs.length === 0 ? (
              <tr><td colSpan={6} className="p-6 text-center text-muted-foreground">Nenhuma academia encontrada.</td></tr>
            ) : (
              orgs.map((o) => (
                <tr key={o.id} className="border-b last:border-0 hover:bg-muted/30">
                  <td className="p-3">
                    <Link href={`/admin/organizations/${o.id}`} className="font-medium hover:underline">{o.name}</Link>
                    <div className="text-xs text-muted-foreground">/{o.slug}</div>
                  </td>
                  <td className="p-3">
                    <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', o.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-600')}>
                      {o.isActive ? 'Ativa' : 'Inativa'}
                    </span>
                  </td>
                  <td className="p-3 text-right tabular-nums">{o.counts.units}</td>
                  <td className="p-3 text-right tabular-nums">{o.counts.members}</td>
                  <td className="p-3 text-right tabular-nums">{o.counts.activities}</td>
                  <td className="p-3 text-right">
                    <Button variant="outline" size="sm" className="gap-1" disabled={toggle.isPending} onClick={() => toggle.mutate(o)}>
                      <Power className="h-3.5 w-3.5" /> {o.isActive ? 'Inativar' : 'Ativar'}
                    </Button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {showCreate && (
        <CreateOrgDialog
          onClose={() => setShowCreate(false)}
          onCreated={() => qc.invalidateQueries({ queryKey: ['platform-orgs'] })}
        />
      )}
    </div>
  );
}

function Field({ label, children }: { readonly label: string; readonly children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-sm font-medium">{label}</span>
      {children}
    </label>
  );
}

function CreateOrgDialog({ onClose, onCreated }: { readonly onClose: () => void; readonly onCreated: () => void }) {
  const [form, setForm] = useState({ name: '', slug: '', ownerName: '', ownerEmail: '', ownerPassword: '', unitName: '' });
  const [slugEdited, setSlugEdited] = useState(false);
  const [error, setError] = useState('');

  const create = useMutation({
    mutationFn: () => platformApi.createOrganization({
      name: form.name.trim(),
      slug: form.slug.trim(),
      ownerName: form.ownerName.trim(),
      ownerEmail: form.ownerEmail.trim(),
      ownerPassword: form.ownerPassword,
      initialUnit: form.unitName.trim() ? { name: form.unitName.trim() } : undefined,
    }),
    onSuccess: () => { toast.success('Academia criada'); onCreated(); onClose(); },
    onError: (e) => setError(e instanceof ApiError ? e.message : 'Erro ao criar academia'),
  });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name || !form.slug || !form.ownerName || !form.ownerEmail || form.ownerPassword.length < 8) {
      setError('Preencha todos os campos (a senha do admin precisa de 8+ caracteres).');
      return;
    }
    create.mutate();
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader><DialogTitle>Nova academia</DialogTitle></DialogHeader>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <form onSubmit={submit} className="space-y-3">
          <Field label="Nome da academia">
            <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value, slug: slugEdited ? f.slug : slugify(e.target.value) }))} />
          </Field>
          <Field label="Slug (identificador na URL)">
            <Input value={form.slug} onChange={(e) => { setSlugEdited(true); setForm((f) => ({ ...f, slug: slugify(e.target.value) })); }} />
          </Field>
          <div className="border-t pt-3 text-sm font-medium text-muted-foreground">Admin da academia</div>
          <Field label="Nome do admin"><Input value={form.ownerName} onChange={(e) => setForm((f) => ({ ...f, ownerName: e.target.value }))} /></Field>
          <Field label="E-mail do admin"><Input type="email" value={form.ownerEmail} onChange={(e) => setForm((f) => ({ ...f, ownerEmail: e.target.value }))} /></Field>
          <Field label="Senha do admin (8+ caracteres)"><Input type="password" value={form.ownerPassword} onChange={(e) => setForm((f) => ({ ...f, ownerPassword: e.target.value }))} /></Field>
          <Field label="Unidade inicial (opcional)"><Input value={form.unitName} onChange={(e) => setForm((f) => ({ ...f, unitName: e.target.value }))} placeholder="Ex.: Matriz" /></Field>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
            <Button type="submit" disabled={create.isPending} className="gap-2">
              {create.isPending && <Loader2 className="h-4 w-4 animate-spin" />} Criar
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
