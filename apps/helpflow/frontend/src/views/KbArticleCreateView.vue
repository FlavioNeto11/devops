<template>
  <UiPageLayout
    eyebrow="Base de conhecimento"
    title="Novo artigo"
    subtitle="Escreva um artigo de ajuda, classifique e publique. Ao publicar, disparamos a indexação vetorial para que ele apareça nas sugestões dos chamados."
    width="wide"
  >
    <template #actions>
      <UiButton variant="ghost" type="button" @click="goBack">Voltar à base</UiButton>
    </template>

    <!-- Banner: faixa de contexto com progresso de preenchimento + estado-alvo -->
    <template #banner>
      <div class="kb-ctx" role="group" aria-label="Estado do rascunho">
        <div class="kb-ctx-meter" role="img" :aria-label="'Preenchimento ' + completion + ' por cento'">
          <span class="kb-ctx-meter-track">
            <span class="kb-ctx-meter-fill" :data-level="meterLevel" />
          </span>
          <span class="kb-ctx-meter-num">{{ completion }}%</span>
        </div>
        <span class="kb-ctx-label">Pronto para {{ willPublish ? 'publicar' : 'salvar como rascunho' }}</span>
        <span class="kb-ctx-spacer" aria-hidden="true" />
        <UiStatusBadge :status="f.values.status" :label="statusLabel(f.values.status)" with-dot />
        <UiStatusBadge :status="indexBadge.status" :tone="indexBadge.tone" :label="indexBadge.label" with-dot />
      </div>
    </template>

    <form class="kb-form" novalidate :aria-busy="categoriesLoading" @submit.prevent="onPrimarySubmit">
      <div class="kb-grid">
        <!-- ============================== COLUNA PRINCIPAL ============================== -->
        <div class="kb-main">
          <!-- ---- Conteúdo (FormSection + TextField + RichTextArea) ---- -->
          <UiCard title="Conteúdo do artigo" subtitle="O título e o texto que o solicitante vai ler.">
            <UiFormSection title="Identificação" description="Comece por um título claro e pesquisável." :columns="1">
              <UiFormField
                label="Título"
                :required="true"
                :error="f.errors.title"
                :hint="titleHint"
              >
                <template #default="{ id, describedBy, hasError }">
                  <input
                    :id="id"
                    type="text"
                    autocomplete="off"
                    maxlength="160"
                    placeholder="Ex.: Como emitir a segunda via do boleto"
                    :aria-describedby="describedBy"
                    :aria-invalid="hasError ? 'true' : null"
                    :disabled="categoriesLoading"
                    :value="f.values.title"
                    @input="f.setField('title', $event.target.value)"
                    @blur="f.validateField('title')"
                  />
                </template>
              </UiFormField>
            </UiFormSection>

            <UiFormSection
              title="Texto"
              description="Editor com formatação leve (Markdown). Selecione um trecho e use a barra para destacá-lo."
              :columns="1"
            >
              <UiFormField
                label="Conteúdo"
                :required="true"
                :error="f.errors.body"
                :hint="bodyHint"
              >
                <template #default="{ id, describedBy, hasError }">
                  <div
                    class="kb-editor"
                    :data-invalid="hasError ? 'true' : null"
                    :data-focused="bodyFocused ? 'true' : null"
                  >
                    <div class="kb-toolbar" role="toolbar" aria-label="Formatação do texto">
                      <button
                        v-for="tool in editorTools"
                        :key="tool.id"
                        type="button"
                        class="kb-tool"
                        :title="tool.title"
                        :aria-label="tool.title"
                        :disabled="categoriesLoading"
                        @click="applyTool(tool)"
                      >
                        <span class="kb-tool-glyph" aria-hidden="true">{{ tool.glyph }}</span>
                      </button>
                      <span class="kb-toolbar-spacer" aria-hidden="true" />
                      <button
                        type="button"
                        class="kb-tab"
                        :data-active="!showPreview ? 'true' : null"
                        :aria-pressed="!showPreview ? 'true' : 'false'"
                        @click="showPreview = false"
                      >Editar</button>
                      <button
                        type="button"
                        class="kb-tab"
                        :data-active="showPreview ? 'true' : null"
                        :aria-pressed="showPreview ? 'true' : 'false'"
                        @click="showPreview = true"
                      >Pré-visualizar</button>
                    </div>

                    <textarea
                      v-show="!showPreview"
                      :id="id"
                      ref="bodyEl"
                      rows="15"
                      class="kb-textarea"
                      placeholder="Descreva a solução em passos. Você pode usar # para títulos, **negrito**, *itálico*, `código`, listas com - e citações com >."
                      :aria-describedby="describedBy"
                      :aria-invalid="hasError ? 'true' : null"
                      :disabled="categoriesLoading"
                      :value="f.values.body"
                      @input="f.setField('body', $event.target.value)"
                      @focus="bodyFocused = true"
                      @blur="bodyFocused = false; f.validateField('body')"
                    />

                    <div v-show="showPreview" class="kb-preview" aria-live="polite">
                      <template v-if="previewBlocks.length">
                        <p
                          v-for="(block, i) in previewBlocks"
                          :key="i"
                          class="kb-preview-line"
                          :data-kind="block.kind"
                        >{{ block.text }}</p>
                      </template>
                      <p v-else class="kb-preview-empty">
                        Nada para pré-visualizar ainda. Escreva o conteúdo na aba “Editar”.
                      </p>
                    </div>

                    <div class="kb-editor-foot">
                      <span class="kb-editor-count">{{ wordCount }} palavras · {{ charCount }} caracteres</span>
                      <span class="kb-editor-read">~{{ readMinutes }} min de leitura</span>
                    </div>
                  </div>
                </template>
              </UiFormField>
            </UiFormSection>
          </UiCard>

          <!-- ---- Classificação (categoria + TagInput) ---- -->
          <UiCard title="Classificação" subtitle="Organiza a base e melhora as sugestões automáticas dos chamados.">
            <div v-if="categoriesLoading" class="kb-cat-loading" role="status" aria-live="polite">
              <span class="kb-cat-spin" aria-hidden="true" />
              <span>Carregando opções de categoria…</span>
            </div>
            <UiFormSection title="Categoria e tags" :columns="1">
              <UiFormField
                label="Categoria"
                :error="f.errors.category"
                :hint="categoriesLoading ? 'Carregando opções…' : 'Agrupe artigos por tema. Selecione uma sugestão ou digite a sua.'"
              >
                <template #default="{ id, describedBy }">
                  <input
                    :id="id"
                    type="text"
                    list="kb-category-options"
                    maxlength="60"
                    autocomplete="off"
                    placeholder="Ex.: Faturamento, Acesso e login, Integrações…"
                    :aria-describedby="describedBy"
                    :disabled="categoriesLoading"
                    :value="f.values.category"
                    @input="f.setField('category', $event.target.value)"
                  />
                  <datalist id="kb-category-options">
                    <option v-for="c in categorySuggestions" :key="c" :value="c" />
                  </datalist>
                </template>
              </UiFormField>

              <UiFormField
                label="Tags"
                :error="f.errors.tags"
                :hint="tagHint"
              >
                <template #default="{ id, describedBy }">
                  <div
                    class="kb-tags"
                    :data-empty="tags.length === 0 ? 'true' : null"
                    @click="focusTagInput"
                  >
                    <ul v-if="tags.length" class="kb-tag-list" aria-label="Tags adicionadas">
                      <li v-for="(t, i) in tags" :key="t + ':' + i" class="kb-tag">
                        <span class="kb-tag-text">{{ t }}</span>
                        <button
                          type="button"
                          class="kb-tag-x"
                          :aria-label="'Remover tag ' + t"
                          @click.stop="removeTag(i)"
                        ><span aria-hidden="true">×</span></button>
                      </li>
                    </ul>
                    <input
                      :id="id"
                      ref="tagInputEl"
                      type="text"
                      class="kb-tag-input"
                      autocomplete="off"
                      maxlength="32"
                      placeholder="Adicionar tag…"
                      :aria-describedby="describedBy"
                      :disabled="categoriesLoading"
                      :value="tagDraft"
                      @input="tagDraft = $event.target.value"
                      @keydown="onTagKeydown"
                      @blur="commitTag"
                    />
                  </div>
                </template>
              </UiFormField>

              <div v-if="tagSuggestions.length" class="kb-tag-suggest" aria-label="Sugestões de tags">
                <span class="kb-tag-suggest-label">Sugestões:</span>
                <button
                  v-for="s in tagSuggestions"
                  :key="s"
                  type="button"
                  class="kb-tag-chip"
                  @click="addTag(s)"
                >+ {{ s }}</button>
              </div>
            </UiFormSection>
          </UiCard>
        </div>

        <!-- ================================ TRILHA LATERAL ================================ -->
        <aside class="kb-rail" aria-label="Publicação, indexação e resumo">
          <!-- ---- Publicação (StatusSelect como cartões de rádio) ---- -->
          <UiCard title="Publicação" subtitle="Como o artigo entrará na base ao salvar.">
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
                    v-for="opt in statusOptions"
                    :key="opt.value"
                    class="kb-status-opt"
                    :data-selected="f.values.status === opt.value ? 'true' : 'false'"
                  >
                    <input
                      class="kb-status-input"
                      type="radio"
                      name="kb-status"
                      :value="opt.value"
                      :checked="f.values.status === opt.value"
                      :disabled="categoriesLoading"
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
          </UiCard>

          <!-- ---- Indexação vetorial (RAG): pipeline visual ---- -->
          <UiCard subtitle="O que acontece com a busca inteligente ao salvar.">
            <template #header>
              <div class="kb-idx-head">
                <h3 class="kb-idx-title">Indexação vetorial</h3>
                <UiStatusBadge
                  :status="indexBadge.status"
                  :tone="indexBadge.tone"
                  :label="indexBadge.label"
                  size="sm"
                />
              </div>
            </template>

            <p class="kb-idx-desc">{{ indexDescription }}</p>

            <ol class="kb-idx-steps" aria-label="Passos da indexação">
              <li
                v-for="step in indexSteps"
                :key="step.key"
                class="kb-idx-step"
                :data-state="step.state"
              >
                <span class="kb-idx-dot" aria-hidden="true" />
                <div class="kb-idx-step-body">
                  <span class="kb-idx-step-title">{{ step.title }}</span>
                  <span class="kb-idx-step-sub">{{ step.sub }}</span>
                </div>
              </li>
            </ol>
          </UiCard>

          <!-- ---- Resumo do rascunho ---- -->
          <UiCard title="Resumo">
            <dl class="kb-summary">
              <div class="kb-summary-row">
                <dt>Título</dt>
                <dd>
                  <span v-if="f.values.title">{{ truncate(f.values.title, 36) }}</span>
                  <span v-else class="kb-summary-empty">sem título</span>
                </dd>
              </div>
              <div class="kb-summary-row">
                <dt>Categoria</dt>
                <dd>
                  <span v-if="f.values.category">{{ f.values.category }}</span>
                  <span v-else class="kb-summary-empty">não classificado</span>
                </dd>
              </div>
              <div class="kb-summary-row">
                <dt>Tags</dt>
                <dd>
                  <span v-if="tags.length">{{ tags.length }} {{ tags.length === 1 ? 'tag' : 'tags' }}</span>
                  <span v-else class="kb-summary-empty">nenhuma</span>
                </dd>
              </div>
              <div class="kb-summary-row">
                <dt>Tamanho</dt>
                <dd>{{ wordCount }} palavras · {{ readMinutes }} min</dd>
              </div>
              <div class="kb-summary-row">
                <dt>Publicação</dt>
                <dd>
                  <UiStatusBadge :status="f.values.status" :label="statusLabel(f.values.status)" size="sm" />
                </dd>
              </div>
            </dl>
          </UiCard>

          <!-- ---- Checklist de qualidade ---- -->
          <UiCard title="Dicas para um bom artigo">
            <ul class="kb-tips">
              <li
                v-for="(tip, i) in writingTips"
                :key="i"
                class="kb-tip"
                :data-done="tip.done ? 'true' : null"
              >
                <span class="kb-tip-mark" aria-hidden="true">{{ tip.done ? '✓' : '○' }}</span>
                <span class="kb-tip-text">{{ tip.text }}</span>
              </li>
            </ul>
          </UiCard>
        </aside>
      </div>

      <!-- ================================== SUBMIT BAR ================================== -->
      <div class="kb-submitbar" role="group" aria-label="Ações do formulário">
        <p class="kb-submitbar-hint" :data-state="hasBlockingErrors ? 'warn' : willPublish ? 'publish' : 'draft'" aria-live="polite">
          <span v-if="hasBlockingErrors">Revise os campos destacados antes de salvar.</span>
          <span v-else-if="willPublish">
            Ao publicar, o artigo fica visível e entra na <strong>fila de indexação vetorial</strong>.
          </span>
          <span v-else>O artigo será salvo como <strong>rascunho</strong> — visível só para a equipe.</span>
        </p>
        <div class="kb-submitbar-actions">
          <UiButton variant="ghost" type="button" :disabled="f.submitting.value" @click="cancel">Cancelar</UiButton>
          <UiButton
            variant="subtle"
            type="button"
            :loading="f.submitting.value && pendingMode === 'draft'"
            :disabled="f.submitting.value && pendingMode !== 'draft'"
            @click="saveDraft"
          >Salvar rascunho</UiButton>
          <UiButton
            type="submit"
            :loading="f.submitting.value && pendingMode === 'publish'"
            :disabled="f.submitting.value && pendingMode !== 'publish'"
          >{{ willPublish ? 'Publicar artigo' : 'Salvar artigo' }}</UiButton>
        </div>
      </div>
    </form>
  </UiPageLayout>
