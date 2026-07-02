<template>
  <UiPageLayout
    title="Painel Principal"
    eyebrow="ContaViva 360"
    :subtitle="subtitleByRole"
    width="wide"
    :loading="loading"
    :error="errorMsg"
    @retry="load"
  >
    <template #actions>
      <div class="header-actions">
        <span class="sse-indicator" :data-connected="sseConnected ? 'true' : 'false'" aria-label="Status da conexão em tempo real">
          <span class="sse-dot" aria-hidden="true" />
          {{ sseConnected ? 'Ao vivo' : 'Reconectando…' }}
        </span>
        <UiButton variant="ghost" size="sm" :to="roleRoute">
          Ver painel completo
        </UiButton>
      </div>
    </template>

    <!-- ALERTA CRÍTICO: obrigações vencidas -->
    <div v-if="obrigacoesVencidas.length > 0" class="alert-banner" data-severity="critical" role="alert" aria-live="assertive">
      <span class="alert-banner-icon" aria-hidden="true">⚠</span>
      <span class="alert-banner-text">
        <strong>{{ obrigacoesVencidas.length }} obrigação(ões) em atraso</strong> — ação imediata necessária.
      </span>
      <UiButton variant="danger" size="sm" @click="scrollToObrigacoes">Ver agora</UiButton>
    </div>

    <!-- KPIs TOPO -->
    <section class="kpi-grid" aria-label="Indicadores principais">
      <UiMetricCard
        label="Saldo Previsto (90d)"
        :value="fmt(data?.saldo_caixa_previsto)"
        :tone="saldoTone"
        :hint="data?.saldo_caixa_previsto != null ? 'projeção dos próximos 90 dias' : undefined"
        :loading="loading"
        clickable
        @click="navigate('/financial/cash-flow')"
      />
      <UiMetricCard
        label="Obrigações Vencidas"
        :value="obrigacoesVencidas.length"
        :tone="obrigacoesVencidas.length > 0 ? 'error' : 'success'"
        :hint="obrigacoesVencidas.length > 0 ? 'requer ação imediata' : 'em dia'"
        :loading="loading"
        clickable
        @click="scrollToObrigacoes"
      />
      <UiMetricCard
        label="Vencendo em 7 dias"
        :value="obrig7d.length"
        :tone="obrig7d.length > 0 ? 'warning' : 'success'"
        :hint="obrig7d.length > 0 ? 'atenção necessária' : 'nenhuma'"
        :loading="loading"
        clickable
        @click="scrollToProximas"
      />
      <UiMetricCard
        label="Tarefas Abertas"
        :value="tarefasAbertas.length"
        :tone="tarefasAbertas.length > 5 ? 'warning' : 'neutral'"
        :hint="`${tarefasUrgentes.length} urgente(s)`"
        :loading="loading"
        clickable
        @click="scrollToTarefas"
      />
      <UiMetricCard
        v-if="showFinanceiro"
        label="Contas a Receber"
        :value="fmt(data?.contas_receber?.total)"
        tone="success"
        :hint="`${data?.contas_receber?.count ?? 0} pendente(s)`"
        :loading="loading"
        clickable
        @click="navigate('/financial/receivable')"
      />
      <UiMetricCard
        v-if="showFinanceiro"
        label="Contas a Pagar"
        :value="fmt(data?.contas_pagar?.total)"
        tone="error"
        :hint="`${data?.contas_pagar?.count ?? 0} pendente(s)`"
        :loading="loading"
        clickable
        @click="navigate('/financial/payable')"
      />
      <UiMetricCard
        v-if="showDocumentos"
        label="Docs. Aguardando Aprovação"
        :value="data?.documentos_pendentes?.length ?? 0"
        :tone="(data?.documentos_pendentes?.length ?? 0) > 0 ? 'warning' : 'neutral'"
        :hint="(data?.documentos_pendentes?.length ?? 0) > 0 ? 'aguardando revisão' : 'nenhum pendente'"
        :loading="loading"
        clickable
        @click="scrollToDocumentos"
      />
    </section>

    <!-- LINHA 1: Obrigações Vencidas + Vencendo em Breve -->
    <div class="dashboard-cols" ref="obrigacoesRef">
      <!-- Obrigações vencidas -->
      <UiCard
        title="Obrigações em Atraso"
        :subtitle="obrigacoesVencidas.length > 0 ? `${obrigacoesVencidas.length} requer(em) ação imediata` : 'Nenhuma em atraso'"
        class="card-alert"
        :data-has-alerts="obrigacoesVencidas.length > 0 ? 'true' : 'false'"
      >
        <template #actions>
          <UiButton variant="ghost" size="sm" to="/financial/dashboard">Ver financeiro</UiButton>
        </template>
        <UiDataTable
          :columns="obrigCols"
          :rows="obrigacoesVencidas"
          row-key="id"
          :loading="loading"
          density="compact"
          clickable-rows
          :empty="{ title: 'Nenhuma obrigação em atraso', description: 'Todas as obrigações fiscais estão em dia.' }"
          @row-click="openObrigacao"
        >
          <template #cell-status="{ value }">
            <UiStatusBadge :status="value" with-dot />
          </template>
          <template #cell-urgencia="{ row }">
            <UiStatusBadge :status="urgenciaLabel(row.data_vencimento)" :tone="urgenciaTone(row.data_vencimento)" :label="urgenciaLabel(row.data_vencimento)" with-dot />
          </template>
        </UiDataTable>
      </UiCard>

      <!-- Obrigações próximas do vencimento (30 dias) -->
      <UiCard
        title="Próximas Obrigações"
        subtitle="Vencem nos próximos 30 dias"
        ref="proximasRef"
      >
        <template #actions>
          <UiButton variant="ghost" size="sm" to="/financial/dashboard">Financeiro</UiButton>
        </template>
        <UiDataTable
          :columns="obrigProxCols"
          :rows="obrigacoesProximas"
          row-key="id"
          :loading="loading"
          density="compact"
          clickable-rows
          :empty="{ title: 'Nenhuma obrigação nos próximos 30 dias', description: 'Aproveite para planejar o período seguinte.' }"
          @row-click="openObrigacao"
        >
          <template #cell-alerta="{ row }">
            <UiStatusBadge :status="alertaLabel(row.data_vencimento)" :tone="alertaTone(row.data_vencimento)" :label="alertaLabel(row.data_vencimento)" with-dot />
          </template>
          <template #cell-status="{ value }">
            <UiStatusBadge :status="value" with-dot />
          </template>
        </UiDataTable>
      </UiCard>
    </div>

    <!-- LINHA 2: Tarefas Pendentes + Saldo de Caixa -->
    <div class="dashboard-cols" ref="tarefasRef">
      <!-- Tarefas abertas -->
      <UiCard title="Tarefas em Aberto" :subtitle="`${tarefasAbertas.length} tarefa(s) pendente(s)`">
        <template #actions>
          <UiButton variant="ghost" size="sm" to="/financial/dashboard">Ver todas</UiButton>
        </template>
        <UiDataTable
          :columns="tarefaCols"
          :rows="tarefasAbertas.slice(0, 8)"
          row-key="id"
          :loading="loading"
          density="compact"
          :empty="{ title: 'Nenhuma tarefa em aberto', description: 'Todas as tarefas foram concluídas.' }"
        >
          <template #cell-priority="{ value }">
            <UiStatusBadge :status="value" :tone="priorityTone(value)" :label="priorityLabel(value)" with-dot />
          </template>
          <template #cell-status="{ value }">
            <UiStatusBadge :status="value" with-dot />
          </template>
        </UiDataTable>
      </UiCard>

      <!-- Saldo de Caixa Previsto -->
      <UiCard title="Fluxo de Caixa" subtitle="Projeção dos próximos 90 dias">
        <template #actions>
          <UiButton variant="ghost" size="sm" to="/financial/cash-flow">Ver detalhes</UiButton>
        </template>
        <div v-if="loading" class="cash-loading">
          <UiLoadingState variant="skeleton" :skeleton-lines="4" />
        </div>
        <div v-else-if="fluxoCaixa.length > 0" class="cash-chart">
          <div class="cash-summary">
            <div class="cash-summary-item">
              <span class="cash-label">Total Entradas</span>
              <span class="cash-value cash-positive">{{ fmt(totalEntradas) }}</span>
            </div>
            <div class="cash-summary-item">
              <span class="cash-label">Total Saídas</span>
              <span class="cash-value cash-negative">{{ fmt(totalSaidas) }}</span>
            </div>
            <div class="cash-summary-item">
              <span class="cash-label">Saldo Líquido</span>
              <span class="cash-value" :class="totalLiquido >= 0 ? 'cash-positive' : 'cash-negative'">
                {{ fmt(totalLiquido) }}
              </span>
            </div>
          </div>
          <!-- Fluxo semanal: lista compacta -->
          <ul class="cash-rows" role="list" aria-label="Projeção semanal do fluxo de caixa">
            <li
              v-for="(semana, i) in fluxoCaixa.slice(0, 8)"
              :key="i"
              class="cash-row-item"
            >
              <span class="cash-row-label">{{ semana.semana ? String(semana.semana).slice(5) : 'Sem. ' + (i + 1) }}</span>
              <span class="cash-row-track">
                <span
                  class="cash-row-fill cash-row-fill-entrada"
                  :data-pct="barPct(semana.entradas, maxFluxo)"
                  :aria-label="`Entradas: ${fmt(semana.entradas)}`"
                />
              </span>
              <span class="cash-row-val cash-positive">{{ fmt(semana.entradas) }}</span>
              <span class="cash-row-track">
                <span
                  class="cash-row-fill cash-row-fill-saida"
                  :data-pct="barPct(semana.saidas, maxFluxo)"
                  :aria-label="`Saídas: ${fmt(semana.saidas)}`"
                />
              </span>
              <span class="cash-row-val cash-negative">{{ fmt(semana.saidas) }}</span>
            </li>
          </ul>
          <div class="cash-legend" aria-hidden="true">
            <span class="legend-item legend-entrada">Entradas</span>
            <span class="legend-item legend-saida">Saídas</span>
          </div>
        </div>
        <UiEmptyState
          v-else
          title="Sem projeção disponível"
          description="Cadastre receitas e despesas futuras para visualizar o fluxo."
        >
          <template #action>
            <UiButton to="/financial/receivable" variant="ghost">Cadastrar receita</UiButton>
          </template>
        </UiEmptyState>
      </UiCard>
    </div>

    <!-- LINHA 3: Documentos Pendentes (se houver) + KPIs Financeiros -->
    <div class="dashboard-cols dashboard-cols-3" ref="documentosRef">
      <!-- Documentos aguardando aprovação -->
      <div v-if="showDocumentos" class="col-span-2">
        <UiCard
          title="Documentos Aguardando Aprovação"
          :subtitle="`${data?.documentos_pendentes?.length ?? 0} documento(s) pendente(s)`"
        >
          <template #actions>
            <UiButton variant="ghost" size="sm" to="/financial/dashboard">Ver financeiro</UiButton>
          </template>
          <UiDataTable
            :columns="docCols"
            :rows="data?.documentos_pendentes || []"
            row-key="id"
            :loading="loading"
            density="compact"
            :empty="{ title: 'Nenhum documento pendente', description: 'Todos os documentos foram processados.' }"
          >
            <template #cell-status="{ value }">
              <UiStatusBadge :status="value" with-dot />
            </template>
          </UiDataTable>
        </UiCard>
      </div>

      <!-- KPIs Financeiros -->
      <div class="kpi-vertical" :class="showDocumentos ? '' : 'kpi-full'">
        <UiCard title="Resumo Financeiro" subtitle="Indicadores do mês">
          <template #actions>
            <UiButton variant="ghost" size="sm" to="/financial/dashboard">Dashboard</UiButton>
          </template>
          <div class="kpi-list">
            <div class="kpi-row" :data-tone="receitasDespesas?.saldo >= 0 ? 'success' : 'error'">
              <span class="kpi-row-label">Receitas</span>
              <span class="kpi-row-value kpi-positive">{{ fmt(receitasDespesas?.receitas) }}</span>
            </div>
            <div class="kpi-row">
              <span class="kpi-row-label">Despesas</span>
              <span class="kpi-row-value kpi-negative">{{ fmt(receitasDespesas?.despesas) }}</span>
            </div>
            <div class="kpi-row kpi-row-total">
              <span class="kpi-row-label">Saldo Mês</span>
              <span class="kpi-row-value" :class="(receitasDespesas?.saldo ?? 0) >= 0 ? 'kpi-positive' : 'kpi-negative'">
                {{ fmt(receitasDespesas?.saldo) }}
              </span>
            </div>
            <div v-if="data?.impostos" class="kpi-row">
              <span class="kpi-row-label">Impostos (estimado)</span>
              <span class="kpi-row-value">{{ fmt(data.impostos.estimado) }}</span>
            </div>
            <div v-if="data?.impostos" class="kpi-row">
              <span class="kpi-row-label">Impostos (recolhido)</span>
              <span class="kpi-row-value kpi-positive">{{ fmt(data.impostos.realizado) }}</span>
            </div>
          </div>
          <template #footer>
            <UiButton variant="ghost" size="sm" to="/financial/reports">Ver relatórios</UiButton>
          </template>
        </UiCard>

        <!-- Card de atalhos rápidos por role -->
        <UiCard title="Acesso Rápido">
          <nav class="quick-links" aria-label="Atalhos rápidos">
            <RouterLink class="quick-link" to="/financial/payable">
              <span class="quick-link-icon" aria-hidden="true">↑</span>
              <span>Contas a Pagar</span>
            </RouterLink>
            <RouterLink class="quick-link" to="/financial/receivable">
              <span class="quick-link-icon" aria-hidden="true">↓</span>
              <span>Contas a Receber</span>
            </RouterLink>
            <RouterLink class="quick-link" to="/financial/cash-flow">
              <span class="quick-link-icon" aria-hidden="true">≋</span>
              <span>Fluxo de Caixa</span>
            </RouterLink>
            <RouterLink class="quick-link" to="/financial/dashboard">
              <span class="quick-link-icon" aria-hidden="true">◈</span>
              <span>Dashboard Financeiro</span>
            </RouterLink>
            <RouterLink v-if="isAdmin || isContador" class="quick-link" :to="roleRoute">
              <span class="quick-link-icon" aria-hidden="true">◧</span>
              <span>{{ isAdmin ? 'Painel Admin' : 'Painel Contador' }}</span>
            </RouterLink>
            <RouterLink class="quick-link" to="/assistant">
              <span class="quick-link-icon" aria-hidden="true">✨</span>
              <span>Assistente IA</span>
            </RouterLink>
          </nav>
        </UiCard>
      </div>
    </div>

    <!-- MODAL: Detalhe da obrigação + concluir -->
    <UiModal
      :open="!!selectedObrigacao"
      title="Obrigação Fiscal"
      @update:open="v => { if (!v) selectedObrigacao = null; }"
    >
      <div v-if="selectedObrigacao" class="obrig-detail">
        <dl class="obrig-dl">
          <div class="obrig-row">
            <dt>Tipo</dt>
            <dd>{{ selectedObrigacao.tipo }}</dd>
          </div>
          <div class="obrig-row">
            <dt>Vencimento</dt>
            <dd :class="isVencida(selectedObrigacao.data_vencimento) ? 'dd-danger' : ''">
              {{ fmtDate(selectedObrigacao.data_vencimento) }}
              <UiStatusBadge v-if="isVencida(selectedObrigacao.data_vencimento)" status="vencida" tone="error" label="Vencida" :with-dot="false" />
            </dd>
          </div>
          <div class="obrig-row">
            <dt>Status</dt>
            <dd><UiStatusBadge :status="selectedObrigacao.status" with-dot /></dd>
          </div>
          <div class="obrig-row">
            <dt>Entidade</dt>
            <dd>{{ selectedObrigacao.entidade_tipo ?? '—' }}</dd>
          </div>
          <div v-if="selectedObrigacao.valor_estimado != null" class="obrig-row">
            <dt>Valor estimado</dt>
            <dd>{{ fmt(selectedObrigacao.valor_estimado) }}</dd>
          </div>
          <div v-if="selectedObrigacao.descricao" class="obrig-row obrig-row-full">
            <dt>Descrição</dt>
            <dd>{{ selectedObrigacao.descricao }}</dd>
          </div>
        </dl>
      </div>
      <template #footer>
        <UiButton variant="ghost" @click="selectedObrigacao = null">Fechar</UiButton>
        <UiButton
          v-if="selectedObrigacao?.status !== 'pago' && selectedObrigacao?.status !== 'concluido'"
          variant="primary"
          :loading="concluding"
          @click="concludeObrig"
        >
          Marcar como concluído
        </UiButton>
      </template>
    </UiModal>
  </UiPageLayout>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { useRouter, RouterLink } from 'vue-router';
