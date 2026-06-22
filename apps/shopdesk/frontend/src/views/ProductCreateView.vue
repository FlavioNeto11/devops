<template>
  <UiPageLayout
    eyebrow="Catálogo"
    title="Novo produto"
    subtitle="Cadastre um produto e use o assistente de IA para sugerir preço e descrição SEO (dry-run — nada muda até você aplicar)."
    width="wide"
  >
    <template #actions>
      <UiButton variant="ghost" to="/products">Cancelar</UiButton>
      <UiButton
        variant="primary"
        :loading="form.submitting.value"
        :disabled="!!created"
        @click="onSubmit"
      >Salvar produto</UiButton>
    </template>

    <!-- ===================== Estado: sucesso (produto criado) ===================== -->
    <UiCard v-if="created" class="pc-created-card">
      <div class="pc-created">
        <div class="pc-created-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M20 6 9 17l-5-5" />
          </svg>
        </div>
        <div class="pc-created-body">
          <h2 class="pc-created-title">Produto cadastrado</h2>
          <p class="pc-created-sub">
            <strong>{{ created.name }}</strong>
            <span v-if="created.sku" class="ui-mono pc-created-sku">{{ created.sku }}</span>
            foi criado com sucesso.
          </p>
          <dl class="pc-created-facts">
            <div class="pc-created-fact">
              <dt>Preço</dt>
              <dd>{{ created.price != null ? formatCurrency(created.price) : '—' }}</dd>
            </div>
            <div class="pc-created-fact">
              <dt>Estoque</dt>
              <dd>{{ created.stockQty != null ? formatNumber(created.stockQty) : '—' }}</dd>
            </div>
            <div class="pc-created-fact">
              <dt>Situação</dt>
              <dd><UiStatusBadge :status="created.status || 'rascunho'" :label="statusLabelFor(created.status)" with-dot /></dd>
            </div>
          </dl>
          <div class="pc-created-actions">
            <UiButton variant="primary" @click="resetForNew">Cadastrar outro</UiButton>
            <UiButton variant="ghost" to="/products">Ver catálogo</UiButton>
          </div>
        </div>
      </div>
    </UiCard>

    <!-- ===================== Estado: formulário ===================== -->
    <form v-else class="pc-layout" novalidate @submit.prevent="onSubmit">
      <div class="pc-main">
        <UiCard>
          <!-- ---- Identificação ---- -->
          <UiFormSection
            title="Identificação"
            description="Como o produto aparece no catálogo e nos relatórios."
            :columns="2"
          >
            <UiFormField label="SKU" required :error="form.errors.sku" hint="Código único do produto (ex.: TSHIRT-PRT-M).">
              <template #default="{ id, describedBy, hasError }">
                <input
                  :id="id"
                  type="text"
                  class="ui-mono"
                  autocomplete="off"
                  placeholder="SKU-0001"
                  :aria-invalid="hasError ? 'true' : null"
                  :aria-describedby="describedBy"
                  :value="form.values.sku"
                  @input="form.setField('sku', normalizeSku($event.target.value))"
                />
              </template>
            </UiFormField>

            <UiFormField label="Categoria" :error="form.errors.category" hint="Agrupa o produto no catálogo.">
              <template #default="{ id, describedBy, hasError }">
                <input
                  :id="id"
                  type="text"
                  list="pc-category-options"
                  autocomplete="off"
                  placeholder="Ex.: Vestuário"
                  :aria-invalid="hasError ? 'true' : null"
                  :aria-describedby="describedBy"
                  :value="form.values.category"
                  @input="form.setField('category', $event.target.value)"
                />
                <datalist id="pc-category-options">
                  <option v-for="c in categorySuggestions" :key="c" :value="c" />
                </datalist>
              </template>
            </UiFormField>

            <UiFormField label="Nome" required full-width :error="form.errors.name" hint="Nome comercial exibido aos clientes.">
              <template #default="{ id, describedBy, hasError }">
                <input
                  :id="id"
                  type="text"
                  autocomplete="off"
                  placeholder="Ex.: Camiseta básica preta"
                  :aria-invalid="hasError ? 'true' : null"
                  :aria-describedby="describedBy"
                  :value="form.values.name"
                  @input="form.setField('name', $event.target.value)"
                />
              </template>
            </UiFormField>

            <UiFormField
              label="Descrição"
              full-width
              :error="form.errors.description"
              :hint="descriptionHint"
            >
              <template #default="{ id, describedBy }">
                <textarea
                  :id="id"
                  rows="5"
                  maxlength="600"
                  placeholder="Descreva benefícios, materiais e diferenciais do produto…"
                  :aria-describedby="describedBy"
                  :value="form.values.description"
                  @input="form.setField('description', $event.target.value)"
                />
              </template>
            </UiFormField>
          </UiFormSection>

          <!-- ---- Preço e custo ---- -->
          <UiFormSection
            title="Preço e custo"
            description="Defina o preço de venda; informe o custo para acompanhar a margem."
            :columns="2"
          >
            <UiFormField label="Preço de venda" required :error="form.errors.price" hint="Valor cobrado do cliente.">
              <template #default="{ id, describedBy, hasError }">
                <div class="pc-currency" :data-error="hasError ? 'true' : null">
                  <span class="pc-currency-symbol" aria-hidden="true">R$</span>
                  <input
                    :id="id"
                    type="number"
                    inputmode="decimal"
                    min="0"
                    step="0.01"
                    placeholder="0,00"
                    class="pc-currency-input"
                    :aria-invalid="hasError ? 'true' : null"
                    :aria-describedby="describedBy"
                    :value="form.values.price"
                    @input="form.setField('price', $event.target.value)"
                  />
                </div>
              </template>
            </UiFormField>

            <UiFormField label="Custo" :error="form.errors.cost" hint="Quanto custa adquirir/produzir 1 unidade.">
              <template #default="{ id, describedBy, hasError }">
                <div class="pc-currency" :data-error="hasError ? 'true' : null">
                  <span class="pc-currency-symbol" aria-hidden="true">R$</span>
                  <input
                    :id="id"
                    type="number"
                    inputmode="decimal"
                    min="0"
                    step="0.01"
                    placeholder="0,00"
                    class="pc-currency-input"
                    :aria-invalid="hasError ? 'true' : null"
                    :aria-describedby="describedBy"
                    :value="form.values.cost"
                    @input="form.setField('cost', $event.target.value)"
                  />
                </div>
              </template>
            </UiFormField>

            <div class="pc-margin" :data-tone="marginTone" role="status">
              <span class="pc-margin-label">Margem estimada</span>
              <span class="pc-margin-value">{{ marginDisplay }}</span>
              <span class="pc-margin-hint">{{ marginHint }}</span>
            </div>
          </UiFormSection>

          <!-- ---- Estoque e publicação ---- -->
          <UiFormSection
            title="Estoque e publicação"
            description="Quantidade inicial em estoque e disponibilidade do produto."
            :columns="2"
          >
            <UiFormField label="Estoque inicial" required :error="form.errors.stockQty" hint="Unidades disponíveis na criação.">
              <template #default="{ id, describedBy, hasError }">
                <input
                  :id="id"
                  type="number"
                  inputmode="numeric"
                  min="0"
                  step="1"
                  placeholder="0"
                  :aria-invalid="hasError ? 'true' : null"
                  :aria-describedby="describedBy"
                  :value="form.values.stockQty"
                  @input="form.setField('stockQty', $event.target.value)"
                />
              </template>
            </UiFormField>

            <UiFormField label="Situação" :error="form.errors.status" hint="Estado inicial do produto.">
              <template #default="{ id, describedBy }">
                <select
                  :id="id"
                  :aria-describedby="describedBy"
                  :value="form.values.status"
                  @change="form.setField('status', $event.target.value)"
                >
                  <option v-for="opt in statusOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
                </select>
              </template>
            </UiFormField>

            <UiFormField label="Disponibilidade" full-width hint="Produtos inativos ficam ocultos da vitrine.">
              <template #default="{ id, describedBy }">
                <label :for="id" class="pc-switch">
                  <input
                    :id="id"
                    type="checkbox"
                    class="pc-switch-input"
                    :aria-describedby="describedBy"
                    :checked="form.values.active"
                    @change="form.setField('active', $event.target.checked)"
                  />
                  <span class="pc-switch-track" aria-hidden="true"><span class="pc-switch-thumb" /></span>
                  <span class="pc-switch-text">{{ form.values.active ? 'Ativo — visível na loja' : 'Inativo — oculto da loja' }}</span>
                </label>
              </template>
            </UiFormField>
          </UiFormSection>
        </UiCard>

        <!-- ---- Erro PERSISTENTE de submit (além do toast efêmero) ---- -->
        <UiCard v-if="submitError.message" class="pc-submit-error">
          <UiErrorState
            :message="submitError.message"
            :code="submitError.code"
            :retryable="submitError.retryable"
            @retry="retrySubmit"
          />
        </UiCard>
      </div>

      <!-- ===================== Coluna lateral ===================== -->
      <aside class="pc-side">
        <!-- ---- Assistente de IA ---- -->
        <UiCard class="pc-ai-card">
          <template #header>
            <div class="pc-ai-head">
              <span class="pc-ai-spark" aria-hidden="true">
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M18.4 5.6l-2.8 2.8M8.4 15.6l-2.8 2.8" />
                </svg>
              </span>
              <div>
                <h3 class="pc-ai-title">Assistente de preço & SEO</h3>
                <p class="pc-ai-sub">Sugestão em dry-run — exige <strong>Aplicar</strong> para alterar o formulário.</p>
              </div>
            </div>
          </template>

          <UiButton
            variant="subtle"
            block
            :loading="ai.loading"
            :disabled="!canSuggest || ai.loading || ai.unavailable"
            @click="suggest"
          >
            {{ ai.lastSuggestion ? 'Gerar nova sugestão' : 'Sugerir com IA' }}
          </UiButton>

          <p v-if="!canSuggest && !ai.unavailable" class="pc-ai-gate ui-muted">
            Informe ao menos o nome do produto para gerar uma sugestão.
          </p>

          <!-- Estado IA: loading -->
          <div v-if="ai.loading" class="pc-ai-state">
            <UiLoadingState variant="skeleton" :skeleton-lines="3" title="Consultando o assistente…" />
          </div>

          <!-- Estado IA: indisponível (fail-closed 503 / sem chave) -->
          <div v-else-if="ai.unavailable" class="pc-ai-state">
            <UiEmptyState
              icon="🔌"
              title="Assistente indisponível"
              description="A IA está fora no momento (fail-closed, sem chave configurada). Preencha os campos manualmente — o cadastro segue normalmente."
              compact
            >
              <template #action>
                <UiButton variant="ghost" size="sm" :loading="ai.checking" @click="recheckAi">Verificar novamente</UiButton>
              </template>
            </UiEmptyState>
          </div>

          <!-- Estado IA: erro -->
          <div v-else-if="ai.error" class="pc-ai-state">
            <UiErrorState
              :message="ai.error"
              :code="ai.code"
              :retryable="ai.retryable"
              @retry="suggest"
            />
          </div>

          <!-- Estado IA: última sugestão aplicada/disponível (resumo) -->
          <div v-else-if="ai.lastSuggestion" class="pc-ai-applied">
            <div class="pc-ai-badge-row">
              <UiStatusBadge status="publicado" label="Sugestão pronta" tone="success" with-dot />
            </div>
            <p class="pc-ai-applied-text ui-muted">
              Última sugestão da IA disponível. Reabra para revisar e aplicar campo a campo.
            </p>
            <UiButton variant="ghost" size="sm" block @click="reviewOpen = true">Revisar sugestão</UiButton>
          </div>

          <!-- Estado IA: vazio (ainda não consultado) -->
          <div v-else class="pc-ai-hint ui-muted">
            <p>O assistente analisa o nome, a categoria e o custo para propor um preço competitivo e uma descrição otimizada para busca.</p>
          </div>
        </UiCard>

        <!-- ---- Resumo ao vivo ---- -->
        <UiCard title="Resumo" subtitle="Pré-visualização do que será salvo.">
          <dl class="pc-summary">
            <div class="pc-summary-row">
              <dt>Produto</dt>
              <dd>{{ form.values.name || '—' }}</dd>
            </div>
            <div class="pc-summary-row">
              <dt>SKU</dt>
              <dd class="ui-mono">{{ form.values.sku || '—' }}</dd>
            </div>
            <div class="pc-summary-row">
              <dt>Categoria</dt>
              <dd>{{ form.values.category || '—' }}</dd>
            </div>
            <div class="pc-summary-row">
              <dt>Preço</dt>
              <dd>{{ hasNumber(form.values.price) ? formatCurrency(form.values.price) : '—' }}</dd>
            </div>
            <div class="pc-summary-row">
              <dt>Margem</dt>
              <dd :data-tone="marginTone">{{ marginDisplay }}</dd>
            </div>
            <div class="pc-summary-row">
              <dt>Estoque</dt>
              <dd>{{ hasNumber(form.values.stockQty) ? formatNumber(form.values.stockQty) : '—' }}</dd>
            </div>
            <div class="pc-summary-row">
              <dt>Situação</dt>
              <dd><UiStatusBadge :status="form.values.status" :label="statusLabelFor(form.values.status)" with-dot /></dd>
            </div>
            <div class="pc-summary-row">
              <dt>Disponibilidade</dt>
              <dd>{{ form.values.active ? 'Ativo' : 'Inativo' }}</dd>
            </div>
          </dl>
        </UiCard>
      </aside>
    </form>

    <!-- ===================== Modal: revisão da sugestão de IA (dry-run) ===================== -->
    <UiModal v-model:open="reviewOpen" title="Sugestão da IA (dry-run)" width="md">
      <div v-if="ai.lastSuggestion" class="pc-review">
        <div class="pc-review-banner">
          <UiStatusBadge status="rascunho" label="Dry-run" tone="warning" with-dot />
          <span class="ui-muted pc-review-disclaimer">Nada é alterado no formulário até você clicar em Aplicar.</span>
        </div>

        <div v-if="ai.lastSuggestion.price != null" class="pc-review-block">
          <div class="pc-review-block-head">
            <span class="pc-review-block-label">Preço sugerido</span>
            <UiButton size="sm" variant="ghost" @click="applyField('price', ai.lastSuggestion.price)">Aplicar preço</UiButton>
          </div>
          <strong class="pc-review-price">{{ formatCurrency(ai.lastSuggestion.price) }}</strong>
          <p v-if="hasNumber(form.values.cost) && Number(form.values.cost) > 0" class="pc-review-meta ui-muted">
            Margem com este preço: {{ marginForPrice(ai.lastSuggestion.price) }}
          </p>
        </div>

        <div v-if="ai.lastSuggestion.description" class="pc-review-block">
          <div class="pc-review-block-head">
            <span class="pc-review-block-label">Descrição SEO sugerida</span>
            <UiButton size="sm" variant="ghost" @click="applyField('description', ai.lastSuggestion.description)">Aplicar descrição</UiButton>
          </div>
          <p class="pc-review-desc">{{ ai.lastSuggestion.description }}</p>
        </div>

        <div v-if="ai.lastSuggestion.price == null && !ai.lastSuggestion.description" class="pc-review-empty">
          <UiEmptyState
            icon="🤖"
            title="Sem campos aplicáveis"
            description="A IA respondeu, mas não foi possível extrair um preço ou descrição estruturados. Veja a resposta abaixo."
            compact
          />
        </div>

        <details v-if="ai.lastSuggestion.raw" class="pc-review-raw">
          <summary>Resposta completa do assistente</summary>
          <p class="pc-review-raw-text">{{ ai.lastSuggestion.raw }}</p>
        </details>

        <p class="pc-review-note ui-muted">{{ ai.lastSuggestion.note }}</p>
      </div>

      <template #footer>
        <UiButton variant="ghost" @click="reviewOpen = false">Fechar</UiButton>
        <UiButton
          variant="primary"
          :disabled="ai.lastSuggestion && ai.lastSuggestion.price == null && !ai.lastSuggestion.description"
          @click="applyAll"
        >Aplicar tudo</UiButton>
      </template>
    </UiModal>

    <template #footer>
      <span>Os campos marcados com <span class="pc-req-mark">*</span> são obrigatórios.</span>
    </template>
  </UiPageLayout>
