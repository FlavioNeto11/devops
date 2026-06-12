'use client';

import { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { profileApi } from '@/lib/profile-api';
import { useAuthStore } from '@/store/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { UserAvatar } from '@/components/ui/avatar';
import { Camera, Save, Loader2 } from 'lucide-react';
import { TutorialTrigger } from '@/features/tutorial';

export default function ProfilePage() {
  const { user, updateUser } = useAuthStore();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['me/profile'],
    queryFn: () => profileApi.get(),
  });

  const profile = data?.data;

  const [form, setForm] = useState({ name: '', phone: '' });

  const updateMutation = useMutation({
    mutationFn: profileApi.update,
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['me/profile'] });
      if (res.data) {
        updateUser({ name: res.data.name, avatarUrl: res.data.avatarUrl });
      }
      setToast({ type: 'success', message: 'Perfil atualizado com sucesso!' });
      setTimeout(() => setToast(null), 3000);
    },
    onError: () => setToast({ type: 'error', message: 'Erro ao atualizar perfil.' }),
  });

  const avatarMutation = useMutation({
    mutationFn: async (file: File) => {
      const presign = await profileApi.presignAvatar(file.type);
      if (!presign.data.uploadUrl) throw new Error('No upload URL');
      await fetch(presign.data.uploadUrl, { method: 'PUT', body: file, headers: { 'Content-Type': file.type } });
      return profileApi.confirmAvatar(presign.data.objectKey);
    },
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['me/profile'] });
      if (res.data) {
        updateUser({ avatarUrl: res.data.avatarUrl });
      }
      setToast({ type: 'success', message: 'Foto atualizada!' });
      setTimeout(() => setToast(null), 3000);
    },
    onError: () => setToast({ type: 'error', message: 'Erro ao fazer upload da foto.' }),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateMutation.mutate({
      name: form.name || profile?.name,
      phone: form.phone || undefined,
    });
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    avatarMutation.mutate(file);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const displayName = profile?.name ?? user?.name ?? '';
  const displayEmail = profile?.email ?? user?.email ?? '';

  return (
    <div className="p-3 md:p-6 max-w-2xl mx-auto" data-tutorial="settings-profile">
      <div className="flex items-center justify-between mb-6 gap-3 flex-wrap">
        <h1 className="text-2xl font-bold">Meu Perfil</h1>
        <TutorialTrigger tutorialId="profile-whatsapp" />
      </div>

      {toast && (
        <div className={`mb-4 rounded-md p-3 text-sm ${toast.type === 'success' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
          {toast.message}
        </div>
      )}

      {/* Avatar */}
      <div className="flex items-center gap-4 mb-8">
        <div className="relative">
          <UserAvatar name={displayName} avatarUrl={profile?.avatarUrl} className="h-20 w-20 text-lg" />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={avatarMutation.isPending}
            className="absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm hover:bg-primary/90 disabled:opacity-50"
          >
            {avatarMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Camera className="h-3 w-3" />}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={handleFileChange}
          />
        </div>
        <div>
          <p className="font-semibold">{displayName}</p>
          <p className="text-sm text-muted-foreground">{displayEmail}</p>
        </div>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="name" className="block text-sm font-medium mb-1">Nome completo</label>
          <Input
            id="name"
            defaultValue={profile?.name ?? ''}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            placeholder="Seu nome"
          />
        </div>

        <div>
          <label htmlFor="email" className="block text-sm font-medium mb-1">E-mail</label>
          <Input id="email" value={displayEmail} disabled className="bg-muted/50" />
          <p className="text-xs text-muted-foreground mt-1">O e-mail não pode ser alterado.</p>
        </div>

        <div>
          <label htmlFor="phone" className="block text-sm font-medium mb-1">
            Telefone (WhatsApp)
          </label>
          <Input
            id="phone"
            type="tel"
            defaultValue={profile?.phone ?? ''}
            onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
            placeholder="+55 11 99999-9999"
          />
          <p className="text-xs text-muted-foreground mt-1">Usado para notificações via WhatsApp.</p>
        </div>

        <div className="flex justify-end pt-2">
          <Button type="submit" disabled={updateMutation.isPending} className="gap-2">
            {updateMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Salvar alterações
          </Button>
        </div>
      </form>
    </div>
  );
}
