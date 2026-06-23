<template>
  <UiPageLayout
    eyebrow="Times / Filas"
    title="Editar time / fila"
    :subtitle="headerSubtitle"
    width="default"
    :loading="loading"
    loading-message="Carregando dados do time…"
    :error="loadError"
    @retry="reload"
  >
    <template #actions>
      <UiButton variant="ghost" :to="listTo">Voltar para times</UiButton>
      <UiButton variant="subtle" :to="detailTo" :disabled="!loaded || !record">Ver time</UiButton>
    </template>

    <!-- Banner de degradação: listas auxiliares indisponíveis -->
    <template #banner>
      <div v-if="loaded && record && auxDegraded" class="team-banner" role="status">
        <span class="team-banner-icon" aria-hidden="true">!</span>
        <span class="team-banner-text">
          {{ auxDegradedMessage }}
        </span>
        <UiButton variant="ghost" size="sm" type="button" :loading="reloadingAux" @click="reloadAux">
          Recarregar listas
        </UiButton>
      </div>
    </template>

    <!-- Estado: time inexistente (carregou sem erro, mas sem dados) -->
    <UiEmptyState
      v-if="loaded && !record"
      icon="◌"
      title="Time não encontrado"
      description="O time / fila que você tentou editar não existe mais ou foi removido. Volte para a lista e escolha um time válido."
    >
      <template #action>
        <UiButton :to="listTo">Voltar para times</UiButton>
      </template>
    </UiEmptyState>

    <!-- Estado normal: formulário de edição em layout de duas colunas -->
    <form v-else-if="loaded" class="team-edit" novalidate @submit.prevent="save">
      <div class="team-edit-grid">
        <!-- Coluna principal: o formulário -->
        <div class="team-edit-main">
          <UiCard
            title="Configuração do time"
            subtitle="Defina nome, líder, SLA padrão e a situação da fila de atendimento."
          >
            <template #actions>
              <UiStatusBadge :status="f.values.status" :label="statusLabelFor(f.values.status)" size="lg" />
            </template>

            <!-- FormSection: Identificação -->
            <UiFormSection
              title="Identificação"
              description="Como o time aparece na triagem e no roteamento de chamados."
              :columns="1"
            >
              <UiFormField
                label="Nome"
                :required="true"
                :error="f.errors.name"
                full-width
                hint="Nome curto e claro da fila. Ex.: Suporte N1, Financeiro, Infraestrutura."
              >
                <template #default="{ id, describedBy, hasError }">
                  <input
                    :id="id"
                    type="text"
                    autocomplete="off"
                    maxlength="120"
                    :aria-describedby="describedBy"
                    :aria-invalid="hasError ? 'true' : null"
                    :value="f.values.name"
                    placeholder="Ex.: Suporte Nível 1"
                    @input="f.setField('name', $event.target.value)"
                  />
                </template>
              </UiFormField>

              <UiFormField
                label="Descrição"
                :error="f.errors.description"
                full-width
                :hint="descriptionHint"
              >
                <template #default="{ id, describedBy, hasError }">
                  <textarea
                    :id="id"
                    rows="3"
                    maxlength="2000"
                    :aria-describedby="describedBy"
                    :aria-invalid="hasError ? 'true' : null"
                    :value="f.values.description"
                    placeholder="Ex.: Atende chamados de primeiro nível e encaminha o que precisa de especialista."
                    @input="f.setField('description', $event.target.value)"
                  />
                </template>
              </UiFormField>
            </UiFormSection>

            <!-- FormSection: Roteamento -->
            <UiFormSection
              title="Roteamento"
              description="Como os chamados são distribuídos entre os agentes desta fila."
              :columns="1"
            >
              <UiFormField
                label="Regra de roteamento"
                :required="true"
                :error="f.errors.routing_rule"
                full-width
                hint="Define o algoritmo de distribuição de chamados para os agentes."
              >
                <template #default="{ id, describedBy }">
                  <div
                    :id="id"
                    class="team-routing"
                    role="radiogroup"
                    :aria-describedby="describedBy"
                    aria-label="Regra de roteamento"
                  >
                    <label
                      v-for="opt in routingOptions"
                      :key="opt.value"
                      class="team-routing-opt"
                      :data-active="f.values.routing_rule === opt.value ? 'true' : 'false'"
                      :data-tone="opt.tone"
                    >
                      <input
                        type="radio"
                        name="team-routing-rule"
                        class="team-routing-input"
                        :value="opt.value"
                        :checked="f.values.routing_rule === opt.value"
                        @change="f.setField('routing_rule', opt.value)"
                      />
                      <span class="team-routing-mark" aria-hidden="true" />
                      <span class="team-routing-text">
                        <span class="team-routing-title">{{ opt.label }}</span>
                        <span class="team-routing-desc">{{ opt.description }}</span>
                      </span>
                    </label>
                  </div>
                </template>
              </UiFormField>
            </UiFormSection>

            <!-- FormSection: Atendimento -->
            <UiFormSection
              title="Atendimento"
              description="Responsável pela fila e meta de tempo de resposta."
              :columns="2"
            >
              <!-- Líder: sempre um select com nomes; inclui o líder atual mesmo sem a lista completa -->
              <UiFormField label="Líder" :error="f.errors.lead_agent_id" :hint="leadHint">
                <template #default="{ id, describedBy, hasError }">
                  <select
                    :id="id"
                    :aria-describedby="describedBy"
                    :aria-invalid="hasError ? 'true' : null"
                    :value="leadSelectValue"
                    @change="f.setField('lead_agent_id', normalizeId($event.target.value))"
                  >
                    <option value="">Sem líder definido</option>
                    <option v-for="opt in leadOptions" :key="opt.value" :value="opt.value">
                      {{ opt.label }}
                    </option>
                  </select>
                </template>
              </UiFormField>

              <!-- SLA padrão: select com o nome da política; inclui a política atual mesmo sem a lista -->
              <UiFormField label="SLA padrão" :error="f.errors.default_sla_policy_id" :hint="slaHint">
                <template #default="{ id, describedBy, hasError }">
                  <select
                    :id="id"
                    :aria-describedby="describedBy"
                    :aria-invalid="hasError ? 'true' : null"
                    :value="slaSelectValue"
                    @change="f.setField('default_sla_policy_id', normalizeId($event.target.value))"
                  >
                    <option value="">Sem SLA padrão</option>
                    <option v-for="opt in slaSelectOptions" :key="opt.value" :value="opt.value">
                      {{ opt.label }}
                    </option>
                  </select>
                </template>
              </UiFormField>
            </UiFormSection>

            <!-- FormSection: Situação -->
            <UiFormSection
              title="Situação"
              description="Times inativos param de receber novos chamados, mas o histórico é preservado."
              :columns="1"
            >
              <UiFormField label="Situação do time" :error="f.errors.status">
                <template #default="{ id, describedBy }">
                  <div
                    :id="id"
                    class="team-status"
                    role="radiogroup"
                    aria-label="Situação do time"
                    :aria-describedby="describedBy"
                  >
                    <label
                      v-for="opt in statusOptions"
                      :key="opt.value"
                      class="team-status-opt"
                      :data-active="f.values.status === opt.value ? 'true' : 'false'"
                      :data-tone="opt.tone"
                    >
                      <input
                        type="radio"
                        name="team-status"
                        class="team-status-input"
                        :value="opt.value"
                        :checked="f.values.status === opt.value"
                        @change="f.setField('status', opt.value)"
                      />
                      <span class="team-status-mark" aria-hidden="true" />
                      <span class="team-status-text">
                        <span class="team-status-title">{{ opt.label }}</span>
                        <span class="team-status-desc">{{ opt.description }}</span>
                      </span>
                    </label>
                  </div>
                </template>
              </UiFormField>
            </UiFormSection>
          </UiCard>
        </div>

        <!-- Coluna lateral: pré-visualização + roteamento + metadados -->
        <aside class="team-edit-side">
          <!-- Pré-visualização do cartão do time na triagem -->
          <UiCard title="Pré-visualização" subtitle="Como o time aparece na triagem.">
            <div class="team-preview">
              <div class="team-preview-head">
                <span class="team-preview-avatar" aria-hidden="true">{{ previewInitials }}</span>
                <div class="team-preview-id">
                  <span class="team-preview-name">{{ previewName }}</span>
                  <UiStatusBadge
                    :status="f.values.status"
                    :label="statusLabelFor(f.values.status)"
                    with-dot
                  />
                </div>
              </div>
              <p class="team-preview-desc" :data-empty="hasDescription ? 'false' : 'true'">
                {{ hasDescription ? f.values.description : 'Sem descrição.' }}
              </p>
              <dl class="team-preview-facts">
                <div class="team-preview-fact">
                  <dt>Líder</dt>
                  <dd>{{ leadDisplay }}</dd>
                </div>
                <div class="team-preview-fact">
                  <dt>SLA padrão</dt>
                  <dd>{{ slaDisplay }}</dd>
                </div>
              </dl>
            </div>
          </UiCard>

          <!-- Atalhos de roteamento (rotas de domínio — nunca /records) -->
          <UiCard title="Configurações relacionadas">
            <ul class="team-links">
              <li v-for="link in relatedLinks" :key="link.to" class="team-links-item">
                <RouterLink :to="link.to" class="team-links-link">
                  <span class="team-links-glyph" aria-hidden="true">{{ link.glyph }}</span>
                  <span class="team-links-body">
                    <span class="team-links-label">{{ link.label }}</span>
                    <span class="team-links-desc">{{ link.desc }}</span>
                  </span>
                  <span class="team-links-arrow" aria-hidden="true">→</span>
                </RouterLink>
              </li>
            </ul>
          </UiCard>

          <!-- Metadados read-only -->
          <UiCard v-if="metaRows.length" title="Detalhes do registro">
            <dl class="team-meta">
              <div v-for="row in metaRows" :key="row.label" class="team-meta-row">
                <dt>{{ row.label }}</dt>
                <dd>{{ row.value }}</dd>
              </div>
            </dl>
          </UiCard>
        </aside>
      </div>

      <!-- SubmitBar — barra de ações fixa ao fim do formulário -->
      <div class="team-submitbar">
        <p class="team-submitbar-note" :data-dirty="isDirty ? 'true' : 'false'">
          <span class="team-submitbar-dot" aria-hidden="true" />
          {{ isDirty ? 'Há alterações não salvas.' : 'Tudo salvo.' }}
        </p>
        <div class="team-submitbar-actions">
          <UiButton variant="ghost" type="button" :disabled="f.submitting.value" @click="cancel">
            Cancelar
          </UiButton>
          <UiButton type="submit" :loading="f.submitting.value" :disabled="!isDirty">
            Salvar alterações
          </UiButton>
        </div>
      </div>
    </form>
  </UiPageLayout>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue';
