<template>
  <UiPageLayout
    title="Novo Produto / Serviço"
    eyebrow="Catálogo NF"
    subtitle="Cadastre um produto ou serviço para emissão de notas fiscais. Campos de alíquotas são opcionais e dependem do regime tributário."
    width="narrow"
    :loading="f.submitting.value"
    loading-message="Salvando produto…"
    :error="submitError"
    :retryable="false"
  >
    <template #actions>
      <UiButton variant="ghost" to="/nf-products">Voltar para catálogo</UiButton>
    </template>

    <form novalidate @submit.prevent="submit">

      <!-- ── Seção 1: Identificação ── -->
      <UiCard
        title="Identificação"
        subtitle="Código, descrição e valor base do produto ou serviço."
      >
        <UiFormSection :columns="2">

          <!-- Código -->
          <UiFormField
            label="Código"
            :error="f.errors.codigo"
            hint="Código interno do produto ou serviço (SKU, código fiscal etc.)."
          >
            <template #default="{ id, describedBy }">
              <UiInput
                :id="id"
                :described-by="describedBy"
                :model-value="f.values.codigo"
                placeholder="Ex.: PROD-001, SRV-042…"
                autocomplete="off"
                :error="!!f.errors.codigo"
                @update:model-value="f.setField('codigo', $event)"
              />
            </template>
          </UiFormField>

          <!-- Descrição -->
          <UiFormField
            label="Descrição"
            :required="true"
            :error="f.errors.descricao"
            hint="Nome completo do produto ou serviço conforme constará na NF."
            :full-width="true"
          >
            <template #default="{ id, describedBy }">
              <UiInput
                :id="id"
                :described-by="describedBy"
                :model-value="f.values.descricao"
                placeholder="Ex.: Consultoria em Contabilidade Tributária, Notebook Dell XPS 15…"
                autocomplete="off"
                :required="true"
                :error="!!f.errors.descricao"
                @update:model-value="f.setField('descricao', $event)"
              />
            </template>
          </UiFormField>

          <!-- Valor Unitário -->
          <UiFormField
            label="Valor Unitário (R$)"
            :required="true"
            :error="f.errors.valor_unitario"
            hint="Valor base por unidade. Use vírgula para centavos (ex.: 1.500,00)."
          >
            <template #default="{ id, describedBy }">
              <div class="currency-row">
                <span class="currency-prefix" aria-hidden="true">R$</span>
                <UiInput
                  :id="id"
                  :described-by="describedBy"
                  :model-value="valorDisplay"
                  placeholder="0,00"
                  inputmode="decimal"
                  autocomplete="off"
                  :required="true"
                  :error="!!f.errors.valor_unitario"
                  @update:model-value="onValorInput($event)"
                />
              </div>
            </template>
          </UiFormField>

        </UiFormSection>
      </UiCard>

      <!-- ── Seção 2: Classificação Fiscal ── -->
      <UiCard
        title="Classificação Fiscal"
        subtitle="Código de operação e nomenclatura de mercadoria ou serviço — exigidos pela SEFAZ."
      >
        <UiFormSection :columns="2">

          <!-- CFOP -->
          <UiFormField
            label="CFOP"
            :error="f.errors.cfop"
            hint="Código Fiscal de Operações e Prestações (ex.: 5102, 6101, 5933)."
          >
            <template #default="{ id, describedBy }">
              <UiInput
                :id="id"
                :described-by="describedBy"
                :model-value="f.values.cfop"
                placeholder="Ex.: 5102"
                inputmode="numeric"
                autocomplete="off"
                :error="!!f.errors.cfop"
                @update:model-value="f.setField('cfop', $event)"
              />
            </template>
          </UiFormField>

          <!-- NCM / NBS -->
          <UiFormField
            label="NCM / NBS"
            :error="f.errors.ncm_nbs"
            hint="NCM para mercadorias (8 dígitos) ou NBS para serviços (7 dígitos)."
          >
            <template #default="{ id, describedBy }">
              <UiInput
                :id="id"
                :described-by="describedBy"
                :model-value="f.values.ncm_nbs"
                placeholder="Ex.: 84713012 (NCM) ou 1.05.01.00 (NBS)"
                autocomplete="off"
                :error="!!f.errors.ncm_nbs"
                @update:model-value="f.setField('ncm_nbs', $event)"
              />
            </template>
          </UiFormField>

        </UiFormSection>
      </UiCard>

      <!-- ── Seção 3: Alíquotas Tributárias ── -->
      <UiCard
        title="Alíquotas Tributárias"
        subtitle="Percentuais aplicados na emissão da NF. Deixe em branco os impostos não incidentes."
      >

        <!-- Indicador de tipo (produto vs. serviço) -->
        <div class="tipo-row">
          <button
            type="button"
            class="tipo-btn"
            :data-active="tipoNf === 'produto'"
            :aria-pressed="tipoNf === 'produto'"
            @click="tipoNf = 'produto'"
          >
            Produto (NF-e)
          </button>
          <button
            type="button"
            class="tipo-btn"
            :data-active="tipoNf === 'servico'"
            :aria-pressed="tipoNf === 'servico'"
            @click="tipoNf = 'servico'"
          >
            Serviço (NFS-e)
          </button>
        </div>

        <UiFormSection :columns="2" aria-live="polite" aria-atomic="false">

          <!-- Alíquota ICMS — aparece em produto -->
          <UiFormField
            v-if="tipoNf === 'produto'"
            label="Alíquota ICMS (%)"
            :error="f.errors.aliquota_icms"
            hint="ICMS incidente sobre a operação. Zero-rated: informe 0."
          >
            <template #default="{ id, describedBy }">
              <div class="percent-row">
                <UiInput
                  :id="id"
                  :described-by="describedBy"
                  :model-value="f.values.aliquota_icms"
                  placeholder="0.00"
                  type="number"
                  inputmode="decimal"
                  min="0"
                  max="100"
                  step="0.01"
                  autocomplete="off"
                  :error="!!f.errors.aliquota_icms"
                  @update:model-value="f.setField('aliquota_icms', $event)"
                />
                <span class="percent-suffix" aria-hidden="true">%</span>
              </div>
            </template>
          </UiFormField>

          <!-- Alíquota ISS — aparece em serviço -->
          <UiFormField
            v-if="tipoNf === 'servico'"
            label="Alíquota ISS (%)"
            :error="f.errors.aliquota_iss"
            hint="ISS cobrado pelo município sobre a prestação do serviço."
          >
            <template #default="{ id, describedBy }">
              <div class="percent-row">
                <UiInput
                  :id="id"
                  :described-by="describedBy"
                  :model-value="f.values.aliquota_iss"
                  placeholder="0.00"
                  type="number"
                  inputmode="decimal"
                  min="0"
                  max="100"
                  step="0.01"
                  autocomplete="off"
                  :error="!!f.errors.aliquota_iss"
                  @update:model-value="f.setField('aliquota_iss', $event)"
                />
                <span class="percent-suffix" aria-hidden="true">%</span>
              </div>
            </template>
          </UiFormField>

          <!-- Alíquota PIS -->
          <UiFormField
            label="Alíquota PIS (%)"
            :error="f.errors.aliquota_pis"
            hint="Contribuição para o Programa de Integração Social."
          >
            <template #default="{ id, describedBy }">
              <div class="percent-row">
                <UiInput
                  :id="id"
                  :described-by="describedBy"
                  :model-value="f.values.aliquota_pis"
                  placeholder="0.65"
                  type="number"
                  inputmode="decimal"
                  min="0"
                  max="100"
                  step="0.01"
                  autocomplete="off"
                  :error="!!f.errors.aliquota_pis"
                  @update:model-value="f.setField('aliquota_pis', $event)"
                />
                <span class="percent-suffix" aria-hidden="true">%</span>
              </div>
            </template>
          </UiFormField>

          <!-- Alíquota COFINS -->
          <UiFormField
            label="Alíquota COFINS (%)"
            :error="f.errors.aliquota_cofins"
            hint="Contribuição para o Financiamento da Seguridade Social."
          >
            <template #default="{ id, describedBy }">
              <div class="percent-row">
                <UiInput
                  :id="id"
                  :described-by="describedBy"
                  :model-value="f.values.aliquota_cofins"
                  placeholder="3.00"
                  type="number"
                  inputmode="decimal"
                  min="0"
                  max="100"
                  step="0.01"
                  autocomplete="off"
                  :error="!!f.errors.aliquota_cofins"
                  @update:model-value="f.setField('aliquota_cofins', $event)"
                />
                <span class="percent-suffix" aria-hidden="true">%</span>
              </div>
            </template>
          </UiFormField>

        </UiFormSection>

        <!-- Painel de preview de carga tributária -->
        <div v-if="hasAliquotas" class="tax-preview" role="region" aria-label="Preview da carga tributária">
          <p class="tax-preview-title">Preview — Carga Tributária Estimada</p>
          <div class="tax-preview-grid">
            <div v-if="tipoNf === 'produto' && f.values.aliquota_icms !== ''" class="tax-item">
              <span class="tax-item-label">ICMS</span>
              <span class="tax-item-value">{{ formatAliquota(f.values.aliquota_icms) }}</span>
              <span class="tax-item-amount" aria-label="Valor estimado ICMS">{{ calcTax(f.values.aliquota_icms) }}</span>
            </div>
            <div v-if="tipoNf === 'servico' && f.values.aliquota_iss !== ''" class="tax-item">
              <span class="tax-item-label">ISS</span>
              <span class="tax-item-value">{{ formatAliquota(f.values.aliquota_iss) }}</span>
              <span class="tax-item-amount" aria-label="Valor estimado ISS">{{ calcTax(f.values.aliquota_iss) }}</span>
            </div>
            <div v-if="f.values.aliquota_pis !== ''" class="tax-item">
              <span class="tax-item-label">PIS</span>
              <span class="tax-item-value">{{ formatAliquota(f.values.aliquota_pis) }}</span>
              <span class="tax-item-amount" aria-label="Valor estimado PIS">{{ calcTax(f.values.aliquota_pis) }}</span>
            </div>
            <div v-if="f.values.aliquota_cofins !== ''" class="tax-item">
              <span class="tax-item-label">COFINS</span>
              <span class="tax-item-value">{{ formatAliquota(f.values.aliquota_cofins) }}</span>
              <span class="tax-item-amount" aria-label="Valor estimado COFINS">{{ calcTax(f.values.aliquota_cofins) }}</span>
            </div>
            <div class="tax-item tax-item--total">
              <span class="tax-item-label">Total impostos</span>
              <span class="tax-item-value">{{ formatAliquota(totalAliquota) }}</span>
              <span class="tax-item-amount">{{ calcTax(totalAliquota) }}</span>
            </div>
            <div class="tax-item tax-item--net">
              <span class="tax-item-label">Valor líquido</span>
              <span class="tax-item-value"></span>
              <span class="tax-item-amount">{{ valorLiquido }}</span>
            </div>
          </div>
        </div>

      </UiCard>

      <!-- ── Ações ── -->
      <div class="form-actions">
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
        >
          Salvar Produto / Serviço
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
  UiButton,
  useForm,
  useToast,
  validators,
} from '../ui/index.js';
import { nfProducts } from '../api.js';

