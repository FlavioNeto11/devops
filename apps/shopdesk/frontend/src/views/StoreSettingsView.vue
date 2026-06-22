<template>
  <UiPageLayout
    eyebrow="ShopDesk"
    title="Configurações da loja"
    subtitle="Identidade do tenant, dados fiscais para NF-e, provedores e aparência. O que depende de credencial ausente é sinalizado como fail-closed."
    width="wide"
    :loading="firstLoad"
    loading-message="Carregando as configurações da loja…"
    :error="fatalError"
    @retry="loadAll"
  >
    <template #actions>
      <UiButton variant="ghost" size="sm" :loading="refreshing" @click="loadAll(true)">
        <template #icon-left><span aria-hidden="true">↻</span></template>
        Reavaliar provedores
      </UiButton>
      <UiButton size="sm" :loading="saving" @click="saveIdentity">Salvar identidade</UiButton>
    </template>

    <!-- Banner: integridade geral (quantos provedores ativos x fail-closed) -->
    <template #banner>
      <div class="set-banner" :data-tone="bannerTone" role="status">
        <span class="set-banner-dot" aria-hidden="true" />
        <span class="set-banner-text">
          <strong>{{ bannerTitle }}</strong>
          <span class="set-banner-detail">{{ bannerDetail }}</span>
        </span>
        <span v-if="lastUpdatedLabel" class="set-banner-updated ui-muted">Verificado {{ lastUpdatedLabel }}</span>
      </div>
    </template>

    <!-- ============================================================== -->
    <!-- 1. Identidade da loja (SettingsForm) — preferências locais       -->
    <!-- ============================================================== -->
    <UiCard
      title="Identidade da loja"
      subtitle="Nome, contato e marca exibidos nos documentos e na vitrine."
    >
      <template #actions>
        <UiStatusBadge
          :status="identityDirty ? 'pendente' : 'salvo'"
          :label="identityDirty ? 'Alterações não salvas' : 'Tudo salvo'"
          size="sm"
        />
      </template>

      <form class="set-form" novalidate @submit.prevent="saveIdentity">
        <UiFormSection
          title="Dados gerais"
          description="Estas preferências ficam guardadas neste navegador até existir um endpoint de configuração do tenant."
          :columns="2"
        >
          <UiFormField
            label="Nome fantasia da loja"
            required
            :error="identity.errors.name"
            hint="Aparece no topo e nos comprovantes."
          >
            <template #default="{ id, describedBy }">
              <input
                :id="id"
                type="text"
                autocomplete="organization"
                maxlength="80"
                :value="identity.values.name"
                :aria-describedby="describedBy"
                @input="identity.setField('name', $event.target.value)"
              />
            </template>
          </UiFormField>

          <UiFormField
            label="Razão social"
            :error="identity.errors.legal_name"
            hint="Nome jurídico registrado na Receita."
          >
            <template #default="{ id, describedBy }">
              <input
                :id="id"
                type="text"
                maxlength="120"
                :value="identity.values.legal_name"
                :aria-describedby="describedBy"
                @input="identity.setField('legal_name', $event.target.value)"
              />
            </template>
          </UiFormField>

          <UiFormField
            label="E-mail de contato"
            :error="identity.errors.email"
            hint="Usado em notificações e no rodapé fiscal."
          >
            <template #default="{ id, describedBy }">
              <input
                :id="id"
                type="email"
                autocomplete="email"
                :value="identity.values.email"
                :aria-describedby="describedBy"
                @input="identity.setField('email', $event.target.value)"
              />
            </template>
          </UiFormField>

          <UiFormField
            label="Telefone / WhatsApp"
            :error="identity.errors.phone"
            hint="Formato livre, ex.: (11) 90000-0000."
          >
            <template #default="{ id, describedBy }">
              <input
                :id="id"
                type="tel"
                autocomplete="tel"
                :value="identity.values.phone"
                :aria-describedby="describedBy"
                @input="identity.setField('phone', $event.target.value)"
              />
            </template>
          </UiFormField>

          <UiFormField
            label="Endereço da loja"
            hint="Logradouro, número, cidade/UF."
            full-width
          >
            <template #default="{ id, describedBy }">
              <input
                :id="id"
                type="text"
                maxlength="160"
                :value="identity.values.address"
                :aria-describedby="describedBy"
                @input="identity.setField('address', $event.target.value)"
              />
            </template>
          </UiFormField>
        </UiFormSection>

        <div class="set-form-actions">
          <UiButton
            variant="ghost"
            type="button"
            :disabled="!identityDirty || saving"
            @click="resetIdentity"
          >
            Descartar alterações
          </UiButton>
          <UiButton type="submit" :loading="saving" :disabled="!identityDirty">
            Salvar identidade
          </UiButton>
        </div>
      </form>
    </UiCard>

    <!-- ============================================================== -->
    <!-- 2. Dados fiscais (CNPJ para NF-e)                                -->
    <!-- ============================================================== -->
    <UiCard
      title="Dados fiscais (NF-e)"
      subtitle="CNPJ, inscrição estadual e ambiente de emissão da nota fiscal eletrônica."
    >
      <template #actions>
        <UiStatusBadge
          :status="fiscalReady ? 'pronto' : 'pendente'"
          :label="fiscalReady ? 'Apto a emitir' : 'Dados incompletos'"
          size="sm"
        />
      </template>

      <form class="set-form" novalidate @submit.prevent="saveFiscal">
        <UiFormSection title="Identificação fiscal" :columns="2">
          <UiFormField
            label="CNPJ"
            required
            :error="fiscal.errors.cnpj"
            hint="Apenas números ou no formato 00.000.000/0000-00."
          >
            <template #default="{ id, describedBy }">
              <input
                :id="id"
                class="ui-mono"
                type="text"
                inputmode="numeric"
                maxlength="18"
                placeholder="00.000.000/0000-00"
                :value="fiscal.values.cnpj"
                :aria-describedby="describedBy"
                @input="fiscal.setField('cnpj', $event.target.value)"
              />
            </template>
          </UiFormField>

          <UiFormField
            label="Inscrição estadual"
            :error="fiscal.errors.ie"
            hint="Informe ISENTO quando aplicável."
          >
            <template #default="{ id, describedBy }">
              <input
                :id="id"
                type="text"
                maxlength="20"
                :value="fiscal.values.ie"
                :aria-describedby="describedBy"
                @input="fiscal.setField('ie', $event.target.value)"
              />
            </template>
          </UiFormField>

          <UiFormField label="UF de emissão" :error="fiscal.errors.uf">
            <template #default="{ id, describedBy }">
              <select
                :id="id"
                :value="fiscal.values.uf"
                :aria-describedby="describedBy"
                @change="fiscal.setField('uf', $event.target.value)"
              >
                <option v-for="uf in UF_LIST" :key="uf" :value="uf">{{ uf }}</option>
              </select>
            </template>
          </UiFormField>

          <UiFormField
            label="Ambiente"
            hint="Homologação não gera nota com validade fiscal."
          >
            <template #default="{ id, describedBy }">
              <select
                :id="id"
                :value="fiscal.values.environment"
                :aria-describedby="describedBy"
                @change="fiscal.setField('environment', $event.target.value)"
              >
                <option value="homolog">Homologação (testes)</option>
                <option value="producao">Produção (válido)</option>
              </select>
            </template>
          </UiFormField>
        </UiFormSection>

        <p class="set-note" :data-tone="emitProvider.tone">
          <span class="set-note-ic" aria-hidden="true">{{ emitProvider.tone === 'ok' ? '✓' : '!' }}</span>
          <span>
            A emissão real depende do provedor fiscal configurado no backend
            (<span class="ui-mono">FISCAL_MODE</span>). Estado atual:
            <strong>{{ emitProvider.label }}</strong>.
          </span>
        </p>

        <div class="set-form-actions">
          <UiButton
            variant="ghost"
            type="button"
            :disabled="!fiscalDirty || saving"
            @click="resetFiscal"
          >
            Descartar
          </UiButton>
          <UiButton type="submit" :loading="saving" :disabled="!fiscalDirty">
            Salvar dados fiscais
          </UiButton>
        </div>
      </form>
    </UiCard>

    <!-- ============================================================== -->
    <!-- 3. Provedores (ProviderStatusList) — estados reais/fail-closed   -->
    <!-- ============================================================== -->
    <UiCard
      title="Provedores e integrações"
      subtitle="Pagamento, fiscal, canais de notificação e o assistente de IA. Credencial ausente trava a função (fail-closed)."
    >
      <template #actions>
        <UiButton variant="ghost" size="sm" :loading="refreshing" @click="loadAll(true)">Reavaliar</UiButton>
      </template>

      <!-- loading -->
      <UiLoadingState v-if="providersLoading" variant="skeleton" :skeleton-lines="5" />

      <!-- error (só quando nem a verificação de IA respondeu de forma conclusiva) -->
      <UiErrorState
        v-else-if="providersError"
        :message="providersError"
        @retry="loadAll"
      />

      <!-- empty (defensivo: nenhum provedor declarado) -->
      <UiEmptyState
        v-else-if="!providers.length"
        icon="🔌"
        title="Nenhum provedor declarado"
        description="Quando o backend declarar provedores, eles aparecem aqui com o status de cada credencial."
      />

      <!-- normal -->
      <ul v-else class="set-providers" aria-label="Lista de provedores">
        <li
          v-for="p in providers"
          :key="p.key"
          class="set-provider"
          :data-tone="p.tone"
        >
          <span class="set-provider-ic" aria-hidden="true">{{ p.icon }}</span>
          <div class="set-provider-main">
            <span class="set-provider-name">{{ p.name }}</span>
            <span class="set-provider-desc ui-muted">{{ p.desc }}</span>
            <span v-if="p.envHint" class="set-provider-env ui-mono ui-muted">{{ p.envHint }}</span>
          </div>
          <div class="set-provider-side">
            <UiStatusBadge :status="p.status" :tone="p.badgeTone" :label="p.statusLabel" />
            <UiButton
              v-if="p.action"
              size="sm"
              variant="subtle"
              @click="p.action.run"
            >{{ p.action.label }}</UiButton>
          </div>
        </li>
      </ul>

      <template #footer>
        <span class="set-foot ui-muted">
          O ShopDesk usa sandbox por padrão. Para ir a produção, configure as credenciais reais via
          Sealed Secrets — o frontend não enxerga segredos, apenas o estado verificável.
        </span>
      </template>
    </UiCard>

    <!-- ============================================================== -->
    <!-- 4. Aparência (ThemeToggle)                                       -->
    <!-- ============================================================== -->
    <UiCard
      title="Aparência"
      subtitle="Escolha o tema da interface. A preferência fica salva neste navegador."
    >
      <fieldset class="set-theme" aria-label="Tema da interface">
        <legend class="set-theme-legend">Tema</legend>
        <div class="set-theme-grid" role="radiogroup" aria-label="Modo de tema">
          <button
            v-for="(opt, i) in THEME_OPTIONS"
            :key="opt.value"
            :ref="(el) => setThemeRef(el, i)"
            type="button"
            class="set-theme-opt"
            :data-active="themeChoice === opt.value ? 'true' : null"
            role="radio"
            :aria-checked="themeChoice === opt.value ? 'true' : 'false'"
            :tabindex="themeChoice === opt.value ? 0 : -1"
            @click="setTheme(opt.value)"
            @keydown="onThemeKeydown($event, i)"
          >
            <span class="set-theme-ic" aria-hidden="true">{{ opt.icon }}</span>
            <span class="set-theme-label">{{ opt.label }}</span>
            <span class="set-theme-hint ui-muted">{{ opt.hint }}</span>
            <span v-if="themeChoice === opt.value" class="set-theme-check" aria-hidden="true">✓</span>
          </button>
        </div>
      </fieldset>
    </UiCard>
  </UiPageLayout>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue';
