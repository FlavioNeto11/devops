// test/assistant.test.mjs — Testes do assistente de IA (REQ-CONTAVIVA360-0007).
// Usa node:test. Testes de tools com mock pool (unit) + DB real (integration, skip sem DB).
import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';

// ─── Mock pool: simula pg.Pool sem DB real ───────────────────────────────────
function makeMockPool(rows = {}) {
  return {
    async query(sql) {
      // Detecta qual tabela está sendo consultada
      if (sql.includes('income_expenses')) {
        if (sql.includes('SUM') && sql.includes('GROUP BY tipo')) {
          return { rows: [{ tipo: 'receita', total: '5000.00' }, { tipo: 'despesa', total: '800.00' }] };
        }
        return { rows: [{ id: 1, tipo: 'receita', categoria: 'salario', descricao: 'Salário janeiro', valor: '5000.00', data: '2024-01-31', status: 'pago', contraparte: null }] };
      }
      if (sql.includes('fiscal_obligations')) {
        return { rows: [{ id: 1, tipo: 'IRPF', data_vencimento: '2024-04-30', status: 'pendente', descricao: null, valor_estimado: '2500.00' }] };
      }
      if (sql.includes('notas_fiscais')) {
        return { rows: [{ id: 1, numero_nf: '001-000001', status: 'emitida', data_emissao: '2024-01-15', total_nf: '5000.00', destinatario_razao_social: 'Cliente Ltda' }] };
      }
      if (sql.includes('tasks')) {
        return { rows: [{ id: 1, title: 'Enviar IRPF', assignee: 'operador', due_at: '2024-04-30', priority: 'alta', status: 'aberta' }] };
      }
      if (sql.includes('physical_persons')) {
        return { rows: [{ id: 1, nome: 'João Silva', cpf: '123.456.789-00', patrimonio_inicial: '0.00' }] };
      }
      if (sql.includes('pf_assets')) {
        return { rows: [{ tipo: 'imovel', descricao: 'Apartamento', valor: '300000.00' }] };
      }
      if (sql.includes('pf_liabilities')) {
        return { rows: [{ tipo: 'financiamento', descricao: 'Financiamento imóvel', valor: '150000.00' }] };
      }
      if (sql.includes('assistant_audit_log') && sql.includes('INSERT')) {
        return { rows: [{ id: 1 }] };
      }
      if (sql.includes('assistant_drafts') && sql.includes('SELECT')) {
        return { rows: [] };
      }
      if (sql.includes('assistant_drafts') && sql.includes('INSERT')) {
        return { rows: [{ id: 1, draft_id: 'test', draft_type: 'declaracao_irpf', draft_data: '{}', status: 'confirmado' }] };
      }
      // Default: array vazio
      return { rows: [] };
    },
  };
}

const mockPool = makeMockPool();
const ctx = { tenantId: 1, authenticated: true };

