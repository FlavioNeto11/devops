<template>
  <UiPageLayout
    eyebrow="Políticas de SLA"
    title="Nova política de SLA"
    subtitle="Defina os prazos de atendimento: prioridade alvo, tempo de primeira resposta e de resolução. O worker usa esta política para calcular os prazos de cada chamado."
    width="narrow"
  >
    <template #actions>
      <UiButton variant="ghost" to="/sla-policies">Voltar às políticas</UiButton>
    </template>

    <!-- Banner auxiliar de nome duplicado (fail-soft, nunca bloqueia) -->
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
            <p class="hf-banner-title">Já existe uma política com nome parecido</p>
            <p class="hf-banner-sub">
              Para evitar prazos conflitantes, abra a existente em vez de criar outra —
              ou confirme que é mesmo uma nova política.
            </p>
          </div>
          <UiButton variant="subtle" size="sm" @click="dismissDuplicates">Ignorar</UiButton>
        </div>
        <ul class="hf-dup-list">
          <li v-for="d in duplicates" :key="d.id" class="hf-dup-item">
            <div class="hf-dup-main">
              <RouterLink :to="'/sla-policies/' + d.id" class="hf-dup-name">{{ d.name }}</RouterLink>
              <span class="hf-dup-meta">
                {{ priorityLabel(d.priority) }} · {{ formatMinutes(d.first_response_mins) }} / {{ formatMinutes(d.resolution_mins) }}
              </span>
            </div>
            <div class="hf-dup-side">
              <UiStatusBadge :status="d.status || 'active'" size="sm" />
              <UiButton variant="ghost" size="sm" :to="'/sla-policies/' + d.id">Abrir</UiButton>
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
          description="Dê um nome objetivo. Ele aparece ao vincular esta política a filas, categorias e chamados."
          :columns="1"
        >
          <UiFormField
            label="Nome da política"
            :required="true"
            :error="f.errors.name"
            :full-width="true"
            :hint="nameHint"
          >
            <template #default="{ id, describedBy }">
              <div class="hf-input-wrap">
                <input
                  :id="id"
                  ref="nameInput"
                  type="text"
                  autocomplete="off"
                  :aria-describedby="describedBy"
                  :value="f.values.name"
                  placeholder="Ex.: SLA Premium, Atendimento padrão, SLA crítico 24x7"
                  @input="onNameInput($event.target.value)"
                  @blur="checkDuplicates"
                />
                <span v-if="dupState === 'checking'" class="hf-input-spin" aria-hidden="true">
                  <span class="ui-spin" />
                </span>
              </div>
            </template>
          </UiFormField>
        </UiFormSection>

        <!-- Prioridade alvo ------------------------------------------------->
        <UiFormSection
          title="Prioridade alvo"
          description="A política se aplica aos chamados desta prioridade. Para outras prioridades, crie políticas próprias."
          :columns="1"
        >
          <UiFormField
            label="Prioridade"
            :required="true"
            :error="f.errors.priority"
            :full-width="true"
            hint="Quanto mais alta a prioridade, mais apertados costumam ser os prazos."
          >
            <template #default="{ id, describedBy }">
              <div
                :id="id"
                class="hf-priority"
                role="radiogroup"
                :aria-describedby="describedBy"
                aria-label="Prioridade alvo da política"
                @keydown="onPriorityKeydown"
              >
                <button
                  v-for="(opt, idx) in priorityOptions"
                  :key="opt.value"
                  :ref="(el) => setPriorityRef(el, idx)"
                  type="button"
                  class="hf-priority-opt"
                  role="radio"
                  :tabindex="f.values.priority === opt.value ? 0 : -1"
                  :aria-checked="String(f.values.priority === opt.value)"
                  :data-active="f.values.priority === opt.value ? 'true' : 'false'"
                  :data-tone="opt.tone"
                  @click="f.setField('priority', opt.value)"
                >
                  <span class="hf-priority-dot" aria-hidden="true" />
                  <span class="hf-priority-label">{{ opt.label }}</span>
                  <span class="hf-priority-desc">{{ opt.desc }}</span>
                </button>
              </div>
            </template>
          </UiFormField>
        </UiFormSection>

        <!-- Prazos ---------------------------------------------------------->
        <UiFormSection
          title="Prazos"
          description="Informe os tempos em minutos. Mostramos a tradução em horas/dias e sugestões coerentes com a prioridade."
          :columns="2"
        >
          <!-- 1ª resposta -->
          <UiFormField
            label="1ª resposta (min)"
            :required="true"
            :error="f.errors.first_response_mins"
            :hint="firstResponseHint"
          >
            <template #default="{ id, describedBy }">
              <input
                :id="id"
                type="number"
                inputmode="numeric"
                min="1"
                step="1"
                :aria-describedby="describedBy"
                :value="f.values.first_response_mins"
                placeholder="Ex.: 30"
                @input="f.setField('first_response_mins', $event.target.value)"
              />
            </template>
          </UiFormField>

          <!-- Resolução -->
          <UiFormField
            label="Resolução (min)"
            :required="true"
            :error="f.errors.resolution_mins"
            :hint="resolutionHint"
          >
            <template #default="{ id, describedBy }">
              <input
                :id="id"
                type="number"
                inputmode="numeric"
                min="1"
                step="1"
                :aria-describedby="describedBy"
                :value="f.values.resolution_mins"
                placeholder="Ex.: 480"
                @input="f.setField('resolution_mins', $event.target.value)"
              />
            </template>
          </UiFormField>

          <!-- Atalhos de preenchimento (sugestões por prioridade) -->
          <div class="hf-suggest" :data-full="true">
            <span class="hf-suggest-label">Sugestões para {{ priorityLabel(f.values.priority) }}:</span>
            <div class="hf-suggest-chips">
              <button
                v-for="preset in activePresets"
                :key="preset.label"
                type="button"
                class="hf-chip"
                @click="applyPreset(preset)"
              >
                {{ preset.label }}
              </button>
            </div>
          </div>
        </UiFormSection>

        <!-- Aviso de coerência: resolução deve ser >= 1ª resposta -->
        <p v-if="inconsistentDeadlines" class="hf-warn" role="status" aria-live="polite">
          O tempo de resolução está menor que o de primeira resposta. Normalmente a resolução é maior — confira os valores.
        </p>

        <!-- Janela de cálculo ----------------------------------------------->
        <UiFormSection
          title="Janela de cálculo"
          description="Define como o worker conta o tempo: corrido (24x7) ou apenas dentro do expediente."
          :columns="1"
        >
          <UiFormField
            label="Só horário comercial"
            :error="f.errors.business_hours_only"
            :full-width="true"
          >
            <template #default="{ id, describedBy }">
              <button
                :id="id"
                type="button"
                class="hf-toggle"
                role="switch"
                :aria-checked="String(!!f.values.business_hours_only)"
                :aria-describedby="describedBy"
                :data-on="f.values.business_hours_only ? 'true' : 'false'"
                @click="f.setField('business_hours_only', !f.values.business_hours_only)"
              >
                <span class="hf-toggle-track" aria-hidden="true">
                  <span class="hf-toggle-knob" />
                </span>
                <span class="hf-toggle-text">
                  <span class="hf-toggle-state">
                    {{ f.values.business_hours_only ? 'Conta só no expediente' : 'Conta 24 horas, 7 dias' }}
                  </span>
                  <span class="hf-toggle-desc">
                    {{ f.values.business_hours_only
                      ? 'Prazos pausam fora do horário comercial e em fins de semana/feriados.'
                      : 'Prazos correm continuamente, inclusive à noite e em fins de semana.' }}
                  </span>
                </span>
              </button>
            </template>
          </UiFormField>
        </UiFormSection>

        <!-- Situação -------------------------------------------------------->
        <UiFormSection
          title="Situação"
          description="Políticas inativas continuam no histórico, mas não são oferecidas para novos vínculos."
          :columns="1"
        >
          <UiFormField label="Situação" :error="f.errors.status" :full-width="true">
            <template #default="{ id, describedBy }">
              <div
                :id="id"
                class="hf-segmented"
                role="radiogroup"
                :aria-describedby="describedBy"
                aria-label="Situação da política"
                @keydown="onStatusKeydown"
              >
                <button
                  v-for="(opt, idx) in statusOptions"
                  :key="opt.value"
                  :ref="(el) => setStatusRef(el, idx)"
                  type="button"
                  class="hf-segmented-opt"
                  role="radio"
                  :tabindex="f.values.status === opt.value ? 0 : -1"
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

        <!-- Pré-visualização viva da política -------------------------------->
        <div class="hf-preview" aria-live="polite">
          <div class="hf-preview-head">
            <span class="hf-preview-eyebrow">Resumo desta política</span>
            <UiStatusBadge
              :tone="priorityTone(f.values.priority)"
              size="sm"
              :label="priorityLabel(f.values.priority)"
            />
          </div>
          <dl class="hf-preview-metrics">
            <div class="hf-preview-metric">
              <dt>Primeira resposta</dt>
              <dd>{{ hasFirst ? formatMinutes(f.values.first_response_mins) : '—' }}</dd>
            </div>
            <div class="hf-preview-metric">
              <dt>Resolução</dt>
              <dd>{{ hasResolution ? formatMinutes(f.values.resolution_mins) : '—' }}</dd>
            </div>
            <div class="hf-preview-metric">
              <dt>Janela</dt>
              <dd>{{ f.values.business_hours_only ? 'Horário comercial' : '24 horas / 7 dias' }}</dd>
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
            <UiButton type="submit" :loading="f.submitting.value">Criar política</UiButton>
          </div>
        </div>
      </form>
    </UiCard>
  </UiPageLayout>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
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
// Recurso de domínio /v1/sla-policies — exposto pelo backend em
// apps/helpflow/api/src/server.js (GET/POST/PUT/DELETE) e padronizado como export
// nomeado no api.js (slaPolicies = resourceFactory('sla-policies')), igual aos demais
// recursos de domínio. list({ q, pageSize }) alimenta a verificação de duplicidade.
import { slaPolicies as slaApi } from '../api.js';

