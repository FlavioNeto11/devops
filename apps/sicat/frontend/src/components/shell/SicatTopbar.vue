<script setup>
import SicatNavigation from './SicatNavigation.vue';
import SicatUserMenu from './SicatUserMenu.vue';

defineProps({
  groups: { type: Array, required: true },
  isDesktop: { type: Boolean, default: true },
  isDarkTheme: { type: Boolean, default: false },
  showPublicHomeShortcut: { type: Boolean, default: false },
  user: { type: Object, default: null },
  userInitials: { type: String, default: 'SI' },
  activeAccountTypeLabel: { type: String, default: '' },
  activeCetesbAccountLabel: { type: String, default: '' },
  currentPageSection: { type: String, default: 'SICAT' },
  currentPageTitle: { type: String, default: 'SICAT' },
  canAccessAdmin: { type: Boolean, default: false }
});

const emit = defineEmits([
  'openMobileMenu',
  'goPublicHome',
  'toggleTheme',
  'navigate',
  'switchAccount',
  'logout'
]);
</script>

<template>
  <header class="sicat-topbar" role="banner" data-testid="app-shell-navbar">
    <nav class="sicat-topbar__inner" aria-label="Topo da aplicação SICAT">
      <div class="sicat-topbar__brand-block">
        <router-link class="app-brand" to="/dashboard">
          <span class="app-brand__logo">
            <v-icon color="primary" size="24">mdi-leaf-circle</v-icon>
          </span>
          <span class="app-brand__copy">
            <strong>SICAT</strong>
            <small>MTR CETESB</small>
          </span>
        </router-link>

        <div class="sicat-topbar__context d-none d-xl-grid">
          <span class="sicat-topbar__kicker">{{ currentPageSection }}</span>
          <strong>{{ currentPageTitle }}</strong>
        </div>
      </div>

      <SicatNavigation
        v-if="isDesktop"
        :groups="groups"
        @navigate="(path) => emit('navigate', path)"
      />

      <div v-else class="sicat-topbar__mobile-leading">
        <v-btn
          icon="mdi-menu"
          variant="text"
          class="sicat-topbar__mobile-trigger"
          aria-label="Abrir menu"
          @click="emit('openMobileMenu')"
        />

        <v-tooltip v-if="showPublicHomeShortcut" location="bottom" text="Ir para a home pública">
          <template #activator="{ props: tooltipProps }">
            <v-btn
              v-bind="tooltipProps"
              class="sicat-topbar__home-action sicat-topbar__home-action--mobile"
              icon
              variant="tonal"
              color="primary"
              aria-label="Voltar para a home pública"
              @click="emit('goPublicHome')"
            />
          </template>
        </v-tooltip>
      </div>

      <div class="sicat-topbar__extra">
        <v-tooltip v-if="isDesktop && showPublicHomeShortcut" location="bottom" text="Ir para a home pública">
          <template #activator="{ props: tooltipProps }">
            <v-btn
              v-bind="tooltipProps"
              class="sicat-topbar__home-action"
              icon
              variant="tonal"
              color="primary"
              aria-label="Voltar para a home pública"
              @click="emit('goPublicHome')"
            >
              <v-icon size="18">mdi-home-import-outline</v-icon>
            </v-btn>
          </template>
        </v-tooltip>

        <v-chip
          size="small"
          color="secondary"
          variant="tonal"
          class="sicat-topbar__account-chip d-none d-md-inline-flex"
        >
          <v-icon start size="16">mdi-domain</v-icon>
          {{ activeCetesbAccountLabel }}
        </v-chip>

        <v-btn
          :icon="isDarkTheme ? 'mdi-weather-sunny' : 'mdi-weather-night'"
          variant="text"
          class="sicat-topbar__theme-toggle"
          :aria-label="isDarkTheme ? 'Ativar tema claro' : 'Ativar tema escuro'"
          @click="emit('toggleTheme')"
        />

        <SicatUserMenu
          :user="user"
          :user-initials="userInitials"
          :active-account-type-label="activeAccountTypeLabel"
          :active-cetesb-account-label="activeCetesbAccountLabel"
          :is-dark-theme="isDarkTheme"
          :can-access-admin="canAccessAdmin"
          @navigate="(path) => emit('navigate', path)"
          @switch-account="emit('switchAccount')"
          @toggle-theme="emit('toggleTheme')"
          @logout="emit('logout')"
        />
      </div>
    </nav>
  </header>
</template>

<style scoped>
.sicat-topbar {
  position: sticky;
  top: 0;
  z-index: 110;
  border-bottom: 1px solid var(--color-border);
  background: rgba(var(--v-theme-surface), 0.96);
  backdrop-filter: blur(8px);
}

.sicat-topbar__inner {
  display: flex;
  min-height: 64px;
  align-items: center;
  gap: 18px;
  margin: 0 auto;
  padding: 10px var(--space-6);
  width: 100%;
}

.sicat-topbar__brand-block {
  display: flex;
  align-items: center;
  gap: 18px;
  flex: 0 0 auto;
}

.app-brand {
  display: flex;
  align-items: center;
  gap: 12px;
  text-decoration: none;
}

.app-brand__logo {
  display: inline-flex;
  width: 38px;
  height: 38px;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-sm);
  background: rgba(var(--v-theme-primary), 0.1);
}

.app-brand__copy {
  display: grid;
  gap: 2px;
  line-height: 1.1;
}

.app-brand__copy strong {
  color: rgba(var(--v-theme-on-surface), 0.95);
  font-size: 1rem;
  font-weight: 700;
  letter-spacing: 0.01em;
}

.app-brand__copy small {
  color: rgba(var(--v-theme-on-surface), 0.64);
  font-size: 0.7rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.sicat-topbar__context {
  display: grid;
  gap: 3px;
  padding-left: 18px;
  border-left: 1px solid rgba(var(--v-border-color), 0.16);
}

.sicat-topbar__kicker {
  color: rgba(var(--v-theme-on-surface), 0.55);
  font-size: 0.68rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.sicat-topbar__context strong {
  color: rgba(var(--v-theme-on-surface), 0.86);
  font-size: 0.9rem;
  font-weight: 700;
}

.sicat-topbar__mobile-leading {
  display: flex;
  align-items: center;
  gap: 12px;
  flex: 0 0 auto;
}

.sicat-topbar__extra {
  display: flex;
  min-width: 0;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
  margin-left: auto;
}

.sicat-topbar__theme-toggle,
.sicat-topbar__mobile-trigger {
  border: 1px solid var(--color-border);
  background: rgb(var(--v-theme-surface));
}

.sicat-topbar__mobile-trigger,
.sicat-topbar__home-action--mobile {
  width: 44px;
  min-width: 44px;
  height: 44px;
}

.sicat-topbar__home-action {
  width: 42px;
  height: 42px;
  border: 1px solid rgba(var(--v-border-color), 0.24);
  background: rgba(var(--v-theme-surface), 0.84);
}

.sicat-topbar__account-chip {
  max-width: 320px;
}

@media (max-width: 1179px) {
  .sicat-topbar__inner {
    min-height: 62px;
  }
}

@media (max-width: 959px) {
  .sicat-topbar__inner {
    padding: 10px 18px;
  }
}

@media (max-width: 599px) {
  .sicat-topbar__inner {
    gap: 12px;
    min-height: 58px;
    padding-top: 8px;
    padding-bottom: 8px;
  }

  .app-brand__copy small {
    display: none;
  }
}
</style>
