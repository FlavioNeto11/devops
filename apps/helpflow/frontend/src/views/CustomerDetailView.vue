<template>
  <UiPageLayout
    width="wide"
    eyebrow="Solicitante"
    :title="pageTitle"
    :subtitle="pageSubtitle"
    :loading="loading"
    loading-message="Carregando o solicitante…"
    :error="loadErrorMessage"
    @retry="loadCustomer"
  >
    <!-- ====================== Ações de cabeçalho ====================== -->
    <template #actions>
      <UiButton variant="ghost" to="/customers">
        <template #icon-left><span class="cd-ic" aria-hidden="true">‹</span></template>
        Voltar
      </UiButton>
      <UiButton
        variant="ghost"
        :loading="refreshing"
        :disabled="!customer || loading"
        @click="refreshAll"
      >Atualizar</UiButton>
      <UiButton variant="subtle" :to="editRoute" :disabled="!customer">Editar</UiButton>
      <UiButton
        v-if="customer && isActive"
        variant="danger"
        :disabled="working"
        @click="deactivate"
      >Inativar</UiButton>
      <UiButton
        v-else-if="customer"
        variant="primary"
        :disabled="working"
        @click="reactivate"
      >Reativar</UiButton>
    </template>

    <!-- ====================== Estado: não encontrado ====================== -->
    <UiEmptyState
      v-if="!customer && !loading && !loadError"
      icon="search"
      title="Solicitante não encontrado"
      description="O cadastro pode ter sido removido ou o endereço está incorreto."
    >
      <template #action>
        <UiButton to="/customers">Ver solicitantes</UiButton>
      </template>
    </UiEmptyState>

    <!-- ====================== Estado normal ====================== -->
    <template v-else-if="customer">
      <!-- EntityHeader -->
      <UiCard>
        <div class="cd-head">
          <div class="cd-identity">
            <span class="cd-avatar" :data-vip="isVip ? 'true' : null" aria-hidden="true">{{ initials }}</span>
            <div class="cd-identity-text">
              <div class="cd-name-row">
                <h2 class="cd-name">{{ displayName }}</h2>
                <UiStatusBadge :status="statusValue" :label="statusLabelText" size="lg" />
                <UiStatusBadge v-if="isVip" status="vip" tone="warning" label="VIP" size="lg" :with-dot="true" />
              </div>
              <p class="cd-org">{{ orgLine }}</p>
              <p class="cd-contact-row">
                <a v-if="emailHref" class="cd-contact-link" :href="emailHref">
                  <span class="cd-ic" aria-hidden="true">✉</span>{{ customer.email }}
                </a>
                <a v-if="phoneHref" class="cd-contact-link" :href="phoneHref">
                  <span class="cd-ic" aria-hidden="true">☎</span>{{ customer.phone }}
                </a>
                <span class="cd-since">Cliente desde {{ createdShort }}</span>
              </p>
            </div>
          </div>
          <div class="cd-head-actions">
            <UiButton variant="primary" @click="openQuickTicket">
              <template #icon-left><span class="cd-ic" aria-hidden="true">＋</span></template>
              Abrir chamado em nome dele
            </UiButton>
            <UiButton v-if="emailHref" variant="subtle" size="sm" :href="emailHref">Enviar e-mail</UiButton>
            <UiButton v-if="phoneHref" variant="ghost" size="sm" :href="phoneHref">Ligar</UiButton>
          </div>
        </div>
      </UiCard>

      <!-- Métricas (total/aberto/em andamento/resolvido) -->
      <section class="cd-metrics" role="group" aria-label="Métricas de chamados do solicitante">
        <UiMetricCard
          label="Total de chamados"
          :value="metrics.total"
          :loading="ticketsLoading"
          tone="primary"
          hint="Histórico completo"
          clickable
          :aria-label="'Ver histórico — ' + metrics.total + ' chamado(s)'"
          @click="scrollToTickets"
        />
        <UiMetricCard
          label="Em aberto"
          :value="metrics.open"
          :loading="ticketsLoading"
          :tone="metrics.open > 0 ? 'warning' : 'neutral'"
          hint="Aguardando atendimento"
        />
        <UiMetricCard
          label="Em andamento"
          :value="metrics.inProgress"
          :loading="ticketsLoading"
          :tone="metrics.inProgress > 0 ? 'running' : 'neutral'"
          hint="Sendo tratados agora"
        />
        <UiMetricCard
          label="Resolvidos"
          :value="metrics.resolved"
          :loading="ticketsLoading"
          tone="success"
          :hint="resolvedHint"
        />
      </section>

      <div class="cd-grid">
        <!-- Coluna lateral: PropertiesGrid -->
        <div class="cd-col-side">
          <UiCard title="Dados do solicitante" subtitle="Contato e perfil.">
            <dl class="cd-dl">
              <div v-for="p in properties" :key="p.label" class="cd-dl-row" :data-wide="p.wide ? 'true' : null">
                <dt class="cd-dl-label">{{ p.label }}</dt>
                <dd class="cd-dl-value">
                  <UiStatusBadge
                    v-if="p.kind === 'status'"
                    :status="p.value"
                    :label="statusLabelText"
                  />
                  <UiStatusBadge
                    v-else-if="p.kind === 'bool'"
                    :status="p.value ? 'sim' : 'nao'"
                    :tone="p.value ? 'warning' : 'neutral'"
                    :label="p.value ? 'Sim' : 'Não'"
                  />
                  <a v-else-if="p.kind === 'email' && emailHref" :href="emailHref">{{ p.value }}</a>
                  <a v-else-if="p.kind === 'phone' && phoneHref" :href="phoneHref">{{ p.value }}</a>
                  <span v-else-if="p.kind === 'notes'" class="cd-notes">{{ p.display }}</span>
                  <span v-else :class="{ 'cd-dash': p.empty, 'cd-mono': p.mono }">{{ p.display }}</span>
                </dd>
              </div>
            </dl>
          </UiCard>

          <!-- Atalhos de atendimento -->
          <UiCard title="Atalhos" subtitle="Ações rápidas para este solicitante.">
            <div class="cd-quick-actions">
              <button type="button" class="cd-action" @click="openQuickTicket">
                <span class="cd-action-ic" aria-hidden="true">＋</span>
                <span class="cd-action-text">
                  <span class="cd-action-title">Abrir chamado</span>
                  <span class="cd-action-sub">Registrar um ticket em nome dele</span>
                </span>
              </button>
              <RouterLink class="cd-action" :to="editRoute">
                <span class="cd-action-ic" aria-hidden="true">✎</span>
                <span class="cd-action-text">
                  <span class="cd-action-title">Editar cadastro</span>
                  <span class="cd-action-sub">Atualizar contato e perfil</span>
                </span>
              </RouterLink>
              <RouterLink class="cd-action" to="/tickets">
                <span class="cd-action-ic" aria-hidden="true">≣</span>
                <span class="cd-action-text">
                  <span class="cd-action-title">Fila de chamados</span>
                  <span class="cd-action-sub">Ver todos os chamados do desk</span>
                </span>
              </RouterLink>
            </div>
          </UiCard>
        </div>

        <!-- Coluna principal: RelatedTicketsList -->
        <div class="cd-col-main">
          <UiCard title="Histórico de chamados" :subtitle="ticketsSubtitle">
            <template #actions>
              <UiButton variant="ghost" size="sm" :loading="ticketsLoading" @click="loadTickets">Atualizar</UiButton>
              <UiButton variant="subtle" size="sm" @click="openQuickTicket">Novo chamado</UiButton>
            </template>

            <div ref="ticketsAnchor" tabindex="-1" class="cd-tickets-anchor">
              <UiDataTable
                :columns="ticketColumns"
                :rows="tickets"
                row-key="id"
                :loading="ticketsLoading"
                :error="ticketsErrorMessage"
                clickable-rows
                density="comfortable"
                :empty="ticketsEmpty"
                @row-click="openTicket"
                @retry="loadTickets"
              >
                <template #cell-subject="{ row }">
                  <span class="cd-ticket">
                    <span class="cd-ticket-subject">{{ ticketSubject(row) }}</span>
                    <span class="cd-ticket-id">#{{ row.id }}</span>
                  </span>
                </template>
                <template #cell-priority="{ row }">
                  <UiStatusBadge
                    :status="ticketPriority(row)"
                    :tone="priorityTone(ticketPriority(row))"
                    :label="priorityLabel(ticketPriority(row))"
                  />
                </template>
                <template #cell-status="{ row }">
                  <UiStatusBadge :status="ticketStatus(row)" :label="ticketStatusLabel(row)" />
                </template>
                <template #cell-created_at="{ row }">
                  <span class="cd-time">{{ ticketCreated(row) }}</span>
                </template>
                <template #empty-action>
                  <UiButton variant="primary" size="sm" @click="openQuickTicket">Abrir chamado em nome dele</UiButton>
                </template>
              </UiDataTable>
            </div>
          </UiCard>
        </div>
      </div>
    </template>

    <!-- ====================== QuickActionButton → modal de criação ====================== -->
    <UiModal
      v-model:open="quickOpen"
      title="Abrir chamado em nome do solicitante"
      width="md"
      :persistent="quick.submitting.value"
    >
      <p class="cd-quick-intro">
        Você abrirá um chamado em nome de <strong>{{ displayName }}</strong>. Preencha o essencial — o
        restante pode ser ajustado no detalhe do chamado.
      </p>
      <form class="cd-quick-form" novalidate @submit.prevent="submitQuickTicket">
        <UiFormField label="Assunto" required :error="quick.errors.subject" hint="Resuma o problema em uma frase.">
          <template #default="{ id, describedBy }">
            <input
              :id="id"
              :aria-describedby="describedBy"
              type="text"
              :value="quick.values.subject"
              maxlength="160"
              autocomplete="off"
              placeholder="Ex.: Não consigo acessar minha conta"
              @input="quick.setField('subject', $event.target.value)"
            />
          </template>
        </UiFormField>
        <UiFormField label="Prioridade" :error="quick.errors.priority" hint="Define a meta de SLA.">
          <template #default="{ id, describedBy }">
            <select
              :id="id"
              :aria-describedby="describedBy"
              :value="quick.values.priority"
              @change="quick.setField('priority', $event.target.value)"
            >
              <option v-for="opt in priorityOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
            </select>
          </template>
        </UiFormField>
        <UiFormField label="Descrição" :error="quick.errors.description" hint="Opcional. Contexto inicial para o agente.">
          <template #default="{ id, describedBy }">
            <textarea
              :id="id"
              :aria-describedby="describedBy"
              :value="quick.values.description"
              rows="4"
              maxlength="2000"
              placeholder="Detalhes do que aconteceu, mensagens de erro, passos para reproduzir…"
              @input="quick.setField('description', $event.target.value)"
            ></textarea>
          </template>
        </UiFormField>
      </form>
      <template #footer>
        <UiButton variant="ghost" :disabled="quick.submitting.value" @click="quickOpen = false">Cancelar</UiButton>
        <UiButton variant="primary" :loading="quick.submitting.value" @click="submitQuickTicket">Abrir chamado</UiButton>
      </template>
    </UiModal>
  </UiPageLayout>
