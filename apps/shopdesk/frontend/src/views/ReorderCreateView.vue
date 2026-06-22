<template>
  <UiPageLayout
    eyebrow="Reposição"
    title="Nova ordem de reposição"
    subtitle="Selecione um SKU com estoque baixo, defina a quantidade a comprar e o fornecedor. A ordem entra como rascunho e pode ser solicitada em seguida."
    width="wide"
  >
    <template #actions>
      <UiButton variant="ghost" to="/reorders">Voltar</UiButton>
    </template>

    <div class="rc-grid">
      <!-- ============================ Coluna principal: formulário ============================ -->
      <form class="rc-main" novalidate @submit.prevent="submit">
        <!-- ---------------- Bloco 1: ProductPicker (estoque) ---------------- -->
        <UiCard
          title="Produto a repor"
          subtitle="Escolha um item do estoque ou informe o SKU manualmente."
        >
          <template #actions>
            <UiButton
              variant="subtle"
              size="sm"
              :loading="inventory.loading.value"
              @click="inventory.refresh()"
            >Atualizar estoque</UiButton>
          </template>

          <UiFormSection :columns="1">
            <UiFormField
              label="Buscar no estoque"
              hint="Filtra por SKU ou nome do produto. Itens abaixo do ponto de reposição aparecem destacados."
            >
              <template #default="{ id, describedBy }">
                <input
                  :id="id"
                  v-model="query"
                  :aria-describedby="describedBy"
                  type="search"
                  inputmode="search"
                  autocomplete="off"
                  placeholder="SKU-002, Caneca Cerâmica…"
                  role="combobox"
                  aria-expanded="true"
                  aria-controls="rc-inventory-list"
                />
              </template>
            </UiFormField>
          </UiFormSection>

          <!-- estado: carregando -->
          <UiLoadingState
            v-if="inventory.loading.value"
            variant="skeleton"
            :skeleton-lines="4"
            title="Carregando estoque…"
          />

          <!-- estado: erro -->
          <UiErrorState
            v-else-if="inventory.error.value"
            :message="inventoryErrorMessage"
            :code="inventoryErrorCode"
            retryable
            @retry="inventory.refresh()"
          />

          <!-- estado: vazio (sem nenhum item de estoque cadastrado) -->
          <UiEmptyState
            v-else-if="!inventory.items.value.length"
            icon="📦"
            title="Estoque vazio"
            description="Nenhum item de estoque foi encontrado. Você ainda pode criar a ordem informando o SKU manualmente abaixo."
            compact
          />

          <!-- estado: vazio (filtro sem resultado) -->
          <UiEmptyState
            v-else-if="!filteredInventory.length"
            icon="🔍"
            :title="'Nada encontrado para “' + query.trim() + '”'"
            description="Ajuste a busca ou informe o SKU manualmente no campo abaixo."
            compact
          >
            <template #action>
              <UiButton variant="ghost" size="sm" @click="query = ''">Limpar busca</UiButton>
            </template>
          </UiEmptyState>

          <!-- estado: normal -->
          <ul
            v-else
            id="rc-inventory-list"
            class="rc-picker"
            role="listbox"
            aria-label="Itens do estoque"
          >
            <li
              v-for="item in filteredInventory"
              :key="item.id ?? item.sku"
              class="rc-picker-item"
              role="option"
              :aria-selected="isSelected(item) ? 'true' : 'false'"
              :data-selected="isSelected(item) ? 'true' : null"
              :data-low="isLow(item) ? 'true' : null"
              tabindex="0"
              @click="pick(item)"
              @keydown.enter.prevent="pick(item)"
              @keydown.space.prevent="pick(item)"
            >
              <span class="rc-picker-mark" aria-hidden="true">{{ isSelected(item) ? '✓' : '' }}</span>
              <div class="rc-picker-info">
                <p class="rc-picker-name">{{ item.productName || 'Produto sem nome' }}</p>
                <p class="rc-picker-meta">
                  <span class="rc-mono">{{ item.sku }}</span>
                  <span v-if="item.location" class="rc-dot" aria-hidden="true">·</span>
                  <span v-if="item.location">{{ item.location }}</span>
                </p>
              </div>
              <div class="rc-picker-stock">
                <UiStatusBadge :status="stockTone(item)" :label="stockLabel(item)" size="sm" />
                <p class="rc-picker-qty">
                  {{ formatNumber(item.quantity) }}<span class="rc-picker-qty-unit"> un.</span>
                </p>
              </div>
            </li>
          </ul>

          <!-- SKU / produto efetivos (preenchidos pela seleção, editáveis para entrada manual) -->
          <UiFormSection title="Identificação do item" :columns="2">
            <UiFormField
              label="SKU"
              required
              :error="form.errors.sku"
              hint="Código do produto a ser reposto."
            >
              <template #default="{ id, describedBy }">
                <input
                  :id="id"
                  :value="form.values.sku"
                  :aria-describedby="describedBy"
                  type="text"
                  autocomplete="off"
                  placeholder="Ex.: SKU-002"
                  @input="onSkuInput($event.target.value)"
                />
              </template>
            </UiFormField>

            <UiFormField
              label="Nome do produto"
              :error="form.errors.productName"
              hint="Opcional — preenchido ao selecionar do estoque."
            >
              <template #default="{ id, describedBy }">
                <input
                  :id="id"
                  :value="form.values.productName"
                  :aria-describedby="describedBy"
                  type="text"
                  autocomplete="off"
                  placeholder="Ex.: Caneca Cerâmica"
                  @input="form.setField('productName', $event.target.value)"
                />
              </template>
            </UiFormField>
          </UiFormSection>
        </UiCard>

        <!-- ---------------- Bloco 2: quantidade + fornecedor + situação ---------------- -->
        <UiCard title="Detalhes da ordem" subtitle="Quantidade a comprar, fornecedor e situação inicial.">
          <UiFormSection :columns="2">
            <!-- NumberInput com stepper -->
            <UiFormField
              label="Quantidade solicitada"
              required
              :error="form.errors.quantity"
              :hint="quantityHint"
            >
              <template #default="{ id, describedBy }">
                <div class="rc-stepper" role="group" aria-label="Quantidade solicitada">
                  <UiButton
                    variant="ghost"
                    size="sm"
                    type="button"
                    aria-label="Diminuir quantidade"
                    :disabled="numericQuantity <= 1"
                    @click="stepQuantity(-1)"
                  >−</UiButton>
                  <input
                    :id="id"
                    :value="form.values.quantity"
                    :aria-describedby="describedBy"
                    class="rc-stepper-input"
                    type="number"
                    inputmode="numeric"
                    min="1"
                    step="1"
                    placeholder="0"
                    @input="form.setField('quantity', $event.target.value)"
                  />
                  <UiButton
                    variant="ghost"
                    size="sm"
                    type="button"
                    aria-label="Aumentar quantidade"
                    @click="stepQuantity(1)"
                  >+</UiButton>
                </div>
              </template>
            </UiFormField>

            <UiFormField
              label="Fornecedor"
              :error="form.errors.supplier"
              hint="Opcional — quem vai fornecer a reposição."
            >
              <template #default="{ id, describedBy }">
                <input
                  :id="id"
                  :value="form.values.supplier"
                  :aria-describedby="describedBy"
                  type="text"
                  autocomplete="organization"
                  placeholder="Ex.: Cerâmica Vale"
                  @input="form.setField('supplier', $event.target.value)"
                />
              </template>
            </UiFormField>

            <UiFormField
              label="Situação"
              required
              :error="form.errors.status"
              hint="Comece como rascunho e solicite quando estiver pronto."
              full-width
            >
              <template #default="{ id, describedBy }">
                <select
                  :id="id"
                  :value="form.values.status"
                  :aria-describedby="describedBy"
                  @change="form.setField('status', $event.target.value)"
                >
                  <option v-for="opt in statusOptions" :key="opt.value" :value="opt.value">
                    {{ opt.label }}
                  </option>
                </select>
              </template>
            </UiFormField>
          </UiFormSection>

          <!-- sugestões rápidas de quantidade -->
          <div v-if="quantitySuggestions.length" class="rc-suggest" aria-label="Sugestões de quantidade">
            <span class="rc-suggest-label">Sugestões:</span>
            <UiButton
              v-for="s in quantitySuggestions"
              :key="s.value"
              variant="subtle"
              size="sm"
              type="button"
              @click="applySuggestion(s.value)"
            >{{ s.label }}</UiButton>
          </div>
        </UiCard>

        <!-- ---------------- Ações ---------------- -->
        <div class="rc-actions">
          <UiButton
            variant="ghost"
            type="button"
            :disabled="!isDirty || form.submitting.value"
            @click="resetForm"
          >Limpar formulário</UiButton>
          <UiButton
            variant="primary"
            type="submit"
            size="lg"
            :loading="form.submitting.value"
          >
            {{ form.submitting.value ? 'Criando ordem…' : 'Criar ordem de reposição' }}
          </UiButton>
        </div>
      </form>

      <!-- ============================ Coluna lateral: resumo + contexto ============================ -->
      <aside class="rc-aside">
        <!-- KPI: itens abaixo do ponto -->
        <UiMetricCard
          label="Itens abaixo do ponto de reposição"
          :value="inventory.loading.value ? null : lowStockCount"
          :loading="inventory.loading.value"
          :tone="lowStockCount > 0 ? 'warning' : 'success'"
          :hint="lowStockHint"
        />

        <!-- Pré-visualização da ordem -->
        <UiCard title="Resumo da ordem" subtitle="Confira antes de criar.">
          <dl class="rc-summary">
            <div class="rc-summary-row">
              <dt>SKU</dt>
              <dd>
                <span v-if="form.values.sku" class="rc-mono">{{ form.values.sku }}</span>
                <span v-else class="rc-summary-empty">não definido</span>
              </dd>
            </div>
            <div class="rc-summary-row">
              <dt>Produto</dt>
              <dd>
                <span v-if="form.values.productName">{{ form.values.productName }}</span>
                <span v-else class="rc-summary-empty">—</span>
              </dd>
            </div>
            <div class="rc-summary-row">
              <dt>Quantidade</dt>
              <dd>
                <span v-if="numericQuantity > 0" class="rc-summary-qty">{{ formatNumber(numericQuantity) }} un.</span>
                <span v-else class="rc-summary-empty">—</span>
              </dd>
            </div>
            <div class="rc-summary-row">
              <dt>Fornecedor</dt>
              <dd>
                <span v-if="form.values.supplier">{{ form.values.supplier }}</span>
                <span v-else class="rc-summary-empty">a definir</span>
              </dd>
            </div>
            <div class="rc-summary-row">
              <dt>Situação</dt>
              <dd><UiStatusBadge :status="form.values.status" :label="statusLabelFor(form.values.status)" size="sm" /></dd>
            </div>
          </dl>

          <!-- contexto do item selecionado no estoque -->
          <div v-if="selected" class="rc-context" role="note">
            <p class="rc-context-title">Estoque atual deste SKU</p>
            <div class="rc-context-rows">
              <span class="rc-context-pair">
                <span class="rc-context-k">Disponível</span>
                <strong>{{ formatNumber(selected.quantity) }} un.</strong>
              </span>
              <span class="rc-context-pair">
                <span class="rc-context-k">Ponto de reposição</span>
                <strong>{{ selected.reorderPoint != null ? formatNumber(selected.reorderPoint) + ' un.' : '—' }}</strong>
              </span>
            </div>
            <p v-if="isLow(selected)" class="rc-context-warn">
              Estoque no ou abaixo do ponto de reposição — reposição recomendada.
            </p>
          </div>
        </UiCard>

        <!-- dica fixa -->
        <UiCard title="Como funciona" padded>
          <ul class="rc-tips">
            <li>Selecione um item do estoque para preencher SKU e nome automaticamente.</li>
            <li>A quantidade sugerida cobre a diferença até o ponto de reposição, com folga.</li>
            <li>Ordens em <strong>rascunho</strong> não disparam compra — mude para <strong>solicitada</strong> quando confirmar.</li>
          </ul>
        </UiCard>
      </aside>
    </div>

    <!-- ============================ Confirmação de ordem criada ============================ -->
    <UiModal v-model:open="createdOpen" title="Ordem de reposição criada" width="md" persistent>
      <div v-if="created" class="rc-receipt">
        <div class="rc-receipt-head">
          <UiStatusBadge
            :status="created.status"
            :label="statusLabelFor(created.status)"
            size="lg"
          />
          <p v-if="created.id" class="rc-receipt-id">Ordem <span class="rc-mono">#{{ created.id }}</span></p>
        </div>
        <dl class="rc-receipt-list">
          <div class="rc-receipt-row">
            <dt>SKU</dt>
            <dd class="rc-mono">{{ created.sku }}</dd>
          </div>
          <div v-if="created.productName" class="rc-receipt-row">
            <dt>Produto</dt>
            <dd>{{ created.productName }}</dd>
          </div>
          <div class="rc-receipt-row">
            <dt>Quantidade</dt>
            <dd>{{ formatNumber(created.quantity) }} un.</dd>
          </div>
          <div v-if="created.supplier" class="rc-receipt-row">
            <dt>Fornecedor</dt>
            <dd>{{ created.supplier }}</dd>
          </div>
        </dl>
      </div>
      <template #footer>
        <UiButton variant="ghost" to="/reorders">Ir para a lista</UiButton>
        <UiButton variant="primary" @click="startAnother">Criar outra</UiButton>
      </template>
    </UiModal>
  </UiPageLayout>