// ── Router / Toast ────────────────────────────────────────────────────────────
const router = useRouter();
const toast = useToast();

// ── Estado de UI ──────────────────────────────────────────────────────────────
const submitError = ref(null);

// ── Tipo de NF (produto vs. serviço) ─────────────────────────────────────────
const tipoNf = ref('produto');

// ── Formulário ────────────────────────────────────────────────────────────────
const f = useForm({
  initial: {
    codigo:          '',
    descricao:       '',
    valor_unitario:  '',
    aliquota_icms:   '',
    aliquota_iss:    '',
    aliquota_pis:    '',
    aliquota_cofins: '',
    cfop:            '',
    ncm_nbs:         '',
  },
  rules: {
    descricao:      [validators.required('Informe a descrição do produto ou serviço'), validators.minLen(3, 'Descrição muito curta (mín. 3 caracteres)')],
    valor_unitario: [validators.required('Informe o valor unitário'), validators.numeric('Valor inválido'), validators.min(0.01, 'O valor deve ser positivo')],
    aliquota_icms:  [(v) => v !== '' && v !== null && v !== undefined && (isNaN(Number(v)) || Number(v) < 0 || Number(v) > 100) ? 'Alíquota ICMS deve estar entre 0 e 100' : ''],
    aliquota_iss:   [(v) => v !== '' && v !== null && v !== undefined && (isNaN(Number(v)) || Number(v) < 0 || Number(v) > 100) ? 'Alíquota ISS deve estar entre 0 e 100' : ''],
    aliquota_pis:   [(v) => v !== '' && v !== null && v !== undefined && (isNaN(Number(v)) || Number(v) < 0 || Number(v) > 100) ? 'Alíquota PIS deve estar entre 0 e 100' : ''],
    aliquota_cofins:[(v) => v !== '' && v !== null && v !== undefined && (isNaN(Number(v)) || Number(v) < 0 || Number(v) > 100) ? 'Alíquota COFINS deve estar entre 0 e 100' : ''],
    cfop:           [(v) => v && !/^\d{4,5}$/.test(v.replace(/\D/g, '')) ? 'CFOP deve ter 4 ou 5 dígitos numéricos' : ''],
    ncm_nbs:        [(v) => v && !/^(\d{8}|\d\.\d{2}\.\d{2}\.\d{2})$/.test(v.trim()) ? 'NCM: 8 dígitos; NBS: formato 1.05.01.00' : ''],
  },
});

