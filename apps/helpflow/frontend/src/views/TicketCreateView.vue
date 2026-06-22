<template>
  <UiPageLayout
    eyebrow="Chamados"
    title="Novo chamado"
    subtitle="Abra um chamado de suporte: descreva o problema, identifique o solicitante e direcione o atendimento."
    width="wide"
  >
    <template #actions>
      <UiButton variant="ghost" :to="listTo">Voltar aos chamados</UiButton>
      <UiButton variant="subtle" type="button" :disabled="!dirty" @click="onDiscard">
        Limpar formulário
      </UiButton>
    </template>

    <form class="hf-form" novalidate @submit.prevent="onSubmit">
      <div class="hf-grid">
        <!-- ===================== Coluna principal ===================== -->
        <div class="hf-col">
          <UiCard title="O problema" subtitle="Como o solicitante e o atendimento veem o chamado.">
            <UiFormSection :columns="1">
              <UiFormField
                label="Assunto"
                :required="true"
                :error="f.errors.subject"
                :hint="subjectHint"
              >
                <template #default="{ id, describedBy }">
                  <input
                    :id="id"
                    type="text"
                    maxlength="160"
                    autocomplete="off"
                    :aria-describedby="describedBy"
                    :value="f.values.subject"
                    placeholder="Resumo objetivo do problema"
                    @input="onSubjectInput"
                  />
                </template>
              </UiFormField>

              <UiFormField
                label="Descrição"
                :required="true"
                :error="f.errors.description"
                hint="Contexto, passos para reproduzir e impacto. Quanto mais claro, melhor a sugestão de artigos."
              >
                <template #default="{ id, describedBy }">
                  <textarea
                    :id="id"
                    rows="8"
                    :aria-describedby="describedBy"
                    :value="f.values.description"
                    placeholder="Descreva o que aconteceu, quando começou e o que já foi tentado."
                    @input="onDescriptionInput"
                  />
                </template>
              </UiFormField>
            </UiFormSection>
          </UiCard>

          <UiCard title="Solicitante" subtitle="Quem está reportando o problema.">
            <UiFormSection :columns="1">
              <UiFormField
                label="Buscar solicitante"
                :required="true"
                :error="f.errors.customer_id"
                :hint="customerHint"
              >
                <template #default="{ id, describedBy }">
                  <!-- Solicitante já escolhido: chip + trocar -->
                  <div v-if="selectedCustomer" class="hf-chosen" role="group" aria-label="Solicitante selecionado">
                    <div class="hf-chosen-main">
                      <span class="hf-avatar" aria-hidden="true">{{ initials(selectedCustomer.name) }}</span>
                      <div class="hf-chosen-info">
                        <span class="hf-chosen-name">
                          {{ selectedCustomer.name }}
                          <UiStatusBadge
                            v-if="selectedCustomer.vip"
                            label="VIP"
                            tone="warning"
                            size="sm"
                            :with-dot="false"
                          />
                        </span>
                        <span class="hf-chosen-meta">{{ customerSubline(selectedCustomer) }}</span>
                      </div>
                    </div>
                    <UiButton variant="ghost" size="sm" type="button" @click="clearCustomer">Trocar</UiButton>
                  </div>

                  <!-- Autocomplete -->
                  <div v-else class="hf-ac">
                    <input
                      :id="id"
                      type="text"
                      role="combobox"
                      autocomplete="off"
                      aria-autocomplete="list"
                      :aria-expanded="acOpen ? 'true' : 'false'"
                      aria-controls="hf-ac-list"
                      :aria-activedescendant="activeOptionId"
                      :aria-describedby="describedBy"
                      :value="customerQuery"
                      placeholder="Nome, e-mail ou organização…"
                      @input="onCustomerQuery"
                      @focus="onCustomerFocus"
                      @blur="onCustomerBlur"
                      @keydown="onCustomerKeydown"
                    />

                    <ul
                      v-if="acOpen"
                      id="hf-ac-list"
                      class="hf-ac-list"
                      role="listbox"
                      aria-label="Solicitantes encontrados"
                    >
                      <!-- loading -->
                      <li v-if="customers_.loading" class="hf-ac-status" role="status">
                        <span class="ui-spin" aria-hidden="true" />
                        <span>Buscando solicitantes…</span>
                      </li>
                      <!-- error -->
                      <li v-else-if="customers_.error" class="hf-ac-status hf-ac-error" role="alert">
                        <span>{{ customers_.error }}</span>
                        <UiButton variant="subtle" size="sm" type="button" @mousedown.prevent="runCustomerSearch">
                          Tentar de novo
                        </UiButton>
                      </li>
                      <!-- empty -->
                      <li v-else-if="customerResults.length === 0" class="hf-ac-status">
                        <span v-if="customerQuery.trim().length < 2">Digite ao menos 2 caracteres para buscar.</span>
                        <template v-else>
                          <span>Nenhum solicitante para “{{ customerQuery.trim() }}”.</span>
                          <UiButton variant="ghost" size="sm" to="/customers/new" @mousedown.prevent>
                            Cadastrar solicitante
                          </UiButton>
                        </template>
                      </li>
                      <!-- normal -->
                      <li
                        v-for="(c, i) in customerResults"
                        v-else
                        :id="'hf-ac-opt-' + c.id"
                        :key="c.id"
                        class="hf-ac-opt"
                        role="option"
                        :aria-selected="i === activeIndex ? 'true' : 'false'"
                        :data-active="i === activeIndex ? 'true' : null"
                        @mousedown.prevent="pickCustomer(c)"
                        @mouseenter="activeIndex = i"
                      >
                        <span class="hf-avatar" aria-hidden="true">{{ initials(c.name) }}</span>
                        <span class="hf-ac-text">
                          <span class="hf-ac-name">
                            {{ c.name }}
                            <span v-if="c.vip" class="hf-ac-vip">VIP</span>
                          </span>
                          <span class="hf-ac-sub">{{ customerSubline(c) }}</span>
                        </span>
                      </li>
                    </ul>
                  </div>
                </template>
              </UiFormField>
            </UiFormSection>
          </UiCard>

          <UiCard title="Triagem e roteamento" subtitle="Prioridade, canal e para quem o chamado vai.">
            <UiFormSection :columns="2">
              <UiFormField label="Prioridade" :required="true" :error="f.errors.priority" hint="Influencia o cálculo do prazo de SLA.">
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

              <UiFormField label="Canal" :error="f.errors.channel" hint="Por onde o chamado chegou.">
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

              <UiFormField label="Time / Fila" :error="f.errors.team_id" hint="Fila de atendimento responsável.">
                <template #default="{ id, describedBy }">
                  <div v-if="lookups.loading" class="hf-sel-state" :aria-describedby="describedBy">
                    <span class="ui-spin" aria-hidden="true" />
                    <span class="hf-sel-msg">Carregando times…</span>
                  </div>
                  <div v-else-if="lookups.error" class="hf-sel-state hf-sel-error">
                    <span>Não foi possível carregar os times.</span>
                    <UiButton variant="subtle" size="sm" type="button" @click="loadLookups">Tentar de novo</UiButton>
                  </div>
                  <div v-else-if="!teamOptions.length" class="hf-sel-state hf-sel-empty">
                    <span class="hf-sel-msg">Nenhum time cadastrado.</span>
                    <UiButton variant="ghost" size="sm" to="/teams/new">Criar time</UiButton>
                  </div>
                  <select
                    v-else
                    :id="id"
                    :aria-describedby="describedBy"
                    :value="f.values.team_id"
                    @change="onTeamChange($event.target.value)"
                  >
                    <option value="">— Sem time —</option>
                    <option v-for="t in teamOptions" :key="t.id" :value="t.id">{{ t.label }}</option>
                  </select>
                </template>
              </UiFormField>

              <UiFormField label="Responsável" :error="f.errors.assignee_id" hint="Agente que assume o chamado.">
                <template #default="{ id, describedBy }">
                  <div v-if="lookups.loading" class="hf-sel-state" :aria-describedby="describedBy">
                    <span class="ui-spin" aria-hidden="true" />
                    <span class="hf-sel-msg">Carregando agentes…</span>
                  </div>
                  <div v-else-if="lookups.error" class="hf-sel-state hf-sel-error">
                    <span>Não foi possível carregar os agentes.</span>
                    <UiButton variant="subtle" size="sm" type="button" @click="loadLookups">Tentar de novo</UiButton>
                  </div>
                  <div v-else-if="!assigneeOptions.length" class="hf-sel-state hf-sel-empty">
                    <span class="hf-sel-msg">Nenhum agente disponível.</span>
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
                    <option v-for="a in assigneeOptions" :key="a.id" :value="a.id">{{ a.label }}</option>
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

        <!-- ===================== Coluna lateral ===================== -->
        <aside class="hf-col hf-aside">
          <UiCard title="Política de SLA" subtitle="Define o prazo de resolução do chamado.">
            <UiFormSection :columns="1">
              <UiFormField label="Política de SLA" :error="f.errors.sla_policy_id" hint="Em branco usa a política padrão do servidor.">
                <template #default="{ id, describedBy }">
                  <div v-if="lookups.loading" class="hf-sel-state" :aria-describedby="describedBy">
                    <span class="ui-spin" aria-hidden="true" />
                    <span class="hf-sel-msg">Carregando políticas…</span>
                  </div>
                  <div v-else-if="lookups.error" class="hf-sel-state hf-sel-error">
                    <span>Não foi possível carregar as políticas.</span>
                    <UiButton variant="subtle" size="sm" type="button" @click="loadLookups">Tentar de novo</UiButton>
                  </div>
                  <div v-else-if="!slaOptions.length" class="hf-sel-state hf-sel-empty">
                    <span class="hf-sel-msg">Nenhuma política cadastrada.</span>
                    <UiButton variant="ghost" size="sm" to="/sla-policies/new">Criar política</UiButton>
                  </div>
                  <select
                    v-else
                    :id="id"
                    :aria-describedby="describedBy"
                    :value="f.values.sla_policy_id"
                    @change="f.setField('sla_policy_id', $event.target.value)"
                  >
                    <option value="">— Política padrão —</option>
                    <option v-for="s in slaOptions" :key="s.id" :value="s.id">{{ s.label }}</option>
                  </select>
                </template>
              </UiFormField>
            </UiFormSection>

            <p class="hf-sla-note" role="note">
              <span class="hf-sla-icon" aria-hidden="true">⏱</span>
              <span v-if="selectedSlaPolicy">
                A política <strong>{{ selectedSlaPolicy.name }}</strong> ({{ slaResolutionLabel }}).
                O prazo definitivo é calculado pelo servidor ao abrir o chamado.
              </span>
              <span v-else>
                O <strong>prazo de SLA é calculado pelo servidor</strong> ao abrir o chamado, conforme a prioridade e a política aplicada.
              </span>
            </p>
          </UiCard>

          <!-- ===== KbSuggestPanel: artigos da base relacionados (RAG) ===== -->
          <UiCard title="Artigos relacionados" subtitle="Sugestões da base de conhecimento enquanto você descreve o problema.">
            <template #actions>
              <UiButton
                v-if="kbQueryReady"
                variant="ghost"
                size="sm"
                type="button"
                :loading="kb.loading"
                @click="runKbSuggest"
              >
                Atualizar
              </UiButton>
            </template>

            <!-- não há texto suficiente ainda -->
            <UiEmptyState
              v-if="!kbQueryReady"
              icon="search"
              compact
              title="Descreva o problema"
              description="Conforme você preenche o assunto e a descrição, sugerimos artigos da base que podem resolver o chamado antes mesmo de abri-lo."
            />
            <!-- loading -->
            <UiLoadingState v-else-if="kb.loading && !kbResults.length" variant="skeleton" :skeleton-lines="3" />
            <!-- error -->
            <UiErrorState
              v-else-if="kb.error"
              :message="kb.error"
              :retryable="true"
              @retry="runKbSuggest"
            />
            <!-- empty -->
            <UiEmptyState
              v-else-if="!kbResults.length"
              icon="doc"
              compact
              title="Nenhum artigo relacionado"
              description="Não encontramos artigos para este problema. Siga com a abertura do chamado."
            >
              <template #action>
                <UiButton variant="ghost" size="sm" to="/kb-articles/search">Buscar na base</UiButton>
              </template>
            </UiEmptyState>
            <!-- normal -->
            <ul v-else class="hf-kb" aria-label="Artigos sugeridos">
              <li v-for="art in kbResults" :key="art.id" class="hf-kb-item">
                <RouterLink :to="'/kb-articles/' + art.id" class="hf-kb-link">
                  <span class="hf-kb-title">{{ art.title }}</span>
                  <span class="hf-kb-meta">
                    <UiStatusBadge
                      v-if="art.category"
                      :label="art.category"
                      tone="running"
                      size="sm"
                      :with-dot="false"
                    />
                    <span v-if="art.excerpt" class="hf-kb-excerpt">{{ art.excerpt }}</span>
                  </span>
                </RouterLink>
              </li>
            </ul>
            <p v-if="kbResults.length" class="hf-kb-foot">
              <RouterLink to="/kb-articles/search">Ver todos os resultados na base</RouterLink>
            </p>
          </UiCard>
        </aside>
      </div>

      <!-- ===================== SubmitBar ===================== -->
      <div class="hf-submitbar" role="group" aria-label="Ações do formulário">
        <p class="hf-submitbar-status" aria-live="polite">
          <span v-if="!summaryReady">Preencha assunto, descrição e solicitante para abrir o chamado.</span>
          <span v-else>
            Abrir como <strong>{{ priorityLabel(f.values.priority) }}</strong>
            <template v-if="selectedCustomer"> para <strong>{{ selectedCustomer.name }}</strong></template>.
          </span>
        </p>
        <div class="hf-submitbar-actions">
          <UiButton variant="ghost" type="button" :to="listTo">Cancelar</UiButton>
          <UiButton type="submit" :loading="saving">Abrir chamado</UiButton>
        </div>
      </div>
    </form>
  </UiPageLayout>
