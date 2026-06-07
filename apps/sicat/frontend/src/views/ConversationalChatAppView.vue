<script setup>
import { nextTick, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useConversationalChatApp } from '../composables/useConversationalChatApp.js';
import StructuredMessageContent from '../components/conversation/StructuredMessageContent.vue';
import ConversationResultRenderer from '../components/conversation/ConversationResultRenderer.vue';

const router = useRouter();
const {
  draft,
  error,
  isSubmitting,
  messages,
  quickActions,
  composerPlaceholder,
  accountLabel,
  operationalScopeReady,
  ensureInitialAssistantMessage,
  clearConversation,
  sendMessage,
  runQuickAction,
  handleAction,
  downloadArtifact
} = useConversationalChatApp();

const threadRef = ref(null);
const composerRef = ref(null);
const copyState = ref('idle');

async function scrollThreadToBottom() {
  await nextTick();
  if (!threadRef.value) {
    return;
  }

  threadRef.value.scrollTop = threadRef.value.scrollHeight;
}

async function focusComposer() {
  await nextTick();
  const textarea = composerRef.value?.$el?.querySelector('textarea') || composerRef.value?.$el?.querySelector('input');
  if (typeof textarea?.focus === 'function') {
    textarea.focus();
  }
}

async function onSubmitComposer() {
  await sendMessage(draft.value);
  await scrollThreadToBottom();
  // Devolve o foco ao campo de mensagem assim que o processamento termina.
  await focusComposer();
}

async function onQuickAction(action) {
  await runQuickAction(action);
  await scrollThreadToBottom();
  await focusComposer();
}

async function copyConversation() {
  const payload = {
    exportedAt: new Date().toISOString(),
    account: accountLabel.value,
    messageCount: messages.value.length,
    messages: messages.value.map((message) => ({
      role: message.role,
      text: message.text,
      status: message.status,
      ...(message.toolName ? { toolName: message.toolName } : {}),
      ...(message.facts && message.facts.length ? { facts: message.facts } : {}),
      ...(message.correlationId ? { correlationId: message.correlationId } : {}),
      createdAt: message.createdAt
    }))
  };
  const json = JSON.stringify(payload, null, 2);

  let ok = false;
  try {
    await globalThis.navigator?.clipboard?.writeText(json);
    ok = true;
  } catch {
    ok = false;
  }
  if (!ok) {
    // Fallback para contextos sem Clipboard API (http, permissões).
    try {
      const textarea = globalThis.document.createElement('textarea');
      textarea.value = json;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      globalThis.document.body.appendChild(textarea);
      textarea.select();
      globalThis.document.execCommand('copy');
      textarea.remove();
      ok = true;
    } catch {
      ok = false;
    }
  }

  copyState.value = ok ? 'copied' : 'error';
  globalThis.setTimeout(() => {
    copyState.value = 'idle';
  }, 1800);
}

async function onMessageAction(action) {
  await handleAction(action);
  await scrollThreadToBottom();
}

async function onMessageArtifactDownload(artifact) {
  await downloadArtifact(artifact);
  await scrollThreadToBottom();
}

function onComposerKeydown(event) {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    void onSubmitComposer();
  }
}

watch(
  () => messages.value.length,
  async () => {
    await scrollThreadToBottom();
  }
);

onMounted(async () => {
  ensureInitialAssistantMessage();
  await scrollThreadToBottom();
  await focusComposer();
});
</script>