</template>

<script setup>
import { ref, reactive, computed } from 'vue';
import {
  UiPageLayout,
  UiCard,
  UiButton,
  UiFormField,
  UiFormSection,
  UiStatusBadge,
  UiMetricCard,
  UiEmptyState,
  UiLoadingState,
  UiErrorState,
  UiModal,
  useForm,
  useToast,
  useConfirm,
  validators,
  format,
} from '../ui/index.js';
import * as api from '../api.js';

const toast = useToast();
const confirm = useConfirm();

/* ------------------------------------------------------------------ *
 * Camada de dados — SÓ endpoints REAIS do backend ShopDesk:
 *   GET  /v1/inventory  (itens de estoque → ProductPicker)
 *   POST /v1/reorders   (cria a ordem de reposição)
 * Prefere os recursos do api.js quando o integrador os expõe
 * (api.inventory / api.reorders); senão usa um cliente fino sobre a
 * MESMA base do api.js (idêntico ao padrão de OrderCreateView).
 * ------------------------------------------------------------------ */
const API_BASE = import.meta.env.VITE_API_BASE_URL || '/shopdesk/api';
async function call(method, path, body) {
  const res = await fetch(API_BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error((data && data.error && data.error.message) || ('HTTP ' + res.status));
    err.status = res.status;
    throw err;
  }
  return data;
}

