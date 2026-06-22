<template>
  <UiPageLayout
    width="wide"
    eyebrow="HelpFlow · Base de Conhecimento"
    title="Busca grounded na base de conhecimento"
    subtitle="Faça uma pergunta em linguagem natural. A recuperação é fundamentada (RAG/pgvector) nos artigos reais da sua base: cada resposta vem com o trecho mais relevante, a similaridade e a citação do artigo-fonte — nada é inventado."
    :loading="initialLoading"
    loading-message="Carregando a base de conhecimento…"
    :error="corpusErrorMessage"
    @retry="loadCorpus"
  >
    <!-- atalhos de domínio (somente rotas reais do service desk) -->
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

    <!-- como a recuperação funciona (transparência do método grounded) -->
    <template #banner>
      <div class="kb-banner" role="note">
        <span class="kb-banner-ico" aria-hidden="true">🔎</span>
        <p class="kb-banner-text">
          A busca é <strong>grounded</strong>: só recupera de artigos <strong>publicados e indexados</strong>
          ({{ formatNumber(corpusStats.searchable) }} de {{ formatNumber(corpusStats.total) }} na base). Os
          resultados são <strong>rankeados por similaridade textual (local)</strong> e cada um
          <strong>cita</strong> o artigo de onde veio — abra a fonte para conferir. A recuperação vetorial
          (pgvector) entra assim que o endpoint do backend estiver disponível.
        </p>
      </div>
      <!-- aviso honesto: o corpus excede o teto carregado; parte da base fica fora do ranking local -->
      <div v-if="corpusCapped" class="kb-banner kb-banner-warn" role="note">
        <span class="kb-banner-ico" aria-hidden="true">⚠</span>
        <p class="kb-banner-text">
          A base tem <strong>{{ formatNumber(serverTotal) }}</strong> artigos, mas o ranking local
          considera apenas os <strong>{{ formatNumber(corpusStats.total) }}</strong> mais recentes
          (teto de {{ formatNumber(CORPUS_PAGE_LIMIT) }}). Artigos mais antigos não entram nesta busca
          até a recuperação vetorial (pgvector) cobrir toda a base.
        </p>
      </div>
    </template>

    <!-- ============================ CAMPO DE BUSCA (SearchInput) ============================ -->
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

      <!-- sugestões de exemplo (apenas antes da 1ª busca, se houver corpus) -->
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

    <!-- ============================ ESTADOS ABAIXO DO CAMPO ============================ -->

    <!-- corpus vazio: não há o que pesquisar (CTA p/ escrever artigo) -->
    <UiCard v-if="!corpusLoading && !corpusError && corpusStats.total === 0">
      <UiEmptyState
        icon="doc"
        title="A base de conhecimento está vazia"
        description="Escreva e publique o primeiro artigo. Depois de indexado no pgvector, ele passa a ser recuperável aqui pela busca semântica."
      >
        <template #action>
          <UiButton variant="primary" to="/kb-articles/new">Escrever primeiro artigo</UiButton>
        </template>
      </UiEmptyState>
    </UiCard>

    <!-- corpus existe mas nada está indexado: busca não retorna até indexar -->
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

    <!-- buscando: skeleton dos resultados -->
    <UiCard v-else-if="searching" title="Recuperando passagens relevantes…">
      <UiLoadingState variant="skeleton" :skeleton-lines="6" />
    </UiCard>

    <!-- busca feita, sem resultados (acima do limiar) -->
    <UiCard v-else-if="hasSearched && !results.length">
      <UiEmptyState
        icon="search"
        title="Nada suficientemente relevante"
        :description="noResultsDescription"
      >
        <template #action>
          <UiButton variant="ghost" @click="resetSearch">Refazer a busca</UiButton>
        </template>
      </UiEmptyState>
    </UiCard>

    <!-- resultados rankeados (SemanticResultList) -->
    <section
      v-else-if="hasSearched && results.length"
      class="kb-results"
      aria-label="Resultados da busca semântica"
    >
      <header class="kb-results-head">
        <h2 class="kb-results-title">
          {{ results.length }} {{ results.length === 1 ? 'passagem' : 'passagens' }} para
          <span class="kb-results-q">“{{ lastQuery }}”</span>
        </h2>
        <p class="kb-results-sub">Ordenadas pela maior similaridade com a sua pergunta.</p>
      </header>

      <article
        v-for="(res, i) in results"
        :key="res.id"
        class="kb-result"
        :data-rank="i + 1"
      >
        <!-- cabeçalho: rank + título + similaridade (SimilarityScore) -->
        <div class="kb-result-top">
          <div class="kb-result-id">
            <span class="kb-result-rank" aria-hidden="true">{{ i + 1 }}</span>
            <div class="kb-result-titles">
              <h3 class="kb-result-title">{{ res.title }}</h3>
              <p class="kb-result-meta">
                <span class="kb-result-ref ui-mono">#{{ res.id }}</span>
                <span v-if="res.category" class="kb-result-cat">{{ res.category }}</span>
                <UiStatusBadge
                  :tone="publishTone(res.status)"
                  :label="publishLabel(res.status)"
                  :status="res.status"
                  size="sm"
                />
              </p>
            </div>
          </div>

          <!-- SimilarityScore: barra + percentual + rótulo de força -->
          <div
            class="kb-score"
            :data-level="res.scoreLevel"
            role="img"
            :aria-label="'Similaridade ' + res.scorePct + ' por cento — ' + scoreLevelLabel(res.scoreLevel)"
          >
            <span class="kb-score-pct">{{ res.scorePct }}%</span>
            <span class="kb-score-track" aria-hidden="true">
              <span class="kb-score-fill" :data-pct="res.scoreBucket"></span>
            </span>
            <span class="kb-score-label">{{ scoreLevelLabel(res.scoreLevel) }}</span>
          </div>
        </div>

        <!-- trecho recuperado (snippet) com os termos da pergunta destacados (sem v-html) -->
        <blockquote class="kb-snippet">
          <span
            v-for="(seg, si) in res.snippet"
            :key="si"
            :class="seg.hit ? 'kb-hl' : null"
          >{{ seg.text }}</span>
        </blockquote>

        <!-- rodapé: citação do artigo-fonte (CitationChip) + ações -->
        <footer class="kb-result-foot">
          <div class="kb-citations" aria-label="Artigo-fonte citado">
            <span class="kb-citations-label">Fonte:</span>
            <RouterLink class="kb-chip" :to="'/kb-articles/' + res.id">
              <span class="kb-chip-glyph" aria-hidden="true">📄</span>
              <span class="kb-chip-text">{{ res.title }}</span>
              <span class="kb-chip-ref ui-mono">#{{ res.id }}</span>
            </RouterLink>
            <span v-for="t in res.tags" :key="t" class="kb-chip kb-chip-tag">
              <span class="kb-chip-glyph" aria-hidden="true">#</span>{{ t }}
            </span>
          </div>
          <div class="kb-result-actions">
            <UiButton size="sm" variant="subtle" :to="'/kb-articles/' + res.id">Abrir artigo</UiButton>
          </div>
        </footer>
      </article>

      <p class="kb-grounding-note" role="note">
        <span aria-hidden="true">◆</span>
        Recuperação fundamentada em {{ formatNumber(corpusStats.searchable) }} artigo(s) indexado(s). A
        similaridade reflete a sobreposição semântica com a sua pergunta — confira sempre a fonte antes de
        responder ao cliente.
      </p>
    </section>

    <!-- idle: corpus pronto, nenhuma busca feita ainda -->
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
  UiStatusBadge,
  UiEmptyState,
  UiLoadingState,
  useToast,
  format,
} from '../ui/index.js';
// `kbArticles` é o recurso REAL garantido pelo integrador (mapeia /v1/kb-articles).
// É a fonte da recuperação grounded: só recuperamos de artigos REAIS da base — nunca
// fabricamos conteúdo. A régua RAG/pgvector (REQ-HELPFLOW-0006) só torna recuperável o
// que está PUBLICADO e INDEXADO; respeitamos isso ao montar o corpus pesquisável.
import { kbArticles } from '../api.js';

