<script setup>
import { computed, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useTheme } from 'vuetify';
import { useAuthStore } from '../stores/auth.js';
import { toggleAppTheme } from '../composables/useAppTheme.js';

const router = useRouter();
const route = useRoute();
const theme = useTheme();
const authStore = useAuthStore();
const { loading, error } = authStore;

const email = ref(import.meta.env.VITE_LOGIN_EMAIL || '');
const password = ref('');
const showPassword = ref(false);
const formError = ref('');
const registerMode = ref(false);
const registerName = ref('');
const registerEmail = ref('');
const registerPassword = ref('');
const registerConfirmPassword = ref('');
const registerError = ref('');
const rememberMe = ref(true);

const authError = computed(() => formError.value || error.value || '');
const isLoading = computed(() => loading.value);
const isDarkTheme = computed(() => Boolean(theme.global.current.value.dark));

const sessionExpiredMessage = computed(() => {
  return route.query.reason === 'expired'
    ? 'Sua sessao expirou. Faca login novamente para continuar.'
    : '';
});

function toggleTheme() {
  toggleAppTheme(theme, isDarkTheme.value);
}

function goToPublicHome() {
  router.push({
    path: '/',
    query: { public: '1' }
  });
}

function isValidEmail(value) {
  if (!value) return true;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value).trim());
}

async function handleLogin() {
  formError.value = '';

  if (!isValidEmail(email.value)) {
    formError.value = 'Informe um e-mail valido.';
    return;
  }

  const success = await authStore.login(email.value, password.value);

  if (success) {
    router.push(authStore.canAccessAdmin.value ? '/operacao/dashboard' : '/login/cetesb');
  }
}

function handleForgotPassword() {
  formError.value = 'Solicite a redefinicao de senha com o administrador SICAT.';
}

function toggleRegisterMode() {
  registerMode.value = !registerMode.value;
  registerError.value = '';
}

async function handleRegister() {
  registerError.value = '';

  if (!String(registerName.value || '').trim()) {
    registerError.value = 'Informe o nome do usuario.';
    return;
  }

  if (!isValidEmail(registerEmail.value)) {
    registerError.value = 'Informe um e-mail valido para cadastro.';
    return;
  }

  if (String(registerPassword.value || '').length < 8) {
    registerError.value = 'A senha deve ter no minimo 8 caracteres.';
    return;
  }

  if (registerPassword.value !== registerConfirmPassword.value) {
    registerError.value = 'As senhas nao conferem.';
    return;
  }

  const success = await authStore.register(
    registerName.value,
    registerEmail.value,
    registerPassword.value
  );

  if (success) {
    router.push(authStore.canAccessAdmin.value ? '/operacao/dashboard' : '/login/cetesb');
  }
}
</script>

