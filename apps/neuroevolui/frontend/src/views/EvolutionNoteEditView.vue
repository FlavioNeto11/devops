<!--
  EvolutionNoteEditView — Editar Nota de Evolução
  ──────────────────────────────────────────────────────────────────────────────
  Edição de nota existente com indicador de versão (VersionBadge). Mostra diff
  do que mudou em relação à versão anterior. Alerta se a nota foi excluída
  (HTTP 410 Gone → estado "gone" que bloqueia toda edição).

  Endpoints REAIS (api.js → resourceFactory → /v1/evolution-notes):
    GET  /v1/evolution-notes/:id   — carrega a nota + histórico (versions[])
    PUT  /v1/evolution-notes/:id   — persiste { type, text } criando nova versão

  Estados: loading (skeleton) · error (retry) · gone (410 / deleted_at) ·
           notFound (404 / objeto vazio) · normal (formulário).

  CSP-safe: sem style="" inline, sem :style, sem v-html.
  Estado visual por class + data-* attributes.
  a11y: labels vinculados, aria-* onde necessário, foco visível.
  Responsivo ≤ 860px: grid colapsa para coluna única.
-->
<template>
  <UiPageLayout
    eyebrow="Evoluções"
    :title="pageTitle"
    subtitle="Editar gera uma nova versão auditável — o histórico completo é preservado."
    width="wide"
    :loading="loading"
    loading-message="Carregando evolução…"
    :error="loadError"
    @retry="load"
  >
    <!-- ── AÇÕES DO TOPO ──────────────────────────────────────────────────── -->
    <template #actions>
      <UiButton variant="ghost" :to="backTo">Voltar</UiButton>
      <UiButton v-if="patientLink" variant="subtle" :to="patientLink">Ver paciente</UiButton>
      <UiButton v-if="noteDetailLink" variant="ghost" :to="noteDetailLink">Ver detalhe</UiButton>
    </template>

    <!-- ── BANNER DE VERSIONAMENTO (visível apenas no estado normal) ──────── -->
    <template #banner>
      <div v-if="!gone && !notFound && note.id" class="vb-banner" role="note" aria-label="Informação de versionamento">
        <div class="vb-banner-left">
          <span class="vb-glyph" aria-hidden="true">⎘</span>
          <span class="vb-banner-text">
            <strong>Documento versionado.</strong>
            Salvar cria a versão
            <span class="vb-pill vb-pill-next" aria-label="próxima versão">v{{ nextVersion }}</span>
            e congela a versão
            <span class="vb-pill vb-pill-cur" aria-label="versão atual">v{{ currentVersion }}</span>
            no histórico — nada é apagado.
          </span>
        </div>
        <!-- VersionBadge inline: exibe v<n> com dot colorido por estado da nota -->
        <div class="vb-badge-wrap" aria-label="versão e estado da nota">
          <span class="vb-ver-badge" :data-tone="badgeTone">
            <span class="vb-ver-dot" aria-hidden="true"></span>
            v{{ currentVersion }}
          </span>
          <UiStatusBadge
            :status="statusComputed"
            :tone="statusTone"
            :label="statusLabelText(statusComputed)"
          />
        </div>
      </div>
    </template>

    <!-- ── ESTADO: GONE (410 / deleted_at) ───────────────────────────────── -->
    <div v-if="gone" class="gone-wrap" role="alert" aria-live="assertive">
      <div class="gone-icon-wrap" aria-hidden="true">
        <span class="gone-icon">🗄</span>
      </div>
      <div class="gone-body">
        <h2 class="gone-title">Evolução excluída</h2>
        <p class="gone-desc">
          Esta nota de evolução foi removida e não pode mais ser editada.
          O registro permanece arquivado para fins de auditoria clínica,
          mas é somente leitura.
        </p>
        <div v-if="note.deleted_at" class="gone-meta">
          <span class="gone-meta-label">Excluída em</span>
          <span class="gone-meta-val">{{ format.formatDateTime(note.deleted_at) }}</span>
        </div>
        <div class="gone-actions">
          <UiButton variant="primary" :to="backTo">Voltar para evoluções</UiButton>
          <UiButton v-if="patientLink" variant="ghost" :to="patientLink">Ver paciente</UiButton>
        </div>
      </div>
    </div>

    <!-- ── ESTADO: NOT FOUND ─────────────────────────────────────────────── -->
    <UiEmptyState
      v-else-if="notFound"
      title="Evolução não encontrada"
      description="Esta evolução pode ter sido excluída definitivamente ou o endereço está incorreto."
      icon="search"
    >
      <template #action>
        <UiButton :to="backTo">Voltar para evoluções</UiButton>
      </template>
    </UiEmptyState>

    <!-- ── ESTADO NORMAL: conteúdo ───────────────────────────────────────── -->
    <div v-else-if="!loading && !loadError" class="edit-root">

      <!-- ── MÉTRICAS DE VERSÃO (4 KPIs) ────────────────────────────────── -->
      <div class="edit-metrics" aria-label="Resumo da nota">
        <UiMetricCard
          label="Versão atual"
          :value="'v' + currentVersion"
          tone="primary"
          :hint="currentVersion === 1 ? 'documento original' : (currentVersion - 1) + ' edição(ões) anterior(es)'"
          clickable
          @click="scrollToHistory"
        />
        <UiMetricCard
          label="Ao salvar"
          :value="'v' + nextVersion"
          :tone="dirty ? 'running' : 'neutral'"
          :hint="dirty ? 'nova versão pendente' : 'sem alterações'"
        />
        <UiMetricCard
          label="Tipo"
          :value="typeLabelText(f.values.type)"
          :tone="typeTone(f.values.type)"
          hint="Classificação do registro"
        />
        <UiMetricCard
          label="Status"
          :value="statusLabelText(statusComputed)"
          :tone="statusTone"
          :hint="note.note_date ? format.formatDate(note.note_date) : 'data não informada'"
        />
      </div>

      <!-- ── GRID PRINCIPAL ───────────────────────────────────────────────── -->
      <div class="edit-grid">

        <!-- COLUNA PRINCIPAL ───────────────────────────────────────────── -->
        <div class="edit-main">

          <!-- FORMULÁRIO DE EDIÇÃO ──────────────────────────────────────── -->
          <UiCard
            title="Editar evolução"
            subtitle="Tipo e nota clínica entram na nova versão. Paciente, data e profissional são imutáveis nesta edição."
          >
            <template #actions>
              <UiStatusBadge
                :status="statusComputed"
                :tone="statusTone"
                :label="statusLabelText(statusComputed)"
                with-dot
              />
            </template>

            <form class="edit-form" novalidate @submit.prevent="save">

              <!-- Vínculo imutável (somente leitura) -->
              <div class="bound-block" aria-label="Vínculo do registro (somente leitura)">
                <p class="bound-label-top">Vínculo do registro — somente leitura</p>
                <dl class="bound-kv">
                  <div>
                    <dt>Paciente</dt>
                    <dd class="bound-mono">
                      <RouterLink v-if="patientLink" :to="patientLink" class="bound-link">
                        {{ note.patient_id }}
                      </RouterLink>
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
                  <div>
                    <dt>Criada em</dt>
                    <dd>{{ format.formatDateTime(note.created_at) }}</dd>
                  </div>
                </dl>
              </div>

              <!-- TypeSelector: seletor visual por cards de tipo ──────── -->
              <UiFormSection
                title="Tipo de evolução"
                description="Classifica a natureza deste registro clínico."
                :columns="1"
              >
                <UiFormField
                  label="Tipo de evolução"
                  :required="true"
                  :error="f.errors.type"
                  hint="Define a natureza do registro clínico."
                >
                  <template #default="{ id, describedBy }">
                    <!-- TypeSelector: cards clicáveis (4 opções) com ícone + rótulo -->
                    <div
                      class="type-selector"
                      role="radiogroup"
                      :aria-labelledby="id"
                      :aria-describedby="describedBy || undefined"
                      :aria-invalid="f.errors.type ? 'true' : undefined"
                    >
                      <label
                        v-for="opt in TYPE_OPTIONS"
                        :key="opt.value"
                        class="type-card"
                        :data-selected="f.values.type === opt.value ? 'true' : 'false'"
                        :data-tone="opt.tone"
                      >
                        <input
                          class="type-radio"
                          type="radio"
                          :name="id + '-type'"
                          :value="opt.value"
                          :checked="f.values.type === opt.value"
                          @change="f.setField('type', opt.value)"
                        />
                        <span class="type-card-icon" aria-hidden="true">{{ opt.icon }}</span>
                        <span class="type-card-body">
                          <span class="type-card-title">{{ opt.label }}</span>
                          <span class="type-card-hint">{{ opt.hint }}</span>
                        </span>
                        <span v-if="f.values.type === opt.value" class="type-card-check" aria-hidden="true">✓</span>
                      </label>
                    </div>
                  </template>
                </UiFormField>
              </UiFormSection>

              <!-- RichTextEditor: textarea de conteúdo clínico ────────── -->
              <UiFormSection
                title="Nota clínica"
                description="Descrição do atendimento. Obrigatório — este é o conteúdo central da evolução."
                :columns="1"
              >
                <UiFormField
                  label="Nota clínica"
                  :required="true"
                  :error="f.errors.text"
                  :hint="textHint"
                >
                  <template #default="{ id, describedBy }">
                    <!-- RichTextEditor (textarea semântico rico, CSP-safe) -->
                    <div class="rte-wrap" :data-error="!!f.errors.text ? 'true' : 'false'">
                      <div class="rte-toolbar" role="toolbar" aria-label="Formatação de texto">
                        <span class="rte-toolbar-hint">Texto livre · markdown aceito</span>
                        <span class="rte-char-count" :data-warn="charWarn ? 'true' : 'false'" aria-live="polite">
                          {{ charCount }} caractere{{ charCount !== 1 ? 's' : '' }}
                        </span>
                      </div>
                      <textarea
                        :id="id"
                        class="rte-area"
                        :aria-describedby="describedBy || undefined"
                        :aria-required="true"
                        :aria-invalid="f.errors.text ? 'true' : undefined"
                        :value="f.values.text"
                        rows="12"
                        placeholder="Descreva a evolução: objetivo da sessão, condutas, resposta do paciente, encaminhamentos, próximos passos…"
                        @input="f.setField('text', $event.target.value)"
                      ></textarea>
                    </div>
                  </template>
                </UiFormField>
              </UiFormSection>

              <!-- Botões de ação do formulário -->
              <div class="form-actions">
                <p v-if="!dirty" class="dirty-hint" role="status">
                  Nenhuma alteração pendente — edite tipo ou nota para liberar o salvamento.
                </p>
                <div class="form-btns">
                  <UiButton
                    variant="ghost"
                    type="button"
                    :disabled="f.submitting.value"
                    @click="cancel"
                  >
                    Cancelar
                  </UiButton>
                  <UiButton
                    type="submit"
                    variant="primary"
                    :loading="f.submitting.value"
                    :disabled="!dirty"
                  >
                    Salvar v{{ nextVersion }}
                  </UiButton>
                </div>
              </div>

            </form>
          </UiCard>

          <!-- DIFF (painel de mudanças) ─────────────────────────────────── -->
          <UiCard
            v-if="hasDiff"
            title="Alterações pendentes"
            subtitle="O que será gravado na nova versão em relação ao registro atual."
          >
            <template #actions>
              <UiStatusBadge status="" tone="warning" label="Não salvo" with-dot />
            </template>
            <div class="diff-list" role="list" aria-label="Diferenças entre a versão atual e as alterações pendentes">

              <!-- Diff de tipo -->
              <div v-if="diffType" class="diff-item" role="listitem">
                <div class="diff-field-label">Tipo de evolução</div>
                <div class="diff-row">
                  <div class="diff-block diff-block-removed" aria-label="valor anterior">
                    <span class="diff-marker" aria-hidden="true">−</span>
                    <span class="diff-content">{{ typeLabelText(note.type) }}</span>
                  </div>
                  <span class="diff-arrow" aria-hidden="true">→</span>
                  <div class="diff-block diff-block-added" aria-label="novo valor">
                    <span class="diff-marker" aria-hidden="true">+</span>
                    <span class="diff-content">{{ typeLabelText(f.values.type) }}</span>
                  </div>
                </div>
              </div>

              <!-- Diff de texto (resumo de linhas alteradas) -->
              <div v-if="diffText" class="diff-item" role="listitem">
                <div class="diff-field-label">Nota clínica</div>
                <div class="diff-text-summary">
                  <div class="diff-stat">
                    <span class="diff-stat-added">+{{ diffTextStats.added }} linha{{ diffTextStats.added !== 1 ? 's' : '' }}</span>
                    <span class="diff-stat-removed">−{{ diffTextStats.removed }} linha{{ diffTextStats.removed !== 1 ? 's' : '' }}</span>
                    <span class="diff-stat-neutral">{{ diffTextStats.unchanged }} sem alteração</span>
                  </div>
                  <div class="diff-preview">
                    <div
                      v-for="(chunk, ci) in diffChunks"
                      :key="ci"
                      class="diff-chunk"
                      :data-kind="chunk.kind"
                    >
                      <span class="diff-chunk-marker" aria-hidden="true">{{ chunk.marker }}</span>
                      <span class="diff-chunk-text">{{ chunk.text }}</span>
                    </div>
                  </div>
                </div>
              </div>

            </div>
          </UiCard>

        </div>

        <!-- COLUNA LATERAL ─────────────────────────────────────────────── -->
        <aside class="edit-side" aria-label="Informações laterais">

          <!-- VersionBadge / VERSIONAMENTO ─────────────────────────────── -->
          <UiCard title="Versionamento" subtitle="Cada edição é uma versão imutável no histórico.">
            <div class="ver-timeline">
              <div class="ver-item ver-item-next" :data-active="dirty ? 'true' : 'false'" aria-label="Próxima versão">
                <div class="ver-dot ver-dot-next" aria-hidden="true"></div>
                <div class="ver-body">
                  <span class="ver-num">v{{ nextVersion }}</span>
                  <span class="ver-state">{{ dirty ? 'Pendente de salvar' : 'Nenhuma alteração' }}</span>
                </div>
              </div>
              <div class="ver-connector" aria-hidden="true"></div>
              <div class="ver-item ver-item-cur" aria-label="Versão atual (esta evolução)">
                <div class="ver-dot ver-dot-cur" aria-hidden="true"></div>
                <div class="ver-body">
                  <span class="ver-num">v{{ currentVersion }}</span>
                  <span class="ver-state">Versão atual</span>
                  <span class="ver-meta">{{ format.formatDateTime(note.updated_at || note.created_at) }}</span>
                </div>
              </div>
              <template v-if="prevVersions.length">
                <div class="ver-connector" aria-hidden="true"></div>
                <div
                  v-for="pv in prevVersions"
                  :key="pv.version_number"
                  class="ver-item ver-item-old"
                  :aria-label="'Versão v' + pv.version_number"
                >
                  <div class="ver-dot ver-dot-old" aria-hidden="true"></div>
                  <div class="ver-body">
                    <span class="ver-num">v{{ pv.version_number }}</span>
                    <span class="ver-state">Versão anterior</span>
                    <span v-if="pv.edited_at" class="ver-meta">{{ format.formatDateTime(pv.edited_at) }}</span>
                  </div>
                </div>
              </template>
            </div>
            <p class="side-hint">
              Salvar <strong>não apaga</strong> a versão atual — ela passa para o histórico e fica
              acessível na tela de detalhe.
            </p>
          </UiCard>

          <!-- RESUMO DO REGISTRO ──────────────────────────────────────── -->
          <UiCard title="Resumo" subtitle="Classificação atual da nota.">
            <dl class="meta-kv">
              <div>
                <dt>Tipo</dt>
                <dd>{{ typeLabelText(f.values.type) }}</dd>
              </div>
              <div>
                <dt>Data da evolução</dt>
                <dd>{{ note.note_date ? format.formatDate(note.note_date) : '—' }}</dd>
              </div>
              <div>
                <dt>Situação</dt>
                <dd>
                  <UiStatusBadge
                    :status="statusComputed"
                    :tone="statusTone"
                    :label="statusLabelText(statusComputed)"
                    with-dot
                  />
                </dd>
              </div>
              <div>
                <dt>Paciente</dt>
                <dd class="meta-mono">
                  <RouterLink v-if="patientLink" :to="patientLink" class="meta-link">{{ note.patient_id }}</RouterLink>
                  <span v-else>—</span>
                </dd>
              </div>
              <div>
                <dt>Profissional</dt>
                <dd class="meta-mono">{{ note.professional_id || '—' }}</dd>
              </div>
            </dl>
          </UiCard>

          <!-- AUDITORIA ──────────────────────────────────────────────── -->
          <UiCard title="Auditoria" subtitle="Dados de rastreabilidade.">
            <dl class="meta-kv">
              <div>
                <dt>ID do registro</dt>
                <dd class="meta-mono">{{ note.id || '—' }}</dd>
              </div>
              <div>
                <dt>Criada em</dt>
                <dd>{{ format.formatDateTime(note.created_at) }}</dd>
              </div>
              <div>
                <dt>Última edição</dt>
                <dd>{{ format.formatDateTime(note.updated_at || note.created_at) }}</dd>
              </div>
            </dl>
          </UiCard>

          <!-- HISTÓRICO DE VERSÕES ──────────────────────────────────── -->
          <UiCard
            id="version-history"
            title="Histórico"
            subtitle="Versões anteriores deste documento."
          >
            <div v-if="!prevVersions.length" class="hist-empty">
              <p class="side-hint">Nenhuma edição anterior — este é o documento original.</p>
            </div>
            <div v-else class="hist-list" role="list" aria-label="Histórico de versões">
              <div
                v-for="pv in sortedVersions"
                :key="pv.version_number"
                class="hist-item"
                role="listitem"
              >
                <div class="hist-item-top">
                  <UiStatusBadge status="" tone="running" :label="'v' + pv.version_number" :with-dot="false" />
                  <span class="hist-date">{{ format.formatDateTime(pv.edited_at) }}</span>
                </div>
                <p v-if="pv.snapshot && pv.snapshot.text" class="hist-preview">
                  {{ truncate(pv.snapshot.text, 80) }}
                </p>
                <p v-else class="hist-preview hist-preview-empty">sem texto nesta versão</p>
                <div v-if="pv.edited_by" class="hist-by">por {{ pv.edited_by }}</div>
              </div>
            </div>
          </UiCard>

        </aside>
      </div>
    </div>
  </UiPageLayout>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue';
