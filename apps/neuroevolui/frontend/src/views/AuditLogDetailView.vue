<!--
  Detalhe de Evento de Auditoria (REQ-NEUROEVOLUI-0005).
  Exibe um único evento de auditoria: actor, entidade afetada, ação, timestamp preciso
  e diff de metadados (de → para).

  Endpoint REAL:
    · GET /v1/audit-logs/:id  (resourceFactory 'audit-logs'; o integrador garante a rota)

  Estados: loading (UiPageLayout :loading) · error (UiPageLayout :error + @retry) ·
           empty/404 (UiEmptyState) · normal. CSP-safe: zero style="..." / :style / v-html.
-->
<template>
  <UiPageLayout
    eyebrow="Governança"
    :title="pageTitle"
    :subtitle="pageSubtitle"
    width="default"
    :loading="loading"
    :error="pageError"
    @retry="load"
  >
    <template #actions>
      <UiButton variant="ghost" to="/audit-logs">Voltar</UiButton>
    </template>

    <!-- Banner de tipo de ação (cor + ícone textual) -->
    <template v-if="!loading && !pageError && event.id" #banner>
      <div
        class="ald-banner"
        :data-tone="actionTone(event.action)"
        role="status"
        aria-live="polite"
      >
        <span class="ald-banner-pill" :data-tone="actionTone(event.action)">
          {{ actionLabel(event.action) }}
        </span>
        <span class="ald-banner-text">
          <strong>{{ event.actor || 'Sistema' }}</strong>
          executou esta ação em
          <strong>{{ entityLabel(event.entity_type) }}</strong>
          <span v-if="event.entity_id"> #<span class="ald-mono">{{ event.entity_id }}</span></span>
        </span>
        <span class="ald-banner-ts">{{ formatDateTimeSeconds(event.created_at) }}</span>
      </div>
    </template>

    <!-- 404 / não encontrado -->
    <UiEmptyState
      v-if="!loading && !pageError && !event.id"
      title="Evento não encontrado"
      description="Este evento de auditoria não existe ou foi removido da trilha do tenant."
      icon="search"
    >
      <template #action>
        <UiButton to="/audit-logs">Ver trilha de auditoria</UiButton>
      </template>
    </UiEmptyState>

    <template v-if="!loading && !pageError && event.id">
      <!-- KPIs de resumo -->
      <section class="ald-metrics" aria-label="Resumo do evento">
        <UiMetricCard
          label="Ação"
          :value="actionLabel(event.action)"
          :tone="actionTone(event.action)"
          hint="O que foi feito"
        />
        <UiMetricCard
          label="Entidade"
          :value="entityLabel(event.entity_type)"
          tone="neutral"
          hint="Tipo de objeto afetado"
        />
        <UiMetricCard
          label="Usuário"
          :value="event.actor || 'Sistema'"
          tone="neutral"
          hint="Quem executou"
        />
        <UiMetricCard
          label="Ocorreu em"
          :value="relativeTime"
          tone="neutral"
          :hint="formatDateTimeSeconds(event.created_at)"
        />
      </section>

      <!-- Grid: Cabeçalho do evento + Link de entidade -->
      <div class="ald-grid">
        <!-- EventHeader -->
        <UiCard title="Evento" subtitle="Identificação e rastreio do evento">
          <template #actions>
            <UiStatusBadge
              :status="event.action || 'unknown'"
              :tone="actionTone(event.action)"
              :label="actionLabel(event.action)"
              with-dot
            />
          </template>
          <dl class="ald-kv">
            <div class="ald-kv-item">
              <dt>ID do evento</dt>
              <dd class="ald-mono">{{ display(event.id) }}</dd>
            </div>
            <div class="ald-kv-item">
              <dt>Ação</dt>
              <dd>
                <UiStatusBadge
                  :status="event.action || 'unknown'"
                  :tone="actionTone(event.action)"
                  :label="actionLabel(event.action)"
                  with-dot
                />
              </dd>
            </div>
            <div class="ald-kv-item">
              <dt>Usuário</dt>
              <dd>{{ display(event.actor) }}</dd>
            </div>
            <div class="ald-kv-item">
              <dt>IP</dt>
              <dd class="ald-mono">{{ display(event.ip_address) }}</dd>
            </div>
            <div class="ald-kv-item">
              <dt>Ocorreu em</dt>
              <dd class="ald-datetime">{{ formatDateTimeSeconds(event.created_at) }}</dd>
            </div>
          </dl>
        </UiCard>

        <!-- EntityLink -->
        <UiCard title="Entidade afetada" subtitle="Objeto do domínio que sofreu a ação">
          <dl class="ald-kv">
            <div class="ald-kv-item">
              <dt>Tipo</dt>
              <dd>{{ entityLabel(event.entity_type) }}</dd>
            </div>
            <div class="ald-kv-item">
              <dt>ID</dt>
              <dd class="ald-mono">{{ display(event.entity_id) }}</dd>
            </div>
          </dl>
          <template #footer>
            <div class="ald-entity-footer">
              <span v-if="!entityRoute" class="ald-muted">Sem rota disponível para este tipo.</span>
              <RouterLink
                v-else
                class="ald-entity-link"
                :to="entityRoute"
                aria-label="Ver detalhes da entidade afetada"
              >
                Ver {{ entityLabel(event.entity_type).toLowerCase() }} #{{ event.entity_id }}
              </RouterLink>
            </div>
          </template>
        </UiCard>
      </div>

      <!-- Payload do evento — diff de → para ou dados brutos registrados na ação -->
      <UiCard
        title="Payload"
        subtitle="Dados registrados no momento da ação (diff antes → depois quando aplicável)"
      >
        <!-- Sem metadados -->
        <UiEmptyState
          v-if="!hasMeta"
          title="Sem metadados registrados"
          description="Este evento não possui metadados adicionais associados à ação."
          icon="document"
        />

        <template v-else>
          <!-- Diff side-by-side (before/after) quando os dois lados existem -->
          <div v-if="hasDiff" class="ald-diff-grid">
            <div class="ald-diff-pane">
              <div class="ald-diff-label ald-diff-label--before" aria-label="Estado anterior">
                <span class="ald-diff-marker" aria-hidden="true">—</span>
                Antes
              </div>
              <pre class="ald-diff-code ald-diff-code--before" tabindex="0" aria-label="Metadados anteriores à ação">{{ metaBefore }}</pre>
            </div>
            <div class="ald-diff-pane">
              <div class="ald-diff-label ald-diff-label--after" aria-label="Estado posterior">
                <span class="ald-diff-marker" aria-hidden="true">+</span>
                Depois
              </div>
              <pre class="ald-diff-code ald-diff-code--after" tabindex="0" aria-label="Metadados após a ação">{{ metaAfter }}</pre>
            </div>
          </div>

          <!-- Diff linha a linha quando temos objetos antes+depois -->
          <div v-if="hasDiff && diffLines.length" class="ald-diff-table" role="table" aria-label="Mudanças campo a campo">
            <div class="ald-diff-thead" role="row">
              <span role="columnheader">Campo</span>
              <span role="columnheader">Antes</span>
              <span role="columnheader">Depois</span>
            </div>
            <div
              v-for="line in diffLines"
              :key="line.key"
              class="ald-diff-row"
              :data-change="line.change"
              role="row"
            >
              <span class="ald-diff-field" role="cell">{{ line.label }}</span>
              <span class="ald-diff-val ald-diff-val--before" role="cell">{{ line.before }}</span>
              <span class="ald-diff-val ald-diff-val--after" role="cell">{{ line.after }}</span>
            </div>
          </div>

          <!-- Exibição plana quando só há um bloco (sem before/after) -->
          <div v-if="!hasDiff" class="ald-meta-block">
            <pre class="ald-diff-code" tabindex="0" aria-label="Metadados do evento">{{ metaFlat }}</pre>
          </div>
        </template>
      </UiCard>

    </template>

    <!-- Rodapé com link de volta -->
    <template #footer>
      <span v-if="!loading && !pageError && event.id">
        Evento de auditoria #{{ display(event.id) }} — trilha do tenant, somente leitura.
        <RouterLink class="ald-back-link" to="/audit-logs">Ver todos os eventos</RouterLink>
      </span>
    </template>
  </UiPageLayout>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue';
