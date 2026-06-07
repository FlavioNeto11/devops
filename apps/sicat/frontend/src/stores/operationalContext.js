import { reactive, computed } from 'vue';

/**
 * Store compartilhado para contexto operacional enriquecido das telas.
 * 
 * Usado pela Fase 3 do copiloto interno (InAppCopilotAssistant) para
 * acessar dados operacionais fornecidos por views como ManifestDetailView.
 * 
 * Resolve o blocker de arquitetura: provide/inject não funciona entre
 * componentes sibling em Vue 3. Este store desacopla a hierarquia.
 */

const state = reactive({
  // Contexto operacional do manifesto (ManifestDetailView)
  manifestStatus: null,
  externalStatus: null,
  lastAction: null,
  relatedJobs: [],
  availableDocuments: [],
  
  // Metadados
  sourceRouteName: null,
  sourceViewId: null,
  lastUpdatedAt: null,

  // Contexto conversacional operacional (artifacts/resultados recentes)
  conversationArtifacts: [],
  conversationUpdatedAt: null
});

function setManifestContext(manifestData) {
  if (!manifestData) {
    state.manifestStatus = null;
    state.externalStatus = null;
    state.lastAction = null;
    state.relatedJobs = [];
    state.availableDocuments = [];
    state.sourceRouteName = null;
    state.sourceViewId = null;
    state.lastUpdatedAt = null;
    return;
  }

  state.manifestStatus = manifestData.manifestStatus || null;
  state.externalStatus = manifestData.externalStatus || null;
  state.lastAction = manifestData.lastAction || null;
  state.relatedJobs = Array.isArray(manifestData.relatedJobs) ? manifestData.relatedJobs : [];
  state.availableDocuments = Array.isArray(manifestData.availableDocuments) ? manifestData.availableDocuments : [];
  state.sourceRouteName = manifestData.sourceRouteName || null;
  state.sourceViewId = manifestData.sourceViewId || null;
  state.lastUpdatedAt = new Date().toISOString();
}

function clearContext() {
  setManifestContext(null);
}

function setConversationArtifacts(artifacts) {
  state.conversationArtifacts = Array.isArray(artifacts) ? artifacts : [];
  state.conversationUpdatedAt = new Date().toISOString();
}

function clearConversationArtifacts() {
  state.conversationArtifacts = [];
  state.conversationUpdatedAt = null;
}

export function useOperationalContextStore() {
  const hasEnrichedContext = computed(() => Boolean(
    state.manifestStatus
    || state.externalStatus
    || state.lastAction
    || (Array.isArray(state.relatedJobs) && state.relatedJobs.length > 0)
    || (Array.isArray(state.availableDocuments) && state.availableDocuments.length > 0)
  ));

  const operationalContext = computed(() => ({
    manifestStatus: state.manifestStatus,
    externalStatus: state.externalStatus,
    lastAction: state.lastAction,
    relatedJobs: state.relatedJobs,
    availableDocuments: state.availableDocuments
  }));

  return {
    // State (read-only via computed)
    manifestStatus: computed(() => state.manifestStatus),
    externalStatus: computed(() => state.externalStatus),
    lastAction: computed(() => state.lastAction),
    relatedJobs: computed(() => state.relatedJobs),
    availableDocuments: computed(() => state.availableDocuments),
    sourceRouteName: computed(() => state.sourceRouteName),
    sourceViewId: computed(() => state.sourceViewId),
    lastUpdatedAt: computed(() => state.lastUpdatedAt),
    hasEnrichedContext,
    operationalContext,
    conversationArtifacts: computed(() => state.conversationArtifacts),
    conversationUpdatedAt: computed(() => state.conversationUpdatedAt),
    
    // Actions
    setManifestContext,
    clearContext,
    setConversationArtifacts,
    clearConversationArtifacts
  };
}
