<!--
  UserEditView — Editar usuário (REQ-SHOPDESK-0002)
  Altera o PAPEL (dono/administrador/operador) e o STATUS (ativo/inativo) de um usuário do tenant,
  com soft-delete REAL (desativar = preservar o cadastro e revogar o acesso; reversível).
  Identidade (e-mail/nome/último acesso) é somente-leitura — vem do provedor de identidade (OIDC/SSO).
  Deny por padrão fora do escopo: o RBAC fino é decidido pelo BACKEND (403); a UI não finge permissão.

  100% sobre o kit ui-vue · só tokens --ui-* · CSP-safe (sem style inline / :style / v-html) · a11y · responsivo.
  Componentes do contrato: FormSection (UiFormSection) · RoleSelect (UiFormField + <select>) · FormActions (barra fixa).

  CONTRATO REAL do backend (apps/shopdesk/api/src/server.js:98-102 + repositories/crud-repo.js):
    GET    /v1/users/:id  → linha CRUA da tabela users (email/name/role/active/last_login_at).
                            O CRUD genérico NÃO devolve contexto do editor (viewerRole/isSelf);
                            por isso a UI NÃO finge RBAC client-side — o backend é a fonte da verdade
                            e nega (403), tratado no load()/save(). Só oferecemos a ação quando o
                            recurso REALMENTE a suporta (api.users.update existe).
    PUT    /v1/users/:id  → salva papel/status (update via PUT, não PATCH).
    soft-delete           → PUT { active:false } (a coluna `active` existe). DELETE físico apagaria
                            o registro (RETURNING id) e NÃO preservaria auditoria — por isso NÃO usamos.
  api.js normaliza last_login_at → lastLoginAt (snake→camel) para "Último acesso" funcionar.
  Voltar/Cancelar apontam SEMPRE para /settings/users (domínio real).
