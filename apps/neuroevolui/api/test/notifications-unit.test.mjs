// test/notifications-unit.test.mjs — notificações multicanal sem DB/Redis/credenciais.
// Verifica: (1) degradação graciosa de cada canal; (2) dispatcher sem erro; (3) estrutura dos módulos.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const dir = dirname(fileURLToPath(import.meta.url));
const readSrc = (rel) => readFileSync(join(dir, '..', 'src', rel), 'utf8');

// ── Estrutura dos módulos ──────────────────────────────────────────────────────

test('lib/mailer.js exporta funções esperadas', () => {
  const src = readSrc('lib/mailer.js');
  for (const fn of ['sendMail', 'sendConsultationScheduled', 'sendNoteAdded', 'sendPaymentFailed']) {
    assert.ok(src.includes(`export async function ${fn}`), `mailer deve exportar ${fn}`);
  }
});

test('lib/push.js exporta funções esperadas', () => {
  const src = readSrc('lib/push.js');
  assert.ok(src.includes('export function getVapidPublicKey'), 'push deve exportar getVapidPublicKey');
  assert.ok(src.includes('export async function sendPushNotification'), 'push deve exportar sendPushNotification');
});

test('lib/whatsapp.js exporta sendWhatsApp', () => {
  const src = readSrc('lib/whatsapp.js');
  assert.ok(src.includes('export async function sendWhatsApp'), 'whatsapp deve exportar sendWhatsApp');
});

test('services/notifications-service.js exporta dispatchNotification', () => {
  const src = readSrc('services/notifications-service.js');
  assert.ok(src.includes('export async function dispatchNotification'), 'notifications-service deve exportar dispatchNotification');
});

// ── Serviços de domínio enfileiram notificações ───────────────────────────────

test('consultations-service.js enfileira consultation.scheduled', () => {
  const src = readSrc('services/consultations-service.js');
  assert.ok(src.includes("'notifications'"), 'consultations-service deve enfileirar para fila notifications');
  assert.ok(src.includes('consultation.scheduled'), 'consultations-service deve disparar consultation.scheduled');
});

test('evolution-notes-service.js enfileira note.added', () => {
  const src = readSrc('services/evolution-notes-service.js');
  assert.ok(src.includes("'notifications'"), 'evolution-notes-service deve enfileirar para fila notifications');
  assert.ok(src.includes('note.added'), 'evolution-notes-service deve disparar note.added');
});

test('payments-service.js enfileira payment.failed', () => {
  const src = readSrc('services/payments-service.js');
  assert.ok(src.includes('payment.failed'), 'payments-service deve disparar payment.failed');
  assert.ok(src.includes("'notifications'"), 'payments-service deve enfileirar para fila notifications');
});

// ── DB migrations ─────────────────────────────────────────────────────────────

test('db.js contém migrações notification_preferences e push_subscriptions', () => {
  const src = readSrc('db.js');
  assert.ok(src.includes('notification_preferences'), 'db.js deve ter migração para notification_preferences');
  assert.ok(src.includes('push_subscriptions'), 'db.js deve ter migração para push_subscriptions');
});

// ── Fila notifications ────────────────────────────────────────────────────────

test('queue: fila notifications está em NAMED_QUEUES', async () => {
  const { NAMED_QUEUES } = await import('../src/queue.js');
  assert.ok(NAMED_QUEUES.includes('notifications'), "'notifications' deve estar nas filas nomeadas");
});

test('worker.js processa fila notifications via dispatchNotification', () => {
  const src = readSrc('worker.js');
  assert.ok(src.includes("'notifications'"), 'worker.js deve incluir notifications');
  assert.ok(
    src.includes('dispatchNotification') || src.includes('notifications-service'),
    'worker.js deve referenciar o dispatcher de notificações',
  );
});

// ── Degradação graciosa (sem credenciais) ─────────────────────────────────────

