<!--
  AssistantView — Assistente Contábil IA (REQ-CONTAVIVA360-0007)
  Chat com IA contábil: histórico, upload drag-and-drop, tools_used badges,
  citações, card de rascunho com "Confirmar e Salvar", status de saúde no header.
  Fail-closed (503 → offline banner). Usa SÓ kit ui-vue + tokens --ui-*.
-->
<template>
  <UiPageLayout
    eyebrow="ContaViva 360 · IA"
    title="Assistente Contábil IA"
    subtitle="Pergunte sobre obrigações fiscais, documentos e escrituração. Anexe arquivos para análise."
    width="wide"
  >
    <!-- Header: status de saúde da IA (oculto durante o checking inicial para evitar redundância visual) -->
    <template #actions>
      <div v-show="health !== 'checking'" class="asv-health-row">
        <span class="asv-health-dot" :data-tone="healthTone" aria-hidden="true" />
        <span class="asv-health-label" :data-tone="healthTone">{{ healthLabel }}</span>
        <UiButton
          variant="ghost"
          size="sm"
          :disabled="health === 'checking'"
          @click="checkHealth"
        >
          Verificar
        </UiButton>
      </div>
      <UiButton
        variant="ghost"
        size="sm"
        :disabled="!messages.length"
        @click="clearAll"
      >
        Limpar conversa
      </UiButton>
    </template>

    <!-- ESTADO: verificando conexão com a IA -->
    <UiCard v-if="health === 'checking'">
      <UiLoadingState title="Verificando disponibilidade do assistente…" />
    </UiCard>

    <!-- ESTADO: offline / fail-closed -->
    <UiCard v-else-if="health === 'offline'">
      <UiEmptyState
        icon="plug"
        title="Assistente indisponível"
        description="O provedor de IA não está acessível nesta instalação (fail-closed). Configure o provedor para habilitar o assistente."
      >
        <template #action>
          <UiButton variant="ghost" @click="checkHealth">Tentar novamente</UiButton>
        </template>
      </UiEmptyState>
    </UiCard>

    <!-- ESTADO: erro desconhecido na saúde -->
    <UiCard v-else-if="health === 'error'">
      <UiErrorState
        message="Não foi possível verificar o status do assistente."
        :retryable="true"
        @retry="checkHealth"
      />
    </UiCard>

    <!-- ESTADO: online — chat completo -->
    <div v-else class="asv-layout">

      <!-- Área do chat -->
      <UiCard class="asv-chat-card">
        <template #actions>
          <UiStatusBadge
            :status="health"
            :label="healthLabel"
            :tone="healthTone"
            :with-dot="true"
            size="sm"
          />
        </template>

        <!-- Log de mensagens -->
        <div
          ref="logEl"
          class="asv-log"
          role="log"
          aria-live="polite"
          aria-label="Histórico da conversa com o assistente contábil"
        >
          <!-- Estado vazio -->
          <UiEmptyState
            v-if="!messages.length && !thinking"
            icon="✨"
            title="Como posso ajudar?"
            description="Escreva sua dúvida contábil ou fiscal. Anexe documentos (PDF, planilha, imagem) para análise contextual."
          />

          <!-- Mensagens da conversa -->
          <article
            v-for="msg in messages"
            :key="msg.id"
            class="asv-msg"
            :data-role="msg.role"
          >
            <!-- Avatar -->
            <div class="asv-avatar" aria-hidden="true">
              <span class="asv-avatar-icon">{{ msg.role === 'user' ? '🧑' : '🤖' }}</span>
            </div>

            <!-- Corpo da mensagem -->
            <div class="asv-msg-body">
              <p class="asv-msg-author">
                {{ msg.role === 'user' ? 'Você' : 'Assistente Contábil' }}
                <time v-if="msg.ts" class="asv-msg-time" :datetime="msg.ts">{{ fmtTime(msg.ts) }}</time>
              </p>

              <!-- Erro na mensagem -->
              <div v-if="msg.error" class="asv-msg-error" role="alert">
                <span class="asv-error-icon" aria-hidden="true">⚠</span>
                <p>{{ msg.error }}</p>
              </div>

              <!-- Conteúdo normal -->
              <template v-else>
                <!-- Parágrafos do texto -->
                <p
                  v-for="(para, pi) in splitParas(msg.text)"
                  :key="pi"
                  class="asv-msg-text"
                >{{ para }}</p>

                <!-- Arquivos enviados (user) -->
                <ul v-if="msg.files && msg.files.length && msg.role === 'user'" class="asv-attached-files">
                  <li v-for="(f, fi) in msg.files" :key="fi" class="asv-attached-file">
                    <span class="asv-file-icon" aria-hidden="true">📎</span>
                    <span class="asv-file-name">{{ f }}</span>
                  </li>
                </ul>

                <!-- Ferramentas usadas pela IA (tools_used) -->
                <div v-if="msg.toolsUsed && msg.toolsUsed.length" class="asv-tools" aria-label="Ferramentas utilizadas">
                  <span class="asv-tools-label">Ferramentas:</span>
                  <span
                    v-for="tool in msg.toolsUsed"
                    :key="tool"
                    class="asv-tool-badge"
                    role="img"
                    :aria-label="'Ferramenta: ' + tool"
                  >{{ toolLabel(tool) }}</span>
                </div>

                <!-- Citações -->
                <ol v-if="msg.citations && msg.citations.length" class="asv-citations" aria-label="Citações e fontes">
                  <li
                    v-for="(cit, ci) in msg.citations"
                    :key="ci"
                    class="asv-citation"
                  >
                    <span class="asv-citation-ref">[{{ ci + 1 }}]</span>
                    <span class="asv-citation-text">{{ cit.text || cit }}</span>
                    <span v-if="cit.source" class="asv-citation-source">— {{ cit.source }}</span>
                  </li>
                </ol>

                <!-- Card de rascunho (draft) -->
                <div v-if="msg.draft" class="asv-draft-card" role="region" aria-label="Rascunho gerado pelo assistente">
                  <div class="asv-draft-header">
                    <span class="asv-draft-icon" aria-hidden="true">📄</span>
                    <div>
                      <p class="asv-draft-title">{{ msg.draft.title || 'Rascunho gerado' }}</p>
                      <p class="asv-draft-desc">{{ msg.draft.description || 'Revise o conteúdo abaixo antes de confirmar.' }}</p>
                    </div>
                  </div>
                  <pre class="asv-draft-content">{{ msg.draft.content }}</pre>
                  <div class="asv-draft-actions">
                    <UiButton
                      variant="primary"
                      size="sm"
                      :loading="confirmingDraft === msg.id"
                      :disabled="!!confirmingDraft"
                      @click="handleConfirmDraft(msg)"
                    >
                      Confirmar e Salvar
                    </UiButton>
                    <UiButton
                      variant="ghost"
                      size="sm"
                      :disabled="!!confirmingDraft"
                      @click="dismissDraft(msg)"
                    >
                      Descartar
                    </UiButton>
                  </div>
                </div>

                <!-- Ficheiros processados pela IA (response.files) -->
                <ul v-if="msg.processedFiles && msg.processedFiles.length" class="asv-processed-files" aria-label="Arquivos processados">
                  <li
                    v-for="(f, fi) in msg.processedFiles"
                    :key="fi"
                    class="asv-processed-file"
                    :data-status="f.status"
                  >
                    <span class="asv-pf-icon" aria-hidden="true">{{ f.status === 'error' ? '❌' : '✅' }}</span>
                    <span class="asv-pf-name">{{ f.path || f.name }}</span>
                    <span class="asv-pf-meta">{{ f.type || '' }}{{ f.status ? ' · ' + f.status : '' }}</span>
                  </li>
                </ul>
              </template>
            </div>
          </article>

          <!-- Indicador "pensando" -->
          <article v-if="thinking" class="asv-msg" data-role="assistant">
            <div class="asv-avatar" aria-hidden="true">
              <span class="asv-avatar-icon">🤖</span>
            </div>
            <div class="asv-msg-body">
              <p class="asv-msg-author">Assistente Contábil</p>
              <div class="asv-thinking">
                <span class="asv-thinking-dot" aria-hidden="true" />
                <span class="asv-thinking-dot" aria-hidden="true" />
                <span class="asv-thinking-dot" aria-hidden="true" />
                <span class="asv-sr">Processando sua pergunta…</span>
              </div>
            </div>
          </article>
        </div>

        <!-- Composer: input + upload -->
        <form class="asv-composer" novalidate @submit.prevent="form.handleSubmit(sendMessage)">
          <!-- Campo de texto -->
          <UiFormField
            label="Sua pergunta"
            :error="form.errors.question"
            hint="Enter envia · Shift+Enter quebra linha"
          >
            <template #default="{ id, describedBy }">
              <UiTextarea
                :id="id"
                v-model="form.values.question"
                :ref="(el) => { textareaEl = el?.$el ?? el; }"
                rows="3"
                :aria-describedby="describedBy"
                :disabled="thinking"
                placeholder="Ex.: Qual o prazo de entrega do SPED Fiscal para empresas do Simples Nacional?"
                @keydown="onTextareaKey"
              />
            </template>
          </UiFormField>

          <!-- Dropzone de arquivos -->
          <UiFileDrop
            v-model="attachedFiles"
            :disabled="thinking"
            hint="PDF, imagem, planilha, Word, CSV, ZIP — até 20 arquivos"
          />

          <!-- Ações do composer -->
          <div class="asv-composer-footer">
            <p class="asv-composer-hint">
              Arquivos processados somente para responder à sua pergunta.
            </p>
            <UiButton
              type="submit"
              variant="primary"
              :loading="thinking"
              :disabled="!canSend"
            >
              Perguntar
            </UiButton>
          </div>
        </form>
      </UiCard>

      <!-- Painel lateral: atalhos de contexto -->
      <aside class="asv-sidebar" aria-label="Sugestões de perguntas">
        <UiCard title="Perguntas frequentes">
          <ul class="asv-suggestions">
            <li v-for="suggestion in quickSuggestions" :key="suggestion.id" class="asv-suggestion-item">
              <button
                type="button"
                class="asv-suggestion-btn"
                :disabled="thinking"
                @click="applyQuestion(suggestion.text)"
              >
                <span class="asv-suggestion-icon" aria-hidden="true">{{ suggestion.icon }}</span>
                <span class="asv-suggestion-text">{{ suggestion.text }}</span>
              </button>
            </li>
          </ul>
        </UiCard>

        <UiCard title="Sessão">
          <dl class="asv-session-info">
            <dt class="asv-session-key">Mensagens</dt>
            <dd class="asv-session-val">{{ messages.length }}</dd>
            <dt class="asv-session-key">Arquivos enviados</dt>
            <dd class="asv-session-val">{{ totalFilesUploaded }}</dd>
            <dt class="asv-session-key">Status da IA</dt>
            <dd class="asv-session-val">
              <UiStatusBadge
                :status="health"
                :label="healthLabel"
                :tone="healthTone"
                size="sm"
              />
            </dd>
          </dl>
        </UiCard>
      </aside>
    </div>

    <template #footer>
      <p>As respostas são geradas por IA e podem conter imprecisões. Sempre valide com um profissional contábil qualificado antes de tomar decisões fiscais ou tributárias.</p>
    </template>
  </UiPageLayout>
