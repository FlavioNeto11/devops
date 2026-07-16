<!--
  AssistantAuditView — Auditoria do Assistente IA (Admin only).
  Log completo de interações com o assistente: conversa, pergunta, resposta,
  ferramentas usadas, duração e data. Filtros por período e conversa.
  Endpoint: GET /v1/assistant/audit  (tabela assistant_audit_log).
  Ancora: REQ-CONTAVIVA360-0007, REQ-CONTAVIVA360-0009.
  Usa SÓ kit ui-vue + tokens --ui-*. CSP-safe. a11y.
-->
<template>
  <UiPageLayout
    eyebrow="ContaViva 360 · Admin"
    title="Auditoria do Assistente IA"
    subtitle="Registro completo de todas as interações com o assistente de IA. Apenas administradores."
    width="wide"
    :error="r.error.value ? (r.error.value.message || 'Erro ao carregar registros de auditoria') : null"
    @retry="r.load"
  >
    <!-- ── actions ── -->
    <template #actions>
      <UiButton variant="ghost" size="sm" :loading="exportLoading" @click="exportAudit">
        Exportar CSV
      </UiButton>
      <UiButton variant="ghost" size="sm" @click="r.load">
        Atualizar
      </UiButton>
    </template>

    <!-- ── filtros ── -->
    <template #filters>
      <UiFiltersPanel
        v-model="filters"
        :fields="filterFields"
        @apply="applyFilters"
        @clear="clearFilters"
      />
    </template>

    <!-- ── KPI summary row ── -->
    <div class="aav-kpi-row" role="region" aria-label="Resumo de interações do assistente">
      <div class="aav-kpi-card">
        <span class="aav-kpi-icon" aria-hidden="true">💬</span>
        <span class="aav-kpi-value">{{ kpis.total }}</span>
        <span class="aav-kpi-label">Total de Interações</span>
      </div>
      <div class="aav-kpi-card aav-kpi-card--convs">
        <span class="aav-kpi-icon" aria-hidden="true">🗂</span>
        <span class="aav-kpi-value">{{ kpis.conversations }}</span>
        <span class="aav-kpi-label">Conversas Únicas</span>
      </div>
      <div class="aav-kpi-card aav-kpi-card--tools">
        <span class="aav-kpi-icon" aria-hidden="true">⚙</span>
        <span class="aav-kpi-value">{{ kpis.withTools }}</span>
        <span class="aav-kpi-label">Com Ferramentas</span>
      </div>
      <div class="aav-kpi-card aav-kpi-card--speed">
        <span class="aav-kpi-icon" aria-hidden="true">⏱</span>
        <span class="aav-kpi-value">{{ kpis.avgDuration }}</span>
        <span class="aav-kpi-label">Duração Média</span>
      </div>
    </div>

    <!-- ── tabela principal ── -->
    <UiDataTable
      :columns="columns"
      :rows="r.items.value"
      :loading="r.loading.value"
      row-key="id"
      server-mode
      clickable-rows
      :sort="r.sort.value"
      :page="r.page.value"
      :page-size="r.pageSize.value"
      :total="r.total.value"
      paginated
      :empty="{ title: 'Nenhum registro de auditoria', description: 'Quando o assistente for utilizado, as interações aparecerão aqui.' }"
      @update:sort="r.setSort"
      @update:page="r.setPage"
      @row-click="openDetail"
    >
      <!-- ID da Conversa -->
      <template #cell-conversation_id="{ value }">
        <span class="aav-conv-id" :title="value || '—'">{{ truncate(value, 12) }}</span>
      </template>

      <!-- Pergunta truncada -->
      <template #cell-question="{ value }">
        <span class="aav-text-trunc" :title="value || '—'">{{ truncate(value, 80) }}</span>
      </template>

      <!-- Resposta truncada -->
      <template #cell-answer="{ value }">
        <span class="aav-text-trunc aav-answer" :title="value || '—'">{{ truncate(value, 80) }}</span>
      </template>

      <!-- Ferramentas usadas -->
      <template #cell-tools_used="{ value }">
        <span v-if="!value || value === '—' || value === '[]'" class="aav-no-tools">nenhuma</span>
        <span v-else class="aav-tools-wrap">
          <span v-for="tool in parseTools(value)" :key="tool" class="aav-tool-chip">{{ tool }}</span>
        </span>
      </template>

      <!-- Duração -->
      <template #cell-duration_ms="{ value }">
        <span class="aav-duration" :data-speed="speedTone(value)">{{ formatDuration(value) }}</span>
      </template>

      <!-- Data/hora -->
      <template #cell-created_at="{ value }">
        <span class="aav-datetime">{{ format.formatDateTime(value) }}</span>
      </template>

      <!-- empty action -->
      <template #empty-action>
        <UiButton variant="ghost" to="/ai-assistant">Ir para o Assistente</UiButton>
      </template>
    </UiDataTable>

    <!-- ── modal de detalhe da interação ── -->
    <UiModal
      :open="detailOpen"
      title="Detalhe da Interação"
      width="lg"
      @update:open="detailOpen = $event"
    >
      <div v-if="detailRow" class="aav-detail">
        <!-- cabeçalho do detalhe -->
        <div class="aav-detail-meta">
          <div class="aav-detail-meta-item">
            <span class="aav-detail-meta-label">Conversa</span>
            <span class="aav-detail-meta-value aav-mono">{{ detailRow.conversation_id || '—' }}</span>
          </div>
          <div class="aav-detail-meta-item">
            <span class="aav-detail-meta-label">Data</span>
            <span class="aav-detail-meta-value">{{ format.formatDateTime(detailRow.created_at) }}</span>
          </div>
          <div class="aav-detail-meta-item">
            <span class="aav-detail-meta-label">Duração</span>
            <span class="aav-detail-meta-value" :data-speed="speedTone(detailRow.duration_ms)">
              {{ formatDuration(detailRow.duration_ms) }}
            </span>
          </div>
        </div>

        <!-- ferramentas -->
        <div v-if="parseTools(detailRow.tools_used).length" class="aav-detail-section">
          <p class="aav-detail-section-title">Ferramentas Usadas</p>
          <div class="aav-tools-wrap">
            <span v-for="tool in parseTools(detailRow.tools_used)" :key="tool" class="aav-tool-chip aav-tool-chip--lg">{{ tool }}</span>
          </div>
        </div>

        <!-- pergunta -->
        <div class="aav-detail-section">
          <p class="aav-detail-section-title">Pergunta</p>
          <div class="aav-detail-bubble aav-detail-bubble--user">
            <p class="aav-detail-text">{{ detailRow.question || '—' }}</p>
          </div>
        </div>

        <!-- resposta -->
        <div class="aav-detail-section">
          <p class="aav-detail-section-title">Resposta</p>
          <div class="aav-detail-bubble aav-detail-bubble--assistant">
            <p v-for="(para, pi) in splitParas(detailRow.answer)" :key="pi" class="aav-detail-text">{{ para }}</p>
            <p v-if="!detailRow.answer || !detailRow.answer.trim()" class="aav-detail-text aav-muted">— sem resposta —</p>
          </div>
        </div>
      </div>

      <template #footer>
        <UiButton variant="ghost" @click="detailOpen = false">Fechar</UiButton>
      </template>
    </UiModal>

    <template #footer>
      <p>Log de auditoria somente leitura. Acesso restrito a administradores.</p>
    </template>
  </UiPageLayout>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import {
  UiPageLayout,
  UiDataTable,
  UiButton,
  UiFiltersPanel,
  UiModal,
  useResource,
  useToast,
  format,
} from '../ui/index.js';
import { resourceFactory } from '../api.js';

