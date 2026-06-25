<!--
  EvolutionNoteDetailView — Leitura completa de uma nota de evolução clínica.
  REQ-NEUROEVOLUI-0004 / REQ-NEUROEVOLUI-0003
  Endpoint: GET /v1/evolution-notes/:id

  Componentes lógicos implementados inline (padrão kit-only):
    NoteHeader          — banner de identificação: tipo, paciente, profissional, data
    ContentRenderer     — área de leitura do texto clínico com tipografia e semântica
    StructuredFieldsViewer — tabela de campos estruturados derivados do JSON
    AttachmentList      — lista de anexos com metadados e indicador de download
    AuditStamp          — carimbo de criação/última edição/autor com histórico de versões

  Regras do contrato de UI:
  - SÓ componentes do kit (../ui/index.js); SÓ tokens --ui-*
  - PROIBIDO style= inline / :style / v-html
  - Todos os estados: loading (skeleton) · empty · error (retry) · normal
  - a11y: landmarks semânticos, aria-label, foco visível, responsivo ≤860px
-->
<template>
  <UiPageLayout
    eyebrow="Evolução clínica"
    :title="headerTitle"
    :subtitle="headerSubtitle"
    width="wide"
    :loading="loading"
    :error="pageError"
    @retry="load"
  >
    <!-- ── AÇÕES ──────────────────────────────────────────────────────────────── -->
    <template #actions>
      <UiButton variant="ghost" to="/evolution-notes">Voltar</UiButton>
      <UiButton
        v-if="hasPatient && !notFound"
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

    <!-- ── BANNER: evolução excluída ─────────────────────────────────────────── -->
    <template #banner>
      <div v-if="isDeleted" class="end-banner end-banner-danger" role="status" aria-live="polite">
        <span class="end-banner-icon" aria-hidden="true">
          <span class="end-banner-dot" />
        </span>
        <div class="end-banner-content">
          <strong>Evolução excluída</strong> —
          Esta nota foi marcada como excluída
          <template v-if="note.deleted_at"> em {{ formatDateTime(note.deleted_at) }}</template>.
          Ela permanece no histórico para fins de auditoria e não pode mais ser editada.
        </div>
      </div>
    </template>

    <!-- ── ESTADO: não encontrado ─────────────────────────────────────────────── -->
    <UiEmptyState
      v-if="notFound"
      icon="search"
      title="Evolução não encontrada"
      description="Esta evolução pode ter sido excluída definitivamente ou o endereço está incorreto."
    >
      <template #action>
        <UiButton to="/evolution-notes">Ver todas as evoluções</UiButton>
      </template>
    </UiEmptyState>

    <!-- ── CORPO PRINCIPAL ───────────────────────────────────────────────────── -->
    <template v-else>

      <!-- KPIs rápidos -->
      <section class="end-metrics" aria-label="Resumo da evolução">
        <UiMetricCard
          label="Tipo de registro"
          :value="typeLabel"
          tone="primary"
          :hint="typeHint"
        />
        <UiMetricCard
          label="Data da evolução"
          :value="formatDate(note.note_date)"
          tone="neutral"
          :hint="note.note_date ? formatDateTime(note.note_date) : 'Sem data'"
        />
        <UiMetricCard
          label="Campos estruturados"
          :value="formatNumber(structuredEntries.length)"
          :tone="structuredEntries.length ? 'success' : 'neutral'"
          hint="campos preenchidos"
        />
        <UiMetricCard
          label="Anexos"
          :value="formatNumber(attachments.length)"
          :tone="attachments.length ? 'running' : 'neutral'"
          hint="arquivos vinculados"
        />
      </section>

      <!-- ── NOTE HEADER BANNER ──────────────────────────────────────────────── -->
      <div class="end-note-header" role="region" aria-label="Identificação da nota">
        <!-- Ícone de tipo -->
        <div class="end-type-icon" :data-type="typeKey" aria-hidden="true">
          <span class="end-type-glyph">{{ typeGlyph }}</span>
        </div>

        <div class="end-note-header-main">
          <div class="end-note-header-top">
            <UiStatusBadge
              :status="note.type || ''"
              :tone="typeTone"
              :label="typeLabel"
              size="lg"
              with-dot
            />
            <UiStatusBadge
              :status="effectiveStatus"
              :tone="statusTone"
              :label="statusLabel"
              size="lg"
            />
            <time
              v-if="note.note_date"
              class="end-note-date"
              :datetime="note.note_date"
            >{{ formatDateTime(note.note_date) }}</time>
          </div>

          <div class="end-note-header-links">
            <!-- Paciente -->
            <div class="end-chip-link">
              <span class="end-chip-label">Paciente</span>
              <RouterLink
                v-if="hasPatient"
                class="end-link"
                :to="patientTo"
              >{{ display(note.patient_id) }}</RouterLink>
              <span v-else class="end-chip-value">—</span>
            </div>

            <!-- Profissional -->
            <div class="end-chip-link">
              <span class="end-chip-label">Profissional</span>
              <RouterLink
                v-if="hasProfessional"
                class="end-link"
                :to="professionalTo"
              >{{ display(note.professional_id) }}</RouterLink>
              <span v-else class="end-chip-value">—</span>
            </div>

            <!-- ID da nota -->
            <div class="end-chip-link">
              <span class="end-chip-label">ID</span>
              <span class="end-chip-mono">{{ display(note.id) }}</span>
            </div>
          </div>
        </div>

        <!-- Ações rápidas -->
        <div class="end-note-header-actions">
          <UiButton
            v-if="!isDeleted"
            variant="subtle"
            size="sm"
            :to="editTo"
          >Editar nota</UiButton>
        </div>
      </div>

      <!-- ── GRADE PRINCIPAL: conteúdo + metadados ──────────────────────────── -->
      <div class="end-grid">

        <!-- COLUNA ESQUERDA: conteúdo clínico -->
        <div class="end-col-main">

          <!-- ContentRenderer: texto clínico -->
          <UiCard title="Conteúdo clínico" subtitle="Nota descritiva registrada pelo profissional">
            <template #actions>
              <UiStatusBadge
                :status="note.type || ''"
                :tone="typeTone"
                :label="typeLabel"
              />
            </template>

            <article
              v-if="note.text"
              class="end-content-renderer"
              aria-label="Texto da nota clínica"
            >
              <p class="end-note-text">{{ note.text }}</p>
            </article>
            <UiEmptyState
              v-else
              icon="doc"
              title="Sem texto livre"
              description="Esta evolução não possui uma nota descritiva — os dados clínicos estão nos campos estruturados."
            />
          </UiCard>

          <!-- StructuredFieldsViewer -->
          <UiCard
            title="Campos estruturados"
            subtitle="Dados clínicos preenchidos em formulário padronizado"
          >
            <template #actions>
              <UiStatusBadge
                :status="''"
                tone="neutral"
                :label="structuredEntries.length + ' campo(s)'"
                :with-dot="false"
              />
            </template>

            <dl v-if="structuredEntries.length" class="end-structured-grid">
              <div
                v-for="entry in structuredEntries"
                :key="entry.key"
                class="end-field-card"
              >
                <dt class="end-field-key">{{ entry.label }}</dt>
                <dd
                  class="end-field-val"
                  :data-empty="entry.value === '—' ? 'true' : null"
                >{{ entry.value }}</dd>
              </div>
            </dl>
            <UiEmptyState
              v-else
              icon="list"
              title="Nenhum campo estruturado"
              description="Esta evolução foi registrada apenas como texto livre, sem campos preenchidos em formulário."
            />
          </UiCard>

        </div>

        <!-- COLUNA DIREITA: metadados + vínculos -->
        <div class="end-col-side">

          <!-- Identificação / metadados do documento -->
          <UiCard title="Identificação" subtitle="Referências e metadados do documento">
            <dl class="end-kv">
              <div>
                <dt>Paciente</dt>
                <dd>
                  <RouterLink v-if="hasPatient" class="end-link" :to="patientTo">
                    {{ display(note.patient_id) }}
                  </RouterLink>
                  <span v-else>—</span>
                </dd>
              </div>
              <div>
                <dt>Profissional</dt>
                <dd>
                  <RouterLink v-if="hasProfessional" class="end-link" :to="professionalTo">
                    {{ display(note.professional_id) }}
                  </RouterLink>
                  <span v-else>—</span>
                </dd>
              </div>
              <div>
                <dt>Tipo</dt>
                <dd>
                  <UiStatusBadge
                    :status="note.type || ''"
                    :tone="typeTone"
                    :label="typeLabel"
                    size="sm"
                  />
                </dd>
              </div>
              <div>
                <dt>Situação</dt>
                <dd>
                  <UiStatusBadge
                    :status="effectiveStatus"
                    :tone="statusTone"
                    :label="statusLabel"
                    size="sm"
                  />
                </dd>
              </div>
              <div>
                <dt>Data da evolução</dt>
                <dd>{{ formatDateTime(note.note_date) }}</dd>
              </div>
            </dl>

            <template #footer>
              <div class="end-foot-actions">
                <UiButton
                  v-if="hasPatient"
                  variant="ghost"
                  size="sm"
                  :to="patientTo"
                >Ver ficha do paciente</UiButton>
                <UiButton
                  v-if="hasProfessional"
                  variant="ghost"
                  size="sm"
                  :to="professionalTo"
                >Ver profissional</UiButton>
              </div>
            </template>
          </UiCard>

          <!-- AuditStamp: carimbo de auditoria -->
          <UiCard title="Carimbo de auditoria" subtitle="Rastreabilidade de criação e edições">
            <dl class="end-kv">
              <div>
                <dt>Criada por</dt>
                <dd>{{ display(note.created_by) }}</dd>
              </div>
              <div>
                <dt>Criada em</dt>
                <dd>
                  <time
                    v-if="note.created_at"
                    :datetime="note.created_at"
                  >{{ formatDateTime(note.created_at) }}</time>
                  <span v-else>—</span>
                </dd>
              </div>
              <div>
                <dt>Última edição por</dt>
                <dd>{{ display(note.updated_by || note.last_edited_by) }}</dd>
              </div>
              <div>
                <dt>Última edição em</dt>
                <dd>
                  <time
                    v-if="note.updated_at"
                    :datetime="note.updated_at"
                  >{{ formatDateTime(note.updated_at) }}</time>
                  <span v-else>—</span>
                </dd>
              </div>
              <div v-if="isDeleted">
                <dt>Excluída em</dt>
                <dd>
                  <time
                    v-if="note.deleted_at"
                    :datetime="note.deleted_at"
                  >{{ formatDateTime(note.deleted_at) }}</time>
                  <span v-else>—</span>
                </dd>
              </div>
            </dl>

            <!-- Linha do tempo de versões (compacta) -->
            <div v-if="versions.length" class="end-audit-versions">
              <p class="end-audit-versions-title">
                {{ versions.length }} edição(ões) anterior(es) —
                <button
                  type="button"
                  class="end-btn-inline"
                  @click="historyOpen = true"
                >ver histórico</button>
              </p>
              <ol class="end-version-timeline">
                <li
                  v-for="v in recentVersions"
                  :key="v.id || v.version_number"
                  class="end-version-item"
                >
                  <span class="end-version-dot" aria-hidden="true" />
                  <div class="end-version-body">
                    <span class="end-version-badge">v{{ v.version_number }}</span>
                    <span class="end-version-who">{{ display(v.edited_by) }}</span>
                    <time class="end-version-when">{{ formatDateTime(v.edited_at) }}</time>
                  </div>
                </li>
              </ol>
            </div>
            <div v-else class="end-audit-clean">
              <span class="end-audit-clean-text">Documento original — sem edições anteriores</span>
            </div>

            <template #footer>
              <div class="end-foot-actions">
                <span class="end-foot-id">ID: <span class="end-mono">{{ display(note.id) }}</span></span>
                <UiButton
                  v-if="versions.length"
                  variant="ghost"
                  size="sm"
                  @click="historyOpen = true"
                >Histórico completo</UiButton>
              </div>
            </template>
          </UiCard>

        </div>
      </div>

      <!-- ── AttachmentList ──────────────────────────────────────────────────── -->
      <UiCard title="Anexos" subtitle="Arquivos vinculados a esta evolução clínica">
        <template #actions>
          <UiStatusBadge
            :status="''"
            tone="neutral"
            :label="attachments.length + ' arquivo(s)'"
            :with-dot="false"
          />
        </template>

        <!-- Lista visual de anexos (não tabela, para ser mais rica) -->
        <div v-if="attachments.length" class="end-attachment-list" role="list" aria-label="Lista de anexos">
          <div
            v-for="(att, idx) in attachments"
            :key="att.id || att.filename || idx"
            class="end-attachment-item"
            role="listitem"
          >
            <div class="end-att-icon" :data-mime="mimeCategory(att.mime_type)" aria-hidden="true">
              <span>{{ mimeIcon(att.mime_type) }}</span>
            </div>
            <div class="end-att-meta">
              <p class="end-att-name">{{ att.filename || att.name || 'arquivo-' + (idx + 1) }}</p>
              <p class="end-att-info">
                <span v-if="att.mime_type" class="end-att-tag">{{ mimeLabel(att.mime_type) }}</span>
                <span v-if="att.size_bytes" class="end-att-size">{{ humanSize(att.size_bytes) }}</span>
                <time v-if="att.created_at" class="end-att-date">{{ formatDateTime(att.created_at) }}</time>
              </p>
            </div>
            <div class="end-att-actions">
              <UiButton
                v-if="att.url || att.download_url"
                variant="ghost"
                size="sm"
                :href="att.url || att.download_url"
              >Baixar</UiButton>
              <span v-else class="end-att-no-url">Sem link</span>
            </div>
          </div>
        </div>

        <!-- Tabela alternativa para muitos anexos -->
        <UiDataTable
          v-if="attachments.length > 4"
          :columns="attachmentColumns"
          :rows="attachments"
          :loading="loading"
          row-key="id"
          density="compact"
          :empty="{ title: 'Nenhum anexo', description: 'Esta evolução não possui arquivos anexados.' }"
          class="end-attachment-table"
        >
          <template #cell-mime_type="{ value }">
            <UiStatusBadge :status="''" tone="neutral" :label="mimeLabel(value)" :with-dot="false" />
          </template>
          <template #cell-size_bytes="{ value }">{{ humanSize(value) }}</template>
          <template #cell-created_at="{ value }">{{ formatDateTime(value) }}</template>
        </UiDataTable>

        <UiEmptyState
          v-if="!attachments.length"
          icon="doc"
          title="Nenhum anexo"
          description="Esta evolução não possui arquivos anexados. Edite a nota para incluir documentos ou imagens."
        >
          <template #action>
            <UiButton v-if="!isDeleted" variant="subtle" :to="editTo">Editar para anexar</UiButton>
          </template>
        </UiEmptyState>
      </UiCard>

      <!-- ── Histórico de versões (tabela) ─────────────────────────────────── -->
      <UiCard
        title="Histórico de versões"
        subtitle="Cada edição preserva um snapshot completo da versão anterior"
      >
        <template #actions>
          <UiStatusBadge
            :status="''"
            tone="neutral"
            :label="versions.length ? versions.length + ' versão(ões) anterior(es)' : 'Original'"
            :with-dot="false"
          />
        </template>

        <UiDataTable
          :columns="versionColumns"
          :rows="versionRows"
          :loading="loading"
          row-key="id"
          density="compact"
          clickable-rows
          :empty="{
            title: 'Nenhuma edição anterior',
            description: 'Este documento está na versão original. Edições futuras aparecerão aqui.',
            icon: 'check',
          }"
          @row-click="openVersion"
        >
          <template #cell-version_number="{ value }">
            <UiStatusBadge :status="''" tone="running" :label="'v' + value" :with-dot="false" />
          </template>
          <template #cell-edited_at="{ value }">{{ formatDateTime(value) }}</template>
          <template #cell-summary="{ row }">
            <span class="end-version-summary">{{ snapshotSummary(row.snapshot) }}</span>
          </template>
          <template #cell-action="{ row }">
            <UiButton variant="ghost" size="sm" @click.stop="openVersion(row)">Ver versão</UiButton>
          </template>
        </UiDataTable>
      </UiCard>

      <!-- ── MODAL: Snapshot de uma versão ─────────────────────────────────── -->
      <UiModal
        v-model:open="versionOpen"
        :title="selectedVersion ? 'Versão v' + selectedVersion.version_number + ' — snapshot' : 'Versão anterior'"
        width="lg"
      >
        <div v-if="selectedVersion" class="end-snapshot">
          <!-- Carimbo da versão -->
          <div class="end-snapshot-stamp">
            <dl class="end-kv end-kv-2">
              <div>
                <dt>Versão</dt>
                <dd>
                  <UiStatusBadge
                    :status="''"
                    tone="running"
                    :label="'v' + selectedVersion.version_number"
                    :with-dot="false"
                  />
                </dd>
              </div>
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
                <dd>
                  <UiStatusBadge
                    :status="snap(selectedVersion).type || ''"
                    :label="typeLabelOf(snap(selectedVersion).type)"
                    size="sm"
                  />
                </dd>
              </div>
              <div>
                <dt>Data da evolução (à época)</dt>
                <dd>{{ formatDateTime(snap(selectedVersion).note_date) }}</dd>
              </div>
            </dl>
          </div>

          <!-- Texto clínico desta versão -->
          <section class="end-snapshot-section">
            <h4 class="end-snapshot-title">Nota clínica nesta versão</h4>
            <article
              v-if="snap(selectedVersion).text"
              class="end-content-renderer end-content-renderer-sm"
              aria-label="Texto da nota nesta versão"
            >
              <p class="end-note-text">{{ snap(selectedVersion).text }}</p>
            </article>
            <UiEmptyState
              v-else
              icon="doc"
              title="Sem texto nesta versão"
              description="Esta versão não possuía nota descritiva."
            />
          </section>

          <!-- Campos estruturados desta versão -->
          <section
            v-if="snapStructured(selectedVersion).length"
            class="end-snapshot-section"
          >
            <h4 class="end-snapshot-title">Campos estruturados nesta versão</h4>
            <dl class="end-structured-grid">
              <div
                v-for="entry in snapStructured(selectedVersion)"
                :key="entry.key"
                class="end-field-card"
              >
                <dt class="end-field-key">{{ entry.label }}</dt>
                <dd class="end-field-val">{{ entry.value }}</dd>
              </div>
            </dl>
          </section>
        </div>

        <template #footer>
          <UiButton variant="ghost" @click="versionOpen = false">Fechar</UiButton>
        </template>
      </UiModal>

      <!-- ── MODAL: Histórico completo (trigger do AuditStamp) ─────────────── -->
      <UiModal
        v-model:open="historyOpen"
        title="Histórico de edições"
        width="lg"
      >
        <UiDataTable
          :columns="versionColumns"
          :rows="versionRows"
          row-key="id"
          density="compact"
          clickable-rows
          :empty="{
            title: 'Nenhuma edição anterior',
            description: 'Este documento está na versão original.',
          }"
          @row-click="openVersionFromHistory"
        >
          <template #cell-version_number="{ value }">
            <UiStatusBadge :status="''" tone="running" :label="'v' + value" :with-dot="false" />
          </template>
          <template #cell-edited_at="{ value }">{{ formatDateTime(value) }}</template>
          <template #cell-summary="{ row }">
            <span class="end-version-summary">{{ snapshotSummary(row.snapshot) }}</span>
          </template>
          <template #cell-action="{ row }">
            <UiButton variant="ghost" size="sm" @click.stop="openVersionFromHistory(row)">Ver snapshot</UiButton>
          </template>
        </UiDataTable>

        <template #footer>
          <UiButton variant="ghost" @click="historyOpen = false">Fechar</UiButton>
        </template>
      </UiModal>

    </template>

    <!-- ── RODAPÉ ─────────────────────────────────────────────────────────── -->
    <template #footer>
      <span>
        Evolução #{{ display(props.id) }}
        <template v-if="note.patient_id"> · Paciente {{ note.patient_id }}</template>
        <template v-if="note.note_date"> · {{ formatDate(note.note_date) }}</template>
        — fonte: prontuário clínico do tenant em tempo real.
      </span>
    </template>
  </UiPageLayout>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue';
