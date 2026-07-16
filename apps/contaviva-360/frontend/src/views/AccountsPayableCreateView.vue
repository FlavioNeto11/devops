<template>
  <UiPageLayout
    title="Nova Conta a Pagar"
    eyebrow="Contas a Pagar"
    subtitle="Preencha os dados para registrar uma nova despesa. Vencimentos em até 3 dias úteis geram alertas automáticos."
    width="narrow"
    :loading="saving"
    loading-message="Salvando conta a pagar…"
    :error="submitError"
    :retryable="false"
  >
    <template #actions>
      <UiButton variant="ghost" to="/accounts-payable">Voltar para lista</UiButton>
    </template>

    <!-- Banner de alerta quando vencimento está próximo (≤ 3 dias) ou já vencido -->
    <template v-if="alertaBanner" #banner>
      <div class="alert-banner" :data-tone="alertaTone" role="alert" aria-live="polite">
        <span class="alert-banner-icon" aria-hidden="true">{{ alertaTone === 'danger' ? '✕' : '!' }}</span>
        <span class="alert-banner-msg">
          <strong>{{ alertaTone === 'danger' ? 'Data vencida:' : 'Vencimento próximo:' }}</strong>
          {{ alertaTexto }}
        </span>
      </div>
    </template>

    <form novalidate @submit.prevent="submit">

      <!-- ── Seção 1: Identificação ── -->
      <UiCard
        title="Fornecedor e Valor"
        subtitle="Quem cobra, quanto e quando vence."
      >
        <UiFormSection :columns="2">

          <!-- Fornecedor -->
          <UiFormField
            label="Fornecedor"
            :required="true"
            :error="f.errors.contraparte"
            hint="Nome do fornecedor, prestador ou credor."
            :full-width="true"
          >
            <template #default="{ id, describedBy }">
              <UiInput
                :id="id"
                :described-by="describedBy"
                :model-value="f.values.contraparte"
                placeholder="Ex.: Locadora ABC, Copel, Bradesco…"
                autocomplete="organization"
                :required="true"
                :error="!!f.errors.contraparte"
                @update:model-value="f.setField('contraparte', $event)"
              />
            </template>
          </UiFormField>

          <!-- Valor -->
          <UiFormField
            label="Valor (R$)"
            :required="true"
            :error="f.errors.valor"
            hint="Valor total da despesa. Use vírgula para centavos."
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
                  :error="!!f.errors.valor"
                  @update:model-value="onValorInput($event)"
                  @change="onValorChange($event.target?.value ?? $event)"
                />
              </div>
            </template>
          </UiFormField>

          <!-- Data de Vencimento -->
          <UiFormField
            label="Data de Vencimento"
            :required="true"
            :error="f.errors.data"
            hint="Data-limite para pagamento da despesa."
          >
            <template #default="{ id, describedBy }">
              <UiInput
                :id="id"
                :described-by="describedBy"
                type="date"
                :model-value="f.values.data"
                :required="true"
                :error="!!f.errors.data"
                @update:model-value="onDataChange($event)"
              />
            </template>
          </UiFormField>

          <!-- Forma de Pagamento -->
          <UiFormField
            label="Forma de Pagamento"
            :error="f.errors.forma_pagamento"
            hint="Método previsto para quitar esta despesa."
          >
            <template #default="{ id, describedBy }">
              <select
                :id="id"
                :aria-describedby="describedBy"
                :value="f.values.forma_pagamento"
                :data-error="!!f.errors.forma_pagamento"
                @change="f.setField('forma_pagamento', $event.target.value)"
              >
                <option value="">Selecione a forma…</option>
                <option value="boleto">Boleto</option>
                <option value="TED">TED</option>
                <option value="cartão">Cartão</option>
                <option value="cheque">Cheque</option>
                <option value="dinheiro">Dinheiro</option>
              </select>
            </template>
          </UiFormField>

        </UiFormSection>
      </UiCard>

      <!-- ── Seção 2: Classificação ── -->
      <UiCard
        title="Classificação"
        subtitle="Categoria e centro de custo para relatórios gerenciais."
      >
        <UiFormSection :columns="2">

          <!-- Categoria -->
          <UiFormField
            label="Categoria"
            :error="f.errors.categoria"
            hint="Ex.: Aluguel, Energia, Folha, Fornecedor, TI…"
          >
            <template #default="{ id, describedBy }">
              <UiInput
                :id="id"
                :described-by="describedBy"
                :model-value="f.values.categoria"
                placeholder="Ex.: Aluguel"
                :error="!!f.errors.categoria"
                @update:model-value="f.setField('categoria', $event)"
              />
            </template>
          </UiFormField>

          <!-- Centro de Custo -->
          <UiFormField
            label="Centro de Custo"
            :error="f.errors.centro_custo"
            hint="Unidade, departamento ou projeto associado."
          >
            <template #default="{ id, describedBy }">
              <UiInput
                :id="id"
                :described-by="describedBy"
                :model-value="f.values.centro_custo"
                placeholder="Ex.: ADM, TI, Filial SP…"
                :error="!!f.errors.centro_custo"
                @update:model-value="f.setField('centro_custo', $event)"
              />
            </template>
          </UiFormField>

        </UiFormSection>
      </UiCard>

      <!-- ── Seção 3: Recorrência ── -->
      <UiCard
        title="Recorrência"
        subtitle="Configure se esta conta se repete automaticamente."
      >
        <UiFormSection :columns="1">

          <!-- Toggle Recorrente -->
          <UiFormField
            label="Esta conta é recorrente?"
            :error="f.errors.recorrente"
            hint="Ative para despesas que se repetem em períodos fixos (aluguel, mensalidades etc.)."
          >
            <template #default="{ id }">
              <div class="toggle-row">
                <button
                  :id="id"
                  type="button"
                  role="switch"
                  class="toggle-switch"
                  :aria-checked="f.values.recorrente ? 'true' : 'false'"
                  :data-on="f.values.recorrente ? 'true' : 'false'"
                  @click="onRecorrenteToggle"
                >
                  <span class="toggle-knob" aria-hidden="true" />
                </button>
                <span class="toggle-label" :data-on="f.values.recorrente ? 'true' : 'false'">
                  {{ f.values.recorrente ? 'Sim — repete periodicamente' : 'Não — pagamento único' }}
                </span>
              </div>
            </template>
          </UiFormField>

          <!-- Tipo de Recorrência (visível apenas quando recorrente=true) -->
          <UiFormField
            v-if="f.values.recorrente"
            label="Tipo de Recorrência"
            :required="true"
            :error="f.errors.recorrencia_tipo"
            hint="Com que frequência esta despesa se repete?"
          >
            <template #default="{ id, describedBy }">
              <div class="recorrencia-grid" role="group" :aria-labelledby="id + '-legend'">
                <span :id="id + '-legend'" class="visually-hidden">Tipo de recorrência</span>
                <label
                  v-for="opt in RECORRENCIA_OPTS"
                  :key="opt.value"
                  class="recorrencia-opt"
                  :data-selected="f.values.recorrencia_tipo === opt.value"
                >
                  <input
                    type="radio"
                    name="recorrencia_tipo"
                    :value="opt.value"
                    :aria-describedby="describedBy"
                    :checked="f.values.recorrencia_tipo === opt.value"
                    @change="f.setField('recorrencia_tipo', opt.value)"
                  />
                  <span class="recorrencia-glyph" aria-hidden="true">{{ opt.glyph }}</span>
                  <span class="recorrencia-text">
                    <strong>{{ opt.label }}</strong>
                    <small>{{ opt.desc }}</small>
                  </span>
                </label>
              </div>
              <p
                v-if="f.errors.recorrencia_tipo"
                class="recorrencia-error"
                role="alert"
                :id="describedBy"
              >
                {{ f.errors.recorrencia_tipo }}
              </p>
            </template>
          </UiFormField>

        </UiFormSection>
      </UiCard>

      <!-- ── Seção 4: Descrição ── -->
      <UiCard
        title="Descrição"
        subtitle="Contexto adicional, referências e observações internas."
      >
        <UiFormSection :columns="1">

          <UiFormField
            label="Descrição"
            :error="f.errors.descricao"
            hint="Referências, notas fiscais, contratos ou observações relevantes."
            :full-width="true"
          >
            <template #default="{ id, describedBy }">
              <textarea
                :id="id"
                :aria-describedby="describedBy"
                :value="f.values.descricao"
                class="descricao-textarea"
                rows="4"
                placeholder="Ex.: NF nº 4521 emitida em 01/07/2026. Referente contrato nº 88/2025."
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
          Salvar Conta a Pagar
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
import { accountsPayable } from '../api.js';