// ─── recurso REST ─────────────────────────────────────────────────────────────
// O integrador garante GET /v1/assistant/audit listando assistant_audit_log
const assistantAudit = resourceFactory('assistant/audit');
const BASE = import.meta.env.VITE_API_BASE_URL || '/contaviva-360/api';

// ─── composables ──────────────────────────────────────────────────────────────
const toast = useToast();
const r = useResource(assistantAudit);

// ─── estado local ─────────────────────────────────────────────────────────────
const exportLoading = ref(false);
const detailOpen = ref(false);
const detailRow = ref(null);

// ─── colunas da tabela ───────────────────────────────────────────────────────
const columns = [
  { key: 'conversation_id', label: 'Conversa',         sortable: false },
  { key: 'question',        label: 'Pergunta',          sortable: false },
  { key: 'answer',          label: 'Resposta',          sortable: false },
  { key: 'tools_used',      label: 'Ferramentas',       sortable: false },
  { key: 'duration_ms',     label: 'Duração',           sortable: true,  align: 'right' },
  { key: 'created_at',      label: 'Data',              sortable: true },
];

// ─── filtros ─────────────────────────────────────────────────────────────────
const filterFields = [
  {
    key: 'conversation_id',
    label: 'ID da Conversa',
    type: 'text',
    placeholder: 'ex.: conv-abc123',
  },
  {
    key: 'date_from',
    label: 'De',
    type: 'date',
  },
  {
    key: 'date_to',
    label: 'Até',
    type: 'date',
  },
];