</template>

<script setup>
import { reactive, ref, computed, onMounted } from 'vue';
import {
  UiPageLayout, UiCard, UiButton, UiFormSection, UiFormField,
  UiStatusBadge, UiEmptyState, UiLoadingState, UiErrorState, UiModal,
  useForm, useToast, useConfirm, validators, format,
} from '../ui/index.js';
import { products, store } from '../api.js';

const toast = useToast();
const confirm = useConfirm();
const { formatCurrency, formatNumber } = format;
const { required, minLen, maxLen, numeric, min } = validators;

/* ------------------------------------------------------------------ *
 * Opções de domínio
 * ------------------------------------------------------------------ */
const statusOptions = [
  { value: 'rascunho', label: 'Rascunho' },
  { value: 'publicado', label: 'Publicado' },
  { value: 'arquivado', label: 'Arquivado' },
];
const categorySuggestions = ['Vestuário', 'Calçados', 'Acessórios', 'Casa', 'Eletrônicos', 'Beleza', 'Esporte', 'Papelaria'];

function statusLabelFor(value) {
  const opt = statusOptions.find((o) => o.value === value);
  return opt ? opt.label : (value || 'Rascunho');
}
function hasNumber(v) {
  return v !== '' && v !== null && v !== undefined && isFinite(Number(v));
}

