<template>
  <UiPageLayout
    eyebrow="RAG · Base de conhecimento"
    title="Adicionar fonte"
    subtitle="Envie um arquivo (texto ou PDF) ou cole o conteúdo. A fonte é indexada de forma assíncrona — chunking + embedding — e passa a alimentar as citações do assistente."
    width="narrow"
  >
    <template #actions>
      <UiButton variant="ghost" to="/knowledge-sources">Voltar</UiButton>
    </template>

    <!-- Banner contextual: o pipeline de ingestão é fail-soft -->
    <template #banner>
      <div class="ks-note" role="note">
        <span class="ks-note-icon" aria-hidden="true">◴</span>
        <p class="ks-note-text">
          A indexação roda em segundo plano. Se o índice vetorial (pgvector) estiver indisponível,
          a fonte é registrada mesmo assim e reprocessada quando o índice voltar.
        </p>
      </div>
    </template>

    <form class="ks-form" novalidate @submit.prevent="submit">
      <UiCard
        title="Origem do conteúdo"
        subtitle="Escolha como o conteúdo desta fonte vai entrar na base."
      >
        <!-- Seletor de modo: arquivo x texto colado (radios acessíveis) -->
        <div class="ks-modes" role="radiogroup" aria-label="Modo de entrada do conteúdo">
          <button
            type="button"
            class="ks-mode"
            :data-active="mode === 'file' ? 'true' : 'false'"
            role="radio"
            :aria-checked="mode === 'file' ? 'true' : 'false'"
            @click="setMode('file')"
          >
            <span class="ks-mode-icon" aria-hidden="true">⬆</span>
            <span class="ks-mode-body">
              <span class="ks-mode-title">Enviar arquivo</span>
              <span class="ks-mode-sub">.txt, .md, .csv ou .pdf</span>
            </span>
          </button>
          <button
            type="button"
            class="ks-mode"
            :data-active="mode === 'text' ? 'true' : 'false'"
            role="radio"
            :aria-checked="mode === 'text' ? 'true' : 'false'"
            @click="setMode('text')"
          >
            <span class="ks-mode-icon" aria-hidden="true">¶</span>
            <span class="ks-mode-body">
              <span class="ks-mode-title">Colar texto</span>
              <span class="ks-mode-sub">Cole o conteúdo direto</span>
            </span>
          </button>
        </div>

        <!-- Modo arquivo -->
        <div v-if="mode === 'file'" class="ks-pane">
          <UiFormField
            label="Arquivo da fonte"
            :required="true"
            :error="fileError"
            hint="Um arquivo por fonte. PDFs e arquivos de texto são suportados (até 20 MB)."
          >
            <template #default>
              <UiFileDrop
                v-model="files"
                :multiple="false"
                accept=".md,.txt,.csv,.pdf"
                label="Arraste o documento aqui ou clique para escolher"
                hint="Texto puro é indexado direto; PDFs têm o texto extraído na ingestão."
                @change="onFileChange"
              />
            </template>
          </UiFormField>
        </div>

        <!-- Modo texto colado -->
        <div v-else class="ks-pane">
          <UiFormField
            label="Conteúdo"
            :required="true"
            :error="f.errors.content"
            :hint="contentHint"
          >
            <template #default="{ id, describedBy }">
              <textarea
                :id="id"
                class="ks-textarea"
                :aria-describedby="describedBy"
                :aria-invalid="f.errors.content ? 'true' : undefined"
                :value="f.values.content"
                placeholder="Cole aqui o texto da fonte (manual, política, FAQ, transcrição…)"
                rows="10"
                @input="onContentInput"
              ></textarea>
            </template>
          </UiFormField>
        </div>
      </UiCard>

      <UiCard
        title="Metadados da fonte"
        subtitle="Como esta fonte aparece e é citada na base de conhecimento."
      >
        <UiFormSection :columns="2">
          <UiFormField
            label="Título da fonte"
            :required="true"
            :error="f.errors.title"
            hint="Nome legível usado nas citações do assistente."
            full-width
          >
            <template #default="{ id, describedBy }">
              <input
                :id="id"
                type="text"
                class="ks-input"
                :aria-describedby="describedBy"
                :aria-invalid="f.errors.title ? 'true' : undefined"
                aria-required="true"
                :value="f.values.title"
                placeholder="Ex.: Manual de procedimentos clínicos"
                @input="f.setField('title', $event.target.value)"
              />
            </template>
          </UiFormField>

          <UiFormField
            label="ID da fonte"
            :error="f.errors.source_id"
            hint="Opcional. Identificador estável (gera automaticamente se vazio)."
          >
            <template #default="{ id, describedBy }">
              <input
                :id="id"
                type="text"
                class="ks-input"
                :aria-describedby="describedBy"
                :aria-invalid="f.errors.source_id ? 'true' : undefined"
                :value="f.values.source_id"
                placeholder="ex.: manual-clinico-v2"
                @input="f.setField('source_id', $event.target.value)"
              />
            </template>
          </UiFormField>

          <UiFormField
            label="Modelo de embedding"
            hint="Modelo usado para vetorizar os trechos na indexação."
          >
            <template #default="{ id, describedBy }">
              <select
                :id="id"
                class="ks-select"
                :aria-describedby="describedBy"
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

      <!-- Pré-visualização do que será indexado (derivado do conteúdo/arquivo).
           Estimativa só — o nº real de trechos e o hash do conteúdo são computados no servidor
           durante a ingestão (sobre o texto extraído). -->
      <UiCard title="Pré-indexação" subtitle="Estimativa do que entra na base. Os números definitivos (trechos e hash) são calculados no servidor durante a ingestão.">
        <div v-if="!hasSource" class="ks-preview-empty">
          <UiEmptyState
            title="Sem conteúdo ainda"
            description="Envie um arquivo ou cole um texto para ver a estimativa de trechos."
            icon="database"
          />
        </div>
        <div v-else class="ks-preview" aria-label="Estimativa de indexação">
          <div class="ks-stat">
            <span class="ks-stat-value">{{ estChunksDisplay }}</span>
            <span class="ks-stat-label">{{ estChunksLabel }}</span>
          </div>
          <div class="ks-stat">
            <span class="ks-stat-value">{{ approxBytes }}</span>
            <span class="ks-stat-label">tamanho do conteúdo</span>
          </div>
          <div class="ks-stat">
            <span class="ks-stat-value">{{ embeddingModelShort }}</span>
            <span class="ks-stat-label">modelo de embedding</span>
          </div>
          <div class="ks-stat">
            <UiStatusBadge :status="indexState" :label="indexStateLabel" with-dot />
            <span class="ks-stat-label">estado inicial</span>
          </div>
        </div>
      </UiCard>

      <div class="ks-actions">
        <UiButton
          variant="ghost"
          type="button"
          :disabled="f.submitting.value || !hasSource"
          @click="clearAll"
        >
          Limpar
        </UiButton>
        <UiButton variant="ghost" type="button" :disabled="f.submitting.value" @click="cancel">
          Cancelar
        </UiButton>
        <UiButton type="submit" :loading="f.submitting.value">Registrar e indexar</UiButton>
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
  UiFileDrop,
  UiButton,
  UiEmptyState,
  UiStatusBadge,
  useForm,
  useToast,
  useConfirm,
  validators,
  format,
} from '../ui/index.js';
import { knowledgeSources } from '../api.js';

