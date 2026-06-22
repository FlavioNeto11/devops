<!--
  ProductDetailView — Visão completa de um produto (REQ-SHOPDESK-0005).
  DetailHeader (voltar/editar/arquivar) + KPIs + FieldGrid (dados cadastrais/comerciais) +
  StockBadge (posição de estoque com medidor) + SalesHistoryMini (atividade REAL do SKU:
  reposições + marcos de cadastro) + atalho para REPOR (cria uma reposição de verdade).

  100% sobre o kit ui-vue (tokens --ui-*), CSP-safe (sem style inline / :style / v-html),
  com TODOS os estados (loading/empty/error/normal), ações destrutivas via useConfirm,
  toasts em sucesso/erro, responsivo e acessível.

  Endpoints REAIS (api.js):
    - api.products  (/v1/products)  → dados do produto, update (editar/arquivar/reativar)
    - api.inventory (/v1/inventory) → posição de estoque por SKU
    - api.reorders  (/v1/reorders)  → atalho de reposição + histórico de movimentação do SKU
  HONESTIDADE DE DADOS: a tabela `orders` do backend NÃO referencia produtos (sem SKU/itens
  por produto), então NÃO inventamos "vendas por produto". O histórico é montado das fontes
  que de fato se ligam ao produto (reposições do SKU + marcos), sem rota fabricada. Recursos
  ausentes degradam graciosamente (estado de erro/empty claro), nunca tela em branco.
