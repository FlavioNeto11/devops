<template>
  <UiPageLayout
    eyebrow="Atendimento"
    title="Solicitantes"
    subtitle="Contatos que abrem chamados no service desk. Busque por nome, e-mail ou organização, marque VIPs e acompanhe o volume de tickets."
    width="wide"
    :error="r.error.value"
    @retry="reload"
  >
    <!-- Ações de cabeçalho: atualizar + novo solicitante (rota de domínio /customers/new) -->
    <template #actions>
      <UiButton variant="ghost" :loading="r.loading.value" @click="reload">
        <template #icon-left><span class="cust-ico" aria-hidden="true">↻</span></template>
        Atualizar
      </UiButton>
      <UiButton to="/customers/new">
        <template #icon-left><span class="cust-ico" aria-hidden="true">＋</span></template>
        Novo solicitante
      </UiButton>
    </template>

    <!-- KPIs da base de solicitantes (total vem do servidor; os derivados são da página) -->
    <section class="cust-kpis" aria-label="Resumo dos solicitantes">
      <UiMetricCard
        label="Solicitantes"
        :value="kpis.total"
        :loading="r.loading.value"
        tone="primary"
        hint="Contatos cadastrados"
        clickable
        @click="clearAll"
      />
      <UiMetricCard
        label="VIPs"
        :value="kpis.vip"
        :loading="r.loading.value"
        tone="warning"
        :hint="pageScopedHint('Atendimento prioritário')"
        clickable
        @click="quickFilter('vip', 'true')"
      />
      <UiMetricCard
        label="Ativos"
        :value="kpis.active"
        :loading="r.loading.value"
        tone="success"
        :hint="pageScopedHint('Habilitados a abrir chamados')"
        clickable
        @click="quickFilter('status', 'active')"
      />
      <UiMetricCard
        label="Chamados vinculados"
        :value="kpis.tickets"
        :loading="r.loading.value"
        :hint="pageScopedHint('Soma de tickets')"
      />
    </section>

    <!-- Filtros estruturados (busca + situação + prioridade) -->
    <template #filters>
      <UiFiltersPanel
        v-model="filters"
        :fields="filterFields"
        @apply="applyFilters"
        @clear="applyFilters"
      />
    </template>

    <!-- Atalhos de visão (segmentos): refletem o estado atual dos filtros -->
    <div class="cust-segments" role="group" aria-label="Visões rápidas">
      <button
        v-for="seg in segments"
        :key="seg.id"
        type="button"
        class="cust-seg"
        :data-active="isSegmentActive(seg) ? 'true' : null"
        :aria-pressed="isSegmentActive(seg) ? 'true' : 'false'"
        @click="applySegment(seg)"
      >
        {{ seg.label }}
      </button>
    </div>

    <UiCard title="Lista de solicitantes" :subtitle="resultSummary">
      <template #actions>
        <UiButton variant="subtle" size="sm" @click="openCreate">Adicionar contato</UiButton>
      </template>

      <!-- Barra de seleção em lote (marcar/desmarcar VIP em vários contatos) -->
      <div v-if="selected.length" class="cust-bulk" role="region" aria-label="Ações em lote">
        <span class="cust-bulk-count">{{ selected.length }} selecionado(s)</span>
        <div class="cust-bulk-actions">
          <UiButton variant="subtle" size="sm" :loading="bulkBusy" @click="bulkVip(true)">
            <template #icon-left><span class="cust-ico" aria-hidden="true">★</span></template>
            Marcar VIP
          </UiButton>
          <UiButton variant="ghost" size="sm" :loading="bulkBusy" @click="bulkVip(false)">
            Remover VIP
          </UiButton>
          <UiButton variant="ghost" size="sm" @click="selected = []">Limpar seleção</UiButton>
        </div>
      </div>

      <UiDataTable
        :columns="columns"
        :rows="r.items.value"
        :loading="r.loading.value"
        row-key="id"
        density="comfortable"
        selectable
        v-model:selected="selected"
        clickable-rows
        server-mode
        :sort="r.sort.value"
        :page="r.page.value"
        :page-size="r.pageSize.value"
        :total="r.total.value"
        paginated
        :empty="emptyState"
        @row-click="open"
        @update:sort="r.setSort"
        @update:page="r.setPage"
        @update:page-size="onPageSize"
      >
        <!-- Identidade: avatar com iniciais + nome (+ VIP) + organização -->
        <template #cell-name="{ row }">
          <div class="cust-id">
            <span class="cust-avatar" :data-vip="row.vip ? 'true' : null" aria-hidden="true">
              {{ initials(row.name) }}
            </span>
            <span class="cust-id-text">
              <span class="cust-id-name">
                {{ row.name || 'Sem nome' }}
                <UiStatusBadge
                  v-if="row.vip"
                  label="VIP"
                  tone="warning"
                  size="sm"
                  :with-dot="false"
                  class="cust-vip-badge"
                />
              </span>
              <span class="cust-id-sub">{{ row.organization || 'Sem organização' }}</span>
            </span>
          </div>
        </template>

        <!-- Contato: e-mail + telefone -->
        <template #cell-email="{ row }">
          <span class="cust-contact">
            <span class="cust-contact-line">{{ row.email || '—' }}</span>
            <span v-if="row.phone" class="cust-contact-sub">{{ row.phone }}</span>
          </span>
        </template>

        <!-- VIP: estrela acionável (alterna prioridade sem sair da lista) -->
        <template #cell-vip="{ row }">
          <button
            type="button"
            class="cust-star"
            :data-on="row.vip ? 'true' : null"
            :aria-pressed="row.vip ? 'true' : 'false'"
            :aria-label="(row.vip ? 'Remover prioridade VIP de ' : 'Marcar como VIP ') + (row.name || row.email || 'solicitante')"
            :title="row.vip ? 'Solicitante VIP — clique para remover' : 'Marcar como VIP'"
            @click.stop="toggleVip(row)"
          >
            {{ row.vip ? '★' : '☆' }}
          </button>
        </template>

        <!-- Situação: badge resolvido por palavra (active/inactive) -->
        <template #cell-status="{ value }">
          <UiStatusBadge :status="value || 'inactive'" :label="statusLabel(value)" />
        </template>

        <!-- Chamados vinculados: pílula numérica (atenua quando zero) -->
        <template #cell-tickets="{ row }">
          <span class="cust-tickets" :data-empty="ticketCount(row) === 0 ? 'true' : null">
            {{ ticketCount(row) }}
          </span>
        </template>

        <!-- Criado em -->
        <template #cell-created_at="{ value }">
          <span class="cust-muted">{{ format.formatDate(value) }}</span>
        </template>

        <!-- Ações por linha (ver detalhe + alternar situação com confirmação) -->
        <template #cell-actions="{ row }">
          <div class="cust-actions" @click.stop>
            <UiButton variant="ghost" size="sm" @click="open(row)">Ver</UiButton>
            <UiButton v-if="isActive(row)" variant="ghost" size="sm" @click="deactivate(row)">
              Inativar
            </UiButton>
            <UiButton v-else variant="subtle" size="sm" @click="reactivate(row)">Reativar</UiButton>
          </div>
        </template>

        <!-- Estado vazio: CTA para o cadastro (rota de domínio) -->
        <template #empty-action>
          <UiButton v-if="hasActiveFilters" variant="ghost" @click="clearAll">Limpar filtros</UiButton>
          <UiButton v-else to="/customers/new">Cadastrar solicitante</UiButton>
        </template>
      </UiDataTable>
    </UiCard>

    <template #footer>
      <span>{{ footerSummary }}</span>
    </template>

    <!-- Cadastro rápido sem sair da lista -->
    <UiModal v-model:open="createOpen" title="Novo solicitante" width="md" @close="onModalClose">
      <form class="cust-form" novalidate @submit.prevent="submitCreate">
        <UiFormSection title="Identificação" description="Quem abrirá os chamados." :columns="2">
          <UiFormField label="Nome" required :error="f.errors.name">
            <template #default="{ id, describedBy }">
              <input
                :id="id"
                :value="f.values.name"
                type="text"
                autocomplete="name"
                placeholder="Ex.: Maria Souza"
                :aria-describedby="describedBy"
                @input="f.setField('name', $event.target.value)"
              />
            </template>
          </UiFormField>

          <UiFormField label="Organização" :error="f.errors.organization">
            <template #default="{ id, describedBy }">
              <input
                :id="id"
                :value="f.values.organization"
                type="text"
                autocomplete="organization"
                placeholder="Ex.: Acme Ltda."
                :aria-describedby="describedBy"
                @input="f.setField('organization', $event.target.value)"
              />
            </template>
          </UiFormField>
        </UiFormSection>

        <UiFormSection title="Contato" description="Como falar com o solicitante." :columns="2">
          <UiFormField label="E-mail" required :error="f.errors.email">
            <template #default="{ id, describedBy }">
              <input
                :id="id"
                :value="f.values.email"
                type="email"
                autocomplete="email"
                placeholder="nome@empresa.com"
                :aria-describedby="describedBy"
                @input="f.setField('email', $event.target.value)"
              />
            </template>
          </UiFormField>

          <UiFormField label="Telefone" :error="f.errors.phone">
            <template #default="{ id, describedBy }">
              <input
                :id="id"
                :value="f.values.phone"
                type="tel"
                autocomplete="tel"
                placeholder="(11) 90000-0000"
                :aria-describedby="describedBy"
                @input="f.setField('phone', $event.target.value)"
              />
            </template>
          </UiFormField>
        </UiFormSection>

        <UiFormSection title="Atendimento" :columns="2">
          <UiFormField label="Situação">
            <template #default="{ id }">
              <select
                :id="id"
                :value="f.values.status"
                @change="f.setField('status', $event.target.value)"
              >
                <option value="active">Ativo</option>
                <option value="inactive">Inativo</option>
              </select>
            </template>
          </UiFormField>

          <UiFormField label="Prioridade" hint="VIPs entram na frente da fila.">
            <template #default="{ id }">
              <label class="cust-check">
                <input
                  :id="id"
                  type="checkbox"
                  :checked="f.values.vip"
                  @change="f.setField('vip', $event.target.checked)"
                />
                <span>Marcar como VIP</span>
              </label>
            </template>
          </UiFormField>
        </UiFormSection>

        <UiFormSection title="Observações">
          <UiFormField label="Notas internas" :error="f.errors.notes">
            <template #default="{ id, describedBy }">
              <textarea
                :id="id"
                :value="f.values.notes"
                rows="3"
                placeholder="Contexto, restrições de horário, contato alternativo…"
                :aria-describedby="describedBy"
                @input="f.setField('notes', $event.target.value)"
              ></textarea>
            </template>
          </UiFormField>
        </UiFormSection>
      </form>

      <template #footer>
        <UiButton variant="ghost" :disabled="f.submitting.value" @click="createOpen = false">
          Cancelar
        </UiButton>
        <UiButton :loading="f.submitting.value" @click="submitCreate">Salvar solicitante</UiButton>
      </template>
    </UiModal>
  </UiPageLayout>