import { RouterLink } from 'vue-router';
import {
  UiPageLayout,
  UiCard,
  UiMetricCard,
  UiStatusBadge,
  UiEmptyState,
  UiButton,
  format,
} from '../ui/index.js';
import { resourceFactory } from '../api.js';

const props = defineProps({ id: { type: [String, Number], required: true } });

// Recurso REAL: /v1/audit-logs (nome com hífen → instanciado pela fábrica diretamente)
const auditApi = resourceFactory('audit-logs');

// ── Estado principal ─────────────────────────────────────────────────────────────
const loading = ref(true);
const error = ref(null);
const event = ref({});

// ── Rótulos pt-BR dos enums ──────────────────────────────────────────────────────
const ACTION_LABELS = {
  create: 'Criou',
  created: 'Criou',
  update: 'Atualizou',
  updated: 'Atualizou',
  delete: 'Excluiu',
  deleted: 'Excluiu',
  submit: 'Enviou',
  submitted: 'Enviou',
  payment: 'Cobrança',
  pay: 'Cobrou',
  login: 'Acessou',
  schedule: 'Agendou',
  scheduled: 'Agendou',
  cancel: 'Cancelou',
  refund: 'Reembolsou',
  export: 'Exportou',
};
const ACTION_TONES = {
  create: 'success',
  created: 'success',
  update: 'running',
  updated: 'running',
  delete: 'error',
  deleted: 'error',
  submit: 'running',
  submitted: 'running',
  payment: 'success',
  pay: 'success',
  login: 'neutral',
  cancel: 'warning',
  refund: 'warning',
  export: 'neutral',
};
const ENTITY_LABELS = {
  patient: 'Paciente',
  patients: 'Paciente',
  consultation: 'Agendamento',
  consultations: 'Agendamento',
  professional: 'Profissional',
  professionals: 'Profissional',
  'evolution-note': 'Evolução',
  'evolution_note': 'Evolução',
  report: 'Relatório',
  reports: 'Relatório',
  'patient-report': 'Relatório',
  'patient_report': 'Relatório',
  'payment-transaction': 'Transação',
  'payment_transaction': 'Transação',
  transaction: 'Transação',
  'knowledge-source': 'Fonte de conhecimento',
  'knowledge_source': 'Fonte de conhecimento',
};
const ENTITY_ROUTES = {
  patient: '/patients/',
  patients: '/patients/',
  consultation: '/consultations/',
  consultations: '/consultations/',
  professional: '/professionals/',
  professionals: '/professionals/',
  'evolution-note': '/evolution-notes/',
  'evolution_note': '/evolution-notes/',
  report: '/patient-reports/',
  reports: '/patient-reports/',
  'patient-report': '/patient-reports/',
  'patient_report': '/patient-reports/',
  'payment-transaction': '/payment-transactions/',
  'payment_transaction': '/payment-transactions/',
  transaction: '/payment-transactions/',
};