</template>

<script setup>
import { computed, reactive, ref, onMounted, onBeforeUnmount } from 'vue';
import { useRouter, RouterLink } from 'vue-router';
import {
  UiPageLayout,
  UiCard,
  UiFormSection,
  UiFormField,
  UiStatusBadge,
  UiEmptyState,
  UiLoadingState,
  UiErrorState,
  UiButton,
  useForm,
  useToast,
  useConfirm,
  validators,
} from '../ui/index.js';
import { tickets, customers, teams, agents, slaPolicies, kbArticles } from '../api.js';

const router = useRouter();
const toast = useToast();
const confirm = useConfirm();

const ROUTE_BASE = '/tickets';
const listTo = ROUTE_BASE;

// ---- Enums de domínio (tickets) — rótulos pt-BR de um service desk ----
const PRIORITY_META = {
  low: { label: 'Baixa' },
  medium: { label: 'Média' },
  high: { label: 'Alta' },
  urgent: { label: 'Urgente' },
};
const CHANNEL_LABELS = {
  email: 'E-mail',
  portal: 'Portal',
  phone: 'Telefone',
  chat: 'Chat',
  api: 'API',
};
const priorityOptions = Object.keys(PRIORITY_META).map((value) => ({ value, label: PRIORITY_META[value].label }));
const channelOptions = Object.keys(CHANNEL_LABELS).map((value) => ({ value, label: CHANNEL_LABELS[value] }));
const priorityLabel = (v) => (PRIORITY_META[v] && PRIORITY_META[v].label) || v || '—';