// Ingestão REAL: POST /v1/knowledge-sources com o CONTEÚDO (texto colado → JSON { content };
// arquivo → multipart, o backend extrai o texto e indexa). O servidor chunka, embedda e
// computa content_hash + chunk_count sobre o conteúdo real (a tela não fabrica mais hash).

const router = useRouter();
const toast = useToast();
const confirmAsk = useConfirm();

// Aproximação do chunking do pipeline: trechos de ~1000 caracteres. Usada SÓ na estimativa
// da tela (o número real de trechos vem do servidor após a ingestão).
const CHUNK_SIZE = 1000;

const embeddingModels = [
  { value: 'text-embedding-3-small', label: 'text-embedding-3-small (padrão)' },
  { value: 'text-embedding-3-large', label: 'text-embedding-3-large (maior contexto)' },
  { value: 'voyage-3', label: 'voyage-3' },
];

const files = ref([]);
const fileError = ref('');

// Regra condicional: 'content' é obrigatório SÓ no modo texto (mode vive em f.values para que a
// regra seja autocontida e validate() do useForm a avalie — sem escrever f.errors.* na mão).
const contentRequiredInTextMode = (v, all) =>
  all && all.mode === 'text' && (!v || !String(v).trim()) ? 'Cole algum conteúdo para indexar.' : '';

const f = useForm({
  initial: { title: '', source_id: '', content: '', embedding_model: embeddingModels[0].value, mode: 'file' },
  rules: {
    title: [validators.required('Informe um título para a fonte'), validators.minLen(2)],
    source_id: [validators.pattern(/^[a-z0-9][a-z0-9._-]*$/i, 'Use letras, números, ponto, hífen ou _')],
    content: [contentRequiredInTextMode],
  },
});

// `mode` é um campo do formulário (radio file|text). Atalho de leitura para o template.
const mode = computed(() => f.values.mode);

function setMode(next) {
  if (f.values.mode === next) return;
  f.values.mode = next;
  fileError.value = '';
  delete f.errors.content; // limpa erro de origem ao trocar de modo (evita erro órfão)
}

