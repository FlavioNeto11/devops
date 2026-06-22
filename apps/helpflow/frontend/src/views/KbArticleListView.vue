<template>
  <UiPageLayout
    eyebrow="Base de Conhecimento"
    title="Artigos da base de conhecimento"
    subtitle="Publique respostas reutilizáveis e acompanhe a indexação vetorial (pgvector) que alimenta a busca semântica e a IA de atendimento."
    width="wide"
    :error="errorMessage"
    @retry="reload"
  >
    <template #actions>
      <UiButton variant="ghost" to="/kb-articles/search">
        <template #icon-left><span class="kb-ico" aria-hidden="true">⌕</span></template>
        Busca semântica
      </UiButton>
      <UiButton variant="ghost" :loading="r.loading.value" @click="reload">
        <template #icon-left><span class="kb-ico" aria-hidden="true">↻</span></template>
        Atualizar
      </UiButton>
      <UiButton to="/kb-articles/new">
        <template #icon-left><span class="kb-ico" aria-hidden="true">＋</span></template>
        Novo artigo
      </UiButton>
    </template>

    <!-- KPIs: o total é da BASE inteira (count do servidor, respeita a busca textual);
         os recortes por status/indexação são contados na PÁGINA atual (o backend não
         agrega) — os hints deixam isso explícito para não exibir números enganosos. -->
    <section class="kb-metrics" aria-label="Resumo da base de conhecimento">
      <UiMetricCard
        :label="hasServerQuery ? 'Resultados' : 'Artigos'"
        :value="metrics.total"
        :loading="r.loading.value"
        tone="primary"
        :hint="hasServerQuery ? 'Na busca · base inteira' : 'No total da base'"
        clickable
        @click="resetFilters"
      />
      <UiMetricCard
        label="Publicados"
        :value="metrics.published"
        :loading="r.loading.value"
        tone="success"
        :hint="pageScopedHint('Visíveis ao cliente')"
        clickable
        @click="quickStatus('published')"
      />
      <UiMetricCard
        label="Rascunhos"
        :value="metrics.draft"
        :loading="r.loading.value"
        tone="warning"
        :hint="pageScopedHint('Ainda não publicados')"
        clickable
        @click="quickStatus('draft')"
      />
      <UiMetricCard
        label="Indexados"
        :value="metrics.indexed"
        :loading="r.loading.value"
        tone="running"
        :hint="coverageHint"
        clickable
        @click="quickEmbedding('indexed')"
      />
      <UiMetricCard
        label="Falha de indexação"
        :value="metrics.failed"
        :loading="r.loading.value"
        :tone="metrics.failed > 0 ? 'error' : 'neutral'"
        :hint="pageScopedHint('Exigem reprocessamento')"
        clickable
        @click="quickEmbedding('failed')"
      />
    </section>

    <!-- Banner: prioriza falhas; senão alerta pendências de indexação na página -->
    <template v-if="indexWarning" #banner>
      <div class="kb-banner" role="status" :data-tone="indexWarning.tone">
        <span class="kb-banner-ico" aria-hidden="true">{{ indexWarning.icon }}</span>
        <div class="kb-banner-text">
          <strong>{{ indexWarning.count }}</strong> artigo(s) com indexação vetorial
          <em>{{ indexWarning.label }}</em> nesta página. Sem o embedding, eles não aparecem na
          busca semântica nem na IA de atendimento.
        </div>
        <UiButton size="sm" variant="subtle" @click="quickEmbedding(indexWarning.status)">
          Ver afetados
        </UiButton>
      </div>
    </template>

    <template #filters>
      <UiFiltersPanel
        v-model="filters"
        :fields="filterFields"
        @apply="applyFilters"
        @clear="onClear"
      />
    </template>

    <!-- Aviso de recorte de cliente (status/indexação são filtrados na página atual) -->
    <div v-if="hasClientCut" class="kb-active" role="status">
      <span class="kb-active-text">
        Filtro de
        <strong>{{ clientCutLabel }}</strong>
        aplicado à página atual — {{ pageRows.length }} de {{ (r.items.value || []).length }} artigo(s)
        desta página correspondem.
      </span>
      <UiButton variant="subtle" size="sm" @click="clearClientCut">Limpar recorte</UiButton>
    </div>

    <UiDataTable
      :columns="columns"
      :rows="pageRows"
      :loading="r.loading.value"
      row-key="id"
      :density="density"
      clickable-rows
      server-mode
      :sort="r.sort.value"
      :page="r.page.value"
      :page-size="r.pageSize.value"
      :total="r.total.value"
      paginated
      :empty="emptyState"
      @update:sort="r.setSort"
      @update:page="r.setPage"
      @update:page-size="onPageSize"
      @row-click="open"
    >
      <!-- Título + referência + categoria + tags -->
      <template #cell-title="{ row }">
        <div class="kb-title">
          <span class="kb-title-main">{{ row.title || 'Sem título' }}</span>
          <span class="kb-title-meta">
            <span class="kb-ref">#{{ row.id }}</span>
            <span v-if="row.category" class="kb-category">{{ row.category }}</span>
            <span v-if="tagList(row.tags).length" class="kb-tags">
              <span v-for="t in tagList(row.tags)" :key="t" class="kb-tag">{{ t }}</span>
              <span v-if="tagOverflow(row.tags)" class="kb-tag kb-tag-more">
                +{{ tagOverflow(row.tags) }}
              </span>
            </span>
          </span>
        </div>
      </template>

      <!-- Status de publicação (tom explícito por status; rótulo sempre presente) -->
      <template #cell-status="{ value }">
        <UiStatusBadge :status="value" :tone="publishTone(value)" :label="publishLabel(value)" with-dot />
      </template>

      <!-- Indexação vetorial (badge dedicado: dot + rótulo + tom semântico, CSS-safe) -->
      <template #cell-embedding_status="{ value }">
        <span
          class="kb-embed"
          :data-state="embedState(value)"
          role="status"
          :title="embedHint(value)"
        >
          <span class="kb-embed-dot" aria-hidden="true" />
          <span class="kb-embed-label">{{ embedLabel(value) }}</span>
        </span>
      </template>

      <!-- Autor — o backend expõe só author_id (sem join de nome): glyph + referência -->
      <template #cell-author_id="{ value }">
        <span v-if="value" class="kb-author">
          <span class="kb-avatar" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" focusable="false">
              <path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm0 2c-3.6 0-8 1.8-8 5v1h16v-1c0-3.2-4.4-5-8-5Z" />
            </svg>
          </span>
          <span class="kb-author-name">Autor #{{ value }}</span>
        </span>
        <span v-else class="kb-dash">—</span>
      </template>

      <!-- Atualizado em -->
      <template #cell-updated_at="{ value }">
        <span class="kb-dim" :title="value ? formatDateTime(value) : ''">
          {{ value ? formatDateTime(value) : '—' }}
        </span>
      </template>

      <!-- Ações por linha (abrir / reindexar / arquivar) -->
      <template #cell-actions="{ row }">
        <div class="kb-row-actions" @click.stop>
          <UiButton size="sm" variant="ghost" :to="'/kb-articles/' + row.id">Abrir</UiButton>
          <UiButton
            v-if="canReindex(row)"
            size="sm"
            variant="subtle"
            :loading="reindexId === row.id"
            @click="reindex(row)"
          >
            Reindexar
          </UiButton>
          <UiButton
            v-if="row.status !== 'archived'"
            size="sm"
            variant="subtle"
            :loading="archiveId === row.id"
            @click="archive(row)"
          >
            Arquivar
          </UiButton>
        </div>
      </template>

      <template #empty-action>
        <div class="kb-empty-actions">
          <UiButton v-if="hasFilters" variant="ghost" @click="resetFilters">Limpar filtros</UiButton>
          <UiButton v-else to="/kb-articles/new">Escrever primeiro artigo</UiButton>
        </div>
      </template>
    </UiDataTable>

    <template #footer>
      <div class="kb-foot">
        <span>{{ footerSummary }}</span>
        <button
          type="button"
          class="kb-density"
          :aria-pressed="density === 'compact' ? 'true' : 'false'"
          @click="toggleDensity"
        >
          {{ density === 'compact' ? 'Densidade confortável' : 'Densidade compacta' }}
        </button>
      </div>
    </template>
  </UiPageLayout>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import {
  UiPageLayout,
  UiDataTable,
  UiButton,
  UiMetricCard,
  UiStatusBadge,
  UiFiltersPanel,
  useResource,
  useToast,
  useConfirm,
  format,
} from '../ui/index.js';
import * as api from '../api.js';

