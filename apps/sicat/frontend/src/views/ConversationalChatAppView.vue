<script setup>
import { computed, nextTick, onMounted, ref, watch } from 'vue';
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
  focusedManifestId,
  focusedJobId,
  accountLabel,
  operationalScopeReady,
  canRegenerate,
  clearConversation,
  sendMessage,
  sendFeedback,
  regenerateLast,
  cancelCurrent,
  runQuickAction,
  handleAction,
  downloadArtifact
} = useConversationalChatApp();

const threadRef = ref(null);
const composerRef = ref(null);
const copyState = ref('idle');
const copiedMessageId = ref('');
// Auto-scroll inteligente: só acompanha o fim se o usuário JÁ está perto do fim.
// Se ele rolou para cima lendo algo, não roubamos a posição — mostramos o botão.
const isNearBottom = ref(true);

// Foco operacional (manifesto/job): alimenta as ações guiadas que exigem
// contexto e é enviado ao backend em todo turno (context.manifestId/jobId).
const focusMenuOpen = ref(false);
const focusManifestDraft = ref('');
const focusJobDraft = ref('');

const hasFocus = computed(() => Boolean(focusedManifestId.value || focusedJobId.value));

const lastAssistantId = computed(() => {
  for (let index = messages.value.length - 1; index >= 0; index -= 1) {
    const message = messages.value[index];
    if (message.role === 'assistant') {
      return message.id;
    }
  }
  return '';
});

function formatTime(iso) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

function updateNearBottom() {
  const el = threadRef.value;
  if (!el) return;
  isNearBottom.value = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
}

async function scrollThreadToBottom({ force = false } = {}) {
  if (!force && !isNearBottom.value) return;
  await nextTick();
  const el = threadRef.value;
  if (!el) return;
  el.scrollTop = el.scrollHeight;
  isNearBottom.value = true;
}

async function focusComposer() {
  await nextTick();
  const textarea = composerRef.value?.$el?.querySelector('textarea') || composerRef.value?.$el?.querySelector('input');
  if (typeof textarea?.focus === 'function') {
    textarea.focus();
  }
}

async function onSubmitComposer() {
  await scrollThreadToBottom({ force: true });
  await sendMessage(draft.value);
  await scrollThreadToBottom({ force: true });
  await focusComposer();
}

async function onQuickAction(action) {
  await runQuickAction(action);
  await scrollThreadToBottom({ force: true });
  await focusComposer();
}

async function onRegenerate() {
  await regenerateLast();
  await scrollThreadToBottom({ force: true });
}

async function writeClipboard(text) {
  try {
    await globalThis.navigator?.clipboard?.writeText(text);
    return true;
  } catch {
    // Fallback para contextos sem Clipboard API (http, permissões).
    try {
      const textarea = globalThis.document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      globalThis.document.body.appendChild(textarea);
      textarea.select();
      globalThis.document.execCommand('copy');
      textarea.remove();
      return true;
    } catch {
      return false;
    }
  }
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

  const ok = await writeClipboard(JSON.stringify(payload, null, 2));
  copyState.value = ok ? 'copied' : 'error';
  globalThis.setTimeout(() => {
    copyState.value = 'idle';
  }, 1800);
}

async function copyMessageText(message) {
  const ok = await writeClipboard(message.text || '');
  if (ok) {
    copiedMessageId.value = message.id;
    globalThis.setTimeout(() => {
      if (copiedMessageId.value === message.id) {
        copiedMessageId.value = '';
      }
    }, 1800);
  }
}

function openFocusMenu() {
  focusManifestDraft.value = focusedManifestId.value;
  focusJobDraft.value = focusedJobId.value;
  focusMenuOpen.value = true;
}

function applyFocus() {
  focusedManifestId.value = focusManifestDraft.value.trim();
  focusedJobId.value = focusJobDraft.value.trim();
  focusMenuOpen.value = false;
}

function clearFocus() {
  focusedManifestId.value = '';
  focusedJobId.value = '';
  focusManifestDraft.value = '';
  focusJobDraft.value = '';
  focusMenuOpen.value = false;
}

async function onMessageAction(action) {
  await handleAction(action);
  await scrollThreadToBottom({ force: true });
}

