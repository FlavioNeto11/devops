<template>
  <UiPageLayout
    eyebrow="Tarefas"
    :title="pageTitle"
    :subtitle="pageSubtitle"
    width="narrow"
    :loading="initializing"
    :error="loadError"
    :retryable="true"
    @retry="fetchTask"
  >
    <template #actions>
      <UiButton variant="ghost" to="/tasks">Cancelar</UiButton>
    </template>

    <form v-if="!initializing && !loadError" novalidate @submit.prevent="submit">

      <!-- Seção: Informações Básicas -->
      <UiCard title="Informações da Tarefa" subtitle="Título, descrição e prazo de conclusão">
        <UiFormSection title="Identificação" :columns="2">

          <UiFormField label="Título" :required="true" :error="f.errors.title" :full-width="true">
            <template #default="{ id, describedBy }">
              <UiInput
                :id="id"
                :described-by="describedBy"
                :model-value="f.values.title"
                placeholder="Ex.: Revisar declaração IRPJ…"
                :error="!!f.errors.title"
                :required="true"
                @update:model-value="f.setField('title', $event)"
              />
            </template>
          </UiFormField>

          <UiFormField label="Descrição" :error="f.errors.description" :full-width="true" hint="Contexto, critérios de conclusão ou referências relevantes.">
            <template #default="{ id, describedBy }">
              <UiTextarea
                :id="id"
                :described-by="describedBy"
                :model-value="f.values.description"
                :rows="4"
                placeholder="Descreva o escopo e os critérios de aceitação desta tarefa…"
                :error="!!f.errors.description"
                @update:model-value="f.setField('description', $event)"
              />
            </template>
          </UiFormField>

          <UiFormField label="Prazo" :error="f.errors.due_at" hint="Data e hora limite para conclusão.">
            <template #default="{ id, describedBy }">
              <UiInput
                :id="id"
                :described-by="describedBy"
                :model-value="f.values.due_at"
                type="datetime-local"
                :error="!!f.errors.due_at"
                @update:model-value="f.setField('due_at', $event)"
              />
            </template>
          </UiFormField>

          <UiFormField label="Prioridade" :error="f.errors.priority" hint="Nível de urgência da tarefa.">
            <template #default="{ id, describedBy }">
              <select
                :id="id"
                :aria-describedby="describedBy || undefined"
                :aria-invalid="f.errors.priority ? 'true' : undefined"
                :value="f.values.priority"
                class="ui-input"
                @change="f.setField('priority', $event.target.value)"
              >
                <option value="">Não definida</option>
                <option value="baixa">Baixa</option>
                <option value="media">Média</option>
                <option value="alta">Alta</option>
                <option value="critica">Crítica</option>
              </select>
            </template>
          </UiFormField>

        </UiFormSection>
      </UiCard>

      <!-- Seção: Responsável -->
      <UiCard title="Responsável" subtitle="Pessoa encarregada de executar esta tarefa">
        <UiFormSection :columns="2">

          <UiFormField label="Responsável" :error="f.errors.assignee" hint="Nome ou identificador do responsável pela tarefa.">
            <template #default="{ id, describedBy }">
              <UiInput
                :id="id"
                :described-by="describedBy"
                :model-value="f.values.assignee"
                placeholder="Ex.: João Silva"
                :error="!!f.errors.assignee"
                @update:model-value="f.setField('assignee', $event)"
              />
            </template>
          </UiFormField>

          <UiFormField label="Role do Responsável" :error="f.errors.assignee_role" hint="Perfil de acesso do responsável na plataforma.">
            <template #default="{ id, describedBy }">
              <select
                :id="id"
                :aria-describedby="describedBy || undefined"
                :aria-invalid="f.errors.assignee_role ? 'true' : undefined"
                :value="f.values.assignee_role"
                class="ui-input"
                @change="f.setField('assignee_role', $event.target.value)"
              >
                <option value="">Não definido</option>
                <option value="admin">Admin</option>
                <option value="manager">Gerente</option>
                <option value="member">Membro</option>
              </select>
            </template>
          </UiFormField>

        </UiFormSection>
      </UiCard>

      <!-- Seção: Status — Máquina de estados -->
      <UiCard
        title="Status da Tarefa"
        subtitle="Transições permitidas com base no estado atual"
      >
        <div class="status-section">
          <!-- Badge com status atual -->
          <div class="current-status-row">
            <span class="current-status-label">Status atual</span>
            <UiStatusBadge :status="originalStatus" with-dot />
          </div>

          <!-- Transição de status (somente se houver transições disponíveis) -->
          <UiFormSection v-if="allowedTransitions.length > 0" :columns="1">
            <UiFormField
              label="Nova Transição de Status"
              :error="f.errors.status"
              hint="Selecione o próximo estado permitido para esta tarefa."
            >
              <template #default="{ id, describedBy }">
                <select
                  :id="id"
                  :aria-describedby="describedBy || undefined"
                  :aria-invalid="f.errors.status ? 'true' : undefined"
                  :value="f.values.status"
                  class="ui-input"
                  @change="f.setField('status', $event.target.value)"
                >
                  <option :value="originalStatus">Manter — {{ statusLabel(originalStatus) }}</option>
                  <option
                    v-for="t in allowedTransitions"
                    :key="t.value"
                    :value="t.value"
                  >{{ t.label }}</option>
                </select>
              </template>
            </UiFormField>
          </UiFormSection>

          <!-- Aviso quando não há transições disponíveis (estado terminal) -->
          <UiEmptyState
            v-else
            icon="ban"
            title="Estado terminal"
            description="Nenhuma transição disponível para o status atual."
            :compact="true"
          />
        </div>
      </UiCard>

      <!-- Seção: Entidade Relacionada -->
      <UiCard title="Entidade Relacionada" subtitle="Vínculo com um cliente, documento ou outro objeto do sistema">
        <UiFormSection :columns="2">

          <UiFormField label="Tipo de Entidade" :error="f.errors.entity_type" hint="Tipo do objeto relacionado a esta tarefa (ex.: client, document).">
            <template #default="{ id, describedBy }">
              <UiInput
                :id="id"
                :described-by="describedBy"
                :model-value="f.values.entity_type"
                placeholder="Ex.: client, document, fiscal-obligation"
                :error="!!f.errors.entity_type"
                @update:model-value="f.setField('entity_type', $event)"
              />
            </template>
          </UiFormField>

          <UiFormField label="ID da Entidade" :error="f.errors.entity_id" hint="Identificador interno do objeto relacionado.">
            <template #default="{ id, describedBy }">
              <UiInput
                :id="id"
                :described-by="describedBy"
                :model-value="f.values.entity_id"
                type="number"
                min="1"
                inputmode="numeric"
                placeholder="Ex.: 42"
                :error="!!f.errors.entity_id"
                @update:model-value="f.setField('entity_id', $event !== '' ? Number($event) : '')"
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
  UiButton,
  UiStatusBadge,
  UiEmptyState,
  UiInput,
  UiTextarea,
  useForm,
  useToast,
  validators,
  statusLabel,
  format as fmt,
} from '../ui/index.js';
import { resourceFactory } from '../api.js';

