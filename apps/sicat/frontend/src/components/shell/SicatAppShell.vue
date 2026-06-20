<script setup>
import { computed, ref } from 'vue';
import { useRoute } from 'vue-router';
import SicatTopbar from './SicatTopbar.vue';
import SicatMobileDrawer from './SicatMobileDrawer.vue';
import SicatPageHeader from './SicatPageHeader.vue';
import { getShellScreenDescription } from '../../config/conversation-screen-catalog.js';
import { shellHasViewHeader } from '../../composables/usePageChrome.js';

const props = defineProps({
  groups: { type: Array, required: true },
  isDesktop: { type: Boolean, default: true },
  isDarkTheme: { type: Boolean, default: false },
  showPublicHomeShortcut: { type: Boolean, default: false },
  user: { type: Object, default: null },
  userInitials: { type: String, default: 'SI' },
  activeAccountTypeLabel: { type: String, default: '' },
  activeCetesbAccountLabel: { type: String, default: '' },
  canAccessAdmin: { type: Boolean, default: false }
});

const emit = defineEmits([
  'goPublicHome',
  'toggleTheme',
  'navigate',
  'switchAccount',
  'logout'
]);

const route = useRoute();
const isMobileMenuOpen = ref(false);

const isChatRoute = computed(() => route.path === '/conversacional/chat');

const breadcrumbs = computed(() => {
  const trail = Array.isArray(route.meta?.breadcrumb) ? route.meta.breadcrumb : [];
  return trail.length ? trail : ['SICAT'];
});

const currentPageTitle = computed(() => breadcrumbs.value[breadcrumbs.value.length - 1] || 'SICAT');
const currentPageSection = computed(() => breadcrumbs.value[0] || 'SICAT');
const currentPageDescription = computed(
  () => getShellScreenDescription(route.name)
    || 'Operação integrada do SICAT com experiência visual unificada em light e dark.'
);

// Oculta o header genérico do shell quando a route pede, em chat, ou quando a
// própria view já fornece um SicatPageHeader (evita cabeçalho duplicado).
const hidePageHeader = computed(
  () => Boolean(route.meta?.hidePageHeader) || isChatRoute.value || shellHasViewHeader.value
);

function handleNavigate(path) {
  isMobileMenuOpen.value = false;
  emit('navigate', path);
}
</script>

<template>
  <div class="sicat-shell">
    <SicatTopbar
      :groups="groups"
      :is-desktop="isDesktop"
      :is-dark-theme="isDarkTheme"
      :show-public-home-shortcut="showPublicHomeShortcut"
      :user="user"
      :user-initials="userInitials"
      :active-account-type-label="activeAccountTypeLabel"
      :active-cetesb-account-label="activeCetesbAccountLabel"
      :current-page-section="currentPageSection"
      :current-page-title="currentPageTitle"
      :can-access-admin="canAccessAdmin"
      @open-mobile-menu="isMobileMenuOpen = true"
      @go-public-home="emit('goPublicHome')"
      @toggle-theme="emit('toggleTheme')"
      @navigate="handleNavigate"
      @switch-account="emit('switchAccount')"
      @logout="emit('logout')"
    />

    <SicatMobileDrawer
      v-model="isMobileMenuOpen"
      :groups="groups"
      :active-account-type-label="activeAccountTypeLabel"
      :active-cetesb-account-label="activeCetesbAccountLabel"
      :user-email="user?.email || ''"
      @navigate="handleNavigate"
    />

    <div class="sicat-shell__page">
      <main
        class="sicat-shell__content"
        :class="{ 'sicat-shell__content--chat': isChatRoute }"
      >
        <div
          class="sicat-shell__container"
          :class="{ 'sicat-shell__container--chat': isChatRoute }"
        >
          <SicatPageHeader
            v-if="!hidePageHeader"
            :breadcrumbs="breadcrumbs"
            :title="currentPageTitle"
            :section="currentPageSection"
            :description="currentPageDescription"
            :active-account-type-label="activeAccountTypeLabel"
            :active-cetesb-account-label="activeCetesbAccountLabel"
          />

          <slot />
        </div>
      </main>

      <footer class="sicat-shell__footer">
        <div class="sicat-shell__footer-inner">
          <span>SICAT MTR CETESB</span>
          <span>Shell unificado · navegação por intenção · light e dark</span>
        </div>
      </footer>
    </div>
  </div>
</template>

<style scoped>
.sicat-shell {
  display: flex;
  min-height: 100vh;
  flex-direction: column;
  /* Fundo liso: o visual monocromático não usa os radial-gradients antigos. */
  background: rgb(var(--v-theme-background));
}

.sicat-shell__page {
  display: flex;
  flex: 1;
  min-height: 0;
  flex-direction: column;
}

.sicat-shell__content {
  flex: 1;
  padding: 22px 0 34px;
  overflow-y: auto;
}

.sicat-shell__content--chat {
  overflow: hidden;
  display: flex;
  flex-direction: column;
  padding-bottom: 0;
}

.sicat-shell__content--chat > .sicat-shell__container {
  flex: 1;
  min-height: 0;
  /* O chat ocupa a largura total: anula o cap de leitura do container base. */
  max-width: none;
  display: flex;
  flex-direction: column;
  padding-bottom: 0;
}

.sicat-shell__container {
  width: 100%;
  max-width: var(--app-max-width);
  margin-inline: auto;
  padding: 0 clamp(18px, 2.2vw, 28px);
}

.sicat-shell__footer {
  margin-top: auto;
  border-top: 1px solid var(--color-border);
  background: rgb(var(--v-theme-surface));
}

.sicat-shell__footer-inner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 14px clamp(18px, 2.2vw, 28px);
  color: rgba(var(--v-theme-on-surface), 0.58);
  font-size: 0.8rem;
}

@media (max-width: 959px) {
  .sicat-shell__content {
    padding-top: 18px;
  }

  .sicat-shell__footer-inner {
    flex-direction: column;
    align-items: flex-start;
  }
}
</style>
