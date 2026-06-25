<!--
  EvolutionNoteCreateView — Nova evolução
  ---------------------------------------------------------------------------
  Registra uma evolução estruturada (sessão, resultado de teste, plano de
  intervenção ou observação) para um paciente, com campos estruturados e
  anexos (arquivos). Pode partir de um rascunho proposto pela IA.

  Endpoints REAIS (via ../api.js → resourceFactory):
    GET  /v1/patients                                  (selecionar paciente)
    POST /v1/patients/:patientId/evolution-notes       (criar a evolução)
    POST /v1/consultation-notes                         (geração assíncrona via fila + idempotência)
    POST /v1/assistant                                  (rascunho IA, fail-soft via helper assistant())

  Estados: loading (carregando pacientes) · error (com retry) · empty
  (nenhum paciente cadastrado, com CTA) · normal (formulário).
  CSP-safe: sem style inline, sem :style, sem v-html. Estado por class + data-*.
-->
<template>
  <UiPageLayout
    eyebrow="Evoluções"
    title="Nova evolução"
    subtitle="Registre uma nota clínica, resultado de teste ou plano de intervenção com campos estruturados e anexos."
    width="narrow"
  >
    <template #actions>
      <UiButton variant="ghost" to="/patients">Voltar aos pacientes</UiButton>
    </template>

    <!-- ESTADO: carregando pacientes (skeleton) -->
    <UiLoadingState
      v-if="patientsState === 'loading'"
      variant="skeleton"
      :skeleton-lines="6"
      title="Carregando pacientes…"
    />

    <!-- ESTADO: erro ao carregar pacientes (com retry) -->
    <UiErrorState
      v-else-if="patientsState === 'error'"
      :message="patientsError"
      :retryable="true"
      @retry="loadPatients"
    />

    <!-- ESTADO: vazio — nenhum paciente cadastrado (com CTA) -->
    <UiCard v-else-if="patientsState === 'empty'">
      <UiEmptyState
        title="Nenhum paciente cadastrado"
        description="A evolução é sempre vinculada a um paciente. Cadastre o primeiro paciente para começar a registrar atendimentos."
        icon="users"
      >
        <template #action>
          <UiButton variant="primary" to="/patients/new">Cadastrar paciente</UiButton>
        </template>
      </UiEmptyState>
    </UiCard>

    <!-- ESTADO: normal — formulário de nova evolução -->
    <form v-else class="en-form" novalidate @submit.prevent="submit">
      <!-- Assistente de IA (opcional, fail-soft): propõe um rascunho da nota -->
      <UiCard
        title="Rascunho com IA"
        subtitle="Descreva o atendimento (ou anexe arquivos) e a IA propõe um rascunho da nota. Você revisa antes de salvar."
      >
        <template #actions>
          <UiStatusBadge
            :status="aiBadge.status"
            :tone="aiBadge.tone"
            :label="aiBadge.label"
            with-dot
          />
        </template>

        <div class="en-ai">
          <UiFormField
            label="O que aconteceu na sessão?"
            hint="Ex.: foco, evolução motora, resposta a estímulos, intercorrências. A IA usa isto para sugerir o texto."
          >
            <template #default="{ id, describedBy }">
              <textarea
                :id="id"
                class="en-textarea en-textarea-sm"
                :aria-describedby="describedBy || undefined"
                :value="aiPrompt"
                rows="3"
                :disabled="aiLoading"
                placeholder="Resuma o atendimento em poucas linhas…"
                @input="aiPrompt = $event.target.value"
              />
            </template>
          </UiFormField>

          <UiFormField
            label="Anexos para a IA analisar (opcional)"
            hint="PDF, imagens, planilhas ou documentos. Também serão anexados à evolução."
          >
            <template #default>
              <UiFileDrop
                v-model="files"
                :disabled="aiLoading"
                label="Arraste arquivos aqui ou clique para escolher"
                hint="Laudos, escalas, registros de testes. Até 20 arquivos."
              />
            </template>
          </UiFormField>

          <p v-if="aiError" class="en-ai-msg en-ai-msg-error" role="status">{{ aiError }}</p>
          <p v-else-if="aiNotice" class="en-ai-msg" role="status">{{ aiNotice }}</p>

          <div class="en-ai-actions">
            <UiButton
              variant="subtle"
              type="button"
              :loading="aiLoading"
              :disabled="!canAskAi"
              @click="askAiDraft"
            >
              Gerar rascunho com IA
            </UiButton>
          </div>
        </div>
      </UiCard>

      <!-- Vínculo + classificação -->
      <UiCard title="Vínculo" subtitle="A quem e quando se refere esta evolução.">
        <UiFormSection :columns="2">
          <UiFormField
            label="Paciente"
            :required="true"
            :error="f.errors.patient_id"
            hint="Selecione o paciente atendido."
          >
            <template #default="{ id, describedBy }">
              <select
                :id="id"
                class="en-select"
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

          <UiFormField
            label="Tipo de evolução"
            :required="true"
            :error="f.errors.type"
            :hint="typeHint"
          >
            <template #default="{ id, describedBy }">
              <select
                :id="id"
                class="en-select"
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

          <UiFormField
            label="Data da evolução"
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

          <UiFormField
            label="Profissional"
            :error="f.errors.professional_id"
            :hint="professionalHint"
          >
            <template #default="{ id, describedBy }">
              <select
                v-if="professionalsState !== 'error'"
                :id="id"
                class="en-select"
                :aria-describedby="describedBy || undefined"
                :disabled="professionalsState === 'loading'"
                :value="f.values.professional_id"
                @change="f.setField('professional_id', $event.target.value)"
              >
                <option value="">
                  {{ professionalsState === 'loading' ? 'Carregando profissionais…' : '— Eu (responsável pelo registro)' }}
                </option>
                <option v-for="opt in professionalOptions" :key="opt.value" :value="opt.value">
                  {{ opt.label }}
                </option>
              </select>
              <!-- Fail-soft: lista de profissionais indisponível → texto livre (não bloqueia o registro). -->
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
        </UiFormSection>
      </UiCard>

      <!-- Conteúdo clínico -->
      <UiCard title="Conteúdo clínico" subtitle="A nota e os campos estruturados do atendimento.">
        <UiFormSection :columns="1">
          <UiFormField
            label="Nota clínica"
            :required="true"
            :error="f.errors.text"
            :hint="textHint"
            full-width
          >
            <template #default="{ id, describedBy }">
              <textarea
                :id="id"
                class="en-textarea"
                :aria-describedby="describedBy || undefined"
                :aria-required="true"
                :aria-invalid="f.errors.text ? 'true' : undefined"
                :value="f.values.text"
                rows="8"
                placeholder="Descreva a evolução: objetivos, condutas, resposta do paciente, encaminhamentos…"
                @input="f.setField('text', $event.target.value)"
              />
            </template>
          </UiFormField>
        </UiFormSection>

        <!-- Campos estruturados conforme o tipo selecionado -->
        <UiFormSection
          :title="structuredTitle"
          :description="structuredDescription"
          :columns="2"
        >
          <UiFormField
            v-for="field in structuredFields"
            :key="field.key"
            :label="field.label"
            :hint="field.hint"
            :full-width="field.full"
          >
            <template #default="{ id, describedBy }">
              <select
                v-if="field.type === 'enum'"
                :id="id"
                class="en-select"
                :aria-describedby="describedBy || undefined"
                :value="structured[field.key] || ''"
                @change="setStructured(field.key, $event.target.value)"
              >
                <option value="">—</option>
                <option v-for="opt in field.options" :key="opt.value" :value="opt.value">
                  {{ opt.label }}
                </option>
              </select>
              <textarea
                v-else-if="field.type === 'longtext'"
                :id="id"
                class="en-textarea en-textarea-sm"
                :aria-describedby="describedBy || undefined"
                :value="structured[field.key] || ''"
                rows="3"
                :placeholder="field.placeholder"
                @input="setStructured(field.key, $event.target.value)"
              />
              <UiInput
                v-else
                :id="id"
                :described-by="describedBy"
                :model-value="structured[field.key] || ''"
                :placeholder="field.placeholder"
                @update:model-value="setStructured(field.key, $event)"
              />
            </template>
          </UiFormField>
        </UiFormSection>
      </UiCard>

      <!-- Anexos vinculados à evolução -->
      <UiCard
        title="Anexos da evolução"
        subtitle="Laudos, escalas e registros de testes referenciados nesta evolução."
      >
        <UiFileDrop
          v-model="files"
          label="Arraste arquivos aqui ou clique para escolher"
          hint="Os mesmos arquivos podem alimentar o rascunho de IA acima."
        />
        <p class="en-files-note" role="status">
          {{ files.length === 0 ? 'Nenhum arquivo selecionado.' : filesCountLabel }}
        </p>
        <p class="en-files-note" role="note">
          A IA analisa o conteúdo dos arquivos para o rascunho. No registro fica a
          <strong>referência</strong> de cada anexo (nome, tamanho e tipo) — o conteúdo binário
          não é armazenado junto da evolução.
        </p>
      </UiCard>

      <!-- Modo de registro: síncrono (imediato) ou assíncrono (fila) -->
      <UiCard
        title="Registro"
        subtitle="Como esta evolução será gravada. O registro assíncrono usa a fila de processamento com idempotência."
      >
        <fieldset class="en-mode" aria-describedby="en-mode-hint">
          <legend class="en-mode-legend">Modo de gravação</legend>

          <label class="en-mode-opt" :data-active="mode === 'sync' ? 'true' : 'false'">
            <input
              class="en-radio"
              type="radio"
              name="en-mode"
              value="sync"
              :checked="mode === 'sync'"
              @change="mode = 'sync'"
            />
            <span class="en-mode-body">
              <span class="en-mode-title">Registrar agora</span>
              <span class="en-mode-desc">Grava a evolução imediatamente e abre o paciente.</span>
            </span>
          </label>

          <label class="en-mode-opt" :data-active="mode === 'async' ? 'true' : 'false'">
            <input
              class="en-radio"
              type="radio"
              name="en-mode"
              value="async"
              :checked="mode === 'async'"
              @change="mode = 'async'"
            />
            <span class="en-mode-body">
              <span class="en-mode-title">Processar em segundo plano</span>
              <span class="en-mode-desc">Enfileira o registro (idempotente) e libera a tela na hora.</span>
            </span>
          </label>
        </fieldset>
        <p id="en-mode-hint" class="en-mode-help">{{ modeHelp }}</p>
      </UiCard>

      <!-- Ações -->
      <div class="en-actions">
        <p class="en-hint">
          Campos marcados com <span class="en-req">*</span> são obrigatórios.
        </p>
        <div class="en-buttons">
          <UiButton variant="ghost" type="button" :disabled="f.submitting.value" @click="cancel">
            Cancelar
          </UiButton>
          <UiButton variant="primary" type="submit" :loading="f.submitting.value">
            {{ mode === 'async' ? 'Enfileirar evolução' : 'Registrar evolução' }}
          </UiButton>
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
} from '../ui/index.js';
import { resourceFactory, assistant } from '../api.js';