</template>

<script setup>
import { ref, computed, nextTick, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import {
  UiPageLayout,
  UiCard,
  UiButton,
  UiFormSection,
  UiFormField,
  UiStatusBadge,
  useForm,
  useToast,
  useConfirm,
  validators,
} from '../ui/index.js';
import * as api from '../api.js';

// O integrador garante o recurso kb-articles (resourceFactory → /v1/kb-articles).
// Fallback defensivo para não quebrar o módulo se ainda não tiver sido anexado.
const kbArticles =
  api['kb-articles'] || api.kbArticles || (api.resourceFactory ? api.resourceFactory('kb-articles') : null);

const router = useRouter();
const toast = useToast();
const confirm = useConfirm();

// Rota de domínio da base de conhecimento. Resolvemos contra o router em tempo de
// navegação para nunca empurrar o usuário a uma rota inexistente (cairia em NotFound).
const KB_LIST_ROUTE = '/kb-articles';
function resolveKbRoute(path) {
  try {
    const r = router.resolve(path);
    if (r && r.matched && r.matched.length && r.name !== 'not-found') return path;
  } catch (e) {
    /* noop — cai no fallback abaixo */
  }
  try {
    const list = router.resolve(KB_LIST_ROUTE);
    if (list && list.matched && list.matched.length && list.name !== 'not-found') return KB_LIST_ROUTE;
  } catch (e) {
    /* noop */
  }
  return '/';
}
function goTo(path) {
  router.push(resolveKbRoute(path));
}

/* ----------------------------------- opções ----------------------------------- */
const statusOptions = [
  { value: 'draft', label: 'Rascunho', tone: 'warning', description: 'Visível apenas para a equipe. Publique quando o conteúdo estiver revisado.' },
  { value: 'published', label: 'Publicado', tone: 'success', description: 'Visível para os solicitantes e usado nas sugestões automáticas dos chamados.' },
  { value: 'archived', label: 'Arquivado', tone: 'neutral', description: 'Fora da base ativa: não aparece em buscas nem nas sugestões.' },
];
const statusLabel = (v) => (statusOptions.find((o) => o.value === v) || {}).label || '—';

const FALLBACK_CATEGORIES = [
  'Acesso e login',
  'Faturamento',
  'Integrações',
  'Configurações',
  'Erros comuns',
  'Primeiros passos',
];
const categoriesLoading = ref(true);
const dynamicCategories = ref([]);
const categorySuggestions = computed(() =>
  dynamicCategories.value.length ? dynamicCategories.value : FALLBACK_CATEGORIES,
);

onMounted(async () => {
  try {
    if (kbArticles) {
      const res = await kbArticles.list({ pageSize: 200 });
      const items = (res && res.data) || [];
      const cats = [...new Set(items.map((a) => a.category).filter(Boolean))].sort();
      if (cats.length) dynamicCategories.value = cats;
    }
  } catch {
    // fall back to FALLBACK_CATEGORIES
  } finally {
    categoriesLoading.value = false;
  }
});

const TAG_SUGGESTIONS = ['senha', 'login', 'boleto', 'integração', 'erro', 'configuração', 'primeiro acesso'];

/* ----------------------------------- formulário ----------------------------------- */
const f = useForm({
  initial: {
    title: '',
    body: '',
    category: '',
    status: 'draft',
  },
  rules: {
    title: [validators.required('Informe um título'), validators.minLen(6), validators.maxLen(160)],
    body: [validators.required('Escreva o conteúdo do artigo'), validators.minLen(20)],
    status: [validators.required('Defina a situação de publicação')],
  },
});

const hasBlockingErrors = computed(() => Object.keys(f.errors).length > 0);
const willPublish = computed(() => f.values.status === 'published');
const isDirty = computed(
  () => !!(f.values.title || f.values.body || f.values.category || tags.value.length),
);

/* ----------------------------------- tags (TagInput) ----------------------------------- */
const tags = ref([]);
const tagDraft = ref('');
const tagInputEl = ref(null);

function addTag(raw) {
  const v = String(raw || '').trim().replace(/^#/, '');
  if (!v) return;
  const exists = tags.value.some((t) => t.toLowerCase() === v.toLowerCase());
  if (!exists && tags.value.length < 12) tags.value = [...tags.value, v];
  tagDraft.value = '';
}
function commitTag() {
  if (tagDraft.value.trim()) addTag(tagDraft.value);
}
function removeTag(i) {
  tags.value = tags.value.filter((_, idx) => idx !== i);
}
function onTagKeydown(ev) {
  if (ev.key === 'Enter' || ev.key === ',') {
    ev.preventDefault();
    addTag(tagDraft.value);
  } else if (ev.key === 'Backspace' && tagDraft.value === '' && tags.value.length) {
    removeTag(tags.value.length - 1);
  }
}
function focusTagInput() {
  if (tagInputEl.value) tagInputEl.value.focus();
}
const tagSuggestions = computed(() =>
  TAG_SUGGESTIONS.filter((s) => !tags.value.some((t) => t.toLowerCase() === s.toLowerCase())).slice(0, 5),
);
const tagHint = computed(() =>
  tags.value.length
    ? tags.value.length + ' de 12 tags · Enter ou vírgula para adicionar.'
    : 'Palavras-chave que ajudam a busca. Pressione Enter ou vírgula para adicionar.',
);

/* ----------------------------------- editor (rich textarea) ----------------------------------- */
const bodyEl = ref(null);
const showPreview = ref(false);
const bodyFocused = ref(false);

const editorTools = [
  { id: 'h2', title: 'Título de seção', glyph: 'H', prefix: '## ', block: true },
  { id: 'bold', title: 'Negrito', glyph: 'B', wrap: '**' },
  { id: 'italic', title: 'Itálico', glyph: 'I', wrap: '*' },
  { id: 'code', title: 'Código', glyph: '</>', wrap: '`' },
  { id: 'list', title: 'Lista', glyph: '•', prefix: '- ', block: true },
  { id: 'quote', title: 'Citação', glyph: '❝', prefix: '> ', block: true },
];

async function applyTool(tool) {
  showPreview.value = false;
  await nextTick();
  const el = bodyEl.value;
  const text = f.values.body || '';
  let start = text.length;
  let end = text.length;
  if (el && typeof el.selectionStart === 'number') {
    start = el.selectionStart;
    end = el.selectionEnd;
  }
  const selected = text.slice(start, end);
  let next;
  let caret;
  if (tool.wrap) {
    const inner = selected || (tool.id === 'code' ? 'código' : 'texto');
    const insert = tool.wrap + inner + tool.wrap;
    next = text.slice(0, start) + insert + text.slice(end);
    caret = start + insert.length;
  } else {
    // bloco: prefixa a linha onde está o cursor
    const lineStart = text.lastIndexOf('\n', start - 1) + 1;
    const insert = tool.prefix;
    next = text.slice(0, lineStart) + insert + text.slice(lineStart);
    caret = end + insert.length;
  }
  f.setField('body', next);
  await nextTick();
  if (bodyEl.value) {
    bodyEl.value.focus();
    try { bodyEl.value.setSelectionRange(caret, caret); } catch (e) { /* noop */ }
  }
}

/* pré-visualização leve (sem v-html — quebramos em blocos classificados) */
const previewBlocks = computed(() => {
  const lines = String(f.values.body || '').split('\n');
  const out = [];
  for (const line of lines) {
    const t = line.trimEnd();
    if (!t.trim()) continue;
    let kind = 'p';
    let text = t;
    if (/^#{1,6}\s/.test(t)) { kind = 'h'; text = t.replace(/^#{1,6}\s/, ''); }
    else if (/^[-*]\s/.test(t)) { kind = 'li'; text = '• ' + t.replace(/^[-*]\s/, ''); }
    else if (/^>\s?/.test(t)) { kind = 'quote'; text = t.replace(/^>\s?/, ''); }
    // remove marcadores inline para leitura limpa (negrito/itálico/código)
    text = text.replace(/\*\*(.+?)\*\*/g, '$1').replace(/\*(.+?)\*/g, '$1').replace(/`(.+?)`/g, '$1');
    out.push({ kind, text });
  }
  return out;
});

/* ----------------------------------- métricas do conteúdo ----------------------------------- */
const wordCount = computed(() => {
  const w = String(f.values.body || '').trim().split(/\s+/).filter(Boolean);
  return w.length;
});
const charCount = computed(() => String(f.values.body || '').length);
const readMinutes = computed(() => Math.max(1, Math.round(wordCount.value / 200)));

const titleHint = computed(() => {
  const len = (f.values.title || '').length;
  return len ? len + '/160 caracteres' : 'Frase clara e pesquisável. Ex.: “Como redefinir a senha do portal”.';
});
const bodyHint = computed(() =>
  wordCount.value
    ? wordCount.value + ' palavras · ~' + readMinutes.value + ' min de leitura'
    : 'Use # para títulos, - para listas e **negrito** para deixar a leitura fácil.',
);

const truncate = (s, n) => {
  const t = String(s || '');
  return t.length > n ? t.slice(0, n - 1) + '…' : t;
};

/* ----------------------------------- progresso de preenchimento ----------------------------------- */
const completion = computed(() => {
  let done = 0;
  const total = 4;
  if ((f.values.title || '').trim().length >= 6) done += 1;
  if ((f.values.body || '').trim().length >= 20) done += 1;
  if ((f.values.category || '').trim()) done += 1;
  if (tags.value.length) done += 1;
  return Math.round((done / total) * 100);
});
const meterLevel = computed(() => {
  if (completion.value >= 75) return 'high';
  if (completion.value >= 50) return 'mid';
  return 'low';
});

/* ----------------------------------- indexação vetorial ----------------------------------- */
const indexBadge = computed(() => {
  if (willPublish.value) return { status: 'pending', tone: 'warning', label: 'Será indexado' };
  return { status: 'idle', tone: 'neutral', label: 'Não indexa rascunho' };
});
const indexDescription = computed(() =>
  willPublish.value
    ? 'Ao publicar, geramos o embedding do conteúdo e adicionamos ao índice vetorial. A partir daí o artigo aparece nas sugestões dos chamados.'
    : 'A indexação vetorial só roda em artigos publicados. Salve como rascunho para revisar antes; publique quando estiver pronto.',
);
const indexSteps = computed(() => {
  const active = willPublish.value;
  return [
    {
      key: 'save',
      title: 'Salvar artigo',
      sub: 'Conteúdo persistido na base de conhecimento.',
      state: 'pending',
    },
    {
      key: 'enqueue',
      title: 'Enfileirar embedding',
      sub: active ? 'Job de geração do vetor é disparado.' : 'Só ao publicar.',
      state: active ? 'pending' : 'skipped',
    },
    {
      key: 'index',
      title: 'Indexar no pgvector',
      sub: active ? 'Disponível nas buscas inteligentes.' : 'Aguardando publicação.',
      state: active ? 'pending' : 'skipped',
    },
  ];
});

/* ----------------------------------- checklist de qualidade ----------------------------------- */
const writingTips = computed(() => [
  { text: 'Título com a dúvida real do solicitante.', done: (f.values.title || '').trim().length >= 6 },
  { text: 'Pelo menos um parágrafo de solução (20+ caracteres).', done: (f.values.body || '').trim().length >= 20 },
  { text: 'Classifique numa categoria.', done: !!(f.values.category || '').trim() },
  { text: 'Adicione tags para a busca encontrar o artigo.', done: tags.value.length > 0 },
]);

/* ----------------------------------- submit ----------------------------------- */
const pendingMode = ref(null);

function buildPayload(vals) {
  return {
    title: vals.title.trim(),
    body: vals.body.trim(),
    category: vals.category ? vals.category.trim() : undefined,
    tags: tags.value.length ? tags.value.slice() : undefined,
    status: vals.status,
  };
}

async function persist(mode) {
  pendingMode.value = mode;
  await f.handleSubmit(async (vals) => {
    try {
      const payload = buildPayload(vals);
      const created = await kbArticles.create(payload);
      const id = created && created.id;
      if (vals.status === 'published') {
        toast.success('Artigo publicado', {
          detail: 'Indexação vetorial enfileirada — em instantes ele aparece nas sugestões.',
        });
      } else {
        toast.success('Rascunho salvo', {
          detail: id ? 'Artigo #' + id + ' guardado para revisão.' : 'Artigo guardado para revisão.',
        });
      }
      goTo(id ? KB_LIST_ROUTE + '/' + id : KB_LIST_ROUTE);
    } catch (e) {
      toast.error('Não foi possível salvar o artigo', {
        detail: e.message || 'Tente novamente.',
        code: e.status ? 'HTTP ' + e.status : '',
      });
    } finally {
      pendingMode.value = null;
    }
  });
  // se a validação barrou, libera o estado pendente
  if (!f.submitting.value) pendingMode.value = null;
}

async function onPrimarySubmit() {
  // garante a tag em digitação
  commitTag();
  if (willPublish.value) {
    const ok = await confirm({
      title: 'Publicar artigo?',
      message:
        'O artigo ficará visível para os solicitantes e entrará na fila de indexação vetorial para as sugestões automáticas. Você pode arquivar depois.',
      confirmLabel: 'Publicar',
      cancelLabel: 'Continuar editando',
    });
    if (!ok) return;
  }
  await persist('publish');
}

async function saveDraft() {
  commitTag();
  f.setField('status', 'draft');
  await persist('draft');
}

async function cancel() {
  if (isDirty.value) {
    const ok = await confirm({
      title: 'Descartar artigo?',
      message: 'As informações preenchidas serão perdidas. Deseja sair mesmo assim?',
      confirmLabel: 'Descartar',
      cancelLabel: 'Continuar editando',
      danger: true,
    });
    if (!ok) return;
  }
  goTo(KB_LIST_ROUTE);
}
function goBack() {
  goTo(KB_LIST_ROUTE);
}
</script>

<style scoped>
.kb-form { display: flex; flex-direction: column; gap: var(--ui-space-5); }

/* ---------------------------- banner de contexto ---------------------------- */
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
.kb-ctx-meter { display: inline-flex; align-items: center; gap: var(--ui-space-2); }
.kb-ctx-meter-track {
  width: 96px;
  height: 8px;
  border-radius: var(--ui-radius-pill);
  background: rgb(var(--ui-border-strong));
  overflow: hidden;
}
.kb-ctx-meter-fill {
  display: block;
  height: 100%;
  border-radius: var(--ui-radius-pill);
  background: rgb(var(--ui-accent));
  transition: width 0.25s ease, background 0.2s ease;
}
.kb-ctx-meter-fill[data-level="low"] { width: 34%; background: rgb(var(--ui-faint)); }
.kb-ctx-meter-fill[data-level="mid"] { width: 67%; background: rgb(var(--ui-accent)); }
.kb-ctx-meter-fill[data-level="high"] { width: 100%; background: rgb(var(--ui-ok)); }
.kb-ctx-meter-num { font-size: var(--ui-text-xs); font-weight: 700; color: rgb(var(--ui-fg)); }
.kb-ctx-label { font-size: var(--ui-text-sm); color: rgb(var(--ui-muted)); }
.kb-ctx-spacer { flex: 1 1 auto; }

/* ---------------------------- layout principal + trilha ---------------------------- */
.kb-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.7fr) minmax(308px, 1fr);
  gap: var(--ui-space-5);
  align-items: start;
}
.kb-main { display: flex; flex-direction: column; gap: var(--ui-space-4); min-width: 0; }
.kb-rail {
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-4);
  min-width: 0;
  position: sticky;
  top: var(--ui-space-4);
}