async function onMessageArtifactDownload(artifact) {
  await downloadArtifact(artifact);
  await scrollThreadToBottom({ force: true });
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
  await scrollThreadToBottom({ force: true });
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

        <!-- Foco operacional: contexto de manifesto/job enviado a cada turno -->
        <v-menu v-model="focusMenuOpen" :close-on-content-click="false" location="bottom start">
          <template #activator="{ props: menuProps }">
            <button
              v-bind="menuProps"
              type="button"
              class="chat-focus-chip"
              :class="{ 'chat-focus-chip--active': hasFocus }"
              :title="hasFocus ? 'Editar foco operacional' : 'Definir manifesto/job em foco para as ações guiadas'"
              @click="openFocusMenu"
            >
              <v-icon size="13">{{ hasFocus ? 'mdi-target' : 'mdi-target-variant' }}</v-icon>
              <span v-if="focusedManifestId">MTR {{ focusedManifestId }}</span>
              <span v-if="focusedJobId">Job {{ focusedJobId }}</span>
              <span v-if="!hasFocus">Definir foco</span>
            </button>
          </template>
          <v-card class="chat-focus-card" elevation="4">
            <p class="chat-focus-title">Foco operacional</p>
            <p class="chat-focus-hint">
              O assistente usa este contexto nas consultas (ex.: "Detalhe de manifesto").
            </p>
            <v-text-field
              v-model="focusManifestDraft"
              label="Manifesto (MTR) em foco"
              density="compact"
              hide-details
              clearable
            />
            <v-text-field
              v-model="focusJobDraft"
              label="Job em foco"
              density="compact"
              hide-details
              clearable
            />
            <div class="chat-focus-actions">
              <v-btn size="small" variant="text" @click="clearFocus">Limpar</v-btn>
              <v-btn size="small" color="primary" variant="flat" @click="applyFocus">Aplicar</v-btn>
            </div>
          </v-card>
        </v-menu>
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
          icon="mdi-broom"
          size="small"
          variant="text"
          density="compact"
          title="Nova conversa (limpa o histórico desta aba)"
          aria-label="Nova conversa"
          :disabled="!messages.length"
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

    <!-- Quick action pills (com conversa em andamento) -->
    <div v-if="messages.length && quickActions.length" class="chat-quick-pills" aria-label="Ações guiadas">
      <button
        v-for="action in quickActions"
        :key="action.id"
        type="button"
        class="chat-pill"
        :disabled="isSubmitting"
        :title="action.description"
        @click="onQuickAction(action)"
      >
        <v-icon v-if="action.icon" size="13">{{ action.icon }}</v-icon>
        {{ action.title }}
      </button>
    </div>

    <!-- Thread -->
    <div class="chat-thread-wrap">
      <section
        ref="threadRef"
        class="chat-thread"
        aria-live="polite"
        aria-label="Conversa"
        @scroll.passive="updateNearBottom"
      >
        <!-- Estado vazio: hero clean + sugestões em cards (sem mensagem fake) -->
        <div v-if="!messages.length" class="chat-empty">
          <div class="chat-empty-icon">
            <v-icon size="26" color="primary">mdi-message-text-outline</v-icon>
          </div>
          <h2 class="chat-empty-title">Como posso ajudar?</h2>
          <p class="chat-empty-sub">
            Consultas operacionais sobre manifestos, jobs, auditoria e dashboard —
            sempre no contexto da conta CETESB ativa.
          </p>
          <p class="chat-empty-disclosure">
            Respostas geradas por IA podem conter erros — confira antes de agir.
          </p>
          <div class="chat-empty-grid">
            <button
              v-for="action in quickActions"
              :key="action.id"
              type="button"
              class="chat-suggestion"
              :disabled="isSubmitting"
              @click="onQuickAction(action)"
            >
              <v-icon size="18" class="chat-suggestion-icon">{{ action.icon }}</v-icon>
              <span class="chat-suggestion-title">{{ action.title }}</span>
              <span class="chat-suggestion-desc">{{ action.description }}</span>
            </button>
          </div>
        </div>

        <article
          v-for="message in messages"
          :key="message.id"
          class="chat-message"
          :class="[`chat-message--${message.role}`, `chat-message--${message.status || 'ready'}`]"
        >
          <div class="chat-message-meta">
            <span>{{ message.role === 'user' ? 'Você' : 'Assistente' }}</span>
            <time v-if="message.createdAt" class="chat-message-time">{{ formatTime(message.createdAt) }}</time>
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

          <!-- Toolbar da resposta: feedback, copiar e regenerar (na última) -->
          <div
            v-if="message.role === 'assistant' && message.status !== 'loading'"
            class="chat-message-toolbar"
          >
            <template v-if="message.correlationId">
              <v-btn
                :icon="message.feedback === 'positive' ? 'mdi-thumb-up' : 'mdi-thumb-up-outline'"
                :color="message.feedback === 'positive' ? 'success' : undefined"
                variant="text"
                size="x-small"
                density="compact"
                aria-label="Resposta útil"
                @click="sendFeedback(message, 'positive')"
              />
              <v-btn
                :icon="message.feedback === 'negative' ? 'mdi-thumb-down' : 'mdi-thumb-down-outline'"
                :color="message.feedback === 'negative' ? 'error' : undefined"
                variant="text"
                size="x-small"
                density="compact"
                aria-label="Resposta não útil"
                @click="sendFeedback(message, 'negative')"
              />
            </template>
            <v-btn
              v-if="message.text"
              :icon="copiedMessageId === message.id ? 'mdi-check' : 'mdi-content-copy'"
              :color="copiedMessageId === message.id ? 'success' : undefined"
              variant="text"
              size="x-small"
              density="compact"
              :title="copiedMessageId === message.id ? 'Copiado!' : 'Copiar esta resposta'"
              aria-label="Copiar esta resposta"
              @click="copyMessageText(message)"
            />
            <v-btn
              v-if="message.id === lastAssistantId && canRegenerate"
              icon="mdi-refresh"
              variant="text"
              size="x-small"
              density="compact"
              title="Regenerar resposta (reenvia a última pergunta)"
              aria-label="Regenerar resposta"
              @click="onRegenerate"
            />
          </div>
        </article>

        <!-- Indicador de processamento -->
        <div v-if="isSubmitting" class="chat-message chat-message--assistant chat-message--loading">
          <div class="chat-message-meta"><span>Assistente</span></div>
          <div class="chat-typing" aria-label="Assistente processando">
            <span class="chat-typing-dot" /><span class="chat-typing-dot" /><span class="chat-typing-dot" />
            <span class="chat-typing-label">Consultando o backend operacional…</span>
          </div>
        </div>
      </section>

      <!-- Voltar ao fim da conversa (aparece quando o usuário rolou para cima) -->
      <v-btn
        v-if="!isNearBottom && messages.length"
        class="chat-jump-bottom"
        icon="mdi-arrow-down"
        size="small"
        elevation="3"
        aria-label="Ir para o fim da conversa"
        @click="scrollThreadToBottom({ force: true })"
      />
    </div>

    <!-- Error -->
    <div v-if="error" class="chat-error" role="alert">
      <v-icon size="15">mdi-alert-circle-outline</v-icon>
      <span class="chat-error-text">{{ error }}</span>
      <v-btn
        v-if="canRegenerate"
        size="x-small"
        variant="tonal"
        color="error"
        @click="onRegenerate"
      >
        Tentar de novo
      </v-btn>
    </div>

    <!-- Composer -->
    <form class="chat-composer" @submit.prevent="onSubmitComposer">
      <!-- variant="plain": o textarea fica transparente e SEM o overlay do
           solo-filled (que rendia o efeito de degradê). Quem faz o papel de
           "campo" é o cartão .chat-composer, com anel de foco no acento. -->
      <v-textarea
        ref="composerRef"
        v-model="draft"
        class="chat-composer-input"
        :placeholder="composerPlaceholder"
        rows="1"
        max-rows="6"
        auto-grow
        hide-details
        variant="plain"
        :disabled="isSubmitting"
        @keydown="onComposerKeydown"
      />
      <div class="chat-composer-foot">
        <span class="chat-composer-hint">
          Respostas geradas por IA podem conter erros — confira antes de agir. · Enter envia · Shift+Enter quebra linha · ações sensíveis pedem confirmação
        </span>
        <div class="chat-composer-buttons">
          <v-btn
            v-if="isSubmitting"
            color="error"
            size="small"
            variant="tonal"
            prepend-icon="mdi-stop"
            @click="cancelCurrent"
          >
            Parar
          </v-btn>
          <v-btn
            v-else
            color="primary"
            size="small"
            :disabled="!draft.trim()"
            type="submit"
          >
            Enviar
          </v-btn>
        </div>
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
  flex-wrap: wrap;
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

/* Foco operacional (manifesto/job) */
.chat-focus-chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 2px 10px;
  min-height: 24px;
  border: 1px dashed var(--color-border-strong);
  border-radius: 999px;
  background: transparent;
  color: rgba(var(--v-theme-on-surface), 0.66);
  font-size: 0.74rem;
  font-weight: 600;
  cursor: pointer;
  transition: border-color 0.14s ease, color 0.14s ease;
}

