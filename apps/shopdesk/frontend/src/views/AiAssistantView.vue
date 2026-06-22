<!--
  AiAssistantView — Assistente de IA do lojista (REQ-SHOPDESK-0006)
  Espaço do assistente: (1) perguntas sobre pedidos via RAG com citação de fontes,
  (2) sugerir preço com intervalo de confiança em dry-run, (3) descrição SEO em dry-run.
  Toda sugestão exige "Aplicar" (confirmação explícita); falha-fechada com erro estruturado.

  Contrato de UI: usa SÓ o kit ui-vue, SÓ tokens --ui-*; sem style inline / :style / v-html;
  todos os estados (loading/empty/error/normal); endpoints reais via ../api.js.

  Grounding HONESTO: citações e intervalo de confiança vêm ESTRUTURADOS da resposta do
  backend (r.citations/r.sources, r.confidence, r.range/r.price) — a UI NUNCA inventa fonte
  nem faixa fazendo scraping da prosa. Quando o backend não envia esses campos, a sugestão
  aparece sem o selo de grounding (degradação graciosa), deixando claro que é só texto.
  Saúde do assistente é verificada por GET /v1/assistant/health (sem custo de inferência).
-->
<template>
  <UiPageLayout
    eyebrow="ShopDesk · IA"
    title="Assistente da loja"
    subtitle="Pergunte sobre seus pedidos e peça sugestões de preço e descrição. Nada é alterado sem você clicar em Aplicar."
    width="wide"
  >
    <!-- ===================== AÇÕES DO CABEÇALHO ===================== -->
    <template #actions>
      <AiHealthBadge :state="health.state" :model="health.model" @recheck="checkHealth" />
      <UiButton
        variant="ghost"
        size="sm"
        :disabled="!hasHistory"
        @click="clearConversation"
      >
        <template #icon-left><span aria-hidden="true">↺</span></template>
        Limpar conversa
      </UiButton>
    </template>

    <!-- ===================== BANNER DE SAÚDE / FAIL-CLOSED ===================== -->
    <template #banner>
      <div class="aiv-banner" :data-tone="bannerTone" role="status">
        <span class="aiv-banner-dot" aria-hidden="true" />
        <span class="aiv-banner-text">
          <template v-if="health.state === 'checking'">Verificando o assistente de IA…</template>
          <template v-else-if="health.state === 'online'">
            <strong>Assistente no ar.</strong>
            Respostas são sugestões fundamentadas (grounded) — sempre confira antes de aplicar.
          </template>
          <template v-else-if="health.state === 'offline'">
            <strong>Assistente indisponível.</strong>
            A IA está desligada nesta instalação (fail-closed). Configure a chave do provedor para habilitar.
          </template>
          <template v-else>
            <strong>Não foi possível falar com o assistente.</strong>
            Verifique a conexão e tente novamente.
          </template>
        </span>
        <UiButton
          v-if="health.state === 'error'"
          variant="ghost"
          size="sm"
          @click="checkHealth"
        >Tentar de novo</UiButton>
      </div>
    </template>

    <!-- ===================== ESTADO: IA DESLIGADA (fail-closed) ===================== -->
    <UiCard v-if="health.state === 'offline'">
      <UiEmptyState
        icon="🔌"
        title="Assistente de IA desligado"
        description="Esta loja está rodando sem o assistente. Por segurança, ele falha-fechado: nenhuma sugestão é gerada sem o provedor de IA configurado."
      >
        <template #action>
          <UiButton variant="ghost" @click="checkHealth">Verificar novamente</UiButton>
        </template>
      </UiEmptyState>
    </UiCard>

    <!-- ===================== ESTADO: VERIFICANDO SAÚDE (primeira carga) ===================== -->
    <UiCard v-else-if="health.state === 'checking'">
      <UiLoadingState title="Verificando o assistente…" description="Conferindo se a IA está disponível nesta loja." />
    </UiCard>

    <!-- ===================== CONTEÚDO PRINCIPAL ===================== -->
    <div v-else class="aiv-grid">
      <!-- -------- COLUNA: CONVERSA (RAG) -------- -->
      <UiCard class="aiv-chat" title="Conversa" subtitle="Pergunte sobre pedidos, status, pagamentos e notas.">
        <template #actions>
          <UiStatusBadge
            :tone="health.state === 'online' ? 'success' : 'neutral'"
            :label="health.state === 'online' ? 'RAG ativo' : 'RAG em espera'"
            size="sm"
          />
        </template>

        <!-- Log da conversa (aria-live para leitores de tela) -->
        <div
          ref="logEl"
          class="aiv-log"
          role="log"
          aria-live="polite"
          aria-label="Histórico da conversa com o assistente"
        >
          <!-- empty: nenhuma mensagem ainda -->
          <div v-if="!messages.length && !thinking" class="aiv-welcome">
            <UiEmptyState
              icon="✨"
              title="Como posso ajudar?"
              description="Faça uma pergunta sobre a sua loja. Quando o assistente cita fontes (pedidos, NF-e, pagamentos), elas aparecem listadas na resposta."
            />
            <div class="aiv-suggestions" role="group" aria-label="Sugestões de perguntas">
              <UiButton
                v-for="(s, i) in starterPrompts"
                :key="i"
                variant="subtle"
                size="sm"
                :disabled="health.state !== 'online'"
                @click="useStarter(s)"
              >{{ s }}</UiButton>
            </div>
          </div>

          <!-- mensagens -->
          <article
            v-for="m in messages"
            :key="m.id"
            class="aiv-msg"
            :data-role="m.role"
          >
            <span class="aiv-msg-avatar" aria-hidden="true">{{ m.role === 'user' ? '🧑' : '🤖' }}</span>
            <div class="aiv-msg-body">
              <p class="aiv-msg-author">{{ m.role === 'user' ? 'Você' : 'Assistente' }}</p>

              <!-- erro estruturado por mensagem -->
              <div v-if="m.error" class="aiv-msg-error" role="alert">
                <p class="aiv-msg-error-title">{{ m.error.message }}</p>
                <p v-if="m.error.code" class="aiv-msg-error-code ui-mono">código: {{ m.error.code }}</p>
                <UiButton size="sm" variant="ghost" @click="retryMessage(m)">Tentar de novo</UiButton>
              </div>

              <!-- texto da resposta (parágrafos, sem v-html) -->
              <template v-else>
                <p v-for="(para, pi) in toParagraphs(m.text)" :key="pi" class="aiv-msg-text">{{ para }}</p>

                <!-- citações de fontes (CitationList) — só quando o backend envia grounding -->
                <CitationList v-if="m.citations && m.citations.length" :citations="m.citations" />
              </template>
            </div>
          </article>

          <!-- thinking: resposta em andamento -->
          <article v-if="thinking" class="aiv-msg" data-role="assistant" aria-hidden="false">
            <span class="aiv-msg-avatar" aria-hidden="true">🤖</span>
            <div class="aiv-msg-body">
              <p class="aiv-msg-author">Assistente</p>
              <UiLoadingState title="Consultando seus dados…" />
            </div>
          </article>
        </div>

        <!-- composer (useForm: 1 campo, anti-duplo-submit + validação declarativa) -->
        <form class="aiv-composer" @submit.prevent="composer.handleSubmit(onAsk)">
          <UiFormField label="Sua pergunta" :error="composer.errors.question" class="aiv-composer-field">
            <template #default="{ id, describedBy }">
              <textarea
                :id="id"
                v-model="composer.values.question"
                class="aiv-textarea"
                rows="2"
                :aria-describedby="describedBy"
                :disabled="thinking || health.state !== 'online'"
                placeholder="Ex.: Quais pedidos ainda não foram pagos esta semana?"
                @keydown="onComposerKey"
              ></textarea>
            </template>
          </UiFormField>
          <div class="aiv-composer-actions">
            <p class="aiv-composer-hint ui-muted">Enter envia · Shift+Enter quebra linha</p>
            <UiButton
              type="submit"
              :loading="thinking"
              :disabled="!canSend"
            >Perguntar</UiButton>
          </div>
        </form>
      </UiCard>

      <!-- -------- COLUNA: FERRAMENTAS DE SUGESTÃO -------- -->
      <div class="aiv-tools">
        <!-- ferramenta: sugerir preço -->
        <UiCard title="Sugerir preço" subtitle="Recebe uma faixa com intervalo de confiança — em dry-run.">
          <form class="aiv-form" @submit.prevent="priceForm.handleSubmit(onSuggestPrice)">
            <UiFormField label="Produto" required :error="priceForm.errors.product">
              <template #default="{ id, describedBy }">
                <input :id="id" v-model="priceForm.values.product" :aria-describedby="describedBy" type="text" placeholder="Ex.: Camiseta básica preta" :disabled="priceBusy" />
              </template>
            </UiFormField>
            <div class="aiv-form-row">
              <UiFormField label="Custo (R$)" :error="priceForm.errors.cost" hint="opcional — ajuda a calibrar a margem">
                <template #default="{ id, describedBy }">
                  <input :id="id" v-model="priceForm.values.cost" :aria-describedby="describedBy" type="number" min="0" step="0.01" placeholder="0,00" :disabled="priceBusy" />
                </template>
              </UiFormField>
              <UiFormField label="Margem-alvo (%)" :error="priceForm.errors.margin" hint="opcional">
                <template #default="{ id, describedBy }">
                  <input :id="id" v-model="priceForm.values.margin" :aria-describedby="describedBy" type="number" min="0" max="500" step="1" placeholder="40" :disabled="priceBusy" />
                </template>
              </UiFormField>
            </div>
            <UiButton type="submit" block :loading="priceBusy" :disabled="health.state !== 'online'">Sugerir preço (dry-run)</UiButton>
          </form>

          <!-- resultado: SuggestionCard de preço -->
          <SuggestionCard
            v-if="priceResult"
            class="aiv-result"
            kind="price"
            title="Preço sugerido"
            :value="priceResult.formattedValue"
            :raw="priceResult.text"
            :confidence="priceResult.confidence"
            :range-low="priceResult.formattedLow"
            :range-high="priceResult.formattedHigh"
            :citations="priceResult.citations"
            apply-label="Levar para o produto"
            :dirty="true"
            :applying="priceApplying"
            @apply="applyPrice"
            @dismiss="priceResult = null"
          />
          <UiErrorState
            v-else-if="priceError"
            :message="priceError.message"
            :code="priceError.code"
            :retryable="true"
            @retry="priceForm.handleSubmit(onSuggestPrice)"
          />
        </UiCard>

        <!-- ferramenta: descrição SEO -->
        <UiCard title="Descrição SEO" subtitle="Gera um texto de vitrine otimizado — em dry-run.">
          <form class="aiv-form" @submit.prevent="seoForm.handleSubmit(onSuggestSeo)">
            <UiFormField label="Produto" required :error="seoForm.errors.product">
              <template #default="{ id, describedBy }">
                <input :id="id" v-model="seoForm.values.product" :aria-describedby="describedBy" type="text" placeholder="Ex.: Tênis de corrida leve" :disabled="seoBusy" />
              </template>
            </UiFormField>
            <UiFormField label="Palavras-chave" :error="seoForm.errors.keywords" hint="separadas por vírgula (opcional)">
              <template #default="{ id, describedBy }">
                <input :id="id" v-model="seoForm.values.keywords" :aria-describedby="describedBy" type="text" placeholder="leve, respirável, corrida" :disabled="seoBusy" />
              </template>
            </UiFormField>
            <UiButton type="submit" block :loading="seoBusy" :disabled="health.state !== 'online'">Gerar descrição (dry-run)</UiButton>
          </form>

          <!-- resultado: SuggestionCard de descrição -->
          <SuggestionCard
            v-if="seoResult"
            class="aiv-result"
            kind="text"
            title="Descrição sugerida"
            :raw="seoResult.text"
            :confidence="seoResult.confidence"
            :citations="seoResult.citations"
            apply-label="Levar para o produto"
            :dirty="true"
            :applying="seoApplying"
            @apply="applySeo"
            @dismiss="seoResult = null"
          />
          <UiErrorState
            v-else-if="seoError"
            :message="seoError.message"
            :code="seoError.code"
            :retryable="true"
            @retry="seoForm.handleSubmit(onSuggestSeo)"
          />
        </UiCard>
      </div>
    </div>

    <template #footer>
      <p>O assistente nunca grava sozinho: toda sugestão é dry-run. Em <strong>Levar para o produto</strong> você abre o produto e confirma a alteração lá.</p>
    </template>
  </UiPageLayout>
