<!--
  CartDetailView — Detalhe do carrinho (REF/REQ-SHOPDESK-0003)
  Mostra itens do carrinho, dados do cliente (CustomerInfo) e o subtotal; permite editar itens
  (CartEditor: ajustar quantidade / remover, recalcula o subtotal) e avançar para o checkout
  (CheckoutButton). Edições via api.carts.update; remoção de item é destrutiva → useConfirm.
  100% sobre o kit ui-vue · só tokens --ui-* · CSP-safe (sem style inline / :style / v-html) ·
  todos os estados (loading/empty/error/normal) · a11y · responsivo. Só endpoints reais via ../api.js.
-->
<template>
  <UiPageLayout
    eyebrow="Carrinhos"
    :title="pageTitle"
    subtitle="Revise os itens e os dados do cliente, ajuste o carrinho e avance para o checkout."
    width="wide"
    :loading="loading"
    loading-message="Carregando carrinho…"
    :error="loadError"
    :retryable="true"
    @retry="reload"
  >
    <!-- ações de topo -->
    <template #actions>
      <UiButton variant="ghost" to="/loja">Voltar à loja</UiButton>
      <UiButton
        variant="subtle"
        :disabled="loading || !cart"
        :loading="refreshing"
        @click="reload"
      >
        Atualizar
      </UiButton>
      <!-- CheckoutButton (topo) -->
      <UiButton
        v-if="cart && !isConverted"
        variant="primary"
        :disabled="!canCheckout"
        @click="goToCheckout"
      >
        Avançar para o checkout
      </UiButton>
    </template>

    <!-- banner contextual: estados especiais do carrinho -->
    <template #banner>
      <p v-if="cart && isConverted" class="cd-note" data-tone="success" role="status">
        <span class="cd-note-icon" aria-hidden="true">{{ glyphs.converted }}</span>
        Este carrinho já foi convertido em pedido. Ele está disponível apenas para consulta.
      </p>
      <p v-else-if="cart && isAbandoned" class="cd-note" data-tone="warning" role="status">
        <span class="cd-note-icon" aria-hidden="true">{{ glyphs.abandoned }}</span>
        Carrinho marcado como abandonado. Você ainda pode editá-lo e retomar o checkout.
      </p>
      <p v-else-if="cart && isEmpty" class="cd-note" data-tone="neutral" role="status">
        <span class="cd-note-icon" aria-hidden="true">{{ glyphs.cart }}</span>
        Carrinho sem itens — adicione produtos na loja para poder finalizar a compra.
      </p>
    </template>

    <!-- ESTADO: carrinho inexistente (id válido, sem dados) -->
    <UiEmptyState
      v-if="!loading && !loadError && !cart"
      :icon="glyphs.search"
      title="Carrinho não encontrado"
      :description="'Não localizamos o carrinho ' + cartLabel + '. Ele pode ter expirado ou já ter sido removido.'"
    >
      <template #action>
        <UiButton variant="primary" to="/loja">Ir para a loja</UiButton>
      </template>
    </UiEmptyState>

    <!-- ESTADO NORMAL -->
    <div v-else-if="!loading && !loadError && cart" class="cd-grid">
      <!-- COLUNA PRINCIPAL: itens + editor -->
      <div class="cd-main">
        <!-- KPIs do carrinho -->
        <div class="cd-metrics">
          <UiMetricCard label="Itens" :value="format.formatNumber(itemsCount)" tone="primary" />
          <UiMetricCard
            label="Produtos distintos"
            :value="format.formatNumber(items.length)"
            hint="Linhas no carrinho"
          />
          <UiMetricCard
            label="Subtotal"
            :value="format.formatCurrency(subtotal)"
            tone="success"
            hint="Sem frete e impostos"
          />
        </div>

        <!-- CartEditor: tabela de itens com ajuste de quantidade e remoção -->
        <UiCard title="Itens do carrinho" :subtitle="editableHint">
          <template #actions>
            <UiStatusBadge :status="cart.status" :label="statusLabel" />
          </template>

          <UiDataTable
            :columns="itemColumns"
            :rows="items"
            row-key="_k"
            :empty="emptyItems"
          >
            <!-- nome do produto + SKU -->
            <template #cell-name="{ row }">
              <div class="cd-prod">
                <span class="cd-prod-name">{{ row.name || row.productName || 'Produto' }}</span>
                <span v-if="row.sku" class="cd-prod-sku ui-mono">{{ row.sku }}</span>
              </div>
            </template>

            <!-- preço unitário -->
            <template #cell-unitPrice="{ row }">
              {{ format.formatCurrency(unitPriceOf(row)) }}
            </template>

            <!-- quantidade: stepper acessível (CSP-safe, só classes) -->
            <template #cell-quantity="{ row }">
              <div v-if="canEdit" class="cd-qty" role="group" :aria-label="'Quantidade de ' + (row.name || 'item')">
                <button
                  type="button"
                  class="cd-qty-btn"
                  :disabled="busyItem === row._k || quantityOf(row) <= 1"
                  :aria-label="'Diminuir quantidade de ' + (row.name || 'item')"
                  @click="changeQuantity(row, quantityOf(row) - 1)"
                >−</button>
                <span class="cd-qty-value" aria-live="polite">{{ format.formatNumber(quantityOf(row)) }}</span>
                <button
                  type="button"
                  class="cd-qty-btn"
                  :disabled="busyItem === row._k"
                  :aria-label="'Aumentar quantidade de ' + (row.name || 'item')"
                  @click="changeQuantity(row, quantityOf(row) + 1)"
                >+</button>
              </div>
              <span v-else>{{ format.formatNumber(quantityOf(row)) }}</span>
            </template>

            <!-- total da linha -->
            <template #cell-lineTotal="{ row }">
              <strong>{{ format.formatCurrency(lineTotalOf(row)) }}</strong>
            </template>

            <!-- remover item -->
            <template #cell-actions="{ row }">
              <UiButton
                v-if="canEdit"
                variant="danger"
                size="sm"
                :loading="busyItem === row._k"
                :aria-label="'Remover ' + (row.name || 'item') + ' do carrinho'"
                @click="removeItem(row)"
              >
                Remover
              </UiButton>
              <span v-else class="ui-muted">—</span>
            </template>

            <template #empty-action>
              <UiButton variant="primary" to="/loja">Adicionar produtos</UiButton>
            </template>
          </UiDataTable>

          <!-- rodapé: totais + CTA do editor -->
          <template #footer>
            <div class="cd-foot">
              <div class="cd-foot-totals">
                <span class="cd-foot-label">Subtotal</span>
                <span class="cd-foot-value">{{ format.formatCurrency(subtotal) }}</span>
              </div>
              <div class="cd-foot-actions">
                <UiButton
                  v-if="canEdit"
                  variant="subtle"
                  :disabled="!items.length || saving"
                  @click="openEditor"
                >
                  Editar itens
                </UiButton>
                <UiButton variant="ghost" to="/loja">Continuar comprando</UiButton>
              </div>
            </div>
          </template>
        </UiCard>
      </div>

      <!-- COLUNA LATERAL: cliente + resumo + checkout -->
      <aside class="cd-side">
        <!-- CustomerInfo -->
        <UiCard title="Cliente" subtitle="Quem está comprando.">
          <template #actions>
            <UiButton
              v-if="canEdit"
              variant="ghost"
              size="sm"
              @click="openCustomer"
            >
              Editar
            </UiButton>
          </template>
          <dl class="cd-kv">
            <div class="cd-kv-row">
              <dt>Nome</dt>
              <dd>{{ cart.customerName || cart.customer_name || 'Visitante' }}</dd>
            </div>
            <div class="cd-kv-row">
              <dt>Itens</dt>
              <dd>{{ format.formatNumber(itemsCount) }}</dd>
            </div>
            <div class="cd-kv-row">
              <dt>Situação</dt>
              <dd><UiStatusBadge :status="cart.status" :label="statusLabel" size="sm" /></dd>
            </div>
            <div class="cd-kv-row">
              <dt>Atualizado em</dt>
              <dd>{{ format.formatDateTime(cart.updatedAt || cart.updated_at) }}</dd>
            </div>
          </dl>
        </UiCard>

        <!-- Resumo + CheckoutButton -->
        <UiCard title="Resumo do pedido">
          <dl class="cd-summary">
            <div class="cd-sum-row">
              <dt>Itens</dt>
              <dd>{{ format.formatNumber(itemsCount) }}</dd>
            </div>
            <div class="cd-sum-row">
              <dt>Subtotal</dt>
              <dd>{{ format.formatCurrency(subtotal) }}</dd>
            </div>
            <div class="cd-sum-row cd-sum-total">
              <dt>Total a pagar</dt>
              <dd>{{ format.formatCurrency(subtotal) }}</dd>
            </div>
          </dl>
          <template #footer>
            <div class="cd-checkout">
              <UiButton
                v-if="!isConverted"
                variant="primary"
                size="lg"
                block
                :disabled="!canCheckout"
                @click="goToCheckout"
              >
                Avançar para o checkout
              </UiButton>
              <UiButton
                v-else
                variant="subtle"
                size="lg"
                block
                to="/loja"
              >
                Voltar à loja
              </UiButton>
              <p v-if="!isConverted && !canCheckout" class="cd-checkout-hint ui-muted">
                {{ checkoutHint }}
              </p>
              <p v-else-if="isConverted" class="cd-checkout-hint ui-muted">
                Carrinho já convertido — não há cobrança pendente.
              </p>
            </div>
          </template>
        </UiCard>
      </aside>
    </div>

    <!-- MODAL: CartEditor (ajuste em lote das quantidades) -->
    <UiModal v-model:open="editorOpen" title="Editar itens do carrinho" width="lg">
      <form class="cd-editor" novalidate @submit.prevent="saveEditor">
        <p class="cd-editor-intro ui-muted">
          Ajuste as quantidades. Deixe em zero para remover o item ao salvar.
        </p>
        <UiEmptyState
          v-if="!draftItems.length"
          compact
          :icon="glyphs.empty"
          title="Sem itens para editar"
          description="Este carrinho está vazio."
        />
        <ul v-else class="cd-editor-list">
          <li v-for="(it, idx) in draftItems" :key="it._k" class="cd-editor-row">
            <div class="cd-editor-info">
              <span class="cd-editor-name">{{ it.name || it.productName || 'Produto' }}</span>
              <span class="cd-editor-price ui-muted">{{ format.formatCurrency(unitPriceOf(it)) }} / un.</span>
            </div>
            <UiFormField
              :label="'Quantidade de ' + (it.name || 'item')"
              :id="'qty-' + it._k"
              :error="draftErrors[it._k] || ''"
              v-slot="{ id, describedBy, hasError }"
            >
              <input
                :id="id"
                type="number"
                min="0"
                :max="maxQtyOf(it) ?? undefined"
                step="1"
                inputmode="numeric"
                class="cd-editor-input"
                :aria-invalid="hasError || null"
                :aria-describedby="describedBy"
                :value="it.quantity"
                @input="onDraftQty(idx, $event)"
              />
            </UiFormField>
            <span class="cd-editor-line">{{ format.formatCurrency(draftLineTotal(it)) }}</span>
          </li>
        </ul>
      </form>
      <template #footer>
        <div class="cd-editor-foot">
          <span class="cd-editor-newtotal">
            Novo subtotal: <strong>{{ format.formatCurrency(draftSubtotal) }}</strong>
          </span>
          <div class="cd-editor-btns">
            <UiButton variant="ghost" :disabled="saving" @click="editorOpen = false">Cancelar</UiButton>
            <UiButton
              variant="primary"
              :loading="saving"
              :disabled="!editorDirty || editorHasErrors"
              @click="saveEditor"
            >
              Salvar alterações
            </UiButton>
          </div>
        </div>
      </template>
    </UiModal>

    <!-- MODAL: editar dados do cliente -->
    <UiModal v-model:open="customerOpen" title="Editar cliente" width="sm">
      <form class="cd-cust-form" novalidate @submit.prevent="saveCustomer">
        <UiFormField
          label="Nome do cliente"
          required
          :error="custForm.errors.customerName"
          v-slot="{ id, describedBy, hasError }"
        >
          <input
            :id="id"
            type="text"
            autocomplete="name"
            placeholder="Nome de quem está comprando"
            :aria-invalid="hasError || null"
            :aria-describedby="describedBy"
            :value="custForm.values.customerName"
            @input="custForm.setField('customerName', $event.target.value)"
          />
        </UiFormField>
      </form>
      <template #footer>
        <UiButton variant="ghost" :disabled="custForm.submitting.value" @click="customerOpen = false">Cancelar</UiButton>
        <UiButton variant="primary" :loading="custForm.submitting.value" @click="saveCustomer">Salvar</UiButton>
      </template>
    </UiModal>
  </UiPageLayout>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import {
  UiPageLayout,
  UiCard,
  UiButton,
  UiMetricCard,
  UiStatusBadge,
  UiDataTable,
  UiEmptyState,
  UiFormField,
  UiModal,
  useForm,
  useToast,
  useConfirm,
  validators,
  format,
} from '../ui/index.js';
import * as api from '../api.js';

