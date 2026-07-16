<template>
  <UiPageLayout
    title="Nova Tarefa"
    eyebrow="Tarefas"
    subtitle="Preencha os dados abaixo para criar uma nova tarefa e atribuí-la a um responsável."
    width="narrow"
  >
    <template #actions>
      <UiButton variant="ghost" to="/tasks">Voltar à lista</UiButton>
    </template>

    <form novalidate @submit.prevent="submit">

      <!-- ── Seção 1: Identificação ──────────────────────────────────── -->
      <UiCard title="Identificação" subtitle="Título e descrição da tarefa.">
        <UiFormSection title="Dados principais" description="Campos obrigatórios marcados com *." :columns="1">

          <UiFormField label="Título" :required="true" :error="f.errors.title" hint="Descreva a tarefa de forma objetiva." :full-width="true">
            <template #default="{ id: fid, describedBy }">
              <UiInput
                :id="fid"
                type="text"
                :described-by="describedBy"
                :error="!!f.errors.title"
                :model-value="f.values.title"
                placeholder="Ex.: Revisar declaração de IRPJ 2024"
                :required="true"
                autocomplete="off"
                @update:model-value="f.setField('title', $event)"
              />
            </template>
          </UiFormField>

          <UiFormField label="Descrição" :error="f.errors.description" hint="Detalhe o escopo, contexto ou instruções da tarefa (opcional)." :full-width="true">
            <template #default="{ id: fid, describedBy }">
              <textarea
                :id="fid"
                :aria-describedby="describedBy"
                :aria-invalid="!!f.errors.description || undefined"
                class="task-textarea"
                :data-error="!!f.errors.description"
                :value="f.values.description"
                placeholder="Contexto, critérios de conclusão, links relevantes…"
                rows="4"
                @input="f.setField('description', $event.target.value)"
              ></textarea>
            </template>
          </UiFormField>

        </UiFormSection>
      </UiCard>

      <!-- ── Seção 2: Responsável e Prazo ──────────────────────────── -->
      <UiCard title="Responsável e Prazo" subtitle="Atribuição e vencimento da tarefa.">
        <UiFormSection title="Atribuição" description="Identifique quem irá executar a tarefa e em que prazo." :columns="2">

          <UiFormField label="Responsável" :error="f.errors.assignee" hint="Nome ou e-mail do responsável pela execução.">
            <template #default="{ id: fid, describedBy }">
              <UiInput
                :id="fid"
                type="text"
                :described-by="describedBy"
                :error="!!f.errors.assignee"
                :model-value="f.values.assignee"
                placeholder="Nome ou e-mail"
                autocomplete="off"
                @update:model-value="f.setField('assignee', $event)"
              />
            </template>
          </UiFormField>

          <UiFormField label="Role do Responsável" :error="f.errors.assignee_role" hint="Perfil de acesso do responsável.">
            <template #default="{ id: fid, describedBy }">
              <select
                :id="fid"
                :aria-describedby="describedBy"
                :aria-invalid="!!f.errors.assignee_role || undefined"
                class="task-select"
                :data-error="!!f.errors.assignee_role"
                :value="f.values.assignee_role"
                @change="f.setField('assignee_role', $event.target.value)"
              >
                <option value="">Selecione um perfil…</option>
                <option value="admin">Administrador</option>
                <option value="manager">Gerente</option>
                <option value="member">Membro</option>
              </select>
            </template>
          </UiFormField>

          <UiFormField label="Prazo" :error="f.errors.due_at" hint="Data e hora limite para conclusão da tarefa.">
            <template #default="{ id: fid, describedBy }">
              <UiInput
                :id="fid"
                type="datetime-local"
                :described-by="describedBy"
                :error="!!f.errors.due_at"
                :model-value="f.values.due_at"
                :min="minDatetime"
                @update:model-value="f.setField('due_at', $event)"
              />
            </template>
          </UiFormField>

          <UiFormField label="Prioridade" :error="f.errors.priority" hint="Nível de urgência da tarefa.">
            <template #default="{ id: fid, describedBy }">
              <select
                :id="fid"
                :aria-describedby="describedBy"
                :aria-invalid="!!f.errors.priority || undefined"
                class="task-select"
                :data-error="!!f.errors.priority"
                :value="f.values.priority"
                @change="f.setField('priority', $event.target.value)"
              >
                <option value="">Selecione a prioridade…</option>
                <option value="baixa">Baixa</option>
                <option value="media">Média</option>
                <option value="alta">Alta</option>
                <option value="critica">Crítica</option>
              </select>
            </template>
          </UiFormField>

        </UiFormSection>

        <!-- Indicador visual de prioridade selecionada -->
        <div v-if="f.values.priority" class="priority-badge-wrap" aria-live="polite">
          <span class="priority-indicator" :data-priority="f.values.priority" aria-label="Prioridade selecionada">
            <span class="priority-dot" aria-hidden="true"></span>
            {{ priorityLabel(f.values.priority) }}
          </span>
        </div>
      </UiCard>

      <!-- ── Seção 3: Entidade Relacionada ─────────────────────────── -->
      <UiCard title="Entidade Relacionada" subtitle="Associe a tarefa a uma Pessoa Física ou Jurídica (opcional).">
        <UiFormSection title="Vínculo de Entidade" description="Selecione o tipo e informe o ID da entidade para criar o vínculo." :columns="2">

          <UiFormField label="Tipo de Entidade" hint="Pessoa Física (PF) ou Pessoa Jurídica (PJ).">
            <template #default="{ id: fid, describedBy }">
              <select
                :id="fid"
                :aria-describedby="describedBy"
                class="task-select"
                :value="f.values.entity_type"
                @change="onEntityTypeChange($event.target.value)"
              >
                <option value="">Sem vínculo</option>
                <option value="pf">Pessoa Física (PF)</option>
                <option value="pj">Pessoa Jurídica (PJ)</option>
              </select>
            </template>
          </UiFormField>

          <UiFormField
            label="ID da Entidade"
            :error="f.errors.entity_id"
            :hint="entityIdHint"
          >
            <template #default="{ id: fid, describedBy }">
              <div class="entity-search-wrap">
                <UiInput
                  :id="fid"
                  type="number"
                  inputmode="numeric"
                  :described-by="describedBy"
                  :error="!!f.errors.entity_id"
                  :model-value="f.values.entity_id"
                  :disabled="!f.values.entity_type"
                  placeholder="ID numérico…"
                  :min="1"
                  @update:model-value="onEntityIdInput($event)"
                />
                <button
                  v-if="f.values.entity_type && f.values.entity_id"
                  type="button"
                  class="entity-search-btn"
                  :disabled="entitySearching"
                  :aria-label="`Verificar entidade ${(f.values.entity_type || '').toUpperCase()} ${f.values.entity_id}`"
                  @click="verifyEntity"
                >
                  <span v-if="entitySearching" class="entity-search-spinner" aria-hidden="true"></span>
                  <span v-else aria-hidden="true">✓</span>
                </button>
              </div>
            </template>
          </UiFormField>

        </UiFormSection>

        <!-- Resultado da busca inline -->
        <div
          v-if="entityResult"
          class="entity-result"
          :data-tone="entityResult.tone"
          role="status"
          aria-live="polite"
        >
          <span class="entity-result-icon" aria-hidden="true">{{ entityResult.icon }}</span>
          <span class="entity-result-text">{{ entityResult.text }}</span>
          <button
            v-if="entityResult.ok"
            type="button"
            class="entity-result-clear"
            aria-label="Limpar entidade selecionada"
            @click="clearEntity"
          >
            ×
          </button>
        </div>
      </UiCard>

      <!-- ── Seção 4: Obrigação Fiscal Vinculada ────────────────────── -->
      <UiCard title="Obrigação Fiscal" subtitle="Vincule a tarefa a uma obrigação fiscal existente (opcional).">
        <UiFormSection title="Referência fiscal" description="Informe o ID da obrigação fiscal para criar o rastreamento." :columns="2">

          <UiFormField
            label="ID da Obrigação Fiscal"
            :error="f.errors.fiscal_obligation_id"
            hint="Número da obrigação fiscal a que esta tarefa se refere."
          >
            <template #default="{ id: fid, describedBy }">
              <div class="entity-search-wrap">
                <UiInput
                  :id="fid"
                  type="number"
                  inputmode="numeric"
                  :described-by="describedBy"
                  :error="!!f.errors.fiscal_obligation_id"
                  :model-value="f.values.fiscal_obligation_id"
                  placeholder="Ex.: 42"
                  :min="1"
                  @update:model-value="f.setField('fiscal_obligation_id', $event ? Number($event) : '')"
                />
                <button
                  v-if="f.values.fiscal_obligation_id"
                  type="button"
                  class="entity-search-btn"
                  :disabled="obligationSearching"
                  aria-label="Verificar obrigação fiscal"
                  @click="verifyObligation"
                >
                  <span v-if="obligationSearching" class="entity-search-spinner" aria-hidden="true"></span>
                  <span v-else aria-hidden="true">✓</span>
                </button>
              </div>
            </template>
          </UiFormField>

          <!-- Resultado verificação de obrigação -->
          <div
            v-if="obligationResult"
            class="obligation-result"
            :data-tone="obligationResult.tone"
            role="status"
            aria-live="polite"
          >
            <span class="entity-result-icon" aria-hidden="true">{{ obligationResult.icon }}</span>
            <span class="entity-result-text">{{ obligationResult.text }}</span>
            <button
              v-if="obligationResult.ok"
              type="button"
              class="entity-result-clear"
              aria-label="Remover vínculo de obrigação"
              @click="clearObligation"
            >
              ×
            </button>
          </div>

        </UiFormSection>
      </UiCard>

      <!-- ── Rodapé de ações ────────────────────────────────────────── -->
      <div class="form-footer">
        <UiButton variant="ghost" type="button" @click="cancelCreate">Cancelar</UiButton>
        <UiButton
          type="submit"
          variant="primary"
          :loading="f.submitting.value"
          :disabled="f.submitting.value"
        >
          Criar Tarefa
        </UiButton>
      </div>

    </form>
  </UiPageLayout>
