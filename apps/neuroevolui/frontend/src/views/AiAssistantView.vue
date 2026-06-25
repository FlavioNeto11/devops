<!--
  AiAssistantView — Assistente clínico do NeuroEvolui (REQ-NEUROEVOLUI-0006).
  Chat com o grafo de especialistas: responde citando FONTES (RAG), aceita ARQUIVOS (texto/imagem/PDF)
  e propõe RASCUNHOS de plano de intervenção que só são "aplicados" após confirmação explícita.
  Fail-closed: quando a IA está desligada o backend devolve 503 e a tela recusa responder.
  Usa SÓ o kit ui-vue + tokens --ui-*. CSP-safe (sem style inline, sem v-html). Endpoint real: /v1/assistant.
-->
<template>
  <UiPageLayout
    eyebrow="Assistente clínico"
    title="Assistente"
    subtitle="Tire dúvidas com o assistente de IA (grafo com especialistas). Ele responde citando fontes da base de conhecimento, lê arquivos que você anexar e propõe rascunhos de plano de intervenção para você revisar antes de aplicar."
    width="wide"
    :loading="probing"
    loading-message="Verificando o assistente…"
    :error="probeError"
    :retryable="true"
    @retry="probe"
  >
    <!-- Banner do estado da IA -->
    <template #banner>
      <div class="assist-banner" :data-disabled="aiDisabled ? 'true' : 'false'" role="region" aria-label="Estado do assistente">
        <div class="assist-banner-info">
          <span class="assist-banner-icon" aria-hidden="true">{{ aiDisabled ? '🚫' : '🤖' }}</span>
          <div>
            <p class="assist-banner-title">{{ aiDisabled ? 'Assistente indisponível' : 'Assistente pronto' }}</p>
            <p class="assist-banner-sub">
              {{ aiDisabled
                ? 'A IA está desligada nesta instância. Nenhuma resposta será gerada (modo fail-closed).'
                : 'Fundamentado na base de conhecimento (RAG). Os rascunhos sempre passam pela sua confirmação.' }}
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

    <div class="assist-grid">
      <!-- Coluna principal: conversa -->
      <UiCard class="assist-chat-card" title="Conversa" :subtitle="contextLabel">
        <template #actions>
          <div class="assist-context" role="group" aria-label="Modo de atendimento">
            <button
              type="button"
              class="assist-context-btn"
              :data-active="context === 'professional' ? 'true' : 'false'"
              :aria-pressed="context === 'professional' ? 'true' : 'false'"
              :disabled="thinking"
              @click="setContext('professional')"
            >Profissional</button>
            <button
              type="button"
              class="assist-context-btn"
              :data-active="context === 'patient' ? 'true' : 'false'"
              :aria-pressed="context === 'patient' ? 'true' : 'false'"
              :disabled="thinking"
              @click="setContext('patient')"
            >Paciente</button>
          </div>
        </template>

        <div class="assist-thread" ref="threadEl" role="log" aria-live="polite" aria-label="Histórico da conversa">
          <!-- Estado vazio: nenhuma mensagem ainda -->
          <UiEmptyState
            v-if="!messages.length && !thinking"
            icon="🤖"
            title="Comece uma conversa"
            :description="aiDisabled
              ? 'O assistente está desligado no momento. Quando a IA estiver ativa, faça sua pergunta aqui.'
              : 'Faça uma pergunta clínica, anexe exames/relatórios ou peça um rascunho de plano. Sugestões abaixo para começar.'"
          >
            <template #action>
              <div v-if="!aiDisabled" class="assist-suggests">
                <button
                  v-for="(s, i) in suggestions"
                  :key="i"
                  type="button"
                  class="assist-suggest"
                  @click="useSuggestion(s)"
                >{{ s }}</button>
              </div>
            </template>
          </UiEmptyState>

          <!-- Mensagens -->
          <ul v-else class="assist-msgs">
            <li v-for="m in messages" :key="m.id" class="assist-msg" :data-role="m.role">
              <div class="assist-msg-row">
                <span class="assist-avatar" :data-role="m.role" aria-hidden="true">{{ m.role === 'user' ? '🧑' : '🤖' }}</span>
                <div class="assist-bubble" :data-role="m.role" :data-error="m._error ? 'true' : 'false'">
                  <p class="assist-msg-meta">
                    <span class="assist-msg-author">{{ m.role === 'user' ? 'Você' : 'Assistente' }}</span>
                    <UiStatusBadge
                      v-if="m.role === 'assistant' && m.confidence != null"
                      :tone="confTone(m.confidence)"
                      :label="confLabel(m.confidence)"
                      size="sm"
                    />
                  </p>

                  <p v-if="m.text" class="assist-msg-text">{{ m.text }}</p>
                  <p v-else-if="m.role === 'assistant'" class="assist-msg-text ui-muted">(sem texto na resposta)</p>

                  <!-- Anexos enviados pelo usuário -->
                  <ul v-if="m.attachments && m.attachments.length" class="assist-attach">
                    <li v-for="(a, ai) in m.attachments" :key="ai" class="assist-attach-item">
                      <span aria-hidden="true">📎</span>{{ a }}
                    </li>
                  </ul>

                  <!-- Fontes citadas (RAG) -->
                  <div v-if="m.sources && m.sources.length" class="assist-sources">
                    <p class="assist-sources-head">Fontes citadas</p>
                    <ol class="assist-sources-list">
                      <li v-for="(src, si) in m.sources" :key="si" class="assist-source">
                        <span class="assist-source-num" aria-hidden="true">{{ si + 1 }}</span>
                        <div class="assist-source-body">
                          <p class="assist-source-title">{{ src.title || src.source || 'Trecho da base' }}</p>
                          <p v-if="src.text" class="assist-source-text">{{ src.text }}</p>
                          <p class="assist-source-meta">
                            <span v-if="src.source" class="ui-mono">{{ src.source }}</span>
                            <span v-if="src.score != null" class="assist-source-score">relevância {{ pct(src.score) }}</span>
                          </p>
                        </div>
                      </li>
                    </ol>
                  </div>

                  <!-- Aviso quando o backend devolve rascunhos no modo Paciente (bloqueados na UI) -->
                  <p
                    v-if="m.actions && m.actions.length && !draftsAllowed"
                    class="assist-draft-blocked"
                    role="note"
                  >
                    <span aria-hidden="true">🔒</span>
                    Rascunhos clínicos ficam ocultos no modo Paciente. Mude para o modo Profissional para revisá-los.
                  </p>

                  <!-- Rascunhos propostos (plano de intervenção etc.) — só no modo Profissional -->
                  <div v-if="draftsAllowed && m.actions && m.actions.length" class="assist-drafts">
                    <article
                      v-for="(d, di) in m.actions"
                      :key="di"
                      class="assist-draft"
                      :data-applied="d._applied ? 'true' : 'false'"
                    >
                      <header class="assist-draft-head">
                        <div>
                          <p class="assist-draft-kind">{{ draftKindLabel(d.type) }}</p>
                          <p class="assist-draft-title">{{ d.title || 'Rascunho sem título' }}</p>
                        </div>
                        <UiStatusBadge
                          :tone="d._applied ? 'success' : 'warning'"
                          :label="d._applied ? 'Aplicado' : 'Aguardando confirmação'"
                          size="sm"
                        />
                      </header>
                      <p v-if="d.content" class="assist-draft-content">{{ d.content }}</p>
                      <p v-if="d.rationale" class="assist-draft-rationale">
                        <span class="assist-draft-rationale-label">Justificativa:</span> {{ d.rationale }}
                      </p>
                      <footer class="assist-draft-foot">
                        <UiButton variant="ghost" size="sm" @click="openDraft(d)">Ver completo</UiButton>
                        <UiButton variant="primary" size="sm" :disabled="d._applied" @click="applyDraft(d)">
                          {{ d._applied ? 'Aplicado' : 'Confirmar e aplicar' }}
                        </UiButton>
                      </footer>
                    </article>
                  </div>
                </div>
              </div>
            </li>

            <!-- Indicador de "pensando" -->
            <li v-if="thinking" class="assist-msg" data-role="assistant">
              <div class="assist-msg-row">
                <span class="assist-avatar" data-role="assistant" aria-hidden="true">🤖</span>
                <div class="assist-bubble" data-role="assistant">
                  <p class="assist-typing" role="status">
                    <span class="ui-spin" aria-hidden="true" /> Consultando a base e raciocinando…
                  </p>
                  <div class="assist-typing-actions">
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
        <template #footer>
          <form class="assist-composer" @submit.prevent="send">
            <UiFileDrop
              v-if="showDrop"
              v-model="files"
              :accept="ACCEPT"
              :disabled="aiDisabled || thinking"
              label="Arraste exames, laudos ou imagens — ou clique para escolher"
              hint="Texto (.txt/.md/.csv), PDF ou imagem · até 15 MB por arquivo. Os arquivos são analisados junto com a sua pergunta."
              @change="onFilesChange"
            />

            <UiFormField
              label="Sua mensagem"
              :required="true"
              :error="form.errors.message"
              hint="Enter envia · Shift+Enter quebra linha"
            >
              <template #default="{ id, describedBy }">
                <textarea
                  :id="id"
                  :value="form.values.message"
                  class="assist-input"
                  rows="3"
                  :maxlength="MESSAGE_MAX"
                  :aria-describedby="describedBy"
                  :aria-invalid="form.errors.message ? 'true' : 'false'"
                  :placeholder="aiDisabled ? 'Assistente desligado' : 'Escreva sua dúvida clínica…'"
                  :disabled="aiDisabled || thinking"
                  @input="form.setField('message', $event.target.value)"
                  @keydown.enter.exact.prevent="send"
                ></textarea>
              </template>
            </UiFormField>

            <div class="assist-composer-bar">
              <div class="assist-composer-left">
                <UiButton
                  type="button"
                  variant="ghost"
                  size="sm"
                  :disabled="aiDisabled || thinking"
                  @click="showDrop = !showDrop"
                >
                  <template #icon-left><span aria-hidden="true">📎</span></template>
                  {{ showDrop ? 'Ocultar anexos' : 'Anexar arquivos' }}
                </UiButton>
                <span v-if="files.length" class="assist-filecount">{{ files.length }} arquivo(s)</span>
                <UiButton
                  v-if="messages.length"
                  type="button"
                  variant="ghost"
                  size="sm"
                  :disabled="thinking"
                  @click="clearThread"
                >Limpar conversa</UiButton>
              </div>
              <!-- Habilitado mesmo vazio: o submit dispara a validação do useForm e mostra o erro
                   visível (vazio/limite) em vez de só desabilitar silenciosamente. -->
              <UiButton type="submit" variant="primary" :loading="thinking" :disabled="aiDisabled || thinking">
                <template #icon-left><span aria-hidden="true">➤</span></template>
                Enviar
              </UiButton>
            </div>
          </form>
        </template>
      </UiCard>

      <!-- Coluna lateral: orientações -->
      <aside class="assist-aside">
        <UiCard title="Como funciona" subtitle="Grafo com especialistas">
          <ul class="assist-howto">
            <li class="assist-howto-item">
              <span class="assist-howto-icon" aria-hidden="true">🔎</span>
              <div>
                <p class="assist-howto-title">Respostas com fonte</p>
                <p class="assist-howto-text">Antes de afirmar protocolos ou posologias, o assistente busca na base e cita os trechos usados.</p>
              </div>
            </li>
            <li class="assist-howto-item">
              <span class="assist-howto-icon" aria-hidden="true">📎</span>
              <div>
                <p class="assist-howto-title">Leitura de arquivos</p>
                <p class="assist-howto-text">Anexe exames, laudos ou imagens. Ele analisa o conteúdo junto com a sua pergunta.</p>
              </div>
            </li>
            <li class="assist-howto-item">
              <span class="assist-howto-icon" aria-hidden="true">📝</span>
              <div>
                <p class="assist-howto-title">Rascunhos sob confirmação</p>
                <p class="assist-howto-text">Planos de intervenção e cartas são propostos como rascunho — nada é adotado sem o seu "confirmar".</p>
              </div>
            </li>
            <li class="assist-howto-item">
              <span class="assist-howto-icon" aria-hidden="true">🔒</span>
              <div>
                <p class="assist-howto-title">Fail-closed</p>
                <p class="assist-howto-text">Se a IA estiver desligada, o assistente recusa responder em vez de improvisar.</p>
              </div>
            </li>
          </ul>
        </UiCard>

        <UiCard title="Modo atual" :subtitle="contextLabel">
          <p class="assist-mode-text">
            {{ context === 'professional'
              ? 'No modo Profissional o assistente pode propor rascunhos clínicos para sua revisão e usa linguagem técnica.'
              : 'No modo Paciente as respostas são explicativas e acessíveis; rascunhos clínicos ficam restritos a profissionais.' }}
          </p>
          <template #footer>
            <span class="assist-mode-foot ui-muted">Alterne o modo no topo da conversa.</span>
          </template>
        </UiCard>
      </aside>
    </div>

    <!-- Modal: rascunho completo -->
    <UiModal v-model:open="draftModal.open" :title="draftModalTitle" width="lg">
      <div v-if="draftModal.data" class="assist-modal">
        <p class="assist-modal-kind">{{ draftKindLabel(draftModal.data.type) }}</p>
        <p class="assist-modal-content">{{ draftModal.data.content }}</p>
        <div v-if="draftModal.data.rationale" class="assist-modal-rationale">
          <p class="assist-modal-rationale-label">Justificativa clínica</p>
          <p>{{ draftModal.data.rationale }}</p>
        </div>
      </div>
      <template #footer>
        <UiButton variant="ghost" @click="draftModal.open = false">Fechar</UiButton>
        <UiButton
          variant="primary"
          :disabled="!draftModal.data || draftModal.data._applied"
          @click="applyDraft(draftModal.data)"
        >{{ draftModal.data && draftModal.data._applied ? 'Aplicado' : 'Confirmar e aplicar' }}</UiButton>
      </template>
    </UiModal>
  </UiPageLayout>
