<template>
  <UiPageLayout
    eyebrow="Equipe & RBAC"
    title="Novo agente"
    subtitle="Provisione o acesso de uma pessoa ao service desk: identidade vinculada ao OIDC, papel de permissão (RBAC), time e tenant."
    width="wide"
  >
    <template #actions>
      <UiButton variant="ghost" to="/agents">Voltar aos agentes</UiButton>
    </template>

    <!-- Banner: possível duplicidade (verificação fail-soft por e-mail) -->
    <template #banner>
      <div
        v-if="dupState === 'found'"
        class="hf-dup"
        role="status"
        aria-live="polite"
      >
        <div class="hf-dup-head">
          <span class="hf-dup-icon" aria-hidden="true">!</span>
          <div class="hf-dup-text">
            <p class="hf-dup-title">Já existe acesso com este e-mail</p>
            <p class="hf-dup-sub">
              O e-mail é vinculado ao OIDC e deve ser único. Abra o acesso existente em vez de
              provisionar outro — ou confirme que é uma pessoa diferente antes de salvar.
            </p>
          </div>
          <UiButton variant="subtle" size="sm" @click="dismissDuplicates">Ignorar</UiButton>
        </div>
        <ul class="hf-dup-list">
          <li v-for="d in duplicates" :key="d.id" class="hf-dup-item">
            <div class="hf-dup-item-main">
              <RouterLink :to="'/agents/' + d.id" class="hf-dup-name">{{ d.name || d.email || ('#' + d.id) }}</RouterLink>
              <span class="hf-dup-mail">{{ d.email || '—' }}</span>
            </div>
            <div class="hf-dup-item-side">
              <UiStatusBadge :status="d.role" :tone="roleTone(d.role)" :label="roleLabel(d.role)" size="sm" />
              <UiButton variant="ghost" size="sm" :to="'/agents/' + d.id">Abrir</UiButton>
            </div>
          </li>
        </ul>
      </div>
    </template>

    <div class="hf-grid">
      <!-- ====================== Coluna do formulário ====================== -->
      <UiCard class="hf-form-card">
        <form class="hf-form" novalidate @submit.prevent="submit">
          <!-- Etapas (progresso de preenchimento) -->
          <ol class="hf-steps" aria-label="Etapas do provisionamento">
            <li
              v-for="(s, i) in steps"
              :key="s.key"
              class="hf-step"
              :data-state="stepState(s.key)"
            >
              <span class="hf-step-num" aria-hidden="true">
                <span v-if="stepState(s.key) === 'done'">&#10003;</span>
                <span v-else>{{ i + 1 }}</span>
              </span>
              <span class="hf-step-label">{{ s.label }}</span>
            </li>
          </ol>

          <!-- 1. Identidade -->
          <UiFormSection
            title="Identidade"
            description="Nome de exibição e e-mail corporativo. O e-mail autentica a pessoa via OIDC e precisa ser único no tenant."
            :columns="2"
          >
            <UiFormField
              label="Nome"
              :required="true"
              :error="f.errors.name"
              :full-width="true"
              hint="Como o agente aparece nos chamados, atribuições e relatórios."
            >
              <template #default="{ id, describedBy }">
                <input
                  :id="id"
                  type="text"
                  autocomplete="name"
                  maxlength="120"
                  :aria-describedby="describedBy"
                  :value="f.values.name"
                  placeholder="Ex.: Ana Ribeiro"
                  @input="f.setField('name', $event.target.value)"
                  @blur="f.validateField('name')"
                />
              </template>
            </UiFormField>

            <UiFormField
              label="E-mail"
              :required="true"
              :error="f.errors.email"
              :full-width="true"
              :hint="emailHint"
            >
              <template #default="{ id, describedBy }">
                <div class="hf-email">
                  <input
                    :id="id"
                    type="email"
                    autocomplete="email"
                    spellcheck="false"
                    :aria-describedby="describedBy"
                    :value="f.values.email"
                    placeholder="nome@empresa.com.br"
                    @input="onEmailInput($event.target.value)"
                    @blur="checkDuplicates"
                  />
                  <span v-if="dupState === 'checking'" class="hf-email-spin" aria-hidden="true">
                    <span class="ui-spin" />
                  </span>
                  <span v-else-if="dupState === 'clean'" class="hf-email-ok" aria-hidden="true">&#10003;</span>
                  <span v-else-if="dupState === 'found'" class="hf-email-warn" aria-hidden="true">!</span>
                </div>
              </template>
            </UiFormField>
          </UiFormSection>

          <!-- 2. Papel (RBAC) — RolePicker como radiogroup acessível -->
          <UiFormSection
            title="Papel de acesso (RBAC)"
            description="O papel define o que a pessoa pode fazer na aplicação. Escolha o menor privilégio que dá conta do trabalho."
            :columns="1"
          >
            <UiFormField
              label="Papel"
              :required="true"
              :error="f.errors.role"
              :full-width="true"
              hint="Clique para escolher ou use as setas do teclado para navegar entre os papéis."
            >
              <template #default="{ id, describedBy }">
                <div
                  :id="id"
                  class="hf-roles"
                  role="radiogroup"
                  aria-label="Papel de acesso"
                  :aria-describedby="describedBy"
                >
                  <button
                    v-for="(role, idx) in ROLES"
                    :key="role.value"
                    type="button"
                    class="hf-role"
                    role="radio"
                    :data-selected="f.values.role === role.value ? 'true' : 'false'"
                    :aria-checked="f.values.role === role.value ? 'true' : 'false'"
                    :tabindex="roleTabindex(role.value, idx)"
                    :ref="(el) => registerRoleRef(el, idx)"
                    @click="selectRole(role.value)"
                    @keydown="onRoleKey($event, idx)"
                  >
                    <span class="hf-role-top">
                      <span class="hf-role-dot" :data-tone="role.tone" aria-hidden="true" />
                      <span class="hf-role-name">{{ role.label }}</span>
                      <span class="hf-role-tag ui-mono">{{ role.value }}</span>
                    </span>
                    <span class="hf-role-desc">{{ role.description }}</span>
                    <span class="hf-role-perms">
                      <span v-for="perm in role.perms" :key="perm" class="hf-role-perm">{{ perm }}</span>
                    </span>
                    <span v-if="role.value === 'admin'" class="hf-role-flag">Privilégio elevado</span>
                  </button>
                </div>
              </template>
            </UiFormField>
          </UiFormSection>

          <!-- 3. Lotação -->
          <UiFormSection
            title="Lotação"
            description="Onde a pessoa atua. O tenant isola os dados por organização; o time é opcional."
            :columns="2"
          >
            <UiFormField
              label="Time"
              :error="f.errors.team_id"
              hint="Identificador numérico do time (opcional)."
            >
              <template #default="{ id, describedBy }">
                <input
                  :id="id"
                  type="number"
                  inputmode="numeric"
                  min="1"
                  step="1"
                  :aria-describedby="describedBy"
                  :value="f.values.team_id"
                  placeholder="Ex.: 12"
                  @input="f.setField('team_id', $event.target.value)"
                  @blur="f.validateField('team_id')"
                />
              </template>
            </UiFormField>

            <UiFormField
              label="Tenant"
              :required="true"
              :error="f.errors.tenant_id"
              hint="Organização à qual o agente pertence. Obrigatório."
            >
              <template #default="{ id, describedBy }">
                <input
                  :id="id"
                  type="number"
                  inputmode="numeric"
                  min="1"
                  step="1"
                  :aria-describedby="describedBy"
                  :value="f.values.tenant_id"
                  placeholder="Ex.: 1"
                  @input="f.setField('tenant_id', $event.target.value)"
                  @blur="f.validateField('tenant_id')"
                />
              </template>
            </UiFormField>
          </UiFormSection>

          <!-- 4. Situação inicial -->
          <UiFormSection
            title="Situação inicial"
            description="Agentes ativos podem entrar imediatamente. Crie inativo se o acesso ainda não deve valer."
            :columns="1"
          >
            <UiFormField
              label="Acesso ao entrar"
              hint="Você pode alterar a situação depois na lista de agentes."
            >
              <template #default="{ id }">
                <button
                  :id="id"
                  type="button"
                  class="hf-switch"
                  role="switch"
                  :aria-checked="String(isActive)"
                  :data-on="isActive ? 'true' : 'false'"
                  @click="toggleStatus"
                >
                  <span class="hf-switch-track" aria-hidden="true"><span class="hf-switch-knob" /></span>
                  <span class="hf-switch-label">{{ isActive ? 'Ativo — pode acessar agora' : 'Inativo — acesso suspenso' }}</span>
                </button>
              </template>
            </UiFormField>
          </UiFormSection>

          <!-- Estado de erro do envio -->
          <p v-if="submitError" class="hf-submit-error" role="alert">{{ submitError }}</p>

          <!-- SubmitBar -->
          <div class="hf-submitbar">
            <p class="hf-submit-hint">
              <span v-if="dupState === 'found'" class="hf-warn">Há possível duplicidade — confirmaremos antes de provisionar.</span>
              <span v-else-if="f.values.role === 'admin'" class="hf-warn">Admin concede controle total — confirmaremos ao salvar.</span>
              <span v-else class="ui-muted">Os campos com * são obrigatórios.</span>
            </p>
            <div class="hf-submit-actions">
              <UiButton variant="ghost" type="button" :disabled="f.submitting.value" @click="cancel">Cancelar</UiButton>
              <UiButton type="submit" :loading="f.submitting.value">Provisionar agente</UiButton>
            </div>
          </div>
        </form>
      </UiCard>

      <!-- ====================== Coluna lateral: resumo ao vivo ====================== -->
      <aside class="hf-aside">
        <UiCard title="Resumo do acesso" subtitle="Confira antes de provisionar.">
          <div class="hf-summary">
            <header class="hf-summary-head">
              <span class="hf-avatar" :data-tone="selectedRole.tone" aria-hidden="true">{{ initials }}</span>
              <div class="hf-summary-id">
                <p class="hf-summary-name">{{ f.values.name || 'Sem nome' }}</p>
                <p class="hf-summary-mail">{{ f.values.email || 'sem e-mail' }}</p>
              </div>
            </header>
            <dl class="hf-dl">
              <div class="hf-dl-row">
                <dt>Papel</dt>
                <dd><UiStatusBadge :status="f.values.role" :tone="roleTone(f.values.role)" :label="roleLabel(f.values.role)" /></dd>
              </div>
              <div class="hf-dl-row">
                <dt>Situação</dt>
                <dd><UiStatusBadge :status="isActive ? 'active' : 'inactive'" :label="isActive ? 'Ativo' : 'Inativo'" /></dd>
              </div>
              <div class="hf-dl-row">
                <dt>Time</dt>
                <dd>{{ f.values.team_id ? ('Time ' + f.values.team_id) : 'Sem time' }}</dd>
              </div>
              <div class="hf-dl-row">
                <dt>Tenant</dt>
                <dd class="ui-mono">{{ f.values.tenant_id ? ('#' + f.values.tenant_id) : '—' }}</dd>
              </div>
            </dl>
          </div>
          <template #footer>
            <p class="hf-summary-foot ui-muted">{{ selectedRole.description }}</p>
          </template>
        </UiCard>

        <UiCard title="O que cada papel pode fazer">
          <ul class="hf-help">
            <li
              v-for="role in ROLES"
              :key="role.value"
              class="hf-help-item"
              :data-active="f.values.role === role.value ? 'true' : 'false'"
            >
              <span class="hf-role-dot" :data-tone="role.tone" aria-hidden="true" />
              <span class="hf-help-text">
                <span class="hf-help-name">{{ role.label }}</span>
                <span class="hf-help-desc">{{ role.description }}</span>
              </span>
            </li>
          </ul>
        </UiCard>

        <UiCard title="Atalhos">
          <ul class="hf-tips">
            <li class="hf-tip">
              <span class="hf-kbd" aria-hidden="true">&larr; &rarr;</span>
              <span>Navega entre os papéis quando o seletor está em foco.</span>
            </li>
            <li class="hf-tip">
              <span class="hf-kbd" aria-hidden="true">Enter</span>
              <span>Confirma o papel em foco no seletor.</span>
            </li>
            <li class="hf-tip">
              <span class="hf-link-tip">
                Provisionando vários? Crie o
                <RouterLink to="/teams/new">time</RouterLink>
                antes para já lotar o agente.
              </span>
            </li>
          </ul>
        </UiCard>
      </aside>
    </div>
  </UiPageLayout>
