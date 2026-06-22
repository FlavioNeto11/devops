<template>
  <UiPageLayout
    eyebrow="Integrações"
    title="Nova integração"
    subtitle="Cadastre um gateway externo (e-mail, telefonia, webhook, central de terceiros ou chat). Todo o tráfego de saída do service desk passa por aqui — com timeout e tentativas (retry/backoff) controlados e auditados."
    width="narrow"
  >
    <template #actions>
      <UiButton variant="ghost" to="/integrations">Voltar às integrações</UiButton>
    </template>

    <!-- Banner auxiliar de nome duplicado (fail-soft, nunca bloqueia o cadastro) -->
    <template #banner>
      <div
        v-if="dupState === 'found'"
        class="hf-banner"
        role="status"
        aria-live="polite"
      >
        <div class="hf-banner-head">
          <span class="hf-banner-icon" aria-hidden="true">!</span>
          <div class="hf-banner-text">
            <p class="hf-banner-title">Já existe uma integração com nome parecido</p>
            <p class="hf-banner-sub">
              Para não duplicar gateways de saída, abra a existente em vez de criar outra —
              ou confirme que é mesmo uma nova integração.
            </p>
          </div>
          <UiButton variant="subtle" size="sm" @click="dismissDuplicates">Ignorar</UiButton>
        </div>
        <ul class="hf-dup-list">
          <li v-for="d in duplicates" :key="d.id" class="hf-dup-item">
            <div class="hf-dup-main">
              <RouterLink :to="'/integrations/' + d.id" class="hf-dup-name">{{ d.name }}</RouterLink>
              <span class="hf-dup-meta">{{ kindLabel(d.kind) }}{{ d.base_url ? ' · ' + d.base_url : '' }}</span>
            </div>
            <div class="hf-dup-side">
              <UiStatusBadge :status="d.status || 'active'" size="sm" />
              <UiButton variant="ghost" size="sm" :to="'/integrations/' + d.id">Abrir</UiButton>
            </div>
          </li>
        </ul>
      </div>
    </template>

    <UiCard>
      <form class="hf-form" novalidate @submit.prevent="submit">
        <!-- Identificação --------------------------------------------------->
        <UiFormSection
          title="Identificação"
          description="O nome aparece para a equipe ao rotear notificações e chamados pelo gateway. Use algo objetivo, como o provedor ou o canal."
          :columns="1"
        >
          <UiFormField
            label="Nome da integração"
            :required="true"
            :error="f.errors.name"
            :full-width="true"
            :hint="nameHint"
          >
            <template #default="{ id, describedBy }">
              <div class="hf-input-wrap">
                <input
                  :id="id"
                  type="text"
                  autocomplete="off"
                  :aria-describedby="describedBy"
                  :value="f.values.name"
                  placeholder="Ex.: SMTP transacional, Twilio voz, Webhook do CRM"
                  @input="onNameInput($event.target.value)"
                  @blur="checkDuplicates"
                />
                <span v-if="dupState === 'checking'" class="hf-input-spin" aria-hidden="true">
                  <span class="ui-spin" />
                </span>
              </div>
            </template>
          </UiFormField>

          <UiFormField
            label="Tipo de gateway"
            :required="true"
            :error="f.errors.kind"
            :full-width="true"
            hint="Define o canal de saída. Cada tipo tem requisitos próprios — alguns dispensam URL base."
          >
            <template #default="{ id, describedBy }">
              <div
                :id="id"
                class="hf-kinds"
                role="radiogroup"
                :aria-describedby="describedBy"
                aria-label="Tipo de gateway"
              >
                <button
                  v-for="opt in kindOptions"
                  :key="opt.value"
                  type="button"
                  class="hf-kind-opt"
                  role="radio"
                  :aria-checked="String(f.values.kind === opt.value)"
                  :data-active="f.values.kind === opt.value ? 'true' : 'false'"
                  @click="selectKind(opt.value)"
                >
                  <span class="hf-kind-icon" aria-hidden="true">{{ opt.icon }}</span>
                  <span class="hf-kind-text">
                    <span class="hf-kind-name">{{ opt.label }}</span>
                    <span class="hf-kind-desc">{{ opt.desc }}</span>
                  </span>
                  <span class="hf-kind-check" aria-hidden="true">✓</span>
                </button>
              </div>
            </template>
          </UiFormField>
        </UiFormSection>

        <!-- Conexão --------------------------------------------------------->
        <UiFormSection
          title="Conexão"
          :description="connectionDescription"
          :columns="1"
        >
          <UiFormField
            :label="urlRequired ? 'URL base' : 'URL base (opcional)'"
            :required="urlRequired"
            :error="f.errors.base_url"
            :full-width="true"
            :hint="urlHint"
          >
            <template #default="{ id, describedBy }">
              <input
                :id="id"
                type="url"
                inputmode="url"
                autocomplete="off"
                spellcheck="false"
                :aria-describedby="describedBy"
                :value="f.values.base_url"
                :placeholder="urlPlaceholder"
                @input="f.setField('base_url', $event.target.value)"
              />
            </template>
          </UiFormField>

          <!-- Aviso fixo: todo tráfego de saída passa pelo gateway resiliente -->
          <div class="hf-note" data-full="true" role="note">
            <span class="hf-note-icon" aria-hidden="true">🛡</span>
            <p class="hf-note-text">
              Chamadas a este endpoint <strong>não saem diretamente</strong> — passam pelo gateway
              resiliente do HelpFlow, que aplica timeout, retry/backoff, trilha de auditoria e redação
              de segredos.
            </p>
          </div>
        </UiFormSection>

        <!-- Resiliência ----------------------------------------------------->
        <UiFormSection
          title="Resiliência"
          description="Quanto tempo esperar por resposta e quantas vezes tentar de novo antes de desistir. O gateway usa backoff exponencial entre as tentativas."
          :columns="2"
        >
          <!-- Timeout -->
          <UiFormField
            label="Timeout (ms)"
            :required="true"
            :error="f.errors.timeout_ms"
            :hint="timeoutHint"
          >
            <template #default="{ id, describedBy }">
              <input
                :id="id"
                type="number"
                inputmode="numeric"
                min="100"
                step="100"
                :aria-describedby="describedBy"
                :value="f.values.timeout_ms"
                placeholder="Ex.: 5000"
                @input="f.setField('timeout_ms', $event.target.value)"
              />
            </template>
          </UiFormField>

          <!-- Tentativas -->
          <UiFormField
            label="Tentativas (retries)"
            :required="true"
            :error="f.errors.retries"
            :hint="retriesHint"
          >
            <template #default="{ id, describedBy }">
              <input
                :id="id"
                type="number"
                inputmode="numeric"
                min="0"
                max="10"
                step="1"
                :aria-describedby="describedBy"
                :value="f.values.retries"
                placeholder="Ex.: 3"
                @input="f.setField('retries', $event.target.value)"
              />
            </template>
          </UiFormField>

          <!-- Atalhos de perfil de resiliência -->
          <div class="hf-suggest" data-full="true">
            <span class="hf-suggest-label">Perfis prontos:</span>
            <div class="hf-suggest-chips">
              <button
                v-for="preset in resiliencePresets"
                :key="preset.label"
                type="button"
                class="hf-chip"
                :data-active="isPresetActive(preset) ? 'true' : 'false'"
                @click="applyPreset(preset)"
              >
                {{ preset.label }}
              </button>
            </div>
          </div>
        </UiFormSection>

        <!-- Pré-visualização do cronograma de backoff ----------------------->
        <div v-if="hasResilience" class="hf-backoff" aria-live="polite">
          <div class="hf-backoff-head">
            <span class="hf-backoff-eyebrow">Cronograma de tentativas</span>
            <span class="hf-backoff-budget">orçamento máx. ≈ {{ formatMs(totalBudgetMs) }}</span>
          </div>
          <ol class="hf-backoff-steps">
            <li
              v-for="step in backoffSteps"
              :key="step.attempt"
              class="hf-backoff-step"
              :data-kind="step.kind"
            >
              <span class="hf-backoff-num" aria-hidden="true">{{ step.attempt }}</span>
              <span class="hf-backoff-body">
                <span class="hf-backoff-title">{{ step.title }}</span>
                <span class="hf-backoff-detail">{{ step.detail }}</span>
              </span>
            </li>
          </ol>
          <p class="hf-backoff-note">{{ backoffSentence }}</p>
        </div>

        <!-- Situação -------------------------------------------------------->
        <UiFormSection
          title="Situação"
          description="Defina o estado inicial. Integrações inativas não recebem tráfego; a verificação de saúde do gateway pode promovê-las a 'instável' depois."
          :columns="1"
        >
          <UiFormField label="Situação inicial" :required="true" :error="f.errors.status" :full-width="true">
            <template #default="{ id, describedBy }">
              <div
                :id="id"
                class="hf-segmented"
                role="radiogroup"
                :aria-describedby="describedBy"
                aria-label="Situação inicial da integração"
              >
                <button
                  v-for="opt in statusOptions"
                  :key="opt.value"
                  type="button"
                  class="hf-segmented-opt"
                  role="radio"
                  :aria-checked="String(f.values.status === opt.value)"
                  :data-active="f.values.status === opt.value ? 'true' : 'false'"
                  @click="f.setField('status', opt.value)"
                >
                  <span class="hf-segmented-dot" :data-tone="opt.tone" aria-hidden="true" />
                  {{ opt.label }}
                </button>
              </div>
            </template>
          </UiFormField>
        </UiFormSection>

        <!-- Pré-visualização viva da integração ----------------------------->
        <div class="hf-preview" aria-live="polite">
          <div class="hf-preview-head">
            <span class="hf-preview-icon" aria-hidden="true">{{ selectedKind.icon }}</span>
            <div class="hf-preview-titles">
              <span class="hf-preview-eyebrow">Resumo do gateway</span>
              <span class="hf-preview-name">{{ f.values.name.trim() || 'Nova integração' }}</span>
            </div>
            <UiStatusBadge :status="f.values.status || 'active'" size="sm" :label="statusLabelFor(f.values.status)" />
          </div>
          <dl class="hf-preview-metrics">
            <div class="hf-preview-metric">
              <dt>Tipo</dt>
              <dd>{{ selectedKind.label }}</dd>
            </div>
            <div class="hf-preview-metric">
              <dt>Timeout</dt>
              <dd>{{ hasTimeout ? formatMs(Number(f.values.timeout_ms)) : '—' }}</dd>
            </div>
            <div class="hf-preview-metric">
              <dt>Tentativas</dt>
              <dd>{{ hasRetries ? retriesText : '—' }}</dd>
            </div>
          </dl>
          <p class="hf-preview-note">{{ previewSentence }}</p>
        </div>

        <!-- Erro de envio --------------------------------------------------->
        <p v-if="submitError" class="hf-submit-error" role="alert">{{ submitError }}</p>

        <!-- SubmitBar ------------------------------------------------------->
        <div class="hf-submit-bar">
          <p class="hf-submit-hint">
            <span v-if="dupState === 'found'" class="hf-submit-warn">Há possível duplicidade — vamos confirmar antes de salvar.</span>
            <span v-else class="ui-muted">Os campos marcados com * são obrigatórios.</span>
          </p>
          <div class="hf-submit-actions">
            <UiButton variant="ghost" type="button" :disabled="f.submitting.value" @click="cancel">Cancelar</UiButton>
            <UiButton type="submit" :loading="f.submitting.value">Criar integração</UiButton>
          </div>
        </div>
      </form>
    </UiCard>
  </UiPageLayout>
