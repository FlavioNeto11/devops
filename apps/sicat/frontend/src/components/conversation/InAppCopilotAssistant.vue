<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import { useInAppCopilot } from '../../composables/useInAppCopilot.js';
import StructuredMessageContent from './StructuredMessageContent.vue';
import ConversationResultRenderer from './ConversationResultRenderer.vue';

const {
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
} = useInAppCopilot();

const threadRef = ref(null);
const composerRef = ref(null);
const panelLabelId = 'inapp-copilot-title';

const launcherLabel = computed(() => (isOpen.value ? 'Fechar copiloto contextual' : 'Abrir copiloto contextual'));
const launcherTitle = computed(() => `${launcherLabel.value} · arraste para reposicionar`);
const scopeBadgeTone = computed(() => (hasOperationalContext.value ? 'success' : 'warning'));
const scopeBadgeLabel = computed(() => (hasOperationalContext.value ? 'Conta ativa pronta' : 'Contexto incompleto'));

// ─── Launcher arrastável (posição livre, persistida em localStorage) ───
const LAUNCHER_POS_KEY = 'sicat_copilot_launcher_pos';
const launcherRef = ref(null);
const launcherPos = ref(null);
const dragState = ref({ active: false, moved: false, startX: 0, startY: 0, offsetX: 0, offsetY: 0 });

const launcherStyle = computed(() => {
  if (!launcherPos.value) {
    return {};
  }
  return {
    left: `${launcherPos.value.left}px`,
    top: `${launcherPos.value.top}px`,
    right: 'auto',
    bottom: 'auto'
  };
});

function resolveLauncherEl() {
  const el = launcherRef.value?.$el || launcherRef.value;
  return el instanceof globalThis.HTMLElement ? el : null;
}

function clampToViewport(left, top) {
  const el = resolveLauncherEl();
  const width = el?.offsetWidth || 160;
  const height = el?.offsetHeight || 54;
  const maxLeft = Math.max(8, globalThis.innerWidth - width - 8);
  const maxTop = Math.max(8, globalThis.innerHeight - height - 8);
  return {
    left: Math.min(Math.max(8, left), maxLeft),
    top: Math.min(Math.max(8, top), maxTop)
  };
}

function onLauncherPointerMove(event) {
  if (!dragState.value.active) {
    return;
  }
  const dx = event.clientX - dragState.value.startX;
  const dy = event.clientY - dragState.value.startY;
  if (!dragState.value.moved && Math.hypot(dx, dy) > 5) {
    dragState.value.moved = true;
  }
  if (dragState.value.moved) {
    launcherPos.value = clampToViewport(
      event.clientX - dragState.value.offsetX,
      event.clientY - dragState.value.offsetY
    );
  }
}

function onLauncherPointerUp() {
  globalThis.removeEventListener('pointermove', onLauncherPointerMove);
  globalThis.removeEventListener('pointerup', onLauncherPointerUp);
  dragState.value.active = false;
  if (dragState.value.moved && launcherPos.value) {
    try {
      globalThis.localStorage?.setItem(LAUNCHER_POS_KEY, JSON.stringify(launcherPos.value));
    } catch {
      /* persistência best-effort */
    }
  }
}

function onLauncherPointerDown(event) {
  if (event.pointerType === 'mouse' && event.button !== 0) {
    return;
  }
  const el = resolveLauncherEl();
  if (!el) {
    return;
  }
  const rect = el.getBoundingClientRect();
  dragState.value = {
    active: true,
    moved: false,
    startX: event.clientX,
    startY: event.clientY,
    offsetX: event.clientX - rect.left,
    offsetY: event.clientY - rect.top
  };
  globalThis.addEventListener('pointermove', onLauncherPointerMove);
  globalThis.addEventListener('pointerup', onLauncherPointerUp);
}

function loadLauncherPos() {
  try {
    const raw = globalThis.localStorage?.getItem(LAUNCHER_POS_KEY);
    if (!raw) {
      return;
    }
    const parsed = JSON.parse(raw);
    if (typeof parsed?.left === 'number' && typeof parsed?.top === 'number') {
      launcherPos.value = clampToViewport(parsed.left, parsed.top);
    }
  } catch {
    /* ignora posição inválida */
  }
}

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