const router = useRouter();
const toast = useToast();
const askConfirm = useConfirm();

// ── Clientes de recurso (só endpoints REAIS) ─────────────────────────────────
const patientsApi = resourceFactory('patients');
const professionalsApi = resourceFactory('professionals');
// fila assíncrona (idempotência): POST /v1/consultation-notes
const consultationNotesApi = resourceFactory('consultation-notes');
// a criação por paciente usa um client dinâmico: /v1/patients/:id/evolution-notes
function notesApiFor(patientId) {
  return resourceFactory('patients/' + encodeURIComponent(patientId) + '/evolution-notes');
}

// ── Tipos de evolução ────────────────────────────────────────────────────────
const TYPE_LABELS = {
  session: 'Sessão / atendimento',
  test_result: 'Resultado de teste',
  intervention_plan: 'Plano de intervenção',
  observation: 'Observação',
};
const TYPE_HINTS = {
  session: 'Atendimento clínico padrão com condutas e resposta do paciente.',
  test_result: 'Aplicação e resultado de um teste ou escala.',
  intervention_plan: 'Plano de metas e estratégias de intervenção.',
  observation: 'Registro livre de observação clínica.',
};
const typeOptions = Object.keys(TYPE_LABELS).map((value) => ({ value, label: TYPE_LABELS[value] }));
const typeHint = computed(() => TYPE_HINTS[f.values.type] || 'Classifique o registro.');

