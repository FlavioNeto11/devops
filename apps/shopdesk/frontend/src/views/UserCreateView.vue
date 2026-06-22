<template>
  <UiPageLayout
    eyebrow="Configurações · Equipe"
    title="Convidar usuário"
    subtitle="Convide um operador ou administrador por e-mail. O acesso é liberado via SSO ao aceitar o convite."
    width="wide"
  >
    <template #actions>
      <UiButton variant="ghost" to="/settings/users">Voltar à equipe</UiButton>
      <UiButton
        v-if="!invited"
        variant="primary"
        :loading="form.submitting.value"
        @click="onSubmit"
      >Enviar convite</UiButton>
    </template>

    <!-- Banner: SSO indisponível / contexto de tenant -->
    <template #banner>
      <div class="sso-banner" role="note">
        <span class="sso-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="3" y="11" width="18" height="10" rx="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
        </span>
        <p class="sso-text">
          Os convidados acessam o <strong>{{ tenantLabel }}</strong> pelo login único (SSO). Nenhuma
          senha é criada aqui — o convidado entra com a própria conta corporativa.
        </p>
      </div>
    </template>

    <!-- Estado: convite enviado (sucesso) -->
    <UiCard v-if="invited" class="invited-card">
      <div class="invited">
        <div class="invited-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M22 2 11 13" />
            <path d="M22 2 15 22l-4-9-9-4 20-7z" />
          </svg>
        </div>
        <div class="invited-body">
          <h2 class="invited-title">Convite enviado</h2>
          <p class="invited-sub">
            Enviamos um convite de acesso para
            <strong class="ui-mono">{{ invited.email }}</strong>
            como <UiStatusBadge :status="invited.role" :label="roleLabelFor(invited.role)" :tone="roleTone(invited.role)" />.
          </p>
          <p class="invited-note ui-muted">
            O convidado aparecerá na equipe assim que aceitar e fizer o primeiro login via SSO.
          </p>
          <div class="invited-actions">
            <UiButton variant="primary" @click="resetForNew">Convidar outra pessoa</UiButton>
            <UiButton variant="ghost" to="/settings/users">Ver equipe</UiButton>
          </div>
        </div>
      </div>
    </UiCard>

    <!-- Estado: formulário de convite -->
    <form v-else class="layout" novalidate @submit.prevent="onSubmit">
      <div class="layout-main">
        <UiCard>
          <UiFormSection
            title="Dados do convidado"
            description="Informe o e-mail corporativo. O nome é opcional e ajuda a identificar a pessoa antes do primeiro acesso."
            :columns="2"
          >
            <UiFormField
              label="E-mail"
              required
              full-width
              :error="form.errors.email || duplicateError"
              hint="E-mail corporativo para onde o convite será enviado."
            >
              <template #default="{ id, describedBy, hasError }">
                <input
                  :id="id"
                  type="email"
                  inputmode="email"
                  autocomplete="off"
                  placeholder="nome@empresa.com.br"
                  :aria-invalid="hasError || duplicateError ? 'true' : null"
                  :aria-describedby="describedBy"
                  :value="form.values.email"
                  @input="onEmailInput($event.target.value)"
                />
              </template>
            </UiFormField>

            <UiFormField
              label="Nome"
              full-width
              :error="form.errors.name"
              hint="Opcional — como a pessoa será exibida na equipe."
            >
              <template #default="{ id, describedBy }">
                <input
                  :id="id"
                  type="text"
                  autocomplete="off"
                  placeholder="Ex.: Maria Silva"
                  :aria-describedby="describedBy"
                  :value="form.values.name"
                  @input="form.setField('name', $event.target.value)"
                />
              </template>
            </UiFormField>
          </UiFormSection>

          <UiFormSection
            title="Papel e permissões"
            description="O papel define o que a pessoa pode fazer no ShopDesk. Você pode alterá-lo depois."
            :columns="1"
          >
            <UiFormField
              label="Papel"
              required
              :error="form.errors.role"
              hint="Selecione o nível de acesso adequado à função."
            >
              <template #default="{ id, describedBy, hasError }">
                <div
                  class="roles"
                  role="radiogroup"
                  :aria-describedby="describedBy"
                  :aria-invalid="hasError ? 'true' : null"
                  aria-label="Papel do convidado"
                >
                  <button
                    v-for="(opt, idx) in roleOptions"
                    :id="opt.value === roleOptions[0].value ? id : null"
                    :key="opt.value"
                    :ref="(el) => setRoleRef(el, idx)"
                    type="button"
                    class="role-card"
                    role="radio"
                    :aria-checked="form.values.role === opt.value ? 'true' : 'false'"
                    :tabindex="rovingTabindex(opt.value)"
                    :data-selected="form.values.role === opt.value ? 'true' : null"
                    :data-tone="opt.tone"
                    @click="selectRole(opt.value)"
                    @keydown.left.prevent="moveRole(idx, -1)"
                    @keydown.up.prevent="moveRole(idx, -1)"
                    @keydown.right.prevent="moveRole(idx, 1)"
                    @keydown.down.prevent="moveRole(idx, 1)"
                  >
                    <span class="role-card-top">
                      <span class="role-card-icon" aria-hidden="true">
                        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                          <path :d="opt.icon" />
                        </svg>
                      </span>
                      <span class="role-card-name">{{ opt.label }}</span>
                      <span class="role-card-check" aria-hidden="true">
                        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
                          <path d="M20 6 9 17l-5-5" />
                        </svg>
                      </span>
                    </span>
                    <span class="role-card-desc">{{ opt.description }}</span>
                  </button>
                </div>
              </template>
            </UiFormField>

            <UiFormField
              label="Acesso ativo"
              full-width
              hint="Convidados ativos podem entrar assim que aceitarem. Desative para preparar o convite sem liberar o acesso ainda."
            >
              <template #default="{ id, describedBy }">
                <label :for="id" class="switch">
                  <input
                    :id="id"
                    type="checkbox"
                    class="switch-input"
                    :aria-describedby="describedBy"
                    :checked="form.values.active"
                    @change="form.setField('active', $event.target.checked)"
                  />
                  <span class="switch-track" aria-hidden="true"><span class="switch-thumb" /></span>
                  <span class="switch-text">
                    {{ form.values.active ? 'Ativo — pode acessar ao aceitar' : 'Inativo — convite preparado, acesso bloqueado' }}
                  </span>
                </label>
              </template>
            </UiFormField>
          </UiFormSection>
        </UiCard>
      </div>

      <aside class="layout-side">
        <UiCard title="Resumo do convite" class="summary-card">
          <dl class="summary">
            <div class="summary-row">
              <dt>E-mail</dt>
              <dd class="ui-mono">{{ form.values.email || '—' }}</dd>
            </div>
            <div class="summary-row">
              <dt>Nome</dt>
              <dd>{{ form.values.name || 'Não informado' }}</dd>
            </div>
            <div class="summary-row">
              <dt>Papel</dt>
              <dd><UiStatusBadge :status="form.values.role" :label="roleLabelFor(form.values.role)" :tone="roleTone(form.values.role)" /></dd>
            </div>
            <div class="summary-row">
              <dt>Acesso</dt>
              <dd>
                <UiStatusBadge
                  :status="form.values.active ? 'ativo' : 'inativo'"
                  :label="form.values.active ? 'Ativo' : 'Inativo'"
                  :tone="form.values.active ? 'success' : 'neutral'"
                />
              </dd>
            </div>
          </dl>
          <p class="summary-perm ui-muted">{{ selectedRoleDescription }}</p>
        </UiCard>

        <UiCard title="Equipe atual" class="team-card">
          <template #actions>
            <UiButton size="sm" variant="ghost" :disabled="team.loading" @click="loadTeam">Atualizar</UiButton>
          </template>

          <!-- Estado equipe: loading -->
          <div v-if="team.loading" class="team-state">
            <UiLoadingState variant="skeleton" :skeleton-lines="3" title="Carregando equipe…" />
          </div>

          <!-- Estado equipe: erro -->
          <div v-else-if="team.error" class="team-state">
            <UiErrorState :message="team.error" :code="team.code" :retryable="true" @retry="loadTeam" />
          </div>

          <!-- Estado equipe: vazia -->
          <div v-else-if="team.items.length === 0" class="team-state">
            <UiEmptyState
              title="Nenhum membro ainda"
              description="Este será o primeiro convite da equipe."
              icon="users"
            />
          </div>

          <!-- Estado equipe: normal -->
          <ul v-else class="team-list">
            <li v-for="m in team.items" :key="m.id || m.email" class="team-item">
              <span class="team-avatar" aria-hidden="true">{{ initialsOf(m) }}</span>
              <span class="team-meta">
                <span class="team-name">{{ m.name || m.email }}</span>
                <span class="team-email ui-mono">{{ m.email }}</span>
              </span>
              <UiStatusBadge :status="m.role" :label="roleLabelFor(m.role)" :tone="roleTone(m.role)" size="sm" />
            </li>
          </ul>

          <template v-if="!team.loading && !team.error" #footer>
            <span>{{ team.items.length }} {{ team.items.length === 1 ? 'membro' : 'membros' }} no {{ tenantLabel }}.</span>
          </template>
        </UiCard>
      </aside>
    </form>

    <template #footer>
      <span>Os campos marcados com <span class="req-mark">*</span> são obrigatórios.</span>
    </template>
  </UiPageLayout>