function listInventory() {
  if (api.inventory && typeof api.inventory.list === 'function') {
    return api.inventory.list({ page: 1, pageSize: 200 });
  }
  return call('GET', '/v1/inventory?pageSize=200');
}
function createReorder(payload) {
  if (api.reorders && typeof api.reorders.create === 'function') {
    return api.reorders.create(payload);
  }
  return call('POST', '/v1/reorders', payload);
}

// normaliza snake_case do Postgres → camelCase usado na tela.
function normalizeInventory(row) {
  return {
    id: row.id,
    sku: row.sku || '',
    productName: row.productName || row.product_name || '',
    quantity: Number(row.quantity != null ? row.quantity : 0),
    reorderPoint:
      row.reorderPoint != null ? Number(row.reorderPoint)
        : row.reorder_point != null ? Number(row.reorder_point)
          : null,
    location: row.location || '',
    status: row.status || '',
  };
}
function normalizeReorder(row) {
  return {
    id: row.id,
    sku: row.sku || '',
    productName: row.productName || row.product_name || '',
    quantity: Number(row.quantity != null ? row.quantity : 0),
    supplier: row.supplier || '',
    status: row.status || '',
  };
}

/* ------------------------------------------------------------------ *
 * Estoque (estados: loading / error / empty / normal)
 * ------------------------------------------------------------------ */
