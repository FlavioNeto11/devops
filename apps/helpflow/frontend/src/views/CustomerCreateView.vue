<template>
  <UiPageLayout
    eyebrow="Solicitantes"
    title="Novo solicitante"
    subtitle="Cadastre quem abre chamados: identifique a pessoa, registre o contato e marque a prioridade de atendimento."
    width="default"
  >
    <template #actions>
      <UiButton variant="ghost" to="/customers">Voltar aos solicitantes</UiButton>
    </template>

    <!-- Banner de duplicidade: aparece quando a verificação encontra possíveis correspondências -->
    <template #banner>
      <div
        v-if="dupState === 'found'"
        class="dup-banner"
        role="status"
        aria-live="polite"
      >
        <div class="dup-banner-head">
          <span class="dup-icon" aria-hidden="true">!</span>
          <div class="dup-banner-copy">
            <p class="dup-title">Possível solicitante duplicado</p>
            <p class="dup-sub">
              Já existe cadastro com este e-mail. Abra o existente em vez de criar outro —
              ou confirme que é, de fato, uma nova pessoa antes de salvar.
            </p>
          </div>
          <UiButton variant="subtle" size="sm" @click="dismissDuplicates">Ignorar</UiButton>
        </div>
        <ul class="dup-list">
          <li v-for="d in duplicates" :key="d.id" class="dup-item">
            <div class="dup-item-main">
              <RouterLink :to="'/customers/' + d.id" class="dup-name">{{ displayName(d) }}</RouterLink>
              <span class="dup-email">{{ d.email || '—' }}</span>
            </div>
            <div class="dup-item-side">
              <UiStatusBadge v-if="d.vip" tone="running" label="VIP" :with-dot="true" size="sm" />
              <UiStatusBadge
                v-if="d.status"
                :status="d.status"
                :label="statusLabelFor(d.status)"
                :with-dot="true"
                size="sm"
              />
              <UiButton variant="ghost" size="sm" :to="'/customers/' + d.id">Abrir</UiButton>
            </div>
          </li>
        </ul>
      </div>
    </template>

    <div class="cust-grid">
      <!-- Coluna do formulário -->
      <UiCard class="cust-card">
        <form class="cust-form" novalidate @submit.prevent="submit">
          <!-- Identificação -->
          <UiFormSection
            title="Identificação"
            description="Nome e e-mail são obrigatórios. O e-mail é a chave para evitar cadastros duplicados."
            :columns="2"
          >
            <UiFormField
              label="Nome"
              :required="true"
              :error="f.errors.name"
              :full-width="true"
              hint="Como a pessoa deve ser identificada nos chamados."
            >
              <template #default="{ id, describedBy }">
                <input
                  :id="id"
                  type="text"
                  autocomplete="name"
                  :aria-describedby="describedBy"
                  :value="f.values.name"
                  placeholder="Ex.: Maria Souza"
                  @input="f.setField('name', $event.target.value)"
                />
              </template>
            </UiFormField>

            <UiFormField
              label="E-mail"
              :required="true"
              :error="f.errors.email"
              :full-width="true"
              :hint="emailHint"
            >
              <template #default="{ id, describedBy }">
                <div class="email-wrap" :data-state="dupState">
                  <input
                    :id="id"
                    type="email"
                    inputmode="email"
                    autocomplete="email"
                    :aria-describedby="describedBy"
                    :value="f.values.email"
                    placeholder="nome@empresa.com.br"
                    @input="onEmailInput($event.target.value)"
                    @blur="checkDuplicates"
                  />
                  <span class="email-flag" aria-hidden="true">
                    <span v-if="dupState === 'checking'" class="ui-spin email-spin" />
                    <span v-else-if="dupState === 'clean'" class="email-ok">✓</span>
                    <span v-else-if="dupState === 'found'" class="email-warn">!</span>
                  </span>
                </div>
              </template>
            </UiFormField>
          </UiFormSection>

          <!-- Contato -->
          <UiFormSection
            title="Contato"
            description="Canais alternativos para retorno (opcionais)."
            :columns="2"
          >
            <UiFormField label="Telefone" :error="f.errors.phone" hint="Com DDD. Ex.: (11) 91234-5678.">
              <template #default="{ id, describedBy }">
                <input
                  :id="id"
                  type="tel"
                  inputmode="tel"
                  autocomplete="tel"
                  :aria-describedby="describedBy"
                  :value="f.values.phone"
                  placeholder="(11) 91234-5678"
                  @input="f.setField('phone', $event.target.value)"
                />
              </template>
            </UiFormField>

            <UiFormField label="Organização" :error="f.errors.organization" hint="Empresa ou setor do solicitante.">
              <template #default="{ id, describedBy }">
                <input
                  :id="id"
                  type="text"
                  autocomplete="organization"
                  :aria-describedby="describedBy"
                  :value="f.values.organization"
                  placeholder="Ex.: Departamento Financeiro"
                  @input="f.setField('organization', $event.target.value)"
                />
              </template>
            </UiFormField>
          </UiFormSection>

          <!-- Classificação -->
          <UiFormSection
            title="Classificação"
            description="Prioridade de atendimento e situação inicial do cadastro."
            :columns="2"
          >
            <UiFormField label="Situação" :error="f.errors.status" hint="Solicitantes inativos não recebem novos chamados.">
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

            <UiFormField label="Prioridade VIP" hint="Marca a pessoa como prioritária na fila de atendimento.">
              <template #default="{ id }">
                <button
                  :id="id"
                  type="button"
                  class="toggle"
                  role="switch"
                  :aria-checked="String(f.values.vip)"
                  :data-on="f.values.vip ? 'true' : 'false'"
                  @click="toggleVip"
                >
                  <span class="toggle-track" aria-hidden="true"><span class="toggle-knob" /></span>
                  <span class="toggle-label">{{ f.values.vip ? 'Solicitante VIP' : 'Padrão' }}</span>
                </button>
              </template>
            </UiFormField>
          </UiFormSection>

          <!-- Observações -->
          <UiFormSection
            title="Observações"
            description="Contexto interno visível para a equipe de atendimento."
            :columns="1"
          >
            <UiFormField
              label="Notas"
              :error="f.errors.notes"
              :full-width="true"
              :hint="notesHint"
            >
              <template #default="{ id, describedBy }">
                <textarea
                  :id="id"
                  :aria-describedby="describedBy"
                  :value="f.values.notes"
                  rows="4"
                  maxlength="1000"
                  placeholder="Ex.: Cliente do contrato premium; prefere contato por e-mail."
                  @input="f.setField('notes', $event.target.value)"
                />
              </template>
            </UiFormField>
          </UiFormSection>

          <!-- Erro de submit (estado de erro do envio) -->
          <p v-if="submitError" class="submit-error" role="alert">{{ submitError }}</p>

          <!-- SubmitBar -->
          <div class="submit-bar">
            <p class="submit-hint">
              <span v-if="dupState === 'found'" class="submit-warn">Há possível duplicidade — confirmaremos antes de salvar.</span>
              <span v-else-if="dupState === 'clean'" class="submit-ok">E-mail livre. Tudo pronto para cadastrar.</span>
              <span v-else class="ui-muted">Os campos marcados com * são obrigatórios.</span>
            </p>
            <div class="submit-actions">
              <UiButton variant="ghost" type="button" :disabled="f.submitting.value || !dirty" @click="resetForm">Limpar</UiButton>
              <UiButton variant="ghost" type="button" :disabled="f.submitting.value" @click="cancel">Cancelar</UiButton>
              <UiButton type="submit" :loading="f.submitting.value">Cadastrar solicitante</UiButton>
            </div>
          </div>
        </form>
      </UiCard>

      <!-- Coluna de pré-visualização (resumo vivo do cartão do solicitante) -->
      <aside class="cust-aside" aria-label="Pré-visualização do solicitante">
        <UiCard title="Pré-visualização" subtitle="Como o solicitante aparecerá nos chamados.">
          <div class="preview">
            <div class="preview-head">
              <span class="preview-avatar" aria-hidden="true">{{ initials }}</span>
              <div class="preview-id">
                <p class="preview-name" :data-empty="f.values.name ? null : 'true'">
                  {{ f.values.name || 'Nome do solicitante' }}
                </p>
                <p class="preview-email" :data-empty="f.values.email ? null : 'true'">
                  {{ f.values.email || 'email@exemplo.com' }}
                </p>
              </div>
            </div>

            <div class="preview-badges">
              <UiStatusBadge
                :status="f.values.status"
                :label="statusLabelFor(f.values.status)"
                :with-dot="true"
                size="sm"
              />
              <UiStatusBadge v-if="f.values.vip" tone="running" label="VIP" :with-dot="true" size="sm" />
            </div>

            <dl class="preview-meta">
              <div class="preview-row">
                <dt>Telefone</dt>
                <dd :data-empty="f.values.phone ? null : 'true'">{{ f.values.phone || 'Não informado' }}</dd>
              </div>
              <div class="preview-row">
                <dt>Organização</dt>
                <dd :data-empty="f.values.organization ? null : 'true'">{{ f.values.organization || 'Não informada' }}</dd>
              </div>
            </dl>

            <p v-if="f.values.notes" class="preview-notes">{{ f.values.notes }}</p>
            <p v-else class="preview-notes-empty ui-muted">Sem observações.</p>
          </div>

          <template #footer>
            <p class="preview-foot ui-muted">
              <span v-if="completion < 100">Preenchimento: {{ completion }}%. Faltam os campos obrigatórios.</span>
              <span v-else class="preview-foot-ok">Campos obrigatórios completos.</span>
            </p>
          </template>
        </UiCard>
      </aside>
    </div>
  </UiPageLayout>