const props = defineProps({ id: { type: [String, Number], default: '' } });

// Glifos centralizados (sempre aria-hidden no template) — uma fonte única em vez de literais
// espalhados, para consistência visual. O kit ui-vue não expõe um UiIcon; quando expuser, troca-se aqui.
const glyphs = {
  converted: '✓',
  abandoned: '⚠',
  cart: '🛒',
  search: '🔎',
  empty: '∅',
};

const route = useRoute();
const router = useRouter();
const toast = useToast();
const confirm = useConfirm();

// --- identidade da tela (prop :id ou param da rota) -----------------------
const cartId = computed(() => String(props.id ?? route.params.id ?? '').trim());
const cartLabel = computed(() => '#' + (cartId.value || '—'));
const pageTitle = computed(() => (cartId.value ? 'Carrinho ' + cartLabel.value : 'Carrinho'));

// --- estados de carga -----------------------------------------------------
const loading = ref(true);
const refreshing = ref(false);
const loadError = ref(null);
const cart = ref(null);

// --- normalização dos itens ----------------------------------------------
// O backend pode entregar a lista em `items`, `lineItems` ou nada (carrinho só com agregados).
function normalizeItems(data) {
  if (!data) return [];
  const raw = data.items || data.lineItems || data.line_items || [];
  if (!Array.isArray(raw)) return [];
  return raw.map((it, i) => ({ _k: it.id ?? it.sku ?? i, ...it }));
}