-->
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
    <!-- ===== AÇÕES (DetailHeader) ===== -->
    <template #actions>
      <UiButton variant="ghost" to="/products">
        <template #icon-left><span class="pd-ico" aria-hidden="true">←</span></template>
        Voltar
      </UiButton>
      <UiButton variant="ghost" :disabled="!hasProduct" :loading="refreshing" @click="refresh">Atualizar</UiButton>
      <UiButton variant="subtle" :disabled="!hasProduct" @click="openEdit">Editar</UiButton>
      <UiButton
        v-if="!isArchived"
        variant="danger"
        :disabled="!hasProduct"
        :loading="archiving"
        @click="archive"
      >Arquivar</UiButton>
      <UiButton
        v-else
        variant="primary"
        :loading="archiving"
        @click="restore"
      >Reativar</UiButton>
    </template>

    <!-- ===== BANNER contextual (situação do produto) ===== -->
    <template v-if="hasProduct" #banner>
      <div class="pd-banner" :data-tone="bannerTone" role="status">
        <div class="pd-banner-main">
          <UiStatusBadge :status="statusForBadge" :label="statusText" size="lg" />
          <span class="pd-banner-text">{{ bannerMessage }}</span>
        </div>
        <span class="pd-banner-meta">Atualizado {{ fmtDateTime(product.updated_at || product.created_at) }}</span>
      </div>
    </template>

    <!-- ===== CONTEÚDO (estado normal — PageLayout cobre loading/error) ===== -->
    <template v-if="hasProduct">
      <!-- Faixa de KPIs -->
      <section class="pd-kpis" aria-label="Indicadores do produto">
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
      </section>

      <div class="pd-grid">
        <!-- ===== Coluna principal ===== -->
        <div class="pd-col pd-col-main">
          <!-- FieldGrid — dados do produto -->
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

          <!-- SalesHistoryMini — atividade recente do SKU (reposições + marcos REAIS) -->
          <UiCard title="Histórico e atividade" :subtitle="historySubtitle">
            <template #actions>
              <UiButton
                variant="subtle"
                size="sm"
                :loading="invLoading"
                :disabled="invLoading"
                @click="loadInventory"
              >Recarregar</UiButton>
            </template>

            <UiLoadingState v-if="invLoading" variant="skeleton" :skeleton-lines="4" />
            <UiErrorState
              v-else-if="invError"
              :message="invError"
              :retryable="true"
              @retry="loadInventory"
            />
            <ol v-else-if="historyItems.length" class="pd-timeline">
              <li
                v-for="h in historyItems"
                :key="h.key"
                class="pd-tl-item"
                :data-tone="h.tone"
              >
                <span class="pd-tl-dot" aria-hidden="true" />
                <div class="pd-tl-body">
                  <div class="pd-tl-head">
                    <span class="pd-tl-title">{{ h.title }}</span>
                    <UiStatusBadge v-if="h.status" :status="h.status" size="sm" />
                  </div>
                  <p v-if="h.detail" class="pd-tl-detail">{{ h.detail }}</p>
                  <time v-if="h.at" class="pd-tl-time">{{ fmtDateTime(h.at) }}</time>
                </div>
                <span v-if="h.value" class="pd-tl-value">{{ h.value }}</span>
              </li>
            </ol>
            <UiEmptyState
              v-else
              icon="🧾"
              title="Sem atividade registrada"
              description="Quando houver reposições deste SKU, elas aparecem aqui como linha do tempo."
            >
              <template #action>
                <UiButton variant="subtle" :disabled="!inventoryRow" @click="openReorder">Repor estoque</UiButton>
              </template>
            </UiEmptyState>
          </UiCard>
        </div>

        <!-- ===== Coluna lateral: estoque (StockBadge) + atalho repor + financeiro ===== -->
        <aside ref="stockPanel" class="pd-col pd-col-side" tabindex="-1" aria-label="Estoque do produto">
          <UiCard title="Estoque" subtitle="Posição no centro de distribuição.">
            <template #actions>
              <UiButton
                size="sm"
                variant="primary"
                :disabled="invLoading || !!invError"
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
                <span v-if="reorderPoint !== null" class="pd-meter-mark" data-pos="50" aria-hidden="true" />
              </div>
              <dl class="pd-stock-meta">
                <div class="pd-field">
                  <dt>Ponto de reposição</dt>
                  <dd>{{ valueOrNum(inventoryRow.reorder_point) }}</dd>
                </div>
                <div class="pd-field">
                  <dt>Localização</dt>
                  <dd>
                    <span v-if="inventoryRow.location" class="pd-mono">{{ inventoryRow.location }}</span>
                    <span v-else class="pd-muted">—</span>
                  </dd>
                </div>
              </dl>
              <p v-if="needsReorder" class="pd-stock-alert" role="status">
                Estoque no/abaixo do ponto de reposição — recomenda-se repor
                {{ suggestedQty > 0 ? fmtNumber(suggestedQty) + ' un.' : 'agora.' }}
              </p>
            </div>
            <UiEmptyState
              v-else
              icon="📦"
              title="Sem registro de estoque"
              description="Este SKU ainda não tem posição de estoque cadastrada."
            >
              <template #action>
                <UiButton variant="subtle" to="/inventory">Ver estoque</UiButton>
              </template>
            </UiEmptyState>
          </UiCard>

          <UiCard title="Resumo financeiro" subtitle="Preço, custo e valor parado em estoque.">
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
            <template #footer>
              <UiButton variant="ghost" block to="/inventory">Abrir gestão de estoque</UiButton>
            </template>
          </UiCard>
        </aside>
      </div>
    </template>

    <!-- ===== EMPTY — produto não encontrado (não é erro de rede) ===== -->
    <template v-else-if="!loading && !error">
      <UiEmptyState
        icon="🔍"
        title="Produto não encontrado"
        description="Não localizamos este produto. Ele pode ter sido removido ou o endereço está incorreto."
      >
        <template #action>
          <UiButton to="/products">Ver todos os produtos</UiButton>
        </template>
      </UiEmptyState>
    </template>

    <!-- ===== Modal: editar produto ===== -->
    <UiModal v-model:open="editOpen" title="Editar produto" width="lg" :persistent="form.submitting.value">
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
              <input :id="id" :aria-describedby="describedBy" type="number" step="0.01" min="0" inputmode="decimal"
                     :value="form.values.price" @input="form.setField('price', $event.target.value)" />
            </template>
          </UiFormField>
          <UiFormField label="Custo (R$)" :error="form.errors.cost">
            <template #default="{ id, describedBy }">
              <input :id="id" :aria-describedby="describedBy" type="number" step="0.01" min="0" inputmode="decimal"
                     :value="form.values.cost" @input="form.setField('cost', $event.target.value)" />
            </template>
          </UiFormField>
          <UiFormField label="Estoque" required :error="form.errors.stockQty" hint="Quantidade cadastral do produto.">
            <template #default="{ id, describedBy }">
              <input :id="id" :aria-describedby="describedBy" type="number" step="1" min="0" inputmode="numeric"
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
        <UiButton variant="ghost" :disabled="form.submitting.value" @click="editOpen = false">Cancelar</UiButton>
        <UiButton variant="primary" :loading="form.submitting.value" @click="submitEdit">Salvar alterações</UiButton>
      </template>
    </UiModal>

    <!-- ===== Modal: repor estoque (cria reposição REAL via /v1/reorders) ===== -->
    <UiModal v-model:open="reorderOpen" title="Repor estoque" width="sm" :persistent="reorderForm.submitting.value">
      <form class="pd-reorder" @submit.prevent="submitReorder">
        <p class="pd-muted pd-reorder-intro">
          SKU <span class="pd-mono">{{ valueOr(product.sku) }}</span> · estoque atual
          <strong>{{ fmtNumber(stockQty) }}</strong> un.
        </p>
        <UiFormField
          label="Quantidade a repor"
          required
          :error="reorderForm.errors.qty"
          hint="Número de unidades a solicitar ao fornecedor."
        >
          <template #default="{ id, describedBy }">
            <input :id="id" :aria-describedby="describedBy" type="number" min="1" step="1" inputmode="numeric"
                   :value="reorderForm.values.qty" @input="reorderForm.setField('qty', $event.target.value)" />
          </template>
        </UiFormField>
        <UiFormField label="Fornecedor" :error="reorderForm.errors.supplier" hint="Opcional — quem atenderá a reposição.">
          <template #default="{ id, describedBy }">
            <input :id="id" :aria-describedby="describedBy" type="text" placeholder="Ex.: Fornecedor Vale"
                   :value="reorderForm.values.supplier" @input="reorderForm.setField('supplier', $event.target.value)" />
          </template>
        </UiFormField>
        <p v-if="reorderQtyNum > 0" class="pd-reorder-preview" role="status">
          Solicitação: <strong>+{{ fmtNumber(reorderQtyNum) }}</strong> un. para reposição.
        </p>
      </form>
      <template #footer>
        <UiButton variant="ghost" :disabled="reorderForm.submitting.value" @click="reorderOpen = false">Cancelar</UiButton>
        <UiButton variant="primary" :loading="reorderForm.submitting.value" @click="submitReorder">Solicitar reposição</UiButton>
      </template>
    </UiModal>
  </UiPageLayout>
