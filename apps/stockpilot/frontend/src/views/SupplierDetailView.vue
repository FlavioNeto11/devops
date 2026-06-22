<template>
  <UiPageLayout
    width="wide"
    eyebrow="StockPilot — Fornecedor"
    :title="headerTitle"
    :subtitle="headerSubtitle"
    :loading="loading"
    :error="pageError"
    @retry="loadSupplier"
  >
    <!-- ações de topo -->
    <template #actions>
      <UiButton variant="ghost" to="/suppliers">
        <template #icon-left><span aria-hidden="true">←</span></template>
        Voltar aos fornecedores
      </UiButton>
      <UiButton
        v-if="!notFound"
        variant="ghost"
        :to="'/suppliers/' + id + '/edit'"
        :disabled="loading"
      >
        Editar
      </UiButton>
      <UiButton
        variant="subtle"
        :loading="refreshing"
        :disabled="loading || notFound"
        @click="refreshAll"
      >
        Atualizar
      </UiButton>
    </template>

    <!-- Estado especial: fornecedor inexistente (404) — distinto de erro genérico -->
    <UiCard v-if="notFound" padded>
      <UiEmptyState
        icon="search"
        title="Fornecedor não encontrado"
        :description="'Nenhum fornecedor com o identificador #' + id + ' está disponível para este tenant.'"
      >
        <template #action>
          <UiButton variant="primary" to="/suppliers">Voltar aos fornecedores</UiButton>
        </template>
      </UiEmptyState>
    </UiCard>

    <template v-else>
      <!-- DetailHeader: hero com ActiveBadge -->
      <UiCard padded>
        <div class="sd-hero">
          <div class="sd-hero-main">
            <span class="sd-hero-avatar" :data-active="isActive ? 'true' : 'false'" aria-hidden="true">
              {{ initials }}
            </span>
            <div class="sd-hero-titles">
              <div class="sd-hero-name-row">
                <h2 class="sd-hero-name">{{ supplier.name || 'Fornecedor #' + id }}</h2>
                <UiStatusBadge
                  :status="activeStatus"
                  :tone="activeTone"
                  :label="activeLabel"
                  size="lg"
                />
              </div>
              <p class="sd-hero-meta ui-muted">{{ heroNarrative }}</p>
            </div>
          </div>
          <dl class="sd-hero-facts">
            <div class="sd-fact">
              <dt>Gateway</dt>
              <dd>
                <span v-if="supplier.gateway_url" class="ui-mono sd-truncate">{{ supplier.gateway_url }}</span>
                <span v-else class="ui-muted">Não configurado</span>
              </dd>
            </div>
            <div class="sd-fact">
              <dt>Autenticação</dt>
              <dd><span class="sd-chip">{{ authLabel }}</span></dd>
            </div>
            <div class="sd-fact">
              <dt>Cadastrado em</dt>
              <dd>{{ fmtDateTime(supplier.created_at) }}</dd>
            </div>
          </dl>
        </div>
      </UiCard>

      <!-- Métricas de configuração do gateway (dados REAIS do fornecedor) -->
      <div class="sd-metrics">
        <UiMetricCard
          label="Situação"
          :value="activeLabel"
          :tone="activeTone"
          :loading="loading"
          :hint="isActive ? 'Recebe novos pedidos' : 'Não recebe pedidos'"
        />
        <UiMetricCard
          label="Timeout por troca"
          :value="timeoutLabel"
          :tone="timeoutTone"
          :loading="loading"
          hint="Limite de cada chamada ao gateway"
        />
        <UiMetricCard
          label="Novas tentativas"
          :value="retriesLabel"
          :tone="retriesTone"
          :loading="loading"
          hint="Repetições com backoff antes da DLQ"
        />
        <UiMetricCard
          label="Resiliência"
          :value="postureTitle"
          :tone="postureMetricTone"
          :loading="loading"
          hint="Veredito de timeout + tentativas"
        />
      </div>

      <div class="sd-grid">
        <!-- ConfigSummary -->
        <UiCard title="Configuração do gateway" subtitle="Parâmetros usados nas trocas com o fornecedor.">
          <template #actions>
            <UiButton variant="ghost" size="sm" :disabled="!supplier.gateway_url" @click="copyGatewayUrl">
              Copiar URL
            </UiButton>
          </template>
          <dl class="sd-kv">
            <div class="sd-kv-row">
              <dt>ID</dt>
              <dd class="ui-mono">#{{ supplier.id != null ? supplier.id : id }}</dd>
            </div>
            <div class="sd-kv-row">
              <dt>Nome do fornecedor</dt>
              <dd>{{ supplier.name || '—' }}</dd>
            </div>
            <div class="sd-kv-row">
              <dt>URL do gateway</dt>
              <dd>
                <span v-if="supplier.gateway_url" class="ui-mono sd-break">{{ supplier.gateway_url }}</span>
                <span v-else class="ui-muted">—</span>
              </dd>
            </div>
            <div class="sd-kv-row">
              <dt>Tipo de autenticação</dt>
              <dd><span class="sd-chip">{{ authLabel }}</span></dd>
            </div>
            <div class="sd-kv-row">
              <dt>Timeout</dt>
              <dd>{{ supplier.timeout_ms != null ? formatNumber(supplier.timeout_ms) + ' ms' : '—' }}</dd>
            </div>
            <div class="sd-kv-row">
              <dt>Máx. tentativas</dt>
              <dd>{{ supplier.max_retries != null ? formatNumber(supplier.max_retries) : '—' }}</dd>
            </div>
            <div class="sd-kv-row">
              <dt>Status</dt>
              <dd>
                <UiStatusBadge :status="activeStatus" :tone="activeTone" :label="activeLabel" />
              </dd>
            </div>
          </dl>

          <!-- Postura de resiliência: traduz timeout+retries em veredito legível -->
          <div class="sd-posture" role="note">
            <span class="sd-posture-icon" :data-tone="postureTone" aria-hidden="true">{{ postureGlyph }}</span>
            <div class="sd-posture-body">
              <p class="sd-posture-title">{{ postureTitle }}</p>
              <p class="sd-posture-msg ui-muted">{{ postureMessage }}</p>
            </div>
          </div>
        </UiCard>

        <!-- Observações + nota de segredos -->
        <div class="sd-side">
          <UiCard title="Observações" subtitle="Notas operacionais e política de redação.">
            <p v-if="supplier.notes" class="sd-notes">{{ supplier.notes }}</p>
            <UiEmptyState
              v-else
              compact
              icon="doc"
              title="Sem observações"
              description="Nenhuma nota foi registrada para este fornecedor."
            />
            <div class="sd-secret-note" role="note">
              <span class="sd-secret-icon" aria-hidden="true">🔒</span>
              <div class="sd-secret-body">
                <p class="sd-secret-title">Credenciais protegidas</p>
                <p class="sd-secret-msg ui-muted">
                  Chaves e tokens de autenticação nunca são exibidos nem persistidos em texto puro.
                  Os erros da trilha de auditoria são sempre redigidos.
                </p>
              </div>
            </div>
          </UiCard>
        </div>
      </div>

      <!-- AuditTrailTable — trilha de auditoria das trocas do gateway (tenant) -->
      <UiCard
        title="Trilha de auditoria do gateway"
        :subtitle="auditSubtitle"
      >
        <template #actions>
          <UiButton variant="ghost" size="sm" :loading="auditLoading" @click="loadAudit">
            Recarregar
          </UiButton>
        </template>

        <!-- Aviso honesto: a trilha ainda não é atribuível por fornecedor no backend. -->
        <p class="sd-audit-scope ui-muted" role="note">
          A API ainda não vincula cada troca a um fornecedor específico, então esta trilha mostra
          as trocas do gateway de todo o tenant. Use os filtros abaixo para refinar por desfecho e operação.
        </p>

        <!-- filtros locais sobre a trilha do tenant -->
        <UiFiltersPanel
          v-model="auditFilters"
          :fields="auditFilterFields"
          @apply="applyAuditFilters"
          @clear="clearAuditFilters"
        />

        <UiDataTable
          :columns="auditColumns"
          :rows="filteredAudit"
          row-key="id"
          density="compact"
          :loading="auditLoading"
          :error="auditErrorMessage"
          :sort="auditSort"
          :empty="auditEmpty"
          @retry="loadAudit"
          @update:sort="(s) => (auditSort = s)"
        >
          <template #cell-outcome="{ value }">
            <UiStatusBadge :status="value" :tone="outcomeTone(value)" :label="outcomeLabel(value)" />
          </template>
          <template #cell-operation="{ value }">
            {{ value ? humanize(value) : '—' }}
          </template>
          <template #cell-attempt="{ value }">
            <span v-if="value != null" class="ui-mono">#{{ value }}</span>
            <span v-else class="ui-muted">—</span>
          </template>
          <template #cell-status_code="{ value }">
            <span v-if="value != null" class="sd-http ui-mono" :data-class="httpClass(value)">{{ value }}</span>
            <span v-else class="ui-muted">—</span>
          </template>
          <template #cell-duration_ms="{ value }">
            <span v-if="value != null">{{ formatNumber(value) }} ms</span>
            <span v-else class="ui-muted">—</span>
          </template>
          <template #cell-error_redacted="{ value }">
            <span v-if="value" class="sd-audit-err ui-mono">{{ value }}</span>
            <span v-else class="ui-muted">—</span>
          </template>
          <template #cell-created_at="{ value }">{{ fmtDateTime(value) }}</template>
          <template #empty-action>
            <UiButton variant="subtle" to="/orders">Ver pedidos de reposição</UiButton>
          </template>
        </UiDataTable>
      </UiCard>
    </template>
  </UiPageLayout>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import {
  UiPageLayout,
  UiCard,
  UiButton,
  UiStatusBadge,
  UiMetricCard,
  UiDataTable,
  UiEmptyState,
  UiFiltersPanel,
  useToast,
  format,
} from '../ui/index.js';
import * as api from '../api.js';

