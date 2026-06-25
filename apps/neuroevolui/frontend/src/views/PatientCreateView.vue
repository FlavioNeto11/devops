<template>
  <UiPageLayout
    eyebrow="Pacientes"
    title="Novo paciente"
    subtitle="Cadastre os dados pessoais, contato, responsável e o profissional de referência."
    width="narrow"
  >
    <template #actions>
      <UiButton variant="ghost" to="/patients">Voltar à lista</UiButton>
    </template>

    <!-- ESTADO: verificando permissão (loading) -->
    <UiLoadingState v-if="authState === 'loading'" variant="skeleton" :skeleton-lines="6" title="Verificando permissão…" />

    <!-- ESTADO: erro ao verificar permissão (com retry) -->
    <UiErrorState
      v-else-if="authState === 'error'"
      message="Não foi possível verificar sua permissão de acesso."
      :retryable="true"
      @retry="checkAccess"
    />

    <!-- ESTADO: sem permissão (deny-by-default por papel >= professional) -->
    <UiCard v-else-if="authState === 'denied'">
      <UiEmptyState
        title="Acesso restrito"
        :description="deniedMessage"
        icon="lock"
      >
        <template #action>
          <UiButton variant="ghost" to="/patients">Voltar à lista de pacientes</UiButton>
        </template>
      </UiEmptyState>
    </UiCard>

    <!-- ESTADO: normal — formulário de cadastro -->
    <form v-else class="patient-form" novalidate @submit.prevent="submit">
      <UiCard title="Identificação" subtitle="Quem é o paciente.">
        <UiFormSection :columns="2">
          <UiFormField label="Nome completo" :required="true" :error="f.errors.full_name" hint="Como o paciente é registrado no prontuário." full-width>
            <template #default="{ id, describedBy }">
              <UiInput
                :id="id"
                :described-by="describedBy"
                :model-value="f.values.full_name"
                :error="!!f.errors.full_name"
                :required="true"
                autocomplete="name"
                placeholder="Ex.: Maria Eduarda Souza"
                @update:model-value="f.setField('full_name', $event)"
              />
            </template>
          </UiFormField>

          <UiFormField label="Data de nascimento" :error="f.errors.birth_date" :hint="ageHint">
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

          <UiFormField label="Documento (CPF)" :error="f.errors.document" hint="Somente números ou no formato 000.000.000-00.">
            <template #default="{ id, describedBy }">
              <UiInput
                :id="id"
                :described-by="describedBy"
                :model-value="f.values.document"
                :error="!!f.errors.document"
                inputmode="numeric"
                placeholder="000.000.000-00"
                @update:model-value="f.setField('document', $event)"
              />
            </template>
          </UiFormField>
        </UiFormSection>
      </UiCard>

      <UiCard title="Contato" subtitle="Por onde falar com o paciente.">
        <UiFormSection :columns="2">
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
        </UiFormSection>
      </UiCard>

      <UiCard title="Responsável" subtitle="Para pacientes menores de idade ou que precisem de acompanhamento.">
        <UiFormSection :columns="1">
          <UiFormField label="Responsável" :error="f.errors.guardian_name" :hint="guardianHint">
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
      </UiCard>

      <UiCard title="Acompanhamento" subtitle="Profissional de referência e situação clínica.">
        <UiFormSection :columns="2">
          <UiFormField label="Profissional responsável" :error="f.errors.assigned_professional_id" :hint="professionalHint">
            <template #default="{ id, describedBy }">
              <select
                v-if="professionalOptions.length"
                :id="id"
                class="patient-select"
                :aria-describedby="describedBy || undefined"
                :aria-invalid="f.errors.assigned_professional_id ? 'true' : undefined"
                :value="f.values.assigned_professional_id"
                @change="f.setField('assigned_professional_id', $event.target.value)"
              >
                <option value="">Sem profissional definido</option>
                <option v-for="opt in professionalOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
              </select>
              <UiInput
                v-else
                :id="id"
                :described-by="describedBy"
                :model-value="f.values.assigned_professional_id"
                :error="!!f.errors.assigned_professional_id"
                placeholder="Identificador do profissional"
                @update:model-value="f.setField('assigned_professional_id', $event)"
              />
            </template>
          </UiFormField>

          <UiFormField label="Situação" :required="true" :error="f.errors.status">
            <template #default="{ id, describedBy }">
              <div class="patient-status">
                <select
                  :id="id"
                  class="patient-select"
                  :aria-describedby="describedBy || undefined"
                  :aria-required="true"
                  :aria-invalid="f.errors.status ? 'true' : undefined"
                  :value="f.values.status"
                  @change="f.setField('status', $event.target.value)"
                >
                  <option v-for="opt in statusOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
                </select>
                <UiStatusBadge v-if="f.values.status" :status="f.values.status" :label="statusLabelFor(f.values.status)" size="sm" />
              </div>
            </template>
          </UiFormField>

          <UiFormField label="Observações gerais" :error="f.errors.notes" hint="Notas livres sobre o paciente (opcional)." full-width>
            <template #default="{ id, describedBy }">
              <textarea
                :id="id"
                class="patient-textarea"
                :aria-describedby="describedBy || undefined"
                :value="f.values.notes"
                rows="4"
                placeholder="Histórico relevante, preferências, alertas…"
                @input="f.setField('notes', $event.target.value)"
              />
            </template>
          </UiFormField>
        </UiFormSection>
      </UiCard>

      <div class="form-actions">
        <p class="form-hint">Os campos marcados com <span class="req-mark">*</span> são obrigatórios.</p>
        <div class="form-buttons">
          <UiButton variant="ghost" type="button" :disabled="f.submitting.value" @click="cancel">Cancelar</UiButton>
          <UiButton variant="primary" type="submit" :loading="f.submitting.value">Cadastrar paciente</UiButton>
        </div>
      </div>
    </form>
  </UiPageLayout>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
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
} from '../ui/index.js';
import { patients, me } from '../api.js';

