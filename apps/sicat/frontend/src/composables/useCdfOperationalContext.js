import { computed } from 'vue';
import { useAuthStore } from '../stores/auth.js';

function buildRequestedBy(user) {
  const email = String(user?.email || '').trim();
  if (email) {
    return email;
  }

  const name = String(user?.name || user?.userId || '').trim();
  return name || 'frontend.sicat';
}

export function useCdfOperationalContext() {
  const authStore = useAuthStore();

  const activeAccount = computed(() => authStore.activeAccount.value || null);
  const integrationAccountId = computed(() => String(authStore.integrationAccountId.value || '').trim());
  const sessionContextId = computed(() => String(authStore.sessionContext.value?.id || authStore.sessionContext.value?.sessionContextId || '').trim());
  const contextReady = computed(() => Boolean(integrationAccountId.value && sessionContextId.value));
  const requestedBy = computed(() => buildRequestedBy(authStore.user.value || null));

  async function ensureOperationalContext() {
    const ready = await authStore.ensureSessionContextReady();
    if (!ready || !integrationAccountId.value || !sessionContextId.value) {
      throw new Error('Contexto operacional incompleto. Atualize a sessao CETESB antes de continuar.');
    }
  }

  return {
    activeAccount,
    integrationAccountId,
    sessionContextId,
    contextReady,
    requestedBy,
    ensureOperationalContext
  };
}
