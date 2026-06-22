// services/notification-service.js — notificações MULTI-CANAL (e-mail/push/whatsapp) por WEBHOOK,
// com DEGRADAÇÃO GRACIOSA (bloco notificacoes-multicanal): canal sem URL configurada é PULADO sem
// derromper os outros, e o negócio nunca espera/falha pelo envio. Sem dependências externas pesadas.
const CHANNELS = [
  ['email', 'NOTIFY_EMAIL_WEBHOOK_URL'],
  ['push', 'NOTIFY_PUSH_WEBHOOK_URL'],
  ['whatsapp', 'NOTIFY_WHATSAPP_WEBHOOK_URL'],
];
const log = [];

export async function notify(event, payload) {
  const channels = [];
  for (const [ch, env] of CHANNELS) {
    const url = process.env[env];
    if (!url) { channels.push({ channel: ch, status: 'skipped' }); continue; }
    try {
      await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ event, payload }), signal: AbortSignal.timeout(3000) });
      channels.push({ channel: ch, status: 'sent' });
    } catch { channels.push({ channel: ch, status: 'failed' }); }
  }
  const status = channels.some((c) => c.status === 'sent') ? 'sent' : channels.every((c) => c.status === 'skipped') ? 'skipped' : 'failed';
  const rec = { at: new Date().toISOString(), event, status, channels };
  log.push(rec); if (log.length > 200) log.shift();
  return rec;
}
export function recentNotifications() { return log.slice(-20); }