</template>

<script setup>
import { ref, computed } from 'vue';
import { RouterLink, useRouter } from 'vue-router';
import {
  UiPageLayout,
  UiCard,
  UiFormSection,
  UiFormField,
  UiButton,
  UiStatusBadge,
  useForm,
  useToast,
  useConfirm,
  validators,
} from '../ui/index.js';
// Endpoint REAL: POST /v1/integrations. `api.integrations` é o recurso de domínio
// exportado/garantido pelo integrador em ../api.js (resourceFactory('integrations')),
// que também usamos para a checagem auxiliar de duplicidade (GET /v1/integrations?q=).
import { integrations } from '../api.js';

const router = useRouter();
const toast = useToast();
const confirm = useConfirm();

// ---- Opções declarativas -----------------------------------------------------
// Tipos do enum `kind`. `url` indica se a URL base é exigida para aquele tipo.
const kindOptions = [
  { value: 'email', label: 'E-mail', icon: '✉', desc: 'SMTP / provedor transacional', url: false },
  { value: 'telephony', label: 'Telefonia', icon: '☎', desc: 'Voz e SMS (ex.: Twilio)', url: true },
  { value: 'webhook', label: 'Webhook', icon: '🔗', desc: 'POST para um endpoint HTTP', url: true },
  { value: 'external_central', label: 'Central externa', icon: '🏢', desc: 'Sistema de chamados de terceiros', url: true },
  { value: 'chat', label: 'Chat', icon: '💬', desc: 'Mensageria (ex.: WhatsApp)', url: true },
];

