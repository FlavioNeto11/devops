<!--
  Preferências de Notificação — visão do gestor de tenant (REQ-NEUROEVOLUI-0007).
  Lista TODAS as preferências de canal (e-mail, push, WhatsApp) dos usuários do tenant.
  Gestor pode ativar/desativar canais individualmente ou em massa por canal.

  Endpoint REAL:
    · GET /v1/notification-preferences  (resourceFactory; coleção → { data, total })
      campos: user_id, channel, enabled, contact_value, created_at
    · PUT /v1/notification-preferences/:id  (toggle individual via update)
      body: { enabled: boolean }

  Estados: loading (skeleton) · empty (com CTA) · error (com retry) · normal.
  CSP-safe: zero style inline / :style / v-html — todo estado visual por class + data-* no <style scoped>.
-->
<template>
  <UiPageLayout
    eyebrow="Configurações"
    title="Preferências de Notificação"
    subtitle="Canais de notificação por usuário do tenant. Ative ou desative e-mail, push e WhatsApp em massa ou individualmente."
    width="wide"
    :error="errorMessage"
    @retry="reload"
  >
    <template #actions>
      <UiButton variant="ghost" :loading="loading" @click="reload">Atualizar</UiButton>
    </template>

    <!-- KPIs por canal -->
    <section class="np-metrics" aria-label="Resumo por canal">
      <UiMetricCard
        label="E-mail ativos"
        :value="loading ? null : formatNumber(metrics.emailEnabled)"
        :loading="loading"
        tone="success"
        :hint="metrics.emailTotal + ' configurados'"
      />
      <UiMetricCard
        label="Push ativos"
        :value="loading ? null : formatNumber(metrics.pushEnabled)"
        :loading="loading"
        tone="running"
        :hint="metrics.pushTotal + ' configurados'"
      />
      <UiMetricCard
        label="WhatsApp ativos"
        :value="loading ? null : formatNumber(metrics.whatsappEnabled)"
        :loading="loading"
        tone="success"
        :hint="metrics.whatsappTotal + ' configurados'"
      />
      <UiMetricCard
        label="Total de preferências"
        :value="loading ? null : formatNumber(total)"
        :loading="loading"
        tone="neutral"
        hint="registros no tenant"
      />
    </section>

    <!-- Filtros -->
    <template #filters>
      <UiFiltersPanel
        v-model="filters"
        :fields="filterFields"
        @apply="applyFilters"
        @clear="clearFilters"
      />
    </template>

    <!-- Banner: filtros ativos -->
    <template v-if="hasActiveFilters && !loading" #banner>
      <div class="np-banner" role="status">
        <span class="np-banner-text">
          Exibindo {{ formatNumber(filteredRows.length) }} de {{ formatNumber(rows.length) }} preferências com os filtros aplicados.
        </span>
        <UiButton variant="subtle" size="sm" @click="clearFilters">Limpar filtros</UiButton>
      </div>
    </template>

    <!-- Ações em massa por canal -->
    <div v-if="!loading && rows.length > 0" class="np-bulk" role="group" aria-label="Ações em massa">
      <span class="np-bulk-label">Ativar/desativar em massa:</span>
      <div class="np-bulk-actions">
        <UiButton
          variant="subtle"
          size="sm"
          :loading="bulk.email"
          :disabled="bulk.email"
          @click="bulkToggle('email', true)"
        >Ativar todos e-mail</UiButton>
        <UiButton
          variant="ghost"
          size="sm"
          :loading="bulk.email"
          :disabled="bulk.email"
          @click="bulkToggle('email', false)"
        >Desativar todos e-mail</UiButton>
        <UiButton
          variant="subtle"
          size="sm"
          :loading="bulk.push"
          :disabled="bulk.push"
          @click="bulkToggle('push', true)"
        >Ativar todos push</UiButton>
        <UiButton
          variant="ghost"
          size="sm"
          :loading="bulk.push"
          :disabled="bulk.push"
          @click="bulkToggle('push', false)"
        >Desativar todos push</UiButton>
        <UiButton
          variant="subtle"
          size="sm"
          :loading="bulk.whatsapp"
          :disabled="bulk.whatsapp"
          @click="bulkToggle('whatsapp', true)"
        >Ativar todos WhatsApp</UiButton>
        <UiButton
          variant="ghost"
          size="sm"
          :loading="bulk.whatsapp"
          :disabled="bulk.whatsapp"
          @click="bulkToggle('whatsapp', false)"
        >Desativar todos WhatsApp</UiButton>
      </div>
    </div>

    <!-- Tabela principal -->
    <UiDataTable
      :columns="columns"
      :rows="filteredRows"
      :loading="loading"
      row-key="id"
      density="comfortable"
      server-mode
      :sort="sort"
      :page="page"
      :page-size="pageSize"
      :total="total"
      :paginated="!hasActiveFilters"
      :empty="emptyState"
      @update:sort="onSort"
      @update:page="onPage"
      @update:page-size="onPageSize"
      @retry="reload"
    >
      <!-- Canal com badge colorido -->
      <template #cell-channel="{ value }">
        <span class="np-channel-cell">
          <UiStatusBadge
            :tone="channelTone(value)"
            :label="channelLabel(value)"
            :with-dot="true"
          />
        </span>
      </template>

      <!-- Status ativo/inativo — toggle interativo -->
      <template #cell-enabled="{ row }">
        <div class="np-toggle-cell">
          <button
            type="button"
            class="np-switch"
            role="switch"
            :aria-checked="row.enabled ? 'true' : 'false'"
            :aria-label="'Ativar canal ' + channelLabel(row.channel) + ' para ' + (row.user_id || 'usuário')"
            :data-on="row.enabled ? 'true' : null"
            :data-busy="toggling[row.id] ? 'true' : null"
            :disabled="!!toggling[row.id]"
            @click="onToggle(row)"
          >
            <span class="np-switch-knob" aria-hidden="true" />
          </button>
          <span class="np-switch-label">{{ row.enabled ? 'Ativo' : 'Inativo' }}</span>
        </div>
      </template>

      <!-- Contato configurado -->
      <template #cell-contact_value="{ value }">
        <span v-if="value" class="np-contact">{{ value }}</span>
        <span v-else class="np-muted">—</span>
      </template>

      <!-- Usuário -->
      <template #cell-user_id="{ value }">
        <span v-if="value" class="np-user">{{ value }}</span>
        <span v-else class="np-muted">—</span>
      </template>

      <!-- Data de criação -->
      <template #cell-created_at="{ value }">
        <span class="np-when">{{ format.formatDateTime(value) }}</span>
      </template>

      <!-- CTA vazio -->
      <template #empty-action>
        <div class="np-empty-actions">
          <UiButton v-if="hasActiveFilters" variant="ghost" @click="clearFilters">Limpar filtros</UiButton>
          <UiButton variant="primary" to="/notification-preferences">Configurar notificações</UiButton>
        </div>
      </template>
    </UiDataTable>

    <template #footer>
      <span>Canal de comunicação por usuário. Clique no interruptor para ativar ou desativar individualmente.</span>
    </template>
  </UiPageLayout>
