import { computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { buildConversationScreenContext } from '../config/conversation-screen-catalog.js';
import {
  downloadConversationArtifactContent,
  getConversationArtifactStatus,
  sendConversationTurn
} from '../services/api.js';
import { useAuthStore } from '../stores/auth.js';
import { useOperationalContextStore } from '../stores/operationalContext.js';

/**
 * Composable para gerenciar o copiloto interno (Fase 3).
 * 
 * Contexto operacional é fornecido via store compartilhado (useOperationalContextStore).
 */

function buildLocalId(prefix = 'copilot') {
  if (globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function') {
    return `${prefix}_${globalThis.crypto.randomUUID()}`;
  }

  return `${prefix}_${Date.now()}_${Math.floor(Math.random() * 100000)}`;
}

function toTrimmedString(value) {
  if (typeof value === 'string') {
    return value.trim();
  }

  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    return String(value).trim();
  }

  return '';
}

function toNullableString(value) {
  const normalized = toTrimmedString(value);
  return normalized || null;
}

function normalizeCollection(list) {
  return Array.isArray(list) ? list : [];
}

function createMessage({
  role,
  text,
  source = 'local',
  status = 'ready',
  facts = [],
  actions = [],
  correlationId = null,
  toolName = null,
  resultKind = null,
  userInput = null,
  result = null,
  policy = null,
  confirmationAction = null,
  confirmationText = ''
}) {
  return {
    id: buildLocalId('copilot-message'),
    role,
    text: toTrimmedString(text),
    source,
    status,
    facts: normalizeCollection(facts).filter(Boolean),
    actions: normalizeCollection(actions),
    correlationId,
    toolName,
    resultKind,
    userInput,
    result,
    policy,
    confirmationAction,
    confirmationText,
    createdAt: new Date().toISOString()
  };
}

function openBlobDownload(blob, fileName) {
  const downloadName = toTrimmedString(fileName) || 'artifact.bin';
  const blobUrl = globalThis.URL.createObjectURL(blob);
  const anchor = globalThis.document.createElement('a');
  anchor.href = blobUrl;
  anchor.download = downloadName;
  anchor.rel = 'noopener';
  globalThis.document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  globalThis.URL.revokeObjectURL(blobUrl);
}

function buildConfirmationAction(response) {
  const toolName = toNullableString(response?.toolCall?.name);
  if (!toolName) {
    return null;
  }

  return {
    type: 'confirm_tool_execution',
    label: 'Confirmar execucao',
    payload: {
      name: toolName,
      arguments: response?.toolCall?.arguments || {}
    }
  };
}

function mapBackendActionToUiAction(action) {
  if (!action || typeof action !== 'object') {
    return null;
  }

  if (action.kind) {
    return action;
  }

  const payload = action.payload && typeof action.payload === 'object' ? action.payload : {};

  if (action.type === 'open_manifest') {
    const manifestId = toNullableString(payload.manifestId);
    return manifestId
      ? {
        kind: 'navigate',
        label: action.label || 'Abrir manifesto',
        to: `/manifestos/${encodeURIComponent(manifestId)}`
      }
      : null;
  }

  if (action.type === 'open_job') {
    return {
      kind: 'navigate',
      label: action.label || 'Abrir jobs',
      to: '/sistema/jobs'
    };
  }

  if (action.type === 'follow_up') {
    const operation = toTrimmedString(payload.operation);
    const manifestId = toTrimmedString(payload.manifestId);
    const prompt = operation && manifestId
      ? `Verifique novamente a operacao ${operation} para o manifesto ${manifestId}.`
      : 'Verifique novamente o status da ultima operacao.';

    return {
      kind: 'backend',
      label: action.label || 'Verificar status novamente',
      prompt
    };
  }

  if (action.type === 'confirm_tool_execution') {
    return {
      kind: 'confirm_tool_execution',
      label: action.label || 'Confirmar',
      payload
    };
  }

  return {
    kind: 'backend_action',
    label: action.label || 'Executar acao',
    payload,
    type: action.type
  };
}