// ── Fonte ativa: o arquivo escolhido ou o texto colado ───────────────────────
const activeFile = computed(() => (mode.value === 'file' ? files.value[0] || null : null));
const hasSource = computed(() =>
  mode.value === 'file' ? !!activeFile.value : f.values.content.trim().length > 0
);

// Tamanho do conteúdo em bytes (arquivo: real; texto: comprimento da string).
const sourceBytes = computed(() => {
  if (mode.value === 'file') return activeFile.value ? activeFile.value.size : 0;
  return new Blob([f.values.content || '']).size;
});

const approxBytes = computed(() => {
  const n = sourceBytes.value;
  if (n < 1024) return n + ' B';
  if (n < 1048576) return (n / 1024).toFixed(0) + ' KB';
  return (n / 1048576).toFixed(1) + ' MB';
});

// Estimativa de trechos por bytes (~CHUNK_SIZE chars). SÓ é confiável no modo texto (sabemos o
// nº de caracteres). Para arquivo binário (PDF) é grosseira — o texto extraído é bem menor — por
// isso a tela NÃO mostra o número no modo arquivo (só o rótulo "na ingestão"). O número REAL vem
// do servidor após a ingestão (chunking do texto extraído).
const estChunks = computed(() =>
  hasSource.value ? Math.max(1, Math.ceil(sourceBytes.value / CHUNK_SIZE)) : 0
);

// Valor exibido no card "trechos": número só no modo texto; no modo arquivo evitamos sugerir
// precisão que não existe para binários.
const estChunksDisplay = computed(() => {
  if (!hasSource.value) return '—';
  if (mode.value === 'text') return '~' + format.formatNumber(estChunks.value);
  return 'na ingestão';
});
const estChunksLabel = computed(() =>
  mode.value === 'text' ? 'trechos estimados' : 'trechos (estimados na ingestão)'
);

const indexState = computed(() => (hasSource.value ? 'pending' : 'neutral'));
const indexStateLabel = computed(() => (hasSource.value ? 'Na fila de indexação' : 'Sem conteúdo'));

// Modelo de embedding escolhido (valor REAL conhecido), exibido no lugar do antigo "hash"
// fabricado no cliente — o content_hash verdadeiro é computado no SERVIDOR sobre o conteúdo.
const embeddingModelShort = computed(() => f.values.embedding_model || embeddingModels[0].value);

const contentHint = computed(() => {
  const n = f.values.content.trim().length;
  if (!n) return 'Cole o texto que deve ser indexado e citado pelo assistente.';
  return format.formatNumber(n) + ' caracteres · ~' + estChunks.value + ' trecho(s)';
});

// ── Handlers de entrada ──────────────────────────────────────────────────────
function onFileChange(list) {
  fileError.value = '';
  const file = (list || [])[0];
  if (!file) return;
  if (file.size > 20 * 1048576) {
    fileError.value = 'Arquivo acima de 20 MB. Divida o documento ou cole o texto.';
    files.value = [];
    return;
  }
  // Sugere um título a partir do nome do arquivo se ainda não houver um.
  if (!f.values.title.trim()) {
    const base = file.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim();
    f.setField('title', base.replace(/^./, (c) => c.toUpperCase()));
  }
}

function onContentInput(e) {
  f.setField('content', e.target.value);
}

function resetSourceInputs() {
  files.value = [];
  fileError.value = '';
  f.values.content = '';
  delete f.errors.content;
}

async function clearAll() {
  if (!hasSource.value) return;
  const ok = await confirmAsk({
    title: 'Limpar conteúdo?',
    message: 'O arquivo/texto desta fonte será descartado. Os metadados preenchidos permanecem.',
    danger: true,
  });
  if (!ok) return;
  resetSourceInputs();
  toast.info('Conteúdo da fonte limpo');
}

function cancel() {
  router.push('/knowledge-sources');
}

// ── Submit ───────────────────────────────────────────────────────────────────
// Validação da ORIGEM (arquivo) fora do useForm porque o useForm não modela File objects.
// O conteúdo de texto é validado PELAS REGRAS (contentRequiredInTextMode) via validate().
// O arquivo é validado aqui com um ref dedicado (fileError) — NÃO escrevemos em f.errors.
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
  // Bloqueia ANTES do handleSubmit se a origem (arquivo) for inválida — não depende da
  // ordem interna do useForm. O conteúdo de texto é coberto pelas regras do form.
  const fileOk = validateFileSource();
  await f.handleSubmit(async (vals) => {
    if (!fileOk) return; // validate() do form já cobriu title/source_id/content(texto)
    const payload = {
      title: vals.title.trim(),
      embedding_model: vals.embedding_model || embeddingModels[0].value,
    };
    const sid = (vals.source_id || '').trim();
    if (sid) payload.source_id = sid;

    // ENVIA O CONTEÚDO REAL: arquivo → multipart (o backend extrai o texto); texto → JSON { content }.
    // O servidor chunka, embedda e computa content_hash + chunk_count sobre o conteúdo de verdade.
    const fileList = mode.value === 'file' && activeFile.value ? [activeFile.value] : [];
    if (mode.value === 'text') payload.content = vals.content;

    try {
      const created = await knowledgeSources.createSource(payload, fileList);
      if (created && created.ingest_notes && created.ingest_notes.length) {
        toast.info('Fonte indexada com avisos: ' + created.ingest_notes.join(' '));
      } else {
        toast.success('Fonte registrada — indexação iniciada');
      }
      // Não há tela de detalhe da fonte: a fonte recém-indexada aparece na lista.
      router.push('/knowledge-sources');
    } catch (e) {
      toast.error(e && e.message ? e.message : 'Falha ao registrar a fonte');
    }
  });
}
</script>

