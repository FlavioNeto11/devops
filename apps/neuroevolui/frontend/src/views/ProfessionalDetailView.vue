<template>
  <UiPageLayout
    :eyebrow="'Profissional'"
    :title="headerTitle"
    :subtitle="headerSubtitle"
    width="wide"
    :loading="loading"
    :error="error"
    @retry="load"
  >
    <template #actions>
      <UiButton variant="ghost" to="/professionals">Voltar</UiButton>
      <UiButton variant="subtle" :to="editTo">Editar</UiButton>
      <UiButton
        v-if="isSuspended"
        :loading="acting"
        @click="reactivate"
      >Reativar</UiButton>
      <UiButton
        v-else
        variant="danger"
        :loading="acting"
        @click="suspend"
      >Suspender</UiButton>
    </template>

    <template #banner>
      <div v-if="isSuspended" class="np-banner np-banner-warn" role="status">
        <span class="np-banner-dot" aria-hidden="true" />
        <span>Este profissional está <strong>suspenso</strong> — não recebe novas atribuições nem aparece na agenda ativa.</span>
      </div>
      <div v-else-if="isInvited" class="np-banner np-banner-info" role="status">
        <span class="np-banner-dot" aria-hidden="true" />
        <span>Convite enviado — aguardando o profissional concluir o primeiro acesso.</span>
      </div>
    </template>

    <!-- MÉTRICAS -->
    <div class="np-metrics">
      <UiMetricCard
        label="Pacientes atribuídos"
        :value="metricsLoading ? null : formatNumber(patientsCount)"
        :loading="metricsLoading"
        tone="primary"
        hint="vínculos ativos"
      />
      <UiMetricCard
        label="Consultas"
        :value="metricsLoading ? null : formatNumber(consultationsCount)"
        :loading="metricsLoading"
        tone="neutral"
        hint="histórico do profissional"
      />
      <UiMetricCard
        label="Receita gerada"
        :value="metricsLoading ? null : formatCurrency(revenueTotal)"
        :loading="metricsLoading"
        tone="success"
        hint="somatório das consultas"
      />
      <UiMetricCard
        label="Agenda futura"
        :value="metricsLoading ? null : formatNumber(upcoming.length)"
        :loading="metricsLoading"
        tone="neutral"
        hint="próximos atendimentos"
      />
    </div>

    <div class="np-grid">
      <!-- PERFIL -->
      <UiCard title="Dados do profissional" subtitle="Identificação, contato e papel na clínica">
        <template #actions>
          <UiStatusBadge :status="professional.status || 'invited'" size="lg" />
        </template>
        <dl class="np-kv">
          <div>
            <dt>Nome completo</dt>
            <dd>{{ display(professional.full_name) }}</dd>
          </div>
          <div>
            <dt>E-mail</dt>
            <dd>
              <a v-if="professional.email" class="np-link" :href="mailtoHref">{{ professional.email }}</a>
              <span v-else>—</span>
            </dd>
          </div>
          <div>
            <dt>Telefone</dt>
            <dd>{{ display(professional.phone) }}</dd>
          </div>
          <div>
            <dt>Especialidade</dt>
            <dd>{{ display(professional.specialty) }}</dd>
          </div>
          <div>
            <dt>Registro de conselho</dt>
            <dd>{{ display(professional.council_number) }}</dd>
          </div>
          <div>
            <dt>Papel</dt>
            <dd><UiStatusBadge :status="professional.role || ''" :label="roleLabel" :tone="roleTone" /></dd>
          </div>
          <div>
            <dt>Situação</dt>
            <dd><UiStatusBadge :status="professional.status || 'invited'" /></dd>
          </div>
        </dl>
      </UiCard>

      <!-- AGENDA -->
      <UiCard title="Agenda" subtitle="Próximos atendimentos do profissional">
        <UiDataTable
          :columns="agendaColumns"
          :rows="upcomingRows"
          :loading="metricsLoading"
          :error="consultError"
          row-key="id"
          density="compact"
          :empty="{ title: 'Agenda livre', description: 'Nenhum atendimento futuro programado.' }"
          @retry="loadConsultations"
        >
          <template #cell-scheduled_at="{ row }">{{ formatDateTime(scheduledAt(row)) }}</template>
          <template #cell-status="{ value }"><UiStatusBadge :status="value || 'pending'" /></template>
          <template #cell-amount="{ row }">{{ formatCurrency(amountOf(row)) }}</template>
        </UiDataTable>
      </UiCard>
    </div>

    <!-- PACIENTES ATRIBUÍDOS -->
    <UiCard title="Pacientes atribuídos" subtitle="Pessoas sob cuidado deste profissional">
      <template #actions>
        <UiStatusBadge :status="''" tone="neutral" :label="patientsCount + ' no total'" :with-dot="false" />
      </template>
      <UiDataTable
        :columns="patientColumns"
        :rows="patients"
        :loading="metricsLoading"
        :error="consultError"
        row-key="key"
        :empty="{ title: 'Nenhum paciente atribuído', description: 'Atribua pacientes a este profissional para acompanhá-los aqui.' }"
        @retry="loadConsultations"
      >
        <template #cell-lastStatus="{ value }"><UiStatusBadge :status="value || 'pending'" /></template>
        <template #cell-lastAt="{ value }">{{ formatDateTime(value) }}</template>
        <template #cell-revenue="{ value }">{{ formatCurrency(value) }}</template>
        <template #empty-action>
          <UiButton variant="subtle" to="/professionals">Ver profissionais</UiButton>
        </template>
      </UiDataTable>
    </UiCard>

    <!-- HISTÓRICO DE CONSULTAS -->
    <UiCard title="Histórico de consultas" subtitle="Todos os atendimentos vinculados ao profissional">
      <UiDataTable
        :columns="historyColumns"
        :rows="historyRows"
        :loading="metricsLoading"
        :error="consultError"
        row-key="id"
        density="compact"
        :empty="{ title: 'Sem consultas registradas', description: 'Ainda não há atendimentos lançados para este profissional.' }"
        @retry="loadConsultations"
      >
        <template #cell-scheduled_at="{ row }">{{ formatDateTime(scheduledAt(row)) }}</template>
        <template #cell-status="{ value }"><UiStatusBadge :status="value || 'pending'" /></template>
        <template #cell-amount="{ row }">{{ formatCurrency(amountOf(row)) }}</template>
      </UiDataTable>
    </UiCard>
  </UiPageLayout>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue';