const items = ref([]);

// --- derivados ------------------------------------------------------------
const unitPriceOf = (it) => Number(it.unitPrice ?? it.unit_price ?? it.price ?? 0);
const quantityOf = (it) => Number(it.quantity ?? it.qty ?? 0);
const lineTotalOf = (it) => unitPriceOf(it) * quantityOf(it);

const itemsCount = computed(() => {
  if (items.value.length) return items.value.reduce((s, it) => s + quantityOf(it), 0);
  return Number(cart.value?.itemsCount ?? cart.value?.items_count ?? 0);
});
const subtotal = computed(() => {
  if (items.value.length) return items.value.reduce((s, it) => s + lineTotalOf(it), 0);
  return Number(cart.value?.subtotal ?? 0);
});

const statusOf = computed(() => String(cart.value?.status || '').toLowerCase());
const isConverted = computed(() => statusOf.value === 'convertido');
const isAbandoned = computed(() => statusOf.value === 'abandonado');
const isEmpty = computed(() => itemsCount.value <= 0 && subtotal.value <= 0);
const statusLabel = computed(() => format.humanize(cart.value?.status || ''));

// só edita carrinho que NÃO foi convertido (transação já realizada não se altera)
const canEdit = computed(() => !!cart.value && !isConverted.value);
const editableHint = computed(() =>
  canEdit.value
    ? 'Ajuste as quantidades ou remova itens — o subtotal recalcula automaticamente.'
    : 'Somente leitura — este carrinho já foi convertido.',
);

