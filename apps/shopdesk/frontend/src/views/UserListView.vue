<template>
  <UiPageLayout
    eyebrow="Configurações da loja"
    title="Usuários"
    subtitle="Gerencie quem acessa esta loja: convide pessoas, defina papéis e controle o acesso. Escopado por inquilino (tenant)."
    width="wide"
    :error="r.error.value"
    @retry="r.load"
  >
    <!-- Ações do cabeçalho -->
    <template #actions>
      <UiButton variant="ghost" :loading="r.loading.value" @click="r.refresh">
        <template #icon-left><span aria-hidden="true">↻</span></template>
        Atualizar
      </UiButton>
      <UiButton
        variant="subtle"
        :disabled="!filteredRows.length || r.loading.value"
        @click="exportCsv"
      >
        <template #icon-left><span aria-hidden="true">⬇</span></template>
        Exportar CSV
      </UiButton>
      <!-- InviteButton: convida um novo usuário (abre o modal) -->
      <UiButton variant="primary" :disabled="!canInvite" @click="openInvite">
        <template #icon-left><span aria-hidden="true">＋</span></template>
        Convidar usuário
      </UiButton>
    </template>

    <!-- Filtros -->
    <template #filters>
      <UiFiltersPanel
        v-model="filters"
        :fields="filterFields"
        @apply="applyFilters"
        @clear="onClear"
      />
    </template>

    <!-- Aviso quando a ação de convite/edição não está disponível no backend -->
    <template v-if="!canInvite" #banner>
      <div class="users-banner" role="note">
        <span class="users-banner-icon" aria-hidden="true">ℹ</span>
        <span
          >O convite de usuários ainda não está habilitado para esta loja. Você pode visualizar e
          exportar a equipe atual.</span
        >
      </div>
    </template>

    <!-- KPIs derivados da equipe REAL carregada -->
    <div class="users-kpis" role="group" aria-label="Indicadores da equipe">
      <UiMetricCard
        label="Usuários (página)"
        :value="kpis.count"
        tone="primary"
        :hint="totalHint"
        :loading="r.loading.value"
      />
      <UiMetricCard
        label="Ativos"
        :value="kpis.active"
        tone="success"
        hint="Com acesso liberado"
        :loading="r.loading.value"
      />
      <UiMetricCard
        label="Administração"
        :value="kpis.admins"
        tone="running"
        hint="Donos e administradores"
        :loading="r.loading.value"
      />
      <UiMetricCard
        label="Inativos"
        :value="kpis.inactive"
        tone="warning"
        hint="Sem acesso à loja"
        :loading="r.loading.value"
      />
    </div>

    <!-- Tabela da equipe -->
    <UiCard title="Equipe da loja" :subtitle="resultSummary">
      <template #actions>
        <UiStatusBadge
          v-if="hasLocalFilter"
          tone="running"
          :status="'Filtro local ativo'"
          :with-dot="true"
        />
      </template>

      <UiDataTable
        :columns="columns"
        :rows="filteredRows"
        row-key="id"
        density="comfortable"
        clickable-rows
        server-mode
        :loading="r.loading.value"
        :sort="r.sort.value"
        :page="r.page.value"
        :page-size="r.pageSize.value"
        :total="r.total.value"
        paginated
        :empty="emptyState"
        @row-click="openDetail"
        @update:sort="r.setSort"
        @update:page="r.setPage"
        @update:page-size="onPageSize"
      >
        <!-- Identidade: nome + e-mail -->
        <template #cell-name="{ row }">
          <div class="users-id">
            <span
              class="users-avatar"
              :data-tone="roleTone(row.role)"
              :title="roleLabel(row.role)"
              aria-hidden="true"
              >{{ initials(row) }}</span
            >
            <span class="users-id-text">
              <span class="users-id-name">{{ row.name || 'Sem nome' }}</span>
              <span class="users-id-email ui-mono">{{ row.email || '—' }}</span>
            </span>
          </div>
        </template>

        <!-- Papel (RoleBadge) -->
        <template #cell-role="{ value }">
          <UiStatusBadge :status="value" :tone="roleTone(value)" :label="roleLabel(value)" />
        </template>

        <!-- Status (ativo/inativo) -->
        <template #cell-active="{ value }">
          <UiStatusBadge
            :status="value ? 'ativo' : 'inativo'"
            :tone="value ? 'success' : 'neutral'"
            :label="value ? 'Ativo' : 'Inativo'"
          />
        </template>

        <!-- Último acesso -->
        <template #cell-lastLoginAt="{ value }">
          <span :class="value ? 'users-last' : 'ui-muted'">{{ lastAccess(value) }}</span>
        </template>

        <!-- Ações por linha -->
        <template #cell-actions="{ row }">
          <div class="users-actions" @click.stop>
            <UiButton variant="ghost" size="sm" @click="openDetail(row)">Ver</UiButton>
            <UiButton
              variant="ghost"
              size="sm"
              :disabled="!canEdit(row)"
              @click="openRole(row)"
            >
              Editar papel
            </UiButton>
            <UiButton
              v-if="row.active"
              variant="danger"
              size="sm"
              :disabled="!canToggle(row)"
              :loading="busyId === row.id"
              @click="toggleActive(row)"
            >
              Desativar
            </UiButton>
            <UiButton
              v-else
              variant="subtle"
              size="sm"
              :disabled="!canToggle(row)"
              :loading="busyId === row.id"
              @click="toggleActive(row)"
            >
              Reativar
            </UiButton>
          </div>
        </template>

        <!-- Sem resultados -->
        <template #empty-action>
          <UiButton v-if="hasServerFilter || hasLocalFilter" variant="ghost" @click="onClear"
            >Limpar filtros</UiButton
          >
          <UiButton v-else-if="canInvite" variant="primary" @click="openInvite"
            >Convidar primeiro usuário</UiButton
          >
          <UiButton v-else variant="ghost" @click="r.load">Recarregar</UiButton>
        </template>
      </UiDataTable>
    </UiCard>

    <!-- Modal: detalhe do usuário -->
    <UiModal v-model:open="detailOpen" :title="detailTitle" width="sm">
      <UiLoadingState v-if="detailLoading" variant="spinner" />
      <UiErrorState v-else-if="detailError" :message="detailError" @retry="reloadDetail" />
      <dl v-else-if="detail" class="users-detail">
        <div class="users-detail-row">
          <dt>Nome</dt>
          <dd>{{ detail.name || '—' }}</dd>
        </div>
        <div class="users-detail-row">
          <dt>E-mail</dt>
          <dd class="ui-mono">{{ detail.email || '—' }}</dd>
        </div>
        <div class="users-detail-row">
          <dt>Papel</dt>
          <dd>
            <UiStatusBadge
              :status="detail.role"
              :tone="roleTone(detail.role)"
              :label="roleLabel(detail.role)"
            />
          </dd>
        </div>
        <div class="users-detail-row">
          <dt>Status</dt>
          <dd>
            <UiStatusBadge
              :status="detail.active ? 'ativo' : 'inativo'"
              :tone="detail.active ? 'success' : 'neutral'"
              :label="detail.active ? 'Ativo' : 'Inativo'"
            />
          </dd>
        </div>
        <div class="users-detail-row">
          <dt>Último acesso</dt>
          <dd>{{ lastAccess(detail.lastLoginAt) }}</dd>
        </div>
      </dl>
      <template #footer>
        <UiButton
          v-if="detail && canEdit(detail)"
          variant="ghost"
          @click="openRole(detail)"
          >Editar papel</UiButton
        >
        <UiButton
          v-if="detail && canToggle(detail)"
          :variant="detail.active ? 'danger' : 'subtle'"
          :loading="busyId === detail.id"
          @click="toggleActive(detail)"
          >{{ detail.active ? 'Desativar' : 'Reativar' }}</UiButton
        >
        <UiButton variant="primary" @click="detailOpen = false">Fechar</UiButton>
      </template>
    </UiModal>

    <!-- Modal: convidar usuário -->
    <UiModal v-model:open="inviteOpen" title="Convidar usuário" width="sm" persistent>
      <form class="users-form" novalidate @submit.prevent="submitInvite">
        <UiFormField
          label="E-mail"
          required
          :error="inviteForm.errors.email"
          hint="A pessoa receberá um convite para acessar esta loja."
        >
          <template #default="{ id, describedBy }">
            <input
              :id="id"
              type="email"
              autocomplete="email"
              :aria-describedby="describedBy"
              :value="inviteForm.values.email"
              placeholder="pessoa@empresa.com"
              @input="inviteForm.setField('email', $event.target.value)"
            />
          </template>
        </UiFormField>

        <UiFormField label="Nome" :error="inviteForm.errors.name" hint="Opcional.">
          <template #default="{ id, describedBy }">
            <input
              :id="id"
              type="text"
              autocomplete="name"
              :aria-describedby="describedBy"
              :value="inviteForm.values.name"
              placeholder="Nome da pessoa"
              @input="inviteForm.setField('name', $event.target.value)"
            />
          </template>
        </UiFormField>

        <UiFormField
          label="Papel"
          required
          :error="inviteForm.errors.role"
          :hint="roleHint(inviteForm.values.role)"
        >
          <template #default="{ id, describedBy }">
            <select
              :id="id"
              :aria-describedby="describedBy"
              :value="inviteForm.values.role"
              @change="inviteForm.setField('role', $event.target.value)"
            >
              <option v-for="opt in ROLE_OPTIONS" :key="opt.value" :value="opt.value">
                {{ opt.label }}
              </option>
            </select>
          </template>
        </UiFormField>
      </form>
      <template #footer>
        <UiButton variant="ghost" :disabled="inviteForm.submitting.value" @click="inviteOpen = false"
          >Cancelar</UiButton
        >
        <UiButton variant="primary" :loading="inviteForm.submitting.value" @click="submitInvite"
          >Enviar convite</UiButton
        >
      </template>
    </UiModal>

    <!-- Modal: editar papel -->
    <UiModal v-model:open="roleOpen" title="Editar papel" width="sm" persistent>
      <div v-if="roleTarget" class="users-role-edit">
        <p class="users-role-lead">
          Defina o papel de
          <strong>{{ roleTarget.name || roleTarget.email }}</strong> nesta loja.
        </p>
        <UiFormField label="Papel" required :hint="roleHint(roleDraft)">
          <template #default="{ id, describedBy }">
            <select
              :id="id"
              :aria-describedby="describedBy"
              :value="roleDraft"
              @change="roleDraft = $event.target.value"
            >
              <option v-for="opt in ROLE_OPTIONS" :key="opt.value" :value="opt.value">
                {{ opt.label }}
              </option>
            </select>
          </template>
        </UiFormField>
      </div>
      <template #footer>
        <UiButton variant="ghost" :disabled="roleBusy" @click="roleOpen = false">Cancelar</UiButton>
        <UiButton
          variant="primary"
          :loading="roleBusy"
          :disabled="!roleTarget || roleDraft === (roleTarget && roleTarget.role)"
          @click="submitRole"
          >Salvar papel</UiButton
        >
      </template>
    </UiModal>
  </UiPageLayout>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import {
  UiPageLayout,
  UiCard,
  UiMetricCard,
  UiDataTable,
  UiFiltersPanel,
  UiStatusBadge,
  UiButton,
  UiModal,
  UiFormField,
  UiLoadingState,
  UiErrorState,
  useResource,
  useForm,
  useToast,
  useConfirm,
  format,
  validators,
} from '../ui/index.js';
import * as api from '../api.js';

