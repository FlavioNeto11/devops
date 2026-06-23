<template>
  <UiPageLayout
    eyebrow="Equipe & RBAC"
    title="Editar agente"
    :subtitle="headerSubtitle"
    width="narrow"
    :loading="loading"
    loading-message="Carregando dados do agente…"
    :error="loadError"
    @retry="reload"
  >
    <template #actions>
      <UiButton variant="ghost" :to="listTo">Voltar</UiButton>
      <UiButton variant="subtle" :to="detailTo" :disabled="!loaded || !record">Ver agente</UiButton>
    </template>

    <!-- Estado: registro inexistente (carregou sem erro, mas sem dados) -->
    <UiEmptyState
      v-if="loaded && !record"
      icon="user"
      title="Agente não encontrado"
      description="O agente que você tentou editar não existe mais ou foi removido do service desk."
    >
      <template #action>
        <UiButton :to="listTo">Voltar para agentes</UiButton>
      </template>
    </UiEmptyState>

    <!-- Estado normal: formulário de edição de permissão -->
    <template v-else-if="loaded && record">
      <!-- EntityHeader: identidade read-only de quem está sendo editado -->
      <UiCard>
        <div class="ag-identity">
          <span class="ag-avatar" aria-hidden="true">{{ initials }}</span>
          <div class="ag-identity-id">
            <p class="ag-identity-name">{{ f.values.name || 'Agente sem nome' }}</p>
            <p class="ag-identity-mail">{{ record.email || 'Sem e-mail cadastrado' }}</p>
          </div>
          <div class="ag-identity-badges">
            <UiStatusBadge :status="f.values.role" :tone="currentRoleTone" :label="currentRoleLabel" size="lg" />
            <UiStatusBadge :status="f.values.status" :label="statusLabelFor(f.values.status)" size="lg" />
          </div>
        </div>
      </UiCard>

      <!-- Banner de mudança de permissão (aparece só quando o papel muda) -->
      <UiCard v-if="roleChanged" class="ag-warn">
        <p class="ag-warn-text">
          <span class="ag-warn-mark" aria-hidden="true">!</span>
          <span>
            Você está alterando o papel de <strong>{{ baselineRoleLabel }}</strong> para
            <strong>{{ currentRoleLabel }}</strong>. Isso muda o que esta pessoa pode ver e fazer no
            service desk — será pedida confirmação ao salvar.
          </span>
        </p>
      </UiCard>

      <UiCard title="Acesso e permissões" subtitle="Defina o papel RBAC, o time e a situação do agente.">
        <form class="ag-form" novalidate @submit.prevent="save">
          <!-- Identidade: nome editável (e-mail fica na camada OIDC) -->
          <UiFormSection
            title="Identidade"
            description="Nome de exibição do agente. O e-mail é gerenciado pelo OIDC e não pode ser alterado aqui."
            :columns="1"
          >
            <UiFormField
              label="Nome"
              :error="f.errors.name"
              :required="true"
              hint="Como o agente aparece nos chamados e atribuições."
            >
              <template #default="{ id, describedBy }">
                <input
                  :id="id"
                  type="text"
                  autocomplete="name"
                  maxlength="120"
                  :aria-describedby="describedBy"
                  :value="f.values.name"
                  placeholder="Ex.: Ana Ribeiro"
                  @input="f.setField('name', $event.target.value)"
                  @blur="f.validateField('name')"
                />
              </template>
            </UiFormField>
          </UiFormSection>

          <!-- RolePicker: papel RBAC como cartões de rádio acessíveis -->
          <UiFormSection
            title="Papel (RBAC)"
            description="O papel determina as permissões da pessoa no service desk."
            :columns="1"
          >
            <UiFormField full-width :error="f.errors.role" :required="true" label="Selecione o papel">
              <template #default="{ id, describedBy, hasError }">
                <div
                  :id="id"
                  class="ag-roles"
                  role="radiogroup"
                  aria-label="Papel do agente"
                  :aria-describedby="describedBy"
                  :aria-invalid="hasError ? 'true' : null"
                >
                  <label
                    v-for="role in ROLES"
                    :key="role.value"
                    class="ag-role"
                    :data-selected="f.values.role === role.value ? 'true' : 'false'"
                  >
                    <input
                      class="ag-role-input"
                      type="radio"
                      name="agent-role"
                      :value="role.value"
                      :checked="f.values.role === role.value"
                      @change="f.setField('role', role.value)"
                    />
                    <span class="ag-role-mark" aria-hidden="true" />
                    <span class="ag-role-body">
                      <span class="ag-role-head">
                        <span class="ag-role-name">{{ role.label }}</span>
                        <UiStatusBadge :status="role.value" :tone="role.tone" :label="role.label" size="sm" />
                      </span>
                      <span class="ag-role-desc">{{ role.description }}</span>
                    </span>
                  </label>
                </div>
              </template>
            </UiFormField>
          </UiFormSection>

          <!-- Lotação (time real) e situação -->
          <UiFormSection title="Lotação e situação" description="Time de atendimento e estado do acesso." :columns="2">
            <UiFormField label="Time" :error="f.errors.team_id" :hint="teamHint">
              <template #default="{ id, describedBy }">
                <select
                  :id="id"
                  :aria-describedby="describedBy"
                  :disabled="teamsLoading"
                  :value="teamSelectValue"
                  @change="f.setField('team_id', $event.target.value)"
                >
                  <option value="">Sem time</option>
                  <option v-for="team in teamOptions" :key="team.value" :value="team.value">{{ team.label }}</option>
                </select>
              </template>
            </UiFormField>

            <UiFormField
              label="Situação"
              :error="f.errors.status"
              :required="true"
              hint="Inativar remove imediatamente o acesso da pessoa ao service desk."
            >
              <template #default="{ id, describedBy }">
                <select
                  :id="id"
                  :aria-describedby="describedBy"
                  :value="f.values.status"
                  @change="f.setField('status', $event.target.value)"
                >
                  <option v-for="opt in STATUS_OPTIONS" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
                </select>
              </template>
            </UiFormField>
          </UiFormSection>

          <!-- Metadados read-only (não editáveis nesta tela: nome/e-mail/tenant na origem) -->
          <dl class="ag-meta">
            <div class="ag-meta-row">
              <dt>Tenant</dt>
              <dd class="ag-mono">{{ tenantText }}</dd>
            </div>
            <div class="ag-meta-row">
              <dt>Último acesso</dt>
              <dd :data-dim="record.last_login_at ? null : 'true'">{{ lastAccessLabel }}</dd>
            </div>
            <div class="ag-meta-row">
              <dt>ID do agente</dt>
              <dd class="ag-mono">{{ record.id }}</dd>
            </div>
          </dl>

          <!-- SubmitBar -->
          <div class="ag-submitbar">
            <p class="ag-submitbar-note" :data-state="submitNoteState">{{ submitNote }}</p>
            <div class="ag-submitbar-actions">
              <UiButton variant="ghost" type="button" :disabled="f.submitting.value" @click="cancel">Cancelar</UiButton>
              <UiButton type="submit" :loading="f.submitting.value" :disabled="!isDirty">Salvar alterações</UiButton>
            </div>
          </div>
        </form>
      </UiCard>
    </template>
  </UiPageLayout>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
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
// Recursos de DOMÍNIO reais (backend expõe /v1/<name> em api/src/server.js):
//  - agents → GET /v1/agents/:id (carregar) · PATCH-equivalente PUT /v1/agents/:id (salvar)
//  - teams  → GET /v1/teams (popular o select de lotação com nomes reais; degradação
//    graciosa quando indisponível — nunca fabricamos times).
import { agents, teams } from '../api.js';

