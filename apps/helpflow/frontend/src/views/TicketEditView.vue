<template>
  <UiPageLayout
    eyebrow="Chamado"
    :title="pageTitle"
    :subtitle="pageSubtitle"
    width="wide"
    :loading="loading"
    loading-message="Carregando chamado…"
    :error="loadError"
    @retry="load"
  >
    <template #actions>
      <UiButton variant="ghost" :to="backTo">Voltar ao chamado</UiButton>
      <UiButton variant="subtle" type="button" :disabled="!dirty" @click="resetChanges">
        Descartar alterações
      </UiButton>
    </template>

    <template #banner>
      <div v-if="!loading && !loadError && original" class="hf-ctx" role="group" aria-label="Resumo do chamado">
        <span class="hf-ctx-ref">#{{ ticketId }}</span>
        <UiStatusBadge :status="original.status" with-dot />
        <UiStatusBadge :status="original.priority" :tone="priorityTone(original.priority)" with-dot />
        <span class="hf-ctx-meta">Atualizado {{ format.formatDateTime(original.updated_at) }}</span>
        <span v-if="dirty" class="hf-ctx-dirty" role="status">Alterações não salvas</span>
      </div>
    </template>

    <!-- Estado: chamado inexistente (404) — empty distinto do erro recuperável -->
    <UiEmptyState
      v-if="!loading && !loadError && notFound"
      title="Chamado não encontrado"
      description="Este chamado pode ter sido removido ou o endereço está incorreto."
      icon="search"
    >
      <template #action>
        <UiButton :to="listTo">Ver todos os chamados</UiButton>
      </template>
    </UiEmptyState>

    <form v-else-if="!loading && !loadError && original" class="hf-form" novalidate @submit.prevent="onSubmit">
      <div class="hf-grid">
        <div class="hf-col">
          <UiCard title="Conteúdo do chamado" subtitle="Como o atendimento e o solicitante veem o problema.">
            <UiFormSection :columns="1">
              <UiFormField label="Assunto" :required="true" :error="f.errors.subject" :hint="subjectHint">
                <template #default="{ id, describedBy }">
                  <input
                    :id="id"
                    type="text"
                    maxlength="160"
                    autocomplete="off"
                    :aria-describedby="describedBy"
                    :value="f.values.subject"
                    placeholder="Resumo objetivo do problema"
                    @input="f.setField('subject', $event.target.value)"
                  />
                </template>
              </UiFormField>

              <UiFormField label="Descrição" :required="true" :error="f.errors.description" hint="Contexto, passos para reproduzir e impacto.">
                <template #default="{ id, describedBy }">
                  <textarea
                    :id="id"
                    rows="7"
                    :aria-describedby="describedBy"
                    :value="f.values.description"
                    placeholder="Descreva o que aconteceu, quando começou e o que já foi tentado."
                    @input="f.setField('description', $event.target.value)"
                  />
                </template>
              </UiFormField>
            </UiFormSection>
          </UiCard>

          <UiCard title="Triagem e roteamento" subtitle="Defina prioridade, time e quem assume o chamado.">
            <UiFormSection :columns="2">
              <UiFormField label="Prioridade" :required="true" :error="f.errors.priority" hint="Altera o cálculo do prazo de SLA.">
                <template #default="{ id, describedBy }">
                  <select
                    :id="id"
                    :aria-describedby="describedBy"
                    :value="f.values.priority"
                    @change="f.setField('priority', $event.target.value)"
                  >
                    <option v-for="opt in priorityOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
                  </select>
                </template>
              </UiFormField>

              <UiFormField label="Status" :error="f.errors.status" hint="O estado atual do atendimento.">
                <template #default="{ id, describedBy }">
                  <select
                    :id="id"
                    :aria-describedby="describedBy"
                    :value="f.values.status"
                    @change="f.setField('status', $event.target.value)"
                  >
                    <option v-for="opt in statusOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
                  </select>
                </template>
              </UiFormField>

              <UiFormField label="Time / Fila" :error="f.errors.team_id" hint="Fila de atendimento responsável.">
                <template #default="{ id, describedBy }">
                  <div v-if="lookups.loading" class="hf-select-skel" :aria-describedby="describedBy">
                    <span class="ui-spin" aria-hidden="true" />
                    <span class="hf-select-msg">Carregando times…</span>
                  </div>
                  <div v-else-if="lookups.error" class="hf-select-error">
                    <span>Não foi possível carregar os times.</span>
                    <UiButton variant="subtle" size="sm" type="button" @click="loadLookups">Tentar de novo</UiButton>
                  </div>
                  <div v-else-if="!teamOptions.length" class="hf-select-empty">
                    <span class="hf-select-msg">Nenhum time cadastrado.</span>
                    <UiButton variant="ghost" size="sm" to="/teams/new">Criar time</UiButton>
                  </div>
                  <select
                    v-else
                    :id="id"
                    :aria-describedby="describedBy"
                    :value="f.values.team_id"
                    @change="f.setField('team_id', $event.target.value)"
                  >
                    <option value="">— Sem time —</option>
                    <option v-for="t in teamOptions" :key="t.id" :value="t.id">{{ t.label }}</option>
                  </select>
                </template>
              </UiFormField>

              <UiFormField label="Responsável" :error="f.errors.assignee_id" hint="Agente que assume o chamado.">
                <template #default="{ id, describedBy }">
                  <div v-if="lookups.loading" class="hf-select-skel" :aria-describedby="describedBy">
                    <span class="ui-spin" aria-hidden="true" />
                    <span class="hf-select-msg">Carregando agentes…</span>
                  </div>
                  <div v-else-if="lookups.error" class="hf-select-error">
                    <span>Não foi possível carregar os agentes.</span>
                    <UiButton variant="subtle" size="sm" type="button" @click="loadLookups">Tentar de novo</UiButton>
                  </div>
                  <div v-else-if="!agentOptions.length" class="hf-select-empty">
                    <span class="hf-select-msg">Nenhum agente cadastrado.</span>
                    <UiButton variant="ghost" size="sm" to="/agents/new">Cadastrar agente</UiButton>
                  </div>
                  <select
                    v-else
                    :id="id"
                    :aria-describedby="describedBy"
                    :value="f.values.assignee_id"
                    @change="f.setField('assignee_id', $event.target.value)"
                  >
                    <option value="">— Sem responsável —</option>
                    <option v-for="a in agentOptions" :key="a.id" :value="a.id">{{ a.label }}</option>
                  </select>
                </template>
              </UiFormField>

              <UiFormField label="Canal" :error="f.errors.channel" hint="Por onde o chamado entrou.">
                <template #default="{ id, describedBy }">
                  <select
                    :id="id"
                    :aria-describedby="describedBy"
                    :value="f.values.channel"
                    @change="f.setField('channel', $event.target.value)"
                  >
                    <option value="">— Não informado —</option>
                    <option v-for="opt in channelOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
                  </select>
                </template>
              </UiFormField>

              <UiFormField label="Ref. externa" :error="f.errors.external_ref" hint="Código em outro sistema, se houver.">
                <template #default="{ id, describedBy }">
                  <input
                    :id="id"
                    type="text"
                    maxlength="120"
                    autocomplete="off"
                    :aria-describedby="describedBy"
                    :value="f.values.external_ref"
                    placeholder="Ex.: JIRA-4821"
                    @input="f.setField('external_ref', $event.target.value)"
                  />
                </template>
              </UiFormField>
            </UiFormSection>
          </UiCard>
        </div>

        <aside class="hf-col hf-aside">
          <UiCard title="Política de SLA" subtitle="Mudar a prioridade ou a política recalcula o prazo de resolução.">
            <UiFormSection :columns="1">
              <UiFormField label="Política de SLA" :error="f.errors.sla_policy_id" hint="A política aplicada define o prazo de resolução do chamado.">
                <template #default="{ id, describedBy }">
                  <div v-if="lookups.loading" class="hf-select-skel" :aria-describedby="describedBy">
                    <span class="ui-spin" aria-hidden="true" />
                    <span class="hf-select-msg">Carregando políticas…</span>
                  </div>
                  <div v-else-if="lookups.error" class="hf-select-error">
                    <span>Não foi possível carregar as políticas de SLA.</span>
                    <UiButton variant="subtle" size="sm" type="button" @click="loadLookups">Tentar de novo</UiButton>
                  </div>
                  <div v-else-if="!slaOptions.length" class="hf-select-empty">
                    <span class="hf-select-msg">Nenhuma política cadastrada.</span>
                    <UiButton variant="ghost" size="sm" to="/sla-policies/new">Criar política</UiButton>
                  </div>
                  <select
                    v-else
                    :id="id"
                    :aria-describedby="describedBy"
                    :value="f.values.sla_policy_id"
                    @change="f.setField('sla_policy_id', $event.target.value)"
                  >
                    <option value="">— Sem política —</option>
                    <option v-for="s in slaOptions" :key="s.id" :value="s.id">{{ s.label }}</option>
                  </select>
                </template>
              </UiFormField>
            </UiFormSection>

            <dl class="hf-sla">
              <div class="hf-sla-row">
                <dt>Vence em (atual)</dt>
                <dd>{{ format.formatDateTime(original.sla_due_at) }}</dd>
              </div>
              <div class="hf-sla-row" :data-changed="slaWillRecompute ? 'true' : null">
                <dt>Prazo estimado</dt>
                <dd>
                  <span v-if="slaWillRecompute && slaEstimateAvailable" class="hf-sla-new">~{{ format.formatDateTime(projectedSlaDueAt) }}</span>
                  <span v-else-if="slaWillRecompute" class="hf-sla-same">Definido ao salvar</span>
                  <span v-else class="hf-sla-same">Sem alteração</span>
                </dd>
              </div>
            </dl>
            <p v-if="slaWillRecompute" class="hf-sla-note" role="status">
              <template v-if="priorityChanged">
                A prioridade mudou de <strong>{{ priorityLabel(original.priority) }}</strong>
                para <strong>{{ priorityLabel(f.values.priority) }}</strong>.
              </template>
              <template v-if="slaPolicyChanged">
                A política de SLA foi alterada.
              </template>
              <template v-if="slaEstimateAvailable">
                A estimativa acima usa a política <strong>{{ selectedSlaPolicy.name }}</strong>
                ({{ slaResolutionLabel }}). O <strong>prazo definitivo é calculado pelo servidor</strong> ao salvar.
              </template>
              <template v-else>
                O prazo será calculado pelo servidor ao salvar, conforme a política aplicada.
              </template>
            </p>
          </UiCard>

          <UiCard title="Registro" subtitle="Datas do chamado.">
            <dl class="hf-meta">
              <div class="hf-meta-row">
                <dt>Solicitante</dt>
                <dd>{{ original.customer_id != null ? '#' + original.customer_id : '—' }}</dd>
              </div>
              <div class="hf-meta-row">
                <dt>Criado em</dt>
                <dd>{{ format.formatDateTime(original.created_at) }}</dd>
              </div>
              <div class="hf-meta-row">
                <dt>Atualizado em</dt>
                <dd>{{ format.formatDateTime(original.updated_at) }}</dd>
              </div>
            </dl>
          </UiCard>
        </aside>
      </div>

      <!-- SubmitBar: barra de ações fixa ao final, com resumo de mudanças -->
      <div class="hf-submitbar" role="group" aria-label="Ações do formulário">
        <p class="hf-submitbar-status" aria-live="polite">
          <span v-if="!dirty">Nenhuma alteração pendente.</span>
          <span v-else>{{ changeCount }} {{ changeCount === 1 ? 'campo alterado' : 'campos alterados' }}.</span>
        </p>
        <div class="hf-submitbar-actions">
          <UiButton variant="ghost" type="button" :to="backTo">Cancelar</UiButton>
          <UiButton type="submit" :loading="saving" :disabled="!dirty">Revisar e salvar</UiButton>
        </div>
      </div>
    </form>

    <!-- ConfirmDialog: resumo das mudanças + aviso de recálculo de SLA antes de persistir -->
    <UiModal v-model:open="confirmOpen" title="Confirmar alterações" width="md" :persistent="saving">
      <p class="hf-confirm-lead">Revise as mudanças antes de aplicar ao chamado #{{ ticketId }}.</p>
      <ul class="hf-diff">
        <li v-for="d in changeList" :key="d.field" class="hf-diff-item">
          <span class="hf-diff-field">{{ d.label }}</span>
          <span class="hf-diff-from">{{ d.from }}</span>
          <span class="hf-diff-arrow" aria-hidden="true">→</span>
          <span class="hf-diff-to">{{ d.to }}</span>
        </li>
      </ul>
      <div v-if="slaWillRecompute" class="hf-confirm-sla" role="note">
        <span class="hf-confirm-sla-icon" aria-hidden="true">⏱</span>
        <span v-if="slaEstimateAvailable">
          O prazo de SLA será recalculado pelo servidor. Hoje vence
          <strong>{{ format.formatDateTime(original.sla_due_at) }}</strong>;
          a estimativa pela política <strong>{{ selectedSlaPolicy.name }}</strong> é
          <strong>~{{ format.formatDateTime(projectedSlaDueAt) }}</strong>
          — o valor definitivo será confirmado após salvar.
        </span>
        <span v-else>
          O prazo de SLA será recalculado pelo servidor ao salvar, conforme a política aplicada.
          O valor atual (<strong>{{ format.formatDateTime(original.sla_due_at) }}</strong>) pode mudar.
        </span>
      </div>
      <template #footer>
        <UiButton variant="ghost" type="button" :disabled="saving" @click="confirmOpen = false">Voltar</UiButton>
        <UiButton type="button" :loading="saving" @click="persist">Salvar alterações</UiButton>
      </template>
    </UiModal>
  </UiPageLayout>
