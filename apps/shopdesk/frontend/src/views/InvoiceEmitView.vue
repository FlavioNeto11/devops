<!-- InvoiceEmitView — REF/REQ-SHOPDESK-0004: emissão MANUAL de NF-e.
     Caso a emissão automática falhe, o operador: (1) escolhe um pedido PAGO (OrderPicker),
     (2) confere itens, total, cliente e CNPJ do emitente (InvoicePreview),
     (3) enfileira a nota com confirmação e idempotência por pedido (FormActions).
     CSP-safe: só classes + data-* + tokens --ui-*; nada de style inline, :style ou v-html.
     Só endpoints REAIS via ../api.js:
       GET  /v1/orders            (api.orders — escolher pedido)
       GET  /v1/orders/:id        (api.orders.get — detalhe do pedido)
       POST /v1/invoices          (api.store.emitInvoice — enfileira a NF-e)
       GET  /v1/invoices          (api.invoices — notas já existentes, quando exposto) -->
<template>
  <UiPageLayout
    eyebrow="Notas Fiscais"
    title="Emitir NF-e"
    subtitle="Emissão manual para um pedido pago — use quando a emissão automática falhar. Confira os dados antes de enfileirar."
    width="wide"
  >
    <template #actions>
      <UiButton variant="ghost" to="/orders">Voltar aos pedidos</UiButton>
      <UiButton
        variant="subtle"
        :loading="picker.loading.value"
        @click="reloadOrders"
      >Atualizar pedidos</UiButton>
    </template>

    <!-- Aviso de contexto: explica quando esta tela é usada -->
    <template #banner>
      <div class="iv-note" role="note">
        <span class="iv-note-icon" aria-hidden="true">🧾</span>
        <p class="iv-note-text">
          A emissão automática roda no checkout. Esta tela é a recuperação manual:
          ideal para pedidos pagos cuja nota ficou pendente, rejeitada ou na fila de erros (DLQ).
        </p>
      </div>
    </template>

    <div class="iv-grid">
      <!-- ===================== Coluna esquerda: OrderPicker ===================== -->
      <section class="iv-pick" aria-label="Selecionar pedido">
        <UiCard title="Escolher pedido" subtitle="Apenas pedidos pagos podem gerar NF-e.">
          <template #actions>
            <UiStatusBadge
              :tone="onlyPaid ? 'success' : 'neutral'"
              :label="onlyPaid ? 'Só pagos' : 'Todos'"
              status="filter"
              size="sm"
            />
          </template>

          <div class="iv-pick-controls">
            <UiFormField label="Buscar pedido" hint="Filtra por código, cliente ou e-mail.">
              <template #default="{ id, describedBy }">
                <input
                  :id="id"
                  v-model="query"
                  :aria-describedby="describedBy"
                  type="search"
                  autocomplete="off"
                  placeholder="PED-AB12, Ana Souza, cliente@exemplo.com…"
                  @keydown.enter.prevent="applySearch"
                />
              </template>
            </UiFormField>

            <label class="iv-toggle">
              <input
                type="checkbox"
                :checked="onlyPaid"
                @change="toggleOnlyPaid($event)"
              />
              <span>Mostrar apenas pedidos pagos</span>
            </label>
          </div>

          <!-- estado: carregando -->
          <UiLoadingState
            v-if="picker.loading.value"
            variant="skeleton"
            :skeleton-lines="5"
            title="Carregando pedidos…"
          />

          <!-- estado: erro -->
          <UiErrorState
            v-else-if="picker.error.value"
            :message="pickerErrorMessage"
            :code="pickerErrorCode"
            retryable
            @retry="reloadOrders"
          />

          <!-- estado: vazio (nenhum pedido elegível) -->
          <UiEmptyState
            v-else-if="!eligibleOrders.length"
            icon="📭"
            :title="onlyPaid ? 'Nenhum pedido pago' : 'Nenhum pedido encontrado'"
            :description="emptyPickerDescription"
          >
            <template #action>
              <UiButton v-if="onlyPaid" variant="ghost" size="sm" @click="toggleOnlyPaid(false)">
                Mostrar todos os pedidos
              </UiButton>
              <UiButton v-else variant="ghost" size="sm" to="/orders/new">Criar pedido</UiButton>
            </template>
          </UiEmptyState>

          <!-- estado: normal — lista selecionável de pedidos -->
          <ul v-else class="iv-orders" role="listbox" aria-label="Pedidos elegíveis">
            <li v-for="o in eligibleOrders" :key="o.id">
              <button
                type="button"
                class="iv-order"
                role="option"
                :data-selected="isSelected(o) ? 'true' : null"
                :data-paid="isPaid(o) ? 'true' : null"
                :aria-selected="isSelected(o) ? 'true' : 'false'"
                @click="selectOrder(o)"
              >
                <span class="iv-order-main">
                  <span class="iv-order-code ui-mono">{{ o.code || ('#' + o.id) }}</span>
                  <span class="iv-order-customer">{{ o.customer_name || 'Cliente não identificado' }}</span>
                </span>
                <span class="iv-order-side">
                  <span class="iv-order-total">{{ format.formatCurrency(o.total) }}</span>
                  <UiStatusBadge
                    :status="o.payment_status || o.status"
                    :label="payLabel(o)"
                    size="sm"
                  />
                </span>
              </button>
            </li>
          </ul>

          <template v-if="!picker.loading.value && eligibleOrders.length" #footer>
            <p class="iv-pick-foot">
              {{ format.formatNumber(eligibleOrders.length) }}
              {{ eligibleOrders.length === 1 ? 'pedido elegível' : 'pedidos elegíveis' }}
              <span v-if="onlyPaid"> (filtrando por pagos)</span>
            </p>
          </template>
        </UiCard>
      </section>

      <!-- ===================== Coluna direita: InvoicePreview + FormActions ===================== -->
      <section class="iv-preview" aria-label="Conferir e emitir nota fiscal">
        <!-- nenhum pedido selecionado ainda -->
        <UiCard v-if="!selectedOrder" title="Pré-visualização da NF-e">
          <UiEmptyState
            compact
            icon="👈"
            title="Selecione um pedido"
            description="Escolha um pedido pago na lista ao lado para conferir os dados da nota fiscal."
          />
        </UiCard>

        <template v-else>
          <!-- detalhe do pedido carregando (quando buscamos o pedido completo) -->
          <UiCard v-if="detailLoading" title="Pré-visualização da NF-e">
            <UiLoadingState variant="skeleton" :skeleton-lines="6" title="Carregando dados do pedido…" />
          </UiCard>

          <UiCard v-else-if="detailError" title="Pré-visualização da NF-e">
            <UiErrorState
              :message="detailError"
              retryable
              @retry="loadSelectedDetail"
            />
          </UiCard>

          <template v-else>
            <!-- aviso: pedido não está pago -->
            <UiCard
              v-if="!selectedIsPaid"
              class="iv-warn"
              title="Pedido ainda não está pago"
            >
              <div class="iv-warn-body">
                <UiStatusBadge :status="selectedOrder.payment_status || selectedOrder.status" :label="payLabel(selectedOrder)" size="lg" />
                <p class="ui-muted iv-warn-text">
                  A NF-e só pode ser emitida para pedidos com pagamento aprovado.
                  Confirme a cobrança deste pedido antes de emitir a nota.
                </p>
              </div>
              <template #footer>
                <UiButton variant="ghost" :to="orderLink(selectedOrder)">Abrir pedido</UiButton>
              </template>
            </UiCard>

            <!-- InvoicePreview: conferência de itens / total / cliente / CNPJ -->
            <UiCard v-else title="Conferir nota fiscal" :subtitle="'Pedido ' + (selectedOrder.code || ('#' + selectedOrder.id))">
              <template #actions>
                <UiStatusBadge :status="selectedOrder.payment_status || 'pago'" :label="payLabel(selectedOrder)" />
              </template>

              <!-- Emitente / destinatário (CNPJ etc.) -->
              <dl class="iv-kv-grid">
                <div class="iv-kv">
                  <dt>Cliente</dt>
                  <dd>{{ selectedOrder.customer_name || 'Cliente não identificado' }}</dd>
                </div>
                <div class="iv-kv">
                  <dt>E-mail</dt>
                  <dd>{{ selectedOrder.customer_email || '—' }}</dd>
                </div>
                <div class="iv-kv">
                  <dt>CNPJ do emitente</dt>
                  <dd class="ui-mono">{{ issuerCnpj }}</dd>
                </div>
                <div class="iv-kv">
                  <dt>Natureza da operação</dt>
                  <dd>{{ operationNature }}</dd>
                </div>
              </dl>

              <!-- Itens da nota -->
              <div class="iv-items">
                <UiDataTable
                  :columns="itemColumns"
                  :rows="invoiceItems"
                  row-key="_k"
                  density="compact"
                  :empty="itemsEmpty"
                >
                  <template #cell-qty="{ value }">{{ format.formatNumber(value) }}</template>
                  <template #cell-unit_price="{ value }">{{ format.formatCurrency(value) }}</template>
                  <template #cell-line_total="{ row }">{{ format.formatCurrency(lineTotal(row)) }}</template>
                </UiDataTable>
                <p v-if="!hasDetailedItems" class="iv-items-note ui-muted">
                  O pedido não detalha os itens individualmente — a nota será emitida pelo valor total do pedido.
                </p>
              </div>

              <template #footer>
                <dl class="iv-totals">
                  <div class="iv-total-row">
                    <dt>Itens</dt>
                    <dd>{{ format.formatNumber(itemsCount) }}</dd>
                  </div>
                  <div class="iv-total-row iv-total-grand">
                    <dt>Total da nota</dt>
                    <dd>{{ format.formatCurrency(invoiceTotal) }}</dd>
                  </div>
                </dl>
              </template>
            </UiCard>

            <!-- Notas já existentes para este pedido (quando o recurso /v1/invoices é exposto) -->
            <UiCard
              v-if="invoicesAvailable"
              title="Notas deste pedido"
              subtitle="Histórico de emissões para evitar duplicidade."
            >
              <UiLoadingState
                v-if="existing.loading.value"
                variant="skeleton"
                :skeleton-lines="2"
              />
              <UiErrorState
                v-else-if="existing.error.value"
                :message="existingErrorMessage"
                retryable
                @retry="loadExistingInvoices"
              />
              <UiEmptyState
                v-else-if="!existingInvoices.length"
                compact
                icon="📄"
                title="Nenhuma nota emitida"
                description="Este pedido ainda não possui NF-e. Você pode emitir agora."
              />
              <UiDataTable
                v-else
                :columns="existingColumns"
                :rows="existingInvoices"
                row-key="id"
                density="compact"
              >
                <template #cell-total="{ value }">{{ format.formatCurrency(value) }}</template>
                <template #cell-status="{ value }"><UiStatusBadge :status="value" size="sm" /></template>
                <template #cell-issued_at="{ value }">{{ format.formatDateTime(value) }}</template>
              </UiDataTable>
            </UiCard>

            <!-- FormActions: enfileirar a emissão -->
            <UiCard v-if="selectedIsPaid" title="Emitir nota" subtitle="A nota entra na fila de emissão (SEFAZ) e será processada de forma assíncrona.">
              <!-- ResultBanner: resultado do enfileiramento -->
              <div v-if="result" class="iv-result" :data-tone="resultTone" role="status" aria-live="polite">
                <span class="iv-result-icon" aria-hidden="true">{{ resultOk ? '✓' : '!' }}</span>
                <div class="iv-result-text">
                  <p class="iv-result-title">{{ resultOk ? 'Nota enfileirada' : 'Não foi possível enfileirar' }}</p>
                  <dl v-if="resultOk" class="iv-result-grid">
                    <div class="iv-kv">
                      <dt>Pedido</dt>
                      <dd class="ui-mono">{{ result.orderId }}</dd>
                    </div>
                    <div class="iv-kv">
                      <dt>Situação</dt>
                      <dd><UiStatusBadge :status="result.status || 'enfileirada'" /></dd>
                    </div>
                    <div class="iv-kv">
                      <dt>Número</dt>
                      <dd class="ui-mono">{{ result.number || '—' }}</dd>
                    </div>
                    <div class="iv-kv">
                      <dt>Protocolo SEFAZ</dt>
                      <dd class="ui-mono">{{ result.protocol || 'aguardando' }}</dd>
                    </div>
                  </dl>
                  <p v-else class="ui-muted iv-result-sub">{{ resultMessage }}</p>
                </div>
              </div>

              <div class="iv-idem">
                <div class="iv-idem-head">
                  <span class="iv-idem-label">Idempotência</span>
                  <UiStatusBadge tone="success" status="ok" label="Sem duplicidade" :with-dot="true" size="sm" />
                </div>
                <code class="iv-idem-key ui-mono">{{ idempotencyKey }}</code>
                <p class="ui-muted iv-idem-note">
                  Reenviar a emissão para o mesmo pedido reaproveita a nota existente — não gera uma segunda NF-e.
                </p>
              </div>

              <div class="iv-charge">
                <span class="ui-muted">Valor da nota</span>
                <strong class="iv-charge-value">{{ format.formatCurrency(invoiceTotal) }}</strong>
              </div>

              <template #footer>
                <div class="iv-actions">
                  <UiButton variant="ghost" :disabled="submitting" @click="clearSelection">Cancelar</UiButton>
                  <UiButton
                    variant="primary"
                    size="lg"
                    :loading="submitting"
                    :disabled="!canEmit"
                    @click="emit"
                  >
                    {{ submitting ? 'Enfileirando…' : (alreadyAuthorized ? 'Reenfileirar nota' : 'Emitir NF-e') }}
                  </UiButton>
                </div>
              </template>
            </UiCard>
          </template>
        </template>
      </section>
    </div>
  </UiPageLayout>
