<template>
  <UiPageLayout
    eyebrow="Contas a Pagar"
    :title="pageTitle"
    :subtitle="pageSubtitle"
    width="narrow"
    :loading="initializing"
    :error="loadError"
    :retryable="true"
    @retry="fetchRecord"
  >
    <template #actions>
      <UiButton variant="ghost" to="/accounts-payable">Cancelar</UiButton>
    </template>

    <form v-if="!initializing && !loadError" novalidate @submit.prevent="submit">

      <!-- Seção: Identificação -->
      <UiCard title="Identificação" subtitle="Dados básicos da despesa">
        <UiFormSection
          title="Fornecedor e valor"
          description="Campos obrigatórios para o registro do lançamento."
          :columns="2"
        >
          <UiFormField label="Fornecedor" :required="true" :error="f.errors.contraparte" hint="Razão social ou nome do fornecedor.">
            <template #default="{ id, describedBy }">
              <input
                :id="id"
                :aria-describedby="describedBy"
                aria-required="true"
                :value="f.values.contraparte"
                type="text"
                placeholder="Ex.: Energia SP S.A."
                autocomplete="organization"
                @input="f.setField('contraparte', $event.target.value)"
              />
            </template>
          </UiFormField>

          <UiFormField label="Valor (R$)" :required="true" :error="f.errors.valor" hint="Valor do lançamento em reais.">
            <template #default="{ id, describedBy }">
              <input
                :id="id"
                :aria-describedby="describedBy"
                aria-required="true"
                :value="f.values.valor"
                type="number"
                min="0"
                step="0.01"
                placeholder="0,00"
                @input="f.setField('valor', $event.target.value === '' ? '' : Number($event.target.value))"
              />
            </template>
          </UiFormField>

          <UiFormField label="Data de Vencimento" :required="true" :error="f.errors.data" hint="Data limite para o pagamento.">
            <template #default="{ id, describedBy }">
              <input
                :id="id"
                :aria-describedby="describedBy"
                aria-required="true"
                :value="f.values.data"
                type="date"
                @input="f.setField('data', $event.target.value)"
              />
            </template>
          </UiFormField>

          <UiFormField label="Status" :error="f.errors.status" hint="Estado atual desta conta.">
            <template #default="{ id, describedBy }">
              <select
                :id="id"
                :aria-describedby="describedBy"
                :value="f.values.status"
                @change="f.setField('status', $event.target.value)"
              >
                <option value="">Não definido</option>
                <option value="pendente">Pendente</option>
                <option value="pago">Pago</option>
                <option value="vencido">Vencido</option>
                <option value="cancelado">Cancelado</option>
              </select>
            </template>
          </UiFormField>
        </UiFormSection>
      </UiCard>

      <!-- Seção: Classificação -->
      <UiCard title="Classificação" subtitle="Categoria, centro de custo e forma de pagamento">
        <UiFormSection :columns="2">
          <UiFormField label="Categoria" :error="f.errors.categoria" hint="Tipo de despesa (ex.: Aluguel, Folha, Energia).">
            <template #default="{ id, describedBy }">
              <input
                :id="id"
                :aria-describedby="describedBy"
                :value="f.values.categoria"
                type="text"
                placeholder="Ex.: Aluguel"
                @input="f.setField('categoria', $event.target.value)"
              />
            </template>
          </UiFormField>

          <UiFormField label="Centro de Custo" :error="f.errors.centro_custo" hint="Departamento ou projeto vinculado.">
            <template #default="{ id, describedBy }">
              <input
                :id="id"
                :aria-describedby="describedBy"
                :value="f.values.centro_custo"
                type="text"
                placeholder="Ex.: TI, Comercial"
                @input="f.setField('centro_custo', $event.target.value)"
              />
            </template>
          </UiFormField>

          <UiFormField label="Forma de Pagamento" :error="f.errors.forma_pagamento">
            <template #default="{ id, describedBy }">
              <select
                :id="id"
                :aria-describedby="describedBy"
                :value="f.values.forma_pagamento"
                @change="f.setField('forma_pagamento', $event.target.value)"
              >
                <option value="">Selecione…</option>
                <option value="cheque">Cheque</option>
                <option value="TED">TED</option>
                <option value="cartão">Cartão</option>
                <option value="boleto">Boleto</option>
                <option value="dinheiro">Dinheiro</option>
              </select>
            </template>
          </UiFormField>

          <UiFormField label="Data do Pagamento Realizado" :error="f.errors.data_pagamento_realizado" hint="Deixe em branco se ainda não foi pago.">
            <template #default="{ id, describedBy }">
              <input
                :id="id"
                :aria-describedby="describedBy"
                :value="f.values.data_pagamento_realizado"
                type="date"
                @input="f.setField('data_pagamento_realizado', $event.target.value)"
              />
            </template>
          </UiFormField>
        </UiFormSection>
      </UiCard>

      <!-- Seção: Recorrência e Descrição -->
      <UiCard title="Detalhes Adicionais" subtitle="Recorrência e informações complementares">
        <UiFormSection :columns="2">
          <UiFormField label="Recorrente" hint="Marque se esta despesa se repete periodicamente.">
            <template #default="{ id, describedBy }">
              <div class="checkbox-row">
                <input
                  :id="id"
                  :aria-describedby="describedBy"
                  type="checkbox"
                  :checked="f.values.recorrente"
                  class="checkbox-input"
                  @change="f.setField('recorrente', $event.target.checked)"
                />
                <label :for="id" class="checkbox-label">Despesa recorrente</label>
              </div>
            </template>
          </UiFormField>

          <UiFormField v-if="f.values.recorrente" label="Tipo de Recorrência" :error="f.errors.recorrencia_tipo">
            <template #default="{ id, describedBy }">
              <select
                :id="id"
                :aria-describedby="describedBy"
                :value="f.values.recorrencia_tipo"
                @change="f.setField('recorrencia_tipo', $event.target.value)"
              >
                <option value="">Selecione a frequência…</option>
                <option value="mensal">Mensal</option>
                <option value="quinzenal">Quinzenal</option>
                <option value="semanal">Semanal</option>
                <option value="anual">Anual</option>
              </select>
            </template>
          </UiFormField>

          <UiFormField label="Descrição" :full-width="true" :error="f.errors.descricao" hint="Observações ou referências adicionais.">
            <template #default="{ id, describedBy }">
              <textarea
                :id="id"
                :aria-describedby="describedBy"
                :value="f.values.descricao"
                placeholder="Descreva os detalhes relevantes para este lançamento…"
                rows="4"
                @input="f.setField('descricao', $event.target.value)"
              />
            </template>
          </UiFormField>
        </UiFormSection>
      </UiCard>

      <!-- Barra de ações -->
      <div class="form-footer">
        <div class="form-footer-meta" v-if="originalData">
          <UiStatusBadge :status="originalData.status || 'pendente'" />
          <span class="footer-sep">·</span>
          <span class="footer-hint">Última atualização: {{ fmt.formatDateTime(originalData.updated_at || originalData.created_at) }}</span>
        </div>
        <div class="form-footer-actions">
          <UiButton variant="ghost" type="button" @click="cancel">Cancelar</UiButton>
          <UiButton type="submit" :loading="f.submitting.value">Salvar alterações</UiButton>
        </div>
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
  UiButton,
  UiStatusBadge,
  useForm,
  useToast,
  validators,
  format as fmt,
} from '../ui/index.js';
import { accountsPayable } from '../api.js';

