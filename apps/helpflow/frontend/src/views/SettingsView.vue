<template>
  <UiPageLayout
    eyebrow="Workspace e tenant"
    title="Configurações"
    subtitle="Identidade do tenant, preferências operacionais e papéis de acesso (RBAC)."
    width="wide"
    :loading="firstLoad"
    loading-message="Carregando configurações do workspace…"
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

    <!-- Banner não-bloqueante: erro ao carregar agentes -->
    <template #banner>
      <div v-if="agentsError && !firstLoad" class="st-alert" role="status">
        <span class="st-alert-ico" aria-hidden="true">!</span>
        <span class="st-alert-txt">
          Não foi possível carregar a equipe deste workspace — papéis e tenants podem estar incompletos.
        </span>
        <UiButton variant="subtle" size="sm" :loading="agentsLoading" @click="loadAgents">Tentar de novo</UiButton>
      </div>
    </template>

    <!-- ===================== KPIs ===================== -->
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
        :hint="effectiveCapabilities.length + ' de ' + totalCapabilities + ' permissões'"
        :tone="roleTone(effectiveRole)"
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

    <!-- ===================== Identidade + Tenant switcher ===================== -->
    <section class="st-top">
      <!-- ProfileCard: identidade SSO do usuário logado -->
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
              <UiStatusBadge :status="effectiveRole" :tone="roleTone(effectiveRole)" :label="roleLabel(effectiveRole)" />
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

      <!-- TenantSwitcher: troca o workspace ativo (persistido no navegador) -->
      <UiCard class="st-tenant" title="Tenant ativo" subtitle="Espaço de trabalho que filtra todos os dados (multi-tenant).">
        <template #actions>
          <UiButton variant="subtle" size="sm" :disabled="agentsLoading || !tenants.length" @click="openTenantPicker">
            Trocar
          </UiButton>
        </template>

        <UiLoadingState v-if="agentsLoading && !tenants.length" variant="skeleton" :skeleton-lines="4" />
        <UiErrorState
          v-else-if="agentsError && !tenants.length"
          :message="agentsError"
          :retryable="true"
          @retry="loadAgents"
        />
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

    <!-- ===================== Tab bar ===================== -->
    <div class="st-tabs" role="tablist" aria-label="Seções de configuração do workspace">
      <button
        v-for="tab in TABS"
        :key="tab.id"
        role="tab"
        type="button"
        class="st-tab"
        :aria-selected="String(activeTab === tab.id)"
        :data-active="activeTab === tab.id ? 'true' : null"
        @click="activeTab = tab.id"
      >
        {{ tab.label }}
      </button>
    </div>

    <!-- ===================== Tab: Identidade do Tenant ===================== -->
    <UiCard
      v-show="activeTab === 'tenant'"
      title="Identidade do workspace"
      subtitle="Nome e domínio do tenant persistidos no servidor, visíveis a todos os usuários deste workspace."
    >
      <template #actions>
        <UiStatusBadge v-if="tenantIsDefault" status="neutral" tone="neutral" label="Padrão" />
      </template>

      <UiLoadingState v-if="tenantLoading" variant="skeleton" :skeleton-lines="4" />
      <UiErrorState
        v-else-if="tenantError && !tenantData"
        :message="tenantError"
        :retryable="true"
        @retry="loadTenant"
      />
      <form v-else-if="tenantData" class="st-form" novalidate @submit.prevent="saveTenant">
        <div v-if="tenantSaveError" class="st-error-banner" role="alert">
          <span class="st-alert-ico" aria-hidden="true">!</span>
          <span>{{ tenantSaveError }}</span>
        </div>
        <UiFormSection
          title="Identificação"
          description="Informações que identificam este workspace na interface e nos relatórios."
          :columns="2"
        >
          <UiFormField
            label="Nome do workspace"
            :error="tenantFieldErrors.name"
            hint="Exibido na interface e nos relatórios do tenant."
          >
            <template #default="{ id, describedBy, hasError }">
              <input
                :id="id"
                v-model="tenantForm.name"
                type="text"
                maxlength="120"
                :aria-invalid="hasError ? 'true' : null"
                :aria-describedby="describedBy"
              />
            </template>
          </UiFormField>
          <UiFormField
            label="Domínio"
            :error="tenantFieldErrors.domain"
            hint="Domínio principal do tenant (ex: empresa.com). Opcional."
          >
            <template #default="{ id, describedBy, hasError }">
              <input
                :id="id"
                v-model="tenantForm.domain"
                type="text"
                maxlength="255"
                placeholder="empresa.com"
                :aria-invalid="hasError ? 'true' : null"
                :aria-describedby="describedBy"
              />
            </template>
          </UiFormField>
        </UiFormSection>
        <footer class="st-form-foot">
          <p class="st-form-status" role="status">
            <span v-if="tenantDirty" class="st-warn">Alterações não salvas.</span>
            <span v-else-if="tenantIsDefault" class="st-faint">Usando identidade padrão — edite e salve para personalizar.</span>
            <span v-else class="st-faint">Tudo salvo.</span>
          </p>
          <div class="st-form-actions">
            <UiButton variant="ghost" type="button" :disabled="!tenantDirty" @click="resetTenant">Descartar</UiButton>
            <UiButton
              variant="primary"
              type="submit"
              :loading="tenantSaving"
              :disabled="!tenantDirty || !!tenantFieldErrors.name"
            >Salvar identidade</UiButton>
          </div>
        </footer>
      </form>
    </UiCard>

    <!-- ===================== Tab: Preferências ===================== -->
    <UiCard
      v-show="activeTab === 'prefs'"
      title="Preferências operacionais"
      subtitle="Fuso horário, idioma e notificações do workspace — valem para todos os usuários deste tenant."
    >
      <template #actions>
        <UiStatusBadge v-if="prefsIsDefault" status="neutral" tone="neutral" label="Padrão" />
      </template>

      <UiLoadingState v-if="prefsLoading" variant="skeleton" :skeleton-lines="5" />
      <UiErrorState
        v-else-if="prefsError && !prefsData"
        :message="prefsError"
        :retryable="true"
        @retry="loadPrefs"
      />
      <template v-else-if="prefsData">
        <!-- Estado vazio: preferências padrão — convida a personalizar -->
        <UiEmptyState
          v-if="prefsIsDefault && !prefsEditing"
          icon="sliders"
          title="Preferências padrão"
          description="Este workspace ainda usa as configurações padrão da plataforma. Personalize o fuso horário, idioma e notificações para o seu contexto."
          compact
        >
          <template #action>
            <UiButton variant="primary" size="sm" @click="prefsEditing = true">Personalizar preferências</UiButton>
          </template>
        </UiEmptyState>
        <form v-else class="st-form" novalidate @submit.prevent="savePrefs">
          <div v-if="prefsSaveError" class="st-error-banner" role="alert">
            <span class="st-alert-ico" aria-hidden="true">!</span>
            <span>{{ prefsSaveError }}</span>
          </div>
          <UiFormSection
            title="Localização"
            description="Fuso horário e idioma padrão do workspace."
            :columns="2"
          >
            <UiFormField label="Fuso horário" hint="Usado para exibição de datas e cálculo de janelas de SLA.">
              <template #default="{ id, describedBy }">
                <select :id="id" v-model="prefsForm.timezone" :aria-describedby="describedBy">
                  <option v-for="tz in TIMEZONES" :key="tz.value" :value="tz.value">{{ tz.label }}</option>
                </select>
              </template>
            </UiFormField>
            <UiFormField label="Idioma" hint="Idioma padrão da interface do workspace.">
              <template #default="{ id, describedBy }">
                <select :id="id" v-model="prefsForm.language" :aria-describedby="describedBy">
                  <option value="pt-BR">Português (Brasil)</option>
                  <option value="en-US">English (US)</option>
                </select>
              </template>
            </UiFormField>
            <UiFormField
              label="Itens por página"
              :error="prefsFieldErrors.page_size"
              hint="Entre 5 e 100 registros por página nas listagens."
            >
              <template #default="{ id, describedBy, hasError }">
                <input
                  :id="id"
                  v-model.number="prefsForm.page_size"
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
          </UiFormSection>
          <UiFormSection title="Notificações" description="Avisos exibidos durante o uso do service desk." :columns="1">
            <UiFormField>
              <template #default="{ id }">
                <label :for="id" class="st-check">
                  <input :id="id" v-model="prefsForm.notify_new_tickets" type="checkbox" />
                  <span>Avisar quando novos chamados forem atribuídos a agentes deste workspace</span>
                </label>
              </template>
            </UiFormField>
            <UiFormField>
              <template #default="{ id }">
                <label :for="id" class="st-check">
                  <input :id="id" v-model="prefsForm.notify_sla" type="checkbox" />
                  <span>Avisar quando um chamado estiver perto de violar o SLA</span>
                </label>
              </template>
            </UiFormField>
          </UiFormSection>
          <footer class="st-form-foot">
            <p class="st-form-status" role="status">
              <span v-if="prefsDirty" class="st-warn">Alterações não salvas.</span>
              <span v-else class="st-faint">Tudo salvo.</span>
            </p>
            <div class="st-form-actions">
              <UiButton variant="ghost" type="button" :disabled="!prefsDirty" @click="resetPrefs">Descartar</UiButton>
              <UiButton
                variant="primary"
                type="submit"
                :loading="prefsSaving"
                :disabled="!prefsDirty || !!prefsFieldErrors.page_size"
              >Salvar preferências</UiButton>
            </div>
          </footer>
        </form>
      </template>
    </UiCard>

    <!-- ===================== Tab: Papéis de Acesso ===================== -->
    <UiCard
      v-show="activeTab === 'roles'"
      title="Papéis e permissões (RBAC)"
      subtitle="O que cada papel pode fazer no service desk. Seu papel está destacado na matriz."
    >
      <template #actions>
        <UiStatusBadge :status="effectiveRole" :tone="roleTone(effectiveRole)" :label="'Você: ' + roleLabel(effectiveRole)" />
      </template>

      <UiLoadingState v-if="rolesLoading" variant="skeleton" :skeleton-lines="6" />
      <UiErrorState
        v-else-if="rolesError && !rolesData"
        :message="rolesError"
        :retryable="true"
        @retry="loadRoles"
      />
      <div v-else-if="rolesData" class="st-matrix-scroll">
        <table class="st-matrix">
          <caption class="st-sr">Matriz de permissões por papel do service desk</caption>
          <thead>
            <tr>
              <th scope="col" class="st-matrix-cap">Permissão</th>
              <th
                v-for="role in rolesData.roles"
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
            <tr v-for="cap in rolesData.capabilities" :key="cap.key">
              <th scope="row" class="st-matrix-cap">
                <span class="st-cap-label">{{ cap.label }}</span>
                <span class="st-cap-desc">{{ cap.description }}</span>
              </th>
              <td
                v-for="role in rolesData.roles"
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
  format,
} from '../ui/index.js';
import {
  agents as agentsApi,
  settingsTenant as settingsTenantApi,
  settingsPreferences as settingsPrefsApi,
  settingsRoles as settingsRolesApi,
} from '../api.js';