</template>

<script setup>
import { ref, reactive, computed, nextTick, onMounted, h } from 'vue';
import {
  UiPageLayout,
  UiCard,
  UiButton,
  UiFormField,
  UiStatusBadge,
  UiEmptyState,
  UiLoadingState,
  UiErrorState,
  useToast,
  useConfirm,
  useForm,
  validators,
  format,
} from '../ui/index.js';
import { store, health as apiHealth } from '../api.js';

const { required, min, max } = validators;

// ===========================================================================
// Subcomponentes locais (render functions h() — compatíveis com o build runtime-only
// do Vue; sem template string, sem compilador em runtime). Apenas UI; consomem o
// kit (UiButton/UiStatusBadge) e os tokens via classes. Declarados no escopo do
// <script setup> => usáveis no template.
// ===========================================================================

// AiHealthBadge — pílula de status do assistente clicável (recheck). Reusa UiStatusBadge
// para o visual de tom/rótulo e UiButton (ghost) para o comportamento de botão (foco,
// disabled, estados) — evita reinventar primitivos do kit.
const AiHealthBadge = {
  name: 'AiHealthBadge',
  props: { state: { type: String, default: 'checking' }, model: { type: String, default: '' } },
  emits: ['recheck'],
  setup(props, { emit }) {
    const TONES = { online: 'success', offline: 'neutral', error: 'error', checking: 'running' };
    const LABELS = { online: 'IA no ar', offline: 'IA desligada', error: 'IA com erro', checking: 'Verificando…' };
    return () =>
      h(
        UiButton,
        {
          variant: 'ghost',
          size: 'sm',
          title: props.model ? 'Modelo: ' + props.model + ' — clique para reverificar' : 'Clique para reverificar o assistente',
          onClick: () => emit('recheck'),
        },
        {
          default: () =>
            h(UiStatusBadge, {
              tone: TONES[props.state] || 'neutral',
              label: LABELS[props.state] || 'IA',
              size: 'sm',
            }),
        },
      );
  },
};

