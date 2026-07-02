<template>
  <UiPageLayout
    eyebrow="Tarefas"
    :title="task ? task.title || 'Tarefa' : 'Detalhe da Tarefa'"
    :subtitle="pageSubtitle"
    width="wide"
    :loading="loadingTask"
    :error="taskError ? (taskError.message || 'Erro ao carregar tarefa') : null"
    @retry="loadTask"
  >
    <template #actions>
      <UiButton variant="ghost" to="/tasks">Voltar à lista</UiButton>
      <UiButton variant="subtle" @click="openStatusModal">Mudar status</UiButton>
      <UiButton variant="primary" @click="openAttachmentModal">Anexar arquivo</UiButton>
    </template>

    <UiEmptyState
      v-if="!loadingTask && !taskError && !task"
      title="Tarefa não encontrada"
      description="Este registro não existe ou foi removido."
    />

    <template v-if="task">
      <div class="task-layout">

        <!-- ── Coluna principal ─────────────────────────────────────── -->
        <div class="task-main">

          <!-- Descrição -->
          <UiCard title="Descrição da Tarefa">
            <p v-if="task.description" class="task-description">{{ task.description }}</p>
            <p v-else class="task-no-description">Nenhuma descrição fornecida.</p>
          </UiCard>

          <!-- Thread de comentários -->
          <UiCard title="Comentários" :subtitle="commentsSubtitle">
            <template #actions>
              <UiButton variant="subtle" size="sm" @click="loadComments">Atualizar</UiButton>
            </template>

            <!-- Estados de comentários -->
            <div v-if="loadingComments" class="sub-state">
              <UiLoadingState variant="skeleton" :skeleton-lines="4" />
            </div>

            <div v-else-if="commentsError" class="sub-state">
              <UiErrorState
                :message="commentsError.message || 'Erro ao carregar comentários'"
                :retryable="true"
                @retry="loadComments"
              />
            </div>

            <div v-else-if="comments.length === 0" class="sub-state">
              <UiEmptyState
                title="Nenhum comentário"
                description="Seja o primeiro a comentar nesta tarefa."
                icon="💬"
              />
            </div>

            <!-- Lista de comentários -->
            <ol v-else class="comment-thread" aria-label="Thread de comentários">
              <li
                v-for="(comment, idx) in comments"
                :key="comment.id || idx"
                class="comment-item"
              >
                <div class="comment-avatar" aria-hidden="true">
                  {{ avatarInitial(comment.author || comment.user_id || 'U') }}
                </div>
                <div class="comment-bubble">
                  <div class="comment-meta">
                    <span class="comment-author">{{ comment.author || comment.user_id || 'Usuário' }}</span>
                    <time class="comment-time" :datetime="comment.created_at">
                      {{ format.formatDateTime(comment.created_at) }}
                    </time>
                  </div>
                  <p class="comment-body">{{ comment.body || comment.content || comment.text || '' }}</p>
                </div>
              </li>
            </ol>

            <!-- Formulário de novo comentário -->
            <form class="comment-form" @submit.prevent="submitComment">
              <UiFormSection title="Novo Comentário" :columns="1">
                <UiFormField
                  label="Comentário"
                  :required="true"
                  :error="commentForm.errors.body"
                >
                  <template #default="{ id, describedBy }">
                    <UiTextarea
                      :id="id"
                      :described-by="describedBy"
                      :error="!!commentForm.errors.body"
                      placeholder="Escreva seu comentário aqui…"
                      :rows="3"
                      :model-value="commentForm.values.body"
                      @update:model-value="commentForm.setField('body', $event)"
                    />
                  </template>
                </UiFormField>
              </UiFormSection>
              <div class="comment-form-actions">
                <UiButton
                  variant="primary"
                  :loading="commentForm.submitting.value"
                  @click="submitComment"
                >
                  Publicar comentário
                </UiButton>
              </div>
            </form>
          </UiCard>

          <!-- Lista de Anexos -->
          <UiCard title="Anexos" :subtitle="attachmentsSubtitle">
            <template #actions>
              <UiButton variant="subtle" size="sm" @click="loadAttachments">Atualizar</UiButton>
            </template>

            <!-- Estados de anexos -->
            <div v-if="loadingAttachments" class="sub-state">
              <UiLoadingState variant="skeleton" :skeleton-lines="3" />
            </div>

            <div v-else-if="attachmentsError" class="sub-state">
              <UiErrorState
                :message="attachmentsError.message || 'Erro ao carregar anexos'"
                :retryable="true"
                @retry="loadAttachments"
              />
            </div>

            <div v-else-if="attachments.length === 0" class="sub-state">
              <UiEmptyState
                title="Nenhum anexo"
                description="Adicione arquivos usando o botão Anexar arquivo."
                icon="📎"
              >
                <template #action>
                  <UiButton variant="primary" @click="openAttachmentModal">Adicionar anexo</UiButton>
                </template>
              </UiEmptyState>
            </div>

            <!-- Grade de anexos -->
            <ul v-else class="attachment-list" aria-label="Anexos da tarefa">
              <li
                v-for="(att, idx) in attachments"
                :key="att.id || idx"
                class="attachment-item"
              >
                <span class="attachment-icon" aria-hidden="true">{{ fileIcon(att.content_type || att.mime_type) }}</span>
                <div class="attachment-info">
                  <span class="attachment-name">{{ att.filename || att.name || 'Anexo ' + (idx + 1) }}</span>
                  <div class="attachment-meta">
                    <span v-if="att.file_size != null" class="attachment-size">
                      {{ formatBytes(att.file_size) }}
                    </span>
                    <span v-if="att.version" class="attachment-version">
                      v{{ att.version }}
                    </span>
                    <span v-if="att.created_at" class="attachment-date">
                      {{ format.formatDateTime(att.created_at) }}
                    </span>
                    <span v-if="att.uploaded_by || att.user_id" class="attachment-uploader">
                      por {{ att.uploaded_by || att.user_id }}
                    </span>
                  </div>
                </div>
                <div class="attachment-actions">
                  <span
                    v-if="att.content_type || att.mime_type"
                    class="attachment-type-tag"
                  >{{ shortMime(att.content_type || att.mime_type) }}</span>
                  <UiButton
                    v-if="att.url || att.download_url"
                    variant="ghost"
                    size="sm"
                    :href="att.url || att.download_url"
                    target="_blank"
                    rel="noopener"
                    :aria-label="'Baixar ' + (att.filename || att.name || 'anexo')"
                  >Baixar</UiButton>
                </div>
              </li>
            </ul>
          </UiCard>
        </div>

        <!-- ── Painel lateral de metadados ──────────────────────────── -->
        <aside class="task-sidebar">
          <UiCard title="Metadados">
            <dl class="sidebar-meta">

              <!-- Status -->
              <div class="sidebar-meta-item">
                <dt>Status</dt>
                <dd>
                  <UiStatusBadge :status="task.status" with-dot />
                </dd>
              </div>

              <!-- Prioridade -->
              <div class="sidebar-meta-item">
                <dt>Prioridade</dt>
                <dd>
                  <span class="priority-badge" :data-priority="task.priority">
                    {{ priorityLabel(task.priority) }}
                  </span>
                </dd>
              </div>

              <!-- Responsável -->
              <div class="sidebar-meta-item">
                <dt>Responsável</dt>
                <dd class="assignee-cell">
                  <span v-if="task.assignee" class="assignee-avatar" aria-hidden="true">
                    {{ avatarInitial(task.assignee) }}
                  </span>
                  <span class="assignee-name">{{ task.assignee || '—' }}</span>
                  <span v-if="task.assignee_role" class="assignee-role">{{ roleLabel(task.assignee_role) }}</span>
                </dd>
              </div>

              <!-- Prazo -->
              <div class="sidebar-meta-item">
                <dt>Prazo</dt>
                <dd>
                  <span
                    v-if="task.due_at"
                    class="due-value"
                    :data-overdue="isOverdue(task.due_at) ? 'true' : 'false'"
                    :data-soon="isDueSoon(task.due_at) ? 'true' : 'false'"
                  >
                    {{ format.formatDateTime(task.due_at) }}
                  </span>
                  <span v-else class="muted-dash">—</span>
                </dd>
              </div>

              <!-- Entidade relacionada -->
              <div v-if="task.entity_type" class="sidebar-meta-item">
                <dt>Entidade Vinculada</dt>
                <dd>
                  <span class="entity-pill" :data-kind="task.entity_type">
                    {{ entityTypeLabel(task.entity_type) }}
                    <span v-if="task.entity_id" class="entity-id">#{{ task.entity_id }}</span>
                  </span>
                </dd>
              </div>

              <!-- Datas de controle -->
              <div class="sidebar-meta-item sidebar-meta-item--divider" />

              <div class="sidebar-meta-item">
                <dt>Criado em</dt>
                <dd class="date-value">{{ format.formatDateTime(task.created_at) }}</dd>
              </div>

              <div class="sidebar-meta-item">
                <dt>Atualizado em</dt>
                <dd class="date-value">{{ format.formatDateTime(task.updated_at) }}</dd>
              </div>

              <div v-if="task.id" class="sidebar-meta-item">
                <dt>ID</dt>
                <dd class="id-value">{{ task.id }}</dd>
              </div>
            </dl>

            <template #footer>
              <UiButton variant="ghost" size="sm" block @click="openStatusModal">
                Mudar status
              </UiButton>
            </template>
          </UiCard>
        </aside>
      </div>
    </template>

    <!-- ── MODAL: Mudar Status ──────────────────────────────────────── -->
    <UiModal
      :open="showStatusModal"
      title="Mudar Status da Tarefa"
      width="sm"
      persistent
      @update:open="showStatusModal = $event"
    >
      <form class="modal-form" @submit.prevent="submitStatus">
        <UiFormSection
          title="Novo Status"
          description="Selecione o status que deseja aplicar a esta tarefa."
          :columns="1"
        >
          <UiFormField
            label="Status"
            :required="true"
            :error="statusForm.errors.status"
          >
            <template #default="{ id, describedBy }">
              <select
                :id="id"
                :aria-describedby="describedBy"
                :aria-invalid="statusForm.errors.status ? 'true' : undefined"
                class="ui-select"
                :value="statusForm.values.status"
                @change="statusForm.setField('status', $event.target.value)"
              >
                <option value="">Selecione um status…</option>
                <option value="pendente">Pendente</option>
                <option value="em_andamento">Em andamento</option>
                <option value="aguardando">Aguardando</option>
                <option value="concluida">Concluída</option>
                <option value="cancelada">Cancelada</option>
              </select>
            </template>
          </UiFormField>
        </UiFormSection>
      </form>

      <template #footer>
        <UiButton variant="ghost" @click="showStatusModal = false">Cancelar</UiButton>
        <UiButton
          variant="primary"
          :loading="statusForm.submitting.value"
          @click="submitStatus"
        >
          Salvar status
        </UiButton>
      </template>
    </UiModal>

    <!-- ── MODAL: Adicionar Anexo ───────────────────────────────────── -->
    <UiModal
      :open="showAttachmentModal"
      title="Adicionar Anexo"
      width="md"
      persistent
      @update:open="showAttachmentModal = $event"
    >
      <form class="modal-form" @submit.prevent="submitAttachment">
        <UiFormSection
          title="Arquivo"
          description="Envie um arquivo para este tarefa. O histórico de versões é preservado."
          :columns="1"
        >
          <UiFormField
            label="Arquivo"
            :required="true"
            :error="attachmentForm.errors.file"
          >
            <template #default="{ id, describedBy }">
              <UiFileDrop
                :id="id"
                :aria-describedby="describedBy"
                v-model="uploadFiles"
                :multiple="false"
                label="Arraste o arquivo aqui ou clique para escolher"
                hint="PDF, XML, XLS, DOC, imagens e outros formatos. Máximo 1 arquivo."
                accept=".pdf,.xml,.xls,.xlsx,.doc,.docx,.csv,.txt,.zip,.png,.jpg,.jpeg"
                @change="onAttachmentFileChange"
              />
            </template>
          </UiFormField>

          <UiFormField label="Descrição (opcional)" :error="attachmentForm.errors.description">
            <template #default="{ id, describedBy }">
              <UiInput
                :id="id"
                :described-by="describedBy"
                :error="!!attachmentForm.errors.description"
                type="text"
                placeholder="Ex: Planilha de controle atualizada"
                :model-value="attachmentForm.values.description"
                @update:model-value="attachmentForm.setField('description', $event)"
              />
            </template>
          </UiFormField>
        </UiFormSection>
      </form>

      <template #footer>
        <UiButton variant="ghost" @click="closeAttachmentModal">Cancelar</UiButton>
        <UiButton
          variant="primary"
          :loading="attachmentForm.submitting.value"
          @click="submitAttachment"
        >
          Enviar anexo
        </UiButton>
      </template>
    </UiModal>
  </UiPageLayout>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import {
  UiPageLayout,
  UiCard,
  UiButton,
  UiStatusBadge,
  UiLoadingState,
  UiErrorState,
  UiEmptyState,
  UiModal,
  UiFormField,
  UiFormSection,
  UiFileDrop,
  UiInput,
  UiTextarea,
  useForm,
  useToast,
  validators,
  format,
} from '../ui/index.js';
import { tasks } from '../api.js';