/* ------------------------------------------------------------------ *
 * Formulário (useForm + validators puros)
 * ------------------------------------------------------------------ */
const form = useForm({
  initial: {
    sku: '', name: '', description: '', category: '',
    price: '', cost: '', stockQty: '', active: true, status: 'rascunho',
  },
  rules: {
    sku: [required('Informe o SKU'), minLen(2, 'SKU muito curto')],
    name: [required('Informe o nome'), minLen(2, 'Nome muito curto'), maxLen(120, 'Nome muito longo')],
    description: [maxLen(600, 'Descrição muito longa')],
    price: [required('Informe o preço'), numeric('Preço inválido'), min(0.01, 'O preço deve ser maior que zero')],
    cost: [numeric('Custo inválido'), min(0, 'Custo não pode ser negativo')],
    stockQty: [required('Informe o estoque'), numeric('Estoque inválido'), min(0, 'Estoque não pode ser negativo')],
  },
});

const descriptionHint = computed(() => {
  const len = String(form.values.description || '').length;
  return len ? len + '/600 caracteres' : 'Texto exibido na página do produto (até 600 caracteres).';
});

const created = ref(null);
// erro PERSISTENTE de submit (além do toast efêmero): alimenta o UiErrorState com "Tentar novamente".
const submitError = reactive({ message: '', code: '', retryable: true });
const lastPayload = ref(null);

