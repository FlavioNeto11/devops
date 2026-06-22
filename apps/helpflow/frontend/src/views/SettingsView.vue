<template>
  <UiPageLayout
    eyebrow="Workspace e tenant"
    title="Configurações"
    subtitle="Sua identidade no service desk, o tenant ativo, os papéis de acesso (RBAC) e as preferências deste navegador."
    width="wide"
    :loading="firstLoad"
    loading-message="Carregando seu perfil e o workspace…"
    :error="pageError"
    @retry="loadAll"
  >
    <template #actions>
      <UiButton variant="ghost" :loading="reloading" @click="reload">
        <template #icon-left><span class="st-ico" aria-hidden="true">↻</span></template>
        Recarregar
      </UiButton>
      <UiButton to="/tickets">Ir para chamados</UiButton>
    </template>

    <!-- Aviso: agentsError não derruba a página inteira; vira banner não-bloqueante -->
    <template #banner>
      <div v-if="agentsError && !firstLoad" class="st-alert" role="status">
        <span class="st-alert-ico" aria-hidden="true">!</span>
        <span class="st-alert-txt">
          Não foi possível carregar a equipe deste workspace — papéis e tenants podem estar incompletos.
        </span>
        <UiButton variant="subtle" size="sm" :loading="agentsLoading" @click="loadAgents">Tentar de novo</UiButton>
      </div>
    </template>

    <!-- ===================== Resumo em KPIs ===================== -->
    <section class="st-kpis" aria-label="Resumo da sessão">
      <UiMetricCard
        label="Tenant ativo"
        :value="'#' + activeTenant"
        :hint="tenants.length ? (tenants.length + (tenants.length === 1 ? ' workspace visível' : ' workspaces visíveis')) : 'Persistido neste navegador'"
        tone="primary"
      />
      <UiMetricCard
        label="Seu papel (RBAC)"
        :value="roleLabel(effectiveRole)"
        :hint="effectiveCapabilities.length + ' de ' + CAPABILITIES.length + ' permissões'"
        :tone="metricToneForRole(effectiveRole)"
      />
      <UiMetricCard
        label="Sessão"
        :value="sessionActive ? 'Autenticada' : 'Anônima'"
        :hint="sessionActive ? 'Via SSO (OIDC) na borda' : 'Sem identidade da borda'"
        :tone="sessionActive ? 'success' : 'neutral'"
      />
      <UiMetricCard
        label="Cadastro de agente"
        :value="matchedAgent ? '#' + matchedAgent.id : '—'"
        :hint="matchedAgent ? 'Vinculado neste tenant' : 'Sem agente correspondente'"
        :tone="matchedAgent ? 'success' : 'warning'"
        :clickable="!!matchedAgent"
        @click="goToAgent"
      />
    </section>

    <!-- ===================== Identidade + tenant em destaque ===================== -->
    <section class="st-top">
      <!-- ---------- ProfileCard ---------- -->
      <UiCard class="st-profile" title="Sua identidade" subtitle="Sessão autenticada via SSO (OIDC) na borda da plataforma.">
        <template #actions>
          <UiStatusBadge
            :status="sessionActive ? 'active' : 'inactive'"
            :tone="sessionActive ? 'success' : 'neutral'"
            :label="sessionActive ? 'Sessão ativa' : 'Não autenticado'"
          />
        </template>

        <div class="st-profile-body">
          <span class="st-avatar" aria-hidden="true">{{ userInitials }}</span>
          <div class="st-identity">
            <p class="st-identity-name">{{ displayName }}</p>
            <p class="st-identity-mail">
              <span v-if="me && me.email">{{ me.email }}</span>
              <span v-else class="st-faint">Sem e-mail na sessão</span>
            </p>
            <div class="st-identity-tags">
              <UiStatusBadge
                :status="effectiveRole"
                :tone="roleTone(effectiveRole)"
                :label="roleLabel(effectiveRole)"
              />
              <span v-if="teamId != null" class="st-chip">{{ teamLabel(teamId) }}</span>
              <span class="st-chip st-chip-soft">Tenant ativo #{{ activeTenant }}</span>
            </div>
          </div>
        </div>

        <dl class="st-dl">
          <div class="st-dl-row">
            <dt>Papel efetivo (RBAC)</dt>
            <dd>
              <UiStatusBadge :status="effectiveRole" :tone="roleTone(effectiveRole)" :label="roleLabel(effectiveRole)" />
              <span class="st-faint st-role-src"> · {{ roleSourceLabel }}</span>
            </dd>
          </div>
          <div class="st-dl-row">
            <dt>Grupos do SSO</dt>
            <dd>
              <span v-if="me && me.role" class="ui-mono st-groups">{{ me.role }}</span>
              <span v-else class="st-faint">Nenhum grupo informado pela borda</span>
            </dd>
          </div>
          <div class="st-dl-row">
            <dt>Cadastro no service desk</dt>
            <dd>
              <span v-if="matchedAgent">
                Vinculado ao agente <span class="ui-mono">#{{ matchedAgent.id }}</span>
                <UiButton variant="ghost" size="sm" :to="'/agents/' + matchedAgent.id" class="st-inline-link">Ver cadastro</UiButton>
              </span>
              <span v-else class="st-faint">Sem agente correspondente neste tenant</span>
            </dd>
          </div>
          <div class="st-dl-row">
            <dt>Último acesso registrado</dt>
            <dd>{{ matchedAgent ? lastAccess(matchedAgent.last_login_at) : '—' }}</dd>
          </div>
        </dl>
      </UiCard>

      <!-- ---------- TenantSwitcher ---------- -->
      <UiCard class="st-tenant" title="Tenant ativo" subtitle="Espaço de trabalho que filtra todos os dados (multi-tenant).">
        <template #actions>
          <UiButton variant="subtle" size="sm" :disabled="agentsLoading || !tenants.length" @click="openTenantPicker">
            Trocar
          </UiButton>
        </template>

        <!-- estado: carregando os tenants -->
        <UiLoadingState v-if="agentsLoading && !tenants.length" variant="skeleton" :skeleton-lines="4" />

        <!-- estado: erro ao carregar agentes (fonte dos tenants) e sem nada para mostrar -->
        <UiErrorState
          v-else-if="agentsError && !tenants.length"
          :message="agentsError"
          :retryable="true"
          @retry="loadAgents"
        />

        <!-- estado: vazio -->
        <UiEmptyState
          v-else-if="!tenants.length"
          icon="building"
          title="Nenhum tenant visível"
          description="Não há agentes cadastrados para inferir os workspaces disponíveis para você."
          compact
        >
          <template #action>
            <UiButton variant="ghost" size="sm" to="/agents">Ver agentes</UiButton>
          </template>
        </UiEmptyState>

        <!-- estado: normal -->
        <div v-else class="st-tenant-body">
          <ul class="st-tenant-list">
            <li v-for="t in tenants" :key="t.id">
              <button
                type="button"
                class="st-tenant-item"
                :data-active="t.id === activeTenant ? 'true' : null"
                :aria-pressed="String(t.id === activeTenant)"
                @click="chooseTenant(t.id)"
              >
                <span class="st-tenant-mark" aria-hidden="true">{{ tenantInitials(t) }}</span>
                <span class="st-tenant-meta">
                  <span class="st-tenant-name">{{ t.label }}</span>
                  <span class="st-tenant-sub">{{ t.agentCount }} {{ t.agentCount === 1 ? 'agente' : 'agentes' }}</span>
                </span>
                <span v-if="t.id === activeTenant" class="st-tenant-current" aria-hidden="true">✓</span>
              </button>
            </li>
          </ul>
          <p class="st-tenant-hint">
            A escolha é guardada neste navegador e enviada como cabeçalho de tenant nas próximas requisições.
          </p>
        </div>
      </UiCard>
    </section>

    <!-- ===================== RoleMatrix ===================== -->
    <UiCard
      title="Papéis e permissões (RBAC)"
      subtitle="O que cada papel pode fazer no service desk. Seu papel está destacado."
    >
      <template #actions>
        <UiStatusBadge :status="effectiveRole" :tone="roleTone(effectiveRole)" :label="'Você: ' + roleLabel(effectiveRole)" />
      </template>

      <div class="st-matrix-scroll">
        <table class="st-matrix">
          <caption class="st-sr">Matriz de permissões por papel do service desk</caption>
          <thead>
            <tr>
              <th scope="col" class="st-matrix-cap">Permissão</th>
              <th
                v-for="role in ROLES"
                :key="role.value"
                scope="col"
                class="st-matrix-role"
                :data-me="role.value === effectiveRole ? 'true' : null"
              >
                <span class="st-matrix-rolename">{{ role.label }}</span>
                <span v-if="role.value === effectiveRole" class="st-matrix-you">você</span>
              </th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="cap in CAPABILITIES" :key="cap.key">
              <th scope="row" class="st-matrix-cap">
                <span class="st-cap-label">{{ cap.label }}</span>
                <span class="st-cap-desc">{{ cap.description }}</span>
              </th>
              <td
                v-for="role in ROLES"
                :key="role.value"
                class="st-matrix-cell"
                :data-me="role.value === effectiveRole ? 'true' : null"
                :data-on="cap.roles.includes(role.value) ? 'true' : 'false'"
              >
                <span class="st-allow">
                  <span class="st-allow-mark" aria-hidden="true">{{ cap.roles.includes(role.value) ? '✓' : '—' }}</span>
                  <span class="st-sr">{{ cap.roles.includes(role.value) ? 'Permitido' : 'Bloqueado' }}</span>
                </span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </UiCard>

    <!-- ===================== PreferencesForm ===================== -->
    <UiCard title="Preferências do aplicativo" subtitle="Ajustes pessoais salvos neste navegador (persistência de sessão).">
      <form class="st-prefs" novalidate @submit.prevent="savePreferences">
        <UiFormSection
          title="Aparência e listas"
          description="Como o HelpFlow se apresenta para você."
          :columns="2"
        >
          <UiFormField label="Tema" hint="Claro, escuro ou seguir o sistema operacional.">
            <template #default="{ id, describedBy }">
              <select :id="id" v-model="prefs.theme" :aria-describedby="describedBy">
                <option value="system">Seguir o sistema</option>
                <option value="light">Claro</option>
                <option value="dark">Escuro</option>
              </select>
            </template>
          </UiFormField>

          <UiFormField label="Densidade das tabelas" hint="Compacta mostra mais linhas por tela.">
            <template #default="{ id, describedBy }">
              <select :id="id" v-model="prefs.density" :aria-describedby="describedBy">
                <option value="comfortable">Confortável</option>
                <option value="compact">Compacta</option>
              </select>
            </template>
          </UiFormField>

          <UiFormField
            label="Itens por página"
            :error="errors.pageSize"
            hint="Entre 5 e 100 registros por página nas listas."
          >
            <template #default="{ id, describedBy, hasError }">
              <input
                :id="id"
                v-model.number="prefs.pageSize"
                type="number"
                min="5"
                max="100"
                step="5"
                inputmode="numeric"
                :aria-invalid="hasError ? 'true' : null"
                :aria-describedby="describedBy"
              />
            </template>
          </UiFormField>

          <UiFormField label="Tela inicial" hint="Para onde ir ao abrir o HelpFlow.">
            <template #default="{ id, describedBy }">
              <select :id="id" v-model="prefs.landing" :aria-describedby="describedBy">
                <option v-for="o in LANDING_OPTIONS" :key="o.value" :value="o.value">{{ o.label }}</option>
              </select>
            </template>
          </UiFormField>
        </UiFormSection>

        <UiFormSection
          title="Notificações"
          description="Avisos exibidos enquanto você usa o service desk."
          :columns="1"
        >
          <UiFormField>
            <template #default="{ id }">
              <label :for="id" class="st-check">
                <input :id="id" v-model="prefs.notifyNewTickets" type="checkbox" />
                <span>Avisar quando novos chamados forem atribuídos a mim</span>
              </label>
            </template>
          </UiFormField>
          <UiFormField>
            <template #default="{ id }">
              <label :for="id" class="st-check">
                <input :id="id" v-model="prefs.notifySla" type="checkbox" />
                <span>Avisar quando um chamado estiver perto de violar o SLA</span>
              </label>
            </template>
          </UiFormField>
        </UiFormSection>

        <footer class="st-prefs-foot">
          <p class="st-prefs-status" role="status">
            <span v-if="dirty" class="st-warn">Alterações não salvas.</span>
            <span v-else class="st-faint">Tudo salvo.</span>
          </p>
          <div class="st-prefs-actions">
            <UiButton variant="ghost" type="button" :disabled="!dirty" @click="resetPreferences">Descartar</UiButton>
            <UiButton variant="danger" type="button" @click="restoreDefaults">Restaurar padrões</UiButton>
            <UiButton variant="primary" type="submit" :disabled="!dirty || !!errors.pageSize">Salvar preferências</UiButton>
          </div>
        </footer>
      </form>
    </UiCard>

    <template #footer>
      Tenant ativo <span class="ui-mono">#{{ activeTenant }}</span> · sessão {{ sessionActive ? 'autenticada' : 'anônima' }} ·
      papel <span class="ui-mono">{{ effectiveRole }}</span>.
    </template>

    <!-- ===================== Modal: trocar tenant ===================== -->
    <UiModal v-model="tenantPickerOpen" title="Trocar tenant ativo" width="sm">
      <p class="st-modal-lead">
        Selecione o workspace que será usado para filtrar chamados, agentes e demais dados.
      </p>
      <div class="st-modal-list" role="radiogroup" aria-label="Tenants disponíveis">
        <button
          v-for="t in tenants"
          :key="t.id"
          type="button"
          role="radio"
          class="st-tenant-item"
          :data-active="t.id === pendingTenant ? 'true' : null"
          :aria-checked="String(t.id === pendingTenant)"
          @click="pendingTenant = t.id"
        >
          <span class="st-tenant-mark" aria-hidden="true">{{ tenantInitials(t) }}</span>
          <span class="st-tenant-meta">
            <span class="st-tenant-name">{{ t.label }}</span>
            <span class="st-tenant-sub">{{ t.agentCount }} {{ t.agentCount === 1 ? 'agente' : 'agentes' }}</span>
          </span>
          <span v-if="t.id === activeTenant" class="st-tenant-current st-tenant-current-soft" aria-hidden="true">atual</span>
        </button>
      </div>
      <template #footer>
        <UiButton variant="ghost" @click="tenantPickerOpen = false">Cancelar</UiButton>
        <UiButton
          variant="primary"
          :disabled="pendingTenant === activeTenant"
          @click="confirmTenant"
        >Definir como ativo</UiButton>
      </template>
    </UiModal>
  </UiPageLayout>
