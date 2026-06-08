import { env } from '../env.js';

export async function sendWhatsApp(to: string, message: string): Promise<void> {
  if (!env.TWILIO_ACCOUNT_SID || !env.TWILIO_AUTH_TOKEN || !env.TWILIO_WHATSAPP_FROM || !to) return;

  const url = `https://api.twilio.com/2010-04-01/Accounts/${env.TWILIO_ACCOUNT_SID}/Messages.json`;
  const auth = Buffer.from(`${env.TWILIO_ACCOUNT_SID}:${env.TWILIO_AUTH_TOKEN}`).toString('base64');
  const body = new URLSearchParams({
    From: `whatsapp:${env.TWILIO_WHATSAPP_FROM}`,
    To: `whatsapp:${to}`,
    Body: message,
  });

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });
    if (!res.ok) {
      const err = await res.text();
      console.error('[whatsapp] Twilio error:', err);
    }
  } catch (e) {
    console.error('[whatsapp] Failed to send:', e);
  }
}
