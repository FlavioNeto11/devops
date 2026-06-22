<!-- ProductEditView — Editar produto (REQ-SHOPDESK-0005 / REQ-SHOPDESK-0006).
     Edição com os mesmos campos do cadastro + assistente de IA (reescrever descrição / ajustar
     preço) com confirmação EXPLÍCITA antes de aplicar e antes de persistir. CSP-safe: só classes +
     data-* (sem style inline / :style / v-html). Todos os estados (loading/empty/error/normal). -->
<template>
  <UiPageLayout
    eyebrow="Catálogo"
    :title="pageTitle"
    subtitle="Atualize os dados do produto. O assistente de IA pode sugerir uma descrição melhor e um preço — você confirma antes de salvar."
    width="default"
    :loading="loading"
    loading-message="Carregando produto…"
    :error="loadError"
    @retry="reload"
  >
    <template #actions>
      <UiButton variant="ghost" to="/products">Voltar ao catálogo</UiButton>
      <UiButton
        variant="subtle"
        :disabled="!product || saving"
        @click="openAssistant"
      >
        <template #icon-left><span class="pe-ai-glyph" aria-hidden="true">✦</span></template>
        Assistente de IA
      </UiButton>
    </template>

    <!-- ESTADO: produto não encontrado (404 / vazio) -->
    <UiCard v-if="notFound">
      <UiEmptyState
        icon="🔍"
        title="Produto não encontrado"
        description="Este produto não existe mais ou o link está incorreto. Volte ao catálogo para escolher outro."
      >
        <template #action>
          <UiButton to="/products">Ir para o catálogo</UiButton>
        </template>
      </UiEmptyState>
    </UiCard>

    <!-- ESTADO: normal — formulário de edição -->
    <form v-else class="pe-form" novalidate @submit.prevent="onSubmit">
      <UiCard>
        <template #header>
          <div class="pe-head">
            <div class="pe-head-id">
              <h2 class="pe-head-title">{{ form.values.name || 'Produto sem nome' }}</h2>
              <p class="pe-head-meta">
                <span class="ui-mono">{{ form.values.sku || '—' }}</span>
                <span class="pe-dot" aria-hidden="true">·</span>
                <span>Criado em {{ createdAtLabel }}</span>
              </p>
            </div>
            <UiStatusBadge
              v-if="form.values.status"
              :status="form.values.status"
              size="lg"
            />
          </div>
        </template>

        <UiFormSection title="Identificação" description="Como o produto aparece no catálogo." :columns="2">
          <UiFormField label="SKU" required :error="form.errors.sku" hint="Código único do produto.">
            <template #default="{ id, describedBy }">
              <input
                :id="id"
                :value="form.values.sku"
                :aria-describedby="describedBy"
                type="text"
                autocomplete="off"
                placeholder="Ex.: CAM-AZ-001"
                @input="onField('sku', $event.target.value)"
              />
            </template>
          </UiFormField>

          <UiFormField label="Nome" required :error="form.errors.name">
            <template #default="{ id, describedBy }">
              <input
                :id="id"
                :value="form.values.name"
                :aria-describedby="describedBy"
                type="text"
                placeholder="Ex.: Camiseta básica azul"
                @input="onField('name', $event.target.value)"
              />
            </template>
          </UiFormField>

          <UiFormField label="Categoria" :error="form.errors.category" hint="Agrupa produtos semelhantes.">
            <template #default="{ id, describedBy }">
              <input
                :id="id"
                :value="form.values.category"
                :aria-describedby="describedBy"
                type="text"
                placeholder="Ex.: Vestuário"
                @input="onField('category', $event.target.value)"
              />
            </template>
          </UiFormField>

          <UiFormField label="Situação" :error="form.errors.status">
            <template #default="{ id, describedBy }">
              <select
                :id="id"
                :value="form.values.status"
                :aria-describedby="describedBy"
                @change="onField('status', $event.target.value)"
              >
                <option value="">Sem situação</option>
                <option v-for="opt in statusOptions" :key="opt" :value="opt">{{ statusText(opt) }}</option>
              </select>
            </template>
          </UiFormField>

          <UiFormField label="Descrição" :error="form.errors.description" full-width hint="Texto que o cliente lê. Use o assistente para reescrever.">
            <template #default="{ id, describedBy }">
              <textarea
                :id="id"
                :value="form.values.description"
                :aria-describedby="describedBy"
                rows="4"
                placeholder="Descreva o produto de forma clara e atraente…"
                @input="onField('description', $event.target.value)"
              />
            </template>
          </UiFormField>
        </UiFormSection>

        <UiFormSection title="Comercial" description="Preço e custo definem a margem." :columns="2">
          <UiFormField label="Preço (R$)" required :error="form.errors.price" hint="Valor de venda ao cliente.">
            <template #default="{ id, describedBy }">
              <input
                :id="id"
                :value="form.values.price"
                :aria-describedby="describedBy"
                type="number"
                min="0"
                step="0.01"
                inputmode="decimal"
                @input="onField('price', $event.target.value)"
              />
            </template>
          </UiFormField>

          <UiFormField label="Custo (R$)" :error="form.errors.cost" :hint="marginHint">
            <template #default="{ id, describedBy }">
              <input
                :id="id"
                :value="form.values.cost"
                :aria-describedby="describedBy"
                type="number"
                min="0"
                step="0.01"
                inputmode="decimal"
                @input="onField('cost', $event.target.value)"
              />
            </template>
          </UiFormField>
        </UiFormSection>

        <UiFormSection title="Estoque & visibilidade" :columns="2">
          <UiFormField label="Estoque" required :error="form.errors.stockQty" hint="Quantidade disponível.">
            <template #default="{ id, describedBy }">
              <input
                :id="id"
                :value="form.values.stockQty"
                :aria-describedby="describedBy"
                type="number"
                min="0"
                step="1"
                inputmode="numeric"
                @input="onField('stockQty', $event.target.value)"
              />
            </template>
          </UiFormField>

          <UiFormField label="Ativo" :error="form.errors.active" hint="Produtos inativos não aparecem na loja.">
            <template #default="{ id, describedBy }">
              <label class="pe-switch" :class="{ 'pe-switch--on': form.values.active }">
                <input
                  :id="id"
                  :checked="form.values.active"
                  :aria-describedby="describedBy"
                  class="pe-switch-input"
                  type="checkbox"
                  @change="onField('active', $event.target.checked)"
                />
                <span class="pe-switch-track" aria-hidden="true"><span class="pe-switch-knob" /></span>
                <span class="pe-switch-text">{{ form.values.active ? 'Ativo na loja' : 'Inativo' }}</span>
              </label>
            </template>
          </UiFormField>
        </UiFormSection>

        <template #footer>
          <div class="pe-actions">
            <p v-if="dirty" class="pe-dirty" role="status">Há alterações não salvas.</p>
            <p v-else class="pe-dirty pe-dirty--clean" role="status">Tudo salvo.</p>
            <div class="pe-actions-btns">
              <UiButton variant="ghost" type="button" :disabled="saving || !dirty" @click="discard">
                Descartar
              </UiButton>
              <UiButton variant="primary" type="submit" :loading="saving" :disabled="!dirty">
                Salvar alterações
              </UiButton>
            </div>
          </div>
        </template>
      </UiCard>
    </form>

    <!-- ASSISTENTE DE IA — modal: pede sugestão, mostra prévia, exige confirmação p/ aplicar -->
    <UiModal v-model:open="ai.open" title="Assistente de IA" width="lg" @close="resetAssistantTransient">
      <div class="pe-ai">
        <p class="pe-ai-lead">
          A IA analisa o produto atual e sugere uma <strong>descrição reescrita</strong> e um
          <strong>preço</strong>. Nada é alterado sem a sua confirmação.
        </p>

        <UiFormField label="O que você quer melhorar?" hint="Opcional. Ex.: “deixe a descrição mais vendedora” ou “sugira um preço competitivo”.">
          <template #default="{ id, describedBy }">
            <textarea
              :id="id"
              v-model="ai.brief"
              :aria-describedby="describedBy"
              rows="2"
              placeholder="Descreva o ajuste desejado…"
              :disabled="ai.busy"
            />
          </template>
        </UiFormField>

        <div class="pe-ai-run">
          <UiButton variant="subtle" :loading="ai.busy" :disabled="ai.busy" @click="askAssistant">
            <template #icon-left><span class="pe-ai-glyph" aria-hidden="true">✦</span></template>
            {{ ai.suggestion ? 'Gerar novamente' : 'Gerar sugestão' }}
          </UiButton>
        </div>

        <!-- ESTADO: IA indisponível (fail-closed) -->
        <UiErrorState
          v-if="ai.unavailable"
          icon="🔌"
          message="Assistente indisponível no momento (sem chave de IA — modo fail-closed). Você pode editar manualmente."
          :retryable="false"
        />

        <!-- ESTADO: erro de chamada -->
        <UiErrorState
          v-else-if="ai.error"
          :message="ai.error"
          @retry="askAssistant"
        />

        <!-- ESTADO: carregando sugestão -->
        <UiLoadingState v-else-if="ai.busy" title="Pensando na melhor sugestão…" />

        <!-- ESTADO: sugestão pronta -->
        <div v-else-if="ai.suggestion" class="pe-ai-result" aria-live="polite">
          <article v-if="ai.suggestion.description" class="pe-sugg" :class="{ 'pe-sugg--raw': ai.suggestion.raw }">
            <header class="pe-sugg-head">
              <h3 class="pe-sugg-title">Descrição sugerida</h3>
              <UiStatusBadge
                :tone="ai.suggestion.raw ? 'warning' : 'running'"
                :label="ai.suggestion.raw ? 'Resposta não estruturada' : 'Proposta'"
                :with-dot="false"
              />
            </header>
            <p v-if="ai.suggestion.raw" class="pe-sugg-warn" role="status">
              A IA respondeu em texto livre (não estruturado). Revise antes de aplicar — o conteúdo
              pode não ser uma descrição pronta para publicar.
            </p>
            <p class="pe-sugg-text">{{ ai.suggestion.description }}</p>
            <div class="pe-sugg-actions">
              <UiButton
                size="sm"
                :variant="applied.description ? 'subtle' : 'primary'"
                :disabled="applied.description"
                @click="applyDescription"
              >
                {{ applied.description ? '✓ Descrição aplicada' : 'Aplicar descrição' }}
              </UiButton>
            </div>
          </article>

          <article v-if="ai.suggestion.price != null" class="pe-sugg">
            <header class="pe-sugg-head">
              <h3 class="pe-sugg-title">Preço sugerido</h3>
              <UiStatusBadge tone="running" label="Proposta" :with-dot="false" />
            </header>
            <p class="pe-sugg-price">
              <span class="pe-price-from">Atual {{ currency(form.values.price) }}</span>
              <span class="pe-price-arrow" aria-hidden="true">→</span>
              <span class="pe-price-to">{{ currency(ai.suggestion.price) }}</span>
            </p>
            <div class="pe-sugg-actions">
              <UiButton
                size="sm"
                :variant="applied.price ? 'subtle' : 'primary'"
                :disabled="applied.price"
                @click="applyPrice"
              >
                {{ applied.price ? '✓ Preço aplicado' : 'Aplicar preço' }}
              </UiButton>
            </div>
          </article>

          <p v-if="ai.suggestion.rationale" class="pe-ai-rationale">
            <span class="pe-ai-glyph" aria-hidden="true">✦</span> {{ ai.suggestion.rationale }}
          </p>
        </div>

        <!-- ESTADO: ainda não pediu -->
        <UiEmptyState
          v-else
          compact
          icon="✦"
          title="Nenhuma sugestão ainda"
          description="Clique em “Gerar sugestão” para que a IA proponha melhorias."
        />
      </div>

      <template #footer>
        <UiButton variant="ghost" @click="ai.open = false">Fechar</UiButton>
      </template>
    </UiModal>
  </UiPageLayout>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import {
  UiPageLayout, UiCard, UiButton, UiFormField, UiFormSection, UiStatusBadge,
  UiEmptyState, UiErrorState, UiLoadingState, UiModal,
  useForm, useToast, useConfirm, validators, format,
} from '../ui/index.js';
import { products, store } from '../api.js';

