'use client';

import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { CheckCircle, XCircle, AlertTriangle, Trash2, ExternalLink, MessageCircle, Link2, RefreshCw, Send, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { integrationsApi } from '@/lib/imports-api';
import { notificationsApi } from '@/lib/activities-api';
import { integrationsExtApi } from '@/lib/admin-api';
import { TutorialTrigger } from '@/features/tutorial';
import { useAuthStore } from '@/store/auth';

export default function IntegrationsPage() {
  const qc = useQueryClient();
  const organizationId = useAuthStore((s) => s.organizationId);
  const user = useAuthStore((s) => s.user);
  const [trelloConnecting, setTrelloConnecting] = useState(false);
  const [testingChannel, setTestingChannel] = useState<string | null>(null);

  // Handle Trello OAuth callback — token arrives in URL hash (#token=xxx)
  useEffect(() => {
    if (typeof window === 'undefined' || !organizationId) return;
    const hash = window.location.hash;
    if (!hash.includes('token=')) return;
    const token = new URLSearchParams(hash.replace('#', '')).get('token');
    if (!token) return;
    window.history.replaceState(null, '', window.location.pathname);
    setTrelloConnecting(true);
    integrationsApi.connectTrello(token, organizationId)
      .then(() => {
        toast.success('Trello conectado com sucesso!');
        void qc.invalidateQueries({ queryKey: ['integrations', organizationId] });
        void qc.invalidateQueries({ queryKey: ['trello-health', organizationId] });
      })
      .catch(() => toast.error('Falha ao conectar Trello'))
      .finally(() => setTrelloConnecting(false));
  }, [organizationId, qc]);

  const { data: integrationsData, isLoading } = useQuery({
    queryKey: ['integrations', organizationId],
    queryFn: () => integrationsApi.getAll(organizationId!),
    enabled: !!organizationId,
  });

  const { data: trelloHealthData, isLoading: trelloHealthLoading } = useQuery({
    queryKey: ['trello-health', organizationId],
    queryFn: () => integrationsExtApi.getTrelloHealth(organizationId!),
    enabled: !!organizationId,
    staleTime: 60_000,
  });

  const { data: whatsappStatusData } = useQuery({
    queryKey: ['whatsapp-status', organizationId],
    queryFn: () => integrationsExtApi.getWhatsAppStatus(organizationId!),
    enabled: !!organizationId,
    staleTime: 60_000,
  });

  const { data: prefsData } = useQuery({
    queryKey: ['notification-preferences'],
    queryFn: () => notificationsApi.getPreferences(),
  });

  const integrations = integrationsData?.data ?? [];
  const trello = integrations.find((i) => i.provider === 'trello');
  const trelloHealth = trelloHealthData?.data;
  const whatsappStatus = whatsappStatusData?.data;
  const whatsappPref = prefsData?.data?.find((p: { channel: string; enabled: boolean }) => p.channel === 'whatsapp');
  const whatsappEnabled = whatsappPref?.enabled ?? false;

  const disconnectMutation = useMutation({
    mutationFn: (id: string) => integrationsApi.disconnect(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['integrations', organizationId] });
      void qc.invalidateQueries({ queryKey: ['trello-health', organizationId] });
      toast.success('Integração removida');
    },
    onError: () => toast.error('Erro ao remover integração'),
  });

  const reconnectMutation = useMutation({
    mutationFn: () => integrationsExtApi.reconnectTrello(organizationId!),
    onSuccess: (res) => {
      window.location.href = res.data.url;
    },
    onError: () => toast.error('Erro ao iniciar reconexão do Trello'),
  });

  const connectTrello = async () => {
    try {
      const res = await integrationsApi.getTrelloAuthUrl();
      window.location.href = res.data.url;
    } catch {
      toast.error('Trello não configurado neste servidor');
    }
  };

  const testNotification = async (channel: 'email' | 'push' | 'whatsapp') => {
    setTestingChannel(channel);
    try {
      await integrationsExtApi.testNotification(channel, organizationId ?? undefined);
      toast.success(`Notificação de teste enviada via ${channel}!`);
    } catch {
      toast.error(`Falha ao enviar teste via ${channel}`);
    } finally {
      setTestingChannel(null);
    }
  };

  const toggleWhatsapp = useMutation({
    mutationFn: (enabled: boolean) => {
      if (!user) throw new Error('Not authenticated');
      return notificationsApi.updatePreferences(user.id, { whatsapp: { enabled } });
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['notification-preferences'] }),
    onError: () => toast.error('Erro ao salvar preferência'),
  });

  // Trello health indicator
  const trelloIsHealthy = trelloHealth?.connected && trelloHealth?.healthy;
  const trelloConnected = trelloHealth?.connected ?? !!trello;
  const trelloDegraded = trelloHealth?.connected && !trelloHealth?.healthy;

  return (
    <div className="p-3 md:p-6 max-w-2xl space-y-8" data-tutorial="settings-integrations">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold">Integrações</h1>
          <p className="text-sm text-muted-foreground">Conecte ferramentas externas e gerencie notificações</p>
        </div>
        <TutorialTrigger tutorialId="integrations" />
      </div>

      {/* Trello */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <Link2 className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Trello</h2>
        </div>

        <div className="rounded-lg border p-4" data-tutorial="trello-connect-card">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-100 font-bold text-blue-700 text-lg">
                T
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-medium">Trello</p>
                  {!trelloHealthLoading && (
                    <>
                      {trelloIsHealthy && (
                        <Badge variant="secondary" className="text-green-700 bg-green-50 border-green-200 text-xs gap-1">
                          <CheckCircle className="h-3 w-3" />
                          Saudável
                        </Badge>
                      )}
                      {trelloDegraded && (
                        <Badge variant="secondary" className="text-amber-700 bg-amber-50 border-amber-200 text-xs gap-1">
                          <AlertTriangle className="h-3 w-3" />
                          Degradado
                        </Badge>
                      )}
                      {!trelloConnected && !isLoading && (
                        <Badge variant="secondary" className="text-muted-foreground text-xs">
                          Não conectado
                        </Badge>
                      )}
                    </>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">Importe boards, listas e cards do Trello para o GymOps</p>
                {trelloHealth?.connectedAt && (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Conectado em {new Date(trelloHealth.connectedAt).toLocaleDateString('pt-BR')}
                  </p>
                )}
                {trelloDegraded && (
                  <p className="text-xs text-amber-600 mt-1 flex items-center gap-1">
                    <AlertTriangle className="h-3 w-3 shrink-0" />
                    Token pode estar expirado. Reconecte para restaurar o acesso.
                  </p>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0 flex-wrap">
              {trelloConnected ? (
                <>
                  {trelloDegraded && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => reconnectMutation.mutate()}
                      disabled={reconnectMutation.isPending}
                      className="gap-1.5"
                    >
                      <RefreshCw className={`h-3.5 w-3.5 ${reconnectMutation.isPending ? 'animate-spin' : ''}`} />
                      Reconectar
                    </Button>
                  )}
                  <Button size="sm" variant="outline" onClick={() => window.open('https://trello.com', '_blank')}>
                    <ExternalLink className="h-3.5 w-3.5 mr-1" />
                    Abrir
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-red-600 hover:text-red-700"
                    onClick={() => trello && disconnectMutation.mutate(trello.id)}
                    disabled={disconnectMutation.isPending}
                  >
                    <Trash2 className="h-3.5 w-3.5 mr-1" />
                    Desconectar
                  </Button>
                </>
              ) : (
                <Button size="sm" onClick={connectTrello} disabled={trelloConnecting || isLoading}>
                  {trelloConnecting ? <><Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />Conectando...</> : 'Conectar Trello'}
                </Button>
              )}
            </div>
          </div>

          {!trelloConnected && !isLoading && (
            <p className="mt-3 text-xs text-muted-foreground">
              Conecte sua conta Trello para importar boards. Você também pode importar via arquivo JSON exportado diretamente do Trello.
            </p>
          )}
        </div>
      </section>

      {/* WhatsApp */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <MessageCircle className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">WhatsApp</h2>
        </div>

        <div className="rounded-lg border p-4">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-green-100 font-bold text-green-700 text-lg">
                W
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-medium">Alertas WhatsApp</p>
                  {whatsappStatus?.configured ? (
                    <Badge variant="secondary" className="text-green-700 bg-green-50 border-green-200 text-xs gap-1">
                      <CheckCircle className="h-3 w-3" />
                      {whatsappStatus.sandbox ? 'Sandbox' : 'Configurado'}
                    </Badge>
                  ) : (
                    <Badge variant="secondary" className="text-muted-foreground text-xs gap-1">
                      <XCircle className="h-3 w-3" />
                      Não configurado
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Receba alertas de atividades CRÍTICAS via WhatsApp.
                </p>
                {whatsappStatus?.from && (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Número de envio: <span className="font-mono">{whatsappStatus.from}</span>
                  </p>
                )}
                {whatsappEnabled && (
                  <p className="mt-1 text-xs text-amber-600">
                    Certifique-se de que seu número está cadastrado no perfil de usuário.
                  </p>
                )}
                {whatsappStatus?.lastErrors && whatsappStatus.lastErrors.length > 0 && (
                  <details className="mt-2">
                    <summary className="text-xs text-red-600 cursor-pointer flex items-center gap-1">
                      <AlertTriangle className="h-3 w-3" />
                      {whatsappStatus.lastErrors.length} erro(s) recente(s)
                    </summary>
                    <ul className="mt-1 space-y-0.5">
                      {whatsappStatus.lastErrors.slice(0, 3).map((err, i) => (
                        <li key={i} className="text-xs text-red-500 font-mono bg-red-50 rounded px-2 py-0.5 truncate">
                          {err}
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
              </div>
            </div>

            <div className="flex flex-col items-end gap-2 shrink-0">
              <button
                disabled={toggleWhatsapp.isPending}
                onClick={() => toggleWhatsapp.mutate(!whatsappEnabled)}
                className={[
                  'relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors focus-visible:outline-none disabled:opacity-50',
                  whatsappEnabled ? 'bg-primary' : 'bg-input',
                ].join(' ')}
                role="switch"
                aria-checked={whatsappEnabled}
                aria-label="Ativar alertas WhatsApp"
              >
                <span
                  className={[
                    'pointer-events-none block h-4 w-4 rounded-full bg-background shadow-lg ring-0 transition-transform',
                    whatsappEnabled ? 'translate-x-4' : 'translate-x-0',
                  ].join(' ')}
                />
              </button>
              {whatsappStatus?.configured && (
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1.5 h-7 text-xs"
                  disabled={testingChannel === 'whatsapp'}
                  onClick={() => void testNotification('whatsapp')}
                >
                  {testingChannel === 'whatsapp' ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
                  Testar
                </Button>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Notification channels */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <Send className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Canais de notificação</h2>
        </div>

        <div className="rounded-lg border divide-y">
          {(['email', 'push'] as const).map((channel) => (
            <div key={channel} className="flex items-center justify-between p-4 gap-4">
              <div>
                <p className="text-sm font-medium capitalize">{channel === 'push' ? 'Push (browser)' : 'E-mail'}</p>
                <p className="text-xs text-muted-foreground">
                  {channel === 'email' ? 'Notificações enviadas para seu e-mail cadastrado.' : 'Notificações push no navegador (VAPID).'}
                </p>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5 h-7 text-xs shrink-0"
                disabled={testingChannel === channel}
                onClick={() => void testNotification(channel)}
              >
                {testingChannel === channel ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
                Testar
              </Button>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