function normalizeSku(raw) {
  return String(raw || '').toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 40);
}

/* ------------------------------------------------------------------ *
 * Margem estimada (preço × custo)
 * ------------------------------------------------------------------ */
function computeMargin(price, cost) {
  const p = Number(price);
  const c = Number(cost);
  if (!isFinite(p) || p <= 0 || !isFinite(c) || c <= 0) return null;
  return (p - c) / p;
}
const margin = computed(() => computeMargin(form.values.price, form.values.cost));
const marginDisplay = computed(() => (margin.value == null ? '—' : (margin.value * 100).toFixed(1) + '%'));
const marginTone = computed(() => {
  if (margin.value == null) return 'neutral';
  if (margin.value < 0) return 'error';
  if (margin.value < 0.2) return 'warning';
  return 'success';
});
const marginHint = computed(() => {
  if (margin.value == null) return 'Informe preço e custo';
  if (margin.value < 0) return 'Preço abaixo do custo';
  if (margin.value < 0.2) return 'Margem apertada';
  return 'Margem saudável';
});
function marginForPrice(price) {
  const m = computeMargin(price, form.values.cost);
  return m == null ? '—' : (m * 100).toFixed(1) + '%';
}

/* ------------------------------------------------------------------ *
 * Assistente de IA — dry-run (REQ-SHOPDESK-0006)
 *   GET  /v1/assistant/health  → { ai: boolean }  (fail-closed real)
 *   POST /v1/assistant         → { answer }       (503 sem chave)
 * A sugestão NUNCA altera o formulário sozinha: vai para o modal de revisão,
 * que exige um clique explícito em "Aplicar" / "Aplicar tudo".
 * ------------------------------------------------------------------ */