</template>

<script setup>
import { computed, reactive, ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import {
  UiPageLayout,
  UiCard,
  UiFormSection,
  UiFormField,
  UiStatusBadge,
  UiEmptyState,
  UiModal,
  UiButton,
  useForm,
  useToast,
  useConfirm,
  validators,
  format,
} from '../ui/index.js';
import { tickets, teams, agents, slaPolicies } from '../api.js';

const props = defineProps({ id: { type: [String, Number], default: null } });
const router = useRouter();
const toast = useToast();
const confirm = useConfirm();

const ROUTE_BASE = '/tickets';
const listTo = ROUTE_BASE;
const ticketId = computed(() => props.id != null ? String(props.id) : '');
const backTo = computed(() => ticketId.value ? ROUTE_BASE + '/' + ticketId.value : ROUTE_BASE);

const loading = ref(true);
const saving = ref(false);
const loadError = ref(null);
const notFound = ref(false);
const original = ref(null);
const confirmOpen = ref(false);

// Enums do domínio (tickets) — rótulos pt-BR para uma marca de service desk.
// NÃO há horas chumbadas por prioridade: o prazo de SLA é derivado da política
// real (resolution_mins / business_hours_only) e o número definitivo vem do
// servidor ao salvar. O frontend só exibe uma ESTIMATIVA explícita.
const PRIORITY_META = {
  low: { label: 'Baixa' },
  medium: { label: 'Média' },
  high: { label: 'Alta' },
  urgent: { label: 'Urgente' },
};
const STATUS_LABELS = {
  open: 'Aberto',
  in_progress: 'Em andamento',
  pending: 'Pendente',
  on_hold: 'Em espera',
  resolved: 'Resolvido',
  closed: 'Fechado',
};
const CHANNEL_LABELS = {
  email: 'E-mail',
  portal: 'Portal',
  phone: 'Telefone',
  chat: 'Chat',
  api: 'API',
};

const priorityOptions = Object.keys(PRIORITY_META).map((value) => ({ value, label: PRIORITY_META[value].label }));
const statusOptions = Object.keys(STATUS_LABELS).map((value) => ({ value, label: STATUS_LABELS[value] }));
const channelOptions = Object.keys(CHANNEL_LABELS).map((value) => ({ value, label: CHANNEL_LABELS[value] }));

const priorityLabel = (v) => (PRIORITY_META[v] && PRIORITY_META[v].label) || format.humanize(v) || '—';
const priorityTone = (v) => (v === 'urgent' || v === 'high' ? 'error' : v === 'medium' ? 'warning' : 'neutral');

const f = useForm({
  initial: {
    subject: '',
    description: '',
    priority: 'medium',
    status: 'open',
    channel: '',
    team_id: '',
    assignee_id: '',
    sla_policy_id: '',
    external_ref: '',
  },
  rules: {
    subject: [validators.required('Informe o assunto.'), validators.minLen(3)],
    description: [validators.required('Descreva o chamado.'), validators.minLen(10)],
    priority: [validators.required('Selecione a prioridade.')],
    team_id: [validators.numeric()],
    assignee_id: [validators.numeric()],
    sla_policy_id: [validators.numeric()],
  },
});

// ---- Lookups de roteamento (time / responsável / política de SLA) ----
// Substituem os antigos <input type=number> de IDs decorados: o operador escolhe
// pelo nome. A validação numeric() segue como guarda do payload.
const lookups = reactive({ loading: false, error: '' });
const teamList = ref([]);
const agentList = ref([]);
const slaList = ref([]);

const teamOptions = computed(() => teamList.value.map((t) => ({ id: String(t.id), label: t.name })));
const agentOptions = computed(() =>
  agentList.value.map((a) => ({ id: String(a.id), label: a.name + (a.email ? ' · ' + a.email : '') })),
);
const slaOptions = computed(() => slaList.value.map((s) => ({ id: String(s.id), label: s.name })));

// Política de SLA selecionada no formulário — base do recálculo honesto do prazo.
const selectedSlaPolicy = computed(() => {
  const id = String(f.values.sla_policy_id || '');
  if (!id) return null;
  return slaList.value.find((s) => String(s.id) === id) || null;
});

async function loadLookups() {
  lookups.loading = true;
  lookups.error = '';
  try {
    const [tRes, aRes, sRes] = await Promise.all([
      teams.list({ pageSize: 200, sort: 'name', dir: 'asc' }),
      agents.list({ pageSize: 200, sort: 'name', dir: 'asc' }),
      slaPolicies.list({ pageSize: 100, sort: 'name', dir: 'asc' }),
    ]);
    teamList.value = (tRes && tRes.data) || [];
    agentList.value = (aRes && aRes.data) || [];
    slaList.value = (sRes && sRes.data) || [];
  } catch (e) {
    lookups.error = e && e.message ? e.message : 'Não foi possível carregar as opções de roteamento.';
  } finally {
    lookups.loading = false;
  }
}

const subjectHint = computed(() => {
  const len = (f.values.subject || '').length;
  return len ? len + '/160 caracteres' : 'Resumo curto que identifica o chamado.';
});

// Normaliza valor de input numérico para comparação/payload.
function numOrNull(v) {
  if (v === '' || v === null || v === undefined) return null;
  const n = Number(v);
  return isFinite(n) ? n : null;
}
function toFieldString(v) {
  return v === null || v === undefined ? '' : String(v);
}

function hydrate(rec) {
  original.value = rec;
  f.values.subject = rec.subject || '';
  f.values.description = rec.description || '';
  f.values.priority = rec.priority || 'medium';
  f.values.status = rec.status || 'open';
  f.values.channel = rec.channel || '';
  f.values.team_id = toFieldString(rec.team_id);
  f.values.assignee_id = toFieldString(rec.assignee_id);
  f.values.sla_policy_id = toFieldString(rec.sla_policy_id);
  f.values.external_ref = rec.external_ref || '';
}

async function load() {
  if (!ticketId.value) {
    notFound.value = true;
    loading.value = false;
    return;
  }
  loading.value = true;
  loadError.value = null;
  notFound.value = false;
  try {
    const rec = await tickets.get(ticketId.value);
    if (!rec || rec.id == null) {
      notFound.value = true;
    } else {
      hydrate(rec);
    }
  } catch (e) {
    if (e && e.status === 404) {
      notFound.value = true;
    } else {
      loadError.value = (e && e.message) || 'Não foi possível carregar o chamado.';
    }
  } finally {
    loading.value = false;
  }
}

// Diff entre o estado atual do formulário e o chamado original.
const FIELD_LABELS = {
  subject: 'Assunto',
  description: 'Descrição',
  priority: 'Prioridade',
  status: 'Status',
  channel: 'Canal',
  team_id: 'Time / Fila',
  assignee_id: 'Responsável',
  sla_policy_id: 'Política de SLA',
  external_ref: 'Ref. externa',
};

function displayFor(field, raw) {
  if (raw === '' || raw === null || raw === undefined) return '—';
  if (field === 'priority') return priorityLabel(raw);
  if (field === 'status') return STATUS_LABELS[raw] || format.humanize(raw);
  if (field === 'channel') return CHANNEL_LABELS[raw] || format.humanize(raw);
  if (field === 'description') {
    const s = String(raw);
    return s.length > 60 ? s.slice(0, 57) + '…' : s;
  }
  return String(raw);
}

const changeList = computed(() => {
  const orig = original.value;
  if (!orig) return [];
  const out = [];
  for (const field of Object.keys(FIELD_LABELS)) {
    const isNumeric = field === 'team_id' || field === 'assignee_id' || field === 'sla_policy_id';
    let curr;
    let prev;
    if (isNumeric) {
      curr = numOrNull(f.values[field]);
      prev = orig[field] == null ? null : Number(orig[field]);
    } else {
      curr = (f.values[field] ?? '') === '' ? null : f.values[field];
      prev = (orig[field] ?? '') === '' ? null : orig[field];
    }
    if (curr !== prev) {
      out.push({
        field,
        label: FIELD_LABELS[field],
        from: displayFor(field, isNumeric ? toFieldString(prev) : (prev ?? '')),
        to: displayFor(field, isNumeric ? toFieldString(curr) : (curr ?? '')),
      });
    }
  }
  return out;
});

const dirty = computed(() => changeList.value.length > 0);
const changeCount = computed(() => changeList.value.length);
const priorityChanged = computed(() => !!original.value && f.values.priority !== original.value.priority);
const slaPolicyChanged = computed(() => {
  if (!original.value) return false;
  const a = numOrNull(f.values.sla_policy_id);
  const b = original.value.sla_policy_id == null ? null : Number(original.value.sla_policy_id);
  return a !== b;
});
// O servidor recalcula o prazo quando prioridade OU política mudam.
const slaWillRecompute = computed(() => priorityChanged.value || slaPolicyChanged.value);

// ESTIMATIVA do novo prazo, derivada da POLÍTICA real (resolution_mins /
// business_hours_only) — nunca de horas chumbadas. O número definitivo é o que o
// servidor persiste e a tela relê de update(). Sem política selecionada não há
// estimativa confiável (o servidor usa seu próprio padrão).
const slaEstimateAvailable = computed(() => !!selectedSlaPolicy.value);

// Soma minutos a partir de agora; em janela comercial usa 8h/dia úteis (seg–sex,
// 09–17h). Espelha addSlaMinutes do servidor — é só uma ESTIMATIVA; o prazo
// definitivo é o que o servidor persiste e a tela relê de update().
function estimateDueFrom(mins, businessHoursOnly) {
  const start = new Date();
  if (!businessHoursOnly) { start.setMinutes(start.getMinutes() + mins); return start; }
  const DAY_START = 9, DAY_END = 17;
  const advanceToWindow = (cursor) => {
    let g = 0;
    while (g++ < 4000) {
      const day = cursor.getDay();
      if (day === 0) { cursor.setDate(cursor.getDate() + 1); cursor.setHours(DAY_START, 0, 0, 0); continue; }
      if (day === 6) { cursor.setDate(cursor.getDate() + 2); cursor.setHours(DAY_START, 0, 0, 0); continue; }
      if (cursor.getHours() < DAY_START) { cursor.setHours(DAY_START, 0, 0, 0); continue; }
      if (cursor.getHours() >= DAY_END) { cursor.setDate(cursor.getDate() + 1); cursor.setHours(DAY_START, 0, 0, 0); continue; }
      return cursor;
    }
    return cursor;
  };
  let cursor = new Date(start.getTime());
  let remaining = mins;
  let guard = 0;
  while (remaining > 0 && guard++ < 4000) {
    cursor = advanceToWindow(cursor);
    const endOfDay = new Date(cursor.getTime()); endOfDay.setHours(DAY_END, 0, 0, 0);
    const avail = Math.round((endOfDay.getTime() - cursor.getTime()) / 60000);
    if (remaining <= avail) { cursor.setMinutes(cursor.getMinutes() + remaining); remaining = 0; }
    else { remaining -= avail; cursor = new Date(endOfDay.getTime()); }
  }
  return cursor;
}

const projectedSlaDueAt = computed(() => {
  const pol = selectedSlaPolicy.value;
  if (!pol) return null;
  const mins = Number(pol.resolution_mins);
  if (!isFinite(mins) || mins <= 0) return null;
  return estimateDueFrom(mins, !!pol.business_hours_only).toISOString();
});

// Rótulo humano da resolução da política selecionada (ex.: "8h", "2 dias úteis").
function humanizeMinutes(mins) {
  const n = Number(mins);
  if (!isFinite(n) || n <= 0) return '—';
  if (n < 60) return n + ' min';
  if (n % 1440 === 0) { const d = n / 1440; return d + (d === 1 ? ' dia' : ' dias'); }
  if (n % 60 === 0) { const h = n / 60; return h + (h === 1 ? ' hora' : ' horas'); }
  return Math.floor(n / 60) + 'h ' + (n % 60) + 'min';
}
const slaResolutionLabel = computed(() => {
  const pol = selectedSlaPolicy.value;
  if (!pol) return '';
  const base = 'resolução em ' + humanizeMinutes(pol.resolution_mins);
  return pol.business_hours_only ? base + ', horário comercial' : base + ', 24/7';
});

const pageTitle = computed(() => {
  const subj = (original.value && original.value.subject) || '';
  return subj ? 'Editar: ' + subj : 'Editar chamado';
});
const pageSubtitle = computed(() =>
  ticketId.value ? 'Ajuste os campos do chamado #' + ticketId.value + ' e confirme as mudanças.' : 'Edição do chamado.'
);

function resetChanges() {
  if (original.value) hydrate(original.value);
  toast.info('Alterações descartadas.');
}

async function onSubmit() {
  if (!f.validate()) {
    toast.error('Revise os campos destacados.');
    return;
  }
  if (!dirty.value) {
    toast.info('Nenhuma alteração para salvar.');
    return;
  }
  // Ação com efeito colateral relevante (recalcula SLA) → confirmação dedicada.
  if (slaWillRecompute.value) {
    confirmOpen.value = true;
    return;
  }
  const ok = await confirm({
    title: 'Salvar alterações',
    message: 'Aplicar ' + changeCount.value + (changeCount.value === 1 ? ' alteração' : ' alterações') + ' ao chamado #' + ticketId.value + '?',
    confirmLabel: 'Salvar',
  });
  if (ok) await persist();
}

function buildPayload() {
  const payload = {
    subject: f.values.subject.trim(),
    description: f.values.description.trim(),
    priority: f.values.priority,
    status: f.values.status,
    channel: f.values.channel || null,
    team_id: numOrNull(f.values.team_id),
    assignee_id: numOrNull(f.values.assignee_id),
    sla_policy_id: numOrNull(f.values.sla_policy_id),
    external_ref: f.values.external_ref ? f.values.external_ref.trim() : null,
  };
  return payload;
}

async function persist() {
  if (saving.value) return; // anti-duplo-submit
  const recompute = slaWillRecompute.value; // capturar antes de re-hidratar
  saving.value = true;
  try {
    const updated = await tickets.update(ticketId.value, buildPayload());
    confirmOpen.value = false;
    // Relê o registro retornado por update(): o prazo de SLA exibido a partir de
    // agora é o DEFINITIVO persistido pelo servidor, não a estimativa do front.
    let detail = '';
    if (updated && updated.id != null) {
      hydrate(updated);
      if (recompute && updated.sla_due_at) {
        detail = 'Prazo de SLA agora vence ' + format.formatDateTime(updated.sla_due_at) + '.';
      }
    }
    toast.success('Chamado #' + ticketId.value + ' atualizado.', { detail });
    router.push(backTo.value);
  } catch (e) {
    toast.error((e && e.message) || 'Falha ao salvar o chamado.', { code: e && e.status ? 'HTTP ' + e.status : '' });
  } finally {
    saving.value = false;
  }
}

onMounted(() => {
  loadLookups();
  load();
});
</script>

<style scoped>
.hf-ctx {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--ui-space-3);
  padding: var(--ui-space-3) var(--ui-space-4);
  background: rgb(var(--ui-surface-2));
  border: 1px solid rgb(var(--ui-border));
  border-radius: var(--ui-radius-md);
}
.hf-ctx-ref {
  font-family: var(--ui-font-display);
  font-weight: 700;
  color: rgb(var(--ui-fg));
}
.hf-ctx-meta {
  font-size: var(--ui-text-sm);
  color: rgb(var(--ui-muted));
}
.hf-ctx-dirty {
  margin-left: auto;
  font-size: var(--ui-text-xs);
  font-weight: 700;
  color: rgb(var(--ui-warn));
  background: rgb(var(--ui-warn) / 0.14);
  padding: 3px 10px;
  border-radius: var(--ui-radius-pill);
}