</template>

<script setup>
import { ref, computed, watch, onMounted } from 'vue';
import { useRoute, useRouter, RouterLink } from 'vue-router';
import {
  UiPageLayout,
  UiCard,
  UiButton,
  UiMetricCard,
  UiStatusBadge,
  UiDataTable,
  UiEmptyState,
  UiModal,
  UiFormField,
  useForm,
  useToast,
  useConfirm,
  validators,
  format,
  resolveTone,
} from '../ui/index.js';
// Recursos REST de DOMÍNIO:
//  - customers        → GET/PUT /v1/customers/:id (carregar, inativar, reativar)
//  - customerTickets  → GET /v1/customers/:id/tickets (histórico do solicitante)
//  - tickets          → POST /v1/tickets (abertura rápida de chamado)
import { customers as customersApi, tickets as ticketsApi, customerTickets as customerTicketsApi } from '../api.js';

const route = useRoute();
const router = useRouter();
const toast = useToast();
const ask = useConfirm();

const customerId = computed(() => String(route.params.id ?? ''));
const editRoute = computed(() => '/customers/' + customerId.value + '/edit');

/* ----------------------------- Carga do solicitante ----------------------------- */
const customer = ref(null);
const loading = ref(true);
const loadError = ref(null);
const refreshing = ref(false);
const working = ref(false);