const props = defineProps({
  id: { type: String, required: true },
});

const router = useRouter();
const toast = useToast();

const initializing = ref(true);
const loadError = ref(null);
const originalData = ref(null);

const pageTitle = computed(() => {
  if (initializing.value) return 'Editar Conta a Pagar';
  if (!originalData.value) return 'Editar Conta a Pagar';
  return 'Editar — ' + (originalData.value.contraparte || 'Conta a Pagar');
});

const pageSubtitle = computed(() => {
  if (initializing.value) return 'Carregando dados…';
  if (!originalData.value) return '';
  const parts = [];
  const venc = originalData.value.data ? fmt.formatDate(originalData.value.data) : null;
  const status = originalData.value.status;
  const valor = originalData.value.valor != null ? fmt.formatCurrency(originalData.value.valor) : null;
  if (valor) parts.push(valor);
  if (venc) parts.push('Vence em ' + venc);
  if (status) parts.push(status.charAt(0).toUpperCase() + status.slice(1));
  return parts.join(' · ') || 'Conta a pagar';
});

const f = useForm({
  initial: {
    contraparte: '',
    valor: '',
    data: '',
    categoria: '',
    centro_custo: '',
    descricao: '',
    recorrente: false,
    recorrencia_tipo: '',
    forma_pagamento: '',
    status: '',
    data_pagamento_realizado: '',
  },
  rules: {
    contraparte: [validators.required('Informe o nome do fornecedor')],
    valor: [
      validators.required('Informe o valor da conta'),
      validators.numeric('Valor deve ser numérico'),
      validators.min(0, 'Valor deve ser maior ou igual a zero'),
    ],
    data: [validators.required('Informe a data de vencimento')],
  },
});

