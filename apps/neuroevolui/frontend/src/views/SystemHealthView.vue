<!--
  Saúde do sistema — painel operacional leve (REQ-NEUROEVOLUI-0001, REQ-NEUROEVOLUI-0008).
  Observabilidade read-only: status da API + DB, filas (Redis/BullMQ — motor dos jobs assíncronos
  e da IA), e atalho para a documentação OpenAPI. Endpoints REAIS apenas:
    • GET /health            → { status, db }                        (health())
    • GET /v1/health/queue   → { status, queue:{ redis, waiting, … } } (queue.list() — contadores
                               ANINHADOS sob `queue`; desembrulhamos no loadQueue, igual JobsMonitorView)
    • GET /me                → identidade/RBAC (gate clinic_manager+; 401/403 ⇒ acesso negado)
  Restrita a gestor da clínica (clinic_manager) ou superior: 401/403 em /me ou nas leituras de
  saúde renderizam um estado de "acesso restrito" claro (espelha JobsMonitorView).
  Documentação: navega para a rota interna /api-docs (ReDoc embutido na casca), não abre o /docs cru.
  Links de domínio apontam para /assistant (rotas reais da clínica).
-->
<template>
  <UiPageLayout
    eyebrow="Observabilidade"
    title="Saúde do sistema"
    subtitle="Status da API, banco de dados e filas em tempo quase real. Painel operacional somente leitura."
    width="wide"
  >
    <template #actions>
      <UiButton variant="subtle" :loading="checking" @click="refreshAll">Atualizar agora</UiButton>
      <UiButton variant="ghost" to="/api-docs">Documentação da API</UiButton>
    </template>

    <template #banner>
      <div v-if="!accessDenied" class="sh-banner" :data-tone="overallTone" role="status" aria-live="polite">
        <span class="sh-banner-dot" aria-hidden="true" />
        <div class="sh-banner-text">
          <strong>{{ overallTitle }}</strong>
          <span class="sh-banner-sub">{{ overallSubtitle }}</span>
        </div>
        <UiStatusBadge :tone="overallTone" :label="overallBadge" size="lg" />
      </div>
    </template>

    <!-- ============ ACESSO RESTRITO (clinic_manager+) ============ -->
    <UiCard v-if="accessDenied" title="Acesso restrito">
      <UiEmptyState
        icon="lock"
        title="Esta tela é para gestores"
        description="A saúde do sistema exige perfil de gestor da clínica (clinic_manager) ou superior. Fale com um administrador para liberar o acesso."
      >
        <template #action>
          <UiButton variant="subtle" to="/">Voltar ao painel</UiButton>
        </template>
      </UiEmptyState>
    </UiCard>

    <!-- Linha de métricas-resumo (sempre visível; cada uma com seu próprio estado) -->
    <section v-else class="sh-metrics" aria-label="Indicadores de saúde">
      <UiMetricCard
        label="API"
        :value="apiCard.value"
        :hint="apiCard.hint"
        :tone="apiCard.tone"
        :loading="apiLoading"
      />
      <UiMetricCard
        label="Banco de dados"
        :value="dbCard.value"
        :hint="dbCard.hint"
        :tone="dbCard.tone"
        :loading="apiLoading"
      />
      <UiMetricCard
        label="Filas (Redis)"
        :value="queueCard.value"
        :hint="queueCard.hint"
        :tone="queueCard.tone"
        :loading="queueLoading"
      />
      <UiMetricCard
        label="Jobs pendentes"
        :value="pendingCard.value"
        :hint="pendingCard.hint"
        :tone="pendingCard.tone"
        :loading="queueLoading"
        clickable
        @click="goAssistant"
      />
    </section>

    <div v-if="!accessDenied" class="sh-grid">
      <!-- API + banco de dados -->
      <UiCard title="API & banco de dados" subtitle="Endpoint /health — verifica o processo e a conexão com o Postgres.">
        <template #actions>
          <UiButton variant="ghost" size="sm" :loading="apiLoading" @click="loadApi">Verificar</UiButton>
        </template>

        <UiLoadingState v-if="apiLoading && !apiData" variant="skeleton" :skeleton-lines="3" />

        <UiErrorState
          v-else-if="apiError"
          :message="apiError"
          code="GET /health"
          @retry="loadApi"
        />

        <dl v-else-if="apiData" class="sh-dl">
          <div class="sh-row">
            <dt>Processo da API</dt>
            <dd><UiStatusBadge :tone="apiCard.tone" :label="apiCard.value" /></dd>
          </div>
          <div class="sh-row">
            <dt>Conexão com o banco</dt>
            <dd>
              <UiStatusBadge
                :tone="dbConnected ? 'success' : 'error'"
                :label="dbConnected ? 'Conectado' : 'Indisponível'"
              />
            </dd>
          </div>
          <div class="sh-row">
            <dt>Última verificação</dt>
            <dd class="sh-mono">{{ apiCheckedLabel }}</dd>
          </div>
        </dl>

        <UiEmptyState
          v-else
          icon="search"
          title="Sem leitura ainda"
          description="Clique em Verificar para consultar a saúde da API."
        >
          <template #action>
            <UiButton size="sm" @click="loadApi">Verificar</UiButton>
          </template>
        </UiEmptyState>
      </UiCard>

      <!-- Disponibilidade da IA / assistente -->
      <UiCard
        title="Assistente de IA"
        subtitle="A IA roda sobre as filas Redis/BullMQ. A disponibilidade segue a saúde do motor de jobs."
      >
        <template #actions>
          <UiButton variant="ghost" size="sm" to="/assistant">Abrir assistente</UiButton>
        </template>

        <UiLoadingState v-if="queueLoading && !queueData" variant="skeleton" :skeleton-lines="2" />

        <UiErrorState
          v-else-if="queueError"
          :message="queueError"
          code="GET /v1/health/queue"
          @retry="loadQueue"
        />

        <div v-else class="sh-ai">
          <div class="sh-ai-status">
            <UiStatusBadge :tone="aiCard.tone" :label="aiCard.value" size="lg" />
            <p class="sh-ai-hint">{{ aiCard.hint }}</p>
          </div>
          <UiButton variant="primary" size="sm" to="/assistant">Conversar com a IA</UiButton>
        </div>
      </UiCard>

      <!-- Filas / BullMQ — ocupa a linha inteira -->
      <UiCard
        class="sh-span"
        title="Filas de processamento"
        subtitle="Endpoint /v1/health/queue — contagem de jobs por estado no Redis/BullMQ."
      >
        <template #actions>
          <UiButton variant="ghost" size="sm" :loading="queueLoading" @click="loadQueue">Atualizar</UiButton>
        </template>

        <UiLoadingState v-if="queueLoading && !queueData" variant="skeleton" :skeleton-lines="4" />

        <UiErrorState
          v-else-if="queueError"
          :message="queueError"
          code="GET /v1/health/queue"
          @retry="loadQueue"
        />

        <UiEmptyState
          v-else-if="!redisOnline"
          icon="clock"
          title="Filas em modo inline"
          description="O Redis não está conectado: os jobs rodam de forma síncrona (inline). Não há fila para inspecionar."
        >
          <template #action>
            <UiButton size="sm" variant="ghost" :loading="queueLoading" @click="loadQueue">Verificar de novo</UiButton>
          </template>
        </UiEmptyState>

        <div v-else class="sh-queue">
          <article v-for="s in queueStates" :key="s.key" class="sh-qcell" :data-tone="s.tone">
            <span class="sh-qcount">{{ s.count }}</span>
            <span class="sh-qlabel">{{ s.label }}</span>
          </article>
        </div>
      </UiCard>
    </div>

    <template #footer>
      <span>Atualização automática a cada 15s · Última sincronização: {{ lastSyncLabel }}</span>
    </template>
  </UiPageLayout>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue';