// Recurso garantido pelo integrador via resourceFactory
const tasksApi = resourceFactory('tasks');

const props = defineProps({
  id: { type: String, required: true },
});

const router = useRouter();
const toast = useToast();

// Estado de carregamento inicial
const initializing = ref(true);
const loadError = ref(null);
const originalStatus = ref('');
const originalData = ref(null);

// Título e subtítulo dinâmicos
const pageTitle = computed(() => {
  if (initializing.value) return 'Editar Tarefa';
  if (!originalData.value) return 'Editar Tarefa';
  const title = originalData.value.title || 'Tarefa';
  return 'Editar — ' + (title.length > 60 ? title.slice(0, 57) + '…' : title);
});

const pageSubtitle = computed(() => {
  if (initializing.value) return 'Carregando dados…';
  if (!originalData.value) return '';
  const parts = [];
  if (originalData.value.status) {
    parts.push(statusLabel(originalData.value.status));
  }
  if (originalData.value.priority) {
    const pLabels = { baixa: 'Baixa', media: 'Média', alta: 'Alta', critica: 'Crítica' };
    parts.push('Prioridade: ' + (pLabels[originalData.value.priority] || statusLabel(originalData.value.priority)));
  }
  if (originalData.value.due_at) {
    parts.push('Prazo: ' + fmt.formatDateTime(originalData.value.due_at));
  }
  return parts.join(' · ') || 'Tarefa';
});

// Máquina de estados de tarefas
// Define as transições permitidas por status atual (lógica de domínio local; rótulos via statusLabel do kit)
const STATUS_TRANSITIONS = {
  pendente:      [{ value: 'em_andamento', label: 'Iniciar → Em andamento' }, { value: 'cancelada', label: 'Cancelar tarefa' }],
  em_andamento:  [{ value: 'concluida', label: 'Concluir → Concluída' }, { value: 'pendente', label: 'Pausar → Pendente' }, { value: 'cancelada', label: 'Cancelar tarefa' }],
  concluida:     [],
  cancelada:     [{ value: 'pendente', label: 'Reabrir → Pendente' }],
  // fallback: mesmos rótulos se o backend usa outros valores
  pending:       [{ value: 'in_progress', label: 'Iniciar → Em andamento' }, { value: 'cancelled', label: 'Cancelar tarefa' }],
  in_progress:   [{ value: 'done', label: 'Concluir → Concluída' }, { value: 'pending', label: 'Pausar → Pendente' }, { value: 'cancelled', label: 'Cancelar tarefa' }],
  done:          [],
  cancelled:     [{ value: 'pending', label: 'Reabrir → Pendente' }],
};

