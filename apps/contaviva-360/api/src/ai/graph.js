// ai/graph.js — Grafo de IA do assistente contábil (contaviva-360).
// router → especialista "contabil" (loop ReAct com tools R1) → judge.
// Fail-closed: sem LLM → lança AiToolError (caller responde 503).
import { createAiGraph, AiToolError } from '@flavioneto11/ai-core';
import { getLlm, DEFAULT_MODEL, CHEAP_MODEL, aiProvider } from './llm.js';
import { buildAccountingTools } from './tools.js';
import { PROMPTS, getPromptSource } from './prompts.js';

const ROUTER = () => process.env.CONTAVIVA_AI_ROUTER_MODEL || CHEAP_MODEL();
const JUDGE  = () => process.env.CONTAVIVA_AI_JUDGE_MODEL  || CHEAP_MODEL();

// Cache do grafo por tenant (evita criar um grafo por request)
const _graphs = new Map();

export async function getChatGraph({ pool, tenantId, memory = {} } = {}) {
  const key = `${tenantId}`;
  if (_graphs.has(key)) return _graphs.get(key);
  const llm = await getLlm();
  if (!llm) return null;
  const registry = buildAccountingTools(pool);
  const promptSource = await getPromptSource();
  const systemPrompt = await promptSource.resolve('contabil-system').catch(() => PROMPTS.contabilSystem.system);
  const graph = createAiGraph({
    llm,
    registry,
    specialists: [{
      id: 'contabil',
      description: 'Assistente contábil: responde perguntas sobre finanças PF/PJ, calcula impostos, gera rascunhos de declarações e cita fontes dos dados do usuário.',
      systemPrompt,
    }],
    models: { router: ROUTER(), deep: DEFAULT_MODEL(), synth: ROUTER(), judge: JUDGE() },
    memory,
    verify: (process.env.CONTAVIVA_AI_VERIFY || 'on').toLowerCase() !== 'off',
    judgeThreshold: 0.6,
    routerContext: PROMPTS.contabilSystem.routerContext,
    forceSpecialist: (process.env.CONTAVIVA_AI_FORCE_SPECIALIST || 'on').toLowerCase() !== 'off' ? 'contabil' : null,
  });
  _graphs.set(key, graph);
  return graph;
}

export function __resetGraphForTest() { _graphs.clear(); }

// Extrai { answer, citations, draft, tools_used } do GraphResult
export function extractChatResult(result) {
  const ev = Array.isArray(result?.evidence) ? result.evidence : [];

  // Draft: última chamada a gera_rascunho com _pendente_confirmacao
  const draftEv = [...ev].reverse().find((e) => e?.tool === 'gera_rascunho' && e?.output?._pendente_confirmacao);
  const draft = draftEv?.output?.draft || null;
  const draftId = draftEv?.output?.draft_id || null;

  // Citations: saídas de cita_fonte com record válido
  const citations = ev
    .filter((e) => e?.tool === 'cita_fonte' && e?.output?.citado === true)
    .map((e) => ({ source_type: e.output.source_type, source_id: e.output.source_id, record: e.output.record, descricao: e.output.descricao_citacao }));

  // Tools usados
  const tools_used = ev.map((e) => e?.tool).filter(Boolean);

  return {
    answer: String(result?.text || '').trim(),
    citations,
    draft: draft ? { draft_id: draftId, ...draft } : null,
    tools_used,
    grounded: citations.length > 0 || Boolean(draft),
    route: result?.route || null,
    judge: result?.judge || null,
    usage: result?.usage || null,
  };
}

// Executa um turno do assistente contábil
export async function runAssistantTurn({ pool, tenantId, message, history = [], conversationId, userContent, identity } = {}, memory) {
  const graph = await getChatGraph({ pool, tenantId, memory });
  if (!graph) throw new AiToolError('AI_DISABLED', 'Assistente de IA desabilitado (sem chave configurada)');

  const result = await graph.runTurn({
    message: String(message || ''),
    history: (history || []).filter((m) => m && !m.error).map((m) => ({ role: m.role, content: String(m.content || '') })),
    systemContext: `Tenant: ${tenantId || 1}. Use as tools para consultar dados reais deste tenant.`,
    threadId: conversationId ? `contaviva:${tenantId}:${conversationId}` : undefined,
    identity: identity || { sub: String(tenantId || 'anon') },
    channel: 'inapp',
    toolContext: { tenantId: tenantId || 1 },
    userContent,
  });

  return extractChatResult(result);
}