function handleEscape(event) {
  if (event.key === 'Escape' && isOpen.value) {
    closePanel();
  }
}

async function handleLauncherClick() {
  // Se o clique foi o fim de um arraste, apenas reposiciona — não abre/fecha o painel.
  if (dragState.value.moved) {
    dragState.value.moved = false;
    return;
  }
  const willOpen = !isOpen.value;
  togglePanel();

  if (willOpen) {
    await scrollThreadToBottom();
    await focusComposer();
  }
}

async function submitComposer() {
  await sendMessage(draft.value);
  await scrollThreadToBottom();
}

async function onQuickAction(action) {
  await handleAction(action);
  await scrollThreadToBottom();
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
    void submitComposer();
  }
}

watch(
  () => messages.value.length,
  async () => {
    await scrollThreadToBottom();
  }
);

watch(
  () => isOpen.value,
  async (opened) => {
    if (!opened) {
      return;
    }

    await scrollThreadToBottom();
    await focusComposer();
  }
);

onMounted(() => {
  globalThis.addEventListener('keydown', handleEscape);
  loadLauncherPos();
});

onUnmounted(() => {
  globalThis.removeEventListener('keydown', handleEscape);
  globalThis.removeEventListener('pointermove', onLauncherPointerMove);
  globalThis.removeEventListener('pointerup', onLauncherPointerUp);
});
</script>

<template>
  <div class="copilot-shell">
    <v-btn
      ref="launcherRef"
      class="copilot-launcher"
      :class="{ 'copilot-launcher--dragging': dragState.active }"
      :style="launcherStyle"
      color="primary"
      size="large"
      elevation="12"
      :aria-label="launcherLabel"
      :title="launcherTitle"
      @pointerdown="onLauncherPointerDown"
      @click="handleLauncherClick"
    >
      <v-icon start>{{ isOpen ? 'mdi-close' : 'mdi-headset' }}</v-icon>
      Copiloto
    </v-btn>

    <transition name="copilot-fade">
      <button v-if="isOpen" class="copilot-backdrop" type="button" aria-label="Fechar painel do copiloto" @click="closePanel" />
    </transition>

    <transition name="copilot-panel-transition">
      <dialog
        v-if="isOpen"
        open
        class="copilot-panel"
        :aria-labelledby="panelLabelId"
      >
        <header class="copilot-panel-header">
          <div class="copilot-panel-header-main">
            <h2 :id="panelLabelId" class="copilot-panel-title">{{ currentScreenContext.pageTitle }}</h2>
            <div class="copilot-context-line">
              <v-icon size="13" color="on-surface-variant">mdi-domain</v-icon>
              <span class="copilot-context-account">{{ currentScreenContext.activeAccountLabel }}</span>
              <v-chip :color="scopeBadgeTone" size="x-small" variant="tonal">{{ scopeBadgeLabel }}</v-chip>
            </div>
          </div>

          <div class="copilot-panel-actions">
            <v-btn
              icon="mdi-refresh"
              variant="text"
              density="compact"
              aria-label="Limpar conversa"
              title="Limpar conversa"
              @click="resetConversation()"
            />
            <v-btn
              icon="mdi-close"
              variant="text"
              density="compact"
              aria-label="Fechar copiloto"
              title="Fechar copiloto"
              @click="closePanel"
            />
          </div>
        </header>

        <section class="copilot-actions-strip" aria-label="Atalhos sugeridos do copiloto">
          <button
            v-for="action in quickActions"
            :key="action.id"
            type="button"
            class="copilot-action-pill"
            @click="onQuickAction(action)"
          >
            <v-icon size="16">{{ action.icon || 'mdi-lightning-bolt-outline' }}</v-icon>
            <span>{{ action.label }}</span>
          </button>
        </section>

        <section ref="threadRef" class="copilot-thread" aria-live="polite">
          <article
            v-for="message in messages"
            :key="message.id"
            class="copilot-message"
            :class="[`copilot-message-${message.role}`, `copilot-status-${message.status || 'ready'}`]"
          >
            <div class="copilot-message-meta">
              {{ message.role === 'user' ? 'Você' : 'Copiloto' }}
            </div>

            <div class="copilot-message-text">
              <StructuredMessageContent :text="message.text" />
            </div>

            <ConversationResultRenderer
              :message="message"
              @action="onMessageAction"
              @download-artifact="onMessageArtifactDownload"
            />

            <ul v-if="message.facts.length" class="copilot-message-facts">
              <li v-for="fact in message.facts" :key="fact">{{ fact }}</li>
            </ul>

            <div v-if="message.actions.length" class="copilot-message-actions">
              <v-btn
                v-for="action in message.actions"
                :key="action.id || action.label"
                variant="tonal"
                color="primary"
                size="small"
                @click="onMessageAction(action)"
              >
                {{ action.label }}
              </v-btn>
            </div>


          </article>
        </section>

        <div v-if="error" class="copilot-error-banner">
          <v-icon size="16">mdi-alert-circle-outline</v-icon>
          <span>{{ error }}</span>
        </div>

        <form class="copilot-composer" @submit.prevent="submitComposer">
          <v-textarea
            ref="composerRef"
            v-model="draft"
            class="copilot-composer-input"
            :placeholder="composerPlaceholder"
            rows="2"
            max-rows="5"
            auto-grow
            hide-details
            variant="solo-filled"
            flat
            :disabled="isSubmitting"
            @keydown="onComposerKeydown"
          />

          <div class="copilot-composer-footer">
            <span class="copilot-composer-hint">Consulta contexto da rota atual, respeitando conta ativa e policy consultiva.</span>
            <v-btn color="primary" :loading="isSubmitting" :disabled="!draft.trim()" type="submit">
              Enviar
            </v-btn>
          </div>
        </form>
      </dialog>
    </transition>
  </div>