// ── Campo Valor Unitário (CurrencyInput) ──────────────────────────────────────
const valorDisplay = ref('');

function onValorInput(val) {
  if (val === '' || val === null || val === undefined) {
    valorDisplay.value = '';
    f.setField('valor_unitario', '');
    return;
  }
  // Atualiza o display imediatamente para não bloquear a digitação
  valorDisplay.value = val;
  // Converte pt-BR (1.500,00) → número e grava no form na mesma chamada
  const normalized = String(val).replace(/\./g, '').replace(',', '.');
  const n = parseFloat(normalized);
  if (isFinite(n) && n > 0) {
    f.setField('valor_unitario', String(n));
  } else {
    // valor ainda sendo digitado (ex.: "1." ou "-") — mantém form vazio até completar
    f.setField('valor_unitario', '');
  }
}

// ── Preview de carga tributária ───────────────────────────────────────────────
const valorBase = computed(() => {
  const v = parseFloat(f.values.valor_unitario);
  return isFinite(v) && v > 0 ? v : 0;
});

const hasAliquotas = computed(() => {
  return (
    valorBase.value > 0 &&
    (
      (tipoNf.value === 'produto' && f.values.aliquota_icms !== '') ||
      (tipoNf.value === 'servico' && f.values.aliquota_iss !== '') ||
      f.values.aliquota_pis !== '' ||
      f.values.aliquota_cofins !== ''
    )
  );
});