</template>

<script setup>
import { ref, computed, nextTick, onMounted, onBeforeUnmount } from 'vue';
import {
  UiPageLayout, UiCard, UiButton, UiFileDrop, UiFormField,
  UiStatusBadge, UiEmptyState, UiModal, useToast, useConfirm, useForm, validators,
} from '../ui/index.js';
// Caminho de dados ÚNICO pelo api.js (sem fetch solto na view). assistant() = POST /v1/assistant
// (campo `question` + `context_type`, multipart quando há arquivos); assistantProbe() = detecção
// fail-closed (503/AI_DISABLED) sem rota de health dedicada. Ver REQ-NEUROEVOLUI-0006.
import { assistant, assistantProbe } from '../api.js';

const toast = useToast();
const confirm = useConfirm(); // useConfirm() devolve a função ask diretamente: await confirm({...})

const probing = ref(true);
const probeError = ref(null);
const aiDisabled = ref(false);

const context = ref('professional');
const files = ref([]);
const showDrop = ref(false);
const messages = ref([]);
const thinking = ref(false);
const threadEl = ref(null);

const draftModal = ref({ open: false, data: null });

// Limites do composer (validação client-side via useForm) e do upload.
const MESSAGE_MAX = 4000;
const FILE_MAX_BYTES = 15 * 1024 * 1024; // 15 MB por arquivo
// Propósito declarado da tela: texto / imagem / PDF. Restringe o accept default (amplo) do kit.
const ACCEPT = '.txt,.md,.csv,.pdf,image/*';
const ACCEPT_EXT = ['txt', 'md', 'csv', 'pdf'];

