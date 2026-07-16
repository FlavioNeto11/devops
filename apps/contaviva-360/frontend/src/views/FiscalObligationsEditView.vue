<template>
  <UiPageLayout
    eyebrow="Obrigações Fiscais"
    :title="pageTitle"
    :subtitle="pageSubtitle"
    width="default"
    :loading="initializing"
    :error="loadError"
    :retryable="true"
    @retry="fetchObligation"
  >
    <template #actions>
      <UiButton variant="ghost" :to="backRoute">Cancelar</UiButton>
    </template>

    <form v-if="!initializing && !loadError" novalidate @submit.prevent="submit">
      <!-- Seção: Identificação da Obrigação -->
      <UiCard title="Identificação" subtitle="Tipo e periodicidade da obrigação fiscal">
        <UiFormSection title="Classificação Fiscal" description="Campos obrigatórios definem o enquadramento tributário." :columns="2">
          <UiFormField label="Tipo de Obrigação" :required="true" :error="f.errors.tipo">
            <template #default="{ id, describedBy }">
              <select
                :id="id"
                :aria-describedby="describedBy"
                :value="f.values.tipo"
                @change="f.setField('tipo', $event.target.value)"
              >
                <option value="">Selecione o tipo…</option>
                <option v-for="opt in tipoOptions" :key="opt" :value="opt">{{ opt }}</option>
              </select>
            </template>
          </UiFormField>

          <UiFormField label="Periodicidade" :error="f.errors.periodicidade" hint="Com que frequência esta obrigação se repete.">
            <template #default="{ id, describedBy }">
              <select
                :id="id"
                :aria-describedby="describedBy"
                :value="f.values.periodicidade"
                @change="f.setField('periodicidade', $event.target.value)"
              >
                <option value="">Não definida</option>
                <option value="mensal">Mensal</option>
                <option value="trimestral">Trimestral</option>
                <option value="anual">Anual</option>
              </select>
            </template>
          </UiFormField>

          <UiFormField label="Data de Vencimento" :required="true" :error="f.errors.data_vencimento" hint="Data limite para cumprimento da obrigação.">
            <template #default="{ id, describedBy }">
              <input
                :id="id"
                :aria-describedby="describedBy"
                :value="f.values.data_vencimento"
                type="date"
                @input="f.setField('data_vencimento', $event.target.value)"
              />
            </template>
          </UiFormField>

          <UiFormField label="Status" :error="f.errors.status" hint="Estado atual da obrigação no ciclo fiscal.">
            <template #default="{ id, describedBy }">
              <select
                :id="id"
                :aria-describedby="describedBy"
                :value="f.values.status"
                @change="f.setField('status', $event.target.value)"
              >
                <option value="">Não definido</option>
                <option value="pendente">Pendente</option>
                <option value="em andamento">Em andamento</option>
                <option value="concluído">Concluído</option>
                <option value="atrasado">Atrasado</option>
                <option value="cancelado">Cancelado</option>
              </select>
            </template>
          </UiFormField>
        </UiFormSection>
      </UiCard>

      <!-- Seção: Entidade Vinculada -->
      <UiCard title="Entidade Vinculada" subtitle="Pessoa física ou jurídica à qual esta obrigação está associada">
        <UiFormSection :columns="2">
          <UiFormField label="Tipo de Entidade" :required="true" :error="f.errors.entidade_tipo" hint="PF para pessoa física; PJ para pessoa jurídica.">
            <template #default="{ id, describedBy }">
              <select
                :id="id"
                :aria-describedby="describedBy"
                :value="f.values.entidade_tipo"
                @change="f.setField('entidade_tipo', $event.target.value)"
              >
                <option value="">Selecione…</option>
                <option value="PF">Pessoa Física (PF)</option>
                <option value="PJ">Pessoa Jurídica (PJ)</option>
              </select>
            </template>
          </UiFormField>

          <UiFormField label="ID da Entidade" :error="f.errors.entidade_id" hint="Identificador interno do cliente na plataforma.">
            <template #default="{ id, describedBy }">
              <input
                :id="id"
                :aria-describedby="describedBy"
                :value="f.values.entidade_id"
                type="number"
                min="1"
                placeholder="Ex.: 42"
                @input="f.setField('entidade_id', $event.target.value ? Number($event.target.value) : '')"
              />
            </template>
          </UiFormField>
        </UiFormSection>
      </UiCard>

      <!-- Seção: Detalhes Financeiros -->
      <UiCard title="Detalhes Financeiros" subtitle="Valor estimado e descrição complementar da obrigação">
        <UiFormSection :columns="2">
          <UiFormField label="Valor Estimado (R$)" :error="f.errors.valor_estimado" hint="Valor aproximado do tributo. Pode ser atualizado após apuração.">
            <template #default="{ id, describedBy }">
              <input
                :id="id"
                :aria-describedby="describedBy"
                :value="f.values.valor_estimado"
                type="number"
                min="0"
                step="0.01"
                placeholder="Ex.: 1500.00"
                @input="f.setField('valor_estimado', $event.target.value ? Number($event.target.value) : '')"
              />
            </template>
          </UiFormField>

          <UiFormField label="Descrição" :error="f.errors.descricao" :full-width="true" hint="Observações, referências legais ou instruções de preenchimento.">
            <template #default="{ id, describedBy }">
              <textarea
                :id="id"
                :aria-describedby="describedBy"
                :value="f.values.descricao"
                placeholder="Descreva os detalhes relevantes para esta obrigação…"
                rows="4"
                @input="f.setField('descricao', $event.target.value)"
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

    <!-- Histórico de Alertas -->
    <template v-if="!initializing && !loadError && alertHistory.length > 0">
      <div class="alert-history-section">
        <UiCard title="Histórico de Alertas" subtitle="Notificações enviadas para esta obrigação fiscal">
          <UiDataTable
            :columns="alertColumns"
            :rows="alertHistory"
            row-key="id"
            density="compact"
            :empty="{ title: 'Nenhum alerta registrado', description: 'Alertas enviados aparecerão aqui.' }"
          >
            <template #cell-canal="{ value }">
              <span class="canal-badge" :data-canal="value">{{ value || '—' }}</span>
            </template>
            <template #cell-status_envio="{ value }">
              <UiStatusBadge :status="value" with-dot />
            </template>
            <template #cell-enviado_em="{ value }">
              <span class="date-cell">{{ fmt.formatDateTime(value) }}</span>
            </template>
          </UiDataTable>
        </UiCard>
      </div>
    </template>

    <!-- Estado vazio do histórico (quando há dados carregados mas não há alertas) -->
    <template v-if="!initializing && !loadError && alertHistory.length === 0 && !isFirstLoad">
      <div class="alert-history-section">
        <UiCard title="Histórico de Alertas" subtitle="Notificações enviadas para esta obrigação fiscal">
          <UiEmptyState
            title="Nenhum alerta enviado"
            description="Quando alertas forem disparados para esta obrigação, o histórico aparecerá aqui."
            icon="🔔"
          />
        </UiCard>
      </div>
    </template>
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
  UiDataTable,
  UiStatusBadge,
  UiEmptyState,
  useForm,
  useToast,
  validators,
  format as fmt,
} from '../ui/index.js';
import { resourceFactory } from '../api.js';

