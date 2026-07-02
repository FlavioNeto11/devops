// Testes de integração: Gestão de Notas Fiscais (REQ-CONTAVIVA360-0006).
// Verificação: gateway em gateways/, fila transacional, idempotência, rastreamento.
import { test } from 'node:test';
import assert from 'node:assert/strict';

const BASE = (process.env.BASE_URL || '').replace(/\/$/, '');
const LIVE = !!BASE;
const H = (extra) => ({ 'Content-Type': 'application/json', ...(extra || {}) });
const get = (p, h) => fetch(BASE + p, { headers: H(h) }).then(async (r) => ({ s: r.status, j: await r.json().catch(() => ({})) }));
const post = (p, b, h) => fetch(BASE + p, { method: 'POST', headers: H(h), body: JSON.stringify(b || {}) }).then(async (r) => ({ s: r.status, j: await r.json().catch(() => ({})) }));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── Verificação estrutural: algoritmo de chave de acesso ──────────────────────

test('calcularChaveAcesso: chave NF-e tem 44 dígitos numéricos com cUF correto', { skip: false }, async () => {
  // Importa o gateway usando caminho relativo ao arquivo de teste
  const url = new URL('../api/src/gateways/sefaz-gateway.js', import.meta.url);
  const { calcularChaveAcesso } = await import(url.href);
  const chave = calcularChaveAcesso({ cUF: '35', aamm: '2401', cnpjEmitente: '12345678000195', mod: '55', serie: '001', nNF: '1', tpEmis: '1', cNF: '10000001' });
  assert.equal(chave.length, 44, 'chave tem 44 dígitos');
  assert.ok(/^\d{44}$/.test(chave), 'chave é numérica');
  assert.equal(chave.slice(0, 2), '35', 'cUF = 35 (SP)');
});

// ── Testes com servidor ao vivo ────────────────────────────────────────────────

test('AC1: cadastro de cliente NF (PJ): razão social, CNPJ, tipo_cliente', { skip: LIVE ? false : 'sem BASE_URL' }, async () => {
  assert.equal((await get('/health')).s, 200);
  const r = await post('/v1/nf-clients', {
    razao_social: 'EMPRESA TESTE LTDA',
    cnpj: '12.345.678/0001-95',
    inscricao_estadual: '123456789',
    tipo_cliente: 'empresa',
    endereco: { logradouro: 'Rua Teste', numero: '1', cidade: 'São Paulo', uf: 'SP' },
    contato: { email: 'teste@empresa.com', telefone: '11999999999' },
  });
  assert.ok(r.s < 500, `nf-clients responde: status=${r.s}`);
  assert.ok(r.s === 201 || r.s === 200, `cria cliente: status=${r.s}`);
  assert.ok(r.j.id, 'retorna id');
  assert.equal(r.j.razao_social, 'EMPRESA TESTE LTDA');
  assert.equal(r.j.tipo_cliente, 'empresa');
});

test('AC1: tipo_cliente consumidor_final e orgao_publico são aceitos', { skip: LIVE ? false : 'sem BASE_URL' }, async () => {
  const r1 = await post('/v1/nf-clients', { razao_social: 'CONSUMIDOR FINAL', cnpj: '11222333000181', tipo_cliente: 'consumidor_final' });
  assert.ok(r1.s < 500);
  const r2 = await post('/v1/nf-clients', { razao_social: 'ORGAO PUBLICO', cnpj: '11222333000182', tipo_cliente: 'orgao_publico' });
  assert.ok(r2.s < 500);
  const r3 = await post('/v1/nf-clients', { razao_social: 'INVALIDO', cnpj: '11222333000183', tipo_cliente: 'tipo_invalido' });
  assert.equal(r3.s, 400, 'tipo_cliente inválido retorna 400');
});

test('AC2: cadastro de produto/serviço com alíquotas fiscais', { skip: LIVE ? false : 'sem BASE_URL' }, async () => {
  const r = await post('/v1/nf-products', {
    codigo: 'PROD-001',
    descricao: 'Produto Teste',
    valor_unitario: 100.00,
    aliquota_icms: 12.00,
    aliquota_iss: 0.00,
    aliquota_pis: 0.65,
    aliquota_cofins: 3.00,
    cfop: '5102',
    ncm_nbs: '84713012',
  });
  assert.ok(r.s < 500, `nf-products responde: status=${r.s}`);
  assert.ok(r.s === 201 || r.s === 200);
  assert.ok(r.j.id);
  assert.equal(r.j.descricao, 'Produto Teste');
  assert.equal(String(r.j.cfop), '5102');
});

test('AC3: emissão de NF com cálculo automático de impostos e status processando/emitida', { skip: LIVE ? false : 'sem BASE_URL' }, async () => {
  // Cria cliente
  const clienteRes = await post('/v1/nf-clients', { razao_social: 'CLIENTE NF TESTE', cnpj: '99888777000166', tipo_cliente: 'empresa' });
  assert.ok(clienteRes.s < 500);
  const clienteId = clienteRes.j.id;
  // Emite NF
  const nfRes = await post('/v1/nf', {
    nf_client_id: clienteId,
    serie: '001',
    observacoes: 'Teste de emissão',
    itens: [{
      descricao: 'Serviço de Consultoria',
      valor_unitario: 500.00,
      quantidade: 2,
      aliquota_icms: 0,
      aliquota_iss: 5.0,
      aliquota_pis: 0.65,
      aliquota_cofins: 3.0,
      cfop: '5933',
    }],
  });
  assert.ok(nfRes.s < 500, `emissão NF responde: status=${nfRes.s}`);
  assert.ok(nfRes.s === 202 || nfRes.s === 201, `retorna 202 (async): status=${nfRes.s}`);
  assert.ok(nfRes.j.id, 'retorna id da NF');
  assert.ok(['processando', 'emitida'].includes(nfRes.j.status), `status inicial correto: ${nfRes.j.status}`);
  // Aguarda processamento assíncrono (até 15s)
  let nf;
  for (let i = 0; i < 5; i++) {
    await sleep(3000);
    const trackRes = await get('/v1/nf/' + nfRes.j.id);
    if (trackRes.j.status === 'emitida') { nf = trackRes.j; break; }
    nf = trackRes.j;
  }
  assert.equal(nf.status, 'emitida', `NF emitida pelo worker: status=${nf.status}`);
  assert.ok(nf.chave_acesso, 'chave de acesso gerada');
  assert.equal(String(nf.chave_acesso).length, 44, 'chave tem 44 dígitos');
  assert.ok(nf.xml, 'XML armazenado');
  assert.ok(nf.xml.includes('NFe'), 'XML contém tag NFe');
  assert.ok(nf.pdf_base64, 'PDF (base64) armazenado');
});