const ai = reactive({
  loading: false, checking: false, error: '', code: '', retryable: true,
  unavailable: false, lastSuggestion: null,
});
const reviewOpen = ref(false);
const canSuggest = computed(() => String(form.values.name || '').trim().length >= 2);

async function checkAvailability() {
  // fail-soft: se a checagem falhar, NÃO bloqueia — deixa a tentativa real reportar 503.
  try {
    const res = await store.assistantHealth();
    ai.unavailable = !!(res && res.ai === false);
  } catch {
    ai.unavailable = false;
  }
}
async function recheckAi() {
  ai.checking = true;
  try {
    await checkAvailability();
    if (!ai.unavailable) toast.success('Assistente disponível novamente.');
  } finally {
    ai.checking = false;
  }
}

function buildPrompt() {
  const parts = [
    'Você é assistente de catálogo de uma loja. Sugira um preço de venda (BRL) e uma descrição curta otimizada para SEO.',
    'Produto: ' + (form.values.name || '').trim(),
  ];
  if (form.values.category) parts.push('Categoria: ' + form.values.category);
  if (hasNumber(form.values.cost)) parts.push('Custo unitário: R$ ' + Number(form.values.cost).toFixed(2));
  if (form.values.description) parts.push('Descrição atual: ' + form.values.description);
  parts.push('Responda de forma objetiva com o preço sugerido e a descrição.');
  return parts.join('\n');
}

// O assistant-service devolve { answer } em prosa, então extraímos preço e descrição do texto livre.
const PRICE_RE = /R\$\s*([\d.]+,\d{2}|\d+(?:[.,]\d{1,2})?)/i;
function extractPrice(text) {
  if (!text) return null;
  const m = String(text).match(PRICE_RE);
  if (!m) return null;
  const raw = m[1].replace(/\.(?=\d{3}\b)/g, '').replace(',', '.');
  const n = Number(raw);
  return isFinite(n) && n > 0 ? n : null;
}
// Remove a(s) frase(s) que carregam o preço para a descrição não vir poluída com o valor monetário.
function extractDescription(text, hadPrice) {
  const raw = String(text || '').trim();
  if (!raw) return '';
  if (!hadPrice) return raw;
  const sentences = raw.split(/(?<=[.!?\n])\s+/).filter((s) => s.trim());
  const clean = sentences.filter((s) => !PRICE_RE.test(s));
  const joined = clean.join(' ').trim();
  return joined.length >= 12 ? joined : raw;
}

