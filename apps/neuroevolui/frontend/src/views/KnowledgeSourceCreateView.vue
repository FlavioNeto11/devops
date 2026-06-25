<template>
  <UiPageLayout
    eyebrow="RAG · Base de conhecimento"
    title="Adicionar fonte de conhecimento"
    subtitle="Envie um arquivo (PDF, TXT, CSV, DOCX) ou cole o conteúdo textual. A indexação roda em segundo plano — chunking + embedding — e a fonte passa a alimentar as citações do assistente."
    width="narrow"
  >
    <template #actions>
      <UiButton variant="ghost" to="/knowledge-sources">Voltar à lista</UiButton>
    </template>

    <!-- Banner: pipeline fail-soft -->
    <template #banner>
      <div class="ksc-note" role="note" aria-label="Sobre a indexação">
        <span class="ksc-note-icon" aria-hidden="true">◴</span>
        <p class="ksc-note-text">
          A indexação roda em segundo plano via pgvector. Se o índice vetorial estiver
          temporariamente indisponível, a fonte é registrada e reprocessada automaticamente
          quando o serviço voltar.
        </p>
      </div>
    </template>

    <!-- ESTADO: notas de ingestão retornadas pelo servidor após o envio -->
    <UiModal
      v-model:open="showIngestNotes"
      title="Fonte registrada — avisos de ingestão"
      width="md"
      persistent
    >
      <div class="ksc-ingest-body">
        <p class="ksc-ingest-intro">
          A fonte foi registrada com sucesso, mas o servidor retornou os seguintes avisos
          durante a ingestão (ex.: páginas ignoradas, chunks vazios):
        </p>
        <ul class="ksc-ingest-list" aria-label="Avisos de ingestão">
          <li v-for="(note, i) in ingestNotes" :key="i" class="ksc-ingest-item">
            <span class="ksc-ingest-bullet" aria-hidden="true">⚠</span>
            <span>{{ note }}</span>
          </li>
        </ul>
      </div>
      <template #footer>
        <UiButton @click="dismissIngestNotes">Ir para a lista</UiButton>
      </template>
    </UiModal>

    <!-- Formulário principal -->
    <form class="ksc-form" novalidate @submit.prevent="submit">

      <!-- Resumo ao vivo -->
      <section class="ksc-summary" aria-label="Resumo da fonte">
        <UiMetricCard
          label="Título"
          :value="titleSummary"
          tone="primary"
          hint="Identificação da fonte"
        />
        <UiMetricCard
          label="Trechos estimados"
          :value="estChunksDisplay"
          :tone="hasSource ? 'neutral' : 'faint'"
          :hint="mode === 'file' ? 'Calculado na ingestão' : 'Aprox. 1 000 char/trecho'"
        />
        <UiMetricCard
          label="Tamanho"
          :value="approxBytes"
          :tone="sizeWarning ? 'warning' : 'neutral'"
          :hint="sizeWarning ? 'Arquivo grande — pode demorar' : 'Conteúdo a indexar'"
        />
        <UiMetricCard
          label="Estado inicial"
          :value="indexStateLabel"
          :tone="hasSource ? 'warning' : 'neutral'"
          hint="Muda para indexada após o pipeline"
        />
      </section>

      <!-- Card: Modo de entrada -->
      <UiCard
        title="Origem do conteúdo"
        subtitle="Escolha como o conteúdo desta fonte vai entrar na base de conhecimento."
      >
        <!-- Seletor de modo: radios acessíveis -->
        <div class="ksc-modes" role="radiogroup" aria-label="Modo de entrada do conteúdo">
          <button
            type="button"
            class="ksc-mode"
            :data-active="mode === 'file' ? 'true' : 'false'"
            role="radio"
            :aria-checked="mode === 'file' ? 'true' : 'false'"
            @click="setMode('file')"
          >
            <span class="ksc-mode-icon" aria-hidden="true">⬆</span>
            <span class="ksc-mode-body">
              <span class="ksc-mode-title">Enviar arquivo</span>
              <span class="ksc-mode-sub">PDF, TXT, CSV, DOCX (até 20 MB)</span>
            </span>
          </button>
          <button
            type="button"
            class="ksc-mode"
            :data-active="mode === 'text' ? 'true' : 'false'"
            role="radio"
            :aria-checked="mode === 'text' ? 'true' : 'false'"
            @click="setMode('text')"
          >
            <span class="ksc-mode-icon" aria-hidden="true">¶</span>
            <span class="ksc-mode-body">
              <span class="ksc-mode-title">Colar texto</span>
              <span class="ksc-mode-sub">Cole o conteúdo diretamente no campo</span>
            </span>
          </button>
        </div>

        <!-- Painel: upload de arquivo -->
        <div v-if="mode === 'file'" class="ksc-pane">
          <UiFormField
            label="Arquivo da fonte"
            :required="true"
            :error="fileError"
            hint="Um arquivo por fonte. PDFs têm o texto extraído automaticamente na ingestão."
          >
            <template #default>
              <UiFileDrop
                v-model="files"
                :multiple="false"
                accept=".txt,.md,.csv,.pdf,.doc,.docx"
                label="Arraste o documento aqui ou clique para escolher"
                hint="Texto puro é indexado direto; PDFs têm o texto extraído na ingestão."
                @change="onFileChange"
              />
            </template>
          </UiFormField>
        </div>

        <!-- Painel: texto colado -->
        <div v-else class="ksc-pane">
          <UiFormField
            label="Conteúdo"
            :required="true"
            :error="f.errors.content"
            :hint="contentHint"
            full-width
          >
            <template #default="{ id, describedBy }">
              <textarea
                :id="id"
                class="ksc-textarea"
                :aria-describedby="describedBy || undefined"
                :aria-invalid="f.errors.content ? 'true' : undefined"
                :value="f.values.content"
                placeholder="Cole aqui o texto da fonte (manual, política, FAQ, transcrição, protocolo clínico…)"
                rows="12"
                @input="onContentInput"
              ></textarea>
            </template>
          </UiFormField>
          <p class="ksc-char-count" aria-live="polite">
            {{ format.formatNumber(contentLen) }} caracteres
            <span v-if="contentLen > 0">· ~{{ estChunks }} trecho(s) estimado(s)</span>
          </p>
        </div>
      </UiCard>

      <!-- Card: Metadados -->
      <UiCard
        title="Metadados da fonte"
        subtitle="Como esta fonte aparece e é citada nas respostas do assistente."
      >
        <UiFormSection :columns="2">
          <!-- Título (full-width, obrigatório) -->
          <UiFormField
            label="Título da fonte"
            :required="true"
            :error="f.errors.title"
            hint="Nome legível usado nas citações e na lista da base de conhecimento."
            full-width
          >
            <template #default="{ id, describedBy }">
              <UiInput
                :id="id"
                :described-by="describedBy"
                :model-value="f.values.title"
                :error="!!f.errors.title"
                :required="true"
                autocomplete="off"
                placeholder="Ex.: Manual de procedimentos clínicos v2"
                @update:model-value="f.setField('title', $event)"
              />
            </template>
          </UiFormField>

          <!-- ID da fonte -->
          <UiFormField
            label="ID da fonte"
            :error="f.errors.source_id"
            hint="Identificador estável (gerado automaticamente se deixado em branco)."
          >
            <template #default="{ id, describedBy }">
              <UiInput
                :id="id"
                :described-by="describedBy"
                :model-value="f.values.source_id"
                :error="!!f.errors.source_id"
                autocomplete="off"
                placeholder="ex.: manual-clinico-v2"
                @update:model-value="f.setField('source_id', $event)"
              />
            </template>
          </UiFormField>

          <!-- Modelo de embedding -->
          <UiFormField
            label="Modelo de embedding"
            hint="Modelo que vetoriza os trechos durante a indexação no servidor."
          >
            <template #default="{ id, describedBy }">
              <select
                :id="id"
                class="ksc-select"
                :aria-describedby="describedBy || undefined"
                :value="f.values.embedding_model"
                @change="f.setField('embedding_model', $event.target.value)"
              >
                <option v-for="m in embeddingModels" :key="m.value" :value="m.value">
                  {{ m.label }}
                </option>
              </select>
            </template>
          </UiFormField>
        </UiFormSection>
      </UiCard>

      <!-- Card: Pré-visualização de indexação -->
      <UiCard
        title="Pré-visualização da ingestão"
        subtitle="Estimativa do que entra na base. Chunks e hash definitivos são calculados no servidor durante o processamento real."
      >
        <!-- Estado vazio: sem conteúdo ainda -->
        <div v-if="!hasSource" class="ksc-preview-empty">
          <UiEmptyState
            title="Sem conteúdo ainda"
            description="Envie um arquivo ou cole um texto para visualizar a estimativa de indexação."
            icon="database"
          />
        </div>

        <!-- Estado preenchido: mostrar estimativas -->
        <div v-else class="ksc-preview" aria-label="Estimativa de indexação">
          <div class="ksc-stat">
            <span class="ksc-stat-value">{{ estChunksDisplay }}</span>
            <span class="ksc-stat-label">{{ estChunksLabel }}</span>
          </div>
          <div class="ksc-stat">
            <span class="ksc-stat-value">{{ approxBytes }}</span>
            <span class="ksc-stat-label">tamanho do conteúdo</span>
          </div>
          <div class="ksc-stat">
            <span class="ksc-stat-value ksc-stat-model">{{ embeddingModelShort }}</span>
            <span class="ksc-stat-label">modelo de embedding</span>
          </div>
          <div class="ksc-stat">
            <UiStatusBadge :status="indexState" :label="indexStateLabel" with-dot />
            <span class="ksc-stat-label">estado após o envio</span>
          </div>
        </div>

        <!-- Aviso de arquivo grande -->
        <div v-if="sizeWarning" class="ksc-size-warning" role="alert">
          <span class="ksc-warn-icon" aria-hidden="true">⚠</span>
          <span>Arquivo acima de 10 MB. A ingestão pode levar mais tempo que o usual.</span>
        </div>
      </UiCard>

      <!-- Rodapé de ações -->
      <div class="ksc-actions">
        <div class="ksc-actions-left">
          <UiButton
            variant="ghost"
            type="button"
            :disabled="f.submitting.value || !hasSource"
            @click="clearSource"
          >
            Limpar conteúdo
          </UiButton>
        </div>
        <div class="ksc-actions-right">
          <UiButton
            variant="ghost"
            type="button"
            :disabled="f.submitting.value"
            @click="cancel"
          >
            Cancelar
          </UiButton>
          <UiButton
            type="submit"
            :loading="f.submitting.value"
            :disabled="!hasSource && mode === 'file'"
          >
            Registrar e indexar
          </UiButton>
        </div>
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
  UiMetricCard,
  UiFormSection,
  UiFormField,
  UiInput,
  UiFileDrop,
  UiEmptyState,
  UiStatusBadge,
  UiModal,
  UiButton,
  useForm,
  useToast,
  useConfirm,
  validators,
  format,
} from '../ui/index.js';
import { knowledgeSources } from '../api.js';

