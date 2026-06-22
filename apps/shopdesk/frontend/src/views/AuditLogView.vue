<template>
  <UiPageLayout
    eyebrow="Configurações · Segurança"
    title="Auditoria"
    subtitle="Trilha imutável de acessos e ações por usuário, loja e recurso: logins, mudanças de papel, reembolsos e ajustes de estoque."
    width="wide"
    :error="errorMessage"
    @retry="r.load"
  >
    <!-- Ações de cabeçalho -->
    <template #actions>
      <UiButton variant="ghost" :loading="r.loading.value" @click="r.refresh">
        <template #icon-left><span aria-hidden="true">↻</span></template>
        Atualizar
      </UiButton>
      <UiButton
        variant="subtle"
        :disabled="!filteredRows.length || r.loading.value"
        @click="exportCsv"
      >
        <template #icon-left><span aria-hidden="true">⬇</span></template>
        Exportar CSV
      </UiButton>
    </template>

    <!-- Filtros REAIS-mas-locais: busca, categoria, ator e período refinam SOMENTE
         a página já carregada. O backend de /v1/audit-logs honra apenas
         page/pageSize/sort/dir (crud-repo.list), então NÃO enviamos q/action/actor
         ao servidor — seria uma affordance morta. O rótulo deixa isso explícito. -->
    <template #filters>
      <UiFiltersPanel
        v-model="filters"
        :fields="filterFields"
        @apply="applyFilters"
        @clear="onClear"
      />
    </template>

    <!-- Aviso de imutabilidade: deixa claro que esta é uma trilha somente-leitura. -->
    <template #banner>
      <p class="aud-note" role="note">
        <span class="aud-note-icon" aria-hidden="true">🔒</span>
        Registros de auditoria são <strong>imutáveis</strong> — não podem ser
        editados nem removidos. Esta tela é somente de leitura.
      </p>
    </template>

    <!-- KPIs derivados das linhas reais exibidas. -->
    <div class="aud-kpis" role="group" aria-label="Indicadores da trilha de auditoria">
      <UiMetricCard
        label="Eventos"
        :value="kpis.total"
        tone="neutral"
        hint="Registros nesta visão"
        :loading="r.loading.value"
      />
      <UiMetricCard
        label="Atores distintos"
        :value="kpis.actors"
        tone="running"
        hint="Usuários com atividade"
        :loading="r.loading.value"
      />
      <UiMetricCard
        label="Eventos sensíveis"
        :value="kpis.sensitive"
        tone="warning"
        hint="Reembolsos, papéis e estoque"
        :loading="r.loading.value"
      />
      <UiMetricCard
        label="Lojas envolvidas"
        :value="kpis.tenants"
        tone="success"
        hint="Tenants com registros"
        :loading="r.loading.value"
      />
    </div>

    <!-- Chips de filtro rápido por categoria de ação. Contagens são desta página
         (não do total) — refinam a mesma página que o restante dos filtros. -->
    <div class="aud-chips-wrap">
      <p class="aud-chips-caption" id="aud-chips-caption">
        Categoria <span class="aud-chips-scope">(contagem nesta página)</span>
      </p>
      <div
        class="aud-chips"
        role="group"
        aria-labelledby="aud-chips-caption"
      >
        <button
          v-for="chip in categoryChips"
          :key="chip.value"
          type="button"
          class="aud-chip"
          :data-tone="chip.tone"
          :data-active="activeCategory === chip.value ? 'true' : null"
          :aria-pressed="activeCategory === chip.value ? 'true' : 'false'"
          @click="toggleCategory(chip.value)"
        >
          <span class="aud-chip-dot" aria-hidden="true" />
          <span class="aud-chip-label">{{ chip.label }}</span>
          <span class="aud-chip-count" :aria-label="chip.count + ' nesta página'">{{ chip.count }}</span>
        </button>
      </div>
    </div>

    <!-- Tabela da trilha de auditoria. -->
    <UiCard title="Eventos registrados" :subtitle="resultSummary">
      <template #actions>
        <UiStatusBadge
          v-if="hasLocalFilter"
          tone="running"
          :status="'Filtro refina só esta página'"
          :with-dot="true"
        />
      </template>

      <!-- Região viva: anuncia a leitores de tela a nova contagem ao aplicar
           filtro de busca/categoria/ator/período ou ao recarregar (item a11y). -->
      <p class="aud-sr-live" role="status" aria-live="polite">{{ liveSummary }}</p>

      <UiDataTable
        :columns="columns"
        :rows="filteredRows"
        row-key="id"
        density="comfortable"
        clickable-rows
        server-mode
        :loading="r.loading.value"
        :sort="r.sort.value"
        :page="r.page.value"
        :page-size="r.pageSize.value"
        :total="r.total.value"
        paginated
        :empty="emptyState"
        @row-click="openDetail"
        @update:sort="r.setSort"
        @update:page="r.setPage"
        @update:page-size="onPageSize"
      >
        <!-- Quando + relativo -->
        <template #cell-at="{ row }">
          <div class="aud-when">
            <span class="aud-when-abs">{{ format.formatDateTime(atOf(row)) }}</span>
            <span class="aud-when-rel">{{ relativeTime(atOf(row)) }}</span>
          </div>
        </template>

        <!-- Ator -->
        <template #cell-actor="{ row }">
          <div class="aud-actor">
            <span class="aud-actor-avatar" aria-hidden="true">{{ initials(actorOf(row)) }}</span>
            <span class="aud-actor-name">{{ actorOf(row) || 'Sistema' }}</span>
          </div>
        </template>

        <!-- Ação (badge por categoria) -->
        <template #cell-action="{ row }">
          <UiStatusBadge
            :tone="toneForAction(actionOf(row))"
            :status="actionOf(row)"
            :label="labelForAction(actionOf(row))"
          />
        </template>

        <!-- Recurso -->
        <template #cell-resource="{ row }">
          <span v-if="resourceOf(row)" class="ui-mono aud-resource">{{ resourceOf(row) }}</span>
          <span v-else class="ui-muted">—</span>
        </template>

        <!-- Loja -->
        <template #cell-tenant="{ row }">
          <span v-if="tenantOf(row)" class="aud-tenant">{{ tenantOf(row) }}</span>
          <span v-else class="ui-muted">—</span>
        </template>

        <!-- Ações por linha -->
        <template #cell-rowactions="{ row }">
          <div class="aud-rowactions" @click.stop>
            <UiButton variant="ghost" size="sm" @click="openDetail(row)">Detalhes</UiButton>
          </div>
        </template>

        <!-- Sem resultados após filtro -->
        <template #empty-action>
          <UiButton v-if="hasLocalFilter" variant="ghost" @click="onClear">
            Limpar filtros
          </UiButton>
          <UiButton v-else variant="ghost" @click="r.load">Recarregar</UiButton>
        </template>
      </UiDataTable>
    </UiCard>

    <!-- Modal: detalhe do evento (somente leitura). A linha da lista já traz o
         registro COMPLETO (list e get fazem o mesmo SELECT *), então exibimos a
         própria linha — sem round-trip redundante por clique. -->
    <UiModal v-model:open="detailOpen" :title="detailTitle" width="md">
      <dl v-if="detail" class="aud-detail">
        <div class="aud-detail-row">
          <dt>Ação</dt>
          <dd>
            <UiStatusBadge
              :tone="toneForAction(actionOf(detail))"
              :status="actionOf(detail)"
              :label="labelForAction(actionOf(detail))"
            />
          </dd>
        </div>
        <div class="aud-detail-row">
          <dt>Ator</dt>
          <dd>{{ actorOf(detail) || 'Sistema' }}</dd>
        </div>
        <div class="aud-detail-row">
          <dt>Recurso</dt>
          <dd class="ui-mono">{{ resourceOf(detail) || '—' }}</dd>
        </div>
        <div class="aud-detail-row">
          <dt>Loja</dt>
          <dd>{{ tenantOf(detail) || '—' }}</dd>
        </div>
        <div class="aud-detail-row">
          <dt>Quando</dt>
          <dd>{{ format.formatDateTime(atOf(detail)) }}</dd>
        </div>
        <div class="aud-detail-row">
          <dt>Endereço IP</dt>
          <dd class="ui-mono">{{ ipOf(detail) || '—' }}</dd>
        </div>
        <div v-if="detailMetaEntries.length" class="aud-detail-row aud-detail-row--meta">
          <dt>Detalhes</dt>
          <dd>
            <ul class="aud-meta">
              <li v-for="m in detailMetaEntries" :key="m.key">
                <span class="aud-meta-key">{{ m.key }}</span>
                <span class="aud-meta-val ui-mono">{{ m.value }}</span>
              </li>
            </ul>
          </dd>
        </div>
      </dl>
      <UiEmptyState
        v-else
        title="Sem detalhes"
        description="Não há um evento selecionado para exibir."
        icon="🗂️"
      />
      <template #footer>
        <UiButton variant="primary" @click="detailOpen = false">Fechar</UiButton>
      </template>
    </UiModal>
  </UiPageLayout>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import {
  UiPageLayout,
  UiCard,
  UiMetricCard,
  UiDataTable,
  UiFiltersPanel,
  UiStatusBadge,
  UiButton,
  UiModal,
  UiEmptyState,
  useResource,
  useToast,
  format,
} from '../ui/index.js';
import { auditLogs } from '../api.js';

