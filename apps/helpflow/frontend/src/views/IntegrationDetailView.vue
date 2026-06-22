<template>
  <UiPageLayout
    eyebrow="Integrações & Gateway"
    :title="pageTitle"
    subtitle="Parâmetros do gateway, teste de conectividade (ping) e trilha de auditoria das chamadas — com segredos redigidos no servidor."
    width="wide"
    :loading="initialLoading"
    loading-message="Carregando a integração…"
    :error="integrationError"
    @retry="reload"
  >
    <!-- ===================== Ações do cabeçalho ===================== -->
    <template #actions>
      <UiButton variant="ghost" to="/integrations">Voltar às integrações</UiButton>
      <UiButton
        variant="subtle"
        :loading="refreshing"
        :disabled="!integration || initialLoading"
        @click="reload"
      >Atualizar</UiButton>
      <UiButton
        v-if="integration"
        variant="ghost"
        :to="'/integrations/' + integration.id + '/edit'"
      >Editar</UiButton>
      <UiButton
        v-if="integration"
        variant="primary"
        :loading="testing"
        @click="runTest"
      >Testar conexão</UiButton>
    </template>

    <!-- ===================== ESTADO NORMAL ===================== -->
    <template v-if="integration">
      <!-- EntityHeader -->
      <UiCard padded>
        <div class="hf-head">
          <span class="hf-mark" :data-tone="statusTone" aria-hidden="true">{{ kindGlyph }}</span>
          <div class="hf-head-id">
            <div class="hf-head-row">
              <h2 class="hf-head-name">{{ displayName }}</h2>
              <UiStatusBadge :status="integration.status" :tone="statusTone" :label="statusText" size="lg" />
              <UiStatusBadge :status="integration.kind" tone="running" :label="kindLabel" />
            </div>
            <p class="hf-head-url">
              <span class="hf-head-url-ic" aria-hidden="true">{{ GLYPH_LINK }}</span>
              <a
                v-if="integration.base_url"
                :href="integration.base_url"
                target="_blank"
                rel="noopener noreferrer"
                class="hf-mono hf-head-url-a"
              >{{ integration.base_url }}</a>
              <span v-else class="hf-dash">Sem URL base configurada</span>
            </p>
            <p class="hf-head-meta">
              <span class="hf-chip">ID <span class="hf-mono">{{ integration.id }}</span></span>
              <span class="hf-chip">Timeout {{ timeoutText }}</span>
              <span class="hf-chip">{{ retriesText }}</span>
              <span class="hf-chip">Última verificação: {{ lastCheckText }}</span>
            </p>
          </div>
        </div>
      </UiCard>

      <!-- Métricas -->
      <section class="hf-metrics" aria-label="Indicadores da integração">
        <UiMetricCard
          label="Situação"
          :value="statusText"
          :tone="statusMetricTone"
          hint="Saúde atual do gateway"
        />
        <UiMetricCard
          label="Último ping"
          :value="lastPingText"
          :tone="lastPingTone"
          :hint="lastPingHint"
        />
        <UiMetricCard
          label="Chamadas auditadas"
          :value="auditCountText"
          :loading="auditLoading"
          tone="primary"
          hint="Registros na trilha"
        />
        <UiMetricCard
          label="Falhas recentes"
          :value="auditFailuresText"
          :loading="auditLoading"
          :tone="auditFailures > 0 ? 'warning' : 'success'"
          hint="Chamadas com erro na trilha"
        />
      </section>

      <div class="hf-grid">
        <!-- Coluna principal -->
        <div class="hf-col-main">
          <!-- TestConnectionButton (painel de resultado) -->
          <UiCard
            title="Teste de conectividade"
            subtitle="Dispara um ping pelo gateway e mostra o resultado redigido."
          >
            <template #actions>
              <UiButton size="sm" variant="primary" :loading="testing" @click="runTest">
                {{ testing ? 'Testando…' : 'Disparar ping' }}
              </UiButton>
            </template>

            <UiLoadingState v-if="testing && !lastTest" variant="spinner" title="Pingando o gateway…" />

            <UiErrorState
              v-else-if="testError && !lastTest"
              :message="testError"
              :retryable="true"
              @retry="runTest"
            >
              <template #action>
                <UiButton size="sm" variant="ghost" to="/integrations">Ver integrações</UiButton>
              </template>
            </UiErrorState>

            <UiEmptyState
              v-else-if="!lastTest"
              compact
              icon="link"
              title="Conectividade ainda não testada"
              description="Clique em “Disparar ping” para verificar se o gateway responde. O resultado aparece aqui com os segredos redigidos."
            >
              <template #action>
                <UiButton size="sm" variant="primary" :loading="testing" @click="runTest">Disparar ping</UiButton>
              </template>
            </UiEmptyState>

            <div v-else class="hf-test">
              <div class="hf-test-summary">
                <span class="hf-test-dot" :data-tone="lastTestTone" aria-hidden="true" />
                <div class="hf-test-headline">
                  <p class="hf-test-verdict" :data-tone="lastTestTone">{{ lastTestVerdict }}</p>
                  <p class="hf-test-when">{{ lastTestWhen }}</p>
                </div>
                <UiStatusBadge :status="lastTestStatusWord" :tone="lastTestTone" :label="lastTestStatusLabel" />
              </div>

              <dl class="hf-kv">
                <div class="hf-kv-row">
                  <dt>Código HTTP</dt>
                  <dd class="hf-mono">{{ lastTestHttp }}</dd>
                </div>
                <div class="hf-kv-row">
                  <dt>Latência</dt>
                  <dd>{{ lastTestLatency }}</dd>
                </div>
                <div class="hf-kv-row">
                  <dt>Endpoint</dt>
                  <dd class="hf-mono hf-ellipsis" :title="lastTestTarget">{{ lastTestTarget }}</dd>
                </div>
                <div v-if="lastTestMessage" class="hf-kv-row">
                  <dt>Mensagem</dt>
                  <dd>{{ lastTestMessage }}</dd>
                </div>
                <div v-if="lastTestRedacted" class="hf-kv-row">
                  <dt>Redação</dt>
                  <dd class="hf-redact">{{ GLYPH_LOCK }} segredos redigidos no servidor</dd>
                </div>
              </dl>

              <div class="hf-test-actions">
                <UiButton size="sm" variant="subtle" @click="openTestDetail">Ver resposta completa</UiButton>
                <UiButton size="sm" variant="ghost" :loading="testing" @click="runTest">Testar de novo</UiButton>
              </div>
            </div>
          </UiCard>

          <!-- AuditTrailList -->
          <UiCard
            title="Trilha de auditoria"
            subtitle="Chamadas registradas pelo gateway. Cabeçalhos e payloads sensíveis aparecem redigidos."
          >
            <template #actions>
              <UiButton size="sm" variant="ghost" :loading="auditLoading" @click="loadAudit">Recarregar</UiButton>
            </template>

            <UiDataTable
              :columns="auditColumns"
              :rows="auditRows"
              :loading="auditLoading"
              :error="auditError"
              row-key="__key"
              density="compact"
              clickable-rows
              paginated
              :page="auditPage"
              :page-size="auditPageSize"
              :total="auditTotal"
              :page-size-options="[10, 25, 50]"
              :empty="auditEmpty"
              @row-click="openAuditDetail"
              @retry="loadAudit"
              @update:page="onAuditPage"
              @update:page-size="onAuditPageSize"
            >
              <template #cell-method="{ row }">
                <span class="hf-method" :data-method="methodOf(row)">{{ methodOf(row) }}</span>
              </template>

              <template #cell-path="{ row }">
                <span class="hf-path">
                  <span class="hf-path-main hf-mono hf-ellipsis" :title="pathOf(row)">{{ pathOf(row) }}</span>
                  <span v-if="redactedNote(row)" class="hf-path-note">{{ GLYPH_LOCK }} {{ redactedNote(row) }}</span>
                </span>
              </template>

              <template #cell-status="{ row }">
                <UiStatusBadge
                  :status="auditStatusWord(row)"
                  :tone="auditStatusTone(row)"
                  :label="auditStatusLabel(row)"
                  size="sm"
                />
              </template>

              <template #cell-latency="{ row }">
                <span class="hf-num">{{ latencyText(latencyOf(row)) }}</span>
              </template>

              <template #cell-at="{ row }">
                <span class="hf-time">{{ whenText(row) }}</span>
              </template>

              <template #empty-action>
                <UiButton size="sm" variant="primary" :loading="testing" @click="runTest">Gerar uma chamada de teste</UiButton>
              </template>
            </UiDataTable>
          </UiCard>
        </div>

        <!-- Coluna lateral -->
        <aside class="hf-col-side" aria-label="Propriedades e segurança da integração">
          <!-- PropertiesGrid -->
          <UiCard title="Propriedades">
            <dl class="hf-dl">
              <div class="hf-dl-row">
                <dt>Nome</dt>
                <dd class="hf-dd-strong">{{ integration.name || '—' }}</dd>
              </div>
              <div class="hf-dl-row">
                <dt>Tipo</dt>
                <dd><UiStatusBadge :status="integration.kind" tone="running" :label="kindLabel" /></dd>
              </div>
              <div class="hf-dl-row">
                <dt>Situação</dt>
                <dd><UiStatusBadge :status="integration.status" :tone="statusTone" :label="statusText" /></dd>
              </div>
              <div class="hf-dl-row">
                <dt>URL base</dt>
                <dd class="hf-mono hf-ellipsis" :title="integration.base_url || ''">
                  {{ integration.base_url || '—' }}
                </dd>
              </div>
              <div class="hf-dl-row">
                <dt>Timeout</dt>
                <dd>{{ timeoutText }}</dd>
              </div>
              <div class="hf-dl-row">
                <dt>Tentativas</dt>
                <dd>{{ retriesValueText }}</dd>
              </div>
              <div class="hf-dl-row">
                <dt>Última verificação</dt>
                <dd :class="{ 'hf-dash': !integration.last_check_at }">{{ lastCheckText }}</dd>
              </div>
              <div class="hf-dl-row">
                <dt>ID</dt>
                <dd class="hf-mono">{{ integration.id }}</dd>
              </div>
            </dl>
          </UiCard>

          <!-- Aviso de redação / segurança -->
          <UiCard title="Segurança da trilha">
            <ul class="hf-notes">
              <li class="hf-note">
                <span class="hf-note-ic" aria-hidden="true">{{ GLYPH_LOCK }}</span>
                <span>Tokens, chaves de API e cabeçalhos de autorização são <strong>redigidos</strong> no servidor antes de chegarem à tela.</span>
              </li>
              <li class="hf-note">
                <span class="hf-note-ic" aria-hidden="true">{{ GLYPH_LINK }}</span>
                <span>O ping é executado <strong>pelo gateway</strong>, nunca direto do navegador.</span>
              </li>
              <li class="hf-note">
                <span class="hf-note-ic" aria-hidden="true">{{ GLYPH_HISTORY }}</span>
                <span>A trilha guarda método, rota, código e latência de cada chamada.</span>
              </li>
            </ul>
          </UiCard>
        </aside>
      </div>
    </template>

    <!-- Estado vazio: integração não encontrada -->
    <UiCard v-else-if="!initialLoading && !integrationError" padded>
      <UiEmptyState
        icon="link"
        title="Integração não encontrada"
        description="Este gateway pode ter sido removido ou o endereço está incorreto."
      >
        <template #action>
          <UiButton variant="primary" to="/integrations">Voltar às integrações</UiButton>
        </template>
      </UiEmptyState>
    </UiCard>
  </UiPageLayout>

  <!-- Modal: resposta completa (teste ou auditoria), sempre redigida -->
  <UiModal v-model:open="detailOpen" :title="detailTitle" width="lg">
    <div v-if="detailEntry" class="hf-modal">
      <dl class="hf-kv">
        <div v-for="row in detailMeta" :key="row.label" class="hf-kv-row">
          <dt>{{ row.label }}</dt>
          <dd class="hf-ellipsis" :title="row.value">{{ row.value }}</dd>
        </div>
      </dl>
      <div class="hf-payload">
        <p class="hf-payload-label">{{ GLYPH_LOCK }} Resposta (segredos redigidos)</p>
        <pre class="hf-pre hf-mono" tabindex="0" aria-label="Resposta em JSON com segredos redigidos">{{ detailBody }}</pre>
      </div>
    </div>
    <template #footer>
      <UiButton variant="ghost" @click="detailOpen = false">Fechar</UiButton>
    </template>
  </UiModal>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import {
  UiPageLayout,
  UiCard,
  UiMetricCard,
  UiStatusBadge,
  UiDataTable,
  UiEmptyState,
  UiLoadingState,
  UiErrorState,
  UiModal,
  UiButton,
  useToast,
  useConfirm,
  format,
  resolveGlyph,
} from '../ui/index.js';
import * as api from '../api.js';