</template>

<script setup>
import { ref, computed, reactive, onMounted } from 'vue';
import {
  UiPageLayout,
  UiDataTable,
  UiFiltersPanel,
  UiMetricCard,
  UiStatusBadge,
  UiButton,
  useToast,
  useConfirm,
  format,
} from '../ui/index.js';
import { notificationPreferences } from '../api.js';

const toast = useToast();
const confirm = useConfirm();

// ── Estado de dados ──────────────────────────────────────────────────────────
const rows = ref([]);
const total = ref(0);
const loading = ref(false);
const error = ref(null);

const sort = ref({ key: 'created_at', dir: 'desc' });
const page = ref(1);
const pageSize = ref(25);

const filters = ref({ q: '', channel: '', enabled: '' });

// Mapa de toggling por ID (anti-duplo-clique individual)
const toggling = reactive({});
// Mapa de busy para ações em massa por canal
const bulk = reactive({ email: false, push: false, whatsapp: false });

// ── Rótulos e tons ──────────────────────────────────────────────────────────
const CHANNEL_LABELS = {
  email: 'E-mail',
  push: 'Push',
  whatsapp: 'WhatsApp',
};

const CHANNEL_TONES = {
  email: 'running',
  push: 'warning',
  whatsapp: 'success',
};

function channelLabel(ch) {
  return CHANNEL_LABELS[String(ch || '').toLowerCase()] || (ch ? String(ch) : '—');
}

