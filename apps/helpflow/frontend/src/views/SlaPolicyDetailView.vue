<template>
  <UiPageLayout
    width="wide"
    eyebrow="HelpFlow · Políticas de SLA"
    :title="pageTitle"
    subtitle="Parâmetros do acordo de nível de serviço, times que o adotam e a taxa de cumprimento (compliance) medida sobre os chamados reais."
    :loading="initialLoading"
    loading-message="Carregando a política de SLA…"
    :error="policyError"
    @retry="reload"
  >
    <!-- ===================== AÇÕES DO CABEÇALHO ===================== -->
    <template #actions>
      <UiButton variant="ghost" to="/sla-policies">
        <template #icon-left><span class="sp-ico" aria-hidden="true">←</span></template>
        Voltar às políticas
      </UiButton>
      <UiButton variant="subtle" :loading="refreshing" :disabled="!policy && !refreshing" @click="reload">
        <template #icon-left><span class="sp-ico" aria-hidden="true">↻</span></template>
        Atualizar
      </UiButton>
      <UiButton v-if="policy" variant="subtle" :to="editLink">
        <template #icon-left><span class="sp-ico" aria-hidden="true">✎</span></template>
        Editar política
      </UiButton>
      <UiButton
        v-if="policy && isActive"
        variant="danger"
        :loading="working"
        @click="deactivate"
      >Desativar política</UiButton>
      <UiButton
        v-else-if="policy"
        variant="primary"
        :loading="working"
        @click="reactivate"
      >Reativar política</UiButton>
    </template>

    <!-- ===================== ESTADO NORMAL ===================== -->
    <template v-if="policy">
      <!-- EntityHeader -->
      <section class="sp-header" aria-label="Identidade da política de SLA">
        <span class="sp-mark" :data-tone="priorityTone(policy.priority)" aria-hidden="true">
          {{ priorityGlyph(policy.priority) }}
        </span>
        <div class="sp-header-id">
          <div class="sp-header-row">
            <h2 class="sp-header-name">{{ policy.name || 'Política sem nome' }}</h2>
            <UiStatusBadge :status="statusValue" :tone="statusTone" :label="statusLabel(statusValue)" size="lg" />
            <UiStatusBadge
              :status="policy.priority"
              :tone="priorityTone(policy.priority)"
              :label="'Alvo: ' + priorityLabel(policy.priority)"
            />
            <UiStatusBadge
              tone="neutral"
              :with-dot="false"
              :label="policy.business_hours_only ? 'Horário comercial' : 'Cobertura 24/7'"
            />
          </div>
          <ul class="sp-header-facts">
            <li class="sp-fact">
              <span class="sp-fact-icon" aria-hidden="true">⚡</span>
              <span class="sp-fact-label">1ª resposta</span>
              <span class="sp-fact-value">{{ durationText(policy.first_response_mins) }}</span>
            </li>
            <li class="sp-fact">
              <span class="sp-fact-icon" aria-hidden="true">⏱</span>
              <span class="sp-fact-label">Resolução</span>
              <span class="sp-fact-value">{{ durationText(policy.resolution_mins) }}</span>
            </li>
            <li class="sp-fact">
              <span class="sp-fact-icon" aria-hidden="true">👥</span>
              <span class="sp-fact-label">Times usando</span>
              <span class="sp-fact-value">{{ teamsLoading ? '…' : relatedTeams.length }}</span>
            </li>
            <li class="sp-fact">
              <span class="sp-fact-icon" aria-hidden="true">#</span>
              <span class="sp-fact-label">ID</span>
              <span class="sp-fact-value sp-mono">#{{ policy.id }}</span>
            </li>
          </ul>
        </div>

        <!-- ComplianceWidget (medidor no cabeçalho) -->
        <div
          class="sp-gauge"
          :data-tone="complianceTone"
          role="meter"
          aria-valuemin="0"
          aria-valuemax="100"
          :aria-valuenow="compliancePct === null ? undefined : compliancePct"
          :aria-valuetext="gaugeValueText"
          aria-label="Taxa de cumprimento do SLA"
        >
          <span class="sp-gauge-cap">Cumprimento</span>
          <span class="sp-gauge-val" aria-hidden="true">
            <template v-if="complianceLoading">…</template>
            <template v-else-if="compliancePct === null">—</template>
            <template v-else>{{ compliancePct }}%</template>
          </span>
          <span class="sp-gauge-hint">{{ complianceHint }}</span>
          <span class="sp-gauge-track" aria-hidden="true">
            <span class="sp-gauge-fill" :data-pct="gaugeBucket" :data-tone="complianceTone" />
          </span>
        </div>
      </section>

      <!-- Métricas-chave -->
      <section class="sp-metrics" aria-label="Indicadores da política de SLA">
        <UiMetricCard
          label="1ª resposta (alvo)"
          :value="durationText(policy.first_response_mins)"
          hint="Tempo máximo para o primeiro retorno"
          tone="primary"
        />
        <UiMetricCard
          label="Resolução (alvo)"
          :value="durationText(policy.resolution_mins)"
          hint="Tempo máximo para encerrar o chamado"
          tone="primary"
        />
        <UiMetricCard
          label="Times usando"
          :value="teamsLoading ? null : relatedTeams.length"
          :loading="teamsLoading"
          hint="Filas com esta política como padrão"
          tone="running"
          clickable
          @click="goToTeams"
        />
        <UiMetricCard
          label="Chamados avaliados"
          :value="complianceLoading ? null : compliance.total"
          :loading="complianceLoading"
          hint="Base da taxa de cumprimento"
          :tone="evaluatedTone"
          clickable
          @click="goToTickets"
        />
      </section>

      <div class="sp-grid">
        <!-- Coluna principal -->
        <div class="sp-col-main">
          <!-- ComplianceWidget (detalhado) -->
          <UiCard title="Cumprimento do SLA" subtitle="Medido sobre os chamados que adotam esta política.">
            <template #actions>
              <UiButton variant="subtle" size="sm" :loading="complianceLoading" @click="loadCompliance">
                Recalcular
              </UiButton>
            </template>

            <UiLoadingState v-if="complianceLoading" variant="skeleton" :skeleton-lines="4" />
            <UiErrorState
              v-else-if="complianceError"
              :message="complianceError"
              @retry="loadCompliance"
            >
              <template #action>
                <UiButton variant="subtle" size="sm" to="/tickets">Abrir chamados</UiButton>
              </template>
            </UiErrorState>
            <UiEmptyState
              v-else-if="!compliance.total"
              icon="chart"
              title="Sem chamados avaliáveis"
              description="Quando chamados forem atendidos sob esta política, a taxa de cumprimento aparece aqui."
            >
              <template #action>
                <UiButton variant="subtle" size="sm" to="/tickets">Abrir chamados</UiButton>
              </template>
            </UiEmptyState>

            <div v-else class="sp-comp">
              <div class="sp-comp-bars" role="group" aria-label="Distribuição do cumprimento">
                <div
                  v-for="seg in complianceSegments"
                  :key="seg.key"
                  class="sp-bar"
                  role="meter"
                  aria-valuemin="0"
                  aria-valuemax="100"
                  :aria-valuenow="pctOf(seg.value, compliance.total)"
                  :aria-label="seg.label + ': ' + seg.value + ' chamados, ' + pctOf(seg.value, compliance.total) + '%'"
                >
                  <div class="sp-bar-label">
                    <span class="sp-bar-dot" :data-tone="seg.tone" aria-hidden="true" />
                    <span>{{ seg.label }}</span>
                    <span class="sp-bar-n">{{ seg.value }}</span>
                  </div>
                  <div class="sp-bar-track" aria-hidden="true">
                    <span class="sp-bar-fill" :data-tone="seg.tone" :data-pct="pctBucket(seg.value, compliance.total)" />
                  </div>
                  <span class="sp-bar-pct" aria-hidden="true">{{ pctOf(seg.value, compliance.total) }}%</span>
                </div>
              </div>

              <ul class="sp-comp-foot">
                <li>
                  <span class="sp-comp-k">Encerrados avaliados</span>
                  <span class="sp-comp-v">{{ compliance.resolved }}</span>
                </li>
                <li>
                  <span class="sp-comp-k">Taxa de cumprimento</span>
                  <span class="sp-comp-v" :data-tone="complianceTone">
                    {{ compliancePct === null ? '—' : compliancePct + '%' }}
                  </span>
                </li>
                <li>
                  <span class="sp-comp-k">Total na base</span>
                  <span class="sp-comp-v">{{ compliance.total }}</span>
                </li>
              </ul>
            </div>
          </UiCard>

          <!-- RelatedTeamsList -->
          <UiCard title="Times que usam esta política" subtitle="Filas com esta política como SLA padrão.">
            <template #actions>
              <UiButton variant="subtle" size="sm" to="/teams">Ver todos os times</UiButton>
            </template>

            <UiDataTable
              :columns="teamColumns"
              :rows="relatedTeams"
              :loading="teamsLoading"
              :error="teamsError"
              row-key="id"
              density="comfortable"
              clickable-rows
              :empty="teamsEmpty"
              @row-click="openTeam"
              @retry="loadTeams"
            >
              <template #cell-name="{ row }">
                <span class="sp-team">
                  <span class="sp-team-name">{{ row.name || ('Time #' + row.id) }}</span>
                  <span v-if="row.description" class="sp-team-desc">{{ row.description }}</span>
                </span>
              </template>
              <template #cell-status="{ row }">
                <UiStatusBadge :status="row.status" :tone="teamStatusTone(row.status)" :label="statusLabel(row.status)" size="sm" />
              </template>
              <template #cell-id="{ row }">
                <span class="sp-mono">#{{ row.id }}</span>
              </template>
              <template #empty-action>
                <UiButton variant="subtle" size="sm" to="/teams">Configurar um time</UiButton>
              </template>
            </UiDataTable>
          </UiCard>
        </div>

        <!-- Coluna lateral -->
        <aside class="sp-col-side">
          <!-- PropertiesGrid -->
          <UiCard title="Parâmetros">
            <template #actions>
              <UiButton variant="ghost" size="sm" :to="editLink">Editar</UiButton>
            </template>
            <dl class="sp-dl">
              <div class="sp-dl-row">
                <dt>Nome</dt>
                <dd class="sp-dd-strong">{{ policy.name || '—' }}</dd>
              </div>
              <div class="sp-dl-row">
                <dt>Prioridade alvo</dt>
                <dd>
                  <UiStatusBadge
                    :status="policy.priority"
                    :tone="priorityTone(policy.priority)"
                    :label="priorityLabel(policy.priority)"
                    size="sm"
                  />
                </dd>
              </div>
              <div class="sp-dl-row">
                <dt>Situação</dt>
                <dd><UiStatusBadge :status="statusValue" :tone="statusTone" :label="statusLabel(statusValue)" size="sm" /></dd>
              </div>
              <div class="sp-dl-row">
                <dt>1ª resposta</dt>
                <dd class="sp-dd-strong">{{ durationText(policy.first_response_mins) }}</dd>
              </div>
              <div class="sp-dl-row">
                <dt>Resolução</dt>
                <dd class="sp-dd-strong">{{ durationText(policy.resolution_mins) }}</dd>
              </div>
              <div class="sp-dl-row">
                <dt>Cobertura</dt>
                <dd>{{ policy.business_hours_only ? 'Só horário comercial' : '24 horas / 7 dias' }}</dd>
              </div>
              <div class="sp-dl-row">
                <dt>Times vinculados</dt>
                <dd>{{ teamsLoading ? '…' : relatedTeams.length }}</dd>
              </div>
              <div class="sp-dl-row">
                <dt>Criada em</dt>
                <dd :class="{ 'sp-dash': !policy.created_at }">{{ dateText(policy.created_at) }}</dd>
              </div>
              <div class="sp-dl-row">
                <dt>Atualizada</dt>
                <dd :class="{ 'sp-dash': !policy.updated_at }">{{ dateTimeText(policy.updated_at) }}</dd>
              </div>
              <div class="sp-dl-row">
                <dt>ID</dt>
                <dd class="sp-mono">#{{ policy.id }}</dd>
              </div>
            </dl>
          </UiCard>

          <!-- Resumo do alvo (texto humano, ancorado nos parâmetros) -->
          <UiCard title="Resumo do alvo" subtitle="Como esta política se compromete.">
            <p class="sp-summary">
              Chamados de prioridade <strong>{{ priorityLabel(policy.priority) }}</strong> devem ter a
              <strong>primeira resposta em até {{ durationText(policy.first_response_mins) }}</strong>
              e estar <strong>resolvidos em até {{ durationText(policy.resolution_mins) }}</strong>,
              {{ policy.business_hours_only ? 'contando apenas o horário comercial.' : 'em cobertura ininterrupta (24/7).' }}
            </p>
          </UiCard>
        </aside>
      </div>
    </template>

    <!-- Estado vazio: política não encontrada (resposta sem erro de rede, ex.: 404) -->
    <UiEmptyState
      v-else-if="!initialLoading && !policyError"
      icon="search"
      title="Política não encontrada"
      description="Esta política de SLA pode ter sido removida ou o endereço está incorreto."
    >
      <template #action>
        <UiButton to="/sla-policies">Voltar às políticas</UiButton>
      </template>
    </UiEmptyState>

    <template v-if="policy" #footer>
      <span>{{ footerSummary }}</span>
    </template>
  </UiPageLayout>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import {
  UiPageLayout,
  UiCard,
  UiMetricCard,
  UiStatusBadge,
  UiDataTable,
  UiEmptyState,
  UiLoadingState,
  UiErrorState,
  UiButton,
  useToast,
  useConfirm,
  format,
} from '../ui/index.js';
// Recursos de DOMÍNIO reais (backend expõe /v1/<name>). Usamos os símbolos
// canônicos do api.js (slaPolicies → /v1/sla-policies, teams → /v1/teams,
// tickets → /v1/tickets) com fallback defensivo via fábrica caso algum símbolo
// suma do barrel — espelha o padrão das telas irmãs e evita white-screen.
import { resourceFactory, slaPolicies, teams as teamsResource, tickets as ticketsResource } from '../api.js';