</template>

<script setup>
import { reactive, ref, computed } from 'vue';
import { useRouter } from 'vue-router';
import {
  UiPageLayout, UiCard, UiButton, UiFormSection, UiFormField,
  UiStatusBadge, UiEmptyState, UiLoadingState, UiErrorState,
  useForm, useToast, useConfirm, validators,
} from '../ui/index.js';
import * as api from '../api.js';

const router = useRouter();
const toast = useToast();
const confirm = useConfirm();
const { required, email, minLen } = validators;

const tenantLabel = 'ShopDesk';

// Papéis canônicos da entidade users (enumValues: owner, admin, operador).
const roleOptions = [
  {
    value: 'operador',
    label: 'Operador',
    tone: 'neutral',
    description: 'Opera o dia a dia: pedidos, carrinhos e estoque. Sem acesso a configurações.',
    icon: 'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8z',
  },
  {
    value: 'admin',
    label: 'Administrador',
    tone: 'running',
    description: 'Gerencia a loja, a equipe e as configurações. Não pode transferir a posse.',
    icon: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z',
  },
  {
    value: 'owner',
    label: 'Proprietário',
    tone: 'warning',
    description: 'Controle total, incluindo cobrança e posse. Conceda com cuidado.',
    icon: 'M5 16 3 5l5.5 5L12 4l3.5 6L21 5l-2 11H5zM5 20h14',
  },
];