const router = useRouter();
const toast = useToast();

const API_BASE = import.meta.env.VITE_API_BASE_URL || '/helpflow/api';
const STORAGE_TENANT = 'helpflow.settings.activeTenant';

const TABS = [
  { id: 'tenant', label: 'Identidade do Tenant' },
  { id: 'prefs', label: 'Preferências' },
  { id: 'roles', label: 'Papéis de Acesso' },
];

const TIMEZONES = [
  { value: 'America/Sao_Paulo', label: 'Brasília (UTC-3)' },
  { value: 'America/Recife', label: 'Recife / Fortaleza (UTC-3)' },
  { value: 'America/Manaus', label: 'Manaus (UTC-4)' },
  { value: 'America/Rio_Branco', label: 'Rio Branco (UTC-5)' },
  { value: 'America/Noronha', label: 'Fernando de Noronha (UTC-2)' },
  { value: 'UTC', label: 'UTC' },
  { value: 'America/New_York', label: 'New York (ET)' },
  { value: 'America/Chicago', label: 'Chicago (CT)' },
  { value: 'America/Los_Angeles', label: 'Los Angeles (PT)' },
  { value: 'Europe/London', label: 'London (GMT/BST)' },
  { value: 'Europe/Paris', label: 'Paris / Berlim (CET)' },
];

