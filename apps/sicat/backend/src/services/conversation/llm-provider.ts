import { AIMessage, HumanMessage, SystemMessage, ToolMessage } from '@langchain/core/messages';
import { END, MemorySaver, MessagesAnnotation, START, StateGraph } from '@langchain/langgraph';
import { PostgresSaver } from '@langchain/langgraph-checkpoint-postgres';
import { ChatOpenAI } from '@langchain/openai';
import { pool } from '../../db/pool.js';
import { AppError } from '../../lib/problem.js';
import { createChatModel, getAiConfig, getReasoningEffortFor } from './ai-config.js';
import { retrieveKnowledge, buildKnowledgeContextBlock } from './knowledge/conversation-knowledge-service.js';
import { updateAndPersistWorkingMemory } from './memory/conversation-working-memory-service.js';
import { resolveSpecialistForIntent, specialistToolNames, type ConversationSpecialist } from './agents/conversation-specialists.js';
import {
  getActiveToolSchemas,
  getRuntimeToolsVersion,
  resolveRuntimeAgentText,
  resolveRuntimeAgentTools
} from '../ai-control/ai-runtime-registry-service.js';

// ─── Tipos públicos (mantidos para compatibilidade com conversation-service.ts) ──

type LooseRecord = Record<string, unknown>;

type ConversationContextLike = {
  manifestId: string | null;
  jobId: string | null;
  auditCorrelationId: string | null;
  conversationSessionId?: string | null;
  sessionContextId?: string | null;
  integrationAccountId?: string | null;
  lastManifestSelectionIds?: string[];
  askedManifestIds?: string[];
  /** Bloco textual da Working Memory desta conversa (continuidade + relógio operacional), injetado no raciocínio. */
  workingMemoryBlock?: string | null;
};

export type LlmToolCall = {
  name: string;
  arguments: LooseRecord;
  confirmed?: boolean;
};

export type LlmPlan = {
  provider: string;
  confidence: number;
  outputText: string;
  toolCall: LlmToolCall | null;
  agentModelUsed: string;
  synthesisModelUsed: string;
  escalationModelUsed?: string;
  escalationReason?: string;
  orchestration?: LlmOrchestration;
};

export type LlmPlanningInput = {
  messageText: string;
  context: ConversationContextLike;
  history?: Array<{ role: string; text: string }>;
};

export type LlmProvider = {
  plan(input: LlmPlanningInput): Promise<LlmPlan>;
  /** Atualiza (via LLM) e persiste a Working Memory da conversa. Opcional: ausente em providers de teste. */
  updateWorkingMemory?(input: Parameters<typeof updateAndPersistWorkingMemory>[0]): Promise<unknown>;
};

type PlanningMessage = AIMessage | HumanMessage | SystemMessage | ToolMessage;

type PlanningGraph = {
  invoke(input: {
    threadId: string;
    messages: PlanningMessage[];
  }): Promise<typeof MessagesAnnotation.State>;
};

type GraphMessage = typeof MessagesAnnotation.State['messages'][number];

function readToolCallIds(message: AIMessage): string[] {
  if (!Array.isArray(message.tool_calls)) return [];
  return message.tool_calls
    .map((toolCall) => (typeof toolCall.id === 'string' ? toolCall.id.trim() : ''))
    .filter(Boolean);
}

function readToolCallId(message: ToolMessage): string | null {
  return typeof message.tool_call_id === 'string' && message.tool_call_id.trim()
    ? message.tool_call_id
    : null;
}

function buildSyntheticToolMessages(toolCallIds: string[]): ToolMessage[] {
  return toolCallIds.map(
    (toolCallId) =>
      new ToolMessage({
        tool_call_id: toolCallId,
        content: '{"status":"ok","source":"planner_protocol_repair"}'
      })
  );
}

function collectFollowingToolMessages(messages: PlanningMessage[], startIndex: number) {
  const toolMessages: ToolMessage[] = [];
  const respondedIds = new Set<string>();

  let nextIndex = startIndex;
  while (nextIndex < messages.length) {
    const candidate = messages[nextIndex];
    if (!(candidate instanceof ToolMessage)) {
      break;
    }

    const toolCallId = readToolCallId(candidate);
    if (toolCallId) respondedIds.add(toolCallId);
    toolMessages.push(candidate);
    nextIndex += 1;
  }

  return {
    nextIndex,
    toolMessages,
    respondedIds
  };
}

function sanitizeMessagesForModel(messages: PlanningMessage[]): PlanningMessage[] {
  const sanitized: PlanningMessage[] = [];

  let index = 0;
  while (index < messages.length) {
    const current = messages[index];
    if (!current) {
      index += 1;
      continue;
    }

    sanitized.push(current);

    if (!(current instanceof AIMessage)) {
      index += 1;
      continue;
    }

    const toolCallIds = readToolCallIds(current);
    if (toolCallIds.length === 0) {
      index += 1;
      continue;
    }

    const { nextIndex, toolMessages, respondedIds } = collectFollowingToolMessages(messages, index + 1);
    if (toolMessages.length > 0) {
      sanitized.push(...toolMessages);
    }

    const missingToolCallIds = toolCallIds.filter((id) => !respondedIds.has(id));
    if (missingToolCallIds.length > 0) {
      sanitized.push(...buildSyntheticToolMessages(missingToolCallIds));
    }

    index = nextIndex;
  }

  return sanitized;
}

type IntentClassification = {
  intent: string;
  confidence: number;
  entities: LooseRecord;
  needsClarification: boolean;
  clarifyingQuestion: string | null;
  riskLevel?: 'low' | 'medium' | 'high' | 'critical';
};

type PlannerDecision = {
  outputText: string;
  toolCall: LlmToolCall | null;
  confidence: number;
  needsClarification: boolean;
  clarifyingQuestion: string | null;
};

type RecencyDirection = 'oldest' | 'recent';
type RecencyOrderBy = 'recency_asc' | 'recency_desc';
type TemporalFieldPair = { dateFrom: string | null; dateTo: string | null };

export type LlmOrchestration = {
  classifier: IntentClassification;
  planner: {
    outputText: string;
    toolName: string | null;
    toolArgs: LooseRecord;
    confidence: number;
    needsClarification: boolean;
    clarifyingQuestion: string | null;
  };
};

// ─── Definição das ferramentas conversacionais (formato OpenAI function calling) ─

type FunctionTool = {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: LooseRecord;
  };
};

