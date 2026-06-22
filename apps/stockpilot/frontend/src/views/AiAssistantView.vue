<template>
  <UiPageLayout
    width="wide"
    eyebrow="StockPilot · Assistente de IA"
    title="Assistente de reposição"
    subtitle="Escolha um produto e receba uma sugestão fundamentada de quanto repor (dry-run). Você revisa as fontes, a confiança e confirma — nada muda até você decidir."
    :loading="initialLoading"
    loading-message="Carregando produtos…"
    :error="pageError"
    @retry="loadProducts"
  >
    <!-- atalhos de domínio (só rotas reais do inventário) -->
    <template #actions>
      <UiButton variant="ghost" to="/products">Catálogo</UiButton>
      <UiButton variant="ghost" to="/orders">Pedidos</UiButton>
      <UiButton variant="ghost" to="/alerts">Alertas</UiButton>
    </template>

    <!-- banner explicativo do método -->
    <template #banner>
      <div class="ai-banner" role="note">
        <span class="ai-banner-icon" aria-hidden="true">🤖</span>
        <p class="ai-banner-text">
          As sugestões são <strong>grounded</strong> (fundamentadas nos seus dados reais), validadas por
          schema e <strong>fail-closed</strong>: saída inválida é recusada. Tudo é <strong>dry-run</strong> —
          só a sua confirmação cria o pedido.
        </p>
      </div>
    </template>

    <!-- ============================ GRID PRINCIPAL ============================ -->
    <div class="ai-grid">
      <!-- ----------------------- COLUNA: escolher produto (ProductPicker) ----------------------- -->
      <section class="ai-pick" aria-label="Escolher produto">
        <UiCard title="1 · Escolha o produto" :subtitle="pickerSubtitle">
          <template #actions>
            <UiButton
              size="sm"
              variant="ghost"
              :loading="productsLoading"
              :disabled="productsLoading"
              @click="loadProducts"
            >Atualizar</UiButton>
          </template>

          <!-- busca -->
          <UiFormField label="Buscar produto" hint="Filtra por nome ou identificador.">
            <template #default="{ id: fid, describedBy }">
              <input
                :id="fid"
                v-model="query"
                type="search"
                inputmode="search"
                autocomplete="off"
                placeholder="nome ou #id…"
                :aria-describedby="describedBy"
              />
            </template>
          </UiFormField>

          <!-- chips de criticidade -->
          <div class="ai-chips" role="group" aria-label="Filtrar por situação de estoque">
            <button
              v-for="chip in statusChips"
              :key="chip.value"
              type="button"
              class="ai-chip"
              :data-active="statusFilter === chip.value ? 'true' : 'false'"
              :data-tone="chip.tone"
              :aria-pressed="statusFilter === chip.value ? 'true' : 'false'"
              @click="statusFilter = chip.value"
            >
              {{ chip.label }}<span class="ai-chip-count">{{ chip.count }}</span>
            </button>
          </div>

          <!-- erro de carga (dentro do card, com retry) -->
          <UiErrorState
            v-if="productsError"
            :message="productsErrorMessage"
            :code="productsErrorCode"
            @retry="loadProducts"
          />

          <!-- carregando a lista -->
          <UiLoadingState v-else-if="productsLoading" variant="skeleton" :skeleton-lines="6" />

          <!-- vazio: nenhum produto cadastrado -->
          <UiEmptyState
            v-else-if="!products.length"
            icon="box"
            title="Nenhum produto cadastrado"
            description="Cadastre produtos no catálogo para que o assistente possa sugerir reposições."
          >
            <template #action>
              <UiButton variant="primary" to="/products">Ir para o catálogo</UiButton>
            </template>
          </UiEmptyState>

          <!-- vazio: filtro sem resultado -->
          <UiEmptyState
            v-else-if="!filteredProducts.length"
            compact
            icon="search"
            title="Nada corresponde ao filtro"
            description="Ajuste a busca ou troque o filtro de situação."
          >
            <template #action>
              <UiButton size="sm" variant="ghost" @click="clearFilters">Limpar filtros</UiButton>
            </template>
          </UiEmptyState>

          <!-- lista selecionável (botões nativos: cada um é tab-stop; seleção via aria-pressed) -->
          <ul v-else class="ai-list" role="list" aria-label="Produtos">
            <li v-for="p in filteredProducts" :key="p.id">
              <button
                type="button"
                class="ai-item"
                :data-selected="selectedId === p.id ? 'true' : 'false'"
                :aria-pressed="selectedId === p.id ? 'true' : 'false'"
                :aria-label="'Selecionar ' + productName(p)"
                @click="selectProduct(p)"
              >
                <span class="ai-item-main">
                  <span class="ai-item-name">{{ productName(p) }}</span>
                  <span class="ai-item-meta">
                    <span class="ui-mono">#{{ p.id }}</span>
                    <span aria-hidden="true">·</span>
                    <span>{{ formatUnits(p.current_stock) }} / mín. {{ formatUnits(p.min_stock) }}</span>
                  </span>
                </span>
                <UiStatusBadge :status="p.status" size="sm" />
              </button>
            </li>
          </ul>
        </UiCard>
      </section>

      <!-- ------------------------ COLUNA: assistente (IA) ------------------------ -->
      <section class="ai-work" aria-label="Sugestão da IA">
        <!-- ESTADO: nada selecionado -->
        <UiCard v-if="!selected" title="2 · Sugestão de reposição">
          <UiEmptyState
            icon="🤖"
            title="Selecione um produto à esquerda"
            description="O assistente lê o estoque atual, o mínimo e o histórico recente de pedidos do seu tenant para sugerir quanto repor — fundamentado em dados reais, sem inventar nada."
          >
            <template #action>
              <UiButton variant="ghost" to="/alerts">Ver produtos em alerta</UiButton>
            </template>
          </UiEmptyState>
        </UiCard>

        <!-- ESTADO: produto selecionado -->
        <template v-else>
          <!-- cabeçalho do produto + KPIs -->
          <UiCard :title="productName(selected)" :subtitle="selectedSubtitle">
            <template #actions>
              <UiStatusBadge :status="selected.status" size="lg" />
            </template>

            <div class="ai-kpis">
              <UiMetricCard
                label="Estoque atual"
                :value="formatUnits(selected.current_stock)"
                :tone="selectedTone"
                :hint="coverageHint"
              />
              <UiMetricCard
                label="Estoque mínimo"
                :value="formatUnits(selected.min_stock)"
                tone="neutral"
                hint="limite de reposição"
              />
              <UiMetricCard
                label="Déficit vs. mínimo"
                :value="deficit > 0 ? formatUnits(deficit) : 'sem déficit'"
                :tone="deficit > 0 ? 'warning' : 'success'"
                :hint="deficit > 0 ? 'falta para o mínimo' : 'acima do mínimo'"
              />
              <UiMetricCard
                label="Pedido em aberto"
                :value="selected.has_open_order ? 'Sim' : 'Não'"
                :tone="selected.has_open_order ? 'running' : 'neutral'"
                :hint="selected.has_open_order ? 'reposição a caminho' : 'nenhuma em curso'"
              />
            </div>

            <p v-if="selected.has_open_order" class="ai-note" role="note">
              Já existe um pedido em aberto para este produto. A sugestão é informativa — a confirmação fica
              desabilitada (idempotência) até o pedido atual ser concluído.
            </p>
          </UiCard>

          <!-- card da sugestão (AiSuggestionCard) -->
          <UiCard
            title="2 · Sugestão de reposição (dry-run)"
            subtitle="A IA propõe; você confirma. Nada é alterado até a confirmação."
          >
            <template #actions>
              <UiButton
                size="sm"
                variant="subtle"
                :loading="suggesting"
                :disabled="suggesting"
                @click="runSuggest"
              >{{ suggestion ? 'Recalcular' : 'Gerar sugestão' }}</UiButton>
            </template>

            <!-- FAIL-CLOSED (503 indisponível / 502 saída inválida / erro genérico) -->
            <div v-if="failState" class="ai-failclosed" :data-kind="failState.kind" role="alert">
              <span class="ai-failclosed-icon" aria-hidden="true">{{ failState.icon }}</span>
              <div class="ai-failclosed-body">
                <p class="ai-failclosed-title">{{ failState.title }}</p>
                <p class="ai-failclosed-desc">{{ failState.description }}</p>
                <p v-if="failState.code" class="ai-failclosed-code ui-mono">HTTP {{ failState.code }}</p>
              </div>
              <div class="ai-failclosed-actions">
                <UiButton
                  v-if="failState.retryable"
                  size="sm"
                  variant="ghost"
                  :loading="suggesting"
                  @click="runSuggest"
                >Tentar de novo</UiButton>
                <UiButton size="sm" variant="ghost" to="/products">Repor pelo catálogo</UiButton>
              </div>
            </div>

            <!-- carregando (skeleton) -->
            <UiLoadingState
              v-else-if="suggesting"
              variant="skeleton"
              :skeleton-lines="5"
              title="Consultando a IA…"
            />

            <!-- sugestão pronta -->
            <div v-else-if="suggestion" class="ai-suggestion">
              <div class="ai-headline">
                <div class="ai-qty">
                  <span class="ai-qty-num">{{ formatNumber(suggestion.suggested_quantity) }}</span>
                  <span class="ai-qty-unit">unidades</span>
                  <span class="ai-qty-cap">sugeridas para repor</span>
                </div>
                <!-- ConfidenceBadge -->
                <span class="ai-conf" :data-level="confidenceKey" :title="confidenceTitle">
                  <span class="ai-conf-dot" aria-hidden="true" />
                  <span class="ai-conf-text">Confiança {{ confidenceLabel }}</span>
                </span>
              </div>

              <!-- justificativa (rationale) -->
              <blockquote class="ai-rationale">{{ suggestion.rationale }}</blockquote>

              <!-- GroundingSources -->
              <div v-if="groundingSources.length" class="ai-sources">
                <p class="ai-sources-title">
                  <span aria-hidden="true">◆</span> Fundamentos · dados reais consultados
                </p>
                <ul class="ai-sources-list">
                  <li v-for="(src, i) in groundingSources" :key="i" class="ai-source">
                    <span class="ai-source-bullet" aria-hidden="true" />
                    <span class="ui-mono">{{ src }}</span>
                  </li>
                </ul>
              </div>

              <!-- sugestão válida sem fontes citadas: aviso discreto (não simular grounding) -->
              <p v-else class="ai-nosources" role="note">
                <span class="ai-nosources-icon" aria-hidden="true">◇</span>
                Sem fontes citadas pela IA. Revise a justificativa e os números do produto antes de confirmar.
              </p>

              <!-- resumo do histórico (grounding) -->
              <dl v-if="historyRows.length" class="ai-history">
                <div v-for="row in historyRows" :key="row.label">
                  <dt>{{ row.label }}</dt><dd>{{ row.value }}</dd>
                </div>
              </dl>

              <!-- rodapé: modelo + dry-run -->
              <p class="ai-foot">
                <span v-if="suggestionModel" class="ai-foot-model ui-mono">{{ suggestionModel }}</span>
                <span class="ai-foot-dry">Dry-run — nada foi alterado.</span>
              </p>

              <!-- ações -->
              <div class="ai-actions">
                <UiButton
                  variant="primary"
                  :loading="reordering"
                  :disabled="confirmDisabled"
                  @click="openConfirm(suggestion.suggested_quantity)"
                >{{ selected.has_open_order ? 'Pedido já em aberto' : 'Revisar e confirmar reposição' }}</UiButton>
                <UiButton variant="ghost" :disabled="reordering" @click="resetSuggestion">Descartar sugestão</UiButton>
              </div>
            </div>

            <!-- idle (selecionado, sem sugestão ainda) -->
            <UiEmptyState
              v-else
              icon="✨"
              title="Pronto para sugerir"
              :description="idleDescription"
            >
              <template #action>
                <UiButton variant="primary" :loading="suggesting" @click="runSuggest">
                  Gerar sugestão da IA
                </UiButton>
              </template>
            </UiEmptyState>
          </UiCard>

          <!-- como funciona -->
          <UiCard title="Como o assistente decide" subtitle="Transparência do método (grounded, fail-closed).">
            <ol class="ai-steps">
              <li><strong>Recupera dados reais</strong> — estoque atual/mínimo e o histórico recente de pedidos do seu tenant.</li>
              <li><strong>Raciocina com fundamento</strong> — só usa o que foi recuperado; cita as fontes e nunca inventa números.</li>
              <li><strong>Saída validada por schema</strong> — quantidade, justificativa e confiança; saída fora do schema é recusada (fail-closed).</li>
              <li><strong>Você confirma</strong> — a sugestão é dry-run; só a sua confirmação cria o pedido (idempotente).</li>
            </ol>
          </UiCard>
        </template>
      </section>
    </div>

    <!-- ===================== ConfirmDialog: confirmar reposição ===================== -->
    <UiModal v-model:open="confirmOpen" title="Confirmar reposição" width="sm" :persistent="reordering">
      <p class="ai-confirm-lead">
        Repor <strong>{{ selected ? productName(selected) : '' }}</strong> com a quantidade abaixo?
      </p>

      <UiFormField
        label="Quantidade a repor"
        required
        :error="form.errors.quantity"
        hint="Você pode ajustar a sugestão da IA antes de confirmar."
      >
        <template #default="{ id: fid, describedBy }">
          <input
            :id="fid"
            v-model.number="form.values.quantity"
            type="number"
            min="1"
            step="1"
            inputmode="numeric"
            :aria-describedby="describedBy"
            @blur="form.validateField('quantity')"
          />
        </template>
      </UiFormField>

      <p class="ai-confirm-note">
        Será criado um pedido <em>pending</em> e enfileirado o envio ao fornecedor. A operação é
        assíncrona e idempotente — repetir não cria pedidos duplicados.
      </p>

      <template #footer>
        <UiButton variant="ghost" :disabled="reordering" @click="confirmOpen = false">Cancelar</UiButton>
        <UiButton variant="primary" :loading="reordering" @click="submitReorder">Confirmar reposição</UiButton>
      </template>
    </UiModal>
  </UiPageLayout>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import {
  UiPageLayout, UiCard, UiButton, UiMetricCard, UiStatusBadge,
  UiFormField, UiModal, UiEmptyState, UiLoadingState, UiErrorState,
  useToast, useForm, validators, format,
} from '../ui/index.js';
import { products as productsApi } from '../api.js';