// ─── props ─────────────────────────────────────────────────────────────────
const props = defineProps({
  id: { type: String, required: true },
});

// ─── composables ───────────────────────────────────────────────────────────
const toast = useToast();

// ─── estado: tarefa principal ──────────────────────────────────────────────
const task = ref(null);
const loadingTask = ref(true);
const taskError = ref(null);

async function loadTask() {
  loadingTask.value = true;
  taskError.value = null;
  try {
    task.value = await tasks.get(props.id);
  } catch (e) {
    taskError.value = e;
  } finally {
    loadingTask.value = false;
  }
}

// ─── estado: comentários ───────────────────────────────────────────────────
const comments = ref([]);
const loadingComments = ref(false);
const commentsError = ref(null);

async function loadComments() {
  loadingComments.value = true;
  commentsError.value = null;
  try {
    comments.value = await tasks.listComments(props.id);
  } catch (e) {
    commentsError.value = e;
    comments.value = [];
  } finally {
    loadingComments.value = false;
  }
}

// ─── estado: anexos ────────────────────────────────────────────────────────
const attachments = ref([]);
const loadingAttachments = ref(false);
const attachmentsError = ref(null);

async function loadAttachments() {
  loadingAttachments.value = true;
  attachmentsError.value = null;
  try {
    attachments.value = await tasks.listAttachments(props.id);
  } catch (e) {
    attachmentsError.value = e;
    attachments.value = [];
  } finally {
    loadingAttachments.value = false;
  }
}