</template>

<script setup>
import { ref, reactive, computed, watch, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import {
  UiPageLayout,
  UiCard,
  UiMetricCard,
  UiButton,
  UiStatusBadge,
  UiModal,
  UiFormField,
  UiFormSection,
  UiLoadingState,
  UiErrorState,
  UiEmptyState,
  useToast,
  useConfirm,
  format,
} from '../ui/index.js';
import { agents as agentsApi } from '../api.js';

const router = useRouter();
const toast = useToast();
const ask = useConfirm();

/* ---------------------------------------------------------------------------
 * Endpoints REAIS:
 *  - GET /me           → identidade da borda SSO (email, name, role/groups)
 *  - GET /v1/agents    → equipe; usada p/ derivar tenants (tenant_id) e o agente do usuário
 * Não existe GET /v1/tenants montado no backend → os tenants são DERIVADOS dos
 * agentes e a escolha do tenant ativo é persistida neste navegador (sessão).
 * O catálogo /v1/agents é o recurso de domínio do api.js (não placeholder).
 * ------------------------------------------------------------------------- */
const API_BASE = import.meta.env.VITE_API_BASE_URL || '/helpflow/api';

const STORAGE_PREFS = 'helpflow.settings.prefs';
const STORAGE_TENANT = 'helpflow.settings.activeTenant';

// --- Papéis RBAC (enum canônico da entidade `agents`) ---
const ROLES = [
  { value: 'admin', label: 'Admin', tone: 'error' },
  { value: 'supervisor', label: 'Supervisor', tone: 'warning' },
  { value: 'agent', label: 'Agente', tone: 'running' },
  { value: 'viewer', label: 'Leitor', tone: 'neutral' },
];
const ROLE_MAP = ROLES.reduce((acc, r) => { acc[r.value] = r; return acc; }, {});
const ROLE_RANK = { admin: 4, supervisor: 3, agent: 2, viewer: 1 };

// Matriz de capacidades (modelo de RBAC do service desk). Cada capability lista
// os papéis que a possuem — estável e legível, destacando o papel do usuário.
const CAPABILITIES = [
  { key: 'view', label: 'Ver chamados', description: 'Acessar a fila e o histórico de atendimentos.', roles: ['admin', 'supervisor', 'agent', 'viewer'] },
  { key: 'comment', label: 'Comentar e responder', description: 'Interagir com clientes e notas internas.', roles: ['admin', 'supervisor', 'agent'] },
  { key: 'assign', label: 'Atribuir e priorizar', description: 'Encaminhar chamados e ajustar prioridade.', roles: ['admin', 'supervisor', 'agent'] },
  { key: 'team', label: 'Gerir times e SLA', description: 'Configurar times, políticas de SLA e escalonamento.', roles: ['admin', 'supervisor'] },
  { key: 'kb', label: 'Publicar base de conhecimento', description: 'Criar e revisar artigos da base.', roles: ['admin', 'supervisor'] },
  { key: 'admin', label: 'Administrar workspace', description: 'Agentes, integrações e configurações do tenant.', roles: ['admin'] },
];

const LANDING_OPTIONS = [
  { value: '/', label: 'Painel' },
  { value: '/tickets', label: 'Chamados' },
  { value: '/customers', label: 'Solicitantes' },
  { value: '/kb-articles', label: 'Base de conhecimento' },
  { value: '/agents', label: 'Agentes' },
];

// ---- estado da identidade ----
const me = ref(null);

// ---- estado dos agentes (fonte dos tenants) ----
const agents = ref([]);
const agentsLoading = ref(false);
const agentsError = ref('');

// ---- estado geral de carregamento da página ----
const firstLoad = ref(true);
const reloading = ref(false);
const pageError = ref(null);

// ---- tenant ativo (persistido) ----
const activeTenant = ref(loadActiveTenant());

const sessionActive = computed(() => !!(me.value && me.value.email));
const displayName = computed(() => {
  if (me.value && me.value.name) return me.value.name;
  if (me.value && me.value.email) return me.value.email.split('@')[0];
  return 'Visitante';
});
const userInitials = computed(() => {
  const base = (me.value && (me.value.name || me.value.email)) || '';
  const parts = String(base).replace(/@.*/, '').trim().split(/[\s._-]+/).filter(Boolean);
  if (!parts.length) return '?';
  const first = parts[0][0] || '';
  const last = parts.length > 1 ? parts[parts.length - 1][0] : '';
  return (first + last).toUpperCase();
});

// Agente correspondente ao usuário logado (por e-mail, dentro do tenant ativo quando possível).
const matchedAgent = computed(() => {
  const email = (me.value && me.value.email || '').toLowerCase();
  if (!email) return null;
  const list = agents.value || [];
  return (
    list.find((a) => String(a.email || '').toLowerCase() === email && Number(a.tenant_id) === Number(activeTenant.value)) ||
    list.find((a) => String(a.email || '').toLowerCase() === email) ||
    null
  );
});

const teamId = computed(() => {
  const a = matchedAgent.value;
  if (!a) return null;
  const t = a.team_id;
  return t === null || t === undefined || t === '' ? null : t;
});

// Origem do papel efetivo (agente cadastrado, grupos do SSO, ou padrão).
const roleSource = computed(() => {
  if (matchedAgent.value && ROLE_MAP[String(matchedAgent.value.role).toLowerCase()]) return 'agent';
  const groups = String(me.value && me.value.role || '').toLowerCase();
  for (const r of [...ROLES].sort((a, b) => ROLE_RANK[b.value] - ROLE_RANK[a.value])) {
    if (groups.includes(r.value) || groups.includes(r.label.toLowerCase())) return 'sso';
  }
  return 'default';
});
const roleSourceLabel = computed(() => {
  switch (roleSource.value) {
    case 'agent': return 'do cadastro de agente';
    case 'sso': return 'inferido dos grupos do SSO';
    default: return 'padrão (sem cadastro)';
  }
});

// Papel efetivo: do cadastro de agente; senão, inferido dos grupos do SSO; senão, leitor.
const effectiveRole = computed(() => {
  if (matchedAgent.value && ROLE_MAP[String(matchedAgent.value.role).toLowerCase()]) {
    return String(matchedAgent.value.role).toLowerCase();
  }
  const groups = String(me.value && me.value.role || '').toLowerCase();
  for (const r of [...ROLES].sort((a, b) => ROLE_RANK[b.value] - ROLE_RANK[a.value])) {
    if (groups.includes(r.value) || groups.includes(r.label.toLowerCase())) return r.value;
  }
  return 'viewer';
});

const effectiveCapabilities = computed(() =>
  CAPABILITIES.filter((c) => c.roles.includes(effectiveRole.value))
);

// Tenants DERIVADOS dos agentes carregados (distintos por tenant_id) + o tenant ativo.
const tenants = computed(() => {
  const map = new Map();
  for (const a of agents.value || []) {
    const id = Number(a.tenant_id);
    if (!Number.isFinite(id)) continue;
    if (!map.has(id)) map.set(id, { id, agentCount: 0 });
    map.get(id).agentCount += 1;
  }
  // garante que o tenant ativo apareça mesmo sem agentes visíveis
  if (Number.isFinite(activeTenant.value) && !map.has(activeTenant.value)) {
    map.set(activeTenant.value, { id: activeTenant.value, agentCount: 0 });
  }
  return [...map.values()]
    .sort((x, y) => x.id - y.id)
    .map((t) => ({ ...t, label: 'Tenant #' + t.id }));
});

function roleTone(role) {
  const r = ROLE_MAP[String(role).toLowerCase()];
  return r ? r.tone : 'neutral';
}
// O UiMetricCard usa o enum neutral|primary|success|warning|error|running.
// O tom 'running' do badge já existe no MetricCard; os demais (error/warning/neutral)
// também — então o mapeamento é identidade. Mantido como função p/ clareza.
function metricToneForRole(role) {
  return roleTone(role);
}
function roleLabel(role) {
  const r = ROLE_MAP[String(role).toLowerCase()];
  return r ? r.label : format.humanize(role);
}
function teamLabel(id) {
  return 'Time #' + id;
}
function lastAccess(value) {
  return value ? format.formatDateTime(value) : 'Nunca acessou';
}
function tenantInitials(t) {
  return 'T' + t.id;
}
function goToAgent() {
  if (matchedAgent.value) router.push('/agents/' + matchedAgent.value.id);
}

// ----------------------------- carregamento -----------------------------
async function loadMe() {
  // GET /me na borda — fail-soft: sem sessão, a tela continua útil (anônima).
  try {
    const res = await fetch(API_BASE + '/me', { headers: { Accept: 'application/json' } });
    if (!res.ok) { me.value = null; return; }
    const data = await res.json().catch(() => null);
    me.value = data && (data.email || data.name || data.role) ? data : null;
  } catch {
    me.value = null;
  }
}

async function loadAgents() {
  agentsLoading.value = true;
  agentsError.value = '';
  try {
    const r = await agentsApi.list({ pageSize: 200, sort: 'name', dir: 'asc' });
    agents.value = (r && r.data) || [];
  } catch (e) {
    agentsError.value = (e && e.message) || 'Não foi possível carregar a equipe.';
    agents.value = [];
  } finally {
    agentsLoading.value = false;
  }
}

async function loadAll() {
  pageError.value = null;
  try {
    // /me é fail-soft; o erro de agentes é tratado como banner não-bloqueante,
    // por isso nenhum dos dois rejeita aqui. pageError fica para falhas inesperadas.
    await Promise.all([loadMe(), loadAgents()]);
  } catch (e) {
    pageError.value = (e && e.message) || 'Falha ao carregar as configurações.';
  } finally {
    firstLoad.value = false;
  }
}

async function reload() {
  reloading.value = true;
  try {
    await loadAll();
    if (!pageError.value && !agentsError.value) toast.success('Configurações atualizadas.');
    else if (agentsError.value) toast.warning('Atualizado, mas a equipe não carregou.', { detail: agentsError.value });
  } catch (e) {
    toast.error('Não foi possível atualizar.', { detail: e && e.message });
  } finally {
    reloading.value = false;
  }
}

// ----------------------------- tenant switching -----------------------------
const tenantPickerOpen = ref(false);
const pendingTenant = ref(activeTenant.value);

function openTenantPicker() {
  pendingTenant.value = activeTenant.value;
  tenantPickerOpen.value = true;
}
function chooseTenant(id) {
  if (id === activeTenant.value) return;
  pendingTenant.value = id;
  applyTenant(id);
}
function confirmTenant() {
  applyTenant(pendingTenant.value);
  tenantPickerOpen.value = false;
}
function applyTenant(id) {
  if (!Number.isFinite(id) || id === activeTenant.value) return;
  activeTenant.value = id;
  try { localStorage.setItem(STORAGE_TENANT, String(id)); } catch { /* storage indisponível */ }
  toast.success('Tenant ativo: #' + id + '.', { detail: 'Aplicado às próximas requisições deste navegador.' });
}
function loadActiveTenant() {
  let raw = null;
  try { raw = localStorage.getItem(STORAGE_TENANT); } catch { raw = null; }
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : 1;
}

// ----------------------------- preferências -----------------------------
const DEFAULT_PREFS = {
  theme: 'system',
  density: 'comfortable',
  pageSize: 25,
  landing: '/',
  notifyNewTickets: true,
  notifySla: true,
};

function loadPrefs() {
  let stored = {};
  try {
    const raw = localStorage.getItem(STORAGE_PREFS);
    if (raw) stored = JSON.parse(raw) || {};
  } catch {
    stored = {};
  }
  return { ...DEFAULT_PREFS, ...stored };
}

const savedSnapshot = ref(JSON.stringify(loadPrefs()));
const prefs = reactive(loadPrefs());
const errors = reactive({ pageSize: '' });

const dirty = computed(() => JSON.stringify(prefs) !== savedSnapshot.value);

watch(
  () => prefs.pageSize,
  (v) => {
    const n = Number(v);
    if (!Number.isFinite(n) || n < 5 || n > 100) {
      errors.pageSize = 'Informe um valor entre 5 e 100.';
    } else {
      errors.pageSize = '';
    }
  },
  { immediate: true }
);

function applyThemePreference(theme) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  if (theme === 'light') root.setAttribute('data-theme', 'light');
  else if (theme === 'dark') root.setAttribute('data-theme', 'dark');
  else root.removeAttribute('data-theme');
  // mantém a casca (UiAppShell) sincronizada via a mesma chave de tema
  try {
    if (theme === 'system') localStorage.removeItem('theme');
    else localStorage.setItem('theme', theme);
  } catch { /* storage indisponível */ }
}

