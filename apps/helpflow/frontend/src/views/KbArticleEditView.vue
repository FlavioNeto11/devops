<template>
  <UiPageLayout
    eyebrow="Base de Conhecimento"
    :title="pageTitle"
    :subtitle="pageSubtitle"
    width="wide"
    :loading="loading"
    loading-message="Carregando artigo…"
    :error="loadError"
    @retry="load"
  >
    <template #actions>
      <UiButton variant="ghost" :to="detailTo">Ver artigo</UiButton>
      <UiButton variant="ghost" :to="listTo">Voltar à base</UiButton>
      <UiButton
        variant="subtle"
        type="button"
        :disabled="!dirty || saving"
        @click="discard"
      >
        Descartar alterações
      </UiButton>
    </template>

    <!-- Banner de contexto: identidade + status atual + indexação vetorial -->
    <template #banner>
      <div
        v-if="!loading && !loadError && original"
        class="kb-ctx"
        role="group"
        aria-label="Resumo do artigo"
      >
        <span class="kb-ctx-ref">#{{ articleId }}</span>
        <UiStatusBadge :status="f.values.status" :label="statusLabelOf(f.values.status)" with-dot />
        <UiStatusBadge
          :status="embeddingStatus"
          :tone="embeddingTone"
          :label="embeddingLabel"
          with-dot
        />
        <span class="kb-ctx-meta">Atualizado {{ format.formatDateTime(original.updated_at) }}</span>
        <span v-if="dirty" class="kb-ctx-dirty" role="status">Alterações não salvas</span>
      </div>
    </template>

    <!-- Estado: artigo inexistente (404) — distinto do erro recuperável -->
    <UiEmptyState
      v-if="!loading && !loadError && notFound"
      icon="search"
      title="Artigo não encontrado"
      description="Este artigo da base de conhecimento pode ter sido removido ou o endereço está incorreto."
    >
      <template #action>
        <UiButton :to="listTo">Ver todos os artigos</UiButton>
      </template>
    </UiEmptyState>

    <!-- Estado normal: formulário de edição -->
    <form
      v-else-if="!loading && !loadError && original"
      class="kb-form"
      novalidate
      @submit.prevent="onSubmit"
    >
      <div class="kb-grid">
        <!-- Coluna principal: conteúdo do artigo -->
        <div class="kb-col">
          <!-- FormSection: conteúdo do artigo -->
          <UiCard
            title="Conteúdo do artigo"
            subtitle="Título, corpo e classificação que os solicitantes e agentes consultam."
          >
            <UiFormSection :columns="1">
              <UiFormField
                label="Título"
                :required="true"
                :error="f.errors.title"
                :hint="titleHint"
              >
                <template #default="{ id, describedBy }">
                  <input
                    :id="id"
                    type="text"
                    maxlength="160"
                    autocomplete="off"
                    :aria-describedby="describedBy"
                    :value="f.values.title"
                    placeholder="Ex.: Como redefinir minha senha de acesso"
                    @input="f.setField('title', $event.target.value)"
                  />
                </template>
              </UiFormField>

              <!-- RichTextArea: textarea acessível + toolbar de marcação (markdown) + preview, sem v-html -->
              <UiFormField
                label="Conteúdo"
                :required="true"
                :error="f.errors.body"
                :hint="bodyHint"
              >
                <template #default="{ id, describedBy }">
                  <div class="kb-editor" :data-focused="bodyFocused ? 'true' : null">
                    <div class="kb-toolbar" role="toolbar" aria-label="Formatação do conteúdo">
                      <button
                        v-for="tool in TOOLS"
                        :key="tool.key"
                        type="button"
                        class="kb-tool"
                        :title="tool.title"
                        :aria-label="tool.title"
                        :disabled="previewOn"
                        @click="applyTool(tool)"
                      >
                        <span class="kb-tool-glyph" aria-hidden="true">{{ tool.glyph }}</span>
                      </button>
                      <span class="kb-toolbar-spacer" aria-hidden="true" />
                      <span class="kb-toolbar-hint" aria-hidden="true">Markdown</span>
                      <button
                        type="button"
                        class="kb-preview-toggle"
                        :data-on="previewOn ? 'true' : 'false'"
                        :aria-pressed="previewOn ? 'true' : 'false'"
                        @click="previewOn = !previewOn"
                      >
                        {{ previewOn ? 'Editar' : 'Pré-visualizar' }}
                      </button>
                    </div>

                    <!-- Modo edição -->
                    <textarea
                      v-show="!previewOn"
                      :id="id"
                      ref="bodyEl"
                      rows="16"
                      class="kb-textarea"
                      :aria-describedby="describedBy"
                      :value="f.values.body"
                      placeholder="Escreva o passo a passo. Use # para títulos, - para listas e **negrito**."
                      @input="f.setField('body', $event.target.value)"
                      @focus="bodyFocused = true"
                      @blur="bodyFocused = false"
                    />

                    <!-- Modo pré-visualização (CSP-safe: blocos de texto puro, sem v-html) -->
                    <div v-if="previewOn" class="kb-preview" aria-label="Pré-visualização do conteúdo">
                      <template v-if="renderedBlocks.length">
                        <component
                          :is="block.tag"
                          v-for="(block, i) in renderedBlocks"
                          :key="i"
                          class="kb-preview-block"
                          :data-kind="block.kind"
                        >{{ block.text }}</component>
                      </template>
                      <p v-else class="kb-preview-empty">Nada para mostrar ainda — escreva o conteúdo do artigo.</p>
                    </div>

                    <div class="kb-editor-foot">
                      <span class="kb-editor-count">{{ bodyStats.words }} palavras · {{ bodyStats.chars }} caracteres</span>
                      <span class="kb-editor-read">Leitura ~{{ bodyStats.minutes }} min</span>
                    </div>
                  </div>
                </template>
              </UiFormField>
            </UiFormSection>
          </UiCard>

          <!-- FormSection: classificação (categoria + TagInput) -->
          <UiCard
            title="Classificação"
            subtitle="Categoria e tags melhoram a busca e a recuperação por IA."
          >
            <UiFormSection :columns="1">
              <UiFormField
                label="Categoria"
                :error="f.errors.category"
                hint="Agrupa o artigo num tema (ex.: Acesso, Faturamento, Hardware)."
              >
                <template #default="{ id, describedBy }">
                  <input
                    :id="id"
                    type="text"
                    list="kb-category-options"
                    maxlength="80"
                    autocomplete="off"
                    :aria-describedby="describedBy"
                    :value="f.values.category"
                    placeholder="Ex.: Acesso e senhas"
                    @input="f.setField('category', $event.target.value)"
                  />
                  <datalist id="kb-category-options">
                    <option v-for="c in CATEGORY_SUGGESTIONS" :key="c" :value="c" />
                  </datalist>
                </template>
              </UiFormField>

              <!-- TagInput: chips removíveis + campo de entrada (Enter/vírgula adiciona) -->
              <UiFormField
                label="Tags"
                :error="f.errors.tags"
                hint="Pressione Enter ou vírgula para adicionar. Tags ajudam na busca."
              >
                <template #default="{ id, describedBy }">
                  <div
                    class="kb-tags"
                    :data-empty="tags.length === 0 ? 'true' : null"
                    @click="focusTagInput"
                  >
                    <ul v-if="tags.length" class="kb-tag-list">
                      <li v-for="(tag, i) in tags" :key="tag + ':' + i" class="kb-tag">
                        <span class="kb-tag-label">{{ tag }}</span>
                        <button
                          type="button"
                          class="kb-tag-remove"
                          :aria-label="'Remover tag ' + tag"
                          @click.stop="removeTag(i)"
                        >
                          <span aria-hidden="true">×</span>
                        </button>
                      </li>
                    </ul>
                    <input
                      :id="id"
                      ref="tagInputEl"
                      type="text"
                      class="kb-tag-input"
                      maxlength="40"
                      autocomplete="off"
                      :aria-describedby="describedBy"
                      v-model="tagDraft"
                      placeholder="Adicionar tag…"
                      @keydown.enter.prevent="commitTag"
                      @keydown="onTagKeydown"
                    />
                  </div>
                </template>
              </UiFormField>
            </UiFormSection>
          </UiCard>
        </div>

        <!-- Coluna lateral: publicação, indexação e registro -->
        <aside class="kb-col kb-aside">
          <!-- StatusSelect: estado de publicação como cartões de rádio acessíveis -->
          <UiCard
            title="Publicação"
            subtitle="Controle a visibilidade do artigo na base."
          >
            <UiFormField :error="f.errors.status" full-width label="Estado de publicação" :required="true">
              <template #default="{ id, describedBy, hasError }">
                <div
                  :id="id"
                  class="kb-status"
                  role="radiogroup"
                  aria-label="Estado de publicação"
                  :aria-describedby="describedBy"
                  :aria-invalid="hasError ? 'true' : null"
                >
                  <label
                    v-for="opt in STATUS_OPTIONS"
                    :key="opt.value"
                    class="kb-status-opt"
                    :data-selected="f.values.status === opt.value ? 'true' : 'false'"
                    :data-tone="opt.tone"
                  >
                    <input
                      class="kb-status-input"
                      type="radio"
                      name="kb-status"
                      :value="opt.value"
                      :checked="f.values.status === opt.value"
                      @change="f.setField('status', opt.value)"
                    />
                    <span class="kb-status-mark" aria-hidden="true" />
                    <span class="kb-status-body">
                      <span class="kb-status-head">
                        <span class="kb-status-name">{{ opt.label }}</span>
                        <UiStatusBadge :status="opt.value" :tone="opt.tone" :label="opt.label" size="sm" />
                      </span>
                      <span class="kb-status-desc">{{ opt.description }}</span>
                    </span>
                  </label>
                </div>
              </template>
            </UiFormField>

            <p v-if="statusChanged" class="kb-status-note" role="status">
              Você está mudando a publicação de
              <strong>{{ statusLabelOf(original.status) }}</strong>
              para
              <strong>{{ statusLabelOf(f.values.status) }}</strong>.
              <span v-if="willPublish">O artigo ficará visível ao salvar.</span>
              <span v-else-if="willArchive">O artigo deixará de aparecer nas buscas ao salvar.</span>
            </p>
          </UiCard>

          <!-- Indexação vetorial: efeito do salvamento sobre o embedding + reindex sob demanda -->
          <UiCard
            title="Indexação vetorial"
            subtitle="O conteúdo é reindexado a cada salvamento para a busca por IA."
          >
            <div class="kb-embed" :data-tone="embeddingTone">
              <span class="kb-embed-icon" aria-hidden="true">{{ embeddingGlyph }}</span>
              <div class="kb-embed-body">
                <p class="kb-embed-state">{{ embeddingLabel }}</p>
                <p class="kb-embed-help">{{ embeddingHelp }}</p>
              </div>
            </div>

            <p
              v-if="contentChanged"
              class="kb-embed-reindex"
              role="status"
            >
              <span class="kb-embed-reindex-mark" aria-hidden="true">↻</span>
              O título ou o conteúdo mudou — ao salvar, o embedding será
              <strong>recalculado</strong> e a indexação voltará a
              <em>pendente</em> até concluir.
            </p>

            <!-- Reindexação sob demanda: só quando útil (falha/pendente) e sem alterações pendentes -->
            <div v-if="canReindexNow" class="kb-embed-action">
              <UiButton
                variant="subtle"
                size="sm"
                type="button"
                :loading="reindexing"
                block
                @click="reindexNow"
              >
                Reindexar agora
              </UiButton>
              <p class="kb-embed-action-help">
                Força um novo cálculo do embedding sem alterar o conteúdo.
              </p>
            </div>
          </UiCard>

          <!-- Registro read-only -->
          <UiCard title="Registro" subtitle="Metadados do artigo.">
            <dl class="kb-meta">
              <div class="kb-meta-row">
                <dt>Autor</dt>
                <dd>{{ authorDisplay }}</dd>
              </div>
              <div class="kb-meta-row">
                <dt>Atualizado em</dt>
                <dd>{{ format.formatDateTime(original.updated_at) }}</dd>
              </div>
              <div class="kb-meta-row">
                <dt>ID do artigo</dt>
                <dd class="kb-mono">{{ original.id }}</dd>
              </div>
            </dl>
          </UiCard>
        </aside>
      </div>

      <!-- SubmitBar: barra de ações fixa ao final, com resumo de mudanças -->
      <div class="kb-submitbar" role="group" aria-label="Ações do formulário">
        <p class="kb-submitbar-status" :data-state="submitState" aria-live="polite">
          <span v-if="!dirty">Nenhuma alteração pendente.</span>
          <span v-else>{{ changeCount }} {{ changeCount === 1 ? 'campo alterado' : 'campos alterados' }}.</span>
        </p>
        <div class="kb-submitbar-actions">
          <UiButton variant="ghost" type="button" :disabled="saving" @click="cancel">Cancelar</UiButton>
          <UiButton type="submit" :loading="saving" :disabled="!dirty">Salvar e reindexar</UiButton>
        </div>
      </div>
    </form>

    <!-- Modal de confirmação: resumo das mudanças + aviso de reindexação/transição -->
    <UiModal v-model:open="confirmOpen" title="Confirmar alterações" width="md" :persistent="saving">
      <p class="kb-confirm-lead">Revise as mudanças antes de aplicar ao artigo #{{ articleId }}.</p>

      <ul v-if="changeList.length" class="kb-diff">
        <li v-for="d in changeList" :key="d.field" class="kb-diff-item">
          <span class="kb-diff-field">{{ d.label }}</span>
          <span class="kb-diff-from">{{ d.from }}</span>
          <span class="kb-diff-arrow" aria-hidden="true">→</span>
          <span class="kb-diff-to">{{ d.to }}</span>
        </li>
      </ul>

      <div v-if="contentChanged" class="kb-confirm-note kb-confirm-reindex" role="note">
        <span class="kb-confirm-note-icon" aria-hidden="true">↻</span>
        <span>O embedding será <strong>recalculado</strong> após salvar — a indexação ficará pendente até concluir.</span>
      </div>
      <div v-if="willPublish" class="kb-confirm-note kb-confirm-publish" role="note">
        <span class="kb-confirm-note-icon" aria-hidden="true">●</span>
        <span>O artigo será <strong>publicado</strong> e passará a aparecer para os solicitantes.</span>
      </div>
      <div v-if="willArchive" class="kb-confirm-note kb-confirm-archive" role="note">
        <span class="kb-confirm-note-icon" aria-hidden="true">▣</span>
        <span>O artigo será <strong>arquivado</strong> e sairá das buscas da base.</span>
      </div>

      <template #footer>
        <UiButton variant="ghost" type="button" :disabled="saving" @click="confirmOpen = false">Voltar</UiButton>
        <UiButton
          type="button"
          :variant="willArchive ? 'danger' : 'primary'"
          :loading="saving"
          @click="persist"
        >
          Salvar alterações
        </UiButton>
      </template>
    </UiModal>
  </UiPageLayout>