<template>
  <div class="chat-view">
    <!-- Compact action bar: context line + buttons -->
    <div class="chat-view-bar">
      <div class="chat-view-context">
        <v-icon size="15" color="on-surface-variant">mdi-domain</v-icon>
        <span class="chat-view-account">{{ accountLabel }}</span>
        <v-chip
          :color="operationalScopeReady ? 'success' : 'warning'"
          size="x-small"
          variant="tonal"
        >
          {{ operationalScopeReady ? 'Pronto' : 'Incompleto' }}
        </v-chip>
      </div>
      <div class="chat-view-actions">
        <v-btn
          :icon="copyState === 'copied' ? 'mdi-check' : (copyState === 'error' ? 'mdi-alert-circle-outline' : 'mdi-content-copy')"
          size="small"
          variant="text"
          density="compact"
          :color="copyState === 'copied' ? 'success' : (copyState === 'error' ? 'error' : undefined)"
          :title="copyState === 'copied' ? 'Histórico copiado (JSON)' : 'Copiar histórico da conversa em JSON'"
          aria-label="Copiar histórico da conversa em JSON"
          :disabled="!messages.length"
          @click="copyConversation"
        />
        <v-btn
          icon="mdi-refresh"
          size="small"
          variant="text"
          density="compact"
          title="Limpar conversa"
          aria-label="Limpar conversa"
          @click="clearConversation"
        />
        <v-btn
          variant="tonal"
          color="primary"
          size="small"
          prepend-icon="mdi-arrow-left"
          @click="router.push('/dashboard')"
        >
          Voltar
        </v-btn>
      </div>
    </div>

    <!-- Quick action pills -->
    <div v-if="quickActions.length" class="chat-quick-pills" aria-label="Ações guiadas">
      <button
        v-for="action in quickActions"
        :key="action.id"
        type="button"
        class="chat-pill"
        :disabled="isSubmitting"
        @click="onQuickAction(action)"
      >
        <v-icon v-if="action.icon" size="13">{{ action.icon }}</v-icon>
        {{ action.title }}
      </button>
    </div>

    <!-- Thread -->
    <section ref="threadRef" class="chat-thread" aria-live="polite" aria-label="Conversa">
      <article
        v-for="message in messages"
        :key="message.id"
        class="chat-message"
        :class="[`chat-message--${message.role}`, `chat-message--${message.status || 'ready'}`]"
      >
        <div class="chat-message-meta">
          {{ message.role === 'user' ? 'Você' : 'Assistente' }}
        </div>
        <div class="chat-message-text">
          <StructuredMessageContent :text="message.text" />
        </div>

        <ConversationResultRenderer
          :message="message"
          @action="onMessageAction"
          @download-artifact="onMessageArtifactDownload"
        />

        <div v-if="message.actions && message.actions.length" class="chat-message-actions">
          <v-btn
            v-for="action in message.actions"
            :key="action.id || action.label"
            variant="tonal"
            color="primary"
            size="small"
            @click="onMessageAction(action)"
          >
            {{ action.label || 'Acao' }}
          </v-btn>
        </div>

        <ul v-if="message.facts && message.facts.length" class="chat-message-facts">
          <li v-for="fact in message.facts" :key="fact">{{ fact }}</li>
        </ul>
      </article>

      <div v-if="isSubmitting" class="chat-message chat-message--assistant chat-message--loading">
        <v-progress-circular size="16" width="2" indeterminate color="primary" />
      </div>
    </section>

    <!-- Error -->
    <div v-if="error" class="chat-error" role="alert">
      <v-icon size="15">mdi-alert-circle-outline</v-icon>
      <span>{{ error }}</span>
    </div>

    <!-- Composer -->
    <form class="chat-composer" @submit.prevent="onSubmitComposer">
      <v-textarea
        ref="composerRef"
        v-model="draft"
        :placeholder="composerPlaceholder"
        rows="1"
        max-rows="4"
        auto-grow
        hide-details
        variant="solo-filled"
        flat
        :disabled="isSubmitting"
        @keydown="onComposerKeydown"
      />
      <div class="chat-composer-foot">
        <span class="chat-composer-hint">Modo consultivo · ações sensíveis requerem confirmação</span>
        <v-btn
          color="primary"
          size="small"
          :loading="isSubmitting"
          :disabled="!draft.trim()"
          type="submit"
        >
          Enviar
        </v-btn>
      </div>
    </form>
  </div>