</template>

<script setup>
import { ref, computed } from 'vue';
import { RouterLink, useRouter } from 'vue-router';
import {
  UiPageLayout,
  UiCard,
  UiFormSection,
  UiFormField,
  UiButton,
  UiStatusBadge,
  useForm,
  useToast,
  useConfirm,
  validators,
} from '../ui/index.js';
import { agents } from '../api.js';

const router = useRouter();
const toast = useToast();
const confirm = useConfirm();

// Papéis RBAC canônicos (enumValues da entidade agents.role) com tom, descrição e
// permissões resumidas. A ordem segue do maior para o menor privilégio.
const ROLES = [
  {
    value: 'admin',
    label: 'Administrador',
    tone: 'error',
    description: 'Controle total: gerencia agentes, configurações e todos os chamados do tenant.',
    perms: ['Gerir agentes', 'Configurar', 'Todos os chamados'],
  },
  {
    value: 'supervisor',
    label: 'Supervisor',
    tone: 'warning',
    description: 'Coordena o time: atribui, prioriza e acompanha os chamados da equipe.',
    perms: ['Atribuir', 'Priorizar', 'Relatórios do time'],
  },
  {
    value: 'agent',
    label: 'Agente',
    tone: 'running',
    description: 'Atende e resolve os chamados sob sua responsabilidade.',
    perms: ['Atender', 'Responder', 'Resolver'],
  },
  {
    value: 'viewer',
    label: 'Leitor',
    tone: 'neutral',
    description: 'Apenas leitura: consulta chamados e relatórios, sem alterar nada.',
    perms: ['Visualizar', 'Exportar'],
  },
];
const ROLE_MAP = ROLES.reduce((acc, r) => { acc[r.value] = r; return acc; }, {});