import * as api from '../api.js';
import {
  UiPageLayout,
  UiCard,
  UiButton,
  UiStatusBadge,
  UiFormField,
  UiFormSection,
  UiEmptyState,
  UiLoadingState,
  UiErrorState,
  useToast,
  useConfirm,
  useForm,
  validators,
} from '../ui/index.js';

const toast = useToast();
const askConfirm = useConfirm();

// ---------------------------------------------------------------------------
// Persistência local (preferências do tenant). NÃO há endpoint de config do
// tenant exposto no backend — não fabricamos um POST. Guardamos no navegador
// (ação REAL e funcional) e somos honestos sobre isso na UI.
// ---------------------------------------------------------------------------
const LS_IDENTITY = 'shopdesk.settings.identity';
const LS_FISCAL = 'shopdesk.settings.fiscal';
const LS_THEME = 'theme'; // mesma chave usada pelo UiAppShell

function readLS(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
function writeLS(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Saúde REAL do assistente de IA via GET /v1/assistant/health (api.store.assistantHealth).
// Único sinal verificável da tela: o backend reporta { ai: boolean } — fail-closed
// (sem ANTHROPIC_API_KEY → ai:false e /v1/assistant responde 503). É o cliente que
// controlamos, então chamamos direto, sem "descobrir" rota.
// ---------------------------------------------------------------------------
const assistantHealthFn = api.store.assistantHealth;
const assistantCheckable = typeof assistantHealthFn === 'function';

// ---------------------------------------------------------------------------
// Estado
// ---------------------------------------------------------------------------
const firstLoad = ref(true);
const refreshing = ref(false);
const saving = ref(false);
const fatalError = ref(null);
const lastChecked = ref(null);

const providersLoading = ref(false);
const providersError = ref(null);

// saúde da IA: null = desconhecido, true/false = verificado
const aiEnabled = ref(null);
const aiCheckable = ref(assistantCheckable);

// ---------------------------------------------------------------------------
// Formulários (kit useForm)
// ---------------------------------------------------------------------------
const UF_LIST = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG',
  'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO',
];

const cnpjRule = validators.pattern(
  /^(\d{14}|\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2})$/,
  'CNPJ deve ter 14 dígitos (com ou sem máscara).',
);