import {
  UiPageLayout, UiCard, UiMetricCard, UiDataTable, UiButton,
  UiModal, UiStatusBadge, UiEmptyState, UiLoadingState, useToast,
} from '../ui/index.js';
import {
  me, dashboardRolePf, dashboardRolePj, dashboardRoleContador,
  dashboardRoleAdmin, concludeObligation, dashboardEvents, cashFlow,
} from '../api.js';

const router = useRouter();
const toast = useToast();

// ─── Estado ────────────────────────────────────────────────────────────────
const loading = ref(true);
const errorMsg = ref(null);
const data = ref(null);
const role = ref('member');
const sseConnected = ref(false);
const selectedObrigacao = ref(null);
const concluding = ref(false);
const fluxoCaixa = ref([]);

// refs para scroll
const obrigacoesRef = ref(null);
const proximasRef = ref(null);
const tarefasRef = ref(null);
const documentosRef = ref(null);

// ─── Role helpers ──────────────────────────────────────────────────────────
const isAdmin = computed(() => role.value === 'admin');
const isContador = computed(() => role.value === 'contador' || role.value === 'manager');
const isPj = computed(() => role.value === 'cliente_pj');
const showFinanceiro = computed(() => isAdmin.value || isContador.value || isPj.value);
const showDocumentos = computed(() => (data.value?.documentos_pendentes?.length ?? 0) > 0);