</template>

<script setup>
import { ref, computed } from 'vue';
import { useRouter } from 'vue-router';
import {
  UiPageLayout,
  UiCard,
  UiMetricCard,
  UiDataTable,
  UiButton,
  UiFiltersPanel,
  UiStatusBadge,
  UiModal,
  UiFormSection,
  UiFormField,
  useResource,
  useForm,
  useToast,
  useConfirm,
  validators,
  format,
} from '../ui/index.js';
import { customers } from '../api.js';

const router = useRouter();
const toast = useToast();
const confirm = useConfirm();

// Recurso em server-mode (paginação/ordenação/filtros vão para /v1/customers).
const r = useResource(customers, { pageSize: 25, sort: { key: 'name', dir: 'asc' } });

// ---- domínio: situação (rótulos sempre presentes; cor nunca é o único sinal) ----
const STATUS_OPTIONS = [
  { value: 'active', label: 'Ativo' },
  { value: 'inactive', label: 'Inativo' },
];
const statusLabelMap = Object.fromEntries(STATUS_OPTIONS.map((o) => [o.value, o.label]));
const statusLabel = (v) => statusLabelMap[v] || format.humanize(v || 'inactive');

// ---- colunas da tabela ----------------------------------------------------
const columns = [
  { key: 'name', label: 'Solicitante', sortable: true },
  { key: 'email', label: 'Contato' },
  { key: 'vip', label: 'VIP', align: 'center' },
  { key: 'status', label: 'Situação', sortable: true },
  { key: 'tickets', label: 'Chamados', align: 'right', sortable: true },
  { key: 'created_at', label: 'Criado em', sortable: true },
  { key: 'actions', label: '', align: 'right' },
];