// ─── computed ──────────────────────────────────────────────────────────────
const pageSubtitle = computed(() => {
  if (!task.value) return '';
  const parts = [];
  if (task.value.assignee) parts.push(task.value.assignee);
  if (task.value.priority) parts.push(priorityLabel(task.value.priority));
  if (task.value.due_at) parts.push('Prazo: ' + format.formatDate(task.value.due_at));
  return parts.join(' · ');
});

const commentsSubtitle = computed(() => {
  const n = comments.value.length;
  if (n === 0) return 'Nenhum comentário';
  return n === 1 ? '1 comentário' : n + ' comentários';
});

const attachmentsSubtitle = computed(() => {
  const n = attachments.value.length;
  if (n === 0) return 'Nenhum anexo';
  return n === 1 ? '1 anexo' : n + ' anexos';
});

// ─── modal: mudar status ───────────────────────────────────────────────────
const showStatusModal = ref(false);

const statusForm = useForm({
  initial: { status: '' },
  rules: { status: [validators.required('Selecione um status')] },
});

function openStatusModal() {
  statusForm.setField('status', task.value ? (task.value.status || '') : '');
  showStatusModal.value = true;
}

async function submitStatus() {
  await statusForm.handleSubmit(async (values) => {
    try {
      const updated = await tasks.update(props.id, { status: values.status });
      task.value = { ...task.value, ...updated, status: updated.status || values.status };
      toast.success('Status atualizado com sucesso.');
      showStatusModal.value = false;
    } catch (e) {
      toast.error(e.message || 'Erro ao atualizar status. Tente novamente.');
    }
  });
}

