<script setup>
import { computed, onMounted, ref } from 'vue';
import {
  expireAdminAccessUserPassword,
  getAdminAccessUserById,
  grantAdminAccessRole,
  listAdminAccessPermissions,
  listAdminAccessRoles,
  listAdminAccessSessions,
  listAdminAccessUsers,
  resetAdminAccessUserPassword,
  revokeAdminAccessRole
} from '../services/api.js';
import { formatDateTimeBr } from '../utils/date-format.js';
import { useAuthStore } from '../stores/auth.js';
import { useNotification } from '../composables/useNotification.js';
import { useConfirmDialog } from '../composables/useConfirmDialog.js';
import SicatPageLayout from '../components/sicat/SicatPageLayout.vue';
import SicatPageHeader from '../components/shell/SicatPageHeader.vue';
import SicatCard from '../components/sicat/SicatCard.vue';
import SicatFiltersPanel from '../components/sicat/SicatFiltersPanel.vue';
import SicatDataTable from '../components/sicat/SicatDataTable.vue';
import SicatStatusBadge from '../components/sicat/SicatStatusBadge.vue';
import SicatEmptyState from '../components/sicat/SicatEmptyState.vue';
import ConfirmDialog from '../components/sicat/SicatConfirmDialog.vue';

const authStore = useAuthStore();
const notify = useNotification();
const {
  dialogVisible,
  dialogTitle,
  dialogMessage,
  dialogConfirmLabel,
  dialogCancelLabel,
  dialogDanger,
  dialogShowCancel,
  confirm,
  accept,
  cancel
} = useConfirmDialog();

const canAccessAdmin = computed(() => Boolean(authStore.canAccessAdmin?.value));

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

// Ação em curso: chave curta que trava o botão correspondente (anti-duplo-submit).
// Ex.: 'expire' | `revoke:${roleId}`.
const actionKey = ref('');

// Diálogo de concessão de perfil.
const grantDialog = ref(false);
const grantRoleId = ref('');
const grantExpiresAt = ref('');
const grantSubmitting = ref(false);
const grantError = ref('');

// Diálogo de reset de senha.
const resetDialog = ref(false);
const resetPassword = ref('');
const resetRevokeSessions = ref(true);
const resetShowPassword = ref(false);
const resetSubmitting = ref(false);
const resetError = ref('');

// Perfis ainda não atribuídos ao usuário selecionado (candidatos à concessão).
const assignableRoles = computed(() => {
  const assigned = new Set(selectedUserRoles.value.map((role) => role.roleId));
  return roles.value.filter((role) => !assigned.has(role.roleId));
});

const roleSelectItems = computed(() =>
  assignableRoles.value.map((role) => ({ title: role.name, value: role.roleId }))
);

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

// Recarrega lista, dados de apoio e o usuário selecionado após uma mutação,
// para que a UI reflita o novo estado (perfis/sessões). Falha aqui é não-fatal:
// a ação já foi aplicada no servidor.
async function refreshAfterMutation() {
  const currentUserId = selectedUserId.value;
  try {
    await Promise.all([loadUsers(), loadSupportData()]);
    lastUpdatedAt.value = new Date().toISOString();
    if (currentUserId) {
      await selectUser(currentUserId);
    }
  } catch (err) {
    notify.warning('Ação aplicada, mas não foi possível atualizar a tela.', {
      detail: err?.message || '',
      actionLabel: 'Atualizar dados',
      onAction: loadInitialData
    });
  }
}

function openGrantDialog() {
  if (!canAccessAdmin.value || !selectedUserId.value) return;
  grantRoleId.value = '';
  grantExpiresAt.value = '';
  grantError.value = '';
  grantDialog.value = true;
}

async function submitGrant() {
  if (grantSubmitting.value) return;
  const userId = selectedUserId.value;
  const roleId = grantRoleId.value;
  if (!userId) return;
  if (!roleId) {
    grantError.value = 'Selecione um perfil para conceder.';
    return;
  }

  grantSubmitting.value = true;
  grantError.value = '';
  try {
    const payload = {};
    if (grantExpiresAt.value) {
      payload.expiresAt = new Date(grantExpiresAt.value).toISOString();
    }
    await grantAdminAccessRole(userId, roleId, payload);
    const roleName = roles.value.find((role) => role.roleId === roleId)?.name || 'Perfil';
    notify.success(`${roleName} concedido ao usuário.`);
    grantDialog.value = false;
    await refreshAfterMutation();
  } catch (err) {
    grantError.value = err?.message || 'Falha ao conceder o perfil.';
  } finally {
    grantSubmitting.value = false;
  }
}

