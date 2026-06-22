// tools.js — as 3 AiTools de AUTORIA do Reqhub, no contrato @flavioneto11/ai-core.
// Todas R1 (leitura/geracao; NAO mutam nada, NAO escrevem no git — "salvar" = abrir
// PR pela UI, fluxo ja existente). authorize() e por IDENTIDADE (operador autenticado
// no HTTP). Saida do modelo e parseada como JSON ESTRITO; JSON invalido vira erro
// ESTRUTURADO (LLM_INVALID_JSON) — nunca fallback silencioso nem heuristica chumbada.
import { AiToolError } from '@flavioneto11/ai-core';
import { PROMPTS, VOCAB } from './prompts.js';
import { summarizeForPrompt, catalogIndex, filterKnownBlocks, validateSelection } from './capabilities.js';

// Resolve os blocos default/compatible de um blueprint a partir do catálogo recebido do frontend.
function blueprintBlocks(input, blueprintId) {
  const bp = (Array.isArray(input.blueprints) ? input.blueprints : []).find((b) => b && b.id === blueprintId) || {};
  return { defaultBlocks: bp.default_blocks || [], compatibleBlocks: bp.compatible_blocks || [], blueprint: bp };
}
const stacksSummary = (input) => (Array.isArray(input.blueprints) ? input.blueprints : [])
  .map((b) => `- ${b.id} (stack ${b.base_stack || '?'}): ${b.name || ''}. default: [${(b.default_blocks || []).join(', ')}]; compativel: [${(b.compatible_blocks || []).join(', ')}]`)
  .join('\n');

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

