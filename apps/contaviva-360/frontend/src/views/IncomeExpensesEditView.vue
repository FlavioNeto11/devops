<template>
  <UiPageLayout
    eyebrow="Receitas e Despesas"
    :title="pageTitle"
    :subtitle="pageSubtitle"
    width="default"
    :loading="initializing"
    :error="loadError"
    :retryable="true"
    @retry="fetchRecord"
  >
    <template #actions>
      <UiButton variant="ghost" to="/income-expenses">Cancelar</UiButton>
    </template>

    <!-- Banner de tipo de lançamento (receita/despesa) quando carregado -->
    <template v-if="!initializing && !loadError && originalData" #banner>
      <div class="tipo-banner" :data-tipo="originalData.tipo">
        <span class="tipo-banner-icon" aria-hidden="true">{{ originalData.tipo === 'receita' ? '↑' : '↓' }}</span>
        <span class="tipo-banner-label">
          {{ originalData.tipo === 'receita' ? 'Receita' : 'Despesa' }}
          <template v-if="originalData.categoria"> · {{ originalData.categoria }}</template>
        </span>
        <UiStatusBadge v-if="originalData.status" :status="originalData.status" with-dot />
      </div>
    </template>

    <UiEmptyState
      v-if="!initializing && !loadError && !originalData"
      title="Lançamento não encontrado"
      description="O registro solicitado não existe ou não está disponível."
    />

    <form v-if="!initializing && !loadError && originalData" novalidate @submit.prevent="submit">

      <!-- ===== Seção 1: Classificação do Lançamento ===== -->
      <UiCard title="Classificação" subtitle="Tipo, categoria e entidade vinculada ao lançamento">
        <UiFormSection
          title="Identificação"
          description="Campos obrigatórios que definem a natureza financeira do registro."
          :columns="2"
        >
          <!-- Tipo de Entidade -->
          <UiFormField
            label="Tipo de Entidade"
            :required="true"
            :error="f.errors.entity_type"
            hint="PF para pessoa física; PJ para pessoa jurídica."
          >
            <template #default="{ id, describedBy }">
              <select
                :id="id"
                :aria-describedby="describedBy"
                :value="f.values.entity_type"
                @change="f.setField('entity_type', $event.target.value)"
              >
                <option value="">Selecione…</option>
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
            hint="Identificador interno do cliente na plataforma."
          >
            <template #default="{ id, describedBy }">
              <input
                :id="id"
                :aria-describedby="describedBy"
                :value="f.values.entity_id"
                type="number"
                min="1"
                step="1"
                placeholder="Ex.: 42"
                @input="f.setField('entity_id', $event.target.value === '' ? '' : Number($event.target.value))"
              />
            </template>
          </UiFormField>

          <!-- Tipo de Lançamento -->
          <UiFormField
            label="Tipo"
            :required="true"
            :error="f.errors.tipo"
            hint="Receita aumenta o saldo; despesa reduz."
          >
            <template #default="{ id, describedBy }">
              <div ref="tipoToggleRef" class="tipo-toggle" role="group" :aria-describedby="describedBy">
                <button
                  type="button"
                  class="tipo-btn"
                  :data-active="f.values.tipo === 'receita'"
                  :data-variant="'receita'"
                  :aria-pressed="f.values.tipo === 'receita'"
                  @click="f.setField('tipo', 'receita')"
                >
                  <span aria-hidden="true">↑</span> Receita
                </button>
                <button
                  type="button"
                  class="tipo-btn"
                  :data-active="f.values.tipo === 'despesa'"
                  :data-variant="'despesa'"
                  :aria-pressed="f.values.tipo === 'despesa'"
                  @click="f.setField('tipo', 'despesa')"
                >
                  <span aria-hidden="true">↓</span> Despesa
                </button>
              </div>
            </template>
          </UiFormField>

          <!-- Categoria -->
          <UiFormField
            label="Categoria"
            :error="f.errors.categoria"
            hint="Ex.: Salários, Aluguel, Vendas, Serviços."
          >
            <template #default="{ id, describedBy }">
              <input
                :id="id"
                :aria-describedby="describedBy"
                :value="f.values.categoria"
                type="text"
                placeholder="Ex.: Vendas de Produtos"
                autocomplete="off"
                @input="f.setField('categoria', $event.target.value)"
              />
            </template>
          </UiFormField>
        </UiFormSection>
      </UiCard>

      <!-- ===== Seção 2: Valor e Data ===== -->
      <UiCard title="Valor e Data" subtitle="Montante financeiro e data de competência do lançamento">
        <UiFormSection :columns="2">
          <!-- Valor -->
          <UiFormField
            label="Valor (R$)"
            :required="true"
            :error="f.errors.valor"
            hint="Valor em reais. Use ponto como separador decimal."
          >
            <template #default="{ id, describedBy }">
              <UiInput
                :id="id"
                :described-by="describedBy"
                :model-value="f.values.valor"
                :error="!!f.errors.valor"
                type="number"
                prefix="R$"
                inputmode="decimal"
                min="0"
                step="0.01"
                placeholder="0,00"
                @update:model-value="v => f.setField('valor', v === '' ? '' : Number(v))"
              />
            </template>
          </UiFormField>

          <!-- Data -->
          <UiFormField
            label="Data"
            :required="true"
            :error="f.errors.data"
            hint="Data de competência ou realização do lançamento."
          >
            <template #default="{ id, describedBy }">
              <input
                :id="id"
                :aria-describedby="describedBy"
                :value="f.values.data"
                type="date"
                @input="f.setField('data', $event.target.value)"
              />
            </template>
          </UiFormField>

          <!-- Status -->
          <UiFormField
            label="Status"
            :error="f.errors.status"
            hint="Situação atual do lançamento no ciclo financeiro."
          >
            <template #default="{ id, describedBy }">
              <select
                :id="id"
                :aria-describedby="describedBy"
                :value="f.values.status"
                @change="f.setField('status', $event.target.value)"
              >
                <option value="">Não definido</option>
                <option value="pendente">Pendente</option>
                <option value="confirmado">Confirmado</option>
                <option value="concluido">Concluído</option>
                <option value="cancelado">Cancelado</option>
                <option value="atrasado">Atrasado</option>
              </select>
            </template>
          </UiFormField>

          <!-- Recorrente -->
          <UiFormField
            label="Recorrente"
            :error="f.errors.recorrente"
            hint="Marque se este lançamento se repete periodicamente."
          >
            <template #default="{ id, describedBy }">
              <div class="checkbox-row">
                <input
                  :id="id"
                  :aria-describedby="describedBy"
                  type="checkbox"
                  :checked="f.values.recorrente"
                  class="checkbox-input"
                  @change="f.setField('recorrente', $event.target.checked)"
                />
                <label :for="id" class="checkbox-label">Lançamento recorrente</label>
              </div>
            </template>
          </UiFormField>
        </UiFormSection>
      </UiCard>

      <!-- ===== Seção 3: Detalhes Complementares ===== -->
      <UiCard title="Detalhes Complementares" subtitle="Centro de custo, contraparte e descrição do lançamento">
        <UiFormSection :columns="2">
          <!-- Centro de Custo -->
          <UiFormField
            label="Centro de Custo"
            :error="f.errors.centro_custo"
            hint="Departamento, projeto ou unidade responsável."
          >
            <template #default="{ id, describedBy }">
              <input
                :id="id"
                :aria-describedby="describedBy"
                :value="f.values.centro_custo"
                type="text"
                placeholder="Ex.: TI, Comercial, Obra 03"
                @input="f.setField('centro_custo', $event.target.value)"
              />
            </template>
          </UiFormField>

          <!-- Contraparte -->
          <UiFormField
            label="Contraparte"
            :error="f.errors.contraparte"
            hint="Nome do cliente, fornecedor ou parceiro envolvido."
          >
            <template #default="{ id, describedBy }">
              <input
                :id="id"
                :aria-describedby="describedBy"
                :value="f.values.contraparte"
                type="text"
                placeholder="Ex.: Energia SP S.A."
                autocomplete="organization"
                @input="f.setField('contraparte', $event.target.value)"
              />
            </template>
          </UiFormField>

          <!-- Descrição -->
          <UiFormField
            label="Descrição"
            :error="f.errors.descricao"
            :full-width="true"
            hint="Observações, referências ou instruções relevantes para este lançamento."
          >
            <template #default="{ id, describedBy }">
              <textarea
                :id="id"
                :aria-describedby="describedBy"
                :value="f.values.descricao"
                placeholder="Descreva os detalhes relevantes para este lançamento financeiro…"
                rows="4"
                @input="f.setField('descricao', $event.target.value)"
              />
            </template>
          </UiFormField>
        </UiFormSection>
      </UiCard>

      <!-- ===== Barra de Ações ===== -->
      <div class="form-footer">
        <div class="form-footer-meta" v-if="originalData">
          <span
            class="footer-tipo-badge"
            :data-tipo="originalData.tipo"
          >{{ originalData.tipo === 'receita' ? '↑ Receita' : '↓ Despesa' }}</span>
          <template v-if="originalData.valor != null">
            <span class="footer-sep" aria-hidden="true">·</span>
            <span class="footer-valor">{{ fmt.formatCurrency(originalData.valor) }}</span>
          </template>
          <template v-if="originalData.data">
            <span class="footer-sep" aria-hidden="true">·</span>
            <span class="footer-hint">{{ fmt.formatDate(originalData.data) }}</span>
          </template>
        </div>
        <div class="form-footer-actions">
          <UiButton variant="ghost" type="button" @click="cancel">Cancelar</UiButton>
          <UiButton type="submit" :loading="f.submitting.value">Salvar alterações</UiButton>
        </div>
      </div>

    </form>
  </UiPageLayout>