-->
<template>
  <UiPageLayout
    eyebrow="Configurações · Usuários"
    :title="pageTitle"
    subtitle="Defina o papel e o status de acesso. A identidade vem do login SSO e é somente-leitura."
    width="default"
    :loading="loading"
    loading-message="Carregando usuário…"
    :error="loadErrorMessage"
    :retryable="true"
    @retry="reload"
  >
    <!-- AÇÕES DE TOPO -->
    <template #actions>
      <UiButton variant="ghost" :to="backTo">Voltar</UiButton>
      <UiButton
        variant="primary"
        :loading="form.submitting.value"
        :disabled="!canSubmit"
        @click="save"
      >
        Salvar alterações
      </UiButton>
    </template>

    <!-- BANNER: alterações não salvas -->
    <template #banner>
      <p v-if="showDirtyBanner" class="ue-banner ue-banner--warn" role="status">
        <span class="ue-banner-dot" aria-hidden="true" />
        Há alterações não salvas neste usuário.
      </p>
    </template>

    <!-- ESTADO: usuário inexistente (id válido, sem dados / 404 / 403 fora de escopo) -->
    <UiEmptyState
      v-if="!loading && !loadError && !user"
      title="Usuário não encontrado"
      description="Este usuário não existe mais, foi removido, ou pertence a outra loja (fora do seu escopo)."
      icon="🔎"
    >
      <template #action>
        <UiButton variant="primary" :to="backTo">Ver usuários</UiButton>
      </template>
    </UiEmptyState>

    <!-- ESTADO NORMAL -->
    <form
      v-else-if="!loading && !loadError && user"
      class="ue-form"
      novalidate
      @submit.prevent="save"
    >
      <!-- IDENTIDADE (somente-leitura) -->
      <UiCard>
        <template #header>
          <div class="ue-id">
            <span class="ue-avatar" :data-tone="roleTone(form.values.role)" aria-hidden="true">{{ initials }}</span>
            <div class="ue-id-main">
              <p class="ue-id-name">{{ displayName }}</p>
              <p class="ue-id-email ui-mono">{{ user.email }}</p>
            </div>
            <div class="ue-id-badges">
              <UiStatusBadge
                :status="effectiveActive ? 'ativo' : 'inativo'"
                :tone="effectiveActive ? 'success' : 'neutral'"
                :label="effectiveActive ? 'Ativo' : 'Inativo'"
                size="md"
              />
              <UiStatusBadge
                :status="form.values.role"
                :tone="roleTone(form.values.role)"
                :label="roleLabel(form.values.role)"
                size="md"
              />
            </div>
          </div>
        </template>

        <dl class="ue-kv">
          <div class="ue-kv-row">
            <dt>Último acesso</dt>
            <dd>{{ lastLoginText }}</dd>
          </div>
          <div class="ue-kv-row">
            <dt>Papel atual</dt>
            <dd>{{ roleLabel(snapshot.role) }}</dd>
          </div>
          <div class="ue-kv-row">
            <dt>Status atual</dt>
            <dd>{{ snapshot.active ? 'Ativo' : 'Inativo' }}</dd>
          </div>
        </dl>

        <template #footer>
          <p class="ue-lock">
            <span aria-hidden="true">🔒</span>
            E-mail e nome são gerenciados pelo login SSO (Keycloak) e não podem ser editados aqui.
          </p>
        </template>
      </UiCard>

      <!-- AVISO quando a edição não está disponível no backend (capacidade real do recurso / deny por padrão) -->
      <p v-if="scopeNotice" class="ue-banner ue-banner--info" role="status">
        <span aria-hidden="true">ℹ️</span>
        {{ scopeNotice }}
      </p>

      <!-- PAPEL (RoleSelect) -->
      <UiCard>
        <UiFormSection
          title="Papel de acesso"
          description="Define o que o usuário pode fazer. Papéis em cascata: dono > administrador > operador."
          :columns="1"
        >
          <UiFormField
            label="Papel"
            required
            :hint="roleHint"
            :error="form.errors.role"
            v-slot="{ id, describedBy, hasError }"
          >
            <select
              :id="id"
              :aria-invalid="hasError || null"
              :aria-describedby="describedBy"
              :disabled="!canEdit"
              :value="form.values.role"
              @change="onRoleChange($event)"
            >
              <option v-for="opt in roleOptions" :key="opt.value" :value="opt.value">
                {{ opt.label }}
              </option>
            </select>
          </UiFormField>

          <!-- explicação do papel selecionado -->
          <ul class="ue-perms" aria-label="O que este papel permite">
            <li v-for="(perm, i) in rolePerms(form.values.role)" :key="i" class="ue-perm">
              <span class="ue-perm-check" aria-hidden="true">✓</span>
              <span>{{ perm }}</span>
            </li>
          </ul>
        </UiFormSection>
      </UiCard>

      <!-- STATUS (ativo/inativo) — segmented radiogroup acessível por teclado -->
      <UiCard>
        <UiFormSection
          title="Status de acesso"
          description="Um usuário inativo continua cadastrado, mas não consegue entrar no sistema."
          :columns="1"
        >
          <div
            class="ue-toggle"
            role="radiogroup"
            aria-label="Status de acesso do usuário"
            @keydown="onStatusKeydown"
          >
            <button
              v-for="opt in statusOptions"
              :key="String(opt.value)"
              type="button"
              role="radio"
              class="ue-toggle-btn"
              :class="{ 'is-on': form.values.active === opt.value }"
              :data-tone="opt.tone"
              :aria-checked="form.values.active === opt.value"
              :tabindex="form.values.active === opt.value ? 0 : -1"
              :disabled="!canEdit"
              @click="setActive(opt.value)"
            >
              <span class="ue-toggle-dot" aria-hidden="true" />
              <span class="ue-toggle-text">
                <span class="ue-toggle-title">{{ opt.label }}</span>
                <span class="ue-toggle-desc ui-muted">{{ opt.description }}</span>
              </span>
            </button>
          </div>

          <p v-if="form.errors.active" class="ue-banner ue-banner--warn" role="alert">
            <span aria-hidden="true">⚠</span>
            {{ form.errors.active }}
          </p>
          <p v-else-if="willDeactivate" class="ue-banner ue-banner--warn" role="alert">
            <span aria-hidden="true">⚠</span>
            Ao salvar como inativo, este usuário perderá o acesso imediatamente.
          </p>
        </UiFormSection>
      </UiCard>

      <!-- RESUMO DAS MUDANÇAS PENDENTES (grounded — só o que de fato muda) -->
      <UiCard v-if="isDirty">
        <UiFormSection title="Mudanças a aplicar" description="Revise antes de salvar." :columns="1">
          <ul class="ue-diff" aria-label="Resumo das alterações pendentes">
            <li v-for="(chg, i) in pendingChanges" :key="i" class="ue-diff-row">
              <span class="ue-diff-field">{{ chg.label }}</span>
              <span class="ue-diff-flow">
                <span class="ue-diff-from">{{ chg.from }}</span>
                <span class="ue-diff-arrow" aria-hidden="true">→</span>
                <span class="ue-diff-to" :data-tone="chg.tone">{{ chg.to }}</span>
              </span>
            </li>
          </ul>
        </UiFormSection>
      </UiCard>

      <!-- ZONA DE RISCO: soft-delete (PUT active=false — preserva o cadastro) -->
      <UiCard v-if="canEdit" class="ue-danger">
        <UiFormSection
          title="Remover acesso (soft-delete)"
          description="Desativa o usuário e revoga o acesso. O registro é preservado para auditoria e pode ser reativado."
          :columns="1"
        >
          <div class="ue-danger-row">
            <p class="ue-danger-copy ui-muted">
              Use quando o usuário deixar a loja. Esta ação é reversível: o cadastro permanece e pode ser reativado.
            </p>
            <UiButton
              type="button"
              variant="danger"
              :loading="removing"
              :disabled="form.submitting.value || alreadyInactive"
              @click="softDelete"
            >
              {{ alreadyInactive ? 'Já está inativo' : 'Remover acesso' }}
            </UiButton>
          </div>
        </UiFormSection>
      </UiCard>

      <!-- BARRA DE AÇÕES (FormActions) -->
      <div class="ue-actions">
        <p class="ue-actions-hint ui-muted">
          {{ isDirty ? 'Revise e salve para aplicar as mudanças.' : 'Nenhuma alteração pendente.' }}
        </p>
        <div class="ue-actions-btns">
          <UiButton type="button" variant="ghost" :disabled="form.submitting.value" @click="cancel">
            Cancelar
          </UiButton>
          <UiButton
            type="button"
            variant="subtle"
            :disabled="!isDirty || form.submitting.value"
            @click="discard"
          >
            Descartar alterações
          </UiButton>
          <UiButton type="submit" variant="primary" :loading="form.submitting.value" :disabled="!canSubmit">
            Salvar alterações
          </UiButton>
        </div>
      </div>
    </form>
  </UiPageLayout>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import {
  UiPageLayout,
  UiCard,
  UiButton,
  UiFormField,
  UiFormSection,
  UiStatusBadge,
  UiEmptyState,
  useForm,
  useToast,
  useConfirm,
  validators,
  format,
} from '../ui/index.js';
import * as api from '../api.js';

