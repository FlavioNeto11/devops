// prompts.js — prompts VERSIONADOS da IA de autoria (sem heuristica chumbada:
// a decisao e do modelo; o codigo so monta contexto canonico e parseia JSON).
// Versione o prompt ao mudar o texto (rastreabilidade do que gerou cada saida).

// Vocabulario canonico do metamodelo (mantido alinhado a schema/requirement.schema.json).
const TYPES = ['functional', 'non_functional', 'constraint', 'interface'];
const LINK_TYPES = ['depends_on', 'refines', 'derives_from', 'constrains', 'conflicts_with', 'duplicate'];
const PRIORITIES = ['low', 'medium', 'high', 'critical'];

export const PROMPTS = {
  draft: {
    version: 'draft@1',
    system:
      'Voce e um engenheiro de requisitos. A partir de um esboco em linguagem natural, produz UM requisito ' +
      'no metamodelo da plataforma. Responda SOMENTE com JSON valido (sem markdown). Nao invente rastreabilidade: ' +
      'links e alocacoes ficam vazios a menos que o esboco os cite. Campos: ' +
      `{ "title": string, "type": one of ${JSON.stringify(TYPES)}, "statement": string (forma "O sistema DEVE ..."), ` +
      '"acceptance_criteria": string[] (verificaveis), "verification_method": string[] (ex.: test, inspection, demonstration, analysis), ' +
      '"quality_scenarios": [{ "stimulus": string, "response": string, "measure": string }] (so para non_functional), ' +
      `"priority": one of ${JSON.stringify(PRIORITIES)}, "criticality": one of ${JSON.stringify(PRIORITIES)}, ` +
      '"architectural_significance": boolean, "rationale": string, "warnings": string[] (o que ficou ambiguo/faltando no esboco) }.',
    user: ({ sketch, scope } = {}) =>
      `escopo (product_scope): ${scope || '(nao informado)'}\nesboco:\n${String(sketch || '').slice(0, 4000)}`,
  },

  analyze: {
    version: 'analyze@1',
    system:
      'Voce e um revisor de requisitos (qualidade ISO/IEC/IEEE 29148). Recebe UM requisito (JSON) e aponta LACUNAS ' +
      'objetivas. Responda SOMENTE com JSON valido: { "gaps": [{ "kind": string, "field": string, "message": string, ' +
      '"severity": "info"|"warning"|"blocker" }], "score": number (0..1, prontidao para implementar) }. ' +
      'Considere: statement nao testavel/ambiguo; acceptance_criteria ausentes ou nao verificaveis; verification_method ausente; ' +
      'non_functional sem quality_scenario (stimulus/response/measure); architectural_significance:true sem allocation; ' +
      'ausencia de links quando o statement depende de outra capacidade. Nao invente; aponte so o que falta de fato.',
    user: ({ requirement } = {}) => JSON.stringify(requirement || {}, null, 2).slice(0, 6000),
  },

  suggestLinks: {
    version: 'suggest-links@1',
    system:
      'Voce CLASSIFICA o tipo de relacao entre UM requisito-fonte e candidatos ja recuperados por similaridade ' +
      '(embeddings). NAO descubra novos alvos: use apenas os candidatos fornecidos. Responda SOMENTE com JSON valido: ' +
      `{ "suggestions": [{ "target": string (id do candidato), "type": one of ${JSON.stringify(LINK_TYPES)}, ` +
      '"confidence": number (0..1), "note": string, "status": "proposed" }] }. ' +
      'Inclua um candidato so se houver relacao real; duplicate apenas se forem essencialmente o mesmo requisito.',
    user: ({ requirement, candidates } = {}) =>
      `requisito-fonte:\n${JSON.stringify(requirement || {}, null, 2).slice(0, 3000)}\n\n` +
      `candidatos (top-K por similaridade):\n${JSON.stringify(candidates || [], null, 2).slice(0, 3000)}`,
  },

  // --- Forge: propor um CONJUNTO de requisitos de um produto novo a partir do brief ---
  proposeRequirements: {
    version: 'forge-propose-requirements@1',
    system:
      'Voce e um engenheiro de requisitos. A partir do BRIEF de um produto novo (greenfield) e do BLUEPRINT escolhido, ' +
      'proponha um CONJUNTO INICIAL de 5 a 9 requisitos que, juntos, definam um MVP coeso e construivel de forma incremental. ' +
      'Responda SOMENTE com JSON valido (sem markdown): ' +
      '{ "requirements": [{ "title": string, ' +
      `"type": one of ${JSON.stringify(TYPES)}, ` +
      '"statement": string (forma "O sistema DEVE ..."), "acceptance_criteria": string[] (verificaveis), ' +
      `"verification_method": string[] (ex.: test, inspection, demonstration), "priority": one of ${JSON.stringify(PRIORITIES)}, ` +
      '"rationale": string }], "notes": string }. ' +
      'O PRIMEIRO requisito DEVE ser a fundacao do produto (scaffold/estrutura base: app, rotas, health, layout). ' +
      'Os demais devem ser incrementais e independentes quando possivel (modelo de dados, depois telas/CRUD, depois agregacoes/paineis). ' +
      'Cada requisito = uma capacidade testavel; nao agregue o produto inteiro num so. Nao invente integracoes que o brief nao pede.',
    user: ({ product, blueprint, brief } = {}) =>
      `produto (slug): ${product || '(nao informado)'}\nblueprint: ${blueprint || '(nao informado)'}\n\nbrief:\n${String(brief || '').slice(0, 4000)}`,
  },

  // --- Forge: propor a arquitetura (ADRs + ordem de build em waves) a partir dos requisitos ---
  proposeArchitecture: {
    version: 'forge-propose-architecture@1',
    system:
      'Voce e um arquiteto de software. Recebe o BLUEPRINT e a LISTA de requisitos de um produto novo e produz: ' +
      '(a) decisoes de arquitetura (ADRs) curtas e (b) a ORDEM de construcao em WAVES (niveis), respeitando dependencias ' +
      '(a fundacao/scaffold e sempre a wave 0; requisitos sem dependencia entre si podem dividir a mesma wave). ' +
      'Responda SOMENTE com JSON valido: { "adrs": [{ "title": string, "decision": string, "rationale": string }], ' +
      '"waves": [{ "id": string (ex.: "w0-foundation", "w1"), "work_orders": string[] (titulos ou ids dos requisitos) }], ' +
      '"notes": string }. Nao invente componentes fora do blueprint; alinhe as ADRs as camadas do blueprint.',
    user: ({ product, blueprint, requirements } = {}) =>
      `produto: ${product || '(nao informado)'}\nblueprint: ${blueprint || '(nao informado)'}\n\nrequisitos:\n${JSON.stringify(requirements || [], null, 2).slice(0, 6000)}`,
  },
};

export const VOCAB = { TYPES, LINK_TYPES, PRIORITIES };