</template>

<script setup>
import { ref, computed, onMounted, nextTick } from 'vue';
import { useRouter } from 'vue-router';
import {
  UiPageLayout,
  UiCard,
  UiFormSection,
  UiFormField,
  UiButton,
  UiStatusBadge,
  UiEmptyState,
  UiInput,
  useForm,
  useToast,
  validators,
  format as fmt,
  statusLabel,
} from '../ui/index.js';
import { resourceFactory } from '../api.js';

// Recurso garantido pelo integrador (endpoint: PUT /v1/income-expenses/:id)
const incomeExpenses = resourceFactory('income-expenses');

const props = defineProps({
  id: { type: String, required: true },
});

const router = useRouter();
const toast = useToast();

const initializing = ref(true);
const loadError = ref(null);
const originalData = ref(null);
const tipoToggleRef = ref(null);

// ── Título e subtítulo dinâmicos ──────────────────────────────────────────────
const pageTitle = computed(() => {
  if (initializing.value) return 'Editar Lançamento';
  if (!originalData.value) return 'Editar Lançamento';
  const tipo = originalData.value.tipo === 'receita' ? 'Receita' : 'Despesa';
  const categoria = originalData.value.categoria;
  return 'Editar — ' + tipo + (categoria ? ' · ' + categoria : '');
});

