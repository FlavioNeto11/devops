const API = (process.env.BASE_URL || 'http://nvit.localhost/stockpilot/api').replace(/\/$/, '');
const post = (p, b) => fetch(API + p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b || {}) }).then(async (r) => ({ s: r.status, j: await r.json().catch(() => ({})) }));
const get = (p) => fetch(API + p).then(async (r) => ({ s: r.status, j: await r.json().catch(() => ({})) }));
const ok = (c, m) => { if (!c) { console.error('FAIL:', m); process.exitCode = 1; } else console.log('ok -', m); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// --- health ---
ok((await get('/health')).j.status === 'ok', 'health + db');

// --- records (baseline) ---
const r1 = (await post('/v1/records', { title: 'Teste' })).j; ok(r1.id, 'CRUD cria record');
await post('/v1/records/' + r1.id + '/submit', {});
let a = {}; for (let i = 0; i < 12; i++) { await sleep(3000); a = (await get('/v1/records/' + r1.id)).j; if (a.status === 'submitted' || a.status === 'failed') break; }
ok(a.status === 'submitted', 'fila+gateway: record submetido (retry no transitório)');

// --- produtos ---
const prods = (await get('/v1/products')).j;
ok(Array.isArray(prods.data), 'GET /v1/products retorna array');
ok(prods.data.length > 0, 'produtos: seed populado');
const p = prods.data[0];
ok(typeof p.id === 'number', 'produto tem id');
ok(typeof p.name === 'string', 'produto tem name');
ok(typeof p.current_stock === 'number', 'produto tem current_stock');
ok(typeof p.min_stock === 'number', 'produto tem min_stock');
ok(['OK', 'ALERTA', 'RUPTURA'].includes(p.status), 'produto.status é OK|ALERTA|RUPTURA');
ok('last_order_date' in p, 'produto tem last_order_date');
ok('has_open_order' in p, 'produto tem has_open_order');

// verifica regras de status
const ruptura = prods.data.find((x) => x.status === 'RUPTURA');
ok(ruptura != null, 'existe produto RUPTURA no seed');
ok(ruptura.current_stock < ruptura.min_stock, 'RUPTURA: current_stock < min_stock');
ok(!ruptura.has_open_order, 'RUPTURA: sem pedido aberto');

const alerta = prods.data.find((x) => x.status === 'ALERTA');
ok(alerta != null, 'existe produto ALERTA no seed');
ok(alerta.current_stock < alerta.min_stock * 1.5, 'ALERTA: current_stock < 1.5*min_stock');
ok(alerta.has_open_order, 'ALERTA: tem pedido aberto');

// --- criar pedido manual ---
const prodOk = prods.data.find((x) => x.status === 'OK' && !x.has_open_order);
if (prodOk) {
  const ord = (await post('/v1/products/' + prodOk.id + '/order')).j;
  ok(ord.id && ord.product_id === prodOk.id, 'POST /v1/products/:id/order cria pedido');
  ok(ord.status === 'pending', 'pedido criado com status pending');

  const prodsAfter = (await get('/v1/products')).j;
  const prodAfter = prodsAfter.data.find((x) => x.id === prodOk.id);
  ok(prodAfter.has_open_order, 'produto passa a ter pedido aberto após POST');
}

// produto inexistente
const r404 = (await post('/v1/products/999999/order')).s;
ok(r404 === 404, 'POST /v1/products/999999/order → 404');

// --- reposição assíncrona (REQ-STOCKPILOT-0003) ---
// dispara reposição manual num produto em RUPTURA (estoque < mínimo, sem pedido aberto)
const semPedido = (await get('/v1/products')).j.data.find((x) => x.current_stock < x.min_stock && !x.has_open_order);
if (semPedido) {
  const re = await post('/v1/products/' + semPedido.id + '/reorder');
  ok(re.s === 201 && re.j.order && re.j.order.status === 'pending', 'POST /reorder cria pedido pending');
  ok(re.j.enqueued === true, 'reposição enfileira job idempotente');

  // idempotência: repetir com pedido aberto NÃO cria outro recurso (mesmo order id, deduped)
  const re2 = await post('/v1/products/' + semPedido.id + '/reorder');
  ok(re2.s === 200 && re2.j.deduped === true, 'POST /reorder repetido → deduped (200)');
  ok(re2.j.order.id === re.j.order.id, 'reposição idempotente devolve o MESMO pedido');

  // worker processa via gateway: pedido sai de pending → delivered (ou failed se DLQ)
  let fin = null;
  for (let i = 0; i < 12; i++) { await sleep(3000); const o = (await get('/v1/orders')).j.data.find((x) => x.id === re.j.order.id); if (!o) { fin = 'delivered'; break; } if (o.status === 'failed') { fin = 'failed'; break; } }
  ok(fin === 'delivered', 'worker processa reposição via gateway → delivered');
}
const re404 = (await post('/v1/products/999999/reorder')).s;
ok(re404 === 404, 'POST /v1/products/999999/reorder → 404');

// --- pedidos abertos ---
const ords = (await get('/v1/orders')).j;
ok(Array.isArray(ords.data), 'GET /v1/orders retorna array');
if (ords.data.length > 0) {
  const o = ords.data[0];
  ok(typeof o.id === 'number', 'pedido tem id');
  ok(typeof o.product_name === 'string', 'pedido tem product_name');
  ok(['pending', 'processing'].includes(o.status), 'pedido.status é pending|processing');
  ok('external_ref' in o, 'pedido tem external_ref');
  ok('created_at' in o, 'pedido tem created_at');
}

// --- alertas ---
const alts = (await get('/v1/alerts')).j;
ok(Array.isArray(alts.data), 'GET /v1/alerts retorna array');
ok(alts.data.length > 0, 'alertas: seed tem pelo menos 1 alerta');
const alt = alts.data[0];
ok(typeof alt.id === 'number', 'alerta tem id');
ok(typeof alt.name === 'string', 'alerta tem name');
ok(['RUPTURA', 'ERROR'].includes(alt.alert_type), 'alerta.alert_type é RUPTURA|ERROR');
ok('last_error' in alt, 'alerta tem last_error');
ok('last_attempt_at' in alt, 'alerta tem last_attempt_at');

console.log(process.exitCode ? 'FALHOU' : 'OK — painel de estoque validado');
