<template>
  <UiPageLayout
    eyebrow="Pacientes"
    title="Novo paciente"
    subtitle="Preencha os dados pessoais, contato, responsável legal e observações clínicas. Todos os campos marcados com * são obrigatórios."
    width="narrow"
  >
    <template #actions>
      <UiButton variant="ghost" to="/patients">Voltar à lista</UiButton>
    </template>

    <!-- ESTADO: verificando acesso (loading) -->
    <UiLoadingState
      v-if="authState === 'loading'"
      variant="skeleton"
      :skeleton-lines="8"
      title="Verificando permissão…"
    />

    <!-- ESTADO: erro ao verificar acesso (com retry) -->
    <UiErrorState
      v-else-if="authState === 'error'"
      message="Não foi possível verificar sua permissão de acesso."
      :retryable="true"
      @retry="checkAccess"
    />

    <!-- ESTADO: sem permissão -->
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

    <!-- ESTADO: normal — formulário completo -->
    <form v-else class="pc-form" novalidate @submit.prevent="submit">

      <!-- Resumo ao vivo -->
      <section class="pc-summary" aria-label="Resumo do cadastro">
        <UiMetricCard
          label="Paciente"
          :value="nameSummary"
          tone="primary"
          hint="Nome que será registrado"
        />
        <UiMetricCard
          label="Idade"
          :value="ageSummary"
          :tone="isMinor ? 'warning' : 'neutral'"
          :hint="isMinor ? 'Menor de idade — responsável obrigatório' : 'Idade calculada'"
        />
        <UiMetricCard
          label="Situação"
          :value="statusSummary"
          :tone="statusTone"
          hint="Status inicial do paciente"
        />
      </section>

      <!-- Aviso de menor de idade -->
      <div v-if="isMinor" class="pc-minor-alert" role="alert">
        <span class="pc-minor-icon" aria-hidden="true">⚠</span>
        Paciente menor de idade — o preenchimento do responsável legal é obrigatório.
      </div>

      <!-- Seção: Dados pessoais -->
      <UiCard title="Dados pessoais" subtitle="Identificação civil do paciente no prontuário.">
        <UiFormSection :columns="2">
          <!-- Nome completo (full-width, obrigatório) -->
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
                placeholder="Ex.: Maria Eduarda Souza"
                @update:model-value="f.setField('full_name', $event)"
              />
            </template>
          </UiFormField>

          <!-- Data de nascimento -->
          <UiFormField
            label="Data de nascimento"
            :error="f.errors.birth_date"
            :hint="ageHint"
          >
            <template #default="{ id, describedBy }">
              <UiInput
                :id="id"
                :described-by="describedBy"
                type="date"
                :model-value="f.values.birth_date"
                :error="!!f.errors.birth_date"
                :max="todayIso"
                autocomplete="bday"
                @update:model-value="f.setField('birth_date', $event)"
              />
            </template>
          </UiFormField>

          <!-- CPF (persistido na coluna `document` do backend — mesmo campo do Edit) -->
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
                placeholder="000.000.000-00"
                autocomplete="off"
                @update:model-value="f.setField('document', $event)"
              />
            </template>
          </UiFormField>

          <!-- Gênero -->
          <UiFormField
            label="Gênero"
            :error="f.errors.gender"
            hint="Identidade de gênero do paciente."
          >
            <template #default="{ id, describedBy }">
              <select
                :id="id"
                class="pc-select"
                :aria-describedby="describedBy || undefined"
                :aria-invalid="f.errors.gender ? 'true' : undefined"
                :value="f.values.gender"
                @change="f.setField('gender', $event.target.value)"
              >
                <option value="">Não informado</option>
                <option v-for="opt in genderOptions" :key="opt.value" :value="opt.value">
                  {{ opt.label }}
                </option>
              </select>
            </template>
          </UiFormField>
        </UiFormSection>
      </UiCard>

      <!-- Seção: Contato -->
      <UiCard title="Contato" subtitle="Por onde entrar em contato com o paciente ou responsável.">
        <UiFormSection :columns="2">
          <!-- E-mail -->
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

          <!-- Telefone -->
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

      <!-- Seção: Responsável legal -->
      <UiCard
        title="Responsável legal"
        subtitle="Obrigatório para menores de idade. Opcional para pacientes adultos."
      >
        <UiFormSection :columns="1">
          <UiFormField
            label="Nome do responsável"
            :required="isMinor"
            :error="f.errors.guardian_name"
            :hint="guardianHint"
          >
            <template #default="{ id, describedBy }">
              <UiInput
                :id="id"
                :described-by="describedBy"
                :model-value="f.values.guardian_name"
                :error="!!f.errors.guardian_name"
                :required="isMinor"
                placeholder="Nome completo do responsável legal"
                @update:model-value="f.setField('guardian_name', $event)"
              />
            </template>
          </UiFormField>
        </UiFormSection>
      </UiCard>

      <!-- Seção: Situação clínica -->
      <UiCard title="Situação clínica" subtitle="Status inicial do paciente e referência externa, se houver.">
        <UiFormSection :columns="2">
          <!-- Status -->
          <UiFormField
            label="Situação"
            :required="true"
            :error="f.errors.status"
            hint="Status inicial do acompanhamento."
          >
            <template #default="{ id, describedBy }">
              <div class="pc-status-row">
                <select
                  :id="id"
                  class="pc-select"
                  :aria-describedby="describedBy || undefined"
                  :aria-required="true"
                  :aria-invalid="f.errors.status ? 'true' : undefined"
                  :value="f.values.status"
                  @change="f.setField('status', $event.target.value)"
                >
                  <option value="" disabled>Selecione a situação</option>
                  <option v-for="opt in statusOptions" :key="opt.value" :value="opt.value">
                    {{ opt.label }}
                  </option>
                </select>
                <UiStatusBadge
                  v-if="f.values.status"
                  :status="f.values.status"
                  :label="statusLabelFor(f.values.status)"
                />
              </div>
            </template>
          </UiFormField>

          <!-- Referência externa -->
          <UiFormField
            label="Referência externa"
            :error="f.errors.external_ref"
            hint="ID de sistema externo, prontuário legado ou código de convênio."
          >
            <template #default="{ id, describedBy }">
              <UiInput
                :id="id"
                :described-by="describedBy"
                :model-value="f.values.external_ref"
                :error="!!f.errors.external_ref"
                autocomplete="off"
                placeholder="Ex.: PRN-00123"
                @update:model-value="f.setField('external_ref', $event)"
              />
            </template>
          </UiFormField>
        </UiFormSection>
      </UiCard>

      <!-- Seção: Observações -->
      <UiCard
        title="Observações gerais"
        subtitle="Notas livres sobre histórico, preferências, alertas ou informações relevantes para o atendimento."
      >
        <UiFormSection :columns="1">
          <UiFormField
            label="Observações"
            :error="f.errors.notes"
            hint="Opcional. Máximo 2 000 caracteres."
            full-width
          >
            <template #default="{ id, describedBy }">
              <textarea
                :id="id"
                class="pc-textarea"
                :aria-describedby="describedBy || undefined"
                :aria-invalid="f.errors.notes ? 'true' : undefined"
                :value="f.values.notes"
                rows="5"
                maxlength="2000"
                placeholder="Histórico relevante, alergias, medicações em uso, preferências de contato…"
                @input="f.setField('notes', $event.target.value)"
              />
            </template>
          </UiFormField>
          <!-- Contador de caracteres -->
          <p class="pc-char-count" aria-live="polite">
            {{ notesLen }} / 2 000 caracteres
          </p>
        </UiFormSection>
      </UiCard>

      <!-- Rodapé de ações -->
      <div class="pc-actions">
        <p class="pc-actions-hint">
          Os campos marcados com <span class="pc-req">*</span> são obrigatórios.
        </p>
        <div class="pc-actions-buttons">
          <UiButton
            variant="ghost"
            type="button"
            :disabled="f.submitting.value"
            @click="cancel"
          >
            Cancelar
          </UiButton>
          <UiButton variant="primary" type="submit" :loading="f.submitting.value">
            Cadastrar paciente
          </UiButton>
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
  UiMetricCard,
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
  resolveTone,
} from '../ui/index.js';
import { patients, me } from '../api.js';

