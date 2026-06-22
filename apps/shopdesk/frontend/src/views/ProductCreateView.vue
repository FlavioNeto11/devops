<template>
  <UiPageLayout
    eyebrow="Catálogo"
    title="Novo produto"
    subtitle="Cadastre um produto e use o assistente de IA para sugerir preço e descrição SEO."
    width="wide"
  >
    <template #actions>
      <UiButton variant="ghost" to="/products">Cancelar</UiButton>
      <UiButton
        variant="primary"
        :loading="form.submitting.value"
        :disabled="!canSubmit || form.submitting.value"
        @click="onSubmit"
      >Salvar produto</UiButton>
    </template>

    <!-- Estado: formulário -->
    <form class="layout" novalidate @submit.prevent="onSubmit">
      <div class="layout-main">
        <UiCard>
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
                  list="category-options"
                  autocomplete="off"
                  placeholder="Ex.: Vestuário"
                  :aria-invalid="hasError ? 'true' : null"
                  :aria-describedby="describedBy"
                  :value="form.values.category"
                  @input="form.setField('category', $event.target.value)"
                />
                <datalist id="category-options">
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

            <UiFormField label="Descrição" full-width :error="form.errors.description">
              <template #default="{ id, describedBy }">
                <textarea
                  :id="id"
                  rows="5"
                  placeholder="Descreva benefícios, materiais e diferenciais do produto…"
                  :aria-describedby="describedBy"
                  :value="form.values.description"
                  @input="form.setField('description', $event.target.value)"
                />
              </template>
            </UiFormField>
          </UiFormSection>

          <UiFormSection
            title="Preço e custo"
            description="Defina o preço de venda; informe o custo para acompanhar a margem."
            :columns="2"
          >
            <UiFormField label="Preço de venda" required :error="form.errors.price" hint="Valor cobrado do cliente.">
              <template #default="{ id, describedBy, hasError }">
                <div class="currency" :data-error="hasError ? 'true' : null">
                  <span class="currency-symbol" aria-hidden="true">R$</span>
                  <input
                    :id="id"
                    type="number"
                    inputmode="decimal"
                    min="0"
                    step="0.01"
                    placeholder="0,00"
                    class="currency-input"
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
                <div class="currency" :data-error="hasError ? 'true' : null">
                  <span class="currency-symbol" aria-hidden="true">R$</span>
                  <input
                    :id="id"
                    type="number"
                    inputmode="decimal"
                    min="0"
                    step="0.01"
                    placeholder="0,00"
                    class="currency-input"
                    :aria-invalid="hasError ? 'true' : null"
                    :aria-describedby="describedBy"
                    :value="form.values.cost"
                    @input="form.setField('cost', $event.target.value)"
                  />
                </div>
              </template>
            </UiFormField>

            <div class="margin-strip" :data-tone="marginTone" role="status">
              <span class="margin-label">Margem estimada</span>
              <span class="margin-value">{{ marginDisplay }}</span>
              <span class="margin-hint">{{ marginHint }}</span>
            </div>
          </UiFormSection>

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

            <UiFormField label="Disponibilidade" full-width>
              <template #default="{ id, describedBy }">
                <label :for="id" class="switch" :aria-describedby="describedBy">
                  <input
                    :id="id"
                    type="checkbox"
                    class="switch-input"
                    :checked="form.values.active"
                    @change="form.setField('active', $event.target.checked)"
                  />
                  <span class="switch-track" aria-hidden="true"><span class="switch-thumb" /></span>
                  <span class="switch-text">{{ form.values.active ? 'Ativo — visível na loja' : 'Inativo — oculto da loja' }}</span>
                </label>
              </template>
            </UiFormField>
          </UiFormSection>
        </UiCard>

        <!-- Estado: falha de submit (persistente, com Tentar novamente) -->
        <UiCard v-if="submitError.message" class="submit-error">
          <UiErrorState
            :message="submitError.message"
            :code="submitError.code"
            :retryable="submitError.retryable"
            @retry="retrySubmit"
          />
        </UiCard>
      </div>

      <aside class="layout-side">
        <UiCard class="ai-card">
          <template #header>
            <div class="ai-head">
              <span class="ai-spark" aria-hidden="true">
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M18.4 5.6l-2.8 2.8M8.4 15.6l-2.8 2.8" />
                </svg>
              </span>
              <div>
                <h3 class="ai-title">Assistente de preço & SEO</h3>
                <p class="ai-sub">Sugestão em modo dry-run — nada muda até você aplicar.</p>
              </div>
            </div>
          </template>

          <UiButton
            variant="subtle"
            block
            :loading="ai.loading"
            :disabled="!canSuggest || ai.loading"
            @click="suggest"
          >
            {{ ai.suggestion ? 'Gerar nova sugestão' : 'Sugerir com IA' }}
          </UiButton>

          <p v-if="!canSuggest" class="ai-gate ui-muted">
            Informe ao menos o nome do produto para gerar uma sugestão.
          </p>

          <!-- Estado IA: loading -->
          <div v-if="ai.loading" class="ai-state">
            <UiLoadingState variant="skeleton" :skeleton-lines="3" title="Consultando o assistente…" />
          </div>

          <!-- Estado IA: erro -->
          <div v-else-if="ai.error" class="ai-state">
            <UiErrorState
              :message="ai.error"
              :code="ai.code"
              :retryable="ai.retryable"
              @retry="suggest"
            />
          </div>

          <!-- Estado IA: indisponível (fail-closed 503) -->
          <div v-else-if="ai.unavailable" class="ai-state">
            <UiEmptyState
              title="Assistente indisponível"
              description="A IA está fora no momento (fail-closed, sem chave de IA). Você pode preencher os campos manualmente."
              icon="alert"
            />
          </div>

          <!-- Estado IA: sugestão pronta (dry-run, exige aplicar) -->
          <div v-else-if="ai.suggestion" class="ai-result">
            <div class="ai-badge-row">
              <UiStatusBadge status="rascunho" label="Dry-run" tone="warning" />
              <span class="ui-muted ai-disclaimer">Revise antes de aplicar.</span>
            </div>

            <div v-if="ai.suggestion.price != null" class="ai-block">
              <span class="ai-block-label">Preço sugerido</span>
              <div class="ai-block-row">
                <strong class="ai-price">{{ formatCurrency(ai.suggestion.price) }}</strong>
                <UiButton size="sm" variant="ghost" @click="applyField('price', ai.suggestion.price)">Aplicar preço</UiButton>
              </div>
            </div>

            <div v-if="ai.suggestion.description" class="ai-block">
              <span class="ai-block-label">Descrição SEO sugerida</span>
              <p class="ai-desc">{{ ai.suggestion.description }}</p>
              <UiButton size="sm" variant="ghost" @click="applyField('description', ai.suggestion.description)">Aplicar descrição</UiButton>
            </div>

            <p v-if="ai.suggestion.note" class="ai-note ui-muted">{{ ai.suggestion.note }}</p>

            <UiButton
              v-if="ai.suggestion.price != null || ai.suggestion.description"
              variant="primary"
              block
              @click="applyAll"
            >Aplicar tudo</UiButton>
          </div>

          <!-- Estado IA: vazio (ainda não consultado) -->
          <div v-else class="ai-hint ui-muted">
            <p>O assistente analisa o nome, categoria e custo para propor um preço competitivo e uma descrição otimizada para busca.</p>
          </div>
        </UiCard>

        <UiCard title="Resumo" class="summary-card">
          <dl class="summary">
            <div class="summary-row">
              <dt>Produto</dt>
              <dd>{{ form.values.name || '—' }}</dd>
            </div>
            <div class="summary-row">
              <dt>SKU</dt>
              <dd class="ui-mono">{{ form.values.sku || '—' }}</dd>
            </div>
            <div class="summary-row">
              <dt>Preço</dt>
              <dd>{{ form.values.price ? formatCurrency(form.values.price) : '—' }}</dd>
            </div>
            <div class="summary-row">
              <dt>Estoque</dt>
              <dd>{{ form.values.stockQty !== '' && form.values.stockQty != null ? formatNumber(form.values.stockQty) : '—' }}</dd>
            </div>
            <div class="summary-row">
              <dt>Situação</dt>
              <dd><UiStatusBadge :status="form.values.status" :label="statusLabelFor(form.values.status)" /></dd>
            </div>
          </dl>
        </UiCard>
      </aside>
    </form>

    <template #footer>
      <span>Os campos marcados com <span class="req-mark">*</span> são obrigatórios.</span>
    </template>
  </UiPageLayout>