async function suggest() {
  if (!canSuggest.value || ai.loading || ai.unavailable) return;
  ai.loading = true;
  ai.error = '';
  ai.code = '';
  try {
    const res = await store.assistant(buildPrompt());
    const answer = (res && res.answer ? String(res.answer) : '').trim();
    if (!answer) {
      ai.error = 'O assistente não retornou uma sugestão. Tente novamente.';
      ai.retryable = true;
      return;
    }
    const price = extractPrice(answer);
    ai.lastSuggestion = {
      price,
      description: extractDescription(answer, price != null),
      raw: answer,
      note: 'Sugestão em dry-run: nada é alterado até você clicar em Aplicar.',
    };
    reviewOpen.value = true;
    toast.info('Sugestão gerada — revise e aplique.');
  } catch (e) {
    if (e.status === 503) {
      ai.unavailable = true;
      toast.warning('Assistente indisponível (fail-closed). Preencha manualmente.');
    } else {
      ai.error = e.message || 'Falha ao consultar o assistente.';
      ai.code = e.status ? String(e.status) : '';
      ai.retryable = true;
      toast.error('Não foi possível consultar a IA.', { detail: e.message });
    }
  } finally {
    ai.loading = false;
  }
}

function applyField(field, value) {
  if (value == null || value === '') return;
  form.setField(field, field === 'price' ? Number(value) : value);
  toast.success(field === 'price' ? 'Preço aplicado ao formulário.' : 'Descrição aplicada ao formulário.');
}

function applyAll() {
  const s = ai.lastSuggestion;
  if (!s) return;
  let n = 0;
  if (s.price != null) { form.setField('price', Number(s.price)); n++; }
  if (s.description) { form.setField('description', s.description); n++; }
  if (n > 0) {
    toast.success('Sugestão aplicada ao formulário (' + n + ' campo' + (n > 1 ? 's' : '') + ').');
    reviewOpen.value = false;
  }
}

/* ------------------------------------------------------------------ *
 * Submit — POST /v1/products (com confirmação p/ situação arquivada)
 * ------------------------------------------------------------------ */
function toPayload(v) {
  return {
    sku: v.sku.trim(),
    name: v.name.trim(),
    description: v.description ? v.description.trim() : '',
    category: v.category ? v.category.trim() : '',
    price: Number(v.price),
    cost: v.cost === '' || v.cost == null ? null : Number(v.cost),
    stockQty: Number(v.stockQty),
    active: !!v.active,
    status: v.status || 'rascunho',
  };
}

async function persist(payload) {
  submitError.message = '';
  try {
    const res = await products.create(payload);
    created.value = res && res.id ? Object.assign({}, payload, res) : payload;
    lastPayload.value = null;
    toast.success('Produto "' + payload.name + '" cadastrado.');
  } catch (e) {
    lastPayload.value = payload;
    submitError.message = 'Não foi possível cadastrar o produto. ' + (e.message || 'Verifique os dados e tente novamente.');
    submitError.code = e.status ? String(e.status) : '';
    submitError.retryable = true;
    toast.error('Falha ao cadastrar o produto.', { detail: e.message, code: e.status ? String(e.status) : '' });
  }
}

async function onSubmit() {
  await form.handleSubmit(async (values) => {
    const payload = toPayload(values);
    if (payload.status === 'arquivado') {
      const ok = await confirm({
        title: 'Criar produto arquivado?',
        message: 'O produto será criado já arquivado e ficará oculto na loja. Deseja continuar?',
        confirmLabel: 'Criar mesmo assim',
        cancelLabel: 'Revisar',
      });
      if (!ok) return;
    }
    if (!payload.active && payload.status === 'publicado') {
      const ok = await confirm({
        title: 'Publicado mas inativo?',
        message: 'A situação é "Publicado", mas o produto está inativo e não aparecerá na loja. Continuar mesmo assim?',
        confirmLabel: 'Continuar',
        cancelLabel: 'Revisar',
      });
      if (!ok) return;
    }
    await persist(payload);
  });
}

function retrySubmit() {
  if (lastPayload.value) persist(lastPayload.value);
}

function resetForNew() {
  form.reset();
  created.value = null;
  ai.lastSuggestion = null;
  ai.error = '';
  ai.code = '';
  reviewOpen.value = false;
  submitError.message = '';
  lastPayload.value = null;
  // re-checa a IA para o próximo cadastro (estado pode ter mudado).
  checkAvailability();
}

onMounted(checkAvailability);
</script>

<style scoped>
.pc-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 360px;
  gap: var(--ui-space-5);
  align-items: start;
}
.pc-main {
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-4);
  min-width: 0;
}
.pc-side {
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-4);
  position: sticky;
  top: var(--ui-space-5);
}
.pc-submit-error :deep(.ui-card-body) { padding: var(--ui-space-4); }

@media (max-width: 960px) {
  .pc-layout { grid-template-columns: 1fr; }
  .pc-side { position: static; }
}

