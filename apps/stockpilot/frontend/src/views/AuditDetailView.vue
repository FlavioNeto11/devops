<template>
  <UiPageLayout
    eyebrow="StockPilot · Conformidade"
    :title="headerTitle"
    :subtitle="headerSubtitle"
    width="wide"
    :loading="loading"
    loading-message="Carregando o registro de auditoria…"
    :error="loadError"
    @retry="loadEntry"
  >
    <!-- DetailHeader: ações de navegação (somente rotas de domínio do inventário) -->
    <template #actions>
      <UiButton variant="ghost" to="/audit">
        <template #icon-left><span aria-hidden="true">←</span></template>
        Voltar à trilha
      </UiButton>
      <UiButton
        variant="subtle"
        :loading="refreshing"
        :disabled="loading || notFound"
        @click="refresh"
      >
        <template #icon-left><span aria-hidden="true">↻</span></template>
        Atualizar
      </UiButton>
    </template>

    <!-- RedactedNotice: a evidência central desta tela, sempre visível quando há registro -->
    <template v-if="!notFound" #banner>
      <div class="ad-redacted" role="note">
        <span class="ad-redacted-icon" aria-hidden="true">🛡</span>
        <div class="ad-redacted-body">
          <p class="ad-redacted-title">Payloads sanitizados — segredos são redigidos</p>
          <p class="ad-redacted-text ui-muted">
            Tokens, chaves de API, cabeçalhos de autorização e demais segredos nunca são gravados
            nem exibidos. Cada campo sensível aparece como
            <span class="ad-redacted-chip ui-mono">[REDACTED]</span> nesta página e no banco —
            conforme <span class="ui-mono">REQ-STOCKPILOT-0004</span>.
          </p>
        </div>
        <span class="ad-redacted-tag" aria-hidden="true">REDIGIDO</span>
      </div>
    </template>

    <!-- Estado vazio: registro inexistente / fora do tenant / podado -->
    <UiEmptyState
      v-if="!loading && !loadError && notFound"
      title="Registro não encontrado"
      description="Esta auditoria não existe ou não pertence ao seu tenant. Ela pode ter sido podada — a trilha retém os registros mais recentes."
      icon="search"
    >
      <template #action>
        <div class="ad-empty-actions">
          <UiButton variant="primary" to="/audit">Ver trilha de auditoria</UiButton>
          <UiButton variant="ghost" to="/orders">Pedidos de reposição</UiButton>
        </div>
      </template>
    </UiEmptyState>

    <template v-else-if="!loading && !loadError">
      <!-- DetailHeader + OutcomeBadge -->
      <UiCard padded>
        <div class="ad-hero" :data-outcome="outcome || 'unknown'">
          <div class="ad-hero-main">
            <span class="ad-hero-glyph" aria-hidden="true">{{ outcomeGlyph }}</span>
            <div class="ad-hero-titles">
              <div class="ad-hero-row">
                <UiStatusBadge
                  :status="outcome"
                  :tone="outcomeTone"
                  :label="outcomeLabel"
                  size="lg"
                />
                <span class="ad-hero-op">{{ operationLabel }}</span>
              </div>
              <p class="ad-hero-meta ui-muted">{{ outcomeNarrative }}</p>
            </div>
          </div>
          <dl class="ad-hero-facts">
            <div class="ad-fact">
              <dt>HTTP status</dt>
              <dd>
                <span
                  v-if="entry.status_code != null"
                  class="ad-http ui-mono"
                  :data-class="statusClass"
                >{{ entry.status_code }}</span>
                <span v-else class="ui-muted">—</span>
              </dd>
            </div>
            <div class="ad-fact">
              <dt>Duração</dt>
              <dd>
                <span v-if="entry.duration_ms != null">{{ durationLabel }}</span>
                <span v-else class="ui-muted">—</span>
              </dd>
            </div>
            <div class="ad-fact">
              <dt>Tentativa</dt>
              <dd>
                <span v-if="entry.attempt != null">#{{ entry.attempt }}</span>
                <span v-else class="ui-muted">—</span>
              </dd>
            </div>
            <div class="ad-fact">
              <dt>Quando</dt>
              <dd>{{ fmtDateTime(entry.created_at) }}</dd>
            </div>
          </dl>
        </div>
      </UiCard>

      <!-- Métricas de leitura rápida -->
      <div class="ad-metrics">
        <UiMetricCard
          label="Desfecho"
          :value="outcomeLabel"
          :tone="outcomeTone === 'error' ? 'error' : outcome ? 'success' : 'neutral'"
          :hint="outcomeMetricHint"
        />
        <UiMetricCard
          label="HTTP status"
          :value="entry.status_code != null ? String(entry.status_code) : '—'"
          :tone="statusTone"
          :hint="statusHint"
        />
        <UiMetricCard
          label="Latência"
          :value="entry.duration_ms != null ? durationLabel : '—'"
          :tone="latencyTone"
          :hint="latencyHint"
        />
        <UiMetricCard
          label="Tentativa"
          :value="entry.attempt != null ? '#' + entry.attempt : '—'"
          :tone="attemptTone"
          :hint="attemptHint"
        />
      </div>

      <!-- ErrorCallout: erro redigido (só em falha com mensagem) -->
      <UiCard v-if="entry.error_redacted" padded>
        <div class="ad-callout" role="alert">
          <span class="ad-callout-icon" aria-hidden="true">⚠</span>
          <div class="ad-callout-body">
            <p class="ad-callout-title">Erro reportado pelo fornecedor</p>
            <pre class="ad-callout-msg ui-mono">{{ entry.error_redacted }}</pre>
            <p class="ad-callout-hint ui-muted">
              Mensagem já redigida — qualquer segredo foi substituído por
              <span class="ui-mono">[REDACTED]</span> antes de ser persistida.
            </p>
          </div>
        </div>
      </UiCard>

      <div class="ad-grid">
        <!-- Contexto / metadados (dt/dd) -->
        <UiCard title="Contexto da troca" subtitle="Identificação e relações deste registro.">
          <dl class="ad-kv">
            <div class="ad-kv-row">
              <dt>ID da auditoria</dt>
              <dd class="ui-mono">#{{ entry.id != null ? entry.id : id }}</dd>
            </div>
            <div class="ad-kv-row">
              <dt>Operação</dt>
              <dd>{{ operationLabel }}</dd>
            </div>
            <div class="ad-kv-row">
              <dt>Desfecho</dt>
              <dd><UiStatusBadge :status="outcome" :tone="outcomeTone" :label="outcomeLabel" /></dd>
            </div>
            <div class="ad-kv-row">
              <dt>Pedido</dt>
              <dd>
                <RouterLink v-if="entry.order_id != null" :to="'/orders/' + entry.order_id" class="ad-link">
                  <span class="ui-mono">PED-{{ entry.order_id }}</span>
                </RouterLink>
                <span v-else class="ui-muted">sem vínculo</span>
              </dd>
            </div>
            <div class="ad-kv-row">
              <dt>Produto</dt>
              <dd>
                <RouterLink v-if="entry.product_id != null" :to="'/products/' + entry.product_id" class="ad-link">
                  <span class="ui-mono">PROD-{{ entry.product_id }}</span>
                </RouterLink>
                <span v-else class="ui-muted">sem vínculo</span>
              </dd>
            </div>
            <div v-if="entry.tenant_id" class="ad-kv-row">
              <dt>Tenant</dt>
              <dd><span class="ui-mono">{{ entry.tenant_id }}</span></dd>
            </div>
            <div class="ad-kv-row">
              <dt>Registrado em</dt>
              <dd>
                <span :title="absoluteTime(entry.created_at)">{{ fmtDateTime(entry.created_at) }}</span>
                <span class="ad-rel ui-muted">· {{ relativeTime(entry.created_at) }}</span>
              </dd>
            </div>
          </dl>
        </UiCard>

        <!-- Resumo da chamada HTTP -->
        <UiCard title="Resumo da chamada" subtitle="Como a troca foi processada pelo gateway.">
          <ul class="ad-summary">
            <li class="ad-summary-item">
              <span class="ad-summary-key">Resultado</span>
              <span class="ad-summary-val">
                <UiStatusBadge :status="outcome" :tone="outcomeTone" :label="outcomeLabel" />
              </span>
            </li>
            <li class="ad-summary-item">
              <span class="ad-summary-key">Código HTTP</span>
              <span class="ad-summary-val">
                <span
                  v-if="entry.status_code != null"
                  class="ad-http ui-mono"
                  :data-class="statusClass"
                >{{ entry.status_code }} · {{ statusFamilyLabel }}</span>
                <span v-else class="ui-muted">sem resposta HTTP (falha antes da resposta)</span>
              </span>
            </li>
            <li class="ad-summary-item">
              <span class="ad-summary-key">Tempo de resposta</span>
              <span class="ad-summary-val">
                <span v-if="entry.duration_ms != null" :data-tone="latencyTone" class="ad-summary-dur">
                  {{ durationLabel }}
                </span>
                <span v-else class="ui-muted">—</span>
              </span>
            </li>
            <li class="ad-summary-item">
              <span class="ad-summary-key">Tentativa</span>
              <span class="ad-summary-val">
                <span v-if="entry.attempt != null">
                  #{{ entry.attempt }}
                  <span v-if="entry.attempt > 1" class="ad-retry-tag">retry</span>
                </span>
                <span v-else class="ui-muted">primeira</span>
              </span>
            </li>
          </ul>
          <p class="ad-summary-foot ui-muted">{{ outcomeNarrative }}</p>
        </UiCard>
      </div>

      <!-- JsonViewer: payload da requisição (sanitizado) -->
      <UiCard
        title="Payload da requisição"
        subtitle="Corpo enviado ao fornecedor, com segredos redigidos."
      >
        <template #actions>
          <UiStatusBadge tone="success" status="Sanitizado" size="sm" with-dot />
          <UiButton v-if="hasRequestPayload" variant="ghost" size="sm" @click="copyJson('request')">
            Copiar
          </UiButton>
          <UiButton v-if="hasRequestPayload" variant="ghost" size="sm" @click="openFull('request')">
            Expandir
          </UiButton>
        </template>
        <div v-if="hasRequestPayload" class="ad-json-wrap">
          <pre class="ad-json ui-mono" :data-collapsed="reqCollapsed ? 'true' : null">{{ requestJson }}</pre>
          <UiButton
            v-if="requestLong"
            variant="ghost"
            size="sm"
            :aria-expanded="reqCollapsed ? 'false' : 'true'"
            @click="reqCollapsed = !reqCollapsed"
          >
            {{ reqCollapsed ? 'Mostrar tudo' : 'Recolher' }}
          </UiButton>
        </div>
        <UiEmptyState
          v-else
          compact
          title="Sem payload de requisição"
          description="Este registro não guardou o corpo da requisição (ou a troca falhou antes de montá-lo)."
          icon="doc"
        />
      </UiCard>

      <!-- JsonViewer: payload da resposta (sanitizado) -->
      <UiCard
        title="Payload da resposta"
        subtitle="Corpo retornado pelo fornecedor, com segredos redigidos."
      >
        <template #actions>
          <UiStatusBadge tone="success" status="Sanitizado" size="sm" with-dot />
          <UiButton v-if="hasResponsePayload" variant="ghost" size="sm" @click="copyJson('response')">
            Copiar
          </UiButton>
          <UiButton v-if="hasResponsePayload" variant="ghost" size="sm" @click="openFull('response')">
            Expandir
          </UiButton>
        </template>
        <div v-if="hasResponsePayload" class="ad-json-wrap">
          <pre class="ad-json ui-mono" :data-collapsed="resCollapsed ? 'true' : null">{{ responseJson }}</pre>
          <UiButton
            v-if="responseLong"
            variant="ghost"
            size="sm"
            :aria-expanded="resCollapsed ? 'false' : 'true'"
            @click="resCollapsed = !resCollapsed"
          >
            {{ resCollapsed ? 'Mostrar tudo' : 'Recolher' }}
          </UiButton>
        </div>
        <UiEmptyState
          v-else
          compact
          title="Sem payload de resposta"
          description="Este registro não guardou o corpo da resposta (sem resposta do fornecedor ou corpo vazio)."
          icon="doc"
        />
      </UiCard>

      <!-- Atalhos de domínio (só rotas reais do inventário) -->
      <UiCard title="Continuar pela operação" subtitle="De onde esta troca se conecta ao resto do estoque.">
        <div class="ad-links" role="group" aria-label="Atalhos do domínio de estoque">
          <UiButton variant="ghost" to="/audit">
            <template #icon-left><span aria-hidden="true">🗂</span></template>
            Trilha de auditoria
          </UiButton>
          <UiButton
            v-if="entry.order_id != null"
            variant="ghost"
            :to="'/orders/' + entry.order_id"
          >
            <template #icon-left><span aria-hidden="true">🧾</span></template>
            Pedido vinculado
          </UiButton>
          <UiButton variant="ghost" to="/orders">
            <template #icon-left><span aria-hidden="true">🧾</span></template>
            Pedidos de reposição
          </UiButton>
          <UiButton
            v-if="entry.product_id != null"
            variant="ghost"
            :to="'/products/' + entry.product_id"
          >
            <template #icon-left><span aria-hidden="true">📦</span></template>
            Produto vinculado
          </UiButton>
          <UiButton variant="ghost" to="/products">
            <template #icon-left><span aria-hidden="true">📦</span></template>
            Catálogo de produtos
          </UiButton>
        </div>
      </UiCard>
    </template>

    <template #footer>
      <span>
        Registro sanitizado conforme REQ-STOCKPILOT-0004: cada tentativa de troca com o fornecedor
        gera uma entrada com payloads e erro redigidos — segredos (tokens / API keys) nunca aparecem
        aqui nem no banco.
      </span>
    </template>

    <!-- Modal: JSON em tela cheia -->
    <UiModal v-model:open="fullOpen" :title="fullTitle" width="lg">
      <div class="ad-modal-note ui-muted">
        <span aria-hidden="true">🔒 </span>
        Conteúdo já redigido na gravação — segredos aparecem como
        <span class="ui-mono">[REDACTED]</span>.
      </div>
      <pre class="ad-json ad-json-full ui-mono">{{ fullJson }}</pre>
      <template #footer>
        <UiButton variant="ghost" @click="copyJson(fullKind)">Copiar JSON</UiButton>
        <UiButton variant="primary" @click="fullOpen = false">Fechar</UiButton>
      </template>
    </UiModal>
  </UiPageLayout>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue';