// ---------------------------------------------------------------------------
// Endpoints REAIS do domínio (REQ-STOCKPILOT-0008 / -0003), via os helpers de
// DOMÍNIO do api.js (fonte única — sem montar URL à mão):
//   GET  /v1/products                       → productsApi.list(...)
//   POST /v1/products/:id/suggest-reorder   → productsApi.suggestReorder(id) (dry-run; 503/502 fail-closed)
//   POST /v1/products/:id/reorder           → productsApi.reorder(id, body)  (idempotente; 200 deduped / 201)
// Os helpers já normalizam erro com `e.status`, então setFailState/catch
// continuam funcionando sem mudanças.
// ---------------------------------------------------------------------------

const toast = useToast();

// ----------------------------- estado: lista ------------------------------
// `products` (exposto ao template) é a LISTA carregada; o recurso de domínio do
// api.js é importado como `productsApi`.
const products = ref([]);
const productsLoading = ref(false);
const productsLoaded = ref(false);
const productsError = ref(null);
const query = ref('');
const statusFilter = ref('all');
const selectedId = ref(null);

const initialLoading = computed(() => productsLoading.value && !productsLoaded.value);
const pageError = computed(() => null); // erros de lista são tratados dentro do card (com retry)

const productsErrorMessage = computed(
  () => (productsError.value && (productsError.value.message || 'Falha ao carregar produtos.')) || '',
);
const productsErrorCode = computed(
  () => (productsError.value && productsError.value.status ? 'HTTP ' + productsError.value.status : ''),
);

