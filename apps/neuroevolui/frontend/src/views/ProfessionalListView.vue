<template>
  <UiPageLayout
    eyebrow="Equipe clínica"
    title="Profissionais"
    subtitle="Profissionais e gestores da clínica — gerencie papéis e situações."
    width="wide"
    :error="errorMessage"
    @retry="reload"
  >
    <!-- Ações do cabeçalho -->
    <template #actions>
      <UiButton variant="ghost" :loading="r.loading.value" @click="reload">Atualizar</UiButton>
      <UiButton v-if="canManage" to="/professionals/new" variant="primary">
        Convidar profissional
      </UiButton>
    </template>

    <!-- Banner de modo visualização -->
    <template #banner>
      <div v-if="!canManage && !meLoading" class="pv-banner" role="note" aria-live="polite">
        <span class="pv-banner-icon" aria-hidden="true">ℹ</span>
        <span>
          Você está em modo de visualização. Apenas gestor ou proprietário pode gerenciar a equipe.
        </span>
      </div>
    </template>

    <!-- Métricas rápidas (total servidor; situacionais da página) -->
    <section class="pv-metrics" aria-label="Resumo da equipe">
      <UiMetricCard
        label="Total na equipe"
        :value="r.loading.value ? null : String(r.total.value || r.items.value.length)"
        :loading="r.loading.value"
        tone="primary"
        hint="No tenant atual"
        :clickable="true"
        @click="clearAllFilters"
      />
      <UiMetricCard
        label="Ativos"
        :value="r.loading.value ? null : String(pageMetrics.ativo)"
        :loading="r.loading.value"
        tone="success"
        hint="Nesta página"
        :clickable="true"
        @click="quickFilterStatus('ativo')"
      />
      <UiMetricCard
        label="Inativos"
        :value="r.loading.value ? null : String(pageMetrics.inativo)"
        :loading="r.loading.value"
        tone="error"
        hint="Nesta página"
        :clickable="true"
        @click="quickFilterStatus('inativo')"
      />
      <UiMetricCard
        label="Gestores / Proprietários"
        :value="r.loading.value ? null : String(pageMetrics.managers)"
        :loading="r.loading.value"
        tone="running"
        hint="Nesta página"
        :clickable="true"
        @click="quickFilterRole('clinic_manager')"
      />
    </section>

    <!-- Painel de filtros -->
    <template #filters>
      <UiFiltersPanel
        v-model="filterModel"
        :fields="filterFields"
        @apply="applyFilters"
        @clear="clearFilters"
      />
    </template>

    <!-- Tabela principal: cobre loading (skeleton), error, empty e normal -->
    <UiDataTable
      :columns="columns"
      :rows="r.items.value"
      :loading="r.loading.value"
      :error="errorMessage"
      row-key="id"
      density="comfortable"
      clickable-rows
      server-mode
      :sort="r.sort.value"
      :page="r.page.value"
      :page-size="r.pageSize.value"
      :total="r.total.value"
      paginated
      :empty="emptyState"
      @update:sort="r.setSort"
      @update:page="r.setPage"
      @row-click="openDetail"
      @retry="reload"
    >
      <!-- Célula: profissional (avatar + nome + e-mail) -->
      <template #cell-full_name="{ row }">
        <div class="pv-person">
          <span class="pv-avatar" aria-hidden="true" :data-role="row.role">
            {{ initials(row.full_name) }}
          </span>
          <span class="pv-person-text">
            <span class="pv-person-name">{{ row.full_name || '—' }}</span>
            <span class="pv-person-email">{{ row.email || '—' }}</span>
          </span>
        </div>
      </template>

      <!-- Célula: papel com badge colorido -->
      <template #cell-role="{ value }">
        <UiStatusBadge
          :status="value"
          :tone="roleTone(value)"
          :label="roleLabel(value)"
          :with-dot="false"
        />
      </template>

      <!-- Célula: especialidade + CRP/CRM -->
      <template #cell-specialty="{ row }">
        <div class="pv-specialty">
          <span class="pv-specialty-name">{{ row.specialty || '—' }}</span>
          <span v-if="row.crp_crm" class="pv-sub">{{ row.crp_crm }}</span>
        </div>
      </template>

      <!-- Célula: telefone -->
      <template #cell-phone="{ value }">
        <span class="pv-phone">{{ value || '—' }}</span>
      </template>

      <!-- Célula: situação ativo/inativo -->
      <template #cell-status="{ value }">
        <UiStatusBadge :status="value" :label="statusLabel(value)" />
      </template>

      <!-- Célula: data de cadastro -->
      <template #cell-created_at="{ value }">
        <span class="pv-sub">{{ formatDate(value) }}</span>
      </template>

      <!-- Célula: ações por linha (apenas gestores) -->
      <template #cell-_actions="{ row }">
        <div class="pv-row-actions" @click.stop>
          <template v-if="canManage">
            <UiButton
              variant="ghost"
              size="sm"
              @click="openEditRole(row)"
            >
              Editar papel
            </UiButton>
            <UiButton
              v-if="row.status !== 'ativo'"
              variant="subtle"
              size="sm"
              :loading="busyId === row.id"
              @click="toggleStatus(row, 'ativo')"
            >
              Ativar
            </UiButton>
            <UiButton
              v-else
              variant="danger"
              size="sm"
              :loading="busyId === row.id"
              @click="toggleStatus(row, 'inativo')"
            >
              Desativar
            </UiButton>
          </template>
          <span v-else class="pv-readonly">—</span>
        </div>
      </template>

      <template #empty-action>
        <UiButton v-if="canManage" to="/professionals/new" variant="primary">
          Convidar primeiro profissional
        </UiButton>
      </template>
    </UiDataTable>
  </UiPageLayout>

  <!-- Modal: editar papel do profissional -->
  <UiModal
    :open="editRoleOpen"
    title="Editar papel"
    width="sm"
    @update:open="closeEditRole"
  >
    <div class="pv-edit-role-body">
      <p class="pv-edit-role-desc">
        Altere o papel de
        <strong>{{ editRoleTarget ? (editRoleTarget.full_name || editRoleTarget.email) : '' }}</strong>
        na clínica.
      </p>
      <UiFormField label="Papel" required :error="editRoleForm.errors.role">
        <template #default="{ id, describedBy }">
          <select
            :id="id"
            class="pv-select"
            :aria-describedby="describedBy || undefined"
            :aria-invalid="editRoleForm.errors.role ? 'true' : undefined"
            :value="editRoleForm.values.role"
            @change="editRoleForm.setField('role', $event.target.value)"
          >
            <option value="owner">{{ ROLE_LABELS.owner }}</option>
            <option value="clinic_manager">{{ ROLE_LABELS.clinic_manager }}</option>
            <option value="professional">{{ ROLE_LABELS.professional }}</option>
            <option value="patient">{{ ROLE_LABELS.patient }}</option>
          </select>
        </template>
      </UiFormField>
    </div>
    <template #footer>
      <UiButton variant="ghost" @click="closeEditRole">Cancelar</UiButton>
      <UiButton
        variant="primary"
        :loading="editRoleForm.submitting.value"
        @click="saveRole"
      >
        Salvar papel
      </UiButton>
    </template>
  </UiModal>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import {
  UiPageLayout,
  UiDataTable,
  UiFiltersPanel,
  UiMetricCard,
  UiStatusBadge,
  UiModal,
  UiFormField,
  UiButton,
  useResource,
  useToast,
  useConfirm,
  useForm,
  format,
  validators,
  resolveGlyph,
} from '../ui/index.js';
import { professionals as professionalsApi, me } from '../api.js';