const router = useRouter();
const toast = useToast();
const askConfirm = useConfirm();

// ── RBAC: deny-by-default para papéis abaixo de "professional" ───────────────
// O backend é a fonte da verdade (retorna 401/403 no POST). Aqui fazemos o check
// preventivo via me() para UX antecipada — se me() falhar com 401/403/404,
// tratamos como otimista e deixamos o POST ser o guard real.
// A régua espelha api/src/rbac.js (patient < professional < clinic_manager < owner).
// Papel reconhecido porém insuficiente (ex.: patient) OU desconhecido → deny.
const ROLE_RANK = {
  patient: 1, professional: 2, clinic_manager: 3, owner: 4,
};
const MIN_ROLE = 'professional';
const authState = ref('loading'); // loading | ok | denied | error
const deniedMessage = ref(
  'Você precisa de perfil profissional (ou superior) para cadastrar pacientes. Fale com um administrador.',
);

function roleFromIdentity(identity) {
  return String((identity && (identity.role || (identity.user && identity.user.role))) || '')
    .toLowerCase()
    .trim();
}

async function checkAccess() {
  authState.value = 'loading';
  let role = '';
  try {
    const identity = await me();
    role = roleFromIdentity(identity);
  } catch (e) {
    // 401/403/404 → otimista (POST vai barrar se realmente não tiver permissão)
    if (e && (e.status === 401 || e.status === 403 || e.status === 404)) {
      authState.value = 'ok';
      return;
    }
    authState.value = 'error';
    return;
  }
  // Sem role identificável no me() → otimista (o POST é o guard real).
  if (!role) { authState.value = 'ok'; return; }
  // Role conhecido: aplica a régua. Role desconhecido → deny-by-default.
  const rank = ROLE_RANK[role];
  if (rank === undefined) { authState.value = 'denied'; return; }
  authState.value = rank >= ROLE_RANK[MIN_ROLE] ? 'ok' : 'denied';
}

