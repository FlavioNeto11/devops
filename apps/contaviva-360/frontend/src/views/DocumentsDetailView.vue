<template>
  <UiPageLayout
    eyebrow="Documentos Fiscais"
    :title="doc ? doc.tipo || 'Documento' : 'Detalhe do Documento'"
    :subtitle="doc ? subtitleText : ''"
    width="default"
    :loading="loadingDoc"
    :error="docError ? (docError.message || 'Erro ao carregar documento') : null"
    @retry="loadDoc"
  >
    <template #actions>
      <UiButton variant="ghost" to="/documents">Voltar à lista</UiButton>
      <UiButton variant="subtle" @click="openStatusEditor">Editar status</UiButton>
      <UiButton variant="primary" @click="openVersionUpload">Nova versão</UiButton>
    </template>

    <!-- ── CONTEÚDO NORMAL ─────────────────────────────────────────── -->
    <template v-if="doc">
      <div class="detail-grid">
        <!-- Metadados do documento -->
        <UiCard title="Metadados do Documento">
          <template #actions>
            <UiStatusBadge :status="doc.status" size="lg" with-dot />
          </template>

          <dl class="meta-grid">
            <div class="meta-item">
              <dt>Tipo</dt>
              <dd>
                <span class="tipo-tag">{{ doc.tipo || '—' }}</span>
              </dd>
            </div>

            <div class="meta-item">
              <dt>Entidade</dt>
              <dd>
                <span class="entity-pill" :data-kind="doc.entity_type">
                  {{ entityTypeLabel(doc.entity_type) }}
                  <span v-if="doc.entity_id" class="entity-id">#{{ doc.entity_id }}</span>
                </span>
              </dd>
            </div>

            <div class="meta-item">
              <dt>Período de Referência</dt>
              <dd class="period-value">
                <span v-if="doc.mes && doc.ano">
                  {{ mesPadded(doc.mes) }}/{{ doc.ano }}
                </span>
                <span v-else class="muted-dash">—</span>
              </dd>
            </div>

            <div class="meta-item">
              <dt>Arquivo</dt>
              <dd class="filename-value">{{ doc.filename || '—' }}</dd>
            </div>

            <div class="meta-item">
              <dt>Tipo de Conteúdo</dt>
              <dd>
                <span v-if="doc.content_type" class="content-type-tag">{{ doc.content_type }}</span>
                <span v-else class="muted-dash">—</span>
              </dd>
            </div>

            <div class="meta-item">
              <dt>Tamanho</dt>
              <dd class="size-value">{{ formatBytes(doc.file_size) }}</dd>
            </div>

            <div class="meta-item">
              <dt>Criado em</dt>
              <dd class="date-value">{{ format.formatDateTime(doc.created_at) }}</dd>
            </div>

            <div class="meta-item">
              <dt>Atualizado em</dt>
              <dd class="date-value">{{ format.formatDateTime(doc.updated_at) }}</dd>
            </div>

            <div v-if="doc.id" class="meta-item meta-item--full">
              <dt>ID do Documento</dt>
              <dd class="id-value">{{ doc.id }}</dd>
            </div>
          </dl>
        </UiCard>

        <!-- Timeline de versões -->
        <UiCard title="Histórico de Versões" :subtitle="versionsSubtitle">
          <template #actions>
            <UiButton variant="subtle" size="sm" @click="loadVersions">Atualizar</UiButton>
          </template>

          <!-- Loading de versões -->
          <div v-if="loadingVersions" class="versions-loading">
            <UiLoadingState variant="skeleton" :skeleton-lines="4" />
          </div>

          <!-- Erro de versões -->
          <div v-else-if="versionsError" class="versions-error">
            <UiErrorState
              :message="versionsError.message || 'Erro ao carregar versões'"
              :retryable="true"
              @retry="loadVersions"
            />
          </div>

          <!-- Vazio -->
          <div v-else-if="versions.length === 0" class="versions-empty">
            <UiEmptyState
              title="Nenhuma versão"
              description="Envie a primeira versão deste documento usando o botão acima."
              icon="📄"
            >
              <template #action>
                <UiButton variant="primary" @click="openVersionUpload">Enviar versão</UiButton>
              </template>
            </UiEmptyState>
          </div>

          <!-- Timeline -->
          <ol v-else class="version-timeline" aria-label="Histórico de versões">
            <li
              v-for="(ver, idx) in versions"
              :key="ver.id || idx"
              class="version-item"
              :data-latest="idx === 0 ? 'true' : 'false'"
            >
              <div class="version-connector" aria-hidden="true">
                <span class="version-dot" :data-latest="idx === 0 ? 'true' : 'false'" />
                <span v-if="idx < versions.length - 1" class="version-line" />
              </div>

              <div class="version-content">
                <div class="version-header">
                  <div class="version-identity">
                    <span class="version-number" :data-latest="idx === 0 ? 'true' : 'false'">
                      v{{ versions.length - idx }}
                    </span>
                    <span v-if="idx === 0" class="version-latest-badge">Atual</span>
                  </div>
                  <time class="version-date" :datetime="ver.created_at">
                    {{ format.formatDateTime(ver.created_at) }}
                  </time>
                </div>

                <div class="version-meta">
                  <div v-if="ver.filename" class="version-file">
                    <span class="version-file-icon" aria-hidden="true">📎</span>
                    <span class="version-file-name">{{ ver.filename }}</span>
                  </div>

                  <div class="version-stats">
                    <span v-if="ver.file_size != null" class="version-stat">
                      <span class="version-stat-label">Tamanho</span>
                      <span class="version-stat-value">{{ formatBytes(ver.file_size) }}</span>
                    </span>
                    <span v-if="ver.content_type" class="version-stat">
                      <span class="version-stat-label">Tipo</span>
                      <span class="version-stat-value version-content-type">{{ ver.content_type }}</span>
                    </span>
                    <span v-if="ver.uploaded_by || ver.user_id" class="version-stat">
                      <span class="version-stat-label">Enviado por</span>
                      <span class="version-stat-value">{{ ver.uploaded_by || ver.user_id }}</span>
                    </span>
                  </div>
                </div>
              </div>
            </li>
          </ol>
        </UiCard>
      </div>
    </template>

    <!-- ── MODAL: EDITAR STATUS ────────────────────────────────────── -->
    <UiModal
      :open="showStatusEditor"
      title="Editar Status do Documento"
      width="sm"
      persistent
      @update:open="showStatusEditor = $event"
    >
      <form class="status-form" @submit.prevent="submitStatus">
        <UiFormSection title="Novo Status" description="Selecione o status que deseja aplicar ao documento." :columns="1">
          <UiFormField label="Status" :required="true" :error="statusForm.errors.status">
            <template #default="{ id, describedBy }">
              <select
                class="ui-input"
                :id="id"
                :aria-describedby="describedBy"
                :value="statusForm.values.status"
                @change="statusForm.setField('status', $event.target.value)"
              >
                <option value="">Selecione um status…</option>
                <option value="pendente">Pendente</option>
                <option value="enviado">Enviado</option>
                <option value="processando">Processando</option>
                <option value="aprovado">Aprovado</option>
                <option value="rejeitado">Rejeitado</option>
                <option value="cancelado">Cancelado</option>
              </select>
            </template>
          </UiFormField>
        </UiFormSection>
      </form>

      <template #footer>
        <UiButton variant="ghost" type="button" @click="showStatusEditor = false">Cancelar</UiButton>
        <UiButton
          variant="primary"
          :loading="statusForm.submitting.value"
          @click="submitStatus"
        >
          Salvar status
        </UiButton>
      </template>
    </UiModal>

    <!-- ── MODAL: NOVA VERSÃO ──────────────────────────────────────── -->
    <UiModal
      :open="showVersionUpload"
      title="Enviar Nova Versão"
      width="md"
      persistent
      @update:open="showVersionUpload = $event"
    >
      <form class="version-form" @submit.prevent="submitVersion">
        <UiFormSection
          title="Arquivo da Versão"
          description="Envie o arquivo desta versão do documento. O histórico anterior é preservado."
          :columns="1"
        >
          <UiFormField label="Arquivo" :required="true" :error="versionForm.errors.file">
            <template #default="{ id }">
              <UiFileDrop
                :id="id"
                v-model="uploadFiles"
                :multiple="false"
                label="Arraste o arquivo aqui ou clique para escolher"
                hint="PDF, XML, XLS, DOC e outros formatos suportados. Máximo 1 arquivo por versão."
                accept=".pdf,.xml,.xls,.xlsx,.doc,.docx,.csv,.txt,.zip"
                @change="onFileChange"
              />
            </template>
          </UiFormField>

          <UiFormField label="Nome do Arquivo (opcional)" :error="versionForm.errors.filename">
            <template #default="{ id, describedBy }">
              <input
                :id="id"
                :aria-describedby="describedBy"
                type="text"
                :value="versionForm.values.filename"
                placeholder="Ex: sped-fiscal-2025-01.xml"
                @input="versionForm.setField('filename', $event.target.value)"
              />
            </template>
          </UiFormField>
        </UiFormSection>
      </form>

      <template #footer>
        <UiButton variant="ghost" type="button" @click="closeVersionUpload">Cancelar</UiButton>
        <UiButton
          variant="primary"
          :loading="versionForm.submitting.value"
          @click="submitVersion"
        >
          Enviar versão
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
  useForm,
  useToast,
  validators,
  format,
} from '../ui/index.js';
import { documents, listVersions, createVersion } from '../api.js';

