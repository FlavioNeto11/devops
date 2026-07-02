<template>
  <UiPageLayout
    title="Editar Pessoa Física"
    eyebrow="Cadastro"
    subtitle="Atualize os dados cadastrais da pessoa física."
    width="narrow"
    :loading="loadingData"
    :error="loadError ? loadError.message || String(loadError) : null"
    @retry="loadPf"
  >
    <template #actions>
      <UiButton variant="ghost" :to="{ name: 'pf-detail', params: { id } }">Ver detalhes</UiButton>
    </template>

    <template #banner>
      <UiEmptyState
        v-if="notFound"
        icon="search"
        title="Pessoa física não encontrada"
        description="Verifique o identificador e tente novamente."
      />
    </template>

    <UiCard v-if="!loadingData && !loadError" title="Dados Cadastrais" subtitle="Campos marcados com * são obrigatórios">
      <form novalidate @submit.prevent="handleSubmit">
        <!-- Seção: Identificação -->
        <UiFormSection title="Identificação" description="Dados de identidade da pessoa física." :columns="2">
          <UiFormField
            label="Nome Completo"
            :required="true"
            :error="f.errors.nome"
            hint="Nome completo conforme documento oficial."
          >
            <template #default="{ id: fid, describedBy }">
              <UiInput
                :id="fid"
                :described-by="describedBy"
                :model-value="f.values.nome"
                :error="!!f.errors.nome"
                :required="true"
                placeholder="Ex.: Maria da Silva"
                autocomplete="name"
                @update:model-value="f.setField('nome', $event)"
              />
            </template>
          </UiFormField>

          <UiFormField
            label="CPF"
            :required="true"
            hint="CPF não pode ser alterado após o cadastro."
          >
            <template #default="{ id: fid, describedBy }">
              <UiInput
                :id="fid"
                :described-by="describedBy"
                :model-value="f.values.cpf"
                :disabled="true"
                placeholder="000.000.000-00"
                inputmode="numeric"
              />
            </template>
          </UiFormField>
        </UiFormSection>

        <!-- Seção: Dados Pessoais -->
        <UiFormSection title="Dados Pessoais" description="Informações complementares da pessoa física." :columns="2">
          <UiFormField
            label="Data de Nascimento"
            :error="f.errors.data_nascimento"
          >
            <template #default="{ id: fid, describedBy }">
              <UiInput
                :id="fid"
                type="date"
                :described-by="describedBy"
                :model-value="f.values.data_nascimento"
                :error="!!f.errors.data_nascimento"
                @update:model-value="f.setField('data_nascimento', $event)"
              />
            </template>
          </UiFormField>

          <UiFormField
            label="Patrimônio Inicial"
            :error="f.errors.patrimonio_inicial"
            hint="Valor do patrimônio no momento do cadastro (R$)."
          >
            <template #default="{ id: fid, describedBy }">
              <UiInput
                :id="fid"
                type="number"
                inputmode="decimal"
                :described-by="describedBy"
                :model-value="f.values.patrimonio_inicial"
                :error="!!f.errors.patrimonio_inicial"
                placeholder="0,00"
                min="0"
                step="0.01"
                @update:model-value="f.setField('patrimonio_inicial', $event)"
              />
            </template>
          </UiFormField>
        </UiFormSection>

        <!-- Seção: Endereço -->
        <UiFormSection title="Endereço" description="Endereço completo de residência." :columns="1">
          <UiFormField
            label="Endereço"
            :error="f.errors.endereco"
            hint="Logradouro, número, complemento, bairro, cidade, estado."
            :full-width="true"
          >
            <template #default="{ id: fid, describedBy }">
              <UiTextarea
                :id="fid"
                :described-by="describedBy"
                :model-value="f.values.endereco"
                :error="!!f.errors.endereco"
                rows="3"
                placeholder="Ex.: Rua das Flores, 123, Apto 4B, Centro, São Paulo — SP, 01001-000"
                @update:model-value="f.setField('endereco', $event)"
              />
            </template>
          </UiFormField>
        </UiFormSection>

        <!-- Rodapé de ações -->
        <div class="form-actions">
          <UiButton variant="ghost" type="button" @click="cancelEdit">Cancelar</UiButton>
          <UiButton
            type="submit"
            variant="primary"
            :loading="f.submitting.value"
            :disabled="f.submitting.value"
          >
            Salvar alterações
          </UiButton>
        </div>
      </form>
    </UiCard>
  </UiPageLayout>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import {
  UiPageLayout,
  UiCard,
  UiFormSection,
  UiFormField,
  UiInput,
  UiTextarea,
  UiEmptyState,
  UiButton,
  useForm,
  useToast,
  validators,
} from '../ui/index.js';
import { resourceFactory } from '../api.js';

// recurso pf garantido pelo integrador via resourceFactory
const pf = resourceFactory('pf');

const props = defineProps({
  id: { type: String, required: true },
});

const router = useRouter();
const toast = useToast();

const loadingData = ref(true);
const loadError = ref(null);
const notFound = ref(false);

const f = useForm({
  initial: {
    nome: '',
    cpf: '',
    data_nascimento: '',
    patrimonio_inicial: '',
    endereco: '',
  },
  rules: {
    nome: [validators.required('Nome completo é obrigatório'), validators.minLen(2, 'Nome muito curto')],
    patrimonio_inicial: [validators.numeric('Informe um valor numérico válido'), validators.min(0, 'Patrimônio não pode ser negativo')],
  },
});

async function loadPf() {
  loadingData.value = true;
  loadError.value = null;
  notFound.value = false;
  try {
    const data = await pf.get(props.id);
    f.values.nome = data.nome || '';
    f.values.cpf = data.cpf || '';
    f.values.data_nascimento = data.data_nascimento ? data.data_nascimento.slice(0, 10) : '';
    f.values.patrimonio_inicial = data.patrimonio_inicial !== null && data.patrimonio_inicial !== undefined
      ? String(data.patrimonio_inicial)
      : '';
    f.values.endereco = data.endereco || '';
  } catch (e) {
    if (e.status === 404) {
      notFound.value = true;
    } else {
      loadError.value = e;
    }
  } finally {
    loadingData.value = false;
  }
}

async function handleSubmit() {
  await f.handleSubmit(async (vals) => {
    // CPF readonly — não envia no payload de atualização
    const payload = {
      nome: vals.nome,
      data_nascimento: vals.data_nascimento || null,
      patrimonio_inicial: vals.patrimonio_inicial !== '' && vals.patrimonio_inicial !== null
        ? Number(vals.patrimonio_inicial)
        : null,
      endereco: vals.endereco || null,
    };
    try {
      await pf.update(props.id, payload);
      toast.success('Dados atualizados com sucesso.');
      router.push({ name: 'pf-detail', params: { id: props.id } });
    } catch (e) {
      toast.error(e.message || 'Erro ao salvar os dados. Tente novamente.');
    }
  });
}

function cancelEdit() {
  router.push({ name: 'pf-detail', params: { id: props.id } });
}

onMounted(loadPf);
</script>

<style scoped>
.form-actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--ui-space-2);
  padding-top: var(--ui-space-4);
  border-top: 1px solid rgb(var(--ui-border));
  margin-top: var(--ui-space-2);
}

@media (max-width: 640px) {
  .form-actions {
    flex-direction: column-reverse;
  }
}
</style>
