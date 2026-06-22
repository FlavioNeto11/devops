<template>
  <UiPageLayout
    width="full"
    eyebrow="HelpFlow · Base de conhecimento"
    :title="pageTitle"
    :subtitle="purpose"
    :loading="loading"
    :error="errorMessage"
    @retry="load"
  >
    <!-- Ações globais da tela -->
    <template #actions>
      <UiButton variant="ghost" to="/kb-articles">Voltar para a KB</UiButton>
      <UiButton variant="ghost" to="/kb-articles/search">Buscar na base</UiButton>
      <UiButton
        v-if="hasArticle"
        variant="subtle"
        :to="'/kb-articles/' + id + '/edit'"
      >Editar artigo</UiButton>
      <UiButton
        v-if="hasArticle"
        variant="primary"
        :loading="reindexing"
        :disabled="!canReindex"
        @click="onReindex"
      >{{ reindexCtaLabel }}</UiButton>
    </template>

    <!-- Banner: estado de indexação que pede atenção (pending/failed/indisponível) -->
    <template v-if="hasArticle && showIndexBanner" #banner>
      <div class="idx-banner" :data-tone="bannerTone" role="status">
        <span class="idx-banner-icon" aria-hidden="true">{{ embeddingGlyph }}</span>
        <div class="idx-banner-body">
          <p class="idx-banner-title">{{ embeddingBannerTitle }}</p>
          <p class="idx-banner-desc">{{ embeddingBannerDesc }}</p>
        </div>
        <UiButton
          v-if="reindexAvailable"
          variant="ghost"
          size="sm"
          :loading="reindexing"
          :disabled="!canReindex"
          @click="onReindex"
        >{{ reindexCtaLabel }}</UiButton>
      </div>
    </template>

    <!-- Estado: artigo não encontrado (id inexistente) — fail-closed, sem inventar dados -->
    <UiCard v-if="notFound">
      <UiEmptyState
        icon="search"
        title="Artigo não encontrado"
        :description="'Não há um artigo com o identificador #' + id + ' na base de conhecimento.'"
      >
        <template #action>
          <div class="nf-actions">
            <UiButton to="/kb-articles">Ver toda a base</UiButton>
            <UiButton variant="ghost" to="/kb-articles/new">Criar artigo</UiButton>
          </div>
        </template>
      </UiEmptyState>
    </UiCard>

    <template v-else>
      <!-- KPIs do artigo -->
      <div class="metrics" role="group" aria-label="Indicadores do artigo">
        <UiMetricCard
          label="Publicação"
          :value="statusLabel(article.status)"
          :tone="statusTone(article.status)"
          :hint="publicationHint"
        />
        <UiMetricCard
          label="Indexação vetorial"
          :value="embeddingLabel(embeddingStatus)"
          :tone="embeddingMetricTone"
          :hint="embeddingHint"
        />
        <UiMetricCard
          label="Chamados que citaram"
          :value="relatedMetricValue"
          tone="primary"
          :hint="relatedMetricHint"
          clickable
          @click="scrollToRelated"
        />
        <UiMetricCard
          label="Atualizado em"
          :value="fmtDate(article.updated_at)"
          tone="neutral"
          :hint="authorHint"
        />
      </div>

      <div class="grid">
        <!-- Coluna principal: artigo renderizado + chamados relacionados -->
        <div class="col-main">
          <!-- ArticleRenderer -->
          <UiCard :title="article.title || ('Artigo #' + id)" :subtitle="renderSubtitle">
            <template #actions>
              <div class="head-actions">
                <UiButton variant="ghost" size="sm" @click="copyLink">
                  {{ linkCopied ? 'Link copiado' : 'Copiar link' }}
                </UiButton>
                <div class="seg" role="tablist" aria-label="Modo de visualização do artigo">
                  <button
                    v-for="(opt, i) in viewModes"
                    :key="opt.value"
                    :id="'seg-tab-' + opt.value"
                    ref="segTabs"
                    class="seg-btn"
                    role="tab"
                    type="button"
                    :data-active="viewMode === opt.value ? 'true' : null"
                    :aria-selected="viewMode === opt.value"
                    :aria-controls="'seg-panel-' + opt.value"
                    :tabindex="viewMode === opt.value ? 0 : -1"
                    @click="viewMode = opt.value"
                    @keydown="onSegKeydown($event, i)"
                  >{{ opt.label }}</button>
                </div>
              </div>
            </template>

            <!-- Sem conteúdo -->
            <UiEmptyState
              v-if="!articleBody"
              icon="doc"
              title="Artigo sem conteúdo"
              description="Edite o artigo para adicionar o corpo que será indexado e exibido aos solicitantes."
            >
              <template #action>
                <UiButton :to="'/kb-articles/' + id + '/edit'">Escrever conteúdo</UiButton>
              </template>
            </UiEmptyState>

            <!-- Renderizado (markdown leve, CSP-safe: sem v-html) -->
            <div
              v-else-if="viewMode === 'rendered'"
              id="seg-panel-rendered"
              class="reader"
              role="tabpanel"
              tabindex="0"
              aria-labelledby="seg-tab-rendered"
            >
              <!-- Sumário (table of contents) quando há títulos -->
              <nav v-if="toc.length > 1" class="toc" aria-label="Sumário do artigo">
                <p class="toc-title">Neste artigo</p>
                <ol class="toc-list">
                  <li v-for="h in toc" :key="h.id" class="toc-item" :data-level="h.level">
                    <a :href="'#' + h.id" class="toc-link">{{ h.text }}</a>
                  </li>
                </ol>
              </nav>

              <article class="article">
                <component
                  :is="block.tag"
                  v-for="block in renderedBlocks"
                  :key="block.key"
                  :id="block.anchor || null"
                  class="article-block"
                  :data-kind="block.kind"
                >
                  <template v-if="block.kind === 'list'">
                    <component
                      :is="block.ordered ? 'ol' : 'ul'"
                      class="article-list"
                      :data-ordered="block.ordered ? 'true' : null"
                    >
                      <li v-for="(li, j) in block.items" :key="j" class="article-li">
                        <span
                          v-for="(seg, k) in li"
                          :key="k"
                          class="seg-span"
                          :data-style="seg.style"
                        >{{ seg.text }}</span>
                      </li>
                    </component>
                  </template>
                  <template v-else-if="block.kind === 'code'">{{ block.text }}</template>
                  <template v-else>
                    <span
                      v-for="(seg, k) in block.segments"
                      :key="k"
                      class="seg-span"
                      :data-style="seg.style"
                    >{{ seg.text }}</span>
                  </template>
                </component>
              </article>
            </div>

            <!-- Original (texto cru) -->
            <pre
              v-else
              id="seg-panel-raw"
              class="raw"
              role="tabpanel"
              tabindex="0"
              aria-labelledby="seg-tab-raw"
            >{{ articleBody }}</pre>

            <template #footer>
              <div class="article-foot">
                <div v-if="tagList.length" class="tags" aria-label="Tags do artigo">
                  <UiStatusBadge
                    v-for="t in tagList"
                    :key="t"
                    tone="neutral"
                    :label="'#' + t"
                    :with-dot="false"
                    size="sm"
                  />
                </div>
                <span v-else class="ui-muted">Sem tags.</span>
                <span v-if="readingMeta" class="article-foot-meta">{{ readingMeta }}</span>
              </div>
            </template>
          </UiCard>

          <!-- RelatedTicketsList -->
          <UiCard
            ref="relatedCard"
            title="Chamados relacionados"
            subtitle="Tickets que citaram este artigo na resolução."
          >
            <template #actions>
              <UiButton variant="ghost" size="sm" :loading="relatedLoading" @click="loadRelated">
                Atualizar
              </UiButton>
            </template>

            <!-- Resumo por status (quando há relacionados) -->
            <div v-if="!relatedLoading && !relatedError && relatedTickets.length" class="rel-summary">
              <UiStatusBadge
                v-for="b in relatedSummary"
                :key="b.key"
                :status="b.key"
                :tone="b.tone"
                :label="b.label + ' · ' + b.count"
                size="sm"
              />
            </div>

            <UiDataTable
              :columns="relatedColumns"
              :rows="relatedTickets"
              :loading="relatedLoading"
              :error="relatedError"
              row-key="id"
              density="compact"
              clickable-rows
              :empty="{
                icon: 'inbox',
                title: 'Nenhum chamado citou este artigo',
                description: 'Quando um agente referenciar este artigo num chamado, ele aparece aqui.',
              }"
              @retry="loadRelated"
              @row-click="openTicket"
            >
              <template #cell-subject="{ row }">
                <span class="tk-subject">{{ row.subject || ('Chamado #' + row.id) }}</span>
              </template>
              <template #cell-status="{ value }">
                <UiStatusBadge :status="value" :label="ticketStatusLabel(value)" size="sm" />
              </template>
              <template #cell-priority="{ value }">
                <UiStatusBadge
                  :status="value"
                  :tone="priorityTone(value)"
                  :label="priorityLabel(value)"
                  size="sm"
                />
              </template>
              <template #cell-updated_at="{ value }">{{ fmtDateTime(value) }}</template>
              <template #empty-action>
                <UiButton variant="subtle" to="/tickets">Ver todos os chamados</UiButton>
              </template>
            </UiDataTable>
          </UiCard>
        </div>

        <!-- Coluna lateral: indexação + metadados + atalhos -->
        <aside class="col-side" aria-label="Indexação e metadados">
          <!-- EmbeddingStatusBadge + pipeline + ReindexButton -->
          <UiCard title="Indexação vetorial" subtitle="Estado do RAG (pgvector) deste artigo.">
            <div class="idx">
              <div class="idx-row">
                <span class="idx-label">Situação</span>
                <UiStatusBadge
                  :status="embeddingStatus"
                  :tone="embeddingMetricTone"
                  :label="embeddingLabel(embeddingStatus)"
                  size="lg"
                />
              </div>

              <ol class="idx-steps" aria-label="Etapas da indexação">
                <li
                  v-for="step in indexSteps"
                  :key="step.key"
                  class="idx-step"
                  :data-state="step.state"
                >
                  <span class="idx-step-dot" aria-hidden="true">{{ step.glyph }}</span>
                  <span class="idx-step-text">{{ step.label }}</span>
                </li>
              </ol>

              <p class="idx-note">{{ embeddingBannerDesc }}</p>

              <UiButton
                block
                variant="primary"
                :loading="reindexing"
                :disabled="!canReindex"
                @click="onReindex"
              >{{ reindexCtaLabel }}</UiButton>

              <p v-if="!reindexAvailable" class="ui-muted idx-foot-note" role="note">
                Reindexação indisponível neste ambiente (fail-closed).
              </p>
              <p v-else-if="lastReindexAt" class="ui-muted idx-foot-note">
                Última reindexação solicitada: {{ fmtDateTime(lastReindexAt) }}.
              </p>
            </div>
          </UiCard>

          <!-- Metadados (detalhe dt/dd) -->
          <UiCard title="Metadados">
            <dl class="meta">
              <div>
                <dt>Identificador</dt>
                <dd class="ui-mono">#{{ article.id ?? id }}</dd>
              </div>
              <div>
                <dt>Categoria</dt>
                <dd>
                  <UiStatusBadge
                    v-if="article.category"
                    tone="running"
                    :label="article.category"
                    :with-dot="false"
                    size="sm"
                  />
                  <span v-else class="ui-muted">Sem categoria</span>
                </dd>
              </div>
              <div>
                <dt>Publicação</dt>
                <dd>
                  <UiStatusBadge
                    :status="article.status"
                    :tone="statusTone(article.status)"
                    :label="statusLabel(article.status)"
                    size="sm"
                  />
                </dd>
              </div>
              <div>
                <dt>Autor</dt>
                <dd>{{ article.author_id != null ? ('#' + article.author_id) : '—' }}</dd>
              </div>
              <div>
                <dt>Atualizado em</dt>
                <dd>{{ fmtDateTime(article.updated_at) }}</dd>
              </div>
            </dl>
          </UiCard>

          <!-- Atalhos de domínio -->
          <UiCard title="Atalhos">
            <div class="quick">
              <UiButton variant="subtle" block :to="'/kb-articles/' + id + '/edit'">Editar artigo</UiButton>
              <UiButton variant="ghost" block to="/kb-articles">Ver toda a base</UiButton>
              <UiButton variant="ghost" block to="/kb-articles/search">Buscar na base</UiButton>
              <UiButton variant="ghost" block to="/tickets">Abrir chamados</UiButton>
            </div>
          </UiCard>
        </aside>
      </div>
    </template>

    <!-- Modal: resultado da reindexação -->
    <UiModal v-model:open="reindexModal" title="Reindexação solicitada" width="sm">
      <div class="rx">
        <p class="rx-lead">{{ reindexResultMsg }}</p>
        <ul class="rx-list">
          <li>
            <span>Estado vetorial</span>
            <UiStatusBadge
              :status="embeddingStatus"
              :tone="embeddingMetricTone"
              :label="embeddingLabel(embeddingStatus)"
              size="sm"
            />
          </li>
          <li v-if="reindexChunks != null">
            <span>Trechos (chunks)</span><strong>{{ reindexChunks }}</strong>
          </li>
          <li v-if="lastReindexAt">
            <span>Solicitado em</span><strong>{{ fmtDateTime(lastReindexAt) }}</strong>
          </li>
        </ul>
      </div>
      <template #footer>
        <UiButton variant="ghost" @click="reindexModal = false">Fechar</UiButton>
        <UiButton @click="refreshAfterReindex">Atualizar artigo</UiButton>
      </template>
    </UiModal>
  </UiPageLayout>