// ─── props ─────────────────────────────────────────────────────────────────
const props = defineProps({
  id: { type: String, required: true },
});

// ─── composables ───────────────────────────────────────────────────────────
const toast = useToast();

// ─── estado do documento ───────────────────────────────────────────────────
const doc = ref(null);
const loadingDoc = ref(true);
const docError = ref(null);

async function loadDoc() {
  loadingDoc.value = true;
  docError.value = null;
  try {
    doc.value = await documents.get(props.id);
  } catch (e) {
    docError.value = e;
  } finally {
    loadingDoc.value = false;
  }
}

// ─── estado das versões ────────────────────────────────────────────────────
const versions = ref([]);
const loadingVersions = ref(false);
const versionsError = ref(null);

async function loadVersions() {
  loadingVersions.value = true;
  versionsError.value = null;
  try {
    versions.value = await listVersions(props.id);
  } catch (e) {
    versionsError.value = e;
    versions.value = [];
  } finally {
    loadingVersions.value = false;
  }
}

// ─── computed helpers ──────────────────────────────────────────────────────
const subtitleText = computed(() => {
  if (!doc.value) return '';
  const parts = [];
  if (doc.value.entity_type) parts.push(entityTypeLabel(doc.value.entity_type));
  if (doc.value.entity_id) parts.push('#' + doc.value.entity_id);
  if (doc.value.mes && doc.value.ano) parts.push(mesPadded(doc.value.mes) + '/' + doc.value.ano);
  return parts.join(' · ');
});

