<template>
  <UiPageLayout
    eyebrow="Pacientes"
    :title="pageTitle"
    subtitle="Edite os dados cadastrais, ajuste a situação clínica e reatribua o profissional responsável. Toda alteração fica registrada para auditoria."
    width="wide"
    :loading="loading"
    loading-message="Carregando dados do paciente…"
    :error="loadError"
    @retry="load"
  >
    <!-- AÇÕES DO CABEÇALHO -->
    <template #actions>
      <UiButton variant="ghost" :to="backTo">Voltar</UiButton>
      <UiButton v-if="patient.id" variant="subtle" :to="detailTo">Ver perfil</UiButton>
    </template>

    <!-- BANNER DE AUDITORIA -->
    <template #banner>
      <div class="audit-banner" role="note" aria-label="Aviso de auditoria">
        <span class="audit-banner-icon" aria-hidden="true">⚖</span>
        <span class="audit-banner-text">
          Edição auditável — todas as alterações de dados, situação e responsável ficam
          registradas com data, hora e usuário.
        </span>
      </div>
    </template>

    <!-- ESTADO VAZIO: 404 ou registro nulo pós-carregamento -->
    <UiEmptyState
      v-if="notFound"
      title="Paciente não encontrado"
      description="Este paciente pode ter sido arquivado ou o endereço está incorreto."
      icon="search"
    >
      <template #action>
        <UiButton :to="backTo">Voltar para a lista de pacientes</UiButton>
      </template>
    </UiEmptyState>

    <!-- ESTADO NORMAL: layout em duas colunas (formulário principal + painel lateral) -->
    <div v-else class="edit-layout">

      <!-- ── COLUNA PRINCIPAL ─────────────────────────────────────────────── -->
      <div class="edit-main">

        <!-- CARD: IDENTIFICAÇÃO -->
        <UiCard title="Identificação" subtitle="Nome, CPF, data de nascimento e gênero.">
          <template #actions>
            <UiStatusBadge
              :status="patient.status"
              :label="statusLabel(patient.status)"
              size="lg"
            />
          </template>

          <form id="form-profile" novalidate @submit.prevent="saveProfile">
            <UiFormSection title="Dados pessoais" description="Informações básicas de identificação." :columns="2">

              <UiFormField
                label="Nome completo"
                :required="true"
                :error="f.errors.full_name"
                hint="Como o paciente é registrado no prontuário."
                full-width
              >
                <template #default="{ id, describedBy }">
                  <UiInput
                    :id="id"
                    :described-by="describedBy"
                    :model-value="f.values.full_name"
                    :error="!!f.errors.full_name"
                    :required="true"
                    autocomplete="name"
                    placeholder="Ex.: Maria Aparecida da Silva"
                    @update:model-value="f.setField('full_name', $event)"
                  />
                </template>
              </UiFormField>

              <UiFormField
                label="Data de nascimento"
                :error="f.errors.birth_date"
                :hint="birthDateHint"
              >
                <template #default="{ id, describedBy }">
                  <UiInput
                    :id="id"
                    :described-by="describedBy"
                    type="date"
                    :model-value="f.values.birth_date"
                    :error="!!f.errors.birth_date"
                    autocomplete="bday"
                    @update:model-value="f.setField('birth_date', $event)"
                  />
                </template>
              </UiFormField>

              <UiFormField
                label="CPF"
                :error="f.errors.document"
                hint="Somente números ou no formato 000.000.000-00."
              >
                <template #default="{ id, describedBy }">
                  <UiInput
                    :id="id"
                    :described-by="describedBy"
                    :model-value="f.values.document"
                    :error="!!f.errors.document"
                    inputmode="numeric"
                    autocomplete="off"
                    placeholder="000.000.000-00"
                    @update:model-value="f.setField('document', $event)"
                  />
                </template>
              </UiFormField>

              <UiFormField label="Gênero" :error="f.errors.gender" hint="Opcional — conforme declaração do paciente.">
                <template #default="{ id, describedBy }">
                  <select
                    :id="id"
                    class="edit-select"
                    :aria-describedby="describedBy || undefined"
                    :aria-invalid="f.errors.gender ? 'true' : undefined"
                    :value="f.values.gender"
                    @change="f.setField('gender', $event.target.value)"
                  >
                    <option value="">Não informado</option>
                    <option value="masculino">Masculino</option>
                    <option value="feminino">Feminino</option>
                    <option value="outro">Outro</option>
                    <option value="nao_informado">Prefere não informar</option>
                  </select>
                </template>
              </UiFormField>

            </UiFormSection>

            <!-- CONTATO -->
            <UiFormSection title="Contato" description="Por onde falar com o paciente." :columns="2">

              <UiFormField label="E-mail" :error="f.errors.email">
                <template #default="{ id, describedBy }">
                  <UiInput
                    :id="id"
                    :described-by="describedBy"
                    type="email"
                    :model-value="f.values.email"
                    :error="!!f.errors.email"
                    autocomplete="email"
                    placeholder="nome@exemplo.com"
                    @update:model-value="f.setField('email', $event)"
                  />
                </template>
              </UiFormField>

              <UiFormField label="Telefone / WhatsApp" :error="f.errors.phone" hint="Com DDD.">
                <template #default="{ id, describedBy }">
                  <UiInput
                    :id="id"
                    :described-by="describedBy"
                    type="tel"
                    :model-value="f.values.phone"
                    :error="!!f.errors.phone"
                    autocomplete="tel"
                    placeholder="(11) 90000-0000"
                    @update:model-value="f.setField('phone', $event)"
                  />
                </template>
              </UiFormField>

              <UiFormField
                label="Responsável legal"
                :error="f.errors.guardian_name"
                :hint="guardianHint"
                full-width
              >
                <template #default="{ id, describedBy }">
                  <UiInput
                    :id="id"
                    :described-by="describedBy"
                    :model-value="f.values.guardian_name"
                    :error="!!f.errors.guardian_name"
                    placeholder="Nome do responsável legal"
                    @update:model-value="f.setField('guardian_name', $event)"
                  />
                </template>
              </UiFormField>

            </UiFormSection>

            <!-- OBSERVAÇÕES E REFERÊNCIA -->
            <UiFormSection title="Observações e referência" description="Anotações gerais e código externo." :columns="2">

              <UiFormField
                label="Observações gerais"
                :error="f.errors.notes"
                hint="Informações administrativas, preferências, alertas não-clínicos."
                full-width
              >
                <template #default="{ id, describedBy }">
                  <textarea
                    :id="id"
                    class="edit-textarea"
                    :aria-describedby="describedBy || undefined"
                    :aria-invalid="f.errors.notes ? 'true' : undefined"
                    :value="f.values.notes"
                    rows="4"
                    placeholder="Histórico relevante, preferências de contato, alertas administrativos…"
                    @input="f.setField('notes', $event.target.value)"
                  ></textarea>
                </template>
              </UiFormField>

              <UiFormField
                label="Referência externa"
                :error="f.errors.external_ref"
                hint="Código ou ID em sistema externo (opcional)."
              >
                <template #default="{ id, describedBy }">
                  <UiInput
                    :id="id"
                    :described-by="describedBy"
                    :model-value="f.values.external_ref"
                    :error="!!f.errors.external_ref"
                    placeholder="Ex.: MRN-00042"
                    autocomplete="off"
                    @update:model-value="f.setField('external_ref', $event)"
                  />
                </template>
              </UiFormField>

            </UiFormSection>

            <!-- ALERTA DE CONFLITO (409) -->
            <div v-if="conflictError" class="conflict-alert" role="alert">
              <span class="conflict-icon" aria-hidden="true">!</span>
              <div class="conflict-body">
                <p class="conflict-title">Conflito ao salvar</p>
                <p class="conflict-desc">{{ conflictError }}</p>
              </div>
            </div>

            <div class="form-actions">
              <div class="form-actions-hint">
                <span class="req-mark" aria-hidden="true">*</span>
                <span>campos obrigatórios</span>
              </div>
              <div class="form-buttons">
                <UiButton variant="ghost" type="button" :disabled="f.submitting.value" @click="cancel">
                  Cancelar
                </UiButton>
                <UiButton
                  type="submit"
                  variant="primary"
                  :loading="f.submitting.value"
                  :disabled="!dirty"
                >
                  Salvar alterações
                </UiButton>
              </div>
            </div>
          </form>
        </UiCard>
      </div>

      <!-- ── COLUNA LATERAL ──────────────────────────────────────────────── -->
      <aside class="edit-side">

        <!-- SITUAÇÃO CLÍNICA -->
        <UiCard title="Situação clínica" subtitle="Mude o estado de acompanhamento do paciente.">
          <div class="status-current">
            <span class="status-label-text">Situação atual:</span>
            <UiStatusBadge :status="patient.status" :label="statusLabel(patient.status)" />
          </div>
          <div class="status-transitions">
            <UiButton
              v-for="t in availableTransitions"
              :key="t.value"
              :variant="t.variant"
              size="sm"
              block
              :loading="statusSaving === t.value"
              :disabled="!!statusSaving"
              @click="changeStatus(t)"
            >
              {{ t.action }}
            </UiButton>
            <p v-if="!availableTransitions.length" class="side-hint">
              Nenhuma transição disponível para esta situação.
            </p>
          </div>
        </UiCard>

        <!-- PROFISSIONAL RESPONSÁVEL -->
        <UiCard title="Profissional responsável" subtitle="Quem conduz o acompanhamento.">
          <UiLoadingState
            v-if="profState === 'loading'"
            variant="skeleton"
            :skeleton-lines="2"
            title="Carregando equipe…"
          />

          <template v-else-if="profState === 'error'">
            <UiErrorState
              message="Não foi possível carregar a lista de profissionais."
              :retryable="true"
              @retry="loadProfessionals"
            />
            <form novalidate @submit.prevent="saveProfessional">
              <UiFormField
                label="ID do profissional"
                :error="profForm.errors.assigned_professional_id"
                hint="Lista indisponível — informe o ID diretamente. Deixe vazio para remover o responsável."
              >
                <template #default="{ id, describedBy }">
                  <UiInput
                    :id="id"
                    :described-by="describedBy"
                    :model-value="profForm.values.assigned_professional_id"
                    :error="!!profForm.errors.assigned_professional_id"
                    placeholder="Ex.: prof-0007"
                    @update:model-value="profForm.setField('assigned_professional_id', $event)"
                  />
                </template>
              </UiFormField>
              <div class="side-action">
                <UiButton
                  type="submit"
                  variant="subtle"
                  size="sm"
                  block
                  :loading="profSaving"
                  :disabled="!profDirty"
                >
                  Reatribuir
                </UiButton>
              </div>
            </form>
          </template>

          <form v-else novalidate @submit.prevent="saveProfessional">
            <UiFormField
              label="Profissional responsável"
              :error="profForm.errors.assigned_professional_id"
              hint="Escolha o profissional ou deixe sem responsável."
            >
              <template #default="{ id, describedBy }">
                <select
                  :id="id"
                  class="edit-select"
                  :class="{ 'is-changed': profDirty }"
                  :aria-describedby="describedBy || undefined"
                  :aria-invalid="profForm.errors.assigned_professional_id ? 'true' : undefined"
                  :value="profForm.values.assigned_professional_id"
                  @change="profForm.setField('assigned_professional_id', $event.target.value)"
                >
                  <option value="">Sem responsável</option>
                  <option v-for="p in professionalOptions" :key="p.value" :value="p.value">
                    {{ p.label }}
                  </option>
                </select>
              </template>
            </UiFormField>
            <div class="side-action">
              <UiButton
                type="submit"
                variant="subtle"
                size="sm"
                block
                :loading="profSaving"
                :disabled="!profDirty"
              >
                Reatribuir
              </UiButton>
            </div>
          </form>
        </UiCard>

        <!-- METADADOS DE AUDITORIA -->
        <UiCard title="Registro" subtitle="Dados de auditoria do cadastro.">
          <dl class="meta-kv">
            <div class="meta-kv-row">
              <dt>Identificador</dt>
              <dd class="meta-mono">{{ patient.id || '—' }}</dd>
            </div>
            <div class="meta-kv-row">
              <dt>Situação</dt>
              <dd>
                <UiStatusBadge
                  :status="patient.status"
                  :label="statusLabel(patient.status)"
                  size="sm"
                />
              </dd>
            </div>
            <div class="meta-kv-row">
              <dt>Cadastrado em</dt>
              <dd>{{ format.formatDateTime(patient.created_at) }}</dd>
            </div>
            <div v-if="patient.gender" class="meta-kv-row">
              <dt>Gênero</dt>
              <dd>{{ genderLabel(patient.gender) }}</dd>
            </div>
            <div v-if="patient.external_ref" class="meta-kv-row">
              <dt>Ref. externa</dt>
              <dd class="meta-mono">{{ patient.external_ref }}</dd>
            </div>
          </dl>
        </UiCard>

      </aside>
    </div>
  </UiPageLayout>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import {
  UiPageLayout,
  UiCard,
  UiFormSection,
  UiFormField,
  UiInput,
  UiButton,
  UiStatusBadge,
  UiEmptyState,
  UiLoadingState,
  UiErrorState,
  useForm,
  useToast,
  useConfirm,
  validators,
  format,
} from '../ui/index.js';
import { patients, professionals } from '../api.js';