/* ---------------------------- editor (RichTextArea) ---------------------------- */
.kb-editor {
  display: flex;
  flex-direction: column;
  border: 1px solid rgb(var(--ui-border-strong));
  border-radius: var(--ui-radius-md);
  overflow: hidden;
  background: rgb(var(--ui-bg));
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}
.kb-editor[data-focused="true"] {
  border-color: rgb(var(--ui-accent));
  box-shadow: 0 0 0 1px rgb(var(--ui-accent));
}
.kb-editor[data-invalid="true"] {
  border-color: rgb(var(--ui-danger));
  box-shadow: 0 0 0 1px rgb(var(--ui-danger) / 0.4);
}
.kb-toolbar {
  display: flex;
  align-items: center;
  gap: var(--ui-space-1);
  flex-wrap: wrap;
  padding: var(--ui-space-2);
  background: rgb(var(--ui-surface-2));
  border-bottom: 1px solid rgb(var(--ui-border));
}
.kb-tool {
  min-width: 30px;
  height: 30px;
  padding: 0 var(--ui-space-2);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: rgb(var(--ui-muted));
  background: transparent;
  border: 1px solid transparent;
  border-radius: var(--ui-radius-sm);
  cursor: pointer;
  transition: background 0.12s ease, color 0.12s ease, border-color 0.12s ease;
}
.kb-tool:hover { background: rgb(var(--ui-accent) / 0.12); color: rgb(var(--ui-accent-strong)); }
.kb-tool:focus-visible { outline: 2px solid rgb(var(--ui-accent)); outline-offset: 1px; }
.kb-tool-glyph { font-family: var(--ui-font-display); font-weight: 700; font-size: var(--ui-text-sm); }
.kb-toolbar-spacer { flex: 1 1 auto; }
.kb-tab {
  height: 28px;
  padding: 0 var(--ui-space-3);
  display: inline-flex;
  align-items: center;
  font-size: var(--ui-text-xs);
  font-weight: 600;
  color: rgb(var(--ui-muted));
  background: transparent;
  border: 1px solid transparent;
  border-radius: var(--ui-radius-sm);
  cursor: pointer;
  transition: background 0.12s ease, color 0.12s ease;
}
.kb-tab:hover { color: rgb(var(--ui-fg)); }
.kb-tab[data-active="true"] {
  background: rgb(var(--ui-accent) / 0.14);
  color: rgb(var(--ui-accent-strong));
}
.kb-tab:focus-visible { outline: 2px solid rgb(var(--ui-accent)); outline-offset: 1px; }
.kb-textarea {
  border: none !important;
  border-radius: 0 !important;
  background: transparent !important;
  min-height: 300px;
  line-height: 1.6;
  font-family: var(--ui-font-sans);
  resize: vertical;
}
.kb-textarea:focus-visible { outline: none; }

