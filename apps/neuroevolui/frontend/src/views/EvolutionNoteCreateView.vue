<!--
  EvolutionNoteCreateView — Nova Nota de Evolução
  ---------------------------------------------------------------------------
  Formulário de nova nota com seletor de paciente, tipo, data e editor de
  texto rico. Painel lateral sugere rascunho via Assistente IA (REQ-0006).
  Suporta upload de anexos. Idempotência via Idempotency-Key.

  Âncoras: REQ-NEUROEVOLUI-0004, REQ-NEUROEVOLUI-0006

  Endpoints REAIS (via ../api.js):
    GET  /v1/patients                  (seletor de paciente — best-effort)
    GET  /v1/professionals             (seletor de profissional — best-effort)
    POST /v1/evolution-notes           (criação da nota — recurso principal)
    POST /v1/assistant                 (rascunho IA — fail-soft)

  Estados: loading (skeleton de boot) · error (com retry) · empty (sem
  pacientes, com CTA) · normal (formulário + painel IA lateral).
  CSP-safe: sem style inline, sem :style, sem v-html.
-->
<template>
  <UiPageLayout
    eyebrow="Prontuário"
    title="Nova Nota de Evolução"
    subtitle="Registre uma nota clínica, resultado de teste, plano de intervenção ou anamnese para um paciente."
    width="wide"
  >
    <template #actions>
      <UiButton variant="ghost" to="/evolution-notes">Ver todas as notas</UiButton>
      <UiButton variant="ghost" to="/patients">Pacientes</UiButton>
    </template>

    <!-- ESTADO: carregando catálogos (skeleton) -->
    <UiLoadingState
      v-if="bootState === 'loading'"
      variant="skeleton"
      :skeleton-lines="8"
      title="Preparando o formulário…"
    />

    <!-- ESTADO: erro no boot (com retry) -->
    <UiErrorState
      v-else-if="bootState === 'error'"
      message="Não foi possível preparar o formulário de nota de evolução."
      :retryable="true"
      @retry="bootstrap"
    />

    <!-- ESTADO: vazio — nenhum paciente cadastrado (CTA para cadastrar) -->
    <UiCard v-else-if="bootState === 'empty'">
      <UiEmptyState
        title="Nenhum paciente cadastrado"
        description="As notas de evolução são sempre vinculadas a um paciente. Cadastre o primeiro paciente para começar a registrar atendimentos."
        icon="users"
      >
        <template #action>
          <UiButton variant="primary" to="/patients/new">Cadastrar paciente</UiButton>
        </template>
      </UiEmptyState>
    </UiCard>

    <!-- ESTADO: normal — layout de duas colunas: formulário + painel IA -->
    <form v-else class="enc-root" novalidate @submit.prevent="submit">

      <!-- Coluna principal: formulário -->
      <div class="enc-main">

        <!-- Métricas ao vivo (resumo do que está sendo preenchido) -->
        <section class="enc-metrics" aria-label="Resumo da nota">
          <UiMetricCard
            label="Paciente"
            :value="patientSummary"
            tone="primary"
            hint="Paciente selecionado"
          />
          <UiMetricCard
            label="Tipo"
            :value="typeSummary"
            tone="running"
            hint="Classificação da nota"
          />
          <UiMetricCard
            label="Data"
            :value="dateSummary"
            tone="neutral"
            hint="Data do atendimento"
          />
          <UiMetricCard
            label="Caracteres"
            :value="charCount > 0 ? String(charCount) : '—'"
            :tone="charCount >= 50 ? 'success' : 'neutral'"
            hint="Tamanho da nota clínica"
          />
        </section>

        <!-- Vínculo: paciente, profissional, tipo, data -->
        <UiCard title="Vínculo" subtitle="A quem se refere esta evolução e quando aconteceu.">
          <UiFormSection :columns="2">
            <!-- Paciente (obrigatório) -->
            <UiFormField
              label="Paciente"
              :required="true"
              :error="f.errors.patient_id"
              hint="Selecione o paciente atendido."
            >
              <template #default="{ id, describedBy }">
                <select
                  :id="id"
                  class="enc-select"
                  :aria-describedby="describedBy || undefined"
                  :aria-required="true"
                  :aria-invalid="f.errors.patient_id ? 'true' : undefined"
                  :value="f.values.patient_id"
                  @change="f.setField('patient_id', $event.target.value)"
                >
                  <option value="" disabled>Selecione um paciente…</option>
                  <option v-for="opt in patientOptions" :key="opt.value" :value="opt.value">
                    {{ opt.label }}
                  </option>
                </select>
              </template>
            </UiFormField>

            <!-- Profissional (opcional, fail-soft) -->
            <UiFormField
              label="Profissional"
              :error="f.errors.professional_id"
              :hint="professionalHint"
            >
              <template #default="{ id, describedBy }">
                <select
                  v-if="professionalsState !== 'error'"
                  :id="id"
                  class="enc-select"
                  :aria-describedby="describedBy || undefined"
                  :disabled="professionalsState === 'loading'"
                  :value="f.values.professional_id"
                  @change="f.setField('professional_id', $event.target.value)"
                >
                  <option value="">
                    {{ professionalsState === 'loading' ? 'Carregando…' : '— Eu (responsável pelo registro)' }}
                  </option>
                  <option v-for="opt in professionalOptions" :key="opt.value" :value="opt.value">
                    {{ opt.label }}
                  </option>
                </select>
                <!-- Fail-soft: lista indisponível → texto livre (não bloqueia o registro) -->
                <UiInput
                  v-else
                  :id="id"
                  :described-by="describedBy"
                  :model-value="f.values.professional_id"
                  :error="!!f.errors.professional_id"
                  placeholder="Identificador do profissional (opcional)"
                  @update:model-value="f.setField('professional_id', $event)"
                />
              </template>
            </UiFormField>

            <!-- Tipo de nota (obrigatório) -->
            <UiFormField
              label="Tipo de nota"
              :required="true"
              :error="f.errors.type"
              :hint="typeHint"
            >
              <template #default="{ id, describedBy }">
                <select
                  :id="id"
                  class="enc-select"
                  :aria-describedby="describedBy || undefined"
                  :aria-required="true"
                  :aria-invalid="f.errors.type ? 'true' : undefined"
                  :value="f.values.type"
                  @change="f.setField('type', $event.target.value)"
                >
                  <option v-for="opt in typeOptions" :key="opt.value" :value="opt.value">
                    {{ opt.label }}
                  </option>
                </select>
              </template>
            </UiFormField>

            <!-- Data da nota (obrigatório) -->
            <UiFormField
              label="Data da nota"
              :required="true"
              :error="f.errors.note_date"
              hint="Quando o atendimento aconteceu."
            >
              <template #default="{ id, describedBy }">
                <UiInput
                  :id="id"
                  :described-by="describedBy"
                  type="datetime-local"
                  :model-value="f.values.note_date"
                  :error="!!f.errors.note_date"
                  :required="true"
                  @update:model-value="f.setField('note_date', $event)"
                />
              </template>
            </UiFormField>
          </UiFormSection>
        </UiCard>

        <!-- Conteúdo clínico: nota principal + campos estruturados -->
        <UiCard title="Conteúdo clínico" subtitle="Nota principal e campos estruturados conforme o tipo.">
          <UiFormSection :columns="1">
            <UiFormField
              label="Nota clínica"
              :required="true"
              :error="f.errors.text"
              :hint="textHint"
              :full-width="true"
            >
              <template #default="{ id, describedBy }">
                <textarea
                  :id="id"
                  class="enc-textarea enc-textarea-main"
                  :aria-describedby="describedBy || undefined"
                  :aria-required="true"
                  :aria-invalid="f.errors.text ? 'true' : undefined"
                  :value="f.values.text"
                  rows="10"
                  placeholder="Descreva a evolução: objetivos, condutas, resposta do paciente, encaminhamentos e próximos passos…"
                  @input="f.setField('text', $event.target.value)"
                />
              </template>
            </UiFormField>
          </UiFormSection>

          <!-- Campos estruturados dinâmicos (conforme o tipo selecionado) -->
          <UiFormSection
            v-if="structuredFields.length"
            :title="structuredSectionTitle"
            :description="structuredSectionDesc"
            :columns="2"
          >
            <UiFormField
              v-for="sf in structuredFields"
              :key="sf.key"
              :label="sf.label"
              :hint="sf.hint"
              :full-width="sf.full"
            >
              <template #default="{ id, describedBy }">
                <select
                  v-if="sf.type === 'enum'"
                  :id="id"
                  class="enc-select"
                  :aria-describedby="describedBy || undefined"
                  :value="structured[sf.key] || ''"
                  @change="setStructured(sf.key, $event.target.value)"
                >
                  <option value="">—</option>
                  <option v-for="opt in sf.options" :key="opt.value" :value="opt.value">
                    {{ opt.label }}
                  </option>
                </select>
                <textarea
                  v-else-if="sf.type === 'longtext'"
                  :id="id"
                  class="enc-textarea enc-textarea-sm"
                  :aria-describedby="describedBy || undefined"
                  :value="structured[sf.key] || ''"
                  rows="3"
                  :placeholder="sf.placeholder"
                  @input="setStructured(sf.key, $event.target.value)"
                />
                <UiInput
                  v-else
                  :id="id"
                  :described-by="describedBy"
                  :model-value="structured[sf.key] || ''"
                  :placeholder="sf.placeholder"
                  @update:model-value="setStructured(sf.key, $event)"
                />
              </template>
            </UiFormField>
          </UiFormSection>
        </UiCard>

        <!-- Anexos -->
        <UiCard
          title="Anexos"
          subtitle="Laudos, escalas e registros de testes referenciados nesta evolução."
        >
          <UiFileDrop
            v-model="files"
            label="Arraste arquivos aqui ou clique para escolher"
            hint="PDF, imagens, laudos e escalas. Até 20 arquivos. Os mesmos arquivos alimentam o rascunho de IA."
          />
          <p class="enc-files-note" role="status">
            {{ files.length === 0 ? 'Nenhum arquivo selecionado.' : filesCountLabel }}
          </p>
          <p class="enc-files-note enc-files-note-dim" role="note">
            O registro guarda a <strong>referência</strong> de cada anexo (nome, tamanho e tipo).
            O conteúdo binário é processado pela IA para o rascunho, mas não fica armazenado junto à nota.
          </p>
        </UiCard>

        <!-- Idempotência + ações de submissão -->
        <div class="enc-actions">
          <p class="enc-idem" role="note">
            <span class="enc-idem-dot" aria-hidden="true">●</span>
            Registro protegido por chave de idempotência — reenvios da mesma tentativa não duplicam a nota.
          </p>
          <p class="enc-hint">
            Campos marcados com <span class="enc-req">*</span> são obrigatórios.
          </p>
          <div class="enc-buttons">
            <UiButton
              variant="ghost"
              type="button"
              :disabled="f.submitting.value"
              @click="cancel"
            >
              Cancelar
            </UiButton>
            <UiButton
              variant="primary"
              type="submit"
              :loading="f.submitting.value"
            >
              Registrar evolução
            </UiButton>
          </div>
        </div>
      </div>

      <!-- Coluna lateral: painel do Assistente IA (REQ-NEUROEVOLUI-0006) -->
      <aside class="enc-aside" aria-label="Assistente de IA para rascunho">
        <UiCard
          title="Assistente IA"
          subtitle="Descreva o atendimento e a IA propõe um rascunho da nota. Você revisa antes de salvar."
        >
          <template #actions>
            <UiStatusBadge
              :status="aiBadge.status"
              :tone="aiBadge.tone"
              :label="aiBadge.label"
              with-dot
            />
          </template>

          <div class="enc-ai">
            <!-- Prompt ao assistente -->
            <UiFormField
              label="O que aconteceu na sessão?"
              hint="Ex.: foco, evolução motora, resposta a estímulos, intercorrências."
            >
              <template #default="{ id, describedBy }">
                <textarea
                  :id="id"
                  class="enc-textarea enc-textarea-sm"
                  :aria-describedby="describedBy || undefined"
                  :value="aiPrompt"
                  rows="4"
                  :disabled="aiLoading"
                  placeholder="Resuma o atendimento em poucas linhas para a IA elaborar a nota…"
                  @input="aiPrompt = $event.target.value"
                />
              </template>
            </UiFormField>

            <!-- Arquivos para análise da IA (mesmo v-model que a seção de anexos) -->
            <UiFormField
              label="Arquivos para a IA analisar"
              hint="Os mesmos arquivos da seção Anexos acima."
            >
              <template #default>
                <UiFileDrop
                  v-model="files"
                  :disabled="aiLoading"
                  label="Arraste arquivos ou clique"
                  hint="Compartilhados com a seção Anexos."
                  :multiple="true"
                />
              </template>
            </UiFormField>

            <!-- Mensagens de estado da IA -->
            <p v-if="aiError" class="enc-ai-msg enc-ai-msg-error" role="alert">{{ aiError }}</p>
            <p v-else-if="aiNotice" class="enc-ai-msg" role="status">{{ aiNotice }}</p>

            <!-- Resposta da IA (preview antes de aplicar) -->
            <div v-if="aiDraftPreview" class="enc-ai-draft" role="region" aria-label="Rascunho sugerido pela IA">
              <p class="enc-ai-draft-label">Rascunho sugerido:</p>
              <div class="enc-ai-draft-text">{{ aiDraftPreview }}</div>
              <div class="enc-ai-draft-actions">
                <UiButton
                  variant="primary"
                  size="sm"
                  type="button"
                  @click="applyDraft"
                >
                  Aplicar à nota
                </UiButton>
                <UiButton
                  variant="ghost"
                  size="sm"
                  type="button"
                  @click="discardDraft"
                >
                  Descartar
                </UiButton>
              </div>
            </div>

            <!-- Botão de geração -->
            <div class="enc-ai-actions">
              <UiButton
                variant="subtle"
                type="button"
                :loading="aiLoading"
                :disabled="!canAskAi"
                @click="askAiDraft"
              >
                {{ aiLoading ? 'Gerando rascunho…' : 'Gerar rascunho com IA' }}
              </UiButton>
            </div>

            <!-- Dica de uso -->
            <p class="enc-ai-tip">
              A IA é um auxílio — sempre revise o rascunho antes de registrar.
              Em caso de indisponibilidade, escreva a nota normalmente.
            </p>
          </div>
        </UiCard>
      </aside>
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
  UiFileDrop,
  UiButton,
  UiStatusBadge,
  UiEmptyState,
  UiLoadingState,
  UiErrorState,
  useForm,
  useToast,
  useConfirm,
  validators,
  format,
} from '../ui/index.js';
import { evolutionNotes as evolutionNotesApi, patients as patientsApi, professionals as professionalsApi, assistant } from '../api.js';

