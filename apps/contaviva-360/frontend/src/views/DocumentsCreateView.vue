<template>
  <UiPageLayout
    title="Enviar Documento"
    eyebrow="Documentos"
    subtitle="Faça upload de um documento e associe-o a uma entidade do sistema."
    width="narrow"
  >
    <template #actions>
      <UiButton variant="ghost" to="/documents">Voltar à lista</UiButton>
    </template>

    <form novalidate @submit.prevent="submit">
      <!-- Seção 1: Identificação do Documento -->
      <UiCard title="Identificação" subtitle="Informe o tipo e a competência do documento.">
        <UiFormSection title="Tipo e Competência" description="Campos obrigatórios marcados com *." :columns="2">

          <UiFormField label="Tipo de Documento" :required="true" :error="f.errors.tipo" hint="Ex.: Nota Fiscal, Contrato, Declaração." :full-width="true">
            <template #default="{ id: fid, describedBy }">
              <select
                :id="fid"
                :aria-describedby="describedBy"
                :aria-invalid="!!f.errors.tipo"
                :aria-required="true"
                class="doc-select"
                :data-error="!!f.errors.tipo"
                :value="f.values.tipo"
                @change="f.setField('tipo', $event.target.value)"
              >
                <option value="">Selecione um tipo…</option>
                <option v-for="opt in tipoOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
              </select>
            </template>
          </UiFormField>

          <UiFormField label="Mês" :error="f.errors.mes" hint="Mês de referência (1–12).">
            <template #default="{ id: fid, describedBy }">
              <select
                :id="fid"
                :aria-describedby="describedBy"
                :aria-invalid="!!f.errors.mes"
                class="doc-select"
                :data-error="!!f.errors.mes"
                :value="f.values.mes"
                @change="f.setField('mes', $event.target.value ? Number($event.target.value) : '')"
              >
                <option value="">Todos / N/A</option>
                <option v-for="m in meses" :key="m.value" :value="m.value">{{ m.label }}</option>
              </select>
            </template>
          </UiFormField>

          <UiFormField label="Ano" :error="f.errors.ano" hint="Ano de referência (ex.: 2024).">
            <template #default="{ id: fid, describedBy }">
              <UiInput
                :id="fid"
                type="number"
                inputmode="numeric"
                :described-by="describedBy"
                :error="!!f.errors.ano"
                :model-value="f.values.ano"
                placeholder="Ex.: 2024"
                :min="2000"
                :max="2099"
                @update:model-value="f.setField('ano', $event ? Number($event) : '')"
              />
            </template>
          </UiFormField>

          <UiFormField label="Status Inicial" hint="Status com que o documento será criado.">
            <template #default="{ id: fid, describedBy }">
              <select
                :id="fid"
                :aria-describedby="describedBy"
                class="doc-select"
                :value="f.values.status"
                @change="f.setField('status', $event.target.value)"
              >
                <option v-for="s in statusOptions" :key="s.value" :value="s.value">{{ s.label }}</option>
              </select>
            </template>
          </UiFormField>

        </UiFormSection>
      </UiCard>

      <!-- Seção 2: Entidade Associada -->
      <UiCard title="Entidade Associada" subtitle="Associe o documento a uma pessoa física ou jurídica (opcional).">
        <UiFormSection title="Vínculo de Entidade" description="Escolha o tipo e informe o ID da entidade." :columns="2">

          <UiFormField label="Tipo de Entidade" hint="Pessoa Física (PF) ou Pessoa Jurídica (PJ).">
            <template #default="{ id: fid }">
              <select
                :id="fid"
                class="doc-select"
                :value="f.values.entity_type"
                @change="onEntityTypeChange($event.target.value)"
              >
                <option value="">Sem vínculo</option>
                <option value="pf">Pessoa Física (PF)</option>
                <option value="pj">Pessoa Jurídica (PJ)</option>
              </select>
            </template>
          </UiFormField>

          <UiFormField
            label="ID da Entidade"
            :error="f.errors.entity_id"
            :hint="entityIdHint"
          >
            <template #default="{ id: fid, describedBy }">
              <div class="entity-search-wrap">
                <UiInput
                  :id="fid"
                  type="number"
                  inputmode="numeric"
                  :described-by="describedBy"
                  :error="!!f.errors.entity_id"
                  :model-value="f.values.entity_id"
                  :disabled="!f.values.entity_type"
                  placeholder="Informe o ID numérico…"
                  :min="1"
                  @update:model-value="onEntityIdInput($event)"
                />
                <UiButton
                  v-if="f.values.entity_type && f.values.entity_id"
                  variant="ghost"
                  size="sm"
                  type="button"
                  :loading="entitySearching"
                  :aria-label="`Verificar entidade ${f.values.entity_type?.toUpperCase()} ${f.values.entity_id}`"
                  @click="verifyEntity"
                >{{ resolveGlyph('check') }}</UiButton>
              </div>
            </template>
          </UiFormField>

        </UiFormSection>

        <!-- Resultado da busca inline de entidade -->
        <div v-if="entityResult" class="entity-result" :data-tone="entityResult.tone" role="status" aria-live="polite">
          <span class="entity-result-icon" aria-hidden="true">{{ entityResult.icon }}</span>
          <span class="entity-result-text">{{ entityResult.text }}</span>
          <UiButton v-if="entityResult.ok" variant="ghost" size="sm" type="button" aria-label="Limpar entidade selecionada" @click="clearEntity">×</UiButton>
        </div>

      </UiCard>

      <!-- Seção 3: Upload de Arquivo -->
      <UiCard title="Arquivo" subtitle="Arraste o arquivo ou clique para selecionar. Máximo de 1 arquivo por upload.">
        <UiFormSection title="Upload" description="Formatos aceitos: PDF, XML, imagens, documentos Office e planilhas." :columns="1">

          <UiFormField label="Arquivo do Documento" :required="true" :error="f.errors.arquivo" :full-width="true">
            <template #default>
              <UiFileDrop
                :model-value="files"
                accept=".pdf,.xml,.png,.jpg,.jpeg,.gif,.doc,.docx,.xls,.xlsx,.csv,.txt"
                :multiple="false"
                :max-files="1"
                label="Arraste o arquivo aqui ou clique para selecionar"
                hint="PDF, XML, imagens, planilhas, documentos Office — máx. 1 arquivo"
                @update:model-value="onFilesChange"
              />
            </template>
          </UiFormField>

          <!-- Preview do arquivo selecionado -->
          <div v-if="files.length" class="file-preview" role="region" aria-label="Arquivo selecionado">
            <div class="file-preview-row">
              <span class="file-preview-icon" aria-hidden="true">{{ resolveFileIcon(files[0]) }}</span>
              <div class="file-preview-info">
                <span class="file-preview-name">{{ files[0].name }}</span>
                <span class="file-preview-meta">{{ formatFileSize(files[0].size) }} · {{ files[0].type || 'tipo desconhecido' }}</span>
              </div>
              <UiStatusBadge status="pendente" label="Aguardando envio" with-dot />
            </div>
          </div>

        </UiFormSection>
      </UiCard>

      <!-- Rodapé de ações -->
      <div class="form-footer">
        <UiButton variant="ghost" type="button" @click="cancelCreate">Cancelar</UiButton>
        <UiButton
          type="submit"
          variant="primary"
          :loading="f.submitting.value"
          :disabled="f.submitting.value || !files.length || entitySearching.value"
        >
          Enviar Documento
        </UiButton>
      </div>
    </form>

  </UiPageLayout>
