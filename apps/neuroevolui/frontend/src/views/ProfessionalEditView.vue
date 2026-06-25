<template>
  <UiPageLayout
    eyebrow="Profissionais"
    title="Editar profissional"
    subtitle="Altere dados, papel de acesso e situação. Mudanças de papel são auditadas e restritas a owner/clinic_manager."
    width="narrow"
    :loading="loading"
    loading-message="Carregando profissional…"
    :error="loadError"
    @retry="load"
  >
    <!-- AÇÕES DO CABEÇALHO -->
    <template #actions>
      <UiButton variant="ghost" :to="detailRoute" :disabled="loading">Ver perfil</UiButton>
      <UiButton variant="subtle" :to="listRoute" :disabled="loading">Voltar à lista</UiButton>
    </template>

    <!-- ESTADO VAZIO: profissional não encontrado (404 ou registro nulo) -->
    <UiEmptyState
      v-if="notFound"
      title="Profissional não encontrado"
      description="Este profissional pode ter sido removido ou o endereço está incorreto."
      icon="person"
    >
      <template #action>
        <UiButton :to="listRoute">Ir para a lista de profissionais</UiButton>
      </template>
    </UiEmptyState>

    <!-- ESTADO NORMAL: formulário de edição -->
    <template v-else>
      <!-- Resumo do registro atual -->
      <UiCard>
        <div class="prof-summary">
          <div class="prof-summary-id">
            <span class="prof-avatar" aria-hidden="true">{{ initials }}</span>
            <div class="prof-summary-meta">
              <p class="prof-summary-name">{{ currentName || 'Profissional' }}</p>
              <p class="prof-summary-mail">{{ original.email || '—' }}</p>
            </div>
          </div>
          <div class="prof-summary-badges">
            <UiStatusBadge :status="original.role" :label="roleLabel(original.role)" tone="neutral" />
            <UiStatusBadge :status="original.status" :label="statusLabelText(original.status)" />
          </div>
        </div>
      </UiCard>

      <!-- Aviso quando o papel será alterado (RBAC / auditado) -->
      <UiCard v-if="roleChanged || statusElevatedRisk" class="prof-alert" :data-tone="roleChanged ? 'role' : 'status'">
        <div class="prof-alert-body">
          <span class="prof-alert-icon" aria-hidden="true">!</span>
          <div>
            <p class="prof-alert-title">
              {{ roleChanged ? 'Mudança de papel será registrada em auditoria' : 'Suspensão revoga o acesso do profissional' }}
            </p>
            <p class="prof-alert-text">
              <template v-if="roleChanged">
                Papel de <strong>{{ roleLabel(original.role) }}</strong> para
                <strong>{{ roleLabel(f.values.role) }}</strong>. Apenas <em>owner</em> e
                <em>clinic_manager</em> podem promover ou rebaixar papéis; a alteração exige confirmação.
              </template>
              <template v-else>
                Ao suspender, o profissional perde o acesso até ser reativado. A ação pede confirmação.
              </template>
            </p>
          </div>
        </div>
      </UiCard>

      <UiCard title="Dados do profissional">
        <form novalidate @submit.prevent="submit">
          <!-- Identificação -->
          <UiFormSection title="Identificação" description="Nome e contato visíveis para a equipe." :columns="2">
            <UiFormField label="Nome completo" :required="true" :error="f.errors.full_name" full-width>
              <template #default="{ id, describedBy }">
                <UiInput
                  :id="id"
                  :described-by="describedBy"
                  :model-value="f.values.full_name"
                  :error="!!f.errors.full_name"
                  :required="true"
                  autocomplete="name"
                  placeholder="Ex.: Maria Helena Souza"
                  @update:model-value="f.setField('full_name', $event)"
                />
              </template>
            </UiFormField>

            <UiFormField label="E-mail" :required="true" :error="f.errors.email" hint="Usado para login e notificações.">
              <template #default="{ id, describedBy }">
                <UiInput
                  :id="id"
                  type="email"
                  :described-by="describedBy"
                  :model-value="f.values.email"
                  :error="!!f.errors.email"
                  :required="true"
                  autocomplete="email"
                  placeholder="nome@clinica.com.br"
                  @update:model-value="f.setField('email', $event)"
                />
              </template>
            </UiFormField>

            <UiFormField label="Telefone" :error="f.errors.phone" hint="Opcional. Inclua DDD.">
              <template #default="{ id, describedBy }">
                <UiInput
                  :id="id"
                  type="tel"
                  :described-by="describedBy"
                  :model-value="f.values.phone"
                  autocomplete="tel"
                  placeholder="(11) 90000-0000"
                  @update:model-value="f.setField('phone', $event)"
                />
              </template>
            </UiFormField>
          </UiFormSection>

          <!-- Atuação profissional -->
          <UiFormSection title="Atuação" description="Especialidade e registro de conselho." :columns="2">
            <UiFormField label="Especialidade" :error="f.errors.specialty">
              <template #default="{ id, describedBy }">
                <UiInput
                  :id="id"
                  :described-by="describedBy"
                  :model-value="f.values.specialty"
                  placeholder="Ex.: Neuropediatria"
                  @update:model-value="f.setField('specialty', $event)"
                />
              </template>
            </UiFormField>

            <UiFormField label="Registro de conselho" :error="f.errors.council_number" hint="CRM, CRP, CREFITO, etc.">
              <template #default="{ id, describedBy }">
                <UiInput
                  :id="id"
                  :described-by="describedBy"
                  :model-value="f.values.council_number"
                  placeholder="Ex.: CRP 06/123456"
                  @update:model-value="f.setField('council_number', $event)"
                />
              </template>
            </UiFormField>
          </UiFormSection>

          <!-- Acesso e situação -->
          <UiFormSection
            title="Acesso e situação"
            description="Papel define as permissões (RBAC). Situação controla o acesso ao sistema."
            :columns="2"
          >
            <UiFormField
              label="Papel"
              :required="true"
              :error="f.errors.role"
              :hint="roleHint"
            >
              <template #default="{ id, describedBy }">
                <select
                  :id="id"
                  class="prof-select"
                  :class="{ 'is-changed': roleChanged }"
                  :aria-describedby="describedBy"
                  :aria-invalid="f.errors.role ? 'true' : undefined"
                  :value="f.values.role"
                  @change="f.setField('role', $event.target.value)"
                >
                  <option v-for="r in roleOptions" :key="r.value" :value="r.value">{{ r.label }}</option>
                </select>
              </template>
            </UiFormField>

            <UiFormField label="Situação" :required="true" :error="f.errors.status" :hint="statusHint">
              <template #default="{ id, describedBy }">
                <select
                  :id="id"
                  class="prof-select"
                  :class="{ 'is-changed': statusChanged }"
                  :aria-describedby="describedBy"
                  :aria-invalid="f.errors.status ? 'true' : undefined"
                  :value="f.values.status"
                  @change="f.setField('status', $event.target.value)"
                >
                  <option v-for="s in statusOptions" :key="s.value" :value="s.value">{{ s.label }}</option>
                </select>
              </template>
            </UiFormField>
          </UiFormSection>

          <!-- Ações do formulário -->
          <div class="prof-actions">
            <div class="prof-actions-state" role="status" aria-live="polite">
              <span v-if="!isDirty" class="prof-state-clean">Sem alterações pendentes</span>
              <span v-else class="prof-state-dirty">{{ changedCount }} alteração(ões) não salva(s)</span>
            </div>
            <div class="prof-actions-buttons">
              <UiButton variant="ghost" type="button" @click="cancel">Cancelar</UiButton>
              <UiButton variant="subtle" type="button" :disabled="!isDirty || f.submitting.value" @click="resetForm">
                Descartar
              </UiButton>
              <UiButton type="submit" :loading="f.submitting.value" :disabled="!isDirty">Salvar alterações</UiButton>
            </div>
          </div>
        </form>
      </UiCard>
    </template>
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
  useForm,
  useToast,
  useConfirm,
  validators,
} from '../ui/index.js';
import { professionals } from '../api.js';

