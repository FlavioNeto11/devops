'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Loader2, Plus, ShieldCheck, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useAuthStore } from '@/store/auth';
import { platformApi } from '@/lib/platform-api';
import { ApiError } from '@/lib/api';

export default function PlatformMastersPage() {
  const qc = useQueryClient();
  const currentUserId = useAuthStore((s) => s.user?.id);
  const [showAdd, setShowAdd] = useState(false);

  const { data, isLoading } = useQuery({ queryKey: ['platform-masters'], queryFn: () => platformApi.listMasters() });
  const masters = data?.data ?? [];

  const revoke = useMutation({
    mutationFn: (mid: string) => platformApi.revokeMaster(mid),
    onSuccess: () => { toast.success('Acesso master revogado'); qc.invalidateQueries({ queryKey: ['platform-masters'] }); },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Erro'),
  });

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold md:text-2xl">Masters da plataforma</h1>
          <p className="text-sm text-muted-foreground">Usuários com acesso total à plataforma (acima das academias).</p>
        </div>
        <Button className="gap-2" onClick={() => setShowAdd(true)}>
          <Plus className="h-4 w-4" /> Adicionar master
        </Button>
      </div>

      <div className="divide-y rounded-lg border bg-card">
        {isLoading ? (
          <div className="p-6 text-center"><Loader2 className="mx-auto h-5 w-5 animate-spin" /></div>
        ) : masters.length === 0 ? (
          <div className="p-6 text-center text-muted-foreground">Nenhum master.</div>
        ) : (
          masters.map((m) => (
            <div key={m.id} className="flex items-center justify-between gap-3 p-3">
              <div className="flex min-w-0 items-center gap-2">
                <ShieldCheck className="h-4 w-4 shrink-0 text-primary" />
                <div className="min-w-0">
                  <div className="truncate font-medium">{m.name}{m.id === currentUserId ? ' (você)' : ''}</div>
                  <div className="truncate text-xs text-muted-foreground">{m.email}</div>
                </div>
              </div>
              {m.id !== currentUserId && masters.length > 1 && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="gap-1 text-destructive"
                  disabled={revoke.isPending}
                  onClick={() => { if (window.confirm(`Revogar acesso master de ${m.email}?`)) revoke.mutate(m.id); }}
                >
                  <Trash2 className="h-4 w-4" /> Revogar
                </Button>
              )}
            </div>
          ))
        )}
      </div>

      {showAdd && <AddMasterDialog onClose={() => setShowAdd(false)} onAdded={() => qc.invalidateQueries({ queryKey: ['platform-masters'] })} />}
    </div>
  );
}

function AddMasterDialog({ onClose, onAdded }: { readonly onClose: () => void; readonly onAdded: () => void }) {
  const [form, setForm] = useState({ email: '', name: '', password: '' });
  const [error, setError] = useState('');

  const add = useMutation({
    mutationFn: () => platformApi.createMaster({
      email: form.email.trim(),
      name: form.name.trim() || undefined,
      password: form.password || undefined,
    }),
    onSuccess: () => { toast.success('Master adicionado'); onAdded(); onClose(); },
    onError: (e) => setError(e instanceof ApiError ? e.message : 'Erro'),
  });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.email) { setError('E-mail obrigatório'); return; }
    add.mutate();
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>Adicionar master</DialogTitle></DialogHeader>
        <p className="text-xs text-muted-foreground">
          Se o e-mail já existir, o usuário é promovido a master. Para um usuário novo, informe nome e senha (8+).
        </p>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <form onSubmit={submit} className="space-y-3">
          <label className="block space-y-1">
            <span className="text-sm font-medium">E-mail</span>
            <Input type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
          </label>
          <label className="block space-y-1">
            <span className="text-sm font-medium">Nome (novo usuário)</span>
            <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
          </label>
          <label className="block space-y-1">
            <span className="text-sm font-medium">Senha (novo usuário, 8+)</span>
            <Input type="password" value={form.password} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} />
          </label>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
            <Button type="submit" disabled={add.isPending} className="gap-2">
              {add.isPending && <Loader2 className="h-4 w-4 animate-spin" />} Adicionar
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