// ── Router + composables ──────────────────────────────────────────────────────
const router = useRouter();
const toast = useToast();
const confirmAsk = useConfirm();

// ── Constantes de domínio ─────────────────────────────────────────────────────
// Aproximação do pipeline de chunking: ~1 000 caracteres por trecho.
// O número REAL de trechos (e o content_hash) são calculados no servidor — este
// valor é usado apenas para estimativa na tela, não é enviado ao backend.
const CHUNK_SIZE = 1000;

const embeddingModels = [
  { value: 'text-embedding-3-small', label: 'text-embedding-3-small (padrão)' },
  { value: 'text-embedding-3-large', label: 'text-embedding-3-large (maior contexto)' },
  { value: 'voyage-3', label: 'voyage-3' },
];

// ── Estado do upload de arquivo ───────────────────────────────────────────────
const files = ref([]);
const fileError = ref('');

// ── Modal de notas de ingestão ────────────────────────────────────────────────
// O backend retorna `ingest_notes[]` com avisos opcionais (páginas ignoradas, chunks
// vazios, etc.). Se vier preenchido, mostramos via modal antes de navegar.
const showIngestNotes = ref(false);
const ingestNotes = ref([]);

// ── Formulário ────────────────────────────────────────────────────────────────
// `mode` vive dentro do form para que a regra condicional de `content` seja resolvida
// automaticamente por validate() sem escrita manual em f.errors.
const contentRequiredInTextMode = (v, all) =>
  all && all.mode === 'text' && (!v || !String(v).trim())
    ? 'Cole algum conteúdo para indexar.'
    : '';