</template>

<script setup>
import { ref, computed } from 'vue';
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
// Endpoint real do contrato: POST /v1/customers (+ GET /v1/customers para a checagem de
// duplicidade). Usamos o recurso de domínio garantido em api.js — sem inventar rotas.
import { customers } from '../api.js';

const router = useRouter();
const toast = useToast();
const confirm = useConfirm();

const statusOptions = [
  { value: 'active', label: 'Ativo' },
  { value: 'inactive', label: 'Inativo' },
];
function statusLabelFor(v) {
  const o = statusOptions.find((s) => s.value === v);
  return o ? o.label : v || 'Ativo';
}

const f = useForm({
  initial: { name: '', email: '', phone: '', organization: '', vip: false, status: 'active', notes: '' },
  rules: {
    name: [validators.required('Informe o nome do solicitante'), validators.minLen(2)],
    email: [validators.required('Informe o e-mail'), validators.email()],
    // phone/organização/notas são opcionais: pattern/maxLen retornam '' p/ vazio,
    // então só validam o formato quando preenchidos (sem required).
    phone: [validators.pattern(/^[()\d\s+-]{8,}$/, 'Telefone inválido — use DDD e apenas números, espaços, +, ( ) ou -')],
    organization: [validators.maxLen(120)],
    notes: [validators.maxLen(1000)],
  },
});