import { RouterLink } from 'vue-router';
import {
  UiPageLayout,
  UiCard,
  UiButton,
  UiStatusBadge,
  UiMetricCard,
  UiEmptyState,
  UiModal,
  useToast,
  format,
} from '../ui/index.js';
import * as api from '../api.js';

// Rota /audit/:id com props:true → o id chega como prop string.
const props = defineProps({ id: { type: [String, Number], required: true } });
const toast = useToast();

const fmtDateTime = (v) => format.formatDateTime(v);
const humanize = (v) => format.humanize(v);

// ---------------------------------------------------------------------------
// Estado
// ---------------------------------------------------------------------------
const entry = ref({});
const loading = ref(true);
const loadError = ref(null);
const notFound = ref(false);
const refreshing = ref(false);

// ---------------------------------------------------------------------------
// Busca por id com fallback resiliente. O alvo é GET /v1/audit/{id} (a criar);
// enquanto o detalhe não existir no backend, lemos a trilha (GET /v1/audit —
// endpoint garantido) e filtramos pelo id. NENHUMA rota é inventada.
// ---------------------------------------------------------------------------
const resourceReady = computed(
  () => !!api.audit && typeof api.audit.list === 'function',
);

async function fetchEntry() {
  const wantId = Number(props.id);
  let record = null;
  if (typeof api.audit.get === 'function') {
    try {
      record = await api.audit.get(props.id);
    } catch (e) {
      // 404/405/501 → o detalhe ainda não existe; cai no fallback pela listagem.
      // Erro de rede/parse (sem status) → propaga como erro real da página.
      if (e && e.status === undefined) throw e;
      record = null;
    }
  }
  if (record && record.id != null) return record;

  const res = await api.audit.list();
  const list = Array.isArray(res) ? res : res && res.data ? res.data : [];
  return list.find((r) => Number(r.id) === wantId) || null;
}

