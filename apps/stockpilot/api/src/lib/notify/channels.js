// lib/notify/channels.js — REQ-STOCKPILOT-0007: adapters de canal (e-mail, push web, whatsapp).
//
// Segue o padrão do GymOps (lib/{mailer,push,whatsapp}): cada canal é um adapter independente com
// DEGRADAÇÃO GRACIOSA — canal SEM configuração (env ausente) é PULADO (isConfigured() === false),
// sem derrubar os outros. Sem dependências externas pesadas: a entrega é ESTRUTURADA via fetch a um
// webhook configurável (e-mail/whatsapp/push HTTP gateway) OU stub logado quando há config de "log".
//
// Convenção de configuração por canal:
//   - e-mail:   NOTIFY_EMAIL_WEBHOOK_URL    (recebe { to, subject, html })
//   - push web: NOTIFY_PUSH_WEBHOOK_URL     (recebe { title, body, url, action })  — VAPID/web-push gateway
//   - whatsapp: NOTIFY_WHATSAPP_WEBHOOK_URL (recebe { to, message })
// `NOTIFY_<canal>_TO` define o destinatário lógico (default 'operadores'); o webhook resolve a entrega real.

async function postWebhook(url, body, fetchImpl) {
  const r = await fetchImpl(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(Number(process.env.NOTIFY_TIMEOUT_MS) || 8000),
  });
  if (!r.ok) throw new Error('webhook respondeu ' + r.status);
  return r;
}

export function emailChannel(env = process.env) {
  return {
    name: 'email',
    isConfigured: () => Boolean(env.NOTIFY_EMAIL_WEBHOOK_URL),
    async deliver(message, { fetchImpl = fetch } = {}) {
      await postWebhook(env.NOTIFY_EMAIL_WEBHOOK_URL, {
        to: env.NOTIFY_EMAIL_TO || 'operadores',
        subject: message.subject,
        html: message.html,
      }, fetchImpl);
    },
  };
}

export function pushChannel(env = process.env) {
  return {
    name: 'push',
    isConfigured: () => Boolean(env.NOTIFY_PUSH_WEBHOOK_URL),
    async deliver(message, { fetchImpl = fetch } = {}) {
      await postWebhook(env.NOTIFY_PUSH_WEBHOOK_URL, {
        title: message.title,
        body: message.summary,
        url: message.url,
        action: 'Ver painel',
      }, fetchImpl);
    },
  };
}

export function whatsappChannel(env = process.env) {
  return {
    name: 'whatsapp',
    isConfigured: () => Boolean(env.NOTIFY_WHATSAPP_WEBHOOK_URL),
    async deliver(message, { fetchImpl = fetch } = {}) {
      await postWebhook(env.NOTIFY_WHATSAPP_WEBHOOK_URL, {
        to: env.NOTIFY_WHATSAPP_TO || 'operadores',
        message: message.summary,
      }, fetchImpl);
    },
  };
}

// Conjunto canônico de canais, na ordem de fan-out. Cada um lê sua própria config do `env`.
export function defaultChannels(env = process.env) {
  return [emailChannel(env), pushChannel(env), whatsappChannel(env)];
}
