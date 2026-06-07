import type { ConversationToolName } from '../tools/tool-types.js';

/**
 * Registry de AGENTES ESPECIALISTAS da camada conversacional.
 *
 * Em vez de um único planner com TODAS as tools (que dilui a decisão), cada domínio
 * é um especialista com: foco, subconjunto de tools/skills mapeadas, intents que lhe
 * pertencem e tópicos de conhecimento (RAG). Um router (o próprio classificador LLM)
 * mapeia a intenção → especialista; o planner então raciocina com o conjunto FOCADO
 * de ferramentas daquele especialista. É taxonomia estrutural, não heurística de frase.
 */

export type ConversationSpecialistId = 'manifest' | 'cdf' | 'operations' | 'catalog' | 'conversation';

export type ConversationSpecialist = {
  id: ConversationSpecialistId;
  label: string;
  /** O que este especialista resolve — injetado no foco do planner/síntese. */
  focus: string;
  /** Subconjunto de tools que este especialista pode acionar (bindTools). Vazio = só raciocínio sobre memória. */
  tools: ConversationToolName[];
  /** Prefixos/intents do classificador que pertencem a este especialista. */
  intentPrefixes: string[];
  intents: string[];
  /** Tópicos para enriquecer o retrieval de conhecimento (goal-aware RAG). */
  knowledgeTopics: string[];
};

export const CONVERSATION_SPECIALISTS: Record<ConversationSpecialistId, ConversationSpecialist> = {
  manifest: {
    id: 'manifest',
    label: 'Especialista em Manifestos (MTR)',
    focus:
      'Consulta, listagem, recência, contagem, comparação, detalhe e operações de manifestos (MTR): listar por período/status, ' +
      'mais recente/antigo, replicar, submeter, imprimir, cancelar, receber. Inclui o COMPROVANTE/2ª via/PDF/extrato do PRÓPRIO manifesto: ' +
      'gerar/imprimir/baixar o documento (PDF) de um ou vários manifestos e disponibilizar para download em lote (ZIP) — isso é ' +
      'manifest.batch_print_selected (gera os PDFs e monta o ZIP), NÃO é CDF/certificado. Distingue LISTAR (todos do período) de CONTAR (um número) ' +
      'de RANKING (top-N). Resolve referências a conjuntos já mostrados ("desses", "os 20", "o segundo") pela memória.',
    tools: [
      'orchestrate_manifest_operation',
      'list_manifests',
      'get_manifest_details',
      'list_manifest_documents',
      'replicate_manifest',
      'submit_manifest',
      'print_manifest',
      'cancel_manifest'
    ],
    intentPrefixes: ['manifest.', 'memory.'],
    intents: ['list_manifests', 'get_manifest_details', 'list_manifest_documents'],
    knowledgeTopics: ['manifesto', 'MTR', 'expedição', 'recebimento', 'gerador', 'transportador', 'destinador']
  },
  cdf: {
    id: 'cdf',
    label: 'Especialista em CDF/CDR',
    focus:
      'Certificado de Destinação Final (CDF/CDR) — o CERTIFICADO em si, NÃO o comprovante/PDF do manifesto: conceito, quando/como emitir, ' +
      'listar certificados por conta e período, vincular a manifestos, baixar o certificado. Acione SOMENTE quando o usuário citar ' +
      'CDF/CDR/certificado de destinação; "comprovante/2ª via/PDF/extrato do manifesto" pertence ao especialista de Manifestos. ' +
      'Sempre aterrado no conhecimento de domínio para conceitos.',
    tools: ['orchestrate_manifest_operation', 'list_cdf_certificates', 'enqueue_cdf_download'],
    intentPrefixes: ['cdf.'],
    intents: ['list_cdf_certificates', 'enqueue_cdf_download'],
    knowledgeTopics: ['CDF', 'CDR', 'certificado', 'destinação final', 'emissão']
  },
  operations: {
    id: 'operations',
    label: 'Especialista em Operações & Diagnóstico',
    focus:
      'Saúde operacional, jobs (fila/erro/DLQ), auditoria, dashboard, DMR, MTR provisório e DIAGNÓSTICO multi-step ' +
      '(cruzar manifestos+CDF+jobs para responder "o que falta", "por que parou"). Read-only para diagnóstico.',
    tools: [
      'list_jobs',
      'get_job_status',
      'get_audit_trail',
      'get_operations_overview',
      'get_dashboard_overview',
      'diagnose_operation',
      'list_dmr',
      'list_mtr_provisorio'
    ],
    intentPrefixes: ['operation.', 'job.', 'audit.'],
    intents: [
      'list_jobs',
      'get_job_status',
      'get_audit_trail',
      'get_operations_overview',
      'get_dashboard_overview',
      'diagnose_operation',
      'list_dmr',
      'list_mtr_provisorio'
    ],
    knowledgeTopics: ['job', 'fila', 'erro', 'DLQ', 'auditoria', 'dashboard', 'sessão', 'diagnóstico']
  },
  catalog: {
    id: 'catalog',
    label: 'Especialista em Catálogos & Parceiros',
    focus: 'Catálogos operacionais (tipos de resíduo, unidades, tratamentos) e busca de parceiros (gerador/transportador/destinador).',
    tools: ['query_catalog', 'search_partners'],
    intentPrefixes: ['catalog.', 'partner.'],
    intents: ['query_catalog', 'search_partners'],
    knowledgeTopics: ['catálogo', 'resíduo', 'tratamento', 'parceiro', 'CNPJ']
  },
  conversation: {
    id: 'conversation',
    label: 'Especialista Conversacional & Memória',
    focus:
      'Conversa natural, saudações, fora de escopo (responder breve + redirecionar) e perguntas sobre a PRÓPRIA interação ' +
      '(o que foi pedido, por que respondi algo, resumir/corrigir/retomar). Responde RACIOCINANDO sobre histórico + memória de trabalho, sem tools operacionais.',
    tools: [],
    intentPrefixes: ['conversation', 'greeting', 'smalltalk', 'unclear'],
    intents: ['conversation', 'greeting', 'unclear'],
    knowledgeTopics: []
  }
};