const filters = ref({
  conversation_id: '',
  date_from: '',
  date_to: '',
});

function applyFilters() {
  r.setFilters({ ...filters.value });
}

function clearFilters() {
  filters.value = { conversation_id: '', date_from: '', date_to: '' };
  r.setFilters({});
}

// ─── KPI cards ───────────────────────────────────────────────────────────────
const kpis = computed(() => {
  const items = r.items.value || [];
  const convIds = new Set(items.map((i) => i.conversation_id).filter(Boolean));
  const withTools = items.filter((i) => {
    const tools = parseTools(i.tools_used);
    return tools.length > 0;
  }).length;
  const durations = items.map((i) => Number(i.duration_ms)).filter((n) => isFinite(n) && n > 0);
  const avg = durations.length ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : 0;
  return {
    total: r.total.value || items.length,
    conversations: convIds.size,
    withTools,
    avgDuration: avg > 0 ? formatDuration(avg) : '—',
  };
});

// ─── utilitários ─────────────────────────────────────────────────────────────
function truncate(str, max) {
  if (str === null || str === undefined || str === '') return '—';
  const s = String(str);
  return s.length > max ? s.slice(0, max) + '…' : s;
}

function parseTools(raw) {
  if (!raw || raw === '—') return [];
  // aceita JSON array ou string CSV
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (trimmed.startsWith('[')) {
      try {
        const arr = JSON.parse(trimmed);
        return Array.isArray(arr) ? arr.filter(Boolean) : [];
      } catch {
        // fallback: trata como CSV
      }
    }
    return trimmed.split(/[,;]+/).map((s) => s.trim()).filter(Boolean);
  }
  if (Array.isArray(raw)) return raw.filter(Boolean);
  return [];
}

function formatDuration(ms) {
  const n = Number(ms);
  if (!isFinite(n) || n <= 0) return '—';
  if (n < 1000) return n + ' ms';
  if (n < 60000) return (n / 1000).toFixed(1) + ' s';
  return Math.round(n / 60000) + ' min';
}

function speedTone(ms) {
  const n = Number(ms);
  if (!isFinite(n) || n <= 0) return 'neutral';
  if (n < 2000) return 'fast';
  if (n < 8000) return 'normal';
  return 'slow';
}

function splitParas(text) {
  if (!text) return [];
  return String(text).split(/\n{2,}|\r?\n/).map((s) => s.trim()).filter(Boolean);
}

// ─── ação: abrir detalhe ─────────────────────────────────────────────────────
function openDetail(row) {
  detailRow.value = row;
  detailOpen.value = true;
}