.hf-form {
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-5);
}

/* Estados dos selects de lookup (time / responsável / política de SLA) */
.hf-select-skel,
.hf-select-error,
.hf-select-empty {
  display: flex;
  align-items: center;
  gap: var(--ui-space-3);
  min-height: 40px;
  padding: var(--ui-space-2) var(--ui-space-3);
  border: 1px dashed rgb(var(--ui-border-strong));
  border-radius: var(--ui-radius-sm);
  font-size: var(--ui-text-sm);
  flex-wrap: wrap;
}
.hf-select-skel {
  color: rgb(var(--ui-muted));
}
.hf-select-empty {
  justify-content: space-between;
}
.hf-select-error {
  border-style: solid;
  border-color: rgb(var(--ui-danger) / 0.4);
  background: rgb(var(--ui-danger) / 0.06);
  color: rgb(var(--ui-danger));
  justify-content: space-between;
}
.hf-select-msg {
  color: rgb(var(--ui-muted));
}

.hf-grid {
  display: grid;
  grid-template-columns: minmax(0, 2fr) minmax(0, 1fr);
  gap: var(--ui-space-5);
  align-items: start;
}
.hf-col {
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-5);
  min-width: 0;
}
.hf-aside {
  position: sticky;
  top: var(--ui-space-4);
}

