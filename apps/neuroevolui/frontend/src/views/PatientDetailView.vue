<!--
  PatientDetailView — Ficha completa do paciente (REQ-NEUROEVOLUI-0004 / 0005 / 0006).
  Abas: Dados cadastrais · Linha do tempo de evoluções · Agendamentos · Relatórios · Anexos.
  Ações: editar, agendar consulta, nova evolução, gerar relatório, abrir assistente com contexto.

  Só endpoints REAIS (via ../api.js → resourceFactory):
    GET  /v1/patients/:id                              (ficha)
    GET  /v1/patients/:id/evolution-notes             (linha do tempo + anexos)
    POST /v1/patients/:id/evolution-notes             (nova evolução)
    GET  /v1/patients/:id/reports                      (relatórios)
    POST /v1/patients/:id/reports                      (gerar relatório — async 202)
    GET  /v1/consultations                             (agendamentos — filtra por paciente)
    POST /v1/consultations/schedule                    (agendar consulta)
    GET  /v1/professionals                             (seletor de profissional do agendamento)

  Kit-only (../ui/index.js) + tokens --ui-* + CSP-safe (sem style inline / v-html).
  Todos os estados: loading (skeleton) · empty (CTA) · error (retry) · normal.
-->
<template>
  <UiPageLayout
    eyebrow="NeuroEvolui · Paciente"
    :title="pageTitle"
    :subtitle="pageSubtitle"
    width="wide"
    :loading="loading"
    :error="error"
    @retry="loadPatient"
  >
    <template #actions>
      <UiButton variant="ghost" to="/patients">Voltar</UiButton>
      <UiButton variant="subtle" :to="'/patients/' + id + '/edit'">Editar</UiButton>
      <UiButton variant="ghost" @click="openAssistant">Abrir assistente</UiButton>
      <UiButton @click="scheduleOpen = true">Agendar consulta</UiButton>
    </template>

    <template v-if="patient" #banner>
      <div class="pd-banner">
        <span class="pd-avatar" aria-hidden="true">{{ initials }}</span>
        <div class="pd-banner-main">
          <div class="pd-banner-top">
            <h2 class="pd-banner-name">{{ patient.full_name }}</h2>
            <UiStatusBadge :status="patient.status" size="lg" />
          </div>
          <p class="pd-banner-meta">
            <span v-if="ageLabel">{{ ageLabel }}</span>
            <span v-if="patient.document">Doc. {{ patient.document }}</span>
            <span v-if="patient.assigned_professional_id">Profissional: {{ professionalName(patient.assigned_professional_id) }}</span>
            <span>Cadastrado em {{ fmt.formatDate(patient.created_at) }}</span>
          </p>
        </div>
        <div class="pd-banner-contacts">
          <a v-if="patient.phone" class="pd-contact" :href="'tel:' + patient.phone">
            <span class="pd-contact-ic" aria-hidden="true">☎</span>{{ patient.phone }}
          </a>
          <a v-if="patient.email" class="pd-contact" :href="'mailto:' + patient.email">
            <span class="pd-contact-ic" aria-hidden="true">✉</span>{{ patient.email }}
          </a>
        </div>
      </div>
    </template>

    <!-- Métricas / atalhos rápidos -->
    <div class="pd-metrics">
      <UiMetricCard label="Evoluções" :value="notes.length" tone="primary" hint="notas registradas" />
      <UiMetricCard label="Consultas" :value="consultationRows.length" tone="neutral" hint="agendamentos" />
      <UiMetricCard label="Relatórios" :value="reports.length" tone="neutral" hint="gerados" />
      <UiMetricCard label="Última evolução" :value="lastNoteLabel" tone="success" hint="data" />
    </div>

    <!-- Abas -->
    <div class="pd-tabs" role="tablist" aria-label="Seções do paciente">
      <button
        v-for="t in tabs"
        :key="t.key"
        class="pd-tab"
        type="button"
        role="tab"
        :data-active="activeTab === t.key ? 'true' : null"
        :aria-selected="activeTab === t.key ? 'true' : 'false'"
        :tabindex="activeTab === t.key ? 0 : -1"
        @click="activeTab = t.key"
        @keydown="onTabKey($event, t.key)"
      >
        <span class="pd-tab-ic" aria-hidden="true">{{ t.icon }}</span>{{ t.label }}
        <span v-if="t.count !== null" class="pd-tab-count">{{ t.count }}</span>
      </button>
    </div>

    <!-- ── Dados cadastrais ─────────────────────────────────────────────── -->
    <section v-show="activeTab === 'profile'" class="pd-pane" role="tabpanel" aria-label="Dados cadastrais">
      <UiCard title="Dados cadastrais" subtitle="Informações do prontuário.">
        <template #actions>
          <UiButton variant="ghost" size="sm" :to="'/patients/' + id + '/edit'">Editar</UiButton>
        </template>
        <dl class="pd-kv">
          <div class="pd-kv-row"><dt>Nome completo</dt><dd>{{ fmt.formatValue(patient && patient.full_name) }}</dd></div>
          <div class="pd-kv-row"><dt>Situação</dt><dd><UiStatusBadge :status="patient && patient.status" /></dd></div>
          <div class="pd-kv-row"><dt>Data de nascimento</dt><dd>{{ fmt.formatDate(patient && patient.birth_date) }}</dd></div>
          <div class="pd-kv-row"><dt>Idade</dt><dd>{{ ageLabel || '—' }}</dd></div>
          <div class="pd-kv-row"><dt>Documento (CPF)</dt><dd>{{ fmt.formatValue(patient && patient.document) }}</dd></div>
          <div class="pd-kv-row"><dt>E-mail</dt><dd>{{ fmt.formatValue(patient && patient.email) }}</dd></div>
          <div class="pd-kv-row"><dt>Telefone / WhatsApp</dt><dd>{{ fmt.formatValue(patient && patient.phone) }}</dd></div>
          <div class="pd-kv-row"><dt>Responsável</dt><dd>{{ fmt.formatValue(patient && patient.guardian_name) }}</dd></div>
          <div class="pd-kv-row"><dt>Profissional responsável</dt><dd>{{ fmt.formatValue(patient && patient.assigned_professional_id) }}</dd></div>
          <div class="pd-kv-row"><dt>Cadastrado em</dt><dd>{{ fmt.formatDateTime(patient && patient.created_at) }}</dd></div>
        </dl>
        <template v-if="patient && patient.notes">
          <h4 class="pd-notes-title">Observações gerais</h4>
          <p class="pd-notes-body">{{ patient.notes }}</p>
        </template>
      </UiCard>
    </section>

    <!-- ── Linha do tempo de evoluções ──────────────────────────────────── -->
    <section v-show="activeTab === 'timeline'" class="pd-pane" role="tabpanel" aria-label="Linha do tempo de evoluções">
      <UiCard title="Linha do tempo de evoluções" subtitle="Histórico clínico do paciente.">
        <template #actions>
          <UiButton variant="ghost" size="sm" :loading="notesLoading" @click="loadNotes">Atualizar</UiButton>
          <UiButton size="sm" @click="openNewNote">Nova evolução</UiButton>
        </template>

        <UiLoadingState v-if="notesLoading" variant="skeleton" :skeleton-lines="4" />
        <UiErrorState v-else-if="notesError" :message="notesError" @retry="loadNotes" />
        <UiEmptyState
          v-else-if="!notes.length"
          icon="clock"
          title="Sem evoluções ainda"
          description="Registre a primeira nota de evolução deste paciente."
        >
          <template #action><UiButton @click="openNewNote">Nova evolução</UiButton></template>
        </UiEmptyState>

        <ol v-else class="pd-timeline">
          <li v-for="n in sortedNotes" :key="n.id" class="pd-tl-item">
            <span class="pd-tl-dot" aria-hidden="true" />
            <div class="pd-tl-card">
              <div class="pd-tl-head">
                <UiStatusBadge :status="n.type" :label="noteTypeLabel(n.type)" tone="running" size="sm" />
                <time class="pd-tl-date">{{ fmt.formatDateTime(n.note_date || n.created_at) }}</time>
              </div>
              <p class="pd-tl-text">{{ n.text || 'Nota sem descrição textual.' }}</p>
              <p class="pd-tl-foot">
                <span v-if="n.professional_id">Por {{ professionalName(n.professional_id) }}</span>
                <span v-if="attachmentCount(n)">{{ attachmentCount(n) }} anexo(s)</span>
              </p>
            </div>
          </li>
        </ol>
      </UiCard>
    </section>

    <!-- ── Agendamentos ─────────────────────────────────────────────────── -->
    <section v-show="activeTab === 'schedule'" class="pd-pane" role="tabpanel" aria-label="Agendamentos">
      <UiCard title="Agendamentos" subtitle="Consultas marcadas para este paciente.">
        <template #actions>
          <UiButton variant="ghost" size="sm" :loading="consultLoading" @click="loadConsultations">Atualizar</UiButton>
          <UiButton size="sm" @click="scheduleOpen = true">Agendar consulta</UiButton>
        </template>
        <UiDataTable
          :columns="consultColumns"
          :rows="consultationRows"
          :loading="consultLoading"
          :error="consultError"
          row-key="id"
          density="compact"
          :empty="{ title: 'Nenhuma consulta', description: 'Agende a primeira consulta deste paciente.' }"
          @retry="loadConsultations"
        >
          <template #cell-scheduled_at="{ value }">{{ fmt.formatDateTime(value) }}</template>
          <template #cell-professional_id="{ row, value }">{{ row.professional_name || professionalName(value) }}</template>
          <template #cell-amount_cents="{ value }">{{ fmt.formatCurrency((Number(value) || 0) / 100) }}</template>
          <template #cell-status="{ value }"><UiStatusBadge :status="value" size="sm" /></template>
          <template #cell-payment_status="{ value }"><UiStatusBadge :status="value || 'pending'" size="sm" /></template>
          <template #empty-action><UiButton size="sm" @click="scheduleOpen = true">Agendar consulta</UiButton></template>
        </UiDataTable>
      </UiCard>
    </section>

    <!-- ── Relatórios ───────────────────────────────────────────────────── -->
    <section v-show="activeTab === 'reports'" class="pd-pane" role="tabpanel" aria-label="Relatórios">
      <UiCard title="Relatórios" subtitle="Relatórios de evolução gerados (processamento assíncrono).">
        <template #actions>
          <UiButton variant="ghost" size="sm" :loading="reportsLoading" @click="loadReports">Atualizar</UiButton>
          <UiButton size="sm" :loading="generating" @click="openReport">Gerar relatório</UiButton>
        </template>
        <UiDataTable
          :columns="reportColumns"
          :rows="reports"
          :loading="reportsLoading"
          :error="reportsError"
          row-key="id"
          density="compact"
          :empty="{ title: 'Nenhum relatório', description: 'Gere um relatório consolidando as evoluções do paciente.' }"
          @retry="loadReports"
        >
          <template #cell-status="{ value }"><UiStatusBadge :status="value" size="sm" /></template>
          <template #cell-created_at="{ value }">{{ fmt.formatDateTime(value) }}</template>
          <template #cell-completed_at="{ value }">{{ value ? fmt.formatDateTime(value) : '—' }}</template>
          <template #cell-error_message="{ value }">{{ value || '—' }}</template>
          <template #empty-action><UiButton size="sm" :loading="generating" @click="openReport">Gerar relatório</UiButton></template>
        </UiDataTable>
      </UiCard>
    </section>

    <!-- ── Anexos ───────────────────────────────────────────────────────── -->
    <section v-show="activeTab === 'attachments'" class="pd-pane" role="tabpanel" aria-label="Anexos">
      <UiCard title="Anexos" subtitle="Arquivos anexados às evoluções do paciente.">
        <template #actions>
          <UiButton variant="ghost" size="sm" :loading="notesLoading" @click="loadNotes">Atualizar</UiButton>
        </template>
        <UiLoadingState v-if="notesLoading" variant="skeleton" :skeleton-lines="3" />
        <UiErrorState v-else-if="notesError" :message="notesError" @retry="loadNotes" />
        <UiEmptyState
          v-else-if="!attachments.length"
          icon="doc"
          title="Sem anexos"
          description="Os arquivos anexados às evoluções aparecem aqui."
        >
          <template #action><UiButton @click="openNewNote">Nova evolução</UiButton></template>
        </UiEmptyState>
        <UiDataTable
          v-else
          :columns="attachmentColumns"
          :rows="attachments"
          row-key="key"
          density="compact"
        >
          <template #cell-note_date="{ value }">{{ fmt.formatDateTime(value) }}</template>
          <template #cell-size_bytes="{ value }">{{ formatBytes(value) }}</template>
        </UiDataTable>
      </UiCard>
    </section>

    <!-- ── Modal: Nova evolução ─────────────────────────────────────────── -->
    <UiModal v-model:open="noteOpen" title="Nova evolução" width="md">
      <form class="pd-form" @submit.prevent="submitNote">
        <UiFormSection title="Registro da evolução" :columns="1">
          <UiFormField label="Tipo de evolução" :error="noteForm.errors.type">
            <template #default="{ id: fid, describedBy }">
              <select :id="fid" :aria-describedby="describedBy" :value="noteForm.values.type" @change="noteForm.setField('type', $event.target.value)">
                <option value="session">Sessão</option>
                <option value="assessment">Avaliação</option>
                <option value="follow_up">Acompanhamento</option>
                <option value="discharge_note">Nota de alta</option>
              </select>
            </template>
          </UiFormField>
          <UiFormField label="Descrição da evolução" :required="true" :error="noteForm.errors.text" hint="Descreva a sessão, observações e conduta.">
            <template #default="{ id: fid, describedBy }">
              <textarea :id="fid" :aria-describedby="describedBy" rows="6" :value="noteForm.values.text" placeholder="Ex.: Paciente apresentou evolução positiva na coordenação motora fina…" @input="noteForm.setField('text', $event.target.value)"></textarea>
            </template>
          </UiFormField>
        </UiFormSection>
      </form>
      <template #footer>
        <UiButton variant="ghost" @click="noteOpen = false">Cancelar</UiButton>
        <UiButton :loading="noteForm.submitting.value" @click="submitNote">Salvar evolução</UiButton>
      </template>
    </UiModal>

    <!-- ── Modal: Agendar consulta ──────────────────────────────────────── -->
    <UiModal v-model:open="scheduleOpen" title="Agendar consulta" width="md">
      <UiErrorState v-if="profError" :message="profError" @retry="loadProfessionals" />
      <form v-else class="pd-form" @submit.prevent="submitSchedule">
        <UiFormSection title="Detalhes da consulta" :columns="2">
          <UiFormField label="Profissional" :required="true" :error="schedForm.errors.professional_id" full-width>
            <template #default="{ id: fid, describedBy }">
              <select :id="fid" :aria-describedby="describedBy" :disabled="profLoading" :value="schedForm.values.professional_id" @change="schedForm.setField('professional_id', $event.target.value)">
                <option value="">{{ profLoading ? 'Carregando…' : 'Selecione um profissional' }}</option>
                <option v-for="p in professionalRows" :key="p.id" :value="p.id">{{ p.full_name }}<template v-if="p.specialty"> — {{ p.specialty }}</template></option>
              </select>
            </template>
          </UiFormField>
          <UiFormField label="Data e hora" :required="true" :error="schedForm.errors.scheduled_at">
            <template #default="{ id: fid, describedBy }">
              <input type="datetime-local" :id="fid" :aria-describedby="describedBy" :value="schedForm.values.scheduled_at" @input="schedForm.setField('scheduled_at', $event.target.value)" />
            </template>
          </UiFormField>
          <UiFormField label="Duração (minutos)" :error="schedForm.errors.duration_minutes">
            <template #default="{ id: fid, describedBy }">
              <input type="number" min="15" step="5" :id="fid" :aria-describedby="describedBy" :value="schedForm.values.duration_minutes" @input="schedForm.setField('duration_minutes', $event.target.value)" />
            </template>
          </UiFormField>
          <UiFormField label="Valor (R$)" :required="true" :error="schedForm.errors.amount" hint="Valor da consulta em reais." full-width>
            <template #default="{ id: fid, describedBy }">
              <input type="number" min="0" step="0.01" :id="fid" :aria-describedby="describedBy" :value="schedForm.values.amount" placeholder="Ex.: 250.00" @input="schedForm.setField('amount', $event.target.value)" />
            </template>
          </UiFormField>
        </UiFormSection>
      </form>
      <template #footer>
        <UiButton variant="ghost" @click="scheduleOpen = false">Cancelar</UiButton>
        <UiButton :loading="schedForm.submitting.value" :disabled="profLoading || !!profError" @click="submitSchedule">Agendar</UiButton>
      </template>
    </UiModal>

    <!-- ── Modal: Gerar relatório ───────────────────────────────────────── -->
    <UiModal v-model:open="reportOpen" title="Gerar relatório" width="md">
      <form class="pd-form" @submit.prevent="submitReport">
        <UiFormSection title="Parâmetros do relatório" description="Defina o tipo e, se quiser, o período das evoluções a consolidar. Vazio = todas as evoluções." :columns="2">
          <UiFormField label="Tipo de relatório" :error="reportForm.errors.type" full-width>
            <template #default="{ id: fid, describedBy }">
              <select :id="fid" :aria-describedby="describedBy" :value="reportForm.values.type" @change="reportForm.setField('type', $event.target.value)">
                <option value="evolucao">Evolução clínica</option>
                <option value="resumo">Resumo do período</option>
                <option value="alta">Relatório de alta</option>
                <option value="encaminhamento">Encaminhamento</option>
              </select>
            </template>
          </UiFormField>
          <UiFormField label="Período — de" :error="reportForm.errors.date_from" hint="Opcional.">
            <template #default="{ id: fid, describedBy }">
              <input type="date" :id="fid" :aria-describedby="describedBy" :value="reportForm.values.date_from" @input="reportForm.setField('date_from', $event.target.value)" />
            </template>
          </UiFormField>
          <UiFormField label="Período — até" :error="reportForm.errors.date_to" hint="Opcional.">
            <template #default="{ id: fid, describedBy }">
              <input type="date" :id="fid" :aria-describedby="describedBy" :value="reportForm.values.date_to" @input="reportForm.setField('date_to', $event.target.value)" />
            </template>
          </UiFormField>
        </UiFormSection>
      </form>
      <template #footer>
        <UiButton variant="ghost" @click="reportOpen = false">Cancelar</UiButton>
        <UiButton :loading="generating" @click="submitReport">Gerar relatório</UiButton>
      </template>
    </UiModal>
  </UiPageLayout>
