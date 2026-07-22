<!--
  AssistantView — Assistente IA (REQ-NEUROEVOLUI-0006)
  Interface de chat com o Assistente IA (RAG + grafo de especialistas).
  Suporta modo profissional e modo paciente. Exibe fontes citadas (RAG),
  propõe rascunhos de plano de intervenção com confirmação antes de salvar.
  Aceita arquivos (PDF, imagem, texto) como contexto multimodal.

  Endpoint real: POST /v1/assistant (campo `question` + `context_type`, multipart c/ arquivos).
  Fail-closed: 503/AI_DISABLED → assistente recusa responder.
  Usa SÓ o kit ui-vue + tokens --ui-*. CSP-safe (sem style inline, sem v-html).
-->
<template>
  <UiPageLayout
    eyebrow="Assistente IA"
    title="Assistente IA"
    subtitle="Grafo de especialistas com RAG. Cite fontes, leia arquivos e proponha planos de intervenção sob confirmação."
    width="wide"
    :loading="probing"
    loading-message="Verificando disponibilidade do assistente…"
    :error="probeError"
    :retryable="true"
    @retry="probe"
  >
    <!-- Slot actions: seletor de contexto + clear -->
    <template #actions>
      <div class="av-context-toggle" role="group" aria-label="Modo de atendimento">
        <button
          type="button"
          class="av-ctx-btn"
          :data-active="context === 'professional' ? 'true' : 'false'"
          :aria-pressed="context === 'professional'"
          :disabled="thinking"
          @click="setContext('professional')"
        >Profissional</button>
        <button
          type="button"
          class="av-ctx-btn"
          :data-active="context === 'patient' ? 'true' : 'false'"
          :aria-pressed="context === 'patient'"
          :disabled="thinking"
          @click="setContext('patient')"
        >Paciente</button>
      </div>
      <UiButton
        v-if="messages.length"
        variant="ghost"
        size="sm"
        :disabled="thinking"
        @click="clearThread"
      >Limpar conversa</UiButton>
    </template>

    <!-- Banner de estado do assistente -->
    <template #banner>
      <div
        class="av-status-banner"
        :data-ai-off="aiDisabled ? 'true' : 'false'"
        role="region"
        aria-label="Estado do assistente"
      >
        <div class="av-status-left">
          <span class="av-status-icon" aria-hidden="true">{{ aiDisabled ? '⚠' : '◉' }}</span>
          <div>
            <p class="av-status-title">{{ aiDisabled ? 'Assistente desligado (fail-closed)' : 'Assistente ativo' }}</p>
            <p class="av-status-sub">
              {{ aiDisabled
                ? 'A IA está desligada nesta instância. Nenhuma resposta será gerada até o serviço ser ativado.'
                : contextDescription }}
            </p>
          </div>
        </div>
        <UiStatusBadge
          :tone="aiDisabled ? 'error' : 'success'"
          :label="aiDisabled ? 'Desligado' : 'Ativo'"
          with-dot
        />
      </div>
    </template>

    <!-- Layout principal: thread + aside -->
    <div class="av-layout">

      <!-- Coluna principal: chat -->
      <div class="av-main">

        <!-- Thread de mensagens -->
        <UiCard :padded="false" class="av-thread-card">
          <template #header>
            <div class="av-thread-header">
              <span class="av-thread-label">Conversa</span>
              <span class="av-thread-mode-badge">
                <UiStatusBadge
                  :tone="context === 'professional' ? 'info' : 'neutral'"
                  :label="context === 'professional' ? 'Modo Profissional' : 'Modo Paciente'"
                  with-dot
                />
              </span>
            </div>
          </template>

          <!-- Messages area -->
          <div
            ref="threadEl"
            class="av-thread"
            role="log"
            aria-live="polite"
            aria-label="Histórico da conversa"
            aria-relevant="additions"
          >
            <!-- Empty state -->
            <UiEmptyState
              v-if="!messages.length && !thinking"
              icon="◎"
              title="Comece a conversa"
              :description="aiDisabled
                ? 'O assistente está desligado no momento. Quando a IA for ativada, faça sua pergunta aqui.'
                : 'Faça uma pergunta clínica, envie um arquivo para análise ou solicite um rascunho de plano.'"
            >
              <template #action>
                <div v-if="!aiDisabled" class="av-suggestions" role="list" aria-label="Sugestões de perguntas">
                  <button
                    v-for="(s, i) in suggestions"
                    :key="i"
                    type="button"
                    class="av-suggestion"
                    role="listitem"
                    @click="useSuggestion(s)"
                  >
                    <span class="av-suggestion-icon" aria-hidden="true">→</span>
                    {{ s }}
                  </button>
                </div>
              </template>
            </UiEmptyState>

            <!-- Message list -->
            <ul v-else class="av-msgs" aria-label="Mensagens">
              <li
                v-for="m in messages"
                :key="m.id"
                class="av-msg"
                :data-role="m.role"
              >
                <!-- Message row -->
                <div class="av-msg-row">
                  <!-- Avatar -->
                  <div class="av-avatar" :data-role="m.role" aria-hidden="true">
                    <span>{{ m.role === 'user' ? 'U' : 'IA' }}</span>
                  </div>

                  <!-- Bubble -->
                  <div
                    class="av-bubble"
                    :data-role="m.role"
                    :data-error="m._error ? 'true' : 'false'"
                  >
                    <!-- Bubble header -->
                    <div class="av-bubble-header">
                      <span class="av-bubble-author">{{ m.role === 'user' ? 'Você' : 'Assistente' }}</span>
                      <UiStatusBadge
                        v-if="m.role === 'assistant' && m.confidence != null"
                        :tone="confidenceTone(m.confidence)"
                        :label="confidenceLabel(m.confidence)"
                        size="sm"
                      />
                      <span v-if="m.timestamp" class="av-bubble-time">{{ m.timestamp }}</span>
                    </div>

                    <!-- Main text -->
                    <p v-if="m.text" class="av-bubble-text">{{ m.text }}</p>
                    <p v-else-if="m.role === 'assistant'" class="av-bubble-text av-muted">(resposta sem texto)</p>

                    <!-- Attachments (user side) -->
                    <ul v-if="m.attachments && m.attachments.length" class="av-attachments" aria-label="Arquivos anexados">
                      <li v-for="(a, ai) in m.attachments" :key="ai" class="av-attach-chip">
                        <span aria-hidden="true">⌁</span>
                        {{ a }}
                      </li>
                    </ul>

                    <!-- Source citations (RAG) -->
                    <div
                      v-if="m.sources && m.sources.length"
                      class="av-sources"
                      role="complementary"
                      :aria-label="`${m.sources.length} fonte(s) citada(s)`"
                    >
                      <button
                        type="button"
                        class="av-sources-toggle"
                        :aria-expanded="m._sourcesOpen ? 'true' : 'false'"
                        @click="toggleSources(m)"
                      >
                        <span aria-hidden="true">⊕</span>
                        {{ m._sourcesOpen ? 'Ocultar' : 'Ver' }} {{ m.sources.length }} fonte(s) citada(s)
                      </button>
                      <ol v-if="m._sourcesOpen" class="av-sources-list">
                        <li v-for="(src, si) in m.sources" :key="si" class="av-source">
                          <span class="av-source-num" aria-hidden="true">{{ si + 1 }}</span>
                          <div class="av-source-body">
                            <p class="av-source-title">{{ src.title || src.source || 'Trecho da base de conhecimento' }}</p>
                            <p v-if="src.text" class="av-source-text">{{ src.text }}</p>
                            <div class="av-source-meta">
                              <span v-if="src.source" class="av-source-ref">{{ src.source }}</span>
                              <span v-if="src.score != null" class="av-source-score">
                                Relevância: {{ formatPct(src.score) }}
                              </span>
                            </div>
                          </div>
                        </li>
                      </ol>
                    </div>

                    <!-- Draft proposals (professional mode only) -->
                    <div v-if="draftsAllowed && m.actions && m.actions.length" class="av-drafts">
                      <p class="av-drafts-label">Rascunhos propostos</p>
                      <article
                        v-for="(d, di) in m.actions"
                        :key="di"
                        class="av-draft"
                        :data-applied="d._applied ? 'true' : 'false'"
                      >
                        <div class="av-draft-head">
                          <div class="av-draft-meta">
                            <span class="av-draft-kind">{{ draftKindLabel(d.type) }}</span>
                            <p class="av-draft-title">{{ d.title || 'Rascunho sem título' }}</p>
                          </div>
                          <UiStatusBadge
                            :tone="d._applied ? 'success' : 'warning'"
                            :label="d._applied ? 'Aplicado' : 'Pendente'"
                            with-dot
                          />
                        </div>
                        <p v-if="d.content" class="av-draft-preview">{{ d.content }}</p>
                        <p v-if="d.rationale" class="av-draft-rationale">
                          <strong>Justificativa:</strong> {{ d.rationale }}
                        </p>
                        <div class="av-draft-actions">
                          <UiButton variant="ghost" size="sm" @click="openDraftModal(d)">
                            Ver completo
                          </UiButton>
                          <UiButton
                            variant="primary"
                            size="sm"
                            :disabled="d._applied"
                            @click="applyDraft(d)"
                          >{{ d._applied ? 'Aplicado' : 'Confirmar e aplicar' }}</UiButton>
                        </div>
                      </article>
                    </div>

                    <!-- Drafts blocked in patient mode -->
                    <p
                      v-if="!draftsAllowed && m.actions && m.actions.length"
                      class="av-drafts-blocked"
                      role="note"
                    >
                      <span aria-hidden="true">⊗</span>
                      Rascunhos clínicos ficam restritos ao modo Profissional.
                    </p>
                  </div>
                </div>
              </li>

              <!-- Thinking indicator -->
              <li v-if="thinking" class="av-msg" data-role="assistant" aria-live="polite">
                <div class="av-msg-row">
                  <div class="av-avatar" data-role="assistant" aria-hidden="true"><span>IA</span></div>
                  <div class="av-bubble" data-role="assistant">
                    <div class="av-thinking" role="status" aria-label="Consultando a base e raciocinando">
                      <span class="av-thinking-dots" aria-hidden="true">
                        <span></span><span></span><span></span>
                      </span>
                      <span class="av-thinking-text">Consultando a base e raciocinando…</span>
                    </div>
                    <div class="av-thinking-cancel">
                      <UiButton type="button" variant="ghost" size="sm" @click="cancelTurn('user-cancel')">
                        Cancelar
                      </UiButton>
                    </div>
                  </div>
                </div>
              </li>
            </ul>
          </div>

          <!-- Composer -->
          <footer class="av-composer-wrap">
            <form class="av-composer" @submit.prevent="send" novalidate>
              <!-- File uploader (collapsible) -->
              <div v-if="showUpload" class="av-upload-area">
                <UiFileDrop
                  v-model="attachedFiles"
                  :accept="FILE_ACCEPT"
                  :disabled="aiDisabled || thinking"
                  label="Arraste exames, laudos ou imagens — ou clique para escolher"
                  hint="Aceitos: texto (.txt/.md/.csv), PDF ou imagens · Máx. 15 MB por arquivo"
                  @change="onFilesChange"
                />
              </div>

              <!-- Text input -->
              <UiFormField
                label="Sua mensagem"
                :required="true"
                :error="form.errors.message"
                hint="Enter envia · Shift+Enter para nova linha"
              >
                <template #default="{ id, describedBy }">
                  <textarea
                    :id="id"
                    :value="form.values.message"
                    class="av-input"
                    rows="3"
                    :maxlength="MSG_MAX"
                    :aria-describedby="describedBy"
                    :aria-invalid="form.errors.message ? 'true' : 'false'"
                    :placeholder="aiDisabled ? 'Assistente desligado — aguardando ativação da IA' : 'Escreva sua pergunta clínica…'"
                    :disabled="aiDisabled || thinking"
                    @input="form.setField('message', $event.target.value)"
                    @keydown.enter.exact.prevent="send"
                  ></textarea>
                </template>
              </UiFormField>

              <!-- Composer bar -->
              <div class="av-composer-bar">
                <div class="av-composer-left">
                  <UiButton
                    type="button"
                    variant="ghost"
                    size="sm"
                    :disabled="aiDisabled || thinking"
                    @click="showUpload = !showUpload"
                  >
                    <template #icon-left><span aria-hidden="true">⌁</span></template>
                    {{ showUpload ? 'Ocultar anexos' : 'Anexar arquivos' }}
                  </UiButton>
                  <span v-if="attachedFiles.length" class="av-filecount" aria-live="polite">
                    {{ attachedFiles.length }} arquivo(s) anexado(s)
                  </span>
                  <span v-if="charCount > 0" class="av-charcount" :data-warn="charCount > MSG_MAX * 0.9 ? 'true' : 'false'">
                    {{ charCount }}/{{ MSG_MAX }}
                  </span>
                </div>
                <UiButton
                  type="submit"
                  variant="primary"
                  :loading="thinking"
                  :disabled="aiDisabled || thinking"
                >
                  <template #icon-left><span aria-hidden="true">↑</span></template>
                  Enviar
                </UiButton>
              </div>
            </form>
          </footer>
        </UiCard>
      </div>

      <!-- Sidebar -->
      <aside class="av-sidebar" aria-label="Contexto e orientações">

        <!-- Context selector card -->
        <UiCard title="Contexto da conversa">
          <div class="av-ctx-info">
            <div class="av-ctx-indicator" :data-mode="context">
              <span class="av-ctx-indicator-dot" aria-hidden="true"></span>
              <div>
                <p class="av-ctx-indicator-name">{{ context === 'professional' ? 'Modo Profissional' : 'Modo Paciente' }}</p>
                <p class="av-ctx-indicator-desc">{{ contextDescription }}</p>
              </div>
            </div>
          </div>
          <template #footer>
            <div class="av-ctx-switch" role="group" aria-label="Alternar modo de atendimento">
              <button
                type="button"
                class="av-ctx-opt"
                :data-active="context === 'professional' ? 'true' : 'false'"
                :aria-pressed="context === 'professional'"
                :disabled="thinking"
                @click="setContext('professional')"
              >
                <span class="av-ctx-opt-icon" aria-hidden="true">⚕</span>
                <div>
                  <p class="av-ctx-opt-name">Profissional</p>
                  <p class="av-ctx-opt-desc">Linguagem técnica + rascunhos clínicos</p>
                </div>
              </button>
              <button
                type="button"
                class="av-ctx-opt"
                :data-active="context === 'patient' ? 'true' : 'false'"
                :aria-pressed="context === 'patient'"
                :disabled="thinking"
                @click="setContext('patient')"
              >
                <span class="av-ctx-opt-icon" aria-hidden="true">♡</span>
                <div>
                  <p class="av-ctx-opt-name">Paciente</p>
                  <p class="av-ctx-opt-desc">Linguagem acessível · sem rascunhos clínicos</p>
                </div>
              </button>
            </div>
          </template>
        </UiCard>

        <!-- Stats card (session info) -->
        <UiCard title="Esta sessão" subtitle="Resumo do histórico atual">
          <dl class="av-stats">
            <div class="av-stat">
              <dt class="av-stat-label">Mensagens</dt>
              <dd class="av-stat-value">{{ messages.length }}</dd>
            </div>
            <div class="av-stat">
              <dt class="av-stat-label">Fontes consultadas</dt>
              <dd class="av-stat-value">{{ totalSources }}</dd>
            </div>
            <div class="av-stat">
              <dt class="av-stat-label">Rascunhos propostos</dt>
              <dd class="av-stat-value">{{ totalDrafts }}</dd>
            </div>
            <div class="av-stat">
              <dt class="av-stat-label">Rascunhos aplicados</dt>
              <dd class="av-stat-value">{{ appliedDrafts }}</dd>
            </div>
          </dl>
        </UiCard>

        <!-- How it works card -->
        <UiCard title="Como funciona">
          <ul class="av-howto">
            <li class="av-howto-item">
              <span class="av-howto-icon" aria-hidden="true">⊕</span>
              <div>
                <p class="av-howto-title">Respostas com fontes</p>
                <p class="av-howto-text">O assistente busca na base de conhecimento (RAG) e cita os trechos usados.</p>
              </div>
            </li>
            <li class="av-howto-item">
              <span class="av-howto-icon" aria-hidden="true">⌁</span>
              <div>
                <p class="av-howto-title">Análise de arquivos</p>
                <p class="av-howto-text">Anexe exames, laudos ou imagens. O assistente analisa o conteúdo junto com sua pergunta.</p>
              </div>
            </li>
            <li class="av-howto-item">
              <span class="av-howto-icon" aria-hidden="true">◐</span>
              <div>
                <p class="av-howto-title">Rascunhos sob confirmação</p>
                <p class="av-howto-text">Planos de intervenção são propostos como rascunho — nada é adotado sem sua confirmação explícita.</p>
              </div>
            </li>
            <li class="av-howto-item">
              <span class="av-howto-icon" aria-hidden="true">⊗</span>
              <div>
                <p class="av-howto-title">Fail-closed</p>
                <p class="av-howto-text">Se a IA estiver desligada, o assistente recusa responder em vez de improvisar.</p>
              </div>
            </li>
          </ul>
        </UiCard>

        <!-- Quick links -->
        <UiCard title="Atalhos">
          <div class="av-links">
            <UiButton variant="ghost" size="sm" to="/knowledge-sources">
              Base de conhecimento
            </UiButton>
            <UiButton variant="ghost" size="sm" to="/patients">
              Pacientes
            </UiButton>
            <UiButton variant="ghost" size="sm" to="/consultations">
              Consultas
            </UiButton>
            <UiButton variant="ghost" size="sm" to="/patient-reports">
              Relatórios
            </UiButton>
          </div>
        </UiCard>
      </aside>
    </div>

    <!-- Modal: rascunho completo -->
    <UiModal
      v-model:open="draftModal.open"
      :title="draftModal.data ? (draftModal.data.title || 'Rascunho clínico') : 'Rascunho'"
      width="lg"
    >
      <div v-if="draftModal.data" class="av-modal-body">
        <div class="av-modal-kind-row">
          <span class="av-modal-kind">{{ draftKindLabel(draftModal.data.type) }}</span>
          <UiStatusBadge
            :tone="draftModal.data._applied ? 'success' : 'warning'"
            :label="draftModal.data._applied ? 'Aplicado' : 'Pendente de confirmação'"
            with-dot
          />
        </div>
        <p class="av-modal-content">{{ draftModal.data.content }}</p>
        <div v-if="draftModal.data.rationale" class="av-modal-rationale">
          <p class="av-modal-rationale-label">Justificativa clínica</p>
          <p class="av-modal-rationale-text">{{ draftModal.data.rationale }}</p>
        </div>
      </div>
      <template #footer>
        <UiButton variant="ghost" @click="draftModal.open = false">Fechar</UiButton>
        <UiButton
          variant="primary"
          :disabled="!draftModal.data || draftModal.data._applied"
          @click="applyDraft(draftModal.data)"
        >
          {{ draftModal.data && draftModal.data._applied ? 'Já aplicado' : 'Confirmar e aplicar' }}
        </UiButton>
      </template>
    </UiModal>
  </UiPageLayout>
