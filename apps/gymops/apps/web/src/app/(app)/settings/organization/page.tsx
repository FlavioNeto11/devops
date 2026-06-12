'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { organizationApi, auditLogsApi } from '@/lib/profile-api';
import { deliveriesApi } from '@/lib/admin-api';
import { useAuthStore } from '@/store/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Save, Loader2, Shield, Bell, Image as ImageIcon, CheckCircle, XCircle, AlertTriangle } from 'lucide-react';
import { UserAvatar } from '@/components/ui/avatar';
import { TutorialTrigger } from '@/features/tutorial';

const ACTION_LABELS: Record<string, string> = {
  'org.updated': 'Organização atualizada',
  'unit.archived': 'Unidade arquivada',
  'unit.created': 'Unidade criada',
  'area.archived': 'Área arquivada',
  'area.created': 'Área criada',
  'membership.created': 'Membro adicionado',
  'membership.deleted': 'Membro removido',
  'invitation.sent': 'Convite enviado',
  'invitation.accepted': 'Convite aceito',
  'invitation.cancelled': 'Convite cancelado',
  'template.archived': 'Template arquivado',
};

export default function OrganizationSettingsPage() {
  const { organizationId, userRole } = useAuthStore();
  const queryClient = useQueryClient();
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [auditPage, setAuditPage] = useState(1);

  if (userRole !== 'owner') {
    return <div className="p-8 text-muted-foreground">Apenas owners podem acessar esta página.</div>;
  }

  return <OrganizationContent organizationId={organizationId!} queryClient={queryClient} toast={toast} setToast={setToast} auditPage={auditPage} setAuditPage={setAuditPage} />;
}

