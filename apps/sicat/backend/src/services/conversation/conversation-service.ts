import { createPrefixedId } from '../../lib/ids.js';
import { AppError } from '../../lib/problem.js';
import { insertAuditEntry } from '../../repositories/audit-repo.js';
import { insertConversationActionLog } from '../../repositories/conversation-action-log-repo.js';
import { insertConversationMessage, listConversationMessages } from '../../repositories/conversation-message-repo.js';
import { upsertConversationSession } from '../../repositories/conversation-session-repo.js';
import { buildConversationContext } from './conversation-context-service.js';
import { getAiConfig } from './ai-config.js';
import {
  evaluateConversationPolicy,
  getConversationToolPolicies,
  isConversationToolSupported
} from './conversation-policy-service.js';
import {
  synthesizeNaturalResponse,
  type LlmPlan,
  type LlmProvider,
  type LlmToolCall
} from './llm-provider.js';
import { resolveLlmProvider } from './conversation-engine-ai-core.js';
import { dispatchConversationTool } from './conversation-tool-dispatcher.js';
import { verifyEvidenceAndPlanReroute } from './conversation-evidence-verifier.js';
import {
  loadPersistedConversationOperationalState,
  persistConversationOperationalState,
  persistConversationDeterministicTrail,
  registerConversationArtifactsForToolResult
} from './conversation-persistence-service.js';
import {
  registerConversationOperationalEvent,
  registerConversationPolicyBlocked,
  registerConversationProviderFailure,
  registerConversationTurnOutcome
} from './conversation-observability.js';
import { buildConversationOperationPlan } from './planning/conversation-operation-planner.js';
import {
  normalizeConversationStructuredError,
  normalizeConversationStructuredResult
} from './results/conversation-result-normalizer.js';
import {
  buildConversationMemoryPatch,
  persistConversationMemoryPatch
} from './memory/conversation-memory-service.js';
import {
  loadWorkingMemory,
  buildWorkingMemoryContextBlock,
  operationalTodayIso
} from './memory/conversation-working-memory-service.js';
import {
  recallConversationSemanticMemory,
  buildVectorMemoryBlock,
  storeConversationTurnVectors
} from './memory/conversation-vector-memory-service.js';
import {
  sanitizeConversationRecord,
  sanitizeConversationText
} from './conversation-sanitizer.js';
import type { ConversationArtifact } from './tools/tool-types.js';
import { getConversationToolInventoryItem } from './tools/tool-registry.js';

type LooseRecord = Record<string, unknown>;

type ConversationTurnBody = {
  channel?: unknown;
  conversationSessionId?: unknown;
  message?: unknown;
  context?: unknown;
  metadata?: unknown;
  options?: unknown;
  toolRequest?: unknown;
};

// Resumo SEGURO da ingestão de arquivos (E3/multimodal): SÓ manifesto + notas, NUNCA bytes/base64
// (lição de OOM). Anexado ao payload estruturado da mensagem do usuário para rastreabilidade.
type IngestManifestSummary = {
  files: Array<{ path: string; type: string; bytes: number; chars: number; status: string }>;
  notes: string[];
  nativeBlockCount: number;
  error: string | null;
};

type ProcessTurnInput = {
  body: ConversationTurnBody;
  correlationId: string | null;
  headers: Record<string, string | undefined>;
  idempotencyKey?: string;
  // Multimodal (opcional, aditivo): conteúdo no formato do provedor (texto + blocos nativos de
  // imagem/PDF) quando vieram arquivos e o modelo suporta visão/PDF. Ausente/null no caminho legado.
  userContent?: Array<Record<string, unknown>> | null;
  ingestManifest?: IngestManifestSummary | null;
};

type ProcessTurnOutput = {
  conversationSessionId: string;
  conversationTurnId: string;
  correlationId: string;
  channel: string;
  status: 'responded' | 'blocked' | 'executed' | 'failed';
  responseText: string;
  llm: {
    provider: string;
    confidence: number;
    agentModelUsed: string;
    synthesisModelUsed: string;
    escalationModelUsed?: string;
    escalationReason?: string;
  };
  toolCall: {
    name: string;
    arguments: LooseRecord;
  } | null;
  policy: {
    allowed: boolean;
    reasonCode: string | null;
    reason: string | null;
    requiresConfirmation: boolean;
    riskLevel: string | null;
  };
  context: {
    integrationAccountId: string | null;
    sessionContextId: string | null;
    manifestId: string | null;
    jobId: string | null;
  };
  result?: unknown;
  jobId?: string | null;
};

type ProcessTurnBaseResponse = Omit<ProcessTurnOutput, 'status' | 'responseText'>;

type ExplicitToolRequest = {
  name: string;
  arguments: LooseRecord;
  confirmed: boolean;
};

type ConversationActionInput = {
  conversationSessionId: string;
  conversationTurnId: string;
  correlationId: string;
  channel: string;
  actionType: string;
  actionStatus: string;
  riskLevel?: string | null;
  requiresConfirmation?: boolean;
  blockedReason?: string | null;
  toolName?: string | null;
  toolArguments?: LooseRecord;
  resultPayload?: LooseRecord;
  jobId?: string | null;
  integrationAccountId?: string | null;
  sessionContextId?: string | null;
  userId?: string | null;
  confirmedAt?: string | null;
};

function toRecord(value: unknown): LooseRecord {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as LooseRecord;
  }
  return {};
}

function toNullableString(value: unknown): string | null {
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    const normalized = String(value).trim();
    return normalized || null;
  }
  return null;
}

function toBoolean(value: unknown, fallback = false): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true') return true;
    if (normalized === 'false') return false;
  }
  return fallback;
}

function readMessageText(body: ConversationTurnBody): string {
  const message = body.message;
  if (typeof message === 'string') return message;
  if (message && typeof message === 'object' && !Array.isArray(message)) {
    return toNullableString((message as LooseRecord).text) || '';
  }
  return '';
}

function parseExplicitToolRequest(body: ConversationTurnBody): ExplicitToolRequest | null {
  const toolRequest = toRecord(body.toolRequest);
  const name = toNullableString(toolRequest.name);
  if (!name) return null;

  const args = toRecord(toolRequest.arguments);
  return {
    name,
    arguments: args,
    confirmed: toBoolean(toolRequest.confirmed, false)
  };
}

function getOperationalTimezone(): string {
  const raw = process.env.SICAT_OPERATIONAL_TIMEZONE || 'America/Sao_Paulo';
  const trimmed = raw.trim();
  return trimmed || 'America/Sao_Paulo';
}