</template>

<script setup>
import { ref, computed, nextTick, onMounted } from 'vue';
import {
  UiPageLayout,
  UiCard,
  UiButton,
  UiFormField,
  UiFileDrop,
  UiTextarea,
  UiStatusBadge,
  UiEmptyState,
  UiLoadingState,
  UiErrorState,
  useToast,
  useForm,
} from '../ui/index.js';
import { assistant, assistantHealth, confirmDraft as apiConfirmDraft } from '../api.js';

// ---------------------------------------------------------------------------
// Estado da saúde da IA
// ---------------------------------------------------------------------------
const health = ref('checking'); // checking | online | offline | error

const healthTone = computed(() => ({
  checking: 'warning',
  online: 'success',
  offline: 'neutral',
  error: 'error',
}[health.value] ?? 'neutral'));

const healthLabel = computed(() => ({
  checking: 'Verificando…',
  online: 'IA no ar',
  offline: 'IA desligada',
  error: 'IA com erro',
}[health.value] ?? 'IA'));

async function checkHealth() {
  health.value = 'checking';
  try {
    const r = await assistantHealth();
    health.value = (r && r.ai) ? 'online' : 'offline';
  } catch (e) {
    health.value = (e && e.status === 503) ? 'offline' : 'error';
  }
}

// ---------------------------------------------------------------------------
// Estado do chat
// ---------------------------------------------------------------------------
const toast = useToast();
const messages = ref([]);
let msgSeq = 0;
const thinking = ref(false);
const attachedFiles = ref([]);
const logEl = ref(null);
const textareaEl = ref(null);
const confirmingDraft = ref(null); // msg.id sendo confirmado
let totalFilesUploaded = ref(0);