</template>

<script setup>
import { ref, computed } from 'vue';
import { useRouter } from 'vue-router';
import {
  UiPageLayout,
  UiCard,
  UiFormSection,
  UiFormField,
  UiInput,
  UiFileDrop,
  UiStatusBadge,
  UiButton,
  useForm,
  useToast,
  validators,
  resolveGlyph,
} from '../ui/index.js';
import { resourceFactory } from '../api.js';

// BASE_URL para chamadas multipart (criação com arquivo binário — envia o File real via FormData)
const API_BASE = import.meta.env.VITE_API_BASE_URL || '/contaviva-360/api';

// Recurso para verificação inline de entidade
const pfApi = resourceFactory('pf');
const pjApi = resourceFactory('pj');

const router = useRouter();
const toast = useToast();

// ── Opções de tipos de documento ────────────────────────────────────────────
const tipoOptions = [
  { value: 'nota_fiscal', label: 'Nota Fiscal' },
  { value: 'contrato', label: 'Contrato' },
  { value: 'declaracao', label: 'Declaração' },
  { value: 'recibo', label: 'Recibo' },
  { value: 'balancete', label: 'Balancete' },
  { value: 'folha_pagamento', label: 'Folha de Pagamento' },
  { value: 'guia_recolhimento', label: 'Guia de Recolhimento' },
  { value: 'extrato_bancario', label: 'Extrato Bancário' },
  { value: 'comprovante', label: 'Comprovante' },
  { value: 'outros', label: 'Outros' },
];