async function revokeRole(role) {
  if (!canAccessAdmin.value) return;
  const userId = selectedUserId.value;
  const roleId = role?.roleId;
  if (!userId || !roleId) return;
  if (actionKey.value) return;

  const confirmed = await confirm({
    title: 'Revogar perfil',
    message: `Revogar o perfil "${role.name}" deste usuário? Ele perde as permissões associadas.`,
    confirmLabel: 'Revogar perfil',
    danger: true
  });
  if (!confirmed) return;

  actionKey.value = `revoke:${roleId}`;
  try {
    const response = await revokeAdminAccessRole(userId, roleId, {});
    if (response?.status === 'noop') {
      notify.info(`O usuário já não tinha o perfil "${role.name}".`);
    } else {
      notify.success(`Perfil "${role.name}" revogado.`);
    }
    await refreshAfterMutation();
  } catch (err) {
    notify.error('Falha ao revogar o perfil.', { detail: err?.message || '' });
  } finally {
    actionKey.value = '';
  }
}

function openResetDialog() {
  if (!canAccessAdmin.value || !selectedUserId.value) return;
  resetPassword.value = '';
  resetRevokeSessions.value = true;
  resetShowPassword.value = false;
  resetError.value = '';
  resetDialog.value = true;
}

async function submitReset() {
  if (resetSubmitting.value) return;
  const userId = selectedUserId.value;
  if (!userId) return;
  if (String(resetPassword.value || '').length < 8) {
    resetError.value = 'A nova senha deve ter no mínimo 8 caracteres.';
    return;
  }

  resetSubmitting.value = true;
  resetError.value = '';
  try {
    const response = await resetAdminAccessUserPassword(userId, {
      newPassword: resetPassword.value,
      revokeSessions: resetRevokeSessions.value
    });
    const revoked = Number(response?.revokedSessions || 0);
    const suffix = response?.revokeSessions
      ? ` ${revoked} sessão(ões) revogada(s).`
      : ' Sessões ativas mantidas.';
    notify.success(`Senha redefinida.${suffix}`);
    resetDialog.value = false;
    resetPassword.value = '';
    await refreshAfterMutation();
  } catch (err) {
    resetError.value = err?.message || 'Falha ao redefinir a senha.';
  } finally {
    resetSubmitting.value = false;
  }
}

