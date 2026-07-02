<template>
  <UiPageLayout
    title="Nova Obrigação Fiscal"
    eyebrow="Obrigações Fiscais"
    subtitle="Preencha os dados para registrar uma nova obrigação fiscal. Vencimentos próximos geram alertas automáticos."
    width="narrow"
    :loading="f.submitting.value"
    loading-message="Salvando obrigação…"
    :error="submitError"
    :retryable="false"
  >
    <template #actions>
      <UiButton variant="ghost" to="/fiscal-obligations">Voltar para lista</UiButton>
    </template>

    <!-- Banner de alerta quando vencimento está próximo (≤ 7 dias) -->
    <template v-if="alertaBanner" #banner>
      <div class="alert-banner" role="alert" aria-live="polite">
        <span class="alert-banner-icon" aria-hidden="true">⚠</span>
        <span class="alert-banner-msg">
          Atenção: o vencimento informado está em <strong>{{ diasParaVencer }}</strong> dia(s).
          Um alerta será agendado automaticamente ao salvar.
        </span>
      </div>
    </template>

    <form novalidate @submit.prevent="submit">
      <!-- ── Seção 1: Identificação da Obrigação ── -->
      <UiCard
        title="Identificação da Obrigação"
        subtitle="Tipo, vencimento e periodicidade da obrigação fiscal."
      >
        <UiFormSection :columns="2">
          <!-- Tipo -->
          <UiFormField
            label="Tipo de Obrigação"
            :required="true"
            :error="f.errors.tipo"
            hint="Selecione o tipo de declaração ou recolhimento."
          >
            <template #default="{ id, describedBy }">
              <select
                :id="id"
                :aria-describedby="describedBy"
                :aria-required="true"
                :aria-invalid="!!f.errors.tipo ? 'true' : undefined"
                :value="f.values.tipo"
                :data-error="!!f.errors.tipo"
                @change="f.setField('tipo', $event.target.value)"
              >
                <option value="">Selecione o tipo…</option>
                <option v-for="t in TIPOS" :key="t" :value="t">{{ t }}</option>
              </select>
            </template>
          </UiFormField>

          <!-- Data de Vencimento -->
          <UiFormField
            label="Data de Vencimento"
            :required="true"
            :error="f.errors.data_vencimento"
            hint="Data-limite para entrega ou recolhimento."
          >
            <template #default="{ id, describedBy }">
              <UiInput
                :id="id"
                :described-by="describedBy"
                type="date"
                :model-value="f.values.data_vencimento"
                :error="!!f.errors.data_vencimento"
                :required="true"
                @update:model-value="onDataVencimento($event)"
              />
            </template>
          </UiFormField>

          <!-- Periodicidade -->
          <UiFormField
            label="Periodicidade"
            :error="f.errors.periodicidade"
            hint="Com que frequência esta obrigação se repete."
          >
            <template #default="{ id, describedBy }">
              <select
                :id="id"
                :aria-describedby="describedBy"
                :value="f.values.periodicidade"
                :data-error="!!f.errors.periodicidade"
                @change="f.setField('periodicidade', $event.target.value)"
              >
                <option value="">Não recorrente / único</option>
                <option v-for="p in PERIODICIDADES" :key="p.value" :value="p.value">{{ p.label }}</option>
              </select>
            </template>
          </UiFormField>

          <!-- Valor Estimado -->
          <UiFormField
            label="Valor Estimado (R$)"
            :error="f.errors.valor_estimado"
            hint="Valor aproximado do tributo ou encargo. Use ponto ou vírgula para decimais."
          >
            <template #default="{ id, describedBy }">
              <div class="currency-row">
                <span class="currency-prefix" aria-hidden="true">R$</span>
                <UiInput
                  :id="id"
                  :described-by="describedBy"
                  :model-value="valorEstimadoDisplay"
                  placeholder="0,00"
                  inputmode="decimal"
                  autocomplete="off"
                  :error="!!f.errors.valor_estimado"
                  @update:model-value="onValorInput($event)"
                  @change="onValorChange($event)"
                />
              </div>
            </template>
          </UiFormField>
        </UiFormSection>
      </UiCard>

      <!-- ── Seção 2: Entidade Vinculada ── -->
      <UiCard
        title="Entidade Vinculada"
        subtitle="Pessoa física ou jurídica responsável por esta obrigação."
      >
        <UiFormSection :columns="2">
          <!-- Tipo de Entidade -->
          <UiFormField
            label="Tipo de Entidade"
            :required="true"
            :error="f.errors.entidade_tipo"
          >
            <template #default="{ id, describedBy }">
              <div class="entity-type-group" role="group" :aria-labelledby="id + '-legend'">
                <span :id="id + '-legend'" class="visually-hidden">Tipo de entidade</span>
                <label
                  class="entity-type-opt"
                  :data-selected="f.values.entidade_tipo === 'PF'"
                >
                  <input
                    type="radio"
                    name="entidade_tipo"
                    value="PF"
                    :checked="f.values.entidade_tipo === 'PF'"
                    :aria-describedby="describedBy"
                    @change="onEntidadeTipo('PF')"
                  />
                  <span class="entity-type-icon" aria-hidden="true">👤</span>
                  <span class="entity-type-text">
                    <strong>Pessoa Física</strong>
                    <small>CPF / Contribuinte PF</small>
                  </span>
                </label>
                <label
                  class="entity-type-opt"
                  :data-selected="f.values.entidade_tipo === 'PJ'"
                >
                  <input
                    type="radio"
                    name="entidade_tipo"
                    value="PJ"
                    :checked="f.values.entidade_tipo === 'PJ'"
                    :aria-describedby="describedBy"
                    @change="onEntidadeTipo('PJ')"
                  />
                  <span class="entity-type-icon" aria-hidden="true">🏢</span>
                  <span class="entity-type-text">
                    <strong>Pessoa Jurídica</strong>
                    <small>CNPJ / Empresa</small>
                  </span>
                </label>
              </div>
            </template>
          </UiFormField>

          <!-- EntityPicker: busca dinâmica conforme tipo selecionado -->
          <UiFormField
            :label="f.values.entidade_tipo === 'PJ' ? 'Empresa (Pessoa Jurídica)' : 'Contribuinte (Pessoa Física)'"
            :error="f.errors.entidade_id"
            :hint="f.values.entidade_tipo
              ? (pickerLoading ? 'Buscando…' : 'Digite para buscar na lista de ' + (f.values.entidade_tipo === 'PJ' ? 'empresas' : 'pessoas físicas') + '.')
              : 'Selecione primeiro o tipo de entidade.'"
          >
            <template #default="{ id, describedBy }">
              <div class="picker-wrap">
                <UiInput
                  :id="id"
                  :described-by="describedBy"
                  :model-value="pickerQuery"
                  :placeholder="f.values.entidade_tipo
                    ? (f.values.entidade_tipo === 'PJ' ? 'Buscar empresa…' : 'Buscar pessoa física…')
                    : 'Selecione o tipo de entidade primeiro'"
                  :disabled="!f.values.entidade_tipo || pickerLoading"
                  autocomplete="off"
                  :error="!!f.errors.entidade_id"
                  @update:model-value="onPickerQuery($event)"
                />
                <span v-if="pickerLoading" role="status" aria-label="Buscando entidades…" class="picker-spinner" />
                <ul
                  v-if="pickerResults.length && !selectedEntity"
                  class="picker-dropdown"
                  role="listbox"
                  :aria-label="'Resultados de busca de ' + (f.values.entidade_tipo === 'PJ' ? 'empresas' : 'pessoas físicas')"
                >
                  <li
                    v-for="item in pickerResults"
                    :key="item.id"
                    class="picker-item"
                    role="option"
                    tabindex="0"
                    @click="selectEntity(item)"
                    @keydown.enter.space.prevent="selectEntity(item)"
                  >
                    <span class="picker-item-name">{{ item.nome || item.razao_social || ('ID ' + item.id) }}</span>
                    <span v-if="item.cpf || item.cnpj" class="picker-item-doc">
                      {{ item.cpf ? formatDoc(item.cpf, 'cpf') : formatDoc(item.cnpj, 'cnpj') }}
                    </span>
                  </li>
                </ul>
                <!-- Entidade selecionada: chip removível -->
                <div v-if="selectedEntity" class="picker-selected">
                  <span class="picker-selected-name">{{ selectedEntity.nome || selectedEntity.razao_social || ('ID ' + selectedEntity.id) }}</span>
                  <span v-if="selectedEntity.cpf || selectedEntity.cnpj" class="picker-selected-doc">
                    {{ selectedEntity.cpf ? formatDoc(selectedEntity.cpf, 'cpf') : formatDoc(selectedEntity.cnpj, 'cnpj') }}
                  </span>
                  <button
                    type="button"
                    class="picker-clear"
                    aria-label="Remover entidade selecionada"
                    @click="clearEntity"
                  >×</button>
                </div>
              </div>
            </template>
          </UiFormField>
        </UiFormSection>
      </UiCard>

      <!-- ── Seção 3: Descrição / Observações ── -->
      <UiCard
        title="Observações"
        subtitle="Informações complementares sobre esta obrigação fiscal."
      >
        <UiFormSection :columns="1">
          <UiFormField
            label="Descrição"
            :error="f.errors.descricao"
            hint="Contexto adicional, referências, observações internas."
            :full-width="true"
          >
            <template #default="{ id, describedBy }">
              <textarea
                :id="id"
                :aria-describedby="describedBy"
                :value="f.values.descricao"
                class="descricao-textarea"
                rows="4"
                placeholder="Ex.: Declaração anual de ajuste — competência 2025. Referência processo nº 1234/2025."
                maxlength="2000"
                @input="f.setField('descricao', $event.target.value)"
              />
              <span class="char-count" aria-live="polite">
                {{ (f.values.descricao || '').length }}/2000
              </span>
            </template>
          </UiFormField>
        </UiFormSection>
      </UiCard>

      <!-- ── Ações ── -->
      <div class="form-actions">
        <UiButton variant="ghost" type="button" :disabled="f.submitting.value" @click="cancel">
          Cancelar
        </UiButton>
        <UiButton type="submit" variant="primary" :loading="f.submitting.value">
          Salvar Obrigação
        </UiButton>
      </div>
    </form>
  </UiPageLayout>