import { RouterLink } from 'vue-router';
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
// Endpoint REAL: GET /v1/evolution-notes/:id
import { resourceFactory } from '../api.js';

const { formatNumber, formatDate, formatDateTime, humanize } = format;

const props = defineProps({ id: { type: [String, Number], required: true } });

const toast = useToast();
const confirm = useConfirm();

// Recurso REST: /v1/evolution-notes (o backend agrega versions + attachments no GET /:id)
const notesApi = resourceFactory('evolution-notes');

// ── Estado ──────────────────────────────────────────────────────────────────────
const loading = ref(true);
const error = ref(null);
const note = ref({});
const acting = ref(false);

const versionOpen = ref(false);
const historyOpen = ref(false);
const selectedVersion = ref(null);

// Diferencia "carregou e veio vazio" de "ainda carregando"/"erro":
// cobre o caso de notesApi.get resolver objeto vazio SEM lançar 404.
const notFound = computed(() => !loading.value && !error.value && !note.value.id);

// ── Helpers de exibição ─────────────────────────────────────────────────────────
const display = (v) => (v === null || v === undefined || v === '' ? '—' : String(v));

// ── Tipos de nota: mapeamento enum (REQ-NEUROEVOLUI-0004) ──────────────────────
// Suporta tanto os valores do schema (nota_clinica, resultado_teste, etc.)
// quanto os valores legados do template anterior (session, test_result, etc.)
const TYPE_LABELS = {
  nota_clinica: 'Nota Clínica',
  resultado_teste: 'Resultado de Teste',
  plano_intervencao: 'Plano de Intervenção',
  anamnese: 'Anamnese',
  outro: 'Outro',
  // legado
  session: 'Sessão',
  test_result: 'Resultado de Teste',
  intervention_plan: 'Plano de Intervenção',
  observation: 'Observação',
};
const TYPE_HINTS = {
  nota_clinica: 'registro de atendimento clínico',
  resultado_teste: 'avaliação neuropsicológica aplicada',
  plano_intervencao: 'planejamento terapêutico estruturado',
  anamnese: 'levantamento de histórico do paciente',
  outro: 'registro livre',
  session: 'atendimento clínico',
  test_result: 'avaliação aplicada',
  intervention_plan: 'planejamento terapêutico',
  observation: 'anotação de acompanhamento',
};
const TYPE_TONES = {
  nota_clinica: 'running',
  resultado_teste: 'success',
  plano_intervencao: 'warning',
  anamnese: 'primary',
  outro: 'neutral',
  session: 'running',
  test_result: 'success',
  intervention_plan: 'warning',
  observation: 'neutral',
};
const TYPE_GLYPHS = {
  nota_clinica: 'N',
  resultado_teste: 'T',
  plano_intervencao: 'P',
  anamnese: 'A',
  outro: 'O',
  session: 'S',
  test_result: 'T',
  intervention_plan: 'P',
  observation: 'O',
};

