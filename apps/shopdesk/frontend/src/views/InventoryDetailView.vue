<!--
  InventoryDetailView — Posição detalhada de um SKU em estoque (REQ-SHOPDESK-0005).
  DetailHeader (título + ações), banner de situação, FieldGrid (ficha dt/dd da entidade),
  KPIs (quantidade / ponto de reposição / cobertura / movimentações), MovementHistory
  (timeline das reposições do SKU com saldo corrente) e ReorderButton (atalho que cria
  uma reposição via /v1/reorders, com modal + confirmação).

  100% sobre o kit ui-vue (tokens --ui-*), CSP-safe (sem style inline / :style / v-html),
  com TODOS os estados (loading/empty/error/normal), ação destrutiva via useConfirm,
  toasts em sucesso/erro e a11y (labels, aria-*, foco visível, navegação por teclado).

  Endpoints REAIS (api.js → resourceFactory):
    - api.inventory (/v1/inventory)  → ficha do SKU
    - api.reorders  (/v1/reorders)   → histórico de movimentação + criar reposição
    - api.products  (/v1/products)    → enriquece com o produto (preço/categoria) quando casa o SKU
  Recurso ausente ⇒ degradação graciosa (erro claro / histórico vazio honesto), nunca tela em branco.
  Todos os links/rotas apontam para o DOMÍNIO de inventário (/inventory, /inventory/:id/adjust),
  produtos (/products/:id) e reposições (/reorders, /reorders/:id).