</template>

<script setup>
import { ref, computed, watch } from 'vue';
import { useRouter } from 'vue-router';
import {
  UiPageLayout,
  UiCard,
  UiFormSection,
  UiFormField,
  UiInput,
  UiButton,
  useForm,
  useToast,
  validators,
} from '../ui/index.js';
import { resourceFactory } from '../api.js';

// ── API ───────────────────────────────────────────────────────────────────────
const fiscalObligations = resourceFactory('fiscal-obligations');
const pfApi = resourceFactory('pf');
const pjApi = resourceFactory('pj');

// ── Router / Toast ────────────────────────────────────────────────────────────
const router = useRouter();
const toast = useToast();

// ── Estado de UI ──────────────────────────────────────────────────────────────
const submitError = ref(null);

// ── Constantes de domínio ─────────────────────────────────────────────────────
const TIPOS = [
  'IRPF', 'IRPJ', 'ICMS', 'ISS', 'DARF', 'ECF', 'ECD',
  'e-Social', 'CAGED', 'Simples DAS', 'PER', 'DIRF', 'RRA', 'outro',
];

const PERIODICIDADES = [
  { value: 'mensal', label: 'Mensal' },
  { value: 'trimestral', label: 'Trimestral' },
  { value: 'anual', label: 'Anual' },
];