.chat-focus-chip:hover,
.chat-focus-chip:focus-visible {
  border-color: rgb(var(--v-theme-primary));
  color: rgb(var(--v-theme-primary));
  outline: none;
}

.chat-focus-chip--active {
  border-style: solid;
  border-color: rgba(var(--v-theme-primary), 0.4);
  background: rgba(var(--v-theme-primary), 0.08);
  color: rgb(var(--v-theme-primary));
}

.chat-focus-card {
  padding: 14px;
  display: grid;
  gap: 10px;
  width: min(320px, 90vw);
  border: 1px solid var(--color-border);
}

.chat-focus-title {
  margin: 0;
  font-size: 0.8rem;
  font-weight: 700;
}

.chat-focus-hint {
  margin: 0;
  font-size: 0.74rem;
  color: rgba(var(--v-theme-on-surface), 0.6);
}

.chat-focus-actions {
  display: flex;
  justify-content: flex-end;
  gap: 6px;
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
  border: 1px solid var(--color-border);
  border-radius: 999px;
  background: rgb(var(--v-theme-surface));
  color: rgba(var(--v-theme-on-surface), 0.84);
  font-size: 0.8rem;
  font-weight: 500;
  white-space: nowrap;
  cursor: pointer;
  transition: border-color 0.14s ease, background-color 0.14s ease;
}