import { RouterLink } from 'vue-router';
import {
  UiPageLayout,
  UiCard,
  UiMetricCard,
  UiFormSection,
  UiFormField,
  UiButton,
  UiStatusBadge,
  UiEmptyState,
  useForm,
  useToast,
  useConfirm,
  validators,
  format,
} from '../ui/index.js';
import * as api from '../api.js';

// ── Props ──────────────────────────────────────────────────────────────────────
const props = defineProps({ id: { type: String, required: true } });

// ── Services ──────────────────────────────────────────────────────────────────
const toast = useToast();
const confirm = useConfirm();

// Recurso com hífen no nome — acesso por bracket (alias exportado pelo integrador)
const notes =
  api['evolution-notes'] ||
  (api.resourceFactory ? api.resourceFactory('evolution-notes') : null);

// ── Rota de domínio de retorno ────────────────────────────────────────────────
const backTo = '/evolution-notes';
const patientLink = computed(() =>
  note.patient_id ? '/patients/' + note.patient_id : ''
);
const noteDetailLink = computed(() =>
  note.id ? '/evolution-notes/' + note.id : ''
);

// ── Estado de tela ────────────────────────────────────────────────────────────
const loading = ref(true);
const loadError = ref(null);
const gone = ref(false);  // 410 Gone ou deleted_at — edição bloqueada
const note = reactive({});