function norm(v) {
  return String(v ?? '').trim().toLowerCase();
}

const actionLabel = (v) => ACTION_LABELS[norm(v)] || (v ? format.humanize(v) : '—');
const actionTone = (v) => ACTION_TONES[norm(v)] || 'neutral';
const entityLabel = (v) => ENTITY_LABELS[norm(v)] || (v ? format.humanize(v) : '—');
const display = (v) => (v === null || v === undefined || v === '' ? '—' : String(v));

// Formata timestamp com segundos (dd/MM/yyyy HH:mm:ss) — timeStyle 'medium' inclui segundos em pt-BR.
function formatDateTimeSeconds(value) {
  if (!value) return '—';
  const d = value instanceof Date ? value : new Date(value);
  if (isNaN(d.getTime())) return String(value);
  try {
    return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'medium' }).format(d);
  } catch {
    return d.toISOString();
  }
}

// ── Cabeçalho dinâmico ───────────────────────────────────────────────────────────
const pageTitle = computed(() => {
  if (loading.value || !event.value.id) return 'Evento de auditoria';
  const action = actionLabel(event.value.action);
  const entity = entityLabel(event.value.entity_type);
  return action + ' · ' + entity;
});

const pageSubtitle = computed(() => {
  if (loading.value || !event.value.id) return 'Detalhe de um evento de auditoria.';
  const parts = [];
  if (event.value.actor) parts.push('por ' + event.value.actor);
  if (event.value.entity_id) parts.push('entidade #' + event.value.entity_id);
  if (event.value.created_at) parts.push(formatDateTimeSeconds(event.value.created_at));
  return parts.length ? parts.join(' · ') : 'Detalhe do evento.';
});