function buildRequestedBy(user) {
  if (!user || typeof user !== 'object') {
    return null;
  }

  return toNullableString(user.userId) || toNullableString(user.email) || toNullableString(user.name);
}

function buildUserId(user) {
  if (!user || typeof user !== 'object') {
    return null;
  }

  return toNullableString(user.userId) || toNullableString(user.email);
}

function buildChannelSessionKey(userId, integrationAccountId) {
  return [
    'inapp',
    userId || 'anonymous',
    integrationAccountId || 'no-account'
  ].join(':');
}

function detectLocalIntent(rawText) {
  const text = toTrimmedString(rawText).toLowerCase();
  if (!text) {
    return null;
  }

  if (/(esta|essa) tela|tela atual|o que posso fazer aqui|explic(a|ar)|resuma a tela/.test(text)) {
    return 'screen_overview';
  }

  if (/campo|campos|preenchimento|preencher|formulario|formul[áa]rio/.test(text)) {
    return 'field_help';
  }

  if (/para onde|onde fica|naveg|atalho|proximo passo|pr[oó]ximo passo|ir agora/.test(text)) {
    return 'navigation_help';
  }

  return null;
}

function buildNavigationActions(screenContext) {
  return normalizeCollection(screenContext.relatedRoutes).map((route) => ({
    id: buildLocalId('copilot-action'),
    kind: 'navigate',
    label: route.label,
    to: route.to,
    description: route.description || ''
  }));
}

function buildScreenOverviewMessage(screenContext) {
  const facts = [
    screenContext.pageDescription,
    `Rota atual: ${screenContext.routePath}`,
    `Conta ativa: ${screenContext.activeAccountLabel}`
  ];

  if (screenContext.manifestId) {
    facts.push(`Manifesto em foco: ${screenContext.manifestId}`);
  }

  if (screenContext.jobId) {
    facts.push(`Job em foco: ${screenContext.jobId}`);
  }

  const importantFields = normalizeCollection(screenContext.fieldHints)
    .slice(0, 3)
    .map((item) => `${item.label}: ${item.description}`);

  return createMessage({
    role: 'assistant',
    text: `Voce esta em ${screenContext.pageTitle}. Posso usar essa rota como contexto para orientar a leitura da tela e sugerir proximos caminhos.`,
    facts: facts.concat(importantFields),
    actions: buildNavigationActions(screenContext)
  });
}

function buildFieldHelpMessage(screenContext) {
  const facts = normalizeCollection(screenContext.fieldHints).map((item) => `${item.label}: ${item.description}`);

  return createMessage({
    role: 'assistant',
    text: `Os pontos que mais merecem atencao em ${screenContext.pageTitle} estao abaixo.`,
    facts,
    actions: buildNavigationActions(screenContext)
  });
}

function buildNavigationHelpMessage(screenContext) {
  const actions = buildNavigationActions(screenContext);
  const facts = actions.map((action) => `${action.label}: ${action.description}`);

  return createMessage({
    role: 'assistant',
    text: 'Estes sao os atalhos mais uteis a partir do contexto atual.',
    facts,
    actions
  });
}

function buildLocalIntentMessage(intent, screenContext) {
  if (intent === 'field_help') {
    return buildFieldHelpMessage(screenContext);
  }

  if (intent === 'navigation_help') {
    return buildNavigationHelpMessage(screenContext);
  }

  return buildScreenOverviewMessage(screenContext);
}

function buildManifestLabel(manifest) {
  if (!manifest || typeof manifest !== 'object') {
    return 'Manifesto';
  }

  return toTrimmedString(manifest.manifestNumber)
    || (toTrimmedString(manifest.externalCode) ? `Codigo CETESB ${toTrimmedString(manifest.externalCode)}` : '')
    || toTrimmedString(manifest.id)
    || 'Manifesto';
}