import { useRouter, RouterLink } from 'vue-router';
import {
  UiPageLayout,
  UiCard,
  UiButton,
  UiFormSection,
  UiFormField,
  UiStatusBadge,
  UiEmptyState,
  useForm,
  useToast,
  useConfirm,
  validators,
  format,
} from '../ui/index.js';
import { teams, agents, slaPolicies } from '../api.js';

const props = defineProps({ id: { type: String, default: null } });

const router = useRouter();
const toast = useToast();
const confirm = useConfirm();

// Rotas de DOMÍNIO — nunca /records.
const LIST_ROUTE = '/teams';
const listTo = LIST_ROUTE;
const detailTo = computed(() => (props.id ? LIST_ROUTE + '/' + props.id : LIST_ROUTE));

const loading = ref(true);
const loaded = ref(false);
const loadError = ref(null);
const record = ref(null);

// agentes para o select de líder (degradação graciosa se a lista falhar)
const agentList = ref([]);
const agentsReady = ref(false);

// políticas de SLA para o select de SLA padrão (degradação graciosa se a lista falhar)
const slaList = ref([]);
const slaReady = ref(false);

// estado do "recarregar listas" auxiliares no banner de degradação
const reloadingAux = ref(false);

const routingOptions = [
  { value: 'round_robin', label: 'Rodízio', tone: 'accent', description: 'Distribui chamados em sequência entre os agentes ativos.' },
  { value: 'least_busy', label: 'Menos ocupado', tone: 'success', description: 'Atribui ao agente com menos chamados abertos.' },
  { value: 'skill_based', label: 'Por habilidade', tone: 'warning', description: 'Encaminha ao agente com a habilidade mais adequada.' },
  { value: 'manual', label: 'Manual', tone: 'neutral', description: 'O supervisor atribui manualmente cada chamado.' },
];