// ---------------------------------------------------------------------------
// Recurso REAL: GET /v1/audit-logs (api/src/server.js:116). A chave da rota tem
// hífen, então `api.js` exporta o recurso como `auditLogs` (camelCase) —
// importado direto aqui, sem lookup por colchete. list() devolve o envelope
// { data, total, page, pageSize } (server-mode).
//
// CONTRATO HONESTO: o backend (crud-repo.list) honra SOMENTE page/pageSize/sort/
// dir — NÃO há WHERE por q/action/actor. Por isso esta tela NÃO envia esses
// params ao servidor (seriam affordances mortas): a busca, a categoria, o ator e
// o período refinam SOMENTE a página já carregada, com rótulo explícito. Quando o
// crud-repo passar a filtrar por categoria/ator (expandindo ACTION_CATEGORIES em
// termos ILIKE de `action`), promova esses campos a server-mode via r.setFilters.
// ---------------------------------------------------------------------------
const r = useResource(auditLogs, { pageSize: 25, sort: { key: 'at', dir: 'desc' } });
const toast = useToast();

const errorMessage = computed(() => {
  const e = r.error.value;
  if (!e) return null;
  return typeof e === 'string' ? e : e.message || 'Não foi possível carregar a trilha de auditoria.';
});

// ---------------------------------------------------------------------------
// Leitura tolerante: o backend pode serializar em snake_case ou camelCase.
// Não inventamos dados — só lemos o que existir.
// ---------------------------------------------------------------------------
const pick = (row, ...keys) => {
  for (const k of keys) {
    if (row && row[k] !== undefined && row[k] !== null && row[k] !== '') return row[k];
  }
  return null;
};
const actorOf = (row) => pick(row, 'actor', 'user', 'username', 'actor_id', 'actorId');
const actionOf = (row) => pick(row, 'action', 'event', 'type') || '';
const resourceOf = (row) => pick(row, 'resource', 'target', 'entity', 'resource_id', 'resourceId');
const tenantOf = (row) => pick(row, 'tenant', 'store', 'tenant_id', 'tenantId', 'loja');
const atOf = (row) => pick(row, 'at', 'createdAt', 'created_at', 'timestamp', 'ts', 'time');
const ipOf = (row) => pick(row, 'ip', 'ipAddress', 'ip_address', 'remoteAddr', 'remote_addr');