</template>

<script setup>
import { ref, computed, reactive, watch, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import {
  UiPageLayout, UiCard, UiMetricCard, UiStatusBadge, UiDataTable, UiButton,
  UiEmptyState, UiLoadingState, UiErrorState, UiModal, UiFormSection, UiFormField,
  useForm, useToast, validators, format as fmt,
} from '../ui/index.js';
import { patients, professionals, consultations, resourceFactory } from '../api.js';

const props = defineProps({ id: { type: String, required: true } });
const router = useRouter();
const toast = useToast();

// ── Clientes de recurso (só endpoints REAIS) ──────────────────────────────────
//   Entidades centrais → exports nomeados do integrador (patients/professionals/consultations).
//   Coleções aninhadas do paciente (sem export próprio) → resourceFactory monta /v1/<name>.
const patientsApi = patients;
const professionalsApi = professionals;
const consultationsApi = consultations;
const notesApi = computed(() => resourceFactory('patients/' + props.id + '/evolution-notes'));
const reportsApi = computed(() => resourceFactory('patients/' + props.id + '/reports'));
// POST /v1/consultations/schedule — método dedicado do integrador (valida conflito no backend).
function scheduleConsultation(payload) {
  return consultationsApi.schedule(payload);
}

// ── Estado: ficha ──────────────────────────────────────────────────────────────
const loading = ref(true);
const error = ref(null);
const patient = ref(null);

// ── Estado: coleções ────────────────────────────────────────────────────────────
const notes = ref([]);
const notesLoading = ref(false);
const notesError = ref(null);

const consultationRows = ref([]);
const consultLoading = ref(false);
const consultError = ref(null);

const reports = ref([]);
const reportsLoading = ref(false);
const reportsError = ref(null);
const generating = ref(false);

const professionalRows = ref([]);
const profLoading = ref(false);
const profError = ref(null);

// ── Abas ──────────────────────────────────────────────────────────────────────
const activeTab = ref('profile');
const tabs = computed(() => [
  { key: 'profile', label: 'Dados cadastrais', icon: '🪪', count: null },
  { key: 'timeline', label: 'Evoluções', icon: '🕓', count: notes.value.length },
  { key: 'schedule', label: 'Agendamentos', icon: '📅', count: consultationRows.value.length },
  { key: 'reports', label: 'Relatórios', icon: '📄', count: reports.value.length },
  { key: 'attachments', label: 'Anexos', icon: '📎', count: attachments.value.length },
]);
function onTabKey(e, key) {
  const order = tabs.value.map((t) => t.key);
  const i = order.indexOf(key);
  if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
    e.preventDefault();
    const next = e.key === 'ArrowRight' ? (i + 1) % order.length : (i - 1 + order.length) % order.length;
    activeTab.value = order[next];
    focusTab(next);
  }
}
function focusTab(index) {
  if (typeof document === 'undefined') return;
  requestAnimationFrame(() => {
    const els = document.querySelectorAll('.pd-tab');
    const el = els && els[index];
    if (el && el.focus) el.focus();
  });
}