// ---------------------------------------------------------------------------
// Recurso REAL: api.users (GET/GET:id/POST/PUT /v1/users — ver src/api.js, que
// expõe o recurso sobre as rotas reais do backend em api/src/server.js:98-102).
// Fallback DEFENSIVO: se um build futuro não expuser o recurso, a tela degrada
// graciosamente — `list` resolve uma lista vazia (NUNCA lança) para que o
// banner + tabela vazia + ações de escrita desabilitadas (canInvite/canEditRole
// false, pois create/update ausentes) realmente apareçam, em vez do estado de
// erro que esconde o corpo inteiro.
// ---------------------------------------------------------------------------
const users = api.users || {
  list: async () => ({ data: [], total: 0 }),
};
const r = useResource(users, { pageSize: 25, sort: { key: 'name', dir: 'asc' } });
const toast = useToast();
const confirm = useConfirm();

// Capacidades reais do recurso (só oferecemos a ação se o backend a suporta).
const canInvite = computed(() => typeof users.create === 'function');
const canEditRole = computed(() => typeof users.update === 'function');
const canEdit = (row) => canEditRole.value && !!row;
const canToggle = (row) => canEditRole.value && !!row;

// ---------------------------------------------------------------------------
// Papéis do domínio (enum: owner | admin | operador).
// ---------------------------------------------------------------------------
const ROLE_OPTIONS = [
  { value: 'owner', label: 'Dono' },
  { value: 'admin', label: 'Administrador' },
  { value: 'operador', label: 'Operador' },
];
const ROLE_LABELS = { owner: 'Dono', admin: 'Administrador', operador: 'Operador' };
const ROLE_TONES = { owner: 'running', admin: 'warning', operador: 'neutral' };
const ROLE_DESCR = {
  owner: 'Controle total: equipe, cobrança e configurações da loja.',
  admin: 'Gerencia produtos, pedidos e a maior parte das configurações.',
  operador: 'Opera o dia a dia (pedidos e estoque), sem acesso administrativo.',
};
const roleLabel = (v) => ROLE_LABELS[v] || format.humanize(v);
const roleTone = (v) => ROLE_TONES[v] || 'neutral';
const roleHint = (v) => ROLE_DESCR[v] || 'Escolha o nível de acesso.';

