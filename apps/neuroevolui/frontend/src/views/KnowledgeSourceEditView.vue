<template>
  <UiPageLayout
    eyebrow="RAG · Base de conhecimento"
    :title="pageTitle"
    subtitle="Edite o nome, descrição, tipo e estado desta fonte de conhecimento."
    width="narrow"
    :loading="loading"
    loading-message="Carregando fonte…"
    :error="loadError"
    @retry="load"
  >
    <template #actions>
      <UiButton variant="ghost" @click="cancel">Voltar</UiButton>
    </template>

    <!-- Banner: fonte inativa -->
    <template #banner>
      <div
        v-if="!loading && !loadError && !notFound && !f.values.active"
        class="kse-banner"
        role="status"
        aria-label="Fonte inativa"
      >
        <span class="kse-banner-icon" aria-hidden="true">◔</span>
        <p class="kse-banner-text">
          Esta fonte está <strong>inativa</strong> e não é consultada pelo assistente nas respostas.
        </p>
      </div>
    </template>

    <!-- Estado: não encontrada -->
    <UiEmptyState
      v-if="!loading && !loadError && notFound"
      title="Fonte não encontrada"
      description="Esta fonte pode ter sido removida ou o endereço está incorreto."
      icon="database"
    >
      <template #action>
        <UiButton to="/knowledge-sources">Voltar à lista</UiButton>
      </template>
    </UiEmptyState>

    <!-- Formulário de edição -->
    <form
      v-else-if="!loading && !loadError && !notFound"
      class="kse-form"
      novalidate
      @submit.prevent="save"
    >

      <!-- Métricas de contexto -->
      <div class="kse-metrics" aria-label="Resumo da fonte">
        <UiMetricCard
          label="Estado"
          :value="f.values.active ? 'Ativa' : 'Inativa'"
          :tone="f.values.active ? 'success' : 'neutral'"
          hint="Se esta fonte é consultada pelo assistente"
        />
        <UiMetricCard
          label="Tipo"
          :value="activeSourceTypeLabel"
          tone="neutral"
          hint="Como o conteúdo foi ingerido"
        />
        <UiMetricCard
          label="Trechos"
          :value="chunkCountDisplay"
          :tone="chunkCount > 0 ? 'success' : 'warning'"
          hint="Fragmentos vetorizados no índice RAG"
        />
      </div>

      <!-- Identificação -->
      <UiCard
        title="Identificação"
        subtitle="Como esta fonte aparece nas citações e na lista da base de conhecimento."
      >
        <UiFormSection :columns="1">

          <UiFormField
            label="Nome da fonte"
            :required="true"
            :error="f.errors.title"
            hint="Nome legível exibido nas citações do assistente."
            full-width
          >
            <template #default="{ id, describedBy }">
              <UiInput
                :id="id"
                :described-by="describedBy"
                :model-value="f.values.title"
                :error="!!f.errors.title"
                :required="true"
                placeholder="Ex.: Manual de procedimentos clínicos v2"
                autocomplete="off"
                @update:model-value="f.setField('title', $event)"
              />
            </template>
          </UiFormField>

          <UiFormField
            label="Descrição"
            :error="f.errors.description"
            hint="Resumo do conteúdo desta fonte. Auxilia no reconhecimento dentro da base."
            full-width
          >
            <template #default="{ id, describedBy }">
              <textarea
                :id="id"
                class="kse-textarea"
                :aria-describedby="describedBy || undefined"
                :aria-invalid="f.errors.description ? 'true' : undefined"
                :value="f.values.description"
                placeholder="Ex.: Manual oficial com diretrizes de atendimento neuropsicológico."
                rows="3"
                @input="f.setField('description', $event.target.value)"
              ></textarea>
            </template>
          </UiFormField>

        </UiFormSection>
      </UiCard>

      <!-- Origem -->
      <UiCard
        title="Origem do conteúdo"
        subtitle="Tipo de ingestão e URL de referência para a fonte original."
      >
        <UiFormSection :columns="2">

          <UiFormField
            label="Tipo de fonte"
            :required="true"
            :error="f.errors.source_type"
            hint="Como o conteúdo desta fonte foi ingerido na base."
          >
            <template #default="{ id, describedBy }">
              <select
                :id="id"
                class="kse-select"
                :aria-describedby="describedBy || undefined"
                :aria-invalid="f.errors.source_type ? 'true' : undefined"
                :value="f.values.source_type"
                @change="f.setField('source_type', $event.target.value)"
              >
                <option v-for="t in SOURCE_TYPES" :key="t.value" :value="t.value">{{ t.label }}</option>
              </select>
            </template>
          </UiFormField>

          <UiFormField
            label="URL da fonte"
            :error="f.errors.url"
            :hint="f.values.source_type === 'url' ? 'Endereço da página cujo conteúdo foi indexado.' : 'Referência opcional para a origem do conteúdo.'"
          >
            <template #default="{ id, describedBy }">
              <UiInput
                :id="id"
                type="url"
                :described-by="describedBy"
                :model-value="f.values.url"
                :error="!!f.errors.url"
                placeholder="https://..."
                autocomplete="off"
                @update:model-value="f.setField('url', $event)"
              />
            </template>
          </UiFormField>

        </UiFormSection>
      </UiCard>

      <!-- Estado (toggle ativo) -->
      <UiCard
        title="Estado"
        subtitle="Quando inativa, esta fonte não é consultada pelo assistente nas respostas."
      >
        <div class="kse-toggle-row" role="group" aria-labelledby="kse-active-label">
          <div class="kse-toggle-copy" id="kse-active-label">
            <p class="kse-toggle-title">{{ f.values.active ? 'Fonte ativa' : 'Fonte inativa' }}</p>
            <p class="kse-toggle-desc">
              {{ f.values.active
                ? 'Esta fonte é consultada pelo assistente nas respostas e citações.'
                : 'Esta fonte está excluída das consultas do assistente.' }}
            </p>
          </div>
          <button
            type="button"
            class="kse-switch"
            role="switch"
            :aria-checked="f.values.active ? 'true' : 'false'"
            aria-label="Ativar ou desativar esta fonte de conhecimento"
            :data-on="f.values.active ? 'true' : null"
            @click="toggleActive"
          >
            <span class="kse-switch-knob" aria-hidden="true"></span>
          </button>
        </div>
      </UiCard>

      <!-- Ações -->
      <div class="kse-actions">
        <p v-if="!dirty" class="kse-no-changes" role="status">Nenhuma alteração pendente.</p>
        <div class="kse-btns">
          <UiButton
            variant="ghost"
            type="button"
            :disabled="f.submitting.value"
            @click="cancel"
          >Cancelar</UiButton>
          <UiButton
            type="submit"
            variant="primary"
            :loading="f.submitting.value"
            :disabled="!dirty || f.submitting.value"
          >Salvar alterações</UiButton>
        </div>
      </div>

    </form>
  </UiPageLayout>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import {
  UiPageLayout,
  UiCard,
  UiMetricCard,
  UiFormSection,
  UiFormField,
  UiInput,
  UiEmptyState,
  UiButton,
  useForm,
  useToast,
  useConfirm,
  validators,
  format,
} from '../ui/index.js';
import { knowledgeSources } from '../api.js';

