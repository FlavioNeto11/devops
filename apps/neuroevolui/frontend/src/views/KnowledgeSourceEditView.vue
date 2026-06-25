<template>
  <UiPageLayout
    eyebrow="RAG · Base de conhecimento"
    :title="pageTitle"
    subtitle="Edite o título, o identificador de origem e o conteúdo da fonte. Após salvar, use o botão Reindexar para aplicar as mudanças no índice vetorial."
    width="narrow"
    :loading="loadingSource"
    :error="loadError"
    @retry="loadSource"
  >
    <template #actions>
      <UiButton variant="ghost" to="/knowledge-sources">Voltar</UiButton>
    </template>

    <!-- Banner de estado de indexação: mostra quando a fonte está desatualizada após edição -->
    <template v-if="needsReindex" #banner>
      <div class="kse-banner" role="alert">
        <span class="kse-banner-icon" aria-hidden="true">△</span>
        <p class="kse-banner-text">
          O conteúdo foi alterado. Clique em <strong>Reindexar</strong> para aplicar as mudanças no índice vetorial — enquanto não reindexar, o assistente usará os trechos da versão anterior.
        </p>
        <UiButton
          variant="subtle"
          size="sm"
          :loading="reindexing"
          @click="doReindex"
        >Reindexar agora</UiButton>
      </div>
    </template>

    <!-- Esqueleto de carregamento enquanto busca GET /v1/knowledge-sources/:id -->
    <div v-if="loadingSource" class="kse-skeleton" aria-busy="true" aria-label="Carregando fonte">
      <UiCard>
        <UiLoadingState variant="skeleton" :skeleton-lines="5" />
      </UiCard>
      <UiCard>
        <UiLoadingState variant="skeleton" :skeleton-lines="3" />
      </UiCard>
    </div>

    <!-- Formulário de edição — só renderiza após carregar a fonte -->
    <form v-else-if="source" class="kse-form" novalidate @submit.prevent="submit">
      <!-- Metadados editáveis -->
      <UiCard
        title="Identificação da fonte"
        subtitle="Informações que identificam e nomeiam esta fonte nas citações do assistente."
      >
        <UiFormSection :columns="2">
          <UiFormField
            label="Título"
            :required="true"
            :error="f.errors.title"
            hint="Nome legível exibido nas citações do assistente."
            full-width
          >
            <template #default="{ id, describedBy }">
              <input
                :id="id"
                type="text"
                class="kse-input"
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
            label="ID de origem"
            :error="f.errors.source_id"
            hint="Identificador técnico estável desta fonte. Use letras, números, hífen ou ponto."
          >
            <template #default="{ id, describedBy }">
              <input
                :id="id"
                type="text"
                class="kse-input"
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
            hint="Modelo que vetoriza os trechos. Alterar aqui não reprocessa automaticamente — reindexe após salvar."
          >
            <template #default="{ id, describedBy }">
              <select
                :id="id"
                class="kse-select"
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

      <!-- Conteúdo indexado -->
      <UiCard
        title="Conteúdo indexado"
        subtitle="Texto que é segmentado (chunks) e vetorizado no índice RAG. Editar e salvar não reindexará automaticamente — use o botão Reindexar após salvar."
      >
        <UiFormField
          label="Conteúdo / texto indexado"
          :required="true"
          :error="f.errors.content"
          :hint="contentHint"
        >
          <template #default="{ id, describedBy }">
            <textarea
              :id="id"
              class="kse-textarea"
              :aria-describedby="describedBy"
              :aria-invalid="f.errors.content ? 'true' : undefined"
              aria-required="true"
              :value="f.values.content"
              placeholder="Cole aqui o texto completo da fonte (manual, política, FAQ, transcrição…)"
              rows="14"
              @input="f.setField('content', $event.target.value)"
            ></textarea>
          </template>
        </UiFormField>

        <!-- Indicadores de tamanho do conteúdo -->
        <div v-if="f.values.content && f.values.content.trim().length > 0" class="kse-content-stats" aria-label="Estatísticas do conteúdo">
          <div class="kse-stat">
            <span class="kse-stat-value">{{ format.formatNumber(charCount) }}</span>
            <span class="kse-stat-label">caracteres</span>
          </div>
          <div class="kse-stat">
            <span class="kse-stat-value">~{{ format.formatNumber(estChunks) }}</span>
            <span class="kse-stat-label">trechos estimados</span>
          </div>
          <div class="kse-stat">
            <span class="kse-stat-value">{{ approxBytes }}</span>
            <span class="kse-stat-label">tamanho</span>
          </div>
        </div>
      </UiCard>

      <!-- Resumo de indexação atual -->
      <UiCard title="Estado atual da indexação" subtitle="Informações da última ingestão registrada no servidor.">
        <dl class="kse-meta">
          <div class="kse-meta-row">
            <dt class="kse-meta-label">Trechos indexados</dt>
            <dd class="kse-meta-value">
              <span class="kse-chunks">{{ format.formatNumber(source.chunk_count || 0) }}</span>
              <UiStatusBadge
                :status="source.chunk_count > 0 ? 'active' : 'pending'"
                :label="source.chunk_count > 0 ? 'Indexada' : 'Vazia'"
                with-dot
              />
            </dd>
          </div>
          <div class="kse-meta-row">
            <dt class="kse-meta-label">Hash do conteúdo</dt>
            <dd class="kse-meta-value">
              <code v-if="source.content_hash" class="kse-code">{{ source.content_hash }}</code>
              <span v-else class="kse-muted">não disponível</span>
            </dd>
          </div>
          <div class="kse-meta-row">
            <dt class="kse-meta-label">Indexado em</dt>
            <dd class="kse-meta-value">
              <span v-if="source.ingested_at">{{ format.formatDateTime(source.ingested_at) }}</span>
              <span v-else class="kse-muted">nunca indexado</span>
            </dd>
          </div>
          <div class="kse-meta-row">
            <dt class="kse-meta-label">Criado em</dt>
            <dd class="kse-meta-value">
              <span v-if="source.created_at">{{ format.formatDateTime(source.created_at) }}</span>
              <span v-else class="kse-muted">—</span>
            </dd>
          </div>
        </dl>
      </UiCard>

      <!-- Ações -->
      <div class="kse-actions">
        <UiButton
          variant="danger"
          type="button"
          :disabled="f.submitting.value || reindexing"
          @click="doDelete"
        >Remover fonte</UiButton>

        <div class="kse-actions-right">
          <UiButton
            variant="ghost"
            type="button"
            :disabled="f.submitting.value || reindexing"
            @click="cancel"
          >Cancelar</UiButton>
          <UiButton
            variant="subtle"
            type="button"
            :disabled="f.submitting.value"
            :loading="reindexing"
            @click="doReindex"
          >Reindexar</UiButton>
          <UiButton
            type="submit"
            :loading="f.submitting.value"
            :disabled="reindexing"
          >Salvar alterações</UiButton>
        </div>
      </div>
    </form>
  </UiPageLayout>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import {
  UiPageLayout,
  UiCard,
  UiFormSection,
  UiFormField,
  UiLoadingState,
  UiStatusBadge,
  UiButton,
  useForm,
  useToast,
  useConfirm,
  validators,
  format,
} from '../ui/index.js';
import { knowledgeSources } from '../api.js';

