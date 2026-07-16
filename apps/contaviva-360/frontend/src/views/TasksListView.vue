<template>
  <UiPageLayout
    title="Tarefas"
    eyebrow="Gestão Operacional"
    subtitle="Acompanhe e gerencie as tarefas da equipe por status, prioridade e responsável."
    width="full"
    :error="r.error.value ? (r.error.value.message || 'Erro ao carregar tarefas') : null"
    @retry="r.load"
  >
    <!-- ── ações ─────────────────────────────────────────────────────────── -->
    <template #actions>
      <div class="view-toggle" role="group" aria-label="Modo de visualização">
        <button
          class="toggle-btn"
          :data-active="viewMode === 'kanban'"
          :aria-pressed="viewMode === 'kanban'"
          type="button"
          @click="viewMode = 'kanban'"
        >
          <span aria-hidden="true">⊞</span> Kanban
        </button>
        <button
          class="toggle-btn"
          :data-active="viewMode === 'list'"
          :aria-pressed="viewMode === 'list'"
          type="button"
          @click="viewMode = 'list'"
        >
          <span aria-hidden="true">☰</span> Lista
        </button>
      </div>
      <UiButton variant="primary" @click="openNewTask">Nova Tarefa</UiButton>
    </template>

    <!-- ── filtros ───────────────────────────────────────────────────────── -->
    <template #filters>
      <UiFiltersPanel
        v-model="filters"
        :fields="filterFields"
        @apply="applyFilters"
        @clear="clearFilters"
      />
    </template>

    <!-- ── loading skeleton ───────────────────────────────────────────────── -->
    <template v-if="r.loading.value">
      <div class="kanban-skeleton">
        <div v-for="col in COLUMNS" :key="col.status" class="kanban-col-skeleton">
          <div class="sk-col-head" />
          <div v-for="n in 3" :key="n" class="sk-card" />
        </div>
      </div>
    </template>

    <!-- ── kanban view ───────────────────────────────────────────────────── -->
    <template v-else-if="viewMode === 'kanban'">
      <!-- sumário de alertas globais -->
      <div v-if="overdueCount > 0 || dueTodayCount > 0" class="alert-banner" role="alert">
        <span v-if="overdueCount > 0" class="alert-chip" data-level="critical">
          ⚠ {{ overdueCount }} {{ overdueCount === 1 ? 'tarefa atrasada' : 'tarefas atrasadas' }}
        </span>
        <span v-if="dueTodayCount > 0" class="alert-chip" data-level="today">
          🔔 {{ dueTodayCount }} {{ dueTodayCount === 1 ? 'vence hoje' : 'vencem hoje' }}
        </span>
      </div>

      <div v-if="filteredItems.length === 0" class="kanban-empty">
        <UiEmptyState
          title="Nenhuma tarefa encontrada"
          description="Crie a primeira tarefa ou ajuste os filtros aplicados."
          icon="task"
        >
          <template #action>
            <UiButton variant="primary" @click="openNewTask">Criar Tarefa</UiButton>
          </template>
        </UiEmptyState>
      </div>

      <div v-else class="kanban-board" role="list" aria-label="Quadro Kanban de Tarefas">
        <div
          v-for="col in COLUMNS"
          :key="col.status"
          class="kanban-col"
          :data-status="col.status"
          role="listitem"
        >
          <!-- cabeçalho da coluna -->
          <div class="kanban-col-header">
            <span class="col-indicator" :data-tone="col.tone" aria-hidden="true" />
            <span class="col-title">{{ col.label }}</span>
            <span class="col-count" :aria-label="`${tasksByStatus[col.status]?.length || 0} tarefas`">
              {{ tasksByStatus[col.status]?.length || 0 }}
            </span>
          </div>

          <!-- cards -->
          <div class="kanban-col-body">
            <div
              v-if="!tasksByStatus[col.status] || tasksByStatus[col.status].length === 0"
              class="col-empty"
            >
              Sem tarefas
            </div>
            <article
              v-for="task in tasksByStatus[col.status]"
              :key="task.id"
              class="task-card"
              :data-priority="task.priority"
              :data-deadline="deadlineLevel(task.due_at)"
              role="button"
              tabindex="0"
              :aria-label="task.title + ' — ' + col.label"
              @click="openTask(task)"
              @keydown.enter="openTask(task)"
              @keydown.space.prevent="openTask(task)"
            >
              <!-- priority strip lateral -->
              <div class="task-priority-strip" :data-priority="task.priority" aria-hidden="true" />

              <div class="task-card-inner">
                <!-- badges row: prioridade + alerta de prazo -->
                <div class="task-badges">
                  <span
                    v-if="task.priority"
                    class="priority-badge"
                    :data-priority="task.priority"
                    :aria-label="'Prioridade ' + priorityLabel(task.priority)"
                  >
                    {{ priorityIcon(task.priority) }} {{ priorityLabel(task.priority) }}
                  </span>
                  <span
                    v-if="deadlineLevel(task.due_at) !== 'none'"
                    class="deadline-chip"
                    :data-level="deadlineLevel(task.due_at)"
                    role="status"
                    :aria-label="deadlineAriaLabel(task.due_at)"
                  >
                    {{ deadlineIcon(task.due_at) }} {{ deadlineShortLabel(task.due_at) }}
                  </span>
                </div>

                <!-- título -->
                <h3 class="task-title">{{ task.title }}</h3>

                <!-- descrição truncada -->
                <p v-if="task.description" class="task-desc">{{ task.description }}</p>

                <!-- footer: responsável + prazo + entidade -->
                <div class="task-footer">
                  <div class="task-meta-left">
                    <span v-if="task.assignee" class="task-assignee" :aria-label="'Responsável: ' + task.assignee">
                      <span class="assignee-avatar" aria-hidden="true">{{ avatarInitial(task.assignee) }}</span>
                      <span class="assignee-name">{{ task.assignee }}</span>
                    </span>
                    <span v-if="task.entity_type" class="entity-tag" :data-kind="task.entity_type">
                      {{ task.entity_type }}{{ task.entity_id ? ' #' + task.entity_id : '' }}
                    </span>
                  </div>
                  <time
                    v-if="task.due_at"
                    class="task-due"
                    :datetime="task.due_at"
                    :data-level="deadlineLevel(task.due_at)"
                    :aria-label="'Prazo: ' + format.formatDate(task.due_at)"
                  >
                    {{ format.formatDate(task.due_at) }}
                  </time>
                </div>
              </div>
            </article>
          </div>
        </div>
      </div>
    </template>

    <!-- ── list view ─────────────────────────────────────────────────────── -->
    <template v-else>
      <UiDataTable
        :columns="tableColumns"
        :rows="filteredItems"
        :loading="r.loading.value"
        row-key="id"
        clickable-rows
        server-mode
        :sort="r.sort.value"
        :page="r.page.value"
        :page-size="r.pageSize.value"
        :total="r.total.value"
        paginated
        :empty="{ title: 'Nenhuma tarefa encontrada', description: 'Crie a primeira tarefa ou ajuste os filtros aplicados.' }"
        @update:sort="r.setSort"
        @update:page="r.setPage"
        @row-click="openTask"
      >
        <template #cell-title="{ row }">
          <div class="tbl-title-cell">
            <span
              v-if="deadlineLevel(row.due_at) !== 'none'"
              class="deadline-chip"
              :data-level="deadlineLevel(row.due_at)"
              aria-hidden="true"
            >{{ deadlineIcon(row.due_at) }}</span>
            <span class="tbl-title">{{ row.title }}</span>
          </div>
        </template>

        <template #cell-priority="{ value }">
          <span v-if="value" class="priority-badge" :data-priority="value">
            {{ priorityIcon(value) }} {{ priorityLabel(value) }}
          </span>
          <span v-else class="muted-dash">—</span>
        </template>

        <template #cell-status="{ value }">
          <UiStatusBadge :status="statusBadgeKey(value)" :label="statusLabel(value)" with-dot />
        </template>

        <template #cell-assignee="{ row }">
          <div v-if="row.assignee" class="tbl-assignee">
            <span class="assignee-avatar sm" aria-hidden="true">{{ avatarInitial(row.assignee) }}</span>
            {{ row.assignee }}
          </div>
          <span v-else class="muted-dash">—</span>
        </template>

        <template #cell-due_at="{ value, row }">
          <time
            v-if="value"
            class="task-due tbl"
            :datetime="value"
            :data-level="deadlineLevel(value)"
          >
            {{ format.formatDate(value) }}
          </time>
          <span v-else class="muted-dash">—</span>
        </template>

        <template #cell-entity_type="{ row }">
          <span v-if="row.entity_type" class="entity-tag" :data-kind="row.entity_type">
            {{ row.entity_type }}{{ row.entity_id ? ' #' + row.entity_id : '' }}
          </span>
          <span v-else class="muted-dash">—</span>
        </template>

        <template #empty-action>
          <UiButton variant="primary" @click="openNewTask">Criar Tarefa</UiButton>
        </template>
      </UiDataTable>
    </template>

    <!-- ── modal: nova tarefa ─────────────────────────────────────────────── -->
    <UiModal
      :open="showModal"
      title="Nova Tarefa"
      width="lg"
      persistent
      @update:open="showModal = $event"
    >
      <form class="task-form" @submit.prevent="submitTask">
        <UiFormSection title="Identificação" :columns="1">
          <UiFormField label="Título" :required="true" :error="form.errors.title">
            <template #default="{ id, describedBy }">
              <UiInput
                :id="id"
                :described-by="describedBy"
                type="text"
                :model-value="form.values.title"
                placeholder="Descrição curta da tarefa"
                autocomplete="off"
                :error="!!form.errors.title"
                @update:model-value="form.setField('title', $event)"
              />
            </template>
          </UiFormField>

          <UiFormField label="Descrição" :error="form.errors.description">
            <template #default="{ id, describedBy }">
              <UiTextarea
                :id="id"
                :described-by="describedBy"
                :model-value="form.values.description"
                placeholder="Detalhes adicionais (opcional)"
                :rows="3"
                :error="!!form.errors.description"
                @update:model-value="form.setField('description', $event)"
              />
            </template>
          </UiFormField>
        </UiFormSection>

        <UiFormSection title="Atribuição e Prazo" :columns="2">
          <UiFormField label="Responsável" :error="form.errors.assignee">
            <template #default="{ id, describedBy }">
              <UiInput
                :id="id"
                :described-by="describedBy"
                type="text"
                :model-value="form.values.assignee"
                placeholder="Nome do responsável"
                :error="!!form.errors.assignee"
                @update:model-value="form.setField('assignee', $event)"
              />
            </template>
          </UiFormField>

          <UiFormField label="Role do Responsável" :error="form.errors.assignee_role">
            <template #default="{ id, describedBy }">
              <select
                :id="id"
                :aria-describedby="describedBy"
                class="ui-kit-select"
                :value="form.values.assignee_role"
                @change="form.setField('assignee_role', $event.target.value)"
              >
                <option value="">Selecione…</option>
                <option value="admin">Administrador</option>
                <option value="manager">Gerente</option>
                <option value="member">Membro</option>
              </select>
            </template>
          </UiFormField>

          <UiFormField label="Prazo" :error="form.errors.due_at">
            <template #default="{ id, describedBy }">
              <UiInput
                :id="id"
                :described-by="describedBy"
                type="datetime-local"
                :model-value="form.values.due_at"
                :error="!!form.errors.due_at"
                @update:model-value="form.setField('due_at', $event)"
              />
            </template>
          </UiFormField>

          <UiFormField label="Prioridade" :error="form.errors.priority">
            <template #default="{ id, describedBy }">
              <select
                :id="id"
                :aria-describedby="describedBy"
                class="ui-kit-select"
                :value="form.values.priority"
                @change="form.setField('priority', $event.target.value)"
              >
                <option value="">Selecione…</option>
                <option value="baixa">Baixa</option>
                <option value="media">Média</option>
                <option value="alta">Alta</option>
                <option value="critica">Crítica</option>
              </select>
            </template>
          </UiFormField>
        </UiFormSection>

        <UiFormSection title="Entidade Relacionada" :columns="2">
          <UiFormField label="Tipo de Entidade" :error="form.errors.entity_type">
            <template #default="{ id, describedBy }">
              <UiInput
                :id="id"
                :described-by="describedBy"
                type="text"
                :model-value="form.values.entity_type"
                placeholder="Ex: pf, pj, document…"
                :error="!!form.errors.entity_type"
                @update:model-value="form.setField('entity_type', $event)"
              />
            </template>
          </UiFormField>

          <UiFormField label="ID da Entidade" :error="form.errors.entity_id">
            <template #default="{ id, describedBy }">
              <UiInput
                :id="id"
                :described-by="describedBy"
                type="number"
                :model-value="form.values.entity_id"
                placeholder="ID numérico"
                min="1"
                inputmode="numeric"
                :error="!!form.errors.entity_id"
                @update:model-value="form.setField('entity_id', $event ? Number($event) : null)"
              />
            </template>
          </UiFormField>
        </UiFormSection>
      </form>

      <template #footer>
        <div class="modal-footer">
          <UiButton variant="ghost" type="button" @click="showModal = false">Cancelar</UiButton>
          <UiButton variant="primary" type="button" :loading="form.submitting.value" @click="submitTask">
            Criar Tarefa
          </UiButton>
        </div>
      </template>
    </UiModal>
  </UiPageLayout>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import {
  UiPageLayout,
  UiDataTable,
  UiButton,
  UiFiltersPanel,
  UiStatusBadge,
  UiEmptyState,
  UiModal,
  UiFormField,
  UiFormSection,
  UiInput,
  UiTextarea,
  useResource,
  useToast,
  useForm,
  format,
  validators,
} from '../ui/index.js';
import { tasks } from '../api.js';

