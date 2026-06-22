<!--
  InvoiceDetailView — Detalhe da NF-e (REQ-SHOPDESK-0004).
  Dados, status SEFAZ, protocolo, XML, tentativas e histórico de submissões.
  Ações: reprocessar (quando DLQ/rejeitada) e baixar XML. Tudo sobre o kit ui-vue
  (tokens --ui-*), CSP-safe (sem style inline / :style / v-html), todos os estados, a11y.

  Componentes do refinement: DetailHeader (UiPageLayout #header/#actions + banner),
  FieldGrid (dl/dt/dd em UiCard), SefazTimeline (linha do tempo das etapas SEFAZ),
  RetryButton (UiButton danger via useConfirm), DownloadXmlLink (blob client-side).

  CONTRATO REAL (apps/shopdesk/api/src/server.js):
    POST /v1/invoices       → emite/reemite a NF-e (api.invoices.emit/reprocess; store.emitInvoice).
    GET  /v1/health/jobs    → saúde da fila (api.healthJobs).
  NÃO existe GET /v1/invoices/:id (leitura por id): a nota chega via ESTADO da navegação
  (Lista/Emissão passam o objeto em router state / query). Defensivo: se a esteira publicar
  api.invoices.get, ela vira a fonte preferida — sem mudar a tela. Sem state nem leitura → empty
  honesto. Reprocessar = REEMITIR (mesma rota POST /v1/invoices). Status do backend vem em inglês
  (authorized/received/…) → normalizado para o enum PT (autorizada/processando/…).
-->
<template>
  <UiPageLayout
    width="wide"
    eyebrow="Nota fiscal eletrônica"
    :title="pageTitle"
    :subtitle="pageSubtitle"
    :loading="loading"
    loading-message="Carregando a NF-e…"
    :error="loadError"
    @retry="load"
  >
    <!-- DetailHeader: ações -->
    <template #actions>
      <UiButton variant="ghost" to="/invoices">Voltar às notas</UiButton>
      <!-- DownloadXmlLink: o MOTIVO da indisponibilidade é exposto a leitores de tela
           (title + aria-label dinâmicos) — não apenas "botão indisponível". -->
      <UiButton
        variant="ghost"
        :disabled="!canDownloadXml"
        :title="canDownloadXml ? 'Baixar o XML autorizado' : xmlUnavailableReason"
        :aria-label="canDownloadXml ? 'Baixar XML' : 'Baixar XML — indisponível: ' + xmlUnavailableReason"
        @click="downloadXml"
      >Baixar XML</UiButton>
      <!-- RetryButton: só aparece habilitado em DLQ/rejeitada (ação com efeito colateral) -->
      <UiButton
        variant="danger"
        :disabled="!canReprocess"
        :loading="reprocessBusy"
        :title="reprocessHint"
        :aria-label="canReprocess ? 'Reprocessar NF-e' : 'Reprocessar — indisponível: ' + reprocessHint"
        @click="confirmReprocess"
      >Reprocessar</UiButton>
    </template>

    <!-- DetailHeader: banner de situação SEFAZ -->
    <template #banner>
      <div
        v-if="invoice"
        class="iv-banner"
        :data-tone="bannerTone"
        role="status"
      >
        <div class="iv-banner-main">
          <UiStatusBadge :status="invoice.status" :label="statusLabel(invoice.status)" size="lg" />
          <span class="iv-banner-text">{{ bannerMessage }}</span>
        </div>
        <span v-if="invoice.issuedAt" class="iv-banner-meta">Emitida {{ fmtDateTime(invoice.issuedAt) }}</span>
      </div>
    </template>

    <!-- CONTEÚDO normal -->
    <template v-if="invoice">
      <!-- KPIs -->
      <section class="iv-metrics" aria-label="Resumo da NF-e">
        <UiMetricCard
          label="Situação SEFAZ"
          :value="statusLabel(invoice.status)"
          :tone="metricTone"
          :hint="invoice.protocol ? 'protocolo emitido' : 'sem protocolo ainda'"
        />
        <UiMetricCard
          label="Valor total"
          :value="fmtCurrency(invoice.total)"
          tone="primary"
          :hint="'Pedido ' + (invoice.orderId || '—')"
        />
        <UiMetricCard
          label="Tentativas"
          :value="attemptsValue"
          :tone="attemptsTone"
          :hint="attemptsHint"
        />
        <UiMetricCard
          label="Fila / DLQ"
          :value="queueValue"
          :tone="queueTone"
          :hint="queueHint"
        />
      </section>

      <div class="iv-grid">
        <!-- COLUNA PRINCIPAL -->
        <div class="iv-col iv-col-main">
          <!-- FieldGrid: dados da NF-e -->
          <UiCard title="Dados da nota" subtitle="Identificação fiscal e valores">
            <template #actions>
              <UiStatusBadge :status="invoice.status" :label="statusLabel(invoice.status)" />
            </template>
            <dl class="iv-dl">
              <div class="iv-dl-row">
                <dt>Pedido</dt>
                <dd class="ui-mono">{{ invoice.orderId || '—' }}</dd>
              </div>
              <div class="iv-dl-row">
                <dt>Número</dt>
                <dd class="ui-mono">{{ invoice.number || '—' }}</dd>
              </div>
              <div class="iv-dl-row">
                <dt>Protocolo SEFAZ</dt>
                <dd class="ui-mono">{{ invoice.protocol || '—' }}</dd>
              </div>
              <div class="iv-dl-row">
                <dt>Recibo</dt>
                <dd class="ui-mono">{{ invoice.receipt || '—' }}</dd>
              </div>
              <div class="iv-dl-row">
                <dt>Total</dt>
                <dd>{{ fmtCurrency(invoice.total) }}</dd>
              </div>
              <div class="iv-dl-row">
                <dt>Situação</dt>
                <dd><UiStatusBadge :status="invoice.status" :label="statusLabel(invoice.status)" /></dd>
              </div>
              <div class="iv-dl-row">
                <dt>Tentativas</dt>
                <dd>{{ attemptsValue }}</dd>
              </div>
              <div class="iv-dl-row">
                <dt>Ambiente</dt>
                <dd>{{ modeLabel }}</dd>
              </div>
              <div class="iv-dl-row">
                <dt>Emitida em</dt>
                <dd>{{ invoice.issuedAt ? fmtDateTime(invoice.issuedAt) : '—' }}</dd>
              </div>
            </dl>
          </UiCard>

          <!-- Motivo de rejeição / último erro, quando houver -->
          <UiCard v-if="rejectionReason" title="Motivo da rejeição" subtitle="Retorno da SEFAZ">
            <p class="iv-reject" role="alert">{{ rejectionReason }}</p>
            <template #footer>
              <div class="iv-foot-row">
                <span class="ui-muted">Corrija a causa antes de reprocessar.</span>
                <UiButton
                  variant="danger"
                  size="sm"
                  :disabled="!canReprocess"
                  :loading="reprocessBusy"
                  @click="confirmReprocess"
                >Reprocessar agora</UiButton>
              </div>
            </template>
          </UiCard>

          <!-- DownloadXmlLink: XML autorizado -->
          <UiCard title="XML da NF-e" subtitle="Documento fiscal assinado">
            <template #actions>
              <UiButton
                variant="subtle"
                size="sm"
                :disabled="!canDownloadXml"
                @click="downloadXml"
              >Baixar XML</UiButton>
            </template>
            <div v-if="canDownloadXml" class="iv-xml">
              <p class="iv-xml-hint">
                O XML autorizado pode ser baixado para guarda fiscal e envio ao destinatário.
              </p>
              <pre class="iv-xml-preview ui-mono" aria-label="Prévia do XML">{{ xmlPreview }}</pre>
            </div>
            <UiEmptyState
              v-else
              title="XML indisponível"
              :description="xmlUnavailableReason"
              icon="doc"
            />
          </UiCard>
        </div>

        <!-- COLUNA LATERAL -->
        <div class="iv-col iv-col-side">
          <!-- SefazTimeline -->
          <UiCard title="Linha do tempo SEFAZ" subtitle="Etapas de submissão da nota">
            <ol class="iv-timeline">
              <li
                v-for="step in sefazSteps"
                :key="step.key"
                class="iv-tl-item"
                :data-state="step.state"
                :data-tone="step.tone"
              >
                <span class="iv-tl-dot" aria-hidden="true" />
                <div class="iv-tl-body">
                  <div class="iv-tl-head">
                    <span class="iv-tl-title">{{ step.title }}</span>
                    <UiStatusBadge
                      v-if="step.badge"
                      :status="step.badgeStatus"
                      :label="step.badge"
                      size="sm"
                      :with-dot="false"
                    />
                  </div>
                  <p class="iv-tl-detail">{{ step.detail }}</p>
                </div>
              </li>
            </ol>
          </UiCard>

          <!-- Histórico de submissões / tentativas -->
          <UiCard title="Histórico de submissões" subtitle="Tentativas registradas">
            <UiDataTable
              :columns="historyColumns"
              :rows="historyRows"
              row-key="key"
              density="compact"
              :empty="{
                title: 'Sem tentativas registradas',
                description: 'A primeira submissão aparece aqui assim que a nota for processada.',
              }"
            >
              <template #cell-status="{ value }">
                <UiStatusBadge :status="value" :label="statusLabel(value)" size="sm" />
              </template>
              <template #cell-at="{ value }">{{ value ? fmtDateTime(value) : '—' }}</template>
            </UiDataTable>
          </UiCard>

          <!-- Saúde da fila (contexto da DLQ) -->
          <UiCard title="Saúde da fila" subtitle="Processamento assíncrono de notas">
            <UiLoadingState v-if="jobsLoading" variant="skeleton" :skeleton-lines="3" />
            <UiErrorState
              v-else-if="jobsError"
              :message="jobsError"
              @retry="loadJobs"
            />
            <dl v-else-if="jobs" class="iv-dl iv-dl-compact">
              <div class="iv-dl-row">
                <dt>Na fila</dt>
                <dd>{{ jobs.queued ?? 0 }}</dd>
              </div>
              <div class="iv-dl-row">
                <dt>Processando</dt>
                <dd>{{ jobs.running ?? 0 }}</dd>
              </div>
              <div class="iv-dl-row">
                <dt>Concluídas</dt>
                <dd>{{ jobs.done ?? 0 }}</dd>
              </div>
              <div class="iv-dl-row">
                <dt>Em DLQ</dt>
                <dd>
                  <UiStatusBadge
                    :status="(jobs.dlq || 0) > 0 ? 'dlq' : 'ok'"
                    :label="String(jobs.dlq ?? 0)"
                  />
                </dd>
              </div>
            </dl>
            <UiEmptyState
              v-else
              title="Sem dados da fila"
              description="Não foi possível obter o estado da fila de processamento."
              icon="clock"
            >
              <template #action>
                <UiButton variant="subtle" size="sm" @click="loadJobs">Atualizar</UiButton>
              </template>
            </UiEmptyState>
          </UiCard>
        </div>
      </div>
    </template>

    <!-- EMPTY — nota não encontrada (não é erro de rede) -->
    <template v-else-if="!loading && !loadError">
      <UiEmptyState
        title="NF-e não encontrada"
        :description="notFoundReason"
        icon="search"
      >
        <template #action>
          <UiButton to="/invoices">Ver todas as notas</UiButton>
        </template>
      </UiEmptyState>
    </template>
  </UiPageLayout>