const saving = ref(false);

// ---- Formulário ----
const f = useForm({
  initial: {
    subject: '',
    description: '',
    priority: 'medium',
    channel: '',
    customer_id: '',
    team_id: '',
    assignee_id: '',
    sla_policy_id: '',
    external_ref: '',
  },
  rules: {
    subject: [validators.required('Informe o assunto.'), validators.minLen(3)],
    description: [validators.required('Descreva o chamado.'), validators.minLen(10)],
    priority: [validators.required('Selecione a prioridade.')],
    customer_id: [validators.required('Selecione o solicitante.'), validators.numeric()],
    team_id: [validators.numeric()],
    assignee_id: [validators.numeric()],
    sla_policy_id: [validators.numeric()],
  },
});

const subjectHint = computed(() => {
  const len = (f.values.subject || '').length;
  return len ? len + '/160 caracteres' : 'Resumo curto que identifica o chamado.';
});

// =====================================================================
//  Autocomplete de solicitante (CustomerAutocomplete) — debounce + a11y
// =====================================================================
const customerQuery = ref('');
const customerResults = ref([]);
const selectedCustomer = ref(null);
const acFocused = ref(false);
const activeIndex = ref(-1);
const customers_ = reactive({ loading: false, error: '' });
let customerTimer = null;
let customerSeq = 0;