const props = defineProps({ id: { type: String, default: null } });
const router = useRouter();
const toast = useToast();
const ask = useConfirm();

// --- Rotas reais de DOMÍNIO ---
const listRoute = '/professionals';
const detailRoute = computed(() => '/professionals/' + (props.id || ''));

// --- Estado de carregamento do registro ---
const loading = ref(true);
const loadError = ref(null);
const notFound = ref(false);
const original = reactive({
  full_name: '',
  email: '',
  specialty: '',
  council_number: '',
  phone: '',
  role: '',
  status: '',
});

// --- Opções de enums (rótulos legíveis em pt-BR) ---
const roleOptions = [
  { value: 'owner', label: 'Proprietário (owner)' },
  { value: 'clinic_manager', label: 'Gestor da clínica (clinic_manager)' },
  { value: 'professional', label: 'Profissional (professional)' },
];
const statusOptions = [
  { value: 'active', label: 'Ativo' },
  { value: 'invited', label: 'Convidado' },
  { value: 'suspended', label: 'Suspenso' },
];
const ROLE_VALUES = roleOptions.map((o) => o.value);
const STATUS_VALUES = statusOptions.map((o) => o.value);
const roleLabel = (v) => (roleOptions.find((o) => o.value === v) || {}).label || (v || '—');
const statusLabelText = (v) => (statusOptions.find((o) => o.value === v) || {}).label || (v || '—');

