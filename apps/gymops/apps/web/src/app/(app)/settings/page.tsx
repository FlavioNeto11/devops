'use client';

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Bell, Mail, Smartphone, MessageCircle, CheckCircle, Send, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { QueryErrorState } from '@/components/ui/query-error-state';
import { notificationsApi } from '@/lib/activities-api';
import { integrationsExtApi, deliveriesApi } from '@/lib/admin-api';
import { TutorialTrigger } from '@/features/tutorial';
import { useAuthStore } from '@/store/auth';

interface ChannelPref {
  channel: string;
  enabled: boolean;
}

const CHANNELS = [
  { key: 'email', label: 'E-mail', description: 'Receba notificações por e-mail quando for atribuído ou houver prazos vencendo', icon: Mail },
  { key: 'push', label: 'Push (navegador)', description: 'Notificações em tempo real no navegador', icon: Smartphone },
  { key: 'whatsapp', label: 'WhatsApp', description: 'Alertas críticos via WhatsApp (requer número cadastrado)', icon: MessageCircle },
] as const;

type ChannelKey = typeof CHANNELS[number]['key'];

function urlBase64ToUint8Array(base64String: string): ArrayBuffer {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  return new Uint8Array([...rawData].map((c) => c.charCodeAt(0))).buffer as ArrayBuffer;
}

const DELIVERY_STATUS_COLORS: Record<string, string> = {
  sent: 'text-green-600',
  failed: 'text-red-600',
  pending: 'text-amber-600',
};