const canCheckout = computed(() => !!cart.value && !isConverted.value && !isEmpty.value);
const checkoutHint = computed(() => {
  if (isEmpty.value) return 'Adicione itens ao carrinho antes de finalizar.';
  return 'Carrinho indisponível para checkout no momento.';
});

// --- colunas da tabela de itens ------------------------------------------
const itemColumns = [
  { key: 'name', label: 'Produto' },
  { key: 'unitPrice', label: 'Preço un.', align: 'right' },
  { key: 'quantity', label: 'Qtd.', align: 'center' },
  { key: 'lineTotal', label: 'Total', align: 'right' },
  { key: 'actions', label: '', align: 'right' },
];
const emptyItems = {
  title: 'Carrinho vazio',
  description: 'Ainda não há produtos neste carrinho.',
  icon: glyphs.cart,
};

// --- carregamento ---------------------------------------------------------
async function load(opts = {}) {
  if (opts.refresh) refreshing.value = true; else loading.value = true;
  loadError.value = null;
  if (!cartId.value) {
    cart.value = null;
    loading.value = false;
    refreshing.value = false;
    return;
  }
  try {
    const data = await api.carts.get(cartId.value);
    cart.value = data || null;
    items.value = normalizeItems(data);
  } catch (e) {
    if (e && e.status === 404) {
      cart.value = null; // cai no empty-state
    } else {
      loadError.value = e;
    }
  } finally {
    loading.value = false;
    refreshing.value = false;
  }
}
const reload = () => load({ refresh: !!cart.value });

