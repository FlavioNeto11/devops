// lib/push.js — notificações push (bloco notificacoes-multicanal).
// Degradação graciosa: sem VAPID keys, canal é pulado sem erro fatal.
let _webpush = null;
let _configured = false;

async function loadWebPush() {
  if (_webpush) return _webpush;
  try { const m = await import('web-push'); _webpush = m.default || m; return _webpush; } catch { return null; }
}

async function configure() {
  if (_configured && _webpush) return _webpush;
  const pub = process.env.VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) return null; // canal sem credencial: pulado
  const wp = await loadWebPush();
  if (!wp) return null;
  wp.setVapidDetails(process.env.VAPID_EMAIL || 'mailto:admin@contaviva360', pub, priv);
  _configured = true;
  return wp;
}

export function getVapidPublicKey() { return process.env.VAPID_PUBLIC_KEY || null; }

export async function sendPushAlert(subscription, { tipo, nivel, dataVencimento }) {
  const wp = await configure();
  if (!wp) return null; // canal sem credencial: pulado
  const data = new Date(dataVencimento).toLocaleDateString('pt-BR');
  const payload = JSON.stringify({ title: `ContaViva 360: ${nivel.toUpperCase()}`, body: `${tipo} vence em ${data}`, nivel });
  try { return await wp.sendNotification(subscription, payload); } catch { return null; }
}
