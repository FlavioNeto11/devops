<template>
  <UiPageLayout
    eyebrow="StockPilot — Integrações"
    title="Novo fornecedor"
    subtitle="Conecte um gateway externo de fornecedor para envio automático de pedidos de reposição."
    width="default"
  >
    <template #actions>
      <UiButton variant="ghost" @click="goBack">
        <template #icon-left><span class="sc-ico" aria-hidden="true">←</span></template>
        Voltar aos fornecedores
      </UiButton>
    </template>

    <div class="sc-grid">
      <!-- Coluna principal: formulário -->
      <div class="sc-main">
        <!-- ValidationSummary: só após tentativa de envio com erros -->
        <UiCard v-if="showSummary" class="sc-summary" data-tone="danger">
          <div class="sc-banner-head">
            <span class="sc-banner-ico" aria-hidden="true">!</span>
            <div>
              <p class="sc-banner-title">Revise os campos destacados</p>
              <p class="sc-banner-sub">
                {{ errorList.length }}
                {{ errorList.length === 1 ? 'campo precisa' : 'campos precisam' }}
                de atenção antes de salvar.
              </p>
            </div>
          </div>
          <ul class="sc-summary-list">
            <li v-for="item in errorList" :key="item.key">
              <button type="button" class="sc-summary-link" @click="focusField(item.key)">
                {{ item.label }}: {{ item.message }}
              </button>
            </li>
          </ul>
        </UiCard>

        <!-- Banner de erro de API (falha no POST) -->
        <UiCard v-if="submitError" class="sc-apierror" data-tone="danger">
          <div class="sc-banner-head">
            <span class="sc-banner-ico" aria-hidden="true">×</span>
            <div>
              <p class="sc-banner-title">Não foi possível salvar o fornecedor</p>
              <p class="sc-banner-sub">{{ submitError }}</p>
            </div>
          </div>
          <div class="sc-banner-actions">
            <UiButton variant="subtle" size="sm" @click="submit">Tentar novamente</UiButton>
          </div>
        </UiCard>

        <UiCard title="Dados do fornecedor" subtitle="Os campos com * são obrigatórios.">
          <form novalidate @submit.prevent="submit">
            <!-- ===================== Identificação ===================== -->
            <UiFormSection
              title="Identificação"
              description="Como o fornecedor aparece nas integrações e na auditoria."
              :columns="2"
            >
              <UiFormField
                label="Nome do fornecedor"
                :required="true"
                :error="f.errors.name"
                hint="Ex.: Distribuidora Central"
                full-width
              >
                <template #default="{ id, describedBy, hasError }">
                  <input
                    :id="id"
                    ref="nameInput"
                    type="text"
                    :value="f.values.name"
                    :aria-describedby="describedBy"
                    :aria-invalid="hasError ? 'true' : null"
                    placeholder="Nome do fornecedor externo"
                    autocomplete="off"
                    @input="f.setField('name', $event.target.value)"
                    @blur="f.validateField('name')"
                  />
                </template>
              </UiFormField>

              <UiFormField
                label="Contato"
                :error="f.errors.contact"
                hint="E-mail ou telefone do responsável. Ex.: contato@fornecedor.com"
                full-width
              >
                <template #default="{ id, describedBy, hasError }">
                  <input
                    :id="id"
                    ref="contactInput"
                    type="text"
                    :value="f.values.contact"
                    :aria-describedby="describedBy"
                    :aria-invalid="hasError ? 'true' : null"
                    placeholder="email@fornecedor.com ou (11) 99999-9999"
                    autocomplete="off"
                    @input="f.setField('contact', $event.target.value)"
                    @blur="f.validateField('contact')"
                  />
                </template>
              </UiFormField>

              <UiFormField
                label="Prazo de entrega (dias)"
                :error="f.errors.lead_time"
                hint="Dias corridos entre o pedido e a entrega. Ex.: 3"
              >
                <template #default="{ id, describedBy, hasError }">
                  <input
                    :id="id"
                    ref="leadTimeInput"
                    type="number"
                    inputmode="numeric"
                    min="0"
                    max="365"
                    step="1"
                    :value="f.values.lead_time"
                    :aria-describedby="describedBy"
                    :aria-invalid="hasError ? 'true' : null"
                    placeholder="3"
                    @input="f.setField('lead_time', $event.target.value)"
                    @blur="f.validateField('lead_time')"
                  />
                </template>
              </UiFormField>

              <UiFormField
                label="URL do gateway"
                :required="true"
                :error="f.errors.gateway_url"
                hint="Endpoint HTTPS que recebe os pedidos. Ex.: https://api.fornecedor.com/v1"
                full-width
              >
                <template #default="{ id, describedBy, hasError }">
                  <input
                    :id="id"
                    ref="gatewayInput"
                    type="url"
                    inputmode="url"
                    class="sc-mono"
                    :value="f.values.gateway_url"
                    :aria-describedby="describedBy"
                    :aria-invalid="hasError ? 'true' : null"
                    placeholder="https://"
                    autocomplete="off"
                    spellcheck="false"
                    @input="f.setField('gateway_url', $event.target.value)"
                    @blur="f.validateField('gateway_url')"
                  />
                </template>
              </UiFormField>

              <UiFormField
                label="Status"
                :error="f.errors.active"
                hint="Fornecedores inativos não recebem pedidos."
                full-width
              >
                <template #default="{ id, describedBy }">
                  <label class="sc-switch" :for="id">
                    <input
                      :id="id"
                      type="checkbox"
                      class="sc-switch-input"
                      :checked="f.values.active"
                      :aria-describedby="describedBy"
                      @change="f.setField('active', $event.target.checked)"
                    />
                    <span class="sc-switch-track" aria-hidden="true"><span class="sc-switch-thumb" /></span>
                    <span class="sc-switch-text">{{ f.values.active ? 'Ativo' : 'Inativo' }}</span>
                  </label>
                </template>
              </UiFormField>
            </UiFormSection>

            <!-- ===================== Autenticação ===================== -->
            <UiFormSection
              title="Autenticação"
              description="Defina como o StockPilot se autentica no gateway. Os segredos são enviados de forma segura e nunca exibidos novamente."
              :columns="2"
            >
              <UiFormField
                label="Tipo de autenticação"
                :required="true"
                :error="f.errors.auth_type"
                hint="Como as credenciais são apresentadas ao gateway."
                full-width
              >
                <template #default="{ id, describedBy, hasError }">
                  <select
                    :id="id"
                    ref="authTypeInput"
                    :value="f.values.auth_type"
                    :aria-describedby="describedBy"
                    :aria-invalid="hasError ? 'true' : null"
                    @change="onAuthTypeChange($event.target.value)"
                    @blur="f.validateField('auth_type')"
                  >
                    <option value="" disabled>Selecione…</option>
                    <option v-for="opt in authOptions" :key="opt.value" :value="opt.value">
                      {{ opt.label }}
                    </option>
                  </select>
                </template>
              </UiFormField>

              <!-- Aviso de segurança: segredos write-only -->
              <div class="sc-secrets-note" role="note">
                <span class="sc-secrets-ico" aria-hidden="true">🔒</span>
                <p>{{ secretGuidance }}</p>
              </div>

              <!-- api_key → uma chave -->
              <UiFormField
                v-if="f.values.auth_type === 'api_key'"
                label="API Key"
                :required="true"
                :error="f.errors.api_key"
                hint="Será criptografada no servidor. Não poderá ser visualizada depois — apenas substituída."
                full-width
              >
                <template #default="{ id, describedBy, hasError }">
                  <div class="sc-secret">
                    <input
                      :id="id"
                      ref="apiKeyInput"
                      :type="reveal.api_key ? 'text' : 'password'"
                      class="sc-mono sc-secret-input"
                      :value="f.values.api_key"
                      :aria-describedby="describedBy"
                      :aria-invalid="hasError ? 'true' : null"
                      placeholder="Cole a chave de API"
                      autocomplete="off"
                      spellcheck="false"
                      @input="f.setField('api_key', $event.target.value)"
                      @blur="f.validateField('api_key')"
                    />
                    <button
                      type="button"
                      class="sc-secret-toggle"
                      :aria-pressed="reveal.api_key ? 'true' : 'false'"
                      :aria-label="reveal.api_key ? 'Ocultar API Key' : 'Mostrar API Key'"
                      @click="toggleReveal('api_key')"
                    >
                      {{ reveal.api_key ? 'Ocultar' : 'Mostrar' }}
                    </button>
                  </div>
                </template>
              </UiFormField>

              <!-- bearer → token -->
              <UiFormField
                v-if="f.values.auth_type === 'bearer'"
                label="Bearer token"
                :required="true"
                :error="f.errors.bearer_token"
                hint="Enviado como cabeçalho Authorization: Bearer. Criptografado e nunca exibido depois."
                full-width
              >
                <template #default="{ id, describedBy, hasError }">
                  <div class="sc-secret">
                    <input
                      :id="id"
                      ref="bearerTokenInput"
                      :type="reveal.bearer_token ? 'text' : 'password'"
                      class="sc-mono sc-secret-input"
                      :value="f.values.bearer_token"
                      :aria-describedby="describedBy"
                      :aria-invalid="hasError ? 'true' : null"
                      placeholder="Cole o token"
                      autocomplete="off"
                      spellcheck="false"
                      @input="f.setField('bearer_token', $event.target.value)"
                      @blur="f.validateField('bearer_token')"
                    />
                    <button
                      type="button"
                      class="sc-secret-toggle"
                      :aria-pressed="reveal.bearer_token ? 'true' : 'false'"
                      :aria-label="reveal.bearer_token ? 'Ocultar token' : 'Mostrar token'"
                      @click="toggleReveal('bearer_token')"
                    >
                      {{ reveal.bearer_token ? 'Ocultar' : 'Mostrar' }}
                    </button>
                  </div>
                </template>
              </UiFormField>

              <!-- basic → usuário + senha -->
              <UiFormField
                v-if="f.values.auth_type === 'basic'"
                label="Usuário"
                :required="true"
                :error="f.errors.basic_user"
                hint="Identidade de acesso (Basic Auth)."
              >
                <template #default="{ id, describedBy, hasError }">
                  <input
                    :id="id"
                    ref="basicUserInput"
                    type="text"
                    :value="f.values.basic_user"
                    :aria-describedby="describedBy"
                    :aria-invalid="hasError ? 'true' : null"
                    placeholder="usuario"
                    autocomplete="off"
                    spellcheck="false"
                    @input="f.setField('basic_user', $event.target.value)"
                    @blur="f.validateField('basic_user')"
                  />
                </template>
              </UiFormField>

              <UiFormField
                v-if="f.values.auth_type === 'basic'"
                label="Senha"
                :required="true"
                :error="f.errors.basic_password"
                hint="Criptografada no servidor. Não poderá ser visualizada depois."
              >
                <template #default="{ id, describedBy, hasError }">
                  <div class="sc-secret">
                    <input
                      :id="id"
                      ref="basicPasswordInput"
                      :type="reveal.basic_password ? 'text' : 'password'"
                      class="sc-secret-input"
                      :value="f.values.basic_password"
                      :aria-describedby="describedBy"
                      :aria-invalid="hasError ? 'true' : null"
                      placeholder="••••••••"
                      autocomplete="new-password"
                      @input="f.setField('basic_password', $event.target.value)"
                      @blur="f.validateField('basic_password')"
                    />
                    <button
                      type="button"
                      class="sc-secret-toggle"
                      :aria-pressed="reveal.basic_password ? 'true' : 'false'"
                      :aria-label="reveal.basic_password ? 'Ocultar senha' : 'Mostrar senha'"
                      @click="toggleReveal('basic_password')"
                    >
                      {{ reveal.basic_password ? 'Ocultar' : 'Mostrar' }}
                    </button>
                  </div>
                </template>
              </UiFormField>

              <!-- none → sem segredo -->
              <div v-if="f.values.auth_type === 'none'" class="sc-noauth" role="note">
                <span class="sc-noauth-ico" aria-hidden="true">○</span>
                <p>Sem autenticação. O gateway será chamado sem credenciais — use apenas em endpoints públicos ou internos confiáveis.</p>
              </div>
            </UiFormSection>

            <!-- ===================== Resiliência ===================== -->
            <UiFormSection
              title="Resiliência da conexão"
              description="Limites usados pelo gateway resiliente ao enviar pedidos (REQ-STOCKPILOT-0004)."
              :columns="2"
            >
              <UiFormField
                label="Timeout (ms)"
                :error="f.errors.timeout_ms"
                hint="Tempo máximo por tentativa. Padrão: 5000."
              >
                <template #default="{ id, describedBy, hasError }">
                  <input
                    :id="id"
                    ref="timeoutInput"
                    type="number"
                    inputmode="numeric"
                    min="100"
                    max="120000"
                    step="100"
                    :value="f.values.timeout_ms"
                    :aria-describedby="describedBy"
                    :aria-invalid="hasError ? 'true' : null"
                    placeholder="5000"
                    @input="f.setField('timeout_ms', $event.target.value)"
                    @blur="f.validateField('timeout_ms')"
                  />
                </template>
              </UiFormField>

              <UiFormField
                label="Máx. tentativas"
                :error="f.errors.max_retries"
                hint="Reenvios em caso de falha (retry/backoff). Padrão: 3."
              >
                <template #default="{ id, describedBy, hasError }">
                  <input
                    :id="id"
                    ref="retriesInput"
                    type="number"
                    inputmode="numeric"
                    min="0"
                    max="10"
                    step="1"
                    :value="f.values.max_retries"
                    :aria-describedby="describedBy"
                    :aria-invalid="hasError ? 'true' : null"
                    placeholder="3"
                    @input="f.setField('max_retries', $event.target.value)"
                    @blur="f.validateField('max_retries')"
                  />
                </template>
              </UiFormField>
            </UiFormSection>

            <!-- ===================== Observações ===================== -->
            <UiFormSection
              title="Observações"
              description="Anotações internas (opcional)."
              :columns="1"
            >
              <UiFormField
                label="Observações"
                :error="f.errors.notes"
                hint="Contato, particularidades de integração, SLA…"
                full-width
              >
                <template #default="{ id, describedBy, hasError }">
                  <textarea
                    :id="id"
                    ref="notesInput"
                    :value="f.values.notes"
                    :aria-describedby="describedBy"
                    :aria-invalid="hasError ? 'true' : null"
                    placeholder="Notas internas sobre este fornecedor"
                    rows="4"
                    @input="f.setField('notes', $event.target.value)"
                    @blur="f.validateField('notes')"
                  ></textarea>
                </template>
              </UiFormField>
            </UiFormSection>

            <!-- ===================== FormActions ===================== -->
            <div class="sc-actions">
              <UiButton variant="ghost" type="button" :disabled="f.submitting.value" @click="cancel">
                Cancelar
              </UiButton>
              <UiButton type="submit" :loading="f.submitting.value">
                {{ f.submitting.value ? 'Salvando…' : 'Salvar fornecedor' }}
              </UiButton>
            </div>
          </form>
        </UiCard>
      </div>

      <!-- Coluna lateral: prévia + recentes -->
      <aside class="sc-aside">
        <UiCard title="Prévia da conexão" subtitle="Como o fornecedor será registrado.">
          <dl class="sc-preview">
            <div class="sc-preview-row">
              <dt>Fornecedor</dt>
              <dd>{{ f.values.name || '—' }}</dd>
            </div>
            <div class="sc-preview-row">
              <dt>Contato</dt>
              <dd>{{ f.values.contact || '—' }}</dd>
            </div>
            <div class="sc-preview-row">
              <dt>Prazo de entrega</dt>
              <dd>{{ f.values.lead_time !== '' ? f.values.lead_time + ' dias' : '—' }}</dd>
            </div>
            <div class="sc-preview-row">
              <dt>Gateway</dt>
              <dd class="sc-mono sc-preview-url">{{ f.values.gateway_url || '—' }}</dd>
            </div>
            <div class="sc-preview-row">
              <dt>Autenticação</dt>
              <dd>{{ authLabel }}</dd>
            </div>
            <div class="sc-preview-row">
              <dt>Credencial</dt>
              <dd>
                <UiStatusBadge
                  :status="secretReady ? 'OK' : 'pending'"
                  :tone="secretReady ? 'success' : 'neutral'"
                  :label="secretReady ? 'Pronta' : (needsSecret ? 'Pendente' : 'Não requer')"
                  with-dot
                  size="sm"
                />
              </dd>
            </div>
            <div class="sc-preview-row">
              <dt>Resiliência</dt>
              <dd>{{ resilienceSummary }}</dd>
            </div>
            <div class="sc-preview-row">
              <dt>Status</dt>
              <dd>
                <UiStatusBadge
                  :status="f.values.active ? 'active' : 'inactive'"
                  :tone="f.values.active ? 'success' : 'neutral'"
                  :label="f.values.active ? 'Ativo' : 'Inativo'"
                  with-dot
                  size="sm"
                />
              </dd>
            </div>
          </dl>
          <p class="sc-preview-note">{{ secretGuidance }}</p>
        </UiCard>

        <UiCard title="Fornecedores recentes">
          <UiLoadingState v-if="recent.loading" variant="skeleton" :skeleton-lines="3" />
          <UiErrorState
            v-else-if="recent.error"
            :message="recent.error"
            :retryable="true"
            @retry="loadRecent"
          />
          <UiEmptyState
            v-else-if="!recent.items.length"
            title="Nenhum fornecedor ainda"
            description="Este será o primeiro gateway de fornecedor conectado."
            icon="🔌"
          >
            <template #action>
              <UiButton variant="subtle" size="sm" to="/suppliers">Ver fornecedores</UiButton>
            </template>
          </UiEmptyState>
          <ul v-else class="sc-recent">
            <li v-for="s in recent.items" :key="s.id" class="sc-recent-item">
              <button type="button" class="sc-recent-link" @click="openSupplier(s)">
                <span class="sc-recent-name">{{ s.name || ('Fornecedor #' + s.id) }}</span>
                <span class="sc-recent-meta">
                  <span class="sc-recent-auth">{{ authLabelFor(s.auth_type) }}</span>
                  <UiStatusBadge
                    :status="s.active === false ? 'inactive' : 'active'"
                    :tone="s.active === false ? 'neutral' : 'success'"
                    :label="s.active === false ? 'Inativo' : 'Ativo'"
                    with-dot
                    size="sm"
                  />
                </span>
              </button>
            </li>
          </ul>
        </UiCard>
      </aside>
    </div>
  </UiPageLayout>