</template>

<script setup>
import { ref, reactive, computed, watch, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import {
  UiPageLayout, UiCard, UiMetricCard, UiStatusBadge, UiButton, UiModal,
  UiFormField, UiEmptyState, UiLoadingState, UiErrorState,
  useToast, useConfirm, useForm, validators, format, resolveTone,
} from '../ui/index.js';
import { products, inventory, reorders } from '../api.js';

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
const productLoaded = ref(false); // distingue "ainda não carregou" de "não encontrado"
const loading = ref(true);
const error = ref('');
const refreshing = ref(false);
const archiving = ref(false);

const hasProduct = computed(() => productLoaded.value && product.id != null);

function setProduct(row) {
  for (const k of Object.keys(product)) delete product[k];
  Object.assign(product, row || {});
}
function unwrap(r) {
  return r && typeof r === 'object' && 'data' in r && !Array.isArray(r) ? r.data : r;
}
function unwrapList(r) {
  if (Array.isArray(r)) return r;
  if (r && Array.isArray(r.data)) return r.data;
  return [];
}

async function loadProduct() {
  loading.value = true;
  error.value = '';
  try {
    const row = unwrap(await products.get(productId.value));
    setProduct(row);
    productLoaded.value = true;
  } catch (e) {
    if (e && e.status === 404) {
      setProduct({});
      productLoaded.value = true; // "não encontrado" (empty), não erro fatal
    } else {
      error.value = e && e.message ? e.message : 'Falha ao carregar o produto.';
    }
  } finally {
    loading.value = false;
  }
}

// ---- estado: estoque (inventory por SKU) + reposições (histórico) -----------
const inventoryRow = ref(null);
const reorderRows = ref([]);
const invLoading = ref(true);
const invError = ref('');

async function loadInventory() {
  invLoading.value = true;
  invError.value = '';
  const sku = product.sku;
  if (!sku) {
    inventoryRow.value = null;
    reorderRows.value = [];
    invLoading.value = false;
    return;
  }
  try {
    const [invRes, reordRes] = await Promise.all([
      inventory.list(),
      reorders && typeof reorders.list === 'function' ? reorders.list() : Promise.resolve([]),
    ]);
    const invRows = unwrapList(invRes);
    inventoryRow.value = invRows.find((r) => String(r.sku) === String(sku)) || null;
    reorderRows.value = unwrapList(reordRes)
      .filter((r) => String(r.sku) === String(sku))
      .sort((a, b) => tsOf(b) - tsOf(a));
  } catch (e) {
    invError.value = e && e.message ? e.message : 'Falha ao carregar o estoque do produto.';
    inventoryRow.value = null;
    reorderRows.value = [];
  } finally {
    invLoading.value = false;
  }
}

function tsOf(r) {
  const v = r && (r.created_at || r.updated_at);
  return v ? new Date(v).getTime() || 0 : 0;
}

async function reload() {
  await loadProduct();
  if (!error.value && hasProduct.value) await loadInventory();
}

async function refresh() {
  if (!hasProduct.value) return;
  refreshing.value = true;
  try {
    const row = unwrap(await products.get(productId.value));
    setProduct(row);
    await loadInventory();
    toast.success('Produto atualizado.');
  } catch (e) {
    toast.error('Não foi possível atualizar.', { detail: (e && e.message) || '' });
  } finally {
    refreshing.value = false;
  }
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
  if (loading.value || error.value || !hasProduct.value) return 'Visão completa do produto.';
  const parts = [];
  if (product.category) parts.push(product.category);
  parts.push(statusText.value);
  return parts.join(' · ');
});