const props = defineProps({ id: { type: String, required: true } });
const id = computed(() => props.id);
const toast = useToast();

const fmtDateTime = (v) => format.formatDateTime(v);
const humanize = (v) => format.humanize(v);
const formatNumber = (v) => format.formatNumber(v);

// ---- estado: fornecedor ----
const supplier = ref({});
const loading = ref(true);
const loadError = ref(null);
const notFound = ref(false);
const refreshing = ref(false);

// ---- estado: auditoria (trilha do gateway, escopo do tenant) ----
const auditRows = ref([]);
const auditLoading = ref(true);
const auditError = ref(null);
const auditSort = ref({ key: 'created_at', dir: 'desc' });
const auditFilters = ref({ outcome: '', operation: '' });

const errMessage = (e, fallback) =>
  (e && (e.message || (e.error && e.error.message))) || fallback;

async function loadSupplier() {
  loading.value = true;
  loadError.value = null;
  notFound.value = false;
  try {
    supplier.value = (await api.suppliers.get(props.id)) || {};
  } catch (e) {
    if (e && e.status === 404) {
      notFound.value = true;
      supplier.value = {};
    } else {
      loadError.value = e;
    }
  } finally {
    loading.value = false;
  }
}

// Carrega a trilha REAL do tenant (GET /v1/audit). O backend ainda IGNORA query params e não
// expõe supplier_id, então NÃO enviamos filtros decorativos que o servidor descartaria — a
// filtragem por desfecho/operação é client-side e está claramente sinalizada como tal na tela.
async function loadAudit() {
  auditLoading.value = true;
  auditError.value = null;
  try {
    const res = await api.audit.list();
    const list = Array.isArray(res) ? res : res && res.data ? res.data : [];
    auditRows.value = list;
  } catch (e) {
    auditError.value = e;
  } finally {
    auditLoading.value = false;
  }
}

