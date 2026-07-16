<template>
  <UiPageLayout
    title="Novo Lançamento"
    eyebrow="Receitas e Despesas"
    subtitle="Registre uma nova receita ou despesa associada a uma entidade (PF ou PJ)."
    width="narrow"
    :loading="f.submitting.value"
    loading-message="Salvando lançamento…"
    :error="submitError"
    :retryable="false"
  >
    <template #actions>
      <UiButton variant="ghost" to="/income-expenses">Voltar para lista</UiButton>
    </template>

    <!-- Banner contextual de tipo (receita vs despesa) -->
    <template v-if="f.values.tipo" #banner>
      <div class="tipo-banner" :data-tipo="f.values.tipo" role="status" aria-live="polite">
        <span class="tipo-banner-dot" aria-hidden="true" />
        <span class="tipo-banner-text">
          Você está registrando
          <strong>{{ f.values.tipo === 'receita' ? 'uma Receita' : 'uma Despesa' }}</strong>
          {{ f.values.tipo === 'receita' ? '— uma entrada de recursos.' : '— uma saída de recursos.' }}
        </span>
      </div>
    </template>

    <form novalidate @submit.prevent="submit">

      <!-- ── Seção 1: Tipo do Lançamento ── -->
      <UiCard
        title="Tipo do Lançamento"
        subtitle="Informe se este lançamento é uma receita (entrada) ou despesa (saída)."
      >
        <UiFormSection :columns="1">
          <UiFormField
            label="Tipo"
            :required="true"
            :error="f.errors.tipo"
            hint="Receita = entrada de dinheiro; Despesa = saída de dinheiro."
          >
            <template #default="{ id, describedBy }">
              <div
                class="tipo-selector"
                role="group"
                :aria-labelledby="id + '-label'"
                :aria-describedby="describedBy"
              >
                <span :id="id + '-label'" class="visually-hidden">Tipo do lançamento</span>
                <label
                  class="tipo-opt"
                  :data-selected="f.values.tipo === 'receita'"
                  :data-tipo="'receita'"
                >
                  <input
                    type="radio"
                    name="tipo"
                    value="receita"
                    :checked="f.values.tipo === 'receita'"
                    @change="f.setField('tipo', 'receita')"
                  />
                  <span class="tipo-icon" aria-hidden="true">+</span>
                  <span class="tipo-info">
                    <strong>Receita</strong>
                    <small>Entrada de recursos</small>
                  </span>
                </label>
                <label
                  class="tipo-opt"
                  :data-selected="f.values.tipo === 'despesa'"
                  :data-tipo="'despesa'"
                >
                  <input
                    type="radio"
                    name="tipo"
                    value="despesa"
                    :checked="f.values.tipo === 'despesa'"
                    @change="f.setField('tipo', 'despesa')"
                  />
                  <span class="tipo-icon" aria-hidden="true">-</span>
                  <span class="tipo-info">
                    <strong>Despesa</strong>
                    <small>Saída de recursos</small>
                  </span>
                </label>
              </div>
            </template>
          </UiFormField>
        </UiFormSection>
      </UiCard>

      <!-- ── Seção 2: Entidade (EntityPicker) ── -->
      <UiCard
        title="Entidade"
        subtitle="Selecione o tipo e informe o ID da Pessoa Física ou Jurídica vinculada a este lançamento."
      >
        <UiFormSection :columns="2">

          <!-- Tipo de Entidade -->
          <UiFormField
            label="Tipo de Entidade"
            :required="true"
            :error="f.errors.entity_type"
            hint="PF = Pessoa Física, PJ = Pessoa Jurídica."
          >
            <template #default="{ id, describedBy }">
              <select
                :id="id"
                :aria-describedby="describedBy"
                :value="f.values.entity_type"
                :data-error="!!f.errors.entity_type"
                @change="onEntityTypeChange($event.target.value)"
              >
                <option value="">Selecione o tipo…</option>
                <option value="pf">Pessoa Física (PF)</option>
                <option value="pj">Pessoa Jurídica (PJ)</option>
              </select>
            </template>
          </UiFormField>

          <!-- ID da Entidade -->
          <UiFormField
            label="ID da Entidade"
            :required="true"
            :error="f.errors.entity_id"
            :hint="entityIdHint"
          >
            <template #default="{ id, describedBy }">
              <div class="entity-id-row">
                <UiInput
                  :id="id"
                  :described-by="describedBy"
                  type="text"
                  inputmode="numeric"
                  pattern="[0-9]+"
                  :model-value="String(f.values.entity_id || '')"
                  placeholder="Ex.: 1"
                  :disabled="!f.values.entity_type"
                  :error="!!f.errors.entity_id"
                  :required="true"
                  @update:model-value="f.setField('entity_id', $event ? Number($event) : '')"
                />
                <span v-if="f.values.entity_type" class="entity-type-badge" :data-type="f.values.entity_type">
                  {{ f.values.entity_type === 'pf' ? 'PF' : 'PJ' }}
                </span>
              </div>
            </template>
          </UiFormField>

        </UiFormSection>
      </UiCard>

      <!-- ── Seção 3: Valor e Data ── -->
      <UiCard
        title="Valor e Data"
        subtitle="Informe o valor e a data de competência do lançamento."
      >
        <UiFormSection :columns="2">

          <!-- Valor (CurrencyInput) -->
          <UiFormField
            label="Valor (R$)"
            :required="true"
            :error="f.errors.valor"
            hint="Valor do lançamento. Use vírgula para centavos (ex.: 1.500,00)."
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
                  @change="onValorChange($event)"
                />
              </div>
            </template>
          </UiFormField>

          <!-- Data -->
          <UiFormField
            label="Data"
            :required="true"
            :error="f.errors.data"
            hint="Data de competência ou ocorrência do lançamento."
          >
            <template #default="{ id, describedBy }">
              <UiInput
                :id="id"
                :described-by="describedBy"
                type="date"
                :model-value="f.values.data"
                :required="true"
                :error="!!f.errors.data"
                @update:model-value="f.setField('data', $event)"
              />
            </template>
          </UiFormField>

        </UiFormSection>
      </UiCard>

      <!-- ── Seção 4: Classificação ── -->
      <UiCard
        title="Classificação"
        subtitle="Dados opcionais para organização e relatórios gerenciais."
      >
        <UiFormSection :columns="2">

          <!-- Categoria -->
          <UiFormField
            label="Categoria"
            :error="f.errors.categoria"
            hint="Ex.: Aluguel, Honorários, Vendas, Energia…"
          >
            <template #default="{ id, describedBy }">
              <UiInput
                :id="id"
                :described-by="describedBy"
                :model-value="f.values.categoria"
                placeholder="Ex.: Honorários contábeis"
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
                placeholder="Ex.: ADM, Filial SP, Projeto X…"
                :error="!!f.errors.centro_custo"
                @update:model-value="f.setField('centro_custo', $event)"
              />
            </template>
          </UiFormField>

          <!-- Contraparte -->
          <UiFormField
            label="Contraparte"
            :error="f.errors.contraparte"
            hint="Nome do pagador (receita) ou fornecedor/credor (despesa)."
            :full-width="true"
          >
            <template #default="{ id, describedBy }">
              <UiInput
                :id="id"
                :described-by="describedBy"
                :model-value="f.values.contraparte"
                placeholder="Ex.: Empresa ABC Ltda., João Silva…"
                autocomplete="off"
                :error="!!f.errors.contraparte"
                @update:model-value="f.setField('contraparte', $event)"
              />
            </template>
          </UiFormField>

          <!-- Status -->
          <UiFormField
            label="Status"
            :error="f.errors.status"
            hint="Situação atual do lançamento."
          >
            <template #default="{ id, describedBy }">
              <select
                :id="id"
                :aria-describedby="describedBy"
                :value="f.values.status"
                :data-error="!!f.errors.status"
                @change="f.setField('status', $event.target.value)"
              >
                <option value="">Selecione o status…</option>
                <option value="pendente">Pendente</option>
                <option value="confirmado">Confirmado</option>
                <option value="cancelado">Cancelado</option>
                <option value="liquidado">Liquidado</option>
              </select>
            </template>
          </UiFormField>

        </UiFormSection>
      </UiCard>

      <!-- ── Seção 5: Recorrência (RecorrenciaToggle) ── -->
      <UiCard
        title="Recorrência"
        subtitle="Configure se este lançamento se repete automaticamente em períodos fixos."
      >
        <UiFormSection :columns="1">

          <!-- Toggle Recorrente -->
          <UiFormField
            label="Este lançamento é recorrente?"
            :error="f.errors.recorrente"
            hint="Ative para receitas/despesas que se repetem (mensalidades, aluguéis, salários etc.)."
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
                  {{ f.values.recorrente ? 'Sim — repete periodicamente' : 'Não — lançamento único' }}
                </span>
              </div>
            </template>
          </UiFormField>

          <!-- Frequência de recorrência (visível apenas quando recorrente=true) -->
          <UiFormField
            v-if="f.values.recorrente"
            label="Frequência de Recorrência"
            :required="true"
            :error="f.errors.recorrencia_freq"
            hint="Com que periodicidade este lançamento se repete?"
          >
            <template #default="{ id, describedBy }">
              <div class="recorrencia-grid" role="group" :aria-labelledby="id + '-legend'">
                <span :id="id + '-legend'" class="visually-hidden">Frequência de recorrência</span>
                <label
                  v-for="opt in RECORRENCIA_OPTS"
                  :key="opt.value"
                  class="recorrencia-opt"
                  :data-selected="f.values.recorrencia_freq === opt.value"
                >
                  <input
                    type="radio"
                    name="recorrencia_freq"
                    :value="opt.value"
                    :aria-describedby="describedBy"
                    :checked="f.values.recorrencia_freq === opt.value"
                    @change="f.setField('recorrencia_freq', opt.value)"
                  />
                  <span class="recorrencia-glyph" aria-hidden="true">{{ opt.glyph }}</span>
                  <span class="recorrencia-text">
                    <strong>{{ opt.label }}</strong>
                    <small>{{ opt.desc }}</small>
                  </span>
                </label>
              </div>
            </template>
          </UiFormField>

        </UiFormSection>
      </UiCard>

      <!-- ── Seção 6: Descrição ── -->
      <UiCard
        title="Descrição"
        subtitle="Contexto adicional, referências e observações internas sobre o lançamento."
      >
        <UiFormSection :columns="1">
          <UiFormField
            label="Descrição"
            :error="f.errors.descricao"
            hint="NF, contrato, referências ou observações relevantes (máx. 2000 caracteres)."
            :full-width="true"
          >
            <template #default="{ id, describedBy }">
              <textarea
                :id="id"
                :aria-describedby="describedBy"
                :value="f.values.descricao"
                class="descricao-textarea"
                rows="4"
                placeholder="Ex.: NF nº 5210 referente ao contrato nº 42/2026. Competência: julho/2026."
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
          {{ f.values.tipo === 'receita' ? 'Salvar Receita' : f.values.tipo === 'despesa' ? 'Salvar Despesa' : 'Salvar Lançamento' }}
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
import { resourceFactory } from '../api.js';