function channelTone(ch) {
  return CHANNEL_TONES[String(ch || '').toLowerCase()] || 'neutral';
}

function formatNumber(v) {
  return format.formatNumber(v);
}

// ── Colunas ────────────────────────────────────────────────────────────────
const columns = [
  { key: 'user_id', label: 'Usuário', sortable: true },
  { key: 'channel', label: 'Canal', sortable: true },
  { key: 'enabled', label: 'Ativo', align: 'center' },
  { key: 'contact_value', label: 'Endereço / Contato' },
  { key: 'created_at', label: 'Criado em', sortable: true },
];

// ── Campos de filtro ────────────────────────────────────────────────────────
const filterFields = [
  { key: 'q', label: 'Buscar', type: 'text', placeholder: 'Usuário ou contato…' },
  {
    key: 'channel',
    label: 'Canal',
    type: 'select',
    options: [
      { value: 'email', label: 'E-mail' },
      { value: 'push', label: 'Push' },
      { value: 'whatsapp', label: 'WhatsApp' },
    ],
  },
  {
    key: 'enabled',
    label: 'Status',
    type: 'select',
    options: [
      { value: 'true', label: 'Ativo' },
      { value: 'false', label: 'Inativo' },
    ],
  },
];

// ── Filtragem client-side sobre a página carregada ──────────────────────────
const hasActiveFilters = computed(() =>
  Object.values(filters.value).some((v) => String(v ?? '').trim() !== ''),
);

function norm(v) {
  return String(v ?? '').trim().toLowerCase();
}

const filteredRows = computed(() => {
  if (!hasActiveFilters.value) return rows.value;
  const f = filters.value;
  return rows.value.filter((r) => {
    if (f.q) {
      const q = norm(f.q);
      const match =
        norm(r.user_id).includes(q) ||
        norm(r.contact_value).includes(q) ||
        norm(channelLabel(r.channel)).includes(q);
      if (!match) return false;
    }
    if (f.channel && norm(r.channel) !== norm(f.channel)) return false;
    if (f.enabled !== '' && f.enabled !== undefined) {
      const want = f.enabled === 'true';
      if (!!r.enabled !== want) return false;
    }
    return true;
  });
});

// ── Métricas derivadas ────────────────────────────────────────────────────
const metrics = computed(() => {
  const src = rows.value;
  let emailEnabled = 0, emailTotal = 0;
  let pushEnabled = 0, pushTotal = 0;
  let whatsappEnabled = 0, whatsappTotal = 0;
  for (const r of src) {
    const ch = norm(r.channel);
    if (ch === 'email') { emailTotal++; if (r.enabled) emailEnabled++; }
    else if (ch === 'push') { pushTotal++; if (r.enabled) pushEnabled++; }
    else if (ch === 'whatsapp') { whatsappTotal++; if (r.enabled) whatsappEnabled++; }
  }
  return { emailEnabled, emailTotal, pushEnabled, pushTotal, whatsappEnabled, whatsappTotal };
});

// ── Estado vazio ──────────────────────────────────────────────────────────
const emptyState = computed(() => {
  if (hasActiveFilters.value) {
    return {
      title: 'Nenhuma preferência encontrada',
      description: 'Nenhum resultado corresponde aos filtros aplicados. Ajuste ou limpe os filtros.',
      icon: 'search',
    };
  }
  return {
    title: 'Nenhuma preferência configurada',
    description: 'Os usuários ainda não configuraram canais de notificação neste tenant.',
    icon: 'bell',
  };
});

// ── Mensagem de erro (sem expor 401/403 como falha de sistema) ───────────────
const errorMessage = computed(() => {
  if (!error.value) return null;
  if (error.value.status === 401 || error.value.status === 403) return null;
  return error.value.message || 'Não foi possível carregar as preferências de notificação.';
});