const props = defineProps({ id: { type: [String, Number], default: '' } });

const router = useRouter();
const toast = useToast();
const confirm = useConfirm();

// ---------------------------------------------------------------------------
// Recurso REAL: api.users (GET/GET:id/PUT /v1/users — ver src/api.js + api/src/server.js:98-102).
// Fallback DEFENSIVO (alinhado ao irmão UserListView): se um build futuro não expuser o recurso,
// a tela degrada graciosamente — `get` resolve null (vira empty-state) e a edição fica desabilitada
// (canEdit = false), em vez de quebrar na montagem. Nunca lança no import.
// ---------------------------------------------------------------------------
const users = api.users || { get: async () => null };

// capacidade REAL do recurso: só oferecemos editar/desativar se o backend suporta update (PUT).
// (O escopo fino de RBAC é decidido pelo BACKEND, que nega com 403 — tratado em load()/save().)
const canEdit = computed(() => typeof users.update === 'function');

// --- catálogo de PAPÉIS (cascata: owner > admin > operador) ----------------
const ROLES = [
  {
    value: 'owner',
    label: 'Dono',
    perms: [
      'Controle total da loja, faturamento e cobrança',
      'Gerencia todos os usuários e papéis',
      'Acesso a todas as áreas e relatórios',
    ],
  },
  {
    value: 'admin',
    label: 'Administrador',
    perms: [
      'Gerencia catálogo, pedidos, estoque e notas',
      'Convida e edita operadores',
      'Sem acesso ao faturamento da loja',
    ],
  },
  {
    value: 'operador',
    label: 'Operador',
    perms: [
      'Opera pedidos, estoque e atendimento no dia a dia',
      'Não gerencia usuários nem configurações',
    ],
  },
];
const ROLE_BY_VALUE = Object.fromEntries(ROLES.map((r) => [r.value, r]));
const ROLE_VALUES = ROLES.map((r) => r.value);
// fonte ÚNICA da validade de papel (reusada por roleOptions e pela regra do useForm — sem drift).
const isValidRole = (v) => ROLE_VALUES.includes(v);
const roleLabel = (v) => (ROLE_BY_VALUE[v] ? ROLE_BY_VALUE[v].label : v ? format.humanize(v) : '—');
const rolePerms = (v) => (ROLE_BY_VALUE[v] ? ROLE_BY_VALUE[v].perms : []);
// tons DEDICADOS ao papel (não reusam o tom semântico de STATUS, p/ não competir com Ativo/Inativo
// ao lado — alinhado ao mapa do irmão UserListView: owner=running, admin=warning, operador=neutral).
const ROLE_TONES = { owner: 'running', admin: 'warning', operador: 'neutral' };
const roleTone = (v) => ROLE_TONES[v] || 'neutral';