// Composer como FORM (anti-duplo-submit + validação). O "create" desta tela é enviar a mensagem.
const form = useForm({
  initial: { message: '' },
  rules: {
    message: [
      validators.maxLen(MESSAGE_MAX, `Mensagem muito longa (máx. ${MESSAGE_MAX} caracteres).`),
      // Regra cruzada: exigir texto OU pelo menos um arquivo anexado.
      (v) => (String(v || '').trim() || files.value.length ? '' : 'Escreva uma mensagem ou anexe um arquivo.'),
    ],
  },
});

// AbortController do turno em andamento (timeout + cancelamento manual).
const REQUEST_TIMEOUT_MS = 60000;
let activeController = null;
let timeoutTimer = null;

let _seq = 0;
const nextId = () => `m${Date.now()}_${_seq++}`;

const suggestions = [
  'Qual o protocolo de avaliação inicial recomendado para este caso?',
  'Resuma as diretrizes de intervenção precoce e cite as fontes.',
  'Proponha um rascunho de plano de intervenção para reabilitação cognitiva.',
];

const contextLabel = computed(() =>
  context.value === 'professional' ? 'Modo profissional de saúde' : 'Modo paciente');

// Modo Paciente: defesa em profundidade — a UI não renderiza/aplica rascunhos clínicos,
// independentemente do que o backend devolver (a promessa da tela é cumprida pela própria view).
const draftsAllowed = computed(() => context.value === 'professional');