const subtitleByRole = computed(() => {
  if (isAdmin.value) return 'Visão administrativa — todas as entidades.';
  if (isContador.value) return 'Carteira de clientes — obrigações e tarefas.';
  if (isPj.value) return 'Gestão empresarial — fiscal e financeiro.';
  return 'Seu painel pessoal de obrigações e documentos.';
});

const roleRoute = computed(() => {
  if (isAdmin.value) return '/dashboard/admin';
  if (isContador.value) return '/dashboard/contador';
  if (isPj.value) return '/dashboard/pj';
  return '/dashboard/pf';
});

// ─── Dados derivados ───────────────────────────────────────────────────────
const obrigacoesVencidas = computed(() => data.value?.obrigacoes_vencidas ?? []);
const obrigacoesProximas = computed(() => data.value?.obrigacoes_proximas ?? []);
const tarefasAbertas = computed(() =>
  (data.value?.tarefas_para_contador ?? data.value?.tarefas ?? []).filter(
    t => t.status !== 'concluida' && t.status !== 'done' && t.status !== 'closed'
  )
);
const tarefasUrgentes = computed(() =>
  tarefasAbertas.value.filter(t => t.priority === 'alta' || t.priority === 'urgente' || t.priority === 'critica')
);
const obrig7d = computed(() => {
  const now = Date.now();
  return obrigacoesProximas.value.filter(o => {
    if (!o.data_vencimento) return false;
    const diff = new Date(o.data_vencimento).getTime() - now;
    return diff >= 0 && diff <= 7 * 86400000;
  });
});
const receitasDespesas = computed(() => data.value?.receitas_despesas ?? null);
const saldoTone = computed(() => {
  const v = data.value?.saldo_caixa_previsto;
  if (v == null) return 'neutral';
  if (v > 0) return 'success';
  if (v < 0) return 'error';
  return 'neutral';
});
const totalEntradas = computed(() => fluxoCaixa.value.reduce((s, r) => s + (r.entradas ?? 0), 0));
const totalSaidas = computed(() => fluxoCaixa.value.reduce((s, r) => s + (r.saidas ?? 0), 0));
const totalLiquido = computed(() => totalEntradas.value - totalSaidas.value);
const maxFluxo = computed(() => Math.max(...fluxoCaixa.value.flatMap(r => [r.entradas ?? 0, r.saidas ?? 0]), 1));