const meses = [
  { value: 1, label: 'Janeiro' },
  { value: 2, label: 'Fevereiro' },
  { value: 3, label: 'Março' },
  { value: 4, label: 'Abril' },
  { value: 5, label: 'Maio' },
  { value: 6, label: 'Junho' },
  { value: 7, label: 'Julho' },
  { value: 8, label: 'Agosto' },
  { value: 9, label: 'Setembro' },
  { value: 10, label: 'Outubro' },
  { value: 11, label: 'Novembro' },
  { value: 12, label: 'Dezembro' },
];

const statusOptions = [
  { value: 'pendente', label: 'Pendente' },
  { value: 'em_analise', label: 'Em análise' },
  { value: 'aprovado', label: 'Aprovado' },
  { value: 'rejeitado', label: 'Rejeitado' },
];

// ── Formulário ───────────────────────────────────────────────────────────────
const currentYear = new Date().getFullYear();

const f = useForm({
  initial: {
    tipo: '',
    entity_type: '',
    entity_id: '',
    mes: '',
    ano: currentYear,
    status: 'pendente',
    arquivo: '', // usado apenas para validação
  },
  rules: {
    tipo: [validators.required('Selecione o tipo do documento')],
    entity_id: [validators.numeric('ID deve ser numérico'), validators.min(1, 'ID deve ser maior que zero')],
    ano: [
      validators.numeric('Informe um ano válido'),
      validators.min(2000, 'Ano a partir de 2000'),
      validators.max(2099, 'Ano até 2099'),
    ],
    arquivo: [validators.required('Selecione um arquivo para upload')],
  },
});

// ── Upload de arquivo ────────────────────────────────────────────────────────
const files = ref([]);

function onFilesChange(newFiles) {
  files.value = newFiles;
  if (newFiles.length) {
    f.setField('arquivo', newFiles[0].name);
  } else {
    f.setField('arquivo', '');
  }
}

function formatFileSize(bytes) {
  if (!bytes) return '0 B';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1048576) return (bytes / 1024).toFixed(0) + ' KB';
  return (bytes / 1048576).toFixed(1) + ' MB';
}

function resolveFileIcon(file) {
  if (!file) return resolveGlyph('doc');
  const name = (file.name || '').toLowerCase();
  const type = (file.type || '').toLowerCase();
  if (name.endsWith('.pdf') || type.includes('pdf')) return resolveGlyph('invoice');
  if (name.endsWith('.xml') || type.includes('xml')) return resolveGlyph('list');
  if (type.startsWith('image/')) return resolveGlyph('pin');
  if (name.match(/\.(xls|xlsx|csv)$/)) return resolveGlyph('chart');
  if (name.match(/\.(doc|docx)$/)) return resolveGlyph('doc');
  return resolveGlyph('doc');
}

// ── Verificação inline de entidade ──────────────────────────────────────────
const entitySearching = ref(false);
const entityResult = ref(null);

const entityIdHint = computed(() => {
  if (!f.values.entity_type) return 'Selecione o tipo de entidade primeiro.';
  return `ID numérico da ${f.values.entity_type === 'pf' ? 'Pessoa Física' : 'Pessoa Jurídica'}.`;
});

function onEntityTypeChange(value) {
  f.setField('entity_type', value);
  f.setField('entity_id', '');
  entityResult.value = null;
}

function onEntityIdInput(value) {
  f.setField('entity_id', value ? Number(value) : '');
  entityResult.value = null;
}

async function verifyEntity() {
  if (!f.values.entity_type || !f.values.entity_id) return;
  entitySearching.value = true;
  entityResult.value = null;
  try {
    const api = f.values.entity_type === 'pf' ? pfApi : pjApi;
    const data = await api.get(f.values.entity_id);
    const label = data.nome || data.razao_social || data.name || ('ID ' + f.values.entity_id);
    entityResult.value = {
      ok: true,
      tone: 'success',
      icon: resolveGlyph('check'),
      text: `${f.values.entity_type === 'pf' ? 'PF' : 'PJ'} encontrada: ${label}`,
    };
  } catch (e) {
    const is404 = e && e.status === 404;
    entityResult.value = {
      ok: false,
      tone: 'danger',
      icon: resolveGlyph('warn'),
      text: is404
        ? `Nenhuma entidade ${f.values.entity_type?.toUpperCase()} encontrada com ID ${f.values.entity_id}.`
        : (e.message || 'Erro ao verificar entidade.'),
    };
  } finally {
    entitySearching.value = false;
  }
}

function clearEntity() {
  f.setField('entity_type', '');
  f.setField('entity_id', '');
  entityResult.value = null;
}