const versionsSubtitle = computed(() => {
  const n = versions.value.length;
  if (n === 0) return 'Nenhuma versão enviada';
  return n === 1 ? '1 versão no histórico' : n + ' versões no histórico';
});

// ─── modal: editar status ──────────────────────────────────────────────────
const showStatusEditor = ref(false);

const statusForm = useForm({
  initial: { status: '' },
  rules: { status: [validators.required('Selecione um status')] },
});

function openStatusEditor() {
  statusForm.setField('status', doc.value ? (doc.value.status || '') : '');
  showStatusEditor.value = true;
}

async function submitStatus() {
  await statusForm.handleSubmit(async (values) => {
    try {
      const updated = await documents.update(props.id, { status: values.status });
      if (doc.value) doc.value = { ...doc.value, ...updated, status: updated.status || values.status };
      toast.success('Status atualizado com sucesso.');
      showStatusEditor.value = false;
    } catch (e) {
      toast.error(e.message || 'Erro ao atualizar status. Tente novamente.');
    }
  });
}

// ─── modal: nova versão ────────────────────────────────────────────────────
const showVersionUpload = ref(false);
const uploadFiles = ref([]);

const versionForm = useForm({
  initial: { filename: '', file: null },
  rules: { file: [validators.required('Selecione um arquivo para a nova versão')] },
});

