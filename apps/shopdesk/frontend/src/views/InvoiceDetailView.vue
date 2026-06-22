<!--
  InvoiceDetailView — Detalhe da NF-e (REQ-SHOPDESK-0004).
  Dados, status SEFAZ, protocolo, XML, tentativas e histórico de submissões.
  Ações: reprocessar (somente DLQ/rejeitada, via useConfirm) e baixar XML (blob client-side).
  100% sobre o kit ui-vue (tokens --ui-*), CSP-safe (sem style inline / :style / v-html),
  todos os estados (loading / error / empty / degradado / normal), a11y e responsivo.

  Componentes do refinement:
    DetailHeader     → UiPageLayout (eyebrow/title/subtitle) + #actions + #banner.
    FieldGrid        → <dl>/<dt>/<dd> dentro de UiCard.
    SefazTimeline    → <ol> semântico com estados (done/current/pending/failed).
    RetryButton      → UiButton variant=danger, habilitado só em DLQ/rejeitada, via useConfirm.
    DownloadXmlLink  → download por Blob/URL.createObjectURL (sem inline; só quando há XML real).

  CONTRATO REAL DO BACKEND (apps/shopdesk/api/src/server.js):
    POST /v1/invoices     → emite/reemite a NF-e (api.invoices.emit / api.invoices.reprocess;
                            também api.store.emitInvoice). É idempotente por pedido — por isso
                            "reprocessar" == "reemitir" (não há rota dedicada de reprocess).
    GET  /v1/health/jobs  → saúde da fila { status, jobs:{queued,running,done,dlq} } (api.healthJobs).
  NÃO existe GET /v1/invoices/:id: a nota chega pelo ESTADO da navegação (a Lista/Emissão
  passam o objeto em router state / query). Se a esteira publicar api.invoices.get, ela vira a
  fonte preferida — sem mudar a tela. Sem leitura por id e sem state → estado degradado honesto.
  Status do backend fiscal vem em inglês (authorized/received/rejected…) → normalizado ao enum
  PT do domínio (autorizada / processando / rejeitada / enfileirada / dlq) sem inventar dados.
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
      <UiButton variant="ghost" to="/invoices">
        <template #icon-left><span aria-hidden="true">←</span></template>
        Voltar às notas
      </UiButton>
      <!-- DownloadXmlLink: o MOTIVO da indisponibilidade vai p/ leitores de tela (title + aria-label). -->
      <UiButton
        variant="ghost"
        :disabled="!canDownloadXml"
        :title="canDownloadXml ? 'Baixar o XML autorizado' : xmlUnavailableReason"
        :aria-label="canDownloadXml ? 'Baixar XML da NF-e' : 'Baixar XML — indisponível: ' + xmlUnavailableReason"
        @click="downloadXml"
      >
        <template #icon-left><span aria-hidden="true">⬇</span></template>
        Baixar XML
      </UiButton>
      <!-- RetryButton: habilitado só em DLQ/rejeitada (ação com efeito colateral). -->
      <UiButton
        variant="danger"
        :disabled="!canReprocess"
        :loading="reprocessBusy"
        :title="reprocessHint"
        :aria-label="canReprocess ? 'Reprocessar NF-e' : 'Reprocessar — indisponível: ' + reprocessHint"
        @click="confirmReprocess"
      >Reprocessar</UiButton>
    </template>

    <!-- DetailHeader: banner de situação SEFAZ (status nunca é o único sinal: badge + texto). -->
    <template #banner>
      <div v-if="invoice" class="iv-banner" :data-tone="bannerTone" role="status">
        <div class="iv-banner-main">
          <UiStatusBadge :status="invoice.status" :label="statusLabel(invoice.status)" :tone="statusTone(invoice.status)" />
          <span class="iv-banner-text">{{ bannerMessage }}</span>
        </div>
        <span v-if="invoice.issuedAt" class="iv-banner-meta">Emitida {{ fmtDateTime(invoice.issuedAt) }}</span>
      </div>
    </template>

    <!-- ===================== CONTEÚDO NORMAL ===================== -->
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
        <!-- ============== COLUNA PRINCIPAL ============== -->
        <div class="iv-col iv-col-main">
          <!-- FieldGrid: dados da nota -->
          <UiCard title="Dados da nota" subtitle="Identificação fiscal e valores">
            <template #actions>
              <UiStatusBadge :status="invoice.status" :label="statusLabel(invoice.status)" :tone="statusTone(invoice.status)" />
            </template>
            <dl class="iv-dl">
              <div class="iv-dl-row">
                <dt>Pedido</dt>
                <dd>
                  <RouterLink v-if="invoice.orderId" class="iv-link ui-mono" :to="'/orders/' + invoice.orderId">
                    {{ invoice.orderId }}
                  </RouterLink>
                  <span v-else class="ui-muted">—</span>
                </dd>
              </div>
              <div class="iv-dl-row">
                <dt>Número</dt>
                <dd class="ui-mono">{{ invoice.number || '—' }}</dd>
              </div>
              <div class="iv-dl-row">
                <dt>Protocolo SEFAZ</dt>
                <dd>
                  <span v-if="invoice.protocol" class="iv-protocol ui-mono">{{ invoice.protocol }}</span>
                  <span v-else class="ui-muted">—</span>
                </dd>
              </div>
              <div class="iv-dl-row">
                <dt>Recibo</dt>
                <dd class="ui-mono">{{ invoice.receipt || '—' }}</dd>
              </div>
              <div class="iv-dl-row">
                <dt>Total</dt>
                <dd class="iv-total">{{ fmtCurrency(invoice.total) }}</dd>
              </div>
              <div class="iv-dl-row">
                <dt>Situação</dt>
                <dd><UiStatusBadge :status="invoice.status" :label="statusLabel(invoice.status)" :tone="statusTone(invoice.status)" /></dd>
              </div>
              <div class="iv-dl-row">
                <dt>Tentativas</dt>
                <dd :class="attemptsValueClass">{{ attemptsValue }}</dd>
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

          <!-- Motivo de rejeição / falha (quando houver) -->
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
                :title="canDownloadXml ? 'Baixar o XML autorizado' : xmlUnavailableReason"
                @click="downloadXml"
              >
                <template #icon-left><span aria-hidden="true">⬇</span></template>
                Baixar XML
              </UiButton>
            </template>
            <div v-if="canDownloadXml" class="iv-xml">
              <p class="iv-xml-hint">
                O XML autorizado pode ser baixado para guarda fiscal e envio ao destinatário.
              </p>
              <pre class="iv-xml-preview ui-mono" aria-label="Prévia do XML da NF-e">{{ xmlPreview }}</pre>
            </div>
            <UiEmptyState
              v-else
              title="XML indisponível"
              :description="xmlUnavailableReason"
              icon="doc"
            />
          </UiCard>
        </div>

        <!-- ============== COLUNA LATERAL ============== -->
        <div class="iv-col iv-col-side">
          <!-- SefazTimeline -->
          <UiCard title="Linha do tempo SEFAZ" subtitle="Etapas de submissão da nota">
            <ol class="iv-timeline" aria-label="Etapas da submissão à SEFAZ">
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
                      :tone="step.tone === 'neutral' ? null : step.tone"
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
                <UiStatusBadge :status="value" :label="statusLabel(value)" :tone="statusTone(value)" size="sm" />
              </template>
              <template #cell-protocol="{ value }">
                <span v-if="value && value !== '—'" class="ui-mono">{{ value }}</span>
                <span v-else class="ui-muted">—</span>
              </template>
              <template #cell-at="{ value }">{{ value ? fmtDateTime(value) : '—' }}</template>
            </UiDataTable>
          </UiCard>

          <!-- Saúde da fila (contexto da DLQ) — estados próprios -->
          <UiCard title="Saúde da fila" subtitle="Processamento assíncrono de notas">
            <template #actions>
              <UiButton
                variant="ghost"
                size="sm"
                :loading="jobsLoading"
                @click="loadJobs"
              >
                <template #icon-left><span aria-hidden="true">↻</span></template>
                Atualizar
              </UiButton>
            </template>
            <UiLoadingState v-if="jobsLoading && !jobs" variant="skeleton" :skeleton-lines="3" />
            <UiErrorState
              v-else-if="jobsError"
              :message="jobsError"
              @retry="loadJobs"
            />
            <dl v-else-if="jobs" class="iv-dl iv-dl-compact">
              <div class="iv-dl-row">
                <dt>Na fila</dt>
                <dd class="iv-num">{{ jobs.queued ?? 0 }}</dd>
              </div>
              <div class="iv-dl-row">
                <dt>Processando</dt>
                <dd class="iv-num">{{ jobs.running ?? 0 }}</dd>
              </div>
              <div class="iv-dl-row">
                <dt>Concluídas</dt>
                <dd class="iv-num">{{ jobs.done ?? 0 }}</dd>
              </div>
              <div class="iv-dl-row">
                <dt>Em DLQ</dt>
                <dd>
                  <UiStatusBadge
                    :status="(jobs.dlq || 0) > 0 ? 'dlq' : 'ok'"
                    :tone="(jobs.dlq || 0) > 0 ? 'error' : 'success'"
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
                <UiButton variant="subtle" size="sm" @click="loadJobs">Tentar de novo</UiButton>
              </template>
            </UiEmptyState>
          </UiCard>
        </div>
      </div>
    </template>

    <!-- ===================== EMPTY (nota não encontrada / leitura indisponível) ===================== -->
    <template v-else-if="!loading && !loadError">
      <UiEmptyState
        :title="unavailable ? 'Leitura de NF-e por endereço indisponível' : 'NF-e não encontrada'"
        :description="notFoundReason"
        icon="search"
      >
        <template #action>
          <div class="iv-empty-actions">
            <UiButton to="/invoices">Ver todas as notas</UiButton>
            <UiButton variant="ghost" to="/invoices/new">Emitir uma NF-e</UiButton>
          </div>
        </template>
      </UiEmptyState>
    </template>
  </UiPageLayout>
