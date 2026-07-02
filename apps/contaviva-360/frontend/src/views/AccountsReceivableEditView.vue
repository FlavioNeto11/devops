<template>
  <UiPageLayout
    eyebrow="Contas a Receber"
    :title="pageTitle"
    :subtitle="pageSubtitle"
    width="default"
    :loading="initializing"
    :error="loadError"
    :retryable="true"
    @retry="fetchRecord"
  >
    <template #actions>
      <UiButton variant="ghost" to="/accounts-receivable">Cancelar</UiButton>
    </template>

    <!-- Banner de status atual — filho direto de UiPageLayout para o slot ser registrado -->
    <template #banner>
      <div v-if="currentStatus && !initializing && !loadError" class="status-banner" :data-tone="currentTone">
        <span class="status-banner__label">Status atual:</span>
        <UiStatusBadge :status="currentStatus" with-dot />
        <span v-if="originalData" class="status-banner__meta">
          {{ originalData.contraparte ? 'Cliente: ' + originalData.contraparte : '' }}
          {{ originalData.valor ? ' · ' + fmt.formatCurrency(originalData.valor) : '' }}
        </span>
      </div>
    </template>

    <form v-if="!initializing && !loadError" novalidate @submit.prevent="submit">
      <!-- Seção 1: Identificação -->
      <UiCard title="Identificação da Cobrança" subtitle="Dados principais do recebimento">
        <UiFormSection
          title="Cliente e Valor"
          description="Informe quem deve pagar e o montante a receber."
          :columns="2"
        >
          <UiFormField
            label="Cliente"
            :required="true"
            :error="f.errors.contraparte"
            hint="Nome ou razão social do cliente devedor."
          >
            <template #default="{ id, describedBy }">
              <UiInput
                :id="id"
                :described-by="describedBy"
                :model-value="f.values.contraparte"
                type="text"
                placeholder="Ex.: João da Silva"
                autocomplete="off"
                :error="!!f.errors.contraparte"
                :required="true"
                @update:model-value="f.setField('contraparte', $event)"
              />
            </template>
          </UiFormField>

          <UiFormField
            label="Valor (R$)"
            :required="true"
            :error="f.errors.valor"
            hint="Valor total a receber em reais."
          >
            <template #default="{ id, describedBy }">
              <UiInput
                :id="id"
                :described-by="describedBy"
                :model-value="f.values.valor"
                type="number"
                min="0"
                step="0.01"
                placeholder="Ex.: 2500.00"
                :error="!!f.errors.valor"
                :required="true"
                @update:model-value="f.setField('valor', $event !== '' ? Number($event) : '')"
              />
            </template>
          </UiFormField>
        </UiFormSection>
      </UiCard>

      <!-- Seção 2: Vencimento e Recorrência -->
      <UiCard title="Prazo e Recorrência" subtitle="Data de vencimento e periodicidade do recebimento">
        <UiFormSection
          title="Agendamento"
          description="Configure quando o pagamento deve ocorrer."
          :columns="2"
        >
          <UiFormField
            label="Data de Vencimento"
            :required="true"
            :error="f.errors.data"
            hint="Data limite para o pagamento pelo cliente."
          >
            <template #default="{ id, describedBy }">
              <UiInput
                :id="id"
                :described-by="describedBy"
                :model-value="f.values.data"
                type="date"
                :error="!!f.errors.data"
                :required="true"
                @update:model-value="f.setField('data', $event)"
              />
            </template>
          </UiFormField>

          <UiFormField
            label="Forma de Recebimento"
            :error="f.errors.forma_recebimento"
            hint="Canal ou método de pagamento esperado."
          >
            <template #default="{ id, describedBy }">
              <select
                :id="id"
                :aria-describedby="describedBy"
                :aria-invalid="!!f.errors.forma_recebimento || undefined"
                :value="f.values.forma_recebimento"
                class="ui-input"
                @change="f.setField('forma_recebimento', $event.target.value)"
              >
                <option value="">Não especificado</option>
                <option value="pix">Pix</option>
                <option value="boleto">Boleto Bancário</option>
                <option value="transferencia">Transferência (TED/DOC)</option>
                <option value="cartao">Cartão de Crédito/Débito</option>
                <option value="dinheiro">Dinheiro</option>
                <option value="cheque">Cheque</option>
                <option value="outro">Outro</option>
              </select>
            </template>
          </UiFormField>

          <UiFormField
            label="Categoria"
            :error="f.errors.categoria"
            hint="Classificação do recebimento para relatórios."
          >
            <template #default="{ id, describedBy }">
              <UiInput
                :id="id"
                :described-by="describedBy"
                :model-value="f.values.categoria"
                type="text"
                placeholder="Ex.: Honorários, Mensalidade, Consultoria…"
                :error="!!f.errors.categoria"
                @update:model-value="f.setField('categoria', $event)"
              />
            </template>
          </UiFormField>

          <UiFormField
            label="Recorrente"
            :error="f.errors.recorrente"
            hint="Marque se esta cobrança se repete periodicamente."
          >
            <template #default="{ id, describedBy }">
              <div class="checkbox-row">
                <input
                  :id="id"
                  :aria-describedby="describedBy"
                  type="checkbox"
                  :checked="f.values.recorrente"
                  @change="f.setField('recorrente', $event.target.checked)"
                />
                <label :for="id" class="checkbox-label">Esta conta a receber é recorrente</label>
              </div>
            </template>
          </UiFormField>
        </UiFormSection>
      </UiCard>

      <!-- Seção 3: Status e Detalhes -->
      <UiCard title="Status e Observações" subtitle="Estado atual do recebimento e informações adicionais">
        <UiFormSection
          title="Controle"
          description="Gerencie o ciclo de vida desta conta a receber."
          :columns="2"
        >
          <UiFormField
            label="Status"
            :error="f.errors.status"
            hint="Estado atual no ciclo de recebimento."
          >
            <template #default="{ id, describedBy }">
              <select
                :id="id"
                :aria-describedby="describedBy"
                :aria-invalid="!!f.errors.status || undefined"
                :value="f.values.status"
                class="ui-input"
                @change="f.setField('status', $event.target.value)"
              >
                <option value="">Não definido</option>
                <option value="pendente">Pendente</option>
                <option value="em andamento">Em andamento</option>
                <option value="pago">Pago</option>
                <option value="atrasado">Atrasado</option>
                <option value="cancelado">Cancelado</option>
              </select>
            </template>
          </UiFormField>

          <UiFormField
            label="Descrição"
            :error="f.errors.descricao"
            hint="Notas adicionais, instruções ou referência do serviço prestado."
          >
            <template #default="{ id, describedBy }">
              <UiTextarea
                :id="id"
                :described-by="describedBy"
                :model-value="f.values.descricao"
                :rows="3"
                placeholder="Descreva o serviço, referência da nota fiscal ou observações relevantes…"
                :error="!!f.errors.descricao"
                @update:model-value="f.setField('descricao', $event)"
              />
            </template>
          </UiFormField>
        </UiFormSection>
      </UiCard>

      <!-- Rodapé de ações -->
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
  UiStatusBadge,
  useForm,
  useToast,
  validators,
  format as fmt,
  resolveTone,
  statusLabel,
} from '../ui/index.js';
import { accountsReceivable } from '../api.js';

