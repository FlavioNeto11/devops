<template>
  <UiPageLayout
    eyebrow="Evoluções"
    :title="pageTitle"
    subtitle="Editar uma evolução cria uma nova versão do documento, preservando o histórico. Toda alteração é registrada para auditoria clínica."
    width="wide"
    :loading="loading"
    loading-message="Carregando evolução…"
    :error="loadError"
    @retry="load"
  >
    <!-- AÇÕES DO TOPO -->
    <template #actions>
      <UiButton variant="ghost" :to="backTo">Voltar</UiButton>
      <UiButton v-if="patientLink" variant="subtle" :to="patientLink">Ver paciente</UiButton>
    </template>

    <!-- BANNER: versionamento + auditoria -->
    <template #banner>
      <div v-if="!gone && !notFound" class="audit-note" role="note">
        <span class="audit-icon" aria-hidden="true">⎘</span>
        <span class="audit-text">
          <strong>Documento versionado.</strong>
          Salvar não sobrescreve o registro original — gera a versão
          <span class="audit-ver">v{{ nextVersion }}</span>
          e mantém o histórico íntegro para auditoria.
        </span>
      </div>
    </template>

    <!-- ESTADO: nota excluída (410 Gone) — bloqueia edição -->
    <div v-if="gone" class="tombstone" role="alert">
      <UiEmptyState
        title="Evolução excluída"
        description="Esta evolução foi removida e não pode mais ser editada. O registro permanece arquivado para fins de auditoria, mas é somente leitura."
        icon="archive"
      >
        <template #action>
          <div class="tombstone-actions">
            <UiButton :to="backTo">Voltar para evoluções</UiButton>
            <UiButton v-if="patientLink" variant="subtle" :to="patientLink">Ver paciente</UiButton>
          </div>
        </template>
      </UiEmptyState>
    </div>

    <!-- ESTADO: nota inexistente -->
    <UiEmptyState
      v-else-if="notFound"
      title="Evolução não encontrada"
      description="Esta evolução pode ter sido movida ou o endereço está incorreto."
      icon="search"
    >
      <template #action>
        <UiButton :to="backTo">Voltar para evoluções</UiButton>
      </template>
    </UiEmptyState>

    <!-- CONTEÚDO NORMAL -->
    <div v-else class="edit-grid">
      <!-- COLUNA PRINCIPAL: FORMULÁRIO -->
      <div class="edit-main">
        <UiCard title="Conteúdo da evolução" subtitle="Apenas o tipo e a nota clínica entram na nova versão. Vínculo e data são imutáveis nesta edição.">
          <template #actions>
            <UiStatusBadge :status="statusComputed" :tone="statusTone" :label="statusLabelText(statusComputed)" size="lg" />
          </template>

          <form novalidate @submit.prevent="save">
            <!-- Vínculo imutável: o backend NÃO aceita alterar paciente/data/profissional numa edição.
                 Exibimos como leitura para não prometer persistência que o contrato descarta. -->
            <dl class="bound-kv" aria-label="Vínculo do registro (somente leitura)">
              <div>
                <dt>Paciente</dt>
                <dd class="bound-mono">
                  <RouterLink v-if="patientLink" :to="patientLink" class="bound-link">{{ note.patient_id }}</RouterLink>
                  <span v-else>—</span>
                </dd>
              </div>
              <div>
                <dt>Data da evolução</dt>
                <dd>{{ format.formatDateTime(note.note_date) }}</dd>
              </div>
              <div>
                <dt>Profissional</dt>
                <dd class="bound-mono">{{ note.professional_id || '—' }}</dd>
              </div>
            </dl>

            <UiFormSection title="Classificação" description="Natureza do registro clínico." :columns="1">
              <UiFormField label="Tipo de evolução" :required="true" :error="f.errors.type" hint="Define a natureza do registro clínico.">
                <template #default="{ id, describedBy }">
                  <select
                    :id="id"
                    class="ui-select"
                    :aria-describedby="describedBy || undefined"
                    :aria-invalid="f.errors.type ? 'true' : undefined"
                    :value="f.values.type"
                    @change="f.setField('type', $event.target.value)"
                  >
                    <option value="" disabled>Selecione o tipo…</option>
                    <option v-for="opt in TYPE_OPTIONS" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
                  </select>
                </template>
              </UiFormField>
            </UiFormSection>

            <UiFormSection title="Nota clínica" description="Descrição da sessão, resultado, plano ou observação." :columns="1">
              <UiFormField
                label="Nota clínica"
                :required="true"
                :error="f.errors.text"
                :hint="textHint"
              >
                <template #default="{ id, describedBy }">
                  <textarea
                    :id="id"
                    class="edit-textarea"
                    :aria-describedby="describedBy || undefined"
                    :aria-invalid="f.errors.text ? 'true' : undefined"
                    :value="f.values.text"
                    rows="10"
                    placeholder="Descreva a evolução clínica: queixa, conduta, resposta ao plano, observações relevantes…"
                    @input="f.setField('text', $event.target.value)"
                  ></textarea>
                </template>
              </UiFormField>
            </UiFormSection>

            <div class="form-actions">
              <UiButton variant="ghost" type="button" :to="backTo" :disabled="f.submitting.value">Cancelar</UiButton>
              <UiButton type="submit" :loading="f.submitting.value" :disabled="!dirty">
                Salvar nova versão
              </UiButton>
            </div>
            <p v-if="!dirty" class="dirty-hint" role="status">Nenhuma alteração pendente — edite um campo para liberar o salvamento.</p>
          </form>
        </UiCard>
      </div>

      <!-- COLUNA LATERAL -->
      <aside class="edit-side">
        <!-- VERSIONAMENTO -->
        <UiCard title="Versionamento" subtitle="Como a edição preserva o histórico.">
          <dl class="ver-kv">
            <div>
              <dt>Versão atual</dt>
              <dd class="ver-now">v{{ currentVersion }}</dd>
            </div>
            <div>
              <dt>Ao salvar</dt>
              <dd class="ver-next">v{{ nextVersion }} <span class="ver-tag">nova</span></dd>
            </div>
          </dl>
          <p class="side-hint">
            A versão anterior continua acessível no histórico do documento. Nada é apagado ao editar.
          </p>
        </UiCard>

        <!-- RESUMO ATUAL -->
        <UiCard title="Resumo" subtitle="Como esta evolução está classificada.">
          <dl class="meta-kv">
            <div>
              <dt>Tipo</dt>
              <dd>{{ typeLabelText(f.values.type) }}</dd>
            </div>
            <div>
              <dt>Data da evolução</dt>
              <dd>{{ format.formatDateTime(note.note_date) }}</dd>
            </div>
            <div>
              <dt>Situação</dt>
              <dd><UiStatusBadge :status="statusComputed" :tone="statusTone" :label="statusLabelText(statusComputed)" size="sm" /></dd>
            </div>
          </dl>
        </UiCard>

        <!-- AUDITORIA / REGISTRO -->
        <UiCard title="Registro" subtitle="Dados de auditoria.">
          <dl class="meta-kv">
            <div>
              <dt>Identificador</dt>
              <dd class="meta-mono">{{ note.id || '—' }}</dd>
            </div>
            <div>
              <dt>Criada em</dt>
              <dd>{{ format.formatDateTime(note.created_at) }}</dd>
            </div>
            <div>
              <dt>Última atualização</dt>
              <dd>{{ format.formatDateTime(note.updated_at || note.created_at) }}</dd>
            </div>
          </dl>
        </UiCard>
      </aside>
    </div>
  </UiPageLayout>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue';