const { required } = validators;

const router = useRouter();
const toast = useToast();
const askConfirm = useConfirm();
const { formatDate } = format;

// ---- Vocabulário do domínio ----

const ROLE_LABELS = {
  owner: 'Proprietário',
  clinic_manager: 'Gestor da clínica',
  professional: 'Profissional',
  patient: 'Paciente',
};

const STATUS_LABELS = {
  ativo: 'Ativo',
  inativo: 'Inativo',
};

const roleLabel = (v) => ROLE_LABELS[v] || (v || '—');
const statusLabel = (v) => STATUS_LABELS[String(v || '').toLowerCase()] || (v || '—');

// Proprietário → ton accent (running); gestores/profissionais → neutral
const roleTone = (v) => {
  if (v === 'owner') return 'running';
  if (v === 'clinic_manager') return 'warning';
  return 'neutral';
};

// ---- Colunas ----

const columns = [
  { key: 'full_name', label: 'Profissional', sortable: true },
  { key: 'role', label: 'Papel', sortable: true },
  { key: 'specialty', label: 'Especialidade / Reg.' },
  { key: 'phone', label: 'Telefone' },
  { key: 'status', label: 'Situação', sortable: true },
  { key: 'created_at', label: 'Cadastrado em', sortable: true, align: 'right' },
  { key: '_actions', label: '', align: 'right' },
];