// api.js exporta `kbArticles` (resourceFactory('kb-articles') + ação de domínio reindex);
// o fallback defensivo espelha as demais telas e evita white-screen caso o símbolo suma.
const kbArticles = api.kbArticles || api['kb-articles'] || api.resourceFactory('kb-articles');

const router = useRouter();
const toast = useToast();
const confirm = useConfirm();
const formatDateTime = format.formatDateTime;

// ------- domínio: rótulos e tons (rótulo SEMPRE presente; cor nunca é o único sinal) -------
const STATUS_OPTIONS = [
  { value: 'draft', label: 'Rascunho' },
  { value: 'published', label: 'Publicado' },
  { value: 'archived', label: 'Arquivado' },
];
const STATUS_LABEL = Object.fromEntries(STATUS_OPTIONS.map((o) => [o.value, o.label]));
const STATUS_TONE = { draft: 'warning', published: 'success', archived: 'neutral' };
const publishLabel = (v) => STATUS_LABEL[v] || format.humanize(v);
const publishTone = (v) => STATUS_TONE[String(v || '').toLowerCase()] || 'neutral';

const EMBED_OPTIONS = [
  { value: 'pending', label: 'Indexando…' },
  { value: 'indexed', label: 'Indexado' },
  { value: 'failed', label: 'Falhou' },
];
const EMBED_LABEL = Object.fromEntries(EMBED_OPTIONS.map((o) => [o.value, o.label]));
// estado canônico p/ data-attr do badge dedicado (CSS-safe; sem style inline)
const EMBED_STATE = { pending: 'pending', indexed: 'indexed', failed: 'failed' };
const EMBED_HINT = {
  pending: 'Aguardando o embedding no pgvector.',
  indexed: 'Pronto para a busca semântica e a IA.',
  failed: 'O embedding falhou — reindexe o artigo.',
  none: 'Ainda sem indexação vetorial.',
};
const embedLabel = (v) => (v ? EMBED_LABEL[v] || format.humanize(v) : 'Não indexado');
const embedState = (v) => EMBED_STATE[String(v || '').toLowerCase()] || 'none';
const embedHint = (v) => EMBED_HINT[embedState(v)];