// ---------------------------------------------------------------------------
// Categorização de ações (genérica, por palavra-chave — sem mapa chumbado de
// domínio). Define o TOM do badge e a categoria dos chips de filtro rápido.
// ---------------------------------------------------------------------------
const ACTION_CATEGORIES = [
  { value: 'auth', label: 'Acesso', tone: 'running', words: ['login', 'logout', 'auth', 'session', 'sessao', 'sessão', 'acesso', 'sign'] },
  { value: 'role', label: 'Papéis', tone: 'warning', words: ['role', 'papel', 'permission', 'permissao', 'permissão', 'grant', 'revoke'] },
  { value: 'refund', label: 'Reembolsos', tone: 'error', words: ['refund', 'reembolso', 'estorno', 'chargeback'] },
  { value: 'stock', label: 'Estoque', tone: 'success', words: ['stock', 'estoque', 'inventory', 'inventario', 'inventário', 'adjust', 'ajuste'] },
];

function categoryOf(action) {
  const s = String(action || '').toLowerCase();
  for (const c of ACTION_CATEGORIES) {
    if (c.words.some((w) => s.includes(w))) return c.value;
  }
  return 'other';
}
function toneForAction(action) {
  const cat = ACTION_CATEGORIES.find((c) => c.value === categoryOf(action));
  return cat ? cat.tone : 'neutral';
}
const labelForAction = (action) => format.humanize(action) || '—';