</template>

<script setup>
import { ref, computed } from 'vue';
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

// ── Recursos REST ─────────────────────────────────────────────────────────────
const tasks = resourceFactory('tasks');
const pfApi = resourceFactory('pf');
const pjApi = resourceFactory('pj');
const fiscalObligationsApi = resourceFactory('fiscal-obligations');

const router = useRouter();
const toast = useToast();

// ── Prazo mínimo (agora) ───────────────────────────────────────────────────────
const minDatetime = computed(() => {
  const now = new Date();
  // datetime-local requer YYYY-MM-DDTHH:MM
  const pad = (n) => String(n).padStart(2, '0');
  return (
    now.getFullYear() +
    '-' + pad(now.getMonth() + 1) +
    '-' + pad(now.getDate()) +
    'T' + pad(now.getHours()) +
    ':' + pad(now.getMinutes())
  );
});

// ── Formulário ────────────────────────────────────────────────────────────────
const f = useForm({
  initial: {
    title: '',
    description: '',
    assignee: '',
    assignee_role: '',
    due_at: '',
    priority: '',
    entity_type: '',
    entity_id: '',
    fiscal_obligation_id: '',
  },
  rules: {
    title: [validators.required('O título da tarefa é obrigatório'), validators.minLen(3, 'Mínimo de 3 caracteres')],
    due_at: [validators.required('O prazo é obrigatório')],
    priority: [validators.required('Selecione a prioridade')],
    assignee_role: [(v, all) => (all && all.assignee && all.assignee.trim() && !v ? 'Informe o perfil do responsável' : '')],
    entity_id: [validators.numeric('ID deve ser numérico'), validators.min(1, 'ID deve ser maior que zero')],
    fiscal_obligation_id: [validators.numeric('ID deve ser numérico'), validators.min(1, 'ID deve ser maior que zero')],
  },
});