// ── API ───────────────────────────────────────────────────────────────────────
const incomeExpenses = resourceFactory('income-expenses');

// ── Router / Toast ────────────────────────────────────────────────────────────
const router = useRouter();
const toast = useToast();

// ── Estado de UI ──────────────────────────────────────────────────────────────
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
    entity_type:      '',
    entity_id:        '',
    tipo:             '',
    categoria:        '',
    descricao:        '',
    valor:            '',
    data:             '',
    recorrente:       false,
    recorrencia_freq: '',
    centro_custo:     '',
    contraparte:      '',
    status:           '',
  },
  rules: {
    entity_type: [validators.required('Selecione o tipo de entidade (PF ou PJ)')],
    entity_id:   [
      validators.required('Informe o ID da entidade'),
      validators.numeric('ID deve ser um número'),
      validators.min(1, 'ID deve ser um número positivo'),
    ],
    tipo:  [validators.required('Selecione o tipo do lançamento (receita ou despesa)')],
    valor: [
      validators.required('Informe o valor do lançamento'),
      validators.numeric('Valor inválido'),
      validators.min(0.01, 'O valor deve ser positivo'),
    ],
    data: [validators.required('Informe a data do lançamento')],
    recorrencia_freq: [
      (v, all) => all && all.recorrente && !v ? 'Selecione a frequência de recorrência' : '',
    ],
  },
});