const router = useRouter();
const toast = useToast();

// ─── vista ─────────────────────────────────────────────────────────────────
const viewMode = ref('kanban');

// ─── colunas kanban ─────────────────────────────────────────────────────────
const COLUMNS = [
  { status: 'aberta',              label: 'Aberta',              tone: 'neutral'  },
  { status: 'em_progresso',        label: 'Em Progresso',        tone: 'running'  },
  { status: 'aguardando_cliente',  label: 'Aguardando Cliente',  tone: 'warning'  },
  { status: 'aguardando_contador', label: 'Aguardando Contador', tone: 'warning'  },
  { status: 'concluida',           label: 'Concluída',           tone: 'success'  },
];

// ─── recurso ────────────────────────────────────────────────────────────────
const r = useResource(tasks, { pageSize: 100 });

// ─── filtros ativos (ref p/ v-model no panel + aplicação) ──────────────────
const filters = ref({ q: '', priority: '', assignee: '', entity_type: '' });

const filterFields = [
  { key: 'q',           label: 'Buscar',      type: 'text',   placeholder: 'título ou descrição' },
  {
    key: 'priority',
    label: 'Prioridade',
    type: 'select',
    options: [
      { value: 'baixa',   label: 'Baixa'   },
      { value: 'media',   label: 'Média'   },
      { value: 'alta',    label: 'Alta'    },
      { value: 'critica', label: 'Crítica' },
    ],
  },
  { key: 'assignee',    label: 'Responsável', type: 'text',   placeholder: 'nome do responsável' },
  { key: 'entity_type', label: 'Entidade',    type: 'text',   placeholder: 'pf, pj, document…'  },
];