// ── Campos estruturados por tipo (vão em structured_fields) ──────────────────
const STRUCTURED_BY_TYPE = {
  session: [
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
      hint: 'Eixo principal trabalhado.',
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
  test_result: [
    { key: 'test_name', label: 'Nome do teste', type: 'text', placeholder: 'Ex.: M-CHAT, Vineland…' },
    { key: 'score', label: 'Pontuação / resultado', type: 'text', placeholder: 'Ex.: 24 pts' },
    {
      key: 'interpretation',
      label: 'Interpretação',
      type: 'longtext',
      placeholder: 'Leitura clínica do resultado…',
      full: true,
    },
  ],
  intervention_plan: [
    {
      key: 'goals',
      label: 'Metas',
      type: 'longtext',
      placeholder: 'Objetivos terapêuticos…',
      full: true,
    },
    {
      key: 'strategies',
      label: 'Estratégias',
      type: 'longtext',
      placeholder: 'Técnicas e abordagens…',
      full: true,
    },
    {
      key: 'frequency',
      label: 'Frequência',
      type: 'enum',
      options: [
        { value: 'weekly', label: 'Semanal' },
        { value: 'biweekly', label: 'Quinzenal' },
        { value: 'monthly', label: 'Mensal' },
      ],
      hint: 'Cadência prevista das sessões.',
    },
  ],
  observation: [
    {
      key: 'context',
      label: 'Contexto',
      type: 'text',
      placeholder: 'Ex.: em sala, em casa (relato do responsável)…',
      full: true,
    },
  ],
};
const structuredFields = computed(() => STRUCTURED_BY_TYPE[f.values.type] || []);
const structuredTitle = computed(() => 'Campos de ' + (TYPE_LABELS[f.values.type] || 'evolução').toLowerCase());
const structuredDescription = computed(
  () =>
    structuredFields.value.length
      ? 'Detalhes estruturados conforme o tipo. Opcionais, mas enriquecem o prontuário.'
      : 'Este tipo não exige campos estruturados adicionais.',
);

// Valores estruturados (mapa reativo, serializado em structured_fields no submit).
const structured = reactive({});
function setStructured(key, value) {
  structured[key] = value;
}

// ── Pacientes ────────────────────────────────────────────────────────────────
const patientsState = ref('loading'); // loading | error | empty | ready
const patientsError = ref('Não foi possível carregar a lista de pacientes.');
const patientOptions = ref([]);

function patientLabel(p) {
  const name = p.full_name || p.name || ('Paciente #' + (p.id ?? '—'));
  return p.document ? name + ' · ' + p.document : name;
}

async function loadPatients() {
  patientsState.value = 'loading';
  try {
    const res = await patientsApi.list({ pageSize: 200, sort: 'full_name', dir: 'asc' });
    const rows = Array.isArray(res) ? res : res && res.data ? res.data : [];
    patientOptions.value = rows
      .filter((p) => p && (p.id !== undefined && p.id !== null))
      .map((p) => ({ value: String(p.id), label: patientLabel(p) }));
    patientsState.value = patientOptions.value.length ? 'ready' : 'empty';
  } catch (e) {
    patientsError.value = (e && e.message) || 'Não foi possível carregar a lista de pacientes.';
    patientsState.value = 'error';
  }
}

// ── Profissionais (select de domínio; fail-soft → texto livre se indisponível) ─
const professionalsState = ref('loading'); // loading | ready | empty | error
const professionalOptions = ref([]);
const professionalHint = computed(() => {
  if (professionalsState.value === 'loading') return 'Carregando a equipe…';
  if (professionalsState.value === 'error') return 'Não foi possível carregar a equipe; informe o identificador do profissional (opcional).';
  return 'Quem conduziu o atendimento. Em branco, registra você como responsável.';
});

function professionalLabel(p) {
  const name = p.full_name || p.name || ('Profissional #' + (p.id ?? '—'));
  return p.specialty ? name + ' · ' + p.specialty : (p.role ? name + ' · ' + p.role : name);
}

async function loadProfessionals() {
  professionalsState.value = 'loading';
  try {
    const res = await professionalsApi.list({ pageSize: 200, sort: 'full_name', dir: 'asc' });
    const rows = Array.isArray(res) ? res : res && res.data ? res.data : [];
    professionalOptions.value = rows
      .filter((p) => p && p.id !== undefined && p.id !== null)
      .map((p) => ({ value: String(p.id), label: professionalLabel(p) }));
    professionalsState.value = professionalOptions.value.length ? 'ready' : 'empty';
  } catch (_e) {
    // Fail-soft: o registro não depende da lista de profissionais (campo opcional).
    professionalOptions.value = [];
    professionalsState.value = 'error';
  }
}

// ── Formulário ───────────────────────────────────────────────────────────────
function defaultNoteDate() {
  // datetime-local: 'YYYY-MM-DDTHH:mm' no horário local, sem segundos.
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
    type: 'session',
    note_date: defaultNoteDate(),
    professional_id: '',
    text: '',
  },
  rules: {
    patient_id: [validators.required('Selecione o paciente.')],
    type: [validators.required('Selecione o tipo de evolução.')],
    note_date: [validators.required('Informe a data da evolução.')],
    text: [validators.required('Escreva a nota clínica.'), validators.minLen(3)],
  },
});

