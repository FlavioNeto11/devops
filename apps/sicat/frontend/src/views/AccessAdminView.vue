<script setup>
import { computed, onMounted, ref } from 'vue';
import {
  getAdminAccessUserById,
  listAdminAccessPermissions,
  listAdminAccessRoles,
  listAdminAccessSessions,
  listAdminAccessUsers
} from '../services/api.js';
import { formatDateTimeBr } from '../utils/date-format.js';
import SicatPageLayout from '../components/sicat/SicatPageLayout.vue';
import SicatPageHeader from '../components/shell/SicatPageHeader.vue';
import SicatCard from '../components/sicat/SicatCard.vue';
import SicatFiltersPanel from '../components/sicat/SicatFiltersPanel.vue';
import SicatDataTable from '../components/sicat/SicatDataTable.vue';
import SicatStatusBadge from '../components/sicat/SicatStatusBadge.vue';
import SicatEmptyState from '../components/sicat/SicatEmptyState.vue';

const loading = ref(false);
const loadingUserDetails = ref(false);
const error = ref('');
const detailsError = ref('');
const lastUpdatedAt = ref('');

const filters = ref({ search: '', status: 'active', page: 1, pageSize: 20 });

const users = ref([]);
const usersTotal = ref(0);
const roles = ref([]);
const permissions = ref([]);
const sessions = ref([]);

const selectedUserId = ref('');
const selectedUser = ref(null);

const selectedUserRoles = computed(() => selectedUser.value?.roles || []);
const selectedUserPermissions = computed(() => selectedUser.value?.permissions || []);

function formatDate(value) {
  return value ? formatDateTimeBr(value) : '—';
}

function statusLabel(status) {
  const normalized = String(status || '').toLowerCase();
  const map = {
    active: 'Ativo', disabled: 'Desativado', pending_auth: 'Pendente',
    expired: 'Expirado', revoked: 'Revogado', invalid: 'Inválido'
  };
  return map[normalized] || status || '-';
}

const userHeaders = [
  { title: 'Usuário', key: 'user', sortable: false },
  { title: 'Status', key: 'status', sortable: false },
  { title: 'Perfis', key: 'roles', sortable: false },
  { title: 'Atualizado', key: 'updatedAt', sortable: false },
  { title: 'Ações', key: 'actions', sortable: false, align: 'end' }
];

const sessionHeaders = [
  { title: 'Session Context', key: 'sessionContextId', sortable: false },
  { title: 'Usuário', key: 'userId', sortable: false },
  { title: 'Conta integração', key: 'integrationAccountId', sortable: false },
  { title: 'Status', key: 'status', sortable: false },
  { title: 'Expira em', key: 'expiresAt', sortable: false }
];

const userRows = computed(() =>
  users.value.map((item) => ({
    id: item.userId,
    name: item.name || item.email,
    email: item.email,
    status: item.status,
    roles: item.roles || [],
    updatedAt: formatDate(item.updatedAt)
  }))
);

const sessionRows = computed(() =>
  sessions.value.map((session) => ({
    id: session.sessionContextId,
    sessionContextId: session.sessionContextId,
    userId: session.userId || '—',
    integrationAccountId: session.integrationAccountId,
    status: session.status,
    expiresAt: formatDate(session.expiresAt)
  }))
);

async function loadUsers() {
  const response = await listAdminAccessUsers({
    search: filters.value.search,
    status: filters.value.status,
    page: filters.value.page,
    pageSize: filters.value.pageSize
  });
  users.value = Array.isArray(response?.items) ? response.items : [];
  usersTotal.value = Number(response?.total || 0);
}

async function loadSupportData() {
  const [rolesResponse, permissionsResponse, sessionsResponse] = await Promise.all([
    listAdminAccessRoles(),
    listAdminAccessPermissions(),
    listAdminAccessSessions({ page: 1, pageSize: 20 })
  ]);
  roles.value = Array.isArray(rolesResponse?.items) ? rolesResponse.items : [];
  permissions.value = Array.isArray(permissionsResponse?.items) ? permissionsResponse.items : [];
  sessions.value = Array.isArray(sessionsResponse?.items) ? sessionsResponse.items : [];
}

async function loadInitialData() {
  loading.value = true;
  error.value = '';
  try {
    await Promise.all([loadUsers(), loadSupportData()]);
    lastUpdatedAt.value = new Date().toISOString();
    if (!selectedUserId.value && users.value[0]?.userId) {
      await selectUser(users.value[0].userId);
    }
  } catch (err) {
    error.value = err?.message || 'Falha ao carregar visão administrativa de acessos.';
  } finally {
    loading.value = false;
  }
}

async function applyFilters() {
  filters.value.page = 1;
  selectedUserId.value = '';
  selectedUser.value = null;
  detailsError.value = '';
  await loadInitialData();
}

async function selectUser(userId) {
  const nextUserId = String(userId || '').trim();
  if (!nextUserId) return;
  loadingUserDetails.value = true;
  detailsError.value = '';
  try {
    selectedUser.value = await getAdminAccessUserById(nextUserId);
    selectedUserId.value = nextUserId;
  } catch (err) {
    detailsError.value = err?.message || 'Falha ao carregar detalhes do usuário.';
  } finally {
    loadingUserDetails.value = false;
  }
}

onMounted(loadInitialData);
</script>