const draftModalTitle = computed(() =>
  draftModal.value.data ? (draftModal.value.data.title || 'Rascunho') : 'Rascunho');

function pct(score) {
  const n = Number(score);
  if (!Number.isFinite(n)) return '—';
  return `${Math.round(Math.max(0, Math.min(1, n)) * 100)}%`;
}

function confTone(c) {
  const n = Number(c);
  if (!Number.isFinite(n)) return 'neutral';
  if (n >= 0.75) return 'success';
  if (n >= 0.5) return 'warning';
  return 'error';
}
function confLabel(c) {
  const n = Number(c);
  if (!Number.isFinite(n)) return 'confiança —';
  return `confiança ${Math.round(n * 100)}%`;
}

const DRAFT_KINDS = {
  intervention_plan: 'Plano de intervenção',
  recommendation_letter: 'Carta de recomendação',
  clinical_report: 'Relatório clínico',
  referral: 'Encaminhamento',
};
function draftKindLabel(type) {
  return DRAFT_KINDS[type] || 'Rascunho clínico';
}

function setContext(c) {
  if (thinking.value) return;
  context.value = c;
}

function useSuggestion(s) {
  form.setField('message', s);
}

async function scrollToEnd() {
  await nextTick();
  const el = threadEl.value;
  if (el) el.scrollTop = el.scrollHeight;
}

