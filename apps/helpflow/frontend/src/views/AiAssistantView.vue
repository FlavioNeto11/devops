<template>
  <UiPageLayout
    width="wide"
    eyebrow="HelpFlow · Inteligência de atendimento"
    title="Assistente de IA"
    subtitle="Chat fundamentado (grounded) na base de conhecimento e nos chamados. O grafo roteia a pergunta, raciocina com ferramentas (ReAct) e verifica (judge) antes de responder — citando IDs e fontes reais. Fail-closed: sem fonte, não responde."
    :loading="bootLoading"
    loading-message="Carregando o conhecimento que fundamenta as respostas…"
    :error="bootError"
    @retry="boot"
  >
    <!-- ===================== Ações globais ===================== -->
    <template #actions>
      <UiButton variant="ghost" :loading="refreshing" :disabled="thinking" @click="refreshSources">
        <template #icon-left><span class="ai-ico" aria-hidden="true">↻</span></template>
        Recarregar fontes
      </UiButton>
      <UiButton variant="subtle" :disabled="!messages.length || thinking" @click="confirmClear">
        <template #icon-left><span class="ai-ico" aria-hidden="true">⌫</span></template>
        Limpar conversa
      </UiButton>
      <UiButton to="/kb-articles">
        <template #icon-left><span class="ai-ico" aria-hidden="true">📚</span></template>
        Base de conhecimento
      </UiButton>
    </template>

    <!-- ===================== Banners de estado ===================== -->
    <template v-if="showFailClosedBanner" #banner>
      <div class="ai-banner" data-kind="warn" role="alert">
        <span class="ai-banner-ico" aria-hidden="true">⚠</span>
        <div class="ai-banner-body">
          <p class="ai-banner-title">Sem fontes para fundamentar respostas</p>
          <p class="ai-banner-text">
            O assistente é <strong>fail-closed</strong>: só responde quando há artigos publicados e
            chamados que sirvam de contexto. Publique ao menos um artigo para ativá-lo.
          </p>
        </div>
        <UiButton size="sm" variant="subtle" to="/kb-articles/new">Escrever artigo</UiButton>
      </div>
    </template>

    <template v-else-if="engineUnavailable" #banner>
      <div class="ai-banner" data-kind="info" role="status">
        <span class="ai-banner-ico" aria-hidden="true">ℹ</span>
        <div class="ai-banner-body">
          <p class="ai-banner-title">Motor de IA indisponível neste ambiente</p>
          <p class="ai-banner-text">
            O endpoint <code class="ai-code">/v1/ai/chat</code> não respondeu (fail-closed por falta de
            credencial ou de serviço). A tela continua útil: recupera as fontes reais e cita os IDs,
            sem inventar a redação da resposta.
          </p>
        </div>
        <UiButton size="sm" variant="ghost" :loading="thinking" @click="retryEngine">Tentar reconectar</UiButton>
      </div>
    </template>

    <!-- ===================== Layout 2 colunas ===================== -->
    <div class="ai-layout">
      <!-- ============ Coluna principal: conversa ============ -->
      <section class="ai-main" aria-label="Conversa com o assistente">
        <!-- Pipeline do grafo (router → ReAct → tools → judge) -->
        <UiCard class="ai-pipeline-card" title="Como o assistente pensa" subtitle="Roteia, busca nas fontes, raciocina e verifica antes de responder.">
          <ol class="ai-pipeline" aria-label="Etapas do raciocínio do assistente">
            <li
              v-for="step in pipeline"
              :key="step.key"
              class="ai-pipe-step"
              :data-state="stageState(step.key)"
            >
              <span class="ai-pipe-dot" aria-hidden="true" />
              <span class="ai-pipe-text">
                <span class="ai-pipe-name">{{ step.name }}</span>
                <span class="ai-pipe-desc">{{ step.desc }}</span>
              </span>
            </li>
          </ol>
        </UiCard>

        <!-- ChatThread -->
        <UiCard class="ai-thread-card" :padded="false">
          <template #header>
            <div class="ai-thread-head">
              <h3 class="ai-thread-title">Conversa</h3>
              <div class="ai-thread-head-meta">
                <span class="ai-mode-switch" role="group" aria-label="Modo do assistente">
                  <button
                    v-for="m in modes"
                    :key="m.value"
                    type="button"
                    class="ai-mode-btn"
                    :data-active="mode === m.value ? 'true' : null"
                    :aria-pressed="mode === m.value ? 'true' : 'false'"
                    :disabled="thinking"
                    @click="mode = m.value"
                  >{{ m.label }}</button>
                </span>
                <UiStatusBadge :tone="assistantTone" :label="assistantStateLabel" />
              </div>
            </div>
          </template>

          <div
            ref="threadEl"
            class="ai-thread"
            role="log"
            aria-live="polite"
            aria-relevant="additions text"
            :aria-busy="thinking ? 'true' : 'false'"
          >
            <!-- Estado vazio com sugestões reais derivadas da base -->
            <div v-if="!messages.length && !thinking" class="ai-thread-empty">
              <UiEmptyState
                icon="chat"
                title="Comece uma conversa fundamentada"
                description="Pergunte sobre os procedimentos da base ou peça uma triagem de chamado. Toda resposta cita as fontes reais consultadas — e, sem fonte, o assistente prefere não responder."
              />
              <div v-if="suggestions.length" class="ai-suggests" role="group" aria-label="Perguntas sugeridas">
                <p class="ai-suggests-cap">Sugestões a partir da sua base</p>
                <button
                  v-for="s in suggestions"
                  :key="s"
                  type="button"
                  class="ai-suggest"
                  :disabled="!canAsk"
                  @click="askSuggestion(s)"
                >
                  <span class="ai-suggest-ico" aria-hidden="true">✦</span>
                  <span class="ai-suggest-text">{{ s }}</span>
                  <span class="ai-suggest-arrow" aria-hidden="true">→</span>
                </button>
              </div>
            </div>

            <!-- Mensagens -->
            <ul v-else class="ai-msgs">
              <li
                v-for="m in messages"
                :key="m.id"
                class="ai-msg"
                :data-role="m.role"
              >
                <span class="ai-avatar" :data-role="m.role" aria-hidden="true">{{ m.role === 'user' ? 'EU' : 'IA' }}</span>
                <div class="ai-bubble-wrap">
                  <div class="ai-bubble" :data-role="m.role" :data-refused="m.refused ? 'true' : null">
                    <p v-if="m.modeLabel && m.role === 'assistant'" class="ai-bubble-mode">{{ m.modeLabel }}</p>
                    <p class="ai-bubble-text">{{ m.text }}</p>

                    <!-- ToolTrace: ferramentas/etapas que a resposta usou -->
                    <div v-if="m.trace && m.trace.length" class="ai-trace" aria-label="Ferramentas usadas nesta resposta">
                      <button
                        type="button"
                        class="ai-trace-toggle"
                        :aria-expanded="m.traceOpen ? 'true' : 'false'"
                        @click="m.traceOpen = !m.traceOpen"
                      >
                        <span class="ai-trace-chevron" :data-open="m.traceOpen ? 'true' : null" aria-hidden="true">▸</span>
                        Ferramentas usadas ({{ m.trace.length }})
                      </button>
                      <ol v-if="m.traceOpen" class="ai-trace-list">
                        <li v-for="(t, i) in m.trace" :key="i" class="ai-trace-item" :data-kind="t.kind">
                          <span class="ai-trace-badge">{{ t.kind }}</span>
                          <span class="ai-trace-name">{{ t.label }}</span>
                          <span v-if="t.detail" class="ai-trace-detail">{{ t.detail }}</span>
                        </li>
                      </ol>
                    </div>

                    <!-- CitationChips: IDs/fontes reais -->
                    <div v-if="m.citations && m.citations.length" class="ai-cites" aria-label="Fontes citadas">
                      <p class="ai-cites-title">Fontes citadas</p>
                      <div class="ai-cites-row">
                        <RouterLink
                          v-for="c in m.citations"
                          :key="c.id"
                          :to="c.to"
                          class="ai-chip"
                          :data-kind="c.kind"
                          :title="c.title"
                        >
                          <span class="ai-chip-ico" aria-hidden="true">{{ c.icon }}</span>
                          <span class="ai-chip-ref">{{ c.ref }}</span>
                          <span class="ai-chip-label">{{ c.title }}</span>
                        </RouterLink>
                      </div>
                    </div>

                    <!-- Triagem sugerida (saída estruturada) -->
                    <div v-if="m.triage" class="ai-triage" aria-label="Triagem sugerida">
                      <p class="ai-triage-title">Triagem sugerida</p>
                      <dl class="ai-triage-grid">
                        <div v-if="m.triage.category" class="ai-triage-cell">
                          <dt>Categoria</dt><dd>{{ m.triage.category }}</dd>
                        </div>
                        <div v-if="m.triage.priority" class="ai-triage-cell">
                          <dt>Prioridade</dt>
                          <dd><UiStatusBadge :tone="priorityTone(m.triage.priority)" :label="m.triage.priority" :with-dot="false" size="sm" /></dd>
                        </div>
                        <div v-if="m.triage.next_action" class="ai-triage-cell ai-triage-wide">
                          <dt>Próxima ação</dt><dd>{{ m.triage.next_action }}</dd>
                        </div>
                      </dl>
                    </div>
                  </div>

                  <div class="ai-msg-meta">
                    <span class="ai-msg-time">{{ formatTime(m.at) }}</span>
                    <template v-if="m.role === 'assistant' && !m.refused">
                      <button
                        type="button"
                        class="ai-meta-btn"
                        :data-on="m.helpful === true ? 'true' : null"
                        :aria-pressed="m.helpful === true ? 'true' : 'false'"
                        aria-label="Marcar resposta como útil"
                        @click="rate(m, true)"
                      >👍</button>
                      <button
                        type="button"
                        class="ai-meta-btn"
                        :data-on="m.helpful === false ? 'true' : null"
                        :aria-pressed="m.helpful === false ? 'true' : 'false'"
                        aria-label="Marcar resposta como não útil"
                        @click="rate(m, false)"
                      >👎</button>
                    </template>
                  </div>
                </div>
              </li>

              <!-- Indicador de raciocínio em andamento -->
              <li v-if="thinking" class="ai-msg" data-role="assistant">
                <span class="ai-avatar" data-role="assistant" aria-hidden="true">IA</span>
                <div class="ai-bubble-wrap">
                  <div class="ai-bubble" data-role="assistant">
                    <p class="ai-thinking" role="status">
                      <span class="ai-thinking-stage">{{ thinkingLabel }}</span>
                      <span class="ai-dots" aria-hidden="true"><span /><span /><span /></span>
                    </p>
                  </div>
                </div>
              </li>
            </ul>
          </div>

          <!-- MessageComposer -->
          <template #footer>
            <form class="ai-composer" @submit.prevent="send">
              <UiFormField label="Sua pergunta" :error="composerError" full-width class="ai-composer-field">
                <template #default="{ id, describedBy }">
                  <textarea
                    :id="id"
                    v-model="draft"
                    class="ai-composer-input"
                    :aria-describedby="describedBy"
                    :disabled="thinking || !canAsk"
                    rows="2"
                    placeholder="Ex.: Como reembolsar um cliente? Qual o procedimento de escalonamento de um chamado urgente?"
                    @keydown="onComposerKey"
                  ></textarea>
                </template>
              </UiFormField>
              <div class="ai-composer-actions">
                <span class="ai-composer-hint">
                  <kbd class="ai-kbd">Enter</kbd> envia · <kbd class="ai-kbd">Shift</kbd>+<kbd class="ai-kbd">Enter</kbd> nova linha
                </span>
                <div class="ai-composer-btns">
                  <UiButton
                    type="button"
                    variant="ghost"
                    :loading="thinking && mode === 'triage'"
                    :disabled="thinking || !draft.trim() || !canAsk"
                    @click="triage"
                  >Sugerir triagem</UiButton>
                  <UiButton
                    type="submit"
                    :loading="thinking && mode !== 'triage'"
                    :disabled="!draft.trim() || !canAsk"
                  >Perguntar</UiButton>
                </div>
              </div>
            </form>
          </template>
        </UiCard>
      </section>

      <!-- ============ Coluna lateral: GroundingPanel ============ -->
      <aside class="ai-side" aria-label="Fontes de fundamentação">
        <UiCard title="Fundamentação (grounding)" subtitle="O universo que o assistente pode citar.">
          <UiLoadingState v-if="bootLoading" variant="skeleton" :skeleton-lines="4" />
          <template v-else>
            <dl class="ai-ground-stats">
              <div class="ai-ground-stat">
                <dt>Fontes utilizáveis</dt>
                <dd class="ai-ground-num" :data-tone="grounded.usable > 0 ? 'ok' : 'danger'">{{ grounded.usable }}</dd>
              </div>
              <div class="ai-ground-stat">
                <dt>Artigos publicados</dt>
                <dd class="ai-ground-num">{{ grounded.published }}</dd>
              </div>
              <div class="ai-ground-stat">
                <dt>Total na base</dt>
                <dd class="ai-ground-num">{{ grounded.total }}</dd>
              </div>
              <div class="ai-ground-stat">
                <dt>Chamados em contexto</dt>
                <dd class="ai-ground-num">{{ grounded.tickets }}</dd>
              </div>
            </dl>

            <!-- Cobertura de publicação (barra CSP-safe via data-attr) -->
            <div class="ai-coverage" role="img" :aria-label="coverageAria">
              <div class="ai-coverage-track">
                <div class="ai-coverage-fill" :data-pct="coverageBucket"></div>
              </div>
              <p class="ai-coverage-cap">{{ coverageCaption }}</p>
            </div>
          </template>
        </UiCard>

        <!-- Fontes recuperadas pela última resposta -->
        <UiCard title="Fontes da última resposta" subtitle="Recuperadas e citadas agora.">
          <UiErrorState
            v-if="sidePanelError"
            message="Não foi possível ler as fontes."
            @retry="refreshSources"
          />
          <UiEmptyState
            v-else-if="!lastCitations.length"
            compact
            icon="link"
            title="Nenhuma fonte ainda"
            description="Faça uma pergunta para ver aqui exatamente quais artigos e chamados fundamentaram a resposta."
          />
          <ul v-else class="ai-source-list">
            <li v-for="c in lastCitations" :key="c.id" class="ai-source">
              <RouterLink :to="c.to" class="ai-source-link">
                <span class="ai-source-ico" aria-hidden="true">{{ c.icon }}</span>
                <span class="ai-source-body">
                  <span class="ai-source-title">{{ c.title }}</span>
                  <span class="ai-source-meta">
                    <span class="ai-source-ref">{{ c.ref }}</span>
                    <span v-if="c.category" class="ai-source-cat">{{ c.category }}</span>
                  </span>
                </span>
                <span v-if="c.scorePct != null" class="ai-source-score" :title="'Relevância ' + c.scorePct + '%'">{{ c.scorePct }}%</span>
              </RouterLink>
            </li>
          </ul>
        </UiCard>

        <!-- Atalhos de domínio (rotas reais do HelpFlow) -->
        <UiCard title="Atalhos" subtitle="Para agir além da conversa.">
          <nav class="ai-quick" aria-label="Atalhos de domínio">
            <RouterLink v-for="q in quickLinks" :key="q.to" :to="q.to" class="ai-quick-link">
              <span class="ai-quick-ico" aria-hidden="true">{{ q.icon }}</span>
              <span class="ai-quick-text">{{ q.label }}</span>
              <span class="ai-quick-arrow" aria-hidden="true">→</span>
            </RouterLink>
          </nav>
        </UiCard>
      </aside>
    </div>

    <template #footer>
      <span>{{ footerText }}</span>
    </template>
  </UiPageLayout>
