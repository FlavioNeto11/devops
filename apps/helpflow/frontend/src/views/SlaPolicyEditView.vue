<template>
  <UiPageLayout
    eyebrow="Políticas de SLA"
    title="Editar política de SLA"
    :subtitle="headerSubtitle"
    width="narrow"
    :loading="loading"
    loading-message="Carregando a política de SLA…"
    :error="loadError"
    @retry="reload"
  >
    <template #actions>
      <UiButton variant="ghost" :to="LIST_ROUTE">Voltar para a lista</UiButton>
      <UiButton variant="subtle" :to="detailTo" :disabled="!record">Ver política</UiButton>
    </template>

    <!-- Estado: registro inexistente (carregou sem erro, mas sem dados) -->
    <UiEmptyState
      v-if="loaded && !record"
      icon="◌"
      title="Política não encontrada"
      description="A política de SLA que você tentou editar não existe mais ou foi removida do service desk."
    >
      <template #action>
        <UiButton :to="LIST_ROUTE">Voltar para políticas de SLA</UiButton>
      </template>
    </UiEmptyState>

    <!-- Estado normal: identidade + formulário de edição -->
    <template v-else-if="loaded && record">
      <!-- Identidade viva da política (contexto de quem está sendo editado) -->
      <UiCard class="sla-identity-card">
        <div class="sla-identity">
          <span class="sla-glyph" :data-tone="currentPriorityTone" aria-hidden="true">⏱</span>
          <div class="sla-identity-id">
            <p class="sla-identity-name">{{ displayName }}</p>
            <p class="sla-identity-sub">
              Meta de prioridade <strong>{{ currentPriorityLabel }}</strong>
              <span class="sla-identity-sep" aria-hidden="true">·</span>
              {{ f.values.business_hours_only ? 'Horário comercial' : 'Contagem 24×7' }}
            </p>
          </div>
          <div class="sla-identity-badges">
            <UiStatusBadge :status="f.values.priority" :tone="currentPriorityTone" :label="currentPriorityLabel" size="lg" />
            <UiStatusBadge :status="f.values.status" size="lg" />
          </div>
        </div>
      </UiCard>

      <!-- Aviso: política inativa não vale para novos chamados -->
      <UiCard v-if="willInactivate" padded class="sla-warn">
        <p class="sla-warn-text">
          <span class="sla-warn-mark" aria-hidden="true">!</span>
          <span>
            Você está <strong>inativando</strong> esta política. Novos chamados de prioridade
            <strong>{{ currentPriorityLabel }}</strong> deixarão de seguir estes prazos até que ela seja
            reativada — será pedida confirmação ao salvar.
          </span>
        </p>
      </UiCard>

      <!-- Banner de falha de salvamento (independente do loadError do PageLayout) -->
      <UiErrorState
        v-if="saveError"
        class="sla-save-error"
        :message="saveError"
        :retryable="false"
      >
        <template #action>
          <UiButton variant="subtle" @click="dismissSaveError">Fechar aviso</UiButton>
        </template>
      </UiErrorState>

      <UiCard title="Dados da política" subtitle="Edição dos tempos e parâmetros do SLA, com confirmação ao salvar.">
        <form
          ref="formEl"
          class="sla-form"
          novalidate
          aria-label="Editar política de SLA"
          @submit.prevent="save"
          @keydown="onFormKeydown"
        >
          <!-- Identificação -->
          <UiFormSection title="Identificação" description="Como esta política é reconhecida no service desk." :columns="1">
            <UiFormField
              label="Nome"
              :required="true"
              :error="f.errors.name"
              full-width
              hint="Ex.: SLA Padrão, SLA Crítico de Produção."
            >
              <template #default="{ id, describedBy, hasError }">
                <input
                  :id="id"
                  ref="nameInput"
                  type="text"
                  autocomplete="off"
                  :aria-describedby="describedBy"
                  :aria-invalid="hasError ? 'true' : null"
                  :value="f.values.name"
                  placeholder="Ex.: SLA Crítico de Produção"
                  @input="f.setField('name', $event.target.value)"
                />
              </template>
            </UiFormField>
          </UiFormSection>

          <!-- Priority picker — cartões de rádio acessíveis -->
          <UiFormSection
            title="Prioridade alvo"
            description="Os prazos abaixo se aplicam aos chamados desta prioridade."
            :columns="1"
          >
            <UiFormField full-width :error="f.errors.priority" :required="true" label="Selecione a prioridade">
              <template #default="{ id, describedBy, hasError }">
                <div
                  :id="id"
                  class="sla-priorities"
                  role="radiogroup"
                  aria-label="Prioridade alvo da política"
                  :aria-describedby="describedBy"
                  :aria-invalid="hasError ? 'true' : null"
                >
                  <label
                    v-for="p in PRIORITIES"
                    :key="p.value"
                    class="sla-priority"
                    :data-selected="f.values.priority === p.value ? 'true' : 'false'"
                  >
                    <input
                      class="sla-priority-input"
                      type="radio"
                      name="sla-priority"
                      :value="p.value"
                      :checked="f.values.priority === p.value"
                      @change="f.setField('priority', p.value)"
                    />
                    <span class="sla-priority-mark" aria-hidden="true" :data-tone="p.tone" />
                    <span class="sla-priority-body">
                      <span class="sla-priority-head">
                        <span class="sla-priority-name">{{ p.label }}</span>
                        <UiStatusBadge :status="p.value" :tone="p.tone" :label="p.label" size="sm" />
                      </span>
                      <span class="sla-priority-desc">{{ p.description }}</span>
                    </span>
                  </label>
                </div>
              </template>
            </UiFormField>
          </UiFormSection>

          <!-- Tempos do SLA -->
          <UiFormSection
            title="Tempos do SLA"
            description="Defina os prazos em minutos. A leitura amigável aparece abaixo de cada campo."
            :columns="2"
          >
            <UiFormField
              label="1ª resposta (min)"
              :required="true"
              :error="f.errors.first_response_mins"
              :hint="firstResponseHint"
            >
              <template #default="{ id, describedBy, hasError }">
                <input
                  :id="id"
                  type="number"
                  inputmode="numeric"
                  min="1"
                  step="1"
                  :aria-describedby="describedBy"
                  :aria-invalid="hasError ? 'true' : null"
                  :value="f.values.first_response_mins"
                  placeholder="Ex.: 30"
                  @input="f.setField('first_response_mins', $event.target.value)"
                />
              </template>
            </UiFormField>

            <UiFormField
              label="Resolução (min)"
              :required="true"
              :error="f.errors.resolution_mins"
              :hint="resolutionHint"
            >
              <template #default="{ id, describedBy, hasError }">
                <input
                  :id="id"
                  type="number"
                  inputmode="numeric"
                  min="1"
                  step="1"
                  :aria-describedby="describedBy"
                  :aria-invalid="hasError ? 'true' : null"
                  :value="f.values.resolution_mins"
                  placeholder="Ex.: 240"
                  @input="f.setField('resolution_mins', $event.target.value)"
                />
              </template>
            </UiFormField>
          </UiFormSection>

          <!-- Atalhos de tempo comuns -->
          <div class="sla-presets" role="group" aria-label="Atalhos de prazo de resolução">
            <span class="sla-presets-label">Resolução rápida:</span>
            <button
              v-for="preset in RESOLUTION_PRESETS"
              :key="preset.value"
              type="button"
              class="sla-preset"
              :data-active="String(f.values.resolution_mins) === String(preset.value) ? 'true' : 'false'"
              @click="f.setField('resolution_mins', String(preset.value))"
            >{{ preset.label }}</button>
          </div>

          <!-- Parâmetros & situação -->
          <UiFormSection title="Parâmetros & situação" description="Janela de contagem e estado da política." :columns="1">
            <UiFormField
              label="Janela de contagem"
              hint="Se ativado, os prazos só contam dentro do horário comercial (seg–sex, expediente). Senão, contam 24×7."
            >
              <template #default="{ id, describedBy }">
                <label class="sla-toggle" :data-on="f.values.business_hours_only ? 'true' : 'false'">
                  <input
                    :id="id"
                    type="checkbox"
                    class="sla-toggle-input"
                    role="switch"
                    :aria-checked="f.values.business_hours_only ? 'true' : 'false'"
                    :aria-describedby="describedBy"
                    :checked="f.values.business_hours_only"
                    @change="f.setField('business_hours_only', $event.target.checked)"
                  />
                  <span class="sla-toggle-track" aria-hidden="true"><span class="sla-toggle-thumb" /></span>
                  <span class="sla-toggle-text">
                    {{ f.values.business_hours_only ? 'Só horário comercial' : 'Contagem 24×7 (contínua)' }}
                  </span>
                </label>
              </template>
            </UiFormField>

            <UiFormField label="Situação" :error="f.errors.status" :required="true" hint="Inativar suspende esta política para novos chamados.">
              <template #default="{ id, describedBy }">
                <select
                  :id="id"
                  :aria-describedby="describedBy"
                  :value="f.values.status"
                  @change="f.setField('status', $event.target.value)"
                >
                  <option v-for="opt in STATUS_OPTIONS" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
                </select>
              </template>
            </UiFormField>
          </UiFormSection>

          <!-- Resumo ao vivo da política (preview) -->
          <div class="sla-preview" :data-invalid="hasTimeError ? 'true' : 'false'">
            <p class="sla-preview-title">Resumo da política</p>
            <div class="sla-preview-grid">
              <div class="sla-preview-item">
                <span class="sla-preview-k">Prioridade</span>
                <span class="sla-preview-v">{{ currentPriorityLabel }}</span>
              </div>
              <div class="sla-preview-item">
                <span class="sla-preview-k">1ª resposta</span>
                <span class="sla-preview-v">{{ firstResponseSummary }}</span>
              </div>
              <div class="sla-preview-item">
                <span class="sla-preview-k">Resolução</span>
                <span class="sla-preview-v">{{ resolutionSummary }}</span>
              </div>
              <div class="sla-preview-item">
                <span class="sla-preview-k">Contagem</span>
                <span class="sla-preview-v">{{ f.values.business_hours_only ? 'Horário comercial' : '24×7 contínua' }}</span>
              </div>
            </div>
            <p v-if="orderWarning" class="sla-preview-note">{{ orderWarning }}</p>
          </div>

          <!-- Metadados read-only -->
          <dl class="sla-meta">
            <div class="sla-meta-row">
              <dt>Tenant</dt>
              <dd class="sla-mono">{{ tenantLabel }}</dd>
            </div>
            <div class="sla-meta-row">
              <dt>Atualizado em</dt>
              <dd>{{ updatedAtLabel }}</dd>
            </div>
            <div class="sla-meta-row">
              <dt>ID da política</dt>
              <dd class="sla-mono">{{ record.id }}</dd>
            </div>
          </dl>

          <!-- SubmitBar -->
          <div class="sla-submitbar">
            <p class="sla-submitbar-note" :data-state="submitNoteState" role="status" aria-live="polite">
              <span class="sla-dot" aria-hidden="true" />
              {{ submitNote }}
            </p>
            <div class="sla-submitbar-actions">
              <UiButton variant="ghost" type="button" :disabled="!isDirty || f.submitting.value" @click="resetChanges">Desfazer</UiButton>
              <UiButton variant="ghost" type="button" :disabled="f.submitting.value" @click="cancel">Cancelar</UiButton>
              <UiButton type="submit" :loading="f.submitting.value" :disabled="!isDirty">Salvar alterações</UiButton>
            </div>
          </div>
          <p class="sla-shortcut-hint">Dica: pressione <kbd>Ctrl</kbd> + <kbd>Enter</kbd> para salvar.</p>
        </form>
      </UiCard>
    </template>
  </UiPageLayout>