// "Sensível" = qualquer ação fora de acesso (papéis, reembolsos, estoque).
const SENSITIVE = new Set(['role', 'refund', 'stock']);

// ---------------------------------------------------------------------------
// Colunas.
// ---------------------------------------------------------------------------
const columns = [
  { key: 'at', label: 'Quando', sortable: true },
  { key: 'actor', label: 'Ator', sortable: true },
  { key: 'action', label: 'Ação', sortable: true },
  { key: 'resource', label: 'Recurso' },
  { key: 'tenant', label: 'Loja', sortable: true },
  { key: 'rowactions', label: 'Ações', align: 'right' },
];

// ---------------------------------------------------------------------------
// Filtros — TODOS locais (refinam só a página carregada). O backend honra apenas
// page/pageSize/sort/dir, então não enviamos q/action/actor/from/to ao servidor:
// `filteredRows` aplica busca, categoria, ator e período sobre r.items.value.
// `@apply`/`@clear` do painel só mexem no estado reativo `filters` — o computed
// reage sozinho (sem round-trip). A paginação/ordenação continuam server-mode.
// ---------------------------------------------------------------------------
const ACTION_OPTIONS = ACTION_CATEGORIES.map((c) => ({ value: c.value, label: c.label }));
const filterFields = [
  { key: 'q', label: 'Buscar', type: 'text', placeholder: 'ator, recurso ou loja' },
  { key: 'action', label: 'Categoria', type: 'select', options: ACTION_OPTIONS },
  { key: 'actor', label: 'Ator', type: 'text', placeholder: 'usuário' },
  { key: 'from', label: 'De', type: 'date' },
  { key: 'to', label: 'Até', type: 'date' },
];
const blankFilters = () => ({ q: '', action: '', actor: '', from: '', to: '' });
const filters = ref(blankFilters());

// Aplicar/limpar são puramente locais: o v-model já mantém `filters` atualizado;
// `@apply` só confirma a intenção e `@clear` reseta. Nada vai ao servidor — o
// computed `filteredRows` recalcula. (Mantidos como handlers para o painel.)
function applyFilters() {
  /* no-op: filtros são locais; o computed reage à mudança de `filters` */
}
function onClear() {
  filters.value = blankFilters();
}
function onPageSize(size) {
  r.pageSize.value = size;
  r.setPage(1);
}