-->
<template>
  <UiPageLayout
    width="wide"
    eyebrow="Estoque"
    :title="pageTitle"
    :subtitle="pageSubtitle"
    :loading="loading"
    loading-message="Carregando posição de estoque…"
    :error="loadError"
    @retry="load"
  >
    <!-- DetailHeader — ações -->
    <template #actions>
      <UiButton variant="ghost" to="/inventory">Voltar ao estoque</UiButton>
      <UiButton
        variant="ghost"
        :loading="refreshing"
        :disabled="!item"
        @click="refresh"
      >Atualizar</UiButton>
      <UiButton
        v-if="item"
        variant="subtle"
        :to="'/inventory/' + itemId + '/adjust'"
      >Ajustar estoque</UiButton>
      <UiButton
        variant="primary"
        :disabled="!item"
        @click="openReorder"
      >Repor estoque</UiButton>
    </template>

    <!-- Banner de situação (ReorderButton em destaque quando abaixo do ponto) -->
    <template #banner>
      <div
        v-if="item"
        class="iv-banner"
        :data-tone="bannerTone"
        role="status"
      >
        <div class="iv-banner-main">
          <UiStatusBadge :status="situation" size="lg" :label="situationLabel" />
          <span class="iv-banner-text">{{ bannerMessage }}</span>
        </div>
        <span class="iv-banner-meta">Atualizado {{ fmtDateTime(item.updated_at) }}</span>
      </div>
    </template>

    <!-- CONTEÚDO (normal) -->
    <template v-if="item">
      <!-- KPIs -->
      <section class="iv-metrics" aria-label="Resumo da posição de estoque">
        <UiMetricCard
          label="Em estoque"
          :value="fmtNumber(item.quantity)"
          :tone="quantityTone"
          :hint="quantityHint"
        />
        <UiMetricCard
          label="Ponto de reposição"
          :value="hasReorderPoint ? fmtNumber(item.reorder_point) : '—'"
          tone="neutral"
          :hint="hasReorderPoint ? 'dispara reposição abaixo disso' : 'não definido'"
        />
        <UiMetricCard
          label="Cobertura"
          :value="coverageLabel"
          :tone="coverageTone"
          :hint="coverageHint"
        />
        <UiMetricCard
          label="Reposições"
          :value="fmtNumber(movements.length)"
          :tone="movements.length ? 'success' : 'neutral'"
          hint="pedidos de reposição do SKU"
        />
      </section>

      <div class="iv-grid">
        <!-- COLUNA PRINCIPAL -->
        <div class="iv-col iv-col-main">
          <!-- FieldGrid — ficha do SKU (detalhe dt/dd, editable:false) -->
          <UiCard title="Ficha do SKU" subtitle="Posição detalhada do item em estoque">
            <template #actions>
              <UiStatusBadge :status="situation" :label="situationLabel" />
            </template>
            <dl class="iv-dl">
              <div class="iv-dl-row">
                <dt>SKU</dt>
                <dd class="iv-copy">
                  <span class="ui-mono">{{ item.sku || '—' }}</span>
                  <UiButton
                    v-if="item.sku"
                    variant="ghost"
                    size="sm"
                    @click="copy(item.sku, 'SKU')"
                  >Copiar</UiButton>
                </dd>
              </div>
              <div class="iv-dl-row">
                <dt>Produto</dt>
                <dd>
                  <RouterLink v-if="linkedProductId != null" :to="'/products/' + linkedProductId" class="iv-link">
                    {{ item.product_name || '—' }}
                  </RouterLink>
                  <span v-else>{{ item.product_name || '—' }}</span>
                </dd>
              </div>
              <div class="iv-dl-row">
                <dt>Quantidade</dt>
                <dd>
                  <strong class="iv-qty">{{ fmtNumber(item.quantity) }}</strong>
                  <span class="ui-muted iv-unit"> unidade(s)</span>
                </dd>
              </div>
              <div class="iv-dl-row">
                <dt>Ponto de reposição</dt>
                <dd>{{ hasReorderPoint ? fmtNumber(item.reorder_point) : '—' }}</dd>
              </div>
              <div class="iv-dl-row">
                <dt>Local</dt>
                <dd>
                  <span v-if="item.location" class="ui-mono">{{ item.location }}</span>
                  <span v-else class="ui-muted">não informado</span>
                </dd>
              </div>
              <div v-if="linkedProduct && linkedProduct.price != null" class="iv-dl-row">
                <dt>Valor em estoque</dt>
                <dd>
                  <strong>{{ fmtCurrency(stockValue) }}</strong>
                  <span class="ui-muted iv-unit"> ({{ fmtCurrency(linkedProduct.price) }}/un.)</span>
                </dd>
              </div>
              <div class="iv-dl-row">
                <dt>Situação</dt>
                <dd><UiStatusBadge :status="situation" :label="situationLabel" /></dd>
              </div>
              <div class="iv-dl-row">
                <dt>Código interno</dt>
                <dd class="ui-mono">{{ '#' + (item.id != null ? item.id : '—') }}</dd>
              </div>
              <div class="iv-dl-row">
                <dt>Atualizado em</dt>
                <dd>{{ fmtDateTime(item.updated_at) }}</dd>
              </div>
            </dl>
            <template #footer>
              <div class="iv-foot-row">
                <span class="ui-muted">{{ gaugeCaption }}</span>
                <div
                  class="iv-gauge"
                  role="img"
                  :aria-label="gaugeAria"
                  :data-tone="quantityTone"
                >
                  <span class="iv-gauge-fill" :data-fill="gaugeBucket" />
                  <span
                    v-if="hasReorderPoint"
                    class="iv-gauge-mark"
                    :data-pos="reorderMarkBucket"
                    aria-hidden="true"
                  />
                </div>
              </div>
            </template>
          </UiCard>

          <!-- MovementHistory — histórico de movimentação (reposições do SKU, saldo corrente) -->
          <UiCard title="Histórico de movimentação" :subtitle="movementsSubtitle">
            <template #actions>
              <UiButton
                variant="subtle"
                size="sm"
                :loading="movementsLoading"
                @click="loadMovements"
              >Recarregar</UiButton>
            </template>

            <UiLoadingState v-if="movementsLoading" variant="skeleton" :skeleton-lines="4" />
            <UiErrorState
              v-else-if="movementsError"
              :message="movementsError"
              @retry="loadMovements"
            />
            <ol v-else-if="movements.length" class="iv-timeline">
              <li
                v-for="mv in movements"
                :key="mv.key"
                class="iv-tl-item"
                :data-tone="mv.tone"
              >
                <span class="iv-tl-dot" aria-hidden="true" />
                <div class="iv-tl-body">
                  <div class="iv-tl-head">
                    <RouterLink
                      v-if="mv.reorderId != null"
                      :to="'/reorders/' + mv.reorderId"
                      class="iv-tl-title iv-link"
                    >{{ mv.title }}</RouterLink>
                    <span v-else class="iv-tl-title">{{ mv.title }}</span>
                    <UiStatusBadge v-if="mv.status" :status="mv.status" size="sm" />
                  </div>
                  <p v-if="mv.detail" class="iv-tl-detail">{{ mv.detail }}</p>
                  <time v-if="mv.at" class="iv-tl-time">{{ fmtDateTime(mv.at) }}</time>
                </div>
              </li>
            </ol>
            <UiEmptyState
              v-else
              title="Sem movimentação registrada"
              description="Este SKU ainda não teve reposições. Crie a primeira para começar o histórico de movimentação."
              icon="package"
            >
              <template #action>
                <UiButton variant="subtle" @click="openReorder">Repor estoque</UiButton>
              </template>
            </UiEmptyState>
          </UiCard>
        </div>

        <!-- COLUNA LATERAL -->
        <div class="iv-col iv-col-side">
          <!-- Recomendação de reposição -->
          <UiCard title="Reposição" subtitle="Sugestão baseada no ponto de reposição">
            <dl class="iv-dl">
              <div class="iv-dl-row iv-dl-row--tight">
                <dt>Recomendação</dt>
                <dd>
                  <UiStatusBadge
                    :status="needsReorder ? 'baixo' : 'ok'"
                    :label="needsReorder ? 'Repor agora' : 'Sem ação'"
                  />
                </dd>
              </div>
              <div class="iv-dl-row iv-dl-row--tight">
                <dt>Déficit</dt>
                <dd>{{ deficit > 0 ? fmtNumber(deficit) + ' un.' : '—' }}</dd>
              </div>
              <div class="iv-dl-row iv-dl-row--tight">
                <dt>Qtd. sugerida</dt>
                <dd>{{ suggestedQty > 0 ? fmtNumber(suggestedQty) + ' un.' : '—' }}</dd>
              </div>
              <div v-if="pendingCount" class="iv-dl-row iv-dl-row--tight">
                <dt>Em trânsito</dt>
                <dd>{{ fmtNumber(pendingQty) }} un. · {{ pendingCount }} pedido(s)</dd>
              </div>
            </dl>
            <p class="iv-side-note ui-muted">{{ reorderAdvice }}</p>
            <template #footer>
              <UiButton variant="primary" block @click="openReorder">Repor estoque</UiButton>
            </template>
          </UiCard>

          <!-- Pedidos de reposição deste SKU -->
          <UiCard title="Pedidos de reposição" subtitle="Solicitações vinculadas ao SKU">
            <template #actions>
              <UiButton variant="ghost" size="sm" to="/reorders">Ver todas</UiButton>
            </template>
            <UiLoadingState v-if="movementsLoading" variant="skeleton" :skeleton-lines="3" />
            <UiDataTable
              v-else
              :columns="reorderColumns"
              :rows="movements"
              row-key="key"
              density="compact"
              clickable-rows
              :empty="{
                title: 'Nenhuma reposição',
                description: 'Sem pedidos de reposição para este SKU.',
              }"
              @row-click="openReorderRow"
            >
              <template #cell-quantity="{ value }">{{ fmtNumber(value) }}</template>
              <template #cell-status="{ value }"><UiStatusBadge :status="value" size="sm" /></template>
              <template #empty-action>
                <UiButton variant="subtle" size="sm" @click="openReorder">Repor estoque</UiButton>
              </template>
            </UiDataTable>
          </UiCard>
        </div>
      </div>
    </template>

    <!-- EMPTY — SKU não encontrado (não é erro de rede) -->
    <template v-else-if="!loading && !loadError">
      <UiEmptyState
        title="Item de estoque não encontrado"
        description="Não localizamos este SKU no estoque. Ele pode ter sido removido ou o endereço está incorreto."
        icon="search"
      >
        <template #action>
          <UiButton to="/inventory">Ver todo o estoque</UiButton>
        </template>
      </UiEmptyState>
    </template>

    <!-- MODAL de reposição (ReorderButton → formulário) -->
    <UiModal v-model:open="reorderOpen" title="Repor estoque" width="sm" :persistent="reorderBusy">
      <form class="iv-form" @submit.prevent="submitReorder">
        <p class="ui-muted iv-form-intro">
          Cria um pedido de reposição para
          <strong>{{ item ? item.product_name : '' }}</strong>
          ({{ item ? item.sku : '' }}).
        </p>
        <UiFormField
          label="Quantidade a repor"
          required
          :error="reorderErrors.quantity"
          hint="Número de unidades a solicitar ao fornecedor."
        >
          <template #default="{ id, describedBy, hasError }">
            <input
              :id="id"
              v-model="reorderForm.quantity"
              :aria-describedby="describedBy"
              :aria-invalid="hasError ? 'true' : null"
              type="number"
              min="1"
              step="1"
              inputmode="numeric"
            />
          </template>
        </UiFormField>
        <UiFormField
          label="Fornecedor"
          :error="reorderErrors.supplier"
          hint="Opcional — quem atenderá a reposição."
        >
          <template #default="{ id, describedBy }">
            <input
              :id="id"
              v-model="reorderForm.supplier"
              :aria-describedby="describedBy"
              type="text"
              placeholder="Ex.: Fornecedor Vale"
            />
          </template>
        </UiFormField>
      </form>
      <template #footer>
        <UiButton variant="ghost" :disabled="reorderBusy" @click="reorderOpen = false">Cancelar</UiButton>
        <UiButton variant="primary" :loading="reorderBusy" @click="submitReorder">Solicitar reposição</UiButton>
      </template>
    </UiModal>
  </UiPageLayout>
