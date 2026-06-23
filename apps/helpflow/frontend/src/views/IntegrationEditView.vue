<template>
  <UiPageLayout
    eyebrow="Integrações"
    title="Editar integração"
    :subtitle="headerSubtitle"
    width="wide"
    :loading="loading"
    loading-message="Carregando a integração…"
    :error="loadError"
    @retry="reload"
  >
    <template #actions>
      <UiButton variant="ghost" :to="listTo">Voltar</UiButton>
      <UiButton variant="subtle" :to="(loaded && record) ? detailTo : null" :disabled="!loaded || !record">
        Ver integração
      </UiButton>
    </template>

    <!-- Banner global de alterações não salvas (some quando limpo) -->
    <template v-if="loaded && record && isDirty" #banner>
      <div class="ie-banner" :data-tone="statusDowngrade ? 'warn' : 'info'" role="status">
        <span class="ie-banner-mark" aria-hidden="true">{{ statusDowngrade ? '!' : '●' }}</span>
        <span class="ie-banner-text">{{ submitNote }}</span>
      </div>
    </template>

    <!-- Estado: registro inexistente (carregou sem erro, mas sem dados) -->
    <UiEmptyState
      v-if="loaded && !record"
      icon="⚷"
      title="Integração não encontrada"
      description="A integração que você tentou editar não existe mais ou foi removida do service desk."
    >
      <template #action>
        <UiButton :to="listTo">Voltar para integrações</UiButton>
      </template>
    </UiEmptyState>

    <!-- Estado normal: editor em duas colunas -->
    <div v-else-if="loaded && record" class="ie-grid">
      <!-- COLUNA PRINCIPAL: formulário -->
      <div class="ie-main">
        <!-- Cabeçalho de identidade (read-only) -->
        <UiCard>
          <div class="ie-identity">
            <span class="ie-glyph" :data-kind="kindMeta.value" aria-hidden="true">{{ kindMeta.glyph }}</span>
            <div class="ie-identity-id">
              <p class="ie-identity-name">{{ record.name || 'Integração sem nome' }}</p>
              <p class="ie-identity-meta">
                <span>{{ kindMeta.label }}</span>
                <span class="ie-dot" aria-hidden="true">·</span>
                <span class="ie-mono">{{ endpointPreview }}</span>
              </p>
            </div>
            <div class="ie-identity-badges">
              <UiStatusBadge
                :status="f.values.status"
                :tone="statusTone(f.values.status)"
                :label="statusText(f.values.status)"
                size="lg"
              />
              <UiStatusBadge
                v-if="healthMeta"
                :status="healthMeta.status"
                :tone="healthMeta.tone"
                :label="healthMeta.label"
                size="lg"
              />
            </div>
          </div>
        </UiCard>

        <!-- Aviso: rebaixamento de situação (active -> degraded/inactive) -->
        <UiCard v-if="statusDowngrade" class="ie-warn">
          <p class="ie-warn-text">
            <span class="ie-warn-mark" aria-hidden="true">!</span>
            <span>
              Você está mudando a situação de <strong>{{ statusText(baseline.status) }}</strong> para
              <strong>{{ statusText(f.values.status) }}</strong>. Enquanto não estiver
              <strong>{{ statusText('active') }}</strong>, esta integração pode parar de processar eventos do
              service desk — será pedida confirmação ao salvar.
            </span>
          </p>
        </UiCard>

        <UiCard title="Parâmetros da integração" subtitle="Ajuste o endpoint, os limites de execução e a situação.">
          <form class="ie-form" novalidate @submit.prevent="save">
            <!-- Conexão -->
            <UiFormSection
              title="Conexão"
              description="Endereço de destino que o service desk usa para falar com este sistema externo."
              :columns="1"
            >
              <UiFormField
                full-width
                label="URL base"
                :error="f.errors.base_url"
                hint="Endpoint HTTPS de destino. Deixe em branco para integrações sem URL (ex.: telefonia)."
              >
                <template #default="{ id, describedBy, hasError }">
                  <input
                    :id="id"
                    type="url"
                    inputmode="url"
                    autocomplete="off"
                    spellcheck="false"
                    placeholder="https://api.exemplo.com/webhook"
                    :value="f.values.base_url"
                    :aria-describedby="describedBy"
                    :aria-invalid="hasError ? 'true' : null"
                    @input="f.setField('base_url', $event.target.value)"
                  />
                </template>
              </UiFormField>
            </UiFormSection>

            <!-- Resiliência -->
            <UiFormSection
              title="Resiliência"
              description="Quanto tempo esperar por resposta e quantas vezes repetir antes de marcar como falha."
              :columns="2"
            >
              <UiFormField
                label="Timeout (ms)"
                :error="f.errors.timeout_ms"
                hint="Tempo máximo de espera por resposta, em milissegundos."
              >
                <template #default="{ id, describedBy, hasError }">
                  <input
                    :id="id"
                    type="number"
                    inputmode="numeric"
                    min="0"
                    max="600000"
                    step="100"
                    placeholder="ex.: 5000"
                    :value="f.values.timeout_ms"
                    :aria-describedby="describedBy"
                    :aria-invalid="hasError ? 'true' : null"
                    @input="f.setField('timeout_ms', $event.target.value)"
                  />
                </template>
              </UiFormField>

              <UiFormField
                label="Tentativas"
                :error="f.errors.retries"
                hint="Novas tentativas após a primeira falha (0 = não repete)."
              >
                <template #default="{ id, describedBy, hasError }">
                  <input
                    :id="id"
                    type="number"
                    inputmode="numeric"
                    min="0"
                    max="10"
                    step="1"
                    placeholder="ex.: 3"
                    :value="f.values.retries"
                    :aria-describedby="describedBy"
                    :aria-invalid="hasError ? 'true' : null"
                    @input="f.setField('retries', $event.target.value)"
                  />
                </template>
              </UiFormField>
            </UiFormSection>

            <!-- Situação: cartões de rádio acessíveis -->
            <UiFormSection
              title="Situação"
              description="Controla se o service desk usa esta integração agora."
              :columns="1"
            >
              <UiFormField full-width :error="f.errors.status" :required="true" label="Selecione a situação">
                <template #default="{ id, describedBy, hasError }">
                  <div
                    :id="id"
                    class="ie-status"
                    role="radiogroup"
                    aria-label="Situação da integração"
                    :aria-describedby="describedBy"
                    :aria-invalid="hasError ? 'true' : null"
                  >
                    <label
                      v-for="opt in STATUS_OPTIONS"
                      :key="opt.value"
                      class="ie-status-opt"
                      :data-selected="f.values.status === opt.value ? 'true' : 'false'"
                    >
                      <input
                        class="ie-status-input"
                        type="radio"
                        name="integration-status"
                        :value="opt.value"
                        :checked="f.values.status === opt.value"
                        @change="f.setField('status', opt.value)"
                      />
                      <span class="ie-status-mark" aria-hidden="true" :data-tone="opt.tone" />
                      <span class="ie-status-body">
                        <span class="ie-status-head">
                          <span class="ie-status-name">{{ opt.label }}</span>
                          <UiStatusBadge :status="opt.value" :tone="opt.tone" :label="opt.label" size="sm" />
                        </span>
                        <span class="ie-status-desc">{{ opt.description }}</span>
                      </span>
                    </label>
                  </div>
                </template>
              </UiFormField>
            </UiFormSection>

            <!-- Mapeamento: roteamento padrão para time e prioridade -->
            <UiFormSection
              title="Mapeamento"
              description="Define como os chamados originados por esta integração são roteados — time responsável e prioridade inicial."
              :columns="2"
            >
              <UiFormField
                label="Time padrão"
                hint="Quando um chamado chega por esta integração, é atribuído a este time."
              >
                <template #default="{ id, describedBy }">
                  <select
                    :id="id"
                    :aria-describedby="describedBy"
                    :value="f.values.mapping_team_id"
                    :disabled="teamsLoading"
                    @change="f.setField('mapping_team_id', $event.target.value)"
                  >
                    <option value="">Sem time padrão</option>
                    <option v-for="team in teams" :key="team.id" :value="String(team.id)">
                      {{ team.name }}
                    </option>
                  </select>
                </template>
              </UiFormField>

              <UiFormField
                label="Prioridade padrão"
                hint="Prioridade inicial dos chamados abertos por esta integração."
              >
                <template #default="{ id, describedBy }">
                  <select
                    :id="id"
                    :aria-describedby="describedBy"
                    :value="f.values.mapping_default_priority"
                    @change="f.setField('mapping_default_priority', $event.target.value)"
                  >
                    <option value="">Sem prioridade padrão</option>
                    <option v-for="opt in PRIORITY_OPTIONS" :key="opt.value" :value="opt.value">
                      {{ opt.label }}
                    </option>
                  </select>
                </template>
              </UiFormField>
            </UiFormSection>

            <!-- Metadados read-only (não editáveis nesta tela) -->
            <dl class="ie-meta">
              <div class="ie-meta-row">
                <dt>Tipo</dt>
                <dd>{{ kindMeta.label }}</dd>
              </div>
              <div class="ie-meta-row">
                <dt>Última verificação</dt>
                <dd>{{ lastCheckLabel }}</dd>
              </div>
              <div class="ie-meta-row">
                <dt>ID da integração</dt>
                <dd class="ie-mono">{{ record.id }}</dd>
              </div>
            </dl>

            <!-- SubmitBar (sticky no rodapé do form) -->
            <div class="ie-submitbar">
              <p class="ie-submitbar-note" :data-state="submitNoteState">{{ submitNote }}</p>
              <div class="ie-submitbar-actions">
                <UiButton variant="ghost" type="button" :disabled="f.submitting.value || !isDirty" @click="resetForm">
                  Reverter
                </UiButton>
                <UiButton variant="ghost" type="button" :disabled="f.submitting.value" @click="cancel">
                  Cancelar
                </UiButton>
                <UiButton type="submit" :loading="f.submitting.value" :disabled="!isDirty">
                  Salvar alterações
                </UiButton>
              </div>
            </div>
          </form>
        </UiCard>
      </div>

      <!-- COLUNA LATERAL: teste de conexão + trilha recente -->
      <aside class="ie-side">
        <!-- Teste de conexão (ping pelo gateway, redação server-side) -->
        <UiCard title="Testar conexão" subtitle="Faz um ping pelo gateway. Segredos são redigidos no servidor.">
          <div class="ie-test">
            <p class="ie-test-hint">
              O teste usa os parâmetros <strong>já salvos</strong>. Salve as alterações antes de testar
              para validar o que está em produção.
            </p>

            <!-- Resultado mais recente do teste (inline) -->
            <div v-if="testResult" class="ie-test-result" :data-ok="testResult.ok ? 'true' : 'false'">
              <div class="ie-test-result-head">
                <UiStatusBadge
                  :status="testResult.ok ? 'ok' : 'error'"
                  :tone="testResult.ok ? 'success' : 'error'"
                  :label="testResult.ok ? 'Conexão OK' : 'Falha na conexão'"
                  size="sm"
                />
                <span v-if="testResult.status_code" class="ie-test-code ie-mono">HTTP {{ testResult.status_code }}</span>
                <span v-if="testResult.latency_ms != null" class="ie-test-latency">{{ testResult.latency_ms }} ms</span>
              </div>
              <p v-if="testResult.message" class="ie-test-msg">{{ testResult.message }}</p>
              <button type="button" class="ie-link" @click="openTestDetails">Ver detalhes</button>
            </div>

            <UiButton
              block
              variant="subtle"
              type="button"
              :loading="testing"
              :disabled="testing || isDirty"
              @click="runTest"
            >
              {{ testing ? 'Testando…' : 'Testar agora' }}
            </UiButton>
            <p v-if="isDirty" class="ie-test-blocked">Salve as alterações para liberar o teste.</p>
          </div>
        </UiCard>

        <!-- Trilha de auditoria recente (redigida) -->
        <UiCard title="Atividade recente" subtitle="Últimas chamadas pelo gateway (redigidas).">
          <template #actions>
            <UiButton size="sm" variant="ghost" type="button" :loading="auditLoading" @click="loadAudit">
              Atualizar
            </UiButton>
          </template>

          <UiLoadingState v-if="auditLoading && !auditItems.length" variant="skeleton" :skeleton-lines="4" />
          <UiErrorState
            v-else-if="auditError"
            :message="auditError"
            :retryable="true"
            @retry="loadAudit"
          />
          <UiEmptyState
            v-else-if="!auditItems.length"
            icon="◷"
            title="Sem atividade ainda"
            description="As chamadas desta integração pelo gateway aparecerão aqui."
          />
          <ol v-else class="ie-trail">
            <li v-for="row in auditItems" :key="row.id" class="ie-trail-item" :data-ok="row.ok ? 'true' : 'false'">
              <span class="ie-trail-dot" aria-hidden="true" />
              <div class="ie-trail-body">
                <div class="ie-trail-line">
                  <span class="ie-trail-method ie-mono" :data-method="String(row.method || '').toUpperCase()">
                    {{ String(row.method || '—').toUpperCase() }}
                  </span>
                  <span class="ie-trail-path ie-mono">{{ row.path || '—' }}</span>
                </div>
                <div class="ie-trail-meta">
                  <span class="ie-trail-status" :data-ok="row.ok ? 'true' : 'false'">
                    {{ row.status_code != null ? ('HTTP ' + row.status_code) : (row.ok ? 'OK' : 'Falha') }}
                  </span>
                  <span v-if="row.latency_ms != null" class="ie-trail-sep" aria-hidden="true">·</span>
                  <span v-if="row.latency_ms != null">{{ row.latency_ms }} ms</span>
                  <span class="ie-trail-sep" aria-hidden="true">·</span>
                  <span class="ie-trail-time">{{ formatWhen(row.created_at) }}</span>
                </div>
              </div>
            </li>
          </ol>
        </UiCard>
      </aside>
    </div>

    <!-- Modal de detalhes do último teste (resposta redigida) -->
    <UiModal v-model:open="testModalOpen" title="Detalhes do teste de conexão" width="md">
      <div v-if="testResult" class="ie-modal">
        <dl class="ie-modal-meta">
          <div class="ie-modal-row">
            <dt>Resultado</dt>
            <dd>
              <UiStatusBadge
                :status="testResult.ok ? 'ok' : 'error'"
                :tone="testResult.ok ? 'success' : 'error'"
                :label="testResult.ok ? 'Conexão OK' : 'Falha na conexão'"
                size="sm"
              />
            </dd>
          </div>
          <div v-if="testResult.method" class="ie-modal-row">
            <dt>Método</dt>
            <dd class="ie-mono">{{ String(testResult.method).toUpperCase() }}</dd>
          </div>
          <div v-if="testResult.target" class="ie-modal-row">
            <dt>Destino</dt>
            <dd class="ie-mono ie-modal-wrap">{{ testResult.target }}</dd>
          </div>
          <div v-if="testResult.status_code" class="ie-modal-row">
            <dt>Código</dt>
            <dd class="ie-mono">HTTP {{ testResult.status_code }}</dd>
          </div>
          <div v-if="testResult.latency_ms != null" class="ie-modal-row">
            <dt>Latência</dt>
            <dd>{{ testResult.latency_ms }} ms</dd>
          </div>
        </dl>
        <p v-if="testResult.redacted" class="ie-modal-redacted">
          <span class="ie-modal-redacted-mark" aria-hidden="true">⛨</span>
          Os segredos desta resposta foram redigidos pelo gateway antes de chegar ao navegador.
        </p>
        <div v-if="responsePreview" class="ie-modal-resp">
          <p class="ie-modal-resp-label">Resposta (redigida)</p>
          <pre class="ie-modal-pre ie-mono">{{ responsePreview }}</pre>
        </div>
      </div>
      <template #footer>
        <UiButton variant="ghost" type="button" @click="testModalOpen = false">Fechar</UiButton>
      </template>
    </UiModal>
  </UiPageLayout>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import {
  UiPageLayout,
  UiCard,
  UiButton,
  UiFormSection,
  UiFormField,
  UiStatusBadge,
  UiEmptyState,
  UiLoadingState,
  UiErrorState,
  UiModal,
  useForm,
  useToast,
  useConfirm,
  validators,
  format,
} from '../ui/index.js';
import * as api from '../api.js';