// Saneia o draft de REFINAMENTO na FRONTEIRA da API (defesa em profundidade; o gate real e o
// schema no build). Falha-rapido em kind fora do enum (igual ao `level` de classify_change) e
// filtra verification_method ao ENUM — sem fallback silencioso, sem heuristica chumbada.
function sanitizeRefDraft(draft) {
  if (!draft || typeof draft !== 'object') return null;
  if (draft.kind != null && !VOCAB.REF_KINDS.includes(draft.kind)) {
    throw new AiToolError('LLM_INVALID_JSON', 'kind de refinamento fora do enum', { kind: draft.kind });
  }
  if (Array.isArray(draft.verification_method)) {
    draft.verification_method = draft.verification_method.filter((m) => VOCAB.VERIFICATION_METHODS.includes(m));
  }
  return draft;
}

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
        // projeta SÓ os campos do contrato (sem spread: o modelo não sobrescreve prompt_version nem vaza chaves)
        return { prompt_version: PROMPTS.analyze.version, gaps: Array.isArray(parsed.gaps) ? parsed.gaps : [], score: typeof parsed.score === 'number' ? parsed.score : null, usage };
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
      name: 'req.authoring.revise',
      description: 'Recebe um requisito + as lacunas apontadas (de analyze) e devolve a versao CORRIGIDA (mesmo shape do draft). R1: nao muta, nao escreve no git.',
      risk: 'R1',
      inputSchema: schema((v) => need(v.requirement && typeof v.requirement === 'object', 'requirement (objeto) obrigatorio')),
      authorize: authorizeOperator,
      execute: async (input, ctx) => {
        const { parsed, usage } = await llmJson(ctx.llm, { system: PROMPTS.revise.system, user: PROMPTS.revise.user(input), maxTokens: 6000 });
        return {
          prompt_version: PROMPTS.revise.version,
          draft: parsed.draft && typeof parsed.draft === 'object' ? parsed.draft : null,
          notes: typeof parsed.notes === 'string' ? parsed.notes : '',
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
    // --- CAMADA DE REFINAMENTO (REF-*) ---------------------------------------
    {
      name: 'req.authoring.classify_change',
      description: 'Classifica o NIVEL de uma mudanca descrita (refinement | requirement-edit | new-requirement) ancorando em requisitos REAIS do grounding. R1.',
      risk: 'R1',
      inputSchema: schema((v) => {
        need(typeof v.product === 'string' && v.product.trim().length > 0, 'product obrigatorio');
        need(typeof v.sketch === 'string' && v.sketch.trim().length >= 3, 'sketch obrigatorio (>=3 chars)');
        need(Array.isArray(v.grounding), 'grounding (array) obrigatorio');
      }),
      authorize: authorizeOperator,
      execute: async (input, ctx) => {
        const { parsed, usage } = await llmJson(ctx.llm, { system: PROMPTS.classifyChange.system, user: PROMPTS.classifyChange.user(input) });
        const LEVELS = ['refinement', 'requirement-edit', 'new-requirement'];
        const level = LEVELS.includes(parsed.level) ? parsed.level : null;
        if (!level) throw new AiToolError('LLM_INVALID_JSON', 'level fora do enum', { level: parsed.level });
        // anti-fabricacao SERVER-SIDE: ancoras/target/citations so valem se existirem no grounding.
        const known = new Set((Array.isArray(input.grounding) ? input.grounding : []).map((r) => r && r.id).filter(Boolean));
        const REL = ['implements', 'refines', 'derives_from', 'relates_to'];
        const anchors = Array.isArray(parsed.anchors)
          ? parsed.anchors.filter((a) => a && known.has(a.requirement_id)).map((a) => ({ requirement_id: a.requirement_id, relation: REL.includes(a.relation) ? a.relation : 'refines' }))
          : [];
        const target_req_id = typeof parsed.target_req_id === 'string' && known.has(parsed.target_req_id) ? parsed.target_req_id : null;
        const citations = Array.isArray(parsed.citations) ? parsed.citations.filter((x) => typeof x === 'string' && known.has(x)) : [];
        return {
          prompt_version: PROMPTS.classifyChange.version,
          level,
          confidence: typeof parsed.confidence === 'number' ? parsed.confidence : null,
          rationale: typeof parsed.rationale === 'string' ? parsed.rationale : '',
          anchors,
          target_req_id,
          suggested_type: parsed.suggested_type === 'functional' || parsed.suggested_type === 'non-functional' ? parsed.suggested_type : null,
          citations,
          usage,
        };
      },
    },
    {
      name: 'req.authoring.draft_refinement',
      description: 'Gera um rascunho RICO de refinamento de tela (surface/states/data/interactions/flows) a partir de esboco + ancoras. R1.',
      risk: 'R1',
      inputSchema: schema((v) => {
        need(typeof v.sketch === 'string' && v.sketch.trim().length >= 3, 'sketch obrigatorio (>=3 chars)');
        need(Array.isArray(v.anchors), 'anchors (array) obrigatorio');
      }),
      authorize: authorizeOperator,
      execute: async (input, ctx) => {
        const { parsed, usage } = await llmJson(ctx.llm, { system: PROMPTS.draftRefinement.system, user: PROMPTS.draftRefinement.user(input), maxTokens: 9000 });
        const draft = sanitizeRefDraft(parsed.draft);
        return {
          prompt_version: PROMPTS.draftRefinement.version,
          draft,
          warnings: Array.isArray(parsed.warnings) ? parsed.warnings : [],
          usage,
        };
      },
    },
    {
      name: 'req.authoring.analyze_refinement',
      description: 'Analisa um refinamento e aponta lacunas (estados/dados/interacoes/aceite/origem). Saida = {gaps, score} (mesmo shape de analyze). R1.',
      risk: 'R1',
      inputSchema: schema((v) => need(v.refinement && typeof v.refinement === 'object', 'refinement (objeto) obrigatorio')),
      authorize: authorizeOperator,
      execute: async (input, ctx) => {
        const { parsed, usage } = await llmJson(ctx.llm, { system: PROMPTS.analyzeRefinement.system, user: PROMPTS.analyzeRefinement.user(input) });
        // projeta SÓ {gaps,score} (sem spread): o modelo não sobrescreve prompt_version nem vaza chaves
        return { prompt_version: PROMPTS.analyzeRefinement.version, gaps: Array.isArray(parsed.gaps) ? parsed.gaps : [], score: typeof parsed.score === 'number' ? parsed.score : null, usage };
      },
    },
    {
      name: 'req.authoring.revise_refinement',
      description: 'Corrige um refinamento a partir das lacunas (mesmo shape do draft de refinamento). R1.',
      risk: 'R1',
      inputSchema: schema((v) => need(v.refinement && typeof v.refinement === 'object', 'refinement (objeto) obrigatorio')),
      authorize: authorizeOperator,
      execute: async (input, ctx) => {
        const { parsed, usage } = await llmJson(ctx.llm, { system: PROMPTS.reviseRefinement.system, user: PROMPTS.reviseRefinement.user(input), maxTokens: 9000 });
        return {
          prompt_version: PROMPTS.reviseRefinement.version,
          draft: sanitizeRefDraft(parsed.draft),
          notes: typeof parsed.notes === 'string' ? parsed.notes : '',
          usage,
        };
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
      description: 'Propoe um conjunto inicial de requisitos de um produto novo a partir de um brief + blueprint + catalogo de capacidades (sistemas robustos, nao so CRUD).',
      risk: 'R1',
      inputSchema: schema((v) => need(typeof v.brief === 'string' && v.brief.trim().length >= 10, 'brief obrigatorio (>=10 chars)')),
      authorize: authorizeOperator,
      execute: async (input, ctx) => {
        const { defaultBlocks, compatibleBlocks } = blueprintBlocks(input, input.blueprint);
        const catalog = summarizeForPrompt(input.capabilities, { defaultBlocks, compatibleBlocks });
        const { parsed, usage } = await llmJson(ctx.llm, {
          system: PROMPTS.proposeRequirements.system,
          user: PROMPTS.proposeRequirements.user({ ...input, catalog }),
          maxTokens: 12000,
        });
        // fail-closed: filtra capability_blocks de cada requisito ao conjunto CONHECIDO do catalogo.
        const known = catalogIndex(input.capabilities).ids;
        const requirements = (Array.isArray(parsed.requirements) ? parsed.requirements : []).map((r) => {
          if (!r || typeof r !== 'object') return r;
          if (known.size) r.capability_blocks = filterKnownBlocks(r.capability_blocks, known).kept;
          return r;
        });
        return { prompt_version: PROMPTS.proposeRequirements.version, requirements, notes: parsed.notes || '', usage };
      },
    },
    {
      name: 'forge.propose_architecture',
      description: 'Propoe arquitetura (stack + blocos de capacidade + ADRs + waves) de um produto novo a partir de seus requisitos, do catalogo e dos blueprints.',
      risk: 'R1',
      inputSchema: schema((v) => need(Array.isArray(v.requirements) && v.requirements.length > 0, 'requirements (array nao-vazio) obrigatorio')),
      authorize: authorizeOperator,
      execute: async (input, ctx) => {
        const catalog = summarizeForPrompt(input.capabilities, {});
        const { parsed, usage } = await llmJson(ctx.llm, {
          system: PROMPTS.proposeArchitecture.system,
          user: PROMPTS.proposeArchitecture.user({ ...input, catalog, stacks: stacksSummary(input) }),
          maxTokens: 9000,
        });
        const hasCatalog = catalogIndex(input.capabilities).ids.size > 0;
        // fail-closed: a stack tem de ser sicat|gymops (erro estruturado se nao).
        const stack = parsed.stack === 'sicat' || parsed.stack === 'gymops' ? parsed.stack : null;
        if (hasCatalog && !stack) throw new AiToolError('FORGE_INVALID_SELECTION', `stack invalida: ${JSON.stringify(parsed.stack)} (esperado sicat|gymops)`);
        // resolve o blueprint da stack escolhida e VALIDA os blocos (existe/compativel/blueprint/conflito).
        const chosenBp = (Array.isArray(input.blueprints) ? input.blueprints : []).find((b) => b.base_stack === stack) || {};
        const selIds = (Array.isArray(parsed.selected_blocks) ? parsed.selected_blocks : []).map((s) => s && s.id).filter(Boolean);
        const sel = hasCatalog
          ? validateSelection(selIds, { stack, capabilities: input.capabilities, defaultBlocks: chosenBp.default_blocks, compatibleBlocks: chosenBp.compatible_blocks })
          : { valid: selIds, dropped: [] };
        const validSet = new Set(sel.valid);
        const selected_blocks = (Array.isArray(parsed.selected_blocks) ? parsed.selected_blocks : [])
          .filter((s) => s && validSet.has(s.id));
        // garante que blocos default (ex.: observabilidade) presentes mesmo sem o LLM citar
        for (const id of sel.valid) if (!selected_blocks.some((s) => s.id === id)) selected_blocks.push({ id, requirement_titles: [], reference_cited: '' });
        return {
          prompt_version: PROMPTS.proposeArchitecture.version,
          stack,
          blueprint: chosenBp.id || input.blueprint || null,
          stack_rationale: parsed.stack_rationale || '',
          selected_blocks,
          dropped_blocks: sel.dropped,
          adrs: Array.isArray(parsed.adrs) ? parsed.adrs : [],
          waves: Array.isArray(parsed.waves) ? parsed.waves : [],
          notes: parsed.notes || '',
          usage,
        };
      },
    },
  ];
}