async function loadProducts() {
  productsLoading.value = true;
  productsError.value = null;
  try {
    const res = await productsApi.list({ pageSize: 200 });
    const list = Array.isArray(res) ? res : (res && (res.data || res.items)) || [];
    products.value = list;
    productsLoaded.value = true;
    // mantém a seleção se o produto ainda existir; senão limpa.
    if (selectedId.value != null && !list.some((p) => p.id === selectedId.value)) {
      selectedId.value = null;
      resetSuggestion();
    }
  } catch (e) {
    productsError.value = e;
    products.value = [];
  } finally {
    productsLoading.value = false;
  }
}

// ------------------------ derivações: filtro/picker ------------------------
const selected = computed(() => products.value.find((p) => p.id === selectedId.value) || null);

function productName(p) {
  return (p && (p.name || ('Produto #' + p.id))) || '';
}
function statusOf(p) {
  return String((p && p.status) || '').toUpperCase();
}

const statusCounts = computed(() => {
  const c = { all: products.value.length, RUPTURA: 0, ALERTA: 0, OK: 0 };
  for (const p of products.value) {
    const s = statusOf(p);
    if (s === 'RUPTURA') c.RUPTURA++;
    else if (s === 'ALERTA') c.ALERTA++;
    else c.OK++;
  }
  return c;
});
const statusChips = computed(() => [
  { value: 'all', label: 'Todos', tone: 'neutral', count: statusCounts.value.all },
  { value: 'RUPTURA', label: 'Ruptura', tone: 'error', count: statusCounts.value.RUPTURA },
  { value: 'ALERTA', label: 'Alerta', tone: 'warning', count: statusCounts.value.ALERTA },
  { value: 'OK', label: 'Saudável', tone: 'success', count: statusCounts.value.OK },
]);