const props = defineProps({ id: { type: [String, Number], required: true } });

const router = useRouter();
const toast = useToast();
const confirm = useConfirm();

const SOURCE_TYPES = [
  { value: 'text', label: 'Texto (conteúdo colado)' },
  { value: 'url', label: 'URL (página web)' },
  { value: 'file', label: 'Arquivo (PDF, TXT, CSV)' },
];

// ── Estado de carregamento ───────────────────────────────────────────────────
const loading = ref(true);
const loadError = ref(null);
const source = reactive({});

const notFound = computed(() => !loading.value && !loadError.value && !source.source_id);

const pageTitle = computed(() =>
  source.title ? 'Editar: ' + source.title : 'Editar fonte de conhecimento'
);

const chunkCount = computed(() => Number(source.chunk_count) || 0);
const chunkCountDisplay = computed(() =>
  source.chunk_count != null ? format.formatNumber(chunkCount.value) : '—'
);

const activeSourceTypeLabel = computed(() => {
  const t = SOURCE_TYPES.find((s) => s.value === f.values.source_type);
  return t ? t.label.split(' ')[0] : (f.values.source_type || '—');
});

// ── Formulário ────────────────────────────────────────────────────────────────
const f = useForm({
  initial: {
    title: '',
    description: '',
    source_type: 'text',
    url: '',
    active: true,
  },
  rules: {
    title: [
      validators.required('Informe um nome para a fonte.'),
      validators.minLen(2, 'O nome deve ter ao menos 2 caracteres.'),
      validators.maxLen(200, 'O nome deve ter no máximo 200 caracteres.'),
    ],
    description: [
      validators.maxLen(1000, 'A descrição deve ter no máximo 1 000 caracteres.'),
    ],
    source_type: [
      validators.required('Selecione o tipo da fonte.'),
    ],
    url: [
      (v) => {
        if (!v || !String(v).trim()) return '';
        try { new URL(v); return ''; } catch { return 'URL inválida. Use o formato https://…'; }
      },
      (v, all) => {
        if (all.source_type !== 'url') return '';
        return validators.required('URL obrigatória para fontes do tipo URL.')(v);
      },
    ],
  },
});

