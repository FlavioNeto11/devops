// EXEMPLAR do fiscal-kit — referenciado por um bloco de capacidade da Forge.
// Mostra a emissao de nota fiscal como um PASSO DE JOB DO WORKER:
//   build -> sign -> submit -> (poll) queryStatus.
//
// IMPORTANTE: na app real, `emitirNotaFiscal` roda DENTRO do worker
// transacional da aplicacao (requer o bloco worker-queue). O kit fornece os
// passos puros; quem agenda/retenta/persiste o estado do job e a app.
//
// Sem efeitos colaterais ao importar — apenas define e exporta a funcao.

import { createFiscalGateway } from '../src/index.js';

/**
 * Emite uma nota fiscal (NF-e) executando os passos do kit em sequencia.
 * Pensado para rodar como um job no worker da app (transacional + retentavel).
 * @param {{ number, series, cnpj, items:Array<{desc,qty,price}>, total }} invoice
 * @returns {{ status: string, protocol: string, receipt: string }}
 */
export function emitirNotaFiscal(invoice) {
  const gateway = createFiscalGateway({
    mode: process.env.FISCAL_MODE || 'sandbox',
  });

  // 1) Construir o XML determinista da NF-e.
  const xml = gateway.buildNfeXml(invoice);

  // 2) Assinar (sandbox = marcador determinista; real = certificado).
  const signed = gateway.signXml(xml);

  // 3) Submeter a SEFAZ — retorna um recibo (fluxo assincrono).
  const { receipt } = gateway.submit(signed);

  // 4) Consultar o status pelo recibo (poll). Na app, isto seria reagendado
  //    pelo worker ate sair de "received"; no sandbox ja vem "authorized".
  const result = gateway.queryStatus(receipt);

  return { status: result.status, protocol: result.protocol, receipt };
}

// Execucao direta (node example/usage.js) para inspecao manual.
if (import.meta.url === `file://${process.argv[1]}`) {
  const demo = emitirNotaFiscal({
    number: '1001',
    series: '1',
    cnpj: '12345678000199',
    items: [{ desc: 'Servico de consultoria', qty: 2, price: 150.5 }],
    total: 301.0,
  });
  console.log(JSON.stringify(demo, null, 2));
}