const props = defineProps({ id: { type: String, default: null } });

const router = useRouter();
const toast = useToast();
const confirm = useConfirm();

// Destinos por ROTA NOMEADA (resistem a mudanças de path no router): a lista usa
// 'agents'; o detalhe usa 'agent' quando há id, caindo para a lista quando não há.
const listTo = { name: 'agents' };
const detailTo = computed(() => (props.id ? { name: 'agent', params: { id: props.id } } : { name: 'agents' }));

const loading = ref(true);
const loaded = ref(false);
const loadError = ref(null);
const record = ref(null);

// Times reais p/ o select de lotação (degradação graciosa se a lista falhar).
const teamList = ref([]);
const teamsReady = ref(false);
const teamsLoading = ref(false);

// Papéis RBAC (enum do domínio agents.role) com descrição da capacidade — base do RolePicker.
const ROLES = [
  { value: 'admin', label: 'Admin', tone: 'error', description: 'Acesso total: configura o service desk, gerencia agentes e permissões.' },
  { value: 'supervisor', label: 'Supervisor', tone: 'warning', description: 'Acompanha filas e SLA, reatribui chamados e supervisiona a equipe.' },
  { value: 'agent', label: 'Agente', tone: 'running', description: 'Atende chamados, responde solicitantes e atualiza o andamento.' },
  { value: 'viewer', label: 'Leitor', tone: 'neutral', description: 'Apenas leitura: visualiza chamados e relatórios, sem editar.' },
];
const ROLE_MAP = ROLES.reduce((acc, r) => { acc[r.value] = r; return acc; }, {});