// Ref do primeiro campo para foco programático ao abrir o formulário (fluência de teclado).
const nameInput = ref(null);

const router = useRouter();
const toast = useToast();
const confirm = useConfirm();

// ---- Opções declarativas -----------------------------------------------------
const priorityOptions = [
  { value: 'low', label: 'Baixa', tone: 'muted', desc: 'Demandas sem urgência' },
  { value: 'medium', label: 'Média', tone: 'accent', desc: 'Fluxo padrão' },
  { value: 'high', label: 'Alta', tone: 'warn', desc: 'Atenção prioritária' },
  { value: 'urgent', label: 'Urgente', tone: 'danger', desc: 'Impacto crítico' },
];

// Roving tabindex + navegação por setas no radiogroup de prioridade (ARIA APG):
// só o card selecionado é tabável; setas movem a seleção e o foco entre os cards.
const priorityRefs = ref([]);
function setPriorityRef(el, idx) {
  if (el) priorityRefs.value[idx] = el;
}
function onPriorityKeydown(e) {
  const keys = ['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp', 'Home', 'End'];
  if (!keys.includes(e.key)) return;
  e.preventDefault();
  const last = priorityOptions.length - 1;
  let i = priorityOptions.findIndex((o) => o.value === f.values.priority);
  if (i < 0) i = 0;
  if (e.key === 'Home') i = 0;
  else if (e.key === 'End') i = last;
  else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') i = i >= last ? 0 : i + 1;
  else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') i = i <= 0 ? last : i - 1;
  f.setField('priority', priorityOptions[i].value);
  const el = priorityRefs.value[i];
  if (el && typeof el.focus === 'function') el.focus();
}

