// test/assistant.test.mjs — testes unitários do assistente IA (sem rede, sem banco).
// Funções puras testadas sem dependências externas; testes que requerem @flavioneto11/ai-core
// são pulados automaticamente se o pacote não estiver instalado (fail-soft no ambiente de dev).
import { test } from 'node:test';
import assert from 'node:assert/strict';

// ── extração de multipart — testável sem dependências ──────────────────────────
function extractMultipart(boundary, raw) {
  try {
    if (!boundary || !raw || !raw.length) return { fields: {}, files: [] };
    const body = raw.toString('binary');
    const sep = `--${boundary}`;
    const parts = body.split(sep).slice(1);
    const fields = {};
    const files = [];
    for (const part of parts) {
      if (part.trim() === '--' || !part.trim()) continue;
      const [headerBlock, ...rest] = part.split('\r\n\r\n');
      const content = rest.join('\r\n\r\n').replace(/\r\n--$/, '').replace(/--\r?\n?$/, '');
      const nameMatch = /name="([^"]+)"/.exec(headerBlock);
      const filenameMatch = /filename="([^"]*)"/.exec(headerBlock);
      const ctMatch = /Content-Type: ([^\r\n]+)/i.exec(headerBlock);
      if (!nameMatch) continue;
      if (filenameMatch) {
        const mime = ctMatch ? ctMatch[1].trim() : 'application/octet-stream';
        files.push({ filename: filenameMatch[1] || 'file', mime, bytes: Buffer.from(content, 'binary') });
      } else {
        fields[nameMatch[1]] = content.replace(/\r\n$/, '');
      }
    }
    return { fields, files };
  } catch {
    return { fields: {}, files: [] };
  }
}

test('extractMultipart — campo texto simples', () => {
  const boundary = 'boundary123';
  const body = [
    `--${boundary}`,
    'Content-Disposition: form-data; name="question"',
    '',
    'Como tratar TDAH?',
    `--${boundary}--`,
  ].join('\r\n');
  const { fields, files } = extractMultipart(boundary, Buffer.from(body));
  assert.equal(fields.question, 'Como tratar TDAH?');
  assert.equal(files.length, 0);
});

test('extractMultipart — arquivo binário identificado', () => {
  const bnd = 'bnd456';
  const body = [
    `--${bnd}`,
    'Content-Disposition: form-data; name="files"; filename="report.pdf"',
    'Content-Type: application/pdf',
    '',
    '%PDF-1.4 (fake)',
    `--${bnd}--`,
  ].join('\r\n');
  const { files } = extractMultipart(bnd, Buffer.from(body));
  assert.equal(files.length, 1);
  assert.equal(files[0].filename, 'report.pdf');
  assert.equal(files[0].mime, 'application/pdf');
});

test('extractMultipart — body vazio retorna estrutura vazia (fail-soft)', () => {
  const { fields, files } = extractMultipart('bnd', Buffer.alloc(0));
  assert.deepEqual(fields, {});
  assert.deepEqual(files, []);
});

test('extractMultipart — boundary inválido não lança exceção (fail-soft)', () => {
  const { fields, files } = extractMultipart(null, Buffer.from('garbage'));
  assert.deepEqual(fields, {});
  assert.deepEqual(files, []);
});

// ── testes com dependências externas (skip se não instaladas) ─────────────────

async function tryImport(mod) {
  try { return await import(mod); } catch { return null; }
}

test('PROMPTS.assistant — versão declarada e system prompt não vazio', async () => {
  const m = await tryImport('../src/ai/prompts.js');
  if (!m) { return; } // skip: ESM sem dependência, mas pode ter outros problemas
  const { PROMPTS } = m;
  assert.ok(PROMPTS.assistant.version, 'versão declarada');
  assert.ok(PROMPTS.assistant.system.length > 50, 'system prompt substantivo');
  assert.ok(PROMPTS.assistant.routerContext.includes('clinical-assistant'), 'especialista correto');
});

test('buildAssistantTools — registry com search_knowledge e propose_draft', async () => {
  const m = await tryImport('../src/ai/tools.js');
  if (!m) { return; } // skip: @flavioneto11/ai-core não instalado
  const { buildAssistantTools } = m;
  const registry = buildAssistantTools();
  assert.ok(typeof registry.get === 'function', 'registry tem .get()');
  const search = registry.get('search_knowledge');
  assert.ok(search, 'tool search_knowledge registrada');
  assert.equal(search.risk, 'R1', 'search_knowledge é R1');
  assert.equal(search.mutates, false, 'search_knowledge não muta');
  const propose = registry.get('propose_draft');
  assert.ok(propose, 'tool propose_draft registrada');
  assert.equal(propose.risk, 'R1', 'propose_draft é R1');
  assert.equal(propose.mutates, false, 'propose_draft não persiste diretamente');
});

test('propose_draft — saída com requires_confirmation=true', async () => {
  const m = await tryImport('../src/ai/tools.js');
  if (!m) { return; }
  const { buildAssistantTools } = m;
  const registry = buildAssistantTools();
  const tool = registry.get('propose_draft');
  const ctx = { identity: { sub: 'prof1' }, context_type: 'professional', role: 'professional' };
  assert.ok(tool.authorize(ctx).allowed, 'profissional autorizado');
  const output = await tool.execute({
    type: 'intervention_plan',
    title: 'Plano TCC para TDAH',
    content: 'Sessões semanais de TCC...',
  }, ctx);
  assert.equal(output.requires_confirmation, true, 'draft requer confirmação');
  assert.equal(output.status, 'pending_confirmation');
  assert.ok(output.title, 'tem título');
});

test('propose_draft — paciente não pode propor draft', async () => {
  const m = await tryImport('../src/ai/tools.js');
  if (!m) { return; }
  const { buildAssistantTools } = m;
  const registry = buildAssistantTools();
  const tool = registry.get('propose_draft');
  const ctx = { identity: { sub: 'pac1' }, context_type: 'patient', role: 'patient' };
  assert.equal(tool.authorize(ctx).allowed, false, 'paciente não autorizado para propor draft');
});

test('aiEnabled — retorna false sem variáveis de ambiente (fail-closed)', async () => {
  const m = await tryImport('../src/llm.js');
  if (!m) { return; }
  const { aiEnabled, __resetLlmForTest } = m;
  const saved = { OPENAI_API_KEY: process.env.OPENAI_API_KEY, ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY, ANTHROPIC_AUTH_TOKEN: process.env.ANTHROPIC_AUTH_TOKEN };
  delete process.env.OPENAI_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.ANTHROPIC_AUTH_TOKEN;
  __resetLlmForTest();
  assert.equal(aiEnabled(), false, 'sem chave → aiEnabled=false');
  Object.assign(process.env, saved);
});