import { useRouter } from 'vue-router';
import {
  UiPageLayout, UiCard, UiMetricCard, UiStatusBadge, UiButton,
  UiLoadingState, UiErrorState, UiEmptyState, useToast,
} from '../ui/index.js';
import { health, me, resourceFactory } from '../api.js';

// Recurso REST para a fila (api.js: resourceFactory(name) → GET /v1/<name>).
// 'health/queue' resolve para o endpoint REAL GET /v1/health/queue.
const queueResource = resourceFactory('health/queue');

const router = useRouter();
const toast = useToast();

// Documentação OpenAPI: navegamos para a rota interna /api-docs (ApiDocsView), que embute
// o ReDoc dentro da casca do app e já oferece o /docs cru da API como fallback honesto.
// (Antes abríamos o /docs cru em nova aba, saindo da navegação do app — incoerente com
// "painel operacional leve" integrado.)

// ---- Estado: API / banco ----
const apiData = ref(null);
const apiError = ref('');
const apiLoading = ref(false);
const apiCheckedAt = ref(null);

// ---- Estado: filas ----
const queueData = ref(null);
const queueError = ref('');
const queueLoading = ref(false);

const lastSync = ref(null);

// ---- Estado: acesso (RBAC clinic_manager+) ----
// A tela é restrita a gestor da clínica ou superior (gate no backend). Aqui tratamos
// 401/403 — tanto do /me quanto das leituras de saúde — como "sem acesso", de forma
// graciosa, espelhando JobsMonitorView.
const meError = ref(null);
const apiErrorObj = ref(null);
const queueErrorObj = ref(null);