const props = defineProps({ id: { type: [String, Number], default: null } });
const route = useRoute();
const router = useRouter();
const toast = useToast();
const ask = useConfirm();

// id pode vir como prop (router props:true) ou pelos params da rota
const policyId = computed(() => props.id ?? route.params.id);
const editLink = computed(() => '/sla-policies/' + policyId.value + '/edit');

// ---- recursos REAIS (com fallback defensivo pela fábrica) ----
const slaApi = slaPolicies || resourceFactory('sla-policies');
const teamsApi = teamsResource || resourceFactory('teams');
const ticketsApi = ticketsResource || resourceFactory('tickets');
const hasFn = (obj, name) => obj && typeof obj[name] === 'function';
const unwrap = (r) => (r && r.data !== undefined ? r.data : r);
const listOf = (r) => (Array.isArray(r) ? r : (r && Array.isArray(r.data) ? r.data : (r && Array.isArray(r.items) ? r.items : [])));

// ===================== enums de domínio (alinhados ao schema) =====================
const PRIORITY = {
  low: { label: 'Baixa', tone: 'neutral', glyph: '○' },
  medium: { label: 'Média', tone: 'running', glyph: '◐' },
  high: { label: 'Alta', tone: 'warning', glyph: '◆' },
  urgent: { label: 'Urgente', tone: 'error', glyph: '▲' },
};
function priorityLabel(p) { return (PRIORITY[String(p).toLowerCase()] || {}).label || format.humanize(p); }
function priorityTone(p) { return (PRIORITY[String(p).toLowerCase()] || {}).tone || 'neutral'; }
function priorityGlyph(p) { return (PRIORITY[String(p).toLowerCase()] || {}).glyph || '◦'; }