const loadErrorMessage = computed(() => (loadError.value ? (loadError.value.message || 'Falha ao carregar o solicitante.') : null));

async function loadCustomer() {
  loading.value = true;
  loadError.value = null;
  try {
    const data = await customersApi.get(customerId.value);
    customer.value = data && data.data !== undefined ? data.data : data || null;
  } catch (e) {
    if (e && e.status === 404) {
      customer.value = null; // cai no estado "não encontrado"
    } else {
      loadError.value = e;
    }
  } finally {
    loading.value = false;
  }
}

/* ----------------------------- Derivações de perfil ----------------------------- */
const displayName = computed(() => {
  const c = customer.value;
  if (!c) return '';
  return c.name || c.full_name || c.email || ('Solicitante #' + customerId.value);
});
const initials = computed(() => {
  const n = displayName.value.trim();
  if (!n) return '?';
  const parts = n.split(/\s+/).filter(Boolean);
  const a = parts[0] && parts[0][0] ? parts[0][0] : '';
  const b = parts.length > 1 ? parts[parts.length - 1][0] : '';
  return (a + b).toUpperCase() || n[0].toUpperCase();
});
const isVip = computed(() => !!(customer.value && customer.value.vip));
const statusValue = computed(() => (customer.value && customer.value.status) || 'active');
const isActive = computed(() => String(statusValue.value).toLowerCase() !== 'inactive');
const statusLabelText = computed(() => (isActive.value ? 'Ativo' : 'Inativo'));
const orgLine = computed(() => {
  const c = customer.value;
  if (!c) return '';
  return c.organization || 'Sem organização vinculada';
});
const createdShort = computed(() => format.formatDate(customer.value && customer.value.created_at));
const emailHref = computed(() => (customer.value && customer.value.email ? 'mailto:' + customer.value.email : null));
const phoneHref = computed(() => {
  const ph = customer.value && customer.value.phone;
  if (!ph) return null;
  return 'tel:' + String(ph).replace(/[^\d+]/g, '');
});