async function fetchRecord() {
  initializing.value = true;
  loadError.value = null;
  try {
    const data = await accountsPayable.get(props.id);
    originalData.value = data;

    f.values.contraparte = data.contraparte || '';
    f.values.valor = data.valor != null ? data.valor : '';
    f.values.data = data.data ? data.data.slice(0, 10) : '';
    f.values.categoria = data.categoria || '';
    f.values.centro_custo = data.centro_custo || '';
    f.values.descricao = data.descricao || '';
    f.values.recorrente = !!data.recorrente;
    f.values.recorrencia_tipo = data.recorrencia_tipo || '';
    f.values.forma_pagamento = data.forma_pagamento || '';
    f.values.status = data.status || '';
    f.values.data_pagamento_realizado = data.data_pagamento_realizado
      ? data.data_pagamento_realizado.slice(0, 10)
      : '';
  } catch (err) {
    loadError.value = err.message || 'Erro ao carregar os dados da conta a pagar.';
  } finally {
    initializing.value = false;
  }
}

function submit() {
  if (f.values.recorrente && !f.values.recorrencia_tipo) {
    toast.error('Selecione o tipo de recorrência para prosseguir.');
    return;
  }
  f.handleSubmit(async (vals) => {
    const payload = {
      contraparte: vals.contraparte,
      valor: vals.valor !== '' ? Number(vals.valor) : undefined,
      data: vals.data,
      categoria: vals.categoria || undefined,
      centro_custo: vals.centro_custo || undefined,
      descricao: vals.descricao || undefined,
      recorrente: vals.recorrente || undefined,
      recorrencia_tipo: vals.recorrente && vals.recorrencia_tipo ? vals.recorrencia_tipo : undefined,
      forma_pagamento: vals.forma_pagamento || undefined,
      status: vals.status || undefined,
      data_pagamento_realizado: vals.data_pagamento_realizado || undefined,
    };

    for (const k of Object.keys(payload)) {
      if (payload[k] === undefined) delete payload[k];
    }

    try {
      await accountsPayable.update(props.id, payload);
      toast.success('Conta a pagar atualizada com sucesso.');
      router.push('/accounts-payable');
    } catch (err) {
      toast.error(err.message || 'Erro ao salvar. Tente novamente.');
    }
  });
}

function cancel() {
  router.push('/accounts-payable');
}

onMounted(fetchRecord);
</script>

<style scoped>
.form-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ui-space-3);
  padding-top: var(--ui-space-3);
  padding-bottom: var(--ui-space-6);
  flex-wrap: wrap;
}

.form-footer-meta {
  display: flex;
  align-items: center;
  gap: var(--ui-space-2);
  font-size: var(--ui-text-sm);
  color: rgb(var(--ui-muted));
  flex-shrink: 0;
}

.footer-sep {
  color: rgb(var(--ui-border-strong));
}

.footer-hint {
  white-space: nowrap;
}

.form-footer-actions {
  display: flex;
  gap: var(--ui-space-2);
  margin-left: auto;
}

.checkbox-row {
  display: flex;
  align-items: center;
  gap: var(--ui-space-2);
  padding: var(--ui-space-2) 0;
}

.checkbox-input {
  width: 18px;
  height: 18px;
  accent-color: rgb(var(--ui-accent));
  cursor: pointer;
  flex-shrink: 0;
}

.checkbox-label {
  font-size: var(--ui-text-sm);
  color: rgb(var(--ui-fg));
  cursor: pointer;
  user-select: none;
}

@media (max-width: 640px) {
  .form-footer {
    flex-direction: column;
    align-items: stretch;
  }

  .form-footer-actions {
    flex-direction: column-reverse;
    margin-left: 0;
  }

  .form-footer-meta {
    flex-wrap: wrap;
    justify-content: center;
  }
}
</style>
