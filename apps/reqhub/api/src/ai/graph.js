// ai/graph.js — chat de autoria pelo MOTOR DE GRAFO da plataforma (@flavioneto11/ai-core).
//   turn -> ROUTER (nano) -> deep/especialista "authoring" (loop ReAct com tools R1) -> VERIFY (judge)
// O reply e o TEXTO do grafo (curto, cadenciado pelo prompt); o draft sai do OUTPUT da tool
// propose_requirement_draft (em result.evidence) e as citations dos search/get — canais separados,
// sem duplicacao. Decisao via LLM; o codigo so monta contexto e extrai. R1: nao escreve git.
import { createAiGraph, AiToolError } from '@flavioneto11/ai-core';
import { getLlm, DEFAULT_MODEL, aiProvider } from '../llm.js';
import { buildChatTools } from './tools.js';
import { PROMPTS } from '../prompts.js';

// Modelo "barato" (router/synth/judge) por provider — o adapter é ÚNICO, então TODOS os
// estágios do grafo precisam falar o modelo do provider ativo (Claude não conhece gpt-5-nano).
const CHEAP = () => (aiProvider() === 'anthropic' ? 'claude-haiku-4-5-20251001' : 'gpt-5-nano');
const ROUTER = () => process.env.REQHUB_AI_ROUTER_MODEL || CHEAP();
const JUDGE = () => process.env.REQHUB_AI_JUDGE_MODEL || CHEAP();

let _graph = null;

// memory: F3 injeta { threadStore, summarizer, userMemory }; sem isso o grafo usa turn.history.
export async function getChatGraph(memory = {}) {
  if (_graph) return _graph;
  const llm = await getLlm();
  if (!llm) return null;
  _graph = createAiGraph({
    llm,
    registry: buildChatTools(),
    specialists: [{ id: 'authoring', description: 'autoria de requisitos de UM produto: responder duvidas citando IDs reais, e propor UM rascunho testavel quando o operador descreve uma capacidade/mudanca', systemPrompt: PROMPTS.authoringChat.system }],
    models: { router: ROUTER(), deep: DEFAULT_MODEL(), synth: ROUTER(), judge: JUDGE() },
    memory,
    verify: (process.env.REQHUB_AI_VERIFY || 'on').toLowerCase() !== 'off',
    judgeThreshold: 0.6,
    routerContext: PROMPTS.authoringChat.routerContext,
    // Garante o caminho DEEP do especialista (prompt + tools + grounding) em TODO turno não-trivial,
    // sem depender do acerto do router barato (que sub-roteava autoria p/ fast). Rollback: REQHUB_AI_FORCE_AUTHORING=off.
    forceSpecialist: (process.env.REQHUB_AI_FORCE_AUTHORING || 'on').toLowerCase() !== 'off' ? 'authoring' : null,
  });
  return _graph;
}

export function __resetGraphForTest() { _graph = null; }

const arr = (v) => (Array.isArray(v) ? v : []);
const idsFrom = (out) => {
  if (!out || typeof out !== 'object') return [];
  if (Array.isArray(out.results)) return out.results.map((r) => r && r.id).filter(Boolean);
  if (out.id && !out.error) return [out.id];
  return [];
};

// Extrai o contrato { reply, draft, citations, intent, next_question, grounded, quick_replies }
// de um GraphResult — SEM duplicacao (prosa = text; draft/citations = evidence).
export function extractChatResult(result, { product, target_req_id, grounding } = {}) {
  const ev = arr(result && result.evidence);
  const draftEv = [...ev].reverse().find((e) => e && e.tool === 'propose_requirement_draft');
  const draft = draftEv && draftEv.output && typeof draftEv.output === 'object' ? draftEv.output : null;
  const known = new Set(arr(grounding).map((r) => r && r.id).filter(Boolean));
  const seen = new Set();
  const citations = ev
    .filter((e) => e && (e.tool === 'search_requirements' || e.tool === 'get_requirement'))
    .flatMap((e) => idsFrom(e.output))
    .filter((id) => known.has(id) && !seen.has(id) && seen.add(id));
  const reply = String((result && result.text) || '').trim();
  const isQuestionEnd = !draft && /[?？]\s*$/.test(reply);
  const intent = draft
    ? (target_req_id && known.has(target_req_id) ? 'edit' : 'create')
    : (isQuestionEnd ? 'clarify' : 'question');
  return {
    prompt_version: PROMPTS.authoringChat.version,
    intent,
    reply,
    next_question: '', // no grafo a pergunta vai inline no reply (curto); o card e so para draft
    citations,
    grounded: citations.length > 0 || Boolean(draft),
    draft,
    quick_replies: [],
    route: (result && result.route) || null,
    judge: (result && result.judge) || null,
    usage: (result && result.usage) || null,
  };
}

// Executa um turno do chat de autoria pelo grafo. memory (F3) e opcional.
// Monta o systemContext do chat: PERSONA/cadência (mesma do specialist, como rede de segurança caso o
// turno caia no fast-path) + ARQUITETURA/STACK + RESUMO dos requisitos. É o que faltava para o chat
// CONHECER a stack (e parar de perguntar "qual framework") e situar os requisitos por contexto.
function buildChatSystemContext({ product, target_req_id, grounding, arch_summary } = {}) {
  const parts = [
    PROMPTS.authoringChat.system,
    `PRODUTO: ${product || '(nao informado)'}` + (target_req_id ? `\nREFINANDO O REQUISITO: ${target_req_id}` : ''),
  ];
  const archTxt = String(arch_summary || '').trim();
  if (archTxt) parts.push(`ARQUITETURA/STACK DO SISTEMA (responda sobre tecnologia com base nisto; NAO pergunte o que ja esta aqui):\n${archTxt.slice(0, 1500)}`);
  const reqs = arr(grounding).filter((r) => r && r.id).slice(0, 40);
  if (reqs.length) {
    const lines = reqs
      .map((r) => `- ${r.id} | ${String(r.title || '').slice(0, 80)} | ${String(r.statement || '').slice(0, 240)}`)
      .join('\n');
    parts.push(`REQUISITOS EXISTENTES DO PRODUTO (${reqs.length}; para detalhe/confirmacao use as tools search_requirements/get_requirement):\n${lines}`);
  }
  return parts.join('\n\n');
}

export async function runAuthoringChatTurn({ product, message, history, target_req_id, grounding, arch_summary, identity } = {}, memory) {
  const graph = await getChatGraph(memory);
  if (!graph) throw new AiToolError('AI_DISABLED', 'OPENAI_API_KEY nao configurado; chat de IA desabilitado');
  const sys = buildChatSystemContext({ product, target_req_id, grounding, arch_summary });
  const result = await graph.runTurn({
    message: String(message || ''),
    history: arr(history).filter((m) => m && !m.error).map((m) => ({ role: m.role, content: String(m.content || '') })),
    systemContext: sys,
    threadId: `chat:${product || 'x'}:${(identity && identity.sub) || 'anon'}`,
    identity: identity || { sub: 'operator' },
    channel: 'inapp',
    toolContext: { product, target_req_id, grounding: arr(grounding) },
  });
  return extractChatResult(result, { product, target_req_id, grounding });
}