</template>

<script setup>
import { ref, reactive, computed } from 'vue';
import { useRouter } from 'vue-router';
import {
  UiPageLayout,
  UiCard,
  UiButton,
  UiFormSection,
  UiFormField,
  UiStatusBadge,
  UiLoadingState,
  UiErrorState,
  UiEmptyState,
  useForm,
  useToast,
  useConfirm,
  validators,
} from '../ui/index.js';
import { suppliers } from '../api.js';

const router = useRouter();
const toast = useToast();
const ask = useConfirm();

// Rotas de DOMÍNIO (só rotas reais do inventário).
const SUPPLIERS_ROUTE = '/suppliers';

// ---- opções de autenticação (espelha o enum do domínio) ----------------------
const authOptions = [
  { value: 'api_key', label: 'API Key (cabeçalho)' },
  { value: 'bearer', label: 'Bearer token' },
  { value: 'basic', label: 'Basic (usuário e senha)' },
  { value: 'none', label: 'Sem autenticação' },
];
const AUTH_LABELS = {
  api_key: 'API Key',
  bearer: 'Bearer token',
  basic: 'Basic Auth',
  none: 'Sem autenticação',
};
function authLabelFor(t) {
  return AUTH_LABELS[String(t || '').toLowerCase()] || '—';
}