const pageTitle = computed(() => (customer.value ? displayName.value : 'Detalhe do solicitante'));
const pageSubtitle = computed(() =>
  customer.value
    ? 'Perfil, histórico de chamados e atalhos de atendimento.'
    : 'Perfil do solicitante e seu histórico de chamados.'
);

const properties = computed(() => {
  const c = customer.value || {};
  return [
    { label: 'Nome', kind: 'text', value: c.name, display: format.formatValue(c.name), empty: !c.name },
    { label: 'E-mail', kind: 'email', value: c.email, display: format.formatValue(c.email), empty: !c.email },
    { label: 'Telefone', kind: 'phone', value: c.phone, display: format.formatValue(c.phone), empty: !c.phone },
    { label: 'Organização', kind: 'text', value: c.organization, display: format.formatValue(c.organization), empty: !c.organization },
    { label: 'VIP', kind: 'bool', value: !!c.vip },
    { label: 'Situação', kind: 'status', value: statusValue.value },
    { label: 'Criado em', kind: 'text', value: c.created_at, display: format.formatDateTime(c.created_at), empty: !c.created_at },
    { label: 'ID', kind: 'text', value: c.id, display: format.formatValue(c.id), mono: true, empty: c.id == null },
    { label: 'Observações', kind: 'notes', value: c.notes, display: c.notes || '—', wide: true },
  ];
});