// ── Rótulos de prioridade ─────────────────────────────────────────────────────
function priorityLabel(value) {
  const map = { baixa: 'Baixa', media: 'Média', alta: 'Alta', critica: 'Crítica' };
  return map[value] || value;
}

// ── Entidade relacionada ──────────────────────────────────────────────────────
const entitySearching = ref(false);
const entityResult = ref(null);

const entityIdHint = computed(() => {
  if (!f.values.entity_type) return 'Selecione o tipo de entidade primeiro.';
  return `ID numérico da ${f.values.entity_type === 'pf' ? 'Pessoa Física' : 'Pessoa Jurídica'}.`;
});

function onEntityTypeChange(value) {
  f.setField('entity_type', value);
  f.setField('entity_id', '');
  entityResult.value = null;
}

function onEntityIdInput(value) {
  f.setField('entity_id', value ? Number(value) : '');
  entityResult.value = null;
}

async function verifyEntity() {
  if (!f.values.entity_type || !f.values.entity_id) return;
  entitySearching.value = true;
  entityResult.value = null;
  try {
    const api = f.values.entity_type === 'pf' ? pfApi : pjApi;
    const data = await api.get(f.values.entity_id);
    const label = data.nome || data.razao_social || data.name || ('ID ' + f.values.entity_id);
    entityResult.value = {
      ok: true,
      tone: 'success',
      icon: '✓',
      text: `${f.values.entity_type === 'pf' ? 'Pessoa Física' : 'Pessoa Jurídica'} encontrada: ${label}`,
    };
  } catch (e) {
    const is404 = e && e.status === 404;
    entityResult.value = {
      ok: false,
      tone: 'danger',
      icon: '✕',
      text: is404
        ? `Nenhuma entidade ${(f.values.entity_type || '').toUpperCase()} encontrada com ID ${f.values.entity_id}.`
        : (e.message || 'Erro ao verificar entidade.'),
    };
  } finally {
    entitySearching.value = false;
  }
}