// Mapa prioridade → tom semântico do UiStatusBadge (neutral|running|warning|error).
// Alinha a cor do badge ao seletor de cards acima; NÃO reusa o resolveTone por
// status (que casaria 'low'→warning/laranja e 'medium/high/urgent'→neutral/cinza,
// gerando cor enganosa). Sinal de cor coerente com a hierarquia de prioridade.
const PRIORITY_TONE = { low: 'neutral', medium: 'running', high: 'warning', urgent: 'error' };
function priorityTone(p) {
  return PRIORITY_TONE[p] || 'running';
}

const statusOptions = [
  { value: 'active', label: 'Ativa', tone: 'ok' },
  { value: 'inactive', label: 'Inativa', tone: 'muted' },
];

// Roving tabindex + setas no segmented control de situação (mesmo padrão ARIA APG).
const statusRefs = ref([]);
function setStatusRef(el, idx) {
  if (el) statusRefs.value[idx] = el;
}
function onStatusKeydown(e) {
  const keys = ['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp', 'Home', 'End'];
  if (!keys.includes(e.key)) return;
  e.preventDefault();
  const last = statusOptions.length - 1;
  let i = statusOptions.findIndex((o) => o.value === f.values.status);
  if (i < 0) i = 0;
  if (e.key === 'Home') i = 0;
  else if (e.key === 'End') i = last;
  else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') i = i >= last ? 0 : i + 1;
  else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') i = i <= 0 ? last : i - 1;
  f.setField('status', statusOptions[i].value);
  const el = statusRefs.value[i];
  if (el && typeof el.focus === 'function') el.focus();
}