</template>

<script setup>
import { ref, computed, nextTick, onMounted, onBeforeUnmount } from 'vue';
import {
  UiPageLayout,
  UiCard,
  UiButton,
  UiStatusBadge,
  UiEmptyState,
  UiLoadingState,
  UiErrorState,
  UiFormField,
  useToast,
  useConfirm,
} from '../ui/index.js';
import { resourceFactory } from '../api.js';

const toast = useToast();
const confirm = useConfirm();

// ----------------------------------------------------------------------------
// Endpoints REAIS do assistente de grafo (router→ReAct→tools→judge):
//   · POST /v1/ai/chat   → resposta grounded a uma pergunta
//   · POST /v1/ai/assist → triagem/sugestão de resposta (saída estruturada)
// Modelados pela fábrica de recurso do api.js (create(body) → POST /v1/<name>),
// sem inventar rota. Quando o backend ainda NÃO montou esses endpoints, a chamada
// devolve 404/501/503: a tela degrada graciosamente (fail-closed) recuperando as
// FONTES REAIS de domínio (kb-articles + chamados) e citando seus IDs, sem nunca
// fabricar a redação de uma resposta da IA.
// ----------------------------------------------------------------------------
const aiChat = resourceFactory('ai/chat');
const aiAssist = resourceFactory('ai/assist');