// ── Hint dinâmico do entity_id ────────────────────────────────────────────────
const entityIdHint = computed(() => {
  if (!f.values.entity_type) return 'Selecione primeiro o tipo de entidade.';
  return f.values.entity_type === 'pf'
    ? 'ID numérico da Pessoa Física cadastrada no sistema.'
    : 'ID numérico da Pessoa Jurídica cadastrada no sistema.';
});

// ── Campo Valor (CurrencyInput) ───────────────────────────────────────────────
const valorDisplay = ref('');

function onValorInput(val) {
  valorDisplay.value = val;
  // Atualiza f.values.valor imediatamente para que o submit via Enter não falhe na validação
  const n = parseFloat(String(val).replace(/\./g, '').replace(',', '.'));
  if (isFinite(n) && n > 0) {
    f.setField('valor', String(n));
  } else {
    f.setField('valor', '');
  }
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

// ── Entity Type Change ────────────────────────────────────────────────────────
function onEntityTypeChange(val) {
  f.setField('entity_type', val);
  // Limpa o entity_id ao trocar o tipo para evitar IDs cruzados
  if (f.values.entity_id) {
    f.setField('entity_id', '');
  }
}

// ── Toggle Recorrente ─────────────────────────────────────────────────────────
function onRecorrenteToggle() {
  const novoValor = !f.values.recorrente;
  f.setField('recorrente', novoValor);
  if (!novoValor) {
    f.setField('recorrencia_freq', '');
  }
}

// ── Idempotency Key ───────────────────────────────────────────────────────────
function generateIdempotencyKey() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return 'ie-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2);
}

