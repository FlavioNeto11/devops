import type { ConversationChannel, ConversationContext } from './conversation-context-service.js';
import {
  getConversationToolInventory,
  getConversationToolInventoryItem,
  isRegisteredConversationTool
} from './tools/tool-registry.js';
import type { ConversationToolName, ConversationToolPolicy, ConversationToolRiskLevel } from './tools/tool-types.js';
import { resolveEffectiveToolPolicy, isRuntimeToolEnabled } from '../ai-control/ai-runtime-registry-service.js';
import { isAiControlReadOnly } from '../ai-control/ai-control-config.js';

export type ConversationRiskLevel = ConversationToolRiskLevel;

type ToolPolicy = {
  riskLevel: ConversationRiskLevel;
  allowChannels: ConversationChannel[];
  requiresConfirmation: boolean;
  isAction: boolean;
  batchLimitByChannel?: Record<ConversationChannel, number>;
};

type PermissionContext = {
  permissionKeys: Set<string>;
};

type ScopeValidationContext = {
  integrationAccountId: string | null;
  sessionContextId: string | null;
  correlationId: string | null;
};

type CrossAccountCheckInput = {
  currentAccountId: string | null;
  snapshotAccountId: string | null;
  intent: string;
};

export type ConversationPolicyInput = {
  toolName: string;
  toolArgs?: Record<string, unknown>;
  channel: ConversationChannel;
  confirmed?: boolean;
  allowActions?: boolean;
  context: ConversationContext;
};

export type ConversationPolicyDecision = {
  allowed: boolean;
  reasonCode: string | null;
  reason: string | null;
  requiresConfirmation: boolean;
  riskLevel: ConversationRiskLevel | null;
  isAction: boolean;
  maxBatchSize?: number | null;
  enforcedScope?: 'account' | 'session' | 'profile' | null;
};

function toToolPolicy(toolName: ConversationToolName): ToolPolicy {
  const item = getConversationToolInventoryItem(toolName);
  const codePolicy: ConversationToolPolicy = item
    ? item.policy
    : { riskLevel: 'R1', allowChannels: ['inapp'], requiresConfirmation: false, isAction: false };

  // Overlay com override do AI Control Center (ai_tools). Sem override, retorna o default de código.
  const effective = resolveEffectiveToolPolicy(toolName, codePolicy);

  return {
    riskLevel: effective.riskLevel,
    allowChannels: effective.allowChannels,
    requiresConfirmation: effective.requiresConfirmation,
    isAction: effective.isAction
  };
}

