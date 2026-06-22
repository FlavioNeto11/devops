<template>
  <UiPageLayout
    eyebrow="Times & Filas"
    title="Novo time/fila"
    subtitle="Crie uma fila de atendimento com líder e política de SLA padrão. O roteamento de chamados usa estes valores para distribuir e cronometrar o trabalho da equipe."
    width="default"
  >
    <template #actions>
      <UiButton variant="ghost" to="/teams">Voltar às equipes</UiButton>
    </template>

    <!-- Banner auxiliar: possível duplicidade de nome (fail-soft, nunca bloqueia) -->
    <template #banner>
      <div v-if="dupState === 'found'" class="hf-banner" role="status" aria-live="polite">
        <div class="hf-banner-head">
          <span class="hf-banner-icon" aria-hidden="true">!</span>
          <div class="hf-banner-text">
            <p class="hf-banner-title">Já existe uma fila com nome parecido</p>
            <p class="hf-banner-sub">
              Filas com nomes parecidos confundem o roteamento. Abra a existente em vez de criar
              outra — ou confirme que é mesmo uma nova fila.
            </p>
          </div>
          <UiButton variant="subtle" size="sm" @click="dismissDuplicates">Ignorar</UiButton>
        </div>
        <ul class="hf-dup-list">
          <li v-for="d in duplicates" :key="d.id" class="hf-dup-item">
            <div class="hf-dup-main">
              <RouterLink :to="'/teams/' + d.id" class="hf-dup-name">{{ d.name || ('#' + d.id) }}</RouterLink>
              <span class="hf-dup-meta">{{ d.description || 'Sem descrição' }}</span>
            </div>
            <div class="hf-dup-side">
              <UiStatusBadge :status="d.status || 'active'" size="sm" />
              <UiButton variant="ghost" size="sm" :to="'/teams/' + d.id">Abrir</UiButton>
            </div>
          </li>
        </ul>
      </div>
    </template>

    <div class="hf-grid">
      <!-- Coluna do formulário ----------------------------------------------->
      <UiCard class="hf-form-card">
        <form class="hf-form" novalidate @submit.prevent="submit">
          <!-- Identificação -->
          <UiFormSection
            title="Identificação"
            description="O nome aparece em todo lugar onde a fila é referenciada: atribuição de chamados, relatórios e roteamento."
            :columns="1"
          >
            <UiFormField
              label="Nome do time/fila"
              :required="true"
              :error="f.errors.name"
              :full-width="true"
              :hint="nameHint"
            >
              <template #default="{ id, describedBy }">
                <div class="hf-input-wrap">
                  <input
                    :id="id"
                    type="text"
                    autocomplete="off"
                    :aria-describedby="describedBy"
                    :value="f.values.name"
                    placeholder="Ex.: Suporte N1, Faturamento, Infraestrutura"
                    @input="onNameInput($event.target.value)"
                    @blur="checkDuplicates"
                  />
                  <span v-if="dupState === 'checking'" class="hf-input-spin" aria-hidden="true">
                    <span class="ui-spin" />
                  </span>
                  <span v-else-if="dupState === 'clean'" class="hf-input-ok" aria-hidden="true">✓</span>
                </div>
              </template>
            </UiFormField>

            <UiFormField
              label="Descrição"
              :error="f.errors.description"
              :full-width="true"
              hint="O que esta fila atende e quando usá-la. Ajuda quem encaminha chamados a escolher certo."
            >
              <template #default="{ id, describedBy }">
                <textarea
                  :id="id"
                  rows="4"
                  :aria-describedby="describedBy"
                  :value="f.values.description"
                  placeholder="Ex.: Primeiro nível de suporte — triagem e resolução de incidentes comuns. Escala para o N2 quando preciso."
                  @input="f.setField('description', $event.target.value)"
                ></textarea>
              </template>
            </UiFormField>
          </UiFormSection>

          <!-- Liderança -->
          <UiFormSection
            title="Liderança"
            description="O líder coordena a fila e recebe os alertas de SLA estourado. Opcional — você pode definir depois."
            :columns="1"
          >
            <UiFormField
              label="Líder do time"
              :error="f.errors.lead_agent_id"
              :full-width="true"
              :hint="leadHint"
            >
              <template #default="{ id, describedBy }">
                <!-- erro de carga: input manual + retry (fail-soft, nunca trava o cadastro) -->
                <div v-if="agentsState === 'error'" class="hf-fallback">
                  <input
                    :id="id"
                    type="number"
                    inputmode="numeric"
                    min="1"
                    step="1"
                    :aria-describedby="describedBy"
                    :value="f.values.lead_agent_id"
                    placeholder="ID do agente líder"
                    @input="f.setField('lead_agent_id', $event.target.value)"
                  />
                  <UiButton variant="subtle" size="sm" type="button" @click="loadAgents">Recarregar lista</UiButton>
                </div>
                <select
                  v-else
                  :id="id"
                  :aria-describedby="describedBy"
                  :disabled="agentsState === 'loading'"
                  :value="f.values.lead_agent_id"
                  @change="f.setField('lead_agent_id', $event.target.value)"
                >
                  <option value="">{{ agentsState === 'loading' ? 'Carregando agentes…' : 'Sem líder definido' }}</option>
                  <option v-for="a in agentItems" :key="a.id" :value="a.id">{{ agentLabel(a) }}</option>
                </select>
              </template>
            </UiFormField>

            <!-- Sem nenhum agente ativo: CTA para provisionar (rota de domínio) -->
            <p v-if="agentsState === 'empty'" class="hf-inline-empty">
              Nenhum agente ativo cadastrado.
              <RouterLink to="/agents/new" class="hf-link">Provisionar um agente</RouterLink>
              para indicá-lo como líder — ou siga sem líder por enquanto.
            </p>
          </UiFormSection>

          <!-- Roteamento & SLA -->
          <UiFormSection
            title="Roteamento & SLA"
            description="A política de SLA padrão define os prazos dos chamados que caem nesta fila sem SLA próprio."
            :columns="1"
          >
            <UiFormField
              label="SLA padrão"
              :error="f.errors.default_sla_policy_id"
              :full-width="true"
              :hint="slaHint"
            >
              <template #default="{ id, describedBy }">
                <div v-if="slaState === 'error'" class="hf-fallback">
                  <input
                    :id="id"
                    type="number"
                    inputmode="numeric"
                    min="1"
                    step="1"
                    :aria-describedby="describedBy"
                    :value="f.values.default_sla_policy_id"
                    placeholder="ID da política de SLA"
                    @input="f.setField('default_sla_policy_id', $event.target.value)"
                  />
                  <UiButton variant="subtle" size="sm" type="button" @click="loadSlas">Recarregar lista</UiButton>
                </div>
                <select
                  v-else
                  :id="id"
                  :aria-describedby="describedBy"
                  :disabled="slaState === 'loading'"
                  :value="f.values.default_sla_policy_id"
                  @change="f.setField('default_sla_policy_id', $event.target.value)"
                >
                  <option value="">{{ slaState === 'loading' ? 'Carregando políticas…' : 'Sem SLA padrão' }}</option>
                  <option v-for="p in slaItems" :key="p.id" :value="p.id">{{ slaLabel(p) }}</option>
                </select>
              </template>
            </UiFormField>

            <!-- Pré-visualização dos prazos da política escolhida (contextual) -->
            <div v-if="selectedSla" class="hf-sla-preview" aria-live="polite">
              <div class="hf-sla-preview-head">
                <span class="hf-sla-preview-eyebrow">Prazos desta fila</span>
                <UiStatusBadge
                  :status="selectedSla.priority || 'medium'"
                  size="sm"
                  :label="priorityLabel(selectedSla.priority)"
                />
              </div>
              <dl class="hf-sla-metrics">
                <div class="hf-sla-metric">
                  <dt>Primeira resposta</dt>
                  <dd>{{ formatMinutes(selectedSla.first_response_mins) }}</dd>
                </div>
                <div class="hf-sla-metric">
                  <dt>Resolução</dt>
                  <dd>{{ formatMinutes(selectedSla.resolution_mins) }}</dd>
                </div>
                <div class="hf-sla-metric">
                  <dt>Janela</dt>
                  <dd>{{ selectedSla.business_hours_only ? 'Horário comercial' : '24x7' }}</dd>
                </div>
              </dl>
            </div>

            <!-- Sem nenhuma política cadastrada: CTA para criar (rota de domínio) -->
            <p v-if="slaState === 'empty'" class="hf-inline-empty">
              Nenhuma política de SLA cadastrada ainda.
              <RouterLink to="/sla-policies/new" class="hf-link">Criar a primeira política</RouterLink>
              para usar como padrão desta fila.
            </p>
          </UiFormSection>

          <!-- Situação inicial -->
          <UiFormSection
            title="Situação inicial"
            description="Filas ativas entram no roteamento de chamados. Crie inativa se a fila ainda não deve receber trabalho."
            :columns="1"
          >
            <UiFormField
              label="Estado ao criar"
              hint="Você pode alterar a situação depois na lista de equipes."
            >
              <template #default="{ id }">
                <div :id="id" class="hf-segmented" role="radiogroup" aria-label="Situação inicial da fila">
                  <button
                    v-for="opt in statusOptions"
                    :key="opt.value"
                    type="button"
                    class="hf-segmented-opt"
                    role="radio"
                    :aria-checked="String(f.values.status === opt.value)"
                    :data-active="f.values.status === opt.value ? 'true' : 'false'"
                    @click="f.setField('status', opt.value)"
                  >
                    <span class="hf-segmented-dot" :data-tone="opt.tone" aria-hidden="true" />
                    {{ opt.label }}
                  </button>
                </div>
              </template>
            </UiFormField>
          </UiFormSection>

          <!-- Erro de envio -->
          <p v-if="submitError" class="hf-submit-error" role="alert">{{ submitError }}</p>

          <!-- SubmitBar -->
          <div class="hf-submitbar">
            <p class="hf-submit-hint">
              <span v-if="dupState === 'found'" class="hf-warn">Há possível duplicidade — confirmaremos antes de criar.</span>
              <span v-else-if="!isActive" class="hf-warn">Fila inativa não recebe chamados até ser ativada.</span>
              <span v-else class="ui-muted">Os campos com * são obrigatórios.</span>
            </p>
            <div class="hf-submit-actions">
              <UiButton variant="ghost" type="button" :disabled="f.submitting.value" @click="cancel">Cancelar</UiButton>
              <UiButton type="submit" :loading="f.submitting.value">Criar fila</UiButton>
            </div>
          </div>
        </form>
      </UiCard>

      <!-- Coluna lateral: resumo ao vivo do que será criado ------------------>
      <aside class="hf-aside">
        <UiCard title="Resumo da fila" subtitle="Confira antes de criar.">
          <div class="hf-summary">
            <header class="hf-summary-head">
              <span class="hf-glyph" aria-hidden="true">◫</span>
              <div class="hf-summary-id">
                <p class="hf-summary-name">{{ f.values.name || 'Sem nome' }}</p>
                <p class="hf-summary-desc">{{ f.values.description || 'Sem descrição' }}</p>
              </div>
            </header>
            <dl class="hf-dl">
              <div class="hf-dl-row">
                <dt>Situação</dt>
                <dd>
                  <UiStatusBadge
                    :status="isActive ? 'active' : 'inactive'"
                    :label="isActive ? 'Ativa' : 'Inativa'"
                  />
                </dd>
              </div>
              <div class="hf-dl-row">
                <dt>Líder</dt>
                <dd>{{ leadSummary }}</dd>
              </div>
              <div class="hf-dl-row">
                <dt>SLA padrão</dt>
                <dd>{{ slaSummary }}</dd>
              </div>
            </dl>
          </div>
          <template #footer>
            <p class="hf-summary-foot ui-muted">
              {{ isActive
                ? 'Esta fila entrará no roteamento e poderá receber chamados imediatamente.'
                : 'Esta fila ficará fora do roteamento até você ativá-la.' }}
            </p>
          </template>
        </UiCard>

        <UiCard title="Como a fila é usada">
          <ul class="hf-help">
            <li class="hf-help-item">
              <span class="hf-help-dot" data-tone="accent" aria-hidden="true" />
              <span class="hf-help-text">
                <span class="hf-help-name">Roteamento</span>
                <span class="hf-help-desc">Chamados são distribuídos por fila; agentes desta fila atendem o que cai nela.</span>
              </span>
            </li>
            <li class="hf-help-item">
              <span class="hf-help-dot" data-tone="warn" aria-hidden="true" />
              <span class="hf-help-text">
                <span class="hf-help-name">SLA padrão</span>
                <span class="hf-help-desc">Aplica prazos automáticos aos chamados sem SLA próprio nesta fila.</span>
              </span>
            </li>
            <li class="hf-help-item">
              <span class="hf-help-dot" data-tone="ok" aria-hidden="true" />
              <span class="hf-help-text">
                <span class="hf-help-name">Líder</span>
                <span class="hf-help-desc">Coordena a equipe e recebe alertas de SLA estourado.</span>
              </span>
            </li>
          </ul>
        </UiCard>
      </aside>
    </div>
  </UiPageLayout>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { RouterLink, useRouter } from 'vue-router';