const notFound = computed(
  () => !loading.value && !loadError.value && !gone.value && !note.id
);

const pageTitle = computed(() => {
  if (note.id) return 'Editar evolução — ' + typeLabelText(note.type);
  return 'Editar evolução';
});

// ── Enums (TypeSelector) ──────────────────────────────────────────────────────
const TYPE_OPTIONS = [
  {
    value: 'nota_clinica',
    label: 'Nota clínica',
    hint: 'Registro livre de sessão clínica',
    icon: '📋',
    tone: 'running',
  },
  {
    value: 'resultado_teste',
    label: 'Resultado de teste',
    hint: 'Avaliação aplicada e pontuação',
    icon: '📊',
    tone: 'success',
  },
  {
    value: 'plano_intervencao',
    label: 'Plano de intervenção',
    hint: 'Metas, estratégias e cadência',
    icon: '🗺',
    tone: 'primary',
  },
  {
    value: 'anamnese',
    label: 'Anamnese',
    hint: 'História clínica e antecedentes',
    icon: '📖',
    tone: 'neutral',
  },
  {
    value: 'outro',
    label: 'Outro',
    hint: 'Registro não classificado',
    icon: '📌',
    tone: 'neutral',
  },
];

// Também aceita valores legados do backend (session / test_result / intervention_plan / observation)
const TYPE_LABELS_LEGACY = {
  session: 'Sessão',
  test_result: 'Resultado de teste',
  intervention_plan: 'Plano de intervenção',
  observation: 'Observação',
};