const f = useForm({
  initial: { name: '', email: '', role: 'agent', team_id: '', tenant_id: '', status: 'active' },
  rules: {
    name: [validators.required('Informe o nome do agente'), validators.minLen(2)],
    email: [validators.required('Informe o e-mail corporativo'), validators.email()],
    role: [validators.required('Escolha um papel de acesso')],
    team_id: [validators.numeric('Time deve ser um número'), validators.min(1, 'Time inválido')],
    tenant_id: [validators.required('Informe o tenant'), validators.numeric('Tenant deve ser um número'), validators.min(1, 'Tenant inválido')],
  },
});

const isActive = computed(() => f.values.status === 'active');
const selectedRole = computed(() => ROLE_MAP[f.values.role] || ROLES[2]);

const initials = computed(() => {
  const name = String(f.values.name || '').trim();
  if (!name) return '–';
  const parts = name.split(/\s+/).filter(Boolean);
  const first = parts[0] ? parts[0][0] : '';
  const last = parts.length > 1 ? parts[parts.length - 1][0] : '';
  return (first + last).toUpperCase() || '–';
});

function roleTone(role) {
  const r = ROLE_MAP[String(role).toLowerCase()];
  return r ? r.tone : 'neutral';
}
function roleLabel(role) {
  const r = ROLE_MAP[String(role).toLowerCase()];
  return r ? r.label : (role || '—');
}