// Formulário do composer via useForm (com validação centralizada)
const form = useForm({
  initial: { question: '' },
  rules: {
    question: [
      (v) => (!v?.trim() && !attachedFiles.value.length ? 'Escreva uma pergunta ou anexe um arquivo.' : ''),
    ],
  },
});

const canSend = computed(() =>
  (form.values.question.trim().length > 0 || attachedFiles.value.length > 0) &&
  !thinking.value &&
  health.value === 'online'
);

// ---------------------------------------------------------------------------
// Sugestões rápidas de contexto contábil
// ---------------------------------------------------------------------------
const quickSuggestions = [
  { id: 1, icon: '📅', text: 'Quais obrigações fiscais vencem este mês?' },
  { id: 2, icon: '📊', text: 'Como calcular o IRPJ pelo Lucro Presumido?' },
  { id: 3, icon: '🧾', text: 'Quando emitir nota fiscal de serviços para o exterior?' },
  { id: 4, icon: '📂', text: 'Quais documentos guardar por 5 anos segundo a RFB?' },
  { id: 5, icon: '⚖️', text: 'O que é compensação tributária e como solicitar?' },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function splitParas(text) {
  return String(text || '').split(/\n{2,}|\r?\n/).map((s) => s.trim()).filter(Boolean);
}

function fmtTime(iso) {
  try {
    return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

function toolLabel(tool) {
  const labels = {
    rag: 'Base de conhecimento',
    calendar: 'Calendário fiscal',
    calculator: 'Cálculo tributário',
    database: 'Banco de dados',
    document: 'Análise de documento',
    search: 'Pesquisa',
    ocr: 'OCR',
    classifier: 'Classificador',
  };
  return labels[tool] || tool;
}

async function scrollEnd() {
  await nextTick();
  if (logEl.value) logEl.value.scrollTop = logEl.value.scrollHeight;
}

function errMsg(e) {
  if (!e) return 'Erro desconhecido.';
  if (e.status === 503) return 'Assistente indisponível (fail-closed). Configure o provedor de IA.';
  if (e.status === 413) return 'Arquivo grande demais para enviar (limite excedido).';
  if (e.status === 400) return 'Pergunta inválida. Tente reformular.';
  return e.message || 'Falha ao comunicar com o assistente.';
}

// ---------------------------------------------------------------------------
// Enviar mensagem
// ---------------------------------------------------------------------------
function onTextareaKey(e) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    form.handleSubmit(sendMessage);
  }
}

async function applyQuestion(text) {
  form.values.question = text;
  await nextTick();
  textareaEl.value?.focus();
}

async function sendMessage() {
  const q = form.values.question.trim();
  const fl = attachedFiles.value.slice();

  if (health.value !== 'online') {
    toast.error('O assistente está indisponível no momento.');
    return;
  }

  // Mensagem do usuário
  const userText = q || `(${fl.length} arquivo${fl.length > 1 ? 's' : ''} anexado${fl.length > 1 ? 's' : ''})`;
  messages.value.push({
    id: ++msgSeq,
    role: 'user',
    text: userText,
    ts: new Date().toISOString(),
    files: fl.map((f) => f.name),
  });

  if (fl.length) totalFilesUploaded.value += fl.length;
  form.values.question = '';
  attachedFiles.value = [];
  thinking.value = true;
  scrollEnd();

  try {
    const r = await assistant(q, fl);

    const assistantMsg = {
      id: ++msgSeq,
      role: 'assistant',
      text: (r && (r.answer || r.text || r.message)) || 'Sem resposta do assistente.',
      ts: new Date().toISOString(),
      toolsUsed: (r && r.tools_used) || [],
      citations: (r && r.citations) || [],
      draft: (r && r.draft) || null,
      processedFiles: (r && r.files) || [],
    };
    messages.value.push(assistantMsg);
  } catch (e) {
    if (e && e.status === 503) health.value = 'offline';
    messages.value.push({
      id: ++msgSeq,
      role: 'assistant',
      ts: new Date().toISOString(),
      error: errMsg(e),
    });
    toast.error('Não foi possível obter resposta do assistente.');
  } finally {
    thinking.value = false;
    scrollEnd();
  }
}

// ---------------------------------------------------------------------------
// Confirmar rascunho (draft) — via api.js centralizado
// ---------------------------------------------------------------------------
async function handleConfirmDraft(msg) {
  if (confirmingDraft.value) return;
  confirmingDraft.value = msg.id;

  try {
    await apiConfirmDraft(msg.draft);

    // Rascunho confirmado: remover o draft da mensagem
    const idx = messages.value.findIndex((m) => m.id === msg.id);
    if (idx >= 0) {
      messages.value[idx] = { ...messages.value[idx], draft: null };
    }

    toast.success('Rascunho confirmado e salvo com sucesso.');
  } catch (e) {
    toast.error('Não foi possível salvar o rascunho: ' + (e && e.message ? e.message : 'erro desconhecido'));
  } finally {
    confirmingDraft.value = null;
  }
}

function dismissDraft(msg) {
  const idx = messages.value.findIndex((m) => m.id === msg.id);
  if (idx >= 0) {
    messages.value[idx] = { ...messages.value[idx], draft: null };
  }
}

// ---------------------------------------------------------------------------
// Limpar conversa
// ---------------------------------------------------------------------------
function clearAll() {
  messages.value = [];
  totalFilesUploaded.value = 0;
}

// ---------------------------------------------------------------------------
// Ciclo de vida
// ---------------------------------------------------------------------------
onMounted(checkHealth);
</script>

<style scoped>
/*
  Tokens de componente: valores sem equivalente no kit de tokens globais
  são declarados como custom properties locais (--asv-*) no topo do escopo.
  Dimensões de conteiner variáveis usam variáveis para facilitar ajuste.
*/
.asv-layout {
  --asv-sidebar-w: 280px;
  --asv-log-max-h: 55vh;
  --asv-draft-content-max-h: 280px;
  --asv-avatar-sz: var(--ui-space-6);       /* 32px — mais próximo de 36px sem token exato */
  --asv-dot-sz: var(--ui-space-1);           /* 4px × scale(2) → ver uso abaixo */
  --asv-think-dot-sz: calc(var(--ui-space-1) + 3px); /* ~7px — dot de animação de digitação */
  --asv-tracking-wide: 0.05em;               /* letter-spacing tipográfico de label uppercase */
  --asv-nudge: 1px;                          /* micro-ajuste de alinhamento vertical de ícone */
}

/* Layout principal */
.asv-layout {
  display: grid;
  grid-template-columns: 1fr var(--asv-sidebar-w);
  gap: var(--ui-space-4);
  align-items: start;
}

@media (max-width: 860px) {
  .asv-layout {
    grid-template-columns: 1fr;
  }
  .asv-sidebar {
    display: none;
  }
}

/* Header de saúde */
.asv-health-row {
  display: flex;
  align-items: center;
  gap: var(--ui-space-2);
  padding: var(--ui-space-1) var(--ui-space-3);
  border: 1px solid rgb(var(--ui-border));
  border-radius: var(--ui-radius-pill);
  background: rgb(var(--ui-surface));
}

.asv-health-dot {
  width: calc(var(--ui-space-1) * 2);   /* 8px */
  height: calc(var(--ui-space-1) * 2);  /* 8px */
  border-radius: 50%;
  flex-shrink: 0;
}

.asv-health-dot[data-tone="success"] { background: rgb(var(--ui-ok)); }
.asv-health-dot[data-tone="warning"] { background: rgb(var(--ui-warn)); animation: asv-pulse 1.4s infinite; }
.asv-health-dot[data-tone="error"]   { background: rgb(var(--ui-danger)); }
.asv-health-dot[data-tone="neutral"] { background: rgb(var(--ui-muted)); }

.asv-health-label {
  font-size: var(--ui-text-sm);
  font-weight: 600;
}

.asv-health-label[data-tone="success"] { color: rgb(var(--ui-ok)); }
.asv-health-label[data-tone="warning"] { color: rgb(var(--ui-warn)); }
.asv-health-label[data-tone="error"]   { color: rgb(var(--ui-danger)); }
.asv-health-label[data-tone="neutral"] { color: rgb(var(--ui-muted)); }

@keyframes asv-pulse {
  0%, 100% { opacity: 1; }
  50%       { opacity: .4; }
}

/* Card do chat */
.asv-chat-card :deep(.ui-card-body) {
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-4);
  padding: 0;
}

