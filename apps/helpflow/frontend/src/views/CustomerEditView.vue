<template>
  <UiPageLayout
    eyebrow="Solicitantes"
    title="Editar solicitante"
    :subtitle="headerSubtitle"
    width="narrow"
    :loading="loading"
    loading-message="Carregando dados do solicitante…"
    :error="loadError"
    @retry="reload"
  >
    <template #actions>
      <UiButton variant="ghost" :to="LIST_ROUTE">Voltar para a lista</UiButton>
      <UiButton variant="subtle" :to="detailTo" :disabled="!record">Ver solicitante</UiButton>
    </template>

    <!-- Estado: registro inexistente (carregou sem erro, porém sem dados) -->
    <UiEmptyState
      v-if="loaded && !record"
      icon="◌"
      title="Solicitante não encontrado"
      description="O solicitante que você tentou editar não existe mais ou foi removido do service desk."
    >
      <template #action>
        <UiButton :to="LIST_ROUTE">Voltar para solicitantes</UiButton>
      </template>
    </UiEmptyState>

    <!-- Estado normal: cartão de pré-visualização + formulário de edição -->
    <template v-else-if="loaded">
      <!-- Pré-visualização viva: reflete o que está sendo digitado -->
      <UiCard class="cust-preview" title="Pré-visualização" subtitle="Como o solicitante aparecerá nos chamados.">
        <template #actions>
          <UiStatusBadge :status="f.values.status" size="lg" />
        </template>
        <div class="cust-identity">
          <span class="cust-avatar" :data-vip="f.values.vip ? 'true' : 'false'" aria-hidden="true">{{ initials }}</span>
          <div class="cust-identity-text">
            <p class="cust-identity-name">
              {{ displayName }}
              <span v-if="f.values.vip" class="cust-vip-pill">VIP</span>
            </p>
            <p class="cust-identity-meta">
              <span class="cust-identity-line">{{ displayEmail }}</span>
              <span v-if="f.values.organization" class="cust-identity-sep" aria-hidden="true">·</span>
              <span v-if="f.values.organization" class="cust-identity-line">{{ f.values.organization }}</span>
            </p>
            <p v-if="f.values.phone" class="cust-identity-phone">{{ f.values.phone }}</p>
          </div>
        </div>
      </UiCard>

      <!-- Banner de falha de salvamento (separado do loadError do PageLayout) -->
      <UiErrorState
        v-if="saveError"
        class="cust-save-error"
        :message="saveError"
        :retryable="false"
      >
        <template #action>
          <UiButton variant="subtle" @click="dismissSaveError">Fechar aviso</UiButton>
        </template>
      </UiErrorState>

      <UiCard title="Dados do solicitante" subtitle="Atualize as informações de contato e a situação no atendimento.">
        <form
          ref="formEl"
          class="cust-form"
          novalidate
          aria-label="Editar dados do solicitante"
          @submit.prevent="save"
          @keydown="onFormKeydown"
        >
          <UiFormSection title="Identificação" description="Como o solicitante é reconhecido nos chamados." :columns="2">
            <UiFormField label="Nome" :required="true" :error="f.errors.name" hint="Nome completo do solicitante.">
              <template #default="{ id, describedBy, hasError }">
                <input
                  :id="id"
                  ref="nameInput"
                  type="text"
                  autocomplete="name"
                  :aria-describedby="describedBy"
                  :aria-invalid="hasError ? 'true' : null"
                  :value="f.values.name"
                  placeholder="Ex.: Maria Souza"
                  @input="f.setField('name', $event.target.value)"
                />
              </template>
            </UiFormField>

            <UiFormField label="E-mail" :required="true" :error="f.errors.email" hint="Usado para notificar o solicitante sobre os chamados.">
              <template #default="{ id, describedBy, hasError }">
                <input
                  :id="id"
                  type="email"
                  autocomplete="email"
                  inputmode="email"
                  :aria-describedby="describedBy"
                  :aria-invalid="hasError ? 'true' : null"
                  :value="f.values.email"
                  placeholder="nome@empresa.com"
                  @input="f.setField('email', $event.target.value)"
                />
              </template>
            </UiFormField>

            <UiFormField label="Telefone" :error="f.errors.phone" hint="Opcional. Inclua o DDD.">
              <template #default="{ id, describedBy, hasError }">
                <input
                  :id="id"
                  type="tel"
                  autocomplete="tel"
                  inputmode="tel"
                  :aria-describedby="describedBy"
                  :aria-invalid="hasError ? 'true' : null"
                  :value="f.values.phone"
                  placeholder="(11) 90000-0000"
                  @input="f.setField('phone', $event.target.value)"
                />
              </template>
            </UiFormField>

            <UiFormField label="Organização" :error="f.errors.organization" hint="Empresa ou setor do solicitante.">
              <template #default="{ id, describedBy, hasError }">
                <input
                  :id="id"
                  type="text"
                  autocomplete="organization"
                  :aria-describedby="describedBy"
                  :aria-invalid="hasError ? 'true' : null"
                  :value="f.values.organization"
                  placeholder="Ex.: Acme Ltda."
                  @input="f.setField('organization', $event.target.value)"
                />
              </template>
            </UiFormField>
          </UiFormSection>

          <UiFormSection title="Atendimento" description="Situação e prioridade no service desk." :columns="2">
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

            <UiFormField label="Prioridade VIP" hint="Chamados de solicitantes VIP recebem atenção prioritária.">
              <template #default="{ id, describedBy }">
                <label class="cust-toggle" :data-on="f.values.vip ? 'true' : 'false'">
                  <input
                    :id="id"
                    type="checkbox"
                    class="cust-toggle-input"
                    role="switch"
                    :aria-checked="f.values.vip ? 'true' : 'false'"
                    :aria-describedby="describedBy"
                    :checked="f.values.vip"
                    @change="f.setField('vip', $event.target.checked)"
                  />
                  <span class="cust-toggle-track" aria-hidden="true"><span class="cust-toggle-thumb" /></span>
                  <span class="cust-toggle-text">{{ f.values.vip ? 'Solicitante VIP' : 'Solicitante padrão' }}</span>
                </label>
              </template>
            </UiFormField>
          </UiFormSection>

          <UiFormSection title="Observações" description="Notas internas, visíveis apenas pela equipe de suporte." :columns="1">
            <UiFormField
              label="Observações"
              :error="f.errors.notes"
              full-width
              :hint="notesHint"
            >
              <template #default="{ id, describedBy }">
                <textarea
                  :id="id"
                  rows="4"
                  maxlength="2000"
                  :aria-describedby="describedBy"
                  :value="f.values.notes"
                  placeholder="Histórico, preferências de contato ou contexto relevante para a equipe."
                  @input="f.setField('notes', $event.target.value)"
                />
              </template>
            </UiFormField>
          </UiFormSection>

          <dl v-if="record && record.created_at" class="cust-meta">
            <dt>Criado em</dt>
            <dd>{{ format.formatDateTime(record.created_at) }}</dd>
          </dl>

          <!-- SubmitBar -->
          <div class="cust-submitbar">
            <p class="cust-submitbar-note" :data-dirty="isDirty ? 'true' : 'false'" role="status" aria-live="polite">
              <span class="cust-dot" aria-hidden="true" />
              {{ isDirty ? 'Há alterações não salvas.' : 'Tudo salvo.' }}
            </p>
            <div class="cust-submitbar-actions">
              <UiButton
                variant="ghost"
                type="button"
                :disabled="!isDirty || f.submitting.value"
                @click="resetChanges"
              >Desfazer</UiButton>
              <UiButton variant="ghost" type="button" :disabled="f.submitting.value" @click="cancel">Cancelar</UiButton>
              <UiButton type="submit" :loading="f.submitting.value" :disabled="!isDirty">Salvar alterações</UiButton>
            </div>
          </div>
          <p class="cust-shortcut-hint">Dica: pressione <kbd>Ctrl</kbd> + <kbd>Enter</kbd> para salvar.</p>
        </form>
      </UiCard>
    </template>
  </UiPageLayout>