function clearEntity() {
  f.setField('entity_type', '');
  f.setField('entity_id', '');
  entityResult.value = null;
}

// ── Obrigação Fiscal ──────────────────────────────────────────────────────────
const obligationSearching = ref(false);
const obligationResult = ref(null);

async function verifyObligation() {
  if (!f.values.fiscal_obligation_id) return;
  obligationSearching.value = true;
  obligationResult.value = null;
  try {
    const data = await fiscalObligationsApi.get(f.values.fiscal_obligation_id);
    const label = data.descricao || data.titulo || data.name || ('ID ' + f.values.fiscal_obligation_id);
    obligationResult.value = {
      ok: true,
      tone: 'success',
      icon: '✓',
      text: `Obrigação encontrada: ${label}`,
    };
  } catch (e) {
    const is404 = e && e.status === 404;
    obligationResult.value = {
      ok: false,
      tone: 'danger',
      icon: '✕',
      text: is404
        ? `Nenhuma obrigação fiscal com ID ${f.values.fiscal_obligation_id}.`
        : (e.message || 'Erro ao verificar obrigação fiscal.'),
    };
  } finally {
    obligationSearching.value = false;
  }
}

function clearObligation() {
  f.setField('fiscal_obligation_id', '');
  obligationResult.value = null;
}

// ── Submissão ─────────────────────────────────────────────────────────────────
async function submit() {
  await f.handleSubmit(async (vals) => {
    const payload = {
      title: vals.title.trim(),
    };

    if (vals.description && vals.description.trim()) payload.description = vals.description.trim();
    if (vals.assignee && vals.assignee.trim()) payload.assignee = vals.assignee.trim();
    if (vals.assignee_role) payload.assignee_role = vals.assignee_role;
    if (vals.due_at) payload.due_at = vals.due_at;
    if (vals.priority) payload.priority = vals.priority;
    if (vals.entity_type) payload.entity_type = vals.entity_type;
    if (vals.entity_id) payload.entity_id = Number(vals.entity_id);
    if (vals.fiscal_obligation_id) payload.fiscal_obligation_id = Number(vals.fiscal_obligation_id);

    try {
      const created = await tasks.create(payload);

      // Dispara notificação de atribuição quando há responsável
      if (vals.assignee && vals.assignee.trim()) {
        toast.info(`Notificação de atribuição enviada para "${vals.assignee.trim()}".`);
      }

      toast.success('Tarefa criada com sucesso.');

      const id = created && (created.id || (created.data && created.data.id));
      if (id) {
        router.push('/tasks/' + id);
      } else {
        router.push('/tasks');
      }
    } catch (e) {
      toast.error(e.message || 'Erro ao criar a tarefa. Tente novamente.');
    }
  });
}