const router = useRouter();
const toast = useToast();
const askConfirm = useConfirm();

// ── Tipos de nota (enum do backend) ─────────────────────────────────────────
const TYPE_LABELS = {
  nota_clinica: 'Nota clínica',
  resultado_teste: 'Resultado de teste',
  plano_intervencao: 'Plano de intervenção',
  anamnese: 'Anamnese',
  outro: 'Outro',
};
const TYPE_HINTS = {
  nota_clinica: 'Registro de atendimento clínico com condutas e resposta do paciente.',
  resultado_teste: 'Aplicação e resultado de uma escala ou teste padronizado.',
  plano_intervencao: 'Metas terapêuticas, estratégias e frequência prevista.',
  anamnese: 'Levantamento histórico inicial do paciente.',
  outro: 'Registro livre não classificado nos tipos anteriores.',
};
const typeOptions = Object.keys(TYPE_LABELS).map((value) => ({ value, label: TYPE_LABELS[value] }));
const typeHint = computed(() => TYPE_HINTS[f.values.type] || 'Classifique o registro.');

// ── Campos estruturados por tipo ─────────────────────────────────────────────
const STRUCTURED_BY_TYPE = {
  nota_clinica: [
    {
      key: 'focus',
      label: 'Foco da sessão',
      type: 'enum',
      options: [
        { value: 'motor', label: 'Coordenação motora' },
        { value: 'cognitive', label: 'Cognição' },
        { value: 'language', label: 'Linguagem' },
        { value: 'behavior', label: 'Comportamento' },
        { value: 'social', label: 'Habilidades sociais' },
      ],
      hint: 'Eixo principal trabalhado na sessão.',
    },
    {
      key: 'engagement',
      label: 'Engajamento',
      type: 'enum',
      options: [
        { value: 'high', label: 'Alto' },
        { value: 'medium', label: 'Médio' },
        { value: 'low', label: 'Baixo' },
      ],
      hint: 'Como o paciente respondeu.',
    },
    {
      key: 'next_steps',
      label: 'Próximos passos',
      type: 'longtext',
      placeholder: 'O que será trabalhado na próxima sessão…',
      full: true,
    },
  ],
  resultado_teste: [
    { key: 'test_name', label: 'Nome do teste/escala', type: 'text', placeholder: 'Ex.: M-CHAT, Vineland, CARS…' },
    { key: 'score', label: 'Pontuação / resultado', type: 'text', placeholder: 'Ex.: 24 pts — alto risco' },
    {
      key: 'interpretation',
      label: 'Interpretação clínica',
      type: 'longtext',
      placeholder: 'Leitura clínica do resultado e implicações para o tratamento…',
      full: true,
    },
  ],
  plano_intervencao: [
    {
      key: 'goals',
      label: 'Metas terapêuticas',
      type: 'longtext',
      placeholder: 'Objetivos a atingir no período…',
      full: true,
    },
    {
      key: 'strategies',
      label: 'Estratégias e abordagens',
      type: 'longtext',
      placeholder: 'Técnicas, recursos e metodologias…',
      full: true,
    },
    {
      key: 'frequency',
      label: 'Frequência prevista',
      type: 'enum',
      options: [
        { value: 'weekly', label: 'Semanal' },
        { value: 'biweekly', label: 'Quinzenal' },
        { value: 'monthly', label: 'Mensal' },
      ],
      hint: 'Cadência das sessões.',
    },
  ],
  anamnese: [
    { key: 'birth_history', label: 'Histórico de nascimento', type: 'longtext', placeholder: 'Parto, intercorrências, APGAR…', full: true },
    { key: 'development_milestones', label: 'Marcos do desenvolvimento', type: 'longtext', placeholder: 'Sentar, engatinhar, falar, andar…', full: true },
    { key: 'family_history', label: 'Histórico familiar', type: 'longtext', placeholder: 'Diagnósticos e condições relevantes na família…', full: true },
  ],
  outro: [],
};