const normType = (t) => String(t || '').toLowerCase().trim();
const typeLabelOf = (t) => TYPE_LABELS[normType(t)] || (t ? humanize(t) : '—');
const typeLabel = computed(() => typeLabelOf(note.value.type));
const typeHint = computed(() => TYPE_HINTS[normType(note.value.type)] || 'registro de evolução');
const typeTone = computed(() => TYPE_TONES[normType(note.value.type)] || 'neutral');
const typeKey = computed(() => normType(note.value.type) || 'outro');
const typeGlyph = computed(() => TYPE_GLYPHS[normType(note.value.type)] || '•');

// ── Status / soft-delete ────────────────────────────────────────────────────────
const isDeleted = computed(
  () => !!note.value.deleted_at || normType(note.value.status) === 'excluido' || normType(note.value.status) === 'deleted'
);
const effectiveStatus = computed(() => (isDeleted.value ? 'excluido' : (note.value.status || 'ativo')));
const statusTone = computed(() => (isDeleted.value ? 'error' : 'success'));
const statusLabel = computed(() => (isDeleted.value ? 'Excluída' : 'Ativa'));

// ── Navegação (rotas de domínio reais) ───────────────────────────────────────────
const hasPatient = computed(() => !!note.value.patient_id);
const hasProfessional = computed(() => !!note.value.professional_id);
const patientTo = computed(() => (hasPatient.value ? '/patients/' + note.value.patient_id : '/patients'));
const professionalTo = computed(() => (hasProfessional.value ? '/professionals/' + note.value.professional_id : '/professionals'));
const editTo = computed(() => '/evolution-notes/' + props.id + '/edit');