const f = useForm({
  initial: {
    title: '',
    source_id: '',
    content: '',
    embedding_model: embeddingModels[0].value,
    mode: 'file',
  },
  rules: {
    title: [
      validators.required('Informe um título para a fonte.'),
      validators.minLen(2, 'O título deve ter ao menos 2 caracteres.'),
      validators.maxLen(200, 'O título deve ter no máximo 200 caracteres.'),
    ],
    source_id: [
      validators.pattern(
        /^[a-z0-9][a-z0-9._-]*$/i,
        'Use somente letras, números, ponto, hífen ou sublinhado.',
      ),
    ],
    content: [contentRequiredInTextMode],
  },
});

// Atalho de leitura para o template — evita `f.values.mode` em todo lugar.
const mode = computed(() => f.values.mode);

function setMode(next) {
  if (f.values.mode === next) return;
  f.values.mode = next;
  fileError.value = '';
  // Limpa erro de content ao trocar de modo para não deixar erro órfão visível.
  delete f.errors.content;
}

// ── Derivados de fonte ────────────────────────────────────────────────────────
const activeFile = computed(() => (mode.value === 'file' ? (files.value[0] || null) : null));

const hasSource = computed(() =>
  mode.value === 'file'
    ? !!activeFile.value
    : f.values.content.trim().length > 0,
);