</template>

<script setup>
import { computed, nextTick, onMounted, reactive, ref } from 'vue';
import { useRouter, onBeforeRouteLeave } from 'vue-router';
import {
  UiPageLayout,
  UiCard,
  UiButton,
  UiFormSection,
  UiFormField,
  UiStatusBadge,
  UiEmptyState,
  UiErrorState,
  useForm,
  useToast,
  useConfirm,
  validators,
  format,
} from '../ui/index.js';
import { slaPolicies } from '../api.js';

const props = defineProps({ id: { type: String, default: null } });

const router = useRouter();
const toast = useToast();
const confirm = useConfirm();

// Rotas de DOMÍNIO (nunca /records): lista e detalhe de políticas de SLA.
const LIST_ROUTE = '/sla-policies';
const detailTo = computed(() => (props.id ? LIST_ROUTE + '/' + props.id : LIST_ROUTE));

const loading = ref(true);
const loaded = ref(false);
const loadError = ref(null);
const saveError = ref(null);
const record = ref(null);

// refs de foco (a11y): primeiro campo ao montar; 1º inválido ao falhar a validação.
const formEl = ref(null);
const nameInput = ref(null);

// Prioridades (enum do domínio) com descrição — base do priority picker.
const PRIORITIES = [
  { value: 'urgent', label: 'Urgente', tone: 'error', description: 'Indisponibilidade crítica ou impacto severo. Resposta imediata.' },
  { value: 'high', label: 'Alta', tone: 'warning', description: 'Impacto relevante ao negócio. Atendimento acelerado.' },
  { value: 'medium', label: 'Média', tone: 'running', description: 'Impacto moderado. Atendimento dentro do fluxo normal.' },
  { value: 'low', label: 'Baixa', tone: 'neutral', description: 'Dúvidas e solicitações sem urgência.' },
];
const PRIORITY_MAP = PRIORITIES.reduce((acc, p) => { acc[p.value] = p; return acc; }, {});