/* pré-visualização */
.kb-preview {
  padding: var(--ui-space-4) var(--ui-space-5);
  min-height: 300px;
  background: rgb(var(--ui-surface));
}
.kb-preview-line { margin: 0 0 var(--ui-space-3); color: rgb(var(--ui-fg)); font-size: var(--ui-text-md); line-height: 1.6; }
.kb-preview-line[data-kind="h"] { font-family: var(--ui-font-display); font-weight: 700; font-size: var(--ui-text-xl); margin-top: var(--ui-space-4); }
.kb-preview-line[data-kind="li"] { padding-left: var(--ui-space-3); }
.kb-preview-line[data-kind="quote"] {
  padding: var(--ui-space-2) var(--ui-space-4);
  border-left: 3px solid rgb(var(--ui-accent) / 0.5);
  color: rgb(var(--ui-muted));
  font-style: italic;
}
.kb-preview-empty { margin: 0; color: rgb(var(--ui-faint)); font-style: italic; }

/* rodapé do editor: contadores */
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
.kb-editor-read { color: rgb(var(--ui-faint)); }

/* ---------------------------- tags ---------------------------- */
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
  min-height: 42px;
}
.kb-tags:focus-within { border-color: rgb(var(--ui-accent)); box-shadow: 0 0 0 1px rgb(var(--ui-accent)); }
.kb-tag-list { display: contents; list-style: none; margin: 0; padding: 0; }
.kb-tag {
  display: inline-flex;
  align-items: center;
  gap: var(--ui-space-1);
  padding: 3px 4px 3px 10px;
  background: rgb(var(--ui-accent) / 0.12);
  color: rgb(var(--ui-accent-strong));
  border-radius: var(--ui-radius-pill);
  font-size: var(--ui-text-xs);
  font-weight: 600;
}
.kb-tag-text { white-space: nowrap; }
.kb-tag-x {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  border: none;
  border-radius: 50%;
  background: rgb(var(--ui-accent) / 0.18);
  color: inherit;
  font-size: var(--ui-text-md);
  line-height: 1;
  cursor: pointer;
  transition: background 0.12s ease;
}
.kb-tag-x:hover { background: rgb(var(--ui-accent) / 0.34); }
.kb-tag-x:focus-visible { outline: 2px solid rgb(var(--ui-accent)); outline-offset: 1px; }
.kb-tag-input {
  flex: 1 1 140px;
  min-width: 120px;
  border: none !important;
  background: transparent !important;
  padding: 4px 6px !important;
}
.kb-tag-input:focus-visible { outline: none; }