function typeLabelText(value) {
  const opt = TYPE_OPTIONS.find((o) => o.value === value);
  if (opt) return opt.label;
  if (TYPE_LABELS_LEGACY[value]) return TYPE_LABELS_LEGACY[value];
  return value ? format.humanize(value) : '—';
}
function typeTone(value) {
  const opt = TYPE_OPTIONS.find((o) => o.value === value);
  return opt ? opt.tone : 'neutral';
}

// ── Status derivado (soft-delete via deleted_at) ───────────────────────────────
const statusComputed = computed(() =>
  note.deleted_at ? 'excluido' : (note.status || 'ativo')
);
const statusTone = computed(() => (note.deleted_at ? 'error' : 'success'));
const badgeTone = computed(() => (note.deleted_at ? 'error' : 'success'));
const STATUS_LABELS = { ativo: 'Ativa', editado: 'Editada', excluido: 'Excluída' };
function statusLabelText(value) {
  return STATUS_LABELS[value] || (value ? format.humanize(value) : '—');
}

// ── Versionamento (versions[] = snapshots anteriores; atual = length + 1) ──────
const currentVersion = computed(() =>
  (Array.isArray(note.versions) ? note.versions.length : 0) + 1
);
const nextVersion = computed(() => currentVersion.value + 1);
const prevVersions = computed(() =>
  Array.isArray(note.versions) ? note.versions : []
);
const sortedVersions = computed(() =>
  [...prevVersions.value].sort(
    (a, b) => (Number(b.version_number) || 0) - (Number(a.version_number) || 0)
  )
);

// ── Formulário ────────────────────────────────────────────────────────────────
// Apenas { type, text } são editáveis via PUT /v1/evolution-notes/:id
const f = useForm({
  initial: { type: '', text: '' },
  rules: {
    type: [validators.required('Selecione o tipo de evolução.')],
    text: [
      validators.required('A nota clínica é obrigatória.'),
      validators.minLen(3),
    ],
  },
});

const charCount = computed(() => (f.values.text || '').length);
const charWarn = computed(() => charCount.value > 4000);
const textHint = computed(() => {
  const n = charCount.value;
  if (n === 0) return 'Conteúdo clínico da evolução. Obrigatório.';
  return n + ' caractere' + (n !== 1 ? 's' : '') + ' — registro auditável.';
});