const statusOptions = [
  { value: 'active', label: 'Ativo', tone: 'success', description: 'Recebe novos chamados normalmente.' },
  { value: 'inactive', label: 'Inativo', tone: 'error', description: 'Não recebe novos chamados; histórico preservado.' },
];

function statusLabelFor(value) {
  const opt = statusOptions.find((o) => o.value === value);
  return opt ? opt.label : '';
}

const f = useForm({
  initial: { name: '', description: '', lead_agent_id: '', default_sla_policy_id: '', routing_rule: 'round_robin', status: 'active' },
  rules: {
    name: [validators.required('Informe o nome do time'), validators.minLen(2), validators.maxLen(120)],
    description: [validators.maxLen(2000)],
    lead_agent_id: [validators.numeric('ID de agente inválido'), validators.min(1, 'ID inválido')],
    default_sla_policy_id: [validators.numeric('ID de SLA inválido'), validators.min(1, 'ID inválido')],
    routing_rule: [validators.required('Escolha a regra de roteamento')],
  },
});

const activeRoutingOption = computed(
  () => routingOptions.find((o) => o.value === f.values.routing_rule) || routingOptions[0],
);

// snapshot do estado original p/ detectar alterações (dirty)
const baseline = reactive({});

const headerSubtitle = computed(() => {
  if (loadError.value || !record.value) return 'Edição do time / fila de atendimento.';
  return f.values.name ? 'Editando “' + f.values.name + '”.' : 'Edição do time / fila de atendimento.';
});