function applyFilters() { r.setFilters({ ...filters.value }); }
function clearFilters() {
  filters.value = { q: '', priority: '', assignee: '', entity_type: '' };
  r.setFilters({});
}

// ─── dados filtrados (client-side para o kanban; server já filtra p/ lista) ─
const filteredItems = computed(() => {
  const items = r.items.value || [];
  const q = (filters.value.q || '').toLowerCase().trim();
  const pri = filters.value.priority || '';
  const asgn = (filters.value.assignee || '').toLowerCase().trim();
  const ent = (filters.value.entity_type || '').toLowerCase().trim();
  return items.filter((t) => {
    if (q   && !((t.title || '').toLowerCase().includes(q) || (t.description || '').toLowerCase().includes(q))) return false;
    if (pri  && t.priority !== pri) return false;
    if (asgn && !(t.assignee || '').toLowerCase().includes(asgn)) return false;
    if (ent  && !(t.entity_type || '').toLowerCase().includes(ent)) return false;
    return true;
  });
});

// ─── agrupamento por status para o kanban ───────────────────────────────────
const tasksByStatus = computed(() => {
  const groups = {};
  for (const col of COLUMNS) groups[col.status] = [];
  for (const task of filteredItems.value) {
    const s = normalizeStatus(task.status);
    if (groups[s]) groups[s].push(task);
    else groups['aberta'].push(task); // fallback: status desconhecido vai para "Aberta"
  }
  return groups;
});