// ─── Testes de tools (unit, mock pool) ──────────────────────────────────────
describe('ai/tools.js — tools contábeis (mock pool)', async () => {
  let buildAccountingTools;
  let AiToolError;

  before(async () => {
    const toolsMod = await import('../src/ai/tools.js');
    buildAccountingTools = toolsMod.buildAccountingTools;
    const coreMod = await import('@flavioneto11/ai-core');
    AiToolError = coreMod.AiToolError;
  });

  it('createToolRegistry retorna 4 tools registradas', async () => {
    const registry = buildAccountingTools(mockPool);
    const tools = registry.list();
    const names = tools.map((t) => t.name);
    assert.ok(names.includes('consulta_dados'), 'tool consulta_dados registrada');
    assert.ok(names.includes('calcula_impostos'), 'tool calcula_impostos registrada');
    assert.ok(names.includes('gera_rascunho'), 'tool gera_rascunho registrada');
    assert.ok(names.includes('cita_fonte'), 'tool cita_fonte registrada');
  });

  it('todas as tools são R1 (read-only, não mutam)', async () => {
    const registry = buildAccountingTools(mockPool);
    for (const tool of registry.list()) {
      assert.equal(tool.risk, 'R1', `${tool.name} deve ser R1`);
      assert.equal(tool.mutates, false, `${tool.name}.mutates deve ser false`);
    }
  });

  it('authorize bloqueia sem tenantId', async () => {
    const registry = buildAccountingTools(mockPool);
    const tool = registry.get('consulta_dados');
    const res = tool.authorize({});
    assert.equal(res.allowed, false, 'nega sem tenantId');
  });

  it('authorize permite com tenantId', async () => {
    const registry = buildAccountingTools(mockPool);
    const tool = registry.get('consulta_dados');
    const res = tool.authorize({ tenantId: 1 });
    assert.equal(res.allowed, true, 'permite com tenantId');
  });

  it('consulta_dados saldo_caixa retorna receitas, despesas e saldo calculado', async () => {
    const registry = buildAccountingTools(mockPool);
    const tool = registry.get('consulta_dados');
    const result = await tool.execute({ data_type: 'saldo_caixa', period_start: '2024-01-01', period_end: '2024-01-31' }, ctx);
    assert.equal(result.data_type, 'saldo_caixa');
    assert.equal(result.receitas_pagas, '5000.00');
    assert.equal(result.despesas_pagas, '800.00');
    assert.equal(result.saldo, '4200.00');
  });

  it('consulta_dados receitas_despesas retorna array de registros', async () => {
    const registry = buildAccountingTools(mockPool);
    const tool = registry.get('consulta_dados');
    const result = await tool.execute({ data_type: 'receitas_despesas' }, ctx);
    assert.equal(result.data_type, 'receitas_despesas');
    assert.ok(Array.isArray(result.records));
    assert.ok(result.records.length > 0, 'retorna registros');
    assert.ok('id' in result.records[0], 'registro tem id');
    assert.ok('valor' in result.records[0], 'registro tem valor');
  });

  it('consulta_dados obrigacoes_fiscais retorna obrigações pendentes', async () => {
    const registry = buildAccountingTools(mockPool);
    const tool = registry.get('consulta_dados');
    const result = await tool.execute({ data_type: 'obrigacoes_fiscais' }, ctx);
    assert.equal(result.data_type, 'obrigacoes_fiscais');
    assert.ok(Array.isArray(result.obrigacoes));
    assert.ok(result.obrigacoes.length > 0);
    assert.ok(result.obrigacoes[0].tipo === 'IRPF');
  });

  it('consulta_dados patrimonio_pf retorna patrimônio líquido', async () => {
    const registry = buildAccountingTools(mockPool);
    const tool = registry.get('consulta_dados');
    const result = await tool.execute({ data_type: 'patrimonio_pf', entity_id: 1 }, ctx);
    assert.equal(result.data_type, 'patrimonio_pf');
    assert.ok('patrimonio_liquido' in result);
    assert.ok('total_ativos' in result);
    assert.equal(result.total_ativos, '300000.00');
    assert.equal(result.total_passivos, '150000.00');
    assert.equal(result.patrimonio_liquido, '150000.00');
  });

  it('consulta_dados notas_fiscais retorna notas emitidas', async () => {
    const registry = buildAccountingTools(mockPool);
    const tool = registry.get('consulta_dados');
    const result = await tool.execute({ data_type: 'notas_fiscais' }, ctx);
    assert.equal(result.data_type, 'notas_fiscais');
    assert.ok(Array.isArray(result.notas));
  });

  it('calcula_impostos IRPF retorna imposto_estimado e base_calculo', async () => {
    const registry = buildAccountingTools(mockPool);
    const tool = registry.get('calcula_impostos');
    const result = await tool.execute({ imposto_tipo: 'IRPF', entity_type: 'PF', entity_id: 1, ano: 2024 }, ctx);
    assert.equal(result.imposto_tipo, 'IRPF');
    assert.ok('imposto_estimado' in result, 'tem imposto_estimado');
    assert.ok('base_calculo' in result, 'tem base_calculo');
    assert.ok(result.aviso_geral, 'inclui aviso_geral');
  });

  it('calcula_impostos Simples_DAS retorna das_mensal_estimado', async () => {
    const registry = buildAccountingTools(mockPool);
    const tool = registry.get('calcula_impostos');
    const result = await tool.execute({ imposto_tipo: 'Simples_DAS', entity_type: 'PJ', ano: 2024 }, ctx);
    assert.equal(result.imposto_tipo, 'Simples_DAS');
    assert.ok('das_mensal_estimado' in result, 'tem das_mensal_estimado');
    assert.ok('aliquota' in result, 'tem aliquota');
  });

  it('calcula_impostos IRPJ lucro_presumido retorna base_presumida', async () => {
    const registry = buildAccountingTools(mockPool);
    const tool = registry.get('calcula_impostos');
    const result = await tool.execute({ imposto_tipo: 'IRPJ', entity_type: 'PJ', regime_tributario: 'lucro_presumido', ano: 2024 }, ctx);
    assert.equal(result.imposto_tipo, 'IRPJ');
    assert.equal(result.regime, 'lucro_presumido');
    assert.ok('base_presumida' in result);
  });

  it('calcula_impostos tipo inválido → AiToolError', async () => {
    const registry = buildAccountingTools(mockPool);
    const tool = registry.get('calcula_impostos');
    await assert.rejects(
      () => tool.execute({ imposto_tipo: 'INVALIDO' }, ctx),
      (e) => e instanceof AiToolError && e.code === 'INVALID_INPUT',
      'deve lançar AiToolError com code INVALID_INPUT',
    );
  });

  it('gera_rascunho declaracao_irpf retorna _pendente_confirmacao=true e draft_id', async () => {
    const registry = buildAccountingTools(mockPool);
    const tool = registry.get('gera_rascunho');
    const result = await tool.execute({ tipo: 'declaracao_irpf', entity_type: 'PF', entity_id: 1, periodo: '2024' }, ctx);
    assert.ok(result._pendente_confirmacao, 'marcado como pendente confirmação');
    assert.ok(result.draft_id, 'tem draft_id');
    assert.equal(result.draft.tipo, 'declaracao_irpf');
    assert.equal(result.draft.status, 'pendente_confirmacao');
    assert.ok(result.draft.rendimento_tributavel, 'tem rendimento_tributavel');
  });

  it('gera_rascunho analise_contabil retorna resultado e margem_percentual', async () => {
    const registry = buildAccountingTools(mockPool);
    const tool = registry.get('gera_rascunho');
    const result = await tool.execute({ tipo: 'analise_contabil', entity_type: 'PF', entity_id: 1, periodo: '2024' }, ctx);
    assert.equal(result.draft.tipo, 'analise_contabil');
    assert.ok('receita_total' in result.draft);
    assert.ok('margem_percentual' in result.draft);
    assert.ok('situacao' in result.draft);
  });

  it('gera_rascunho guia_pagamento retorna valor_estimado e vencimento_sugerido', async () => {
    const registry = buildAccountingTools(mockPool);
    const tool = registry.get('gera_rascunho');
    const result = await tool.execute({ tipo: 'guia_pagamento', entity_type: 'PJ', periodo: '2024-01' }, ctx);
    assert.equal(result.draft.tipo, 'guia_pagamento');
    assert.ok('valor_estimado' in result.draft);
    assert.ok('vencimento_sugerido' in result.draft);
  });

  it('gera_rascunho tipo inválido → AiToolError', async () => {
    const registry = buildAccountingTools(mockPool);
    const tool = registry.get('gera_rascunho');
    await assert.rejects(
      () => tool.execute({ tipo: 'tipo_inexistente' }, ctx),
      (e) => e instanceof AiToolError,
      'deve lançar AiToolError',
    );
  });

  it('cita_fonte retorna source_type e citado=true quando registro encontrado', async () => {
    // Mock pool que simula encontrar o income_expense id=1
    const poolWithData = {
      async query(sql) {
        if (sql.includes('income_expenses') && sql.includes('WHERE tenant_id')) {
          return { rows: [{ id: 1, tipo: 'receita', categoria: 'salario', descricao: 'Salário jan', valor: '5000.00', data: '2024-01-31', status: 'pago' }] };
        }
        return { rows: [] };
      },
    };
    const { buildAccountingTools: bat } = await import('../src/ai/tools.js');
    const registry = bat(poolWithData);
    const tool = registry.get('cita_fonte');
    const result = await tool.execute({ source_type: 'income_expense', source_id: 1, descricao: 'Salário de janeiro' }, ctx);
    assert.equal(result.source_type, 'income_expense');
    assert.equal(result.citado, true);
    assert.ok(result.record?.id, 'record tem id');
  });

  it('cita_fonte source_id inexistente retorna citado=false e error:not_found', async () => {
    // Pool que retorna vazio (simula ID inexistente)
    const emptyPool = { async query() { return { rows: [] }; } };
    const { buildAccountingTools: bat } = await import('../src/ai/tools.js');
    const registry = bat(emptyPool);
    const tool = registry.get('cita_fonte');
    const result = await tool.execute({ source_type: 'income_expense', source_id: 999999 }, ctx);
    assert.equal(result.citado, false);
    assert.equal(result.record?.error, 'not_found');
  });
});