// A rota é registrada com `props: true`; aceitamos a prop OU o param da rota
// (robustez), sempre como string para o cliente REST.
const props = defineProps({ id: { type: [String, Number], default: null } });
const route = useRoute();
const toast = useToast();
const ask = useConfirm();

const integrationId = computed(() => {
  const v = props.id != null ? props.id : route.params.id;
  return v == null ? '' : String(v);
});

// Recurso REST de domínio — consumido SEMPRE pelo client (api.js), nunca por HTTP cru.
const integrationsApi = api.integrations;
// Ações de domínio do gateway (api.js): ping com resposta redigida + trilha redigida.
const callTest = (id) => api.integrationTest(id);
const callAudit = (id, params) => api.integrationAudit(id, params);

// Glifos decorativos via kit (resolveGlyph) — emoji passa intacto; nome canônico
// vira glifo. Mantidos como variáveis para evitar palavra literal e centralizar.
const GLYPH_LINK = resolveGlyph('link');
const GLYPH_LOCK = resolveGlyph('lock');
const GLYPH_HISTORY = resolveGlyph('history');

function errText(e) {
  if (!e) return 'Erro desconhecido.';
  return e.message || String(e);
}
function unwrap(res) {
  return res && res.data !== undefined ? res.data : res;
}

// ===================== rótulos de domínio (cor NUNCA é o único sinal) =====================
const KIND_LABELS = {
  email: 'E-mail',
  telephony: 'Telefonia',
  webhook: 'Webhook',
  external_central: 'Central externa',
  chat: 'Chat',
};
// Glifos de tipo: emojis literais — passam intactos por resolveGlyph; fallback de link.
const KIND_GLYPHS = {
  email: '✉',
  telephony: '☎',
  webhook: '🪝',
  external_central: '🏢',
  chat: '💬',
};
const STATUS_LABELS = {
  active: 'Ativa',
  degraded: 'Degradada',
  inactive: 'Inativa',
};
const STATUS_TONES = {
  active: 'success',
  degraded: 'warning',
  inactive: 'error',
};

