<script setup>
import { computed, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '../../stores/auth.js';
import { useDmrStore } from '../../stores/dmrStore.js';
import { DMR_ROLE_OPTIONS, describeDmrError } from './dmrUiHelpers.js';
import SicatPageLayout from '../../components/sicat/SicatPageLayout.vue';
import SicatPageHeader from '../../components/shell/SicatPageHeader.vue';
import SicatFormSection from '../../components/sicat/SicatFormSection.vue';
import SicatFormField from '../../components/sicat/SicatFormField.vue';
import SicatInlineAlert from '../../components/sicat/SicatInlineAlert.vue';

const router = useRouter();
const authStore = useAuthStore();
const store = useDmrStore();

const { commandLoading, commandError, createDmrDraft, clearCommandState } = store;

const today = new Date().toISOString().slice(0, 10);
const lastMonth = new Date();
lastMonth.setMonth(lastMonth.getMonth() - 1);
const defaultStart = `${lastMonth.getFullYear()}-${String(lastMonth.getMonth() + 1).padStart(2, '0')}-01`;

const form = reactive({
  role: 'gerador',
  periodStart: defaultStart,
  periodEnd: today,
  periodLabel: '',
  requestedBy: ''
});

const localError = ref('');

const integrationAccountId = computed(() =>
  String(authStore.integrationAccountId.value || authStore.sessionContext.value?.integrationAccountId || '').trim()
);

const activeAccountLabel = computed(() => {
  const account = authStore.activeAccount.value || null;
  if (!account) return 'não selecionada';
  const name = String(account.partnerName || '').trim();
  const code = String(account.partnerCode || '').trim();
  if (name && code) return `${name} (cód. ${code})`;
  return name || code || account.accountId || 'conta ativa';
});

function autoLabel() {
  if (form.periodLabel) return form.periodLabel;
  const start = String(form.periodStart || '').trim();
  const end = String(form.periodEnd || '').trim();
  if (!start || !end) return '';
  return `${start} a ${end}`;
}

async function handleSubmit() {
  localError.value = '';
  clearCommandState();

  if (!integrationAccountId.value) {
    localError.value = 'Ative uma conta CETESB antes de criar a DMR.';
    return;
  }

  if (!form.role || !form.periodStart || !form.periodEnd) {
    localError.value = 'Informe papel, início e fim do período.';
    return;
  }

  try {
    const created = await createDmrDraft({
      integrationAccountId: integrationAccountId.value,
      role: form.role,
      periodStart: form.periodStart,
      periodEnd: form.periodEnd,
      periodLabel: form.periodLabel || autoLabel(),
      ...(form.requestedBy ? { requestedBy: form.requestedBy } : {})
    });

    router.push(created?.id ? `/dmr/${encodeURIComponent(created.id)}` : '/dmr');
  } catch (error) {
    localError.value = describeDmrError(error, 'Falha ao criar DMR.');
  }
}

function goBack() {
  router.push('/dmr');
}
</script>

<template>
  <SicatPageLayout width="narrow">
    <template #header>
      <SicatPageHeader
        kicker="Resíduos · DMR"
        title="Criar DMR rascunho"
        :description="`Defina período, papel e identificação. Itens serão consolidados a partir dos manifestos SICAT. Conta ativa: ${activeAccountLabel}.`"
      >
        <template #actions>
          <v-btn variant="outlined" prepend-icon="mdi-arrow-left" @click="goBack">Voltar</v-btn>
        </template>
      </SicatPageHeader>
    </template>

    <v-form @submit.prevent="handleSubmit">
      <SicatFormSection title="Dados da declaração" description="Período e papel determinam quais manifestos serão consolidados.">
        <SicatFormField label="Papel da declaração" required>
          <template #default="{ id }">
            <v-select
              :id="id"
              v-model="form.role"
              :items="DMR_ROLE_OPTIONS"
              item-title="label"
              item-value="value"
              density="comfortable"
              variant="outlined"
              hide-details="auto"
            />
          </template>
        </SicatFormField>

        <SicatFormField label="Solicitante" hint="E-mail ou identificador interno (opcional)">
          <template #default="{ id }">
            <v-text-field :id="id" v-model="form.requestedBy" density="comfortable" variant="outlined" hide-details="auto" />
          </template>
        </SicatFormField>

        <SicatFormField label="Início do período" required>
          <template #default="{ id }">
            <v-text-field :id="id" v-model="form.periodStart" type="date" density="comfortable" variant="outlined" hide-details="auto" />
          </template>
        </SicatFormField>

        <SicatFormField label="Fim do período" required>
          <template #default="{ id }">
            <v-text-field :id="id" v-model="form.periodEnd" type="date" density="comfortable" variant="outlined" hide-details="auto" />
          </template>
        </SicatFormField>

        <SicatFormField label="Rótulo do período" hint="Ex.: Janeiro/2026 — preenchido automaticamente se vazio." full-width>
          <template #default="{ id }">
            <v-text-field :id="id" v-model="form.periodLabel" density="comfortable" variant="outlined" hide-details="auto" />
          </template>
        </SicatFormField>
      </SicatFormSection>

      <SicatInlineAlert v-if="localError" tone="error" :message="localError" class="mt-4" />
      <SicatInlineAlert v-else-if="commandError" tone="error" :message="commandError" class="mt-4" />

      <div class="d-flex justify-end ga-2 mt-4">
        <v-btn variant="text" :disabled="commandLoading" @click="goBack">Cancelar</v-btn>
        <v-btn color="primary" variant="flat" type="submit" :loading="commandLoading">Criar rascunho</v-btn>
      </div>
    </v-form>
  </SicatPageLayout>
</template>
