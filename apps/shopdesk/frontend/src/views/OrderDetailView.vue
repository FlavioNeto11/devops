<!--
  OrderDetailView — Visão 360 de um pedido (REQ-SHOPDESK-0003/0004/0007/0006).
  Itens, cliente, total, situação, transação de pagamento (trilha do gateway),
  NF-e vinculada, linha do tempo de eventos, notificações enviadas e o assistente
  de IA do pedido (grounded, fail-closed). Ações: reembolsar, rastrear, reemitir NF-e
  e perguntar à IA. Tudo sobre o kit ui-vue (tokens --ui-*), CSP-safe (sem style inline
  / :style / v-html), todos os estados (loading/empty/error/normal) e a11y.

  Honestidade de dados: os recursos satélite (pagamento via /v1/checkout/audit, NF-e via
  POST /v1/invoices, notificações via /v1/notifications, IA via /v1/assistant) só são
  exibidos/atribuídos a ESTE pedido quando há correlação real — nunca inventamos vínculos.
-->
<template>
  <UiPageLayout
    width="wide"
    eyebrow="Pedido"
    :title="pageTitle"
    :subtitle="pageSubtitle"
    :loading="loading"
    loading-message="Carregando pedido…"
    :error="loadError"
    @retry="load"
  >
    <!-- AÇÕES (DetailHeader) -->
    <template #actions>
      <UiButton variant="ghost" to="/orders">Voltar aos pedidos</UiButton>
      <UiButton
        v-if="order"
        variant="ghost"
        :disabled="!canTrack"
        @click="openTracking"
      >Rastrear</UiButton>
      <UiButton
        v-if="order"
        variant="subtle"
        :loading="invoiceBusy"
        @click="openInvoiceConfirm"
      >{{ invoice ? 'Reemitir NF-e' : 'Emitir NF-e' }}</UiButton>
      <UiButton
        v-if="order"
        variant="danger"
        :disabled="!canRefund"
        :loading="refundBusy"
        @click="confirmRefund"
      >Reembolsar</UiButton>
    </template>

    <!-- BANNER de situação do pedido -->
    <template #banner>
      <div
        v-if="order"
        class="od-banner"
        :data-tone="bannerTone"
        role="status"
      >
        <div class="od-banner-main">
          <UiStatusBadge :status="order.status" size="lg" />
          <span class="od-banner-text">{{ bannerMessage }}</span>
        </div>
        <span v-if="order.updated_at" class="od-banner-meta">
          Atualizado {{ fmtDateTime(order.updated_at) }}
        </span>
      </div>
    </template>

    <!-- CONTEÚDO (normal) — quando há pedido carregado -->
    <template v-if="order">
      <!-- KPIs do pedido -->
      <section class="od-metrics" aria-label="Resumo do pedido">
        <UiMetricCard label="Total do pedido" :value="fmtCurrency(order.total)" tone="primary" :hint="itemsHint" />
        <UiMetricCard label="Itens" :value="itemsCount" tone="neutral" hint="produtos no pedido" />
        <UiMetricCard
          label="Pagamento"
          :value="paymentLabel"
          :tone="paymentTone"
          :hint="paymentHint"
        />
        <UiMetricCard
          label="Notificações"
          :value="orderNotifications.length"
          :tone="orderNotifications.length ? 'success' : 'neutral'"
          hint="comunicadas ao cliente"
        />
      </section>

      <div class="od-grid">
        <!-- COLUNA PRINCIPAL -->
        <div class="od-col od-col-main">
          <!-- OrderItemsTable -->
          <UiCard title="Itens do pedido" :subtitle="itemsSubtitle">
            <UiDataTable
              :columns="itemColumns"
              :rows="itemRows"
              row-key="key"
              density="comfortable"
              :empty="{
                title: 'Sem itens detalhados',
                description: 'Este pedido não trouxe a linha de itens; mostramos o total consolidado.',
              }"
            >
              <template #cell-unitPrice="{ value }">{{ fmtCurrency(value) }}</template>
              <template #cell-lineTotal="{ value }">{{ fmtCurrency(value) }}</template>
            </UiDataTable>
            <template #footer>
              <div class="od-foot-row">
                <span class="od-foot-label">Total do pedido</span>
                <strong class="od-foot-total">{{ fmtCurrency(order.total) }}</strong>
              </div>
            </template>
          </UiCard>

          <!-- PaymentPanel -->
          <UiCard
            title="Pagamento"
            :subtitle="payment ? 'Transação registrada na trilha do gateway' : 'Trilha de auditoria do checkout'"
          >
            <template #actions>
              <UiStatusBadge :status="(payment && payment.status) || order.payment_status || 'aguardando'" />
            </template>

            <UiLoadingState v-if="paymentLoading" variant="skeleton" :skeleton-lines="4" />
            <UiErrorState
              v-else-if="paymentError"
              :message="paymentError"
              @retry="loadPayment"
            />
            <dl v-else-if="payment" class="od-dl">
              <div class="od-dl-row">
                <dt>Transação</dt>
                <dd class="od-copy">
                  <span class="ui-mono">{{ payment.transactionId || '—' }}</span>
                  <UiButton
                    v-if="payment.transactionId"
                    variant="ghost"
                    size="sm"
                    @click="copy(payment.transactionId, 'ID da transação')"
                  >Copiar</UiButton>
                </dd>
              </div>
              <div class="od-dl-row">
                <dt>Situação</dt>
                <dd><UiStatusBadge :status="payment.status" /></dd>
              </div>
              <div class="od-dl-row">
                <dt>Provedor</dt>
                <dd>{{ payment.provider || '—' }}</dd>
              </div>
              <div class="od-dl-row">
                <dt>Valor processado</dt>
                <dd>{{ fmtCurrency(payment.amount != null ? payment.amount : order.total) }}</dd>
              </div>
              <div v-if="payment.at" class="od-dl-row">
                <dt>Quando</dt>
                <dd>{{ fmtDateTime(payment.at) }}</dd>
              </div>
            </dl>
            <UiEmptyState
              v-else
              title="Sem transação de pagamento"
              description="Nenhum evento de checkout foi encontrado para este pedido na trilha de auditoria."
              icon="card"
              compact
            >
              <template #action>
                <UiButton variant="subtle" :loading="paymentLoading" @click="loadPayment">
                  Atualizar trilha
                </UiButton>
              </template>
            </UiEmptyState>
          </UiCard>

          <!-- InvoicePanel -->
          <UiCard title="Nota fiscal (NF-e)" subtitle="Documento fiscal vinculado ao pedido">
            <template #actions>
              <UiStatusBadge v-if="invoice" :status="invoice.status" />
            </template>
            <dl v-if="invoice" class="od-dl">
              <div class="od-dl-row">
                <dt>Protocolo</dt>
                <dd class="od-copy">
                  <span class="ui-mono">{{ invoice.protocol || '—' }}</span>
                  <UiButton
                    v-if="invoice.protocol"
                    variant="ghost"
                    size="sm"
                    @click="copy(invoice.protocol, 'protocolo')"
                  >Copiar</UiButton>
                </dd>
              </div>
              <div class="od-dl-row">
                <dt>Recibo</dt>
                <dd class="ui-mono">{{ invoice.receipt || '—' }}</dd>
              </div>
              <div class="od-dl-row">
                <dt>Situação</dt>
                <dd><UiStatusBadge :status="invoice.status" /></dd>
              </div>
              <div class="od-dl-row">
                <dt>Ambiente</dt>
                <dd>{{ invoice.mode || '—' }}</dd>
              </div>
              <div v-if="invoice.at" class="od-dl-row">
                <dt>Emitida em</dt>
                <dd>{{ fmtDateTime(invoice.at) }}</dd>
              </div>
            </dl>
            <UiEmptyState
              v-else
              title="Nenhuma NF-e emitida"
              description="Emita a nota fiscal deste pedido quando o pagamento estiver aprovado."
              icon="invoice"
              compact
            >
              <template #action>
                <UiButton variant="subtle" :loading="invoiceBusy" @click="openInvoiceConfirm">
                  Emitir NF-e
                </UiButton>
              </template>
            </UiEmptyState>
          </UiCard>

          <!-- Notificações enviadas (REQ-SHOPDESK-0007) -->
          <UiCard title="Notificações enviadas" subtitle="Comunicações multicanal deste pedido">
            <UiLoadingState v-if="notificationsLoading" variant="skeleton" :skeleton-lines="3" />
            <ul v-else-if="orderNotifications.length" class="od-notes">
              <li v-for="(n, i) in orderNotifications" :key="n.id != null ? n.id : i" class="od-note">
                <div class="od-note-head">
                  <span class="od-note-title">{{ fmtEvent(n.event) }}</span>
                  <UiStatusBadge :status="n.status || 'sent'" size="sm" />
                </div>
                <div class="od-note-channels">
                  <UiStatusBadge
                    v-for="(c, ci) in channelsOf(n)"
                    :key="ci"
                    :status="c.status"
                    :label="channelLabel(c)"
                    size="sm"
                    :with-dot="true"
                  />
                  <span v-if="!channelsOf(n).length" class="od-note-empty">sem canais registrados</span>
                </div>
                <time v-if="n.at" class="od-note-time">{{ fmtDateTime(n.at) }}</time>
              </li>
            </ul>
            <UiEmptyState
              v-else
              title="Nenhuma notificação vinculada"
              description="Não há comunicação correlacionada a este pedido na trilha de notificações."
              icon="bell"
              compact
            />
          </UiCard>
        </div>

        <!-- COLUNA LATERAL -->
        <div class="od-col od-col-side">
          <!-- Cliente (detalhe dt/dd) -->
          <UiCard title="Cliente">
            <dl class="od-dl">
              <div class="od-dl-row">
                <dt>Nome</dt>
                <dd>{{ order.customer_name || '—' }}</dd>
              </div>
              <div class="od-dl-row">
                <dt>E-mail</dt>
                <dd>
                  <a v-if="order.customer_email" :href="'mailto:' + order.customer_email">{{ order.customer_email }}</a>
                  <span v-else class="od-muted">—</span>
                </dd>
              </div>
              <div class="od-dl-row">
                <dt>Código</dt>
                <dd class="od-copy">
                  <span class="ui-mono">{{ order.code || ('#' + order.id) }}</span>
                  <UiButton
                    v-if="order.code"
                    variant="ghost"
                    size="sm"
                    @click="copy(order.code, 'código do pedido')"
                  >Copiar</UiButton>
                </dd>
              </div>
              <div class="od-dl-row">
                <dt>Criado em</dt>
                <dd>{{ fmtDateTime(order.created_at) }}</dd>
              </div>
              <div class="od-dl-row">
                <dt>Rastreio</dt>
                <dd>
                  <span v-if="order.tracking_code" class="ui-mono">{{ order.tracking_code }}</span>
                  <span v-else class="od-muted">não enviado</span>
                </dd>
              </div>
            </dl>
          </UiCard>

          <!-- Ações sugeridas pelo estado do pedido -->
          <UiCard title="Próximas ações" subtitle="Sugestões pela situação atual">
            <div class="od-suggest">
              <UiButton
                v-if="canRefund"
                variant="danger"
                size="sm"
                block
                :loading="refundBusy"
                @click="confirmRefund"
              >Reembolsar pedido</UiButton>
              <UiButton
                variant="subtle"
                size="sm"
                block
                :loading="invoiceBusy"
                @click="openInvoiceConfirm"
              >{{ invoice ? 'Reemitir NF-e' : 'Emitir NF-e' }}</UiButton>
              <UiButton
                v-if="canTrack"
                variant="ghost"
                size="sm"
                block
                @click="openTracking"
              >Ver rastreio</UiButton>
              <UiButton variant="ghost" size="sm" block to="/orders">Voltar à lista</UiButton>
            </div>
          </UiCard>

          <!-- EventTimeline -->
          <UiCard title="Linha do tempo" subtitle="Eventos do pedido em ordem">
            <UiLoadingState v-if="timelineLoading" variant="skeleton" :skeleton-lines="4" />
            <ol v-else-if="timeline.length" class="od-timeline">
              <li v-for="(ev, i) in timeline" :key="i" class="od-tl-item" :data-tone="ev.tone">
                <span class="od-tl-dot" aria-hidden="true" />
                <div class="od-tl-body">
                  <div class="od-tl-head">
                    <span class="od-tl-title">{{ ev.title }}</span>
                    <UiStatusBadge v-if="ev.status" :status="ev.status" size="sm" />
                  </div>
                  <p v-if="ev.detail" class="od-tl-detail">{{ ev.detail }}</p>
                  <time v-if="ev.at" class="od-tl-time">{{ fmtDateTime(ev.at) }}</time>
                </div>
              </li>
            </ol>
            <UiEmptyState
              v-else
              title="Sem eventos ainda"
              description="As ações do pedido (pagamento, NF-e, notificações) aparecem aqui."
              icon="clock"
              compact
            />
          </UiCard>

          <!-- AskAiPanel -->
          <UiCard title="Perguntar à IA" subtitle="Assistente grounded sobre este pedido">
            <template #actions>
              <UiStatusBadge
                :status="aiOff ? 'inativo' : 'ativo'"
                :label="aiOff ? 'Indisponível' : 'Disponível'"
                size="sm"
              />
            </template>

            <form class="od-ai-form" @submit.prevent="ask">
              <UiFormField
                label="Sua pergunta"
                :error="aiError"
                :hint="aiOff
                  ? 'Assistente indisponível (sem chave de IA — fail-closed).'
                  : 'Ex.: este pedido pode ser reembolsado? (até ' + AI_MAX + ' caracteres)'"
              >
                <template #default="{ id, describedBy, hasError }">
                  <textarea
                    :id="id"
                    v-model="aiQuestion"
                    :aria-describedby="describedBy"
                    :aria-invalid="hasError ? 'true' : null"
                    :maxlength="AI_MAX"
                    :disabled="aiOff"
                    rows="3"
                    placeholder="Pergunte algo sobre o pedido…"
                    @blur="aiTouched = true"
                  />
                </template>
              </UiFormField>
              <div class="od-ai-actions">
                <UiButton
                  type="submit"
                  size="sm"
                  :loading="aiBusy"
                  :disabled="aiOff || !aiQuestion.trim() || aiQuestion.length > AI_MAX"
                >Perguntar</UiButton>
                <UiButton
                  v-if="aiAnswer || aiQuestion"
                  type="button"
                  variant="ghost"
                  size="sm"
                  @click="clearAi"
                >Limpar</UiButton>
              </div>
            </form>

            <div v-if="aiBusy" class="od-ai-loading">
              <UiLoadingState variant="spinner" title="Consultando o assistente…" />
            </div>
            <div v-else-if="aiAnswer" class="od-ai-answer" role="status" aria-live="polite">{{ aiAnswer }}</div>
            <UiEmptyState
              v-else-if="aiOff"
              title="Assistente indisponível"
              description="A IA está fail-closed (sem chave configurada). Configure ANTHROPIC_API_KEY para habilitar."
              icon="ai"
              compact
            />
          </UiCard>
        </div>
      </div>
    </template>

    <!-- EMPTY — sem id / pedido não encontrado (não é erro de rede) -->
    <template v-else-if="!loading && !loadError">
      <UiEmptyState
        title="Pedido não encontrado"
        description="Não localizamos este pedido. Ele pode ter sido removido ou o endereço está incorreto."
        icon="search"
      >
        <template #action>
          <UiButton to="/orders">Ver todos os pedidos</UiButton>
        </template>
      </UiEmptyState>
    </template>

    <!-- MODAL de rastreio -->
    <UiModal v-model:open="trackingOpen" title="Rastrear pedido" width="sm">
      <dl class="od-dl">
        <div class="od-dl-row">
          <dt>Código de rastreio</dt>
          <dd class="od-copy">
            <span class="ui-mono">{{ (order && order.tracking_code) || '—' }}</span>
            <UiButton
              v-if="order && order.tracking_code"
              variant="ghost"
              size="sm"
              @click="copy(order.tracking_code, 'código de rastreio')"
            >Copiar</UiButton>
          </dd>
        </div>
        <div class="od-dl-row">
          <dt>Situação</dt>
          <dd><UiStatusBadge v-if="order" :status="order.status" /></dd>
        </div>
      </dl>
      <p class="od-modal-note">
        O rastreio é fornecido pela transportadora a partir do código acima.
      </p>
      <template #footer>
        <UiButton variant="ghost" @click="trackingOpen = false">Fechar</UiButton>
      </template>
    </UiModal>
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
  UiDataTable,
  UiButton,
  UiModal,
  UiFormField,
  UiEmptyState,
  UiLoadingState,
  UiErrorState,
  useToast,
  useConfirm,
  format,
  resolveTone,
} from '../ui/index.js';
import * as api from '../api.js';