/* Log de mensagens */
.asv-log {
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-4);
  min-height: calc(var(--ui-space-6) * 4);  /* ≈128px — substitui 240px hard-coded */
  max-height: var(--asv-log-max-h);
  overflow-y: auto;
  padding: var(--ui-space-5);
  scroll-behavior: smooth;
}

/* Mensagem individual */
.asv-msg {
  display: flex;
  gap: var(--ui-space-3);
  align-items: flex-start;
  max-width: 100%;
}

.asv-msg[data-role="user"] {
  flex-direction: row-reverse;
}

/* Avatar */
.asv-avatar {
  flex-shrink: 0;
  width: var(--asv-avatar-sz);
  height: var(--asv-avatar-sz);
  border-radius: 50%;
  background: rgb(var(--ui-surface-2));
  border: 1px solid rgb(var(--ui-border));
  display: flex;
  align-items: center;
  justify-content: center;
}

.asv-avatar-icon {
  font-size: var(--ui-text-lg);
  line-height: 1;
}

/* Corpo da mensagem */
.asv-msg-body {
  max-width: 80%;
  min-width: 0;
  background: rgb(var(--ui-surface-2));
  border: 1px solid rgb(var(--ui-border));
  border-radius: var(--ui-radius-lg);
  padding: var(--ui-space-3) var(--ui-space-4);
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-2);
}