const statusOptions = [
  { value: 'active', label: 'Ativa', tone: 'ok' },
  { value: 'degraded', label: 'Instável', tone: 'warn' },
  { value: 'inactive', label: 'Inativa', tone: 'muted' },
];

// Perfis prontos de resiliência (timeout em ms, tentativas).
const resiliencePresets = [
  { label: 'Rápido (2s · 2x)', timeout: 2000, retries: 2 },
  { label: 'Padrão (5s · 3x)', timeout: 5000, retries: 3 },
  { label: 'Tolerante (15s · 5x)', timeout: 15000, retries: 5 },
  { label: 'Sem retry (10s · 0x)', timeout: 10000, retries: 0 },
];

const BASE_BACKOFF_MS = 500; // base do backoff exponencial do gateway

// ---- Formulário --------------------------------------------------------------
const f = useForm({
  initial: {
    name: '',
    kind: 'webhook',
    base_url: '',
    timeout_ms: '5000',
    retries: '3',
    status: 'active',
  },
  rules: {
    name: [validators.required('Informe o nome da integração'), validators.minLen(2), validators.maxLen(80)],
    kind: [validators.required('Escolha o tipo de gateway')],
    base_url: [
      // Condicional: exigida só para tipos que dependem de URL; valida o formato quando preenchida.
      (v, all) => {
        const needs = kindNeedsUrl(all.kind);
        const val = String(v || '').trim();
        if (needs && !val) return 'Informe a URL base deste gateway';
        if (val && !/^https?:\/\/.+/i.test(val)) return 'Use uma URL http(s) válida';
        return '';
      },
      validators.maxLen(300),
    ],
    timeout_ms: [
      validators.required('Informe o timeout'),
      validators.numeric('Use apenas números'),
      validators.min(100, 'Mínimo de 100 ms'),
      validators.max(120000, 'Máximo de 120000 ms (2 min)'),
    ],
    retries: [
      validators.required('Informe o número de tentativas'),
      validators.numeric('Use apenas números'),
      validators.min(0, 'Não pode ser negativo'),
      validators.max(10, 'Máximo de 10 tentativas'),
    ],
    status: [validators.required('Escolha a situação inicial')],
  },
});