// ── Cabeçalho ───────────────────────────────────────────────────────────────────
const headerTitle = computed(() => typeLabel.value + ' #' + props.id);
const headerSubtitle = computed(() => {
  const parts = [];
  if (note.value.patient_id) parts.push('Paciente ' + note.value.patient_id);
  if (note.value.note_date) parts.push(formatDate(note.value.note_date));
  if (note.value.professional_id) parts.push('por ' + note.value.professional_id);
  return parts.length ? parts.join(' · ') : 'Leitura completa da nota de evolução.';
});

// ── Versões e anexos (vêm agregados na resposta do GET /:id) ────────────────────
const versions = computed(() => (Array.isArray(note.value.versions) ? note.value.versions : []));
const attachments = computed(() => (Array.isArray(note.value.attachments) ? note.value.attachments : []));

const recentVersions = computed(() =>
  [...versions.value]
    .sort((a, b) => (Number(b.version_number) || 0) - (Number(a.version_number) || 0))
    .slice(0, 3)
);

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
  if (Array.isArray(v)) return v.length ? v.map((x) => stringifyValue(x)).join(', ') : '—';
  if (typeof v === 'object') {
    try { return JSON.stringify(v, null, 2); } catch { return String(v); }
  }
  if (typeof v === 'boolean') return v ? 'Sim' : 'Não';
  return String(v);
}