.asv-msg[data-role="user"] .asv-msg-body {
  background: rgb(var(--ui-accent) / 0.08);
  border-color: rgb(var(--ui-accent) / 0.25);
}

.asv-msg-author {
  margin: 0;
  font-size: var(--ui-text-xs);
  font-weight: 700;
  color: rgb(var(--ui-muted));
  text-transform: uppercase;
  letter-spacing: var(--asv-tracking-wide);
  display: flex;
  align-items: center;
  gap: var(--ui-space-2);
}

.asv-msg-time {
  font-weight: 400;
  text-transform: none;
  letter-spacing: 0;
  font-size: var(--ui-text-xs);
  color: rgb(var(--ui-muted));
}

.asv-msg-text {
  margin: 0;
  line-height: 1.65;
  white-space: pre-wrap;
  word-break: break-word;
}

.asv-msg-error {
  display: flex;
  align-items: flex-start;
  gap: var(--ui-space-2);
  color: rgb(var(--ui-danger));
  background: rgb(var(--ui-danger) / 0.08);
  border: 1px solid rgb(var(--ui-danger) / 0.25);
  border-radius: var(--ui-radius-sm);
  padding: var(--ui-space-2) var(--ui-space-3);
}

.asv-msg-error p {
  margin: 0;
  font-size: var(--ui-text-sm);
}