// ── Submit ────────────────────────────────────────────────────────────────────
function submit() {
  submitError.value = null;
  f.handleSubmit(async (vals) => {
    try {
      const payload = {
        entity_type: vals.entity_type,
        entity_id:   Number(vals.entity_id),
        tipo:        vals.tipo,
        valor:       Number(vals.valor),
        data:        vals.data,
        recorrente:  Boolean(vals.recorrente),
        ...(vals.categoria    ? { categoria:    vals.categoria.trim()    } : {}),
        ...(vals.descricao    ? { descricao:    vals.descricao.trim()    } : {}),
        ...(vals.centro_custo ? { centro_custo: vals.centro_custo.trim() } : {}),
        ...(vals.contraparte  ? { contraparte:  vals.contraparte.trim()  } : {}),
        ...(vals.status       ? { status:       vals.status              } : {}),
        ...(vals.recorrente && vals.recorrencia_freq
          ? { recorrencia_freq: vals.recorrencia_freq }
          : {}),
        idempotency_key: generateIdempotencyKey(),
      };

      const created = await incomeExpenses.create(payload);
      toast.success(
        vals.tipo === 'receita'
          ? 'Receita registrada com sucesso!'
          : 'Despesa registrada com sucesso!'
      );

      const id = created && (created.id || (created.data && created.data.id));
      if (id) {
        router.push('/income-expenses/' + id);
      } else {
        router.push('/income-expenses');
      }
    } catch (e) {
      const msg = (e && e.message) || 'Erro ao salvar. Tente novamente.';
      submitError.value = msg;
      toast.error(msg);
    }
  });
}

function cancel() {
  router.push('/income-expenses');
}
</script>

<style scoped>
/* ── Variáveis locais mapeadas em tokens (componentes de tamanho fixo) ───────── */
/*    Toda dimensão fixa vive aqui — zero literal px/em no restante do arquivo.  */
:root, :host {
  --_toggle-width:        var(--ui-size-12, 3rem);   /* 48px */
  --_toggle-height:       var(--ui-size-6-half, 1.625rem); /* 26px */
  --_toggle-radius:       var(--ui-radius-full, 9999px);
  --_toggle-knob-offset:  var(--ui-space-px, 3px);   /* 3px */
  --_toggle-knob-size:    var(--ui-size-5, 1.25rem);  /* 20px */
  --_toggle-translate:    var(--ui-size-5-half, 1.375rem); /* 22px */
  --_tipo-icon-size:      var(--ui-size-10, 2.5rem);  /* 40px */
  --_tipo-icon-font:      var(--ui-text-xl, 1.5rem);
  --_recorrencia-glyph-size: var(--ui-size-8, 1.875rem); /* 30px */
  --_outline-offset:      var(--ui-space-1, 0.25rem); /* 3-4px */
  --_textarea-min-h:      var(--ui-size-24, 6rem);    /* 96px */
  --_dot-size:            var(--ui-size-2-half, 0.625rem); /* 10px */
}

