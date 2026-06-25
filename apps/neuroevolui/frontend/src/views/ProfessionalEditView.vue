<template>
  <UiPageLayout
    eyebrow="Profissionais"
    :title="pageTitle"
    :subtitle="pageSubtitle"
    width="wide"
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

    <!-- BANNER: estado de suspensão -->
    <template v-if="!loading && !loadError && !notFound && original.status === 'suspended'" #banner>
      <div class="pe-banner pe-banner-warn" role="status">
        <span class="pe-banner-dot" aria-hidden="true" />
        <span>Este profissional está <strong>suspenso</strong> — a edição persiste, mas o acesso ao sistema permanece bloqueado até a reativação.</span>
      </div>
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

    <!-- ESTADO NORMAL: formulário de edição + painel lateral -->
    <div v-else class="pe-layout">
      <!-- COLUNA PRINCIPAL: formulário -->
      <div class="pe-main">
        <!-- Cartão de identidade do profissional -->
        <UiCard>
          <div class="pe-identity">
            <div class="pe-identity-left">
              <span class="pe-avatar" aria-hidden="true">{{ initials }}</span>
              <div class="pe-identity-meta">
                <p class="pe-identity-name">{{ currentName || 'Profissional' }}</p>
                <p class="pe-identity-email">{{ original.email || '—' }}</p>
                <p class="pe-identity-id">ID {{ props.id }}</p>
              </div>
            </div>
            <div class="pe-identity-badges">
              <UiStatusBadge :status="original.role" :label="roleLabel(original.role)" tone="neutral" />
              <UiStatusBadge :status="original.status" :label="statusLabelText(original.status)" />
            </div>
          </div>
        </UiCard>

        <!-- Aviso dinâmico: mudança de papel (RBAC auditado) ou suspensão -->
        <UiCard
          v-if="roleChanged || statusElevatedRisk"
          class="pe-alert"
          :data-tone="roleChanged ? 'role' : 'status'"
        >
          <div class="pe-alert-body">
            <span class="pe-alert-icon" aria-hidden="true">!</span>
            <div>
              <p class="pe-alert-title">
                {{ roleChanged
                  ? 'Mudança de papel será registrada em auditoria'
                  : 'Suspensão revoga o acesso do profissional' }}
              </p>
              <p class="pe-alert-text">
                <template v-if="roleChanged">
                  Papel de <strong>{{ roleLabel(original.role) }}</strong> para
                  <strong>{{ roleLabel(f.values.role) }}</strong>. Apenas <em>owner</em> e
                  <em>clinic_manager</em> podem promover ou rebaixar papéis; a alteração exige
                  confirmação explícita e é registrada no log de auditoria.
                </template>
                <template v-else>
                  Ao suspender, <strong>{{ currentName || 'este profissional' }}</strong> perde o acesso
                  ao sistema imediatamente até ser reativado. A ação exige confirmação.
                </template>
              </p>
            </div>
          </div>
        </UiCard>

        <!-- FORMULÁRIO -->
        <form novalidate @submit.prevent="submit">
          <UiCard title="Dados do profissional" subtitle="Identificação, contato e atuação clínica.">
            <!-- Identificação -->
            <UiFormSection
              title="Identificação"
              description="Nome e contato visíveis para toda a equipe da clínica."
              :columns="2"
            >
              <UiFormField
                label="Nome completo"
                :required="true"
                :error="f.errors.full_name"
                :full-width="true"
              >
                <template #default="{ id, describedBy }">
                  <UiInput
                    :id="id"
                    :described-by="describedBy"
                    :model-value="f.values.full_name"
                    :error="!!f.errors.full_name"
                    :required="true"
                    autocomplete="name"
                    placeholder="Ex.: Dra. Maria Helena Souza"
                    @update:model-value="f.setField('full_name', $event)"
                  />
                </template>
              </UiFormField>

              <UiFormField
                label="E-mail"
                :required="true"
                :error="f.errors.email"
                hint="Usado para login e notificações do sistema."
              >
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

              <UiFormField
                label="Telefone"
                :error="f.errors.phone"
                hint="Opcional. Inclua DDD — ex.: (11) 90000-0000."
              >
                <template #default="{ id, describedBy }">
                  <UiInput
                    :id="id"
                    type="tel"
                    :described-by="describedBy"
                    :model-value="f.values.phone"
                    :error="!!f.errors.phone"
                    autocomplete="tel"
                    placeholder="(11) 90000-0000"
                    @update:model-value="f.setField('phone', $event)"
                  />
                </template>
              </UiFormField>
            </UiFormSection>

            <!-- Atuação profissional -->
            <UiFormSection
              title="Atuação profissional"
              description="Especialidade e registro de conselho. Dados exibidos no prontuário."
              :columns="2"
            >
              <UiFormField
                label="Especialidade"
                :error="f.errors.specialty"
                hint="Ex.: Neuropediatria, Psicologia Clínica, Fonoaudiologia."
              >
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

              <UiFormField
                label="CRP / CRM"
                :error="f.errors.crp_crm"
                hint="Registro no conselho de classe — CRM, CRP, CREFITO, CRFa etc."
              >
                <template #default="{ id, describedBy }">
                  <UiInput
                    :id="id"
                    :described-by="describedBy"
                    :model-value="f.values.crp_crm"
                    placeholder="Ex.: CRP 06/123456"
                    @update:model-value="f.setField('crp_crm', $event)"
                  />
                </template>
              </UiFormField>
            </UiFormSection>

            <!-- Acesso e situação (RBAC — campos sensíveis) -->
            <UiFormSection
              title="Acesso e situação"
              description="Papel define as permissões (RBAC). Situação controla o acesso ao sistema."
              :columns="2"
            >
              <UiFormField
                label="Papel"
                :required="true"
                :error="f.errors.role"
                hint="Promover/rebaixar é auditado e restrito a owner e clinic_manager."
              >
                <template #default="{ id, describedBy }">
                  <select
                    :id="id"
                    class="pe-select"
                    :class="{ 'is-changed': roleChanged, 'is-error': !!f.errors.role }"
                    :aria-describedby="describedBy"
                    :aria-invalid="f.errors.role ? 'true' : undefined"
                    aria-required="true"
                    :value="f.values.role"
                    @change="f.setField('role', $event.target.value)"
                  >
                    <option value="" disabled>Selecione um papel…</option>
                    <option v-for="r in roleOptions" :key="r.value" :value="r.value">
                      {{ r.label }}
                    </option>
                  </select>
                </template>
              </UiFormField>

              <UiFormField
                label="Situação"
                :required="true"
                :error="f.errors.status"
                hint="Suspender revoga o acesso até a reativação."
              >
                <template #default="{ id, describedBy }">
                  <select
                    :id="id"
                    class="pe-select"
                    :class="{ 'is-changed': statusChanged, 'is-error': !!f.errors.status }"
                    :aria-describedby="describedBy"
                    :aria-invalid="f.errors.status ? 'true' : undefined"
                    aria-required="true"
                    :value="f.values.status"
                    @change="f.setField('status', $event.target.value)"
                  >
                    <option value="" disabled>Selecione a situação…</option>
                    <option v-for="s in statusOptions" :key="s.value" :value="s.value">
                      {{ s.label }}
                    </option>
                  </select>
                </template>
              </UiFormField>
            </UiFormSection>

            <!-- Rodapé do cartão: indicador de alterações + botões -->
            <template #footer>
              <div class="pe-form-footer">
                <div class="pe-dirty-state" role="status" aria-live="polite">
                  <template v-if="!isDirty">
                    <span class="pe-dirty-dot pe-dirty-dot-clean" aria-hidden="true" />
                    <span class="pe-dirty-label-clean">Sem alterações pendentes</span>
                  </template>
                  <template v-else>
                    <span class="pe-dirty-dot pe-dirty-dot-changed" aria-hidden="true" />
                    <span class="pe-dirty-label-changed">
                      {{ changedCount }} campo{{ changedCount !== 1 ? 's' : '' }} alterado{{ changedCount !== 1 ? 's' : '' }}
                    </span>
                  </template>
                </div>
                <div class="pe-form-actions">
                  <UiButton
                    variant="ghost"
                    type="button"
                    :disabled="f.submitting.value"
                    @click="cancel"
                  >Cancelar</UiButton>
                  <UiButton
                    variant="subtle"
                    type="button"
                    :disabled="!isDirty || f.submitting.value"
                    @click="resetForm"
                  >Descartar</UiButton>
                  <UiButton
                    type="submit"
                    :loading="f.submitting.value"
                    :disabled="!isDirty"
                  >Salvar alterações</UiButton>
                </div>
              </div>
            </template>
          </UiCard>
        </form>
      </div>

      <!-- COLUNA LATERAL: painel de revisão + permissões -->
      <aside class="pe-side">
        <!-- Resumo das alterações -->
        <UiCard title="Resumo das alterações" subtitle="Confira antes de salvar.">
          <dl class="pe-summary">
            <div class="pe-summary-row">
              <dt>Nome</dt>
              <dd :data-changed="isFieldDirty('full_name') || null">
                {{ f.values.full_name || '—' }}
                <span v-if="isFieldDirty('full_name')" class="pe-changed-badge" aria-label="Alterado">●</span>
              </dd>
            </div>
            <div class="pe-summary-row">
              <dt>E-mail</dt>
              <dd class="pe-mono" :data-changed="isFieldDirty('email') || null">
                {{ f.values.email || '—' }}
                <span v-if="isFieldDirty('email')" class="pe-changed-badge" aria-label="Alterado">●</span>
              </dd>
            </div>
            <div class="pe-summary-row">
              <dt>Telefone</dt>
              <dd :data-changed="isFieldDirty('phone') || null">
                {{ f.values.phone || '—' }}
                <span v-if="isFieldDirty('phone')" class="pe-changed-badge" aria-label="Alterado">●</span>
              </dd>
            </div>
            <div class="pe-summary-row">
              <dt>Especialidade</dt>
              <dd :data-changed="isFieldDirty('specialty') || null">
                {{ f.values.specialty || '—' }}
                <span v-if="isFieldDirty('specialty')" class="pe-changed-badge" aria-label="Alterado">●</span>
              </dd>
            </div>
            <div class="pe-summary-row">
              <dt>Papel</dt>
              <dd :data-changed="roleChanged || null">
                <UiStatusBadge
                  v-if="f.values.role"
                  :status="f.values.role"
                  :label="roleLabel(f.values.role)"
                  tone="neutral"
                />
                <span v-else class="pe-faint">A definir</span>
                <span v-if="roleChanged" class="pe-changed-badge" aria-label="Alterado">●</span>
              </dd>
            </div>
            <div class="pe-summary-row">
              <dt>Situação</dt>
              <dd :data-changed="statusChanged || null">
                <UiStatusBadge
                  v-if="f.values.status"
                  :status="f.values.status"
                  :label="statusLabelText(f.values.status)"
                />
                <span v-else class="pe-faint">A definir</span>
                <span v-if="statusChanged" class="pe-changed-badge" aria-label="Alterado">●</span>
              </dd>
            </div>
          </dl>
        </UiCard>

        <!-- Permissões do papel selecionado -->
        <UiCard
          title="Permissões do papel"
          :subtitle="selectedRoleMeta ? selectedRoleMeta.summary : 'Selecione um papel para ver as permissões.'"
        >
          <div v-if="selectedRoleMeta" class="pe-perms">
            <p class="pe-perms-intro">Este papel concede, em cascata:</p>
            <ul class="pe-perms-list">
              <li v-for="(perm, i) in selectedRoleMeta.permissions" :key="i" class="pe-perm-item">
                <span class="pe-perm-mark" aria-hidden="true">✓</span>
                <span>{{ perm }}</span>
              </li>
            </ul>
            <p v-if="selectedRoleMeta.sensitive" class="pe-perms-warn" role="note">
              Atenção: papel com permissões amplas. Conceda apenas a pessoas de total confiança.
            </p>
          </div>
          <UiEmptyState
            v-else
            title="Nenhum papel selecionado"
            description="As permissões aparecem aqui conforme o papel escolhido no formulário."
          />
        </UiCard>

        <!-- Histórico de acesso (campos somente-leitura) -->
        <UiCard title="Registro do profissional">
          <dl class="pe-meta">
            <div class="pe-meta-row">
              <dt>Cadastrado em</dt>
              <dd>{{ original.created_at ? formatDateTime(original.created_at) : '—' }}</dd>
            </div>
            <div class="pe-meta-row">
              <dt>ID interno</dt>
              <dd class="pe-mono">{{ props.id || '—' }}</dd>
            </div>
          </dl>
          <div class="pe-meta-links">
            <UiButton variant="ghost" size="sm" :to="detailRoute">Ver perfil completo</UiButton>
          </div>
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
  useForm,
  useToast,
  useConfirm,
  validators,
  format,
} from '../ui/index.js';
import { professionals } from '../api.js';