const items = ref([]);
const inventory = {
  items,
  loading: ref(false),
  error: ref(null),
  async load() {
    inventory.loading.value = true;
    inventory.error.value = null;
    try {
      const res = await listInventory();
      const rows = Array.isArray(res) ? res : res.data || res.items || [];
      items.value = rows.map(normalizeInventory);
    } catch (e) {
      inventory.error.value = e;
      items.value = [];
    } finally {
      inventory.loading.value = false;
    }
  },
  refresh() {
    return inventory.load();
  },
};
const inventoryErrorMessage = computed(() => {
  const e = inventory.error.value;
  return (e && e.message) || 'Não foi possível carregar o estoque.';
});
const inventoryErrorCode = computed(() => {
  const e = inventory.error.value;
  return e && e.status ? String(e.status) : '';
});

/* ------------------------------------------------------------------ *
 * Busca / filtro do estoque (ProductPicker)
 * ------------------------------------------------------------------ */
const query = ref('');
const filteredInventory = computed(() => {
  const q = query.value.trim().toLowerCase();
  const list = items.value;
  if (!q) return list;
  return list.filter((it) =>
    [it.sku, it.productName, it.location].some((f) => String(f || '').toLowerCase().includes(q)),
  );
});

function isLow(it) {
  if (!it) return false;
  if (Number(it.quantity) <= 0) return true;
  if (it.reorderPoint == null) return false;
  return Number(it.quantity) <= Number(it.reorderPoint);
}
function stockTone(it) {
  if (Number(it.quantity) <= 0) return 'esgotado';
  if (isLow(it)) return 'baixo';
  return 'ok';
}
function stockLabel(it) {
  if (Number(it.quantity) <= 0) return 'Sem estoque';
  if (isLow(it)) return 'Estoque baixo';
  return 'Estoque ok';
}

