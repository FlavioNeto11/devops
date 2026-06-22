// services/fiscal-service.js — emissão de NF-e via @flavioneto11/fiscal-kit (bloco nota-fiscal-emissao).
// Sandbox por default; SEFAZ real atrás de FISCAL_MODE=real + certificado (fail-closed). Na app real,
// roda como passo do worker transacional (build->sign->submit->poll); aqui exposto p/ a prova de composição.
import { createFiscalGateway } from '@flavioneto11/fiscal-kit';

const fiscal = createFiscalGateway({ mode: process.env.FISCAL_MODE || 'sandbox', uf: process.env.FISCAL_UF || 'SP', environment: process.env.FISCAL_ENVIRONMENT || 'homolog' });

export function emitInvoice({ orderId, cnpj, items, total }) {
  const invoice = {
    number: String(orderId), series: '1', cnpj: cnpj || '12345678000199',
    items: items && items.length ? items : [{ desc: 'Pedido ' + orderId, qty: 1, price: Number(total) || 0 }],
    total: Number(total) || 0,
  };
  const xml = fiscal.buildNfeXml(invoice);
  const signed = fiscal.signXml(xml);
  const { receipt } = fiscal.submit(signed);
  const result = fiscal.queryStatus(receipt);
  return { orderId: String(orderId), protocol: result.protocol, status: result.status, receipt, mode: process.env.FISCAL_MODE || 'sandbox' };
}
