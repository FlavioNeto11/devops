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

// reasoningEffort 'minimal' (tarefas de EXTRAÇÃO estruturada, não raciocínio profundo) +
// orçamento amplo: no gpt-5 o max_completion_tokens INCLUI os tokens de raciocínio, então
// valores baixos faziam o conteúdo sair vazio/truncado -> LLM_INVALID_JSON.
async function llmJson(llm, { system, user, reasoningEffort = 'minimal', maxTokens = 6000 }) {
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
      name: 'req.authoring.assist',
      description: 'Conversa guiada e GROUNDED sobre os requisitos de UM produto: responde perguntas citando IDs (ou "nao consta") e, quando pedido, propoe um draft de requisito. R1: nao muta, nao escreve no git.',
      risk: 'R1',
      inputSchema: schema((v) => {
        need(typeof v.product === 'string' && v.product.trim().length > 0, 'product obrigatorio');
        need(typeof v.message === 'string' && v.message.trim().length >= 2, 'message obrigatorio (>=2 chars)');
        need(Array.isArray(v.grounding), 'grounding (array) obrigatorio');
      }),
      authorize: authorizeOperator,
      execute: async (input, ctx) => {
        // a CONCISAO e responsabilidade do prompt (2-3 frases); maxTokens e so o teto (inclui o
        // raciocinio do gpt-5). Orcamento fixo adequado para reply curto + draft estruturado.
        const { parsed, usage } = await llmJson(ctx.llm, {
          system: PROMPTS.assist.system,
          user: PROMPTS.assist.user(input),
          reasoningEffort: 'low',
          maxTokens: 6000,
        });
        // defesa anti-alucinacao SERVER-SIDE: so citamos IDs presentes no grounding recebido
        // (o cliente tambem filtra, mas o contrato deve ser auto-suficiente para qualquer chamador).
        const known = new Set((Array.isArray(input.grounding) ? input.grounding : []).map((r) => r && r.id).filter(Boolean));
        const citations = Array.isArray(parsed.citations) ? parsed.citations.filter((x) => typeof x === 'string' && known.has(x)) : [];
        const draft = parsed.draft && typeof parsed.draft === 'object' ? parsed.draft : null;
        // next_question: string unica; tolera modelo que ainda devolva open_questions[] (pega a 1a).
        let nextQuestion = typeof parsed.next_question === 'string' ? parsed.next_question.trim() : '';
        if (!nextQuestion && Array.isArray(parsed.open_questions) && parsed.open_questions.length) {
          nextQuestion = String(parsed.open_questions.find((x) => typeof x === 'string' && x.trim()) || '').trim();
        }
        return {
          prompt_version: PROMPTS.assist.version,
          intent: typeof parsed.intent === 'string' ? parsed.intent : (draft ? 'create' : (nextQuestion ? 'clarify' : 'question')),
          reply: typeof parsed.reply === 'string' ? parsed.reply : '',
          citations,
          grounded: parsed.grounded !== false,
          draft,
          next_question: draft ? '' : nextQuestion, // ao propor draft, nao pergunta
          quick_replies: Array.isArray(parsed.quick_replies) ? parsed.quick_replies.filter((x) => typeof x === 'string').slice(0, 4) : [],
          usage,
        };
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

// AiTools do FORGE (greenfield): propor um CONJUNTO de requisitos a partir do brief e
// propor a arquitetura (ADRs + waves) a partir deles. R1: geram CONTEUDO, NAO escrevem
// no git nem disparam a esteira — a UI mostra o YAML/o caminho do PR; o operador decide.
export function buildForgeTools() {
  return [
    {
      name: 'forge.propose_requirements',
      description: 'Propoe um conjunto inicial de requisitos (MVP) de um produto novo a partir de um brief + blueprint.',
      risk: 'R1',
      inputSchema: schema((v) => need(typeof v.brief === 'string' && v.brief.trim().length >= 10, 'brief obrigatorio (>=10 chars)')),
      authorize: authorizeOperator,
      execute: async (input, ctx) => {
        const { parsed, usage } = await llmJson(ctx.llm, {
          system: PROMPTS.proposeRequirements.system,
          user: PROMPTS.proposeRequirements.user(input),
          maxTokens: 12000,
        });
        const requirements = Array.isArray(parsed.requirements) ? parsed.requirements : [];
        return { prompt_version: PROMPTS.proposeRequirements.version, requirements, notes: parsed.notes || '', usage };
      },
    },
    {
      name: 'forge.propose_architecture',
      description: 'Propoe arquitetura (ADRs + ordem de build em waves) de um produto novo a partir de seus requisitos e do blueprint.',
      risk: 'R1',
      inputSchema: schema((v) => need(Array.isArray(v.requirements) && v.requirements.length > 0, 'requirements (array nao-vazio) obrigatorio')),
      authorize: authorizeOperator,
      execute: async (input, ctx) => {
        const { parsed, usage } = await llmJson(ctx.llm, {
          system: PROMPTS.proposeArchitecture.system,
          user: PROMPTS.proposeArchitecture.user(input),
          maxTokens: 9000,
        });
        return {
          prompt_version: PROMPTS.proposeArchitecture.version,
          adrs: Array.isArray(parsed.adrs) ? parsed.adrs : [],
          waves: Array.isArray(parsed.waves) ? parsed.waves : [],
          notes: parsed.notes || '',
          usage,
        };
      },
    },
  ];
}