// ---- filtros / busca ------------------------------------------------------
const filterFields = [
  { key: 'q', label: 'Buscar', type: 'text', placeholder: 'nome, e-mail ou organização' },
  { key: 'status', label: 'Situação', type: 'select', options: STATUS_OPTIONS },
  {
    key: 'vip',
    label: 'Prioridade',
    type: 'select',
    options: [
      { value: 'true', label: 'Somente VIP' },
      { value: 'false', label: 'Sem VIP' },
    ],
  },
];
const filters = ref({ q: '', status: '', vip: '' });
const selected = ref([]);
const bulkBusy = ref(false);

const hasActiveFilters = computed(() =>
  Object.values(filters.value).some((v) => v !== '' && v != null)
);

function applyFilters() {
  selected.value = [];
  r.setFilters({ ...filters.value });
}
function quickFilter(key, value) {
  filters.value = { ...filters.value, [key]: value };
  applyFilters();
}
function clearAll() {
  filters.value = { q: '', status: '', vip: '' };
  applyFilters();
}
function onPageSize(size) {
  r.pageSize.value = size;
  r.setPage(1);
}
async function reload() {
  selected.value = [];
  try {
    await r.load();
  } catch (e) {
    toast.error('Não foi possível atualizar a lista', { detail: e && e.message });
  }
}