/* ---------- campo monetário (símbolo R$ + input) ---------- */
.pc-currency {
  --pc-currency-pad-x: 11px; /* alinhado ao padding do input do kit (8px 11px) */
  display: flex;
  align-items: center;
  gap: var(--ui-space-2);
  background: rgb(var(--ui-bg));
  border: 1px solid rgb(var(--ui-border-strong));
  border-radius: var(--ui-radius-sm);
  padding-left: var(--pc-currency-pad-x);
}
.pc-currency[data-error="true"] { border-color: rgb(var(--ui-danger)); }
.pc-currency:focus-within { outline: 2px solid rgb(var(--ui-accent)); outline-offset: 2px; }
.pc-currency-symbol { color: rgb(var(--ui-muted)); font-weight: 600; font-size: var(--ui-text-sm); }
.pc-currency-input {
  border: none !important;
  background: transparent !important;
  padding-left: 0 !important;
  outline: none;
}

/* ---------- faixa de margem ---------- */
.pc-margin {
  grid-column: 1 / -1;
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: var(--ui-space-2) var(--ui-space-3);
  padding: var(--ui-space-3) var(--ui-space-4);
  border-radius: var(--ui-radius-md);
  border: 1px solid rgb(var(--ui-border));
  background: rgb(var(--ui-surface-2));
}
.pc-margin-label { font-size: var(--ui-text-sm); color: rgb(var(--ui-muted)); font-weight: 600; }
.pc-margin-value { font-family: var(--ui-font-display); font-weight: 700; font-size: var(--ui-text-lg); }
.pc-margin-hint { font-size: var(--ui-text-xs); }
.pc-margin[data-tone="success"] .pc-margin-value,
.pc-margin[data-tone="success"] .pc-margin-hint { color: rgb(var(--ui-ok)); }
.pc-margin[data-tone="warning"] .pc-margin-value,
.pc-margin[data-tone="warning"] .pc-margin-hint { color: rgb(var(--ui-warn)); }
.pc-margin[data-tone="error"] .pc-margin-value,
.pc-margin[data-tone="error"] .pc-margin-hint { color: rgb(var(--ui-danger)); }
.pc-margin[data-tone="neutral"] .pc-margin-value { color: rgb(var(--ui-fg)); }
.pc-margin[data-tone="neutral"] .pc-margin-hint { color: rgb(var(--ui-muted)); }

/* ---------- toggle de disponibilidade ---------- */
.pc-switch {
  --pc-switch-track-w: 42px;
  --pc-switch-track-h: 24px;
  --pc-switch-thumb: 18px;
  --pc-switch-inset: 3px;
  --pc-switch-travel: calc(var(--pc-switch-track-w) - var(--pc-switch-thumb) - (var(--pc-switch-inset) * 2));
  display: inline-flex;
  align-items: center;
  gap: var(--ui-space-3);
  cursor: pointer;
  user-select: none;
}
/* input oculto mas focável (a11y): foco vai ao input, estilo no track via :focus-visible */
.pc-switch-input {
  position: absolute;
  width: 1px;
  height: 1px;
  opacity: 0;
  pointer-events: none;
}
.pc-switch-track {
  position: relative;
  width: var(--pc-switch-track-w);
  height: var(--pc-switch-track-h);
  border-radius: var(--ui-radius-pill);
  background: rgb(var(--ui-border-strong));
  transition: background .15s ease;
  flex-shrink: 0;
}
.pc-switch-thumb {
  position: absolute;
  top: var(--pc-switch-inset);
  left: var(--pc-switch-inset);
  width: var(--pc-switch-thumb);
  height: var(--pc-switch-thumb);
  border-radius: var(--ui-radius-pill);
  background: rgb(var(--ui-surface));
  box-shadow: var(--ui-shadow-sm);
  transition: transform .15s ease;
}
.pc-switch-input:checked + .pc-switch-track { background: rgb(var(--ui-accent)); }
.pc-switch-input:checked + .pc-switch-track .pc-switch-thumb { transform: translateX(var(--pc-switch-travel)); }
.pc-switch-input:focus-visible + .pc-switch-track { outline: 2px solid rgb(var(--ui-accent)); outline-offset: 2px; }
.pc-switch-text { font-size: var(--ui-text-sm); }

/* ---------- painel de IA ---------- */
.pc-ai-card :deep(.ui-card-head) { background: rgb(var(--ui-accent) / 0.06); }
.pc-ai-head { display: flex; align-items: flex-start; gap: var(--ui-space-3); }
.pc-ai-spark {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  border-radius: var(--ui-radius-md);
  background: rgb(var(--ui-accent) / 0.14);
  color: rgb(var(--ui-accent-strong));
  flex-shrink: 0;
}
.pc-ai-title { font-size: var(--ui-text-md); }
.pc-ai-sub { margin: 2px 0 0; font-size: var(--ui-text-xs); color: rgb(var(--ui-muted)); }
.pc-ai-gate { margin: var(--ui-space-2) 0 0; font-size: var(--ui-text-xs); }
.pc-ai-state { margin-top: var(--ui-space-4); }
.pc-ai-hint { margin-top: var(--ui-space-3); font-size: var(--ui-text-sm); }
.pc-ai-hint p { margin: 0; }
.pc-ai-applied { margin-top: var(--ui-space-4); display: flex; flex-direction: column; gap: var(--ui-space-3); }
.pc-ai-badge-row { display: flex; align-items: center; gap: var(--ui-space-2); flex-wrap: wrap; }
.pc-ai-applied-text { margin: 0; font-size: var(--ui-text-sm); }