// ─── Testes do graph (unit, sem LLM real) ───────────────────────────────────
describe('ai/graph.js — extração de resultado (unit)', async () => {
  let extractChatResult;
  before(async () => {
    const mod = await import('../src/ai/graph.js');
    extractChatResult = mod.extractChatResult;
  });

  it('extractChatResult extrai answer do texto', async () => {
    const r = extractChatResult({ text: 'Seu saldo é R$4.200,00.', evidence: [], route: 'deep' });
    assert.equal(r.answer, 'Seu saldo é R$4.200,00.');
    assert.equal(r.grounded, false);
  });

  it('extractChatResult extrai citations de cita_fonte', async () => {
    const r = extractChatResult({
      text: 'Baseado na sua receita de janeiro...',
      route: 'deep',
      evidence: [
        { tool: 'cita_fonte', output: { source_type: 'income_expense', source_id: 1, citado: true, record: { id: 1, valor: '5000.00' }, descricao_citacao: 'Receita jan' } },
      ],
    });
    assert.equal(r.citations.length, 1);
    assert.equal(r.citations[0].source_type, 'income_expense');
    assert.equal(r.grounded, true);
  });

  it('extractChatResult extrai draft de gera_rascunho', async () => {
    const r = extractChatResult({
      text: 'Proposta de declaração IRPF gerada.',
      route: 'deep',
      evidence: [
        { tool: 'gera_rascunho', output: { draft_id: 'draft-irpf-1', draft: { tipo: 'declaracao_irpf', status: 'pendente_confirmacao', rendimento_tributavel: '60000.00' }, _pendente_confirmacao: true } },
      ],
    });
    assert.ok(r.draft, 'draft extraído');
    assert.equal(r.draft.tipo, 'declaracao_irpf');
    assert.equal(r.draft.draft_id, 'draft-irpf-1');
    assert.equal(r.draft.status, 'pendente_confirmacao');
  });

  it('extractChatResult tools_used inclui todos os tools chamados', async () => {
    const r = extractChatResult({
      text: 'Resposta.',
      route: 'deep',
      evidence: [
        { tool: 'consulta_dados', output: { saldo: '1000' } },
        { tool: 'calcula_impostos', output: { imposto: '200' } },
        { tool: 'cita_fonte', output: { citado: false } },
      ],
    });
    assert.ok(r.tools_used.includes('consulta_dados'));
    assert.ok(r.tools_used.includes('calcula_impostos'));
    assert.ok(r.tools_used.includes('cita_fonte'));
  });

  it('extractChatResult handle evidence vazia sem crash', async () => {
    const r = extractChatResult({ text: 'OK', evidence: null });
    assert.equal(r.answer, 'OK');
    assert.deepEqual(r.citations, []);
    assert.equal(r.draft, null);
  });
});