const { formatDateTime } = format;

const props = defineProps({ id: { type: String, default: null } });
const router = useRouter();
const toast = useToast();
const ask = useConfirm();

// --- Rotas de DOMÍNIO ---
const listRoute = '/professionals';
const detailRoute = computed(() => '/professionals/' + (props.id || ''));

// --- Estado de carregamento ---
const loading = ref(true);
const loadError = ref(null);
const notFound = ref(false);
const original = reactive({
  full_name: '',
  email: '',
  specialty: '',
  crp_crm: '',
  phone: '',
  role: '',
  status: '',
  created_at: '',
});

// --- Catálogo de papéis (com permissões em cascata para o painel lateral) ---
const ALL_ROLES = [
  {
    value: 'patient',
    label: 'Paciente',
    tone: 'neutral',
    summary: 'Acesso restrito à própria conta.',
    sensitive: false,
    permissions: [
      'Visualizar o próprio prontuário',
      'Consultar histórico de atendimentos',
    ],
  },
  {
    value: 'professional',
    label: 'Profissional',
    tone: 'neutral',
    summary: 'Atendimento clínico do dia a dia.',
    sensitive: false,
    permissions: [
      'Acessar a própria agenda de atendimentos',
      'Registrar evoluções e sessões dos seus pacientes',
      'Consultar prontuários atribuídos a ele',
    ],
  },
  {
    value: 'clinic_manager',
    label: 'Gestor da clínica',
    tone: 'running',
    summary: 'Gestão da unidade + tudo do Profissional.',
    sensitive: false,
    permissions: [
      'Tudo que o Profissional pode fazer',
      'Convidar e gerenciar profissionais da unidade',
      'Visualizar agendas e indicadores de toda a clínica',
      'Configurar serviços, salas e horários',
    ],
  },
  {
    value: 'owner',
    label: 'Proprietário',
    tone: 'warning',
    summary: 'Controle total da conta + tudo do Gestor.',
    sensitive: true,
    permissions: [
      'Tudo que o Gestor de clínica pode fazer',
      'Gerenciar todas as unidades da conta',
      'Administrar faturamento e plano de assinatura',
      'Conceder ou revogar o papel de Proprietário',
    ],
  },
];