const identityDefaults = { name: 'Minha Loja', legal_name: '', email: '', phone: '', address: '' };
const fiscalDefaults = { cnpj: '', ie: '', uf: 'SP', environment: 'homolog' };

const identity = useForm({
  initial: { ...identityDefaults },
  rules: {
    name: [validators.required('Informe o nome da loja.'), validators.minLen(2)],
    legal_name: [validators.maxLen(120)],
    email: [validators.email()],
  },
});
const fiscal = useForm({
  initial: { ...fiscalDefaults },
  rules: {
    cnpj: [validators.required('Informe o CNPJ para emitir NF-e.'), cnpjRule],
    ie: [validators.maxLen(20)],
  },
});

// snapshots do que está persistido, para detectar "dirty"
const identitySaved = reactive({ ...identityDefaults });
const fiscalSaved = reactive({ ...fiscalDefaults });

function snapshotEquals(values, saved, keys) {
  return keys.every((k) => String(values[k] ?? '') === String(saved[k] ?? ''));
}
const identityKeys = Object.keys(identityDefaults);
const fiscalKeys = Object.keys(fiscalDefaults);

const identityDirty = computed(() => !snapshotEquals(identity.values, identitySaved, identityKeys));
const fiscalDirty = computed(() => !snapshotEquals(fiscal.values, fiscalSaved, fiscalKeys));