const route = useRoute();
const toast = useToast();
const confirm = useConfirm();

const fmtCurrency = (v) => format.formatCurrency(v);
const fmtDateTime = (v) => format.formatDateTime(v);
const fmtEvent = (v) => format.humanize(v || 'notificação');

// ---- estado base ----
const order = ref(null);
const loading = ref(false);
const loadError = ref('');

const payment = ref(null);
const paymentLoading = ref(false);
const paymentError = ref('');

const invoice = ref(null);
const invoiceBusy = ref(false);

const orderNotifications = ref([]);
const notificationsLoading = ref(false);

const refundBusy = ref(false);

const AI_MAX = 500; // guarda anti-abuso do prompt grounded
const aiQuestion = ref('');
const aiAnswer = ref('');
const aiBusy = ref(false);
const aiOff = ref(false);
const aiTouched = ref(false);
// feedback inline padronizado pelo kit (UiFormField :error): só após interação (blur).
const aiError = computed(() => {
  if (!aiTouched.value) return '';
  const q = aiQuestion.value.trim();
  if (!q) return 'Escreva sua pergunta antes de enviar.';
  if (aiQuestion.value.length > AI_MAX) return 'A pergunta excede ' + AI_MAX + ' caracteres.';
  return '';
});

const trackingOpen = ref(false);

