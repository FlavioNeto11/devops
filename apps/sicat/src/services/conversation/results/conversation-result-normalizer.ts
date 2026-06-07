import type {
  ConversationStructuredResult,
  ConversationResultAction,
  ConversationResultArtifact,
  ConversationResultType
} from './conversation-result-types.js';

type LooseRecord = Record<string, unknown>;

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

function normalizeArtifacts(value: unknown): ConversationResultArtifact[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => {
      const record = toRecord(item);
      const payload = toRecord(record.payload);
      const title = toNullableString(record.title) || 'Artifact';
      const type = toNullableString(record.type) || 'notice';
      return { type, title, payload };
    })
    .slice(0, 30);
}

function normalizeActions(value: unknown): ConversationResultAction[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => {
      const record = toRecord(item);
      const type = toNullableString(record.type) || 'follow_up';
      const label = toNullableString(record.label) || 'Continuar';
      const payload = toRecord(record.payload);
      return { type, label, payload };
    })
    .slice(0, 30);
}

function inferTypeFromTokenRules(intent: string): ConversationResultType | null {
  const tokenRules: Array<{ tokens: string[]; type: ConversationResultType }> = [
    { tokens: ['missing_fields'], type: 'manifest_missing_fields' },
    { tokens: ['create_missing'], type: 'manifest_missing_fields' },
    { tokens: ['create_preview'], type: 'manifest_creation_draft' },
    { tokens: ['preview_create'], type: 'manifest_creation_draft' },
    { tokens: ['group'], type: 'grouped_manifest_list' },
    { tokens: ['aggregate'], type: 'grouped_manifest_list' },
    { tokens: ['compare'], type: 'grouped_manifest_list' },
    { tokens: ['audit'], type: 'audit_timeline' }
  ];

  for (const rule of tokenRules) {
    if (rule.tokens.every((token) => intent.includes(token))) {
      return rule.type;
    }
  }

  return null;
}

function inferManifestTypeFromIntent(intent: string, kind: string): ConversationResultType | null {
  if (intent.includes('cdf')) return null;
  if (intent.includes('preview') && intent.includes('replicate')) return 'manifest_replication_preview';
  if (intent.includes('preview') && (intent.includes('batch') || intent.includes('cancel_recent'))) return 'manifest_batch_preview';
  if (intent.includes('batch')) return kind === 'action' ? 'manifest_batch_action' : 'manifest_batch_preview';
  if (intent.includes('replicate')) return kind === 'action' ? 'manifest_batch_action' : 'manifest_replication_preview';
  if (intent.includes('create_draft')) return 'manifest_creation_draft';
  return null;
}

function inferCdfTypeFromIntent(intent: string, kind: string): ConversationResultType | null {
  if (!intent.includes('cdf')) return null;
  if (kind === 'action') return 'cdf_action';
  if (intent.includes('detail')) return 'cdf_detail';
  return 'cdf_list';
}

function inferTypeFromIntent(intent: string, kind: string): ConversationResultType | null {
  const resolvers: Array<() => ConversationResultType | null> = [
    () => inferTypeFromTokenRules(intent),
    () => inferManifestTypeFromIntent(intent, kind),
    () => inferCdfTypeFromIntent(intent, kind),
    () => (intent.includes('job') && kind === 'query' ? 'job_list' : null)
  ];

  for (const resolve of resolvers) {
    const resolved = resolve();
    if (resolved) return resolved;
  }

  return null;
}

function inferTypeFromPayload(payload: LooseRecord): ConversationResultType {
  const explicitType = toNullableString(payload.type);
  if (explicitType) return explicitType as ConversationResultType;

  const data = toRecord(payload.data);
  const intent = toNullableString(data.intent) || '';
  const kind = toNullableString(payload.kind) || '';

  const fromIntent = inferTypeFromIntent(intent, kind);
  if (fromIntent) return fromIntent;

  if (kind === 'action') return 'operation_progress';
  if (Array.isArray(data.manifests) || Array.isArray(data.affectedItems)) return 'manifest_list';

  return 'manifest_detail';
}

export function normalizeConversationStructuredResult(toolResult: unknown): ConversationStructuredResult {
  const payload = toRecord(toolResult);
  const data = toRecord(payload.data);

  return {
    type: inferTypeFromPayload(payload),
    data,
    artifacts: normalizeArtifacts(payload.artifacts),
    actions: normalizeActions(payload.actions),
    assistantSummary: toNullableString(payload.assistantSummary) || undefined,
    jobId: toNullableString(payload.jobId)
  };
}

export function normalizeConversationStructuredError(input: {
  correlationId: string;
  message: string;
  suggestion?: string | null;
  reasonCode?: string | null;
  actions?: ConversationResultAction[];
}): ConversationStructuredResult {
  return {
    type: 'error_explanation',
    data: {
      message: input.message,
      reasonCode: input.reasonCode || null,
      correlationId: input.correlationId,
      suggestion: input.suggestion || 'Revise os dados informados e tente novamente.'
    },
    artifacts: [],
    actions: input.actions || [
      {
        type: 'follow_up',
        label: 'Tentar novamente',
        payload: {
          reasonCode: input.reasonCode || null
        }
      }
    ]
  };
}
