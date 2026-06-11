// conversation-engine-ai-core.ts — motor alternativo do turno conversacional (F4).
//
// O grafo padrão da plataforma (`@flavioneto11/ai-core`, modo proposeTools) roda o
// PLANEJAMENTO do turno do SICAT atrás da flag CONVERSATION_ENGINE=ai-core:
//
//   ROUTER (gpt-5-nano, com contexto de intents do SICAT) classifica complexidade
//     ├─ trivial/simple → FAST-PATH: resposta conversacional (working memory + RAG)
//     │                   verificada pelo JUDGE em runtime; reprovou → planner legado
//     └─ complex       → especialista do SICAT:
//                          deep "propose" HABILITADO p/ o especialista → 1 rodada de
//                            function calling propõe a tool (NUNCA executa) com authz
//                            por IDENTIDADE no contrato AiTool; o pipeline do app
//                            (policy/dispatch/síntese/guardrails) segue intacto;
//                          senão → planner LEGADO (LangGraph focado, inalterado).
//
// Regras de segurança: QUALQUER falha do engine cai no provider legado (nunca quebra
// o turno); propostas de ação passam por downgradeUnconfirmedBatchActionToPreview
// (ação em lote sem confirmação vira preview) e pelo policy service downstream.
//
// Rollout (specialist-a-specialist):
//   CONVERSATION_ENGINE=ai-core|legacy            (default legacy)
//   CONVERSATION_ENGINE_DEEP=off|propose          (default off → complex vai ao legado)
//   CONVERSATION_ENGINE_SPECIALISTS=catalog,operations  (deep propose só p/ esses)
//   CONVERSATION_ENGINE_VERIFY=on|off             (judge do fast-path; default on)

import { AIMessage, HumanMessage, SystemMessage, ToolMessage } from '@langchain/core/messages';
import type { ChatOpenAI } from '@langchain/openai';
import { createAiGraph, createToolRegistry } from '@flavioneto11/ai-core';
import { aiMetrics } from '../../lib/ai-metrics.js';
import { createChatModel, getAiConfig } from './ai-config.js';
import { retrieveKnowledge, buildKnowledgeContextBlock } from './knowledge/conversation-knowledge-service.js';
import { listConversationSpecialists, type ConversationSpecialist } from './agents/conversation-specialists.js';
import { resolveRuntimeAgentText, getRuntimeToolsVersion } from '../ai-control/ai-runtime-registry-service.js';
import {
  buildSystemPrompt,
  createLlmProvider,
  downgradeUnconfirmedBatchActionToPreview,
  getRuntimeConversationToolSchemas,
  type LlmPlan,
  type LlmPlanningInput,
  type LlmProvider
} from './llm-provider.js';

type LooseRecord = Record<string, unknown>;

// O objeto de contexto que chega ao plan() carrega mais campos em runtime do que
// o tipo público (identidade/canal vêm do buildConversationContext do service).
type EngineContext = LlmPlanningInput['context'] & {
  requestedBy?: string | null;
  channel?: string | null;
};

// ─── Flags ───────────────────────────────────────────────────────────────────

function engineDeepMode(): 'off' | 'propose' {
  return (process.env.CONVERSATION_ENGINE_DEEP || 'off').trim().toLowerCase() === 'propose' ? 'propose' : 'off';
}

function engineDeepSpecialists(): Set<string> {
  const raw = (process.env.CONVERSATION_ENGINE_SPECIALISTS || 'catalog,operations').trim();
  return new Set(raw.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean));
}

function engineVerifyEnabled(): boolean {
  return (process.env.CONVERSATION_ENGINE_VERIFY || 'on').trim().toLowerCase() !== 'off';
}

function engineRouterModel(): string {
  return (process.env.CONVERSATION_ENGINE_ROUTER_MODEL || 'gpt-5-nano').trim();
}

const JUDGE_THRESHOLD = 0.45;