function resolveOrchestratedIntentPolicy(intent: string): ToolPolicy | null {
  if (
    intent === 'manifest.preview_cancel_recent_excluding_first'
    || intent === 'manifest.preview_batch_submit_selected'
    || intent === 'manifest.preview_batch_print_selected'
    || intent === 'manifest.preview_batch_cancel_selected'
    || intent === 'manifest.preview_create_from_payload'
    || intent === 'cdf.preview_download_batch_selected'
  ) {
    return {
      riskLevel: 'R2',
      allowChannels: ['whatsapp', 'native_chat', 'inapp'],
      requiresConfirmation: false,
      isAction: false
    };
  }

  if (intent === 'manifest.cancel_recent_excluding_first') {
    return {
      riskLevel: 'R4',
      allowChannels: ['native_chat', 'inapp'],
      requiresConfirmation: true,
      isAction: true
    };
  }

  if (
    intent === 'manifest.batch_submit_selected'
    || intent === 'manifest.batch_print_selected'
  ) {
    return {
      riskLevel: 'R3',
      allowChannels: ['native_chat', 'inapp'],
      requiresConfirmation: true,
      isAction: true
    };
  }

  if (intent === 'manifest.batch_cancel_selected') {
    return {
      riskLevel: 'R4',
      allowChannels: ['native_chat', 'inapp'],
      requiresConfirmation: true,
      isAction: true
    };
  }

  if (intent === 'manifest.create_draft') {
    return {
      riskLevel: 'R1',
      allowChannels: ['native_chat', 'inapp'],
      requiresConfirmation: false,
      isAction: true
    };
  }

  if (intent === 'manifest.create_from_payload') {
    return {
      riskLevel: 'R3',
      allowChannels: ['native_chat', 'inapp'],
      requiresConfirmation: true,
      isAction: true
    };
  }

  if (intent === 'manifest.receive_with_receipt') {
    return {
      riskLevel: 'R3',
      allowChannels: ['native_chat', 'inapp'],
      requiresConfirmation: true,
      isAction: true
    };
  }

  if (intent === 'cdf.resolve_by_manifest_reference') {
    return {
      riskLevel: 'R1',
      allowChannels: ['whatsapp', 'native_chat', 'inapp'],
      requiresConfirmation: false,
      isAction: false
    };
  }

  if (intent === 'manifest.replicate_with_patch') {
    return {
      riskLevel: 'R3',
      allowChannels: ['native_chat', 'inapp'],
      requiresConfirmation: true,
      isAction: true
    };
  }

  if (intent === 'manifest.replicate_segmented') {
    return {
      riskLevel: 'R3',
      allowChannels: ['native_chat', 'inapp'],
      requiresConfirmation: true,
      isAction: true
    };
  }

  if (intent === 'cdf.generate_from_manifest_selection' || intent === 'cdf.download_batch_selected') {
    return {
      riskLevel: 'R3',
      allowChannels: ['native_chat', 'inapp'],
      requiresConfirmation: true,
      isAction: true
    };
  }

  if (intent === 'cdf.list_by_manifest_selection') {
    return {
      riskLevel: 'R1',
      allowChannels: ['whatsapp', 'native_chat', 'inapp'],
      requiresConfirmation: false,
      isAction: false
    };
  }

  if (
    intent === 'manifest.list_recent_top'
    || intent === 'manifest.lookup_generator_by_number'
    || intent === 'memory.list_asked_manifests'
    || intent === 'manifest.detail_selected_set'
    || intent === 'manifest.group_recent_top'
  ) {
    return {
      riskLevel: 'R1',
      allowChannels: ['whatsapp', 'native_chat', 'inapp'],
      requiresConfirmation: false,
      isAction: false
    };
  }

  return null;
}

function toRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
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

function toNormalizedPermissionSet(value: unknown): Set<string> {
  if (!Array.isArray(value)) return new Set<string>();
  const normalized = value
    .map((entry) => toNullableString(entry)?.toLowerCase())
    .filter((entry): entry is string => Boolean(entry));

  return new Set(normalized);
}

function buildPermissionContext(input: ConversationPolicyInput): PermissionContext {
  const metadata = toRecord(input.context.metadata);
  return {
    permissionKeys: toNormalizedPermissionSet(metadata.permissionKeys)
  };
}

function hasConversationPermission(permissionContext: PermissionContext, requiredPermission: string | null): boolean {
  if (!requiredPermission) return true;
  if (permissionContext.permissionKeys.size === 0) return true;

  return permissionContext.permissionKeys.has(requiredPermission.toLowerCase());
}

const READ_ONLY_TOOLS = new Set<string>([
  'list_manifests',
  'get_manifest_details',
  'list_manifest_documents',
  'list_cdf_certificates',
  'list_jobs',
  'get_operations_overview',
  'list_dmr',
  'list_mtr_provisorio',
  'enqueue_cdf_download',
  'query_catalog',
  'search_partners'
]);

const DIRECT_TOOL_PERMISSION: Record<string, string> = {
  submit_manifest: 'manifest.submit',
  print_manifest: 'manifest.print',
  cancel_manifest: 'manifest.cancel',
  replicate_manifest: 'manifest.replicate'
};