const tagAll = (tags) =>
  String(tags || '')
    .split(/[,;]/)
    .map((t) => t.trim())
    .filter(Boolean);
const tagList = (tags) => tagAll(tags).slice(0, 4);
const tagOverflow = (tags) => Math.max(0, tagAll(tags).length - 4);

// ------- colunas da tabela -------
const columns = [
  { key: 'title', label: 'Artigo', sortable: true },
  { key: 'status', label: 'Publicação', sortable: true },
  { key: 'embedding_status', label: 'Indexação vetorial', sortable: true },
  { key: 'author_id', label: 'Autor', sortable: true },
  { key: 'updated_at', label: 'Atualizado', sortable: true, align: 'right' },
  { key: 'actions', label: '', align: 'right' },
];

// ------- filtros / busca -------
// Capacidades REAIS do backend (apps/helpflow/api/src/repositories/crud-repo.js):
//  · q  → busca textual server-side (ILIKE em title/body/category/tags) sobre a BASE inteira.
//  · status / embedding_status → NÃO são parâmetros de list (o repo só aceita page/pageSize/sort/dir/q).
// Logo a busca textual roda no servidor (r.setFilters → recarrega), e os recortes por
// status/indexação são aplicados no CLIENTE, sobre a página carregada. Isso é sinalizado
// explicitamente na UI ("nesta página") para não passar números enganosos. NÃO inventamos
// parâmetros de API inexistentes.
const filterFields = [
  { key: 'q', label: 'Buscar na base', type: 'text', placeholder: 'título, conteúdo, categoria ou tag' },
  { key: 'status', label: 'Publicação (nesta página)', type: 'select', options: STATUS_OPTIONS },
  { key: 'embedding_status', label: 'Indexação (nesta página)', type: 'select', options: EMBED_OPTIONS },
];
const EMPTY_FILTERS = { q: '', status: '', embedding_status: '' };
const filters = ref({ ...EMPTY_FILTERS });