const props = defineProps({
  id: { type: String, required: true },
});

const router = useRouter();
const toast = useToast();

const initializing = ref(true);
const loadError = ref(null);
const originalData = ref(null);

const currentStatus = computed(() => f.values.status || null);
const currentTone = computed(() => resolveTone(currentStatus.value));

const pageTitle = computed(() => {
  if (initializing.value) return 'Editar Conta a Receber';
  if (!originalData.value) return 'Editar Conta a Receber';
  const name = originalData.value.contraparte;
  return name ? 'Editar — ' + name : 'Editar Conta a Receber';
});

const pageSubtitle = computed(() => {
  if (initializing.value) return 'Carregando dados…';
  if (!originalData.value) return '';
  const parts = [];
  if (originalData.value.status) {
    parts.push(statusLabel(originalData.value.status));
  }
  if (originalData.value.valor != null) {
    parts.push(fmt.formatCurrency(originalData.value.valor));
  }
  if (originalData.value.data) {
    parts.push('Vence em ' + fmt.formatDate(originalData.value.data));
  }
  return parts.join(' · ') || 'Conta a receber';
});

const f = useForm({
  initial: {
    contraparte: '',
    valor: '',
    data: '',
    categoria: '',
    descricao: '',
    recorrente: false,
    forma_recebimento: '',
    status: '',
  },
  rules: {
    contraparte: [validators.required('Informe o nome do cliente')],
    valor: [
      validators.required('Informe o valor a receber'),
      validators.numeric('O valor deve ser um número'),
      validators.min(0, 'O valor não pode ser negativo'),
    ],
    data: [validators.required('Informe a data de vencimento')],
  },
});

