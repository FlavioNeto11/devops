<!--
  AuthView — entrada do ContaViva Pro (bloco contas-acesso). Login OU registro (toggle), e botão SSO
  Keycloak quando o backend reporta /auth/sso/config.enabled. Só o kit ui-vue + tokens --ui-*.
  Pós-login redireciona para ?redirect= (ou /). Erros não vazam stack — mensagem amigável.
-->
<template>
  <div class="auth-wrap">
    <UiCard class="auth-card">
      <div class="auth-head">
        <h1 class="auth-title">ContaViva Pro</h1>
        <p class="auth-sub ui-muted">{{ mode === 'login' ? 'Entre na sua conta' : 'Crie sua conta' }}</p>
      </div>
      <form @submit.prevent="submit">
        <UiFormSection :columns="1">
          <UiFormField v-if="mode === 'register'" label="Nome" :required="true" :error="f.errors.name">
            <template #default="{ id, describedBy }">
              <UiInput :id="id" :described-by="describedBy" :model-value="f.values.name" autocomplete="name" placeholder="Seu nome" @update:model-value="f.setField('name', $event)" />
            </template>
          </UiFormField>
          <UiFormField label="E-mail" :required="true" :error="f.errors.email">
            <template #default="{ id, describedBy }">
              <UiInput :id="id" :described-by="describedBy" type="email" :model-value="f.values.email" autocomplete="email" placeholder="voce@exemplo.com" @update:model-value="f.setField('email', $event)" />
            </template>
          </UiFormField>
          <UiFormField label="Senha" :required="true" :error="f.errors.password" :hint="mode === 'register' ? 'Mínimo de 8 caracteres.' : ''">
            <template #default="{ id, describedBy }">
              <UiInput :id="id" :described-by="describedBy" type="password" :model-value="f.values.password" :autocomplete="mode === 'register' ? 'new-password' : 'current-password'" placeholder="••••••••" @update:model-value="f.setField('password', $event)" />
            </template>
          </UiFormField>
        </UiFormSection>
        <p v-if="formError" class="auth-error" role="alert">{{ formError }}</p>
        <UiButton type="submit" block :loading="f.submitting.value">{{ mode === 'login' ? 'Entrar' : 'Criar conta' }}</UiButton>
      </form>
      <div v-if="sso.enabled" class="auth-sso">
        <div class="auth-divider"><span>ou</span></div>
        <UiButton variant="ghost" block :loading="ssoBusy" @click="startSso">Entrar com SSO</UiButton>
      </div>
      <p class="auth-toggle ui-muted">
        {{ mode === 'login' ? 'Não tem conta?' : 'Já tem conta?' }}
        <button type="button" class="auth-link" @click="toggleMode">{{ mode === 'login' ? 'Criar conta' : 'Entrar' }}</button>
      </p>
    </UiCard>
  </div>
</template>
<script setup>
import { ref, reactive, onMounted } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { UiCard, UiButton, UiFormSection, UiFormField, UiInput, useForm, validators, useToast } from '../ui/index.js';
import { useAuth } from '../composables/useAuth.js';
import { auth as authApi } from '../api.js';
const router = useRouter();
const route = useRoute();
const toast = useToast();
const account = useAuth();
const mode = ref('login'); // login | register
const formError = ref(null);
const sso = reactive({ enabled: false, issuer: null, clientId: null });
const ssoBusy = ref(false);
const f = useForm({ initial: { name: '', email: '', password: '' }, rules: { email: [validators.required(), validators.email()], password: [validators.required(), validators.minLen(8)] } });

function toggleMode() { mode.value = mode.value === 'login' ? 'register' : 'login'; formError.value = null; }
function dest() { const r = route.query.redirect; return typeof r === 'string' && r.startsWith('/') ? r : '/'; }