<template>
  <div class="auth-login-view">
    <div class="auth-login-layout">
      <section class="auth-showcase">
        <div class="auth-showcase-brand">
          <div class="auth-brand-mark"><v-icon color="primary" size="24">mdi-leaf</v-icon></div>
          <div class="auth-brand-title">SICAT</div>
        </div>

        <div class="auth-showcase-stage" aria-hidden="true">
          <div class="auth-stage-orb auth-stage-orb-primary" />
          <div class="auth-stage-orb auth-stage-orb-info" />

          <div class="auth-stage-floating auth-stage-floating-top">
            <v-icon size="16">mdi-shield-check-outline</v-icon>
            <span>Secure Access</span>
          </div>

          <div class="auth-stage-illustration">
            <div class="auth-stage-monitor">
              <div class="auth-stage-monitor-head">
                <span />
                <span />
                <span />
              </div>
              <div class="auth-stage-monitor-body">
                <div class="auth-stage-chart">
                  <span style="--bar-h: 52%" />
                  <span style="--bar-h: 68%" />
                  <span style="--bar-h: 44%" />
                  <span style="--bar-h: 78%" />
                </div>
                <div class="auth-stage-person" />
              </div>
            </div>
          </div>

          <div class="auth-stage-floating auth-stage-floating-bottom">
            <v-icon size="16">mdi-arrow-right-thin-circle-outline</v-icon>
            <span>SICAT -> CETESB</span>
          </div>
        </div>
      </section>

      <v-sheet class="auth-panel">
        <div class="auth-panel-toolbar">
          <div class="text-caption text-medium-emphasis">SICAT Internal</div>
          <div class="auth-panel-toolbar-actions">
            <v-tooltip location="bottom" text="Ir para a home publica">
              <template #activator="{ props: tooltipProps }">
                <v-btn
                  v-bind="tooltipProps"
                  class="auth-home-action"
                  icon
                  variant="tonal"
                  color="primary"
                  size="small"
                  aria-label="Voltar para a home publica"
                  @click="goToPublicHome"
                >
                  <v-icon size="18">mdi-home-import-outline</v-icon>
                </v-btn>
              </template>
            </v-tooltip>

            <v-btn
              :icon="isDarkTheme ? 'mdi-weather-sunny' : 'mdi-weather-night'"
              variant="text"
              size="small"
              :aria-label="isDarkTheme ? 'Ativar tema claro' : 'Ativar tema escuro'"
              @click="toggleTheme"
            />
          </div>
        </div>

        <div class="auth-panel-head">
          <div>
            <h1 class="auth-panel-title">Welcome to SICAT</h1>
            <p class="auth-panel-subtitle">Please sign in to continue</p>
          </div>
        </div>

        <v-alert
          v-if="sessionExpiredMessage"
          type="warning"
          variant="tonal"
          class="auth-session-alert mb-4"
          density="compact"
        >
          {{ sessionExpiredMessage }}
        </v-alert>

        <v-form @submit.prevent="handleLogin">
          <v-text-field
            v-model="email"
            label="Email"
            type="email"
            placeholder="voce@empresa.com"
            :error-messages="formError && !email ? [formError] : []"
            autofocus
            class="mb-3"
          />

          <v-text-field
            v-model="password"
            label="Password"
            :type="showPassword ? 'text' : 'password'"
            placeholder="Digite sua senha"
            :append-inner-icon="showPassword ? 'mdi-eye-off-outline' : 'mdi-eye-outline'"
            class="mb-2"
            @click:append-inner="showPassword = !showPassword"
          />

          <div class="auth-form-options mb-4">
            <v-checkbox
              v-model="rememberMe"
              label="Remember me"
              density="compact"
              hide-details
              color="primary"
            />
            <v-btn variant="text" size="small" type="button" @click="handleForgotPassword">
              Forgot password?
            </v-btn>
          </div>

          <v-alert
            v-if="authError"
            type="error"
            variant="tonal"
            class="mb-4"
            density="compact"
          >
            {{ authError }}
          </v-alert>

          <div class="auth-actions mb-4">
            <v-btn block color="primary" type="submit" size="large" :loading="isLoading">Sign in</v-btn>
          </div>
        </v-form>

        <div class="auth-divider">
          <span>Primeiro acesso</span>
        </div>

        <div class="auth-register-toggle">
          <p class="text-body-2 text-medium-emphasis mb-3">Still do not have a SICAT account?</p>
          <v-btn block variant="outlined" @click="toggleRegisterMode">
            {{ registerMode ? 'Cancel sign up' : 'Create SICAT account' }}
          </v-btn>
        </div>

        <v-expand-transition>
          <div v-if="registerMode" class="auth-register-panel mt-4">
            <v-alert v-if="registerError" type="error" variant="tonal" class="mb-3" density="compact">
              {{ registerError }}
            </v-alert>

            <v-form @submit.prevent="handleRegister">
              <v-text-field
                v-model="registerName"
                label="Full name"
                class="mb-3"
              />
              <v-text-field
                v-model="registerEmail"
                label="Email"
                type="email"
                class="mb-3"
              />
              <v-text-field
                v-model="registerPassword"
                label="Password"
                type="password"
                class="mb-3"
              />
              <v-text-field
                v-model="registerConfirmPassword"
                label="Confirm password"
                type="password"
                class="mb-4"
              />

              <v-btn block color="primary" type="submit" :loading="isLoading">
                Create account and continue
              </v-btn>
            </v-form>
          </div>
        </v-expand-transition>
      </v-sheet>
    </div>
  </div>
</template>