// CitationList — lista de fontes citadas pela IA (RAG grounding). Recebe citações
// ESTRUTURADAS vindas do backend; nunca derivadas da prosa.
const CitationList = {
  name: 'CitationList',
  props: { citations: { type: Array, default: () => [] } },
  setup(props) {
    return () => {
      if (!props.citations.length) return null;
      return h('div', { class: 'aiv-cites' }, [
        h('p', { class: 'aiv-cites-title' }, 'Fontes consultadas'),
        h(
          'ol',
          { class: 'aiv-cites-list' },
          props.citations.map((c, i) =>
            h('li', { key: i, class: 'aiv-cite' }, [
              h('span', { class: 'aiv-cite-index', 'aria-hidden': 'true' }, String(i + 1)),
              h('span', { class: 'aiv-cite-main' }, [
                h('span', { class: 'aiv-cite-label' }, c.label || c.title || 'Fonte ' + (i + 1)),
                c.ref ? h('span', { class: 'aiv-cite-ref ui-mono' }, c.ref) : null,
              ]),
              c.kind ? h('span', { class: 'aiv-cite-kind' }, c.kind) : null,
            ]),
          ),
        ),
      ]);
    };
  },
};

// ApplyButton — par descartar/aplicar (a aplicação exige confirmação no handler do pai).
// Usa UiButton do kit (não <button class="ui-btn"> cru) para herdar foco/disabled/loading.
const ApplyButton = {
  name: 'ApplyButton',
  props: { applying: Boolean, disabled: Boolean, label: { type: String, default: 'Aplicar' } },
  emits: ['apply', 'dismiss'],
  setup(props, { emit }) {
    return () =>
      h('div', { class: 'aiv-apply' }, [
        h(
          UiButton,
          {
            variant: 'ghost',
            size: 'sm',
            disabled: props.applying,
            onClick: () => emit('dismiss'),
          },
          { default: () => 'Descartar' },
        ),
        h(
          UiButton,
          {
            variant: 'primary',
            size: 'sm',
            loading: props.applying,
            disabled: props.disabled,
            onClick: () => emit('apply'),
          },
          { default: () => props.label },
        ),
      ]);
  },
};