// Recurso /v1/integrations via fábrica REST + ações de domínio do gateway.
// Fallback defensivo p/ não quebrar caso um símbolo nomeado suma do api.js.
const integrations = api.integrations || api.resourceFactory('integrations');
const integrationTest = api.integrationTest;
const integrationAudit = api.integrationAudit;
const teamsApi = api.teams || api.resourceFactory('teams');

const props = defineProps({ id: { type: String, default: null } });

const router = useRouter();
const toast = useToast();
const confirm = useConfirm();

const LIST_ROUTE = '/integrations';
const listTo = LIST_ROUTE;
const detailTo = computed(() => (props.id ? LIST_ROUTE + '/' + props.id : LIST_ROUTE));

const loading = ref(true);
const loaded = ref(false);
const loadError = ref(null);
const record = ref(null);

// Tipos de integração (enum do domínio) com rótulo + glifo de contexto.
const KINDS = [
  { value: 'email', label: 'E-mail', glyph: '✉' },
  { value: 'telephony', label: 'Telefonia', glyph: '☎' },
  { value: 'webhook', label: 'Webhook', glyph: '⚡' },
  { value: 'external_central', label: 'Central externa', glyph: '◈' },
  { value: 'chat', label: 'Chat', glyph: '💬' },
];
const KIND_MAP = KINDS.reduce((acc, k) => { acc[k.value] = k; return acc; }, {});

