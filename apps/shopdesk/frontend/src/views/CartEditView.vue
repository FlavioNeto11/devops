<!--
  CartEditView — Edição do carrinho (REF-SHOPDESK-0012 / REQ-SHOPDESK-0003)
  Permite ajustar quantidades, remover itens e editar dados do cliente.
  Salvar persiste via PUT /v1/carts/:id e redireciona para /carts/:id.
  Cancelar volta ao detalhe sem persistir. Estados: loading / error / normal.
  CSP-safe. A11y. Somente endpoints reais via ../api.js.
-->
<template>
  <UiPageLayout
    eyebrow="Carrinhos"
    :title="pageTitle"
    subtitle="Ajuste itens e dados do cliente, depois salve."
    width="wide"
    :loading="loading"
    loading-message="Carregando carrinho…"
    :error="loadError"
    :retryable="true"
    @retry="reload"
  >
    <!-- ações de topo -->
    <template #actions>
      <UiButton variant="ghost" :to="detailPath" :disabled="saving">Cancelar</UiButton>
      <UiButton
        variant="primary"
        :loading="saving"
        :disabled="!cart || isConverted"
        @click="save"
      >
        Salvar alterações
      </UiButton>
    </template>

    <!-- carrinho não encontrado -->
    <UiEmptyState
      v-if="!loading && !loadError && !cart"
      icon="🔎"
      title="Carrinho não encontrado"
      :description="'Não localizamos o carrinho ' + cartLabel + '.'"
    >
      <template #action>
        <UiButton variant="primary" to="/carts">Ver lista de carrinhos</UiButton>
      </template>
    </UiEmptyState>

    <!-- convertido: não editável -->
    <UiCard v-else-if="!loading && !loadError && cart && isConverted" title="Carrinho convertido">
      <p class="ce-converted ui-muted">
        Este carrinho já foi convertido em pedido e não pode ser editado.
      </p>
      <template #footer>
        <UiButton variant="ghost" :to="detailPath">Voltar ao detalhe</UiButton>
      </template>
    </UiCard>

    <!-- formulário de edição -->
    <div v-else-if="!loading && !loadError && cart" class="ce-grid">
      <!-- CARD: itens com stepper -->
      <UiCard title="Itens do carrinho" subtitle="Ajuste quantidades ou remova itens.">
        <UiDataTable
          :columns="itemColumns"
          :rows="draftItems"
          row-key="_k"
          :empty="emptyItems"
        >
          <!-- produto -->
          <template #cell-name="{ row }">
            <div class="ce-prod">
              <span class="ce-prod-name">{{ row.name || row.productName || 'Produto' }}</span>
              <span v-if="row.sku" class="ce-prod-sku ui-mono">{{ row.sku }}</span>
            </div>
          </template>

          <!-- preço unitário -->
          <template #cell-unitPrice="{ row }">
            {{ format.formatCurrency(unitPriceOf(row)) }}
          </template>

          <!-- stepper de quantidade acessível -->
          <template #cell-quantity="{ row }">
            <div
              class="ce-qty"
              role="group"
              :aria-label="'Quantidade de ' + (row.name || 'item')"
            >
              <button
                type="button"
                class="ce-qty-btn"
                :disabled="busyItem === row._k || quantityOf(row) <= 1"
                :aria-label="'Diminuir quantidade de ' + (row.name || 'item')"
                @click="changeQty(row, quantityOf(row) - 1)"
              >−</button>
              <span class="ce-qty-value" aria-live="polite">{{ format.formatNumber(quantityOf(row)) }}</span>
              <button
                type="button"
                class="ce-qty-btn"
                :disabled="busyItem === row._k"
                :aria-label="'Aumentar quantidade de ' + (row.name || 'item')"
                @click="changeQty(row, quantityOf(row) + 1)"
              >+</button>
            </div>
          </template>

          <!-- total da linha -->
          <template #cell-lineTotal="{ row }">
            <strong>{{ format.formatCurrency(lineTotalOf(row)) }}</strong>
          </template>

          <!-- remover item -->
          <template #cell-actions="{ row }">
            <UiButton
              variant="danger"
              size="sm"
              :loading="busyItem === row._k"
              :aria-label="'Remover ' + (row.name || row.productName || 'item') + ' do carrinho'"
              @click="removeItem(row)"
            >
              Remover
            </UiButton>
          </template>

          <template #empty-action>
            <UiButton variant="ghost" to="/loja">Ir para a loja</UiButton>
          </template>
        </UiDataTable>

        <template #footer>
          <div class="ce-foot">
            <div class="ce-foot-totals">
              <span class="ce-foot-label">Novo subtotal</span>
              <span class="ce-foot-value">{{ format.formatCurrency(draftSubtotal) }}</span>
            </div>
            <div class="ce-foot-actions">
              <UiButton variant="ghost" to="/loja">Adicionar produtos</UiButton>
            </div>
          </div>
        </template>
      </UiCard>

      <!-- CARD: dados do cliente -->
      <UiCard title="Cliente" subtitle="Nome de quem está comprando.">
        <form class="ce-form" novalidate @submit.prevent="save">
          <UiFormField
            label="Nome do cliente"
            required
            :error="custError"
            v-slot="{ id, describedBy, hasError }"
          >
            <input
              :id="id"
              type="text"
              autocomplete="name"
              placeholder="Nome de quem está comprando"
              :aria-invalid="hasError || null"
              :aria-describedby="describedBy"
              :value="custName"
              @input="onCustName($event.target.value)"
            />
          </UiFormField>
        </form>

        <template #footer>
          <div class="ce-cust-foot">
            <UiButton variant="ghost" :to="detailPath" :disabled="saving">Cancelar</UiButton>
            <UiButton variant="primary" :loading="saving" :disabled="!dirty" @click="save">
              Salvar
            </UiButton>
          </div>
        </template>
      </UiCard>
    </div>
  </UiPageLayout>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import {
  UiPageLayout,
  UiCard,
  UiButton,
  UiDataTable,
  UiEmptyState,
  UiFormField,
  useToast,
  useConfirm,
  format,
} from '../ui/index.js';
import * as api from '../api.js';