// ---- Filtros ----

const filterFields = [
  {
    key: 'q',
    label: 'Buscar',
    type: 'text',
    placeholder: 'Nome ou e-mail',
  },
  {
    key: 'role',
    label: 'Papel',
    type: 'select',
    options: [
      { value: 'owner', label: ROLE_LABELS.owner },
      { value: 'clinic_manager', label: ROLE_LABELS.clinic_manager },
      { value: 'professional', label: ROLE_LABELS.professional },
      { value: 'patient', label: ROLE_LABELS.patient },
    ],
  },
  {
    key: 'status',
    label: 'Situação',
    type: 'select',
    options: [
      { value: 'ativo', label: STATUS_LABELS.ativo },
      { value: 'inativo', label: STATUS_LABELS.inativo },
    ],
  },
];

const filterModel = reactive({ q: '', role: '', status: '' });

// ---- Recurso (server-mode) ----

const r = useResource(professionalsApi, {
  pageSize: 25,
  sort: { key: 'full_name', dir: 'asc' },
});

const errorMessage = computed(() => {
  const e = r.error.value;
  if (!e) return null;
  return (e && e.message) || 'Não foi possível carregar os profissionais.';
});

function applyFilters(values) {
  Object.assign(filterModel, values || {});
  r.setFilters({
    q: filterModel.q || '',
    role: filterModel.role || '',
    status: filterModel.status || '',
  });
}

function clearFilters() {
  filterModel.q = '';
  filterModel.role = '';
  filterModel.status = '';
  r.setFilters({ q: '', role: '', status: '' });
}

function clearAllFilters() {
  clearFilters();
}

function quickFilterStatus(status) {
  filterModel.q = '';
  filterModel.role = '';
  filterModel.status = status;
  r.setFilters({ q: '', role: '', status });
}

function quickFilterRole(role) {
  filterModel.q = '';
  filterModel.role = role;
  filterModel.status = '';
  r.setFilters({ q: '', role, status: '' });
}

// ---- Métricas da página ----

const pageMetrics = computed(() => {
  const rows = r.items.value || [];
  const ativo = rows.filter((p) => String(p.status || '').toLowerCase() === 'ativo').length;
  const inativo = rows.filter((p) => String(p.status || '').toLowerCase() === 'inativo').length;
  const managers = rows.filter(
    (p) => p.role === 'owner' || p.role === 'clinic_manager'
  ).length;
  return { ativo, inativo, managers };
});

// ---- Estado vazio ----