</template>

<script setup>
import { reactive, ref, computed } from 'vue';
import { useRouter } from 'vue-router';
import {
  UiPageLayout, UiCard, UiButton, UiFormSection, UiFormField,
  UiStatusBadge, UiEmptyState, UiLoadingState, UiErrorState,
  useForm, useToast, useConfirm, validators, format,
} from '../ui/index.js';
import { products, store } from '../api.js';

const router = useRouter();
const toast = useToast();
const confirm = useConfirm();
const { formatCurrency, formatNumber } = format;
const { required, minLen, numeric, min } = validators;

const statusOptions = [
  { value: 'rascunho', label: 'Rascunho' },
  { value: 'publicado', label: 'Publicado' },
  { value: 'arquivado', label: 'Arquivado' },
];
const categorySuggestions = ['Vestuário', 'Calçados', 'Acessórios', 'Casa', 'Eletrônicos', 'Beleza'];

function statusLabelFor(value) {
  const opt = statusOptions.find((o) => o.value === value);
  return opt ? opt.label : value;
}

const form = useForm({
  initial: {
    sku: '', name: '', description: '', category: '',
    price: '', cost: '', stockQty: '', active: true, status: 'rascunho',
  },
  rules: {
    sku: [required('Informe o SKU'), minLen(2, 'SKU muito curto')],
    name: [required('Informe o nome'), minLen(2, 'Nome muito curto')],
    price: [required('Informe o preço'), numeric('Preço inválido'), min(0.01, 'O preço deve ser maior que zero')],
    cost: [numeric('Custo inválido'), min(0, 'Custo não pode ser negativo')],
    stockQty: [required('Informe o estoque'), numeric('Estoque inválido'), min(0, 'Estoque não pode ser negativo')],
  },
});