// ---- segmentos (visões rápidas) -------------------------------------------
const segments = [
  { id: 'all', label: 'Todos', filters: { q: '', status: '', vip: '' } },
  { id: 'active', label: 'Ativos', filters: { q: '', status: 'active', vip: '' } },
  { id: 'vip', label: 'VIPs', filters: { q: '', status: '', vip: 'true' } },
  { id: 'inactive', label: 'Inativos', filters: { q: '', status: 'inactive', vip: '' } },
];
function isSegmentActive(seg) {
  return (
    (filters.value.status || '') === seg.filters.status &&
    (filters.value.vip || '') === seg.filters.vip
  );
}
function applySegment(seg) {
  // preserva o termo de busca digitado; troca apenas situação/prioridade.
  filters.value = { ...filters.value, status: seg.filters.status, vip: seg.filters.vip };
  applyFilters();
}

// ---- helpers de leitura de linha ------------------------------------------
const ticketCount = (row) =>
  Number(row.tickets ?? row.ticket_count ?? row.tickets_count ?? 0) || 0;
const isActive = (row) => String(row.status ?? 'active').toLowerCase() !== 'inactive';

function initials(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// ---- KPIs (total do servidor; demais derivados da página carregada) -------
const kpis = computed(() => {
  const rows = r.items.value || [];
  return {
    total: r.total.value || rows.length,
    vip: rows.filter((x) => !!x.vip).length,
    active: rows.filter(isActive).length,
    tickets: rows.reduce((sum, x) => sum + ticketCount(x), 0),
  };
});

// true quando há mais solicitantes do que os exibidos nesta página.
const isPaged = computed(() => (r.total.value || 0) > (r.items.value || []).length);
const pageScopedHint = (base) => (isPaged.value ? base + ' · nesta página' : base);

const resultSummary = computed(() => {
  const n = r.total.value || (r.items.value || []).length;
  if (r.loading.value) return 'Carregando…';
  if (!n) return 'Nenhum solicitante para os filtros atuais.';
  return n === 1 ? '1 solicitante encontrado' : n + ' solicitantes encontrados';
});

const footerSummary = computed(() => {
  const t = r.total.value || 0;
  if (r.loading.value) return 'Carregando solicitantes…';
  if (!t) return 'Nenhum solicitante cadastrado.';
  const sortKey = r.sort.value ? labelForKey(r.sort.value.key) : 'nome';
  return t + ' solicitante(s) · ordenado por ' + sortKey;
});
function labelForKey(key) {
  const c = columns.find((x) => x.key === key);
  return c && c.label ? c.label.toLowerCase() : key;
}

const emptyState = computed(() =>
  hasActiveFilters.value
    ? {
        title: 'Nenhum resultado',
        description: 'Ajuste a busca ou os filtros para encontrar solicitantes.',
        icon: 'search',
      }
    : {
        title: 'Sem solicitantes ainda',
        description: 'Cadastre o primeiro contato para começar a registrar chamados.',
        icon: 'users',
      }
);

// ---- navegação (rota de domínio) ------------------------------------------
const open = (row) => router.push('/customers/' + row.id);

// ---- alternar VIP por linha (ação leve, sem confirmação) ------------------
async function toggleVip(row) {
  const next = !row.vip;
  try {
    await r.update(row.id, { ...row, vip: next });
    row.vip = next; // refletir na hora; o reload reconcilia com o servidor
    toast.success(next ? 'Marcado como VIP' : 'Prioridade VIP removida', {
      detail: row.name || row.email,
    });
  } catch (e) {
    toast.error('Não foi possível atualizar a prioridade', {
      detail: (e && e.message) || 'Tente novamente.',
      code: e && e.status ? 'HTTP ' + e.status : '',
    });
  }
}

// ---- VIP em lote (sobre a seleção) ----------------------------------------
async function bulkVip(target) {
  const rows = selected.value.slice();
  if (!rows.length) return;
  bulkBusy.value = true;
  let done = 0;
  let failed = 0;
  for (const row of rows) {
    if (!!row.vip === target) {
      done += 1; // já está no alvo
      continue;
    }
    try {
      await r.update(row.id, { ...row, vip: target });
      done += 1;
    } catch {
      failed += 1;
    }
  }
  bulkBusy.value = false;
  selected.value = [];
  if (done) toast.success(done + ' solicitante(s) atualizado(s)');
  if (failed) toast.error(failed + ' solicitante(s) não puderam ser atualizados');
  await r.load();
}

// ---- mudança de situação (ação sensível → confirmação) --------------------
async function deactivate(row) {
  const ok = await confirm({
    title: 'Inativar solicitante',
    message:
      'Inativar "' +
      (row.name || row.email) +
      '"? Ele deixará de abrir novos chamados, mas o histórico é preservado.',
    confirmLabel: 'Inativar',
    danger: true,
  });
  if (!ok) return;
  try {
    await r.update(row.id, { ...row, status: 'inactive' });
    toast.success('Solicitante inativado', { detail: row.name || row.email });
    r.refresh();
  } catch (e) {
    toast.error('Falha ao inativar', { detail: (e && e.message) || 'Tente novamente.' });
  }
}

async function reactivate(row) {
  try {
    await r.update(row.id, { ...row, status: 'active' });
    toast.success('Solicitante reativado', { detail: row.name || row.email });
    r.refresh();
  } catch (e) {
    toast.error('Falha ao reativar', { detail: (e && e.message) || 'Tente novamente.' });
  }
}

// ---- cadastro rápido (modal) ----------------------------------------------
const createOpen = ref(false);
const f = useForm({
  initial: { name: '', email: '', phone: '', organization: '', vip: false, status: 'active', notes: '' },
  rules: {
    name: [validators.required('Informe o nome do solicitante'), validators.minLen(2)],
    email: [validators.required('Informe o e-mail'), validators.email()],
    phone: [validators.maxLen(40)],
    notes: [validators.maxLen(2000)],
  },
});

function openCreate() {
  f.reset();
  createOpen.value = true;
}
function onModalClose() {
  if (!f.submitting.value) f.reset();
}

async function submitCreate() {
  await f.handleSubmit(async (values) => {
    try {
      await r.create(values);
      toast.success('Solicitante cadastrado', { detail: values.name });
      createOpen.value = false;
      f.reset();
      r.setPage(1);
    } catch (e) {
      toast.error('Não foi possível salvar o solicitante', {
        detail: (e && e.message) || 'Tente novamente.',
        code: e && e.status ? 'HTTP ' + e.status : '',
      });
    }
  });
}

r.load();
</script>

<style scoped>
.cust-ico {
  font-weight: 700;
  line-height: 1;
}

/* KPIs */
.cust-kpis {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: var(--ui-space-4);
}

/* segmentos (visões rápidas) */
.cust-segments {
  display: flex;
  flex-wrap: wrap;
  gap: var(--ui-space-2);
}
.cust-seg {
  font: inherit;
  font-size: var(--ui-text-sm);
  font-weight: 600;
  color: rgb(var(--ui-muted));
  background: rgb(var(--ui-surface));
  border: 1px solid rgb(var(--ui-border));
  border-radius: var(--ui-radius-pill);
  padding: 6px 14px;
  cursor: pointer;
  transition: background .15s ease, color .15s ease, border-color .15s ease;
}
.cust-seg:hover {
  color: rgb(var(--ui-fg));
  border-color: rgb(var(--ui-border-strong));
}
.cust-seg[data-active="true"] {
  color: rgb(var(--ui-accent-strong));
  background: rgb(var(--ui-accent) / 0.12);
  border-color: rgb(var(--ui-accent) / 0.40);
}

/* barra de ações em lote */
.cust-bulk {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ui-space-4);
  flex-wrap: wrap;
  background: rgb(var(--ui-accent) / 0.08);
  border: 1px solid rgb(var(--ui-accent) / 0.30);
  border-radius: var(--ui-radius-lg);
  padding: var(--ui-space-3) var(--ui-space-4);
  margin-bottom: var(--ui-space-4);
}
.cust-bulk-count {
  font-weight: 700;
  color: rgb(var(--ui-accent-strong));
  font-size: var(--ui-text-sm);
}
.cust-bulk-actions {
  display: flex;
  gap: var(--ui-space-2);
  flex-wrap: wrap;
}