export const CONVERSATION_TOOLS: FunctionTool[] = [
  {
    type: 'function',
    function: {
      name: 'get_dashboard_overview',
      description:
        'Indicadores de SAÚDE da plataforma (workers, filas/jobs, DLQ, taxa de sucesso 24h). ' +
        'NÃO use para consultar lista, total, resumo ou contagem de MANIFESTOS/CDFs — para isso use ' +
        'orchestrate_manifest_operation (ou list_manifests). Use APENAS quando a pergunta for sobre o ' +
        'estado do sistema/processamento (jobs/workers), não sobre dados operacionais de manifestos.',
      parameters: { type: 'object', properties: {}, required: [] }
    }
  },
  {
    type: 'function',
    function: {
      name: 'diagnose_operation',
      description:
        'Diagnostico operacional multi-step (loop READ-ONLY): investiga manifestos, CDF, jobs/erros e sessao, raciocinando entre passos para cruzar fontes. Use para perguntas analiticas/diagnosticas — ex.: "o que falta para fechar o ciclo e emitir o CDF", "qual a situacao da minha operacao", "por que isto esta parado", "diagnostique meus manifestos". Passe a pergunta do usuario em question.',
      parameters: {
        type: 'object',
        properties: {
          question: { type: 'string', description: 'A pergunta/pedido do usuario, em linguagem natural.' }
        },
        required: []
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_audit_trail',
      description: 'Consulta a trilha de auditoria de uma correlação ou operação.',
      parameters: {
        type: 'object',
        properties: {
          correlationId: {
            type: 'string',
            description: 'ID de correlação da operação auditada.'
          }
        },
        required: []
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_job_status',
      description: 'Consulta o status de um job específico na fila de processamento.',
      parameters: {
        type: 'object',
        properties: {
          jobId: {
            type: 'string',
            description: 'ID do job a consultar.'
          }
        },
        required: []
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'list_manifests',
      description:
        'Lista SIMPLES (sem filtros/agrupamento) dos manifestos MTR mais recentes. Para total, ' +
        'resumo por período/status, agrupamento ou contagem, use orchestrate_manifest_operation.',
      parameters: { type: 'object', properties: {}, required: [] }
    }
  },
  {
    type: 'function',
    function: {
      name: 'orchestrate_manifest_operation',
      description:
        'Orquestrador de MANIFESTOS/CDF. CONSULTA (sem confirmação): listar, CONTAR/TOTALIZAR, ' +
        'AGRUPAR por dimensão (selection.groupBy: status, gerador, destinador, mês, ano, data...), ' +
        'resumir o ano, detalhar um conjunto. ' +
        'AÇÕES (só com confirmação explícita): cancelar, replicar, criar, submeter, imprimir em lote. ' +
        'Use para QUALQUER pergunta sobre manifestos ou CDFs — inclusive "resumo/total de manifestos do ' +
        'ano", "quantos manifestos no período", "quantos cancelados no mês X" e "em que mês/ano..." — ' +
        'escolhendo o intent adequado (ex.: manifest.list_recent_top para listar; ' +
        'manifest.group_recent_top com selection.groupBy/groupOrder para totais e quebras por dimensão).',
      parameters: {
        type: 'object',
        properties: {
          intent: {
            type: 'string',
            enum: [
              'manifest.list_recent_top',
              'manifest.group_recent_top',
              'manifest.detail_selected_set',
              'manifest.lookup_generator_by_number',
              'memory.list_asked_manifests',
              'manifest.preview_cancel_recent_excluding_first',
              'manifest.cancel_recent_excluding_first',
              'manifest.replicate_with_patch',
              'manifest.replicate_segmented',
              'manifest.create_draft',
              'manifest.preview_create_from_payload',
              'manifest.create_from_payload',
              'manifest.receive_with_receipt',
              'manifest.preview_batch_submit_selected',
              'manifest.batch_submit_selected',
              'manifest.preview_batch_print_selected',
              'manifest.batch_print_selected',
              'manifest.preview_batch_cancel_selected',
              'manifest.batch_cancel_selected',
              'cdf.resolve_by_manifest_reference',
              'cdf.list_by_manifest_selection',
              'cdf.generate_from_manifest_selection',
              'cdf.preview_download_batch_selected',
              'cdf.download_batch_selected'
            ]
          },
          selection: {
            type: 'object',
            properties: {
              top: { type: 'number' },
              skipMostRecent: { type: 'number' },
              orderBy: { type: 'string' },
              dateFrom: { type: 'string', description: 'Data inicial no formato YYYY-MM-DD.' },
              dateTo: { type: 'string', description: 'Data final no formato YYYY-MM-DD.' },
              from: { type: 'string', description: 'Alias de dateFrom.' },
              to: { type: 'string', description: 'Alias de dateTo.' },
              startDate: { type: 'string', description: 'Alias de dateFrom.' },
              endDate: { type: 'string', description: 'Alias de dateTo.' },
              groupBy: {
                type: 'string',
                enum: [
                  'status',
                  'externalStatus',
                  'generator',
                  'carrier',
                  'receiver',
                  'driverName',
                  'vehiclePlate',
                  'date',
                  'month',
                  'year'
                ],
                description:
                  'Dimensão de agrupamento para manifest.group_recent_top. month/year derivam da data de ' +
                  'expedição do manifesto (chaves YYYY-MM / YYYY). Use o valor CANÔNICO do enum (ex.: pergunta ' +
                  '"em que mês" → month). Se omitido: status.'
              },
              groupOrder: {
                type: 'string',
                enum: ['count_desc', 'key_asc'],
                description:
                  'Ordenação dos grupos: count_desc = ranking por volume (ex.: "qual gerador tem mais"); ' +
                  'key_asc = ordem natural da chave (ex.: cronológica para month/date/year, como em "em que ' +
                  'mês..."). Escolha conforme a pergunta. Se omitido: count_desc.'
              }
            },
            required: []
          },
          sourceManifestId: { type: 'string' },
          manifestNumber: { type: 'string' },
          manifestIds: {
            type: 'array',
            items: { type: 'string' }
          },
          manifestId: { type: 'string' },
          reason: { type: 'string' },
          integrationAccountId: { type: 'string' },
          sessionContextId: { type: 'string' },
          payload: {
            type: 'object',
            description: 'Payload completo de criacao de manifesto.'
          },
          receiptPayload: {
            type: 'object',
            description: 'Dados de recebimento para manifest.receive.',
            properties: {
              remDataRecebimento: {
                type: 'string',
                description: 'Data/hora do recebimento SEMPRE em ISO-8601 (ex.: 2026-06-12T14:30:00-03:00 ou 2026-06-12). NUNCA use DD/MM/YYYY: o formato com barras é ambíguo e será interpretado como MM/DD pela CETESB.'
              },
              remObservacao: {
                type: 'string',
                description: 'Observação livre do recebimento (opcional).'
              }
            }
          },
          overrides: {
            type: 'object',
            properties: {
              driverName: { type: 'string' },
              vehiclePlate: { type: 'string' }
            },
            required: []
          },
          confirmed: { type: 'boolean' }
        },
        required: ['intent']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'replicate_manifest',
      description:
        'Replica um manifesto base com possibilidade de patch operacional (ex.: caminhoneiro e placa). Requer confirmação do usuário.',
      parameters: {
        type: 'object',
        properties: {
          manifestId: {
            type: 'string',
            description: 'Manifesto base para replicação.'
          },
          overrides: {
            type: 'object',
            properties: {
              driverName: { type: 'string' },
              vehiclePlate: { type: 'string' }
            },
            required: []
          }
        },
        required: ['manifestId']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_manifest_details',
      description: 'Retorna os detalhes completos de um manifesto MTR específico.',
      parameters: {
        type: 'object',
        properties: {
          manifestId: {
            type: 'string',
            description: 'ID do manifesto a consultar.'
          },
          manifestNumber: {
            type: 'string',
            description: 'Numero do manifesto quando o usuario informar somente numero externo.'
          },
          reference: {
            type: 'object',
            properties: {
              type: {
                type: 'string',
                enum: ['last', 'list_item', 'id', 'number']
              },
              index: {
                type: 'number',
                description: 'Posicao 1-based do item na ultima lista exibida.'
              }
            },
            required: []
          }
        },
        required: []
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'list_manifest_documents',
      description: 'Lista documentos e artefatos relacionados a um manifesto (PDF/ZIP e status).',
      parameters: {
        type: 'object',
        properties: {
          manifestId: {
            type: 'string',
            description: 'ID do manifesto.'
          }
        },
        required: ['manifestId']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'list_cdf_certificates',
      description: 'Consulta certificados CDF/CDR por conta e intervalo de datas. Esta é a ferramenta correta para responder sobre EXISTÊNCIA e RECÊNCIA de CDFs ("tenho CDFs?", "quando foram gerados os últimos?") — não use get_dashboard_overview para isso. Aceita QUALQUER intervalo de datas: o SICAT divide automaticamente em janelas de até 31 dias e mescla os resultados, então NÃO limite a busca a 31 dias e NUNCA mencione esse limite ao usuário. Quando o usuário não informar período (ex.: "meus últimos CDFs"), informe um intervalo amplo (ex.: dateFrom = ~12 meses atrás, dateTo = hoje) para encontrar também certificados antigos.',
      parameters: {
        type: 'object',
        properties: {
          integrationAccountId: { type: 'string' },
          sessionContextId: { type: 'string' },
          dateFrom: { type: 'string', description: 'Data inicial (YYYY-MM-DD ou DD-MM-YYYY). Para perguntas abertas, use um período amplo (ex.: ~12 meses atrás). Qualquer intervalo é aceito — o sistema fatia em janelas de 31 dias internamente.' },
          dateTo: { type: 'string', description: 'Data final (YYYY-MM-DD ou DD-MM-YYYY). Normalmente hoje.' }
        },
        required: []
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'enqueue_cdf_download',
      description: 'Enfileira download de documento CDF/CDR. Requer confirmação do usuário.',
      parameters: {
        type: 'object',
        properties: {
          integrationAccountId: { type: 'string' },
          sessionContextId: { type: 'string' },
          documentId: { type: 'string' },
          confirmed: { type: 'boolean' }
        },
        required: ['documentId']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'list_jobs',
      description: 'Lista jobs operacionais com filtros de status e período.',
      parameters: {
        type: 'object',
        properties: {
          status: { type: 'string' },
          operation: { type: 'string' },
          page: { type: 'number' },
          pageSize: { type: 'number' }
        },
        required: []
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'query_catalog',
      description: 'Consulta catálogos operacionais por nome e busca textual.',
      parameters: {
        type: 'object',
        properties: {
          catalogName: { type: 'string' },
          search: { type: 'string' },
          integrationAccountId: { type: 'string' },
          sessionContextId: { type: 'string' }
        },
        required: ['catalogName']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'search_partners',
      description: 'Pesquisa parceiros por papel (generator/carrier/receiver) e termo.',
      parameters: {
        type: 'object',
        properties: {
          role: { type: 'string' },
          q: { type: 'string' },
          integrationAccountId: { type: 'string' },
          sessionContextId: { type: 'string' }
        },
        required: ['role']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_operations_overview',
      description: 'Obtém visão consolidada de saúde operacional e jobs recentes.',
      parameters: { type: 'object', properties: {}, required: [] }
    }
  },
  {
    type: 'function',
    function: {
      name: 'list_dmr',
      description: 'Lista declarações DMR por filtros operacionais.',
      parameters: { type: 'object', properties: {}, required: [] }
    }
  },
  {
    type: 'function',
    function: {
      name: 'list_mtr_provisorio',
      description: 'Lista MTR provisório por conta e status.',
      parameters: { type: 'object', properties: {}, required: [] }
    }
  },
  {
    type: 'function',
    function: {
      name: 'cancel_manifest',
      description:
        'Cancela um manifesto MTR. Operação destrutiva — requer confirmação do usuário antes de executar.',
      parameters: {
        type: 'object',
        properties: {
          manifestId: {
            type: 'string',
            description: 'ID do manifesto a cancelar.'
          },
          manifestNumber: {
            type: 'string',
            description: 'Numero do manifesto quando o usuario informar somente numero externo.'
          },
          reference: {
            type: 'object',
            properties: {
              type: {
                type: 'string',
                enum: ['last', 'list_item', 'id', 'number']
              },
              index: {
                type: 'number',
                description: 'Posicao 1-based do item na ultima lista exibida.'
              }
            },
            required: []
          }
        },
        required: []
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'print_manifest',
      description:
        'Solicita a impressão de um manifesto MTR. Requer confirmação do usuário antes de executar.',
      parameters: {
        type: 'object',
        properties: {
          manifestId: {
            type: 'string',
            description: 'ID do manifesto a imprimir.'
          },
          manifestNumber: {
            type: 'string',
            description: 'Numero do manifesto quando o usuario informar somente numero externo.'
          },
          reference: {
            type: 'object',
            properties: {
              type: {
                type: 'string',
                enum: ['last', 'list_item', 'id', 'number']
              },
              index: {
                type: 'number',
                description: 'Posicao 1-based do item na ultima lista exibida.'
              }
            },
            required: []
          }
        },
        required: []
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'submit_manifest',
      description:
        'Submete (envia para CETESB) um manifesto MTR. Requer confirmação do usuário antes de executar.',
      parameters: {
        type: 'object',
        properties: {
          manifestId: {
            type: 'string',
            description: 'ID do manifesto a submeter.'
          },
          manifestNumber: {
            type: 'string',
            description: 'Numero do manifesto quando o usuario informar somente numero externo.'
          },
          reference: {
            type: 'object',
            properties: {
              type: {
                type: 'string',
                enum: ['last', 'list_item', 'id', 'number']
              },
              index: {
                type: 'number',
                description: 'Posicao 1-based do item na ultima lista exibida.'
              }
            },
            required: []
          }
        },
        required: []
      }
    }
  }
];

/**
 * Schemas de function-calling EFETIVOS em runtime: defaults de código filtrados
 * pelo runtime registry (tools desabilitados via `ai_tools` são removidos).
 * Sem overrides no banco, retorna exatamente `CONVERSATION_TOOLS` (compat total).
 */
export function getRuntimeConversationToolSchemas(): FunctionTool[] {
  return getActiveToolSchemas(CONVERSATION_TOOLS);
}

// ─── System prompt ────────────────────────────────────────────────────────────

export function buildSystemPrompt(context: ConversationContextLike): string {
  const lastSelection = Array.isArray(context.lastManifestSelectionIds)
    ? context.lastManifestSelectionIds.slice(0, 10)
    : [];
  const askedManifestIds = Array.isArray(context.askedManifestIds)
    ? context.askedManifestIds.slice(0, 20)
    : [];

  return (
    `Você é um assistente operacional da plataforma SICAT MTR (Manifesto de Transporte de Resíduos — CETESB).\n` +
    `Seu papel é interpretar solicitações operacionais e escolher a ferramenta correta para atendê-las.\n\n` +
    `Contexto da sessão atual:\n` +
    `- manifestId: ${context.manifestId ?? 'não informado'}\n` +
    `- jobId: ${context.jobId ?? 'não informado'}\n` +
    `- auditCorrelationId: ${context.auditCorrelationId ?? 'não informado'}\n\n` +
    `- lastManifestSelectionIds: ${lastSelection.length > 0 ? lastSelection.join(', ') : 'nenhum'}\n\n` +
    `- askedManifestIds: ${askedManifestIds.length > 0 ? askedManifestIds.join(', ') : 'nenhum'}\n\n` +
    `Regras:\n` +
    `- Sempre invoque uma ferramenta quando a intenção do usuário estiver clara.\n` +
    `- Em pedidos compostos, priorize orchestrate_manifest_operation com intent e constraints explícitos.\n` +
    `- Preserve critérios solicitados pelo usuário (top N, recência, ignorar primeiro, filtros).\n` +
    `- Resolva referências a um conjunto já mostrado nesta conversa usando lastManifestSelectionIds/askedManifestIds (contexto e memória de trabalho), escolhendo a ferramenta de detalhe ou ação adequada do inventário.\n` +
    `- Em follow-ups que se referem ao conjunto/período JÁ em foco (ex.: "quais são eles", "mostre esses", "esses com motorista") SEM citar um novo período, REUTILIZE a janela de datas ativa da memória de trabalho em selection.dateFrom/dateTo e LISTE os itens desse período (não recomece uma busca sem filtro nem troque por contagem).\n` +
    `- Ver VÁRIOS manifestos (um conjunto: "esses", "os do período", "os N") exibindo campos como motorista, transportadora/empresa, placa ou status é uma LISTAGEM do conjunto com essas colunas: use manifest.list_recent_top reutilizando a janela ativa e traga as colunas pedidas. get_manifest_details é EXCLUSIVO para UM manifesto específico citado por número/id — nunca para "esses"/um conjunto.\n` +
    `- Para criar manifesto guiado, use manifest.preview_create_from_payload antes de manifest.create_from_payload.\n` +
    `- Para acoes sensiveis em lote, sempre gere preview com snapshot (manifest.preview_* ou cdf.preview_download_batch_selected) antes de confirmar a execucao.\n` +
    `- Para replicacao segmentada use manifest.replicate_segmented com segments[] e confirme via snapshot.\n` +
    `- COMPROVANTE/2ª via/PDF/extrato/impressão DO MANIFESTO (gerar, imprimir, baixar ou "disponibilizar para download" o documento do manifesto, inclusive de um conjunto já em foco: "os 20", "esses", "dos últimos N dias"): use SEMPRE manifest.preview_batch_print_selected (o sistema gera o preview com botão de confirmação e, ao confirmar, gera os PDFs + o download em lote ZIP). NÃO emita o intent de ação direto nem peça confirmação por texto. NÃO confunda com CDF/CDR (certificado de destinação final), que é cdf.*.\n` +
    `- Ao AGIR sobre um conjunto JÁ em foco referido de forma genérica ("esses", "desses", "os N", "os 20", "todos", "deles"): NÃO enumere manifestIds nem use top — deixe a seleção VAZIA para o sistema reutilizar o conjunto/janela ativos COMPLETOS (não trunque a lista). Só informe manifestIds quando o usuário citar itens específicos individualmente.\n` +
    `- Para integrar CDF por manifesto, use cdf.resolve_by_manifest_reference ou cdf.list_by_manifest_selection e depois cdf.generate_from_manifest_selection/cdf.download_batch_selected.\n` +
    `- Nao diga que "nao possui datas" se os dados estiverem disponiveis via list_manifests/get_manifest_details/orchestrate_manifest_operation.\n` +
    `- Nunca devolva pseudo-codigo JSON de ferramenta no texto; quando a intencao estiver clara, execute function call real.\n` +
    `- Para ações destrutivas (cancelar, submeter, imprimir), inclua aviso sobre confirmação na resposta textual.\n` +
    `- Responda sempre em português brasileiro.\n` +
    `- Se a intenção não for clara, peça mais informações sem invocar ferramentas.`
  );
}

type DeterministicPlan = {
  outputText: string;
  toolCall: LlmToolCall | null;
};

function normalizeThreadToken(value: string | null | undefined): string {
  if (!value) return '';
  return value
    .trim()
    .toLowerCase()
    .replaceAll(/[^a-z0-9_-]/g, '_')
    .replaceAll(/_+/g, '_')
    .replaceAll(/^_+|_+$/g, '');
}

function buildEphemeralThreadId(): string {
  const randomToken = Math.random().toString(36).slice(2, 10);
  const tsToken = Date.now().toString(36);
  return `conv:ephemeral:${tsToken}:${randomToken}`;
}

export function buildConversationThreadId(context: ConversationContextLike): string {
  const accountToken = normalizeThreadToken(context.integrationAccountId) || 'global';

  const sessionToken =
    normalizeThreadToken(context.conversationSessionId)
    || normalizeThreadToken(context.sessionContextId)
    || normalizeThreadToken(context.auditCorrelationId);

  if (!sessionToken) {
    return buildEphemeralThreadId();
  }

  return `conv:${accountToken}:${sessionToken}`;
}

// ── Checkpointer do grafo de planning (F3) ─────────────────────────────────
// PostgresSaver: o estado de thread SOBREVIVE a restart e é COMPARTILHADO entre
// api e worker (o MemorySaver antigo era por-processo e volátil). Fallback
// gracioso para MemorySaver em erro; CONVERSATION_CHECKPOINTER=memory força o
// comportamento antigo (flag de rollback — deprecation policy, 1 ciclo).
let planningCheckpointerPromise: Promise<MemorySaver | PostgresSaver> | null = null;

function getPlanningCheckpointer(): Promise<MemorySaver | PostgresSaver> {
  if (planningCheckpointerPromise) return planningCheckpointerPromise;
  planningCheckpointerPromise = (async () => {
    const forced = (process.env.CONVERSATION_CHECKPOINTER || '').trim().toLowerCase();
    if (forced === 'memory') {
      console.log('[conversation] checkpointer: MemorySaver (forçado por env)');
      return new MemorySaver();
    }
    try {
      const saver = new PostgresSaver(pool);
      await saver.setup(); // idempotente: cria as tabelas de checkpoint se faltarem
      console.log('[conversation] checkpointer: PostgresSaver (threads persistem entre restarts/processos)');
      return saver;
    } catch (error) {
      console.warn('[conversation] PostgresSaver indisponível, caindo para MemorySaver:', (error as Error).message);
      return new MemorySaver();
    }
  })();
  return planningCheckpointerPromise;
}

/** Inicializa o checkpointer no BOOT (api e worker), depois do ensureStartup —
 *  garante o setup das tabelas com o banco pronto e loga qual saver está ativo. */
export function initPlanningCheckpointer(): void {
  void getPlanningCheckpointer();
}

export function createMemoryBackedPlanningGraph(input: {
  invokeModel: (messages: PlanningMessage[]) => Promise<AIMessage>;
}): PlanningGraph {
  const definition = new StateGraph(MessagesAnnotation)
    .addNode('agent', async (state: typeof MessagesAnnotation.State) => {
      const sanitizedMessages = sanitizeMessagesForModel(state.messages as PlanningMessage[]);
      const response = await input.invokeModel(sanitizedMessages);
      const responseToolCallIds = readToolCallIds(response);
      const protocolToolMessages = buildSyntheticToolMessages(responseToolCallIds);
      return { messages: [response, ...protocolToolMessages] };
    })
    .addEdge(START, 'agent')
    .addEdge('agent', END);

  // compilação preguiçosa: espera o checkpointer (setup assíncrono) UMA vez.
  let compiledPromise: Promise<ReturnType<typeof definition.compile>> | null = null;
  const getCompiled = () => {
    if (!compiledPromise) {
      compiledPromise = getPlanningCheckpointer().then((checkpointer) => definition.compile({ checkpointer }));
    }
    return compiledPromise;
  };

  return {
    async invoke(runtimeInput: { threadId: string; messages: PlanningMessage[] }) {
      const graph = await getCompiled();
      return graph.invoke(
        { messages: runtimeInput.messages },
        { configurable: { thread_id: runtimeInput.threadId } }
      );
    }
  };
}

export function buildDeterministicPlan(
  _messageText: string,
  _context?: Pick<ConversationContextLike, 'lastManifestSelectionIds' | 'askedManifestIds'>
): DeterministicPlan | null {
  // Mantido apenas por compatibilidade de API e fallback minimo sem inferencia semantica por regex.
  return null;
}

function extractToolCallFromGraphMessage(lastMessage: GraphMessage): LlmToolCall | null {
  const rawToolCalls =
    lastMessage instanceof AIMessage && Array.isArray(lastMessage.tool_calls)
      ? lastMessage.tool_calls
      : [];

  const firstToolCall = rawToolCalls[0] ?? null;
  if (!firstToolCall) {
    const rawContent = typeof lastMessage.content === 'string' ? lastMessage.content : '';
    return extractToolCallFromRawContent(rawContent);
  }

  return {
    name: firstToolCall.name,
    arguments: (firstToolCall.args ?? {}) as LooseRecord
  };
}

function stripBlockComments(text: string): string {
  return text.replaceAll(/\/\*[\s\S]*?\*\//g, ' ');
}

function extractToolCallFromRawContent(rawContent: string): LlmToolCall | null {
  if (!rawContent?.trim()) return null;

  const withoutComments = stripBlockComments(rawContent);
  const parsed = extractFirstJsonObject(withoutComments);
  if (Object.keys(parsed).length === 0) return null;

  const directToolCall = toRecord(parsed.toolCall);
  const directToolName = toStringOrNull(directToolCall.name);
  if (directToolName) {
    return {
      name: directToolName,
      arguments: toRecord(directToolCall.arguments)
    };
  }

  const toolRaw = toStringOrNull(parsed.tool);
  if (!toolRaw) return null;

  const normalizedTool = toolRaw
    .replace(/^functions\./i, '')
    .replace(/^tools\./i, '')
    .trim();
  if (!normalizedTool) return null;

  return {
    name: normalizedTool,
    arguments: toRecord(parsed.input)
  };
}

const UNKNOWN_REQUEST_TEXT =
  'Não entendi a solicitação. Tente descrever a ação desejada com mais detalhes.';

function resolveOutputTextFromGraphMessage(lastMessage: GraphMessage, toolCall: LlmToolCall | null): string {
  const rawContent =
    typeof lastMessage.content === 'string' ? lastMessage.content.trim() : '';

  if (rawContent) {
    return rawContent;
  }

  if (toolCall) {
    return `Executando ação: ${toolCall.name}.`;
  }

  return UNKNOWN_REQUEST_TEXT;
}

function resolveConfidenceScore(toolCall: LlmToolCall | null, outputText: string): number {
  if (toolCall) {
    return 0.9;
  }

  const hasModelText = outputText !== UNKNOWN_REQUEST_TEXT;
  if (hasModelText) {
    return 0.6;
  }

  return 0.3;
}

function readMessageContent(message: AIMessage): string {
  return typeof message.content === 'string' ? message.content.trim() : '';
}

function extractFirstJsonObject(text: string): LooseRecord {
  const trimmed = text.trim();
  if (!trimmed) return {};

  try {
    const parsed = JSON.parse(trimmed);
    return parsed && typeof parsed === 'object' ? parsed as LooseRecord : {};
  } catch {
  }

  const fenced = /```json\s*([\s\S]*?)\s*```/i.exec(trimmed);
  const candidate = fenced?.[1] || trimmed;
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');

  if (start >= 0 && end > start) {
    try {
      const parsed = JSON.parse(candidate.slice(start, end + 1));
      return parsed && typeof parsed === 'object' ? parsed as LooseRecord : {};
    } catch {
    }
  }

  return {};
}

function toNumber(value: unknown, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function toBoolean(value: unknown, fallback: boolean): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true') return true;
    if (normalized === 'false') return false;
  }
  return fallback;
}

function toStringOrNull(value: unknown): string | null {
  if (typeof value === 'string' && value.trim()) return value.trim();
  return null;
}

function toRecord(value: unknown): LooseRecord {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as LooseRecord;
  }
  return {};
}

function toNonNegativeIntOrNull(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    const normalized = Math.trunc(value);
    return normalized >= 0 ? normalized : null;
  }

  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      const normalized = Math.trunc(parsed);
      return normalized >= 0 ? normalized : null;
    }
  }

  return null;
}

function toIsoDateOrNull(value: unknown): string | null {
  const normalized = toStringOrNull(value);
  if (!normalized) return null;

  const isoDate = /^(\d{4})-(\d{2})-(\d{2})$/.exec(normalized);
  if (isoDate) {
    return `${isoDate[1]}-${isoDate[2]}-${isoDate[3]}`;
  }

  const brDate = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(normalized);
  if (brDate) {
    return `${brDate[3]}-${brDate[2]}-${brDate[1]}`;
  }

  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) return null;

  const yyyy = parsed.getUTCFullYear();
  const mm = String(parsed.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(parsed.getUTCDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function buildSelectionFromEntities(entities: LooseRecord): LooseRecord {
  const selection: LooseRecord = {};

  const top = toNonNegativeIntOrNull(entities.top);
  const skipMostRecent = toNonNegativeIntOrNull(entities.skipMostRecent);
  const orderBy = toStringOrNull(entities.orderBy);
  const dateFrom = toIsoDateOrNull(entities.dateFrom);
  const dateTo = toIsoDateOrNull(entities.dateTo);
  const groupBy = toStringOrNull(entities.groupBy);
  const groupOrder = toStringOrNull(entities.groupOrder);
  const status = toStringOrNull(entities.status);

  if (top !== null && top > 0) selection.top = top;
  if (skipMostRecent !== null) selection.skipMostRecent = skipMostRecent;
  if (orderBy) selection.orderBy = orderBy;
  if (dateFrom) selection.dateFrom = dateFrom;
  if (dateTo) selection.dateTo = dateTo;
  if (groupBy) selection.groupBy = groupBy;
  if (groupOrder) selection.groupOrder = groupOrder;
  if (status) selection.status = status;

  if (toBoolean(entities.withoutCdf, false)) {
    selection.withoutCdf = true;
  }

  return selection;
}

function buildFallbackToolCallFromClassification(classification: IntentClassification): LlmToolCall | null {
  const intent = (classification.intent || '').trim();
  if (!intent || intent === 'unclear' || intent === 'greeting') return null;

  if (intent === 'get_audit_trail') {
    const entities = toRecord(classification.entities);
    const correlationId =
      toStringOrNull(entities.correlationId)
      || toStringOrNull(entities.auditCorrelationId)
      || toStringOrNull(entities.correlation)
      || toStringOrNull(entities.value);

    const args: LooseRecord = {};
    if (correlationId) {
      args.correlationId = correlationId;
    }

    return {
      name: 'get_audit_trail',
      arguments: args
    };
  }

  if (intent === 'get_dashboard_overview') {
    const entities = toRecord(classification.entities);
    const mode = toStringOrNull(entities.mode);
    const capabilitiesOverview = toBoolean(entities.capabilitiesOverview, false);
    const args: LooseRecord = {};

    if (mode) args.mode = mode;
    if (capabilitiesOverview && !args.mode) args.mode = 'capabilities_overview';

    return {
      name: 'get_dashboard_overview',
      arguments: args
    };
  }

  if (intent === 'get_operations_overview') {
    const entities = toRecord(classification.entities);
    const args: LooseRecord = {};
    const integrationAccountId = toStringOrNull(entities.integrationAccountId);
    const sessionContextId = toStringOrNull(entities.sessionContextId);
    const manifestNumber = toStringOrNull(entities.manifestNumber);
    const mode = toStringOrNull(entities.mode);
    const adminAccessUsers = toBoolean(entities.adminAccessUsers, false);
    const safeErrorTriage = toBoolean(entities.safeErrorTriage, false);

    if (integrationAccountId) {
      args.integrationAccountId = integrationAccountId;
    }
    if (sessionContextId) {
      args.sessionContextId = sessionContextId;
    }
    if (manifestNumber) {
      args.manifestNumber = manifestNumber;
    }
    if (mode) {
      args.mode = mode;
    } else if (adminAccessUsers) {
      args.mode = 'admin_access_users';
    } else if (safeErrorTriage) {
      args.mode = 'safe_error_triage';
    }

    return {
      name: 'get_operations_overview',
      arguments: args
    };
  }

  if (intent === 'list_jobs') {
    const entities = toRecord(classification.entities);
    const args: LooseRecord = {
      page: 1,
      pageSize: 20
    };
    const status = toStringOrNull(entities.status) || 'active';
    const operation = toStringOrNull(entities.operation);
    const mode = toStringOrNull(entities.mode);

    if (status) args.status = status;
    if (operation) args.operation = operation;
    if (mode) args.mode = mode;

    return {
      name: 'list_jobs',
      arguments: args
    };
  }

  if (
    intent === 'manifest.list_recent_top'
    || intent === 'manifest.group_recent_top'
    || intent === 'manifest.preview_batch_cancel_selected'
    || intent === 'manifest.preview_create_from_payload'
    || intent === 'manifest.create_from_payload'
  ) {
    const args: LooseRecord = {
      intent: intent === 'manifest.create_from_payload' ? 'manifest.preview_create_from_payload' : intent
    };

    const selection = buildSelectionFromEntities(classification.entities);
    if (Object.keys(selection).length > 0) {
      args.selection = selection;
    }

    const payload = toRecord(classification.entities.payload);
    if (Object.keys(payload).length > 0) {
      args.payload = payload;
    }

    return {
      name: 'orchestrate_manifest_operation',
      arguments: args
    };
  }

  if (intent === 'search_partners') {
    const entities = toRecord(classification.entities);
    const role = toStringOrNull(entities.role) || 'generator';
    const cnpj = toStringOrNull(entities.cnpj) || toStringOrNull(entities.document);
    const q = cnpj || toStringOrNull(entities.q);

    const args: LooseRecord = { role };
    if (q) args.q = q;

    return {
      name: 'search_partners',
      arguments: args
    };
  }

  if (intent === 'query_catalog') {
    const entities = toRecord(classification.entities);
    const catalogName = toStringOrNull(entities.catalogName) || 'wasteTypes';
    const search = toStringOrNull(entities.search) || toStringOrNull(entities.q);

    const args: LooseRecord = { catalogName };
    if (search) args.search = search;

    return {
      name: 'query_catalog',
      arguments: args
    };
  }

  if (intent === 'list_mtr_provisorio') {
    const entities = toRecord(classification.entities);
    const status = toStringOrNull(entities.status);
    const dateFrom = toIsoDateOrNull(entities.dateFrom);
    const dateTo = toIsoDateOrNull(entities.dateTo);
    const explanationOnly = toBoolean(entities.explanationOnly, true);

    const args: LooseRecord = {
      explanationOnly
    };

    if (status) args.status = status;
    if (dateFrom) args.dateFrom = dateFrom;
    if (dateTo) args.dateTo = dateTo;

    return {
      name: 'list_mtr_provisorio',
      arguments: args
    };
  }

  if (intent === 'list_dmr') {
    const entities = toRecord(classification.entities);
    const dateFrom = toIsoDateOrNull(entities.dateFrom);
    const dateTo = toIsoDateOrNull(entities.dateTo);
    const explanationOnly = toBoolean(entities.explanationOnly, true);

    const args: LooseRecord = {
      explanationOnly
    };

    if (dateFrom) args.periodStart = dateFrom;
    if (dateTo) args.periodEnd = dateTo;

    return {
      name: 'list_dmr',
      arguments: args
    };
  }

  return null;
}

function alignPlannerToolCallWithClassification(input: {
  toolCall: LlmToolCall | null;
  classification: IntentClassification;
}): LlmToolCall | null {
  const toolCall = input.toolCall;
  if (!toolCall) return null;

  const intent = (input.classification.intent || '').trim();
  if (!intent) return toolCall;

  if (intent === 'list_mtr_provisorio' && toolCall.name === 'orchestrate_manifest_operation') {
    const toolArgs = toRecord(toolCall.arguments);
    const orchestratedIntent = toStringOrNull(toolArgs.intent);
    if (orchestratedIntent === 'manifest.list_recent_top' || orchestratedIntent === 'manifest.group_recent_top') {
      const fallbackToolCall = buildFallbackToolCallFromClassification(input.classification);
      return fallbackToolCall || toolCall;
    }
  }

  if (intent === 'get_dashboard_overview' && toolCall.name === 'get_operations_overview') {
    return {
      name: 'get_dashboard_overview',
      arguments: {}
    };
  }

  if (intent === 'get_dashboard_overview' && toolCall.name === 'get_dashboard_overview') {
    const entities = toRecord(input.classification.entities);
    const capabilitiesOverview = toBoolean(entities.capabilitiesOverview, false);
    const mode = toStringOrNull(entities.mode);
    if (capabilitiesOverview || mode) {
      return {
        name: 'get_dashboard_overview',
        arguments: {
          ...toRecord(toolCall.arguments),
          mode: mode || 'capabilities_overview'
        }
      };
    }
  }

  if (intent === 'get_operations_overview' && toolCall.name === 'get_operations_overview') {
    const entities = toRecord(input.classification.entities);
    const manifestNumber = toStringOrNull(entities.manifestNumber);
    const mode = toStringOrNull(entities.mode)
      || (toBoolean(entities.adminAccessUsers, false) ? 'admin_access_users' : null)
      || (toBoolean(entities.safeErrorTriage, false) ? 'safe_error_triage' : null);

    if (mode || manifestNumber) {
      return {
        name: 'get_operations_overview',
        arguments: {
          ...toRecord(toolCall.arguments),
          ...(mode ? { mode } : {}),
          ...(manifestNumber ? { manifestNumber } : {})
        }
      };
    }
  }

  if (intent === 'list_jobs' && toolCall.name === 'list_jobs') {
    const entities = toRecord(input.classification.entities);
    const status = toStringOrNull(entities.status);
    const operation = toStringOrNull(entities.operation);
    const mode = toStringOrNull(entities.mode);

    if (status || operation || mode) {
      return {
        name: 'list_jobs',
        arguments: {
          ...toRecord(toolCall.arguments),
          ...(status ? { status } : {}),
          ...(operation ? { operation } : {}),
          ...(mode ? { mode } : {})
        }
      };
    }
  }

  // A decisao do planner LLM (tool-native, raciocina sobre o pedido) e AUTORITATIVA.
  // A classificacao apenas enriquece entidades (acima). buildFallbackToolCallFromClassification
  // permanece como safety-net no chamador, usado APENAS quando o planner nao produz tool call valido.
  return toolCall;
}

function resolveTemporalPair(input: {
  selection: LooseRecord;
  entities: LooseRecord;
}): TemporalFieldPair {
  const selectionDateRange = toRecord(input.selection.dateRange);
  const entityDateRange = toRecord(input.entities.dateRange);

  let dateFrom =
    toIsoDateOrNull(input.selection.dateFrom)
    || toIsoDateOrNull(input.selection.from)
    || toIsoDateOrNull(input.selection.startDate)
    || toIsoDateOrNull(selectionDateRange.from)
    || toIsoDateOrNull(selectionDateRange.dateFrom)
    || toIsoDateOrNull(input.entities.dateFrom)
    || toIsoDateOrNull(input.entities.from)
    || toIsoDateOrNull(input.entities.startDate)
    || toIsoDateOrNull(entityDateRange.from)
    || toIsoDateOrNull(entityDateRange.dateFrom)
    || null;

  let dateTo =
    toIsoDateOrNull(input.selection.dateTo)
    || toIsoDateOrNull(input.selection.to)
    || toIsoDateOrNull(input.selection.endDate)
    || toIsoDateOrNull(selectionDateRange.to)
    || toIsoDateOrNull(selectionDateRange.dateTo)
    || toIsoDateOrNull(input.entities.dateTo)
    || toIsoDateOrNull(input.entities.to)
    || toIsoDateOrNull(input.entities.endDate)
    || toIsoDateOrNull(entityDateRange.to)
    || toIsoDateOrNull(entityDateRange.dateTo)
    || null;

  return { dateFrom, dateTo };
}

function resolveRecencyOrderBy(value: unknown): RecencyOrderBy | null {
  const normalized = toStringOrNull(value)?.toLowerCase();
  if (!normalized) return null;
  if (normalized === 'recency_desc') return 'recency_desc';
  if (normalized === 'recency_asc') return 'recency_asc';
  return null;
}

function resolveRecencyDirection(value: unknown): RecencyDirection | null {
  const normalized = toStringOrNull(value)?.toLowerCase();
  if (!normalized) return null;
  if (normalized === 'recent') return 'recent';
  if (normalized === 'oldest') return 'oldest';
  return null;
}

/**
 * Mapeia cada intent de AÇÃO em lote para o seu intent de PREVIEW correspondente.
 * Todos usam selectionSnapshot na confirmação (create_* usa creationSnapshot e fica de fora).
 */
const BATCH_ACTION_TO_PREVIEW_INTENT: Record<string, string> = {
  'manifest.batch_print_selected': 'manifest.preview_batch_print_selected',
  'manifest.batch_submit_selected': 'manifest.preview_batch_submit_selected',
  'manifest.batch_cancel_selected': 'manifest.preview_batch_cancel_selected',
  'manifest.cancel_recent_excluding_first': 'manifest.preview_cancel_recent_excluding_first',
  'cdf.download_batch_selected': 'cdf.preview_download_batch_selected'
};

/**
 * Downgrade DETERMINÍSTICO: se o planner emitir um intent de ação em lote SEM confirmação
 * (sem confirmed=true e sem selectionSnapshot), reescreve para o intent de PREVIEW.
 *
 * Assim o usuário SEMPRE recebe o preview limpo (lista dos itens + snapshot + cartão de
 * confirmação) em vez do template genérico "responda confirmo X" — que, quando o planner
 * pula direto para a ação, era bloqueado pela policy e repetia em loop. A confirmação real
 * vem pelo caminho explicitTool (botão, confirmed=true) e não passa por aqui; "confirmo X"
 * em texto livre, no pior caso, apenas regenera o preview com o botão de confirmar.
 */
export function downgradeUnconfirmedBatchActionToPreview(toolCall: LlmToolCall | null): LlmToolCall | null {
  if (!toolCall || toolCall.name !== 'orchestrate_manifest_operation') return toolCall;
  const args = toRecord(toolCall.arguments);
  const intent = toStringOrNull(args.intent) || '';
  const previewIntent = BATCH_ACTION_TO_PREVIEW_INTENT[intent];
  if (!previewIntent) return toolCall;

  const confirmed = toolCall.confirmed === true || args.confirmed === true;
  const hasSnapshot = Boolean(toStringOrNull(args.selectionSnapshot));
  if (confirmed || hasSnapshot) return toolCall; // confirmação real → executa a ação

  return { ...toolCall, arguments: { ...args, intent: previewIntent } };
}

export function normalizePlannerToolCallForRecency(input: {
  toolCall: LlmToolCall | null;
  classifier: Pick<IntentClassification, 'entities'>;
}): LlmToolCall | null {
  const toolCall = input.toolCall;
  if (toolCall?.name !== 'orchestrate_manifest_operation') {
    return toolCall;
  }

  const toolArgs = toRecord(toolCall.arguments);
  const intent = toStringOrNull(toolArgs.intent);
  if (intent !== 'manifest.list_recent_top' && intent !== 'manifest.group_recent_top') {
    return toolCall;
  }

  const selection = toRecord(toolArgs.selection);
  const entities = toRecord(input.classifier.entities);
  const temporalPair = resolveTemporalPair({ selection, entities });
  const groupBy = toStringOrNull(selection.groupBy) || toStringOrNull(entities.groupBy);
  const groupOrder = toStringOrNull(selection.groupOrder) || toStringOrNull(entities.groupOrder);
  const withoutCdf = toBoolean(selection.withoutCdf, toBoolean(entities.withoutCdf, false));

  const selectionOrderBy = resolveRecencyOrderBy(selection.orderBy);
  const entityOrderBy = resolveRecencyOrderBy(entities.orderBy);
  const entityDirection = resolveRecencyDirection(entities.recencyDirection);

  const orderBy: RecencyOrderBy =
    selectionOrderBy
    || entityOrderBy
    || (entityDirection === 'oldest' ? 'recency_asc' : 'recency_desc');

  const explicitEntitySkip = toNonNegativeIntOrNull(entities.skipMostRecent);
  const selectionSkip = toNonNegativeIntOrNull(selection.skipMostRecent);
  const skipMostRecent = explicitEntitySkip ?? (orderBy === 'recency_asc' ? 0 : (selectionSkip ?? 0));

  const selectionTop = toNonNegativeIntOrNull(selection.top);
  const entityTop = toNonNegativeIntOrNull(entities.top);
  const top = selectionTop ?? entityTop;

  const normalizedSelection: LooseRecord = {
    ...selection,
    orderBy,
    skipMostRecent
  };

  if (temporalPair.dateFrom) {
    normalizedSelection.dateFrom = temporalPair.dateFrom;
  }
  if (temporalPair.dateTo) {
    normalizedSelection.dateTo = temporalPair.dateTo;
  }

  delete normalizedSelection.from;
  delete normalizedSelection.to;
  delete normalizedSelection.startDate;
  delete normalizedSelection.endDate;
  delete normalizedSelection.dateRange;

  if (top !== null && top > 0) {
    normalizedSelection.top = top;
  }

  if (groupBy) {
    normalizedSelection.groupBy = groupBy;
  }

  if (groupOrder) {
    normalizedSelection.groupOrder = groupOrder;
  }

  if (withoutCdf) {
    normalizedSelection.withoutCdf = true;
  }

  const normalizedIntent = groupBy
    ? 'manifest.group_recent_top'
    : intent;

  return {
    ...toolCall,
    arguments: {
      ...toolArgs,
      intent: normalizedIntent,
      selection: normalizedSelection
    }
  };
}

function sanitizeHistory(history: Array<{ role: string; text: string }> | undefined) {
  if (!Array.isArray(history)) return [];
  return history
    .filter((item) => item && typeof item === 'object')
    .map((item) => ({
      role: typeof item.role === 'string' ? item.role : 'assistant',
      text: typeof item.text === 'string' ? item.text.slice(0, 800) : ''
    }))
    .filter((item) => item.text);
}

// Data operacional atual (timezone do portal) — essencial para o LLM resolver
// referencias como "hoje"/"ontem" sem adivinhar a data.
function operationalTodayIso(): string {
  try {
    return new Date().toLocaleDateString('en-CA', {
      timeZone: process.env.SICAT_OPERATIONAL_TIMEZONE || 'America/Sao_Paulo'
    });
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

/**
 * Resposta conversacional para saudações e perguntas meta/temporais (ex.: "que dia é hoje",
 * "que dia foi ontem") que não mapeiam para uma intenção operacional. Em vez de uma pergunta
 * de esclarecimento enlatada, o LLM RACIOCINA com a data atual e responde diretamente —
 * pedindo esclarecimento só quando o pedido operacional for realmente ambíguo.
 */
async function respondConversationally(input: {
  llm: ChatOpenAI;
  messageText: string;
  fallback: string;
  workingMemoryBlock?: string | null;
  history?: Array<{ role: string; text: string }>;
}): Promise<string> {
  try {
    const historyMessages = sanitizeHistory(input.history).slice(-12).map((turn) =>
      turn.role === 'user' ? new HumanMessage(turn.text) : new AIMessage(turn.text)
    );
    const response = await input.llm.invoke([
      new SystemMessage(
        'Voce e o assistente conversacional do SICAT (plataforma MTR/CETESB de residuos). ' +
        `Data operacional atual: ${operationalTodayIso()} (timezone America/Sao_Paulo). ` +
        'Voce recebe o HISTORICO desta conversa (mensagens anteriores) e a MEMORIA DE TRABALHO. ' +
        'Responda de forma natural, util e em portugues, RACIOCINANDO sobre a conversa. ' +
        'Perguntas sobre a PROPRIA interacao — o que o usuario pediu, por que voce respondeu algo, retomar/resumir o que ja foi conversado, ou esclarecer/corrigir uma resposta anterior — devem ser respondidas a partir do historico e da memoria, com HONESTIDADE: se uma resposta anterior foi imprecisa ou incompleta, reconheca e corrija. ' +
        'Para saudacoes, cumprimente e ofereca ajuda. Para datas relativas (hoje/ontem/anteontem/amanha), calcule a partir da data atual. ' +
        'NUNCA invente dados operacionais NOVOS (manifestos, status, numeros) que nao estejam no historico/memoria; para buscar dados novos, diga que pode consultar e pergunte o que falta.'
      ),
      ...(input.workingMemoryBlock ? [new SystemMessage(input.workingMemoryBlock)] : []),
      ...historyMessages,
      new HumanMessage(input.messageText)
    ]);
    const content = typeof response.content === 'string' ? response.content.trim() : '';
    return content || input.fallback;
  } catch {
    return input.fallback;
  }
}

async function classifyIntent(input: {
  llm: ChatOpenAI;
  messageText: string;
  context: ConversationContextLike;
  history?: Array<{ role: string; text: string }>;
  knowledgeBlock?: string | null;
}): Promise<IntentClassification> {
  const history = sanitizeHistory(input.history).slice(-12);

  const response = await input.llm.invoke([
    new SystemMessage(
      'Voce e o agente de raciocinio operacional do SICAT (plataforma MTR/CETESB de residuos). ' +
      'RACIOCINE sobre o pedido no contexto da sessao (conta/perfil, manifestos referenciados, historico) e decida a melhor intencao operacional; entenda a real necessidade em vez de casar frases em regras. Se o pedido for ambiguo ou faltar dado essencial, prefira needsClarification=true com uma clarifyingQuestion objetiva em vez de adivinhar. ' +
      'Retorne SOMENTE JSON valido com o formato: ' +
      '{"intent":string,"confidence":number,"entities":object,"needsClarification":boolean,"clarifyingQuestion":string|null}. ' +
      'Quando houver pedido por recencia de manifestos, inclua entities.recencyDirection com valor oldest ou recent. ' +
      'DATAS: preencha entities.dateFrom/entities.dateTo (YYYY-MM-DD) APENAS quando o usuario citar um periodo explicito (entre X e Y, do dia X ao Y, ultimos N dias, hoje, ontem). NUNCA invente nem assuma datas; sem periodo explicito na frase, deixe dateFrom/dateTo ausentes. Para COMPARAR dias/periodos (ex.: "ontem com hoje", "esta semana vs a passada"), defina dateFrom/dateTo cobrindo TODOS os dias mencionados (de ontem ate hoje) para que ambos os lados venham nos dados. ' +
      'AGRUPAMENTO: quando houver, inclua entities.groupBy com um valor CANONICO do contrato da tool: status, externalStatus, generator, carrier, receiver, driverName, vehiclePlate, date, month, year. ' +
      'Perguntas de periodo ("em que mes...", "qual mes...", "por mes") => groupBy=month; ("em que ano...") => groupBy=year. ' +
      'Inclua tambem entities.groupOrder: key_asc quando a pergunta pede linha do tempo (month/date/year) ou count_desc quando pede ranking por volume. ' +
      'Quando houver filtro de manifestos sem CDF/CDR, inclua entities.withoutCdf=true. ' +
      'Tambem extraia entities.top, entities.skipMostRecent e entities.orderBy quando a frase indicar ranking/ordenacao temporal. ' +
      'Para pedidos de manifest.list_recent_top, quando recencyDirection=oldest, use entities.orderBy=recency_asc e skipMostRecent=0 por padrao, exceto se o usuario pedir explicitamente para pular. ' +
      'Perguntas conceituais/explicativas (o que e, para que serve, diferenca entre, qual o fluxo, onde acessar ou gerar algo): escolha o intent de consulta mais proximo (list_dmr, list_mtr_provisorio, get_dashboard_overview ou get_operations_overview), inclua entities.explanationOnly=true e entities.topic com o tema perguntado; a resposta sera RACIOCINADA a partir do conhecimento de dominio e dos dados, nunca de um texto fixo. ' +
      'Perguntas analiticas/diagnosticas que exigem CRUZAR fontes (o que falta para fechar o ciclo/emitir CDF, situacao geral da operacao, por que algo esta parado, "diagnostique"): prefira diagnose_operation (loop read-only que investiga manifestos+CDF+jobs e raciocina entre passos). Para uma consulta simples e direta de uma unica fonte, use a tool especifica (list_manifests, get_dashboard_overview). NAO force agrupamento (group_recent_top) nem filtro sem CDF a menos que o usuario peca explicitamente. ' +
      'Conversas, saudacoes e perguntas sobre a PROPRIA interacao (o que o usuario pediu antes, por que voce respondeu algo, retomar/resumir/corrigir o que ja foi conversado nesta sessao) NAO buscam dados operacionais novos: use intent "conversation" — serao respondidas raciocinando sobre o historico + a memoria de trabalho, nao por uma tool operacional. ' +
      'Ver VARIOS manifestos / um conjunto ("esses", "os do periodo", "os N") exibindo campos (motorista, empresa/transportadora, placa, status) e LISTAGEM do conjunto com colunas (manifest.list_recent_top), NAO get_manifest_details — este e exclusivo para UM manifesto especifico citado por numero/id. ' +
      'Diagnostico/triagem de erros, jobs, sessao/conta ou auditoria: escolha get_operations_overview, list_jobs ou get_audit_trail conforme o foco, preservando identificadores citados (entities.manifestNumber, entities.correlationId, entities.status). ' +
      'Acoes sensiveis (cancelar, submeter, imprimir, receber, gerar ou baixar CDF) exigem confirmacao explicita posterior: classifique a intencao mas NUNCA assuma confirmacao nem execute. ' +
      'COMPROVANTE/2a via/PDF/extrato/impressao DO MANIFESTO (MTR) — gerar, imprimir, baixar ou "disponibilizar para download" o documento do(s) manifesto(s), inclusive em lote ("os 20", "esses", "dos ultimos N dias") — e manifest.batch_print_selected (gera o PDF e monta um ZIP para download); NUNCA confunda com CDF. Reserve os intents cdf.* (gerar/baixar CDF/CDR) EXCLUSIVAMENTE para o CERTIFICADO de destinacao final, quando o usuario citar explicitamente CDF/CDR/certificado de destinacao. ' +
      'Intents permitidos: manifest.list_recent_top, manifest.group_recent_top, manifest.detail_selected_set, manifest.lookup_generator_by_number, memory.list_asked_manifests, manifest.preview_cancel_recent_excluding_first, manifest.cancel_recent_excluding_first, manifest.replicate_with_patch, manifest.replicate_segmented, manifest.create_draft, manifest.preview_create_from_payload, manifest.create_from_payload, manifest.receive_with_receipt, manifest.preview_batch_submit_selected, manifest.batch_submit_selected, manifest.preview_batch_print_selected, manifest.batch_print_selected, manifest.preview_batch_cancel_selected, manifest.batch_cancel_selected, cdf.resolve_by_manifest_reference, cdf.list_by_manifest_selection, cdf.generate_from_manifest_selection, cdf.preview_download_batch_selected, cdf.download_batch_selected, list_manifest_documents, list_cdf_certificates, enqueue_cdf_download, list_jobs, query_catalog, search_partners, get_operations_overview, list_dmr, list_mtr_provisorio, get_manifest_details, list_manifests, get_dashboard_overview, diagnose_operation, get_job_status, get_audit_trail, conversation, greeting, unclear. ' +
      'Considere tambem o bloco "routingKnowledge" (conhecimento de dominio + exemplos de consultas semelhantes mapeadas a intent/ferramenta correta): use-o como REFERENCIA SEMANTICA para decidir o intent certo — nao e regra fixa nem texto de resposta.'
    ),
    new HumanMessage(
      JSON.stringify({
        messageText: input.messageText,
        context: {
          currentDate: operationalTodayIso(),
          workingMemory: input.context.workingMemoryBlock || null,
          manifestId: input.context.manifestId,
          jobId: input.context.jobId,
          lastManifestSelectionIds: input.context.lastManifestSelectionIds || [],
          askedManifestIds: input.context.askedManifestIds || []
        },
        routingKnowledge: input.knowledgeBlock || null,
        history
      })
    )
  ]);

  const parsed = extractFirstJsonObject(readMessageContent(response));

  return {
    intent: toStringOrNull(parsed.intent) || 'unclear',
    confidence: Math.max(0, Math.min(1, toNumber(parsed.confidence, 0.4))),
    entities: (parsed.entities && typeof parsed.entities === 'object' && !Array.isArray(parsed.entities))
      ? parsed.entities as LooseRecord
      : {},
    needsClarification: toBoolean(parsed.needsClarification, false),
    clarifyingQuestion: toStringOrNull(parsed.clarifyingQuestion),
    riskLevel: (parsed.riskLevel || 'low') as 'low' | 'medium' | 'high' | 'critical'
  };
}

async function recoverIntentFromUnclearClassification(input: {
  llm: ChatOpenAI;
  messageText: string;
  context: ConversationContextLike;
  history?: Array<{ role: string; text: string }>;
}): Promise<IntentClassification | null> {
  const history = sanitizeHistory(input.history).slice(-8);

  const response = await input.llm.invoke([
    new SystemMessage(
      'Voce e um classificador de recuperacao para intents operacionais do SICAT. ' +
      'Use apenas inferencia semantica do pedido. Nao use regras de palavra-chave. ' +
      'Retorne SOMENTE JSON no formato: ' +
      '{"intent":string,"confidence":number,"entities":object}. ' +
      'Intents permitidos nesta recuperacao: manifest.preview_create_from_payload, manifest.preview_batch_cancel_selected, manifest.list_recent_top, manifest.group_recent_top, search_partners, query_catalog, list_mtr_provisorio, list_jobs, get_operations_overview, get_dashboard_overview, get_audit_trail, unclear. ' +
      'Se o usuario pedir agrupamento por gerador, preencher entities.groupBy="generator". ' +
      'Se pedir sem CDF/CDR, preencher entities.withoutCdf=true. ' +
      'Se houver periodo (ex.: ultimos 30 dias), preencher entities.dateFrom/dateTo em YYYY-MM-DD quando possivel. ' +
      'Se o pedido for cancelar pendentes de hoje, usar manifest.preview_batch_cancel_selected com entities.status="pending" e periodo do dia atual quando possivel. ' +
      'Se o pedido for "o que e DMR", usar list_dmr com entities.explanationOnly=true. ' +
      'Se o pedido for a diferenca entre MTR, CDF e DMR, usar get_dashboard_overview com entities.mode="document_flow_overview". ' +
      'Se o pedido for o fluxo do MTR ate o CDF, usar get_dashboard_overview com entities.mode="mtr_to_cdf_flow". ' +
      'Se o pedido for quais modulos estao disponiveis para ele, usar get_operations_overview com entities.mode="module_access_status". ' +
      'Se o pedido for onde gerar um novo manifesto, usar get_operations_overview com entities.mode="manifest_create_navigation". ' +
      'Se o pedido for onde ver CDFs emitidos, usar get_operations_overview com entities.mode="cdf_navigation". ' +
      'Se o pedido for quando gerar CDF, usar get_operations_overview com entities.mode="cdf_generation_guidance". ' +
      'Se o pedido for pendente de HAR, usar get_operations_overview com entities.mode="pending_har_explanation". ' +
      'Se o pedido for CDF ja emitido, usar get_operations_overview com entities.mode="cdf_already_issued_explanation". ' +
      'Se o pedido for onde consultar jobs com erro/falha/DLQ, usar list_jobs com entities.status="ERROR" e entities.mode="jobs_error_navigation". ' +
      'Se o pedido for como trocar a conta CETESB ativa, usar get_operations_overview com entities.mode="switch_active_account". ' +
      'Se o pedido for qual conta CETESB esta ativa agora, usar get_operations_overview com entities.mode="active_account_status". ' +
      'Se o pedido for permissao para area administrativa, usar get_operations_overview com entities.mode="admin_access_guidance". ' +
      'Se o pedido for o significado de manifesto recebido, usar get_operations_overview com entities.mode="manifest_received_explanation". ' +
      'Se o pedido for automacao assistida de resumo periodico, usar get_dashboard_overview com entities.mode="capabilities_overview". ' +
      'Se o pedido for diagnostico complexo de manifesto/CDF (status/jobs/auditoria/CETESB), usar get_operations_overview com entities.mode="safe_error_triage". ' +
      'Se o pedido combinar listar sem CDF e gerar certificado, usar manifest.group_recent_top com entities.withoutCdf=true e entities.groupBy="status" para diagnostico inicial seguro. ' +
      'Se o pedido for explicacao de erro para publico nao tecnico, usar get_operations_overview com entities.mode="non_technical_error_explanation". ' +
      'Para busca de parceiro por CNPJ sem numero, manter intent search_partners e marcar entities.missingDocument=true. ' +
      'Para pergunta conceitual de MTR provisorio, usar intent list_mtr_provisorio com entities.explanationOnly=true. ' +
      'Para lista de tipos de residuos, usar intent query_catalog com entities.catalogName="wasteTypes". ' +
      'Para "o que consigo fazer no SICAT", usar get_dashboard_overview com entities.mode="sicat_overview". ' +
      'Para "liste os usuarios do SICAT", usar get_operations_overview com entities.mode="admin_access_users". ' +
      'Para "resolva erros operacionais... com seguranca", usar get_operations_overview com entities.mode="safe_error_triage". ' +
      'Para pedido por correlationId (mesmo identificador exemplificativo como X), usar intent get_audit_trail com entities.correlationId. ' +
      'Para "qual conta CETESB ativa", usar intent get_operations_overview. ' +
      'Para "resumo do dia" ou "dashboard", usar intent get_dashboard_overview.'
    ),
    new HumanMessage(
      JSON.stringify({
        messageText: input.messageText,
        context: {
          currentDate: operationalTodayIso(),
          workingMemory: input.context.workingMemoryBlock || null,
          manifestId: input.context.manifestId,
          jobId: input.context.jobId,
          lastManifestSelectionIds: input.context.lastManifestSelectionIds || [],
          askedManifestIds: input.context.askedManifestIds || []
        },
        history
      })
    )
  ]);

  const parsed = extractFirstJsonObject(readMessageContent(response));
  const intent = toStringOrNull(parsed.intent) || 'unclear';
  if (intent === 'unclear') return null;

  return {
    intent,
    confidence: Math.max(0, Math.min(1, toNumber(parsed.confidence, 0.55))),
    entities: (parsed.entities && typeof parsed.entities === 'object' && !Array.isArray(parsed.entities))
      ? parsed.entities as LooseRecord
      : {},
    needsClarification: false,
    clarifyingQuestion: null
  };
}

function buildPlannerInstruction(input: {
  messageText: string;
  context: ConversationContextLike;
  classification: IntentClassification;
  history?: Array<{ role: string; text: string }>;
  knowledgeBlock?: string | null;
}) {
  return JSON.stringify({
    task: 'Agent Planner',
    messageText: input.messageText,
    classification: input.classification,
    routingKnowledge: input.knowledgeBlock || null,
    context: {
      currentDate: operationalTodayIso(),
      workingMemory: input.context.workingMemoryBlock || null,
      manifestId: input.context.manifestId,
      jobId: input.context.jobId,
      lastManifestSelectionIds: input.context.lastManifestSelectionIds || [],
      askedManifestIds: input.context.askedManifestIds || []
    },
    history: sanitizeHistory(input.history).slice(-12),
    plannerContract: {
      objective: 'definir o melhor tool call para responder com dado operacional correto e seguro',
      priorities: [
        'usar orchestrate_manifest_operation para intents compostos e de memoria',
        'preservar contextos de selecao de manifestos da sessao',
        'respeitar direcao temporal explicita: oldest => selection.orderBy=recency_asc; recent => selection.orderBy=recency_desc',
        'quando existir intervalo temporal, preencher selection.dateFrom e selection.dateTo em YYYY-MM-DD',
        'na ausencia de pedido explicito para pular itens em oldest, manter selection.skipMostRecent=0',
        'para consulta de gerador por numero, usar intent manifest.lookup_generator_by_number',
        'nunca responder com pseudo-codigo JSON de tool/input; usar function call quando a intencao estiver clara',
        'se intencao estiver clara, retornar tool call; se nao, retornar pergunta de esclarecimento'
      ]
    }
  });
}

function resolvePlannerDecisionFromMessage(lastMessage: GraphMessage): PlannerDecision {
  const toolCall = extractToolCallFromGraphMessage(lastMessage);
  const outputText = resolveOutputTextFromGraphMessage(lastMessage, toolCall);
  const confidence = resolveConfidenceScore(toolCall, outputText);

  return {
    outputText,
    toolCall,
    confidence,
    needsClarification: false,
    clarifyingQuestion: null
  };
}

function shouldReturnClarifyingQuestion(classification: IntentClassification): boolean {
  if (!classification.needsClarification) return false;

  const intent = (classification.intent || '').trim().toLowerCase();
  return intent === 'unclear' || intent === 'greeting';
}

function findLastAiGraphMessage(messages: GraphMessage[]): AIMessage | null {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i];
    if (message instanceof AIMessage) {
      return message;
    }
  }

  return null;
}

function buildSynthesisProviderUnavailableError(error: unknown): AppError {
  const detail = error instanceof Error ? error.message : 'provider unavailable';

  return new AppError(
    503,
    'AI nao configurado',
    `OPENAI_SYNTHESIS_MODEL indisponivel para gerar a resposta final. detail=${detail}`,
    { code: 'PROVIDER_UNAVAILABLE' }
  );
}

// ─── Escalation Detection & Execution ─────────────────────────────────────

type EscalationTriggerResult = {
  shouldEscalate: boolean;
  reason: 'low_confidence' | 'high_risk' | 'quality_issue' | 'tool_ambiguity' | 'complexity' | null;
};

function detectEscalationTriggers(input: {
  confidence: number;
  classification: IntentClassification;
  plannerDecision: PlannerDecision;
  toolCall: LlmToolCall | null;
}): EscalationTriggerResult {
  // Trigger 1: Confiança baixa
  if (input.confidence < 0.5) {
    return {
      shouldEscalate: true,
      reason: 'low_confidence'
    };
  }

  // Trigger 2: Risco crítico
  if (input.classification.riskLevel === 'critical') {
    return {
      shouldEscalate: true,
      reason: 'high_risk'
    };
  }

  // Trigger 3: Problemas de qualidade do planejamento
  // Qualidade baixa: necessida clarificação AND confiança média-baixa
  if (input.plannerDecision.needsClarification && input.plannerDecision.confidence < 0.6) {
    return {
      shouldEscalate: true,
      reason: 'quality_issue'
    };
  }

  // Trigger 4: Tool call ambíguo ou conflitante
  // Exemplo: toolCall existe mas confidence é baixa + classification sugere intent diferente
  if (
    input.toolCall &&
    input.plannerDecision.confidence < 0.55 &&
    input.classification.confidence < 0.55
  ) {
    return {
      shouldEscalate: true,
      reason: 'tool_ambiguity'
    };
  }

  // Trigger 5: Complexidade detectada (múltiplas etapas)
  // Indicada por orchestrate_manifest_operation com múltiplas operações ou composição
  const toolArgs = input.toolCall ? toRecord(input.toolCall.arguments) : {};
  const isBatchOperation =
    input.toolCall?.name === 'orchestrate_manifest_operation'
    && (Array.isArray(toolArgs.manifestIds) && toolArgs.manifestIds.length > 5);

  if (isBatchOperation && input.confidence < 0.7) {
    return {
      shouldEscalate: true,
      reason: 'complexity'
    };
  }

  return {
    shouldEscalate: false,
    reason: null
  };
}

async function performEscalation(input: {
  config: ReturnType<typeof getAiConfig>;
  llmPlanInput: LlmPlanningInput;
  classification: IntentClassification;
  plannerDecision: PlannerDecision;
  escalationReason: string;
  systemPrompt: string;
  threadId: string;
  llm2: ChatOpenAI;
}): Promise<LlmPlan> {
  const text = (typeof input.llmPlanInput.messageText === 'string' ? input.llmPlanInput.messageText : '').trim();

  // Reclassificar intent com llm2
  const escalatedClassification = await classifyIntent({
    llm: input.llm2,
    messageText: text,
    context: input.llmPlanInput.context,
    history: input.llmPlanInput.history
  });

  // Re-planejar com llm2 usando graph novo
  const escalationGraph = createEscalationGraph(input.llm2);
  const plannerInstruction = buildPlannerInstruction({
    messageText: text,
    context: input.llmPlanInput.context,
    classification: escalatedClassification,
    history: input.llmPlanInput.history
  });

  let escalatedGraphResult: typeof MessagesAnnotation.State;
  try {
    escalatedGraphResult = await escalationGraph.invoke({
      threadId: input.threadId,
      messages: [new SystemMessage(input.systemPrompt), new HumanMessage(plannerInstruction)]
    });
  } catch (err) {
    const detail = err instanceof Error ? err.message : 'Erro desconhecido na chamada ao LLM.';
    throw new AppError(502, 'LLM indisponivel', detail, { code: 'PROVIDER_UNAVAILABLE' });
  }

  const lastAiMessage = findLastAiGraphMessage(escalatedGraphResult.messages);
  if (!lastAiMessage) {
    throw new AppError(502, 'LLM indisponivel', 'O grafo de escalation nao retornou nenhuma mensagem do assistente.', {
      code: 'PROVIDER_UNAVAILABLE'
    });
  }

  const escalatedPlannerDecision = resolvePlannerDecisionFromMessage(lastAiMessage);

  const escalatedToolCall = normalizePlannerToolCallForRecency({
    toolCall: escalatedPlannerDecision.toolCall,
    classifier: escalatedClassification
  });

  const alignedEscalatedToolCall = alignPlannerToolCallWithClassification({
    toolCall: escalatedToolCall,
    classification: escalatedClassification
  });

  const finalToolCall = downgradeUnconfirmedBatchActionToPreview(
    alignedEscalatedToolCall || buildFallbackToolCallFromClassification(escalatedClassification)
  );

  const escalatedConfidence = Math.max(
    0,
    Math.min(1, (escalatedClassification.confidence + escalatedPlannerDecision.confidence) / 2)
  );

  const outputText = escalatedPlannerDecision.outputText;

  return {
    provider: 'layered-llm-escalated',
    confidence: escalatedConfidence,
    outputText,
    toolCall: finalToolCall,
    agentModelUsed: input.config.openAiAgentModel,
    synthesisModelUsed: input.config.openAiSynthesisModel,
    escalationModelUsed: input.config.openAiEscalationModel,
    escalationReason: input.escalationReason,
    orchestration: {
      classifier: escalatedClassification,
      planner: {
        outputText: escalatedPlannerDecision.outputText,
        toolName: finalToolCall?.name || null,
        toolArgs: finalToolCall?.arguments || {},
        confidence: escalatedPlannerDecision.confidence,
        needsClarification: escalatedPlannerDecision.needsClarification,
        clarifyingQuestion: escalatedPlannerDecision.clarifyingQuestion
      }
    }
  };
}

function createEscalationGraph(llm: ChatOpenAI): PlanningGraph {
  // Cria um graph novo com o modelo de escalation (não usa cache)
  const modelWithTools = llm.bindTools(getRuntimeConversationToolSchemas() as unknown as LooseRecord[]);

  return createMemoryBackedPlanningGraph({
    invokeModel: async (messages) => modelWithTools.invoke(messages) as Promise<AIMessage>
  });
}

// ─── LangGraph: grafo simples de planejamento (um nó de agente) ──────────────

// ─── Síntese em linguagem natural a partir de resultado de ferramenta ────────

export async function synthesizeNaturalResponse(input: {
  userMessage: string;
  toolSummary: string;
}): Promise<string | null> {
  try {
    const config = getAiConfig();
    // Síntese (gerar texto a partir de evidência já obtida) pode seguir rápida.
    const llm = createChatModel(config.openAiSynthesisModel, config.openAiApiKey, getReasoningEffortFor('synthesis'));

    const knowledgeHits = await retrieveKnowledge(input.userMessage, { k: 5 });
    const knowledgeBlock = buildKnowledgeContextBlock(knowledgeHits);

    const response = await llm.invoke([
      new SystemMessage(
        'Você é um assistente operacional da plataforma SICAT MTR. ' +
        'Responda à pergunta do usuário SOMENTE com base nas evidências (fatos) fornecidas em "Dados disponíveis". ' +
        'Para dados operacionais (manifestos, status, datas, quantidades, recência) não use memória, histórico, ' +
        'cache ou suposições como fonte — use apenas as evidências recebidas. ' +
        'Para recência, baseie-se no campo de data de negócio informado (data de expedição). ' +
        'Se vários manifestos empatarem na data mais recente, ou se os dados forem insuficientes ou conflitantes, ' +
        'explique isso ao usuário em vez de eleger um único item arbitrariamente. ' +
        'Se o total considerado/informado nas evidências (ex.: total, totalConsiderado, totalInRange) for MAIOR que a quantidade de itens listados, então existem MAIS manifestos além dos mostrados (em geral apenas os mais recentes foram trazidos): apresente o total honestamente e NUNCA afirme que o período ou um sub-período está vazio com base apenas nos itens listados. ' +
        'Responda na FORMA que o pedido pede e não a substitua por outra: quando o usuário quer VER os manifestos (pedir para mostrar/passar/listar/trazer, ou "quais são eles"), LISTE os itens — com os campos que ele pedir (ex.: motorista, transportadora/empresa, status, data) — e NUNCA troque a lista por uma contagem; quando ele pergunta a QUANTIDADE ("quantos"), aí sim LIDERE com o número total (o total é a resposta, não liste a menos que peçam). Para COMPARAÇÕES entre dias/períodos, informe o total de cada lado separadamente. ' +
        'Não invente manifestos, números, datas ou status que não estejam nas evidências; ' +
        'se não houver dados suficientes, diga que não foi possível determinar com segurança. ' +
        'Reporte o status no padrão do portal (ex.: salvo, recebido) quando disponível. ' +
        'Você também pode receber um bloco "Conhecimento de dominio" (conceitos e fluxo SICAT/CETESB): use-o para explicar, contextualizar e estruturar o raciocínio — mas dados operacionais (números, status, datas, quantidades) vêm SOMENTE das evidências. ' +
        'Quando as evidências indicarem que documentos/comprovantes (PDF) foram gerados ou que um download/arquivo em lote (ZIP) está sendo preparado ou já disponível, informe ao usuário de forma natural que o material foi gerado e que o download ficará disponível nesta conversa — sem inventar links, nomes de arquivo ou prazos. ' +
        'Para respostas com estrutura mais rica (vários itens agrupados por dia/motorista/status, ou uma ação que produz documentos), organize a resposta de forma clara (agrupada/em tópicos) e, ao final, aponte o próximo passo ou o download disponível, sempre fiel às evidências. ' +
        'Responda de forma clara, direta e em português natural. ' +
        'Nunca mencione nomes técnicos de ferramentas, intenções internas ou metadados de orquestração. ' +
        'Se a pergunta se referir a um item por posição (ex.: terceiro, segundo), destaque-o explicitamente.'
      ),
      new HumanMessage(
        `Data operacional atual: ${operationalTodayIso()} (use-a para resolver "hoje"/"ontem"; não invente datas).`
        + (knowledgeBlock ? `\n\n${knowledgeBlock}` : '')
        + `\n\nPergunta: ${input.userMessage}\n\nDados disponíveis: ${input.toolSummary}`
      )
    ]);

    const content = typeof response.content === 'string' ? response.content.trim() : '';
    return content || null;
  } catch (error: unknown) {
    throw buildSynthesisProviderUnavailableError(error);
  }
}

/** Subconjunto de function-tools que o especialista pode acionar (bindTools FOCADO por agente). */
function conversationToolsForSpecialist(specialist: ConversationSpecialist): LooseRecord[] {
  // Tools do agente: override do banco (ai_agents.tool_names) ou estrutura de código.
  const toolNames = resolveRuntimeAgentTools(specialist.id, specialistToolNames(specialist.id).map(String));
  const names = new Set(toolNames.map(String));
  const all = getRuntimeConversationToolSchemas() as unknown as Array<{ function?: { name?: string } }>;
  const filtered = all.filter((tool) => tool?.function?.name && names.has(tool.function.name));
  return (filtered.length ? filtered : all) as unknown as LooseRecord[];
}

export function createLlmProvider(): LlmProvider {
  // Um grafo de planejamento POR ESPECIALISTA (cada um com seu subconjunto focado de tools).
  const planningGraphs = new Map<string, PlanningGraph>();

  function getOrCreatePlanningGraph(config: ReturnType<typeof getAiConfig>, specialist: ConversationSpecialist): PlanningGraph {
    const cacheKey = `${specialist.id}:${getRuntimeToolsVersion()}`;
    const cached = planningGraphs.get(cacheKey);
    if (cached) {
      return cached;
    }

    // Planejamento/roteamento de ferramenta: passo onde a IA "se perdia" com effort mínimo.
    const llm = createChatModel(config.openAiAgentModel, config.openAiApiKey, getReasoningEffortFor('routing'));

    const modelWithTools = llm.bindTools(conversationToolsForSpecialist(specialist));

    const graph = createMemoryBackedPlanningGraph({
      invokeModel: async (messages) => modelWithTools.invoke(messages) as Promise<AIMessage>
    });

    planningGraphs.set(cacheKey, graph);
    return graph;
  }

  return {
    async updateWorkingMemory(input: Parameters<typeof updateAndPersistWorkingMemory>[0]) {
      return updateAndPersistWorkingMemory(input);
    },
    async plan(input: LlmPlanningInput): Promise<LlmPlan> {
      const config = getAiConfig();

      const text = (typeof input.messageText === 'string' ? input.messageText : '').trim();
      if (!text) {
        return {
          provider: 'langchain',
          confidence: 0.1,
          outputText: 'Não recebi uma mensagem válida. Descreva sua consulta operacional.',
          toolCall: null,
          agentModelUsed: config.openAiAgentModel,
          synthesisModelUsed: config.openAiSynthesisModel
        };
      }

      // Classificação de intenção (decisão de ferramenta): usa effort de roteamento.
      const llm = createChatModel(config.openAiAgentModel, config.openAiApiKey, getReasoningEffortFor('routing'));

      // RAG no PONTO DE DECISÃO: conhecimento de domínio + exemplos de roteamento
      // (consultas semelhantes → intent/ferramenta) para fundamentar a escolha de ferramenta.
      // Auxiliar: falha de RAG não bloqueia o planejamento.
      let routingKnowledge: string | null = null;
      try {
        routingKnowledge = buildKnowledgeContextBlock(await retrieveKnowledge(text, { k: 6 })) || null;
      } catch { /* RAG indisponível: segue sem grounding extra */ }

      let classification = await classifyIntent({
        llm,
        messageText: text,
        context: input.context,
        history: input.history,
        knowledgeBlock: routingKnowledge
      });

      if (classification.intent === 'unclear') {
        const recovered = await recoverIntentFromUnclearClassification({
          llm,
          messageText: text,
          context: input.context,
          history: input.history
        });

        if (recovered) {
          classification = recovered;
        }
      }

      const isConversationalIntent = classification.intent === 'conversation' || classification.intent === 'greeting';
      const shouldClarify = shouldReturnClarifyingQuestion(classification);

      if (isConversationalIntent || shouldClarify) {
        const conversational = await respondConversationally({
          llm,
          messageText: text,
          history: input.history,
          workingMemoryBlock: input.context.workingMemoryBlock,
          fallback:
            classification.clarifyingQuestion
            || 'Pode me dar mais detalhes para eu identificar exatamente qual operacao voce deseja?'
        });
        return {
          provider: 'layered-llm',
          confidence: classification.confidence,
          outputText: conversational,
          toolCall: null,
          agentModelUsed: config.openAiAgentModel,
          synthesisModelUsed: config.openAiSynthesisModel,
          orchestration: {
            classifier: classification,
            planner: {
              outputText: conversational,
              toolName: null,
              toolArgs: {},
              confidence: classification.confidence,
              needsClarification: true,
              clarifyingQuestion: conversational
            }
          }
        };
      }

      const systemPrompt = buildSystemPrompt(input.context);
      const threadId = buildConversationThreadId(input.context);
      // Roteamento multi-agente: o intent define o ESPECIALISTA, que traz seu subconjunto focado de tools.
      const specialist = resolveSpecialistForIntent(classification.intent);
      // Texto do agente (label + foco) DINÂMICO: lido do banco (ai_agents), com fallback genérico.
      const agentText = resolveRuntimeAgentText(specialist.id, {
        label: 'Assistente operacional SICAT',
        focus: 'Use as ferramentas do dominio para responder com dados operacionais corretos e seguros.'
      });
      const graph = getOrCreatePlanningGraph(config, specialist);
      const plannerInstruction = buildPlannerInstruction({
        messageText: text,
        context: input.context,
        classification,
        history: input.history,
        knowledgeBlock: routingKnowledge
      });

      let graphResult: typeof MessagesAnnotation.State;
      try {
        graphResult = await graph.invoke({
          threadId,
          messages: [
            new SystemMessage(systemPrompt),
            new SystemMessage(`Especialista ativo: ${agentText.label}. Foco do especialista (use as ferramentas deste dominio): ${agentText.focus}`),
            new HumanMessage(plannerInstruction)
          ]
        });
      } catch (err) {
        const detail =
          err instanceof Error ? err.message : 'Erro desconhecido na chamada ao LLM.';
        throw new AppError(502, 'LLM indisponivel', detail, { code: 'PROVIDER_UNAVAILABLE' });
      }

      const lastAiMessage = findLastAiGraphMessage(graphResult.messages);
      if (!lastAiMessage) {
        throw new AppError(502, 'LLM indisponivel', 'O grafo nao retornou nenhuma mensagem do assistente.', {
          code: 'PROVIDER_UNAVAILABLE'
        });
      }

      const plannerDecision = resolvePlannerDecisionFromMessage(lastAiMessage);

      const outputText = shouldClarify && classification.clarifyingQuestion
        ? classification.clarifyingQuestion
        : plannerDecision.outputText;

      const normalizedToolCall = normalizePlannerToolCallForRecency({
        toolCall: plannerDecision.toolCall,
        classifier: classification
      });

      const alignedToolCall = alignPlannerToolCallWithClassification({
        toolCall: normalizedToolCall,
        classification
      });

      let fallbackClassification = classification;
      if (!alignedToolCall && !shouldClarify) {
        const recoveredForFallback = await recoverIntentFromUnclearClassification({
          llm,
          messageText: text,
          context: input.context,
          history: input.history
        });

        if (recoveredForFallback) {
          fallbackClassification = recoveredForFallback;
        }
      }

      const recoveredToolCall = downgradeUnconfirmedBatchActionToPreview(
        alignedToolCall || buildFallbackToolCallFromClassification(fallbackClassification)
      );

      const toolCall = shouldClarify
        ? null
        : recoveredToolCall;

      const confidence = Math.max(0, Math.min(1, (classification.confidence + plannerDecision.confidence) / 2));

      // ─── ESCALATION DETECTION ───
      // Detecta 5 triggers de escalation
      const escalationTriggers = detectEscalationTriggers({
        confidence,
        classification,
        plannerDecision,
        toolCall
      });

      // Se qualquer trigger for true, reclassificar com modelo de escalation
      if (escalationTriggers.shouldEscalate) {
        // Escalation = retry de baixa confiança: reasoning alto (1 retry mais "pensado").
        const llm2 = createChatModel(config.openAiEscalationModel, config.openAiApiKey, (process.env.OPENAI_REASONING_EFFORT_ESCALATION || 'high').trim());

        const escalatedResult = await performEscalation({
          config,
          llmPlanInput: input,
          classification,
          plannerDecision,
          escalationReason: escalationTriggers.reason || 'unknown',
          systemPrompt,
          threadId,
          llm2
        });

        return escalatedResult;
      }

      // Fluxo normal (sem escalation)
      return {
        provider: 'layered-llm',
        confidence,
        outputText,
        toolCall,
        agentModelUsed: config.openAiAgentModel,
        synthesisModelUsed: config.openAiSynthesisModel,
        orchestration: {
          classifier: classification,
          planner: {
            outputText: plannerDecision.outputText,
            toolName: recoveredToolCall?.name || null,
            toolArgs: recoveredToolCall?.arguments || {},
            confidence: plannerDecision.confidence,
            needsClarification: shouldClarify || plannerDecision.needsClarification,
            clarifyingQuestion: classification.clarifyingQuestion || plannerDecision.clarifyingQuestion
          }
        }
      };
    }
  };
}