import {
  UiPageLayout,
  UiCard,
  UiFormSection,
  UiFormField,
  UiButton,
  UiStatusBadge,
  useForm,
  useToast,
  useConfirm,
  validators,
} from '../ui/index.js';
// Recursos de domínio (named exports garantidos pelo integrador em api.js):
//   teams → /v1/teams · agents → /v1/agents · slaPolicies → /v1/sla-policies
import { teams, agents, slaPolicies } from '../api.js';

const router = useRouter();
const toast = useToast();
const confirm = useConfirm();

const statusOptions = [
  { value: 'active', label: 'Ativa', tone: 'ok' },
  { value: 'inactive', label: 'Inativa', tone: 'muted' },
];

// ---- Formulário (entidade teams) --------------------------------------------
const f = useForm({
  initial: {
    name: '',
    description: '',
    lead_agent_id: '',
    default_sla_policy_id: '',
    status: 'active',
  },
  rules: {
    name: [validators.required('Informe o nome da fila'), validators.minLen(2), validators.maxLen(80)],
    description: [validators.maxLen(500)],
    lead_agent_id: [validators.numeric('Líder deve ser um agente válido'), validators.min(1, 'Líder inválido')],
    default_sla_policy_id: [validators.numeric('SLA deve ser uma política válida'), validators.min(1, 'SLA inválido')],
  },
});