const STATUS_OPTIONS = [
  { value: 'active', label: 'Ativa' },
  { value: 'inactive', label: 'Inativa' },
];

// Atalhos de tempo comuns p/ a resolução (minutos).
const RESOLUTION_PRESETS = [
  { value: 60, label: '1 h' },
  { value: 240, label: '4 h' },
  { value: 480, label: '8 h' },
  { value: 1440, label: '1 dia' },
  { value: 2880, label: '2 dias' },
];

const f = useForm({
  initial: { name: '', priority: '', first_response_mins: '', resolution_mins: '', business_hours_only: false, status: 'active' },
  rules: {
    name: [validators.required('Informe o nome da política'), validators.minLen(2), validators.maxLen(120)],
    priority: [validators.required('Selecione a prioridade alvo')],
    first_response_mins: [validators.required('Informe o tempo de 1ª resposta'), validators.numeric('Use apenas números'), validators.min(1, 'Deve ser ao menos 1 minuto')],
    resolution_mins: [validators.required('Informe o tempo de resolução'), validators.numeric('Use apenas números'), validators.min(1, 'Deve ser ao menos 1 minuto')],
    status: [validators.required('Selecione a situação')],
  },
});

// snapshot do estado original p/ detectar alterações (dirty), desfazer e comparar situação.
const baseline = reactive({ name: '', priority: '', first_response_mins: '', resolution_mins: '', business_hours_only: false, status: 'active' });