function kindKey(v) {
  return String(v == null ? '' : v).toLowerCase();
}
function statusKey(v) {
  return String(v == null ? '' : v).toLowerCase();
}

// ===================== estado base =====================
const integration = ref(null);
const integrationError = ref(null);
const initialLoading = ref(true);
const refreshing = ref(false);

const pageTitle = computed(() =>
  integration.value && integration.value.name ? integration.value.name : 'Detalhe da integração',
);
const displayName = computed(() =>
  integration.value && integration.value.name ? integration.value.name : 'Integração sem nome',
);
const kindLabel = computed(() => {
  if (!integration.value) return '—';
  const k = kindKey(integration.value.kind);
  return KIND_LABELS[k] || (integration.value.kind ? format.humanize(integration.value.kind) : '—');
});
const kindGlyph = computed(() => {
  if (!integration.value) return GLYPH_LINK;
  return resolveGlyph(KIND_GLYPHS[kindKey(integration.value.kind)], GLYPH_LINK);
});
const statusText = computed(() => {
  if (!integration.value) return '—';
  const s = statusKey(integration.value.status);
  return STATUS_LABELS[s] || (integration.value.status ? format.humanize(integration.value.status) : '—');
});
const statusTone = computed(() => {
  if (!integration.value) return 'neutral';
  return STATUS_TONES[statusKey(integration.value.status)] || 'neutral';
});
const statusMetricTone = statusTone; // mesmo mapa de tom para o cartão de métrica