// ── Tempo relativo ────────────────────────────────────────────────────────────────
const relativeTime = computed(() => {
  const ts = event.value.created_at;
  if (!ts) return '—';
  const t = new Date(ts).getTime();
  if (!isFinite(t)) return format.formatDateTime(ts);
  const diffMin = Math.round((Date.now() - t) / 60000);
  if (diffMin < 1) return 'agora mesmo';
  if (diffMin < 60) return 'há ' + diffMin + ' min';
  if (diffMin < 60 * 24) return 'há ' + Math.round(diffMin / 60) + ' h';
  if (diffMin < 60 * 24 * 30) return 'há ' + Math.round(diffMin / (60 * 24)) + ' d';
  return 'há ' + Math.round(diffMin / (60 * 24 * 30)) + ' meses';
});

// ── Link para entidade afetada ────────────────────────────────────────────────────
const entityRoute = computed(() => {
  const e = event.value;
  if (!e.entity_id) return null;
  const base = ENTITY_ROUTES[norm(e.entity_type)];
  return base ? base + e.entity_id : null;
});

// ── MetadataDiffViewer ────────────────────────────────────────────────────────────
// Suporta metadados em 3 shapes:
//   A) { before: {...}, after: {...} }   → diff side-by-side
//   B) objeto plano                      → exibição mono
//   C) string JSON                       → parse + A ou B
function parseMeta(raw) {
  if (!raw) return null;
  if (typeof raw === 'object') return raw;
  if (typeof raw === 'string') {
    try { return JSON.parse(raw); } catch { return raw; }
  }
  return raw;
}

const parsedMeta = computed(() => parseMeta(event.value.metadata));

const hasMeta = computed(() => {
  const m = parsedMeta.value;
  if (!m) return false;
  if (typeof m === 'string') return m.trim().length > 0;
  if (typeof m === 'object') return Object.keys(m).length > 0;
  return false;
});

const hasDiff = computed(() => {
  const m = parsedMeta.value;
  return !!(m && typeof m === 'object' && ('before' in m || 'after' in m));
});

function prettyJson(v) {
  if (v === undefined || v === null) return '—';
  if (typeof v === 'string') return v;
  try { return JSON.stringify(v, null, 2); } catch { return String(v); }
}

const metaBefore = computed(() => {
  const m = parsedMeta.value;
  if (!m || !hasDiff.value) return '';
  return prettyJson(m.before ?? null);
});

const metaAfter = computed(() => {
  const m = parsedMeta.value;
  if (!m || !hasDiff.value) return '';
  return prettyJson(m.after ?? null);
});