</template>

<script setup>
import { ref, computed, nextTick, onMounted, onBeforeUnmount } from 'vue';
import {
  UiPageLayout,
  UiCard,
  UiButton,
  UiFileDrop,
  UiFormField,
  UiStatusBadge,
  UiEmptyState,
  UiModal,
  useToast,
  useConfirm,
  useForm,
  validators,
} from '../ui/index.js';
// Único caminho de dados ao backend: assistant() e assistantProbe() do api.js.
// Endpoint real: POST /v1/assistant. Sem fetch cru na view.
import { assistant, assistantProbe } from '../api.js';

// ── Composables ──────────────────────────────────────────────────────────────
const toast = useToast();
const confirm = useConfirm();

// ── Estado do probe (fail-closed) ────────────────────────────────────────────
const probing = ref(true);
const probeError = ref(null);
const aiDisabled = ref(false);

// ── Estado da conversa ───────────────────────────────────────────────────────
const context = ref('professional');
const messages = ref([]);
const thinking = ref(false);
const threadEl = ref(null);

// ── Upload de arquivos ───────────────────────────────────────────────────────
const attachedFiles = ref([]);
const showUpload = ref(false);

// ── Modal de rascunho ────────────────────────────────────────────────────────
const draftModal = ref({ open: false, data: null });