const roleHint = 'Promover/rebaixar é auditado e restrito a owner e clinic_manager.';
const statusHint = 'Suspender revoga o acesso até a reativação.';

// --- Formulário ---
const f = useForm({
  initial: { full_name: '', email: '', specialty: '', council_number: '', phone: '', role: '', status: '' },
  rules: {
    full_name: [validators.required('Informe o nome completo'), validators.minLen(2)],
    email: [validators.required('Informe o e-mail'), validators.email()],
    role: [validators.required('Selecione um papel'), validators.pattern(new RegExp('^(' + ROLE_VALUES.join('|') + ')$'), 'Papel inválido')],
    status: [validators.required('Selecione a situação'), validators.pattern(new RegExp('^(' + STATUS_VALUES.join('|') + ')$'), 'Situação inválida')],
  },
});

// --- Derivados de UI ---
const currentName = computed(() => f.values.full_name || original.full_name);
const initials = computed(() => {
  const src = (currentName.value || '').trim();
  if (!src) return '··';
  const parts = src.split(/\s+/).filter(Boolean);
  const a = parts[0] ? parts[0][0] : '';
  const b = parts.length > 1 ? parts[parts.length - 1][0] : '';
  return (a + b).toUpperCase() || '··';
});

const FIELDS = ['full_name', 'email', 'specialty', 'council_number', 'phone', 'role', 'status'];
const norm = (v) => (v === null || v === undefined ? '' : String(v));
const isFieldDirty = (k) => norm(f.values[k]) !== norm(original[k]);
const changedCount = computed(() => FIELDS.filter(isFieldDirty).length);
const isDirty = computed(() => changedCount.value > 0);
const roleChanged = computed(() => isFieldDirty('role'));
const statusChanged = computed(() => isFieldDirty('status'));
// Suspensão é elevação de risco mesmo sem mudança de papel.
const statusElevatedRisk = computed(() => statusChanged.value && f.values.status === 'suspended');

// --- Carregamento ---
async function load() {
  loading.value = true;
  loadError.value = null;
  notFound.value = false;
  // Defensivo: rota mal configurada (sem :id) -> não bate em /v1/professionals/null;
  // mostra o estado "não encontrado" em vez de quebrar com 404 ruidoso.
  if (!props.id) {
    notFound.value = true;
    loading.value = false;
    return;
  }
  try {
    const rec = await professionals.get(props.id);
    if (!rec || (typeof rec === 'object' && Object.keys(rec).length === 0)) {
      notFound.value = true;
      return;
    }
    for (const k of FIELDS) {
      const val = norm(rec[k]);
      original[k] = val;
      f.values[k] = val;
    }
  } catch (e) {
    if (e && e.status === 404) {
      notFound.value = true;
    } else {
      loadError.value = (e && e.message) || 'Não foi possível carregar o profissional.';
    }
  } finally {
    loading.value = false;
  }
}

// --- Ações ---
function resetForm() {
  for (const k of FIELDS) f.values[k] = original[k];
  for (const k of Object.keys(f.errors)) delete f.errors[k];
}

async function cancel() {
  if (isDirty.value) {
    const ok = await ask({
      title: 'Descartar alterações?',
      message: 'Há mudanças não salvas neste profissional. Sair agora descarta tudo.',
      confirmLabel: 'Descartar e sair',
      cancelLabel: 'Continuar editando',
      danger: true,
    });
    if (!ok) return;
  }
  router.push(detailRoute.value);
}