import { useRouter } from 'vue-router';
import {
  UiPageLayout,
  UiCard,
  UiMetricCard,
  UiStatusBadge,
  UiDataTable,
  UiButton,
  useToast,
  useConfirm,
  format,
} from '../ui/index.js';
import { professionals, consultations } from '../api.js';

const { formatNumber, formatCurrency, formatDateTime } = format;

const props = defineProps({ id: { type: [String, Number], required: true } });

const router = useRouter();
const toast = useToast();
const confirm = useConfirm();

// ---- estado principal (perfil) ----
const loading = ref(true);
const error = ref(null);
const professional = ref({});

// ---- estado das consultas (métricas + tabelas) ----
const metricsLoading = ref(true);
const consultError = ref(null);
const allConsultations = ref([]);

const acting = ref(false);

// ---- helpers de exibição ----
const display = (v) => (v === null || v === undefined || v === '' ? '—' : String(v));

const ROLE_LABELS = { owner: 'Proprietário', clinic_manager: 'Gerente da clínica', professional: 'Profissional' };
const roleLabel = computed(() => ROLE_LABELS[professional.value.role] || (professional.value.role ? format.humanize(professional.value.role) : '—'));
const roleTone = computed(() => {
  if (professional.value.role === 'owner') return 'running';
  if (professional.value.role === 'clinic_manager') return 'success';
  return 'neutral';
});

const isSuspended = computed(() => String(professional.value.status || '').toLowerCase() === 'suspended');
const isInvited = computed(() => String(professional.value.status || '').toLowerCase() === 'invited');

const headerTitle = computed(() => professional.value.full_name || ('Profissional #' + props.id));
const headerSubtitle = computed(() => {
  const parts = [];
  if (professional.value.specialty) parts.push(professional.value.specialty);
  if (roleLabel.value && roleLabel.value !== '—') parts.push(roleLabel.value);
  return parts.length ? parts.join(' · ') : 'Perfil do profissional.';
});