</template>

<script setup>
import { computed, nextTick, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import {
  UiPageLayout,
  UiCard,
  UiFormSection,
  UiFormField,
  UiStatusBadge,
  UiEmptyState,
  UiModal,
  UiButton,
  useForm,
  useToast,
  useConfirm,
  validators,
  format,
} from '../ui/index.js';
import * as api from '../api.js';

// O integrador garante api['kb-articles'] (resourceFactory → /v1/kb-articles).
// Fallback defensivo para não quebrar o build se ainda não tiver sido anexado.
const articles = api['kb-articles'] || api.kbArticles || (api.resourceFactory ? api.resourceFactory('kb-articles') : null);

const props = defineProps({ id: { type: [String, Number], default: null } });
const router = useRouter();
const toast = useToast();
const confirm = useConfirm();

const ROUTE_BASE = '/kb-articles';
const listTo = ROUTE_BASE;
const articleId = computed(() => (props.id != null ? String(props.id) : ''));
const detailTo = computed(() => (articleId.value ? ROUTE_BASE + '/' + articleId.value : ROUTE_BASE));

// --- estado de carregamento/persistência ---
const loading = ref(true);
const saving = ref(false);
const reindexing = ref(false);
const loadError = ref(null);
const notFound = ref(false);
const original = ref(null);
const confirmOpen = ref(false);

// --- refs de UI ---
const bodyEl = ref(null);
const tagInputEl = ref(null);
const bodyFocused = ref(false);
const previewOn = ref(false);
const tagDraft = ref('');

// --- enums do domínio: estado de publicação ---
const STATUS_OPTIONS = [
  { value: 'draft', label: 'Rascunho', tone: 'warning', description: 'Em edição. Visível apenas para a equipe, não aparece na base pública.' },
  { value: 'published', label: 'Publicado', tone: 'success', description: 'Visível na base de conhecimento e disponível para a busca por IA.' },
  { value: 'archived', label: 'Arquivado', tone: 'neutral', description: 'Fora das buscas. Mantido como histórico, sem aparecer aos solicitantes.' },
];
const STATUS_MAP = STATUS_OPTIONS.reduce((acc, o) => { acc[o.value] = o; return acc; }, {});
const statusLabelOf = (v) => (STATUS_MAP[v] && STATUS_MAP[v].label) || format.humanize(v) || '—';

// --- estado de indexação vetorial (embedding) ---
const EMBEDDING_META = {
  pending: { label: 'Indexação pendente', tone: 'warning', glyph: '↻', help: 'O embedding está na fila e será calculado em breve.' },
  indexed: { label: 'Indexado', tone: 'success', glyph: '✓', help: 'O conteúdo está no índice vetorial e disponível para a busca por IA.' },
  failed: { label: 'Falha na indexação', tone: 'error', glyph: '!', help: 'O cálculo do embedding falhou. Salvar novamente força uma nova tentativa.' },
};
const embeddingStatus = computed(() => (original.value && original.value.embedding_status) || 'pending');
const embeddingMeta = computed(() => EMBEDDING_META[embeddingStatus.value] || EMBEDDING_META.pending);
const embeddingLabel = computed(() => embeddingMeta.value.label);
const embeddingTone = computed(() => embeddingMeta.value.tone);
const embeddingGlyph = computed(() => embeddingMeta.value.glyph);
const embeddingHelp = computed(() => embeddingMeta.value.help);

// Reindexar sob demanda só faz sentido quando há um índice a recuperar (falha/pendente)
// e não há alterações pendentes (salvar já reindexa). A ação é fail-closed:
// se o backend ainda não montou /reindex, degrada com toast e não fabrica nada.
const canReindexNow = computed(() =>
  !!original.value &&
  !dirty.value &&
  typeof articles?.reindex === 'function' &&
  (embeddingStatus.value === 'failed' || embeddingStatus.value === 'pending')
);

// --- categorias sugeridas (datalist, não-restritivo) ---
const CATEGORY_SUGGESTIONS = [
  'Acesso e senhas',
  'Faturamento',
  'Hardware',
  'Software',
  'Rede e conectividade',
  'Procedimentos',
];

// --- toolbar do editor de conteúdo (markdown — insere no textarea, sem v-html) ---
const TOOLS = [
  { key: 'h2', glyph: 'H', title: 'Título', prefix: '## ', block: true },
  { key: 'bold', glyph: 'B', title: 'Negrito', wrap: '**' },
  { key: 'italic', glyph: 'I', title: 'Itálico', wrap: '_' },
  { key: 'code', glyph: '</>', title: 'Código', wrap: '`' },
  { key: 'list', glyph: '•', title: 'Lista', prefix: '- ', block: true },
  { key: 'quote', glyph: '"', title: 'Citação', prefix: '> ', block: true },
  { key: 'link', glyph: '🔗', title: 'Link', insert: '[texto](https://)' },
];

const f = useForm({
  initial: { title: '', body: '', category: '', tags: '', status: 'draft' },
  rules: {
    title: [validators.required('Informe o título do artigo.'), validators.minLen(3), validators.maxLen(160)],
    body: [validators.required('O conteúdo do artigo não pode ficar vazio.'), validators.minLen(20)],
    status: [validators.required('Selecione o estado de publicação.')],
  },
});

// --- tags: derivadas da string `tags` do formulário (separador vírgula) ---
const tags = computed(() => splitTags(f.values.tags));

function splitTags(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.map((t) => String(t).trim()).filter(Boolean);
  return String(raw)
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);
}
function setTags(list) {
  // dedup preservando ordem; persiste como string separada por vírgula.
  const seen = new Set();
  const out = [];
  for (const t of list) {
    const v = String(t).trim();
    if (v && !seen.has(v.toLowerCase())) { seen.add(v.toLowerCase()); out.push(v); }
  }
  f.setField('tags', out.join(', '));
}
function commitTag() {
  const v = tagDraft.value.trim().replace(/,+$/, '').trim();
  if (!v) { tagDraft.value = ''; return; }
  setTags([...tags.value, v]);
  tagDraft.value = '';
}
function onTagKeydown(e) {
  if (e.key === ',') { e.preventDefault(); commitTag(); return; }
  if (e.key === 'Backspace' && tagDraft.value === '' && tags.value.length) {
    e.preventDefault();
    removeTag(tags.value.length - 1);
  }
}
function removeTag(i) {
  const next = tags.value.slice();
  next.splice(i, 1);
  setTags(next);
}
function focusTagInput() {
  if (tagInputEl.value) tagInputEl.value.focus();
}