// ── Derivados ───────────────────────────────────────────────────────────────────
const pageTitle = computed(() => (patient.value ? patient.value.full_name : 'Paciente #' + props.id));
const pageSubtitle = computed(() => 'Ficha completa, evoluções, agendamentos e relatórios.');
const initials = computed(() => {
  const name = (patient.value && patient.value.full_name) || '';
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
});
const ageLabel = computed(() => {
  const bd = patient.value && patient.value.birth_date;
  if (!bd) return '';
  const d = new Date(bd);
  if (isNaN(d.getTime())) return '';
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--;
  return age >= 0 ? age + ' anos' : '';
});
const sortedNotes = computed(() =>
  [...notes.value].sort((a, b) => new Date(b.note_date || b.created_at || 0) - new Date(a.note_date || a.created_at || 0))
);

// id → nome do profissional (banner, rodapé da timeline, coluna da tabela). Mapa derivado da
// lista já carregada; fallback para o próprio id quando ainda não resolvido.
const professionalById = computed(() => {
  const m = {};
  for (const p of professionalRows.value) m[String(p.id)] = p.full_name || p.name;
  return m;
});
function professionalName(id) {
  if (id === null || id === undefined || id === '') return '—';
  return professionalById.value[String(id)] || String(id);
}
const lastNoteLabel = computed(() => {
  const first = sortedNotes.value[0];
  return first ? fmt.formatDate(first.note_date || first.created_at) : '—';
});