// ─── Testes do LLM (unit, sem API key real) ──────────────────────────────────
describe('ai/llm.js — adapter (unit)', async () => {
  let getLlm, getEmbedder, __resetLlmForTest;
  before(async () => {
    const mod = await import('../src/ai/llm.js');
    getLlm = mod.getLlm;
    getEmbedder = mod.getEmbedder;
    __resetLlmForTest = mod.__resetLlmForTest;
  });

  it('getLlm retorna null sem chave (fail-closed)', async () => {
    const savedO = process.env.OPENAI_API_KEY;
    const savedA = process.env.ANTHROPIC_API_KEY;
    process.env.OPENAI_API_KEY = '';
    process.env.ANTHROPIC_API_KEY = '';
    __resetLlmForTest();
    const llm = await getLlm();
    assert.equal(llm, null, 'null sem chave → fail-closed');
    process.env.OPENAI_API_KEY = savedO || '';
    if (savedA) process.env.ANTHROPIC_API_KEY = savedA;
    __resetLlmForTest();
  });

  it('getEmbedder retorna null sem OPENAI_API_KEY', async () => {
    const saved = process.env.OPENAI_API_KEY;
    process.env.OPENAI_API_KEY = '';
    __resetLlmForTest();
    const emb = await getEmbedder();
    assert.equal(emb, null, 'null sem OPENAI_API_KEY');
    process.env.OPENAI_API_KEY = saved || '';
    __resetLlmForTest();
  });

  it('getLlm com OPENAI_API_KEY retorna adapter com .complete()', async () => {
    const saved = process.env.OPENAI_API_KEY;
    process.env.OPENAI_API_KEY = 'sk-test-fake-key-for-unit-test';
    __resetLlmForTest();
    const llm = await getLlm();
    assert.ok(llm, 'retorna adapter');
    assert.ok(typeof llm.complete === 'function', 'tem .complete()');
    assert.equal(llm.provider, 'openai', 'provider = openai');
    process.env.OPENAI_API_KEY = saved || '';
    __resetLlmForTest();
  });

  it('getLlm prefere Anthropic quando ANTHROPIC_API_KEY está definida', async () => {
    const savedO = process.env.OPENAI_API_KEY;
    const savedA = process.env.ANTHROPIC_API_KEY;
    process.env.ANTHROPIC_API_KEY = 'sk-ant-test-fake-key';
    process.env.OPENAI_API_KEY = '';
    __resetLlmForTest();
    const llm = await getLlm();
    assert.ok(llm, 'retorna adapter Anthropic');
    assert.equal(llm.provider, 'anthropic', 'provider = anthropic');
    process.env.OPENAI_API_KEY = savedO || '';
    process.env.ANTHROPIC_API_KEY = savedA || '';
    __resetLlmForTest();
  });
});