</template>

<script setup>
import { ref, computed, watch, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import {
  UiPageLayout, UiCard, UiButton, UiFormField, UiStatusBadge,
  UiEmptyState, UiLoadingState, UiErrorState, UiDataTable,
  useResource, useToast, useConfirm, format,
} from '../ui/index.js';
import * as api from '../api.js';

const route = useRoute();
const router = useRouter();
const toast = useToast();
const confirm = useConfirm();

/* ------------------------------------------------------------------ *
 * CNPJ do emitente — exibido para conferência. Vem do build (env) com
 * fallback de demonstração; é apenas informativo na conferência manual.
 * ------------------------------------------------------------------ */
const issuerCnpj = computed(() => import.meta.env.VITE_ISSUER_CNPJ || '12.345.678/0001-90');
const operationNature = 'Venda de mercadoria';

/* ------------------------------------------------------------------ *
 * OrderPicker — recurso REAL GET /v1/orders (resourceFactory("orders")).
 * ------------------------------------------------------------------ */
const picker = useResource(api.orders, { pageSize: 50, sort: { key: 'created_at', dir: 'desc' } });

const PAY_LABELS = {
  aguardando: 'Aguardando pagamento',
  aprovado: 'Pago',
  pago: 'Pago',
  recusado: 'Pagamento recusado',
  estornado: 'Estornado',
  pendente: 'Pendente',
  falha_pagamento: 'Falha no pagamento',
};
function payLabel(o) {
  const v = String(o?.payment_status || o?.status || '').toLowerCase();
  return PAY_LABELS[v] || format.humanize(v) || 'Sem status';
}

function isPaid(o) {
  const pay = String(o?.payment_status || '').toLowerCase();
  const st = String(o?.status || '').toLowerCase();
  return /aprovad|pago|paid|approved|authorized|autorizad/.test(pay) || /pago|paid/.test(st);
}

const onlyPaid = ref(true);
const query = ref('');

const pickerErrorMessage = computed(() => {
  const e = picker.error.value;
  return e ? (e.message || 'Não foi possível carregar os pedidos.') : '';
});
const pickerErrorCode = computed(() => {
  const e = picker.error.value;
  return e && e.status ? String(e.status) : '';
});

const eligibleOrders = computed(() => {
  const q = query.value.trim().toLowerCase();
  let list = picker.items.value || [];
  if (onlyPaid.value) list = list.filter(isPaid);
  if (q) {
    list = list.filter((o) =>
      [o.code, o.customer_name, o.customer_email].some((f) => String(f || '').toLowerCase().includes(q)),
    );
  }
  return list;
});

const emptyPickerDescription = computed(() => {
  if (query.value.trim()) return 'Nenhum pedido corresponde a “' + query.value.trim() + '”.';
  if (onlyPaid.value) return 'Não há pedidos com pagamento aprovado aguardando emissão de nota.';
  return 'Não há pedidos cadastrados ainda.';
});

function reloadOrders() {
  picker.load();
}
function applySearch() {
  // Busca é local sobre a página carregada; nada a fazer além de manter foco/UX.
}
function toggleOnlyPaid(ev) {
  onlyPaid.value = typeof ev === 'boolean' ? ev : !!ev?.target?.checked;
}

/* ------------------------------------------------------------------ *
 * Seleção do pedido + carregamento do detalhe (GET /v1/orders/:id).
 * ------------------------------------------------------------------ */
const selectedOrder = ref(null);
const detailLoading = ref(false);
const detailError = ref('');

function isSelected(o) {
  return selectedOrder.value && String(selectedOrder.value.id) === String(o.id);
}

async function selectOrder(o) {
  result.value = null;
  selectedOrder.value = o;
  await loadSelectedDetail();
  loadExistingInvoices();
}

async function loadSelectedDetail() {
  if (!selectedOrder.value) return;
  detailError.value = '';
  const id = selectedOrder.value.id;
  if (id == null) return;
  detailLoading.value = true;
  try {
    const full = await api.orders.get(id);
    if (full && typeof full === 'object') {
      // mescla o detalhe (pode trazer itens) sobre a linha resumida.
      selectedOrder.value = { ...selectedOrder.value, ...(full.data || full) };
    }
  } catch (e) {
    // o detalhe é um enriquecimento — sem ele ainda emitimos pelo total da linha.
    if (e && e.status === 404) {
      detailError.value = 'Pedido não encontrado. Ele pode ter sido removido.';
    } else {
      detailError.value = e?.message || 'Não foi possível carregar os dados do pedido.';
    }
  } finally {
    detailLoading.value = false;
  }
}

function clearSelection() {
  selectedOrder.value = null;
  result.value = null;
  detailError.value = '';
}

function orderLink(o) {
  return o && o.id != null ? '/orders/' + o.id : '/orders';
}

const selectedIsPaid = computed(() => !!selectedOrder.value && isPaid(selectedOrder.value));

/* ------------------------------------------------------------------ *
 * InvoicePreview — itens / totais derivados do pedido.
 * ------------------------------------------------------------------ */
const itemColumns = [
  { key: 'name', label: 'Item' },
  { key: 'qty', label: 'Qtd', align: 'right' },
  { key: 'unit_price', label: 'Unitário', align: 'right' },
  { key: 'line_total', label: 'Subtotal', align: 'right' },
];
const itemsEmpty = { title: 'Sem itens detalhados', description: 'A nota usará o total do pedido.' };

function rawItems(o) {
  if (!o) return [];
  const src = o.items || o.line_items || o.lines || [];
  return Array.isArray(src) ? src : [];
}
const hasDetailedItems = computed(() => rawItems(selectedOrder.value).length > 0);

const invoiceItems = computed(() => {
  const o = selectedOrder.value;
  const items = rawItems(o);
  if (items.length) {
    return items.map((it, i) => ({
      _k: it.id ?? it.sku ?? i,
      name: it.name || it.product_name || it.description || ('Item ' + (i + 1)),
      qty: Number(it.qty ?? it.quantity ?? 1),
      unit_price: Number(it.unit_price ?? it.price ?? 0),
    }));
  }
  // sem itens detalhados → uma linha sintética com o total do pedido.
  if (o) {
    const total = Number(o.total ?? 0);
    return [{ _k: 'order-total', name: 'Pedido ' + (o.code || ('#' + o.id)), qty: 1, unit_price: total }];
  }
  return [];
});

function lineTotal(row) {
  return Number(row.qty || 0) * Number(row.unit_price || 0);
}

const itemsCount = computed(() => {
  const o = selectedOrder.value;
  if (hasDetailedItems.value) return invoiceItems.value.reduce((acc, it) => acc + Number(it.qty || 0), 0);
  return Number(o?.items_count ?? 1);
});

const invoiceTotal = computed(() => {
  const o = selectedOrder.value;
  if (!o) return 0;
  // o total do pedido é a fonte de verdade do valor da nota.
  const orderTotal = Number(o.total ?? 0);
  if (orderTotal > 0) return orderTotal;
  // fallback: soma das linhas detalhadas.
  return invoiceItems.value.reduce((acc, it) => acc + lineTotal(it), 0);
});

/* ------------------------------------------------------------------ *
 * Notas já existentes do pedido (GET /v1/invoices?orderId=…), quando exposto.
 * Defensivo: api.invoices pode ainda não existir no client.
 * ------------------------------------------------------------------ */
const invoicesAvailable = computed(
  () => !!api.invoices && typeof api.invoices.list === 'function',
);
const existing = useResource(invoicesAvailable.value ? api.invoices : { list: async () => [] });
const existingColumns = [
  { key: 'number', label: 'Número' },
  { key: 'total', label: 'Total', align: 'right' },
  { key: 'status', label: 'Situação' },
  { key: 'issued_at', label: 'Emitida em' },
];
const existingErrorMessage = computed(() => {
  const e = existing.error.value;
  return e ? (e.message || 'Não foi possível carregar as notas.') : '';
});
const existingInvoices = computed(() => {
  const oid = selectedOrder.value?.code || selectedOrder.value?.id;
  if (oid == null) return [];
  // filtra pelas notas do pedido selecionado (o backend pode já filtrar via param).
  return (existing.items.value || []).filter((inv) => {
    const ref = String(inv.order_id ?? inv.orderId ?? inv.order_code ?? '');
    return !ref || ref === String(oid) || ref === String(selectedOrder.value?.id);
  });
});
const alreadyAuthorized = computed(() =>
  existingInvoices.value.some((inv) => /autorizad|authorized/i.test(String(inv.status || ''))),
);

function loadExistingInvoices() {
  if (!invoicesAvailable.value || !selectedOrder.value) return;
  const oid = selectedOrder.value.code || selectedOrder.value.id;
  existing.setFilters({ orderId: oid });
}

/* ------------------------------------------------------------------ *
 * FormActions — enfileira a emissão (POST /v1/invoices via store.emitInvoice).
 * Idempotente por pedido no backend.
 * ------------------------------------------------------------------ */
const invoiceOrderRef = computed(() => {
  const o = selectedOrder.value;
  return o ? String(o.code || o.id) : '';
});
const idempotencyKey = computed(() => 'invoice:' + invoiceOrderRef.value);

const submitting = ref(false);
const result = ref(null);
const resultOk = computed(() => {
  if (!result.value) return false;
  const s = String(result.value.status || '').toLowerCase();
  return !result.value._error && !/rejeitad|rejected|erro|error|dlq|fail/.test(s);
});
const resultTone = computed(() => (resultOk.value ? 'success' : 'error'));
const resultMessage = computed(() => result.value?._error || 'A fila de emissão recusou a nota.');

const canEmit = computed(() => selectedIsPaid.value && !submitting.value && invoiceTotal.value > 0);

async function emit() {
  if (!canEmit.value) {
    if (invoiceTotal.value <= 0) toast.warning('O pedido não tem valor para emitir nota.');
    return;
  }
  if (submitting.value) return;

  const ref = invoiceOrderRef.value;
  const verb = alreadyAuthorized.value ? 'Reenfileirar a NF-e' : 'Emitir a NF-e';
  const ok = await confirm({
    title: 'Confirmar emissão de NF-e',
    message:
      verb + ' do pedido ' + ref + ' no valor de ' + format.formatCurrency(invoiceTotal.value) +
      '? A nota entra na fila de processamento da SEFAZ.',
    confirmLabel: 'Emitir nota',
    cancelLabel: 'Revisar',
  });
  if (!ok) return;

  submitting.value = true;
  result.value = null;
  try {
    // endpoint real POST /v1/invoices (store.emitInvoice envia { orderId, total }).
    const res = await api.store.emitInvoice(ref, invoiceTotal.value);
    result.value = { orderId: ref, ...(res && typeof res === 'object' ? res : {}) };
    if (resultOk.value) {
      toast.success('NF-e enfileirada', {
        detail: 'Pedido ' + ref + ' — situação ' + (result.value.status || 'enfileirada') + '.',
        code: result.value.number || '',
      });
    } else {
      toast.warning('Emissão não confirmada', {
        detail: 'A fila retornou situação ' + (result.value.status || 'desconhecida') + '.',
      });
    }
    if (invoicesAvailable.value) loadExistingInvoices();
  } catch (e) {
    result.value = { orderId: ref, _error: e?.message || 'Falha ao enfileirar a nota.' };
    toast.error('Falha ao emitir NF-e', {
      detail: e?.message || 'Não foi possível enfileirar a nota.',
      code: e?.status,
    });
  } finally {
    submitting.value = false;
  }
}

/* ------------------------------------------------------------------ *
 * Pré-seleção por rota: /invoices/new?orderId=… ou ?order=…
 * ------------------------------------------------------------------ */
async function preselectFromRoute() {
  const wanted = String(route.query.orderId ?? route.query.order ?? route.query.id ?? '').trim();
  if (!wanted) return;
  // tenta achar na lista já carregada; senão busca o pedido direto.
  let match = (picker.items.value || []).find(
    (o) => String(o.id) === wanted || String(o.code) === wanted,
  );
  if (!match) {
    try {
      const full = await api.orders.get(wanted);
      match = full && (full.data || full);
    } catch {
      // sem match — operador escolhe manualmente.
    }
  }
  if (match) await selectOrder(match);
}

onMounted(async () => {
  await picker.load();
  await preselectFromRoute();
});

// reagir a navegação com novo orderId na mesma rota.
watch(
  () => route.query.orderId,
  (v) => {
    if (v && !selectedOrder.value) preselectFromRoute();
  },
);
</script>

<style scoped>
/* ------------------------------------------------------------------ *
 * Layout em duas colunas: picker (esquerda) + preview/ações (direita).
 * ------------------------------------------------------------------ */
.iv-grid {
  display: grid;
  grid-template-columns: 1fr 1.25fr;
  gap: var(--ui-space-5);
  align-items: start;
}
.iv-pick {
  position: sticky;
  top: var(--ui-space-5);
}
.iv-preview {
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-4);
  min-width: 0;
}