// ── Constantes ───────────────────────────────────────────────────────────────
const MSG_MAX = 4000;
const FILE_MAX_BYTES = 15 * 1024 * 1024; // 15 MB
const FILE_ACCEPT = '.txt,.md,.csv,.pdf,image/*';
const FILE_ACCEPT_EXT = ['txt', 'md', 'csv', 'pdf'];
const REQUEST_TIMEOUT_MS = 60_000;

// ── Formulário do composer ───────────────────────────────────────────────────
const form = useForm({
  initial: { message: '' },
  rules: {
    message: [
      validators.maxLen(MSG_MAX, `Mensagem muito longa (máx. ${MSG_MAX} caracteres).`),
      (v) => (String(v || '').trim() || attachedFiles.value.length
        ? ''
        : 'Escreva uma mensagem ou anexe um arquivo.'),
    ],
  },
});

// ── AbortController ──────────────────────────────────────────────────────────
let activeController = null;
let timeoutTimer = null;

// ── Sequência de IDs ─────────────────────────────────────────────────────────
let _seq = 0;
const nextId = () => `msg_${Date.now()}_${_seq++}`;

// ── Sugestões de uso ─────────────────────────────────────────────────────────
const suggestions = [
  'Qual o protocolo de avaliação inicial para este caso?',
  'Resuma as diretrizes de intervenção precoce e cite as fontes.',
  'Proponha um rascunho de plano de intervenção para reabilitação cognitiva.',
  'Quais são os critérios diagnósticos mais recentes para TEA?',
];