// helper puro: quebra um texto livre em parágrafos (sem v-html).
function splitParagraphs(text) {
  return String(text || '')
    .split(/\n{2,}|\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
}

// SuggestionCard — sugestão (preço com faixa + intervalo de confiança, ou texto) + ApplyButton.
// Os campos value/range/confidence/citations chegam ESTRUTURADOS do backend (ver normalizeSuggestion).
const SuggestionCard = {
  name: 'SuggestionCard',
  props: {
    kind: { type: String, default: 'text' }, // price | text
    title: { type: String, default: 'Sugestão' },
    value: { type: String, default: '' },
    raw: { type: String, default: '' },
    rangeLow: { type: String, default: '' },
    rangeHigh: { type: String, default: '' },
    confidence: { type: Number, default: 0 }, // 0..1
    citations: { type: Array, default: () => [] },
    applyLabel: { type: String, default: 'Aplicar' },
    dirty: Boolean,
    applying: Boolean,
  },
  emits: ['apply', 'dismiss'],
  setup(props, { emit }) {
    const pct = () => {
      const n = Number(props.confidence);
      if (!isFinite(n) || n <= 0) return 0;
      return Math.max(0, Math.min(100, Math.round(n * 100)));
    };
    return () => {
      const p = pct();
      const fill = Math.round(p / 10) * 10;
      const tone = p >= 70 ? 'success' : p >= 40 ? 'warning' : 'error';
      const confLabel = !p ? 'sem estimativa' : p >= 70 ? 'alta confiança' : p >= 40 ? 'confiança média' : 'baixa confiança';
      const paras = splitParagraphs(props.raw);

      const children = [
        h('header', { class: 'aiv-sugg-head' }, [
          h('span', { class: 'aiv-sugg-tag' }, 'Dry-run'),
          h('h4', { class: 'aiv-sugg-title' }, props.title),
        ]),
      ];

      if (props.kind === 'price' && props.value) {
        children.push(
          h('div', { class: 'aiv-sugg-price' }, [
            h('p', { class: 'aiv-sugg-value' }, props.value),
            props.rangeLow && props.rangeHigh
              ? h('p', { class: 'aiv-sugg-range ui-muted' }, 'faixa: ' + props.rangeLow + ' – ' + props.rangeHigh)
              : null,
          ]),
        );
      }

      if (p) {
        children.push(
          h('div', { class: 'aiv-conf', 'data-tone': tone, role: 'group', 'aria-label': 'Intervalo de confiança' }, [
            h('div', { class: 'aiv-conf-meta' }, [
              h('span', { class: 'aiv-conf-label' }, confLabel),
              h('span', { class: 'aiv-conf-pct ui-mono' }, p + '%'),
            ]),
            h('div', { class: 'aiv-conf-track', role: 'meter', 'aria-valuenow': p, 'aria-valuemin': 0, 'aria-valuemax': 100 }, [
              h('span', { class: 'aiv-conf-bar', 'data-fill': fill }),
            ]),
          ]),
        );
      }

      if (paras.length) {
        children.push(
          h('div', { class: 'aiv-sugg-body' }, paras.map((para, i) => h('p', { key: i, class: 'aiv-sugg-para' }, para))),
        );
      }

      if (props.citations.length) {
        children.push(h(CitationList, { citations: props.citations }));
      }

      children.push(
        h('footer', { class: 'aiv-sugg-foot' }, [
          h(ApplyButton, {
            applying: props.applying,
            disabled: !props.dirty,
            label: props.applyLabel,
            onApply: () => emit('apply'),
            onDismiss: () => emit('dismiss'),
          }),
        ]),
      );

      return h('section', { class: 'aiv-sugg', 'data-kind': props.kind }, children);
    };
  },
};

const toast = useToast();
const confirm = useConfirm();

// ---------------------------------------------------------------------------
// Grounding ESTRUTURADO: normaliza o que o backend devolve, SEM inventar.
// citations/sources -> [{label, ref, kind}]; range/price -> faixa; confidence -> 0..1.
// Quando ausentes, devolvemos vazio/0 (a UI degrada graciosamente, sem selo de grounding).
// ---------------------------------------------------------------------------
function normalizeCitations(r) {
  const raw = (r && (r.citations || r.sources)) || [];
  if (!Array.isArray(raw)) return [];
  return raw
    .map((c) => {
      if (!c) return null;
      if (typeof c === 'string') return { label: c, ref: '', kind: '' };
      return { label: c.label || c.title || '', ref: c.ref || c.id || '', kind: c.kind || c.type || '' };
    })
    .filter((c) => c && (c.label || c.ref))
    .slice(0, 8);
}

// confiança vinda do backend: aceita 0..1 ou 0..100; fora disso => 0 (sem estimativa).
function normalizeConfidence(r) {
  const c = r && (r.confidence != null ? r.confidence : (r.range && r.range.confidence));
  const n = Number(c);
  if (!isFinite(n) || n <= 0) return 0;
  return n > 1 ? Math.min(1, n / 100) : Math.min(1, n);
}

// faixa de preço estruturada: aceita r.range {low,high} | r.price {value,low,high} | r.value.
function normalizePrice(r) {
  if (!r) return null;
  const range = r.range || r.price || {};
  const value = r.value != null ? r.value : (range.value != null ? range.value : (r.price != null && typeof r.price === 'number' ? r.price : null));
  const low = range.low != null ? range.low : (range.min != null ? range.min : null);
  const high = range.high != null ? range.high : (range.max != null ? range.max : null);
  if (value == null && low == null && high == null) return null;
  const center = value != null ? value : (low != null && high != null ? (Number(low) + Number(high)) / 2 : (low != null ? low : high));
  return { center: Number(center), low: low != null ? Number(low) : null, high: high != null ? Number(high) : null };
}

// ---------------------------------------------------------------------------
// Saúde do assistente — verificada por endpoint dedicado (GET /v1/assistant/health),
// SEM custo de inferência. Confirma o backend via GET /health quando o ping de saúde falha.
// ---------------------------------------------------------------------------
const health = reactive({ state: 'checking', model: '' }); // checking | online | offline | error

const bannerTone = computed(() =>
  ({ online: 'ok', offline: 'neutral', error: 'error', checking: 'neutral' }[health.state] || 'neutral'),
);

async function checkHealth() {
  health.state = 'checking';
  try {
    const r = await store.assistantHealth(); // { ai: boolean, model? }
    health.state = r && r.ai ? 'online' : 'offline';
    health.model = (r && r.model) || '';
  } catch (e) {
    if (e && (e.status === 401 || e.status === 403)) {
      health.state = 'offline';
    } else {
      // distingue "IA fora" de "backend fora": se o backend responde, é erro da IA.
      try { await apiHealth(); } catch { /* backend também fora */ }
      health.state = 'error';
    }
  }
}

// ---------------------------------------------------------------------------
// Conversa (RAG) — composer via useForm (validação declarativa + anti-duplo-submit).
// ---------------------------------------------------------------------------
let _mid = 0;
const messages = ref([]); // { id, role: 'user'|'assistant', text, citations?, error? }
const thinking = ref(false);
const logEl = ref(null);

const composer = useForm({
  initial: { question: '' },
  rules: { question: [required('Escreva uma pergunta antes de enviar.')] },
});

const starterPrompts = [
  'Quais pedidos estão pendentes de pagamento?',
  'Resumo das vendas de hoje',
  'Algum pedido com nota fiscal em erro?',
  'Qual produto mais vendeu esta semana?',
];

const hasHistory = computed(() => messages.value.length > 0);
const canSend = computed(
  () => composer.values.question.trim().length > 0 && !thinking.value && health.state === 'online',
);

function toParagraphs(text) {
  return splitParagraphs(text);
}

async function scrollLogToEnd() {
  await nextTick();
  if (logEl.value) logEl.value.scrollTop = logEl.value.scrollHeight;
}

function useStarter(s) {
  composer.values.question = s;
  composer.handleSubmit(onAsk);
}

function onComposerKey(e) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    composer.handleSubmit(onAsk);
  }
}