async function fetchRecord() {
  initializing.value = true;
  loadError.value = null;
  try {
    const data = await accountsReceivable.get(props.id);
    originalData.value = data;

    f.values.contraparte = data.contraparte || '';
    f.values.valor = data.valor != null ? data.valor : '';
    f.values.data = data.data
      ? (data.data.length > 10 ? data.data.slice(0, 10) : data.data)
      : '';
    f.values.categoria = data.categoria || '';
    f.values.descricao = data.descricao || '';
    f.values.recorrente = Boolean(data.recorrente);
    f.values.forma_recebimento = data.forma_recebimento || '';
    f.values.status = data.status || '';
  } catch (err) {
    loadError.value = err.message || 'Erro ao carregar os dados da conta a receber.';
  } finally {
    initializing.value = false;
  }
}

function submit() {
  f.handleSubmit(async (vals) => {
    const payload = {
      contraparte: vals.contraparte,
      valor: vals.valor !== '' ? Number(vals.valor) : undefined,
      data: vals.data || undefined,
      categoria: vals.categoria || undefined,
      descricao: vals.descricao || undefined,
      recorrente: vals.recorrente,
      forma_recebimento: vals.forma_recebimento || undefined,
      status: vals.status || undefined,
    };
    for (const k of Object.keys(payload)) {
      if (payload[k] === undefined) delete payload[k];
    }
    try {
      await accountsReceivable.update(props.id, payload);
      toast.success('Conta a receber atualizada com sucesso.');
      router.push('/accounts-receivable');
    } catch (err) {
      toast.error(err.message || 'Erro ao salvar. Tente novamente.');
    }
  });
}

function cancel() {
  router.push('/accounts-receivable');
}

onMounted(fetchRecord);
</script>

<style scoped>
/* ── Status banner ─────────────────────────────────────────────────────── */
.status-banner {
  display: flex;
  align-items: center;
  gap: var(--ui-space-2);
  padding: var(--ui-space-2) var(--ui-space-4);
  border-radius: var(--ui-radius-md);
  background: rgb(var(--ui-surface-raised));
  border-left: 3px solid rgb(var(--ui-accent));
  flex-wrap: wrap;
}

.status-banner[data-tone="success"] {
  border-left-color: rgb(var(--ui-ok));
  background: rgb(var(--ui-ok) / 0.06);
}

.status-banner[data-tone="warning"] {
  border-left-color: rgb(var(--ui-warn));
  background: rgb(var(--ui-warn) / 0.06);
}

.status-banner[data-tone="error"] {
  border-left-color: rgb(var(--ui-danger));
  background: rgb(var(--ui-danger) / 0.06);
}

.status-banner[data-tone="running"] {
  border-left-color: rgb(var(--ui-accent));
  background: rgb(var(--ui-accent) / 0.06);
}

.status-banner__label {
  font-size: var(--ui-text-sm);
  font-weight: 600;
  color: rgb(var(--ui-muted));
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.status-banner__meta {
  font-size: var(--ui-text-sm);
  color: rgb(var(--ui-muted));
  margin-left: auto;
}

/* ── Select nativo com aparência do kit ────────────────────────────────── */
/* UiSelect não existe no kit — aplicamos a classe ui-input ao <select> nativo. */
/* Como ui-input é scoped no UiInput.vue, replicamos aqui os estilos necessários. */
.ui-input {
  background: rgb(var(--ui-bg));
  color: rgb(var(--ui-fg));
  border: 1px solid rgb(var(--ui-border-strong));
  border-radius: var(--ui-radius-sm);
  padding: 8px 11px;
  font: inherit;
  font-size: var(--ui-text-md);
  width: 100%;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
  appearance: auto;
}

.ui-input:focus {
  outline: none;
  border-color: rgb(var(--ui-accent));
  box-shadow: 0 0 0 3px rgb(var(--ui-accent) / 0.15);
}

.ui-input[aria-invalid="true"] {
  border-color: rgb(var(--ui-danger));
}

.ui-input[aria-invalid="true"]:focus {
  box-shadow: 0 0 0 3px rgb(var(--ui-danger) / 0.15);
}

/* ── Checkbox row ──────────────────────────────────────────────────────── */
.checkbox-row {
  display: flex;
  align-items: center;
  gap: var(--ui-space-2);
  padding: var(--ui-space-2) 0;
}

.checkbox-label {
  font-size: var(--ui-text-sm);
  color: rgb(var(--ui-fg));
  cursor: pointer;
  user-select: none;
}

/* ── Form footer ───────────────────────────────────────────────────────── */
.form-footer {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: var(--ui-space-2);
  padding-top: var(--ui-space-2);
  padding-bottom: var(--ui-space-6);
}

/* ── Responsive ────────────────────────────────────────────────────────── */
@media (max-width: 640px) {
  .form-footer {
    flex-direction: column-reverse;
  }

  .form-footer > * {
    width: 100%;
  }

  .status-banner__meta {
    margin-left: 0;
    width: 100%;
  }
}
</style>