// Aproximação do chunking do pipeline: trechos de ~1000 caracteres.
const CHUNK_SIZE = 1000;

const embeddingModels = [
  { value: 'text-embedding-3-small', label: 'text-embedding-3-small (padrão)' },
  { value: 'text-embedding-3-large', label: 'text-embedding-3-large (maior contexto)' },
  { value: 'voyage-3', label: 'voyage-3' },
];

const route = useRoute();
const router = useRouter();
const toast = useToast();
const confirmAsk = useConfirm();

// Estado de carregamento e da fonte carregada
const source = ref(null);
const loadingSource = ref(true);
const loadError = ref('');
const reindexing = ref(false);
// Marca que o conteúdo foi salvo e precisa ser reindexado
const needsReindex = ref(false);

// Formulário de edição — campos editáveis pelo usuário
const f = useForm({
  initial: { title: '', source_id: '', content: '', embedding_model: embeddingModels[0].value },
  rules: {
    title: [validators.required('Informe um título para a fonte'), validators.minLen(2)],
    source_id: [validators.pattern(/^[a-z0-9][a-z0-9._-]*$/i, 'Use letras, números, ponto, hífen ou _')],
    content: [validators.required('O conteúdo indexado não pode ficar em branco')],
  },
});

// ── Dados derivados do conteúdo ──────────────────────────────────────────────
const charCount = computed(() => (f.values.content || '').trim().length);

const estChunks = computed(() =>
  charCount.value > 0 ? Math.max(1, Math.ceil(charCount.value / CHUNK_SIZE)) : 0
);