// Situações (enum do domínio) com tom semântico + descrição da consequência.
const STATUS_OPTIONS = [
  { value: 'active', label: 'Ativa', tone: 'success', description: 'Em uso: processa eventos do service desk normalmente.' },
  { value: 'degraded', label: 'Degradada', tone: 'warning', description: 'Funciona parcialmente: lentidão ou falhas intermitentes.' },
  { value: 'inactive', label: 'Inativa', tone: 'error', description: 'Desligada: não envia nem recebe eventos por aqui.' },
];
const STATUS_MAP = STATUS_OPTIONS.reduce((acc, o) => { acc[o.value] = o; return acc; }, {});

const PRIORITY_OPTIONS = [
  { value: 'urgent', label: 'Urgente' },
  { value: 'high', label: 'Alto' },
  { value: 'medium', label: 'Médio' },
  { value: 'low', label: 'Baixo' },
];

// estado do mapeamento: times disponíveis para roteamento
const teams = ref([]);
const teamsLoading = ref(false);

const f = useForm({
  initial: { base_url: '', timeout_ms: '', retries: '', status: 'active', mapping_team_id: '', mapping_default_priority: '' },
  rules: {
    status: [validators.required('Selecione a situação')],
    base_url: [validators.maxLen(2048, 'URL muito longa (máx. 2048 caracteres)')],
    timeout_ms: [
      validators.numeric('Informe um número válido'),
      validators.min(0, 'O timeout não pode ser negativo'),
      validators.max(600000, 'Timeout muito alto (máx. 600000 ms)'),
    ],
    retries: [
      validators.numeric('Informe um número válido'),
      validators.min(0, 'As tentativas não podem ser negativas'),
      validators.max(10, 'No máximo 10 tentativas'),
    ],
  },
});