const props = defineProps({ id: { type: String, required: true } });

const router = useRouter();
const toast = useToast();
const confirm = useConfirm();

// ── Rota de domínio de retorno ────────────────────────────────────────────────
const backTo = '/patients';
const detailTo = computed(() => '/patients/' + props.id);

// ── Estado de carregamento ────────────────────────────────────────────────────
const loading = ref(true);
const loadError = ref(null);
const patient = reactive({});
const notFound = computed(() => !loading.value && !loadError.value && !patient.id);
const pageTitle = computed(() =>
  patient.full_name ? 'Editar — ' + patient.full_name : 'Editar paciente'
);

// ── Rótulos de status (enum do backend) ──────────────────────────────────────
const STATUS_LABELS = {
  active: 'Em acompanhamento',
  on_hold: 'Em espera',
  discharged: 'Alta',
  archived: 'Arquivado',
  // aliases em português (caso o backend devolva)
  ativo: 'Ativo',
  inativo: 'Inativo',
  alta: 'Alta',
};
function statusLabel(value) {
  return STATUS_LABELS[value] || format.humanize(String(value || ''));
}

// ── Rótulos de gênero ────────────────────────────────────────────────────────
const GENDER_LABELS = {
  masculino: 'Masculino',
  feminino: 'Feminino',
  outro: 'Outro',
  nao_informado: 'Prefere não informar',
};
function genderLabel(value) {
  return GENDER_LABELS[value] || value;
}