// ── Computed ─────────────────────────────────────────────────────────────────
const contextDescription = computed(() =>
  context.value === 'professional'
    ? 'Modo Profissional: linguagem técnica, rascunhos clínicos disponíveis para revisão.'
    : 'Modo Paciente: linguagem acessível, rascunhos clínicos restritos a profissionais.');

const draftsAllowed = computed(() => context.value === 'professional');

const charCount = computed(() => String(form.values.message || '').length);

const totalSources = computed(() =>
  messages.value.reduce((s, m) => s + (m.sources ? m.sources.length : 0), 0));

const totalDrafts = computed(() =>
  messages.value.reduce((s, m) => s + (m.actions ? m.actions.length : 0), 0));

const appliedDrafts = computed(() =>
  messages.value.reduce(
    (s, m) => s + (m.actions ? m.actions.filter((a) => a._applied).length : 0),
    0,
  ));

// ── Helpers ───────────────────────────────────────────────────────────────────
function formatPct(score) {
  const n = Number(score);
  if (!Number.isFinite(n)) return '—';
  return `${Math.round(Math.max(0, Math.min(1, n)) * 100)}%`;
}

function confidenceTone(c) {
  const n = Number(c);
  if (!Number.isFinite(n)) return 'neutral';
  if (n >= 0.75) return 'success';
  if (n >= 0.5) return 'warning';
  return 'error';
}

function confidenceLabel(c) {
  const n = Number(c);
  if (!Number.isFinite(n)) return 'confiança —';
  return `${Math.round(n * 100)}% confiança`;
}

const DRAFT_KIND_LABELS = {
  intervention_plan: 'Plano de intervenção',
  recommendation_letter: 'Carta de recomendação',
  clinical_report: 'Relatório clínico',
  referral: 'Encaminhamento',
};

function draftKindLabel(type) {
  return DRAFT_KIND_LABELS[type] || 'Rascunho clínico';
}