function statusLabel(s) {
  const v = String(s).toLowerCase();
  if (v === 'active') return 'Ativa';
  if (v === 'inactive') return 'Inativa';
  return s ? format.humanize(s) : '—';
}
function teamStatusTone(s) {
  return String(s).toLowerCase() === 'active' ? 'success' : 'neutral';
}

// ===================== formatação de tempo =====================
function durationText(mins) {
  const n = Number(mins);
  if (!isFinite(n) || n <= 0) return '—';
  if (n < 60) return n + ' min';
  if (n % 1440 === 0) { const d = n / 1440; return d + (d === 1 ? ' dia' : ' dias'); }
  const h = Math.floor(n / 60);
  const m = n % 60;
  if (m === 0) return h + (h === 1 ? ' hora' : ' horas');
  return h + 'h ' + m + 'min';
}
const dateText = (v) => format.formatDate(v);
const dateTimeText = (v) => format.formatDateTime(v);

// ===================== estado da política =====================
const policy = ref(null);
const policyError = ref(null);
const initialLoading = ref(true);
const refreshing = ref(false);
const working = ref(false);

const pageTitle = computed(() => (policy.value && policy.value.name) ? policy.value.name : 'Detalhe da política de SLA');
const statusValue = computed(() => (policy.value && policy.value.status) || 'inactive');
const isActive = computed(() => String(statusValue.value).toLowerCase() === 'active');
const statusTone = computed(() => (isActive.value ? 'success' : 'neutral'));