// --- listas auxiliares: estado de degradação para o banner ----------------------
const auxDegraded = computed(() => !agentsReady.value || !slaReady.value);
const auxDegradedMessage = computed(() => {
  if (!agentsReady.value && !slaReady.value) {
    return 'As listas de agentes e de políticas de SLA estão indisponíveis. Exibindo os valores atuais; recarregue para escolher outros.';
  }
  if (!agentsReady.value) {
    return 'A lista de agentes está indisponível. Exibindo o líder atual; recarregue para escolher outro.';
  }
  return 'A lista de políticas de SLA está indisponível. Exibindo o SLA atual; recarregue para escolher outro.';
});

// --- líder ----------------------------------------------------------------------
const agentOptions = computed(() =>
  agentList.value.map((a) => ({ value: String(a.id), label: agentLabel(a) })),
);

// Opções do select de líder: a lista carregada MAIS o líder atual (caso a lista não o contenha —
// lista indisponível, agente removido, etc.). O operador nunca lida com IDs crus.
const leadOptions = computed(() => {
  const opts = agentOptions.value.slice();
  const cur = f.values.lead_agent_id;
  if (cur !== '' && cur !== null && cur !== undefined && !opts.some((o) => o.value === String(cur))) {
    opts.unshift({ value: String(cur), label: leadFallbackLabel(cur) });
  }
  return opts;
});

const leadSelectValue = computed(() => {
  const cur = f.values.lead_agent_id;
  if (cur === '' || cur === null || cur === undefined) return '';
  return String(cur);
});

const leadHint = computed(() => {
  if (!agentsReady.value) {
    return 'Lista de agentes indisponível — exibindo o líder atual. Recarregue para escolher outro.';
  }
  if (!agentOptions.value.length) return 'Nenhum agente cadastrado ainda. Cadastre agentes para definir um líder.';
  const cur = f.values.lead_agent_id;
  if (cur && !agentOptions.value.some((o) => o.value === String(cur))) {
    return 'O líder atual não está na lista de agentes ativos. Selecione outro ou mantenha o atual.';
  }
  return 'Agente responsável por coordenar esta fila.';
});

// --- SLA ------------------------------------------------------------------------
const slaOptions = computed(() =>
  slaList.value.map((p) => ({ value: String(p.id), label: slaLabel(p) })),
);

const slaSelectOptions = computed(() => {
  const opts = slaOptions.value.slice();
  const cur = f.values.default_sla_policy_id;
  if (cur !== '' && cur !== null && cur !== undefined && !opts.some((o) => o.value === String(cur))) {
    opts.unshift({ value: String(cur), label: slaFallbackLabel(cur) });
  }
  return opts;
});

const slaSelectValue = computed(() => {
  const cur = f.values.default_sla_policy_id;
  if (cur === '' || cur === null || cur === undefined) return '';
  return String(cur);
});

const slaHint = computed(() => {
  if (!slaReady.value) {
    return 'Lista de políticas indisponível — exibindo o SLA atual. Recarregue para escolher outro.';
  }
  if (!slaOptions.value.length) {
    return 'Nenhuma política de SLA cadastrada ainda. Cadastre políticas para definir o SLA padrão.';
  }
  const cur = f.values.default_sla_policy_id;
  if (cur && !slaOptions.value.some((o) => o.value === String(cur))) {
    return 'A política atual não está na lista disponível. Selecione outra ou mantenha a atual.';
  }
  return 'Política de SLA aplicada por padrão aos chamados desta fila.';
});