// snapshot do estado original p/ detectar alterações (dirty) e comparar situação.
const baseline = reactive({ base_url: '', timeout_ms: '', retries: '', status: 'active', mapping_team_id: '', mapping_default_priority: '' });

// --- estado das ações de domínio (teste + auditoria) ---
const testing = ref(false);
const testResult = ref(null);
const testModalOpen = ref(false);

const auditItems = ref([]);
const auditLoading = ref(false);
const auditError = ref(null);

const headerSubtitle = computed(() => {
  if (loadError.value || !record.value) return 'Edite a URL, o timeout, as tentativas e a situação da integração.';
  const who = record.value.name;
  return who ? 'Editando os parâmetros de “' + who + '”.' : 'Edite a URL, o timeout, as tentativas e a situação da integração.';
});

const kindMeta = computed(() => {
  const k = record.value && record.value.kind;
  const m = KIND_MAP[String(k || '').toLowerCase()];
  return m || { value: '', glyph: '⚷', label: k ? format.humanize(k) : 'Integração' };
});

const endpointPreview = computed(() => {
  const url = record.value && record.value.base_url;
  if (!url) return 'Sem URL';
  const s = String(url);
  return s.length > 48 ? s.slice(0, 47) + '…' : s;
});

// Saúde derivada da última verificação (read-only, informativo).
const healthMeta = computed(() => {
  const v = record.value && record.value.last_check_at;
  if (!v) return { status: 'pending', tone: 'neutral', label: 'Nunca verificada' };
  const d = new Date(v);
  if (isNaN(d.getTime())) return null;
  const ageMs = Date.now() - d.getTime();
  const oneDay = 24 * 60 * 60 * 1000;
  if (ageMs > 7 * oneDay) return { status: 'overdue', tone: 'warning', label: 'Verificação atrasada' };
  return { status: 'checked', tone: 'success', label: 'Verificada recentemente' };
});

const statusChanged = computed(() => normalize(f.values.status) !== normalize(baseline.status));
const statusDowngrade = computed(() => baseline.status === 'active' && statusChanged.value && f.values.status !== 'active');

const isDirty = computed(() => {
  for (const k of Object.keys(baseline)) {
    if (normalize(f.values[k]) !== normalize(baseline[k])) return true;
  }
  return false;
});