const STATUS_OPTIONS = [
  { value: 'active', label: 'Ativo' },
  { value: 'inactive', label: 'Inativo' },
];

const f = useForm({
  initial: { name: '', role: '', team_id: '', status: 'active' },
  rules: {
    name: [validators.required('Informe o nome do agente'), validators.minLen(2)],
    role: [validators.required('Selecione o papel do agente')],
    status: [validators.required('Selecione a situação')],
    team_id: [validators.numeric('Time inválido')],
  },
});

// snapshot do estado original p/ detectar alterações (dirty) e comparar o papel.
const baseline = reactive({ name: '', role: '', team_id: '', status: 'active' });

const headerSubtitle = computed(() => {
  if (loadError.value || !record.value) return 'Edição de papel, time e situação do agente.';
  const who = f.values.name || record.value.email;
  return who ? 'Editando o acesso de ' + who + '.' : 'Edição de papel, time e situação do agente.';
});

const initials = computed(() => {
  const name = f.values.name || (record.value && record.value.name);
  if (!name) return '–';
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '–';
  const first = parts[0][0] || '';
  const last = parts.length > 1 ? parts[parts.length - 1][0] : '';
  return (first + last).toUpperCase();
});

const currentRoleLabel = computed(() => roleLabel(f.values.role));
const currentRoleTone = computed(() => roleTone(f.values.role));
const baselineRoleLabel = computed(() => roleLabel(baseline.role));

const roleChanged = computed(() => normalize(f.values.role) !== normalize(baseline.role));

const isDirty = computed(() => {
  for (const k of Object.keys(baseline)) {
    if (normalize(f.values[k]) !== normalize(baseline[k])) return true;
  }
  return false;
});

const submitNoteState = computed(() => {
  if (roleChanged.value) return 'permission';
  if (isDirty.value) return 'dirty';
  return 'clean';
});
const submitNote = computed(() => {
  if (roleChanged.value) return 'Mudança de permissão pendente — exige confirmação.';
  if (isDirty.value) return 'Há alterações não salvas.';
  return 'Tudo salvo.';
});

const tenantText = computed(() => {
  const t = record.value && record.value.tenant_id;
  return t !== null && t !== undefined && t !== '' ? '#' + t : '—';
});

const lastAccessLabel = computed(() => {
  const v = record.value && record.value.last_login_at;
  return v ? format.formatDateTime(v) : 'Nunca acessou';
});

// ---- select de time: lista real + time atual garantido entre as opções ----
const teamOptions = computed(() => {
  const opts = teamList.value.map((t) => ({ value: String(t.id), label: teamLabel(t) }));
  const cur = f.values.team_id;
  if (cur !== '' && cur !== null && cur !== undefined && !opts.some((o) => o.value === String(cur))) {
    opts.unshift({ value: String(cur), label: teamFallbackLabel(cur) });
  }
  return opts;
});