const fiscalReady = computed(
  () => !cnpjRule(fiscal.values.cnpj) && String(fiscal.values.cnpj || '').trim() !== '',
);

// ---------------------------------------------------------------------------
// Tema (ThemeToggle) — mesma mecânica do UiAppShell (data-theme + localStorage)
// ---------------------------------------------------------------------------
const THEME_OPTIONS = [
  { value: 'light', label: 'Claro', icon: '☀', hint: 'Fundo claro, ideal de dia.' },
  { value: 'dark', label: 'Escuro', icon: '☾', hint: 'Suave para ambientes com pouca luz.' },
  { value: 'system', label: 'Automático', icon: '🖥', hint: 'Segue a preferência do sistema.' },
];
const themeChoice = ref('system');

function systemPrefersDark() {
  return typeof matchMedia !== 'undefined' && matchMedia('(prefers-color-scheme: dark)').matches;
}
function applyThemeAttr(choice) {
  const dark = choice === 'dark' || (choice === 'system' && systemPrefersDark());
  if (typeof document !== 'undefined') {
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
  }
}
function setTheme(choice) {
  themeChoice.value = choice;
  applyThemeAttr(choice);
  try {
    if (choice === 'system') localStorage.removeItem(LS_THEME);
    else localStorage.setItem(LS_THEME, choice);
  } catch {
    /* localStorage indisponível — tema aplicado só nesta sessão */
  }
  toast.success(
    'Tema definido: ' + (THEME_OPTIONS.find((o) => o.value === choice)?.label || choice) + '.',
  );
}

// a11y — radiogroup WAI-ARIA: roving tabindex + navegação por setas.
// Guardamos os <button> do radiogroup para mover o foco programaticamente.
const themeRefs = ref([]);
function setThemeRef(el, i) {
  if (el) themeRefs.value[i] = el;
}
function onThemeKeydown(ev, i) {
  const last = THEME_OPTIONS.length - 1;
  let next = null;
  switch (ev.key) {
    case 'ArrowRight':
    case 'ArrowDown':
      next = i === last ? 0 : i + 1;
      break;
    case 'ArrowLeft':
    case 'ArrowUp':
      next = i === 0 ? last : i - 1;
      break;
    case 'Home':
      next = 0;
      break;
    case 'End':
      next = last;
      break;
    default:
      return; // Space/Enter já são tratados pelo @click nativo do <button>
  }
  ev.preventDefault();
  setTheme(THEME_OPTIONS[next].value); // selecionar segue o foco (padrão radiogroup)
  themeRefs.value[next]?.focus();
}