// ─── alertas globais ────────────────────────────────────────────────────────
const overdueCount = computed(() =>
  filteredItems.value.filter((t) => t.due_at && new Date(t.due_at).getTime() < Date.now() && t.status !== 'concluida').length
);
const dueTodayCount = computed(() => {
  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
  const todayEnd   = new Date(); todayEnd.setHours(23, 59, 59, 999);
  return filteredItems.value.filter((t) => {
    if (!t.due_at || t.status === 'concluida') return false;
    const d = new Date(t.due_at).getTime();
    return d >= todayStart.getTime() && d <= todayEnd.getTime();
  }).length;
});

// ─── colunas da tabela (modo lista) ─────────────────────────────────────────
const tableColumns = [
  { key: 'title',       label: 'Título',      sortable: true  },
  { key: 'priority',    label: 'Prioridade',  sortable: true  },
  { key: 'status',      label: 'Status',      sortable: true  },
  { key: 'assignee',    label: 'Responsável', sortable: false },
  { key: 'due_at',      label: 'Prazo',       sortable: true  },
  { key: 'entity_type', label: 'Entidade',    sortable: false },
];

// ─── navegação ──────────────────────────────────────────────────────────────
function openTask(task) {
  router.push('/tasks/' + task.id);
}

// ─── formulário nova tarefa ──────────────────────────────────────────────────
const showModal = ref(false);

