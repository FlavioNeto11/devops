<template>
  <UiPageLayout
    eyebrow="Produtos / Serviços NF"
    title="Editar Produto / Serviço"
    :subtitle="loadError ? '' : (pageSubtitle || 'Carregando dados...')"
    width="narrow"
    :loading="initializing"
    :error="loadError"
    :retryable="true"
    @retry="fetchProduct"
  >
    <template #actions>
      <UiButton variant="ghost" :to="backRoute">Cancelar</UiButton>
    </template>

    <form v-if="!initializing && !loadError" novalidate @submit.prevent="submit">

      <!-- Seção: Identificação -->
      <UiCard
        title="Identificação"
        subtitle="Dados de identificação do produto ou serviço"
      >
        <UiFormSection
          title="Dados Principais"
          description="Descrição obrigatória. Código, CFOP e NCM/NBS são opcionais mas recomendados para emissão correta da NF."
          :columns="2"
        >
          <UiFormField
            label="Descrição"
            :required="true"
            :error="f.errors.descricao"
            :full-width="true"
          >
            <template #default="{ id, describedBy }">
              <UiInput
                :id="id"
                :described-by="describedBy"
                :model-value="f.values.descricao"
                :error="f.errors.descricao"
                :required="true"
                type="text"
                placeholder="Nome completo do produto ou serviço"
                autocomplete="off"
                @update:modelValue="f.setField('descricao', $event)"
              />
            </template>
          </UiFormField>

          <UiFormField
            label="Código"
            hint="Código interno de identificação do item."
            :error="f.errors.codigo"
          >
            <template #default="{ id, describedBy }">
              <UiInput
                :id="id"
                :described-by="describedBy"
                :model-value="f.values.codigo"
                :error="f.errors.codigo"
                type="text"
                placeholder="Ex.: PROD-001"
                autocomplete="off"
                @update:modelValue="f.setField('codigo', $event)"
              />
            </template>
          </UiFormField>

          <UiFormField
            label="CFOP"
            hint="Código Fiscal de Operações e Prestações."
            :error="f.errors.cfop"
          >
            <template #default="{ id, describedBy }">
              <UiInput
                :id="id"
                :described-by="describedBy"
                :model-value="f.values.cfop"
                :error="f.errors.cfop"
                type="text"
                placeholder="Ex.: 5102"
                autocomplete="off"
                inputmode="numeric"
                @update:modelValue="f.setField('cfop', $event)"
              />
            </template>
          </UiFormField>

          <UiFormField
            label="NCM / NBS"
            hint="Nomenclatura Comum do Mercosul ou NBS para serviços."
            :error="f.errors.ncm_nbs"
          >
            <template #default="{ id, describedBy }">
              <UiInput
                :id="id"
                :described-by="describedBy"
                :model-value="f.values.ncm_nbs"
                :error="f.errors.ncm_nbs"
                type="text"
                placeholder="Ex.: 84714100"
                autocomplete="off"
                @update:modelValue="f.setField('ncm_nbs', $event)"
              />
            </template>
          </UiFormField>
        </UiFormSection>
      </UiCard>

      <!-- Seção: Valor -->
      <UiCard
        title="Precificação"
        subtitle="Valor unitário utilizado como base de cálculo na emissão de notas"
      >
        <UiFormSection
          title="Valor Unitário"
          description="Informe o valor em reais (R$). Use ponto ou vírgula como separador decimal."
          :columns="1"
        >
          <UiFormField
            label="Valor Unitário (R$)"
            :required="true"
            :error="f.errors.valor_unitario"
            hint="Exemplo: 1500,00"
          >
            <template #default="{ id, describedBy }">
              <UiInput
                :id="id"
                :described-by="describedBy"
                :model-value="f.values.valor_unitario"
                :error="f.errors.valor_unitario"
                :required="true"
                type="text"
                inputmode="decimal"
                placeholder="0,00"
                autocomplete="off"
                class="field-currency"
                @update:modelValue="f.setField('valor_unitario', $event)"
                @change="normalizeCurrency"
              />
            </template>
          </UiFormField>
        </UiFormSection>
      </UiCard>

      <!-- Seção: Alíquotas Fiscais -->
      <UiCard
        title="Alíquotas Fiscais"
        subtitle="Percentuais de tributação aplicáveis ao item. Deixe em branco quando não houver incidência."
      >
        <UiFormSection
          title="Tributação"
          description="Os valores são percentuais (%). Ex.: 12 para 12%. Máximo: 100."
          :columns="2"
        >
          <UiFormField
            label="Alíquota ICMS (%)"
            hint="Imposto sobre Circulação de Mercadorias e Serviços."
            :error="f.errors.aliquota_icms"
          >
            <template #default="{ id, describedBy }">
              <UiInput
                :id="id"
                :described-by="describedBy"
                :model-value="f.values.aliquota_icms"
                :error="f.errors.aliquota_icms"
                type="text"
                inputmode="decimal"
                placeholder="0,00"
                autocomplete="off"
                @update:modelValue="f.setField('aliquota_icms', $event)"
              />
            </template>
          </UiFormField>

          <UiFormField
            label="Alíquota ISS (%)"
            hint="Imposto Sobre Serviços de Qualquer Natureza."
            :error="f.errors.aliquota_iss"
          >
            <template #default="{ id, describedBy }">
              <UiInput
                :id="id"
                :described-by="describedBy"
                :model-value="f.values.aliquota_iss"
                :error="f.errors.aliquota_iss"
                type="text"
                inputmode="decimal"
                placeholder="0,00"
                autocomplete="off"
                @update:modelValue="f.setField('aliquota_iss', $event)"
              />
            </template>
          </UiFormField>

          <UiFormField
            label="Alíquota PIS (%)"
            hint="Programa de Integração Social."
            :error="f.errors.aliquota_pis"
          >
            <template #default="{ id, describedBy }">
              <UiInput
                :id="id"
                :described-by="describedBy"
                :model-value="f.values.aliquota_pis"
                :error="f.errors.aliquota_pis"
                type="text"
                inputmode="decimal"
                placeholder="0,0000"
                autocomplete="off"
                @update:modelValue="f.setField('aliquota_pis', $event)"
              />
            </template>
          </UiFormField>

          <UiFormField
            label="Alíquota COFINS (%)"
            hint="Contribuição para o Financiamento da Seguridade Social."
            :error="f.errors.aliquota_cofins"
          >
            <template #default="{ id, describedBy }">
              <UiInput
                :id="id"
                :described-by="describedBy"
                :model-value="f.values.aliquota_cofins"
                :error="f.errors.aliquota_cofins"
                type="text"
                inputmode="decimal"
                placeholder="0,0000"
                autocomplete="off"
                @update:modelValue="f.setField('aliquota_cofins', $event)"
              />
            </template>
          </UiFormField>
        </UiFormSection>

        <!-- resumo visual das alíquotas preenchidas -->
        <div v-if="hasAnyAliquota" class="aliquota-summary" role="status" aria-live="polite">
          <span class="aliquota-summary-label">Carga tributária estimada:</span>
          <span class="aliquota-summary-total" aria-label="Total de alíquotas">
            {{ totalAliquotas }}%
          </span>
          <ul class="aliquota-chips" aria-label="Detalhe das alíquotas">
            <li v-if="f.values.aliquota_icms" class="chip" data-tax="icms">
              ICMS {{ formatAliquota(f.values.aliquota_icms) }}%
            </li>
            <li v-if="f.values.aliquota_iss" class="chip" data-tax="iss">
              ISS {{ formatAliquota(f.values.aliquota_iss) }}%
            </li>
            <li v-if="f.values.aliquota_pis" class="chip" data-tax="pis">
              PIS {{ formatAliquota(f.values.aliquota_pis) }}%
            </li>
            <li v-if="f.values.aliquota_cofins" class="chip" data-tax="cofins">
              COFINS {{ formatAliquota(f.values.aliquota_cofins) }}%
            </li>
          </ul>
        </div>
      </UiCard>

      <!-- Barra de ações -->
      <div class="form-footer">
        <UiButton variant="ghost" type="button" @click="cancel">Cancelar</UiButton>
        <UiButton type="submit" variant="primary" :loading="f.submitting.value">
          Salvar alterações
        </UiButton>
      </div>
    </form>
  </UiPageLayout>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
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