const toast = useToast();
const formatNumber = format.formatNumber;

// --------------------------- rótulos/tons de publicação ---------------------------
const STATUS_LABEL = { draft: 'Rascunho', published: 'Publicado', archived: 'Arquivado' };
const STATUS_TONE = { draft: 'warning', published: 'success', archived: 'neutral' };
const publishLabel = (v) => STATUS_LABEL[String(v || '').toLowerCase()] || format.humanize(v);
const publishTone = (v) => STATUS_TONE[String(v || '').toLowerCase()] || 'neutral';

// teto de página do backend (crud-repo). Acima disso a recuperação local não vê o resto.
const CORPUS_PAGE_LIMIT = 200;

// ------------------------------- estado do corpus -------------------------------
const corpus = ref([]); // artigos reais carregados (todos os status; filtramos a busca)
const corpusLoading = ref(false);
const corpusLoaded = ref(false);
const corpusError = ref(null);
const serverTotal = ref(0); // total REAL informado pelo backend (pode exceder o carregado)
const corpusCapped = ref(false); // true quando o backend tem mais artigos do que o teto carregado

const initialLoading = computed(() => corpusLoading.value && !corpusLoaded.value);
const corpusErrorMessage = computed(() => {
  if (!corpusError.value) return null;
  const code = corpusError.value.status ? ' (HTTP ' + corpusError.value.status + ')' : '';
  return (corpusError.value.message || 'Não foi possível carregar a base de conhecimento.') + code;
});