const totalAliquota = computed(() => {
  let total = 0;
  if (tipoNf.value === 'produto' && f.values.aliquota_icms !== '') total += parseFloat(f.values.aliquota_icms) || 0;
  if (tipoNf.value === 'servico' && f.values.aliquota_iss !== '') total += parseFloat(f.values.aliquota_iss) || 0;
  if (f.values.aliquota_pis !== '') total += parseFloat(f.values.aliquota_pis) || 0;
  if (f.values.aliquota_cofins !== '') total += parseFloat(f.values.aliquota_cofins) || 0;
  return total;
});

function formatAliquota(val) {
  const n = parseFloat(val);
  if (!isFinite(n)) return '';
  return new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n) + '%';
}

function calcTax(aliquota) {
  const pct = parseFloat(aliquota);
  if (!isFinite(pct) || valorBase.value === 0) return '—';
  const tax = (valorBase.value * pct) / 100;
  return 'R$ ' + new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(tax);
}

const valorLiquido = computed(() => {
  if (valorBase.value === 0) return '—';
  const net = valorBase.value * (1 - totalAliquota.value / 100);
  return 'R$ ' + new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Math.max(0, net));
});

// ── Idempotency Key ───────────────────────────────────────────────────────────
function generateIdempotencyKey() {
  return 'nfp-' + Date.now() + '-' + Math.random().toString(36).slice(2, 9);
}