const ORCHESTRATED_INTENT_PERMISSION: Record<string, string> = {
  'manifest.list_recent_top': 'manifest.read',
  'manifest.group_recent_top': 'manifest.read',
  'manifest.detail_selected_set': 'manifest.read',
  'manifest.lookup_generator_by_number': 'manifest.read',
  'memory.list_asked_manifests': 'manifest.read',
  'cdf.resolve_by_manifest_reference': 'manifest.read',
  'cdf.list_by_manifest_selection': 'manifest.read',
  'manifest.preview_cancel_recent_excluding_first': 'manifest.read',
  'manifest.preview_batch_submit_selected': 'manifest.read',
  'manifest.preview_batch_print_selected': 'manifest.read',
  'manifest.preview_batch_cancel_selected': 'manifest.read',
  'manifest.preview_create_from_payload': 'manifest.read',
  'cdf.preview_download_batch_selected': 'manifest.read',
  'manifest.cancel_recent_excluding_first': 'manifest.cancel',
  'manifest.batch_cancel_selected': 'manifest.cancel',
  'manifest.replicate_with_patch': 'manifest.replicate',
  'manifest.replicate_segmented': 'manifest.replicate',
  'manifest.batch_submit_selected': 'manifest.submit',
  'manifest.batch_print_selected': 'manifest.print',
  'manifest.create_draft': 'manifest.create',
  'manifest.create_from_payload': 'manifest.create',
  'manifest.receive_with_receipt': 'manifest.receive',
  'cdf.generate_from_manifest_selection': 'manifest.read',
  'cdf.download_batch_selected': 'manifest.read'
};

// Batch limits by intent and channel: enforce safe batching per communication channel
const BATCH_LIMITS_BY_INTENT: Record<string, Record<ConversationChannel, number>> = {
  'manifest.batch_cancel_selected': { whatsapp: 3, native_chat: 10, inapp: 20 },
  'manifest.batch_submit_selected': { whatsapp: 3, native_chat: 10, inapp: 20 },
  // Impressão/2ª via apenas gera documentos (PDF) para download — risco baixo frente a
  // submeter/cancelar — então admite lotes maiores (baixar os comprovantes de um período).
  'manifest.batch_print_selected': { whatsapp: 5, native_chat: 50, inapp: 50 },
  'manifest.replicate_segmented': { whatsapp: 2, native_chat: 5, inapp: 20 },
  'cdf.download_batch_selected': { whatsapp: 3, native_chat: 10, inapp: 20 },
  'manifest.cancel_recent_excluding_first': { whatsapp: 3, native_chat: 10, inapp: 20 }
};

function resolveRequiredPermission(input: ConversationPolicyInput): string | null {
  if (READ_ONLY_TOOLS.has(input.toolName)) {
    return 'manifest.read';
  }

  const directPermission = DIRECT_TOOL_PERMISSION[input.toolName];
  if (directPermission) {
    return directPermission;
  }

  if (input.toolName !== 'orchestrate_manifest_operation') {
    return null;
  }

  const intent = toNullableString(input.toolArgs?.intent) || '';
  return ORCHESTRATED_INTENT_PERMISSION[intent] || null;
}

function requiresOperationalAccount(input: ConversationPolicyInput): boolean {
  if (
    input.toolName === 'get_dashboard_overview'
    || input.toolName === 'get_audit_trail'
    || input.toolName === 'get_job_status'
    || input.toolName === 'get_operations_overview'
  ) {
    return false;
  }

  if (input.toolName !== 'orchestrate_manifest_operation') {
    return true;
  }

  const intent = toNullableString(input.toolArgs?.intent) || '';
  if (intent === 'memory.list_asked_manifests') {
    return false;
  }

  return true;
}

function resolveMaxBatchSize(intent: string, channel: ConversationChannel): number | null {
  const limits = BATCH_LIMITS_BY_INTENT[intent];
  if (!limits) return null;
  return limits[channel] || null;
}