const metaFlat = computed(() => {
  const m = parsedMeta.value;
  return prettyJson(m);
});

// Diff linha a linha (só quando before e after são objetos)
const diffLines = computed(() => {
  const m = parsedMeta.value;
  if (!m || !hasDiff.value) return [];
  const before = m.before && typeof m.before === 'object' ? m.before : {};
  const after = m.after && typeof m.after === 'object' ? m.after : {};
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  const lines = [];
  for (const k of keys) {
    const bv = before[k];
    const av = after[k];
    const bStr = prettyJson(bv);
    const aStr = prettyJson(av);
    let change = 'same';
    if (!(k in before)) change = 'added';
    else if (!(k in after)) change = 'removed';
    else if (bStr !== aStr) change = 'changed';
    lines.push({
      key: k,
      label: format.humanize(k),
      before: change === 'added' ? '—' : bStr,
      after: change === 'removed' ? '—' : aStr,
      change,
    });
  }
  // Ordena: changed/added/removed primeiro, same por último
  const ORDER = { changed: 0, added: 1, removed: 2, same: 3 };
  lines.sort((a, b) => (ORDER[a.change] ?? 9) - (ORDER[b.change] ?? 9));
  return lines;
});

// ── Erro de página ────────────────────────────────────────────────────────────────
const pageError = computed(() => {
  if (!error.value) return null;
  if (error.value.status === 404) return null; // tratado pelo empty state
  return error.value.message || 'Não foi possível carregar o evento de auditoria.';
});

// ── Carga ─────────────────────────────────────────────────────────────────────────
// Tenta GET direto por id; se o backend não honrar /:id (rota nova), faz fallback
// pela lista com pageSize generoso e filtra no cliente — mesmo padrão do ConsultationDetailView.
function unwrap(res) {
  if (!res || typeof res !== 'object') return null;
  if (res.data && typeof res.data === 'object' && !Array.isArray(res.data)) return res.data;
  return res;
}

async function load() {
  loading.value = true;
  error.value = null;
  try {
    let found = null;
    // 1) Tenta GET /v1/audit-logs/:id diretamente
    try {
      const direct = unwrap(await auditApi.get(props.id));
      if (direct && (direct.id !== undefined || direct.action)) found = direct;
    } catch {
      found = null; // endpoint /:id não implementado → cai para lista
    }
    // 2) Fallback: lista completa (pageSize grande) + busca por id
    if (!found) {
      const res = await auditApi.list({ pageSize: 500, sort: 'id', dir: 'desc' });
      const rows = Array.isArray(res) ? res : res && Array.isArray(res.data) ? res.data : [];
      found = rows.find((r) => String(r.id) === String(props.id)) || null;
    }
    if (!found) {
      const e = new Error('Evento #' + props.id + ' não encontrado na trilha de auditoria.');
      e.status = 404;
      throw e;
    }
    event.value = found;
  } catch (e) {
    error.value = e;
    event.value = {};
  } finally {
    loading.value = false;
  }
}

watch(() => props.id, load);
onMounted(load);
</script>

<style scoped>
/* ── Banner ─────────────────────────────────────────────────────────────────── */
.ald-banner {
  display: flex;
  align-items: center;
  gap: var(--ui-space-3);
  flex-wrap: wrap;
  padding: var(--ui-space-3) var(--ui-space-4);
  border-radius: var(--ui-radius-lg);
  border: 1px solid rgb(var(--ui-border));
  background: rgb(var(--ui-surface-2));
}

.ald-banner[data-tone="success"] {
  background: rgb(var(--ui-ok) / 0.08);
  border-color: rgb(var(--ui-ok) / 0.3);
}
.ald-banner[data-tone="error"] {
  background: rgb(var(--ui-danger) / 0.08);
  border-color: rgb(var(--ui-danger) / 0.3);
}
.ald-banner[data-tone="warning"] {
  background: rgb(var(--ui-warn) / 0.08);
  border-color: rgb(var(--ui-warn) / 0.3);
}
.ald-banner[data-tone="running"] {
  background: rgb(var(--ui-accent) / 0.08);
  border-color: rgb(var(--ui-accent) / 0.3);
}

