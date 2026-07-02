import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mockValue, mockRows, hashString } from '../index.mjs';

// ---------------------------------------------------------------------------
// Determinismo (a regra de ouro)
// ---------------------------------------------------------------------------
test('mockValue é determinístico para o mesmo campo + índice', () => {
  const field = { name: 'nome', type: 'text' };
  const a = mockValue(field, 0);
  const b = mockValue(field, 0);
  assert.equal(a, b);
});

test('mockValue varia por índice de linha mas continua estável', () => {
  const field = { name: 'preco', type: 'currency' };
  const r0a = mockValue(field, 0);
  const r0b = mockValue(field, 0);
  const r1a = mockValue(field, 1);
  const r1b = mockValue(field, 1);
  assert.equal(r0a, r0b);
  assert.equal(r1a, r1b);
});

test('campos com nomes diferentes tendem a divergir', () => {
  const a = mockValue({ name: 'titulo', type: 'text' }, 0);
  const b = mockValue({ name: 'assunto_secundario', type: 'text' }, 0);
  // não é garantido em 100% dos casos, mas estes nomes diferem
  assert.notEqual(a, b);
});

test('mockRows é determinístico (duas chamadas iguais)', () => {
  const fields = [
    { name: 'id', type: 'id' },
    { name: 'cliente', type: 'text' },
    { name: 'valor', type: 'currency' },
    { name: 'status', type: 'status' },
  ];
  const a = mockRows(fields, 5);
  const b = mockRows(fields, 5);
  assert.deepEqual(a, b);
});

test('não usa Math.random nem Date.now (sem entropia no source)', async () => {
  const fs = await import('node:fs');
  const url = new URL('../index.mjs', import.meta.url);
  const src = fs.readFileSync(url, 'utf8');
  assert.ok(!/Math\.random/.test(src), 'index.mjs não pode usar Math.random');
  assert.ok(!/Date\.now/.test(src), 'index.mjs não pode usar Date.now');
  assert.ok(!/new Date\(\s*\)/.test(src), 'index.mjs não pode usar new Date()');
});

// ---------------------------------------------------------------------------
// Hash
// ---------------------------------------------------------------------------
test('hashString é estável e retorna uint32', () => {
  const h1 = hashString('campo');
  const h2 = hashString('campo');
  assert.equal(h1, h2);
  assert.ok(Number.isInteger(h1));
  assert.ok(h1 >= 0 && h1 <= 0xffffffff);
  assert.notEqual(hashString('a'), hashString('b'));
});

// ---------------------------------------------------------------------------
// Cobertura por tipo
// ---------------------------------------------------------------------------
test('type=text retorna string não-vazia', () => {
  const v = mockValue({ name: 'nome', type: 'text' });
  assert.equal(typeof v, 'string');
  assert.ok(v.length > 0);
});

test('type=textarea (e alias longtext) retorna string longa', () => {
  const v = mockValue({ name: 'observacao', type: 'textarea' });
  assert.equal(typeof v, 'string');
  assert.ok(v.length > 10);
  const v2 = mockValue({ name: 'observacao', type: 'longtext' });
  assert.equal(typeof v2, 'string');
  assert.ok(v2.length > 10);
});

test('type=number retorna inteiro em faixa plausível', () => {
  const v = mockValue({ name: 'quantidade', type: 'number' });
  assert.equal(typeof v, 'number');
  assert.ok(Number.isInteger(v));
  assert.ok(v >= 1 && v <= 999);
});

test('type=currency retorna BRL formatado pt-BR', () => {
  const v = mockValue({ name: 'preco', type: 'currency' });
  assert.match(v, /^R\$ \d{1,3}(\.\d{3})*,\d{2}$/);
});

test('type=date retorna ISO YYYY-MM-DD válido', () => {
  const v = mockValue({ name: 'data', type: 'date' });
  assert.match(v, /^\d{4}-\d{2}-\d{2}$/);
  const [y, m, d] = v.split('-').map(Number);
  assert.ok(y >= 2024 && y <= 2025);
  assert.ok(m >= 1 && m <= 12);
  assert.ok(d >= 1 && d <= 28);
});

test('type=datetime retorna ISO com hora', () => {
  const v = mockValue({ name: 'criado_em', type: 'datetime' });
  assert.match(v, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/);
});

test('type=boolean (e alias bool) retorna boolean', () => {
  assert.equal(typeof mockValue({ name: 'ativo', type: 'boolean' }), 'boolean');
  assert.equal(typeof mockValue({ name: 'ativo', type: 'bool' }), 'boolean');
});