// ── Router / Toast ────────────────────────────────────────────────────────────
const router = useRouter();
const toast = useToast();

// ── Estado de UI ──────────────────────────────────────────────────────────────
const saving = ref(false);
const submitError = ref(null);

// ── Constantes de domínio ─────────────────────────────────────────────────────
const RECORRENCIA_OPTS = [
  { value: 'semanal',    label: 'Semanal',    desc: 'A cada 7 dias',   glyph: 'W' },
  { value: 'mensal',     label: 'Mensal',     desc: 'Todo mês',        glyph: 'M' },
  { value: 'trimestral', label: 'Trimestral', desc: 'A cada 3 meses',  glyph: 'T' },
  { value: 'semestral',  label: 'Semestral',  desc: 'A cada 6 meses',  glyph: 'S' },
  { value: 'anual',      label: 'Anual',      desc: 'Uma vez por ano', glyph: 'A' },
];

// ── Formulário ────────────────────────────────────────────────────────────────
const f = useForm({
  initial: {
    contraparte:     '',
    valor:           '',
    data:            '',
    categoria:       '',
    centro_custo:    '',
    descricao:       '',
    forma_pagamento: '',
    recorrente:      false,
    recorrencia_tipo: '',
  },
  rules: {
    contraparte: [validators.required('Informe o nome do fornecedor'), validators.minLen(2, 'Nome muito curto')],
    valor:       [validators.required('Informe o valor da despesa'), validators.numeric('Valor inválido'), validators.min(0.01, 'O valor deve ser positivo')],
    data:        [validators.required('Informe a data de vencimento')],
    recorrencia_tipo: [(v, all) => all && all.recorrente && !v ? 'Selecione o tipo de recorrência' : ''],
  },
});