// ── Snapshot para detectar alterações ────────────────────────────────────────
const snapshot = ref('');
function currentSnapshot() {
  return JSON.stringify({
    title: f.values.title,
    description: f.values.description,
    source_type: f.values.source_type,
    url: f.values.url,
    active: f.values.active,
  });
}
const dirty = computed(() => snapshot.value !== currentSnapshot());

// ── Hidratação ────────────────────────────────────────────────────────────────
function hydrate(rec) {
  Object.keys(source).forEach((k) => delete source[k]);
  Object.assign(source, rec || {});
  f.values.title = rec.title || '';
  f.values.description = rec.description || '';
  f.values.source_type = SOURCE_TYPES.some((t) => t.value === rec.source_type) ? rec.source_type : 'text';
  f.values.url = rec.url || '';
  f.values.active = rec.active !== false;
  snapshot.value = currentSnapshot();
}

// ── Carga inicial ─────────────────────────────────────────────────────────────
async function load() {
  loading.value = true;
  loadError.value = null;
  try {
    const res = await knowledgeSources.get(props.id);
    const rec = res && res.data && typeof res.data === 'object' && !Array.isArray(res.data) ? res.data : res;
    if (rec && rec.source_id) hydrate(rec);
  } catch (e) {
    if (e && e.status !== 404) {
      loadError.value = e && e.message ? e.message : 'Não foi possível carregar a fonte.';
    }
  } finally {
    loading.value = false;
  }
}

// ── Toggle ativação ───────────────────────────────────────────────────────────
function toggleActive() {
  f.setField('active', !f.values.active);
}

// ── Salvar ────────────────────────────────────────────────────────────────────
async function save() {
  await f.handleSubmit(async (vals) => {
    try {
      await knowledgeSources.update(props.id, {
        title: vals.title.trim(),
        description: (vals.description || '').trim() || null,
        source_type: vals.source_type,
        url: (vals.url || '').trim() || null,
        active: !!vals.active,
      });
      hydrate({ ...source, ...vals, title: vals.title.trim() });
      toast.success('Fonte atualizada com sucesso.');
      router.push('/knowledge-sources/' + props.id);
    } catch (e) {
      if (e && e.status === 404) {
        toast.error('Esta fonte não foi encontrada. Ela pode ter sido removida.');
        return;
      }
      toast.error(e && e.message ? e.message : 'Falha ao salvar a fonte.');
    }
  });
}

// ── Cancelar ─────────────────────────────────────────────────────────────────
async function cancel() {
  if (dirty.value) {
    const ok = await confirm({
      title: 'Descartar alterações?',
      message: 'As alterações ainda não foram salvas. Descartar e voltar?',
      confirmLabel: 'Descartar',
      danger: true,
    });
    if (!ok) return;
  }
  router.push('/knowledge-sources/' + props.id);
}

onMounted(load);
</script>

<style scoped>
/* Dimensões do toggle switch (mesmas do kit padrão) */
.kse-form,
.kse-toggle-row,
.kse-switch {
  --_track-w: calc(var(--ui-space-5) + var(--ui-space-4));
  --_track-h: calc(var(--ui-space-4) + var(--ui-space-1) * 2.75);
  --_knob-size: calc(var(--_track-h) - var(--ui-space-1) * 2);
  --_duration: var(--ui-duration-fast, 0.15s);
}

/* Layout do formulário */
.kse-form {
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-4);
}

/* Métricas de contexto */
.kse-metrics {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: var(--ui-space-4);
}