.hf-sla,
.hf-meta {
  margin: var(--ui-space-4) 0 0;
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-2);
}
.hf-sla-row,
.hf-meta-row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--ui-space-3);
  padding-bottom: var(--ui-space-2);
  border-bottom: 1px solid rgb(var(--ui-border));
}
.hf-sla-row:last-child,
.hf-meta-row:last-child {
  border-bottom: none;
  padding-bottom: 0;
}
.hf-sla-row dt,
.hf-meta-row dt {
  font-size: var(--ui-text-sm);
  color: rgb(var(--ui-muted));
}
.hf-sla-row dd,
.hf-meta-row dd {
  margin: 0;
  font-weight: 600;
  color: rgb(var(--ui-fg));
  text-align: right;
}
.hf-sla-row[data-changed="true"] dd {
  color: rgb(var(--ui-accent-strong));
}
.hf-sla-new {
  color: rgb(var(--ui-accent-strong));
}
.hf-sla-same {
  color: rgb(var(--ui-muted));
  font-weight: 500;
}
.hf-sla-note {
  margin: var(--ui-space-3) 0 0;
  font-size: var(--ui-text-sm);
  color: rgb(var(--ui-fg));
  background: rgb(var(--ui-accent) / 0.10);
  border: 1px solid rgb(var(--ui-accent) / 0.30);
  border-radius: var(--ui-radius-md);
  padding: var(--ui-space-3);
}

