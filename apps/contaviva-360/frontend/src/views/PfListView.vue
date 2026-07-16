<template>
  <UiPageLayout
    title="Pessoas Físicas"
    eyebrow="Cadastro"
    subtitle="Lista paginada de pessoas físicas cadastradas no tenant."
    :error="r.error.value ? (r.error.value.message || 'Erro ao carregar pessoas físicas.') : null"
    @retry="r.load"
  >
    <template #actions>
      <UiButton @click="openNew">Nova Pessoa Física</UiButton>
    </template>

    <template #filters>
      <UiFiltersPanel
        v-model="filters"
        :fields="filterFields"
        @apply="applyFilters"
        @clear="applyFilters"
      />
    </template>

    <UiDataTable
      :columns="columns"
      :rows="r.items.value"
      :loading="r.loading.value"
      row-key="id"
      server-mode
      :sort="r.sort.value"
      :page="r.page.value"
      :page-size="r.pageSize.value"
      :total="r.total.value"
      paginated
      :empty="{ title: 'Nenhuma pessoa física cadastrada', description: 'Cadastre a primeira pessoa física do tenant para começar.' }"
      @update:sort="r.setSort"
      @update:page="r.setPage"
    >
      <template #cell-cpf="{ value }">
        <span class="pf-cpf">{{ formatCpf(value) }}</span>
      </template>

      <template #cell-patrimonio_inicial="{ value }">
        <span class="pf-currency">{{ format.formatCurrency(value) }}</span>
      </template>

      <template #cell-status_fiscal="{ value }">
        <UiStatusBadge :status="value" with-dot />
      </template>

      <template #cell-acoes="{ row }">
        <UiButton
          variant="ghost"
          size="sm"
          type="button"
          :aria-label="'Editar ' + row.nome"
          @click.stop="openEdit(row)"
        >
          Editar
        </UiButton>
      </template>

      <template #empty-action>
        <UiButton @click="openNew">Cadastrar Pessoa Física</UiButton>
      </template>
    </UiDataTable>

    <UiModal
      v-model:open="showForm"
      :title="editing ? 'Editar Pessoa Física' : 'Nova Pessoa Física'"
      width="lg"
    >
      <form class="pf-form" @submit.prevent="save">
        <UiFormSection title="Dados Pessoais" :columns="2">
          <UiFormField
            label="Nome Completo"
            :required="true"
            :error="formErrors.nome"
          >
            <template #default="{ id, describedBy }">
              <UiInput
                :id="id"
                :described-by="describedBy"
                :model-value="formValues.nome"
                type="text"
                placeholder="Nome completo da pessoa física"
                autocomplete="name"
                :error="!!formErrors.nome"
                :required="true"
                @update:model-value="setField('nome', $event)"
              />
            </template>
          </UiFormField>

          <UiFormField
            label="CPF"
            :required="true"
            :error="formErrors.cpf"
            hint="Somente números ou no formato 000.000.000-00"
          >
            <template #default="{ id, describedBy }">
              <UiInput
                :id="id"
                :described-by="describedBy"
                :model-value="formValues.cpf"
                type="text"
                placeholder="000.000.000-00"
                inputmode="numeric"
                autocomplete="off"
                :error="!!formErrors.cpf"
                :required="true"
                @update:model-value="setField('cpf', $event)"
              />
            </template>
          </UiFormField>

          <UiFormField
            label="Data de Nascimento"
            :error="formErrors.data_nascimento"
          >
            <template #default="{ id, describedBy }">
              <UiInput
                :id="id"
                :described-by="describedBy"
                :model-value="formValues.data_nascimento"
                type="date"
                :error="!!formErrors.data_nascimento"
                @update:model-value="setField('data_nascimento', $event)"
              />
            </template>
          </UiFormField>

          <UiFormField
            label="Patrimônio Inicial (R$)"
            :error="formErrors.patrimonio_inicial"
            hint="Valor em reais"
          >
            <template #default="{ id, describedBy }">
              <UiInput
                :id="id"
                :described-by="describedBy"
                :model-value="formValues.patrimonio_inicial === null ? '' : String(formValues.patrimonio_inicial)"
                type="number"
                placeholder="0,00"
                step="0.01"
                min="0"
                :error="!!formErrors.patrimonio_inicial"
                @update:model-value="setField('patrimonio_inicial', $event === '' ? null : Number($event))"
              />
            </template>
          </UiFormField>
        </UiFormSection>

        <UiFormSection title="Endereço" :columns="1">
          <UiFormField
            label="Endereço Completo"
            :error="formErrors.endereco"
          >
            <template #default="{ id, describedBy }">
              <textarea
                :id="id"
                :aria-describedby="describedBy"
                :aria-invalid="formErrors.endereco ? 'true' : undefined"
                :value="formValues.endereco"
                rows="3"
                placeholder="Rua, número, bairro, cidade, estado, CEP"
                @input="setField('endereco', $event.target.value)"
              />
            </template>
          </UiFormField>
        </UiFormSection>

        <div class="pf-form-actions">
          <UiButton variant="ghost" type="button" @click="showForm = false">Cancelar</UiButton>
          <UiButton type="submit" :loading="submitting">
            {{ editing ? 'Salvar alterações' : 'Cadastrar' }}
          </UiButton>
        </div>
      </form>
    </UiModal>
  </UiPageLayout>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import {
  UiPageLayout,
  UiDataTable,
  UiButton,
  UiFiltersPanel,
  UiStatusBadge,
  UiModal,
  UiFormField,
  UiFormSection,
  UiInput,
  useResource,
  useToast,
  useForm,
  format,
  validators,
} from '../ui/index.js';
import { resourceFactory } from '../api.js';