const route = useRoute();
const router = useRouter();
const toast = useToast();
const confirm = useConfirm();

const productId = computed(() => route.params.id);
const statusOptions = ['rascunho', 'publicado', 'arquivado'];

/* ---- estados de carga ------------------------------------------------------ */
const loading = ref(true);
const loadError = ref(null);
const notFound = ref(false);
const product = ref(null);
const createdAt = ref(null);
const saving = ref(false);

/* ---- formulário (mesmos campos do cadastro) -------------------------------- */
const { required, numeric, min } = validators;
const form = useForm({
  initial: { sku: '', name: '', description: '', category: '', price: '', cost: '', stockQty: '', active: true, status: '' },
  rules: {
    sku: [required('Informe o SKU.')],
    name: [required('Informe o nome.')],
    price: [required('Informe o preço.'), numeric('Preço inválido.'), min(0, 'O preço não pode ser negativo.')],
    cost: [numeric('Custo inválido.'), min(0, 'O custo não pode ser negativo.')],
    stockQty: [required('Informe o estoque.'), numeric('Estoque inválido.'), min(0, 'O estoque não pode ser negativo.')],
  },
});

/* snapshot p/ detectar alterações e permitir descartar */
const snapshot = ref('{}');
const FIELDS = ['sku', 'name', 'description', 'category', 'price', 'cost', 'stockQty', 'active', 'status'];
function snap() { return JSON.stringify(FIELDS.map((k) => [k, form.values[k]])); }
const dirty = computed(() => snap() !== snapshot.value);

