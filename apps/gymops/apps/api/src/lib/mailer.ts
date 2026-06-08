import nodemailer from 'nodemailer';
import { env } from '../env.js';

function createTransport() {
  if (!env.SMTP_HOST || !env.SMTP_USER || !env.SMTP_PASS) return null;
  return nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_PORT === 465,
    auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
  });
}

const FROM = env.SMTP_FROM ?? `GymOps <noreply@gymops.com>`;

function activityLink(activityId: string): string {
  return `${env.FRONTEND_URL}/activities/${activityId}`;
}

function baseLayout(title: string, body: string): string {
  return `<!DOCTYPE html><html><body style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px">
<h2 style="color:#1e293b">${title}</h2>
${body}
<hr style="margin:24px 0;border:none;border-top:1px solid #e2e8f0"/>
<p style="font-size:12px;color:#94a3b8">GymOps — Gestão Operacional Multiunidade</p>
</body></html>`;
}

export async function sendMail(opts: { to: string; subject: string; html: string }): Promise<void> {
  const transport = createTransport();
  if (!transport) return;
  await transport.sendMail({ from: FROM, ...opts });
}

export async function sendActivityAssigned(opts: {
  to: string; name: string; activityTitle: string; assignerName: string; activityId: string;
}): Promise<void> {
  const transport = createTransport();
  if (!transport) return;
  await transport.sendMail({
    from: FROM,
    to: opts.to,
    subject: `[GymOps] Você foi atribuído: ${opts.activityTitle}`,
    html: baseLayout(
      'Nova atividade atribuída a você',
      `<p>Olá, <strong>${opts.name}</strong>!</p>
       <p><strong>${opts.assignerName}</strong> atribuiu a seguinte atividade para você:</p>
       <p style="background:#f1f5f9;padding:12px;border-radius:6px;font-weight:600">${opts.activityTitle}</p>
       <a href="${activityLink(opts.activityId)}" style="display:inline-block;margin-top:16px;padding:10px 20px;background:#6366f1;color:#fff;border-radius:6px;text-decoration:none">Ver atividade</a>`,
    ),
  });
}

export async function sendDueReminder(opts: {
  to: string; name: string; activityTitle: string; dueAt: string; activityId: string;
}): Promise<void> {
  const transport = createTransport();
  if (!transport) return;
  const due = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' }).format(new Date(opts.dueAt));
  await transport.sendMail({
    from: FROM,
    to: opts.to,
    subject: `[GymOps] Atividade vence amanhã: ${opts.activityTitle}`,
    html: baseLayout(
      'Lembrete: atividade vence amanhã',
      `<p>Olá, <strong>${opts.name}</strong>!</p>
       <p>A atividade abaixo vence em <strong>${due}</strong>:</p>
       <p style="background:#fef9c3;padding:12px;border-radius:6px;font-weight:600">${opts.activityTitle}</p>
       <a href="${activityLink(opts.activityId)}" style="display:inline-block;margin-top:16px;padding:10px 20px;background:#f59e0b;color:#fff;border-radius:6px;text-decoration:none">Atualizar atividade</a>`,
    ),
  });
}

export async function sendInvitation(opts: {
  to: string; inviterName: string; orgName: string; token: string;
}): Promise<void> {
  const transport = createTransport();
  if (!transport) return;
  const acceptUrl = `${env.FRONTEND_URL}/invite/${opts.token}`;
  await transport.sendMail({
    from: FROM,
    to: opts.to,
    subject: `[GymOps] ${opts.inviterName} convidou você para ${opts.orgName}`,
    html: baseLayout(
      `Convite para ${opts.orgName}`,
      `<p><strong>${opts.inviterName}</strong> convidou você para acessar a plataforma GymOps da organização <strong>${opts.orgName}</strong>.</p>
       <p>Clique no botão abaixo para aceitar o convite (válido por 7 dias):</p>
       <a href="${acceptUrl}" style="display:inline-block;margin-top:16px;padding:10px 20px;background:#6366f1;color:#fff;border-radius:6px;text-decoration:none">Aceitar convite</a>
       <p style="font-size:12px;color:#94a3b8;margin-top:16px">Ou copie este link: ${acceptUrl}</p>`,
    ),
  });
}

export async function sendOverdueAlert(opts: {
  to: string; name: string; activityTitle: string; dueAt: string; activityId: string;
}): Promise<void> {
  const transport = createTransport();
  if (!transport) return;
  const due = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' }).format(new Date(opts.dueAt));
  await transport.sendMail({
    from: FROM,
    to: opts.to,
    subject: `[GymOps] ⚠️ Atividade atrasada: ${opts.activityTitle}`,
    html: baseLayout(
      '⚠️ Atividade atrasada',
      `<p>Olá, <strong>${opts.name}</strong>!</p>
       <p>A atividade abaixo estava prevista para <strong>${due}</strong> e ainda está em aberto:</p>
       <p style="background:#fee2e2;padding:12px;border-radius:6px;font-weight:600">${opts.activityTitle}</p>
       <a href="${activityLink(opts.activityId)}" style="display:inline-block;margin-top:16px;padding:10px 20px;background:#dc2626;color:#fff;border-radius:6px;text-decoration:none">Ver atividade</a>`,
    ),
  });
}