// valor do select garantido entre as opções (que sempre incluem o atual)
const teamSelectValue = computed(() => {
  const cur = f.values.team_id;
  if (cur === '' || cur === null || cur === undefined) return '';
  return String(cur);
});

const teamHint = computed(() => {
  if (teamsLoading.value) return 'Carregando times…';
  if (!teamsReady.value) {
    return 'Lista de times indisponível — exibindo o time atual. Recarregue para escolher outro.';
  }
  if (!teamList.value.length) return 'Nenhum time cadastrado ainda. Cadastre times para definir a lotação.';
  return 'Time de atendimento ao qual o agente pertence. Deixe sem time se ainda não definido.';
});

function normalize(v) {
  if (v === null || v === undefined) return '';
  return String(v);
}
function roleTone(role) {
  const r0 = ROLE_MAP[String(role).toLowerCase()];
  return r0 ? r0.tone : 'neutral';
}
function roleLabel(role) {
  if (!role) return '—';
  const r0 = ROLE_MAP[String(role).toLowerCase()];
  return r0 ? r0.label : format.humanize(role);
}
function statusLabelFor(status) {
  const opt = STATUS_OPTIONS.find((o) => o.value === String(status));
  return opt ? opt.label : format.humanize(status);
}
function teamLabel(t) {
  const name = t.name || t.title || t.label || ('Time #' + t.id);
  return name + ' (#' + t.id + ')';
}
// rótulo do time atual quando ele não está na lista (lista indisponível/removido):
// usa o nome embutido no record, se houver; senão identifica pelo número de forma legível.
function teamFallbackLabel(id) {
  const rec = record.value;
  const name = rec && (rec.team_name || rec.team_label);
  return name ? name + ' (atual)' : 'Time atual (#' + id + ')';
}

// o backend pode devolver o registro cru OU embrulhado em { data }
function unwrap(res) {
  return res && typeof res === 'object' && res.data && typeof res.data === 'object' ? res.data : res;
}

function hydrate(rec) {
  const next = {
    name: rec.name || '',
    role: rec.role || '',
    team_id: rec.team_id != null && rec.team_id !== '' ? String(rec.team_id) : '',
    status: rec.status || 'active',
  };
  for (const k of Object.keys(next)) {
    f.values[k] = next[k];
    baseline[k] = next[k];
  }
}

async function loadTeams() {
  teamsLoading.value = true;
  try {
    const res = await teams.list({ page: 1, pageSize: 200 });
    const data = Array.isArray(res) ? res : res.data || res.items || [];
    teamList.value = data.filter((t) => t && t.id !== undefined && t.id !== null);
    teamsReady.value = true;
  } catch {
    // degradação graciosa: sem lista de times, o select ainda mostra o time atual.
    teamList.value = [];
    teamsReady.value = false;
  } finally {
    teamsLoading.value = false;
  }
}

async function reload() {
  if (!props.id) {
    loadError.value = 'Nenhum agente selecionado para edição.';
    loading.value = false;
    return;
  }
  loading.value = true;
  loadError.value = null;
  loaded.value = false;
  try {
    const [raw] = await Promise.all([agents.get(props.id), loadTeams()]);
    const rec = unwrap(raw);
    record.value = rec || null;
    if (rec) hydrate(rec);
    loaded.value = true;
  } catch (e) {
    loadError.value = e && e.message ? e.message : 'Não foi possível carregar o agente.';
  } finally {
    loading.value = false;
  }
}

function buildPayload(vals) {
  return {
    name: String(vals.name || '').trim(),
    role: vals.role,
    // team_id é numérico na entidade; envia número ou null quando "sem time".
    team_id: vals.team_id === '' || vals.team_id === null || vals.team_id === undefined ? null : Number(vals.team_id),
    status: vals.status,
  };
}