// --- estatísticas do corpo ---
const bodyStats = computed(() => {
  const text = (f.values.body || '').trim();
  const words = text ? text.split(/\s+/).filter(Boolean).length : 0;
  const chars = (f.values.body || '').length;
  const minutes = Math.max(1, Math.round(words / 200));
  return { words, chars, minutes };
});

const titleHint = computed(() => {
  const len = (f.values.title || '').length;
  return len ? len + '/160 caracteres' : 'Frase clara que descreve o problema ou a dúvida.';
});
const bodyHint = computed(() =>
  contentChanged.value
    ? 'O conteúdo mudou — salvar vai recalcular o embedding (reindexação).'
    : 'Use markdown simples. Salvar mantém o índice vetorial sincronizado.'
);

// --- pré-visualização (CSP-safe): blocos de texto puro derivados do markdown leve ---
const renderedBlocks = computed(() => {
  const text = (f.values.body || '').trim();
  if (!text) return [];
  const blocks = [];
  const paragraphs = text.split(/\n{2,}/);
  for (const raw of paragraphs) {
    const chunk = raw.replace(/\s+$/, '');
    if (!chunk.trim()) continue;
    const lines = chunk.split('\n');
    const h = lines[0].match(/^(#{1,3})\s+(.*)$/);
    if (h && lines.length === 1) {
      const level = h[1].length;
      blocks.push({ tag: level === 1 ? 'h2' : 'h3', kind: 'heading', text: stripInline(h[2].trim()) });
      continue;
    }
    const isList = lines.every((l) => /^\s*([-*]|\d+\.)\s+/.test(l));
    if (isList) {
      for (const l of lines) {
        blocks.push({ tag: 'p', kind: 'list-item', text: stripInline(l.replace(/^\s*([-*]|\d+\.)\s+/, '')) });
      }
      continue;
    }
    const isQuote = lines.every((l) => /^\s*>\s?/.test(l));
    if (isQuote) {
      blocks.push({ tag: 'p', kind: 'quote', text: stripInline(lines.map((l) => l.replace(/^\s*>\s?/, '')).join(' ').trim()) });
      continue;
    }
    blocks.push({ tag: 'p', kind: 'para', text: stripInline(lines.join(' ').trim()) });
  }
  return blocks;
});
// remove marcadores inline de ênfase/código para um preview legível (texto puro, sem v-html).
function stripInline(s) {
  return String(s)
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/_([^_]+)_/g, '$1')
    .replace(/`([^`]+)`/g, '$1');
}

// --- toolbar: aplica marcação no textarea preservando seleção ---
async function applyTool(tool) {
  if (previewOn.value) return; // edição só no modo editor
  const el = bodyEl.value;
  const value = f.values.body || '';
  if (!el) {
    // sem foco no campo: anexa ao final como fallback acessível
    const add = tool.insert || (tool.prefix || '') + (tool.wrap ? tool.wrap + tool.wrap : '');
    f.setField('body', value ? value + '\n' + add : add);
    return;
  }
  const start = el.selectionStart ?? value.length;
  const end = el.selectionEnd ?? value.length;
  const selected = value.slice(start, end);
  let next = value;
  let caret = end;

  if (tool.wrap) {
    const w = tool.wrap;
    next = value.slice(0, start) + w + (selected || 'texto') + w + value.slice(end);
    caret = start + w.length + (selected || 'texto').length + w.length;
  } else if (tool.block) {
    const lineStart = value.lastIndexOf('\n', start - 1) + 1;
    next = value.slice(0, lineStart) + tool.prefix + value.slice(lineStart);
    caret = end + tool.prefix.length;
  } else if (tool.insert) {
    next = value.slice(0, start) + tool.insert + value.slice(end);
    caret = start + tool.insert.length;
  }

  f.setField('body', next);
  await nextTick();
  el.focus();
  try { el.setSelectionRange(caret, caret); } catch { /* noop */ }
}

// --- hidratação do registro no formulário ---
function toFieldString(v) {
  return v === null || v === undefined ? '' : String(v);
}
function hydrate(rec) {
  original.value = rec;
  f.values.title = rec.title || '';
  f.values.body = rec.body || '';
  f.values.category = rec.category || '';
  f.values.tags = Array.isArray(rec.tags) ? rec.tags.join(', ') : toFieldString(rec.tags);
  f.values.status = rec.status || 'draft';
}

const authorDisplay = computed(() => {
  const a = original.value && original.value.author_id;
  return a != null && a !== '' ? '#' + a : '—';
});

async function load() {
  if (!articles) {
    loadError.value = 'Cliente da base de conhecimento indisponível.';
    loading.value = false;
    return;
  }
  if (!articleId.value) {
    notFound.value = true;
    loading.value = false;
    return;
  }
  loading.value = true;
  loadError.value = null;
  notFound.value = false;
  try {
    const rec = await articles.get(articleId.value);
    if (!rec || rec.id == null) {
      notFound.value = true;
    } else {
      hydrate(rec);
    }
  } catch (e) {
    if (e && e.status === 404) {
      notFound.value = true;
    } else {
      loadError.value = (e && e.message) || 'Não foi possível carregar o artigo.';
    }
  } finally {
    loading.value = false;
  }
}

// --- diff entre o estado atual e o original ---
const FIELD_LABELS = {
  title: 'Título',
  body: 'Conteúdo',
  category: 'Categoria',
  tags: 'Tags',
  status: 'Publicação',
};

function normalizeFor(field) {
  if (field === 'tags') return splitTags(f.values.tags).join(', ');
  const v = f.values[field];
  return v === null || v === undefined ? '' : String(v).trim();
}
function originalFor(field) {
  const orig = original.value || {};
  if (field === 'tags') return splitTags(orig.tags).join(', ');
  const v = orig[field];
  return v === null || v === undefined ? '' : String(v).trim();
}
function displayFor(field, raw) {
  if (raw === '' || raw === null || raw === undefined) return '— vazio —';
  if (field === 'status') return statusLabelOf(raw);
  if (field === 'body') {
    const s = String(raw).replace(/\s+/g, ' ').trim();
    return s.length > 64 ? s.slice(0, 61) + '…' : s;
  }
  return String(raw);
}

const changeList = computed(() => {
  if (!original.value) return [];
  const out = [];
  for (const field of Object.keys(FIELD_LABELS)) {
    const curr = normalizeFor(field);
    const prev = originalFor(field);
    if (curr !== prev) {
      out.push({ field, label: FIELD_LABELS[field], from: displayFor(field, prev), to: displayFor(field, curr) });
    }
  }
  return out;
});

const dirty = computed(() => changeList.value.length > 0);
const changeCount = computed(() => changeList.value.length);

// Mudança de título OU corpo dispara reindexação do embedding.
const contentChanged = computed(() =>
  !!original.value && (normalizeFor('title') !== originalFor('title') || normalizeFor('body') !== originalFor('body'))
);

const statusChanged = computed(() => !!original.value && f.values.status !== original.value.status);
const willPublish = computed(() => statusChanged.value && f.values.status === 'published');
const willArchive = computed(() => statusChanged.value && f.values.status === 'archived');

const submitState = computed(() => {
  if (willArchive.value) return 'archive';
  if (contentChanged.value || willPublish.value) return 'active';
  if (dirty.value) return 'dirty';
  return 'clean';
});

const pageTitle = computed(() => {
  const t = (original.value && original.value.title) || '';
  return t ? 'Editar: ' + t : 'Editar artigo';
});
const pageSubtitle = computed(() =>
  articleId.value
    ? 'Atualize o conteúdo do artigo #' + articleId.value + '; ao salvar, o embedding é reindexado.'
    : 'Edição do artigo da base de conhecimento.'
);

// --- ações ---
function discard() {
  if (original.value) hydrate(original.value);
  tagDraft.value = '';
  previewOn.value = false;
  toast.info('Alterações descartadas.');
}

async function cancel() {
  if (dirty.value) {
    const leave = await confirm({
      title: 'Descartar alterações?',
      message: 'Você tem alterações não salvas neste artigo. Sair sem salvar?',
      confirmLabel: 'Descartar',
      cancelLabel: 'Continuar editando',
      danger: true,
    });
    if (!leave) return;
  }
  router.push(detailTo.value);
}

async function onSubmit() {
  // incorpora tag em digitação ainda não confirmada
  if (tagDraft.value.trim()) commitTag();

  if (!f.validate()) {
    previewOn.value = false; // garante visibilidade do campo com erro
    toast.error('Revise os campos destacados.');
    return;
  }
  if (!dirty.value) {
    toast.info('Nenhuma alteração para salvar.');
    return;
  }
  // Transição sensível (publicar/arquivar) ou reindexação → confirmação dedicada com resumo.
  if (statusChanged.value || contentChanged.value) {
    confirmOpen.value = true;
    return;
  }
  const ok = await confirm({
    title: 'Salvar alterações',
    message: 'Aplicar ' + changeCount.value + (changeCount.value === 1 ? ' alteração' : ' alterações') + ' ao artigo #' + articleId.value + '?',
    confirmLabel: 'Salvar',
  });
  if (ok) await persist();
}

function buildPayload() {
  return {
    title: f.values.title.trim(),
    body: f.values.body.trim(),
    category: f.values.category ? f.values.category.trim() : null,
    tags: splitTags(f.values.tags).join(', '),
    status: f.values.status,
  };
}

async function persist() {
  if (saving.value) return; // anti-duplo-submit
  saving.value = true;
  try {
    const reindex = contentChanged.value;
    const updated = await articles.update(articleId.value, buildPayload());
    confirmOpen.value = false;
    if (updated && updated.id != null) hydrate(updated);
    toast.success('Artigo #' + articleId.value + ' salvo.', {
      detail: reindex ? 'Reindexação do embedding iniciada.' : '',
    });
    router.push(detailTo.value);
  } catch (e) {
    toast.error((e && e.message) || 'Falha ao salvar o artigo.', {
      code: e && e.status ? 'HTTP ' + e.status : '',
    });
  } finally {
    saving.value = false;
  }
}

// Reindexação sob demanda (ação de domínio real /v1/kb-articles/:id/reindex).
// Fail-closed: se o backend ainda não montou a rota (404/501/503), informa e não fabrica.
async function reindexNow() {
  if (reindexing.value || typeof articles?.reindex !== 'function') return;
  const ok = await confirm({
    title: 'Reindexar artigo',
    message: 'Recalcular o embedding do artigo #' + articleId.value + ' para a busca por IA?',
    confirmLabel: 'Reindexar',
  });
  if (!ok) return;
  reindexing.value = true;
  try {
    await articles.reindex(articleId.value);
    toast.success('Reindexação iniciada.', { detail: 'O embedding será recalculado em segundo plano.' });
    await load();
  } catch (e) {
    toast.error((e && e.message) || 'Não foi possível reindexar agora.', {
      code: e && e.status ? 'HTTP ' + e.status : '',
    });
  } finally {
    reindexing.value = false;
  }
}

onMounted(load);
</script>

<style scoped>
/* ---- banner de contexto ---- */
.kb-ctx {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--ui-space-3);
  padding: var(--ui-space-3) var(--ui-space-4);
  background: rgb(var(--ui-surface-2));
  border: 1px solid rgb(var(--ui-border));
  border-radius: var(--ui-radius-md);
}
.kb-ctx-ref {
  font-family: var(--ui-font-display);
  font-weight: 700;
  color: rgb(var(--ui-fg));
}
.kb-ctx-meta {
  font-size: var(--ui-text-sm);
  color: rgb(var(--ui-muted));
}
.kb-ctx-dirty {
  margin-left: auto;
  font-size: var(--ui-text-xs);
  font-weight: 700;
  color: rgb(var(--ui-warn));
  background: rgb(var(--ui-warn) / 0.14);
  padding: 3px 10px;
  border-radius: var(--ui-radius-pill);
}

/* ---- layout ---- */
.kb-form {
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-5);
}
.kb-grid {
  display: grid;
  grid-template-columns: minmax(0, 2fr) minmax(0, 1fr);
  gap: var(--ui-space-5);
  align-items: start;
}
.kb-col {
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-5);
  min-width: 0;
}
.kb-aside {
  position: sticky;
  top: var(--ui-space-4);
}

/* ---- RichTextArea ---- */
.kb-editor {
  display: flex;
  flex-direction: column;
  border: 1px solid rgb(var(--ui-border-strong));
  border-radius: var(--ui-radius-md);
  background: rgb(var(--ui-bg));
  overflow: hidden;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}
.kb-editor[data-focused='true'] {
  border-color: rgb(var(--ui-accent));
  box-shadow: 0 0 0 1px rgb(var(--ui-accent));
}
.kb-toolbar {
  display: flex;
  align-items: center;
  gap: 2px;
  padding: var(--ui-space-2);
  background: rgb(var(--ui-surface-2));
  border-bottom: 1px solid rgb(var(--ui-border));
}
.kb-tool {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 30px;
  height: 30px;
  padding: 0 7px;
  border: 1px solid transparent;
  border-radius: var(--ui-radius-sm);
  background: transparent;
  color: rgb(var(--ui-muted));
  cursor: pointer;
  transition: background 0.12s ease, color 0.12s ease, border-color 0.12s ease;
}
.kb-tool:hover {
  background: rgb(var(--ui-surface));
  color: rgb(var(--ui-fg));
  border-color: rgb(var(--ui-border));
}
.kb-tool:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.kb-tool:focus-visible {
  outline: 2px solid rgb(var(--ui-accent));
  outline-offset: 1px;
}
.kb-tool-glyph {
  font-family: var(--ui-font-display);
  font-weight: 700;
  font-size: var(--ui-text-sm);
}
.kb-toolbar-spacer {
  flex: 1 1 auto;
}
.kb-toolbar-hint {
  font-size: var(--ui-text-xs);
  color: rgb(var(--ui-faint));
  padding-right: var(--ui-space-1);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}
.kb-preview-toggle {
  border: 1px solid rgb(var(--ui-border-strong));
  border-radius: var(--ui-radius-sm);
  background: rgb(var(--ui-surface));
  color: rgb(var(--ui-fg));
  font: inherit;
  font-size: var(--ui-text-xs);
  font-weight: 600;
  padding: 5px 10px;
  cursor: pointer;
  transition: background 0.12s ease, border-color 0.12s ease, color 0.12s ease;
}
.kb-preview-toggle:hover {
  background: rgb(var(--ui-surface-2));
}
.kb-preview-toggle[data-on='true'] {
  background: rgb(var(--ui-accent) / 0.14);
  border-color: rgb(var(--ui-accent) / 0.5);
  color: rgb(var(--ui-accent-strong));
}
.kb-preview-toggle:focus-visible {
  outline: 2px solid rgb(var(--ui-accent));
  outline-offset: 1px;
}
.kb-textarea {
  border: 0 !important;
  border-radius: 0 !important;
  background: transparent !important;
  min-height: 280px;
  resize: vertical;
  line-height: 1.6;
  font-family: var(--ui-font-mono);
  font-size: var(--ui-text-md);
}
.kb-textarea:focus-visible {
  outline: none;
}

/* ---- preview ---- */
.kb-preview {
  min-height: 280px;
  padding: var(--ui-space-4);
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-3);
  line-height: 1.7;
  color: rgb(var(--ui-fg));
  overflow-wrap: anywhere;
}
.kb-preview-block {
  margin: 0;
}
.kb-preview-block[data-kind='heading'] {
  font-family: var(--ui-font-display);
  font-weight: 700;
  color: rgb(var(--ui-fg));
}
.kb-preview-block[data-kind='list-item'] {
  position: relative;
  padding-left: var(--ui-space-4);
  color: rgb(var(--ui-fg));
}
.kb-preview-block[data-kind='list-item']::before {
  content: '•';
  position: absolute;
  left: 4px;
  color: rgb(var(--ui-accent-strong));
  font-weight: 700;
}
.kb-preview-block[data-kind='quote'] {
  padding: var(--ui-space-2) var(--ui-space-3);
  border-left: 3px solid rgb(var(--ui-accent) / 0.5);
  background: rgb(var(--ui-surface-2));
  border-radius: var(--ui-radius-sm);
  color: rgb(var(--ui-muted));
  font-style: italic;
}
.kb-preview-empty {
  margin: 0;
  color: rgb(var(--ui-faint));
  font-style: italic;
}
.kb-editor-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ui-space-3);
  padding: var(--ui-space-2) var(--ui-space-3);
  background: rgb(var(--ui-surface-2));
  border-top: 1px solid rgb(var(--ui-border));
  font-size: var(--ui-text-xs);
  color: rgb(var(--ui-muted));
}
.kb-editor-read {
  color: rgb(var(--ui-faint));
}

/* ---- TagInput ---- */
.kb-tags {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--ui-space-2);
  padding: 6px 8px;
  border: 1px solid rgb(var(--ui-border-strong));
  border-radius: var(--ui-radius-sm);
  background: rgb(var(--ui-bg));
  cursor: text;
  min-height: 40px;
}
.kb-tags:focus-within {
  border-color: rgb(var(--ui-accent));
  box-shadow: 0 0 0 1px rgb(var(--ui-accent));
}
.kb-tag-list {
  display: contents;
  list-style: none;
  margin: 0;
  padding: 0;
}
.kb-tag {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 3px 4px 3px 10px;
  background: rgb(var(--ui-accent) / 0.12);
  color: rgb(var(--ui-accent-strong));
  border-radius: var(--ui-radius-pill);
  font-size: var(--ui-text-xs);
  font-weight: 600;
}
.kb-tag-label {
  line-height: 1.4;
}
.kb-tag-remove {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  border: 0;
  border-radius: var(--ui-radius-pill);
  background: rgb(var(--ui-accent) / 0.18);
  color: rgb(var(--ui-accent-strong));
  cursor: pointer;
  font-size: var(--ui-text-sm);
  line-height: 1;
  transition: background 0.12s ease;
}
.kb-tag-remove:hover {
  background: rgb(var(--ui-accent) / 0.34);
}
.kb-tag-remove:focus-visible {
  outline: 2px solid rgb(var(--ui-accent));
  outline-offset: 1px;
}
.kb-tag-input {
  flex: 1 1 120px;
  min-width: 120px;
  border: 0 !important;
  background: transparent !important;
  padding: 4px 2px !important;
}
.kb-tag-input:focus-visible {
  outline: none;
}

/* ---- StatusSelect ---- */
.kb-status {
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-2);
}
.kb-status-opt {
  position: relative;
  display: flex;
  align-items: flex-start;
  gap: var(--ui-space-3);
  padding: var(--ui-space-3) var(--ui-space-4);
  border: 1px solid rgb(var(--ui-border-strong));
  border-radius: var(--ui-radius-md);
  background: rgb(var(--ui-surface));
  cursor: pointer;
  transition: border-color 0.15s ease, background 0.15s ease, box-shadow 0.15s ease;
}
.kb-status-opt:hover {
  border-color: rgb(var(--ui-accent) / 0.6);
  background: rgb(var(--ui-surface-2));
}
.kb-status-opt[data-selected='true'] {
  border-color: rgb(var(--ui-accent));
  background: rgb(var(--ui-accent) / 0.08);
  box-shadow: 0 0 0 1px rgb(var(--ui-accent));
}
.kb-status-input {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: -1px;
  padding: 0;
  border: 0;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
}
.kb-status-mark {
  flex-shrink: 0;
  width: 18px;
  height: 18px;
  margin-top: 2px;
  border-radius: 50%;
  border: 2px solid rgb(var(--ui-border-strong));
  background: rgb(var(--ui-surface));
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}
.kb-status-opt[data-selected='true'] .kb-status-mark {
  border-color: rgb(var(--ui-accent));
  box-shadow: inset 0 0 0 4px rgb(var(--ui-accent));
}
.kb-status-input:focus-visible + .kb-status-mark {
  outline: 2px solid rgb(var(--ui-accent));
  outline-offset: 2px;
}
.kb-status-body {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}
.kb-status-head {
  display: flex;
  align-items: center;
  gap: var(--ui-space-2);
  flex-wrap: wrap;
}
.kb-status-name {
  font-weight: 700;
  color: rgb(var(--ui-fg));
}
.kb-status-desc {
  font-size: var(--ui-text-xs);
  color: rgb(var(--ui-muted));
  line-height: 1.45;
}
.kb-status-note {
  margin: var(--ui-space-3) 0 0;
  font-size: var(--ui-text-sm);
  color: rgb(var(--ui-fg));
  background: rgb(var(--ui-accent) / 0.10);
  border: 1px solid rgb(var(--ui-accent) / 0.30);
  border-radius: var(--ui-radius-md);
  padding: var(--ui-space-3);
  line-height: 1.5;
}

/* ---- indexação vetorial ---- */
.kb-embed {
  display: flex;
  align-items: flex-start;
  gap: var(--ui-space-3);
  padding: var(--ui-space-3);
  border-radius: var(--ui-radius-md);
  border: 1px solid rgb(var(--ui-border));
  background: rgb(var(--ui-surface-2));
}
.kb-embed-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 32px;
  height: 32px;
  border-radius: var(--ui-radius-pill);
  font-family: var(--ui-font-display);
  font-weight: 800;
  font-size: var(--ui-text-sm);
}
.kb-embed[data-tone='success'] .kb-embed-icon {
  background: rgb(var(--ui-ok) / 0.16);
  color: rgb(var(--ui-ok));
}
.kb-embed[data-tone='warning'] .kb-embed-icon {
  background: rgb(var(--ui-warn) / 0.18);
  color: rgb(var(--ui-warn));
}
.kb-embed[data-tone='error'] .kb-embed-icon {
  background: rgb(var(--ui-danger) / 0.16);
  color: rgb(var(--ui-danger));
}
.kb-embed-body {
  min-width: 0;
}
.kb-embed-state {
  margin: 0;
  font-weight: 700;
  color: rgb(var(--ui-fg));
  font-size: var(--ui-text-sm);
}
.kb-embed-help {
  margin: 2px 0 0;
  font-size: var(--ui-text-xs);
  color: rgb(var(--ui-muted));
  line-height: 1.45;
}
.kb-embed-reindex {
  margin: var(--ui-space-3) 0 0;
  display: flex;
  align-items: flex-start;
  gap: var(--ui-space-2);
  font-size: var(--ui-text-sm);
  color: rgb(var(--ui-fg));
  background: rgb(var(--ui-accent) / 0.10);
  border: 1px solid rgb(var(--ui-accent) / 0.30);
  border-radius: var(--ui-radius-md);
  padding: var(--ui-space-3);
  line-height: 1.5;
}
.kb-embed-reindex-mark {
  flex-shrink: 0;
  font-weight: 800;
  color: rgb(var(--ui-accent-strong));
}
.kb-embed-action {
  margin-top: var(--ui-space-3);
}
.kb-embed-action-help {
  margin: var(--ui-space-2) 0 0;
  font-size: var(--ui-text-xs);
  color: rgb(var(--ui-muted));
  text-align: center;
  line-height: 1.4;
}

/* ---- registro ---- */
.kb-meta {
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-2);
}
.kb-meta-row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--ui-space-3);
  padding-bottom: var(--ui-space-2);
  border-bottom: 1px solid rgb(var(--ui-border));
}
.kb-meta-row:last-child {
  border-bottom: none;
  padding-bottom: 0;
}
.kb-meta-row dt {
  font-size: var(--ui-text-sm);
  color: rgb(var(--ui-muted));
}
.kb-meta-row dd {
  margin: 0;
  font-weight: 600;
  color: rgb(var(--ui-fg));
  text-align: right;
}
.kb-mono {
  font-family: var(--ui-font-mono);
}

/* ---- SubmitBar ---- */
.kb-submitbar {
  position: sticky;
  bottom: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ui-space-4);
  flex-wrap: wrap;
  padding: var(--ui-space-3) var(--ui-space-4);
  background: rgb(var(--ui-surface));
  border: 1px solid rgb(var(--ui-border));
  border-radius: var(--ui-radius-lg);
  box-shadow: var(--ui-shadow-md);
}
.kb-submitbar-status {
  margin: 0;
  font-size: var(--ui-text-sm);
  color: rgb(var(--ui-muted));
}
.kb-submitbar-status[data-state='dirty'] {
  color: rgb(var(--ui-accent-strong));
  font-weight: 600;
}
.kb-submitbar-status[data-state='active'] {
  color: rgb(var(--ui-accent-strong));
  font-weight: 700;
}
.kb-submitbar-status[data-state='archive'] {
  color: rgb(var(--ui-warn));
  font-weight: 700;
}
.kb-submitbar-actions {
  display: flex;
  gap: var(--ui-space-2);
  flex-wrap: wrap;
}

/* ---- modal de confirmação ---- */
.kb-confirm-lead {
  margin: 0 0 var(--ui-space-3);
  color: rgb(var(--ui-muted));
}
.kb-diff {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-2);
}
.kb-diff-item {
  display: grid;
  grid-template-columns: minmax(84px, auto) 1fr auto 1fr;
  align-items: center;
  gap: var(--ui-space-3);
  padding: var(--ui-space-2) var(--ui-space-3);
  background: rgb(var(--ui-surface-2));
  border-radius: var(--ui-radius-sm);
  font-size: var(--ui-text-sm);
}
.kb-diff-field {
  font-weight: 700;
  color: rgb(var(--ui-fg));
}
.kb-diff-from {
  color: rgb(var(--ui-muted));
  text-decoration: line-through;
}
.kb-diff-arrow {
  color: rgb(var(--ui-faint));
}
.kb-diff-to {
  color: rgb(var(--ui-accent-strong));
  font-weight: 600;
}
.kb-confirm-note {
  display: flex;
  align-items: flex-start;
  gap: var(--ui-space-2);
  margin-top: var(--ui-space-3);
  padding: var(--ui-space-3);
  font-size: var(--ui-text-sm);
  color: rgb(var(--ui-fg));
  border-radius: var(--ui-radius-md);
  line-height: 1.5;
}
.kb-confirm-note-icon {
  flex-shrink: 0;
  font-weight: 800;
  line-height: 1.3;
}
.kb-confirm-reindex {
  background: rgb(var(--ui-accent) / 0.10);
  border: 1px solid rgb(var(--ui-accent) / 0.30);
}
.kb-confirm-reindex .kb-confirm-note-icon {
  color: rgb(var(--ui-accent-strong));
}
.kb-confirm-publish {
  background: rgb(var(--ui-ok) / 0.12);
  border: 1px solid rgb(var(--ui-ok) / 0.30);
}
.kb-confirm-publish .kb-confirm-note-icon {
  color: rgb(var(--ui-ok));
}
.kb-confirm-archive {
  background: rgb(var(--ui-warn) / 0.12);
  border: 1px solid rgb(var(--ui-warn) / 0.30);
}
.kb-confirm-archive .kb-confirm-note-icon {
  color: rgb(var(--ui-warn));
}

/* ---- responsivo ---- */
@media (max-width: 960px) {
  .kb-grid {
    grid-template-columns: 1fr;
  }
  .kb-aside {
    position: static;
  }
}
@media (max-width: 640px) {
  .kb-diff-item {
    grid-template-columns: 1fr;
    gap: var(--ui-space-1);
  }
  .kb-diff-from {
    text-decoration: none;
  }
  .kb-submitbar {
    align-items: stretch;
  }
  .kb-submitbar-actions {
    width: 100%;
  }
  .kb-submitbar-actions :deep(.ui-btn) {
    flex: 1 1 auto;
  }
}
</style>