const timeoutText = computed(() => {
  const v = integration.value && integration.value.timeout_ms;
  if (v === null || v === undefined || v === '') return 'padrão';
  return format.formatNumber(v) + ' ms';
});
const retriesValueText = computed(() => {
  const v = integration.value && integration.value.retries;
  if (v === null || v === undefined || v === '') return '—';
  return format.formatNumber(v);
});
const retriesText = computed(() => {
  const v = integration.value && integration.value.retries;
  if (v === null || v === undefined || v === '') return 'Sem retentativas';
  const n = Number(v);
  return n === 1 ? '1 tentativa' : format.formatNumber(v) + ' tentativas';
});
const lastCheckText = computed(() => {
  const v = integration.value && integration.value.last_check_at;
  return v ? format.formatDateTime(v) : 'Nunca verificada';
});

async function loadIntegration() {
  integrationError.value = null;
  try {
    const res = await integrationsApi.get(integrationId.value);
    integration.value = unwrap(res) || null;
  } catch (e) {
    if (e && e.status === 404) {
      integration.value = null; // estado "não encontrada"
    } else {
      integrationError.value = errText(e);
    }
  }
}

// ===================== teste de conectividade =====================
const testing = ref(false);
const testError = ref(null);
const lastTest = ref(null);

const lastTestStatusWord = computed(() => {
  const t = lastTest.value;
  if (!t) return '';
  if (t.ok === true) return 'ok';
  if (t.ok === false) return 'failed';
  const code = Number(testHttp(t));
  if (code >= 200 && code < 400) return 'ok';
  if (code >= 400) return 'failed';
  return 'unknown';
});
const lastTestTone = computed(() => {
  const w = lastTestStatusWord.value;
  if (w === 'ok') return 'success';
  if (w === 'failed') return 'error';
  return 'warning';
});
const lastTestStatusLabel = computed(() => {
  const w = lastTestStatusWord.value;
  if (w === 'ok') return 'Conectou';
  if (w === 'failed') return 'Falhou';
  return 'Indefinido';
});
const lastTestVerdict = computed(() => {
  const w = lastTestStatusWord.value;
  if (w === 'ok') return 'Gateway respondeu com sucesso';
  if (w === 'failed') return 'O gateway não respondeu como esperado';
  return 'Resposta recebida sem veredito claro';
});
const lastTestWhen = computed(() => {
  // __at é carimbado pelo cliente ao receber a resposta (o ping é síncrono).
  const t = lastTest.value;
  return t && t.__at ? format.formatDateTime(t.__at) : 'Agora há pouco';
});
function testHttp(t) {
  if (!t) return null;
  return t.status_code ?? t.statusCode ?? null;
}
const lastTestHttp = computed(() => {
  const c = testHttp(lastTest.value);
  return c === null || c === undefined || c === '' ? '—' : String(c);
});
const lastTestLatency = computed(() => {
  const t = lastTest.value;
  return latencyText(t && (t.latency_ms ?? t.latencyMs));
});
const lastTestTarget = computed(() => {
  const t = lastTest.value;
  return (t && t.target) || (integration.value && integration.value.base_url) || '—';
});
const lastTestMessage = computed(() => {
  const t = lastTest.value;
  return (t && t.message) || '';
});
const lastTestRedacted = computed(() => {
  const t = lastTest.value;
  return !!(t && t.redacted === true);
});