const form = useForm({
  initial: {
    title: '',
    description: '',
    assignee: '',
    assignee_role: '',
    due_at: '',
    priority: '',
    entity_type: '',
    entity_id: null,
  },
  rules: {
    title: [validators.required('O título é obrigatório.')],
  },
});

function openNewTask() {
  form.reset?.();
  showModal.value = true;
}

async function submitTask() {
  try {
    await form.handleSubmit(async (values) => {
      const payload = { title: values.title.trim() };
      if (values.description)   payload.description   = values.description.trim();
      if (values.assignee)      payload.assignee       = values.assignee.trim();
      if (values.assignee_role) payload.assignee_role  = values.assignee_role;
      if (values.due_at)        payload.due_at         = values.due_at;
      if (values.priority)      payload.priority       = values.priority;
      if (values.entity_type)   payload.entity_type    = values.entity_type.trim();
      if (values.entity_id)     payload.entity_id      = Number(values.entity_id);
      await tasks.create(payload);
      toast.success('Tarefa criada com sucesso.');
      showModal.value = false;
      r.load();
    });
  } catch (e) {
    toast.error(e.message || 'Erro ao criar tarefa. Tente novamente.');
  }
}

// ─── helpers ────────────────────────────────────────────────────────────────
function normalizeStatus(raw) {
  if (!raw) return 'aberta';
  const s = String(raw).toLowerCase().replace(/\s+/g, '_').replace(/-/g, '_');
  const MAP = {
    aberta: 'aberta', open: 'aberta', novo: 'aberta', nova: 'aberta',
    em_progresso: 'em_progresso', in_progress: 'em_progresso', em_andamento: 'em_progresso',
    aguardando_cliente: 'aguardando_cliente', waiting_client: 'aguardando_cliente',
    aguardando_contador: 'aguardando_contador', waiting_accountant: 'aguardando_contador',
    concluida: 'concluida', concluído: 'concluida', done: 'concluida', completed: 'concluida', closed: 'concluida',
  };
  return MAP[s] || 'aberta';
}

function statusBadgeKey(raw) {
  return normalizeStatus(raw);
}

function statusLabel(raw) {
  const col = COLUMNS.find((c) => c.status === normalizeStatus(raw));
  return col ? col.label : (raw || '—');
}

function priorityLabel(p) {
  const MAP = { baixa: 'Baixa', media: 'Média', alta: 'Alta', critica: 'Crítica' };
  return MAP[p] || p || '—';
}

function priorityIcon(p) {
  const MAP = { baixa: '↓', media: '→', alta: '↑', critica: '⚡' };
  return MAP[p] || '';
}

/** deadlineLevel: 'critical' | 'today' | 'soon' | 'none' */
function deadlineLevel(due_at) {
  if (!due_at) return 'none';
  const ms = new Date(due_at).getTime();
  if (!isFinite(ms)) return 'none';
  const diff = ms - Date.now();
  if (diff < 0)                          return 'critical'; // atrasado
  if (diff < 24 * 60 * 60 * 1000)       return 'today';    // vence hoje
  if (diff < 3  * 24 * 60 * 60 * 1000)  return 'soon';     // vence em ≤3 dias
  return 'none';
}

function deadlineIcon(due_at) {
  const level = deadlineLevel(due_at);
  if (level === 'critical') return '🔴';
  if (level === 'today')    return '🟡';
  if (level === 'soon')     return '🟠';
  return '';
}

function deadlineShortLabel(due_at) {
  const level = deadlineLevel(due_at);
  if (level === 'critical') return 'Atrasada';
  if (level === 'today')    return 'Hoje';
  if (level === 'soon')     return 'Em breve';
  return '';
}

function deadlineAriaLabel(due_at) {
  const level = deadlineLevel(due_at);
  if (level === 'critical') return 'Atenção: tarefa atrasada';
  if (level === 'today')    return 'Vence hoje';
  if (level === 'soon')     return 'Vence em breve';
  return '';
}

function avatarInitial(name) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name[0].toUpperCase();
}

// ─── init ────────────────────────────────────────────────────────────────────
onMounted(r.load);
</script>