const acOpen = computed(() => acFocused.value && !selectedCustomer.value);
const activeOptionId = computed(() =>
  activeIndex.value >= 0 && customerResults.value[activeIndex.value]
    ? 'hf-ac-opt-' + customerResults.value[activeIndex.value].id
    : undefined,
);
const customerHint = computed(() => {
  if (selectedCustomer.value) return 'Solicitante selecionado. Use “Trocar” para escolher outro.';
  return 'Busque por nome, e-mail ou organização (mín. 2 caracteres).';
});

function initials(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
function customerSubline(c) {
  const bits = [];
  if (c.organization) bits.push(c.organization);
  if (c.email) bits.push(c.email);
  return bits.length ? bits.join(' · ') : 'Sem dados de contato';
}

function onCustomerQuery(e) {
  customerQuery.value = e.target.value;
  activeIndex.value = -1;
  scheduleCustomerSearch();
}
function onCustomerFocus() {
  acFocused.value = true;
  if (customerQuery.value.trim().length >= 2 && !customerResults.value.length) scheduleCustomerSearch();
}
function onCustomerBlur() {
  // pequeno atraso para permitir o mousedown do option resolver antes de fechar
  setTimeout(() => { acFocused.value = false; }, 120);
}
function scheduleCustomerSearch() {
  if (customerTimer) clearTimeout(customerTimer);
  const term = customerQuery.value.trim();
  if (term.length < 2) {
    customerResults.value = [];
    customers_.loading = false;
    customers_.error = '';
    return;
  }
  customers_.loading = true;
  customerTimer = setTimeout(runCustomerSearch, 280);
}
async function runCustomerSearch() {
  const term = customerQuery.value.trim();
  if (term.length < 2) return;
  const seq = ++customerSeq;
  customers_.loading = true;
  customers_.error = '';
  try {
    const res = await customers.list({ q: term, pageSize: 8, sort: 'name', dir: 'asc' });
    if (seq !== customerSeq) return; // resposta obsoleta — descarta
    customerResults.value = (res && res.data) || [];
    activeIndex.value = customerResults.value.length ? 0 : -1;
  } catch (e) {
    if (seq !== customerSeq) return;
    customers_.error = (e && e.message) || 'Falha ao buscar solicitantes.';
    customerResults.value = [];
  } finally {
    if (seq === customerSeq) customers_.loading = false;
  }
}
function onCustomerKeydown(e) {
  if (!acOpen.value) return;
  const n = customerResults.value.length;
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    if (n) activeIndex.value = (activeIndex.value + 1) % n;
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    if (n) activeIndex.value = (activeIndex.value - 1 + n) % n;
  } else if (e.key === 'Enter') {
    if (activeIndex.value >= 0 && customerResults.value[activeIndex.value]) {
      e.preventDefault();
      pickCustomer(customerResults.value[activeIndex.value]);
    }
  } else if (e.key === 'Escape') {
    acFocused.value = false;
  }
}
function pickCustomer(c) {
  selectedCustomer.value = c;
  f.setField('customer_id', String(c.id));
  acFocused.value = false;
  customerResults.value = [];
}
function clearCustomer() {
  selectedCustomer.value = null;
  f.setField('customer_id', '');
  customerQuery.value = '';
  customerResults.value = [];
  customers_.error = '';
}

