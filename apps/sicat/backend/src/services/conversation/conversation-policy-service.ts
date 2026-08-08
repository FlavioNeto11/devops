import type { ConversationChannel, ConversationContext } from './conversation-context-service.js';
import {
  getConversationToolInventory,
  getConversationToolInventoryItem,
  isRegisteredConversationTool
} from './tools/tool-registry.js';
import type { ConversationToolName, ConversationToolPolicy, ConversationToolRiskLevel } from './tools/tool-types.js';
import {
  resolveEffectiveToolPolicy,
  isRuntimeToolEnabled,
  resolveRuntimeIntentPolicyOverride
} from '../ai-control/ai-runtime-registry-service.js';
import {
  getWhatsAppEligibleAction,
  isExternalConversationChannel,
  resolveEffectiveAllowChannels,
  resolveWhatsAppActionKey,
  resolveWhatsAppActionsEnabled,
  WHATSAPP_DIRECT_TOOL_MAX_ITEMS
} from './channel/whatsapp/whatsapp-action-eligibility.js';
import { isAiControlReadOnly } from '../ai-control/ai-control-config.js';
import { config } from '../../lib/config.js';
import { DENY_WHEN_CATALOG_DEGRADED } from '../../lib/conversation-permission-catalog.js';
import { isConversationPermissionSatisfiable } from './conversation-permission-catalog-state.js';
import {
  recordConversationPermissionDecision,
  type ConversationPermissionOutcome
} from '../../lib/conversation-permission-metrics.js';

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

/**
 * Lacuna de permissão do turno. Preenchida nos TRÊS desfechos não-triviais (negado, `would_deny` do
 * modo `observe`, e catálogo degradado) — nunca quando a permissão foi de fato satisfeita.
 *
 * Existe além do contador Prometheus de propósito: contador não é assertável em teste unitário de
 * forma honesta, e um marcador que só o chamador enxergasse seria buraco silencioso. O contador vive
 * DENTRO do policy-service; este campo é o que os testes afirmam e o que vai para a trilha do turno
 * (que já carrega o `userId`).
 */
