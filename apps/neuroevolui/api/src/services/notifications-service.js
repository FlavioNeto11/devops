// services/notifications-service.js — despacha notificação para todos os canais habilitados.
// Degradação graciosa: canal sem credencial é pulado; falha num canal não afeta os outros.
import { sendMail, sendConsultationScheduled, sendNoteAdded, sendPaymentFailed } from '../lib/mailer.js';
import { sendPushNotification } from '../lib/push.js';
import { sendWhatsApp } from '../lib/whatsapp.js';
import { getNotificationPreferences, listPushSubscriptions } from '../repositories/notification-preferences-repo.js';

async function dispatchEmail(job) {
  const { eventType, recipientEmail, patientName, scheduledAt, professionalId, amountCents } = job;
  if (!recipientEmail) return;
  try {
    if (eventType === 'consultation.scheduled') {
      await sendConsultationScheduled({ to: recipientEmail, patientName, scheduledAt, professionalId });
    } else if (eventType === 'note.added') {
      await sendNoteAdded({ to: recipientEmail, patientName, professionalId });
    } else if (eventType === 'payment.failed') {
      await sendPaymentFailed({ to: recipientEmail, patientName, amountCents });
    } else {
      await sendMail({ to: recipientEmail, subject: `[NeuroEvolui] ${eventType}`, html: `<p>${eventType}</p>` });
    }
  } catch (e) {
    console.error('[mailer] falha ao enviar e-mail:', e.message);
  }
}

async function dispatchPush(job) {
  const { tenantId, recipientId, eventType, subject, body, url } = job;
  if (!tenantId || !recipientId) return;
  const subscriptions = await listPushSubscriptions(tenantId, recipientId).catch(() => []);
  for (const sub of subscriptions) {
    await sendPushNotification(
      { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
      { title: subject || 'NeuroEvolui', body: body || eventType, url },
    );
  }
}

async function dispatchWhatsApp(job) {
  const { recipientPhone, eventType, subject, body } = job;
  if (!recipientPhone) return;
  await sendWhatsApp(recipientPhone, body || subject || eventType);
}

export async function dispatchNotification(job) {
  const { tenantId, recipientId } = job;
  // Busca preferências; sem DB ou sem registro → todos os canais habilitados por padrão
  const prefs = await getNotificationPreferences(tenantId, recipientId).catch(() => []);
  const disabled = new Set(prefs.filter((p) => !p.enabled).map((p) => p.channel));

  // Usa contact_value da preferência se não veio no job
  const emailPref = prefs.find((p) => p.channel === 'email');
  const phonePref = prefs.find((p) => p.channel === 'whatsapp');
  const jobWithPrefs = {
    ...job,
    recipientEmail: job.recipientEmail || (emailPref?.contact_value) || '',
    recipientPhone: job.recipientPhone || (phonePref?.contact_value) || '',
  };

  const channels = [];
  if (!disabled.has('email')) channels.push(dispatchEmail(jobWithPrefs));
  if (!disabled.has('push')) channels.push(dispatchPush(jobWithPrefs));
  if (!disabled.has('whatsapp')) channels.push(dispatchWhatsApp(jobWithPrefs));

  // Todos os canais em paralelo; falha de um não derruba os outros
  await Promise.allSettled(channels);
}