function severityRank(p) {
  const s = statusOf(p);
  if (s === 'RUPTURA') return 0;
  if (s === 'ALERTA') return 1;
  return 2;
}

const filteredProducts = computed(() => {
  const q = query.value.trim().toLowerCase();
  const f = statusFilter.value;
  return products.value
    .filter((p) => {
      if (f !== 'all') {
        const s = statusOf(p);
        if (f === 'OK') { if (s === 'RUPTURA' || s === 'ALERTA') return false; }
        else if (s !== f) return false;
      }
      if (!q) return true;
      const hay = ((p.name || '') + ' #' + p.id).toLowerCase();
      return hay.includes(q);
    })
    .slice()
    .sort((a, b) => severityRank(a) - severityRank(b));
});

const pickerSubtitle = computed(() => {
  const n = products.value.length;
  if (productsLoading.value) return 'Carregando catálogo…';
  if (!n) return 'Nenhum produto disponível.';
  const shown = filteredProducts.value.length;
  return shown === n
    ? n + (n === 1 ? ' produto' : ' produtos') + ' no catálogo'
    : shown + ' de ' + n + ' produtos';
});

function clearFilters() {
  query.value = '';
  statusFilter.value = 'all';
}
function selectProduct(p) {
  if (selectedId.value === p.id) return;
  selectedId.value = p.id;
  resetSuggestion();
}

// --------------------------- derivações do produto ---------------------------
const selectedTone = computed(() => {
  const s = statusOf(selected.value);
  if (s === 'RUPTURA') return 'error';
  if (s === 'ALERTA') return 'warning';
  return 'success';
});
const deficit = computed(() => {
  if (!selected.value) return 0;
  const min = Number(selected.value.min_stock) || 0;
  const cur = Number(selected.value.current_stock) || 0;
  return Math.max(0, min - cur);
});
const coverageHint = computed(() => {
  if (!selected.value) return '';
  const cur = Number(selected.value.current_stock);
  const min = Number(selected.value.min_stock);
  if (!isFinite(cur) || !isFinite(min) || min <= 0) return 'sem referência';
  return Math.round((cur / min) * 100) + '% do mínimo';
});
const selectedSubtitle = computed(() => {
  if (!selected.value) return '';
  return '#' + selected.value.id + ' · cobertura ' + coverageHint.value;
});
const idleDescription = computed(() => {
  if (deficit.value > 0) {
    return 'Este produto está ' + formatUnits(deficit.value) + ' abaixo do mínimo. Gere uma sugestão fundamentada de quanto repor.';
  }
  return 'Gere uma sugestão fundamentada de quanto repor com base no estoque e no histórico recente.';
});

