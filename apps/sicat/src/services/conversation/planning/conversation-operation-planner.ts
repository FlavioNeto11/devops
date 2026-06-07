import type { LlmPlan, LlmToolCall } from '../llm-provider.js';
import { resolveConversationEntities } from './conversation-entity-resolver.js';

type LooseRecord = Record<string, unknown>;

export type ConversationPlanStep = {
  id: string;
  kind: 'read' | 'compute' | 'preview' | 'action' | 'confirm';
  toolName: string;
  description: string;
  dependsOn: string[];
  risk: 'R1' | 'R2' | 'R3' | 'R4';
  requiresConfirmation: boolean;
  args: LooseRecord;
};

export type ConversationOperationPlan = {
  intent: string;
  toolName: string;
  risk: 'R1' | 'R2' | 'R3' | 'R4';
  requiresConfirmation: boolean;
  steps: ConversationPlanStep[];
  entities: ReturnType<typeof resolveConversationEntities>;
};

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

function readIntent(toolCall: LlmToolCall | null, orchestration: LlmPlan['orchestration']): string {
  const fromTool = toNullableString(toRecord(toolCall?.arguments).intent);
  const fromClassifier = toNullableString(orchestration?.classifier?.intent);
  if (fromTool) return fromTool;
  if (fromClassifier) return fromClassifier;
  return toolCall?.name || 'conversation.respond';
}

function isActionIntent(intent: string): boolean {
  return intent.includes('cancel')
    || intent.includes('submit')
    || intent.includes('print')
    || intent.includes('replicate')
    || intent.includes('receive')
    || intent.includes('create_from_payload')
    || intent.includes('cdf.action')
    || intent.includes('cdf.download')
    || intent.includes('cdf.generate');
}

function resolveRisk(intent: string): 'R1' | 'R2' | 'R3' | 'R4' {
  if (intent.includes('preview')) return 'R2';
  if (intent.includes('cancel')) return 'R4';
  if (intent.includes('submit') || intent.includes('print') || intent.includes('replicate') || intent.includes('receive') || intent.includes('cdf.download') || intent.includes('cdf.generate')) return 'R3';
  if (intent.includes('preview') || intent.includes('draft')) return 'R2';
  return 'R1';
}

function isPreviewOnlyToolCall(toolCall: LlmToolCall): boolean {
  const args = toRecord(toolCall.arguments);
  const selection = toRecord(args.selection);
  const previewSignals = [
    args.previewOnly,
    args.mode,
    selection.previewOnly,
    selection.mode
  ];

  return previewSignals.some((value) => {
    if (value === true) return true;
    const normalized = toNullableString(value)?.toLowerCase();
    return normalized === 'preview';
  });
}

function buildSteps(input: {
  intent: string;
  toolCall: LlmToolCall;
  requiresConfirmation: boolean;
  risk: 'R1' | 'R2' | 'R3' | 'R4';
}): ConversationPlanStep[] {
  const baseArgs = toRecord(input.toolCall.arguments);
  const actionIntent = isActionIntent(input.intent);
  const previewOnly = isPreviewOnlyToolCall(input.toolCall);
  const readStep: ConversationPlanStep = {
    id: 'step_read_context',
    kind: 'read',
    toolName: input.toolCall.name,
    description: 'Ler contexto operacional e resolver entidades da solicitacao.',
    dependsOn: [],
    risk: 'R1',
    requiresConfirmation: false,
    args: {}
  };

  const computeStep: ConversationPlanStep = {
    id: 'step_prepare_operation',
    kind: 'compute',
    toolName: input.toolCall.name,
    description: 'Normalizar filtros, recencia e lote para execucao deterministica.',
    dependsOn: ['step_read_context'],
    risk: 'R1',
    requiresConfirmation: false,
    args: {}
  };

  const previewStep: ConversationPlanStep = {
    id: 'step_preview_set',
    kind: 'preview',
    toolName: input.toolCall.name,
    description: 'Gerar preview deterministico com conjunto selecionado e snapshot de confirmacao.',
    dependsOn: ['step_prepare_operation'],
    risk: 'R2',
    requiresConfirmation: false,
    args: {
      ...baseArgs,
      previewOnly: true
    }
  };

  const actionStep: ConversationPlanStep = {
    id: actionIntent ? 'step_execute_action' : 'step_execute',
    kind: actionIntent ? 'action' : 'read',
    toolName: input.toolCall.name,
    description: actionIntent
      ? 'Executar tool operacional com policy e rastreabilidade.'
      : 'Executar consulta operacional e consolidar resultado.',
    dependsOn: ['step_prepare_operation'],
    risk: input.risk,
    requiresConfirmation: input.requiresConfirmation,
    args: baseArgs
  };

  if (actionIntent && previewOnly) {
    return [readStep, computeStep, previewStep];
  }

  if (!input.requiresConfirmation) {
    return [readStep, computeStep, actionStep];
  }

  const confirmStep: ConversationPlanStep = {
    id: 'step_confirm',
    kind: 'confirm',
    toolName: input.toolCall.name,
    description: 'Exigir confirmacao explicita antes de acao sensivel.',
    dependsOn: ['step_preview_set'],
    risk: input.risk,
    requiresConfirmation: true,
    args: {
      intent: input.intent
    }
  };

  actionStep.dependsOn = ['step_confirm'];
  return [readStep, computeStep, previewStep, confirmStep, actionStep];
}

export function buildConversationOperationPlan(input: {
  llmPlan: LlmPlan;
  context: {
    integrationAccountId: string | null;
    sessionContextId: string | null;
    manifestId: string | null;
  };
}): ConversationOperationPlan | null {
  const toolCall = input.llmPlan.toolCall;
  if (!toolCall?.name) return null;

  const intent = readIntent(toolCall, input.llmPlan.orchestration);
  const risk = resolveRisk(intent);
  const requiresConfirmation = risk === 'R3' || risk === 'R4';

  return {
    intent,
    toolName: toolCall.name,
    risk,
    requiresConfirmation,
    entities: resolveConversationEntities({
      toolArgs: toRecord(toolCall.arguments),
      classifierEntities: toRecord(input.llmPlan.orchestration?.classifier?.entities),
      context: input.context
    }),
    steps: buildSteps({
      intent,
      toolCall,
      requiresConfirmation,
      risk
    })
  };
}
