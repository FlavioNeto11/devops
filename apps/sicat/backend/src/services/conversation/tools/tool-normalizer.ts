import {
  buildActionCardsForSensitiveManifestAction,
  buildManifestDetailArtifact,
  buildManifestListArtifact
} from './tool-artifact-builder.js';
import type { ConversationNormalizedToolResult } from './tool-types.js';

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

export function normalizeManifestListResult(data: unknown): ConversationNormalizedToolResult {
  const payload = asRecord(data);
  const items = asArray(payload.items).map((item) => asRecord(item));

  return {
    type: 'list',
    artifacts: buildManifestListArtifact(items),
    actions: []
  };
}

export function normalizeManifestDetailResult(data: unknown): ConversationNormalizedToolResult {
  const payload = asRecord(data);

  return {
    type: 'detail',
    artifacts: buildManifestDetailArtifact(payload),
    actions: []
  };
}

export function normalizeManifestActionResult(input: {
  operation: 'manifest.submit' | 'manifest.print' | 'manifest.cancel';
  manifestId: string | null;
  jobId: string | null;
  data: unknown;
}): ConversationNormalizedToolResult {
  return {
    type: 'action',
    artifacts: [
      {
        type: 'job',
        title: 'Acao enfileirada',
        payload: asRecord(input.data)
      }
    ],
    actions: buildActionCardsForSensitiveManifestAction({
      operation: input.operation,
      manifestId: input.manifestId,
      jobId: input.jobId
    })
  };
}
