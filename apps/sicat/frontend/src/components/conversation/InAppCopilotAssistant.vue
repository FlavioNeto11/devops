<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
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
  cancelCurrent,
  sendFeedback,
  handleAction,
  downloadArtifact
} = useInAppCopilot();

const threadRef = ref(null);
const composerRef = ref(null);
const panelRef = ref(null);
const panelLabelId = 'inapp-copilot-title';

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'textarea:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])'
].join(', ');

// WCAG 2.4.3: <dialog open> não cria focus trap nativo (só showModal() faz).
// Contemos o ciclo de Tab dentro do painel para o foco não escapar para o
// conteúdo sob o backdrop enquanto o copiloto está aberto.
function getPanelFocusable() {
  const root = panelRef.value;
  if (!root || typeof root.querySelectorAll !== 'function') {
    return [];
  }
  return Array.from(root.querySelectorAll(FOCUSABLE_SELECTOR)).filter(
    (el) => el instanceof globalThis.HTMLElement && el.offsetParent !== null
  );
}

function handlePanelKeydown(event) {
  if (event.key !== 'Tab') {
    return;
  }
  const focusable = getPanelFocusable();
  if (focusable.length === 0) {
    return;
  }
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  const active = globalThis.document?.activeElement || null;
  const insidePanel = Boolean(active && panelRef.value?.contains(active));

  if (event.shiftKey) {
    if (!insidePanel || active === first) {
      event.preventDefault();
      last.focus();
    }
  } else if (!insidePanel || active === last) {
    event.preventDefault();
    first.focus();
  }
}

const route = useRoute();

// Na própria tela do assistente o lançador flutuante só atrapalha: ficava por
// cima do botão "Enviar" do chat (achado 3.4 da auditoria) e ofereceria um
// segundo caminho para a mesma conversa.
const isAssistantRoute = computed(() => route.path === '/conversacional/chat');
const showLauncher = computed(() => !isAssistantRoute.value);

// Nomenclatura única do conceito: "Assistente" (menu, aba do chat e este FAB).
const launcherLabel = computed(() => (isOpen.value ? 'Fechar o Assistente' : 'Abrir o Assistente'));
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

// Entrou na tela do assistente com o painel aberto: fecha o painel (a conversa
// continua na página, sem dois canais concorrentes sobre a mesma tela).
watch(isAssistantRoute, (onAssistantPage) => {
  if (onAssistantPage && isOpen.value) {
    closePanel();
  }
});

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
    <button
      v-if="showLauncher"
      ref="launcherRef"
      type="button"
      data-testid="copilot-launcher-btn"
      class="copilot-launcher"
      :class="{ 'copilot-launcher--dragging': dragState.active }"
      :style="launcherStyle"
      :aria-label="launcherLabel"
      :aria-expanded="isOpen"
      :title="launcherTitle"
      @pointerdown="onLauncherPointerDown"
      @click="handleLauncherClick"
    >
      <v-icon size="24" aria-hidden="true">{{ isOpen ? 'mdi-close' : 'mdi-headset' }}</v-icon>
      <span class="copilot-launcher__label" aria-hidden="true">Assistente</span>
    </button>

    <transition name="copilot-fade">
      <button v-if="isOpen" class="copilot-backdrop" type="button" aria-label="Fechar painel do assistente" @click="closePanel" />
    </transition>

    <transition name="copilot-panel-transition">
      <dialog
        v-if="isOpen"
        ref="panelRef"
        open
        class="copilot-panel"
        :aria-labelledby="panelLabelId"
        @keydown="handlePanelKeydown"
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
              aria-label="Fechar assistente"
              title="Fechar assistente"
              @click="closePanel"
            />
          </div>
        </header>

        <section class="copilot-actions-strip" aria-label="Atalhos sugeridos do assistente">
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
              {{ message.role === 'user' ? 'Você' : 'Assistente' }}
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

            <!-- F5: feedback explícito por resposta do copiloto -->
            <div
              v-if="message.role === 'assistant' && message.correlationId && message.status !== 'loading'"
              class="copilot-message-feedback"
            >
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
            </div>
          </article>
        </section>

        <div v-if="error" class="copilot-error-banner">
          <v-icon size="16">mdi-alert-circle-outline</v-icon>
          <span>{{ error }}</span>
        </div>

        <form class="copilot-composer" @submit.prevent="submitComposer">
          <!-- variant="plain": sem o overlay do solo-filled (efeito de degradê).
               O cartão .copilot-composer é o "campo" visual, com anel de foco. -->
          <v-textarea
            ref="composerRef"
            v-model="draft"
            class="copilot-composer-input"
            :placeholder="composerPlaceholder"
            rows="2"
            max-rows="5"
            auto-grow
            hide-details
            variant="plain"
            :disabled="isSubmitting"
            @keydown="onComposerKeydown"
          />

          <div class="copilot-composer-footer">
            <span class="copilot-composer-hint">Respostas geradas por IA podem conter erros — confira antes de agir. Usa o contexto da tela atual e a sua conta ativa.</span>
            <v-btn
              v-if="isSubmitting"
              color="error"
              variant="tonal"
              prepend-icon="mdi-stop"
              type="button"
              @click="cancelCurrent"
            >
              Parar
            </v-btn>
            <v-btn v-else color="primary" :disabled="!draft.trim()" type="submit">
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

