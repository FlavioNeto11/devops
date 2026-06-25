<template>
  <UiPageLayout
    eyebrow="Evolução clínica"
    :title="headerTitle"
    :subtitle="headerSubtitle"
    width="wide"
    :loading="loading"
    :error="error"
    @retry="load"
  >
    <!-- AÇÕES DO CABEÇALHO -->
    <template #actions>
      <UiButton variant="ghost" :to="backTo">Voltar</UiButton>
      <UiButton
        v-if="!notFound && note.patient_id"
        variant="ghost"
        :to="patientTo"
      >Ver paciente</UiButton>
      <UiButton
        v-if="!notFound && !isDeleted"
        variant="subtle"
        :to="editTo"
      >Editar</UiButton>
      <UiButton
        v-if="!notFound && !isDeleted"
        variant="danger"
        :loading="acting"
        @click="remove"
      >Excluir</UiButton>
    </template>

    <!-- BANNER DE EVOLUÇÃO EXCLUÍDA (soft-delete auditado) -->
    <template #banner>
      <div v-if="isDeleted" class="ev-banner" role="status">
        <span class="ev-banner-dot" aria-hidden="true" />
        <span>
          Esta evolução foi <strong>excluída</strong> em {{ formatDateTime(note.deleted_at) }} —
          permanece no histórico para auditoria, mas não pode mais ser editada.
        </span>
      </div>
    </template>

    <!-- ESTADO: evolução não encontrada (GET resolveu vazio / 404 sem throw) -->
    <UiEmptyState
      v-if="notFound"
      icon="search"
      title="Evolução não encontrada"
      description="Esta evolução pode ter sido excluída definitivamente ou o endereço está incorreto."
    >
      <template #action>
        <UiButton :to="backTo">Voltar para evoluções</UiButton>
      </template>
    </UiEmptyState>

    <!-- CORPO (só quando a evolução existe) -->
    <template v-else>
    <!-- MÉTRICAS RÁPIDAS -->
    <div class="ev-metrics">
      <UiMetricCard
        label="Tipo de registro"
        :value="typeLabel"
        tone="primary"
        :hint="typeHint"
      />
      <UiMetricCard
        label="Versão atual"
        :value="'v' + currentVersion"
        :tone="versions.length ? 'running' : 'neutral'"
        :hint="versions.length ? versions.length + ' edição(ões) registrada(s)' : 'documento original'"
      />
      <UiMetricCard
        label="Anexos"
        :value="formatNumber(attachments.length)"
        :tone="attachments.length ? 'success' : 'neutral'"
        hint="arquivos vinculados"
      />
      <UiMetricCard
        label="Última atualização"
        :value="formatDate(note.updated_at || note.note_date)"
        tone="neutral"
        :hint="formatDateTime(note.updated_at || note.note_date)"
      />
    </div>

    <!-- COLUNA PRINCIPAL: NOTA CLÍNICA + METADADOS -->
    <div class="ev-grid">
      <!-- NOTA CLÍNICA -->
      <UiCard title="Nota clínica" subtitle="Conteúdo registrado pelo profissional">
        <template #actions>
          <UiStatusBadge :status="effectiveStatus" :tone="statusTone" :label="statusLabel" size="lg" />
        </template>

        <p v-if="note.text" class="ev-note-text">{{ note.text }}</p>
        <UiEmptyState
          v-else
          icon="📝"
          title="Sem texto livre"
          description="Esta evolução não possui uma nota descritiva — confira os campos estruturados ao lado."
        />
      </UiCard>

      <!-- METADADOS DO DOCUMENTO -->
      <UiCard title="Identificação" subtitle="Quem, quando e a que paciente pertence">
        <dl class="ev-kv">
          <div>
            <dt>Paciente</dt>
            <dd>
              <UiButton
                v-if="note.patient_id"
                variant="ghost"
                size="sm"
                :to="patientTo"
              >{{ display(note.patient_id) }}</UiButton>
              <span v-else>—</span>
            </dd>
          </div>
          <div>
            <dt>Profissional</dt>
            <dd>{{ display(note.professional_id) }}</dd>
          </div>
          <div>
            <dt>Data da evolução</dt>
            <dd>{{ formatDateTime(note.note_date) }}</dd>
          </div>
          <div>
            <dt>Tipo</dt>
            <dd><UiStatusBadge :status="note.type || ''" :tone="typeTone" :label="typeLabel" /></dd>
          </div>
          <div>
            <dt>Criada por</dt>
            <dd>{{ display(note.created_by) }}</dd>
          </div>
          <div>
            <dt>Criada em</dt>
            <dd>{{ formatDateTime(note.created_at) }}</dd>
          </div>
        </dl>
      </UiCard>
    </div>

    <!-- CAMPOS ESTRUTURADOS -->
    <UiCard title="Campos estruturados" subtitle="Dados clínicos preenchidos em formulário">
      <dl v-if="structuredEntries.length" class="ev-structured">
        <div v-for="entry in structuredEntries" :key="entry.key">
          <dt>{{ entry.label }}</dt>
          <dd>{{ entry.value }}</dd>
        </div>
      </dl>
      <UiEmptyState
        v-else
        icon="🗂️"
        title="Nenhum campo estruturado"
        description="Esta evolução foi registrada apenas como texto livre, sem campos preenchidos em formulário."
      />
    </UiCard>

    <!-- ANEXOS -->
    <UiCard title="Anexos" subtitle="Arquivos vinculados a esta evolução">
      <template #actions>
        <UiStatusBadge
          :status="''"
          tone="neutral"
          :label="attachments.length + ' arquivo(s)'"
          :with-dot="false"
        />
      </template>
      <UiDataTable
        :columns="attachmentColumns"
        :rows="attachments"
        :loading="loading"
        row-key="id"
        density="compact"
        :empty="{ title: 'Nenhum anexo', description: 'Esta evolução não possui arquivos anexados.' }"
      >
        <template #cell-mime_type="{ value }">
          <UiStatusBadge :status="''" tone="neutral" :label="mimeLabel(value)" :with-dot="false" />
        </template>
        <template #cell-size_bytes="{ value }">{{ humanSize(value) }}</template>
        <template #cell-created_at="{ value }">{{ formatDateTime(value) }}</template>
      </UiDataTable>
    </UiCard>

    <!-- HISTÓRICO DE VERSÕES -->
    <UiCard title="Histórico de versões" subtitle="Cada edição preserva a versão anterior do documento">
      <template #actions>
        <UiStatusBadge
          :status="''"
          tone="neutral"
          :label="versions.length + ' versão(ões) anterior(es)'"
          :with-dot="false"
        />
      </template>
      <UiDataTable
        :columns="versionColumns"
        :rows="versionRows"
        :loading="loading"
        row-key="id"
        clickable-rows
        :empty="{
          title: 'Nenhuma edição ainda',
          description: 'Este documento permanece na sua versão original. Edições futuras aparecerão aqui.',
        }"
        @row-click="openVersion"
      >
        <template #cell-version_number="{ value }">
          <UiStatusBadge :status="''" tone="running" :label="'v' + value" :with-dot="false" />
        </template>
        <template #cell-edited_at="{ value }">{{ formatDateTime(value) }}</template>
        <template #cell-summary="{ row }">{{ snapshotSummary(row.snapshot) }}</template>
        <template #cell-action="{ row }">
          <UiButton variant="ghost" size="sm" @click.stop="openVersion(row)">Ver versão</UiButton>
        </template>
      </UiDataTable>
    </UiCard>

    <!-- MODAL: SNAPSHOT DE UMA VERSÃO -->
    <UiModal
      v-model:open="versionOpen"
      :title="selectedVersion ? 'Versão v' + selectedVersion.version_number : 'Versão'"
      width="lg"
    >
      <div v-if="selectedVersion" class="ev-snapshot">
        <dl class="ev-kv">
          <div>
            <dt>Editada por</dt>
            <dd>{{ display(selectedVersion.edited_by) }}</dd>
          </div>
          <div>
            <dt>Editada em</dt>
            <dd>{{ formatDateTime(selectedVersion.edited_at) }}</dd>
          </div>
          <div>
            <dt>Tipo (à época)</dt>
            <dd><UiStatusBadge :status="snap(selectedVersion).type || ''" :label="typeLabelOf(snap(selectedVersion).type)" /></dd>
          </div>
          <div>
            <dt>Data da evolução (à época)</dt>
            <dd>{{ formatDateTime(snap(selectedVersion).note_date) }}</dd>
          </div>
        </dl>

        <section class="ev-snapshot-text">
          <h4 class="ev-sub-h">Nota clínica desta versão</h4>
          <p v-if="snap(selectedVersion).text" class="ev-note-text">{{ snap(selectedVersion).text }}</p>
          <UiEmptyState
            v-else
            icon="📝"
            title="Sem texto nesta versão"
            description="Esta versão não possuía nota descritiva."
          />
        </section>

        <section v-if="snapStructured(selectedVersion).length" class="ev-snapshot-text">
          <h4 class="ev-sub-h">Campos estruturados desta versão</h4>
          <dl class="ev-structured">
            <div v-for="entry in snapStructured(selectedVersion)" :key="entry.key">
              <dt>{{ entry.label }}</dt>
              <dd>{{ entry.value }}</dd>
            </div>
          </dl>
        </section>
      </div>

      <template #footer>
        <UiButton variant="ghost" @click="versionOpen = false">Fechar</UiButton>
      </template>
    </UiModal>
    </template>
  </UiPageLayout>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue';