// ------------------------------ IA: sugerir ------------------------------
const suggesting = ref(false);
const suggestion = ref(null);
const suggestionModel = ref('');
const groundingSources = ref([]);
const historySummary = ref(null);
const failState = ref(null); // { kind, code, title, description, icon, retryable }

const historyRows = computed(() => {
  const h = historySummary.value;
  if (!h || typeof h !== 'object') return [];
  const labels = { count: 'Pedidos no período', delivered: 'Entregues', failed: 'Falhos', open: 'Abertos', pending: 'Pendentes' };
  const rows = [];
  for (const key in labels) {
    if (h[key] !== undefined && h[key] !== null) rows.push({ label: labels[key], value: formatNumber(h[key]) });
  }
  return rows;
});

function resetSuggestion() {
  suggestion.value = null;
  suggestionModel.value = '';
  groundingSources.value = [];
  historySummary.value = null;
  failState.value = null;
}

async function runSuggest() {
  if (!selected.value || suggesting.value) return;
  suggesting.value = true;
  failState.value = null;
  try {
    const res = await productsApi.suggestReorder(selected.value.id);
    const s = (res && res.suggestion) || {};
    // saída esperada (validada por schema no backend): { suggested_quantity, rationale, confidence, sources[] }
    if (s.suggested_quantity === undefined || s.suggested_quantity === null) {
      // resposta sem o campo obrigatório → fail-closed local (defesa em profundidade).
      setFailState({ status: 502 });
      return;
    }
    suggestion.value = {
      suggested_quantity: Math.max(0, Math.round(Number(s.suggested_quantity) || 0)),
      rationale: s.rationale || 'Sem justificativa fornecida.',
      confidence: String(s.confidence || 'medium').toLowerCase(),
    };
    // fontes: preferir as da sugestão; senão as do grounding.
    const fromSuggestion = Array.isArray(s.sources) ? s.sources : [];
    const fromGrounding = res && res.grounding && Array.isArray(res.grounding.sources) ? res.grounding.sources : [];
    groundingSources.value = (fromSuggestion.length ? fromSuggestion : fromGrounding).map((x) => String(x));
    historySummary.value = (res && res.grounding && res.grounding.history_summary) || null;
    suggestionModel.value = (res && res.model) || '';
    toast.success('Sugestão gerada. Revise as fontes antes de confirmar.');
  } catch (e) {
    setFailState(e);
  } finally {
    suggesting.value = false;
  }
}

// mapeia o erro para um estado fail-closed claro (503 indisponível / 502 saída inválida / genérico).
function setFailState(e) {
  suggestion.value = null;
  const status = e && e.status;
  if (status === 503) {
    failState.value = {
      kind: 'unavailable',
      code: 503,
      icon: '⏻',
      title: 'Assistente de IA indisponível',
      description: 'O serviço de IA não está configurado no momento. A reposição manual continua disponível pelo catálogo.',
      retryable: true,
    };
    toast.warning('Assistente de IA indisponível (503).');
    return;
  }
  if (status === 502) {
    failState.value = {
      kind: 'invalid',
      code: 502,
      icon: '⚠',
      title: 'Resposta da IA recusada (fail-closed)',
      description: 'A IA devolveu uma saída fora do formato esperado e foi recusada por segurança. Tente novamente ou reponha manualmente.',
      retryable: true,
    };
    toast.error('Saída da IA inválida — recusada (502).');
    return;
  }
  if (status === 404) {
    failState.value = {
      kind: 'error',
      code: 404,
      icon: '⚠',
      title: 'Produto não encontrado',
      description: 'Este produto não está mais disponível. Atualize a lista e tente novamente.',
      retryable: false,
    };
    toast.error('Produto não encontrado (404).');
    return;
  }
  failState.value = {
    kind: 'error',
    code: status || '',
    icon: '⚠',
    title: 'Falha ao gerar a sugestão',
    description: (e && e.message) || 'Não foi possível obter a sugestão da IA.',
    retryable: true,
  };
  toast.error('Falha ao gerar a sugestão da IA.', { detail: e && e.message, code: status });
}

// ----------------------------- confiança (badge) -----------------------------
const confidenceKey = computed(() => {
  const c = String((suggestion.value && suggestion.value.confidence) || 'medium').toLowerCase();
  return ['low', 'medium', 'high'].includes(c) ? c : 'medium';
});
const confidenceLabel = computed(() => ({ low: 'baixa', medium: 'média', high: 'alta' }[confidenceKey.value]));
const confidenceTitle = computed(() => ({
  low: 'Contexto limitado — trate a sugestão com cautela.',
  medium: 'Confiança moderada com base nos dados disponíveis.',
  high: 'Boa fundamentação nos dados recuperados.',
}[confidenceKey.value]));