</template>

<script setup>
import { computed, nextTick, onMounted, reactive, ref } from 'vue';
import { useRouter, onBeforeRouteLeave } from 'vue-router';
import {
  UiPageLayout,
  UiCard,
  UiButton,
  UiFormSection,
  UiFormField,
  UiStatusBadge,
  UiEmptyState,
  UiErrorState,
  useForm,
  useToast,
  useConfirm,
  validators,
  format,
} from '../ui/index.js';
import { customers } from '../api.js';

const props = defineProps({ id: { type: String, default: null } });

const router = useRouter();
const toast = useToast();
const confirm = useConfirm();

// Rotas de DOMÍNIO (nunca /records): lista e detalhe de solicitantes.
const LIST_ROUTE = '/customers';
const detailTo = computed(() => (props.id ? LIST_ROUTE + '/' + props.id : LIST_ROUTE));

const loading = ref(true);
const loaded = ref(false);
const loadError = ref(null);
const saveError = ref(null);
const record = ref(null);

// refs de foco (a11y): primeiro campo ao montar; 1º inválido ao falhar validação.
const formEl = ref(null);
const nameInput = ref(null);

const statusOptions = [
  { value: 'active', label: 'Ativo' },
  { value: 'inactive', label: 'Inativo' },
];

const NOTES_LIMIT = 2000;