// ---- refs de campo (foco a partir do ValidationSummary) ----------------------
const nameInput = ref(null);
const contactInput = ref(null);
const leadTimeInput = ref(null);
const gatewayInput = ref(null);
const authTypeInput = ref(null);
const apiKeyInput = ref(null);
const bearerTokenInput = ref(null);
const basicUserInput = ref(null);
const basicPasswordInput = ref(null);
const timeoutInput = ref(null);
const retriesInput = ref(null);
const notesInput = ref(null);
const fieldRefs = {
  name: nameInput,
  contact: contactInput,
  lead_time: leadTimeInput,
  gateway_url: gatewayInput,
  auth_type: authTypeInput,
  api_key: apiKeyInput,
  bearer_token: bearerTokenInput,
  basic_user: basicUserInput,
  basic_password: basicPasswordInput,
  timeout_ms: timeoutInput,
  max_retries: retriesInput,
  notes: notesInput,
};
const fieldLabels = {
  name: 'Nome do fornecedor',
  contact: 'Contato',
  lead_time: 'Prazo de entrega (dias)',
  gateway_url: 'URL do gateway',
  auth_type: 'Tipo de autenticação',
  api_key: 'API Key',
  bearer_token: 'Bearer token',
  basic_user: 'Usuário',
  basic_password: 'Senha',
  timeout_ms: 'Timeout (ms)',
  max_retries: 'Máx. tentativas',
  notes: 'Observações',
};