const textHint = computed(() => {
  const len = (f.values.text || '').length;
  return len ? len + ' caracteres' : 'Texto principal da evolução. Você pode partir do rascunho de IA.';
});

// ── Anexos ───────────────────────────────────────────────────────────────────
const files = ref([]);
const filesCountLabel = computed(() => {
  const n = files.value.length;
  return n === 1 ? '1 arquivo anexado.' : n + ' arquivos anexados.';
});

// ── Assistente de IA (fail-soft; nunca bloqueia o registro) ──────────────────
const aiPrompt = ref('');
const aiLoading = ref(false);
const aiError = ref('');
const aiNotice = ref('');
const aiUsed = ref(false);

const canAskAi = computed(() => !aiLoading.value && (aiPrompt.value.trim().length > 0 || files.value.length > 0));

const aiBadge = computed(() => {
  if (aiLoading.value) return { status: 'running', tone: 'running', label: 'Gerando…' };
  if (aiError.value) return { status: 'failed', tone: 'error', label: 'Indisponível' };
  if (aiUsed.value) return { status: 'succeeded', tone: 'success', label: 'Rascunho aplicado' };
  return { status: 'queued', tone: 'neutral', label: 'Opcional' };
});

function extractDraftText(result) {
  if (!result || typeof result !== 'object') return '';
  // Resposta da IA: { answer, sources, confidence, actions?: [rascunho] }
  if (typeof result.answer === 'string' && result.answer.trim()) return result.answer.trim();
  // Alternativa: ações de rascunho podem trazer um texto sugerido.
  const action = Array.isArray(result.actions) ? result.actions.find((a) => a && (a.text || a.draft)) : null;
  if (action) return String(action.text || action.draft || '').trim();
  return '';
}