async function loadEntry() {
  loading.value = true;
  loadError.value = null;
  notFound.value = false;
  if (!resourceReady.value) {
    loadError.value = 'Auditoria indisponível: a API de auditoria não está conectada ao cliente.';
    loading.value = false;
    return;
  }
  try {
    const record = await fetchEntry();
    if (record) {
      entry.value = record;
    } else {
      entry.value = {};
      notFound.value = true;
    }
  } catch (e) {
    loadError.value = (e && e.message) || 'Falha ao carregar o registro de auditoria.';
  } finally {
    loading.value = false;
  }
}

async function refresh() {
  refreshing.value = true;
  try {
    await loadEntry();
    if (!loadError.value && !notFound.value) toast.success('Registro de auditoria atualizado.');
    else if (notFound.value) toast.warning('Registro não encontrado.');
    else toast.error('Não foi possível atualizar o registro.');
  } finally {
    refreshing.value = false;
  }
}

// Recarrega ao navegar entre /audit/:id sem desmontar a view.
watch(() => props.id, loadEntry);

// ---------------------------------------------------------------------------
// Derivações de desfecho
// ---------------------------------------------------------------------------
const outcome = computed(() => String(entry.value.outcome || '').toLowerCase());
const isFailure = computed(() => outcome.value === 'failure');
const outcomeTone = computed(() => (isFailure.value ? 'error' : 'success'));
const outcomeLabel = computed(() =>
  isFailure.value ? 'Falha' : outcome.value === 'success' ? 'Sucesso' : '—',
);
const outcomeGlyph = computed(() => (isFailure.value ? '✕' : outcome.value ? '✓' : '•'));
const outcomeNarrative = computed(() => {
  if (!outcome.value) return 'Registro de uma troca com o fornecedor externo.';
  return isFailure.value
    ? 'A troca com o fornecedor falhou — veja o erro redigido e os payloads sanitizados abaixo.'
    : 'A troca com o fornecedor foi concluída com sucesso e auditada com payloads sanitizados.';
});
const outcomeMetricHint = computed(() =>
  isFailure.value ? 'Troca não concluída' : outcome.value ? 'Troca concluída' : 'Sem desfecho',
);

