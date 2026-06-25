// lib/whatsapp.js — WhatsApp via Twilio. Degradação graciosa: sem credenciais → retorna sem enviar.
export async function sendWhatsApp(to, message) {
  if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN || !process.env.TWILIO_WHATSAPP_FROM || !to) return;

  const url = `https://api.twilio.com/2010-04-01/Accounts/${process.env.TWILIO_ACCOUNT_SID}/Messages.json`;
  const auth = Buffer.from(`${process.env.TWILIO_ACCOUNT_SID}:${process.env.TWILIO_AUTH_TOKEN}`).toString('base64');
  const body = new URLSearchParams({
    From: `whatsapp:${process.env.TWILIO_WHATSAPP_FROM}`,
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
    console.error('[whatsapp] falha ao enviar:', e.message);
  }
}
