// node --test — file-ingest-kit. Roda SEM as deps opcionais instaladas: testa o caminho direto
// (text/csv/image) + a degradação fail-soft (pdf/docx/xls/pptx/zip sem lib -> name-only/nota) +
// os helpers puros (toMessageContent/estimateTokens/supportsVision). A extração real de pdf/docx/etc.
// é validada na integração (apps que instalam as libs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ingest, toMessageContent, estimateTokens, supportsVision } from './src/index.js';

const f = (filename, text, mime) => ({ filename, mime, bytes: Buffer.from(text || '', 'utf8') });

test('text/markdown -> texto extraído', async () => {
  const r = await ingest([f('notas.md', '# Olá\nconteúdo')]);
  assert.equal(r.textParts.length, 1);
  assert.match(r.textParts[0].text, /Olá/);
  assert.equal(r.manifest[0].status, 'ok');
});

test('csv -> tabela markdown', async () => {
  const r = await ingest([f('dados.csv', 'a,b\n1,2\n3,4')]);
  assert.match(r.textParts[0].text, /\| a \| b \|/);
  assert.match(r.textParts[0].text, /---/);
});

test('imagem -> bloco image (base64), sem texto', async () => {
  const r = await ingest([{ filename: 'foto.png', mime: 'image/png', bytes: Buffer.from([1, 2, 3, 4]) }]);
  assert.equal(r.blocks.length, 1);
  assert.equal(r.blocks[0].type, 'image');
  assert.equal(r.blocks[0].mediaType, 'image/png');
  assert.ok(r.blocks[0].dataBase64.length > 0);
});

test('pdf -> bloco document nativo + nota (pdf-parse ausente no kit)', async () => {
  const r = await ingest([{ filename: 'spec.pdf', mime: 'application/pdf', bytes: Buffer.from('%PDF-1.4 fake') }]);
  assert.equal(r.blocks[0].type, 'document');
  assert.equal(r.blocks[0].mediaType, 'application/pdf');
  assert.ok(r.notes.some((n) => /pdf-parse|texto/i.test(n)));
});

test('docx/xlsx/pptx sem lib -> name-only + nota (fail-soft)', async () => {
  const r = await ingest([f('doc.docx', 'x'), f('plan.xlsx', 'x'), f('slides.pptx', 'x')]);
  const st = r.manifest.map((m) => m.status);
  assert.ok(st.every((s) => s === 'name-only' || s === 'ok' || s === 'truncated')); // name-only sem libs
  assert.ok(r.notes.length >= 1);
});

test('legado .doc/.ppt -> unsupported + nota', async () => {
  const r = await ingest([f('antigo.doc', 'x'), f('antigo.ppt', 'x')]);
  assert.ok(r.manifest.every((m) => m.status === 'unsupported'));
  assert.ok(r.notes.some((n) => /legado/i.test(n)));
});

test('limite maxTotalChars trunca', async () => {
  const big = 'a'.repeat(5000);
  const r = await ingest([f('a.txt', big), f('b.txt', big)], { maxTotalChars: 6000, perFileChars: 5000 });
  assert.ok(r.truncated);
  assert.ok(r.totalChars <= 6000);
});

test('maxFiles limita', async () => {
  const many = Array.from({ length: 30 }, (_, i) => f('f' + i + '.txt', 'x'));
  const r = await ingest(many, { maxFiles: 5 });
  assert.equal(r.manifest.length, 5);
  assert.ok(r.truncated);
});

test('toMessageContent: sem visão -> string; com visão -> blocos por provedor', async () => {
  const r = await ingest([{ filename: 'foto.png', mime: 'image/png', bytes: Buffer.from([1, 2]) }]);
  const asText = toMessageContent(r, { provider: 'anthropic', supportsVision: false, userText: 'oi' });
  assert.equal(typeof asText, 'string');
  const anth = toMessageContent(r, { provider: 'anthropic', supportsVision: true, userText: 'oi' });
  assert.ok(Array.isArray(anth));
  assert.ok(anth.some((b) => b.type === 'image' && b.source && b.source.type === 'base64'));
  const oai = toMessageContent(r, { provider: 'openai', supportsVision: true });
  assert.ok(oai.some((b) => b.type === 'image_url'));
});

test('toMessageContent: PDF document só vai nativo na Anthropic', async () => {
  const r = await ingest([{ filename: 's.pdf', mime: 'application/pdf', bytes: Buffer.from('%PDF') }]);
  const anth = toMessageContent(r, { provider: 'anthropic', supportsVision: true, userText: 'q' });
  assert.ok(anth.some((b) => b.type === 'document'));
  const oai = toMessageContent(r, { provider: 'openai', supportsVision: true, userText: 'q' });
  // OpenAI não recebe bloco document: sem blocos utilizáveis -> volta STRING (PDF vira texto no bundle).
  assert.ok(typeof oai === 'string' || !oai.some((b) => b.type === 'document'));
});

test('supportsVision (Claude 4.x incl. haiku-4 + GPT-4o/5; nano não)', () => {
  assert.equal(supportsVision('claude-sonnet-4-6'), true);
  assert.equal(supportsVision('claude-haiku-4-5'), true); // Haiku 4.5 tem visão
  assert.equal(supportsVision('gpt-4o'), true);
  assert.equal(supportsVision('gpt-5-nano'), false);
});

test('ingest rejeita não-array', async () => {
  await assert.rejects(() => ingest('nope'));
});
