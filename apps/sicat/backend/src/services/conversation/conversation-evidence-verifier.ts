import { SystemMessage, HumanMessage } from '@langchain/core/messages';
import { createChatModel, getAiConfig, getReasoningEffortFor, hasOpenAiApiKey } from './ai-config.js';
import { retrieveKnowledge, buildKnowledgeContextBlock } from './knowledge/conversation-knowledge-service.js';

/**
 * Verificação pós-ferramenta (grounding) — S-D do plano de evolução da IA conversacional.
 *
 * Depois que uma ferramenta CONSULTIVA executa, um juiz leve avalia: "a evidência retornada
 * RESPONDE à pergunta do usuário?". Se NÃO (ex.: pediram manifestos/CDF e veio painel de
 * saúde/jobs, ou veio vazio por consultar a fonte errada), o juiz propõe a ferramenta
 * consultiva correta e seus argumentos — DECISÃO DO MODELO aterrada na base de conhecimento
 * de capacidade das ferramentas (RAG), sem mapa palavra→tool hardcoded.
 *
 * Garantias de segurança:
 * - Só propõe ferramentas de CONSULTA (read-only). Nunca cancelar/criar/submeter/imprimir.
 * - Para orchestrate_manifest_operation, exige um intent CONSULTIVO (lista/contagem/agrupamento/detalhe/CDF).
 * - Degrada graciosamente: sem chave/índice/modelo, ou em qualquer erro, NÃO rerota (answersIntent=true).
 */

type LooseRecord = Record<string, unknown>;

export type EvidenceRerouteCall = { name: string; arguments: LooseRecord };

export type EvidenceVerdict = {
  answersIntent: boolean;
  reason: string | null;
  reroute: EvidenceRerouteCall | null;
};

const NO_REROUTE: EvidenceVerdict = { answersIntent: true, reason: null, reroute: null };

// Ferramentas de CONSULTA elegíveis como destino de reroteamento automático (read-only).
const CONSULTATIVE_REROUTE_TOOLS = new Set([
  'orchestrate_manifest_operation',
  'list_manifests',
  'get_manifest_details',
  'diagnose_operation'
]);

// Intents CONSULTIVOS do orquestrador (sem mutação/confirmação). Qualquer outro intent
// proposto para orchestrate_manifest_operation é rejeitado (não auto-executamos ações).
const CONSULTATIVE_ORCHESTRATE_INTENTS = new Set([
  'manifest.list_recent_top',
  'manifest.group_recent_top',
  'manifest.detail_selected_set',
  'cdf.list_by_manifest_selection'
]);

function toRecord(value: unknown): LooseRecord {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as LooseRecord;
  }
  return {};
}

function toNullableString(value: unknown): string | null {
  if (typeof value === 'string' && value.trim()) return value.trim();
  return null;
}

const VERIFIER_SYSTEM_PROMPT =
  'Voce e um VERIFICADOR DE GROUNDING do assistente operacional do SICAT (plataforma MTR/CETESB de residuos). ' +
  'Recebe a PERGUNTA do usuario, a FERRAMENTA que foi usada, a EVIDENCIA que ela retornou, o RECORTE ativo da ' +
  'conversa (periodo/status/agrupamento) e a BASE DE CONHECIMENTO de capacidade das ferramentas. ' +
  'Sua tarefa: decidir se a EVIDENCIA realmente RESPONDE a pergunta. ' +
  'Atencao ao erro classico: perguntas sobre MANIFESTOS/CDF (lista, total, contagem, resumo do ano, quebra por status) ' +
  'NAO sao respondidas pelo painel de SAUDE/jobs (get_dashboard_overview/get_operations_overview); ' +
  'um resultado vazio de jobs NUNCA significa "nao ha manifestos". ' +
  'Se a evidencia responde, retorne answersIntent=true e reroute=null. ' +
  'Se NAO responde, retorne answersIntent=false e proponha em reroute a ferramenta de CONSULTA correta com seus argumentos, ' +
  'escolhida pela base de conhecimento. Ferramentas validas para reroute (somente CONSULTA, read-only): ' +
  'orchestrate_manifest_operation, list_manifests, get_manifest_details, diagnose_operation. ' +
  'Para orchestrate_manifest_operation use um intent CONSULTIVO (manifest.list_recent_top, manifest.group_recent_top, ' +
  'manifest.detail_selected_set, cdf.list_by_manifest_selection) e preencha selection {dateFrom, dateTo, status, groupBy} ' +
  'reaproveitando o RECORTE ativo quando houver (formato de datas YYYY-MM-DD). ' +
  'NUNCA proponha acoes que exigem confirmacao (cancelar, criar, submeter, imprimir, gerar/baixar CDF). ' +
  'NUNCA proponha repetir a MESMA ferramenta que ja falhou. ' +
  'IMPORTANTE: se a ferramenta usada JA E a fonte correta para a pergunta (ex.: orchestrate_manifest_operation ou ' +
  'list_manifests para manifestos; consulta de CDF para CDF) e apenas retornou VAZIO, isso e uma RESPOSTA VALIDA ' +
  '(zero registros no recorte) — answersIntent=true e reroute=null. So rerote quando a FONTE/ferramenta esta ERRADA ' +
  'para a pergunta (ex.: painel de saude para uma pergunta de manifestos), nao por o resultado ser vazio. ' +
  'Na duvida (a evidencia plausivelmente responde), prefira answersIntent=true e reroute=null. ' +
  'Responda SOMENTE o objeto JSON: {"answersIntent": boolean, "reason": string, "reroute": {"name": string, "arguments": object} | null}.';