import { useRouter } from 'vue-router';
import {
  UiPageLayout,
  UiCard,
  UiMetricCard,
  UiStatusBadge,
  UiDataTable,
  UiButton,
  UiEmptyState,
  UiModal,
  useToast,
  useConfirm,
  format,
} from '../ui/index.js';
// Endpoint REAL: GET/PUT/DELETE /v1/evolution-notes/:id (espelha a coleção aninhada do paciente).
// A resposta do GET já traz `versions` e `attachments` agregados pelo serviço.
import { resourceFactory } from '../api.js';

const { formatNumber, formatDate, formatDateTime, humanize } = format;

const props = defineProps({ id: { type: [String, Number], required: true } });

const router = useRouter();
const toast = useToast();
const confirm = useConfirm();

const notesApi = resourceFactory('evolution-notes');

// ── Estado ──────────────────────────────────────────────────────────────────────
const loading = ref(true);
const error = ref(null);
const note = ref({});
const acting = ref(false);
// Diferencia "carregou e veio vazio" (evolução inexistente) de "ainda carregando"/"erro".
// Cobre o caso de notesApi.get resolver objeto vazio SEM lançar 404.
const notFound = computed(() => !loading.value && !error.value && !note.value.id);

// ── Modal de versão ───────────────────────────────────────────────────────────
const versionOpen = ref(false);
const selectedVersion = ref(null);