async function refreshAll() {
  refreshing.value = true;
  try {
    await Promise.all([loadSupplier(), loadAudit()]);
    if (notFound.value) {
      toast.warning('Fornecedor não encontrado.');
    } else if (!loadError.value && !auditError.value) {
      toast.success('Fornecedor atualizado.');
    } else {
      toast.error('Não foi possível atualizar tudo.');
    }
  } finally {
    refreshing.value = false;
  }
}

async function copyGatewayUrl() {
  const url = supplier.value.gateway_url;
  if (!url) {
    toast.warning('Nenhuma URL de gateway configurada.');
    return;
  }
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(url);
      toast.success('URL do gateway copiada.');
    } else {
      toast.info('Cópia indisponível neste navegador.');
    }
  } catch {
    toast.error('Não foi possível copiar a URL.');
  }
}

// erro da página: 404 vira estado próprio, então só erros "reais" vão pro PageLayout.
const pageError = computed(() => (notFound.value ? null : errMessage(loadError.value, null)));
const auditErrorMessage = computed(() =>
  auditError.value ? errMessage(auditError.value, 'Falha ao carregar a trilha de auditoria.') : null,
);

// ---- derivações: identidade / cabeçalho ----
const initials = computed(() => {
  const name = (supplier.value.name || '').trim();
  if (!name) return '∅';
  const parts = name.split(/\s+/).filter(Boolean);
  const first = parts[0] ? parts[0][0] : '';
  const second = parts.length > 1 ? parts[parts.length - 1][0] : '';
  return (first + second).toUpperCase() || '∅';
});