// Anexos: derivados das evoluções (structured_fields.attachments ou .attachments).
const attachments = computed(() => {
  const out = [];
  for (const n of notes.value) {
    const list = noteAttachments(n);
    list.forEach((a, idx) => {
      out.push({
        key: n.id + '-' + idx,
        filename: a.filename || a.name || a.path || 'arquivo',
        mime_type: a.mime_type || a.mime || a.type || '—',
        size_bytes: a.size_bytes || a.size || 0,
        note_id: n.id,
        note_date: n.note_date || n.created_at,
      });
    });
  }
  return out;
});
function noteAttachments(n) {
  if (!n) return [];
  if (Array.isArray(n.attachments)) return n.attachments;
  const sf = n.structured_fields;
  if (sf && Array.isArray(sf.attachments)) return sf.attachments;
  return [];
}
function attachmentCount(n) { return noteAttachments(n).length; }

function noteTypeLabel(t) {
  return ({ session: 'Sessão', assessment: 'Avaliação', follow_up: 'Acompanhamento', discharge_note: 'Nota de alta' }[t]) || fmt.humanize(t || 'session');
}
function formatBytes(n) {
  const v = Number(n) || 0;
  if (v < 1024) return v + ' B';
  if (v < 1048576) return (v / 1024).toFixed(0) + ' KB';
  return (v / 1048576).toFixed(1) + ' MB';
}