</template>

<script setup>
import { ref, computed, onMounted, nextTick } from 'vue';
import { useRouter } from 'vue-router';
import {
  UiPageLayout, UiCard, UiButton, UiMetricCard, UiStatusBadge,
  UiDataTable, UiEmptyState, UiModal,
  useToast, useConfirm, format, resolveGlyph,
} from '../ui/index.js';
import * as api from '../api.js';

const props = defineProps({ id: { type: [String, Number], required: true } });
const router = useRouter();
const toast = useToast();
const ask = useConfirm();

const purpose = 'Artigo renderizado, estado da indexação vetorial e chamados que o citaram.';

// ---- recursos REAIS de domínio (api.js os exporta; o integrador garante api['kb-articles']) ----
// Sem fallback a placeholders do scaffold: se a função não existir, a tela falha fechado
// (error state / ação indisponível), nunca apontando para a tabela errada.
const kb = api.kbArticles || api['kb-articles'] || null;
const ticketsApi = api.tickets || null;
function hasFn(obj, name) { return obj && typeof obj[name] === 'function'; }

// ============================ estado base ============================
const loading = ref(true);
const error = ref(null);
const notFound = ref(false);
const article = ref({});

const hasArticle = computed(() => !notFound.value && article.value && article.value.id != null);
const errorMessage = computed(() => (notFound.value ? null : (error.value ? messageOf(error.value) : null)));
const pageTitle = computed(() => {
  if (notFound.value) return 'Artigo não encontrado';
  return article.value.title || ('Artigo #' + props.id);
});

