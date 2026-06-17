<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useTheme } from 'vuetify';
import InAppCopilotAssistant from './components/conversation/InAppCopilotAssistant.vue';
import SicatAppShell from './components/shell/SicatAppShell.vue';
import SicatSnackbar from './components/sicat/SicatSnackbar.vue';
import { useAuthStore } from './stores/auth.js';
import { filterNavigationGroups } from './config/navigation.js';
import {
  applyAppTheme,
  applyStoredAppTheme,
  fromVuetifyThemeName,
  syncThemeSideEffects
} from './composables/useAppTheme.js';

const route = useRoute();
const router = useRouter();
const theme = useTheme();
const authStore = useAuthStore();
const { isAuthenticated, hasActiveCetesbAccount, user, activeAccount, canAccessAdmin } = authStore;

const navigationGroups = computed(() => filterNavigationGroups({
  canAccessAdmin: Boolean(canAccessAdmin?.value),
  accountType: activeAccount?.value?.accountType || ''
}));

const showShell = computed(
  // Admin/SRE (persona de sistema) enxerga o shell sem precisar de conta CETESB ativa.
  () => isAuthenticated.value && (hasActiveCetesbAccount.value || canAccessAdmin.value) && !route.meta?.hideShell
);

const authWrapperHomeShortcutExclusions = new Set(['Login', 'LoginCetesb']);
const showPublicHomeShortcut = computed(() => route.path !== '/');
const showAuthWrapperHomeShortcut = computed(
  () => showPublicHomeShortcut.value && !authWrapperHomeShortcutExclusions.has(String(route.name || ''))
);

const viewportWidth = ref(globalThis.window?.innerWidth ?? 1280);
const isDesktop = computed(() => viewportWidth.value >= 1180);
const isDarkTheme = computed(() => Boolean(theme.global.current.value.dark));

const activeCetesbAccountLabel = computed(() => {
  const account = activeAccount.value || null;
  if (!account) {
    return 'Conta CETESB não selecionada';
  }

  const partnerName = String(account.partnerName || '').trim();
  const partnerCode = String(account.partnerCode || '').trim();

  if (partnerName && partnerCode) {
    return `${partnerName} (cód. ${partnerCode})`;
  }

  if (partnerName) return partnerName;
  if (partnerCode) return `Código ${partnerCode}`;
  return String(account.accountId || 'Conta ativa').trim();
});

const activeAccountTypeLabel = computed(() => {
  const accountType = String(activeAccount.value?.accountType || '').toLowerCase();
  if (accountType === 'generator') return 'Gerador';
  if (accountType === 'carrier') return 'Transportador';
  if (accountType === 'receiver') return 'Destinador';
  return 'Conta operacional';
});

const userInitials = computed(() => {
  const normalizedName = String(user?.value?.name || user?.value?.email || 'SI').trim();
  if (!normalizedName) return 'SI';

  const parts = normalizedName.split(/\s+/).filter(Boolean);
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }

  return `${parts[0][0] || ''}${parts[parts.length - 1][0] || ''}`.toUpperCase();
});

const currentUser = computed(() => user?.value || null);

let sessionWatchInterval = null;
let sessionValidationPromise = null;

async function ensureActiveSession() {
  if (!sessionValidationPromise) {
    sessionValidationPromise = (async () => {
      await router.isReady();
      const sessionIsValid = await Promise.resolve(authStore.checkAuth());
      if (sessionIsValid) {
        return true;
      }

      if (route.meta?.requiresSicatAuth !== false) {
        router.replace({ path: '/login', query: { reason: 'expired' } });
      }

      return false;
    })().finally(() => {
      sessionValidationPromise = null;
    });
  }

  return sessionValidationPromise;
}

function applyTheme(nextTheme) {
  applyAppTheme(theme, nextTheme);
}

function toggleTheme() {
  applyTheme(isDarkTheme.value ? 'light' : 'dark');
}

function handleWindowResize() {
  viewportWidth.value = globalThis.window?.innerWidth ?? 1280;
}

function handleWindowFocus() {
  void ensureActiveSession();
}

function handleVisibilityChange() {
  if (document.visibilityState === 'visible') {
    void ensureActiveSession();
  }
}

function navigateTo(path) {
  router.push(path);
}

function goToPublicHome() {
  if (!showPublicHomeShortcut.value) return;
  router.push({ path: '/', query: { public: '1' } });
}

function handleLogout() {
  authStore.logout();
  router.push('/login');
}

function handleSwitchCetesbAccount() {
  authStore.clearActiveCetesbContext();
  router.push('/login/cetesb');
}

watch(
  () => theme.global.name.value,
  (nextTheme) => {
    syncThemeSideEffects(fromVuetifyThemeName(nextTheme));
  },
  { immediate: true }
);