</template>

<script setup>
import { ref, reactive, computed, watch, onMounted } from 'vue';
import { useRoute, useRouter, RouterLink } from 'vue-router';
import {
  UiPageLayout,
  UiCard,
  UiMetricCard,
  UiStatusBadge,
  UiDataTable,
  UiButton,
  UiModal,
  UiFormField,
  UiEmptyState,
  UiLoadingState,
  UiErrorState,
  useToast,
  useConfirm,
  validators,
  format,
  resolveTone,
} from '../ui/index.js';
import * as api from '../api.js';

const route = useRoute();
const router = useRouter();
const toast = useToast();
const confirm = useConfirm();

const fmtNumber = (v) => format.formatNumber(v);
const fmtDateTime = (v) => format.formatDateTime(v);
const fmtCurrency = (v) => format.formatCurrency(v);

// ---- estado base ----
const item = ref(null);
const loading = ref(false);
const loadError = ref('');
const refreshing = ref(false);

const linkedProduct = ref(null); // produto correlacionado pelo SKU (enriquece a ficha)

const movements = ref([]);
const movementsLoading = ref(false);
const movementsError = ref('');

const reorderOpen = ref(false);
const reorderBusy = ref(false);
const reorderForm = reactive({ quantity: '', supplier: '' });
const reorderErrors = reactive({ quantity: '', supplier: '' });