// Tamanho em bytes: arquivo → File.size real; texto → comprimento da string (aprox).
const sourceBytes = computed(() => {
  if (mode.value === 'file') return activeFile.value ? activeFile.value.size : 0;
  return new Blob([f.values.content || '']).size;
});

// Aviso visual para arquivos grandes (> 10 MB) — só informativo, não bloqueia o envio.
const sizeWarning = computed(() => sourceBytes.value > 10 * 1048576);

const approxBytes = computed(() => {
  const n = sourceBytes.value;
  if (!n) return '—';
  if (n < 1024) return n + ' B';
  if (n < 1048576) return (n / 1024).toFixed(0) + ' KB';
  return (n / 1048576).toFixed(1) + ' MB';
});

// Estimativa de trechos — só confiável no modo texto; no modo arquivo o texto extraído
// de um PDF é bem menor que o binário, então exibimos "na ingestão" no lugar do número.
const estChunks = computed(() =>
  hasSource.value ? Math.max(1, Math.ceil(sourceBytes.value / CHUNK_SIZE)) : 0,
);

const estChunksDisplay = computed(() => {
  if (!hasSource.value) return '—';
  if (mode.value === 'text') return '~' + format.formatNumber(estChunks.value);
  return 'na ingestão';
});

const estChunksLabel = computed(() =>
  mode.value === 'text' ? 'trechos estimados' : 'trechos (calculados na ingestão)',
);

const indexState = computed(() => (hasSource.value ? 'pending' : 'neutral'));
const indexStateLabel = computed(() => (hasSource.value ? 'Na fila' : 'Sem conteúdo'));

// Modelo de embedding encurtado para o card de pré-visualização (evita overflow).
const embeddingModelShort = computed(() => {
  const m = f.values.embedding_model || embeddingModels[0].value;
  return m.length > 24 ? m.slice(0, 22) + '…' : m;
});

// Hint do campo de conteúdo com contagem ao vivo.
const contentLen = computed(() => (f.values.content || '').length);
const contentHint = computed(() => {
  if (!contentLen.value) return 'Cole o texto que deve ser indexado e citado pelo assistente.';
  return (
    format.formatNumber(contentLen.value) +
    ' caracteres · ~' +
    estChunks.value +
    ' trecho(s) estimado(s)'
  );
});

// Resumo ao vivo para o painel de MetricCards.
const titleSummary = computed(() => {
  const t = (f.values.title || '').trim();
  if (!t) return '—';
  return t.length > 28 ? t.slice(0, 26) + '…' : t;
});

