<template>
  <UiPageLayout
    title="Nova Conta a Receber"
    eyebrow="Contas a Receber"
    subtitle="Preencha os dados do recebimento. O lançamento será salvo com chave de idempotência para evitar duplicatas."
    width="narrow"
    :loading="saving"
    loading-message="Salvando conta a receber…"
    :error="submitError"
    :retryable="false"
  >
    <template #actions>
      <UiButton variant="ghost" to="/accounts-receivable">Voltar para lista</UiButton>
    </template>

    <!-- Banner de vencimento próximo ou vencido -->
    <template v-if="bannerKind" #banner>
      <div class="alert-banner" :data-kind="bannerKind" role="alert" aria-live="polite">
        <span class="alert-banner-icon" aria-hidden="true">{{ bannerKind === 'danger' ? '!' : '⚠' }}</span>
        <span class="alert-banner-msg">
          <template v-if="bannerKind === 'danger'">
            Atenção: a data de vencimento informada já <strong>passou ({{ Math.abs(diasParaVencer) }} dia(s) atrás)</strong>.
            O lançamento será salvo como vencido.
          </template>
          <template v-else>
            Atenção: o vencimento está em <strong>{{ diasParaVencer }} dia(s)</strong>. Verifique antes de salvar.
          </template>
        </span>
      </div>
    </template>

    <form novalidate @submit.prevent="submit">

      <!-- ── Seção 1: Dados do Cliente ── -->
      <UiCard
        title="Dados do Cliente"
        subtitle="Identifique o cliente ou pagador desta conta a receber."
      >
        <UiFormSection :columns="2">
          <!-- Cliente -->
          <UiFormField
            label="Cliente"
            :required="true"
            :error="f.errors.contraparte"
            hint="Nome completo ou razão social do cliente/pagador."
            :full-width="true"
          >
            <template #default="{ id, describedBy }">
              <UiInput
                :id="id"
                :described-by="describedBy"
                :model-value="f.values.contraparte"
                placeholder="Ex.: Empresa ABC Ltda. ou João da Silva"
                autocomplete="organization"
                :error="!!f.errors.contraparte"
                :required="true"
                @update:model-value="f.setField('contraparte', $event)"
              />
            </template>
          </UiFormField>

          <!-- Categoria -->
          <UiFormField
            label="Categoria"
            :error="f.errors.categoria"
            hint="Tipo de receita (ex.: Serviço, Produto, Honorários, Aluguel)."
          >
            <template #default="{ id, describedBy }">
              <UiSelect
                :id="id"
                :described-by="describedBy"
                :model-value="f.values.categoria"
                :error="!!f.errors.categoria"
                @update:model-value="f.setField('categoria', $event)"
              >
                <option value="">Selecione ou deixe em branco</option>
                <option v-for="cat in CATEGORIAS" :key="cat" :value="cat">{{ cat }}</option>
              </UiSelect>
            </template>
          </UiFormField>

          <!-- Forma de Recebimento -->
          <UiFormField
            label="Forma de Recebimento"
            :error="f.errors.forma_recebimento"
            hint="Modalidade de pagamento esperada pelo cliente."
          >
            <template #default="{ id, describedBy }">
              <div
                class="formas-group"
                role="group"
                :aria-labelledby="id + '-legend'"
                :aria-describedby="describedBy"
              >
                <span :id="id + '-legend'" class="visually-hidden">Forma de recebimento</span>
                <label
                  v-for="forma in FORMAS_RECEBIMENTO"
                  :key="forma.value"
                  class="forma-opt"
                  :data-selected="f.values.forma_recebimento === forma.value"
                >
                  <input
                    type="radio"
                    name="forma_recebimento"
                    :value="forma.value"
                    :checked="f.values.forma_recebimento === forma.value"
                    @change="f.setField('forma_recebimento', forma.value)"
                  />
                  <span class="forma-icon" aria-hidden="true">{{ forma.icon }}</span>
                  <span class="forma-label">{{ forma.label }}</span>
                </label>
              </div>
            </template>
          </UiFormField>

          <!-- Status -->
          <UiFormField
            label="Status inicial"
            :error="f.errors.status"
            hint="Situação atual desta conta."
          >
            <template #default="{ id, describedBy }">
              <UiSelect
                :id="id"
                :described-by="describedBy"
                :model-value="f.values.status"
                :error="!!f.errors.status"
                @update:model-value="f.setField('status', $event)"
              >
                <option value="pendente">Pendente</option>
                <option value="recebido">Recebido</option>
                <option value="vencido">Vencido</option>
                <option value="cancelado">Cancelado</option>
              </UiSelect>
            </template>
          </UiFormField>
        </UiFormSection>
      </UiCard>

      <!-- ── Seção 2: Valores e Datas ── -->
      <UiCard
        title="Valores e Datas"
        subtitle="Informe o valor a receber e o vencimento deste lançamento."
      >
        <UiFormSection :columns="2">
          <!-- Valor -->
          <UiFormField
            label="Valor (R$)"
            :required="true"
            :error="f.errors.valor"
            hint="Valor total a receber. Use vírgula para decimais."
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
                  :error="!!f.errors.valor"
                  :required="true"
                  @update:model-value="onValorInput($event)"
                  @blur="onValorBlur"
                />
              </div>
            </template>
          </UiFormField>

          <!-- Data de Vencimento -->
          <UiFormField
            label="Data de Vencimento"
            :required="true"
            :error="f.errors.data"
            hint="Data limite para recebimento deste lançamento."
          >
            <template #default="{ id, describedBy }">
              <UiInput
                :id="id"
                :described-by="describedBy"
                type="date"
                :model-value="f.values.data"
                :error="!!f.errors.data"
                :required="true"
                @update:model-value="f.setField('data', $event)"
              />
            </template>
          </UiFormField>
        </UiFormSection>

        <!-- Preview de valor formatado -->
        <div v-if="valorFormatado" class="valor-preview" aria-live="polite">
          <span class="valor-preview-label">Valor que será registrado:</span>
          <span class="valor-preview-value">{{ valorFormatado }}</span>
        </div>
      </UiCard>

      <!-- ── Seção 3: Recorrência ── -->
      <UiCard
        title="Recorrência"
        subtitle="Configure se esta conta se repete mensalmente."
      >
        <div class="recorrencia-toggle-wrap">
          <button
            type="button"
            class="recorrencia-toggle"
            :data-active="f.values.recorrente"
            role="switch"
            :aria-checked="f.values.recorrente ? 'true' : 'false'"
            aria-label="Conta recorrente"
            @click="f.setField('recorrente', !f.values.recorrente)"
          >
            <span class="recorrencia-track">
              <span class="recorrencia-thumb" />
            </span>
            <span class="recorrencia-text">
              <span class="recorrencia-title">Conta recorrente</span>
              <span class="recorrencia-desc">
                {{ f.values.recorrente
                  ? 'Esta conta se repetirá mensalmente na mesma data de vencimento.'
                  : 'Lançamento único — sem repetição automática.' }}
              </span>
            </span>
          </button>

          <div v-if="f.values.recorrente" class="recorrencia-info" role="status" aria-live="polite">
            <span class="recorrencia-info-icon" aria-hidden="true">i</span>
            <span>
              A cada mês, um novo lançamento idêntico será criado automaticamente
              com a mesma data de vencimento do mês seguinte.
            </span>
          </div>
        </div>
      </UiCard>

      <!-- ── Seção 4: Observações ── -->
      <UiCard
        title="Observações"
        subtitle="Informações complementares sobre este recebimento."
      >
        <UiFormSection :columns="1">
          <UiFormField
            label="Descrição"
            :error="f.errors.descricao"
            hint="Contexto adicional, referências, observações internas."
            :full-width="true"
          >
            <template #default="{ id, describedBy }">
              <UiTextarea
                :id="id"
                :described-by="describedBy"
                :model-value="f.values.descricao"
                rows="4"
                placeholder="Ex.: Referente à nota fiscal nº 1234 — prestação de serviços de TI — Março/2025."
                @update:model-value="f.setField('descricao', $event)"
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
          Salvar Conta a Receber
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
  UiSelect,
  UiTextarea,
  UiButton,
  useForm,
  useToast,
  validators,
  format,
} from '../ui/index.js';
import { accountsReceivable } from '../api.js';