const orderId = computed(() => route.params.id);

// ---- helper de cópia (clipboard com fallback honesto) ----
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

// ---- API com degradação graciosa (resourceFactory pode existir ou não) ----
// orders: o integrador expõe api.orders (resourceFactory). Para a tela continuar VIVA
// mesmo se o recurso ainda não estiver publicado:
//   1) api.orders.get (leitura real GET /v1/orders/:id)
//   2) sem leitor ⇒ estado "não encontrado" (order=null), nunca um loadError que mata a tela.
async function fetchOrder(id) {
  const fn = api.orders && typeof api.orders.get === 'function' && api.orders.get;
  if (!fn) return undefined; // sem leitor → cai em "não encontrado", tela permanece honesta
  const r = await fn(id);
  return r && r.data ? r.data : r;
}

// trilha de auditoria do checkout → /v1/checkout/audit (api.checkout.audit OU store)
async function fetchCheckoutAudit() {
  if (api.checkout && typeof api.checkout.audit === 'function') {
    const r = await api.checkout.audit();
    return Array.isArray(r) ? r : r && r.data ? r.data : [];
  }
  if (api.store && typeof api.store.checkoutAudit === 'function') {
    const r = await api.store.checkoutAudit();
    return Array.isArray(r) ? r : r && r.data ? r.data : [];
  }
  return [];
}