const id = computed(() => props.id);

function messageOf(e) {
  if (!e) return '';
  return (e.message) || String(e);
}

const fmtDate = (v) => format.formatDate(v);
const fmtDateTime = (v) => format.formatDateTime(v);

// ---- rótulos de domínio (a cor nunca é o único sinal: sempre há label) ----
const STATUS_LABELS = { draft: 'Rascunho', published: 'Publicado', archived: 'Arquivado' };
const EMBED_LABELS = { pending: 'Pendente', indexed: 'Indexado', failed: 'Falhou' };
const TICKET_STATUS = {
  open: 'Aberto', in_progress: 'Em atendimento', pending: 'Pendente',
  on_hold: 'Em espera', resolved: 'Resolvido', closed: 'Fechado',
};
const PRIORITY_LABELS = { low: 'Baixa', medium: 'Média', high: 'Alta', urgent: 'Urgente' };

const statusLabel = (s) => (s ? (STATUS_LABELS[s] || format.humanize(s)) : '—');
const embeddingLabel = (s) => (s ? (EMBED_LABELS[s] || format.humanize(s)) : 'Não indexado');
const ticketStatusLabel = (s) => (s ? (TICKET_STATUS[s] || format.humanize(s)) : '—');
const priorityLabel = (p) => (p ? (PRIORITY_LABELS[p] || format.humanize(p)) : '—');

