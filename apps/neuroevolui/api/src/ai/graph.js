// ai/graph.js — grafo do assistente clínico (@flavioneto11/ai-core).
//   turn → ROUTER (nano) → fast/synth | deep/clinical-assistant (loop ReAct + tools R1) → VERIFY (judge)
// O texto da resposta sai como result.text; as evidências das tools (RAG citations, rascunhos)
// saem em result.evidence — canais separados. R1: nunca escreve, nunca persiste diretamente.
import { createAiGraph, AiToolError } from '@flavioneto11/ai-core';
import { getLlm, DEFAULT_MODEL, aiProvider } from '../llm.js';
import { buildAssistantTools } from './tools.js';
import { PROMPTS } from './prompts.js';

// Modelo "barato" para router/synth/judge (mesmo provider do adapter ativo).
const CHEAP = () => (aiProvider() === 'anthropic' ? 'claude-haiku-4-5-20251001' : 'gpt-5-nano');
const ROUTER_MODEL = () => process.env.NEUROEVOLUI_AI_ROUTER_MODEL || CHEAP();
const JUDGE_MODEL = () => process.env.NEUROEVOLUI_AI_JUDGE_MODEL || CHEAP();

let _graph = null;

export async function getAssistantGraph() {
  if (_graph) return _graph;
  const llm = await getLlm();
  if (!llm) return null;
  _graph = createAiGraph({
    llm,
    registry: buildAssistantTools(),
    specialists: [{
      id: 'clinical-assistant',
      description: 'responder dúvidas clínicas (protocolos, diagnósticos, posologias) fundamentado na base de conhecimento; propor rascunhos clínicos para revisão do profissional',
      systemPrompt: PROMPTS.assistant.system,
    }],
    models: {
      router: ROUTER_MODEL(),
      deep: DEFAULT_MODEL(),
      synth: ROUTER_MODEL(),
      judge: JUDGE_MODEL(),
    },
    verify: (process.env.NEUROEVOLUI_AI_VERIFY || 'on').toLowerCase() !== 'off',
    judgeThreshold: 0.6,
    routerContext: PROMPTS.assistant.routerContext,
  });
  return _graph;
}

export function __resetGraphForTest() { _graph = null; }

const arr = (v) => (Array.isArray(v) ? v : []);

// Extrai as citations do RAG (tool search_knowledge) da evidência do grafo.
function extractSources(evidence) {
  return arr(evidence)
    .filter((e) => e && e.tool === 'search_knowledge')
    .flatMap((e) => arr(e.output && e.output.results))
    .filter(Boolean)
    .map((r) => ({ id: r.id, source: r.source, title: r.title, text: r.text, score: r.score }));
}

// Extrai rascunhos pendentes de confirmação (tool propose_draft).
function extractActions(evidence) {
  return arr(evidence)
    .filter((e) => e && e.tool === 'propose_draft' && e.output && !e.output.error)
    .map((e) => e.output);
}

// Executa um turno do assistente clínico.
// Retorna { answer, sources, confidence, actions } — saída estruturada.
export async function runAssistantTurn({ question, context_type, history, identity, files } = {}) {
  const graph = await getAssistantGraph();
  if (!graph) {
    const err = new AiToolError('AI_DISABLED', 'Chave de IA não configurada; assistente desabilitado (fail-closed)');
    err.statusCode = 503;
    throw err;
  }

  const contextLabel = context_type === 'patient' ? 'paciente' : 'profissional de saúde';
  const systemContext = `Contexto do usuário: ${contextLabel}`;

  // Monta o conteúdo do usuário (texto + blocos de arquivo se houver)
  let userContent;
  if (files && files.length > 0) {
    try {
      const { ingest, toMessageContent, supportsVision, supportsPdf } = await import('@flavioneto11/file-ingest-kit');
      const ingested = await ingest(files);
      const provider = aiProvider();
      const model = DEFAULT_MODEL();
      userContent = toMessageContent(ingested, {
        provider,
        supportsVision: supportsVision(model),
        supportsPdf: supportsPdf(model),
        userText: String(question || ''),
      });
    } catch {
      // file-ingest-kit não disponível ou arquivo inválido → usa só o texto (fail-soft)
      userContent = null;
    }
  }

  const result = await graph.runTurn({
    message: String(question || ''),
    userContent,
    history: arr(history).filter((m) => m && m.role && m.content).map((m) => ({ role: m.role, content: String(m.content) })),
    systemContext,
    identity: identity || { sub: 'anon' },
    channel: 'inapp',
    toolContext: { context_type: context_type || 'professional' },
  });

  const sources = extractSources(result.evidence);
  const actions = extractActions(result.evidence);
  const confidence = result.judge ? result.judge.score : (sources.length > 0 ? 0.8 : 0.5);

  return {
    answer: String((result && result.text) || '').trim(),
    sources,
    confidence,
    actions: actions.length > 0 ? actions : undefined,
    _meta: {
      route: result.route,
      judge: result.judge,
      prompt_version: PROMPTS.assistant.version,
      usage: result.usage,
    },
  };
}