const roleOptions = ALL_ROLES.map((r) => ({ value: r.value, label: r.label }));
const statusOptions = [
  { value: 'active', label: 'Ativo' },
  { value: 'invited', label: 'Convidado' },
  { value: 'suspended', label: 'Suspenso' },
];

const ROLE_VALUES = roleOptions.map((o) => o.value);
const STATUS_VALUES = statusOptions.map((o) => o.value);
const roleLabel = (v) => (roleOptions.find((o) => o.value === v) || {}).label || (v || '—');
const statusLabelText = (v) => (statusOptions.find((o) => o.value === v) || {}).label || (v || '—');
const selectedRoleMeta = computed(() => ALL_ROLES.find((r) => r.value === f.values.role) || null);

// --- Formulário ---
const FIELDS = ['full_name', 'email', 'specialty', 'crp_crm', 'phone', 'role', 'status'];

const f = useForm({
  initial: { full_name: '', email: '', specialty: '', crp_crm: '', phone: '', role: '', status: '' },
  rules: {
    full_name: [validators.required('Informe o nome completo'), validators.minLen(2)],
    email: [validators.required('Informe o e-mail'), validators.email()],
    specialty: [validators.maxLen(80)],
    crp_crm: [validators.maxLen(40)],
    phone: [validators.maxLen(20)],
    role: [
      validators.required('Selecione um papel'),
      validators.pattern(new RegExp('^(' + ROLE_VALUES.join('|') + ')$'), 'Papel inválido'),
    ],
    status: [
      validators.required('Selecione a situação'),
      validators.pattern(new RegExp('^(' + STATUS_VALUES.join('|') + ')$'), 'Situação inválida'),
    ],
  },
});