// ---------------------------------------------------------------------------
// Chips de categoria: sincronizados com o filtro LOCAL `action`. As contagens
// vêm das linhas REAIS da página exibida (rotuladas "nesta página" na UI, pois
// não há agregação server-side — seriam parciais por design).
// Contam sobre `pageRows` (a página inteira, antes do recorte por categoria/
// busca/ator), para que cada chip mostre quantos da página caem nela mesmo
// quando outro filtro está ativo.
// ---------------------------------------------------------------------------
const activeCategory = computed(() => filters.value.action || '');
const categoryChips = computed(() => {
  const rows = pageRows.value;
  return ACTION_CATEGORIES.map((c) => ({
    value: c.value,
    label: c.label,
    tone: c.tone,
    count: rows.filter((row) => categoryOf(actionOf(row)) === c.value).length,
  }));
});
function toggleCategory(value) {
  filters.value.action = activeCategory.value === value ? '' : value;
}

// ---------------------------------------------------------------------------
// Refino LOCAL completo, sobre a página carregada (r.items): busca livre,
// categoria, ator e intervalo de datas. Tudo no cliente porque o backend não
// filtra por esses campos (ver contrato acima). `pageRows` é a página crua;
// `filteredRows` é o resultado após todos os filtros locais.
// ---------------------------------------------------------------------------
const pageRows = computed(() => r.items.value);
// Qualquer filtro local ativo (busca/categoria/ator/período) → refina só a página.
const hasLocalFilter = computed(
  () => !!(filters.value.q || filters.value.action || filters.value.actor || filters.value.from || filters.value.to),
);
const filteredRows = computed(() => {
  const f = filters.value;
  const q = String(f.q || '').trim().toLowerCase();
  const category = f.action || '';
  const actor = String(f.actor || '').trim().toLowerCase();
  const fromTs = f.from ? new Date(f.from + 'T00:00:00').getTime() : null;
  const toTs = f.to ? new Date(f.to + 'T23:59:59').getTime() : null;
  if (!q && !category && !actor && fromTs == null && toTs == null) return pageRows.value;
  return pageRows.value.filter((row) => {
    // Busca livre: ator, recurso ou loja.
    if (q) {
      const hay = [actorOf(row), resourceOf(row), tenantOf(row), actionOf(row)]
        .map((v) => String(v || '').toLowerCase())
        .join(' ');
      if (!hay.includes(q)) return false;
    }
    // Categoria (mapeada da ação por palavra-chave).
    if (category && categoryOf(actionOf(row)) !== category) return false;
    // Ator (substring, tolerante a maiúsculas).
    if (actor && !String(actorOf(row) || '').toLowerCase().includes(actor)) return false;
    // Intervalo de datas.
    if (fromTs != null || toTs != null) {
      const raw = atOf(row);
      const ts = raw ? new Date(raw).getTime() : NaN;
      if (isNaN(ts)) return false;
      if (fromTs != null && ts < fromTs) return false;
      if (toTs != null && ts > toTs) return false;
    }
    return true;
  });
});

// ---------------------------------------------------------------------------
// KPIs derivados das linhas reais exibidas.
// ---------------------------------------------------------------------------
const kpis = computed(() => {
  const rows = filteredRows.value;
  const actors = new Set();
  const tenants = new Set();
  let sensitive = 0;
  for (const row of rows) {
    const a = actorOf(row);
    if (a) actors.add(String(a));
    const t = tenantOf(row);
    if (t) tenants.add(String(t));
    if (SENSITIVE.has(categoryOf(actionOf(row)))) sensitive += 1;
  }
  return { total: rows.length, actors: actors.size, tenants: tenants.size, sensitive };
});

