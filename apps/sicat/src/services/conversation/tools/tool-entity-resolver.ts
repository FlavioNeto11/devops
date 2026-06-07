import { AppError } from '../../../lib/problem.js';
import { listManifests } from '../../manifest-service.js';
import type { ConversationDispatcherContext } from './tool-types.js';

type HeaderMap = Record<string, string | undefined>;

type ResolveManifestInput = {
  args: Record<string, unknown>;
  context: ConversationDispatcherContext;
  headers: HeaderMap;
};

function toNullableString(value: unknown): string | null {
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    const normalized = String(value).trim();
    return normalized || null;
  }
  return null;
}

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function toManifestIdFromItem(item: unknown): string | null {
  const record = asRecord(item);
  return toNullableString(record.id || record.manifestId);
}

async function fetchRecentManifestIds(input: ResolveManifestInput): Promise<string[]> {
  const response = await listManifests(
    {
      integrationAccountId: input.context.integrationAccountId || undefined,
      sessionContextId: input.context.sessionContextId || undefined,
      // "Ultimo/mais recente" deve seguir a data de negocio (expedicao), nao o
      // tempo de insercao no espelho local (created_at).
      orderBy: 'recency_desc',
      page: 1,
      pageSize: 20
    },
    input.context.correlationId,
    input.headers
  );

  const payload = asRecord(response);
  const items = Array.isArray(payload.items) ? payload.items : [];
  const ids = items.map(toManifestIdFromItem).filter((id): id is string => Boolean(id));
  return Array.from(new Set(ids));
}

function resolveFromExplicitArgs(args: Record<string, unknown>, context: ConversationDispatcherContext): string | null {
  const fromArgs = toNullableString(args.manifestId);
  if (fromArgs) return fromArgs;

  const reference = asRecord(args.reference);
  const fromReference = toNullableString(reference.manifestId);
  if (fromReference) return fromReference;

  if (context.manifestId) return context.manifestId;
  return null;
}

function resolveSelectionFromContext(context: ConversationDispatcherContext): string[] {
  if (!Array.isArray(context.lastManifestSelectionIds)) {
    return [];
  }

  return context.lastManifestSelectionIds.filter((item): item is string => Boolean(toNullableString(item)));
}

function resolveListItemFromSelection(reference: Record<string, unknown>, selection: string[]) {
  const indexRaw = Number(reference.index);
  const index = Number.isFinite(indexRaw) ? Math.trunc(indexRaw) : 1;
  const selected = selection[index - 1] || null;

  if (!selected) {
    throw new AppError(400, 'Bad Request', 'Nao foi possivel resolver o item solicitado da lista atual.', {
      code: 'CONVERSATION_MANIFEST_REFERENCE_NOT_FOUND'
    });
  }

  return {
    manifestId: selected,
    source: 'list_item'
  } as const;
}

async function resolveByManifestNumber(input: ResolveManifestInput, manifestNumber: string) {
  const response = await listManifests(
    {
      integrationAccountId: input.context.integrationAccountId || undefined,
      sessionContextId: input.context.sessionContextId || undefined,
      manifestNumber,
      page: 1,
      pageSize: 3
    },
    input.context.correlationId,
    input.headers
  );

  const payload = asRecord(response);
  const items = Array.isArray(payload.items) ? payload.items : [];
  const resolvedIds = Array.from(new Set(items.map(toManifestIdFromItem).filter((id): id is string => Boolean(id))));
  if (resolvedIds.length > 1) {
    throw new AppError(
      409,
      'Conflict',
      `Encontrei mais de um manifesto para o numero ${manifestNumber}. Informe o manifestId ou a posicao da lista para continuar.`,
      {
        code: 'CONVERSATION_MANIFEST_REFERENCE_AMBIGUOUS',
        context: {
          manifestNumber,
          candidateManifestIds: resolvedIds.slice(0, 5)
        }
      }
    );
  }

  const manifestId = resolvedIds[0] || null;
  if (!manifestId) {
    throw new AppError(404, 'Not Found', `Manifesto de numero ${manifestNumber} nao foi encontrado.`, {
      code: 'CONVERSATION_MANIFEST_NUMBER_NOT_FOUND'
    });
  }

  return {
    manifestId,
    source: 'manifest_number_lookup'
  } as const;
}

async function resolveLastManifest(input: ResolveManifestInput, selection: string[]) {
  const selected = selection[0] || null;
  if (selected) {
    return {
      manifestId: selected,
      source: 'session_last_selection'
    } as const;
  }

  const recentIds = await fetchRecentManifestIds(input);
  if (!recentIds[0]) {
    return null;
  }

  return {
    manifestId: recentIds[0],
    source: 'recent_manifest_list'
  } as const;
}

export async function resolveManifestReference(input: ResolveManifestInput) {
  const explicit = resolveFromExplicitArgs(input.args, input.context);
  if (explicit) {
    return {
      manifestId: explicit,
      source: 'explicit_id'
    } as const;
  }

  const reference = asRecord(input.args.reference);
  const referenceType = toNullableString(reference.type)?.toLowerCase();
  const manifestNumber = toNullableString(input.args.manifestNumber || reference.manifestNumber);

  const selection = resolveSelectionFromContext(input.context);

  if (referenceType === 'list_item') {
    return resolveListItemFromSelection(reference, selection);
  }

  if (referenceType === 'last' || selection.length > 0) {
    const resolvedLast = await resolveLastManifest(input, selection);
    if (resolvedLast) {
      return resolvedLast;
    }
  }

  if (manifestNumber) {
    return resolveByManifestNumber(input, manifestNumber);
  }

  throw new AppError(
    400,
    'Bad Request',
    'Nao consegui identificar qual manifesto deve ser usado. Informe o manifestId, o numero do manifesto ou use "ultimo" apos uma listagem.',
    {
      code: 'CONVERSATION_MANIFEST_REFERENCE_REQUIRED'
    }
  );
}