// ─── Testes de prompts (unit) ─────────────────────────────────────────────────
describe('ai/prompts.js — prompts versionados (unit)', async () => {
  it('PROMPTS.version existe e é string', async () => {
    const { PROMPTS } = await import('../src/ai/prompts.js');
    assert.ok(typeof PROMPTS.version === 'string', 'tem version');
  });

  it('PROMPTS.contabilSystem.system menciona tools de domínio', async () => {
    const { PROMPTS } = await import('../src/ai/prompts.js');
    const sys = PROMPTS.contabilSystem.system;
    assert.ok(sys.includes('consulta_dados'), 'menciona consulta_dados');
    assert.ok(sys.includes('gera_rascunho'), 'menciona gera_rascunho');
    assert.ok(sys.includes('cita_fonte'), 'menciona cita_fonte');
  });

  it('PROMPTS menciona que rascunho NÃO é salvo automaticamente', async () => {
    const { PROMPTS } = await import('../src/ai/prompts.js');
    const sys = PROMPTS.contabilSystem.system;
    assert.ok(sys.includes('NÃO') || sys.includes('confirmar') || sys.includes('confirmação'), 'menciona confirmação de rascunho');
  });

  it('getPromptSource sem control-plane retorna fallback local', async () => {
    const { getPromptSource } = await import('../src/ai/prompts.js');
    const { PROMPTS } = await import('../src/ai/prompts.js');
    const savedUrl = process.env.AI_CONTROL_PLANE_URL;
    process.env.AI_CONTROL_PLANE_URL = '';
    const ps = await getPromptSource();
    const resolved = await ps.resolve('contabil-system');
    assert.equal(resolved, PROMPTS.contabilSystem.system, 'fallback local igual ao PROMPTS.contabilSystem.system');
    process.env.AI_CONTROL_PLANE_URL = savedUrl || '';
  });

  it('getPromptSource com control-plane indisponível ainda retorna prompt local (não quebra)', async () => {
    const { getPromptSource } = await import('../src/ai/prompts.js');
    const { PROMPTS } = await import('../src/ai/prompts.js');
    const savedUrl = process.env.AI_CONTROL_PLANE_URL;
    process.env.AI_CONTROL_PLANE_URL = 'http://localhost:9999/never-available';
    const ps = await getPromptSource();
    const resolved = await ps.resolve('contabil-system');
    assert.ok(typeof resolved === 'string' && resolved.length > 0, 'retorna string não-vazia mesmo com control-plane indisponível');
    process.env.AI_CONTROL_PLANE_URL = savedUrl || '';
  });
});