// Recurso nf-products garantido pelo integrador via resourceFactory
const nfProducts = resourceFactory('nf-products');

const props = defineProps({
  id: { type: String, required: true },
});

const router = useRouter();
const toast = useToast();

const initializing = ref(true);
const loadError = ref(null);
const pageSubtitle = ref('');

const backRoute = computed(() => '/nf-products');

// ----- Formulário -----
const f = useForm({
  initial: {
    descricao: '',
    valor_unitario: '',
    codigo: '',
    aliquota_icms: '',
    aliquota_iss: '',
    aliquota_pis: '',
    aliquota_cofins: '',
    cfop: '',
    ncm_nbs: '',
  },
  rules: {
    descricao: [validators.required(), validators.minLen(2)],
    valor_unitario: [
      validators.required('Informe o valor unitário'),
      validators.numeric(),
      validators.min(0, 'O valor não pode ser negativo'),
    ],
    aliquota_icms: [validators.numeric(), validators.min(0), validators.max(100)],
    aliquota_iss: [validators.numeric(), validators.min(0), validators.max(100)],
    aliquota_pis: [validators.numeric(), validators.min(0), validators.max(100)],
    aliquota_cofins: [validators.numeric(), validators.min(0), validators.max(100)],
  },
});

// ----- Helpers: alíquotas -----
function parseNum(v) {
  if (v === '' || v === null || v === undefined) return 0;
  return Number(String(v).replace(',', '.')) || 0;
}