/* Lançador compacto: em repouso é um círculo de 56px, medida usada pelo shell
   para reservar a faixa inferior e a calha direita (styles/base.css). O rótulo
   só se expande no hover/foco — quando o ponteiro JÁ está sobre o botão, então
   a expansão nunca surge por cima de uma ação que o operador ia clicar.
   Antes era uma pílula de ~160px que cobria a coluna de ações das tabelas. */
.copilot-launcher {
  position: fixed;
  right: var(--sicat-launcher-inset, 16px);
  bottom: var(--sicat-launcher-inset, 16px);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: var(--sicat-launcher-size, 56px);
  min-width: var(--sicat-launcher-size, 56px);
  padding-inline: calc((var(--sicat-launcher-size, 56px) - 24px) / 2);
  border: 0;
  border-radius: 999px;
  background: rgb(var(--v-theme-primary));
  color: rgb(var(--v-theme-on-primary));
  box-shadow: var(--shadow-md);
  font-family: inherit;
  font-size: 0.88rem;
  font-weight: 700;
  line-height: 1;
  cursor: grab;
  user-select: none;
  touch-action: none;
}

.copilot-launcher:hover {
  box-shadow: var(--shadow-lg);
}

.copilot-launcher__label {
  display: inline-block;
  max-width: 0;
  margin-left: 0;
  overflow: hidden;
  white-space: nowrap;
  opacity: 0;
  transition: max-width 0.18s ease, opacity 0.18s ease, margin-left 0.18s ease;
}

.copilot-launcher:hover .copilot-launcher__label,
.copilot-launcher:focus-visible .copilot-launcher__label {
  max-width: 140px;
  margin-left: 8px;
  opacity: 1;
}

.copilot-launcher:focus-visible {
  outline: 3px solid rgba(var(--v-theme-primary), 0.4);
  outline-offset: 2px;
}

.copilot-launcher--dragging {
  cursor: grabbing;
  opacity: 0.92;
  box-shadow: var(--shadow-lg);
}

.copilot-backdrop {
  position: fixed;
  inset: 0;
  border: 0;
  background: rgba(6, 15, 12, 0.32);
  backdrop-filter: blur(6px);
}

/* O UA stylesheet do <dialog> aplica `left: 0` + `margin: auto`. Com `right`
   e `width` definidos aqui, a caixa ficava SOBRE-RESTRINGIDA e o navegador
   redistribuía as margens automáticas — o painel abria deslocado para a
   esquerda (por cima da navegação) mesmo com o botão à direita. Zerar a margem
   e liberar `left` devolve a ancoragem à direita, do lado do lançador. */
.copilot-panel {
  position: fixed;
  top: 18px;
  right: 18px;
  bottom: 18px;
  left: auto;
  margin: 0;
  /* O UA também define `color: CanvasText` (preto), que ignora o tema do app. */
  color: rgba(var(--v-theme-on-surface), 0.92);
  width: min(440px, calc(100vw - 36px));
  height: min(860px, calc(100dvh - 36px));
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 18px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  background: rgb(var(--v-theme-surface));
  box-shadow: var(--shadow-lg);
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
  background: rgba(var(--v-theme-primary), 0.08);
  border-color: rgba(var(--v-theme-primary), 0.18);
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

.copilot-message-feedback {
  display: flex;
  gap: 2px;
  margin-top: 2px;
  opacity: 0.55;
  transition: opacity 0.15s ease;
}

.copilot-message:hover .copilot-message-feedback,
.copilot-message-feedback:focus-within {
  opacity: 1;
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
  padding: 12px 14px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: rgb(var(--v-theme-surface));
  transition: border-color 0.14s ease, box-shadow 0.14s ease;
}

.copilot-composer:focus-within {
  border-color: rgba(var(--v-theme-primary), 0.5);
  box-shadow: 0 0 0 3px rgba(var(--v-theme-primary), 0.08);
}

/* Textarea nu dentro do cartão: sem fundo, sem underline, padding enxuto. */
.copilot-composer-input :deep(.v-field__input) {
  padding: 4px 0 2px;
  font-size: 0.94rem;
  line-height: 1.5;
  background: transparent;
  -webkit-mask-image: none;
  mask-image: none;
}

.copilot-composer-input :deep(.v-field__overlay),
.copilot-composer-input :deep(.v-field__outline) {
  display: none;
}

.copilot-composer-input :deep(.v-field) {
  --v-field-padding-start: 0;
  --v-field-padding-end: 0;
  --v-field-padding-top: 0;
  --v-field-padding-bottom: 0;
  background: transparent;
  box-shadow: none;
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