function cancelCreate() {
  router.push('/tasks');
}
</script>

<style scoped>
/* ── Select nativo com tokens --ui-* ─────────────────────────────────────── */
.task-select {
  background: rgb(var(--ui-bg));
  color: rgb(var(--ui-fg));
  border: 1px solid rgb(var(--ui-border-strong));
  border-radius: var(--ui-radius-sm);
  padding: var(--ui-space-2) var(--ui-space-3);
  font: inherit;
  font-size: var(--ui-text-md);
  width: 100%;
  cursor: pointer;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
  appearance: auto;
}

.task-select:focus {
  outline: none;
  border-color: rgb(var(--ui-accent));
  box-shadow: 0 0 0 3px rgb(var(--ui-accent) / 0.15);
}

.task-select[data-error="true"] {
  border-color: rgb(var(--ui-danger));
}

.task-select[data-error="true"]:focus {
  box-shadow: 0 0 0 3px rgb(var(--ui-danger) / 0.15);
}

.task-select:disabled {
  opacity: 0.55;
  cursor: not-allowed;
  background: rgb(var(--ui-surface-2));
}

/* ── Textarea com tokens --ui-* ──────────────────────────────────────────── */
.task-textarea {
  background: rgb(var(--ui-bg));
  color: rgb(var(--ui-fg));
  border: 1px solid rgb(var(--ui-border-strong));
  border-radius: var(--ui-radius-sm);
  padding: var(--ui-space-2) var(--ui-space-3);
  font: inherit;
  font-size: var(--ui-text-md);
  width: 100%;
  min-height: 100px;
  resize: vertical;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}

.task-textarea:focus {
  outline: none;
  border-color: rgb(var(--ui-accent));
  box-shadow: 0 0 0 3px rgb(var(--ui-accent) / 0.15);
}

.task-textarea[data-error="true"] {
  border-color: rgb(var(--ui-danger));
}

.task-textarea[data-error="true"]:focus {
  box-shadow: 0 0 0 3px rgb(var(--ui-danger) / 0.15);
}

.task-textarea::placeholder {
  color: rgb(var(--ui-faint));
}

/* ── Indicador visual de prioridade ─────────────────────────────────────── */
.priority-badge-wrap {
  margin-top: var(--ui-space-1);
  padding: 0 var(--ui-space-1);
}

.priority-indicator {
  display: inline-flex;
  align-items: center;
  gap: var(--ui-space-2);
  font-size: var(--ui-text-sm);
  font-weight: 600;
  padding: var(--ui-space-1) var(--ui-space-3);
  border-radius: var(--ui-radius-full, 9999px);
  border: 1px solid transparent;
}

.priority-dot {
  width: var(--ui-space-2);
  height: var(--ui-space-2);
  border-radius: 50%;
  flex-shrink: 0;
}

.priority-indicator[data-priority="baixa"] {
  background: rgb(var(--ui-success, 34 197 94) / 0.1);
  color: rgb(var(--ui-success, 34 197 94));
  border-color: rgb(var(--ui-success, 34 197 94) / 0.25);
}

.priority-indicator[data-priority="baixa"] .priority-dot {
  background: rgb(var(--ui-success, 34 197 94));
}

.priority-indicator[data-priority="media"] {
  background: rgb(var(--ui-accent) / 0.1);
  color: rgb(var(--ui-accent));
  border-color: rgb(var(--ui-accent) / 0.25);
}