// handler do useForm do composer: valida saúde, registra a pergunta e consulta a IA.
async function onAsk(values) {
  const q = (values.question || '').trim();
  if (!q) return;
  if (health.state !== 'online') {
    composer.errors.question = 'O assistente está indisponível no momento.';
    return;
  }
  messages.value.push({ id: ++_mid, role: 'user', text: q });
  composer.reset();
  scrollLogToEnd();
  await ask(q);
}

async function ask(q) {
  thinking.value = true;
  scrollLogToEnd();
  try {
    const r = await store.assistant(q);
    const text = (r && (r.answer || r.text)) || 'Não consegui formular uma resposta.';
    messages.value.push({
      id: ++_mid,
      role: 'assistant',
      text,
      citations: normalizeCitations(r), // grounding ESTRUTURADO (vazio quando o backend não envia)
    });
  } catch (e) {
    messages.value.push({
      id: ++_mid,
      role: 'assistant',
      error: { message: structuredMessage(e), code: e && e.status ? String(e.status) : '' },
    });
    if (e && e.status === 503) health.state = 'offline';
    toast.error('Não foi possível responder.', { detail: structuredMessage(e) });
  } finally {
    thinking.value = false;
    scrollLogToEnd();
  }
}

function retryMessage(m) {
  // a mensagem do usuário imediatamente anterior à resposta com erro
  const idx = messages.value.findIndex((x) => x.id === m.id);
  let userMsg = null;
  for (let i = idx - 1; i >= 0; i--) {
    if (messages.value[i].role === 'user') { userMsg = messages.value[i]; break; }
  }
  if (idx >= 0) messages.value.splice(idx, 1);
  if (userMsg) ask(userMsg.text);
}

async function clearConversation() {
  if (!hasHistory.value) return;
  const ok = await confirm({
    title: 'Limpar conversa',
    message: 'Isso apaga todo o histórico desta conversa. As sugestões já aplicadas não são afetadas.',
    confirmLabel: 'Limpar',
    danger: true,
  });
  if (!ok) return;
  messages.value = [];
  toast.info('Conversa limpa.');
}

