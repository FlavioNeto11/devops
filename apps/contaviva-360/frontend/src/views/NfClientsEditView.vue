<template>
  <UiPageLayout
    eyebrow="Clientes NF"
    title="Editar Cliente NF"
    :subtitle="loadError ? '' : (pageSubtitle || 'Carregando dados...')"
    width="narrow"
    :loading="initializing"
    :error="loadError"
    :retryable="true"
    @retry="fetchClient"
  >
    <template #actions>
      <UiButton variant="ghost" :to="backRoute">Cancelar</UiButton>
    </template>

    <form v-if="!initializing && !loadError" novalidate @submit.prevent="submit">
      <!-- Seção: Identificação -->
      <UiCard
        title="Identificação"
        subtitle="Dados de identificação fiscal do cliente"
      >
        <UiFormSection
          title="Dados Principais"
          description="O CNPJ não pode ser alterado após o cadastro."
          :columns="2"
        >
          <UiFormField
            label="Razão Social"
            :required="true"
            :error="f.errors.razao_social"
            :full-width="true"
          >
            <template #default="{ id, describedBy }">
              <UiInput
                :id="id"
                :described-by="describedBy"
                :model-value="f.values.razao_social"
                :error="f.errors.razao_social"
                placeholder="Nome empresarial completo"
                autocomplete="organization"
                autofocus
                @update:model-value="f.setField('razao_social', $event)"
              />
            </template>
          </UiFormField>

          <UiFormField
            label="CNPJ"
            hint="Não editável após o cadastro."
          >
            <template #default="{ id }">
              <UiInput
                :id="id"
                :model-value="f.values.cnpj"
                :disabled="true"
              />
            </template>
          </UiFormField>

          <UiFormField
            label="Inscrição Estadual"
            hint="Informe se o cliente possui inscrição estadual."
            :error="f.errors.inscricao_estadual"
          >
            <template #default="{ id, describedBy }">
              <UiInput
                :id="id"
                :described-by="describedBy"
                :model-value="f.values.inscricao_estadual"
                :error="f.errors.inscricao_estadual"
                placeholder="Ex.: 123.456.789.123"
                @update:model-value="f.setField('inscricao_estadual', $event)"
              />
            </template>
          </UiFormField>

          <UiFormField
            label="Inscrição Municipal"
            hint="Informe se o cliente possui inscrição municipal."
            :error="f.errors.inscricao_municipal"
          >
            <template #default="{ id, describedBy }">
              <UiInput
                :id="id"
                :described-by="describedBy"
                :model-value="f.values.inscricao_municipal"
                :error="f.errors.inscricao_municipal"
                placeholder="Ex.: 0001234"
                @update:model-value="f.setField('inscricao_municipal', $event)"
              />
            </template>
          </UiFormField>
        </UiFormSection>
      </UiCard>

      <!-- Seção: Classificação -->
      <UiCard
        title="Classificação"
        subtitle="Tipo de cliente para fins de emissão de NF"
      >
        <UiFormSection :columns="1">
          <UiFormField
            label="Tipo de Cliente"
            hint="Determina o tratamento fiscal na emissão de notas fiscais."
            :required="true"
            :error="f.errors.tipo_cliente"
          >
            <template #default="{ id, describedBy }">
              <select
                :id="id"
                :aria-describedby="describedBy"
                :aria-invalid="!!f.errors.tipo_cliente || undefined"
                :value="f.values.tipo_cliente"
                @change="f.setField('tipo_cliente', $event.target.value)"
              >
                <option value="">Selecione o tipo…</option>
                <option value="empresa">Empresa</option>
                <option value="consumidor_final">Consumidor Final</option>
                <option value="orgao_publico">Órgão Público</option>
              </select>
            </template>
          </UiFormField>
        </UiFormSection>
      </UiCard>

      <!-- Seção: Endereço -->
      <!-- NOTA: endereço armazenado como string livre (legado). Débito técnico: estruturar em
           logradouro/numero/complemento/bairro/municipio/uf/cep quando o backend suportar. -->
      <UiCard
        title="Endereço"
        subtitle="Localização do cliente para emissão de documentos fiscais"
      >
        <UiFormSection :columns="1">
          <UiFormField
            label="Endereço"
            hint="Informe logradouro, número, complemento, bairro, cidade, estado e CEP."
            :error="f.errors.endereco"
            :full-width="true"
          >
            <template #default="{ id, describedBy }">
              <UiTextarea
                :id="id"
                :described-by="describedBy"
                :model-value="f.values.endereco"
                :error="f.errors.endereco"
                placeholder="Rua, número, complemento, bairro, cidade — UF, CEP"
                :rows="4"
                @update:model-value="f.setField('endereco', $event)"
              />
            </template>
          </UiFormField>
        </UiFormSection>
      </UiCard>

      <!-- Seção: Contato -->
      <UiCard
        title="Contato"
        subtitle="Informações de contato para comunicação e envio de notas"
      >
        <UiFormSection :columns="1">
          <UiFormField
            label="Contato"
            hint="Telefone, e-mail e nome do responsável, se houver."
            :error="f.errors.contato"
            :full-width="true"
          >
            <template #default="{ id, describedBy }">
              <UiTextarea
                :id="id"
                :described-by="describedBy"
                :model-value="f.values.contato"
                :error="f.errors.contato"
                placeholder="Nome do responsável, telefone, e-mail…"
                :rows="4"
                @update:model-value="f.setField('contato', $event)"
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
  UiTextarea,
  UiButton,
  useForm,
  useToast,
  validators,
} from '../ui/index.js';
import { resourceFactory } from '../api.js';

// Recurso nf-clients garantido pelo integrador via resourceFactory
const nfClients = resourceFactory('nf-clients');

const props = defineProps({
  id: { type: String, required: true },
});

const router = useRouter();
const toast = useToast();

const initializing = ref(true);
const loadError = ref(null);
const pageSubtitle = ref('');

const backRoute = computed(() => '/nf-clients');

const f = useForm({
  initial: {
    razao_social: '',
    cnpj: '',
    inscricao_estadual: '',
    inscricao_municipal: '',
    tipo_cliente: '',
    endereco: '',
    contato: '',
  },
  rules: {
    razao_social: [validators.required(), validators.minLen(2)],
    tipo_cliente: [validators.required()],
    endereco: [validators.maxLen(500)],
    contato: [validators.maxLen(300)],
  },
});

async function fetchClient() {
  initializing.value = true;
  loadError.value = null;
  try {
    const data = await nfClients.get(props.id);
    f.values.razao_social = data.razao_social || '';
    f.values.cnpj = data.cnpj || '';
    f.values.inscricao_estadual = data.inscricao_estadual || '';
    f.values.inscricao_municipal = data.inscricao_municipal || '';
    f.values.tipo_cliente = data.tipo_cliente || '';
    f.values.endereco = data.endereco || '';
    f.values.contato = data.contato || '';
    pageSubtitle.value = data.razao_social || 'Cliente NF';
  } catch (err) {
    loadError.value = err.message || 'Erro ao carregar os dados do cliente.';
  } finally {
    initializing.value = false;
  }
}

function submit() {
  f.handleSubmit(async (vals) => {
    // CNPJ é somente leitura — excluir do payload de atualização
    const { cnpj: _cnpj, ...payload } = vals;
    try {
      await nfClients.update(props.id, payload);
      toast.success('Cliente NF atualizado com sucesso.');
      router.push('/nf-clients');
    } catch (err) {
      toast.error(err.message || 'Erro ao salvar. Tente novamente.');
    }
  });
}

function cancel() {
  router.push('/nf-clients');
}

onMounted(fetchClient);
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