// ---- validação condicional dos segredos por tipo de auth ---------------------
const requireForApiKey = (msg) => (v, all) =>
  all && all.auth_type === 'api_key' ? validators.required(msg)(v) : '';
const requireForBearer = (msg) => (v, all) =>
  all && all.auth_type === 'bearer' ? validators.required(msg)(v) : '';
const requireForBasic = (msg) => (v, all) =>
  all && all.auth_type === 'basic' ? validators.required(msg)(v) : '';

// ---- formulário --------------------------------------------------------------
const f = useForm({
  initial: {
    name: '',
    contact: '',
    lead_time: '',
    gateway_url: '',
    auth_type: '',
    api_key: '',
    bearer_token: '',
    basic_user: '',
    basic_password: '',
    timeout_ms: '',
    max_retries: '',
    active: true,
    notes: '',
  },
  rules: {
    name: [validators.required('Informe o nome do fornecedor'), validators.minLen(2)],
    contact: [validators.maxLen(255)],
    lead_time: [
      validators.numeric('Use apenas números'),
      validators.min(0, 'Não pode ser negativo'),
      validators.max(365, 'Máximo de 365 dias'),
    ],
    gateway_url: [
      validators.required('Informe a URL do gateway'),
      validators.pattern(/^https?:\/\/.+/i, 'Use uma URL http(s) válida'),
      validators.maxLen(2048),
    ],
    auth_type: [validators.required('Selecione o tipo de autenticação')],
    api_key: [requireForApiKey('Informe a API Key')],
    bearer_token: [requireForBearer('Informe o token')],
    basic_user: [requireForBasic('Informe o usuário')],
    basic_password: [requireForBasic('Informe a senha')],
    timeout_ms: [
      validators.numeric('Use apenas números'),
      validators.min(100, 'Mínimo de 100 ms'),
      validators.max(120000, 'Máximo de 120000 ms'),
    ],
    max_retries: [
      validators.numeric('Use apenas números'),
      validators.min(0, 'Não pode ser negativo'),
      validators.max(10, 'Máximo de 10 tentativas'),
    ],
    notes: [validators.maxLen(1000)],
  },
});

