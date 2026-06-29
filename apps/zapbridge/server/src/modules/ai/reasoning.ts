// =============================================================================
// Motor de RACIOCÍNIO ADAPTATIVO do assistente do ZapBridge.
// -----------------------------------------------------------------------------
// Em vez de um ReAct linear de N rodadas, orquestra papéis distintos que iteram
// até a resposta ser suficiente, ajustando a PROFUNDIDADE pela COMPLEXIDADE da
// pergunta e pela MEMÓRIA de contexto:
//
//   0. CONTEXTO   carrega thread (histórico + resumo) + memória longa (fatos/estilo)
//   1. TRIAGEM    classifica complexidade/intenção e define o ORÇAMENTO de coleta
//   2. PLANO      (só complexo) decompõe em sub-objetivos + tools a consultar
//   3. COLETA     loop ReAct guiado pelo plano: o modelo escolhe a próxima tool
//                 (leitura executa; escrita vira PRÉVIA), acumulando EVIDÊNCIA
//   4. REFLEXÃO   crítico avalia se a evidência basta; se não, aponta lacunas e
//                 volta à COLETA (até o teto de ciclos)
//   5. SÍNTESE    resposta final ANCORADA na evidência + estilo do usuário (markdown)
//   6. MEMÓRIA    grava o turno (thread) + extrai fatos do usuário (async)
//
// Reusa: ai.service (Claude+OpenAI, fail-soft), tools (registry + dispatchTool),
// memória durável (threadStore/rollingSummarizer/userMemory pgvector). Provider-
// agnóstico via chatJSON/chatText (não depende do function-calling nativo).
// =============================================================================
import type { LlmAdapter } from '@flavioneto11/ai-core';
import { env } from '../../config/env';
import { query } from './pg';
import { callAI, chatJSON, chatText, streamText, getClient, activeProvider, getEmbedder } from './ai.service';
import { getAiMetrics } from './ai-metrics';
import { loadAiCore } from './ai-core-loader';
import { ALL_TOOLS, TOOL_BY_NAME } from './tools';
import { signPendingAction } from './pending-actions';
import { SYNTH_SYSTEM_PROMPT } from './prompts';

export interface ReasoningCallbacks {
  onProgress?: (phase: string, detail: string) => void;
  onDelta?: (chunk: string) => void;
}

// Rótulo amigável do que a coleta está fazendo (feedback progressivo).
function progressLabelFor(tool: string, args: any): string {
  if (tool === 'list_chats') return 'Listando suas conversas…';
  if (tool === 'get_recent_messages') return `Lendo ${args?.chat ?? args?.chatId ?? 'a conversa'}…`;
  if (tool === 'search_history_semantic') return 'Buscando no seu histórico…';
  if (tool === 'search_knowledge') return 'Consultando a base de conhecimento…';
  if (tool === 'send_message') return `Preparando uma mensagem para ${args?.chat ?? 'a conversa'}…`;
  return `Executando ${tool}…`;
}

// ---- modelos por papel ------------------------------------------------------
const isAnthropic = () => activeProvider() === 'anthropic';
const mainModel = () => (isAnthropic() ? env.ai.anthropicModel || 'claude-sonnet-4-6' : process.env.OPENAI_MODEL?.trim() || 'gpt-5');
const cheapModel = () => (isAnthropic() ? 'claude-haiku-4-5-20251001' : 'gpt-5-nano');

// ---- memória durável (lazy) -------------------------------------------------
let _memLlm: LlmAdapter | null = null;
let _threadStore: { get: Function; appendTurn: Function; put: Function } | null = null;
let _summarizer: { needsCompaction: Function; compact: Function } | null = null;
let _userMemory: { recall: Function; store: (u: string, f: Array<{ kind?: string; content: string }>) => Promise<number> } | null = null;

async function ensureMemory(): Promise<void> {
  if (_threadStore) return;
  const client = getClient();
  if (!client) return;
  const core = await loadAiCore();
  _memLlm = core.createLlm({ provider: activeProvider(), client, defaultModel: mainModel() });
  _threadStore = core.createThreadStore({ query }) as never;
  _summarizer = core.createRollingSummarizer({ llm: _memLlm!, keepRecent: 8, triggerAt: 16 }) as never;
  const emb = getEmbedder();
  if (emb) {
    const embedder = core.createEmbedder({ embedFn: (t: string[]) => emb.embedFn(t), dimensions: 1536 });
    _userMemory = core.createUserMemory({ query, embedder, ttlDays: 180 }) as never;
  }
}