function onFileChange(files) {
  const f = files && files.length ? files[0] : null;
  versionForm.setField('file', f);
  if (f && !versionForm.values.filename) {
    versionForm.setField('filename', f.name);
  }
}

function openVersionUpload() {
  uploadFiles.value = [];
  versionForm.reset();
  showVersionUpload.value = true;
}

function closeVersionUpload() {
  uploadFiles.value = [];
  versionForm.reset();
  showVersionUpload.value = false;
}

async function submitVersion() {
  await versionForm.handleSubmit(async (values) => {
    try {
      const fd = new FormData();
      if (values.file) fd.append('file', values.file, values.file.name);
      if (values.filename && values.filename.trim()) fd.append('filename', values.filename.trim());

      await createVersion(props.id, fd);

      toast.success('Nova versão enviada com sucesso.');
      closeVersionUpload();
      // recarrega doc e versões
      loadDoc();
      loadVersions();
    } catch (e) {
      toast.error(e.message || 'Erro ao enviar versão. Tente novamente.');
    }
  });
}

// ─── helpers ───────────────────────────────────────────────────────────────
function entityTypeLabel(type) {
  if (type === 'pf') return 'Pessoa Física (PF)';
  if (type === 'pj') return 'Pessoa Jurídica (PJ)';
  return type || '—';
}

function mesPadded(mes) {
  return String(mes).padStart(2, '0');
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
  await loadDoc();
  loadVersions();
});
</script>

<style scoped>
/* ── layout de duas colunas (metadados + timeline) ── */
.detail-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--ui-space-4);
  align-items: start;
}

@media (max-width: 860px) {
  .detail-grid {
    grid-template-columns: 1fr;
  }
}

/* ── meta-grid: tabela de definições ── */
.meta-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--ui-space-3) var(--ui-space-5);
  margin: 0;
}

@media (max-width: 480px) {
  .meta-grid {
    grid-template-columns: 1fr;
  }
}

.meta-item {
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-1);
}

.meta-item--full {
  grid-column: 1 / -1;
}