const bannerTone = computed(() => {
  if (isArchived.value) return 'error';
  if (!isActive.value) return 'warning';
  if (needsReorder.value) return 'warning';
  return 'success';
});
const bannerMessage = computed(() => {
  if (isArchived.value) return 'Este produto está arquivado e não aparece na loja.';
  if (!isActive.value) return 'Este produto está inativo e não está disponível para venda.';
  if (stockQty.value <= 0) return 'Produto ativo, porém sem estoque disponível.';
  if (needsReorder.value) return 'Produto ativo — estoque abaixo do ponto de reposição.';
  return 'Produto ativo e com estoque saudável.';
});

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
  const own = product.stock_qty != null ? product.stock_qty : product.stockQty;
  return Number(own);
});
const reorderPoint = computed(() => {
  const rp = inventoryRow.value && inventoryRow.value.reorder_point;
  return rp != null && rp !== '' ? Number(rp) : null;
});
const needsReorder = computed(() => {
  if (!isFinite(stockQty.value)) return false;
  if (reorderPoint.value === null) return stockQty.value <= 0;
  return stockQty.value <= reorderPoint.value;
});
const suggestedQty = computed(() => {
  if (reorderPoint.value !== null && reorderPoint.value > 0) {
    const target = reorderPoint.value * 2;
    const need = target - (isFinite(stockQty.value) ? stockQty.value : 0);
    return need > 0 ? need : 0;
  }
  return stockQty.value <= 0 ? 10 : 0;
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

// medidor de estoque (bucket discreto via data-attr — CSP-safe, sem :style).
const meterBucket = computed(() => {
  const q = stockQty.value;
  const rp = reorderPoint.value;
  if (!isFinite(q) || q <= 0) return '0';
  if (rp && rp > 0) {
    const ratio = q / (rp * 2); // 2× o ponto = cheio (o marcador do ponto fica em 50%)
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

// SalesHistoryMini — linha do tempo a partir de dados REAIS (reposições do SKU + marcos).
const historySubtitle = computed(() =>
  reorderRows.value.length
    ? reorderRows.value.length + ' reposiç' + (reorderRows.value.length === 1 ? 'ão' : 'ões') + ' deste SKU'
    : 'Movimentos e marcos do produto',
);
const historyItems = computed(() => {
  const items = [];
  // reposições reais do SKU (fonte que de fato se liga ao produto)
  for (const r of reorderRows.value) {
    const qty = r.quantity != null ? Number(r.quantity) : 0;
    items.push({
      key: 'reorder-' + (r.id != null ? r.id : Math.random().toString(36).slice(2)),
      tone: resolveTone(r.status),
      status: r.status || 'rascunho',
      title: 'Reposição +' + fmtNumber(qty) + ' un.',
      detail: r.supplier ? 'Fornecedor: ' + r.supplier : 'Sem fornecedor definido',
      at: r.created_at || r.updated_at || null,
      value: fmtNumber(qty) + ' un.',
    });
  }
  // marco: posição de estoque atual (snapshot honesto, sem inventar evento)
  if (inventoryRow.value && isFinite(stockQty.value)) {
    items.push({
      key: 'stock-position',
      tone: stockTone.value,
      status: inventoryStatusForBadge.value,
      title: 'Posição de estoque atual',
      detail: (inventoryRow.value.location ? inventoryRow.value.location + ' · ' : '') + inventoryStatusText.value,
      at: inventoryRow.value.updated_at || null,
      value: fmtNumber(stockQty.value) + ' un.',
    });
  }
  // marco: cadastro do produto
  if (product.created_at) {
    items.push({
      key: 'product-created',
      tone: 'neutral',
      status: '',
      title: 'Produto cadastrado',
      detail: 'Entrada na base de produtos',
      at: product.created_at,
      value: '',
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
    const updated = unwrap(await products.update(productId.value, { status: 'arquivado', active: false }));
    setProduct(updated);
    toast.success('Produto arquivado.');
  } catch (e) {
    toast.error('Não foi possível arquivar.', { detail: (e && e.message) || '' });
  } finally {
    archiving.value = false;
  }
}

async function restore() {
  archiving.value = true;
  try {
    const updated = unwrap(await products.update(productId.value, { status: 'publicado', active: true }));
    setProduct(updated);
    toast.success('Produto reativado.');
  } catch (e) {
    toast.error('Não foi possível reativar.', { detail: (e && e.message) || '' });
  } finally {
    archiving.value = false;
  }
}

// ---- edição (modal) --------------------------------------------------------
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
  if (!hasProduct.value) return;
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
      const updated = unwrap(await products.update(productId.value, payload));
      setProduct(updated);
      editOpen.value = false;
      toast.success('Produto atualizado.');
      await loadInventory();
    } catch (e) {
      toast.error('Não foi possível salvar.', { detail: (e && e.message) || '' });
    }
  });
}

// ---- reposição de estoque (cria reposição REAL via /v1/reorders) -----------
const reorderOpen = ref(false);
const reorderForm = useForm({
  initial: { qty: '', supplier: '' },
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

function openReorder() {
  reorderForm.reset();
  reorderForm.setField('qty', String(suggestedQty.value > 0 ? Math.ceil(suggestedQty.value) : 10));
  reorderOpen.value = true;
}

async function submitReorder() {
  if (!reorders || typeof reorders.create !== 'function') {
    toast.error('Recurso de reposições indisponível.', { detail: 'O endpoint /v1/reorders não está exposto no cliente.' });
    return;
  }
  await reorderForm.handleSubmit(async (vals) => {
    const qty = Math.floor(Number(vals.qty));
    if (!Number.isInteger(qty) || qty < 1) {
      reorderForm.errors.qty = 'Use um número inteiro de unidades.';
      return;
    }
    const ok = await confirm({
      title: 'Confirmar reposição',
      message: 'Solicitar reposição de ' + fmtNumber(qty) + ' un. de ' + (product.name || product.sku) + '?',
      confirmLabel: 'Solicitar',
    });
    if (!ok) return;
    try {
      await reorders.create({
        sku: product.sku,
        productName: product.name,
        quantity: qty,
        supplier: (vals.supplier || '').trim() || undefined,
        status: 'solicitada',
      });
      reorderOpen.value = false;
      toast.success('Reposição solicitada.', { detail: '+' + fmtNumber(qty) + ' un. de ' + product.sku });
      await loadInventory();
    } catch (e) {
      toast.error('Falha ao solicitar a reposição.', { detail: (e && e.message) || '' });
    }
  });
}

// ---- ancoragem (KPI clicável → painel de estoque) --------------------------
// Move o foco para o painel após rolar, p/ usuários de teclado/leitor de tela;
// respeita prefers-reduced-motion no comportamento da rolagem.
const stockPanel = ref(null);
function scrollToStock() {
  const el = stockPanel.value;
  if (!el) return;
  const reduce = typeof window !== 'undefined'
    && window.matchMedia
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (el.scrollIntoView) el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
  if (el.focus) el.focus({ preventScroll: true });
}

// ---- ciclo de vida ---------------------------------------------------------
watch(productId, () => {
  setProduct({});
  productLoaded.value = false;
  inventoryRow.value = null;
  reorderRows.value = [];
  invError.value = '';
  editOpen.value = false;
  reorderOpen.value = false;
  reload();
});

onMounted(reload);
</script>

<style scoped>
/* ===== KPIs ===== */
.pd-kpis {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: var(--ui-space-4);
}

/* ===== banner ===== */
.pd-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ui-space-4);
  flex-wrap: wrap;
  padding: var(--ui-space-3) var(--ui-space-4);
  border: 1px solid rgb(var(--ui-border));
  border-left: 4px solid rgb(var(--ui-faint));
  border-radius: var(--ui-radius-lg);
  background: rgb(var(--ui-surface));
}
.pd-banner[data-tone="success"] { border-left-color: rgb(var(--ui-ok)); }
.pd-banner[data-tone="warning"] { border-left-color: rgb(var(--ui-warn)); }
.pd-banner[data-tone="error"] { border-left-color: rgb(var(--ui-danger)); }
.pd-banner-main { display: flex; align-items: center; gap: var(--ui-space-3); flex-wrap: wrap; }
.pd-banner-text { font-weight: 600; }
.pd-banner-meta { color: rgb(var(--ui-muted)); font-size: var(--ui-text-sm); }

/* ===== layout de 2 colunas ===== */
.pd-grid {
  display: grid;
  grid-template-columns: minmax(0, 2fr) minmax(0, 1fr);
  gap: var(--ui-space-4);
  align-items: start;
}
.pd-col { display: flex; flex-direction: column; gap: var(--ui-space-4); min-width: 0; }
/* alvo de foco programático (KPI clicável → painel de estoque) */
.pd-col-side:focus { outline: none; }
.pd-col-side:focus-visible {
  outline: 2px solid rgb(var(--ui-accent));
  outline-offset: 4px;
  border-radius: var(--ui-radius-md);
}

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
/* SKU/local em destaque tipográfico via token de exibição da marca (o kit não tem token monoespaçado). */
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

/* ===== estoque (StockBadge + medidor) ===== */
.pd-stock { display: flex; flex-direction: column; gap: var(--ui-space-4); }
.pd-stock-head { display: flex; align-items: baseline; gap: var(--ui-space-2); flex-wrap: wrap; }
.pd-stock-qty { font-family: var(--ui-font-display); font-size: var(--ui-text-xl); font-weight: 700; line-height: 1; }
.pd-stock-unit { color: rgb(var(--ui-muted)); font-size: var(--ui-text-sm); }
.pd-stock-badge { margin-left: auto; }

.pd-meter {
  position: relative;
  height: 9px;
  border-radius: var(--ui-radius-pill);
  background: rgb(var(--ui-surface-2));
  border: 1px solid rgb(var(--ui-border));
  overflow: hidden;
}
.pd-meter-fill { display: block; height: 100%; border-radius: var(--ui-radius-pill); background: rgb(var(--ui-faint)); transition: width .25s ease; }
.pd-meter-fill[data-pct="0"] { width: 4px; }
.pd-meter-fill[data-pct="25"] { width: 25%; }
.pd-meter-fill[data-pct="50"] { width: 50%; }
.pd-meter-fill[data-pct="75"] { width: 75%; }
.pd-meter-fill[data-pct="100"] { width: 100%; }
.pd-meter[data-tone="success"] .pd-meter-fill { background: rgb(var(--ui-ok)); }
.pd-meter[data-tone="warning"] .pd-meter-fill { background: rgb(var(--ui-warn)); }
.pd-meter[data-tone="error"] .pd-meter-fill { background: rgb(var(--ui-danger)); }
.pd-meter-mark { position: absolute; top: -2px; bottom: -2px; width: 2px; background: rgb(var(--ui-fg) / 0.5); }
.pd-meter-mark[data-pos="50"] { left: 50%; }

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

/* ===== histórico / atividade (SalesHistoryMini — timeline) ===== */
.pd-timeline { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; }
.pd-tl-item { position: relative; display: flex; align-items: flex-start; gap: var(--ui-space-3); padding: 0 0 var(--ui-space-4) var(--ui-space-1); }
.pd-tl-item::before {
  content: "";
  position: absolute;
  left: 4px;
  top: 14px;
  bottom: 0;
  width: 2px;
  background: rgb(var(--ui-border));
}
.pd-tl-item:last-child { padding-bottom: 0; }
.pd-tl-item:last-child::before { display: none; }
.pd-tl-dot {
  position: relative;
  z-index: 1;
  flex-shrink: 0;
  width: 10px;
  height: 10px;
  margin-top: 5px;
  border-radius: 50%;
  background: rgb(var(--ui-faint));
  box-shadow: 0 0 0 3px rgb(var(--ui-surface));
}
.pd-tl-item[data-tone="success"] .pd-tl-dot { background: rgb(var(--ui-ok)); }
.pd-tl-item[data-tone="warning"] .pd-tl-dot { background: rgb(var(--ui-warn)); }
.pd-tl-item[data-tone="error"] .pd-tl-dot { background: rgb(var(--ui-danger)); }
.pd-tl-item[data-tone="running"] .pd-tl-dot { background: rgb(var(--ui-accent)); }
.pd-tl-body { display: flex; flex-direction: column; gap: 2px; min-width: 0; flex: 1; }
.pd-tl-head { display: flex; align-items: center; gap: var(--ui-space-2); flex-wrap: wrap; }
.pd-tl-title { font-weight: 600; font-size: var(--ui-text-sm); }
.pd-tl-detail { margin: 0; color: rgb(var(--ui-muted)); font-size: var(--ui-text-sm); }
.pd-tl-time { color: rgb(var(--ui-muted)); font-size: var(--ui-text-xs); }
.pd-tl-value { font-family: var(--ui-font-display); font-weight: 700; font-size: var(--ui-text-sm); white-space: nowrap; }

/* ===== formulários (modais) ===== */
.pd-form { margin: 0; }
.pd-form-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--ui-space-4); }
.pd-check { display: flex; align-items: center; gap: var(--ui-space-2); font-size: var(--ui-text-sm); }
.pd-check input { width: auto; }

.pd-reorder { display: flex; flex-direction: column; gap: var(--ui-space-4); }
.pd-reorder-intro { margin: 0; font-size: var(--ui-text-sm); }
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
  .pd-banner { flex-direction: column; align-items: flex-start; }
}
</style>