function extractBatchItemCount(toolArgs: Record<string, unknown>): number {
  const manifestIds = Array.isArray(toolArgs.manifestIds) ? toolArgs.manifestIds : [];
  const documentIds = Array.isArray(toolArgs.documentIds) ? toolArgs.documentIds : [];
  const segments = Array.isArray(toolArgs.segments) ? toolArgs.segments : [];
  const top = toNullableString(toolArgs.top) ? parseInt(toNullableString(toolArgs.top) as string, 10) : 0;

  const totalCount = Math.max(manifestIds.length, documentIds.length, segments.length, top);
  return Number.isNaN(totalCount) || totalCount <= 0 ? 0 : totalCount;
}

function validateBatchSize(input: {
  intent: string;
  channel: ConversationChannel;
  batchItemCount: number;
}): { isValid: boolean; maxSize: number | null; message: string | null } {
  const maxSize = resolveMaxBatchSize(input.intent, input.channel);
  if (maxSize === null) {
    return { isValid: true, maxSize: null, message: null };
  }

  if (input.batchItemCount > maxSize) {
    return {
      isValid: false,
      maxSize,
      message: `Lote bloqueado por seguranca. Limite para canal '${input.channel}': ${maxSize} manifestos. Voce informou ${input.batchItemCount} itens. Reduza e confirme novamente.`
    };
  }

  return { isValid: true, maxSize, message: null };
}

function validateCrossAccountScope(check: CrossAccountCheckInput): {
  isValid: boolean;
  message: string | null;
} {
  const { currentAccountId, snapshotAccountId, intent } = check;

  if (!snapshotAccountId) {
    return { isValid: true, message: null };
  }

  if (!currentAccountId) {
    return {
      isValid: false,
      message: 'Snapshot nao pode ser confirmado sem conta ativa. Selecione uma conta CETESB antes de confirmar.'
    };
  }

  if (snapshotAccountId !== currentAccountId) {
    return {
      isValid: false,
      message: `Snapshot ${intent} pertence a outra conta operacional. Gere novo preview no contexto atual e confirme.`
    };
  }

  return { isValid: true, message: null };
}

function validateSessionScope(current: ScopeValidationContext, snapshot: ScopeValidationContext): {
  isValid: boolean;
  message: string | null;
} {
  if (!snapshot.sessionContextId) {
    return { isValid: true, message: null };
  }

  if (!current.sessionContextId) {
    return {
      isValid: false,
      message: 'Confirmacao exige sessao CETESB ativa. Reautentique e tente novamente.'
    };
  }

  if (snapshot.sessionContextId !== current.sessionContextId) {
    return {
      isValid: false,
      message: 'Snapshot foi gerado em sessao diferente. Gere novo preview na sessao atual.'
    };
  }

  return { isValid: true, message: null };
}

function buildUnsupportedToolDecision(): ConversationPolicyDecision {
  return {
    allowed: false,
    reasonCode: 'TOOL_NOT_SUPPORTED',
    reason: 'A ferramenta solicitada nao e suportada pela API conversacional atual.',
    requiresConfirmation: false,
    riskLevel: null,
    isAction: false,
    maxBatchSize: null,
    enforcedScope: null
  };
}

function buildUnsupportedIntentDecision(): ConversationPolicyDecision {
  return {
    allowed: false,
    reasonCode: 'INTENT_NOT_SUPPORTED',
    reason: 'A intencao operacional solicitada nao e suportada pela API conversacional atual.',
    requiresConfirmation: false,
    riskLevel: null,
    isAction: false,
    maxBatchSize: null,
    enforcedScope: null
  };
}

function buildPolicyBlockedDecision(input: {
  reasonCode: string;
  reason: string;
  policy: ToolPolicy;
}): ConversationPolicyDecision {
  return {
    allowed: false,
    reasonCode: input.reasonCode,
    reason: input.reason,
    requiresConfirmation: input.policy.requiresConfirmation,
    riskLevel: input.policy.riskLevel,
    isAction: input.policy.isAction,
    maxBatchSize: null,
    enforcedScope: null
  };
}