// ─── Colunas de tabelas ────────────────────────────────────────────────────
const obrigCols = [
  { key: 'tipo', label: 'Obrigação' },
  { key: 'data_vencimento', label: 'Vencimento', format: 'date' },
  { key: 'status', label: 'Status' },
  { key: 'urgencia', label: 'Urgência' },
  { key: 'valor_estimado', label: 'Valor', format: 'currency' },
];
const obrigProxCols = [
  { key: 'tipo', label: 'Obrigação' },
  { key: 'data_vencimento', label: 'Vencimento', format: 'date' },
  { key: 'alerta', label: 'Alerta' },
  { key: 'status', label: 'Status' },
  { key: 'entidade_tipo', label: 'Entidade' },
];
const tarefaCols = [
  { key: 'title', label: 'Tarefa' },
  { key: 'priority', label: 'Prioridade' },
  { key: 'due_at', label: 'Prazo', format: 'date' },
  { key: 'status', label: 'Status' },
];
const docCols = [
  { key: 'tipo', label: 'Tipo' },
  { key: 'nome', label: 'Nome' },
  { key: 'created_at', label: 'Enviado em', format: 'date' },
  { key: 'status', label: 'Status' },
  { key: 'entidade', label: 'Entidade' },
];

// ─── Formatadores ──────────────────────────────────────────────────────────
const fmt = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v ?? 0);
const fmtDate = (d) => d ? new Date(d + 'T12:00:00').toLocaleDateString('pt-BR') : '—';