// ─── ação: exportar CSV ──────────────────────────────────────────────────────
async function exportAudit() {
  exportLoading.value = true;
  try {
    const params = new URLSearchParams();
    if (filters.value.conversation_id) params.append('conversation_id', filters.value.conversation_id);
    if (filters.value.date_from) params.append('date_from', filters.value.date_from);
    if (filters.value.date_to) params.append('date_to', filters.value.date_to);
    params.append('format', 'csv');
    const qs = params.toString();
    const url = BASE + '/v1/assistant/audit' + (qs ? '?' + qs : '');
    const res = await fetch(url, { headers: { Accept: 'text/csv,application/json' } });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error((data && data.error && data.error.message) || ('HTTP ' + res.status));
    }
    const blob = await res.blob();
    const cd = res.headers.get('content-disposition') || '';
    const match = cd.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
    const filename = match ? match[1].replace(/['"]/g, '') : 'assistant-audit.csv';
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(blobUrl);
    toast.success('Exportação de auditoria concluída.');
  } catch (e) {
    toast.error(e.message || 'Erro ao exportar auditoria. Tente novamente.');
  } finally {
    exportLoading.value = false;
  }
}

// ─── init ─────────────────────────────────────────────────────────────────────
onMounted(r.load);
</script>

<style scoped>
/* ── KPI row ── */
.aav-kpi-row {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: var(--ui-space-3);
}

@media (max-width: 860px) {
  .aav-kpi-row {
    grid-template-columns: repeat(2, 1fr);
  }
}

@media (max-width: 480px) {
  .aav-kpi-row {
    grid-template-columns: 1fr 1fr;
  }
}

.aav-kpi-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--ui-space-1);
  padding: var(--ui-space-4) var(--ui-space-3);
  border-radius: var(--ui-radius-lg);
  border: 1px solid rgb(var(--ui-border));
  background: rgb(var(--ui-surface));
  text-align: center;
}

.aav-kpi-card--convs {
  border-color: rgb(var(--ui-accent) / 0.25);
  background: rgb(var(--ui-accent) / 0.04);
}

.aav-kpi-card--tools {
  border-color: rgb(var(--ui-warn) / 0.25);
  background: rgb(var(--ui-warn) / 0.04);
}

.aav-kpi-card--speed {
  border-color: rgb(var(--ui-ok) / 0.25);
  background: rgb(var(--ui-ok) / 0.04);
}

.aav-kpi-icon {
  font-size: 1.4rem;
  line-height: 1;
}

.aav-kpi-value {
  font-size: 2rem;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
  line-height: 1;
  color: rgb(var(--ui-fg));
}

.aav-kpi-label {
  font-size: var(--ui-text-xs);
  font-weight: 600;
  color: rgb(var(--ui-muted));
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

/* ── célula: ID da conversa ── */
.aav-conv-id {
  display: inline-block;
  font-family: ui-monospace, 'Cascadia Code', 'Fira Code', monospace;
  font-size: var(--ui-text-xs);
  font-weight: 600;
  color: rgb(var(--ui-accent-strong));
  background: rgb(var(--ui-accent) / 0.09);
  border-radius: var(--ui-radius-sm);
  padding: 2px 7px;
  white-space: nowrap;
  max-width: 120px;
  overflow: hidden;
  text-overflow: ellipsis;
  vertical-align: middle;
}

/* ── células de texto truncado ── */
.aav-text-trunc {
  display: inline-block;
  max-width: 280px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: var(--ui-text-sm);
  color: rgb(var(--ui-fg));
  vertical-align: middle;
}

.aav-answer {
  color: rgb(var(--ui-muted));
}

/* ── ferramentas ── */
.aav-no-tools {
  font-size: var(--ui-text-xs);
  color: rgb(var(--ui-muted));
  font-style: italic;
}

.aav-tools-wrap {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  align-items: center;
}

.aav-tool-chip {
  display: inline-flex;
  align-items: center;
  font-size: var(--ui-text-xs);
  font-weight: 700;
  letter-spacing: 0.03em;
  text-transform: lowercase;
  border-radius: var(--ui-radius-pill);
  padding: 2px 8px;
  background: rgb(var(--ui-warn) / 0.12);
  color: rgb(var(--ui-warn));
  white-space: nowrap;
  border: 1px solid rgb(var(--ui-warn) / 0.25);
}

.aav-tool-chip--lg {
  font-size: var(--ui-text-sm);
  padding: 4px 12px;
}

/* ── duração com tom por velocidade ── */
.aav-duration {
  font-variant-numeric: tabular-nums;
  font-size: var(--ui-text-sm);
  font-weight: 600;
  white-space: nowrap;
}

.aav-duration[data-speed="fast"] {
  color: rgb(var(--ui-ok));
}

.aav-duration[data-speed="normal"] {
  color: rgb(var(--ui-fg));
}

.aav-duration[data-speed="slow"] {
  color: rgb(var(--ui-warn));
}

.aav-duration[data-speed="neutral"] {
  color: rgb(var(--ui-muted));
}

/* ── data/hora ── */
.aav-datetime {
  font-size: var(--ui-text-sm);
  font-variant-numeric: tabular-nums;
  color: rgb(var(--ui-muted));
  white-space: nowrap;
}

/* ── modal de detalhe ── */
.aav-detail {
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-4);
}