async function askAiDraft() {
  if (!canAskAi.value) return;
  aiLoading.value = true;
  aiError.value = '';
  aiNotice.value = '';
  try {
    const typeLabel = TYPE_LABELS[f.values.type] || 'evolução';
    const intro =
      'Redija um rascunho de nota clínica do tipo "' +
      typeLabel +
      '" para registro de evolução de paciente, em português, objetivo e estruturado.';
    const detail = aiPrompt.value.trim() ? '\n\nContexto do atendimento:\n' + aiPrompt.value.trim() : '';
    const result = await assistant(intro + detail, files.value);
    const draft = extractDraftText(result);
    if (draft) {
      const hasText = (f.values.text || '').trim().length > 0;
      if (hasText) {
        const ok = await askConfirm({
          title: 'Substituir a nota atual?',
          message: 'Você já escreveu algo na nota clínica. Aplicar o rascunho da IA vai substituir o texto atual.',
          confirmLabel: 'Substituir',
        });
        if (!ok) {
          aiNotice.value = 'Rascunho descartado; sua nota foi mantida.';
          return;
        }
      }
      f.setField('text', draft);
      aiUsed.value = true;
      aiNotice.value = 'Rascunho aplicado à nota clínica. Revise antes de salvar.';
      toast.success('Rascunho gerado pela IA. Revise o conteúdo.');
    } else {
      aiNotice.value = 'A IA não retornou um rascunho utilizável. Escreva a nota manualmente.';
      toast.info('Sem rascunho utilizável da IA desta vez.');
    }
  } catch (e) {
    // Fail-soft: a IA é um auxílio. Qualquer falha não impede o registro manual.
    if (e && e.status === 503) {
      aiError.value = 'Assistente de IA indisponível no momento. Escreva a nota manualmente.';
    } else {
      aiError.value = (e && e.message) || 'Não foi possível gerar o rascunho. Escreva a nota manualmente.';
    }
    toast.warning('Assistente de IA indisponível. Você pode escrever a nota normalmente.');
  } finally {
    aiLoading.value = false;
  }
}