// Snapshot para detectar alterações não salvas
const snapshot = ref('');
function currentSnapshot() {
  return JSON.stringify({ type: f.values.type, text: f.values.text });
}
const dirty = computed(() => snapshot.value !== currentSnapshot());

// ── Diff (painel de mudanças) ─────────────────────────────────────────────────
const diffType = computed(
  () => !!note.type && !!f.values.type && note.type !== f.values.type
);
const diffText = computed(
  () => (note.text || '') !== (f.values.text || '')
);
const hasDiff = computed(() => diffType.value || diffText.value);

// Contagem de linhas adicionadas / removidas (diff simples por linhas)
const diffTextStats = computed(() => {
  const oldLines = (note.text || '').split('\n');
  const newLines = (f.values.text || '').split('\n');
  const oldSet = new Set(oldLines);
  const newSet = new Set(newLines);
  let added = 0, removed = 0, unchanged = 0;
  for (const l of newLines) {
    if (oldSet.has(l)) unchanged++;
    else added++;
  }
  for (const l of oldLines) {
    if (!newSet.has(l)) removed++;
  }
  return { added, removed, unchanged };
});

// Chunks de diff visual (máx 8 linhas significativas)
const diffChunks = computed(() => {
  const oldLines = (note.text || '').split('\n');
  const newLines = (f.values.text || '').split('\n');
  const oldSet = new Set(oldLines);
  const newSet = new Set(newLines);
  const chunks = [];

  for (const l of oldLines) {
    if (!newSet.has(l) && l.trim() && chunks.length < 4) {
      chunks.push({ kind: 'removed', marker: '−', text: l.length > 70 ? l.slice(0, 70) + '…' : l });
    }
  }
  for (const l of newLines) {
    if (!oldSet.has(l) && l.trim() && chunks.length < 8) {
      chunks.push({ kind: 'added', marker: '+', text: l.length > 70 ? l.slice(0, 70) + '…' : l });
    }
  }
  return chunks;
});

// ── Helpers ───────────────────────────────────────────────────────────────────
function truncate(str, maxLen) {
  if (!str) return '';
  return str.length > maxLen ? str.slice(0, maxLen) + '…' : str;
}

function scrollToHistory() {
  const el = document.getElementById('version-history');
  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ── Carregamento ──────────────────────────────────────────────────────────────
function hydrate(rec) {
  Object.keys(note).forEach((k) => delete note[k]);
  Object.assign(note, rec || {});
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
    loadError.value = new Error('Recurso de evoluções indisponível.');
    loading.value = false;
    return;
  }

  try {
    const rec = await notes.get(props.id);
    if (rec && rec.id) {
      hydrate(rec);
      // O GET retorna nota excluída com 200 + deleted_at preenchido
      if (rec.deleted_at) gone.value = true;
    }
  } catch (e) {
    if (e && e.status === 410) {
      gone.value = true; // excluída — edição bloqueada (HTTP 410 Gone)
    } else if (e && e.status === 404) {
      // notFound: note sem id — o computed notFound cobre este caso
    } else {
      loadError.value = e;
    }
  } finally {
    loading.value = false;
  }
}

// ── Salvar (cria nova versão via PUT) ─────────────────────────────────────────
function save() {
  if (gone.value) {
    toast.error('Esta evolução foi excluída e não pode ser editada.');
    return;
  }
  if (!dirty.value) {
    toast.info('Nenhuma alteração detectada.');
    return;
  }
  f.handleSubmit(async (vals) => {
    const ok = await confirm({
      title: 'Salvar versão v' + nextVersion.value,
      message:
        'Isso cria a versão v' +
        nextVersion.value +
        ' desta evolução. A versão v' +
        currentVersion.value +
        ' é preservada no histórico para auditoria. Esta ação não pode ser desfeita.',
      confirmLabel: 'Salvar v' + nextVersion.value,
      danger: false,
    });
    if (!ok) return;

    const versionToSave = nextVersion.value;
    try {
      await notes.update(props.id, { type: vals.type, text: vals.text });
      // Recarrega para refletir o novo histórico real (note.versions[])
      await load();
      toast.success('Versão v' + versionToSave + ' salva com sucesso.');
    } catch (e) {
      if (e && e.status === 410) {
        gone.value = true;
        toast.error(
          'Esta evolução foi excluída por outro usuário — edição bloqueada.'
        );
        return;
      }
      if (e && e.status === 403) {
        toast.error('Sem permissão para editar esta evolução.');
        return;
      }
      if (e && e.status === 404) {
        toast.error('Evolução não encontrada. Ela pode ter sido removida.');
        await load();
        return;
      }
      toast.error(e.message || 'Não foi possível salvar a evolução.');
    }
  });
}

// ── Cancelar (com confirmação se dirty) ───────────────────────────────────────
async function cancel() {
  if (dirty.value) {
    const ok = await confirm({
      title: 'Descartar alterações?',
      message:
        'As alterações ainda não foram salvas como versão v' +
        nextVersion.value +
        '. Descartar e sair?',
      confirmLabel: 'Descartar',
      danger: true,
    });
    if (!ok) return;
  }
  // Navega para a tela de detalhe da nota (rota de domínio)
  if (note.id) {
    window.history.length > 2
      ? window.history.back()
      : (window.location.href = '/evolution-notes/' + note.id);
  } else {
    window.location.href = backTo;
  }
}

onMounted(load);
</script>