async function loadPolicy() {
  policyError.value = null;
  if (!hasFn(slaApi, 'get')) {
    policyError.value = new Error('Recurso de políticas de SLA indisponível neste ambiente.');
    return;
  }
  try {
    const data = await slaApi.get(policyId.value);
    policy.value = unwrap(data) || null;
  } catch (e) {
    if (e && e.status === 404) policy.value = null; // → estado "não encontrada"
    else policyError.value = e;
  }
}

// ===================== times relacionados (RelatedTeamsList) =====================
const teamRows = ref([]);
const teamsLoading = ref(false);
const teamsError = ref(null);

const teamColumns = [
  { key: 'name', label: 'Time / Fila' },
  { key: 'status', label: 'Situação' },
  { key: 'id', label: 'ID', align: 'right' },
];
const teamsEmpty = {
  title: 'Nenhum time usa esta política',
  description: 'Defina esta política como SLA padrão de um time para que ele apareça aqui.',
  icon: 'team',
};

async function loadTeams() {
  teamsError.value = null;
  if (!hasFn(teamsApi, 'list')) { teamRows.value = []; return; }
  teamsLoading.value = true;
  try {
    const res = await teamsApi.list({ pageSize: 200 });
    teamRows.value = listOf(res);
  } catch (e) {
    teamsError.value = e;
    teamRows.value = [];
  } finally {
    teamsLoading.value = false;
  }
}

const relatedTeams = computed(() => {
  const pid = policyId.value;
  if (pid == null) return [];
  return teamRows.value.filter((t) => String(t.default_sla_policy_id) === String(pid));
});

// ===================== compliance (ComplianceWidget) =====================
// Calculada sobre os chamados REAIS que adotam esta política (ticket.sla_policy_id).
const ticketRows = ref([]);
const complianceLoading = ref(false);
const complianceError = ref(null);

