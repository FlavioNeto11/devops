<template>
  <UiPageLayout
    width="wide"
    :eyebrow="eyebrow"
    :title="pageTitle"
    :subtitle="pageSubtitle"
    :loading="loading"
    loading-message="Carregando produto…"
    :error="error"
    @retry="reload"
  >
    <!-- Ações de cabeçalho (DetailHeader) -->
    <template #actions>
      <UiButton variant="ghost" to="/products">
        <template #icon-left><span class="pd-ico" aria-hidden="true">←</span></template>
        Voltar
      </UiButton>
      <UiButton variant="ghost" @click="openEdit">Editar</UiButton>
      <UiButton
        v-if="!isArchived"
        variant="danger"
        :loading="archiving"
        @click="archive"
      >Arquivar</UiButton>
      <UiButton
        v-else
        variant="subtle"
        :loading="archiving"
        @click="restore"
      >Reativar</UiButton>
    </template>

    <!-- Banner contextual quando o produto está arquivado/inativo -->
    <template v-if="showStatusBanner" #banner>
      <div class="pd-banner" :data-tone="bannerTone" role="status">
        <span class="pd-banner-dot" aria-hidden="true" />
        <span>{{ bannerMessage }}</span>
      </div>
    </template>

    <!-- ===== Conteúdo (estado normal — o PageLayout cobre loading/error) ===== -->
    <!-- Faixa de KPIs -->
    <div class="pd-kpis">
      <UiMetricCard label="Preço de venda" :value="fmtCurrency(product.price)" tone="primary" hint="Valor ao cliente" />
      <UiMetricCard label="Margem bruta" :value="marginValue" :tone="marginTone" :hint="marginHint" />
      <UiMetricCard
        label="Estoque atual"
        :value="fmtNumber(stockQty)"
        :tone="stockTone"
        :hint="stockHint"
        clickable
        @click="scrollToStock"
      />
      <UiMetricCard label="Situação" :value="statusText" :tone="statusMetricTone" :hint="activeHint" />
    </div>

    <div class="pd-grid">
      <!-- Coluna principal: dados do produto (FieldGrid) -->
      <div class="pd-col-main">
        <UiCard title="Dados do produto" subtitle="Informações cadastrais e comerciais.">
          <template #actions>
            <UiStatusBadge :status="statusForBadge" :label="statusText" size="lg" />
          </template>
          <dl class="pd-fields">
            <div class="pd-field">
              <dt>SKU</dt>
              <dd><span class="pd-mono">{{ valueOr(product.sku) }}</span></dd>
            </div>
            <div class="pd-field">
              <dt>Nome</dt>
              <dd>{{ valueOr(product.name) }}</dd>
            </div>
            <div class="pd-field">
              <dt>Categoria</dt>
              <dd>
                <span v-if="product.category" class="pd-chip">{{ product.category }}</span>
                <span v-else class="pd-muted">—</span>
              </dd>
            </div>
            <div class="pd-field">
              <dt>Situação</dt>
              <dd><UiStatusBadge :status="statusForBadge" :label="statusText" /></dd>
            </div>
            <div class="pd-field">
              <dt>Preço</dt>
              <dd class="pd-strong">{{ fmtCurrency(product.price) }}</dd>
            </div>
            <div class="pd-field">
              <dt>Custo</dt>
              <dd>{{ hasCost ? fmtCurrency(product.cost) : '—' }}</dd>
            </div>
            <div class="pd-field">
              <dt>Ativo</dt>
              <dd>
                <span class="pd-bool" :data-on="isActive ? 'true' : 'false'">
                  <span class="pd-bool-dot" aria-hidden="true" />
                  {{ isActive ? 'Sim' : 'Não' }}
                </span>
              </dd>
            </div>
            <div class="pd-field">
              <dt>Criado em</dt>
              <dd>{{ fmtDateTime(product.created_at) }}</dd>
            </div>
            <div class="pd-field pd-field-wide">
              <dt>Descrição</dt>
              <dd>
                <p v-if="product.description" class="pd-desc">{{ product.description }}</p>
                <span v-else class="pd-muted">Sem descrição cadastrada.</span>
              </dd>
            </div>
          </dl>
        </UiCard>

        <!-- SalesHistoryMini — histórico/movimento recente -->
        <UiCard title="Histórico recente" subtitle="Movimentos de estoque deste SKU.">
          <UiLoadingState v-if="invLoading" variant="skeleton" :skeleton-lines="3" />
          <UiErrorState
            v-else-if="invError"
            :message="invError"
            :retryable="true"
            @retry="loadInventory"
          />
          <ul v-else-if="historyItems.length" class="pd-history">
            <li v-for="(h, i) in historyItems" :key="i" class="pd-history-row" :data-tone="h.tone">
              <span class="pd-history-mark" aria-hidden="true" />
              <span class="pd-history-body">
                <span class="pd-history-title">{{ h.title }}</span>
                <span class="pd-history-meta">{{ h.meta }}</span>
              </span>
              <span class="pd-history-value">{{ h.value }}</span>
            </li>
          </ul>
          <UiEmptyState
            v-else
            icon="🧾"
            title="Sem movimento registrado"
            description="Quando houver vendas ou reposições deste SKU, elas aparecem aqui."
            compact
          />
        </UiCard>
      </div>

      <!-- Coluna lateral: estoque (StockBadge) + atalho para repor -->
      <aside ref="stockPanel" class="pd-col-side" tabindex="-1" aria-label="Estoque do produto">
        <UiCard title="Estoque" subtitle="Posição no centro de distribuição.">
          <template #actions>
            <UiButton
              size="sm"
              variant="subtle"
              :disabled="invLoading || !!invError || !inventoryRow"
              @click="openReorder"
            >Repor</UiButton>
          </template>

          <UiLoadingState v-if="invLoading" variant="skeleton" :skeleton-lines="4" />
          <UiErrorState
            v-else-if="invError"
            :message="invError"
            :retryable="true"
            @retry="loadInventory"
          />
          <div v-else-if="inventoryRow" class="pd-stock">
            <div class="pd-stock-head">
              <span class="pd-stock-qty">{{ fmtNumber(inventoryRow.quantity) }}</span>
              <span class="pd-stock-unit">un. em estoque</span>
              <UiStatusBadge
                class="pd-stock-badge"
                :status="inventoryStatusForBadge"
                :label="inventoryStatusText"
                size="lg"
              />
            </div>
            <div class="pd-meter" :data-tone="stockTone" role="img" :aria-label="meterAria">
              <span class="pd-meter-fill" :data-pct="meterBucket" />
            </div>
            <dl class="pd-stock-meta">
              <div class="pd-field">
                <dt>Ponto de reposição</dt>
                <dd>{{ valueOrNum(inventoryRow.reorder_point) }}</dd>
              </div>
              <div class="pd-field">
                <dt>Localização</dt>
                <dd>{{ valueOr(inventoryRow.location) }}</dd>
              </div>
            </dl>
            <p v-if="needsReorder" class="pd-stock-alert" role="status">
              Estoque no/abaixo do ponto de reposição — considere repor.
            </p>
          </div>
          <UiEmptyState
            v-else
            icon="📦"
            title="Sem registro de estoque"
            description="Este SKU ainda não tem posição de estoque cadastrada."
            compact
          />
        </UiCard>

        <UiCard title="Resumo financeiro">
          <dl class="pd-stock-meta">
            <div class="pd-field">
              <dt>Preço</dt>
              <dd class="pd-strong">{{ fmtCurrency(product.price) }}</dd>
            </div>
            <div class="pd-field">
              <dt>Custo</dt>
              <dd>{{ hasCost ? fmtCurrency(product.cost) : '—' }}</dd>
            </div>
            <div class="pd-field">
              <dt>Margem</dt>
              <dd class="pd-strong">{{ marginValue }}</dd>
            </div>
            <div class="pd-field">
              <dt>Valor em estoque</dt>
              <dd>{{ stockValue }}</dd>
            </div>
          </dl>
        </UiCard>
      </aside>
    </div>

    <!-- ===== Modal: editar produto ===== -->
    <UiModal v-model:open="editOpen" title="Editar produto" width="lg">
      <form class="pd-form" @submit.prevent="submitEdit">
        <div class="pd-form-grid">
          <UiFormField label="SKU" required :error="form.errors.sku">
            <template #default="{ id, describedBy }">
              <input :id="id" :aria-describedby="describedBy" :value="form.values.sku"
                     @input="form.setField('sku', $event.target.value)" />
            </template>
          </UiFormField>
          <UiFormField label="Nome" required :error="form.errors.name">
            <template #default="{ id, describedBy }">
              <input :id="id" :aria-describedby="describedBy" :value="form.values.name"
                     @input="form.setField('name', $event.target.value)" />
            </template>
          </UiFormField>
          <UiFormField label="Categoria">
            <template #default="{ id }">
              <input :id="id" :value="form.values.category"
                     @input="form.setField('category', $event.target.value)" />
            </template>
          </UiFormField>
          <UiFormField label="Situação">
            <template #default="{ id }">
              <select :id="id" :value="form.values.status" @change="form.setField('status', $event.target.value)">
                <option v-for="opt in statusOptions" :key="opt" :value="opt">{{ humanize(opt) }}</option>
              </select>
            </template>
          </UiFormField>
          <UiFormField label="Preço (R$)" required :error="form.errors.price">
            <template #default="{ id, describedBy }">
              <input :id="id" :aria-describedby="describedBy" type="number" step="0.01" min="0"
                     :value="form.values.price" @input="form.setField('price', $event.target.value)" />
            </template>
          </UiFormField>
          <UiFormField label="Custo (R$)" :error="form.errors.cost">
            <template #default="{ id, describedBy }">
              <input :id="id" :aria-describedby="describedBy" type="number" step="0.01" min="0"
                     :value="form.values.cost" @input="form.setField('cost', $event.target.value)" />
            </template>
          </UiFormField>
          <UiFormField label="Estoque" required :error="form.errors.stockQty">
            <template #default="{ id, describedBy }">
              <input :id="id" :aria-describedby="describedBy" type="number" step="1" min="0"
                     :value="form.values.stockQty" @input="form.setField('stockQty', $event.target.value)" />
            </template>
          </UiFormField>
          <UiFormField label="Ativo">
            <template #default="{ id }">
              <label class="pd-check">
                <input :id="id" type="checkbox" :checked="form.values.active"
                       @change="form.setField('active', $event.target.checked)" />
                <span>Produto disponível para venda</span>
              </label>
            </template>
          </UiFormField>
          <UiFormField label="Descrição" full-width>
            <template #default="{ id }">
              <textarea :id="id" :value="form.values.description"
                        @input="form.setField('description', $event.target.value)"></textarea>
            </template>
          </UiFormField>
        </div>
      </form>
      <template #footer>
        <UiButton variant="ghost" @click="editOpen = false">Cancelar</UiButton>
        <UiButton variant="primary" :loading="form.submitting.value" @click="submitEdit">Salvar alterações</UiButton>
      </template>
    </UiModal>

    <!-- ===== Modal: repor estoque ===== -->
    <UiModal v-model:open="reorderOpen" title="Repor estoque" width="sm">
      <form class="pd-reorder" @submit.prevent="submitReorder">
        <p class="pd-muted">
          SKU <span class="pd-mono">{{ valueOr(product.sku) }}</span> · estoque atual
          <strong>{{ fmtNumber(inventoryRow && inventoryRow.quantity) }}</strong> un.
        </p>
        <UiFormField label="Quantidade a adicionar" required :error="reorderForm.errors.qty" hint="Será somada ao estoque atual.">
          <template #default="{ id, describedBy }">
            <input :id="id" :aria-describedby="describedBy" type="number" min="1" step="1"
                   :value="reorderForm.values.qty" @input="reorderForm.setField('qty', $event.target.value)" />
          </template>
        </UiFormField>
        <p v-if="reorderQtyNum > 0" class="pd-reorder-preview">
          Novo estoque: <strong>{{ fmtNumber(projectedQty) }}</strong> un.
        </p>
      </form>
      <template #footer>
        <UiButton variant="ghost" @click="reorderOpen = false">Cancelar</UiButton>
        <UiButton variant="primary" :loading="reorderForm.submitting.value" @click="submitReorder">Confirmar reposição</UiButton>
      </template>
    </UiModal>
  </UiPageLayout>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import {
  UiPageLayout, UiCard, UiMetricCard, UiStatusBadge, UiButton, UiModal,
  UiFormField, UiEmptyState, UiLoadingState, UiErrorState,
  useToast, useConfirm, useForm, validators, format,
} from '../ui/index.js';
import { products, inventory } from '../api.js';