async function runTest() {
  if (!integration.value || testing.value) return;
  // Ping é um efeito colateral externo. Para um gateway INATIVO, confirma antes de
  // bater no destino (a borda da UI defende; o backend é a fonte da verdade do RBAC).
  if (statusKey(integration.value.status) === 'inactive') {
    const go = await ask({
      title: 'Testar uma integração inativa?',
      message:
        'Esta integração está marcada como inativa. Disparar um ping mesmo assim vai bater no gateway externo e registrar a chamada na trilha de auditoria. Deseja continuar?',
      confirmLabel: 'Testar mesmo assim',
    });
    if (!go) return;
  }

  testing.value = true;
  testError.value = null;
  try {
    const res = await callTest(integration.value.id);
    const payload = unwrap(res) || {};
    payload.__at = new Date().toISOString();
    payload.__raw = res;
    lastTest.value = payload;
    if (lastTestStatusWord.value === 'failed') {
      toast.warning('Ping concluído: o gateway respondeu com falha.', {
        detail: lastTestMessage.value || ('HTTP ' + lastTestHttp.value),
      });
    } else {
      toast.success('Conexão testada com sucesso.');
    }
    // o teste atualiza last_check_at e a trilha — recarrega os dois.
    loadIntegration();
    loadAudit();
  } catch (e) {
    testError.value = errText(e);
    toast.error('Não foi possível testar a conexão.', { detail: errText(e), code: e && e.status });
  } finally {
    testing.value = false;
  }
}

// ===================== trilha de auditoria (paginada client-side) =====================
const auditLoading = ref(false);
const auditError = ref(null);
const auditRaw = ref([]);
const auditPage = ref(1);
const auditPageSize = ref(10);

const auditColumns = [
  { key: 'method', label: 'Método' },
  { key: 'path', label: 'Rota / chamada' },
  { key: 'status', label: 'Resultado' },
  { key: 'latency', label: 'Latência', align: 'right' },
  { key: 'at', label: 'Quando', align: 'right' },
];
const auditEmpty = {
  title: 'Nenhuma chamada registrada',
  description: 'Assim que o gateway fizer chamadas, elas aparecem aqui — com os segredos redigidos.',
  icon: 'history',
};

// Normaliza cada entrada com chave estável (a trilha pode vir com ids parciais).
const auditAll = computed(() =>
  (auditRaw.value || []).map((entry, i) => {
    const e = entry && typeof entry === 'object' ? entry : { value: entry };
    return { ...e, __key: e.id != null ? String(e.id) : ('audit-' + i), __idx: i };
  }),
);
const auditTotal = computed(() => auditAll.value.length);
// Página visível (paginação client-side via UiPagination embutido na tabela).
const auditRows = computed(() => {
  const start = (auditPage.value - 1) * auditPageSize.value;
  return auditAll.value.slice(start, start + auditPageSize.value);
});

const auditCount = computed(() => auditTotal.value);
const auditCountText = computed(() => format.formatNumber(auditCount.value));
const auditFailures = computed(() => auditAll.value.filter((r) => auditStatusWord(r) === 'failed').length);
const auditFailuresText = computed(() => format.formatNumber(auditFailures.value));

function onAuditPage(p) {
  auditPage.value = p;
}
function onAuditPageSize(s) {
  auditPageSize.value = s;
  auditPage.value = 1;
}

async function loadAudit() {
  if (!integrationId.value) return;
  auditLoading.value = true;
  auditError.value = null;
  try {
    // Contrato fixo do /audit: { items: [...], total }. (Array nu aceito por robustez.)
    const res = await callAudit(integrationId.value, { pageSize: 100 });
    const data = unwrap(res);
    auditRaw.value = Array.isArray(data) ? data : (data && data.items) || [];
    auditPage.value = 1;
  } catch (e) {
    auditError.value = errText(e);
    auditRaw.value = [];
  } finally {
    auditLoading.value = false;
  }
}