function initials(row) {
  const src = (row.name || row.email || '?').trim();
  const parts = src.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return src.slice(0, 2).toUpperCase();
}
function lastAccess(v) {
  if (!v) return 'Nunca acessou';
  return format.formatDateTime(v);
}

// ---------------------------------------------------------------------------
// Colunas.
// ---------------------------------------------------------------------------
const columns = [
  { key: 'name', label: 'Usuário', sortable: true },
  { key: 'role', label: 'Papel', sortable: true },
  { key: 'active', label: 'Status', sortable: true },
  { key: 'lastLoginAt', label: 'Último acesso', sortable: true },
  { key: 'actions', label: 'Ações', align: 'right' },
];

// ---------------------------------------------------------------------------
// Filtros. q/role/status vão ao servidor (ignorados com segurança se não
// suportados). O recorte por "ativo/inativo" também é refinado no cliente
// sobre as linhas REAIS, com aviso visível.
// ---------------------------------------------------------------------------
const filterFields = [
  { key: 'q', label: 'Buscar', type: 'text', placeholder: 'nome ou e-mail' },
  {
    key: 'role',
    label: 'Papel',
    type: 'select',
    options: ROLE_OPTIONS,
  },
  {
    key: 'status',
    label: 'Status',
    type: 'select',
    options: [
      { value: 'active', label: 'Ativos' },
      { value: 'inactive', label: 'Inativos' },
    ],
  },
];
const blankFilters = () => ({ q: '', role: '', status: '' });
const filters = ref(blankFilters());