async function expirePassword() {
  if (!canAccessAdmin.value) return;
  const userId = selectedUserId.value;
  if (!userId) return;
  if (actionKey.value) return;

  const confirmed = await confirm({
    title: 'Expirar senha',
    message: 'Forçar a expiração da senha deste usuário? Ele terá de definir uma nova no próximo acesso e as sessões ativas serão revogadas.',
    confirmLabel: 'Expirar senha',
    danger: true
  });
  if (!confirmed) return;

  actionKey.value = 'expire';
  try {
    const response = await expireAdminAccessUserPassword(userId, { revokeSessions: true });
    const revoked = Number(response?.revokedSessions || 0);
    notify.success(`Senha expirada. ${revoked} sessão(ões) revogada(s).`);
    await refreshAfterMutation();
  } catch (err) {
    notify.error('Falha ao expirar a senha.', { detail: err?.message || '' });
  } finally {
    actionKey.value = '';
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

          <div v-if="canAccessAdmin" class="access-admin__actions mb-4">
            <v-btn size="small" color="primary" variant="flat" prepend-icon="mdi-account-plus-outline" :disabled="Boolean(actionKey)" @click="openGrantDialog">
              Conceder perfil
            </v-btn>
            <v-btn size="small" color="primary" variant="outlined" prepend-icon="mdi-lock-reset" :disabled="Boolean(actionKey)" @click="openResetDialog">
              Resetar senha
            </v-btn>
            <v-btn size="small" color="error" variant="outlined" prepend-icon="mdi-lock-clock" :loading="actionKey === 'expire'" :disabled="Boolean(actionKey)" @click="expirePassword">
              Expirar senha
            </v-btn>
          </div>

          <div class="access-admin__detail-grid">
            <div>
              <div class="text-caption font-weight-bold mb-1">Perfis atribuídos</div>
              <p v-if="!selectedUserRoles.length" class="text-caption text-medium-emphasis">Usuário sem perfis.</p>
              <v-list v-else density="compact" lines="two">
                <v-list-item v-for="role in selectedUserRoles" :key="role.roleId" :title="role.name" :subtitle="role.description">
                  <template v-if="canAccessAdmin" #append>
                    <v-btn
                      size="x-small"
                      color="error"
                      variant="text"
                      icon="mdi-account-minus-outline"
                      :aria-label="`Revogar perfil ${role.name}`"
                      :title="`Revogar perfil ${role.name}`"
                      :loading="actionKey === `revoke:${role.roleId}`"
                      :disabled="Boolean(actionKey)"
                      @click="revokeRole(role)"
                    />
                  </template>
                </v-list-item>
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

    <ConfirmDialog
      :visible="dialogVisible"
      :title="dialogTitle"
      :message="dialogMessage"
      :confirm-label="dialogConfirmLabel"
      :cancel-label="dialogCancelLabel"
      :show-cancel="dialogShowCancel"
      :danger="dialogDanger"
      @confirm="accept"
      @cancel="cancel"
      @close="cancel"
    />

    <v-dialog v-model="grantDialog" max-width="480" persistent role="dialog" aria-modal="true">
      <v-card rounded="lg" title="Conceder perfil">
        <v-card-text>
          <p class="text-body-2 mb-4">
            Atribuir um perfil a <strong>{{ selectedUser?.name || selectedUser?.email || 'usuário' }}</strong>.
            O usuário passa a herdar as permissões do perfil.
          </p>
          <v-select
            v-model="grantRoleId"
            label="Perfil"
            :items="roleSelectItems"
            item-title="title"
            item-value="value"
            density="comfortable"
            variant="outlined"
            hide-details="auto"
            :no-data-text="'Nenhum perfil disponível para conceder'"
            class="mb-3"
          />
          <v-text-field
            v-model="grantExpiresAt"
            type="datetime-local"
            label="Expira em (opcional)"
            hint="Deixe em branco para uma concessão permanente."
            persistent-hint
            density="comfortable"
            variant="outlined"
          />
          <v-alert v-if="grantError" type="error" variant="tonal" density="compact" class="mt-3" aria-live="polite">
            {{ grantError }}
          </v-alert>
        </v-card-text>
        <v-card-actions class="justify-end">
          <v-btn variant="text" :disabled="grantSubmitting" @click="grantDialog = false">Cancelar</v-btn>
          <v-btn color="primary" variant="flat" :loading="grantSubmitting" :disabled="!grantRoleId" @click="submitGrant">
            Conceder perfil
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-dialog v-model="resetDialog" max-width="480" persistent role="dialog" aria-modal="true">
      <v-card rounded="lg" title="Resetar senha">
        <v-card-text>
          <p class="text-body-2 mb-4">
            Definir uma nova senha para <strong>{{ selectedUser?.name || selectedUser?.email || 'usuário' }}</strong>.
            Informe a nova senha e repasse-a por um canal seguro.
          </p>
          <v-text-field
            v-model="resetPassword"
            :type="resetShowPassword ? 'text' : 'password'"
            label="Nova senha"
            autocomplete="new-password"
            :append-inner-icon="resetShowPassword ? 'mdi-eye-off' : 'mdi-eye'"
            hint="Mínimo de 8 caracteres."
            persistent-hint
            density="comfortable"
            variant="outlined"
            @click:append-inner="resetShowPassword = !resetShowPassword"
            @keydown.enter.prevent="submitReset"
          />
          <v-switch
            v-model="resetRevokeSessions"
            label="Revogar sessões ativas do usuário"
            color="primary"
            density="compact"
            hide-details
            class="mt-2"
          />
          <v-alert v-if="resetError" type="error" variant="tonal" density="compact" class="mt-3" aria-live="polite">
            {{ resetError }}
          </v-alert>
        </v-card-text>
        <v-card-actions class="justify-end">
          <v-btn variant="text" :disabled="resetSubmitting" @click="resetDialog = false">Cancelar</v-btn>
          <v-btn color="error" variant="flat" :loading="resetSubmitting" :disabled="resetPassword.length < 8" @click="submitReset">
            Resetar senha
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </SicatPageLayout>
</template>

<style scoped>
.access-admin__metrics {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.access-admin__actions {
  display: flex;
  flex-wrap: wrap;
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
