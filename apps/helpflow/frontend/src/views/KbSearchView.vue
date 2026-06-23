<template>
  <UiPageLayout
    width="wide"
    eyebrow="HelpFlow · Base de Conhecimento"
    title="Busca grounded na base de conhecimento"
    subtitle="Faça uma pergunta em linguagem natural. A resposta é fundamentada nos artigos reais publicados e indexados — cada citação aponta para a fonte, nunca fabrica conteúdo."
    :loading="initialLoading"
    loading-message="Carregando a base de conhecimento…"
    :error="corpusErrorMessage"
    @retry="loadCorpus"
  >
    <!-- atalhos de domínio -->
    <template #actions>
      <UiButton variant="ghost" to="/kb-articles">
        <template #icon-left><span class="kb-ico" aria-hidden="true">▤</span></template>
        Gerenciar artigos
      </UiButton>
      <UiButton variant="ghost" to="/tickets">
        <template #icon-left><span class="kb-ico" aria-hidden="true">◷</span></template>
        Chamados
      </UiButton>
    </template>

    <!-- banner informativo do método grounded -->
    <template #banner>
      <div class="kb-banner" role="note">
        <span class="kb-banner-ico" aria-hidden="true">🔎</span>
        <p class="kb-banner-text">
          A busca é <strong>grounded</strong>: só recupera de artigos <strong>publicados e indexados</strong>
          ({{ formatNumber(corpusStats.searchable) }} de {{ formatNumber(corpusStats.total) }} na base).
          Cada resposta <strong>cita</strong> a fonte — abra o artigo para conferir o conteúdo completo.
        </p>
      </div>
    </template>

    <!-- ============================ CAMPO DE BUSCA ============================ -->
    <UiCard class="kb-search-card">
      <form class="kb-search" role="search" aria-label="Buscar na base de conhecimento" @submit.prevent="runSearch">
        <UiFormField
          label="Sua pergunta"
          :hint="searchHint"
          full-width
        >
          <template #default="{ id: fid, describedBy }">
            <div class="kb-search-row">
              <span class="kb-search-glyph" aria-hidden="true">🔎</span>
              <input
                :id="fid"
                ref="searchInput"
                v-model="queryInput"
                type="search"
                inputmode="search"
                autocomplete="off"
                enterkeyhint="search"
                class="kb-search-input"
                placeholder="Ex.: como redefinir a senha de um cliente?"
                :aria-describedby="describedBy"
                :disabled="searchDisabled"
              />
              <button
                v-if="queryInput"
                type="button"
                class="kb-search-clear"
                aria-label="Limpar pergunta"
                @click="clearQuery"
              >×</button>
            </div>
          </template>
        </UiFormField>

        <div class="kb-search-actions">
          <UiButton
            type="submit"
            variant="primary"
            :loading="searching"
            :disabled="searchDisabled || !canSearch"
          >
            <template #icon-left><span aria-hidden="true">➜</span></template>
            Buscar
          </UiButton>
          <UiButton
            v-if="hasSearched"
            type="button"
            variant="ghost"
            :disabled="searching"
            @click="resetSearch"
          >Nova busca</UiButton>
        </div>
      </form>

      <!-- sugestões de exemplo derivadas das categorias reais do corpus -->
      <div
        v-if="!hasSearched && exampleQueries.length"
        class="kb-suggest"
        role="group"
        aria-label="Exemplos de perguntas"
      >
        <span class="kb-suggest-label">Experimente:</span>
        <button
          v-for="ex in exampleQueries"
          :key="ex"
          type="button"
          class="kb-suggest-chip"
          :disabled="searchDisabled"
          @click="useExample(ex)"
        >{{ ex }}</button>
      </div>
    </UiCard>

    <!-- ============================ ESTADOS ============================ -->

    <!-- corpus vazio: não há artigos na base -->
    <UiCard v-if="!corpusLoading && !corpusError && corpusStats.total === 0">
      <UiEmptyState
        icon="doc"
        title="A base de conhecimento está vazia"
        description="Escreva e publique o primeiro artigo. Depois de indexado, ele passa a ser recuperável aqui pela busca grounded."
      >
        <template #action>
          <UiButton variant="primary" to="/kb-articles/new">Escrever primeiro artigo</UiButton>
        </template>
      </UiEmptyState>
    </UiCard>

    <!-- corpus existe mas nenhum artigo indexado -->
    <UiCard v-else-if="!corpusLoading && !corpusError && corpusStats.total > 0 && corpusStats.searchable === 0">
      <UiEmptyState
        icon="clock"
        title="Nenhum artigo indexado ainda"
        :description="notIndexedDescription"
      >
        <template #action>
          <UiButton variant="primary" to="/kb-articles">Ver status de indexação</UiButton>
        </template>
      </UiEmptyState>
    </UiCard>

    <!-- buscando: indicador de processamento -->
    <UiCard v-else-if="searching" title="Recuperando resposta grounded…">
      <UiLoadingState variant="skeleton" :skeleton-lines="5" />
    </UiCard>

    <!-- erro na busca: fail-closed, sem resposta fabricada -->
    <UiCard v-else-if="hasSearched && searchError">
      <UiErrorState
        :message="searchErrorMessage"
        :code="searchError.status"
        :retryable="true"
        @retry="retrySearch"
      >
        <template #action>
          <UiButton variant="ghost" size="sm" @click="resetSearch">Nova busca</UiButton>
        </template>
      </UiErrorState>
    </UiCard>

    <!-- sem artigos relevantes: estado vazio convidando a refinar -->
    <UiCard v-else-if="hasSearched && !searching && !searchError && !citations.length">
      <UiEmptyState
        icon="search"
        title="Nenhum artigo relevante encontrado"
        :description="noResultsDescription"
      >
        <template #action>
          <UiButton variant="ghost" @click="resetSearch">Refazer a busca</UiButton>
        </template>
      </UiEmptyState>
    </UiCard>

    <!-- resultados: resposta grounded + citações verificáveis -->
    <section
      v-else-if="hasSearched && !searching && !searchError && citations.length"
      class="kb-results"
      aria-label="Resposta grounded da base de conhecimento"
    >
      <UiCard class="kb-answer-card">
        <header class="kb-answer-head">
          <h2 class="kb-results-title">
            Resposta para <span class="kb-results-q">"{{ lastQuery }}"</span>
          </h2>
          <p class="kb-results-sub">Fundamentada em {{ citations.length }} artigo(s) publicado(s) e indexado(s).</p>
        </header>

        <blockquote class="kb-answer-text">{{ answer }}</blockquote>

        <!-- citações verificáveis: link direto para o artigo-fonte -->
        <div class="kb-citations-section">
          <p class="kb-citations-header">
            <span aria-hidden="true">◆</span>
            Fontes citadas — clique para abrir o artigo completo
          </p>
          <div class="kb-citations-list">
            <RouterLink
              v-for="c in citations"
              :key="c.id"
              :to="'/kb-articles/' + c.id"
              class="kb-citation-card"
            >
              <div class="kb-citation-top">
                <span class="kb-chip-glyph" aria-hidden="true">📄</span>
                <span class="kb-citation-title">{{ c.title }}</span>
                <span class="kb-citation-ref ui-mono">#{{ c.id }}</span>
                <span v-if="c.category" class="kb-citation-cat">{{ c.category }}</span>
              </div>
              <p v-if="c.snippet" class="kb-citation-snippet">{{ c.snippet }}</p>
              <div v-if="c.tags && c.tags.length" class="kb-citation-tags">
                <span v-for="t in c.tags" :key="t" class="kb-chip kb-chip-tag">
                  <span class="kb-chip-glyph" aria-hidden="true">#</span>{{ t }}
                </span>
              </div>
            </RouterLink>
          </div>
        </div>
      </UiCard>

      <p class="kb-grounding-note" role="note">
        <span aria-hidden="true">◆</span>
        Resposta fundamentada em artigos publicados e indexados. Confira as fontes antes de responder ao cliente.
      </p>
    </section>

    <!-- idle: corpus pronto, aguardando pergunta -->
    <UiCard v-else-if="!hasSearched && corpusStats.searchable > 0">
      <UiEmptyState
        icon="search"
        title="Pergunte algo para começar"
        :description="idleDescription"
      >
        <template #action>
          <UiButton variant="ghost" to="/kb-articles">Explorar todos os artigos</UiButton>
        </template>
      </UiEmptyState>
    </UiCard>
  </UiPageLayout>