const structuredFields = computed(() => STRUCTURED_BY_TYPE[f.values.type] || []);
const structuredSectionTitle = computed(() =>
  'Campos de ' + (TYPE_LABELS[f.values.type] || 'evolução').toLowerCase(),
);
const structuredSectionDesc = computed(() =>
  structuredFields.value.length
    ? 'Detalhes estruturados conforme o tipo. Opcionais, mas enriquecem o prontuário.'
    : 'Este tipo não exige campos estruturados adicionais.',
);

const structured = reactive({});
function setStructured(key, value) {
  structured[key] = value;
}

// ── Estado de boot ────────────────────────────────────────────────────────────
// 'loading' → 'ok' | 'empty' (sem pacientes) | 'error'
const bootState = ref('loading');

// ── Catálogo de pacientes ─────────────────────────────────────────────────────
const patientOptions = ref([]);

function patientLabel(p) {
  const name = p.full_name || p.name || ('Paciente #' + (p.id ?? '—'));
  return p.document ? name + ' · ' + p.document : name;
}

async function loadPatients() {
  const res = await patientsApi.list({ pageSize: 200, sort: 'full_name', dir: 'asc' });
  const rows = Array.isArray(res) ? res : res && res.data ? res.data : [];
  patientOptions.value = rows
    .filter((p) => p && p.id !== undefined && p.id !== null)
    .map((p) => ({ value: String(p.id), label: patientLabel(p) }));
  return patientOptions.value.length;
}