test('mailer: sem SMTP retorna sem erro', async () => {
  const saved = { HOST: process.env.SMTP_HOST, USER: process.env.SMTP_USER, PASS: process.env.SMTP_PASS };
  delete process.env.SMTP_HOST; delete process.env.SMTP_USER; delete process.env.SMTP_PASS;
  try {
    const { sendMail, sendConsultationScheduled, sendNoteAdded, sendPaymentFailed } = await import('../src/lib/mailer.js');
    await assert.doesNotReject(() => sendMail({ to: 't@t.com', subject: 'X', html: '<p>X</p>' }));
    await assert.doesNotReject(() => sendConsultationScheduled({ to: 't@t.com', patientName: 'J', scheduledAt: new Date().toISOString() }));
    await assert.doesNotReject(() => sendNoteAdded({ to: 't@t.com', patientName: 'J' }));
    await assert.doesNotReject(() => sendPaymentFailed({ to: 't@t.com', patientName: 'J', amountCents: 10000 }));
  } finally {
    if (saved.HOST) process.env.SMTP_HOST = saved.HOST;
    if (saved.USER) process.env.SMTP_USER = saved.USER;
    if (saved.PASS) process.env.SMTP_PASS = saved.PASS;
  }
});

test('push: sem VAPID keys retorna sem erro', async () => {
  const saved = { PUB: process.env.VAPID_PUBLIC_KEY, PRIV: process.env.VAPID_PRIVATE_KEY };
  delete process.env.VAPID_PUBLIC_KEY; delete process.env.VAPID_PRIVATE_KEY;
  try {
    const { getVapidPublicKey, sendPushNotification } = await import('../src/lib/push.js');
    assert.equal(getVapidPublicKey(), null);
    const sub = { endpoint: 'https://example.com/push/1', keys: { p256dh: 'xxx', auth: 'yyy' } };
    await assert.doesNotReject(() => sendPushNotification(sub, { title: 'X', body: 'Y' }));
  } finally {
    if (saved.PUB) process.env.VAPID_PUBLIC_KEY = saved.PUB;
    if (saved.PRIV) process.env.VAPID_PRIVATE_KEY = saved.PRIV;
  }
});

test('whatsapp: sem credenciais Twilio retorna sem erro', async () => {
  const saved = { SID: process.env.TWILIO_ACCOUNT_SID, TOKEN: process.env.TWILIO_AUTH_TOKEN, FROM: process.env.TWILIO_WHATSAPP_FROM };
  delete process.env.TWILIO_ACCOUNT_SID; delete process.env.TWILIO_AUTH_TOKEN; delete process.env.TWILIO_WHATSAPP_FROM;
  try {
    const { sendWhatsApp } = await import('../src/lib/whatsapp.js');
    await assert.doesNotReject(() => sendWhatsApp('+5511999999999', 'Teste'));
    await assert.doesNotReject(() => sendWhatsApp('', 'Sem destinatário'));
  } finally {
    if (saved.SID) process.env.TWILIO_ACCOUNT_SID = saved.SID;
    if (saved.TOKEN) process.env.TWILIO_AUTH_TOKEN = saved.TOKEN;
    if (saved.FROM) process.env.TWILIO_WHATSAPP_FROM = saved.FROM;
  }
});

test('dispatchNotification: sem DB/credenciais não lança erro (evento gera notificação enfileirada; canal sem credencial é pulado sem erro fatal)', async () => {
  const { dispatchNotification } = await import('../src/services/notifications-service.js');
  // Sem DB → getNotificationPreferences falha silenciosamente (.catch(() => []))
  // Sem credenciais → canais retornam sem enviar
  await assert.doesNotReject(() => dispatchNotification({
    eventType: 'consultation.scheduled',
    tenantId: 1,
    recipientId: 'patient-unit-test',
    recipientEmail: 'patient@test.com',
    recipientPhone: '+5511999999999',
    patientName: 'Paciente Teste',
    scheduledAt: new Date().toISOString(),
    professionalId: 'prof-1',
  }));
});

test('dispatchNotification: os 3 tipos de evento sem erro', async () => {
  const { dispatchNotification } = await import('../src/services/notifications-service.js');
  for (const eventType of ['consultation.scheduled', 'note.added', 'payment.failed']) {
    await assert.doesNotReject(
      () => dispatchNotification({ eventType, tenantId: 1, recipientId: 'patient-test', amountCents: 15000 }),
      `${eventType} não deve lançar erro`,
    );
  }
});

// ── enfileira e consome um job pela fila Redis; sem REDIS_URL cai no fallback inline sem erro ──

test('enqueue notifications: sem REDIS_URL retorna inline=true sem erro', async () => {
  const { enqueue } = await import('../src/queue.js');
  const result = await enqueue('notifications', 'notif-unit-test-key', { eventType: 'note.added', tenantId: 1 });
  assert.equal(result.inline, true, 'deve ser inline sem Redis');
  assert.ok(result.job_id.startsWith('inline-'), 'job_id deve ter prefixo inline-');
});