// ---- Progresso de preenchimento (apenas visual; não bloqueia) ----------------
const steps = [
  { key: 'identity', label: 'Identidade' },
  { key: 'role', label: 'Papel' },
  { key: 'tenancy', label: 'Lotação' },
];
function isFilled(v) { return v !== '' && v !== null && v !== undefined; }
function stepState(key) {
  if (key === 'identity') {
    const done = isFilled(f.values.name) && isFilled(f.values.email) && !f.errors.name && !f.errors.email;
    return done ? 'done' : (isFilled(f.values.name) || isFilled(f.values.email) ? 'active' : 'todo');
  }
  if (key === 'role') return isFilled(f.values.role) ? 'done' : 'todo';
  if (key === 'tenancy') return isFilled(f.values.tenant_id) && !f.errors.tenant_id ? 'done' : (isFilled(f.values.tenant_id) ? 'active' : 'todo');
  return 'todo';
}

// ---- RolePicker: seleção + navegação por teclado (roving tabindex) ----------
const roleRefs = ref([]);
function registerRoleRef(el, idx) { if (el) roleRefs.value[idx] = el; }
function roleTabindex(value, idx) {
  if (f.values.role === value) return 0;
  if (!ROLE_MAP[f.values.role] && idx === 0) return 0;
  return -1;
}
function selectRole(value) { f.setField('role', value); }
function focusRole(idx) {
  const el = roleRefs.value[idx];
  if (el && typeof el.focus === 'function') el.focus();
}
function onRoleKey(ev, idx) {
  const last = ROLES.length - 1;
  let next = null;
  switch (ev.key) {
    case 'ArrowRight':
    case 'ArrowDown': next = idx >= last ? 0 : idx + 1; break;
    case 'ArrowLeft':
    case 'ArrowUp': next = idx <= 0 ? last : idx - 1; break;
    case 'Home': next = 0; break;
    case 'End': next = last; break;
    case ' ':
    case 'Enter': selectRole(ROLES[idx].value); ev.preventDefault(); return;
    default: return;
  }
  ev.preventDefault();
  selectRole(ROLES[next].value);
  focusRole(next);
}