// ---------------------------------------------------------------------------
// Mensagem de erro estruturada (fail-closed)
// ---------------------------------------------------------------------------
function structuredMessage(e) {
  if (!e) return 'Erro desconhecido.';
  if (e.status === 503) return 'Assistente de IA indisponível (fail-closed). Configure o provedor de IA para habilitar.';
  if (e.status === 401 || e.status === 403) return 'Sem permissão para usar o assistente.';
  if (e.status === 429) return 'Limite de uso atingido. Tente novamente em instantes.';
  return e.message || 'Falha ao falar com o assistente.';
}

// ---------------------------------------------------------------------------
// Sugestão de preço (dry-run) — formulário via useForm.
// ---------------------------------------------------------------------------
const priceForm = useForm({
  initial: { product: '', cost: '', margin: '' },
  rules: {
    product: [required('Informe o produto.')],
    cost: [min(0, 'Custo não pode ser negativo.')],
    margin: [min(0, 'Margem não pode ser negativa.'), max(500, 'Margem máxima de 500%.')],
  },
});
const priceApplying = ref(false);
const priceResult = ref(null);
const priceError = ref(null);
const priceBusy = computed(() => priceForm.submitting.value);

async function onSuggestPrice(values) {
  if (health.state !== 'online') {
    toast.warning('Assistente indisponível.');
    return;
  }
  priceError.value = null;
  priceResult.value = null;
  const parts = ['Sugira um preço de venda para o produto "' + values.product.trim() + '".'];
  if (values.cost !== '' && values.cost != null) parts.push('Custo unitário: R$ ' + Number(values.cost).toFixed(2) + '.');
  if (values.margin !== '' && values.margin != null) parts.push('Margem-alvo: ' + Number(values.margin) + '%.');
  parts.push('Responda com um preço central e uma faixa mínima/máxima, justificando brevemente. É um dry-run; nada será gravado.');
  try {
    const r = await store.assistant(parts.join(' '));
    const text = (r && (r.answer || r.text)) || '';
    const price = normalizePrice(r); // ESTRUTURADO; null quando o backend só devolve prosa
    priceResult.value = {
      text,
      product: values.product.trim(),
      value: price ? price.center : null,
      formattedValue: price && price.center != null ? format.formatCurrency(price.center) : '',
      formattedLow: price && price.low != null ? format.formatCurrency(price.low) : '',
      formattedHigh: price && price.high != null ? format.formatCurrency(price.high) : '',
      confidence: normalizeConfidence(r),
      citations: normalizeCitations(r),
    };
  } catch (e) {
    if (e && e.status === 503) health.state = 'offline';
    priceError.value = { message: structuredMessage(e), code: e && e.status ? String(e.status) : '' };
  }
}

async function applyPrice() {
  if (!priceResult.value) return;
  const label = priceResult.value.formattedValue || 'o preço sugerido';
  const product = priceResult.value.product;
  const ok = await confirm({
    title: 'Levar preço para o produto',
    message: 'Abrir o produto "' + product + '" com ' + label + ' pré-preenchido? A alteração só é gravada quando você confirmar na tela do produto.',
    confirmLabel: 'Abrir produto',
  });
  if (!ok) return;
  priceApplying.value = true;
  try {
    // encaminhamento honesto: esta tela é dry-run; a gravação acontece na tela do produto.
    toast.info('Encaminhado para o produto.', {
      detail: 'Abra "' + product + '" para revisar e confirmar ' + label + '.',
    });
    priceResult.value = null;
  } finally {
    priceApplying.value = false;
  }
}

// ---------------------------------------------------------------------------
// Descrição SEO (dry-run) — formulário via useForm.
// ---------------------------------------------------------------------------
const seoForm = useForm({
  initial: { product: '', keywords: '' },
  rules: { product: [required('Informe o produto.')] },
});
const seoApplying = ref(false);
const seoResult = ref(null);
const seoError = ref(null);
const seoBusy = computed(() => seoForm.submitting.value);

async function onSuggestSeo(values) {
  if (health.state !== 'online') {
    toast.warning('Assistente indisponível.');
    return;
  }
  seoError.value = null;
  seoResult.value = null;
  const parts = ['Escreva uma descrição de vitrine, otimizada para SEO, para o produto "' + values.product.trim() + '".'];
  if (values.keywords.trim()) parts.push('Incorpore naturalmente estas palavras-chave: ' + values.keywords.trim() + '.');
  parts.push('Use 2 a 3 parágrafos curtos, tom comercial e claro, em pt-BR. É um dry-run; nada será publicado.');
  try {
    const r = await store.assistant(parts.join(' '));
    const text = (r && (r.answer || r.text)) || '';
    seoResult.value = {
      text,
      product: values.product.trim(),
      confidence: normalizeConfidence(r), // ESTRUTURADO; 0 quando o backend não envia
      citations: normalizeCitations(r),
    };
  } catch (e) {
    if (e && e.status === 503) health.state = 'offline';
    seoError.value = { message: structuredMessage(e), code: e && e.status ? String(e.status) : '' };
  }
}