// ── Idempotência (1 evolução por tentativa; renovada após conflito) ──────────
function newIdempotencyKey() {
  try {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return 'evol-' + crypto.randomUUID();
  } catch (_e) {
    /* fallback abaixo */
  }
  return 'evol-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
}
const idempotencyKey = ref(newIdempotencyKey());

// ── Submit ───────────────────────────────────────────────────────────────────
const mode = ref('sync'); // sync | async

// Idempotência só é garantida ponta-a-ponta no caminho assíncrono (dedup por
// job_key + Idempotency-Key na fila). O caminho síncrono grava na hora; por isso
// o texto de ajuda é honesto sobre a diferença em vez de prometer dedup nos dois.
const modeHelp = computed(() =>
  mode.value === 'async'
    ? 'Reenviar a mesma submissão não duplica o registro: a fila deduplica pela chave de idempotência desta tentativa.'
    : 'O registro é gravado imediatamente. Evite reenviar a mesma evolução; se precisar de garantia contra duplicação, use "Processar em segundo plano".',
);

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

function buildStructuredPayload() {
  const out = {};
  for (const field of structuredFields.value) {
    const val = structured[field.key];
    if (val !== undefined && val !== null && String(val).trim() !== '') out[field.key] = val;
  }
  return Object.keys(out).length ? out : undefined;
}

async function submit() {
  await f.handleSubmit(async (vals) => {
    const structuredPayload = buildStructuredPayload();
    const payload = {
      type: vals.type,
      note_date: vals.note_date || null,
      professional_id: vals.professional_id ? vals.professional_id.trim() : null,
      text: vals.text.trim(),
    };
    if (structuredPayload) payload.structured_fields = structuredPayload;
    // Anexos: o backend de evolution-notes guarda apenas a REFERÊNCIA do arquivo
    // (nome/tamanho/tipo), não o binário. O conteúdo só é lido pela IA (via
    // assistant() multipart). A UI deixa isso explícito no card de anexos.
    if (files.value.length) {
      payload.attachments = files.value.map((file) => ({ filename: file.name, size: file.size, mime: file.type || '' }));
    }

    try {
      if (mode.value === 'async') {
        // Registro assíncrono via fila (idempotente): /v1/consultation-notes
        const job = await consultationNotesApi.create(
          { job_key: idempotencyKey.value, patient_id: vals.patient_id, note: payload },
          { idempotencyKey: idempotencyKey.value },
        );
        if (job && job.deduplicated) {
          toast.info('Esta evolução já havia sido enfileirada (idempotência).');
        } else {
          toast.success('Evolução enfileirada para processamento em segundo plano.');
        }
        router.push('/patients/' + vals.patient_id);
        return;
      }

      // Registro síncrono: /v1/patients/:patientId/evolution-notes
      const created = await notesApiFor(vals.patient_id).create(payload, { idempotencyKey: idempotencyKey.value });
      toast.success('Evolução registrada com sucesso.');
      const noteId = created && (created.id || (created.data && created.data.id));
      // Volta ao paciente (linha do tempo); fragmento ajuda a localizar a nota nova.
      router.push('/patients/' + vals.patient_id + (noteId ? '#evolution-' + noteId : ''));
    } catch (e) {
      if (e && (e.status === 401 || e.status === 403)) {
        toast.error('Sem permissão para registrar evoluções (perfil profissional necessário).');
        return;
      }
      if (e && e.status === 409) {
        // Conflito de idempotência → renova a chave para a próxima tentativa.
        idempotencyKey.value = newIdempotencyKey();
        toast.error(e.message || 'Esta evolução já foi registrada.');
        return;
      }
      if (e && e.status === 404) {
        toast.error('Paciente não encontrado. Atualize a lista e tente novamente.');
        return;
      }
      toast.error((e && e.message) || 'Não foi possível registrar a evolução.');
    }
  });
}

async function cancel() {
  if (isDirty()) {
    const ok = await askConfirm({
      title: 'Descartar evolução?',
      message: 'As informações preenchidas (e o rascunho da IA) serão perdidas.',
      confirmLabel: 'Descartar',
      danger: true,
    });
    if (!ok) return;
  }
  router.push('/patients');
}

