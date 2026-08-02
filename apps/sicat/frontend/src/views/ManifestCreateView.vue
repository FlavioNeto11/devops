<script setup>
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import ManifestCreateForm from '../components/ManifestCreateForm.vue';
import { useAuthStore } from '../stores/auth.js';
import { useManifestsStore } from '../stores/manifests.js';

const router = useRouter();
const authStore = useAuthStore();
const manifestsStore = useManifestsStore();

const createIntegrationAccountId = computed(() => {
  return authStore.integrationAccountId.value || manifestsStore.filters.integrationAccountId || '';
});

const activeAccountLabel = computed(() => {
  const account = authStore.activeAccount.value || null;
  if (!account) {
    return 'não informada';
  }

  const partnerName = String(account.partnerName || '').trim();
  const partnerCode = String(account.partnerCode || '').trim();

  if (partnerName && partnerCode) {
    return `${partnerName} (cód. ${partnerCode})`;
  }

  return partnerName || partnerCode || 'não informada';
});

async function handleCreateSuccess(payload) {
  if (payload?.groupId) {
    router.push({
      path: '/manifestos',
      query: {
        refresh: '1',
        batchCreated: '1',
        groupId: payload.groupId,
        count: String(payload.batchCount || 0),
        ...(payload?.integrationAccountId ? { integrationAccountId: payload.integrationAccountId } : {})
      }
    });
    return;
  }

  if (payload?.createdId) {
    const shouldAutoRefresh = Boolean(payload?.submitResult?.jobId);
    const submitJobId = payload?.submitResult?.jobId || null;
    router.push({
      path: `/manifestos/${payload.createdId}`,
      query: {
        ...(shouldAutoRefresh ? { autoRefresh: '1' } : {}),
        ...(submitJobId ? { jobId: submitJobId } : {}),
        ...(payload?.integrationAccountId ? { integrationAccountId: payload.integrationAccountId } : {})
      }
    });
    return;
  }

  router.push('/manifestos');
}

function goBack() {
  router.push('/manifestos');
}
</script>

<template>
  <div class="manifest-create-page">
    <!--
      Um título por tela: o h1 "Emitir MTR" vem do SicatPageHeader do shell
      (route.meta.breadcrumb). Esta faixa é só contexto + navegação, e o wizard
      recebe kicker/título vazios — antes a tela empilhava três títulos
      ("Emitir MTR" → "Emissão guiada de MTR" → "Criar manifesto").
    -->
    <v-card class="manifest-create-hero">
      <v-card-text class="manifest-create-context">
        <span class="text-body-2 text-medium-emphasis">Conta ativa: <strong>{{ activeAccountLabel }}</strong></span>
        <v-btn variant="outlined" prepend-icon="mdi-arrow-left" @click="goBack">Voltar</v-btn>
      </v-card-text>
    </v-card>

    <v-card>
      <v-card-text>
        <ManifestCreateForm
          :integration-account-id="createIntegrationAccountId"
          :user="authStore.user.value"
          :partner="authStore.partner.value"
          :session-context="authStore.sessionContext.value"
          page-kicker=""
          page-title=""
          page-description="Emissão em quatro passos: contexto da viagem, participantes, resíduo e revisão final antes de criar."
          @success="handleCreateSuccess"
        />
      </v-card-text>
    </v-card>
  </div>
</template>

<style scoped>
.manifest-create-page {
  display: grid;
  gap: 20px;
}

.manifest-create-hero {
  background: linear-gradient(135deg, rgba(var(--v-theme-surface), 0.96) 0%, rgba(var(--v-theme-primary), 0.08) 100%);
}

.manifest-create-context {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
}

@media (max-width: 767px) {
  .manifest-create-page {
    gap: 16px;
  }
}
</style>
