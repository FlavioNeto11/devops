#!/usr/bin/env node
// Runner de avaliação do GymOps contra o golden set (F0 da re-engenharia de IA).
//
// Modos:
//   node scripts/ai-eval.mjs                 → MOCK (valida harness/assertions, sem rede)
//   node scripts/ai-eval.mjs --graph         → GRAFO real do ai-core + LLM simulado + tools mock
//                                              (valida roteamento fast/deep, escolha de tool e
//                                              ancoragem na evidência — casos tag "graph")
//   node scripts/ai-eval.mjs --real          → chama o LLM de verdade (OPENAI_API_KEY) com
//                                              os prompts reais por feature; judge gpt-5-nano
//   flags: --sample N (subset p/ PR) · --json out.json (relatório)
//          --enforce-kpis (exit != 0 se algum KPI ficar abaixo da meta — gate de CI)
//
// O runner NÃO sobe a API: reproduz a montagem de prompt das features com contexto
// sintético — avalia o COMPORTAMENTO DO MODELO/prompt, não o HTTP. (F1 pluga o grafo.)
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { parseGoldenSetJsonl, runEval, summarizeEvalKpis, createAiGraph, createToolRegistry } from '@flavioneto11/ai-core';
import { chatJSON, chatText } from '@flavioneto11/ai-kit';

const here = path.dirname(fileURLToPath(import.meta.url));
const goldenPath = path.resolve(here, '../../../docs/ai-eval/golden-set.jsonl');
const args = process.argv.slice(2);
const real = args.includes('--real');
const graphMode = args.includes('--graph');
const sampleIdx = args.indexOf('--sample');
const sample = sampleIdx >= 0 ? Number(args[sampleIdx + 1]) : undefined;
const jsonIdx = args.indexOf('--json');
const jsonOut = jsonIdx >= 0 ? args[jsonIdx + 1] : null;
const enforceKpis = args.includes('--enforce-kpis');

const allCases = parseGoldenSetJsonl(readFileSync(goldenPath, 'utf8'));
// casos tag "graph" rodam SÓ no modo --graph; os demais modos os excluem.
const cases = allCases.filter((c) => (c.tags || []).includes('graph') === graphMode);

// ---- runners ---------------------------------------------------------------
// MOCK: respostas plausíveis determinísticas — valida o harness/assertions.
const mockRunner = async (c) => {
  const i = c.input || {};
  switch (i.feature) {
    case 'draft': return { text: `Rascunho: ${i.text}`, toolCalls: [], evidence: { areas: ['estrutura'] } };
    case 'checklist': return { text: 'Itens: verificar equipamentos; registrar resultado.', toolCalls: [] };
    case 'delay': return { text: `Atividade com ${i.daysOverdue} dias de atraso (${i.daysOverdue > 7 ? 'critica' : 'moderada'}).`, toolCalls: [], evidence: { daysOverdue: i.daysOverdue } };
    case 'chat': return { text: respostaMockChat(i.q), toolCalls: [], evidence: { snapshot: true } };
    case 'summary': return { text: `Resumo ${i.unitName}: ${i.stats.totalOpen} abertas, ${i.stats.overdue} atrasadas.`, toolCalls: [], evidence: i.stats };
    default: return { text: '' };
  }
};
function respostaMockChat(q) {
  if (/atrasad/i.test(q)) return 'Hoje ha 3 atividades atrasadas: ar-condicionado, mural e planilha.';
  if (/recorrente/i.test(q)) return 'Para criar uma atividade recorrente, use Recorrencias > Nova.';
  if (/resumo/i.test(q)) return 'Resumo de hoje: 12 abertas, 3 atrasadas, 1 critica.';
  return 'Temos 4 unidades cadastradas.';
}