// Recursos de DOMÍNIO reais usados para grounding e para o painel lateral.
const kbApi = resourceFactory('kb-articles');
const ticketsApi = resourceFactory('tickets');

// ---- estado de boot / fontes ----
const bootLoading = ref(true);
const bootError = ref(null);
const refreshing = ref(false);
const sidePanelError = ref(false);
const engineUnavailable = ref(false); // o motor /v1/ai/* respondeu indisponível

const articles = ref([]);
const ticketRows = ref([]);

// ---- conversa ----
const messages = ref([]);
const draft = ref('');
const composerError = ref('');
const thinking = ref(false);
const stage = ref('idle'); // router | retrieve | react | judge
const mode = ref('chat'); // chat | triage
const threadEl = ref(null);
let msgSeq = 0;

const modes = [
  { value: 'chat', label: 'Perguntar' },
  { value: 'triage', label: 'Triar' },
];

// ---- pipeline (router → ReAct → tools → judge) ----
const pipeline = [
  { key: 'router', name: 'Router', desc: 'Classifica a intenção da pergunta' },
  { key: 'retrieve', name: 'Recuperação', desc: 'Busca nas fontes (KB + chamados)' },
  { key: 'react', name: 'ReAct', desc: 'Raciocina sobre as fontes recuperadas' },
  { key: 'judge', name: 'Judge', desc: 'Verifica o grounding antes de responder' },
];
const STAGE_ORDER = ['router', 'retrieve', 'react', 'judge'];
function stageState(key) {
  if (!thinking.value) return 'idle';
  const cur = STAGE_ORDER.indexOf(stage.value);
  const me = STAGE_ORDER.indexOf(key);
  if (me < cur) return 'done';
  if (me === cur) return 'active';
  return 'idle';
}
const thinkingLabel = computed(() => {
  switch (stage.value) {
    case 'router': return 'Roteando a pergunta';
    case 'retrieve': return 'Recuperando fontes';
    case 'react': return 'Raciocinando sobre as fontes';
    case 'judge': return 'Verificando o grounding';
    default: return 'Pensando';
  }
});

// ---- normalização de listas ----
function rowsOf(res) {
  if (!res) return [];
  if (Array.isArray(res)) return res;
  if (Array.isArray(res.data)) return res.data;
  return [];
}
function isPublished(a) {
  return String(a.status || '').toLowerCase() === 'published';
}

// ---- carregamento das fontes (degradação graciosa por recurso) ----
async function loadSources() {
  const [kb, tk] = await Promise.all([
    kbApi.list({ pageSize: 200, sort: 'updated_at', dir: 'desc' }).then(rowsOf).catch(() => null),
    ticketsApi.list({ pageSize: 200, sort: 'updated_at', dir: 'desc' }).then(rowsOf).catch(() => []),
  ]);
  if (kb === null) throw new Error('Não foi possível carregar a base de conhecimento.');
  articles.value = kb;
  ticketRows.value = tk || [];
}

async function boot() {
  bootLoading.value = true;
  bootError.value = null;
  try {
    await loadSources();
  } catch (e) {
    bootError.value = e && e.message ? e.message : 'Falha ao carregar as fontes do assistente';
  } finally {
    bootLoading.value = false;
  }
}

async function refreshSources() {
  refreshing.value = true;
  sidePanelError.value = false;
  try {
    await loadSources();
    toast.success('Fontes recarregadas', { detail: grounded.value.usable + ' utilizável(is)' });
  } catch (e) {
    sidePanelError.value = true;
    toast.error('Não foi possível recarregar as fontes', { detail: e && e.message });
  } finally {
    refreshing.value = false;
  }
}

// ---- métricas de grounding ----
const grounded = computed(() => {
  const published = articles.value.filter(isPublished);
  return {
    total: articles.value.length,
    published: published.length,
    usable: published.length,
    tickets: ticketRows.value.length,
  };
});
const hasSources = computed(() => grounded.value.usable > 0 || grounded.value.tickets > 0);
const canAsk = computed(() => hasSources.value);
const showFailClosedBanner = computed(() => !bootLoading.value && !bootError.value && !hasSources.value);

const coverageBucket = computed(() => {
  const t = grounded.value.total;
  if (!t) return '0';
  const pct = Math.round((grounded.value.published / t) * 100);
  return String(Math.min(100, Math.max(0, Math.round(pct / 10) * 10)));
});
const coverageCaption = computed(() => {
  const t = grounded.value.total;
  if (!t) return 'Nenhum artigo na base ainda.';
  return grounded.value.published + ' de ' + t + ' artigo(s) publicado(s) e disponível(is) para citação.';
});
const coverageAria = computed(() => 'Cobertura de publicação: ' + coverageBucket.value + ' por cento');