test('type=enum respeita enumValues fornecidos', () => {
  const opts = ['Pequeno', 'Médio', 'Grande'];
  const v = mockValue({ name: 'tamanho', type: 'enum', enumValues: opts });
  assert.ok(opts.includes(v));
});

test('type=enum sem enumValues usa fallback de status', () => {
  const v = mockValue({ name: 'categoria', type: 'enum' });
  assert.equal(typeof v, 'string');
  assert.ok(v.length > 0);
});

test('type=status retorna um rótulo de status', () => {
  const v = mockValue({ name: 'situacao', type: 'status' });
  assert.equal(typeof v, 'string');
  assert.ok(v.length > 0);
});

test('type=email retorna email plausível e bem formado', () => {
  const v = mockValue({ name: 'email', type: 'email' });
  assert.match(v, /^[a-z.]+@[a-z.]+\.[a-z]{2,}$/);
});

test('type=phone retorna telefone BR formatado', () => {
  const v = mockValue({ name: 'telefone', type: 'phone' });
  assert.match(v, /^\(\d{2}\) 9\d{4}-\d{4}$/);
});

test('type=cpf-cnpj (e aliases cpf/cnpj) retorna documento formatado', () => {
  const v = mockValue({ name: 'documento', type: 'cpf-cnpj' });
  const isCpf = /^\d{3}\.\d{3}\.\d{3}-\d{2}$/.test(v);
  const isCnpj = /^\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}$/.test(v);
  assert.ok(isCpf || isCnpj, `formato inesperado: ${v}`);
  assert.match(mockValue({ name: 'cpf', type: 'cpf' }), /^\d{3}\.\d{3}\.\d{3}-\d{2}$/);
  assert.match(mockValue({ name: 'cnpj', type: 'cnpj' }), /^\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}$/);
});

test('type=id retorna identificador estável', () => {
  const v = mockValue({ name: 'id', type: 'id' });
  assert.equal(typeof v, 'string');
  assert.ok(v.length > 0);
});

// ---------------------------------------------------------------------------
// Inferência de tipo a partir do nome (sem type)
// ---------------------------------------------------------------------------
test('infere currency de "valor_total"', () => {
  assert.match(mockValue({ name: 'valor_total' }), /^R\$/);
});

test('infere email de "e_mail"', () => {
  assert.match(mockValue({ name: 'e_mail' }), /@/);
});

test('infere id de "pedido_id"', () => {
  const v = mockValue({ name: 'pedido_id' });
  assert.equal(typeof v, 'string');
});

test('infere date de "data_nascimento"', () => {
  assert.match(mockValue({ name: 'data_nascimento' }), /^\d{4}-\d{2}-\d{2}$/);
});

test('tipo desconhecido cai em text (string)', () => {
  const v = mockValue({ name: 'campo_qualquer', type: 'whatever' });
  assert.equal(typeof v, 'string');
});

// ---------------------------------------------------------------------------
// mockRows — forma e robustez
// ---------------------------------------------------------------------------
test('mockRows(fields, n) retorna n linhas com as chaves dos campos', () => {
  const fields = [
    { name: 'id', type: 'id' },
    { name: 'cliente', type: 'text' },
    { name: 'valor', type: 'currency' },
  ];
  const rows = mockRows(fields, 3);
  assert.equal(rows.length, 3);
  for (const row of rows) {
    assert.deepEqual(Object.keys(row).sort(), ['cliente', 'id', 'valor']);
  }
});

test('mockRows com n=0 retorna lista vazia', () => {
  assert.deepEqual(mockRows([{ name: 'x', type: 'text' }], 0), []);
});

test('mockRows default n=5', () => {
  assert.equal(mockRows([{ name: 'x', type: 'text' }]).length, 5);
});

test('mockRows ignora campos inválidos (sem name)', () => {
  const rows = mockRows([{ type: 'text' }, null, { name: 'ok', type: 'text' }], 1);
  assert.deepEqual(Object.keys(rows[0]), ['ok']);
});

test('mockRows entradas inválidas degradam para []', () => {
  assert.deepEqual(mockRows(null, 3), []);
  assert.deepEqual(mockRows(undefined, 3), []);
});

test('linhas distintas de um mesmo campo costumam variar', () => {
  const rows = mockRows([{ name: 'cliente', type: 'text' }], 8);
  const distinct = new Set(rows.map((r) => r.cliente));
  assert.ok(distinct.size >= 2, 'esperava variação entre linhas');
});

// ---------------------------------------------------------------------------
// Tolerância de entrada
// ---------------------------------------------------------------------------
test('mockValue aceita string como atalho de campo', () => {
  const v = mockValue('nome');
  assert.equal(typeof v, 'string');
});