/* identidade do solicitante */
.cust-id {
  display: flex;
  align-items: center;
  gap: var(--ui-space-3);
  min-width: 0;
}
.cust-avatar {
  flex-shrink: 0;
  /* tamanho fixo do avatar: primitivo de layout (o kit não expõe token de tamanho) */
  width: 36px;
  height: 36px;
  border-radius: var(--ui-radius-pill);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: var(--ui-text-xs);
  font-weight: 700;
  letter-spacing: .02em;
  background: rgb(var(--ui-accent) / 0.14);
  color: rgb(var(--ui-accent-strong));
  border: 1px solid transparent;
}
.cust-avatar[data-vip="true"] {
  background: rgb(var(--ui-warn) / 0.16);
  color: rgb(var(--ui-warn));
  border-color: rgb(var(--ui-warn) / 0.35);
}
.cust-id-text {
  display: flex;
  flex-direction: column;
  gap: 1px; /* hairline nome/sub: micro-primitivo abaixo da escala --ui-space-* */
  min-width: 0;
}
.cust-id-name {
  display: inline-flex;
  align-items: center;
  gap: var(--ui-space-2);
  font-weight: 600;
  color: rgb(var(--ui-fg));
}
.cust-vip-badge {
  flex-shrink: 0;
}
.cust-id-sub {
  font-size: var(--ui-text-xs);
  color: rgb(var(--ui-muted));
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* contato */
.cust-contact {
  display: flex;
  flex-direction: column;
  gap: 1px; /* hairline e-mail/telefone: micro-primitivo abaixo de --ui-space-* */
}
.cust-contact-line {
  color: rgb(var(--ui-fg));
}
.cust-contact-sub {
  font-size: var(--ui-text-xs);
  color: rgb(var(--ui-muted));
}

/* estrela VIP acionável */
.cust-star {
  font: inherit;
  font-size: var(--ui-text-lg);
  line-height: 1;
  background: none;
  border: none;
  cursor: pointer;
  color: rgb(var(--ui-faint));
  padding: 4px;
  border-radius: var(--ui-radius-sm);
  transition: color .15s ease, transform .1s ease;
}
.cust-star:hover {
  color: rgb(var(--ui-warn));
  transform: scale(1.12);
}
.cust-star[data-on="true"] {
  color: rgb(var(--ui-warn));
}

/* chamados vinculados */
.cust-muted {
  color: rgb(var(--ui-muted));
}
.cust-tickets {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  /* min-width da pílula: primitivo de layout (sem token de tamanho no kit) */
  min-width: 28px;
  padding: var(--ui-space-1) var(--ui-space-3);
  border-radius: var(--ui-radius-pill);
  font-weight: 600;
  font-size: var(--ui-text-xs);
  background: rgb(var(--ui-accent) / 0.12);
  color: rgb(var(--ui-accent-strong));
}
.cust-tickets[data-empty="true"] {
  background: rgb(var(--ui-muted) / 0.14);
  color: rgb(var(--ui-muted));
}

/* ações por linha */
.cust-actions {
  display: inline-flex;
  gap: var(--ui-space-2);
  justify-content: flex-end;
}

/* formulário do modal */
.cust-form {
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-5);
}
.cust-check {
  display: inline-flex;
  align-items: center;
  gap: var(--ui-space-2);
  font-size: var(--ui-text-sm);
  color: rgb(var(--ui-fg));
  cursor: pointer;
  padding-top: var(--ui-space-2);
}
.cust-check input {
  width: auto;
}

@media (max-width: 1100px) {
  .cust-kpis {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
@media (max-width: 640px) {
  .cust-kpis {
    grid-template-columns: 1fr;
  }
  .cust-actions {
    flex-wrap: wrap;
  }
  .cust-bulk {
    flex-direction: column;
    align-items: flex-start;
  }
}
</style>