// sugestão válida porém SEM fontes citadas pela IA → aviso discreto (a régua do
// propósito pede "fontes citadas"; não damos falsa sensação de grounding).
const suggestionWithoutSources = computed(
  () => !!suggestion.value && groundingSources.value.length === 0,
);

// --------------------------- confirmar reposição ---------------------------
// O único input de mutação (quantidade que vira um POST /reorder) é validado
// pelo kit `useForm` (validators puros + anti-duplo-submit), conforme a régua de
// validação de TODO input de create/edit.
const reordering = ref(false);
const confirmOpen = ref(false);
const form = useForm({
  initial: { quantity: 1 },
  rules: {
    quantity: [
      validators.required('Informe a quantidade a repor.'),
      validators.min(1, 'A quantidade deve ser pelo menos 1.'),
      validators.pattern(/^\d+$/, 'Use um número inteiro de unidades.'),
    ],
  },
});

const confirmDisabled = computed(
  () => reordering.value || !selected.value || selected.value.has_open_order,
);

function openConfirm(qty) {
  if (!selected.value) return;
  if (selected.value.has_open_order) {
    toast.info('Já existe um pedido em aberto para este produto.');
    return;
  }
  const n = Number(qty);
  form.reset();
  form.values.quantity = n > 0 ? Math.round(n) : Math.max(1, deficit.value || 1);
  confirmOpen.value = true;
}

function submitReorder() {
  return form.handleSubmit(async ({ quantity }) => {
    if (!selected.value) return;
    reordering.value = true;
    try {
      const res = await productsApi.reorder(selected.value.id, { quantity: Math.round(Number(quantity)) });
      confirmOpen.value = false;
      if (res && res.deduped) {
        toast.info('Pedido já estava em aberto — usamos o existente (idempotente).');
      } else {
        toast.success('Reposição confirmada. O pedido foi enfileirado ao fornecedor.');
      }
      resetSuggestion();
      await loadProducts();
    } catch (e) {
      toast.error('Falha ao confirmar a reposição.', { detail: e && e.message, code: e && e.status });
    } finally {
      reordering.value = false;
    }
  });
}

// ------------------------------ formatadores ------------------------------
function formatNumber(v) {
  return format.formatNumber(v);
}
function formatUnits(v) {
  if (v === null || v === undefined || v === '') return '—';
  const n = Number(v);
  if (!isFinite(n)) return String(v);
  return format.formatNumber(n) + ' un.';
}

onMounted(loadProducts);
</script>

<style scoped>
/* ============================ layout em 2 colunas ============================ */
.ai-grid {
  display: grid;
  grid-template-columns: minmax(0, 360px) minmax(0, 1fr);
  gap: var(--ui-space-4);
  align-items: start;
}
.ai-pick, .ai-work { display: flex; flex-direction: column; gap: var(--ui-space-4); min-width: 0; }

@media (min-width: 1080px) {
  .ai-pick { position: sticky; top: var(--ui-space-4); }
}

/* ============================ banner do método ============================ */
.ai-banner {
  display: flex;
  align-items: center;
  gap: var(--ui-space-3);
  padding: var(--ui-space-3) var(--ui-space-4);
  border: 1px solid rgb(var(--ui-accent) / 0.4);
  background: rgb(var(--ui-accent) / 0.08);
  border-radius: var(--ui-radius-md);
}
.ai-banner-icon { font-size: 1.3rem; flex-shrink: 0; }
.ai-banner-text { margin: 0; font-size: var(--ui-text-sm); color: rgb(var(--ui-fg)); line-height: 1.5; }
.ai-banner-text strong { color: rgb(var(--ui-accent-strong)); }

/* ============================ chips de filtro ============================ */
.ai-chips { display: flex; flex-wrap: wrap; gap: var(--ui-space-2); margin: var(--ui-space-3) 0; }
.ai-chip {
  display: inline-flex; align-items: center; gap: 6px;
  font: inherit; font-size: var(--ui-text-xs); font-weight: 600;
  padding: 5px 10px; cursor: pointer;
  border: 1px solid rgb(var(--ui-border-strong));
  border-radius: var(--ui-radius-pill);
  background: rgb(var(--ui-surface));
  color: rgb(var(--ui-fg));
  transition: background .15s ease, border-color .15s ease, color .15s ease;
}
.ai-chip:hover { background: rgb(var(--ui-surface-2)); }
.ai-chip-count {
  font-size: 10px; min-width: 18px; text-align: center;
  padding: 1px 5px; border-radius: var(--ui-radius-pill);
  background: rgb(var(--ui-muted) / 0.18); color: rgb(var(--ui-muted));
}
.ai-chip[data-active="true"] { border-color: rgb(var(--ui-accent)); background: rgb(var(--ui-accent) / 0.12); color: rgb(var(--ui-accent-strong)); }
.ai-chip[data-active="true"] .ai-chip-count { background: rgb(var(--ui-accent) / 0.22); color: rgb(var(--ui-accent-strong)); }
.ai-chip[data-tone="error"][data-active="true"] { border-color: rgb(var(--ui-danger)); background: rgb(var(--ui-danger) / 0.12); color: rgb(var(--ui-danger)); }
.ai-chip[data-tone="error"][data-active="true"] .ai-chip-count { background: rgb(var(--ui-danger) / 0.18); color: rgb(var(--ui-danger)); }
.ai-chip[data-tone="warning"][data-active="true"] { border-color: rgb(var(--ui-warn)); background: rgb(var(--ui-warn) / 0.14); color: rgb(var(--ui-warn)); }
.ai-chip[data-tone="warning"][data-active="true"] .ai-chip-count { background: rgb(var(--ui-warn) / 0.18); color: rgb(var(--ui-warn)); }
.ai-chip[data-tone="success"][data-active="true"] { border-color: rgb(var(--ui-ok)); background: rgb(var(--ui-ok) / 0.12); color: rgb(var(--ui-ok)); }
.ai-chip[data-tone="success"][data-active="true"] .ai-chip-count { background: rgb(var(--ui-ok) / 0.18); color: rgb(var(--ui-ok)); }