function buildAllowedPolicyDecision(policy: ToolPolicy): ConversationPolicyDecision {
  return {
    allowed: true,
    reasonCode: null,
    reason: null,
    requiresConfirmation: policy.requiresConfirmation,
    riskLevel: policy.riskLevel,
    isAction: policy.isAction,
    maxBatchSize: null,
    enforcedScope: null
  };
}

function buildBatchLimitExceededDecision(
  policy: ToolPolicy,
  maxSize: number,
  actualSize: number
): ConversationPolicyDecision {
  return {
    allowed: false,
    reasonCode: 'BATCH_LIMIT_EXCEEDED',
    reason: `Lote bloqueado por seguranca. Limite maximo: ${maxSize} itens. Voce informou ${actualSize}. Reduza seleção e confirme novamente.`,
    requiresConfirmation: policy.requiresConfirmation,
    riskLevel: policy.riskLevel,
    isAction: policy.isAction,
    maxBatchSize: maxSize,
    enforcedScope: null
  };
}

function buildCrossAccountViolationDecision(policy: ToolPolicy, message: string): ConversationPolicyDecision {
  return {
    allowed: false,
    reasonCode: 'CROSS_ACCOUNT_VIOLATION',
    reason: message,
    requiresConfirmation: policy.requiresConfirmation,
    riskLevel: policy.riskLevel,
    isAction: policy.isAction,
    maxBatchSize: null,
    enforcedScope: 'account'
  };
}

function buildSessionScopeViolationDecision(policy: ToolPolicy, message: string): ConversationPolicyDecision {
  return {
    allowed: false,
    reasonCode: 'SESSION_SCOPE_MISMATCH',
    reason: message,
    requiresConfirmation: policy.requiresConfirmation,
    riskLevel: policy.riskLevel,
    isAction: policy.isAction,
    maxBatchSize: null,
    enforcedScope: 'session'
  };
}

export function isConversationToolSupported(toolName: string): toolName is ConversationToolName {
  return isRegisteredConversationTool(toolName);
}

export function getConversationToolPolicies(): Array<{
  toolName: ConversationToolName;
  riskLevel: ConversationRiskLevel;
  allowChannels: ConversationChannel[];
  requiresConfirmation: boolean;
  isAction: boolean;
}> {
  return getConversationToolInventory().map((item) => ({
    toolName: item.toolName,
    riskLevel: item.policy.riskLevel,
    allowChannels: item.policy.allowChannels,
    requiresConfirmation: item.policy.requiresConfirmation,
    isAction: item.policy.isAction
  }));
}