const headerSubtitle = computed(() => {
  if (loadError.value || !record.value) return 'Edição dos tempos e parâmetros da política de SLA, com confirmação ao salvar.';
  const name = (f.values.name || '').trim();
  return name ? 'Editando "' + name + '".' : 'Edição dos tempos e parâmetros da política de SLA, com confirmação ao salvar.';
});

const displayName = computed(() => (f.values.name || '').trim() || 'Política sem nome');
const currentPriorityLabel = computed(() => priorityLabel(f.values.priority));
const currentPriorityTone = computed(() => priorityTone(f.values.priority));

const willInactivate = computed(() => f.values.status === 'inactive' && baseline.status !== 'inactive');

// leitura amigável dos prazos (min -> "1 h 30 min")
const firstResponseSummary = computed(() => humanizeMinutes(f.values.first_response_mins));
const resolutionSummary = computed(() => humanizeMinutes(f.values.resolution_mins));
const firstResponseHint = computed(() => durationHint(f.values.first_response_mins));
const resolutionHint = computed(() => durationHint(f.values.resolution_mins));

const hasTimeError = computed(() => !!(f.errors.first_response_mins || f.errors.resolution_mins));

// coerência: a resolução deve ser >= 1ª resposta (aviso suave, não bloqueia)
const orderWarning = computed(() => {
  const fr = toMins(f.values.first_response_mins);
  const rs = toMins(f.values.resolution_mins);
  if (fr === null || rs === null) return '';
  if (rs < fr) return 'Atenção: a resolução está menor que a 1ª resposta — revise os prazos.';
  return '';
});

const isDirty = computed(() => {
  for (const k of Object.keys(baseline)) {
    if (normalize(f.values[k]) !== normalize(baseline[k])) return true;
  }
  return false;
});

const submitNoteState = computed(() => {
  if (willInactivate.value) return 'inactivate';
  if (isDirty.value) return 'dirty';
  return 'clean';
});
const submitNote = computed(() => {
  if (willInactivate.value) return 'Inativação pendente — confirmaremos ao salvar.';
  if (isDirty.value) return 'Há alterações não salvas.';
  return 'Tudo salvo.';
});

const tenantLabel = computed(() => {
  const t = record.value && record.value.tenant_id;
  return t !== null && t !== undefined && t !== '' ? '#' + t : '—';
});
const updatedAtLabel = computed(() => {
  const v = record.value && (record.value.updated_at || record.value.created_at);
  return v ? format.formatDateTime(v) : '—';
});