/* ============================ lista de produtos ============================ */
.ai-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--ui-space-2); max-height: 60vh; overflow-y: auto; }
.ai-item {
  display: flex; align-items: center; justify-content: space-between; gap: var(--ui-space-3);
  width: 100%; text-align: left; font: inherit; cursor: pointer;
  padding: var(--ui-space-3);
  border: 1px solid rgb(var(--ui-border));
  border-radius: var(--ui-radius-md);
  background: rgb(var(--ui-surface));
  color: rgb(var(--ui-fg));
  transition: border-color .15s ease, background .15s ease;
}
.ai-item:hover { background: rgb(var(--ui-surface-2)); border-color: rgb(var(--ui-border-strong)); }
.ai-item[data-selected="true"] {
  border-color: rgb(var(--ui-accent));
  background: rgb(var(--ui-accent) / 0.08);
  box-shadow: inset 3px 0 0 rgb(var(--ui-accent));
}
.ai-item-main { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.ai-item-name { font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ai-item-meta { display: flex; align-items: center; gap: 6px; font-size: var(--ui-text-xs); color: rgb(var(--ui-muted)); flex-wrap: wrap; }

/* ============================ KPIs do produto ============================ */
.ai-kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: var(--ui-space-3); }
.ai-note {
  margin: var(--ui-space-3) 0 0; font-size: var(--ui-text-sm);
  padding: var(--ui-space-3); border-radius: var(--ui-radius-sm);
  border-left: 3px solid rgb(var(--ui-accent));
  background: rgb(var(--ui-accent) / 0.07); color: rgb(var(--ui-fg));
}

/* ============================ estado fail-closed ============================ */
.ai-failclosed {
  display: flex; gap: var(--ui-space-3); align-items: flex-start;
  padding: var(--ui-space-4);
  border-radius: var(--ui-radius-md);
  border: 1px solid rgb(var(--ui-border-strong));
  background: rgb(var(--ui-surface-2));
}
.ai-failclosed[data-kind="unavailable"] { border-color: rgb(var(--ui-warn) / 0.5); background: rgb(var(--ui-warn) / 0.08); }
.ai-failclosed[data-kind="invalid"], .ai-failclosed[data-kind="error"] { border-color: rgb(var(--ui-danger) / 0.5); background: rgb(var(--ui-danger) / 0.07); }
.ai-failclosed-icon { font-size: 1.5rem; line-height: 1; flex-shrink: 0; }
.ai-failclosed[data-kind="unavailable"] .ai-failclosed-icon { color: rgb(var(--ui-warn)); }
.ai-failclosed[data-kind="invalid"] .ai-failclosed-icon,
.ai-failclosed[data-kind="error"] .ai-failclosed-icon { color: rgb(var(--ui-danger)); }
.ai-failclosed-body { flex: 1 1 auto; min-width: 0; }
.ai-failclosed-title { margin: 0; font-weight: 700; }
.ai-failclosed-desc { margin: 4px 0 0; font-size: var(--ui-text-sm); color: rgb(var(--ui-muted)); }
.ai-failclosed-code { margin: 6px 0 0; font-size: var(--ui-text-xs); color: rgb(var(--ui-muted)); }
.ai-failclosed-actions { display: flex; flex-direction: column; gap: var(--ui-space-2); flex-shrink: 0; }

/* ============================ sugestão pronta ============================ */
.ai-suggestion { display: flex; flex-direction: column; gap: var(--ui-space-4); }
.ai-headline { display: flex; align-items: center; justify-content: space-between; gap: var(--ui-space-3); flex-wrap: wrap; }
.ai-qty { display: flex; align-items: baseline; gap: 6px; flex-wrap: wrap; }
.ai-qty-num { font-family: var(--ui-font-display); font-size: 2.6rem; font-weight: 700; line-height: 1; color: rgb(var(--ui-accent-strong)); }
.ai-qty-unit { font-size: var(--ui-text-md); font-weight: 600; color: rgb(var(--ui-fg)); }
.ai-qty-cap { font-size: var(--ui-text-sm); color: rgb(var(--ui-muted)); }

/* ConfidenceBadge */
.ai-conf {
  display: inline-flex; align-items: center; gap: 7px;
  font-size: var(--ui-text-xs); font-weight: 700;
  padding: 5px 11px; border-radius: var(--ui-radius-pill);
  background: rgb(var(--ui-muted) / 0.14); color: rgb(var(--ui-muted));
  white-space: nowrap;
}
.ai-conf-dot { width: 8px; height: 8px; border-radius: 50%; background: currentColor; }
.ai-conf[data-level="high"] { background: rgb(var(--ui-ok) / 0.16); color: rgb(var(--ui-ok)); }
.ai-conf[data-level="medium"] { background: rgb(var(--ui-warn) / 0.18); color: rgb(var(--ui-warn)); }
.ai-conf[data-level="low"] { background: rgb(var(--ui-danger) / 0.14); color: rgb(var(--ui-danger)); }

/* justificativa */
.ai-rationale {
  margin: 0; font-size: var(--ui-text-md); line-height: 1.55;
  padding: var(--ui-space-4);
  border-left: 4px solid rgb(var(--ui-accent));
  background: rgb(var(--ui-accent) / 0.06);
  border-radius: var(--ui-radius-sm);
  color: rgb(var(--ui-fg));
}

/* GroundingSources */
.ai-sources { display: flex; flex-direction: column; gap: var(--ui-space-2); }
.ai-sources-title {
  margin: 0; font-size: var(--ui-text-xs); font-weight: 700;
  text-transform: uppercase; letter-spacing: .04em; color: rgb(var(--ui-accent-strong));
  display: flex; align-items: center; gap: 6px;
}
.ai-sources-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--ui-space-2); }
.ai-source {
  display: flex; align-items: flex-start; gap: var(--ui-space-2);
  padding: var(--ui-space-2) var(--ui-space-3);
  border: 1px solid rgb(var(--ui-border));
  border-radius: var(--ui-radius-sm);
  background: rgb(var(--ui-surface-2));
  font-size: var(--ui-text-xs);
}
.ai-source .ui-mono { word-break: break-word; }
.ai-source-bullet { width: 6px; height: 6px; margin-top: 6px; border-radius: 50%; background: rgb(var(--ui-accent)); flex-shrink: 0; }