.chat-pill:hover:not(:disabled),
.chat-pill:focus-visible {
  border-color: rgba(var(--v-theme-primary), 0.45);
  background: rgba(var(--v-theme-primary), 0.05);
  outline: none;
}

.chat-pill:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* Thread — fills remaining space, scrolls internally */
.chat-thread-wrap {
  position: relative;
  display: flex;
  flex: 1 1 0;
  min-height: 0;
}

.chat-thread {
  flex: 1 1 0;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding-right: 4px;
}

/* Estado vazio */
.chat-empty {
  margin: auto;
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 10px;
  max-width: 620px;
  padding: 24px 12px;
}

.chat-empty-icon {
  width: 52px;
  height: 52px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-md);
  background: rgba(var(--v-theme-primary), 0.08);
}

.chat-empty-title {
  margin: 0;
  font-size: 1.3rem;
  letter-spacing: -0.01em;
}

.chat-empty-sub {
  margin: 0;
  font-size: 0.88rem;
  color: rgba(var(--v-theme-on-surface), 0.6);
}

.chat-empty-disclosure {
  margin: 8px 0 0;
  font-size: 0.78rem;
  color: rgba(var(--v-theme-on-surface), 0.5);
}

.chat-empty-grid {
  margin-top: 10px;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  width: 100%;
}

.chat-suggestion {
  display: grid;
  justify-items: start;
  gap: 4px;
  padding: 12px 14px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: rgb(var(--v-theme-surface));
  text-align: left;
  cursor: pointer;
  transition: border-color 0.14s ease, background-color 0.14s ease;
}

.chat-suggestion:hover:not(:disabled),
.chat-suggestion:focus-visible {
  border-color: rgba(var(--v-theme-primary), 0.45);
  background: rgba(var(--v-theme-primary), 0.04);
  outline: none;
}

.chat-suggestion:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.chat-suggestion-icon {
  color: rgb(var(--v-theme-primary));
}

.chat-suggestion-title {
  font-size: 0.86rem;
  font-weight: 700;
  color: rgba(var(--v-theme-on-surface), 0.9);
}

.chat-suggestion-desc {
  font-size: 0.76rem;
  line-height: 1.4;
  color: rgba(var(--v-theme-on-surface), 0.58);
}

.chat-message {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 10px 14px;
  border-radius: var(--radius-md);
  border: 1px solid var(--color-border);
  max-width: 88%;
}