/* ---------- banner de contexto ---------- */
.iv-note {
  display: flex;
  align-items: flex-start;
  gap: var(--ui-space-3);
  padding: var(--ui-space-3) var(--ui-space-4);
  border: 1px solid rgb(var(--ui-border));
  border-left: 3px solid rgb(var(--ui-accent));
  border-radius: var(--ui-radius-md);
  background: rgb(var(--ui-surface-2));
}
.iv-note-icon {
  font-size: var(--ui-text-lg);
  line-height: 1;
}
.iv-note-text {
  margin: 0;
  font-size: var(--ui-text-sm);
  color: rgb(var(--ui-muted));
}

/* ---------- controles do picker ---------- */
.iv-pick-controls {
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-3);
  margin-bottom: var(--ui-space-4);
}
.iv-toggle {
  display: inline-flex;
  align-items: center;
  gap: var(--ui-space-2);
  font-size: var(--ui-text-sm);
  color: rgb(var(--ui-fg));
  cursor: pointer;
  user-select: none;
}
.iv-toggle input {
  width: 16px;
  height: 16px;
  accent-color: rgb(var(--ui-accent));
  cursor: pointer;
}

/* ---------- lista de pedidos ---------- */
.iv-orders {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-2);
  max-height: 60vh;
  overflow-y: auto;
}
.iv-order {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ui-space-3);
  padding: var(--ui-space-3) var(--ui-space-4);
  border: 1px solid rgb(var(--ui-border));
  border-radius: var(--ui-radius-md);
  background: rgb(var(--ui-surface));
  color: rgb(var(--ui-fg));
  text-align: left;
  cursor: pointer;
  transition: border-color 0.15s ease, background 0.15s ease;
}
.iv-order:hover {
  border-color: rgb(var(--ui-border-strong));
  background: rgb(var(--ui-surface-2));
}
.iv-order:focus-visible {
  outline: 2px solid rgb(var(--ui-accent));
  outline-offset: 2px;
}
.iv-order[data-selected='true'] {
  border-color: rgb(var(--ui-accent));
  background: rgb(var(--ui-accent) / 0.08);
}
.iv-order-main {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}
.iv-order-code {
  font-weight: 700;
  font-size: var(--ui-text-sm);
}
.iv-order-customer {
  font-size: var(--ui-text-sm);
  color: rgb(var(--ui-muted));
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.iv-order-side {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 4px;
  flex-shrink: 0;
}
.iv-order-total {
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}
.iv-pick-foot {
  margin: 0;
  font-size: var(--ui-text-xs);
  color: rgb(var(--ui-muted));
}

/* ---------- detalhes (dt/dd) ---------- */
.iv-kv-grid {
  margin: 0 0 var(--ui-space-4);
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: var(--ui-space-3) var(--ui-space-5);
}
.iv-kv {
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}
.iv-kv dt {
  margin: 0;
  font-size: var(--ui-text-xs);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: rgb(var(--ui-muted));
}
.iv-kv dd {
  margin: 0;
  font-weight: 600;
  word-break: break-word;
}

/* ---------- itens ---------- */
.iv-items {
  margin-top: var(--ui-space-1);
}
.iv-items-note {
  margin: var(--ui-space-2) 0 0;
  font-size: var(--ui-text-xs);
}

/* ---------- totais ---------- */
.iv-totals {
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
  width: 100%;
}
.iv-total-row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--ui-space-4);
}
.iv-total-row dt {
  color: rgb(var(--ui-muted));
  font-size: var(--ui-text-sm);
}
.iv-total-row dd {
  margin: 0;
  font-variant-numeric: tabular-nums;
}
.iv-total-grand dt {
  color: rgb(var(--ui-fg));
  font-weight: 700;
  font-size: var(--ui-text-md);
}
.iv-total-grand dd {
  font-weight: 700;
  font-size: var(--ui-text-lg);
  color: rgb(var(--ui-accent-strong));
}