// ---- Pré-visualização / progresso -------------------------------------------
const initials = computed(() => {
  const src = (f.values.name || f.values.email || '').trim();
  if (!src) return '?';
  const parts = src.split(/[\s@.]+/).filter(Boolean);
  const a = parts[0] ? parts[0][0] : '';
  const b = parts.length > 1 ? parts[parts.length - 1][0] : '';
  return (a + b).toUpperCase() || '?';
});

const dirty = computed(() =>
  !!(f.values.name || f.values.email || f.values.phone || f.values.organization || f.values.notes || f.values.vip),
);

const completion = computed(() => {
  // progresso simples baseado nos 2 campos obrigatórios + bônus dos opcionais
  let filled = 0;
  const required = ['name', 'email'];
  const optional = ['phone', 'organization', 'notes'];
  required.forEach((k) => { if (String(f.values[k] || '').trim()) filled += 40; });
  optional.forEach((k) => { if (String(f.values[k] || '').trim()) filled += 20 / 3; });
  return Math.min(100, Math.round(filled));
});

const notesHint = computed(() => {
  const len = String(f.values.notes || '').length;
  if (!len) return 'Histórico, preferências ou alertas sobre este solicitante.';
  return len + ' de 1000 caracteres.';
});

// ---- Detecção de duplicidade -------------------------------------------------
// dupState: idle | checking | found | clean | error
const dupState = ref('idle');
const duplicates = ref([]);
let lastChecked = '';