// ── Colunas das tabelas ──────────────────────────────────────────────────────────
const consultColumns = [
  { key: 'scheduled_at', label: 'Data e hora', sortable: true },
  { key: 'professional_id', label: 'Profissional' },
  { key: 'status', label: 'Situação' },
  { key: 'payment_status', label: 'Pagamento' },
  { key: 'amount_cents', label: 'Valor', align: 'right' },
];
const reportColumns = [
  { key: 'id', label: 'ID', sortable: true },
  { key: 'status', label: 'Situação' },
  { key: 'created_at', label: 'Solicitado em', sortable: true },
  { key: 'completed_at', label: 'Concluído em' },
  { key: 'error_message', label: 'Observação' },
];
const attachmentColumns = [
  { key: 'filename', label: 'Arquivo' },
  { key: 'mime_type', label: 'Tipo' },
  { key: 'size_bytes', label: 'Tamanho', align: 'right' },
  { key: 'note_date', label: 'Evolução de' },
];

// ── Carregamento ─────────────────────────────────────────────────────────────────
async function loadPatient() {
  loading.value = true; error.value = null;
  try {
    patient.value = await patientsApi.get(props.id);
  } catch (e) {
    error.value = e && e.status === 404 ? 'Paciente não encontrado.' : (e.message || 'Falha ao carregar o paciente.');
  } finally {
    loading.value = false;
  }
}