// ── Opções de domínio ─────────────────────────────────────────────────────────
const GENDER_LABELS = {
  masculino: 'Masculino',
  feminino: 'Feminino',
  outro: 'Outro',
  nao_informado: 'Prefiro não informar',
};
const genderOptions = Object.entries(GENDER_LABELS).map(([value, label]) => ({ value, label }));

const STATUS_LABELS = {
  ativo: 'Ativo',
  inativo: 'Inativo',
  alta: 'Alta',
};
const statusOptions = Object.entries(STATUS_LABELS).map(([value, label]) => ({ value, label }));
const statusLabelFor = (s) => STATUS_LABELS[s] || s;

// ── Data máxima (hoje) para nascimento ───────────────────────────────────────
const todayIso = (() => {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
})();

// ── Formulário ────────────────────────────────────────────────────────────────
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
    gender: '',
    status: '',
    notes: '',
    external_ref: '',
  },
  rules: {
    full_name: [validators.required('Informe o nome completo.'), validators.minLen(2)],
    document: [validators.pattern(cpfPattern, 'CPF inválido. Use 11 dígitos ou 000.000.000-00.')],
    email: [validators.email()],
    phone: [validators.pattern(phonePattern, 'Telefone inválido. Informe DDD + número.')],
    // guardian_name: validação condicional — obrigatório apenas quando o paciente é menor de idade.
    // A função lê isMinor.value em tempo de validação (não no momento do registro), garantindo
    // que handleSubmit bloqueie o submit quando isMinor===true e o campo estiver vazio.
    guardian_name: [
      (v) => !isMinor.value || (typeof v === 'string' && v.trim().length > 0)
        ? ''
        : 'Informe o responsável legal para pacientes menores de idade.',
    ],
    status: [validators.required('Selecione a situação.')],
    notes: [validators.maxLen(2000, 'Observações com no máximo 2 000 caracteres.')],
  },
});