const hasServerFilter = computed(() => !!(filters.value.q || filters.value.role));

function applyFilters() {
  r.setFilters({
    q: filters.value.q || undefined,
    role: filters.value.role || undefined,
    status: filters.value.status || undefined,
  });
}
function onClear() {
  filters.value = blankFilters();
  r.setFilters({ q: undefined, role: undefined, status: undefined });
}
function onPageSize(size) {
  r.pageSize.value = size;
  r.setPage(1);
}

// Refino local por status sobre a página carregada (não confia que o backend
// tenha aplicado o filtro de status).
const hasLocalFilter = computed(() => !!filters.value.status);
const filteredRows = computed(() => {
  const status = filters.value.status;
  if (!status) return r.items.value;
  const wantActive = status === 'active';
  return r.items.value.filter((row) => !!row.active === wantActive);
});

// ---------------------------------------------------------------------------
// KPIs derivados das linhas reais exibidas.
// ---------------------------------------------------------------------------
const kpis = computed(() => {
  const rows = filteredRows.value;
  return {
    count: rows.length,
    active: rows.filter((u) => !!u.active).length,
    inactive: rows.filter((u) => !u.active).length,
    admins: rows.filter((u) => u.role === 'owner' || u.role === 'admin').length,
  };
});
const totalHint = computed(() => (r.total.value ? r.total.value + ' no total' : 'Sem usuários'));
const resultSummary = computed(() => {
  if (r.loading.value) return 'Carregando…';
  const shown = filteredRows.value.length;
  if (!r.total.value) return 'Nenhum usuário cadastrado';
  if (hasLocalFilter.value)
    return shown + ' de ' + r.items.value.length + ' nesta página (filtro local)';
  return shown + ' nesta página · ' + r.total.value + ' no total';
});
const emptyState = computed(() =>
  hasServerFilter.value || hasLocalFilter.value
    ? {
        title: 'Nenhum usuário no filtro',
        description: 'Ajuste a busca, o papel ou o status para ver mais resultados.',
        icon: '🔍',
      }
    : {
        title: 'Nenhum usuário ainda',
        description: canInvite.value
          ? 'Convide as pessoas que vão operar esta loja.'
          : 'A equipe desta loja aparecerá aqui.',
        icon: '👥',
      },
);