// ─── Testes de RAG (unit) ─────────────────────────────────────────────────────
describe('ai/rag.js — RAG helpers (unit)', async () => {
  it('searchKnowledge retorna [] sem embedder (fail-soft)', async () => {
    const savedKey = process.env.OPENAI_API_KEY;
    process.env.OPENAI_API_KEY = '';
    const { __resetLlmForTest } = await import('../src/ai/llm.js');
    __resetLlmForTest();
    const { searchKnowledge, __resetRagForTest } = await import('../src/ai/rag.js');
    __resetRagForTest();
    const hits = await searchKnowledge(mockPool, 'saldo caixa');
    assert.deepEqual(hits, [], 'retorna [] sem embedder (fail-soft)');
    process.env.OPENAI_API_KEY = savedKey || '';
    __resetLlmForTest();
    __resetRagForTest();
  });

  it('formatRagContext retorna string com trechos numerados', async () => {
    const { formatRagContext } = await import('../src/ai/rag.js');
    const hits = [
      { id: '1', source: 'doc:1', title: 'Receitas', text: 'Receita total R$60k.', score: 0.9 },
      { id: '2', source: 'doc:2', title: null, text: 'Despesa total R$20k.', score: 0.8 },
    ];
    const ctx = formatRagContext(hits);
    assert.ok(ctx.includes('[1]'), 'inclui [1]');
    assert.ok(ctx.includes('[2]'), 'inclui [2]');
    assert.ok(ctx.includes('Receitas'), 'inclui título');
    assert.ok(ctx.includes('Receita total'), 'inclui conteúdo');
  });

  it('formatRagContext retorna string vazia para hits vazios', async () => {
    const { formatRagContext } = await import('../src/ai/rag.js');
    assert.equal(formatRagContext([]), '', 'string vazia para array vazio');
    assert.equal(formatRagContext(null), '', 'string vazia para null');
  });

  it('hashContent de ai-core retorna SHA-256 de 64 chars', async () => {
    const { hashContent } = await import('@flavioneto11/ai-core');
    const h = hashContent('Receita R$5.000');
    assert.equal(h.length, 64, 'hash SHA-256 de 64 chars');
    assert.notEqual(hashContent('A'), hashContent('B'), 'hashes diferentes para inputs diferentes');
  });

  it('splitWithOverlap de ai-core divide texto em chunks', async () => {
    const { splitWithOverlap } = await import('@flavioneto11/ai-core');
    const texto = 'Receita R$5.000,00. Despesa R$800,00. Saldo R$4.200,00.';
    const chunks = splitWithOverlap(texto, { maxChars: 30, minChars: 5 });
    assert.ok(chunks.length >= 1, 'gera ao menos 1 chunk');
  });
});