// ── Validação de upload (o UiFileDrop não filtra por conta própria) ─────────────
// Aceita só texto/imagem/PDF (propósito da tela) e impõe limite de tamanho por arquivo.
function fileExt(name) {
  const i = String(name || '').lastIndexOf('.');
  return i >= 0 ? name.slice(i + 1).toLowerCase() : '';
}
function isSupportedFile(f) {
  if (!f) return false;
  if (typeof f.type === 'string' && f.type.startsWith('image/')) return true;
  return ACCEPT_EXT.includes(fileExt(f.name));
}
// Chamado no @change do UiFileDrop: rejeita não-suportados/oversize e avisa via toast,
// mantendo no v-model apenas os arquivos válidos.
function onFilesChange(next) {
  const incoming = Array.isArray(next) ? next : [];
  const kept = [];
  const rejectedType = [];
  const rejectedSize = [];
  for (const f of incoming) {
    if (!isSupportedFile(f)) { rejectedType.push(f.name); continue; }
    if (f.size > FILE_MAX_BYTES) { rejectedSize.push(f.name); continue; }
    kept.push(f);
  }
  if (kept.length !== incoming.length) files.value = kept; // remove os inválidos do v-model
  if (rejectedType.length) {
    toast.error('Arquivo não suportado', {
      detail: `${rejectedType.join(', ')} — aceitos: texto (.txt/.md/.csv), PDF e imagens.`,
    });
  }
  if (rejectedSize.length) {
    toast.error('Arquivo muito grande', {
      detail: `${rejectedSize.join(', ')} — limite de ${Math.round(FILE_MAX_BYTES / 1048576)} MB por arquivo.`,
    });
  }
  // Revalida a regra cruzada (texto OU arquivo) quando o conjunto de anexos muda.
  if (form.touched.message) form.validateField('message');
}

// ── Timeout / cancelamento do turno ─────────────────────────────────────────────
function clearTurnTimers() {
  if (timeoutTimer) { clearTimeout(timeoutTimer); timeoutTimer = null; }
  activeController = null;
}
function cancelTurn(reason) {
  if (activeController) {
    try { activeController.abort(reason || 'user-cancel'); } catch (_e) { /* noop */ }
  }
}

// Probe inicial: detecta fail-closed (503) sem poluir a conversa — via assistantProbe() do api.js
// (não há GET /v1/assistant/health; a detecção é encapsulada no helper, sem fetch cru aqui).
async function probe() {
  probing.value = true;
  probeError.value = null;
  try {
    const { aiDisabled: disabled } = await assistantProbe();
    aiDisabled.value = disabled;
  } catch (err) {
    probeError.value = err.message || 'Não foi possível falar com o assistente.';
  } finally {
    probing.value = false;
  }
}

// Envio = "create" do composer: validado e anti-duplo-submit via useForm.handleSubmit.
function send() {
  if (aiDisabled.value || thinking.value) return;
  form.handleSubmit(runTurn);
}

async function runTurn(vals) {
  const question = String(vals.message || '').trim();
  const sent = files.value.slice();

  messages.value.push({
    id: nextId(),
    role: 'user',
    text: question,
    attachments: sent.map((f) => f.name),
  });
  form.reset();
  files.value = [];
  showDrop.value = false;
  thinking.value = true;
  await scrollToEnd();

  // AbortController: timeout duro + botão "Cancelar" enquanto pensa.
  const controller = new AbortController();
  activeController = controller;
  timeoutTimer = setTimeout(() => controller.abort('timeout'), REQUEST_TIMEOUT_MS);

  try {
    const data = await assistant(
      question || 'Analise os arquivos anexados.',
      sent,
      { contextType: context.value, signal: controller.signal },
    );
    messages.value.push({
      id: nextId(),
      role: 'assistant',
      text: String(data.answer || '').trim(),
      sources: Array.isArray(data.sources) ? data.sources : [],
      confidence: data.confidence,
      actions: Array.isArray(data.actions) ? data.actions.map((a) => ({ ...a, _applied: false })) : [],
    });
    aiDisabled.value = false;
  } catch (err) {
    if (err && (err.name === 'AbortError' || controller.signal.aborted)) {
      const timedOut = controller.signal.reason === 'timeout';
      messages.value.push({
        id: nextId(),
        role: 'assistant',
        text: timedOut
          ? 'A consulta demorou demais e foi interrompida. Tente novamente ou simplifique a pergunta.'
          : 'Consulta cancelada. Você pode reenviar quando quiser.',
        sources: [],
        actions: [],
        _error: true,
      });
      if (timedOut) toast.warning('Tempo esgotado', { detail: 'O assistente não respondeu a tempo.' });
      else toast.info('Consulta cancelada');
    } else if (err.status === 503 || err.code === 'AI_DISABLED') {
      aiDisabled.value = true;
      messages.value.push({
        id: nextId(),
        role: 'assistant',
        text: 'O assistente está desligado nesta instância (modo fail-closed). Não é possível gerar uma resposta agora.',
        sources: [],
        actions: [],
        _error: true,
      });
      toast.warning('Assistente desligado', { detail: 'A IA não está configurada (503).' });
    } else {
      messages.value.push({
        id: nextId(),
        role: 'assistant',
        text: 'Não foi possível obter a resposta. Tente novamente em instantes.',
        sources: [],
        actions: [],
        _error: true,
      });
      toast.error('Falha ao consultar o assistente', {
        detail: err.message,
        code: err.code || (err.status ? `HTTP ${err.status}` : ''),
      });
    }
  } finally {
    clearTurnTimers();
    thinking.value = false;
    await scrollToEnd();
  }
}