.asv-error-icon {
  font-size: var(--ui-text-lg);
  flex-shrink: 0;
  margin-top: var(--asv-nudge);
}

/* Arquivos anexados pelo usuário */
.asv-attached-files {
  list-style: none;
  margin: var(--ui-space-1) 0 0;
  padding: var(--ui-space-2) 0 0;
  border-top: 1px dashed rgb(var(--ui-border));
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-1);
}

.asv-attached-file {
  display: flex;
  align-items: center;
  gap: var(--ui-space-1);
  font-size: var(--ui-text-sm);
  color: rgb(var(--ui-muted));
}

.asv-file-icon { flex-shrink: 0; }
.asv-file-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

/* Tools used badges */
.asv-tools {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--ui-space-1);
  padding-top: var(--ui-space-2);
  border-top: 1px solid rgb(var(--ui-border));
}

.asv-tools-label {
  font-size: var(--ui-text-xs);
  color: rgb(var(--ui-muted));
  font-weight: 600;
  margin-right: var(--ui-space-1);
}

.asv-tool-badge {
  display: inline-flex;
  align-items: center;
  padding: var(--ui-space-1) var(--ui-space-2);
  border-radius: var(--ui-radius-pill);
  font-size: var(--ui-text-xs);
  font-weight: 600;
  background: rgb(var(--ui-accent) / 0.10);
  color: rgb(var(--ui-accent-strong));
  border: 1px solid rgb(var(--ui-accent) / 0.20);
}