function submit() {
  f.handleSubmit(async (vals) => {
    // Mudança de papel: auditada e sensível -> confirmação obrigatória.
    if (roleChanged.value) {
      const ok = await ask({
        title: 'Confirmar mudança de papel',
        message:
          'Alterar o papel de "' + roleLabel(original.role) + '" para "' + roleLabel(vals.role) +
          '" muda as permissões (RBAC) e será registrado em auditoria. Confirmar?',
        confirmLabel: 'Confirmar mudança',
        cancelLabel: 'Cancelar',
        danger: true,
      });
      if (!ok) return;
    } else if (statusElevatedRisk.value) {
      // Suspensão sem mudança de papel também confirma.
      const ok = await ask({
        title: 'Suspender profissional?',
        message: 'O profissional perderá o acesso ao sistema até ser reativado. Confirmar a suspensão?',
        confirmLabel: 'Suspender',
        cancelLabel: 'Cancelar',
        danger: true,
      });
      if (!ok) return;
    }

    try {
      await professionals.update(props.id, vals);
      for (const k of FIELDS) original[k] = norm(vals[k]);
      toast.success('Profissional atualizado');
      router.push(detailRoute.value);
    } catch (e) {
      toast.error((e && e.message) || 'Falha ao salvar as alterações.');
    }
  });
}

onMounted(load);
</script>

<style scoped>
/* Resumo do registro */
.prof-summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ui-space-4);
  flex-wrap: wrap;
}
.prof-summary-id {
  display: flex;
  align-items: center;
  gap: var(--ui-space-3);
  min-width: 0;
}
.prof-avatar {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 46px;
  height: 46px;
  flex: none;
  border-radius: var(--ui-radius-pill);
  background: rgb(var(--ui-accent) / 0.16);
  color: rgb(var(--ui-accent-strong));
  font-weight: 700;
  font-size: var(--ui-text-md);
  letter-spacing: 0.02em;
}
.prof-summary-meta { min-width: 0; }
.prof-summary-name {
  margin: 0;
  font-weight: 700;
  font-size: var(--ui-text-md);
  color: rgb(var(--ui-fg));
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.prof-summary-mail {
  margin: 2px 0 0;
  font-size: var(--ui-text-sm);
  color: rgb(var(--ui-muted));
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.prof-summary-badges {
  display: flex;
  gap: var(--ui-space-2);
  flex-wrap: wrap;
}

/* Banner de alerta (papel/status) */
.prof-alert {
  border-left: 3px solid rgb(var(--ui-warn));
}
.prof-alert[data-tone="role"] {
  border-left-color: rgb(var(--ui-accent));
}
.prof-alert-body {
  display: flex;
  align-items: flex-start;
  gap: var(--ui-space-3);
}
.prof-alert-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: none;
  width: 24px;
  height: 24px;
  border-radius: var(--ui-radius-pill);
  background: rgb(var(--ui-warn) / 0.18);
  color: rgb(var(--ui-warn));
  font-weight: 800;
  font-size: var(--ui-text-sm);
}
.prof-alert[data-tone="role"] .prof-alert-icon {
  background: rgb(var(--ui-accent) / 0.16);
  color: rgb(var(--ui-accent-strong));
}
.prof-alert-title {
  margin: 0;
  font-weight: 700;
  font-size: var(--ui-text-sm);
  color: rgb(var(--ui-fg));
}
.prof-alert-text {
  margin: 4px 0 0;
  font-size: var(--ui-text-sm);
  color: rgb(var(--ui-muted));
  line-height: 1.5;
}
.prof-alert-text strong { color: rgb(var(--ui-fg)); }
.prof-alert-text em { font-style: normal; font-weight: 600; color: rgb(var(--ui-fg)); }

/* Selects nativos estilizados (UiFormField :deep cuida da base) */
.prof-select {
  appearance: none;
  cursor: pointer;
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

/* Ações do formulário */
.prof-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ui-space-3);
  margin-top: var(--ui-space-4);
  padding-top: var(--ui-space-4);
  border-top: 1px solid rgb(var(--ui-border));
  flex-wrap: wrap;
}
.prof-actions-state { font-size: var(--ui-text-sm); }
.prof-state-clean { color: rgb(var(--ui-muted)); }
.prof-state-dirty { color: rgb(var(--ui-accent-strong)); font-weight: 600; }
.prof-actions-buttons {
  display: flex;
  gap: var(--ui-space-2);
  flex-wrap: wrap;
}

@media (max-width: 860px) {
  .prof-summary { align-items: flex-start; }
  .prof-actions { align-items: stretch; }
  .prof-actions-buttons { width: 100%; }
}
</style>