// busca textual ativa = filtro server-side; recortes = client-side sobre a página
const hasServerQuery = computed(() => filters.value.q.trim() !== '');
const hasClientCut = computed(() => !!filters.value.status || !!filters.value.embedding_status);
const hasFilters = computed(() => hasServerQuery.value || hasClientCut.value);
const clientCutLabel = computed(() => {
  const parts = [];
  if (filters.value.status) parts.push('publicação “' + publishLabel(filters.value.status) + '”');
  if (filters.value.embedding_status)
    parts.push('indexação “' + embedLabel(filters.value.embedding_status) + '”');
  return parts.join(' e ');
});

// ------- recurso (server-mode: paginação + ordenação + busca textual reais) -------
const r = useResource(kbArticles, {
  pageSize: 25,
  sort: { key: 'updated_at', dir: 'desc' },
  filters: { q: '' },
});

const archiveId = ref(null);
const reindexId = ref(null);
const density = ref('comfortable');

// A mensagem do erro de carga (Error → string) para o PageLayout/ErrorState.
const errorMessage = computed(() => {
  const e = r.error.value;
  if (!e) return null;
  return (e && e.message) || 'Não foi possível carregar a base de conhecimento.';
});

// linhas exibidas: a página do servidor (já filtrada por q) recortada no cliente
// pelos status de publicação/indexação (que o backend não filtra).
const pageRows = computed(() => {
  const rows = r.items.value || [];
  const st = filters.value.status;
  const em = filters.value.embedding_status;
  if (!st && !em) return rows;
  return rows.filter((row) => {
    if (st && String(row.status || '') !== st) return false;
    if (em && String(row.embedding_status || '') !== em) return false;
    return true;
  });
});

// ------- ações de filtro / visão -------
// aplica a busca textual no SERVIDOR (varre a base, não só a página) e reseta a paginação.
async function applyFilters() {
  try {
    await Promise.resolve(r.setFilters({ q: filters.value.q.trim() }));
  } catch (e) {
    toast.error('Não foi possível buscar na base', { detail: e && e.message });
  }
}
function onClear() {
  filters.value = { ...EMPTY_FILTERS };
  applyFilters();
}
function resetFilters() {
  filters.value = { ...EMPTY_FILTERS };
  applyFilters();
}
function clearClientCut() {
  filters.value = { ...filters.value, status: '', embedding_status: '' };
}
function quickStatus(status) {
  filters.value = { ...filters.value, status, embedding_status: '' };
}
function quickEmbedding(embedding_status) {
  filters.value = { ...filters.value, embedding_status, status: '' };
}
function onPageSize(size) {
  r.pageSize.value = size;
  r.setPage(1);
}
function toggleDensity() {
  density.value = density.value === 'compact' ? 'comfortable' : 'compact';
}
async function reload() {
  try {
    await r.load();
    if (!r.error.value) toast.success('Base atualizada');
  } catch (e) {
    toast.error('Não foi possível atualizar a base', { detail: e && e.message });
  }
}
function open(row) {
  router.push('/kb-articles/' + row.id);
}

