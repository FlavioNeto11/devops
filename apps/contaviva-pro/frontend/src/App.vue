<template>
  <UiAppShell :title="title" :nav="visibleNav">
    <template #sidebar-footer>
      <div v-if="auth.user.value" class="app-userbox">
        <p class="app-userbox-name">{{ auth.user.value.name || auth.user.value.email }}</p>
        <p class="app-userbox-role ui-muted">{{ roleLabel(auth.user.value.role) }}</p>
        <UiButton variant="ghost" size="sm" block @click="onLogout">Sair</UiButton>
      </div>
      <UiButton v-else variant="ghost" size="sm" block to="/login">Entrar</UiButton>
    </template>
    <RouterView />
  </UiAppShell>
  <UiToast />
  <UiConfirmDialog />
</template>
<script setup>
import { computed, onMounted } from 'vue';
import { RouterView, useRouter } from 'vue-router';
import { UiAppShell, UiButton, UiToast, UiConfirmDialog } from './ui/index.js';
import { nav } from './nav.js';
import { useAuth } from './composables/useAuth.js';
import { roleLabel } from './lib/roles.js';
const title = 'ContaViva Pro';
const auth = useAuth();
const router = useRouter();
// itens marcados adminOnly só aparecem para admin; o resto exige sessão (sem sessão -> nav vazio).
const visibleNav = computed(() => {
  const isAdmin = auth.isAdmin.value;
  const authed = !!auth.user.value;
  return nav
    .map((g) => ({ ...g, items: g.items.filter((it) => (it.adminOnly ? isAdmin : (it.public || authed))) }))
    .filter((g) => g.items.length);
});
async function onLogout() { await auth.logout(); router.push('/login'); }
// hidrata a sessão a partir do token guardado (se houver) ao montar a casca.
onMounted(() => { auth.bootstrap(); });
</script>
<style scoped>
.app-userbox { border-top: 1px solid rgb(var(--ui-border)); margin-top: var(--ui-space-3); padding-top: var(--ui-space-3); display: flex; flex-direction: column; gap: 4px; }
.app-userbox-name { margin: 0; font-size: var(--ui-text-sm); font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.app-userbox-role { margin: 0 0 var(--ui-space-2); font-size: var(--ui-text-xs); text-transform: capitalize; }
</style>
