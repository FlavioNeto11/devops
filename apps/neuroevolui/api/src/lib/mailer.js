// lib/mailer.js — e-mail via Nodemailer. Degradação graciosa: sem SMTP → retorna sem enviar.
import nodemailer from 'nodemailer';

const FROM = process.env.SMTP_FROM || 'NeuroEvolui <noreply@neuroevolui.com>';

function createTransport() {
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) return null;
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 587,
    secure: Number(process.env.SMTP_PORT) === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
}

function baseLayout(title, body) {
  return `<!DOCTYPE html><html><body style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px">
<h2 style="color:#1e293b">${title}</h2>
${body}
<hr style="margin:24px 0;border:none;border-top:1px solid #e2e8f0"/>
<p style="font-size:12px;color:#94a3b8">NeuroEvolui — Plataforma de Evolução Clínica</p>
</body></html>`;
}

export async function sendMail({ to, subject, html }) {
  const transport = createTransport();
  if (!transport) return;
  await transport.sendMail({ from: FROM, to, subject, html });
}

export async function sendConsultationScheduled({ to, patientName, scheduledAt, professionalId }) {
  const transport = createTransport();
  if (!transport) return;
  const dateStr = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'full', timeStyle: 'short' }).format(new Date(scheduledAt));
  await transport.sendMail({
    from: FROM,
    to,
    subject: '[NeuroEvolui] Consulta agendada',
    html: baseLayout(
      'Consulta agendada',
      `<p>Olá, <strong>${patientName || 'paciente'}</strong>!</p>
       <p>Sua consulta foi agendada para <strong>${dateStr}</strong>.</p>
       <p>Em caso de dúvidas, entre em contato com a clínica.</p>`,
    ),
  });
}

export async function sendNoteAdded({ to, patientName, professionalId }) {
  const transport = createTransport();
  if (!transport) return;
  await transport.sendMail({
    from: FROM,
    to,
    subject: '[NeuroEvolui] Nova nota clínica registrada',
    html: baseLayout(
      'Nova evolução clínica',
      `<p>Olá, <strong>${patientName || 'paciente'}</strong>!</p>
       <p>Uma nova nota clínica foi registrada no seu prontuário.</p>`,
    ),
  });
}

export async function sendPaymentFailed({ to, patientName, amountCents }) {
  const transport = createTransport();
  if (!transport) return;
  const valor = ((amountCents || 0) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  await transport.sendMail({
    from: FROM,
    to,
    subject: '[NeuroEvolui] Falha no pagamento',
    html: baseLayout(
      'Falha no pagamento',
      `<p>Olá, <strong>${patientName || 'paciente'}</strong>!</p>
       <p>Houve uma falha ao processar seu pagamento de <strong>${valor}</strong>.</p>
       <p>Por favor, entre em contato com a clínica para regularização.</p>`,
    ),
  });
}