</template>

<script setup>
import { ref, computed, onMounted, nextTick } from 'vue';
import { RouterLink } from 'vue-router';
import {
  UiPageLayout,
  UiCard,
  UiButton,
  UiFormField,
  UiEmptyState,
  UiErrorState,
  UiLoadingState,
  useToast,
  format,
} from '../ui/index.js';
import { kbArticles, kbSearch } from '../api.js';

const toast = useToast();
const formatNumber = format.formatNumber;

// ---- corpus: carregado apenas para estatísticas do banner e sugestões ----
const corpus = ref([]);
const corpusLoading = ref(false);
const corpusLoaded = ref(false);
const corpusError = ref(null);

const initialLoading = computed(() => corpusLoading.value && !corpusLoaded.value);
const corpusErrorMessage = computed(() => {
  if (!corpusError.value) return null;
  const code = corpusError.value.status ? ' (HTTP ' + corpusError.value.status + ')' : '';
  return (corpusError.value.message || 'Não foi possível carregar a base de conhecimento.') + code;
});

function isSearchable(a) {
  return (
    String(a.status || '').toLowerCase() === 'published' &&
    String(a.embedding_status || '').toLowerCase() === 'indexed'
  );
}

const corpusStats = computed(() => ({
  total: corpus.value.length,
  searchable: corpus.value.filter(isSearchable).length,
  published: corpus.value.filter((a) => String(a.status || '').toLowerCase() === 'published').length,
}));