function openDraft(d) {
  draftModal.value = { open: true, data: d };
}

// Confirmação obrigatória antes de "aplicar" um rascunho (ação com efeito).
// Defesa em profundidade: no modo Paciente a aplicação de rascunhos clínicos é bloqueada na UI,
// mesmo que o backend devolva actions (a tela não pode contradizer a própria promessa).
async function applyDraft(d) {
  if (!d || d._applied) return;
  if (!draftsAllowed.value) {
    toast.warning('Restrito a profissionais', {
      detail: 'Rascunhos clínicos só podem ser aplicados no modo Profissional.',
    });
    return;
  }
  const ok = await confirm({
    title: 'Aplicar rascunho?',
    message: `Confirmar e aplicar "${d.title || draftKindLabel(d.type)}"? Revise o conteúdo antes de prosseguir — ele será adotado como definitivo.`,
    confirmLabel: 'Confirmar e aplicar',
  });
  if (!ok) return;
  d._applied = true;
  draftModal.value.open = false;
  toast.success('Rascunho aplicado', { detail: d.title || draftKindLabel(d.type) });
}

async function clearThread() {
  const ok = await confirm({
    title: 'Limpar conversa?',
    message: 'Todo o histórico desta conversa será removido. Esta ação não pode ser desfeita.',
    danger: true,
    confirmLabel: 'Limpar',
  });
  if (!ok) return;
  messages.value = [];
  toast.info('Conversa limpa');
}

onMounted(probe);
// Aborta o turno em andamento e limpa o timer ao desmontar (evita callback órfão).
onBeforeUnmount(() => { cancelTurn('unmount'); clearTurnTimers(); });
</script>

<style scoped>
/* ---- banner de estado ---- */
.assist-banner {
  display: flex; align-items: center; justify-content: space-between; gap: var(--ui-space-4);
  padding: var(--ui-space-3) var(--ui-space-4);
  border: 1px solid rgb(var(--ui-border));
  border-left: 3px solid rgb(var(--ui-ok));
  border-radius: var(--ui-radius-md);
  background: rgb(var(--ui-surface));
}
.assist-banner[data-disabled="true"] { border-left-color: rgb(var(--ui-danger)); }
.assist-banner-info { display: flex; align-items: center; gap: var(--ui-space-3); }
.assist-banner-icon { font-size: 1.6rem; line-height: 1; }
.assist-banner-title { margin: 0; font-weight: 700; }
.assist-banner-sub { margin: var(--ui-space-1) 0 0; color: rgb(var(--ui-muted)); font-size: var(--ui-text-sm); }

/* ---- layout ---- */
.assist-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 320px;
  gap: var(--ui-space-4);
  align-items: start;
}
.assist-chat-card { display: flex; flex-direction: column; min-height: 0; }
.assist-aside { display: flex; flex-direction: column; gap: var(--ui-space-4); }

/* ---- toggle de contexto ---- */
.assist-context {
  display: inline-flex; gap: var(--ui-space-1); padding: var(--ui-space-1);
  background: rgb(var(--ui-surface-2)); border: 1px solid rgb(var(--ui-border));
  border-radius: var(--ui-radius-pill);
}
.assist-context-btn {
  font: inherit; font-size: var(--ui-text-xs); font-weight: 600;
  padding: 5px 12px; border: none; cursor: pointer;
  background: transparent; color: rgb(var(--ui-muted));
  border-radius: var(--ui-radius-pill);
  transition: background .15s ease, color .15s ease;
}
.assist-context-btn[data-active="true"] {
  background: rgb(var(--ui-surface)); color: rgb(var(--ui-fg));
  box-shadow: var(--ui-shadow-sm);
}
.assist-context-btn:disabled { cursor: not-allowed; opacity: .6; }