// --- Derivados de UI ---
const norm = (v) => (v === null || v === undefined ? '' : String(v));
const isFieldDirty = (k) => norm(f.values[k]) !== norm(original[k]);
const changedCount = computed(() => FIELDS.filter(isFieldDirty).length);
const isDirty = computed(() => changedCount.value > 0);
const roleChanged = computed(() => isFieldDirty('role'));
const statusChanged = computed(() => isFieldDirty('status'));
const statusElevatedRisk = computed(() => statusChanged.value && f.values.status === 'suspended');

const currentName = computed(() => f.values.full_name || original.full_name);
const initials = computed(() => {
  const src = (currentName.value || '').trim();
  if (!src) return '··';
  const parts = src.split(/\s+/).filter(Boolean);
  const a = parts[0] ? parts[0][0] : '';
  const b = parts.length > 1 ? parts[parts.length - 1][0] : '';
  return (a + b).toUpperCase() || '··';
});

const pageTitle = computed(() => loading.value ? 'Editar profissional' : (currentName.value || ('Profissional #' + props.id)));
const pageSubtitle = computed(() => {
  if (loading.value || notFound.value) return '';
  const parts = [];
  if (original.specialty) parts.push(original.specialty);
  if (original.role) parts.push(roleLabel(original.role));
  return parts.length ? 'Editando: ' + parts.join(' · ') : 'Edição de dados e controle de acesso.';
});