const DONE_STATES = ['resolved', 'closed', 'done', 'completed'];
function isResolvedTicket(t) {
  return DONE_STATES.includes(String(t && t.status).toLowerCase());
}
// estouro: tem prazo (sla_due_at) e foi encerrado depois do prazo, OU está aberto e já passou do prazo.
function slaBreached(t) {
  const due = t && t.sla_due_at ? new Date(t.sla_due_at).getTime() : null;
  if (due == null || isNaN(due)) return false;
  if (isResolvedTicket(t)) {
    const closed = t.resolved_at || t.closed_at || t.updated_at;
    const closedAt = closed ? new Date(closed).getTime() : null;
    return closedAt != null && !isNaN(closedAt) && closedAt > due;
  }
  return Date.now() > due; // aberto e já venceu
}

const compliance = computed(() => {
  const pid = policyId.value;
  const mine = ticketRows.value.filter((t) => String(t && t.sla_policy_id) === String(pid));
  let met = 0, breached = 0, atRisk = 0, resolved = 0;
  for (const t of mine) {
    const done = isResolvedTicket(t);
    const over = slaBreached(t);
    if (done) {
      resolved += 1;
      if (over) breached += 1; else met += 1;
    } else if (over) {
      breached += 1;
    } else {
      atRisk += 1;
    }
  }
  return { total: mine.length, met, breached, atRisk, resolved };
});

const complianceSegments = computed(() => {
  const c = compliance.value;
  return [
    { key: 'met', label: 'Dentro do prazo', value: c.met, tone: 'success' },
    { key: 'breached', label: 'Estourado', value: c.breached, tone: 'error' },
    { key: 'atRisk', label: 'Em aberto / em risco', value: c.atRisk, tone: 'warning' },
  ];
});

// taxa de cumprimento = encerrados no prazo / total já vencido (no prazo + estourado)
const compliancePct = computed(() => {
  const c = compliance.value;
  const base = c.met + c.breached;
  if (base <= 0) return null;
  return Math.round((c.met / base) * 100);
});
const complianceTone = computed(() => {
  const p = compliancePct.value;
  if (p === null) return 'neutral';
  if (p >= 90) return 'success';
  if (p >= 70) return 'warning';
  return 'error';
});
const complianceHint = computed(() => {
  if (complianceLoading.value) return 'Calculando…';
  const p = compliancePct.value;
  if (p === null) return 'Sem base avaliável';
  return compliance.value.met + ' de ' + (compliance.value.met + compliance.value.breached) + ' no prazo';
});
const evaluatedTone = computed(() => {
  const t = complianceTone.value;
  return t === 'success' ? 'success' : t === 'error' ? 'error' : 'neutral';
});
// largura da barra do medidor do cabeçalho em "buckets" de 5% (classe → CSS; sem style inline)
const gaugeBucket = computed(() => pctBucket(compliancePct.value || 0, 100));
// texto do medidor para leitores de tela (estado completo, não só o número)
const gaugeValueText = computed(() => {
  if (complianceLoading.value) return 'Calculando…';
  if (compliancePct.value === null) return 'Sem base avaliável';
  return compliancePct.value + '% de cumprimento — ' + complianceHint.value;
});

async function loadCompliance() {
  complianceError.value = null;
  if (!hasFn(ticketsApi, 'list')) {
    // Sem recurso de chamados: não há base — não é erro, é vazio.
    ticketRows.value = [];
    return;
  }
  complianceLoading.value = true;
  try {
    const res = await ticketsApi.list({ sla_policy_id: policyId.value, pageSize: 500 });
    const rows = listOf(res);
    // filtra defensivamente caso o backend ignore o filtro
    ticketRows.value = rows.filter((t) => (t && t.sla_policy_id != null)
      ? String(t.sla_policy_id) === String(policyId.value)
      : true);
  } catch (e) {
    complianceError.value = e;
    ticketRows.value = [];
  } finally {
    complianceLoading.value = false;
  }
}

// ===================== helpers de percentual (puros) =====================
function pctOf(part, total) {
  if (!total) return 0;
  return Math.round((Number(part) / Number(total)) * 100);
}
// arredonda para múltiplos de 5 (0..100) → vira data-pct e a CSS pinta a largura.
function pctBucket(part, total) {
  const p = total ? (Number(part) / Number(total)) * 100 : 0;
  return Math.max(0, Math.min(100, Math.round(p / 5) * 5));
}

// ===================== rodapé =====================
const footerSummary = computed(() => {
  if (initialLoading.value) return 'Carregando detalhes da política…';
  const teamsPart = teamsLoading.value ? 'times…' : (relatedTeams.value.length + ' time(s)');
  const compPart = complianceLoading.value
    ? 'compliance…'
    : (compliancePct.value === null ? 'sem base de compliance' : compliancePct.value + '% de cumprimento');
  return teamsPart + ' · ' + compliance.value.total + ' chamado(s) avaliado(s) · ' + compPart;
});