const headerTitle = computed(() => {
  if (loading.value) return 'Carregando fornecedor…';
  if (notFound.value) return 'Fornecedor #' + props.id;
  return supplier.value.name || 'Fornecedor #' + props.id;
});
const headerSubtitle = computed(() => {
  if (loading.value || loadError.value) return '';
  if (notFound.value) return 'Este fornecedor não está disponível.';
  return 'Configuração do gateway e a trilha de auditoria das trocas com o fornecedor.';
});

// ActiveBadge: traduz o booleano em status/tom/rótulo explícitos.
const isActive = computed(() => supplier.value.active === true);
const activeStatus = computed(() => (isActive.value ? 'active' : 'inactive'));
const activeTone = computed(() => (isActive.value ? 'success' : 'error'));
const activeLabel = computed(() => (isActive.value ? 'Ativo' : 'Inativo'));

const AUTH_LABELS = {
  api_key: 'API Key',
  bearer: 'Bearer Token',
  basic: 'Basic Auth',
  none: 'Sem autenticação',
};
const authLabel = computed(
  () => AUTH_LABELS[supplier.value.auth_type] || humanize(supplier.value.auth_type) || '—',
);

const heroNarrative = computed(() => {
  if (loadError.value) return '';
  if (!isActive.value) return 'Fornecedor inativo — não recebe novos pedidos de reposição.';
  if (!supplier.value.gateway_url) return 'Fornecedor ativo, mas o gateway ainda não foi configurado.';
  return 'Fornecedor ativo e pronto para receber pedidos de reposição.';
});

// ---- métricas de configuração (dados REAIS do fornecedor, sem depender da trilha) ----
const timeoutMs = computed(() => {
  const t = Number(supplier.value.timeout_ms);
  return Number.isFinite(t) && t > 0 ? t : null;
});
const maxRetries = computed(() => {
  const r = Number(supplier.value.max_retries);
  return Number.isFinite(r) && r >= 0 ? r : null;
});
const timeoutLabel = computed(() =>
  timeoutMs.value == null ? '—' : formatNumber(timeoutMs.value) + ' ms',
);
const timeoutTone = computed(() => {
  if (!supplier.value.gateway_url) return 'neutral';
  return timeoutMs.value == null ? 'warning' : 'success';
});
const retriesLabel = computed(() => (maxRetries.value == null ? '—' : formatNumber(maxRetries.value)));
const retriesTone = computed(() => {
  if (!supplier.value.gateway_url) return 'neutral';
  if (maxRetries.value == null) return 'warning';
  return maxRetries.value > 0 ? 'success' : 'warning';
});