const isActive = computed(() => f.values.status === 'active');

// ---- Opções de líder (agents) — fail-soft -----------------------------------
// agentsState: loading | ready | empty | error
const agentItems = ref([]);
const agentsState = ref('loading');
async function loadAgents() {
  agentsState.value = 'loading';
  try {
    const res = await agents.list({ pageSize: 200, status: 'active', sort: 'name', dir: 'asc' });
    const rows = (res && res.data) || [];
    agentItems.value = rows;
    agentsState.value = rows.length ? 'ready' : 'empty';
  } catch (e) {
    agentItems.value = [];
    agentsState.value = 'error';
  }
}
function agentLabel(a) {
  const name = a.name || a.email || ('Agente ' + a.id);
  return a.name && a.email ? name + ' · ' + a.email : name;
}
const leadHint = computed(() => {
  switch (agentsState.value) {
    case 'loading': return 'Carregando agentes ativos…';
    case 'empty': return 'Nenhum agente ativo encontrado — você pode definir o líder depois.';
    case 'error': return 'Não deu para carregar a lista de agentes — informe o ID manualmente ou tente recarregar.';
    default: return 'Escolha quem coordena esta fila. Opcional.';
  }
});

// ---- Opções de SLA padrão (sla-policies) — fail-soft ------------------------
// slaState: loading | ready | empty | error
const slaItems = ref([]);
const slaState = ref('loading');
async function loadSlas() {
  slaState.value = 'loading';
  try {
    const res = await slaPolicies.list({ pageSize: 200, sort: 'first_response_mins', dir: 'asc' });
    const rows = (res && res.data) || [];
    slaItems.value = rows;
    slaState.value = rows.length ? 'ready' : 'empty';
  } catch (e) {
    slaItems.value = [];
    slaState.value = 'error';
  }
}
function slaLabel(p) {
  return p.name || ('Política ' + p.id);
}
const slaHint = computed(() => {
  switch (slaState.value) {
    case 'loading': return 'Carregando políticas de SLA…';
    case 'empty': return 'Nenhuma política cadastrada — crie uma para definir prazos automáticos.';
    case 'error': return 'Não deu para carregar as políticas — informe o ID manualmente ou tente recarregar.';
    default: return 'Prazos aplicados aos chamados sem SLA próprio nesta fila. Opcional.';
  }
});
const selectedSla = computed(() => {
  const id = String(f.values.default_sla_policy_id || '');
  if (!id) return null;
  return slaItems.value.find((p) => String(p.id) === id) || null;
});