// ── Helpers de exibição ──────────────────────────────────────────────────────────
const display = (v) => (v === null || v === undefined || v === '' ? '—' : String(v));

const TYPE_LABELS = {
  session: 'Sessão',
  test_result: 'Resultado de teste',
  intervention_plan: 'Plano de intervenção',
  observation: 'Observação',
};
const TYPE_HINTS = {
  session: 'atendimento clínico',
  test_result: 'avaliação aplicada',
  intervention_plan: 'planejamento terapêutico',
  observation: 'anotação de acompanhamento',
};
const TYPE_TONES = {
  session: 'running',
  test_result: 'success',
  intervention_plan: 'primary',
  observation: 'neutral',
};
const typeLabelOf = (t) => TYPE_LABELS[t] || (t ? humanize(t) : '—');
const typeLabel = computed(() => typeLabelOf(note.value.type));
const typeHint = computed(() => TYPE_HINTS[note.value.type] || 'registro de evolução');
const typeTone = computed(() => TYPE_TONES[note.value.type] || 'neutral');

// status: deriva de deleted_at (soft-delete) com fallback ao campo status do backend
const isDeleted = computed(
  () => !!note.value.deleted_at || String(note.value.status || '').toLowerCase() === 'deleted'
);
const effectiveStatus = computed(() => (isDeleted.value ? 'deleted' : 'active'));
const statusTone = computed(() => (isDeleted.value ? 'error' : 'success'));
const statusLabel = computed(() => (isDeleted.value ? 'Excluída' : 'Ativa'));