// ─── modal: adicionar comentário ───────────────────────────────────────────
const commentForm = useForm({
  initial: { body: '' },
  rules: { body: [validators.required('Escreva um comentário antes de publicar')] },
});

async function submitComment() {
  await commentForm.handleSubmit(async (values) => {
    try {
      const created = await tasks.createComment(props.id, values.body);
      comments.value = [created, ...comments.value];
      commentForm.reset();
      toast.success('Comentário publicado.');
    } catch (e) {
      toast.error(e.message || 'Erro ao publicar comentário. Tente novamente.');
    }
  });
}

// ─── modal: adicionar anexo ────────────────────────────────────────────────
const showAttachmentModal = ref(false);
const uploadFiles = ref([]);

const attachmentForm = useForm({
  initial: { file: null, description: '' },
  rules: { file: [validators.required('Selecione um arquivo para anexar')] },
});

function onAttachmentFileChange(files) {
  const f = files && files.length ? files[0] : null;
  attachmentForm.setField('file', f);
}

function openAttachmentModal() {
  uploadFiles.value = [];
  attachmentForm.reset();
  showAttachmentModal.value = true;
}

function closeAttachmentModal() {
  uploadFiles.value = [];
  attachmentForm.reset();
  showAttachmentModal.value = false;
}

async function submitAttachment() {
  await attachmentForm.handleSubmit(async (values) => {
    try {
      const fd = new FormData();
      if (values.file) fd.append('file', values.file, values.file.name);
      if (values.description && values.description.trim()) {
        fd.append('description', values.description.trim());
      }
      const created = await tasks.createAttachment(props.id, fd);
      attachments.value = [created, ...attachments.value];
      toast.success('Anexo enviado com sucesso.');
      closeAttachmentModal();
    } catch (e) {
      toast.error(e.message || 'Erro ao enviar anexo. Tente novamente.');
    }
  });
}