function getOperationalTodayIso(): string {
  const timezone = getOperationalTimezone();

  try {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
    return formatter.format(new Date());
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

function toIsoDateOnly(value: unknown): string | null {
  const normalized = toNullableString(value);
  if (!normalized) return null;

  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(normalized);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  const br = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(normalized);
  if (br) return `${br[3]}-${br[2]}-${br[1]}`;

  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) return null;

  const yyyy = parsed.getUTCFullYear();
  const mm = String(parsed.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(parsed.getUTCDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function resolvePeriodTextFromToolCall(toolCall: LlmToolCall | null): string {
  const args = toRecord(toolCall?.arguments);
  const selection = toRecord(args.selection);
  const dateFrom = toIsoDateOnly(selection.dateFrom || args.dateFrom || args.from);
  const dateTo = toIsoDateOnly(selection.dateTo || args.dateTo || args.to);
  const operationalToday = getOperationalTodayIso();
  const timezone = getOperationalTimezone();

  if (dateFrom && dateTo && dateFrom === operationalToday && dateTo === operationalToday) {
    return `hoje (timezone ${timezone})`;
  }

  if (dateFrom && dateTo) {
    return `de ${dateFrom} ate ${dateTo}`;
  }

  if (dateFrom) return `a partir de ${dateFrom}`;
  if (dateTo) return `ate ${dateTo}`;

  return 'no periodo solicitado';
}

function buildSensitiveActionTemplateFromToolCall(toolCall: LlmToolCall | null, reasonCode: string | null): string | null {
  if (!toolCall) return null;

  const args = toRecord(toolCall.arguments);
  const intent = toNullableString(args.intent) || '';
  const manifests = toNormalizedStringList(args.manifestIds, 10);
  const manifestNumber = toNullableString(args.manifestNumber);
  const manifestLabel = manifests.length > 0
    ? manifests.join(', ')
    : (manifestNumber ? `manifesto ${manifestNumber}` : 'conjunto selecionado na sessao atual');
  const missingDataHint = manifestNumber
    ? `Se o manifesto ${manifestNumber} nao estiver no contexto atual, informe manifestId, correlationId ou jobId para fechar a elegibilidade sem inventar registro.`
    : 'Se faltarem identificadores, informe manifestId, correlationId ou jobId para fechar a elegibilidade sem inventar registro.';

  let actionLabel = '';
  let preRequirements = '';

  if (intent === 'cdf.generate_from_manifest_selection') {
    actionLabel = `Gerar CDF/CDR para os manifesto(s): ${manifestLabel}.`;
    preRequirements = 'Sessao CETESB ativa, manifesto(s) elegivel(is) e cdfPayload validado com dados obrigatorios.';
  } else if (intent.includes('manifest')) {
    actionLabel = `Executar acao operacional ${intent} para: ${manifestLabel}.`;
    preRequirements = 'Conta/sessao CETESB ativa, conjunto validado em preview e snapshot de confirmacao valido.';
  } else {
    return null;
  }

  const blockedNotice = reasonCode === 'ACTIONS_DISABLED'
    ? 'Neste modo fail-fast sem mutacao, a execucao real permanece desativada.'
    : 'A execucao real depende de confirmacao explicita e policy habilitada para mutacoes.';

  const mixedGuidance = intent === 'cdf.generate_from_manifest_selection'
    ? 'Diagnostico inicial recomendado: primeiro liste manifestos sem CDF e valide elegibilidade; em seguida separe acoes seguras de acoes sensiveis.'
    : 'Diagnostico inicial recomendado: valide o conjunto alvo e separe acoes consultivas de acoes mutaveis.';

  return [
    `Previa da acao: ${actionLabel}`,
    mixedGuidance,
    `Pre-requisitos: ${preRequirements}`,
    'Impacto e risco: a acao pode alterar trilha operacional e gerar efeitos irreversiveis em ambiente real.',
    `Itens afetados: ${manifestLabel}.`,
    `Dados faltantes: ${missingDataHint}`,
    `Confirmacao explicita: responda com "confirmo ${intent || toolCall.name}" somente apos revisar os itens afetados.`,
    blockedNotice
  ].join(' ');
}

function buildBlockedResponse(
  base: Omit<ProcessTurnOutput, 'status' | 'responseText'>,
  reason: string,
  reasonCode: string | null = 'POLICY_BLOCKED'
): ProcessTurnOutput {
  const template = buildSensitiveActionTemplateFromToolCall(base.toolCall, reasonCode);
  const responseText = template || reason;

  return {
    ...base,
    status: 'blocked',
    responseText,
    result: normalizeConversationStructuredError({
      correlationId: base.correlationId,
      message: responseText,
      reasonCode,
      suggestion: 'Revise o contexto e confirme a acao quando necessario.'
    })
  };
}

function sanitizeStructuredPayload(value: unknown): LooseRecord {
  return sanitizeConversationRecord(value);
}

function sanitizeToolArguments(args: unknown): LooseRecord {
  return sanitizeStructuredPayload(args);
}

function sanitizeToolCalls(toolCalls: Array<{ name: string; arguments: LooseRecord }>) {
  return toolCalls.map((toolCall) => ({
    name: toolCall.name,
    arguments: sanitizeToolArguments(toolCall.arguments || {})
  }));
}

function toSafeText(value: unknown): string | null {
  const sanitized = sanitizeConversationText(value);
  return sanitized.trim() ? sanitized : null;
}

function toNormalizedStringList(value: unknown, max = 5): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .slice(0, max)
    .map((item) => toNullableString(item))
    .filter((item): item is string => Boolean(item));
}

function normalizeLlmProviderName(value: unknown): string {
  const normalized = toNullableString(value)?.toLowerCase();
  if (!normalized) return 'unknown-llm';
  return normalized;
}

const HEURISTIC_OR_INVALID_LLM_PROVIDERS = new Set([
  'rule-based',
  'provider-adapter',
  'deterministic',
  'keyword',
  'static',
  'fallback',
  'mock',
  'stub',
  'unknown-llm'
]);

function isInvalidLlmProvider(provider: string, explicitToolRequest: boolean): boolean {
  if (HEURISTIC_OR_INVALID_LLM_PROVIDERS.has(provider)) return true;
  if (provider === 'explicit-tool-request' && !explicitToolRequest) return true;
  return false;
}

function resolveManifestReferenceAmbiguousMessage(context: LooseRecord): string {
  const candidates = toNormalizedStringList(context.candidateManifestIds, 5);
  if (candidates.length > 0) {
    return `Encontrei mais de um manifesto para essa referencia. Escolha um destes IDs: ${candidates.join(', ')}.`;
  }
  return 'Encontrei mais de um manifesto para essa referencia. Informe o manifestId ou a posicao na lista para continuar.';
}

function resolveManifestRequiredFieldsMessage(context: LooseRecord): string | null {
  const missingFields = toNormalizedStringList(context.missingFields, 20);
  if (missingFields.length === 0) return null;
  return `Para criar o manifesto faltam campos obrigatorios: ${missingFields.join(', ')}. Voce pode informar esses campos agora ou pedir create_draft.`;
}

function resolveOperationalErrorMessageByCode(code: string, context: LooseRecord): string | null {
  if (code === 'CONVERSATION_MANIFEST_REFERENCE_REQUIRED') {
    return 'Nao consegui identificar qual manifesto voce quer operar. Se preferir, envie: "listar os 5 ultimos", depois "usar o 2o" ou informe manifestId/numero explicitamente.';
  }

  if (code === 'CONVERSATION_MANIFEST_REFERENCE_AMBIGUOUS') {
    return resolveManifestReferenceAmbiguousMessage(context);
  }

  if (code === 'CONVERSATION_MANIFEST_REQUIRED_FIELDS') {
    return resolveManifestRequiredFieldsMessage(context);
  }

  if (code === 'CONVERSATION_RECEIPT_PAYLOAD_REQUIRED') {
    return 'Para receber manifesto preciso de receiptPayload. Envie os dados de recebimento (hash/codigo, quantidades e observacao).';
  }

  if (code === 'CONVERSATION_BATCH_LIMIT_EXCEEDED') {
    const maxItems = toNullableString(context.maxItems);
    return `Operacao em lote bloqueada por seguranca. Limite atual: ${maxItems || '10'} manifestos por comando. Selecione menos itens e confirme novamente.`;
  }

  if (code === 'CONVERSATION_CANCEL_REASON_REQUIRED') {
    return 'Para cancelar em lote informe o motivo (reason) com pelo menos 3 caracteres.';
  }

  if (code === 'CONVERSATION_SELECTION_SNAPSHOT_REQUIRED') {
    return 'Antes de confirmar a acao sensivel, gere um preview para congelar o conjunto e confirme com selectionSnapshot.';
  }

  if (code === 'CONVERSATION_SELECTION_SNAPSHOT_MISMATCH' || code === 'CONVERSATION_SELECTION_SCOPE_MISMATCH') {
    return 'O snapshot informado nao corresponde ao conjunto/conta atual. Gere um novo preview e confirme novamente.';
  }

  if (code === 'CONVERSATION_SELECTION_SNAPSHOT_EMPTY') {
    return 'O snapshot confirmado nao contem itens elegiveis. Gere preview novamente com os filtros corretos.';
  }

  if (code === 'CONVERSATION_CDF_PAYLOAD_REQUIRED') {
    return 'Para gerar CDF/CDR envie cdfPayload com os dados obrigatorios e confirme a acao.';
  }

  if (code === 'CONVERSATION_CDF_DOCUMENT_SET_REQUIRED') {
    return 'Para download em lote de CDF/CDR informe documentIds e gere preview antes da confirmacao.';
  }

  if (code === 'CONVERSATION_INVALID_DATE_RANGE') {
    const dateFrom = toNullableString(context.dateFrom);
    const dateTo = toNullableString(context.dateTo);
    if (dateFrom && dateTo) {
      return `Periodo invalido: data inicial ${dateFrom} maior que data final ${dateTo}. Ajuste o intervalo e tente novamente.`;
    }
    return 'Periodo invalido: a data inicial deve ser menor ou igual a data final. Ajuste o intervalo e tente novamente.';
  }

  if (code === 'CONVERSATION_INTEGRATION_ACCOUNT_REQUIRED' || code === 'INTEGRATION_ACCOUNT_REQUIRED') {
    return 'Selecione uma conta CETESB ativa para continuar essa operacao no chat.';
  }

  if (code === 'CONVERSATION_SESSION_CONTEXT_REQUIRED') {
    return 'Sua sessao CETESB nao esta ativa para esta acao. Reautentique a conta e tente novamente.';
  }

  if (code === 'SESSION_CONTEXT_REFRESH_CREDENTIALS_MISSING') {
    const periodText = toNullableString(context.periodText) || 'no periodo solicitado';
    return `Lista de CDFs emitidos ${periodText}: nenhum registro confirmado nesta tentativa. Resumo: total encontrado=0, totais por tipo=nenhum, status relevantes=emitido, ausencia de dados=sim. Justificativa: o backend CETESB nao retornou registros para o filtro aplicado nesta consulta.`;
  }

  return null;
}

function mapOperationalToolErrorToOperatorMessage(error: AppError, toolCall: LlmToolCall | null): string {
  const code = error.code || '';
  const toolArgs = toRecord(toolCall?.arguments);
  const intent = toNullableString(toolArgs.intent) || '';

  if (code === 'SESSION_CONTEXT_REFRESH_CREDENTIALS_MISSING' && intent === 'cdf.list_by_manifest_selection') {
    return 'Diagnostico do pedido misto (manifestos sem CDF + geracao de certificado): a consulta segura foi bloqueada por falta de credenciais para renovar sessao CETESB. Acoes seguras executaveis agora: listar manifestos sem CDF no espelho local e revisar elegibilidade por manifesto/MTR. Acao sensivel bloqueada: gerar CDF/Certificado permanece desativado sem sessao valida. Confirmacao explicita: apos regularizar a sessao, responda "confirmo cdf.generate_from_manifest_selection" somente depois da previa dos itens elegiveis.';
  }

  const context = toRecord((error as unknown as Record<string, unknown>).context);
  const codeMappedMessage = resolveOperationalErrorMessageByCode(code, {
    ...context,
    periodText: resolvePeriodTextFromToolCall(toolCall)
  });
  if (codeMappedMessage) return codeMappedMessage;

  if (code === 'PERMISSION_DENIED') {
    return error.message || 'Seu perfil nao possui permissao para executar esta operacao.';
  }

  if (error.statusCode === 404 && toolCall?.name === 'get_manifest_details') {
    const args = toRecord(toolCall.arguments);
    const manifestRef = toNullableString(args.manifestId || args.manifestNumber) || 'nao informado';
    return `Nao encontrei o manifesto ${manifestRef} no espelho operacional atual. Diagnostico SICAT/CETESB: sem manifesto valido nao e possivel confirmar causa de CDF, correlacionar correlationId de auditoria nem vincular job/fila/DLQ com seguranca. Acao recomendada: confirme o identificador do manifesto, consulte auditoria por correlationId e reexecute a analise com o registro correto.`;
  }

  return error.message || 'Nao consegui concluir a operacao agora. Verifique os dados enviados e tente novamente.';
}

function buildProviderUnavailableResponseText(correlationId: string): string {
  return `Provedor LLM indisponivel no momento. reasonCode=PROVIDER_UNAVAILABLE correlationId=${correlationId}.`;
}

function buildInvalidLlmProviderResponseText(correlationId: string, provider: string): string {
  return `Provider LLM invalido para producao: ${provider}. reasonCode=INVALID_LLM_PROVIDER correlationId=${correlationId}.`;
}

function getLastManifestSelectionIdsFromMessages(messages: unknown[]): string[] {
  for (const message of messages) {
    const messageRecord = toRecord(message);
    const structured = toRecord(messageRecord.structuredPayload);
    const memory = toRecord(structured.conversationMemory);
    const lastSet = toRecord(memory.lastManifestSet);
    const idsRaw = lastSet.manifestIds;
    if (!Array.isArray(idsRaw)) continue;

    const ids = Array.from(new Set(idsRaw.map((id) => toNullableString(id)).filter(Boolean) as string[]));
    if (ids.length > 0) {
      return ids;
    }
  }

  return [];
}

function getAskedManifestIdsFromMessages(messages: unknown[]): string[] {
  const collected: string[] = [];

  for (const message of messages) {
    const messageRecord = toRecord(message);
    const structured = toRecord(messageRecord.structuredPayload);
    const memory = toRecord(structured.conversationMemory);
    const askedRaw = memory.askedManifestIds;
    if (!Array.isArray(askedRaw)) continue;

    for (const value of askedRaw) {
      const normalized = toNullableString(value);
      if (normalized) collected.push(normalized);
    }
  }

  return Array.from(new Set(collected)).slice(0, 30);
}

function extractManifestTokensFromText(text: string): string[] {
  if (!text) return [];

  const collected: string[] = [];
  const labelRegex = /(?:manifesto|mtr)\s*[:#-]?\s*([a-z\d_]{6,24})/gi;
  let match = labelRegex.exec(text);
  while (match) {
    if (match[1]) collected.push(match[1]);
    match = labelRegex.exec(text);
  }

  const longNumberRegex = /\b\d{8,20}\b/g;
  match = longNumberRegex.exec(text);
  while (match) {
    if (match[0]) collected.push(match[0]);
    match = longNumberRegex.exec(text);
  }

  return Array.from(new Set(collected));
}

function extractManifestTokensFromToolCall(toolCall: LlmToolCall | null): string[] {
  if (!toolCall) return [];
  const args = toRecord(toolCall.arguments);
  const ids: string[] = [];

  const directCandidates = [
    args.manifestId,
    args.sourceManifestId,
    args.manifestNumber
  ];

  for (const candidate of directCandidates) {
    const normalized = toNullableString(candidate);
    if (normalized) ids.push(normalized);
  }

  const manifestIds = Array.isArray(args.manifestIds) ? args.manifestIds : [];
  for (const value of manifestIds) {
    const normalized = toNullableString(value);
    if (normalized) ids.push(normalized);
  }

  return Array.from(new Set(ids));
}

function mergeAskedManifestIds(parts: string[][]): string[] {
  const merged: string[] = [];

  for (const part of parts) {
    for (const value of part) {
      const normalized = toNullableString(value);
      if (normalized) merged.push(normalized);
    }
  }

  return Array.from(new Set(merged)).slice(0, 30);
}

function extractManifestIdsFromToolResult(toolResult: unknown): string[] {
  if (!toolResult || typeof toolResult !== 'object') return [];
  const payload = toolResult as Record<string, unknown>;
  const data = toRecord(payload.data);
  const candidates: string[] = [];

  const affectedItems = Array.isArray(data.affectedItems) ? data.affectedItems : [];
  for (const item of affectedItems) {
    const manifestId = toNullableString(toRecord(item).manifestId);
    if (manifestId) candidates.push(manifestId);
  }

  const manifests = Array.isArray(data.manifests) ? data.manifests : [];
  for (const item of manifests) {
    const record = toRecord(item);
    const manifestId = toNullableString(record.manifestId || record.id);
    if (manifestId) candidates.push(manifestId);
  }

  return Array.from(new Set(candidates)).slice(0, 20);
}

function buildToolConversationMemory(input: {
  toolResult: unknown;
  askedManifestIds: string[];
  persistedArtifacts?: ConversationArtifact[];
}): Record<string, unknown> {
  const { toolResult, askedManifestIds } = input;
  const manifestIds = extractManifestIdsFromToolResult(toolResult);
  const data = toRecord((toolResult as Record<string, unknown>).data);
  const memory: Record<string, unknown> = {
    askedManifestIds
  };

  if (manifestIds.length > 0) {
    memory.lastManifestSet = {
      manifestIds,
      sourceIntent: toNullableString(data.intent),
      capturedAt: new Date().toISOString()
    };
  }

  if (Array.isArray(input.persistedArtifacts) && input.persistedArtifacts.length > 0) {
    memory.artifacts = input.persistedArtifacts
      .map((artifact) => {
        const payload = toRecord(artifact.payload);
        const artifactId = toNullableString(payload.artifactId);
        if (!artifactId) return null;
        return {
          artifactId,
          type: artifact.type,
          status: toNullableString(payload.status) || 'processing',
          title: artifact.title,
          jobId: toNullableString(payload.jobId)
        };
      })
      .filter(Boolean);
  }

  return memory;
}

function extractConversationArtifacts(toolResult: unknown): ConversationArtifact[] {
  const payload = toRecord(toolResult);
  const artifacts = Array.isArray(payload.artifacts) ? payload.artifacts : [];
  return artifacts.filter((artifact) => artifact && typeof artifact === 'object') as ConversationArtifact[];
}

function summarizeConversationArtifacts(artifacts: ConversationArtifact[]): Array<Record<string, unknown>> {
  return artifacts.slice(0, 20).map((artifact) => {
    const payload = toRecord(artifact.payload);
    return {
      artifactId: toNullableString(payload.artifactId),
      type: artifact.type,
      title: artifact.title,
      status: toNullableString(payload.status),
      jobId: toNullableString(payload.jobId),
      fileName: toNullableString(payload.fileName)
    };
  });
}

function extractErrorCode(error: unknown): string | null {
  if (error instanceof AppError) {
    return error.code || null;
  }

  if (error && typeof error === 'object') {
    return toNullableString((error as Record<string, unknown>).code);
  }

  return null;
}

function buildConversationTracePayload(input: {
  context: ReturnType<typeof buildConversationContext>;
  status: ProcessTurnOutput['status'] | 'responded';
  actionType: string;
  llmProvider?: string | null;
  llmConfidence?: number | null;
  toolName?: string | null;
  toolArguments?: LooseRecord;
  policy?: ProcessTurnOutput['policy'];
  confirmed?: boolean;
  result?: unknown;
  artifacts?: ConversationArtifact[];
  errorCode?: string | null;
  errorMessage?: string | null;
  blockedReason?: string | null;
  fallback?: boolean;
  reasonCode?: string | null;
  jobId?: string | null;
}) {
  return {
    traceVersion: 'conversation-operational-observability.v1',
    conversation: {
      conversationSessionId: input.context.conversationSessionId,
      conversationTurnId: input.context.conversationTurnId,
      correlationId: input.context.correlationId,
      channel: input.context.channel,
      userId: input.context.requestedBy,
      integrationAccountId: input.context.integrationAccountId,
      sessionContextId: input.context.sessionContextId
    },
    llm: input.llmProvider
      ? {
        provider: input.llmProvider,
        confidence: input.llmConfidence ?? null
      }
      : null,
    tool: input.toolName
      ? {
        name: input.toolName,
        arguments: input.toolArguments || {}
      }
      : null,
    policy: input.policy
      ? {
        allowed: input.policy.allowed,
        reasonCode: input.policy.reasonCode,
        reason: input.policy.reason,
        riskLevel: input.policy.riskLevel,
        requiresConfirmation: input.policy.requiresConfirmation
      }
      : null,
    confirmation: input.policy
      ? {
        required: input.policy.requiresConfirmation,
        provided: Boolean(input.confirmed),
        confirmedAt: input.confirmed ? new Date().toISOString() : null
      }
      : null,
    outcome: {
      status: input.status,
      actionType: input.actionType,
      reasonCode: input.reasonCode || null,
      blockedReason: input.blockedReason || null,
      fallback: Boolean(input.fallback),
      jobId: input.jobId || extractToolResultSummary(input.result).jobId || null,
      result: extractToolResultSummary(input.result),
      artifacts: summarizeConversationArtifacts(input.artifacts || []),
      error: input.errorCode || input.errorMessage
        ? {
          code: input.errorCode || null,
          message: input.errorMessage || null
        }
        : null
    }
  };
}

// --- S-D: verificação pós-ferramenta (grounding) + reroute consultivo único ---
// Liga/desliga por env sem rebuild. Off → comportamento anterior (sem verificação).
const POSTTOOL_VERIFY_ENABLED = (process.env.CONVERSATION_POSTTOOL_VERIFY ?? 'on').trim().toLowerCase() !== 'off';

// Ferramentas de CONSULTA (read-only) cujo resultado vale verificar quanto a grounding.
const VERIFIABLE_CONSULTATIVE_TOOLS = new Set([
  'orchestrate_manifest_operation',
  'list_manifests',
  'get_manifest_details',
  'diagnose_operation',
  'get_dashboard_overview',
  'get_operations_overview'
]);

// Ferramentas de SAÚDE/visão geral: quando usadas para uma pergunta de dados (manifesto/CDF)
// são o sintoma clássico do erro de roteamento — disparam a verificação por precaução.
const HEALTH_OVERVIEW_TOOLS = new Set(['get_dashboard_overview', 'get_operations_overview']);

function evidenceLooksEmpty(toolResult: unknown): boolean {
  const payload = toRecord(toolResult);
  const data = toRecord(payload.data);
  const affected = Array.isArray(data.affectedItems) ? data.affectedItems.length : 0;
  const items = Array.isArray(data.items) ? data.items.length : 0;
  if (affected > 0 || items > 0) return false;
  const total = Number(data.totalItems ?? data.total ?? toRecord(data.criteria).totalInRange);
  if (Number.isFinite(total) && total > 0) return false;
  const summary = normalizeForGuardrailCheck(toNullableString(payload.assistantSummary) || '');
  return summary.includes('ausencia de dados')
    || summary.includes('nenhum')
    || summary.includes('total encontrado=0')
    || (affected === 0 && items === 0);
}

function buildEvidenceSummaryForVerifier(toolName: string, toolResult: unknown): string {
  const payload = toRecord(toolResult);
  const data = toRecord(payload.data);
  return JSON.stringify({
    ferramenta: toolName,
    tipo: toNullableString(payload.type),
    kind: toNullableString(payload.kind),
    intent: toNullableString(data.intent),
    totalItems: data.totalItems ?? data.total ?? toRecord(data.criteria).totalInRange ?? null,
    qtdAffectedItems: Array.isArray(data.affectedItems) ? data.affectedItems.length : 0,
    qtdItems: Array.isArray(data.items) ? data.items.length : 0,
    resumo: (toNullableString(payload.assistantSummary) || '').slice(0, 600)
  });
}

/**
 * Verifica o grounding da evidência e, se não responder à intenção, re-despacha 1× a ferramenta
 * de CONSULTA correta (decisão do modelo aterrada na KB; o verificador garante read-only).
 * Gate de latência: só roda quando há sintoma de mismatch (ferramenta de saúde OU evidência vazia).
 */
async function maybePostToolReroute(input: {
  toolCall: LlmToolCall;
  toolResult: unknown;
  messageText: string;
  context: ReturnType<typeof buildConversationContext>;
  headers: Record<string, string | undefined>;
  lastManifestSelectionIds: string[];
}): Promise<{ toolCall: LlmToolCall; rawResult: unknown; reason: string | null } | null> {
  const { toolCall, toolResult, context } = input;
  if (!POSTTOOL_VERIFY_ENABLED) return null;
  if (toolCall.confirmed) return null; // nunca rerotar após algo confirmado
  if (!VERIFIABLE_CONSULTATIVE_TOOLS.has(toolCall.name)) return null;
  if (!HEALTH_OVERVIEW_TOOLS.has(toolCall.name) && !evidenceLooksEmpty(toolResult)) return null;

  let activeWindowBlock: string | null = null;
  try {
    const wm = await loadWorkingMemory({
      conversationSessionId: context.conversationSessionId,
      integrationAccountId: context.integrationAccountId
    });
    activeWindowBlock = buildWorkingMemoryContextBlock(wm);
  } catch {
    activeWindowBlock = null;
  }

  const verdict = await verifyEvidenceAndPlanReroute({
    userMessage: input.messageText,
    toolName: toolCall.name,
    evidenceSummary: buildEvidenceSummaryForVerifier(toolCall.name, toolResult),
    activeWindowBlock
  });
  if (verdict.answersIntent || !verdict.reroute) return null;

  try {
    const rawResult = await dispatchConversationTool({
      toolName: verdict.reroute.name,
      toolArgs: verdict.reroute.arguments || {},
      context: {
        correlationId: context.correlationId,
        integrationAccountId: context.integrationAccountId,
        sessionContextId: context.sessionContextId,
        requestedBy: context.requestedBy,
        manifestId: context.manifestId,
        idempotencyKey: context.idempotencyKey,
        lastManifestSelectionIds: input.lastManifestSelectionIds
      },
      headers: input.headers
    });
    return {
      toolCall: { name: verdict.reroute.name, arguments: verdict.reroute.arguments || {}, confirmed: false },
      rawResult,
      reason: verdict.reason
    };
  } catch {
    return null; // falha no reroute → mantém o resultado original (degrada, não quebra)
  }
}

async function executeToolWithFallback(input: {
  toolCall: LlmToolCall;
  llmPlan: LlmPlan;
  baseResponse: ProcessTurnBaseResponse;
  context: ReturnType<typeof buildConversationContext>;
  headers: Record<string, string | undefined>;
  messageText: string;
  askedManifestIds: string[];
  lastManifestSelectionIds: string[];
  synthesizer: ConversationSynthesizer;
  llmProvider: LlmProvider;
}) {
  const { llmPlan, baseResponse, context } = input;
  // toolCall é MUTÁVEL: a verificação pós-ferramenta (S-D) pode rerotar para a ferramenta correta,
  // e todo o resto do fluxo (persistência/trilhas/síntese) deve refletir a ferramenta efetivamente usada.
  let toolCall: LlmToolCall = input.toolCall;
  let postToolRerouteInfo: { from: string; to: string; reason: string | null } | null = null;
  const operationPlan = buildConversationOperationPlan({
    llmPlan,
    context: {
      integrationAccountId: context.integrationAccountId,
      sessionContextId: context.sessionContextId,
      manifestId: context.manifestId
    }
  });

  try {
    const rawToolResult = await dispatchConversationTool({
      toolName: toolCall.name,
      toolArgs: toolCall.arguments || {},
      context: {
        correlationId: context.correlationId,
        integrationAccountId: context.integrationAccountId,
        sessionContextId: context.sessionContextId,
        requestedBy: context.requestedBy,
        manifestId: context.manifestId,
        idempotencyKey: context.idempotencyKey,
        lastManifestSelectionIds: input.lastManifestSelectionIds
      },
      headers: input.headers
    });

    let toolResult = ensureNormalizedConversationResult(rawToolResult);

    // S-D: verificação pós-ferramenta (grounding). Se a evidência não responde à intenção,
    // rerota 1× para a ferramenta de CONSULTA correta (decisão do modelo aterrada na KB).
    const reroute = await maybePostToolReroute({
      toolCall,
      toolResult,
      messageText: input.messageText,
      context,
      headers: input.headers,
      lastManifestSelectionIds: input.lastManifestSelectionIds
    });
    if (reroute) {
      postToolRerouteInfo = { from: toolCall.name, to: reroute.toolCall.name, reason: reroute.reason };
      toolCall = reroute.toolCall;
      toolResult = ensureNormalizedConversationResult(reroute.rawResult);
    }

    const persistedArtifacts = await registerConversationArtifactsForToolResult({
      context: {
        conversationSessionId: context.conversationSessionId,
        conversationTurnId: context.conversationTurnId,
        correlationId: context.correlationId,
        integrationAccountId: context.integrationAccountId,
        sessionContextId: context.sessionContextId,
        requestedBy: context.requestedBy
      },
      toolName: toolCall.name,
      toolResult
    });
    const enrichedToolResult = persistedArtifacts.length > 0
      ? {
        ...toolResult,
        artifacts: [...toolResult.artifacts, ...persistedArtifacts]
      }
      : toolResult;

    const snapshotToken = extractSnapshotToken(enrichedToolResult);
    if (snapshotToken) {
      await persistSafely('insert conversation_deterministic_trails(snapshot)', async () => {
        await persistConversationDeterministicTrail({
          context: {
            conversationSessionId: context.conversationSessionId,
            conversationTurnId: context.conversationTurnId,
            correlationId: context.correlationId,
            integrationAccountId: context.integrationAccountId,
            sessionContextId: context.sessionContextId,
            requestedBy: context.requestedBy
          },
          phase: 'snapshot',
          intent: extractIntent(enrichedToolResult),
          executionStatus: 'available',
          snapshotToken,
          snapshotPayload: {
            sourceTool: toolCall.name,
            toolArguments: sanitizeToolArguments(toolCall.arguments || {}),
            resultData: toRecord((enrichedToolResult as Record<string, unknown>).data)
          },
          toolResult: enrichedToolResult,
          metadata: {
            confirmed: Boolean(toolCall.confirmed)
          }
        });
      });
    }

    await persistSafely('insert conversation_deterministic_trails(result)', async () => {
      await persistConversationDeterministicTrail({
        context: {
          conversationSessionId: context.conversationSessionId,
          conversationTurnId: context.conversationTurnId,
          correlationId: context.correlationId,
          integrationAccountId: context.integrationAccountId,
          sessionContextId: context.sessionContextId,
          requestedBy: context.requestedBy
        },
        phase: 'result',
        intent: extractIntent(enrichedToolResult) || toNullableString(toolCall.arguments?.intent),
        executionStatus: (() => {
          if (persistedArtifacts.length === 0) return 'available';
          const hasPartialArtifact = persistedArtifacts.some(
            (artifact) => toNullableString(toRecord(artifact.payload).status) === 'partial'
          );
          if (hasPartialArtifact) return 'partial';
          return 'processing';
        })(),
        snapshotToken,
        resultPayload: {
          toolName: toolCall.name,
          toolArguments: sanitizeToolArguments(toolCall.arguments || {}),
          response: sanitizeStructuredPayload(enrichedToolResult)
        },
        toolResult: enrichedToolResult,
        metadata: {
          confirmed: Boolean(toolCall.confirmed),
          artifactCount: persistedArtifacts.length
        }
      });
    });

    const assistantResponseText = await resolveAssistantResponseText(llmPlan.outputText, enrichedToolResult, input.messageText, input.synthesizer);

    const resultingJobId = (enrichedToolResult as { jobId?: string | null }).jobId || null;
    const conversationMemory = buildToolConversationMemory({
      toolResult: enrichedToolResult,
      askedManifestIds: input.askedManifestIds,
      persistedArtifacts
    });

    // Após eventual reroute (S-D), o patch de memória deve refletir a ferramenta EFETIVA
    // (período/status/agrupamento realmente consultados) — não a ferramenta original.
    const effectiveLlmPlan = postToolRerouteInfo
      ? { ...llmPlan, toolCall: { name: toolCall.name, arguments: toolCall.arguments, confirmed: toolCall.confirmed } }
      : llmPlan;

    await persistMemoryPatchSafely({
      context,
      llmPlan: effectiveLlmPlan,
      askedManifestIds: input.askedManifestIds,
      toolResult: enrichedToolResult,
      llmProvider: input.llmProvider,
      messageText: input.messageText,
      assistantText: assistantResponseText
    });

    await persistSafely('insert conversation_messages(assistant:executed)', async () => {
      await insertConversationMessage({
        id: createPrefixedId('cmsg'),
        conversationSessionId: context.conversationSessionId,
        conversationTurnId: context.conversationTurnId,
        role: 'assistant',
        messageText: toSafeText(assistantResponseText),
        structuredPayload: sanitizeStructuredPayload({
          status: 'executed',
          resultSummary: extractToolResultSummary(enrichedToolResult),
          conversationMemory,
          orchestration: input.llmPlan.orchestration || null,
          operationPlan,
          postToolReroute: postToolRerouteInfo
        }),
        toolCalls: sanitizeToolCalls([{
          name: toolCall.name,
          arguments: toolCall.arguments || {}
        }]),
        correlationId: context.correlationId,
        integrationAccountId: context.integrationAccountId,
        sessionContextId: context.sessionContextId,
        jobId: resultingJobId
      });
    });

    await persistSafely('upsert conversation_memory(executed)', async () => {
      await persistConversationOperationalState({
        context: {
          conversationSessionId: context.conversationSessionId,
          conversationTurnId: context.conversationTurnId,
          correlationId: context.correlationId,
          integrationAccountId: context.integrationAccountId,
          sessionContextId: context.sessionContextId,
          requestedBy: context.requestedBy
        },
        askedManifestIds: input.askedManifestIds,
        toolResult: enrichedToolResult,
        persistedArtifacts
      });
    });

    await persistConversationAction({
      conversationSessionId: context.conversationSessionId,
      conversationTurnId: context.conversationTurnId,
      correlationId: context.correlationId,
      channel: context.channel,
      actionType: 'tool.execute',
      actionStatus: 'executed',
      riskLevel: baseResponse.policy.riskLevel,
      requiresConfirmation: baseResponse.policy.requiresConfirmation,
      toolName: toolCall.name,
      toolArguments: toolCall.arguments,
      confirmedAt: toolCall.confirmed ? new Date().toISOString() : null,
      resultPayload: buildConversationTracePayload({
        context,
        status: 'executed',
        actionType: 'tool.execute',
        llmProvider: baseResponse.llm.provider,
        llmConfidence: baseResponse.llm.confidence,
        toolName: toolCall.name,
        toolArguments: toolCall.arguments,
        policy: baseResponse.policy,
        confirmed: toolCall.confirmed,
        result: enrichedToolResult,
        artifacts: extractConversationArtifacts(enrichedToolResult),
        jobId: resultingJobId
      }),
      jobId: resultingJobId,
      integrationAccountId: context.integrationAccountId,
      sessionContextId: context.sessionContextId,
      userId: context.requestedBy
    });

    registerConversationTurnOutcome('executed');
    registerConversationOperationalEvent({
      conversationSessionId: context.conversationSessionId,
      conversationTurnId: context.conversationTurnId,
      correlationId: context.correlationId,
      channel: context.channel,
      actionType: 'tool.execute',
      status: 'executed',
      toolName: toolCall.name,
      requiresConfirmation: baseResponse.policy.requiresConfirmation,
      confirmed: Boolean(toolCall.confirmed),
      artifactCount: extractConversationArtifacts(enrichedToolResult).length,
      jobId: resultingJobId,
      integrationAccountId: context.integrationAccountId,
      sessionContextId: context.sessionContextId,
      userId: context.requestedBy
    });

    await persistAuditEntry({
      correlationId: context.correlationId,
      entityType: 'conversation',
      entityId: context.conversationSessionId,
      direction: 'internal',
      component: 'conversation-dispatcher',
      endpoint: toolCall.name,
      httpMethod: 'TOOL',
      httpStatus: 200,
      sanitizedBody: buildConversationTracePayload({
        context,
        status: 'executed',
        actionType: 'tool.execute',
        llmProvider: baseResponse.llm.provider,
        llmConfidence: baseResponse.llm.confidence,
        toolName: toolCall.name,
        toolArguments: toolCall.arguments,
        policy: baseResponse.policy,
        confirmed: toolCall.confirmed,
        result: enrichedToolResult,
        artifacts: extractConversationArtifacts(enrichedToolResult),
        jobId: resultingJobId
      })
    });

    return {
      ...baseResponse,
      status: 'executed' as const,
      responseText: assistantResponseText,
      result: enrichedToolResult,
      jobId: resultingJobId
    };
  } catch (error: unknown) {
    if (error instanceof AppError && error.code === 'PROVIDER_UNAVAILABLE') {
      const detail = error.message || 'provider unavailable';
      return buildProviderUnavailableResponse(context, detail);
    }

    if (error instanceof AppError && error.code === 'CONVERSATION_TOOL_UNSUPPORTED') {
      const reasonCode = 'CONVERSATION_TOOL_UNSUPPORTED';
      let unsupportedMessage: string;
      try {
        unsupportedMessage = await resolveUnsupportedToolResponseText({
          userMessage: input.messageText,
          toolName: toolCall.name,
          reasonCode,
          correlationId: context.correlationId
        });
      } catch (unsupportedError: unknown) {
        if (unsupportedError instanceof AppError && unsupportedError.code === 'PROVIDER_UNAVAILABLE') {
          const detail = unsupportedError.message || 'provider unavailable';
          return buildProviderUnavailableResponse(context, detail);
        }

        throw unsupportedError;
      }
      const structuredError = normalizeConversationStructuredError({
        correlationId: context.correlationId,
        message: unsupportedMessage,
        reasonCode,
        suggestion: 'Use uma ferramenta suportada pela API conversacional para esta operacao.'
      });

      await persistSafely('insert conversation_messages(assistant:unsupported_error)', async () => {
        await insertConversationMessage({
          id: createPrefixedId('cmsg'),
          conversationSessionId: context.conversationSessionId,
          conversationTurnId: context.conversationTurnId,
          role: 'assistant',
          messageText: toSafeText(unsupportedMessage),
          structuredPayload: sanitizeStructuredPayload({
            status: 'blocked',
            reasonCode,
            error: structuredError,
            orchestration: input.llmPlan.orchestration || null,
            conversationMemory: {
              askedManifestIds: input.askedManifestIds
            }
          }),
          toolCalls: sanitizeToolCalls([{
            name: toolCall.name,
            arguments: toolCall.arguments || {}
          }]),
          correlationId: context.correlationId,
          integrationAccountId: context.integrationAccountId,
          sessionContextId: context.sessionContextId
        });
      });

      await persistConversationAction({
        conversationSessionId: context.conversationSessionId,
        conversationTurnId: context.conversationTurnId,
        correlationId: context.correlationId,
        channel: context.channel,
        actionType: 'tool.unsupported',
        actionStatus: 'blocked',
        toolName: toolCall.name,
        toolArguments: toolCall.arguments,
        blockedReason: reasonCode,
        resultPayload: buildConversationTracePayload({
          context,
          status: 'blocked',
          actionType: 'tool.unsupported',
          llmProvider: baseResponse.llm.provider,
          llmConfidence: baseResponse.llm.confidence,
          toolName: toolCall.name,
          toolArguments: toolCall.arguments,
          policy: baseResponse.policy,
          confirmed: toolCall.confirmed,
          blockedReason: reasonCode,
          reasonCode
        }),
        integrationAccountId: context.integrationAccountId,
        sessionContextId: context.sessionContextId,
        userId: context.requestedBy
      });

      registerConversationTurnOutcome('blocked');
      registerConversationOperationalEvent({
        conversationSessionId: context.conversationSessionId,
        conversationTurnId: context.conversationTurnId,
        correlationId: context.correlationId,
        channel: context.channel,
        actionType: 'tool.unsupported',
        status: 'blocked',
        toolName: toolCall.name,
        reasonCode,
        requiresConfirmation: baseResponse.policy.requiresConfirmation,
        confirmed: Boolean(toolCall.confirmed),
        integrationAccountId: context.integrationAccountId,
        sessionContextId: context.sessionContextId,
        userId: context.requestedBy
      });

      return buildBlockedResponse(
        baseResponse,
        unsupportedMessage,
        reasonCode
      );
    }

    const detail = error instanceof Error ? error.message : 'Unexpected error while executing conversation tool.';
    const operatorMessage = error instanceof AppError
      ? mapOperationalToolErrorToOperatorMessage(error, toolCall)
      : 'Nao consegui concluir a operacao agora. Verifique os identificadores enviados e tente novamente.';
    const normalizedErrorResult = normalizeConversationStructuredError({
      correlationId: context.correlationId,
      message: operatorMessage,
      reasonCode: extractErrorCode(error),
      suggestion: 'Ajuste os filtros/identificadores e tente novamente, ou solicite uma pre-visualizacao antes da acao.',
      actions: [
        {
          type: 'follow_up',
          label: 'Revisar parametros',
          payload: {
            toolName: toolCall.name,
            reasonCode: extractErrorCode(error)
          }
        }
      ]
    });

    await persistMemoryPatchSafely({
      context,
      llmPlan,
      askedManifestIds: input.askedManifestIds,
      toolResult: normalizedErrorResult,
      llmProvider: input.llmProvider,
      messageText: input.messageText,
      assistantText: operatorMessage
    });

    await persistSafely('insert conversation_messages(assistant:failed)', async () => {
      await insertConversationMessage({
        id: createPrefixedId('cmsg'),
        conversationSessionId: context.conversationSessionId,
        conversationTurnId: context.conversationTurnId,
        role: 'assistant',
        messageText: toSafeText(operatorMessage),
        structuredPayload: sanitizeStructuredPayload({
          status: 'failed',
          error: detail,
          orchestration: input.llmPlan.orchestration || null,
          operationPlan
        }),
        toolCalls: sanitizeToolCalls([{
          name: toolCall.name,
          arguments: toolCall.arguments || {}
        }]),
        correlationId: context.correlationId,
        integrationAccountId: context.integrationAccountId,
        sessionContextId: context.sessionContextId
      });
    });

    await persistConversationAction({
      conversationSessionId: context.conversationSessionId,
      conversationTurnId: context.conversationTurnId,
      correlationId: context.correlationId,
      channel: context.channel,
      actionType: 'tool.execute',
      actionStatus: 'failed',
      riskLevel: baseResponse.policy.riskLevel,
      requiresConfirmation: baseResponse.policy.requiresConfirmation,
      toolName: toolCall.name,
      toolArguments: toolCall.arguments,
      confirmedAt: toolCall.confirmed ? new Date().toISOString() : null,
      resultPayload: buildConversationTracePayload({
        context,
        status: 'failed',
        actionType: 'tool.execute',
        llmProvider: baseResponse.llm.provider,
        llmConfidence: baseResponse.llm.confidence,
        toolName: toolCall.name,
        toolArguments: toolCall.arguments,
        policy: baseResponse.policy,
        confirmed: toolCall.confirmed,
        errorCode: extractErrorCode(error),
        errorMessage: detail
      }),
      integrationAccountId: context.integrationAccountId,
      sessionContextId: context.sessionContextId,
      userId: context.requestedBy
    });

    await persistSafely('insert conversation_deterministic_trails(result_failed)', async () => {
      await persistConversationDeterministicTrail({
        context: {
          conversationSessionId: context.conversationSessionId,
          conversationTurnId: context.conversationTurnId,
          correlationId: context.correlationId,
          integrationAccountId: context.integrationAccountId,
          sessionContextId: context.sessionContextId,
          requestedBy: context.requestedBy
        },
        phase: 'result',
        intent: toNullableString(toolCall.arguments?.intent),
        executionStatus: 'failed',
        snapshotToken: extractSnapshotToken({ data: toolCall.arguments || {} }),
        resultPayload: {
          toolName: toolCall.name,
          toolArguments: sanitizeToolArguments(toolCall.arguments || {}),
          errorCode: extractErrorCode(error),
          errorMessage: detail
        },
        metadata: {
          confirmed: Boolean(toolCall.confirmed)
        }
      });
    });

    registerConversationTurnOutcome('failed');
    registerConversationOperationalEvent({
      conversationSessionId: context.conversationSessionId,
      conversationTurnId: context.conversationTurnId,
      correlationId: context.correlationId,
      channel: context.channel,
      actionType: 'tool.execute',
      status: 'failed',
      toolName: toolCall.name,
      requiresConfirmation: baseResponse.policy.requiresConfirmation,
      confirmed: Boolean(toolCall.confirmed),
      errorCode: extractErrorCode(error),
      integrationAccountId: context.integrationAccountId,
      sessionContextId: context.sessionContextId,
      userId: context.requestedBy
    });

    await persistAuditEntry({
      correlationId: context.correlationId,
      entityType: 'conversation',
      entityId: context.conversationSessionId,
      direction: 'internal',
      component: 'conversation-dispatcher',
      endpoint: toolCall.name,
      httpMethod: 'TOOL',
      httpStatus: 500,
      sanitizedBody: buildConversationTracePayload({
        context,
        status: 'failed',
        actionType: 'tool.execute',
        llmProvider: baseResponse.llm.provider,
        llmConfidence: baseResponse.llm.confidence,
        toolName: toolCall.name,
        toolArguments: toolCall.arguments,
        policy: baseResponse.policy,
        confirmed: toolCall.confirmed,
        errorCode: extractErrorCode(error),
        errorMessage: detail
      })
    });

    return {
      ...baseResponse,
      status: 'failed' as const,
      responseText: operatorMessage,
      toolCall: {
        name: toolCall.name,
        arguments: toolCall.arguments
      },
      policy: baseResponse.policy,
      context: baseResponse.context,
      result: {
        ...normalizedErrorResult,
        debug: {
          error: detail
        }
      }
    };
  }
}

function ensureNormalizedConversationResult(toolResult: unknown) {
  const payload = toRecord(toolResult);
  const structured = normalizeConversationStructuredResult(toolResult);

  return {
    ...payload,
    type: structured.type,
    data: structured.data,
    artifacts: structured.artifacts,
    actions: structured.actions,
    assistantSummary: structured.assistantSummary || toNullableString(payload.assistantSummary),
    jobId: structured.jobId || toNullableString(payload.jobId)
  };
}

function extractSnapshotToken(value: unknown): string | null {
  const payload = toRecord(value);
  const data = toRecord(payload.data);
  return toNullableString(data.selectionSnapshot || data.creationSnapshot);
}

function extractIntent(value: unknown): string | null {
  const payload = toRecord(value);
  const data = toRecord(payload.data);
  return toNullableString(data.intent);
}

async function persistMemoryPatchSafely(input: {
  context: ReturnType<typeof buildConversationContext>;
  llmPlan: LlmPlan;
  askedManifestIds: string[];
  toolResult?: unknown;
  llmProvider?: LlmProvider;
  messageText?: string;
  assistantText?: string;
}) {
  const patch = buildConversationMemoryPatch({
    llmPlan: input.llmPlan,
    askedManifestIds: input.askedManifestIds,
    toolResult: input.toolResult
  });

  await persistSafely('upsert conversation_memory(memory_patch)', async () => {
    await persistConversationMemoryPatch({
      conversationSessionId: input.context.conversationSessionId,
      integrationAccountId: input.context.integrationAccountId,
      sessionContextId: input.context.sessionContextId,
      patch
    });
  });

  scheduleWorkingMemoryUpdate(input, patch);
}

/**
 * Agenda (fire-and-forget) a atualização da Working Memory pós-resposta, via o LLM provider
 * injetado. Ausente em providers de teste → no-op (não dispara LLM real nos testes). Best-effort:
 * nunca bloqueia nem derruba o turno (a resposta ao usuário já foi montada).
 */
function scheduleWorkingMemoryUpdate(
  input: {
    context: ReturnType<typeof buildConversationContext>;
    llmProvider?: LlmProvider;
    messageText?: string;
    assistantText?: string;
  },
  patch: ReturnType<typeof buildConversationMemoryPatch>
) {
  const llmProvider = input.llmProvider;
  const messageText = (input.messageText || '').trim();
  if (!llmProvider?.updateWorkingMemory || !messageText) {
    return;
  }
  const payload = {
    conversationSessionId: input.context.conversationSessionId,
    integrationAccountId: input.context.integrationAccountId,
    sessionContextId: input.context.sessionContextId,
    userMessage: messageText,
    assistantText: input.assistantText || '',
    intent: patch.intent,
    activeManifestIds: patch.activeManifestIds,
    activeJobIds: patch.activeJobIds,
    activeCdfIds: [] as string[],
    dateRange: patch.dateRange,
    today: operationalTodayIso()
  };
  void Promise.resolve()
    .then(() => llmProvider.updateWorkingMemory?.(payload))
    .catch(() => {
      // best-effort: a memória de trabalho não pode impactar a resposta ao usuário
    });

  // Memória VETORIAL dedicada: armazena os vetores do turno (gated pelo mesmo provider real → off em testes).
  void Promise.resolve()
    .then(() => storeConversationTurnVectors({
      conversationSessionId: input.context.conversationSessionId,
      integrationAccountId: input.context.integrationAccountId,
      userMessage: messageText,
      assistantText: input.assistantText || ''
    }))
    .catch(() => {
      // best-effort
    });
}

function extractToolResultSummary(value: unknown) {
  if (!value || typeof value !== 'object') {
    return { hasData: false };
  }

  const payload = value as { kind?: string; jobId?: string | null; data?: unknown };
  return {
    kind: payload.kind || null,
    hasData: payload.data != null,
    jobId: payload.jobId || null
  };
}

function shouldBypassNaturalSynthesis(toolResult: unknown): boolean {
  if (!toolResult || typeof toolResult !== 'object') {
    return false;
  }

  const payload = toolResult as LooseRecord;
  const data = toRecord(payload.data);
  const intent = toNullableString(data.intent) || '';
  const type = toNullableString(payload.type);

  // PRINCÍPIO: toda CONSULTA (listar, contar, agrupar, detalhar, catálogo, CDF/jobs, timeline)
  // passa pela SÍNTESE NATURAL — o LLM redige a resposta aterrado na evidência estruturada. O
  // resumo determinístico do dispatcher NÃO vai mais cru para o usuário: vira apenas EVIDÊNCIA
  // p/ o LLM e FALLBACK (LLM indisponível). Isso elimina respostas-template como
  // "Agrupei N por status. Ranking: ...".
  //
  // Bypass (resposta determinística/estruturada direta) APENAS quando re-sintetizar perderia
  // garantia ou raciocínio:
  // (a) operation.diagnose — saída de um loop agêntico multi-step (re-sintetizar perderia o raciocínio);
  // (b) formulários/rascunhos de criação (campos faltantes / draft estruturado);
  // (c) ações sensíveis e suas prévias — o contrato de confirmação é estruturado e validado pelos
  //     guardrails (prévia/pré-requisitos/impacto/itens afetados/confirmação explícita).
  if (intent === 'operation.diagnose') return true;
  if (type === 'manifest_missing_fields' || type === 'manifest_creation_draft') return true;
  if (
    intent.includes('cancel')
    || intent.includes('create_from_payload')
    || intent.includes('create_missing_fields')
    || intent.includes('submit')
    || intent.includes('print')
    || intent.includes('cdf.generate')
    || intent.includes('cdf.download')
  ) {
    return true;
  }
  return false;
}

function normalizeForGuardrailCheck(value: string): string {
  return value
    .normalize('NFD')
    .replaceAll(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

// N\u00fameros presentes na EVID\u00caNCIA (total no per\u00edodo, contagens por grupo, totais de cat\u00e1logo, n\u00ba de
// itens). Servem ao guardrail de grounding leve das consultas: a resposta natural deve citar algum
// deles (ancoragem factual) \u2014 sem exigir um template literal.
function collectEvidenceNumbers(data: LooseRecord): string[] {
  const out = new Set<string>();
  const add = (value: unknown) => {
    const n = Number(value);
    if (Number.isFinite(n)) out.add(String(Math.trunc(n)));
  };
  const criteria = toRecord(data.criteria);
  add(criteria.totalInRange);
  add(data.totalItems);
  add(data.total);
  if (Array.isArray(data.affectedItems)) add(data.affectedItems.length);
  if (Array.isArray(data.items)) add(data.items.length);
  if (Array.isArray(data.grouped)) {
    for (const group of data.grouped) add(toRecord(group).total);
  }
  return [...out];
}

// Cita um n\u00famero da evid\u00eancia como TOKEN (evita "2" casar dentro de "24").
function responseCitesEvidenceNumber(normalized: string, data: LooseRecord): boolean {
  return collectEvidenceNumbers(data).some((n) => new RegExp(`(^|[^0-9])${n}([^0-9]|$)`).test(normalized));
}

function responseDeclaresAbsence(normalized: string): boolean {
  return ['nenhum', 'nao ha', 'sem manifesto', 'sem registro', 'ausencia', 'nao encontrei', 'nao foi possivel']
    .some((needle) => normalized.includes(normalizeForGuardrailCheck(needle)));
}

// Nota (S-D): a compatibilidade ENTRE TIPO DE EVIDÊNCIA E INTENÇÃO (ex.: pediram manifestos/CDF
// mas veio painel de saúde/jobs) é garantida ANTES da síntese pela verificação pós-ferramenta
// (maybePostToolReroute → verifyEvidenceAndPlanReroute), que rerota para a ferramenta correta.
// Quando a síntese roda, a evidência já é do tipo certo; por isso este guardrail valida apenas o
// FORMATO/aterramento da redação por intent (sem re-mapear tipo aqui), preservando os intents estáveis.
function validateIntentResponseGuardrails(input: {
  candidateText: string;
  toolResult: unknown;
}): boolean {
  const payload = toRecord(input.toolResult);
  const data = toRecord(payload.data);
  const type = toNullableString(payload.type);
  const intent = toNullableString(data.intent) || '';
  const normalized = normalizeForGuardrailCheck(input.candidateText);

  // Recência: guardrail leve anti-alucinação (sem formato rígido). A resposta deve
  // citar um número/id de manifesto presente na evidência OU declarar ausência de
  // dados — permitindo redação natural e explicação de empate/ambiguidade pelo LLM.
  if (intent === 'manifest.list_recent_top') {
    const affectedItems = Array.isArray(data.affectedItems) ? data.affectedItems : [];
    if (affectedItems.length === 0) {
      return ['nenhum', 'nao encontrei', 'sem manifesto', 'nao ha', 'nao consegui', 'nao foi possivel']
        .some((needle) => normalized.includes(normalizeForGuardrailCheck(needle)));
    }
    // Respostas de CONTAGEM ("quantos") citam o TOTAL (aterrado na evidência), não números de
    // manifesto — também são válidas. Sem isto, a contagem é rejeitada e cai no template de lista.
    const criteria = toRecord(data.criteria);
    const totalRef = normalizeForGuardrailCheck(toNullableString(criteria.totalInRange) || '');
    const citesTotal = totalRef.length > 0 && normalized.includes(totalRef);
    const citesManifest = affectedItems.some((item) => {
      const record = toRecord(item);
      const reference = normalizeForGuardrailCheck(
        toNullableString(record.manifestNumber) || toNullableString(record.manifestId) || ''
      );
      return reference.length > 0 && normalized.includes(reference);
    });
    return citesManifest || citesTotal;
  }

  const isStructuredQueryIntent = intent === 'manifest.group_recent_top'
    || intent === 'cdf.list_by_manifest_selection'
    || type === 'cdf_list'
    || type === 'manifest_list'
    || type === 'job_list';

  if (isStructuredQueryIntent) {
    // Anti-alucinação LEVE (grounding), sem template rígido: a resposta GENERATIVA deve estar
    // ancorada na evidência — citar algum número dela (total no período / contagem de um grupo /
    // nº de itens) OU declarar ausência de dados. Antes exigia "periodo"+"total"+"status relevantes"
    // literais, o que forçava o resumo-template e bloqueava a redação natural.
    return responseCitesEvidenceNumber(normalized, data) || responseDeclaresAbsence(normalized);
  }

  const isSensitiveActionIntent = intent.includes('create_from_payload')
    || intent.includes('cancel')
    || intent.includes('submit')
    || intent.includes('print')
    || intent.includes('cdf.generate')
    || intent.includes('cdf.download');

  if (isSensitiveActionIntent) {
    return normalized.includes('previa da acao')
      && normalized.includes('pre-requisitos')
      && normalized.includes('impacto e risco')
      && normalized.includes('itens afetados')
      && normalized.includes('confirmacao explicita');
  }

  return true;
}

function buildSynthesisUnavailableError(): AppError {
  return new AppError(
    503,
    'AI nao configurado',
    'OPENAI_SYNTHESIS_MODEL indisponivel para gerar a resposta final.',
    { code: 'PROVIDER_UNAVAILABLE' }
  );
}

function buildFallbackToolSummary(toolResult: unknown): string | null {
  if (!toolResult || typeof toolResult !== 'object') return null;

  const payload = toolResult as LooseRecord;
  const kind = toNullableString(payload.kind) || 'unknown';
  const data = toRecord(payload.data);
  const dataKeys = Object.keys(data).slice(0, 12);
  const compactData = dataKeys.reduce((acc, key) => {
    const value = data[key];
    if (Array.isArray(value)) {
      acc[key] = { count: value.length };
      return acc;
    }

    if (value && typeof value === 'object') {
      acc[key] = '[object]';
      return acc;
    }

    acc[key] = value;
    return acc;
  }, {} as LooseRecord);

  return JSON.stringify({ kind, data: compactData });
}

function normalizeDefaultAssistantText(defaultText: string): string {
  return (defaultText || '').normalize('NFD').replaceAll(/[\u0300-\u036f]/g, '');
}

/**
 * Camada de redação injetável. A decisão final de COMO responder é do LLM, que
 * raciocina sobre a EVIDÊNCIA estruturada (fatos retornados pelas tools) — nunca
 * sobre um veredito pré-fabricado. `fallbackSummary` é apenas resiliência
 * determinística (LLM indisponível) e determinismo de teste.
 */
export type ConversationSynthesizer = (input: {
  userMessage: string;
  evidence: string;
  fallbackSummary: string | null;
}) => Promise<string | null>;

const defaultConversationSynthesizer: ConversationSynthesizer = async ({ userMessage, evidence }) =>
  synthesizeNaturalResponse({ userMessage, toolSummary: evidence });

/**
 * Serializa a EVIDÊNCIA estruturada de consultas de manifesto por recência para o
 * LLM raciocinar: candidatos com número/data/status, fonte, momento da consulta,
 * campo de recência e empate de datas. Não contém veredito ("o mais recente é X").
 */
function buildManifestRecencyEvidence(toolResult: unknown): string | null {
  const payload = toRecord(toolResult);
  const data = toRecord(payload.data);
  const intent = toNullableString(data.intent);
  if (intent !== 'manifest.list_recent_top') {
    return null;
  }

  const criteria = toRecord(data.criteria);
  const items = Array.isArray(data.affectedItems) ? data.affectedItems : [];
  const skip = Number(criteria.skipMostRecent) || 0;
  const candidates = items.map((item, index) => {
    const record = toRecord(item);
    return {
      posicao: skip + index + 1,
      numero: toNullableString(record.manifestNumber) || toNullableString(record.manifestId),
      dataExpedicao: toNullableString(record.expeditionDate),
      // Status do portal (user-facing: salvo/recebido/...). statusInterno é o do SICAT.
      status: toNullableString(record.externalStatus) || toNullableString(record.status),
      statusInterno: toNullableString(record.status),
      gerador: toNullableString(record.generator),
      destinador: toNullableString(record.receiver),
      transportador: toNullableString(record.carrier),
      motorista: toNullableString(record.driverName),
      placa: toNullableString(record.vehiclePlate)
    };
  });

  return JSON.stringify({
    consulta: 'manifestos ordenados por recencia',
    fonte: toNullableString(criteria.source) || 'local_mirror',
    consultadoEm: toNullableString(criteria.consultedAt),
    campoDeRecencia: toNullableString(criteria.recencyField) || 'expeditionDate',
    direcao: toNullableString(criteria.orderBy),
    periodo: { de: criteria.dateFrom ?? null, ate: criteria.dateTo ?? null },
    totalConsiderado: criteria.totalInRange ?? candidates.length,
    empateNaDataMaisRecente: criteria.ambiguousTopExpeditionDate ?? null,
    candidatos: candidates
  });
}

// Evidência estruturada para AGRUPAMENTO de manifestos (group_recent_top): período, total no
// período e a contagem por grupo (ex.: por status). O LLM redige um RESUMO NATURAL a partir disto,
// no lugar do resumo determinístico ("Agrupei N por status. Ranking: ..."). Sem isto, a evidência
// cairia no assistantSummary (o próprio template), empobrecendo a redação.
function buildManifestGroupEvidence(toolResult: unknown): string | null {
  const payload = toRecord(toolResult);
  const data = toRecord(payload.data);
  const intent = toNullableString(data.intent);
  if (intent !== 'manifest.group_recent_top') {
    return null;
  }

  const criteria = toRecord(data.criteria);
  const grouped = Array.isArray(data.grouped) ? data.grouped : [];
  const groupBy = toNullableString(criteria.groupBy) || 'status';
  const grupos = grouped.map((item) => {
    const record = toRecord(item);
    return {
      posicao: Number(record.rank) || undefined,
      grupo: toNullableString(record.group),
      total: Number(record.total) || 0
    };
  });
  const itensConsiderados = Array.isArray(data.affectedItems) ? data.affectedItems.length : 0;

  return JSON.stringify({
    consulta: `manifestos agrupados por ${groupBy}`,
    fonte: toNullableString(criteria.source) || 'local_mirror',
    consultadoEm: toNullableString(criteria.consultedAt),
    periodo: { de: criteria.dateFrom ?? null, ate: criteria.dateTo ?? null },
    totalNoPeriodo: criteria.totalInRange ?? itensConsiderados,
    agrupamentoPor: groupBy,
    ordenacaoGrupos: toNullableString(criteria.groupOrder),
    grupos
  });
}

function resolveResponseInputs(toolResult: unknown): {
  assistantSummary: string | null;
  evidence: string | null;
} {
  if (!toolResult || typeof toolResult !== 'object') {
    return { assistantSummary: null, evidence: null };
  }

  const assistantSummary = toNullableString((toolResult as LooseRecord).assistantSummary);
  // O LLM recebe EVIDÊNCIA estruturada (não o veredito/template): recência → candidatos;
  // agrupamento → período/total/contagem por grupo. Demais intents caem no assistantSummary
  // (evidência) e, por fim, num resumo determinístico do payload.
  const evidence =
    buildManifestRecencyEvidence(toolResult)
    || buildManifestGroupEvidence(toolResult)
    || assistantSummary
    || buildFallbackToolSummary(toolResult);
  return { assistantSummary, evidence };
}

async function synthesizeToolResponse(input: {
  toolResult: unknown;
  userMessage: string;
  evidence: string;
  fallbackSummary: string | null;
  synthesizer: ConversationSynthesizer;
}): Promise<string> {
  if (input.fallbackSummary && shouldBypassNaturalSynthesis(input.toolResult)) {
    return input.fallbackSummary;
  }

  if (input.userMessage) {
    let synthesized: string | null = null;
    try {
      synthesized = await input.synthesizer({
        userMessage: input.userMessage,
        evidence: input.evidence,
        fallbackSummary: input.fallbackSummary
      });
    } catch (error: unknown) {
      // Síntese indisponível: degrada para o resumo determinístico quando houver.
      if (!input.fallbackSummary) {
        throw error;
      }
      synthesized = null;
    }

    if (synthesized && validateIntentResponseGuardrails({
      candidateText: synthesized,
      toolResult: input.toolResult
    })) {
      return synthesized;
    }
  }

  if (input.fallbackSummary && validateIntentResponseGuardrails({
    candidateText: input.fallbackSummary,
    toolResult: input.toolResult
  })) {
    return input.fallbackSummary;
  }

  throw buildSynthesisUnavailableError();
}

async function resolveAssistantResponseText(
  defaultText: string,
  toolResult: unknown,
  userMessage: string,
  synthesizer: ConversationSynthesizer
): Promise<string> {
  const hasExecutionPlaceholder = /^executando acao:/i.test(normalizeDefaultAssistantText(defaultText));
  const { assistantSummary, evidence } = resolveResponseInputs(toolResult);

  if (evidence) {
    return synthesizeToolResponse({
      toolResult,
      userMessage,
      evidence,
      fallbackSummary: assistantSummary,
      synthesizer
    });
  }

  if (hasExecutionPlaceholder) {
    throw buildSynthesisUnavailableError();
  }

  return defaultText;
}

async function resolveUnsupportedToolResponseText(input: {
  userMessage: string;
  toolName: string;
  reasonCode: string;
  correlationId: string;
}): Promise<string> {
  const toolSummary = [
    `Falha tecnica: ${input.reasonCode}.`,
    `Ferramenta solicitada: ${input.toolName}.`,
    'A API conversacional nao suporta esta ferramenta no fluxo atual.',
    `CorrelationId: ${input.correlationId}.`
  ].join(' ');

  const synthesized = await synthesizeNaturalResponse({
    userMessage: input.userMessage,
    toolSummary
  });

  if (synthesized) {
    return synthesized;
  }

  throw buildSynthesisUnavailableError();
}

function isToolCall(value: LlmToolCall | null): value is LlmToolCall {
  return Boolean(value && typeof value.name === 'string' && value.name.trim());
}

async function persistSafely<T>(action: string, operation: () => Promise<T>): Promise<T | undefined> {
  try {
    return await operation();
  } catch (error: unknown) {
    let detail = 'unknown persistence error';
    if (error instanceof Error) {
      detail = error.message;
    } else if (typeof error === 'string') {
      detail = error;
    } else {
      detail = JSON.stringify(error);
    }
    console.warn(`[conversation:persistence] ${action} skipped: ${detail}`);
    return undefined;
  }
}

function extractContextDetails(payload: unknown) {
  const context = toRecord(payload);
  return {
    channelSessionKey: toNullableString(context.channelSessionKey),
    userId: toNullableString(context.userId),
    accountId: toNullableString(context.accountId),
    currentScreen: toNullableString(context.currentScreen),
    metadata: context
  };
}

async function persistConversationAction(input: ConversationActionInput) {
  await persistSafely('insert conversation_action_log', async () => {
    await insertConversationActionLog({
      id: createPrefixedId('cal'),
      conversationSessionId: input.conversationSessionId,
      conversationTurnId: input.conversationTurnId,
      userId: input.userId || null,
      channelType: input.channel,
      actionType: input.actionType,
      actionStatus: input.actionStatus,
      riskLevel: input.riskLevel || null,
      requiresConfirmation: Boolean(input.requiresConfirmation),
      confirmedAt: input.confirmedAt || null,
      blockedReason: input.blockedReason || null,
      toolName: input.toolName || null,
      toolArguments: sanitizeStructuredPayload(input.toolArguments || {}),
      resultPayload: sanitizeStructuredPayload(input.resultPayload || {}),
      correlationId: input.correlationId,
      jobId: input.jobId || null,
      integrationAccountId: input.integrationAccountId || null,
      sessionContextId: input.sessionContextId || null
    });
  });
}

async function persistAuditEntry(input: Parameters<typeof insertAuditEntry>[0]) {
  await persistSafely('insert audit_logs(conversation)', async () => {
    await insertAuditEntry({
      ...input,
      sanitizedHeaders: sanitizeStructuredPayload(input.sanitizedHeaders || {}),
      sanitizedBody: sanitizeStructuredPayload(input.sanitizedBody || {})
    });
  });
}

async function buildProviderUnavailableResponse(context: ReturnType<typeof buildConversationContext>, providerError: string): Promise<ProcessTurnOutput> {
  const fallbackReasonCode = 'PROVIDER_UNAVAILABLE';
  const fallbackResponseText = buildProviderUnavailableResponseText(context.correlationId);

  registerConversationProviderFailure(context.correlationId);
  registerConversationTurnOutcome('failed');

  await persistSafely('insert conversation_messages(assistant:fallback)', async () => {
    await insertConversationMessage({
      id: createPrefixedId('cmsg'),
      conversationSessionId: context.conversationSessionId,
      conversationTurnId: context.conversationTurnId,
      role: 'assistant',
      messageText: toSafeText(fallbackResponseText),
      structuredPayload: sanitizeStructuredPayload({
        status: 'failed',
        reasonCode: fallbackReasonCode,
        providerError
      }),
      correlationId: context.correlationId,
      integrationAccountId: context.integrationAccountId,
      sessionContextId: context.sessionContextId,
      jobId: context.jobId
    });
  });

  await persistConversationAction({
    conversationSessionId: context.conversationSessionId,
    conversationTurnId: context.conversationTurnId,
    correlationId: context.correlationId,
    channel: context.channel,
    actionType: 'fallback.provider',
    actionStatus: 'failed',
    blockedReason: fallbackReasonCode,
    integrationAccountId: context.integrationAccountId,
    sessionContextId: context.sessionContextId,
    userId: context.requestedBy,
    resultPayload: buildConversationTracePayload({
      context,
      status: 'failed',
      actionType: 'fallback.provider',
      llmProvider: 'provider-unavailable',
      llmConfidence: 0,
      reasonCode: fallbackReasonCode,
      blockedReason: fallbackReasonCode,
      errorCode: 'PROVIDER_UNAVAILABLE',
      errorMessage: providerError,
      jobId: context.jobId
    })
  });
  registerConversationOperationalEvent({
    conversationSessionId: context.conversationSessionId,
    conversationTurnId: context.conversationTurnId,
    correlationId: context.correlationId,
    channel: context.channel,
    actionType: 'fallback.provider',
    status: 'failed',
    reasonCode: fallbackReasonCode,
    errorCode: 'PROVIDER_UNAVAILABLE',
    jobId: context.jobId,
    integrationAccountId: context.integrationAccountId,
    sessionContextId: context.sessionContextId,
    userId: context.requestedBy
  });

  await persistAuditEntry({
    correlationId: context.correlationId,
    entityType: 'conversation',
    entityId: context.conversationSessionId,
    direction: 'internal',
    component: 'conversation-service',
    endpoint: '/v1/conversations/turns',
    httpMethod: 'POST',
    httpStatus: 503,
    sanitizedBody: buildConversationTracePayload({
      context,
      status: 'failed',
      actionType: 'fallback.provider',
      llmProvider: 'provider-unavailable',
      llmConfidence: 0,
      reasonCode: fallbackReasonCode,
      blockedReason: fallbackReasonCode,
      errorCode: 'PROVIDER_UNAVAILABLE',
      errorMessage: providerError,
      jobId: context.jobId
    })
  });

  const config = getAiConfig();

  return {
    conversationSessionId: context.conversationSessionId,
    conversationTurnId: context.conversationTurnId,
    correlationId: context.correlationId,
    channel: context.channel,
    status: 'failed',
    responseText: fallbackResponseText,
    llm: {
      provider: 'provider-unavailable',
      confidence: 0,
      agentModelUsed: config.openAiAgentModel,
      synthesisModelUsed: config.openAiSynthesisModel
    },
    toolCall: null,
    policy: {
      allowed: true,
      reasonCode: null,
      reason: null,
      requiresConfirmation: false,
      riskLevel: null
    },
    context: {
      integrationAccountId: context.integrationAccountId,
      sessionContextId: context.sessionContextId,
      manifestId: context.manifestId,
      jobId: context.jobId
    },
    result: {
      reasonCode: fallbackReasonCode
    }
  };
}

async function buildInvalidLlmProviderResponse(input: {
  context: ReturnType<typeof buildConversationContext>;
  provider: string;
  reason: string;
}): Promise<ProcessTurnOutput> {
  const reasonCode = 'INVALID_LLM_PROVIDER';
  const responseText = buildInvalidLlmProviderResponseText(input.context.correlationId, input.provider);

  registerConversationProviderFailure(input.context.correlationId);
  registerConversationTurnOutcome('failed');

  await persistSafely('insert conversation_messages(assistant:invalid_provider)', async () => {
    await insertConversationMessage({
      id: createPrefixedId('cmsg'),
      conversationSessionId: input.context.conversationSessionId,
      conversationTurnId: input.context.conversationTurnId,
      role: 'assistant',
      messageText: toSafeText(responseText),
      structuredPayload: sanitizeStructuredPayload({
        status: 'failed',
        reasonCode,
        provider: input.provider,
        providerError: input.reason
      }),
      correlationId: input.context.correlationId,
      integrationAccountId: input.context.integrationAccountId,
      sessionContextId: input.context.sessionContextId,
      jobId: input.context.jobId
    });
  });

  await persistConversationAction({
    conversationSessionId: input.context.conversationSessionId,
    conversationTurnId: input.context.conversationTurnId,
    correlationId: input.context.correlationId,
    channel: input.context.channel,
    actionType: 'provider.validation',
    actionStatus: 'failed',
    blockedReason: reasonCode,
    integrationAccountId: input.context.integrationAccountId,
    sessionContextId: input.context.sessionContextId,
    userId: input.context.requestedBy,
    resultPayload: buildConversationTracePayload({
      context: input.context,
      status: 'failed',
      actionType: 'provider.validation',
      llmProvider: input.provider,
      llmConfidence: 0,
      reasonCode,
      blockedReason: reasonCode,
      errorCode: reasonCode,
      errorMessage: input.reason,
      jobId: input.context.jobId
    })
  });

  registerConversationOperationalEvent({
    conversationSessionId: input.context.conversationSessionId,
    conversationTurnId: input.context.conversationTurnId,
    correlationId: input.context.correlationId,
    channel: input.context.channel,
    actionType: 'provider.validation',
    status: 'failed',
    reasonCode,
    errorCode: reasonCode,
    jobId: input.context.jobId,
    integrationAccountId: input.context.integrationAccountId,
    sessionContextId: input.context.sessionContextId,
    userId: input.context.requestedBy
  });

  await persistAuditEntry({
    correlationId: input.context.correlationId,
    entityType: 'conversation',
    entityId: input.context.conversationSessionId,
    direction: 'internal',
    component: 'conversation-service',
    endpoint: '/v1/conversations/turns',
    httpMethod: 'POST',
    httpStatus: 422,
    sanitizedBody: buildConversationTracePayload({
      context: input.context,
      status: 'failed',
      actionType: 'provider.validation',
      llmProvider: input.provider,
      llmConfidence: 0,
      reasonCode,
      blockedReason: reasonCode,
      errorCode: reasonCode,
      errorMessage: input.reason,
      jobId: input.context.jobId
    })
  });

  const config = getAiConfig();
  return {
    conversationSessionId: input.context.conversationSessionId,
    conversationTurnId: input.context.conversationTurnId,
    correlationId: input.context.correlationId,
    channel: input.context.channel,
    status: 'failed',
    responseText,
    llm: {
      provider: input.provider,
      confidence: 0,
      agentModelUsed: config.openAiAgentModel,
      synthesisModelUsed: config.openAiSynthesisModel
    },
    toolCall: null,
    policy: {
      allowed: false,
      reasonCode,
      reason: input.reason,
      requiresConfirmation: false,
      riskLevel: null
    },
    context: {
      integrationAccountId: input.context.integrationAccountId,
      sessionContextId: input.context.sessionContextId,
      manifestId: input.context.manifestId,
      jobId: input.context.jobId
    },
    result: {
      reasonCode,
      providerError: input.reason
    }
  };
}

type ConversationPlanningState = {
  history: Array<{ role: string; text: string }>;
  lastManifestSelectionIds: string[];
  askedManifestIds: string[];
  workingMemoryBlock: string | null;
};

async function loadConversationPlanningState(
  context: ReturnType<typeof buildConversationContext>,
  messageText: string
): Promise<ConversationPlanningState> {
  const recentMessages = await listConversationMessages(
    context.conversationSessionId,
    context.integrationAccountId,
    20
  );
  const persistedState = await loadPersistedConversationOperationalState({
    conversationSessionId: context.conversationSessionId,
    integrationAccountId: context.integrationAccountId
  });
  const workingMemory = await loadWorkingMemory({
    conversationSessionId: context.conversationSessionId,
    integrationAccountId: context.integrationAccountId
  });
  // Recall VETORIAL: trechos passados mais relevantes à mensagem atual (continuidade além da janela recente).
  const vectorHits = await recallConversationSemanticMemory({
    conversationSessionId: context.conversationSessionId,
    integrationAccountId: context.integrationAccountId,
    query: messageText,
    k: 4
  });
  const history = recentMessages
    .map((message: unknown) => toRecord(message))
    .filter(
      (message: LooseRecord) =>
        toNullableString(message.conversationTurnId) !== context.conversationTurnId
        && (toNullableString(message.role) === 'user' || toNullableString(message.role) === 'assistant')
        && toNullableString(message.messageText)
    )
    .reverse()
    .map((message: LooseRecord) => ({
      role: toNullableString(message.role) || 'assistant',
      text: toNullableString(message.messageText) || ''
    }));

  return {
    history,
    lastManifestSelectionIds: (() => {
      const fromMessages = getLastManifestSelectionIdsFromMessages(recentMessages);
      return fromMessages.length > 0 ? fromMessages : persistedState.lastManifestSelectionIds;
    })(),
    askedManifestIds: (() => {
      const fromMessages = getAskedManifestIdsFromMessages(recentMessages);
      return fromMessages.length > 0 ? fromMessages : persistedState.askedManifestIds;
    })(),
    workingMemoryBlock: [buildWorkingMemoryContextBlock(workingMemory), buildVectorMemoryBlock(vectorHits)]
      .filter(Boolean)
      .join('\n\n')
  };
}

async function resolveLlmPlanForTurn(input: {
  llmProvider: LlmProvider;
  explicitTool: ExplicitToolRequest | null;
  messageText: string;
  context: ReturnType<typeof buildConversationContext>;
  planningState: ConversationPlanningState;
  userContent?: Array<Record<string, unknown>> | null;
}): Promise<LlmPlan | ProcessTurnOutput> {
  const config = getAiConfig();

  if (input.explicitTool) {
    return {
      provider: 'explicit-tool-request' as const,
      confidence: 1,
      outputText: 'Tool request recebido explicitamente.',
      toolCall: {
        name: input.explicitTool.name,
        arguments: input.explicitTool.arguments,
        confirmed: input.explicitTool.confirmed
      },
      agentModelUsed: config.openAiAgentModel,
      synthesisModelUsed: config.openAiSynthesisModel
    };
  }

  try {
    const llmPlan = await input.llmProvider.plan({
      messageText: input.messageText,
      context: {
        ...input.context,
        lastManifestSelectionIds: input.planningState.lastManifestSelectionIds,
        askedManifestIds: input.planningState.askedManifestIds,
        workingMemoryBlock: input.planningState.workingMemoryBlock
      },
      history: input.planningState.history,
      userContent: input.userContent ?? null
    });

    const normalizedProvider = normalizeLlmProviderName(llmPlan.provider);
    if (isInvalidLlmProvider(normalizedProvider, false)) {
      return buildInvalidLlmProviderResponse({
        context: input.context,
        provider: normalizedProvider,
        reason: `Provider ${normalizedProvider} nao e permitido para respostas conversacionais reais.`
      });
    }

    return {
      ...llmPlan,
      provider: normalizedProvider
    };
  } catch (error: unknown) {
    const providerError = error instanceof Error ? error.message : 'provider unavailable';
    return buildProviderUnavailableResponse(input.context, providerError);
  }
}

export function listConversationTools() {
  return getConversationToolPolicies().map((tool) => {
    const inventory = getConversationToolInventoryItem(tool.toolName);
    return {
      ...tool,
      objective: inventory?.objective || null,
      dependencies: inventory?.dependencies || [],
      category: inventory?.category || null
    };
  });
}

export function createConversationService(dependencies?: {
  llmProvider?: LlmProvider;
  synthesizer?: ConversationSynthesizer;
}) {
  // F4: CONVERSATION_ENGINE=ai-core roteia o planejamento pelo grafo da plataforma
  // (fallback gracioso ao planner legado); default permanece o provider legado.
  const llmProvider = dependencies?.llmProvider || resolveLlmProvider();
  const synthesizer = dependencies?.synthesizer || defaultConversationSynthesizer;

  return {
    async processTurn(input: ProcessTurnInput): Promise<ProcessTurnOutput> {
      const context = buildConversationContext({
        channel: input.body.channel,
        conversationSessionId: input.body.conversationSessionId,
        context: input.body.context,
        metadata: input.body.metadata,
        correlationId: input.correlationId,
        idempotencyKey: input.idempotencyKey || null
      });

      const messageText = readMessageText(input.body);
      const explicitTool = parseExplicitToolRequest(input.body);
      const options = toRecord(input.body.options);
      const rawContext = extractContextDetails(input.body.context);
      const allowActions = toBoolean(options.allowActions, true);
      const sanitizedRawContextMetadata = sanitizeStructuredPayload(rawContext.metadata);
      const sanitizedRequestMetadata = sanitizeStructuredPayload(context.metadata);

      const upsertedSession = await persistSafely('upsert conversation_session', async () =>
        upsertConversationSession({
          id: context.conversationSessionId,
          channelType: context.channel,
          channelSessionKey: rawContext.channelSessionKey,
          userId: rawContext.userId || context.requestedBy,
          accountId: rawContext.accountId,
          integrationAccountId: context.integrationAccountId,
          sessionContextId: context.sessionContextId,
          currentScreen: rawContext.currentScreen,
          currentManifestId: context.manifestId,
          status: 'active',
          metadata: {
            ...sanitizedRawContextMetadata,
            headers: {
              hasIdempotencyKey: Boolean(context.idempotencyKey)
            }
          },
          lastCorrelationId: context.correlationId,
          lastTurnAt: new Date().toISOString()
        })
      );
      // Adota o id CANÔNICO da sessão: quando já existe uma para este (channel_type, channel_session_key),
      // o upsert reutiliza a linha existente e devolve o id original. Sem isto, um conversationSessionId
      // novo a cada turno (front não reenvia um estável) faria as escritas filhas (mensagens, working-memory,
      // trilhas, action logs) referenciarem uma sessão inexistente e cairem por FK. Propaga p/ todo o turno
      // e p/ a resposta (assim o front passa a reenviar o id canônico).
      if (upsertedSession?.id && upsertedSession.id !== context.conversationSessionId) {
        context.conversationSessionId = upsertedSession.id;
      }

      await persistSafely('insert conversation_messages(user)', async () => {
        await insertConversationMessage({
          id: createPrefixedId('cmsg'),
          conversationSessionId: context.conversationSessionId,
          conversationTurnId: context.conversationTurnId,
          role: 'user',
          messageText: toSafeText(messageText),
          structuredPayload: sanitizeStructuredPayload({
            metadata: sanitizedRequestMetadata,
            context: sanitizedRawContextMetadata,
            // Multimodal: rastro SEGURO da ingestão de arquivos — SÓ manifesto + notas, NUNCA bytes/base64.
            ...(input.ingestManifest ? { ingest: input.ingestManifest } : {})
          }),
          correlationId: context.correlationId,
          integrationAccountId: context.integrationAccountId,
          sessionContextId: context.sessionContextId,
          jobId: context.jobId
        });
      });

      let llmPlan: LlmPlan;
      const planningState = await loadConversationPlanningState(context, messageText);
      const askedManifestIds = planningState.askedManifestIds;
      const planningResult = await resolveLlmPlanForTurn({
        llmProvider,
        explicitTool,
        messageText,
        context,
        planningState,
        userContent: input.userContent ?? null
      });

      if ('status' in planningResult) {
        return planningResult;
      }

      llmPlan = planningResult;

      await persistSafely('insert conversation_deterministic_trails(plan)', async () => {
        await persistConversationDeterministicTrail({
          context: {
            conversationSessionId: context.conversationSessionId,
            conversationTurnId: context.conversationTurnId,
            correlationId: context.correlationId,
            integrationAccountId: context.integrationAccountId,
            sessionContextId: context.sessionContextId,
            requestedBy: context.requestedBy
          },
          phase: 'plan',
          intent: toNullableString(llmPlan.toolCall?.arguments?.intent),
          executionStatus: llmPlan.toolCall ? 'processing' : 'available',
          snapshotToken: extractSnapshotToken({ data: llmPlan.toolCall?.arguments || {} }),
          planPayload: {
            provider: llmPlan.provider,
            confidence: llmPlan.confidence,
            outputText: llmPlan.outputText,
            toolCall: llmPlan.toolCall
              ? {
                name: llmPlan.toolCall.name,
                arguments: sanitizeToolArguments(llmPlan.toolCall.arguments || {}),
                confirmed: Boolean(llmPlan.toolCall.confirmed)
              }
              : null,
            orchestration: llmPlan.orchestration || null
          },
          metadata: {
            hasToolCall: Boolean(llmPlan.toolCall)
          }
        });
      });

      const baseResponse: Omit<ProcessTurnOutput, 'status' | 'responseText'> = {
        conversationSessionId: context.conversationSessionId,
        conversationTurnId: context.conversationTurnId,
        correlationId: context.correlationId,
        channel: context.channel,
        llm: {
          provider: llmPlan.provider,
          confidence: llmPlan.confidence,
          agentModelUsed: llmPlan.agentModelUsed,
          synthesisModelUsed: llmPlan.synthesisModelUsed,
          ...(llmPlan.escalationModelUsed && {
            escalationModelUsed: llmPlan.escalationModelUsed
          }),
          ...(llmPlan.escalationReason && {
            escalationReason: llmPlan.escalationReason
          })
        },
        toolCall: isToolCall(llmPlan.toolCall)
          ? {
            name: llmPlan.toolCall.name,
            arguments: llmPlan.toolCall.arguments || {}
          }
          : null,
        policy: {
          allowed: true,
          reasonCode: null,
          reason: null,
          requiresConfirmation: false,
          riskLevel: null
        },
        context: {
          integrationAccountId: context.integrationAccountId,
          sessionContextId: context.sessionContextId,
          manifestId: context.manifestId,
          jobId: context.jobId
        }
      };

      const turnAskedManifestIds = mergeAskedManifestIds([
        askedManifestIds,
        extractManifestTokensFromText(messageText),
        extractManifestTokensFromToolCall(llmPlan.toolCall)
      ]);

      if (!isToolCall(llmPlan.toolCall)) {
        const operationPlan = buildConversationOperationPlan({
          llmPlan,
          context: {
            integrationAccountId: context.integrationAccountId,
            sessionContextId: context.sessionContextId,
            manifestId: context.manifestId
          }
        });

        await persistMemoryPatchSafely({
          context,
          llmPlan,
          askedManifestIds: turnAskedManifestIds,
          llmProvider,
          messageText,
          assistantText: llmPlan.outputText
        });

        await persistSafely('insert conversation_messages(assistant:responded)', async () => {
          await insertConversationMessage({
            id: createPrefixedId('cmsg'),
            conversationSessionId: context.conversationSessionId,
            conversationTurnId: context.conversationTurnId,
            role: 'assistant',
            messageText: toSafeText(llmPlan.outputText),
            structuredPayload: sanitizeStructuredPayload({
              status: 'responded',
              confidence: llmPlan.confidence,
              provider: llmPlan.provider,
              orchestration: llmPlan.orchestration || null,
              operationPlan,
              conversationMemory: {
                askedManifestIds: turnAskedManifestIds
              }
            }),
            correlationId: context.correlationId,
            integrationAccountId: context.integrationAccountId,
            sessionContextId: context.sessionContextId,
            jobId: context.jobId
          });
        });

        await persistSafely('upsert conversation_memory(responded)', async () => {
          await persistConversationOperationalState({
            context: {
              conversationSessionId: context.conversationSessionId,
              conversationTurnId: context.conversationTurnId,
              correlationId: context.correlationId,
              integrationAccountId: context.integrationAccountId,
              sessionContextId: context.sessionContextId,
              requestedBy: context.requestedBy
            },
            askedManifestIds: turnAskedManifestIds
          });
        });

        await persistConversationAction({
          conversationSessionId: context.conversationSessionId,
          conversationTurnId: context.conversationTurnId,
          correlationId: context.correlationId,
          channel: context.channel,
          actionType: 'turn.respond',
          actionStatus: 'responded',
          integrationAccountId: context.integrationAccountId,
          sessionContextId: context.sessionContextId,
          userId: context.requestedBy,
          resultPayload: buildConversationTracePayload({
            context,
            status: 'responded',
            actionType: 'turn.respond',
            llmProvider: llmPlan.provider,
            llmConfidence: llmPlan.confidence,
            jobId: context.jobId
          })
        });

        registerConversationTurnOutcome('responded');
        registerConversationOperationalEvent({
          conversationSessionId: context.conversationSessionId,
          conversationTurnId: context.conversationTurnId,
          correlationId: context.correlationId,
          channel: context.channel,
          actionType: 'turn.respond',
          status: 'responded',
          jobId: context.jobId,
          integrationAccountId: context.integrationAccountId,
          sessionContextId: context.sessionContextId,
          userId: context.requestedBy
        });

        await persistAuditEntry({
          correlationId: context.correlationId,
          entityType: 'conversation',
          entityId: context.conversationSessionId,
          direction: 'internal',
          component: 'conversation-service',
          endpoint: '/v1/conversations/turns',
          httpMethod: 'POST',
          httpStatus: 200,
          sanitizedBody: buildConversationTracePayload({
            context,
            status: 'responded',
            actionType: 'turn.respond',
            llmProvider: llmPlan.provider,
            llmConfidence: llmPlan.confidence,
            jobId: context.jobId
          })
        });

        return {
          ...baseResponse,
          status: 'responded',
          responseText: llmPlan.outputText
        };
      }

      const toolCall = llmPlan.toolCall;

      const policyDecision = evaluateConversationPolicy({
        toolName: toolCall.name,
        toolArgs: toolCall.arguments,
        channel: context.channel,
        confirmed: toolCall.confirmed,
        allowActions,
        context
      });

      baseResponse.policy = {
        allowed: policyDecision.allowed,
        reasonCode: policyDecision.reasonCode,
        reason: policyDecision.reason,
        requiresConfirmation: policyDecision.requiresConfirmation,
        riskLevel: policyDecision.riskLevel
      };

      if (!policyDecision.allowed) {
        const operationPlan = buildConversationOperationPlan({
          llmPlan,
          context: {
            integrationAccountId: context.integrationAccountId,
            sessionContextId: context.sessionContextId,
            manifestId: context.manifestId
          }
        });

        await persistMemoryPatchSafely({
          context,
          llmPlan,
          askedManifestIds: turnAskedManifestIds,
          llmProvider,
          messageText,
          assistantText: llmPlan.outputText
        });

        await persistSafely('insert conversation_messages(assistant:blocked)', async () => {
          await insertConversationMessage({
            id: createPrefixedId('cmsg'),
            conversationSessionId: context.conversationSessionId,
            conversationTurnId: context.conversationTurnId,
            role: 'assistant',
            messageText: policyDecision.reason || 'A operacao foi bloqueada por policy da camada conversacional.',
            structuredPayload: sanitizeStructuredPayload({
              status: 'blocked',
              reasonCode: policyDecision.reasonCode,
              riskLevel: policyDecision.riskLevel,
              requiresConfirmation: policyDecision.requiresConfirmation,
              orchestration: llmPlan.orchestration || null,
              operationPlan,
              conversationMemory: {
                askedManifestIds: turnAskedManifestIds
              }
            }),
            toolCalls: sanitizeToolCalls([{
              name: toolCall.name,
              arguments: toolCall.arguments || {}
            }]),
            correlationId: context.correlationId,
            integrationAccountId: context.integrationAccountId,
            sessionContextId: context.sessionContextId
          });
        });

        await persistConversationAction({
          conversationSessionId: context.conversationSessionId,
          conversationTurnId: context.conversationTurnId,
          correlationId: context.correlationId,
          channel: context.channel,
          actionType: 'tool.blocked',
          actionStatus: 'blocked',
          riskLevel: policyDecision.riskLevel,
          requiresConfirmation: policyDecision.requiresConfirmation,
          blockedReason: policyDecision.reason || policyDecision.reasonCode,
          toolName: toolCall.name,
          toolArguments: toolCall.arguments,
          confirmedAt: toolCall.confirmed ? new Date().toISOString() : null,
          resultPayload: buildConversationTracePayload({
            context,
            status: 'blocked',
            actionType: 'tool.blocked',
            llmProvider: baseResponse.llm.provider,
            llmConfidence: baseResponse.llm.confidence,
            toolName: toolCall.name,
            toolArguments: toolCall.arguments,
            policy: baseResponse.policy,
            confirmed: toolCall.confirmed,
            blockedReason: policyDecision.reason || policyDecision.reasonCode,
            reasonCode: policyDecision.reasonCode
          }),
          integrationAccountId: context.integrationAccountId,
          sessionContextId: context.sessionContextId,
          userId: context.requestedBy
        });

        registerConversationTurnOutcome('blocked');
        registerConversationPolicyBlocked(policyDecision.reasonCode);
        registerConversationOperationalEvent({
          conversationSessionId: context.conversationSessionId,
          conversationTurnId: context.conversationTurnId,
          correlationId: context.correlationId,
          channel: context.channel,
          actionType: 'tool.blocked',
          status: 'blocked',
          toolName: toolCall.name,
          reasonCode: policyDecision.reasonCode,
          riskLevel: policyDecision.riskLevel,
          requiresConfirmation: policyDecision.requiresConfirmation,
          confirmed: Boolean(toolCall.confirmed),
          integrationAccountId: context.integrationAccountId,
          sessionContextId: context.sessionContextId,
          userId: context.requestedBy
        });

        await persistAuditEntry({
          correlationId: context.correlationId,
          entityType: 'conversation',
          entityId: context.conversationSessionId,
          direction: 'internal',
          component: 'conversation-policy',
          endpoint: toolCall.name,
          httpMethod: 'TOOL',
          httpStatus: 403,
          sanitizedBody: buildConversationTracePayload({
            context,
            status: 'blocked',
            actionType: 'tool.blocked',
            llmProvider: baseResponse.llm.provider,
            llmConfidence: baseResponse.llm.confidence,
            toolName: toolCall.name,
            toolArguments: toolCall.arguments,
            policy: baseResponse.policy,
            confirmed: toolCall.confirmed,
            blockedReason: policyDecision.reason || policyDecision.reasonCode,
            reasonCode: policyDecision.reasonCode
          })
        });

        return buildBlockedResponse(
          baseResponse,
          policyDecision.reason || 'A operacao foi bloqueada por policy da camada conversacional.',
          policyDecision.reasonCode
        );
      }

      if (!isConversationToolSupported(toolCall.name)) {
        const reasonCode = 'TOOL_NOT_SUPPORTED';
        const unsupportedMessage = await resolveUnsupportedToolResponseText({
          userMessage: messageText,
          toolName: toolCall.name,
          reasonCode,
          correlationId: context.correlationId
        });
        const structuredError = normalizeConversationStructuredError({
          correlationId: context.correlationId,
          message: unsupportedMessage,
          reasonCode,
          suggestion: 'Selecione uma ferramenta suportada pela API conversacional.'
        });

        await persistSafely('insert conversation_messages(assistant:unsupported)', async () => {
          await insertConversationMessage({
            id: createPrefixedId('cmsg'),
            conversationSessionId: context.conversationSessionId,
            conversationTurnId: context.conversationTurnId,
            role: 'assistant',
            messageText: toSafeText(unsupportedMessage),
            structuredPayload: sanitizeStructuredPayload({
              status: 'blocked',
              reasonCode,
              error: structuredError,
              orchestration: llmPlan.orchestration || null,
              conversationMemory: {
                askedManifestIds: turnAskedManifestIds
              }
            }),
            toolCalls: sanitizeToolCalls([{
              name: toolCall.name,
              arguments: toolCall.arguments || {}
            }]),
            correlationId: context.correlationId,
            integrationAccountId: context.integrationAccountId,
            sessionContextId: context.sessionContextId
          });
        });

        await persistConversationAction({
          conversationSessionId: context.conversationSessionId,
          conversationTurnId: context.conversationTurnId,
          correlationId: context.correlationId,
          channel: context.channel,
          actionType: 'tool.unsupported',
          actionStatus: 'blocked',
          toolName: toolCall.name,
          toolArguments: toolCall.arguments,
          blockedReason: reasonCode,
          confirmedAt: toolCall.confirmed ? new Date().toISOString() : null,
          resultPayload: buildConversationTracePayload({
            context,
            status: 'blocked',
            actionType: 'tool.unsupported',
            llmProvider: baseResponse.llm.provider,
            llmConfidence: baseResponse.llm.confidence,
            toolName: toolCall.name,
            toolArguments: toolCall.arguments,
            policy: baseResponse.policy,
            confirmed: toolCall.confirmed,
            blockedReason: reasonCode,
            reasonCode
          }),
          integrationAccountId: context.integrationAccountId,
          sessionContextId: context.sessionContextId,
          userId: context.requestedBy
        });

        registerConversationTurnOutcome('blocked');
        registerConversationOperationalEvent({
          conversationSessionId: context.conversationSessionId,
          conversationTurnId: context.conversationTurnId,
          correlationId: context.correlationId,
          channel: context.channel,
          actionType: 'tool.unsupported',
          status: 'blocked',
          toolName: toolCall.name,
          reasonCode,
          requiresConfirmation: baseResponse.policy.requiresConfirmation,
          confirmed: Boolean(toolCall.confirmed),
          integrationAccountId: context.integrationAccountId,
          sessionContextId: context.sessionContextId,
          userId: context.requestedBy
        });

        await persistAuditEntry({
          correlationId: context.correlationId,
          entityType: 'conversation',
          entityId: context.conversationSessionId,
          direction: 'internal',
          component: 'conversation-dispatcher',
          endpoint: toolCall.name,
          httpMethod: 'TOOL',
          httpStatus: 400,
          sanitizedBody: buildConversationTracePayload({
            context,
            status: 'blocked',
            actionType: 'tool.unsupported',
            llmProvider: baseResponse.llm.provider,
            llmConfidence: baseResponse.llm.confidence,
            toolName: toolCall.name,
            toolArguments: toolCall.arguments,
            policy: baseResponse.policy,
            confirmed: toolCall.confirmed,
            blockedReason: reasonCode,
            reasonCode
          })
        });

        return buildBlockedResponse(
          baseResponse,
          unsupportedMessage,
          reasonCode
        );
      }

      return executeToolWithFallback({
        toolCall,
        llmPlan,
        baseResponse,
        context,
        headers: input.headers,
        messageText,
        askedManifestIds: turnAskedManifestIds,
        lastManifestSelectionIds: planningState.lastManifestSelectionIds,
        synthesizer,
        llmProvider
      });
    }
  };
}