function onField(key, value) { form.setField(key, value); }

/* ---- formatação ------------------------------------------------------------ */
const currency = (v) => format.formatCurrency(v);
const statusText = (s) => format.humanize(s);
const createdAtLabel = computed(() => (createdAt.value ? format.formatDateTime(createdAt.value) : '—'));
const pageTitle = computed(() => (product.value && product.value.name ? 'Editar — ' + product.value.name : 'Editar produto'));
const marginHint = computed(() => {
  const price = Number(form.values.price);
  const cost = Number(form.values.cost);
  if (!isFinite(price) || !isFinite(cost) || price <= 0 || cost <= 0) return 'Para calcular a margem.';
  const margin = ((price - cost) / price) * 100;
  return 'Margem atual: ' + margin.toFixed(1) + '%';
});

/* ---- carga do produto ------------------------------------------------------ */
function hydrate(p) {
  product.value = p;
  createdAt.value = p.createdAt || p.created_at || null;
  for (const k of FIELDS) {
    const v = p[k];
    if (k === 'active') form.setField(k, v == null ? true : !!v);
    else form.setField(k, v == null ? '' : v);
  }
  snapshot.value = snap();
}

async function reload() {
  loading.value = true; loadError.value = null; notFound.value = false;
  try {
    const data = await products.get(productId.value);
    const p = data && data.data ? data.data : data;
    // Confia na identidade do recurso (id/sku) em vez de "objeto vazio" — alinhado ao contrato products.get.
    if (!p || typeof p !== 'object' || (p.id == null && !p.sku)) { notFound.value = true; return; }
    hydrate(p);
  } catch (e) {
    if (e && e.status === 404) notFound.value = true;
    else loadError.value = e && e.message ? e.message : 'Falha ao carregar o produto.';
  } finally {
    loading.value = false;
  }
}