function savePreferences() {
  if (errors.pageSize) {
    toast.error('Corrija os campos destacados antes de salvar.');
    return;
  }
  try {
    localStorage.setItem(STORAGE_PREFS, JSON.stringify({ ...prefs }));
    savedSnapshot.value = JSON.stringify({ ...prefs });
    applyThemePreference(prefs.theme);
    toast.success('Preferências salvas.', { detail: 'Valem para este navegador.' });
  } catch (e) {
    toast.error('Não foi possível salvar as preferências.', { detail: e && e.message });
  }
}

function resetPreferences() {
  const restored = JSON.parse(savedSnapshot.value);
  Object.assign(prefs, restored);
}

async function restoreDefaults() {
  const ok = await ask({
    title: 'Restaurar padrões',
    message: 'Voltar todas as preferências deste navegador para os valores de fábrica? As preferências salvas serão substituídas.',
    confirmLabel: 'Restaurar',
    danger: true,
  });
  if (!ok) return;
  Object.assign(prefs, DEFAULT_PREFS);
  try {
    localStorage.setItem(STORAGE_PREFS, JSON.stringify({ ...DEFAULT_PREFS }));
    savedSnapshot.value = JSON.stringify({ ...DEFAULT_PREFS });
    applyThemePreference(DEFAULT_PREFS.theme);
    toast.success('Preferências restauradas para o padrão.');
  } catch (e) {
    toast.error('Não foi possível restaurar.', { detail: e && e.message });
  }
}