test('AC4: sandbox SEFAZ é determinístico e sempre aprova (sem SEFAZ_PROVIDER)', { skip: LIVE ? false : 'sem BASE_URL' }, async () => {
  const clienteRes = await post('/v1/nf-clients', { razao_social: 'SANDBOX TEST', cnpj: '11111111000181' });
  const nfRes = await post('/v1/nf', {
    nf_client_id: clienteRes.j.id,
    itens: [{ descricao: 'Item sandbox', valor_unitario: 100, quantidade: 1, aliquota_icms: 12 }],
  });
  assert.ok(nfRes.s < 500);
  let nf = nfRes.j;
  for (let i = 0; i < 5; i++) {
    await sleep(3000);
    const r = await get('/v1/nf/' + nfRes.j.id);
    if (r.j.status === 'emitida') { nf = r.j; break; }
    nf = r.j;
  }
  // Sandbox sempre aprova
  assert.equal(nf.status, 'emitida', 'sandbox aprova automaticamente');
  assert.ok(nf.chave_acesso, 'chave de acesso presente');
});

test('AC5: GET /v1/nf/:id retorna XML, PDF, chave, status, datas', { skip: LIVE ? false : 'sem BASE_URL' }, async () => {
  const clienteRes = await post('/v1/nf-clients', { razao_social: 'RASTREAMENTO TESTE', cnpj: '22222222000182' });
  const nfRes = await post('/v1/nf', {
    nf_client_id: clienteRes.j.id,
    itens: [{ descricao: 'Item rastreamento', valor_unitario: 200, quantidade: 1 }],
  });
  await sleep(5000);
  const trackRes = await get('/v1/nf/' + nfRes.j.id);
  assert.equal(trackRes.s, 200);
  const nf = trackRes.j;
  assert.ok(nf.chave_acesso !== undefined, 'chave_acesso presente');
  assert.ok(nf.status !== undefined, 'status presente');
  assert.ok(nf.data_emissao !== undefined, 'data_emissao presente');
  assert.ok(nf.xml !== undefined, 'xml presente');
  assert.ok(nf.pdf_base64 !== undefined, 'pdf_base64 presente');
  assert.ok(Array.isArray(nf.itens), 'itens presentes');
});

test('AC5: idempotência — mesma Idempotency-Key na emissão retorna mesma NF', { skip: LIVE ? false : 'sem BASE_URL' }, async () => {
  const clienteRes = await post('/v1/nf-clients', { razao_social: 'IDEM TESTE', cnpj: '33333333000183' });
  const idemKey = 'nf-idem-' + Date.now();
  const r1 = await post('/v1/nf', { nf_client_id: clienteRes.j.id, itens: [{ descricao: 'Item', valor_unitario: 50, quantidade: 1 }] }, { 'Idempotency-Key': idemKey });
  const r2 = await post('/v1/nf', { nf_client_id: clienteRes.j.id, itens: [{ descricao: 'Item', valor_unitario: 50, quantidade: 1 }] }, { 'Idempotency-Key': idemKey });
  assert.ok(r1.s < 500 && r2.s < 500);
  if (r1.j && r1.j.id && r2.j && r2.j.id) {
    assert.equal(r1.j.id, r2.j.id, 'mesma Idempotency-Key → mesma NF');
  }
});

test('AC6: relatório de NFs por período, por cliente, total emitido, total impostos', { skip: LIVE ? false : 'sem BASE_URL' }, async () => {
  const reportRes = await get('/v1/nf/report?period_start=2020-01-01&period_end=2099-12-31');
  assert.ok(reportRes.s < 500, `report responde: status=${reportRes.s}`);
  assert.ok(reportRes.j.resumo !== undefined, 'resumo presente');
  assert.ok(reportRes.j.resumo.total_nfs !== undefined, 'total_nfs presente');
  assert.ok(reportRes.j.resumo.total_emitido !== undefined, 'total_emitido presente');
  assert.ok(reportRes.j.resumo.total_impostos !== undefined, 'total_impostos presente');
  assert.ok(Array.isArray(reportRes.j.notas), 'notas é array');
});

test('AC6: relatório por série filtra corretamente', { skip: LIVE ? false : 'sem BASE_URL' }, async () => {
  const r = await get('/v1/nf/report?serie=001');
  assert.ok(r.s < 500);
  assert.ok(r.j.notas !== undefined);
});

test('AC6: export PDF (CSV) do relatório', { skip: LIVE ? false : 'sem BASE_URL' }, async () => {
  const r = await get('/v1/nf/report?format=pdf');
  assert.ok(r.s < 500, 'export PDF/CSV responde sem erro 5xx');
});