function OrganizationContent({ organizationId, queryClient, toast, setToast, auditPage, setAuditPage }: {
  organizationId: string;
  queryClient: ReturnType<typeof useQueryClient>;
  toast: { type: 'success' | 'error'; message: string } | null;
  setToast: (t: { type: 'success' | 'error'; message: string } | null) => void;
  auditPage: number;
  setAuditPage: (p: number) => void;
}) {
  const [form, setForm] = useState({ name: '', logoUrl: '' });
  const [deliveryChannel, setDeliveryChannel] = useState('');
  const [deliveryStatus, setDeliveryStatus] = useState('');
  const [deliveryPage, setDeliveryPage] = useState(1);

  const { data: orgData, isLoading } = useQuery({
    queryKey: ['organization', organizationId],
    queryFn: () => organizationApi.get(organizationId),
    enabled: !!organizationId,
  });

  const { data: auditData, isLoading: auditLoading } = useQuery({
    queryKey: ['audit-logs', organizationId, auditPage],
    queryFn: () => auditLogsApi.list({ organizationId, page: auditPage }),
    enabled: !!organizationId,
  });

  const { data: deliveriesData, isLoading: deliveriesLoading } = useQuery({
    queryKey: ['deliveries', organizationId, deliveryChannel, deliveryStatus, deliveryPage],
    queryFn: () => deliveriesApi.list({ organizationId, channel: deliveryChannel || undefined, status: deliveryStatus || undefined, page: deliveryPage }),
    enabled: !!organizationId,
  });

  const updateMutation = useMutation({
    mutationFn: (data: { name?: string; logoUrl?: string | null }) => organizationApi.update(organizationId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['organization', organizationId] });
      setToast({ type: 'success', message: 'Organização atualizada!' });
      setTimeout(() => setToast(null), 3000);
    },
    onError: () => setToast({ type: 'error', message: 'Erro ao atualizar organização.' }),
  });

  const org = orgData?.data;

  if (isLoading) {
    return <div className="flex items-center justify-center h-64"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>;
  }

  const auditLogs = auditData?.data ?? [];
  const auditMeta = (auditData as { meta?: { total: number; pages: number } })?.meta;

  return (
    <div className="p-3 md:p-6 max-w-3xl mx-auto space-y-8">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">Configurações da Organização</h1>
          <p className="text-sm text-muted-foreground mt-1">Slug: <code className="bg-muted px-1 rounded">{org?.slug}</code></p>
        </div>
        <TutorialTrigger tutorialId="organization-admin" />
      </div>

      {toast && (
        <div className={`rounded-md p-3 text-sm ${toast.type === 'success' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
          {toast.message}
        </div>
      )}

      {/* Basic info + branding */}
      <section className="rounded-lg border p-4 md:p-6 space-y-4">
        <h2 className="font-semibold text-base">Informações e branding</h2>
        <div>
          <label htmlFor="org-name" className="block text-sm font-medium mb-1">Nome da organização</label>
          <Input
            id="org-name"
            defaultValue={org?.name ?? ''}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            placeholder="Nome da organização"
          />
        </div>
        <div>
          <label htmlFor="org-logo" className="block text-sm font-medium mb-1">URL do logotipo</label>
          <div className="flex items-center gap-3">
            {(form.logoUrl || org?.logoUrl) && (
              <img
                src={form.logoUrl || (org?.logoUrl ?? '')}
                alt="Logo"
                className="h-10 w-10 rounded-lg object-contain border bg-muted/30"
                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
              />
            )}
            {!(form.logoUrl || org?.logoUrl) && (
              <div className="h-10 w-10 rounded-lg border bg-muted/30 flex items-center justify-center">
                <ImageIcon className="h-5 w-5 text-muted-foreground opacity-50" />
              </div>
            )}
            <Input
              id="org-logo"
              defaultValue={org?.logoUrl ?? ''}
              onChange={(e) => setForm((f) => ({ ...f, logoUrl: e.target.value }))}
              placeholder="https://exemplo.com/logo.png"
              className="flex-1"
            />
          </div>
          <p className="text-xs text-muted-foreground mt-1">URL pública da imagem (PNG, SVG, JPEG). Para upload de arquivo, use a API de anexos.</p>
        </div>
        <div className="flex gap-2 justify-end">
          {org?.logoUrl && (
            <Button
              variant="outline"
              onClick={() => { setForm((f) => ({ ...f, logoUrl: '' })); updateMutation.mutate({ logoUrl: null }); }}
              disabled={updateMutation.isPending}
            >
              Remover logo
            </Button>
          )}
          <Button
            onClick={() => updateMutation.mutate({ name: form.name || org?.name, logoUrl: form.logoUrl || undefined })}
            disabled={updateMutation.isPending}
            className="gap-2"
          >
            {updateMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Salvar
          </Button>
        </div>
      </section>

      {/* Audit log */}
      <section className="rounded-lg border p-4 md:p-6 space-y-4">
        <div className="flex items-center gap-2">
          <Shield className="h-5 w-5 text-muted-foreground" />
          <h2 className="font-semibold text-base">Auditoria</h2>
        </div>
        <p className="text-sm text-muted-foreground">Registro de ações administrativas da organização.</p>

        {auditLoading ? (
          <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : auditLogs.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground text-sm">
            <Shield className="h-8 w-8 mx-auto mb-2 opacity-40" />
            Nenhum registro de auditoria encontrado.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-muted-foreground text-xs">
                  <th className="text-left py-2 pr-4 font-medium">Data</th>
                  <th className="text-left py-2 pr-4 font-medium">Usuário</th>
                  <th className="text-left py-2 font-medium">Ação</th>
                </tr>
              </thead>
              <tbody>
                {auditLogs.map((log) => (
                  <tr key={log.id} className="border-b last:border-0 hover:bg-muted/30">
                    <td className="py-2 pr-4 whitespace-nowrap text-muted-foreground">
                      {new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(log.createdAt))}
                    </td>
                    <td className="py-2 pr-4">
                      <div className="flex items-center gap-2">
                        <UserAvatar name={log.user.name} avatarUrl={log.user.avatarUrl} className="h-5 w-5 text-[10px]" />
                        <span className="truncate max-w-[120px]">{log.user.name}</span>
                      </div>
                    </td>
                    <td className="py-2">
                      <Badge variant="outline" className="text-xs">
                        {ACTION_LABELS[log.action] ?? log.action}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {auditMeta && auditMeta.pages > 1 && (
              <div className="flex items-center justify-between pt-4">
                <span className="text-xs text-muted-foreground">{auditMeta.total} registros</span>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => setAuditPage(Math.max(1, auditPage - 1))} disabled={auditPage <= 1}>
                    Anterior
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setAuditPage(auditPage + 1)} disabled={auditPage >= auditMeta.pages}>
                    Próxima
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </section>
      {/* Delivery log */}
      <section className="rounded-lg border p-4 md:p-6 space-y-4">
        <div className="flex items-center gap-2">
          <Bell className="h-5 w-5 text-muted-foreground" />
          <h2 className="font-semibold text-base">Log de notificações</h2>
        </div>
        <p className="text-sm text-muted-foreground">Histórico de entregas de notificações da organização.</p>

        <div className="flex gap-2 flex-wrap">
          <select
            value={deliveryChannel}
            onChange={(e) => { setDeliveryChannel(e.target.value); setDeliveryPage(1); }}
            className="h-8 rounded-md border border-input bg-background px-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
          >
            <option value="">Todos os canais</option>
            <option value="email">Email</option>
            <option value="push">Push</option>
            <option value="whatsapp">WhatsApp</option>
          </select>
          <select
            value={deliveryStatus}
            onChange={(e) => { setDeliveryStatus(e.target.value); setDeliveryPage(1); }}
            className="h-8 rounded-md border border-input bg-background px-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
          >
            <option value="">Todos os status</option>
            <option value="sent">Enviado</option>
            <option value="failed">Falhou</option>
            <option value="pending">Pendente</option>
          </select>
        </div>

        {deliveriesLoading ? (
          <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : !deliveriesData?.data?.length ? (
          <div className="text-center py-8 text-muted-foreground text-sm">
            <Bell className="h-8 w-8 mx-auto mb-2 opacity-40" />
            Nenhum registro encontrado.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-muted-foreground text-xs">
                  <th className="text-left py-2 pr-3 font-medium">Data</th>
                  <th className="text-left py-2 pr-3 font-medium">Canal</th>
                  <th className="text-left py-2 pr-3 font-medium">Tipo</th>
                  <th className="text-left py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {deliveriesData.data.map((d) => (
                  <tr key={d.id} className="border-b last:border-0 hover:bg-muted/30">
                    <td className="py-2 pr-3 whitespace-nowrap text-muted-foreground text-xs">
                      {new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(d.createdAt))}
                    </td>
                    <td className="py-2 pr-3">
                      <Badge variant="outline" className="text-xs capitalize">{d.channel}</Badge>
                    </td>
                    <td className="py-2 pr-3 text-xs text-muted-foreground">{d.type}</td>
                    <td className="py-2">
                      <span className={`inline-flex items-center gap-1 text-xs ${d.status === 'sent' ? 'text-green-600' : d.status === 'failed' ? 'text-red-600' : 'text-amber-600'}`}>
                        {d.status === 'sent' ? <CheckCircle className="h-3 w-3" /> : d.status === 'failed' ? <XCircle className="h-3 w-3" /> : <AlertTriangle className="h-3 w-3" />}
                        {d.status === 'sent' ? 'Enviado' : d.status === 'failed' ? 'Falhou' : 'Pendente'}
                      </span>
                      {d.errorMessage && (
                        <p className="text-xs text-red-500 mt-0.5 truncate max-w-[200px]">{d.errorMessage}</p>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="flex justify-end gap-2 pt-3">
              <Button variant="outline" size="sm" onClick={() => setDeliveryPage(Math.max(1, deliveryPage - 1))} disabled={deliveryPage <= 1}>
                Anterior
              </Button>
              <Button variant="outline" size="sm" onClick={() => setDeliveryPage(deliveryPage + 1)} disabled={(deliveriesData?.data?.length ?? 0) < 20}>
                Próxima
              </Button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