// --- edição inline de quantidade (stepper) -------------------------------
const busyItem = ref(null);

async function persistItems(nextItems, successMsg) {
  // payload mínimo: linhas { id?, sku?, quantity }. O backend recalcula agregados.
  const payload = {
    items: nextItems.map((it) => ({
      id: it.id ?? undefined,
      sku: it.sku ?? undefined,
      quantity: quantityOf(it),
    })),
  };
  const updated = await api.carts.update(cartId.value, payload);
  if (updated && typeof updated === 'object') {
    cart.value = { ...cart.value, ...updated };
    const norm = normalizeItems(updated);
    items.value = norm.length ? norm : nextItems;
  } else {
    items.value = nextItems;
  }
  if (successMsg) toast.success(successMsg);
}

async function changeQuantity(row, nextQty) {
  const qty = Math.max(1, Math.floor(Number(nextQty) || 0));
  if (qty === quantityOf(row)) return;
  busyItem.value = row._k;
  try {
    const next = items.value.map((it) => (it._k === row._k ? { ...it, quantity: qty } : it));
    await persistItems(next);
    toast.success('Quantidade atualizada.');
  } catch (e) {
    toast.error('Não foi possível atualizar a quantidade.', {
      detail: (e && e.message) || '',
      code: e && e.status ? 'HTTP ' + e.status : '',
    });
  } finally {
    busyItem.value = null;
  }
}

async function removeItem(row) {
  const ok = await confirm({
    title: 'Remover item?',
    message: 'Remover “' + (row.name || row.productName || 'este item') + '” do carrinho? Esta ação não pode ser desfeita.',
    confirmLabel: 'Remover',
    cancelLabel: 'Manter',
    danger: true,
  });
  if (!ok) return;
  busyItem.value = row._k;
  try {
    const next = items.value.filter((it) => it._k !== row._k);
    await persistItems(next);
    toast.success('Item removido do carrinho.');
  } catch (e) {
    toast.error('Não foi possível remover o item.', {
      detail: (e && e.message) || '',
      code: e && e.status ? 'HTTP ' + e.status : '',
    });
  } finally {
    busyItem.value = null;
  }
}

// --- CartEditor (modal de edição em lote) --------------------------------
const editorOpen = ref(false);
const draftItems = ref([]);
// erros de validação por linha (chave = it._k), preenchidos pelas regras do kit (validators).
const draftErrors = reactive({});