// ---- Situação ----------------------------------------------------------------
function toggleStatus() {
  f.setField('status', isActive.value ? 'inactive' : 'active');
}

// ---- Verificação de duplicidade por e-mail (fail-soft) ----------------------
// dupState: idle | checking | found | clean | error
const dupState = ref('idle');
const duplicates = ref([]);
let lastChecked = '';

const emailHint = computed(() => {
  switch (dupState.value) {
    case 'checking': return 'Verificando se o e-mail já tem acesso…';
    case 'clean': return 'Nenhum acesso com este e-mail. Tudo certo.';
    case 'found': return 'Encontramos acesso(s) com este e-mail — veja o aviso acima.';
    case 'error': return 'Não deu para verificar duplicidade agora — você ainda pode salvar.';
    default: return 'Validamos o formato e procuramos acessos já existentes.';
  }
});

function onEmailInput(value) {
  f.setField('email', value);
  if (dupState.value !== 'checking') {
    dupState.value = 'idle';
    duplicates.value = [];
  }
}
function dismissDuplicates() {
  dupState.value = 'idle';
  duplicates.value = [];
}
async function checkDuplicates() {
  const email = String(f.values.email || '').trim().toLowerCase();
  if (!email || !f.validateField('email')) return;
  if (email === lastChecked && (dupState.value === 'found' || dupState.value === 'clean')) return;
  lastChecked = email;
  dupState.value = 'checking';
  try {
    const res = await agents.list({ q: email, pageSize: 5 });
    const rows = (res && res.data) || [];
    const matches = rows.filter((row) => String(row.email || '').trim().toLowerCase() === email);
    duplicates.value = matches;
    dupState.value = matches.length ? 'found' : 'clean';
  } catch (e) {
    // a verificação é auxiliar — nunca bloqueia o provisionamento.
    duplicates.value = [];
    dupState.value = 'error';
  }
}

// ---- Submit ------------------------------------------------------------------
const submitError = ref('');

function buildPayload(vals) {
  return {
    name: String(vals.name || '').trim(),
    email: String(vals.email || '').trim().toLowerCase(),
    role: vals.role,
    team_id: vals.team_id === '' || vals.team_id === null ? null : Number(vals.team_id),
    tenant_id: Number(vals.tenant_id),
    status: vals.status || 'active',
  };
}

function submit() {
  submitError.value = '';
  f.handleSubmit(async (vals) => {
    // Confirmação ao provisionar com duplicidade conhecida (e-mail OIDC deve ser único).
    if (dupState.value === 'found' && duplicates.value.length) {
      const ok = await confirm({
        title: 'Provisionar mesmo com duplicidade?',
        message:
          'Encontramos ' + duplicates.value.length + ' acesso(s) com este e-mail. ' +
          'O e-mail é vinculado ao OIDC e deve ser único. Provisionar mesmo assim?',
        confirmLabel: 'Provisionar assim mesmo',
        cancelLabel: 'Revisar',
        danger: true,
      });
      if (!ok) return;
    }
    // Confirmação ao conceder papel admin (escalonamento de privilégio).
    if (vals.role === 'admin') {
      const ok = await confirm({
        title: 'Conceder acesso de administrador?',
        message:
          'O papel Administrador dá controle total sobre agentes, configurações e todos os chamados do tenant. Confirmar?',
        confirmLabel: 'Conceder admin',
        cancelLabel: 'Rever papel',
        danger: true,
      });
      if (!ok) return;
    }
    try {
      const created = await agents.create(buildPayload(vals));
      toast.success('Agente provisionado', { detail: vals.name || vals.email });
      const id = created && (created.id || (created.data && created.data.id));
      router.push(id ? '/agents/' + id : '/agents');
    } catch (e) {
      const msg = e && e.message ? e.message : 'Falha ao provisionar o agente.';
      submitError.value = msg;
      toast.error('Não foi possível provisionar', { detail: msg, code: e && e.status ? 'HTTP ' + e.status : '' });
    }
  });
}

const cancel = () => router.push('/agents');
</script>

<style scoped>
/* ---- Layout em 2 colunas (form + resumo) ---- */
.hf-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 340px;
  gap: var(--ui-space-5);
  align-items: start;
}
.hf-form-card { min-width: 0; }
.hf-form { display: flex; flex-direction: column; }
.hf-aside { display: flex; flex-direction: column; gap: var(--ui-space-4); position: sticky; top: var(--ui-space-5); }

