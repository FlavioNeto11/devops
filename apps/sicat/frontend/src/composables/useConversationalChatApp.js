import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';
import {
  downloadConversationArtifactContent,
  getConversationArtifactStatus,
  sendConversationFeedback,
  sendConversationTurn
} from '../services/api.js';
import { useAuthStore } from '../stores/auth.js';
import { CONVERSATIONAL_CHAT_QUICK_ACTIONS } from '../config/conversation-chat-quick-actions.js';

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

function buildLocalId(prefix = 'chat') {
  if (globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function') {
    return `${prefix}_${globalThis.crypto.randomUUID()}`;
  }

  return `${prefix}_${Date.now()}_${Math.floor(Math.random() * 100000)}`;
}

function createMessage({
  role,
  text,
  status = 'ready',
  source = 'local',
  facts = [],
  correlationId = null,
  toolName = null,
  result = null,
  actions = [],
  confirmationAction = null,
  confirmationText = ''
}) {
  return {
    id: buildLocalId('chat-message'),
    role,
    text: toTrimmedString(text),
    status,
    source,
    facts: Array.isArray(facts) ? facts.filter(Boolean) : [],
    correlationId,
    toolName,
    result,
    actions: Array.isArray(actions) ? actions : [],
    confirmationAction,
    confirmationText,
    createdAt: new Date().toISOString()
  };
}

function openBlobDownload(blob, fileName) {
  const safeName = toTrimmedString(fileName) || 'artifact.bin';
  const blobUrl = globalThis.URL.createObjectURL(blob);
  const anchor = globalThis.document.createElement('a');
  anchor.href = blobUrl;
  anchor.download = safeName;
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
    'native_chat',
    userId || 'anonymous',
    integrationAccountId || 'no-account'
  ].join(':');
}

function detectSensitiveAction(text) {
  const normalized = toTrimmedString(text).toLowerCase();
  if (!normalized) {
    return false;
  }

  return /(cancel(ar|amento)|imprimir|print|submeter|submit|enviar manifesto)/.test(normalized);
}

function summarizeManifestList(data, resultKind) {
  const items = Array.isArray(data?.items) ? data.items : [];
  return {
    facts: [
      `Manifestos retornados: ${Number(data?.totalItems || items.length || 0)}`,
      ...(items[0] ? [`Primeiro item: ${toTrimmedString(items[0]?.manifestNumber || items[0]?.id) || '-'}`] : [])
    ],
    resultKind: resultKind || 'query'
  };
}

function summarizeManifestDetails(data, resultKind) {
  return {
    facts: [
      `Manifesto: ${toTrimmedString(data?.manifestNumber || data?.id) || '-'}`,
      `Status: ${toTrimmedString(data?.externalStatus || data?.status) || '-'}`,
      `Gerador: ${toTrimmedString(data?.generator?.description) || '-'}`
    ],
    resultKind: resultKind || 'query'
  };
}

function summarizeDashboard(data, resultKind) {
  return {
    facts: [
      `Jobs em fila: ${Number(data?.health?.statistics?.jobs_queued || 0)}`,
      `Jobs executando: ${Number(data?.health?.statistics?.jobs_running || 0)}`,
      `Workers ativos: ${Number(data?.health?.statistics?.workers_active_5m || 0)}`
    ],
    resultKind: resultKind || 'query'
  };
}

function summarizeJobStatus(data, resultKind) {
  return {
    facts: [
      `Job: ${toTrimmedString(data?.jobId) || '-'}`,
      `Status: ${toTrimmedString(data?.status) || '-'}`,
      `Tipo: ${toTrimmedString(data?.jobType || data?.type) || '-'}`
    ],
    resultKind: resultKind || 'query'
  };
}

function summarizeAuditTrail(data, resultKind) {
  const items = Array.isArray(data?.items) ? data.items : [];
  return {
    facts: [`Eventos de auditoria retornados: ${items.length}`],
    resultKind: resultKind || 'query'
  };
}

function summarizeConversationResult(response) {
  const toolName = toTrimmedString(response?.toolCall?.name);
  const resultKind = toTrimmedString(response?.result?.kind);
  const data = response?.result?.data;

  const byTool = {
    list_manifests: () => summarizeManifestList(data, resultKind),
    get_manifest_details: () => summarizeManifestDetails(data, resultKind),
    get_dashboard_overview: () => summarizeDashboard(data, resultKind),
    get_job_status: () => summarizeJobStatus(data, resultKind),
    get_audit_trail: () => summarizeAuditTrail(data, resultKind)
  };

  if (typeof byTool[toolName] === 'function') {
    return byTool[toolName]();
  }

  if (response?.status === 'blocked') {
    const confirmationAction = response?.policy?.requiresConfirmation ? buildConfirmationAction(response) : null;
    return {
      facts: [
        ...(response?.policy?.reason ? [`Policy: ${response.policy.reason}`] : []),
        ...(response?.policy?.requiresConfirmation ? ['A policy exige confirmacao explicita para esse tipo de acao.'] : [])
      ],
      actions: confirmationAction ? [confirmationAction] : [],
      confirmationAction,
      confirmationText: response?.policy?.reason || 'Confirme para executar esta acao sensivel.',
      resultKind: 'blocked'
    };
  }

  return {
    facts: [],
    actions: [],
    confirmationAction: null,
    confirmationText: '',
    resultKind: resultKind || null
  };
}