// ---- Resumos ao vivo (lado direito) -----------------------------------------
const leadSummary = computed(() => {
  const id = f.values.lead_agent_id;
  if (!id) return 'Sem líder';
  const found = agentItems.value.find((a) => String(a.id) === String(id));
  return found ? (found.name || found.email || ('Agente ' + id)) : ('Agente #' + id);
});
const slaSummary = computed(() => {
  const id = f.values.default_sla_policy_id;
  if (!id) return 'Sem SLA padrão';
  const found = slaItems.value.find((p) => String(p.id) === String(id));
  return found ? slaLabel(found) : ('Política #' + id);
});

// ---- Verificação de nome duplicado (fail-soft, nunca bloqueia) --------------
// dupState: idle | checking | found | clean | error
const dupState = ref('idle');
const duplicates = ref([]);
let lastChecked = '';

const nameHint = computed(() => {
  switch (dupState.value) {
    case 'checking': return 'Procurando filas com nome parecido…';
    case 'clean': return 'Nenhuma fila com este nome. Tudo certo.';
    case 'found': return 'Encontramos fila(s) com nome parecido — veja o aviso acima.';
    case 'error': return 'Não deu para verificar duplicidade agora — você ainda pode criar.';
    default: return 'Nome curto e claro funciona melhor no roteamento e nos relatórios.';
  }
});