// erro PERSISTENTE de submit (além do toast efêmero): alimenta o UiErrorState no rodapé do form,
// com botão "Tentar novamente" que reenvia o último payload validado.
const submitError = reactive({ message: '', code: '', retryable: true });
const lastPayload = ref(null);

function normalizeSku(raw) {
  return String(raw || '').toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 40);
}

// ----- margem estimada -----
const margin = computed(() => {
  const price = Number(form.values.price);
  const cost = Number(form.values.cost);
  if (!isFinite(price) || price <= 0 || !isFinite(cost) || cost <= 0) return null;
  return (price - cost) / price;
});
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

// habilita/desabilita o botão Salvar: campos obrigatórios preenchidos e válidos
const canSubmit = computed(() =>
  String(form.values.sku || '').trim().length >= 2 &&
  String(form.values.name || '').trim().length >= 2 &&
  form.values.price !== '' && form.values.price != null && Number(form.values.price) > 0 &&
  form.values.stockQty !== '' && form.values.stockQty != null && Number(form.values.stockQty) >= 0
);

// ----- assistente de IA (dry-run) -----
const ai = reactive({ loading: false, error: '', code: '', retryable: true, unavailable: false, suggestion: null });
const canSuggest = computed(() => String(form.values.name || '').trim().length >= 2);

function buildPrompt() {
  const parts = [
    'Você é assistente de catálogo de uma loja. Sugira um preço de venda (BRL) e uma descrição curta otimizada para SEO.',
    'Produto: ' + (form.values.name || '').trim(),
  ];
  if (form.values.category) parts.push('Categoria: ' + form.values.category);
  if (form.values.cost) parts.push('Custo unitário: R$ ' + Number(form.values.cost).toFixed(2));
  if (form.values.description) parts.push('Descrição atual: ' + form.values.description);
  parts.push('Responda de forma objetiva com o preço sugerido e a descrição.');
  return parts.join('\n');
}

// O assistant-service devolve { answer } em prosa (sem structured output ainda),
// então extraímos preço e descrição do texto livre. Regex casa o 1º valor monetário plausível.
const PRICE_RE = /R\$\s*([\d.]+,\d{2}|\d+(?:[.,]\d{1,2})?)/i;
function extractPrice(text) {
  if (!text) return null;
  const m = String(text).match(PRICE_RE);
  if (!m) return null;
  const raw = m[1].replace(/\.(?=\d{3}\b)/g, '').replace(',', '.');
  const n = Number(raw);
  return isFinite(n) && n > 0 ? n : null;
}

// Deriva uma descrição SEO limpa: remove a frase que carrega o preço (ex.: "Sugiro um preço de R$49,90…")
// para que "Aplicar descrição" não despeje o blob inteiro com o preço embutido no campo de descrição.
function extractDescription(text, hadPrice) {
  const raw = String(text || '').trim();
  if (!raw) return '';
  if (!hadPrice) return raw;
  const sentences = raw.split(/(?<=[.!?\n])\s+/).filter((s) => s.trim());
  const clean = sentences.filter((s) => !PRICE_RE.test(s));
  const joined = clean.join(' ').trim();
  // Se sobrou conteúdo após remover a(s) frase(s) de preço, usa-o; senão cai no texto bruto.
  return joined.length >= 12 ? joined : raw;
}