function summarizeManifestListResult(response, data, resultKind) {
  const items = Array.isArray(data?.items) ? data.items : [];
  const totalItems = Number(data?.totalItems || items.length || 0);
  const visibleCount = items.length;
  const actions = items.slice(0, 3).map((item) => ({
    id: buildLocalId('copilot-action'),
    kind: 'navigate',
    label: buildManifestLabel(item),
    to: `/manifestos/${encodeURIComponent(toTrimmedString(item?.id || item?.manifestId))}`,
    description: `Abrir detalhe do manifesto ${buildManifestLabel(item)}.`
  })).filter((item) => !item.to.endsWith('/'));

  const firstItem = items[0] || null;
  const facts = [
    `Manifestos retornados nesta consulta: ${totalItems}`,
    `Itens visiveis no payload atual: ${visibleCount}`,
    ...(firstItem ? [
      `Primeiro item: ${buildManifestLabel(firstItem)}`,
      `Status do primeiro item: ${toTrimmedString(firstItem?.externalStatus || firstItem?.status) || '-'}`
    ] : [])
  ];

  return { facts, actions, resultKind: resultKind || 'query' };
}

function summarizeManifestDetailsResult(response, data, resultKind) {
  const manifest = data && typeof data === 'object' ? data : null;
  const manifestId = toTrimmedString(manifest?.id || response?.context?.manifestId);
  const facts = [
    `Manifesto consultado: ${buildManifestLabel(manifest)}`,
    `Status: ${toTrimmedString(manifest?.externalStatus || manifest?.status) || '-'}`,
    `Gerador: ${toTrimmedString(manifest?.generator?.description) || '-'}`,
    `Transportador: ${toTrimmedString(manifest?.carrier?.description) || '-'}`,
    `Destinador: ${toTrimmedString(manifest?.receiver?.description) || '-'}`
  ];

  const actions = manifestId
    ? [{
      id: buildLocalId('copilot-action'),
      kind: 'navigate',
      label: 'Abrir detalhe do manifesto',
      to: `/manifestos/${encodeURIComponent(manifestId)}`,
      description: 'Ir para a tela de detalhe em foco.'
    }]
    : [];

  return { facts, actions, resultKind: resultKind || 'query' };
}

function summarizeDashboardResult(data, resultKind) {
  const health = data?.health?.statistics || {};
  const activeJobs = Number(data?.activeJobs?.total || 0);
  const facts = [
    `Jobs em fila: ${Number(health.jobs_queued || 0)}`,
    `Jobs executando: ${Number(health.jobs_running || 0)}`,
    `Workers ativos: ${Number(health.workers_active_5m || 0)}`,
    `Jobs ativos retornados: ${activeJobs}`
  ];

  return {
    facts,
    actions: [{
      id: buildLocalId('copilot-action'),
      kind: 'navigate',
      label: 'Abrir Dashboard',
      to: '/dashboard',
      description: 'Ir para o painel operacional principal.'
    }],
    resultKind: resultKind || 'query'
  };
}

function summarizeJobResult(response, data, resultKind) {
  return {
    facts: [
      `Job: ${toTrimmedString(data?.jobId) || response?.jobId || '-'}`,
      `Status: ${toTrimmedString(data?.status) || '-'}`,
      `Operacao: ${toTrimmedString(data?.jobType || data?.operation || data?.type) || '-'}`
    ],
    actions: [{
      id: buildLocalId('copilot-action'),
      kind: 'navigate',
      label: 'Abrir Jobs',
      to: '/sistema/jobs',
      description: 'Consultar fila e diagnostico no modulo de jobs.'
    }],
    resultKind: resultKind || 'query'
  };
}

function summarizeAuditResult(response, data, resultKind) {
  const items = Array.isArray(data?.items) ? data.items : [];
  return {
    facts: [
      `Eventos de auditoria retornados: ${items.length}`,
      `CorrelationId consultado: ${toTrimmedString(response?.correlationId) || '-'}`
    ],
    actions: [],
    resultKind: resultKind || 'query'
  };
}