// ── Handlers de entrada ───────────────────────────────────────────────────────
function onFileChange(list) {
  fileError.value = '';
  const file = (list || [])[0];
  if (!file) return;
  // Rejeita arquivos acima de 20 MB antes mesmo do envio.
  if (file.size > 20 * 1048576) {
    fileError.value = 'Arquivo acima de 20 MB. Divida o documento ou cole o texto diretamente.';
    files.value = [];
    return;
  }
  // Sugere o título a partir do nome do arquivo quando o campo estiver vazio.
  if (!f.values.title.trim()) {
    const base = file.name
      .replace(/\.[^.]+$/, '')
      .replace(/[_-]+/g, ' ')
      .trim();
    f.setField('title', base.replace(/^./, (c) => c.toUpperCase()));
  }
}

function onContentInput(e) {
  f.setField('content', e.target.value);
}

// ── Limpar conteúdo (ação destrutiva confirmada) ──────────────────────────────
function resetSourceInputs() {
  files.value = [];
  fileError.value = '';
  f.values.content = '';
  delete f.errors.content;
}

async function clearSource() {
  if (!hasSource.value) return;
  const ok = await confirmAsk({
    title: 'Limpar conteúdo da fonte?',
    message:
      'O arquivo/texto será descartado. Os metadados preenchidos (título, ID, modelo) permanecem.',
    confirmLabel: 'Limpar',
    danger: true,
  });
  if (!ok) return;
  resetSourceInputs();
  toast.success('Conteúdo limpo.');
}

// ── Cancelar (confirma se o formulário estiver sujo) ─────────────────────────
function isDirty() {
  const v = f.values;
  return Boolean(
    v.title || v.source_id || v.content ||
    v.embedding_model !== embeddingModels[0].value ||
    files.value.length > 0,
  );
}

async function cancel() {
  if (isDirty()) {
    const ok = await confirmAsk({
      title: 'Descartar fonte?',
      message: 'As informações preenchidas serão perdidas. Deseja continuar?',
      confirmLabel: 'Descartar',
      danger: true,
    });
    if (!ok) return;
  }
  router.push('/knowledge-sources');
}

// ── Modal de notas de ingestão ────────────────────────────────────────────────
function dismissIngestNotes() {
  showIngestNotes.value = false;
  router.push('/knowledge-sources');
}

// ── Submit ────────────────────────────────────────────────────────────────────
// Validação do arquivo é feita fora do useForm (que não modela File objects).
// O conteúdo de texto é coberto pela regra condicional `contentRequiredInTextMode`.
function validateFileSource() {
  if (mode.value !== 'file') return true;
  if (!activeFile.value) {
    fileError.value = 'Escolha um arquivo para indexar.';
    return false;
  }
  return true;
}

async function submit() {
  if (f.submitting.value) return;

  // Validação de arquivo antes do handleSubmit (evita dependência de ordem interna).
  const fileOk = validateFileSource();

  await f.handleSubmit(async (vals) => {
    if (!fileOk) return;

    // Constrói o payload com os campos reais. content_hash e chunk_count são computados
    // pelo servidor sobre o conteúdo de verdade — a tela NÃO os fabrica.
    const payload = {
      title: vals.title.trim(),
      embedding_model: vals.embedding_model || embeddingModels[0].value,
    };

    const sid = (vals.source_id || '').trim();
    if (sid) payload.source_id = sid;

    // Arquivo → multipart/form-data (o backend extrai o texto, inclusive de PDF);
    // Texto → JSON { ..., content } (o backend recebe o texto e chunka diretamente).
    const fileList =
      mode.value === 'file' && activeFile.value ? [activeFile.value] : [];
    if (mode.value === 'text') {
      payload.content = vals.content;
    }

    try {
      const created = await knowledgeSources.createSource(payload, fileList);

      // Se o servidor retornar notas de ingestão (avisos), mostramos no modal antes
      // de navegar — o usuário precisa saber sobre páginas ignoradas ou chunks vazios.
      const notes =
        created &&
        Array.isArray(created.ingest_notes) &&
        created.ingest_notes.length
          ? created.ingest_notes
          : [];

      if (notes.length) {
        ingestNotes.value = notes;
        showIngestNotes.value = true;
        // Não navega ainda — o modal tem o botão "Ir para a lista".
        toast.success('Fonte registrada — verifique os avisos de ingestão.');
      } else {
        toast.success('Fonte registrada — indexação iniciada.');
        router.push('/knowledge-sources');
      }
    } catch (e) {
      toast.error(
        e && e.message ? e.message : 'Falha ao registrar a fonte. Tente novamente.',
      );
    }
  });
}
</script>