function onNameInput(value) {
  f.setField('name', value);
  if (dupState.value !== 'checking') {
    dupState.value = 'idle';
    duplicates.value = [];
  }
}
function dismissDuplicates() {
  dupState.value = 'idle';
  duplicates.value = [];
}
async function checkDuplicates() {
  const name = String(f.values.name || '').trim();
  if (!name || !f.validateField('name')) return;
  const key = name.toLowerCase();
  if (key === lastChecked && (dupState.value === 'found' || dupState.value === 'clean')) return;
  lastChecked = key;
  dupState.value = 'checking';
  try {
    const res = await teams.list({ q: name, pageSize: 5 });
    const rows = (res && res.data) || [];
    const matches = rows.filter((row) => String(row.name || '').trim().toLowerCase() === key);
    duplicates.value = matches;
    dupState.value = matches.length ? 'found' : 'clean';
  } catch (e) {
    // verificação auxiliar — nunca bloqueia a criação.
    duplicates.value = [];
    dupState.value = 'error';
  }
}

// ---- Formatação --------------------------------------------------------------
function formatMinutes(mins) {
  const n = Number(mins);
  if (!isFinite(n) || n <= 0) return '—';
  if (n % 1440 === 0) { const d = n / 1440; return d + (d === 1 ? ' dia' : ' dias'); }
  if (n < 60) return n + ' min';
  const h = Math.floor(n / 60);
  const m = n % 60;
  if (m === 0) return h + (h === 1 ? ' hora' : ' horas');
  return h + 'h ' + m + 'min';
}
function priorityLabel(p) {
  const map = { urgent: 'Urgente', high: 'Alta', medium: 'Média', low: 'Baixa' };
  return map[p] || (p || 'Média');
}

// ---- Submit -----------------------------------------------------------------
const submitError = ref('');

function buildPayload(vals) {
  // Preserva o id como veio do backend (numérico OU string/uuid); só vazio/ausente
  // vira null — não coage para Number para não perder o vínculo silenciosamente.
  const toId = (v) => (v === '' || v === null || v === undefined ? null : v);
  return {
    name: String(vals.name || '').trim(),
    description: String(vals.description || '').trim() || null,
    lead_agent_id: toId(vals.lead_agent_id),
    default_sla_policy_id: toId(vals.default_sla_policy_id),
    status: vals.status || 'active',
  };
}