// ------- ação sensível: arquivar (confirmação + toast) -------
async function archive(row) {
  const ok = await confirm({
    title: 'Arquivar artigo',
    message:
      'Arquivar “' +
      (row.title || 'Sem título') +
      '”? Ele deixa de aparecer para os clientes e sai da busca, mas o conteúdo é preservado.',
    confirmLabel: 'Arquivar',
    danger: true,
  });
  if (!ok) return;
  archiveId.value = row.id;
  try {
    await kbArticles.update(row.id, { status: 'archived' });
    toast.success('Artigo arquivado', { detail: row.title || ('#' + row.id) });
    await r.load();
  } catch (e) {
    toast.error('Não foi possível arquivar o artigo', {
      detail: (e && e.message) || 'Tente novamente.',
      code: e && e.status ? 'HTTP ' + e.status : '',
    });
  } finally {
    archiveId.value = null;
  }
}

// ------- ação de domínio: reindexar (refatia + re-embedda no pgvector) -------
// Só oferecida quando faz sentido (não-arquivado e indexação pendente/falha/ausente)
// e quando o backend expõe a ação. Degrada GRACIOSAMENTE (fail-closed) se a rota ainda
// não estiver montada (404/501/503): mostra erro e NUNCA fabrica resultado.
const canReindex = (row) =>
  typeof kbArticles.reindex === 'function' &&
  row.status !== 'archived' &&
  String(row.embedding_status || '') !== 'indexed';

async function reindex(row) {
  const ok = await confirm({
    title: 'Reindexar artigo',
    message:
      'Reprocessar o embedding de “' +
      (row.title || 'Sem título') +
      '”? O artigo é refatiado e re-indexado no pgvector para a busca semântica.',
    confirmLabel: 'Reindexar',
  });
  if (!ok) return;
  reindexId.value = row.id;
  try {
    await kbArticles.reindex(row.id);
    toast.success('Reindexação iniciada', {
      detail: 'O artigo será re-embedado no pgvector.',
    });
    await r.load();
  } catch (e) {
    const status = e && e.status;
    if (status === 404 || status === 501 || status === 503) {
      toast.warning('Reindexação indisponível', {
        detail: 'O serviço de indexação ainda não está habilitado neste ambiente.',
        code: 'HTTP ' + status,
      });
    } else {
      toast.error('Não foi possível reindexar o artigo', {
        detail: (e && e.message) || 'Tente novamente.',
        code: status ? 'HTTP ' + status : '',
      });
    }
  } finally {
    reindexId.value = null;
  }
}

// ------- métricas -------
// total: count do servidor (base inteira; respeita a busca textual q).
// published/draft/indexed/failed: contados na PÁGINA carregada (sem agregação no backend).
const metrics = computed(() => {
  const rows = r.items.value || [];
  let published = 0;
  let draft = 0;
  let indexed = 0;
  let failed = 0;
  for (const row of rows) {
    const s = String(row.status || '').toLowerCase();
    if (s === 'published') published += 1;
    if (s === 'draft') draft += 1;
    const e = String(row.embedding_status || '').toLowerCase();
    if (e === 'indexed') indexed += 1;
    if (e === 'failed') failed += 1;
  }
  return { total: r.total.value || rows.length, published, draft, indexed, failed };
});

// true quando há mais artigos na base do que os exibidos nesta página.
const isPaged = computed(() => (r.total.value || 0) > (r.items.value || []).length);
const pageScopedHint = (base) => (isPaged.value ? base + ' · nesta página' : base);

// cobertura de indexação = indexados / artigos da página (sinal de saúde da busca)
const coverageHint = computed(() => {
  const shown = (r.items.value || []).length;
  if (!shown) return pageScopedHint('Prontos p/ busca vetorial');
  const pct = Math.round((metrics.value.indexed / shown) * 100);
  return pct + '% da página indexada' + (isPaged.value ? ' · nesta página' : '');
});

// banner: prioriza falhas; senão alerta pendências de indexação na página
const indexWarning = computed(() => {
  const rows = r.items.value || [];
  const failed = rows.filter((x) => String(x.embedding_status || '').toLowerCase() === 'failed').length;
  if (failed > 0) return { count: failed, label: 'com falha', status: 'failed', tone: 'error', icon: '⚠' };
  const pending = rows.filter((x) => String(x.embedding_status || '').toLowerCase() === 'pending').length;
  if (pending > 0) return { count: pending, label: 'pendente', status: 'pending', tone: 'info', icon: '⟳' };
  return null;
});