<style scoped>
.auth-login-view {
  width: 100%;
  min-height: 100vh;
  display: block;
  padding: 0;
  background:
    radial-gradient(circle at 8% 8%, rgba(var(--v-theme-primary), 0.08), transparent 28%),
    linear-gradient(180deg, rgba(var(--v-theme-background), 0.98) 0%, rgba(var(--v-theme-background), 1) 100%);
}

.auth-login-layout {
  width: 100%;
  display: grid;
  grid-template-columns: minmax(0, 1.2fr) minmax(380px, 0.8fr);
  gap: 0;
  align-items: stretch;
  min-height: 100vh;
}

.auth-showcase {
  position: relative;
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  padding: 34px 38px;
  background:
    radial-gradient(circle at 10% 12%, rgba(var(--v-theme-primary), 0.14), transparent 22%),
    radial-gradient(circle at 86% 18%, rgba(var(--v-theme-info), 0.1), transparent 20%),
    linear-gradient(180deg, rgba(var(--v-theme-surface), 0.98) 0%, rgba(var(--v-theme-surface), 0.92) 100%);
  overflow: hidden;
}

.auth-showcase-brand {
  display: inline-flex;
  align-items: center;
  gap: 10px;
}

.auth-brand-mark {
  width: 38px;
  height: 38px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 12px;
  background: rgba(var(--v-theme-primary), 0.1);
}

.auth-brand-title {
  font-size: 1rem;
  font-weight: 800;
  color: rgba(var(--v-theme-on-surface), 0.92);
}

.auth-showcase-stage {
  flex: 1;
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
}

.auth-stage-orb {
  position: absolute;
  border-radius: 999px;
  filter: blur(10px);
  opacity: 0.9;
}

.auth-stage-orb-primary {
  inset: 18% auto auto 12%;
  width: 120px;
  height: 120px;
  background: rgba(var(--v-theme-primary), 0.1);
}

.auth-stage-orb-info {
  inset: auto 12% 12% auto;
  width: 140px;
  height: 140px;
  background: rgba(var(--v-theme-info), 0.08);
}

.auth-stage-floating {
  position: absolute;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 9px 12px;
  border-radius: 999px;
  border: 1px solid rgba(var(--v-border-color), 0.12);
  background: rgba(var(--v-theme-surface), 0.96);
  box-shadow: 0 12px 28px rgba(75, 70, 92, 0.08);
  z-index: 3;
  font-size: 0.74rem;
  color: rgba(var(--v-theme-on-surface), 0.72);
}

.auth-stage-floating-top {
  top: 18%;
  left: 8%;
}

.auth-stage-floating-bottom {
  right: 11%;
  bottom: 18%;
}

.auth-stage-illustration {
  position: relative;
  width: min(100%, 620px);
  min-height: 420px;
  display: grid;
  place-items: center;
}

.auth-stage-monitor {
  position: relative;
  width: min(100%, 520px);
  border-radius: 24px;
  border: 1px solid rgba(var(--v-border-color), 0.12);
  background: linear-gradient(180deg, rgba(var(--v-theme-surface), 1) 0%, rgba(var(--v-theme-surface), 0.93) 100%);
  box-shadow: 0 24px 54px rgba(75, 70, 92, 0.14);
  overflow: hidden;
}

.auth-stage-monitor-head {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 14px 16px 10px;
}

.auth-stage-monitor-head span {
  width: 10px;
  height: 10px;
  border-radius: 999px;
  background: rgba(var(--v-theme-primary), 0.24);
}

.auth-stage-monitor-head span:nth-child(2) {
  background: rgba(var(--v-theme-warning), 0.3);
}

.auth-stage-monitor-head span:nth-child(3) {
  background: rgba(var(--v-theme-success), 0.32);
}

.auth-stage-monitor-body {
  display: flex;
  align-items: end;
  justify-content: space-between;
  gap: 16px;
  min-height: 290px;
  padding: 6px 18px 18px;
}

.auth-stage-chart {
  flex: 1;
  height: 170px;
  display: grid;
  grid-auto-flow: column;
  grid-auto-columns: minmax(14px, 1fr);
  align-items: end;
  gap: 9px;
  padding: 0 8px 8px 0;
}