// ── Formulário cadastral ─────────────────────────────────────────────────────
const cpfPattern = /^(\d{11}|\d{3}\.\d{3}\.\d{3}-\d{2})$/;
const phonePattern = /^[\d\s()+\-]{8,20}$/;

const f = useForm({
  initial: {
    full_name: '',
    birth_date: '',
    document: '',
    gender: '',
    email: '',
    phone: '',
    guardian_name: '',
    notes: '',
    external_ref: '',
  },
  rules: {
    full_name: [validators.required('Informe o nome completo.'), validators.minLen(2)],
    document: [validators.pattern(cpfPattern, 'CPF inválido — use 11 dígitos ou 000.000.000-00.')],
    email: [validators.email()],
    phone: [validators.pattern(phonePattern, 'Telefone inválido — inclua o DDD.')],
  },
});

// Snapshot para detectar dirty (evita salvar sem mudança)
const snapshot = ref('');
function currentSnapshot() {
  return JSON.stringify({
    full_name: f.values.full_name,
    birth_date: f.values.birth_date,
    document: f.values.document,
    gender: f.values.gender,
    email: f.values.email,
    phone: f.values.phone,
    guardian_name: f.values.guardian_name,
    notes: f.values.notes,
    external_ref: f.values.external_ref,
  });
}
const dirty = computed(() => snapshot.value !== currentSnapshot());

