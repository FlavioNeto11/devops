// lib/mailer.js — notificações por e-mail (bloco notificacoes-multicanal).
// Degradação graciosa: sem SMTP_HOST, canal é pulado sem erro fatal.
let _nodemailer = null;
let _transport = null;

async function loadNodemailer() {
  if (_nodemailer) return _nodemailer;
  try { const m = await import('nodemailer'); _nodemailer = m.default || m; return _nodemailer; } catch { return null; }
}

async function getTransport() {
  if (!process.env.SMTP_HOST) return null; // canal sem credencial: pulado
  if (_transport) return _transport;
  const nm = await loadNodemailer();
  if (!nm) return null;
  _transport = nm.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    ...(process.env.SMTP_USER ? { auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } } : {}),
  });
  return _transport;
}

function baseLayout(body) {
  return `<!DOCTYPE html><html><body style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px"><h2 style="color:#1a56db">ContaViva 360</h2>${body}<hr style="margin-top:32px"><p style="color:#6b7280;font-size:12px">ContaViva 360 — Sistema Contábil</p></body></html>`;
}

export async function sendMail({ to, subject, html }) {
  const transport = await getTransport();
  if (!transport) return null; // canal sem credencial: pulado
  try { return await transport.sendMail({ from: process.env.SMTP_FROM || 'noreply@contaviva360', to, subject, html }); } catch { return null; }
}

export async function sendObrigacaoAlerta({ to, tipo, dataVencimento, nivel, entidade }) {
  const cores = { amarelo: '#f59e0b', laranja: '#f97316', vermelho: '#ef4444', critico: '#7f1d1d' };
  const cor = cores[nivel] || '#6b7280';
  const data = new Date(dataVencimento).toLocaleDateString('pt-BR');
  return sendMail({
    to,
    subject: `[ContaViva 360] Alerta ${nivel.toUpperCase()}: ${tipo} vence em ${data}`,
    html: baseLayout(
      `<div style="border-left:4px solid ${cor};padding:12px 16px;background:#fafafa;margin-bottom:16px">` +
      `<h3 style="margin:0;color:${cor}">${nivel.toUpperCase()}: ${tipo}</h3>` +
      `<p>Vencimento: <strong>${data}</strong></p>` +
      (entidade ? `<p>Entidade: ${entidade}</p>` : '') +
      `</div><p>Acesse o ContaViva 360 para marcar esta obrigação como concluída.</p>`
    ),
  });
}