async function loadNotes() {
  notesLoading.value = true; notesError.value = null;
  try {
    const r = await notesApi.value.list();
    notes.value = (r && r.data) || [];
  } catch (e) {
    notesError.value = e.message || 'Falha ao carregar as evoluções.';
  } finally {
    notesLoading.value = false;
  }
}

async function loadConsultations() {
  consultLoading.value = true; consultError.value = null;
  try {
    const r = await consultationsApi.list();
    const all = (r && r.data) || [];
    consultationRows.value = all.filter((c) => String(c.patient_id) === String(props.id));
  } catch (e) {
    consultError.value = e.message || 'Falha ao carregar os agendamentos.';
  } finally {
    consultLoading.value = false;
  }
}

async function loadReports() {
  reportsLoading.value = true; reportsError.value = null;
  try {
    const r = await reportsApi.value.list();
    reports.value = (r && r.data) || [];
  } catch (e) {
    reportsError.value = e.message || 'Falha ao carregar os relatórios.';
  } finally {
    reportsLoading.value = false;
  }
}

async function loadProfessionals() {
  if (professionalRows.value.length) return;
  profLoading.value = true; profError.value = null;
  try {
    const r = await professionalsApi.list({ pageSize: 200 });
    professionalRows.value = (r && r.data) || [];
  } catch (e) {
    profError.value = e.message || 'Falha ao carregar os profissionais.';
  } finally {
    profLoading.value = false;
  }
}

// ── Ação: nova evolução ──────────────────────────────────────────────────────────
const noteOpen = ref(false);
const noteForm = useForm({
  initial: { type: 'session', text: '' },
  rules: { text: [validators.required('Descreva a evolução.'), validators.minLen(3)] },
});
function openNewNote() { noteForm.reset(); noteOpen.value = true; }
function submitNote() {
  noteForm.handleSubmit(async (vals) => {
    try {
      await notesApi.value.create({ type: vals.type, text: vals.text });
      toast.success('Evolução registrada.');
      noteOpen.value = false;
      await loadNotes();
      activeTab.value = 'timeline';
    } catch (e) {
      toast.error(e.message || 'Não foi possível salvar a evolução.');
    }
  });
}

