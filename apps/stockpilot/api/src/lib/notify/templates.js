// lib/notify/templates.js — REQ-STOCKPILOT-0007: conteúdo das notificações por tipo de evento.
// Puro (sem infra): recebe a "spec" do evento e devolve o conteúdo já pronto para cada canal
// (título p/ push, assunto+HTML p/ e-mail, resumo curto p/ whatsapp/push body, ação recomendada,
// link "Ver painel"). Cada adapter pega só os campos de que precisa.

const PANEL_URL = () => process.env.NOTIFY_PANEL_URL || 'http://nvit.localhost/stockpilot';

// Ação recomendada exibida ao operador (o "o que fazer agora").
export function recommendedAction(spec) {
  if (spec.tipo === 'ruptura') return 'Repor o estoque com urgência — gere/abra um pedido ao fornecedor.';
  return 'Verifique o pedido ao fornecedor e reenvie manualmente — a submissão automática esgotou as tentativas.';
}

function htmlLayout(title, bodyHtml, action, url) {
  return `<!DOCTYPE html><html><body style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;color:#1e293b">
<h2 style="color:#b91c1c">${title}</h2>
${bodyHtml}
<p style="background:#fef9c3;padding:12px;border-radius:6px"><strong>Ação recomendada:</strong> ${action}</p>
<a href="${url}" style="display:inline-block;margin-top:16px;padding:10px 20px;background:#0f766e;color:#fff;border-radius:6px;text-decoration:none">Ver painel</a>
<hr style="margin:24px 0;border:none;border-top:1px solid #e2e8f0"/>
<p style="font-size:12px;color:#94a3b8">StockPilot — Reposição de Estoque</p>
</body></html>`;
}

// Constrói o conteúdo multicanal a partir da spec do evento. Determinístico (sem relógio/aleatório).
export function buildMessage(spec) {
  const ctx = spec.context || {};
  const url = PANEL_URL();
  const action = recommendedAction(spec);

  if (spec.tipo === 'ruptura') {
    const product = ctx.productName ?? ('produto ' + spec.referenciaId);
    const title = `Ruptura de estoque: ${product}`;
    const summary = `${product} em RUPTURA — estoque atual ${ctx.currentStock} (mínimo ${ctx.minStock}). ${action}`;
    const html = htmlLayout(
      title,
      `<p>O produto <strong>${product}</strong> entrou em <strong>RUPTURA</strong>.</p>
       <p style="background:#fee2e2;padding:12px;border-radius:6px">Estoque atual: <strong>${ctx.currentStock}</strong> · Mínimo: <strong>${ctx.minStock}</strong></p>`,
      action, url
    );
    return { title, subject: `[StockPilot] ${title}`, summary, action, url, html };
  }

  // falha_pedido
  const product = ctx.productName ? ` de ${ctx.productName}` : '';
  const orderRef = ctx.orderId ?? spec.referenciaId;
  const title = `Falha no pedido ao fornecedor${product ? ':' + product : ''}`.trim();
  const summary = `Falha ao submeter o pedido${product} (pedido ${orderRef}). ${action}`;
  const html = htmlLayout(
    title,
    `<p>A submissão do pedido <strong>#${orderRef}</strong>${product} ao fornecedor <strong>falhou</strong> após esgotar as tentativas.</p>
     ${ctx.error ? `<p style="background:#fee2e2;padding:12px;border-radius:6px;font-family:monospace;font-size:13px">${String(ctx.error)}</p>` : ''}`,
    action, url
  );
  return { title, subject: `[StockPilot] ${title}`, summary, action, url, html };
}