const itemId = computed(() => route.params.id);

// ---- acesso à API (recursos reais; degradação graciosa) ----------------------
function inventoryResource() {
  return api.inventory && typeof api.inventory.get === 'function' ? api.inventory : null;
}
function reorderResource() {
  return api.reorders && typeof api.reorders.list === 'function' ? api.reorders : null;
}
function productResource() {
  return api.products && typeof api.products.list === 'function' ? api.products : null;
}

function unwrap(r) {
  return r && typeof r === 'object' && 'data' in r ? r.data : r;
}
function unwrapList(r) {
  if (Array.isArray(r)) return r;
  if (r && Array.isArray(r.data)) return r.data;
  return [];
}

// ---- copiar (clipboard com fallback honesto) --------------------------------
async function copy(value, what) {
  const text = String(value == null ? '' : value);
  if (!text) return;
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
      toast.success('Copiado: ' + (what || 'valor') + '.');
      return;
    }
    throw new Error('clipboard indisponível');
  } catch {
    toast.info('Copie manualmente o ' + (what || 'valor') + ': ' + text);
  }
}

// ---- carregamento -----------------------------------------------------------
async function load() {
  loading.value = true;
  loadError.value = '';
  const inv = inventoryResource();
  if (!inv) {
    loading.value = false;
    loadError.value = 'Recurso de estoque indisponível. O endpoint /v1/inventory não está exposto no cliente.';
    return;
  }
  try {
    item.value = unwrap(await inv.get(itemId.value));
    if (item.value) {
      loadMovements();
      loadLinkedProduct();
    }
  } catch (e) {
    if (e && e.status === 404) {
      item.value = null; // estado "não encontrado"
    } else {
      loadError.value = (e && e.message) || 'Falha ao carregar a posição de estoque.';
    }
  } finally {
    loading.value = false;
  }
}

async function refresh() {
  if (!item.value) return;
  refreshing.value = true;
  const inv = inventoryResource();
  try {
    if (inv) item.value = unwrap(await inv.get(itemId.value));
    await Promise.all([loadMovements(), loadLinkedProduct()]);
    toast.success('Posição de estoque atualizada.');
  } catch (e) {
    toast.error('Não foi possível atualizar.', { detail: (e && e.message) || '' });
  } finally {
    refreshing.value = false;
  }
}

// enriquece a ficha com o produto do mesmo SKU (preço/valor em estoque, link p/ /products/:id).
// Vínculo HONESTO: só casa quando o SKU é idêntico — sem isso, não atribuímos produto.
async function loadLinkedProduct() {
  linkedProduct.value = null;
  const prods = productResource();
  const sku = item.value ? item.value.sku : null;
  if (!prods || !sku) return;
  try {
    const all = unwrapList(await prods.list({ q: sku, pageSize: 50 }));
    linkedProduct.value =
      all.find((p) => p && String(p.sku || '').trim() === String(sku).trim()) || null;
  } catch {
    linkedProduct.value = null; // enriquecimento é best-effort; nunca derruba a tela
  }
}