// ── Ação: agendar consulta ───────────────────────────────────────────────────────
const scheduleOpen = ref(false);
const schedForm = useForm({
  initial: { professional_id: '', scheduled_at: '', duration_minutes: '60', amount: '' },
  rules: {
    professional_id: [validators.required('Selecione um profissional.')],
    scheduled_at: [validators.required('Informe a data e hora.')],
    amount: [validators.required('Informe o valor.'), validators.numeric(), validators.min(0)],
  },
});
watch(scheduleOpen, (open) => { if (open) { schedForm.reset(); loadProfessionals(); } });
function submitSchedule() {
  schedForm.handleSubmit(async (vals) => {
    const amountCents = Math.round((Number(vals.amount) || 0) * 100);
    const when = new Date(vals.scheduled_at);
    if (isNaN(when.getTime())) { schedForm.errors.scheduled_at = 'Data inválida.'; return; }
    try {
      await scheduleConsultation({
        patient_id: props.id,
        professional_id: vals.professional_id,
        scheduled_at: when.toISOString(),
        duration_minutes: Number(vals.duration_minutes) || 60,
        amount_cents: amountCents,
        currency: 'BRL',
      });
      toast.success('Consulta agendada.');
      scheduleOpen.value = false;
      await loadConsultations();
      activeTab.value = 'schedule';
    } catch (e) {
      if (e && e.status === 409) { toast.error('Conflito de horário para este profissional.'); return; }
      toast.error(e.message || 'Não foi possível agendar a consulta.');
    }
  });
}

// ── Ação: gerar relatório (async 202) ────────────────────────────────────────────
//   Coleta tipo + período (opcional) num modal e envia no POST (date_from/date_to/type —
//   campos REAIS do contrato; ver openapi.yaml POST /v1/patients/:id/reports). Só envia
//   o que foi preenchido. Período inválido (de > até) é validado antes do POST.
const reportOpen = ref(false);
const reportForm = useForm({
  initial: { type: 'evolucao', date_from: '', date_to: '' },
  rules: { type: [validators.required('Selecione o tipo de relatório.')] },
});
function openReport() { reportForm.reset(); reportOpen.value = true; }
function submitReport() {
  if (generating.value) return;
  if (!reportForm.validate()) return;
  const v = reportForm.values;
  if (v.date_from && v.date_to && new Date(v.date_from) > new Date(v.date_to)) {
    reportForm.errors.date_to = 'A data final deve ser posterior à inicial.';
    return;
  }
  generating.value = true;
  const body = { type: v.type };
  if (v.date_from) body.date_from = v.date_from;
  if (v.date_to) body.date_to = v.date_to;
  reportsApi.value.create(body)
    .then(async () => {
      toast.success('Relatório solicitado. O processamento é assíncrono — atualize em instantes.');
      reportOpen.value = false;
      await loadReports();
      activeTab.value = 'reports';
    })
    .catch((e) => { toast.error(e.message || 'Não foi possível solicitar o relatório.'); })
    .finally(() => { generating.value = false; });
}

// ── Ação: abrir assistente com contexto do paciente ───────────────────────────────
function openAssistant() {
  router.push({ path: '/assistant', query: { patient: props.id } });
}

// ── Boot: carrega ficha + coleções em paralelo; recarrega ao trocar de paciente ────
function loadAll() {
  loadPatient();
  loadNotes();
  loadConsultations();
  loadReports();
  loadProfessionals(); // popula o mapa id→nome (banner, timeline, tabela) — não bloqueia a ficha
}
watch(() => props.id, loadAll);
onMounted(loadAll);
</script>

<style scoped>
/* ── Banner ──────────────────────────────────────────────────────────────────── */
.pd-banner {
  display: flex; align-items: center; gap: var(--ui-space-4);
  background: rgb(var(--ui-surface));
  border: 1px solid rgb(var(--ui-border));
  border-left: 3px solid rgb(var(--ui-accent));
  border-radius: var(--ui-radius-lg);
  padding: var(--ui-space-4) var(--ui-space-5);
  box-shadow: var(--ui-shadow-sm);
  flex-wrap: wrap;
}
.pd-avatar {
  flex-shrink: 0;
  width: 56px; height: 56px;
  display: inline-flex; align-items: center; justify-content: center;
  border-radius: 50%;
  background: rgb(var(--ui-accent) / 0.14);
  color: rgb(var(--ui-accent-strong));
  font-family: var(--ui-font-display);
  font-weight: 700; font-size: 1.25rem;
}
.pd-banner-main { flex: 1 1 240px; min-width: 0; }
.pd-banner-top { display: flex; align-items: center; gap: var(--ui-space-3); flex-wrap: wrap; }
.pd-banner-name { margin: 0; font-size: var(--ui-text-xl); font-family: var(--ui-font-display); }
.pd-banner-meta {
  margin: var(--ui-space-1) 0 0;
  color: rgb(var(--ui-muted));
  font-size: var(--ui-text-sm);
  display: flex; gap: var(--ui-space-3); flex-wrap: wrap;
}
.pd-banner-contacts { display: flex; flex-direction: column; gap: var(--ui-space-1); align-items: flex-end; }
.pd-contact {
  display: inline-flex; align-items: center; gap: var(--ui-space-1);
  color: rgb(var(--ui-accent-strong));
  text-decoration: none;
  font-size: var(--ui-text-sm);
  font-weight: 600;
}
.pd-contact:hover { text-decoration: underline; }
.pd-contact-ic { opacity: .8; }