onMounted(loadAll);
</script>

<style scoped>
.st-ico { font-size: 1.05em; line-height: 1; }
.st-faint { color: rgb(var(--ui-muted)); font-style: italic; }
.st-warn { color: rgb(var(--ui-warn)); font-weight: 600; }
.st-role-src { font-style: normal; font-size: var(--ui-text-xs); }

/* leitor de tela apenas */
.st-sr {
  position: absolute;
  width: 1px; height: 1px;
  padding: 0; margin: -1px;
  overflow: hidden; clip: rect(0 0 0 0);
  white-space: nowrap; border: 0;
}

/* banner não-bloqueante */
.st-alert {
  display: flex;
  align-items: center;
  gap: var(--ui-space-3);
  padding: var(--ui-space-3) var(--ui-space-4);
  background: rgb(var(--ui-warn) / 0.12);
  border: 1px solid rgb(var(--ui-warn) / 0.4);
  border-radius: var(--ui-radius-md);
  color: rgb(var(--ui-fg));
}
.st-alert-ico {
  display: inline-grid;
  place-items: center;
  width: 22px; height: 22px;
  flex-shrink: 0;
  border-radius: var(--ui-radius-pill);
  background: rgb(var(--ui-warn) / 0.25);
  color: rgb(var(--ui-warn));
  font-weight: 800;
  font-size: var(--ui-text-sm);
}
.st-alert-txt { flex: 1 1 auto; font-size: var(--ui-text-sm); }