// ---- leitura dos campos da trilha (contrato fixo /audit; 1 alias camelCase) ----
function methodOf(row) {
  return String(row.method || 'GET').toUpperCase();
}
function pathOf(row) {
  return row.path || '—';
}
function statusCodeOf(row) {
  return row.status_code ?? row.statusCode ?? null;
}
function latencyOf(row) {
  return row.latency_ms ?? row.latencyMs ?? null;
}
function whenRawOf(row) {
  return row.created_at || row.createdAt;
}
function whenText(row) {
  const v = whenRawOf(row);
  return v ? format.formatDateTime(v) : '—';
}
function auditStatusWord(row) {
  if (row.ok === true) return 'ok';
  if (row.ok === false) return 'failed';
  const code = Number(statusCodeOf(row));
  if (isFinite(code) && code > 0) {
    if (code >= 200 && code < 400) return 'ok';
    if (code >= 400) return 'failed';
  }
  return 'unknown';
}
function auditStatusTone(row) {
  const w = auditStatusWord(row);
  if (w === 'ok') return 'success';
  if (w === 'failed') return 'error';
  return 'neutral';
}
function auditStatusLabel(row) {
  const code = statusCodeOf(row);
  const w = auditStatusWord(row);
  if (code !== null && code !== undefined && code !== '') {
    return String(code) + (w === 'ok' ? ' OK' : w === 'failed' ? ' Falha' : '');
  }
  if (w === 'ok') return 'OK';
  if (w === 'failed') return 'Falha';
  return 'Registrado';
}
function redactedNote(row) {
  // Contrato fixo: `redacted` é true sempre que o gateway redigiu segredos server-side.
  return row.redacted === true ? 'segredos redigidos' : '';
}

function latencyText(v) {
  if (v === null || v === undefined || v === '') return '—';
  const n = Number(v);
  if (!isFinite(n)) return String(v);
  if (n >= 1000) return (n / 1000).toFixed(2) + ' s';
  return format.formatNumber(Math.round(n)) + ' ms';
}

// ---- métrica "Último ping" derivada do teste OU da trilha mais recente ----
const lastPingSource = computed(() => {
  if (lastTest.value) {
    return {
      word: lastTestStatusWord.value,
      latency: lastTest.value.latency_ms ?? lastTest.value.latencyMs,
    };
  }
  const first = auditAll.value[0];
  if (first) {
    return { word: auditStatusWord(first), latency: latencyOf(first) };
  }
  return null;
});
const lastPingText = computed(() => {
  const s = lastPingSource.value;
  if (!s) return '—';
  return latencyText(s.latency);
});
const lastPingTone = computed(() => {
  const s = lastPingSource.value;
  if (!s) return 'neutral';
  if (s.word === 'ok') return 'success';
  if (s.word === 'failed') return 'error';
  return 'warning';
});
const lastPingHint = computed(() => {
  const s = lastPingSource.value;
  if (!s) return 'Sem ping registrado';
  if (s.word === 'ok') return 'Última resposta: OK';
  if (s.word === 'failed') return 'Última resposta: falha';
  return 'Resposta sem veredito';
});

// ===================== modal de detalhe (teste/auditoria) =====================
const detailOpen = ref(false);
const detailEntry = ref(null);
const detailKind = ref('audit'); // 'audit' | 'test'

const detailTitle = computed(() =>
  detailKind.value === 'test' ? 'Resposta do teste de conexão' : 'Detalhe da chamada auditada',
);
const detailMeta = computed(() => {
  const row = detailEntry.value;
  if (!row) return [];
  if (detailKind.value === 'test') {
    return [
      { label: 'Veredito', value: lastTestStatusLabel.value },
      { label: 'Código HTTP', value: lastTestHttp.value },
      { label: 'Latência', value: lastTestLatency.value },
      { label: 'Endpoint', value: lastTestTarget.value },
      { label: 'Quando', value: lastTestWhen.value },
    ].filter((r) => r.value !== '' && r.value !== '—');
  }
  return [
    { label: 'Método', value: methodOf(row) },
    { label: 'Rota', value: pathOf(row) },
    { label: 'Resultado', value: auditStatusLabel(row) },
    { label: 'Latência', value: latencyText(latencyOf(row)) },
    { label: 'Quando', value: whenText(row) },
    { label: 'Redação', value: redactedNote(row) || 'Sem segredos detectados' },
  ];
});
const detailBody = computed(() => {
  const row = detailEntry.value;
  if (!row) return '—';
  // Contrato fixo: o teste expõe __raw (resposta crua do /test, já redigida pelo
  // backend) e a auditoria expõe `response`. A redação abaixo é DEFESA-EM-PROFUNDIDADE:
  // a fonte da verdade da redação é o servidor (o cliente nunca recebe segredo cru).
  const candidate =
    detailKind.value === 'test'
      ? (row.__raw !== undefined ? row.__raw : row)
      : (row.response ?? row);
  try {
    return JSON.stringify(candidate, replacer, 2);
  } catch {
    return String(candidate);
  }
});

// Redação client-side de salvaguarda (defesa-em-profundidade — NÃO é a fonte da
// verdade; o backend redige autoritativamente). Cobre nome de campo sensível,
// header "Bearer ..." e tokens estilo JWT (3 segmentos base64url) cujo NOME escape
// da regex (ex.: "x-custom-auth").
const SECRET_KEY_RE = /(token|secret|password|passwd|authorization|api[_-]?key|apikey|bearer|credential|private[_-]?key|client[_-]?secret|cookie|session)/i;
const JWT_RE = /^[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}$/;
function replacer(key, value) {
  if (key && SECRET_KEY_RE.test(key)) return '••• redigido •••';
  if (typeof value === 'string') {
    if (/^Bearer\s+/i.test(value)) return 'Bearer ••• redigido •••';
    if (JWT_RE.test(value.trim())) return '••• redigido •••';
  }
  return value;
}