// --- Carregamento ---
async function load() {
  loading.value = true;
  loadError.value = null;
  notFound.value = false;
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
    // Popula original e form; usa council_number como fallback para crp_crm (compatibilidade)
    const merged = { ...rec, crp_crm: rec.crp_crm ?? rec.council_number ?? '' };
    for (const k of FIELDS) {
      const val = norm(merged[k]);
      original[k] = val;
      f.values[k] = val;
    }
    original.created_at = rec.created_at || '';
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
    // Mudança de papel: auditada e sensível — confirmação obrigatória.
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
      const ok = await ask({
        title: 'Suspender profissional?',
        message:
          (currentName.value || 'Este profissional') +
          ' perderá o acesso ao sistema imediatamente até ser reativado. Confirmar?',
        confirmLabel: 'Suspender',
        cancelLabel: 'Cancelar',
        danger: true,
      });
      if (!ok) return;
    }

    try {
      // Envia crp_crm no payload; mantém council_number para compatibilidade com backends
      // que usam o nome antigo (alguns endpoints aceitam ambos).
      await professionals.update(props.id, { ...vals, council_number: vals.crp_crm });
      for (const k of FIELDS) original[k] = norm(vals[k]);
      toast.success('Profissional ' + (vals.full_name || 'atualizado') + ' salvo com sucesso.');
      router.push(detailRoute.value);
    } catch (e) {
      toast.error((e && e.message) || 'Falha ao salvar as alterações.');
    }
  });
}

onMounted(load);
</script>

<style scoped>
/* Layout de duas colunas: principal + painel lateral */
.pe-layout {
  display: grid;
  grid-template-columns: minmax(0, 1.7fr) minmax(0, 1fr);
  gap: var(--ui-space-5);
  align-items: start;
}
.pe-main {
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-4);
  min-width: 0;
}
.pe-side {
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-4);
  position: sticky;
  top: var(--ui-space-4);
}