const f = useForm({
  initial: { name: '', email: '', phone: '', organization: '', vip: false, status: 'active', notes: '' },
  rules: {
    name: [validators.required('Informe o nome do solicitante'), validators.minLen(2)],
    email: [validators.required('Informe o e-mail'), validators.email()],
    phone: [validators.maxLen(40)],
    organization: [validators.maxLen(120)],
    notes: [validators.maxLen(NOTES_LIMIT)],
  },
});

// snapshot do estado original p/ detectar alterações (dirty) e desfazer.
const baseline = reactive({});

const headerSubtitle = computed(() => {
  if (loadError.value || !record.value) return 'Edição dos dados do solicitante, com confirmação ao salvar.';
  const name = (f.values.name || '').trim();
  return name ? 'Editando ' + name + '.' : 'Edição dos dados do solicitante, com confirmação ao salvar.';
});

// --- pré-visualização viva -------------------------------------------------
const displayName = computed(() => (f.values.name || '').trim() || 'Solicitante sem nome');
const displayEmail = computed(() => (f.values.email || '').trim() || 'sem e-mail');

const initials = computed(() => {
  const src = (f.values.name || '').trim() || (f.values.email || '').trim();
  if (!src) return '?';
  const parts = src.replace(/@.*$/, '').split(/[\s._-]+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
});

const notesHint = computed(() => {
  const used = (f.values.notes || '').length;
  return 'Visível apenas pela equipe. ' + used + ' de ' + NOTES_LIMIT + ' caracteres.';
});

// --- dirty tracking --------------------------------------------------------
const isDirty = computed(() => {
  for (const k of Object.keys(baseline)) {
    if (normalize(f.values[k]) !== normalize(baseline[k])) return true;
  }
  return false;
});

function normalize(v) {
  if (v === null || v === undefined) return '';
  if (typeof v === 'boolean') return v;
  return String(v).trim();
}

function hydrate(rec) {
  const next = {
    name: rec.name || '',
    email: rec.email || '',
    phone: rec.phone || '',
    organization: rec.organization || '',
    vip: !!rec.vip,
    status: rec.status || 'active',
    notes: rec.notes || '',
  };
  for (const k of Object.keys(next)) {
    f.values[k] = next[k];
    baseline[k] = next[k];
  }
}

async function reload() {
  if (!props.id) {
    loadError.value = 'Nenhum solicitante selecionado para edição.';
    loading.value = false;
    return;
  }
  loading.value = true;
  loadError.value = null;
  saveError.value = null;
  loaded.value = false;
  try {
    const rec = await customers.get(props.id);
    record.value = rec || null;
    if (rec) hydrate(rec);
    loaded.value = true;
    if (rec) {
      await nextTick();
      if (nameInput.value && typeof nameInput.value.focus === 'function') nameInput.value.focus();
    }
  } catch (e) {
    loadError.value = e && e.message ? e.message : 'Não foi possível carregar o solicitante.';
  } finally {
    loading.value = false;
  }
}

// a11y: move o foco para o primeiro campo inválido após a validação reprovar.
async function focusFirstInvalid() {
  await nextTick();
  const root = formEl.value;
  if (!root) return;
  const el = root.querySelector('[aria-invalid="true"]');
  if (el && typeof el.focus === 'function') el.focus();
}

function buildPayload(vals) {
  return {
    name: vals.name.trim(),
    email: vals.email.trim(),
    phone: vals.phone ? vals.phone.trim() : '',
    organization: vals.organization ? vals.organization.trim() : '',
    vip: !!vals.vip,
    status: vals.status,
    notes: vals.notes ? vals.notes.trim() : '',
  };
}

function dismissSaveError() {
  saveError.value = null;
}

function onFormKeydown(e) {
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
    e.preventDefault();
    save();
  }
}