const emptyState = computed(() => {
  const isFiltered = filterModel.q || filterModel.role || filterModel.status;
  if (isFiltered) {
    return {
      title: 'Nenhum profissional encontrado',
      description: 'Nenhum registro corresponde aos filtros aplicados. Ajuste ou limpe os filtros.',
      icon: resolveGlyph('search'),
    };
  }
  return {
    title: 'Equipe ainda vazia',
    description: canManage.value
      ? 'Convide o primeiro profissional para montar a equipe da clínica.'
      : 'Nenhum profissional cadastrado até o momento.',
    icon: resolveGlyph('team'),
  };
});

// ---- Utilitários ----

function initials(name) {
  if (!name) return '?';
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  const first = parts[0][0] || '';
  const last = parts.length > 1 ? parts[parts.length - 1][0] : '';
  return (first + last).toUpperCase();
}

// ---- RBAC ----

const meRole = ref('');
const meLoading = ref(true);
const MANAGER_ROLES = ['owner', 'clinic_manager'];
const canManage = computed(() => MANAGER_ROLES.includes(meRole.value));

async function loadMe() {
  meLoading.value = true;
  try {
    const identity = await me();
    meRole.value = (identity && (identity.role || (identity.user && identity.user.role))) || '';
  } catch {
    meRole.value = '';
  } finally {
    meLoading.value = false;
  }
}

// ---- Navegação ----

function openDetail(row) {
  router.push('/professionals/' + row.id);
}

// ---- Ação: ativar / desativar ----

const busyId = ref(null);

async function toggleStatus(row, targetStatus) {
  const isDeactivating = targetStatus === 'inativo';
  const ok = await askConfirm({
    title: isDeactivating ? 'Desativar profissional' : 'Ativar profissional',
    message: isDeactivating
      ? 'Desativar "' + (row.full_name || 'este profissional') + '"? O acesso à clínica será suspenso até a reativação.'
      : 'Reativar "' + (row.full_name || 'este profissional') + '" e restaurar o acesso à clínica?',
    confirmLabel: isDeactivating ? 'Desativar' : 'Ativar',
    danger: isDeactivating,
  });
  if (!ok) return;
  busyId.value = row.id;
  try {
    await professionalsApi.update(row.id, { status: targetStatus });
    toast.success(
      isDeactivating
        ? 'Profissional desativado.'
        : 'Profissional ativado.'
    );
    await r.load();
  } catch (e) {
    toast.error((e && e.message) || 'Não foi possível alterar a situação do profissional.');
  } finally {
    busyId.value = null;
  }
}

// ---- Ação: editar papel ----

const editRoleOpen = ref(false);
const editRoleTarget = ref(null);

const editRoleForm = useForm({
  initial: { role: '' },
  rules: { role: [required()] },
});

function openEditRole(row) {
  editRoleTarget.value = row;
  editRoleForm.reset();
  editRoleForm.setField('role', row.role || 'professional');
  editRoleOpen.value = true;
}

function closeEditRole() {
  editRoleOpen.value = false;
  editRoleTarget.value = null;
  editRoleForm.reset();
}

async function saveRole() {
  await editRoleForm.handleSubmit(async ({ role }) => {
    const target = editRoleTarget.value;
    if (!target) return;
    if (role === target.role) {
      closeEditRole();
      return;
    }
    try {
      await professionalsApi.update(target.id, { role });
      toast.success(
        'Papel de ' + (target.full_name || target.email || 'profissional') +
        ' atualizado para ' + roleLabel(role) + '.'
      );
      closeEditRole();
      await r.load();
    } catch (e) {
      toast.error((e && e.message) || 'Não foi possível atualizar o papel.');
    }
  });
}

// ---- Reload ----

async function reload() {
  await r.load();
}

onMounted(() => {
  loadMe();
  r.load();
});
</script>