// ---- postura de resiliência (timeout + retries em linguagem comum) ----
const postureTone = computed(() => {
  if (!supplier.value.gateway_url) return 'neutral';
  const hasTimeout = timeoutMs.value != null;
  const hasRetries = maxRetries.value != null && maxRetries.value > 0;
  if (hasTimeout && hasRetries) return 'success';
  if (hasTimeout || hasRetries) return 'warning';
  return 'error';
});
// UiMetricCard usa "primary" como tom de destaque positivo; mapeamos o tom de postura para o vocabulário do card.
const postureMetricTone = computed(() => (postureTone.value === 'success' ? 'primary' : postureTone.value));
const postureGlyph = computed(() =>
  postureTone.value === 'success' ? '🛡' : postureTone.value === 'warning' ? '⚠' : 'ℹ',
);
const postureTitle = computed(() => {
  if (!supplier.value.gateway_url) return 'Gateway não configurado';
  if (postureTone.value === 'success') return 'Configurada';
  if (postureTone.value === 'warning') return 'Parcial';
  return 'Sem proteção';
});
const postureMessage = computed(() => {
  if (!supplier.value.gateway_url) {
    return 'Defina a URL do gateway para habilitar timeout e novas tentativas nas trocas.';
  }
  const hasTimeout = timeoutMs.value != null;
  const hasRetries = maxRetries.value != null && maxRetries.value > 0;
  if (hasTimeout && hasRetries) {
    return (
      'Cada troca aborta após ' +
      formatNumber(timeoutMs.value) +
      ' ms e tenta novamente até ' +
      formatNumber(maxRetries.value) +
      ' vezes com backoff antes de ir para a DLQ.'
    );
  }
  if (hasTimeout) {
    return (
      'As trocas abortam após ' +
      formatNumber(timeoutMs.value) +
      ' ms, mas não há novas tentativas — uma falha pontual vira falha definitiva.'
    );
  }
  if (hasRetries) {
    return (
      'Até ' +
      formatNumber(maxRetries.value) +
      ' novas tentativas estão configuradas, mas sem timeout uma troca pode travar indefinidamente.'
    );
  }
  return 'Sem timeout nem novas tentativas: qualquer instabilidade do fornecedor falha a troca de imediato.';
});

// ---- derivações: trilha de auditoria do gateway (tenant) ----
// NOTA: o backend NÃO atribui trocas a um fornecedor (não há supplier_id em gateway_audit). A trilha
// é, portanto, a do gateway de todo o tenant — exibida com aviso honesto na tela. Não filtramos por
// fornecedor no cliente (seria sempre vazio e enganoso).
const auditSubtitle = computed(() => {
  const n = auditRows.value.length;
  if (auditError.value) return 'Cada troca com o gateway (tentativa, status HTTP, duração e erro redigido).';
  if (!n) return 'Cada troca com o gateway (tentativa, status HTTP, duração e erro redigido).';
  return formatNumber(n) + ' troca(s) registrada(s) no tenant.';
});

const filteredAudit = computed(() => {
  const { outcome, operation } = auditFilters.value;
  let rows = auditRows.value;
  if (outcome) rows = rows.filter((r) => String(r.outcome) === outcome);
  if (operation) rows = rows.filter((r) => String(r.operation) === operation);
  const dir = auditSort.value.dir === 'asc' ? 1 : -1;
  const key = auditSort.value.key || 'created_at';
  return [...rows].sort((a, b) => {
    const x = a[key];
    const y = b[key];
    if (x == null) return 1;
    if (y == null) return -1;
    return (x > y ? 1 : x < y ? -1 : 0) * dir;
  });
});

// opções de filtro derivadas das próprias linhas (sem valores fabricados).
const operationOptions = computed(() => {
  const set = new Set();
  for (const r of auditRows.value) if (r.operation) set.add(String(r.operation));
  return [...set].sort();
});
const auditFilterFields = computed(() => [
  {
    key: 'outcome',
    label: 'Desfecho',
    type: 'select',
    options: [
      { value: 'success', label: 'Sucesso' },
      { value: 'failure', label: 'Falha' },
    ],
  },
  {
    key: 'operation',
    label: 'Operação',
    type: 'select',
    options: operationOptions.value.map((o) => ({ value: o, label: humanize(o) })),
  },
]);

// Filtragem é reativa (computed) — os handlers existem para dar feedback real ao teclado/leitor de
// tela em vez de no-ops silenciosos: "Filtrar" confirma o resultado; "Limpar" reseta de fato.
function applyAuditFilters() {
  const n = filteredAudit.value.length;
  toast.info(n ? formatNumber(n) + ' registro(s) com os filtros aplicados.' : 'Nenhum registro com esses filtros.');
}
function clearAuditFilters() {
  auditFilters.value = { outcome: '', operation: '' };
  toast.info('Filtros da trilha limpos.');
}