/* ----------------------------- Histórico de chamados ----------------------------- */
const tickets = ref([]);
const ticketsLoading = ref(false);
const ticketsError = ref(null);
const ticketsAnchor = ref(null);

const ticketsErrorMessage = computed(() => (ticketsError.value ? (ticketsError.value.message || 'Não foi possível carregar os chamados.') : null));

const ticketColumns = [
  { key: 'subject', label: 'Assunto', sortable: true },
  { key: 'priority', label: 'Prioridade', align: 'center' },
  { key: 'status', label: 'Situação', align: 'center' },
  { key: 'created_at', label: 'Aberto em', align: 'right', sortable: true },
];

const ticketsEmpty = {
  title: 'Nenhum chamado ainda',
  description: 'Este solicitante ainda não abriu chamados. Abra o primeiro em nome dele.',
  icon: 'inbox',
};

// Guard client-side: reafirma o escopo pelo campo canônico `customer_id`.
// Se o backend devolver um registro fora do escopo, a lista fica vazia em vez de
// exibir dados de outro solicitante.
function belongsToCustomer(t) {
  return String(t.customer_id ?? '') === customerId.value;
}

async function loadTickets() {
  if (!customerId.value) return;
  ticketsLoading.value = true;
  ticketsError.value = null;
  try {
    const res = await customerTicketsApi(customerId.value, { pageSize: 100, sort: 'created_at', dir: 'desc' });
    const rows = Array.isArray(res) ? res : (res && res.data ? res.data : []);
    tickets.value = rows.filter(belongsToCustomer);
  } catch (e) {
    ticketsError.value = e;
    tickets.value = [];
  } finally {
    ticketsLoading.value = false;
  }
}

function ticketSubject(t) {
  return t.subject || t.title || t.summary || ('Chamado #' + (t.id ?? '—'));
}
function ticketStatus(t) {
  return t.status || t.state || 'open';
}
function ticketPriority(t) {
  return t.priority || 'medium';
}
function ticketCreated(t) {
  const v = t.created_at || t.createdAt || t.updated_at;
  return v ? format.formatDateTime(v) : '—';
}

const TICKET_STATUS_LABEL = {
  open: 'Aberto', in_progress: 'Em andamento', pending: 'Pendente',
  on_hold: 'Em espera', waiting: 'Aguardando', resolved: 'Resolvido', closed: 'Encerrado',
};
function ticketStatusLabel(t) {
  const s = String(ticketStatus(t)).toLowerCase();
  return TICKET_STATUS_LABEL[s] || format.humanize(ticketStatus(t));
}

const PRIORITY_TONE = {
  urgent: 'error', critical: 'error', high: 'warning', alta: 'warning',
  medium: 'running', normal: 'running', media: 'running',
  low: 'neutral', baixa: 'neutral',
};
const PRIORITY_LABEL = {
  urgent: 'Urgente', critical: 'Crítica', high: 'Alta', alta: 'Alta',
  medium: 'Média', normal: 'Normal', media: 'Média', low: 'Baixa', baixa: 'Baixa',
};
function priorityTone(p) {
  return PRIORITY_TONE[String(p).toLowerCase()] || 'neutral';
}
function priorityLabel(p) {
  return PRIORITY_LABEL[String(p).toLowerCase()] || format.humanize(p);
}