<style scoped>
/* Banner modo visualização */
.pv-banner {
  display: flex;
  align-items: center;
  gap: var(--ui-space-2);
  background: rgb(var(--ui-warn) / 0.1);
  border: 1px solid rgb(var(--ui-warn) / 0.35);
  color: rgb(var(--ui-fg));
  border-radius: var(--ui-radius-md);
  padding: var(--ui-space-3) var(--ui-space-4);
  font-size: var(--ui-text-sm);
}
.pv-banner-icon {
  flex-shrink: 0;
  width: 20px;
  height: 20px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: rgb(var(--ui-warn) / 0.2);
  color: rgb(var(--ui-warn));
  font-size: var(--ui-text-xs);
  font-weight: 700;
}

/* Métricas */
.pv-metrics {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: var(--ui-space-4);
}

/* Célula: profissional (avatar + nome + e-mail) */
.pv-person {
  display: flex;
  align-items: center;
  gap: var(--ui-space-3);
  min-width: 0;
}

.pv-avatar {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  flex-shrink: 0;
  border-radius: var(--ui-radius-pill);
  background: rgb(var(--ui-accent) / 0.14);
  color: rgb(var(--ui-accent-strong));
  font-size: var(--ui-text-xs);
  font-weight: 700;
  letter-spacing: 0.02em;
}

/* Proprietário: tom levemente diferente */
.pv-avatar[data-role="owner"] {
  background: rgb(var(--ui-accent) / 0.22);
}

.pv-avatar[data-role="clinic_manager"] {
  background: rgb(var(--ui-warn) / 0.16);
  color: rgb(var(--ui-warn));
}

.pv-person-text {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.pv-person-name {
  font-weight: 600;
  color: rgb(var(--ui-fg));
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.pv-person-email {
  font-size: var(--ui-text-xs);
  color: rgb(var(--ui-muted));
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* Célula: especialidade */
.pv-specialty {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.pv-specialty-name {
  color: rgb(var(--ui-fg));
}

/* Célula: telefone */
.pv-phone {
  font-variant-numeric: tabular-nums;
  color: rgb(var(--ui-fg));
}

/* Texto secundário */
.pv-sub {
  font-size: var(--ui-text-xs);
  color: rgb(var(--ui-muted));
}

/* Ações por linha */
.pv-row-actions {
  display: inline-flex;
  gap: var(--ui-space-2);
  justify-content: flex-end;
  flex-wrap: wrap;
}

.pv-readonly {
  color: rgb(var(--ui-muted));
  font-size: var(--ui-text-sm);
}

/* Modal: editar papel */
.pv-edit-role-body {
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-4);
}

.pv-edit-role-desc {
  margin: 0;
  font-size: var(--ui-text-sm);
  color: rgb(var(--ui-muted));
  line-height: 1.5;
}

/* Select nativo estilizado com tokens --ui-* (complementa o :deep(select) de UiFormField) */
.pv-select {
  appearance: none;
  -webkit-appearance: none;
  cursor: pointer;
  /* arrow icon via background-image usando apenas tokens de cor */
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'%3E%3Cpath fill='%236b7280' d='M1 1l5 5 5-5'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right var(--ui-space-3) center;
  padding-right: calc(var(--ui-space-3) * 2 + 12px);
  transition: border-color .15s ease, box-shadow .15s ease;
}
.pv-select:focus {
  outline: none;
  border-color: rgb(var(--ui-accent));
  box-shadow: 0 0 0 3px rgb(var(--ui-accent) / 0.15);
}
.pv-select[aria-invalid="true"] {
  border-color: rgb(var(--ui-danger));
}
.pv-select[aria-invalid="true"]:focus {
  box-shadow: 0 0 0 3px rgb(var(--ui-danger) / 0.15);
}
.pv-select:disabled {
  opacity: .55;
  cursor: not-allowed;
  background-color: rgb(var(--ui-surface-2));
}

/* Responsividade */
@media (max-width: 860px) {
  .pv-metrics {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 480px) {
  .pv-metrics {
    grid-template-columns: 1fr;
  }

  .pv-row-actions {
    flex-direction: column;
    align-items: flex-end;
  }
}
</style>