function summarizeBlockedResult(response) {
  const confirmationAction = response?.policy?.requiresConfirmation ? buildConfirmationAction(response) : null;
  const facts = [
    ...(response?.policy?.reason ? [`Motivo do bloqueio: ${response.policy.reason}`] : []),
    ...(response?.policy?.requiresConfirmation ? ['A policy do backend exige confirmacao explicita para esta operacao.'] : [])
  ];

  return {
    facts,
    actions: confirmationAction ? [confirmationAction] : [],
    confirmationAction,
    confirmationText: response?.policy?.reason || 'Confirme para executar esta operacao sensivel.',
    resultKind: 'blocked'
  };
}

function summarizeConversationResult(response) {
  const toolName = toTrimmedString(response?.toolCall?.name);
  const resultKind = toTrimmedString(response?.result?.kind);
  const data = response?.result?.data;

  if (toolName === 'list_manifests') {
    return summarizeManifestListResult(response, data, resultKind);
  }

  if (toolName === 'get_manifest_details') {
    return summarizeManifestDetailsResult(response, data, resultKind);
  }

  if (toolName === 'get_dashboard_overview') {
    return summarizeDashboardResult(data, resultKind);
  }

  if (toolName === 'get_job_status') {
    return summarizeJobResult(response, data, resultKind);
  }

  if (toolName === 'get_audit_trail') {
    return summarizeAuditResult(response, data, resultKind);
  }

  if (response?.status === 'blocked') {
    return summarizeBlockedResult(response);
  }

  return {
    facts: [],
    actions: [],
    confirmationAction: null,
    confirmationText: '',
    resultKind: resultKind || null
  };
}