/* ---------- resumo ---------- */
.pc-summary { margin: 0; display: flex; flex-direction: column; gap: var(--ui-space-2); }
.pc-summary-row { display: flex; align-items: center; justify-content: space-between; gap: var(--ui-space-3); }
.pc-summary-row dt { color: rgb(var(--ui-muted)); font-size: var(--ui-text-sm); flex-shrink: 0; }
.pc-summary-row dd {
  margin: 0;
  font-weight: 600;
  font-size: var(--ui-text-sm);
  text-align: right;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.pc-summary-row dd[data-tone="success"] { color: rgb(var(--ui-ok)); }
.pc-summary-row dd[data-tone="warning"] { color: rgb(var(--ui-warn)); }
.pc-summary-row dd[data-tone="error"] { color: rgb(var(--ui-danger)); }

/* ---------- modal de revisão da IA ---------- */
.pc-review { display: flex; flex-direction: column; gap: var(--ui-space-4); }
.pc-review-banner { display: flex; align-items: center; gap: var(--ui-space-2); flex-wrap: wrap; }
.pc-review-disclaimer { font-size: var(--ui-text-xs); }
.pc-review-block {
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-2);
  padding: var(--ui-space-4);
  border: 1px solid rgb(var(--ui-border));
  border-radius: var(--ui-radius-md);
  background: rgb(var(--ui-surface-2));
}
.pc-review-block-head { display: flex; align-items: center; justify-content: space-between; gap: var(--ui-space-2); flex-wrap: wrap; }
.pc-review-block-label { font-size: var(--ui-text-xs); font-weight: 700; text-transform: uppercase; letter-spacing: .05em; color: rgb(var(--ui-muted)); }
.pc-review-price { font-family: var(--ui-font-display); font-size: var(--ui-text-xl); color: rgb(var(--ui-accent-strong)); }
.pc-review-meta { margin: 0; font-size: var(--ui-text-xs); }
.pc-review-desc { margin: 0; font-size: var(--ui-text-sm); line-height: 1.55; white-space: pre-wrap; }
.pc-review-empty { margin: 0; }
.pc-review-raw { font-size: var(--ui-text-sm); }
.pc-review-raw summary { cursor: pointer; color: rgb(var(--ui-muted)); font-size: var(--ui-text-xs); }
.pc-review-raw-text { margin: var(--ui-space-2) 0 0; font-size: var(--ui-text-xs); color: rgb(var(--ui-muted)); white-space: pre-wrap; line-height: 1.5; }
.pc-review-note { margin: 0; font-size: var(--ui-text-xs); }

/* ---------- sucesso ---------- */
.pc-created-card :deep(.ui-card-body) { padding: var(--ui-space-6); }
.pc-created { display: flex; align-items: flex-start; gap: var(--ui-space-4); }
.pc-created-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 64px;
  height: 64px;
  border-radius: var(--ui-radius-pill);
  background: rgb(var(--ui-ok) / 0.14);
  color: rgb(var(--ui-ok));
  flex-shrink: 0;
}
.pc-created-body { min-width: 0; }
.pc-created-title { font-size: var(--ui-text-xl); }
.pc-created-sub { margin: var(--ui-space-2) 0 0; color: rgb(var(--ui-muted)); }
.pc-created-sku { margin: 0 6px; }
.pc-created-facts {
  margin: var(--ui-space-4) 0 0;
  display: flex;
  flex-wrap: wrap;
  gap: var(--ui-space-3) var(--ui-space-5);
}
.pc-created-fact { display: flex; flex-direction: column; gap: 2px; }
.pc-created-fact dt { font-size: var(--ui-text-xs); color: rgb(var(--ui-muted)); text-transform: uppercase; letter-spacing: .04em; }
.pc-created-fact dd { margin: 0; font-weight: 700; font-size: var(--ui-text-md); }
.pc-created-actions { display: flex; gap: var(--ui-space-2); flex-wrap: wrap; margin-top: var(--ui-space-5); }

@media (max-width: 520px) {
  .pc-created { flex-direction: column; }
}

.pc-req-mark { color: rgb(var(--ui-danger)); font-weight: 700; }
</style>