<style scoped>
/* ── Layout geral ───────────────────────────────────────────────────────────── */
.ksc-form {
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-4);
}

/* ── Banner informativo ─────────────────────────────────────────────────────── */
.ksc-note {
  display: flex;
  align-items: flex-start;
  gap: var(--ui-space-3);
  padding: var(--ui-space-3) var(--ui-space-4);
  border: 1px solid rgb(var(--ui-border));
  border-left: 3px solid rgb(var(--ui-accent));
  border-radius: var(--ui-radius-md);
  background: rgb(var(--ui-accent) / 0.05);
}
.ksc-note-icon {
  font-size: 1.1rem;
  line-height: 1.4;
  color: rgb(var(--ui-accent-strong));
  flex-shrink: 0;
}
.ksc-note-text {
  margin: 0;
  font-size: var(--ui-text-sm);
  color: rgb(var(--ui-fg));
  line-height: 1.5;
}

/* ── Resumo ao vivo (metric cards) ─────────────────────────────────────────── */
.ksc-summary {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: var(--ui-space-3);
}

/* ── Seletor de modo (radios) ───────────────────────────────────────────────── */
.ksc-modes {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: var(--ui-space-3);
  margin-bottom: var(--ui-space-4);
}
.ksc-mode {
  display: flex;
  align-items: center;
  gap: var(--ui-space-3);
  padding: var(--ui-space-3) var(--ui-space-4);
  border: 1px solid rgb(var(--ui-border-strong));
  border-radius: var(--ui-radius-md);
  background: rgb(var(--ui-surface));
  color: rgb(var(--ui-fg));
  cursor: pointer;
  text-align: left;
  transition: border-color 0.15s ease, background 0.15s ease, box-shadow 0.15s ease;
}
.ksc-mode:hover {
  border-color: rgb(var(--ui-accent));
}
.ksc-mode:focus-visible {
  outline: none;
  box-shadow: 0 0 0 3px rgb(var(--ui-accent) / 0.2);
}
.ksc-mode[data-active='true'] {
  border-color: rgb(var(--ui-accent));
  background: rgb(var(--ui-accent) / 0.07);
  box-shadow: inset 0 0 0 1px rgb(var(--ui-accent) / 0.4);
}
.ksc-mode-icon {
  font-size: 1.4rem;
  line-height: 1;
  color: rgb(var(--ui-accent-strong));
  flex-shrink: 0;
}
.ksc-mode-body {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.ksc-mode-title {
  font-weight: 600;
  font-size: var(--ui-text-md);
}
.ksc-mode-sub {
  font-size: var(--ui-text-xs);
  color: rgb(var(--ui-muted));
}

/* ── Painéis de entrada ─────────────────────────────────────────────────────── */
.ksc-pane {
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-2);
}

/* Textarea do modo texto: altura ampliada (base visual vem do kit via UiFormField :deep(textarea)).
   Mantemos só o que o kit NÃO cobre: altura mínima, foco, erro, placeholder. */
.ksc-textarea {
  min-height: 220px;
  line-height: 1.6;
  resize: vertical;
}
.ksc-textarea:focus {
  outline: none;
  border-color: rgb(var(--ui-accent));
  box-shadow: 0 0 0 3px rgb(var(--ui-accent) / 0.15);
}
.ksc-textarea[aria-invalid='true'] {
  border-color: rgb(var(--ui-danger));
}
.ksc-textarea[aria-invalid='true']:focus {
  box-shadow: 0 0 0 3px rgb(var(--ui-danger) / 0.15);
}
.ksc-textarea::placeholder {
  color: rgb(var(--ui-faint));
}

/* Contador de caracteres */
.ksc-char-count {
  margin: 0;
  font-size: var(--ui-text-xs);
  color: rgb(var(--ui-muted));
  text-align: right;
}