const emailHint = computed(() => {
  if (dupState.value === 'checking') return 'Verificando se o e-mail já existe…';
  if (dupState.value === 'clean') return 'Nenhum cadastro com este e-mail. Tudo certo.';
  if (dupState.value === 'found') return 'Encontramos cadastro(s) com este e-mail — veja o aviso acima.';
  if (dupState.value === 'error') return 'Não foi possível verificar duplicidade agora — você ainda pode salvar.';
  return 'Validamos o formato e procuramos cadastros existentes ao sair do campo.';
});

function displayName(d) {
  return d.name || d.organization || d.email || 'Solicitante';
}

function onEmailInput(value) {
  f.setField('email', value);
  // qualquer edição invalida a verificação anterior
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
  const email = String(f.values.email || '').trim().toLowerCase();
  if (!email || !f.validateField('email')) return;
  if (email === lastChecked && (dupState.value === 'found' || dupState.value === 'clean')) return;
  lastChecked = email;
  dupState.value = 'checking';
  try {
    const res = await customers.list({ q: email, pageSize: 5 });
    const rows = (res && res.data) || [];
    const matches = rows.filter((r) => String(r.email || '').trim().toLowerCase() === email);
    duplicates.value = matches;
    dupState.value = matches.length ? 'found' : 'clean';
  } catch (e) {
    // fail-soft: a verificação é auxiliar; nunca bloqueia o cadastro
    duplicates.value = [];
    dupState.value = 'error';
  }
}

// ---- Controles ---------------------------------------------------------------
function toggleVip() {
  f.setField('vip', !f.values.vip);
}

const submitError = ref('');

function buildPayload(vals) {
  return {
    name: vals.name.trim(),
    email: vals.email.trim().toLowerCase(),
    phone: vals.phone.trim() || null,
    organization: vals.organization.trim() || null,
    vip: !!vals.vip,
    status: vals.status || 'active',
    notes: vals.notes.trim() || null,
  };
}

function resetForm() {
  f.reset();
  submitError.value = '';
  dupState.value = 'idle';
  duplicates.value = [];
  lastChecked = '';
}

function submit() {
  submitError.value = '';
  f.handleSubmit(async (vals) => {
    // Se há duplicidade conhecida, confirma antes de criar (ação sensível).
    if (dupState.value === 'found' && duplicates.value.length) {
      const ok = await confirm({
        title: 'Confirmar cadastro mesmo com duplicidade?',
        message:
          'Encontramos ' +
          duplicates.value.length +
          ' cadastro(s) com este e-mail. Deseja criar um novo solicitante mesmo assim?',
        confirmLabel: 'Criar mesmo assim',
        cancelLabel: 'Revisar',
        danger: true,
      });
      if (!ok) return;
    }
    try {
      const created = await customers.create(buildPayload(vals));
      toast.success('Solicitante cadastrado', { detail: vals.name });
      const id = created && (created.id || (created.data && created.data.id));
      router.push(id ? '/customers/' + id : '/customers');
    } catch (e) {
      const msg = e && e.message ? e.message : 'Falha ao cadastrar o solicitante.';
      submitError.value = msg;
      toast.error('Não foi possível cadastrar', { detail: msg, code: e && e.status ? 'HTTP ' + e.status : '' });
    }
  });
}

