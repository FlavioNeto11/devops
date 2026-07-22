<script setup>
import { ref } from 'vue';
import { RouterLink, RouterView, useRouter } from 'vue-router';
import Icon from '../components/Icon.vue';
import { MODULES } from '../nav';
import { roleLabel } from '../utils/format';
import { useAuthStore } from '../stores/auth';

const auth = useAuthStore();
const router = useRouter();
const open = ref(false); // drawer mobile

function logout() {
  auth.logout();
  router.push('/');
}
</script>

<template>
  <div class="ap-shell">
    <aside class="ap-side" :class="{ open }">
      <RouterLink to="/app/dashboard" class="ap-brand" @click="open = false">
        <span class="dot" /> imobia
      </RouterLink>
      <nav class="ap-nav">
        <RouterLink
          v-for="m in MODULES"
          :key="m.key"
          :to="m.to"
          class="ap-navitem"
          @click="open = false"
        >
          <Icon :name="m.icon" :size="18" />
          <span>{{ m.label }}</span>
        </RouterLink>
      </nav>
      <div class="ap-userbox">
        <div class="ap-user">
          <div class="ap-avatar">{{ (auth.user?.name || '?').slice(0, 1).toUpperCase() }}</div>
          <div class="ap-usermeta">
            <strong>{{ auth.user?.name }}</strong>
            <small>{{ auth.organization?.name }} · {{ roleLabel(auth.role) }}</small>
          </div>
        </div>
        <button class="ap-logout" @click="logout" title="Sair"><Icon name="logout" :size="16" /></button>
      </div>
    </aside>

    <div v-if="open" class="ap-backdrop" @click="open = false" />

    <div class="ap-main">
      <header class="ap-topbar">
        <button class="ap-burger" @click="open = !open" aria-label="menu">
          <span /><span /><span />
        </button>
        <div class="ap-spacer" />
        <RouterLink to="/" class="ap-home" title="Página pública"><Icon name="home" :size="16" /> site</RouterLink>
      </header>
      <div class="ap-content"><RouterView /></div>
    </div>
  </div>
</template>
