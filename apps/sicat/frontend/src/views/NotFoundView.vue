<script setup>
/**
 * 404 de verdade.
 *
 * Antes: uma URL desconhecida (ex.: /rota-que-nao-existe) mantinha o endereço,
 * renderizava um card genérico do shell — sem dizer que a página não existe e
 * sem caminho de volta — e o título da aba ficava no genérico do app. Agora a
 * rota catch-all do router traz esta view, com título próprio ("Página não
 * encontrada · SICAT", via meta.breadcrumb), explicação e saídas.
 */
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';

const route = useRoute();
const router = useRouter();

/**
 * Eco do endereço pedido, só para o operador reconhecer o erro de digitação /
 * o link velho. Truncado e renderizado como TEXTO (o Vue escapa) — nunca vira
 * link nem HTML.
 */
const requestedPath = computed(() => {
  const raw = String(route.fullPath || '');
  return raw.length > 120 ? `${raw.slice(0, 120)}…` : raw;
});

const canGoBack = computed(() => Boolean(globalThis.history?.length > 1));

function goBack() {
  if (canGoBack.value) {
    router.back();
    return;
  }

  router.push('/dashboard');
}
</script>

<template>
  <section class="sicat-not-found">
    <div class="sicat-not-found__card" role="alert" aria-live="polite">
      <p class="sicat-not-found__code">Erro 404</p>
      <h1 class="sicat-not-found__title">Página não encontrada</h1>
      <p class="sicat-not-found__lead">
        O endereço abaixo não corresponde a nenhuma tela do SICAT. Ele pode ter sido digitado errado,
        vir de um link antigo ou apontar para uma tela que saiu do ar.
      </p>

      <p class="sicat-not-found__path">{{ requestedPath }}</p>

      <div class="sicat-not-found__actions">
        <v-btn color="primary" variant="flat" prepend-icon="mdi-view-dashboard-outline" to="/dashboard">
          Ir para o painel
        </v-btn>
        <v-btn variant="outlined" prepend-icon="mdi-file-document-multiple-outline" to="/manifestos">
          Ver manifestos
        </v-btn>
        <v-btn variant="text" prepend-icon="mdi-arrow-left" @click="goBack">Voltar</v-btn>
      </div>
    </div>
  </section>
</template>

<style scoped>
.sicat-not-found {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  padding: clamp(24px, 5vw, 56px) 16px;
}

.sicat-not-found__card {
  width: 100%;
  max-width: 640px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: clamp(22px, 4vw, 36px);
  border-radius: var(--radius-md, 16px);
  border: 1px solid rgba(var(--v-border-color), 0.2);
  background: rgb(var(--v-theme-surface));
  box-shadow: var(--shadow-md);
}

.sicat-not-found__code {
  margin: 0;
  font-size: 0.78rem;
  font-weight: 800;
  letter-spacing: 0.09em;
  text-transform: uppercase;
  color: rgba(var(--v-theme-primary), 0.9);
}

.sicat-not-found__title {
  margin: 0;
  font-size: clamp(1.4rem, 3vw, 1.9rem);
  line-height: 1.2;
  font-weight: 800;
  color: rgba(var(--v-theme-on-surface), 0.94);
}

.sicat-not-found__lead {
  margin: 0;
  color: rgba(var(--v-theme-on-surface), 0.7);
  line-height: 1.5;
}

.sicat-not-found__path {
  margin: 4px 0 0;
  padding: 10px 12px;
  border-radius: 10px;
  background: rgba(var(--v-theme-on-surface), 0.06);
  font-family: var(--font-family-mono);
  font-size: 0.82rem;
  color: rgba(var(--v-theme-on-surface), 0.72);
  word-break: break-all;
}

.sicat-not-found__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 8px;
}
</style>