const operationLabel = computed(() =>
  entry.value.operation ? humanize(entry.value.operation) : 'Operação não identificada',
);

// ---------------------------------------------------------------------------
// HTTP status (família + tom + rótulo)
// ---------------------------------------------------------------------------
const statusClass = computed(() => {
  const c = Number(entry.value.status_code);
  if (!Number.isFinite(c)) return 'none';
  if (c >= 200 && c < 300) return 'ok';
  if (c >= 300 && c < 400) return 'redirect';
  if (c >= 400 && c < 500) return 'client';
  if (c >= 500) return 'server';
  return 'none';
});
const statusFamilyLabel = computed(() => {
  switch (statusClass.value) {
    case 'ok': return 'sucesso';
    case 'redirect': return 'redirecionamento';
    case 'client': return 'erro do cliente';
    case 'server': return 'erro do servidor';
    default: return '—';
  }
});
const statusTone = computed(() => {
  switch (statusClass.value) {
    case 'ok': return 'success';
    case 'redirect': return 'neutral';
    case 'client':
    case 'server': return 'error';
    default: return 'neutral';
  }
});
const statusHint = computed(() =>
  entry.value.status_code != null ? statusFamilyLabel.value : 'Sem resposta HTTP',
);

// ---------------------------------------------------------------------------
// Duração / latência
// ---------------------------------------------------------------------------
const durationLabel = computed(() => {
  const ms = Number(entry.value.duration_ms);
  if (!Number.isFinite(ms)) return '—';
  if (ms < 1000) return Math.round(ms) + ' ms';
  if (ms < 60000) return (ms / 1000).toFixed(ms < 10000 ? 2 : 1) + ' s';
  const min = Math.floor(ms / 60000);
  const sec = Math.round((ms % 60000) / 1000);
  return min + ' min ' + sec + ' s';
});
const latencyTone = computed(() => {
  const ms = Number(entry.value.duration_ms);
  if (!Number.isFinite(ms)) return 'neutral';
  if (ms >= 3000) return 'error';
  if (ms >= 1000) return 'warning';
  return 'success';
});
const latencyHint = computed(() => {
  const ms = Number(entry.value.duration_ms);
  if (!Number.isFinite(ms)) return 'Sem medição';
  if (ms >= 3000) return 'Acima do esperado';
  if (ms >= 1000) return 'Atenção';
  return 'Dentro do esperado';
});

