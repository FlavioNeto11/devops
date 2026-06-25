<template>
  <UiPageLayout
    eyebrow="Equipe"
    title="Profissionais"
    subtitle="Equipe da clínica com papel, especialidade e situação."
    width="wide"
    :error="r.error.value"
    @retry="r.load"
  >
    <template #actions>
      <UiButton variant="ghost" :loading="r.loading.value" @click="r.load">Atualizar</UiButton>
      <UiButton v-if="canManage" to="/professionals/new">
        <template #icon-left><span class="np-plus" aria-hidden="true">+</span></template>
        Convidar profissional
      </UiButton>
    </template>

    <template #banner>
      <div v-if="!canManage && !meLoading" class="np-banner" role="note">
        <span class="np-banner-dot" aria-hidden="true" />
        <span>Você está em modo de visualização. Apenas gestor ou proprietário pode gerenciar a equipe.</span>
      </div>
    </template>

    <!-- Resumo da equipe. Total = total do servidor; contagens por situação refletem só a
         PÁGINA carregada (lista paginada), por isso rotuladas "nesta página". -->
    <section class="np-metrics" aria-label="Resumo da equipe">
      <UiMetricCard
        label="Profissionais"
        :value="metrics.total"
        :loading="r.loading.value"
        tone="primary"
        hint="Total na equipe"
        clickable
        @click="clearStatus"
      />
      <UiMetricCard
        label="Ativos"
        :value="metrics.active"
        :loading="r.loading.value"
        tone="success"
        hint="Em atividade (nesta página)"
        clickable
        @click="filterStatus('active')"
      />
      <UiMetricCard
        label="Convidados"
        :value="metrics.invited"
        :loading="r.loading.value"
        tone="warning"
        hint="Aguardando aceite (nesta página)"
        clickable
        @click="filterStatus('invited')"
      />
      <UiMetricCard
        label="Suspensos"
        :value="metrics.suspended"
        :loading="r.loading.value"
        tone="error"
        hint="Acesso bloqueado (nesta página)"
        clickable
        @click="filterStatus('suspended')"
      />
    </section>

    <template #filters>
      <UiFiltersPanel
        v-model="filterModel"
        :fields="filterFields"
        @apply="applyFilters"
        @clear="clearFilters"
      />
    </template>

    <UiDataTable
      :columns="columns"
      :rows="r.items.value"
      :loading="r.loading.value"
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
      @row-click="open"
    >
      <!-- Profissional: nome + e-mail -->
      <template #cell-full_name="{ row }">
        <div class="np-person">
          <span class="np-avatar" aria-hidden="true">{{ initials(row.full_name) }}</span>
          <span class="np-person-text">
            <span class="np-person-name">{{ row.full_name || '—' }}</span>
            <span class="np-person-email">{{ row.email || '—' }}</span>
          </span>
        </div>
      </template>

      <!-- Papel -->
      <template #cell-role="{ value }">
        <UiStatusBadge :status="value" :tone="roleTone(value)" :label="roleLabel(value)" :with-dot="false" />
      </template>

      <!-- Especialidade + registro de conselho -->
      <template #cell-specialty="{ row }">
        <span class="np-specialty">
          <span class="np-specialty-name">{{ row.specialty || '—' }}</span>
          <span v-if="row.council_number" class="np-council">CRM/Reg. {{ row.council_number }}</span>
        </span>
      </template>

      <!-- Telefone -->
      <template #cell-phone="{ value }">
        <span class="np-phone">{{ value || '—' }}</span>
      </template>

      <!-- Situação -->
      <template #cell-status="{ value }">
        <UiStatusBadge :status="value" :label="statusLabelFor(value)" />
      </template>

      <!-- Ações (apenas gestor/proprietário) -->
      <template #cell-actions="{ row }">
        <div class="np-row-actions" @click.stop>
          <template v-if="canManage">
            <UiButton variant="ghost" size="sm" @click="edit(row)">Editar</UiButton>
            <UiButton
              v-if="row.status !== 'suspended'"
              variant="danger"
              size="sm"
              :loading="busyId === row.id"
              @click="suspend(row)"
            >Suspender</UiButton>
            <UiButton
              v-else
              variant="subtle"
              size="sm"
              :loading="busyId === row.id"
              @click="reactivate(row)"
            >Reativar</UiButton>
          </template>
          <span v-else class="np-row-readonly">—</span>
        </div>
      </template>

      <template #empty-action>
        <UiButton v-if="canManage" to="/professionals/new">Convidar profissional</UiButton>
      </template>
    </UiDataTable>
  </UiPageLayout>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import {
  UiPageLayout,
  UiDataTable,
  UiFiltersPanel,
  UiStatusBadge,
  UiMetricCard,
  UiButton,
  useResource,
  useToast,
  useConfirm,
} from '../ui/index.js';
import { resourceFactory, me } from '../api.js';