// só é RECUPERÁVEL o que está publicado E indexado (semântica do RAG/pgvector).
function isSearchable(a) {
  return (
    String(a.status || '').toLowerCase() === 'published' &&
    String(a.embedding_status || '').toLowerCase() === 'indexed'
  );
}
const searchableCorpus = computed(() => corpus.value.filter(isSearchable));

const corpusStats = computed(() => {
  const total = corpus.value.length;
  const searchable = searchableCorpus.value.length;
  const published = corpus.value.filter((a) => String(a.status || '').toLowerCase() === 'published').length;
  const indexed = corpus.value.filter((a) => String(a.embedding_status || '').toLowerCase() === 'indexed').length;
  return { total, searchable, published, indexed };
});

const notIndexedDescription = computed(() => {
  const pub = corpusStats.value.published;
  if (pub === 0) {
    return 'Há artigos na base, mas nenhum está publicado. Publique um artigo e aguarde a indexação vetorial (pgvector) para que ele possa ser recuperado aqui.';
  }
  return (
    'Há ' +
    formatNumber(pub) +
    ' artigo(s) publicado(s), mas a indexação vetorial (pgvector) ainda não concluiu. Assim que o embedding ficar pronto, eles aparecem na busca.'
  );
});

async function loadCorpus() {
  corpusLoading.value = true;
  corpusError.value = null;
  try {
    // pageSize máximo do backend é 200 (crud-repo). Suficiente para um corpus de busca local;
    // a recuperação REAL (pgvector) acontece no backend quando o endpoint /v1/kb/search existir
    // (ver api.js · `kbSearch` ainda não exposto). Até lá, o ranking abaixo é TEXTUAL/local
    // sobre dados REAIS dos artigos — honesto, determinístico e sempre rastreável à fonte.
    const res = await kbArticles.list({ pageSize: CORPUS_PAGE_LIMIT, sort: 'updated_at', dir: 'desc' });
    const list = Array.isArray(res) ? res : (res && (res.data || res.items)) || [];
    corpus.value = list;
    // o backend informa o total real quando pagina; se exceder o que carregamos, avisamos.
    const reported = res && typeof res.total === 'number' ? res.total : list.length;
    serverTotal.value = Math.max(reported, list.length);
    corpusCapped.value = list.length >= CORPUS_PAGE_LIMIT && serverTotal.value > list.length;
    corpusLoaded.value = true;
  } catch (e) {
    corpusError.value = e;
    corpus.value = [];
    serverTotal.value = 0;
    corpusCapped.value = false;
  } finally {
    corpusLoading.value = false;
  }
}

// ------------------------------- busca (estado) -------------------------------
const queryInput = ref('');
const lastQuery = ref('');
const searching = ref(false);
const hasSearched = ref(false);
const results = ref([]);
const searchInput = ref(null);

