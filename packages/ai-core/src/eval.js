// eval.js — harness de avaliação contra golden sets (assertions + LLM-as-judge).
//
// Caso de golden set (JSONL, 1 por linha):
//   { id, input: {...}, expected?: { toolName?, contains?: [..], notContains?: [..] },
//     judge?: ['groundedness','answer_relevance'], tags?: [...] }
//
// O harness é agnóstico ao app: o `runner(case)` é fornecido pelo app e devolve
//   { text, toolCalls?: [{name, arguments}], evidence?: any }
// As assertions determinísticas rodam sempre; o judge (LLM) só roda quando o
// caso pede e um `judgeClient` (estrutural OpenAI) é fornecido — em CI usar
// gpt-5-nano + amostragem (full set no nightly).

import { chatJSON } from '@flavioneto11/ai-kit';

export function parseGoldenSetJsonl(text) {
  return String(text || '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'))
    .map((l, i) => {
      try { return JSON.parse(l); } catch (e) { throw new Error(`golden set: linha ${i + 1} invalida: ${e.message}`); }
    });
}

function runAssertions(c, out) {
  const failures = [];
  const text = String(out?.text ?? '');
  const exp = c.expected || {};
  for (const s of exp.contains || []) {
    if (!text.toLowerCase().includes(String(s).toLowerCase())) failures.push(`esperava conter "${s}"`);
  }
  for (const s of exp.notContains || []) {
    if (text.toLowerCase().includes(String(s).toLowerCase())) failures.push(`NAO deveria conter "${s}"`);
  }
  let toolOk = null;
  if (exp.toolName !== undefined) {
    const called = (out?.toolCalls || []).map((t) => t?.name);
    toolOk = exp.toolName === null ? called.length === 0 : called.includes(exp.toolName);
    if (!toolOk) failures.push(`tool esperada=${exp.toolName ?? 'nenhuma'}, chamadas=[${called.join(', ')}]`);
  }
  return { failures, toolOk };
}

const JUDGE_PROMPT = (dimension, c, out) => `Voce e um JUIZ rigoroso de respostas de assistente de IA.
Dimensao avaliada: ${dimension}.
- groundedness: a resposta esta ancorada na evidencia fornecida, sem inventar fatos/numeros?
- answer_relevance: a resposta atende diretamente a pergunta do usuario?

PERGUNTA DO USUARIO:
${JSON.stringify(c.input)}

EVIDENCIA DISPONIVEL (tools/RAG; pode ser vazia):
${JSON.stringify(out?.evidence ?? null).slice(0, 4000)}

RESPOSTA DO ASSISTENTE:
${String(out?.text ?? '').slice(0, 4000)}

Responda APENAS JSON: {"score": <0..1>, "reason": "<1 frase>"}`;

async function judgeCase(judgeClient, judgeModel, dimension, c, out) {
  const parsed = await chatJSON(judgeClient, JUDGE_PROMPT(dimension, c, out), { model: judgeModel });
  const score = Number(parsed?.score);
  return { dimension, score: Number.isFinite(score) ? Math.min(1, Math.max(0, score)) : 0, reason: String(parsed?.reason || '') };
}

/**
 * Roda o golden set. Opções:
 *   runner(case) → { text, toolCalls?, evidence? }   (obrigatório)
 *   judgeClient (estrutural OpenAI) + judgeModel     (opcional — habilita judge)
 *   sample: n   (avalia só os n primeiros — para PRs; nightly roda tudo)
 *   onCase(result)                                    (progresso/log)
 */
export async function runEval(cases, { runner, judgeClient, judgeModel = 'gpt-5-nano', sample, onCase } = {}) {
  if (typeof runner !== 'function') throw new Error('runEval: runner(case) obrigatorio');
  const selected = sample ? cases.slice(0, sample) : cases;
  const byCase = [];
  const judgeSums = {}; const judgeCounts = {};
  let toolChecked = 0; let toolCorrect = 0;

  for (const c of selected) {
    const startedAt = Date.now();
    let out; let error = null;
    try { out = await runner(c); } catch (e) { error = String(e?.message || e); out = { text: '' }; }

    const { failures, toolOk } = runAssertions(c, out);
    if (toolOk !== null) { toolChecked += 1; if (toolOk) toolCorrect += 1; }

    const judgeScores = [];
    if (judgeClient && Array.isArray(c.judge)) {
      for (const dim of c.judge) {
        try {
          const j = await judgeCase(judgeClient, judgeModel, dim, c, out);
          judgeScores.push(j);
          judgeSums[dim] = (judgeSums[dim] || 0) + j.score;
          judgeCounts[dim] = (judgeCounts[dim] || 0) + 1;
        } catch (e) {
          judgeScores.push({ dimension: dim, score: null, reason: `judge falhou: ${e?.message || e}` });
        }
      }
    }

    const result = {
      id: c.id,
      passed: !error && failures.length === 0,
      error,
      failures,
      judgeScores,
      ms: Date.now() - startedAt,
    };
    byCase.push(result);
    if (onCase) { try { onCase(result); } catch { /* noop */ } }
  }

  const judgeAverages = {};
  for (const dim of Object.keys(judgeSums)) judgeAverages[dim] = judgeSums[dim] / judgeCounts[dim];

  return {
    total: selected.length,
    passed: byCase.filter((r) => r.passed).length,
    failed: byCase.filter((r) => !r.passed).length,
    toolCallAccuracy: toolChecked ? toolCorrect / toolChecked : null,
    judgeAverages,
    byCase,
  };
}