// --- descrição ------------------------------------------------------------------
const hasDescription = computed(() => String(f.values.description || '').trim() !== '');
const descriptionHint = computed(() => {
  const len = String(f.values.description || '').length;
  if (len === 0) return 'Opcional. Explique o escopo do time para orientar a triagem.';
  return len + ' de 2000 caracteres.';
});

// --- pré-visualização -----------------------------------------------------------
const previewName = computed(() => {
  const n = String(f.values.name || '').trim();
  return n || 'Novo time';
});
const previewInitials = computed(() => {
  const words = previewName.value.split(/\s+/).filter(Boolean);
  if (!words.length) return '?';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[words.length - 1][0]).toUpperCase();
});

// Rótulo legível do líder/SLA escolhido para a pré-visualização (sem o sufixo "(#id)").
function stripIdSuffix(label) {
  return String(label || '').replace(/\s*\(#\d+\)\s*$/, '').replace(/\s*\(atual\)\s*$/, '').trim();
}
const leadDisplay = computed(() => {
  const cur = leadSelectValue.value;
  if (!cur) return 'Sem líder definido';
  const opt = leadOptions.value.find((o) => o.value === cur);
  return opt ? stripIdSuffix(opt.label) : 'Agente #' + cur;
});
const slaDisplay = computed(() => {
  const cur = slaSelectValue.value;
  if (!cur) return 'Sem SLA padrão';
  const opt = slaSelectOptions.value.find((o) => o.value === cur);
  return opt ? stripIdSuffix(opt.label) : 'Política #' + cur;
});

// --- atalhos de roteamento (rotas de domínio) -----------------------------------
const relatedLinks = computed(() => [
  { to: '/agents', glyph: '◍', label: 'Agentes', desc: 'Quem atende e pode liderar a fila.' },
  { to: '/sla-policies', glyph: '◷', label: 'Políticas de SLA', desc: 'Metas de tempo de resposta e solução.' },
  { to: detailTo.value, glyph: '◆', label: 'Chamados deste time', desc: 'Acompanhe a fila e o histórico.' },
]);

// --- metadados read-only --------------------------------------------------------
const metaRows = computed(() => {
  const rec = record.value;
  if (!rec) return [];
  const rows = [];
  if (rec.id !== undefined && rec.id !== null) rows.push({ label: 'Identificador', value: '#' + rec.id });
  if (rec.created_at) rows.push({ label: 'Criado em', value: format.formatDateTime(rec.created_at) });
  if (rec.updated_at) rows.push({ label: 'Atualizado em', value: format.formatDateTime(rec.updated_at) });
  return rows;
});

// --- dirty ----------------------------------------------------------------------
const isDirty = computed(() => {
  for (const k of Object.keys(baseline)) {
    if (normalize(f.values[k]) !== normalize(baseline[k])) return true;
  }
  return false;
});

// --- helpers de rótulo ----------------------------------------------------------
function agentLabel(a) {
  const name = a.name || a.full_name || a.display_name || a.email || ('Agente #' + a.id);
  return name + ' (#' + a.id + ')';
}

function leadFallbackLabel(id) {
  const rec = record.value;
  const name = rec && (rec.lead_agent_name || rec.lead_name);
  return name ? name + ' (atual)' : 'Agente atual (#' + id + ')';
}

function slaLabel(p) {
  const name = p.name || p.title || p.label || ('Política #' + p.id);
  return name + ' (#' + p.id + ')';
}

function slaFallbackLabel(id) {
  const rec = record.value;
  const name = rec && (rec.default_sla_policy_name || rec.sla_policy_name);
  return name ? name + ' (atual)' : 'Política atual (#' + id + ')';
}

function normalize(v) {
  if (v === null || v === undefined) return '';
  if (typeof v === 'boolean') return v;
  return String(v).trim();
}

// converte input numérico em string vazia OU número-como-string preservado p/ o form
function normalizeId(raw) {
  const s = String(raw == null ? '' : raw).trim();
  return s === '' ? '' : s;
}

// o backend pode devolver o registro cru OU embrulhado em { data }
function unwrap(res) {
  return res && typeof res === 'object' && res.data && typeof res.data === 'object' ? res.data : res;
}

function hydrate(rec) {
  const next = {
    name: rec.name || '',
    description: rec.description || '',
    lead_agent_id: rec.lead_agent_id === null || rec.lead_agent_id === undefined ? '' : String(rec.lead_agent_id),
    default_sla_policy_id:
      rec.default_sla_policy_id === null || rec.default_sla_policy_id === undefined
        ? ''
        : String(rec.default_sla_policy_id),
    routing_rule: rec.routing_rule || 'round_robin',
    status: rec.status || 'active',
  };
  for (const k of Object.keys(next)) {
    f.values[k] = next[k];
    baseline[k] = next[k];
  }
}

async function loadAgents() {
  try {
    const res = await agents.list({ page: 1, pageSize: 200 });
    const data = Array.isArray(res) ? res : res.data || res.items || [];
    agentList.value = data.filter((a) => a && a.id !== undefined && a.id !== null);
    agentsReady.value = true;
  } catch {
    // degradação graciosa: sem lista de agentes, o select ainda mostra o líder atual
    agentList.value = [];
    agentsReady.value = false;
  }
}

async function loadSlaPolicies() {
  try {
    const res = await slaPolicies.list({ page: 1, pageSize: 200 });
    const data = Array.isArray(res) ? res : res.data || res.items || [];
    slaList.value = data.filter((p) => p && p.id !== undefined && p.id !== null);
    slaReady.value = true;
  } catch {
    // degradação graciosa: sem lista de políticas, o select ainda mostra o SLA atual
    slaList.value = [];
    slaReady.value = false;
  }
}

// Recarrega só as listas auxiliares (sem recarregar o registro nem perder edições).
async function reloadAux() {
  if (reloadingAux.value) return;
  reloadingAux.value = true;
  try {
    await Promise.all([loadAgents(), loadSlaPolicies()]);
    if (!auxDegraded.value) toast.success('Listas atualizadas');
    else toast.warning('Algumas listas seguem indisponíveis');
  } finally {
    reloadingAux.value = false;
  }
}

async function reload() {
  if (!props.id) {
    loadError.value = 'Nenhum time selecionado para edição.';
    loading.value = false;
    return;
  }
  loading.value = true;
  loadError.value = null;
  loaded.value = false;
  try {
    const [raw] = await Promise.all([teams.get(props.id), loadAgents(), loadSlaPolicies()]);
    const rec = unwrap(raw);
    record.value = rec || null;
    if (rec) hydrate(rec);
    loaded.value = true;
  } catch (e) {
    loadError.value = e && e.message ? e.message : 'Não foi possível carregar o time.';
  } finally {
    loading.value = false;
  }
}

function toNumberOrNull(v) {
  const s = String(v == null ? '' : v).trim();
  if (s === '') return null;
  const n = Number(s);
  return isFinite(n) ? n : null;
}

function buildPayload(vals) {
  return {
    name: vals.name.trim(),
    description: vals.description ? vals.description.trim() : '',
    lead_agent_id: toNumberOrNull(vals.lead_agent_id),
    default_sla_policy_id: toNumberOrNull(vals.default_sla_policy_id),
    routing_rule: vals.routing_rule || 'round_robin',
    status: vals.status,
  };
}

function save() {
  f.handleSubmit(async (vals) => {
    const ok = await confirm({
      title: 'Salvar alterações',
      message: 'Confirmar a atualização do time “' + vals.name.trim() + '”?',
      confirmLabel: 'Salvar',
      cancelLabel: 'Revisar',
    });
    if (!ok) return;
    try {
      const updated = unwrap(await teams.update(props.id, buildPayload(vals)));
      if (updated && typeof updated === 'object') {
        record.value = updated;
        hydrate(updated);
      } else {
        for (const k of Object.keys(baseline)) baseline[k] = f.values[k];
      }
      toast.success('Time atualizado');
      router.push(detailTo.value);
    } catch (e) {
      toast.error(e && e.message ? e.message : 'Falha ao salvar o time');
    }
  });
}

async function cancel() {
  if (isDirty.value) {
    const leave = await confirm({
      title: 'Descartar alterações?',
      message: 'Você tem alterações não salvas neste time. Sair sem salvar?',
      confirmLabel: 'Descartar',
      cancelLabel: 'Continuar editando',
      danger: true,
    });
    if (!leave) return;
  }
  router.push(detailTo.value);
}

onMounted(reload);
</script>

<style scoped>
/* ---- moldura de 2 colunas ------------------------------------------------------ */
.team-edit {
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-4);
}
.team-edit-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.7fr) minmax(0, 1fr);
  gap: var(--ui-space-4);
  align-items: start;
}
.team-edit-main {
  min-width: 0;
}
.team-edit-side {
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-4);
  min-width: 0;
}