</template>

<script setup>
import { ref, computed, watch, onMounted } from 'vue';
import { useRoute, RouterLink } from 'vue-router';
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
const toast = useToast();
const confirm = useConfirm();

const fmtCurrency = (v) => format.formatCurrency(v);
const fmtDateTime = (v) => format.formatDateTime(v);

// ---------------------------------------------------------------------------
// Estado base.
// ---------------------------------------------------------------------------
const invoice = ref(null);
const loading = ref(false);
const loadError = ref('');
const notFound = ref(false);
const unavailable = ref(false); // sem GET /v1/invoices/:id e sem state da navegação

const jobs = ref(null);
const jobsLoading = ref(false);
const jobsError = ref('');

const reprocessBusy = ref(false);

const invoiceId = computed(() => route.params.id);

// ---------------------------------------------------------------------------
// Enum do domínio NF-e + normalização do status do backend (inglês/SEFAZ → PT).
// O status-map do kit resolve por substring no masculino e erra o feminino do
// domínio (autorizada/rejeitada/enfileirada) → passamos :tone EXPLÍCITO sempre.
// ---------------------------------------------------------------------------
const STATUS_LABELS = {
  enfileirada: 'Enfileirada',
  processando: 'Processando',
  autorizada: 'Autorizada',
  rejeitada: 'Rejeitada',
  dlq: 'DLQ (falha)',
};
const STATUS_TONE = {
  enfileirada: 'running',
  processando: 'running',
  autorizada: 'success',
  rejeitada: 'warning',
  dlq: 'error',
};
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
// Tom explícito; cai no resolveTone genérico (success/warning/error/running/neutral) p/ chaves fora do enum.
function statusTone(status) {
  const key = normalizeStatus(status);
  return STATUS_TONE[key] || resolveTone(status);
}

