<template>
  <UiPageLayout
    eyebrow="Pacientes"
    :title="pageTitle"
    subtitle="Edite os dados cadastrais, ajuste a situação clínica e reatribua o profissional responsável. Toda alteração é registrada para auditoria."
    width="wide"
    :loading="loading"
    loading-message="Carregando paciente…"
    :error="loadError"
    @retry="load"
  >
    <!-- AÇÕES DO TOPO -->
    <template #actions>
      <UiButton variant="ghost" :to="backTo">Voltar</UiButton>
      <UiButton v-if="patient.id" variant="subtle" :to="detailTo">Ver perfil</UiButton>
    </template>

    <!-- BANNER DE AUDITORIA -->
    <template #banner>
      <div class="audit-note" role="note">
        <span class="audit-icon" aria-hidden="true">⚖</span>
        <span class="audit-text">Edição auditável — alterações de dados, situação e responsável ficam registradas.</span>
      </div>
    </template>

    <!-- ESTADO VAZIO: paciente não encontrado (após carregar, sem erro, sem id) -->
    <UiEmptyState
      v-if="notFound"
      title="Paciente não encontrado"
      description="Este paciente pode ter sido arquivado ou o endereço está incorreto."
      icon="search"
    >
      <template #action>
        <UiButton :to="backTo">Voltar para pacientes</UiButton>
      </template>
    </UiEmptyState>

    <!-- CONTEÚDO NORMAL -->
    <div v-else class="edit-grid">
      <!-- COLUNA PRINCIPAL: FORMULÁRIO CADASTRAL -->
      <div class="edit-main">
        <UiCard title="Dados cadastrais" subtitle="Informações de identificação e contato do paciente.">
          <template #actions>
            <UiStatusBadge :status="patient.status" :label="statusLabelText(patient.status)" size="lg" />
          </template>

          <form novalidate @submit.prevent="saveProfile">
            <UiFormSection title="Identificação" description="Nome e dados pessoais." :columns="2">
              <UiFormField label="Nome completo" :required="true" :error="f.errors.full_name" full-width>
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

              <UiFormField label="Data de nascimento" :error="f.errors.birth_date" hint="Usada para calcular a idade.">
                <template #default="{ id, describedBy }">
                  <UiInput
                    :id="id"
                    :described-by="describedBy"
                    type="date"
                    :model-value="f.values.birth_date"
                    :error="!!f.errors.birth_date"
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

            <UiFormSection title="Contato" description="Como falar com o paciente ou responsável." :columns="2">
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

              <UiFormField label="Telefone / WhatsApp" :error="f.errors.phone">
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

              <UiFormField label="Responsável" :error="f.errors.guardian_name" hint="Preencha para menores de idade ou pacientes assistidos." full-width>
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

            <UiFormSection title="Observações" description="Anotações gerais não-clínicas sobre o paciente." :columns="1">
              <UiFormField label="Observações gerais" :error="f.errors.notes">
                <template #default="{ id, describedBy }">
                  <!-- bare <textarea>: base (borda/fundo/padding) vem do kit via UiFormField :deep(textarea);
                       o kit não tem UiTextarea, então só ajustamos altura/foco com tokens --ui-* -->
                  <textarea
                    :id="id"
                    class="edit-textarea"
                    :aria-describedby="describedBy || undefined"
                    :aria-invalid="f.errors.notes ? 'true' : undefined"
                    :value="f.values.notes"
                    rows="5"
                    placeholder="Preferências de contato, particularidades de agenda, observações administrativas…"
                    @input="f.setField('notes', $event.target.value)"
                  ></textarea>
                </template>
              </UiFormField>
            </UiFormSection>

            <div class="form-actions">
              <UiButton variant="ghost" type="button" :to="backTo">Cancelar</UiButton>
              <UiButton type="submit" :loading="f.submitting.value" :disabled="!dirty">Salvar alterações</UiButton>
            </div>
          </form>
        </UiCard>
      </div>

      <!-- COLUNA LATERAL: SITUAÇÃO, RESPONSÁVEL, AUDITORIA -->
      <aside class="edit-side">
        <!-- SITUAÇÃO CLÍNICA -->
        <UiCard title="Situação" subtitle="Alta, espera ou arquivamento.">
          <p class="side-current">
            Situação atual:
            <UiStatusBadge :status="patient.status" :label="statusLabelText(patient.status)" />
          </p>
          <div class="status-actions">
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
            <p v-if="availableTransitions.length === 0" class="side-hint">
              Nenhuma mudança de situação disponível para este estado.
            </p>
          </div>
        </UiCard>

        <!-- PROFISSIONAL RESPONSÁVEL -->
        <UiCard title="Profissional responsável" subtitle="Quem conduz o acompanhamento.">
          <!-- Carregando a lista de profissionais -->
          <UiLoadingState
            v-if="profState === 'loading'"
            variant="skeleton"
            :skeleton-lines="2"
            title="Carregando equipe…"
          />

          <!-- Falha ao carregar a lista: cai num fallback de texto livre, com retry -->
          <template v-else-if="profState === 'error'">
            <UiErrorState
              message="Não foi possível carregar a lista de profissionais."
              :retryable="true"
              @retry="loadProfessionals"
            />
            <form novalidate @submit.prevent="saveProfessional">
              <UiFormField
                label="Profissional responsável (id)"
                :error="profForm.errors.assigned_professional_id"
                hint="Lista indisponível — informe o identificador. Deixe vazio para liberar o paciente."
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
              <div class="form-actions">
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

          <!-- Caminho normal: select populado por GET /v1/professionals -->
          <form v-else novalidate @submit.prevent="saveProfessional">
            <UiFormField
              label="Profissional responsável"
              :error="profForm.errors.assigned_professional_id"
              hint="Escolha o profissional ou deixe sem responsável para liberar o paciente."
            >
              <template #default="{ id, describedBy }">
                <select
                  :id="id"
                  class="prof-select"
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
            <div class="form-actions">
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

        <!-- METADADOS / AUDITORIA -->
        <UiCard title="Registro" subtitle="Dados de auditoria.">
          <dl class="meta-kv">
            <div>
              <dt>Identificador</dt>
              <dd class="meta-mono">{{ patient.id || '—' }}</dd>
            </div>
            <div>
              <dt>Cadastrado em</dt>
              <dd>{{ format.formatDateTime(patient.created_at) }}</dd>
            </div>
            <div>
              <dt>Situação</dt>
              <dd><UiStatusBadge :status="patient.status" :label="statusLabelText(patient.status)" size="sm" /></dd>
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
  UiPageLayout, UiCard, UiFormSection, UiFormField, UiInput, UiButton,
  UiStatusBadge, UiEmptyState, UiLoadingState, UiErrorState,
  useForm, useToast, useConfirm, validators, format,
} from '../ui/index.js';
import { patients, professionals } from '../api.js';