/* ── Layout do formulário ────────────────────────────────────────────────────── */
form {
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-4);
}

/* ── Banner de tipo ──────────────────────────────────────────────────────────── */
.tipo-banner {
  display: flex;
  align-items: center;
  gap: var(--ui-space-2);
  padding: var(--ui-space-3) var(--ui-space-4);
  border-radius: var(--ui-radius-md);
  font-size: var(--ui-text-sm);
  background: rgb(var(--ui-surface-2));
  border: 1px solid rgb(var(--ui-border));
  color: rgb(var(--ui-fg));
}

.tipo-banner[data-tipo="receita"] {
  background: rgb(var(--ui-success) / 0.08);
  border-color: rgb(var(--ui-success) / 0.3);
}

.tipo-banner[data-tipo="despesa"] {
  background: rgb(var(--ui-danger) / 0.08);
  border-color: rgb(var(--ui-danger) / 0.3);
}

.tipo-banner-dot {
  width: var(--_dot-size);
  height: var(--_dot-size);
  border-radius: 50%;
  flex-shrink: 0;
  background: rgb(var(--ui-muted));
}

.tipo-banner[data-tipo="receita"] .tipo-banner-dot {
  background: rgb(var(--ui-success));
}

.tipo-banner[data-tipo="despesa"] .tipo-banner-dot {
  background: rgb(var(--ui-danger));
}

.tipo-banner-text strong {
  font-weight: 700;
}

/* ── TypeSelect — Seletor de Tipo (Receita / Despesa) ───────────────────────── */
.tipo-selector {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--ui-space-3);
  margin-top: var(--ui-space-1);
}

.tipo-opt {
  display: flex;
  align-items: center;
  gap: var(--ui-space-3);
  padding: var(--ui-space-4);
  border: 2px solid rgb(var(--ui-border-strong));
  border-radius: var(--ui-radius-md);
  cursor: pointer;
  transition: border-color 0.15s ease, background 0.15s ease, box-shadow 0.15s ease;
  background: rgb(var(--ui-bg));
  user-select: none;
}

/* Radio visually-hidden mas no flow — acessível por Tab/Space/Arrow */
.tipo-opt input[type="radio"] {
  position: absolute;
  opacity: 0;
  width: 1px;
  height: 1px;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
}

/* Focus-visible via :has — realça a label quando o radio recebe foco por teclado */
.tipo-opt:has(input[type="radio"]:focus-visible) {
  outline: 2px solid rgb(var(--ui-accent));
  outline-offset: var(--_outline-offset);
}

.tipo-opt:hover {
  border-color: rgb(var(--ui-accent));
  background: rgb(var(--ui-accent) / 0.04);
}

.tipo-opt[data-selected="true"][data-tipo="receita"] {
  border-color: rgb(var(--ui-success));
  background: rgb(var(--ui-success) / 0.08);
  box-shadow: 0 0 0 3px rgb(var(--ui-success) / 0.15);
}

.tipo-opt[data-selected="true"][data-tipo="despesa"] {
  border-color: rgb(var(--ui-danger));
  background: rgb(var(--ui-danger) / 0.08);
  box-shadow: 0 0 0 3px rgb(var(--ui-danger) / 0.15);
}

.tipo-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: var(--_tipo-icon-size);
  height: var(--_tipo-icon-size);
  border-radius: var(--ui-radius-md);
  font-size: var(--_tipo-icon-font);
  font-weight: 800;
  flex-shrink: 0;
  background: rgb(var(--ui-surface-2));
  color: rgb(var(--ui-muted));
  font-family: var(--ui-font-display, monospace);
  transition: background 0.15s ease, color 0.15s ease;
}

.tipo-opt[data-selected="true"][data-tipo="receita"] .tipo-icon {
  background: rgb(var(--ui-success) / 0.18);
  color: rgb(var(--ui-success));
}

.tipo-opt[data-selected="true"][data-tipo="despesa"] .tipo-icon {
  background: rgb(var(--ui-danger) / 0.18);
  color: rgb(var(--ui-danger));
}

.tipo-info {
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-px, 0.125rem);
}

.tipo-info strong {
  font-size: var(--ui-text-md);
  font-weight: 700;
  color: rgb(var(--ui-fg));
}

