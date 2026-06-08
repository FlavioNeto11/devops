import webpush from 'web-push';
import { env } from '../env.js';

let _configured = false;

function ensureConfigured() {
  if (_configured) return true;
  if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY) return false;
  webpush.setVapidDetails(env.VAPID_SUBJECT, env.VAPID_PUBLIC_KEY, env.VAPID_PRIVATE_KEY);
  _configured = true;
  return true;
}

export function getVapidPublicKey(): string | null {
  return env.VAPID_PUBLIC_KEY ?? null;
}

export async function sendPushNotification(
  subscription: { endpoint: string; keys: { p256dh: string; auth: string } },
  payload: { title: string; body: string; url?: string },
): Promise<void> {
  if (!ensureConfigured()) return;
  try {
    await webpush.sendNotification(subscription, JSON.stringify(payload));
  } catch {
    // graceful — expired/invalid subscriptions are common
  }
}