const STATUS_VALUES = [true, false];
const isValidActive = (v) => STATUS_VALUES.includes(v);
const statusOptions = [
  { value: true, label: 'Ativo', tone: 'ok', description: 'Pode entrar e operar a loja normalmente.' },
  { value: false, label: 'Inativo', tone: 'danger', description: 'Acesso bloqueado; o cadastro é preservado.' },
];

const roleOptions = computed(() => ROLES.map((r) => ({ value: r.value, label: r.label })));

// aviso honesto quando a edição NÃO está disponível pelo recurso real (capacidade ausente / deny por padrão).
const scopeNotice = computed(() =>
  canEdit.value
    ? ''
    : 'A edição de papel e status não está habilitada para esta loja — você pode visualizar, mas não editar.',
);

const roleHint = computed(() =>
  canEdit.value
    ? 'Papéis em cascata: dono > administrador > operador.'
    : 'Edição de papel indisponível para esta loja.',
);

// --- estados de carga ------------------------------------------------------
const loading = ref(true);
const loadError = ref(null);
const removing = ref(false);
const user = ref(null);

const loadErrorMessage = computed(() =>
  loadError.value ? loadError.value.message || 'Falha ao carregar o usuário.' : null,
);

// snapshot dos valores carregados (detecta "sujeira" / permite descartar)
const snapshot = reactive({ role: '', active: true });

// --- identidade ------------------------------------------------------------
const userId = computed(() => String(props.id ?? '').trim());
// SEMPRE rota de DOMÍNIO real (lista de usuários).
const backTo = '/settings/users';
const displayName = computed(() => (user.value && (user.value.name || '').trim()) || 'Sem nome');
const pageTitle = computed(() =>
  user.value ? 'Editar ' + (user.value.name || user.value.email || 'usuário') : 'Editar usuário',
);
const initials = computed(() => {
  const base = (user.value && (user.value.name || user.value.email)) || '?';
  const parts = String(base).trim().split(/[\s@.]+/).filter(Boolean);
  const a = parts[0] ? parts[0][0] : '?';
  const b = parts[1] ? parts[1][0] : '';
  return (a + b).toUpperCase();
});
// last_login_at vem snake_case do CRUD genérico; api.js já normaliza p/ lastLoginAt, mas lemos
// ambos defensivamente para nunca exibir "Nunca acessou" em quem de fato acessou.
const lastLogin = computed(() =>
  user.value ? user.value.lastLoginAt ?? user.value.last_login_at ?? null : null,
);
const lastLoginText = computed(() =>
  lastLogin.value ? format.formatDateTime(lastLogin.value) : 'Nunca acessou',
);