// ---- revelar/ocultar segredos ------------------------------------------------
const reveal = reactive({ api_key: false, bearer_token: false, basic_password: false });
function toggleReveal(key) {
  reveal[key] = !reveal[key];
}

// Ao trocar o tipo de auth, limpa os segredos de outros tipos (evita vazar valores não usados).
function onAuthTypeChange(value) {
  f.setField('auth_type', value);
  reveal.api_key = false;
  reveal.bearer_token = false;
  reveal.basic_password = false;
  if (value !== 'api_key') f.setField('api_key', '');
  if (value !== 'bearer') f.setField('bearer_token', '');
  if (value !== 'basic') {
    f.setField('basic_user', '');
    f.setField('basic_password', '');
  }
}

// ---- estado derivado ---------------------------------------------------------
const submitError = ref('');

const errorList = computed(() =>
  Object.keys(fieldLabels)
    .filter((k) => f.errors[k])
    .map((k) => ({ key: k, label: fieldLabels[k], message: f.errors[k] }))
);
const showSummary = computed(() => errorList.value.length > 0);

const authLabel = computed(() => AUTH_LABELS[f.values.auth_type] || '—');

const needsSecret = computed(() =>
  ['api_key', 'bearer', 'basic'].includes(f.values.auth_type)
);
const secretReady = computed(() => {
  if (f.values.auth_type === 'api_key') return !!f.values.api_key;
  if (f.values.auth_type === 'bearer') return !!f.values.bearer_token;
  if (f.values.auth_type === 'basic') return !!(f.values.basic_user && f.values.basic_password);
  if (f.values.auth_type === 'none') return true;
  return false;
});