// ── Formulário ────────────────────────────────────────────────────────────────
const f = useForm({
  initial: {
    tipo: '',
    data_vencimento: '',
    periodicidade: '',
    entidade_tipo: '',
    entidade_id: '',
    valor_estimado: '',
    descricao: '',
  },
  rules: {
    tipo: [validators.required('Selecione o tipo de obrigação')],
    data_vencimento: [validators.required('Informe a data de vencimento')],
    entidade_tipo: [validators.required('Selecione o tipo de entidade (PF ou PJ)')],
    entidade_id: [validators.required('Selecione a entidade vinculada')],
  },
});

// ── Banner de alerta de vencimento próximo ────────────────────────────────────
const diasParaVencer = computed(() => {
  if (!f.values.data_vencimento) return null;
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const venc = new Date(f.values.data_vencimento + 'T00:00:00');
  if (isNaN(venc.getTime())) return null;
  return Math.ceil((venc - hoje) / (1000 * 60 * 60 * 24));
});

const alertaBanner = computed(() => {
  const d = diasParaVencer.value;
  return d !== null && d >= 0 && d <= 7;
});

// ── Campo Valor Estimado ──────────────────────────────────────────────────────
const valorEstimadoDisplay = ref('');

function onValorInput(val) {
  // Permite digitação livre; normaliza somente no blur (onValorChange)
  valorEstimadoDisplay.value = val;
}