// ── Catálogo de profissionais (fail-soft) ─────────────────────────────────────
const professionalsState = ref('loading'); // loading | ready | error
const professionalOptions = ref([]);
const professionalHint = computed(() => {
  if (professionalsState.value === 'loading') return 'Carregando a equipe…';
  if (professionalsState.value === 'error')
    return 'Lista indisponível — informe o ID do profissional (opcional).';
  return 'Quem conduziu o atendimento. Em branco, registra você como responsável.';
});

function professionalLabel(p) {
  const name = p.full_name || p.name || ('Profissional #' + (p.id ?? '—'));
  return p.specialty ? name + ' · ' + p.specialty : p.role ? name + ' · ' + p.role : name;
}

async function loadProfessionals() {
  professionalsState.value = 'loading';
  try {
    const res = await professionalsApi.list({ pageSize: 200, sort: 'full_name', dir: 'asc' });
    const rows = Array.isArray(res) ? res : res && res.data ? res.data : [];
    professionalOptions.value = rows
      .filter((p) => p && p.id !== undefined && p.id !== null)
      .map((p) => ({ value: String(p.id), label: professionalLabel(p) }));
    professionalsState.value = 'ready';
  } catch (_e) {
    // Fail-soft: campo profissional é opcional; a lista indisponível não bloqueia.
    professionalOptions.value = [];
    professionalsState.value = 'error';
  }
}