// ===================== navegação =====================
function openTeam(row) { if (row && row.id != null) router.push('/teams/' + row.id); }
function goToTeams() { router.push('/teams'); }
function goToTickets() { router.push('/tickets'); }

// ===================== ações de situação =====================
async function setStatus(nextStatus, opts) {
  if (!policy.value) return;
  if (!hasFn(slaApi, 'update')) { toast.error('Edição de políticas indisponível.'); return; }
  const ok = await ask({
    title: opts.title,
    message: opts.message,
    confirmLabel: opts.confirmLabel,
    danger: !!opts.danger,
  });
  if (!ok) return;
  working.value = true;
  try {
    const updated = await slaApi.update(policy.value.id, { status: nextStatus });
    const u = unwrap(updated);
    policy.value = (u && u.id != null) ? u : { ...policy.value, status: nextStatus };
    toast.success(opts.success);
  } catch (e) {
    toast.error(opts.fail, { detail: e && e.message, code: e && e.status });
  } finally {
    working.value = false;
  }
}
function deactivate() {
  const name = (policy.value && policy.value.name) || ('#' + policyId.value);
  return setStatus('inactive', {
    title: 'Desativar política de SLA',
    message: 'Desativar a política "' + name + '"? Novos chamados deixam de adotá-la, mas os times atuais permanecem vinculados.',
    confirmLabel: 'Desativar',
    danger: true,
    success: 'Política desativada.',
    fail: 'Não foi possível desativar a política.',
  });
}
function reactivate() {
  const name = (policy.value && policy.value.name) || ('#' + policyId.value);
  return setStatus('active', {
    title: 'Reativar política de SLA',
    message: 'Reativar a política "' + name + '" para uso pelos times?',
    confirmLabel: 'Reativar',
    danger: false,
    success: 'Política reativada.',
    fail: 'Não foi possível reativar a política.',
  });
}

// ===================== ciclo de vida =====================
async function reload() {
  refreshing.value = true;
  await loadPolicy();
  if (policy.value) await Promise.all([loadTeams(), loadCompliance()]);
  refreshing.value = false;
}

async function bootstrap() {
  initialLoading.value = true;
  policy.value = null;
  await loadPolicy();
  initialLoading.value = false;
  if (policy.value) {
    loadTeams();
    loadCompliance();
  }
}

watch(() => policyId.value, () => { bootstrap(); });
onMounted(bootstrap);
</script>

<style scoped>
.sp-ico { font-weight: 700; line-height: 1; }

/* ===================== EntityHeader ===================== */
.sp-header {
  display: flex;
  align-items: center;
  gap: var(--ui-space-5);
  flex-wrap: wrap;
  padding: var(--ui-space-5);
  background: rgb(var(--ui-surface));
  border: 1px solid rgb(var(--ui-border));
  border-left: 3px solid rgb(var(--ui-accent));
  border-radius: var(--ui-radius-lg);
  box-shadow: var(--ui-shadow-sm);
}
.sp-mark {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 64px;
  height: 64px;
  flex-shrink: 0;
  border-radius: var(--ui-radius-lg);
  background: rgb(var(--ui-accent) / 0.14);
  color: rgb(var(--ui-accent-strong));
  font-size: 1.8rem;
  line-height: 1;
}
.sp-mark[data-tone="warning"] { background: rgb(var(--ui-warn) / 0.16); color: rgb(var(--ui-warn)); }
.sp-mark[data-tone="error"] { background: rgb(var(--ui-danger) / 0.16); color: rgb(var(--ui-danger)); }
.sp-mark[data-tone="neutral"] { background: rgb(var(--ui-muted) / 0.16); color: rgb(var(--ui-muted)); }
.sp-mark[data-tone="running"] { background: rgb(var(--ui-accent) / 0.14); color: rgb(var(--ui-accent-strong)); }
.sp-header-id { display: flex; flex-direction: column; gap: var(--ui-space-3); min-width: 0; flex: 1 1 320px; }
.sp-header-row { display: flex; align-items: center; gap: var(--ui-space-3); flex-wrap: wrap; }
.sp-header-name {
  margin: 0;
  font-family: var(--ui-font-display);
  font-size: var(--ui-text-xl);
  font-weight: 700;
  color: rgb(var(--ui-fg));
}
.sp-header-facts {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-wrap: wrap;
  gap: var(--ui-space-2) var(--ui-space-5);
}
.sp-fact { display: inline-flex; align-items: center; gap: var(--ui-space-2); font-size: var(--ui-text-sm); }
.sp-fact-icon { color: rgb(var(--ui-accent-strong)); }
.sp-fact-label { color: rgb(var(--ui-muted)); }
.sp-fact-value { font-weight: 600; color: rgb(var(--ui-fg)); }