const searchDisabled = computed(
  () => corpusLoading.value || !!corpusError.value || corpusStats.value.searchable === 0,
);
const canSearch = computed(() => queryInput.value.trim().length >= 2);

const searchHint = computed(() => {
  if (corpusStats.value.searchable === 0) return 'A busca fica disponível quando houver artigos publicados e indexados.';
  return 'Escreva uma pergunta completa — quanto mais específica, melhor a recuperação.';
});

const idleDescription = computed(
  () =>
    'A busca consulta ' +
    formatNumber(corpusStats.value.searchable) +
    ' artigo(s) indexado(s). Descreva o problema do cliente em uma frase e veja as passagens mais relevantes, com a fonte citada.',
);
const noResultsDescription = computed(
  () =>
    'Nenhuma passagem de “' +
    lastQuery.value +
    '” passou do limiar de similaridade. Tente reformular com outras palavras ou termos mais específicos do domínio.',
);

// exemplos derivados das CATEGORIAS reais do corpus (sem inventar perguntas fora da base).
const exampleQueries = computed(() => {
  const cats = [];
  for (const a of searchableCorpus.value) {
    const c = String(a.category || '').trim();
    if (c && !cats.includes(c)) cats.push(c);
    if (cats.length >= 3) break;
  }
  return cats.map((c) => 'O que fazer sobre ' + c.toLowerCase() + '?');
});

// ------------------------- tokenização + similaridade (transparente) -------------------------
// Ranking client-side honesto sobre o corpus REAL: sobreposição de termos ponderada por
// raridade (TF-IDF simplificado), com bônus para correspondência no título. Determinístico,
// sem dependências, e sempre rastreável à fonte. A "similaridade" é normalizada em 0..1.
const STOPWORDS = new Set(
  ('a o e de da do das dos um uma uns umas para por com sem que se na no nas nos em ao aos as os ' +
    'como qual quais quando onde quem porque pra pro the of and to in on for is are how what why ' +
    'sobre meu minha seu sua nosso nossa este esta esse essa isso ele ela eles elas mais menos ' +
    'fazer sobre qual')
    .split(/\s+/)
    .filter(Boolean),
);

function tokenize(text) {
  return String(text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // remove acentos p/ casar "senha"/"sénha"
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length >= 3 && !STOPWORDS.has(t));
}

function articleText(a) {
  return [a.title, a.category, a.tags, a.body].filter(Boolean).join(' \n ');
}

// document frequency p/ ponderar termos raros (calculado sobre o corpus pesquisável)
const docFrequency = computed(() => {
  const df = new Map();
  for (const a of searchableCorpus.value) {
    const seen = new Set(tokenize(articleText(a)));
    for (const t of seen) df.set(t, (df.get(t) || 0) + 1);
  }
  return df;
});

function idf(term) {
  const n = searchableCorpus.value.length || 1;
  const df = docFrequency.value.get(term) || 0;
  return Math.log((n + 1) / (df + 1)) + 1; // suavizado, sempre > 0
}

const tagList = (tags) =>
  String(tags || '')
    .split(/[,;]/)
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(0, 4);

// monta um snippet com o melhor trecho do corpo + termos da pergunta destacados (segmentos,
// sem v-html). Procura a primeira ocorrência de um termo no corpo e abre uma janela ao redor.
function buildSnippet(body, queryTokens) {
  const text = String(body || '').replace(/\s+/g, ' ').trim();
  if (!text) return [{ text: 'Sem prévia disponível para este artigo.', hit: false }];
  const lower = text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
  // acha a posição do primeiro termo presente
  let pos = -1;
  for (const t of queryTokens) {
    const idx = lower.indexOf(t);
    if (idx >= 0 && (pos < 0 || idx < pos)) pos = idx;
  }
  const WINDOW = 240;
  let start = pos < 0 ? 0 : Math.max(0, pos - 60);
  // alinha o início numa fronteira de palavra
  if (start > 0) {
    const sp = text.indexOf(' ', start);
    if (sp >= 0 && sp - start < 20) start = sp + 1;
  }
  let slice = text.slice(start, start + WINDOW);
  const prefix = start > 0 ? '… ' : '';
  const suffix = start + WINDOW < text.length ? ' …' : '';
  slice = prefix + slice + suffix;

  // segmenta destacando ocorrências (case-insensitive, acento-insensível) dos termos
  const segs = [];
  const sliceLower = slice
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
  let cursor = 0;
  while (cursor < slice.length) {
    let best = -1;
    let bestLen = 0;
    for (const t of queryTokens) {
      const idx = sliceLower.indexOf(t, cursor);
      if (idx >= 0 && (best < 0 || idx < best)) {
        best = idx;
        bestLen = t.length;
      }
    }
    if (best < 0) {
      segs.push({ text: slice.slice(cursor), hit: false });
      break;
    }
    if (best > cursor) segs.push({ text: slice.slice(cursor, best), hit: false });
    segs.push({ text: slice.slice(best, best + bestLen), hit: true });
    cursor = best + bestLen;
  }
  return segs.length ? segs : [{ text: slice, hit: false }];
}