// ── Formulário ────────────────────────────────────────────────────────────────
function defaultNoteDate() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return (
    d.getFullYear() +
    '-' +
    pad(d.getMonth() + 1) +
    '-' +
    pad(d.getDate()) +
    'T' +
    pad(d.getHours()) +
    ':' +
    pad(d.getMinutes())
  );
}

const f = useForm({
  initial: {
    patient_id: '',
    professional_id: '',
    type: 'nota_clinica',
    note_date: defaultNoteDate(),
    text: '',
  },
  rules: {
    patient_id: [validators.required('Selecione o paciente.')],
    type: [validators.required('Selecione o tipo de nota.')],
    note_date: [validators.required('Informe a data da nota.')],
    text: [
      validators.required('Escreva a nota clínica.'),
      validators.minLen(3, 'A nota precisa ter pelo menos 3 caracteres.'),
    ],
  },
});

// ── Derivados de exibição ─────────────────────────────────────────────────────
const patientSummary = computed(() => {
  if (!f.values.patient_id) return '—';
  const opt = patientOptions.value.find((o) => o.value === f.values.patient_id);
  return opt ? opt.label : f.values.patient_id;
});
const typeSummary = computed(() => TYPE_LABELS[f.values.type] || '—');
const dateSummary = computed(() => {
  if (!f.values.note_date) return '—';
  const d = new Date(f.values.note_date);
  if (Number.isNaN(d.getTime())) return '—';
  return format.formatDate ? format.formatDate(d.toISOString()) : d.toLocaleDateString('pt-BR');
});
const charCount = computed(() => (f.values.text || '').length);
const textHint = computed(() => {
  const n = charCount.value;
  if (n === 0) return 'Texto principal da evolução. Você pode partir do rascunho de IA.';
  return n + ' caractere' + (n !== 1 ? 's' : '');
});

// ── Anexos ────────────────────────────────────────────────────────────────────
const files = ref([]);
const filesCountLabel = computed(() => {
  const n = files.value.length;
  return n === 1 ? '1 arquivo anexado.' : n + ' arquivos anexados.';
});