// =====================================================================
//  Lookups de roteamento (time / responsável / política de SLA)
// =====================================================================
const lookups = reactive({ loading: false, error: '' });
const teamList = ref([]);
const agentList = ref([]);
const slaList = ref([]);

const teamOptions = computed(() => teamList.value.map((t) => ({ id: String(t.id), label: t.name })));
const slaOptions = computed(() => slaList.value.map((s) => ({ id: String(s.id), label: s.name })));
// Agentes filtrados pelo time escolhido (se houver), senão todos.
const assigneeOptions = computed(() => {
  const teamId = String(f.values.team_id || '');
  const list = teamId
    ? agentList.value.filter((a) => a.team_id == null || String(a.team_id) === teamId)
    : agentList.value;
  return list.map((a) => ({ id: String(a.id), label: a.name + (a.email ? ' · ' + a.email : '') }));
});

const selectedSlaPolicy = computed(() => {
  const id = String(f.values.sla_policy_id || '');
  if (!id) return null;
  return slaList.value.find((s) => String(s.id) === id) || null;
});
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

function onTeamChange(value) {
  f.setField('team_id', value);
  // Se o responsável escolhido não pertence ao novo time, limpa para evitar par inconsistente.
  const assignee = String(f.values.assignee_id || '');
  if (assignee && !assigneeOptions.value.some((a) => a.id === assignee)) {
    f.setField('assignee_id', '');
  }
}

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
    lookups.error = (e && e.message) || 'Não foi possível carregar as opções de roteamento.';
  } finally {
    lookups.loading = false;
  }
}

