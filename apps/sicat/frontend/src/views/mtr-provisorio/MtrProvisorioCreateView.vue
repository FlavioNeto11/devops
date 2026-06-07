<script setup>
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';
import ManifestCreateForm from '../../components/ManifestCreateForm.vue';
import { useAuthStore } from '../../stores/auth.js';
import { useMtrProvisorioStore } from '../../stores/mtrProvisorioStore.js';
import { describeMtrProvisorioError } from './mtrProvisorioUiHelpers.js';

/**
 * Criação de MTR provisório — wizard guiado.
 *
 * Cadeia: mtr-provisorio-wizard-frontend (fase 07-frontend-ux).
 *
 * R3-C garante que `MtrProvisorioCreateRequest` é equivalente a
 * `ManifestCreateRequest` na borda HTTP, então reusamos integralmente o
 * wizard `ManifestCreateForm` (etapas: contexto → participantes → resíduo
 * → revisão), injetando `submitHandler` para roteamento ao
 * `useMtrProvisorioStore().createDraft` em vez de `createManifest`.
 *
 * Mantém: `Idempotency-Key` (gerado pelo store via
 * `buildMtrProvisorioIdempotencyKey`), fluxo `command-accepted` (202),
 * contrato HTTP existente em `mtrProvisorioService.js`. Após sucesso,
 * redireciona para `/mtr-provisorio/:id` do MTR recém-criado.
 */

const router = useRouter();
const authStore = useAuthStore();
const store = useMtrProvisorioStore();

const localError = ref('');

const integrationAccountId = computed(() => String(
  authStore.integrationAccountId.value
  || authStore.sessionContext.value?.integrationAccountId
  || ''
).trim());

const sessionContext = computed(() => authStore.sessionContext.value || null);
const user = computed(() => authStore.user.value || null);
const partner = computed(() => authStore.partner.value || null);

async function submitHandler(payload) {
  localError.value = '';
  store.clearCommandState();

  const sessionContextId = String(
    sessionContext.value?.sessionContextId || sessionContext.value?.id || ''
  ).trim();

  if (!integrationAccountId.value) {
    throw new Error('Ative uma conta CETESB antes de criar o MTR provisório.');
  }
  if (!sessionContextId) {
    throw new Error('Sessão CETESB ausente — reautentique antes de criar o MTR provisório.');
  }

  // Reaproveita o payload `ManifestCreateRequest` montado pelo wizard,
  // garantindo o sessionContextId resolvido (o wizard pode enviar
  // `undefined` quando ainda não bootstrapou).
  const provisorioPayload = {
    ...payload,
    integrationAccountId: integrationAccountId.value,
    sessionContextId
  };

  try {
    const created = await store.createDraft(provisorioPayload);
    const createdId = created?.id || created?.commandId || created?.entityId || null;
    return {
      createdId,
      successMessage: 'MTR provisório enfileirado para envio.'
    };
  } catch (error) {
    const friendly = describeMtrProvisorioError(error, 'Falha ao criar MTR provisório.');
    localError.value = friendly;
    throw new Error(friendly);
  }
}

function handleSuccess({ createdId }) {
  if (createdId) {
    router.push(`/mtr-provisorio/${encodeURIComponent(createdId)}`);
  } else {
    router.push('/mtr-provisorio');
  }
}

function goBack() {
  router.push('/mtr-provisorio');
}
</script>

<template>
  <div class="mtr-provisorio-create-page" data-testid="mtrp-create-wizard">
    <div class="mtr-provisorio-create-toolbar">
      <v-btn variant="outlined" prepend-icon="mdi-arrow-left" data-testid="mtrp-create-back" @click="goBack">
        Voltar
      </v-btn>
    </div>

    <v-alert v-if="localError" type="error" variant="tonal" density="comfortable" data-testid="mtrp-create-error">
      {{ localError }}
    </v-alert>

    <ManifestCreateForm
      :integration-account-id="integrationAccountId"
      :user="user"
      :partner="partner"
      :session-context="sessionContext"
      :submit-handler="submitHandler"
      single-only
      page-kicker="MTR Provisório · Novo"
      page-title="Criar MTR provisório"
      page-description="Comando assíncrono — o backend enfileira `manifest.submit` com `kind=provisorio` e o worker cuida do envio à CETESB."
      primary-action-label="Criar MTR provisório"
      @success="handleSuccess"
    />
  </div>
</template>

<style scoped>
.mtr-provisorio-create-page {
  display: grid;
  gap: 16px;
}

.mtr-provisorio-create-toolbar {
  display: flex;
  justify-content: flex-end;
}
</style>
