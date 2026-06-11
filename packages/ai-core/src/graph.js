// graph.js — grafo PADRÃO de raciocínio da plataforma de IA (F1).
//
//   turn → ROUTER (nano: intent + complexidade + especialista)
//     ├─ fast  → SYNTH (resposta direta com o contexto do app)
//     └─ deep  → SPECIALIST (loop ReAct: LLM ↔ TOOLS via dispatchTool,
//                 com authz por identidade / dry-run / confirmação)
//   → VERIFY (judge nano: groundedness; score baixo → 1 retry deep = escalation)
//   → resposta + métricas (latência por nó, tokens, custo, judge, escalation)
//
// O motor é uma máquina de estados explícita sobre o adapter estrutural `llm`
// (ver llm.js) — sem dependência de runtime. A semântica dos nós é a do plano
// (LangGraph-like); na F3 o estado de thread ganha checkpointer Postgres e na
// F4 o SICAT roda os mesmos nós sobre o LangGraph que ele já usa.

import { dispatchTool, AiToolConfirmationRequiredError, AiToolDeniedError } from './tools.js';
import { extractTokenUsage, estimateCostUsd } from './provider.js';

const DEFAULT_MODELS = Object.freeze({
  router: 'gpt-5-nano',
  deep: 'gpt-5-nano',
  synth: 'gpt-5-nano',
  judge: 'gpt-5-nano',
});

const noopMetrics = {
  observeTurn: () => {}, addTokens: () => {}, addCost: () => {},
  countToolCall: () => {}, countError: () => {}, observeJudgeScore: () => {}, countEscalation: () => {},
};
const noopTracer = { traceFor: () => ({ span: (_n, _m, fn) => fn(), end: () => {} }) };

function routerPrompt(specialists) {
  const list = specialists.map((s) => `- ${s.id}: ${s.description}`).join('\n');
  return `Voce e o ROTEADOR de um assistente operacional. Classifique a mensagem do usuario.

ESPECIALISTAS DISPONIVEIS:
${list}

Responda APENAS JSON:
{"complexity":"trivial|simple|complex","specialist":"<id ou null>","reason":"<1 frase>"}

Regras:
- "trivial": saudacao, agradecimento, conversa social → nao precisa de dados do sistema.
- "simple": pergunta que o CONTEXTO ja embutido responde (explicacao, como-fazer).
- "complex": precisa CONSULTAR dados ao vivo do sistema (numeros, listas, status atuais) ou executar acao → escolha o especialista.`;
}

function judgePrompt(question, evidence, answer) {
  return `Voce e um JUIZ rigoroso. Avalie GROUNDEDNESS: a resposta esta ancorada na evidencia/contexto, sem inventar fatos ou numeros?

PERGUNTA: ${question}
EVIDENCIA (tools/contexto; pode ser vazia): ${JSON.stringify(evidence).slice(0, 4000)}
RESPOSTA: ${String(answer).slice(0, 4000)}

Responda APENAS JSON: {"score": <0..1>, "reason": "<1 frase>"}`;
}

/**
 * Cria o grafo. Opções:
 *   llm           adapter estrutural { complete } (obrigatório)
 *   registry      toolRegistry do app (createToolRegistry)
 *   specialists   [{ id, description, systemPrompt }]
 *   models        { router, deep, synth, judge } (default gpt-5-nano)
 *   metrics/tracer  de createAiMetrics/createAiTracer (opcionais)
 *   maxToolRounds   limite do loop ReAct (default 4)
 *   verify          liga o judge em runtime (default true)
 *   judgeThreshold  score mínimo antes de escalar (default 0.6)
 */