const props = defineProps({ id: { type: String, required: true } });

const router = useRouter();
const toast = useToast();
const confirm = useConfirm();

// ---- rotas reais de DOMÍNIO ----
const backTo = '/patients';
const detailTo = computed(() => '/patients/' + props.id);

// ---- estado de tela ----
const loading = ref(true);
const loadError = ref(null);
const patient = reactive({});

const notFound = computed(() => !loading.value && !loadError.value && !patient.id);

const pageTitle = computed(() => (patient.full_name ? 'Editar — ' + patient.full_name : 'Editar paciente'));

// ---- rótulos de situação (enum do domínio) ----
const STATUS_LABELS = {
  active: 'Em acompanhamento',
  on_hold: 'Em espera',
  discharged: 'Alta',
  archived: 'Arquivado',
};
function statusLabelText(value) {
  return STATUS_LABELS[value] || format.humanize(value);
}

// ---- formulário cadastral ----
const f = useForm({
  initial: {
    full_name: '', birth_date: '', document: '', email: '',
    phone: '', guardian_name: '', notes: '',
  },
  rules: {
    full_name: [validators.required('Informe o nome completo.'), validators.minLen(2)],
    email: [validators.email()],
    document: [validators.pattern(/^[\d.\-\s]*$/, 'Use apenas números, pontos e traço.')],
  },
});