// ── Campo Valor (CurrencyInput) ───────────────────────────────────────────────
const valorDisplay = ref('');

function onValorInput(val) {
  valorDisplay.value = val;
}

function onValorChange(val) {
  const normalized = String(val).replace(/\./g, '').replace(',', '.');
  const n = parseFloat(normalized);
  if (val === '' || val === null || val === undefined) {
    f.setField('valor', '');
    valorDisplay.value = '';
  } else if (isFinite(n) && n > 0) {
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

// ── Data de Vencimento ────────────────────────────────────────────────────────
function onDataChange(val) {
  f.setField('data', val);
}

// ── Banner de alerta de vencimento ────────────────────────────────────────────
const diasParaVencer = computed(() => {
  if (!f.values.data) return null;
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const venc = new Date(f.values.data + 'T00:00:00');
  if (isNaN(venc.getTime())) return null;
  return Math.ceil((venc - hoje) / (1000 * 60 * 60 * 24));
});

const alertaTone = computed(() => {
  const d = diasParaVencer.value;
  if (d === null) return null;
  return d < 0 ? 'danger' : 'warning';
});

const alertaBanner = computed(() => {
  const d = diasParaVencer.value;
  return d !== null && d <= 3;
});

const alertaTexto = computed(() => {
  const d = diasParaVencer.value;
  if (d === null) return '';
  if (d < 0) return `Esta despesa venceu há ${Math.abs(d)} dia(s). Confirme se deseja registrá-la assim.`;
  if (d === 0) return 'Esta despesa vence hoje.';
  return `Esta despesa vence em ${d} dia(s). Um alerta será registrado ao salvar.`;
});

// ── Toggle Recorrente ─────────────────────────────────────────────────────────
function onRecorrenteToggle() {
  const novoValor = !f.values.recorrente;
  f.setField('recorrente', novoValor);
  if (!novoValor) {
    f.setField('recorrencia_tipo', '');
  }
}

// ── Idempotency Key ───────────────────────────────────────────────────────────
function generateIdempotencyKey() {
  return 'ap-' + Date.now() + '-' + Math.random().toString(36).slice(2, 9);
}

// ── Submit ────────────────────────────────────────────────────────────────────
function submit() {
  submitError.value = null;
  f.handleSubmit(async (vals) => {
    saving.value = true;
    try {
      const idempotencyKey = generateIdempotencyKey();
      const payload = {
        contraparte: vals.contraparte.trim(),
        valor:       Number(vals.valor),
        data:        vals.data,
        ...(vals.categoria    ? { categoria:    vals.categoria.trim()    } : {}),
        ...(vals.centro_custo ? { centro_custo: vals.centro_custo.trim() } : {}),
        ...(vals.descricao    ? { descricao:    vals.descricao.trim()    } : {}),
        ...(vals.forma_pagamento ? { forma_pagamento: vals.forma_pagamento } : {}),
        recorrente: Boolean(vals.recorrente),
        ...(vals.recorrente && vals.recorrencia_tipo ? { recorrencia_tipo: vals.recorrencia_tipo } : {}),
        status: 'pendente',
      };

      const created = await accountsPayable.createIdempotent(payload, idempotencyKey);
      toast.success('Conta a pagar cadastrada com sucesso!');

      const id = created && (created.id || (created.data && created.data.id));
      if (id) {
        router.push('/accounts-payable/' + id);
      } else {
        router.push('/accounts-payable');
      }
    } catch (e) {
      const msg = (e && e.message) || 'Erro ao salvar. Tente novamente.';
      submitError.value = msg;
      toast.error(msg);
    } finally {
      saving.value = false;
    }
  });
}

function cancel() {
  router.push('/accounts-payable');
}
</script>

<style scoped>
/* ── Layout do formulário ────────────────────────────────────────────────────── */
form {
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-4);
}

/* ── Banner de alerta de vencimento ─────────────────────────────────────────── */
.alert-banner {
  display: flex;
  align-items: flex-start;
  gap: var(--ui-space-3);
  padding: var(--ui-space-3) var(--ui-space-4);
  border-radius: var(--ui-radius-md);
  font-size: var(--ui-text-sm);
  color: rgb(var(--ui-fg));
  background: rgb(var(--ui-warning) / 0.10);
  border: 1px solid rgb(var(--ui-warning) / 0.35);
}

.alert-banner[data-tone="danger"] {
  background: rgb(var(--ui-danger) / 0.10);
  border-color: rgb(var(--ui-danger) / 0.35);
}

.alert-banner-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  font-size: var(--ui-text-xs);
  font-weight: 800;
  flex-shrink: 0;
  background: rgb(var(--ui-warning) / 0.25);
  color: rgb(var(--ui-warning));
  margin-top: var(--ui-space-px, 1px);
}