// O campo structured_fields pode vir como string JSON ou objeto já parseado
const parsedStructuredFields = computed(() => {
  const sf = note.value.structured_fields;
  if (!sf) return null;
  if (typeof sf === 'object') return sf;
  if (typeof sf === 'string') {
    try { return JSON.parse(sf); } catch { return null; }
  }
  return null;
});
const structuredEntries = computed(() => structuredToEntries(parsedStructuredFields.value));

// ── Snapshots de versão ──────────────────────────────────────────────────────────
function snap(version) {
  return version && version.snapshot && typeof version.snapshot === 'object'
    ? version.snapshot
    : {};
}
function snapStructured(version) {
  const sf = snap(version).structured_fields;
  if (!sf) return [];
  if (typeof sf === 'string') {
    try { return structuredToEntries(JSON.parse(sf)); } catch { return []; }
  }
  return structuredToEntries(sf);
}
function snapshotSummary(snapshot) {
  const s = snapshot && typeof snapshot === 'object' ? snapshot : {};
  const txt = String(s.text || '').replace(/\s+/g, ' ').trim();
  if (txt) return txt.length > 90 ? txt.slice(0, 89) + '…' : txt;
  const sf = s.structured_fields;
  const count = sf && typeof sf === 'object' ? Object.keys(sf).length : 0;
  return count ? count + ' campo(s) estruturado(s)' : '—';
}