// estoque máximo da linha, quando o item carrega essa informação (senão null → sem teto).
function maxQtyOf(it) {
  const raw = it.stock ?? it.stockQty ?? it.stock_qty ?? it.available ?? it.availableQty ?? null;
  if (raw === null || raw === undefined || raw === '') return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

// regras de quantidade por linha: numérico, inteiro, ≥ 0 e ≤ estoque (quando houver).
function draftQtyRules(it) {
  const rules = [validators.numeric('Quantidade inválida'), validators.min(0, 'Não pode ser negativo')];
  const cap = maxQtyOf(it);
  if (cap !== null) rules.push(validators.max(cap, 'Máximo em estoque: ' + cap));
  return rules;
}

// valida UMA linha e persiste a mensagem (ou limpa) em draftErrors.
function validateDraftRow(it) {
  const raw = it.quantity;
  let msg = validators.runRules(draftQtyRules(it), raw);
  if (!msg && !Number.isInteger(Number(raw))) msg = 'Use um número inteiro';
  if (msg) draftErrors[it._k] = msg; else delete draftErrors[it._k];
  return !msg;
}
function validateDraftAll() {
  let ok = true;
  for (const it of draftItems.value) if (!validateDraftRow(it)) ok = false;
  return ok;
}
const editorHasErrors = computed(() => Object.keys(draftErrors).length > 0);

function openEditor() {
  for (const k of Object.keys(draftErrors)) delete draftErrors[k];
  draftItems.value = items.value.map((it) => ({ ...it, quantity: quantityOf(it) }));
  editorOpen.value = true;
}
function onDraftQty(idx, ev) {
  // mantém o que o usuário digitou para a validação (não fazemos clamp silencioso);
  // a regra de quantidade do kit aponta o erro e bloqueia o salvar.
  const v = ev.target.value;
  draftItems.value = draftItems.value.map((it, i) => (i === idx ? { ...it, quantity: v } : it));
  validateDraftRow(draftItems.value[idx]);
}
const draftLineTotal = (it) => unitPriceOf(it) * Math.max(0, Number(it.quantity) || 0);
const draftSubtotal = computed(() => draftItems.value.reduce((s, it) => s + draftLineTotal(it), 0));
const editorDirty = computed(() => {
  if (draftItems.value.length !== items.value.length) return true;
  return draftItems.value.some((it) => {
    const orig = items.value.find((o) => o._k === it._k);
    return !orig || quantityOf(orig) !== Number(it.quantity);
  });
});

async function saveEditor() {
  // bloqueia o salvar quando alguma linha viola as regras de quantidade (numeric/min/max).
  if (!validateDraftAll()) {
    toast.error('Revise as quantidades destacadas antes de salvar.');
    return;
  }
  if (!editorDirty.value) {
    editorOpen.value = false;
    return;
  }
  // itens com quantidade 0 são removidos
  const kept = draftItems.value.filter((it) => Math.max(0, Math.floor(Number(it.quantity) || 0)) > 0);
  const removedCount = draftItems.value.length - kept.length;
  if (removedCount > 0) {
    const ok = await confirm({
      title: 'Confirmar alterações',
      message: removedCount === 1
        ? '1 item será removido do carrinho. Deseja continuar?'
        : removedCount + ' itens serão removidos do carrinho. Deseja continuar?',
      confirmLabel: 'Salvar',
      cancelLabel: 'Revisar',
      danger: true,
    });
    if (!ok) return;
  }
  saving.value = true;
  try {
    await persistItems(kept.map((it) => ({ ...it, quantity: Math.floor(Number(it.quantity)) })));
    toast.success('Carrinho atualizado.');
    editorOpen.value = false;
  } catch (e) {
    toast.error('Não foi possível salvar o carrinho.', {
      detail: (e && e.message) || '',
      code: e && e.status ? 'HTTP ' + e.status : '',
    });
  } finally {
    saving.value = false;
  }
}

// --- editar cliente (CustomerInfo) ---------------------------------------
const saving = ref(false);
const customerOpen = ref(false);
const custForm = useForm({
  initial: { customerName: '' },
  rules: { customerName: [validators.required('Informe o nome do cliente'), validators.minLen(2)] },
});

function openCustomer() {
  custForm.setField('customerName', cart.value?.customerName || cart.value?.customer_name || '');
  delete custForm.errors.customerName;
  delete custForm.touched.customerName;
  customerOpen.value = true;
}
async function saveCustomer() {
  await custForm.handleSubmit(async (values) => {
    try {
      const updated = await api.carts.update(cartId.value, { customerName: values.customerName.trim() });
      if (updated && typeof updated === 'object') cart.value = { ...cart.value, ...updated };
      else cart.value = { ...cart.value, customerName: values.customerName.trim() };
      toast.success('Cliente atualizado.');
      customerOpen.value = false;
    } catch (e) {
      toast.error('Não foi possível salvar o cliente.', {
        detail: (e && e.message) || '',
        code: e && e.status ? 'HTTP ' + e.status : '',
      });
      throw e;
    }
  });
}

// --- CheckoutButton: avança para o checkout ------------------------------
async function goToCheckout() {
  if (!canCheckout.value) return;
  const ok = await confirm({
    title: 'Avançar para o checkout',
    message: 'Finalizar o carrinho ' + cartLabel.value + ' com subtotal de ' + format.formatCurrency(subtotal.value) + '?',
    confirmLabel: 'Ir para o checkout',
    cancelLabel: 'Continuar editando',
  });
  if (!ok) return;
  router.push('/checkout/' + cartId.value);
}

onMounted(() => load());
</script>

<style scoped>
/* banner contextual */
.cd-note {
  display: flex;
  align-items: center;
  gap: var(--ui-space-2);
  margin: 0;
  padding: var(--ui-space-2) var(--ui-space-4);
  border-radius: var(--ui-radius-md);
  font-size: var(--ui-text-sm);
  font-weight: 600;
  border: 1px solid rgb(var(--ui-border));
}
.cd-note[data-tone="success"] { background: rgb(var(--ui-ok) / 0.1); color: rgb(var(--ui-ok)); border-color: rgb(var(--ui-ok) / 0.4); }
.cd-note[data-tone="warning"] { background: rgb(var(--ui-warn) / 0.1); color: rgb(var(--ui-warn)); border-color: rgb(var(--ui-warn) / 0.4); }
.cd-note[data-tone="neutral"] { background: rgb(var(--ui-surface-2)); color: rgb(var(--ui-muted)); }
.cd-note-icon { flex-shrink: 0; }

/* layout em 2 colunas (conteúdo + lateral) */
.cd-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 340px;
  gap: var(--ui-space-5);
  align-items: start;
}
.cd-main { display: flex; flex-direction: column; gap: var(--ui-space-4); min-width: 0; }
.cd-side { display: flex; flex-direction: column; gap: var(--ui-space-4); min-width: 0; }