const props = defineProps({ id: { type: [String, Number], default: '' } });

const route = useRoute();
const router = useRouter();
const toast = useToast();
const confirm = useConfirm();

const cartId = computed(() => String(props.id ?? route.params.id ?? '').trim());
const cartLabel = computed(() => '#' + (cartId.value || '—'));
const pageTitle = computed(() => (cartId.value ? 'Editar carrinho ' + cartLabel.value : 'Editar carrinho'));
const detailPath = computed(() => '/carts/' + cartId.value);

// estados de carga
const loading = ref(true);
const loadError = ref(null);
const cart = ref(null);
const saving = ref(false);
const busyItem = ref(null);

const unitPriceOf = (it) => Number(it.unitPrice ?? it.unit_price ?? it.price ?? 0);
const quantityOf = (it) => Number(it.quantity ?? it.qty ?? 0);
const lineTotalOf = (it) => unitPriceOf(it) * quantityOf(it);

function normalizeItems(data) {
  if (!data) return [];
  const raw = data.items || data.lineItems || data.line_items || [];
  if (!Array.isArray(raw)) return [];
  return raw.map((it, i) => ({ _k: it.id ?? it.sku ?? i, ...it }));
}

// rascunho local (draft) — não persiste até salvar
const draftItems = ref([]);
const custName = ref('');
const custError = ref('');

// originais para detectar dirty
const origItems = ref([]);
const origCustName = ref('');

const isConverted = computed(() => String(cart.value?.status || '').toLowerCase() === 'convertido');
const draftSubtotal = computed(() => draftItems.value.reduce((s, it) => s + lineTotalOf(it), 0));

const itemsDirty = computed(() => {
  if (draftItems.value.length !== origItems.value.length) return true;
  return draftItems.value.some((it) => {
    const o = origItems.value.find((o) => o._k === it._k);
    return !o || quantityOf(o) !== quantityOf(it);
  });
});
const custDirty = computed(() => custName.value.trim() !== origCustName.value.trim());
const dirty = computed(() => itemsDirty.value || custDirty.value);

const itemColumns = [
  { key: 'name', label: 'Produto' },
  { key: 'unitPrice', label: 'Preço un.', align: 'right' },
  { key: 'quantity', label: 'Qtd.', align: 'center' },
  { key: 'lineTotal', label: 'Total', align: 'right' },
  { key: 'actions', label: '', align: 'right' },
];
const emptyItems = {
  title: 'Carrinho vazio',
  description: 'Todos os itens foram removidos.',
  icon: '🛒',
};

