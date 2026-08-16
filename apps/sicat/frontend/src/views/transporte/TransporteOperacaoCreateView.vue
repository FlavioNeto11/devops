<script setup>
// "Registrar viagem" (REQ-SICAT-0032, onda F3) — fecha o gap da jornada do
// Transportador: o POST /v1/transporte/operacoes existia no contrato e nenhuma
// tela o chamava. Draft MÍNIMO (rota obrigatória; carga/frete opcionais) — os
// vínculos de partes/veículos e o resto do ciclo continuam no detalhe.
// Molde de formulário: DmrCreateView (SicatFormSection/SicatFormField).
import { computed, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '../../stores/auth.js';
import { useNotification } from '../../composables/useNotification.js';
import { createTransportOperation } from '../../services/api.js';
import {
  buildOperationCreatePayload,
  CARGO_REGIME_OPTIONS,
  emptyOperationCreateForm,
  newOperationIdempotencyKey,
  UF_OPTIONS,
  validateOperationCreateForm
} from './operacao-create-model.js';
import SicatPageLayout from '../../components/sicat/SicatPageLayout.vue';
import SicatPageHeader from '../../components/shell/SicatPageHeader.vue';
import SicatFormSection from '../../components/sicat/SicatFormSection.vue';
import SicatFormField from '../../components/sicat/SicatFormField.vue';
import SicatInlineAlert from '../../components/sicat/SicatInlineAlert.vue';
import SicatNextStep from '../../components/sicat/SicatNextStep.vue';

const router = useRouter();
const authStore = useAuthStore();
const { notifySuccess } = useNotification();

const form = reactive(emptyOperationCreateForm());
const submitting = ref(false);
const localError = ref('');

const integrationAccountId = computed(() =>
  String(authStore.integrationAccountId.value || authStore.sessionContext.value?.integrationAccountId || '').trim()
);

async function handleSubmit() {
  localError.value = '';
  if (!integrationAccountId.value) {
    localError.value = 'Ative uma conta CETESB antes de registrar a viagem.';
    return;
  }
  const errors = validateOperationCreateForm(form);
  if (errors.length > 0) {
    localError.value = errors[0];
    return;
  }

  submitting.value = true;
  try {
    const sessionContextId = authStore.sessionContext.value?.sessionContextId || authStore.sessionContext.value?.id || null;
    const payload = buildOperationCreatePayload(form, {
      integrationAccountId: integrationAccountId.value,
      sessionContextId
    });
    const created = await createTransportOperation(payload, { idempotencyKey: newOperationIdempotencyKey() });
    notifySuccess('Viagem registrada como rascunho.');
    router.push(created?.id ? `/transporte/operacoes/${encodeURIComponent(created.id)}` : '/transporte/operacoes');
  } catch (error) {
    localError.value = error?.detail || error?.title || error?.message || 'Falha ao registrar a viagem.';
  } finally {
    submitting.value = false;
  }
}

function goBack() {
  router.push('/transporte/operacoes');
}
</script>

<template>
  <SicatPageLayout>
    <template #header>
      <SicatPageHeader
        kicker="Transporte · Operações"
        title="Registrar viagem"
        description="Comece pelo básico — origem, destino e, se já souber, carga e frete. O resto (partes, veículos, documentos e conformidade) você completa no detalhe da operação."
      />
    </template>

    <template #banner>
      <SicatInlineAlert v-if="localError" tone="error" :message="localError" />
    </template>

    <form class="operacao-create" @submit.prevent="handleSubmit">
      <SicatFormSection title="Rota" description="Origem e destino são o mínimo para a viagem existir como rascunho.">
        <div class="operacao-create__grid">
          <SicatFormField label="Município de origem" required>
            <template #default="{ id }">
              <v-text-field :id="id" v-model="form.originMunicipality" variant="outlined" density="comfortable" hide-details autocomplete="off" />
            </template>
          </SicatFormField>
          <SicatFormField label="UF de origem" required>
            <template #default="{ id }">
              <v-select :id="id" v-model="form.originUf" :items="UF_OPTIONS" variant="outlined" density="comfortable" hide-details />
            </template>
          </SicatFormField>
          <SicatFormField label="Município de destino" required>
            <template #default="{ id }">
              <v-text-field :id="id" v-model="form.destinationMunicipality" variant="outlined" density="comfortable" hide-details autocomplete="off" />
            </template>
          </SicatFormField>
          <SicatFormField label="UF de destino" required>
            <template #default="{ id }">
              <v-select :id="id" v-model="form.destinationUf" :items="UF_OPTIONS" variant="outlined" density="comfortable" hide-details />
            </template>
          </SicatFormField>
          <SicatFormField label="Distância (km)" hint="Opcional — ajuda no cálculo do piso de frete.">
            <template #default="{ id }">
              <v-text-field :id="id" v-model="form.distanceKm" type="number" min="1" variant="outlined" density="comfortable" hide-details />
            </template>
          </SicatFormField>
          <SicatFormField label="Rota com pedágio?">
            <template #default="{ id }">
              <v-switch :id="id" v-model="form.tollExpected" color="primary" hide-details inset />
            </template>
          </SicatFormField>
        </div>
      </SicatFormSection>

      <SicatFormSection title="Identificação e frete" description="Tudo opcional no rascunho — dá para completar depois.">
        <div class="operacao-create__grid">
          <SicatFormField label="Código de referência" hint="Como você identifica essa viagem no seu controle.">
            <template #default="{ id }">
              <v-text-field :id="id" v-model="form.referenceCode" variant="outlined" density="comfortable" hide-details autocomplete="off" />
            </template>
          </SicatFormField>
          <SicatFormField label="Regime da carga">
            <template #default="{ id }">
              <v-select :id="id" v-model="form.cargoRegime" :items="CARGO_REGIME_OPTIONS" item-title="label" item-value="value" variant="outlined" density="comfortable" hide-details />
            </template>
          </SicatFormField>
          <SicatFormField label="Frete ofertado (R$)">
            <template #default="{ id }">
              <v-text-field :id="id" v-model="form.freightOfferedAmount" type="number" min="0" step="0.01" variant="outlined" density="comfortable" hide-details />
            </template>
          </SicatFormField>
          <SicatFormField label="Frete contratado (R$)">
            <template #default="{ id }">
              <v-text-field :id="id" v-model="form.freightContractedAmount" type="number" min="0" step="0.01" variant="outlined" density="comfortable" hide-details />
            </template>
          </SicatFormField>
        </div>
      </SicatFormSection>

      <SicatFormSection title="Carga" description="Se já souber o que vai viajar, registre — o valor declarado é a base do seguro da viagem.">
        <div class="operacao-create__grid">
          <SicatFormField label="Tipo da carga" hint="Ex.: grãos, carga geral, mudança.">
            <template #default="{ id }">
              <v-text-field :id="id" v-model="form.cargoType" variant="outlined" density="comfortable" hide-details autocomplete="off" />
            </template>
          </SicatFormField>
          <SicatFormField label="Peso (kg)">
            <template #default="{ id }">
              <v-text-field :id="id" v-model="form.cargoWeightKg" type="number" min="0" variant="outlined" density="comfortable" hide-details />
            </template>
          </SicatFormField>
          <SicatFormField label="Valor da carga (R$)" glossary="averbacao" hint="Base da averbação no seguro e do limite de garantia.">
            <template #default="{ id }">
              <v-text-field :id="id" v-model="form.cargoDeclaredValue" type="number" min="0" step="0.01" variant="outlined" density="comfortable" hide-details />
            </template>
          </SicatFormField>
          <SicatFormField label="Carga perigosa?">
            <template #default="{ id }">
              <v-switch :id="id" v-model="form.cargoDangerousGoods" color="primary" hide-details inset />
            </template>
          </SicatFormField>
        </div>
      </SicatFormSection>

      <div class="operacao-create__actions">
        <v-btn variant="text" :disabled="submitting" @click="goBack">Cancelar</v-btn>
        <v-btn color="primary" type="submit" :loading="submitting" prepend-icon="mdi-plus-circle-outline">
          Registrar viagem
        </v-btn>
      </div>

      <SicatNextStep
        title="Depois de registrar"
        message="A viagem nasce como rascunho: no detalhe você vincula transportador, veículos e carga, envia para validação e acompanha a conformidade."
        icon="mdi-map-marker-path"
      />
    </form>
  </SicatPageLayout>
</template>

<style scoped>
.operacao-create { display: flex; flex-direction: column; gap: var(--space-5); }
.operacao-create__grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: var(--space-4); }
.operacao-create__actions { display: flex; justify-content: flex-end; gap: var(--space-3); }
</style>