import { RouterLink } from 'vue-router';
import {
  UiPageLayout, UiCard, UiFormSection, UiFormField, UiButton,
  UiStatusBadge, UiEmptyState,
  useForm, useToast, useConfirm, validators, format,
} from '../ui/index.js';
import * as api from '../api.js';

const props = defineProps({ id: { type: String, required: true } });

const toast = useToast();
const confirm = useConfirm();

// Recurso de domínio garantido pelo integrador (api['evolution-notes'] → /v1/evolution-notes).
// Acessamos por bracket porque o nome tem hífen. Fallback defensivo via resourceFactory
// (mesma base /v1/<name>) caso o barrel ainda não tenha sido populado.
const notes = api['evolution-notes'] || (api.resourceFactory ? api.resourceFactory('evolution-notes') : null);

// ---- rotas reais de DOMÍNIO ----
const backTo = '/evolution-notes';
const patientLink = computed(() => (note.patient_id ? '/patients/' + note.patient_id : ''));

// ---- estado de tela ----
const loading = ref(true);
const loadError = ref(null);
const gone = ref(false); // 410 — nota excluída, edição bloqueada
const note = reactive({});

const notFound = computed(() => !loading.value && !loadError.value && !gone.value && !note.id);

const pageTitle = computed(() => {
  if (note.id) return 'Editar evolução — ' + typeLabelText(note.type);
  return 'Editar evolução';
});