/* ---- Trilha de etapas ---- */
.hf-steps {
  list-style: none; margin: 0 0 var(--ui-space-5); padding: 0;
  display: flex; gap: var(--ui-space-2); flex-wrap: wrap;
}
.hf-step {
  display: inline-flex; align-items: center; gap: var(--ui-space-2);
  font-size: var(--ui-text-sm); font-weight: 600; color: rgb(var(--ui-muted));
}
.hf-step + .hf-step::before {
  content: ""; width: 18px; height: 1px; background: rgb(var(--ui-border-strong));
  margin-right: var(--ui-space-2); flex-shrink: 0;
}
.hf-step-num {
  display: inline-flex; align-items: center; justify-content: center;
  width: 22px; height: 22px; border-radius: 50%; flex-shrink: 0;
  border: 1px solid rgb(var(--ui-border-strong)); background: rgb(var(--ui-bg));
  font-size: var(--ui-text-xs); font-weight: 700;
}
.hf-step[data-state="active"] { color: rgb(var(--ui-fg)); }
.hf-step[data-state="active"] .hf-step-num {
  border-color: rgb(var(--ui-accent)); color: rgb(var(--ui-accent-strong));
  background: rgb(var(--ui-accent) / 0.10);
}
.hf-step[data-state="done"] { color: rgb(var(--ui-fg)); }
.hf-step[data-state="done"] .hf-step-num {
  border-color: rgb(var(--ui-ok)); background: rgb(var(--ui-ok)); color: #fff;
}

/* ---- E-mail + indicadores de verificação ---- */
.hf-email { position: relative; display: flex; align-items: center; }
.hf-email-spin {
  position: absolute; right: 11px; top: 50%; transform: translateY(-50%);
  color: rgb(var(--ui-accent-strong)); pointer-events: none; display: inline-flex;
}
.hf-email-ok {
  position: absolute; right: 11px; top: 50%; transform: translateY(-50%);
  color: rgb(var(--ui-ok)); font-weight: 700; pointer-events: none;
}
.hf-email-warn {
  position: absolute; right: 11px; top: 50%; transform: translateY(-50%);
  color: rgb(var(--ui-warn)); font-weight: 800; pointer-events: none;
}

/* ---- RolePicker (radiogroup) ---- */
.hf-roles {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: var(--ui-space-3);
}
.hf-role {
  position: relative;
  display: flex; flex-direction: column; gap: 6px;
  text-align: left; cursor: pointer; font: inherit; color: rgb(var(--ui-fg));
  background: rgb(var(--ui-bg));
  border: 1px solid rgb(var(--ui-border-strong));
  border-radius: var(--ui-radius-md);
  padding: var(--ui-space-3) var(--ui-space-4);
  transition: border-color .15s ease, background .15s ease, box-shadow .15s ease;
}
.hf-role:hover { border-color: rgb(var(--ui-accent) / 0.6); }
.hf-role:focus-visible {
  outline: 2px solid rgb(var(--ui-accent));
  outline-offset: 2px;
}
.hf-role[data-selected="true"] {
  border-color: rgb(var(--ui-accent));
  background: rgb(var(--ui-accent) / 0.08);
  box-shadow: inset 0 0 0 1px rgb(var(--ui-accent) / 0.5);
}
.hf-role-top { display: flex; align-items: center; gap: var(--ui-space-2); }
.hf-role-name { font-weight: 700; font-family: var(--ui-font-display); }
.hf-role-tag {
  margin-left: auto;
  font-size: var(--ui-text-xs); color: rgb(var(--ui-muted));
}
.hf-role-desc { font-size: var(--ui-text-sm); color: rgb(var(--ui-muted)); line-height: 1.4; }
.hf-role-perms { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 2px; }
.hf-role-perm {
  font-size: var(--ui-text-xs); font-weight: 600;
  padding: 1px 7px; border-radius: var(--ui-radius-pill);
  background: rgb(var(--ui-faint) / 0.5); color: rgb(var(--ui-fg));
}
.hf-role[data-selected="true"] .hf-role-perm {
  background: rgb(var(--ui-accent) / 0.16); color: rgb(var(--ui-accent-strong));
}
.hf-role-flag {
  margin-top: 2px; align-self: flex-start;
  font-size: var(--ui-text-xs); font-weight: 700;
  color: rgb(var(--ui-danger));
  background: rgb(var(--ui-danger) / 0.12);
  padding: 1px 8px; border-radius: var(--ui-radius-pill);
}