// ── Carga ─────────────────────────────────────────────────────────────────
async function load() {
  loading.value = true;
  error.value = null;
  try {
    const params = {
      page: page.value,
      pageSize: pageSize.value,
      sort: sort.value && sort.value.key,
      dir: sort.value && sort.value.dir,
    };
    const res = await notificationPreferences.list(params);
    const data = Array.isArray(res) ? res : (res && res.data) ? res.data : [];
    rows.value = data;
    total.value = (res && typeof res.total === 'number') ? res.total : data.length;
  } catch (e) {
    error.value = e;
    rows.value = [];
    total.value = 0;
  } finally {
    loading.value = false;
  }
}

async function reload() {
  await load();
  if (!error.value) {
    toast.success('Preferências atualizadas.');
  } else if (error.value.status !== 401 && error.value.status !== 403) {
    toast.error('Falha ao atualizar.', { detail: error.value.message });
  }
}

// ── Ações de filtro ────────────────────────────────────────────────────────
function applyFilters() {
  // Filtros são client-side; apenas aciona reatividade.
}

function clearFilters() {
  filters.value = { q: '', channel: '', enabled: '' };
}

// ── Paginação e ordenação (server-mode) ──────────────────────────────────
function onSort(s) {
  sort.value = s;
  page.value = 1;
  load();
}

function onPage(p) {
  page.value = p;
  load();
}

function onPageSize(size) {
  pageSize.value = size;
  page.value = 1;
  load();
}

// ── Toggle individual ──────────────────────────────────────────────────────
// Desativar é destrutivo (o usuário deixa de ser notificado) → confirmar.
async function onToggle(row) {
  if (toggling[row.id]) return;

  const turningOff = row.enabled;
  if (turningOff) {
    const ok = await confirm({
      title: 'Desativar canal ' + channelLabel(row.channel) + '?',
      message:
        'O usuário ' +
        (row.user_id || '(desconhecido)') +
        ' deixará de receber notificações por ' +
        channelLabel(row.channel) +
        '. É possível reativar quando quiser.',
      confirmLabel: 'Desativar',
      cancelLabel: 'Manter ativo',
      danger: true,
    });
    if (!ok) return;
  }

  toggling[row.id] = true;
  const next = !row.enabled;
  // Atualização otimista
  row.enabled = next;
  try {
    await notificationPreferences.update(row.id, { enabled: next });
    toast.success(
      channelLabel(row.channel) +
        ' ' +
        (next ? 'ativado' : 'desativado') +
        ' para ' +
        (row.user_id || 'usuário') +
        '.',
    );
  } catch (e) {
    // Rollback otimista
    row.enabled = !next;
    toast.error('Não foi possível atualizar a preferência.', {
      detail: e.message,
      code: e.status,
    });
  } finally {
    delete toggling[row.id];
  }
}

// ── Ação em massa por canal ────────────────────────────────────────────────
async function bulkToggle(channel, enable) {
  const chKey = String(channel).toLowerCase();
  if (bulk[chKey]) return;

  const targets = rows.value.filter((r) => norm(r.channel) === chKey && r.enabled !== enable);
  if (!targets.length) {
    toast.info(
      'Todos os canais ' +
        channelLabel(channel) +
        ' já estão ' +
        (enable ? 'ativos' : 'inativos') +
        '.',
    );
    return;
  }

  const label = channelLabel(channel);
  const actionLabel = enable ? 'ativar' : 'desativar';
  const ok = await confirm({
    title:
      (enable ? 'Ativar' : 'Desativar') +
      ' todos os canais ' +
      label +
      '?',
    message:
      targets.length +
      ' preferência(s) de ' +
      label +
      ' serão ' +
      (enable ? 'ativadas' : 'desativadas') +
      '. Esta ação afeta todos os usuários listados com este canal.',
    confirmLabel: enable ? 'Ativar todos' : 'Desativar todos',
    cancelLabel: 'Cancelar',
    danger: !enable,
  });
  if (!ok) return;

  bulk[chKey] = true;
  let successCount = 0;
  let failCount = 0;

  // Aplica otimisticamente e enfileira as chamadas
  for (const row of targets) {
    row.enabled = enable;
  }

  await Promise.allSettled(
    targets.map(async (row) => {
      try {
        await notificationPreferences.update(row.id, { enabled: enable });
        successCount++;
      } catch {
        // Rollback individual
        row.enabled = !enable;
        failCount++;
      }
    }),
  );

  bulk[chKey] = false;

  if (failCount === 0) {
    toast.success(
      successCount +
        ' preferência(s) de ' +
        label +
        ' ' +
        (enable ? 'ativadas' : 'desativadas') +
        '.',
    );
  } else {
    toast.warning(
      successCount +
        ' atualizada(s), ' +
        failCount +
        ' falhou/falharam. Atualize para verificar o estado atual.',
    );
  }
}