/* ComplianceWidget — medidor no cabeçalho */
.sp-gauge {
  flex: 0 0 auto;
  width: 220px;
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-1);
  padding: var(--ui-space-4);
  border-radius: var(--ui-radius-lg);
  border: 1px solid rgb(var(--ui-border));
  background: rgb(var(--ui-surface-2));
  border-left: 4px solid rgb(var(--ui-faint));
}
.sp-gauge[data-tone="success"] { border-left-color: rgb(var(--ui-ok)); }
.sp-gauge[data-tone="warning"] { border-left-color: rgb(var(--ui-warn)); }
.sp-gauge[data-tone="error"] { border-left-color: rgb(var(--ui-danger)); }
.sp-gauge-cap { color: rgb(var(--ui-muted)); font-size: var(--ui-text-xs); text-transform: uppercase; letter-spacing: .06em; }
.sp-gauge-val { font-family: var(--ui-font-display); font-size: 1.9rem; font-weight: 700; line-height: 1.1; }
.sp-gauge[data-tone="success"] .sp-gauge-val { color: rgb(var(--ui-ok)); }
.sp-gauge[data-tone="warning"] .sp-gauge-val { color: rgb(var(--ui-warn)); }
.sp-gauge[data-tone="error"] .sp-gauge-val { color: rgb(var(--ui-danger)); }
.sp-gauge-hint { color: rgb(var(--ui-muted)); font-size: var(--ui-text-xs); }
.sp-gauge-track { margin-top: var(--ui-space-1); height: 7px; border-radius: var(--ui-radius-pill); background: rgb(var(--ui-faint) / 0.5); overflow: hidden; }
.sp-gauge-fill { display: block; height: 100%; border-radius: var(--ui-radius-pill); background: rgb(var(--ui-accent)); transition: width .3s ease; width: 0; }
.sp-gauge-fill[data-tone="success"] { background: rgb(var(--ui-ok)); }
.sp-gauge-fill[data-tone="warning"] { background: rgb(var(--ui-warn)); }
.sp-gauge-fill[data-tone="error"] { background: rgb(var(--ui-danger)); }

/* ===================== métricas ===================== */
.sp-metrics { display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: var(--ui-space-4); }

/* ===================== layout em grade ===================== */
.sp-grid { display: grid; grid-template-columns: minmax(0, 1.6fr) minmax(0, 1fr); gap: var(--ui-space-4); align-items: start; }
.sp-col-main, .sp-col-side { display: flex; flex-direction: column; gap: var(--ui-space-4); min-width: 0; }

/* ===================== ComplianceWidget detalhado ===================== */
.sp-comp { display: flex; flex-direction: column; gap: var(--ui-space-5); }
.sp-comp-bars { display: flex; flex-direction: column; gap: var(--ui-space-4); }
.sp-bar { display: grid; grid-template-columns: 1fr auto; grid-template-areas: "label pct" "track track"; gap: var(--ui-space-2) var(--ui-space-3); align-items: center; }
.sp-bar-label { grid-area: label; display: flex; align-items: center; gap: var(--ui-space-2); font-size: var(--ui-text-sm); font-weight: 600; }
.sp-bar-dot { width: 9px; height: 9px; border-radius: 50%; flex-shrink: 0; background: rgb(var(--ui-faint)); }
.sp-bar-dot[data-tone="success"] { background: rgb(var(--ui-ok)); }
.sp-bar-dot[data-tone="error"] { background: rgb(var(--ui-danger)); }
.sp-bar-dot[data-tone="warning"] { background: rgb(var(--ui-warn)); }
.sp-bar-n { color: rgb(var(--ui-muted)); font-weight: 700; font-family: var(--ui-font-display); }
.sp-bar-pct { grid-area: pct; font-size: var(--ui-text-sm); font-weight: 700; color: rgb(var(--ui-muted)); }
.sp-bar-track { grid-area: track; height: 9px; border-radius: var(--ui-radius-pill); background: rgb(var(--ui-faint) / 0.5); overflow: hidden; }
.sp-bar-fill { display: block; height: 100%; border-radius: var(--ui-radius-pill); background: rgb(var(--ui-muted)); transition: width .3s ease; width: 0; }
.sp-bar-fill[data-tone="success"] { background: rgb(var(--ui-ok)); }
.sp-bar-fill[data-tone="error"] { background: rgb(var(--ui-danger)); }
.sp-bar-fill[data-tone="warning"] { background: rgb(var(--ui-warn)); }