const isDenied = (e) => {
  const s = e && e.status;
  return s === 401 || s === 403;
};
const accessDenied = computed(
  () => isDenied(meError.value) || isDenied(apiErrorObj.value) || isDenied(queueErrorObj.value)
);

const formatTime = (d) => {
  if (!d) return '—';
  try { return new Date(d).toLocaleTimeString('pt-BR'); } catch { return '—'; }
};

async function loadApi() {
  apiLoading.value = true;
  apiError.value = '';
  apiErrorObj.value = null;
  try {
    apiData.value = await health();
    apiCheckedAt.value = Date.now();
  } catch (e) {
    apiErrorObj.value = e;
    if (!isDenied(e)) {
      apiData.value = null;
      apiError.value = (e && e.message) || 'Falha ao consultar /health';
    }
  } finally {
    apiLoading.value = false;
    lastSync.value = Date.now();
  }
}

async function loadQueue() {
  queueLoading.value = true;
  queueError.value = '';
  queueErrorObj.value = null;
  try {
    // /v1/health/queue → { status, queue: { redis, waiting, active, completed, failed, delayed } }.
    // resourceFactory.list pode embrulhar em { data }; os contadores ficam ANINHADOS sob `queue`.
    // Desembrulhamos os dois níveis (igual a JobsMonitorView) para expor redis/waiting/... na raiz.
    const res = await queueResource.list();
    const r = (res && res.data !== undefined && !Array.isArray(res.data)) ? res.data : res;
    queueData.value = (r && r.queue) || r || null;
  } catch (e) {
    queueErrorObj.value = e;
    if (!isDenied(e)) {
      queueData.value = null;
      queueError.value = (e && e.message) || 'Falha ao consultar /v1/health/queue';
    }
  } finally {
    queueLoading.value = false;
    lastSync.value = Date.now();
  }
}

async function loadMe() {
  meError.value = null;
  try {
    await me();
  } catch (e) {
    meError.value = e;
  }
}

async function refreshAll() {
  await Promise.all([loadApi(), loadQueue()]);
  if (!accessDenied.value) toast.success('Saúde atualizada.');
}

// ---- Derivações: API ----
const apiOk = computed(() => !!apiData.value && (apiData.value.status === 'ok' || apiData.value.status === undefined) && !apiError.value);
const dbConnected = computed(() => !!apiData.value && (apiData.value.db === 'connected' || apiData.value.db === true));

const apiCard = computed(() => {
  if (apiError.value) return { value: 'Fora do ar', hint: 'Não respondeu', tone: 'error' };
  if (!apiData.value) return { value: '—', hint: 'Aguardando', tone: 'neutral' };
  return apiOk.value
    ? { value: 'Operacional', hint: 'Respondendo normalmente', tone: 'success' }
    : { value: 'Degradada', hint: 'Resposta inesperada', tone: 'warning' };
});

const dbCard = computed(() => {
  if (apiError.value) return { value: 'Desconhecido', hint: 'API fora do ar', tone: 'error' };
  if (!apiData.value) return { value: '—', hint: 'Aguardando', tone: 'neutral' };
  return dbConnected.value
    ? { value: 'Conectado', hint: 'Postgres acessível', tone: 'success' }
    : { value: 'Indisponível', hint: 'Sem conexão', tone: 'error' };
});

const apiCheckedLabel = computed(() => formatTime(apiCheckedAt.value));

// ---- Derivações: filas ----
const redisOnline = computed(() => !!queueData.value && queueData.value.redis === true);

const QUEUE_DEFS = [
  { key: 'waiting',   label: 'Aguardando', tone: 'warning' },
  { key: 'active',    label: 'Ativos',     tone: 'running' },
  { key: 'completed', label: 'Concluídos', tone: 'success' },
  { key: 'failed',    label: 'Falhos',     tone: 'error' },
  { key: 'delayed',   label: 'Adiados',    tone: 'neutral' },
];