// Recurso garantido pelo integrador
const fiscalObligations = resourceFactory('fiscal-obligations');

const props = defineProps({
  id: { type: String, required: true },
});

const router = useRouter();
const toast = useToast();

const initializing = ref(true);
const loadError = ref(null);
const alertHistory = ref([]);
const isFirstLoad = ref(true);
const originalData = ref(null);

const backRoute = computed(() => '/fiscal-obligations');

const pageTitle = computed(() => {
  if (initializing.value) return 'Editar Obrigação Fiscal';
  if (!originalData.value) return 'Editar Obrigação Fiscal';
  return 'Editar — ' + originalData.value.tipo;
});

const pageSubtitle = computed(() => {
  if (initializing.value) return 'Carregando dados…';
  if (!originalData.value) return '';
  const venc = originalData.value.data_vencimento ? fmt.formatDate(originalData.value.data_vencimento) : null;
  const status = originalData.value.status ? originalData.value.status : null;
  const parts = [];
  if (status) parts.push(status.charAt(0).toUpperCase() + status.slice(1));
  if (venc) parts.push('Vence em ' + venc);
  return parts.join(' · ') || 'Obrigação fiscal';
});

const tipoOptions = [
  'IRPF', 'IRPJ', 'ICMS', 'ISS', 'DARF', 'ECF', 'ECD',
  'e-Social', 'CAGED', 'Simples DAS', 'PER', 'DIRF', 'RRA', 'outro',
];