onMounted(reload);

/* ---- salvar ---------------------------------------------------------------- */
function toPayload() {
  return {
    sku: String(form.values.sku || '').trim(),
    name: String(form.values.name || '').trim(),
    description: String(form.values.description || '').trim(),
    category: String(form.values.category || '').trim(),
    price: Number(form.values.price),
    cost: form.values.cost === '' || form.values.cost == null ? null : Number(form.values.cost),
    stockQty: Number(form.values.stockQty),
    active: !!form.values.active,
    status: form.values.status || null,
  };
}

async function onSubmit() {
  if (!form.validate()) {
    toast.warning('Revise os campos destacados antes de salvar.');
    return;
  }
  const ok = await confirm({
    title: 'Salvar alterações?',
    message: 'As mudanças neste produto ficarão visíveis na loja imediatamente.',
    confirmLabel: 'Salvar',
    cancelLabel: 'Revisar',
  });
  if (!ok) return;

  saving.value = true;
  try {
    const payload = toPayload();
    const res = await products.update(productId.value, payload);
    const saved = res && res.data ? res.data : (res || payload);
    hydrate({ ...product.value, ...saved });
    toast.success('Produto atualizado com sucesso.');
    router.push('/products/' + productId.value);
  } catch (e) {
    toast.error('Não foi possível salvar.', { detail: e && e.message ? e.message : '', code: e && e.status ? 'HTTP ' + e.status : '' });
  } finally {
    saving.value = false;
  }
}