function submit() {
  submitError.value = '';
  f.handleSubmit(async (vals) => {
    // Confirmação ao criar com nome duplicado (evita roteamento ambíguo).
    if (dupState.value === 'found' && duplicates.value.length) {
      const ok = await confirm({
        title: 'Criar mesmo com nome parecido?',
        message:
          'Encontramos ' + duplicates.value.length + ' fila(s) com nome parecido. ' +
          'Nomes parecidos confundem o roteamento de chamados. Criar mesmo assim?',
        confirmLabel: 'Criar assim mesmo',
        cancelLabel: 'Revisar',
        danger: true,
      });
      if (!ok) return;
    }
    // Confirmação ao criar uma fila inativa (não entra no roteamento).
    if (vals.status !== 'active') {
      const ok = await confirm({
        title: 'Criar fila inativa?',
        message:
          'Uma fila inativa fica fora do roteamento e não recebe chamados até ser ativada. Criar assim mesmo?',
        confirmLabel: 'Criar inativa',
        cancelLabel: 'Manter ativa',
      });
      if (!ok) return;
    }
    try {
      const created = await teams.create(buildPayload(vals));
      toast.success('Fila criada', { detail: String(vals.name || '').trim() });
      const id = created && (created.id || (created.data && created.data.id));
      router.push(id ? '/teams/' + id : '/teams');
    } catch (e) {
      const msg = e && e.message ? e.message : 'Falha ao criar a fila.';
      submitError.value = msg;
      toast.error('Não foi possível criar a fila', {
        detail: msg,
        code: e && e.status ? 'HTTP ' + e.status : '',
      });
    }
  });
}

const cancel = () => router.push('/teams');

onMounted(() => {
  loadAgents();
  loadSlas();
});
</script>

<style scoped>
/* ---- Layout em 2 colunas (form + resumo) ---- */
.hf-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 320px;
  gap: var(--ui-space-5);
  align-items: start;
}
.hf-form-card { min-width: 0; }
.hf-form { display: flex; flex-direction: column; }
.hf-aside {
  display: flex; flex-direction: column; gap: var(--ui-space-4);
  position: sticky; top: var(--ui-space-5);
}

/* ---- Input com indicador (verificação de nome) ---- */
.hf-input-wrap { position: relative; display: flex; align-items: center; }
.hf-input-spin {
  position: absolute; right: 11px; top: 50%; transform: translateY(-50%);
  color: rgb(var(--ui-accent-strong)); pointer-events: none; display: inline-flex;
}
.hf-input-ok {
  position: absolute; right: 11px; top: 50%; transform: translateY(-50%);
  color: rgb(var(--ui-ok)); font-weight: 700; pointer-events: none;
}

/* ---- Fallback de FK quando a lista falha (input manual + retry) ---- */
.hf-fallback { display: flex; align-items: center; gap: var(--ui-space-2); }
.hf-fallback input { flex: 1 1 auto; }

/* ---- Empty inline (sem agente ativo / sem SLA cadastrado) ---- */
.hf-inline-empty {
  margin: 0; font-size: var(--ui-text-sm); color: rgb(var(--ui-muted));
  padding: var(--ui-space-3); border: 1px dashed rgb(var(--ui-border-strong));
  border-radius: var(--ui-radius-md); background: rgb(var(--ui-surface-2) / 0.5);
}
.hf-link { color: rgb(var(--ui-accent-strong)); font-weight: 600; text-decoration: none; }
.hf-link:hover { text-decoration: underline; }