export function useConversationalChatApp() {
  const router = useRouter();
  const authStore = useAuthStore();

  const draft = ref('');
  const error = ref('');
  const isSubmitting = ref(false);
  const messages = ref([]);
  const conversationSessionId = ref('');
  const focusedManifestId = ref('');
  const focusedJobId = ref('');
  
  // NOVO: Phase 06 - Snapshot preservation for preview+confirm workflow
  const lastSnapshot = ref(null);

  const integrationAccountId = computed(() => toNullableString(authStore.integrationAccountId.value));
  const sessionContextId = computed(() => toNullableString(authStore.sessionContext.value?.id || authStore.sessionContext.value?.sessionContextId));
  const accountId = computed(() => toNullableString(authStore.activeAccount.value?.accountId));
  const authenticatedUserId = computed(() => buildUserId(authStore.user.value));

  const operationalScopeReady = computed(() => Boolean(
    authStore.isAuthenticated.value
    && authStore.hasActiveCetesbAccount.value
    && integrationAccountId.value
    && sessionContextId.value
    && accountId.value
    && authenticatedUserId.value
  ));

  const accountLabel = computed(() => {
    const account = authStore.activeAccount.value || null;
    if (!account) {
      return 'Conta CETESB nao selecionada';
    }

    const partnerName = toTrimmedString(account.partnerName);
    const partnerCode = toTrimmedString(account.partnerCode);

    if (partnerName && partnerCode) {
      return `${partnerName} (cod. ${partnerCode})`;
    }

    return partnerName || partnerCode || toTrimmedString(account.accountId) || 'Conta ativa';
  });

  const quickActions = computed(() => CONVERSATIONAL_CHAT_QUICK_ACTIONS);

  const composerPlaceholder = computed(() => {
    return 'Pergunte sobre manifestos, jobs, auditoria e dashboard. Este app opera em modo consultivo.';
  });

  function appendMessage(message) {
    messages.value = messages.value.concat(message);
  }

  function clearConversation() {
    draft.value = '';
    error.value = '';
    conversationSessionId.value = '';
    messages.value = [];
  }

  function ensureInitialAssistantMessage() {
    if (messages.value.length > 0) {
      return;
    }

    appendMessage(createMessage({
      role: 'assistant',
      text: 'SICAT Conversacional pronto. Posso responder consultas operacionais guiadas com base na sua sessao autenticada.',
      facts: [
        'Modo consultivo ativo: acoes sensiveis nao sao executadas neste app simplificado.',
        'Conta CETESB ativa e session context sao obrigatorios para consultar o backend conversacional.'
      ]
    }));
  }

  function validateQuickActionRequirements(action) {
    const requires = Array.isArray(action?.requires) ? action.requires : [];

    if (requires.includes('manifestId') && !toTrimmedString(focusedManifestId.value)) {
      return 'Informe um manifesto em foco para usar esta acao guiada.';
    }

    if (requires.includes('jobId') && !toTrimmedString(focusedJobId.value)) {
      return 'Informe um job em foco para usar esta acao guiada.';
    }

    return '';
  }

  async function sendToBackend(userInput, options = {}) {
    const user = authStore.user.value || null;
    const requestedBy = buildRequestedBy(user);
    const userId = buildUserId(user);
    const metadata = {
      source: 'native-chat-app-simplified',
      app: 'conversational-chat-app'
    };

    if (options.metadata && typeof options.metadata === 'object') {
      Object.assign(metadata, options.metadata);
    }

    const response = await sendConversationTurn({
      channel: 'native_chat',
      conversationSessionId: conversationSessionId.value || undefined,
      message: {
        text: userInput
      },
      context: {
        integrationAccountId: integrationAccountId.value,
        sessionContextId: sessionContextId.value,
        accountId: accountId.value,
        requestedBy,
        userId,
        manifestId: toNullableString(focusedManifestId.value),
        jobId: toNullableString(focusedJobId.value),
        currentScreen: 'native_chat_app_simplified',
        channelSessionKey: buildChannelSessionKey(userId, integrationAccountId.value)
      },
      metadata,
      ...(options.toolRequest ? { toolRequest: options.toolRequest } : {}),
      options: {
        allowActions: true
      }
    });

    conversationSessionId.value = toTrimmedString(response?.conversationSessionId);

    // NOVO: Phase 06 - Extract and preserve snapshot for preview+confirm workflow
    extractAndPreserveSnapshot(response);

    const summary = summarizeConversationResult(response);
    const resultActions = Array.isArray(response?.result?.actions) ? response.result.actions : [];
    const mergedActions = Array.isArray(summary.actions) ? summary.actions.concat(resultActions) : resultActions;
    appendMessage(createMessage({
      role: 'assistant',
      text: response?.responseText || 'Nao consegui montar uma resposta agora.',
      source: 'backend',
      status: toTrimmedString(response?.status) || 'ready',
      facts: summary.facts,
      actions: mergedActions.map((item) => mapBackendActionToUiAction(item) || item).filter(Boolean),
      correlationId: toNullableString(response?.correlationId),
      toolName: toNullableString(response?.toolCall?.name),
      result: response?.result || null,
      confirmationAction: summary.confirmationAction || null,
      confirmationText: summary.confirmationText || ''
    }));
  }

  async function sendToolConfirmation(actionPayload) {
    const toolName = toNullableString(actionPayload?.name);
    if (!toolName) {
      return;
    }

    // NOVO: Phase 06 - Include snapshot token if available
    const confirmedArguments = {
      ...actionPayload?.arguments || {},
      confirmed: true
    };

    // Se houver snapshot preservado, incluir na confirmação
    if (lastSnapshot.value?.token) {
      confirmedArguments.selectionSnapshot = lastSnapshot.value.token;
      confirmedArguments.snapshotAccountId = lastSnapshot.value.accountId;
      confirmedArguments.snapshotSessionContextId = lastSnapshot.value.sessionContextId;
    }

    await sendToBackend('Confirmar execucao da acao sensivel.', {
      toolRequest: {
        name: toolName,
        arguments: confirmedArguments
      },
      metadata: {
        confirmation: true,
        snapshotUsed: Boolean(lastSnapshot.value?.token)
      }
    });
  }

  // NOVO: Phase 06 - Extract and preserve snapshot from response
  function extractAndPreserveSnapshot(response) {
    const data = response?.result?.data || {};
    const snapshotToken = toNullableString(
      data.selectionSnapshot || 
      data.snapshotToken || 
      data.creationSnapshot || 
      data.replicationSnapshot ||
      data.cdfSnapshot
    );

    if (snapshotToken) {
      const intent = toNullableString(data.intent);
      lastSnapshot.value = {
        token: snapshotToken,
        accountId: integrationAccountId.value,
        sessionContextId: sessionContextId.value,
        intent,
        generatedAt: new Date().toISOString(),
        itemCount: Array.isArray(data.selectedItems) ? data.selectedItems.length : 1
      };
    }
  }

  async function downloadArtifact(artifact) {
    const artifactId = toNullableString(artifact?.artifactId);
    if (!artifactId) {
      return;
    }

    const statusResponse = await getConversationArtifactStatus({
      artifactId,
      integrationAccountId: integrationAccountId.value,
      sessionContextId: sessionContextId.value
    });

    const artifactStatus = toTrimmedString(statusResponse?.status || artifact?.status);
    if (!['available', 'partial'].includes(artifactStatus)) {
      appendMessage(createMessage({
        role: 'assistant',
        text: `Artifact ${artifactId} ainda em processamento.`,
        status: 'blocked',
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
      integrationAccountId: integrationAccountId.value,
      sessionContextId: sessionContextId.value,
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
    appendMessage(createMessage({ role: 'user', text: userInput }));
    draft.value = '';

    if (!operationalScopeReady.value) {
      appendMessage(createMessage({
        role: 'assistant',
        text: 'Este app exige sessao SICAT valida, conta CETESB ativa e contexto operacional completo.',
        status: 'blocked',
        facts: ['Acesse a tela de sessao para ativar ou revisar a conta CETESB antes de tentar uma consulta.']
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
        status: 'failed',
        facts: [message]
      }));
    } finally {
      isSubmitting.value = false;
    }
  }

  async function runQuickAction(action) {
    const requirementError = validateQuickActionRequirements(action);
    if (requirementError) {
      appendMessage(createMessage({
        role: 'assistant',
        text: requirementError,
        status: 'blocked'
      }));
      return;
    }

    await sendMessage(action.prompt);
  }

  async function handleAction(action) {
    if (!action || typeof action !== 'object') {
      return;
    }

    if (action.kind === 'backend' && action.prompt) {
      await sendMessage(action.prompt);
      return;
    }

    if (action.kind === 'navigate' && action.to) {
      await router.push(action.to);
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

  // F5: feedback explícito 👍/👎 por resposta da IA (otimista; falha só loga).
  async function sendFeedback(message, feedbackType) {
    if (!message || message.role !== 'assistant' || !message.correlationId) return;
    const previous = message.feedback || null;
    message.feedback = feedbackType;
    try {
      await sendConversationFeedback({
        correlationId: message.correlationId,
        conversationSessionId: conversationSessionId.value || null,
        channel: 'native_chat',
        feedbackType,
        userId: authenticatedUserId.value || null,
        toolName: message.toolName || null
      });
    } catch (feedbackError) {
      message.feedback = previous;
      console.warn('[chat] falha ao registrar feedback:', feedbackError);
    }
  }

  return {
    draft,
    error,
    isSubmitting,
    messages,
    quickActions,
    composerPlaceholder,
    focusedManifestId,
    focusedJobId,
    accountLabel,
    operationalScopeReady,
    ensureInitialAssistantMessage,
    clearConversation,
    sendMessage,
    sendFeedback,
    runQuickAction,
    handleAction,
    downloadArtifact
  };
}