const editTo = computed(() => '/professionals/' + props.id + '/edit');
const mailtoHref = computed(() => (professional.value.email ? 'mailto:' + professional.value.email : undefined));

// ---- normalização das consultas (campos variáveis no domínio) ----
function scheduledAt(row) {
  return row.scheduled_at ?? row.scheduledAt ?? row.date ?? row.start_at ?? row.startAt ?? row.created_at ?? null;
}
function amountOf(row) {
  const raw = row.amount ?? row.price ?? row.value ?? row.total ?? row.revenue ?? row.fee ?? 0;
  const n = Number(raw);
  return isFinite(n) ? n : 0;
}
function patientNameOf(row) {
  return row.patient_name ?? row.patientName ?? row.patient ?? (row.patient_id ?? row.patientId ? 'Paciente #' + (row.patient_id ?? row.patientId) : '—');
}
function patientKeyOf(row) {
  return String(row.patient_id ?? row.patientId ?? patientNameOf(row));
}

const sortedByDate = computed(() =>
  [...allConsultations.value].sort((a, b) => {
    const da = new Date(scheduledAt(a) || 0).getTime();
    const db = new Date(scheduledAt(b) || 0).getTime();
    return db - da;
  })
);

const consultationsCount = computed(() => allConsultations.value.length);
const revenueTotal = computed(() => allConsultations.value.reduce((sum, r) => sum + amountOf(r), 0));

const now = Date.now();
const upcoming = computed(() =>
  allConsultations.value
    .filter((r) => {
      const t = new Date(scheduledAt(r) || 0).getTime();
      return isFinite(t) && t >= now;
    })
    .sort((a, b) => new Date(scheduledAt(a) || 0).getTime() - new Date(scheduledAt(b) || 0).getTime())
);

const history = computed(() => sortedByDate.value);

// pacientes derivados das consultas (agregação)
const patients = computed(() => {
  const map = new Map();
  for (const r of allConsultations.value) {
    const key = patientKeyOf(r);
    const at = scheduledAt(r);
    const existing = map.get(key);
    if (!existing) {
      map.set(key, {
        key,
        name: patientNameOf(r),
        visits: 1,
        revenue: amountOf(r),
        lastAt: at,
        lastStatus: r.status,
      });
    } else {
      existing.visits += 1;
      existing.revenue += amountOf(r);
      if (at && (!existing.lastAt || new Date(at).getTime() > new Date(existing.lastAt).getTime())) {
        existing.lastAt = at;
        existing.lastStatus = r.status;
      }
    }
  }
  return [...map.values()].sort((a, b) => new Date(b.lastAt || 0).getTime() - new Date(a.lastAt || 0).getTime());
});
const patientsCount = computed(() => patients.value.length);

// ---- colunas ----
const agendaColumns = [
  { key: 'scheduled_at', label: 'Quando', sortable: true },
  { key: 'patient', label: 'Paciente' },
  { key: 'status', label: 'Situação' },
  { key: 'amount', label: 'Valor', align: 'right' },
];
const patientColumns = [
  { key: 'name', label: 'Paciente', sortable: true },
  { key: 'visits', label: 'Atendimentos', align: 'right', sortable: true },
  { key: 'lastStatus', label: 'Última situação' },
  { key: 'lastAt', label: 'Último atendimento', sortable: true },
  { key: 'revenue', label: 'Receita', align: 'right', sortable: true },
];
const historyColumns = [
  { key: 'scheduled_at', label: 'Quando', sortable: true },
  { key: 'patient', label: 'Paciente' },
  { key: 'status', label: 'Situação' },
  { key: 'amount', label: 'Valor', align: 'right' },
];

// patch: a agenda/histórico precisam exibir o nome do paciente normalizado
function withPatientName(list) {
  return list.map((r) => ({ ...r, patient: patientNameOf(r) }));
}
const upcomingRows = computed(() => withPatientName(upcoming.value));
const historyRows = computed(() => withPatientName(history.value));

