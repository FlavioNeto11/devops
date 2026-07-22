<template>
  <UiAppShell :title="title" :nav="nav" me-url="/neuroevolui/api/me" :login-href="loginHref">
    <RouterView />
  </UiAppShell>

  <!-- Faixa global de sessão expirada (UX-NEURO-007). Qualquer chamada de API que devolva 401
       dispara o evento `neuro:auth-expired` (ver api.js → apiError/signalUnauthenticated). Aqui
       oferecemos reautenticação preservando a rota atual — em QUALQUER tela — em vez de deixar a
       view tratar 401 como "sem permissão / fale com um administrador" (que é o caso do 403). -->
  <div v-if="sessionExpired" class="ne-reauth" role="alert" aria-live="assertive">
    <span class="ne-reauth-icon" aria-hidden="true">⚠</span>
    <span class="ne-reauth-text">Sua sessão expirou. Entre novamente para continuar de onde parou.</span>
    <a class="ui-btn ne-reauth-cta" data-variant="primary" data-size="sm" :href="loginHref">Entrar novamente</a>
    <button type="button" class="ne-reauth-close" aria-label="Dispensar aviso" @click="sessionExpired = false">✕</button>
  </div>

  <UiToast />
  <UiConfirmDialog />
</template>
<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { RouterView, useRoute } from 'vue-router';
import { UiAppShell, UiToast, UiConfirmDialog } from './ui/index.js';
import { nav } from './nav.js';
import { loginUrl } from './api.js';

const title = 'NeuroEvolui';
const route = useRoute();

// Href de (re)login que preserva o deep-link atual. Depende de route.fullPath para reavaliar a
// cada navegação; loginUrl() lê a location viva (que já inclui a base /neuroevolui/).
const loginHref = computed(() => {
  void route.fullPath;
  return loginUrl();
});

// Estado da faixa de reautenticação, acionado pelo sinal global de 401.
const sessionExpired = ref(false);
function onAuthExpired() { sessionExpired.value = true; }
onMounted(() => {
  if (typeof window !== 'undefined') window.addEventListener('neuro:auth-expired', onAuthExpired);
});
onUnmounted(() => {
  if (typeof window !== 'undefined') window.removeEventListener('neuro:auth-expired', onAuthExpired);
});
</script>
<style scoped>
/* Faixa fixa (bottom-center) — não sobrepõe a topbar; visível em qualquer tela. */
.ne-reauth {
  position: fixed;
  left: 50%;
  bottom: var(--ui-space-5, 20px);
  transform: translateX(-50%);
  z-index: 200;
  display: flex;
  align-items: center;
  gap: var(--ui-space-3, 12px);
  max-width: min(560px, calc(100vw - 2 * var(--ui-space-4, 16px)));
  padding: var(--ui-space-3, 12px) var(--ui-space-4, 16px);
  border-radius: var(--ui-radius-md, 10px);
  background: rgb(var(--ui-surface));
  border: 1px solid rgb(var(--ui-warning) / 0.5);
  box-shadow: var(--ui-shadow-lg, 0 12px 32px rgb(2 6 23 / 0.28));
  color: rgb(var(--ui-fg));
  font-size: var(--ui-text-sm);
}
.ne-reauth-icon {
  flex: 0 0 auto;
  color: rgb(var(--ui-warning));
  font-size: 1.15em;
}
.ne-reauth-text {
  flex: 1 1 auto;
  line-height: 1.35;
}
.ne-reauth-cta {
  flex: 0 0 auto;
  white-space: nowrap;
}
.ne-reauth-close {
  flex: 0 0 auto;
  background: none;
  border: none;
  color: rgb(var(--ui-muted));
  cursor: pointer;
  font-size: 1rem;
  line-height: 1;
  padding: 2px 4px;
  border-radius: var(--ui-radius-sm, 6px);
}
.ne-reauth-close:hover { background: rgb(var(--ui-surface-2)); color: rgb(var(--ui-fg)); }
.ne-reauth-close:focus-visible { outline: 2px solid rgb(var(--ui-accent)); outline-offset: 1px; }

@media (max-width: 520px) {
  .ne-reauth {
    left: var(--ui-space-3, 12px);
    right: var(--ui-space-3, 12px);
    transform: none;
    flex-wrap: wrap;
  }
  .ne-reauth-text { flex: 1 1 100%; }
}
</style>