// ── Submissão ────────────────────────────────────────────────────────────────
async function submit() {
  await f.handleSubmit(async (vals) => {
    const file = files.value[0];
    if (!file) {
      toast.error('Selecione um arquivo para enviar.');
      return;
    }

    // Envia o arquivo via multipart/form-data para que o backend receba o binário.
    // O browser seta Content-Type com o boundary automaticamente (não definir manualmente).
    const fd = new FormData();
    fd.append('file', file, file.name);
    fd.append('tipo', vals.tipo);
    fd.append('status', vals.status || 'pendente');
    if (vals.entity_type) fd.append('entity_type', vals.entity_type);
    if (vals.entity_id) fd.append('entity_id', String(Number(vals.entity_id)));
    if (vals.mes) fd.append('mes', String(Number(vals.mes)));
    if (vals.ano) fd.append('ano', String(Number(vals.ano)));

    try {
      const res = await fetch(API_BASE + '/v1/documents', { method: 'POST', body: fd });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const e = new Error((data && data.error && data.error.message) || ('HTTP ' + res.status));
        e.status = res.status;
        throw e;
      }
      const created = data;
      toast.success('Documento enviado com sucesso.');
      const id = created && (created.id || (created.data && created.data.id));
      if (id) {
        router.push('/documents/' + id);
      } else {
        router.push('/documents');
      }
    } catch (e) {
      toast.error(e.message || 'Erro ao enviar o documento. Tente novamente.');
    }
  });
}

function cancelCreate() {
  router.push('/documents');
}
</script>

<style scoped>
/* ── Select nativo com tokens --ui-* ────────────────────────────────────── */
.doc-select {
  background: rgb(var(--ui-bg));
  color: rgb(var(--ui-fg));
  border: 1px solid rgb(var(--ui-border-strong));
  border-radius: var(--ui-radius-sm);
  padding: var(--ui-space-2) var(--ui-space-3);
  font: inherit;
  font-size: var(--ui-text-md);
  width: 100%;
  cursor: pointer;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
  appearance: auto;
}

.doc-select:focus {
  outline: none;
  border-color: rgb(var(--ui-accent));
  box-shadow: 0 0 0 3px rgb(var(--ui-accent) / 0.15);
}

.doc-select[data-error="true"] {
  border-color: rgb(var(--ui-danger));
}

.doc-select[data-error="true"]:focus {
  box-shadow: 0 0 0 3px rgb(var(--ui-danger) / 0.15);
}

.doc-select:disabled {
  opacity: 0.55;
  cursor: not-allowed;
  background: rgb(var(--ui-surface-2));
}

/* ── Busca inline de entidade ────────────────────────────────────────────── */
.entity-search-wrap {
  display: flex;
  align-items: center;
  gap: var(--ui-space-2);
}

/* ── Resultado da busca de entidade ─────────────────────────────────────── */
.entity-result {
  display: flex;
  align-items: center;
  gap: var(--ui-space-2);
  padding: var(--ui-space-3) var(--ui-space-4);
  border-radius: var(--ui-radius-md);
  font-size: var(--ui-text-sm);
  border: 1px solid;
  margin-top: var(--ui-space-1);
}

.entity-result[data-tone="success"] {
  background: rgb(var(--ui-ok) / 0.08);
  border-color: rgb(var(--ui-ok) / 0.3);
  color: rgb(var(--ui-fg));
}

.entity-result[data-tone="danger"] {
  background: rgb(var(--ui-danger) / 0.08);
  border-color: rgb(var(--ui-danger) / 0.3);
  color: rgb(var(--ui-fg));
}

.entity-result-icon {
  font-size: var(--ui-text-md);
  flex-shrink: 0;
}

.entity-result-text {
  flex: 1;
}

/* ── Preview do arquivo ──────────────────────────────────────────────────── */
.file-preview {
  padding: var(--ui-space-3) var(--ui-space-4);
  background: rgb(var(--ui-surface));
  border: 1px solid rgb(var(--ui-border));
  border-radius: var(--ui-radius-md);
}

.file-preview-row {
  display: flex;
  align-items: center;
  gap: var(--ui-space-3);
  flex-wrap: wrap;
}

.file-preview-icon {
  font-size: var(--ui-text-xl);
  line-height: 1;
  flex-shrink: 0;
}

.file-preview-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 1;
  min-width: 0;
}

.file-preview-name {
  font-weight: 600;
  font-size: var(--ui-text-sm);
  color: rgb(var(--ui-fg));
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.file-preview-meta {
  font-size: var(--ui-text-xs);
  color: rgb(var(--ui-muted));
}

/* ── Rodapé de ações ─────────────────────────────────────────────────────── */
.form-footer {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: var(--ui-space-2);
  padding-top: var(--ui-space-2);
}

@media (max-width: 640px) {
  .form-footer {
    flex-direction: column-reverse;
  }

  .entity-search-wrap {
    flex-direction: column;
    align-items: stretch;
  }
}
</style>