<style scoped>
.ks-form {
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-4);
}

/* Banner fail-soft */
.ks-note {
  display: flex;
  align-items: flex-start;
  gap: var(--ui-space-3);
  padding: var(--ui-space-3) var(--ui-space-4);
  border: 1px solid rgb(var(--ui-border));
  border-left: 3px solid rgb(var(--ui-accent));
  border-radius: var(--ui-radius-md);
  background: rgb(var(--ui-accent) / 0.05);
}
.ks-note-icon {
  font-size: 1.1rem;
  line-height: 1.4;
  color: rgb(var(--ui-accent-strong));
}
.ks-note-text {
  margin: 0;
  font-size: var(--ui-text-sm);
  color: rgb(var(--ui-fg));
}

/* Seletor de modo */
.ks-modes {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: var(--ui-space-3);
  margin-bottom: var(--ui-space-4);
}
.ks-mode {
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
.ks-mode:hover {
  border-color: rgb(var(--ui-accent));
}
.ks-mode:focus-visible {
  outline: none;
  box-shadow: 0 0 0 3px rgb(var(--ui-accent) / 0.2);
}
.ks-mode[data-active='true'] {
  border-color: rgb(var(--ui-accent));
  background: rgb(var(--ui-accent) / 0.07);
  box-shadow: inset 0 0 0 1px rgb(var(--ui-accent) / 0.4);
}
.ks-mode-icon {
  font-size: 1.3rem;
  line-height: 1;
  color: rgb(var(--ui-accent-strong));
  flex-shrink: 0;
}
.ks-mode-body {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
}
.ks-mode-title {
  font-weight: 600;
  font-size: var(--ui-text-md);
}
.ks-mode-sub {
  font-size: var(--ui-text-xs);
  color: rgb(var(--ui-muted));
}

.ks-pane {
  display: flex;
  flex-direction: column;
}

/* A aparência base (background/border/radius/padding/width) dos controles nativos vem do
   UiFormField via :deep(input/select/textarea) — NÃO duplicamos aqui (divergiria se o token
   mudar). Mantemos só o que o kit NÃO cobre nesta superfície: altura maior do textarea de
   colagem + estados de foco/erro/placeholder dos controles nativos (o kit injeta só a base). */
.ks-textarea {
  min-height: 200px;
  line-height: 1.5;
}
.ks-input:focus,
.ks-textarea:focus,
.ks-select:focus {
  outline: none;
  border-color: rgb(var(--ui-accent));
  box-shadow: 0 0 0 3px rgb(var(--ui-accent) / 0.15);
}
.ks-input[aria-invalid='true'],
.ks-textarea[aria-invalid='true'] {
  border-color: rgb(var(--ui-danger));
}
.ks-input::placeholder,
.ks-textarea::placeholder {
  color: rgb(var(--ui-faint));
}

/* Pré-indexação */
.ks-preview-empty {
  display: flex;
  justify-content: center;
}
.ks-preview {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: var(--ui-space-3);
}
.ks-stat {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: var(--ui-space-3);
  border: 1px solid rgb(var(--ui-border));
  border-radius: var(--ui-radius-md);
  background: rgb(var(--ui-surface-2));
}
.ks-stat-value {
  font-family: var(--ui-font-display);
  font-size: var(--ui-text-lg);
  font-weight: 700;
  color: rgb(var(--ui-fg));
  word-break: break-word;
}
.ks-stat-label {
  font-size: var(--ui-text-xs);
  color: rgb(var(--ui-muted));
}

/* Ações */
.ks-actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--ui-space-2);
  flex-wrap: wrap;
}

@media (max-width: 860px) {
  .ks-modes {
    grid-template-columns: 1fr;
  }
  .ks-preview {
    grid-template-columns: repeat(2, 1fr);
  }
}
@media (max-width: 480px) {
  .ks-preview {
    grid-template-columns: 1fr;
  }
  .ks-actions {
    justify-content: stretch;
  }
}
</style>