const notIndexedDescription = computed(() => {
  const pub = corpusStats.value.published;
  if (!pub) return 'Há artigos na base, mas nenhum está publicado. Publique um artigo para que ele possa ser recuperado.';
  return (
    'Há ' + formatNumber(pub) +
    ' artigo(s) publicado(s), mas a indexação ainda não concluiu. Aguarde a conclusão para buscar.'
  );
});

async function loadCorpus() {
  corpusLoading.value = true;
  corpusError.value = null;
  try {
    const res = await kbArticles.list({ pageSize: 200, sort: 'updated_at', dir: 'desc' });
    const list = Array.isArray(res) ? res : (res && (res.data || res.items)) || [];
    corpus.value = list;
    corpusLoaded.value = true;
  } catch (e) {
    corpusError.value = e;
    corpus.value = [];
  } finally {
    corpusLoading.value = false;
  }
}

// ---- estado de busca ----
const queryInput = ref('');
const lastQuery = ref('');
const searching = ref(false);
const hasSearched = ref(false);
const searchError = ref(null);
const answer = ref('');
const citations = ref([]);
const searchInput = ref(null);

const searchDisabled = computed(
  () => corpusLoading.value || !!corpusError.value || corpusStats.value.searchable === 0,
);
const canSearch = computed(() => queryInput.value.trim().length >= 2);

const searchHint = computed(() => {
  if (corpusStats.value.searchable === 0) return 'A busca fica disponível quando houver artigos publicados e indexados.';
  return 'Escreva uma pergunta completa — quanto mais específica, melhor a recuperação.';
});

const searchErrorMessage = computed(() => {
  if (!searchError.value) return 'A busca não está disponível no momento. Nenhuma resposta foi gerada.';
  return (searchError.value.message || 'Erro desconhecido') +
    (searchError.value.status ? ' (HTTP ' + searchError.value.status + ')' : '');
});

const idleDescription = computed(
  () =>
    'A busca consulta ' +
    formatNumber(corpusStats.value.searchable) +
    ' artigo(s) indexado(s). Descreva o problema em linguagem natural e veja a resposta com a fonte citada.',
);

const noResultsDescription = computed(
  () =>
    'Nenhum artigo relevante encontrado para "' +
    lastQuery.value +
    '". Tente reformular com outras palavras ou termos mais específicos do domínio.',
);

// sugestões derivadas das categorias reais do corpus (não inventa perguntas fora da base)
const exampleQueries = computed(() => {
  const cats = [];
  for (const a of corpus.value.filter(isSearchable)) {
    const c = String(a.category || '').trim();
    if (c && !cats.includes(c)) cats.push(c);
    if (cats.length >= 3) break;
  }
  return cats.map((c) => 'O que fazer sobre ' + c.toLowerCase() + '?');
});