// ---- Tipo selecionado / dependência de URL -----------------------------------
function kindNeedsUrl(kind) {
  const opt = kindOptions.find((k) => k.value === kind);
  return opt ? opt.url : true;
}

const selectedKind = computed(
  () => kindOptions.find((k) => k.value === f.values.kind) || kindOptions[0],
);
const urlRequired = computed(() => kindNeedsUrl(f.values.kind));

function selectKind(value) {
  f.setField('kind', value);
  // Revalida a URL: a obrigatoriedade muda conforme o tipo.
  if (f.touched.base_url) f.validateField('base_url');
}

const connectionDescription = computed(() =>
  urlRequired.value
    ? 'Endpoint de destino do gateway. É por aqui que o HelpFlow envia as chamadas de saída.'
    : 'Gateways de e-mail normalmente não usam URL base (a configuração de SMTP fica no servidor). Deixe em branco se não se aplicar.',
);

const urlPlaceholder = computed(() => {
  switch (f.values.kind) {
    case 'webhook': return 'https://api.exemplo.com/hooks/helpflow';
    case 'telephony': return 'https://api.twilio.com/2010-04-01';
    case 'external_central': return 'https://central.parceiro.com/api';
    case 'chat': return 'https://graph.facebook.com/v19.0';
    default: return 'https://...';
  }
});

const urlHint = computed(() => {
  if (f.errors.base_url) return undefined;
  if (!urlRequired.value && !String(f.values.base_url || '').trim()) {
    return 'Opcional para este tipo. O tráfego ainda passa pelo gateway resiliente.';
  }
  return 'Use o host completo com esquema (https://). O caminho específico de cada operação é acrescentado pelo gateway.';
});

// ---- Resiliência: hints, presets e cronograma de backoff ---------------------
const hasTimeout = computed(() => isPositive(f.values.timeout_ms));
const hasRetries = computed(() => isNonNegative(f.values.retries));
const hasResilience = computed(() => hasTimeout.value && hasRetries.value);

const timeoutHint = computed(() => {
  if (f.errors.timeout_ms) return undefined;
  if (hasTimeout.value) return 'Cada tentativa espera no máximo ' + formatMs(Number(f.values.timeout_ms)) + ' por resposta.';
  return 'Tempo máximo de espera por resposta em cada tentativa.';
});

const retriesText = computed(() => {
  const n = Number(f.values.retries);
  if (n === 0) return 'sem retry';
  return n + (n === 1 ? ' nova tentativa' : ' novas tentativas');
});

const retriesHint = computed(() => {
  if (f.errors.retries) return undefined;
  if (hasRetries.value) {
    const n = Number(f.values.retries);
    return n === 0
      ? 'Falhou uma vez, falhou de vez — sem reenvio automático.'
      : 'Até ' + (n + 1) + ' execuções no total (1 inicial + ' + n + '), com espera crescente entre elas.';
  }
  return 'Quantas vezes reenviar após uma falha. 0 desativa o retry.';
});

function backoffDelayMs(attemptIndex) {
  // backoff exponencial: 500ms, 1s, 2s, 4s... (entre tentativas)
  return BASE_BACKOFF_MS * Math.pow(2, attemptIndex);
}

const backoffSteps = computed(() => {
  const retries = hasRetries.value ? Number(f.values.retries) : 0;
  const timeout = hasTimeout.value ? Number(f.values.timeout_ms) : 0;
  const steps = [];
  // Tentativa inicial (attempt 1)
  steps.push({
    attempt: 1,
    kind: 'first',
    title: 'Tentativa inicial',
    detail: 'aguarda até ' + formatMs(timeout) + ' por resposta',
  });
  for (let i = 0; i < retries; i++) {
    const wait = backoffDelayMs(i);
    steps.push({
      attempt: i + 2,
      kind: 'retry',
      title: 'Retry ' + (i + 1),
      detail: 'após esperar ' + formatMs(wait) + ' · timeout ' + formatMs(timeout),
    });
  }
  return steps;
});

const totalBudgetMs = computed(() => {
  const retries = hasRetries.value ? Number(f.values.retries) : 0;
  const timeout = hasTimeout.value ? Number(f.values.timeout_ms) : 0;
  let total = timeout; // tentativa inicial
  for (let i = 0; i < retries; i++) total += backoffDelayMs(i) + timeout;
  return total;
});