export type ConversationPermissionShortfall = {
  /** Chave exigida, normalizada em minúsculas. */
  required: string;
  /** `false` = a chave não existe (ou está inativa) em `access_permissions`: ninguém pode tê-la. */
  catalogSatisfiable: boolean;
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
  permissionShortfall?: ConversationPermissionShortfall | null;
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

const ALL_CHANNELS: ConversationChannel[] = ['whatsapp', 'native_chat', 'inapp'];
const IN_APP_CHANNELS: ConversationChannel[] = ['native_chat', 'inapp'];

/** Consulta/preview: sem confirmação, sem ação, disponível em todos os canais. */
function readOnlyIntentPolicy(riskLevel: ConversationRiskLevel): ToolPolicy {
  return { riskLevel, allowChannels: ALL_CHANNELS, requiresConfirmation: false, isAction: false };
}

/**
 * Ação operacional: confirmação obrigatória e, no DEFAULT DE CÓDIGO, nunca por WhatsApp — nem depois
 * da fase 5. O canal externo só entra pela habilitação em runtime (`ai_tools`), e apenas onde
 * `WHATSAPP_ELIGIBLE_ACTIONS` permite. É o que faz "o canal só age onde o operador ligou
 * conscientemente" ser propriedade do código, e não da configuração.
 */
function confirmedActionIntentPolicy(riskLevel: ConversationRiskLevel): ToolPolicy {
  return { riskLevel, allowChannels: IN_APP_CHANNELS, requiresConfirmation: true, isAction: true };
}

/**
 * Política por intent orquestrado, em TABELA — antes era uma cadeia de `if`.
 *
 * A tabela não é estética: ela torna o conjunto de intents SUPORTADOS enumerável, e é isso que
 * permite ao teste comparar, nos dois sentidos, contra `ORCHESTRATED_INTENT_PERMISSION`. Com a cadeia
 * de `if`, acrescentar um intent sem mapear permissão passava despercebido — exatamente a quebra
 * silenciosa que esta fase existe para fechar.
 */
const ORCHESTRATED_INTENT_POLICY: Record<string, ToolPolicy> = {
  'manifest.preview_cancel_recent_excluding_first': readOnlyIntentPolicy('R2'),
  'manifest.preview_batch_submit_selected': readOnlyIntentPolicy('R2'),
  'manifest.preview_batch_print_selected': readOnlyIntentPolicy('R2'),
  'manifest.preview_batch_cancel_selected': readOnlyIntentPolicy('R2'),
  'manifest.preview_create_from_payload': readOnlyIntentPolicy('R2'),
  'cdf.preview_download_batch_selected': readOnlyIntentPolicy('R2'),

  'manifest.cancel_recent_excluding_first': confirmedActionIntentPolicy('R4'),
  'manifest.batch_cancel_selected': confirmedActionIntentPolicy('R4'),
  'manifest.batch_submit_selected': confirmedActionIntentPolicy('R3'),
  'manifest.batch_print_selected': confirmedActionIntentPolicy('R3'),
  'manifest.create_from_payload': confirmedActionIntentPolicy('R3'),
  'manifest.receive_with_receipt': confirmedActionIntentPolicy('R3'),
  'manifest.replicate_with_patch': confirmedActionIntentPolicy('R3'),
  'manifest.replicate_segmented': confirmedActionIntentPolicy('R3'),
  'cdf.generate_from_manifest_selection': confirmedActionIntentPolicy('R3'),
  'cdf.download_batch_selected': confirmedActionIntentPolicy('R3'),

  // Rascunho é ação, mas não sai da fronteira do SICAT — por isso R1 e sem confirmação.
  'manifest.create_draft': {
    riskLevel: 'R1',
    allowChannels: IN_APP_CHANNELS,
    requiresConfirmation: false,
    isAction: true
  },

  'cdf.resolve_by_manifest_reference': readOnlyIntentPolicy('R1'),
  'cdf.list_by_manifest_selection': readOnlyIntentPolicy('R1'),
  'manifest.list_recent_top': readOnlyIntentPolicy('R1'),
  'manifest.group_recent_top': readOnlyIntentPolicy('R1'),
  'manifest.detail_selected_set': readOnlyIntentPolicy('R1'),
  'manifest.lookup_generator_by_number': readOnlyIntentPolicy('R1'),
  'memory.list_asked_manifests': readOnlyIntentPolicy('R1')
};

/**
 * INVARIANTE ESTRUTURAL, VERIFICADA NO IMPORT: nenhum DEFAULT DE CÓDIGO de AÇÃO lista `whatsapp`.
 *
 * É a trava de que a elegibilidade é de CÓDIGO e a habilitação é de RUNTIME. Ela cobre as duas
 * tabelas de default que existem — tools diretas (`tool-registry`) e intents orquestrados (a tabela
 * acima) — porque `resolveEffectiveAllowChannels` só consegue APLICAR o teto de
 * `WHATSAPP_ELIGIBLE_ACTIONS` sobre o que o overlay ADICIONA:
 *
 *     base    = overlay ? (código ∩ overlay) : código
 *     somados = overlay ∩ {whatsapp se elegível}
 *
 * Um default de código que JÁ trouxesse `whatsapp` entraria por `base` sem passar pela elegibilidade
 * — e, no caso de uma chave de `CHANNEL_HARD_DENY`, só a recusa por último o pegaria. Ou seja: a
 * segunda porta que aquele módulo nomeia e que nada até aqui fechava. Uma linha de `allowChannels`
 * editada por engano numa das duas tabelas é elevação de privilégio silenciosa em canal externo;
 * falhar no import é o desfecho certo, e é o mesmo tratamento que a invariante de disjunção das duas
 * listas já recebe em `whatsapp-action-eligibility.ts`.
 */
function assertNoActionDefaultAllowsExternalChannel(): void {
  const offenders: string[] = [];

  for (const item of getConversationToolInventory()) {
    if (item.policy.isAction && item.policy.allowChannels.includes('whatsapp')) {
      offenders.push(`tool ${item.toolName}`);
    }
  }
  for (const [intent, policy] of Object.entries(ORCHESTRATED_INTENT_POLICY)) {
    if (policy.isAction && policy.allowChannels.includes('whatsapp')) {
      offenders.push(`intent ${intent}`);
    }
  }

  if (offenders.length > 0) {
    throw new Error(
      `[conversation-policy] default de CÓDIGO de ação com canal externo: ${offenders.join(', ')}. `
      + 'Ação só alcança o WhatsApp por habilitação de runtime (AI Control Center) e dentro de '
      + 'WHATSAPP_ELIGIBLE_ACTIONS — nunca pelo default de código.'
    );
  }
}

assertNoActionDefaultAllowsExternalChannel();

/**
 * Consulta em tabela SEM cair no protótipo.
 *
 * `map['constructor']` devolve uma função herdada de `Object.prototype` — verdadeira o bastante para
 * passar por um `|| null`. Com a política por INTENT em tabela, um intent chamado `constructor` ou
 * `toString` viraria "suportado" e explodiria adiante em `effectivePolicy.allowChannels.includes`
 * (500 no lugar de `INTENT_NOT_SUPPORTED`). A cadeia de `if` que esta tabela substituiu não tinha
 * essa aresta — este helper a devolve.
 */
function lookupOwn<T>(map: Record<string, T>, key: string): T | null {
  if (!key) return null;
  return Object.prototype.hasOwnProperty.call(map, key) ? (map[key] ?? null) : null;
}

function resolveOrchestratedIntentPolicy(intent: string): ToolPolicy | null {
  return lookupOwn(ORCHESTRATED_INTENT_POLICY, intent);
}

/**
 * Policy do intent + overlay de runtime, com a MESMA disciplina do overlay de tool: canais resolvidos
 * por `resolveEffectiveAllowChannels` (elegibilidade de código, recusa permanente por último) e
 * `requiresConfirmation` que só endurece. `riskLevel` e `isAction` NUNCA vêm do overlay.
 *
 * Roda mesmo sem override — é ela que aplica `CHANNEL_HARD_DENY` aos intents.
 */
function mergeIntentPolicy(intentPolicy: ToolPolicy, intent: string): ToolPolicy {
  const overlay = resolveRuntimeIntentPolicyOverride('orchestrate_manifest_operation', intent);
  return {
    riskLevel: intentPolicy.riskLevel,
    isAction: intentPolicy.isAction,
    requiresConfirmation: overlay?.requiresConfirmation === true ? true : intentPolicy.requiresConfirmation,
    allowChannels: resolveEffectiveAllowChannels({
      key: intent,
      codeChannels: intentPolicy.allowChannels,
      overlayChannels: overlay?.allowChannels ?? null
    })
  };
}

/**
 * Itens de uma tool DIRETA. Separada de `extractBatchItemCount` porque só ela lê `count`:
 * `replicate_manifest` aceita até 100 réplicas num único argumento escalar
 * (`normalizeBatchCount`, `manifest-service.ts`), e nenhum teto de lote alcança tool sem intent.
 */
function extractDirectToolItemCount(toolArgs: Record<string, unknown>): number {
  const arrayCounts = [toolArgs.manifestIds, toolArgs.documentIds, toolArgs.segments, toolArgs.certificateIds]
    .map((value) => (Array.isArray(value) ? value.length : 0));
  const scalarCount = Number(toolArgs.count);
  const declared = Number.isFinite(scalarCount) && scalarCount > 0 ? Math.floor(scalarCount) : 0;
  return Math.max(0, ...arrayCounts, declared);
}

/** Intents que a policy reconhece. Fonte do teste de cobertura 1:1 com o catálogo. */
export function listSupportedOrchestratedIntents(): string[] {
  return Object.keys(ORCHESTRATED_INTENT_POLICY).sort();
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
  // As permissões vêm do principal (resolvidas no banco a partir do usuário autenticado). Antes eram
  // lidas de `context.metadata.permissionKeys` — ou seja, o próprio cliente dizia o que podia fazer.
  return {
    permissionKeys: toNormalizedPermissionSet(input.context.permissionKeys)
  };
}

type PermissionVerdict = {
  allowed: boolean;
  shortfall: ConversationPermissionShortfall | null;
};

/**
 * GATE DE PERMISSÃO — três estados, integridade avaliada POR CHAVE.
 *
 * O fail-open por usuário morreu aqui: `permissionKeys.size === 0` costumava devolver `true`, ou
 * seja, quem não tinha papel nenhum virava superusuário do chat. Nenhuma variante dessa linha
 * sobrevive — inclusive a variante "se o catálogo estiver vazio, abre tudo".
 *
 * O lugar dela é o passo 4, que é POR CHAVE e ASSIMÉTRICO entre leitura e ação:
 *
 *   1. sem permissão exigida             -> PERMITE
 *   2. usuário TEM a chave               -> PERMITE
 *   3. modo `observe`                    -> PERMITE, registrando `would_deny`
 *   4. chave AUSENTE/INATIVA no catálogo -> ninguém no mundo pode tê-la:
 *        ação, ou chave em `DENY_WHEN_CATALOG_DEGRADED` -> NEGA  (`catalog_degraded_denied`)
 *        demais leituras                               -> PERMITE (`catalog_degraded_allowed`)
 *   5. caso contrário                    -> NEGA (`PERMISSION_DENIED`)
 *
 * Por que POR CHAVE e não globalmente: com integridade global, o operador que desativa
 * `manifest.cancel` DE PROPÓSITO jogaria o gate INTEIRO em degradado e liberaria leitura para todo
 * mundo. Por chave, ele desarma exatamente aquela ação — para todos, inclusive os admins. É o efeito
 * que ele queria.
 *
 * ⚠️ `codeIsAction`, e não o `isAction` EFETIVO: a classificação leitura×ação do ramo degradado é
 * decisão de SEGURANÇA e não pode vir do overlay mutável do AI Control Center (`ai_tools`).
 * `normalizePolicyOverride` aceita `isAction` do `defaultPolicyJson` sem restrição — com o catálogo
 * degradado e um override `isAction: false` em `submit_manifest`, o passo 4 classificaria a submissão
 * à CETESB como LEITURA e devolveria `allowed: true` para quem tem ZERO permissões (e de quebra
 * `requiresConfirmation` cairia junto). O overlay pode afrouxar apresentação e confirmação; nunca a
 * fronteira que o gate usa para decidir.
 *
 * Comparação é igualdade EXATA de string: não há prefixo nem curinga (`manifest.*` não concede nada).
 */
function evaluateConversationPermission(input: {
  permissionContext: PermissionContext;
  requiredPermission: string | null;
  /** Classificação do DEFAULT DE CÓDIGO — imune ao override de `ai_tools`. */
  codeIsAction: boolean;
  channel: ConversationChannel;
}): PermissionVerdict {
  if (!input.requiredPermission) {
    return { allowed: true, shortfall: null };
  }

  const required = input.requiredPermission.toLowerCase();
  if (input.permissionContext.permissionKeys.has(required)) {
    return { allowed: true, shortfall: null };
  }

  const mode = config.conversationPermissionEnforcement;
  const catalogSatisfiable = isConversationPermissionSatisfiable(required);
  const shortfall: ConversationPermissionShortfall = { required, catalogSatisfiable };

  const record = (outcome: ConversationPermissionOutcome) => {
    recordConversationPermissionDecision({
      mode,
      outcome,
      permission: required,
      channel: input.channel,
      // Sem este label, `observe` (que retorna ANTES da checagem de integridade) produziria a mesma
      // amostra para "usuário sem papel" e para "catálogo quebrado" durante a janela inteira.
      catalogSatisfiable
    });
  };

  if (mode === 'observe') {
    record('would_deny');
    return { allowed: true, shortfall };
  }

  if (!catalogSatisfiable) {
    if (input.codeIsAction || DENY_WHEN_CATALOG_DEGRADED.has(required)) {
      record('catalog_degraded_denied');
      return { allowed: false, shortfall };
    }
    record('catalog_degraded_allowed');
    return { allowed: true, shortfall };
  }

  record('denied');
  return { allowed: false, shortfall };
}

/**
 * `isAction` do DEFAULT DE CÓDIGO, sem passar pelo overlay de `ai_tools`. Desconhecido → `true`
 * (fail-closed: uma tool que o inventário não conhece é tratada como ação no ramo degradado).
 */
function resolveCodeIsAction(toolName: string, intent: string): boolean {
  if (toolName === 'orchestrate_manifest_operation') {
    return resolveOrchestratedIntentPolicy(intent)?.isAction ?? true;
  }
  return getConversationToolInventoryItem(toolName as ConversationToolName)?.policy.isAction ?? true;
}

const READ_ONLY_TOOL_PERMISSION = 'manifest.read';

/**
 * Tools cobertas por `manifest.read`.
 *
 * As três últimas eram ÓRFÃS (`requiredPermission === null`) e passavam com o gate fechado, para
 * qualquer usuário. `diagnose_operation` em especial era amplificador de bypass: a policy roda UMA
 * vez, na tool externa, e `handleOperationDiagnose` chama o dispatcher direto para as tools internas.
 * Custo de continuidade zero — o papel-piso já dá `manifest.read` a todo usuário ativo.
 *
 * ⚠️ `enqueue_cdf_download` é R3/`isAction` e continua aqui: um `sicat.reader` gera e baixa CDF
 * contra a CETESB. Risco ACEITO E NOMEADO — separá-lo numa chave `cdf.download` é a fase 4.6, pelo
 * mesmo protocolo `observe` → medir → conceder → flip. Dois estreitamentos no mesmo flip tornam
 * impossível saber qual quebrou quem.
 */
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
  'search_partners',
  'get_job_status',
  'get_dashboard_overview',
  'diagnose_operation'
]);