<style scoped>
/* ── Banner de versionamento ─────────────────────────────────────────────── */
.vb-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ui-space-3);
  padding: var(--ui-space-2) var(--ui-space-4);
  background: rgb(var(--ui-info) / 0.08);
  border: 1px solid rgb(var(--ui-info) / 0.25);
  border-radius: var(--ui-radius-md);
  font-size: var(--ui-text-sm);
  flex-wrap: wrap;
}
.vb-banner-left {
  display: flex;
  align-items: flex-start;
  gap: var(--ui-space-2);
}
.vb-glyph {
  color: rgb(var(--ui-info));
  font-size: 1.1rem;
  line-height: 1.4;
  flex-shrink: 0;
}
.vb-banner-text { line-height: 1.5; color: rgb(var(--ui-fg)); }
.vb-pill {
  display: inline-block;
  font-family: var(--ui-font-mono);
  font-weight: 700;
  padding: 1px 6px;
  border-radius: var(--ui-radius-pill);
  font-size: var(--ui-text-xs);
}
.vb-pill-next {
  background: rgb(var(--ui-accent) / 0.15);
  color: rgb(var(--ui-accent-strong));
}
.vb-pill-cur {
  background: rgb(var(--ui-muted) / 0.12);
  color: rgb(var(--ui-muted));
}
.vb-badge-wrap {
  display: flex;
  align-items: center;
  gap: var(--ui-space-2);
  flex-shrink: 0;
}
/* VersionBadge inline */
.vb-ver-badge {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-family: var(--ui-font-mono);
  font-weight: 700;
  font-size: var(--ui-text-sm);
  padding: 3px 10px;
  border-radius: var(--ui-radius-pill);
  border: 1px solid rgb(var(--ui-border));
  background: rgb(var(--ui-surface));
  color: rgb(var(--ui-fg));
}
.vb-ver-badge[data-tone="success"] { border-color: rgb(var(--ui-success) / 0.45); color: rgb(var(--ui-success-strong, var(--ui-success))); }
.vb-ver-badge[data-tone="error"]   { border-color: rgb(var(--ui-danger) / 0.45);  color: rgb(var(--ui-danger)); }
.vb-ver-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: currentColor;
  flex-shrink: 0;
}

/* ── Gone (excluída) ─────────────────────────────────────────────────────── */
.gone-wrap {
  display: flex;
  align-items: flex-start;
  gap: var(--ui-space-5);
  padding: var(--ui-space-8) var(--ui-space-6);
  border: 1px solid rgb(var(--ui-danger) / 0.35);
  border-radius: var(--ui-radius-md);
  background: rgb(var(--ui-danger) / 0.05);
}
.gone-icon-wrap {
  flex-shrink: 0;
  width: 56px;
  height: 56px;
  border-radius: var(--ui-radius-md);
  background: rgb(var(--ui-danger) / 0.1);
  display: flex;
  align-items: center;
  justify-content: center;
}
.gone-icon { font-size: 1.75rem; }
.gone-body { display: flex; flex-direction: column; gap: var(--ui-space-3); min-width: 0; }
.gone-title {
  margin: 0;
  font-size: var(--ui-text-xl);
  font-weight: 700;
  color: rgb(var(--ui-danger));
  line-height: 1.2;
}
.gone-desc {
  margin: 0;
  color: rgb(var(--ui-fg));
  font-size: var(--ui-text-md);
  line-height: 1.55;
  max-width: 540px;
}
.gone-meta {
  display: flex;
  gap: var(--ui-space-2);
  align-items: center;
  font-size: var(--ui-text-sm);
  color: rgb(var(--ui-muted));
}
.gone-meta-label { font-weight: 600; }
.gone-meta-val { font-family: var(--ui-font-mono); }
.gone-actions {
  display: flex;
  gap: var(--ui-space-2);
  flex-wrap: wrap;
  padding-top: var(--ui-space-1);
}

/* ── Métricas ────────────────────────────────────────────────────────────── */
.edit-metrics {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: var(--ui-space-4);
}

/* ── Layout principal ────────────────────────────────────────────────────── */
.edit-root {
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-5);
}
.edit-grid {
  display: grid;
  grid-template-columns: minmax(0, 2.2fr) minmax(280px, 1fr);
  gap: var(--ui-space-5);
  align-items: start;
}
.edit-main {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-5);
}
.edit-side {
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-4);
  min-width: 0;
}

/* ── Formulário ──────────────────────────────────────────────────────────── */
.edit-form {
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-5);
}

/* Vínculo imutável */
.bound-block {
  padding: var(--ui-space-3) var(--ui-space-4);
  background: rgb(var(--ui-muted) / 0.05);
  border: 1px solid rgb(var(--ui-border));
  border-radius: var(--ui-radius-md);
}
.bound-label-top {
  margin: 0 0 var(--ui-space-2);
  font-size: var(--ui-text-xs);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  font-weight: 700;
  color: rgb(var(--ui-muted));
}
.bound-kv {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: var(--ui-space-3);
  margin: 0;
}
.bound-kv dt {
  color: rgb(var(--ui-muted));
  font-size: var(--ui-text-xs);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  font-weight: 600;
}
.bound-kv dd {
  margin: 3px 0 0;
  color: rgb(var(--ui-fg));
  font-size: var(--ui-text-sm);
  line-height: 1.4;
}
.bound-mono { font-family: var(--ui-font-mono); word-break: break-all; }
.bound-link {
  color: rgb(var(--ui-accent-strong));
  text-decoration: none;
  border-bottom: 1px solid rgb(var(--ui-accent) / 0.4);
  transition: border-color 0.15s;
}
.bound-link:hover { border-bottom-color: rgb(var(--ui-accent-strong)); }
.bound-link:focus-visible {
  outline: 2px solid rgb(var(--ui-accent));
  outline-offset: 2px;
  border-radius: var(--ui-radius-sm);
}