<style scoped>
/* ══════════════════════════════════════════════════════
   View toggle (Kanban / Lista)
══════════════════════════════════════════════════════ */
.view-toggle {
  display: inline-flex;
  border: 1px solid rgb(var(--ui-border-strong));
  border-radius: var(--ui-radius-md);
  overflow: hidden;
}

.toggle-btn {
  display: inline-flex;
  align-items: center;
  gap: var(--ui-space-2);
  padding: var(--ui-space-2) var(--ui-space-4);
  font: inherit;
  font-size: var(--ui-text-sm);
  font-weight: 500;
  background: rgb(var(--ui-surface));
  color: rgb(var(--ui-muted));
  border: none;
  border-right: 1px solid rgb(var(--ui-border));
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
}

.toggle-btn:last-child {
  border-right: none;
}

.toggle-btn[data-active="true"] {
  background: rgb(var(--ui-accent) / 0.12);
  color: rgb(var(--ui-accent-strong));
  font-weight: 700;
}

.toggle-btn:focus-visible {
  outline: 2px solid rgb(var(--ui-accent));
  outline-offset: 2px;
  z-index: 1;
}

/* ══════════════════════════════════════════════════════
   Alert banner
══════════════════════════════════════════════════════ */
.alert-banner {
  display: flex;
  gap: var(--ui-space-2);
  flex-wrap: wrap;
}

.alert-chip {
  display: inline-flex;
  align-items: center;
  gap: var(--ui-space-2);
  padding: var(--ui-space-1) var(--ui-space-3);
  border-radius: var(--ui-radius-pill);
  font-size: var(--ui-text-sm);
  font-weight: 700;
  white-space: nowrap;
}

.alert-chip[data-level="critical"] {
  background: rgb(var(--ui-danger) / 0.14);
  color: rgb(var(--ui-danger));
  border: 1px solid rgb(var(--ui-danger) / 0.3);
}

.alert-chip[data-level="today"] {
  background: rgb(var(--ui-warn) / 0.14);
  color: rgb(var(--ui-warn));
  border: 1px solid rgb(var(--ui-warn) / 0.3);
}

/* ══════════════════════════════════════════════════════
   Kanban skeleton
══════════════════════════════════════════════════════ */
.kanban-skeleton {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: var(--ui-space-4);
}

@media (max-width: 1100px) { .kanban-skeleton { grid-template-columns: repeat(3, 1fr); } }
@media (max-width: 720px)  { .kanban-skeleton { grid-template-columns: repeat(2, 1fr); } }
@media (max-width: 480px)  { .kanban-skeleton { grid-template-columns: 1fr; } }

.sk-col-head {
  height: 40px;
  border-radius: var(--ui-radius-md);
  background: linear-gradient(90deg, rgb(var(--ui-surface-2)) 25%, rgb(var(--ui-border)) 50%, rgb(var(--ui-surface-2)) 75%);
  background-size: 400% 100%;
  animation: sk-shimmer 1.4s ease infinite;
  margin-bottom: var(--ui-space-3);
}

.sk-card {
  height: 100px;
  border-radius: var(--ui-radius-md);
  background: linear-gradient(90deg, rgb(var(--ui-surface-2)) 25%, rgb(var(--ui-border)) 50%, rgb(var(--ui-surface-2)) 75%);
  background-size: 400% 100%;
  animation: sk-shimmer 1.4s ease infinite;
  margin-bottom: var(--ui-space-3);
}

.sk-card:nth-child(2) { animation-delay: 0.12s; height: 80px; }
.sk-card:nth-child(3) { animation-delay: 0.24s; height: 120px; }

@keyframes sk-shimmer {
  0%   { background-position: 100% 50%; }
  100% { background-position: 0% 50%; }
}

@media (prefers-reduced-motion: reduce) {
  .sk-col-head, .sk-card { animation: none; }
}

/* ══════════════════════════════════════════════════════
   Kanban board
══════════════════════════════════════════════════════ */
.kanban-empty {
  padding: var(--ui-space-6) 0;
}

.kanban-board {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: var(--ui-space-4);
  align-items: start;
  min-height: 320px;
}

@media (max-width: 1280px) { .kanban-board { grid-template-columns: repeat(3, 1fr); } }
@media (max-width: 860px)  { .kanban-board { grid-template-columns: repeat(2, 1fr); } }
@media (max-width: 520px)  { .kanban-board { grid-template-columns: 1fr; } }

/* ── coluna ── */
.kanban-col {
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-3);
  min-height: 120px;
}