/* ---- banner de degradação ------------------------------------------------------ */
.team-banner {
  display: flex;
  align-items: center;
  gap: var(--ui-space-3);
  padding: var(--ui-space-3) var(--ui-space-4);
  border: 1px solid rgb(var(--ui-warn) / 0.4);
  background: rgb(var(--ui-warn) / 0.1);
  border-radius: var(--ui-radius-md);
}
.team-banner-icon {
  flex: 0 0 auto;
  width: 22px;
  height: 22px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: rgb(var(--ui-warn));
  color: rgb(var(--ui-bg));
  font-weight: 800;
  font-size: var(--ui-text-xs);
}
.team-banner-text {
  flex: 1 1 auto;
  font-size: var(--ui-text-sm);
  color: rgb(var(--ui-fg));
  min-width: 0;
}

/* ---- Situação — radio-cards, CSP-safe via classes/data-* ----------------------- */
.team-status {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: var(--ui-space-3);
}
.team-status-opt {
  position: relative;
  display: flex;
  align-items: flex-start;
  gap: var(--ui-space-3);
  padding: var(--ui-space-3) var(--ui-space-4);
  border: 1px solid rgb(var(--ui-border-strong));
  border-radius: var(--ui-radius-md);
  background: rgb(var(--ui-bg));
  cursor: pointer;
  transition: border-color 0.15s ease, background 0.15s ease;
}
.team-status-opt:hover {
  border-color: rgb(var(--ui-accent));
}
.team-status-opt[data-active='true'] {
  border-color: rgb(var(--ui-accent));
  background: rgb(var(--ui-accent) / 0.08);
}
.team-status-input {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: -1px;
  padding: 0;
  border: 0;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
}
.team-status-mark {
  flex: 0 0 auto;
  width: 18px;
  height: 18px;
  margin-top: 2px;
  border-radius: 50%;
  border: 2px solid rgb(var(--ui-border-strong));
  background: rgb(var(--ui-surface));
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}
.team-status-opt[data-active='true'] .team-status-mark {
  border-color: rgb(var(--ui-accent));
  box-shadow: inset 0 0 0 4px rgb(var(--ui-accent));
}
.team-status-input:focus-visible + .team-status-mark {
  outline: 2px solid rgb(var(--ui-accent));
  outline-offset: 2px;
}
.team-status-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.team-status-title {
  font-size: var(--ui-text-sm);
  font-weight: 600;
  color: rgb(var(--ui-fg));
}
.team-status-desc {
  font-size: var(--ui-text-xs);
  color: rgb(var(--ui-muted));
  line-height: 1.4;
}