// ---------------------------------------------------------------------------
// Tentativa
// ---------------------------------------------------------------------------
const attemptTone = computed(() => {
  const a = Number(entry.value.attempt);
  if (!Number.isFinite(a)) return 'neutral';
  return a > 1 ? 'warning' : 'neutral';
});
const attemptHint = computed(() => {
  const a = Number(entry.value.attempt);
  if (!Number.isFinite(a)) return 'Número da retentativa';
  return a > 1 ? 'Houve retentativa' : 'Primeira tentativa';
});

// ---------------------------------------------------------------------------
// Cabeçalho da página
// ---------------------------------------------------------------------------
const headerTitle = computed(
  () => 'Auditoria #' + (entry.value.id != null ? entry.value.id : props.id),
);
const headerSubtitle = computed(() => {
  if (loadError.value) return 'Não foi possível carregar este registro.';
  if (notFound.value) return 'Registro não encontrado na trilha.';
  return operationLabel.value + ' · ' + fmtDateTime(entry.value.created_at);
});

// ---------------------------------------------------------------------------
// Payloads — renderizados SÓ se o registro os trouxer; nunca fabricados.
// ---------------------------------------------------------------------------
function pick(obj, keys) {
  for (const k of keys) {
    if (obj && obj[k] !== undefined && obj[k] !== null) return obj[k];
  }
  return undefined;
}
function toJson(value) {
  if (value === undefined || value === null) return '';
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return '';
    try {
      return JSON.stringify(JSON.parse(trimmed), null, 2);
    } catch {
      return value; // não é JSON — mostra como veio (texto já redigido)
    }
  }
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