</template>

<style scoped>
.chat-view {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  gap: 10px;
}

/* Bar: context line + action buttons */
.chat-view-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-shrink: 0;
}

.chat-view-context {
  display: flex;
  align-items: center;
  gap: 7px;
  font-size: 0.85rem;
  color: rgba(var(--v-theme-on-surface), 0.76);
  min-width: 0;
}

.chat-view-account {
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.chat-view-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

/* Horizontal scrollable pills */
.chat-quick-pills {
  display: flex;
  gap: 7px;
  overflow-x: auto;
  flex-shrink: 0;
  padding-bottom: 2px;
  scrollbar-width: none;
}

.chat-quick-pills::-webkit-scrollbar {
  display: none;
}

.chat-pill {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 4px 12px;
  min-height: 28px;
  border: 1px solid rgba(var(--v-theme-primary), 0.2);
  border-radius: 999px;
  background: rgba(var(--v-theme-surface), 0.88);
  color: rgba(var(--v-theme-on-surface), 0.84);
  font-size: 0.8rem;
  font-weight: 500;
  white-space: nowrap;
  cursor: pointer;
  transition: border-color 0.14s ease, box-shadow 0.14s ease;
}

.chat-pill:hover:not(:disabled),
.chat-pill:focus-visible {
  border-color: rgba(var(--v-theme-primary), 0.36);
  box-shadow: 0 4px 12px rgba(var(--v-theme-primary), 0.1);
  outline: none;
}

.chat-pill:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* Thread — fills remaining space, scrolls internally */
.chat-thread {
  flex: 1 1 0;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding-right: 4px;
}

.chat-message {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 10px 14px;
  border-radius: 16px;
  border: 1px solid rgba(var(--v-border-color), 0.14);
  max-width: 88%;
}

.chat-message--user {
  align-self: flex-end;
  background: rgba(var(--v-theme-primary), 0.1);
  border-color: rgba(var(--v-theme-primary), 0.16);
}

.chat-message--assistant {
  align-self: flex-start;
  background: rgba(var(--v-theme-surface-light), 0.6);
  max-width: 100%;
  width: 100%;
}

.chat-message--loading {
  padding: 12px 14px;
}

.chat-message--blocked {
  border-color: rgba(var(--v-theme-warning), 0.34);
}

.chat-message--failed {
  border-color: rgba(var(--v-theme-error), 0.34);
}

.chat-message-meta {
  font-size: 0.69rem;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: rgba(var(--v-theme-on-surface), 0.5);
  font-weight: 600;
}

.chat-message-text {
  font-size: 0.92rem;
  line-height: 1.55;
  color: rgba(var(--v-theme-on-surface), 0.9);
  white-space: pre-wrap;
  margin: 0;
}

.chat-message-facts {
  padding-left: 16px;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
  color: rgba(var(--v-theme-on-surface), 0.7);
  font-size: 0.84rem;
  line-height: 1.45;
}

.chat-message-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin-top: 8px;
}

/* Error banner */
.chat-error {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-radius: 10px;
  background: rgba(var(--v-theme-error), 0.1);
  color: rgba(var(--v-theme-error), 1);
  font-size: 0.84rem;
  flex-shrink: 0;
}

/* Composer — always at bottom */
.chat-composer {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px 12px;
  border-radius: 16px;
  border: 1px solid rgba(var(--v-border-color), 0.16);
  background: rgba(var(--v-theme-surface-light), 0.56);
  flex-shrink: 0;
}

.chat-composer-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.chat-composer-hint {
  font-size: 0.74rem;
  color: rgba(var(--v-theme-on-surface), 0.5);
}

@media (max-width: 600px) {
  .chat-view {
    height: calc(100dvh - 220px);
  }

  .chat-composer-foot {
    flex-direction: column;
    align-items: stretch;
  }
}
</style>