/* TypeSelector: cards de tipo ─────────────────────────────────────────────── */
.type-selector {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(165px, 1fr));
  gap: var(--ui-space-3);
}
.type-card {
  display: flex;
  align-items: flex-start;
  gap: var(--ui-space-2);
  padding: var(--ui-space-3);
  border: 2px solid rgb(var(--ui-border));
  border-radius: var(--ui-radius-md);
  background: rgb(var(--ui-surface));
  cursor: pointer;
  transition: border-color 0.15s, background 0.15s, box-shadow 0.15s;
  position: relative;
}
.type-card[data-selected="true"] {
  border-color: rgb(var(--ui-accent));
  background: rgb(var(--ui-accent) / 0.06);
  box-shadow: 0 0 0 3px rgb(var(--ui-accent) / 0.1);
}
.type-card[data-selected="true"][data-tone="success"] {
  border-color: rgb(var(--ui-success));
  background: rgb(var(--ui-success) / 0.06);
  box-shadow: 0 0 0 3px rgb(var(--ui-success) / 0.1);
}
.type-card[data-selected="true"][data-tone="running"] {
  border-color: rgb(var(--ui-info));
  background: rgb(var(--ui-info) / 0.06);
  box-shadow: 0 0 0 3px rgb(var(--ui-info) / 0.1);
}
.type-card:hover:not([data-selected="true"]) {
  border-color: rgb(var(--ui-border-strong));
  background: rgb(var(--ui-surface-2));
}
.type-card:focus-within {
  outline: 2px solid rgb(var(--ui-accent));
  outline-offset: 2px;
}
.type-radio {
  position: absolute;
  opacity: 0;
  width: 0;
  height: 0;
  pointer-events: none;
}
.type-card-icon {
  font-size: 1.25rem;
  flex-shrink: 0;
  line-height: 1;
  padding-top: 1px;
}
.type-card-body {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.type-card-title {
  font-weight: 600;
  font-size: var(--ui-text-sm);
  color: rgb(var(--ui-fg));
  line-height: 1.2;
}
.type-card-hint {
  font-size: var(--ui-text-xs);
  color: rgb(var(--ui-muted));
  line-height: 1.35;
}
.type-card-check {
  position: absolute;
  top: var(--ui-space-2);
  right: var(--ui-space-2);
  font-size: var(--ui-text-xs);
  font-weight: 700;
  color: rgb(var(--ui-accent-strong));
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: rgb(var(--ui-accent) / 0.15);
  display: flex;
  align-items: center;
  justify-content: center;
}

/* RichTextEditor ──────────────────────────────────────────────────────────── */
.rte-wrap {
  border: 1px solid rgb(var(--ui-border-strong));
  border-radius: var(--ui-radius-md);
  overflow: hidden;
  transition: border-color 0.15s, box-shadow 0.15s;
  background: rgb(var(--ui-bg));
}
.rte-wrap:focus-within {
  border-color: rgb(var(--ui-accent));
  box-shadow: 0 0 0 3px rgb(var(--ui-accent) / 0.15);
}
.rte-wrap[data-error="true"] { border-color: rgb(var(--ui-danger)); }
.rte-wrap[data-error="true"]:focus-within { box-shadow: 0 0 0 3px rgb(var(--ui-danger) / 0.12); }

.rte-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ui-space-3);
  padding: var(--ui-space-2) var(--ui-space-3);
  border-bottom: 1px solid rgb(var(--ui-border));
  background: rgb(var(--ui-surface-2));
}
.rte-toolbar-hint {
  font-size: var(--ui-text-xs);
  color: rgb(var(--ui-muted));
  font-style: italic;
}
.rte-char-count {
  font-size: var(--ui-text-xs);
  color: rgb(var(--ui-muted));
  font-family: var(--ui-font-mono);
  transition: color 0.15s;
}
.rte-char-count[data-warn="true"] { color: rgb(var(--ui-warning)); font-weight: 600; }
.rte-area {
  display: block;
  width: 100%;
  background: transparent;
  color: rgb(var(--ui-fg));
  border: none;
  padding: var(--ui-space-3) var(--ui-space-4);
  font: inherit;
  font-size: var(--ui-text-md);
  line-height: 1.6;
  min-height: 220px;
  resize: vertical;
  outline: none;
}
.rte-area::placeholder { color: rgb(var(--ui-faint)); }

/* Ações do formulário */
.form-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ui-space-3);
  flex-wrap: wrap;
  padding-top: var(--ui-space-2);
  border-top: 1px solid rgb(var(--ui-border));
}
.dirty-hint {
  margin: 0;
  font-size: var(--ui-text-xs);
  color: rgb(var(--ui-muted));
  font-style: italic;
}
.form-btns {
  display: flex;
  gap: var(--ui-space-2);
  margin-left: auto;
}

/* ── Diff ────────────────────────────────────────────────────────────────── */
.diff-list {
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-4);
}
.diff-item {
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-2);
}
.diff-field-label {
  font-size: var(--ui-text-xs);
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: rgb(var(--ui-muted));
}
.diff-row {
  display: flex;
  align-items: center;
  gap: var(--ui-space-2);
  flex-wrap: wrap;
}
.diff-block {
  display: flex;
  align-items: flex-start;
  gap: var(--ui-space-2);
  padding: var(--ui-space-2) var(--ui-space-3);
  border-radius: var(--ui-radius-sm);
  font-size: var(--ui-text-sm);
  min-width: 0;
  flex: 1 1 auto;
}
.diff-block-removed {
  background: rgb(var(--ui-danger) / 0.08);
  border: 1px solid rgb(var(--ui-danger) / 0.2);
  color: rgb(var(--ui-danger));
}
.diff-block-added {
  background: rgb(var(--ui-success) / 0.08);
  border: 1px solid rgb(var(--ui-success) / 0.2);
  color: rgb(var(--ui-fg));
}
.diff-marker {
  font-weight: 700;
  flex-shrink: 0;
  font-family: var(--ui-font-mono);
}
.diff-content { word-break: break-word; }
.diff-arrow {
  flex-shrink: 0;
  color: rgb(var(--ui-muted));
  font-size: var(--ui-text-md);
}
.diff-text-summary {
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-2);
}
.diff-stat {
  display: flex;
  gap: var(--ui-space-3);
  flex-wrap: wrap;
  font-size: var(--ui-text-xs);
  font-family: var(--ui-font-mono);
}
.diff-stat-added { color: rgb(var(--ui-success)); font-weight: 700; }
.diff-stat-removed { color: rgb(var(--ui-danger)); font-weight: 700; }
.diff-stat-neutral { color: rgb(var(--ui-muted)); }