// Mapa canônico de papéis — reflete a enum da entidade agents
const ROLE_MAP = {
  admin: { label: 'Admin', tone: 'error' },
  supervisor: { label: 'Supervisor', tone: 'warning' },
  agent: { label: 'Agente', tone: 'running' },
  viewer: { label: 'Leitor', tone: 'neutral' },
};
const ROLE_RANK = { admin: 4, supervisor: 3, agent: 2, viewer: 1 };

// ---- Tab ativa ----
const activeTab = ref('tenant');

// ---- Identidade SSO (borda) ----
const me = ref(null);

// ---- Agentes (fonte de tenants + paper do usuário) ----
const agents = ref([]);
const agentsLoading = ref(false);
const agentsError = ref('');

// ---- Estado geral de carregamento ----
const firstLoad = ref(true);
const reloading = ref(false);
const pageError = ref(null);

// ---- Tenant ativo (persistido no navegador) ----
const activeTenant = ref(loadActiveTenant());

// ---- Computados: sessão e papel efetivo ----
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
  return ((parts[0][0] || '') + (parts.length > 1 ? (parts[parts.length - 1][0] || '') : '')).toUpperCase();
});

const matchedAgent = computed(() => {
  const email = ((me.value && me.value.email) || '').toLowerCase();
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

const roleSource = computed(() => {
  if (matchedAgent.value && ROLE_MAP[String(matchedAgent.value.role).toLowerCase()]) return 'agent';
  const groups = String((me.value && me.value.role) || '').toLowerCase();
  for (const r of Object.keys(ROLE_RANK).sort((a, b) => ROLE_RANK[b] - ROLE_RANK[a])) {
    if (groups.includes(r) || groups.includes((ROLE_MAP[r]?.label || '').toLowerCase())) return 'sso';
  }
  return 'default';
});

const roleSourceLabel = computed(() => {
  if (roleSource.value === 'agent') return 'do cadastro de agente';
  if (roleSource.value === 'sso') return 'inferido dos grupos do SSO';
  return 'padrão (sem cadastro)';
});

const effectiveRole = computed(() => {
  if (matchedAgent.value && ROLE_MAP[String(matchedAgent.value.role).toLowerCase()]) {
    return String(matchedAgent.value.role).toLowerCase();
  }
  const groups = String((me.value && me.value.role) || '').toLowerCase();
  for (const r of Object.keys(ROLE_RANK).sort((a, b) => ROLE_RANK[b] - ROLE_RANK[a])) {
    if (groups.includes(r) || groups.includes((ROLE_MAP[r]?.label || '').toLowerCase())) return r;
  }
  return 'viewer';
});

const effectiveCapabilities = computed(() => {
  if (!rolesData.value) return [];
  return rolesData.value.capabilities.filter((c) => c.roles.includes(effectiveRole.value));
});

const totalCapabilities = computed(() => rolesData.value ? rolesData.value.capabilities.length : 6);

const tenants = computed(() => {
  const map = new Map();
  for (const a of agents.value || []) {
    const id = Number(a.tenant_id);
    if (!Number.isFinite(id)) continue;
    if (!map.has(id)) map.set(id, { id, agentCount: 0 });
    map.get(id).agentCount += 1;
  }
  if (Number.isFinite(activeTenant.value) && !map.has(activeTenant.value)) {
    map.set(activeTenant.value, { id: activeTenant.value, agentCount: 0 });
  }
  return [...map.values()].sort((x, y) => x.id - y.id).map((t) => ({ ...t, label: 'Tenant #' + t.id }));
});

function roleTone(role) { return ROLE_MAP[String(role).toLowerCase()]?.tone || 'neutral'; }
function roleLabel(role) { return ROLE_MAP[String(role).toLowerCase()]?.label || format.humanize(role); }
function teamLabel(id) { return 'Time #' + id; }
function tenantInitials(t) { return 'T' + t.id; }
function lastAccess(v) { return v ? format.formatDateTime(v) : 'Nunca acessou'; }
function goToAgent() { if (matchedAgent.value) router.push('/agents/' + matchedAgent.value.id); }

// ---- Carga: /me ----
async function loadMe() {
  try {
    const res = await fetch(API_BASE + '/me', { headers: { Accept: 'application/json' } });
    if (!res.ok) { me.value = null; return; }
    const data = await res.json().catch(() => null);
    me.value = data && (data.email || data.name || data.role) ? data : null;
  } catch { me.value = null; }
}

// ---- Carga: /v1/agents (fonte de tenants + agente do usuário) ----
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

// ---- Settings: Identidade do Tenant ----
const tenantData = ref(null);
const tenantLoading = ref(false);
const tenantError = ref('');
const tenantSaving = ref(false);
const tenantSaveError = ref('');
const tenantForm = reactive({ name: '', domain: '' });
const tenantFieldErrors = reactive({ name: '', domain: '' });
const tenantSnapshot = ref('');

const tenantDirty = computed(() =>
  JSON.stringify({ name: tenantForm.name, domain: tenantForm.domain }) !== tenantSnapshot.value
);
const tenantIsDefault = computed(() => !!(tenantData.value && tenantData.value.is_default));

function applyTenantData(data) {
  tenantForm.name = data.name || '';
  tenantForm.domain = data.domain || '';
  tenantSnapshot.value = JSON.stringify({ name: tenantForm.name, domain: tenantForm.domain });
  tenantFieldErrors.name = '';
  tenantFieldErrors.domain = '';
  tenantSaveError.value = '';
}

async function loadTenant() {
  tenantLoading.value = true;
  tenantError.value = '';
  try {
    const data = await settingsTenantApi.get();
    tenantData.value = data;
    applyTenantData(data);
  } catch (e) {
    tenantError.value = (e && e.message) || 'Não foi possível carregar a identidade do tenant.';
  } finally {
    tenantLoading.value = false;
  }
}

watch(() => tenantForm.name, (v) => {
  tenantFieldErrors.name = (!v || !String(v).trim()) ? 'Nome do workspace é obrigatório.' : '';
});

function resetTenant() {
  const snap = JSON.parse(tenantSnapshot.value || '{}');
  tenantForm.name = snap.name || '';
  tenantForm.domain = snap.domain || '';
  tenantFieldErrors.name = '';
  tenantFieldErrors.domain = '';
  tenantSaveError.value = '';
}

async function saveTenant() {
  tenantFieldErrors.name = (!tenantForm.name || !String(tenantForm.name).trim()) ? 'Nome do workspace é obrigatório.' : '';
  if (tenantFieldErrors.name) { toast.error('Corrija os campos destacados antes de salvar.'); return; }
  tenantSaving.value = true;
  tenantSaveError.value = '';
  try {
    const data = await settingsTenantApi.update({ name: tenantForm.name, domain: tenantForm.domain || null });
    tenantData.value = { ...data };
    applyTenantData(data);
    toast.success('Identidade do workspace salva.');
  } catch (e) {
    tenantSaveError.value = (e && e.message) || 'Não foi possível salvar a identidade.';
    toast.error('Erro ao salvar.', { detail: tenantSaveError.value });
  } finally {
    tenantSaving.value = false;
  }
}

// ---- Settings: Preferências ----
const prefsData = ref(null);
const prefsLoading = ref(false);
const prefsError = ref('');
const prefsSaving = ref(false);
const prefsSaveError = ref('');
const prefsEditing = ref(false);
const prefsForm = reactive({ timezone: 'America/Sao_Paulo', language: 'pt-BR', notify_new_tickets: true, notify_sla: true, page_size: 25 });
const prefsFieldErrors = reactive({ page_size: '' });
const prefsSnapshot = ref('');

const prefsDirty = computed(() => JSON.stringify({ ...prefsForm }) !== prefsSnapshot.value);
const prefsIsDefault = computed(() => !!(prefsData.value && prefsData.value.is_default));

function applyPrefsData(data) {
  prefsForm.timezone = data.timezone || 'America/Sao_Paulo';
  prefsForm.language = data.language || 'pt-BR';
  prefsForm.notify_new_tickets = data.notify_new_tickets !== false;
  prefsForm.notify_sla = data.notify_sla !== false;
  prefsForm.page_size = Number(data.page_size) || 25;
  prefsSnapshot.value = JSON.stringify({ ...prefsForm });
  prefsFieldErrors.page_size = '';
  prefsSaveError.value = '';
}

async function loadPrefs() {
  prefsLoading.value = true;
  prefsError.value = '';
  try {
    const data = await settingsPrefsApi.get();
    prefsData.value = data;
    applyPrefsData(data);
  } catch (e) {
    prefsError.value = (e && e.message) || 'Não foi possível carregar as preferências.';
  } finally {
    prefsLoading.value = false;
  }
}

watch(
  () => prefsForm.page_size,
  (v) => {
    const n = Number(v);
    prefsFieldErrors.page_size = (!Number.isFinite(n) || n < 5 || n > 100) ? 'Valor entre 5 e 100.' : '';
  },
  { immediate: true }
);

function resetPrefs() {
  const snap = JSON.parse(prefsSnapshot.value || '{}');
  Object.assign(prefsForm, snap);
  prefsFieldErrors.page_size = '';
  prefsSaveError.value = '';
}

async function savePrefs() {
  const ps = Number(prefsForm.page_size);
  if (!Number.isFinite(ps) || ps < 5 || ps > 100) {
    prefsFieldErrors.page_size = 'Valor entre 5 e 100.';
    toast.error('Corrija os campos destacados antes de salvar.');
    return;
  }
  prefsSaving.value = true;
  prefsSaveError.value = '';
  try {
    const data = await settingsPrefsApi.update({ ...prefsForm, page_size: ps });
    prefsData.value = { ...data };
    applyPrefsData(data);
    prefsEditing.value = false;
    toast.success('Preferências salvas.', { detail: 'Valem para todos os usuários deste workspace.' });
  } catch (e) {
    prefsSaveError.value = (e && e.message) || 'Não foi possível salvar as preferências.';
    toast.error('Erro ao salvar.', { detail: prefsSaveError.value });
  } finally {
    prefsSaving.value = false;
  }
}

// ---- Settings: Papéis de Acesso ----
const rolesData = ref(null);
const rolesLoading = ref(false);
const rolesError = ref('');

async function loadRoles() {
  rolesLoading.value = true;
  rolesError.value = '';
  try {
    rolesData.value = await settingsRolesApi.get();
  } catch (e) {
    rolesError.value = (e && e.message) || 'Não foi possível carregar os papéis de acesso.';
  } finally {
    rolesLoading.value = false;
  }
}

// ---- Tenant switching ----
const tenantPickerOpen = ref(false);
const pendingTenant = ref(activeTenant.value);

function openTenantPicker() {
  pendingTenant.value = activeTenant.value;
  tenantPickerOpen.value = true;
}
function chooseTenant(id) {
  if (id === activeTenant.value) return;
  pendingTenant.value = id;
  applyTenantSwitch(id);
}
function confirmTenant() {
  applyTenantSwitch(pendingTenant.value);
  tenantPickerOpen.value = false;
}
function applyTenantSwitch(id) {
  if (!Number.isFinite(id) || id === activeTenant.value) return;
  activeTenant.value = id;
  try { localStorage.setItem(STORAGE_TENANT, String(id)); } catch { /* storage indisponível */ }
  toast.success('Tenant ativo: #' + id + '.', { detail: 'As configurações deste tenant serão carregadas.' });
  loadTenant();
  loadPrefs();
}
function loadActiveTenant() {
  let raw = null;
  try { raw = localStorage.getItem(STORAGE_TENANT); } catch { raw = null; }
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : 1;
}

// ---- Carregamento inicial + reload ----
async function loadAll() {
  pageError.value = null;
  try {
    await Promise.all([loadMe(), loadAgents(), loadTenant(), loadPrefs(), loadRoles()]);
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
    if (!pageError.value) toast.success('Configurações atualizadas.');
  } catch (e) {
    toast.error('Não foi possível atualizar.', { detail: e && e.message });
  } finally {
    reloading.value = false;
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

/* banner não-bloqueante (agentes) */
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

/* banner de erro de formulário */
.st-error-banner {
  display: flex;
  align-items: center;
  gap: var(--ui-space-3);
  padding: var(--ui-space-3) var(--ui-space-4);
  background: rgb(var(--ui-warn) / 0.1);
  border: 1px solid rgb(var(--ui-warn) / 0.35);
  border-radius: var(--ui-radius-md);
  color: rgb(var(--ui-fg));
  font-size: var(--ui-text-sm);
  margin-bottom: var(--ui-space-4);
}

/* KPIs */
.st-kpis {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: var(--ui-space-4);
}

/* topo: perfil + tenant */
.st-top {
  display: grid;
  grid-template-columns: 1.4fr 1fr;
  gap: var(--ui-space-4);
  align-items: start;
}

/* perfil de usuário */
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
.st-groups { font-size: var(--ui-text-sm); word-break: break-word; }

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

/* tenant switcher */
.st-tenant-body { display: flex; flex-direction: column; gap: var(--ui-space-2); }
.st-tenant-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--ui-space-2); }
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
.st-tenant-current { margin-left: auto; color: rgb(var(--ui-accent-strong)); font-weight: 800; font-size: var(--ui-text-md); }
.st-tenant-current-soft { font-size: var(--ui-text-xs); font-weight: 600; text-transform: uppercase; letter-spacing: .05em; }
.st-tenant-hint { margin: var(--ui-space-2) 0 0; font-size: var(--ui-text-xs); color: rgb(var(--ui-muted)); }

/* tab bar */
.st-tabs {
  display: flex;
  gap: 0;
  border-bottom: 2px solid rgb(var(--ui-border));
}
.st-tab {
  padding: var(--ui-space-2) var(--ui-space-5);
  font: inherit;
  font-size: var(--ui-text-sm);
  font-weight: 600;
  color: rgb(var(--ui-muted));
  background: transparent;
  border: none;
  border-bottom: 3px solid transparent;
  cursor: pointer;
  transition: color .15s ease, border-color .15s ease;
  margin-bottom: -2px;
}
.st-tab:hover { color: rgb(var(--ui-fg)); }
.st-tab[data-active="true"] {
  color: rgb(var(--ui-accent-strong));
  border-bottom-color: rgb(var(--ui-accent));
}

/* formulário de configurações */
.st-form { display: flex; flex-direction: column; gap: var(--ui-space-5); }
.st-check {
  display: flex;
  align-items: center;
  gap: var(--ui-space-2);
  cursor: pointer;
  font-size: var(--ui-text-sm);
  color: rgb(var(--ui-fg));
}
.st-check input { width: auto; }
.st-form-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ui-space-4);
  flex-wrap: wrap;
  padding-top: var(--ui-space-3);
  border-top: 1px solid rgb(var(--ui-border));
}
.st-form-status { margin: 0; font-size: var(--ui-text-sm); }
.st-form-actions { display: flex; gap: var(--ui-space-2); flex-wrap: wrap; }