const emptyState = computed(() => {
  if (hasServerQuery.value && (r.items.value || []).length === 0) {
    return {
      title: 'Nenhum artigo para a busca',
      description: 'Nenhum artigo na base corresponde ao termo. Ajuste ou limpe a busca.',
      icon: 'search',
    };
  }
  if (hasClientCut.value) {
    return {
      title: 'Nenhum artigo para este recorte nesta página',
      description:
        'O filtro de publicação/indexação é aplicado à página atual. Limpe o recorte ou avance as páginas para ver mais artigos.',
      icon: 'search',
    };
  }
  return {
    title: 'Base de conhecimento vazia',
    description:
      'Escreva o primeiro artigo. Depois de publicado, ele é indexado no pgvector e passa a alimentar a busca semântica e a IA de atendimento.',
    icon: 'doc',
  };
});

const footerSummary = computed(() => {
  if (r.loading.value) return 'Carregando artigos…';
  const total = r.total.value || (r.items.value || []).length;
  if (!total) return hasServerQuery.value ? 'Nenhum artigo para a busca.' : 'Nenhum artigo na base.';
  const order = r.sort.value ? ' · ordenado por ' + labelForKey(r.sort.value.key) : '';
  // total reflete a base (ou a busca server-side); o recorte por status/indexação é por página.
  const base = hasServerQuery.value
    ? total + ' artigo(s) encontrado(s) na base'
    : total + ' artigo(s) na base';
  if (hasClientCut.value) {
    const shown = pageRows.value.length;
    return base + ' · ' + shown + ' correspondem ao recorte nesta página' + order;
  }
  return base + order;
});
function labelForKey(key) {
  const c = columns.find((x) => x.key === key);
  return c && c.label ? c.label.toLowerCase() : key;
}

onMounted(r.load);
</script>

<style scoped>
.kb-ico {
  font-weight: 700;
  line-height: 1;
}

/* KPIs */
.kb-metrics {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: var(--ui-space-4);
}

/* banner de indexação (tom por data-attr; ícone + texto, nunca só cor) */
.kb-banner {
  display: flex;
  align-items: center;
  gap: var(--ui-space-3);
  flex-wrap: wrap;
  border-radius: var(--ui-radius-lg);
  padding: var(--ui-space-3) var(--ui-space-4);
}
.kb-banner[data-tone="error"] {
  background: rgb(var(--ui-danger) / 0.1);
  border: 1px solid rgb(var(--ui-danger) / 0.3);
}
.kb-banner[data-tone="info"] {
  background: rgb(var(--ui-accent) / 0.1);
  border: 1px solid rgb(var(--ui-accent) / 0.3);
}
.kb-banner-ico {
  font-size: 1.1rem;
  line-height: 1;
}
.kb-banner[data-tone="error"] .kb-banner-ico {
  color: rgb(var(--ui-danger));
}
.kb-banner[data-tone="info"] .kb-banner-ico {
  color: rgb(var(--ui-accent-strong));
}
.kb-banner-text {
  flex: 1 1 280px;
  font-size: var(--ui-text-sm);
  color: rgb(var(--ui-fg));
}
.kb-banner-text em {
  font-style: normal;
  font-weight: 700;
}
.kb-banner[data-tone="error"] .kb-banner-text em {
  color: rgb(var(--ui-danger));
}
.kb-banner[data-tone="info"] .kb-banner-text em {
  color: rgb(var(--ui-accent-strong));
}

/* aviso de recorte de cliente ativo */
.kb-active {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ui-space-3);
  flex-wrap: wrap;
  background: rgb(var(--ui-surface-2));
  border: 1px solid rgb(var(--ui-border));
  border-radius: var(--ui-radius-md);
  padding: var(--ui-space-2) var(--ui-space-4);
}
.kb-active-text {
  font-size: var(--ui-text-sm);
  color: rgb(var(--ui-muted));
}
.kb-active-text strong {
  color: rgb(var(--ui-fg));
}