/* KPIs */
.cd-metrics {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: var(--ui-space-3);
}

/* célula de produto */
.cd-prod { display: flex; flex-direction: column; gap: var(--ui-space-1); min-width: 0; }
.cd-prod-name { font-weight: 600; color: rgb(var(--ui-fg)); }
.cd-prod-sku { font-size: var(--ui-text-xs); color: rgb(var(--ui-muted)); }

/* stepper de quantidade — tamanho do controle derivado da escala de tokens
   (--ui-space-5 = 24px) e centralizado numa custom property nomeada (sem px ad-hoc espalhado). */
.cd-qty {
  --cd-stepper-size: var(--ui-space-5);
  display: inline-flex;
  align-items: center;
  gap: var(--ui-space-1);
  border: 1px solid rgb(var(--ui-border-strong));
  border-radius: var(--ui-radius-pill);
  padding: var(--ui-space-1);
}
.cd-qty-btn {
  width: var(--cd-stepper-size);
  height: var(--cd-stepper-size);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: rgb(var(--ui-surface-2));
  color: rgb(var(--ui-fg));
  border-radius: var(--ui-radius-pill);
  cursor: pointer;
  font-size: var(--ui-text-md);
  line-height: 1;
  font: inherit;
}
.cd-qty-btn:hover:not(:disabled) { background: rgb(var(--ui-accent) / 0.16); color: rgb(var(--ui-accent-strong)); }
.cd-qty-btn:disabled { opacity: 0.45; cursor: not-allowed; }
.cd-qty-value { min-width: var(--ui-space-6); text-align: center; font-weight: 600; font-variant-numeric: tabular-nums; }