const lowStockCount = computed(() => items.value.filter(isLow).length);
const lowStockHint = computed(() => {
  if (inventory.loading.value) return '';
  if (!items.value.length) return 'Estoque indisponível.';
  return lowStockCount.value > 0
    ? 'Estes itens precisam de reposição.'
    : 'Nenhum item precisa de reposição agora.';
});

/* ------------------------------------------------------------------ *
 * Seleção de item (preenche SKU/nome + sugere quantidade)
 * ------------------------------------------------------------------ */
const selectedSku = ref('');
const selected = computed(() =>
  selectedSku.value
    ? items.value.find((it) => it.sku === selectedSku.value) || null
    : null,
);
function isSelected(it) {
  return !!selectedSku.value && it.sku === selectedSku.value;
}
function pick(it) {
  selectedSku.value = it.sku;
  form.setField('sku', it.sku);
  form.setField('productName', it.productName || '');
  const suggested = suggestedQuantity(it);
  if (suggested > 0) form.setField('quantity', String(suggested));
  toast.info('Item selecionado: ' + it.sku, { timeout: 2000 });
}
// digitar o SKU manualmente reconcilia com o item do estoque (se existir).
function onSkuInput(value) {
  form.setField('sku', value);
  const match = items.value.find((it) => it.sku.toLowerCase() === String(value).trim().toLowerCase());
  selectedSku.value = match ? match.sku : '';
  if (match && !form.values.productName) form.setField('productName', match.productName || '');
}