const queueStates = computed(() => {
  const q = queueData.value || {};
  return QUEUE_DEFS.map((d) => ({ ...d, count: Number(q[d.key] || 0) }));
});

const pendingCount = computed(() => {
  const q = queueData.value || {};
  return Number(q.waiting || 0) + Number(q.active || 0) + Number(q.delayed || 0);
});
const failedCount = computed(() => Number((queueData.value || {}).failed || 0));

const queueCard = computed(() => {
  if (queueError.value) return { value: 'Erro', hint: 'Não respondeu', tone: 'error' };
  if (!queueData.value) return { value: '—', hint: 'Aguardando', tone: 'neutral' };
  return redisOnline.value
    ? { value: 'Conectado', hint: 'Redis/BullMQ ativo', tone: 'success' }
    : { value: 'Inline', hint: 'Sem Redis — modo síncrono', tone: 'warning' };
});

const pendingCard = computed(() => {
  // Card clicável → /assistant. O hint sempre sinaliza a ação (descoberta não-acidental).
  if (queueError.value || !queueData.value) return { value: '—', hint: 'Aguardando · clique para abrir o assistente', tone: 'neutral' };
  if (!redisOnline.value) return { value: '0', hint: 'Modo inline · clique para abrir o assistente', tone: 'neutral' };
  if (failedCount.value > 0) return { value: String(pendingCount.value), hint: failedCount.value + ' falho(s) · clique para abrir o assistente', tone: 'warning' };
  return { value: String(pendingCount.value), hint: 'Na fila + ativos · clique para abrir o assistente', tone: pendingCount.value > 0 ? 'running' : 'success' };
});

const aiCard = computed(() => {
  if (queueError.value) return { value: 'Indeterminado', hint: 'Não foi possível ler o motor de jobs.', tone: 'error' };
  if (!queueData.value) return { value: 'Verificando…', hint: 'Consultando a fila de processamento.', tone: 'neutral' };
  if (!redisOnline.value) return { value: 'Modo síncrono', hint: 'A IA responde inline (sem fila). Disponível, sem processamento em background.', tone: 'warning' };
  if (failedCount.value > 0) return { value: 'Atenção', hint: failedCount.value + ' job(s) de IA falhou(aram). Verifique a fila abaixo.', tone: 'warning' };
  return { value: 'Disponível', hint: 'Motor de IA pronto — jobs processados via fila.', tone: 'success' };
});

// ---- Visão geral (banner) ----
const overallTone = computed(() => {
  if (apiError.value || queueError.value || !dbConnected.value) return apiError.value || !dbConnected.value ? 'error' : 'warning';
  if (!apiData.value || !queueData.value) return 'neutral';
  if (failedCount.value > 0 || !redisOnline.value || !apiOk.value) return 'warning';
  return 'success';
});
const overallTitle = computed(() => {
  if (overallTone.value === 'success') return 'Tudo operacional';
  if (overallTone.value === 'error') return 'Há um problema crítico';
  if (overallTone.value === 'warning') return 'Operacional com ressalvas';
  return 'Coletando estado do sistema';
});
const overallSubtitle = computed(() => {
  if (overallTone.value === 'success') return 'API, banco e filas respondendo dentro do esperado.';
  if (overallTone.value === 'error') return 'Verifique a API e a conexão com o banco abaixo.';
  if (overallTone.value === 'warning') return 'Funcional, mas alguns indicadores pedem atenção.';
  return 'Sincronizando indicadores de saúde…';
});
const overallBadge = computed(() => ({
  success: 'Saudável', warning: 'Atenção', error: 'Crítico', neutral: 'Verificando',
}[overallTone.value]));

const checking = computed(() => apiLoading.value || queueLoading.value);
const lastSyncLabel = computed(() => formatTime(lastSync.value));

const goAssistant = () => router.push('/assistant');

// ---- Polling (auto-refresh) ----
let timer = null;
onMounted(async () => {
  await Promise.all([loadMe(), refreshAll()]);
  timer = setInterval(() => {
    if (accessDenied.value) return; // sem acesso: não fica martelando o backend
    loadApi();
    loadQueue();
  }, 15000);
});
onBeforeUnmount(() => { if (timer) clearInterval(timer); });
</script>