/* Citações */
.asv-citations {
  margin: var(--ui-space-2) 0 0;
  padding: var(--ui-space-2) 0 0 0;
  border-top: 1px dashed rgb(var(--ui-border));
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-1);
}

.asv-citation {
  display: flex;
  gap: var(--ui-space-1);
  font-size: var(--ui-text-xs);
  color: rgb(var(--ui-muted));
  line-height: 1.5;
}

.asv-citation-ref {
  font-weight: 700;
  color: rgb(var(--ui-accent-strong));
  flex-shrink: 0;
}

.asv-citation-text {
  flex: 1;
}

.asv-citation-source {
  font-style: italic;
  flex-shrink: 0;
}

/* Card de rascunho (draft) */
.asv-draft-card {
  margin-top: var(--ui-space-3);
  border: 1px solid rgb(var(--ui-accent) / 0.35);
  border-radius: var(--ui-radius-md);
  background: rgb(var(--ui-accent) / 0.04);
  overflow: hidden;
}

.asv-draft-header {
  display: flex;
  align-items: flex-start;
  gap: var(--ui-space-3);
  padding: var(--ui-space-3) var(--ui-space-4);
  border-bottom: 1px solid rgb(var(--ui-accent) / 0.20);
  background: rgb(var(--ui-accent) / 0.07);
}

.asv-draft-icon {
  font-size: var(--ui-text-xl);
  flex-shrink: 0;
  margin-top: var(--ui-space-1);
}

.asv-draft-title {
  margin: 0 0 var(--ui-space-1);
  font-weight: 700;
  font-size: var(--ui-text-sm);
  color: rgb(var(--ui-fg));
}

.asv-draft-desc {
  margin: 0;
  font-size: var(--ui-text-xs);
  color: rgb(var(--ui-muted));
}

.asv-draft-content {
  margin: 0;
  padding: var(--ui-space-3) var(--ui-space-4);
  font-family: ui-monospace, 'Cascadia Mono', 'Fira Code', monospace;
  font-size: var(--ui-text-xs);
  line-height: 1.7;
  color: rgb(var(--ui-fg));
  white-space: pre-wrap;
  word-break: break-word;
  background: rgb(var(--ui-bg));
  max-height: var(--asv-draft-content-max-h);
  overflow-y: auto;
  border-bottom: 1px solid rgb(var(--ui-accent) / 0.15);
}

.asv-draft-actions {
  display: flex;
  align-items: center;
  gap: var(--ui-space-2);
  padding: var(--ui-space-3) var(--ui-space-4);
}

