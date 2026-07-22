<script setup>
import { computed, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAuthStore } from '../stores/auth';

const auth = useAuthStore();
const router = useRouter();
const route = useRoute();

const mode = ref('login'); // 'login' | 'register'
const form = ref({ orgName: '', name: '', email: '', password: '' });
const error = ref('');
const busy = ref(false);
// Sinalizado pelo api.js quando a sessao expira durante o uso (401 → redirect).
const expired = computed(() => route.query.expired === '1');

async function submit() {
  error.value = '';
  busy.value = true;
  try {
    if (mode.value === 'register') {
      await auth.register(form.value);
    } else {
      await auth.login({ email: form.value.email, password: form.value.password });
    }
    router.push(route.query.redirect || '/app/dashboard');
  } catch (e) {
    error.value = e.message || 'falha na autenticação';
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <div class="im-auth-wrap">
    <div class="im-auth-card">
      <div class="im-brand" style="margin-bottom: 6px"><span class="dot" /> imobia</div>
      <p style="color: var(--im-muted); margin: 0 0 18px; font-size: 14px">
        {{ mode === 'register' ? 'Crie sua imobiliária e comece o levantamento.' : 'Entre para acessar seus imóveis, leads e finanças.' }}
      </p>

      <p v-if="expired && !error" class="im-notice" style="margin: 0 0 16px">Sua sessão expirou. Entre novamente para continuar de onde parou.</p>

      <form @submit.prevent="submit" class="im-form">
        <template v-if="mode === 'register'">
          <label>Nome da imobiliária<input v-model="form.orgName" required minlength="2" placeholder="Ex.: Prime Imóveis" /></label>
          <label>Seu nome<input v-model="form.name" required minlength="2" placeholder="Seu nome" /></label>
        </template>
        <label>E-mail<input v-model="form.email" type="email" required placeholder="voce@exemplo.com" /></label>
        <label>Senha<input v-model="form.password" type="password" required minlength="8" placeholder="mínimo 8 caracteres" /></label>

        <button class="im-btn" type="submit" :disabled="busy">
          {{ busy ? 'Aguarde…' : mode === 'register' ? 'Criar conta' : 'Entrar' }}
        </button>
      </form>

      <p v-if="error" class="im-notice err" style="margin-top: 14px">{{ error }}</p>

      <div class="im-auth-alt">
        <template v-if="mode === 'login'">
          Não tem conta?
          <a href="#" @click.prevent="mode = 'register'">Criar imobiliária</a>
        </template>
        <template v-else>
          Já tem conta?
          <a href="#" @click.prevent="mode = 'login'">Entrar</a>
        </template>
      </div>
      <p class="im-auth-sso">SSO Keycloak (realm nvit) disponível quando configurado pelo operador.</p>
    </div>
  </div>
</template>

<style scoped>
.im-auth-wrap { display: flex; justify-content: center; padding: 40px 0; }
.im-auth-card { width: 100%; max-width: 400px; background: var(--im-surface); border: 1px solid var(--im-border); border-radius: var(--im-radius); padding: 28px; box-shadow: var(--im-shadow); }
.im-form { display: flex; flex-direction: column; gap: 12px; }
.im-form label { display: flex; flex-direction: column; gap: 6px; font-size: 13px; color: var(--im-muted); font-weight: 600; }
.im-form input { background: var(--im-bg-soft); border: 1px solid var(--im-border); border-radius: 9px; padding: 10px 12px; color: var(--im-text); font-size: 14px; outline: none; }
.im-form input:focus { border-color: var(--im-accent); }
.im-btn { margin-top: 6px; background: linear-gradient(135deg, var(--im-accent), var(--im-accent-2)); color: #0d1418; font-weight: 800; border: none; border-radius: 10px; padding: 12px; font-size: 15px; cursor: pointer; }
.im-btn:disabled { opacity: 0.6; cursor: default; }
.im-auth-alt { margin-top: 16px; font-size: 13.5px; color: var(--im-muted); text-align: center; }
.im-auth-alt a { color: var(--im-accent-2); font-weight: 700; }
.im-auth-sso { margin-top: 10px; font-size: 12px; color: var(--im-muted); text-align: center; opacity: 0.8; }
</style>