// ---------------------------------------------------------------------------
// Provedores derivados (ProviderStatusList)
// ---------------------------------------------------------------------------
const emitProvider = computed(() => ({
  // sem endpoint de config fiscal verificável no front: estado declarado = sandbox por padrão
  tone: 'warn',
  label: 'Sandbox (homologação) por padrão',
}));

const providers = computed(() => {
  const list = [];

  // Pagamento — sandbox por padrão; credencial real não é visível ao front (fail-closed honesto).
  list.push({
    key: 'payment',
    icon: '💳',
    name: 'Gateway de pagamento',
    desc: 'Checkout idempotente. Sandbox por padrão; PSP real exige credencial no backend.',
    envHint: 'PAYMENT_PROVIDER · PAYMENT_API_KEY',
    status: 'sandbox',
    badgeTone: 'warning',
    statusLabel: 'Sandbox',
    tone: 'warn',
    action: null,
  });

  // Fiscal (NF-e) — idem, sandbox por padrão.
  list.push({
    key: 'fiscal',
    icon: '🧾',
    name: 'Emissor de NF-e',
    desc: 'Emissão fiscal eletrônica. Em homologação não gera nota com validade.',
    envHint: 'FISCAL_MODE · FISCAL_ENVIRONMENT',
    status: 'sandbox',
    badgeTone: 'warning',
    statusLabel: 'Homologação',
    tone: 'warn',
    action: null,
  });

  // Canais de notificação — credenciais (webhooks) não verificáveis pelo front.
  for (const ch of [
    { key: 'notify-email', icon: '✉', name: 'Notificações — E-mail', env: 'NOTIFY_EMAIL_WEBHOOK_URL' },
    { key: 'notify-push', icon: '🔔', name: 'Notificações — Push', env: 'NOTIFY_PUSH_WEBHOOK_URL' },
    { key: 'notify-whatsapp', icon: '💬', name: 'Notificações — WhatsApp', env: 'NOTIFY_WHATSAPP_WEBHOOK_URL' },
  ]) {
    list.push({
      key: ch.key,
      icon: ch.icon,
      name: ch.name,
      desc: 'Degrada graciosamente: sem webhook configurado, o canal é ignorado.',
      envHint: ch.env,
      status: 'desconhecido',
      badgeTone: 'neutral',
      statusLabel: 'Não verificável',
      tone: 'unknown',
      action: null,
    });
  }

  // Assistente de IA — ESTE é verificável de verdade via /v1/assistant/health.
  let aiStatus, aiBadge, aiLabel, aiTone, aiDesc;
  if (!aiCheckable.value) {
    aiStatus = 'desconhecido';
    aiBadge = 'neutral';
    aiLabel = 'Não verificável';
    aiTone = 'unknown';
    aiDesc = 'Endpoint de verificação não disponível neste cliente.';
  } else if (aiEnabled.value === null) {
    aiStatus = 'verificando';
    aiBadge = 'running';
    aiLabel = 'Verificando…';
    aiTone = 'unknown';
    aiDesc = 'Consultando a saúde do assistente…';
  } else if (aiEnabled.value === true) {
    aiStatus = 'ativo';
    aiBadge = 'success';
    aiLabel = 'Ativo';
    aiTone = 'ok';
    aiDesc = 'ANTHROPIC_API_KEY presente — sugestões grounded habilitadas.';
  } else {
    aiStatus = 'fail-closed';
    aiBadge = 'error';
    aiLabel = 'Fail-closed';
    aiTone = 'fail';
    aiDesc = 'Sem ANTHROPIC_API_KEY — o assistente responde 503 (fail-closed).';
  }
  list.push({
    key: 'assistant',
    icon: '🤖',
    name: 'Assistente de IA',
    desc: aiDesc,
    envHint: 'ANTHROPIC_API_KEY',
    status: aiStatus,
    badgeTone: aiBadge,
    statusLabel: aiLabel,
    tone: aiTone,
    action: aiCheckable.value
      ? { label: 'Reverificar', run: () => checkAssistant(true) }
      : null,
  });

  return list;
});