const backoffSentence = computed(() => {
  const retries = hasRetries.value ? Number(f.values.retries) : 0;
  if (retries === 0) {
    return 'Sem retry: uma única chamada. Se falhar, o gateway registra a falha e não reenvia.';
  }
  return (
    'No pior caso, o gateway leva cerca de ' + formatMs(totalBudgetMs.value) +
    ' antes de marcar a chamada como falha definitiva (' + (retries + 1) + ' execuções).'
  );
});

function isPresetActive(preset) {
  return Number(f.values.timeout_ms) === preset.timeout && Number(f.values.retries) === preset.retries;
}

function applyPreset(preset) {
  f.setField('timeout_ms', String(preset.timeout));
  f.setField('retries', String(preset.retries));
}

// ---- Detecção de duplicidade por nome ----------------------------------------
// dupState: idle | checking | found | clean | error
const dupState = ref('idle');
const duplicates = ref([]);
let lastChecked = '';

const nameHint = computed(() => {
  if (dupState.value === 'checking') return 'Verificando se já existe uma integração com este nome…';
  if (dupState.value === 'clean') return 'Nenhuma integração com este nome. Tudo certo.';
  if (dupState.value === 'error') return 'Não foi possível verificar duplicidade agora — você ainda pode salvar.';
  return 'Procuramos gateways existentes com nome parecido para evitar duplicação de tráfego de saída.';
});

function onNameInput(value) {
  f.setField('name', value);
  if (dupState.value !== 'checking') {
    dupState.value = 'idle';
    duplicates.value = [];
  }
}

function dismissDuplicates() {
  dupState.value = 'idle';
  duplicates.value = [];
}

async function checkDuplicates() {
  const name = normalize(f.values.name);
  if (!name || name.length < 2) return;
  if (name === lastChecked && (dupState.value === 'found' || dupState.value === 'clean')) return;
  lastChecked = name;
  dupState.value = 'checking';
  try {
    const res = await integrations.list({ q: f.values.name, pageSize: 5 });
    const rows = (res && res.data) || [];
    const matches = rows.filter((r) => normalize(r.name) === name);
    duplicates.value = matches;
    dupState.value = matches.length ? 'found' : 'clean';
  } catch (e) {
    // fail-soft: a verificação é auxiliar e nunca bloqueia o cadastro
    duplicates.value = [];
    dupState.value = 'error';
  }
}

// ---- Pré-visualização --------------------------------------------------------
const previewSentence = computed(() => {
  const kind = selectedKind.value.label.toLowerCase();
  const dest = String(f.values.base_url || '').trim();
  const where = dest ? ' para ' + dest : '';
  if (!hasResilience.value) {
    return 'Preencha o timeout e as tentativas para ver como o gateway tratará as chamadas de ' + kind + '.';
  }
  const retries = Number(f.values.retries);
  const retryText = retries === 0 ? 'sem retry' : 'com até ' + retries + ' retry(s) em backoff';
  return (
    'Gateway de ' + kind + where + ', com timeout de ' + formatMs(Number(f.values.timeout_ms)) +
    ' por tentativa, ' + retryText + '. Todo o tráfego é auditado.'
  );
});

// ---- Helpers -----------------------------------------------------------------
function isPositive(v) {
  const n = Number(v);
  return v !== '' && v !== null && v !== undefined && isFinite(n) && n > 0;
}
function isNonNegative(v) {
  const n = Number(v);
  return v !== '' && v !== null && v !== undefined && isFinite(n) && n >= 0;
}

function normalize(s) {
  return String(s || '').trim().toLowerCase();
}

function formatMs(ms) {
  const n = Number(ms);
  if (!isFinite(n) || n < 0) return '—';
  if (n < 1000) return n + ' ms';
  const s = n / 1000;
  if (n % 1000 === 0) return s + ' s';
  return s.toFixed(1).replace('.', ',') + ' s';
}

function kindLabel(value) {
  const opt = kindOptions.find((k) => k.value === value);
  return opt ? opt.label : (value || 'Integração');
}

function statusLabelFor(value) {
  const opt = statusOptions.find((s) => s.value === value);
  return opt ? opt.label : 'Ativa';
}

// ---- Envio -------------------------------------------------------------------
const submitError = ref('');

function buildPayload(vals) {
  const url = String(vals.base_url || '').trim();
  return {
    name: vals.name.trim(),
    kind: vals.kind,
    base_url: url || null,
    timeout_ms: Number(vals.timeout_ms),
    retries: Number(vals.retries),
    status: vals.status || 'active',
  };
}

function submit() {
  submitError.value = '';
  f.handleSubmit(async (vals) => {
    // Confirmação: nome duplicado (ação potencialmente conflitante) — via useConfirm.
    if (dupState.value === 'found' && duplicates.value.length) {
      const ok = await confirm({
        title: 'Criar mesmo com nome duplicado?',
        message:
          'Encontramos ' +
          duplicates.value.length +
          ' integração(ões) com este nome. Criar outra pode duplicar o tráfego de saída. Deseja continuar?',
        confirmLabel: 'Criar mesmo assim',
        cancelLabel: 'Revisar',
        danger: true,
      });
      if (!ok) return;
    }

    try {
      const created = await integrations.create(buildPayload(vals));
      toast.success('Integração criada', { detail: vals.name.trim() });
      const id = created && (created.id || (created.data && created.data.id));
      router.push(id ? '/integrations/' + id : '/integrations');
    } catch (e) {
      const msg = e && e.message ? e.message : 'Falha ao criar a integração.';
      submitError.value = msg;
      toast.error('Não foi possível criar a integração', {
        detail: msg,
        code: e && e.status ? 'HTTP ' + e.status : '',
      });
    }
  });
}