function openTestDetail() {
  if (!lastTest.value) return;
  detailEntry.value = lastTest.value;
  detailKind.value = 'test';
  detailOpen.value = true;
}
function openAuditDetail(row) {
  detailEntry.value = row;
  detailKind.value = 'audit';
  detailOpen.value = true;
}

// ===================== ciclo de vida =====================
async function reload() {
  refreshing.value = true;
  await loadIntegration();
  if (integration.value) await loadAudit();
  refreshing.value = false;
}

onMounted(async () => {
  initialLoading.value = true;
  await loadIntegration();
  initialLoading.value = false;
  if (integration.value) loadAudit();
});
</script>

<style scoped>
/* ===================== EntityHeader ===================== */
.hf-head { display: flex; align-items: center; gap: var(--ui-space-5); }
.hf-mark {
  display: inline-flex; align-items: center; justify-content: center;
  width: 64px; height: 64px; flex-shrink: 0;
  border-radius: var(--ui-radius-lg);
  background: rgb(var(--ui-accent) / 0.14);
  color: rgb(var(--ui-accent-strong));
  font-size: var(--ui-text-xl);
}
.hf-mark[data-tone="success"] { background: rgb(var(--ui-ok) / 0.16); color: rgb(var(--ui-ok)); }
.hf-mark[data-tone="warning"] { background: rgb(var(--ui-warn) / 0.18); color: rgb(var(--ui-warn)); }
.hf-mark[data-tone="error"] { background: rgb(var(--ui-danger) / 0.16); color: rgb(var(--ui-danger)); }
.hf-head-id { display: flex; flex-direction: column; gap: var(--ui-space-2); min-width: 0; }
.hf-head-row { display: flex; align-items: center; gap: var(--ui-space-3); flex-wrap: wrap; }
.hf-head-name { font-size: var(--ui-text-lg); margin: 0; }
.hf-head-url {
  margin: 0; display: inline-flex; align-items: center; gap: 6px;
  color: rgb(var(--ui-muted)); font-size: var(--ui-text-sm); min-width: 0; max-width: 100%;
}
.hf-head-url-ic { flex-shrink: 0; }
.hf-head-url-a { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.hf-head-meta { margin: 0; display: flex; flex-wrap: wrap; gap: var(--ui-space-2); }
.hf-chip {
  display: inline-flex; align-items: center; gap: 4px;
  background: rgb(var(--ui-surface-2));
  border: 1px solid rgb(var(--ui-border));
  color: rgb(var(--ui-muted));
  border-radius: var(--ui-radius-pill);
  padding: 2px 10px;
  font-size: var(--ui-text-xs);
  font-weight: 600;
}

/* ===================== métricas ===================== */
.hf-metrics {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: var(--ui-space-4);
}

/* ===================== layout em grade ===================== */
.hf-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.7fr) minmax(0, 1fr);
  gap: var(--ui-space-4);
  align-items: start;
}
.hf-col-main, .hf-col-side { display: flex; flex-direction: column; gap: var(--ui-space-4); min-width: 0; }

/* ===================== painel de teste ===================== */
.hf-test { display: flex; flex-direction: column; gap: var(--ui-space-4); }
.hf-test-summary {
  display: flex; align-items: center; gap: var(--ui-space-3);
  padding: var(--ui-space-3) var(--ui-space-4);
  background: rgb(var(--ui-surface-2));
  border: 1px solid rgb(var(--ui-border));
  border-radius: var(--ui-radius-md);
}
.hf-test-dot { width: 12px; height: 12px; border-radius: 50%; flex-shrink: 0; background: rgb(var(--ui-faint)); }
.hf-test-dot[data-tone="success"] { background: rgb(var(--ui-ok)); }
.hf-test-dot[data-tone="warning"] { background: rgb(var(--ui-warn)); }
.hf-test-dot[data-tone="error"] { background: rgb(var(--ui-danger)); }
.hf-test-headline { display: flex; flex-direction: column; min-width: 0; flex: 1 1 auto; }
.hf-test-verdict { margin: 0; font-weight: 600; color: rgb(var(--ui-fg)); }
.hf-test-verdict[data-tone="error"] { color: rgb(var(--ui-danger)); }
.hf-test-verdict[data-tone="success"] { color: rgb(var(--ui-ok)); }
.hf-test-when { margin: 0; font-size: var(--ui-text-xs); color: rgb(var(--ui-muted)); }
.hf-test-actions { display: flex; gap: var(--ui-space-2); flex-wrap: wrap; }