// --- formulário ------------------------------------------------------------
const form = useForm({
  initial: { role: '', active: true },
  rules: {
    // validade de papel: usa a MESMA fonte (isValidRole) que monta o select — sem lógica duplicada.
    role: [
      validators.required('Selecione um papel'),
      (v) => (isValidRole(v) ? '' : 'Papel inválido.'),
    ],
    // `active` é booleano enum; regra trivial garante que o valor enviado é um dos permitidos.
    active: [(v) => (isValidActive(v) ? '' : 'Status inválido.')],
  },
});

const effectiveActive = computed(() => form.values.active === true);
const willDeactivate = computed(() => snapshot.active === true && form.values.active === false);
const alreadyInactive = computed(() => snapshot.active === false && form.values.active === false);

const isDirty = computed(
  () =>
    String(form.values.role ?? '') !== String(snapshot.role ?? '') ||
    form.values.active !== snapshot.active,
);
const canSubmit = computed(() => isDirty.value && canEdit.value && !form.submitting.value);
const showDirtyBanner = computed(() => isDirty.value && !loading.value && !loadError.value && !!user.value);

// resumo GROUNDED do que vai mudar (apenas os campos efetivamente alterados).
const pendingChanges = computed(() => {
  const out = [];
  if (String(form.values.role ?? '') !== String(snapshot.role ?? '')) {
    out.push({
      label: 'Papel',
      from: roleLabel(snapshot.role),
      to: roleLabel(form.values.role),
      tone: 'accent',
    });
  }
  if (form.values.active !== snapshot.active) {
    out.push({
      label: 'Status',
      from: snapshot.active ? 'Ativo' : 'Inativo',
      to: form.values.active ? 'Ativo' : 'Inativo',
      tone: form.values.active ? 'ok' : 'danger',
    });
  }
  return out;
});

// --- handlers (CSP-safe: sem :style / inline) ------------------------------
function onRoleChange(event) {
  form.setField('role', event.target.value);
}
function setActive(value) {
  if (!canEdit.value) return;
  form.setField('active', value);
}
// teclado no radiogroup de status: setas/Home/End alternam (padrão WAI-ARIA radiogroup).
function onStatusKeydown(event) {
  if (!canEdit.value) return;
  const keys = ['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp', 'Home', 'End'];
  if (!keys.includes(event.key)) return;
  event.preventDefault();
  const idx = statusOptions.findIndex((o) => o.value === form.values.active);
  let next = idx;
  if (event.key === 'ArrowRight' || event.key === 'ArrowDown') next = (idx + 1) % statusOptions.length;
  else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') next = (idx - 1 + statusOptions.length) % statusOptions.length;
  else if (event.key === 'Home') next = 0;
  else if (event.key === 'End') next = statusOptions.length - 1;
  setActive(statusOptions[next].value);
}

// --- carregamento ----------------------------------------------------------
async function load() {
  loading.value = true;
  loadError.value = null;
  user.value = null;
  if (!userId.value) {
    loading.value = false;
    return;
  }
  try {
    const data = await users.get(userId.value);
    if (!data) {
      user.value = null; // empty-state
    } else {
      user.value = data;
      hydrate(data);
    }
  } catch (e) {
    if (e && (e.status === 404 || e.status === 403)) {
      // 404 inexistente OU 403 fora do escopo (backend é a fonte da verdade do RBAC):
      // tratamos ambos como empty-state e NÃO vazamos a existência do recurso.
      user.value = null;
    } else {
      loadError.value = e;
    }
  } finally {
    loading.value = false;
  }
}
const reload = load;

function hydrate(data) {
  const role = data.role || '';
  const active = data.active !== false; // default ativo se ausente
  form.setField('role', role);
  form.setField('active', active);
  snapshot.role = role;
  snapshot.active = active;

  // estado limpo após hidratar
  for (const k of Object.keys(form.errors)) delete form.errors[k];
  for (const k of Object.keys(form.touched)) delete form.touched[k];
}