function nowLabel() {
  return new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

// ── Ações de UI ───────────────────────────────────────────────────────────────
function setContext(c) {
  if (thinking.value) return;
  context.value = c;
}

function useSuggestion(text) {
  form.setField('message', text);
}

function toggleSources(m) {
  m._sourcesOpen = !m._sourcesOpen;
}

function openDraftModal(d) {
  draftModal.value = { open: true, data: d };
}

async function scrollToBottom() {
  await nextTick();
  if (threadEl.value) threadEl.value.scrollTop = threadEl.value.scrollHeight;
}

// ── Validação de arquivos ─────────────────────────────────────────────────────
function getExt(name) {
  const i = String(name || '').lastIndexOf('.');
  return i >= 0 ? name.slice(i + 1).toLowerCase() : '';
}

function isAcceptedFile(f) {
  if (!f) return false;
  if (typeof f.type === 'string' && f.type.startsWith('image/')) return true;
  return FILE_ACCEPT_EXT.includes(getExt(f.name));
}

function onFilesChange(next) {
  const incoming = Array.isArray(next) ? next : [];
  const valid = [];
  const badType = [];
  const badSize = [];
  for (const f of incoming) {
    if (!isAcceptedFile(f)) { badType.push(f.name); continue; }
    if (f.size > FILE_MAX_BYTES) { badSize.push(f.name); continue; }
    valid.push(f);
  }
  if (valid.length !== incoming.length) attachedFiles.value = valid;
  if (badType.length) {
    toast.error('Tipo de arquivo não suportado', {
      detail: `${badType.join(', ')} — aceitos: texto (.txt/.md/.csv), PDF e imagens.`,
    });
  }
  if (badSize.length) {
    toast.error('Arquivo muito grande', {
      detail: `${badSize.join(', ')} — limite de ${Math.round(FILE_MAX_BYTES / 1_048_576)} MB por arquivo.`,
    });
  }
}

// ── Timeout / cancelamento ────────────────────────────────────────────────────
function clearTurnState() {
  if (timeoutTimer) { clearTimeout(timeoutTimer); timeoutTimer = null; }
  activeController = null;
}

function cancelTurn(reason) {
  if (activeController) {
    try { activeController.abort(reason || 'user-cancel'); } catch (_) { /* noop */ }
  }
}

// ── Probe fail-closed ─────────────────────────────────────────────────────────
async function probe() {
  probing.value = true;
  probeError.value = null;
  try {
    const { aiDisabled: off } = await assistantProbe();
    aiDisabled.value = off;
  } catch (err) {
    probeError.value = err.message || 'Não foi possível verificar o assistente. Tente novamente.';
  } finally {
    probing.value = false;
  }
}

// ── Envio de mensagem ─────────────────────────────────────────────────────────
function send() {
  if (aiDisabled.value || thinking.value) return;
  form.handleSubmit(runTurn);
}

async function runTurn(vals) {
  const question = String(vals.message || '').trim();
  const filesToSend = attachedFiles.value.slice();

  // Adiciona a mensagem do usuário ao thread
  messages.value.push({
    id: nextId(),
    role: 'user',
    text: question,
    attachments: filesToSend.map((f) => f.name),
    timestamp: nowLabel(),
  });

  form.reset();
  attachedFiles.value = [];
  showUpload.value = false;
  thinking.value = true;
  await scrollToBottom();

  // AbortController com timeout duro
  const controller = new AbortController();
  activeController = controller;
  timeoutTimer = setTimeout(() => controller.abort('timeout'), REQUEST_TIMEOUT_MS);

  try {
    const data = await assistant(
      question || 'Analise os arquivos anexados.',
      filesToSend,
      { contextType: context.value, signal: controller.signal },
    );

    messages.value.push({
      id: nextId(),
      role: 'assistant',
      text: String(data.answer || '').trim(),
      sources: Array.isArray(data.sources) ? data.sources : [],
      confidence: data.confidence,
      actions: Array.isArray(data.actions)
        ? data.actions.map((a) => ({ ...a, _applied: false }))
        : [],
      _sourcesOpen: false,
      timestamp: nowLabel(),
    });
    aiDisabled.value = false;

  } catch (err) {
    const aborted = err && (err.name === 'AbortError' || (controller.signal && controller.signal.aborted));

    if (aborted) {
      const timedOut = controller.signal.reason === 'timeout';
      messages.value.push({
        id: nextId(),
        role: 'assistant',
        text: timedOut
          ? 'A consulta demorou demais e foi cancelada. Tente novamente ou simplifique a pergunta.'
          : 'Consulta cancelada pelo usuário.',
        sources: [],
        actions: [],
        _sourcesOpen: false,
        _error: true,
        timestamp: nowLabel(),
      });
      if (timedOut) toast.warning('Tempo esgotado', { detail: 'O assistente não respondeu a tempo (60 s).' });
      else toast.info('Consulta cancelada');

    } else if (err.status === 503 || err.code === 'AI_DISABLED') {
      aiDisabled.value = true;
      messages.value.push({
        id: nextId(),
        role: 'assistant',
        text: 'O assistente está desligado nesta instância (fail-closed). Nenhuma resposta pode ser gerada agora.',
        sources: [],
        actions: [],
        _sourcesOpen: false,
        _error: true,
        timestamp: nowLabel(),
      });
      toast.warning('Assistente desligado', { detail: 'A IA não está configurada (503 AI_DISABLED).' });

    } else {
      messages.value.push({
        id: nextId(),
        role: 'assistant',
        text: 'Não foi possível obter a resposta. Tente novamente em instantes.',
        sources: [],
        actions: [],
        _sourcesOpen: false,
        _error: true,
        timestamp: nowLabel(),
      });
      toast.error('Falha ao consultar o assistente', {
        detail: err.message,
        code: err.code || (err.status ? `HTTP ${err.status}` : ''),
      });
    }

  } finally {
    clearTurnState();
    thinking.value = false;
    await scrollToBottom();
  }
}

// ── Aplicar rascunho ──────────────────────────────────────────────────────────
async function applyDraft(d) {
  if (!d || d._applied) return;
  if (!draftsAllowed.value) {
    toast.warning('Restrito ao modo Profissional', {
      detail: 'Alterne para o modo Profissional para aplicar rascunhos clínicos.',
    });
    return;
  }
  const ok = await confirm({
    title: 'Confirmar aplicação do rascunho?',
    message: `"${d.title || draftKindLabel(d.type)}" será adotado como definitivo. Revise o conteúdo antes de prosseguir.`,
    confirmLabel: 'Confirmar e aplicar',
  });
  if (!ok) return;
  d._applied = true;
  if (draftModal.value.open) draftModal.value.open = false;
  toast.success('Rascunho aplicado', { detail: d.title || draftKindLabel(d.type) });
}

// ── Limpar thread ─────────────────────────────────────────────────────────────
async function clearThread() {
  const ok = await confirm({
    title: 'Limpar conversa?',
    message: 'Todo o histórico desta sessão será removido. Esta ação não pode ser desfeita.',
    danger: true,
    confirmLabel: 'Limpar',
  });
  if (!ok) return;
  messages.value = [];
  toast.info('Conversa limpa');
}

// ── Ciclo de vida ─────────────────────────────────────────────────────────────
onMounted(probe);
onBeforeUnmount(() => { cancelTurn('unmount'); clearTurnState(); });
</script>

<style scoped>
/* ── Banner de estado ─────────────────────────────────────────────────── */
.av-status-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ui-space-4);
  padding: var(--ui-space-3) var(--ui-space-4);
  border: 1px solid rgb(var(--ui-border));
  border-left: 4px solid rgb(var(--ui-ok));
  border-radius: var(--ui-radius-md);
  background: rgb(var(--ui-surface));
}
.av-status-banner[data-ai-off="true"] { border-left-color: rgb(var(--ui-danger)); }
.av-status-left { display: flex; align-items: center; gap: var(--ui-space-3); }
.av-status-icon {
  font-size: 1.4rem; line-height: 1;
  color: rgb(var(--ui-ok));
  flex-shrink: 0;
}
.av-status-banner[data-ai-off="true"] .av-status-icon { color: rgb(var(--ui-danger)); }
.av-status-title { margin: 0; font-weight: 700; font-size: var(--ui-text-sm); }
.av-status-sub { margin: 2px 0 0; font-size: var(--ui-text-xs); color: rgb(var(--ui-muted)); }