const DIRECT_TOOL_PERMISSION: Record<string, string> = {
  submit_manifest: 'manifest.submit',
  print_manifest: 'manifest.print',
  cancel_manifest: 'manifest.cancel',
  replicate_manifest: 'manifest.replicate',
  // Chave PRÓPRIA, não `manifest.read`: `get_audit_trail` é a única tool que expõe a trilha de
  // auditoria E `requiresOperationalAccount` devolve `false` para ela — ou seja, um estranho
  // auto-cadastrado pelo endpoint público de registro lia a trilha sem conta operacional nenhuma.
  get_audit_trail: 'audit.read'
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

/**
 * Permissão exigida por (tool, intent). É a fonte ÚNICA do gate — e a mesma função que o teste de
 * cobertura percorre, para provar que nenhuma tool registrada resolve permissão nula.
 */
export function getRequiredPermissionForTool(toolName: string, intent?: string | null): string | null {
  if (READ_ONLY_TOOLS.has(toolName)) {
    return READ_ONLY_TOOL_PERMISSION;
  }

  const directPermission = lookupOwn(DIRECT_TOOL_PERMISSION, toolName);
  if (directPermission) {
    return directPermission;
  }

  if (toolName !== 'orchestrate_manifest_operation') {
    return null;
  }

  return lookupOwn(ORCHESTRATED_INTENT_PERMISSION, String(intent || ''));
}

/**
 * Todas as chaves que este serviço consulta, derivadas dos SEUS PRÓPRIOS mapas.
 *
 * O teste compara este conjunto com `CONVERSATION_PERMISSION_CATALOG` (o que o seed escreve) nos dois
 * sentidos. Um lado é função de produção, então não é um double concordando consigo mesmo: mapear uma
 * tool nova para uma chave que ninguém semeia QUEBRA o teste.
 */
export function listRequiredPermissionKeys(): string[] {
  const keys = new Set<string>();
  if (READ_ONLY_TOOLS.size > 0) keys.add(READ_ONLY_TOOL_PERMISSION);
  for (const key of Object.values(DIRECT_TOOL_PERMISSION)) keys.add(key);
  for (const key of Object.values(ORCHESTRATED_INTENT_PERMISSION)) keys.add(key);
  return [...keys].sort();
}

/** Intents com permissão mapeada. Par de `listSupportedOrchestratedIntents` no teste bidirecional. */
export function listOrchestratedIntentsWithPermission(): string[] {
  return Object.keys(ORCHESTRATED_INTENT_PERMISSION).sort();
}

function resolveRequiredPermission(input: ConversationPolicyInput): string | null {
  return getRequiredPermissionForTool(input.toolName, toNullableString(input.toolArgs?.intent));
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
  permissionShortfall?: ConversationPermissionShortfall | null;
}): ConversationPolicyDecision {
  return {
    allowed: false,
    reasonCode: input.reasonCode,
    reason: input.reason,
    requiresConfirmation: input.policy.requiresConfirmation,
    riskLevel: input.policy.riskLevel,
    isAction: input.policy.isAction,
    maxBatchSize: null,
    enforcedScope: null,
    permissionShortfall: input.permissionShortfall ?? null
  };
}