/* Banner de estado suspenso */
.pe-banner {
  display: flex;
  align-items: center;
  gap: var(--ui-space-3);
  padding: var(--ui-space-3) var(--ui-space-4);
  border: 1px solid rgb(var(--ui-border));
  background: rgb(var(--ui-surface));
  color: rgb(var(--ui-fg));
  border-radius: var(--ui-radius-md);
  font-size: var(--ui-text-sm);
}
.pe-banner-warn {
  border-color: rgb(var(--ui-warn) / 0.45);
  background: rgb(var(--ui-warn) / 0.10);
}
.pe-banner-dot {
  width: 8px;
  height: 8px;
  flex-shrink: 0;
  border-radius: 50%;
  background: rgb(var(--ui-warn));
}

/* Cartão de identidade do profissional */
.pe-identity {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ui-space-4);
  flex-wrap: wrap;
}
.pe-identity-left {
  display: flex;
  align-items: center;
  gap: var(--ui-space-3);
  min-width: 0;
}
.pe-avatar {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 50px;
  height: 50px;
  flex-shrink: 0;
  border-radius: var(--ui-radius-pill);
  background: rgb(var(--ui-accent) / 0.16);
  color: rgb(var(--ui-accent-strong));
  font-weight: 700;
  font-size: var(--ui-text-md);
  letter-spacing: 0.02em;
}
.pe-identity-meta { min-width: 0; }
.pe-identity-name {
  margin: 0;
  font-weight: 700;
  font-size: var(--ui-text-md);
  color: rgb(var(--ui-fg));
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.pe-identity-email {
  margin: 2px 0 0;
  font-size: var(--ui-text-sm);
  color: rgb(var(--ui-muted));
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.pe-identity-id {
  margin: 2px 0 0;
  font-size: var(--ui-text-xs);
  color: rgb(var(--ui-faint));
  font-family: var(--ui-font-mono);
}
.pe-identity-badges {
  display: flex;
  gap: var(--ui-space-2);
  flex-wrap: wrap;
  flex-shrink: 0;
}

/* Banner de alerta (mudança de papel / suspensão) */
.pe-alert {
  border-left: 3px solid rgb(var(--ui-warn));
}
.pe-alert[data-tone="role"] {
  border-left-color: rgb(var(--ui-accent));
}
.pe-alert-body {
  display: flex;
  align-items: flex-start;
  gap: var(--ui-space-3);
}
.pe-alert-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 24px;
  height: 24px;
  border-radius: var(--ui-radius-pill);
  background: rgb(var(--ui-warn) / 0.18);
  color: rgb(var(--ui-warn));
  font-weight: 800;
  font-size: var(--ui-text-sm);
}
.pe-alert[data-tone="role"] .pe-alert-icon {
  background: rgb(var(--ui-accent) / 0.16);
  color: rgb(var(--ui-accent-strong));
}
.pe-alert-title {
  margin: 0;
  font-weight: 700;
  font-size: var(--ui-text-sm);
  color: rgb(var(--ui-fg));
}
.pe-alert-text {
  margin: 4px 0 0;
  font-size: var(--ui-text-sm);
  color: rgb(var(--ui-muted));
  line-height: 1.55;
}
.pe-alert-text strong { color: rgb(var(--ui-fg)); }
.pe-alert-text em { font-style: normal; font-weight: 600; color: rgb(var(--ui-fg)); }

/* Select nativo estilizado (kit UiFormField :deep gerencia a base) */
.pe-select {
  width: 100%;
  background: rgb(var(--ui-bg));
  color: rgb(var(--ui-fg));
  border: 1px solid rgb(var(--ui-border-strong));
  border-radius: var(--ui-radius-sm);
  padding: 8px 11px;
  font: inherit;
  font-size: var(--ui-text-md);
  cursor: pointer;
  appearance: none;
  transition: border-color .15s ease, box-shadow .15s ease;
}
.pe-select:focus {
  outline: none;
  border-color: rgb(var(--ui-accent));
  box-shadow: 0 0 0 3px rgb(var(--ui-accent) / 0.15);
}
.pe-select.is-changed {
  border-color: rgb(var(--ui-accent));
  box-shadow: 0 0 0 3px rgb(var(--ui-accent) / 0.12);
}
.pe-select.is-error {
  border-color: rgb(var(--ui-danger));
}

/* Rodapé do formulário: indicador de estado + botões */
.pe-form-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ui-space-3);
  flex-wrap: wrap;
}
.pe-dirty-state {
  display: flex;
  align-items: center;
  gap: var(--ui-space-2);
  font-size: var(--ui-text-sm);
}
.pe-dirty-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}
.pe-dirty-dot-clean { background: rgb(var(--ui-faint)); }
.pe-dirty-dot-changed { background: rgb(var(--ui-accent)); }
.pe-dirty-label-clean { color: rgb(var(--ui-muted)); }
.pe-dirty-label-changed { color: rgb(var(--ui-accent-strong)); font-weight: 600; }
.pe-form-actions {
  display: flex;
  gap: var(--ui-space-2);
  flex-wrap: wrap;
}