// ---------------------------------------------------------------------------
// Detalhe (GET /v1/users/:id) com pré-preenchimento pela linha já carregada.
// ---------------------------------------------------------------------------
const detailOpen = ref(false);
const detail = ref(null);
const detailLoading = ref(false);
const detailError = ref('');
let lastDetailId = null;
const detailTitle = computed(() =>
  detail.value ? detail.value.name || detail.value.email || 'Usuário' : 'Usuário',
);

async function openDetail(row) {
  detailOpen.value = true;
  lastDetailId = row.id;
  detail.value = row;
  detailError.value = '';
  if (typeof users.get !== 'function') return;
  detailLoading.value = true;
  try {
    detail.value = await users.get(row.id);
  } catch (e) {
    detailError.value = e.message || 'Não foi possível carregar o usuário.';
  } finally {
    detailLoading.value = false;
  }
}
function reloadDetail() {
  if (lastDetailId != null) openDetail({ id: lastDetailId });
}

// ---------------------------------------------------------------------------
// Convidar usuário (POST /v1/users) — useForm com validação.
// ---------------------------------------------------------------------------
const inviteOpen = ref(false);
const inviteForm = useForm({
  initial: { email: '', name: '', role: 'operador' },
  rules: {
    email: [validators.required('Informe o e-mail.'), validators.email()],
    role: [validators.required('Escolha um papel.')],
  },
});