const submitNoteState = computed(() => {
  if (statusDowngrade.value) return 'warn';
  if (isDirty.value) return 'dirty';
  return 'clean';
});
const submitNote = computed(() => {
  if (statusDowngrade.value) return 'Mudança de situação pendente — pode interromper a integração.';
  if (isDirty.value) return 'Há alterações não salvas.';
  return 'Tudo salvo.';
});

const lastCheckLabel = computed(() => {
  const v = record.value && record.value.last_check_at;
  return v ? format.formatDateTime(v) : 'Nunca verificada';
});

const responsePreview = computed(() => {
  const r = testResult.value && testResult.value.response;
  if (r === null || r === undefined || r === '') return '';
  if (typeof r === 'string') return r.length > 4000 ? r.slice(0, 4000) + '\n…' : r;
  try {
    const s = JSON.stringify(r, null, 2);
    return s.length > 4000 ? s.slice(0, 4000) + '\n…' : s;
  } catch {
    return String(r);
  }
});

function normalize(v) {
  if (v === null || v === undefined) return '';
  return String(v);
}
function statusTone(status) {
  const o = STATUS_MAP[String(status).toLowerCase()];
  return o ? o.tone : 'neutral';
}
function statusText(status) {
  if (!status) return '—';
  const o = STATUS_MAP[String(status).toLowerCase()];
  return o ? o.label : format.humanize(status);
}
function formatWhen(value) {
  return value ? format.formatDateTime(value) : '—';
}

function hydrate(rec) {
  const mapping = rec.mapping && typeof rec.mapping === 'object' ? rec.mapping : {};
  const next = {
    base_url: rec.base_url != null ? String(rec.base_url) : '',
    timeout_ms: rec.timeout_ms != null && rec.timeout_ms !== '' ? String(rec.timeout_ms) : '',
    retries: rec.retries != null && rec.retries !== '' ? String(rec.retries) : '',
    status: rec.status || 'active',
    mapping_team_id: mapping.team_id != null ? String(mapping.team_id) : '',
    mapping_default_priority: mapping.default_priority || '',
  };
  for (const k of Object.keys(next)) {
    f.values[k] = next[k];
    baseline[k] = next[k];
  }
}

function resetForm() {
  for (const k of Object.keys(baseline)) f.values[k] = baseline[k];
}

async function reload() {
  if (!props.id) {
    loadError.value = 'Nenhuma integração selecionada para edição.';
    loading.value = false;
    return;
  }
  loading.value = true;
  loadError.value = null;
  loaded.value = false;
  try {
    const rec = await integrations.get(props.id);
    record.value = rec || null;
    if (rec) hydrate(rec);
    loaded.value = true;
    if (rec) loadAudit();
  } catch (e) {
    loadError.value = e && e.message ? e.message : 'Não foi possível carregar a integração.';
  } finally {
    loading.value = false;
  }
}

// Monta o PATCH apenas com os campos que mudaram (edição parcial).
function buildPatch(vals) {
  const patch = {};
  if (normalize(vals.base_url) !== normalize(baseline.base_url)) {
    patch.base_url = vals.base_url === '' ? null : vals.base_url;
  }
  if (normalize(vals.timeout_ms) !== normalize(baseline.timeout_ms)) {
    patch.timeout_ms = vals.timeout_ms === '' || vals.timeout_ms === null ? null : Number(vals.timeout_ms);
  }
  if (normalize(vals.retries) !== normalize(baseline.retries)) {
    patch.retries = vals.retries === '' || vals.retries === null ? null : Number(vals.retries);
  }
  if (normalize(vals.status) !== normalize(baseline.status)) {
    patch.status = vals.status;
  }
  const mapTeamChanged = normalize(vals.mapping_team_id) !== normalize(baseline.mapping_team_id);
  const mapPriorityChanged = normalize(vals.mapping_default_priority) !== normalize(baseline.mapping_default_priority);
  if (mapTeamChanged || mapPriorityChanged) {
    const m = {};
    if (vals.mapping_team_id) m.team_id = Number(vals.mapping_team_id);
    if (vals.mapping_default_priority) m.default_priority = vals.mapping_default_priority;
    patch.mapping = m;
  }
  return patch;
}

function save() {
  f.handleSubmit(async (vals) => {
    const who = (record.value && record.value.name) || ('#' + props.id);
    const patch = buildPatch(vals);
    if (Object.keys(patch).length === 0) {
      toast.info('Nada a salvar — não há alterações.');
      return;
    }

    const downgrading = baseline.status === 'active' && patch.status !== undefined && patch.status !== 'active';
    const ok = await confirm({
      title: downgrading ? 'Confirmar mudança de situação' : 'Salvar alterações',
      message: downgrading
        ? 'Você vai mudar a situação de “' + who + '” para ' + statusText(patch.status) + '. Enquanto não estiver Ativa, esta integração pode parar de processar eventos. Confirmar?'
        : 'Confirmar a atualização dos parâmetros de “' + who + '”?',
      confirmLabel: downgrading ? 'Mudar situação' : 'Salvar',
      cancelLabel: 'Revisar',
      danger: downgrading,
    });
    if (!ok) return;

    try {
      const updated = await integrations.update(props.id, patch);
      if (updated && typeof updated === 'object' && updated.id !== undefined) {
        record.value = updated;
        hydrate(updated);
      } else {
        // backend sem corpo de resposta: fixa o baseline no estado salvo.
        for (const k of Object.keys(baseline)) baseline[k] = f.values[k];
      }
      toast.success('Integração atualizada.');
      router.push(detailTo.value);
    } catch (e) {
      toast.error('Falha ao salvar a integração.', { detail: e && e.message, code: e && e.status });
    }
  });
}