/* ------------------------------------------------------------------ *
 * Sugestão de quantidade — cobre a diferença até o ponto + folga.
 * Heurística de UI (apresentação), não regra de negócio do backend.
 * ------------------------------------------------------------------ */
function suggestedQuantity(it) {
  if (!it) return 0;
  const point = it.reorderPoint != null ? Number(it.reorderPoint) : 0;
  const qty = Number(it.quantity) || 0;
  const deficit = Math.max(point - qty, 0);
  // folga de 50% sobre o ponto (mín. 10) quando há déficit; senão repõe o próprio ponto.
  const buffer = Math.max(Math.ceil(point * 0.5), 10);
  const base = deficit > 0 ? deficit + buffer : point || 10;
  return Math.max(base, 1);
}
const quantitySuggestions = computed(() => {
  const it = selected.value;
  if (!it) return [];
  const list = [];
  const sug = suggestedQuantity(it);
  if (sug > 0) list.push({ value: sug, label: 'Sugerido (' + format.formatNumber(sug) + ')' });
  if (it.reorderPoint != null && Number(it.reorderPoint) > 0 && Number(it.reorderPoint) !== sug) {
    list.push({ value: Number(it.reorderPoint), label: 'Ponto (' + format.formatNumber(it.reorderPoint) + ')' });
  }
  const doublePoint = it.reorderPoint != null ? Number(it.reorderPoint) * 2 : 0;
  if (doublePoint > 0 && doublePoint !== sug) {
    list.push({ value: doublePoint, label: '2× ponto (' + format.formatNumber(doublePoint) + ')' });
  }
  return list.slice(0, 3);
});
function applySuggestion(value) {
  form.setField('quantity', String(value));
}

/* ------------------------------------------------------------------ *
 * Formulário (useForm + validators)
 * status enum do contrato: rascunho | solicitada | recebida | cancelada
 * ------------------------------------------------------------------ */
const statusOptions = [
  { value: 'rascunho', label: 'Rascunho' },
  { value: 'solicitada', label: 'Solicitada' },
  { value: 'recebida', label: 'Recebida' },
  { value: 'cancelada', label: 'Cancelada' },
];
function statusLabelFor(value) {
  const found = statusOptions.find((o) => o.value === value);
  return found ? found.label : (value || 'Rascunho');
}

const INITIAL = { sku: '', productName: '', quantity: '', supplier: '', status: 'rascunho' };
const form = useForm({
  initial: { ...INITIAL },
  rules: {
    sku: [validators.required('Informe o SKU do produto')],
    quantity: [
      validators.required('Informe a quantidade'),
      validators.numeric('Quantidade deve ser um número'),
      validators.min(1, 'Quantidade mínima é 1'),
    ],
    status: [validators.required('Selecione a situação')],
  },
});

const numericQuantity = computed(() => {
  const n = Number(form.values.quantity);
  return isFinite(n) && n > 0 ? Math.floor(n) : 0;
});
const quantityHint = computed(() => {
  if (selected.value) {
    const sug = suggestedQuantity(selected.value);
    return 'Sugerimos ' + format.formatNumber(sug) + ' un. para este item.';
  }
  return 'Quantidade de unidades a comprar.';
});
function stepQuantity(delta) {
  const next = Math.max(numericQuantity.value + delta, 1);
  form.setField('quantity', String(next));
}

const isDirty = computed(() =>
  Object.keys(INITIAL).some((k) => String(form.values[k] ?? '') !== String(INITIAL[k] ?? '')),
);

/* ------------------------------------------------------------------ *
 * Submissão: POST /v1/reorders
 * ------------------------------------------------------------------ */
const createdOpen = ref(false);
const created = ref(null);