// =====================================================================
//  KbSuggestPanel — sugestão de artigos via busca (RAG) com debounce
// =====================================================================
const kb = reactive({ loading: false, error: '' });
const kbResults = ref([]);
let kbTimer = null;
let kbSeq = 0;

// Texto-base da consulta: assunto + descrição.
const kbQueryText = computed(() => {
  const subject = (f.values.subject || '').trim();
  const desc = (f.values.description || '').trim();
  return (subject + ' ' + desc).trim();
});
const kbQueryReady = computed(() => kbQueryText.value.length >= 6);

function makeExcerpt(body) {
  if (!body) return '';
  const s = String(body).replace(/\s+/g, ' ').trim();
  return s.length > 120 ? s.slice(0, 117) + '…' : s;
}

function scheduleKbSuggest() {
  if (kbTimer) clearTimeout(kbTimer);
  if (!kbQueryReady.value) {
    kbResults.value = [];
    kb.loading = false;
    kb.error = '';
    return;
  }
  kbTimer = setTimeout(runKbSuggest, 500);
}
async function runKbSuggest() {
  if (!kbQueryReady.value) return;
  const term = kbQueryText.value.slice(0, 200);
  const seq = ++kbSeq;
  kb.loading = true;
  kb.error = '';
  try {
    const res = await kbArticles.suggest({ q: term, pageSize: 5, status: 'published' });
    if (seq !== kbSeq) return;
    const rows = (res && res.data) || [];
    kbResults.value = rows.map((a) => ({
      id: a.id,
      title: a.title,
      category: a.category || '',
      excerpt: makeExcerpt(a.body),
    }));
  } catch (e) {
    if (seq !== kbSeq) return;
    kb.error = (e && e.message) || 'Não foi possível buscar artigos relacionados.';
    kbResults.value = [];
  } finally {
    if (seq === kbSeq) kb.loading = false;
  }
}

// ---- Reações de input que alimentam validação + painéis assíncronos ----
function onSubjectInput(e) {
  f.setField('subject', e.target.value);
  scheduleKbSuggest();
}
function onDescriptionInput(e) {
  f.setField('description', e.target.value);
  scheduleKbSuggest();
}

// =====================================================================
//  Estado geral / submit
// =====================================================================
const dirty = computed(() =>
  !!(f.values.subject || f.values.description || selectedCustomer.value ||
    f.values.channel || f.values.team_id || f.values.assignee_id ||
    f.values.sla_policy_id || f.values.external_ref),
);
const summaryReady = computed(() =>
  !!(f.values.subject && f.values.description && f.values.customer_id),
);