function normalize(v) {
  if (v === null || v === undefined) return '';
  if (typeof v === 'boolean') return v;
  return String(v).trim();
}
function toMins(v) {
  if (v === '' || v === null || v === undefined) return null;
  const n = Number(v);
  return isFinite(n) ? n : null;
}
function priorityTone(p) {
  const p0 = PRIORITY_MAP[String(p).toLowerCase()];
  return p0 ? p0.tone : 'neutral';
}
function priorityLabel(p) {
  if (!p) return '—';
  const p0 = PRIORITY_MAP[String(p).toLowerCase()];
  return p0 ? p0.label : format.humanize(p);
}
// minutos -> "2 dias", "3 h 15 min", "45 min"
function humanizeMinutes(v) {
  const n = toMins(v);
  if (n === null || n <= 0) return '—';
  const days = Math.floor(n / 1440);
  const hours = Math.floor((n % 1440) / 60);
  const mins = n % 60;
  const parts = [];
  if (days) parts.push(days + (days === 1 ? ' dia' : ' dias'));
  if (hours) parts.push(hours + ' h');
  if (mins) parts.push(mins + ' min');
  return parts.length ? parts.join(' ') : '0 min';
}
function durationHint(v) {
  const human = humanizeMinutes(v);
  return human === '—' ? 'Tempo em minutos.' : 'Equivale a ' + human + '.';
}

function hydrate(rec) {
  const next = {
    name: rec.name || '',
    priority: rec.priority || '',
    first_response_mins: rec.first_response_mins != null && rec.first_response_mins !== '' ? String(rec.first_response_mins) : '',
    resolution_mins: rec.resolution_mins != null && rec.resolution_mins !== '' ? String(rec.resolution_mins) : '',
    business_hours_only: !!rec.business_hours_only,
    status: rec.status || 'active',
  };
  for (const k of Object.keys(next)) {
    f.values[k] = next[k];
    baseline[k] = next[k];
  }
}

async function reload() {
  if (!props.id) {
    loadError.value = 'Nenhuma política selecionada para edição.';
    loading.value = false;
    return;
  }
  loading.value = true;
  loadError.value = null;
  saveError.value = null;
  loaded.value = false;
  try {
    const rec = await slaPolicies.get(props.id);
    record.value = rec || null;
    if (rec) hydrate(rec);
    loaded.value = true;
    if (rec) {
      await nextTick();
      if (nameInput.value && typeof nameInput.value.focus === 'function') nameInput.value.focus();
    }
  } catch (e) {
    loadError.value = e && e.message ? e.message : 'Não foi possível carregar a política de SLA.';
  } finally {
    loading.value = false;
  }
}

// a11y: move o foco para o primeiro campo inválido após a validação reprovar.
async function focusFirstInvalid() {
  await nextTick();
  const root = formEl.value;
  if (!root) return;
  const el = root.querySelector('[aria-invalid="true"]');
  if (el && typeof el.focus === 'function') el.focus();
}

function buildPayload(vals) {
  return {
    name: vals.name.trim(),
    priority: vals.priority,
    first_response_mins: Number(vals.first_response_mins),
    resolution_mins: Number(vals.resolution_mins),
    business_hours_only: !!vals.business_hours_only,
    status: vals.status,
  };
}

function dismissSaveError() {
  saveError.value = null;
}

function onFormKeydown(e) {
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
    e.preventDefault();
    save();
  }
}

function save() {
  if (!isDirty.value) return;
  // valida antes do submit p/ mover o foco ao 1º campo inválido (a11y).
  // handleSubmit revalida internamente (idempotente), então é seguro.
  if (!f.validate()) {
    focusFirstInvalid();
    toast.warning('Revise os campos destacados antes de salvar.');
    return;
  }
  f.handleSubmit(async (vals) => {
    const who = vals.name.trim() || ('#' + props.id);
    const inactivating = vals.status === 'inactive' && baseline.status !== 'inactive';

    const ok = await confirm({
      title: inactivating ? 'Confirmar inativação' : 'Salvar alterações',
      message: inactivating
        ? 'Você vai inativar a política "' + who + '". Novos chamados de prioridade ' + priorityLabel(vals.priority) + ' deixarão de seguir estes prazos. Confirmar?'
        : 'Confirmar a atualização da política "' + who + '" (1ª resposta ' + humanizeMinutes(vals.first_response_mins) + ', resolução ' + humanizeMinutes(vals.resolution_mins) + ')?',
      confirmLabel: inactivating ? 'Inativar' : 'Salvar',
      cancelLabel: 'Revisar',
      danger: inactivating,
    });
    if (!ok) return;

    saveError.value = null;
    try {
      const updated = await slaPolicies.update(props.id, buildPayload(vals));
      if (updated && typeof updated === 'object' && updated.id !== undefined) {
        record.value = updated;
        hydrate(updated);
      } else {
        // backend sem corpo de resposta: promove o estado atual a baseline.
        for (const k of Object.keys(baseline)) baseline[k] = f.values[k];
      }
      toast.success('Política de SLA atualizada.');
      router.push(detailTo.value);
    } catch (e) {
      const msg = e && e.message ? e.message : 'Falha ao salvar a política de SLA.';
      saveError.value = msg;
      toast.error(msg, { detail: e && e.message, code: e && e.status });
    }
  });
}

