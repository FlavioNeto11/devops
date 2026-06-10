#!/usr/bin/env node
// Runner de avaliação do GymOps contra o golden set (F0 da re-engenharia de IA).
//
// Modos:
//   node scripts/ai-eval.mjs                 → MOCK (valida harness/assertions, sem rede)
//   node scripts/ai-eval.mjs --real          → chama o LLM de verdade (OPENAI_API_KEY) com
//                                              os prompts reais por feature; judge gpt-5-nano
//   flags: --sample N (subset p/ PR) · --json out.json (relatório)
//
// O runner NÃO sobe a API: reproduz a montagem de prompt das features com contexto
// sintético — avalia o COMPORTAMENTO DO MODELO/prompt, não o HTTP. (F1 pluga o grafo.)
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { parseGoldenSetJsonl, runEval, summarizeEvalKpis } from '@flavioneto11/ai-core';
import { chatJSON, chatText } from '@flavioneto11/ai-kit';

const here = path.dirname(fileURLToPath(import.meta.url));
const goldenPath = path.resolve(here, '../../../docs/ai-eval/golden-set.jsonl');
const args = process.argv.slice(2);
const real = args.includes('--real');
const sampleIdx = args.indexOf('--sample');
const sample = sampleIdx >= 0 ? Number(args[sampleIdx + 1]) : undefined;
const jsonIdx = args.indexOf('--json');
const jsonOut = jsonIdx >= 0 ? args[jsonIdx + 1] : null;

const cases = parseGoldenSetJsonl(readFileSync(goldenPath, 'utf8'));

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

// ---- run -------------------------------------------------------------------
const runner = real ? await makeRealRunner() : mockRunner;
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
process.exit(results.failed > 0 ? 1 : 0);