export default function SettingsPage() {
  const qc = useQueryClient();
  const { user, organizationId, userRole } = useAuthStore();
  const isAdmin = userRole === 'owner' || userRole === 'org_manager';
  const [pushStatus, setPushStatus] = useState<'idle' | 'requesting' | 'subscribed' | 'denied' | 'unsupported'>('idle');
  const [showDeliveries, setShowDeliveries] = useState(false);

  useEffect(() => {
    if (!('Notification' in window) || !('serviceWorker' in navigator)) {
      setPushStatus('unsupported');
      return;
    }
    if (Notification.permission === 'denied') setPushStatus('denied');
    else if (Notification.permission === 'granted') setPushStatus('subscribed');
  }, []);

  const { data: prefsData, isLoading, isError, refetch } = useQuery({
    queryKey: ['notification-preferences'],
    queryFn: () => notificationsApi.getPreferences(),
  });

  const { data: vapidData } = useQuery({
    queryKey: ['vapid-key'],
    queryFn: () => notificationsApi.getVapidKey(),
  });

  const prefs: ChannelPref[] = prefsData?.data ?? [];
  const vapidKey = vapidData?.data?.publicKey ?? null;

  function isEnabled(channel: string): boolean {
    const found = prefs.find((p) => p.channel === channel);
    return found?.enabled ?? true;
  }

  const toggleMutation = useMutation({
    mutationFn: ({ channel, enabled }: { channel: ChannelKey; enabled: boolean }) => {
      if (!user) throw new Error('Not authenticated');
      return notificationsApi.updatePreferences(user.id, { [channel]: { enabled } });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['notification-preferences'] });
    },
    onError: () => toast.error('Erro ao salvar preferência'),
  });

  const { data: deliveriesData, isLoading: deliveriesLoading, isError: deliveriesError, refetch: refetchDeliveries } = useQuery({
    queryKey: ['notification-deliveries', organizationId],
    queryFn: () => deliveriesApi.list({ organizationId: organizationId ?? undefined }),
    enabled: !!organizationId && showDeliveries && isAdmin,
  });

  const testMutation = useMutation({
    mutationFn: (channel: 'email' | 'push' | 'whatsapp') =>
      integrationsExtApi.testNotification(channel, organizationId ?? undefined),
    onSuccess: (_, channel) => toast.success(`Notificação de teste (${channel}) enviada!`),
    onError: () => toast.error('Erro ao enviar notificação de teste.'),
  });

  const subscribeMutation = useMutation({
    mutationFn: async () => {
      if (!vapidKey) throw new Error('VAPID key not available');
      setPushStatus('requesting');
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setPushStatus('denied');
        throw new Error('Permission denied');
      }
      const reg = await navigator.serviceWorker.ready;
      const subscription = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey),
      });
      await notificationsApi.subscribe(subscription.toJSON());
      setPushStatus('subscribed');
    },
    onSuccess: () => toast.success('Notificações push ativadas'),
    onError: (err: Error) => {
      if (err.message !== 'Permission denied') toast.error('Erro ao ativar notificações push');
    },
  });

  return (
    <div className="p-3 md:p-6 max-w-2xl space-y-8">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold">Configurações</h1>
          <p className="text-sm text-muted-foreground">Gerencie suas preferências de notificação</p>
        </div>
        <TutorialTrigger tutorialId="notifications-logs" />
      </div>

      {/* Notification preferences */}
      <section className="space-y-4" data-tutorial="settings-notifications">
        <div className="flex items-center gap-2">
          <Bell className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Notificações</h2>
        </div>

        {isError && (
          <QueryErrorState
            description="As preferências exibidas podem não refletir o estado salvo."
            onRetry={() => refetch()}
          />
        )}

        <div className="divide-y rounded-lg border">
          {CHANNELS.map(({ key, label, description, icon: Icon }) => {
            const enabled = isEnabled(key);
            const isPending = toggleMutation.isPending;

            return (
              <div key={key} className="flex items-start gap-4 p-4">
                <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted">
                  <Icon className="h-4 w-4 text-muted-foreground" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{label}</p>
                  <p className="text-xs text-muted-foreground">{description}</p>

                  {/* Push activation button */}
                  {key === 'push' && enabled && pushStatus !== 'subscribed' && pushStatus !== 'unsupported' && (
                    <div className="mt-2">
                      {pushStatus === 'denied' ? (
                        <p className="text-xs text-amber-600">
                          Permissão negada. Habilite notificações nas configurações do navegador.
                        </p>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs"
                          onClick={() => subscribeMutation.mutate()}
                          disabled={subscribeMutation.isPending || !vapidKey}
                        >
                          {subscribeMutation.isPending ? 'Ativando...' : 'Ativar notificações push'}
                        </Button>
                      )}
                    </div>
                  )}

                  {key === 'push' && pushStatus === 'subscribed' && (
                    <div className="mt-2 flex items-center gap-1 text-xs text-green-600">
                      <CheckCircle className="h-3 w-3" />
                      Ativo neste navegador
                    </div>
                  )}

                  {key === 'push' && pushStatus === 'unsupported' && (
                    <p className="mt-1 text-xs text-muted-foreground">Não suportado neste navegador.</p>
                  )}
                </div>

                {/* Toggle */}
                <button
                  disabled={isPending || isLoading}
                  onClick={() => toggleMutation.mutate({ channel: key, enabled: !enabled })}
                  className={[
                    'relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
                    enabled ? 'bg-primary' : 'bg-input',
                  ].join(' ')}
                  role="switch"
                  aria-checked={enabled}
                  aria-label={`Notificações por ${label}: ${enabled ? 'ativadas' : 'desativadas'}`}
                >
                  <span
                    className={[
                      'pointer-events-none block h-4 w-4 rounded-full bg-background shadow-lg ring-0 transition-transform',
                      enabled ? 'translate-x-4' : 'translate-x-0',
                    ].join(' ')}
                  />
                </button>
              </div>
            );
          })}
        </div>
      </section>

      {/* Test notifications (admin) */}
      {isAdmin && (
        <section className="space-y-4">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Teste de envio</h2>
          <div className="rounded-lg border p-4 space-y-3">
            <p className="text-xs text-muted-foreground">Envie uma notificação de teste para verificar a integração de cada canal.</p>
            <div className="flex flex-wrap gap-2">
              {(['email', 'push', 'whatsapp'] as const).map((ch) => (
                <Button
                  key={ch}
                  size="sm"
                  variant="outline"
                  className="gap-2"
                  onClick={() => testMutation.mutate(ch)}
                  disabled={testMutation.isPending}
                >
                  {testMutation.isPending && testMutation.variables === ch
                    ? <Loader2 className="h-3 w-3 animate-spin" />
                    : <Send className="h-3 w-3" />}
                  Testar {ch === 'email' ? 'E-mail' : ch === 'push' ? 'Push' : 'WhatsApp'}
                </Button>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Delivery log (admin) */}
      {isAdmin && (
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Log de entregas</h2>
            <Button size="sm" variant="ghost" onClick={() => setShowDeliveries(!showDeliveries)}>
              {showDeliveries ? 'Ocultar' : 'Ver log'}
            </Button>
          </div>
          {showDeliveries && deliveriesError && deliveriesData && (
            <QueryErrorState
              className="py-4"
              title="Não foi possível atualizar"
              description="Exibindo os últimos dados carregados."
              onRetry={() => refetchDeliveries()}
            />
          )}
          {showDeliveries && (
            deliveriesError && !deliveriesData ? (
              <QueryErrorState onRetry={() => refetchDeliveries()} />
            ) : deliveriesLoading ? (
              <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
            ) : (deliveriesData?.data ?? []).length === 0 ? (
              <div className="text-center py-8 text-sm text-muted-foreground border rounded-lg">Nenhum registro de entrega encontrado.</div>
            ) : (
              <div className="overflow-x-auto rounded-lg border">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b text-muted-foreground">
                      <th className="text-left py-2 px-3 font-medium">Data</th>
                      <th className="text-left py-2 px-3 font-medium">Canal</th>
                      <th className="text-left py-2 px-3 font-medium">Tipo</th>
                      <th className="text-left py-2 px-3 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(deliveriesData?.data ?? []).map((d) => (
                      <tr key={d.id} className="border-b last:border-0 hover:bg-muted/30">
                        <td className="py-2 px-3 whitespace-nowrap text-muted-foreground">
                          {new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(d.createdAt))}
                        </td>
                        <td className="py-2 px-3 whitespace-nowrap">{d.channel}</td>
                        <td className="py-2 px-3 whitespace-nowrap text-muted-foreground">{d.type}</td>
                        <td className="py-2 px-3">
                          <span className={`font-medium ${DELIVERY_STATUS_COLORS[d.status] ?? ''}`}>{d.status}</span>
                          {d.errorMessage && <div className="text-muted-foreground truncate max-w-[120px]">{d.errorMessage}</div>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          )}
        </section>
      )}

      {/* Account info */}
      {user && (
        <section className="space-y-4">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Conta</h2>
          <div className="rounded-lg border p-4 space-y-1">
            <p className="text-sm font-medium">{user.name}</p>
            <p className="text-xs text-muted-foreground">{user.email}</p>
          </div>
        </section>
      )}
    </div>
  );
}