function scoreLevel(score) {
  if (score >= 0.66) return 'high';
  if (score >= 0.33) return 'medium';
  return 'low';
}
function scoreLevelLabel(level) {
  return { high: 'Alta', medium: 'Média', low: 'Baixa' }[level] || 'Baixa';
}

function rankCorpus(rawQuery) {
  const qTokensAll = tokenize(rawQuery);
  const qTokens = Array.from(new Set(qTokensAll));
  if (!qTokens.length) return [];

  // peso total da consulta (soma dos idf dos termos) p/ normalizar o score em 0..1
  let queryWeight = 0;
  for (const t of qTokens) queryWeight += idf(t);
  if (queryWeight <= 0) return [];

  const scored = [];
  for (const a of searchableCorpus.value) {
    const titleTokens = new Set(tokenize([a.title, a.category, a.tags].filter(Boolean).join(' ')));
    const bodyTokens = new Set(tokenize(a.body));
    let matched = 0;
    let hits = 0;
    for (const t of qTokens) {
      const inTitle = titleTokens.has(t);
      const inBody = bodyTokens.has(t);
      if (inTitle || inBody) {
        hits += 1;
        // título vale mais (proxy de relevância de tópico)
        matched += idf(t) * (inTitle ? 1 : 0.78);
      }
    }
    if (hits === 0) continue;
    // cobertura: fração dos termos da pergunta efetivamente encontrados (evita ranquear
    // alto um artigo que casa só 1 de 6 termos por causa de um termo raro)
    const coverage = hits / qTokens.length;
    const raw = (matched / queryWeight) * (0.55 + 0.45 * coverage);
    const score = Math.max(0, Math.min(1, raw));
    if (score < 0.08) continue; // limiar mínimo de relevância
    const level = scoreLevel(score);
    scored.push({
      id: a.id,
      title: a.title || 'Sem título',
      category: a.category || '',
      status: a.status || '',
      tags: tagList(a.tags),
      snippet: buildSnippet(a.body, qTokens),
      score,
      scorePct: Math.round(score * 100),
      scoreBucket: Math.max(4, Math.round(score * 20) * 5), // 0..100 em passos de 5 (p/ CSS data-attr)
      scoreLevel: level,
    });
  }
  scored.sort((x, y) => y.score - x.score);
  return scored.slice(0, 8);
}

// ------------------------------- ações da busca -------------------------------
function runSearch() {
  const q = queryInput.value.trim();
  if (searchDisabled.value) return;
  if (q.length < 2) {
    toast.warning('Escreva uma pergunta com pelo menos 2 caracteres.');
    return;
  }
  searching.value = true;
  hasSearched.value = true;
  lastQuery.value = q;
  // microtarefa p/ permitir o skeleton pintar antes do ranking síncrono
  nextTick(() => {
    try {
      const ranked = rankCorpus(q);
      results.value = ranked;
      if (ranked.length) {
        toast.success(ranked.length + ' passagem(ns) recuperada(s) e citada(s) da base.');
      }
    } catch (e) {
      results.value = [];
      toast.error('Falha ao recuperar passagens.', { detail: e && e.message });
    } finally {
      searching.value = false;
    }
  });
}