// ─── helpers de domínio ────────────────────────────────────────────────────
function priorityLabel(p) {
  const map = { baixa: 'Baixa', media: 'Média', alta: 'Alta', critica: 'Crítica' };
  return map[p] || p || '—';
}

function roleLabel(r) {
  const map = { admin: 'Admin', manager: 'Gestor', member: 'Membro' };
  return map[r] || r || '';
}

function entityTypeLabel(type) {
  if (type === 'pf') return 'Pessoa Física (PF)';
  if (type === 'pj') return 'Pessoa Jurídica (PJ)';
  if (type === 'document') return 'Documento';
  return type || '—';
}

function avatarInitial(name) {
  if (!name) return 'U';
  return String(name).trim().charAt(0).toUpperCase();
}

function isOverdue(dueAt) {
  if (!dueAt) return false;
  return new Date(dueAt) < new Date();
}

function isDueSoon(dueAt) {
  if (!dueAt) return false;
  const diff = new Date(dueAt) - new Date();
  return diff > 0 && diff < 48 * 60 * 60 * 1000; // próximas 48h
}

function fileIcon(mime) {
  if (!mime) return '📄';
  if (mime.startsWith('image/')) return '🖼';
  if (mime.includes('pdf')) return '📕';
  if (mime.includes('spreadsheet') || mime.includes('excel') || mime.includes('csv')) return '📊';
  if (mime.includes('word') || mime.includes('document')) return '📝';
  if (mime.includes('zip') || mime.includes('compressed')) return '🗜';
  if (mime.includes('xml')) return '📋';
  return '📄';
}

function shortMime(mime) {
  if (!mime) return '';
  const ext = mime.split('/').pop().toUpperCase().replace('VND.OPENXMLFORMATS-OFFICEDOCUMENT.', '');
  return ext.length > 12 ? ext.slice(0, 12) : ext;
}

function formatBytes(bytes) {
  if (bytes == null || bytes === '') return '—';
  const n = Number(bytes);
  if (!isFinite(n) || n < 0) return '—';
  if (n === 0) return '0 B';
  if (n < 1024) return n + ' B';
  if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
  if (n < 1024 * 1024 * 1024) return (n / (1024 * 1024)).toFixed(2) + ' MB';
  return (n / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
}

// ─── init ──────────────────────────────────────────────────────────────────
onMounted(async () => {
  await loadTask();
  loadComments();
  loadAttachments();
});
</script>

<style scoped>
/* ── layout principal: coluna larga + sidebar ── */
.task-layout {
  display: grid;
  grid-template-columns: 1fr 320px;
  gap: var(--ui-space-4);
  align-items: start;
}

@media (max-width: 860px) {
  .task-layout {
    grid-template-columns: 1fr;
  }
}

/* ── coluna principal ── */
.task-main {
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-4);
}

/* ── descrição ── */
.task-description {
  margin: 0;
  color: rgb(var(--ui-fg));
  font-size: var(--ui-text-sm);
  line-height: 1.7;
  white-space: pre-wrap;
  word-break: break-word;
}

.task-no-description {
  margin: 0;
  color: rgb(var(--ui-muted));
  font-size: var(--ui-text-sm);
  font-style: italic;
}

/* ── estados sub-recurso ── */
.sub-state {
  padding: var(--ui-space-4) 0;
}

/* ── thread de comentários ── */
.comment-thread {
  list-style: none;
  margin: 0 0 var(--ui-space-5);
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-4);
}