export function useInAppCopilot() {
  const route = useRoute();
  const router = useRouter();
  const authStore = useAuthStore();
  const operationalContextStore = useOperationalContextStore();

  const isOpen = ref(false);
  const draft = ref('');
  const error = ref('');
  const isSubmitting = ref(false);
  const conversationSessionId = ref('');
  const messages = ref([]);

  const currentScreenContext = computed(() => buildConversationScreenContext({
    route,
    activeAccount: authStore.activeAccount.value || null,
    sessionContext: authStore.sessionContext.value || null,
    integrationAccountId: authStore.integrationAccountId.value || null,
    operationalContext: operationalContextStore.operationalContext.value
  }));

  const quickActions = computed(() => currentScreenContext.value.quickActions || []);
  const hasOperationalContext = computed(() => Boolean(
    authStore.hasActiveCetesbAccount.value
    && currentScreenContext.value.integrationAccountId
    && currentScreenContext.value.sessionContextId
  ));

  const composerPlaceholder = computed(() => {
    return `Pergunte sobre ${currentScreenContext.value.pageTitle.toLowerCase()}, manifestos, jobs ou dashboard.`;
  });

  function appendMessage(message) {
    messages.value = messages.value.concat(message);
  }

  function ensureWelcomeMessage() {
    if (messages.value.length > 0) {
      return;
    }

    appendMessage(buildScreenOverviewMessage(currentScreenContext.value));
  }

  function openPanel() {
    isOpen.value = true;
    ensureWelcomeMessage();
  }

  function closePanel() {
    isOpen.value = false;
  }

  function togglePanel() {
    if (isOpen.value) {
      closePanel();
      return;
    }

    openPanel();
  }

  function resetConversation({ keepPanelOpen = true } = {}) {
    draft.value = '';
    error.value = '';
    conversationSessionId.value = '';
    messages.value = [];
    operationalContextStore.clearConversationArtifacts();

    if (keepPanelOpen && isOpen.value) {
      ensureWelcomeMessage();
    }
  }

  async function runLocalIntent(intent, userInput = null) {
    if (userInput) {
      appendMessage(createMessage({ role: 'user', text: userInput, source: 'local', userInput }));
    }

    appendMessage(buildLocalIntentMessage(intent, currentScreenContext.value));
  }

  async function sendToBackend(userInput, options = {}) {
    const user = authStore.user.value || null;
    const requestedBy = buildRequestedBy(user);
    const userId = buildUserId(user);
    const screenContext = currentScreenContext.value;
    const metadata = {
      source: 'inapp-copilot-panel',
      routeName: screenContext.routeName,
      routePath: screenContext.routePath,
      pageTitle: screenContext.pageTitle
    };

    if (options.metadata && typeof options.metadata === 'object') {
      Object.assign(metadata, options.metadata);
    }

    const response = await sendConversationTurn({
      channel: 'inapp',
      conversationSessionId: conversationSessionId.value || undefined,
      message: {
        text: userInput
      },
      context: {
        integrationAccountId: screenContext.integrationAccountId,
        sessionContextId: screenContext.sessionContextId,
        manifestId: screenContext.manifestId,
        jobId: screenContext.jobId,
        auditCorrelationId: screenContext.auditCorrelationId,
        requestedBy,
        currentScreen: screenContext.screenKey,
        channelSessionKey: buildChannelSessionKey(userId, screenContext.integrationAccountId),
        userId,
        accountId: screenContext.accountId,
        routeName: screenContext.routeName,
        routePath: screenContext.routePath,
        pageTitle: screenContext.pageTitle,
        pageDescription: screenContext.pageDescription,
        breadcrumbs: screenContext.breadcrumbs,
        activeAccountLabel: screenContext.activeAccountLabel,
        activeAccountType: screenContext.activeAccountType,
        fieldHints: screenContext.fieldHints,
        // Contexto operacional enriquecido (quando disponível, ex: detalhe de manifesto)
        ...(screenContext.manifestStatus && { manifestStatus: screenContext.manifestStatus }),
        ...(screenContext.externalStatus && { externalStatus: screenContext.externalStatus }),
        ...(screenContext.lastAction && { lastAction: screenContext.lastAction }),
        ...(screenContext.relatedJobs && screenContext.relatedJobs.length > 0 && { relatedJobs: screenContext.relatedJobs }),
        ...(screenContext.availableDocuments && screenContext.availableDocuments.length > 0 && { availableDocuments: screenContext.availableDocuments })
      },
      metadata,
      ...(options.toolRequest ? { toolRequest: options.toolRequest } : {}),
      options: {
        allowActions: true
      }
    });

    conversationSessionId.value = toTrimmedString(response?.conversationSessionId);

    const summary = summarizeConversationResult(response);
    const resultActions = Array.isArray(response?.result?.actions) ? response.result.actions : [];
    const mergedActions = normalizeCollection(summary.actions).concat(resultActions);
    appendMessage(createMessage({
      role: 'assistant',
      text: response?.responseText || 'Nao consegui montar uma resposta agora.',
      source: 'backend',
      status: toTrimmedString(response?.status) || 'ready',
      facts: summary.facts,
      actions: mergedActions
        .map((item) => mapBackendActionToUiAction(item) || item)
        .filter(Boolean),
      correlationId: toNullableString(response?.correlationId),
      toolName: toNullableString(response?.toolCall?.name),
      resultKind: summary.resultKind,
      result: response?.result || null,
      policy: response?.policy || null,
      confirmationAction: summary.confirmationAction || null,
      confirmationText: summary.confirmationText || '',
      userInput
    }));

    const artifacts = Array.isArray(response?.result?.artifacts) ? response.result.artifacts : [];
    operationalContextStore.setConversationArtifacts(artifacts);
  }

  async function sendToolConfirmation(actionPayload) {
    const toolName = toNullableString(actionPayload?.name);
    if (!toolName) {
      return;
    }

    appendMessage(createMessage({
      role: 'user',
      text: `Confirmado: execute ${toolName}.`,
      source: 'local'
    }));

    await sendToBackend('Confirmar execucao da acao sensivel.', {
      toolRequest: {
        name: toolName,
        arguments: actionPayload?.arguments || {},
        confirmed: true
      },
      metadata: {
        confirmation: true
      }
    });
  }

  async function downloadArtifact(artifact) {
    const artifactId = toNullableString(artifact?.artifactId);
    if (!artifactId) {
      return;
    }

    const screenContext = currentScreenContext.value;
    const statusResponse = await getConversationArtifactStatus({
      artifactId,
      integrationAccountId: screenContext.integrationAccountId,
      sessionContextId: screenContext.sessionContextId
    });

    const artifactStatus = toTrimmedString(statusResponse?.status || artifact?.status);
    if (!['available', 'partial'].includes(artifactStatus)) {
      appendMessage(createMessage({
        role: 'assistant',
        text: `O artifact ${artifactId} ainda nao esta pronto para download.`,
        status: 'blocked',
        source: 'local',
        result: {
          type: 'status',
          data: {},
          artifacts: [{
            type: artifact?.artifactType === 'zip' ? 'zip_bundle' : 'document',
            title: 'Artifact em processamento',
            payload: {
              artifactId,
              status: artifactStatus || 'collecting',
              progress: statusResponse?.progress || null
            }
          }]
        }
      }));
      return;
    }

    const download = await downloadConversationArtifactContent({
      artifactId,
      integrationAccountId: screenContext.integrationAccountId,
      sessionContextId: screenContext.sessionContextId,
      fileName: artifact?.fileName
    });

    openBlobDownload(download.blob, download.fileName);
  }

  async function sendMessage(rawText) {
    const userInput = toTrimmedString(rawText);
    if (!userInput || isSubmitting.value) {
      return;
    }

    error.value = '';
    appendMessage(createMessage({ role: 'user', text: userInput, source: 'local', userInput }));
    draft.value = '';

    const localIntent = detectLocalIntent(userInput);
    if (localIntent) {
      appendMessage(buildLocalIntentMessage(localIntent, currentScreenContext.value));
      return;
    }

    if (!authStore.isAuthenticated.value) {
      appendMessage(createMessage({
        role: 'assistant',
        text: 'Você precisa estar autenticado para usar o copiloto.',
        source: 'local',
        status: 'blocked',
        facts: ['Faça login para continuar.']
      }));
      return;
    }

    isSubmitting.value = true;

    try {
      await sendToBackend(userInput);
    } catch (requestError) {
      const message = toTrimmedString(requestError?.message) || 'Falha ao consultar o backend conversacional.';
      error.value = message;
      appendMessage(createMessage({
        role: 'assistant',
        text: 'Nao consegui falar com o backend conversacional agora.',
        source: 'local',
        status: 'failed',
        facts: [message]
      }));
    } finally {
      isSubmitting.value = false;
    }
  }

  async function handleAction(action) {
    if (!action || typeof action !== 'object') {
      return;
    }

    if (action.kind === 'navigate' && action.to) {
      await router.push(action.to);
      return;
    }

    if (action.kind === 'local' && action.intent) {
      await runLocalIntent(action.intent, action.label || null);
      return;
    }

    if (action.kind === 'backend' && action.prompt) {
      await sendMessage(action.prompt);
      return;
    }

    if (action.kind === 'confirm_tool_execution' || action.type === 'confirm_tool_execution') {
      await sendToolConfirmation(action.payload || action);
      return;
    }

    if (action.kind === 'cancel_confirmation') {
      appendMessage(createMessage({
        role: 'assistant',
        source: 'local',
        status: 'ready',
        text: 'Confirmacao cancelada. Nenhuma acao sensivel foi executada.'
      }));
      return;
    }

    if (action.kind === 'download_artifact') {
      await downloadArtifact(action.payload || action);
    }
  }

  watch(
    () => `${currentScreenContext.value.integrationAccountId || ''}:${currentScreenContext.value.sessionContextId || ''}`,
    (nextScope, previousScope) => {
      if (!previousScope || nextScope === previousScope) {
        return;
      }

      resetConversation({ keepPanelOpen: isOpen.value });
    }
  );

  return {
    isOpen,
    draft,
    error,
    isSubmitting,
    messages,
    currentScreenContext,
    quickActions,
    composerPlaceholder,
    hasOperationalContext,
    openPanel,
    closePanel,
    togglePanel,
    resetConversation,
    sendMessage,
    handleAction,
    downloadArtifact
  };
}