/* ===================== listas de chave/valor ===================== */
.hf-kv { margin: 0; display: flex; flex-direction: column; }
.hf-kv-row {
  display: flex; align-items: baseline; justify-content: space-between; gap: var(--ui-space-4);
  padding: var(--ui-space-2) 0;
  border-bottom: 1px solid rgb(var(--ui-border));
}
.hf-kv-row:last-child { border-bottom: none; }
.hf-kv-row dt { color: rgb(var(--ui-muted)); font-size: var(--ui-text-sm); font-weight: 600; flex-shrink: 0; }
.hf-kv-row dd { margin: 0; color: rgb(var(--ui-fg)); text-align: right; min-width: 0; }
.hf-redact { color: rgb(var(--ui-muted)); font-size: var(--ui-text-sm); }

/* ===================== lista de definições (propriedades) ===================== */
.hf-dl { margin: 0; display: flex; flex-direction: column; }
.hf-dl-row {
  display: flex; align-items: center; justify-content: space-between; gap: var(--ui-space-4);
  padding: var(--ui-space-3) 0;
  border-bottom: 1px solid rgb(var(--ui-border));
}
.hf-dl-row:last-child { border-bottom: none; }
.hf-dl-row dt { color: rgb(var(--ui-muted)); font-size: var(--ui-text-sm); font-weight: 600; flex-shrink: 0; }
.hf-dl-row dd { margin: 0; color: rgb(var(--ui-fg)); text-align: right; min-width: 0; }
.hf-dd-strong { font-weight: 600; }

/* ===================== tabela de auditoria (células) ===================== */
.hf-method {
  display: inline-block; font-family: var(--ui-font-mono);
  font-size: var(--ui-text-xs); font-weight: 700; letter-spacing: .02em;
  padding: 2px 7px; border-radius: var(--ui-radius-sm);
  background: rgb(var(--ui-muted) / 0.14); color: rgb(var(--ui-muted));
}
.hf-method[data-method="GET"] { background: rgb(var(--ui-accent) / 0.14); color: rgb(var(--ui-accent-strong)); }
.hf-method[data-method="POST"] { background: rgb(var(--ui-ok) / 0.16); color: rgb(var(--ui-ok)); }
.hf-method[data-method="PUT"], .hf-method[data-method="PATCH"] { background: rgb(var(--ui-warn) / 0.18); color: rgb(var(--ui-warn)); }
.hf-method[data-method="DELETE"] { background: rgb(var(--ui-danger) / 0.16); color: rgb(var(--ui-danger)); }
.hf-path { display: inline-flex; flex-direction: column; min-width: 0; line-height: 1.25; }
.hf-path-main { color: rgb(var(--ui-fg)); }
.hf-path-note { font-size: var(--ui-text-xs); color: rgb(var(--ui-muted)); }
.hf-num, .hf-time { color: rgb(var(--ui-muted)); font-size: var(--ui-text-sm); white-space: nowrap; }

/* ===================== avisos de segurança ===================== */
.hf-notes { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--ui-space-3); }
.hf-note { display: flex; gap: var(--ui-space-3); align-items: flex-start; font-size: var(--ui-text-sm); color: rgb(var(--ui-muted)); line-height: 1.5; }
.hf-note-ic { flex-shrink: 0; }
.hf-note strong { color: rgb(var(--ui-fg)); font-weight: 600; }

/* ===================== modal de resposta ===================== */
.hf-modal { display: flex; flex-direction: column; gap: var(--ui-space-4); }
.hf-payload { display: flex; flex-direction: column; gap: var(--ui-space-2); }
.hf-payload-label { margin: 0; font-size: var(--ui-text-xs); font-weight: 700; text-transform: uppercase; letter-spacing: .04em; color: rgb(var(--ui-muted)); }
.hf-pre {
  margin: 0; padding: var(--ui-space-4);
  background: rgb(var(--ui-surface-2));
  border: 1px solid rgb(var(--ui-border));
  border-radius: var(--ui-radius-md);
  font-size: var(--ui-text-sm); line-height: 1.5;
  white-space: pre-wrap; word-break: break-word;
  max-height: 48vh; overflow: auto;
}
.hf-pre:focus-visible { outline: 2px solid rgb(var(--ui-accent)); outline-offset: 2px; }

/* ===================== utilidades ===================== */
.hf-mono { font-family: var(--ui-font-mono); font-size: var(--ui-text-sm); }
.hf-ellipsis { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.hf-dash { color: rgb(var(--ui-muted)); font-style: italic; }

/* ===================== responsivo ===================== */
@media (max-width: 980px) {
  .hf-grid { grid-template-columns: 1fr; }
}
@media (max-width: 860px) {
  .hf-head { flex-direction: column; align-items: flex-start; gap: var(--ui-space-4); }
  .hf-mark { width: 52px; height: 52px; font-size: var(--ui-text-lg); }
}
</style>