// ── Versões e anexos (vêm agregados na resposta do GET) ──────────────────────────
const versions = computed(() => (Array.isArray(note.value.versions) ? note.value.versions : []));
const attachments = computed(() => (Array.isArray(note.value.attachments) ? note.value.attachments : []));
const currentVersion = computed(() => {
  const max = versions.value.reduce((m, v) => Math.max(m, Number(v.version_number) || 0), 0);
  return max + 1; // versões guardam snapshots anteriores; a atual é a próxima
});

// ── Cabeçalho ────────────────────────────────────────────────────────────────────
const headerTitle = computed(() => typeLabel.value + ' #' + props.id);
const headerSubtitle = computed(() => {
  const parts = [];
  if (note.value.patient_id) parts.push('Paciente ' + note.value.patient_id);
  if (note.value.note_date) parts.push(formatDate(note.value.note_date));
  return parts.length ? parts.join(' · ') : 'Detalhe completo da evolução.';
});

// ── Navegação (rotas reais de DOMÍNIO) ───────────────────────────────────────────
// Voltar → lista canônica de evoluções (origem provável; mesma da EvolutionNoteEditView).
const backTo = '/evolution-notes';
// Editar → o form REAL de edição (/evolution-notes/:id/edit → EvolutionNoteEditView).
// Não depende de patient_id: a ação primária da tela é editar ESTA evolução.
const editTo = computed(() => '/evolution-notes/' + props.id + '/edit');
// Link separado para a ficha do paciente (ação secundária "Ver paciente").
const patientTo = computed(() => (note.value.patient_id ? '/patients/' + note.value.patient_id : '/patients'));

// ── Campos estruturados → lista exibível ─────────────────────────────────────────
function structuredToEntries(obj) {
  if (!obj || typeof obj !== 'object') return [];
  return Object.keys(obj).map((key) => ({
    key,
    label: humanize(key),
    value: stringifyValue(obj[key]),
  }));
}
function stringifyValue(v) {
  if (v === null || v === undefined || v === '') return '—';
  if (Array.isArray(v)) return v.length ? v.map(stringifyValue).join(', ') : '—';
  if (typeof v === 'object') {
    try { return JSON.stringify(v); } catch { return String(v); }
  }
  if (typeof v === 'boolean') return v ? 'Sim' : 'Não';
  return String(v);
}
const structuredEntries = computed(() => structuredToEntries(note.value.structured_fields));

// ── Snapshots de versão ─────────────────────────────────────────────────────────
function snap(version) {
  return (version && version.snapshot && typeof version.snapshot === 'object') ? version.snapshot : {};
}
function snapStructured(version) {
  return structuredToEntries(snap(version).structured_fields);
}
function snapshotSummary(snapshot) {
  const s = snapshot && typeof snapshot === 'object' ? snapshot : {};
  const txt = (s.text || '').trim();
  if (txt) return txt.length > 80 ? txt.slice(0, 80) + '…' : txt;
  const fields = snapStructuredCount(s);
  return fields ? fields + ' campo(s) estruturado(s)' : '—';
}
function snapStructuredCount(s) {
  const sf = s && s.structured_fields;
  return sf && typeof sf === 'object' ? Object.keys(sf).length : 0;
}

// ── Anexos: rótulos amigáveis ────────────────────────────────────────────────────
function mimeLabel(mime) {
  if (!mime) return 'arquivo';
  const m = String(mime).toLowerCase();
  if (m.includes('pdf')) return 'PDF';
  if (m.startsWith('image/')) return 'Imagem';
  if (m.includes('word') || m.includes('document')) return 'Documento';
  if (m.includes('sheet') || m.includes('excel')) return 'Planilha';
  if (m.startsWith('text/')) return 'Texto';
  return m.split('/').pop() || 'arquivo';
}
function humanSize(bytes) {
  const n = Number(bytes);
  if (!isFinite(n) || n <= 0) return '—';
  if (n < 1024) return n + ' B';
  if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
  return (n / (1024 * 1024)).toFixed(1) + ' MB';
}