// REAL: monta um prompt fiel por feature (contexto sintético) e chama o modelo.
function makeRealRunner() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) { console.error('--real exige OPENAI_API_KEY'); process.exit(2); }
  // import dinâmico para não exigir openai no modo mock
  return import('openai').then(({ default: OpenAI }) => {
    const client = new OpenAI({ apiKey });
    const model = process.env.OPENAI_MODEL?.trim() || 'gpt-5-nano';
    return async (c) => {
      const i = c.input || {};
      if (i.feature === 'chat') {
        const messages = [
          { role: 'system', content: 'Voce e o Assistente Operacional do GymOps. Responda em portugues, objetivamente, usando o CONTEXTO real: 4 unidades; 12 atividades abertas; 3 atrasadas (ar-condicionado ha 9 dias, mural ha 2 dias, planilha ha 4 dias); 1 critica. Nao invente numeros.' },
          { role: 'user', content: i.q },
        ];
        const text = await chatText(client, messages, { model });
        return { text, toolCalls: [], evidence: { unidades: 4, abertas: 12, atrasadas: 3 } };
      }
      const prompt = i.feature === 'draft'
        ? `Gere JSON {"title","description"} de rascunho rico para: ${i.text}. Areas: estrutura, marketing, financeiro.`
        : i.feature === 'checklist'
          ? `Gere JSON {"items":[{"text"}]} com checklist para "${i.activityTitle}" (area ${i.areaName}).`
          : i.feature === 'delay'
            ? `Gere JSON {"summary","riskLevel"} para atividade "${i.activityTitle}" com ${i.daysOverdue} dias de atraso.`
            : `Gere JSON {"summary"} do dia da unidade ${i.unitName}: ${JSON.stringify(i.stats)}.`;
      const obj = await chatJSON(client, prompt, { model });
      return { text: JSON.stringify(obj), toolCalls: [], evidence: i };
    };
  });
}

// GRAFO: grafo REAL do ai-core com LLM simulado (roteia por palavra-chave) e
// tools mock com os MESMOS nomes/contratos das tools reais do GymOps — valida
// router→especialista→dispatch→synth→verify de ponta a ponta, determinístico.
function makeGraphRunner() {
  const registry = createToolRegistry([
    {
      name: 'query_overdue', description: 'Lista atividades atrasadas', specialist: 'ops',
      risk: 'R1', mutates: false, parameters: { type: 'object', properties: {} },
      authorize: async ({ identity }) => ({ allowed: Boolean(identity?.sub) }),
      execute: async () => ({ total: 3, items: [{ title: 'Ar-condicionado', daysOverdue: 9, unit: 'Vila Xavier' }] }),
    },
    {
      name: 'get_daily_stats', description: 'Estatísticas do dia', specialist: 'ops',
      risk: 'R1', mutates: false, parameters: { type: 'object', properties: {} },
      authorize: async ({ identity }) => ({ allowed: Boolean(identity?.sub) }),
      execute: async () => ({ byStatus: { novo: 8, em_andamento: 4 }, overdue: 3, critical: 1, dueToday: 2 }),
    },
    {
      name: 'list_units', description: 'Lista unidades', specialist: 'ops',
      risk: 'R1', mutates: false, parameters: { type: 'object', properties: {} },
      authorize: async ({ identity }) => ({ allowed: Boolean(identity?.sub) }),
      execute: async () => ({ total: 2, units: [{ name: 'Vila Xavier', openActivities: 7 }, { name: 'Centro', openActivities: 5 }] }),
    },
  ]);

  const pickTool = (q) => {
    if (/atrasad/i.test(q)) return 'query_overdue';
    if (/estat|resumo|quant/i.test(q) && /unidade/i.test(q) === false) return 'get_daily_stats';
    if (/unidade/i.test(q)) return 'list_units';
    return 'get_daily_stats';
  };

  const simLlm = {
    complete: async ({ messages, tools, jsonMode }) => {
      const sys = String(messages[0]?.content || '');
      const user = String(messages.findLast?.((m) => m.role === 'user')?.content || messages[messages.length - 1]?.content || '');
      const usage = { prompt_tokens: 20, completion_tokens: 10 };
      if (jsonMode && sys.includes('ROTEADOR')) {
        const trivial = /^(oi|ola|olá|bom dia|boa tarde|obrigad)/i.test(user.trim());
        return { text: JSON.stringify(trivial ? { complexity: 'trivial', specialist: null } : { complexity: 'complex', specialist: 'ops' }), toolCalls: [], usage };
      }
      if (jsonMode && user.includes('JUIZ')) return { text: '{"score":0.9,"reason":"ancorado"}', toolCalls: [], usage };
      if (tools?.length) {
        const hasToolResult = messages.some((m) => m.role === 'tool');
        if (!hasToolResult) {
          return { text: '', toolCalls: [{ id: 'tc1', name: pickTool(user), arguments: {} }], usage };
        }
        const evidence = messages.filter((m) => m.role === 'tool').map((m) => m.content).join(' ');
        const data = JSON.parse(messages.findLast((m) => m.role === 'tool').content);
        if (data.items) return { text: `Há ${data.total} atividades atrasadas; a mais antiga é "${data.items[0].title}" (${data.items[0].daysOverdue} dias, ${data.items[0].unit}).`, toolCalls: [], usage };
        if (data.units) return { text: `Temos ${data.total} unidades: ${data.units.map((u) => `${u.name} (${u.openActivities} abertas)`).join(', ')}.`, toolCalls: [], usage };
        return { text: `Hoje: ${data.overdue} atrasadas, ${data.critical} crítica(s), ${data.dueToday} vencendo hoje.`, toolCalls: [], usage };
      }
      return { text: 'Olá! Como posso ajudar na operação hoje?', toolCalls: [], usage };
    },
  };

  const graph = createAiGraph({
    llm: simLlm,
    registry,
    specialists: [{ id: 'ops', description: 'operação: atividades, atrasos, estatísticas, unidades', systemPrompt: 'Especialista operacional.' }],
  });

  return async (c) => {
    const r = await graph.runTurn({ message: c.input.q, identity: { sub: 'eval-user' }, toolContext: { organizationId: 'org-eval' } });
    return { text: r.text, toolCalls: r.toolCalls.map((t) => ({ name: t.name })), evidence: r.evidence };
  };
}