// Alerta de conflito 409 (separado do erro de carregamento)
const conflictError = ref('');

// Dicas contextuais derivadas do formulário
const ageInYears = computed(() => {
  const raw = f.values.birth_date;
  if (!raw) return null;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  if (
    now.getMonth() < d.getMonth() ||
    (now.getMonth() === d.getMonth() && now.getDate() < d.getDate())
  ) {
    age -= 1;
  }
  return age >= 0 && age < 150 ? age : null;
});
const isMinor = computed(() => ageInYears.value !== null && ageInYears.value < 18);
const birthDateHint = computed(() =>
  ageInYears.value !== null ? ageInYears.value + ' anos' : 'Usada para calcular a idade.'
);
const guardianHint = computed(() =>
  isMinor.value
    ? 'Paciente menor de idade — responsável legal recomendado.'
    : 'Opcional para pacientes adultos.'
);

// ── Profissional responsável (formulário separado + select populado) ──────────
const PROF_ID_RX = /^[A-Za-z0-9_-]*$/;
const profForm = useForm({
  initial: { assigned_professional_id: '' },
  rules: {
    assigned_professional_id: [
      validators.pattern(PROF_ID_RX, 'Identificador inválido (letras, números, hífen e _).'),
    ],
  },
});
const profSaving = ref(false);
const professionalList = ref([]);
const profState = ref('loading'); // loading | ready | error
const professionalOptions = computed(() =>
  professionalList.value.map((p) => ({
    value: String(p.id),
    label: p.full_name
      ? p.full_name + (p.specialty ? ' — ' + p.specialty : '')
      : 'Profissional ' + p.id,
  }))
);
const profDirty = computed(
  () =>
    profForm.values.assigned_professional_id !==
    (patient.assigned_professional_id != null ? String(patient.assigned_professional_id) : '')
);