/* KPIs */
.st-kpis {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: var(--ui-space-4);
}

/* ---- topo: perfil + tenant ---- */
.st-top {
  display: grid;
  grid-template-columns: 1.4fr 1fr;
  gap: var(--ui-space-4);
  align-items: start;
}

.st-profile-body {
  display: flex;
  align-items: center;
  gap: var(--ui-space-4);
  margin-bottom: var(--ui-space-4);
}
.st-avatar {
  display: inline-grid;
  place-items: center;
  width: 56px; height: 56px;
  flex-shrink: 0;
  border-radius: var(--ui-radius-pill);
  background: rgb(var(--ui-accent) / 0.16);
  color: rgb(var(--ui-accent-strong));
  font-family: var(--ui-font-display);
  font-weight: 800;
  font-size: var(--ui-text-xl);
  letter-spacing: .02em;
}
.st-identity { min-width: 0; }
.st-identity-name {
  margin: 0;
  font-family: var(--ui-font-display);
  font-weight: 700;
  font-size: var(--ui-text-xl);
  color: rgb(var(--ui-fg));
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.st-identity-mail {
  margin: 2px 0 0;
  color: rgb(var(--ui-muted));
  font-size: var(--ui-text-sm);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.st-identity-tags {
  display: flex;
  flex-wrap: wrap;
  gap: var(--ui-space-2);
  margin-top: var(--ui-space-3);
  align-items: center;
}
.st-chip {
  display: inline-flex;
  align-items: center;
  background: rgb(var(--ui-surface-2));
  border: 1px solid rgb(var(--ui-border));
  color: rgb(var(--ui-fg));
  border-radius: var(--ui-radius-pill);
  padding: 2px 10px;
  font-size: var(--ui-text-xs);
  font-weight: 600;
}
.st-chip-soft {
  background: rgb(var(--ui-accent) / 0.1);
  border-color: rgb(var(--ui-accent) / 0.28);
  color: rgb(var(--ui-accent-strong));
}
.st-groups {
  font-size: var(--ui-text-sm);
  word-break: break-word;
}

/* lista de definição */
.st-dl {
  margin: 0;
  display: grid;
  grid-template-columns: 1fr;
  border: 1px solid rgb(var(--ui-border));
  border-radius: var(--ui-radius-md);
  overflow: hidden;
}
.st-dl-row {
  display: grid;
  grid-template-columns: 220px 1fr;
  gap: var(--ui-space-4);
  padding: 11px var(--ui-space-4);
  border-bottom: 1px solid rgb(var(--ui-border));
}
.st-dl-row:last-child { border-bottom: none; }
.st-dl dt { color: rgb(var(--ui-muted)); font-size: var(--ui-text-sm); font-weight: 600; }
.st-dl dd { margin: 0; color: rgb(var(--ui-fg)); word-break: break-word; display: flex; align-items: center; gap: var(--ui-space-2); flex-wrap: wrap; }
.st-inline-link { margin-left: var(--ui-space-1); }

/* ---- tenant switcher ---- */
.st-tenant-body {
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-2);
}
.st-tenant-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-2);
}
.st-tenant-item {
  display: flex;
  align-items: center;
  gap: var(--ui-space-3);
  width: 100%;
  text-align: left;
  background: rgb(var(--ui-surface));
  border: 1px solid rgb(var(--ui-border-strong));
  border-radius: var(--ui-radius-md);
  padding: var(--ui-space-3);
  cursor: pointer;
  font: inherit;
  color: rgb(var(--ui-fg));
  transition: border-color .15s ease, background .15s ease;
}
.st-tenant-item:hover { background: rgb(var(--ui-surface-2)); }
.st-tenant-item[data-active="true"] {
  border-color: rgb(var(--ui-accent));
  background: rgb(var(--ui-accent) / 0.08);
}
.st-tenant-mark {
  display: inline-grid;
  place-items: center;
  width: 36px; height: 36px;
  flex-shrink: 0;
  border-radius: var(--ui-radius-sm);
  background: rgb(var(--ui-accent) / 0.14);
  color: rgb(var(--ui-accent-strong));
  font-weight: 700;
  font-size: var(--ui-text-xs);
  font-family: var(--ui-font-display);
}
.st-tenant-meta { display: flex; flex-direction: column; min-width: 0; line-height: 1.3; }
.st-tenant-name { font-weight: 600; color: rgb(var(--ui-fg)); }
.st-tenant-sub { font-size: var(--ui-text-xs); color: rgb(var(--ui-muted)); }
.st-tenant-current {
  margin-left: auto;
  color: rgb(var(--ui-accent-strong));
  font-weight: 800;
  font-size: var(--ui-text-md);
}
.st-tenant-current-soft {
  font-size: var(--ui-text-xs);
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: .05em;
}
.st-tenant-hint {
  margin: var(--ui-space-2) 0 0;
  font-size: var(--ui-text-xs);
  color: rgb(var(--ui-muted));
}