/* ── Toggle de contexto no topo ───────────────────────────────────────── */
.av-context-toggle {
  display: inline-flex;
  padding: 3px;
  gap: 2px;
  background: rgb(var(--ui-surface-2));
  border: 1px solid rgb(var(--ui-border));
  border-radius: var(--ui-radius-pill);
}
.av-ctx-btn {
  font: inherit;
  font-size: var(--ui-text-xs);
  font-weight: 600;
  padding: 5px 14px;
  border: none;
  cursor: pointer;
  background: transparent;
  color: rgb(var(--ui-muted));
  border-radius: var(--ui-radius-pill);
  transition: background 0.15s ease, color 0.15s ease, box-shadow 0.15s ease;
}
.av-ctx-btn[data-active="true"] {
  background: rgb(var(--ui-surface));
  color: rgb(var(--ui-fg));
  box-shadow: var(--ui-shadow-sm);
}
.av-ctx-btn:disabled { cursor: not-allowed; opacity: 0.55; }
.av-ctx-btn:focus-visible { outline: 2px solid rgb(var(--ui-accent)); outline-offset: 1px; }

/* ── Layout principal ─────────────────────────────────────────────────── */
.av-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 300px;
  gap: var(--ui-space-4);
  align-items: start;
}
.av-main { min-width: 0; }
.av-sidebar { display: flex; flex-direction: column; gap: var(--ui-space-3); }

/* ── Card de thread ───────────────────────────────────────────────────── */
.av-thread-card { display: flex; flex-direction: column; }
.av-thread-header {
  display: flex;
  align-items: center;
  gap: var(--ui-space-3);
}
.av-thread-label { font-weight: 700; font-size: var(--ui-text-sm); }

/* ── Thread (scroll container) ────────────────────────────────────────── */
.av-thread {
  min-height: 320px;
  max-height: 58vh;
  overflow-y: auto;
  padding: var(--ui-space-5);
  scroll-behavior: smooth;
}

/* ── Sugestões (empty) ────────────────────────────────────────────────── */
.av-suggestions {
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-2);
  max-width: 480px;
  margin-top: var(--ui-space-3);
}
.av-suggestion {
  display: flex;
  align-items: flex-start;
  gap: var(--ui-space-2);
  font: inherit;
  font-size: var(--ui-text-sm);
  text-align: left;
  padding: var(--ui-space-2) var(--ui-space-3);
  border: 1px solid rgb(var(--ui-border));
  border-radius: var(--ui-radius-md);
  background: rgb(var(--ui-surface));
  color: rgb(var(--ui-fg));
  cursor: pointer;
  transition: border-color 0.15s ease, background 0.15s ease;
}
.av-suggestion:hover { border-color: rgb(var(--ui-accent)); background: rgb(var(--ui-accent) / 0.06); }
.av-suggestion:focus-visible { outline: 2px solid rgb(var(--ui-accent)); outline-offset: 2px; }
.av-suggestion-icon { color: rgb(var(--ui-accent)); font-size: var(--ui-text-sm); flex-shrink: 0; }

/* ── Lista de mensagens ───────────────────────────────────────────────── */
.av-msgs {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-5);
}
.av-msg { display: flex; flex-direction: column; }
.av-msg-row { display: flex; gap: var(--ui-space-3); align-items: flex-start; }
.av-msg[data-role="user"] .av-msg-row { flex-direction: row-reverse; }

/* ── Avatar ───────────────────────────────────────────────────────────── */
.av-avatar {
  flex-shrink: 0;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: var(--ui-text-xs);
  font-weight: 700;
  letter-spacing: 0;
  background: rgb(var(--ui-surface-2));
  border: 1px solid rgb(var(--ui-border));
  color: rgb(var(--ui-muted));
}
.av-avatar[data-role="assistant"] {
  background: rgb(var(--ui-accent) / 0.14);
  border-color: rgb(var(--ui-accent) / 0.35);
  color: rgb(var(--ui-accent-strong));
}

/* ── Bubble ───────────────────────────────────────────────────────────── */
.av-bubble {
  max-width: 78%;
  padding: var(--ui-space-3) var(--ui-space-4);
  border: 1px solid rgb(var(--ui-border));
  border-radius: var(--ui-radius-lg);
  background: rgb(var(--ui-surface));
  min-width: 0;
}
.av-bubble[data-role="user"] {
  background: rgb(var(--ui-accent) / 0.09);
  border-color: rgb(var(--ui-accent) / 0.28);
  border-radius: var(--ui-radius-lg) var(--ui-radius-sm) var(--ui-radius-lg) var(--ui-radius-lg);
}
.av-bubble[data-role="assistant"] {
  border-radius: var(--ui-radius-sm) var(--ui-radius-lg) var(--ui-radius-lg) var(--ui-radius-lg);
}
.av-bubble[data-error="true"] {
  background: rgb(var(--ui-danger) / 0.06);
  border-color: rgb(var(--ui-danger) / 0.32);
}
.av-bubble-header {
  display: flex;
  align-items: center;
  gap: var(--ui-space-2);
  margin-bottom: var(--ui-space-2);
  flex-wrap: wrap;
}
.av-bubble-author {
  font-size: var(--ui-text-xs);
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: rgb(var(--ui-muted));
}
.av-bubble-time {
  font-size: var(--ui-text-xs);
  color: rgb(var(--ui-muted));
  margin-left: auto;
}
.av-bubble-text {
  margin: 0;
  white-space: pre-wrap;
  word-break: break-word;
  line-height: 1.6;
}
.av-muted { color: rgb(var(--ui-muted)); font-style: italic; }