function roleLabelFor(value) {
  const opt = roleOptions.find((o) => o.value === value);
  return opt ? opt.label : (value || '—');
}
function roleTone(value) {
  const opt = roleOptions.find((o) => o.value === value);
  return opt ? opt.tone : 'neutral';
}

// ----- radiogroup com roving tabindex (padrão ARIA: só 1 tab-stop; setas movem foco+seleção) -----
const roleRefs = [];
function setRoleRef(el, idx) {
  if (el) roleRefs[idx] = el;
}
// Só o radio selecionado é tab-stop (0). Se nada estiver selecionado, o 1º recebe o foco.
function rovingTabindex(value) {
  const current = form.values.role;
  const isSelected = current === value;
  if (current) return isSelected ? '0' : '-1';
  return value === roleOptions[0].value ? '0' : '-1';
}
function selectRole(value) {
  form.setField('role', value);
}
// Move seleção+foco entre opções, com wrap (setas esquerda/cima = anterior; direita/baixo = próxima).
function moveRole(idx, delta) {
  const n = roleOptions.length;
  const next = (idx + delta + n) % n;
  selectRole(roleOptions[next].value);
  const el = roleRefs[next];
  if (el && typeof el.focus === 'function') el.focus();
}

const form = useForm({
  initial: { email: '', name: '', role: 'operador', active: true },
  rules: {
    email: [required('Informe o e-mail do convidado'), email('E-mail inválido')],
    name: [minLen(2, 'Nome muito curto')],
    role: [required('Selecione um papel')],
  },
});

const selectedRoleDescription = computed(() => {
  const opt = roleOptions.find((o) => o.value === form.values.role);
  return opt ? opt.description : 'Selecione um papel para ver as permissões.';
});

// ----- equipe atual (contexto) -----
// `loaded` marca se a equipe foi carregada com sucesso ao menos uma vez — usado para qualificar a
// checagem local de duplicata como DICA (parcial) em vez de afirmação. A verdade fica no 409 do servidor.
const team = reactive({ loading: false, error: '', code: '', items: [], loaded: false });

function normalizeList(res) {
  if (Array.isArray(res)) return res;
  if (res && Array.isArray(res.data)) return res.data;
  if (res && Array.isArray(res.items)) return res.items;
  return [];
}

async function loadTeam() {
  team.loading = true;
  team.error = '';
  team.code = '';
  try {
    const res = await api.users.list();
    team.items = normalizeList(res);
    team.loaded = true;
  } catch (e) {
    team.error = e.message || 'Não foi possível carregar a equipe.';
    team.code = e.status ? String(e.status) : '';
  } finally {
    team.loading = false;
  }
}