// ---------------------------------------------------------------------------
// Banner agregado
// ---------------------------------------------------------------------------
const failClosedCount = computed(() => providers.value.filter((p) => p.tone === 'fail').length);
const activeCount = computed(() => providers.value.filter((p) => p.tone === 'ok').length);

const bannerTone = computed(() => {
  if (failClosedCount.value > 0) return 'error';
  if (activeCount.value > 0) return 'ok';
  return 'warn';
});
const bannerTitle = computed(() => {
  if (failClosedCount.value > 0) {
    return failClosedCount.value === 1
      ? '1 provedor em fail-closed.'
      : failClosedCount.value + ' provedores em fail-closed.';
  }
  if (activeCount.value > 0) return 'Provedores prontos.';
  return 'Operando em modo sandbox.';
});
const bannerDetail = computed(() => {
  if (failClosedCount.value > 0) {
    return 'Configure as credenciais ausentes no backend para habilitar as funções travadas.';
  }
  if (activeCount.value > 0) return 'As integrações com credencial verificável estão no ar.';
  return 'Nenhuma credencial de produção verificável — checkout e NF-e usam sandbox.';
});

const lastUpdatedLabel = computed(() =>
  lastChecked.value
    ? new Intl.DateTimeFormat('pt-BR', { timeStyle: 'short' }).format(lastChecked.value)
    : '',
);

// ---------------------------------------------------------------------------
// Carregamento
// ---------------------------------------------------------------------------
function hydrateForms() {
  const savedIdentity = readLS(LS_IDENTITY);
  if (savedIdentity && typeof savedIdentity === 'object') {
    Object.assign(identitySaved, { ...identityDefaults, ...savedIdentity });
  }
  for (const k of identityKeys) identity.setField(k, identitySaved[k] ?? '');

  const savedFiscal = readLS(LS_FISCAL);
  if (savedFiscal && typeof savedFiscal === 'object') {
    Object.assign(fiscalSaved, { ...fiscalDefaults, ...savedFiscal });
  }
  for (const k of fiscalKeys) fiscal.setField(k, fiscalSaved[k] ?? '');

  // limpa flags de "touched"/erros após hidratar
  resyncForm(identity, identitySaved, identityKeys);
  resyncForm(fiscal, fiscalSaved, fiscalKeys);
}

// reaplica valores e zera erros sem disparar validação
function resyncForm(form, saved, keys) {
  for (const k of keys) {
    form.values[k] = saved[k] ?? '';
    delete form.errors[k];
    delete form.touched[k];
  }
}

function hydrateTheme() {
  let pref = null;
  try {
    pref = localStorage.getItem(LS_THEME);
  } catch {
    /* ignore */
  }
  themeChoice.value = pref === 'dark' || pref === 'light' ? pref : 'system';
  applyThemeAttr(themeChoice.value);
}

async function checkAssistant(announce = false) {
  if (!assistantCheckable) {
    aiEnabled.value = null;
    return;
  }
  try {
    const r = await assistantHealthFn();
    // resposta esperada: { ai: boolean }
    aiEnabled.value = !!(r && (r.ai === true || r.enabled === true));
    providersError.value = null;
    if (announce) {
      toast.success(aiEnabled.value ? 'Assistente de IA ativo.' : 'Assistente em fail-closed (sem chave).');
    }
  } catch (e) {
    // health não conclusivo: marcamos como desconhecido, sem derrubar a tela
    aiEnabled.value = null;
    if (announce) toast.error(e.message || 'Não foi possível verificar o assistente.');
  }
}

async function loadAll(isRefresh = false) {
  if (isRefresh) refreshing.value = true;
  providersLoading.value = true;
  providersError.value = null;
  fatalError.value = null;
  try {
    if (firstLoad.value) {
      hydrateForms();
      hydrateTheme();
    }
    await checkAssistant(false);
    lastChecked.value = new Date();
    if (isRefresh) toast.success('Provedores reavaliados.');
  } catch (e) {
    fatalError.value = e.message || 'Não foi possível carregar as configurações.';
  } finally {
    providersLoading.value = false;
    refreshing.value = false;
    firstLoad.value = false;
  }
}