.meta-grid dt {
  color: rgb(var(--ui-muted));
  font-size: var(--ui-text-xs);
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

.meta-grid dd {
  margin: 0;
  font-size: var(--ui-text-sm);
  color: rgb(var(--ui-fg));
}

/* ── tipo tag ── */
.tipo-tag {
  display: inline-block;
  font-size: var(--ui-text-xs);
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: rgb(var(--ui-accent-strong));
  background: rgb(var(--ui-accent) / 0.12);
  border-radius: var(--ui-radius-sm);
  padding: 3px 10px;
  white-space: nowrap;
}

/* ── entidade pill ── */
.entity-pill {
  display: inline-flex;
  align-items: center;
  gap: var(--ui-space-1);
  font-size: var(--ui-text-xs);
  font-weight: 600;
  border-radius: var(--ui-radius-pill);
  padding: 3px 10px;
  white-space: nowrap;
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
  background: rgb(var(--ui-muted) / 0.12);
  color: rgb(var(--ui-muted));
}

.entity-id {
  font-weight: 400;
  opacity: 0.7;
}

/* ── valores numéricos/datas ── */
.period-value,
.date-value,
.size-value {
  font-variant-numeric: tabular-nums;
}

.muted-dash {
  color: rgb(var(--ui-muted));
}

.filename-value {
  font-family: monospace;
  font-size: var(--ui-text-xs);
  word-break: break-all;
  color: rgb(var(--ui-fg));
}

.content-type-tag {
  display: inline-block;
  font-size: var(--ui-text-xs);
  font-family: monospace;
  background: rgb(var(--ui-surface-2));
  border: 1px solid rgb(var(--ui-border));
  border-radius: var(--ui-radius-sm);
  padding: 1px 7px;
  color: rgb(var(--ui-muted));
}

.id-value {
  font-family: monospace;
  font-size: var(--ui-text-xs);
  color: rgb(var(--ui-muted));
  word-break: break-all;
}

/* ── loading/erro de versões ── */
.versions-loading,
.versions-error,
.versions-empty {
  padding: var(--ui-space-4) 0;
}

/* ── timeline ── */
.version-timeline {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
}

.version-item {
  display: flex;
  gap: var(--ui-space-3);
  min-height: 72px;
}

/* ── conector (ponto + linha vertical) ── */
.version-connector {
  display: flex;
  flex-direction: column;
  align-items: center;
  flex-shrink: 0;
  width: 18px;
  padding-top: 3px;
}

.version-dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  border: 2px solid rgb(var(--ui-border));
  background: rgb(var(--ui-surface));
  flex-shrink: 0;
  transition: border-color 0.15s;
}

.version-dot[data-latest="true"] {
  border-color: rgb(var(--ui-accent));
  background: rgb(var(--ui-accent));
  box-shadow: 0 0 0 3px rgb(var(--ui-accent) / 0.18);
}

.version-line {
  flex: 1;
  width: 2px;
  background: rgb(var(--ui-border));
  margin-top: 4px;
}

/* ── conteúdo da versão ── */
.version-content {
  flex: 1;
  padding-bottom: var(--ui-space-4);
  min-width: 0;
}

.version-item:last-child .version-content {
  padding-bottom: 0;
}

.version-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ui-space-2);
  flex-wrap: wrap;
  margin-bottom: var(--ui-space-2);
}

.version-identity {
  display: flex;
  align-items: center;
  gap: var(--ui-space-2);
}

.version-number {
  font-size: var(--ui-text-sm);
  font-weight: 700;
  color: rgb(var(--ui-muted));
  font-variant-numeric: tabular-nums;
}

.version-number[data-latest="true"] {
  color: rgb(var(--ui-accent-strong));
}

.version-latest-badge {
  display: inline-block;
  font-size: var(--ui-text-xs);
  font-weight: 700;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: rgb(var(--ui-accent-strong));
  background: rgb(var(--ui-accent) / 0.12);
  border-radius: var(--ui-radius-pill);
  padding: 1px 8px;
}

.version-date {
  font-size: var(--ui-text-xs);
  color: rgb(var(--ui-muted));
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

/* ── meta da versão ── */
.version-meta {
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-1);
}

.version-file {
  display: flex;
  align-items: center;
  gap: var(--ui-space-1);
  font-size: var(--ui-text-sm);
}

.version-file-icon {
  flex-shrink: 0;
  font-size: 0.9rem;
}

.version-file-name {
  font-family: monospace;
  font-size: var(--ui-text-xs);
  color: rgb(var(--ui-fg));
  word-break: break-all;
}

.version-stats {
  display: flex;
  flex-wrap: wrap;
  gap: var(--ui-space-3);
}

.version-stat {
  display: flex;
  align-items: center;
  gap: var(--ui-space-1);
  font-size: var(--ui-text-xs);
}

.version-stat-label {
  color: rgb(var(--ui-muted));
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  font-size: var(--ui-text-xs);
}

.version-stat-value {
  color: rgb(var(--ui-fg));
  font-variant-numeric: tabular-nums;
}

.version-content-type {
  font-family: monospace;
  font-size: var(--ui-text-xs);
}

/* ── formulários nos modais ── */
.status-form,
.version-form {
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-4);
}
</style>