/* Painel lateral: resumo */
.pe-summary {
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-3);
}
.pe-summary-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ui-space-3);
  border-bottom: 1px solid rgb(var(--ui-border));
  padding-bottom: var(--ui-space-2);
}
.pe-summary-row:last-child {
  border-bottom: none;
  padding-bottom: 0;
}
.pe-summary-row dt {
  color: rgb(var(--ui-muted));
  font-size: var(--ui-text-sm);
  font-weight: 600;
  flex-shrink: 0;
}
.pe-summary-row dd {
  margin: 0;
  color: rgb(var(--ui-fg));
  font-size: var(--ui-text-sm);
  text-align: right;
  min-width: 0;
  word-break: break-word;
  display: flex;
  align-items: center;
  gap: var(--ui-space-1);
  justify-content: flex-end;
}
.pe-summary-row dd[data-changed] {
  color: rgb(var(--ui-accent-strong));
}
.pe-changed-badge {
  font-size: 9px;
  color: rgb(var(--ui-accent));
  flex-shrink: 0;
}
.pe-mono {
  font-family: var(--ui-font-mono);
  font-size: var(--ui-text-xs);
}
.pe-faint {
  color: rgb(var(--ui-faint));
  font-size: var(--ui-text-sm);
}

/* Painel lateral: permissões */
.pe-perms-intro {
  margin: 0 0 var(--ui-space-3);
  color: rgb(var(--ui-muted));
  font-size: var(--ui-text-sm);
}
.pe-perms-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-2);
}
.pe-perm-item {
  display: flex;
  align-items: flex-start;
  gap: var(--ui-space-2);
  font-size: var(--ui-text-sm);
  color: rgb(var(--ui-fg));
  line-height: 1.45;
}
.pe-perm-mark {
  flex-shrink: 0;
  width: 18px;
  height: 18px;
  border-radius: var(--ui-radius-pill);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: var(--ui-text-xs);
  font-weight: 700;
  background: rgb(var(--ui-ok) / 0.16);
  color: rgb(var(--ui-ok));
  margin-top: 1px;
}
.pe-perms-warn {
  margin: var(--ui-space-4) 0 0;
  padding: var(--ui-space-3);
  border-radius: var(--ui-radius-md);
  background: rgb(var(--ui-warn) / 0.12);
  color: rgb(var(--ui-warn));
  font-size: var(--ui-text-xs);
  line-height: 1.5;
}

/* Painel lateral: metadados do registro */
.pe-meta {
  margin: 0 0 var(--ui-space-3);
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-3);
}
.pe-meta-row {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.pe-meta-row dt {
  color: rgb(var(--ui-muted));
  font-size: var(--ui-text-xs);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  font-weight: 600;
}
.pe-meta-row dd {
  margin: 0;
  font-size: var(--ui-text-sm);
  color: rgb(var(--ui-fg));
}
.pe-meta-links {
  display: flex;
  gap: var(--ui-space-2);
  flex-wrap: wrap;
}

/* Responsivo */
@media (max-width: 960px) {
  .pe-layout {
    grid-template-columns: 1fr;
  }
  .pe-side {
    position: static;
  }
}
@media (max-width: 640px) {
  .pe-form-footer {
    flex-direction: column;
    align-items: stretch;
  }
  .pe-form-actions {
    flex-direction: column-reverse;
  }
  .pe-identity {
    align-items: flex-start;
  }
}
</style>