const route = useRoute();
const toast = useToast();
const confirm = useConfirm();

const STATUS_OPTIONS = ['rascunho', 'publicado', 'arquivado'];
const statusOptions = STATUS_OPTIONS;

// ---- formatadores (kit) ----------------------------------------------------
const fmtCurrency = (v) => format.formatCurrency(v);
const fmtNumber = (v) => format.formatNumber(v);
const fmtDateTime = (v) => format.formatDateTime(v);
const humanize = (v) => format.humanize(v);
const valueOr = (v) => (v === null || v === undefined || v === '' ? '—' : String(v));
const valueOrNum = (v) => (v === null || v === undefined || v === '' ? '—' : fmtNumber(v));

// ---- estado: produto -------------------------------------------------------
const productId = computed(() => route.params.id);
const product = reactive({});
const loading = ref(true);
const error = ref('');
const archiving = ref(false);

function setProduct(row) {
  for (const k of Object.keys(product)) delete product[k];
  Object.assign(product, row || {});
}

async function loadProduct() {
  loading.value = true;
  error.value = '';
  try {
    const row = await products.get(productId.value);
    setProduct(row);
  } catch (e) {
    error.value = e && e.message ? e.message : 'Falha ao carregar o produto.';
  } finally {
    loading.value = false;
  }
}