function clearQuery() {
  queryInput.value = '';
  focusSearch();
}
function resetSearch() {
  queryInput.value = '';
  lastQuery.value = '';
  results.value = [];
  hasSearched.value = false;
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

/* variante de aviso (corpus acima do teto carregado) — usa o token de alerta do kit */
.kb-banner-warn {
  margin-top: var(--ui-space-2);
  border-color: rgb(var(--ui-warn) / 0.4);
  background: rgb(var(--ui-warn) / 0.08);
}
.kb-banner-warn .kb-banner-text strong {
  color: rgb(var(--ui-warn));
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
/* O kit estiliza o input via `.ui-field :deep(input)` (especificidade alta por causa
   do atributo de escopo). Em vez de `!important`, casamos a MESMA forma de seletor
   (.ui-field + input.classe) a partir desta view para vencer por especificidade de
   forma limpa — só ajustamos padding/altura p/ caber a lupa e o botão de limpar. */
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

/* -------------------------------- lista de resultados -------------------------------- */
.kb-results {
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-4);
}
.kb-results-head {
  display: flex;
  flex-direction: column;
  gap: 2px;
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

.kb-result {
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-3);
  padding: var(--ui-space-4) var(--ui-space-5);
  border: 1px solid rgb(var(--ui-border));
  border-left: 4px solid rgb(var(--ui-accent) / 0.35);
  border-radius: var(--ui-radius-lg);
  background: rgb(var(--ui-surface));
  box-shadow: var(--ui-shadow-sm);
  transition: border-color 0.15s ease, box-shadow 0.15s ease, transform 0.15s ease;
}
.kb-result:hover {
  border-left-color: rgb(var(--ui-accent));
  box-shadow: var(--ui-shadow-md);
}
.kb-result[data-rank="1"] {
  border-left-color: rgb(var(--ui-accent));
  background: rgb(var(--ui-accent) / 0.04);
}

.kb-result-top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--ui-space-4);
  flex-wrap: wrap;
}
.kb-result-id {
  display: flex;
  align-items: flex-start;
  gap: var(--ui-space-3);
  min-width: 0;
  flex: 1 1 260px;
}
.kb-result-rank {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  flex-shrink: 0;
  border-radius: 50%;
  font-family: var(--ui-font-display);
  font-weight: 700;
  font-size: var(--ui-text-sm);
  background: rgb(var(--ui-accent) / 0.14);
  color: rgb(var(--ui-accent-strong));
}
.kb-result-titles {
  min-width: 0;
}
.kb-result-title {
  font-size: var(--ui-text-lg);
  line-height: 1.3;
}
.kb-result-meta {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  margin: 5px 0 0;
  font-size: var(--ui-text-xs);
  color: rgb(var(--ui-muted));
}
.kb-result-ref {
  color: rgb(var(--ui-accent-strong));
}
.kb-result-cat {
  border: 1px solid rgb(var(--ui-border-strong));
  border-radius: var(--ui-radius-pill);
  padding: 0 8px;
  line-height: 1.6;
}

/* SimilarityScore */
.kb-score {
  display: grid;
  grid-template-columns: auto 1fr;
  grid-template-areas:
    'pct track'
    'label track';
  align-items: center;
  gap: 2px var(--ui-space-2);
  min-width: 150px;
  flex-shrink: 0;
}
.kb-score-pct {
  grid-area: pct;
  font-family: var(--ui-font-display);
  font-weight: 700;
  font-size: var(--ui-text-lg);
  line-height: 1;
}
.kb-score-label {
  grid-area: label;
  font-size: var(--ui-text-xs);
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.03em;
}
.kb-score-track {
  grid-area: track;
  position: relative;
  height: 8px;
  border-radius: var(--ui-radius-pill);
  background: rgb(var(--ui-muted) / 0.18);
  overflow: hidden;
}
.kb-score-fill {
  position: absolute;
  inset: 0 auto 0 0;
  border-radius: var(--ui-radius-pill);
  background: currentColor;
  /* largura por bucket (passos de 5%) — sem style inline; CSP-safe via data-attr */
  width: 4%;
}
.kb-score[data-level="high"] {
  color: rgb(var(--ui-ok));
}
.kb-score[data-level="medium"] {
  color: rgb(var(--ui-warn));
}
.kb-score[data-level="low"] {
  color: rgb(var(--ui-muted));
}
.kb-score-pct,
.kb-score-label {
  color: rgb(var(--ui-fg));
}
.kb-score[data-level="high"] .kb-score-label {
  color: rgb(var(--ui-ok));
}
.kb-score[data-level="medium"] .kb-score-label {
  color: rgb(var(--ui-warn));
}