/* dot de tom por papel */
.hf-role-dot { width: 9px; height: 9px; border-radius: 50%; flex-shrink: 0; background: rgb(var(--ui-muted)); }
.hf-role-dot[data-tone="error"] { background: rgb(var(--ui-danger)); }
.hf-role-dot[data-tone="warning"] { background: rgb(var(--ui-warn)); }
.hf-role-dot[data-tone="running"] { background: rgb(var(--ui-accent)); }
.hf-role-dot[data-tone="neutral"] { background: rgb(var(--ui-muted)); }
.hf-role-dot[data-tone="success"] { background: rgb(var(--ui-ok)); }

/* ---- Switch de situação (acessível, CSP-safe) ---- */
.hf-switch {
  display: inline-flex; align-items: center; gap: var(--ui-space-3);
  background: rgb(var(--ui-bg)); border: 1px solid rgb(var(--ui-border-strong));
  border-radius: var(--ui-radius-md); padding: 7px 12px; cursor: pointer;
  font: inherit; color: rgb(var(--ui-fg)); width: 100%; text-align: left;
  transition: border-color .15s ease;
}
.hf-switch:hover { border-color: rgb(var(--ui-accent) / 0.6); }
.hf-switch:focus-visible {
  outline: 2px solid rgb(var(--ui-accent));
  outline-offset: 2px;
}
.hf-switch-track {
  position: relative; flex-shrink: 0; width: 40px; height: 22px;
  border-radius: var(--ui-radius-pill); background: rgb(var(--ui-faint) / 0.55);
  transition: background .18s ease;
}
.hf-switch-knob {
  position: absolute; top: 2px; left: 2px; width: 18px; height: 18px; border-radius: 50%;
  background: rgb(var(--ui-surface)); box-shadow: var(--ui-shadow-sm); transition: transform .18s ease;
}
.hf-switch[data-on="true"] .hf-switch-track { background: rgb(var(--ui-ok)); }
.hf-switch[data-on="true"] .hf-switch-knob { transform: translateX(18px); }
.hf-switch-label { font-size: var(--ui-text-sm); font-weight: 600; }