const resultSummary = computed(() => {
  if (r.loading.value) return 'Carregando…';
  const shown = filteredRows.value.length;
  if (!r.total.value) return 'Nenhum evento registrado';
  if (hasLocalFilter.value) return shown + ' de ' + pageRows.value.length + ' nesta página (os filtros refinam só a página carregada)';
  return shown + ' nesta página · ' + r.total.value + ' no total';
});

// Anúncio para leitores de tela: enquanto carrega, silencia (o estado de loading
// já é exposto pela tabela); pronto, anuncia a contagem resultante do filtro.
const liveSummary = computed(() => {
  if (r.loading.value) return '';
  const shown = filteredRows.value.length;
  if (!r.total.value) return 'Nenhum evento de auditoria registrado.';
  const base = shown + (shown === 1 ? ' evento exibido' : ' eventos exibidos');
  if (hasLocalFilter.value) {
    return base + ' de ' + pageRows.value.length + ' na página, após os filtros (refinam só esta página).';
  }
  return base + ' nesta página, de ' + r.total.value + ' no total.';
});

const emptyState = computed(() => {
  if (hasLocalFilter.value) {
    return {
      title: 'Nenhum evento nos filtros',
      description: 'Os filtros (busca, categoria, ator e período) refinam apenas a página já carregada. Ajuste-os, limpe-os ou avance as páginas para ver outros eventos.',
      icon: '🔍',
    };
  }
  return {
    title: 'Nenhum evento de auditoria',
    description: 'Os registros de acesso e ações aparecerão aqui conforme a loja for utilizada.',
    icon: '🗂️',
  };
});