onMounted(async () => {
  await ensureActiveSession();

  if (await Promise.resolve(authStore.checkAuth())) {
    await authStore.syncSicatSession();
  }

  applyStoredAppTheme(theme);
  handleWindowResize();

  sessionWatchInterval = setInterval(() => {
    void ensureActiveSession();
  }, 15000);

  globalThis.addEventListener('resize', handleWindowResize);
  globalThis.addEventListener('focus', handleWindowFocus);
  document.addEventListener('visibilitychange', handleVisibilityChange);
});

onUnmounted(() => {
  if (sessionWatchInterval) {
    clearInterval(sessionWatchInterval);
  }

  globalThis.removeEventListener('resize', handleWindowResize);
  globalThis.removeEventListener('focus', handleWindowFocus);
  document.removeEventListener('visibilitychange', handleVisibilityChange);
});
</script>

<template>
  <v-app class="sicat-app" :data-authenticated="showShell ? 'true' : 'false'">
    <div v-if="route.meta?.fullBleed" class="full-bleed-wrapper">
      <header v-if="showPublicHomeShortcut" class="public-home-inline-header">
        <v-tooltip location="bottom" text="Ir para a home pública">
          <template #activator="{ props: tooltipProps }">
            <v-btn
              v-bind="tooltipProps"
              class="public-home-action"
              icon
              variant="tonal"
              color="primary"
              aria-label="Voltar para a home pública"
              @click="goToPublicHome"
            >
              <v-icon size="20">mdi-home-import-outline</v-icon>
            </v-btn>
          </template>
        </v-tooltip>
      </header>

      <router-view />
    </div>

    <div v-else-if="!showShell" class="auth-wrapper">
      <div class="auth-content-shell">
        <header v-if="showAuthWrapperHomeShortcut" class="public-home-inline-header public-home-inline-header-auth">
          <v-tooltip location="bottom" text="Ir para a home pública">
            <template #activator="{ props: tooltipProps }">
              <v-btn
                v-bind="tooltipProps"
                class="public-home-action"
                icon
                variant="tonal"
                color="primary"
                aria-label="Voltar para a home pública"
                @click="goToPublicHome"
              >
                <v-icon size="20">mdi-home-import-outline</v-icon>
              </v-btn>
            </template>
          </v-tooltip>
        </header>

        <router-view />
      </div>
    </div>

    <SicatAppShell
      v-else
      :groups="navigationGroups"
      :is-desktop="isDesktop"
      :is-dark-theme="isDarkTheme"
      :show-public-home-shortcut="showPublicHomeShortcut"
      :user="currentUser"
      :user-initials="userInitials"
      :active-account-type-label="activeAccountTypeLabel"
      :active-cetesb-account-label="activeCetesbAccountLabel"
      :can-access-admin="Boolean(canAccessAdmin?.value)"
      @go-public-home="goToPublicHome"
      @toggle-theme="toggleTheme"
      @navigate="navigateTo"
      @switch-account="handleSwitchCetesbAccount"
      @logout="handleLogout"
    >
      <router-view />
    </SicatAppShell>

    <InAppCopilotAssistant v-if="showShell" />

    <SicatSnackbar />
  </v-app>
</template>

<style scoped>
.sicat-app {
  font-family: 'Public Sans', sans-serif;
}

.full-bleed-wrapper {
  min-height: 100vh;
}

.public-home-inline-header {
  display: flex;
  justify-content: flex-start;
  width: 100%;
  padding: 14px clamp(18px, 2.2vw, 28px) 0;
}

.public-home-inline-header-auth {
  max-width: 1040px;
  margin: 0 auto;
}

.public-home-action {
  width: 46px;
  height: 46px;
  border: 1px solid rgba(var(--v-border-color), 0.24);
  background: rgba(var(--v-theme-surface), 0.84);
  color: rgba(var(--v-theme-primary), 0.98);
  backdrop-filter: blur(16px);
  box-shadow: 0 10px 28px rgba(75, 70, 92, 0.16);
  transition: transform 0.16s ease, box-shadow 0.16s ease, background-color 0.16s ease;
}

.public-home-action:hover {
  transform: translateY(-1px);
  box-shadow: 0 12px 30px rgba(var(--v-theme-primary), 0.2);
  background: rgba(var(--v-theme-surface), 0.96);
}

.public-home-action:focus-visible {
  outline: 3px solid rgba(var(--v-theme-primary), 0.34);
  outline-offset: 2px;
}

.auth-wrapper {
  min-height: 100vh;
  display: flex;
  align-items: stretch;
  justify-content: center;
  background:
    radial-gradient(circle at top left, rgba(var(--v-theme-primary), 0.14), transparent 30%),
    radial-gradient(circle at right center, rgba(var(--v-theme-info), 0.10), transparent 24%),
    rgb(var(--v-theme-background));
}

.auth-content-shell {
  display: flex;
  flex: 1;
  flex-direction: column;
  width: 100%;
}

@media (max-width: 959px) {
  .public-home-inline-header {
    padding-top: 12px;
  }
}

@media (max-width: 599px) {
  .public-home-inline-header {
    padding-left: 14px;
    padding-right: 14px;
  }
}
</style>