.ald-banner-pill {
  display: inline-flex;
  align-items: center;
  padding: 2px var(--ui-space-3);
  border-radius: var(--ui-radius-full, 9999px);
  font-size: var(--ui-text-xs);
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  background: rgb(var(--ui-muted) / 0.15);
  color: rgb(var(--ui-fg));
  flex-shrink: 0;
}

.ald-banner-pill[data-tone="success"] {
  background: rgb(var(--ui-ok) / 0.18);
  color: rgb(var(--ui-ok));
}
.ald-banner-pill[data-tone="error"] {
  background: rgb(var(--ui-danger) / 0.18);
  color: rgb(var(--ui-danger));
}
.ald-banner-pill[data-tone="warning"] {
  background: rgb(var(--ui-warn) / 0.2);
  color: rgb(var(--ui-warn));
}
.ald-banner-pill[data-tone="running"] {
  background: rgb(var(--ui-accent) / 0.18);
  color: rgb(var(--ui-accent-strong));
}

.ald-banner-text {
  flex: 1;
  font-size: var(--ui-text-sm);
  color: rgb(var(--ui-fg));
}

.ald-banner-ts {
  font-size: var(--ui-text-xs);
  color: rgb(var(--ui-muted));
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  flex-shrink: 0;
}

/* ── Métricas ──────────────────────────────────────────────────────────────── */
.ald-metrics {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: var(--ui-space-4);
}

/* ── Grid 2 colunas ─────────────────────────────────────────────────────────── */
.ald-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: var(--ui-space-4);
  align-items: start;
}

/* ── Key/Value ───────────────────────────────────────────────────────────────── */
.ald-kv {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--ui-space-4);
  margin: 0;
}

.ald-kv-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.ald-kv-item dt {
  color: rgb(var(--ui-muted));
  font-size: var(--ui-text-xs);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  font-weight: 600;
}

.ald-kv-item dd {
  margin: 0;
  font-size: var(--ui-text-md);
  word-break: break-word;
}

/* ── Entity footer ──────────────────────────────────────────────────────────── */
.ald-entity-footer {
  display: flex;
  align-items: center;
  gap: var(--ui-space-2);
}

.ald-entity-link {
  font-size: var(--ui-text-sm);
  font-weight: 600;
  color: rgb(var(--ui-accent-strong));
  text-decoration: none;
}

.ald-entity-link:hover {
  text-decoration: underline;
}

.ald-entity-link:focus-visible {
  outline: 2px solid rgb(var(--ui-accent));
  outline-offset: 2px;
  border-radius: var(--ui-radius-sm);
}

/* ── MetadataDiffViewer ─────────────────────────────────────────────────────── */
.ald-diff-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: var(--ui-space-4);
  margin-bottom: var(--ui-space-5);
}

.ald-diff-pane {
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-2);
  min-width: 0;
}

.ald-diff-label {
  display: flex;
  align-items: center;
  gap: var(--ui-space-2);
  font-size: var(--ui-text-xs);
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: rgb(var(--ui-muted));
}

.ald-diff-label--before {
  color: rgb(var(--ui-danger));
}

.ald-diff-label--after {
  color: rgb(var(--ui-ok));
}

.ald-diff-marker {
  font-family: var(--ui-font-mono, monospace);
  font-size: var(--ui-text-md);
  line-height: 1;
}

.ald-diff-code {
  margin: 0;
  padding: var(--ui-space-3) var(--ui-space-4);
  border-radius: var(--ui-radius-md);
  border: 1px solid rgb(var(--ui-border));
  background: rgb(var(--ui-surface-2));
  font-family: var(--ui-font-mono, monospace);
  font-size: var(--ui-text-xs);
  color: rgb(var(--ui-fg));
  white-space: pre-wrap;
  word-break: break-word;
  overflow: auto;
  max-height: 280px;
  min-height: 60px;
}