// --- ações -----------------------------------------------------------------
async function save() {
  if (!isDirty.value) {
    toast.info('Nada para salvar — não há alterações.');
    return;
  }
  if (!canEdit.value) {
    toast.warning('A edição não está disponível para este usuário.');
    return;
  }
  // confirmação extra ao desativar (efeito imediato no acesso)
  if (willDeactivate.value) {
    const ok = await confirm({
      title: 'Desativar este usuário?',
      message: 'Ao salvar, ' + displayName.value + ' perderá o acesso ao sistema imediatamente.',
      confirmLabel: 'Desativar e salvar',
      cancelLabel: 'Continuar editando',
      danger: true,
    });
    if (!ok) return;
  }

  await form.handleSubmit(async (values) => {
    try {
      const patch = {};
      if (values.role !== snapshot.role) patch.role = values.role;
      if (values.active !== snapshot.active) patch.active = values.active;

      if (Object.keys(patch).length === 0) {
        toast.info('Nenhuma alteração para salvar.');
        return;
      }

      const updated = await users.update(userId.value, patch);
      const next = updated && typeof updated === 'object' ? { ...user.value, ...updated } : { ...user.value, ...patch };
      user.value = next;
      // novo baseline (deixa de estar "sujo")
      snapshot.role = next.role ?? values.role;
      snapshot.active = next.active !== false;
      form.setField('role', snapshot.role);
      form.setField('active', snapshot.active);
      toast.success('Usuário atualizado com sucesso.');
    } catch (e) {
      // o backend é quem aplica o RBAC fino: 403 = fora do escopo de quem edita (deny por padrão).
      if (e && e.status === 403) {
        toast.error('Você não tem permissão para editar este usuário.', { code: 'HTTP 403' });
      } else {
        toast.error('Não foi possível salvar o usuário.', {
          detail: (e && e.message) || '',
          code: e && e.status ? 'HTTP ' + e.status : '',
        });
      }
      throw e;
    }
  });
}

// soft-delete REAL: PUT { active:false } (NÃO DELETE físico) — preserva o cadastro p/ auditoria
// e permite reativar depois pelo toggle de status / pela lista.
async function softDelete() {
  if (!canEdit.value) return;
  const ok = await confirm({
    title: 'Remover o acesso de ' + displayName.value + '?',
    message:
      'O usuário será desativado e perderá o acesso imediatamente. O registro é preservado para auditoria e pode ser reativado depois.',
    confirmLabel: 'Remover acesso',
    cancelLabel: 'Cancelar',
    danger: true,
  });
  if (!ok) return;

  removing.value = true;
  try {
    await users.update(userId.value, { active: false });
    // reflete o soft-delete no estado local (usuário fica inativo)
    snapshot.active = false;
    form.setField('active', false);
    if (user.value) user.value = { ...user.value, active: false };
    toast.success('Acesso removido. O usuário foi desativado (cadastro preservado).');
    router.push(backTo);
  } catch (e) {
    if (e && e.status === 403) {
      toast.error('Você não tem permissão para remover o acesso deste usuário.', { code: 'HTTP 403' });
    } else {
      toast.error('Não foi possível remover o acesso.', {
        detail: (e && e.message) || '',
        code: e && e.status ? 'HTTP ' + e.status : '',
      });
    }
  } finally {
    removing.value = false;
  }
}

async function discard() {
  if (!isDirty.value) return;
  const ok = await confirm({
    title: 'Descartar alterações?',
    message: 'As mudanças não salvas serão perdidas e o formulário volta aos valores originais.',
    confirmLabel: 'Descartar',
    cancelLabel: 'Continuar editando',
    danger: true,
  });
  if (!ok) return;
  form.setField('role', snapshot.role);
  form.setField('active', snapshot.active);
  for (const k of Object.keys(form.errors)) delete form.errors[k];
  toast.info('Alterações descartadas.');
}

async function cancel() {
  if (isDirty.value) {
    const ok = await confirm({
      title: 'Sair sem salvar?',
      message: 'Você tem alterações não salvas neste usuário. Deseja sair mesmo assim?',
      confirmLabel: 'Sair sem salvar',
      cancelLabel: 'Continuar editando',
      danger: true,
    });
    if (!ok) return;
  }
  router.push(backTo);
}