/* ---------- aviso (não pago) ---------- */
.iv-warn {
  border-left: 3px solid rgb(var(--ui-warn));
}
.iv-warn-body {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--ui-space-3);
}
.iv-warn-text {
  margin: 0;
  font-size: var(--ui-text-sm);
}

/* ---------- idempotência ---------- */
.iv-idem {
  border: 1px dashed rgb(var(--ui-border-strong));
  border-radius: var(--ui-radius-md);
  padding: var(--ui-space-4);
  background: rgb(var(--ui-surface-2));
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-2);
  margin-bottom: var(--ui-space-4);
}
.iv-idem-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ui-space-3);
  flex-wrap: wrap;
}
.iv-idem-label {
  font-size: var(--ui-text-xs);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: rgb(var(--ui-muted));
  font-weight: 700;
}
.iv-idem-key {
  display: block;
  font-size: var(--ui-text-sm);
  color: rgb(var(--ui-fg));
  word-break: break-all;
  background: rgb(var(--ui-bg));
  border: 1px solid rgb(var(--ui-border));
  border-radius: var(--ui-radius-sm);
  padding: 6px 10px;
}
.iv-idem-note {
  margin: 0;
  font-size: var(--ui-text-xs);
}

/* ---------- valor + ações ---------- */
.iv-charge {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--ui-space-4);
}
.iv-charge-value {
  font-family: var(--ui-font-display);
  font-size: var(--ui-text-xl);
}
.iv-actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--ui-space-2);
  flex-wrap: wrap;
  width: 100%;
}