function isVencida(dateStr) {
  if (!dateStr) return false;
  return new Date(dateStr + 'T23:59:59') < new Date();
}

function diasAteVencer(dateStr) {
  if (!dateStr) return Infinity;
  return Math.ceil((new Date(dateStr + 'T23:59:59').getTime() - Date.now()) / 86400000);
}

function urgenciaLevel(dateStr) {
  const d = diasAteVencer(dateStr);
  if (d < 0) return 'critico';
  if (d <= 3) return 'alto';
  if (d <= 7) return 'medio';
  return 'baixo';
}
function urgenciaTone(dateStr) {
  const level = urgenciaLevel(dateStr);
  if (level === 'critico') return 'error';
  if (level === 'alto') return 'warning';
  if (level === 'medio') return 'running';
  return 'neutral';
}
function urgenciaLabel(dateStr) {
  const d = diasAteVencer(dateStr);
  if (d < 0) return `${Math.abs(d)}d em atraso`;
  if (d === 0) return 'Hoje';
  if (d === 1) return 'Amanhã';
  return `${d}d restantes`;
}
function alertaTone(dateStr) {
  const d = diasAteVencer(dateStr);
  if (d <= 3) return 'error';
  if (d <= 7) return 'warning';
  if (d <= 15) return 'running';
  return 'neutral';
}
function alertaLabel(dateStr) {
  const d = diasAteVencer(dateStr);
  if (d < 0) return 'Vencida';
  if (d === 0) return 'Hoje';
  if (d <= 3) return 'Crítico';
  if (d <= 7) return 'Urgente';
  if (d <= 15) return 'Atenção';
  return 'Normal';
}
function priorityTone(p) {
  if (!p) return 'neutral';
  const lp = String(p).toLowerCase();
  if (lp === 'critica' || lp === 'urgente') return 'error';
  if (lp === 'alta') return 'warning';
  if (lp === 'media') return 'running';
  return 'neutral';
}
function priorityLabel(p) {
  if (!p) return 'Normal';
  const map = { critica: 'Crítica', urgente: 'Urgente', alta: 'Alta', media: 'Média', baixa: 'Baixa', low: 'Baixa', medium: 'Média', high: 'Alta' };
  return map[String(p).toLowerCase()] ?? String(p);
}