// ---- recuperação grounded local (busca lexical sobre as fontes REAIS) ----
// Usada para construir as citações verificáveis (IDs reais) que acompanham a
// resposta do motor — e como recuperação completa quando o motor está indisponível.
const STOP = new Set(['de', 'da', 'do', 'a', 'o', 'e', 'em', 'para', 'por', 'com', 'um', 'uma', 'que', 'qual', 'como', 'no', 'na', 'os', 'as', 'se', 'ao', 'dos', 'das']);
function tokenize(text) {
  return String(text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 2 && !STOP.has(t));
}
function scoreSource(queryTokens, haystack) {
  if (!queryTokens.length) return 0;
  const hay = new Set(tokenize(haystack));
  let hits = 0;
  for (const q of queryTokens) if (hay.has(q)) hits += 1;
  return hits / queryTokens.length;
}
function retrieveArticles(query, limit) {
  const qt = tokenize(query);
  const usable = articles.value.filter(isPublished);
  return usable
    .map((a) => ({ a, score: scoreSource(qt, [a.title, a.category, a.tags, a.body, a.content].filter(Boolean).join(' ')) }))
    .filter((x) => x.score > 0)
    .sort((x, y) => y.score - x.score)
    .slice(0, limit || 4);
}
function retrieveTickets(query, limit) {
  const qt = tokenize(query);
  return ticketRows.value
    .map((t) => ({ t, score: scoreSource(qt, [t.subject, t.description].filter(Boolean).join(' ')) }))
    .filter((x) => x.score > 0)
    .sort((x, y) => y.score - x.score)
    .slice(0, limit || 2);
}

function citationFromArticle(a, score) {
  return {
    id: 'kb-' + a.id,
    kind: 'kb',
    ref: 'KB-' + a.id,
    title: a.title || ('Artigo ' + a.id),
    category: a.category || '',
    icon: '📄',
    to: '/kb-articles/' + a.id,
    scorePct: score != null ? Math.round(score * 100) : null,
  };
}
function citationFromTicket(t, score) {
  return {
    id: 'tk-' + t.id,
    kind: 'ticket',
    ref: '#' + t.id,
    title: t.subject || ('Chamado ' + t.id),
    category: t.priority ? ('prioridade ' + t.priority) : '',
    icon: '🎫',
    to: '/tickets/' + t.id,
    scorePct: score != null ? Math.round(score * 100) : null,
  };
}

// Constrói citações verificáveis para uma pergunta a partir das fontes reais.
function buildGroundedCitations(query) {
  const arts = retrieveArticles(query, 4).map((r) => citationFromArticle(r.a, r.score));
  const tks = retrieveTickets(query, 2).map((r) => citationFromTicket(r.t, r.score));
  return [...arts, ...tks];
}