</template>

<style scoped>
.copilot-shell {
  position: relative;
  z-index: 220;
}

.copilot-launcher {
  position: fixed;
  right: clamp(18px, 2.5vw, 30px);
  bottom: clamp(18px, 2.8vw, 30px);
  min-height: 54px;
  padding-inline: 18px;
  border-radius: 18px;
  background: linear-gradient(135deg, rgba(var(--v-theme-primary), 0.96) 0%, rgba(var(--v-theme-info), 0.86) 100%);
  color: rgb(var(--v-theme-on-primary));
  box-shadow: 0 20px 48px rgba(6, 50, 41, 0.28);
  cursor: grab;
  user-select: none;
  touch-action: none;
}

.copilot-launcher--dragging {
  cursor: grabbing;
  opacity: 0.92;
  box-shadow: 0 26px 60px rgba(6, 50, 41, 0.36);
}

.copilot-backdrop {
  position: fixed;
  inset: 0;
  border: 0;
  background: rgba(6, 15, 12, 0.32);
  backdrop-filter: blur(6px);
}

.copilot-panel {
  position: fixed;
  top: 18px;
  right: 18px;
  bottom: 18px;
  width: min(440px, calc(100vw - 36px));
  height: min(860px, calc(100dvh - 36px));
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 18px;
  border: 1px solid rgba(var(--v-border-color), 0.18);
  border-radius: 28px;
  background:
    radial-gradient(circle at top right, rgba(var(--v-theme-primary), 0.12), transparent 34%),
    radial-gradient(circle at top left, rgba(var(--v-theme-info), 0.08), transparent 28%),
    rgba(var(--v-theme-surface), 0.96);
  box-shadow: 0 28px 80px rgba(8, 24, 19, 0.28);
  backdrop-filter: blur(22px);
  overflow: hidden;
}

.copilot-panel-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}

.copilot-panel-header-main {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}

.copilot-panel-title {
  color: rgba(var(--v-theme-on-surface), 0.96);
  font-family: 'Manrope', var(--font-family-display, sans-serif);
  font-size: 1.1rem;
  line-height: 1.2;
  margin: 0;
}