// Recurso REST /v1/pf
const pf = resourceFactory('pf');

const router = useRouter();
const toast = useToast();

// --- Lista / filtros ---
const r = useResource(pf);

const filterFields = [
  { key: 'nome', label: 'Nome', type: 'text', placeholder: 'Buscar por nome' },
  { key: 'cpf', label: 'CPF', type: 'text', placeholder: '000.000.000-00' },
];

const filters = ref({ nome: '', cpf: '' });

function applyFilters() {
  r.setFilters(filters.value);
}

function navigateToDetail(row) {
  router.push('/pf/' + row.id);
}

// --- Colunas da tabela ---
const columns = [
  { key: 'nome', label: 'Nome', sortable: true },
  { key: 'cpf', label: 'CPF' },
  { key: 'patrimonio_inicial', label: 'Patrimônio Inicial', align: 'right' },
  { key: 'status_fiscal', label: 'Status Fiscal', align: 'center' },
  { key: 'acoes', label: '', align: 'right' },
];

// --- Formatador de CPF ---
function formatCpf(value) {
  if (!value) return '—';
  const digits = String(value).replace(/\D/g, '');
  if (digits.length !== 11) return String(value);
  return digits.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
}

// --- Formulário de criação/edição ---
const showForm = ref(false);
const editing = ref(null);

const formRules = {
  nome: [
    validators.required('Nome completo é obrigatório'),
    validators.minLen(3, 'Nome deve ter ao menos 3 caracteres'),
  ],
  cpf: [
    validators.required('CPF é obrigatório'),
    validators.pattern(/^\d{3}\.?\d{3}\.?\d{3}-?\d{2}$/, 'CPF inválido'),
  ],
};

const { values: formValues, errors: formErrors, submitting, setField, handleSubmit, reset: resetForm } = useForm({
  initial: {
    nome: '',
    cpf: '',
    data_nascimento: '',
    patrimonio_inicial: null,
    endereco: '',
  },
  rules: formRules,
});

function openNew() {
  editing.value = null;
  resetForm();
  showForm.value = true;
}

function openEdit(row) {
  editing.value = row.id;
  resetForm();
  setField('nome', row.nome ?? '');
  setField('cpf', row.cpf ?? '');
  setField('data_nascimento', row.data_nascimento ?? '');
  setField('patrimonio_inicial', row.patrimonio_inicial ?? null);
  setField('endereco', row.endereco ?? '');
  showForm.value = true;
}

const save = () => handleSubmit(async () => {
  try {
    const payload = { ...formValues };
    if (!payload.data_nascimento) delete payload.data_nascimento;
    if (payload.patrimonio_inicial === null || payload.patrimonio_inicial === '') delete payload.patrimonio_inicial;
    if (!payload.endereco) delete payload.endereco;

    if (editing.value) {
      await pf.update(editing.value, payload);
      toast.success('Pessoa física atualizada com sucesso.');
    } else {
      await pf.create(payload);
      toast.success('Pessoa física cadastrada com sucesso.');
    }

    showForm.value = false;
    r.load();
  } catch (e) {
    toast.error(e.message || 'Erro ao salvar pessoa física.');
  }
});

onMounted(r.load);
</script>

<style scoped>
.pf-cpf {
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.03em;
  color: rgb(var(--ui-fg));
  font-size: var(--ui-text-sm);
}

.pf-currency {
  font-variant-numeric: tabular-nums;
  font-weight: 600;
  color: rgb(var(--ui-fg));
  font-size: var(--ui-text-sm);
}

.pf-form {
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-5);
}

.pf-form-actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--ui-space-2);
  padding-top: var(--ui-space-3);
  border-top: 1px solid rgb(var(--ui-border));
}

@media (max-width: 860px) {
  .pf-form-actions {
    flex-direction: column-reverse;
  }

  .pf-form-actions > * {
    width: 100%;
  }
}
</style>