// snapshot para detectar alterações não salvas
const snapshot = ref('');
function currentSnapshot() {
  return JSON.stringify({
    full_name: f.values.full_name, birth_date: f.values.birth_date,
    document: f.values.document, email: f.values.email,
    phone: f.values.phone, guardian_name: f.values.guardian_name, notes: f.values.notes,
  });
}
const dirty = computed(() => snapshot.value !== currentSnapshot());

// ---- profissional responsável (gerido em separado, validado via useForm) ----
// O campo vira um select populado por GET /v1/professionals (recurso REAL); se a lista
// falhar, a UI cai num fallback de texto livre com a MESMA validação de formato.
const PROF_ID_RX = /^[A-Za-z0-9_-]*$/; // vazio é válido (= liberar paciente)
const profForm = useForm({
  initial: { assigned_professional_id: '' },
  rules: {
    assigned_professional_id: [validators.pattern(PROF_ID_RX, 'Identificador inválido (letras, números, hífen e _).')],
  },
});
const profSaving = ref(false);

// lista de profissionais para o select
const professionalList = ref([]);
const profState = ref('loading'); // loading | ready | error
const professionalOptions = computed(() =>
  professionalList.value.map((p) => ({
    value: String(p.id),
    label: p.full_name ? p.full_name + (p.specialty ? ' — ' + p.specialty : '') : 'Profissional ' + p.id,
  }))
);

// dirty = valor escolhido difere do responsável atual do paciente
const profDirty = computed(
  () => profForm.values.assigned_professional_id !== (patient.assigned_professional_id || '')
);

async function loadProfessionals() {
  profState.value = 'loading';
  try {
    const res = await professionals.list({ pageSize: 200, sort: 'full_name', dir: 'asc' });
    professionalList.value = Array.isArray(res) ? res : (res && res.data) || [];
    profState.value = 'ready';
  } catch {
    // fail-soft: a tela de edição não depende da lista para gravar (fallback de texto)
    professionalList.value = [];
    profState.value = 'error';
  }
}

// ---- situação ----
const statusSaving = ref('');

// transições possíveis a partir do estado atual (com confirmação onde for sensível)
const TRANSITIONS = {
  active: [
    { value: 'on_hold', action: 'Colocar em espera', variant: 'ghost', confirm: { title: 'Colocar em espera', message: 'O acompanhamento ficará pausado até a reativação. Confirma colocar este paciente em espera?', danger: false } },
    { value: 'discharged', action: 'Dar alta', variant: 'primary', confirm: { title: 'Dar alta', message: 'Registrar a alta encerra o acompanhamento ativo. Esta ação fica registrada para auditoria. Confirma a alta?', danger: false } },
    { value: 'archived', action: 'Arquivar', variant: 'danger', confirm: { title: 'Arquivar paciente', message: 'Arquivar remove o paciente das listas ativas. A ação é auditável e pode ser revertida por um administrador. Deseja arquivar?', danger: true } },
  ],
  on_hold: [
    { value: 'active', action: 'Reativar acompanhamento', variant: 'primary', confirm: null },
    { value: 'discharged', action: 'Dar alta', variant: 'subtle', confirm: { title: 'Dar alta', message: 'Registrar a alta encerra o acompanhamento. Confirma a alta?', danger: false } },
    { value: 'archived', action: 'Arquivar', variant: 'danger', confirm: { title: 'Arquivar paciente', message: 'Arquivar remove o paciente das listas ativas. Deseja arquivar?', danger: true } },
  ],
  discharged: [
    { value: 'active', action: 'Reabrir acompanhamento', variant: 'primary', confirm: { title: 'Reabrir acompanhamento', message: 'O paciente voltará às listas ativas. Confirma reabrir?', danger: false } },
    { value: 'archived', action: 'Arquivar', variant: 'danger', confirm: { title: 'Arquivar paciente', message: 'Arquivar remove o paciente das listas ativas. Deseja arquivar?', danger: true } },
  ],
  archived: [
    { value: 'active', action: 'Desarquivar', variant: 'primary', confirm: { title: 'Desarquivar paciente', message: 'O paciente voltará para acompanhamento ativo. Confirma desarquivar?', danger: false } },
  ],
};
const availableTransitions = computed(() => TRANSITIONS[patient.status] || []);