function onDiscard() {
  f.reset();
  clearCustomer();
  kbResults.value = [];
  kb.error = '';
  toast.info('Formulário limpo.');
}

function numOrNull(v) {
  if (v === '' || v === null || v === undefined) return null;
  const n = Number(v);
  return isFinite(n) ? n : null;
}

function buildPayload() {
  return {
    subject: f.values.subject.trim(),
    description: f.values.description.trim(),
    status: 'open',
    priority: f.values.priority,
    channel: f.values.channel || null,
    customer_id: numOrNull(f.values.customer_id),
    team_id: numOrNull(f.values.team_id),
    assignee_id: numOrNull(f.values.assignee_id),
    sla_policy_id: numOrNull(f.values.sla_policy_id),
    external_ref: f.values.external_ref ? f.values.external_ref.trim() : null,
  };
}

async function onSubmit() {
  if (!f.validate()) {
    if (f.errors.customer_id && !selectedCustomer.value) {
      toast.error('Selecione o solicitante antes de abrir o chamado.');
    } else {
      toast.error('Revise os campos destacados.');
    }
    return;
  }
  const who = selectedCustomer.value ? selectedCustomer.value.name : 'o solicitante';
  const ok = await confirm({
    title: 'Abrir chamado',
    message: 'Abrir um chamado com prioridade ' + priorityLabel(f.values.priority).toLowerCase() +
      ' para ' + who + '? O prazo de SLA será calculado automaticamente.',
    confirmLabel: 'Abrir chamado',
  });
  if (ok) await persist();
}

async function persist() {
  if (saving.value) return; // anti-duplo-submit
  saving.value = true;
  try {
    const created = await tickets.create(buildPayload());
    let detail = '';
    if (created && created.sla_due_at) {
      detail = 'Prazo de SLA: ' + new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
        .format(new Date(created.sla_due_at)) + '.';
    }
    const id = created && created.id != null ? created.id : null;
    toast.success(id != null ? 'Chamado #' + id + ' aberto.' : 'Chamado aberto.', { detail });
    router.push(id != null ? ROUTE_BASE + '/' + id : ROUTE_BASE);
  } catch (e) {
    toast.error((e && e.message) || 'Falha ao abrir o chamado.', {
      code: e && e.status ? 'HTTP ' + e.status : '',
    });
  } finally {
    saving.value = false;
  }
}

onMounted(loadLookups);
onBeforeUnmount(() => {
  if (customerTimer) clearTimeout(customerTimer);
  if (kbTimer) clearTimeout(kbTimer);
});
</script>

<style scoped>
.hf-form {
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-5);
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

/* ---- avatar de iniciais ---- */
.hf-avatar {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  flex-shrink: 0;
  border-radius: 50%;
  background: rgb(var(--ui-accent) / 0.16);
  color: rgb(var(--ui-accent-strong));
  font-size: var(--ui-text-xs);
  font-weight: 700;
  letter-spacing: 0.02em;
}