// ── Submit ────────────────────────────────────────────────────────────────────
function submit() {
  submitError.value = null;
  f.handleSubmit(async (vals) => {
    try {
      const idempotencyKey = generateIdempotencyKey();
      const payload = {
        descricao:      vals.descricao.trim(),
        valor_unitario: Number(vals.valor_unitario),
        ...(vals.codigo          ? { codigo:          vals.codigo.trim()          } : {}),
        ...(vals.cfop            ? { cfop:            vals.cfop.trim()            } : {}),
        ...(vals.ncm_nbs         ? { ncm_nbs:         vals.ncm_nbs.trim()         } : {}),
        ...(vals.aliquota_icms   !== '' ? { aliquota_icms:   Number(vals.aliquota_icms)   } : {}),
        ...(vals.aliquota_iss    !== '' ? { aliquota_iss:    Number(vals.aliquota_iss)    } : {}),
        ...(vals.aliquota_pis    !== '' ? { aliquota_pis:    Number(vals.aliquota_pis)    } : {}),
        ...(vals.aliquota_cofins !== '' ? { aliquota_cofins: Number(vals.aliquota_cofins) } : {}),
      };

      const created = await nfProducts.create(payload, idempotencyKey);
      toast.success('Produto / Serviço cadastrado com sucesso no catálogo NF!');

      const id = created && (created.id || (created.data && created.data.id));
      if (id) {
        router.push('/nf-products/' + id);
      } else {
        router.push('/nf-products');
      }
    } catch (e) {
      const msg = (e && e.message) || 'Erro ao salvar. Tente novamente.';
      submitError.value = msg;
      toast.error(msg);
    }
  });
}

function cancel() {
  router.push('/nf-products');
}
</script>

<style scoped>
/* ── Layout do formulário ─────────────────────────────────────────────────── */
form {
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-4);
}

/* ── Campo valor com prefixo R$ ──────────────────────────────────────────── */
.currency-row {
  display: flex;
  align-items: stretch;
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
  user-select: none;
}

.currency-row :deep(.ui-input) {
  border-radius: 0 var(--ui-radius-sm) var(--ui-radius-sm) 0;
}

/* ── Campo percentual com sufixo % ──────────────────────────────────────── */
.percent-row {
  display: flex;
  align-items: stretch;
}

.percent-suffix {
  display: flex;
  align-items: center;
  padding: var(--ui-space-2) var(--ui-space-3);
  background: rgb(var(--ui-surface-2));
  border: 1px solid rgb(var(--ui-border-strong));
  border-left: none;
  border-radius: 0 var(--ui-radius-sm) var(--ui-radius-sm) 0;
  font-size: var(--ui-text-sm);
  font-weight: 600;
  color: rgb(var(--ui-muted));
  white-space: nowrap;
  flex-shrink: 0;
  user-select: none;
}

.percent-row :deep(.ui-input) {
  border-radius: var(--ui-radius-sm) 0 0 var(--ui-radius-sm);
}

/* ── Selector de tipo NF (produto / serviço) ─────────────────────────────── */
.tipo-row {
  display: flex;
  gap: var(--ui-space-2);
  margin-bottom: var(--ui-space-4);
}

.tipo-btn {
  flex: 1;
  padding: var(--ui-space-2) var(--ui-space-3);
  border: 2px solid rgb(var(--ui-border-strong));
  border-radius: var(--ui-radius-md);
  background: rgb(var(--ui-bg));
  color: rgb(var(--ui-muted));
  font: inherit;
  font-size: var(--ui-text-sm);
  font-weight: 500;
  cursor: pointer;
  transition: border-color 0.15s ease, background 0.15s ease, color 0.15s ease, box-shadow 0.15s ease;
  text-align: center;
}