/** Resolve o provider conforme CONVERSATION_ENGINE (seam único usado pelo service). */
export function resolveLlmProvider(): LlmProvider {
  const legacy = createLlmProvider();
  const engine = (process.env.CONVERSATION_ENGINE || 'legacy').trim().toLowerCase();
  if (engine !== 'ai-core') return legacy;
  console.log(
    `[conversation] engine: ai-core (router=${engineRouterModel()}, deep=${engineDeepMode()}, ` +
    `deepSpecialists=${[...engineDeepSpecialists()].join('|') || 'nenhum'}, verify=${engineVerifyEnabled() ? 'on' : 'off'})`
  );
  return createAiCoreLlmProvider(legacy);
}

// ─── Adapter LLM (ai-core ← LangChain ChatOpenAI, contrato gpt-5 do ai-kit) ──

type EngineLlmRequest = {
  model?: string;
  messages: Array<LooseRecord>;
  tools?: Array<{ name: string; description: string; parameters?: LooseRecord }>;
  jsonMode?: boolean;
  reasoningEffort?: string;
};

function toLangChainMessages(messages: Array<LooseRecord>) {
  return messages.map((m) => {
    const role = String(m.role || 'user');
    const content = typeof m.content === 'string' ? m.content : m.content == null ? '' : JSON.stringify(m.content);
    if (role === 'system') return new SystemMessage(content);
    if (role === 'assistant') return new AIMessage({ content, tool_calls: (m.tool_calls as never) || undefined });
    if (role === 'tool') return new ToolMessage({ content, tool_call_id: String(m.tool_call_id || '') });
    return new HumanMessage(content);
  });
}

function createEngineLlm() {
  const cache = new Map<string, ChatOpenAI>();
  function modelFor(model: string, effort: string): ChatOpenAI {
    const key = `${model}:${effort}`;
    const cached = cache.get(key);
    if (cached) return cached;
    const config = getAiConfig();
    const llm = createChatModel(model, config.openAiApiKey, effort);
    cache.set(key, llm);
    return llm;
  }
  return {
    async complete({ model, messages, tools, reasoningEffort }: EngineLlmRequest) {
      const llm = modelFor(model || engineRouterModel(), reasoningEffort || 'minimal');
      const runnable = tools?.length
        ? llm.bindTools(tools.map((t) => ({
            type: 'function' as const,
            function: { name: t.name, description: t.description, parameters: t.parameters || { type: 'object', properties: {} } }
          })))
        : llm;
      const res = (await runnable.invoke(toLangChainMessages(messages))) as AIMessage;
      const text = typeof res.content === 'string' ? res.content : JSON.stringify(res.content ?? '');
      const toolCalls = (res.tool_calls || []).map((tc) => ({
        id: tc.id,
        name: tc.name,
        arguments: (tc.args || {}) as LooseRecord
      }));
      return { text, toolCalls, usage: res.usage_metadata ?? null };
    }
  };
}

// ─── Adapter das tools (contrato AiTool: authz por IDENTIDADE na proposta) ──
// Em proposeTools o grafo NUNCA executa — execute() existe só para honrar o
// contrato. A autorização real de execução continua no policy service; aqui a
// regra adicional é: a IA não PROPÕE ação sem identidade + conta CETESB ativa.

const MUTATING_TOOLS: Record<string, 'R3' | 'R4'> = {
  submit_manifest: 'R3',
  print_manifest: 'R3',
  replicate_manifest: 'R3',
  enqueue_cdf_download: 'R3',
  orchestrate_manifest_operation: 'R3', // pode carregar intents de ação (downgrade força preview)
  cancel_manifest: 'R4'
};

type EngineAuthzCtx = { identity?: { sub?: string | null } | null; integrationAccountId?: string | null };