async function resetChanges() {
  if (!isDirty.value) return;
  const ok = await confirm({
    title: 'Desfazer alterações?',
    message: 'Restaurar todos os campos para os valores originais da política?',
    confirmLabel: 'Desfazer',
    cancelLabel: 'Continuar editando',
    danger: true,
  });
  if (!ok) return;
  for (const k of Object.keys(baseline)) f.values[k] = baseline[k];
  for (const k of Object.keys(f.errors)) delete f.errors[k];
  saveError.value = null;
  await nextTick();
  if (nameInput.value && typeof nameInput.value.focus === 'function') nameInput.value.focus();
  toast.info('Alterações descartadas.');
}

async function confirmLeave() {
  if (!isDirty.value || f.submitting.value) return true;
  return confirm({
    title: 'Descartar alterações?',
    message: 'Você tem alterações não salvas. Sair sem salvar?',
    confirmLabel: 'Descartar',
    cancelLabel: 'Continuar editando',
    danger: true,
  });
}

async function cancel() {
  if (await confirmLeave()) router.push(detailTo.value);
}

// Guarda de navegação: protege contra perda de alterações ao sair da rota.
onBeforeRouteLeave(async () => {
  if (await confirmLeave()) return true;
  return false;
});

onMounted(reload);
</script>

<style scoped>
.sla-form {
  display: flex;
  flex-direction: column;
}