/* larguras em buckets de 5% — sem style inline (CSP) */
.sp-bar-fill[data-pct="0"], .sp-gauge-fill[data-pct="0"] { width: 0%; }
.sp-bar-fill[data-pct="5"], .sp-gauge-fill[data-pct="5"] { width: 5%; }
.sp-bar-fill[data-pct="10"], .sp-gauge-fill[data-pct="10"] { width: 10%; }
.sp-bar-fill[data-pct="15"], .sp-gauge-fill[data-pct="15"] { width: 15%; }
.sp-bar-fill[data-pct="20"], .sp-gauge-fill[data-pct="20"] { width: 20%; }
.sp-bar-fill[data-pct="25"], .sp-gauge-fill[data-pct="25"] { width: 25%; }
.sp-bar-fill[data-pct="30"], .sp-gauge-fill[data-pct="30"] { width: 30%; }
.sp-bar-fill[data-pct="35"], .sp-gauge-fill[data-pct="35"] { width: 35%; }
.sp-bar-fill[data-pct="40"], .sp-gauge-fill[data-pct="40"] { width: 40%; }
.sp-bar-fill[data-pct="45"], .sp-gauge-fill[data-pct="45"] { width: 45%; }
.sp-bar-fill[data-pct="50"], .sp-gauge-fill[data-pct="50"] { width: 50%; }
.sp-bar-fill[data-pct="55"], .sp-gauge-fill[data-pct="55"] { width: 55%; }
.sp-bar-fill[data-pct="60"], .sp-gauge-fill[data-pct="60"] { width: 60%; }
.sp-bar-fill[data-pct="65"], .sp-gauge-fill[data-pct="65"] { width: 65%; }
.sp-bar-fill[data-pct="70"], .sp-gauge-fill[data-pct="70"] { width: 70%; }
.sp-bar-fill[data-pct="75"], .sp-gauge-fill[data-pct="75"] { width: 75%; }
.sp-bar-fill[data-pct="80"], .sp-gauge-fill[data-pct="80"] { width: 80%; }
.sp-bar-fill[data-pct="85"], .sp-gauge-fill[data-pct="85"] { width: 85%; }
.sp-bar-fill[data-pct="90"], .sp-gauge-fill[data-pct="90"] { width: 90%; }
.sp-bar-fill[data-pct="95"], .sp-gauge-fill[data-pct="95"] { width: 95%; }
.sp-bar-fill[data-pct="100"], .sp-gauge-fill[data-pct="100"] { width: 100%; }

.sp-comp-foot { list-style: none; margin: 0; padding: var(--ui-space-4) 0 0; border-top: 1px solid rgb(var(--ui-border)); display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: var(--ui-space-3); }
.sp-comp-foot li { display: flex; flex-direction: column; gap: var(--ui-space-1); }
.sp-comp-k { color: rgb(var(--ui-muted)); font-size: var(--ui-text-xs); text-transform: uppercase; letter-spacing: .05em; }
.sp-comp-v { font-family: var(--ui-font-display); font-size: 1.25rem; font-weight: 700; }
.sp-comp-v[data-tone="success"] { color: rgb(var(--ui-ok)); }
.sp-comp-v[data-tone="warning"] { color: rgb(var(--ui-warn)); }
.sp-comp-v[data-tone="error"] { color: rgb(var(--ui-danger)); }

/* ===================== RelatedTeamsList ===================== */
.sp-team { display: inline-flex; flex-direction: column; min-width: 0; line-height: 1.3; }
.sp-team-name { font-weight: 600; color: rgb(var(--ui-fg)); }
.sp-team-desc { font-size: var(--ui-text-xs); color: rgb(var(--ui-muted)); overflow: hidden; text-overflow: ellipsis; }

/* ===================== PropertiesGrid (dl) ===================== */
.sp-dl { margin: 0; display: flex; flex-direction: column; }
.sp-dl-row { display: flex; align-items: center; justify-content: space-between; gap: var(--ui-space-4); padding: var(--ui-space-3) 0; border-bottom: 1px solid rgb(var(--ui-border)); }
.sp-dl-row:last-child { border-bottom: none; }
.sp-dl-row dt { color: rgb(var(--ui-muted)); font-size: var(--ui-text-sm); font-weight: 600; flex-shrink: 0; }
.sp-dl-row dd { margin: 0; color: rgb(var(--ui-fg)); text-align: right; min-width: 0; overflow: hidden; text-overflow: ellipsis; }
.sp-dd-strong { font-weight: 600; }

.sp-summary { margin: 0; line-height: 1.6; color: rgb(var(--ui-fg)); }
.sp-summary strong { color: rgb(var(--ui-accent-strong)); }

/* ===================== utilidades ===================== */
.sp-mono { font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace; font-size: var(--ui-text-sm); }
.sp-dash { color: rgb(var(--ui-muted)); font-style: italic; }

/* ===================== responsivo ===================== */
@media (max-width: 980px) {
  .sp-grid { grid-template-columns: 1fr; }
}
@media (max-width: 860px) {
  .sp-header { flex-direction: column; align-items: flex-start; }
  .sp-gauge { width: 100%; }
}
@media (max-width: 560px) {
  .sp-dl-row { flex-direction: column; align-items: flex-start; gap: 2px; }
  .sp-dl-row dd { text-align: left; }
}
</style>