// ---------------------------------------------------------------------------
// Salvar / descartar
// ---------------------------------------------------------------------------
async function saveIdentity() {
  if (!identityDirty.value) {
    toast.info('Nenhuma alteração de identidade para salvar.');
    return;
  }
  if (!identity.validate()) {
    toast.error('Revise os campos destacados.');
    return;
  }
  saving.value = true;
  try {
    const payload = {};
    for (const k of identityKeys) payload[k] = identity.values[k] ?? '';
    const ok = writeLS(LS_IDENTITY, payload);
    if (!ok) throw new Error('Não foi possível gravar as preferências neste navegador.');
    Object.assign(identitySaved, payload);
    toast.success('Identidade da loja salva.');
  } catch (e) {
    toast.error(e.message || 'Falha ao salvar a identidade.');
  } finally {
    saving.value = false;
  }
}

async function saveFiscal() {
  if (!fiscalDirty.value) {
    toast.info('Nenhuma alteração fiscal para salvar.');
    return;
  }
  if (!fiscal.validate()) {
    toast.error('Revise os dados fiscais destacados.');
    return;
  }
  // Mudar para produção é sensível → confirmação.
  if (fiscal.values.environment === 'producao' && fiscalSaved.environment !== 'producao') {
    const ok = await askConfirm({
      title: 'Emitir em produção?',
      message:
        'Em produção as notas têm validade fiscal real. Confirme que o CNPJ e a inscrição estadual estão corretos.',
      confirmLabel: 'Confirmar produção',
      danger: true,
    });
    if (!ok) return;
  }
  saving.value = true;
  try {
    const payload = {};
    for (const k of fiscalKeys) payload[k] = fiscal.values[k] ?? '';
    const ok = writeLS(LS_FISCAL, payload);
    if (!ok) throw new Error('Não foi possível gravar os dados fiscais neste navegador.');
    Object.assign(fiscalSaved, payload);
    toast.success('Dados fiscais salvos.');
  } catch (e) {
    toast.error(e.message || 'Falha ao salvar os dados fiscais.');
  } finally {
    saving.value = false;
  }
}

function resetIdentity() {
  resyncForm(identity, identitySaved, identityKeys);
  toast.info('Alterações de identidade descartadas.');
}
function resetFiscal() {
  resyncForm(fiscal, fiscalSaved, fiscalKeys);
  toast.info('Alterações fiscais descartadas.');
}

onMounted(() => loadAll(false));
</script>

<style scoped>
/* ---- Banner agregado ---- */
.set-banner {
  display: flex;
  align-items: center;
  gap: var(--ui-space-3);
  flex-wrap: wrap;
  padding: var(--ui-space-3) var(--ui-space-4);
  border: 1px solid rgb(var(--ui-border));
  border-left: 3px solid rgb(var(--ui-faint));
  border-radius: var(--ui-radius-md);
  background: rgb(var(--ui-surface));
  font-size: var(--ui-text-sm);
}
.set-banner[data-tone="ok"] { border-left-color: rgb(var(--ui-ok)); }
.set-banner[data-tone="warn"] { border-left-color: rgb(var(--ui-warn)); }
.set-banner[data-tone="error"] { border-left-color: rgb(var(--ui-danger)); }
.set-banner-dot {
  width: var(--ui-space-2);
  height: var(--ui-space-2);
  border-radius: var(--ui-radius-pill);
  flex-shrink: 0;
  background: rgb(var(--ui-faint));
}
.set-banner[data-tone="ok"] .set-banner-dot { background: rgb(var(--ui-ok)); }
.set-banner[data-tone="warn"] .set-banner-dot { background: rgb(var(--ui-warn)); }
.set-banner[data-tone="error"] .set-banner-dot { background: rgb(var(--ui-danger)); }
.set-banner-text { display: flex; flex-direction: column; gap: 1px; color: rgb(var(--ui-fg)); }
.set-banner-detail { color: rgb(var(--ui-muted)); font-size: var(--ui-text-xs); }
.set-banner-updated { margin-left: auto; font-size: var(--ui-text-xs); }

/* ---- Formulários ---- */
/* Inputs/selects são estilizados pelo :deep(input/select/textarea) do UiFormField
   (mesmos tokens) — não reimplementamos borda/foco/padding aqui. */
.set-form { display: flex; flex-direction: column; gap: var(--ui-space-3); }
.set-form-actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--ui-space-2);
  flex-wrap: wrap;
  border-top: 1px solid rgb(var(--ui-border));
  padding-top: var(--ui-space-4);
}