// ---- carregamento ----
async function load() {
  loading.value = true;
  error.value = null;
  try {
    professional.value = (await professionals.get(props.id)) || {};
  } catch (e) {
    error.value = e;
  } finally {
    loading.value = false;
  }
}

async function loadConsultations() {
  metricsLoading.value = true;
  consultError.value = null;
  try {
    // filtra por profissional no servidor; o backend ignora filtros desconhecidos com segurança
    const r = await consultations.list({ professional_id: props.id, pageSize: 200 });
    const rows = Array.isArray(r) ? r : r.data || [];
    // garante o vínculo: só consultas deste profissional (defensivo se o backend não filtrar)
    allConsultations.value = rows.filter((row) => {
      const pid = row.professional_id ?? row.professionalId ?? row.professional ?? null;
      return pid === null || pid === undefined || String(pid) === String(props.id);
    });
  } catch (e) {
    consultError.value = e;
    allConsultations.value = [];
  } finally {
    metricsLoading.value = false;
  }
}

// ---- ações ----
async function changeStatus(nextStatus, message) {
  acting.value = true;
  try {
    const updated = await professionals.update(props.id, { ...professional.value, status: nextStatus });
    professional.value = updated && typeof updated === 'object' ? { ...professional.value, ...updated } : { ...professional.value, status: nextStatus };
    toast.success(message);
  } catch (e) {
    toast.error('Não foi possível atualizar a situação', { detail: e.message, code: e.status });
  } finally {
    acting.value = false;
  }
}

async function suspend() {
  const ok = await confirm({
    title: 'Suspender profissional',
    message: 'Ao suspender, ' + (professional.value.full_name || 'este profissional') + ' deixa de receber novas atribuições e sai da agenda ativa. Confirmar?',
    confirmLabel: 'Suspender',
    danger: true,
  });
  if (!ok) return;
  await changeStatus('suspended', 'Profissional suspenso.');
}

async function reactivate() {
  const ok = await confirm({
    title: 'Reativar profissional',
    message: 'Reativar ' + (professional.value.full_name || 'este profissional') + ' e permitir novas atribuições?',
    confirmLabel: 'Reativar',
  });
  if (!ok) return;
  await changeStatus('active', 'Profissional reativado.');
}

watch(() => props.id, () => { load(); loadConsultations(); });
onMounted(() => { load(); loadConsultations(); });
</script>

<style scoped>
.np-metrics {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
  gap: var(--ui-space-4);
}
.np-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1.1fr);
  gap: var(--ui-space-4);
  align-items: start;
}
.np-kv {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--ui-space-4);
  margin: 0;
}
.np-kv > div {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.np-kv dt {
  color: rgb(var(--ui-muted));
  font-size: var(--ui-text-xs);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  font-weight: 600;
}
.np-kv dd {
  margin: 0;
  font-size: var(--ui-text-md);
  word-break: break-word;
}
.np-link {
  color: rgb(var(--ui-accent-strong));
  text-decoration: none;
  font-weight: 500;
}
.np-link:hover {
  text-decoration: underline;
}
/* Banner informativo: estados administrativos (suspenso/convite) usam --ui-warn,
   não --ui-danger. A tinta danger fica reservada à ação destrutiva (botão Suspender). */
.np-banner {
  display: flex;
  align-items: center;
  gap: var(--ui-space-3);
  padding: var(--ui-space-3) var(--ui-space-4);
  border: 1px solid rgb(var(--ui-border));
  background: rgb(var(--ui-surface));
  color: rgb(var(--ui-fg));
  border-radius: var(--ui-radius-md);
  font-size: var(--ui-text-sm);
}
.np-banner-warn,
.np-banner-info {
  border-color: rgb(var(--ui-warn) / 0.4);
  background: rgb(var(--ui-warn) / 0.1);
}
.np-banner-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: rgb(var(--ui-faint));
  flex-shrink: 0;
}
.np-banner-warn .np-banner-dot,
.np-banner-info .np-banner-dot {
  background: rgb(var(--ui-warn));
}

@media (max-width: 860px) {
  .np-grid {
    grid-template-columns: minmax(0, 1fr);
  }
  .np-kv {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