.auth-stage-chart span {
  display: block;
  height: var(--bar-h);
  border-radius: 999px 999px 12px 12px;
  background: linear-gradient(180deg, rgba(var(--v-theme-primary), 0.86) 0%, rgba(var(--v-theme-info), 0.72) 100%);
}

.auth-stage-person {
  width: 158px;
  height: 212px;
  border-radius: 88px 88px 32px 32px;
  background:
    radial-gradient(circle at 60% 18%, rgba(var(--v-theme-surface), 0.9), transparent 28%),
    linear-gradient(180deg, rgba(var(--v-theme-primary), 0.24) 0%, rgba(var(--v-theme-primary), 0.08) 100%);
  border: 1px solid rgba(var(--v-border-color), 0.12);
}

.auth-panel {
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-content: center;
  gap: 14px;
  padding: 36px 42px;
  background: rgba(var(--v-theme-surface), 1);
  box-shadow: none;
  border-left: 1px solid rgba(var(--v-border-color), 0.1);
  min-height: 100vh;
  max-width: none;
  width: 100%;
  margin: 0;
 }

.auth-panel > * {
  width: 100%;
  max-width: 430px;
  margin-left: auto;
  margin-right: auto;
}

.auth-session-alert {
  margin-top: 2px;
  flex: 0 0 auto !important;
  min-height: 0 !important;
  padding-block: 0 !important;
}

.auth-session-alert :deep(.v-alert__content) {
  display: block;
  padding-top: 0 !important;
  padding-bottom: 0 !important;
  line-height: 1.35;
}

.auth-session-alert :deep(.v-alert__prepend),
.auth-session-alert :deep(.v-alert__append) {
  align-self: center;
}

.auth-panel-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
 }

.auth-panel-toolbar-actions {
  display: inline-flex;
  align-items: center;
  justify-content: flex-end;
  gap: 6px;
}

.auth-home-action {
  flex: 0 0 auto;
}

.auth-panel-head {
  display: grid;
  gap: 4px;
}

.auth-panel-title {
  font-size: 1.6rem;
  line-height: 1.15;
  font-weight: 700;
  margin: 0;
  color: rgba(var(--v-theme-on-surface), 0.92);
}

.auth-panel-subtitle {
  margin: 0;
  font-size: 0.92rem;
  color: rgba(var(--v-theme-on-surface), 0.62);
}

.auth-form-options {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
 }

.auth-divider {
  position: relative;
  text-align: center;
  margin: 4px 0 0;
 }

.auth-divider::before {
  content: '';
  position: absolute;
  inset: 50% 0 auto;
  border-top: 1px solid rgba(var(--v-border-color), 0.16);
 }

.auth-divider span {
  position: relative;
  display: inline-block;
  padding: 0 12px;
  background: rgba(var(--v-theme-surface), 0.98);
  color: rgba(var(--v-theme-on-surface), 0.58);
  font-size: 0.76rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
 }

.auth-register-toggle {
  display: grid;
 }

.auth-register-panel {
  padding-top: 4px;
}

@media (max-width: 1080px) {
  .auth-login-layout {
    grid-template-columns: 1fr;
    min-height: auto;
  }

  .auth-showcase {
    min-height: 520px;
    padding: 28px 24px;
  }

  .auth-panel {
    min-height: auto;
    max-width: none;
    width: 100%;
    margin: 0 auto;
    border-left: 0;
    padding: 28px 24px 34px;
  }
}

@media (max-width: 767px) {
  .auth-login-view {
    padding: 0;
  }

  .auth-showcase,
  .auth-panel {
    padding: 20px;
  }

  .auth-showcase {
    min-height: auto;
  }

  .auth-stage-illustration {
    min-height: 320px;
  }

  .auth-stage-floating {
    position: static;
    margin-bottom: 8px;
  }

  .auth-showcase-stage {
    flex-direction: column;
    gap: 8px;
  }

  .auth-stage-monitor {
    width: 100%;
  }

  .auth-stage-monitor-body {
    min-height: 220px;
  }

  .auth-stage-person {
    width: 120px;
    height: 162px;
  }

  .auth-form-options {
    flex-direction: column;
    align-items: flex-start;
  }
}

@media (max-width: 599px) {
  .auth-panel {
    padding: 20px 16px;
  }
}
</style>