const requestRaw = computed(() =>
  pick(entry.value, ['request_payload', 'request', 'request_body', 'payload_request']),
);
const responseRaw = computed(() =>
  pick(entry.value, ['response_payload', 'response', 'response_body', 'payload_response']),
);
const requestJson = computed(() => toJson(requestRaw.value));
const responseJson = computed(() => toJson(responseRaw.value));
const hasRequestPayload = computed(() => requestJson.value.length > 0);
const hasResponsePayload = computed(() => responseJson.value.length > 0);

// Recolher payloads longos (limite por número de linhas).
const LONG_LINES = 18;
const requestLong = computed(() => requestJson.value.split('\n').length > LONG_LINES);
const responseLong = computed(() => responseJson.value.split('\n').length > LONG_LINES);
const reqCollapsed = ref(true);
const resCollapsed = ref(true);

// ---------------------------------------------------------------------------
// Modal de JSON em tela cheia
// ---------------------------------------------------------------------------
const fullOpen = ref(false);
const fullKind = ref('request');
const fullTitle = computed(() =>
  fullKind.value === 'request' ? 'Payload da requisição' : 'Payload da resposta',
);
const fullJson = computed(() =>
  fullKind.value === 'request' ? requestJson.value : responseJson.value,
);
function openFull(kind) {
  fullKind.value = kind;
  fullOpen.value = true;
}

async function copyJson(kind) {
  const text = kind === 'request' ? requestJson.value : responseJson.value;
  if (!text) {
    toast.warning('Nada para copiar.');
    return;
  }
  try {
    if (navigator && navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
      toast.success('JSON copiado para a área de transferência.');
    } else {
      toast.warning('Cópia não suportada neste navegador.');
    }
  } catch {
    toast.error('Não foi possível copiar o JSON.');
  }
}

// ---------------------------------------------------------------------------
// Tempo (puro)
// ---------------------------------------------------------------------------
function relativeTime(value) {
  if (!value) return '—';
  const then = new Date(value).getTime();
  if (!then || isNaN(then)) return '—';
  const diff = Math.round((Date.now() - then) / 1000);
  const abs = Math.abs(diff);
  if (abs < 45) return 'agora mesmo';
  const units = [
    [60, 'min', 60],
    [3600, 'h', 3600],
    [86400, 'd', 86400],
    [2592000, 'sem', 604800],
    [Infinity, 'mês', 2592000],
  ];
  for (const [limit, label, div] of units) {
    if (abs < limit) {
      const nn = Math.max(1, Math.round(abs / div));
      return nn + ' ' + label + ' atrás';
    }
  }
  return '—';
}
function absoluteTime(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (isNaN(d.getTime())) return String(value);
  try {
    return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium', timeStyle: 'medium' }).format(d);
  } catch {
    return d.toISOString();
  }
}

onMounted(loadEntry);
</script>