// ── Assistente de IA (REQ-NEUROEVOLUI-0006, fail-soft) ────────────────────────
const aiPrompt = ref('');
const aiLoading = ref(false);
const aiError = ref('');
const aiNotice = ref('');
const aiDraftPreview = ref('');
const aiUsed = ref(false);

const canAskAi = computed(
  () => !aiLoading.value && (aiPrompt.value.trim().length > 0 || files.value.length > 0),
);

const aiBadge = computed(() => {
  if (aiLoading.value) return { status: 'running', tone: 'running', label: 'Gerando…' };
  if (aiError.value) return { status: 'failed', tone: 'error', label: 'Indisponível' };
  if (aiUsed.value) return { status: 'succeeded', tone: 'success', label: 'Aplicado' };
  if (aiDraftPreview.value) return { status: 'queued', tone: 'warning', label: 'Aguardando revisão' };
  return { status: 'idle', tone: 'neutral', label: 'Opcional' };
});

function extractDraftText(result) {
  if (!result || typeof result !== 'object') return '';
  if (typeof result.answer === 'string' && result.answer.trim()) return result.answer.trim();
  const action =
    Array.isArray(result.actions)
      ? result.actions.find((a) => a && (a.text || a.draft))
      : null;
  if (action) return String(action.text || action.draft || '').trim();
  return '';
}

async function askAiDraft() {
  if (!canAskAi.value) return;
  aiLoading.value = true;
  aiError.value = '';
  aiNotice.value = '';
  aiDraftPreview.value = '';
  try {
    const typeLabel = TYPE_LABELS[f.values.type] || 'evolução';
    const intro =
      'Redija um rascunho de nota clínica do tipo "' +
      typeLabel +
      '" para registro de evolução neurológica/terapêutica de paciente, em português, objetivo e estruturado.';
    const detail = aiPrompt.value.trim()
      ? '\n\nContexto do atendimento:\n' + aiPrompt.value.trim()
      : '';
    const result = await assistant(intro + detail, files.value, { contextType: 'professional' });
    const draft = extractDraftText(result);
    if (draft) {
      aiDraftPreview.value = draft;
      aiNotice.value = 'Rascunho pronto — revise e clique em "Aplicar à nota" para usar.';
      toast.info('Rascunho gerado pela IA. Revise antes de aplicar.');
    } else {
      aiNotice.value = 'A IA não retornou um rascunho utilizável. Escreva a nota manualmente.';
      toast.warning('Sem rascunho utilizável desta vez.');
    }
  } catch (e) {
    // Fail-soft: a IA é um auxílio; qualquer falha não impede o registro manual.
    if (e && e.status === 503) {
      aiError.value = 'Assistente de IA indisponível no momento. Escreva a nota manualmente.';
    } else {
      aiError.value =
        (e && e.message) || 'Não foi possível gerar o rascunho. Escreva a nota manualmente.';
    }
    toast.warning('Assistente de IA indisponível. Você pode escrever a nota normalmente.');
  } finally {
    aiLoading.value = false;
  }
}

async function applyDraft() {
  if (!aiDraftPreview.value) return;
  const hasText = (f.values.text || '').trim().length > 0;
  if (hasText) {
    const ok = await askConfirm({
      title: 'Substituir a nota atual?',
      message:
        'Você já escreveu algo na nota clínica. Aplicar o rascunho da IA vai substituir o texto atual.',
      confirmLabel: 'Substituir',
    });
    if (!ok) {
      aiNotice.value = 'Rascunho descartado; sua nota foi mantida.';
      aiDraftPreview.value = '';
      return;
    }
  }
  f.setField('text', aiDraftPreview.value);
  aiUsed.value = true;
  aiNotice.value = 'Rascunho aplicado. Revise antes de salvar.';
  aiDraftPreview.value = '';
  toast.success('Rascunho da IA aplicado à nota clínica.');
}

function discardDraft() {
  aiDraftPreview.value = '';
  aiNotice.value = 'Rascunho descartado.';
}

// ── Idempotência (1 nota por tentativa; renovada após conflito 409) ──────────
function newIdempotencyKey() {
  try {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return 'evol-' + crypto.randomUUID();
  } catch (_e) {
    /* fallback */
  }
  return 'evol-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
}
const idempotencyKey = ref(newIdempotencyKey());

// ── Sujeira do formulário (para confirmar descarte) ───────────────────────────
function isDirty() {
  const v = f.values;
  return Boolean(
    v.patient_id ||
      v.professional_id ||
      (v.text && v.text.trim()) ||
      aiPrompt.value.trim() ||
      files.value.length ||
      Object.keys(structured).some((k) => structured[k]),
  );
}