.kanban-col-header {
  display: flex;
  align-items: center;
  gap: var(--ui-space-2);
  padding: 8px 10px;
  background: rgb(var(--ui-surface));
  border: 1px solid rgb(var(--ui-border));
  border-radius: var(--ui-radius-md);
  position: sticky;
  top: 0;
  z-index: 2;
}

.col-indicator {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  flex-shrink: 0;
}
.col-indicator[data-tone="neutral"]  { background: rgb(var(--ui-muted)); }
.col-indicator[data-tone="running"]  { background: rgb(var(--ui-accent)); }
.col-indicator[data-tone="warning"]  { background: rgb(var(--ui-warn)); }
.col-indicator[data-tone="success"]  { background: rgb(var(--ui-ok)); }

.col-title {
  font-size: var(--ui-text-sm);
  font-weight: 700;
  color: rgb(var(--ui-fg));
  flex: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.col-count {
  font-size: var(--ui-text-xs);
  font-weight: 700;
  min-width: 22px;
  height: 22px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: rgb(var(--ui-surface-2));
  color: rgb(var(--ui-muted));
  border-radius: var(--ui-radius-pill);
  border: 1px solid rgb(var(--ui-border));
  padding: 0 var(--ui-space-2);
}

.kanban-col-body {
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-2);
}

.col-empty {
  padding: var(--ui-space-3) var(--ui-space-2);
  text-align: center;
  font-size: var(--ui-text-sm);
  color: rgb(var(--ui-muted));
  background: rgb(var(--ui-surface) / 0.6);
  border: 1px dashed rgb(var(--ui-border));
  border-radius: var(--ui-radius-md);
}

/* ── task card ── */
.task-card {
  display: flex;
  background: rgb(var(--ui-surface));
  border: 1px solid rgb(var(--ui-border));
  border-radius: var(--ui-radius-md);
  box-shadow: var(--ui-shadow-sm);
  overflow: hidden;
  cursor: pointer;
  transition: box-shadow 0.15s, border-color 0.15s, transform 0.1s;
  text-align: left;
}

.task-card:hover,
.task-card:focus-visible {
  border-color: rgb(var(--ui-accent) / 0.5);
  box-shadow: var(--ui-shadow-md);
  transform: translateY(-1px);
  outline: none;
}

.task-card:focus-visible {
  outline: 2px solid rgb(var(--ui-accent));
  outline-offset: 2px;
}

/* tira lateral de prioridade */
.task-priority-strip {
  width: 4px;
  flex-shrink: 0;
}
.task-priority-strip[data-priority="baixa"]   { background: rgb(var(--ui-ok) / 0.6); }
.task-priority-strip[data-priority="media"]   { background: rgb(var(--ui-accent) / 0.7); }
.task-priority-strip[data-priority="alta"]    { background: rgb(var(--ui-warn)); }
.task-priority-strip[data-priority="critica"] { background: rgb(var(--ui-danger)); }

/* card destacado por deadline */
.task-card[data-deadline="critical"] { border-color: rgb(var(--ui-danger) / 0.5); }
.task-card[data-deadline="today"]    { border-color: rgb(var(--ui-warn) / 0.5); }

.task-card-inner {
  padding: var(--ui-space-3);
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-2);
  flex: 1;
  min-width: 0;
}

/* ── badges row ── */
.task-badges {
  display: flex;
  align-items: center;
  gap: var(--ui-space-1);
  flex-wrap: wrap;
}

.priority-badge {
  display: inline-flex;
  align-items: center;
  gap: var(--ui-space-1);
  font-size: var(--ui-text-xs);
  font-weight: 700;
  padding: var(--ui-space-1) var(--ui-space-2);
  border-radius: var(--ui-radius-pill);
  white-space: nowrap;
}
.priority-badge[data-priority="baixa"]   { background: rgb(var(--ui-ok) / 0.14);     color: rgb(var(--ui-ok)); }
.priority-badge[data-priority="media"]   { background: rgb(var(--ui-accent) / 0.14); color: rgb(var(--ui-accent-strong)); }
.priority-badge[data-priority="alta"]    { background: rgb(var(--ui-warn) / 0.16);   color: rgb(var(--ui-warn)); }
.priority-badge[data-priority="critica"] { background: rgb(var(--ui-danger) / 0.14); color: rgb(var(--ui-danger)); font-weight: 800; }