// ---------------------------------------------------------------------------
// Normalização da nota (campos variados; honesto, sem inventar).
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// Fonte REAL da nota.
//   (a) api.invoices.get(id) — quando a esteira publicar GET /v1/invoices/:id (preferida).
//   (b) ESTADO da navegação (router state) — fonte real disponível hoje (Lista/Emissão passam a nota).
//   (c) query (?orderId=&total=&status=&protocol=…) — reconstrução parcial honesta a partir do link.
//   (d) nada disso → degrada honestamente (não inventa rota).
// ---------------------------------------------------------------------------
function invoiceFromNavState() {
  const st = (typeof history !== 'undefined' && history.state) || {};
  if (st && st.invoice && typeof st.invoice === 'object') return st.invoice;
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
  if (api.invoices && typeof api.invoices.get === 'function') {
    return await api.invoices.get(id);
  }
  const fromNav = invoiceFromNavState();
  if (fromNav) return fromNav;
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
    // Rota REAL: GET /v1/health/jobs → { status, jobs:{queued,running,done,dlq} } (api.healthJobs).
    let res = null;
    if (typeof api.healthJobs === 'function') {
      res = await api.healthJobs();
    } else if (api.health && typeof api.health.jobs === 'function') {
      res = await api.health.jobs();
    } else if (api.store && typeof api.store.healthJobs === 'function') {
      res = await api.store.healthJobs();
    }
    jobs.value = res ? (res.jobs || res.data || res) : null;
  } catch (e) {
    jobsError.value = (e && e.message) || 'Falha ao consultar a fila de processamento.';
    jobs.value = null;
  } finally {
    jobsLoading.value = false;
  }
}