// Recurso REST real do domínio: /v1/professionals (resolvido pela fábrica do api.js),
// idêntico ao irmão ProfessionalCreateView. O api.js não exporta `professionals` por nome.
const professionals = resourceFactory('professionals');

const router = useRouter();
const toast = useToast();
const askConfirm = useConfirm();

// ---- Vocabulário do domínio (rótulos legíveis pt-BR) ----
const ROLE_LABELS = { owner: 'Proprietário', clinic_manager: 'Gestor da clínica', professional: 'Profissional' };
const STATUS_LABELS = { active: 'Ativo', invited: 'Convidado', suspended: 'Suspenso' };
const roleLabel = (v) => ROLE_LABELS[v] || (v || '—');
const statusLabelFor = (v) => STATUS_LABELS[v] || (v || '—');
// Tons de hierarquia (NÃO de atenção): proprietário em destaque (accent), gestor e profissional
// neutros. 'warning'/'error' ficam reservados para situações reais (ex.: suspenso).
const roleTone = (v) => (v === 'owner' ? 'running' : 'neutral');

// ---- Colunas da tabela ----
const columns = [
  { key: 'full_name', label: 'Profissional', sortable: true },
  { key: 'role', label: 'Papel', sortable: true },
  { key: 'specialty', label: 'Especialidade', sortable: true },
  { key: 'phone', label: 'Telefone', align: 'left' },
  { key: 'status', label: 'Situação', sortable: true },
  { key: 'actions', label: '', align: 'right' },
];

// ---- Filtros (papel + situação) ----
const filterFields = [
  {
    key: 'role',
    label: 'Papel',
    type: 'select',
    options: [
      { value: 'owner', label: ROLE_LABELS.owner },
      { value: 'clinic_manager', label: ROLE_LABELS.clinic_manager },
      { value: 'professional', label: ROLE_LABELS.professional },
    ],
  },
  {
    key: 'status',
    label: 'Situação',
    type: 'select',
    options: [
      { value: 'active', label: STATUS_LABELS.active },
      { value: 'invited', label: STATUS_LABELS.invited },
      { value: 'suspended', label: STATUS_LABELS.suspended },
    ],
  },
];
const filterModel = reactive({ role: '', status: '' });

// ---- Recurso (server-mode: paginação/ordenação/filtro) ----
const r = useResource(professionals, { sort: { key: 'full_name', dir: 'asc' } });

function applyFilters(values) {
  r.setFilters({ role: values.role || '', status: values.status || '' });
}
function clearFilters() {
  filterModel.role = '';
  filterModel.status = '';
  r.setFilters({ role: '', status: '' });
}
// Clicar num card de situação aplica EXATAMENTE aquela situação: limpamos o filtro de papel
// para um resultado previsível (sem combinar filtros de forma não óbvia para o usuário).
function filterStatus(status) {
  filterModel.role = '';
  filterModel.status = status;
  r.setFilters({ role: '', status });
}
function clearStatus() {
  filterModel.status = '';
  r.setFilters({ status: '' });
}

// ---- Métricas: total vem do servidor; contagens por situação são da PÁGINA carregada
// (lista paginada), então os cards usam o rótulo "nesta página" para não enganar. ----
const metrics = computed(() => {
  const rows = r.items.value || [];
  const count = (s) => rows.filter((p) => p.status === s).length;
  return {
    total: r.total.value || rows.length,
    active: count('active'),
    invited: count('invited'),
    suspended: count('suspended'),
  };
});

// ---- Estado vazio (sensível a filtro) ----
const emptyState = computed(() => {
  const filtered = filterModel.role || filterModel.status;
  if (filtered) {
    return { title: 'Nenhum profissional encontrado', description: 'Nenhum registro corresponde aos filtros aplicados. Ajuste ou limpe os filtros.', icon: 'search' };
  }
  return {
    title: 'Equipe ainda vazia',
    description: canManage.value
      ? 'Convide o primeiro profissional para começar a montar a equipe da clínica.'
      : 'Nenhum profissional cadastrado até o momento.',
    icon: 'users',
  };
});