function onValorChange(val) {
  // Normaliza: troca . de milhar por nada, vírgula decimal por ponto
  const normalized = String(val).replace(/\./g, '').replace(',', '.');
  const n = parseFloat(normalized);
  if (val === '' || val === null || val === undefined) {
    f.setField('valor_estimado', '');
    valorEstimadoDisplay.value = '';
  } else if (isFinite(n) && n >= 0) {
    f.setField('valor_estimado', String(n));
    // Reformata para pt-BR na exibição
    valorEstimadoDisplay.value = new Intl.NumberFormat('pt-BR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(n);
  } else {
    f.setField('valor_estimado', '');
    valorEstimadoDisplay.value = '';
    toast.warning('Valor estimado inválido. Informe um número positivo.');
  }
}

// ── Data de Vencimento ────────────────────────────────────────────────────────
function onDataVencimento(val) {
  f.setField('data_vencimento', val);
}

// ── EntityPicker ──────────────────────────────────────────────────────────────
const pickerQuery = ref('');
const pickerResults = ref([]);
const pickerLoading = ref(false);
const selectedEntity = ref(null);
let debounceTimer = null;

function onEntidadeTipo(tipo) {
  f.setField('entidade_tipo', tipo);
  // Limpa seleção anterior ao mudar tipo
  clearEntity();
  pickerResults.value = [];
  pickerQuery.value = '';
}

function onPickerQuery(val) {
  pickerQuery.value = val;
  selectedEntity.value = null;
  f.setField('entidade_id', '');
  clearTimeout(debounceTimer);
  if (!val || val.trim().length < 2) {
    pickerResults.value = [];
    return;
  }
  debounceTimer = setTimeout(() => searchEntities(val.trim()), 300);
}

async function searchEntities(q) {
  pickerLoading.value = true;
  pickerResults.value = [];
  try {
    const api = f.values.entidade_tipo === 'PJ' ? pjApi : pfApi;
    const res = await api.list({ q, pageSize: 10 });
    const items = Array.isArray(res) ? res : (res.data || []);
    pickerResults.value = items;
  } catch {
    pickerResults.value = [];
    toast.error('Não foi possível buscar entidades. Tente novamente.');
  } finally {
    pickerLoading.value = false;
  }
}

function selectEntity(item) {
  selectedEntity.value = item;
  f.setField('entidade_id', item.id);
  pickerQuery.value = '';
  pickerResults.value = [];
}

function clearEntity() {
  selectedEntity.value = null;
  f.setField('entidade_id', '');
  pickerQuery.value = '';
  pickerResults.value = [];
}

// Reseta picker ao trocar tipo de entidade (já coberto em onEntidadeTipo)
watch(() => f.values.entidade_tipo, () => {
  if (!selectedEntity.value) return;
  clearEntity();
});

// ── Formatação de documento ────────────────────────────────────────────────────
function formatDoc(value, kind) {
  if (!value) return '';
  const d = String(value).replace(/\D/g, '');
  if (kind === 'cpf' && d.length === 11) {
    return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
  }
  if (kind === 'cnpj' && d.length === 14) {
    return d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
  }
  return value;
}

// ── Submit ────────────────────────────────────────────────────────────────────
function submit() {
  submitError.value = null;
  f.handleSubmit(async (vals) => {
    try {
      const payload = {
        tipo: vals.tipo,
        data_vencimento: vals.data_vencimento,
        entidade_tipo: vals.entidade_tipo,
        ...(vals.periodicidade ? { periodicidade: vals.periodicidade } : {}),
        ...(vals.entidade_id ? { entidade_id: Number(vals.entidade_id) } : {}),
        ...(vals.valor_estimado !== '' && vals.valor_estimado !== undefined
          ? { valor_estimado: Number(vals.valor_estimado) }
          : {}),
        ...(vals.descricao && vals.descricao.trim() ? { descricao: vals.descricao.trim() } : {}),
      };

      const created = await fiscalObligations.create(payload);
      toast.success('Obrigação fiscal cadastrada com sucesso!' + (alertaBanner.value ? ' Alerta de vencimento agendado.' : ''));

      const id = created && (created.id || (created.data && created.data.id));
      if (id) {
        router.push('/fiscal-obligations/' + id);
      } else {
        router.push('/fiscal-obligations');
      }
    } catch (e) {
      const msg = e.message || 'Erro ao salvar obrigação. Tente novamente.';
      submitError.value = msg;
      toast.error(msg);
    }
  });
}

function cancel() {
  router.push('/fiscal-obligations');
}
</script>

<style scoped>
/* ── Layout do formulário ──────────────────────────────────────────────────── */
form {
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-4);
}