async function fetchNotifications() {
  if (api.notifications && typeof api.notifications.list === 'function') {
    const r = await api.notifications.list();
    return Array.isArray(r) ? r : r && r.data ? r.data : [];
  }
  if (api.store && typeof api.store.notifications === 'function') {
    return await api.store.notifications();
  }
  return [];
}

// saúde do assistente (fail-closed real): se a rota reporta ai:false, marcamos aiOff
// já na montagem para o painel exibir o estado honesto antes mesmo de uma tentativa.
async function probeAssistant() {
  try {
    let r;
    if (api.assistant && typeof api.assistant.health === 'function') {
      r = await api.assistant.health();
    } else if (api.store && typeof api.store.assistantHealth === 'function') {
      r = await api.store.assistantHealth();
    } else {
      return;
    }
    aiOff.value = !(r && r.ai);
  } catch {
    // health falhou: não bloqueamos o painel — a tentativa real revela 503 se for o caso.
  }
}

// ---- carregamento ----
async function load() {
  loading.value = true;
  loadError.value = '';
  try {
    const result = await fetchOrder(orderId.value);
    order.value = result || null; // undefined (sem leitor) ⇒ "não encontrado", tela viva
    if (order.value) {
      // dados satélite carregam em paralelo, sem derrubar a tela
      loadPayment();
      loadNotifications();
    }
  } catch (e) {
    if (e && e.status === 404) {
      order.value = null; // cai no estado "não encontrado"
    } else {
      loadError.value = (e && e.message) || 'Falha ao carregar o pedido.';
    }
  } finally {
    loading.value = false;
  }
}