function buildEngineToolRegistry() {
  const specialists = listConversationSpecialists();
  const owners = new Map<string, string[]>();
  for (const spec of specialists) {
    for (const toolName of spec.tools) {
      owners.set(String(toolName), [...(owners.get(String(toolName)) || []), spec.id]);
    }
  }
  const tools = getRuntimeConversationToolSchemas().map((schema) => {
    const name = schema.function.name;
    const risk = MUTATING_TOOLS[name];
    const owner = owners.get(name);
    return {
      name,
      description: schema.function.description,
      parameters: schema.function.parameters,
      // tool de 1 especialista só fica visível para ele; compartilhada vira global
      specialist: owner && owner.length === 1 ? owner[0] : undefined,
      risk: risk || ('R1' as const),
      mutates: Boolean(risk),
      supportsDryRun: false,
      authorize: async (ctx: EngineAuthzCtx) => {
        if (!ctx?.identity?.sub) return { allowed: false, reason: 'turno sem identidade de usuario' };
        if (risk && !ctx.integrationAccountId) {
          return { allowed: false, reason: 'acao requer conta CETESB ativa na sessao' };
        }
        return { allowed: true };
      },
      execute: async () => {
        throw new Error(`tool "${name}" e proposta pelo engine; o dispatch e do pipeline do app`);
      }
    };
  });
  return createToolRegistry(tools as never);
}

// ─── Prompts/contexto ────────────────────────────────────────────────────────