// ---- carregamento ----
function hydrate(rec) {
  Object.keys(patient).forEach((k) => delete patient[k]);
  Object.assign(patient, rec || {});
  f.values.full_name = rec.full_name || '';
  f.values.birth_date = (rec.birth_date || '').slice(0, 10);
  f.values.document = rec.document || '';
  f.values.email = rec.email || '';
  f.values.phone = rec.phone || '';
  f.values.guardian_name = rec.guardian_name || '';
  f.values.notes = rec.notes || '';
  profForm.values.assigned_professional_id = rec.assigned_professional_id != null ? String(rec.assigned_professional_id) : '';
  profForm.errors.assigned_professional_id = '';
  snapshot.value = currentSnapshot();
}

async function load() {
  loading.value = true;
  loadError.value = null;
  try {
    const rec = await patients.get(props.id);
    if (rec && rec.id) hydrate(rec);
    else Object.keys(patient).forEach((k) => delete patient[k]); // dispara notFound
  } catch (e) {
    if (e && e.status === 404) {
      Object.keys(patient).forEach((k) => delete patient[k]);
    } else {
      // mensagem amigável (a prop :error vira UiErrorState; objeto Error de rede pode não ter .message útil)
      loadError.value = (e && e.message) || 'Não foi possível carregar o paciente. Tente novamente.';
    }
  } finally {
    loading.value = false;
  }
}

// ---- salvar dados cadastrais ----
function saveProfile() {
  f.handleSubmit(async (vals) => {
    try {
      const payload = {
        full_name: vals.full_name.trim(),
        birth_date: vals.birth_date || null,
        document: vals.document.trim(),
        email: vals.email.trim(),
        phone: vals.phone.trim(),
        guardian_name: vals.guardian_name.trim(),
        notes: vals.notes,
      };
      const updated = await patients.update(props.id, payload);
      hydrate({ ...patient, ...payload, ...(updated && updated.id ? updated : {}) });
      toast.success('Dados do paciente atualizados.');
    } catch (e) {
      toast.error(e.message || 'Não foi possível salvar os dados.');
    }
  });
}

// ---- mudar situação ----
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
    toast.success('Situação alterada para "' + statusLabelText(transition.value) + '".');
  } catch (e) {
    toast.error(e.message || 'Não foi possível alterar a situação.');
  } finally {
    statusSaving.value = '';
  }
}

// rótulo legível de um id de profissional (cai no id cru se a lista não tiver o nome)
function professionalLabel(id) {
  const opt = professionalOptions.value.find((o) => o.value === String(id));
  return opt ? opt.label : String(id);
}