/* ---- identidade viva da política (read-only) ----------------------------- */
.sla-identity {
  display: flex;
  align-items: center;
  gap: var(--ui-space-4);
  flex-wrap: wrap;
}
.sla-glyph {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 52px;
  height: 52px;
  flex-shrink: 0;
  border-radius: var(--ui-radius-md);
  background: rgb(var(--ui-accent) / 0.14);
  color: rgb(var(--ui-accent-strong));
  border: 1px solid rgb(var(--ui-accent) / 0.26);
  font-size: var(--ui-text-xl);
}
.sla-glyph[data-tone='error'] {
  background: rgb(var(--ui-danger) / 0.14);
  color: rgb(var(--ui-danger));
  border-color: rgb(var(--ui-danger) / 0.30);
}
.sla-glyph[data-tone='warning'] {
  background: rgb(var(--ui-warn) / 0.16);
  color: rgb(var(--ui-warn));
  border-color: rgb(var(--ui-warn) / 0.32);
}
.sla-identity-id {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  flex: 1 1 auto;
}
.sla-identity-name {
  margin: 0;
  font-family: var(--ui-font-display);
  font-weight: 700;
  font-size: var(--ui-text-lg);
  color: rgb(var(--ui-fg));
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.sla-identity-sub {
  margin: 0;
  display: flex;
  align-items: center;
  gap: var(--ui-space-2);
  flex-wrap: wrap;
  color: rgb(var(--ui-muted));
  font-size: var(--ui-text-sm);
}
.sla-identity-sub strong {
  color: rgb(var(--ui-fg));
}
.sla-identity-sep {
  color: rgb(var(--ui-faint));
}
.sla-identity-badges {
  display: flex;
  gap: var(--ui-space-2);
  flex-wrap: wrap;
  flex-shrink: 0;
}

/* ---- aviso de inativação ------------------------------------------------- */
.sla-warn {
  border-color: rgb(var(--ui-warn) / 0.45);
  background: rgb(var(--ui-warn) / 0.08);
}
.sla-warn :deep(.ui-card-body) {
  padding: var(--ui-space-4) var(--ui-space-5);
}
.sla-warn-text {
  display: flex;
  align-items: flex-start;
  gap: var(--ui-space-3);
  margin: 0;
  color: rgb(var(--ui-fg));
  font-size: var(--ui-text-sm);
  line-height: 1.5;
}
.sla-warn-text strong {
  color: rgb(var(--ui-fg));
}
.sla-warn-mark {
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

.sla-save-error {
  margin: 0;
}

/* ---- priority picker — cartões de rádio ---------------------------------- */
.sla-priorities {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: var(--ui-space-3);
}
.sla-priority {
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
.sla-priority:hover {
  border-color: rgb(var(--ui-accent) / 0.6);
  background: rgb(var(--ui-surface-2));
}
.sla-priority[data-selected='true'] {
  border-color: rgb(var(--ui-accent));
  background: rgb(var(--ui-accent) / 0.08);
  box-shadow: 0 0 0 1px rgb(var(--ui-accent));
}
.sla-priority-input {
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
.sla-priority-mark {
  flex-shrink: 0;
  width: 18px;
  height: 18px;
  margin-top: 2px;
  border-radius: 50%;
  border: 2px solid rgb(var(--ui-border-strong));
  background: rgb(var(--ui-surface));
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}
.sla-priority[data-selected='true'] .sla-priority-mark {
  border-color: rgb(var(--ui-accent));
  box-shadow: inset 0 0 0 4px rgb(var(--ui-accent));
}
.sla-priority-input:focus-visible + .sla-priority-mark {
  outline: 2px solid rgb(var(--ui-accent));
  outline-offset: 2px;
}
.sla-priority-body {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}
.sla-priority-head {
  display: flex;
  align-items: center;
  gap: var(--ui-space-2);
  flex-wrap: wrap;
}
.sla-priority-name {
  font-weight: 700;
  color: rgb(var(--ui-fg));
}
.sla-priority-desc {
  font-size: var(--ui-text-xs);
  color: rgb(var(--ui-muted));
  line-height: 1.45;
}

/* ---- atalhos de tempo ---------------------------------------------------- */
.sla-presets {
  display: flex;
  align-items: center;
  gap: var(--ui-space-2);
  flex-wrap: wrap;
  margin: 0 0 var(--ui-space-5);
}
.sla-presets-label {
  font-size: var(--ui-text-xs);
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: rgb(var(--ui-muted));
}
.sla-preset {
  font: inherit;
  font-size: var(--ui-text-xs);
  font-weight: 600;
  padding: 4px var(--ui-space-3);
  border-radius: var(--ui-radius-pill);
  border: 1px solid rgb(var(--ui-border-strong));
  background: rgb(var(--ui-surface));
  color: rgb(var(--ui-muted));
  cursor: pointer;
  transition: border-color 0.15s ease, background 0.15s ease, color 0.15s ease;
}
.sla-preset:hover {
  border-color: rgb(var(--ui-accent) / 0.6);
  color: rgb(var(--ui-fg));
}
.sla-preset[data-active='true'] {
  border-color: rgb(var(--ui-accent));
  background: rgb(var(--ui-accent) / 0.12);
  color: rgb(var(--ui-accent-strong));
}
.sla-preset:focus-visible {
  outline: 2px solid rgb(var(--ui-accent));
  outline-offset: 2px;
}

/* ---- toggle (ToggleField) — checkbox real estilizado, CSP-safe ----------- */
.sla-toggle {
  --toggle-track-h: var(--ui-space-5);
  --toggle-thumb: var(--ui-space-4);
  --toggle-inset: var(--ui-space-1);
  display: inline-flex;
  align-items: center;
  gap: var(--ui-space-3);
  cursor: pointer;
  padding: var(--ui-space-1) 0;
  user-select: none;
}
.sla-toggle-input {
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
.sla-toggle-track {
  position: relative;
  flex: 0 0 auto;
  width: calc(var(--toggle-thumb) * 2 + var(--toggle-inset) * 2);
  height: var(--toggle-track-h);
  border-radius: var(--ui-radius-pill);
  background: rgb(var(--ui-muted) / 0.3);
  transition: background 0.15s ease;
}
.sla-toggle-thumb {
  position: absolute;
  top: var(--toggle-inset);
  left: var(--toggle-inset);
  width: var(--toggle-thumb);
  height: var(--toggle-thumb);
  border-radius: var(--ui-radius-pill);
  background: rgb(var(--ui-surface));
  box-shadow: var(--ui-shadow-sm);
  transition: transform 0.15s ease;
}
.sla-toggle[data-on='true'] .sla-toggle-track {
  background: rgb(var(--ui-accent));
}
.sla-toggle[data-on='true'] .sla-toggle-thumb {
  transform: translateX(var(--toggle-thumb));
}
.sla-toggle-input:focus-visible + .sla-toggle-track {
  outline: 2px solid rgb(var(--ui-accent));
  outline-offset: 2px;
}
.sla-toggle-text {
  font-size: var(--ui-text-sm);
  font-weight: 600;
  color: rgb(var(--ui-fg));
}

/* ---- resumo ao vivo da política ------------------------------------------ */
.sla-preview {
  margin: var(--ui-space-2) 0 var(--ui-space-5);
  padding: var(--ui-space-4);
  border: 1px solid rgb(var(--ui-accent) / 0.30);
  border-radius: var(--ui-radius-md);
  background: rgb(var(--ui-accent) / 0.05);
}
.sla-preview[data-invalid='true'] {
  border-color: rgb(var(--ui-danger) / 0.40);
  background: rgb(var(--ui-danger) / 0.05);
}
.sla-preview-title {
  margin: 0 0 var(--ui-space-3);
  font-size: var(--ui-text-xs);
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: rgb(var(--ui-accent-strong));
}
.sla-preview-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: var(--ui-space-3);
}
.sla-preview-item {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}
.sla-preview-k {
  font-size: var(--ui-text-xs);
  color: rgb(var(--ui-muted));
}
.sla-preview-v {
  font-family: var(--ui-font-display);
  font-weight: 700;
  font-size: var(--ui-text-md);
  color: rgb(var(--ui-fg));
  overflow: hidden;
  text-overflow: ellipsis;
}
.sla-preview-note {
  margin: var(--ui-space-3) 0 0;
  font-size: var(--ui-text-xs);
  font-weight: 600;
  color: rgb(var(--ui-warn));
}

/* ---- metadados read-only ------------------------------------------------- */
.sla-meta {
  margin: 0 0 var(--ui-space-5);
  padding: var(--ui-space-2) var(--ui-space-4);
  background: rgb(var(--ui-surface-2));
  border-radius: var(--ui-radius-md);
  border: 1px solid rgb(var(--ui-border));
  display: flex;
  flex-direction: column;
}
.sla-meta-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ui-space-4);
  padding: var(--ui-space-2) 0;
  border-bottom: 1px solid rgb(var(--ui-border));
}
.sla-meta-row:last-child {
  border-bottom: none;
}
.sla-meta-row dt {
  font-size: var(--ui-text-xs);
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: rgb(var(--ui-muted));
}
.sla-meta-row dd {
  margin: 0;
  font-size: var(--ui-text-sm);
  color: rgb(var(--ui-fg));
  text-align: right;
}
.sla-mono {
  font-family: var(--ui-font-mono, ui-monospace, 'SF Mono', Menlo, Consolas, monospace);
}

/* ---- SubmitBar ----------------------------------------------------------- */
.sla-submitbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ui-space-4);
  flex-wrap: wrap;
  margin-top: var(--ui-space-2);
  padding-top: var(--ui-space-4);
  border-top: 1px solid rgb(var(--ui-border));
}
.sla-submitbar-note {
  margin: 0;
  display: inline-flex;
  align-items: center;
  gap: var(--ui-space-2);
  font-size: var(--ui-text-sm);
  color: rgb(var(--ui-muted));
}
.sla-dot {
  width: var(--ui-space-2);
  height: var(--ui-space-2);
  border-radius: var(--ui-radius-pill);
  background: rgb(var(--ui-ok));
}
.sla-submitbar-note[data-state='dirty'] {
  color: rgb(var(--ui-accent-strong));
  font-weight: 600;
}
.sla-submitbar-note[data-state='dirty'] .sla-dot {
  background: rgb(var(--ui-accent));
}
.sla-submitbar-note[data-state='inactivate'] {
  color: rgb(var(--ui-warn));
  font-weight: 700;
}
.sla-submitbar-note[data-state='inactivate'] .sla-dot {
  background: rgb(var(--ui-warn));
}
.sla-submitbar-actions {
  display: flex;
  gap: var(--ui-space-2);
  flex-wrap: wrap;
}