// ── Payload de campos estruturados ───────────────────────────────────────────
function buildStructuredPayload() {
  const out = {};
  for (const sf of structuredFields.value) {
    const val = structured[sf.key];
    if (val !== undefined && val !== null && String(val).trim() !== '') out[sf.key] = val;
  }
  return Object.keys(out).length ? out : undefined;
}

// ── Submit ────────────────────────────────────────────────────────────────────
async function submit() {
  await f.handleSubmit(async (vals) => {
    const structuredPayload = buildStructuredPayload();

    const payload = {
      patient_id: vals.patient_id,
      professional_id: vals.professional_id ? vals.professional_id.trim() || null : null,
      type: vals.type,
      note_date: vals.note_date || null,
      text: vals.text.trim(),
    };
    if (structuredPayload) payload.structured_fields = JSON.stringify(structuredPayload);
    // Anexos: o backend guarda apenas a referência (nome/tamanho/tipo), não o binário.
    if (files.value.length) {
      payload.attachments = files.value
        .map((file) => file.name)
        .join(',');
    }

    try {
      // POST /v1/evolution-notes com Idempotency-Key (garante criação única).
      const created = await evolutionNotesApi.create(payload, {
        idempotencyKey: idempotencyKey.value,
      });
      toast.success('Nota de evolução registrada com sucesso.');
      const noteId = created && (created.id || (created.data && created.data.id));
      const patientId = vals.patient_id;
      // Navega para o paciente (linha do tempo) ou para a lista de notas.
      if (patientId) {
        router.push('/patients/' + patientId + (noteId ? '#evolution-' + noteId : ''));
      } else {
        router.push('/evolution-notes');
      }
    } catch (e) {
      handleSubmitError(e);
    }
  });
}

function handleSubmitError(e) {
  const status = e && e.status;
  if (status === 401 || status === 403) {
    toast.error('Sem permissão para registrar evoluções (perfil profissional necessário).');
    return;
  }
  if (status === 409) {
    // Conflito de idempotência → renova a chave para a próxima tentativa.
    idempotencyKey.value = newIdempotencyKey();
    toast.error((e && e.message) || 'Esta evolução já foi registrada (idempotência).');
    return;
  }
  if (status === 404) {
    toast.error('Paciente não encontrado. Atualize a lista e tente novamente.');
    return;
  }
  if (status === 422) {
    toast.error((e && e.message) || 'Dados inválidos. Revise os campos e tente novamente.');
    return;
  }
  toast.error((e && e.message) || 'Não foi possível registrar a nota de evolução.');
}

// ── Cancelar (com confirmação se sujo) ───────────────────────────────────────
async function cancel() {
  if (isDirty()) {
    const ok = await askConfirm({
      title: 'Descartar nota?',
      message: 'As informações preenchidas (e o rascunho da IA) serão perdidas.',
      confirmLabel: 'Descartar',
      danger: true,
    });
    if (!ok) return;
  }
  router.push('/evolution-notes');
}

// ── Bootstrap ────────────────────────────────────────────────────────────────
async function bootstrap() {
  bootState.value = 'loading';
  try {
    // Profissionais: fail-soft (engole erro internamente em loadProfessionals).
    // Pacientes: obrigatório — se falhar, vai para estado 'error'.
    await Promise.all([loadProfessionals()]);
    const hasPatients = await loadPatients();
    bootState.value = hasPatients ? 'ok' : 'empty';
  } catch (_e) {
    bootState.value = 'error';
  }
}

onMounted(bootstrap);
</script>

<style scoped>
/* Layout raiz: formulário + coluna lateral da IA */
.enc-root {
  display: grid;
  grid-template-columns: 1fr 360px;
  gap: var(--ui-space-5);
  align-items: start;
}

.enc-main {
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-5);
  min-width: 0;
}

.enc-aside {
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-4);
  position: sticky;
  top: var(--ui-space-4);
}

/* Métricas ao vivo */
.enc-metrics {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: var(--ui-space-3);
}

/* Controles (select / textarea espelham o UiInput, apenas --ui-*) */
.enc-select {
  background: rgb(var(--ui-bg));
  color: rgb(var(--ui-fg));
  border: 1px solid rgb(var(--ui-border-strong));
  border-radius: var(--ui-radius-sm);
  padding: 8px 11px;
  font: inherit;
  font-size: var(--ui-text-md);
  width: 100%;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}
.enc-select:focus {
  outline: none;
  border-color: rgb(var(--ui-accent));
  box-shadow: 0 0 0 3px rgb(var(--ui-accent) / 0.15);
}
.enc-select[aria-invalid='true'] {
  border-color: rgb(var(--ui-danger));
}
.enc-select[aria-invalid='true']:focus {
  box-shadow: 0 0 0 3px rgb(var(--ui-danger) / 0.15);
}
.enc-select:disabled {
  opacity: 0.55;
  cursor: not-allowed;
  background: rgb(var(--ui-surface-2));
}