/* larguras da barra por bucket (0..100 em passos de 5) — data-attr → CSP-safe */
.kb-score-fill[data-pct="4"] { width: 4%; }
.kb-score-fill[data-pct="5"] { width: 5%; }
.kb-score-fill[data-pct="10"] { width: 10%; }
.kb-score-fill[data-pct="15"] { width: 15%; }
.kb-score-fill[data-pct="20"] { width: 20%; }
.kb-score-fill[data-pct="25"] { width: 25%; }
.kb-score-fill[data-pct="30"] { width: 30%; }
.kb-score-fill[data-pct="35"] { width: 35%; }
.kb-score-fill[data-pct="40"] { width: 40%; }
.kb-score-fill[data-pct="45"] { width: 45%; }
.kb-score-fill[data-pct="50"] { width: 50%; }
.kb-score-fill[data-pct="55"] { width: 55%; }
.kb-score-fill[data-pct="60"] { width: 60%; }
.kb-score-fill[data-pct="65"] { width: 65%; }
.kb-score-fill[data-pct="70"] { width: 70%; }
.kb-score-fill[data-pct="75"] { width: 75%; }
.kb-score-fill[data-pct="80"] { width: 80%; }
.kb-score-fill[data-pct="85"] { width: 85%; }
.kb-score-fill[data-pct="90"] { width: 90%; }
.kb-score-fill[data-pct="95"] { width: 95%; }
.kb-score-fill[data-pct="100"] { width: 100%; }

/* snippet recuperado */
.kb-snippet {
  margin: 0;
  font-size: var(--ui-text-md);
  line-height: 1.6;
  color: rgb(var(--ui-fg));
  padding: var(--ui-space-3) var(--ui-space-4);
  background: rgb(var(--ui-surface-2));
  border-radius: var(--ui-radius-md);
}
.kb-hl {
  background: rgb(var(--ui-accent) / 0.22);
  color: rgb(var(--ui-accent-strong));
  font-weight: 700;
  border-radius: 3px;
  padding: 0 2px;
}

/* rodapé: citações + ações */
.kb-result-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ui-space-3);
  flex-wrap: wrap;
}
.kb-citations {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--ui-space-2);
  min-width: 0;
}
.kb-citations-label {
  font-size: var(--ui-text-xs);
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  color: rgb(var(--ui-muted));
}

/* CitationChip */
.kb-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  max-width: 320px;
  padding: 4px 10px;
  border-radius: var(--ui-radius-pill);
  border: 1px solid rgb(var(--ui-accent) / 0.4);
  background: rgb(var(--ui-accent) / 0.1);
  color: rgb(var(--ui-accent-strong));
  font-size: var(--ui-text-xs);
  font-weight: 600;
  text-decoration: none;
  transition: background 0.15s ease, border-color 0.15s ease;
}
a.kb-chip:hover {
  background: rgb(var(--ui-accent) / 0.18);
  border-color: rgb(var(--ui-accent));
  text-decoration: none;
}
.kb-chip-glyph {
  flex-shrink: 0;
}
.kb-chip-text {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.kb-chip-ref {
  flex-shrink: 0;
  opacity: 0.8;
}
.kb-chip-tag {
  border-style: dashed;
  border-color: rgb(var(--ui-border-strong));
  background: rgb(var(--ui-surface-2));
  color: rgb(var(--ui-muted));
}
.kb-result-actions {
  display: flex;
  gap: var(--ui-space-2);
  flex-shrink: 0;
}

/* nota de grounding final */
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
  .kb-result-top {
    flex-direction: column;
  }
  .kb-score {
    width: 100%;
  }
  .kb-result-foot {
    flex-direction: column;
    align-items: flex-start;
  }
}
</style>