async function discard() {
  if (!dirty.value) return;
  const ok = await confirm({
    title: 'Descartar alterações?',
    message: 'Os campos voltarão aos valores salvos. Esta ação não pode ser desfeita.',
    confirmLabel: 'Descartar',
    cancelLabel: 'Continuar editando',
    danger: true,
  });
  if (!ok) return;
  if (product.value) hydrate(product.value);
  toast.info('Alterações descartadas.');
}

/* ---- assistente de IA ------------------------------------------------------ */
const ai = reactive({ open: false, brief: '', busy: false, error: '', unavailable: false, suggestion: null });
const applied = reactive({ description: false, price: false });

function resetAssistantTransient() {
  ai.error = '';
  ai.unavailable = false;
}

function openAssistant() {
  resetAssistantTransient();
  applied.description = false;
  applied.price = false;
  ai.open = true;
}

function buildPrompt() {
  const p = toPayload();
  const lines = [
    'Você é o assistente de catálogo da loja. Para o produto abaixo, sugira uma DESCRIÇÃO reescrita (clara e vendedora, em pt-BR) e um PREÇO de venda em reais.',
    ai.brief ? 'Pedido do lojista: ' + ai.brief : '',
    'Responda em JSON com as chaves: description (string), price (número em reais), rationale (string curta explicando).',
    'Produto atual:',
    '- nome: ' + (p.name || '(sem nome)'),
    '- categoria: ' + (p.category || '(sem categoria)'),
    '- descrição: ' + (p.description || '(vazia)'),
    '- preço: ' + (isFinite(p.price) ? p.price : '(indefinido)'),
    '- custo: ' + (p.cost == null ? '(indefinido)' : p.cost),
  ];
  return lines.filter(Boolean).join('\n');
}

function parseSuggestion(answer) {
  const text = String(answer || '').trim();
  if (!text) return null;
  // `raw` = a IA NÃO respondeu JSON estruturado; a sugestão é prosa bruta e merece baixa confiança.
  const out = { description: '', price: null, rationale: '', raw: false };
  // tenta extrair um bloco JSON da resposta
  const match = text.match(/\{[\s\S]*\}/);
  if (match) {
    try {
      const obj = JSON.parse(match[0]);
      if (typeof obj.description === 'string') out.description = obj.description.trim();
      if (obj.price != null && isFinite(Number(obj.price))) out.price = Number(obj.price);
      if (typeof obj.rationale === 'string') out.rationale = obj.rationale.trim();
      if (out.description || out.price != null) return out;
    } catch (_) { /* cai para o texto livre */ }
  }
  // fallback: resposta não estruturada — trata o texto como descrição bruta e NÃO infere preço
  // por regex agressiva (evita aplicar um número arbitrário do meio da prosa ao campo de preço).
  out.raw = true;
  out.description = text;
  return out;
}

async function askAssistant() {
  ai.busy = true; ai.error = ''; ai.unavailable = false;
  applied.description = false; applied.price = false;
  try {
    const res = await store.assistant(buildPrompt());
    const suggestion = parseSuggestion(res && res.answer);
    if (!suggestion) {
      ai.error = 'A IA não retornou uma sugestão utilizável. Tente reformular o pedido.';
      ai.suggestion = null;
    } else {
      ai.suggestion = suggestion;
    }
  } catch (e) {
    if (e && e.status === 503) ai.unavailable = true;
    else ai.error = e && e.message ? e.message : 'Falha ao consultar o assistente.';
    ai.suggestion = null;
  } finally {
    ai.busy = false;
  }
}

function applyDescription() {
  if (!ai.suggestion || !ai.suggestion.description) return;
  form.setField('description', ai.suggestion.description);
  applied.description = true;
  toast.success('Descrição aplicada ao formulário. Salve para confirmar.');
}

function applyPrice() {
  if (!ai.suggestion || ai.suggestion.price == null) return;
  form.setField('price', ai.suggestion.price);
  applied.price = true;
  toast.success('Preço aplicado ao formulário. Salve para confirmar.');
}
</script>

<style scoped>
.pe-form { display: block; }