/* ── Banner de alerta de vencimento próximo ───────────────────────────────── */
.alert-banner {
  display: flex;
  align-items: center;
  gap: var(--ui-space-3);
  padding: var(--ui-space-3) var(--ui-space-4);
  background: rgb(var(--ui-warning) / 0.12);
  border: 1px solid rgb(var(--ui-warning) / 0.4);
  border-radius: var(--ui-radius-md);
  font-size: var(--ui-text-sm);
  color: rgb(var(--ui-fg));
}

.alert-banner-icon {
  font-size: var(--ui-text-base);
  flex-shrink: 0;
  color: rgb(var(--ui-warning));
}

.alert-banner-msg strong {
  font-weight: 700;
}

/* ── Selects: herdam estilos do kit via UiFormField :deep ─────────────────── */
select {
  background: rgb(var(--ui-bg));
  color: rgb(var(--ui-fg));
  border: 1px solid rgb(var(--ui-border-strong));
  border-radius: var(--ui-radius-sm);
  padding: var(--ui-space-2) var(--ui-space-3);
  font: inherit;
  font-size: var(--ui-text-md);
  width: 100%;
  appearance: auto;
  cursor: pointer;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}

select:focus {
  outline: none;
  border-color: rgb(var(--ui-accent));
  box-shadow: 0 0 0 3px rgb(var(--ui-accent) / 0.15);
}

select[data-error="true"] {
  border-color: rgb(var(--ui-danger));
}

select[data-error="true"]:focus {
  box-shadow: 0 0 0 3px rgb(var(--ui-danger) / 0.15);
}

/* ── Campo valor com prefixo R$ ───────────────────────────────────────────── */
.currency-row {
  display: flex;
  align-items: center;
  gap: 0;
}

.currency-prefix {
  display: flex;
  align-items: center;
  padding: var(--ui-space-2) var(--ui-space-3);
  background: rgb(var(--ui-surface-2));
  border: 1px solid rgb(var(--ui-border-strong));
  border-right: none;
  border-radius: var(--ui-radius-sm) 0 0 var(--ui-radius-sm);
  font-size: var(--ui-text-sm);
  font-weight: 600;
  color: rgb(var(--ui-muted));
  white-space: nowrap;
  flex-shrink: 0;
}

.currency-row :deep(.ui-input) {
  border-radius: 0 var(--ui-radius-sm) var(--ui-radius-sm) 0;
}

/* ── Entity Type Picker (radio estilizado) ────────────────────────────────── */
.entity-type-group {
  display: flex;
  gap: var(--ui-space-3);
  flex-wrap: wrap;
}

.entity-type-opt {
  flex: 1;
  min-width: 130px;
  display: flex;
  align-items: center;
  gap: var(--ui-space-2);
  padding: var(--ui-space-3) var(--ui-space-3);
  border: 2px solid rgb(var(--ui-border-strong));
  border-radius: var(--ui-radius-md);
  cursor: pointer;
  transition: border-color 0.15s ease, background 0.15s ease, box-shadow 0.15s ease;
  background: rgb(var(--ui-bg));
  user-select: none;
}

.entity-type-opt input[type="radio"] {
  position: absolute;
  opacity: 0;
  pointer-events: none;
  width: 0;
  height: 0;
}

.entity-type-opt:hover {
  border-color: rgb(var(--ui-accent));
  background: rgb(var(--ui-accent) / 0.05);
}

.entity-type-opt[data-selected="true"] {
  border-color: rgb(var(--ui-accent));
  background: rgb(var(--ui-accent) / 0.08);
  box-shadow: 0 0 0 3px rgb(var(--ui-accent) / 0.15);
}

.entity-type-opt:has(input[type="radio"]:focus-visible) {
  outline: 2px solid rgb(var(--ui-accent));
  outline-offset: 2px;
}

.entity-type-icon {
  font-size: var(--ui-text-xl);
  flex-shrink: 0;
}

.entity-type-text {
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-1);
}

.entity-type-text strong {
  font-size: var(--ui-text-sm);
  font-weight: 600;
  color: rgb(var(--ui-fg));
}

.entity-type-text small {
  font-size: var(--ui-text-xs);
  color: rgb(var(--ui-muted));
}

/* ── EntityPicker: input + dropdown ──────────────────────────────────────── */
.picker-wrap {
  position: relative;
}

.picker-spinner {
  position: absolute;
  right: var(--ui-space-3);
  top: 50%;
  transform: translateY(-50%);
  display: inline-block;
  width: var(--ui-space-4);
  height: var(--ui-space-4);
  border: 2px solid rgb(var(--ui-border-strong));
  border-top-color: rgb(var(--ui-accent));
  border-radius: 50%;
  animation: spin 0.65s linear infinite;
  pointer-events: none;
}