const cancel = () => router.push('/integrations');
</script>

<style scoped>
.hf-form {
  display: flex;
  flex-direction: column;
}

/* ---- Campo com indicador (spinner de verificação) ---- */
.hf-input-wrap {
  position: relative;
  display: flex;
  align-items: center;
}
.hf-input-spin {
  position: absolute;
  right: 11px;
  top: 50%;
  transform: translateY(-50%);
  color: rgb(var(--ui-accent-strong));
  pointer-events: none;
  display: inline-flex;
}

/* ---- Seletor de tipo (cards radio acessíveis, CSP-safe) ---- */
.hf-kinds {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
  gap: var(--ui-space-3);
}
.hf-kind-opt {
  position: relative;
  display: flex;
  align-items: center;
  gap: var(--ui-space-3);
  text-align: left;
  font: inherit;
  cursor: pointer;
  padding: var(--ui-space-3);
  border: 1px solid rgb(var(--ui-border-strong));
  border-radius: var(--ui-radius-md);
  background: rgb(var(--ui-surface));
  transition: border-color 0.15s ease, background 0.15s ease, box-shadow 0.15s ease;
}
.hf-kind-opt:hover {
  border-color: rgb(var(--ui-accent) / 0.6);
}
.hf-kind-opt:focus-visible {
  outline: 2px solid rgb(var(--ui-accent));
  outline-offset: 2px;
}
.hf-kind-opt[data-active="true"] {
  border-color: rgb(var(--ui-accent));
  background: rgb(var(--ui-accent) / 0.06);
  box-shadow: var(--ui-shadow-sm);
}
.hf-kind-icon {
  flex-shrink: 0;
  width: 38px;
  height: 38px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 1.25rem;
  border-radius: var(--ui-radius-sm);
  background: rgb(var(--ui-surface-2));
  border: 1px solid rgb(var(--ui-border));
}
.hf-kind-opt[data-active="true"] .hf-kind-icon {
  background: rgb(var(--ui-accent) / 0.12);
  border-color: rgb(var(--ui-accent) / 0.4);
}
.hf-kind-text {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
}
.hf-kind-name {
  font-weight: 700;
  font-size: var(--ui-text-sm);
  color: rgb(var(--ui-fg));
}
.hf-kind-desc {
  font-size: var(--ui-text-xs);
  color: rgb(var(--ui-muted));
}
.hf-kind-check {
  margin-left: auto;
  flex-shrink: 0;
  width: 20px;
  height: 20px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--ui-radius-pill);
  background: rgb(var(--ui-accent));
  color: rgb(var(--ui-accent-fg));
  font-size: var(--ui-text-xs);
  font-weight: 700;
  opacity: 0;
  transform: scale(0.7);
  transition: opacity 0.15s ease, transform 0.15s ease;
}
.hf-kind-opt[data-active="true"] .hf-kind-check {
  opacity: 1;
  transform: scale(1);
}

/* ---- Aviso do gateway ---- */
.hf-note {
  display: flex;
  align-items: flex-start;
  gap: var(--ui-space-3);
  padding: var(--ui-space-3) var(--ui-space-4);
  border: 1px solid rgb(var(--ui-accent) / 0.3);
  background: rgb(var(--ui-accent) / 0.06);
  border-radius: var(--ui-radius-md);
}
.hf-note[data-full="true"] {
  grid-column: 1 / -1;
}
.hf-note-icon {
  flex-shrink: 0;
  font-size: 1.15rem;
  line-height: 1.4;
}
.hf-note-text {
  margin: 0;
  font-size: var(--ui-text-sm);
  color: rgb(var(--ui-muted));
}
.hf-note-text strong {
  color: rgb(var(--ui-fg));
}

/* ---- Sugestões / perfis (chips) ---- */
.hf-suggest {
  display: flex;
  align-items: center;
  gap: var(--ui-space-3);
  flex-wrap: wrap;
}
.hf-suggest[data-full="true"] {
  grid-column: 1 / -1;
}
.hf-suggest-label {
  font-size: var(--ui-text-sm);
  color: rgb(var(--ui-muted));
  font-weight: 600;
}
.hf-suggest-chips {
  display: flex;
  gap: var(--ui-space-2);
  flex-wrap: wrap;
}
.hf-chip {
  font: inherit;
  font-size: var(--ui-text-xs);
  font-weight: 600;
  cursor: pointer;
  padding: 5px 11px;
  border-radius: var(--ui-radius-pill);
  border: 1px solid rgb(var(--ui-accent) / 0.35);
  background: rgb(var(--ui-accent) / 0.10);
  color: rgb(var(--ui-accent-strong));
  transition: background 0.15s ease, border-color 0.15s ease;
}
.hf-chip:hover {
  background: rgb(var(--ui-accent) / 0.20);
}
.hf-chip:focus-visible {
  outline: 2px solid rgb(var(--ui-accent));
  outline-offset: 2px;
}
.hf-chip[data-active="true"] {
  background: rgb(var(--ui-accent));
  border-color: rgb(var(--ui-accent));
  color: rgb(var(--ui-accent-fg));
}

