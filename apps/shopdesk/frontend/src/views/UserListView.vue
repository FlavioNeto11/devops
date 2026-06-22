<!--
  UserListView — Usuários da loja (REQ-SHOPDESK-0002)
  Lista a EQUIPE do tenant com papel (dono/administrador/operador) e status (ativo/inativo).
  Ações: convidar (POST), editar papel (PUT) e desativar/reativar (soft-delete via PUT active=false).
  Escopado por inquilino (tenant) — o backend é a fonte da verdade do RBAC e do escopo (nega com 403).

  100% sobre o kit ui-vue · só tokens --ui-* · CSP-safe (sem style= inline / :style / v-html) · a11y · responsivo.

  CONTRATO REAL do backend (apps/shopdesk/api/src/server.js:98-102 + repositories/crud-repo.js):
    GET    /v1/users        → ENVELOPE { data, total, page, pageSize } (server-mode do useResource).
    GET    /v1/users/:id    → linha CRUA da tabela users (email/name/role/active/last_login_at).
    POST   /v1/users        → cria/convida (409 em e-mail duplicado).
    PUT    /v1/users/:id    → salva papel/status (update via PUT, NÃO PATCH).
    soft-delete             → PUT { active:false } (preserva o cadastro p/ auditoria; reversível).
  api.js normaliza last_login_at → lastLoginAt (snake→camel) p/ "Último acesso" funcionar.
  Capacidades reais do recurso decidem quais ações são oferecidas (typeof users.create/update).