onMounted(load);
</script>

<style scoped>
/* ---- banners ---- */
.ue-banner {
  display: flex;
  align-items: center;
  gap: var(--ui-space-2);
  margin: 0;
  padding: var(--ui-space-2) var(--ui-space-4);
  border-radius: var(--ui-radius-md);
  font-size: var(--ui-text-sm);
  font-weight: 600;
}
.ue-banner--warn {
  border: 1px solid rgb(var(--ui-warn) / 0.4);
  background: rgb(var(--ui-warn) / 0.1);
  color: rgb(var(--ui-warn));
}
.ue-banner--info {
  border: 1px solid rgb(var(--ui-accent) / 0.35);
  background: rgb(var(--ui-accent) / 0.08);
  color: rgb(var(--ui-accent-strong));
}
.ue-banner-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: currentColor;
  flex-shrink: 0;
}

/* ---- form ---- */
.ue-form {
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-4);
}

/* ---- identidade ---- */
.ue-id {
  display: flex;
  align-items: center;
  gap: var(--ui-space-3);
  width: 100%;
  flex-wrap: wrap;
}
.ue-avatar {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 48px;
  height: 48px;
  border-radius: var(--ui-radius-pill);
  font-weight: 700;
  font-size: var(--ui-text-md);
  flex-shrink: 0;
  background: rgb(var(--ui-muted) / 0.16);
  color: rgb(var(--ui-muted));
}
/* tom do avatar segue o PAPEL (dedicado), sem competir com o status ativo/inativo */
.ue-avatar[data-tone='running'] {
  background: rgb(var(--ui-accent) / 0.16);
  color: rgb(var(--ui-accent-strong));
}
.ue-avatar[data-tone='warning'] {
  background: rgb(var(--ui-warn) / 0.18);
  color: rgb(var(--ui-warn));
}
.ue-avatar[data-tone='neutral'] {
  background: rgb(var(--ui-muted) / 0.16);
  color: rgb(var(--ui-muted));
}
.ue-id-main {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  flex: 1 1 auto;
}
.ue-id-name {
  margin: 0;
  font-size: var(--ui-text-lg);
  font-weight: 700;
  color: rgb(var(--ui-fg));
}
.ue-id-email {
  margin: 0;
  font-size: var(--ui-text-sm);
  color: rgb(var(--ui-muted));
  word-break: break-all;
}
.ue-id-badges {
  display: flex;
  gap: var(--ui-space-2);
  flex-wrap: wrap;
  flex-shrink: 0;
}

.ue-kv {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: var(--ui-space-4);
  margin: 0;
}
.ue-kv-row {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.ue-kv dt {
  font-size: var(--ui-text-xs);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: rgb(var(--ui-muted));
  font-weight: 600;
}
.ue-kv dd {
  margin: 0;
  font-size: var(--ui-text-md);
  color: rgb(var(--ui-fg));
}
.ue-lock {
  display: flex;
  align-items: center;
  gap: var(--ui-space-2);
  margin: 0;
  font-size: var(--ui-text-xs);
  color: rgb(var(--ui-muted));
}

/* ---- lista de permissões do papel ---- */
.ue-perms {
  list-style: none;
  margin: var(--ui-space-2) 0 0;
  padding: var(--ui-space-3);
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-2);
  background: rgb(var(--ui-surface-2));
  border: 1px solid rgb(var(--ui-border));
  border-radius: var(--ui-radius-md);
}
.ue-perm {
  display: flex;
  align-items: flex-start;
  gap: var(--ui-space-2);
  font-size: var(--ui-text-sm);
  color: rgb(var(--ui-fg));
}
.ue-perm-check {
  color: rgb(var(--ui-ok));
  font-weight: 700;
  flex-shrink: 0;
  line-height: 1.5;
}