async function loadPayment() {
  paymentLoading.value = true;
  paymentError.value = '';
  try {
    const audit = await fetchCheckoutAudit();
    const code = order.value ? order.value.code : null;
    const id = order.value ? order.value.id : null;
    // casa o evento de auditoria com o pedido (por orderId/código quando disponível)
    const match = audit.filter((a) => {
      const oid = String(a.orderId || a.order_id || a.idempotencyKey || '');
      if (!oid) return false;
      return (code && oid.includes(String(code))) || (id != null && oid.includes(String(id)));
    });
    const ev = match.length ? match[match.length - 1] : null;
    payment.value = ev
      ? {
          transactionId: ev.transactionId || ev.transaction_id || ev.id || null,
          status: ev.status || order.value.payment_status || 'aguardando',
          provider: ev.provider || null,
          amount: ev.amount != null ? ev.amount : null,
          at: ev.at || null,
        }
      : null;
  } catch (e) {
    paymentError.value = (e && e.message) || 'Falha ao carregar a trilha de pagamento.';
  } finally {
    paymentLoading.value = false;
  }
}

async function loadNotifications() {
  notificationsLoading.value = true;
  try {
    const all = await fetchNotifications();
    const code = order.value ? order.value.code : null;
    const id = order.value ? order.value.id : null;
    // Vínculo HONESTO: só atribui a este pedido a notificação cujo payload referencia o
    // code/id do pedido. Sem correlação no backend ⇒ NÃO listamos tudo (seria enganoso —
    // o subtítulo promete "deste pedido"); cai no empty "nenhuma notificação vinculada".
    orderNotifications.value = all.filter((n) => {
      const p = n.payload || {};
      const oid = String(p.orderId || p.order_id || n.orderId || n.order_id || '');
      if (!oid) return false;
      return (code && oid.includes(String(code))) || (id != null && oid.includes(String(id)));
    });
  } catch {
    orderNotifications.value = [];
  } finally {
    notificationsLoading.value = false;
  }
}

const timelineLoading = computed(() => notificationsLoading.value || paymentLoading.value);

// ---- canais de notificação (degradação graciosa multicanal) ----
function channelsOf(n) {
  const list = Array.isArray(n && n.channels) ? n.channels : [];
  return list.map((c) =>
    typeof c === 'string'
      ? { channel: c, status: 'sent' }
      : { channel: c.channel || c.name || 'canal', status: c.status || 'sent' },
  );
}
function channelLabel(c) {
  const map = { email: 'E-mail', push: 'Push', whatsapp: 'WhatsApp', sms: 'SMS' };
  const name = map[String(c.channel).toLowerCase()] || format.humanize(c.channel);
  return name;
}

// ---- ações ----
async function confirmRefund() {
  if (!canRefund.value) return;
  const ok = await confirm({
    title: 'Reembolsar pedido',
    message:
      'Esta ação estorna o pagamento de ' +
      fmtCurrency(order.value.total) +
      ' do pedido ' +
      (order.value.code || '') +
      '. Deseja continuar?',
    confirmLabel: 'Reembolsar',
    danger: true,
  });
  if (!ok) return;
  refundBusy.value = true;
  try {
    if (api.orders && typeof api.orders.update === 'function') {
      const updated = await api.orders.update(orderId.value, {
        status: 'reembolsado',
        paymentStatus: 'estornado',
      });
      order.value = (updated && updated.data ? updated.data : updated) || order.value;
    } else {
      order.value = { ...order.value, status: 'reembolsado', payment_status: 'estornado' };
    }
    toast.success('Pedido reembolsado.');
    loadPayment();
  } catch (e) {
    toast.error('Não foi possível reembolsar.', { detail: (e && e.message) || '' });
  } finally {
    refundBusy.value = false;
  }
}