/* ---- Banner de duplicidade ---- */
.hf-dup {
  border: 1px solid rgb(var(--ui-warn) / 0.4); background: rgb(var(--ui-warn) / 0.08);
  border-radius: var(--ui-radius-lg); padding: var(--ui-space-4);
  display: flex; flex-direction: column; gap: var(--ui-space-3);
}
.hf-dup-head { display: flex; align-items: flex-start; gap: var(--ui-space-3); }
.hf-dup-icon {
  flex-shrink: 0; width: 26px; height: 26px; display: inline-flex; align-items: center; justify-content: center;
  border-radius: var(--ui-radius-pill); background: rgb(var(--ui-warn) / 0.18); color: rgb(var(--ui-warn)); font-weight: 800;
}
.hf-dup-text { min-width: 0; }
.hf-dup-title { margin: 0; font-weight: 700; color: rgb(var(--ui-fg)); }
.hf-dup-sub { margin: 2px 0 0; font-size: var(--ui-text-sm); color: rgb(var(--ui-muted)); }
.hf-dup-head > :last-child { margin-left: auto; }
.hf-dup-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--ui-space-2); }
.hf-dup-item {
  display: flex; align-items: center; justify-content: space-between; gap: var(--ui-space-3);
  padding: var(--ui-space-2) var(--ui-space-3);
  background: rgb(var(--ui-surface)); border: 1px solid rgb(var(--ui-border)); border-radius: var(--ui-radius-md);
}
.hf-dup-item-main { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
.hf-dup-name { font-weight: 600; }
.hf-dup-mail { font-size: var(--ui-text-xs); color: rgb(var(--ui-muted)); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.hf-dup-item-side { display: flex; align-items: center; gap: var(--ui-space-2); flex-shrink: 0; }

/* ---- Resumo lateral ---- */
.hf-summary { display: flex; flex-direction: column; gap: var(--ui-space-4); }
.hf-summary-head { display: flex; align-items: center; gap: var(--ui-space-3); }
.hf-avatar {
  display: inline-flex; align-items: center; justify-content: center;
  width: 46px; height: 46px; flex-shrink: 0; border-radius: var(--ui-radius-pill);
  background: rgb(var(--ui-accent) / 0.14); color: rgb(var(--ui-accent-strong));
  font-family: var(--ui-font-display); font-weight: 700;
  transition: background .15s ease, color .15s ease;
}
.hf-avatar[data-tone="error"] { background: rgb(var(--ui-danger) / 0.14); color: rgb(var(--ui-danger)); }
.hf-avatar[data-tone="warning"] { background: rgb(var(--ui-warn) / 0.16); color: rgb(var(--ui-warn)); }
.hf-avatar[data-tone="neutral"] { background: rgb(var(--ui-muted) / 0.16); color: rgb(var(--ui-muted)); }
.hf-summary-id { display: flex; flex-direction: column; min-width: 0; line-height: 1.25; }
.hf-summary-name { margin: 0; font-weight: 700; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.hf-summary-mail { margin: 1px 0 0; font-size: var(--ui-text-xs); color: rgb(var(--ui-muted)); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.hf-summary-foot { margin: 0; font-size: var(--ui-text-sm); }

.hf-dl { margin: 0; display: flex; flex-direction: column; }
.hf-dl-row {
  display: flex; align-items: center; justify-content: space-between; gap: var(--ui-space-3);
  padding: var(--ui-space-3) 0; border-bottom: 1px solid rgb(var(--ui-border));
}
.hf-dl-row:last-child { border-bottom: none; }
.hf-dl-row dt { color: rgb(var(--ui-muted)); font-size: var(--ui-text-sm); font-weight: 600; }
.hf-dl-row dd { margin: 0; color: rgb(var(--ui-fg)); text-align: right; }

/* ---- Ajuda: papéis ---- */
.hf-help { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--ui-space-3); }
.hf-help-item {
  display: flex; align-items: flex-start; gap: var(--ui-space-3);
  padding: var(--ui-space-2); margin: calc(var(--ui-space-2) * -1);
  border-radius: var(--ui-radius-md); transition: background .15s ease;
}
.hf-help-item .hf-role-dot { margin-top: 5px; }
.hf-help-item[data-active="true"] { background: rgb(var(--ui-accent) / 0.07); }
.hf-help-text { display: flex; flex-direction: column; gap: 1px; }
.hf-help-name { font-weight: 600; font-size: var(--ui-text-sm); }
.hf-help-item[data-active="true"] .hf-help-name { color: rgb(var(--ui-accent-strong)); }
.hf-help-desc { font-size: var(--ui-text-xs); color: rgb(var(--ui-muted)); line-height: 1.4; }

/* ---- Dicas ---- */
.hf-tips { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--ui-space-3); }
.hf-tip { display: flex; align-items: flex-start; gap: var(--ui-space-3); font-size: var(--ui-text-sm); color: rgb(var(--ui-muted)); }
.hf-kbd {
  flex-shrink: 0; font-family: var(--ui-font-mono);
  font-size: var(--ui-text-xs); font-weight: 700; color: rgb(var(--ui-fg));
  background: rgb(var(--ui-faint) / 0.5); border: 1px solid rgb(var(--ui-border));
  border-radius: var(--ui-radius-sm); padding: 1px 7px; white-space: nowrap;
}
.hf-link-tip { line-height: 1.45; }

/* ---- Erro de submit ---- */
.hf-submit-error {
  margin: 0 0 var(--ui-space-4); padding: var(--ui-space-3) var(--ui-space-4);
  border: 1px solid rgb(var(--ui-danger) / 0.4); background: rgb(var(--ui-danger) / 0.08);
  color: rgb(var(--ui-danger)); border-radius: var(--ui-radius-md);
  font-size: var(--ui-text-sm); font-weight: 600;
}

/* ---- SubmitBar ---- */
.hf-submitbar {
  display: flex; align-items: center; justify-content: space-between; gap: var(--ui-space-4);
  flex-wrap: wrap; padding-top: var(--ui-space-4); border-top: 1px solid rgb(var(--ui-border));
}
.hf-submit-hint { margin: 0; font-size: var(--ui-text-sm); }
.hf-warn { color: rgb(var(--ui-warn)); font-weight: 600; }
.hf-submit-actions { display: flex; gap: var(--ui-space-2); margin-left: auto; }

/* ---- Responsivo ---- */
@media (max-width: 980px) {
  .hf-grid { grid-template-columns: 1fr; }
  .hf-aside { position: static; }
}
@media (max-width: 640px) {
  .hf-roles { grid-template-columns: 1fr; }
  .hf-submitbar { align-items: stretch; }
  .hf-submit-actions { width: 100%; }
  .hf-submit-actions :deep(.ui-btn) { flex: 1 1 auto; }
}
</style>