// ---- enums do domínio ----
const TYPE_OPTIONS = [
  { value: 'session', label: 'Sessão' },
  { value: 'test_result', label: 'Resultado de teste' },
  { value: 'intervention_plan', label: 'Plano de intervenção' },
  { value: 'observation', label: 'Observação' },
];
function typeLabelText(value) {
  const opt = TYPE_OPTIONS.find((o) => o.value === value);
  return opt ? opt.label : (value ? format.humanize(value) : '—');
}

// ---- situação derivada (a linha NÃO tem coluna status; só deleted_at) ----
const statusComputed = computed(() => (note.deleted_at ? 'deleted' : 'active'));
const statusTone = computed(() => (note.deleted_at ? 'error' : 'success'));
const STATUS_LABELS = { active: 'Ativa', deleted: 'Excluída' };
function statusLabelText(value) {
  return STATUS_LABELS[value] || (value ? format.humanize(value) : '—');
}

// ---- versionamento (derivado da fonte real: note.versions arquiva snapshots
// anteriores; a linha viva é a versão corrente = nº de snapshots + 1) ----
const currentVersion = computed(() => (Array.isArray(note.versions) ? note.versions.length : 0) + 1);
const nextVersion = computed(() => currentVersion.value + 1);

// ---- formulário ----
// Só { type, text } são editáveis: é o ÚNICO conteúdo que o PUT /v1/evolution-notes/:id
// persiste (paciente/data/profissional são imutáveis no contrato e ficam só-leitura).
const f = useForm({
  initial: { type: '', text: '' },
  rules: {
    type: [validators.required('Selecione o tipo de evolução.')],
    text: [validators.required('A nota clínica é obrigatória.'), validators.minLen(3)],
  },
});

const textHint = computed(() => {
  const n = (f.values.text || '').trim().length;
  return n ? n + ' caractere' + (n === 1 ? '' : 's') + ' — registro auditável.' : 'Conteúdo clínico da evolução. Obrigatório.';
});

// snapshot para detectar alterações não salvas (só os campos editáveis)
const snapshot = ref('');
function currentSnapshot() {
  return JSON.stringify({ type: f.values.type, text: f.values.text });
}
const dirty = computed(() => snapshot.value !== currentSnapshot());

// ---- carregamento ----
function hydrate(rec) {
  Object.keys(note).forEach((k) => delete note[k]);
  Object.assign(note, rec || {});
  // Só os campos editáveis vão para o formulário; o restante (paciente, data,
  // profissional, versions, deleted_at…) fica no `note` reativo para leitura.
  f.values.type = rec.type || '';
  f.values.text = rec.text || '';
  snapshot.value = currentSnapshot();
}