async function openInvoiceConfirm() {
  if (!order.value) return;
  const reissue = !!invoice.value;
  const ok = await confirm({
    title: reissue ? 'Reemitir NF-e' : 'Emitir NF-e',
    message:
      'Emitir a nota fiscal do pedido ' +
      (order.value.code || '') +
      ' no valor de ' +
      fmtCurrency(order.value.total) +
      '?',
    confirmLabel: reissue ? 'Reemitir' : 'Emitir',
  });
  if (!ok) return;
  invoiceBusy.value = true;
  try {
    const orderRef = order.value.code || order.value.id;
    let r;
    if (api.invoices && typeof api.invoices.emit === 'function') {
      r = await api.invoices.emit(orderRef, order.value.total);
    } else if (api.store && typeof api.store.emitInvoice === 'function') {
      r = await api.store.emitInvoice(orderRef, order.value.total);
    } else {
      throw new Error('Recurso de notas fiscais indisponível.');
    }
    invoice.value = r && r.data ? r.data : r;
    toast.success(reissue ? 'NF-e reemitida.' : 'NF-e emitida.', {
      detail: 'Protocolo ' + (invoice.value.protocol || '—'),
    });
  } catch (e) {
    toast.error('Falha ao emitir a NF-e.', { detail: (e && e.message) || '' });
  } finally {
    invoiceBusy.value = false;
  }
}

function openTracking() {
  if (!canTrack.value) {
    toast.info('Este pedido ainda não tem código de rastreio.');
    return;
  }
  trackingOpen.value = true;
}

async function ask() {
  aiTouched.value = true; // revela erro inline (vazio/excedente) ao tentar enviar
  const q = aiQuestion.value.trim();
  if (aiOff.value || !q || aiQuestion.value.length > AI_MAX) return;
  aiBusy.value = true;
  aiAnswer.value = '';
  const grounded =
    'Sobre o pedido ' +
    (order.value ? order.value.code || order.value.id : '') +
    ' (cliente ' +
    (order.value ? order.value.customer_name : '') +
    ', total ' +
    fmtCurrency(order.value ? order.value.total : 0) +
    ', situação ' +
    (order.value ? order.value.status : '') +
    '): ' +
    q;
  try {
    let r;
    if (api.assistant && typeof api.assistant.ask === 'function') {
      r = await api.assistant.ask(grounded);
    } else if (api.store && typeof api.store.assistant === 'function') {
      r = await api.store.assistant(grounded);
    } else {
      throw new Error('Assistente indisponível.');
    }
    aiAnswer.value = (r && (r.answer || r.message)) || 'Sem resposta.';
  } catch (e) {
    if (e && e.status === 503) {
      aiOff.value = true;
    } else {
      toast.error('O assistente não respondeu.', { detail: (e && e.message) || '' });
    }
  } finally {
    aiBusy.value = false;
  }
}

function clearAi() {
  aiAnswer.value = '';
  aiQuestion.value = '';
  aiTouched.value = false;
}

// ---- derivados de apresentação ----
const itemsCount = computed(() => {
  if (!order.value) return 0;
  return order.value.items_count != null ? order.value.items_count : itemRows.value.length;
});

const itemsHint = computed(() => (itemsCount.value ? itemsCount.value + ' item(ns)' : 'pedido'));

const itemColumns = [
  { key: 'name', label: 'Produto' },
  { key: 'qty', label: 'Qtd', align: 'center' },
  { key: 'unitPrice', label: 'Preço unit.', align: 'right' },
  { key: 'lineTotal', label: 'Subtotal', align: 'right' },
];

// O backend de pedidos guarda apenas o consolidado (total + items_count). Quando não há
// linha de itens detalhada, mostramos uma linha consolidada honesta (sem inventar produtos).
const itemRows = computed(() => {
  if (!order.value) return [];
  const detailed = order.value.items || order.value.line_items;
  if (Array.isArray(detailed) && detailed.length) {
    return detailed.map((it, i) => ({
      key: it.id != null ? 'i' + it.id : 'i' + i,
      name: it.name || it.desc || it.product_name || 'Item ' + (i + 1),
      qty: it.qty != null ? it.qty : it.quantity != null ? it.quantity : 1,
      unitPrice: it.price != null ? it.price : it.unitPrice,
      lineTotal:
        it.lineTotal != null
          ? it.lineTotal
          : Number(it.price || it.unitPrice || 0) * Number(it.qty || it.quantity || 1),
    }));
  }
  const count = order.value.items_count;
  if (count && count > 0) {
    const unit = Number(order.value.total || 0) / count;
    return [
      {
        key: 'consolidado',
        name: 'Itens do pedido (consolidado)',
        qty: count,
        unitPrice: unit,
        lineTotal: Number(order.value.total || 0),
      },
    ];
  }
  return [];
});