// ── Router / Toast ────────────────────────────────────────────────────────────
const router = useRouter();
const toast = useToast();

// ── Estado de UI ──────────────────────────────────────────────────────────────
const saving = ref(false);
const submitError = ref(null);

// ── Constantes de domínio ─────────────────────────────────────────────────────
const CATEGORIAS = [
  'Serviço', 'Produto', 'Honorários', 'Aluguel', 'Consultoria',
  'Comissão', 'Royalties', 'Juros', 'Outros',
];

const FORMAS_RECEBIMENTO = [
  { value: 'pix', label: 'PIX', icon: 'P' },
  { value: 'transferencia', label: 'Transferência', icon: 'T' },
  { value: 'boleto', label: 'Boleto', icon: 'B' },
  { value: 'cartao', label: 'Cartão', icon: 'C' },
  { value: 'dinheiro', label: 'Dinheiro', icon: 'D' },
  { value: 'cheque', label: 'Cheque', icon: 'CH' },
];

// ── Formulário ────────────────────────────────────────────────────────────────
const f = useForm({
  initial: {
    contraparte: '',
    valor: '',
    data: '',
    categoria: '',
    descricao: '',
    forma_recebimento: '',
    recorrente: false,
    status: 'pendente',
  },
  rules: {
    contraparte: [validators.required('Informe o nome do cliente')],
    valor: [
      validators.required('Informe o valor a receber'),
      validators.numeric('Valor inválido'),
      validators.min(0.01, 'O valor deve ser maior que zero'),
    ],
    data: [validators.required('Informe a data de vencimento')],
  },
});