onMounted(() => {
  loadPatients();
  loadProfessionals();
});
</script>

<style scoped>
.en-form {
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-5);
}

/* Assistente de IA */
.en-ai {
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-4);
}
.en-ai-actions {
  display: flex;
  justify-content: flex-end;
}
.en-ai-msg {
  margin: 0;
  font-size: var(--ui-text-sm);
  color: rgb(var(--ui-muted));
}
.en-ai-msg-error {
  color: rgb(var(--ui-danger));
}

/* Controles de formulário (select/textarea espelham o UiInput, --ui-* apenas) */
.en-select,
.en-textarea {
  background: rgb(var(--ui-bg));
  color: rgb(var(--ui-fg));
  border: 1px solid rgb(var(--ui-border-strong));
  border-radius: var(--ui-radius-sm);
  padding: var(--ui-space-2) var(--ui-space-3);
  font: inherit;
  font-size: var(--ui-text-md);
  width: 100%;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}
.en-select:focus,
.en-textarea:focus {
  outline: none;
  border-color: rgb(var(--ui-accent));
  box-shadow: 0 0 0 3px rgb(var(--ui-accent) / 0.15);
}
.en-select[aria-invalid='true'],
.en-textarea[aria-invalid='true'] {
  border-color: rgb(var(--ui-danger));
}
.en-textarea {
  min-height: 160px;
  resize: vertical;
  line-height: 1.5;
}
.en-textarea-sm {
  min-height: 84px;
}
.en-textarea::placeholder {
  color: rgb(var(--ui-faint));
}
.en-select:disabled,
.en-textarea:disabled {
  opacity: 0.55;
  cursor: not-allowed;
  background: rgb(var(--ui-surface-2));
}

.en-files-note {
  margin: var(--ui-space-3) 0 0;
  font-size: var(--ui-text-sm);
  color: rgb(var(--ui-muted));
}

/* Modo de registro (radios estilizados, CSP-safe) */
.en-mode {
  border: none;
  padding: 0;
  margin: 0;
  display: grid;
  gap: var(--ui-space-3);
  grid-template-columns: repeat(2, 1fr);
}
.en-mode-legend {
  padding: 0;
  margin-bottom: var(--ui-space-2);
  font-size: var(--ui-text-sm);
  font-weight: 600;
  color: rgb(var(--ui-fg));
}
.en-mode-opt {
  display: flex;
  align-items: flex-start;
  gap: var(--ui-space-2);
  padding: var(--ui-space-3);
  border: 1px solid rgb(var(--ui-border));
  border-radius: var(--ui-radius);
  background: rgb(var(--ui-surface));
  cursor: pointer;
  transition: border-color 0.15s ease, background 0.15s ease;
}
.en-mode-opt[data-active='true'] {
  border-color: rgb(var(--ui-accent));
  background: rgb(var(--ui-accent) / 0.06);
}
.en-radio {
  margin-top: var(--ui-space-1);
  accent-color: rgb(var(--ui-accent));
  flex: 0 0 auto;
}
.en-mode-body {
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-1);
}
.en-mode-title {
  font-weight: 600;
  color: rgb(var(--ui-fg));
  font-size: var(--ui-text-sm);
}
.en-mode-desc {
  color: rgb(var(--ui-muted));
  font-size: var(--ui-text-xs);
}
.en-mode-help {
  margin: var(--ui-space-3) 0 0;
  color: rgb(var(--ui-muted));
  font-size: var(--ui-text-xs);
}

/* Ações */
.en-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ui-space-4);
  flex-wrap: wrap;
  padding-top: var(--ui-space-2);
}
.en-hint {
  margin: 0;
  color: rgb(var(--ui-muted));
  font-size: var(--ui-text-sm);
}
.en-req {
  color: rgb(var(--ui-danger));
  font-weight: 700;
}
.en-buttons {
  display: flex;
  gap: var(--ui-space-2);
}

@media (max-width: 640px) {
  .en-mode {
    grid-template-columns: 1fr;
  }
  .en-actions {
    align-items: stretch;
  }
  .en-buttons {
    width: 100%;
  }
  .en-buttons :deep(.ui-btn) {
    flex: 1 1 auto;
  }
}
</style>