const SECRET_GUIDANCE = {
  api_key: 'A API Key é criptografada no servidor e nunca exibida novamente — só poderá ser substituída.',
  bearer: 'O token é criptografado no servidor e nunca exibido novamente — só poderá ser substituído.',
  basic: 'A senha é criptografada no servidor e nunca exibida novamente — só poderá ser substituída.',
  none: 'Nenhuma credencial será armazenada para este fornecedor.',
  '': 'Escolha o tipo de autenticação para informar as credenciais. Segredos são enviados com segurança e nunca exibidos depois.',
};
const secretGuidance = computed(() => SECRET_GUIDANCE[f.values.auth_type] ?? SECRET_GUIDANCE['']);

const resilienceSummary = computed(() => {
  const t = f.values.timeout_ms === '' ? 5000 : f.values.timeout_ms;
  const r = f.values.max_retries === '' ? 3 : f.values.max_retries;
  return t + ' ms · ' + r + (Number(r) === 1 ? ' tentativa' : ' tentativas');
});

const isDirty = computed(() =>
  !!(
    f.values.name ||
    f.values.contact ||
    f.values.lead_time !== '' ||
    f.values.gateway_url ||
    f.values.auth_type ||
    f.values.api_key ||
    f.values.bearer_token ||
    f.values.basic_user ||
    f.values.basic_password ||
    f.values.notes ||
    f.values.timeout_ms !== '' ||
    f.values.max_retries !== ''
  )
);

// ---- fornecedores recentes (estado de dados completo) ------------------------
const recent = reactive({ items: [], loading: false, error: '' });
async function loadRecent() {
  recent.loading = true;
  recent.error = '';
  try {
    const r = await suppliers.list({ pageSize: 5 });
    recent.items = (r.data || []).slice(0, 5);
  } catch (e) {
    recent.error = e && e.message ? e.message : 'Falha ao carregar fornecedores.';
  } finally {
    recent.loading = false;
  }
}
loadRecent();

// ---- ações -------------------------------------------------------------------
function focusField(key) {
  const r = fieldRefs[key];
  if (r && r.value && typeof r.value.focus === 'function') r.value.focus();
}

function openSupplier(s) {
  if (s && s.id != null) router.push(SUPPLIERS_ROUTE + '/' + s.id);
  else router.push(SUPPLIERS_ROUTE);
}

function goBack() {
  router.push(SUPPLIERS_ROUTE);
}