<style scoped>
.sh-banner {
  display: flex; align-items: center; gap: var(--ui-space-4);
  padding: var(--ui-space-4) var(--ui-space-5);
  border: 1px solid rgb(var(--ui-border));
  border-left: 4px solid rgb(var(--ui-faint));
  border-radius: var(--ui-radius-lg);
  background: rgb(var(--ui-surface));
  box-shadow: var(--ui-shadow-sm);
}
.sh-banner[data-tone="success"] { border-left-color: rgb(var(--ui-ok)); }
.sh-banner[data-tone="warning"] { border-left-color: rgb(var(--ui-warn)); }
.sh-banner[data-tone="error"]   { border-left-color: rgb(var(--ui-danger)); }
.sh-banner[data-tone="neutral"] { border-left-color: rgb(var(--ui-muted)); }
/* Tamanho bespoke local do ponto de status (fora da escala de tokens). */
.sh-banner { --sh-dot-size: var(--ui-space-2); }
.sh-banner-dot { width: var(--sh-dot-size); height: var(--sh-dot-size); border-radius: 50%; background: rgb(var(--ui-muted)); flex-shrink: 0; }
.sh-banner[data-tone="success"] .sh-banner-dot { background: rgb(var(--ui-ok)); }
.sh-banner[data-tone="warning"] .sh-banner-dot { background: rgb(var(--ui-warn)); }
.sh-banner[data-tone="error"]   .sh-banner-dot { background: rgb(var(--ui-danger)); }
.sh-banner-text { display: flex; flex-direction: column; gap: var(--ui-space-1); flex: 1; min-width: 0; }
.sh-banner-text strong { font-family: var(--ui-font-display); font-size: var(--ui-text-lg); }
.sh-banner-sub { color: rgb(var(--ui-muted)); font-size: var(--ui-text-sm); }

.sh-metrics { display: grid; grid-template-columns: repeat(4, 1fr); gap: var(--ui-space-4); }

.sh-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: var(--ui-space-4); }
.sh-span { grid-column: 1 / -1; }

.sh-dl { margin: 0; display: flex; flex-direction: column; gap: var(--ui-space-3); }
.sh-row { display: flex; align-items: center; justify-content: space-between; gap: var(--ui-space-4); }
.sh-row dt { color: rgb(var(--ui-muted)); font-size: var(--ui-text-sm); margin: 0; }
.sh-row dd { margin: 0; }
.sh-mono { font-family: var(--ui-font-mono, monospace); font-size: var(--ui-text-sm); color: rgb(var(--ui-fg)); }

.sh-ai { display: flex; align-items: center; justify-content: space-between; gap: var(--ui-space-4); flex-wrap: wrap; }
.sh-ai-status { display: flex; flex-direction: column; gap: var(--ui-space-2); min-width: 0; }
.sh-ai-hint { margin: 0; color: rgb(var(--ui-muted)); font-size: var(--ui-text-sm); max-width: 52ch; }

/* `--sh-qcount-size` espelha o `.ui-metric-value` do kit (mesmo número grande). */
.sh-queue { display: grid; grid-template-columns: repeat(5, 1fr); gap: var(--ui-space-3); --sh-qcount-size: 1.7rem; }
.sh-qcell {
  display: flex; flex-direction: column; align-items: center; gap: var(--ui-space-1);
  padding: var(--ui-space-4) var(--ui-space-3);
  border: 1px solid rgb(var(--ui-border));
  border-top: 3px solid rgb(var(--ui-faint));
  border-radius: var(--ui-radius-md);
  background: rgb(var(--ui-surface-2));
  text-align: center;
}
.sh-qcell[data-tone="success"] { border-top-color: rgb(var(--ui-ok)); }
.sh-qcell[data-tone="warning"] { border-top-color: rgb(var(--ui-warn)); }
.sh-qcell[data-tone="error"]   { border-top-color: rgb(var(--ui-danger)); }
.sh-qcell[data-tone="running"] { border-top-color: rgb(var(--ui-accent)); }
.sh-qcell[data-tone="neutral"] { border-top-color: rgb(var(--ui-muted)); }
.sh-qcount { font-family: var(--ui-font-display); font-size: var(--sh-qcount-size); font-weight: 700; line-height: 1; }
.sh-qlabel { color: rgb(var(--ui-muted)); font-size: var(--ui-text-xs); }

@media (max-width: 860px) {
  .sh-metrics { grid-template-columns: repeat(2, 1fr); }
  .sh-grid { grid-template-columns: 1fr; }
  .sh-queue { grid-template-columns: repeat(2, 1fr); }
  .sh-banner { flex-wrap: wrap; }
}
</style>