.deadline-chip {
  display: inline-flex;
  align-items: center;
  gap: var(--ui-space-1);
  font-size: var(--ui-text-xs);
  font-weight: 700;
  padding: var(--ui-space-1) var(--ui-space-2);
  border-radius: var(--ui-radius-pill);
  white-space: nowrap;
}
.deadline-chip[data-level="critical"] { background: rgb(var(--ui-danger) / 0.14); color: rgb(var(--ui-danger)); }
.deadline-chip[data-level="today"]    { background: rgb(var(--ui-warn)   / 0.16); color: rgb(var(--ui-warn)); }
.deadline-chip[data-level="soon"]     { background: rgb(var(--ui-accent) / 0.14); color: rgb(var(--ui-accent-strong)); }

/* ── card title / desc ── */
.task-title {
  font-size: var(--ui-text-sm);
  font-weight: 600;
  color: rgb(var(--ui-fg));
  line-height: 1.35;
  margin: 0;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.task-desc {
  font-size: var(--ui-text-xs);
  color: rgb(var(--ui-muted));
  line-height: 1.4;
  margin: 0;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

/* ── card footer ── */
.task-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ui-space-2);
  flex-wrap: wrap;
  margin-top: auto;
  padding-top: var(--ui-space-1);
}

.task-meta-left {
  display: flex;
  align-items: center;
  gap: var(--ui-space-1);
  flex-wrap: wrap;
  min-width: 0;
}

.task-assignee {
  display: inline-flex;
  align-items: center;
  gap: var(--ui-space-1);
  font-size: var(--ui-text-xs);
  color: rgb(var(--ui-muted));
  min-width: 0;
  overflow: hidden;
}

.assignee-avatar {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: rgb(var(--ui-accent) / 0.18);
  color: rgb(var(--ui-accent-strong));
  font-size: 10px;
  font-weight: 800;
  flex-shrink: 0;
}

.assignee-avatar.sm {
  width: 20px;
  height: 20px;
  font-size: 9px;
}

.assignee-name {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 90px;
}

.entity-tag {
  display: inline-flex;
  align-items: center;
  font-size: var(--ui-text-xs);
  font-weight: 600;
  padding: var(--ui-space-1) var(--ui-space-2);
  border-radius: var(--ui-radius-sm);
  white-space: nowrap;
  letter-spacing: 0.03em;
  text-transform: uppercase;
}
.entity-tag[data-kind="pf"] { background: rgb(var(--ui-ok) / 0.12); color: rgb(var(--ui-ok)); }
.entity-tag[data-kind="pj"] { background: rgb(var(--ui-warn) / 0.12); color: rgb(var(--ui-warn)); }
.entity-tag:not([data-kind="pf"]):not([data-kind="pj"]) {
  background: rgb(var(--ui-muted) / 0.1);
  color: rgb(var(--ui-muted));
}

.task-due {
  font-size: var(--ui-text-xs);
  font-variant-numeric: tabular-nums;
  color: rgb(var(--ui-muted));
  white-space: nowrap;
  font-weight: 500;
  flex-shrink: 0;
}
.task-due[data-level="critical"] { color: rgb(var(--ui-danger)); font-weight: 700; }
.task-due[data-level="today"]    { color: rgb(var(--ui-warn));   font-weight: 700; }
.task-due[data-level="soon"]     { color: rgb(var(--ui-accent-strong)); }
.task-due.tbl { font-size: var(--ui-text-sm); }

/* ══════════════════════════════════════════════════════
   Table cells (list mode)
══════════════════════════════════════════════════════ */
.tbl-title-cell {
  display: flex;
  align-items: center;
  gap: var(--ui-space-2);
}

.tbl-title {
  font-weight: 500;
  color: rgb(var(--ui-fg));
}

.tbl-assignee {
  display: flex;
  align-items: center;
  gap: var(--ui-space-2);
  font-size: var(--ui-text-sm);
}

.muted-dash {
  color: rgb(var(--ui-muted));
}

/* ══════════════════════════════════════════════════════
   Select — sem UiSelect no kit: estilizado para combinar com UiInput
══════════════════════════════════════════════════════ */
.ui-kit-select {
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

.ui-kit-select:focus {
  outline: none;
  border-color: rgb(var(--ui-accent));
  box-shadow: 0 0 0 3px rgb(var(--ui-accent) / 0.15);
}

.ui-kit-select:disabled {
  opacity: 0.55;
  cursor: not-allowed;
  background: rgb(var(--ui-surface-2));
}

/* ══════════════════════════════════════════════════════
   Modal form
══════════════════════════════════════════════════════ */
.task-form {
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-4);
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: var(--ui-space-2);
  padding-top: var(--ui-space-2);
}
</style>