async function cancel() {
  if (isDirty.value) {
    const leave = await confirm({
      title: 'Descartar alterações?',
      message: 'Você tem alterações não salvas. Sair sem salvar?',
      confirmLabel: 'Descartar',
      cancelLabel: 'Continuar editando',
      danger: true,
    });
    if (!leave) return;
  }
  router.push(detailTo.value);
}

// --- Teste de conexão (ação de domínio do gateway; redação server-side) ---
async function runTest() {
  if (!props.id || typeof integrationTest !== 'function' || testing.value || isDirty.value) return;
  const ok = await confirm({
    title: 'Testar conexão',
    message: 'O service desk vai fazer um ping por esta integração através do gateway. Segredos da resposta são redigidos no servidor. Continuar?',
    confirmLabel: 'Testar',
    cancelLabel: 'Cancelar',
  });
  if (!ok) return;
  testing.value = true;
  try {
    const res = await integrationTest(props.id);
    testResult.value = res || { ok: false, message: 'Sem resposta do gateway.' };
    if (testResult.value.ok) toast.success('Conexão OK pelo gateway.');
    else toast.warning('O teste retornou falha — veja os detalhes.');
    loadAudit();
  } catch (e) {
    testResult.value = { ok: false, message: (e && e.message) || 'Falha ao testar a conexão.' };
    toast.error('Não foi possível testar a conexão.', { detail: e && e.message, code: e && e.status });
  } finally {
    testing.value = false;
  }
}

function openTestDetails() {
  if (testResult.value) testModalOpen.value = true;
}

// --- Trilha de auditoria recente (redigida) ---
async function loadAudit() {
  if (!props.id || typeof integrationAudit !== 'function') return;
  auditLoading.value = true;
  auditError.value = null;
  try {
    const res = await integrationAudit(props.id, { pageSize: 6 });
    const items = (res && (res.items || res.data)) || [];
    auditItems.value = Array.isArray(items) ? items.slice(0, 6) : [];
  } catch (e) {
    // fail-closed: a tela degrada (erro + retry); nunca fabrica dados.
    auditError.value = (e && e.message) || 'Não foi possível carregar a atividade recente.';
    auditItems.value = [];
  } finally {
    auditLoading.value = false;
  }
}

// Carrega os times para o seletor de mapeamento (fail-closed: a tela não quebra sem dados).
async function loadTeams() {
  teamsLoading.value = true;
  try {
    const res = await teamsApi.list({ pageSize: 100 });
    const rows = (res && res.data) || [];
    teams.value = Array.isArray(rows) ? rows.filter((t) => t && t.status !== 'inactive') : [];
  } catch {
    teams.value = [];
  } finally {
    teamsLoading.value = false;
  }
}

onMounted(() => { reload(); loadTeams(); });
</script>

<style scoped>
/* layout em duas colunas */
.ie-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 340px;
  gap: var(--ui-space-5);
  align-items: start;
}
.ie-main {
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-4);
  min-width: 0;
}
.ie-side {
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-4);
  position: sticky;
  top: var(--ui-space-4);
}

/* banner de alterações no topo da página */
.ie-banner {
  display: flex;
  align-items: center;
  gap: var(--ui-space-3);
  padding: var(--ui-space-3) var(--ui-space-4);
  border-radius: var(--ui-radius-md);
  border: 1px solid rgb(var(--ui-accent) / 0.4);
  background: rgb(var(--ui-accent) / 0.08);
  font-size: var(--ui-text-sm);
}
.ie-banner[data-tone="warn"] {
  border-color: rgb(var(--ui-warn) / 0.5);
  background: rgb(var(--ui-warn) / 0.1);
}
.ie-banner-mark {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  flex-shrink: 0;
  border-radius: var(--ui-radius-pill);
  font-weight: 800;
  font-size: var(--ui-text-xs);
  background: rgb(var(--ui-accent) / 0.18);
  color: rgb(var(--ui-accent-strong));
}
.ie-banner[data-tone="warn"] .ie-banner-mark {
  background: rgb(var(--ui-warn) / 0.2);
  color: rgb(var(--ui-warn));
}
.ie-banner-text {
  color: rgb(var(--ui-fg));
  font-weight: 600;
}

.ie-form {
  display: flex;
  flex-direction: column;
}