.hf-submitbar {
  position: sticky;
  bottom: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ui-space-4);
  flex-wrap: wrap;
  padding: var(--ui-space-3) var(--ui-space-4);
  background: rgb(var(--ui-surface));
  border: 1px solid rgb(var(--ui-border));
  border-radius: var(--ui-radius-lg);
  box-shadow: var(--ui-shadow-md);
}
.hf-submitbar-status {
  margin: 0;
  font-size: var(--ui-text-sm);
  color: rgb(var(--ui-muted));
}
.hf-submitbar-actions {
  display: flex;
  gap: var(--ui-space-2);
  flex-wrap: wrap;
}

.hf-confirm-lead {
  margin: 0 0 var(--ui-space-3);
  color: rgb(var(--ui-muted));
}
.hf-diff {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-2);
}
.hf-diff-item {
  display: grid;
  grid-template-columns: minmax(96px, auto) 1fr auto 1fr;
  align-items: center;
  gap: var(--ui-space-3);
  padding: var(--ui-space-2) var(--ui-space-3);
  background: rgb(var(--ui-surface-2));
  border-radius: var(--ui-radius-sm);
  font-size: var(--ui-text-sm);
}
.hf-diff-field {
  font-weight: 700;
  color: rgb(var(--ui-fg));
}
.hf-diff-from {
  color: rgb(var(--ui-muted));
  text-decoration: line-through;
}
.hf-diff-arrow {
  color: rgb(var(--ui-faint));
}
.hf-diff-to {
  color: rgb(var(--ui-accent-strong));
  font-weight: 600;
}
.hf-confirm-sla {
  display: flex;
  align-items: flex-start;
  gap: var(--ui-space-2);
  margin-top: var(--ui-space-4);
  padding: var(--ui-space-3);
  font-size: var(--ui-text-sm);
  color: rgb(var(--ui-fg));
  background: rgb(var(--ui-warn) / 0.12);
  border: 1px solid rgb(var(--ui-warn) / 0.30);
  border-radius: var(--ui-radius-md);
}
.hf-confirm-sla-icon {
  font-size: var(--ui-text-lg);
  line-height: 1.2;
}

@media (max-width: 960px) {
  .hf-grid {
    grid-template-columns: 1fr;
  }
  .hf-aside {
    position: static;
  }
}
@media (max-width: 640px) {
  .hf-diff-item {
    grid-template-columns: 1fr;
    gap: var(--ui-space-1);
  }
  .hf-diff-from {
    text-decoration: none;
  }
}
</style>