.diff-preview {
  border: 1px solid rgb(var(--ui-border));
  border-radius: var(--ui-radius-sm);
  background: rgb(var(--ui-surface-2));
  overflow: hidden;
  font-size: var(--ui-text-sm);
  font-family: var(--ui-font-mono);
}
.diff-chunk {
  display: flex;
  gap: var(--ui-space-2);
  padding: 3px var(--ui-space-3);
  border-bottom: 1px solid rgb(var(--ui-border) / 0.5);
  line-height: 1.5;
}
.diff-chunk:last-child { border-bottom: none; }
.diff-chunk[data-kind="added"]   { background: rgb(var(--ui-success) / 0.07); }
.diff-chunk[data-kind="removed"] { background: rgb(var(--ui-danger) / 0.07);  }
.diff-chunk-marker {
  flex-shrink: 0;
  width: 14px;
  font-weight: 700;
  color: rgb(var(--ui-muted));
}
.diff-chunk[data-kind="added"]   .diff-chunk-marker { color: rgb(var(--ui-success)); }
.diff-chunk[data-kind="removed"] .diff-chunk-marker { color: rgb(var(--ui-danger));  }
.diff-chunk-text { word-break: break-all; color: rgb(var(--ui-fg)); min-width: 0; }

/* ── Sidebar ─────────────────────────────────────────────────────────────── */
/* Timeline de versões */
.ver-timeline {
  display: flex;
  flex-direction: column;
  margin-bottom: var(--ui-space-3);
}
.ver-item {
  display: flex;
  gap: var(--ui-space-3);
  align-items: flex-start;
}
.ver-connector {
  width: 1px;
  height: var(--ui-space-3);
  background: rgb(var(--ui-border));
  margin-left: 7px;
}
.ver-dot {
  width: 15px;
  height: 15px;
  border-radius: 50%;
  flex-shrink: 0;
  margin-top: 3px;
  border: 2px solid transparent;
}
.ver-dot-next {
  background: rgb(var(--ui-surface));
  border-color: rgb(var(--ui-border-strong));
  transition: background 0.15s, border-color 0.15s;
}
.ver-item-next[data-active="true"] .ver-dot-next {
  background: rgb(var(--ui-accent) / 0.3);
  border-color: rgb(var(--ui-accent));
}
.ver-dot-cur {
  background: rgb(var(--ui-accent));
  border-color: rgb(var(--ui-accent));
}
.ver-dot-old {
  background: rgb(var(--ui-muted) / 0.25);
  border-color: rgb(var(--ui-border-strong));
}
.ver-body {
  display: flex;
  flex-direction: column;
  gap: 1px;
  padding-bottom: var(--ui-space-2);
}
.ver-num {
  font-family: var(--ui-font-mono);
  font-weight: 700;
  font-size: var(--ui-text-md);
  color: rgb(var(--ui-fg));
}
.ver-state {
  font-size: var(--ui-text-xs);
  color: rgb(var(--ui-muted));
}
.ver-meta {
  font-size: var(--ui-text-xs);
  color: rgb(var(--ui-faint));
  font-family: var(--ui-font-mono);
}

/* Meta KV */
.meta-kv {
  display: grid;
  gap: var(--ui-space-3);
  margin: 0;
}
.meta-kv dt {
  color: rgb(var(--ui-muted));
  font-size: var(--ui-text-xs);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  font-weight: 600;
}
.meta-kv dd {
  margin: 2px 0 0;
  color: rgb(var(--ui-fg));
  font-size: var(--ui-text-sm);
  line-height: 1.4;
}
.meta-mono { font-family: var(--ui-font-mono); word-break: break-all; }
.meta-link {
  color: rgb(var(--ui-accent-strong));
  text-decoration: none;
  border-bottom: 1px solid rgb(var(--ui-accent) / 0.4);
  transition: border-color 0.15s;
}
.meta-link:hover { border-bottom-color: rgb(var(--ui-accent-strong)); }
.meta-link:focus-visible {
  outline: 2px solid rgb(var(--ui-accent));
  outline-offset: 2px;
  border-radius: var(--ui-radius-sm);
}

/* Histórico de versões */
.hist-empty { padding: var(--ui-space-2) 0; }
.hist-list {
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-3);
}
.hist-item {
  padding: var(--ui-space-3);
  border: 1px solid rgb(var(--ui-border));
  border-radius: var(--ui-radius-md);
  background: rgb(var(--ui-surface-2));
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-1);
}
.hist-item-top {
  display: flex;
  align-items: center;
  gap: var(--ui-space-2);
  justify-content: space-between;
}
.hist-date {
  font-size: var(--ui-text-xs);
  color: rgb(var(--ui-muted));
  font-family: var(--ui-font-mono);
}
.hist-preview {
  margin: 0;
  font-size: var(--ui-text-xs);
  color: rgb(var(--ui-muted));
  line-height: 1.45;
  white-space: pre-wrap;
  word-break: break-word;
}
.hist-preview-empty { font-style: italic; color: rgb(var(--ui-faint)); }
.hist-by {
  font-size: var(--ui-text-xs);
  color: rgb(var(--ui-faint));
}

.side-hint {
  margin: 0;
  font-size: var(--ui-text-sm);
  color: rgb(var(--ui-muted));
  line-height: 1.45;
}

/* ── Responsivo ──────────────────────────────────────────────────────────── */
@media (max-width: 860px) {
  .edit-grid {
    grid-template-columns: 1fr;
  }
  .gone-wrap {
    flex-direction: column;
    padding: var(--ui-space-5) var(--ui-space-4);
  }
  .vb-banner {
    flex-direction: column;
    align-items: flex-start;
  }
  .type-selector {
    grid-template-columns: repeat(2, 1fr);
  }
  .diff-row {
    flex-direction: column;
  }
  .diff-arrow { display: none; }
}

@media (max-width: 560px) {
  .edit-metrics {
    grid-template-columns: repeat(2, 1fr);
  }
  .type-selector {
    grid-template-columns: 1fr;
  }
  .form-actions {
    flex-direction: column;
    align-items: stretch;
  }
  .form-btns {
    width: 100%;
    margin-left: 0;
  }
}
</style>