const approxBytes = computed(() => {
  const n = new Blob([f.values.content || '']).size;
  if (n < 1024) return n + ' B';
  if (n < 1048576) return (n / 1024).toFixed(0) + ' KB';
  return (n / 1048576).toFixed(1) + ' MB';
});

const contentHint = computed(() => {
  const n = charCount.value;
  if (!n) return 'Cole o texto completo que deve ser indexado pelo pipeline RAG.';
  return format.formatNumber(n) + ' caracteres · ~' + estChunks.value + ' trecho(s) estimados';
});

const pageTitle = computed(() =>
  source.value ? ('Editar: ' + (source.value.title || source.value.source_id || 'Fonte')) : 'Editar fonte'
);

// ── Carregar GET /v1/knowledge-sources/:id ────────────────────────────────────
async function loadSource() {
  loadingSource.value = true;
  loadError.value = '';
  try {
    const id = route.params.id;
    const data = await knowledgeSources.get(id);
    source.value = data;
    // Popula o formulário com os valores atuais da fonte
    f.values.title = data.title || '';
    f.values.source_id = data.source_id || '';
    f.values.content = data.content || '';
    f.values.embedding_model =
      embeddingModels.find((m) => m.value === data.embedding_model)
        ? data.embedding_model
        : embeddingModels[0].value;
    needsReindex.value = false;
  } catch (e) {
    loadError.value = e && e.message ? e.message : 'Não foi possível carregar a fonte.';
  } finally {
    loadingSource.value = false;
  }
}

// ── Salvar PUT /v1/knowledge-sources/:id ─────────────────────────────────────
async function submit() {
  await f.handleSubmit(async (vals) => {
    const id = route.params.id;
    const payload = {
      title: vals.title.trim(),
      content: vals.content,
      embedding_model: vals.embedding_model || embeddingModels[0].value,
    };
    const sid = (vals.source_id || '').trim();
    if (sid) payload.source_id = sid;

    try {
      const updated = await knowledgeSources.update(id, payload);
      // Atualiza a referência local para refletir novos valores (hash, etc.)
      source.value = { ...source.value, ...updated };
      needsReindex.value = true;
      toast.success('Fonte atualizada. Reindexe para aplicar no índice vetorial.');
    } catch (e) {
      toast.error(e && e.message ? e.message : 'Falha ao salvar a fonte.');
    }
  });
}

// ── Reindexar POST /v1/knowledge-sources/:id/reindex ─────────────────────────
async function doReindex() {
  if (reindexing.value) return;
  const id = route.params.id;
  reindexing.value = true;
  try {
    await knowledgeSources.reindex(id);
    needsReindex.value = false;
    // Recarrega para obter chunk_count e ingested_at atualizados
    await loadSource();
    toast.success('Fonte reindexada com sucesso. O assistente já usa a versão mais recente.');
  } catch (e) {
    toast.error('Falha ao reindexar: ' + (e && e.message ? e.message : 'erro desconhecido'));
  } finally {
    reindexing.value = false;
  }
}

// ── Remover (ação destrutiva — confirmação obrigatória) ───────────────────────
async function doDelete() {
  if (!source.value) return;
  const ok = await confirmAsk({
    title: 'Remover fonte da base?',
    message:
      'A fonte "' +
      (source.value.title || source.value.source_id) +
      '" e seus ' +
      format.formatNumber(source.value.chunk_count || 0) +
      ' trecho(s) indexado(s) serão apagados permanentemente. O assistente deixará de citá-la. Esta ação não pode ser desfeita.',
    danger: true,
  });
  if (!ok) return;
  try {
    await knowledgeSources.remove(route.params.id);
    toast.success('Fonte removida da base de conhecimento.');
    router.push('/knowledge-sources');
  } catch (e) {
    toast.error('Falha ao remover: ' + (e && e.message ? e.message : 'erro desconhecido'));
  }
}

function cancel() {
  router.push('/knowledge-sources');
}

onMounted(loadSource);
</script>

<style scoped>
.kse-form {
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-4);
}

/* Esqueleto */
.kse-skeleton {
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-4);
}

/* Banner de reindexação pendente */
.kse-banner {
  display: flex;
  align-items: center;
  gap: var(--ui-space-3);
  padding: var(--ui-space-3) var(--ui-space-4);
  border: 1px solid rgb(var(--ui-border));
  border-left: 3px solid rgb(var(--ui-warning, 217 119 6));
  border-radius: var(--ui-radius-md);
  background: rgb(var(--ui-warning, 217 119 6) / 0.06);
  flex-wrap: wrap;
}
.kse-banner-icon {
  font-size: 1.1rem;
  line-height: 1.4;
  color: rgb(var(--ui-warning, 217 119 6));
  flex-shrink: 0;
}
.kse-banner-text {
  flex: 1;
  margin: 0;
  font-size: var(--ui-text-sm);
  color: rgb(var(--ui-fg));
  min-width: 0;
}