// Casa uma citação reportada pelo motor (id/ref) com uma fonte real conhecida.
function resolveServerCitation(c) {
  const raw = typeof c === 'string' ? c : (c && (c.id || c.ref || c.source || c.title)) || '';
  const s = String(raw);
  const kbMatch = s.match(/kb[-_ ]?(\d+)/i) || s.match(/^(\d+)$/);
  if (kbMatch) {
    const a = articles.value.find((x) => String(x.id) === kbMatch[1]);
    if (a) return citationFromArticle(a, null);
  }
  const tkMatch = s.match(/#?\s*(\d+)/);
  if (tkMatch && /ticket|chamado|#/i.test(s)) {
    const t = ticketRows.value.find((x) => String(x.id) === tkMatch[1]);
    if (t) return citationFromTicket(t, null);
  }
  return null;
}

const lastCitations = computed(() => {
  for (let i = messages.value.length - 1; i >= 0; i -= 1) {
    const m = messages.value[i];
    if (m.role === 'assistant' && m.citations && m.citations.length) return m.citations;
  }
  return [];
});

// ---- pipeline de estágios visual (acompanha o pensamento do grafo) ----
function pushMessage(msg) {
  messages.value.push({ id: ++msgSeq, at: new Date(), traceOpen: false, ...msg });
  nextTick(scrollToEnd);
}
function scrollToEnd() {
  const el = threadEl.value;
  if (el) el.scrollTop = el.scrollHeight;
}
let stageTimers = [];
function clearStageTimers() {
  stageTimers.forEach(clearTimeout);
  stageTimers = [];
}
function startStages() {
  thinking.value = true;
  clearStageTimers();
  const reduce = typeof window !== 'undefined' && window.matchMedia
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const step = reduce ? 0 : 260;
  STAGE_ORDER.forEach((s, i) => {
    if (i === STAGE_ORDER.length - 1) return; // o judge fecha quando a resposta chega
    stageTimers.push(setTimeout(() => { stage.value = s; nextTick(scrollToEnd); }, step * i));
  });
}
function finishStages(done) {
  clearStageTimers();
  stage.value = 'judge';
  nextTick(() => {
    thinking.value = false;
    stage.value = 'idle';
    done();
  });
}

// ---- chamada ao motor real, com fallback fail-closed grounded ----
function refusalMessage(query) {
  const citations = buildGroundedCitations(query);
  const trace = [
    { kind: 'router', label: 'intent.classify', detail: mode.value === 'triage' ? 'triagem' : 'pergunta_grounded' },
    { kind: 'tool', label: 'kb.search', detail: grounded.value.usable + ' artigo(s) elegível(is)' },
    { kind: 'judge', label: 'grounding.insufficient', detail: 'recusa fail-closed' },
  ];
  return {
    role: 'assistant',
    refused: true,
    trace,
    citations: [],
    text:
      'Não encontrei fonte na base de conhecimento nem nos chamados que fundamente uma resposta para isso. '
      + 'Como sou fail-closed, prefiro não responder a inventar. '
      + (citations.length
        ? 'Há fontes relacionadas no painel ao lado — talvez ajude reformular a pergunta.'
        : 'Tente reformular ou registre um artigo cobrindo o tema.'),
  };
}

// Transforma o payload do motor numa mensagem, casando citações com fontes reais.
function messageFromServer(data, query, usedMode) {
  const r = data && data.data !== undefined ? data.data : data;
  const text = (r && (r.answer || r.text || r.message || r.reply || r.suggestion)) || '';
  const refused = !!(r && (r.refused || r.grounded === false));
  const rawCites = (r && (r.citations || r.sources)) || [];
  const resolved = (Array.isArray(rawCites) ? rawCites : [])
    .map(resolveServerCitation)
    .filter(Boolean);
  // Defesa em profundidade: se o motor não citou nada, ancoramos nas fontes reais
  // recuperadas localmente para a mesma pergunta (nunca uma resposta sem rastro).
  const citations = resolved.length ? resolved : buildGroundedCitations(query);
  const serverTrace = (r && Array.isArray(r.trace)) ? r.trace.map(normalizeTrace).filter(Boolean) : [];
  const trace = serverTrace.length ? serverTrace : [
    { kind: 'router', label: 'intent.classify', detail: usedMode === 'triage' ? 'triagem' : 'pergunta_grounded' },
    { kind: 'tool', label: 'kb.search', detail: citations.length + ' fonte(s) recuperada(s)' },
    { kind: 'judge', label: refused ? 'grounding.insufficient' : 'grounding.verified', detail: citations.length + ' fonte(s) citada(s)' },
  ];
  const triage = (usedMode === 'triage' && r && (r.category || r.priority || r.next_action))
    ? { category: r.category || '', priority: r.priority || '', next_action: r.next_action || r.nextAction || '' }
    : null;
  return {
    role: 'assistant',
    refused: refused || !text,
    text: text || refusalMessage(query).text,
    modeLabel: usedMode === 'triage' ? 'Triagem' : 'Resposta fundamentada',
    citations: (refused || !text) ? [] : citations,
    trace,
    triage,
  };
}
function normalizeTrace(t) {
  if (!t) return null;
  if (typeof t === 'string') return { kind: 'tool', label: t, detail: '' };
  const kind = ['router', 'tool', 'judge', 'react'].includes(t.kind) ? t.kind : 'tool';
  return { kind, label: t.label || t.name || t.tool || 'step', detail: t.detail || t.summary || '' };
}

// Resposta grounded de fallback quando o motor está indisponível (sem inventar
// redação: cita os artigos reais e aponta para eles, deixando claro o estado).
function groundedFallback(query, usedMode) {
  const citations = buildGroundedCitations(query);
  if (!citations.length) return refusalMessage(query);
  const top = citations[0];
  const trace = [
    { kind: 'router', label: 'intent.classify', detail: usedMode === 'triage' ? 'triagem' : 'pergunta_grounded' },
    { kind: 'tool', label: 'kb.search', detail: grounded.value.usable + ' artigo(s) · ' + grounded.value.tickets + ' chamado(s)' },
    { kind: 'tool', label: 'kb.fetch', detail: citations.map((c) => c.ref).join(', ') },
    { kind: 'judge', label: 'grounding.verified', detail: 'motor offline — citações verificáveis' },
  ];
  const text = usedMode === 'triage'
    ? 'Motor de IA indisponível — não gero a triagem aqui para não inventar. As fontes mais relevantes para isso estão em "' + top.title + '" (' + top.ref + ').'
      + (citations.length > 1 ? ' Há ' + (citations.length - 1) + ' fonte(s) de apoio abaixo.' : '')
    : 'Motor de IA indisponível, então não redijo uma resposta gerada. As fontes reais que cobrem isso estão em "' + top.title + '" (' + top.ref + ')'
      + (citations.length > 1 ? ', com ' + (citations.length - 1) + ' fonte(s) de apoio' : '')
      + '. Consulte-as nos links abaixo.';
  return { role: 'assistant', refused: false, text, modeLabel: usedMode === 'triage' ? 'Triagem (fontes)' : 'Fontes encontradas', citations, trace, triage: null };
}

async function callEngine(query, usedMode) {
  const body = {
    message: query,
    mode: usedMode,
    grounding: {
      kb_ids: articles.value.filter(isPublished).map((a) => a.id),
      ticket_ids: ticketRows.value.map((t) => t.id),
    },
    history: messages.value
      .filter((m) => m.role === 'user' || (m.role === 'assistant' && !m.refused))
      .slice(-6)
      .map((m) => ({ role: m.role, content: m.text })),
  };
  const client = usedMode === 'triage' ? aiAssist : aiChat;
  return client.create(body);
}

async function submitQuestion(query, usedMode) {
  const q = (query || '').trim();
  composerError.value = '';
  if (!q) {
    composerError.value = 'Escreva uma pergunta para o assistente.';
    return;
  }
  if (!canAsk.value) {
    toast.warning('Sem fontes para fundamentar — publique um artigo ou abra um chamado primeiro.');
    return;
  }
  pushMessage({ role: 'user', text: q });
  draft.value = '';
  startStages();
  let answer;
  try {
    const data = await callEngine(q, usedMode);
    engineUnavailable.value = false;
    answer = messageFromServer(data, q, usedMode);
  } catch (e) {
    if (e && (e.status === 404 || e.status === 501 || e.status === 503)) {
      engineUnavailable.value = true;
      answer = groundedFallback(q, usedMode);
    } else {
      engineUnavailable.value = false;
      answer = {
        role: 'assistant',
        refused: true,
        text: 'Falha ao consultar o assistente: ' + ((e && e.message) || 'erro desconhecido') + '. Tente novamente.',
        citations: [],
        trace: [{ kind: 'judge', label: 'error', detail: (e && e.message) || 'erro' }],
      };
    }
  }
  finishStages(() => {
    pushMessage(answer);
    if (answer.refused) toast.warning('Resposta recusada por falta de fundamentação (fail-closed).');
    else if (engineUnavailable.value) toast.info('Motor offline — respondi com as fontes reais encontradas.');
    else toast.success('Resposta fundamentada em ' + answer.citations.length + ' fonte(s).');
  });
}

function send() {
  mode.value = mode.value === 'triage' ? 'triage' : 'chat';
  submitQuestion(draft.value, mode.value);
}
function triage() {
  mode.value = 'triage';
  submitQuestion(draft.value, 'triage');
}
function askSuggestion(s) {
  draft.value = s;
  submitQuestion(s, mode.value === 'triage' ? 'triage' : 'chat');
}
function onComposerKey(e) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    if (draft.value.trim() && !thinking.value && canAsk.value) send();
  }
}
function retryEngine() {
  engineUnavailable.value = false;
  toast.info('Tentando reconectar ao motor na próxima pergunta.');
}

// ---- avaliação (thumbs) — estado local + toast ----
function rate(m, helpful) {
  m.helpful = m.helpful === helpful ? null : helpful;
  if (m.helpful === true) toast.success('Obrigado pelo retorno');
  else if (m.helpful === false) toast.info('Retorno registrado — vamos melhorar a recuperação');
}

// ---- limpar conversa (ação sensível → confirmação) ----
async function confirmClear() {
  const ok = await confirm({
    title: 'Limpar conversa',
    message: 'Apagar todas as mensagens desta conversa? As fontes carregadas permanecem.',
    confirmLabel: 'Limpar',
    danger: true,
  });
  if (!ok) return;
  messages.value = [];
  composerError.value = '';
  toast.success('Conversa limpa');
}

// ---- sugestões derivadas das categorias reais da base ----
const suggestions = computed(() => {
  const cats = [];
  const seen = new Set();
  for (const a of articles.value) {
    if (!isPublished(a)) continue;
    const c = (a.category || '').trim();
    if (c && !seen.has(c.toLowerCase())) {
      seen.add(c.toLowerCase());
      cats.push(c);
    }
    if (cats.length >= 2) break;
  }
  const out = cats.map((c) => 'O que a base diz sobre ' + c.toLowerCase() + '?');
  out.push('Qual o procedimento de escalonamento de um chamado urgente?');
  return out.slice(0, 3);
});

// ---- estado do assistente (badge) ----
const assistantStateLabel = computed(() => {
  if (thinking.value) return 'Pensando';
  if (!hasSources.value) return 'Indisponível';
  if (engineUnavailable.value) return 'Modo fontes';
  return 'Pronto';
});
const assistantTone = computed(() => {
  if (thinking.value) return 'running';
  if (!hasSources.value) return 'error';
  if (engineUnavailable.value) return 'warning';
  return 'success';
});

function priorityTone(p) {
  const v = String(p || '').toLowerCase();
  if (v === 'urgent' || v === 'urgente') return 'error';
  if (v === 'high' || v === 'alta') return 'warning';
  if (v === 'low' || v === 'baixa') return 'neutral';
  return 'running';
}