// ---- estado: estoque (inventory por SKU) -----------------------------------
const inventoryRow = ref(null);
const invLoading = ref(true);
const invError = ref('');

async function loadInventory() {
  invLoading.value = true;
  invError.value = '';
  try {
    const res = await inventory.list();
    const rows = Array.isArray(res) ? res : (res && res.data) || [];
    const sku = product.sku;
    inventoryRow.value = sku ? rows.find((r) => r.sku === sku) || null : null;
  } catch (e) {
    invError.value = e && e.message ? e.message : 'Falha ao carregar o estoque.';
  } finally {
    invLoading.value = false;
  }
}

async function reload() {
  await loadProduct();
  if (!error.value) await loadInventory();
}

// ---- derivados de exibição -------------------------------------------------
const isActive = computed(() => product.active === true || product.active === 'true');
const statusText = computed(() => (product.status ? humanize(product.status) : (isActive.value ? 'Ativo' : 'Inativo')));
const statusForBadge = computed(() => product.status || (isActive.value ? 'ativo' : 'inativo'));
const isArchived = computed(() => String(product.status || '').toLowerCase() === 'arquivado');
const statusMetricTone = computed(() => {
  if (isArchived.value) return 'error';
  if (!isActive.value) return 'warning';
  return 'success';
});
const activeHint = computed(() => (isActive.value ? 'Disponível para venda' : 'Indisponível'));