// ---- helpers de célula ----
const outcomeTone = (v) => (v === 'success' ? 'success' : 'error');
const outcomeLabel = (v) => (v === 'success' ? 'Sucesso' : v === 'failure' ? 'Falha' : humanize(v));
const httpClass = (code) => {
  const n = Number(code);
  if (!Number.isFinite(n)) return 'unknown';
  if (n >= 500) return 'error';
  if (n >= 400) return 'warn';
  if (n >= 300) return 'info';
  if (n >= 200) return 'ok';
  return 'unknown';
};

const auditColumns = [
  { key: 'created_at', label: 'Quando', sortable: true },
  { key: 'operation', label: 'Operação' },
  { key: 'outcome', label: 'Desfecho' },
  { key: 'attempt', label: 'Tentativa', align: 'right', sortable: true },
  { key: 'status_code', label: 'HTTP', align: 'right' },
  { key: 'duration_ms', label: 'Duração', align: 'right', sortable: true },
  { key: 'error_redacted', label: 'Erro (redigido)' },
];

const auditEmpty = computed(() => {
  const hasFilter = !!(auditFilters.value.outcome || auditFilters.value.operation);
  if (hasFilter && auditRows.value.length) {
    return {
      title: 'Nenhuma troca com esses filtros',
      description: 'Ajuste o desfecho ou a operação para ver mais registros.',
      icon: 'search',
    };
  }
  return {
    title: 'Sem trocas auditadas',
    description: 'Ainda não há nenhuma troca com o gateway registrada para este tenant.',
    icon: 'history',
  };
});

onMounted(() => {
  loadSupplier();
  loadAudit();
});
</script>

<style scoped>
/* ---- DetailHeader / hero ---- */
.sd-hero {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ui-space-5);
  flex-wrap: wrap;
}
.sd-hero-main {
  display: flex;
  align-items: center;
  gap: var(--ui-space-4);
  min-width: 0;
}
.sd-hero-avatar {
  flex-shrink: 0;
  width: 56px;
  height: 56px;
  border-radius: var(--ui-radius-lg);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-family: var(--ui-font-display);
  font-weight: 700;
  font-size: var(--ui-text-lg);
  background: rgb(var(--ui-accent) / 0.14);
  color: rgb(var(--ui-accent-strong));
  border: 1px solid rgb(var(--ui-accent) / 0.3);
}
.sd-hero-avatar[data-active='false'] {
  background: rgb(var(--ui-muted) / 0.14);
  color: rgb(var(--ui-muted));
  border-color: rgb(var(--ui-border));
}
.sd-hero-titles {
  min-width: 0;
}
.sd-hero-name-row {
  display: flex;
  align-items: center;
  gap: var(--ui-space-3);
  flex-wrap: wrap;
}
.sd-hero-name {
  margin: 0;
  font-family: var(--ui-font-display);
  font-weight: 700;
  font-size: var(--ui-text-xl);
}
.sd-hero-meta {
  margin: 4px 0 0;
  font-size: var(--ui-text-sm);
}
.sd-hero-facts {
  display: flex;
  gap: var(--ui-space-5);
  margin: 0;
  flex-wrap: wrap;
  max-width: 100%;
}
.sd-fact {
  min-width: 0;
}
.sd-fact dt {
  font-size: var(--ui-text-xs);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: rgb(var(--ui-muted));
  font-weight: 700;
}
.sd-fact dd {
  margin: 4px 0 0;
  font-size: var(--ui-text-sm);
  min-width: 0;
}
.sd-truncate {
  display: inline-block;
  max-width: 240px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  vertical-align: bottom;
}
.sd-chip {
  display: inline-block;
  padding: 2px 9px;
  border-radius: var(--ui-radius-pill);
  background: rgb(var(--ui-surface-2));
  border: 1px solid rgb(var(--ui-border));
  font-size: var(--ui-text-xs);
  font-weight: 600;
}

/* ---- Métricas ---- */
.sd-metrics {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: var(--ui-space-4);
}

/* ---- Grid: config + lateral ---- */
.sd-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.1fr) minmax(0, 0.9fr);
  gap: var(--ui-space-4);
  align-items: start;
}
.sd-side {
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-4);
  min-width: 0;
}