// ---- reatribuir profissional (validação via useForm + confirmação auditável) ----
function saveProfessional() {
  if (profSaving.value) return;
  profForm.handleSubmit(async (vals) => {
    const next = (vals.assigned_professional_id || '').trim();
    if (next === (patient.assigned_professional_id || '')) return; // nada a fazer
    const releasing = next === '';
    const ok = await confirm({
      title: releasing ? 'Liberar paciente' : 'Reatribuir profissional',
      message: releasing
        ? 'O paciente ficará sem profissional responsável. Confirma a liberação?'
        : 'Transferir o acompanhamento para "' + professionalLabel(next) + '"? A troca fica registrada para auditoria.',
      confirmLabel: releasing ? 'Liberar' : 'Reatribuir',
      danger: releasing,
    });
    if (!ok) return;
    profSaving.value = true;
    try {
      await patients.update(props.id, { assigned_professional_id: next || null });
      patient.assigned_professional_id = next;
      profForm.values.assigned_professional_id = next;
      toast.success(releasing ? 'Paciente liberado do profissional anterior.' : 'Profissional responsável atualizado.');
    } catch (e) {
      profForm.errors.assigned_professional_id = (e && e.message) || 'Falha ao reatribuir.';
      toast.error((e && e.message) || 'Não foi possível reatribuir o profissional.');
    } finally {
      profSaving.value = false;
    }
  });
}

onMounted(() => {
  load();
  loadProfessionals();
});
</script>

<style scoped>
.audit-note {
  display: flex;
  align-items: center;
  gap: var(--ui-space-2);
  padding: var(--ui-space-2) var(--ui-space-4);
  background: rgb(var(--ui-info) / 0.1);
  border: 1px solid rgb(var(--ui-info) / 0.3);
  border-radius: var(--ui-radius-md);
  color: rgb(var(--ui-fg));
  font-size: var(--ui-text-sm);
}
.audit-icon { color: rgb(var(--ui-info)); font-size: 1.05rem; }
.audit-text { line-height: 1.4; }

.edit-grid {
  display: grid;
  grid-template-columns: minmax(0, 2.2fr) minmax(280px, 1fr);
  gap: var(--ui-space-5);
  align-items: start;
}
.edit-main { min-width: 0; }
.edit-side {
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-4);
}

/* base (borda/fundo/padding/resize) herdada do kit: UiFormField :deep(textarea).
   Aqui só altura confortável p/ 5 linhas + anel de foco consistente com os demais controles. */
.edit-textarea {
  min-height: 110px;
  transition: border-color .15s ease, box-shadow .15s ease;
}
.edit-textarea:focus {
  outline: none;
  border-color: rgb(var(--ui-accent));
  box-shadow: 0 0 0 3px rgb(var(--ui-accent) / 0.15);
}

.form-actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--ui-space-2);
  margin-top: var(--ui-space-3);
}

/* Select de profissional (UiFormField :deep estiliza a base; aqui só estado/affordance) */
.prof-select {
  appearance: none;
  cursor: pointer;
  width: 100%;
}
.prof-select.is-changed {
  border-color: rgb(var(--ui-accent));
  box-shadow: 0 0 0 3px rgb(var(--ui-accent) / 0.12);
}
.prof-select:focus {
  outline: none;
  border-color: rgb(var(--ui-accent));
  box-shadow: 0 0 0 3px rgb(var(--ui-accent) / 0.15);
}

.side-current {
  display: flex;
  align-items: center;
  gap: var(--ui-space-2);
  flex-wrap: wrap;
  margin: 0 0 var(--ui-space-3);
  color: rgb(var(--ui-muted));
  font-size: var(--ui-text-sm);
}
.status-actions {
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-2);
}
.side-hint {
  margin: 0;
  color: rgb(var(--ui-muted));
  font-size: var(--ui-text-sm);
}

.meta-kv {
  display: grid;
  gap: var(--ui-space-3);
  margin: 0;
}
.meta-kv dt {
  color: rgb(var(--ui-muted));
  font-size: var(--ui-text-xs);
  text-transform: uppercase;
  letter-spacing: .04em;
}
.meta-kv dd {
  margin: 2px 0 0;
  color: rgb(var(--ui-fg));
  font-size: var(--ui-text-sm);
}
.meta-mono {
  font-family: var(--ui-font-mono);
  word-break: break-all;
}

@media (max-width: 860px) {
  .edit-grid {
    grid-template-columns: 1fr;
  }
}
</style>