// ── Derivados de exibição ─────────────────────────────────────────────────────
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
const ageHint = computed(() =>
  ageInYears.value === null ? 'Opcional.' : ageInYears.value + ' anos',
);
const guardianHint = computed(() =>
  isMinor.value
    ? 'Paciente menor de idade — informe o responsável legal.'
    : 'Opcional para pacientes adultos.',
);

// Metric cards (resumo ao vivo)
const nameSummary = computed(() => {
  const n = (f.values.full_name || '').trim();
  if (!n) return '—';
  const parts = n.split(/\s+/);
  return parts.length > 1 ? parts[0] + ' ' + parts[parts.length - 1] : n;
});
const ageSummary = computed(() =>
  ageInYears.value === null ? '—' : ageInYears.value + ' anos',
);
const statusSummary = computed(() => statusLabelFor(f.values.status) || '—');
const statusTone = computed(() => {
  const map = { ativo: 'success', inativo: 'neutral', alta: 'primary' };
  return map[f.values.status] || 'neutral';
});

// Contador de caracteres para observações
const notesLen = computed(() => (f.values.notes || '').length);

// ── Idempotency-Key ───────────────────────────────────────────────────────────
function newIdempotencyKey() {
  try {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      return 'patient-' + crypto.randomUUID();
    }
  } catch (_e) { /* fallback */ }
  return 'patient-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
}
const idempotencyKey = ref(newIdempotencyKey());

// ── Formulário sujo (para confirmar descarte) ─────────────────────────────────
function isDirty() {
  const v = f.values;
  return Boolean(
    v.full_name || v.birth_date || v.document || v.email || v.phone ||
    v.guardian_name || v.gender || v.notes || v.external_ref ||
    v.status,
  );
}

// ── Submit ────────────────────────────────────────────────────────────────────
async function submit() {
  await f.handleSubmit(async (vals) => {
    const payload = {
      full_name: vals.full_name.trim(),
      birth_date: vals.birth_date || null,
      // CPF vai na coluna real `document` (mesmo campo que o Edit persiste). Antes ia como
      // `cpf`, que o backend descartava (createPatient só grava `document`) — dado perdido.
      document: vals.document ? vals.document.trim() : null,
      email: vals.email ? vals.email.trim().toLowerCase() : null,
      phone: vals.phone ? vals.phone.trim() : null,
      guardian_name: vals.guardian_name ? vals.guardian_name.trim() : null,
      // NOTA (backend): `gender` e `external_ref` NÃO têm coluna em patients (ver
      // api/src/repositories/patients-repo.js). São enviados por paridade com o Edit, mas o
      // backend os ignora. Persistir de verdade exige decisão de schema/API (fora do escopo UX).
      gender: vals.gender || null,
      status: vals.status,
      notes: vals.notes ? vals.notes.trim() : null,
      external_ref: vals.external_ref ? vals.external_ref.trim() : null,
    };
    try {
      const created = await patients.create(payload, { idempotencyKey: idempotencyKey.value });
      toast.success('Paciente cadastrado com sucesso!');
      const id = created && (created.id || (created.data && created.data.id));
      router.push(id ? '/patients/' + id : '/patients');
    } catch (e) {
      if (e && (e.status === 401 || e.status === 403)) {
        authState.value = 'denied';
        deniedMessage.value = e.message || deniedMessage.value;
        toast.error('Sem permissão para cadastrar pacientes.');
        return;
      }
      if (e && e.status === 409) {
        idempotencyKey.value = newIdempotencyKey();
        toast.error(e.message || 'Já existe um paciente com esses dados. Verifique o CPF ou e-mail.');
        return;
      }
      toast.error(e && e.message ? e.message : 'Não foi possível cadastrar o paciente. Tente novamente.');
    }
  });
}