.chat-message--user {
  align-self: flex-end;
  background: rgba(var(--v-theme-primary), 0.08);
  border-color: rgba(var(--v-theme-primary), 0.18);
}

.chat-message--assistant {
  align-self: flex-start;
  background: rgb(var(--v-theme-surface));
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
  display: flex;
  align-items: baseline;
  gap: 8px;
  font-size: 0.69rem;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: rgba(var(--v-theme-on-surface), 0.5);
  font-weight: 600;
}

.chat-message-time {
  font-weight: 500;
  letter-spacing: 0.02em;
  opacity: 0.8;
}

.chat-message-text {
  font-size: 0.92rem;
  line-height: 1.55;
  color: rgba(var(--v-theme-on-surface), 0.9);
  white-space: pre-wrap;
  margin: 0;
}

/* Toolbar por resposta (feedback + copiar + regenerar) */
.chat-message-toolbar {
  display: flex;
  align-items: center;
  gap: 2px;
  margin-top: 2px;
  opacity: 0.55;
  transition: opacity 0.15s ease;
}

.chat-message:hover .chat-message-toolbar,
.chat-message-toolbar:focus-within {
  opacity: 1;
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

/* Indicador de processamento (digitando) */
.chat-typing {
  display: flex;
  align-items: center;
  gap: 5px;
}

.chat-typing-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: rgba(var(--v-theme-on-surface), 0.4);
  animation: chat-typing-pulse 1.2s ease-in-out infinite;
}

.chat-typing-dot:nth-child(2) {
  animation-delay: 0.18s;
}

.chat-typing-dot:nth-child(3) {
  animation-delay: 0.36s;
}

.chat-typing-label {
  margin-left: 6px;
  font-size: 0.8rem;
  color: rgba(var(--v-theme-on-surface), 0.55);
}

@keyframes chat-typing-pulse {
  0%, 60%, 100% {
    opacity: 0.35;
    transform: translateY(0);
  }
  30% {
    opacity: 1;
    transform: translateY(-3px);
  }
}

@media (prefers-reduced-motion: reduce) {
  .chat-typing-dot {
    animation: none;
  }
}

/* Voltar ao fim */
.chat-jump-bottom {
  position: absolute;
  right: 14px;
  bottom: 12px;
  z-index: 5;
}

/* Error banner */
.chat-error {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-radius: var(--radius-sm);
  background: rgba(var(--v-theme-error), 0.1);
  color: rgba(var(--v-theme-error), 1);
  font-size: 0.84rem;
  flex-shrink: 0;
}

.chat-error-text {
  flex: 1;
  min-width: 0;
}

/* Composer — always at bottom. O cartão É o campo: fundo sólido, borda token
   e anel de foco no acento enquanto se digita (sem overlay/gradiente). */
.chat-composer {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px 14px;
  border-radius: var(--radius-md);
  border: 1px solid var(--color-border);
  background: rgb(var(--v-theme-surface));
  flex-shrink: 0;
  transition: border-color 0.14s ease, box-shadow 0.14s ease;
}

.chat-composer:focus-within {
  border-color: rgba(var(--v-theme-primary), 0.5);
  box-shadow: 0 0 0 3px rgba(var(--v-theme-primary), 0.08);
}

/* Textarea nu dentro do cartão: sem fundo, sem underline, padding enxuto. */
.chat-composer-input :deep(.v-field__input) {
  padding: 4px 0 2px;
  font-size: 0.92rem;
  line-height: 1.5;
  background: transparent;
  -webkit-mask-image: none;
  mask-image: none;
}

.chat-composer-input :deep(.v-field__overlay),
.chat-composer-input :deep(.v-field__outline) {
  display: none;
}

.chat-composer-input :deep(.v-field) {
  --v-field-padding-start: 0;
  --v-field-padding-end: 0;
  --v-field-padding-top: 0;
  --v-field-padding-bottom: 0;
  background: transparent;
  box-shadow: none;
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

.chat-composer-buttons {
  display: flex;
  align-items: center;
  gap: 6px;
}

@media (max-width: 600px) {
  .chat-view {
    height: calc(100dvh - 220px);
  }

  .chat-empty-grid {
    grid-template-columns: 1fr;
  }

  .chat-composer-foot {
    flex-direction: column;
    align-items: stretch;
  }

  .chat-composer-buttons {
    justify-content: flex-end;
  }
}
</style>