const eyebrow = computed(() => (product.sku ? 'SKU ' + product.sku : 'Produto'));
const pageTitle = computed(() => product.name || (loading.value ? 'Produto' : 'Produto #' + (productId.value || '')));
const pageSubtitle = computed(() => {
  if (loading.value || error.value) return 'Visão completa do produto.';
  const parts = [];
  if (product.category) parts.push(product.category);
  parts.push(statusText.value);
  return parts.join(' · ');
});

const showStatusBanner = computed(() => !loading.value && !error.value && (isArchived.value || !isActive.value));
const bannerTone = computed(() => (isArchived.value ? 'error' : 'warning'));
const bannerMessage = computed(() =>
  isArchived.value
    ? 'Este produto está arquivado e não aparece na loja.'
    : 'Este produto está inativo e não está disponível para venda.',
);

const hasCost = computed(() => product.cost !== null && product.cost !== undefined && product.cost !== '');
const marginAbs = computed(() => {
  if (!hasCost.value) return null;
  const p = Number(product.price);
  const c = Number(product.cost);
  if (!isFinite(p) || !isFinite(c)) return null;
  return p - c;
});
const marginValue = computed(() => (marginAbs.value === null ? '—' : fmtCurrency(marginAbs.value)));
const marginPct = computed(() => {
  if (marginAbs.value === null) return null;
  const p = Number(product.price);
  if (!isFinite(p) || p === 0) return null;
  return Math.round((marginAbs.value / p) * 100);
});
const marginHint = computed(() => (marginPct.value === null ? 'Informe o custo' : marginPct.value + '% sobre o preço'));
const marginTone = computed(() => {
  if (marginAbs.value === null) return 'neutral';
  if (marginAbs.value <= 0) return 'error';
  if (marginPct.value !== null && marginPct.value < 20) return 'warning';
  return 'success';
});