/* ---- Cronograma de backoff ---- */
.hf-backoff {
  margin: 0 0 var(--ui-space-5);
  border: 1px solid rgb(var(--ui-border-strong));
  background: rgb(var(--ui-surface-2));
  border-radius: var(--ui-radius-lg);
  padding: var(--ui-space-4);
}
.hf-backoff-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--ui-space-3);
  margin-bottom: var(--ui-space-3);
  flex-wrap: wrap;
}
.hf-backoff-eyebrow {
  text-transform: uppercase;
  letter-spacing: 0.07em;
  font-size: var(--ui-text-xs);
  font-weight: 700;
  color: rgb(var(--ui-accent-strong));
}
.hf-backoff-budget {
  font-size: var(--ui-text-xs);
  color: rgb(var(--ui-muted));
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}
.hf-backoff-steps {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-2);
}
.hf-backoff-step {
  display: flex;
  align-items: center;
  gap: var(--ui-space-3);
  padding: var(--ui-space-2) var(--ui-space-3);
  background: rgb(var(--ui-surface));
  border: 1px solid rgb(var(--ui-border));
  border-radius: var(--ui-radius-md);
}
.hf-backoff-num {
  flex-shrink: 0;
  width: 24px;
  height: 24px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--ui-radius-pill);
  font-size: var(--ui-text-xs);
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  background: rgb(var(--ui-faint) / 0.4);
  color: rgb(var(--ui-fg));
}
.hf-backoff-step[data-kind="first"] .hf-backoff-num {
  background: rgb(var(--ui-accent) / 0.18);
  color: rgb(var(--ui-accent-strong));
}
.hf-backoff-step[data-kind="retry"] .hf-backoff-num {
  background: rgb(var(--ui-warn) / 0.18);
  color: rgb(var(--ui-warn));
}
.hf-backoff-body {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
}
.hf-backoff-title {
  font-weight: 700;
  font-size: var(--ui-text-sm);
  color: rgb(var(--ui-fg));
}
.hf-backoff-detail {
  font-size: var(--ui-text-xs);
  color: rgb(var(--ui-muted));
}
.hf-backoff-note {
  margin: var(--ui-space-3) 0 0;
  font-size: var(--ui-text-sm);
  color: rgb(var(--ui-muted));
}

/* ---- Situação (segmented control acessível) ---- */
.hf-segmented {
  display: inline-flex;
  gap: 0;
  border: 1px solid rgb(var(--ui-border-strong));
  border-radius: var(--ui-radius-md);
  padding: 3px;
  background: rgb(var(--ui-surface-2));
  flex-wrap: wrap;
}
.hf-segmented-opt {
  display: inline-flex;
  align-items: center;
  gap: var(--ui-space-2);
  font: inherit;
  font-size: var(--ui-text-sm);
  font-weight: 600;
  color: rgb(var(--ui-muted));
  background: transparent;
  border: none;
  border-radius: var(--ui-radius-sm);
  padding: 7px 14px;
  cursor: pointer;
  transition: background 0.15s ease, color 0.15s ease;
}
.hf-segmented-opt:hover {
  color: rgb(var(--ui-fg));
}
.hf-segmented-opt:focus-visible {
  outline: 2px solid rgb(var(--ui-accent));
  outline-offset: 2px;
}
.hf-segmented-opt[data-active="true"] {
  background: rgb(var(--ui-surface));
  color: rgb(var(--ui-fg));
  box-shadow: var(--ui-shadow-sm);
}
.hf-segmented-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: rgb(var(--ui-faint));
}
.hf-segmented-dot[data-tone="ok"] { background: rgb(var(--ui-ok)); }
.hf-segmented-dot[data-tone="warn"] { background: rgb(var(--ui-warn)); }
.hf-segmented-dot[data-tone="muted"] { background: rgb(var(--ui-faint)); }