</template>

<script setup>
import { ref, computed, watch, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import {
  UiPageLayout,
  UiCard,
  UiMetricCard,
  UiStatusBadge,
  UiDataTable,
  UiButton,
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
const router = useRouter();
const toast = useToast();
const confirm = useConfirm();

const fmtCurrency = (v) => format.formatCurrency(v);
const fmtDateTime = (v) => format.formatDateTime(v);

// ---- estado base ----
const invoice = ref(null);
const loading = ref(false);
const loadError = ref('');
const notFound = ref(false);
const unavailable = ref(false); // recurso /v1/invoices/:id ainda não exposto pelo integrador

const jobs = ref(null);
const jobsLoading = ref(false);
const jobsError = ref('');

const reprocessBusy = ref(false);

const invoiceId = computed(() => route.params.id);

// ---- rótulos do domínio NF-e (status ENUM do schema) ----
const STATUS_LABELS = {
  enfileirada: 'Enfileirada',
  processando: 'Processando',
  autorizada: 'Autorizada',
  rejeitada: 'Rejeitada',
  dlq: 'DLQ (falha)',
};
// O backend fiscal (fiscal-service + fiscal-kit) devolve status em INGLÊS/SEFAZ
// ('authorized', 'received', 'rejected'…). O domínio da tela usa o enum em PT
// (autorizada/processando/rejeitada/enfileirada/dlq). Normalizamos sem inventar:
// termos desconhecidos passam adiante (statusLabel ainda os humaniza).
const STATUS_ALIASES = {
  authorized: 'autorizada',
  autorizado: 'autorizada',
  approved: 'autorizada',
  received: 'processando',
  processing: 'processando',
  processando: 'processando',
  queued: 'enfileirada',
  pending: 'enfileirada',
  enqueued: 'enfileirada',
  rejected: 'rejeitada',
  rejeitado: 'rejeitada',
  denied: 'rejeitada',
  failed: 'dlq',
  dead: 'dlq',
  dlq: 'dlq',
};
function normalizeStatus(status) {
  if (status === null || status === undefined || status === '') return 'enfileirada';
  const key = String(status).toLowerCase();
  return STATUS_ALIASES[key] || key;
}
function statusLabel(status) {
  if (status === null || status === undefined || status === '') return '—';
  const key = normalizeStatus(status);
  return STATUS_LABELS[key] || format.humanize(status);
}

// ---- normalização (o backend devolve campos variados; honestos sem inventar) ----
function normalizeInvoice(raw) {
  if (!raw) return null;
  const d = raw && raw.data ? raw.data : raw;
  return {
    id: d.id != null ? d.id : invoiceId.value,
    orderId: d.orderId || d.order_id || null,
    number: d.number || d.numero || null,
    protocol: d.protocol || d.protocolo || null,
    receipt: d.receipt || d.recibo || null,
    total: d.total != null ? d.total : null,
    status: normalizeStatus(d.status),
    attempts: d.attempts != null ? d.attempts : (d.tentativas != null ? d.tentativas : null),
    issuedAt: d.issuedAt || d.issued_at || d.emittedAt || null,
    mode: d.mode || d.ambiente || null,
    xml: d.xml || null,
    rejectionReason: d.rejectionReason || d.reason || d.lastError || d.last_error || null,
    history: Array.isArray(d.history) ? d.history : (Array.isArray(d.submissions) ? d.submissions : null),
  };
}

// ---- fonte REAL da nota ----------------------------------------------------
// O backend expõe SÓ POST /v1/invoices (emissão) — não há GET /v1/invoices/:id.
// Por isso a fonte primária do detalhe é o ESTADO DA NAVEGAÇÃO: a Lista/Emissão
// passam a nota inteira em `router state` (ou nos campos de query) ao abrir o detalhe.
// Quando a esteira publicar a leitura (api.invoices.get), ela vira a fonte preferida.
// Nada é inventado: sem state e sem rota de leitura → estado degradado honesto.
function invoiceFromNavState() {
  // 1) state da navegação (vue-router state → history.state). Preferido: dado real e completo.
  const st = (history && history.state) || {};
  if (st && st.invoice && typeof st.invoice === 'object') return st.invoice;
  // 2) query (?orderId=&total=&status=&protocol=…): reconstrução parcial honesta a partir do link.
  const q = route.query || {};
  if (q.orderId || q.order || q.number || q.total != null || q.status) {
    return {
      id: invoiceId.value,
      orderId: q.orderId || q.order || null,
      number: q.number || null,
      total: q.total != null ? Number(q.total) : null,
      status: q.status || null,
      protocol: q.protocol || null,
    };
  }
  return null;
}

async function fetchInvoice(id) {
  // (a) leitura por id quando a esteira a expuser (fonte preferida, dado fresco).
  if (api.invoices && typeof api.invoices.get === 'function') {
    return await api.invoices.get(id);
  }
  // (b) estado da navegação (Lista/Emissão) — fonte real disponível hoje.
  const fromNav = invoiceFromNavState();
  if (fromNav) return fromNav;
  // (c) sem leitura por id e sem state → degrada honestamente (não inventa rota).
  unavailable.value = true;
  return null;
}

async function load() {
  loading.value = true;
  loadError.value = '';
  notFound.value = false;
  unavailable.value = false;
  try {
    const raw = await fetchInvoice(invoiceId.value);
    if (!raw && unavailable.value) {
      invoice.value = null;
    } else if (!raw) {
      invoice.value = null;
      notFound.value = true;
    } else {
      invoice.value = normalizeInvoice(raw);
    }
    loadJobs();
  } catch (e) {
    if (e && e.status === 404) {
      invoice.value = null;
      notFound.value = true;
    } else {
      loadError.value = (e && e.message) || 'Falha ao carregar a NF-e.';
    }
  } finally {
    loading.value = false;
  }
}

async function loadJobs() {
  jobsLoading.value = true;
  jobsError.value = '';
  try {
    // Rota REAL: GET /v1/health/jobs → { status, jobs:{queued,running,done,dlq} }.
    // O client a exporta como `api.healthJobs` (top-level). Mantemos os aliases
    // defensivos para clients futuros, mas a fonte canônica é api.healthJobs.
    let res = null;
    if (typeof api.healthJobs === 'function') {
      res = await api.healthJobs();
    } else if (api.health && typeof api.health.jobs === 'function') {
      res = await api.health.jobs();
    } else if (api.store && typeof api.store.healthJobs === 'function') {
      res = await api.store.healthJobs();
    }
    if (res) {
      jobs.value = res.jobs || res.data || res;
    } else {
      jobs.value = null;
    }
  } catch (e) {
    jobsError.value = (e && e.message) || 'Falha ao consultar a fila de processamento.';
    jobs.value = null;
  } finally {
    jobsLoading.value = false;
  }
}

// ---- ação: reprocessar (RetryButton) ----
async function confirmReprocess() {
  if (!canReprocess.value || !invoice.value) return;
  const ok = await confirm({
    title: 'Reprocessar NF-e',
    message:
      'Reenviar a nota do pedido ' + (invoice.value.orderId || invoice.value.id) +
      ' à SEFAZ? A situação atual é "' + statusLabel(invoice.value.status) + '".',
    confirmLabel: 'Reprocessar',
    danger: true,
  });
  if (!ok) return;
  reprocessBusy.value = true;
  try {
    // Reprocessar = REEMITIR via POST /v1/invoices (rota REAL e idempotente por pedido).
    // Assinatura real do client: (orderId, total). Não há rota dedicada de reprocess no
    // backend — reusamos a emissão, que é exatamente o reenfileiramento da nota.
    const orderRef = invoice.value.orderId || invoice.value.id;
    const total = invoice.value.total;
    let r;
    if (api.invoices && typeof api.invoices.reprocess === 'function') {
      r = await api.invoices.reprocess(orderRef, total);
    } else if (api.invoices && typeof api.invoices.emit === 'function') {
      r = await api.invoices.emit(orderRef, total);
    } else if (api.store && typeof api.store.emitInvoice === 'function') {
      r = await api.store.emitInvoice(orderRef, total);
    } else {
      throw new Error('Reprocessamento indisponível para este recurso.');
    }
    const updated = normalizeInvoice(r);
    if (updated) invoice.value = { ...invoice.value, ...updated };
    toast.success('NF-e reenfileirada para reprocessamento.', {
      detail: invoice.value.protocol ? 'Protocolo ' + invoice.value.protocol : '',
    });
    loadJobs();
  } catch (e) {
    toast.error('Não foi possível reprocessar a NF-e.', { detail: (e && e.message) || '' });
  } finally {
    reprocessBusy.value = false;
  }
}

// ---- ação: baixar XML (DownloadXmlLink) — blob client-side, CSP-safe ----
function downloadXml() {
  if (!canDownloadXml.value || typeof document === 'undefined') return;
  try {
    const blob = new Blob([invoice.value.xml], { type: 'application/xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'nfe-' + (invoice.value.protocol || invoice.value.id || 'documento') + '.xml';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success('Download do XML iniciado.');
  } catch (e) {
    toast.error('Falha ao baixar o XML.', { detail: (e && e.message) || '' });
  }
}

// ---- derivados de apresentação ----
const pageTitle = computed(() => {
  if (!invoice.value) return 'Detalhe da NF-e';
  if (invoice.value.number) return 'NF-e ' + invoice.value.number;
  return 'NF-e do pedido ' + (invoice.value.orderId || invoice.value.id);
});

const pageSubtitle = computed(() => {
  if (!invoice.value) return 'Dados, status SEFAZ, protocolo, XML e tentativas.';
  return statusLabel(invoice.value.status) + ' · ' + fmtCurrency(invoice.value.total);
});

const isDlq = computed(() => invoice.value && String(invoice.value.status).toLowerCase() === 'dlq');
const isRejected = computed(() => invoice.value && String(invoice.value.status).toLowerCase() === 'rejeitada');
const isAuthorized = computed(() => invoice.value && String(invoice.value.status).toLowerCase() === 'autorizada');

const canReprocess = computed(() => !reprocessBusy.value && (isDlq.value || isRejected.value));
const canDownloadXml = computed(() => !!(invoice.value && invoice.value.xml));

// Motivo legível do estado do botão Reprocessar (exposto a leitores de tela via title/aria-label).
const reprocessHint = computed(() => {
  if (!invoice.value) return 'Carregue a nota para reprocessar.';
  if (reprocessBusy.value) return 'Reprocessamento em andamento…';
  if (canReprocess.value) return 'Reenviar a nota à SEFAZ';
  if (isAuthorized.value) return 'A nota já está autorizada — nada a reprocessar.';
  return 'Reprocessar só é possível para notas rejeitadas ou na DLQ.';
});

const xmlUnavailableReason = computed(() => {
  if (!invoice.value) return 'A nota ainda não foi carregada.';
  if (!isAuthorized.value) return 'O XML fica disponível após a autorização pela SEFAZ.';
  return 'Esta nota não trouxe o XML no retorno; consulte novamente após o processamento.';
});

const xmlPreview = computed(() => {
  const x = invoice.value && invoice.value.xml;
  if (!x) return '';
  const s = String(x);
  return s.length > 1200 ? s.slice(0, 1200) + '\n…' : s;
});

const rejectionReason = computed(() => {
  if (!invoice.value) return '';
  if (invoice.value.rejectionReason) return invoice.value.rejectionReason;
  if (isRejected.value) return 'A SEFAZ rejeitou a nota. Verifique os dados fiscais e reprocesse.';
  if (isDlq.value) return 'A nota esgotou as tentativas de envio e foi para a DLQ.';
  return '';
});

const modeLabel = computed(() => {
  const m = invoice.value && invoice.value.mode;
  if (!m) return '—';
  const map = { sandbox: 'Sandbox', homolog: 'Homologação', real: 'Produção', producao: 'Produção' };
  return map[String(m).toLowerCase()] || format.humanize(m);
});

const attemptsValue = computed(() => {
  const a = invoice.value && invoice.value.attempts;
  return a != null ? a : '—';
});
const attemptsHint = computed(() => {
  const a = invoice.value && invoice.value.attempts;
  if (a == null) return 'sem registro de tentativas';
  return a === 1 ? '1 envio realizado' : a + ' envios realizados';
});
const attemptsTone = computed(() => {
  const a = invoice.value && invoice.value.attempts;
  if (a == null) return 'neutral';
  if (a >= 3) return 'error';
  if (a >= 2) return 'warning';
  return 'neutral';
});

const bannerTone = computed(() => (invoice.value ? resolveTone(invoice.value.status) : 'neutral'));
const metricTone = computed(() => {
  const t = invoice.value ? resolveTone(invoice.value.status) : 'neutral';
  return t === 'neutral' ? 'running' : t;
});

const bannerMessage = computed(() => {
  if (!invoice.value) return '';
  const map = {
    enfileirada: 'Nota na fila aguardando processamento.',
    processando: 'Nota sendo submetida à SEFAZ.',
    autorizada: 'Nota autorizada pela SEFAZ.',
    rejeitada: 'A SEFAZ rejeitou a nota — corrija e reprocesse.',
    dlq: 'Esgotou as tentativas e foi para a DLQ — reprocesse após a correção.',
  };
  const key = String(invoice.value.status).toLowerCase();
  return map[key] || ('Situação atual: ' + statusLabel(invoice.value.status));
});

// SefazTimeline — etapas canônicas da emissão NF-e (enfileirada → processando → resultado)
const sefazSteps = computed(() => {
  const status = invoice.value ? String(invoice.value.status).toLowerCase() : 'enfileirada';
  const order = ['enfileirada', 'processando', 'autorizada'];
  const idx = order.indexOf(status);
  const failed = status === 'rejeitada' || status === 'dlq';

  function stateFor(stepIdx) {
    if (failed) {
      // até "processando" já passou; o passo final é o de falha
      return stepIdx <= 1 ? 'done' : 'pending';
    }
    if (idx < 0) return stepIdx === 0 ? 'current' : 'pending';
    if (stepIdx < idx) return 'done';
    if (stepIdx === idx) return status === 'autorizada' ? 'done' : 'current';
    return 'pending';
  }

  const steps = [
    {
      key: 'enfileirada',
      title: 'Enfileirada',
      detail: 'Nota colocada na fila de submissão (worker transacional).',
    },
    {
      key: 'processando',
      title: 'Processando',
      detail: 'Construção, assinatura e envio do lote à SEFAZ.',
    },
    {
      key: 'resultado',
      title: failed ? (status === 'dlq' ? 'DLQ (falha)' : 'Rejeitada') : 'Autorizada',
      detail: failed
        ? (status === 'dlq'
            ? 'Envio falhou após esgotar as tentativas.'
            : 'A SEFAZ recusou a nota com motivo.')
        : (invoice.value && invoice.value.protocol
            ? 'Autorizada — protocolo ' + invoice.value.protocol + '.'
            : 'Aguardando o retorno de autorização da SEFAZ.'),
    },
  ];

  return steps.map((s, i) => {
    const isResult = i === 2;
    const state = isResult && failed ? 'failed' : stateFor(i);
    let tone = 'neutral';
    if (state === 'done') tone = 'success';
    else if (state === 'current') tone = 'running';
    else if (state === 'failed') tone = 'error';
    const badge =
      state === 'done' ? 'Concluído'
      : state === 'current' ? 'Em andamento'
      : state === 'failed' ? statusLabel(status)
      : 'Pendente';
    const badgeStatus =
      state === 'done' ? 'done'
      : state === 'current' ? 'processing'
      : state === 'failed' ? status
      : 'pending';
    return { ...s, state, tone, badge, badgeStatus };
  });
});

// Histórico de submissões — usa o histórico real quando vier; senão deriva a tentativa corrente.
const historyColumns = [
  { key: 'attempt', label: '#', align: 'center' },
  { key: 'status', label: 'Situação' },
  { key: 'protocol', label: 'Protocolo' },
  { key: 'at', label: 'Quando' },
];
const historyRows = computed(() => {
  if (!invoice.value) return [];
  if (Array.isArray(invoice.value.history) && invoice.value.history.length) {
    return invoice.value.history.map((h, i) => ({
      key: 'h' + i,
      attempt: h.attempt != null ? h.attempt : i + 1,
      status: h.status || invoice.value.status,
      protocol: h.protocol || h.protocolo || '—',
      at: h.at || h.created_at || null,
    }));
  }
  // sem histórico detalhado: representa a(s) tentativa(s) consolidada(s) sem inventar dados.
  // Clampa o valor vindo do backend (não validado): ignora não-finitos/negativos e limita a 50
  // para a tabela não explodir se `attempts` vier absurdo. Mantém a derivação honesta e segura.
  if (invoice.value.attempts == null) return [];
  const parsed = Number(invoice.value.attempts);
  if (!Number.isFinite(parsed)) return [];
  const n = Math.min(Math.max(Math.trunc(parsed), 0), 50);
  if (n <= 0) return [];
  const rows = [];
  for (let i = 1; i <= n; i++) {
    rows.push({
      key: 'a' + i,
      attempt: i,
      status: i === n ? invoice.value.status : 'processando',
      protocol: i === n ? (invoice.value.protocol || '—') : '—',
      at: i === n ? invoice.value.issuedAt : null,
    });
  }
  return rows;
});

// KPIs da fila
const queueValue = computed(() => (jobs.value ? (jobs.value.dlq ?? 0) : '—'));
const queueHint = computed(() => {
  if (!jobs.value) return jobsLoading.value ? 'consultando…' : 'fila indisponível';
  return (jobs.value.queued ?? 0) + ' na fila · ' + (jobs.value.running ?? 0) + ' processando';
});
const queueTone = computed(() => {
  if (!jobs.value) return 'neutral';
  return (jobs.value.dlq || 0) > 0 ? 'error' : 'success';
});

const notFoundReason = computed(() => {
  if (unavailable.value) {
    return 'Esta API ainda não expõe a leitura de uma NF-e por id (GET /v1/invoices/:id). ' +
      'Abra a nota a partir da lista (que carrega os dados) ou da tela de emissão. ' +
      'Quando a esteira publicar a leitura, esta tela passa a carregá-la diretamente.';
  }
  return 'Não localizamos esta NF-e. Ela pode ter sido removida ou o endereço está incorreto.';
});

// ---- ciclo de vida ----
watch(invoiceId, () => {
  invoice.value = null;
  jobs.value = null;
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
.iv-banner[data-tone="running"] { border-left-color: rgb(var(--ui-accent)); }
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

/* listas de definição (FieldGrid) */
.iv-dl { display: flex; flex-direction: column; gap: var(--ui-space-2); margin: 0; }
.iv-dl-row {
  display: grid;
  grid-template-columns: 150px 1fr;
  gap: var(--ui-space-3);
  align-items: baseline;
  padding-bottom: var(--ui-space-2);
  border-bottom: 1px solid rgb(var(--ui-border));
}
.iv-dl-row:last-child { border-bottom: none; padding-bottom: 0; }
.iv-dl dt { color: rgb(var(--ui-muted)); font-size: var(--ui-text-sm); }
.iv-dl dd { margin: 0; font-weight: 500; word-break: break-word; }
.iv-dl-compact .iv-dl-row { grid-template-columns: 1fr auto; }

/* motivo de rejeição */
.iv-reject {
  margin: 0;
  color: rgb(var(--ui-danger));
  font-weight: 500;
  background: rgb(var(--ui-danger) / 0.08);
  border: 1px solid rgb(var(--ui-danger) / 0.30);
  border-radius: var(--ui-radius-md);
  padding: var(--ui-space-3) var(--ui-space-4);
}
.iv-foot-row { display: flex; align-items: center; justify-content: space-between; gap: var(--ui-space-3); flex-wrap: wrap; }

/* XML */
.iv-xml { display: flex; flex-direction: column; gap: var(--ui-space-3); }
.iv-xml-hint { margin: 0; color: rgb(var(--ui-muted)); font-size: var(--ui-text-sm); }
.iv-xml-preview {
  margin: 0;
  max-height: 260px;
  overflow: auto;
  white-space: pre-wrap;
  word-break: break-word;
  background: rgb(var(--ui-surface-2));
  border: 1px solid rgb(var(--ui-border));
  border-radius: var(--ui-radius-md);
  padding: var(--ui-space-3) var(--ui-space-4);
  font-size: var(--ui-text-xs);
  line-height: 1.5;
}

/* SefazTimeline */
.iv-timeline { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; }
.iv-tl-item { position: relative; display: flex; gap: var(--ui-space-3); padding: 0 0 var(--ui-space-4) var(--ui-space-1); }
.iv-tl-item::before {
  content: "";
  position: absolute;
  left: 5px;
  top: 16px;
  bottom: 0;
  width: 2px;
  background: rgb(var(--ui-border));
}
.iv-tl-item[data-state="done"]::before { background: rgb(var(--ui-ok)); }
.iv-tl-item:last-child { padding-bottom: 0; }
.iv-tl-item:last-child::before { display: none; }
.iv-tl-dot {
  position: relative;
  z-index: 1;
  flex-shrink: 0;
  width: 12px;
  height: 12px;
  margin-top: 4px;
  border-radius: 50%;
  background: rgb(var(--ui-faint));
  box-shadow: 0 0 0 3px rgb(var(--ui-surface));
}
.iv-tl-item[data-tone="success"] .iv-tl-dot { background: rgb(var(--ui-ok)); }
.iv-tl-item[data-tone="warning"] .iv-tl-dot { background: rgb(var(--ui-warn)); }
.iv-tl-item[data-tone="error"] .iv-tl-dot { background: rgb(var(--ui-danger)); }
.iv-tl-item[data-tone="running"] .iv-tl-dot {
  background: rgb(var(--ui-accent));
  box-shadow: 0 0 0 3px rgb(var(--ui-accent) / 0.20);
}
.iv-tl-item[data-state="pending"] .iv-tl-title { color: rgb(var(--ui-muted)); }
.iv-tl-body { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
.iv-tl-head { display: flex; align-items: center; gap: var(--ui-space-2); flex-wrap: wrap; }
.iv-tl-title { font-weight: 600; }
.iv-tl-detail { margin: 0; color: rgb(var(--ui-muted)); font-size: var(--ui-text-sm); }

/* responsivo */
@media (max-width: 980px) {
  .iv-grid { grid-template-columns: 1fr; }
  .iv-metrics { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
@media (max-width: 560px) {
  .iv-metrics { grid-template-columns: 1fr; }
  .iv-dl-row { grid-template-columns: 1fr; gap: 2px; }
  .iv-dl-compact .iv-dl-row { grid-template-columns: 1fr auto; }
}
</style>