function formatAliquota(v) {
  const n = parseNum(v);
  return n % 1 === 0 ? String(n) : n.toFixed(4).replace(/0+$/, '').replace(/\.$/, '');
}

const hasAnyAliquota = computed(() =>
  ['aliquota_icms', 'aliquota_iss', 'aliquota_pis', 'aliquota_cofins'].some(
    (k) => f.values[k] !== '' && f.values[k] !== null && f.values[k] !== undefined
  )
);

const totalAliquotas = computed(() => {
  const total =
    parseNum(f.values.aliquota_icms) +
    parseNum(f.values.aliquota_iss) +
    parseNum(f.values.aliquota_pis) +
    parseNum(f.values.aliquota_cofins);
  return total % 1 === 0 ? String(total) : total.toFixed(4).replace(/0+$/, '').replace(/\.$/, '');
});

// ----- Normalização do campo moeda no blur -----
function normalizeCurrency() {
  const raw = String(f.values.valor_unitario || '').replace(',', '.');
  const n = parseFloat(raw);
  if (isFinite(n)) {
    f.setField('valor_unitario', n.toFixed(2).replace('.', ','));
  }
}

// ----- Carregamento -----
async function fetchProduct() {
  initializing.value = true;
  loadError.value = null;
  try {
    const data = await nfProducts.get(props.id);
    f.values.descricao = data.descricao || '';
    f.values.valor_unitario =
      data.valor_unitario != null
        ? Number(data.valor_unitario).toFixed(2).replace('.', ',')
        : '';
    f.values.codigo = data.codigo || '';
    f.values.aliquota_icms = data.aliquota_icms != null ? String(data.aliquota_icms) : '';
    f.values.aliquota_iss = data.aliquota_iss != null ? String(data.aliquota_iss) : '';
    f.values.aliquota_pis = data.aliquota_pis != null ? String(data.aliquota_pis) : '';
    f.values.aliquota_cofins = data.aliquota_cofins != null ? String(data.aliquota_cofins) : '';
    f.values.cfop = data.cfop || '';
    f.values.ncm_nbs = data.ncm_nbs || '';
    pageSubtitle.value = data.descricao || 'Produto / Serviço';
  } catch (err) {
    loadError.value = err.message || 'Erro ao carregar os dados do produto.';
  } finally {
    initializing.value = false;
  }
}