-->
<template>
  <UiPageLayout
    eyebrow="Configurações · Equipe"
    title="Usuários"
    subtitle="Quem acessa esta loja. Convide pessoas, defina papéis e controle o acesso — tudo escopado por inquilino (tenant)."
    width="wide"
    :error="r.error.value"
    :retryable="true"
    @retry="r.load"
  >
    <!-- AÇÕES DE TOPO -->
    <template #actions>
      <UiButton variant="ghost" :loading="r.loading.value" @click="r.refresh">
        <template #icon-left><IconRefresh /></template>
        Atualizar
      </UiButton>
      <UiButton
        variant="subtle"
        :disabled="!filteredRows.length || r.loading.value"
        @click="exportCsv"
      >
        <template #icon-left><IconDownload /></template>
        Exportar CSV
      </UiButton>
      <!-- InviteButton: rota dedicada de convite (UserCreateView) + atalho via modal -->
      <UiButton variant="ghost" :disabled="!canInvite" to="/settings/users/new">
        Convite completo
      </UiButton>
      <UiButton variant="primary" :disabled="!canInvite" @click="openInvite">
        <template #icon-left><IconPlus /></template>
        Convidar usuário
      </UiButton>
    </template>

    <!-- BANNER: aviso honesto quando o convite/edição não está habilitado no backend -->
    <template v-if="!canInvite" #banner>
      <p class="ul-banner ul-banner--info" role="note">
        <IconInfo class="ul-banner-glyph" />
        <span>
          O convite de usuários ainda não está habilitado para esta loja. Você pode visualizar e
          exportar a equipe atual.
        </span>
      </p>
    </template>

    <!-- FILTROS (servidor: busca/papel/status; refino local de status sobre a página) -->
    <template #filters>
      <UiFiltersPanel
        v-model="filters"
        :fields="filterFields"
        @apply="applyFilters"
        @clear="onClear"
      />
    </template>

    <!-- KPIs derivados da equipe REAL carregada (página atual) -->
    <div class="ul-kpis" role="group" aria-label="Indicadores da equipe">
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

    <!-- Distribuição por papel (barra empilhada acessível) -->
    <UiCard
      v-if="!r.loading.value && kpis.count > 0"
      title="Distribuição por papel"
      :subtitle="'Composição da equipe nesta página (' + kpis.count + ' ' + (kpis.count === 1 ? 'usuário' : 'usuários') + ').'"
    >
      <div
        class="ul-dist"
        role="img"
        :aria-label="distLabel"
      >
        <span
          v-for="seg in roleDistribution"
          :key="seg.role"
          class="ul-dist-seg"
          :data-tone="roleTone(seg.role)"
          :data-grow="seg.count"
          :title="roleLabel(seg.role) + ': ' + seg.count"
        />
      </div>
      <ul class="ul-legend">
        <li v-for="seg in roleDistribution" :key="seg.role" class="ul-legend-item">
          <span class="ul-legend-dot" :data-tone="roleTone(seg.role)" aria-hidden="true" />
          <span class="ul-legend-label">{{ roleLabel(seg.role) }}</span>
          <span class="ul-legend-count">{{ seg.count }}</span>
        </li>
      </ul>
    </UiCard>

    <!-- TABELA da equipe (DataTable) -->
    <UiCard title="Equipe da loja" :subtitle="resultSummary">
      <template #actions>
        <UiStatusBadge
          v-if="hasLocalFilter"
          tone="running"
          status="Filtro local ativo"
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
        <!-- Identidade: avatar + nome + e-mail -->
        <template #cell-name="{ row }">
          <div class="ul-id">
            <span
              class="ul-avatar"
              :data-tone="roleTone(row.role)"
              :title="roleLabel(row.role)"
              aria-hidden="true"
              >{{ initials(row) }}</span
            >
            <span class="ul-id-text">
              <span class="ul-id-name">{{ row.name || 'Sem nome' }}</span>
              <span class="ul-id-email ui-mono">{{ row.email || '—' }}</span>
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
          <span :class="value ? 'ul-last' : 'ui-muted'">{{ lastAccess(value) }}</span>
        </template>

        <!-- Ações por linha -->
        <template #cell-actions="{ row }">
          <div class="ul-row-actions" @click.stop>
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

    <!-- MODAL: detalhe do usuário (GET /v1/users/:id, pré-preenchido pela linha) -->
    <UiModal v-model:open="detailOpen" :title="detailTitle" width="sm">
      <UiLoadingState v-if="detailLoading" variant="spinner" title="Carregando usuário…" />
      <UiErrorState v-else-if="detailError" :message="detailError" @retry="reloadDetail" />
      <div v-else-if="detail" class="ul-detail">
        <div class="ul-detail-head">
          <span class="ul-avatar ul-avatar--lg" :data-tone="roleTone(detail.role)" aria-hidden="true">{{
            initials(detail)
          }}</span>
          <div class="ul-detail-id">
            <p class="ul-detail-name">{{ detail.name || 'Sem nome' }}</p>
            <p class="ul-detail-email ui-mono">{{ detail.email || '—' }}</p>
          </div>
        </div>
        <dl class="ul-detail-kv">
          <div class="ul-detail-row">
            <dt>Papel</dt>
            <dd>
              <UiStatusBadge
                :status="detail.role"
                :tone="roleTone(detail.role)"
                :label="roleLabel(detail.role)"
              />
            </dd>
          </div>
          <div class="ul-detail-row">
            <dt>Status</dt>
            <dd>
              <UiStatusBadge
                :status="detail.active ? 'ativo' : 'inativo'"
                :tone="detail.active ? 'success' : 'neutral'"
                :label="detail.active ? 'Ativo' : 'Inativo'"
              />
            </dd>
          </div>
          <div class="ul-detail-row">
            <dt>Último acesso</dt>
            <dd>{{ lastAccess(detail.lastLoginAt) }}</dd>
          </div>
        </dl>
        <p class="ul-detail-note ui-muted">
          {{ roleHint(detail.role) }}
        </p>
      </div>
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

    <!-- MODAL: convidar usuário (POST /v1/users) — useForm + validação -->
    <UiModal v-model:open="inviteOpen" title="Convidar usuário" width="sm" persistent>
      <form class="ul-form" novalidate @submit.prevent="submitInvite">
        <p class="ul-form-lead ui-muted">
          A pessoa receberá um convite e acessa esta loja pelo login único (SSO). Nenhuma senha é
          criada aqui.
        </p>

        <UiFormField
          label="E-mail"
          required
          :error="inviteForm.errors.email || inviteDuplicate"
          hint="E-mail corporativo para onde o convite será enviado."
        >
          <template #default="{ id, describedBy, hasError }">
            <input
              :id="id"
              type="email"
              inputmode="email"
              autocomplete="off"
              placeholder="pessoa@empresa.com"
              :aria-invalid="(hasError || inviteDuplicate) ? 'true' : null"
              :aria-describedby="describedBy"
              :value="inviteForm.values.email"
              @input="onInviteEmail($event.target.value)"
            />
          </template>
        </UiFormField>

        <UiFormField label="Nome" :error="inviteForm.errors.name" hint="Opcional — como aparecerá na equipe.">
          <template #default="{ id, describedBy }">
            <input
              :id="id"
              type="text"
              autocomplete="off"
              placeholder="Ex.: Maria Silva"
              :aria-describedby="describedBy"
              :value="inviteForm.values.name"
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

    <!-- MODAL: editar papel (PUT /v1/users/:id) -->
    <UiModal v-model:open="roleOpen" title="Editar papel" width="sm" persistent>
      <div v-if="roleTarget" class="ul-role-edit">
        <p class="ul-role-lead">
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
        <p v-if="roleDraft === 'owner' && roleTarget.role !== 'owner'" class="ul-banner ul-banner--warn" role="alert">
          <IconAlert class="ul-banner-glyph" />
          <span>Conceder a posse (dono) dá controle total, incluindo cobrança. Confirme com cuidado.</span>
        </p>
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
import { ref, computed, h, onMounted } from 'vue';
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
// Ícones inline (SVG via render-fn — CSP-safe, sem v-html nem <img>). currentColor
// herda o tom do botão/contexto. Stroke-based, alinhados ao traço do kit.
// ---------------------------------------------------------------------------
const svg = (paths, extra = {}) =>
  () =>
    h(
      'svg',
      {
        viewBox: '0 0 24 24',
        width: 16,
        height: 16,
        fill: 'none',
        stroke: 'currentColor',
        'stroke-width': 2,
        'stroke-linecap': 'round',
        'stroke-linejoin': 'round',
        'aria-hidden': 'true',
        ...extra,
      },
      paths.map((d) => h('path', { d })),
    );