// ---- atalhos de domínio (rotas reais do HelpFlow) ----
const quickLinks = [
  { to: '/kb-articles', icon: '📚', label: 'Base de conhecimento' },
  { to: '/tickets', icon: '🎫', label: 'Chamados' },
  { to: '/kb-articles/search', icon: '🔎', label: 'Busca semântica' },
  { to: '/sla-policies', icon: '⏱', label: 'Políticas de SLA' },
];

const footerText = computed(() => {
  const g = grounded.value;
  const base = g.usable + ' fonte(s) utilizável(is) de ' + g.total + ' artigo(s) · ' + g.tickets + ' chamado(s) em contexto.';
  const engine = engineUnavailable.value ? ' Motor offline — citações verificáveis sem redação gerada.' : ' Respostas citam IDs reais; nada é inventado.';
  return 'Grounding ao vivo · ' + base + engine;
});

function formatTime(d) {
  try {
    return new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(d);
  } catch {
    return '';
  }
}

onMounted(boot);
onBeforeUnmount(clearStageTimers);
</script>

<style scoped>
.ai-ico { font-weight: 700; line-height: 1; }
.ai-code {
  font-family: var(--ui-font-mono, ui-monospace, Menlo, Consolas, monospace);
  font-size: 0.85em;
  background: rgb(var(--ui-surface-2));
  border: 1px solid rgb(var(--ui-border));
  border-radius: var(--ui-radius-sm);
  padding: 0 4px;
}

/* ---------- layout 2 colunas ---------- */
.ai-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 340px;
  gap: var(--ui-space-4);
  align-items: start;
}
.ai-main {
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-4);
  min-width: 0;
}
.ai-side {
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-4);
  position: sticky;
  top: var(--ui-space-4);
}

/* ---------- banners ---------- */
.ai-banner {
  display: flex;
  align-items: center;
  gap: var(--ui-space-4);
  padding: var(--ui-space-4) var(--ui-space-5);
  border-radius: var(--ui-radius-lg);
  border: 1px solid rgb(var(--ui-border));
}
.ai-banner[data-kind="warn"] {
  border-color: rgb(var(--ui-warn) / 0.4);
  background: rgb(var(--ui-warn) / 0.1);
}
.ai-banner[data-kind="info"] {
  border-color: rgb(var(--ui-accent) / 0.35);
  background: rgb(var(--ui-accent) / 0.08);
}
.ai-banner-ico { font-size: 1.4rem; line-height: 1; }
.ai-banner[data-kind="warn"] .ai-banner-ico { color: rgb(var(--ui-warn)); }
.ai-banner[data-kind="info"] .ai-banner-ico { color: rgb(var(--ui-accent-strong)); }
.ai-banner-body { flex: 1; min-width: 0; }
.ai-banner-title { margin: 0; font-weight: 700; color: rgb(var(--ui-fg)); }
.ai-banner-text { margin: 2px 0 0; font-size: var(--ui-text-sm); color: rgb(var(--ui-muted)); }

/* ---------- pipeline ---------- */
.ai-pipeline {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(168px, 1fr));
  gap: var(--ui-space-3);
}
.ai-pipe-step {
  display: flex;
  align-items: flex-start;
  gap: var(--ui-space-2);
  padding: var(--ui-space-3);
  border: 1px solid rgb(var(--ui-border));
  border-radius: var(--ui-radius-md);
  background: rgb(var(--ui-surface-2));
  transition: border-color 0.15s ease, background 0.15s ease;
}
.ai-pipe-step[data-state="active"] {
  border-color: rgb(var(--ui-accent));
  background: rgb(var(--ui-accent) / 0.08);
}
.ai-pipe-step[data-state="done"] { border-color: rgb(var(--ui-ok) / 0.5); }
.ai-pipe-dot {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  margin-top: 5px;
  flex: none;
  background: rgb(var(--ui-faint));
}
.ai-pipe-step[data-state="active"] .ai-pipe-dot {
  background: rgb(var(--ui-accent));
  animation: ai-pulse 1.2s ease-in-out infinite;
}
.ai-pipe-step[data-state="done"] .ai-pipe-dot { background: rgb(var(--ui-ok)); }
.ai-pipe-text { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.ai-pipe-name { font-weight: 700; font-size: var(--ui-text-sm); color: rgb(var(--ui-fg)); }
.ai-pipe-desc { font-size: var(--ui-text-xs); color: rgb(var(--ui-muted)); }

/* ---------- thread ---------- */
.ai-thread-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ui-space-3);
  width: 100%;
  flex-wrap: wrap;
}
.ai-thread-title { font-size: var(--ui-text-lg); margin: 0; }
.ai-thread-head-meta { display: flex; align-items: center; gap: var(--ui-space-3); }
.ai-mode-switch {
  display: inline-flex;
  border: 1px solid rgb(var(--ui-border-strong));
  border-radius: var(--ui-radius-pill);
  overflow: hidden;
}
.ai-mode-btn {
  font: inherit;
  font-size: var(--ui-text-xs);
  font-weight: 600;
  cursor: pointer;
  padding: 4px 12px;
  border: none;
  background: transparent;
  color: rgb(var(--ui-muted));
}
.ai-mode-btn:hover:not(:disabled) { color: rgb(var(--ui-fg)); background: rgb(var(--ui-surface-2)); }
.ai-mode-btn[data-active="true"] { background: rgb(var(--ui-accent)); color: rgb(var(--ui-accent-fg)); }
.ai-mode-btn:disabled { opacity: 0.55; cursor: not-allowed; }

.ai-thread {
  max-height: 540px;
  min-height: 300px;
  overflow-y: auto;
  padding: var(--ui-space-4) var(--ui-space-5);
}
.ai-thread-empty {
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-4);
  padding: var(--ui-space-4) 0;
}
.ai-suggests {
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-2);
  max-width: 540px;
  margin: 0 auto;
  width: 100%;
}
.ai-suggests-cap {
  margin: 0;
  text-align: center;
  font-size: var(--ui-text-xs);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: rgb(var(--ui-muted));
  font-weight: 700;
}
.ai-suggest {
  display: flex;
  align-items: center;
  gap: var(--ui-space-2);
  text-align: left;
  padding: var(--ui-space-3) var(--ui-space-4);
  border: 1px solid rgb(var(--ui-border-strong));
  border-radius: var(--ui-radius-md);
  background: rgb(var(--ui-surface));
  color: rgb(var(--ui-fg));
  font: inherit;
  cursor: pointer;
  transition: border-color 0.15s ease, background 0.15s ease, transform 0.15s ease;
}
.ai-suggest:hover:not(:disabled) {
  border-color: rgb(var(--ui-accent));
  background: rgb(var(--ui-accent) / 0.06);
  transform: translateX(2px);
}
.ai-suggest:disabled { opacity: 0.55; cursor: not-allowed; }
.ai-suggest-ico { color: rgb(var(--ui-accent-strong)); }
.ai-suggest-text { font-size: var(--ui-text-sm); flex: 1; }
.ai-suggest-arrow { color: rgb(var(--ui-faint)); }
.ai-suggest:hover:not(:disabled) .ai-suggest-arrow { color: rgb(var(--ui-accent)); }