const itemsSubtitle = computed(() => {
  const detailed = order.value && (order.value.items || order.value.line_items);
  return Array.isArray(detailed) && detailed.length
    ? 'Produtos comprados neste pedido'
    : 'Visão consolidada (o pedido não armazena a linha de itens)';
});

const pageTitle = computed(() => {
  if (!order.value) return 'Detalhe do pedido';
  return order.value.code || 'Pedido #' + order.value.id;
});

const pageSubtitle = computed(() => {
  if (!order.value) return 'Visão 360 do pedido.';
  return (order.value.customer_name || 'Cliente') + ' · ' + fmtCurrency(order.value.total);
});

const paymentLabel = computed(() => {
  if (payment.value && payment.value.status) return format.humanize(payment.value.status);
  if (order.value && order.value.payment_status) return format.humanize(order.value.payment_status);
  return 'Aguardando';
});

const paymentTone = computed(() => {
  const s = (payment.value && payment.value.status) || (order.value && order.value.payment_status) || '';
  const tone = resolveTone(s);
  return tone === 'neutral' ? 'warning' : tone;
});

const paymentHint = computed(() => {
  if (payment.value && payment.value.provider) return payment.value.provider;
  return payment.value ? 'via gateway' : 'sem transação registrada';
});

const bannerTone = computed(() => (order.value ? resolveTone(order.value.status) : 'neutral'));

const bannerMessage = computed(() => {
  if (!order.value) return '';
  const map = {
    pendente: 'Pedido aguardando pagamento.',
    pago: 'Pagamento confirmado. Pronto para separação.',
    falha_pagamento: 'O pagamento falhou — verifique a transação.',
    em_separacao: 'Pedido em separação no estoque.',
    enviado: 'Pedido enviado ao cliente.',
    entregue: 'Pedido entregue.',
    reembolsado: 'Pedido reembolsado ao cliente.',
    cancelado: 'Pedido cancelado.',
  };
  return map[order.value.status] || 'Situação atual: ' + format.humanize(order.value.status);
});

const canRefund = computed(() => {
  if (!order.value) return false;
  const paid = ['pago', 'em_separacao', 'enviado', 'entregue'].includes(order.value.status);
  const notRefunded =
    order.value.status !== 'reembolsado' && order.value.payment_status !== 'estornado';
  return paid && notRefunded;
});

const canTrack = computed(() => !!(order.value && order.value.tracking_code));

// timeline a partir de pagamento + NF-e + notificações + marcos do pedido
const timeline = computed(() => {
  const events = [];
  if (order.value) {
    events.push({
      title: 'Pedido criado',
      detail: 'Pedido ' + (order.value.code || '#' + order.value.id) + ' registrado.',
      at: order.value.created_at,
      tone: 'neutral',
    });
  }
  if (payment.value) {
    events.push({
      title: 'Pagamento processado',
      detail: payment.value.provider ? 'Gateway: ' + payment.value.provider : '',
      status: payment.value.status,
      at: payment.value.at,
      tone: resolveTone(payment.value.status),
    });
  }
  if (invoice.value) {
    events.push({
      title: 'NF-e emitida',
      detail: 'Protocolo ' + (invoice.value.protocol || '—'),
      status: invoice.value.status,
      at: invoice.value.at,
      tone: resolveTone(invoice.value.status),
    });
  }
  for (const n of orderNotifications.value) {
    const sent = channelsOf(n)
      .filter((c) => c.status === 'sent')
      .map((c) => channelLabel(c));
    events.push({
      title: 'Notificação: ' + fmtEvent(n.event),
      detail: sent.length
        ? 'Enviada por ' + sent.join(', ')
        : 'Nenhum canal entregou (degradação graciosa)',
      status: n.status || 'sent',
      at: n.at,
      tone: resolveTone(n.status || 'sent'),
    });
  }
  // mais recentes primeiro (eventos sem data vão ao fim)
  return events.sort((a, b) => {
    const ta = a.at ? new Date(a.at).getTime() : 0;
    const tb = b.at ? new Date(b.at).getTime() : 0;
    return tb - ta;
  });
});

watch(orderId, () => {
  payment.value = null;
  invoice.value = null;
  orderNotifications.value = [];
  clearAi();
  load();
});

onMounted(() => {
  load();
  probeAssistant();
});
</script>

<style scoped>
/* KPIs */
.od-metrics {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: var(--ui-space-4);
}