/* ---- thread ---- */
.assist-thread { max-height: 56vh; overflow-y: auto; padding-right: var(--ui-space-1); }
.assist-msgs { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--ui-space-4); }
.assist-msg-row { display: flex; gap: var(--ui-space-3); align-items: flex-start; }
.assist-msg[data-role="user"] .assist-msg-row { flex-direction: row-reverse; }
.assist-avatar {
  flex-shrink: 0; width: 34px; height: 34px; border-radius: 50%;
  display: inline-flex; align-items: center; justify-content: center;
  font-size: 1.05rem;
  background: rgb(var(--ui-surface-2)); border: 1px solid rgb(var(--ui-border));
}
.assist-avatar[data-role="assistant"] { background: rgb(var(--ui-accent) / 0.14); border-color: rgb(var(--ui-accent) / 0.30); }

.assist-bubble {
  max-width: 80%;
  padding: var(--ui-space-3) var(--ui-space-4);
  border: 1px solid rgb(var(--ui-border));
  border-radius: var(--ui-radius-lg);
  background: rgb(var(--ui-surface));
}
.assist-bubble[data-role="user"] {
  background: rgb(var(--ui-accent) / 0.10);
  border-color: rgb(var(--ui-accent) / 0.28);
}
.assist-bubble[data-error="true"] {
  background: rgb(var(--ui-danger) / 0.07);
  border-color: rgb(var(--ui-danger) / 0.35);
}
.assist-msg-meta { display: flex; align-items: center; gap: var(--ui-space-2); margin: 0 0 var(--ui-space-1); flex-wrap: wrap; }
.assist-msg-author { font-weight: 700; font-size: var(--ui-text-xs); color: rgb(var(--ui-muted)); text-transform: uppercase; letter-spacing: .05em; }
.assist-msg-text { margin: 0; white-space: pre-wrap; word-break: break-word; }

.assist-attach { list-style: none; margin: var(--ui-space-2) 0 0; padding: 0; display: flex; flex-wrap: wrap; gap: var(--ui-space-1); }
.assist-attach-item {
  display: inline-flex; align-items: center; gap: var(--ui-space-1);
  font-size: var(--ui-text-xs); color: rgb(var(--ui-muted));
  background: rgb(var(--ui-surface-2)); border: 1px solid rgb(var(--ui-border));
  border-radius: var(--ui-radius-pill); padding: var(--ui-space-1) var(--ui-space-2);
}

/* ---- fontes (RAG) ---- */
.assist-sources {
  margin-top: var(--ui-space-3); padding-top: var(--ui-space-3);
  border-top: 1px dashed rgb(var(--ui-border));
}
.assist-sources-head { margin: 0 0 var(--ui-space-2); font-size: var(--ui-text-xs); font-weight: 700; text-transform: uppercase; letter-spacing: .05em; color: rgb(var(--ui-muted)); }
.assist-sources-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--ui-space-2); }
.assist-source { display: flex; gap: var(--ui-space-2); }
.assist-source-num {
  flex-shrink: 0; width: 20px; height: 20px; border-radius: 50%;
  display: inline-flex; align-items: center; justify-content: center;
  font-size: var(--ui-text-xs); font-weight: 700;
  background: rgb(var(--ui-accent) / 0.16); color: rgb(var(--ui-accent-strong));
}
.assist-source-body { min-width: 0; }
.assist-source-title { margin: 0; font-weight: 600; font-size: var(--ui-text-sm); }
.assist-source-text { margin: var(--ui-space-1) 0 0; font-size: var(--ui-text-sm); color: rgb(var(--ui-fg)); opacity: .85; }
.assist-source-meta { margin: var(--ui-space-1) 0 0; display: flex; gap: var(--ui-space-3); flex-wrap: wrap; font-size: var(--ui-text-xs); color: rgb(var(--ui-muted)); }
.assist-source-score { color: rgb(var(--ui-accent-strong)); }

/* ---- rascunhos ---- */
.assist-drafts { margin-top: var(--ui-space-3); display: flex; flex-direction: column; gap: var(--ui-space-3); }
.assist-draft {
  border: 1px solid rgb(var(--ui-warn) / 0.45);
  border-radius: var(--ui-radius-md);
  background: rgb(var(--ui-warn) / 0.07);
  padding: var(--ui-space-3) var(--ui-space-4);
}
.assist-draft[data-applied="true"] {
  border-color: rgb(var(--ui-ok) / 0.45);
  background: rgb(var(--ui-ok) / 0.08);
}
.assist-draft-head { display: flex; align-items: flex-start; justify-content: space-between; gap: var(--ui-space-3); }
.assist-draft-kind { margin: 0; font-size: var(--ui-text-xs); font-weight: 700; text-transform: uppercase; letter-spacing: .05em; color: rgb(var(--ui-muted)); }
.assist-draft-title { margin: var(--ui-space-1) 0 0; font-weight: 700; }
.assist-draft-content {
  margin: var(--ui-space-2) 0 0; white-space: pre-wrap; word-break: break-word;
  font-size: var(--ui-text-sm);
  display: -webkit-box; -webkit-line-clamp: 4; line-clamp: 4; -webkit-box-orient: vertical; overflow: hidden;
}
.assist-draft-rationale { margin: var(--ui-space-2) 0 0; font-size: var(--ui-text-xs); color: rgb(var(--ui-muted)); }
.assist-draft-rationale-label { font-weight: 700; }
.assist-draft-foot { display: flex; justify-content: flex-end; gap: var(--ui-space-2); margin-top: var(--ui-space-3); }

