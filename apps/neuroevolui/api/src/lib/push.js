// lib/push.js — push web via VAPID/web-push. Degradação graciosa: sem chaves → retorna sem enviar.
import webpush from 'web-push';

let _configured = false;

function ensureConfigured() {
  if (_configured) return true;
  if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) return false;
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || 'mailto:admin@neuroevolui.com',
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY,
  );
  _configured = true;
  return true;
}

export function getVapidPublicKey() {
  return process.env.VAPID_PUBLIC_KEY || null;
}

export async function sendPushNotification(subscription, payload) {
  if (!ensureConfigured()) return;
  try {
    await webpush.sendNotification(subscription, JSON.stringify(payload));
  } catch {
    // graceful — expired/invalid subscriptions are common
  }
}