async function cancel() {
  if (isDirty.value) {
    const ok = await ask({
      title: 'Descartar cadastro?',
      message: 'Você preencheu campos que ainda não foram salvos. Sair agora descarta o fornecedor (e quaisquer segredos digitados).',
      confirmLabel: 'Descartar',
      cancelLabel: 'Continuar editando',
      danger: true,
    });
    if (!ok) return;
  }
  router.push(SUPPLIERS_ROUTE);
}

function buildPayload(vals) {
  const payload = {
    name: String(vals.name).trim(),
    contact: vals.contact ? String(vals.contact).trim() : null,
    lead_time: vals.lead_time === '' ? null : Number(vals.lead_time),
    gateway_url: String(vals.gateway_url).trim(),
    auth_type: vals.auth_type,
    active: !!vals.active,
    notes: vals.notes ? String(vals.notes).trim() : null,
    timeout_ms: vals.timeout_ms === '' ? null : Number(vals.timeout_ms),
    max_retries: vals.max_retries === '' ? null : Number(vals.max_retries),
  };
  // Segredos: apenas o do tipo selecionado, e só quando presentes (write-only).
  if (vals.auth_type === 'api_key' && vals.api_key) {
    payload.api_key = String(vals.api_key);
  } else if (vals.auth_type === 'bearer' && vals.bearer_token) {
    payload.bearer_token = String(vals.bearer_token);
  } else if (vals.auth_type === 'basic') {
    payload.basic_user = String(vals.basic_user).trim();
    if (vals.basic_password) payload.basic_password = String(vals.basic_password);
  }
  return payload;
}

function submit() {
  submitError.value = '';
  f.handleSubmit(async (vals) => {
    try {
      const payload = buildPayload(vals);
      const created = await suppliers.create(payload);
      toast.success('Fornecedor conectado', { detail: payload.name });
      router.push(
        created && created.id != null ? SUPPLIERS_ROUTE + '/' + created.id : SUPPLIERS_ROUTE
      );
    } catch (e) {
      const msg = e && e.message ? e.message : 'Erro inesperado ao salvar.';
      submitError.value = msg;
      toast.error('Falha ao conectar fornecedor', { detail: msg });
    }
  });
}
</script>

<style scoped>
.sc-ico {
  font-size: var(--ui-text-lg);
  line-height: 1;
}

.sc-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.7fr) minmax(0, 1fr);
  gap: var(--ui-space-5);
  align-items: start;
}

.sc-main,
.sc-aside {
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-4);
  min-width: 0;
}

/* ---- banners (validação / erro de API) ---- */
.sc-summary,
.sc-apierror {
  border-color: rgb(var(--ui-danger) / 0.45);
}

.sc-banner-head {
  display: flex;
  align-items: flex-start;
  gap: var(--ui-space-3);
}

.sc-banner-ico {
  flex-shrink: 0;
  width: 22px;
  height: 22px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--ui-radius-pill);
  background: rgb(var(--ui-danger) / 0.16);
  color: rgb(var(--ui-danger));
  font-weight: 800;
  font-size: var(--ui-text-sm);
  line-height: 1;
}

.sc-banner-title {
  margin: 0;
  font-weight: 700;
  color: rgb(var(--ui-fg));
}

.sc-banner-sub {
  margin: 2px 0 0;
  font-size: var(--ui-text-sm);
  color: rgb(var(--ui-muted));
}

.sc-banner-actions {
  margin-top: var(--ui-space-3);
  display: flex;
  justify-content: flex-end;
}

.sc-summary-list {
  list-style: none;
  margin: var(--ui-space-3) 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-1);
}

.sc-summary-link {
  background: none;
  border: none;
  padding: 0;
  font: inherit;
  text-align: left;
  cursor: pointer;
  color: rgb(var(--ui-danger));
  text-decoration: underline;
  text-underline-offset: 2px;
}

.sc-summary-link:hover {
  filter: brightness(1.08);
}

/* ---- toggle de status (switch acessível) ---- */
.sc-switch {
  display: inline-flex;
  align-items: center;
  gap: var(--ui-space-3);
  cursor: pointer;
  user-select: none;
}

.sc-switch-input {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: -1px;
  padding: 0;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
  border: 0;
}

.sc-switch-track {
  position: relative;
  width: 42px;
  height: 24px;
  border-radius: var(--ui-radius-pill);
  background: rgb(var(--ui-border-strong));
  transition: background 0.16s ease;
  flex-shrink: 0;
}

.sc-switch-thumb {
  position: absolute;
  top: 3px;
  left: 3px;
  width: 18px;
  height: 18px;
  border-radius: var(--ui-radius-pill);
  background: rgb(var(--ui-bg));
  transition: transform 0.16s ease;
}

.sc-switch-input:checked + .sc-switch-track {
  background: rgb(var(--ui-accent));
}