<template>
  <SicatPageLayout :error="error">
    <template #header>
      <SicatPageHeader
        title="Perfis e Acessos"
        description="Operação administrativa global para usuários, perfis, permissões e sessões."
      >
        <template #actions>
          <v-btn variant="tonal" color="primary" :loading="loading" prepend-icon="mdi-refresh" @click="loadInitialData">Atualizar dados</v-btn>
        </template>
      </SicatPageHeader>
    </template>

    <template #filters>
      <SicatFiltersPanel :loading="loading" apply-label="Aplicar filtros" @apply="applyFilters" @clear="() => { filters.search = ''; filters.status = 'active'; applyFilters(); }">
        <v-text-field v-model="filters.search" label="Usuário (nome/e-mail/ID)" placeholder="Ex.: flavio" density="comfortable" variant="outlined" hide-details="auto" @keydown.enter.prevent="applyFilters" />
        <v-select v-model="filters.status" label="Status" :items="[{title:'Ativo',value:'active'},{title:'Desativado',value:'disabled'},{title:'Todos',value:''}]" item-title="title" item-value="value" density="comfortable" variant="outlined" hide-details="auto" />
        <v-select v-model.number="filters.pageSize" label="Por página" :items="[{title:'10',value:10},{title:'20',value:20},{title:'50',value:50}]" item-title="title" item-value="value" density="comfortable" variant="outlined" hide-details="auto" />
      </SicatFiltersPanel>
    </template>

    <div class="access-admin__metrics">
      <v-chip variant="tonal">Usuários: {{ usersTotal }}</v-chip>
      <v-chip variant="tonal">Perfis: {{ roles.length }}</v-chip>
      <v-chip variant="tonal">Permissões: {{ permissions.length }}</v-chip>
      <span class="text-caption text-medium-emphasis">Última atualização: {{ lastUpdatedAt ? formatDate(lastUpdatedAt) : '—' }}</span>
    </div>

    <div class="access-admin__grid">
      <SicatCard title="Usuários" flush-body>
        <SicatDataTable
          :headers="userHeaders"
          :items="userRows"
          :loading="loading"
          density="compact"
          :empty="{ title: 'Nenhum usuário encontrado', icon: 'mdi-account-off-outline' }"
        >
          <template #[`item.user`]="{ item }">
            <div class="font-weight-medium">{{ item.name }}</div>
            <div class="text-caption text-medium-emphasis">{{ item.email }}</div>
          </template>
          <template #[`item.status`]="{ item }">
            <SicatStatusBadge :status="item.status" domain="account-health" :label="statusLabel(item.status)" with-dot />
          </template>
          <template #[`item.roles`]="{ item }">
            <span v-if="!item.roles.length" class="text-caption text-medium-emphasis">Sem perfil</span>
            <div v-else><div v-for="role in item.roles" :key="role.roleId" class="text-caption">{{ role.name }}</div></div>
          </template>
          <template #[`item.actions`]="{ item }">
            <v-btn size="x-small" variant="outlined" :loading="loadingUserDetails" :color="selectedUserId === item.id ? 'primary' : undefined" @click="selectUser(item.id)">
              {{ selectedUserId === item.id ? 'Selecionado' : 'Detalhar' }}
            </v-btn>
          </template>
        </SicatDataTable>
      </SicatCard>

      <SicatCard title="Detalhes do usuário">
        <SicatEmptyState v-if="!selectedUser" compact title="Selecione um usuário" description="Escolha um usuário na lista para ver perfis e permissões." icon="mdi-account-search-outline" />
        <template v-else>
          <div class="mb-3">
            <div class="text-subtitle-2 font-weight-bold">{{ selectedUser.name || selectedUser.email }}</div>
            <div class="text-caption text-medium-emphasis">{{ selectedUser.userId }}</div>
          </div>
          <div class="access-admin__detail-grid">
            <div>
              <div class="text-caption font-weight-bold mb-1">Perfis atribuídos</div>
              <p v-if="!selectedUserRoles.length" class="text-caption text-medium-emphasis">Usuário sem perfis.</p>
              <v-list v-else density="compact" lines="two">
                <v-list-item v-for="role in selectedUserRoles" :key="role.roleId" :title="role.name" :subtitle="role.description" />
              </v-list>
            </div>
            <div>
              <div class="text-caption font-weight-bold mb-1">Permissões efetivas</div>
              <p v-if="!selectedUserPermissions.length" class="text-caption text-medium-emphasis">Usuário sem permissões.</p>
              <v-list v-else density="compact" lines="two">
                <v-list-item v-for="permission in selectedUserPermissions" :key="permission.permissionId" :title="`${permission.resource} · ${permission.action}`" :subtitle="permission.description" />
              </v-list>
            </div>
          </div>
        </template>
      </SicatCard>
    </div>

    <SicatCard title="Sessões recentes" flush-body>
      <SicatDataTable
        :headers="sessionHeaders"
        :items="sessionRows"
        :loading="loading"
        density="compact"
        :empty="{ title: 'Nenhuma sessão encontrada', icon: 'mdi-key-outline' }"
      >
        <template #[`item.sessionContextId`]="{ item }">
          <span class="access-admin__mono">{{ item.sessionContextId }}</span>
        </template>
        <template #[`item.status`]="{ item }">
          <SicatStatusBadge :status="item.status" domain="account-health" :label="statusLabel(item.status)" with-dot />
        </template>
      </SicatDataTable>
    </SicatCard>
  </SicatPageLayout>
</template>

<style scoped>
.access-admin__metrics {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.access-admin__grid {
  display: grid;
  grid-template-columns: minmax(0, 1.7fr) minmax(0, 1fr);
  gap: var(--space-4);
  align-items: start;
}

@media (max-width: 1180px) {
  .access-admin__grid {
    grid-template-columns: 1fr;
  }
}

.access-admin__detail-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: var(--space-4);
}

.access-admin__mono {
  font-family: var(--font-family-mono);
  font-size: 0.8em;
}
</style>