const pageSubtitle = computed(() => {
  if (initializing.value) return 'Carregando dados…';
  if (!originalData.value) return '';
  const parts = [];
  const valor = originalData.value.valor != null ? fmt.formatCurrency(originalData.value.valor) : null;
  const data = originalData.value.data ? fmt.formatDate(originalData.value.data) : null;
  const status = originalData.value.status;
  if (valor) parts.push(valor);
  if (data) parts.push(data);
  if (status) parts.push(statusLabel(status) || status);
  return parts.join(' · ') || 'Lançamento financeiro';
});

// ── Formulário ────────────────────────────────────────────────────────────────
const f = useForm({
  initial: {
    entity_type: '',
    entity_id: '',
    tipo: '',
    categoria: '',
    descricao: '',
    valor: '',
    data: '',
    recorrente: false,
    centro_custo: '',
    contraparte: '',
    status: '',
  },
  rules: {
    entity_type: [validators.required('Selecione o tipo de entidade')],
    entity_id: [
      validators.required('Informe o ID da entidade'),
      validators.numeric('O ID deve ser numérico'),
      validators.min(1, 'O ID deve ser maior que zero'),
    ],
    tipo: [validators.required('Selecione o tipo de lançamento')],
    valor: [
      validators.required('Informe o valor do lançamento'),
      validators.numeric('O valor deve ser numérico'),
      validators.min(0, 'O valor deve ser maior ou igual a zero'),
    ],
    data: [validators.required('Informe a data do lançamento')],
  },
});