// Presets de prazo coerentes por prioridade (min). Apenas sugestões, editáveis.
const presetsByPriority = {
  low: [
    { label: '4 h / 3 dias', first: 240, resolution: 4320 },
    { label: '8 h / 5 dias', first: 480, resolution: 7200 },
  ],
  medium: [
    { label: '1 h / 1 dia', first: 60, resolution: 1440 },
    { label: '2 h / 2 dias', first: 120, resolution: 2880 },
  ],
  high: [
    { label: '30 min / 8 h', first: 30, resolution: 480 },
    { label: '1 h / 12 h', first: 60, resolution: 720 },
  ],
  urgent: [
    { label: '15 min / 4 h', first: 15, resolution: 240 },
    { label: '10 min / 2 h', first: 10, resolution: 120 },
  ],
};

// ---- Formulário --------------------------------------------------------------
const f = useForm({
  initial: {
    name: '',
    priority: 'medium',
    first_response_mins: '',
    resolution_mins: '',
    business_hours_only: false,
    status: 'active',
  },
  rules: {
    name: [validators.required('Informe o nome da política'), validators.minLen(2), validators.maxLen(80)],
    priority: [validators.required('Escolha a prioridade alvo')],
    first_response_mins: [
      validators.required('Informe o tempo de primeira resposta'),
      validators.numeric('Use apenas números'),
      validators.min(1, 'Deve ser de pelo menos 1 minuto'),
      validators.max(525600, 'Valor muito alto (máx. 1 ano)'),
    ],
    resolution_mins: [
      validators.required('Informe o tempo de resolução'),
      validators.numeric('Use apenas números'),
      validators.min(1, 'Deve ser de pelo menos 1 minuto'),
      validators.max(525600, 'Valor muito alto (máx. 1 ano)'),
    ],
  },
});

// ---- Derivados ---------------------------------------------------------------
const hasFirst = computed(() => isPositive(f.values.first_response_mins));
const hasResolution = computed(() => isPositive(f.values.resolution_mins));

const inconsistentDeadlines = computed(() => {
  if (!hasFirst.value || !hasResolution.value) return false;
  return Number(f.values.resolution_mins) < Number(f.values.first_response_mins);
});

const activePresets = computed(() => presetsByPriority[f.values.priority] || presetsByPriority.medium);

const firstResponseHint = computed(() => {
  if (f.errors.first_response_mins) return undefined;
  if (hasFirst.value) return 'Equivale a ' + formatMinutes(f.values.first_response_mins) + '.';
  return 'Prazo máximo para o atendente dar o primeiro retorno ao solicitante.';
});

const resolutionHint = computed(() => {
  if (f.errors.resolution_mins) return undefined;
  if (hasResolution.value) return 'Equivale a ' + formatMinutes(f.values.resolution_mins) + '.';
  return 'Prazo máximo para encerrar o chamado por completo.';
});

const previewSentence = computed(() => {
  const pri = priorityLabel(f.values.priority).toLowerCase();
  const window = f.values.business_hours_only ? 'em horário comercial' : 'de forma contínua (24x7)';
  if (!hasFirst.value || !hasResolution.value) {
    return 'Preencha os prazos para ver como o worker calculará as datas-limite de chamados ' + pri + 's.';
  }
  return (
    'Chamados ' + pri + 's terão até ' + formatMinutes(f.values.first_response_mins) +
    ' para a primeira resposta e ' + formatMinutes(f.values.resolution_mins) +
    ' para a resolução, contados ' + window + '.'
  );
});

// ---- Detecção de duplicidade por nome ----------------------------------------
// dupState: idle | checking | found | clean | error
const dupState = ref('idle');
const duplicates = ref([]);
let lastChecked = '';