function barPct(value, max) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  // quantize to 10-step bucket for CSS class-driven widths
  return String(Math.min(10, Math.max(1, Math.ceil(pct / 10))));
}

// ─── Navegação e scroll ────────────────────────────────────────────────────
function navigate(path) { router.push(path); }

function scrollTo(refEl) {
  if (refEl?.value?.$el) {
    refEl.value.$el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  } else if (refEl?.value) {
    refEl.value.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}
function scrollToObrigacoes() { scrollTo(obrigacoesRef); }
function scrollToProximas() { scrollTo(proximasRef); }
function scrollToTarefas() { scrollTo(tarefasRef); }
function scrollToDocumentos() { scrollTo(documentosRef); }

// ─── Modal de obrigação ────────────────────────────────────────────────────
function openObrigacao(row) { selectedObrigacao.value = row; }

async function concludeObrig() {
  if (!selectedObrigacao.value) return;
  concluding.value = true;
  try {
    await concludeObligation(selectedObrigacao.value.id);
    toast.success('Obrigação marcada como concluída.');
    selectedObrigacao.value = null;
    await load();
  } catch (e) {
    toast.error('Erro ao concluir obrigação: ' + (e?.message ?? 'falha inesperada'));
  } finally {
    concluding.value = false;
  }
}

// ─── Carregamento de dados ─────────────────────────────────────────────────
const ROLE_LOADER = {
  admin: dashboardRoleAdmin,
  manager: dashboardRoleContador,
  contador: dashboardRoleContador,
  member: dashboardRolePf,
  cliente_pf: dashboardRolePf,
  cliente_pj: dashboardRolePj,
};

async function load() {
  loading.value = true;
  errorMsg.value = null;
  try {
    // detecta role via /me
    try {
      const meData = await me();
      role.value = meData?.role ?? 'member';
    } catch {
      role.value = 'member';
    }
    const loader = ROLE_LOADER[role.value] ?? dashboardRolePf;
    data.value = await loader();

    // carrega fluxo de caixa (90d) separado se não veio no payload
    if (!data.value?.fluxo_caixa_90d) {
      try {
        const cf = await cashFlow(90);
        fluxoCaixa.value = Array.isArray(cf) ? cf : (cf?.data ?? []);
      } catch {
        fluxoCaixa.value = [];
      }
    } else {
      fluxoCaixa.value = data.value.fluxo_caixa_90d;
    }
  } catch (e) {
    errorMsg.value = e?.message ?? 'Falha ao carregar o painel. Tente novamente.';
  } finally {
    loading.value = false;
  }
}

// ─── SSE — atualizações em tempo real ────────────────────────────────────
let stopEvents;
const SSE_EVENTS = new Set([
  'task_assigned', 'document_sent', 'obligation_update', 'approval',
  'job_failed', 'payment_received', 'invoice_issued',
]);

onMounted(() => {
  load();
  stopEvents = dashboardEvents((ev) => {
    sseConnected.value = true;
    if (SSE_EVENTS.has(ev?.type)) load();
  });
  // considera conectado se o EventSource abriu (sem erro por 2s)
  setTimeout(() => { if (!errorMsg.value) sseConnected.value = true; }, 2000);
});

onUnmounted(() => {
  if (stopEvents) stopEvents();
  sseConnected.value = false;
});
</script>

<style scoped>
/* ── Layout principal ─────────────────────────────────────────────── */
.header-actions {
  display: flex;
  align-items: center;
  gap: var(--ui-space-3);
}

.sse-indicator {
  display: inline-flex;
  align-items: center;
  gap: var(--ui-space-1);
  font-size: var(--ui-text-xs);
  font-weight: 600;
  color: rgb(var(--ui-muted));
  padding: var(--ui-space-1) var(--ui-space-3);
  border: 1px solid rgb(var(--ui-border));
  border-radius: var(--ui-radius-pill);
  background: rgb(var(--ui-surface));
}
.sse-indicator[data-connected="true"] {
  color: rgb(var(--ui-ok));
  border-color: rgb(var(--ui-ok) / 0.3);
  background: rgb(var(--ui-ok) / 0.08);
}
.sse-dot {
  width: calc(var(--ui-space-1) * 1.5);
  height: calc(var(--ui-space-1) * 1.5);
  border-radius: 50%;
  background: currentColor;
  animation: none;
}
.sse-indicator[data-connected="true"] .sse-dot {
  animation: pulse 2s ease infinite;
}
@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}