export function evaluateConversationPolicy(input: ConversationPolicyInput): ConversationPolicyDecision {
  if (!isRegisteredConversationTool(input.toolName)) {
    return buildUnsupportedToolDecision();
  }

  const permissionContext = buildPermissionContext(input);
  let effectivePolicy = toToolPolicy(input.toolName);

  // Tool desabilitado via AI Control Center (ai_tools.enabled=false). Sem override, sempre habilitado.
  if (!isRuntimeToolEnabled(input.toolName)) {
    return buildPolicyBlockedDecision({
      reasonCode: 'TOOL_DISABLED',
      reason: `A ferramenta ${input.toolName} esta desabilitada pelo AI Control Center.`,
      policy: effectivePolicy
    });
  }

  let intent = '';

  if (input.toolName === 'orchestrate_manifest_operation') {
    intent = typeof input.toolArgs?.intent === 'string' ? input.toolArgs.intent : '';
    const intentPolicy = resolveOrchestratedIntentPolicy(intent);

    if (!intentPolicy) {
      return buildUnsupportedIntentDecision();
    }

    effectivePolicy = intentPolicy;
  }

  if (!effectivePolicy.allowChannels.includes(input.channel)) {
    return buildPolicyBlockedDecision({
      reasonCode: 'CHANNEL_BLOCKED',
      reason: `A ferramenta ${input.toolName} nao e permitida para o canal ${input.channel}.`,
      policy: effectivePolicy
    });
  }

  if (requiresOperationalAccount(input) && !input.context.integrationAccountId) {
    return buildPolicyBlockedDecision({
      reasonCode: 'INTEGRATION_ACCOUNT_REQUIRED',
      reason: 'Selecione uma conta CETESB ativa antes de executar esta operacao no chat.',
      policy: effectivePolicy
    });
  }

  const requiredPermission = resolveRequiredPermission(input);
  if (!hasConversationPermission(permissionContext, requiredPermission)) {
    return buildPolicyBlockedDecision({
      reasonCode: 'PERMISSION_DENIED',
      reason: `Seu perfil nao possui a permissao ${requiredPermission} para esta operacao.`,
      policy: effectivePolicy
    });
  }

  // Modo somente-leitura global do AI Control Center bloqueia qualquer ação operacional.
  if (effectivePolicy.isAction && isAiControlReadOnly()) {
    return buildPolicyBlockedDecision({
      reasonCode: 'AI_CONTROL_READONLY',
      reason: 'O AI Control Center esta em modo somente-leitura (AI_CONTROL_READONLY). Acoes operacionais estao bloqueadas.',
      policy: effectivePolicy
    });
  }

  if (effectivePolicy.isAction && input.allowActions === false) {
    return buildPolicyBlockedDecision({
      reasonCode: 'ACTIONS_DISABLED',
      reason: 'A execucao de acoes operacionais foi desativada para esta requisicao.',
      policy: effectivePolicy
    });
  }

  if (effectivePolicy.requiresConfirmation && input.confirmed !== true) {
    return buildPolicyBlockedDecision({
      reasonCode: 'CONFIRMATION_REQUIRED',
      reason: `A ferramenta ${input.toolName} exige confirmacao explicita antes da execucao.`,
      policy: effectivePolicy
    });
  }

  // Batch limit validation (R3+R4 actions with batch semantics)
  if (effectivePolicy.isAction && intent) {
    const batchItemCount = extractBatchItemCount(toRecord(input.toolArgs));
    const batchValidation = validateBatchSize({
      intent,
      channel: input.channel,
      batchItemCount
    });

    if (!batchValidation.isValid) {
      return buildBatchLimitExceededDecision(
        effectivePolicy,
        batchValidation.maxSize || 10,
        batchItemCount
      );
    }
  }

  // Cross-account scope validation for confirmação de snapshot
  if (effectivePolicy.requiresConfirmation && input.confirmed === true && intent) {
    const snapshotAccountId = toNullableString(input.toolArgs?.snapshotAccountId);
    const crossAccountCheck = validateCrossAccountScope({
      currentAccountId: input.context.integrationAccountId,
      snapshotAccountId,
      intent
    });

    if (!crossAccountCheck.isValid) {
      return buildCrossAccountViolationDecision(effectivePolicy, crossAccountCheck.message || '');
    }
  }

  // Session scope validation
  if (effectivePolicy.requiresConfirmation && input.confirmed === true && intent) {
    const snapshotSessionId = toNullableString(input.toolArgs?.snapshotSessionContextId);
    const currentScope: ScopeValidationContext = {
      integrationAccountId: input.context.integrationAccountId,
      sessionContextId: input.context.sessionContextId,
      correlationId: toNullableString(input.context.correlationId)
    };
    const snapshotScope: ScopeValidationContext = {
      integrationAccountId: toNullableString(input.toolArgs?.snapshotAccountId),
      sessionContextId: snapshotSessionId,
      correlationId: toNullableString(input.toolArgs?.snapshotCorrelationId)
    };

    const sessionValidation = validateSessionScope(currentScope, snapshotScope);
    if (!sessionValidation.isValid) {
      return buildSessionScopeViolationDecision(effectivePolicy, sessionValidation.message || '');
    }
  }

  return buildAllowedPolicyDecision(effectivePolicy);
}