function statusTone(s) {
  if (s === 'published') return 'success';
  if (s === 'archived') return 'neutral';
  return 'warning'; // draft / desconhecido
}
function priorityTone(p) {
  if (p === 'urgent') return 'error';
  if (p === 'high') return 'warning';
  if (p === 'low') return 'neutral';
  return 'running'; // medium
}

const publicationHint = computed(() => {
  const s = article.value.status;
  if (s === 'published') return 'Visível ao público';
  if (s === 'archived') return 'Fora da base ativa';
  return 'Não publicado';
});
const authorHint = computed(() =>
  article.value.author_id != null ? ('Autor #' + article.value.author_id) : 'Autoria não informada',
);

// ============================ indexação vetorial (EmbeddingStatusBadge) ============================
const embeddingStatus = computed(() =>
  article.value.embedding_status || (hasArticle.value ? 'pending' : ''),
);
const embeddingMetricTone = computed(() => {
  const s = embeddingStatus.value;
  if (s === 'indexed') return 'success';
  if (s === 'failed') return 'error';
  return 'warning'; // pending / vazio
});
const bannerTone = computed(() => (reindexAvailable.value ? embeddingMetricTone.value : 'error'));
const embeddingGlyph = computed(() => {
  if (!reindexAvailable.value) return resolveGlyph('ban');
  const s = embeddingStatus.value;
  if (s === 'indexed') return resolveGlyph('check');
  if (s === 'failed') return resolveGlyph('warning');
  return resolveGlyph('clock');
});
const embeddingHint = computed(() => {
  const s = embeddingStatus.value;
  if (s === 'indexed') return 'Disponível no RAG';
  if (s === 'failed') return 'Requer reindexação';
  return 'Aguardando indexação';
});
const embeddingBannerTitle = computed(() => {
  if (!reindexAvailable.value) return 'Reindexação indisponível';
  const s = embeddingStatus.value;
  if (s === 'failed') return 'A indexação vetorial falhou';
  if (s === 'pending') return 'Artigo aguardando indexação';
  return 'Indexação vetorial';
});
const embeddingBannerDesc = computed(() => {
  if (!reindexAvailable.value) {
    return 'O serviço de embeddings não está habilitado neste ambiente. O artigo não pode ser indexado agora (fail-closed).';
  }
  const s = embeddingStatus.value;
  if (s === 'indexed') return 'O conteúdo foi fatiado em trechos e embeddado — disponível para busca semântica.';
  if (s === 'failed') return 'O embeddador não concluiu. Reindexe para tornar o artigo pesquisável pelo assistente.';
  return 'Este artigo ainda não foi fatiado e embeddado. Reindexe para incluí-lo na busca semântica (pgvector).';
});
const showIndexBanner = computed(() => !reindexAvailable.value || embeddingStatus.value !== 'indexed');

// passos do pipeline de indexação (estado visual por etapa)
const indexSteps = computed(() => {
  const s = embeddingStatus.value;
  const done = s === 'indexed';
  const failed = s === 'failed';
  const mk = (key, label, ok) => ({
    key, label,
    state: failed ? 'failed' : (ok ? 'done' : 'idle'),
    glyph: failed ? resolveGlyph('warning') : (ok ? resolveGlyph('check') : resolveGlyph('none')),
  });
  return [
    mk('chunk', 'Fatiar artigo em trechos (~500 tokens)', done || failed),
    mk('embed', 'Gerar embedding por trecho', done),
    mk('store', 'Gravar vetores no índice (pgvector)', done),
  ];
});

// ============================ ArticleRenderer (CSP-safe, sem v-html) ============================
const viewMode = ref('rendered');
const viewModes = [
  { value: 'rendered', label: 'Renderizado' },
  { value: 'raw', label: 'Original' },
];
// Tabs WAI-ARIA: roving tabindex + navegação por seta (Home/End/wrap-around).
const segTabs = ref([]);
function onSegKeydown(ev, idx) {
  const keys = { ArrowRight: idx + 1, ArrowLeft: idx - 1, Home: 0, End: viewModes.length - 1 };
  if (!(ev.key in keys)) return;
  ev.preventDefault();
  const next = (keys[ev.key] + viewModes.length) % viewModes.length;
  viewMode.value = viewModes[next].value;
  nextTick(() => {
    const el = segTabs.value && segTabs.value[next];
    if (el && typeof el.focus === 'function') el.focus();
  });
}

const articleBody = computed(() => {
  const b = article.value.body;
  return (b == null) ? '' : String(b).trim();
});