async function load() {
  loading.value = true;
  loadError.value = null;
  gone.value = false;
  Object.keys(note).forEach((k) => delete note[k]);
  if (!notes) {
    loading.value = false;
    loadError.value = new Error('Recurso de evoluções indisponível.');
    return;
  }
  try {
    const rec = await notes.get(props.id);
    if (rec && rec.id) {
      hydrate(rec);
      // O GET retorna a nota excluída com 200 + deleted_at preenchido (não há
      // coluna `status` nem 410 no GET). Detectamos a exclusão pelo campo real.
      if (rec.deleted_at) gone.value = true;
    }
  } catch (e) {
    if (e && e.status === 410) {
      gone.value = true; // excluída — edição bloqueada
    } else if (e && e.status === 404) {
      // notFound (note sem id)
    } else {
      loadError.value = e;
    }
  } finally {
    loading.value = false;
  }
}

// ---- salvar (cria nova versão) ----
function save() {
  if (gone.value) {
    toast.error('Esta evolução foi excluída e não pode ser editada.');
    return;
  }
  f.handleSubmit(async (vals) => {
    const ok = await confirm({
      title: 'Salvar nova versão',
      message: 'Será criada a versão v' + nextVersion.value + ' desta evolução, preservando a versão atual no histórico. Esta ação é auditável. Deseja continuar?',
      confirmLabel: 'Salvar v' + nextVersion.value,
      danger: false,
    });
    if (!ok) return;
    try {
      // O contrato persiste APENAS { type, text } (e structured_fields, inalterado
      // aqui). Não enviamos chaves que o backend descarta silenciosamente.
      const savedVersion = nextVersion.value; // número que esta edição cria
      await notes.update(props.id, { type: vals.type, text: vals.text });
      // Recarrega da fonte real para refletir o novo histórico de versões em vez
      // de chutar o número (a contagem vem de note.versions).
      await load();
      toast.success('Nova versão (v' + savedVersion + ') salva.');
    } catch (e) {
      if (e && e.status === 410) {
        gone.value = true;
        toast.error('Esta evolução foi excluída por outra pessoa — edição bloqueada.');
        return;
      }
      toast.error(e.message || 'Não foi possível salvar a evolução.');
    }
  });
}

onMounted(load);
</script>

<style scoped>
.audit-note {
  display: flex;
  align-items: flex-start;
  gap: var(--ui-space-2);
  padding: var(--ui-space-2) var(--ui-space-4);
  background: rgb(var(--ui-info) / 0.1);
  border: 1px solid rgb(var(--ui-info) / 0.3);
  border-radius: var(--ui-radius-md);
  color: rgb(var(--ui-fg));
  font-size: var(--ui-text-sm);
}
.audit-icon { color: rgb(var(--ui-info)); font-size: 1.1rem; line-height: 1.4; }
.audit-text { line-height: 1.45; }
.audit-ver {
  font-family: var(--ui-font-mono);
  font-weight: 700;
  color: rgb(var(--ui-info));
}

.tombstone { padding: var(--ui-space-4) 0; }
.tombstone-actions {
  display: flex;
  gap: var(--ui-space-2);
  flex-wrap: wrap;
  justify-content: center;
}

.edit-grid {
  display: grid;
  grid-template-columns: minmax(0, 2.2fr) minmax(280px, 1fr);
  gap: var(--ui-space-5);
  align-items: start;
}
.edit-main { min-width: 0; }
.edit-side {
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-4);
}

/* select nativo alinhado ao kit (sem lib externa) */
.ui-select {
  background: rgb(var(--ui-bg));
  color: rgb(var(--ui-fg));
  border: 1px solid rgb(var(--ui-border-strong));
  border-radius: var(--ui-radius-sm);
  padding: 8px 11px;
  font: inherit;
  font-size: var(--ui-text-md);
  width: 100%;
  cursor: pointer;
  transition: border-color .15s ease, box-shadow .15s ease;
}
.ui-select:focus {
  outline: none;
  border-color: rgb(var(--ui-accent));
  box-shadow: 0 0 0 3px rgb(var(--ui-accent) / 0.15);
}
.ui-select[aria-invalid="true"] { border-color: rgb(var(--ui-danger)); }