/* ── Métricas ────────────────────────────────────────────────────────────────── */
.pd-metrics { display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: var(--ui-space-4); }

/* ── Abas ────────────────────────────────────────────────────────────────────── */
.pd-tabs {
  display: flex; gap: var(--ui-space-1);
  border-bottom: 1px solid rgb(var(--ui-border));
  overflow-x: auto;
}
.pd-tab {
  display: inline-flex; align-items: center; gap: var(--ui-space-2);
  background: none; border: none;
  border-bottom: 2px solid transparent;
  color: rgb(var(--ui-muted));
  font: inherit; font-weight: 600; font-size: var(--ui-text-sm);
  padding: var(--ui-space-3) var(--ui-space-4);
  cursor: pointer; white-space: nowrap;
  transition: color .15s ease, border-color .15s ease;
}
.pd-tab:hover { color: rgb(var(--ui-fg)); }
.pd-tab[data-active="true"] { color: rgb(var(--ui-accent-strong)); border-bottom-color: rgb(var(--ui-accent)); }
.pd-tab:focus-visible { outline: 2px solid rgb(var(--ui-accent)); outline-offset: -2px; border-radius: var(--ui-radius-sm); }
.pd-tab-ic { font-size: 1rem; line-height: 1; }
.pd-tab-count {
  display: inline-flex; align-items: center; justify-content: center;
  min-width: 18px; height: 18px; padding: 0 var(--ui-space-1);
  border-radius: var(--ui-radius-pill);
  background: rgb(var(--ui-surface-2));
  color: rgb(var(--ui-muted));
  font-size: var(--ui-text-xs); font-weight: 700;
}
.pd-tab[data-active="true"] .pd-tab-count { background: rgb(var(--ui-accent) / 0.16); color: rgb(var(--ui-accent-strong)); }

.pd-pane { display: flex; flex-direction: column; gap: var(--ui-space-4); }

/* ── Dados cadastrais (dt/dd) ───────────────────────────────────────────────────── */
.pd-kv { display: grid; grid-template-columns: repeat(2, 1fr); gap: var(--ui-space-4); margin: 0; }
.pd-kv-row { display: flex; flex-direction: column; gap: var(--ui-space-1); min-width: 0; }
.pd-kv dt { color: rgb(var(--ui-muted)); font-size: var(--ui-text-xs); text-transform: uppercase; letter-spacing: .04em; }
.pd-kv dd { margin: 0; color: rgb(var(--ui-fg)); font-size: var(--ui-text-md); overflow-wrap: anywhere; }
.pd-notes-title { margin: var(--ui-space-5) 0 var(--ui-space-2); font-size: var(--ui-text-sm); color: rgb(var(--ui-muted)); text-transform: uppercase; letter-spacing: .04em; }
.pd-notes-body { margin: 0; white-space: pre-wrap; color: rgb(var(--ui-fg)); line-height: 1.55; }

/* ── Linha do tempo ──────────────────────────────────────────────────────────────── */
.pd-timeline { list-style: none; margin: 0; padding: 0 0 0 var(--ui-space-4); position: relative; display: flex; flex-direction: column; gap: var(--ui-space-4); }
.pd-timeline::before { content: ""; position: absolute; left: 4px; top: 6px; bottom: 6px; width: 2px; background: rgb(var(--ui-border)); }
.pd-tl-item { position: relative; }
.pd-tl-dot { position: absolute; left: calc(-1 * var(--ui-space-4) + 0px); top: 6px; width: 10px; height: 10px; border-radius: 50%; background: rgb(var(--ui-accent)); box-shadow: 0 0 0 3px rgb(var(--ui-accent) / 0.15); }
.pd-tl-card { background: rgb(var(--ui-surface-2)); border: 1px solid rgb(var(--ui-border)); border-radius: var(--ui-radius-md); padding: var(--ui-space-3) var(--ui-space-4); }
.pd-tl-head { display: flex; align-items: center; justify-content: space-between; gap: var(--ui-space-2); flex-wrap: wrap; }
.pd-tl-date { color: rgb(var(--ui-muted)); font-size: var(--ui-text-xs); }
.pd-tl-text { margin: var(--ui-space-2) 0 0; color: rgb(var(--ui-fg)); line-height: 1.5; white-space: pre-wrap; }
.pd-tl-foot { margin: var(--ui-space-2) 0 0; display: flex; gap: var(--ui-space-3); color: rgb(var(--ui-muted)); font-size: var(--ui-text-xs); flex-wrap: wrap; }

/* ── Formulários (modais) ───────────────────────────────────────────────────────── */
.pd-form { display: flex; flex-direction: column; }

/* ── Responsivo ──────────────────────────────────────────────────────────────────── */
@media (max-width: 860px) {
  .pd-kv { grid-template-columns: 1fr; }
  .pd-banner-contacts { align-items: flex-start; }
}
</style>
