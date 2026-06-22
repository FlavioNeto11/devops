<!--
  ReorderDetailView — Detalhe de uma ordem de reposição (REQ-SHOPDESK-0005).
  DetailHeader (título + ações), banner de situação, KPIs, FieldGrid (dt/dd com
  todos os campos da entidade) e StatusActions: o ciclo de vida da ordem
  (rascunho → solicitada → recebida/cancelada) com ações de solicitar/receber/cancelar.
  Tudo sobre o kit ui-vue (tokens --ui-*), CSP-safe (sem style inline / v-html),
  todos os estados (loading/empty/error/normal), confirmação destrutiva + toast, a11y.
-->
<template>
  <UiPageLayout
    width="wide"
    eyebrow="Ordem de reposição"
    :title="pageTitle"
    :subtitle="pageSubtitle"
    :loading="loading"
    loading-message="Carregando ordem de reposição…"
    :error="loadError"
    @retry="load"
  >
    <!-- DetailHeader: ações de status -->
    <template #actions>
      <UiButton variant="ghost" to="/reorders">Voltar à lista</UiButton>
      <UiButton
        v-if="reorder"
        variant="subtle"
        :disabled="!canRequest || actionBusy"
        :loading="requestBusy"
        @click="confirmRequest"
      >Solicitar ao fornecedor</UiButton>
      <UiButton
        v-if="reorder"
        variant="primary"
        :disabled="!canReceive || actionBusy"
        :loading="receiveBusy"
        @click="confirmReceive"
      >Receber</UiButton>
      <UiButton
        v-if="reorder"
        variant="danger"
        :disabled="!canCancel || actionBusy"
        :loading="cancelBusy"
        @click="confirmCancel"
      >Cancelar</UiButton>
    </template>

    <!-- Banner de situação -->
    <template #banner>
      <div
        v-if="reorder"
        class="rd-banner"
        :data-tone="bannerTone"
        role="status"
      >
        <div class="rd-banner-main">
          <UiStatusBadge :status="reorder.status" size="lg" />
          <span class="rd-banner-text">{{ bannerMessage }}</span>
        </div>
        <span v-if="reorder.createdAt || reorder.created_at" class="rd-banner-meta">
          Criada em {{ fmtDateTime(reorder.createdAt || reorder.created_at) }}
        </span>
      </div>
    </template>

    <!-- CONTEÚDO normal -->
    <template v-if="reorder">
      <!-- KPIs -->
      <section class="rd-metrics" aria-label="Resumo da ordem de reposição">
        <UiMetricCard
          label="Situação"
          :value="statusText"
          :tone="bannerTone === 'neutral' ? 'neutral' : bannerTone"
          :hint="statusHint"
        />
        <UiMetricCard
          label="Quantidade solicitada"
          :value="fmtNumber(reorder.quantity)"
          tone="primary"
          hint="unidades"
        />
        <UiMetricCard
          label="Fornecedor"
          :value="reorder.supplier || '—'"
          tone="neutral"
          :hint="reorder.supplier ? 'destino do pedido' : 'sem fornecedor definido'"
        />
        <UiMetricCard
          label="SKU"
          :value="reorder.sku || '—'"
          tone="neutral"
          :hint="reorder.productName || reorder.product_name || 'produto a repor'"
        />
      </section>

      <div class="rd-grid">
        <!-- COLUNA PRINCIPAL: FieldGrid -->
        <div class="rd-col rd-col-main">
          <UiCard title="Dados da reposição" subtitle="Detalhes da ordem">
            <template #actions>
              <UiStatusBadge :status="reorder.status" />
            </template>
            <dl class="rd-dl">
              <div class="rd-dl-row">
                <dt>SKU</dt>
                <dd class="ui-mono">{{ reorder.sku || '—' }}</dd>
              </div>
              <div class="rd-dl-row">
                <dt>Produto</dt>
                <dd>{{ reorder.productName || reorder.product_name || '—' }}</dd>
              </div>
              <div class="rd-dl-row">
                <dt>Quantidade solicitada</dt>
                <dd>{{ fmtNumber(reorder.quantity) }}</dd>
              </div>
              <div class="rd-dl-row">
                <dt>Fornecedor</dt>
                <dd>{{ reorder.supplier || '—' }}</dd>
              </div>
              <div class="rd-dl-row">
                <dt>Situação</dt>
                <dd><UiStatusBadge :status="reorder.status" /></dd>
              </div>
              <div class="rd-dl-row">
                <dt>Criada em</dt>
                <dd>{{ fmtDateTime(reorder.createdAt || reorder.created_at) }}</dd>
              </div>
              <div v-if="reorder.code || reorder.id != null" class="rd-dl-row">
                <dt>Código</dt>
                <dd class="ui-mono">{{ reorder.code || ('#' + reorder.id) }}</dd>
              </div>
            </dl>
          </UiCard>
        </div>

        <!-- COLUNA LATERAL: StatusActions + ciclo de vida -->
        <div class="rd-col rd-col-side">
          <!-- StatusActions -->
          <UiCard title="Ações de status" subtitle="O que você pode fazer agora">
            <div class="rd-actions">
              <UiButton
                variant="subtle"
                block
                :disabled="!canRequest || actionBusy"
                :loading="requestBusy"
                @click="confirmRequest"
              >Solicitar ao fornecedor</UiButton>
              <UiButton
                variant="primary"
                block
                :disabled="!canReceive || actionBusy"
                :loading="receiveBusy"
                @click="confirmReceive"
              >Marcar como recebida</UiButton>
              <UiButton
                variant="danger"
                block
                :disabled="!canCancel || actionBusy"
                :loading="cancelBusy"
                @click="confirmCancel"
              >Cancelar ordem</UiButton>
            </div>
            <p v-if="isTerminal" class="rd-actions-note ui-muted">
              {{ terminalNote }}
            </p>
            <p v-else class="rd-actions-note ui-muted">{{ nextStepHint }}</p>
          </UiCard>

          <!-- Ciclo de vida (timeline) -->
          <UiCard title="Ciclo de vida" subtitle="Etapas da ordem de reposição">
            <ol class="rd-timeline">
              <li
                v-for="step in lifecycle"
                :key="step.key"
                class="rd-tl-item"
                :data-state="step.state"
              >
                <span class="rd-tl-dot" aria-hidden="true" />
                <div class="rd-tl-body">
                  <div class="rd-tl-head">
                    <span class="rd-tl-title">{{ step.label }}</span>
                    <UiStatusBadge
                      v-if="step.state === 'current'"
                      :status="reorder.status"
                      size="sm"
                    />
                    <span v-else-if="step.state === 'done'" class="rd-tl-flag" aria-label="Concluído">✓</span>
                  </div>
                  <p v-if="step.detail" class="rd-tl-detail">{{ step.detail }}</p>
                </div>
              </li>
            </ol>
          </UiCard>
        </div>
      </div>
    </template>

    <!-- EMPTY: ordem não encontrada (não é erro de rede) -->
    <template v-else-if="!loading && !loadError">
      <UiEmptyState
        title="Ordem de reposição não encontrada"
        description="Não localizamos esta ordem. Ela pode ter sido removida ou o endereço está incorreto."
        icon="search"
      >
        <template #action>
          <UiButton to="/reorders">Ver todas as reposições</UiButton>
        </template>
      </UiEmptyState>
    </template>
  </UiPageLayout>