/* ---- Pré-visualização viva ---- */
.hf-preview {
  margin: 0 0 var(--ui-space-5);
  border: 1px solid rgb(var(--ui-accent) / 0.3);
  background: rgb(var(--ui-accent) / 0.06);
  border-radius: var(--ui-radius-lg);
  padding: var(--ui-space-4);
}
.hf-preview-head {
  display: flex;
  align-items: center;
  gap: var(--ui-space-3);
  margin-bottom: var(--ui-space-3);
}
.hf-preview-icon {
  flex-shrink: 0;
  width: 40px;
  height: 40px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 1.3rem;
  border-radius: var(--ui-radius-md);
  background: rgb(var(--ui-surface));
  border: 1px solid rgb(var(--ui-border));
}
.hf-preview-titles {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
  margin-right: auto;
}
.hf-preview-eyebrow {
  text-transform: uppercase;
  letter-spacing: 0.07em;
  font-size: var(--ui-text-xs);
  font-weight: 700;
  color: rgb(var(--ui-accent-strong));
}
.hf-preview-name {
  font-family: var(--ui-font-display);
  font-weight: 700;
  font-size: var(--ui-text-md);
  color: rgb(var(--ui-fg));
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.hf-preview-metrics {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: var(--ui-space-3);
  margin: 0 0 var(--ui-space-3);
}
.hf-preview-metric {
  background: rgb(var(--ui-surface));
  border: 1px solid rgb(var(--ui-border));
  border-radius: var(--ui-radius-md);
  padding: var(--ui-space-3);
}
.hf-preview-metric dt {
  font-size: var(--ui-text-xs);
  color: rgb(var(--ui-muted));
  text-transform: uppercase;
  letter-spacing: 0.04em;
  font-weight: 600;
}
.hf-preview-metric dd {
  margin: 4px 0 0;
  font-family: var(--ui-font-display);
  font-size: var(--ui-text-lg);
  font-weight: 700;
  color: rgb(var(--ui-fg));
}
.hf-preview-note {
  margin: 0;
  font-size: var(--ui-text-sm);
  color: rgb(var(--ui-muted));
}

/* ---- Banner de duplicidade ---- */
.hf-banner {
  border: 1px solid rgb(var(--ui-warn) / 0.4);
  background: rgb(var(--ui-warn) / 0.08);
  border-radius: var(--ui-radius-lg);
  padding: var(--ui-space-4);
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-3);
}
.hf-banner-head {
  display: flex;
  align-items: flex-start;
  gap: var(--ui-space-3);
}
.hf-banner-icon {
  flex-shrink: 0;
  width: 26px;
  height: 26px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--ui-radius-pill);
  background: rgb(var(--ui-warn) / 0.18);
  color: rgb(var(--ui-warn));
  font-weight: 700;
}
.hf-banner-text {
  min-width: 0;
}
.hf-banner-title {
  margin: 0;
  font-weight: 700;
  color: rgb(var(--ui-fg));
}
.hf-banner-sub {
  margin: 2px 0 0;
  font-size: var(--ui-text-sm);
  color: rgb(var(--ui-muted));
}
.hf-banner-head > :last-child {
  margin-left: auto;
}
.hf-dup-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-2);
}
.hf-dup-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ui-space-3);
  padding: var(--ui-space-2) var(--ui-space-3);
  background: rgb(var(--ui-surface));
  border: 1px solid rgb(var(--ui-border));
  border-radius: var(--ui-radius-md);
}
.hf-dup-main {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
}
.hf-dup-name {
  font-weight: 600;
  color: rgb(var(--ui-accent-strong));
}
.hf-dup-meta {
  font-size: var(--ui-text-xs);
  color: rgb(var(--ui-muted));
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.hf-dup-side {
  display: flex;
  align-items: center;
  gap: var(--ui-space-2);
  flex-shrink: 0;
}

/* ---- Erro de envio ---- */
.hf-submit-error {
  margin: 0 0 var(--ui-space-4);
  padding: var(--ui-space-3) var(--ui-space-4);
  border: 1px solid rgb(var(--ui-danger) / 0.4);
  background: rgb(var(--ui-danger) / 0.08);
  color: rgb(var(--ui-danger));
  border-radius: var(--ui-radius-md);
  font-size: var(--ui-text-sm);
  font-weight: 600;
}

/* ---- SubmitBar ---- */
.hf-submit-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ui-space-4);
  flex-wrap: wrap;
  padding-top: var(--ui-space-4);
  border-top: 1px solid rgb(var(--ui-border));
}
.hf-submit-hint {
  margin: 0;
  font-size: var(--ui-text-sm);
}
.ui-muted {
  color: rgb(var(--ui-muted));
}
.hf-submit-warn {
  color: rgb(var(--ui-warn));
  font-weight: 600;
}
.hf-submit-actions {
  display: flex;
  gap: var(--ui-space-2);
  margin-left: auto;
}

@media (max-width: 640px) {
  .hf-kinds {
    grid-template-columns: 1fr;
  }
  .hf-preview-metrics {
    grid-template-columns: 1fr;
  }
  .hf-segmented {
    width: 100%;
  }
  .hf-segmented-opt {
    flex: 1 1 auto;
    justify-content: center;
  }
  .hf-submit-bar {
    align-items: stretch;
  }
  .hf-submit-actions {
    width: 100%;
  }
  .hf-submit-actions :deep(.ui-btn) {
    flex: 1 1 auto;
  }
}
</style>