async function suggest() {
  if (!canSuggest.value || ai.loading) return;
  ai.loading = true;
  ai.error = '';
  ai.code = '';
  ai.unavailable = false;
  ai.suggestion = null;
  try {
    const res = await store.assistant(buildPrompt());
    const answer = (res && res.answer ? String(res.answer) : '').trim();
    if (!answer) {
      ai.error = 'O assistente não retornou uma sugestão. Tente novamente.';
      ai.retryable = true;
      return;
    }
    const price = extractPrice(answer);
    ai.suggestion = {
      price,
      description: extractDescription(answer, price != null),
      note: 'Sugestão em dry-run: nada é alterado até você clicar em Aplicar.',
    };
    toast.info('Sugestão gerada — revise e aplique.');
  } catch (e) {
    if (e.status === 503) {
      ai.unavailable = true;
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
  toast.success(field === 'price' ? 'Preço aplicado.' : 'Descrição aplicada.');
}

function applyAll() {
  let n = 0;
  if (ai.suggestion?.price != null) { form.setField('price', Number(ai.suggestion.price)); n++; }
  if (ai.suggestion?.description) { form.setField('description', ai.suggestion.description); n++; }
  if (n > 0) toast.success('Sugestão aplicada ao formulário.');
}

// ----- submit -----
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

// Persiste o produto. Centraliza o tratamento de erro p/ ser reusado pelo "Tentar novamente".
async function persist(payload) {
  submitError.message = '';
  try {
    const res = await products.create(payload);
    lastPayload.value = null;
    toast.success('Produto "' + payload.name + '" cadastrado.');
    router.push('/products/' + (res && res.id ? res.id : ''));
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
      });
      if (!ok) return;
    }
    await persist(payload);
  });
}

// Reenvia o último payload validado após uma falha de submit (sem revalidar o form).
function retrySubmit() {
  if (lastPayload.value) persist(lastPayload.value);
}


</script>

<style scoped>
.layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 360px;
  gap: var(--ui-space-5);
  align-items: start;
}
.layout-main {
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-4);
}
.layout-side {
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-4);
  position: sticky;
  top: var(--ui-space-5);
}
.submit-error :deep(.ui-card-body) { padding: var(--ui-space-4); }
@media (max-width: 960px) {
  .layout { grid-template-columns: 1fr; }
  .layout-side { position: static; }
}

/* campo monetário — padding-left alinhado ao input do kit (UiFormField usa 8px 11px; sem token de 11px) */
.currency {
  --currency-pad-x: 11px;
  display: flex;
  align-items: center;
  gap: var(--ui-space-2);
  background: rgb(var(--ui-bg));
  border: 1px solid rgb(var(--ui-border-strong));
  border-radius: var(--ui-radius-sm);
  padding-left: var(--currency-pad-x);
}
.currency[data-error="true"] { border-color: rgb(var(--ui-danger)); }
.currency:focus-within { outline: 2px solid rgb(var(--ui-accent)); outline-offset: 2px; }
.currency-symbol { color: rgb(var(--ui-muted)); font-weight: 600; font-size: var(--ui-text-sm); }
.currency-input {
  border: none !important;
  background: transparent !important;
  padding-left: 0 !important;
  outline: none;
}