// ---------------------------------------------------------------------------
// Ação: reprocessar (RetryButton) — destrutiva/efeito colateral → useConfirm.
// Reprocessar == REEMITIR via POST /v1/invoices (rota REAL e idempotente por pedido).
// ---------------------------------------------------------------------------
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
    toast.error('Não foi possível reprocessar a NF-e.', {
      detail: (e && e.message) || '',
      code: e && e.status ? 'HTTP ' + e.status : '',
    });
  } finally {
    reprocessBusy.value = false;
  }
}

// ---------------------------------------------------------------------------
// Ação: baixar XML (DownloadXmlLink) — blob client-side, CSP-safe (sem inline).
// ---------------------------------------------------------------------------
function downloadXml() {
  if (!canDownloadXml.value || typeof document === 'undefined') return;
  try {
    const blob = new Blob([invoice.value.xml], { type: 'application/xml;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'nfe-' + (invoice.value.protocol || invoice.value.number || invoice.value.id || 'documento') + '.xml';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success('Download do XML iniciado.');
  } catch (e) {
    toast.error('Falha ao baixar o XML.', { detail: (e && e.message) || '' });
  }
}

// ---------------------------------------------------------------------------
// Derivados de apresentação.
// ---------------------------------------------------------------------------
const pageTitle = computed(() => {
  if (!invoice.value) return 'Detalhe da NF-e';
  if (invoice.value.number) return 'NF-e ' + invoice.value.number;
  return 'NF-e do pedido ' + (invoice.value.orderId || invoice.value.id);
});
const pageSubtitle = computed(() => {
  if (!invoice.value) return 'Dados, status SEFAZ, protocolo, XML e tentativas.';
  return statusLabel(invoice.value.status) + ' · ' + fmtCurrency(invoice.value.total);
});

const isDlq = computed(() => invoice.value && normalizeStatus(invoice.value.status) === 'dlq');
const isRejected = computed(() => invoice.value && normalizeStatus(invoice.value.status) === 'rejeitada');
const isAuthorized = computed(() => invoice.value && normalizeStatus(invoice.value.status) === 'autorizada');

const canReprocess = computed(() => !reprocessBusy.value && (isDlq.value || isRejected.value));
const canDownloadXml = computed(() => !!(invoice.value && invoice.value.xml));

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
  const map = { sandbox: 'Sandbox', homolog: 'Homologação', homologacao: 'Homologação', real: 'Produção', producao: 'Produção' };
  return map[String(m).toLowerCase()] || format.humanize(m);
});