.alert-banner[data-tone="danger"] .alert-banner-icon {
  background: rgb(var(--ui-danger) / 0.25);
  color: rgb(var(--ui-danger));
}

.alert-banner-msg strong {
  font-weight: 700;
  margin-right: var(--ui-space-1);
}

/* ── Selects ─────────────────────────────────────────────────────────────────── */
select {
  background: rgb(var(--ui-bg));
  color: rgb(var(--ui-fg));
  border: 1px solid rgb(var(--ui-border-strong));
  border-radius: var(--ui-radius-sm);
  padding: var(--ui-space-2) var(--ui-space-3);
  font: inherit;
  font-size: var(--ui-text-md);
  width: 100%;
  appearance: none;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'%3E%3Cpath d='M1 1l5 5 5-5' stroke='%23888' stroke-width='1.5' fill='none' stroke-linecap='round'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right var(--ui-space-3) center;
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

/* ── Campo valor com prefixo R$ ─────────────────────────────────────────────── */
.currency-row {
  display: flex;
  align-items: stretch;
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
  user-select: none;
}

.currency-row :deep(.ui-input) {
  border-radius: 0 var(--ui-radius-sm) var(--ui-radius-sm) 0;
}

/* ── Toggle Recorrente ──────────────────────────────────────────────────────── */
.toggle-row {
  display: flex;
  align-items: center;
  gap: var(--ui-space-3);
  padding: var(--ui-space-3) 0;
}

.toggle-switch {
  position: relative;
  width: 48px;
  height: 26px;
  border-radius: 13px;
  border: none;
  cursor: pointer;
  flex-shrink: 0;
  background: rgb(var(--ui-border-strong));
  transition: background 0.2s ease;
  padding: 0;
}

.toggle-switch[data-on="true"] {
  background: rgb(var(--ui-accent));
}

.toggle-switch:focus-visible {
  outline: 2px solid rgb(var(--ui-accent));
  outline-offset: 3px;
}

.toggle-knob {
  position: absolute;
  top: 3px;
  left: 3px;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: rgb(var(--ui-bg));
  box-shadow: 0 1px 3px rgb(0 0 0 / 0.2);
  transition: transform 0.2s ease;
  display: block;
}

.toggle-switch[data-on="true"] .toggle-knob {
  transform: translateX(22px);
}

.toggle-label {
  font-size: var(--ui-text-sm);
  color: rgb(var(--ui-muted));
  transition: color 0.15s ease;
}

.toggle-label[data-on="true"] {
  color: rgb(var(--ui-fg));
  font-weight: 500;
}

/* ── Opções de Recorrência ──────────────────────────────────────────────────── */
.recorrencia-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: var(--ui-space-2);
  margin-top: var(--ui-space-1);
}