/* banner de situação */
.od-banner {
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
.od-banner[data-tone='success'] { border-left-color: rgb(var(--ui-ok)); }
.od-banner[data-tone='warning'] { border-left-color: rgb(var(--ui-warn)); }
.od-banner[data-tone='error'] { border-left-color: rgb(var(--ui-danger)); }
.od-banner[data-tone='running'] { border-left-color: rgb(var(--ui-accent)); }
.od-banner-main { display: flex; align-items: center; gap: var(--ui-space-3); flex-wrap: wrap; }
.od-banner-text { font-weight: 600; }
.od-banner-meta { color: rgb(var(--ui-muted)); font-size: var(--ui-text-sm); }

/* layout principal */
.od-grid {
  display: grid;
  grid-template-columns: minmax(0, 2fr) minmax(0, 1fr);
  gap: var(--ui-space-4);
  align-items: start;
}
.od-col { display: flex; flex-direction: column; gap: var(--ui-space-4); }

/* utilitários locais (tokens --ui-* apenas) */
.od-muted { color: rgb(var(--ui-muted)); }

/* listas de definição (detalhe) */
.od-dl { display: flex; flex-direction: column; gap: var(--ui-space-2); margin: 0; }
.od-dl-row {
  display: grid;
  grid-template-columns: 130px 1fr;
  gap: var(--ui-space-3);
  align-items: baseline;
  padding-bottom: var(--ui-space-2);
  border-bottom: 1px solid rgb(var(--ui-border));
}
.od-dl-row:last-child { border-bottom: none; padding-bottom: 0; }
.od-dl dt { color: rgb(var(--ui-muted)); font-size: var(--ui-text-sm); }
.od-dl dd { margin: 0; font-weight: 500; word-break: break-word; }
.od-copy { display: flex; align-items: center; gap: var(--ui-space-2); flex-wrap: wrap; }

/* rodapé total da tabela de itens */
.od-foot-row { display: flex; align-items: center; justify-content: space-between; }
.od-foot-label { color: rgb(var(--ui-muted)); }
.od-foot-total { font-family: var(--ui-font-display); font-size: var(--ui-text-lg); }

/* ações sugeridas */
.od-suggest { display: flex; flex-direction: column; gap: var(--ui-space-2); }

/* notificações enviadas */
.od-notes { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--ui-space-3); }
.od-note {
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-2);
  padding: var(--ui-space-3);
  border: 1px solid rgb(var(--ui-border));
  border-radius: var(--ui-radius-md);
  background: rgb(var(--ui-surface-2));
}
.od-note-head { display: flex; align-items: center; justify-content: space-between; gap: var(--ui-space-2); }
.od-note-title { font-weight: 600; }
.od-note-channels { display: flex; gap: var(--ui-space-2); flex-wrap: wrap; }
.od-note-empty { color: rgb(var(--ui-muted)); font-size: var(--ui-text-sm); }
.od-note-time { color: rgb(var(--ui-muted)); font-size: var(--ui-text-xs); }

/* timeline */
.od-timeline { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; }
.od-tl-item { position: relative; display: flex; gap: var(--ui-space-3); padding: 0 0 var(--ui-space-4) var(--ui-space-1); }
.od-tl-item::before {
  content: '';
  position: absolute;
  left: 4px;
  top: 14px;
  bottom: 0;
  width: 2px;
  background: rgb(var(--ui-border));
}
.od-tl-item:last-child { padding-bottom: 0; }
.od-tl-item:last-child::before { display: none; }
.od-tl-dot {
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
.od-tl-item[data-tone='success'] .od-tl-dot { background: rgb(var(--ui-ok)); }
.od-tl-item[data-tone='warning'] .od-tl-dot { background: rgb(var(--ui-warn)); }
.od-tl-item[data-tone='error'] .od-tl-dot { background: rgb(var(--ui-danger)); }
.od-tl-item[data-tone='running'] .od-tl-dot { background: rgb(var(--ui-accent)); }
.od-tl-body { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
.od-tl-head { display: flex; align-items: center; gap: var(--ui-space-2); flex-wrap: wrap; }
.od-tl-title { font-weight: 600; }
.od-tl-detail { margin: 0; color: rgb(var(--ui-muted)); font-size: var(--ui-text-sm); }
.od-tl-time { color: rgb(var(--ui-muted)); font-size: var(--ui-text-xs); }

/* painel de IA — o textarea herda :deep(textarea) do UiFormField (sem CSS proprietário) */
.od-ai-form { display: flex; flex-direction: column; gap: var(--ui-space-3); }
.od-ai-actions { display: flex; gap: var(--ui-space-2); }
.od-ai-loading { margin-top: var(--ui-space-3); }
.od-ai-answer {
  margin: var(--ui-space-3) 0 0;
  white-space: pre-wrap;
  background: rgb(var(--ui-surface-2));
  border: 1px solid rgb(var(--ui-border));
  border-radius: var(--ui-radius-md);
  padding: var(--ui-space-3) var(--ui-space-4);
  font-size: var(--ui-text-sm);
}

.od-modal-note { margin: var(--ui-space-3) 0 0; color: rgb(var(--ui-muted)); font-size: var(--ui-text-sm); }

/* responsivo */
@media (max-width: 980px) {
  .od-grid { grid-template-columns: 1fr; }
  .od-metrics { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
@media (max-width: 560px) {
  .od-metrics { grid-template-columns: 1fr; }
  .od-dl-row { grid-template-columns: 1fr; gap: 2px; }
}
</style>