/* ── Banner de alerta crítico ─────────────────────────────────────── */
.alert-banner {
  display: flex;
  align-items: center;
  gap: var(--ui-space-3);
  padding: var(--ui-space-3) var(--ui-space-4);
  background: rgb(var(--ui-danger) / 0.10);
  border: 1px solid rgb(var(--ui-danger) / 0.35);
  border-left: 4px solid rgb(var(--ui-danger));
  border-radius: var(--ui-radius-md);
}
.alert-banner[data-severity="critical"] {
  background: rgb(var(--ui-danger) / 0.12);
}
.alert-banner-icon {
  font-size: var(--ui-text-lg);
  color: rgb(var(--ui-danger));
  flex-shrink: 0;
}
.alert-banner-text {
  flex: 1;
  color: rgb(var(--ui-fg));
  font-size: var(--ui-text-sm);
}

/* ── KPI grid topo ────────────────────────────────────────────────── */
.kpi-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
  gap: var(--ui-space-4);
}

/* ── Colunas de widgets ───────────────────────────────────────────── */
.dashboard-cols {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--ui-space-4);
  align-items: start;
}
.dashboard-cols-3 {
  grid-template-columns: 2fr 1fr;
}
.col-span-2 { grid-column: 1 / 2; }
.kpi-vertical {
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-4);
}
.kpi-full { grid-column: 1 / -1; }

/* ── Card com alertas ─────────────────────────────────────────────── */
.card-alert[data-has-alerts="true"] {
  border-left: 3px solid rgb(var(--ui-danger));
}

/* ── Urgência / alerta: renderizados via UiStatusBadge do kit ─────── */

/* ── Fluxo de caixa ───────────────────────────────────────────────── */
.cash-loading { min-height: calc(var(--ui-space-6) * 4 + var(--ui-space-4)); }

.cash-summary {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: var(--ui-space-3);
  margin-bottom: var(--ui-space-4);
  padding-bottom: var(--ui-space-4);
  border-bottom: 1px solid rgb(var(--ui-border));
}
.cash-summary-item { display: flex; flex-direction: column; gap: var(--ui-space-1); }
.cash-label { font-size: var(--ui-text-xs); color: rgb(var(--ui-muted)); }
.cash-value { font-weight: 700; font-size: var(--ui-text-md); }
.cash-positive { color: rgb(var(--ui-ok)); }
.cash-negative { color: rgb(var(--ui-danger)); }

/* Linhas de progresso por semana */
.cash-rows {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-2);
  margin-bottom: var(--ui-space-3);
}
.cash-row-item {
  display: grid;
  grid-template-columns: 56px 1fr auto 1fr auto;
  align-items: center;
  gap: var(--ui-space-2);
}
.cash-row-label {
  font-size: var(--ui-text-xs);
  color: rgb(var(--ui-muted));
  white-space: nowrap;
}
.cash-row-track {
  height: var(--ui-space-2);
  background: rgb(var(--ui-surface-2));
  border-radius: var(--ui-radius-pill);
  overflow: hidden;
}
.cash-row-fill {
  display: block;
  height: 100%;
  border-radius: var(--ui-radius-pill);
  transition: width 0.4s ease;
}
.cash-row-fill-entrada { background: rgb(var(--ui-ok) / 0.7); }
.cash-row-fill-saida   { background: rgb(var(--ui-danger) / 0.6); }
/* data-pct driven widths (1-10 buckets of 10%) */
.cash-row-fill[data-pct="1"]  { width: 10%; }
.cash-row-fill[data-pct="2"]  { width: 20%; }
.cash-row-fill[data-pct="3"]  { width: 30%; }
.cash-row-fill[data-pct="4"]  { width: 40%; }
.cash-row-fill[data-pct="5"]  { width: 50%; }
.cash-row-fill[data-pct="6"]  { width: 60%; }
.cash-row-fill[data-pct="7"]  { width: 70%; }
.cash-row-fill[data-pct="8"]  { width: 80%; }
.cash-row-fill[data-pct="9"]  { width: 90%; }
.cash-row-fill[data-pct="10"] { width: 100%; }