const stockQty = computed(() => {
  if (inventoryRow.value && inventoryRow.value.quantity != null) return Number(inventoryRow.value.quantity);
  return Number(product.stock_qty != null ? product.stock_qty : product.stockQty);
});
const reorderPoint = computed(() => {
  const rp = inventoryRow.value && inventoryRow.value.reorder_point;
  return rp != null && rp !== '' ? Number(rp) : null;
});
const needsReorder = computed(() => {
  if (reorderPoint.value === null) return stockQty.value <= 0;
  return stockQty.value <= reorderPoint.value;
});
const stockTone = computed(() => {
  if (!isFinite(stockQty.value)) return 'neutral';
  if (stockQty.value <= 0) return 'error';
  if (needsReorder.value) return 'warning';
  return 'success';
});
const stockHint = computed(() => {
  if (!isFinite(stockQty.value)) return 'Sem dado';
  if (stockQty.value <= 0) return 'Esgotado';
  if (needsReorder.value) return 'Abaixo do ponto de reposição';
  return 'Nível saudável';
});
const stockValue = computed(() => {
  const p = Number(product.price);
  if (!isFinite(p) || !isFinite(stockQty.value)) return '—';
  return fmtCurrency(p * stockQty.value);
});

// medidor de estoque (bucket discreto via data-attr — CSP-safe, sem :style)
const meterBucket = computed(() => {
  const q = stockQty.value;
  const rp = reorderPoint.value;
  if (!isFinite(q) || q <= 0) return '0';
  if (rp && rp > 0) {
    const ratio = q / (rp * 2);
    if (ratio >= 1) return '100';
    if (ratio >= 0.75) return '75';
    if (ratio >= 0.5) return '50';
    return '25';
  }
  return '100';
});
const meterAria = computed(() => 'Nível de estoque: ' + stockHint.value);

const inventoryStatusText = computed(() =>
  inventoryRow.value && inventoryRow.value.status ? humanize(inventoryRow.value.status) : stockHint.value,
);
const inventoryStatusForBadge = computed(() => {
  if (inventoryRow.value && inventoryRow.value.status) return inventoryRow.value.status;
  if (stockQty.value <= 0) return 'esgotado';
  if (needsReorder.value) return 'baixo';
  return 'ok';
});

// SalesHistoryMini — derivado dos dados REAIS (sem endpoint fabricado).
const historyItems = computed(() => {
  if (!inventoryRow.value) return [];
  const items = [];
  const q = stockQty.value;
  const rp = reorderPoint.value;
  if (isFinite(q)) {
    items.push({
      tone: stockTone.value,
      title: 'Posição de estoque',
      meta: (inventoryRow.value.location ? inventoryRow.value.location + ' · ' : '') + inventoryStatusText.value,
      value: fmtNumber(q) + ' un.',
    });
  }
  if (rp !== null) {
    items.push({
      tone: needsReorder.value ? 'warning' : 'neutral',
      title: 'Ponto de reposição',
      meta: needsReorder.value ? 'Atingido — repor recomendado' : 'Acima do limite',
      value: fmtNumber(rp) + ' un.',
    });
  }
  if (product.created_at) {
    items.push({
      tone: 'neutral',
      title: 'Cadastro do produto',
      meta: 'Criado na base',
      value: format.formatDate(product.created_at),
    });
  }
  return items;
});

// ---- ações: arquivar / reativar -------------------------------------------
async function archive() {
  const ok = await confirm({
    title: 'Arquivar produto',
    message: 'O produto "' + (product.name || product.sku) + '" deixará de aparecer na loja. Deseja continuar?',
    confirmLabel: 'Arquivar',
    danger: true,
  });
  if (!ok) return;
  archiving.value = true;
  try {
    const updated = await products.update(productId.value, { status: 'arquivado', active: false });
    setProduct(updated);
    toast.success('Produto arquivado.');
  } catch (e) {
    toast.error('Não foi possível arquivar.', { detail: e && e.message });
  } finally {
    archiving.value = false;
  }
}