// ---- catálogo de tools p/ os prompts ---------------------------------------
function toolsDoc(): string {
  return ALL_TOOLS.map((t) => {
    const props = (t.parameters as any)?.properties ?? {};
    const args = Object.entries(props).map(([k, v]) => `${k}${(v as any)?.description ? ` (${(v as any).description})` : ''}`).join(', ');
    return `- ${t.name}(${args || ''})${t.mutates ? ' [ação: gera PRÉVIA, confirmada pelo usuário]' : ''}: ${t.description}`;
  }).join('\n');
}

function clip(v: unknown, max = 1400): string {
  const s = typeof v === 'string' ? v : JSON.stringify(v);
  return s.length > max ? s.slice(0, max) + '…' : s;
}

// ---- tipos ------------------------------------------------------------------
interface EvidenceItem { tool: string; args: unknown; status: string; output: unknown }
export interface ReasoningResult {
  text: string;
  route: string;
  complexity: string;
  proposed: boolean;
  proposals: Array<{ token: string; name: string; arguments: Record<string, unknown> }>;
  citations: EvidenceItem[];
  meta: { toolCalls: number; reflectCycles: number; budget: number };
}

// ---- orçamento por complexidade --------------------------------------------
function budgetFor(complexity: string): { gather: number; reflect: number } {
  if (complexity === 'complex') return { gather: 8, reflect: 2 };
  if (complexity === 'simple') return { gather: 3, reflect: 1 };
  return { gather: 0, reflect: 0 }; // trivial
}