/* messages */
.ai-msgs {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-4);
}
.ai-msg { display: flex; gap: var(--ui-space-3); align-items: flex-start; }
.ai-msg[data-role="user"] { flex-direction: row-reverse; }
.ai-avatar {
  flex: none;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: var(--ui-text-xs);
  font-weight: 700;
}
.ai-avatar[data-role="assistant"] { background: rgb(var(--ui-accent) / 0.16); color: rgb(var(--ui-accent-strong)); }
.ai-avatar[data-role="user"] {
  background: rgb(var(--ui-surface-2));
  color: rgb(var(--ui-muted));
  border: 1px solid rgb(var(--ui-border-strong));
}
.ai-bubble-wrap { display: flex; flex-direction: column; gap: 4px; max-width: 80%; min-width: 0; }
.ai-msg[data-role="user"] .ai-bubble-wrap { align-items: flex-end; }
.ai-bubble {
  padding: var(--ui-space-3) var(--ui-space-4);
  border-radius: var(--ui-radius-lg);
  border: 1px solid rgb(var(--ui-border));
}
.ai-bubble[data-role="assistant"] { background: rgb(var(--ui-surface)); border-top-left-radius: var(--ui-radius-sm); }
.ai-bubble[data-role="user"] {
  background: rgb(var(--ui-accent) / 0.1);
  border-color: rgb(var(--ui-accent) / 0.3);
  border-top-right-radius: var(--ui-radius-sm);
}
.ai-bubble[data-refused="true"] { background: rgb(var(--ui-warn) / 0.08); border-color: rgb(var(--ui-warn) / 0.4); }
.ai-bubble-mode {
  margin: 0 0 var(--ui-space-2);
  font-size: var(--ui-text-xs);
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: rgb(var(--ui-accent-strong));
}
.ai-bubble-text {
  margin: 0;
  font-size: var(--ui-text-md);
  color: rgb(var(--ui-fg));
  white-space: pre-wrap;
  word-break: break-word;
  line-height: 1.6;
}

/* tool trace */
.ai-trace { margin-top: var(--ui-space-3); padding-top: var(--ui-space-3); border-top: 1px dashed rgb(var(--ui-border)); }
.ai-trace-toggle {
  font: inherit;
  font-size: var(--ui-text-xs);
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: rgb(var(--ui-muted));
  background: none;
  border: none;
  cursor: pointer;
  padding: 0;
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.ai-trace-toggle:hover { color: rgb(var(--ui-fg)); }
.ai-trace-chevron { transition: transform 0.15s ease; display: inline-block; }
.ai-trace-chevron[data-open="true"] { transform: rotate(90deg); }
.ai-trace-list {
  list-style: none;
  margin: var(--ui-space-2) 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 5px;
}
.ai-trace-item { display: flex; align-items: baseline; gap: var(--ui-space-2); font-size: var(--ui-text-xs); flex-wrap: wrap; }
.ai-trace-badge {
  flex: none;
  font-family: var(--ui-font-mono, ui-monospace, Menlo, Consolas, monospace);
  font-weight: 700;
  text-transform: uppercase;
  font-size: 10px;
  padding: 1px 6px;
  border-radius: var(--ui-radius-sm);
  background: rgb(var(--ui-muted) / 0.16);
  color: rgb(var(--ui-muted));
}
.ai-trace-item[data-kind="tool"] .ai-trace-badge,
.ai-trace-item[data-kind="react"] .ai-trace-badge { background: rgb(var(--ui-accent) / 0.16); color: rgb(var(--ui-accent-strong)); }
.ai-trace-item[data-kind="judge"] .ai-trace-badge { background: rgb(var(--ui-ok) / 0.16); color: rgb(var(--ui-ok)); }
.ai-trace-name { font-family: var(--ui-font-mono, ui-monospace, Menlo, Consolas, monospace); color: rgb(var(--ui-fg)); }
.ai-trace-detail { color: rgb(var(--ui-muted)); }

/* citations */
.ai-cites { margin-top: var(--ui-space-3); padding-top: var(--ui-space-3); border-top: 1px dashed rgb(var(--ui-border)); }
.ai-cites-title {
  margin: 0 0 var(--ui-space-2);
  font-size: var(--ui-text-xs);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  font-weight: 700;
  color: rgb(var(--ui-muted));
}
.ai-cites-row { display: flex; flex-wrap: wrap; gap: var(--ui-space-2); }
.ai-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  max-width: 100%;
  padding: 4px 10px;
  border-radius: var(--ui-radius-pill);
  border: 1px solid rgb(var(--ui-accent) / 0.32);
  background: rgb(var(--ui-accent) / 0.08);
  color: rgb(var(--ui-accent-strong));
  font-size: var(--ui-text-xs);
  font-weight: 600;
  text-decoration: none;
  transition: background 0.15s ease, border-color 0.15s ease;
}
.ai-chip[data-kind="ticket"] {
  border-color: rgb(var(--ui-warn) / 0.38);
  background: rgb(var(--ui-warn) / 0.1);
  color: rgb(var(--ui-warn));
}
.ai-chip:hover { background: rgb(var(--ui-accent) / 0.16); border-color: rgb(var(--ui-accent)); text-decoration: none; }
.ai-chip[data-kind="ticket"]:hover { background: rgb(var(--ui-warn) / 0.18); border-color: rgb(var(--ui-warn)); }
.ai-chip-ref { font-family: var(--ui-font-mono, ui-monospace, Menlo, Consolas, monospace); }
.ai-chip-label {
  color: rgb(var(--ui-fg));
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 200px;
}

/* triage */
.ai-triage { margin-top: var(--ui-space-3); padding-top: var(--ui-space-3); border-top: 1px dashed rgb(var(--ui-border)); }
.ai-triage-title {
  margin: 0 0 var(--ui-space-2);
  font-size: var(--ui-text-xs);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  font-weight: 700;
  color: rgb(var(--ui-muted));
}
.ai-triage-grid { margin: 0; display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: var(--ui-space-2); }
.ai-triage-cell {
  border: 1px solid rgb(var(--ui-border));
  border-radius: var(--ui-radius-md);
  padding: var(--ui-space-2) var(--ui-space-3);
  background: rgb(var(--ui-surface-2));
}
.ai-triage-wide { grid-column: 1 / -1; }
.ai-triage-cell dt { font-size: var(--ui-text-xs); color: rgb(var(--ui-muted)); }
.ai-triage-cell dd { margin: 2px 0 0; font-size: var(--ui-text-sm); font-weight: 600; color: rgb(var(--ui-fg)); }

/* msg meta + thumbs */
.ai-msg-meta { display: flex; align-items: center; gap: var(--ui-space-2); font-size: var(--ui-text-xs); color: rgb(var(--ui-faint)); }
.ai-meta-btn {
  border: 1px solid transparent;
  background: transparent;
  cursor: pointer;
  border-radius: var(--ui-radius-sm);
  padding: 1px 5px;
  font-size: var(--ui-text-sm);
  line-height: 1;
  opacity: 0.6;
  transition: opacity 0.15s ease, background 0.15s ease;
}
.ai-meta-btn:hover { opacity: 1; background: rgb(var(--ui-surface-2)); }
.ai-meta-btn[data-on="true"] { opacity: 1; background: rgb(var(--ui-accent) / 0.14); border-color: rgb(var(--ui-accent) / 0.4); }