/* ---- Pré-visualização do SLA ---- */
.hf-sla-preview {
  border: 1px solid rgb(var(--ui-accent) / 0.3);
  background: rgb(var(--ui-accent) / 0.06);
  border-radius: var(--ui-radius-lg);
  padding: var(--ui-space-4);
}
.hf-sla-preview-head {
  display: flex; align-items: center; justify-content: space-between;
  gap: var(--ui-space-3); margin-bottom: var(--ui-space-3);
}
.hf-sla-preview-eyebrow {
  text-transform: uppercase; letter-spacing: 0.07em;
  font-size: var(--ui-text-xs); font-weight: 700; color: rgb(var(--ui-accent-strong));
}
.hf-sla-metrics { display: grid; grid-template-columns: repeat(3, 1fr); gap: var(--ui-space-3); margin: 0; }
.hf-sla-metric {
  background: rgb(var(--ui-surface)); border: 1px solid rgb(var(--ui-border));
  border-radius: var(--ui-radius-md); padding: var(--ui-space-3);
}
.hf-sla-metric dt {
  font-size: var(--ui-text-xs); color: rgb(var(--ui-muted));
  text-transform: uppercase; letter-spacing: 0.04em; font-weight: 600;
}
.hf-sla-metric dd {
  margin: 4px 0 0; font-family: var(--ui-font-display);
  font-size: var(--ui-text-lg); font-weight: 700; color: rgb(var(--ui-fg));
}

/* ---- Situação (segmented control acessível, CSP-safe) ---- */
.hf-segmented {
  display: inline-flex; gap: 0; border: 1px solid rgb(var(--ui-border-strong));
  border-radius: var(--ui-radius-md); padding: 3px; background: rgb(var(--ui-surface-2)); flex-wrap: wrap;
}
.hf-segmented-opt {
  display: inline-flex; align-items: center; gap: var(--ui-space-2);
  font: inherit; font-size: var(--ui-text-sm); font-weight: 600; color: rgb(var(--ui-muted));
  background: transparent; border: none; border-radius: var(--ui-radius-sm);
  padding: 7px 14px; cursor: pointer; transition: background 0.15s ease, color 0.15s ease;
}
.hf-segmented-opt:hover { color: rgb(var(--ui-fg)); }
.hf-segmented-opt:focus-visible { outline: 2px solid rgb(var(--ui-accent)); outline-offset: 2px; }
.hf-segmented-opt[data-active="true"] {
  background: rgb(var(--ui-surface)); color: rgb(var(--ui-fg)); box-shadow: var(--ui-shadow-sm);
}
.hf-segmented-dot { width: 8px; height: 8px; border-radius: 50%; background: rgb(var(--ui-faint)); }
.hf-segmented-dot[data-tone="ok"] { background: rgb(var(--ui-ok)); }
.hf-segmented-dot[data-tone="muted"] { background: rgb(var(--ui-faint)); }