function professionalName(id) {
  const opt = professionalOptions.value.find((o) => o.value === String(id));
  return opt ? opt.label : String(id);
}

// ── Transições de situação ───────────────────────────────────────────────────
const TRANSITIONS = {
  active: [
    {
      value: 'on_hold',
      action: 'Colocar em espera',
      variant: 'ghost',
      confirm: {
        title: 'Colocar em espera',
        message:
          'O acompanhamento ficará pausado até a reativação. Confirma colocar este paciente em espera?',
        danger: false,
      },
    },
    {
      value: 'discharged',
      action: 'Dar alta',
      variant: 'primary',
      confirm: {
        title: 'Dar alta',
        message:
          'Registrar a alta encerra o acompanhamento ativo. Esta ação fica registrada para auditoria. Confirma a alta?',
        danger: false,
      },
    },
    {
      value: 'archived',
      action: 'Arquivar paciente',
      variant: 'danger',
      confirm: {
        title: 'Arquivar paciente',
        message:
          'Arquivar remove o paciente das listas ativas. A ação é auditável e pode ser revertida por um administrador. Deseja arquivar?',
        danger: true,
      },
    },
  ],
  on_hold: [
    {
      value: 'active',
      action: 'Reativar acompanhamento',
      variant: 'primary',
      confirm: null,
    },
    {
      value: 'discharged',
      action: 'Dar alta',
      variant: 'subtle',
      confirm: {
        title: 'Dar alta',
        message: 'Registrar a alta encerra o acompanhamento. Confirma a alta?',
        danger: false,
      },
    },
    {
      value: 'archived',
      action: 'Arquivar',
      variant: 'danger',
      confirm: {
        title: 'Arquivar paciente',
        message: 'Arquivar remove o paciente das listas ativas. Deseja arquivar?',
        danger: true,
      },
    },
  ],
  discharged: [
    {
      value: 'active',
      action: 'Reabrir acompanhamento',
      variant: 'primary',
      confirm: {
        title: 'Reabrir acompanhamento',
        message: 'O paciente voltará às listas ativas. Confirma reabrir?',
        danger: false,
      },
    },
    {
      value: 'archived',
      action: 'Arquivar',
      variant: 'danger',
      confirm: {
        title: 'Arquivar paciente',
        message: 'Arquivar remove o paciente das listas ativas. Deseja arquivar?',
        danger: true,
      },
    },
  ],
  archived: [
    {
      value: 'active',
      action: 'Desarquivar',
      variant: 'primary',
      confirm: {
        title: 'Desarquivar paciente',
        message: 'O paciente voltará para acompanhamento ativo. Confirma desarquivar?',
        danger: false,
      },
    },
  ],
};
const availableTransitions = computed(() => TRANSITIONS[patient.status] || []);
const statusSaving = ref('');