const router = useRouter();
const toast = useToast();
const askConfirm = useConfirm();

// ---- RBAC: deny-by-default por papel (>= professional) ----------------------
// O BACKEND é a fonte da verdade (responde 401/403 no POST). Aqui lemos o papel da
// SESSÃO REAL via `me()` (GET /v1/me — mesmo mecanismo de ProfessionalListView), e
// só negamos PREVENTIVAMENTE quando o papel conhecido é insuficiente. Sem papel
// confirmado, ficamos otimistas e deixamos o 403 do servidor ser o guard de verdade.
const ROLE_RANK = { viewer: 0, member: 1, professional: 2, clinic_manager: 3, manager: 3, admin: 4, owner: 5 };
const MIN_ROLE = 'professional';
const authState = ref('loading'); // loading | ok | denied | error
const deniedMessage = ref('Você precisa de perfil profissional (ou superior) para cadastrar pacientes. Fale com um administrador.');

function roleFromIdentity(identity) {
  return String((identity && (identity.role || (identity.user && identity.user.role))) || '')
    .toLowerCase()
    .trim();
}

async function checkAccess() {
  authState.value = 'loading';
  let role = '';
  try {
    // Identidade pela camada api.js (contrato/erro padronizado), sem fetch solto na view.
    const identity = await me();
    role = roleFromIdentity(identity);
  } catch (e) {
    // 401/403/404/sem identidade → fail-safe OTIMISTA: não bloqueamos preventivamente,
    // o POST de cadastro carrega o RBAC real do backend. Erro inesperado → estado de erro.
    if (e && (e.status === 401 || e.status === 403 || e.status === 404)) {
      authState.value = 'ok';
      return;
    }
    authState.value = 'error';
    return;
  }
  if (!role) {
    // Papel não exposto pela sessão → otimista; o backend decide no submit.
    authState.value = 'ok';
    return;
  }
  const rank = ROLE_RANK[role];
  if (rank === undefined) {
    // Papel desconhecido para o ranking → não bloqueia preventivamente.
    authState.value = 'ok';
    return;
  }
  authState.value = rank >= ROLE_RANK[MIN_ROLE] ? 'ok' : 'denied';
}

// ---- Opções de domínio ------------------------------------------------------
const STATUS_LABELS = {
  active: 'Ativo',
  on_hold: 'Em espera',
  discharged: 'Alta',
  archived: 'Arquivado',
};
const statusOptions = Object.keys(STATUS_LABELS).map((value) => ({ value, label: STATUS_LABELS[value] }));
const statusLabelFor = (s) => STATUS_LABELS[s] || s;

// Profissionais: preenchido se o endpoint existir; senão cai para texto livre.
const professionalOptions = ref([]);
const professionalHint = computed(() =>
  professionalOptions.value.length ? 'Quem acompanha o paciente.' : 'Identificador do profissional responsável (opcional).',
);
const guardianHint = computed(() =>
  isMinor.value ? 'Paciente menor de idade — informe o responsável legal.' : 'Opcional para pacientes adultos.',
);

// ---- Formulário -------------------------------------------------------------
const cpfPattern = /^(\d{11}|\d{3}\.\d{3}\.\d{3}-\d{2})$/;
const phonePattern = /^[\d\s()+\-]{8,20}$/;

const f = useForm({
  initial: {
    full_name: '',
    birth_date: '',
    document: '',
    email: '',
    phone: '',
    guardian_name: '',
    assigned_professional_id: '',
    status: 'active',
    notes: '',
  },
  rules: {
    full_name: [validators.required('Informe o nome completo.'), validators.minLen(2)],
    document: [validators.pattern(cpfPattern, 'CPF inválido (use 11 dígitos ou 000.000.000-00).')],
    email: [validators.email()],
    phone: [validators.pattern(phonePattern, 'Telefone inválido.')],
    status: [validators.required('Selecione a situação.')],
  },
});