const alertColumns = [
  { key: 'enviado_em', label: 'Enviado em', sortable: false },
  { key: 'canal', label: 'Canal', sortable: false },
  { key: 'mensagem', label: 'Mensagem', sortable: false },
  { key: 'status_envio', label: 'Status', sortable: false },
];

const f = useForm({
  initial: {
    tipo: '',
    data_vencimento: '',
    periodicidade: '',
    entidade_tipo: '',
    entidade_id: '',
    status: '',
    descricao: '',
    valor_estimado: '',
  },
  rules: {
    tipo: [validators.required('Selecione o tipo de obrigação')],
    data_vencimento: [validators.required('Informe a data de vencimento')],
    entidade_tipo: [validators.required('Selecione o tipo de entidade')],
  },
});

async function fetchObligation() {
  initializing.value = true;
  loadError.value = null;
  try {
    const data = await fiscalObligations.get(props.id);
    originalData.value = data;

    // Preenche o formulário com os dados retornados
    f.values.tipo = data.tipo || '';
    f.values.data_vencimento = data.data_vencimento
      ? (data.data_vencimento.length > 10 ? data.data_vencimento.slice(0, 10) : data.data_vencimento)
      : '';
    f.values.periodicidade = data.periodicidade || '';
    f.values.entidade_tipo = data.entidade_tipo || '';
    f.values.entidade_id = data.entidade_id != null ? data.entidade_id : '';
    f.values.status = data.status || '';
    f.values.descricao = data.descricao || '';
    f.values.valor_estimado = data.valor_estimado != null ? data.valor_estimado : '';

    // Histórico de alertas retornado pelo endpoint de detalhe
    alertHistory.value = Array.isArray(data.historico_alertas) ? data.historico_alertas : [];
    isFirstLoad.value = false;
  } catch (err) {
    loadError.value = err.message || 'Erro ao carregar os dados da obrigação fiscal.';
  } finally {
    initializing.value = false;
  }
}

function submit() {
  f.handleSubmit(async (vals) => {
    const payload = {
      tipo: vals.tipo,
      data_vencimento: vals.data_vencimento,
      periodicidade: vals.periodicidade || undefined,
      entidade_tipo: vals.entidade_tipo,
      entidade_id: vals.entidade_id !== '' ? Number(vals.entidade_id) : undefined,
      status: vals.status || undefined,
      descricao: vals.descricao || undefined,
      valor_estimado: vals.valor_estimado !== '' ? Number(vals.valor_estimado) : undefined,
    };
    // Remove undefined keys
    for (const k of Object.keys(payload)) {
      if (payload[k] === undefined) delete payload[k];
    }
    try {
      await fiscalObligations.update(props.id, payload);
      toast.success('Obrigação fiscal atualizada com sucesso.');
      router.push('/fiscal-obligations');
    } catch (err) {
      toast.error(err.message || 'Erro ao salvar. Tente novamente.');
    }
  });
}

function cancel() {
  router.push('/fiscal-obligations');
}

onMounted(fetchObligation);
</script>

<style scoped>
.form-footer {
  display: flex;
  justify-content: flex-end;
  gap: var(--ui-space-2);
  padding-top: var(--ui-space-2);
  padding-bottom: var(--ui-space-6);
}

.alert-history-section {
  margin-top: var(--ui-space-2);
}

.date-cell {
  color: rgb(var(--ui-muted));
  font-size: var(--ui-text-sm);
  white-space: nowrap;
}

.canal-badge {
  display: inline-block;
  font-size: var(--ui-text-xs);
  font-weight: 600;
  padding: 2px 8px;
  border-radius: var(--ui-radius-pill);
  background: rgb(var(--ui-accent) / 0.12);
  color: rgb(var(--ui-accent-strong));
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.canal-badge[data-canal="email"] {
  background: rgb(var(--ui-accent) / 0.12);
  color: rgb(var(--ui-accent-strong));
}

.canal-badge[data-canal="sms"] {
  background: rgb(var(--ui-ok) / 0.14);
  color: rgb(var(--ui-ok));
}

.canal-badge[data-canal="push"] {
  background: rgb(var(--ui-warn) / 0.14);
  color: rgb(var(--ui-warn));
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