async function loadMovements() {
  movementsLoading.value = true;
  movementsError.value = '';
  const reord = reorderResource();
  if (!reord) {
    movements.value = []; // histórico vazio honesto (não é erro fatal da tela)
    movementsLoading.value = false;
    return;
  }
  try {
    const all = unwrapList(await reord.list());
    const sku = item.value ? item.value.sku : null;
    movements.value = all
      .filter((r) => !sku || String(r.sku) === String(sku))
      .map(toMovement)
      .sort((a, b) => {
        const ta = a.at ? new Date(a.at).getTime() : 0;
        const tb = b.at ? new Date(b.at).getTime() : 0;
        return tb - ta;
      });
  } catch (e) {
    movementsError.value = (e && e.message) || 'Falha ao carregar o histórico de movimentação.';
    movements.value = [];
  } finally {
    movementsLoading.value = false;
  }
}

function toMovement(r) {
  const qty = r.quantity != null ? r.quantity : 0;
  const status = r.status || 'rascunho';
  return {
    key: r.id != null ? 'r' + r.id : 'r' + Math.random().toString(36).slice(2),
    reorderId: r.id != null ? r.id : null,
    title: 'Reposição +' + fmtNumber(qty),
    quantity: qty,
    supplier: r.supplier || '—',
    status,
    detail: r.supplier ? 'Fornecedor: ' + r.supplier : 'Sem fornecedor definido',
    at: r.created_at || r.updated_at || null,
    tone: resolveTone(status),
  };
}

// ---- ação: repor estoque (modal + confirmação) ------------------------------
function openReorder() {
  if (!item.value) return;
  reorderForm.quantity = String(suggestedQty.value > 0 ? suggestedQty.value : 1);
  reorderForm.supplier = '';
  reorderErrors.quantity = '';
  reorderErrors.supplier = '';
  reorderOpen.value = true;
}

function openReorderRow(row) {
  if (row && row.reorderId != null) router.push('/reorders/' + row.reorderId);
}

const reorderRules = [
  validators.required('Informe a quantidade a repor.'),
  validators.numeric('Informe um número válido.'),
  validators.min(1, 'A quantidade deve ser de pelo menos 1 unidade.'),
];

function validateReorder() {
  reorderErrors.quantity = '';
  reorderErrors.supplier = '';
  const msg = validators.runRules(reorderRules, reorderForm.quantity);
  if (msg) {
    reorderErrors.quantity = msg;
    return false;
  }
  if (!Number.isInteger(Number(reorderForm.quantity))) {
    reorderErrors.quantity = 'Use um número inteiro de unidades.';
    return false;
  }
  return true;
}

async function submitReorder() {
  if (reorderBusy.value || !item.value) return;
  if (!validateReorder()) return;

  const reord = reorderResource();
  if (!reord || typeof reord.create !== 'function') {
    toast.error('Recurso de reposições indisponível.', {
      detail: 'O endpoint /v1/reorders não está exposto no cliente.',
    });
    return;
  }

  const qty = Number(reorderForm.quantity);
  const ok = await confirm({
    title: 'Confirmar reposição',
    message:
      'Solicitar reposição de ' +
      fmtNumber(qty) +
      ' unidade(s) de ' +
      (item.value.product_name || item.value.sku) +
      '?',
    confirmLabel: 'Solicitar',
  });
  if (!ok) return;

  reorderBusy.value = true;
  try {
    await reord.create({
      sku: item.value.sku,
      productName: item.value.product_name,
      quantity: qty,
      supplier: reorderForm.supplier.trim() || undefined,
      status: 'solicitada',
    });
    toast.success('Reposição solicitada.', {
      detail: fmtNumber(qty) + ' unidade(s) de ' + item.value.sku,
    });
    reorderOpen.value = false;
    await loadMovements();
  } catch (e) {
    toast.error('Falha ao solicitar a reposição.', { detail: (e && e.message) || '' });
  } finally {
    reorderBusy.value = false;
  }
}

// ---- derivados de apresentação ----------------------------------------------
const hasReorderPoint = computed(
  () => item.value && item.value.reorder_point != null && item.value.reorder_point !== '',
);

const linkedProductId = computed(() =>
  linkedProduct.value && linkedProduct.value.id != null ? linkedProduct.value.id : null,
);