/* Arquivos processados pela IA */
.asv-processed-files {
  list-style: none;
  margin: var(--ui-space-2) 0 0;
  padding: var(--ui-space-2) 0 0;
  border-top: 1px dashed rgb(var(--ui-border));
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-1);
}

.asv-processed-file {
  display: flex;
  align-items: center;
  gap: var(--ui-space-2);
  font-size: var(--ui-text-sm);
}

.asv-pf-icon { flex-shrink: 0; }
.asv-pf-name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 600; color: rgb(var(--ui-fg)); }
.asv-pf-meta { font-size: var(--ui-text-xs); color: rgb(var(--ui-muted)); flex-shrink: 0; }
.asv-processed-file[data-status="error"] .asv-pf-name { color: rgb(var(--ui-danger)); }
.asv-processed-file[data-status="error"] .asv-pf-meta { color: rgb(var(--ui-danger)); }

/* Indicador "pensando" (typing dots) */
.asv-thinking {
  display: flex;
  align-items: center;
  gap: var(--ui-space-1);
  padding: var(--ui-space-1) 0;
}

.asv-thinking-dot {
  width: var(--asv-think-dot-sz);
  height: var(--asv-think-dot-sz);
  border-radius: 50%;
  background: rgb(var(--ui-accent));
  opacity: 0.5;
  animation: asv-typing 1.3s infinite ease-in-out;
}

.asv-thinking-dot:nth-child(2) { animation-delay: 0.18s; }
.asv-thinking-dot:nth-child(3) { animation-delay: 0.36s; }

/* Acessibilidade: texto visualmente oculto mas acessível a leitores de tela */
.asv-sr {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
}

@keyframes asv-typing {
  0%, 60%, 100% { opacity: 0.2; transform: translateY(0); }
  30%           { opacity: 1;   transform: translateY(calc(-1 * var(--ui-space-1))); }
}

/* Composer */
.asv-composer {
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-3);
  padding: var(--ui-space-5);
  border-top: 1px solid rgb(var(--ui-border));
}

.asv-composer-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ui-space-3);
  flex-wrap: wrap;
}

.asv-composer-hint {
  margin: 0;
  font-size: var(--ui-text-xs);
  color: rgb(var(--ui-muted));
  flex: 1;
}

/* Sidebar */
.asv-sidebar {
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-4);
}

/* Sugestões */
.asv-suggestions {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-1);
}

.asv-suggestion-item {
  display: contents;
}

.asv-suggestion-btn {
  display: flex;
  align-items: flex-start;
  gap: var(--ui-space-2);
  width: 100%;
  padding: var(--ui-space-2) var(--ui-space-3);
  border: 1px solid rgb(var(--ui-border));
  border-radius: var(--ui-radius-sm);
  background: rgb(var(--ui-surface));
  color: rgb(var(--ui-fg));
  font: inherit;
  font-size: var(--ui-text-sm);
  text-align: left;
  cursor: pointer;
  transition: border-color 0.12s ease, background 0.12s ease;
  line-height: 1.45;
}

.asv-suggestion-btn:hover:not(:disabled) {
  border-color: rgb(var(--ui-accent) / 0.5);
  background: rgb(var(--ui-accent) / 0.05);
}

.asv-suggestion-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.asv-suggestion-icon {
  flex-shrink: 0;
  font-size: var(--ui-text-lg);
  line-height: 1.45;
}

.asv-suggestion-text {
  flex: 1;
}

/* Sessão info */
.asv-session-info {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: var(--ui-space-1) var(--ui-space-3);
  margin: 0;
}

.asv-session-key {
  font-size: var(--ui-text-sm);
  color: rgb(var(--ui-muted));
  font-weight: 400;
  padding: var(--ui-space-1) 0;
}

.asv-session-val {
  font-size: var(--ui-text-sm);
  font-weight: 600;
  color: rgb(var(--ui-fg));
  padding: var(--ui-space-1) 0;
}

/* Responsivo */
@media (max-width: 600px) {
  .asv-msg-body { max-width: 90%; }
  .asv-composer-footer { flex-direction: column; align-items: stretch; }
  .asv-log { max-height: 45vh; }
  .asv-health-row { display: none; }
}
</style>