function save() {
  f.handleSubmit(async (vals) => {
    const who = (record.value && (record.value.name || record.value.email)) || ('#' + props.id);
    const changingRole = normalize(vals.role) !== normalize(baseline.role);

    // Ação sensível (mudança de permissão) SEMPRE confirma; demais edições também
    // confirmam, com tom não-destrutivo.
    const ok = await confirm({
      title: changingRole ? 'Confirmar mudança de permissão' : 'Salvar alterações',
      message: changingRole
        ? 'Você vai alterar o papel de "' + who + '" de ' + baselineRoleLabel.value + ' para ' + roleLabel(vals.role) + '. Isso muda as permissões da pessoa no service desk. Confirmar?'
        : 'Confirmar a atualização do acesso de "' + who + '"?',
      confirmLabel: changingRole ? 'Alterar permissão' : 'Salvar',
      cancelLabel: 'Revisar',
      danger: changingRole,
    });
    if (!ok) return;

    try {
      const updated = unwrap(await agents.update(props.id, buildPayload(vals)));
      if (updated && typeof updated === 'object' && updated.id !== undefined) {
        record.value = updated;
        hydrate(updated);
      } else {
        // backend sem corpo de resposta: fixa o baseline no estado salvo.
        for (const k of Object.keys(baseline)) baseline[k] = f.values[k];
      }
      toast.success(changingRole ? 'Permissão do agente atualizada.' : 'Agente atualizado.');
      router.push(detailTo.value);
    } catch (e) {
      toast.error('Falha ao salvar o agente.', { detail: e && e.message, code: e && e.status });
    }
  });
}