function save() {
  if (!isDirty.value) return;
  // valida antes do submit p/ mover o foco ao 1º campo inválido (a11y).
  // handleSubmit revalida internamente (idempotente), então é seguro.
  if (!f.validate()) {
    focusFirstInvalid();
    toast.warning('Revise os campos destacados antes de salvar.');
    return;
  }
  f.handleSubmit(async (vals) => {
    const ok = await confirm({
      title: 'Salvar alterações',
      message: 'Confirmar a atualização dos dados de "' + vals.name.trim() + '"?',
      confirmLabel: 'Salvar',
      cancelLabel: 'Revisar',
    });
    if (!ok) return;
    saveError.value = null;
    try {
      const updated = await customers.update(props.id, buildPayload(vals));
      if (updated && typeof updated === 'object') {
        record.value = updated;
        hydrate(updated);
      } else {
        // backend sem corpo de resposta: promove o estado atual a baseline.
        for (const k of Object.keys(baseline)) baseline[k] = f.values[k];
      }
      toast.success('Solicitante atualizado');
      router.push(detailTo.value);
    } catch (e) {
      const msg = e && e.message ? e.message : 'Falha ao salvar o solicitante';
      saveError.value = msg;
      toast.error(msg);
    }
  });
}

async function resetChanges() {
  if (!isDirty.value) return;
  const ok = await confirm({
    title: 'Desfazer alterações?',
    message: 'Restaurar todos os campos para os valores originais do solicitante?',
    confirmLabel: 'Desfazer',
    cancelLabel: 'Continuar editando',
    danger: true,
  });
  if (!ok) return;
  for (const k of Object.keys(baseline)) f.values[k] = baseline[k];
  for (const k of Object.keys(f.errors)) delete f.errors[k];
  saveError.value = null;
  await nextTick();
  if (nameInput.value && typeof nameInput.value.focus === 'function') nameInput.value.focus();
  toast.info('Alterações descartadas.');
}

async function confirmLeave() {
  if (!isDirty.value || f.submitting.value) return true;
  return confirm({
    title: 'Descartar alterações?',
    message: 'Você tem alterações não salvas. Sair sem salvar?',
    confirmLabel: 'Descartar',
    cancelLabel: 'Continuar editando',
    danger: true,
  });
}

async function cancel() {
  if (await confirmLeave()) router.push(detailTo.value);
}

// Guarda de navegação: protege contra perda de alterações ao sair da rota.
onBeforeRouteLeave(async () => {
  if (await confirmLeave()) return true;
  return false;
});

onMounted(reload);
</script>

<style scoped>
.cust-form {
  display: flex;
  flex-direction: column;
}

/* ---- pré-visualização viva ---------------------------------------------- */
.cust-identity {
  display: flex;
  align-items: center;
  gap: var(--ui-space-4);
}
.cust-avatar {
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: var(--ui-space-6);
  height: var(--ui-space-6);
  padding: var(--ui-space-3);
  border-radius: var(--ui-radius-pill);
  background: rgb(var(--ui-accent) / 0.14);
  color: rgb(var(--ui-accent-strong));
  font-family: var(--ui-font-display);
  font-weight: 700;
  font-size: var(--ui-text-lg);
  letter-spacing: 0.02em;
  line-height: 1;
  border: 1px solid rgb(var(--ui-accent) / 0.28);
}
.cust-avatar[data-vip='true'] {
  background: rgb(var(--ui-warn) / 0.16);
  color: rgb(var(--ui-warn));
  border-color: rgb(var(--ui-warn) / 0.36);
}
.cust-identity-text {
  min-width: 0;
}
.cust-identity-name {
  margin: 0;
  display: flex;
  align-items: center;
  gap: var(--ui-space-2);
  flex-wrap: wrap;
  font-family: var(--ui-font-display);
  font-weight: 700;
  font-size: var(--ui-text-lg);
  color: rgb(var(--ui-fg));
}
.cust-vip-pill {
  font-family: var(--ui-font-sans);
  font-size: var(--ui-text-xs);
  font-weight: 700;
  letter-spacing: 0.06em;
  padding: 2px var(--ui-space-2);
  border-radius: var(--ui-radius-pill);
  background: rgb(var(--ui-warn) / 0.18);
  color: rgb(var(--ui-warn));
}
.cust-identity-meta {
  margin: var(--ui-space-1) 0 0;
  display: flex;
  align-items: center;
  gap: var(--ui-space-2);
  flex-wrap: wrap;
  font-size: var(--ui-text-sm);
  color: rgb(var(--ui-muted));
}
.cust-identity-sep {
  color: rgb(var(--ui-faint));
}
.cust-identity-phone {
  margin: 2px 0 0;
  font-size: var(--ui-text-sm);
  color: rgb(var(--ui-muted));
}

.cust-save-error {
  margin: 0;
}

/* ---- toggle (ToggleField) — checkbox real estilizado, CSP-safe via classes/data-*.
   Geometria do switch isolada em variáveis locais (o kit ainda não tem UiToggle);
   cores/espaços/sombra/raio vêm dos tokens --ui-*. Deslocamento do thumb derivado
   das próprias variáveis (sem números mágicos). -------------------------------- */