/* Select de modelo (base via kit UiFormField :deep(select); só foco/hover aqui) */
.ksc-select {
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}
.ksc-select:focus {
  outline: none;
  border-color: rgb(var(--ui-accent));
  box-shadow: 0 0 0 3px rgb(var(--ui-accent) / 0.15);
}

/* ── Card de pré-visualização ───────────────────────────────────────────────── */
.ksc-preview-empty {
  display: flex;
  justify-content: center;
  padding: var(--ui-space-3) 0;
}
.ksc-preview {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: var(--ui-space-3);
}
.ksc-stat {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: var(--ui-space-3);
  border: 1px solid rgb(var(--ui-border));
  border-radius: var(--ui-radius-md);
  background: rgb(var(--ui-surface-2));
}
.ksc-stat-value {
  font-family: var(--ui-font-display);
  font-size: var(--ui-text-lg);
  font-weight: 700;
  color: rgb(var(--ui-fg));
  word-break: break-word;
}
.ksc-stat-model {
  font-family: var(--ui-font-mono, monospace);
  font-size: var(--ui-text-xs);
  font-weight: 600;
  padding: var(--ui-space-1) var(--ui-space-2);
  background: rgb(var(--ui-surface));
  border: 1px solid rgb(var(--ui-border));
  border-radius: var(--ui-radius-pill);
  align-self: flex-start;
}
.ksc-stat-label {
  font-size: var(--ui-text-xs);
  color: rgb(var(--ui-muted));
}

/* Aviso de arquivo grande */
.ksc-size-warning {
  display: flex;
  align-items: center;
  gap: var(--ui-space-2);
  margin-top: var(--ui-space-3);
  padding: var(--ui-space-2) var(--ui-space-3);
  border-radius: var(--ui-radius-sm);
  background: rgb(var(--ui-warning) / 0.08);
  border: 1px solid rgb(var(--ui-warning) / 0.3);
  font-size: var(--ui-text-sm);
  color: rgb(var(--ui-fg));
}
.ksc-warn-icon {
  color: rgb(var(--ui-warning));
  font-size: 1rem;
  flex-shrink: 0;
}

/* ── Modal de notas de ingestão ─────────────────────────────────────────────── */
.ksc-ingest-body {
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-3);
}
.ksc-ingest-intro {
  margin: 0;
  font-size: var(--ui-text-sm);
  color: rgb(var(--ui-fg));
}
.ksc-ingest-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-2);
}
.ksc-ingest-item {
  display: flex;
  align-items: flex-start;
  gap: var(--ui-space-2);
  padding: var(--ui-space-2) var(--ui-space-3);
  border-radius: var(--ui-radius-sm);
  background: rgb(var(--ui-warning) / 0.08);
  border: 1px solid rgb(var(--ui-warning) / 0.25);
  font-size: var(--ui-text-sm);
  color: rgb(var(--ui-fg));
}
.ksc-ingest-bullet {
  color: rgb(var(--ui-warning));
  font-size: 0.9rem;
  flex-shrink: 0;
  margin-top: 1px;
}

/* ── Rodapé de ações ────────────────────────────────────────────────────────── */
.ksc-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ui-space-3);
  flex-wrap: wrap;
  padding-top: var(--ui-space-2);
}
.ksc-actions-left {
  display: flex;
  gap: var(--ui-space-2);
}
.ksc-actions-right {
  display: flex;
  gap: var(--ui-space-2);
}

/* ── Responsivo ─────────────────────────────────────────────────────────────── */
@media (max-width: 860px) {
  .ksc-summary {
    grid-template-columns: repeat(2, 1fr);
  }
  .ksc-modes {
    grid-template-columns: 1fr;
  }
  .ksc-preview {
    grid-template-columns: repeat(2, 1fr);
  }
}
@media (max-width: 480px) {
  .ksc-summary {
    grid-template-columns: 1fr 1fr;
    gap: var(--ui-space-2);
  }
  .ksc-preview {
    grid-template-columns: 1fr;
  }
  .ksc-actions {
    flex-direction: column;
    align-items: stretch;
  }
  .ksc-actions-left,
  .ksc-actions-right {
    width: 100%;
    justify-content: stretch;
  }
  .ksc-actions-right :deep(.ui-btn) {
    flex: 1 1 auto;
  }
}
</style>