// Deriva o estágio do chamado pelo TOM canônico do kit (status-map) — sem manter
// um mapa de status chumbado na view. 'success' → resolvido; tons de trabalho em
// curso → aberto/andamento; o resto cai em "outros" e NÃO infla "em aberto".
const IN_PROGRESS = new Set(['in_progress', 'em andamento', 'progress', 'processing', 'running', 'processando']);
function ticketStage(t) {
  const raw = String(ticketStatus(t)).toLowerCase().trim();
  const tone = resolveTone(raw);
  if (tone === 'success') return 'resolved';
  if (IN_PROGRESS.has(raw) || tone === 'running') return 'in_progress';
  if (tone === 'warning') return 'open';
  return 'other';
}

const metrics = computed(() => {
  let open = 0;
  let inProgress = 0;
  let resolved = 0;
  let other = 0;
  for (const t of tickets.value) {
    const stage = ticketStage(t);
    if (stage === 'resolved') resolved += 1;
    else if (stage === 'in_progress') inProgress += 1;
    else if (stage === 'open') open += 1;
    else other += 1;
  }
  return { total: tickets.value.length, open, inProgress, resolved, other };
});

const resolvedHint = computed(() => {
  const m = metrics.value;
  if (!m.total) return 'Encerrados';
  const pct = Math.round((m.resolved / m.total) * 100);
  return pct + '% do histórico';
});

const ticketsSubtitle = computed(() => {
  if (ticketsLoading.value) return 'Carregando chamados…';
  if (ticketsError.value) return 'Não foi possível carregar.';
  const n = tickets.value.length;
  if (n === 0) return 'Nenhum chamado registrado.';
  return n === 1 ? '1 chamado encontrado.' : n + ' chamados encontrados.';
});

function openTicket(row) {
  router.push('/tickets/' + row.id);
}

function scrollToTickets() {
  const el = ticketsAnchor.value;
  if (el && el.scrollIntoView) {
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    if (el.focus) el.focus({ preventScroll: true });
  }
}

/* ----------------------------- QuickAction: abrir chamado ----------------------------- */
const quickOpen = ref(false);
const priorityOptions = [
  { value: 'low', label: 'Baixa' },
  { value: 'medium', label: 'Média' },
  { value: 'high', label: 'Alta' },
  { value: 'critical', label: 'Crítica' },
];

const quick = useForm({
  initial: { subject: '', priority: 'medium', description: '' },
  rules: {
    subject: [validators.required('Informe o assunto.'), validators.minLen(4, 'Descreva melhor o assunto.')],
  },
});

function openQuickTicket() {
  if (!customer.value) return;
  quick.reset();
  quickOpen.value = true;
}

async function submitQuickTicket() {
  await quick.handleSubmit(async (values) => {
    try {
      const created = await ticketsApi.create({
        subject: values.subject.trim(),
        priority: values.priority,
        description: (values.description || '').trim(),
        customer_id: customerId.value,
      });
      const newId = (created && (created.id ?? (created.data && created.data.id))) || null;
      toast.success('Chamado aberto em nome de ' + displayName.value + '.');
      quickOpen.value = false;
      if (newId != null) router.push('/tickets/' + newId);
      else loadTickets();
    } catch (e) {
      toast.error('Falha ao abrir o chamado.', { detail: (e && e.message) || '', code: e && e.status });
    }
  })();
}

/* ----------------------------- Mudança de situação (ação sensível) ----------------------------- */
function whoLabel() {
  const c = customer.value;
  return c ? (c.name || c.email || ('#' + c.id)) : '';
}