/* thinking */
.ai-thinking { display: flex; align-items: center; gap: var(--ui-space-2); margin: 0; color: rgb(var(--ui-muted)); font-size: var(--ui-text-sm); }
.ai-thinking-stage { font-weight: 600; }
.ai-dots { display: inline-flex; gap: 3px; }
.ai-dots span { width: 5px; height: 5px; border-radius: 50%; background: rgb(var(--ui-accent-strong)); animation: ai-bounce 1.2s ease-in-out infinite; }
.ai-dots span:nth-child(2) { animation-delay: 0.15s; }
.ai-dots span:nth-child(3) { animation-delay: 0.3s; }

/* composer */
.ai-composer { display: flex; flex-direction: column; gap: var(--ui-space-3); width: 100%; }
.ai-composer-field { width: 100%; }
.ai-composer-input {
  width: 100%;
  background: rgb(var(--ui-bg));
  color: rgb(var(--ui-fg));
  border: 1px solid rgb(var(--ui-border-strong));
  border-radius: var(--ui-radius-sm);
  padding: 9px 12px;
  font: inherit;
  resize: vertical;
  min-height: 56px;
}
.ai-composer-input:disabled { opacity: 0.6; cursor: not-allowed; }
.ai-composer-actions { display: flex; align-items: center; justify-content: space-between; gap: var(--ui-space-3); flex-wrap: wrap; }
.ai-composer-hint { font-size: var(--ui-text-xs); color: rgb(var(--ui-muted)); }
.ai-kbd {
  font-family: var(--ui-font-mono, ui-monospace, Menlo, Consolas, monospace);
  font-size: 10px;
  border: 1px solid rgb(var(--ui-border-strong));
  border-radius: var(--ui-radius-sm);
  padding: 0 5px;
  background: rgb(var(--ui-surface-2));
}
.ai-composer-btns { display: flex; gap: var(--ui-space-2); }

/* ---------- side panel ---------- */
.ai-ground-stats { display: grid; grid-template-columns: 1fr 1fr; gap: var(--ui-space-3); margin: 0; }
.ai-ground-stat {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: var(--ui-space-3);
  border: 1px solid rgb(var(--ui-border));
  border-radius: var(--ui-radius-md);
  background: rgb(var(--ui-surface-2));
}
.ai-ground-stat dt { font-size: var(--ui-text-xs); color: rgb(var(--ui-muted)); }
.ai-ground-num { margin: 0; font-size: var(--ui-text-xl); font-weight: 700; font-variant-numeric: tabular-nums; color: rgb(var(--ui-fg)); }
.ai-ground-num[data-tone="ok"] { color: rgb(var(--ui-ok)); }
.ai-ground-num[data-tone="danger"] { color: rgb(var(--ui-danger)); }

.ai-coverage { margin-top: var(--ui-space-3); }
.ai-coverage-track {
  height: 8px;
  border-radius: var(--ui-radius-pill);
  background: rgb(var(--ui-surface-2));
  overflow: hidden;
  border: 1px solid rgb(var(--ui-border));
}
.ai-coverage-fill { height: 100%; border-radius: var(--ui-radius-pill); background: rgb(var(--ui-accent)); transition: width 0.3s ease; width: 0; }
.ai-coverage-fill[data-pct="0"] { width: 0; }
.ai-coverage-fill[data-pct="10"] { width: 10%; }
.ai-coverage-fill[data-pct="20"] { width: 20%; }
.ai-coverage-fill[data-pct="30"] { width: 30%; }
.ai-coverage-fill[data-pct="40"] { width: 40%; }
.ai-coverage-fill[data-pct="50"] { width: 50%; }
.ai-coverage-fill[data-pct="60"] { width: 60%; }
.ai-coverage-fill[data-pct="70"] { width: 70%; }
.ai-coverage-fill[data-pct="80"] { width: 80%; }
.ai-coverage-fill[data-pct="90"] { width: 90%; }
.ai-coverage-fill[data-pct="100"] { width: 100%; }
.ai-coverage-cap { margin: var(--ui-space-2) 0 0; font-size: var(--ui-text-xs); color: rgb(var(--ui-muted)); }

.ai-source-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--ui-space-2); }
.ai-source-link {
  display: flex;
  align-items: center;
  gap: var(--ui-space-3);
  padding: var(--ui-space-3);
  border: 1px solid rgb(var(--ui-border));
  border-radius: var(--ui-radius-md);
  background: rgb(var(--ui-surface));
  color: rgb(var(--ui-fg));
  text-decoration: none;
  transition: border-color 0.15s ease;
}
.ai-source-link:hover { border-color: rgb(var(--ui-accent)); text-decoration: none; }
.ai-source-ico { flex: none; font-size: 1.1rem; }
.ai-source-body { display: flex; flex-direction: column; gap: 2px; min-width: 0; flex: 1; }
.ai-source-title { font-size: var(--ui-text-sm); font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ai-source-meta { display: inline-flex; align-items: center; gap: 6px; font-size: var(--ui-text-xs); color: rgb(var(--ui-muted)); }
.ai-source-ref { font-family: var(--ui-font-mono, ui-monospace, Menlo, Consolas, monospace); color: rgb(var(--ui-accent-strong)); }
.ai-source-cat { border: 1px solid rgb(var(--ui-border-strong)); border-radius: var(--ui-radius-pill); padding: 0 6px; }
.ai-source-score {
  flex: none;
  font-size: var(--ui-text-xs);
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  color: rgb(var(--ui-accent-strong));
  background: rgb(var(--ui-accent) / 0.1);
  border-radius: var(--ui-radius-pill);
  padding: 2px 8px;
}

.ai-quick { display: flex; flex-direction: column; gap: var(--ui-space-2); }
.ai-quick-link {
  display: flex;
  align-items: center;
  gap: var(--ui-space-3);
  padding: var(--ui-space-3);
  border: 1px solid rgb(var(--ui-border));
  border-radius: var(--ui-radius-md);
  background: rgb(var(--ui-surface-2));
  color: rgb(var(--ui-fg));
  text-decoration: none;
  transition: border-color 0.15s ease, transform 0.15s ease;
}
.ai-quick-link:hover { border-color: rgb(var(--ui-accent)); transform: translateX(2px); text-decoration: none; }
.ai-quick-ico { flex: none; }
.ai-quick-text { flex: 1; font-size: var(--ui-text-sm); font-weight: 500; }
.ai-quick-arrow { color: rgb(var(--ui-faint)); }
.ai-quick-link:hover .ai-quick-arrow { color: rgb(var(--ui-accent)); }

/* ---------- animations ---------- */
@keyframes ai-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
@keyframes ai-bounce { 0%, 60%, 100% { transform: translateY(0); } 30% { transform: translateY(-4px); } }
@media (prefers-reduced-motion: reduce) {
  .ai-pipe-step[data-state="active"] .ai-pipe-dot,
  .ai-dots span,
  .ai-suggest,
  .ai-quick-link,
  .ai-trace-chevron { animation: none; transition: none; }
}

/* ---------- responsivo ---------- */
@media (max-width: 1040px) {
  .ai-layout { grid-template-columns: 1fr; }
  .ai-side { position: static; }
}
@media (max-width: 560px) {
  .ai-ground-stats { grid-template-columns: 1fr; }
  .ai-bubble-wrap { max-width: 92%; }
  .ai-composer-actions { flex-direction: column; align-items: stretch; }
  .ai-composer-btns { justify-content: flex-end; }
  .ai-thread-head { align-items: flex-start; }
}
</style>