const stockValue = computed(() => {
  if (!item.value || !linkedProduct.value || linkedProduct.value.price == null) return 0;
  return Number(linkedProduct.value.price) * Number(item.value.quantity || 0);
});

// situação canônica: usa o status do item; senão deriva de quantidade × ponto de reposição.
const situation = computed(() => {
  if (!item.value) return 'ok';
  const raw = (item.value.status || '').toString().toLowerCase();
  if (raw) return raw;
  const q = Number(item.value.quantity || 0);
  if (q <= 0) return 'esgotado';
  if (hasReorderPoint.value && q <= Number(item.value.reorder_point)) return 'baixo';
  return 'ok';
});

const SITUATION_LABELS = {
  ok: 'Em dia',
  baixo: 'Estoque baixo',
  esgotado: 'Esgotado',
};
const situationLabel = computed(
  () => SITUATION_LABELS[situation.value] || format.humanize(situation.value),
);

const needsReorder = computed(() => {
  if (!item.value) return false;
  if (situation.value === 'esgotado' || situation.value === 'baixo') return true;
  const q = Number(item.value.quantity || 0);
  return hasReorderPoint.value && q <= Number(item.value.reorder_point);
});

const deficit = computed(() => {
  if (!item.value || !hasReorderPoint.value) return 0;
  const d = Number(item.value.reorder_point) - Number(item.value.quantity || 0);
  return d > 0 ? d : 0;
});

// sugestão simples e honesta: levar ao dobro do ponto de reposição (cobre o déficit + margem).
const suggestedQty = computed(() => {
  if (!item.value) return 0;
  if (hasReorderPoint.value) {
    const target = Number(item.value.reorder_point) * 2;
    const need = target - Number(item.value.quantity || 0);
    return need > 0 ? need : deficit.value;
  }
  const q = Number(item.value.quantity || 0);
  return q <= 0 ? 1 : 0;
});

// reposições "em trânsito" = solicitadas e ainda não recebidas/canceladas.
const pendingMovements = computed(() =>
  movements.value.filter((m) => {
    const s = String(m.status || '').toLowerCase();
    return s !== 'recebida' && s !== 'cancelada';
  }),
);
const pendingCount = computed(() => pendingMovements.value.length);
const pendingQty = computed(() =>
  pendingMovements.value.reduce((sum, m) => sum + Number(m.quantity || 0), 0),
);

const reorderAdvice = computed(() => {
  if (!item.value) return '';
  if (!needsReorder.value)
    return 'Nível saudável — sem necessidade de reposição no momento.';
  if (pendingQty.value > 0)
    return 'Já há ' + fmtNumber(pendingQty.value) + ' un. em trânsito; avalie antes de pedir mais.';
  return 'Recomendamos repor ' + (suggestedQty.value > 0 ? fmtNumber(suggestedQty.value) + ' unidade(s).' : 'agora.');
});

const quantityTone = computed(() => {
  if (!item.value) return 'neutral';
  if (situation.value === 'esgotado') return 'error';
  if (needsReorder.value) return 'warning';
  return 'success';
});

const quantityHint = computed(() => {
  if (!item.value) return '';
  if (situation.value === 'esgotado') return 'sem unidades disponíveis';
  if (needsReorder.value) return 'abaixo do ponto de reposição';
  return 'dentro do nível saudável';
});

// cobertura = quantidade em múltiplos do ponto de reposição (proxy simples de fôlego).
const coverageRatio = computed(() => {
  if (!item.value || !hasReorderPoint.value) return null;
  const rp = Number(item.value.reorder_point);
  if (!rp) return null;
  return Number(item.value.quantity || 0) / rp;
});
const coverageLabel = computed(() => {
  if (coverageRatio.value == null) return '—';
  return coverageRatio.value.toFixed(1) + '×';
});
const coverageTone = computed(() => {
  if (coverageRatio.value == null) return 'neutral';
  if (coverageRatio.value < 1) return 'error';
  if (coverageRatio.value < 1.5) return 'warning';
  return 'success';
});
const coverageHint = computed(() => {
  if (coverageRatio.value == null) return 'sem ponto de reposição';
  return 'do ponto de reposição';
});