.priority-indicator[data-priority="media"] .priority-dot {
  background: rgb(var(--ui-accent));
}

.priority-indicator[data-priority="alta"] {
  background: rgb(var(--ui-warning, 234 179 8) / 0.12);
  color: rgb(var(--ui-warning, 234 179 8));
  border-color: rgb(var(--ui-warning, 234 179 8) / 0.3);
}

.priority-indicator[data-priority="alta"] .priority-dot {
  background: rgb(var(--ui-warning, 234 179 8));
}

.priority-indicator[data-priority="critica"] {
  background: rgb(var(--ui-danger) / 0.1);
  color: rgb(var(--ui-danger));
  border-color: rgb(var(--ui-danger) / 0.25);
}

.priority-indicator[data-priority="critica"] .priority-dot {
  background: rgb(var(--ui-danger));
}

/* ── Busca inline de entidade ────────────────────────────────────────────── */
.entity-search-wrap {
  display: flex;
  align-items: center;
  gap: var(--ui-space-2);
}

.entity-search-btn {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: calc(var(--ui-space-6) + var(--ui-space-1));
  height: calc(var(--ui-space-6) + var(--ui-space-1));
  border: 1px solid rgb(var(--ui-accent));
  border-radius: var(--ui-radius-sm);
  background: rgb(var(--ui-accent) / 0.08);
  color: rgb(var(--ui-accent));
  font-size: var(--ui-text-md);
  cursor: pointer;
  transition: background 0.15s ease, color 0.15s ease;
}

.entity-search-btn:hover {
  background: rgb(var(--ui-accent) / 0.18);
}

.entity-search-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.entity-search-spinner {
  display: inline-block;
  width: calc(var(--ui-space-3) + var(--ui-space-1) / 2);
  height: calc(var(--ui-space-3) + var(--ui-space-1) / 2);
  border: calc(var(--ui-space-1) / 2) solid rgb(var(--ui-accent) / 0.3);
  border-top-color: rgb(var(--ui-accent));
  border-radius: 50%;
  animation: spin 0.7s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

/* ── Resultado da busca de entidade ─────────────────────────────────────── */
.entity-result,
.obligation-result {
  display: flex;
  align-items: center;
  gap: var(--ui-space-2);
  padding: var(--ui-space-3) var(--ui-space-4);
  border-radius: var(--ui-radius-md);
  font-size: var(--ui-text-sm);
  border: 1px solid;
  margin-top: var(--ui-space-2);
}

.entity-result[data-tone="success"],
.obligation-result[data-tone="success"] {
  background: rgb(var(--ui-success, 34 197 94) / 0.08);
  border-color: rgb(var(--ui-success, 34 197 94) / 0.3);
  color: rgb(var(--ui-fg));
}

.entity-result[data-tone="danger"],
.obligation-result[data-tone="danger"] {
  background: rgb(var(--ui-danger) / 0.08);
  border-color: rgb(var(--ui-danger) / 0.3);
  color: rgb(var(--ui-fg));
}

.entity-result-icon {
  font-size: var(--ui-text-md);
  flex-shrink: 0;
}

.entity-result-text {
  flex: 1;
}

.entity-result-clear {
  border: none;
  background: none;
  color: rgb(var(--ui-muted));
  cursor: pointer;
  font-size: var(--ui-text-md);
  line-height: 1;
  padding: 0 var(--ui-space-1);
  flex-shrink: 0;
}

.entity-result-clear:hover {
  color: rgb(var(--ui-fg));
}

/* ── Rodapé de ações ─────────────────────────────────────────────────────── */
.form-footer {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: var(--ui-space-2);
  padding-top: var(--ui-space-2);
}

/* ── Responsivo ──────────────────────────────────────────────────────────── */
@media (max-width: 640px) {
  .form-footer {
    flex-direction: column-reverse;
  }

  .entity-search-wrap {
    flex-direction: column;
    align-items: stretch;
  }

  .entity-search-btn {
    width: 100%;
    height: calc(var(--ui-space-6) + var(--ui-space-1));
  }
}
</style>