/* ---- Nota inline (fiscal) ---- */
.set-note {
  display: flex;
  align-items: flex-start;
  gap: var(--ui-space-2);
  margin: 0;
  padding: var(--ui-space-3);
  border-radius: var(--ui-radius-md);
  background: rgb(var(--ui-surface-2));
  border: 1px solid rgb(var(--ui-border));
  font-size: var(--ui-text-sm);
  color: rgb(var(--ui-fg));
}
.set-note[data-tone="ok"] { border-left: 3px solid rgb(var(--ui-ok)); }
.set-note[data-tone="warn"] { border-left: 3px solid rgb(var(--ui-warn)); }
.set-note-ic {
  flex-shrink: 0;
  font-weight: 800;
  width: 18px;
  text-align: center;
}
.set-note[data-tone="ok"] .set-note-ic { color: rgb(var(--ui-ok)); }
.set-note[data-tone="warn"] .set-note-ic { color: rgb(var(--ui-warn)); }

/* ---- Lista de provedores ---- */
.set-providers { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; }
.set-provider {
  display: flex;
  align-items: center;
  gap: var(--ui-space-3);
  padding: var(--ui-space-3) 0;
  border-bottom: 1px solid rgb(var(--ui-border));
}
.set-provider:last-child { border-bottom: none; }
.set-provider-ic {
  flex-shrink: 0;
  /* avatar derivado de tokens: dois espaços-5 (24+24-ish) → caixa quadrada coerente com a escala */
  width: calc(var(--ui-space-5) + var(--ui-space-3));
  height: calc(var(--ui-space-5) + var(--ui-space-3));
  display: grid;
  place-items: center;
  font-size: var(--ui-text-lg);
  border-radius: var(--ui-radius-md);
  background: rgb(var(--ui-surface-2));
  border: 1px solid rgb(var(--ui-border));
}
.set-provider[data-tone="ok"] .set-provider-ic { border-color: rgb(var(--ui-ok) / 0.5); }
.set-provider[data-tone="warn"] .set-provider-ic { border-color: rgb(var(--ui-warn) / 0.5); }
.set-provider[data-tone="fail"] .set-provider-ic { border-color: rgb(var(--ui-danger) / 0.5); }
.set-provider-main { display: flex; flex-direction: column; gap: 1px; min-width: 0; flex: 1 1 auto; }
.set-provider-name { font-weight: 600; }
.set-provider-desc { font-size: var(--ui-text-sm); }
.set-provider-env { font-size: var(--ui-text-xs); }
.set-provider-side {
  display: flex;
  align-items: center;
  gap: var(--ui-space-2);
  flex-shrink: 0;
}

/* ---- Rodapé do card de provedores ---- */
.set-foot { font-size: var(--ui-text-xs); }

/* ---- Tema ---- */
.set-theme { border: none; padding: 0; margin: 0; min-inline-size: 0; }
.set-theme-legend {
  font-family: var(--ui-font-display);
  font-weight: 700;
  font-size: var(--ui-text-md);
  padding: 0;
  margin-bottom: var(--ui-space-3);
}
.set-theme-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--ui-space-3);
}
.set-theme-opt {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-1);
  text-align: left;
  padding: var(--ui-space-4);
  border: 1px solid rgb(var(--ui-border-strong));
  border-radius: var(--ui-radius-lg);
  background: rgb(var(--ui-surface));
  color: rgb(var(--ui-fg));
  cursor: pointer;
  font: inherit;
  transition: border-color .15s ease, box-shadow .15s ease, transform .15s ease;
}
.set-theme-opt:hover { border-color: rgb(var(--ui-accent)); transform: translateY(-2px); }
.set-theme-opt[data-active="true"] {
  border-color: rgb(var(--ui-accent));
  box-shadow: 0 0 0 1px rgb(var(--ui-accent));
  background: rgb(var(--ui-accent) / 0.08);
}
.set-theme-ic { font-size: var(--ui-text-xl); }
.set-theme-label { font-family: var(--ui-font-display); font-weight: 700; }
.set-theme-hint { font-size: var(--ui-text-xs); }
.set-theme-check {
  position: absolute;
  top: var(--ui-space-3);
  right: var(--ui-space-3);
  color: rgb(var(--ui-accent-strong));
  font-weight: 800;
}

/* ---- Responsivo ---- */
@media (max-width: 860px) {
  .set-theme-grid { grid-template-columns: 1fr; }
  .set-provider { flex-wrap: wrap; }
  .set-provider-side { width: 100%; justify-content: flex-end; }
  .set-banner-updated { margin-left: 0; }
}
</style>