async function deactivate() {
  if (!customer.value) return;
  const ok = await ask({
    title: 'Inativar solicitante',
    message: 'Inativar "' + whoLabel() + '"? Ele deixará de abrir novos chamados, mas o histórico é preservado.',
    confirmLabel: 'Inativar',
    danger: true,
  });
  if (!ok) return;
  working.value = true;
  try {
    await customersApi.update(customer.value.id, { ...customer.value, status: 'inactive' });
    toast.success('Solicitante inativado.', { detail: whoLabel() });
    await loadCustomer();
  } catch (e) {
    toast.error('Falha ao inativar.', { detail: (e && e.message) || 'Tente novamente.', code: e && e.status });
  } finally {
    working.value = false;
  }
}

async function reactivate() {
  if (!customer.value) return;
  working.value = true;
  try {
    await customersApi.update(customer.value.id, { ...customer.value, status: 'active' });
    toast.success('Solicitante reativado.', { detail: whoLabel() });
    await loadCustomer();
  } catch (e) {
    toast.error('Falha ao reativar.', { detail: (e && e.message) || 'Tente novamente.', code: e && e.status });
  } finally {
    working.value = false;
  }
}

/* ----------------------------- Ciclo de vida ----------------------------- */
async function refreshAll() {
  refreshing.value = true;
  await loadCustomer();
  if (customer.value) await loadTickets();
  refreshing.value = false;
}

async function bootstrap() {
  loading.value = true;
  await loadCustomer();
  loading.value = false;
  if (customer.value) loadTickets();
}

watch(customerId, bootstrap);
onMounted(bootstrap);
</script>

<style scoped>
.cd-ic {
  font-size: 1.05em;
  line-height: 1;
}

/* ----- EntityHeader ----- */
.cd-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--ui-space-5);
  flex-wrap: wrap;
}
.cd-identity {
  display: flex;
  align-items: center;
  gap: var(--ui-space-4);
  min-width: 0;
}
.cd-avatar {
  flex-shrink: 0;
  /* tamanho fixo do avatar: primitivo de layout (o kit não expõe token de tamanho) */
  width: 64px;
  height: 64px;
  border-radius: var(--ui-radius-pill);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-family: var(--ui-font-display);
  font-weight: 700;
  font-size: 1.4rem;
  letter-spacing: .02em;
  color: rgb(var(--ui-accent-fg));
  background: rgb(var(--ui-accent));
  box-shadow: var(--ui-shadow-sm);
}
.cd-avatar[data-vip="true"] {
  background: rgb(var(--ui-warn));
  color: rgb(var(--ui-bg));
}
.cd-identity-text {
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-1);
  min-width: 0;
}
.cd-name-row {
  display: flex;
  align-items: center;
  gap: var(--ui-space-2);
  flex-wrap: wrap;
}
.cd-name {
  font-size: 1.45rem;
  margin: 0;
  word-break: break-word;
}
.cd-org {
  margin: 0;
  color: rgb(var(--ui-muted));
  font-size: var(--ui-text-sm);
  word-break: break-word;
}
.cd-contact-row {
  margin: var(--ui-space-1) 0 0;
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--ui-space-2) var(--ui-space-4);
  font-size: var(--ui-text-sm);
}
.cd-contact-link {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: rgb(var(--ui-accent-strong));
  text-decoration: none;
}
.cd-contact-link:hover {
  text-decoration: underline;
}
.cd-since {
  color: rgb(var(--ui-muted));
}
.cd-head-actions {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: var(--ui-space-2);
  flex-shrink: 0;
}

/* ----- Métricas ----- */
.cd-metrics {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: var(--ui-space-4);
}

/* ----- Layout principal (props + tickets) ----- */
.cd-grid {
  display: grid;
  grid-template-columns: minmax(300px, 5fr) minmax(360px, 8fr);
  gap: var(--ui-space-4);
  align-items: start;
}
.cd-col-side,
.cd-col-main {
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-4);
  min-width: 0;
}