.sla-shortcut-hint {
  margin: var(--ui-space-3) 0 0;
  font-size: var(--ui-text-xs);
  color: rgb(var(--ui-faint));
}
.sla-shortcut-hint kbd {
  font-family: var(--ui-font-mono, ui-monospace, Menlo, Consolas, monospace);
  font-size: var(--ui-text-xs);
  padding: 1px var(--ui-space-1);
  border-radius: var(--ui-radius-sm);
  border: 1px solid rgb(var(--ui-border-strong));
  background: rgb(var(--ui-surface-2));
  color: rgb(var(--ui-muted));
}

@media (max-width: 640px) {
  .sla-priorities {
    grid-template-columns: 1fr;
  }
  .sla-preview-grid {
    grid-template-columns: repeat(2, 1fr);
  }
  .sla-identity-badges {
    width: 100%;
  }
  .sla-submitbar {
    align-items: stretch;
  }
  .sla-submitbar-actions {
    width: 100%;
  }
  .sla-submitbar-actions :deep(.ui-btn) {
    flex: 1 1 auto;
  }
}

@media (prefers-reduced-motion: reduce) {
  .sla-priority,
  .sla-priority-mark,
  .sla-preset,
  .sla-toggle-track,
  .sla-toggle-thumb {
    transition: none;
  }
}
</style>