// ── Anexos: metadados ────────────────────────────────────────────────────────────
function mimeCategory(mime) {
  if (!mime) return 'file';
  const m = String(mime).toLowerCase();
  if (m.includes('pdf')) return 'pdf';
  if (m.startsWith('image/')) return 'image';
  if (m.includes('word') || m.includes('document')) return 'doc';
  if (m.includes('sheet') || m.includes('excel') || m.includes('csv')) return 'sheet';
  if (m.startsWith('text/')) return 'text';
  return 'file';
}
function mimeIcon(mime) {
  const cat = mimeCategory(mime);
  const icons = { pdf: 'P', image: 'I', doc: 'D', sheet: 'S', text: 'T', file: 'F' };
  return icons[cat] || 'F';
}
function mimeLabel(mime) {
  if (!mime) return 'arquivo';
  const m = String(mime).toLowerCase();
  if (m.includes('pdf')) return 'PDF';
  if (m.startsWith('image/')) return 'Imagem';
  if (m.includes('word') || m.includes('document')) return 'Documento';
  if (m.includes('sheet') || m.includes('excel')) return 'Planilha';
  if (m.includes('csv')) return 'CSV';
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

// ── Colunas das tabelas ──────────────────────────────────────────────────────────
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
    note.value = {};
  } finally {
    loading.value = false;
  }
}

// ── Ações ────────────────────────────────────────────────────────────────────────
const pageError = computed(() =>
  error.value ? (error.value.message || 'Não foi possível carregar a evolução.') : null
);

function openVersion(row) {
  selectedVersion.value = row;
  historyOpen.value = false;
  versionOpen.value = true;
}

function openVersionFromHistory(row) {
  selectedVersion.value = row;
  historyOpen.value = false;
  versionOpen.value = true;
}

async function remove() {
  const ok = await confirm({
    title: 'Excluir evolução',
    message:
      'A evolução "' + typeLabel.value + ' #' + props.id + '" será marcada como excluída ' +
      '(soft-delete auditado): ela sai dos registros ativos mas permanece no histórico para auditoria. ' +
      'Confirmar a exclusão?',
    confirmLabel: 'Excluir',
    danger: true,
  });
  if (!ok) return;
  acting.value = true;
  try {
    await notesApi.remove(props.id);
    toast.success('Evolução excluída.', { detail: 'O registro permanece auditável no histórico.' });
    await load();
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
/* ── KPIs ──────────────────────────────────────────────────────────────── */
.end-metrics {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
  gap: var(--ui-space-4);
}

/* ── NoteHeader banner ─────────────────────────────────────────────────── */
.end-note-header {
  display: flex;
  align-items: flex-start;
  gap: var(--ui-space-4);
  background: rgb(var(--ui-surface));
  border: 1px solid rgb(var(--ui-border));
  border-left: 4px solid rgb(var(--ui-accent));
  border-radius: var(--ui-radius-lg);
  padding: var(--ui-space-5);
  box-shadow: var(--ui-shadow-sm);
  flex-wrap: wrap;
}

.end-type-icon {
  flex-shrink: 0;
  width: 52px;
  height: 52px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--ui-radius-md);
  background: rgb(var(--ui-accent) / 0.12);
  border: 1px solid rgb(var(--ui-accent) / 0.25);
}
.end-type-icon[data-type="resultado_teste"],
.end-type-icon[data-type="test_result"] {
  background: rgb(var(--ui-ok) / 0.12);
  border-color: rgb(var(--ui-ok) / 0.25);
}
.end-type-icon[data-type="plano_intervencao"],
.end-type-icon[data-type="intervention_plan"] {
  background: rgb(var(--ui-warn) / 0.12);
  border-color: rgb(var(--ui-warn) / 0.25);
}
.end-type-icon[data-type="anamnese"] {
  background: rgb(var(--ui-accent) / 0.18);
}

.end-type-glyph {
  font-size: 1.5rem;
  font-weight: 700;
  color: rgb(var(--ui-accent-strong));
  line-height: 1;
  font-family: var(--ui-font-display, sans-serif);
}

.end-note-header-main {
  flex: 1 1 280px;
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-3);
  min-width: 0;
}
.end-note-header-top {
  display: flex;
  align-items: center;
  gap: var(--ui-space-2);
  flex-wrap: wrap;
}
.end-note-date {
  color: rgb(var(--ui-muted));
  font-size: var(--ui-text-sm);
  font-variant-numeric: tabular-nums;
  margin-left: auto;
}
.end-note-header-links {
  display: flex;
  gap: var(--ui-space-4);
  flex-wrap: wrap;
  align-items: center;
}
.end-chip-link {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.end-chip-label {
  font-size: var(--ui-text-xs);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  font-weight: 700;
  color: rgb(var(--ui-muted));
}
.end-chip-value {
  font-size: var(--ui-text-sm);
  color: rgb(var(--ui-muted));
}
.end-chip-mono {
  font-family: var(--ui-font-mono, monospace);
  font-size: var(--ui-text-sm);
  color: rgb(var(--ui-fg));
}
.end-note-header-actions {
  flex-shrink: 0;
  align-self: flex-start;
}

/* ── Grade principal ───────────────────────────────────────────────────── */
.end-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.5fr) minmax(0, 1fr);
  gap: var(--ui-space-4);
  align-items: start;
}
.end-col-main,
.end-col-side {
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-4);
}