.cust-toggle {
  --toggle-track-h: var(--ui-space-5); /* altura do trilho */
  --toggle-thumb: var(--ui-space-4); /* diâmetro do thumb */
  --toggle-inset: var(--ui-space-1); /* folga interna do thumb */
  display: inline-flex;
  align-items: center;
  gap: var(--ui-space-3);
  cursor: pointer;
  padding: var(--ui-space-1) 0;
  user-select: none;
}
.cust-toggle-input {
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
.cust-toggle-track {
  position: relative;
  flex: 0 0 auto;
  width: calc(var(--toggle-thumb) * 2 + var(--toggle-inset) * 2);
  height: var(--toggle-track-h);
  border-radius: var(--ui-radius-pill);
  background: rgb(var(--ui-muted) / 0.3);
  transition: background 0.15s ease;
}
.cust-toggle-thumb {
  position: absolute;
  top: var(--toggle-inset);
  left: var(--toggle-inset);
  width: var(--toggle-thumb);
  height: var(--toggle-thumb);
  border-radius: var(--ui-radius-pill);
  background: rgb(var(--ui-surface));
  box-shadow: var(--ui-shadow-sm);
  transition: transform 0.15s ease;
}
.cust-toggle[data-on='true'] .cust-toggle-track {
  background: rgb(var(--ui-accent));
}
.cust-toggle[data-on='true'] .cust-toggle-thumb {
  transform: translateX(var(--toggle-thumb));
}
.cust-toggle-input:focus-visible + .cust-toggle-track {
  outline: 2px solid rgb(var(--ui-accent));
  outline-offset: 2px;
}
.cust-toggle-text {
  font-size: var(--ui-text-sm);
  font-weight: 600;
  color: rgb(var(--ui-fg));
}

/* ---- metadados read-only ------------------------------------------------- */
.cust-meta {
  display: flex;
  align-items: baseline;
  gap: var(--ui-space-2);
  margin: 0 0 var(--ui-space-5);
  padding: var(--ui-space-3) var(--ui-space-4);
  background: rgb(var(--ui-surface-2));
  border-radius: var(--ui-radius-md);
  border: 1px solid rgb(var(--ui-border));
}
.cust-meta dt {
  font-size: var(--ui-text-xs);
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: rgb(var(--ui-muted));
}
.cust-meta dd {
  margin: 0;
  font-size: var(--ui-text-sm);
  color: rgb(var(--ui-fg));
}

/* ---- SubmitBar — barra de ações ao fim do formulário --------------------- */
.cust-submitbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ui-space-4);
  flex-wrap: wrap;
  margin-top: var(--ui-space-2);
  padding-top: var(--ui-space-4);
  border-top: 1px solid rgb(var(--ui-border));
}
.cust-submitbar-note {
  margin: 0;
  display: inline-flex;
  align-items: center;
  gap: var(--ui-space-2);
  font-size: var(--ui-text-sm);
  color: rgb(var(--ui-muted));
}
.cust-dot {
  width: var(--ui-space-2);
  height: var(--ui-space-2);
  border-radius: var(--ui-radius-pill);
  background: rgb(var(--ui-ok));
}
.cust-submitbar-note[data-dirty='true'] {
  color: rgb(var(--ui-accent-strong));
  font-weight: 600;
}
.cust-submitbar-note[data-dirty='true'] .cust-dot {
  background: rgb(var(--ui-accent));
}
.cust-submitbar-actions {
  display: flex;
  gap: var(--ui-space-2);
  flex-wrap: wrap;
}

.cust-shortcut-hint {
  margin: var(--ui-space-3) 0 0;
  font-size: var(--ui-text-xs);
  color: rgb(var(--ui-faint));
}
.cust-shortcut-hint kbd {
  font-family: var(--ui-font-mono);
  font-size: var(--ui-text-xs);
  padding: 1px var(--ui-space-1);
  border-radius: var(--ui-radius-sm);
  border: 1px solid rgb(var(--ui-border-strong));
  background: rgb(var(--ui-surface-2));
  color: rgb(var(--ui-muted));
}

@media (max-width: 640px) {
  .cust-submitbar {
    align-items: stretch;
  }
  .cust-submitbar-actions {
    width: 100%;
  }
  .cust-submitbar-actions :deep(.ui-btn) {
    flex: 1 1 auto;
  }
}

@media (prefers-reduced-motion: reduce) {
  .cust-toggle-track,
  .cust-toggle-thumb {
    transition: none;
  }
}
</style>