.tipo-btn:hover {
  border-color: rgb(var(--ui-accent));
  color: rgb(var(--ui-fg));
  background: rgb(var(--ui-accent) / 0.05);
}

.tipo-btn[data-active="true"] {
  border-color: rgb(var(--ui-accent));
  background: rgb(var(--ui-accent) / 0.10);
  color: rgb(var(--ui-accent));
  font-weight: 700;
  box-shadow: 0 0 0 3px rgb(var(--ui-accent) / 0.15);
}

.tipo-btn:focus-visible {
  outline: 2px solid rgb(var(--ui-accent));
  outline-offset: 3px;
}

/* ── Preview de carga tributária ─────────────────────────────────────────── */
.tax-preview {
  margin-top: var(--ui-space-4);
  padding: var(--ui-space-4);
  background: rgb(var(--ui-surface-2));
  border: 1px solid rgb(var(--ui-border-strong));
  border-radius: var(--ui-radius-md);
}

.tax-preview-title {
  margin: 0 0 var(--ui-space-3);
  font-size: var(--ui-text-sm);
  font-weight: 700;
  color: rgb(var(--ui-fg));
  font-family: var(--ui-font-display, inherit);
  line-height: 1.4;
}

.tax-preview-grid {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.tax-item {
  display: grid;
  grid-template-columns: 1fr auto auto;
  gap: var(--ui-space-3);
  align-items: center;
  padding: var(--ui-space-1) 0;
  border-bottom: 1px solid rgb(var(--ui-border-strong) / 0.5);
}

.tax-item:last-child {
  border-bottom: none;
}

.tax-item-label {
  font-size: var(--ui-text-sm);
  color: rgb(var(--ui-muted));
}

.tax-item-value {
  font-size: var(--ui-text-xs);
  color: rgb(var(--ui-faint));
  min-width: 50px;
  text-align: right;
}

.tax-item-amount {
  font-size: var(--ui-text-sm);
  font-weight: 500;
  color: rgb(var(--ui-fg));
  min-width: 90px;
  text-align: right;
  font-variant-numeric: tabular-nums;
}

.tax-item--total {
  padding-top: var(--ui-space-2);
  margin-top: var(--ui-space-1);
  border-top: 2px solid rgb(var(--ui-border-strong));
  border-bottom: none;
}

.tax-item--total .tax-item-label,
.tax-item--total .tax-item-amount {
  font-weight: 700;
  color: rgb(var(--ui-fg));
}

.tax-item--net .tax-item-label {
  color: rgb(var(--ui-fg));
  font-weight: 600;
}

.tax-item--net .tax-item-amount {
  color: rgb(var(--ui-success));
  font-weight: 700;
}

/* ── Ações do formulário ──────────────────────────────────────────────────── */
.form-actions {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: var(--ui-space-2);
  padding-top: var(--ui-space-2);
}

/* ── Responsivo ≤860px ───────────────────────────────────────────────────── */
@media (max-width: 860px) {
  .form-actions {
    flex-direction: column-reverse;
    align-items: stretch;
  }

  .tipo-row {
    flex-direction: column;
  }

  .tax-item {
    grid-template-columns: 1fr auto;
  }

  .tax-item-value {
    display: none;
  }
}

@media (max-width: 520px) {
  .currency-row,
  .percent-row {
    flex-direction: column;
  }

  .currency-prefix {
    border-right: 1px solid rgb(var(--ui-border-strong));
    border-bottom: none;
    border-radius: var(--ui-radius-sm) var(--ui-radius-sm) 0 0;
  }

  .currency-row :deep(.ui-input) {
    border-radius: 0 0 var(--ui-radius-sm) var(--ui-radius-sm);
  }

  .percent-suffix {
    border-left: 1px solid rgb(var(--ui-border-strong));
    border-top: none;
    border-radius: 0 0 var(--ui-radius-sm) var(--ui-radius-sm);
  }

  .percent-row :deep(.ui-input) {
    border-radius: var(--ui-radius-sm) var(--ui-radius-sm) 0 0;
  }
}
</style>