/* ── Anexos ───────────────────────────────────────────────────────────── */
.av-attachments {
  list-style: none;
  margin: var(--ui-space-2) 0 0;
  padding: 0;
  display: flex;
  flex-wrap: wrap;
  gap: var(--ui-space-1);
}
.av-attach-chip {
  display: inline-flex;
  align-items: center;
  gap: var(--ui-space-1);
  font-size: var(--ui-text-xs);
  color: rgb(var(--ui-muted));
  background: rgb(var(--ui-surface-2));
  border: 1px solid rgb(var(--ui-border));
  border-radius: var(--ui-radius-pill);
  padding: 2px var(--ui-space-2);
}

/* ── Fontes citadas (RAG) ─────────────────────────────────────────────── */
.av-sources {
  margin-top: var(--ui-space-3);
  padding-top: var(--ui-space-3);
  border-top: 1px dashed rgb(var(--ui-border));
}
.av-sources-toggle {
  display: inline-flex;
  align-items: center;
  gap: var(--ui-space-1);
  font: inherit;
  font-size: var(--ui-text-xs);
  font-weight: 600;
  color: rgb(var(--ui-accent-strong));
  background: none;
  border: none;
  cursor: pointer;
  padding: 0;
  text-decoration: underline;
  text-decoration-style: dotted;
}
.av-sources-toggle:focus-visible { outline: 2px solid rgb(var(--ui-accent)); outline-offset: 2px; border-radius: 2px; }
.av-sources-list {
  list-style: none;
  margin: var(--ui-space-2) 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-3);
}
.av-source { display: flex; gap: var(--ui-space-2); align-items: flex-start; }
.av-source-num {
  flex-shrink: 0;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: var(--ui-text-xs);
  font-weight: 700;
  background: rgb(var(--ui-accent) / 0.16);
  color: rgb(var(--ui-accent-strong));
}
.av-source-body { min-width: 0; flex: 1; }
.av-source-title { margin: 0; font-weight: 600; font-size: var(--ui-text-sm); }
.av-source-text {
  margin: var(--ui-space-1) 0 0;
  font-size: var(--ui-text-sm);
  color: rgb(var(--ui-fg));
  opacity: 0.82;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.av-source-meta {
  margin: var(--ui-space-1) 0 0;
  display: flex;
  gap: var(--ui-space-3);
  font-size: var(--ui-text-xs);
  color: rgb(var(--ui-muted));
  flex-wrap: wrap;
}
.av-source-ref { font-family: var(--ui-font-mono, monospace); }
.av-source-score { color: rgb(var(--ui-accent-strong)); font-weight: 600; }

/* ── Rascunhos propostos ──────────────────────────────────────────────── */
.av-drafts { margin-top: var(--ui-space-3); display: flex; flex-direction: column; gap: var(--ui-space-3); }
.av-drafts-label {
  margin: 0 0 var(--ui-space-2);
  font-size: var(--ui-text-xs);
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: rgb(var(--ui-muted));
}
.av-draft {
  border: 1px solid rgb(var(--ui-warn) / 0.5);
  border-left: 3px solid rgb(var(--ui-warn));
  border-radius: var(--ui-radius-md);
  background: rgb(var(--ui-warn) / 0.06);
  padding: var(--ui-space-3) var(--ui-space-4);
}
.av-draft[data-applied="true"] {
  border-color: rgb(var(--ui-ok) / 0.5);
  border-left-color: rgb(var(--ui-ok));
  background: rgb(var(--ui-ok) / 0.07);
}
.av-draft-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--ui-space-3);
}
.av-draft-meta { min-width: 0; }
.av-draft-kind {
  margin: 0;
  font-size: var(--ui-text-xs);
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: rgb(var(--ui-muted));
}
.av-draft-title { margin: var(--ui-space-1) 0 0; font-weight: 700; font-size: var(--ui-text-sm); }
.av-draft-preview {
  margin: var(--ui-space-2) 0 0;
  font-size: var(--ui-text-sm);
  white-space: pre-wrap;
  word-break: break-word;
  display: -webkit-box;
  -webkit-line-clamp: 4;
  line-clamp: 4;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.av-draft-rationale {
  margin: var(--ui-space-2) 0 0;
  font-size: var(--ui-text-xs);
  color: rgb(var(--ui-muted));
}
.av-draft-actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--ui-space-2);
  margin-top: var(--ui-space-3);
}
.av-drafts-blocked {
  display: flex;
  align-items: center;
  gap: var(--ui-space-2);
  margin-top: var(--ui-space-3);
  padding: var(--ui-space-2) var(--ui-space-3);
  font-size: var(--ui-text-xs);
  color: rgb(var(--ui-muted));
  border: 1px dashed rgb(var(--ui-border));
  border-radius: var(--ui-radius-md);
  background: rgb(var(--ui-surface-2));
}

/* ── Indicador "pensando" ─────────────────────────────────────────────── */
.av-thinking {
  display: flex;
  align-items: center;
  gap: var(--ui-space-2);
  color: rgb(var(--ui-muted));
  font-size: var(--ui-text-sm);
}
.av-thinking-dots {
  display: inline-flex;
  gap: 3px;
  align-items: center;
}
.av-thinking-dots span {
  display: inline-block;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: rgb(var(--ui-accent));
  animation: av-pulse 1.2s ease-in-out infinite;
}
.av-thinking-dots span:nth-child(2) { animation-delay: 0.2s; }
.av-thinking-dots span:nth-child(3) { animation-delay: 0.4s; }
@keyframes av-pulse {
  0%, 80%, 100% { opacity: 0.3; transform: scale(0.8); }
  40% { opacity: 1; transform: scale(1); }
}
.av-thinking-text { color: rgb(var(--ui-muted)); }
.av-thinking-cancel { margin-top: var(--ui-space-2); }