function initialsOf(m) {
  const src = (m && (m.name || m.email)) || '?';
  const parts = String(src).replace(/@.*/, '').split(/[\s._-]+/).filter(Boolean);
  const a = parts[0] ? parts[0][0] : '?';
  const b = parts.length > 1 ? parts[parts.length - 1][0] : '';
  return (a + b).toUpperCase();
}

// duplicata: DICA antecipada — só sinaliza um e-mail JÁ visto na equipe carregada. É parcial por
// natureza (paginação/escopo), então NUNCA bloqueia por ausência; a verdade é o 409 do servidor.
// Só avalia quando a equipe foi carregada com sucesso (team.loaded), evitando falso negativo silencioso.
const duplicateError = computed(() => {
  if (!team.loaded) return '';
  const val = String(form.values.email || '').trim().toLowerCase();
  if (!val) return '';
  const hit = team.items.find((m) => String(m.email || '').trim().toLowerCase() === val);
  return hit ? 'Este e-mail já faz parte da equipe.' : '';
});

function onEmailInput(raw) {
  form.setField('email', String(raw || '').trim());
}

// ----- envio do convite -----
const invited = ref(null);

function toPayload(v) {
  return {
    email: String(v.email || '').trim().toLowerCase(),
    name: v.name ? String(v.name).trim() : '',
    role: v.role,
    active: !!v.active,
  };
}

async function onSubmit() {
  if (duplicateError.value) {
    toast.warning('Este e-mail já faz parte da equipe.');
    return;
  }
  await form.handleSubmit(async (values) => {
    const payload = toPayload(values);

    // Conceder posse é ação sensível → confirmação explícita.
    if (payload.role === 'owner') {
      const ok = await confirm({
        title: 'Convidar como proprietário?',
        message: 'O proprietário tem controle total, incluindo cobrança e transferência de posse. Tem certeza de que deseja conceder esse nível de acesso?',
        confirmLabel: 'Convidar como proprietário',
        danger: true,
      });
      if (!ok) return;
    }

    try {
      const res = await api.users.create(payload);
      const created = res && res.data ? res.data : res;
      invited.value = created && created.email ? created : payload;
      toast.success('Convite enviado para ' + payload.email + '.');
    } catch (e) {
      if (e.status === 409) {
        toast.error('Este e-mail já foi convidado.', { code: '409' });
      } else {
        toast.error('Falha ao enviar o convite.', { detail: e.message, code: e.status ? String(e.status) : '' });
      }
    }
  });
}

function resetForNew() {
  form.reset();
  invited.value = null;
  loadTeam();
}

loadTeam();
</script>

<style scoped>
.layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 360px;
  gap: var(--ui-space-5);
  align-items: start;
}
.layout-side {
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-4);
  position: sticky;
  top: var(--ui-space-5);
}
@media (max-width: 960px) {
  .layout { grid-template-columns: 1fr; }
  .layout-side { position: static; }
}

/* banner SSO */
.sso-banner {
  display: flex;
  align-items: flex-start;
  gap: var(--ui-space-3);
  padding: var(--ui-space-3) var(--ui-space-4);
  border-radius: var(--ui-radius-md);
  border: 1px solid rgb(var(--ui-accent) / 0.35);
  background: rgb(var(--ui-accent) / 0.07);
}
.sso-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: var(--ui-radius-md);
  background: rgb(var(--ui-accent) / 0.16);
  color: rgb(var(--ui-accent-strong));
  flex-shrink: 0;
}
.sso-text { margin: 0; font-size: var(--ui-text-sm); line-height: 1.5; }

/* cartões de papel (radiogroup) */
.roles {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: var(--ui-space-3);
}
@media (max-width: 720px) { .roles { grid-template-columns: 1fr; } }
.role-card {
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-2);
  text-align: left;
  padding: var(--ui-space-3) var(--ui-space-4);
  border-radius: var(--ui-radius-md);
  border: 1px solid rgb(var(--ui-border-strong));
  background: rgb(var(--ui-surface));
  cursor: pointer;
  transition: border-color .15s ease, background .15s ease, box-shadow .15s ease;
}
.role-card:hover { border-color: rgb(var(--ui-accent) / 0.6); }
.role-card:focus-visible { outline: 2px solid rgb(var(--ui-accent)); outline-offset: 2px; }
.role-card[data-selected="true"] {
  border-color: rgb(var(--ui-accent));
  background: rgb(var(--ui-accent) / 0.06);
  box-shadow: inset 0 0 0 1px rgb(var(--ui-accent));
}
.role-card-top { display: flex; align-items: center; gap: var(--ui-space-2); }
.role-card-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  border-radius: var(--ui-radius-sm);
  background: rgb(var(--ui-muted) / 0.14);
  color: rgb(var(--ui-muted));
  flex-shrink: 0;
}
.role-card[data-tone="running"] .role-card-icon { background: rgb(var(--ui-accent) / 0.16); color: rgb(var(--ui-accent-strong)); }
.role-card[data-tone="warning"] .role-card-icon { background: rgb(var(--ui-warn) / 0.18); color: rgb(var(--ui-warn)); }
.role-card-name { font-weight: 600; font-size: var(--ui-text-sm); flex: 1; }
.role-card-check {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  color: rgb(var(--ui-accent-strong));
  opacity: 0;
  transform: scale(.7);
  transition: opacity .12s ease, transform .12s ease;
}
.role-card[data-selected="true"] .role-card-check { opacity: 1; transform: scale(1); }
.role-card-desc { font-size: var(--ui-text-xs); color: rgb(var(--ui-muted)); line-height: 1.45; }