async function restore() {
  archiving.value = true;
  try {
    const updated = await products.update(productId.value, { status: 'publicado', active: true });
    setProduct(updated);
    toast.success('Produto reativado.');
  } catch (e) {
    toast.error('Não foi possível reativar.', { detail: e && e.message });
  } finally {
    archiving.value = false;
  }
}

// ---- edição ----------------------------------------------------------------
const editOpen = ref(false);
const form = useForm({
  initial: { sku: '', name: '', category: '', status: 'rascunho', price: '', cost: '', stockQty: '', active: true, description: '' },
  rules: {
    sku: [validators.required('Informe o SKU.')],
    name: [validators.required('Informe o nome.')],
    price: [validators.required('Informe o preço.'), validators.numeric('Preço inválido.'), validators.min(0, 'Preço não pode ser negativo.')],
    cost: [validators.numeric('Custo inválido.'), validators.min(0, 'Custo não pode ser negativo.')],
    stockQty: [validators.required('Informe o estoque.'), validators.numeric('Estoque inválido.'), validators.min(0, 'Estoque não pode ser negativo.')],
  },
});

function openEdit() {
  form.reset();
  form.setField('sku', product.sku || '');
  form.setField('name', product.name || '');
  form.setField('category', product.category || '');
  form.setField('status', product.status || 'rascunho');
  form.setField('price', product.price != null ? product.price : '');
  form.setField('cost', product.cost != null ? product.cost : '');
  form.setField('stockQty', (product.stock_qty != null ? product.stock_qty : product.stockQty) ?? '');
  form.setField('active', isActive.value);
  form.setField('description', product.description || '');
  editOpen.value = true;
}

async function submitEdit() {
  await form.handleSubmit(async (vals) => {
    try {
      const payload = {
        sku: vals.sku,
        name: vals.name,
        category: vals.category || null,
        status: vals.status,
        price: Number(vals.price),
        cost: vals.cost === '' || vals.cost === null ? null : Number(vals.cost),
        stockQty: Number(vals.stockQty),
        active: !!vals.active,
        description: vals.description || null,
      };
      const updated = await products.update(productId.value, payload);
      setProduct(updated);
      editOpen.value = false;
      toast.success('Produto atualizado.');
      await loadInventory();
    } catch (e) {
      toast.error('Não foi possível salvar.', { detail: e && e.message });
    }
  });
}

// ---- reposição de estoque (mesmo contrato useForm do modal de edição) ------
const reorderOpen = ref(false);
const reorderForm = useForm({
  initial: { qty: '' },
  rules: {
    qty: [
      validators.required('Informe a quantidade.'),
      validators.numeric('Quantidade inválida.'),
      validators.min(1, 'Quantidade deve ser maior que zero.'),
    ],
  },
});
const reorderQtyNum = computed(() => {
  const n = Number(reorderForm.values.qty);
  return isFinite(n) && n > 0 ? Math.floor(n) : 0;
});
const projectedQty = computed(() => {
  const base = inventoryRow.value && isFinite(Number(inventoryRow.value.quantity)) ? Number(inventoryRow.value.quantity) : 0;
  return base + reorderQtyNum.value;
});

function openReorder() {
  if (!inventoryRow.value) return;
  reorderForm.reset();
  const rp = reorderPoint.value;
  const cur = Number(inventoryRow.value.quantity) || 0;
  reorderForm.setField('qty', rp && rp > cur ? String((rp - cur) + rp) : '10');
  reorderOpen.value = true;
}

async function submitReorder() {
  await reorderForm.handleSubmit(async (vals) => {
    if (!inventoryRow.value || inventoryRow.value.id == null) {
      toast.error('Registro de estoque indisponível.');
      return;
    }
    const addQty = Math.floor(Number(vals.qty));
    const next = (Number(inventoryRow.value.quantity) || 0) + addQty;
    try {
      const updated = await inventory.update(inventoryRow.value.id, { quantity: next, status: 'ok' });
      inventoryRow.value = updated && updated.id != null ? updated : { ...inventoryRow.value, quantity: next, status: 'ok' };
      reorderOpen.value = false;
      toast.success('Estoque reposto: +' + addQty + ' un.');
    } catch (e) {
      toast.error('Falha ao repor estoque.', { detail: e && e.message });
    }
  });
}