// =============================================================================
export async function runReasoning(
  turn: { message: string; userId: string; sessionId: string },
  cb: ReasoningCallbacks = {},
): Promise<ReasoningResult> {
  const { message, userId, sessionId } = turn;
  if (!getClient()) throw Object.assign(new Error('Assistente de IA indisponível (sem chave)'), { status: 503 });
  const progress = (phase: string, detail: string) => {
    try {
      cb.onProgress?.(phase, detail);
    } catch {
      /* ignore */
    }
  };
  progress('contexto', 'Lembrando do contexto…');
  await ensureMemory();
  const metrics = getAiMetrics();
  const toolCtx = { identity: { sub: userId }, userId, sessionId, channel: 'whatsapp' } as Record<string, unknown>;
  const threadId = `chat:${userId}`;

  // 0. CONTEXTO -------------------------------------------------------------
  const thread = _threadStore ? await _threadStore.get(threadId).catch(() => null) : null;
  const historyMsgs: Array<{ role: string; content: string }> = thread?.messages?.slice(-8) ?? [];
  const summary: string = thread?.rollingSummary ?? '';
  const facts: Array<{ content: string }> = _userMemory
    ? ((await _userMemory.recall(userId, message, { k: 6, minScore: 0.2 }).catch(() => [])) as Array<{ content: string }>)
    : [];
  const factsBlock = facts.length ? `O que você sabe do usuário:\n${facts.map((f) => `- ${f.content}`).join('\n')}` : '';
  const historyBlock = historyMsgs.length
    ? `Conversa recente com o assistente:\n${historyMsgs.map((m) => `${m.role}: ${clip(m.content, 300)}`).join('\n')}`
    : '';
  const memoryBlock = [summary && `Resumo do que já conversamos: ${summary}`, historyBlock, factsBlock].filter(Boolean).join('\n\n');

  // 1. TRIAGEM --------------------------------------------------------------
  progress('triagem', 'Entendendo o pedido…');
  const triagePrompt = [
    'Classifique o PEDIDO do usuário para um assistente que age sobre o WhatsApp DELE.',
    'complexity: "trivial" (saudação/social, ou já respondível pelo histórico) | "simple" (1 fato/1 conversa) | "complex" (várias conversas, análise, "tem algo urgente em tudo", planejar/comparar).',
    'needs_tools: precisa consultar conversas/mensagens/contatos/base? (saudação/agradecimento = false)',
    memoryBlock,
    `Pedido: ${message}`,
    'Responda APENAS JSON: {"complexity":"...","needs_tools":true|false,"reason":"<frase>"}',
  ].filter(Boolean).join('\n\n');
  const triage = (await callAI((c) => chatJSON(c, triagePrompt, cheapModel()), {}, { stage: 'reason.triage' })) as any;
  const complexity = ['trivial', 'simple', 'complex'].includes(triage?.complexity) ? triage.complexity : 'simple';
  const needsTools = triage?.needs_tools !== false && complexity !== 'trivial';
  const budget = budgetFor(complexity);

  // Caminho curto: sem tools → responde direto do contexto/memória (com streaming).
  if (!needsTools) {
    progress('sintese', 'Respondendo…');
    const text = await streamText(
      [
        { role: 'system', content: `${SYNTH_SYSTEM_PROMPT}\n\n${memoryBlock}` },
        { role: 'user', content: message },
      ],
      mainModel(),
      cb.onDelta,
    );
    await persist(threadId, message, text || 'Desculpe, não consegui responder agora.');
    return { text: text || 'Desculpe, não consegui responder agora.', route: 'direct', complexity, proposed: false, proposals: [], citations: [], meta: { toolCalls: 0, reflectCycles: 0, budget: 0 } };
  }

  // 2. PLANO (complexo) -----------------------------------------------------
  let plan = '';
  if (complexity === 'complex') {
    progress('plano', 'Planejando o que consultar…');
    const planPrompt = [
      'Você é o PLANEJADOR. Para o pedido abaixo, liste de 2 a 4 passos objetivos de COLETA usando as tools — quais conversas/buscas consultar e por quê. Não responda ao usuário ainda.',
      `Tools:\n${toolsDoc()}`,
      memoryBlock,
      `Pedido: ${message}`,
      'Responda APENAS JSON: {"steps":["...","..."]}',
    ].filter(Boolean).join('\n\n');
    const p = (await callAI((c) => chatJSON(c, planPrompt, mainModel()), { steps: [] }, { stage: 'reason.plan' })) as any;
    const steps: string[] = Array.isArray(p?.steps) ? p.steps.map((s: unknown) => String(s)) : [];
    plan = steps.length ? `Plano:\n${steps.map((s, i) => `${i + 1}. ${s}`).join('\n')}` : '';
  }

  // 3+4. COLETA + REFLEXÃO --------------------------------------------------
  const evidence: EvidenceItem[] = [];
  const proposals: ReasoningResult['proposals'] = [];
  let gatherLeft = budget.gather;
  let reflectLeft = budget.reflect;
  let gaps = '';

  const { dispatchTool } = await loadAiCore();

  while (gatherLeft > 0) {
    const gatherPrompt = [
      'Você é o COLETOR. Decida a PRÓXIMA ação para reunir a evidência necessária. Use NOMES de conversas (ex.: "Cognição"). Pode pedir VÁRIAS tools de uma vez.',
      `Tools:\n${toolsDoc()}`,
      plan,
      gaps && `Lacunas a cobrir agora: ${gaps}`,
      evidence.length ? `Evidência já coletada:\n${evidence.map((e, i) => `[${i}] ${e.tool}(${clip(e.args, 120)}) -> ${clip(e.output, 700)}`).join('\n')}` : 'Ainda sem evidência.',
      memoryBlock,
      `Pedido: ${message}`,
      'Se já há evidência suficiente, responda {"action":"answer"}. Senão {"action":"use_tools","tools":[{"tool":"<nome>","args":{...}}]}. APENAS JSON.',
    ].filter(Boolean).join('\n\n');

    const decision = (await callAI((c) => chatJSON(c, gatherPrompt, mainModel()), { action: 'answer' }, { stage: 'reason.gather' })) as any;

    if (decision?.action !== 'use_tools' || !Array.isArray(decision?.tools) || !decision.tools.length) {
      // modelo acha que basta → REFLEXÃO
      if (reflectLeft <= 0) break;
      reflectLeft--;
      progress('reflexao', 'Verificando se falta algo…');
      const reflectPrompt = [
        'Você é o CRÍTICO. A evidência abaixo é suficiente para responder BEM e ANCORADO ao pedido? Se faltar algo essencial, aponte.',
        evidence.length ? evidence.map((e, i) => `[${i}] ${e.tool} -> ${clip(e.output, 600)}`).join('\n') : '(sem evidência)',
        `Pedido: ${message}`,
        'Responda APENAS JSON: {"sufficient":true|false,"missing":["<lacuna>"]}',
      ].join('\n\n');
      const crit = (await callAI((c) => chatJSON(c, reflectPrompt, cheapModel()), { sufficient: true }, { stage: 'reason.reflect' })) as any;
      if (crit?.sufficient !== false || !Array.isArray(crit?.missing) || !crit.missing.length) break;
      gaps = crit.missing.map((m: unknown) => String(m)).join('; ');
      continue; // volta à coleta para cobrir as lacunas
    }

    // executa as tools pedidas (leitura executa; escrita vira preview)
    for (const call of decision.tools.slice(0, 4)) {
      if (gatherLeft <= 0) break;
      const tool = TOOL_BY_NAME.get(String(call?.tool));
      if (!tool) { evidence.push({ tool: String(call?.tool), args: call?.args ?? {}, status: 'unknown', output: { error: 'tool desconhecida' } }); continue; }
      progress('coleta', progressLabelFor(tool.name, call?.args));
      try {
        const out = await dispatchTool(tool, call?.args ?? {}, toolCtx as never);
        evidence.push({ tool: tool.name, args: call?.args ?? {}, status: out.status, output: out.output });
        metrics.countToolCall(tool.name, out.status);
        if (out.status === 'preview') {
          const args = (call?.args ?? {}) as Record<string, unknown>;
          proposals.push({ token: signPendingAction({ toolName: tool.name, arguments: args, userId, chatJid: String(args.chat ?? args.chatId ?? '') }), name: tool.name, arguments: args });
        }
      } catch (e) {
        evidence.push({ tool: tool.name, args: call?.args ?? {}, status: 'error', output: { error: String((e as Error)?.message ?? e) } });
        metrics.countToolCall(tool.name, 'error');
      }
      gatherLeft--;
    }
    gaps = '';
  }

  // 5. SÍNTESE (redator puro + STREAMING) -----------------------------------
  progress('sintese', 'Escrevendo a resposta…');
  const synthSystem = [
    SYNTH_SYSTEM_PROMPT,
    memoryBlock,
    evidence.length
      ? `EVIDÊNCIA COLETADA (use SÓ isto como fonte de fatos; cite as conversas pelo nome):\n${evidence.map((e, i) => `[${i}] ${e.tool}(${clip(e.args, 120)}) -> ${clip(e.output, 1200)}`).join('\n')}`
      : 'Não foi possível coletar evidência das conversas — explique isso ao usuário em 1 linha.',
    proposals.length ? `Você PROPÔS ${proposals.length} ação(ões) que aguardam confirmação do usuário — mencione-as no fim.` : '',
  ].filter(Boolean).join('\n\n');
  const text = await streamText(
    [
      { role: 'system', content: synthSystem },
      ...historyMsgs.map((m) => ({ role: m.role as 'user' | 'assistant', content: clip(m.content, 400) })),
      { role: 'user', content: message },
    ],
    mainModel(),
    cb.onDelta,
  );

  const finalText = text || 'Não consegui montar a resposta agora — tente novamente.';
  // 6. MEMÓRIA --------------------------------------------------------------
  await persist(threadId, message, finalText);

  return {
    text: finalText,
    route: complexity === 'complex' ? 'deep' : 'reason',
    complexity,
    proposed: proposals.length > 0,
    proposals,
    citations: evidence.slice(0, 8),
    meta: { toolCalls: evidence.length, reflectCycles: budget.reflect - reflectLeft, budget: budget.gather },
  };
}