/* cabeçalho de identidade (read-only) */
.ie-identity {
  display: flex;
  align-items: center;
  gap: var(--ui-space-4);
  flex-wrap: wrap;
}
.ie-glyph {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 52px;
  height: 52px;
  flex-shrink: 0;
  border-radius: var(--ui-radius-lg);
  background: rgb(var(--ui-accent) / 0.14);
  color: rgb(var(--ui-accent-strong));
  font-size: var(--ui-text-xl);
  line-height: 1;
}
.ie-identity-id {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
  flex: 1 1 auto;
}
.ie-identity-name {
  margin: 0;
  font-family: var(--ui-font-display);
  font-weight: 700;
  font-size: var(--ui-text-lg);
  color: rgb(var(--ui-fg));
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ie-identity-meta {
  display: flex;
  align-items: center;
  gap: var(--ui-space-2);
  margin: 0;
  color: rgb(var(--ui-muted));
  font-size: var(--ui-text-sm);
  min-width: 0;
  flex-wrap: wrap;
}
.ie-dot {
  color: rgb(var(--ui-faint));
}
.ie-identity-badges {
  display: flex;
  gap: var(--ui-space-2);
  flex-wrap: wrap;
  flex-shrink: 0;
}

/* aviso de rebaixamento de situação */
.ie-warn {
  border-color: rgb(var(--ui-warn) / 0.45);
  background: rgb(var(--ui-warn) / 0.08);
}
.ie-warn-text {
  display: flex;
  align-items: flex-start;
  gap: var(--ui-space-3);
  margin: 0;
  color: rgb(var(--ui-fg));
  font-size: var(--ui-text-sm);
  line-height: 1.5;
}
.ie-warn-text strong {
  color: rgb(var(--ui-fg));
}
.ie-warn-mark {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 22px;
  height: 22px;
  border-radius: var(--ui-radius-pill);
  background: rgb(var(--ui-warn) / 0.18);
  color: rgb(var(--ui-warn));
  font-family: var(--ui-font-display);
  font-weight: 800;
  font-size: var(--ui-text-sm);
}

/* StatusPicker — cartões de rádio */
.ie-status {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: var(--ui-space-3);
}
.ie-status-opt {
  position: relative;
  display: flex;
  align-items: flex-start;
  gap: var(--ui-space-3);
  padding: var(--ui-space-3) var(--ui-space-4);
  border: 1px solid rgb(var(--ui-border-strong));
  border-radius: var(--ui-radius-md);
  background: rgb(var(--ui-surface));
  cursor: pointer;
  transition: border-color 0.15s ease, background 0.15s ease, box-shadow 0.15s ease;
}
.ie-status-opt:hover {
  border-color: rgb(var(--ui-accent) / 0.6);
  background: rgb(var(--ui-surface-2));
}
.ie-status-opt[data-selected="true"] {
  border-color: rgb(var(--ui-accent));
  background: rgb(var(--ui-accent) / 0.08);
  box-shadow: 0 0 0 1px rgb(var(--ui-accent));
}
.ie-status-input {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: -1px;
  padding: 0;
  border: 0;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
}
.ie-status-mark {
  flex-shrink: 0;
  width: 18px;
  height: 18px;
  margin-top: 2px;
  border-radius: 50%;
  border: 2px solid rgb(var(--ui-border-strong));
  background: rgb(var(--ui-surface));
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}
.ie-status-opt[data-selected="true"] .ie-status-mark {
  border-color: rgb(var(--ui-accent));
  box-shadow: inset 0 0 0 4px rgb(var(--ui-accent));
}
.ie-status-input:focus-visible + .ie-status-mark {
  outline: 2px solid rgb(var(--ui-accent));
  outline-offset: 2px;
}
.ie-status-body {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}
.ie-status-head {
  display: flex;
  align-items: center;
  gap: var(--ui-space-2);
  flex-wrap: wrap;
}
.ie-status-name {
  font-weight: 700;
  color: rgb(var(--ui-fg));
}
.ie-status-desc {
  font-size: var(--ui-text-xs);
  color: rgb(var(--ui-muted));
  line-height: 1.45;
}

/* metadados read-only */
.ie-meta {
  margin: var(--ui-space-4) 0 var(--ui-space-5);
  padding: var(--ui-space-2) var(--ui-space-4);
  background: rgb(var(--ui-surface-2));
  border-radius: var(--ui-radius-md);
  border: 1px solid rgb(var(--ui-border));
  display: flex;
  flex-direction: column;
}
.ie-meta-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ui-space-4);
  padding: var(--ui-space-2) 0;
  border-bottom: 1px solid rgb(var(--ui-border));
}
.ie-meta-row:last-child {
  border-bottom: none;
}
.ie-meta-row dt {
  font-size: var(--ui-text-xs);
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: rgb(var(--ui-muted));
}
.ie-meta-row dd {
  margin: 0;
  font-size: var(--ui-text-sm);
  color: rgb(var(--ui-fg));
  text-align: right;
}
.ie-mono {
  font-family: var(--ui-font-mono);
}

/* SubmitBar */
.ie-submitbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ui-space-4);
  flex-wrap: wrap;
  margin-top: var(--ui-space-2);
  padding-top: var(--ui-space-4);
  border-top: 1px solid rgb(var(--ui-border));
}
.ie-submitbar-note {
  margin: 0;
  font-size: var(--ui-text-sm);
  color: rgb(var(--ui-muted));
}
.ie-submitbar-note[data-state="dirty"] {
  color: rgb(var(--ui-accent-strong));
  font-weight: 600;
}
.ie-submitbar-note[data-state="warn"] {
  color: rgb(var(--ui-warn));
  font-weight: 700;
}
.ie-submitbar-actions {
  display: flex;
  gap: var(--ui-space-2);
  flex-wrap: wrap;
}

/* ----- sidebar: teste de conexão ----- */
.ie-test {
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-3);
}
.ie-test-hint {
  margin: 0;
  font-size: var(--ui-text-sm);
  color: rgb(var(--ui-muted));
  line-height: 1.5;
}
.ie-test-hint strong {
  color: rgb(var(--ui-fg));
}
.ie-test-result {
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-2);
  padding: var(--ui-space-3) var(--ui-space-4);
  border-radius: var(--ui-radius-md);
  border: 1px solid rgb(var(--ui-border));
  background: rgb(var(--ui-surface-2));
}
.ie-test-result[data-ok="true"] {
  border-color: rgb(var(--ui-ok) / 0.4);
  background: rgb(var(--ui-ok) / 0.07);
}
.ie-test-result[data-ok="false"] {
  border-color: rgb(var(--ui-danger) / 0.4);
  background: rgb(var(--ui-danger) / 0.07);
}
.ie-test-result-head {
  display: flex;
  align-items: center;
  gap: var(--ui-space-2);
  flex-wrap: wrap;
}
.ie-test-code {
  font-size: var(--ui-text-xs);
  color: rgb(var(--ui-fg));
}
.ie-test-latency {
  font-size: var(--ui-text-xs);
  color: rgb(var(--ui-muted));
}
.ie-test-msg {
  margin: 0;
  font-size: var(--ui-text-sm);
  color: rgb(var(--ui-fg));
  line-height: 1.45;
  word-break: break-word;
}
.ie-test-blocked {
  margin: 0;
  font-size: var(--ui-text-xs);
  color: rgb(var(--ui-warn));
  text-align: center;
}
.ie-link {
  align-self: flex-start;
  background: none;
  border: none;
  padding: 0;
  font: inherit;
  font-size: var(--ui-text-xs);
  font-weight: 600;
  color: rgb(var(--ui-accent-strong));
  cursor: pointer;
  text-decoration: underline;
}
.ie-link:hover {
  filter: brightness(1.1);
}