.sc-switch-input:checked + .sc-switch-track .sc-switch-thumb {
  transform: translateX(18px);
}

.sc-switch-input:focus-visible + .sc-switch-track {
  outline: 2px solid rgb(var(--ui-accent));
  outline-offset: 2px;
}

.sc-switch-text {
  font-weight: 600;
  color: rgb(var(--ui-fg));
  font-size: var(--ui-text-sm);
}

/* ---- nota de segredos ---- */
.sc-secrets-note {
  grid-column: 1 / -1;
  display: flex;
  align-items: flex-start;
  gap: var(--ui-space-2);
  padding: var(--ui-space-3);
  border-radius: var(--ui-radius-sm);
  background: rgb(var(--ui-accent) / 0.08);
  border: 1px solid rgb(var(--ui-accent) / 0.28);
}

.sc-secrets-ico {
  line-height: 1.2;
  flex-shrink: 0;
}

.sc-secrets-note p {
  margin: 0;
  font-size: var(--ui-text-sm);
  color: rgb(var(--ui-fg));
}

/* ---- campo de segredo (input + toggle mostrar/ocultar) ---- */
.sc-secret {
  display: flex;
  align-items: stretch;
  gap: var(--ui-space-2);
}

.sc-secret-input {
  flex: 1 1 auto;
  min-width: 0;
}

.sc-secret-toggle {
  flex-shrink: 0;
  background: rgb(var(--ui-surface-2));
  border: 1px solid rgb(var(--ui-border-strong));
  border-radius: var(--ui-radius-sm);
  color: rgb(var(--ui-fg));
  font: inherit;
  font-size: var(--ui-text-sm);
  font-weight: 600;
  padding: 0 var(--ui-space-3);
  cursor: pointer;
}

.sc-secret-toggle:hover {
  background: rgb(var(--ui-surface));
}

.sc-secret-toggle:focus-visible {
  outline: 2px solid rgb(var(--ui-accent));
  outline-offset: 2px;
}

/* ---- sem autenticação ---- */
.sc-noauth {
  grid-column: 1 / -1;
  display: flex;
  align-items: flex-start;
  gap: var(--ui-space-2);
  padding: var(--ui-space-3);
  border-radius: var(--ui-radius-sm);
  border: 1px dashed rgb(var(--ui-border-strong));
  background: rgb(var(--ui-surface-2));
}

.sc-noauth-ico {
  flex-shrink: 0;
  line-height: 1.2;
  color: rgb(var(--ui-muted));
  font-weight: 800;
}

.sc-noauth p {
  margin: 0;
  font-size: var(--ui-text-sm);
  color: rgb(var(--ui-muted));
}

/* ---- ações do formulário ---- */
.sc-actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--ui-space-2);
  margin-top: var(--ui-space-4);
  flex-wrap: wrap;
}

/* ---- prévia ---- */
.sc-preview {
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-3);
}

.sc-preview-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ui-space-3);
}

.sc-preview-row dt {
  color: rgb(var(--ui-muted));
  font-size: var(--ui-text-sm);
  flex-shrink: 0;
}

.sc-preview-row dd {
  margin: 0;
  font-weight: 600;
  color: rgb(var(--ui-fg));
  text-align: right;
  overflow-wrap: anywhere;
}

.sc-preview-url {
  font-size: var(--ui-text-xs);
}

.sc-preview-note {
  margin: var(--ui-space-4) 0 0;
  padding-top: var(--ui-space-3);
  border-top: 1px solid rgb(var(--ui-border));
  font-size: var(--ui-text-sm);
  color: rgb(var(--ui-muted));
}

/* ---- recentes ---- */
.sc-recent {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-1);
}

.sc-recent-item + .sc-recent-item {
  border-top: 1px solid rgb(var(--ui-border));
}

.sc-recent-link {
  width: 100%;
  background: none;
  border: none;
  font: inherit;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ui-space-3);
  padding: var(--ui-space-2) var(--ui-space-1);
  border-radius: var(--ui-radius-sm);
  text-align: left;
}

.sc-recent-link:hover {
  background: rgb(var(--ui-surface-2));
}

.sc-recent-name {
  font-weight: 600;
  color: rgb(var(--ui-fg));
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sc-recent-meta {
  display: inline-flex;
  align-items: center;
  gap: var(--ui-space-2);
  flex-shrink: 0;
}

.sc-recent-auth {
  font-size: var(--ui-text-xs);
  color: rgb(var(--ui-muted));
}

.sc-mono {
  font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace;
}

@media (max-width: 860px) {
  .sc-grid {
    grid-template-columns: 1fr;
  }
}
</style>