/* ---- Roteamento — radio-cards, mesmo padrão dos status-cards ------------------- */
.team-routing {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: var(--ui-space-3);
}
.team-routing-opt {
  position: relative;
  display: flex;
  align-items: flex-start;
  gap: var(--ui-space-3);
  padding: var(--ui-space-3) var(--ui-space-4);
  border: 1px solid rgb(var(--ui-border-strong));
  border-radius: var(--ui-radius-md);
  background: rgb(var(--ui-bg));
  cursor: pointer;
  transition: border-color 0.15s ease, background 0.15s ease;
}
.team-routing-opt:hover {
  border-color: rgb(var(--ui-accent));
}
.team-routing-opt[data-active='true'] {
  border-color: rgb(var(--ui-accent));
  background: rgb(var(--ui-accent) / 0.08);
}
.team-routing-input {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: -1px;
  padding: 0;
  border: 0;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
}
.team-routing-mark {
  flex: 0 0 auto;
  width: 18px;
  height: 18px;
  margin-top: 2px;
  border-radius: 50%;
  border: 2px solid rgb(var(--ui-border-strong));
  background: rgb(var(--ui-surface));
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}
.team-routing-opt[data-active='true'] .team-routing-mark {
  border-color: rgb(var(--ui-accent));
  box-shadow: inset 0 0 0 4px rgb(var(--ui-accent));
}
.team-routing-input:focus-visible + .team-routing-mark {
  outline: 2px solid rgb(var(--ui-accent));
  outline-offset: 2px;
}
.team-routing-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.team-routing-title {
  font-size: var(--ui-text-sm);
  font-weight: 600;
  color: rgb(var(--ui-fg));
}
.team-routing-desc {
  font-size: var(--ui-text-xs);
  color: rgb(var(--ui-muted));
  line-height: 1.4;
}

