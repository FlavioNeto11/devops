<template>
  <UiAppShell :title="title" :nav="nav" me-url="/contaviva-360/api/me">
    <template #sidebar-footer>
      <div v-if="identity" class="cv-identity">
        <span class="cv-identity-avatar" aria-hidden="true">{{ identityInitial }}</span>
        <span class="cv-identity-meta">
          <span class="cv-identity-user" :title="identity.user">{{ identity.user }}</span>
          <span class="cv-identity-role">{{ roleLabel }}</span>
        </span>
      </div>
    </template>
    <RouterView />
  </UiAppShell>
  <UiToast />
  <UiConfirmDialog />
</template>
<script setup>
import { ref, computed, onMounted } from 'vue';
import { RouterView } from 'vue-router';
import { UiAppShell, UiToast, UiConfirmDialog } from './ui/index.js';
import { me } from './api.js';
import { nav } from './nav.js';

const title = 'ContaViva 360';

// Identidade + papel ativos, visíveis de forma persistente na base da navegação (UX-CV360-005).
// O chip do TOPO do shell só aparece quando /me traz `email` (contrato futuro do login OIDC de borda);
// hoje /me devolve { role, user, tenantId } com user="local" (ou o e-mail do SSO). Enquanto o e-mail
// no /me não chega, mostramos aqui quem está ativo e em qual papel — sem inventar endpoint nem tocar
// a autoridade da API/RBAC. Fail-soft: se /me falhar, apenas não renderizamos o chip.
const identity = ref(null);

const ROLE_LABEL = {
  admin: 'Administrador',
  manager: 'Gestor',
  contador: 'Contador',
  member: 'Cliente',
  cliente_pf: 'Cliente PF',
  cliente_pj: 'Cliente PJ',
};
const roleLabel = computed(() => {
  const r = identity.value && identity.value.role;
  return r ? (ROLE_LABEL[r] || r) : 'Perfil';
});
const identityInitial = computed(() => {
  const u = identity.value && identity.value.user;
  return u ? String(u).charAt(0).toUpperCase() : '?';
});

onMounted(async () => {
  try {
    const m = await me();
    if (m && (m.user || m.role)) identity.value = { user: m.user || 'local', role: m.role || '' };
  } catch { /* fail-soft */ }
});
</script>
<style scoped>
.cv-identity { display: flex; align-items: center; gap: var(--ui-space-2); margin-top: var(--ui-space-3); padding-top: var(--ui-space-3); border-top: 1px solid rgb(var(--ui-border)); }
.cv-identity-avatar { display: inline-grid; place-items: center; width: 30px; height: 30px; flex-shrink: 0; border-radius: 50%; background: rgb(var(--ui-accent) / 0.16); color: rgb(var(--ui-accent-strong)); font-weight: 700; font-size: var(--ui-text-sm); }
.cv-identity-meta { display: flex; flex-direction: column; min-width: 0; }
.cv-identity-user { font-size: var(--ui-text-sm); font-weight: 600; color: rgb(var(--ui-fg)); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cv-identity-role { font-size: var(--ui-text-xs); color: rgb(var(--ui-muted)); }
</style>