// Idade derivada da data de nascimento (feedback inline + regra de responsável).
const ageInYears = computed(() => {
  const raw = f.values.birth_date;
  if (!raw) return null;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age -= 1;
  return age >= 0 && age < 150 ? age : null;
});
const isMinor = computed(() => ageInYears.value !== null && ageInYears.value < 18);
const ageHint = computed(() => (ageInYears.value === null ? 'Opcional.' : ageInYears.value + ' anos'));

// Idempotency-Key: gerada uma vez por montagem do formulário (1 paciente por tentativa).
function newIdempotencyKey() {
  try {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return 'patient-' + crypto.randomUUID();
  } catch (_e) {
    /* fallback abaixo */
  }
  return 'patient-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
}
const idempotencyKey = ref(newIdempotencyKey());

function isDirty() {
  const v = f.values;
  return Boolean(
    v.full_name || v.birth_date || v.document || v.email || v.phone || v.guardian_name || v.assigned_professional_id || v.notes || v.status !== 'active',
  );
}

async function submit() {
  await f.handleSubmit(async (vals) => {
    const payload = {
      full_name: vals.full_name.trim(),
      birth_date: vals.birth_date || null,
      document: vals.document ? vals.document.trim() : null,
      email: vals.email ? vals.email.trim() : null,
      phone: vals.phone ? vals.phone.trim() : null,
      guardian_name: vals.guardian_name ? vals.guardian_name.trim() : null,
      assigned_professional_id: vals.assigned_professional_id || null,
      status: vals.status,
      notes: vals.notes ? vals.notes.trim() : null,
    };
    try {
      // Idempotência: a fábrica REST encaminha { idempotencyKey } como header Idempotency-Key
      // (ver api.js → headersFor). Mesma chave p/ retries da MESMA submissão; renovada só após 409.
      const created = await patients.create(payload, { idempotencyKey: idempotencyKey.value });
      toast.success('Paciente cadastrado com sucesso.');
      const id = created && (created.id || (created.data && created.data.id));
      router.push(id ? '/patients/' + id : '/patients');
    } catch (e) {
      if (e && (e.status === 401 || e.status === 403)) {
        authState.value = 'denied';
        deniedMessage.value = e.message || deniedMessage.value;
        toast.error('Sem permissão para cadastrar pacientes.');
        return;
      }
      // Conflito (idempotência / documento duplicado) → renova a chave p/ próxima tentativa.
      if (e && e.status === 409) {
        idempotencyKey.value = newIdempotencyKey();
        toast.error(e.message || 'Já existe um paciente com esses dados.');
        return;
      }
      toast.error(e.message || 'Não foi possível cadastrar o paciente.');
    }
  });
}

async function cancel() {
  if (isDirty()) {
    const ok = await askConfirm({
      title: 'Descartar cadastro?',
      message: 'As informações preenchidas serão perdidas.',
      confirmLabel: 'Descartar',
      danger: true,
    });
    if (!ok) return;
  }
  router.push('/patients');
}

async function loadProfessionals() {
  // Best-effort: usa a lista de pacientes só p/ derivar profissionais? Não — sem endpoint
  // dedicado confirmado, mantemos texto livre. Mantido como ponto de extensão fail-soft.
  professionalOptions.value = [];
}

onMounted(() => {
  checkAccess();
  loadProfessionals();
});
</script>

<style scoped>
.patient-form {
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-5);
}

/* Base do select/textarea (background/border/raio/padding/width + min-height do textarea)
   vem do kit via UiFormField `:deep(select|textarea)`. Aqui só adicionamos o que o kit
   não cobre: transição, foco visível, aria-invalid e placeholder — sem duplicar tokens. */
.patient-select,
.patient-textarea {
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}
.patient-select:focus,
.patient-textarea:focus {
  outline: none;
  border-color: rgb(var(--ui-accent));
  box-shadow: 0 0 0 3px rgb(var(--ui-accent) / 0.15);
}
.patient-select[aria-invalid='true'],
.patient-textarea[aria-invalid='true'] {
  border-color: rgb(var(--ui-danger));
}
.patient-textarea::placeholder {
  color: rgb(var(--ui-faint));
}

.patient-status {
  display: flex;
  align-items: center;
  gap: var(--ui-space-3);
}
.patient-status .patient-select {
  flex: 1 1 auto;
}

.form-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ui-space-4);
  flex-wrap: wrap;
  padding-top: var(--ui-space-2);
}
.form-hint {
  margin: 0;
  color: rgb(var(--ui-muted));
  font-size: var(--ui-text-sm);
}
.req-mark {
  color: rgb(var(--ui-danger));
  font-weight: 700;
}
.form-buttons {
  display: flex;
  gap: var(--ui-space-2);
}

@media (max-width: 640px) {
  .form-actions {
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