/* ---- rascunhos bloqueados (modo Paciente) ---- */
.assist-draft-blocked {
  margin: var(--ui-space-3) 0 0; display: flex; align-items: flex-start; gap: var(--ui-space-2);
  font-size: var(--ui-text-sm); color: rgb(var(--ui-muted));
  border: 1px dashed rgb(var(--ui-border)); border-radius: var(--ui-radius-md);
  background: rgb(var(--ui-surface-2)); padding: var(--ui-space-2) var(--ui-space-3);
}

/* ---- "pensando" ---- */
.assist-typing { display: flex; align-items: center; gap: var(--ui-space-2); margin: 0; color: rgb(var(--ui-muted)); font-size: var(--ui-text-sm); }
.assist-typing-actions { display: flex; justify-content: flex-start; margin-top: var(--ui-space-2); }

/* ---- sugestões (empty) ---- */
.assist-suggests { display: flex; flex-direction: column; gap: var(--ui-space-2); align-items: stretch; max-width: 480px; }
.assist-suggest {
  font: inherit; font-size: var(--ui-text-sm); text-align: left;
  padding: var(--ui-space-2) var(--ui-space-3);
  border: 1px solid rgb(var(--ui-border)); border-radius: var(--ui-radius-md);
  background: rgb(var(--ui-surface)); color: rgb(var(--ui-fg)); cursor: pointer;
  transition: border-color .15s ease, background .15s ease;
}
.assist-suggest:hover { border-color: rgb(var(--ui-accent)); background: rgb(var(--ui-accent) / 0.06); }

/* ---- composer ---- */
.assist-composer { display: flex; flex-direction: column; gap: var(--ui-space-3); }
.assist-input {
  width: 100%; font: inherit; resize: vertical; min-height: 72px;
  padding: var(--ui-space-3); color: rgb(var(--ui-fg));
  background: rgb(var(--ui-surface)); border: 1px solid rgb(var(--ui-border-strong));
  border-radius: var(--ui-radius-md);
}
.assist-input:focus-visible { outline: 2px solid rgb(var(--ui-accent)); outline-offset: 1px; }
.assist-input:disabled { opacity: .6; cursor: not-allowed; background: rgb(var(--ui-surface-2)); }
.assist-composer-bar { display: flex; align-items: center; justify-content: space-between; gap: var(--ui-space-3); flex-wrap: wrap; }
.assist-composer-left { display: flex; align-items: center; gap: var(--ui-space-2); flex-wrap: wrap; }
.assist-filecount { font-size: var(--ui-text-xs); color: rgb(var(--ui-muted)); }

/* ---- aside ---- */
.assist-howto { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--ui-space-4); }
.assist-howto-item { display: flex; gap: var(--ui-space-3); align-items: flex-start; }
.assist-howto-icon { font-size: 1.2rem; line-height: 1.3; }
.assist-howto-title { margin: 0; font-weight: 600; font-size: var(--ui-text-sm); }
.assist-howto-text { margin: var(--ui-space-1) 0 0; font-size: var(--ui-text-sm); color: rgb(var(--ui-muted)); }
.assist-mode-text { margin: 0; font-size: var(--ui-text-sm); color: rgb(var(--ui-fg)); }
.assist-mode-foot { font-size: var(--ui-text-xs); }

/* ---- modal ---- */
.assist-modal { display: flex; flex-direction: column; gap: var(--ui-space-3); }
.assist-modal-kind { margin: 0; font-size: var(--ui-text-xs); font-weight: 700; text-transform: uppercase; letter-spacing: .05em; color: rgb(var(--ui-muted)); }
.assist-modal-content { margin: 0; white-space: pre-wrap; word-break: break-word; }
.assist-modal-rationale { padding-top: var(--ui-space-3); border-top: 1px dashed rgb(var(--ui-border)); }
.assist-modal-rationale-label { margin: 0 0 var(--ui-space-1); font-weight: 700; font-size: var(--ui-text-sm); }

/* ---- responsivo ---- */
@media (max-width: 860px) {
  .assist-grid { grid-template-columns: 1fr; }
  .assist-bubble { max-width: 92%; }
  .assist-thread { max-height: 50vh; }
}
</style>
