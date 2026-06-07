import type { ConversationActionCard, ConversationArtifact } from './tool-types.js';

type ManifestListLikeItem = {
  id?: string;
  manifestId?: string;
  manifestNumber?: string | number | null;
  status?: string | null;
  externalStatus?: string | null;
  expeditionDate?: string | null;
  lastSyncAt?: string | null;
};

function toDisplayManifestId(item: ManifestListLikeItem) {
  return item.manifestId || item.id || null;
}

function toDisplayManifestNumber(item: ManifestListLikeItem) {
  if (typeof item.manifestNumber === 'number' || typeof item.manifestNumber === 'string') {
    return String(item.manifestNumber);
  }
  return null;
}

export function buildManifestListArtifact(items: ManifestListLikeItem[]) {
  const normalized = items.slice(0, 20).map((item, index) => ({
    position: index + 1,
    manifestId: toDisplayManifestId(item),
    manifestNumber: toDisplayManifestNumber(item),
    status: item.status || item.externalStatus || null,
    expeditionDate: item.expeditionDate || item.lastSyncAt || null
  }));

  const artifact: ConversationArtifact = {
    type: 'manifest_list',
    title: 'Manifestos selecionados',
    payload: {
      count: normalized.length,
      items: normalized
    }
  };

  return [artifact];
}

export function buildManifestDetailArtifact(detail: Record<string, unknown>) {
  const artifact: ConversationArtifact = {
    type: 'manifest_detail',
    title: 'Detalhe do manifesto',
    payload: detail
  };

  return [artifact];
}

export function buildActionCardsForSensitiveManifestAction(input: {
  operation: 'manifest.submit' | 'manifest.print' | 'manifest.cancel';
  manifestId: string | null;
  jobId?: string | null;
}) {
  const actions: ConversationActionCard[] = [];

  if (input.manifestId) {
    actions.push({
      type: 'open_manifest',
      label: 'Abrir manifesto',
      payload: {
        manifestId: input.manifestId
      }
    });
  }

  if (input.jobId) {
    actions.push({
      type: 'open_job',
      label: 'Acompanhar job',
      payload: {
        jobId: input.jobId,
        operation: input.operation
      }
    });
  }

  actions.push({
    type: 'follow_up',
    label: 'Verificar status novamente',
    payload: {
      operation: input.operation,
      manifestId: input.manifestId,
      jobId: input.jobId || null
    }
  });

  return actions;
}