// ── Campo Valor ───────────────────────────────────────────────────────────────
const valorDisplay = ref('');

const valorFormatado = computed(() => {
  const v = Number(f.values.valor);
  return isFinite(v) && v > 0 ? format.formatCurrency(v) : '';
});

// Handler único: atualiza o display imediatamente; normaliza e persiste no blur.
function onValorInput(val) {
  valorDisplay.value = val;
  const normalized = String(val).replace(/\./g, '').replace(',', '.');
  const n = parseFloat(normalized);
  if (val === '' || val === null || val === undefined) {
    f.setField('valor', '');
  } else if (isFinite(n) && n >= 0) {
    f.setField('valor', String(n));
  }
  // Exibe toast de aviso apenas no blur (onValorBlur) para não perturbar a digitação.
}

function onValorBlur() {
  const val = valorDisplay.value;
  if (val === '' || val === null || val === undefined) {
    f.setField('valor', '');
    valorDisplay.value = '';
    return;
  }
  const normalized = String(val).replace(/\./g, '').replace(',', '.');
  const n = parseFloat(normalized);
  if (isFinite(n) && n >= 0) {
    f.setField('valor', String(n));
    valorDisplay.value = new Intl.NumberFormat('pt-BR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(n);
  } else {
    f.setField('valor', '');
    valorDisplay.value = '';
    toast.warning('Valor inválido. Informe um número positivo (ex.: 1.500,00).');
  }
}

// ── Banner de vencimento ──────────────────────────────────────────────────────
const diasParaVencer = computed(() => {
  if (!f.values.data) return null;
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const venc = new Date(f.values.data + 'T00:00:00');
  if (isNaN(venc.getTime())) return null;
  return Math.ceil((venc - hoje) / (1000 * 60 * 60 * 24));
});

const bannerKind = computed(() => {
  const d = diasParaVencer.value;
  if (d === null) return null;
  if (d < 0) return 'danger';
  if (d <= 7) return 'warning';
  return null;
});

// ── Idempotency key ───────────────────────────────────────────────────────────
function generateIdempotencyKey() {
  // Gera UUID v4 simples sem crypto.randomUUID() p/ máxima compat.
  return 'xxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// ── Submit ────────────────────────────────────────────────────────────────────
function submit() {
  submitError.value = null;
  f.handleSubmit(async (vals) => {
    saving.value = true;
    try {
      const payload = {
        contraparte: vals.contraparte.trim(),
        valor: Number(vals.valor),
        data: vals.data,
        status: vals.status || 'pendente',
        ...(vals.categoria ? { categoria: vals.categoria } : {}),
        ...(vals.descricao && vals.descricao.trim() ? { descricao: vals.descricao.trim() } : {}),
        ...(vals.forma_recebimento ? { forma_recebimento: vals.forma_recebimento } : {}),
        ...(vals.recorrente ? { recorrente: true } : {}),
      };

      const idempotencyKey = generateIdempotencyKey();

      // Envia via api.js — centralizado, com cabeçalho de idempotência
      const data = await accountsReceivable.createWithKey(payload, idempotencyKey);

      toast.success('Conta a receber cadastrada com sucesso!' + (vals.recorrente ? ' Recorrência ativada.' : ''));

      const id = data && (data.id || (data.data && data.data.id));
      router.push(id ? '/accounts-receivable/' + id : '/accounts-receivable');
    } catch (e) {
      const msg = e.message || 'Erro ao salvar. Tente novamente.';
      submitError.value = msg;
      toast.error(msg);
    } finally {
      saving.value = false;
    }
  });
}

function cancel() {
  router.push('/accounts-receivable');
}
</script>

<style scoped>
/* ── Layout do formulário ─────────────────────────────────────────────────── */
form {
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-4);
}

/* ── Banner de alerta ─────────────────────────────────────────────────────── */
.alert-banner {
  display: flex;
  align-items: flex-start;
  gap: var(--ui-space-3);
  padding: var(--ui-space-3) var(--ui-space-4);
  border-radius: var(--ui-radius-md);
  font-size: var(--ui-text-sm);
  color: rgb(var(--ui-fg));
  border: 1px solid;
}

.alert-banner[data-kind="warning"] {
  background: rgb(var(--ui-warning) / 0.10);
  border-color: rgb(var(--ui-warning) / 0.35);
}

.alert-banner[data-kind="danger"] {
  background: rgb(var(--ui-danger) / 0.08);
  border-color: rgb(var(--ui-danger) / 0.35);
}

.alert-banner-icon {
  --_icon-size: var(--ui-icon-sm, 1.375rem);
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: var(--_icon-size);
  height: var(--_icon-size);
  border-radius: 50%;
  font-size: var(--ui-text-sm);
  font-weight: 800;
  line-height: 1;
}

.alert-banner[data-kind="warning"] .alert-banner-icon {
  background: rgb(var(--ui-warning) / 0.2);
  color: rgb(var(--ui-warning));
}

.alert-banner[data-kind="danger"] .alert-banner-icon {
  background: rgb(var(--ui-danger) / 0.15);
  color: rgb(var(--ui-danger));
}

.alert-banner-msg strong {
  font-weight: 700;
}


/* ── Formas de recebimento (radio estilizado) ──────────────────────────────── */
.formas-group {
  display: flex;
  flex-wrap: wrap;
  gap: var(--ui-space-2);
}

.forma-opt {
  display: flex;
  align-items: center;
  gap: var(--ui-space-1);
  padding: var(--ui-space-1) var(--ui-space-2);
  border: 2px solid rgb(var(--ui-border-strong));
  border-radius: var(--ui-radius-md);
  cursor: pointer;
  background: rgb(var(--ui-bg));
  transition: border-color 0.15s ease, background 0.15s ease, box-shadow 0.15s ease;
  user-select: none;
  white-space: nowrap;
}

.forma-opt input[type="radio"] {
  position: absolute;
  width: 1px;
  height: 1px;
  opacity: 0;
  clip: rect(0, 0, 0, 0);
}

.forma-opt:hover {
  border-color: rgb(var(--ui-accent));
  background: rgb(var(--ui-accent) / 0.05);
}

.forma-opt[data-selected="true"] {
  border-color: rgb(var(--ui-accent));
  background: rgb(var(--ui-accent) / 0.08);
  box-shadow: 0 0 0 2px rgb(var(--ui-accent) / 0.18);
}

.forma-opt:has(input[type="radio"]:focus-visible) {
  outline: 2px solid rgb(var(--ui-accent));
  outline-offset: 2px;
  border-radius: var(--ui-radius-md);
}

.forma-icon {
  --_icon-size: var(--ui-icon-sm, 1.375rem);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: var(--_icon-size);
  height: var(--_icon-size);
  border-radius: var(--ui-radius-sm);
  background: rgb(var(--ui-surface-2));
  font-size: var(--ui-text-xs);
  font-weight: 800;
  color: rgb(var(--ui-muted));
  flex-shrink: 0;
}

.forma-opt[data-selected="true"] .forma-icon {
  background: rgb(var(--ui-accent) / 0.15);
  color: rgb(var(--ui-accent));
}

.forma-label {
  font-size: var(--ui-text-sm);
  font-weight: 500;
  color: rgb(var(--ui-fg));
}

/* ── Campo valor com prefixo R$ ───────────────────────────────────────────── */
.currency-row {
  display: flex;
  align-items: stretch;
  gap: var(--ui-space-0, 0px);
}

.currency-prefix {
  display: flex;
  align-items: center;
  padding: var(--ui-space-2) var(--ui-space-2);
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

/* ── Preview de valor ─────────────────────────────────────────────────────── */
.valor-preview {
  display: flex;
  align-items: center;
  gap: var(--ui-space-2);
  padding: var(--ui-space-2) var(--ui-space-3);
  margin-top: var(--ui-space-1);
  background: rgb(var(--ui-success) / 0.08);
  border: 1px solid rgb(var(--ui-success) / 0.25);
  border-radius: var(--ui-radius-sm);
  font-size: var(--ui-text-sm);
}

.valor-preview-label {
  color: rgb(var(--ui-muted));
  flex-shrink: 0;
}

.valor-preview-value {
  font-weight: 700;
  font-size: var(--ui-text-md);
  color: rgb(var(--ui-fg));
  font-variant-numeric: tabular-nums;
}

/* ── Toggle de recorrência ────────────────────────────────────────────────── */
.recorrencia-toggle-wrap {
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-3);
}

.recorrencia-toggle {
  display: flex;
  align-items: center;
  gap: var(--ui-space-3);
  padding: var(--ui-space-3) var(--ui-space-4);
  background: rgb(var(--ui-surface));
  border: 2px solid rgb(var(--ui-border-strong));
  border-radius: var(--ui-radius-md);
  cursor: pointer;
  text-align: left;
  width: 100%;
  transition: border-color 0.15s ease, background 0.15s ease, box-shadow 0.15s ease;
}

.recorrencia-toggle:hover {
  border-color: rgb(var(--ui-accent));
  background: rgb(var(--ui-accent) / 0.03);
}

.recorrencia-toggle[data-active="true"] {
  border-color: rgb(var(--ui-accent));
  background: rgb(var(--ui-accent) / 0.06);
  box-shadow: 0 0 0 3px rgb(var(--ui-accent) / 0.12);
}

.recorrencia-toggle:focus-visible {
  outline: 2px solid rgb(var(--ui-accent));
  outline-offset: 2px;
}

/* Track do toggle switch */
.recorrencia-track {
  --_track-w: var(--ui-space-11, 2.75rem);
  --_track-h: var(--ui-space-6, 1.5rem);
  display: flex;
  align-items: center;
  flex-shrink: 0;
  width: var(--_track-w);
  height: var(--_track-h);
  background: rgb(var(--ui-border-strong));
  border-radius: calc(var(--_track-h) / 2);
  padding: var(--ui-space-px, 2px);
  transition: background 0.2s ease;
}

.recorrencia-toggle[data-active="true"] .recorrencia-track {
  background: rgb(var(--ui-accent));
}

.recorrencia-thumb {
  --_thumb-size: var(--ui-space-5, 1.25rem);
  width: var(--_thumb-size);
  height: var(--_thumb-size);
  background: rgb(var(--ui-bg));
  border-radius: 50%;
  transition: transform 0.2s ease;
  box-shadow: 0 1px 3px rgb(0 0 0 / 0.2);
  flex-shrink: 0;
}

.recorrencia-toggle[data-active="true"] .recorrencia-thumb {
  transform: translateX(var(--_thumb-size));
}

.recorrencia-text {
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-1);
}