.aav-detail-meta {
  display: flex;
  gap: var(--ui-space-5);
  flex-wrap: wrap;
  background: rgb(var(--ui-surface-2));
  border: 1px solid rgb(var(--ui-border));
  border-radius: var(--ui-radius-md);
  padding: var(--ui-space-3) var(--ui-space-4);
}

.aav-detail-meta-item {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.aav-detail-meta-label {
  font-size: var(--ui-text-xs);
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: rgb(var(--ui-muted));
}

.aav-detail-meta-value {
  font-size: var(--ui-text-sm);
  font-weight: 600;
  color: rgb(var(--ui-fg));
}

.aav-detail-meta-value[data-speed="fast"] { color: rgb(var(--ui-ok)); }
.aav-detail-meta-value[data-speed="slow"]  { color: rgb(var(--ui-warn)); }

.aav-mono {
  font-family: ui-monospace, 'Cascadia Code', 'Fira Code', monospace;
  font-size: var(--ui-text-xs);
  color: rgb(var(--ui-accent-strong));
  background: rgb(var(--ui-accent) / 0.09);
  border-radius: var(--ui-radius-sm);
  padding: 2px 6px;
}

.aav-detail-section {
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-2);
}

.aav-detail-section-title {
  margin: 0;
  font-size: var(--ui-text-xs);
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: rgb(var(--ui-muted));
}

.aav-detail-bubble {
  border-radius: var(--ui-radius-md);
  padding: var(--ui-space-3) var(--ui-space-4);
  border: 1px solid rgb(var(--ui-border));
}

.aav-detail-bubble--user {
  background: rgb(var(--ui-accent) / 0.07);
  border-color: rgb(var(--ui-accent) / 0.22);
}

.aav-detail-bubble--assistant {
  background: rgb(var(--ui-surface-2));
  border-color: rgb(var(--ui-border));
}

.aav-detail-text {
  margin: 0 0 var(--ui-space-2);
  font-size: var(--ui-text-sm);
  line-height: 1.6;
  color: rgb(var(--ui-fg));
  white-space: pre-wrap;
  word-break: break-word;
}

.aav-detail-text:last-child {
  margin-bottom: 0;
}

.aav-muted {
  color: rgb(var(--ui-muted));
  font-style: italic;
}

@media (max-width: 860px) {
  .aav-text-trunc {
    max-width: 180px;
  }
  .aav-detail-meta {
    flex-direction: column;
    gap: var(--ui-space-3);
  }
}

@media (max-width: 540px) {
  .aav-kpi-row {
    grid-template-columns: 1fr 1fr;
  }
  .aav-kpi-value {
    font-size: 1.5rem;
  }
  .aav-text-trunc {
    max-width: 120px;
  }
}
</style>