@keyframes spin {
  to { transform: translateY(-50%) rotate(360deg); }
}

.picker-dropdown {
  position: absolute;
  z-index: 50;
  top: calc(100% + 4px);
  left: 0;
  right: 0;
  margin: 0;
  padding: var(--ui-space-1) 0;
  list-style: none;
  background: rgb(var(--ui-surface));
  border: 1px solid rgb(var(--ui-border-strong));
  border-radius: var(--ui-radius-md);
  box-shadow: var(--ui-shadow-md, 0 4px 16px rgb(0 0 0 / 0.12));
  max-height: 240px;
  overflow-y: auto;
}

.picker-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ui-space-2);
  padding: var(--ui-space-2) var(--ui-space-3);
  cursor: pointer;
  font-size: var(--ui-text-sm);
  transition: background 0.1s ease;
}

.picker-item:hover,
.picker-item:focus-visible {
  background: rgb(var(--ui-accent) / 0.08);
  outline: none;
}

.picker-item-name {
  font-weight: 500;
  color: rgb(var(--ui-fg));
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.picker-item-doc {
  font-size: var(--ui-text-xs);
  color: rgb(var(--ui-muted));
  font-variant-numeric: tabular-nums;
  flex-shrink: 0;
}

/* ── Chip da entidade selecionada ─────────────────────────────────────────── */
.picker-selected {
  display: flex;
  align-items: center;
  gap: var(--ui-space-2);
  padding: var(--ui-space-2) var(--ui-space-3);
  margin-top: var(--ui-space-2);
  background: rgb(var(--ui-accent) / 0.08);
  border: 1px solid rgb(var(--ui-accent) / 0.3);
  border-radius: var(--ui-radius-sm);
  font-size: var(--ui-text-sm);
}

.picker-selected-name {
  font-weight: 600;
  color: rgb(var(--ui-fg));
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.picker-selected-doc {
  font-size: var(--ui-text-xs);
  color: rgb(var(--ui-muted));
  font-variant-numeric: tabular-nums;
  flex-shrink: 0;
}

.picker-clear {
  display: flex;
  align-items: center;
  justify-content: center;
  width: var(--ui-space-6);
  height: var(--ui-space-6);
  padding: 0;
  border: none;
  border-radius: 50%;
  background: rgb(var(--ui-danger) / 0.12);
  color: rgb(var(--ui-danger));
  font-size: var(--ui-text-base);
  font-weight: 700;
  line-height: 1;
  cursor: pointer;
  flex-shrink: 0;
  transition: background 0.15s ease;
}

.picker-clear:hover {
  background: rgb(var(--ui-danger) / 0.25);
}

.picker-clear:focus-visible {
  outline: 2px solid rgb(var(--ui-accent));
  outline-offset: 2px;
}

/* ── Textarea de descrição ────────────────────────────────────────────────── */
.descricao-textarea {
  width: 100%;
  background: rgb(var(--ui-bg));
  color: rgb(var(--ui-fg));
  border: 1px solid rgb(var(--ui-border-strong));
  border-radius: var(--ui-radius-sm);
  padding: var(--ui-space-2) var(--ui-space-3);
  font: inherit;
  font-size: var(--ui-text-sm);
  resize: vertical;
  min-height: var(--ui-space-24);
  line-height: var(--ui-leading-relaxed);
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}

.descricao-textarea:focus {
  outline: none;
  border-color: rgb(var(--ui-accent));
  box-shadow: 0 0 0 3px rgb(var(--ui-accent) / 0.15);
}

.char-count {
  display: block;
  text-align: right;
  font-size: var(--ui-text-xs);
  color: rgb(var(--ui-faint));
  margin-top: var(--ui-space-1);
}

/* ── Ações do formulário ──────────────────────────────────────────────────── */
.form-actions {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: var(--ui-space-2);
  padding-top: var(--ui-space-2);
}

/* ── Acessibilidade: classe visually-hidden ───────────────────────────────── */
.visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

/* ── Responsivo ≤860px ────────────────────────────────────────────────────── */
@media (max-width: 860px) {
  .form-actions {
    flex-direction: column-reverse;
    align-items: stretch;
  }

  .entity-type-group {
    flex-direction: column;
  }

  .entity-type-opt {
    min-width: unset;
  }
}

@media (max-width: 640px) {
  .currency-row {
    flex-direction: row; /* mantém prefixo inline mesmo em mobile */
  }
}
</style>