// ---- ancoragem (KPI clicável → painel de estoque) --------------------------
// Move o foco para o painel após rolar, para usuários de teclado/leitor de tela;
// respeita prefers-reduced-motion no comportamento da rolagem.
const stockPanel = ref(null);
function scrollToStock() {
  const el = stockPanel.value;
  if (!el) return;
  const reduce = typeof window !== 'undefined'
    && window.matchMedia
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (el.scrollIntoView) {
    el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
  }
  if (el.focus) el.focus({ preventScroll: true });
}

onMounted(reload);
</script>

<style scoped>
/* ===== KPIs ===== */
.pd-kpis {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: var(--ui-space-4);
}

/* ===== layout principal de 2 colunas ===== */
.pd-grid {
  display: grid;
  grid-template-columns: minmax(0, 2fr) minmax(0, 1fr);
  gap: var(--ui-space-4);
  align-items: start;
}
.pd-col-main,
.pd-col-side {
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-4);
  min-width: 0;
}
/* alvo de foco programático (KPI clicável → painel de estoque): foco visível, sem outline padrão feio */
.pd-col-side:focus { outline: none; }
.pd-col-side:focus-visible {
  outline: 2px solid rgb(var(--ui-accent));
  outline-offset: 4px;
  border-radius: var(--ui-radius-md);
}

/* ===== banner ===== */
.pd-banner {
  display: flex;
  align-items: center;
  gap: var(--ui-space-3);
  padding: var(--ui-space-3) var(--ui-space-4);
  border-radius: var(--ui-radius-md);
  border: 1px solid rgb(var(--ui-border));
  font-size: var(--ui-text-sm);
  font-weight: 500;
}
.pd-banner[data-tone="warning"] { background: rgb(var(--ui-warn) / 0.12); color: rgb(var(--ui-warn)); border-color: rgb(var(--ui-warn) / 0.4); }
.pd-banner[data-tone="error"] { background: rgb(var(--ui-danger) / 0.12); color: rgb(var(--ui-danger)); border-color: rgb(var(--ui-danger) / 0.4); }
.pd-banner-dot { width: 8px; height: 8px; border-radius: 50%; background: currentColor; flex-shrink: 0; }