/* ── ContentRenderer ───────────────────────────────────────────────────── */
.end-content-renderer {
  background: rgb(var(--ui-surface-2));
  border: 1px solid rgb(var(--ui-border));
  border-radius: var(--ui-radius-md);
  padding: var(--ui-space-5);
}
.end-content-renderer-sm {
  padding: var(--ui-space-4);
}
.end-note-text {
  margin: 0;
  font-size: var(--ui-text-md);
  line-height: 1.75;
  color: rgb(var(--ui-fg));
  white-space: pre-wrap;
  word-break: break-word;
  font-family: var(--ui-font-body, serif);
}

/* ── StructuredFieldsViewer ────────────────────────────────────────────── */
.end-structured-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: var(--ui-space-3);
  margin: 0;
}
.end-field-card {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: var(--ui-space-3) var(--ui-space-4);
  background: rgb(var(--ui-surface-2));
  border: 1px solid rgb(var(--ui-border));
  border-radius: var(--ui-radius-md);
  min-width: 0;
}
.end-field-key {
  color: rgb(var(--ui-muted));
  font-size: var(--ui-text-xs);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  font-weight: 700;
}
.end-field-val {
  margin: 0;
  font-size: var(--ui-text-sm);
  color: rgb(var(--ui-fg));
  word-break: break-word;
  white-space: pre-wrap;
}
.end-field-val[data-empty="true"] {
  color: rgb(var(--ui-muted));
  font-style: italic;
}

/* ── KV genérico ───────────────────────────────────────────────────────── */
.end-kv {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--ui-space-4);
  margin: 0;
}
.end-kv-2 {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}
.end-kv > div {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}
.end-kv dt {
  color: rgb(var(--ui-muted));
  font-size: var(--ui-text-xs);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  font-weight: 600;
}
.end-kv dd {
  margin: 0;
  font-size: var(--ui-text-md);
  word-break: break-word;
}

/* ── Link interno ──────────────────────────────────────────────────────── */
.end-link {
  color: rgb(var(--ui-accent-strong));
  text-decoration: none;
  font-weight: 600;
  font-size: var(--ui-text-md);
}
.end-link:hover {
  text-decoration: underline;
}
.end-link:focus-visible {
  outline: 2px solid rgb(var(--ui-accent));
  outline-offset: 2px;
  border-radius: 2px;
}

/* ── Footer de card ────────────────────────────────────────────────────── */
.end-foot-actions {
  display: flex;
  align-items: center;
  gap: var(--ui-space-2);
  flex-wrap: wrap;
}
.end-foot-id {
  color: rgb(var(--ui-muted));
  font-size: var(--ui-text-xs);
  flex: 1 1 auto;
}
.end-mono {
  font-family: var(--ui-font-mono, monospace);
  font-size: var(--ui-text-xs);
}

/* ── AuditStamp: versões compactas ─────────────────────────────────────── */
.end-audit-versions {
  margin-top: var(--ui-space-4);
  padding-top: var(--ui-space-4);
  border-top: 1px solid rgb(var(--ui-border));
}
.end-audit-versions-title {
  margin: 0 0 var(--ui-space-3);
  font-size: var(--ui-text-xs);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: rgb(var(--ui-muted));
  font-weight: 700;
}
.end-btn-inline {
  background: none;
  border: none;
  font: inherit;
  font-size: var(--ui-text-xs);
  color: rgb(var(--ui-accent-strong));
  cursor: pointer;
  text-decoration: underline;
  padding: 0;
}
.end-btn-inline:hover {
  color: rgb(var(--ui-accent));
}
.end-btn-inline:focus-visible {
  outline: 2px solid rgb(var(--ui-accent));
  outline-offset: 2px;
  border-radius: 2px;
}
.end-version-timeline {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-2);
}
.end-version-item {
  display: flex;
  align-items: flex-start;
  gap: var(--ui-space-2);
}
.end-version-dot {
  flex-shrink: 0;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: rgb(var(--ui-accent) / 0.6);
  margin-top: 5px;
}
.end-version-body {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--ui-space-2);
  min-width: 0;
}
.end-version-badge {
  font-size: var(--ui-text-xs);
  font-weight: 700;
  color: rgb(var(--ui-accent-strong));
  background: rgb(var(--ui-accent) / 0.12);
  border-radius: var(--ui-radius-pill);
  padding: 1px 8px;
}
.end-version-who {
  font-size: var(--ui-text-xs);
  color: rgb(var(--ui-fg));
  font-weight: 500;
}
.end-version-when {
  font-size: var(--ui-text-xs);
  color: rgb(var(--ui-muted));
  font-variant-numeric: tabular-nums;
}
.end-audit-clean {
  margin-top: var(--ui-space-3);
  padding-top: var(--ui-space-3);
  border-top: 1px solid rgb(var(--ui-border));
}
.end-audit-clean-text {
  font-size: var(--ui-text-xs);
  color: rgb(var(--ui-muted));
}