function submit() {
  formError.value = null;
  f.errors.name = ''; // 'name' não tem regra no useForm (só em registro) — limpamos o erro manual aqui.
  if (mode.value === 'register' && !f.values.name.trim()) { f.errors.name = 'Informe seu nome.'; return; }
  f.handleSubmit(async (vals) => {
    try {
      if (mode.value === 'login') await account.login(vals.email, vals.password);
      else await account.register({ name: vals.name, email: vals.email, password: vals.password });
      router.push(dest());
    } catch (e) {
      formError.value = authError(e);
    }
  });
}

function authError(e) {
  if (!e) return 'Não foi possível concluir. Tente novamente.';
  if (e.status === 401) return 'E-mail ou senha inválidos.';
  if (e.status === 409) return 'Já existe uma conta com este e-mail.';
  if (e.status === 400) return e.message || 'Verifique os dados informados.';
  return e.message || 'Não foi possível concluir. Tente novamente.';
}

// SSO Keycloak (aditivo/opcional): se habilitado, manda o usuário ao authorization endpoint do issuer
// com response_type=token (implicit) e volta para esta tela com o token no hash -> ssoExchange.
async function startSso() {
  if (!sso.enabled || !sso.issuer || !sso.clientId) return;
  ssoBusy.value = true;
  try {
    const redirectUri = window.location.origin + window.location.pathname;
    const u = new URL(sso.issuer.replace(/\/$/, '') + '/protocol/openid-connect/auth');
    u.searchParams.set('client_id', sso.clientId);
    u.searchParams.set('redirect_uri', redirectUri);
    u.searchParams.set('response_type', 'token');
    u.searchParams.set('scope', 'openid email profile');
    window.location.assign(u.toString());
  } catch (e) { ssoBusy.value = false; toast.error('Não foi possível iniciar o SSO.'); }
}

// se voltamos do IdP com #access_token=... no hash, troca pelo nosso par de tokens e entra.
async function handleSsoCallback() {
  const hash = window.location.hash || '';
  if (!hash.includes('access_token=')) return false;
  const params = new URLSearchParams(hash.replace(/^#/, ''));
  const at = params.get('access_token');
  if (!at) return false;
  try {
    await account.ssoExchange(at);
    history.replaceState(null, '', window.location.pathname + window.location.search);
    router.push(dest());
    return true;
  } catch (e) { formError.value = 'Falha no login por SSO.'; return false; }
}

onMounted(async () => {
  try { const c = await authApi.ssoConfig(); sso.enabled = !!(c && c.enabled); sso.issuer = c && c.issuer || null; sso.clientId = c && c.clientId || null; } catch {}
  if (sso.enabled) await handleSsoCallback();
});
</script>
<style scoped>
.auth-wrap { min-height: calc(100vh - 56px); display: flex; align-items: center; justify-content: center; padding: var(--ui-space-5); }
.auth-card { width: 100%; max-width: 400px; }
.auth-head { text-align: center; margin-bottom: var(--ui-space-5); }
.auth-title { margin: 0; font-size: var(--ui-text-xl); font-family: var(--ui-font-display); }
.auth-sub { margin: var(--ui-space-1) 0 0; font-size: var(--ui-text-sm); }
.auth-error { margin: var(--ui-space-3) 0; color: rgb(var(--ui-danger)); font-size: var(--ui-text-sm); }
.auth-sso { margin-top: var(--ui-space-4); }
.auth-divider { display: flex; align-items: center; gap: var(--ui-space-3); margin: var(--ui-space-4) 0; color: rgb(var(--ui-faint)); font-size: var(--ui-text-xs); }
.auth-divider::before, .auth-divider::after { content: ""; flex: 1; height: 1px; background: rgb(var(--ui-border)); }
.auth-toggle { margin: var(--ui-space-4) 0 0; text-align: center; font-size: var(--ui-text-sm); }
.auth-link { background: none; border: none; color: rgb(var(--ui-accent-strong)); font: inherit; font-weight: 600; cursor: pointer; padding: 0; }
.auth-link:hover { text-decoration: underline; }
</style>