// ── Colunas ─────────────────────────────────────────────────────────────────────
const attachmentColumns = [
  { key: 'filename', label: 'Arquivo', sortable: true },
  { key: 'mime_type', label: 'Tipo' },
  { key: 'size_bytes', label: 'Tamanho', align: 'right', sortable: true },
  { key: 'created_at', label: 'Anexado em', sortable: true },
];
const versionColumns = [
  { key: 'version_number', label: 'Versão', sortable: true },
  { key: 'summary', label: 'Resumo' },
  { key: 'edited_by', label: 'Editada por' },
  { key: 'edited_at', label: 'Quando', sortable: true },
  { key: 'action', label: '', align: 'right' },
];
const versionRows = computed(() =>
  [...versions.value].sort((a, b) => (Number(b.version_number) || 0) - (Number(a.version_number) || 0))
);

// ── Carregamento ─────────────────────────────────────────────────────────────────
async function load() {
  loading.value = true;
  error.value = null;
  try {
    note.value = (await notesApi.get(props.id)) || {};
  } catch (e) {
    error.value = e;
  } finally {
    loading.value = false;
  }
}

// ── Ações ───────────────────────────────────────────────────────────────────────
function openVersion(row) {
  selectedVersion.value = row;
  versionOpen.value = true;
}

async function remove() {
  const ok = await confirm({
    title: 'Excluir evolução',
    message:
      'A evolução ' + headerTitle.value + ' será marcada como excluída (soft-delete auditado): ' +
      'ela sai dos registros ativos mas continua no histórico para auditoria. Confirmar?',
    confirmLabel: 'Excluir',
    danger: true,
  });
  if (!ok) return;
  acting.value = true;
  try {
    await notesApi.remove(props.id);
    toast.success('Evolução excluída.', { detail: 'O registro permanece auditável no histórico.' });
    await load(); // reflete o novo estado (banner de excluída + ações ocultas)
  } catch (e) {
    toast.error('Não foi possível excluir a evolução', { detail: e.message, code: e.status });
  } finally {
    acting.value = false;
  }
}

watch(() => props.id, load);
onMounted(load);
</script>

<style scoped>
.ev-metrics {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
  gap: var(--ui-space-4);
}
.ev-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr);
  gap: var(--ui-space-4);
  align-items: start;
}
.ev-note-text {
  margin: 0;
  font-size: var(--ui-text-md);
  line-height: 1.7;
  color: rgb(var(--ui-fg));
  white-space: pre-wrap;
  word-break: break-word;
}
.ev-kv {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--ui-space-4);
  margin: 0;
}
.ev-kv > div {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.ev-kv dt {
  color: rgb(var(--ui-muted));
  font-size: var(--ui-text-xs);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  font-weight: 600;
}
.ev-kv dd {
  margin: 0;
  font-size: var(--ui-text-md);
  word-break: break-word;
}
.ev-structured {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: var(--ui-space-4);
  margin: 0;
}
.ev-structured > div {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: var(--ui-space-3);
  border: 1px solid rgb(var(--ui-border));
  border-radius: var(--ui-radius-md);
  background: rgb(var(--ui-surface-2));
  min-width: 0;
}
.ev-structured dt {
  color: rgb(var(--ui-muted));
  font-size: var(--ui-text-xs);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  font-weight: 600;
}
.ev-structured dd {
  margin: 0;
  font-size: var(--ui-text-md);
  word-break: break-word;
}
.ev-banner {
  display: flex;
  align-items: center;
  gap: var(--ui-space-3);
  padding: var(--ui-space-3) var(--ui-space-4);
  border: 1px solid rgb(var(--ui-danger) / 0.4);
  background: rgb(var(--ui-danger) / 0.08);
  color: rgb(var(--ui-fg));
  border-radius: var(--ui-radius-md);
  font-size: var(--ui-text-sm);
}
.ev-banner-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: rgb(var(--ui-danger));
  flex-shrink: 0;
}
.ev-snapshot {
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-5);
}
.ev-snapshot-text {
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-3);
}
.ev-sub-h {
  margin: 0;
  font-size: var(--ui-text-sm);
  color: rgb(var(--ui-muted));
  text-transform: uppercase;
  letter-spacing: 0.04em;
  font-weight: 700;
}

@media (max-width: 860px) {
  .ev-grid {
    grid-template-columns: minmax(0, 1fr);
  }
  .ev-kv {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