/* ===== FieldGrid (dt/dd) ===== */
.pd-fields {
  margin: 0;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--ui-space-4) var(--ui-space-5);
}
.pd-field { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
.pd-field-wide { grid-column: 1 / -1; }
.pd-field dt {
  font-size: var(--ui-text-xs);
  text-transform: uppercase;
  letter-spacing: .04em;
  color: rgb(var(--ui-muted));
  font-weight: 600;
}
.pd-field dd { margin: 0; color: rgb(var(--ui-fg)); font-size: var(--ui-text-md); word-break: break-word; }
.pd-strong { font-weight: 700; font-family: var(--ui-font-display); }
/* SKU em destaque tipográfico via token de exibição da marca (o kit não define token de monoespaçada). */
.pd-mono { font-family: var(--ui-font-display); letter-spacing: .02em; }
.pd-muted { color: rgb(var(--ui-muted)); }
.pd-desc { margin: 0; white-space: pre-wrap; line-height: 1.55; }

.pd-chip {
  display: inline-block;
  padding: 2px 10px;
  border-radius: var(--ui-radius-pill);
  background: rgb(var(--ui-accent) / 0.12);
  color: rgb(var(--ui-accent-strong));
  font-size: var(--ui-text-xs);
  font-weight: 600;
}

.pd-bool { display: inline-flex; align-items: center; gap: 6px; font-weight: 600; font-size: var(--ui-text-sm); }
.pd-bool-dot { width: 8px; height: 8px; border-radius: 50%; background: rgb(var(--ui-faint)); }
.pd-bool[data-on="true"] { color: rgb(var(--ui-ok)); }
.pd-bool[data-on="true"] .pd-bool-dot { background: rgb(var(--ui-ok)); }
.pd-bool[data-on="false"] { color: rgb(var(--ui-muted)); }

/* ===== estoque (StockBadge) ===== */
.pd-stock { display: flex; flex-direction: column; gap: var(--ui-space-4); }
.pd-stock-head { display: flex; align-items: baseline; gap: var(--ui-space-2); flex-wrap: wrap; }
.pd-stock-qty { font-family: var(--ui-font-display); font-size: var(--ui-text-xl); font-weight: 700; line-height: 1; }
.pd-stock-unit { color: rgb(var(--ui-muted)); font-size: var(--ui-text-sm); }
.pd-stock-badge { margin-left: auto; }

.pd-meter { height: 8px; border-radius: var(--ui-radius-pill); background: rgb(var(--ui-surface-2)); overflow: hidden; }
.pd-meter-fill { display: block; height: 100%; border-radius: var(--ui-radius-pill); background: rgb(var(--ui-faint)); transition: width .25s ease; }
.pd-meter-fill[data-pct="0"] { width: 4px; }
.pd-meter-fill[data-pct="25"] { width: 25%; }
.pd-meter-fill[data-pct="50"] { width: 50%; }
.pd-meter-fill[data-pct="75"] { width: 75%; }
.pd-meter-fill[data-pct="100"] { width: 100%; }
.pd-meter[data-tone="success"] .pd-meter-fill { background: rgb(var(--ui-ok)); }
.pd-meter[data-tone="warning"] .pd-meter-fill { background: rgb(var(--ui-warn)); }
.pd-meter[data-tone="error"] .pd-meter-fill { background: rgb(var(--ui-danger)); }

.pd-stock-meta { margin: 0; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--ui-space-3) var(--ui-space-4); }
.pd-stock-alert {
  margin: 0;
  padding: var(--ui-space-2) var(--ui-space-3);
  border-radius: var(--ui-radius-sm);
  background: rgb(var(--ui-warn) / 0.12);
  color: rgb(var(--ui-warn));
  font-size: var(--ui-text-xs);
  font-weight: 600;
}

/* ===== histórico (SalesHistoryMini) ===== */
.pd-history { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; }
.pd-history-row {
  display: flex;
  align-items: center;
  gap: var(--ui-space-3);
  padding: var(--ui-space-3) 0;
  border-bottom: 1px solid rgb(var(--ui-border));
}
.pd-history-row:last-child { border-bottom: none; }
.pd-history-mark { width: 9px; height: 9px; border-radius: 50%; background: rgb(var(--ui-faint)); flex-shrink: 0; }
.pd-history-row[data-tone="success"] .pd-history-mark { background: rgb(var(--ui-ok)); }
.pd-history-row[data-tone="warning"] .pd-history-mark { background: rgb(var(--ui-warn)); }
.pd-history-row[data-tone="error"] .pd-history-mark { background: rgb(var(--ui-danger)); }
.pd-history-body { display: flex; flex-direction: column; gap: 1px; min-width: 0; flex: 1; }
.pd-history-title { font-weight: 600; font-size: var(--ui-text-sm); }
.pd-history-meta { color: rgb(var(--ui-muted)); font-size: var(--ui-text-xs); }
.pd-history-value { font-family: var(--ui-font-display); font-weight: 700; font-size: var(--ui-text-sm); white-space: nowrap; }

/* ===== formulários (modais) ===== */
.pd-form { margin: 0; }
.pd-form-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--ui-space-4); }
.pd-check { display: flex; align-items: center; gap: var(--ui-space-2); font-size: var(--ui-text-sm); }
.pd-check input { width: auto; }

.pd-reorder { display: flex; flex-direction: column; gap: var(--ui-space-3); }
.pd-reorder-preview { margin: 0; font-size: var(--ui-text-sm); color: rgb(var(--ui-muted)); }

.pd-ico { font-size: 1em; line-height: 1; }

/* ===== responsivo ===== */
@media (max-width: 980px) {
  .pd-kpis { grid-template-columns: repeat(2, 1fr); }
  .pd-grid { grid-template-columns: 1fr; }
}
@media (max-width: 560px) {
  .pd-kpis { grid-template-columns: 1fr; }
  .pd-fields { grid-template-columns: 1fr; }
  .pd-form-grid { grid-template-columns: 1fr; }
  .pd-stock-meta { grid-template-columns: 1fr; }
}
</style>