// ── Hidratar formulário com dados do registro ─────────────────────────────────
function hydrate(rec) {
  Object.keys(patient).forEach((k) => delete patient[k]);
  Object.assign(patient, rec || {});
  f.values.full_name = rec.full_name || '';
  f.values.birth_date = (rec.birth_date || '').slice(0, 10);
  f.values.document = rec.document || rec.cpf || '';
  f.values.gender = rec.gender || '';
  f.values.email = rec.email || '';
  f.values.phone = rec.phone || '';
  f.values.guardian_name = rec.guardian_name || '';
  f.values.notes = rec.notes || '';
  f.values.external_ref = rec.external_ref || '';
  profForm.values.assigned_professional_id =
    rec.assigned_professional_id != null ? String(rec.assigned_professional_id) : '';
  profForm.errors.assigned_professional_id = '';
  conflictError.value = '';
  snapshot.value = currentSnapshot();
}

// ── Carregamento inicial ──────────────────────────────────────────────────────
async function load() {
  loading.value = true;
  loadError.value = null;
  try {
    const rec = await patients.get(props.id);
    if (rec && rec.id) {
      hydrate(rec);
    } else {
      Object.keys(patient).forEach((k) => delete patient[k]);
    }
  } catch (e) {
    if (e && e.status === 404) {
      Object.keys(patient).forEach((k) => delete patient[k]);
    } else {
      loadError.value =
        (e && e.message) || 'Não foi possível carregar o paciente. Tente novamente.';
    }
  } finally {
    loading.value = false;
  }
}

// ── Salvar dados cadastrais ────────────────────────────────────────────────────
function saveProfile() {
  conflictError.value = '';
  f.handleSubmit(async (vals) => {
    try {
      const payload = {
        full_name: vals.full_name.trim(),
        birth_date: vals.birth_date || null,
        document: vals.document ? vals.document.trim() : null,
        gender: vals.gender || null,
        email: vals.email ? vals.email.trim() : null,
        phone: vals.phone ? vals.phone.trim() : null,
        guardian_name: vals.guardian_name ? vals.guardian_name.trim() : null,
        notes: vals.notes ? vals.notes.trim() : null,
        external_ref: vals.external_ref ? vals.external_ref.trim() : null,
      };
      const updated = await patients.update(props.id, payload);
      hydrate({ ...patient, ...payload, ...(updated && updated.id ? updated : {}) });
      toast.success('Dados do paciente atualizados com sucesso.');
    } catch (e) {
      if (e && e.status === 409) {
        // Conflito (CPF/e-mail duplicado) — feedback inline + toast
        conflictError.value =
          (e && e.message) || 'Já existe um registro com esses dados. Verifique CPF ou e-mail.';
        toast.error(conflictError.value);
        return;
      }
      toast.error((e && e.message) || 'Não foi possível salvar os dados.');
    }
  });
}

// ── Cancelar edição com confirmação de dados não salvos ────────────────────────
async function cancel() {
  if (dirty.value) {
    const ok = await confirm({
      title: 'Descartar alterações?',
      message: 'As informações editadas não foram salvas e serão perdidas.',
      confirmLabel: 'Descartar',
      danger: true,
    });
    if (!ok) return;
  }
  router.push(backTo);
}