// ---- ações da busca ----
async function runSearch() {
  const q = queryInput.value.trim();
  if (searchDisabled.value) return;
  if (q.length < 2) {
    toast.warning('Escreva uma pergunta com pelo menos 2 caracteres.');
    return;
  }
  searching.value = true;
  hasSearched.value = true;
  lastQuery.value = q;
  searchError.value = null;
  answer.value = '';
  citations.value = [];
  try {
    const result = await kbSearch(q);
    answer.value = result.answer || '';
    citations.value = Array.isArray(result.citations) ? result.citations : [];
    if (citations.value.length) {
      toast.success(citations.value.length + ' fonte(s) citada(s) na resposta.');
    }
  } catch (e) {
    searchError.value = e;
    answer.value = '';
    citations.value = [];
    toast.error('Falha na busca grounded.', { detail: e && e.message });
  } finally {
    searching.value = false;
  }
}

function retrySearch() {
  if (lastQuery.value) {
    queryInput.value = lastQuery.value;
    runSearch();
  }
}

function clearQuery() {
  queryInput.value = '';
  focusSearch();
}

function resetSearch() {
  queryInput.value = '';
  lastQuery.value = '';
  answer.value = '';
  citations.value = [];
  hasSearched.value = false;
  searchError.value = null;
  focusSearch();
}

function useExample(ex) {
  queryInput.value = ex;
  runSearch();
}

function focusSearch() {
  nextTick(() => {
    if (searchInput.value && typeof searchInput.value.focus === 'function') searchInput.value.focus();
  });
}

onMounted(loadCorpus);
</script>

<style scoped>
.kb-ico {
  font-weight: 700;
  line-height: 1;
}

/* -------------------------------- banner do método -------------------------------- */
.kb-banner {
  display: flex;
  align-items: center;
  gap: var(--ui-space-3);
  padding: var(--ui-space-3) var(--ui-space-4);
  border: 1px solid rgb(var(--ui-accent) / 0.38);
  background: rgb(var(--ui-accent) / 0.08);
  border-radius: var(--ui-radius-md);
}
.kb-banner-ico {
  font-size: 1.3rem;
  flex-shrink: 0;
}
.kb-banner-text {
  margin: 0;
  font-size: var(--ui-text-sm);
  line-height: 1.55;
  color: rgb(var(--ui-fg));
}
.kb-banner-text strong {
  color: rgb(var(--ui-accent-strong));
}

/* -------------------------------- campo de busca -------------------------------- */
.kb-search-card :deep(.ui-card-body) {
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-4);
}
.kb-search {
  display: flex;
  align-items: flex-end;
  gap: var(--ui-space-3);
  flex-wrap: wrap;
}
.kb-search :deep(.ui-field) {
  flex: 1 1 360px;
}
.kb-search-row {
  position: relative;
  display: flex;
  align-items: center;
}
.kb-search-glyph {
  position: absolute;
  left: 12px;
  font-size: 1.05rem;
  pointer-events: none;
  opacity: 0.7;
}
.kb-search :deep(.ui-field input.kb-search-input) {
  padding-left: 38px;
  padding-right: 36px;
  font-size: var(--ui-text-lg);
  height: 46px;
}
.kb-search-clear {
  position: absolute;
  right: 8px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border: none;
  border-radius: 50%;
  cursor: pointer;
  font-size: 1.2rem;
  line-height: 1;
  background: rgb(var(--ui-muted) / 0.16);
  color: rgb(var(--ui-muted));
  transition: background 0.15s ease, color 0.15s ease;
}
.kb-search-clear:hover {
  background: rgb(var(--ui-muted) / 0.28);
  color: rgb(var(--ui-fg));
}
.kb-search-actions {
  display: flex;
  gap: var(--ui-space-2);
  flex-shrink: 0;
}

/* sugestões de exemplo */
.kb-suggest {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--ui-space-2);
}
.kb-suggest-label {
  font-size: var(--ui-text-xs);
  font-weight: 600;
  color: rgb(var(--ui-muted));
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.kb-suggest-chip {
  font: inherit;
  font-size: var(--ui-text-xs);
  font-weight: 600;
  padding: 5px 11px;
  cursor: pointer;
  border: 1px dashed rgb(var(--ui-border-strong));
  border-radius: var(--ui-radius-pill);
  background: rgb(var(--ui-surface));
  color: rgb(var(--ui-accent-strong));
  transition: background 0.15s ease, border-color 0.15s ease;
}
.kb-suggest-chip:hover:not(:disabled) {
  background: rgb(var(--ui-accent) / 0.1);
  border-color: rgb(var(--ui-accent));
}
.kb-suggest-chip:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

/* -------------------------------- resultados -------------------------------- */
.kb-results {
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-4);
}