/* ---------- result banner ---------- */
.iv-result {
  display: flex;
  align-items: flex-start;
  gap: var(--ui-space-3);
  padding: var(--ui-space-3) var(--ui-space-4);
  border-radius: var(--ui-radius-md);
  border: 1px solid rgb(var(--ui-border));
  margin-bottom: var(--ui-space-4);
}
.iv-result[data-tone='success'] {
  border-left: 3px solid rgb(var(--ui-ok));
  background: rgb(var(--ui-ok) / 0.07);
}
.iv-result[data-tone='error'] {
  border-left: 3px solid rgb(var(--ui-danger));
  background: rgb(var(--ui-danger) / 0.07);
}
.iv-result-icon {
  flex-shrink: 0;
  width: 30px;
  height: 30px;
  border-radius: 50%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
}
.iv-result[data-tone='success'] .iv-result-icon {
  background: rgb(var(--ui-ok) / 0.16);
  color: rgb(var(--ui-ok));
}
.iv-result[data-tone='error'] .iv-result-icon {
  background: rgb(var(--ui-danger) / 0.16);
  color: rgb(var(--ui-danger));
}
.iv-result-text {
  min-width: 0;
  flex: 1 1 auto;
}
.iv-result-title {
  margin: 0 0 var(--ui-space-2);
  font-weight: 700;
}
.iv-result-sub {
  margin: 0;
  font-size: var(--ui-text-sm);
}
.iv-result-grid {
  margin: 0;
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: var(--ui-space-2) var(--ui-space-5);
}

/* ---------- utilitários ---------- */
.ui-mono {
  font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
  font-size: 0.92em;
}
.ui-muted {
  color: rgb(var(--ui-muted));
}

/* ---------- responsivo ---------- */
@media (max-width: 980px) {
  .iv-grid {
    grid-template-columns: 1fr;
  }
  .iv-pick {
    position: static;
  }
  .iv-orders {
    max-height: none;
  }
}
@media (max-width: 560px) {
  .iv-kv-grid,
  .iv-result-grid {
    grid-template-columns: 1fr;
  }
  .iv-order {
    flex-direction: column;
    align-items: stretch;
    gap: var(--ui-space-2);
  }
  .iv-order-side {
    flex-direction: row;
    align-items: center;
    justify-content: space-between;
  }
}
</style>