// medidor visual (sem style inline): buckets discretos por classes/atributos.
const gaugeBucket = computed(() => {
  if (!item.value) return '0';
  let ratio;
  if (hasReorderPoint.value) {
    const rp = Number(item.value.reorder_point) || 1;
    ratio = Number(item.value.quantity || 0) / (rp * 2); // 2× o ponto = cheio
  } else {
    const q = Number(item.value.quantity || 0);
    ratio = q <= 0 ? 0 : 1;
  }
  const pct = Math.max(0, Math.min(1, ratio));
  return String(Math.round(pct * 10) * 10); // 0..100 em passos de 10
});
const reorderMarkBucket = computed(() => {
  if (!hasReorderPoint.value || !item.value) return '0';
  // posição do marcador do ponto de reposição na mesma escala (rp / (rp*2) = 50%)
  return '50';
});
const gaugeCaption = computed(() => {
  if (!item.value) return '';
  if (!hasReorderPoint.value) return 'Sem ponto de reposição definido';
  return 'Nível atual vs. ponto de reposição';
});
const gaugeAria = computed(() => {
  if (!item.value) return 'Medidor de estoque';
  return (
    'Estoque atual ' +
    fmtNumber(item.value.quantity) +
    (hasReorderPoint.value ? ' de um ponto de reposição de ' + fmtNumber(item.value.reorder_point) : '')
  );
});

const bannerTone = computed(() => quantityTone.value);
const bannerMessage = computed(() => {
  if (!item.value) return '';
  if (situation.value === 'esgotado') return 'SKU esgotado — reponha o quanto antes.';
  if (needsReorder.value)
    return 'Estoque abaixo do ponto de reposição — recomenda-se repor ' + (suggestedQty.value > 0 ? fmtNumber(suggestedQty.value) + ' unidade(s).' : 'agora.');
  return 'Estoque em nível saudável.';
});

const movementsSubtitle = computed(() =>
  movements.value.length
    ? movements.value.length + ' reposição(ões) registrada(s) para este SKU'
    : 'Pedidos de reposição vinculados ao SKU',
);

const reorderColumns = [
  { key: 'quantity', label: 'Qtd', align: 'right' },
  { key: 'supplier', label: 'Fornecedor' },
  { key: 'status', label: 'Situação' },
];

const pageTitle = computed(() => {
  if (!item.value) return 'Detalhe de estoque';
  return item.value.product_name || item.value.sku || ('Item #' + item.value.id);
});
const pageSubtitle = computed(() => {
  if (!item.value) return 'Posição detalhada de um SKU.';
  return (item.value.sku || '') + ' · ' + fmtNumber(item.value.quantity) + ' em estoque';
});

// ---- ciclo de vida ----------------------------------------------------------
watch(itemId, () => {
  movements.value = [];
  movementsError.value = '';
  linkedProduct.value = null;
  reorderOpen.value = false;
  load();
});

onMounted(load);
</script>

<style scoped>
/* KPIs */
.iv-metrics {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: var(--ui-space-4);
}