.enc-textarea {
  background: rgb(var(--ui-bg));
  color: rgb(var(--ui-fg));
  border: 1px solid rgb(var(--ui-border-strong));
  border-radius: var(--ui-radius-sm);
  padding: 8px 11px;
  font: inherit;
  font-size: var(--ui-text-md);
  width: 100%;
  resize: vertical;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}
.enc-textarea:focus {
  outline: none;
  border-color: rgb(var(--ui-accent));
  box-shadow: 0 0 0 3px rgb(var(--ui-accent) / 0.15);
}
.enc-textarea[aria-invalid='true'] {
  border-color: rgb(var(--ui-danger));
}
.enc-textarea[aria-invalid='true']:focus {
  box-shadow: 0 0 0 3px rgb(var(--ui-danger) / 0.15);
}
.enc-textarea::placeholder {
  color: rgb(var(--ui-faint));
}
.enc-textarea:disabled {
  opacity: 0.55;
  cursor: not-allowed;
  background: rgb(var(--ui-surface-2));
}
.enc-textarea-main {
  min-height: 200px;
  line-height: 1.6;
}
.enc-textarea-sm {
  min-height: 84px;
}

/* Nota de anexos */
.enc-files-note {
  margin: var(--ui-space-2) 0 0;
  font-size: var(--ui-text-sm);
  color: rgb(var(--ui-muted));
}
.enc-files-note-dim {
  color: rgb(var(--ui-faint));
  font-size: var(--ui-text-xs);
}

/* Painel do Assistente IA */
.enc-ai {
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-3);
}
.enc-ai-actions {
  display: flex;
  justify-content: flex-end;
}
.enc-ai-msg {
  margin: 0;
  font-size: var(--ui-text-sm);
  color: rgb(var(--ui-muted));
}
.enc-ai-msg-error {
  color: rgb(var(--ui-danger));
}
.enc-ai-tip {
  margin: 0;
  font-size: var(--ui-text-xs);
  color: rgb(var(--ui-faint));
  line-height: 1.4;
}

/* Preview do rascunho da IA */
.enc-ai-draft {
  border: 1px solid rgb(var(--ui-accent) / 0.3);
  border-radius: var(--ui-radius);
  background: rgb(var(--ui-accent) / 0.04);
  padding: var(--ui-space-3);
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-2);
}
.enc-ai-draft-label {
  margin: 0;
  font-size: var(--ui-text-xs);
  font-weight: 700;
  color: rgb(var(--ui-accent-strong));
  text-transform: uppercase;
  letter-spacing: 0.05em;
}
.enc-ai-draft-text {
  font-size: var(--ui-text-sm);
  color: rgb(var(--ui-fg));
  line-height: 1.55;
  white-space: pre-wrap;
  max-height: 200px;
  overflow-y: auto;
  border-radius: var(--ui-radius-sm);
  background: rgb(var(--ui-surface));
  padding: var(--ui-space-2) var(--ui-space-3);
}
.enc-ai-draft-actions {
  display: flex;
  gap: var(--ui-space-2);
  justify-content: flex-end;
}

/* Ações (barra inferior da coluna principal) */
.enc-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ui-space-4);
  flex-wrap: wrap;
  padding-top: var(--ui-space-2);
}
.enc-hint {
  margin: 0;
  color: rgb(var(--ui-muted));
  font-size: var(--ui-text-sm);
}
.enc-req {
  color: rgb(var(--ui-danger));
  font-weight: 700;
}
.enc-buttons {
  display: flex;
  gap: var(--ui-space-2);
}

/* Idempotência: selo de garantia */
.enc-idem {
  display: flex;
  align-items: center;
  gap: var(--ui-space-2);
  margin: 0;
  font-size: var(--ui-text-xs);
  color: rgb(var(--ui-muted));
}
.enc-idem-dot {
  color: rgb(var(--ui-success));
  font-size: 0.65em;
  flex: 0 0 auto;
}

/* Responsividade */
@media (max-width: 1100px) {
  .enc-root {
    grid-template-columns: 1fr;
  }
  .enc-aside {
    position: static;
  }
  .enc-metrics {
    grid-template-columns: repeat(2, 1fr);
  }
}

@media (max-width: 640px) {
  .enc-metrics {
    grid-template-columns: 1fr 1fr;
    gap: var(--ui-space-2);
  }
  .enc-actions {
    flex-direction: column;
    align-items: stretch;
  }
  .enc-buttons {
    width: 100%;
  }
  .enc-buttons :deep(.ui-btn) {
    flex: 1 1 auto;
  }
}
</style>