const cancel = () => router.push('/customers');
</script>

<style scoped>
/* ---- Layout em duas colunas (form + pré-visualização) ---- */
.cust-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 320px;
  gap: var(--ui-space-5);
  align-items: start;
}
.cust-card {
  min-width: 0;
}
.cust-aside {
  position: sticky;
  top: var(--ui-space-5);
  min-width: 0;
}
.cust-form {
  display: flex;
  flex-direction: column;
}

/* ---- E-mail + indicador de verificação ---- */
.email-wrap {
  position: relative;
  display: flex;
  align-items: center;
}
.email-flag {
  position: absolute;
  right: 11px;
  top: 50%;
  transform: translateY(-50%);
  pointer-events: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-weight: 800;
  font-size: var(--ui-text-sm);
}
.email-spin {
  color: rgb(var(--ui-accent-strong));
}
.email-ok {
  color: rgb(var(--ui-ok));
}
.email-warn {
  color: rgb(var(--ui-warn));
}
.email-wrap[data-state="found"] :deep(input) {
  border-color: rgb(var(--ui-warn) / 0.7);
}
.email-wrap[data-state="clean"] :deep(input) {
  border-color: rgb(var(--ui-ok) / 0.6);
}

/* ---- Toggle VIP (switch acessível CSP-safe) ---- */
.toggle {
  display: inline-flex;
  align-items: center;
  gap: var(--ui-space-3);
  background: rgb(var(--ui-bg));
  border: 1px solid rgb(var(--ui-border-strong));
  border-radius: var(--ui-radius-md);
  padding: 7px 12px;
  cursor: pointer;
  font: inherit;
  color: rgb(var(--ui-fg));
  width: 100%;
  text-align: left;
  transition: border-color .15s ease, background .15s ease;
}
.toggle:hover {
  border-color: rgb(var(--ui-accent) / 0.6);
}
.toggle-track {
  position: relative;
  flex-shrink: 0;
  width: 40px;
  height: 22px;
  border-radius: var(--ui-radius-pill);
  background: rgb(var(--ui-faint) / 0.55);
  transition: background .18s ease;
}
.toggle-knob {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: rgb(var(--ui-surface));
  box-shadow: var(--ui-shadow-sm);
  transition: transform .18s ease;
}
.toggle[data-on="true"] .toggle-track {
  background: rgb(var(--ui-accent));
}
.toggle[data-on="true"] .toggle-knob {
  transform: translateX(18px);
}
.toggle-label {
  font-size: var(--ui-text-sm);
  font-weight: 600;
}