async function applySeo() {
  if (!seoResult.value) return;
  const product = seoResult.value.product;
  const ok = await confirm({
    title: 'Levar descrição para o produto',
    message: 'Abrir o produto "' + product + '" com esta descrição pré-preenchida? A publicação só acontece quando você confirmar na tela do produto.',
    confirmLabel: 'Abrir produto',
  });
  if (!ok) return;
  seoApplying.value = true;
  try {
    toast.info('Encaminhado para o produto.', {
      detail: 'Abra "' + product + '" para revisar e publicar a descrição.',
    });
    seoResult.value = null;
  } finally {
    seoApplying.value = false;
  }
}

onMounted(checkHealth);
</script>

<style scoped>
/* ===================== Banner ===================== */
.aiv-banner {
  display: flex;
  align-items: center;
  gap: var(--ui-space-3);
  padding: var(--ui-space-3) var(--ui-space-4);
  border-radius: var(--ui-radius-md);
  border: 1px solid rgb(var(--ui-border));
  background: rgb(var(--ui-surface));
  font-size: var(--ui-text-sm);
}
.aiv-banner-text { flex: 1 1 auto; }
.aiv-banner-dot { width: 9px; height: 9px; border-radius: 50%; background: rgb(var(--ui-muted)); flex-shrink: 0; }
.aiv-banner[data-tone="ok"] { border-color: rgb(var(--ui-ok) / 0.4); background: rgb(var(--ui-ok) / 0.07); }
.aiv-banner[data-tone="ok"] .aiv-banner-dot { background: rgb(var(--ui-ok)); }
.aiv-banner[data-tone="error"] { border-color: rgb(var(--ui-danger) / 0.4); background: rgb(var(--ui-danger) / 0.07); }
.aiv-banner[data-tone="error"] .aiv-banner-dot { background: rgb(var(--ui-danger)); }

/* ===================== Grid principal ===================== */
.aiv-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr);
  gap: var(--ui-space-4);
  align-items: start;
}
.aiv-tools { display: flex; flex-direction: column; gap: var(--ui-space-4); }

/* ===================== Conversa ===================== */
.aiv-chat :deep(.ui-card-body) { display: flex; flex-direction: column; gap: var(--ui-space-4); }
.aiv-log {
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-4);
  max-height: 52vh;
  min-height: 240px;
  overflow-y: auto;
  padding-right: var(--ui-space-2);
}
.aiv-welcome { display: flex; flex-direction: column; gap: var(--ui-space-3); }
.aiv-suggestions { display: flex; flex-wrap: wrap; gap: var(--ui-space-2); justify-content: center; }

.aiv-msg { display: flex; gap: var(--ui-space-3); align-items: flex-start; }
.aiv-msg[data-role="user"] { flex-direction: row-reverse; }
.aiv-msg-avatar {
  flex-shrink: 0;
  width: 32px; height: 32px;
  display: inline-flex; align-items: center; justify-content: center;
  border-radius: 50%;
  background: rgb(var(--ui-surface-2));
  border: 1px solid rgb(var(--ui-border));
  font-size: var(--ui-text-md);
}
.aiv-msg-body {
  max-width: 84%;
  background: rgb(var(--ui-surface-2));
  border: 1px solid rgb(var(--ui-border));
  border-radius: var(--ui-radius-md);
  padding: var(--ui-space-3) var(--ui-space-4);
}
.aiv-msg[data-role="user"] .aiv-msg-body {
  background: rgb(var(--ui-accent) / 0.10);
  border-color: rgb(var(--ui-accent) / 0.30);
}
.aiv-msg-author {
  margin: 0 0 var(--ui-space-2);
  font-size: var(--ui-text-xs);
  font-weight: 700;
  color: rgb(var(--ui-muted));
  text-transform: uppercase;
  letter-spacing: .05em;
}
.aiv-msg-text { margin: 0 0 var(--ui-space-2); }
.aiv-msg-text:last-child { margin-bottom: 0; }
.aiv-msg-error {
  display: flex; flex-direction: column; gap: var(--ui-space-2);
  align-items: flex-start;
  color: rgb(var(--ui-danger));
}
.aiv-msg-error-title { margin: 0; font-weight: 600; }
.aiv-msg-error-code { margin: 0; font-size: var(--ui-text-xs); color: rgb(var(--ui-muted)); }

/* ===================== Composer ===================== */
.aiv-composer { display: flex; flex-direction: column; gap: var(--ui-space-2); border-top: 1px solid rgb(var(--ui-border)); padding-top: var(--ui-space-4); }
.aiv-composer-field { width: 100%; }
.aiv-textarea {
  width: 100%;
  background: rgb(var(--ui-bg));
  color: rgb(var(--ui-fg));
  border: 1px solid rgb(var(--ui-border-strong));
  border-radius: var(--ui-radius-sm);
  padding: 8px 11px;
  font: inherit;
  resize: vertical;
  min-height: 56px;
}
.aiv-textarea:disabled { opacity: .6; cursor: not-allowed; }
.aiv-composer-actions { display: flex; align-items: center; justify-content: space-between; gap: var(--ui-space-3); flex-wrap: wrap; }
.aiv-composer-hint { margin: 0; font-size: var(--ui-text-xs); }

/* ===================== Formulários das ferramentas ===================== */
.aiv-form { display: flex; flex-direction: column; gap: var(--ui-space-3); }
.aiv-form-row { display: grid; grid-template-columns: 1fr 1fr; gap: var(--ui-space-3); }
.aiv-result { margin-top: var(--ui-space-4); }