/* matriz RBAC */
.st-matrix-scroll { overflow-x: auto; }
.st-matrix { width: 100%; border-collapse: collapse; min-width: 640px; }
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
.st-matrix-role[data-me="true"] { background: rgb(var(--ui-accent) / 0.12); }
.st-matrix-rolename { display: block; font-weight: 700; color: rgb(var(--ui-fg)); font-size: var(--ui-text-sm); }
.st-matrix-you { display: block; font-size: var(--ui-text-xs); font-weight: 600; color: rgb(var(--ui-accent-strong)); text-transform: uppercase; letter-spacing: .05em; }
.st-cap-label { display: block; font-weight: 600; color: rgb(var(--ui-fg)); }
.st-cap-desc { display: block; margin-top: 2px; font-size: var(--ui-text-xs); color: rgb(var(--ui-muted)); }
.st-matrix-cell { text-align: center; }
.st-matrix-cell[data-me="true"] { background: rgb(var(--ui-accent) / 0.07); }
.st-allow-mark { font-weight: 700; font-size: var(--ui-text-md); }
.st-matrix-cell[data-on="true"] .st-allow-mark { color: rgb(var(--ui-ok)); }
.st-matrix-cell[data-on="false"] .st-allow-mark { color: rgb(var(--ui-faint)); }

/* modal */
.st-modal-lead { margin: 0 0 var(--ui-space-4); color: rgb(var(--ui-muted)); font-size: var(--ui-text-sm); }
.st-modal-list { display: flex; flex-direction: column; gap: var(--ui-space-2); }

/* responsivo */
@media (max-width: 1180px) {
  .st-kpis { grid-template-columns: repeat(2, 1fr); }
}
@media (max-width: 980px) {
  .st-top { grid-template-columns: 1fr; }
}
@media (max-width: 860px) {
  .st-kpis { grid-template-columns: 1fr; }
  .st-dl-row { grid-template-columns: 1fr; gap: 2px; }
  .st-form-foot { flex-direction: column; align-items: stretch; }
  .st-form-actions { justify-content: flex-end; }
  .st-tab { padding: var(--ui-space-2) var(--ui-space-3); }
}
</style>