.cash-row-val {
  font-size: var(--ui-text-xs);
  font-weight: 600;
  white-space: nowrap;
  min-width: calc(var(--ui-space-5) * 3);
  text-align: right;
}

.cash-legend {
  display: flex;
  gap: var(--ui-space-4);
  margin-top: var(--ui-space-1);
}
.legend-item {
  display: flex;
  align-items: center;
  gap: calc(var(--ui-space-1) * 1.5);
  font-size: var(--ui-text-xs);
  color: rgb(var(--ui-muted));
}
.legend-item::before {
  content: '';
  width: calc(var(--ui-space-1) * 2.5);
  height: calc(var(--ui-space-1) * 2.5);
  border-radius: var(--ui-radius-sm);
  display: inline-block;
}
.legend-entrada::before { background: rgb(var(--ui-ok) / 0.7); }
.legend-saida::before { background: rgb(var(--ui-danger) / 0.6); }

/* ── KPI list (resumo financeiro) ─────────────────────────────────── */
.kpi-list {
  display: flex;
  flex-direction: column;
  gap: 0;
}
.kpi-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: var(--ui-space-2) 0;
  border-bottom: 1px solid rgb(var(--ui-border));
  gap: var(--ui-space-2);
}
.kpi-row:last-child { border-bottom: none; }
.kpi-row-total {
  padding-top: var(--ui-space-3);
  margin-top: var(--ui-space-1);
  border-top: 2px solid rgb(var(--ui-border));
  border-bottom: none;
  font-weight: 700;
}
.kpi-row-label { color: rgb(var(--ui-muted)); font-size: var(--ui-text-sm); }
.kpi-row-value { font-weight: 600; font-size: var(--ui-text-sm); text-align: right; }
.kpi-positive { color: rgb(var(--ui-ok)); }
.kpi-negative { color: rgb(var(--ui-danger)); }

/* ── Atalhos rápidos ──────────────────────────────────────────────── */
.quick-links {
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-1);
}
.quick-link {
  display: flex;
  align-items: center;
  gap: var(--ui-space-3);
  padding: var(--ui-space-2) var(--ui-space-3);
  border-radius: var(--ui-radius-md);
  color: rgb(var(--ui-fg));
  text-decoration: none;
  font-size: var(--ui-text-sm);
  font-weight: 500;
  transition: background 0.12s ease;
  cursor: pointer;
}
.quick-link:hover,
.quick-link:focus-visible {
  background: rgb(var(--ui-accent) / 0.08);
  color: rgb(var(--ui-accent-strong));
  outline: none;
}
.quick-link:focus-visible {
  box-shadow: 0 0 0 2px rgb(var(--ui-accent) / 0.4);
}
.quick-link-icon {
  width: var(--ui-space-5);
  text-align: center;
  color: rgb(var(--ui-accent));
  font-size: var(--ui-text-md);
  flex-shrink: 0;
}

/* ── Modal de obrigação ───────────────────────────────────────────── */
.obrig-detail { padding: var(--ui-space-1) 0; }
.obrig-dl { display: flex; flex-direction: column; gap: 0; margin: 0; padding: 0; }
.obrig-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: var(--ui-space-3) 0;
  border-bottom: 1px solid rgb(var(--ui-border));
  gap: var(--ui-space-4);
}
.obrig-row:last-child { border-bottom: none; }
.obrig-row-full { flex-direction: column; align-items: flex-start; }
.obrig-row dt { color: rgb(var(--ui-muted)); font-size: var(--ui-text-sm); font-weight: 500; flex-shrink: 0; }
.obrig-row dd { margin: 0; font-weight: 500; display: flex; align-items: center; gap: var(--ui-space-2); }
.dd-danger { color: rgb(var(--ui-danger)); }

/* ── Responsivo ───────────────────────────────────────────────────── */
@media (max-width: 860px) {
  .kpi-grid { grid-template-columns: repeat(2, 1fr); }
  .dashboard-cols { grid-template-columns: 1fr; }
  .dashboard-cols-3 { grid-template-columns: 1fr; }
  .col-span-2 { grid-column: auto; }
  .kpi-full { grid-column: auto; }
  .cash-summary { grid-template-columns: 1fr 1fr; }
}
@media (max-width: 480px) {
  .kpi-grid { grid-template-columns: 1fr; }
  .cash-summary { grid-template-columns: 1fr; }
  .header-actions { flex-direction: column; align-items: flex-end; gap: var(--ui-space-1); }
}
</style>