</template>

<script setup>
import { ref, computed, watch, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import {
  UiPageLayout,
  UiCard,
  UiMetricCard,
  UiStatusBadge,
  UiButton,
  UiEmptyState,
  useToast,
  useConfirm,
  format,
  resolveTone,
} from '../ui/index.js';
import * as api from '../api.js';

const route = useRoute();
const toast = useToast();
const confirm = useConfirm();

const fmtDateTime = (v) => format.formatDateTime(v);
const fmtNumber = (v) => (v === null || v === undefined || v === '' ? '—' : format.formatNumber(v));

// ---- estado base ----
const reorder = ref(null);
const loading = ref(false);
const loadError = ref('');

const requestBusy = ref(false);
const receiveBusy = ref(false);
const cancelBusy = ref(false);
const actionBusy = computed(() => requestBusy.value || receiveBusy.value || cancelBusy.value);

const reorderId = computed(() => route.params.id);

// ---- acesso à API com degradação graciosa ----
// O integrador expõe api.reorders (resourceFactory → /v1/reorders). Sem ela, falha controlada.
function unwrap(r) {
  return r && r.data !== undefined ? r.data : r;
}

async function fetchReorder(id) {
  if (api.reorders && typeof api.reorders.get === 'function') {
    return unwrap(await api.reorders.get(id));
  }
  throw new Error('Recurso de reposições indisponível.');
}

async function patchReorder(id, payload) {
  if (api.reorders && typeof api.reorders.update === 'function') {
    return unwrap(await api.reorders.update(id, payload));
  }
  throw new Error('Recurso de reposições indisponível.');
}

// ---- carregamento ----
async function load() {
  loading.value = true;
  loadError.value = '';
  try {
    reorder.value = await fetchReorder(reorderId.value);
  } catch (e) {
    if (e && e.status === 404) {
      reorder.value = null; // estado "não encontrada"
    } else {
      loadError.value = (e && e.message) || 'Falha ao carregar a ordem de reposição.';
    }
  } finally {
    loading.value = false;
  }
}

// ---- transições de status ----
async function applyStatus(next, busyRef, successMsg) {
  busyRef.value = true;
  try {
    const updated = await patchReorder(reorderId.value, { status: next });
    reorder.value = updated || { ...reorder.value, status: next };
    toast.success(successMsg);
  } catch (e) {
    toast.error('Não foi possível atualizar a ordem.', { detail: (e && e.message) || '' });
  } finally {
    busyRef.value = false;
  }
}

async function confirmRequest() {
  if (!canRequest.value) return;
  const ok = await confirm({
    title: 'Solicitar ao fornecedor',
    message:
      'Enviar a ordem ' + reorderLabel.value + ' de ' + fmtNumber(reorder.value.quantity) +
      ' unidade(s) de ' + skuLabel.value + (reorder.value.supplier ? ' a ' + reorder.value.supplier : '') + '?',
    confirmLabel: 'Solicitar',
  });
  if (!ok) return;
  await applyStatus('solicitada', requestBusy, 'Reposição solicitada ao fornecedor.');
}

async function confirmReceive() {
  if (!canReceive.value) return;
  const ok = await confirm({
    title: 'Receber reposição',
    message:
      'Confirmar o recebimento de ' + fmtNumber(reorder.value.quantity) + ' unidade(s) de ' +
      skuLabel.value + ' na ordem ' + reorderLabel.value + '? O estoque será considerado reposto.',
    confirmLabel: 'Confirmar recebimento',
  });
  if (!ok) return;
  await applyStatus('recebida', receiveBusy, 'Reposição recebida.');
}

async function confirmCancel() {
  if (!canCancel.value) return;
  const ok = await confirm({
    title: 'Cancelar ordem de reposição',
    message:
      'Esta ação cancela a ordem ' + reorderLabel.value + ' (' + skuLabel.value +
      '). Não será possível recebê-la depois. Deseja continuar?',
    confirmLabel: 'Cancelar ordem',
    cancelLabel: 'Voltar',
    danger: true,
  });
  if (!ok) return;
  await applyStatus('cancelada', cancelBusy, 'Ordem de reposição cancelada.');
}

// ---- derivados de apresentação ----
const normalizedStatus = computed(() =>
  reorder.value && reorder.value.status ? String(reorder.value.status).toLowerCase().trim() : '',
);

const skuLabel = computed(() => {
  if (!reorder.value) return '';
  return reorder.value.sku || reorder.value.productName || reorder.value.product_name || 'produto';
});

const reorderLabel = computed(() => {
  if (!reorder.value) return '';
  return reorder.value.code || (reorder.value.id != null ? '#' + reorder.value.id : 'reposição');
});

const pageTitle = computed(() => {
  if (!reorder.value) return 'Detalhe da reposição';
  const name = reorder.value.productName || reorder.value.product_name;
  if (name) return name;
  if (reorder.value.sku) return reorder.value.sku;
  return 'Reposição ' + reorderLabel.value;
});

const pageSubtitle = computed(() => {
  if (!reorder.value) return 'Ordem de reposição com status e ações de receber/cancelar.';
  const parts = [];
  if (reorder.value.sku) parts.push('SKU ' + reorder.value.sku);
  parts.push(fmtNumber(reorder.value.quantity) + ' un.');
  if (reorder.value.supplier) parts.push(reorder.value.supplier);
  return parts.join(' · ');
});

const statusText = computed(() =>
  reorder.value ? format.humanize(reorder.value.status) : '—',
);

const bannerTone = computed(() =>
  reorder.value ? resolveTone(reorder.value.status) : 'neutral',
);

const STATUS_MESSAGES = {
  rascunho: 'Rascunho — ainda não enviada ao fornecedor.',
  solicitada: 'Solicitada — aguardando o recebimento da mercadoria.',
  recebida: 'Recebida — o estoque foi reposto.',
  cancelada: 'Cancelada — esta ordem não será atendida.',
};

const bannerMessage = computed(() => {
  if (!reorder.value) return '';
  return STATUS_MESSAGES[normalizedStatus.value] || ('Situação atual: ' + statusText.value);
});

const statusHint = computed(() => {
  const map = {
    rascunho: 'pronta para solicitar',
    solicitada: 'em trânsito',
    recebida: 'concluída',
    cancelada: 'encerrada',
  };
  return map[normalizedStatus.value] || 'situação da ordem';
});

// ---- regras de transição (StatusActions) ----
const canRequest = computed(() => normalizedStatus.value === 'rascunho');
const canReceive = computed(() => normalizedStatus.value === 'solicitada');
const canCancel = computed(() =>
  ['rascunho', 'solicitada'].includes(normalizedStatus.value),
);
const isTerminal = computed(() =>
  ['recebida', 'cancelada'].includes(normalizedStatus.value),
);

const terminalNote = computed(() =>
  normalizedStatus.value === 'recebida'
    ? 'Ordem recebida — nenhuma ação adicional é necessária.'
    : 'Ordem cancelada — nenhuma ação está disponível.',
);

const nextStepHint = computed(() => {
  if (canRequest.value) return 'Próximo passo: solicitar a reposição ao fornecedor.';
  if (canReceive.value) return 'Próximo passo: receber a mercadoria quando chegar.';
  return 'Selecione uma ação disponível para esta ordem.';
});

// ---- ciclo de vida (timeline de etapas) ----
const STAGES = [
  { key: 'rascunho', label: 'Rascunho', detail: 'Ordem criada, ainda não enviada.' },
  { key: 'solicitada', label: 'Solicitada', detail: 'Enviada ao fornecedor.' },
  { key: 'recebida', label: 'Recebida', detail: 'Mercadoria recebida e estoque reposto.' },
];

const lifecycle = computed(() => {
  const cur = normalizedStatus.value;
  // Caminho cancelado: mostra até onde chegou + a etapa de cancelamento.
  if (cur === 'cancelada') {
    const out = [
      { key: 'rascunho', label: 'Rascunho', detail: 'Ordem criada.', state: 'done' },
      { key: 'cancelada', label: 'Cancelada', detail: 'Ordem cancelada — não será atendida.', state: 'current' },
    ];
    return out;
  }
  const order = ['rascunho', 'solicitada', 'recebida'];
  const idx = order.indexOf(cur);
  return STAGES.map((s) => {
    const sIdx = order.indexOf(s.key);
    let state = 'upcoming';
    if (idx >= 0) {
      if (sIdx < idx) state = 'done';
      else if (sIdx === idx) state = 'current';
    }
    return { ...s, state };
  });
});

watch(reorderId, load);
onMounted(load);
</script>

<style scoped>
/* banner de situação */
.rd-banner {
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
.rd-banner[data-tone="success"] { border-left-color: rgb(var(--ui-ok)); }
.rd-banner[data-tone="warning"] { border-left-color: rgb(var(--ui-warn)); }
.rd-banner[data-tone="error"] { border-left-color: rgb(var(--ui-danger)); }
.rd-banner[data-tone="running"] { border-left-color: rgb(var(--ui-accent)); }
.rd-banner-main { display: flex; align-items: center; gap: var(--ui-space-3); flex-wrap: wrap; }
.rd-banner-text { font-weight: 600; }
.rd-banner-meta { color: rgb(var(--ui-muted)); font-size: var(--ui-text-sm); }

/* KPIs */
.rd-metrics {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: var(--ui-space-4);
}

/* layout principal */
.rd-grid {
  display: grid;
  grid-template-columns: minmax(0, 2fr) minmax(0, 1fr);
  gap: var(--ui-space-4);
  align-items: start;
}
.rd-col { display: flex; flex-direction: column; gap: var(--ui-space-4); }

/* FieldGrid (dt/dd) */
.rd-dl { display: flex; flex-direction: column; gap: var(--ui-space-2); margin: 0; }
.rd-dl-row {
  display: grid;
  grid-template-columns: 180px 1fr;
  gap: var(--ui-space-3);
  align-items: baseline;
  padding-bottom: var(--ui-space-2);
  border-bottom: 1px solid rgb(var(--ui-border));
}
.rd-dl-row:last-child { border-bottom: none; padding-bottom: 0; }
.rd-dl dt { color: rgb(var(--ui-muted)); font-size: var(--ui-text-sm); }
.rd-dl dd { margin: 0; font-weight: 500; word-break: break-word; }

/* StatusActions */
.rd-actions { display: flex; flex-direction: column; gap: var(--ui-space-2); }
.rd-actions-note { margin: var(--ui-space-3) 0 0; font-size: var(--ui-text-sm); }

/* timeline do ciclo de vida */
.rd-timeline { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; }
.rd-tl-item { position: relative; display: flex; gap: var(--ui-space-3); padding: 0 0 var(--ui-space-4) var(--ui-space-1); }
.rd-tl-item::before {
  content: "";
  position: absolute;
  left: 4px;
  top: 14px;
  bottom: 0;
  width: 2px;
  background: rgb(var(--ui-border));
}
.rd-tl-item:last-child { padding-bottom: 0; }
.rd-tl-item:last-child::before { display: none; }
.rd-tl-dot {
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
.rd-tl-item[data-state="done"] .rd-tl-dot { background: rgb(var(--ui-ok)); }
.rd-tl-item[data-state="current"] .rd-tl-dot { background: rgb(var(--ui-accent)); }
.rd-tl-item[data-state="upcoming"] .rd-tl-dot { background: rgb(var(--ui-faint)); }
.rd-tl-body { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
.rd-tl-head { display: flex; align-items: center; gap: var(--ui-space-2); flex-wrap: wrap; }
.rd-tl-title { font-weight: 600; }
.rd-tl-item[data-state="upcoming"] .rd-tl-title { color: rgb(var(--ui-muted)); font-weight: 500; }
.rd-tl-flag { color: rgb(var(--ui-ok)); font-weight: 700; }
.rd-tl-detail { margin: 0; color: rgb(var(--ui-muted)); font-size: var(--ui-text-sm); }

/* responsivo */
@media (max-width: 980px) {
  .rd-grid { grid-template-columns: 1fr; }
  .rd-metrics { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
@media (max-width: 560px) {
  .rd-metrics { grid-template-columns: 1fr; }
  .rd-dl-row { grid-template-columns: 1fr; gap: 2px; }
}
</style>