/* ── AttachmentList: cards visuais ─────────────────────────────────────── */
.end-attachment-list {
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-3);
}
.end-attachment-item {
  display: flex;
  align-items: flex-start;
  gap: var(--ui-space-3);
  padding: var(--ui-space-3) var(--ui-space-4);
  background: rgb(var(--ui-surface-2));
  border: 1px solid rgb(var(--ui-border));
  border-radius: var(--ui-radius-md);
  transition: border-color 0.15s ease;
}
.end-attachment-item:hover {
  border-color: rgb(var(--ui-border-strong));
}
.end-att-icon {
  flex-shrink: 0;
  width: 40px;
  height: 40px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--ui-radius-md);
  background: rgb(var(--ui-accent) / 0.1);
  font-weight: 700;
  font-size: 0.9rem;
  color: rgb(var(--ui-accent-strong));
  font-family: var(--ui-font-mono, monospace);
}
.end-att-icon[data-mime="pdf"] {
  background: rgb(var(--ui-danger) / 0.1);
  color: rgb(var(--ui-danger));
}
.end-att-icon[data-mime="image"] {
  background: rgb(var(--ui-ok) / 0.1);
  color: rgb(var(--ui-ok));
}
.end-att-icon[data-mime="doc"] {
  background: rgb(var(--ui-accent) / 0.12);
  color: rgb(var(--ui-accent-strong));
}
.end-att-meta {
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-1);
}
.end-att-name {
  margin: 0;
  font-weight: 600;
  font-size: var(--ui-text-sm);
  color: rgb(var(--ui-fg));
  word-break: break-all;
}
.end-att-info {
  margin: 0;
  display: flex;
  align-items: center;
  gap: var(--ui-space-2);
  flex-wrap: wrap;
}
.end-att-tag {
  font-size: var(--ui-text-xs);
  color: rgb(var(--ui-muted));
  background: rgb(var(--ui-surface));
  border: 1px solid rgb(var(--ui-border));
  border-radius: var(--ui-radius-pill);
  padding: 1px 8px;
}
.end-att-size {
  font-size: var(--ui-text-xs);
  color: rgb(var(--ui-muted));
  font-variant-numeric: tabular-nums;
}
.end-att-date {
  font-size: var(--ui-text-xs);
  color: rgb(var(--ui-muted));
  font-variant-numeric: tabular-nums;
}
.end-att-actions {
  flex-shrink: 0;
  align-self: center;
}
.end-att-no-url {
  font-size: var(--ui-text-xs);
  color: rgb(var(--ui-muted));
}
.end-attachment-table {
  margin-top: var(--ui-space-4);
  padding-top: var(--ui-space-4);
  border-top: 1px solid rgb(var(--ui-border));
}

/* ── Versões: summary inline ───────────────────────────────────────────── */
.end-version-summary {
  font-size: var(--ui-text-sm);
  color: rgb(var(--ui-muted));
}

/* ── Banner de status ──────────────────────────────────────────────────── */
.end-banner {
  display: flex;
  align-items: flex-start;
  gap: var(--ui-space-3);
  padding: var(--ui-space-3) var(--ui-space-4);
  border-radius: var(--ui-radius-md);
  font-size: var(--ui-text-sm);
  color: rgb(var(--ui-fg));
  border: 1px solid rgb(var(--ui-border));
}
.end-banner-danger {
  border-color: rgb(var(--ui-danger) / 0.4);
  background: rgb(var(--ui-danger) / 0.07);
}
.end-banner-icon {
  flex-shrink: 0;
  margin-top: 3px;
}
.end-banner-dot {
  display: block;
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: rgb(var(--ui-danger));
}
.end-banner-content {
  flex: 1 1 auto;
  line-height: 1.5;
}

/* ── Snapshot (modal) ──────────────────────────────────────────────────── */
.end-snapshot {
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-5);
}
.end-snapshot-stamp {
  padding-bottom: var(--ui-space-4);
  border-bottom: 1px solid rgb(var(--ui-border));
}
.end-snapshot-section {
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-3);
}
.end-snapshot-title {
  margin: 0;
  font-size: var(--ui-text-xs);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  font-weight: 700;
  color: rgb(var(--ui-muted));
}

/* ── Responsivo ────────────────────────────────────────────────────────── */
@media (max-width: 860px) {
  .end-grid {
    grid-template-columns: minmax(0, 1fr);
  }
  .end-kv,
  .end-kv-2 {
    grid-template-columns: minmax(0, 1fr);
  }
  .end-metrics {
    grid-template-columns: repeat(2, 1fr);
  }
  .end-note-header {
    gap: var(--ui-space-3);
  }
  .end-note-date {
    margin-left: 0;
  }
  .end-note-header-actions {
    width: 100%;
  }
}

@media (max-width: 520px) {
  .end-metrics {
    grid-template-columns: 1fr;
  }
  .end-structured-grid {
    grid-template-columns: 1fr;
  }
  .end-type-icon {
    width: 40px;
    height: 40px;
  }
}
</style>