.copilot-context-line {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.8rem;
  color: rgba(var(--v-theme-on-surface), 0.7);
}

.copilot-context-account {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 180px;
}

.copilot-panel-actions {
  display: flex;
  align-items: center;
  gap: 2px;
  flex-shrink: 0;
}

.copilot-actions-strip {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.copilot-action-pill {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-height: 38px;
  padding: 0 14px;
  border: 1px solid rgba(var(--v-theme-primary), 0.14);
  border-radius: 999px;
  background: rgba(var(--v-theme-surface), 0.88);
  color: rgba(var(--v-theme-on-surface), 0.86);
  font-size: 0.87rem;
  font-weight: 600;
  transition: transform 0.16s ease, border-color 0.16s ease, box-shadow 0.16s ease;
}

.copilot-action-pill:hover,
.copilot-action-pill:focus-visible {
  transform: translateY(-1px);
  border-color: rgba(var(--v-theme-primary), 0.28);
  box-shadow: 0 10px 22px rgba(var(--v-theme-primary), 0.12);
}

.copilot-thread {
  display: grid;
  flex: 1 1 auto;
  gap: 12px;
  min-height: 0;
  padding-right: 4px;
  overflow-y: auto;
}

.copilot-message {
  display: grid;
  gap: 10px;
  padding: 14px;
  border-radius: 22px;
  border: 1px solid rgba(var(--v-border-color), 0.14);
  background: rgba(var(--v-theme-surface), 0.92);
}

.copilot-message-user {
  justify-self: end;
  background: linear-gradient(135deg, rgba(var(--v-theme-primary), 0.14) 0%, rgba(var(--v-theme-info), 0.1) 100%);
}

.copilot-message-assistant {
  justify-self: stretch;
}

.copilot-message-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  color: rgba(var(--v-theme-on-surface), 0.58);
  font-size: 0.74rem;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

.copilot-message-text {
  color: rgba(var(--v-theme-on-surface), 0.9);
  font-size: 0.95rem;
  line-height: 1.55;
  white-space: pre-wrap;
}

.copilot-message-facts {
  display: grid;
  gap: 8px;
  padding-left: 18px;
  color: rgba(var(--v-theme-on-surface), 0.76);
  font-size: 0.88rem;
  line-height: 1.45;
}

.copilot-message-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.copilot-error-banner {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  border-radius: 14px;
  background: rgba(var(--v-theme-error), 0.1);
  color: rgba(var(--v-theme-error), 1);
  font-size: 0.84rem;
}

.copilot-composer {
  display: grid;
  gap: 10px;
  padding: 14px;
  border: 1px solid rgba(var(--v-border-color), 0.16);
  border-radius: 22px;
  background: rgba(var(--v-theme-surface), 0.9);
}

.copilot-composer-input :deep(textarea) {
  font-size: 0.94rem;
  line-height: 1.5;
}

.copilot-composer-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.copilot-composer-hint {
  color: rgba(var(--v-theme-on-surface), 0.56);
  font-size: 0.77rem;
  line-height: 1.35;
}

.copilot-fade-enter-active,
.copilot-fade-leave-active {
  transition: opacity 0.22s ease;
}

.copilot-fade-enter-from,
.copilot-fade-leave-to {
  opacity: 0;
}

.copilot-panel-transition-enter-active,
.copilot-panel-transition-leave-active {
  transition: opacity 0.24s ease, transform 0.24s ease;
}

.copilot-panel-transition-enter-from,
.copilot-panel-transition-leave-to {
  opacity: 0;
  transform: translate3d(18px, 0, 0);
}

@media (max-width: 960px) {
  .copilot-launcher {
    right: 14px;
    bottom: 14px;
    min-height: 50px;
    padding-inline: 16px;
  }

  .copilot-panel {
    top: 10px;
    right: 10px;
    left: 10px;
    bottom: 10px;
    width: auto;
    border-radius: 24px;
  }
}

@media (max-width: 640px) {
  .copilot-panel {
    padding: 14px;
  }

  .copilot-composer-footer {
    flex-direction: column;
    align-items: stretch;
  }
}
</style>