// ── Carregamento do registro ──────────────────────────────────────────────────
async function fetchRecord() {
  initializing.value = true;
  loadError.value = null;
  try {
    const data = await incomeExpenses.get(props.id);
    if (!data) {
      loadError.value = 'Lançamento não encontrado.';
      return;
    }
    originalData.value = data;

    f.values.entity_type = data.entity_type || '';
    f.values.entity_id   = data.entity_id != null ? data.entity_id : '';
    f.values.tipo        = data.tipo || '';
    f.values.categoria   = data.categoria || '';
    f.values.descricao   = data.descricao || '';
    f.values.valor       = data.valor != null ? data.valor : '';
    f.values.data        = data.data ? data.data.slice(0, 10) : '';
    f.values.recorrente  = !!data.recorrente;
    f.values.centro_custo = data.centro_custo || '';
    f.values.contraparte = data.contraparte || '';
    f.values.status      = data.status || '';
  } catch (err) {
    loadError.value = err.message || 'Erro ao carregar os dados do lançamento.';
  } finally {
    initializing.value = false;
  }
}

// ── Submissão ─────────────────────────────────────────────────────────────────
function submit() {
  // Se houver erro no campo tipo após validação, focar o toggle para a11y teclado
  const wrappedSubmit = f.handleSubmit(async (vals) => {
    const payload = {
      entity_type:  vals.entity_type,
      entity_id:    vals.entity_id !== '' ? Number(vals.entity_id) : undefined,
      tipo:         vals.tipo,
      categoria:    vals.categoria   || undefined,
      descricao:    vals.descricao   || undefined,
      valor:        vals.valor !== '' ? Number(vals.valor) : undefined,
      data:         vals.data,
      recorrente:   vals.recorrente  || undefined,
      centro_custo: vals.centro_custo || undefined,
      contraparte:  vals.contraparte || undefined,
      status:       vals.status      || undefined,
    };

    // Remove chaves undefined para payload limpo
    for (const k of Object.keys(payload)) {
      if (payload[k] === undefined) delete payload[k];
    }

    try {
      await incomeExpenses.update(props.id, payload);
      toast.success('Lançamento atualizado com sucesso.');
      router.push('/income-expenses');
    } catch (err) {
      toast.error(err.message || 'Erro ao salvar o lançamento. Tente novamente.');
    }
  });
  if (wrappedSubmit instanceof Promise) {
    wrappedSubmit.then(() => {
      nextTick(() => {
        if (f.errors.tipo && tipoToggleRef.value) {
          const firstBtn = tipoToggleRef.value.querySelector('.tipo-btn');
          firstBtn?.focus();
        }
      });
    });
  } else {
    nextTick(() => {
      if (f.errors.tipo && tipoToggleRef.value) {
        const firstBtn = tipoToggleRef.value.querySelector('.tipo-btn');
        firstBtn?.focus();
      }
    });
  }
}

function cancel() {
  router.push('/income-expenses');
}

onMounted(fetchRecord);
</script>

<style scoped>
/* ── Banner de tipo (receita / despesa) ──────────────────────────────────── */
.tipo-banner {
  display: flex;
  align-items: center;
  gap: var(--ui-space-2);
  padding: var(--ui-space-2) var(--ui-space-4);
  border-radius: var(--ui-radius-md);
  font-size: var(--ui-text-sm);
  font-weight: 600;
  background: rgb(var(--ui-accent) / 0.08);
  color: rgb(var(--ui-accent-strong));
  border-left: var(--ui-space-1) solid rgb(var(--ui-accent));
}

.tipo-banner[data-tipo="receita"] {
  background: rgb(var(--ui-ok) / 0.1);
  color: rgb(var(--ui-ok));
  border-left-color: rgb(var(--ui-ok));
}

.tipo-banner[data-tipo="despesa"] {
  background: rgb(var(--ui-danger) / 0.08);
  color: rgb(var(--ui-danger));
  border-left-color: rgb(var(--ui-danger));
}