<style scoped>
/* ---- RedactedNotice (banner) ---- */
.ad-redacted {
  display: flex;
  gap: var(--ui-space-4);
  align-items: center;
  padding: var(--ui-space-4);
  border-radius: var(--ui-radius-md);
  border: 1px solid rgb(var(--ui-accent) / 0.35);
  background: rgb(var(--ui-accent) / 0.08);
}
.ad-redacted-icon {
  font-size: 1.3rem;
  line-height: 1;
  flex-shrink: 0;
}
.ad-redacted-body {
  min-width: 0;
  flex: 1 1 auto;
}
.ad-redacted-title {
  margin: 0;
  font-weight: 700;
  color: rgb(var(--ui-accent-strong));
}
.ad-redacted-text {
  margin: 4px 0 0;
  font-size: var(--ui-text-sm);
}
.ad-redacted-chip {
  padding: 1px 6px;
  border-radius: var(--ui-radius-sm);
  background: rgb(var(--ui-accent) / 0.16);
  color: rgb(var(--ui-accent-strong));
  font-size: var(--ui-text-xs);
}
.ad-redacted-tag {
  flex-shrink: 0;
  align-self: flex-start;
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: rgb(var(--ui-accent-strong));
  background: rgb(var(--ui-accent) / 0.16);
  border: 1px solid rgb(var(--ui-accent) / 0.4);
  border-radius: var(--ui-radius-pill);
  padding: 3px 10px;
}

/* ---- Estado vazio: ações ---- */
.ad-empty-actions {
  display: flex;
  gap: var(--ui-space-2);
  flex-wrap: wrap;
  justify-content: center;
}

/* ---- Hero / DetailHeader + OutcomeBadge ---- */
.ad-hero {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ui-space-5);
  flex-wrap: wrap;
}
.ad-hero-main {
  display: flex;
  align-items: center;
  gap: var(--ui-space-4);
  min-width: 0;
}
.ad-hero-glyph {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 1.5rem;
  font-weight: 700;
  flex-shrink: 0;
  background: rgb(var(--ui-muted) / 0.16);
  color: rgb(var(--ui-muted));
}
.ad-hero[data-outcome='success'] .ad-hero-glyph {
  background: rgb(var(--ui-ok) / 0.16);
  color: rgb(var(--ui-ok));
}
.ad-hero[data-outcome='failure'] .ad-hero-glyph {
  background: rgb(var(--ui-danger) / 0.16);
  color: rgb(var(--ui-danger));
}
.ad-hero-titles {
  min-width: 0;
}
.ad-hero-row {
  display: flex;
  align-items: center;
  gap: var(--ui-space-3);
  flex-wrap: wrap;
}
.ad-hero-op {
  font-family: var(--ui-font-display);
  font-weight: 700;
  font-size: var(--ui-text-xl);
}
.ad-hero-meta {
  margin: 6px 0 0;
  font-size: var(--ui-text-sm);
  max-width: 64ch;
}
.ad-hero-facts {
  display: flex;
  gap: var(--ui-space-5);
  margin: 0;
  flex-wrap: wrap;
}
.ad-fact dt {
  font-size: var(--ui-text-xs);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: rgb(var(--ui-muted));
  font-weight: 700;
}
.ad-fact dd {
  margin: 4px 0 0;
  font-size: var(--ui-text-sm);
}

/* ---- código HTTP colorido por família ---- */
.ad-http {
  display: inline-flex;
  align-items: center;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}
.ad-http[data-class='ok'] { color: rgb(var(--ui-ok)); }
.ad-http[data-class='redirect'] { color: rgb(var(--ui-muted)); }
.ad-http[data-class='client'],
.ad-http[data-class='server'] { color: rgb(var(--ui-danger)); }

/* ---- Métricas ---- */
.ad-metrics {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: var(--ui-space-4);
}