// ---- run -------------------------------------------------------------------
const runner = graphMode ? makeGraphRunner() : real ? await makeRealRunner() : mockRunner;
const judgeClient = real
  ? new (await import('openai')).default({ apiKey: process.env.OPENAI_API_KEY })
  : null;

const results = await runEval(cases, {
  runner,
  judgeClient,
  sample,
  onCase: (r) => console.log(`${r.passed ? 'ok ' : 'FAIL'} ${r.id}${r.failures.length ? ' — ' + r.failures.join('; ') : ''}`),
});

const kpis = summarizeEvalKpis(results);
console.log('\n=== resultado ===');
console.log(`casos: ${results.total} | pass: ${results.passed} | fail: ${results.failed}`);
if (results.toolCallAccuracy !== null) console.log(`tool-call accuracy: ${(results.toolCallAccuracy * 100).toFixed(0)}%`);
for (const [dim, avg] of Object.entries(results.judgeAverages)) console.log(`judge ${dim}: ${avg.toFixed(2)}`);
for (const [id, k] of Object.entries(kpis)) console.log(`KPI ${id}: ${k.value.toFixed(2)} (meta ${k.target}) ${k.ok ? '✓' : '✗'}`);

if (jsonOut) { writeFileSync(jsonOut, JSON.stringify({ results, kpis }, null, 2)); console.log(`relatorio: ${jsonOut}`); }

// Gate de regressão (CI): casos reprovados OU KPI abaixo da meta bloqueiam.
const kpiFailures = enforceKpis ? Object.entries(kpis).filter(([, k]) => !k.ok) : [];
if (kpiFailures.length) console.error(`KPIs abaixo da meta: ${kpiFailures.map(([id]) => id).join(', ')}`);
process.exit(results.failed > 0 || kpiFailures.length > 0 ? 1 : 0);