function parseVerdict(content: unknown): { answersIntent: boolean; reason: string | null; reroute: EvidenceRerouteCall | null } | null {
  let text = '';
  if (typeof content === 'string') {
    text = content;
  } else if (Array.isArray(content)) {
    text = content.map((part) => (typeof part === 'string' ? part : toNullableString(toRecord(part).text) || '')).join('');
  }
  const cleaned = text.trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    const obj = toRecord(JSON.parse(cleaned.slice(start, end + 1)));
    const answersIntent = obj.answersIntent !== false; // default seguro: true
    const reason = toNullableString(obj.reason);
    const rerouteRaw = toRecord(obj.reroute);
    const name = toNullableString(rerouteRaw.name);
    const args = toRecord(rerouteRaw.arguments);
    const reroute = name ? { name, arguments: args } : null;
    return { answersIntent, reason, reroute };
  } catch {
    return null;
  }
}

/** Valida que o reroute proposto é uma CONSULTA segura (read-only) e diferente da ferramenta que falhou. */
function sanitizeReroute(reroute: EvidenceRerouteCall | null, originalToolName: string): EvidenceRerouteCall | null {
  if (!reroute) return null;
  const name = reroute.name.trim();
  if (!CONSULTATIVE_REROUTE_TOOLS.has(name)) return null;
  if (name === originalToolName) return null; // não repetir a mesma ferramenta
  if (name === 'orchestrate_manifest_operation') {
    const intent = toNullableString(reroute.arguments.intent);
    if (!intent || !CONSULTATIVE_ORCHESTRATE_INTENTS.has(intent)) return null; // só intents de consulta
  }
  return { name, arguments: reroute.arguments };
}

/**
 * Avalia se a evidência responde à intenção e, se não, propõe um reroute CONSULTIVO seguro.
 * `evidenceSummary` é um resumo compacto da evidência (tipo/intent/contagens/assistantSummary).
 * `activeWindowBlock` é o recorte ativo (Working Memory) para o juiz montar a selection correta.
 */
export async function verifyEvidenceAndPlanReroute(input: {
  userMessage: string;
  toolName: string;
  evidenceSummary: string;
  activeWindowBlock?: string | null;
}): Promise<EvidenceVerdict> {
  if (!hasOpenAiApiKey()) return NO_REROUTE;

  let knowledgeBlock = '';
  try {
    knowledgeBlock = buildKnowledgeContextBlock(await retrieveKnowledge(input.userMessage, { k: 5 }));
  } catch {
    knowledgeBlock = '';
  }

  let llm;
  try {
    const config = getAiConfig();
    llm = createChatModel(config.openAiJudgeModel, config.openAiApiKey, getReasoningEffortFor('routing'));
  } catch {
    return NO_REROUTE;
  }

  try {
    const human = JSON.stringify({
      pergunta: input.userMessage,
      ferramentaUsada: input.toolName,
      recorteAtivo: input.activeWindowBlock || null,
      evidencia: input.evidenceSummary,
      baseDeConhecimento: knowledgeBlock || null
    });
    const response = await llm.invoke([
      new SystemMessage(VERIFIER_SYSTEM_PROMPT),
      new HumanMessage(`${human}\n\nResponda SOMENTE o JSON do veredito.`)
    ]);
    const parsed = parseVerdict(response.content);
    if (!parsed) return NO_REROUTE;
    const reroute = parsed.answersIntent ? null : sanitizeReroute(parsed.reroute, input.toolName);
    return { answersIntent: parsed.answersIntent, reason: parsed.reason, reroute };
  } catch {
    return NO_REROUTE;
  }
}
