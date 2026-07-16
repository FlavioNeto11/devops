<template>
  <UiPageLayout
    eyebrow="Pessoa Jurídica"
    title="Editar Empresa"
    :subtitle="loadError ? '' : (pageSubtitle || 'Carregando dados...')"
    width="narrow"
    :loading="initializing"
    :error="loadError"
    :retryable="true"
    @retry="fetchPj"
  >
    <template #actions>
      <UiButton variant="ghost" :to="backRoute">Cancelar</UiButton>
    </template>

    <form v-if="!initializing && !loadError" novalidate @submit.prevent="submit">
      <!-- Seção: Identificação -->
      <UiCard title="Identificação" subtitle="Dados cadastrais da empresa">
        <UiFormSection
          title="Dados Principais"
          description="O CNPJ não pode ser alterado após o cadastro."
          :columns="2"
        >
          <UiFormField label="Razão Social" :required="true" :error="f.errors.razao_social" :full-width="true">
            <template #default="{ id, describedBy }">
              <UiInput
                :id="id"
                :described-by="describedBy"
                :model-value="f.values.razao_social"
                :error="!!f.errors.razao_social"
                :required="true"
                placeholder="Nome empresarial completo"
                autocomplete="organization"
                @update:model-value="f.setField('razao_social', $event)"
              />
            </template>
          </UiFormField>

          <!-- CNPJ: não editável após o cadastro; disabled comunica a semântica correta -->
          <UiFormField label="CNPJ" hint="Não editável após o cadastro">
            <template #default="{ id }">
              <UiInput
                :id="id"
                :model-value="f.values.cnpj"
                :disabled="true"
              />
            </template>
          </UiFormField>

          <!-- inscricao_estadual e inscricao_municipal são opcionais — sem regras de validação intencionalmente -->
          <UiFormField label="Inscrição Estadual" :error="f.errors.inscricao_estadual">
            <template #default="{ id, describedBy }">
              <UiInput
                :id="id"
                :described-by="describedBy"
                :model-value="f.values.inscricao_estadual"
                :error="!!f.errors.inscricao_estadual"
                placeholder="Ex.: 123.456.789.123"
                @update:model-value="f.setField('inscricao_estadual', $event)"
              />
            </template>
          </UiFormField>

          <UiFormField label="Inscrição Municipal" :error="f.errors.inscricao_municipal">
            <template #default="{ id, describedBy }">
              <UiInput
                :id="id"
                :described-by="describedBy"
                :model-value="f.values.inscricao_municipal"
                :error="!!f.errors.inscricao_municipal"
                placeholder="Ex.: 0001234"
                @update:model-value="f.setField('inscricao_municipal', $event)"
              />
            </template>
          </UiFormField>
        </UiFormSection>
      </UiCard>

      <!-- Seção: Regime e Atividade -->
      <UiCard
        title="Regime e Atividade"
        subtitle="Classificação fiscal e atividade econômica principal"
      >
        <UiFormSection :columns="2">
          <UiFormField
            label="Regime Tributário"
            :required="true"
            hint="Define como os tributos são apurados."
            :error="f.errors.regime_tributario"
          >
            <template #default="{ id, describedBy }">
              <!-- UiSelect não existe no kit — raw <select> com aria-invalid manual -->
              <select
                :id="id"
                :aria-describedby="describedBy"
                :aria-invalid="!!f.errors.regime_tributario ? 'true' : undefined"
                :value="f.values.regime_tributario"
                @change="f.setField('regime_tributario', $event.target.value)"
              >
                <option value="">Selecione…</option>
                <option value="simples">Simples Nacional</option>
                <option value="lucro_presumido">Lucro Presumido</option>
                <option value="lucro_real">Lucro Real</option>
              </select>
            </template>
          </UiFormField>

          <UiFormField
            label="CNAE"
            :required="true"
            hint="Código Nacional de Atividade Econômica (7 dígitos)."
            :error="f.errors.cnae"
          >
            <template #default="{ id, describedBy }">
              <UiInput
                :id="id"
                :described-by="describedBy"
                :model-value="f.values.cnae"
                :error="!!f.errors.cnae"
                :required="true"
                placeholder="Ex.: 6201-5/01"
                inputmode="numeric"
                @update:model-value="f.setField('cnae', $event)"
              />
            </template>
          </UiFormField>
        </UiFormSection>
      </UiCard>

      <!-- Seção: Dados Bancários -->
      <UiCard
        title="Dados Bancários"
        subtitle="Conta para recebimentos e pagamentos automáticos"
      >
        <UiFormSection :columns="1">
          <UiFormField
            label="Dados Bancários"
            hint="Informe banco, agência, conta e tipo (ex.: Banco do Brasil, Ag. 1234-5, C/C 00012345-6)."
            :error="f.errors.dados_bancarios"
            :full-width="true"
          >
            <template #default="{ id, describedBy }">
              <!-- UiTextarea não existe no kit — raw <textarea> com aria-invalid manual -->
              <textarea
                :id="id"
                :aria-describedby="describedBy"
                :aria-invalid="!!f.errors.dados_bancarios ? 'true' : undefined"
                :value="f.values.dados_bancarios"
                placeholder="Banco, agência, número da conta, tipo de conta…"
                rows="4"
                @input="f.setField('dados_bancarios', $event.target.value)"
              />
            </template>
          </UiFormField>
        </UiFormSection>
      </UiCard>

      <!-- Barra de ações -->
      <div class="form-footer">
        <UiButton variant="ghost" type="button" @click="cancel">Cancelar</UiButton>
        <UiButton type="submit" :loading="f.submitting.value">Salvar alterações</UiButton>
      </div>
    </form>
  </UiPageLayout>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import {
  UiPageLayout,
  UiCard,
  UiFormSection,
  UiFormField,
  UiInput,
  UiButton,
  useForm,
  useToast,
  validators,
} from '../ui/index.js';
import { resourceFactory } from '../api.js';