.ald-diff-code--before {
  border-color: rgb(var(--ui-danger) / 0.25);
  background: rgb(var(--ui-danger) / 0.05);
}

.ald-diff-code--after {
  border-color: rgb(var(--ui-ok) / 0.25);
  background: rgb(var(--ui-ok) / 0.05);
}

/* Tabela de diff campo a campo */
.ald-diff-table {
  display: flex;
  flex-direction: column;
  border: 1px solid rgb(var(--ui-border));
  border-radius: var(--ui-radius-md);
  overflow: hidden;
}

.ald-diff-thead {
  display: grid;
  grid-template-columns: minmax(140px, 22%) 1fr 1fr;
  gap: 0;
  background: rgb(var(--ui-surface-2));
  border-bottom: 1px solid rgb(var(--ui-border));
  padding: var(--ui-space-2) var(--ui-space-4);
}

.ald-diff-thead > span {
  font-size: var(--ui-text-xs);
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: rgb(var(--ui-muted));
}

.ald-diff-row {
  display: grid;
  grid-template-columns: minmax(140px, 22%) 1fr 1fr;
  gap: 0;
  padding: var(--ui-space-2) var(--ui-space-4);
  border-bottom: 1px solid rgb(var(--ui-border));
  align-items: baseline;
  transition: background 0.1s;
}

.ald-diff-row:last-child {
  border-bottom: none;
}

.ald-diff-row[data-change="changed"] {
  background: rgb(var(--ui-warn) / 0.06);
}

.ald-diff-row[data-change="added"] {
  background: rgb(var(--ui-ok) / 0.06);
}

.ald-diff-row[data-change="removed"] {
  background: rgb(var(--ui-danger) / 0.06);
}

.ald-diff-field {
  font-size: var(--ui-text-sm);
  font-weight: 600;
  color: rgb(var(--ui-fg));
}

.ald-diff-val {
  font-family: var(--ui-font-mono, monospace);
  font-size: var(--ui-text-xs);
  color: rgb(var(--ui-muted));
  word-break: break-all;
  padding: 0 var(--ui-space-2);
}

.ald-diff-val--before {
  color: rgb(var(--ui-danger));
}

.ald-diff-val--after {
  color: rgb(var(--ui-ok));
}

.ald-diff-row[data-change="same"] .ald-diff-val--before,
.ald-diff-row[data-change="same"] .ald-diff-val--after {
  color: rgb(var(--ui-muted));
}

.ald-meta-block {
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-2);
}

/* ── Utilitários ────────────────────────────────────────────────────────────── */
.ald-mono {
  font-family: var(--ui-font-mono, monospace);
  font-size: var(--ui-text-sm);
}

.ald-datetime {
  font-variant-numeric: tabular-nums;
}

.ald-muted {
  color: rgb(var(--ui-muted));
  font-size: var(--ui-text-sm);
}

.ald-back-link {
  color: rgb(var(--ui-accent-strong));
  text-decoration: none;
  font-weight: 500;
}

.ald-back-link:hover {
  text-decoration: underline;
}

/* ── Responsivo ≤ 860px ─────────────────────────────────────────────────────── */
@media (max-width: 860px) {
  .ald-metrics {
    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
    gap: var(--ui-space-3);
  }

  .ald-grid {
    grid-template-columns: minmax(0, 1fr);
  }

  .ald-kv {
    grid-template-columns: minmax(0, 1fr);
  }

  .ald-diff-grid {
    grid-template-columns: minmax(0, 1fr);
  }

  .ald-diff-thead,
  .ald-diff-row {
    grid-template-columns: minmax(100px, 28%) 1fr 1fr;
    padding: var(--ui-space-2) var(--ui-space-3);
  }
}
</style>