/* faixa de margem */
.margin-strip {
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
.margin-label { font-size: var(--ui-text-sm); color: rgb(var(--ui-muted)); font-weight: 600; }
.margin-value { font-family: var(--ui-font-display); font-weight: 700; font-size: var(--ui-text-lg); }
.margin-hint { font-size: var(--ui-text-xs); }
.margin-strip[data-tone="success"] .margin-value,
.margin-strip[data-tone="success"] .margin-hint { color: rgb(var(--ui-ok)); }
.margin-strip[data-tone="warning"] .margin-value,
.margin-strip[data-tone="warning"] .margin-hint { color: rgb(var(--ui-warn)); }
.margin-strip[data-tone="error"] .margin-value,
.margin-strip[data-tone="error"] .margin-hint { color: rgb(var(--ui-danger)); }
.margin-strip[data-tone="neutral"] .margin-value { color: rgb(var(--ui-fg)); }
.margin-strip[data-tone="neutral"] .margin-hint { color: rgb(var(--ui-muted)); }

/* toggle de disponibilidade — geometria sem token de dimensão; custom properties locais documentam a intenção.
   travel = track - thumb - 2*inset, garantindo simetria das margens do thumb. */
.switch {
  --switch-track-w: 42px;
  --switch-track-h: 24px;
  --switch-thumb: 18px;
  --switch-inset: 3px;
  --switch-travel: calc(var(--switch-track-w) - var(--switch-thumb) - (var(--switch-inset) * 2));
  display: inline-flex;
  align-items: center;
  gap: var(--ui-space-3);
  cursor: pointer;
  user-select: none;
}
/* input visualmente oculto mas focável (a11y): foco vai ao input, estilo no .switch-track via :focus-visible */
.switch-input {
  position: absolute;
  width: 1px;
  height: 1px;
  opacity: 0;
  pointer-events: none;
}
.switch-track {
  position: relative;
  width: var(--switch-track-w);
  height: var(--switch-track-h);
  border-radius: var(--ui-radius-pill);
  background: rgb(var(--ui-border-strong));
  transition: background .15s ease;
  flex-shrink: 0;
}
.switch-thumb {
  position: absolute;
  top: var(--switch-inset);
  left: var(--switch-inset);
  width: var(--switch-thumb);
  height: var(--switch-thumb);
  border-radius: var(--ui-radius-pill);
  background: rgb(var(--ui-surface));
  box-shadow: var(--ui-shadow-sm);
  transition: transform .15s ease;
}
.switch-input:checked + .switch-track { background: rgb(var(--ui-accent)); }
.switch-input:checked + .switch-track .switch-thumb { transform: translateX(var(--switch-travel)); }
.switch-input:focus-visible + .switch-track { outline: 2px solid rgb(var(--ui-accent)); outline-offset: 2px; }
.switch-text { font-size: var(--ui-text-sm); }

/* painel de IA */
.ai-card :deep(.ui-card-head) { background: rgb(var(--ui-accent) / 0.06); }
.ai-head { display: flex; align-items: flex-start; gap: var(--ui-space-3); }
.ai-spark {
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
.ai-title { font-size: var(--ui-text-md); }
.ai-sub { margin: 2px 0 0; font-size: var(--ui-text-xs); color: rgb(var(--ui-muted)); }
.ai-gate { margin: var(--ui-space-2) 0 0; font-size: var(--ui-text-xs); }
.ai-state { margin-top: var(--ui-space-4); }
.ai-hint { margin-top: var(--ui-space-3); font-size: var(--ui-text-sm); }
.ai-hint p { margin: 0; }

.ai-result { margin-top: var(--ui-space-4); display: flex; flex-direction: column; gap: var(--ui-space-3); }
.ai-badge-row { display: flex; align-items: center; gap: var(--ui-space-2); flex-wrap: wrap; }
.ai-disclaimer { font-size: var(--ui-text-xs); }
.ai-block {
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-2);
  padding: var(--ui-space-3);
  border: 1px solid rgb(var(--ui-border));
  border-radius: var(--ui-radius-md);
  background: rgb(var(--ui-surface-2));
}
.ai-block-label { font-size: var(--ui-text-xs); font-weight: 700; text-transform: uppercase; letter-spacing: .05em; color: rgb(var(--ui-muted)); }
.ai-block-row { display: flex; align-items: center; justify-content: space-between; gap: var(--ui-space-2); flex-wrap: wrap; }
.ai-price { font-family: var(--ui-font-display); font-size: var(--ui-text-xl); color: rgb(var(--ui-accent-strong)); }
.ai-desc { margin: 0; font-size: var(--ui-text-sm); line-height: 1.5; white-space: pre-wrap; }
.ai-note { margin: 0; font-size: var(--ui-text-xs); }

/* resumo */
.summary { margin: 0; display: flex; flex-direction: column; gap: var(--ui-space-2); }
.summary-row { display: flex; align-items: center; justify-content: space-between; gap: var(--ui-space-3); }
.summary-row dt { color: rgb(var(--ui-muted)); font-size: var(--ui-text-sm); }
.summary-row dd { margin: 0; font-weight: 600; font-size: var(--ui-text-sm); text-align: right; }


.req-mark { color: rgb(var(--ui-danger)); font-weight: 700; }
</style>