onMounted(load);
</script>

<style scoped>
/* KPIs */
.np-metrics {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: var(--ui-space-4);
}

/* Banner de filtros ativos */
.np-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ui-space-3);
  flex-wrap: wrap;
  background: rgb(var(--ui-accent) / 0.08);
  border: 1px solid rgb(var(--ui-accent) / 0.25);
  border-radius: var(--ui-radius-lg);
  padding: var(--ui-space-3) var(--ui-space-4);
}

.np-banner-text {
  color: rgb(var(--ui-fg));
  font-size: var(--ui-text-sm);
  font-weight: 600;
}

/* Barra de ações em massa */
.np-bulk {
  display: flex;
  align-items: center;
  gap: var(--ui-space-3);
  flex-wrap: wrap;
  padding: var(--ui-space-3) var(--ui-space-4);
  background: rgb(var(--ui-surface-2));
  border: 1px solid rgb(var(--ui-border));
  border-radius: var(--ui-radius-lg);
}

.np-bulk-label {
  font-size: var(--ui-text-sm);
  font-weight: 600;
  color: rgb(var(--ui-muted));
  white-space: nowrap;
}

.np-bulk-actions {
  display: flex;
  gap: var(--ui-space-2);
  flex-wrap: wrap;
}

/* Célula canal */
.np-channel-cell {
  display: inline-flex;
  align-items: center;
}

/* Toggle interativo na tabela */
.np-toggle-cell {
  display: flex;
  align-items: center;
  gap: var(--ui-space-2);
  justify-content: center;
}

.np-switch-label {
  font-size: var(--ui-text-xs);
  color: rgb(var(--ui-muted));
  min-width: 38px;
}

/* Switch acessível */
.np-switch {
  position: relative;
  flex-shrink: 0;
  width: 40px;
  height: 22px;
  border-radius: var(--ui-radius-pill);
  border: 1px solid rgb(var(--ui-border-strong));
  background: rgb(var(--ui-surface-2));
  cursor: pointer;
  padding: 0;
  transition: background 0.15s ease, border-color 0.15s ease;
}

.np-switch[data-on="true"] {
  background: rgb(var(--ui-accent));
  border-color: rgb(var(--ui-accent));
}

.np-switch:focus-visible {
  outline: none;
  box-shadow: 0 0 0 3px rgb(var(--ui-accent) / 0.25);
}

.np-switch:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.np-switch[data-busy="true"] {
  cursor: progress;
}

.np-switch-knob {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: rgb(var(--ui-bg));
  box-shadow: var(--ui-shadow-sm);
  transition: transform 0.15s ease;
}

.np-switch[data-on="true"] .np-switch-knob {
  transform: translateX(18px);
}

@media (prefers-reduced-motion: reduce) {
  .np-switch,
  .np-switch-knob {
    transition: none;
  }
}

/* Contato */
.np-contact {
  font-family: var(--ui-font-mono, monospace);
  font-size: var(--ui-text-xs);
  color: rgb(var(--ui-fg));
}

/* Usuário */
.np-user {
  font-weight: 600;
  font-size: var(--ui-text-sm);
  color: rgb(var(--ui-fg));
}

/* Data */
.np-when {
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  font-size: var(--ui-text-sm);
  color: rgb(var(--ui-muted));
}

/* Vazio */
.np-muted {
  color: rgb(var(--ui-muted));
}

.np-empty-actions {
  display: flex;
  gap: var(--ui-space-2);
  flex-wrap: wrap;
  justify-content: center;
}

/* Responsivo */
@media (max-width: 860px) {
  .np-metrics {
    grid-template-columns: repeat(2, 1fr);
  }

  .np-bulk {
    flex-direction: column;
    align-items: flex-start;
  }

  .np-bulk-actions {
    gap: var(--ui-space-2);
  }
}

@media (max-width: 480px) {
  .np-metrics {
    grid-template-columns: 1fr;
  }
}
</style>
