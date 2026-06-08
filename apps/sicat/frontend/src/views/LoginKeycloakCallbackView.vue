<script setup>
import { onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAuthStore } from '../stores/auth.js';
import { exchangeKeycloakCode } from '../services/keycloak.js';

const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();

onMounted(async () => {
  try {
    if (route.query.error) {
      throw new Error(String(route.query.error_description || route.query.error));
    }
    const accessToken = await exchangeKeycloakCode(
      String(route.query.code || ''),
      String(route.query.state || '')
    );
    const ok = await authStore.loginWithKeycloakToken(accessToken);
    if (!ok) {
      throw new Error(authStore.error.value || 'Falha no login via Keycloak.');
    }
    // Mesmo destino do login local: admin -> dashboard; senao -> selecao CETESB.
    router.replace(authStore.canAccessAdmin.value ? '/operacao/dashboard' : '/login/cetesb');
  } catch (e) {
    router.replace({ path: '/login', query: { error: e?.message || 'keycloak_failed' } });
  }
});
</script>

<template>
  <div class="kc-callback">
    <v-progress-circular indeterminate color="primary" size="42" />
    <p class="mt-4 text-medium-emphasis">Entrando via Keycloak…</p>
  </div>
</template>

<style scoped>
.kc-callback {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}
</style>