function openInvite() {
  if (!canInvite.value) {
    toast.warning('O convite de usuários não está disponível para esta loja.');
    return;
  }
  inviteForm.reset();
  inviteOpen.value = true;
}
async function submitInvite() {
  if (!canInvite.value) return;
  await inviteForm.handleSubmit(async (vals) => {
    try {
      await users.create({
        email: vals.email.trim(),
        name: (vals.name || '').trim() || undefined,
        role: vals.role,
        active: true,
      });
      toast.success('Convite enviado para ' + vals.email.trim() + '.');
      inviteOpen.value = false;
      await r.refresh();
    } catch (e) {
      toast.error('Falha ao enviar o convite', {
        detail: e.message,
        code: e.status ? 'HTTP ' + e.status : '',
      });
    }
  });
}

// ---------------------------------------------------------------------------
// Editar papel (PUT /v1/users/:id).
// ---------------------------------------------------------------------------
const roleOpen = ref(false);
const roleTarget = ref(null);
const roleDraft = ref('operador');
const roleBusy = ref(false);

function openRole(row) {
  if (!canEdit(row)) {
    toast.warning('A edição de papéis não está disponível para esta loja.');
    return;
  }
  roleTarget.value = row;
  roleDraft.value = row.role || 'operador';
  roleOpen.value = true;
}
async function submitRole() {
  const target = roleTarget.value;
  if (!target || !canEditRole.value) return;
  if (roleDraft.value === target.role) {
    roleOpen.value = false;
    return;
  }
  roleBusy.value = true;
  try {
    await users.update(target.id, { role: roleDraft.value });
    toast.success(
      'Papel de ' +
        (target.name || target.email) +
        ' atualizado para ' +
        roleLabel(roleDraft.value) +
        '.',
    );
    if (detail.value && detail.value.id === target.id) {
      detail.value = { ...detail.value, role: roleDraft.value };
    }
    roleOpen.value = false;
    await r.refresh();
  } catch (e) {
    toast.error('Falha ao atualizar o papel', {
      detail: e.message,
      code: e.status ? 'HTTP ' + e.status : '',
    });
  } finally {
    roleBusy.value = false;
  }
}

// ---------------------------------------------------------------------------
// Ativar/Desativar (ação destrutiva ao desativar) — useConfirm + PUT.
// ---------------------------------------------------------------------------
const busyId = ref(null);
async function toggleActive(row) {
  if (!canToggle(row)) return;
  const deactivating = !!row.active;
  if (deactivating) {
    const ok = await confirm({
      title: 'Desativar usuário',
      message:
        'Desativar o acesso de ' +
        (row.name || row.email) +
        '? A pessoa deixa de conseguir entrar nesta loja até ser reativada.',
      confirmLabel: 'Desativar',
      danger: true,
    });
    if (!ok) return;
  }
  busyId.value = row.id;
  try {
    await users.update(row.id, { active: !row.active });
    toast.success(
      (row.name || row.email) + (deactivating ? ' foi desativado.' : ' foi reativado.'),
    );
    if (detail.value && detail.value.id === row.id) {
      detail.value = { ...detail.value, active: !row.active };
    }
    await r.refresh();
  } catch (e) {
    toast.error('Falha ao atualizar o acesso', {
      detail: e.message,
      code: e.status ? 'HTTP ' + e.status : '',
    });
  } finally {
    busyId.value = null;
  }
}