async function submit() {
  if (!form.validate()) {
    toast.error('Revise os campos destacados antes de continuar.');
    return;
  }
  await form.handleSubmit(async (values) => {
    try {
      const payload = {
        sku: values.sku.trim(),
        productName: (values.productName || '').trim() || null,
        quantity: numericQuantity.value,
        supplier: (values.supplier || '').trim() || null,
        status: values.status,
      };
      const res = await createReorder(payload);
      created.value = normalizeReorder(res || payload);
      createdOpen.value = true;
      toast.success('Ordem de reposição criada para ' + payload.sku + '.');
    } catch (e) {
      toast.error('Não foi possível criar a ordem: ' + (e.message || 'erro desconhecido'));
    }
  });
}

async function resetForm() {
  if (!isDirty.value) return;
  const ok = await confirm({
    title: 'Limpar formulário',
    message: 'Descartar os dados preenchidos desta ordem? Esta ação não pode ser desfeita.',
    confirmLabel: 'Limpar',
    cancelLabel: 'Manter',
    danger: true,
  });
  if (!ok) return;
  form.reset();
  selectedSku.value = '';
  query.value = '';
  toast.info('Formulário limpo.');
}

function startAnother() {
  createdOpen.value = false;
  created.value = null;
  form.reset();
  selectedSku.value = '';
  query.value = '';
  toast.info('Pronto para uma nova ordem.');
}

/* ------------------------------------------------------------------ *
 * Helpers de formatação
 * ------------------------------------------------------------------ */
function formatNumber(value) {
  return format.formatNumber(value);
}

inventory.load();
</script>

<style scoped>
.rc-grid {
  display: grid;
  grid-template-columns: 1.55fr 1fr;
  gap: var(--ui-space-5);
  align-items: start;
}
.rc-main {
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-4);
  min-width: 0;
}
.rc-aside {
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-4);
  position: sticky;
  top: var(--ui-space-5);
}

/* ---------------- ProductPicker ---------------- */
.rc-picker {
  list-style: none;
  margin: 0 0 var(--ui-space-4);
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-2);
  max-height: 320px;
  overflow-y: auto;
}
.rc-picker-item {
  display: flex;
  align-items: center;
  gap: var(--ui-space-3);
  padding: var(--ui-space-3) var(--ui-space-4);
  border: 1px solid rgb(var(--ui-border));
  border-radius: var(--ui-radius-md);
  background: rgb(var(--ui-surface));
  cursor: pointer;
  transition: border-color 0.15s ease, background 0.15s ease;
}
.rc-picker-item:hover {
  border-color: rgb(var(--ui-border-strong));
  background: rgb(var(--ui-surface-2));
}
.rc-picker-item[data-selected='true'] {
  border-color: rgb(var(--ui-accent));
  background: rgb(var(--ui-accent) / 0.08);
}
.rc-picker-item[data-low='true'] {
  border-left: 3px solid rgb(var(--ui-warn));
}
.rc-picker-mark {
  width: 1.1rem;
  flex-shrink: 0;
  text-align: center;
  font-weight: 700;
  color: rgb(var(--ui-accent-strong));
}
.rc-picker-info {
  min-width: 0;
  flex: 1 1 auto;
}
.rc-picker-name {
  margin: 0;
  font-weight: 600;
  color: rgb(var(--ui-fg));
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.rc-picker-meta {
  margin: 2px 0 0;
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
  font-size: var(--ui-text-sm);
  color: rgb(var(--ui-muted));
}
.rc-picker-stock {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 4px;
  flex-shrink: 0;
}
.rc-picker-qty {
  margin: 0;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  color: rgb(var(--ui-fg));
}
.rc-picker-qty-unit {
  font-weight: 500;
  font-size: var(--ui-text-xs);
  color: rgb(var(--ui-muted));
}

/* ---------------- NumberInput (stepper) ---------------- */
.rc-stepper {
  display: flex;
  align-items: stretch;
  gap: var(--ui-space-2);
}
.rc-stepper-input {
  text-align: center;
  font-variant-numeric: tabular-nums;
  font-weight: 600;
}

/* ---------------- sugestões ---------------- */
.rc-suggest {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--ui-space-2);
  margin-top: var(--ui-space-3);
}
.rc-suggest-label {
  font-size: var(--ui-text-sm);
  color: rgb(var(--ui-muted));
  font-weight: 600;
}