/* cabeçalho dos resultados */
.kb-answer-head {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin-bottom: var(--ui-space-3);
}
.kb-results-title {
  font-size: var(--ui-text-xl);
}
.kb-results-q {
  color: rgb(var(--ui-accent-strong));
}
.kb-results-sub {
  margin: 0;
  font-size: var(--ui-text-sm);
  color: rgb(var(--ui-muted));
}

/* resposta grounded */
.kb-answer-text {
  margin: 0 0 var(--ui-space-4);
  font-size: var(--ui-text-md);
  line-height: 1.65;
  color: rgb(var(--ui-fg));
  padding: var(--ui-space-4);
  background: rgb(var(--ui-surface-2));
  border-left: 4px solid rgb(var(--ui-accent));
  border-radius: 0 var(--ui-radius-md) var(--ui-radius-md) 0;
}

/* seção de citações */
.kb-citations-section {
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-3);
}
.kb-citations-header {
  margin: 0;
  display: flex;
  align-items: center;
  gap: var(--ui-space-2);
  font-size: var(--ui-text-xs);
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: rgb(var(--ui-muted));
}
.kb-citations-list {
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-3);
}

/* card de citação — clicável, navega para /kb-articles/:id */
.kb-citation-card {
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-2);
  padding: var(--ui-space-3) var(--ui-space-4);
  border: 1px solid rgb(var(--ui-accent) / 0.35);
  border-left: 4px solid rgb(var(--ui-accent) / 0.5);
  border-radius: var(--ui-radius-lg);
  background: rgb(var(--ui-surface));
  text-decoration: none;
  color: inherit;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}
.kb-citation-card:hover {
  border-left-color: rgb(var(--ui-accent));
  box-shadow: var(--ui-shadow-sm);
  text-decoration: none;
}
.kb-citation-top {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}
.kb-chip-glyph {
  flex-shrink: 0;
}
.kb-citation-title {
  font-weight: 600;
  font-size: var(--ui-text-md);
  color: rgb(var(--ui-accent-strong));
}
.kb-citation-ref {
  font-size: var(--ui-text-xs);
  color: rgb(var(--ui-muted));
  opacity: 0.8;
}
.kb-citation-cat {
  font-size: var(--ui-text-xs);
  border: 1px solid rgb(var(--ui-border-strong));
  border-radius: var(--ui-radius-pill);
  padding: 0 8px;
  line-height: 1.6;
  color: rgb(var(--ui-muted));
}
.kb-citation-snippet {
  margin: 0;
  font-size: var(--ui-text-sm);
  line-height: 1.55;
  color: rgb(var(--ui-fg));
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.kb-citation-tags {
  display: flex;
  flex-wrap: wrap;
  gap: var(--ui-space-1);
}

/* chips de tag */
.kb-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  border-radius: var(--ui-radius-pill);
  font-size: var(--ui-text-xs);
  font-weight: 600;
  text-decoration: none;
}
.kb-chip-tag {
  border: 1px dashed rgb(var(--ui-border-strong));
  background: rgb(var(--ui-surface-2));
  color: rgb(var(--ui-muted));
}

/* nota de grounding no rodapé dos resultados */
.kb-grounding-note {
  display: flex;
  align-items: flex-start;
  gap: var(--ui-space-2);
  margin: 0;
  padding: var(--ui-space-3) var(--ui-space-4);
  border: 1px dashed rgb(var(--ui-border-strong));
  border-radius: var(--ui-radius-md);
  font-size: var(--ui-text-xs);
  line-height: 1.55;
  color: rgb(var(--ui-muted));
}

/* -------------------------------- responsivo -------------------------------- */
@media (max-width: 720px) {
  .kb-search {
    flex-direction: column;
    align-items: stretch;
  }
  .kb-search :deep(.ui-field) {
    flex: 1 1 auto;
  }
  .kb-search-actions {
    justify-content: stretch;
  }
  .kb-search-actions :deep(.ui-btn) {
    flex: 1 1 auto;
  }
  .kb-citation-top {
    flex-direction: column;
    align-items: flex-start;
  }
}
</style>