const SPECIALIST_ORDER: ConversationSpecialistId[] = ['conversation', 'cdf', 'operations', 'catalog', 'manifest'];

const FALLBACK_SPECIALIST: ConversationSpecialistId = 'manifest';

/** Mapeia uma intenção do classificador ao especialista responsável (taxonomia, não heurística de texto). */
export function resolveSpecialistForIntent(intent: string | null | undefined): ConversationSpecialist {
  const normalized = String(intent || '').trim().toLowerCase();
  if (!normalized) {
    return CONVERSATION_SPECIALISTS[FALLBACK_SPECIALIST];
  }
  // Ordem importa: conversation/cdf/operations/catalog antes de manifest (fallback amplo).
  for (const id of SPECIALIST_ORDER) {
    const spec = CONVERSATION_SPECIALISTS[id];
    const byExact = spec.intents.some((it) => it.toLowerCase() === normalized);
    const byPrefix = spec.intentPrefixes.some((p) => normalized === p || normalized.startsWith(p));
    if (byExact || byPrefix) {
      return spec;
    }
  }
  return CONVERSATION_SPECIALISTS[FALLBACK_SPECIALIST];
}

/** Nomes das tools do especialista (para bindTools focado no planner). */
export function specialistToolNames(id: ConversationSpecialistId): ConversationToolName[] {
  return CONVERSATION_SPECIALISTS[id].tools.slice();
}

export function getConversationSpecialist(id: ConversationSpecialistId): ConversationSpecialist {
  return CONVERSATION_SPECIALISTS[id];
}

export function listConversationSpecialists(): ConversationSpecialist[] {
  return Object.values(CONVERSATION_SPECIALISTS);
}