/* ===================== SuggestionCard ===================== */
.aiv-sugg {
  border: 1px solid rgb(var(--ui-accent) / 0.35);
  border-radius: var(--ui-radius-md);
  background: rgb(var(--ui-accent) / 0.05);
  padding: var(--ui-space-4);
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-3);
}
.aiv-sugg-head { display: flex; align-items: center; gap: var(--ui-space-2); }
.aiv-sugg-tag {
  font-size: var(--ui-text-xs);
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: .06em;
  color: rgb(var(--ui-accent-fg));
  background: rgb(var(--ui-accent));
  padding: 2px 8px;
  border-radius: var(--ui-radius-pill);
}
.aiv-sugg-title { font-size: var(--ui-text-md); }
.aiv-sugg-price { display: flex; flex-direction: column; gap: 2px; }
.aiv-sugg-value { margin: 0; font-family: var(--ui-font-display); font-size: var(--ui-text-xl); font-weight: 700; color: rgb(var(--ui-fg)); }
.aiv-sugg-range { margin: 0; font-size: var(--ui-text-sm); }
.aiv-sugg-body { display: flex; flex-direction: column; gap: var(--ui-space-2); }
.aiv-sugg-para { margin: 0; font-size: var(--ui-text-sm); line-height: 1.55; }
.aiv-sugg-foot { display: flex; justify-content: flex-end; }

/* ===================== Intervalo de confiança ===================== */
.aiv-conf { display: flex; flex-direction: column; gap: 5px; }
.aiv-conf-meta { display: flex; align-items: baseline; justify-content: space-between; }
.aiv-conf-label { font-size: var(--ui-text-xs); font-weight: 600; }
.aiv-conf-pct { font-size: var(--ui-text-xs); color: rgb(var(--ui-muted)); }
.aiv-conf-track {
  height: 8px;
  border-radius: var(--ui-radius-pill);
  background: rgb(var(--ui-muted) / 0.18);
  overflow: hidden;
}
.aiv-conf-bar {
  display: block;
  height: 100%;
  border-radius: var(--ui-radius-pill);
  background: rgb(var(--ui-muted));
  transition: width .3s ease;
  width: 0;
}
/* largura discreta via data-fill (sem style inline) */
.aiv-conf-bar[data-fill="10"] { width: 10%; }
.aiv-conf-bar[data-fill="20"] { width: 20%; }
.aiv-conf-bar[data-fill="30"] { width: 30%; }
.aiv-conf-bar[data-fill="40"] { width: 40%; }
.aiv-conf-bar[data-fill="50"] { width: 50%; }
.aiv-conf-bar[data-fill="60"] { width: 60%; }
.aiv-conf-bar[data-fill="70"] { width: 70%; }
.aiv-conf-bar[data-fill="80"] { width: 80%; }
.aiv-conf-bar[data-fill="90"] { width: 90%; }
.aiv-conf-bar[data-fill="100"] { width: 100%; }
.aiv-conf[data-tone="success"] .aiv-conf-bar { background: rgb(var(--ui-ok)); }
.aiv-conf[data-tone="success"] .aiv-conf-label { color: rgb(var(--ui-ok)); }
.aiv-conf[data-tone="warning"] .aiv-conf-bar { background: rgb(var(--ui-warn)); }
.aiv-conf[data-tone="warning"] .aiv-conf-label { color: rgb(var(--ui-warn)); }
.aiv-conf[data-tone="error"] .aiv-conf-bar { background: rgb(var(--ui-danger)); }
.aiv-conf[data-tone="error"] .aiv-conf-label { color: rgb(var(--ui-danger)); }

/* ===================== Citações (CitationList) ===================== */
.aiv-cites {
  margin-top: var(--ui-space-2);
  border-top: 1px dashed rgb(var(--ui-border));
  padding-top: var(--ui-space-2);
}
.aiv-cites-title {
  margin: 0 0 var(--ui-space-2);
  font-size: var(--ui-text-xs);
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: .05em;
  color: rgb(var(--ui-muted));
}
.aiv-cites-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
.aiv-cite { display: flex; align-items: center; gap: var(--ui-space-2); font-size: var(--ui-text-sm); }
.aiv-cite-index {
  flex-shrink: 0;
  width: 18px; height: 18px;
  display: inline-flex; align-items: center; justify-content: center;
  border-radius: 50%;
  background: rgb(var(--ui-accent) / 0.18);
  color: rgb(var(--ui-accent-strong));
  font-size: var(--ui-text-xs);
  font-weight: 700;
}
.aiv-cite-main { display: flex; flex-direction: column; gap: 1px; flex: 1 1 auto; min-width: 0; }
.aiv-cite-label { font-weight: 600; }
.aiv-cite-ref { font-size: var(--ui-text-xs); color: rgb(var(--ui-muted)); }
.aiv-cite-kind {
  flex-shrink: 0;
  font-size: var(--ui-text-xs);
  color: rgb(var(--ui-muted));
  background: rgb(var(--ui-surface-2));
  padding: 2px 8px;
  border-radius: var(--ui-radius-pill);
}

/* ===================== ApplyButton ===================== */
.aiv-apply { display: flex; gap: var(--ui-space-2); }

/* ===================== Responsivo ===================== */
@media (max-width: 920px) {
  .aiv-grid { grid-template-columns: minmax(0, 1fr); }
}
@media (max-width: 560px) {
  .aiv-form-row { grid-template-columns: 1fr; }
  .aiv-msg-body { max-width: 92%; }
  .aiv-composer-actions { flex-direction: column; align-items: stretch; }
}
</style>