// ---------------------------------------------------------------------------
// Apresentação: iniciais do ator, tempo relativo.
// ---------------------------------------------------------------------------
function initials(name) {
  const s = String(name || '').trim();
  if (!s) return '·';
  const parts = s.split(/[\s@._-]+/).filter(Boolean);
  if (!parts.length) return s.slice(0, 2).toUpperCase();
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

function relativeTime(value) {
  if (!value) return '';
  const ts = new Date(value).getTime();
  if (isNaN(ts)) return '';
  const diff = Date.now() - ts;
  if (diff < 0) return 'agora';
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return 'há instantes';
  const min = Math.floor(sec / 60);
  if (min < 60) return 'há ' + min + ' min';
  const hr = Math.floor(min / 60);
  if (hr < 24) return 'há ' + hr + ' h';
  const day = Math.floor(hr / 24);
  if (day < 30) return 'há ' + day + (day === 1 ? ' dia' : ' dias');
  const mon = Math.floor(day / 30);
  if (mon < 12) return 'há ' + mon + (mon === 1 ? ' mês' : ' meses');
  const yr = Math.floor(mon / 12);
  return 'há ' + yr + (yr === 1 ? ' ano' : ' anos');
}

// ---------------------------------------------------------------------------
// Detalhe (somente leitura). A linha da lista JÁ traz o registro completo:
// list() e get() executam o mesmo SELECT * na mesma tabela (crud-repo), logo o
// GET /v1/audit-logs/:id devolveria exatamente a mesma linha. Por isso exibimos
// a própria `row` — sem round-trip redundante por clique e sem estado de
// loading/erro para uma chamada que não acrescenta dados. Se um dia o list()
// passar a devolver projeção reduzida, reintroduza o get só nesse caso.
// ---------------------------------------------------------------------------
const detailOpen = ref(false);
const detail = ref(null);

const detailTitle = computed(() =>
  detail.value ? 'Evento · ' + labelForAction(actionOf(detail.value)) : 'Evento de auditoria',
);

// Campos conhecidos já exibidos em linhas dedicadas — o resto vira "Detalhes".
const KNOWN_KEYS = new Set([
  'id', 'actor', 'user', 'username', 'actor_id', 'actorId',
  'action', 'event', 'type',
  'resource', 'target', 'entity', 'resource_id', 'resourceId',
  'tenant', 'store', 'tenant_id', 'tenantId', 'loja',
  'at', 'createdAt', 'created_at', 'timestamp', 'ts', 'time',
  'ip', 'ipAddress', 'ip_address', 'remoteAddr', 'remote_addr',
]);
const detailMetaEntries = computed(() => {
  const d = detail.value;
  if (!d || typeof d !== 'object') return [];
  const out = [];
  for (const [key, value] of Object.entries(d)) {
    if (KNOWN_KEYS.has(key)) continue;
    if (value === null || value === undefined || value === '') continue;
    const v = typeof value === 'object' ? JSON.stringify(value) : String(value);
    out.push({ key: format.humanize(key), value: v });
  }
  return out;
});

function openDetail(row) {
  detail.value = row; // a linha já é o registro completo (mesmo SELECT * do get)
  detailOpen.value = true;
}

// ---------------------------------------------------------------------------
// Exportar CSV (cliente, sobre as linhas filtradas; CSP-safe via Blob).
// ---------------------------------------------------------------------------
function csvCell(v) {
  const s = v == null ? '' : String(v);
  return /[",\n;]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
function exportCsv() {
  const rows = filteredRows.value;
  if (!rows.length) {
    toast.warning('Nada para exportar.');
    return;
  }
  const head = ['Quando', 'Ator', 'Ação', 'Recurso', 'Loja', 'IP'];
  const lines = [head.join(';')];
  for (const o of rows) {
    lines.push(
      [
        csvCell(atOf(o)),
        csvCell(actorOf(o)),
        csvCell(labelForAction(actionOf(o))),
        csvCell(resourceOf(o)),
        csvCell(tenantOf(o)),
        csvCell(ipOf(o)),
      ].join(';'),
    );
  }
  try {
    const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'auditoria-' + new Date().toISOString().slice(0, 10) + '.csv';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast.success('CSV exportado (' + rows.length + ' eventos).');
  } catch (e) {
    toast.error('Falha ao exportar CSV', { detail: e.message });
  }
}

onMounted(r.load);
</script>

<style scoped>
/* Região viva apenas para leitores de tela (anúncio de contagem após filtro).
   Off-screen sem display:none, para que o aria-live continue sendo lido. */
.aud-sr-live {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: -1px;
  padding: 0;
  overflow: hidden;
  clip: rect(0 0 0 0);
  clip-path: inset(50%);
  white-space: nowrap;
  border: 0;
}

/* Aviso de imutabilidade */
.aud-note {
  display: flex;
  align-items: center;
  gap: var(--ui-space-2);
  margin: 0;
  padding: var(--ui-space-3) var(--ui-space-4);
  border: 1px solid rgb(var(--ui-border));
  border-left: 3px solid rgb(var(--ui-accent));
  border-radius: var(--ui-radius-md);
  background: rgb(var(--ui-surface));
  color: rgb(var(--ui-muted));
  font-size: var(--ui-text-sm);
}
.aud-note strong {
  color: rgb(var(--ui-fg));
}
.aud-note-icon {
  font-size: var(--ui-text-md);
}

/* KPIs */
.aud-kpis {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: var(--ui-space-4);
}

/* FilterChips */
.aud-chips-wrap {
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-2);
}
.aud-chips-caption {
  margin: 0;
  font-size: var(--ui-text-sm);
  font-weight: 600;
  color: rgb(var(--ui-fg));
}
.aud-chips-scope {
  font-weight: 400;
  color: rgb(var(--ui-muted));
}
.aud-chips {
  display: flex;
  gap: var(--ui-space-2);
  flex-wrap: wrap;
}
.aud-chip {
  display: inline-flex;
  align-items: center;
  gap: var(--ui-space-2);
  font: inherit;
  font-size: var(--ui-text-sm);
  font-weight: 600;
  padding: 6px 12px;
  border-radius: var(--ui-radius-pill);
  border: 1px solid rgb(var(--ui-border-strong));
  background: rgb(var(--ui-surface));
  color: rgb(var(--ui-fg));
  cursor: pointer;
  transition: background .15s ease, border-color .15s ease;
}
.aud-chip:hover {
  background: rgb(var(--ui-surface-2));
}
.aud-chip[data-active="true"] {
  border-color: rgb(var(--ui-accent));
  background: rgb(var(--ui-accent) / 0.12);
  color: rgb(var(--ui-accent-strong));
}
.aud-chip-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: rgb(var(--ui-muted));
}
.aud-chip[data-tone="success"] .aud-chip-dot { background: rgb(var(--ui-ok)); }
.aud-chip[data-tone="running"] .aud-chip-dot { background: rgb(var(--ui-accent)); }
.aud-chip[data-tone="warning"] .aud-chip-dot { background: rgb(var(--ui-warn)); }
.aud-chip[data-tone="error"] .aud-chip-dot { background: rgb(var(--ui-danger)); }
.aud-chip-count {
  font-variant-numeric: tabular-nums;
  font-size: var(--ui-text-xs);
  color: rgb(var(--ui-muted));
  background: rgb(var(--ui-surface-2));
  border-radius: var(--ui-radius-pill);
  padding: 0 7px;
  min-width: 20px;
  text-align: center;
}
.aud-chip[data-active="true"] .aud-chip-count {
  color: rgb(var(--ui-accent-strong));
  background: rgb(var(--ui-accent) / 0.16);
}

/* Células */
.aud-when {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.aud-when-abs {
  font-variant-numeric: tabular-nums;
}
.aud-when-rel {
  font-size: var(--ui-text-xs);
  color: rgb(var(--ui-muted));
}
.aud-actor {
  display: inline-flex;
  align-items: center;
  gap: var(--ui-space-2);
}
.aud-actor-avatar {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border-radius: 50%;
  background: rgb(var(--ui-accent) / 0.14);
  color: rgb(var(--ui-accent-strong));
  font-size: var(--ui-text-xs);
  font-weight: 700;
  flex: none;
}
.aud-actor-name {
  font-weight: 600;
}
.aud-resource {
  font-size: var(--ui-text-sm);
}
.aud-tenant {
  font-size: var(--ui-text-sm);
}
.aud-rowactions {
  display: inline-flex;
  gap: var(--ui-space-2);
  justify-content: flex-end;
  align-items: center;
}

/* Detalhe */
.aud-detail {
  display: grid;
  gap: var(--ui-space-1);
  margin: 0;
}
.aud-detail-row {
  display: grid;
  grid-template-columns: 130px 1fr;
  gap: var(--ui-space-3);
  align-items: center;
  padding: var(--ui-space-2) 0;
  border-bottom: 1px solid rgb(var(--ui-border));
}
.aud-detail-row--meta {
  align-items: start;
}
.aud-detail-row:last-child {
  border-bottom: none;
}
.aud-detail dt {
  color: rgb(var(--ui-muted));
  font-size: var(--ui-text-sm);
  font-weight: 600;
}
.aud-detail dd {
  margin: 0;
}
.aud-meta {
  display: grid;
  gap: var(--ui-space-1);
  margin: 0;
  padding: 0;
  list-style: none;
}
.aud-meta li {
  display: flex;
  justify-content: space-between;
  gap: var(--ui-space-3);
  font-size: var(--ui-text-sm);
}
.aud-meta-key {
  color: rgb(var(--ui-muted));
}
.aud-meta-val {
  text-align: right;
  word-break: break-word;
}

@media (max-width: 980px) {
  .aud-kpis {
    grid-template-columns: repeat(2, 1fr);
  }
}
@media (max-width: 560px) {
  .aud-kpis {
    grid-template-columns: 1fr;
  }
  .aud-detail-row {
    grid-template-columns: 1fr;
    gap: 2px;
  }
  .aud-meta li {
    flex-direction: column;
    gap: 0;
  }
  .aud-meta-val {
    text-align: left;
  }
}
</style>