/* ---- toggle de status (segmented) ---- */
.ue-toggle {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: var(--ui-space-3);
}
.ue-toggle-btn {
  display: flex;
  align-items: flex-start;
  gap: var(--ui-space-3);
  text-align: left;
  padding: var(--ui-space-3) var(--ui-space-4);
  border: 1px solid rgb(var(--ui-border-strong));
  border-radius: var(--ui-radius-md);
  background: rgb(var(--ui-bg));
  color: rgb(var(--ui-fg));
  cursor: pointer;
  font: inherit;
  transition: border-color 0.15s ease, background-color 0.15s ease;
}
.ue-toggle-btn:hover:not(:disabled) {
  border-color: rgb(var(--ui-accent));
}
.ue-toggle-btn:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}
.ue-toggle-btn.is-on[data-tone='ok'] {
  border-color: rgb(var(--ui-ok));
  background: rgb(var(--ui-ok) / 0.08);
}
.ue-toggle-btn.is-on[data-tone='danger'] {
  border-color: rgb(var(--ui-danger));
  background: rgb(var(--ui-danger) / 0.08);
}
.ue-toggle-dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  border: 2px solid rgb(var(--ui-border-strong));
  margin-top: 3px;
  flex-shrink: 0;
}
.ue-toggle-btn.is-on[data-tone='ok'] .ue-toggle-dot {
  border-color: rgb(var(--ui-ok));
  background: rgb(var(--ui-ok));
}
.ue-toggle-btn.is-on[data-tone='danger'] .ue-toggle-dot {
  border-color: rgb(var(--ui-danger));
  background: rgb(var(--ui-danger));
}
.ue-toggle-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.ue-toggle-title {
  font-weight: 600;
  font-size: var(--ui-text-md);
}
.ue-toggle-desc {
  font-size: var(--ui-text-sm);
}

/* ---- resumo de mudanças pendentes ---- */
.ue-diff {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-2);
}
.ue-diff-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ui-space-3);
  flex-wrap: wrap;
  padding: var(--ui-space-2) var(--ui-space-3);
  border: 1px solid rgb(var(--ui-border));
  border-radius: var(--ui-radius-md);
  background: rgb(var(--ui-surface-2));
}
.ue-diff-field {
  font-size: var(--ui-text-sm);
  font-weight: 600;
  color: rgb(var(--ui-muted));
}
.ue-diff-flow {
  display: flex;
  align-items: center;
  gap: var(--ui-space-2);
  font-size: var(--ui-text-sm);
}
.ue-diff-from {
  color: rgb(var(--ui-muted));
  text-decoration: line-through;
}
.ue-diff-arrow {
  color: rgb(var(--ui-muted));
}
.ue-diff-to {
  font-weight: 700;
  color: rgb(var(--ui-fg));
}
.ue-diff-to[data-tone='accent'] {
  color: rgb(var(--ui-accent-strong));
}
.ue-diff-to[data-tone='ok'] {
  color: rgb(var(--ui-ok));
}
.ue-diff-to[data-tone='danger'] {
  color: rgb(var(--ui-danger));
}

/* ---- zona de risco ---- */
.ue-danger {
  border-color: rgb(var(--ui-danger) / 0.4);
}
.ue-danger-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ui-space-4);
  flex-wrap: wrap;
}
.ue-danger-copy {
  margin: 0;
  font-size: var(--ui-text-sm);
  flex: 1 1 280px;
}

/* ---- barra de ações ---- */
.ue-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ui-space-4);
  flex-wrap: wrap;
  padding: var(--ui-space-4) var(--ui-space-5);
  border: 1px solid rgb(var(--ui-border));
  border-radius: var(--ui-radius-lg);
  background: rgb(var(--ui-surface-2));
  position: sticky;
  bottom: var(--ui-space-4);
  box-shadow: var(--ui-shadow-sm);
}
.ue-actions-hint {
  margin: 0;
  font-size: var(--ui-text-sm);
}
.ue-actions-btns {
  display: flex;
  gap: var(--ui-space-2);
  flex-wrap: wrap;
}

@media (max-width: 860px) {
  .ue-kv {
    grid-template-columns: 1fr;
  }
  .ue-toggle {
    grid-template-columns: 1fr;
  }
  .ue-actions {
    flex-direction: column;
    align-items: stretch;
    position: static;
  }
  .ue-actions-btns {
    justify-content: flex-end;
  }
}
</style>