.tipo-info small {
  font-size: var(--ui-text-xs);
  color: rgb(var(--ui-muted));
}

/* ── EntityPicker ────────────────────────────────────────────────────────────── */
.entity-id-row {
  display: flex;
  align-items: center;
  gap: var(--ui-space-2);
}

.entity-type-badge {
  flex-shrink: 0;
  padding: var(--ui-space-1) var(--ui-space-2-half, var(--ui-space-2));
  border-radius: var(--ui-radius-sm);
  font-size: var(--ui-text-xs);
  font-weight: 700;
  letter-spacing: 0.05em;
  background: rgb(var(--ui-surface-2));
  color: rgb(var(--ui-muted));
  border: 1px solid rgb(var(--ui-border));
  transition: background 0.15s ease, color 0.15s ease;
}

.entity-type-badge[data-type="pf"] {
  background: rgb(var(--ui-accent) / 0.12);
  color: rgb(var(--ui-accent));
  border-color: rgb(var(--ui-accent) / 0.3);
}

.entity-type-badge[data-type="pj"] {
  background: rgb(var(--ui-warning) / 0.12);
  color: rgb(var(--ui-warning));
  border-color: rgb(var(--ui-warning) / 0.3);
}

/* ── Select (nativo estilizado) ──────────────────────────────────────────────── */
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

/* ── Campo valor com prefixo R$ (CurrencyInput) ─────────────────────────────── */
.currency-row {
  display: flex;
  align-items: stretch;
}

.currency-prefix {
  display: flex;
  align-items: center;
  padding: var(--ui-space-2) var(--ui-space-2-half, var(--ui-space-2));
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

/* ── Toggle Recorrente (RecorrenciaToggle) ───────────────────────────────────── */
.toggle-row {
  display: flex;
  align-items: center;
  gap: var(--ui-space-3);
  padding: var(--ui-space-3) 0;
}

.toggle-switch {
  position: relative;
  width: var(--_toggle-width);
  height: var(--_toggle-height);
  border-radius: var(--_toggle-radius);
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
  outline-offset: var(--_outline-offset);
}

.toggle-knob {
  position: absolute;
  top: var(--_toggle-knob-offset);
  left: var(--_toggle-knob-offset);
  width: var(--_toggle-knob-size);
  height: var(--_toggle-knob-size);
  border-radius: 50%;
  background: rgb(var(--ui-bg));
  box-shadow: 0 1px 3px rgb(var(--ui-shadow, 0 0 0) / 0.2);
  transition: transform 0.2s ease;
  display: block;
}

.toggle-switch[data-on="true"] .toggle-knob {
  transform: translateX(var(--_toggle-translate));
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

/* ── Opções de Recorrência ───────────────────────────────────────────────────── */
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

/* Radio visually-hidden mas no flow — acessível por Tab/Space/Arrow */
.recorrencia-opt input[type="radio"] {
  position: absolute;
  opacity: 0;
  width: 1px;
  height: 1px;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
}

/* Focus-visible via :has — realça a label quando o radio recebe foco por teclado */
.recorrencia-opt:has(input[type="radio"]:focus-visible) {
  outline: 2px solid rgb(var(--ui-accent));
  outline-offset: var(--_outline-offset);
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
  width: var(--_recorrencia-glyph-size);
  height: var(--_recorrencia-glyph-size);
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
  gap: var(--ui-space-px, 0.0625rem);
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

/* ── Textarea de descrição ───────────────────────────────────────────────────── */
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
  min-height: var(--_textarea-min-h);
  line-height: 1.6;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
  box-sizing: border-box;
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

/* ── Ações do formulário ─────────────────────────────────────────────────────── */
.form-actions {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: var(--ui-space-2);
  padding-top: var(--ui-space-2);
}

/* ── a11y ────────────────────────────────────────────────────────────────────── */
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

/* ── Responsivo ≤860px ───────────────────────────────────────────────────────── */
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
  .tipo-selector {
    grid-template-columns: 1fr;
  }

  .recorrencia-grid {
    grid-template-columns: 1fr;
  }

  .toggle-row {
    flex-wrap: wrap;
  }

  .entity-id-row {
    flex-direction: column;
    align-items: stretch;
  }

  .entity-type-badge {
    text-align: center;
  }
}
</style>