/* cabeçalho do card */
.pe-head { display: flex; align-items: flex-start; justify-content: space-between; gap: var(--ui-space-4); width: 100%; }
.pe-head-title { font-size: var(--ui-text-lg); }
.pe-head-meta { margin: 4px 0 0; color: rgb(var(--ui-muted)); font-size: var(--ui-text-sm); display: flex; align-items: center; gap: var(--ui-space-2); flex-wrap: wrap; }
.pe-dot { opacity: .6; }

/* rodapé de ações */
.pe-actions { display: flex; align-items: center; justify-content: space-between; gap: var(--ui-space-4); flex-wrap: wrap; width: 100%; }
.pe-actions-btns { display: flex; gap: var(--ui-space-2); margin-left: auto; }
.pe-dirty { margin: 0; font-size: var(--ui-text-sm); color: rgb(var(--ui-warn)); font-weight: 600; }
.pe-dirty--clean { color: rgb(var(--ui-muted)); font-weight: 500; }

/* switch (checkbox estilizado, sem libs) */
.pe-switch { display: inline-flex; align-items: center; gap: var(--ui-space-3); cursor: pointer; user-select: none; }
.pe-switch-input { position: absolute; opacity: 0; width: 1px; height: 1px; }
.pe-switch-track { width: 42px; height: 24px; border-radius: var(--ui-radius-pill); background: rgb(var(--ui-border-strong)); position: relative; transition: background .15s ease; flex-shrink: 0; }
.pe-switch-knob { position: absolute; top: 3px; left: 3px; width: 18px; height: 18px; border-radius: 50%; background: rgb(var(--ui-surface)); box-shadow: var(--ui-shadow-sm); transition: transform .15s ease; }
.pe-switch--on .pe-switch-track { background: rgb(var(--ui-accent)); }
.pe-switch--on .pe-switch-knob { transform: translateX(18px); }
.pe-switch-input:focus-visible + .pe-switch-track { outline: 2px solid rgb(var(--ui-accent)); outline-offset: 2px; }
.pe-switch-text { font-size: var(--ui-text-sm); color: rgb(var(--ui-fg)); }

/* assistente de IA */
.pe-ai { display: flex; flex-direction: column; gap: var(--ui-space-4); }
.pe-ai-lead { margin: 0; color: rgb(var(--ui-muted)); font-size: var(--ui-text-sm); }
.pe-ai-run { display: flex; }
.pe-ai-glyph { color: rgb(var(--ui-accent-strong)); font-weight: 700; }
.pe-ai-result { display: flex; flex-direction: column; gap: var(--ui-space-3); }
.pe-ai-rationale { margin: 0; padding: var(--ui-space-3); border-radius: var(--ui-radius-md); background: rgb(var(--ui-accent) / 0.08); color: rgb(var(--ui-fg)); font-size: var(--ui-text-sm); display: flex; gap: var(--ui-space-2); align-items: flex-start; }

.pe-sugg { border: 1px solid rgb(var(--ui-border)); border-radius: var(--ui-radius-md); padding: var(--ui-space-4); background: rgb(var(--ui-surface-2)); display: flex; flex-direction: column; gap: var(--ui-space-3); }
.pe-sugg--raw { border-color: rgb(var(--ui-warn) / 0.5); background: rgb(var(--ui-warn) / 0.06); }
.pe-sugg-head { display: flex; align-items: center; justify-content: space-between; gap: var(--ui-space-3); }
.pe-sugg-title { font-size: var(--ui-text-md); }
.pe-sugg-warn { margin: 0; font-size: var(--ui-text-sm); color: rgb(var(--ui-warn)); }
.pe-sugg-text { margin: 0; white-space: pre-wrap; line-height: 1.55; }
.pe-sugg-price { margin: 0; display: flex; align-items: center; gap: var(--ui-space-3); flex-wrap: wrap; }
.pe-price-from { color: rgb(var(--ui-muted)); text-decoration: line-through; }
.pe-price-arrow { color: rgb(var(--ui-muted)); }
.pe-price-to { font-family: var(--ui-font-display); font-weight: 700; font-size: var(--ui-text-lg); color: rgb(var(--ui-accent-strong)); }
.pe-sugg-actions { display: flex; gap: var(--ui-space-2); }

@media (max-width: 640px) {
  .pe-head { flex-direction: column; }
  .pe-actions { flex-direction: column; align-items: stretch; }
  .pe-actions-btns { margin-left: 0; }
}
</style>