// --- tokenizador de ênfase inline: **negrito**, *itálico*, `código` → segmentos
// puros (texto + estilo). Nada de v-html: cada segmento é texto numa <span data-style>.
function tokenizeInline(text) {
  const out = [];
  const re = /(\*\*([^*]+)\*\*|\*([^*]+)\*|`([^`]+)`)/g;
  let last = 0;
  let m;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) out.push({ text: text.slice(last, m.index), style: 'plain' });
    if (m[2] !== undefined) out.push({ text: m[2], style: 'strong' });
    else if (m[3] !== undefined) out.push({ text: m[3], style: 'em' });
    else if (m[4] !== undefined) out.push({ text: m[4], style: 'code' });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ text: text.slice(last), style: 'plain' });
  return out.length ? out : [{ text, style: 'plain' }];
}

// Blocos derivados do texto (markdown leve). Suporta títulos (#..###), listas
// (ordenadas/não), citações (>), blocos de código (```), parágrafos. Cada bloco
// vira componentes/segmentos puros — CSP-safe.
const renderedBlocks = computed(() => {
  if (!articleBody.value) return [];
  const blocks = [];
  let key = 0;
  let headingSeq = 0;
  const lines = articleBody.value.split('\n');
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    // bloco de código cercado por ```
    const fence = line.match(/^\s*```/);
    if (fence) {
      const buf = [];
      i++;
      while (i < lines.length && !/^\s*```/.test(lines[i])) { buf.push(lines[i]); i++; }
      i++; // pula a cerca de fechamento
      blocks.push({ key: key++, tag: 'pre', kind: 'code', text: buf.join('\n') });
      continue;
    }

    // linha em branco — separador
    if (!line.trim()) { i++; continue; }

    // título
    const h = line.match(/^(#{1,3})\s+(.*)$/);
    if (h) {
      const level = h[1].length;
      const text = h[2].trim();
      const anchor = 'kb-h-' + (++headingSeq);
      blocks.push({
        key: key++, tag: level === 1 ? 'h2' : 'h3', kind: 'heading',
        anchor, level, segments: tokenizeInline(text),
      });
      i++;
      continue;
    }

    // citação ( > ... )
    if (/^\s*>\s?/.test(line)) {
      const buf = [];
      while (i < lines.length && /^\s*>\s?/.test(lines[i])) {
        buf.push(lines[i].replace(/^\s*>\s?/, ''));
        i++;
      }
      blocks.push({ key: key++, tag: 'blockquote', kind: 'quote', segments: tokenizeInline(buf.join(' ').trim()) });
      continue;
    }

    // lista (- / * / 1.)
    const listMatch = line.match(/^\s*([-*]|\d+\.)\s+/);
    if (listMatch) {
      const ordered = /\d+\./.test(listMatch[1]);
      const items = [];
      while (i < lines.length && /^\s*([-*]|\d+\.)\s+/.test(lines[i])) {
        items.push(tokenizeInline(lines[i].replace(/^\s*([-*]|\d+\.)\s+/, '').trim()));
        i++;
      }
      blocks.push({ key: key++, tag: 'div', kind: 'list', ordered, items });
      continue;
    }

    // parágrafo (junta linhas contíguas que não são bloco especial)
    const para = [line];
    i++;
    while (
      i < lines.length && lines[i].trim() &&
      !/^(#{1,3})\s+/.test(lines[i]) && !/^\s*([-*]|\d+\.)\s+/.test(lines[i]) &&
      !/^\s*>\s?/.test(lines[i]) && !/^\s*```/.test(lines[i])
    ) {
      para.push(lines[i]);
      i++;
    }
    blocks.push({ key: key++, tag: 'p', kind: 'para', segments: tokenizeInline(para.join(' ').trim()) });
  }
  return blocks;
});

// sumário (table of contents) a partir dos títulos
const toc = computed(() =>
  renderedBlocks.value
    .filter((b) => b.kind === 'heading')
    .map((b) => ({ id: b.anchor, level: b.level, text: b.segments.map((s) => s.text).join('') })),
);

const renderSubtitle = computed(() => {
  if (!hasArticle.value) return '';
  if (article.value.status === 'published') return 'Conteúdo publicado na base de conhecimento.';
  if (article.value.status === 'archived') return 'Artigo arquivado (não exibido aos solicitantes).';
  return 'Rascunho — visível apenas para a equipe.';
});

const tagList = computed(() => {
  const raw = article.value.tags;
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.map((t) => String(t).trim().replace(/^#/, '')).filter(Boolean);
  return String(raw).split(/[,;]+/).map((t) => t.trim().replace(/^#/, '')).filter(Boolean);
});

const wordCount = computed(() => (articleBody.value ? articleBody.value.split(/\s+/).filter(Boolean).length : 0));
const readingMeta = computed(() => {
  if (!wordCount.value) return '';
  const mins = Math.max(1, Math.round(wordCount.value / 200));
  return wordCount.value + ' palavras · ~' + mins + ' min de leitura';
});

// copiar link do artigo (clipboard com fail-soft; sem dado fabricado)
const linkCopied = ref(false);
async function copyLink() {
  let href = '';
  try { href = (typeof window !== 'undefined' && window.location) ? window.location.href : ''; } catch { href = ''; }
  if (!href) { toast.error('Não foi possível obter o endereço desta página.'); return; }
  try {
    if (navigator && navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(href);
      linkCopied.value = true;
      toast.success('Link do artigo copiado');
      setTimeout(() => { linkCopied.value = false; }, 2500);
    } else {
      toast.info('Copie o endereço da barra do navegador.');
    }
  } catch {
    toast.error('Não foi possível copiar o link.');
  }
}

// ============================ carregamento ============================
async function load() {
  loading.value = true; error.value = null; notFound.value = false;
  try {
    if (!hasFn(kb, 'get')) throw new Error('Recurso de artigos indisponível.');
    const a = await kb.get(props.id);
    article.value = a || {};
    if (article.value.id == null) notFound.value = true;
  } catch (e) {
    if (e && e.status === 404) { notFound.value = true; article.value = {}; }
    else error.value = e;
  } finally {
    loading.value = false;
  }
  if (!notFound.value && !error.value) loadRelated();
}

// ============================ RelatedTicketsList ============================
const relatedLoading = ref(true);
const relatedError = ref(null);
const relatedTickets = ref([]);
const relatedColumns = [
  { key: 'id', label: '#', align: 'right' },
  { key: 'subject', label: 'Assunto' },
  { key: 'status', label: 'Status' },
  { key: 'priority', label: 'Prioridade' },
  { key: 'updated_at', label: 'Atualizado', align: 'right' },
];

const relatedMetricValue = computed(() => (relatedLoading.value ? '…' : relatedTickets.value.length));
const relatedMetricHint = computed(() => {
  if (relatedLoading.value) return 'Buscando…';
  if (relatedError.value) return 'Falha ao buscar';
  return relatedTickets.value.length ? 'Referências encontradas' : 'Nenhuma citação ainda';
});

// resumo por status (chips com contagem)
const relatedSummary = computed(() => {
  const by = new Map();
  for (const t of relatedTickets.value) {
    const k = t.status || 'unknown';
    by.set(k, (by.get(k) || 0) + 1);
  }
  return [...by.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([key, count]) => ({ key, count, label: ticketStatusLabel(key) }));
});

// um chamado "cita" o artigo se referenciá-lo por id/slug em campos conhecidos.
function citesArticle(t) {
  if (!t) return false;
  const idStr = String(props.id);
  const slug = article.value.slug || '';
  const direct = [t.kb_article_id, t.article_id, t.related_article_id];
  if (direct.some((v) => v != null && String(v) === idStr)) return true;
  const arr = t.kb_article_ids || t.article_ids || t.related_articles;
  if (Array.isArray(arr) && arr.some((v) => String(v) === idStr || (slug && String(v) === slug))) return true;
  // referência textual no corpo/resolução (ex.: "KB-12" ou o slug)
  const hay = [t.resolution, t.description].filter(Boolean).join(' ').toLowerCase();
  if (hay) {
    if (slug && hay.includes(String(slug).toLowerCase())) return true;
    if (new RegExp('kb[-_ ]?' + idStr + '(?!\\d)', 'i').test(hay)) return true;
  }
  return false;
}

async function loadRelated() {
  relatedLoading.value = true; relatedError.value = null;
  try {
    if (!hasFn(ticketsApi, 'list')) { relatedTickets.value = []; return; }
    // tenta filtrar no servidor; cai para filtro no cliente se o backend ignorar o parâmetro.
    const r = await ticketsApi.list({ kb_article_id: props.id, pageSize: 200, sort: 'updated_at', dir: 'desc' });
    const rows = (r && r.data) || (Array.isArray(r) ? r : []);
    const filtered = rows.filter(citesArticle);
    // se nada bateu no filtro mas o servidor já restringiu, usa o filtro (vazio honesto);
    // se o servidor devolveu tudo, o filtro local segura o ruído.
    relatedTickets.value = filtered;
  } catch (e) {
    relatedError.value = e;
  } finally {
    relatedLoading.value = false;
  }
}
const openTicket = (row) => { if (row && row.id != null) router.push('/tickets/' + row.id); };

const relatedCard = ref(null);
function scrollToRelated() {
  const el = relatedCard.value && relatedCard.value.$el;
  if (el && typeof el.scrollIntoView === 'function') el.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ============================ ReindexButton ============================
const reindexing = ref(false);
const reindexAvailable = ref(true);
const reindexModal = ref(false);
const reindexResultMsg = ref('');
const reindexChunks = ref(null);
const lastReindexAt = ref(null);

const canReindex = computed(() => reindexAvailable.value && !reindexing.value && hasArticle.value);
const reindexCtaLabel = computed(() => {
  if (!reindexAvailable.value) return 'Reindexar embeddings';
  if (embeddingStatus.value === 'indexed') return 'Reindexar embeddings';
  if (embeddingStatus.value === 'failed') return 'Tentar reindexar';
  return 'Indexar agora';
});

async function onReindex() {
  if (!canReindex.value) return;
  const ok = await ask({
    title: 'Reindexar artigo',
    message: 'Reprocessar este artigo? Ele será fatiado em trechos e re-embeddado para a busca semântica. A indexação anterior é substituída.',
    confirmLabel: 'Reindexar',
  });
  if (!ok) return;

  // ação real garantida pelo integrador; sem endpoint → fail-closed, sem inventar rota.
  if (!hasFn(kb, 'reindex')) {
    reindexAvailable.value = false;
    toast.error('Reindexação indisponível neste ambiente.', { detail: 'Endpoint de reindexação não habilitado.' });
    return;
  }

  reindexing.value = true;
  try {
    const res = await kb.reindex(props.id);
    lastReindexAt.value = new Date().toISOString();
    // atualiza o estado vetorial a partir da resposta (fail-soft p/ formatos diversos).
    const nextStatus = (res && (res.embedding_status || (res.article && res.article.embedding_status)));
    article.value = { ...article.value, embedding_status: nextStatus || 'pending' };
    reindexChunks.value = (res && (res.chunks ?? res.chunk_count)) ?? null;
    reindexResultMsg.value = (res && res.message)
      || 'O artigo foi enfileirado para reindexação. O estado será atualizado quando o embeddador concluir.';
    reindexModal.value = true;
    toast.success('Reindexação solicitada');
  } catch (e) {
    if (e && (e.status === 404 || e.status === 501 || e.status === 503)) {
      reindexAvailable.value = false;
      toast.error('Reindexação indisponível (fail-closed)', { detail: e.message || 'sem serviço de embeddings' });
    } else {
      toast.error((e && e.message) || 'Falha ao reindexar o artigo');
    }
  } finally {
    reindexing.value = false;
  }
}

async function refreshAfterReindex() {
  reindexModal.value = false;
  await load();
}

onMounted(load);
</script>

<style scoped>
/* ---------- banner de indexação ---------- */
.idx-banner {
  display: flex; align-items: center; gap: var(--ui-space-3);
  padding: var(--ui-space-3) var(--ui-space-4);
  border: 1px solid rgb(var(--ui-border)); border-left: 4px solid rgb(var(--ui-faint));
  border-radius: var(--ui-radius-lg); background: rgb(var(--ui-surface-2));
}
.idx-banner[data-tone="success"] { border-left-color: rgb(var(--ui-ok)); background: rgb(var(--ui-ok) / 0.08); }
.idx-banner[data-tone="warning"] { border-left-color: rgb(var(--ui-warn)); background: rgb(var(--ui-warn) / 0.08); }
.idx-banner[data-tone="error"] { border-left-color: rgb(var(--ui-danger)); background: rgb(var(--ui-danger) / 0.08); }
.idx-banner-icon { font-size: 1.4rem; flex: 0 0 auto; line-height: 1; }
.idx-banner-body { flex: 1 1 auto; min-width: 0; }
.idx-banner-title { margin: 0; font-weight: 700; }
.idx-banner-desc { margin: 2px 0 0; color: rgb(var(--ui-muted)); font-size: var(--ui-text-sm); }

/* ---------- "não encontrado" ---------- */
.nf-actions { display: flex; gap: var(--ui-space-2); flex-wrap: wrap; justify-content: center; }

/* ---------- métricas ---------- */
.metrics { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: var(--ui-space-4); }

/* ---------- layout 2 colunas ---------- */
.grid { display: grid; grid-template-columns: minmax(0, 1fr) 340px; gap: var(--ui-space-4); align-items: start; }
.col-main { display: flex; flex-direction: column; gap: var(--ui-space-4); min-width: 0; }
.col-side { display: flex; flex-direction: column; gap: var(--ui-space-4); position: sticky; top: var(--ui-space-4); }

/* ---------- ações no cabeçalho do card ---------- */
.head-actions { display: inline-flex; align-items: center; gap: var(--ui-space-2); flex-wrap: wrap; }

/* ---------- segmented control ---------- */
.seg { display: inline-flex; border: 1px solid rgb(var(--ui-border-strong)); border-radius: var(--ui-radius-pill); overflow: hidden; }
.seg-btn {
  font: inherit; font-size: var(--ui-text-xs); font-weight: 600; cursor: pointer;
  padding: 5px 12px; border: none; background: transparent; color: rgb(var(--ui-muted));
}
.seg-btn:hover { color: rgb(var(--ui-fg)); background: rgb(var(--ui-surface-2)); }
.seg-btn[data-active="true"] { background: rgb(var(--ui-accent)); color: rgb(var(--ui-accent-fg)); }

/* ---------- ArticleRenderer ---------- */
.reader { display: grid; grid-template-columns: minmax(0, 1fr) 220px; gap: var(--ui-space-5); align-items: start; }
.article { display: flex; flex-direction: column; gap: var(--ui-space-3); max-width: 72ch; min-width: 0; }
.article-block { margin: 0; line-height: 1.7; color: rgb(var(--ui-fg)); }
.article-block[data-kind="heading"] { margin-top: var(--ui-space-3); scroll-margin-top: var(--ui-space-5); }
.article-block[data-kind="para"] { word-break: break-word; }
.article-block[data-kind="quote"] {
  padding: var(--ui-space-2) var(--ui-space-4);
  border-left: 3px solid rgb(var(--ui-accent)); background: rgb(var(--ui-accent) / 0.06);
  border-radius: var(--ui-radius-sm); color: rgb(var(--ui-muted)); font-style: italic;
}
.article-block[data-kind="code"] {
  margin: 0; padding: var(--ui-space-4); border-radius: var(--ui-radius-md);
  background: rgb(var(--ui-surface-2)); border: 1px solid rgb(var(--ui-border));
  font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace; font-size: var(--ui-text-sm);
  line-height: 1.6; white-space: pre-wrap; word-break: break-word; overflow-x: auto;
}
.article-list { margin: 0; padding-left: var(--ui-space-5); display: flex; flex-direction: column; gap: 4px; }
.article-li { line-height: 1.7; }

/* segmentos inline (ênfase) — texto puro estilizado por data-style (CSP-safe) */
.seg-span[data-style="strong"] { font-weight: 700; }
.seg-span[data-style="em"] { font-style: italic; }
.seg-span[data-style="code"] {
  font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace; font-size: 0.9em;
  background: rgb(var(--ui-surface-2)); border: 1px solid rgb(var(--ui-border));
  border-radius: var(--ui-radius-sm); padding: 1px 5px;
}

/* sumário */
.toc {
  position: sticky; top: var(--ui-space-2);
  border: 1px solid rgb(var(--ui-border)); border-radius: var(--ui-radius-md);
  background: rgb(var(--ui-surface-2)); padding: var(--ui-space-3) var(--ui-space-4);
}
.toc-title { margin: 0 0 var(--ui-space-2); font-size: var(--ui-text-xs); font-weight: 700; text-transform: uppercase; letter-spacing: .06em; color: rgb(var(--ui-muted)); }
.toc-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 4px; }
.toc-item[data-level="2"] .toc-link { padding-left: var(--ui-space-3); }
.toc-link { font-size: var(--ui-text-sm); color: rgb(var(--ui-muted)); }
.toc-link:hover { color: rgb(var(--ui-accent-strong)); }

.raw {
  margin: 0; padding: var(--ui-space-4); border-radius: var(--ui-radius-md);
  background: rgb(var(--ui-surface-2)); border: 1px solid rgb(var(--ui-border));
  font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace; font-size: var(--ui-text-sm);
  line-height: 1.6; white-space: pre-wrap; word-break: break-word; overflow-x: auto;
}
.article-foot { display: flex; align-items: center; justify-content: space-between; gap: var(--ui-space-3); flex-wrap: wrap; }
.tags { display: flex; gap: var(--ui-space-2); flex-wrap: wrap; }
.article-foot-meta { color: rgb(var(--ui-muted)); font-size: var(--ui-text-xs); }

/* ---------- chamados relacionados ---------- */
.rel-summary { display: flex; gap: var(--ui-space-2); flex-wrap: wrap; margin-bottom: var(--ui-space-3); }
.tk-subject { font-weight: 600; }

/* ---------- indexação (sidebar) ---------- */
.idx { display: flex; flex-direction: column; gap: var(--ui-space-3); }
.idx-row { display: flex; align-items: center; justify-content: space-between; gap: var(--ui-space-2); }
.idx-label { color: rgb(var(--ui-muted)); font-size: var(--ui-text-sm); }
.idx-steps { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--ui-space-2); }
.idx-step { display: flex; align-items: center; gap: var(--ui-space-2); font-size: var(--ui-text-sm); }
.idx-step-dot {
  flex: 0 0 auto; width: 20px; height: 20px; border-radius: 50%;
  display: inline-flex; align-items: center; justify-content: center;
  font-size: var(--ui-text-xs); font-weight: 700;
  background: rgb(var(--ui-surface-2)); color: rgb(var(--ui-muted)); border: 1px solid rgb(var(--ui-border));
}
.idx-step[data-state="done"] .idx-step-dot { background: rgb(var(--ui-ok) / 0.16); color: rgb(var(--ui-ok)); border-color: rgb(var(--ui-ok) / 0.4); }
.idx-step[data-state="failed"] .idx-step-dot { background: rgb(var(--ui-danger) / 0.16); color: rgb(var(--ui-danger)); border-color: rgb(var(--ui-danger) / 0.4); }
.idx-step[data-state="done"] .idx-step-text { color: rgb(var(--ui-fg)); }
.idx-step[data-state="idle"] .idx-step-text { color: rgb(var(--ui-muted)); }
.idx-note { margin: 0; color: rgb(var(--ui-muted)); font-size: var(--ui-text-sm); line-height: 1.5; }
.idx-foot-note { margin: 0; font-size: var(--ui-text-xs); }

/* ---------- metadados ---------- */
.meta { display: flex; flex-direction: column; gap: var(--ui-space-3); margin: 0; }
.meta > div { display: flex; align-items: center; justify-content: space-between; gap: var(--ui-space-3); }
.meta dt { color: rgb(var(--ui-muted)); font-size: var(--ui-text-xs); text-transform: uppercase; letter-spacing: .05em; }
.meta dd { margin: 0; font-weight: 600; text-align: right; }

/* ---------- atalhos ---------- */
.quick { display: flex; flex-direction: column; gap: var(--ui-space-2); }

/* ---------- modal de reindexação ---------- */
.rx { display: flex; flex-direction: column; gap: var(--ui-space-3); }
.rx-lead { margin: 0; line-height: 1.6; }
.rx-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--ui-space-2); }
.rx-list li { display: flex; align-items: center; justify-content: space-between; gap: var(--ui-space-3); font-size: var(--ui-text-sm); }
.rx-list li span { color: rgb(var(--ui-muted)); }
.rx-list li strong { font-family: var(--ui-font-display); }

/* ---------- responsivo ---------- */
@media (max-width: 1100px) {
  .reader { grid-template-columns: 1fr; }
  .toc { position: static; order: -1; }
}
@media (max-width: 980px) {
  .grid { grid-template-columns: 1fr; }
  .col-side { position: static; }
}
</style>