/* ---- matriz RBAC ---- */
.st-matrix-scroll { overflow-x: auto; }
.st-matrix {
  width: 100%;
  border-collapse: collapse;
  min-width: 640px;
}
.st-matrix th, .st-matrix td {
  border-bottom: 1px solid rgb(var(--ui-border));
  padding: var(--ui-space-3) var(--ui-space-4);
  vertical-align: top;
}
.st-matrix thead th {
  border-bottom: 2px solid rgb(var(--ui-border-strong));
  text-align: center;
  background: rgb(var(--ui-surface-2));
}
.st-matrix-cap { text-align: left; width: 46%; }
thead .st-matrix-cap { vertical-align: middle; }
.st-matrix-role { white-space: nowrap; }
.st-matrix-role[data-me="true"] {
  background: rgb(var(--ui-accent) / 0.12);
}
.st-matrix-rolename {
  display: block;
  font-weight: 700;
  color: rgb(var(--ui-fg));
  font-size: var(--ui-text-sm);
}
.st-matrix-you {
  display: block;
  font-size: var(--ui-text-xs);
  font-weight: 600;
  color: rgb(var(--ui-accent-strong));
  text-transform: uppercase;
  letter-spacing: .05em;
}
.st-cap-label { display: block; font-weight: 600; color: rgb(var(--ui-fg)); }
.st-cap-desc { display: block; margin-top: 2px; font-size: var(--ui-text-xs); color: rgb(var(--ui-muted)); }
.st-matrix-cell { text-align: center; }
.st-matrix-cell[data-me="true"] { background: rgb(var(--ui-accent) / 0.07); }
.st-allow-mark { font-weight: 700; font-size: var(--ui-text-md); }
.st-matrix-cell[data-on="true"] .st-allow-mark { color: rgb(var(--ui-ok)); }
.st-matrix-cell[data-on="false"] .st-allow-mark { color: rgb(var(--ui-faint)); }