.recorrencia-opt {
  display: flex;
  align-items: center;
  gap: var(--ui-space-2);
  padding: var(--ui-space-3);
  border: 2px solid rgb(var(--ui-border-strong));
  border-radius: var(--ui-radius-md);
  cursor: pointer;
  transition: border-color 0.15s ease, background 0.15s ease, box-shadow 0.15s ease;
  background: rgb(var(--ui-bg));
  user-select: none;
}

.recorrencia-opt input[type="radio"] {
  position: absolute;
  opacity: 0;
  width: 1px;
  height: 1px;
  margin: -1px;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

.recorrencia-opt:has(input[type="radio"]:focus-visible) {
  outline: 2px solid rgb(var(--ui-accent));
  outline-offset: 2px;
}

.recorrencia-opt:hover {
  border-color: rgb(var(--ui-accent));
  background: rgb(var(--ui-accent) / 0.05);
}

.recorrencia-opt[data-selected="true"] {
  border-color: rgb(var(--ui-accent));
  background: rgb(var(--ui-accent) / 0.08);
  box-shadow: 0 0 0 3px rgb(var(--ui-accent) / 0.15);
}

.recorrencia-glyph {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  border-radius: var(--ui-radius-sm);
  background: rgb(var(--ui-surface-2));
  font-size: var(--ui-text-xs);
  font-weight: 800;
  color: rgb(var(--ui-muted));
  flex-shrink: 0;
  font-family: var(--ui-font-display, monospace);
  transition: background 0.15s ease, color 0.15s ease;
}

.recorrencia-opt[data-selected="true"] .recorrencia-glyph {
  background: rgb(var(--ui-accent) / 0.18);
  color: rgb(var(--ui-accent));
}

.recorrencia-text {
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-px, 1px);
}

.recorrencia-text strong {
  font-size: var(--ui-text-sm);
  font-weight: 600;
  color: rgb(var(--ui-fg));
}

.recorrencia-text small {
  font-size: var(--ui-text-xs);
  color: rgb(var(--ui-muted));
}

.recorrencia-error {
  margin: var(--ui-space-2) 0 0;
  font-size: var(--ui-text-xs);
  color: rgb(var(--ui-danger));
}

/* ── Textarea de descrição ──────────────────────────────────────────────────── */
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
  min-height: 96px;
  line-height: 1.6;
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

/* ── Ações do formulário ────────────────────────────────────────────────────── */
.form-actions {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: var(--ui-space-2);
  padding-top: var(--ui-space-2);
}

/* ── a11y ───────────────────────────────────────────────────────────────────── */
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

/* ── Responsivo ≤860px ──────────────────────────────────────────────────────── */
@media (max-width: 860px) {
  .form-actions {
    flex-direction: column-reverse;
    align-items: stretch;
  }

  .recorrencia-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}

@media (max-width: 520px) {
  .recorrencia-grid {
    grid-template-columns: 1fr;
  }

  .toggle-row {
    flex-wrap: wrap;
  }
}
</style>