// ─── Teste de contrato: rota HTTP (mock app inline) ───────────────────────────
describe('routes/assistant.js — contrato HTTP (unit)', async () => {
  it('POST /v1/assistant sem chave → 503 com error.code=AI_DISABLED', async () => {
    const Fastify = (await import('fastify')).default;
    const { __resetLlmForTest } = await import('../src/ai/llm.js');
    const { __resetGraphForTest } = await import('../src/ai/graph.js');
    const savedO = process.env.OPENAI_API_KEY;
    const savedA = process.env.ANTHROPIC_API_KEY;
    process.env.OPENAI_API_KEY = '';
    process.env.ANTHROPIC_API_KEY = '';
    __resetLlmForTest();
    __resetGraphForTest();

    const app = Fastify({ logger: false });
    app.addContentTypeParser('application/json', { parseAs: 'string' }, (_req, body, done) => {
      try { done(null, JSON.parse(body)); } catch (e) { done(e, undefined); }
    });
    const { registerAssistantRoutes } = await import('../src/routes/assistant.js');
    registerAssistantRoutes(app);
    await app.ready();

    const res = await app.inject({ method: 'POST', url: '/v1/assistant', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ message: 'Qual é meu saldo?' }) });
    assert.equal(res.statusCode, 503, 'retorna 503');
    const body = JSON.parse(res.body);
    assert.equal(body.error?.code, 'AI_DISABLED', 'error.code = AI_DISABLED');

    await app.close();
    process.env.OPENAI_API_KEY = savedO || '';
    if (savedA) process.env.ANTHROPIC_API_KEY = savedA;
    __resetLlmForTest();
    __resetGraphForTest();
  });

  it('GET /v1/assistant/health sem chave → 503 com ai:false', async () => {
    const Fastify = (await import('fastify')).default;
    const { __resetLlmForTest } = await import('../src/ai/llm.js');
    const savedO = process.env.OPENAI_API_KEY;
    const savedA = process.env.ANTHROPIC_API_KEY;
    process.env.OPENAI_API_KEY = '';
    process.env.ANTHROPIC_API_KEY = '';
    __resetLlmForTest();

    const app = Fastify({ logger: false });
    const { registerAssistantRoutes } = await import('../src/routes/assistant.js');
    registerAssistantRoutes(app);
    await app.ready();

    const res = await app.inject({ method: 'GET', url: '/v1/assistant/health' });
    assert.equal(res.statusCode, 503, 'status 503');
    const body = JSON.parse(res.body);
    assert.equal(body.ai, false, 'ai: false');

    await app.close();
    process.env.OPENAI_API_KEY = savedO || '';
    if (savedA) process.env.ANTHROPIC_API_KEY = savedA;
    __resetLlmForTest();
  });

  it('GET /v1/assistant/health com chave falsa → 200 com ai:true (adapter retorna)', async () => {
    const Fastify = (await import('fastify')).default;
    const { __resetLlmForTest } = await import('../src/ai/llm.js');
    const savedO = process.env.OPENAI_API_KEY;
    const savedA = process.env.ANTHROPIC_API_KEY;
    process.env.OPENAI_API_KEY = 'sk-fake-unit-test-key';
    process.env.ANTHROPIC_API_KEY = '';
    __resetLlmForTest();

    const app = Fastify({ logger: false });
    const { registerAssistantRoutes } = await import('../src/routes/assistant.js');
    registerAssistantRoutes(app);
    await app.ready();

    const res = await app.inject({ method: 'GET', url: '/v1/assistant/health' });
    assert.equal(res.statusCode, 200, 'status 200 com chave configurada');
    const body = JSON.parse(res.body);
    assert.equal(body.ai, true, 'ai: true');
    assert.equal(body.provider, 'openai', 'provider: openai');

    await app.close();
    process.env.OPENAI_API_KEY = savedO || '';
    if (savedA) process.env.ANTHROPIC_API_KEY = savedA;
    __resetLlmForTest();
  });

  it('POST /v1/assistant sem message e sem arquivos → 400', async () => {
    const Fastify = (await import('fastify')).default;
    const { __resetLlmForTest } = await import('../src/ai/llm.js');
    const savedO = process.env.OPENAI_API_KEY;
    // Com chave para passar do 503
    process.env.OPENAI_API_KEY = 'sk-fake-unit-test-key';
    __resetLlmForTest();

    const app = Fastify({ logger: false });
    app.addContentTypeParser('application/json', { parseAs: 'string' }, (_req, body, done) => {
      try { done(null, JSON.parse(body)); } catch (e) { done(e, undefined); }
    });
    const { registerAssistantRoutes } = await import('../src/routes/assistant.js');
    registerAssistantRoutes(app);
    await app.ready();

    const res = await app.inject({ method: 'POST', url: '/v1/assistant', headers: { 'content-type': 'application/json' }, body: JSON.stringify({}) });
    assert.equal(res.statusCode, 400, 'retorna 400 sem message');

    await app.close();
    process.env.OPENAI_API_KEY = savedO || '';
    __resetLlmForTest();
  });
});