/* ---- pré-visualização ---------------------------------------------------------- */
.team-preview {
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-4);
}
.team-preview-head {
  display: flex;
  align-items: center;
  gap: var(--ui-space-3);
}
.team-preview-avatar {
  flex: 0 0 auto;
  width: 44px;
  height: 44px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--ui-radius-md);
  background: rgb(var(--ui-accent) / 0.14);
  color: rgb(var(--ui-accent-strong));
  font-family: var(--ui-font-display);
  font-weight: 700;
  font-size: var(--ui-text-md);
  letter-spacing: 0.02em;
}
.team-preview-id {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}
.team-preview-name {
  font-family: var(--ui-font-display);
  font-weight: 700;
  font-size: var(--ui-text-md);
  color: rgb(var(--ui-fg));
  overflow-wrap: anywhere;
}
.team-preview-desc {
  margin: 0;
  font-size: var(--ui-text-sm);
  color: rgb(var(--ui-fg));
  line-height: 1.5;
  overflow-wrap: anywhere;
}
.team-preview-desc[data-empty='true'] {
  color: rgb(var(--ui-muted));
  font-style: italic;
}
.team-preview-facts {
  margin: 0;
  display: grid;
  gap: var(--ui-space-3);
  padding-top: var(--ui-space-3);
  border-top: 1px solid rgb(var(--ui-border));
}
.team-preview-fact {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.team-preview-fact dt {
  font-size: var(--ui-text-xs);
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: rgb(var(--ui-muted));
}
.team-preview-fact dd {
  margin: 0;
  font-size: var(--ui-text-sm);
  color: rgb(var(--ui-fg));
  overflow-wrap: anywhere;
}

/* ---- atalhos de roteamento ----------------------------------------------------- */
.team-links {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-2);
}
.team-links-link {
  display: flex;
  align-items: center;
  gap: var(--ui-space-3);
  padding: var(--ui-space-3);
  border: 1px solid rgb(var(--ui-border));
  border-radius: var(--ui-radius-md);
  color: rgb(var(--ui-fg));
  text-decoration: none;
  transition: border-color 0.15s ease, background 0.15s ease;
}
.team-links-link:hover {
  text-decoration: none;
  border-color: rgb(var(--ui-accent));
  background: rgb(var(--ui-accent) / 0.06);
}
.team-links-glyph {
  flex: 0 0 auto;
  width: 30px;
  height: 30px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--ui-radius-sm);
  background: rgb(var(--ui-surface-2));
  color: rgb(var(--ui-accent-strong));
  font-size: var(--ui-text-sm);
}
.team-links-body {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
  flex: 1 1 auto;
}
.team-links-label {
  font-size: var(--ui-text-sm);
  font-weight: 600;
}
.team-links-desc {
  font-size: var(--ui-text-xs);
  color: rgb(var(--ui-muted));
  overflow-wrap: anywhere;
}
.team-links-arrow {
  flex: 0 0 auto;
  color: rgb(var(--ui-muted));
}

/* ---- metadados read-only ------------------------------------------------------- */
.team-meta {
  margin: 0;
  display: grid;
  gap: var(--ui-space-3);
}
.team-meta-row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--ui-space-3);
}
.team-meta dt {
  font-size: var(--ui-text-xs);
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: rgb(var(--ui-muted));
}
.team-meta dd {
  margin: 0;
  font-size: var(--ui-text-sm);
  color: rgb(var(--ui-fg));
  text-align: right;
}

/* ---- SubmitBar — barra de ações ao fim do formulário --------------------------- */
.team-submitbar {
  position: sticky;
  bottom: 0;
  z-index: 1;
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
.team-submitbar-note {
  display: inline-flex;
  align-items: center;
  gap: var(--ui-space-2);
  margin: 0;
  font-size: var(--ui-text-sm);
  color: rgb(var(--ui-muted));
}
.team-submitbar-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: rgb(var(--ui-ok));
}
.team-submitbar-note[data-dirty='true'] {
  color: rgb(var(--ui-accent-strong));
  font-weight: 600;
}
.team-submitbar-note[data-dirty='true'] .team-submitbar-dot {
  background: rgb(var(--ui-warn));
}
.team-submitbar-actions {
  display: flex;
  gap: var(--ui-space-2);
  flex-wrap: wrap;
}

/* ---- responsivo ---------------------------------------------------------------- */
@media (max-width: 920px) {
  .team-edit-grid {
    grid-template-columns: 1fr;
  }
}
@media (max-width: 640px) {
  .team-status {
    grid-template-columns: 1fr;
  }
  .team-submitbar {
    align-items: stretch;
  }
  .team-submitbar-actions {
    width: 100%;
  }
  .team-submitbar-actions :deep(.ui-btn) {
    flex: 1 1 auto;
  }
}
</style>