/* ---- ConfigSummary dt/dd ---- */
.sd-kv {
  display: grid;
  gap: var(--ui-space-3);
  margin: 0;
}
.sd-kv-row {
  display: grid;
  grid-template-columns: 170px 1fr;
  gap: var(--ui-space-3);
  align-items: baseline;
  padding-bottom: var(--ui-space-3);
  border-bottom: 1px solid rgb(var(--ui-border));
}
.sd-kv-row:last-child {
  padding-bottom: 0;
  border-bottom: none;
}
.sd-kv dt {
  color: rgb(var(--ui-muted));
  font-size: var(--ui-text-sm);
}
.sd-kv dd {
  margin: 0;
  word-break: break-word;
}
.sd-break {
  word-break: break-all;
}

/* ---- Postura de resiliência ---- */
.sd-posture {
  display: flex;
  gap: var(--ui-space-3);
  align-items: flex-start;
  margin-top: var(--ui-space-4);
  padding: var(--ui-space-4);
  border-radius: var(--ui-radius-md);
  border: 1px solid rgb(var(--ui-border));
  background: rgb(var(--ui-surface-2));
}
.sd-posture-icon {
  font-size: 1.2rem;
  line-height: 1;
  flex-shrink: 0;
}
.sd-posture-icon[data-tone='success'] {
  color: rgb(var(--ui-ok));
}
.sd-posture-icon[data-tone='warning'] {
  color: rgb(var(--ui-warn));
}
.sd-posture-icon[data-tone='error'] {
  color: rgb(var(--ui-danger));
}
.sd-posture-icon[data-tone='neutral'] {
  color: rgb(var(--ui-muted));
}
.sd-posture-body {
  min-width: 0;
}
.sd-posture-title {
  margin: 0;
  font-weight: 700;
  font-size: var(--ui-text-sm);
}
.sd-posture-msg {
  margin: 4px 0 0;
  font-size: var(--ui-text-xs);
}

/* ---- Observações + nota de segredos ---- */
.sd-notes {
  margin: 0;
  white-space: pre-wrap;
  word-break: break-word;
  font-size: var(--ui-text-sm);
}
.sd-secret-note {
  display: flex;
  gap: var(--ui-space-3);
  align-items: flex-start;
  margin-top: var(--ui-space-4);
  padding: var(--ui-space-4);
  border-radius: var(--ui-radius-md);
  border: 1px solid rgb(var(--ui-border));
  background: rgb(var(--ui-surface-2));
}
.sd-secret-icon {
  font-size: 1.2rem;
  line-height: 1;
  flex-shrink: 0;
}
.sd-secret-body {
  min-width: 0;
}
.sd-secret-title {
  margin: 0;
  font-weight: 700;
  font-size: var(--ui-text-sm);
}
.sd-secret-msg {
  margin: 4px 0 0;
  font-size: var(--ui-text-xs);
}

/* ---- Auditoria ---- */
.sd-audit-scope {
  margin: 0 0 var(--ui-space-4);
  font-size: var(--ui-text-sm);
  padding: var(--ui-space-3) var(--ui-space-4);
  border-radius: var(--ui-radius-md);
  border: 1px solid rgb(var(--ui-border));
  background: rgb(var(--ui-surface-2));
}
.sd-audit-err {
  color: rgb(var(--ui-danger));
  font-size: var(--ui-text-xs);
  word-break: break-word;
}
.sd-http {
  font-weight: 600;
}
.sd-http[data-class='ok'] {
  color: rgb(var(--ui-ok));
}
.sd-http[data-class='warn'] {
  color: rgb(var(--ui-warn));
}
.sd-http[data-class='error'] {
  color: rgb(var(--ui-danger));
}
.sd-http[data-class='info'],
.sd-http[data-class='unknown'] {
  color: rgb(var(--ui-muted));
}

/* ---- Responsivo ---- */
@media (max-width: 860px) {
  .sd-metrics {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .sd-grid {
    grid-template-columns: 1fr;
  }
  .sd-hero {
    align-items: flex-start;
  }
  .sd-hero-facts {
    gap: var(--ui-space-4);
  }
  .sd-kv-row {
    grid-template-columns: 130px 1fr;
  }
}
@media (max-width: 560px) {
  .sd-metrics {
    grid-template-columns: 1fr;
  }
  .sd-truncate {
    max-width: 180px;
  }
}
</style>