/* ----- PropertiesGrid (lista de definições) ----- */
.cd-dl {
  margin: 0;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--ui-space-4);
}
.cd-dl-row {
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-1);
  min-width: 0;
}
.cd-dl-row[data-wide="true"] {
  grid-column: 1 / -1;
}
.cd-dl-label {
  font-size: var(--ui-text-xs);
  text-transform: uppercase;
  letter-spacing: .04em;
  color: rgb(var(--ui-muted));
  font-weight: 600;
}
.cd-dl-value {
  margin: 0;
  font-size: var(--ui-text-sm);
  color: rgb(var(--ui-fg));
  word-break: break-word;
}
.cd-dl-value a {
  color: rgb(var(--ui-accent-strong));
}
.cd-notes {
  white-space: pre-wrap;
  line-height: 1.5;
}
.cd-dash {
  color: rgb(var(--ui-muted));
  font-style: italic;
}
.cd-mono {
  font-family: var(--ui-font-mono);
  font-size: var(--ui-text-xs);
  color: rgb(var(--ui-muted));
}

/* ----- Atalhos de atendimento ----- */
.cd-quick-actions {
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-2);
}
.cd-action {
  display: flex;
  align-items: center;
  gap: var(--ui-space-3);
  width: 100%;
  text-align: left;
  text-decoration: none;
  font: inherit;
  cursor: pointer;
  padding: var(--ui-space-3);
  border: 1px solid rgb(var(--ui-border));
  border-radius: var(--ui-radius-md);
  background: rgb(var(--ui-surface-2));
  color: rgb(var(--ui-fg));
  transition: border-color .15s ease, background .15s ease;
}
.cd-action:hover {
  border-color: rgb(var(--ui-accent));
  background: rgb(var(--ui-accent) / 0.08);
}
.cd-action-ic {
  flex-shrink: 0;
  width: 32px;
  height: 32px;
  border-radius: var(--ui-radius-md);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 1.1rem;
  background: rgb(var(--ui-accent) / 0.14);
  color: rgb(var(--ui-accent-strong));
}
.cd-action-text {
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.cd-action-title {
  font-weight: 600;
  font-size: var(--ui-text-sm);
}
.cd-action-sub {
  font-size: var(--ui-text-xs);
  color: rgb(var(--ui-muted));
}

/* ----- Histórico de chamados ----- */
.cd-tickets-anchor {
  scroll-margin-top: var(--ui-space-5);
  outline: none;
}
.cd-ticket {
  display: inline-flex;
  flex-direction: column;
  min-width: 0;
  line-height: 1.25;
}
.cd-ticket-subject {
  font-weight: 600;
  color: rgb(var(--ui-fg));
  overflow: hidden;
  text-overflow: ellipsis;
}
.cd-ticket-id {
  font-size: var(--ui-text-xs);
  color: rgb(var(--ui-muted));
  font-family: var(--ui-font-mono);
}
.cd-time {
  color: rgb(var(--ui-muted));
  font-size: var(--ui-text-sm);
  white-space: nowrap;
}

/* ----- Modal de criação ----- */
.cd-quick-intro {
  margin: 0 0 var(--ui-space-4);
  color: rgb(var(--ui-muted));
  font-size: var(--ui-text-sm);
  line-height: 1.5;
}
.cd-quick-form {
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-4);
}

/* ----- Responsivo ----- */
@media (max-width: 1080px) {
  .cd-metrics {
    grid-template-columns: repeat(2, 1fr);
  }
}
@media (max-width: 920px) {
  .cd-grid {
    grid-template-columns: 1fr;
  }
}
@media (max-width: 640px) {
  .cd-metrics {
    grid-template-columns: 1fr;
  }
  .cd-head {
    flex-direction: column;
  }
  .cd-head-actions {
    align-items: stretch;
    width: 100%;
  }
  .cd-identity {
    align-items: flex-start;
  }
  .cd-avatar {
    width: 52px;
    height: 52px;
    font-size: 1.2rem;
  }
  .cd-dl {
    grid-template-columns: 1fr;
  }
}
</style>