// ── Mudar situação clínica ─────────────────────────────────────────────────────
async function changeStatus(transition) {
  if (statusSaving.value) return;
  if (transition.confirm) {
    const ok = await confirm({
      title: transition.confirm.title,
      message: transition.confirm.message,
      danger: transition.confirm.danger,
      confirmLabel: transition.action,
    });
    if (!ok) return;
  }
  statusSaving.value = transition.value;
  try {
    await patients.update(props.id, { status: transition.value });
    patient.status = transition.value;
    toast.success('Situação alterada para "' + statusLabel(transition.value) + '".');
  } catch (e) {
    toast.error((e && e.message) || 'Não foi possível alterar a situação.');
  } finally {
    statusSaving.value = '';
  }
}

// ── Reatribuir profissional ────────────────────────────────────────────────────
function saveProfessional() {
  if (profSaving.value) return;
  profForm.handleSubmit(async (vals) => {
    const next = (vals.assigned_professional_id || '').trim();
    const current = patient.assigned_professional_id != null
      ? String(patient.assigned_professional_id)
      : '';
    if (next === current) return;
    const releasing = next === '';
    const ok = await confirm({
      title: releasing ? 'Remover profissional responsável' : 'Reatribuir profissional',
      message: releasing
        ? 'O paciente ficará sem profissional responsável. Confirma a remoção?'
        : 'Transferir o acompanhamento para "' + professionalName(next) + '"? A troca fica registrada para auditoria.',
      confirmLabel: releasing ? 'Remover' : 'Reatribuir',
      danger: releasing,
    });
    if (!ok) return;
    profSaving.value = true;
    try {
      await patients.update(props.id, { assigned_professional_id: next || null });
      patient.assigned_professional_id = next || null;
      profForm.values.assigned_professional_id = next;
      toast.success(
        releasing
          ? 'Paciente liberado do profissional anterior.'
          : 'Profissional responsável atualizado.'
      );
    } catch (e) {
      profForm.errors.assigned_professional_id = (e && e.message) || 'Falha ao reatribuir.';
      toast.error((e && e.message) || 'Não foi possível reatribuir o profissional.');
    } finally {
      profSaving.value = false;
    }
  });
}

// ── Carregar lista de profissionais ────────────────────────────────────────────
async function loadProfessionals() {
  profState.value = 'loading';
  try {
    const res = await professionals.list({ pageSize: 200, sort: 'full_name', dir: 'asc' });
    professionalList.value = Array.isArray(res) ? res : (res && res.data) || [];
    profState.value = 'ready';
  } catch {
    professionalList.value = [];
    profState.value = 'error';
  }
}

onMounted(() => {
  load();
  loadProfessionals();
});
</script>

<style scoped>
/* ── Banner de auditoria ─────────────────────────────────────────────────────── */
.audit-banner {
  display: flex;
  align-items: center;
  gap: var(--ui-space-2);
  padding: var(--ui-space-2) var(--ui-space-4);
  background: rgb(var(--ui-info) / 0.08);
  border: 1px solid rgb(var(--ui-info) / 0.25);
  border-radius: var(--ui-radius-md);
  font-size: var(--ui-text-sm);
  color: rgb(var(--ui-fg));
}
.audit-banner-icon {
  color: rgb(var(--ui-info));
  font-size: 1.05rem;
  flex-shrink: 0;
}
.audit-banner-text { line-height: 1.45; }

/* ── Layout de duas colunas ──────────────────────────────────────────────────── */
.edit-layout {
  display: grid;
  grid-template-columns: minmax(0, 2.2fr) minmax(260px, 1fr);
  gap: var(--ui-space-5);
  align-items: start;
}
.edit-main { min-width: 0; }
.edit-side {
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-4);
}

/* ── Select nativo (base via UiFormField :deep(select); aqui: foco + affordance) ─ */
.edit-select {
  appearance: none;
  cursor: pointer;
  width: 100%;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}
.edit-select:focus {
  outline: none;
  border-color: rgb(var(--ui-accent));
  box-shadow: 0 0 0 3px rgb(var(--ui-accent) / 0.15);
}
.edit-select[aria-invalid='true'] {
  border-color: rgb(var(--ui-danger));
}
.edit-select.is-changed {
  border-color: rgb(var(--ui-accent));
  box-shadow: 0 0 0 3px rgb(var(--ui-accent) / 0.1);
}

