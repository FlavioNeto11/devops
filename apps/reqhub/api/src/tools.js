// tools.js — as 3 AiTools de AUTORIA do Reqhub, no contrato @flavioneto11/ai-core.
// Todas R1 (leitura/geracao; NAO mutam nada, NAO escrevem no git — "salvar" = abrir
// PR pela UI, fluxo ja existente). authorize() e por IDENTIDADE (operador autenticado
// no HTTP). Saida do modelo e parseada como JSON ESTRITO; JSON invalido vira erro
// ESTRUTURADO (LLM_INVALID_JSON) — nunca fallback silencioso nem heuristica chumbada.
import { AiToolError } from '@flavioneto11/ai-core';
import { PROMPTS } from './prompts.js';

// Schema estrutural minimo (objeto com .parse()) — o dispatchTool do ai-core o aplica.
const schema = (validate) => ({ parse: (v) => { validate(v || {}); return v; } });
const need = (cond, msg) => { if (!cond) throw new Error(msg); };

async function llmJson(llm, { system, user, reasoningEffort = 'low', maxTokens = 1800 }) {
  if (!llm || typeof llm.complete !== 'function') {
    throw new AiToolError('AI_DISABLED', 'LLM nao disponivel');
  }
  const res = await llm.complete({
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    jsonMode: true,
    reasoningEffort,
    maxTokens,
  });
  const text = (res && res.text) || '';
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new AiToolError('LLM_INVALID_JSON', 'o modelo nao retornou JSON valido', { sample: text.slice(0, 200) });
  }
  return { parsed, usage: (res && res.usage) || null };
}

const authorizeOperator = (ctx) => ({
  allowed: ctx && ctx.authenticated === true,
  reason: ctx && ctx.authenticated === true ? 'operador autenticado' : 'requer operador autenticado',
});

export function buildAuthoringTools() {
  return [
    {
      name: 'req.authoring.draft',
      description: 'Gera um rascunho de requisito (campos do metamodelo) a partir de um esboco em linguagem natural.',
      risk: 'R1',
      inputSchema: schema((v) => need(typeof v.sketch === 'string' && v.sketch.trim().length >= 3, 'sketch obrigatorio (>=3 chars)')),
      authorize: authorizeOperator,
      execute: async (input, ctx) => {
        const { parsed, usage } = await llmJson(ctx.llm, {
          system: PROMPTS.draft.system,
          user: PROMPTS.draft.user(input),
        });
        return { prompt_version: PROMPTS.draft.version, draft: parsed, usage };
      },
    },
    {
      name: 'req.authoring.analyze',
      description: 'Analisa um requisito e aponta lacunas objetivas (testabilidade, criterios, metodo, cenario NFR, alocacao).',
      risk: 'R1',
      inputSchema: schema((v) => need(v.requirement && typeof v.requirement === 'object', 'requirement (objeto) obrigatorio')),
      authorize: authorizeOperator,
      execute: async (input, ctx) => {
        const { parsed, usage } = await llmJson(ctx.llm, {
          system: PROMPTS.analyze.system,
          user: PROMPTS.analyze.user(input),
        });
        return { prompt_version: PROMPTS.analyze.version, ...parsed, usage };
      },
    },
    {
      name: 'req.authoring.suggest_links',
      description: 'Classifica o TIPO de relacao entre um requisito e candidatos ja recuperados por similaridade (nao descobre novos alvos).',
      risk: 'R1',
      inputSchema: schema((v) => {
        need(v.requirement && typeof v.requirement === 'object', 'requirement (objeto) obrigatorio');
        need(Array.isArray(v.candidates), 'candidates (array) obrigatorio');
      }),
      authorize: authorizeOperator,
      execute: async (input, ctx) => {
        const { parsed, usage } = await llmJson(ctx.llm, {
          system: PROMPTS.suggestLinks.system,
          user: PROMPTS.suggestLinks.user(input),
        });
        const suggestions = Array.isArray(parsed.suggestions) ? parsed.suggestions.map((s) => ({ ...s, status: 'proposed' })) : [];
        return { prompt_version: PROMPTS.suggestLinks.version, suggestions, usage };
      },
    },
  ];
}