// Grava o turno na thread + compacta (rolling summary) + extrai fatos do usuário (async).
async function persist(threadId: string, userMessage: string, assistantMessage: string): Promise<void> {
  if (!_threadStore) return;
  try {
    let state = await _threadStore.appendTurn(threadId, userMessage, assistantMessage, { maxMessages: 40 });
    if (_summarizer && _summarizer.needsCompaction(state)) {
      state = await _summarizer.compact(state);
      await _threadStore.put(threadId, state);
    }
  } catch {
    /* fail-soft */
  }
  // memória longa (fatos/estilo) a partir do turno
  if (_userMemory && _memLlm) {
    const userId = threadId.replace(/^chat:/, '');
    const core = await loadAiCore();
    void core
      .extractMemoryFacts({ llm: _memLlm, conversationText: `user: ${userMessage}\nassistant: ${assistantMessage}` })
      .then((f) => (f.length ? _userMemory!.store(userId, f) : 0))
      .catch(() => undefined);
  }
}

// ---- estilo do usuário (consumido pelo smart-reply) ------------------------
export async function recallUserStyle(userId: string, queryText: string): Promise<Array<{ content: string }>> {
  try {
    await ensureMemory();
    if (!_userMemory) return [];
    return ((await _userMemory.recall(userId, queryText, { k: 5, minScore: 0.25 })) as Array<{ content: string }>) ?? [];
  } catch {
    return [];
  }
}

export async function learnStyleFrom(userId: string, sentTexts: string[]): Promise<void> {
  if (!sentTexts.length) return;
  try {
    await ensureMemory();
    if (!_userMemory || !_memLlm) return;
    const core = await loadAiCore();
    const f = await core.extractMemoryFacts({ llm: _memLlm, conversationText: sentTexts.slice(0, 20).map((t) => `user: ${t}`).join('\n'), maxFacts: 4 });
    if (f.length) await _userMemory.store(userId, f);
  } catch {
    /* fail-soft */
  }
}
