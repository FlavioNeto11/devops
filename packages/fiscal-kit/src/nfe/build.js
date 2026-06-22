// Builder de XML da NF-e. PURO e DETERMINISTICO: a mesma `invoice` produz
// sempre a mesma string (sem timestamps, sem ordem variavel, sem aleatoriedade).
// Builder interno minimo de string — sem dependencias.

const XML_ESCAPES = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
};

/** Escapa & < > " para uso seguro em texto/atributo XML. */
function esc(value) {
  return String(value ?? '').replace(/[&<>"]/g, (ch) => XML_ESCAPES[ch]);
}

/** Normaliza um numero para string determinista (2 casas). */
function money(value) {
  return Number(value ?? 0).toFixed(2);
}

/**
 * Constroi o XML da NF-e a partir de um objeto plano.
 * @param {{ number, series, cnpj, items:Array<{desc,qty,price}>, total }} invoice
 * @returns {string} XML determinista
 */
export function buildNfeXml(invoice) {
  const inv = invoice || {};
  const items = Array.isArray(inv.items) ? inv.items : [];

  const itemsXml = items
    .map((item, idx) => {
      const it = item || {};
      const qty = Number(it.qty ?? 0);
      const price = Number(it.price ?? 0);
      return (
        `<det n="${idx + 1}">` +
        `<desc>${esc(it.desc)}</desc>` +
        `<qty>${esc(money(qty))}</qty>` +
        `<price>${esc(money(price))}</price>` +
        `<lineTotal>${esc(money(qty * price))}</lineTotal>` +
        `</det>`
      );
    })
    .join('');

  return (
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<NFe>` +
    `<ide>` +
    `<number>${esc(inv.number)}</number>` +
    `<series>${esc(inv.series)}</series>` +
    `</ide>` +
    `<emit><cnpj>${esc(inv.cnpj)}</cnpj></emit>` +
    `<det-list>${itemsXml}</det-list>` +
    `<total>${esc(money(inv.total))}</total>` +
    `</NFe>`
  );
}