// ----- Submit -----
function submit() {
  f.handleSubmit(async (vals) => {
    // Converte campos numéricos: vírgula → ponto, string → number (null quando vazio)
    const toNum = (v) => {
      if (v === '' || v === null || v === undefined) return null;
      const n = Number(String(v).replace(',', '.'));
      return isFinite(n) ? n : null;
    };

    const payload = {
      descricao: vals.descricao.trim(),
      valor_unitario: toNum(vals.valor_unitario),
      codigo: vals.codigo?.trim() || null,
      aliquota_icms: toNum(vals.aliquota_icms),
      aliquota_iss: toNum(vals.aliquota_iss),
      aliquota_pis: toNum(vals.aliquota_pis),
      aliquota_cofins: toNum(vals.aliquota_cofins),
      cfop: vals.cfop?.trim() || null,
      ncm_nbs: vals.ncm_nbs?.trim() || null,
    };

    try {
      await nfProducts.update(props.id, payload);
      toast.success('Produto / Serviço atualizado com sucesso.');
      router.push('/nf-products');
    } catch (err) {
      toast.error(err.message || 'Erro ao salvar. Tente novamente.');
    }
  });
}

function cancel() {
  router.push('/nf-products');
}

onMounted(fetchProduct);
</script>

<style scoped>
/* Barra de ações do formulário */
.form-footer {
  display: flex;
  justify-content: flex-end;
  gap: var(--ui-space-2);
  padding-top: var(--ui-space-2);
}

/* Campo moeda — destaque sutil */
.field-currency {
  font-variant-numeric: tabular-nums;
  text-align: right;
}

/* Resumo de alíquotas */
.aliquota-summary {
  margin-top: var(--ui-space-4);
  padding: var(--ui-space-3) var(--ui-space-4);
  background: rgb(var(--ui-surface-2));
  border: 1px solid rgb(var(--ui-border));
  border-radius: var(--ui-radius-md);
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--ui-space-3);
}

.aliquota-summary-label {
  font-size: var(--ui-text-sm);
  color: rgb(var(--ui-muted));
  white-space: nowrap;
}

.aliquota-summary-total {
  font-size: var(--ui-text-lg);
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  color: rgb(var(--ui-accent-strong));
}

.aliquota-chips {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-wrap: wrap;
  gap: var(--ui-space-2);
  margin-left: auto;
}

.chip {
  font-size: var(--ui-text-xs);
  font-weight: 600;
  padding: calc(var(--ui-space-1) / 2) var(--ui-space-2);
  border-radius: var(--ui-radius-full, 9999px);
  border: 1px solid rgb(var(--ui-border-strong));
  background: rgb(var(--ui-surface));
  color: rgb(var(--ui-fg));
  white-space: nowrap;
}

.chip[data-tax="icms"] { border-color: rgb(var(--ui-info)); color: rgb(var(--ui-info)); }
.chip[data-tax="iss"]  { border-color: rgb(var(--ui-success)); color: rgb(var(--ui-success)); }
.chip[data-tax="pis"]  { border-color: rgb(var(--ui-warning)); color: rgb(var(--ui-warning)); }
.chip[data-tax="cofins"] { border-color: rgb(var(--ui-accent-strong)); color: rgb(var(--ui-accent-strong)); }

/* Responsividade */
@media (max-width: 640px) {
  .form-footer {
    flex-direction: column-reverse;
  }

  .form-footer > * {
    width: 100%;
  }

  .aliquota-summary {
    flex-direction: column;
    align-items: flex-start;
  }

  .aliquota-chips {
    margin-left: 0;
  }
}
</style>