.recorrencia-title {
  font-size: var(--ui-text-sm);
  font-weight: 600;
  color: rgb(var(--ui-fg));
}

.recorrencia-desc {
  font-size: var(--ui-text-xs);
  color: rgb(var(--ui-muted));
  line-height: 1.4;
}

/* Info box de recorrência ativa */
.recorrencia-info {
  display: flex;
  align-items: flex-start;
  gap: var(--ui-space-2);
  padding: var(--ui-space-2) var(--ui-space-3);
  background: rgb(var(--ui-accent) / 0.07);
  border: 1px solid rgb(var(--ui-accent) / 0.25);
  border-radius: var(--ui-radius-sm);
  font-size: var(--ui-text-xs);
  color: rgb(var(--ui-fg));
  line-height: 1.5;
}

.recorrencia-info-icon {
  --_info-icon-size: var(--ui-space-4, 1rem);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: var(--_info-icon-size);
  height: var(--_info-icon-size);
  border-radius: 50%;
  background: rgb(var(--ui-accent) / 0.18);
  color: rgb(var(--ui-accent));
  font-size: var(--ui-text-xs);
  font-weight: 900;
  font-style: italic;
  margin-top: var(--ui-space-px, 0px);
}

/* ── Textarea de descrição ────────────────────────────────────────────────── */
.char-count {
  display: block;
  text-align: right;
  font-size: var(--ui-text-xs);
  color: rgb(var(--ui-faint));
  margin-top: var(--ui-space-1);
}

/* ── Ações ────────────────────────────────────────────────────────────────── */
.form-actions {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: var(--ui-space-2);
  padding-top: var(--ui-space-2);
}

/* ── Acessibilidade ───────────────────────────────────────────────────────── */
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

  .formas-group {
    gap: var(--ui-space-1);
  }

  .forma-opt {
    flex: 1 1 calc(50% - var(--ui-space-1));
    min-width: 0;
  }
}

@media (max-width: 640px) {
  .currency-row {
    flex-direction: row;
  }

  .forma-opt {
    flex: 1 1 calc(33% - var(--ui-space-1));
  }
}
</style>