// ---------------------------------------------------------------------------
// Exportar CSV (cliente, sobre as linhas filtradas; CSP-safe via Blob).
// ---------------------------------------------------------------------------
function csvCell(v) {
  const s = v == null ? '' : String(v);
  return /[",\n;]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
function exportCsv() {
  const rows = filteredRows.value;
  if (!rows.length) {
    toast.warning('Nada para exportar.');
    return;
  }
  const head = ['Nome', 'E-mail', 'Papel', 'Status', 'Último acesso'];
  const lines = [head.join(';')];
  for (const u of rows) {
    lines.push(
      [
        csvCell(u.name),
        csvCell(u.email),
        csvCell(roleLabel(u.role)),
        csvCell(u.active ? 'Ativo' : 'Inativo'),
        csvCell(u.lastLoginAt || ''),
      ].join(';'),
    );
  }
  try {
    const blob = new Blob(['﻿' + lines.join('\r\n')], {
      type: 'text/csv;charset=utf-8;',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'usuarios-' + new Date().toISOString().slice(0, 10) + '.csv';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast.success('CSV exportado (' + rows.length + ' usuários).');
  } catch (e) {
    toast.error('Falha ao exportar CSV', { detail: e.message });
  }
}

onMounted(r.load);
</script>

<style scoped>
.users-kpis {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: var(--ui-space-4);
}

.users-banner {
  display: flex;
  align-items: center;
  gap: var(--ui-space-2);
  background: rgb(var(--ui-surface-2));
  border: 1px solid rgb(var(--ui-border));
  border-radius: var(--ui-radius-md);
  padding: var(--ui-space-3) var(--ui-space-4);
  color: rgb(var(--ui-muted));
  font-size: var(--ui-text-sm);
}
.users-banner-icon {
  color: rgb(var(--ui-accent-strong));
  font-weight: 700;
}

.users-id {
  display: flex;
  align-items: center;
  gap: var(--ui-space-3);
}
.users-avatar {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  /* 34px: tamanho de avatar — sem token de dimensão equivalente na escala --ui-* (ad-hoc documentado) */
  width: 34px;
  height: 34px;
  flex-shrink: 0;
  border-radius: var(--ui-radius-pill);
  font-size: var(--ui-text-xs);
  font-weight: 700;
  /* 0.02em: tracking fino das iniciais — sem token de letter-spacing na escala (ad-hoc documentado) */
  letter-spacing: 0.02em;
}
.users-avatar[data-tone="running"] {
  background: rgb(var(--ui-accent) / 0.16);
  color: rgb(var(--ui-accent-strong));
}
.users-avatar[data-tone="warning"] {
  background: rgb(var(--ui-warn) / 0.18);
  color: rgb(var(--ui-warn));
}
.users-avatar[data-tone="neutral"] {
  background: rgb(var(--ui-muted) / 0.16);
  color: rgb(var(--ui-muted));
}
.users-id-text {
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-1);
  min-width: 0;
}
.users-id-name {
  font-weight: 600;
  color: rgb(var(--ui-fg));
}
/* monoespaçado reutiliza o utilitário global .ui-mono (ui.css), sem duplicar a family */
.users-id-email {
  font-size: var(--ui-text-xs);
  color: rgb(var(--ui-muted));
}

.users-last {
  font-variant-numeric: tabular-nums;
}

.users-actions {
  display: inline-flex;
  gap: var(--ui-space-2);
  justify-content: flex-end;
  flex-wrap: wrap;
}

.users-detail {
  display: grid;
  gap: var(--ui-space-1);
  margin: 0;
}
.users-detail-row {
  display: grid;
  /* 130px: largura do rótulo da definição (dt) — sem token de dimensão equivalente (ad-hoc documentado) */
  grid-template-columns: 130px 1fr;
  gap: var(--ui-space-3);
  align-items: center;
  padding: var(--ui-space-2) 0;
  border-bottom: 1px solid rgb(var(--ui-border));
}
.users-detail-row:last-child {
  border-bottom: none;
}
.users-detail dt {
  color: rgb(var(--ui-muted));
  font-size: var(--ui-text-sm);
  font-weight: 600;
}
.users-detail dd {
  margin: 0;
}

.users-form {
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-4);
}

.users-role-edit {
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-4);
}
.users-role-lead {
  margin: 0;
  color: rgb(var(--ui-fg));
}

@media (max-width: 980px) {
  .users-kpis {
    grid-template-columns: repeat(2, 1fr);
  }
}
@media (max-width: 560px) {
  .users-kpis {
    grid-template-columns: 1fr;
  }
  .users-detail-row {
    grid-template-columns: 1fr;
    gap: var(--ui-space-1);
  }
}
</style>