/* rodapé da tabela */
.cd-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ui-space-4);
  flex-wrap: wrap;
}
.cd-foot-totals { display: flex; align-items: baseline; gap: var(--ui-space-3); }
.cd-foot-label { color: rgb(var(--ui-muted)); font-size: var(--ui-text-sm); }
.cd-foot-value { font-family: var(--ui-font-display); font-size: var(--ui-text-xl); font-weight: 700; }
.cd-foot-actions { display: flex; gap: var(--ui-space-2); flex-wrap: wrap; }

/* CustomerInfo / detalhe em dt-dd */
.cd-kv { margin: 0; display: flex; flex-direction: column; gap: var(--ui-space-3); }
.cd-kv-row { display: flex; align-items: baseline; justify-content: space-between; gap: var(--ui-space-3); }
.cd-kv dt { margin: 0; font-size: var(--ui-text-xs); text-transform: uppercase; letter-spacing: .06em; color: rgb(var(--ui-muted)); font-weight: 600; }
.cd-kv dd { margin: 0; font-weight: 600; text-align: right; word-break: break-word; min-width: 0; }

/* resumo do pedido */
.cd-summary { margin: 0; display: flex; flex-direction: column; gap: var(--ui-space-2); }
.cd-sum-row { display: flex; align-items: baseline; justify-content: space-between; gap: var(--ui-space-3); }
.cd-sum-row dt { color: rgb(var(--ui-muted)); font-size: var(--ui-text-sm); margin: 0; }
.cd-sum-row dd { margin: 0; font-weight: 600; }
.cd-sum-total { padding-top: var(--ui-space-2); border-top: 1px solid rgb(var(--ui-border)); }
.cd-sum-total dt { color: rgb(var(--ui-fg)); font-weight: 700; font-size: var(--ui-text-md); }
.cd-sum-total dd { font-family: var(--ui-font-display); font-size: var(--ui-text-lg); font-weight: 700; }

/* checkout */
.cd-checkout { display: flex; flex-direction: column; gap: var(--ui-space-2); }
.cd-checkout-hint { margin: 0; font-size: var(--ui-text-xs); text-align: center; }

/* CartEditor (modal) */
.cd-editor { display: flex; flex-direction: column; gap: var(--ui-space-3); }
.cd-editor-intro { margin: 0; font-size: var(--ui-text-sm); }
.cd-editor-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--ui-space-3); }
.cd-editor-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 120px 110px;
  align-items: end;
  gap: var(--ui-space-3);
  padding-bottom: var(--ui-space-3);
  border-bottom: 1px solid rgb(var(--ui-border));
}
.cd-editor-row:last-child { border-bottom: none; padding-bottom: 0; }
.cd-editor-info { display: flex; flex-direction: column; gap: var(--ui-space-1); min-width: 0; }
.cd-editor-name { font-weight: 600; word-break: break-word; }
.cd-editor-price { font-size: var(--ui-text-xs); }
.cd-editor-input { text-align: right; }
/* total alinhado ao texto do input (que tem padding interno do kit) via padding tokenizado, sem px ad-hoc. */
.cd-editor-line { font-weight: 700; text-align: right; font-variant-numeric: tabular-nums; padding-bottom: var(--ui-space-2); }
.cd-editor-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ui-space-4);
  flex-wrap: wrap;
  width: 100%;
}
.cd-editor-newtotal { font-size: var(--ui-text-sm); color: rgb(var(--ui-muted)); }
.cd-editor-btns { display: flex; gap: var(--ui-space-2); }

/* editar cliente */
.cd-cust-form { display: flex; flex-direction: column; gap: var(--ui-space-3); }

/* responsivo */
@media (max-width: 980px) {
  .cd-grid { grid-template-columns: 1fr; }
  .cd-side { flex-direction: row; flex-wrap: wrap; }
  .cd-side > * { flex: 1 1 280px; }
}
@media (max-width: 640px) {
  .cd-metrics { grid-template-columns: 1fr; }
  .cd-editor-row { grid-template-columns: 1fr; align-items: stretch; }
  .cd-editor-line { text-align: left; padding-bottom: 0; }
  .cd-side { flex-direction: column; }
}
</style>