/* aviso: sugestão sem fontes citadas (não simular grounding) */
.ai-nosources {
  display: flex; align-items: flex-start; gap: var(--ui-space-2); margin: 0;
  padding: var(--ui-space-2) var(--ui-space-3);
  border: 1px dashed rgb(var(--ui-warn) / 0.5);
  border-radius: var(--ui-radius-sm);
  background: rgb(var(--ui-warn) / 0.07);
  font-size: var(--ui-text-xs); line-height: 1.5; color: rgb(var(--ui-muted));
}
.ai-nosources-icon { color: rgb(var(--ui-warn)); flex-shrink: 0; }

/* resumo do histórico */
.ai-history {
  display: grid; grid-template-columns: repeat(auto-fit, minmax(110px, 1fr));
  gap: var(--ui-space-2) var(--ui-space-3); margin: 0;
  padding: var(--ui-space-3); border: 1px dashed rgb(var(--ui-border-strong));
  border-radius: var(--ui-radius-md);
}
.ai-history > div { display: flex; flex-direction: column; gap: 1px; }
.ai-history dt { font-size: var(--ui-text-xs); color: rgb(var(--ui-muted)); text-transform: uppercase; letter-spacing: .03em; }
.ai-history dd { margin: 0; font-weight: 700; font-family: var(--ui-font-display); }

/* rodapé */
.ai-foot { display: flex; flex-wrap: wrap; align-items: center; gap: var(--ui-space-3); margin: 0; font-size: var(--ui-text-xs); color: rgb(var(--ui-muted)); }
.ai-foot-model { padding: 2px 7px; border-radius: var(--ui-radius-sm); background: rgb(var(--ui-surface-2)); border: 1px solid rgb(var(--ui-border)); }
.ai-foot-dry { font-weight: 600; }

/* ações */
.ai-actions { display: flex; flex-wrap: wrap; gap: var(--ui-space-2); }

/* ============================ "como funciona" ============================ */
.ai-steps { margin: 0; padding-left: var(--ui-space-5); display: flex; flex-direction: column; gap: var(--ui-space-2); }
.ai-steps li { font-size: var(--ui-text-sm); line-height: 1.5; color: rgb(var(--ui-fg)); }
.ai-steps strong { color: rgb(var(--ui-accent-strong)); }

/* ============================ modal de confirmação ============================ */
.ai-confirm-lead { margin: 0 0 var(--ui-space-3); }
.ai-confirm-note { margin: var(--ui-space-3) 0 0; font-size: var(--ui-text-xs); color: rgb(var(--ui-muted)); }

/* ============================ responsivo ============================ */
@media (max-width: 1080px) {
  .ai-grid { grid-template-columns: 1fr; }
  .ai-list { max-height: none; }
}
@media (max-width: 560px) {
  .ai-failclosed { flex-direction: column; }
  .ai-failclosed-actions { flex-direction: row; flex-wrap: wrap; }
  .ai-qty-num { font-size: 2.1rem; }
}
</style>