// Recurso PJ garantido pelo integrador via resourceFactory
const pj = resourceFactory('pj');

const props = defineProps({
  id: { type: String, required: true },
});

const router = useRouter();
const toast = useToast();

const initializing = ref(true);
const loadError = ref(null);
const pageSubtitle = ref('');

const backRoute = computed(() => '/pj');

const f = useForm({
  initial: {
    razao_social: '',
    cnpj: '',
    inscricao_estadual: '',
    inscricao_municipal: '',
    regime_tributario: '',
    cnae: '',
    dados_bancarios: '',
  },
  rules: {
    razao_social: [validators.required(), validators.minLen(2)],
    regime_tributario: [validators.required('Selecione o regime tributário')],
    cnae: [
      validators.required(),
      validators.pattern(/^\d{4}-\d\/\d{2}$/, 'Formato inválido (ex.: 6201-5/01)'),
    ],
  },
});

async function fetchPj() {
  initializing.value = true;
  loadError.value = null;
  try {
    const data = await pj.get(props.id);
    f.values.razao_social = data.razao_social || '';
    f.values.cnpj = data.cnpj || '';
    f.values.inscricao_estadual = data.inscricao_estadual || '';
    f.values.inscricao_municipal = data.inscricao_municipal || '';
    f.values.regime_tributario = data.regime_tributario || '';
    f.values.cnae = data.cnae || '';
    f.values.dados_bancarios = data.dados_bancarios || '';
    pageSubtitle.value = data.razao_social || 'Empresa';
  } catch (err) {
    loadError.value = err.message || 'Erro ao carregar os dados da empresa.';
  } finally {
    initializing.value = false;
  }
}

function submit() {
  f.handleSubmit(async (vals) => {
    // CNPJ is read-only — exclude from payload
    const { cnpj: _cnpj, ...payload } = vals;
    try {
      await pj.update(props.id, payload);
      toast.success('Empresa atualizada com sucesso.');
      router.push('/pj');
    } catch (err) {
      toast.error(err.message || 'Erro ao salvar. Tente novamente.');
    }
  });
}

function cancel() {
  router.push('/pj');
}

onMounted(fetchPj);
</script>

<style scoped>
.form-footer {
  display: flex;
  justify-content: flex-end;
  gap: var(--ui-space-2);
  padding-top: var(--ui-space-2);
}

@media (max-width: 640px) {
  .form-footer {
    flex-direction: column-reverse;
  }

  .form-footer > * {
    width: 100%;
  }
}
</style>