/* vínculo imutável (paciente / data / profissional) — só-leitura */
.bound-kv {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: var(--ui-space-3);
  margin: 0 0 var(--ui-space-4);
  padding: var(--ui-space-3) var(--ui-space-4);
  background: rgb(var(--ui-muted) / 0.06);
  border: 1px solid rgb(var(--ui-border));
  border-radius: var(--ui-radius-md);
}
.bound-kv dt {
  color: rgb(var(--ui-muted));
  font-size: var(--ui-text-xs);
  text-transform: uppercase;
  letter-spacing: .04em;
}
.bound-kv dd {
  margin: 4px 0 0;
  color: rgb(var(--ui-fg));
  font-size: var(--ui-text-sm);
}
.bound-mono { font-family: var(--ui-font-mono); word-break: break-all; }
.bound-link {
  color: rgb(var(--ui-accent-strong));
  text-decoration: none;
  border-bottom: 1px solid rgb(var(--ui-accent) / 0.4);
}
.bound-link:hover { border-bottom-color: rgb(var(--ui-accent-strong)); }
.bound-link:focus-visible {
  outline: 2px solid rgb(var(--ui-accent));
  outline-offset: 2px;
  border-radius: var(--ui-radius-sm);
}

.edit-textarea {
  background: rgb(var(--ui-bg));
  color: rgb(var(--ui-fg));
  border: 1px solid rgb(var(--ui-border-strong));
  border-radius: var(--ui-radius-sm);
  padding: 10px 12px;
  font: inherit;
  font-size: var(--ui-text-md);
  width: 100%;
  min-height: 200px;
  line-height: 1.55;
  resize: vertical;
  transition: border-color .15s ease, box-shadow .15s ease;
}
.edit-textarea:focus {
  outline: none;
  border-color: rgb(var(--ui-accent));
  box-shadow: 0 0 0 3px rgb(var(--ui-accent) / 0.15);
}
.edit-textarea[aria-invalid="true"] { border-color: rgb(var(--ui-danger)); }
.edit-textarea::placeholder { color: rgb(var(--ui-faint)); }

.form-actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--ui-space-2);
  margin-top: var(--ui-space-4);
}
.dirty-hint {
  margin: var(--ui-space-2) 0 0;
  text-align: right;
  color: rgb(var(--ui-muted));
  font-size: var(--ui-text-xs);
}

.ver-kv {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--ui-space-3);
  margin: 0 0 var(--ui-space-3);
}
.ver-kv dt {
  color: rgb(var(--ui-muted));
  font-size: var(--ui-text-xs);
  text-transform: uppercase;
  letter-spacing: .04em;
}
.ver-now {
  margin: 4px 0 0;
  font-family: var(--ui-font-mono);
  font-size: var(--ui-text-lg);
  font-weight: 700;
  color: rgb(var(--ui-fg));
}
.ver-next {
  margin: 4px 0 0;
  display: flex;
  align-items: center;
  gap: 6px;
  font-family: var(--ui-font-mono);
  font-size: var(--ui-text-lg);
  font-weight: 700;
  color: rgb(var(--ui-accent-strong));
}
.ver-tag {
  font-family: var(--ui-font-sans, inherit);
  font-size: var(--ui-text-xs);
  font-weight: 600;
  letter-spacing: .03em;
  text-transform: uppercase;
  padding: 2px 7px;
  border-radius: var(--ui-radius-pill);
  background: rgb(var(--ui-accent) / 0.16);
  color: rgb(var(--ui-accent-strong));
}

.side-hint {
  margin: 0;
  color: rgb(var(--ui-muted));
  font-size: var(--ui-text-sm);
  line-height: 1.45;
}

.meta-kv {
  display: grid;
  gap: var(--ui-space-3);
  margin: 0;
}
.meta-kv dt {
  color: rgb(var(--ui-muted));
  font-size: var(--ui-text-xs);
  text-transform: uppercase;
  letter-spacing: .04em;
}
.meta-kv dd {
  margin: 2px 0 0;
  color: rgb(var(--ui-fg));
  font-size: var(--ui-text-sm);
}
.meta-mono {
  font-family: var(--ui-font-mono);
  word-break: break-all;
}

@media (max-width: 860px) {
  .edit-grid { grid-template-columns: 1fr; }
}
</style>