export function createAiGraph({
  llm,
  registry,
  specialists = [],
  models = {},
  metrics = noopMetrics,
  tracer = noopTracer,
  maxToolRounds = 4,
  verify = true,
  judgeThreshold = 0.6,
} = {}) {
  if (!llm || typeof llm.complete !== 'function') throw new Error('createAiGraph: llm.complete obrigatorio');
  const M = { ...DEFAULT_MODELS, ...models };

  function track(usage, model, acc) {
    const { inputTokens, outputTokens } = extractTokenUsage(usage);
    if (inputTokens || outputTokens) {
      metrics.addTokens(model, inputTokens, outputTokens);
      const usd = estimateCostUsd(model, inputTokens, outputTokens);
      metrics.addCost(model, usd);
      acc.inputTokens += inputTokens;
      acc.outputTokens += outputTokens;
      acc.costUsd += usd;
    }
  }

  /**
   * Executa um turno.
   * turn = { message, history?: [{role,content}], systemContext?: string,
   *          identity?, channel?, correlationId?, sessionId? }
   */
  async function runTurn(turn) {
    const trace = tracer.traceFor({ name: 'ai-graph-turn', sessionId: turn.sessionId, userId: turn.identity?.sub });
    const usage = { inputTokens: 0, outputTokens: 0, costUsd: 0 };
    const startedAt = Date.now();

    try {
      // ── ROUTER ───────────────────────────────────────────────────────────
      const route = await trace.span('router', { input: turn.message }, async () => {
        const r = await llm.complete({
          model: M.router,
          jsonMode: true,
          reasoningEffort: 'minimal',
          messages: [
            { role: 'system', content: routerPrompt(specialists) },
            { role: 'user', content: turn.message },
          ],
        });
        track(r.usage, M.router, usage);
        let parsed = {};
        try { parsed = JSON.parse(r.text || '{}'); } catch { /* defensivo */ }
        const complexity = ['trivial', 'simple', 'complex'].includes(parsed.complexity) ? parsed.complexity : 'simple';
        const specialist = specialists.find((s) => s.id === parsed.specialist) || null;
        return { complexity, specialist, reason: parsed.reason || '' };
      });

      const deep = route.complexity === 'complex' && route.specialist && registry;
      let result;
      if (deep) {
        result = await runDeep(turn, route.specialist, trace, usage);
      } else {
        result = await runFast(turn, trace, usage);
      }

      // ── VERIFY (judge em runtime) ────────────────────────────────────────
      let judge = null;
      if (verify) {
        judge = await runVerify(turn, result, trace, usage);
        if (judge && judge.score < judgeThreshold && !result.escalated) {
          // 1 retry no deep-path (escalation) — nunca entregar resposta frouxa calada.
          metrics.countEscalation(deep ? 'low_groundedness_retry' : 'low_groundedness_deep');
          const spec = route.specialist || specialists[0] || null;
          if (spec && registry) {
            const retry = await runDeep(
              { ...turn, message: turn.message },
              spec, trace, usage,
              'A resposta anterior foi reprovada por falta de ancoragem. CONSULTE as tools antes de responder e cite apenas dados retornados por elas.'
            );
            retry.escalated = true;
            const judge2 = await runVerify(turn, retry, trace, usage);
            if (!judge2 || judge2.score >= judge.score) { result = retry; judge = judge2 || judge; }
          }
        }
      }

      trace.end({ output: result.text });
      metrics.observeTurn('turn', 'ok', (Date.now() - startedAt) / 1000);
      return {
        text: result.text,
        route: deep ? 'deep' : 'fast',
        complexity: route.complexity,
        specialist: route.specialist?.id || null,
        toolCalls: result.toolCalls || [],
        evidence: result.evidence || [],
        judge,
        escalated: Boolean(result.escalated),
        usage,
      };
    } catch (error) {
      metrics.observeTurn('turn', 'error', (Date.now() - startedAt) / 1000);
      metrics.countError('graph', error?.code || error?.name);
      trace.end({ metadata: { error: String(error?.message || error) } });
      throw error;
    }
  }

  // ── FAST: resposta direta com o contexto do app ──────────────────────────
  async function runFast(turn, trace, usage) {
    return trace.span('synth', { input: turn.message }, async () => {
      const r = await llm.complete({
        model: M.synth,
        reasoningEffort: 'minimal',
        messages: [
          ...(turn.systemContext ? [{ role: 'system', content: turn.systemContext }] : []),
          ...(turn.history || []),
          { role: 'user', content: turn.message },
        ],
      });
      track(r.usage, M.synth, usage);
      return { text: r.text, toolCalls: [], evidence: [] };
    });
  }

  // ── DEEP: especialista em loop ReAct com tools ───────────────────────────
  async function runDeep(turn, specialist, trace, usage, extraInstruction = '') {
    const tools = registry.forSpecialist(specialist.id);
    const ctx = {
      identity: turn.identity,
      channel: turn.channel || 'inapp',
      correlationId: turn.correlationId,
      confirmedToolCallId: turn.confirmedToolCallId,
      ...(turn.toolContext || {}),
    };
    const messages = [
      {
        role: 'system',
        content: [
          specialist.systemPrompt,
          turn.systemContext || '',
          'Use as TOOLS para consultar dados REAIS antes de afirmar números/estados. Cite apenas o que as tools retornarem. Responda em português, objetivo.',
          extraInstruction,
        ].filter(Boolean).join('\n\n'),
      },
      ...(turn.history || []),
      { role: 'user', content: turn.message },
    ];
    const executed = [];
    const evidence = [];

    return trace.span('specialist', { input: specialist.id }, async () => {
      for (let round = 0; round < maxToolRounds; round++) {
        const r = await llm.complete({ model: M.deep, reasoningEffort: 'low', messages, tools });
        track(r.usage, M.deep, usage);

        if (!r.toolCalls?.length) {
          return { text: r.text, toolCalls: executed, evidence };
        }

        // registra a vez do assistente com as tool_calls (formato OpenAI)
        messages.push({
          role: 'assistant',
          content: r.text || null,
          tool_calls: r.toolCalls.map((tc) => ({
            id: tc.id, type: 'function',
            function: { name: tc.name, arguments: JSON.stringify(tc.arguments || {}) },
          })),
        });

        for (const tc of r.toolCalls) {
          const tool = registry.get(tc.name);
          let payload;
          if (!tool) {
            payload = { error: `tool desconhecida: ${tc.name}` };
            metrics.countToolCall(tc.name || 'unknown', 'unknown');
          } else {
            try {
              const out = await trace.span('tool', { input: tc.name }, () => dispatchTool(tool, tc.arguments, ctx));
              payload = out.status === 'preview' ? { preview: true, ...wrap(out.output) } : wrap(out.output);
              metrics.countToolCall(tc.name, out.status);
              executed.push({ name: tc.name, status: out.status, arguments: tc.arguments });
              evidence.push({ tool: tc.name, output: out.output });
            } catch (err) {
              const code = err instanceof AiToolDeniedError ? 'denied'
                : err instanceof AiToolConfirmationRequiredError ? 'confirmation_required'
                : 'error';
              payload = { error: code, message: String(err?.message || err) };
              metrics.countToolCall(tc.name, code);
              executed.push({ name: tc.name, status: code, arguments: tc.arguments });
            }
          }
          messages.push({
            role: 'tool',
            tool_call_id: tc.id || tc.name,
            content: JSON.stringify(payload).slice(0, 8000),
          });
        }
      }
      // estourou o limite de rounds: força resposta final sem tools
      const final = await llm.complete({ model: M.deep, reasoningEffort: 'low', messages });
      track(final.usage, M.deep, usage);
      return { text: final.text, toolCalls: executed, evidence };
    });
  }

  // ── VERIFY: judge de groundedness em runtime ─────────────────────────────
  async function runVerify(turn, result, trace, usage) {
    try {
      return await trace.span('verify', {}, async () => {
        const r = await llm.complete({
          model: M.judge,
          jsonMode: true,
          reasoningEffort: 'minimal',
          messages: [{ role: 'user', content: judgePrompt(turn.message, { evidence: result.evidence, context: Boolean(turn.systemContext) }, result.text) }],
        });
        track(r.usage, M.judge, usage);
        let parsed = {};
        try { parsed = JSON.parse(r.text || '{}'); } catch { /* defensivo */ }
        const score = Number(parsed.score);
        if (!Number.isFinite(score)) return null;
        const clamped = Math.min(1, Math.max(0, score));
        metrics.observeJudgeScore('groundedness', clamped);
        return { score: clamped, reason: String(parsed.reason || '') };
      });
    } catch {
      return null; // judge nunca derruba o turno
    }
  }

  return { runTurn };
}

function wrap(output) {
  return output && typeof output === 'object' ? output : { value: output };
}