.tipo-banner-icon {
  font-size: var(--ui-text-base);
  line-height: 1;
}

.tipo-banner-label {
  flex: 1;
}

/* ── Toggle de tipo (receita/despesa) ────────────────────────────────────── */
.tipo-toggle {
  display: flex;
  gap: 0;
  border: 1px solid rgb(var(--ui-border-strong));
  border-radius: var(--ui-radius-sm);
  overflow: hidden;
  width: 100%;
}

.tipo-btn {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--ui-space-1);
  padding: var(--ui-space-2) var(--ui-space-3);
  background: rgb(var(--ui-bg));
  color: rgb(var(--ui-muted));
  border: none;
  font: inherit;
  font-size: var(--ui-text-sm);
  font-weight: 500;
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
  border-right: 1px solid rgb(var(--ui-border-strong));
}

.tipo-btn:last-child {
  border-right: none;
}

.tipo-btn:hover {
  background: rgb(var(--ui-surface));
  color: rgb(var(--ui-fg));
}

.tipo-btn[data-active="true"][data-variant="receita"] {
  background: rgb(var(--ui-ok) / 0.15);
  color: rgb(var(--ui-ok));
  font-weight: 700;
}

.tipo-btn[data-active="true"][data-variant="despesa"] {
  background: rgb(var(--ui-danger) / 0.12);
  color: rgb(var(--ui-danger));
  font-weight: 700;
}

.tipo-btn:focus-visible {
  outline: 2px solid rgb(var(--ui-accent));
  outline-offset: -2px;
  z-index: 1;
}

/* ── Checkbox ────────────────────────────────────────────────────────────── */
.checkbox-row {
  display: flex;
  align-items: center;
  gap: var(--ui-space-2);
  padding: var(--ui-space-2) 0;
}

.checkbox-input {
  width: var(--ui-space-4);
  height: var(--ui-space-4);
  accent-color: rgb(var(--ui-accent));
  cursor: pointer;
  flex-shrink: 0;
}

.checkbox-label {
  font-size: var(--ui-text-sm);
  color: rgb(var(--ui-fg));
  cursor: pointer;
  user-select: none;
}

/* ── Footer do formulário ────────────────────────────────────────────────── */
.form-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ui-space-3);
  padding-top: var(--ui-space-3);
  padding-bottom: var(--ui-space-6);
  flex-wrap: wrap;
}

.form-footer-meta {
  display: flex;
  align-items: center;
  gap: var(--ui-space-2);
  font-size: var(--ui-text-sm);
  color: rgb(var(--ui-muted));
  flex-shrink: 0;
}

.footer-sep {
  color: rgb(var(--ui-border-strong));
}

.footer-valor {
  font-weight: 600;
  color: rgb(var(--ui-fg));
}

.footer-hint {
  white-space: nowrap;
}

.footer-tipo-badge {
  display: inline-block;
  font-size: var(--ui-text-xs);
  font-weight: 700;
  padding: var(--ui-space-1) var(--ui-space-2);
  border-radius: var(--ui-radius-pill);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  background: rgb(var(--ui-accent) / 0.12);
  color: rgb(var(--ui-accent-strong));
}

.footer-tipo-badge[data-tipo="receita"] {
  background: rgb(var(--ui-ok) / 0.14);
  color: rgb(var(--ui-ok));
}

.footer-tipo-badge[data-tipo="despesa"] {
  background: rgb(var(--ui-danger) / 0.12);
  color: rgb(var(--ui-danger));
}

.form-footer-actions {
  display: flex;
  gap: var(--ui-space-2);
  margin-left: auto;
}

/* ── Responsivo ─────────────────────────────────────────────────────────── */
@media (max-width: 640px) {
  .form-footer {
    flex-direction: column;
    align-items: stretch;
  }

  .form-footer-actions {
    flex-direction: column-reverse;
    margin-left: 0;
  }

  .form-footer-meta {
    flex-wrap: wrap;
    justify-content: center;
  }

  .tipo-toggle {
    flex-direction: column;
  }

  .tipo-btn {
    border-right: none;
    border-bottom: 1px solid rgb(var(--ui-border-strong));
  }

  .tipo-btn:last-child {
    border-bottom: none;
  }
}
</style>