function buildAllowedPolicyDecision(
  policy: ToolPolicy,
  permissionShortfall: ConversationPermissionShortfall | null = null
): ConversationPolicyDecision {
  return {
    allowed: true,
    reasonCode: null,
    reason: null,
    requiresConfirmation: policy.requiresConfirmation,
    riskLevel: policy.riskLevel,
    isAction: policy.isAction,
    maxBatchSize: null,
    enforcedScope: null,
    permissionShortfall
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

    // ── O OVERLAY DEIXA DE SER DESCARTADO ──────────────────────────────────────────────────────
    // Antes era `effectivePolicy = intentPolicy`, e a policy resolvida com override ia para o lixo:
    // os 11 intents de ação — inclusive TODOS os lotes, que são o caminho natural do LLM — não
    // tinham alavanca de runtime nenhuma. Ligar `whatsapp` na tabela para `orchestrate_manifest_operation`
    // não alcançava intent algum. Toggle que não alcança o que promete é pior que toggle nenhum.
    effectivePolicy = mergeIntentPolicy(intentPolicy, intent);
  }

  const eligibilityKey = resolveWhatsAppActionKey(input.toolName, intent);

  // ── AVALIAR CEDO, APLICAR TARDE ───────────────────────────────────────────────────────────────
  // A permissão é avaliada AQUI, antes de `CHANNEL_BLOCKED` e `INTEGRATION_ACCOUNT_REQUIRED`, mas o
  // veredito só é APLICADO depois deles: a precedência dos reasonCodes não muda (as duas guardas
  // continuam vencendo), o que muda é que a métrica passa a existir.
  //
  // Sem isto, o critério OBJETIVO do flip (`would_deny` estável em zero) daria zero por construção nos
  // dois casos que mais importam: (1) usuário sem conta CETESB ativa nunca gerava sinal, e receberia
  // `PERMISSION_DENIED` no primeiro dia em que selecionasse conta — depois do flip; (2) no canal
  // `whatsapp` TODA ação para em `CHANNEL_BLOCKED` (nenhuma tool de ação lista `whatsapp` em
  // `allowChannels` até a fase 5), então a janela fecharia com zero `would_deny{channel="whatsapp"}`
  // e esse zero seria lido como "seguro para a fase 5" — sendo que a fase 5 é justamente quem
  // desbloqueia o canal e exercita essas chaves pela primeira vez.
  const requiredPermission = resolveRequiredPermission(input);
  const permissionVerdict = evaluateConversationPermission({
    permissionContext,
    requiredPermission,
    codeIsAction: resolveCodeIsAction(input.toolName, intent),
    channel: input.channel
  });

  if (!effectivePolicy.allowChannels.includes(input.channel)) {
    // `CHANNEL_NOT_ENABLED` × `CHANNEL_BLOCKED`: dois estados que HOJE colapsam no mesmo
    // `READ_ONLY_TEXT` do composer — o operador liga o botão, a pessoa recebe a frase de sempre e
    // ninguém percebe que não pegou. O código novo só aparece quando a ação É elegível no canal E o
    // disjuntor de ambiente está ligado; nas demais combinações o desfecho é byte-a-byte o de hoje.
    const eligibleButNotEnabled = isExternalConversationChannel(input.channel)
      && Boolean(getWhatsAppEligibleAction(eligibilityKey))
      && resolveWhatsAppActionsEnabled();

    return buildPolicyBlockedDecision({
      reasonCode: eligibleButNotEnabled ? 'CHANNEL_NOT_ENABLED' : 'CHANNEL_BLOCKED',
      reason: eligibleButNotEnabled
        ? `A ferramenta ${input.toolName} ainda nao foi habilitada para o canal ${input.channel} no AI Control Center.`
        : `A ferramenta ${input.toolName} nao e permitida para o canal ${input.channel}.`,
      policy: effectivePolicy,
      permissionShortfall: permissionVerdict.shortfall
    });
  }

  if (requiresOperationalAccount(input) && !input.context.integrationAccountId) {
    return buildPolicyBlockedDecision({
      reasonCode: 'INTEGRATION_ACCOUNT_REQUIRED',
      reason: 'Selecione uma conta CETESB ativa antes de executar esta operacao no chat.',
      policy: effectivePolicy,
      permissionShortfall: permissionVerdict.shortfall
    });
  }

  if (!permissionVerdict.allowed) {
    // Reutiliza `PERMISSION_DENIED` de propósito, inclusive na negação por catálogo degradado: é o
    // reasonCode que os dois composers (chat e WhatsApp) já traduzem em texto. A CAUSA vai no
    // `permissionShortfall` e na métrica — não invento código novo que dois composers teriam que
    // aprender.
    return buildPolicyBlockedDecision({
      reasonCode: 'PERMISSION_DENIED',
      reason: `Seu perfil nao possui a permissao ${requiredPermission} para esta operacao.`,
      policy: effectivePolicy,
      permissionShortfall: permissionVerdict.shortfall
    });
  }

  /** Carimba a lacuna de permissão (modo `observe` / catálogo degradado) em qualquer desfecho adiante. */
  const finalize = (decision: ConversationPolicyDecision): ConversationPolicyDecision => ({
    ...decision,
    permissionShortfall: permissionVerdict.shortfall
  });

  // Modo somente-leitura global do AI Control Center bloqueia qualquer ação operacional.
  if (effectivePolicy.isAction && isAiControlReadOnly()) {
    return finalize(buildPolicyBlockedDecision({
      reasonCode: 'AI_CONTROL_READONLY',
      reason: 'O AI Control Center esta em modo somente-leitura (AI_CONTROL_READONLY). Acoes operacionais estao bloqueadas.',
      policy: effectivePolicy
    }));
  }

  if (effectivePolicy.isAction && input.allowActions === false) {
    return finalize(buildPolicyBlockedDecision({
      reasonCode: 'ACTIONS_DISABLED',
      reason: 'A execucao de acoes operacionais foi desativada para esta requisicao.',
      policy: effectivePolicy
    }));
  }

  if (effectivePolicy.requiresConfirmation && input.confirmed !== true) {
    return finalize(buildPolicyBlockedDecision({
      reasonCode: 'CONFIRMATION_REQUIRED',
      reason: `A ferramenta ${input.toolName} exige confirmacao explicita antes da execucao.`,
      policy: effectivePolicy
    }));
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
      return finalize(buildBatchLimitExceededDecision(
        effectivePolicy,
        batchValidation.maxSize || 10,
        batchItemCount
      ));
    }
  }

  // TOOL DIRETA EM CANAL EXTERNO AGE SOBRE EXATAMENTE 1 ITEM.
  //
  // O bloco acima é `isAction && intent`, e `intent` é '' fora do orquestrador: as 5 tools diretas
  // NUNCA tiveram teto de lote. Sem esta regra, `replicate_manifest` com `count: 100` seriam 100
  // rascunhos por mensagem de WhatsApp. Lote passa obrigatoriamente pelos intents, que têm limite por
  // canal — e a regra é geral, não um caso especial de `count`.
  if (effectivePolicy.isAction && !intent && isExternalConversationChannel(input.channel)) {
    const directItemCount = extractDirectToolItemCount(toRecord(input.toolArgs));
    if (directItemCount > WHATSAPP_DIRECT_TOOL_MAX_ITEMS) {
      return finalize(buildBatchLimitExceededDecision(
        effectivePolicy,
        WHATSAPP_DIRECT_TOOL_MAX_ITEMS,
        directItemCount
      ));
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
      return finalize(buildCrossAccountViolationDecision(effectivePolicy, crossAccountCheck.message || ''));
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
      return finalize(buildSessionScopeViolationDecision(effectivePolicy, sessionValidation.message || ''));
    }
  }

  return buildAllowedPolicyDecision(effectivePolicy, permissionVerdict.shortfall);
}