// ── Cancelar ─────────────────────────────────────────────────────────────────
async function cancel() {
  if (isDirty()) {
    const ok = await askConfirm({
      title: 'Descartar cadastro?',
      message: 'As informações preenchidas serão perdidas. Deseja continuar?',
      confirmLabel: 'Descartar',
      danger: true,
    });
    if (!ok) return;
  }
  router.push('/patients');
}

onMounted(checkAccess);
</script>

<style scoped>
/* Layout geral */
.pc-form {
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-5);
}

/* Resumo ao vivo (metric cards) */
.pc-summary {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: var(--ui-space-4);
}

/* Aviso de menor de idade */
.pc-minor-alert {
  display: flex;
  align-items: center;
  gap: var(--ui-space-2);
  padding: var(--ui-space-2) var(--ui-space-4);
  border-radius: var(--ui-radius-sm);
  background: rgb(var(--ui-warning) / 0.1);
  border: 1px solid rgb(var(--ui-warning) / 0.35);
  color: rgb(var(--ui-fg));
  font-size: var(--ui-text-sm);
}
.pc-minor-icon {
  font-size: 1.1em;
  color: rgb(var(--ui-warning));
  flex: 0 0 auto;
}

/*
 * Select/Textarea: estilos BASE (width, padding, border, background, font) são injetados pelo
 * UiFormField via :deep(select) e :deep(textarea) — veja packages/ui-vue/UiFormField.vue.
 * Aqui acrescentamos apenas box-sizing, transições, foco e estado de erro com tokens --ui-*.
 */
.pc-select {
  box-sizing: border-box;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}
.pc-select:focus {
  outline: none;
  border-color: rgb(var(--ui-accent));
  box-shadow: 0 0 0 3px rgb(var(--ui-accent) / 0.15);
}
.pc-select[aria-invalid='true'] {
  border-color: rgb(var(--ui-danger));
}
.pc-select[aria-invalid='true']:focus {
  box-shadow: 0 0 0 3px rgb(var(--ui-danger) / 0.15);
}

/* Textarea */
.pc-textarea {
  box-sizing: border-box;
  resize: vertical;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}
.pc-textarea:focus {
  outline: none;
  border-color: rgb(var(--ui-accent));
  box-shadow: 0 0 0 3px rgb(var(--ui-accent) / 0.15);
}
.pc-textarea[aria-invalid='true'] {
  border-color: rgb(var(--ui-danger));
}
.pc-textarea[aria-invalid='true']:focus {
  box-shadow: 0 0 0 3px rgb(var(--ui-danger) / 0.15);
}
.pc-textarea::placeholder {
  color: rgb(var(--ui-faint));
}

/* Linha de status + badge ao vivo */
.pc-status-row {
  display: flex;
  align-items: center;
  gap: var(--ui-space-3);
}
.pc-status-row .pc-select {
  flex: 1 1 auto;
}

/* Contador de caracteres */
.pc-char-count {
  margin: calc(var(--ui-space-1) * -1) 0 0;
  font-size: var(--ui-text-xs);
  color: rgb(var(--ui-muted));
  text-align: right;
}

/* Rodapé de ações */
.pc-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ui-space-4);
  flex-wrap: wrap;
  padding-top: var(--ui-space-2);
}
.pc-actions-hint {
  margin: 0;
  color: rgb(var(--ui-muted));
  font-size: var(--ui-text-sm);
}
.pc-req {
  color: rgb(var(--ui-danger));
  font-weight: 700;
}
.pc-actions-buttons {
  display: flex;
  gap: var(--ui-space-2);
}

/* Responsivo */
@media (max-width: 860px) {
  .pc-summary {
    grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
    gap: var(--ui-space-3);
  }
}
@media (max-width: 640px) {
  .pc-actions {
    align-items: stretch;
  }
  .pc-actions-buttons {
    width: 100%;
  }
  .pc-actions-buttons :deep(.ui-btn) {
    flex: 1 1 auto;
  }
}
</style>