/* Controles de formulário — aparência base vem do UiFormField via :deep().
   Aqui só o que o kit não cobre: altura do textarea, foco, erro, placeholder. */
.kse-textarea {
  min-height: 280px;
  line-height: 1.6;
  font-family: var(--ui-font-mono, monospace);
  font-size: var(--ui-text-sm);
}
.kse-input:focus,
.kse-textarea:focus,
.kse-select:focus {
  outline: none;
  border-color: rgb(var(--ui-accent));
  box-shadow: 0 0 0 3px rgb(var(--ui-accent) / 0.15);
}
.kse-input[aria-invalid='true'],
.kse-textarea[aria-invalid='true'] {
  border-color: rgb(var(--ui-danger));
}
.kse-input::placeholder,
.kse-textarea::placeholder {
  color: rgb(var(--ui-faint));
}

/* Estatísticas do conteúdo (abaixo do textarea) */
.kse-content-stats {
  display: flex;
  gap: var(--ui-space-4);
  margin-top: var(--ui-space-3);
  padding: var(--ui-space-3) var(--ui-space-4);
  border: 1px solid rgb(var(--ui-border));
  border-radius: var(--ui-radius-md);
  background: rgb(var(--ui-surface-2));
}
.kse-stat {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.kse-stat-value {
  font-family: var(--ui-font-display);
  font-size: var(--ui-text-md);
  font-weight: 700;
  color: rgb(var(--ui-fg));
  font-variant-numeric: tabular-nums;
}
.kse-stat-label {
  font-size: var(--ui-text-xs);
  color: rgb(var(--ui-muted));
}

/* Metadados de indexação (dl) */
.kse-meta {
  display: grid;
  grid-template-columns: 1fr;
  gap: var(--ui-space-3);
  margin: 0;
}
.kse-meta-row {
  display: flex;
  align-items: baseline;
  gap: var(--ui-space-3);
  padding: var(--ui-space-2) 0;
  border-bottom: 1px solid rgb(var(--ui-border));
}
.kse-meta-row:last-child {
  border-bottom: none;
}
.kse-meta-label {
  flex-shrink: 0;
  width: 160px;
  font-size: var(--ui-text-sm);
  font-weight: 600;
  color: rgb(var(--ui-muted));
}
.kse-meta-value {
  display: flex;
  align-items: center;
  gap: var(--ui-space-2);
  flex: 1;
  min-width: 0;
  font-size: var(--ui-text-sm);
  color: rgb(var(--ui-fg));
  word-break: break-word;
}
.kse-chunks {
  font-variant-numeric: tabular-nums;
  font-weight: 700;
  font-size: var(--ui-text-md);
  color: rgb(var(--ui-fg));
}
.kse-code {
  font-family: var(--ui-font-mono, monospace);
  font-size: var(--ui-text-xs);
  padding: 2px var(--ui-space-2);
  border-radius: var(--ui-radius-sm);
  background: rgb(var(--ui-surface-2));
  border: 1px solid rgb(var(--ui-border));
  color: rgb(var(--ui-fg));
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 280px;
}
.kse-muted {
  color: rgb(var(--ui-muted));
  font-size: var(--ui-text-xs);
  font-style: italic;
}

/* Ações */
.kse-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ui-space-3);
  flex-wrap: wrap;
}
.kse-actions-right {
  display: flex;
  align-items: center;
  gap: var(--ui-space-2);
  flex-wrap: wrap;
}

@media (max-width: 860px) {
  .kse-content-stats {
    flex-wrap: wrap;
    gap: var(--ui-space-3);
  }
  .kse-meta-label {
    width: 120px;
  }
  .kse-banner {
    flex-direction: column;
    align-items: flex-start;
  }
}
@media (max-width: 480px) {
  .kse-actions {
    flex-direction: column;
    align-items: stretch;
  }
  .kse-actions-right {
    flex-direction: column;
    align-items: stretch;
  }
  .kse-meta-row {
    flex-direction: column;
    gap: var(--ui-space-1);
  }
  .kse-meta-label {
    width: auto;
  }
  .kse-code {
    max-width: 100%;
  }
}
</style>