/* ---- Banner de duplicidade ---- */
.hf-banner {
  border: 1px solid rgb(var(--ui-warn) / 0.4); background: rgb(var(--ui-warn) / 0.08);
  border-radius: var(--ui-radius-lg); padding: var(--ui-space-4);
  display: flex; flex-direction: column; gap: var(--ui-space-3);
}
.hf-banner-head { display: flex; align-items: flex-start; gap: var(--ui-space-3); }
.hf-banner-icon {
  flex-shrink: 0; width: 26px; height: 26px; display: inline-flex; align-items: center; justify-content: center;
  border-radius: var(--ui-radius-pill); background: rgb(var(--ui-warn) / 0.18); color: rgb(var(--ui-warn)); font-weight: 700;
}
.hf-banner-text { min-width: 0; }
.hf-banner-title { margin: 0; font-weight: 700; color: rgb(var(--ui-fg)); }
.hf-banner-sub { margin: 2px 0 0; font-size: var(--ui-text-sm); color: rgb(var(--ui-muted)); }
.hf-banner-head > :last-child { margin-left: auto; }
.hf-dup-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--ui-space-2); }
.hf-dup-item {
  display: flex; align-items: center; justify-content: space-between; gap: var(--ui-space-3);
  padding: var(--ui-space-2) var(--ui-space-3);
  background: rgb(var(--ui-surface)); border: 1px solid rgb(var(--ui-border)); border-radius: var(--ui-radius-md);
}
.hf-dup-main { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
.hf-dup-name { font-weight: 600; color: rgb(var(--ui-fg)); text-decoration: none; }
.hf-dup-name:hover { text-decoration: underline; }
.hf-dup-meta {
  font-size: var(--ui-text-xs); color: rgb(var(--ui-muted));
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 38ch;
}
.hf-dup-side { display: flex; align-items: center; gap: var(--ui-space-2); flex-shrink: 0; }

/* ---- Resumo lateral ---- */
.hf-summary { display: flex; flex-direction: column; gap: var(--ui-space-4); }
.hf-summary-head { display: flex; align-items: center; gap: var(--ui-space-3); }
.hf-glyph {
  display: inline-flex; align-items: center; justify-content: center;
  width: 44px; height: 44px; flex-shrink: 0; border-radius: var(--ui-radius-md);
  background: rgb(var(--ui-accent) / 0.14); color: rgb(var(--ui-accent-strong)); font-size: var(--ui-text-xl);
}
.hf-summary-id { display: flex; flex-direction: column; min-width: 0; line-height: 1.3; }
.hf-summary-name { margin: 0; font-weight: 700; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.hf-summary-desc {
  margin: 1px 0 0; font-size: var(--ui-text-xs); color: rgb(var(--ui-muted));
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
}
.hf-summary-foot { margin: 0; font-size: var(--ui-text-sm); }

.hf-dl { margin: 0; display: flex; flex-direction: column; }
.hf-dl-row {
  display: flex; align-items: center; justify-content: space-between; gap: var(--ui-space-3);
  padding: var(--ui-space-3) 0; border-bottom: 1px solid rgb(var(--ui-border));
}
.hf-dl-row:last-child { border-bottom: none; }
.hf-dl-row dt { color: rgb(var(--ui-muted)); font-size: var(--ui-text-sm); font-weight: 600; }
.hf-dl-row dd {
  margin: 0; color: rgb(var(--ui-fg)); text-align: right; min-width: 0;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}

/* ---- Ajuda lateral ---- */
.hf-help { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--ui-space-3); }
.hf-help-item { display: flex; align-items: flex-start; gap: var(--ui-space-3); }
.hf-help-dot { width: 9px; height: 9px; border-radius: 50%; flex-shrink: 0; margin-top: 5px; background: rgb(var(--ui-muted)); }
.hf-help-dot[data-tone="accent"] { background: rgb(var(--ui-accent)); }
.hf-help-dot[data-tone="warn"] { background: rgb(var(--ui-warn)); }
.hf-help-dot[data-tone="ok"] { background: rgb(var(--ui-ok)); }
.hf-help-text { display: flex; flex-direction: column; gap: 1px; }
.hf-help-name { font-weight: 600; font-size: var(--ui-text-sm); }
.hf-help-desc { font-size: var(--ui-text-xs); color: rgb(var(--ui-muted)); line-height: 1.4; }

/* ---- Erro de submit ---- */
.hf-submit-error {
  margin: 0 0 var(--ui-space-4); padding: var(--ui-space-3) var(--ui-space-4);
  border: 1px solid rgb(var(--ui-danger) / 0.4); background: rgb(var(--ui-danger) / 0.08);
  color: rgb(var(--ui-danger)); border-radius: var(--ui-radius-md);
  font-size: var(--ui-text-sm); font-weight: 600;
}

/* ---- SubmitBar ---- */
.hf-submitbar {
  display: flex; align-items: center; justify-content: space-between; gap: var(--ui-space-4);
  flex-wrap: wrap; padding-top: var(--ui-space-4); border-top: 1px solid rgb(var(--ui-border));
}
.hf-submit-hint { margin: 0; font-size: var(--ui-text-sm); }
.hf-warn { color: rgb(var(--ui-warn)); font-weight: 600; }
.hf-submit-actions { display: flex; gap: var(--ui-space-2); margin-left: auto; }

/* ---- Responsivo ---- */
@media (max-width: 980px) {
  .hf-grid { grid-template-columns: 1fr; }
  .hf-aside { position: static; }
}
@media (max-width: 640px) {
  .hf-sla-metrics { grid-template-columns: 1fr; }
  .hf-segmented { width: 100%; }
  .hf-segmented-opt { flex: 1 1 auto; justify-content: center; }
  .hf-submitbar { align-items: stretch; }
  .hf-submit-actions { width: 100%; }
  .hf-submit-actions :deep(.ui-btn) { flex: 1 1 auto; }
}
</style>