const nameHint = computed(() => {
  if (dupState.value === 'checking') return 'Verificando se já existe uma política com este nome…';
  if (dupState.value === 'clean') return 'Nenhuma política com este nome. Tudo certo.';
  if (dupState.value === 'error') return 'Não foi possível verificar duplicidade agora — você ainda pode salvar.';
  return 'Procuramos políticas existentes com nome parecido para evitar prazos conflitantes.';
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
    const res = await slaApi.list({ q: f.values.name, pageSize: 5 });
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

// ---- Presets / atalhos -------------------------------------------------------
function applyPreset(preset) {
  f.setField('first_response_mins', String(preset.first));
  f.setField('resolution_mins', String(preset.resolution));
}

// ---- Helpers -----------------------------------------------------------------
function isPositive(v) {
  const n = Number(v);
  return v !== '' && v !== null && v !== undefined && isFinite(n) && n > 0;
}

function normalize(s) {
  return String(s || '').trim().toLowerCase();
}

function formatMinutes(mins) {
  const n = Number(mins);
  if (!isFinite(n) || n <= 0) return '—';
  if (n < 60) return n + ' min';
  if (n % 1440 === 0) {
    const d = n / 1440;
    return d + (d === 1 ? ' dia' : ' dias');
  }
  const h = Math.floor(n / 60);
  const m = n % 60;
  if (m === 0) return h + (h === 1 ? ' hora' : ' horas');
  return h + 'h ' + m + 'min';
}

function priorityLabel(p) {
  const map = { urgent: 'Urgente', high: 'Alta', medium: 'Média', low: 'Baixa' };
  return map[p] || (p ? p : 'Média');
}

// Extrai o id do registro criado de forma resiliente ao envelope do POST: o
// resourceFactory.create devolve o JSON cru do backend, que pode vir como o
// objeto direto, embrulhado em { data } ou em { item } (variações comuns de API).
function extractId(created) {
  return created?.id ?? created?.data?.id ?? created?.item?.id ?? null;
}

// ---- Envio -------------------------------------------------------------------
const submitError = ref('');

function buildPayload(vals) {
  return {
    name: vals.name.trim(),
    priority: vals.priority,
    first_response_mins: Number(vals.first_response_mins),
    resolution_mins: Number(vals.resolution_mins),
    business_hours_only: !!vals.business_hours_only,
    status: vals.status || 'active',
  };
}

function submit() {
  submitError.value = '';
  f.handleSubmit(async (vals) => {
    // Confirmação 1: nome duplicado
    if (dupState.value === 'found' && duplicates.value.length) {
      const ok = await confirm({
        title: 'Criar mesmo com nome duplicado?',
        message:
          'Encontramos ' +
          duplicates.value.length +
          ' política(s) com este nome. Deseja criar uma nova política mesmo assim?',
        confirmLabel: 'Criar mesmo assim',
        cancelLabel: 'Revisar',
        danger: true,
      });
      if (!ok) return;
    }
    // Confirmação 2: prazos incoerentes (resolução < 1ª resposta)
    if (inconsistentDeadlines.value) {
      const ok = await confirm({
        title: 'Confirmar prazos invertidos?',
        message:
          'O tempo de resolução (' +
          formatMinutes(vals.resolution_mins) +
          ') está menor que o de primeira resposta (' +
          formatMinutes(vals.first_response_mins) +
          '). Deseja salvar assim mesmo?',
        confirmLabel: 'Salvar assim',
        cancelLabel: 'Revisar prazos',
        danger: true,
      });
      if (!ok) return;
    }

    try {
      const created = await slaApi.create(buildPayload(vals));
      toast.success('Política de SLA criada', { detail: vals.name.trim() });
      const id = extractId(created);
      router.push(id ? '/sla-policies/' + id : '/sla-policies');
    } catch (e) {
      const msg = e && e.message ? e.message : 'Falha ao criar a política de SLA.';
      submitError.value = msg;
      toast.error('Não foi possível criar a política', {
        detail: msg,
        code: e && e.status ? 'HTTP ' + e.status : '',
      });
    }
  });
}

const cancel = () => router.push('/sla-policies');

onMounted(() => {
  // Foca o primeiro campo ao abrir o formulário (padrão SICAT/GymOps p/ fluência de teclado).
  // preventScroll evita salto abrupto de rolagem, respeitando preferências de movimento.
  const el = nameInput.value;
  if (el && typeof el.focus === 'function') {
    el.focus({ preventScroll: true });
  }
  // Nada a carregar: prioridade/situação são enums fixos.
});
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

/* ---- Seletor de prioridade (cards radio acessíveis, CSP-safe) ---- */
.hf-priority {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: var(--ui-space-3);
}
.hf-priority-opt {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 3px;
  text-align: left;
  font: inherit;
  cursor: pointer;
  padding: var(--ui-space-3);
  border: 1px solid rgb(var(--ui-border-strong));
  border-radius: var(--ui-radius-md);
  background: rgb(var(--ui-surface));
  transition: border-color 0.15s ease, background 0.15s ease, box-shadow 0.15s ease;
}
.hf-priority-opt:hover {
  border-color: rgb(var(--ui-accent) / 0.6);
}
.hf-priority-opt[data-active="true"] {
  border-color: rgb(var(--ui-accent));
  background: rgb(var(--ui-accent) / 0.06);
  box-shadow: var(--ui-shadow-sm);
}
.hf-priority-dot {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: rgb(var(--ui-faint));
}
.hf-priority-opt[data-tone="muted"] .hf-priority-dot { background: rgb(var(--ui-faint)); }
.hf-priority-opt[data-tone="accent"] .hf-priority-dot { background: rgb(var(--ui-accent)); }
.hf-priority-opt[data-tone="warn"] .hf-priority-dot { background: rgb(var(--ui-warn)); }
.hf-priority-opt[data-tone="danger"] .hf-priority-dot { background: rgb(var(--ui-danger)); }
.hf-priority-label {
  font-weight: 700;
  font-size: var(--ui-text-sm);
  color: rgb(var(--ui-fg));
}
.hf-priority-desc {
  font-size: var(--ui-text-xs);
  color: rgb(var(--ui-muted));
}

/* ---- Sugestões de prazo (chips) ---- */
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
  transition: background 0.15s ease;
}
.hf-chip:hover {
  background: rgb(var(--ui-accent) / 0.20);
}

/* ---- Aviso de coerência ---- */
.hf-warn {
  margin: 0 0 var(--ui-space-5);
  padding: var(--ui-space-3) var(--ui-space-4);
  border: 1px solid rgb(var(--ui-warn) / 0.4);
  background: rgb(var(--ui-warn) / 0.08);
  color: rgb(var(--ui-warn));
  border-radius: var(--ui-radius-md);
  font-size: var(--ui-text-sm);
  font-weight: 600;
}

/* ---- Toggle (switch acessível) ---- */
.hf-toggle {
  display: flex;
  align-items: flex-start;
  gap: var(--ui-space-3);
  width: 100%;
  text-align: left;
  font: inherit;
  cursor: pointer;
  background: rgb(var(--ui-surface));
  border: 1px solid rgb(var(--ui-border-strong));
  border-radius: var(--ui-radius-md);
  padding: var(--ui-space-3) var(--ui-space-4);
  transition: border-color 0.15s ease, background 0.15s ease;
}
.hf-toggle[data-on="true"] {
  border-color: rgb(var(--ui-accent));
  background: rgb(var(--ui-accent) / 0.06);
}
.hf-toggle-track {
  flex-shrink: 0;
  margin-top: 2px;
  width: 40px;
  height: 22px;
  border-radius: var(--ui-radius-pill);
  background: rgb(var(--ui-faint) / 0.5);
  position: relative;
  transition: background 0.15s ease;
}
.hf-toggle[data-on="true"] .hf-toggle-track {
  background: rgb(var(--ui-accent));
}
.hf-toggle-knob {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: rgb(var(--ui-surface));
  box-shadow: var(--ui-shadow-sm);
  transition: transform 0.15s ease;
}
.hf-toggle[data-on="true"] .hf-toggle-knob {
  transform: translateX(18px);
}
.hf-toggle-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.hf-toggle-state {
  font-weight: 700;
  font-size: var(--ui-text-sm);
  color: rgb(var(--ui-fg));
}
.hf-toggle-desc {
  font-size: var(--ui-text-xs);
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
  justify-content: space-between;
  gap: var(--ui-space-3);
  margin-bottom: var(--ui-space-3);
}
.hf-preview-eyebrow {
  text-transform: uppercase;
  letter-spacing: 0.07em;
  font-size: var(--ui-text-xs);
  font-weight: 700;
  color: rgb(var(--ui-accent-strong));
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
  .hf-priority {
    grid-template-columns: repeat(2, 1fr);
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