/* ---- preferências ---- */
.st-prefs { display: flex; flex-direction: column; gap: var(--ui-space-5); }
.st-check {
  display: flex;
  align-items: center;
  gap: var(--ui-space-2);
  cursor: pointer;
  font-size: var(--ui-text-sm);
  color: rgb(var(--ui-fg));
}
.st-check input { width: auto; }
.st-prefs-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ui-space-4);
  flex-wrap: wrap;
  padding-top: var(--ui-space-3);
  border-top: 1px solid rgb(var(--ui-border));
}
.st-prefs-status { margin: 0; font-size: var(--ui-text-sm); }
.st-prefs-actions { display: flex; gap: var(--ui-space-2); flex-wrap: wrap; }

/* ---- modal ---- */
.st-modal-lead { margin: 0 0 var(--ui-space-4); color: rgb(var(--ui-muted)); font-size: var(--ui-text-sm); }
.st-modal-list { display: flex; flex-direction: column; gap: var(--ui-space-2); }

/* ---- responsivo ---- */
@media (max-width: 1180px) {
  .st-kpis { grid-template-columns: repeat(2, 1fr); }
}
@media (max-width: 980px) {
  .st-top { grid-template-columns: 1fr; }
}
@media (max-width: 860px) {
  .st-kpis { grid-template-columns: 1fr; }
  .st-dl-row { grid-template-columns: 1fr; gap: 2px; }
  .st-prefs-foot { flex-direction: column; align-items: stretch; }
  .st-prefs-actions { justify-content: flex-end; }
}
</style>