/* ---- ErrorCallout ---- */
.ad-callout {
  display: flex;
  gap: var(--ui-space-4);
  align-items: flex-start;
  padding: var(--ui-space-4);
  border-radius: var(--ui-radius-md);
  border: 1px solid rgb(var(--ui-danger) / 0.35);
  background: rgb(var(--ui-danger) / 0.07);
}
.ad-callout-icon {
  font-size: 1.4rem;
  color: rgb(var(--ui-danger));
  line-height: 1;
  flex-shrink: 0;
}
.ad-callout-body {
  min-width: 0;
  flex: 1 1 auto;
}
.ad-callout-title {
  margin: 0;
  font-weight: 700;
  color: rgb(var(--ui-danger));
}
.ad-callout-msg {
  margin: 8px 0 0;
  font-size: var(--ui-text-sm);
  white-space: pre-wrap;
  word-break: break-word;
  background: rgb(var(--ui-bg));
  border: 1px solid rgb(var(--ui-border));
  border-radius: var(--ui-radius-sm);
  padding: var(--ui-space-3);
}
.ad-callout-hint {
  margin: 8px 0 0;
  font-size: var(--ui-text-xs);
}

/* ---- Grid: contexto + resumo ---- */
.ad-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: var(--ui-space-4);
  align-items: start;
}

/* ---- Contexto dt/dd ---- */
.ad-kv {
  display: grid;
  gap: var(--ui-space-3);
  margin: 0;
}
.ad-kv-row {
  display: grid;
  grid-template-columns: 150px 1fr;
  gap: var(--ui-space-3);
  align-items: baseline;
  padding-bottom: var(--ui-space-3);
  border-bottom: 1px solid rgb(var(--ui-border));
}
.ad-kv-row:last-child {
  padding-bottom: 0;
  border-bottom: none;
}
.ad-kv dt {
  color: rgb(var(--ui-muted));
  font-size: var(--ui-text-sm);
}
.ad-kv dd {
  margin: 0;
  word-break: break-word;
}
.ad-link {
  font-weight: 600;
}
.ad-link:hover {
  text-decoration: underline;
}
.ad-rel {
  margin-left: 6px;
  font-size: var(--ui-text-xs);
}

/* ---- Resumo da chamada ---- */
.ad-summary {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: var(--ui-space-3);
}
.ad-summary-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ui-space-3);
  padding-bottom: var(--ui-space-3);
  border-bottom: 1px solid rgb(var(--ui-border));
}
.ad-summary-item:last-child {
  padding-bottom: 0;
  border-bottom: none;
}
.ad-summary-key {
  color: rgb(var(--ui-muted));
  font-size: var(--ui-text-sm);
}
.ad-summary-val {
  text-align: right;
  font-weight: 600;
}
.ad-summary-dur[data-tone='warning'] { color: rgb(var(--ui-warn)); }
.ad-summary-dur[data-tone='error'] { color: rgb(var(--ui-danger)); }
.ad-retry-tag {
  margin-left: 6px;
  font-size: 9px;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: rgb(var(--ui-warn));
  background: rgb(var(--ui-warn) / 0.16);
  border-radius: var(--ui-radius-sm);
  padding: 1px 5px;
}
.ad-summary-foot {
  margin: var(--ui-space-4) 0 0;
  font-size: var(--ui-text-sm);
}

/* ---- JsonViewer ---- */
.ad-json-wrap {
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-2);
}
.ad-json {
  margin: 0;
  padding: var(--ui-space-4);
  background: rgb(var(--ui-bg));
  border: 1px solid rgb(var(--ui-border));
  border-radius: var(--ui-radius-md);
  font-size: var(--ui-text-sm);
  line-height: 1.55;
  white-space: pre-wrap;
  word-break: break-word;
  overflow-x: auto;
  max-height: 460px;
  color: rgb(var(--ui-fg));
}
.ad-json[data-collapsed='true'] {
  max-height: 240px;
  overflow: hidden;
}
.ad-json-full {
  max-height: 64vh;
}
.ad-modal-note {
  margin: 0 0 var(--ui-space-3);
  font-size: var(--ui-text-sm);
}

/* ---- Atalhos de domínio ---- */
.ad-links {
  display: flex;
  flex-wrap: wrap;
  gap: var(--ui-space-3);
}

/* ---- Responsivo ---- */
@media (max-width: 860px) {
  .ad-grid { grid-template-columns: 1fr; }
  .ad-metrics { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .ad-hero { align-items: flex-start; }
  .ad-hero-facts { gap: var(--ui-space-4); }
}
@media (max-width: 560px) {
  .ad-metrics { grid-template-columns: 1fr; }
  .ad-kv-row { grid-template-columns: 1fr; gap: 2px; }
}
</style>