const IconRefresh = svg(['M3 12a9 9 0 0 1 15-6.7L21 8', 'M21 3v5h-5', 'M21 12a9 9 0 0 1-15 6.7L3 16', 'M3 21v-5h5']);
const IconDownload = svg(['M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4', 'M7 10l5 5 5-5', 'M12 15V3']);
const IconPlus = svg(['M12 5v14', 'M5 12h14']);
const IconInfo = svg(['M12 16v-4', 'M12 8h.01', 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z']);
const IconAlert = svg(['M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z', 'M12 9v4', 'M12 17h.01']);

// ---------------------------------------------------------------------------
// Recurso REAL: api.users (GET/GET:id/POST/PUT /v1/users — ver src/api.js, que expõe o recurso
// sobre as rotas reais do backend em api/src/server.js:98-102). Fallback DEFENSIVO: se um build
// futuro não expuser o recurso, a tela degrada graciosamente — `list` resolve uma lista vazia
// (NUNCA lança) para que o banner + tabela vazia + ações de escrita desabilitadas realmente
// apareçam, em vez do estado de erro que esconde o corpo inteiro.
// ---------------------------------------------------------------------------
const users = api.users || { list: async () => ({ data: [], total: 0 }) };
const r = useResource(users, { pageSize: 25, sort: { key: 'name', dir: 'asc' } });
const toast = useToast();
const confirm = useConfirm();

// Capacidades reais do recurso (só oferecemos a ação se o backend a suporta).
const canInvite = computed(() => typeof users.create === 'function');
const canEditRole = computed(() => typeof users.update === 'function');
const canEdit = (row) => canEditRole.value && !!row;
const canToggle = (row) => canEditRole.value && !!row;

// ---------------------------------------------------------------------------
// Papéis do domínio (enum: owner | admin | operador). Tons DEDICADOS ao papel
// (owner=running, admin=warning, operador=neutral) — alinhados aos irmãos
// UserCreateView/UserEditView, sem competir com o tom de status ativo/inativo.
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
const roleLabel = (v) => ROLE_LABELS[v] || (v ? format.humanize(v) : '—');
const roleTone = (v) => ROLE_TONES[v] || 'neutral';
const roleHint = (v) => ROLE_DESCR[v] || 'Escolha o nível de acesso.';

function initials(row) {
  const src = String((row && (row.name || row.email)) || '?').trim();
  const parts = src.replace(/@.*/, '').split(/[\s._-]+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
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
// Filtros. q/role/status vão ao servidor (ignorados com segurança se não suportados).
// O recorte por "ativo/inativo" também é refinado no cliente sobre as linhas REAIS,
// com aviso visível (o backend pode não aplicar status).
// ---------------------------------------------------------------------------
const filterFields = [
  { key: 'q', label: 'Buscar', type: 'text', placeholder: 'nome ou e-mail' },
  { key: 'role', label: 'Papel', type: 'select', options: ROLE_OPTIONS },
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

// Refino local por status sobre a página carregada (não confia que o backend tenha aplicado).
const hasLocalFilter = computed(() => !!filters.value.status);
const filteredRows = computed(() => {
  const status = filters.value.status;
  if (!status) return r.items.value;
  const wantActive = status === 'active';
  return r.items.value.filter((row) => !!row.active === wantActive);
});

// ---------------------------------------------------------------------------
// KPIs + distribuição por papel — derivados das linhas reais exibidas.
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
const roleDistribution = computed(() => {
  const rows = filteredRows.value;
  return ROLE_OPTIONS.map((o) => ({
    role: o.value,
    count: rows.filter((u) => u.role === o.value).length,
  })).filter((seg) => seg.count > 0);
});
const distLabel = computed(() =>
  'Distribuição por papel: ' +
  roleDistribution.value.map((s) => roleLabel(s.role) + ' ' + s.count).join(', '),
);
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
// Convidar usuário (POST /v1/users) — useForm com validação + dica de duplicata.
// ---------------------------------------------------------------------------
const inviteOpen = ref(false);
const inviteForm = useForm({
  initial: { email: '', name: '', role: 'operador' },
  rules: {
    email: [validators.required('Informe o e-mail.'), validators.email()],
    role: [validators.required('Escolha um papel.')],
  },
});

// Dica antecipada de duplicata sobre a página carregada (parcial por natureza — a verdade é o 409
// do servidor). Nunca bloqueia por ausência; só sinaliza um e-mail já visível na lista.
const inviteDuplicate = computed(() => {
  const val = String(inviteForm.values.email || '').trim().toLowerCase();
  if (!val) return '';
  const hit = r.items.value.find((u) => String(u.email || '').trim().toLowerCase() === val);
  return hit ? 'Este e-mail já faz parte da equipe (verificação na página atual).' : '';
});

function onInviteEmail(raw) {
  inviteForm.setField('email', String(raw || '').trim());
}
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
    const role = vals.role;
    // Conceder posse é ação sensível → confirmação explícita.
    if (role === 'owner') {
      const ok = await confirm({
        title: 'Convidar como dono?',
        message:
          'O dono tem controle total, incluindo cobrança e transferência de posse. Confirma conceder esse nível de acesso?',
        confirmLabel: 'Convidar como dono',
        cancelLabel: 'Voltar',
        danger: true,
      });
      if (!ok) return;
    }
    try {
      await users.create({
        email: vals.email.trim().toLowerCase(),
        name: (vals.name || '').trim() || undefined,
        role,
        active: true,
      });
      toast.success('Convite enviado para ' + vals.email.trim() + '.');
      inviteOpen.value = false;
      await r.refresh();
    } catch (e) {
      if (e.status === 409) {
        toast.error('Este e-mail já foi convidado.', { code: 'HTTP 409' });
      } else {
        toast.error('Falha ao enviar o convite.', {
          detail: e.message,
          code: e.status ? 'HTTP ' + e.status : '',
        });
      }
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
  // Promover a dono é sensível → confirmação destrutiva.
  if (roleDraft.value === 'owner') {
    const ok = await confirm({
      title: 'Tornar ' + (target.name || target.email) + ' dono?',
      message:
        'O dono tem controle total da loja, incluindo cobrança. Esta mudança concede o nível máximo de acesso.',
      confirmLabel: 'Tornar dono',
      cancelLabel: 'Cancelar',
      danger: true,
    });
    if (!ok) return;
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
    if (e.status === 403) {
      toast.error('Você não tem permissão para alterar este papel.', { code: 'HTTP 403' });
    } else {
      toast.error('Falha ao atualizar o papel.', {
        detail: e.message,
        code: e.status ? 'HTTP ' + e.status : '',
      });
    }
  } finally {
    roleBusy.value = false;
  }
}

// ---------------------------------------------------------------------------
// Ativar/Desativar — soft-delete REAL (PUT { active:false }; preserva o cadastro).
// Desativar é destrutivo → useConfirm. Reativar é seguro → sem confirmação.
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
        '? A pessoa deixa de conseguir entrar nesta loja até ser reativada. O cadastro é preservado.',
      confirmLabel: 'Desativar',
      cancelLabel: 'Cancelar',
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
    if (e.status === 403) {
      toast.error('Você não tem permissão para alterar o acesso deste usuário.', { code: 'HTTP 403' });
    } else {
      toast.error('Falha ao atualizar o acesso.', {
        detail: e.message,
        code: e.status ? 'HTTP ' + e.status : '',
      });
    }
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
    toast.error('Falha ao exportar CSV.', { detail: e.message });
  }
}

onMounted(r.load);
</script>

<style scoped>
/* ---- KPIs ---- */
.ul-kpis {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: var(--ui-space-4);
}

/* ---- banners ---- */
.ul-banner {
  display: flex;
  align-items: center;
  gap: var(--ui-space-2);
  margin: 0;
  padding: var(--ui-space-3) var(--ui-space-4);
  border-radius: var(--ui-radius-md);
  font-size: var(--ui-text-sm);
}
.ul-banner--info {
  border: 1px solid rgb(var(--ui-accent) / 0.35);
  background: rgb(var(--ui-accent) / 0.08);
  color: rgb(var(--ui-fg));
}
.ul-banner--warn {
  border: 1px solid rgb(var(--ui-warn) / 0.4);
  background: rgb(var(--ui-warn) / 0.1);
  color: rgb(var(--ui-warn));
  font-weight: 600;
}
.ul-banner-glyph {
  flex-shrink: 0;
  color: rgb(var(--ui-accent-strong));
}
.ul-banner--warn .ul-banner-glyph {
  color: rgb(var(--ui-warn));
}

/* ---- distribuição por papel ---- */
.ul-dist {
  display: flex;
  width: 100%;
  height: 14px;
  border-radius: var(--ui-radius-pill);
  overflow: hidden;
  background: rgb(var(--ui-surface-2));
  gap: 2px;
}
.ul-dist-seg {
  flex-grow: 1;
  flex-basis: 0;
  min-width: 6px;
  border-radius: var(--ui-radius-sm);
}
/* o peso de cada segmento vem do atributo data-grow (1..6+), evitando :style inline (CSP) */
.ul-dist-seg[data-grow="1"] { flex-grow: 1; }
.ul-dist-seg[data-grow="2"] { flex-grow: 2; }
.ul-dist-seg[data-grow="3"] { flex-grow: 3; }
.ul-dist-seg[data-grow="4"] { flex-grow: 4; }
.ul-dist-seg[data-grow="5"] { flex-grow: 5; }
.ul-dist-seg[data-grow="6"] { flex-grow: 6; }
.ul-dist-seg[data-tone="running"] { background: rgb(var(--ui-accent)); }
.ul-dist-seg[data-tone="warning"] { background: rgb(var(--ui-warn)); }
.ul-dist-seg[data-tone="neutral"] { background: rgb(var(--ui-faint)); }
.ul-legend {
  list-style: none;
  margin: var(--ui-space-3) 0 0;
  padding: 0;
  display: flex;
  flex-wrap: wrap;
  gap: var(--ui-space-4);
}
.ul-legend-item {
  display: inline-flex;
  align-items: center;
  gap: var(--ui-space-2);
  font-size: var(--ui-text-sm);
}
.ul-legend-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  flex-shrink: 0;
}
.ul-legend-dot[data-tone="running"] { background: rgb(var(--ui-accent)); }
.ul-legend-dot[data-tone="warning"] { background: rgb(var(--ui-warn)); }
.ul-legend-dot[data-tone="neutral"] { background: rgb(var(--ui-faint)); }
.ul-legend-label { color: rgb(var(--ui-fg)); }
.ul-legend-count {
  color: rgb(var(--ui-muted));
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

/* ---- identidade na tabela ---- */
.ul-id {
  display: flex;
  align-items: center;
  gap: var(--ui-space-3);
}
.ul-avatar {
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
  background: rgb(var(--ui-muted) / 0.16);
  color: rgb(var(--ui-muted));
}
.ul-avatar--lg {
  width: 48px;
  height: 48px;
  font-size: var(--ui-text-md);
}
.ul-avatar[data-tone="running"] {
  background: rgb(var(--ui-accent) / 0.16);
  color: rgb(var(--ui-accent-strong));
}
.ul-avatar[data-tone="warning"] {
  background: rgb(var(--ui-warn) / 0.18);
  color: rgb(var(--ui-warn));
}
.ul-avatar[data-tone="neutral"] {
  background: rgb(var(--ui-muted) / 0.16);
  color: rgb(var(--ui-muted));
}
.ul-id-text {
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-1);
  min-width: 0;
}
.ul-id-name {
  font-weight: 600;
  color: rgb(var(--ui-fg));
}
.ul-id-email {
  font-size: var(--ui-text-xs);
  color: rgb(var(--ui-muted));
}

.ul-last {
  font-variant-numeric: tabular-nums;
}

.ul-row-actions {
  display: inline-flex;
  gap: var(--ui-space-2);
  justify-content: flex-end;
  flex-wrap: wrap;
}

/* ---- detalhe (modal) ---- */
.ul-detail {
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-4);
}
.ul-detail-head {
  display: flex;
  align-items: center;
  gap: var(--ui-space-3);
}
.ul-detail-id {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.ul-detail-name {
  margin: 0;
  font-weight: 700;
  font-size: var(--ui-text-lg);
  color: rgb(var(--ui-fg));
}
.ul-detail-email {
  margin: 0;
  font-size: var(--ui-text-sm);
  color: rgb(var(--ui-muted));
  word-break: break-all;
}
.ul-detail-kv {
  display: grid;
  gap: var(--ui-space-1);
  margin: 0;
}
.ul-detail-row {
  display: grid;
  /* 130px: largura do rótulo da definição (dt) — sem token de dimensão equivalente (ad-hoc documentado) */
  grid-template-columns: 130px 1fr;
  gap: var(--ui-space-3);
  align-items: center;
  padding: var(--ui-space-2) 0;
  border-bottom: 1px solid rgb(var(--ui-border));
}
.ul-detail-row:last-child {
  border-bottom: none;
}
.ul-detail-kv dt {
  color: rgb(var(--ui-muted));
  font-size: var(--ui-text-sm);
  font-weight: 600;
}
.ul-detail-kv dd {
  margin: 0;
}
.ul-detail-note {
  margin: 0;
  font-size: var(--ui-text-xs);
  line-height: 1.5;
}

/* ---- formulários (modais) ---- */
.ul-form {
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-4);
}
.ul-form-lead {
  margin: 0;
  font-size: var(--ui-text-sm);
  line-height: 1.5;
}
.ul-role-edit {
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-4);
}
.ul-role-lead {
  margin: 0;
  color: rgb(var(--ui-fg));
}

/* ---- responsivo ---- */
@media (max-width: 980px) {
  .ul-kpis {
    grid-template-columns: repeat(2, 1fr);
  }
}
@media (max-width: 560px) {
  .ul-kpis {
    grid-template-columns: 1fr;
  }
  .ul-detail-row {
    grid-template-columns: 1fr;
    gap: var(--ui-space-1);
  }
}
</style>