/* banner de situação */
.iv-banner {
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
.iv-banner[data-tone="success"] { border-left-color: rgb(var(--ui-ok)); }
.iv-banner[data-tone="warning"] { border-left-color: rgb(var(--ui-warn)); }
.iv-banner[data-tone="error"] { border-left-color: rgb(var(--ui-danger)); }
.iv-banner-main { display: flex; align-items: center; gap: var(--ui-space-3); flex-wrap: wrap; }
.iv-banner-text { font-weight: 600; }
.iv-banner-meta { color: rgb(var(--ui-muted)); font-size: var(--ui-text-sm); }

/* layout principal */
.iv-grid {
  display: grid;
  grid-template-columns: minmax(0, 2fr) minmax(0, 1fr);
  gap: var(--ui-space-4);
  align-items: start;
}
.iv-col { display: flex; flex-direction: column; gap: var(--ui-space-4); }

/* listas de definição (detalhe / FieldGrid) */
.iv-dl { display: flex; flex-direction: column; gap: var(--ui-space-2); margin: 0; }
.iv-dl-row {
  display: grid;
  grid-template-columns: 160px 1fr;
  gap: var(--ui-space-3);
  align-items: baseline;
  padding-bottom: var(--ui-space-2);
  border-bottom: 1px solid rgb(var(--ui-border));
}
.iv-dl-row--tight { grid-template-columns: 110px 1fr; }
.iv-dl-row:last-child { border-bottom: none; padding-bottom: 0; }
.iv-dl dt { color: rgb(var(--ui-muted)); font-size: var(--ui-text-sm); }
.iv-dl dd { margin: 0; font-weight: 500; word-break: break-word; }
.iv-qty { font-family: var(--ui-font-display); font-size: var(--ui-text-lg); }
.iv-unit { font-weight: 400; font-size: var(--ui-text-sm); }
.iv-copy { display: flex; align-items: center; gap: var(--ui-space-2); flex-wrap: wrap; }

/* links de domínio */
.iv-link { color: rgb(var(--ui-accent-strong)); font-weight: 600; text-decoration: none; }
.iv-link:hover { text-decoration: underline; }

/* nota lateral */
.iv-side-note { margin: var(--ui-space-3) 0 0; font-size: var(--ui-text-sm); }

/* medidor de estoque (sem style inline: largura por buckets de classe) */
.iv-foot-row { display: flex; align-items: center; justify-content: space-between; gap: var(--ui-space-4); flex-wrap: wrap; }
.iv-gauge {
  position: relative;
  flex: 1 1 200px;
  min-width: 160px;
  height: 10px;
  border-radius: var(--ui-radius-pill);
  background: rgb(var(--ui-surface-2));
  border: 1px solid rgb(var(--ui-border));
  overflow: hidden;
}
.iv-gauge-fill {
  position: absolute;
  inset: 0 auto 0 0;
  width: 0;
  border-radius: var(--ui-radius-pill);
  background: rgb(var(--ui-faint));
}
.iv-gauge[data-tone="success"] .iv-gauge-fill { background: rgb(var(--ui-ok)); }
.iv-gauge[data-tone="warning"] .iv-gauge-fill { background: rgb(var(--ui-warn)); }
.iv-gauge[data-tone="error"] .iv-gauge-fill { background: rgb(var(--ui-danger)); }
.iv-gauge-fill[data-fill="0"] { width: 0; }
.iv-gauge-fill[data-fill="10"] { width: 10%; }
.iv-gauge-fill[data-fill="20"] { width: 20%; }
.iv-gauge-fill[data-fill="30"] { width: 30%; }
.iv-gauge-fill[data-fill="40"] { width: 40%; }
.iv-gauge-fill[data-fill="50"] { width: 50%; }
.iv-gauge-fill[data-fill="60"] { width: 60%; }
.iv-gauge-fill[data-fill="70"] { width: 70%; }
.iv-gauge-fill[data-fill="80"] { width: 80%; }
.iv-gauge-fill[data-fill="90"] { width: 90%; }
.iv-gauge-fill[data-fill="100"] { width: 100%; }
.iv-gauge-mark {
  position: absolute;
  top: -2px;
  bottom: -2px;
  width: 2px;
  background: rgb(var(--ui-fg) / 0.55);
}
.iv-gauge-mark[data-pos="50"] { left: 50%; }
.iv-gauge-mark[data-pos="0"] { left: 0; }

/* timeline (MovementHistory) */
.iv-timeline { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; }
.iv-tl-item { position: relative; display: flex; gap: var(--ui-space-3); padding: 0 0 var(--ui-space-4) var(--ui-space-1); }
.iv-tl-item::before {
  content: "";
  position: absolute;
  left: 4px;
  top: 14px;
  bottom: 0;
  width: 2px;
  background: rgb(var(--ui-border));
}
.iv-tl-item:last-child { padding-bottom: 0; }
.iv-tl-item:last-child::before { display: none; }
.iv-tl-dot {
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
.iv-tl-item[data-tone="success"] .iv-tl-dot { background: rgb(var(--ui-ok)); }
.iv-tl-item[data-tone="warning"] .iv-tl-dot { background: rgb(var(--ui-warn)); }
.iv-tl-item[data-tone="error"] .iv-tl-dot { background: rgb(var(--ui-danger)); }
.iv-tl-item[data-tone="running"] .iv-tl-dot { background: rgb(var(--ui-accent)); }
.iv-tl-body { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
.iv-tl-head { display: flex; align-items: center; gap: var(--ui-space-2); flex-wrap: wrap; }
.iv-tl-title { font-weight: 600; }
.iv-tl-detail { margin: 0; color: rgb(var(--ui-muted)); font-size: var(--ui-text-sm); }
.iv-tl-time { color: rgb(var(--ui-muted)); font-size: var(--ui-text-xs); }

/* formulário do modal */
.iv-form { display: flex; flex-direction: column; gap: var(--ui-space-4); }
.iv-form-intro { margin: 0; font-size: var(--ui-text-sm); }

/* responsivo */
@media (max-width: 980px) {
  .iv-grid { grid-template-columns: 1fr; }
  .iv-metrics { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
@media (max-width: 560px) {
  .iv-metrics { grid-template-columns: 1fr; }
  .iv-dl-row, .iv-dl-row--tight { grid-template-columns: 1fr; gap: 2px; }
}
</style>