/* toggle de acesso */
.switch {
  display: inline-flex;
  align-items: center;
  gap: var(--ui-space-3);
  cursor: pointer;
  user-select: none;
}
.switch-input {
  position: absolute;
  width: 1px;
  height: 1px;
  opacity: 0;
  pointer-events: none;
}
.switch-track {
  position: relative;
  width: 42px;
  height: 24px;
  border-radius: var(--ui-radius-pill);
  background: rgb(var(--ui-border-strong));
  transition: background .15s ease;
  flex-shrink: 0;
}
.switch-thumb {
  position: absolute;
  top: 3px;
  left: 3px;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: rgb(var(--ui-surface));
  box-shadow: var(--ui-shadow-sm);
  transition: transform .15s ease;
}
.switch-input:checked + .switch-track { background: rgb(var(--ui-accent)); }
.switch-input:checked + .switch-track .switch-thumb { transform: translateX(18px); }
.switch-input:focus-visible + .switch-track { outline: 2px solid rgb(var(--ui-accent)); outline-offset: 2px; }
.switch-text { font-size: var(--ui-text-sm); }

/* resumo */
.summary { margin: 0; display: flex; flex-direction: column; gap: var(--ui-space-2); }
.summary-row { display: flex; align-items: center; justify-content: space-between; gap: var(--ui-space-3); }
.summary-row dt { color: rgb(var(--ui-muted)); font-size: var(--ui-text-sm); }
.summary-row dd { margin: 0; font-weight: 600; font-size: var(--ui-text-sm); text-align: right; overflow-wrap: anywhere; }
.summary-perm {
  margin: var(--ui-space-3) 0 0;
  padding-top: var(--ui-space-3);
  border-top: 1px solid rgb(var(--ui-border));
  font-size: var(--ui-text-xs);
  line-height: 1.5;
}

/* equipe */
.team-state { margin-top: var(--ui-space-2); }
.team-list { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: var(--ui-space-2); }
.team-item {
  display: flex;
  align-items: center;
  gap: var(--ui-space-3);
  padding: var(--ui-space-2) 0;
}
.team-item + .team-item { border-top: 1px solid rgb(var(--ui-border)); }
.team-avatar {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  border-radius: 50%;
  background: rgb(var(--ui-accent) / 0.14);
  color: rgb(var(--ui-accent-strong));
  font-size: var(--ui-text-xs);
  font-weight: 700;
  flex-shrink: 0;
}
.team-meta { display: flex; flex-direction: column; min-width: 0; flex: 1; }
.team-name { font-weight: 600; font-size: var(--ui-text-sm); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.team-email { font-size: var(--ui-text-xs); color: rgb(var(--ui-muted)); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

/* sucesso */
.invited-card :deep(.ui-card-body) { padding: var(--ui-space-6); }
.invited { display: flex; align-items: flex-start; gap: var(--ui-space-4); }
.invited-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 64px;
  height: 64px;
  border-radius: 50%;
  background: rgb(var(--ui-ok) / 0.14);
  color: rgb(var(--ui-ok));
  flex-shrink: 0;
}
.invited-title { font-size: var(--ui-text-xl); }
.invited-sub { margin: var(--ui-space-2) 0 0; }
.invited-note { margin: var(--ui-space-2) 0 0; font-size: var(--ui-text-sm); }
.invited-actions { display: flex; gap: var(--ui-space-2); flex-wrap: wrap; margin-top: var(--ui-space-4); }

.req-mark { color: rgb(var(--ui-danger)); font-weight: 700; }
</style>