.comment-item {
  display: flex;
  gap: var(--ui-space-3);
  align-items: flex-start;
}

.comment-avatar {
  flex-shrink: 0;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: rgb(var(--ui-accent) / 0.14);
  color: rgb(var(--ui-accent-strong));
  font-weight: 700;
  font-size: var(--ui-text-sm);
  display: flex;
  align-items: center;
  justify-content: center;
  letter-spacing: 0;
}

.comment-bubble {
  flex: 1;
  background: rgb(var(--ui-surface-2));
  border: 1px solid rgb(var(--ui-border));
  border-radius: var(--ui-radius-md);
  padding: var(--ui-space-3) var(--ui-space-4);
  min-width: 0;
}

.comment-meta {
  display: flex;
  align-items: center;
  gap: var(--ui-space-3);
  margin-bottom: var(--ui-space-2);
  flex-wrap: wrap;
}

.comment-author {
  font-weight: 700;
  font-size: var(--ui-text-sm);
  color: rgb(var(--ui-fg));
}

.comment-time {
  font-size: var(--ui-text-xs);
  color: rgb(var(--ui-muted));
  font-variant-numeric: tabular-nums;
}

.comment-body {
  margin: 0;
  font-size: var(--ui-text-sm);
  color: rgb(var(--ui-fg));
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-word;
}

/* ── formulário de comentário ── */
.comment-form {
  border-top: 1px solid rgb(var(--ui-border));
  padding-top: var(--ui-space-4);
  margin-top: var(--ui-space-4);
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-3);
}

.comment-form-actions {
  display: flex;
  justify-content: flex-end;
}

/* ── lista de anexos ── */
.attachment-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-2);
}

.attachment-item {
  display: flex;
  align-items: center;
  gap: var(--ui-space-3);
  padding: var(--ui-space-3) var(--ui-space-4);
  border: 1px solid rgb(var(--ui-border));
  border-radius: var(--ui-radius-md);
  background: rgb(var(--ui-surface-2));
  transition: border-color 0.12s;
}

.attachment-item:hover {
  border-color: rgb(var(--ui-accent) / 0.4);
}

.attachment-icon {
  font-size: 1.4rem;
  flex-shrink: 0;
  line-height: 1;
}

.attachment-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-1);
}

.attachment-name {
  font-size: var(--ui-text-sm);
  font-weight: 600;
  color: rgb(var(--ui-fg));
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.attachment-meta {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--ui-space-2);
}

.attachment-size,
.attachment-version,
.attachment-date,
.attachment-uploader {
  font-size: var(--ui-text-xs);
  color: rgb(var(--ui-muted));
  font-variant-numeric: tabular-nums;
}

.attachment-version {
  font-weight: 700;
  color: rgb(var(--ui-accent-strong));
  background: rgb(var(--ui-accent) / 0.1);
  border-radius: var(--ui-radius-pill);
  padding: var(--ui-space-1) var(--ui-space-2);
}

.attachment-actions {
  flex-shrink: 0;
}

.attachment-type-tag {
  display: inline-block;
  font-size: 10px;
  font-family: monospace;
  font-weight: 600;
  letter-spacing: 0.04em;
  color: rgb(var(--ui-muted));
  background: rgb(var(--ui-surface));
  border: 1px solid rgb(var(--ui-border));
  border-radius: var(--ui-radius-sm);
  padding: var(--ui-space-1) var(--ui-space-2);
  max-width: 80px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* ── sidebar de metadados ── */
.task-sidebar {
  position: sticky;
  top: var(--ui-space-5);
}

.sidebar-meta {
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-3);
}

.sidebar-meta-item {
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-1);
}

.sidebar-meta-item--divider {
  border-top: 1px solid rgb(var(--ui-border));
  margin: var(--ui-space-1) 0 0;
  padding: 0;
  gap: 0;
}

.sidebar-meta dt {
  color: rgb(var(--ui-muted));
  font-size: var(--ui-text-xs);
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.07em;
}

.sidebar-meta dd {
  margin: 0;
  font-size: var(--ui-text-sm);
  color: rgb(var(--ui-fg));
}

/* ── prioridade badge ── */
.priority-badge {
  display: inline-flex;
  align-items: center;
  gap: var(--ui-space-1);
  font-size: var(--ui-text-xs);
  font-weight: 700;
  border-radius: var(--ui-radius-pill);
  padding: var(--ui-space-1) var(--ui-space-3);
  text-transform: capitalize;
}