/* ---------------- ações ---------------- */
.rc-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: var(--ui-space-3);
  flex-wrap: wrap;
}

/* ---------------- resumo (aside) ---------------- */
.rc-summary {
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-2);
}
.rc-summary-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ui-space-4);
  border-bottom: 1px solid rgb(var(--ui-border));
  padding-bottom: var(--ui-space-2);
}
.rc-summary-row:last-child {
  border-bottom: none;
  padding-bottom: 0;
}
.rc-summary-row dt {
  color: rgb(var(--ui-muted));
  font-size: var(--ui-text-sm);
}
.rc-summary-row dd {
  margin: 0;
  font-weight: 600;
  text-align: right;
}
.rc-summary-empty {
  color: rgb(var(--ui-muted));
  font-weight: 400;
  font-style: italic;
}
.rc-summary-qty {
  font-variant-numeric: tabular-nums;
  color: rgb(var(--ui-accent-strong));
}

/* ---------------- contexto do item ---------------- */
.rc-context {
  margin-top: var(--ui-space-4);
  padding: var(--ui-space-3) var(--ui-space-4);
  background: rgb(var(--ui-surface-2));
  border: 1px solid rgb(var(--ui-border));
  border-radius: var(--ui-radius-md);
}
.rc-context-title {
  margin: 0 0 var(--ui-space-2);
  font-size: var(--ui-text-xs);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  font-weight: 700;
  color: rgb(var(--ui-muted));
}
.rc-context-rows {
  display: flex;
  flex-wrap: wrap;
  gap: var(--ui-space-4);
}
.rc-context-pair {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.rc-context-k {
  font-size: var(--ui-text-xs);
  color: rgb(var(--ui-muted));
}
.rc-context-pair strong {
  font-variant-numeric: tabular-nums;
  color: rgb(var(--ui-fg));
}
.rc-context-warn {
  margin: var(--ui-space-2) 0 0;
  font-size: var(--ui-text-xs);
  color: rgb(var(--ui-warn));
  font-weight: 600;
}

/* ---------------- dicas ---------------- */
.rc-tips {
  margin: 0;
  padding-left: 1.1rem;
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-2);
  font-size: var(--ui-text-sm);
  color: rgb(var(--ui-muted));
}
.rc-tips strong {
  color: rgb(var(--ui-fg));
}

/* ---------------- recibo (modal) ---------------- */
.rc-receipt {
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-4);
}
.rc-receipt-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ui-space-3);
  flex-wrap: wrap;
}
.rc-receipt-id {
  margin: 0;
  color: rgb(var(--ui-muted));
}
.rc-receipt-list {
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-2);
}
.rc-receipt-row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--ui-space-4);
  border-bottom: 1px solid rgb(var(--ui-border));
  padding-bottom: 6px;
}
.rc-receipt-row:last-child {
  border-bottom: none;
}
.rc-receipt-row dt {
  color: rgb(var(--ui-muted));
  font-size: var(--ui-text-sm);
}
.rc-receipt-row dd {
  margin: 0;
  font-weight: 600;
  text-align: right;
}

/* ---------------- utilitários locais ---------------- */
.rc-mono {
  font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
  font-size: 0.92em;
}
.rc-dot {
  color: rgb(var(--ui-border-strong));
}

/* ---------------- responsivo ---------------- */
@media (max-width: 960px) {
  .rc-grid {
    grid-template-columns: 1fr;
  }
  .rc-aside {
    position: static;
  }
}
@media (max-width: 520px) {
  .rc-picker-item {
    flex-wrap: wrap;
  }
  .rc-picker-stock {
    flex-direction: row;
    align-items: center;
    gap: var(--ui-space-3);
    width: 100%;
    justify-content: space-between;
  }
  .rc-actions {
    flex-direction: column-reverse;
    align-items: stretch;
  }
}
</style>