async function cancel() {
  if (isDirty.value) {
    const leave = await confirm({
      title: 'Descartar alterações?',
      message: 'Você tem alterações não salvas. Sair sem salvar?',
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
.ag-form {
  display: flex;
  flex-direction: column;
}

/* EntityHeader — identidade do agente (read-only) */
.ag-identity {
  display: flex;
  align-items: center;
  gap: var(--ui-space-4);
  flex-wrap: wrap;
}
.ag-avatar {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 52px;
  height: 52px;
  flex-shrink: 0;
  border-radius: var(--ui-radius-pill);
  background: rgb(var(--ui-accent) / 0.14);
  color: rgb(var(--ui-accent-strong));
  font-family: var(--ui-font-display);
  font-weight: 700;
  font-size: var(--ui-text-lg);
  letter-spacing: 0.02em;
}
.ag-identity-id {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  flex: 1 1 auto;
}
.ag-identity-name {
  margin: 0;
  font-family: var(--ui-font-display);
  font-weight: 700;
  font-size: var(--ui-text-lg);
  color: rgb(var(--ui-fg));
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ag-identity-mail {
  margin: 0;
  color: rgb(var(--ui-muted));
  font-size: var(--ui-text-sm);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ag-identity-badges {
  display: flex;
  gap: var(--ui-space-2);
  flex-wrap: wrap;
  flex-shrink: 0;
}

/* Banner de mudança de permissão */
.ag-warn {
  border-color: rgb(var(--ui-warn) / 0.45);
  background: rgb(var(--ui-warn) / 0.08);
}
.ag-warn-text {
  display: flex;
  align-items: flex-start;
  gap: var(--ui-space-3);
  margin: 0;
  color: rgb(var(--ui-fg));
  font-size: var(--ui-text-sm);
  line-height: 1.5;
}
.ag-warn-text strong {
  color: rgb(var(--ui-fg));
}
.ag-warn-mark {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 22px;
  height: 22px;
  border-radius: var(--ui-radius-pill);
  background: rgb(var(--ui-warn) / 0.18);
  color: rgb(var(--ui-warn));
  font-family: var(--ui-font-display);
  font-weight: 800;
  font-size: var(--ui-text-sm);
}

/* RolePicker — cartões de rádio */
.ag-roles {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: var(--ui-space-3);
}
.ag-role {
  position: relative;
  display: flex;
  align-items: flex-start;
  gap: var(--ui-space-3);
  padding: var(--ui-space-3) var(--ui-space-4);
  border: 1px solid rgb(var(--ui-border-strong));
  border-radius: var(--ui-radius-md);
  background: rgb(var(--ui-surface));
  cursor: pointer;
  transition: border-color 0.15s ease, background 0.15s ease, box-shadow 0.15s ease;
}
.ag-role:hover {
  border-color: rgb(var(--ui-accent) / 0.6);
  background: rgb(var(--ui-surface-2));
}
.ag-role[data-selected='true'] {
  border-color: rgb(var(--ui-accent));
  background: rgb(var(--ui-accent) / 0.08);
  box-shadow: 0 0 0 1px rgb(var(--ui-accent));
}
.ag-role-input {
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
.ag-role-mark {
  flex-shrink: 0;
  width: 18px;
  height: 18px;
  margin-top: 2px;
  border-radius: 50%;
  border: 2px solid rgb(var(--ui-border-strong));
  background: rgb(var(--ui-surface));
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}
.ag-role[data-selected='true'] .ag-role-mark {
  border-color: rgb(var(--ui-accent));
  box-shadow: inset 0 0 0 4px rgb(var(--ui-accent));
}
.ag-role-input:focus-visible + .ag-role-mark {
  outline: 2px solid rgb(var(--ui-accent));
  outline-offset: 2px;
}
.ag-role-body {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}
.ag-role-head {
  display: flex;
  align-items: center;
  gap: var(--ui-space-2);
  flex-wrap: wrap;
}
.ag-role-name {
  font-weight: 700;
  color: rgb(var(--ui-fg));
}
.ag-role-desc {
  font-size: var(--ui-text-xs);
  color: rgb(var(--ui-muted));
  line-height: 1.45;
}

/* metadados read-only */
.ag-meta {
  margin: 0 0 var(--ui-space-5);
  padding: var(--ui-space-2) var(--ui-space-4);
  background: rgb(var(--ui-surface-2));
  border-radius: var(--ui-radius-md);
  border: 1px solid rgb(var(--ui-border));
  display: flex;
  flex-direction: column;
}
.ag-meta-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ui-space-4);
  padding: var(--ui-space-2) 0;
  border-bottom: 1px solid rgb(var(--ui-border));
}
.ag-meta-row:last-child {
  border-bottom: none;
}
.ag-meta-row dt {
  font-size: var(--ui-text-xs);
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: rgb(var(--ui-muted));
}
.ag-meta-row dd {
  margin: 0;
  font-size: var(--ui-text-sm);
  color: rgb(var(--ui-fg));
  text-align: right;
}
.ag-meta-row dd[data-dim='true'] {
  color: rgb(var(--ui-muted));
  font-style: italic;
}
.ag-mono {
  font-family: var(--ui-font-mono);
}

/* SubmitBar */
.ag-submitbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ui-space-4);
  flex-wrap: wrap;
  margin-top: var(--ui-space-2);
  padding-top: var(--ui-space-4);
  border-top: 1px solid rgb(var(--ui-border));
}
.ag-submitbar-note {
  margin: 0;
  font-size: var(--ui-text-sm);
  color: rgb(var(--ui-muted));
}
.ag-submitbar-note[data-state='dirty'] {
  color: rgb(var(--ui-accent-strong));
  font-weight: 600;
}
.ag-submitbar-note[data-state='permission'] {
  color: rgb(var(--ui-warn));
  font-weight: 700;
}
.ag-submitbar-actions {
  display: flex;
  gap: var(--ui-space-2);
  flex-wrap: wrap;
}

@media (max-width: 640px) {
  .ag-roles {
    grid-template-columns: 1fr;
  }
  .ag-identity-badges {
    width: 100%;
  }
  .ag-submitbar {
    align-items: stretch;
  }
  .ag-submitbar-actions {
    width: 100%;
  }
  .ag-submitbar-actions :deep(.ui-btn) {
    flex: 1 1 auto;
  }
}
</style>