.priority-badge[data-priority="baixa"] {
  background: rgb(var(--ui-ok) / 0.13);
  color: rgb(var(--ui-ok));
}

.priority-badge[data-priority="media"] {
  background: rgb(var(--ui-warn) / 0.14);
  color: rgb(var(--ui-warn));
}

.priority-badge[data-priority="alta"] {
  background: rgb(var(--ui-danger) / 0.13);
  color: rgb(var(--ui-danger));
}

.priority-badge[data-priority="critica"] {
  background: rgb(var(--ui-danger));
  color: rgb(var(--ui-accent-fg));
  letter-spacing: 0.04em;
}

.priority-badge:not([data-priority]) {
  background: rgb(var(--ui-muted) / 0.12);
  color: rgb(var(--ui-muted));
}

/* ── responsável ── */
.assignee-cell {
  display: flex;
  align-items: center;
  gap: var(--ui-space-2);
  flex-wrap: wrap;
}

.assignee-avatar {
  width: 26px;
  height: 26px;
  border-radius: 50%;
  background: rgb(var(--ui-accent) / 0.14);
  color: rgb(var(--ui-accent-strong));
  font-weight: 700;
  font-size: var(--ui-text-xs);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.assignee-name {
  font-size: var(--ui-text-sm);
  color: rgb(var(--ui-fg));
  font-weight: 600;
}

.assignee-role {
  font-size: var(--ui-text-xs);
  color: rgb(var(--ui-muted));
  background: rgb(var(--ui-surface-2));
  border: 1px solid rgb(var(--ui-border));
  border-radius: var(--ui-radius-pill);
  padding: var(--ui-space-1) var(--ui-space-2);
}

/* ── prazo ── */
.due-value {
  font-size: var(--ui-text-sm);
  font-variant-numeric: tabular-nums;
}

.due-value[data-overdue="true"] {
  color: rgb(var(--ui-danger));
  font-weight: 700;
}

.due-value[data-soon="true"]:not([data-overdue="true"]) {
  color: rgb(var(--ui-warn));
  font-weight: 600;
}

.muted-dash {
  color: rgb(var(--ui-muted));
}

/* ── entidade pill ── */
.entity-pill {
  display: inline-flex;
  align-items: center;
  gap: var(--ui-space-1);
  font-size: var(--ui-text-xs);
  font-weight: 600;
  border-radius: var(--ui-radius-pill);
  padding: var(--ui-space-1) var(--ui-space-3);
}

.entity-pill[data-kind="pf"] {
  background: rgb(var(--ui-ok) / 0.12);
  color: rgb(var(--ui-ok));
}

.entity-pill[data-kind="pj"] {
  background: rgb(var(--ui-warn) / 0.14);
  color: rgb(var(--ui-warn));
}

.entity-pill:not([data-kind="pf"]):not([data-kind="pj"]) {
  background: rgb(var(--ui-muted) / 0.1);
  color: rgb(var(--ui-muted));
}

.entity-id {
  font-weight: 400;
  opacity: 0.7;
}

/* ── datas e ID ── */
.date-value {
  font-variant-numeric: tabular-nums;
  font-size: var(--ui-text-sm);
}

.id-value {
  font-family: monospace;
  font-size: var(--ui-text-xs);
  color: rgb(var(--ui-muted));
  word-break: break-all;
}

/* ── modais: formulários ── */
.modal-form {
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-4);
}

/* select nativo com tokens (sem UiSelect no kit) */
.ui-select {
  width: 100%;
  box-sizing: border-box;
  padding: var(--ui-space-2) var(--ui-space-3);
  border: 1px solid rgb(var(--ui-border-strong));
  border-radius: var(--ui-radius-sm);
  background: rgb(var(--ui-bg));
  color: rgb(var(--ui-fg));
  font: inherit;
  font-size: var(--ui-text-md);
  line-height: 1.5;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
  appearance: auto;
}

.ui-select:focus {
  outline: none;
  border-color: rgb(var(--ui-accent));
  box-shadow: 0 0 0 3px rgb(var(--ui-accent) / 0.15);
}

.ui-select[aria-invalid="true"] {
  border-color: rgb(var(--ui-danger));
}

.ui-select[aria-invalid="true"]:focus {
  box-shadow: 0 0 0 3px rgb(var(--ui-danger) / 0.15);
}
</style>