/* coluna título */
.kb-title {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 240px;
}
.kb-title-main {
  font-weight: 600;
  color: rgb(var(--ui-fg));
}
.kb-title-meta {
  display: inline-flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  font-size: var(--ui-text-xs);
  color: rgb(var(--ui-muted));
}
.kb-ref {
  font-family: var(--ui-font-mono);
  color: rgb(var(--ui-accent-strong));
}
.kb-category {
  border: 1px solid rgb(var(--ui-border-strong));
  border-radius: var(--ui-radius-pill);
  padding: 0 8px;
  line-height: 1.6;
  color: rgb(var(--ui-muted));
}
.kb-tags {
  display: inline-flex;
  flex-wrap: wrap;
  gap: 4px;
}
.kb-tag {
  background: rgb(var(--ui-accent) / 0.1);
  color: rgb(var(--ui-accent-strong));
  border-radius: var(--ui-radius-sm);
  padding: 0 6px;
  line-height: 1.6;
  font-weight: 600;
}
.kb-tag-more {
  background: rgb(var(--ui-muted) / 0.14);
  color: rgb(var(--ui-muted));
}

/* badge dedicado de indexação vetorial (EmbeddingStatusBadge) */
.kb-embed {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: var(--ui-text-xs);
  font-weight: 600;
  padding: 3px 9px;
  border-radius: var(--ui-radius-pill);
  white-space: nowrap;
}
.kb-embed-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: currentColor;
  flex: none;
}
.kb-embed[data-state="indexed"] {
  background: rgb(var(--ui-ok) / 0.16);
  color: rgb(var(--ui-ok));
}
.kb-embed[data-state="pending"] {
  background: rgb(var(--ui-accent) / 0.16);
  color: rgb(var(--ui-accent-strong));
}
.kb-embed[data-state="pending"] .kb-embed-dot {
  animation: kb-pulse 1.4s ease-in-out infinite;
}
.kb-embed[data-state="failed"] {
  background: rgb(var(--ui-danger) / 0.16);
  color: rgb(var(--ui-danger));
}
.kb-embed[data-state="none"] {
  background: rgb(var(--ui-muted) / 0.14);
  color: rgb(var(--ui-muted));
  font-weight: 500;
}

@keyframes kb-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.35; }
}
@media (prefers-reduced-motion: reduce) {
  .kb-embed[data-state="pending"] .kb-embed-dot {
    animation: none;
  }
}

/* autor */
.kb-author {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  white-space: nowrap;
}
.kb-author-name {
  font-size: var(--ui-text-sm);
}
.kb-avatar {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  font-size: var(--ui-text-xs);
  font-weight: 700;
  background: rgb(var(--ui-accent) / 0.16);
  color: rgb(var(--ui-accent-strong));
}

.kb-dash,
.kb-dim {
  color: rgb(var(--ui-muted));
}
.kb-dim {
  font-size: var(--ui-text-xs);
  white-space: nowrap;
}

/* ações por linha */
.kb-row-actions {
  display: inline-flex;
  gap: var(--ui-space-2);
  justify-content: flex-end;
  flex-wrap: wrap;
}

/* ações da tabela vazia */
.kb-empty-actions {
  display: inline-flex;
  gap: var(--ui-space-2);
  flex-wrap: wrap;
}

/* rodapé: resumo + alternância de densidade */
.kb-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ui-space-3);
  flex-wrap: wrap;
}
.kb-density {
  font: inherit;
  font-size: var(--ui-text-xs);
  font-weight: 600;
  color: rgb(var(--ui-muted));
  background: transparent;
  border: 1px solid rgb(var(--ui-border));
  border-radius: var(--ui-radius-pill);
  padding: 5px 12px;
  cursor: pointer;
  transition: background 0.15s ease, color 0.15s ease;
}
.kb-density:hover {
  background: rgb(var(--ui-surface-2));
  color: rgb(var(--ui-fg));
}

@media (max-width: 1100px) {
  .kb-metrics {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
@media (max-width: 560px) {
  .kb-metrics {
    grid-template-columns: 1fr;
  }
  .kb-banner,
  .kb-active,
  .kb-foot {
    flex-direction: column;
    align-items: flex-start;
  }
}
</style>