// ---- Avatar / iniciais ----
function initials(name) {
  if (!name) return '?';
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  const first = parts[0][0] || '';
  const last = parts.length > 1 ? parts[parts.length - 1][0] : '';
  return (first + last).toUpperCase();
}

// ---- RBAC: somente gestor/proprietário gerencia ----
const meRole = ref('');
const meLoading = ref(true);
const MANAGER_ROLES = ['owner', 'clinic_manager'];
const canManage = computed(() => MANAGER_ROLES.includes(meRole.value));

async function loadMe() {
  meLoading.value = true;
  try {
    // Identidade pela camada api.js (contrato/erro padronizado), sem fetch solto na view.
    const identity = await me();
    meRole.value = (identity && (identity.role || (identity.user && identity.user.role))) || '';
  } catch {
    // fail-safe: sem identidade confirmada => modo visualização (não bloqueia a tela)
    meRole.value = '';
  } finally {
    meLoading.value = false;
  }
}

// ---- Navegação ----
const open = (row) => router.push('/professionals/' + row.id);
const edit = (row) => router.push('/professionals/' + row.id + '/edit');

// ---- Ações de situação (destrutiva via confirmação) ----
const busyId = ref(null);

async function suspend(row) {
  const ok = await askConfirm({
    title: 'Suspender profissional',
    message: 'Suspender "' + (row.full_name || 'este profissional') + '"? O acesso à clínica será bloqueado até a reativação.',
    confirmLabel: 'Suspender',
    danger: true,
  });
  if (!ok) return;
  busyId.value = row.id;
  try {
    await professionals.update(row.id, { ...row, status: 'suspended' });
    toast.success('Profissional suspenso.');
    await r.load();
  } catch (e) {
    toast.error((e && e.message) || 'Não foi possível suspender o profissional.');
  } finally {
    busyId.value = null;
  }
}

async function reactivate(row) {
  const ok = await askConfirm({
    title: 'Reativar profissional',
    message: 'Reativar "' + (row.full_name || 'este profissional') + '" e restaurar o acesso à clínica?',
    confirmLabel: 'Reativar',
  });
  if (!ok) return;
  busyId.value = row.id;
  try {
    await professionals.update(row.id, { ...row, status: 'active' });
    toast.success('Profissional reativado.');
    await r.load();
  } catch (e) {
    toast.error((e && e.message) || 'Não foi possível reativar o profissional.');
  } finally {
    busyId.value = null;
  }
}

onMounted(() => {
  loadMe();
  r.load();
});
</script>

<style scoped>
.np-plus { font-weight: 700; }

/* Banner de modo visualização */
.np-banner {
  display: flex;
  align-items: center;
  gap: var(--ui-space-2);
  background: rgb(var(--ui-warn) / 0.12);
  border: 1px solid rgb(var(--ui-warn) / 0.4);
  color: rgb(var(--ui-fg));
  border-radius: var(--ui-radius-md);
  padding: var(--ui-space-3) var(--ui-space-4);
  font-size: var(--ui-text-sm);
}
.np-banner-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: rgb(var(--ui-warn));
  flex-shrink: 0;
}

/* Métricas */
.np-metrics {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: var(--ui-space-4);
}

/* Célula de pessoa: avatar + nome + e-mail */
.np-person {
  display: flex;
  align-items: center;
  gap: var(--ui-space-3);
  min-width: 0;
}
.np-avatar {
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
.np-person-text {
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.np-person-name {
  font-weight: 600;
  color: rgb(var(--ui-fg));
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.np-person-email {
  font-size: var(--ui-text-xs);
  color: rgb(var(--ui-muted));
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* Especialidade + conselho */
.np-specialty {
  display: flex;
  flex-direction: column;
}
.np-specialty-name {
  color: rgb(var(--ui-fg));
}
.np-council {
  font-size: var(--ui-text-xs);
  color: rgb(var(--ui-muted));
}

.np-phone {
  font-variant-numeric: tabular-nums;
  color: rgb(var(--ui-fg));
}

/* Ações por linha */
.np-row-actions {
  display: inline-flex;
  gap: var(--ui-space-2);
  justify-content: flex-end;
  flex-wrap: wrap;
}
.np-row-readonly {
  color: rgb(var(--ui-muted));
}

/* Responsivo */
@media (max-width: 860px) {
  .np-metrics {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
@media (max-width: 480px) {
  .np-metrics {
    grid-template-columns: 1fr;
  }
}
</style>