const attemptsValue = computed(() => {
  const a = invoice.value && invoice.value.attempts;
  return a != null ? a : '—';
});
const attemptsValueClass = computed(() => {
  const a = invoice.value && invoice.value.attempts;
  return a != null && Number(a) > 1 ? 'iv-num iv-num-hot' : 'iv-num';
});
const attemptsHint = computed(() => {
  const a = invoice.value && invoice.value.attempts;
  if (a == null) return 'sem registro de tentativas';
  return Number(a) === 1 ? '1 envio realizado' : a + ' envios realizados';
});
const attemptsTone = computed(() => {
  const a = invoice.value && invoice.value.attempts;
  if (a == null) return 'neutral';
  if (Number(a) >= 3) return 'error';
  if (Number(a) >= 2) return 'warning';
  return 'neutral';
});

const bannerTone = computed(() => (invoice.value ? statusTone(invoice.value.status) : 'neutral'));
const metricTone = computed(() => {
  const t = invoice.value ? statusTone(invoice.value.status) : 'neutral';
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
  const key = normalizeStatus(invoice.value.status);
  return map[key] || ('Situação atual: ' + statusLabel(invoice.value.status));
});

// SefazTimeline — etapas canônicas (enfileirada → processando → resultado).
const sefazSteps = computed(() => {
  const status = invoice.value ? normalizeStatus(invoice.value.status) : 'enfileirada';
  const order = ['enfileirada', 'processando', 'autorizada'];
  const idx = order.indexOf(status);
  const failed = status === 'rejeitada' || status === 'dlq';

  function stateFor(stepIdx) {
    if (failed) return stepIdx <= 1 ? 'done' : 'pending';
    if (idx < 0) return stepIdx === 0 ? 'current' : 'pending';
    if (stepIdx < idx) return 'done';
    if (stepIdx === idx) return status === 'autorizada' ? 'done' : 'current';
    return 'pending';
  }

  const steps = [
    { key: 'enfileirada', title: 'Enfileirada', detail: 'Nota colocada na fila de submissão (worker transacional).' },
    { key: 'processando', title: 'Processando', detail: 'Construção, assinatura e envio do lote à SEFAZ.' },
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

// Histórico de submissões — usa o histórico real quando vier; senão deriva tentativas (clampadas).
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
      at: h.at || h.created_at || h.createdAt || null,
    }));
  }
  // Sem histórico detalhado: representa a(s) tentativa(s) consolidada(s) — clampa valor não-validado.
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

// KPI da fila / DLQ.
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
    return 'Esta API ainda não expõe a leitura de uma NF-e por endereço (GET /v1/invoices/:id). ' +
      'Abra a nota a partir da lista (que carrega os dados) ou da tela de emissão. ' +
      'Quando a esteira publicar a leitura, esta tela passa a carregá-la diretamente.';
  }
  return 'Não localizamos esta NF-e. Ela pode ter sido removida ou o endereço está incorreto.';
});

// ---------------------------------------------------------------------------
// Ciclo de vida.
// ---------------------------------------------------------------------------
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

/* Banner de situação */
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

/* Layout principal */
.iv-grid {
  display: grid;
  grid-template-columns: minmax(0, 2fr) minmax(0, 1fr);
  gap: var(--ui-space-4);
  align-items: start;
}
.iv-col { display: flex; flex-direction: column; gap: var(--ui-space-4); }

/* Listas de definição (FieldGrid) */
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

.iv-link { color: rgb(var(--ui-accent-strong)); text-decoration: none; font-weight: 600; }
.iv-link:hover { text-decoration: underline; }
.iv-protocol { font-size: var(--ui-text-sm); }
.iv-total { font-weight: 700; font-variant-numeric: tabular-nums; }
.iv-num { font-variant-numeric: tabular-nums; }
.iv-num-hot { color: rgb(var(--ui-warn)); font-weight: 700; }

/* Motivo de rejeição */
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

/* Empty */
.iv-empty-actions { display: inline-flex; gap: var(--ui-space-2); flex-wrap: wrap; justify-content: center; }

/* Responsivo */
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
