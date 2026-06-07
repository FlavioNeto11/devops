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
    <v-card class="manifest-create-hero">
      <v-card-text>
        <v-row align="center">
          <v-col>
            <div class="text-overline text-primary mb-1">Novo manifesto</div>
            <h2 class="text-h4 font-weight-semibold mb-1">Emissão guiada de MTR</h2>
            <p class="text-body-2 text-medium-emphasis mb-2">O fluxo agora segue um wizard amplo: contexto, participantes, resíduo e revisão final antes da criação.</p>
            <div class="d-flex flex-wrap ga-2 align-center">
              <v-chip size="small" color="warning" variant="tonal">Em elaboração</v-chip>
              <v-chip size="small" color="primary" variant="tonal">Wizard checkout-inspired</v-chip>
              <span class="text-caption text-medium-emphasis">Conta ativa: <strong>{{ activeAccountLabel }}</strong></span>
            </div>
          </v-col>
          <v-col cols="auto">
            <v-btn variant="outlined" prepend-icon="mdi-arrow-left" @click="goBack">Voltar</v-btn>
          </v-col>
        </v-row>
      </v-card-text>
    </v-card>

    <v-card>
      <v-card-text>
        <ManifestCreateForm
          :integration-account-id="createIntegrationAccountId"
          :user="authStore.user.value"
          :partner="authStore.partner.value"
          :session-context="authStore.sessionContext.value"
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

@media (max-width: 767px) {
  .manifest-create-page {
    gap: 16px;
  }
}
</style>