/* Banner de fonte inativa */
.kse-banner {
  display: flex;
  align-items: center;
  gap: var(--ui-space-3);
  padding: var(--ui-space-3) var(--ui-space-4);
  border-radius: var(--ui-radius-md);
  border: 1px solid rgb(var(--ui-warn) / 0.5);
  background: rgb(var(--ui-warn) / 0.08);
}
.kse-banner-icon {
  font-size: var(--ui-text-xl);
  line-height: 1;
  color: rgb(var(--ui-warn));
  flex-shrink: 0;
}
.kse-banner-text {
  margin: 0;
  font-size: var(--ui-text-sm);
  color: rgb(var(--ui-fg));
}

/* Textarea de descrição */
.kse-textarea {
  min-height: 80px;
  line-height: 1.5;
  resize: vertical;
  font-family: inherit;
  font-size: var(--ui-text-md);
}
.kse-textarea:focus {
  outline: none;
  border-color: rgb(var(--ui-accent));
  box-shadow: 0 0 0 3px rgb(var(--ui-accent) / 0.15);
}
.kse-textarea[aria-invalid='true'] {
  border-color: rgb(var(--ui-danger));
}
.kse-textarea::placeholder {
  color: rgb(var(--ui-faint));
}

/* Select de tipo */
.kse-select:focus {
  outline: none;
  border-color: rgb(var(--ui-accent));
  box-shadow: 0 0 0 3px rgb(var(--ui-accent) / 0.15);
}
.kse-select[aria-invalid='true'] {
  border-color: rgb(var(--ui-danger));
}

/* Toggle row */
.kse-toggle-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ui-space-4);
  padding: var(--ui-space-4);
  border: 1px solid rgb(var(--ui-border));
  border-radius: var(--ui-radius-md);
  background: rgb(var(--ui-surface-2));
}
.kse-toggle-copy {
  min-width: 0;
  flex: 1 1 auto;
}
.kse-toggle-title {
  margin: 0;
  font-weight: 600;
  font-size: var(--ui-text-sm);
  color: rgb(var(--ui-fg));
}
.kse-toggle-desc {
  margin: var(--ui-space-1) 0 0;
  font-size: var(--ui-text-xs);
  color: rgb(var(--ui-muted));
  line-height: 1.45;
}

/* Switch acessível (role=switch) */
.kse-switch {
  position: relative;
  flex-shrink: 0;
  width: var(--_track-w);
  height: var(--_track-h);
  border-radius: var(--ui-radius-pill);
  border: 1px solid rgb(var(--ui-border-strong));
  background: rgb(var(--ui-surface-2));
  cursor: pointer;
  padding: 0;
  transition: background var(--_duration) ease, border-color var(--_duration) ease;
}
.kse-switch[data-on='true'] {
  background: rgb(var(--ui-accent));
  border-color: rgb(var(--ui-accent));
}
.kse-switch:focus-visible {
  outline: none;
  box-shadow: 0 0 0 3px rgb(var(--ui-accent) / 0.28);
}
.kse-switch-knob {
  position: absolute;
  top: var(--ui-space-1);
  left: var(--ui-space-1);
  width: var(--_knob-size);
  height: var(--_knob-size);
  border-radius: 50%;
  background: rgb(var(--ui-bg));
  box-shadow: var(--ui-shadow-sm);
  transition: transform var(--_duration) ease;
}
.kse-switch[data-on='true'] .kse-switch-knob {
  transform: translateX(calc(var(--_track-w) - var(--_knob-size) - var(--ui-space-1) * 2));
}

@media (prefers-reduced-motion: reduce) {
  .kse-switch,
  .kse-switch-knob { transition: none; }
}

/* Ações */
.kse-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ui-space-3);
  flex-wrap: wrap;
  padding-top: var(--ui-space-2);
}
.kse-no-changes {
  margin: 0;
  font-size: var(--ui-text-xs);
  color: rgb(var(--ui-muted));
  font-style: italic;
}
.kse-btns {
  display: flex;
  gap: var(--ui-space-2);
  margin-left: auto;
}

/* Responsivo */
@media (max-width: 860px) {
  .kse-metrics {
    grid-template-columns: repeat(3, 1fr);
  }
}
@media (max-width: 560px) {
  .kse-metrics {
    grid-template-columns: repeat(2, 1fr);
  }
  .kse-actions {
    flex-direction: column;
    align-items: stretch;
  }
  .kse-btns {
    width: 100%;
    margin-left: 0;
  }
}
@media (max-width: 360px) {
  .kse-metrics {
    grid-template-columns: 1fr;
  }
}
</style>