const allowedTransitions = computed(() => {
  const current = originalStatus.value ? String(originalStatus.value).toLowerCase().trim() : '';
  return STATUS_TRANSITIONS[current] || [];
});

// Formulário com validação
const f = useForm({
  initial: {
    title: '',
    description: '',
    assignee: '',
    assignee_role: '',
    due_at: '',
    priority: '',
    status: '',
    entity_type: '',
    entity_id: '',
  },
  rules: {
    title: [validators.required('O título da tarefa é obrigatório'), validators.minLen(3, 'O título deve ter ao menos 3 caracteres')],
    entity_id: [validators.min(1, 'O ID da entidade deve ser um número positivo')],
    priority: [validators.pattern(/^$|^(baixa|media|alta|critica)$/, 'Prioridade inválida')],
    assignee_role: [validators.pattern(/^$|^(admin|manager|member)$/, 'Role inválido')],
  },
});

// Injeta erro de campo no formulário (useForm não expõe setError; acesso direto ao reactive)
function setFormError(key, msg) {
  f.errors[key] = msg;
}

// Busca os dados da tarefa no backend
async function fetchTask() {
  initializing.value = true;
  loadError.value = null;
  try {
    const data = await tasksApi.get(props.id);
    originalData.value = data;
    originalStatus.value = data.status || '';

    // Pré-popula o formulário
    f.values.title        = data.title        || '';
    f.values.description  = data.description  || '';
    f.values.assignee     = data.assignee     || '';
    f.values.assignee_role = data.assignee_role || '';
    f.values.due_at       = data.due_at
      ? (data.due_at.length > 16 ? data.due_at.slice(0, 16) : data.due_at)
      : '';
    f.values.priority     = data.priority     || '';
    f.values.status       = data.status       || '';
    f.values.entity_type  = data.entity_type  || '';
    f.values.entity_id    = data.entity_id != null ? data.entity_id : '';
  } catch (err) {
    loadError.value = err.message || 'Erro ao carregar a tarefa.';
  } finally {
    initializing.value = false;
  }
}

// Submete as alterações via PATCH /v1/tasks/:id (atualização parcial + máquina de estados)
function submit() {
  f.handleSubmit(async (vals) => {
    // Monta payload sem campos vazios/indefinidos
    const payload = {};
    if (vals.title)        payload.title        = vals.title;
    if (vals.description !== undefined) payload.description = vals.description || null;
    if (vals.assignee)     payload.assignee     = vals.assignee;
    if (vals.assignee_role) payload.assignee_role = vals.assignee_role;
    if (vals.due_at)       payload.due_at       = vals.due_at;
    if (vals.priority)     payload.priority     = vals.priority;
    if (vals.entity_type)  payload.entity_type  = vals.entity_type;
    if (vals.entity_id !== '') payload.entity_id = Number(vals.entity_id);

    // Status: inclui somente se houve mudança
    const statusChanged = vals.status && vals.status !== originalStatus.value;
    if (statusChanged) payload.status = vals.status;

    try {
      // PATCH /v1/tasks/:id — atualização parcial com validação de transição de estado no backend
      await tasksApi.patch(props.id, payload);
      toast.success('Tarefa atualizada com sucesso.');
      router.push('/tasks');
    } catch (err) {
      const msg = err.message || 'Erro ao salvar. Tente novamente.';
      const isStatusError = msg.toLowerCase().includes('status') || msg.toLowerCase().includes('transição') || msg.toLowerCase().includes('transition');
      if (isStatusError) {
        // Feedback inline no campo de status + toast
        setFormError('status', 'Transição inválida: ' + msg);
        toast.error('Transição de status inválida: ' + msg);
      } else {
        toast.error(msg);
      }
    }
  });
}

function cancel() {
  router.push('/tasks');
}

onMounted(fetchTask);
</script>

<style scoped>
/* Rodapé do formulário */
.form-footer {
  display: flex;
  justify-content: flex-end;
  gap: var(--ui-space-2);
  padding-top: var(--ui-space-2);
  padding-bottom: var(--ui-space-6);
}

/* Seção de status — container flex para badge + seletor */
.status-section {
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-4);
}

.current-status-row {
  display: flex;
  align-items: center;
  gap: var(--ui-space-3);
  padding: var(--ui-space-3) var(--ui-space-4);
  background: rgb(var(--ui-surface));
  border: 1px solid rgb(var(--ui-border));
  border-radius: var(--ui-radius-md);
}

.current-status-label {
  font-size: var(--ui-text-sm);
  font-weight: 600;
  color: rgb(var(--ui-muted));
  min-width: 8rem;
}

/* Responsivo */
@media (max-width: 640px) {
  .form-footer {
    flex-direction: column-reverse;
  }

  .form-footer > * {
    width: 100%;
  }

  .current-status-row {
    flex-direction: column;
    align-items: flex-start;
    gap: var(--ui-space-2);
  }
}
</style>