/* ---- Banner de duplicidade ---- */
.dup-banner {
  border: 1px solid rgb(var(--ui-warn) / 0.4);
  background: rgb(var(--ui-warn) / 0.08);
  border-radius: var(--ui-radius-lg);
  padding: var(--ui-space-4);
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-3);
}
.dup-banner-head {
  display: flex;
  align-items: flex-start;
  gap: var(--ui-space-3);
}
.dup-banner-copy {
  min-width: 0;
}
.dup-icon {
  flex-shrink: 0;
  width: 26px;
  height: 26px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--ui-radius-pill);
  background: rgb(var(--ui-warn) / 0.18);
  color: rgb(var(--ui-warn));
  font-weight: 800;
}
.dup-title {
  margin: 0;
  font-weight: 700;
  color: rgb(var(--ui-fg));
}
.dup-sub {
  margin: 2px 0 0;
  font-size: var(--ui-text-sm);
  color: rgb(var(--ui-muted));
}
.dup-banner-head > :last-child { margin-left: auto; }
.dup-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-2);
}
.dup-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ui-space-3);
  padding: var(--ui-space-2) var(--ui-space-3);
  background: rgb(var(--ui-surface));
  border: 1px solid rgb(var(--ui-border));
  border-radius: var(--ui-radius-md);
}
.dup-item-main {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
}
.dup-name {
  font-weight: 600;
}
.dup-email {
  font-size: var(--ui-text-xs);
  color: rgb(var(--ui-muted));
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.dup-item-side {
  display: flex;
  align-items: center;
  gap: var(--ui-space-2);
  flex-shrink: 0;
}

/* ---- Pré-visualização ---- */
.preview {
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-4);
}
.preview-head {
  display: flex;
  align-items: center;
  gap: var(--ui-space-3);
}
.preview-avatar {
  flex-shrink: 0;
  width: 44px;
  height: 44px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--ui-radius-pill);
  background: rgb(var(--ui-accent) / 0.14);
  color: rgb(var(--ui-accent-strong));
  font-family: var(--ui-font-display);
  font-weight: 700;
  font-size: var(--ui-text-lg);
}
.preview-id {
  min-width: 0;
}
.preview-name {
  margin: 0;
  font-weight: 700;
  color: rgb(var(--ui-fg));
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.preview-email {
  margin: 1px 0 0;
  font-size: var(--ui-text-sm);
  color: rgb(var(--ui-muted));
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.preview-name[data-empty="true"],
.preview-email[data-empty="true"] {
  color: rgb(var(--ui-faint));
  font-style: italic;
  font-weight: 500;
}
.preview-badges {
  display: flex;
  flex-wrap: wrap;
  gap: var(--ui-space-2);
}
.preview-meta {
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-2);
}
.preview-row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--ui-space-3);
}
.preview-row dt {
  font-size: var(--ui-text-xs);
  text-transform: uppercase;
  letter-spacing: .04em;
  color: rgb(var(--ui-muted));
  font-weight: 600;
}
.preview-row dd {
  margin: 0;
  font-size: var(--ui-text-sm);
  color: rgb(var(--ui-fg));
  text-align: right;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
}
.preview-row dd[data-empty="true"] {
  color: rgb(var(--ui-faint));
  font-style: italic;
}
.preview-notes {
  margin: 0;
  padding: var(--ui-space-3);
  background: rgb(var(--ui-surface-2));
  border-radius: var(--ui-radius-md);
  font-size: var(--ui-text-sm);
  color: rgb(var(--ui-fg));
  white-space: pre-wrap;
  word-break: break-word;
}
.preview-notes-empty {
  margin: 0;
  font-size: var(--ui-text-sm);
}
.preview-foot {
  margin: 0;
  font-size: var(--ui-text-xs);
}
.preview-foot-ok {
  color: rgb(var(--ui-ok));
  font-weight: 600;
}

/* ---- Erro de submit ---- */
.submit-error {
  margin: 0 0 var(--ui-space-4);
  padding: var(--ui-space-3) var(--ui-space-4);
  border: 1px solid rgb(var(--ui-danger) / 0.4);
  background: rgb(var(--ui-danger) / 0.08);
  color: rgb(var(--ui-danger));
  border-radius: var(--ui-radius-md);
  font-size: var(--ui-text-sm);
  font-weight: 600;
}

/* ---- SubmitBar ---- */
.submit-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ui-space-4);
  flex-wrap: wrap;
  padding-top: var(--ui-space-4);
  border-top: 1px solid rgb(var(--ui-border));
}
.submit-hint {
  margin: 0;
  font-size: var(--ui-text-sm);
}
.submit-warn {
  color: rgb(var(--ui-warn));
  font-weight: 600;
}
.submit-ok {
  color: rgb(var(--ui-ok));
  font-weight: 600;
}
.submit-actions {
  display: flex;
  gap: var(--ui-space-2);
  margin-left: auto;
  flex-wrap: wrap;
}

/* ---- Responsivo ---- */
@media (max-width: 920px) {
  .cust-grid {
    grid-template-columns: 1fr;
  }
  .cust-aside {
    position: static;
    order: -1;
  }
}
@media (max-width: 640px) {
  .submit-bar { align-items: stretch; }
  .submit-actions { width: 100%; }
  .submit-actions :deep(.ui-btn) { flex: 1 1 auto; }
}
</style>