/* ── Composer ─────────────────────────────────────────────────────────── */
.av-composer-wrap {
  border-top: 1px solid rgb(var(--ui-border));
  background: rgb(var(--ui-surface));
  padding: var(--ui-space-4) var(--ui-space-5);
}
.av-composer { display: flex; flex-direction: column; gap: var(--ui-space-3); }
.av-upload-area {
  padding: var(--ui-space-3);
  border: 1px solid rgb(var(--ui-border));
  border-radius: var(--ui-radius-md);
  background: rgb(var(--ui-surface-2));
}
.av-input {
  width: 100%;
  font: inherit;
  font-size: var(--ui-text-sm);
  resize: vertical;
  min-height: 80px;
  padding: var(--ui-space-3);
  color: rgb(var(--ui-fg));
  background: rgb(var(--ui-surface));
  border: 1px solid rgb(var(--ui-border-strong));
  border-radius: var(--ui-radius-md);
  transition: border-color 0.15s ease;
}
.av-input:focus-visible {
  outline: 2px solid rgb(var(--ui-accent));
  outline-offset: 1px;
  border-color: rgb(var(--ui-accent));
}
.av-input:disabled { opacity: 0.55; cursor: not-allowed; background: rgb(var(--ui-surface-2)); }
.av-composer-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ui-space-3);
  flex-wrap: wrap;
}
.av-composer-left {
  display: flex;
  align-items: center;
  gap: var(--ui-space-2);
  flex-wrap: wrap;
}
.av-filecount { font-size: var(--ui-text-xs); color: rgb(var(--ui-accent-strong)); font-weight: 600; }
.av-charcount { font-size: var(--ui-text-xs); color: rgb(var(--ui-muted)); }
.av-charcount[data-warn="true"] { color: rgb(var(--ui-warn)); font-weight: 600; }

/* ── Sidebar: seletor de contexto ─────────────────────────────────────── */
.av-ctx-info { margin-bottom: var(--ui-space-3); }
.av-ctx-indicator {
  display: flex;
  align-items: flex-start;
  gap: var(--ui-space-2);
  padding: var(--ui-space-3);
  border-radius: var(--ui-radius-md);
  border: 1px solid rgb(var(--ui-border));
  background: rgb(var(--ui-surface-2));
}
.av-ctx-indicator-dot {
  flex-shrink: 0;
  margin-top: 4px;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: rgb(var(--ui-accent));
}
.av-ctx-indicator[data-mode="patient"] .av-ctx-indicator-dot { background: rgb(var(--ui-ok)); }
.av-ctx-indicator-name { margin: 0; font-weight: 700; font-size: var(--ui-text-sm); }
.av-ctx-indicator-desc { margin: 3px 0 0; font-size: var(--ui-text-xs); color: rgb(var(--ui-muted)); }

.av-ctx-switch {
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-2);
}
.av-ctx-opt {
  display: flex;
  align-items: center;
  gap: var(--ui-space-3);
  width: 100%;
  font: inherit;
  text-align: left;
  padding: var(--ui-space-3);
  border: 1px solid rgb(var(--ui-border));
  border-radius: var(--ui-radius-md);
  background: rgb(var(--ui-surface));
  color: rgb(var(--ui-fg));
  cursor: pointer;
  transition: border-color 0.15s ease, background 0.15s ease;
}
.av-ctx-opt:hover { border-color: rgb(var(--ui-accent)); background: rgb(var(--ui-accent) / 0.05); }
.av-ctx-opt[data-active="true"] {
  border-color: rgb(var(--ui-accent));
  background: rgb(var(--ui-accent) / 0.09);
}
.av-ctx-opt:disabled { cursor: not-allowed; opacity: 0.55; }
.av-ctx-opt:focus-visible { outline: 2px solid rgb(var(--ui-accent)); outline-offset: 2px; }
.av-ctx-opt-icon { font-size: 1.3rem; line-height: 1; flex-shrink: 0; }
.av-ctx-opt-name { margin: 0; font-weight: 700; font-size: var(--ui-text-sm); }
.av-ctx-opt-desc { margin: 2px 0 0; font-size: var(--ui-text-xs); color: rgb(var(--ui-muted)); }

/* ── Stats (sessão) ───────────────────────────────────────────────────── */
.av-stats {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--ui-space-3);
}
.av-stat { padding: var(--ui-space-2) 0; }
.av-stat-label {
  margin: 0;
  font-size: var(--ui-text-xs);
  color: rgb(var(--ui-muted));
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.av-stat-value {
  display: block;
  margin: var(--ui-space-1) 0 0;
  font-size: var(--ui-text-xl, 1.25rem);
  font-weight: 700;
  color: rgb(var(--ui-fg));
}

/* ── How it works ─────────────────────────────────────────────────────── */
.av-howto {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-3);
}
.av-howto-item { display: flex; gap: var(--ui-space-3); align-items: flex-start; }
.av-howto-icon { font-size: 1.1rem; line-height: 1.4; flex-shrink: 0; color: rgb(var(--ui-accent-strong)); }
.av-howto-title { margin: 0; font-weight: 600; font-size: var(--ui-text-sm); }
.av-howto-text { margin: 2px 0 0; font-size: var(--ui-text-xs); color: rgb(var(--ui-muted)); }

/* ── Atalhos ──────────────────────────────────────────────────────────── */
.av-links { display: flex; flex-direction: column; gap: var(--ui-space-1); }

/* ── Modal de rascunho ────────────────────────────────────────────────── */
.av-modal-body { display: flex; flex-direction: column; gap: var(--ui-space-4); }
.av-modal-kind-row { display: flex; align-items: center; gap: var(--ui-space-3); flex-wrap: wrap; }
.av-modal-kind {
  font-size: var(--ui-text-xs);
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: rgb(var(--ui-muted));
}
.av-modal-content {
  margin: 0;
  white-space: pre-wrap;
  word-break: break-word;
  line-height: 1.65;
  padding: var(--ui-space-4);
  background: rgb(var(--ui-surface-2));
  border: 1px solid rgb(var(--ui-border));
  border-radius: var(--ui-radius-md);
}
.av-modal-rationale {
  padding-top: var(--ui-space-3);
  border-top: 1px dashed rgb(var(--ui-border));
}
.av-modal-rationale-label { margin: 0 0 var(--ui-space-1); font-weight: 700; font-size: var(--ui-text-sm); }
.av-modal-rationale-text { margin: 0; font-size: var(--ui-text-sm); color: rgb(var(--ui-muted)); }

/* ── Responsivo ──────────────────────────────────────────────────────── */
@media (max-width: 860px) {
  .av-layout { grid-template-columns: 1fr; }
  .av-sidebar { display: none; }
  .av-bubble { max-width: 90%; }
  .av-thread { max-height: 52vh; }
  .av-stats { grid-template-columns: 1fr 1fr; }
}
@media (max-width: 560px) {
  .av-composer-bar { flex-direction: column; align-items: stretch; }
  .av-bubble { max-width: 94%; }
}
</style>