function operationalTodayIso(): string {
  try {
    return new Date().toLocaleDateString('en-CA', { timeZone: process.env.SICAT_OPERATIONAL_TIMEZONE || 'America/Sao_Paulo' });
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

function buildRouterContext(specialists: ConversationSpecialist[]): string {
  const intentHints = specialists
    .filter((s) => s.id !== 'conversation')
    .map((s) => `- ${s.id}: ${[...s.intentPrefixes, ...s.intents].slice(0, 12).join(', ')}`)
    .join('\n');
  return (
    'CONTEXTO SICAT (MTR/CETESB): qualquer pedido cuja resposta ideal dependa de NÚMEROS/ESTADO ATUAIS ' +
    'do sistema é "complex" — incluindo análise, estratégia, simulação, risco e diagnóstico. Exemplos que ' +
    'SÃO complex: "resumo do dia", "qual o maior problema operacional", "se eu reenviar esses jobs qual o risco", ' +
    '"faça um diagnóstico da operação", "resolva os erros de hoje", listar/contar/detalhar manifestos, CDF/CDR, ' +
    'DMR, MTR provisório, catálogos, parceiros, jobs/fila, auditoria, dashboard/relatórios, e QUALQUER ação ' +
    '(cancelar/submeter/imprimir/gerar/baixar). ' +
    'Use "trivial" para saudação/agradecimento/social. Use "simple" APENAS para: perguntas sobre a PRÓPRIA ' +
    'conversa (o que pedi antes, resuma o que conversamos), datas relativas, e perguntas PURAMENTE conceituais ' +
    'do domínio (o que é CDF, o que é DMR, fluxo do MTR) que nenhum dado da conta responderia melhor. ' +
    'Na dúvida entre simple e complex, escolha complex.\n' +
    `Intents conhecidas por especialista:\n${intentHints}`
  );
}

function buildFastSystemContext(context: EngineContext, knowledgeBlock: string | null): string {
  return [
    'Voce e o assistente conversacional do SICAT (plataforma MTR/CETESB de residuos). ' +
    `Data operacional atual: ${operationalTodayIso()} (timezone America/Sao_Paulo). ` +
    'Responda de forma natural, util e em portugues, RACIOCINANDO sobre a conversa. ' +
    'Perguntas sobre a PROPRIA interacao (o que o usuario pediu, retomar/resumir/corrigir o que ja foi conversado) devem ser respondidas a partir do historico e da memoria, com honestidade. ' +
    'Para saudacoes, cumprimente e ofereca ajuda. Para datas relativas (hoje/ontem/amanha), calcule a partir da data atual. ' +
    'Perguntas conceituais do dominio: responda com base no CONHECIMENTO abaixo, citando apenas o que estiver nele. ' +
    'NUNCA invente dados operacionais NOVOS (manifestos, status, numeros) que nao estejam no historico/memoria/conhecimento; ' +
    'se o usuario quiser dados da conta, diga que pode consultar e pergunte o que falta. ' +
    'Se o pedido operacional for ambiguo, faca UMA pergunta de esclarecimento objetiva.',
    context.workingMemoryBlock || '',
    knowledgeBlock || ''
  ].filter(Boolean).join('\n\n');
}

function buildGraphSpecialists(context: EngineContext, specialists: ConversationSpecialist[]) {
  const base = buildSystemPrompt(context);
  return specialists.map((spec) => {
    const agentText = resolveRuntimeAgentText(spec.id, { label: spec.label, focus: spec.focus });
    return {
      id: spec.id,
      description: `${agentText.label} — ${agentText.focus}`,
      systemPrompt:
        `${base}\n\nEspecialista ativo: ${agentText.label}. Foco: ${agentText.focus}\n` +
        `Data operacional atual: ${operationalTodayIso()}.\n` +
        'Decida o MELHOR function call para atender o pedido com dado operacional correto e seguro; ' +
        'preserve critérios do usuário (top N, períodos YYYY-MM-DD, recência, filtros) nos argumentos. ' +
        'Se a intenção não estiver clara, responda com UMA pergunta de esclarecimento (sem tool).'
    };
  });
}

function sanitizeEngineHistory(history: LlmPlanningInput['history']) {
  if (!Array.isArray(history)) return [];
  return history
    .filter((h) => h && typeof h.text === 'string' && h.text.trim())
    .slice(-12)
    .map((h) => ({ role: h.role === 'user' ? 'user' : 'assistant', content: h.text.slice(0, 800) }));
}

// ─── Provider ────────────────────────────────────────────────────────────────

export function createAiCoreLlmProvider(legacy: LlmProvider): LlmProvider {
  const llm = createEngineLlm();
  // registry refeito quando o AI Control Center muda tools em runtime
  let registryVersion = -1;
  let registry: ReturnType<typeof buildEngineToolRegistry> | null = null;
  function getRegistry() {
    const version = getRuntimeToolsVersion();
    if (!registry || version !== registryVersion) {
      registry = buildEngineToolRegistry();
      registryVersion = version;
    }
    return registry;
  }

  async function planWithAiCore(input: LlmPlanningInput): Promise<LlmPlan> {
    const config = getAiConfig();
    const context = input.context as EngineContext;
    const text = (typeof input.messageText === 'string' ? input.messageText : '').trim();
    if (!text) return legacy.plan(input);

    // RAG best-effort: alimenta o fast-path (conceitual) e o contexto do deep.
    let knowledgeBlock: string | null = null;
    try {
      knowledgeBlock = buildKnowledgeContextBlock(await retrieveKnowledge(text, { k: 4 })) || null;
    } catch { /* sem RAG o engine segue */ }

    const specialists = listConversationSpecialists();
    const graph = createAiGraph({
      llm,
      registry: getRegistry(),
      specialists: buildGraphSpecialists(context, specialists),
      proposeTools: true,
      routerContext: buildRouterContext(specialists),
      // especialista FORA do rollout do deep: volta delegated logo após o
      // router (sem gastar a rodada do especialista) → planner legado.
      deepFilter: (specialistId: string) =>
        engineDeepMode() === 'propose' && engineDeepSpecialists().has(specialistId.toLowerCase()),
      maxToolRounds: 1,
      verify: engineVerifyEnabled(),
      judgeThreshold: JUDGE_THRESHOLD,
      models: {
        router: engineRouterModel(),
        deep: config.openAiAgentModel,
        synth: config.openAiSynthesisModel,
        judge: engineRouterModel()
      },
      metrics: aiMetrics
    });

    const identity = context.requestedBy ? { sub: String(context.requestedBy) } : undefined;
    const result = await graph.runTurn({
      message: text,
      history: sanitizeEngineHistory(input.history),
      systemContext: buildFastSystemContext(context, knowledgeBlock),
      identity,
      channel: context.channel || 'inapp',
      sessionId: context.conversationSessionId || undefined,
      correlationId: context.auditCorrelationId || undefined,
      toolContext: { integrationAccountId: context.integrationAccountId || null }
    });

    // ── Especialista fora do rollout (deepFilter) → planner legado ────────
    if (result.delegated) {
      return legacy.plan(input);
    }

    // ── Proposta de tool (deep) ────────────────────────────────────────────
    if (result.proposed && result.toolCalls.length > 0) {
      const proposal = result.toolCalls[0];
      if (!proposal?.name) return legacy.plan(input);
      const deepEnabled = engineDeepMode() === 'propose'
        && result.specialist != null
        && engineDeepSpecialists().has(String(result.specialist).toLowerCase());

      if (!deepEnabled) {
        // especialista ainda no planner legado (rollout incremental)
        return legacy.plan(input);
      }

      const tool = getRegistry().get(proposal.name);
      const auth = tool
        ? await tool.authorize({ identity, integrationAccountId: context.integrationAccountId || null } as never)
        : { allowed: false, reason: 'tool desconhecida' };
      if (!auth || (auth as { allowed?: boolean }).allowed !== true) {
        aiMetrics.countToolCall(proposal.name || 'unknown', 'denied_identity');
        return legacy.plan(input); // o legado decide (e o policy bloqueia se for o caso)
      }

      const toolCall = downgradeUnconfirmedBatchActionToPreview({
        name: proposal.name,
        arguments: (proposal.arguments || {}) as LooseRecord
      });

      return {
        provider: 'ai-core',
        confidence: 0.75,
        outputText: result.text || '',
        toolCall,
        agentModelUsed: config.openAiAgentModel,
        synthesisModelUsed: config.openAiSynthesisModel,
        orchestration: {
          classifier: {
            intent: `engine.${result.specialist}`,
            confidence: 0.75,
            entities: {},
            needsClarification: false,
            clarifyingQuestion: null
          },
          planner: {
            outputText: result.text || '',
            toolName: toolCall?.name || null,
            toolArgs: (toolCall?.arguments || {}) as LooseRecord,
            confidence: 0.75,
            needsClarification: false,
            clarifyingQuestion: null
          }
        }
      };
    }

    // ── Resposta textual (fast-path ou deep sem tool) ──────────────────────
    const answer = (result.text || '').trim();
    if (!answer) return legacy.plan(input);
    if (result.judge && result.judge.score < JUDGE_THRESHOLD) {
      // judge reprovou mesmo após a escalation interna do grafo → planner legado
      aiMetrics.countEscalation('engine_low_groundedness_legacy');
      return legacy.plan(input);
    }

    const confidence = result.judge?.score ?? (result.complexity === 'trivial' ? 0.9 : 0.7);
    return {
      provider: 'ai-core',
      confidence,
      outputText: answer,
      toolCall: null,
      agentModelUsed: engineRouterModel(),
      synthesisModelUsed: config.openAiSynthesisModel,
      orchestration: {
        classifier: {
          intent: result.complexity === 'trivial' ? 'greeting' : 'conversation',
          confidence,
          entities: {},
          needsClarification: false,
          clarifyingQuestion: null
        },
        planner: {
          outputText: answer,
          toolName: null,
          toolArgs: {},
          confidence,
          needsClarification: false,
          clarifyingQuestion: null
        }
      }
    };
  }

  return {
    updateWorkingMemory: legacy.updateWorkingMemory
      ? legacy.updateWorkingMemory.bind(legacy)
      : undefined,
    async plan(input: LlmPlanningInput): Promise<LlmPlan> {
      try {
        return await planWithAiCore(input);
      } catch (error) {
        // o engine NUNCA derruba o turno: qualquer falha volta ao provider legado
        aiMetrics.countError('engine', (error as { code?: string })?.code || (error as Error)?.name || 'unknown');
        console.warn('[conversation] engine ai-core falhou; usando planner legado:', (error as Error)?.message || error);
        return legacy.plan(input);
      }
    }
  };
}