/* ---- solicitante escolhido ---- */
.hf-chosen {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ui-space-3);
  padding: var(--ui-space-2) var(--ui-space-3);
  border: 1px solid rgb(var(--ui-accent) / 0.35);
  background: rgb(var(--ui-accent) / 0.06);
  border-radius: var(--ui-radius-md);
}
.hf-chosen-main {
  display: flex;
  align-items: center;
  gap: var(--ui-space-3);
  min-width: 0;
}
.hf-chosen-info {
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.hf-chosen-name {
  display: inline-flex;
  align-items: center;
  gap: var(--ui-space-2);
  font-weight: 700;
  color: rgb(var(--ui-fg));
}
.hf-chosen-meta {
  font-size: var(--ui-text-sm);
  color: rgb(var(--ui-muted));
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* ---- autocomplete ---- */
.hf-ac {
  position: relative;
}
.hf-ac-list {
  list-style: none;
  margin: 4px 0 0;
  padding: var(--ui-space-1);
  position: absolute;
  z-index: 30;
  left: 0;
  right: 0;
  max-height: 320px;
  overflow-y: auto;
  background: rgb(var(--ui-surface));
  border: 1px solid rgb(var(--ui-border-strong));
  border-radius: var(--ui-radius-md);
  box-shadow: var(--ui-shadow-md);
}
.hf-ac-status {
  display: flex;
  align-items: center;
  gap: var(--ui-space-2);
  flex-wrap: wrap;
  padding: var(--ui-space-3);
  font-size: var(--ui-text-sm);
  color: rgb(var(--ui-muted));
}
.hf-ac-error {
  color: rgb(var(--ui-danger));
  justify-content: space-between;
}
.hf-ac-opt {
  display: flex;
  align-items: center;
  gap: var(--ui-space-3);
  padding: var(--ui-space-2) var(--ui-space-3);
  border-radius: var(--ui-radius-sm);
  cursor: pointer;
}
.hf-ac-opt[data-active="true"] {
  background: rgb(var(--ui-accent) / 0.12);
}
.hf-ac-text {
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.hf-ac-name {
  display: inline-flex;
  align-items: center;
  gap: var(--ui-space-2);
  font-weight: 600;
  color: rgb(var(--ui-fg));
}
.hf-ac-vip {
  font-size: var(--ui-text-xs);
  font-weight: 700;
  color: rgb(var(--ui-warn));
  background: rgb(var(--ui-warn) / 0.16);
  padding: 1px 6px;
  border-radius: var(--ui-radius-pill);
}
.hf-ac-sub {
  font-size: var(--ui-text-xs);
  color: rgb(var(--ui-muted));
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* ---- estados dos selects de lookup ---- */
.hf-sel-state {
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
.hf-sel-empty {
  justify-content: space-between;
}
.hf-sel-error {
  border-style: solid;
  border-color: rgb(var(--ui-danger) / 0.4);
  background: rgb(var(--ui-danger) / 0.06);
  color: rgb(var(--ui-danger));
  justify-content: space-between;
}
.hf-sel-msg {
  color: rgb(var(--ui-muted));
}

/* ---- nota de SLA ---- */
.hf-sla-note {
  display: flex;
  align-items: flex-start;
  gap: var(--ui-space-2);
  margin: var(--ui-space-3) 0 0;
  padding: var(--ui-space-3);
  font-size: var(--ui-text-sm);
  color: rgb(var(--ui-fg));
  background: rgb(var(--ui-accent) / 0.10);
  border: 1px solid rgb(var(--ui-accent) / 0.30);
  border-radius: var(--ui-radius-md);
}
.hf-sla-icon {
  font-size: var(--ui-text-lg);
  line-height: 1.2;
}

/* ---- painel de artigos (KB) ---- */
.hf-kb {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-2);
}
.hf-kb-item {
  border: 1px solid rgb(var(--ui-border));
  border-radius: var(--ui-radius-md);
  background: rgb(var(--ui-surface-2));
  transition: border-color 0.15s ease, background 0.15s ease;
}
.hf-kb-item:hover {
  border-color: rgb(var(--ui-accent) / 0.45);
  background: rgb(var(--ui-accent) / 0.06);
}
.hf-kb-link {
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-1);
  padding: var(--ui-space-3);
  color: inherit;
  text-decoration: none;
}
.hf-kb-link:hover {
  text-decoration: none;
}
.hf-kb-title {
  font-weight: 600;
  color: rgb(var(--ui-fg));
}
.hf-kb-meta {
  display: flex;
  align-items: center;
  gap: var(--ui-space-2);
  flex-wrap: wrap;
}
.hf-kb-excerpt {
  font-size: var(--ui-text-xs);
  color: rgb(var(--ui-muted));
}
.hf-kb-foot {
  margin: var(--ui-space-3) 0 0;
  font-size: var(--ui-text-sm);
}

/* ---- submit bar ---- */
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

@media (max-width: 960px) {
  .hf-grid {
    grid-template-columns: 1fr;
  }
  .hf-aside {
    position: static;
  }
}
</style>
