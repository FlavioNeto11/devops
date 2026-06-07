export type ConversationMemoryPatch = {
  patchVersion: 'conversation-memory.v1';
  intent: string | null;
  lastToolName: string | null;
  askedManifestIds: string[];
  activeManifestIds: string[];
  activeJobIds: string[];
  artifactIds: string[];
  dateRange: {
    dateFrom: string | null;
    dateTo: string | null;
  } | null;
  updatedAt: string;
};