/* ----- sidebar: trilha de auditoria ----- */
.ie-trail {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
}
.ie-trail-item {
  position: relative;
  display: flex;
  gap: var(--ui-space-3);
  padding: var(--ui-space-3) 0;
  border-bottom: 1px solid rgb(var(--ui-border));
}
.ie-trail-item:last-child {
  border-bottom: none;
}
.ie-trail-dot {
  flex-shrink: 0;
  width: 9px;
  height: 9px;
  margin-top: 5px;
  border-radius: 50%;
  background: rgb(var(--ui-faint));
}
.ie-trail-item[data-ok="true"] .ie-trail-dot {
  background: rgb(var(--ui-ok));
}
.ie-trail-item[data-ok="false"] .ie-trail-dot {
  background: rgb(var(--ui-danger));
}
.ie-trail-body {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
  flex: 1 1 auto;
}
.ie-trail-line {
  display: flex;
  align-items: baseline;
  gap: var(--ui-space-2);
  min-width: 0;
}
.ie-trail-method {
  flex-shrink: 0;
  font-size: var(--ui-text-xs);
  font-weight: 700;
  color: rgb(var(--ui-accent-strong));
}
.ie-trail-method[data-method="DELETE"] {
  color: rgb(var(--ui-danger));
}
.ie-trail-method[data-method="POST"],
.ie-trail-method[data-method="PUT"],
.ie-trail-method[data-method="PATCH"] {
  color: rgb(var(--ui-warn));
}
.ie-trail-path {
  font-size: var(--ui-text-xs);
  color: rgb(var(--ui-fg));
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ie-trail-meta {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
  font-size: var(--ui-text-xs);
  color: rgb(var(--ui-muted));
}
.ie-trail-status[data-ok="true"] {
  color: rgb(var(--ui-ok));
  font-weight: 600;
}
.ie-trail-status[data-ok="false"] {
  color: rgb(var(--ui-danger));
  font-weight: 600;
}
.ie-trail-sep {
  color: rgb(var(--ui-faint));
}

/* ----- modal de detalhes do teste ----- */
.ie-modal {
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-4);
}
.ie-modal-meta {
  margin: 0;
  display: flex;
  flex-direction: column;
}
.ie-modal-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--ui-space-4);
  padding: var(--ui-space-2) 0;
  border-bottom: 1px solid rgb(var(--ui-border));
}
.ie-modal-row:last-child {
  border-bottom: none;
}
.ie-modal-row dt {
  font-size: var(--ui-text-xs);
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: rgb(var(--ui-muted));
  flex-shrink: 0;
}
.ie-modal-row dd {
  margin: 0;
  font-size: var(--ui-text-sm);
  color: rgb(var(--ui-fg));
  text-align: right;
  min-width: 0;
}
.ie-modal-wrap {
  word-break: break-all;
}
.ie-modal-redacted {
  display: flex;
  align-items: flex-start;
  gap: var(--ui-space-2);
  margin: 0;
  padding: var(--ui-space-3) var(--ui-space-4);
  border-radius: var(--ui-radius-md);
  background: rgb(var(--ui-info) / 0.08);
  border: 1px solid rgb(var(--ui-info) / 0.3);
  font-size: var(--ui-text-xs);
  color: rgb(var(--ui-fg));
  line-height: 1.45;
}
.ie-modal-redacted-mark {
  flex-shrink: 0;
  color: rgb(var(--ui-info));
  font-size: var(--ui-text-md);
  line-height: 1.2;
}
.ie-modal-resp {
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-2);
}
.ie-modal-resp-label {
  margin: 0;
  font-size: var(--ui-text-xs);
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: rgb(var(--ui-muted));
}
.ie-modal-pre {
  margin: 0;
  padding: var(--ui-space-3) var(--ui-space-4);
  background: rgb(var(--ui-surface-2));
  border: 1px solid rgb(var(--ui-border));
  border-radius: var(--ui-radius-md);
  font-size: var(--ui-text-xs);
  color: rgb(var(--ui-fg));
  line-height: 1.5;
  overflow-x: auto;
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 280px;
}

/* responsivo */
@media (max-width: 960px) {
  .ie-grid {
    grid-template-columns: 1fr;
  }
  .ie-side {
    position: static;
  }
}
@media (max-width: 640px) {
  .ie-status {
    grid-template-columns: 1fr;
  }
  .ie-identity-badges {
    width: 100%;
  }
  .ie-submitbar {
    align-items: stretch;
  }
  .ie-submitbar-actions {
    width: 100%;
  }
  .ie-submitbar-actions :deep(.ui-btn) {
    flex: 1 1 auto;
  }
}
</style>