/* ── Textarea (base via UiFormField :deep(textarea); aqui: altura + foco) ───── */
.edit-textarea {
  min-height: 100px;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}
.edit-textarea:focus {
  outline: none;
  border-color: rgb(var(--ui-accent));
  box-shadow: 0 0 0 3px rgb(var(--ui-accent) / 0.15);
}
.edit-textarea[aria-invalid='true'] {
  border-color: rgb(var(--ui-danger));
}
.edit-textarea::placeholder {
  color: rgb(var(--ui-faint));
}

/* ── Alerta de conflito 409 ──────────────────────────────────────────────────── */
.conflict-alert {
  display: flex;
  gap: var(--ui-space-3);
  align-items: flex-start;
  padding: var(--ui-space-3) var(--ui-space-4);
  background: rgb(var(--ui-danger) / 0.07);
  border: 1px solid rgb(var(--ui-danger) / 0.3);
  border-radius: var(--ui-radius-md);
  margin-top: var(--ui-space-4);
}
.conflict-icon {
  font-size: 1.15rem;
  font-weight: 700;
  color: rgb(var(--ui-danger));
  flex-shrink: 0;
  line-height: 1;
}
.conflict-body { min-width: 0; }
.conflict-title {
  margin: 0 0 2px;
  font-size: var(--ui-text-sm);
  font-weight: 600;
  color: rgb(var(--ui-danger));
}
.conflict-desc {
  margin: 0;
  font-size: var(--ui-text-sm);
  color: rgb(var(--ui-fg));
}

/* ── Ações do formulário ─────────────────────────────────────────────────────── */
.form-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ui-space-4);
  flex-wrap: wrap;
  margin-top: var(--ui-space-4);
  padding-top: var(--ui-space-3);
  border-top: 1px solid rgb(var(--ui-border));
}
.form-actions-hint {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: var(--ui-text-xs);
  color: rgb(var(--ui-muted));
}
.req-mark {
  color: rgb(var(--ui-danger));
  font-weight: 700;
}
.form-buttons {
  display: flex;
  gap: var(--ui-space-2);
}

/* ── Situação (lateral) ──────────────────────────────────────────────────────── */
.status-current {
  display: flex;
  align-items: center;
  gap: var(--ui-space-2);
  flex-wrap: wrap;
  margin-bottom: var(--ui-space-3);
}
.status-label-text {
  font-size: var(--ui-text-sm);
  color: rgb(var(--ui-muted));
}
.status-transitions {
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-2);
}
.side-hint {
  margin: 0;
  font-size: var(--ui-text-sm);
  color: rgb(var(--ui-muted));
}

/* ── Ação do painel lateral ──────────────────────────────────────────────────── */
.side-action {
  margin-top: var(--ui-space-3);
}

/* ── Metadados de auditoria (key-value) ──────────────────────────────────────── */
.meta-kv {
  display: grid;
  gap: var(--ui-space-3);
  margin: 0;
}
.meta-kv-row {}
.meta-kv dt {
  font-size: var(--ui-text-xs);
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: rgb(var(--ui-muted));
}
.meta-kv dd {
  margin: 3px 0 0;
  font-size: var(--ui-text-sm);
  color: rgb(var(--ui-fg));
}
.meta-mono {
  font-family: var(--ui-font-mono);
  word-break: break-all;
  font-size: var(--ui-text-xs);
}

/* ── Responsivo ≤860px ──────────────────────────────────────────────────────── */
@media (max-width: 860px) {
  .edit-layout {
    grid-template-columns: 1fr;
  }
  .edit-side {
    order: -1; /* painel de situação sobe no mobile */
  }
  .form-actions {
    flex-direction: column;
    align-items: stretch;
  }
  .form-buttons {
    width: 100%;
  }
  .form-buttons :deep(.ui-btn) {
    flex: 1 1 auto;
  }
}
</style>