/* sugestões de tags */
.kb-tag-suggest {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--ui-space-2);
  margin-top: var(--ui-space-3);
}
.kb-tag-suggest-label { font-size: var(--ui-text-xs); color: rgb(var(--ui-muted)); }
.kb-tag-chip {
  padding: 3px 10px;
  font-size: var(--ui-text-xs);
  font-weight: 600;
  color: rgb(var(--ui-muted));
  background: rgb(var(--ui-surface-2));
  border: 1px dashed rgb(var(--ui-border-strong));
  border-radius: var(--ui-radius-pill);
  cursor: pointer;
  transition: background 0.12s ease, color 0.12s ease, border-color 0.12s ease;
}
.kb-tag-chip:hover {
  background: rgb(var(--ui-accent) / 0.12);
  color: rgb(var(--ui-accent-strong));
  border-color: rgb(var(--ui-accent) / 0.5);
}
.kb-tag-chip:focus-visible { outline: 2px solid rgb(var(--ui-accent)); outline-offset: 1px; }

/* ---------------------------- publicação (StatusSelect) ---------------------------- */
.kb-status { display: flex; flex-direction: column; gap: var(--ui-space-2); }
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
.kb-status-opt[data-selected="true"] {
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
.kb-status-opt[data-selected="true"] .kb-status-mark {
  border-color: rgb(var(--ui-accent));
  box-shadow: inset 0 0 0 4px rgb(var(--ui-accent));
}
.kb-status-input:focus-visible + .kb-status-mark {
  outline: 2px solid rgb(var(--ui-accent));
  outline-offset: 2px;
}
.kb-status-body { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.kb-status-head { display: flex; align-items: center; gap: var(--ui-space-2); flex-wrap: wrap; }
.kb-status-name { font-weight: 700; color: rgb(var(--ui-fg)); }
.kb-status-desc { font-size: var(--ui-text-xs); color: rgb(var(--ui-muted)); line-height: 1.45; }

/* ---------------------------- indexação vetorial ---------------------------- */
.kb-idx-head { display: flex; align-items: center; gap: var(--ui-space-3); }
.kb-idx-title { font-size: var(--ui-text-lg); }
.kb-idx-desc { margin: 0 0 var(--ui-space-4); font-size: var(--ui-text-sm); color: rgb(var(--ui-muted)); line-height: 1.5; }
.kb-idx-steps { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; }
.kb-idx-step { position: relative; display: flex; gap: var(--ui-space-3); padding-bottom: var(--ui-space-4); }
.kb-idx-step:last-child { padding-bottom: 0; }
.kb-idx-step::before {
  content: '';
  position: absolute;
  left: 5px;
  top: 16px;
  bottom: 0;
  width: 2px;
  background: rgb(var(--ui-border));
}
.kb-idx-step:last-child::before { display: none; }
.kb-idx-dot {
  flex-shrink: 0;
  width: 12px;
  height: 12px;
  margin-top: 3px;
  border-radius: 50%;
  background: rgb(var(--ui-border-strong));
  z-index: 1;
}
.kb-idx-step[data-state="pending"] .kb-idx-dot { background: rgb(var(--ui-accent)); box-shadow: 0 0 0 3px rgb(var(--ui-accent) / 0.18); }
.kb-idx-step[data-state="skipped"] { opacity: 0.55; }
.kb-idx-step-body { display: flex; flex-direction: column; gap: 1px; }
.kb-idx-step-title { font-size: var(--ui-text-sm); font-weight: 600; color: rgb(var(--ui-fg)); }
.kb-idx-step[data-state="skipped"] .kb-idx-step-title { color: rgb(var(--ui-muted)); }
.kb-idx-step-sub { font-size: var(--ui-text-xs); color: rgb(var(--ui-muted)); }

/* ---------------------------- resumo ---------------------------- */
.kb-summary { margin: 0; display: flex; flex-direction: column; gap: var(--ui-space-2); }
.kb-summary-row { display: flex; align-items: center; justify-content: space-between; gap: var(--ui-space-3); }
.kb-summary-row dt { margin: 0; color: rgb(var(--ui-muted)); font-size: var(--ui-text-sm); }
.kb-summary-row dd { margin: 0; font-size: var(--ui-text-sm); color: rgb(var(--ui-fg)); font-weight: 600; text-align: right; }
.kb-summary-empty { color: rgb(var(--ui-faint)); font-weight: 400; font-style: italic; }

/* ---------------------------- dicas ---------------------------- */
.kb-tips { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--ui-space-2); }
.kb-tip { display: flex; align-items: flex-start; gap: var(--ui-space-2); font-size: var(--ui-text-sm); color: rgb(var(--ui-muted)); }
.kb-tip-mark { flex-shrink: 0; width: 18px; text-align: center; color: rgb(var(--ui-faint)); font-weight: 700; }
.kb-tip[data-done="true"] { color: rgb(var(--ui-fg)); }
.kb-tip[data-done="true"] .kb-tip-mark { color: rgb(var(--ui-ok)); }

/* ---------------------------- submit bar ---------------------------- */
.kb-submitbar {
  position: sticky;
  bottom: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ui-space-4);
  flex-wrap: wrap;
  padding: var(--ui-space-3) var(--ui-space-5);
  background: rgb(var(--ui-surface));
  border: 1px solid rgb(var(--ui-border));
  border-radius: var(--ui-radius-lg);
  box-shadow: var(--ui-shadow-md);
}
.kb-submitbar-hint { margin: 0; font-size: var(--ui-text-sm); color: rgb(var(--ui-muted)); }
.kb-submitbar-hint[data-state="warn"] { color: rgb(var(--ui-danger)); font-weight: 600; }
.kb-submitbar-hint[data-state="publish"] strong { color: rgb(var(--ui-accent-strong)); }
.kb-submitbar-actions { display: flex; gap: var(--ui-space-2); flex-shrink: 0; flex-wrap: wrap; }

/* ---------------------------- loading de categorias ---------------------------- */
.kb-cat-loading {
  display: flex;
  align-items: center;
  gap: var(--ui-space-2);
  padding: var(--ui-space-2) 0 var(--ui-space-3);
  color: rgb(var(--ui-muted));
  font-size: var(--ui-text-sm);
}
.kb-cat-spin {
  display: inline-block;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  border: 2px solid rgb(var(--ui-border-strong));
  border-top-color: rgb(var(--ui-accent));
  animation: kb-spin 0.6s linear infinite;
  flex-shrink: 0;
}
@keyframes kb-spin { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) { .kb-cat-spin { animation: none; } }

/* ---------------------------- responsivo ---------------------------- */
@media (max-width: 980px) {
  .kb-grid { grid-template-columns: 1fr; }
  .kb-rail { position: static; }
}
@media (max-width: 640px) {
  .kb-submitbar { flex-direction: column; align-items: stretch; }
  .kb-submitbar-actions { justify-content: stretch; }
  .kb-submitbar-actions :deep(.ui-btn) { flex: 1; }
}
</style>