async function load() {
  loading.value = true;
  loadError.value = null;
  if (!cartId.value) {
    cart.value = null;
    loading.value = false;
    return;
  }
  try {
    const data = await api.carts.get(cartId.value);
    cart.value = data || null;
    const its = normalizeItems(data);
    draftItems.value = its.map((it) => ({ ...it }));
    origItems.value = its.map((it) => ({ ...it }));
    const n = data?.customerName || data?.customer_name || '';
    custName.value = n;
    origCustName.value = n;
  } catch (e) {
    if (e && e.status === 404) {
      cart.value = null;
    } else {
      loadError.value = e;
    }
  } finally {
    loading.value = false;
  }
}
const reload = () => load();

function changeQty(row, nextQty) {
  const qty = Math.max(1, Math.floor(Number(nextQty) || 1));
  draftItems.value = draftItems.value.map((it) =>
    it._k === row._k ? { ...it, quantity: qty } : it,
  );
}

async function removeItem(row) {
  const ok = await confirm({
    title: 'Remover item?',
    message:
      'Remover "' +
      (row.name || row.productName || 'este item') +
      '" do carrinho? Esta ação será aplicada ao salvar.',
    confirmLabel: 'Remover',
    cancelLabel: 'Manter',
    danger: true,
  });
  if (!ok) return;
  draftItems.value = draftItems.value.filter((it) => it._k !== row._k);
}

function onCustName(v) {
  custName.value = v;
  custError.value = v.trim().length < 1 ? 'Informe o nome do cliente' : '';
}

async function save() {
  if (custName.value.trim().length < 1) {
    custError.value = 'Informe o nome do cliente';
    return;
  }
  if (!dirty.value) {
    router.push(detailPath.value);
    return;
  }
  saving.value = true;
  try {
    const payload = {
      customerName: custName.value.trim(),
      items: draftItems.value.map((it) => ({
        id: it.id ?? undefined,
        sku: it.sku ?? undefined,
        quantity: Math.floor(Number(it.quantity) || 0),
      })),
    };
    const updated = await api.carts.update(cartId.value, payload);
    if (updated && typeof updated === 'object') cart.value = { ...cart.value, ...updated };
    toast.success('Carrinho atualizado.');
    router.push(detailPath.value);
  } catch (e) {
    toast.error('Não foi possível salvar o carrinho.', {
      detail: (e && e.message) || '',
      code: e && e.status ? 'HTTP ' + e.status : '',
    });
  } finally {
    saving.value = false;
  }
}

onMounted(() => load());
</script>

<style scoped>
/* grid de edição: itens à esquerda, cliente à direita */
.ce-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 340px;
  gap: var(--ui-space-5);
  align-items: start;
}

/* célula de produto */
.ce-prod { display: flex; flex-direction: column; gap: var(--ui-space-1); min-width: 0; }
.ce-prod-name { font-weight: 600; color: rgb(var(--ui-fg)); }
.ce-prod-sku { font-size: var(--ui-text-xs); color: rgb(var(--ui-muted)); }

/* stepper de quantidade */
.ce-qty {
  --ce-stepper-size: var(--ui-space-5);
  display: inline-flex;
  align-items: center;
  gap: var(--ui-space-1);
  border: 1px solid rgb(var(--ui-border-strong));
  border-radius: var(--ui-radius-pill);
  padding: var(--ui-space-1);
}
.ce-qty-btn {
  width: var(--ce-stepper-size);
  height: var(--ce-stepper-size);
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
.ce-qty-btn:hover:not(:disabled) { background: rgb(var(--ui-accent) / 0.16); color: rgb(var(--ui-accent-strong)); }
.ce-qty-btn:disabled { opacity: 0.45; cursor: not-allowed; }
.ce-qty-value { min-width: var(--ui-space-6); text-align: center; font-weight: 600; font-variant-numeric: tabular-nums; }

/* rodapé de itens */
.ce-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ui-space-4);
  flex-wrap: wrap;
}
.ce-foot-totals { display: flex; align-items: baseline; gap: var(--ui-space-3); }
.ce-foot-label { color: rgb(var(--ui-muted)); font-size: var(--ui-text-sm); }
.ce-foot-value { font-family: var(--ui-font-display); font-size: var(--ui-text-xl); font-weight: 700; }
.ce-foot-actions { display: flex; gap: var(--ui-space-2); }

/* formulário de cliente */
.ce-form { display: flex; flex-direction: column; gap: var(--ui-space-3); }
.ce-cust-foot { display: flex; gap: var(--ui-space-2); justify-content: flex-end; flex-wrap: wrap; }

/* carrinho convertido */
.ce-converted { margin: 0; }

/* responsivo */
@media (max-width: 980px) {
  .ce-grid { grid-template-columns: 1fr; }
}
</style>
