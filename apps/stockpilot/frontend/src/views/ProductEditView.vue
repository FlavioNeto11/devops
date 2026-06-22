<!--
  ProductEditView — Editar produto (REQ-STOCKPILOT-0005 · REQ-STOCKPILOT-0003)
  Rota: /products/:id/edit  ·  entidade: products

  Edição do cadastro (nome, SKU, estoque mínimo) + ajuste do estoque atual, com
  validação rica, pré-visualização de impacto, confirmação e toast.

  Endpoints REAIS (api.products, sob /v1/products):
    - GET  /v1/products/{id}  → carrega o produto (com fallback honesto p/ a lista
      caso o backend ainda só exponha a coleção: resolve por id sobre /v1/products).
    - PUT  /v1/products/{id}  → persiste a edição (products.update). O screen
      contract marca a escrita como "a criar"; quando o backend ainda não a expõe,
      a gravação fica fail-closed honesta (banner + ações desabilitadas) — regra
      dura: sem endpoint → não dispara a ação.

  Marca StockPilot (estoque/reposição): teal/slate via tokens --ui-* apenas.
  CSP-safe: só classes + data-*; sem style inline / :style / v-html.
  Estados cobertos: loading · error(retry) · empty(não-encontrado) · normal.
-->
<template>
  <UiPageLayout
    width="narrow"
    eyebrow="Estoque · Produtos"
    :title="pageTitle"
    subtitle="Edite o cadastro e ajuste o estoque do produto. As mudanças passam por confirmação antes de salvar."
    :loading="loading"
    loading-message="Carregando produto…"
    :error="loadErrorMessage"
    @retry="load"
  >
    <template #actions>
      <UiButton variant="ghost" :to="listRoute">
        <template #icon-left><span class="pe-ic" aria-hidden="true">‹</span></template>
        Produtos
      </UiButton>
      <UiButton v-if="hasProduct" variant="subtle" :to="detailRoute">Ver produto</UiButton>
    </template>

    <!-- BANNER: gravação ainda não disponível no backend (fail-closed honesto) -->
    <template v-if="hasProduct && !canPersist" #banner>
      <div class="pe-banner" data-tone="warning" role="status">
        <span class="pe-banner-ic" aria-hidden="true">⚑</span>
        <div class="pe-banner-txt">
          <p class="pe-banner-title">Gravação ainda não disponível</p>
          <p class="pe-banner-sub">
            A edição depende de <code class="ui-mono">PUT /v1/products/{id}</code>, que ainda não foi
            publicado pela API. Você pode revisar e validar as mudanças aqui; <strong>Salvar</strong>
            será habilitado assim que o endpoint entrar no contrato.
          </p>
        </div>
      </div>
    </template>

    <!-- ESTADO: produto inexistente (carga ok, id não resolve) -->
    <UiCard v-if="!hasProduct && !loadErrorMessage">
      <UiEmptyState
        title="Produto não encontrado"
        :description="emptyDescription"
        icon="box"
      >
        <template #action>
          <UiButton :to="listRoute">Voltar para produtos</UiButton>
        </template>
      </UiEmptyState>
    </UiCard>

    <!-- ESTADO: normal — formulário de edição -->
    <template v-else-if="hasProduct">
      <!-- Resumo vivo: reflete o que está no formulário (não o que foi carregado) -->
      <div class="pe-summary" aria-label="Resumo do produto em edição">
        <UiMetricCard
          label="Estoque atual"
          :value="liveStockLabel"
          :tone="stockTone"
          :hint="stockHint"
        />
        <UiMetricCard
          label="Estoque mínimo"
          :value="liveMinLabel"
          tone="neutral"
          hint="gatilho de reposição"
        />
        <UiMetricCard
          label="Situação projetada"
          :value="liveStatusLabel"
          :tone="statusMetricTone"
          :hint="statusHint"
        />
      </div>

      <UiCard>
        <template #header>
          <div class="pe-card-head">
            <div class="pe-card-headings">
              <h2 class="pe-card-title">Dados do produto</h2>
              <p class="pe-card-sub ui-muted">
                Identidade e parâmetros de reposição. Campos com
                <span class="pe-req" aria-hidden="true">*</span> são obrigatórios.
              </p>
            </div>
            <UiStatusBadge
              :status="liveStatus"
              :tone="badgeTone"
              :label="liveStatusLabel"
              size="lg"
            />
          </div>
        </template>

        <form class="pe-form" novalidate @submit.prevent="onSubmit">
          <!-- ValidationSummary (a11y: anuncia + foca o 1º erro via links) -->
          <div
            v-if="showValidationSummary"
            ref="summaryRef"
            class="pe-valsum"
            role="alert"
            tabindex="-1"
          >
            <p class="pe-valsum-title">
              Revise {{ errorList.length }} {{ errorList.length === 1 ? 'campo' : 'campos' }} antes de salvar
            </p>
            <ul class="pe-valsum-list">
              <li v-for="e in errorList" :key="e.key">
                <button type="button" class="pe-valsum-link" @click="focusField(e.key)">
                  {{ e.label }}: {{ e.message }}
                </button>
              </li>
            </ul>
          </div>

          <UiFormSection
            title="Identidade"
            description="Como o produto aparece nas listas, alertas e pedidos de reposição."
            :columns="2"
          >
            <UiFormField
              label="Nome do produto"
              :required="true"
              :error="f.errors.name"
              :full-width="true"
              hint="Use um nome reconhecível pelo operador (ex.: marca + tamanho)."
            >
              <template #default="{ id: fid, describedBy }">
                <input
                  :id="fid"
                  ref="nameRef"
                  type="text"
                  autocomplete="off"
                  maxlength="120"
                  placeholder="Ex.: Álcool 70% — galão 5L"
                  :aria-describedby="describedBy"
                  :aria-invalid="f.errors.name ? 'true' : null"
                  :value="f.values.name"
                  @input="f.setField('name', $event.target.value)"
                  @blur="f.validateField('name')"
                />
              </template>
            </UiFormField>

            <UiFormField label="SKU / código" :error="f.errors.sku" hint="Código interno (opcional).">
              <template #default="{ id: fid, describedBy }">
                <input
                  :id="fid"
                  type="text"
                  autocomplete="off"
                  maxlength="64"
                  placeholder="Ex.: ALC-70-5L"
                  :aria-describedby="describedBy"
                  :aria-invalid="f.errors.sku ? 'true' : null"
                  :value="f.values.sku"
                  @input="f.setField('sku', $event.target.value)"
                  @blur="f.validateField('sku')"
                />
              </template>
            </UiFormField>

            <UiFormField label="ID interno" hint="Identificador do produto (somente leitura).">
              <template #default="{ id: fid }">
                <input
                  :id="fid"
                  class="pe-readonly"
                  type="text"
                  :value="'#' + id"
                  readonly
                  aria-readonly="true"
                  tabindex="-1"
                />
              </template>
            </UiFormField>
          </UiFormSection>

          <UiFormSection
            title="Estoque e reposição"
            description="O estoque mínimo é o gatilho automático de reposição. O ajuste do estoque atual é uma correção de saldo — confira antes de salvar."
            :columns="2"
          >
            <UiFormField
              label="Estoque atual"
              :required="true"
              :error="f.errors.current_stock"
              :hint="currentStockHint"
            >
              <template #default="{ id: fid, describedBy }">
                <input
                  :id="fid"
                  ref="currentStockRef"
                  type="number"
                  min="0"
                  step="1"
                  inputmode="numeric"
                  :aria-describedby="describedBy"
                  :aria-invalid="f.errors.current_stock ? 'true' : null"
                  :value="f.values.current_stock"
                  @input="f.setField('current_stock', $event.target.value)"
                  @blur="f.validateField('current_stock')"
                />
              </template>
            </UiFormField>

            <UiFormField
              label="Estoque mínimo"
              :required="true"
              :error="f.errors.min_stock"
              hint="Abaixo disto, o sistema repõe automaticamente."
            >
              <template #default="{ id: fid, describedBy }">
                <input
                  :id="fid"
                  ref="minStockRef"
                  type="number"
                  min="0"
                  step="1"
                  inputmode="numeric"
                  :aria-describedby="describedBy"
                  :aria-invalid="f.errors.min_stock ? 'true' : null"
                  :value="f.values.min_stock"
                  @input="f.setField('min_stock', $event.target.value)"
                  @blur="f.validateField('min_stock')"
                />
              </template>
            </UiFormField>
          </UiFormSection>

          <!-- Pré-visualização do impacto da edição (aria-live: anuncia mudanças) -->
          <div class="pe-impact" :data-tone="impactTone" aria-live="polite">
            <span class="pe-impact-ic" aria-hidden="true">{{ impactGlyph }}</span>
            <div class="pe-impact-body">
              <p class="pe-impact-txt">{{ impactMessage }}</p>
              <ul v-if="isDirty && changeList.length" class="pe-impact-diff">
                <li v-for="c in changeList" :key="c.key">
                  <span class="pe-diff-label">{{ c.label }}</span>
                  <span class="pe-diff-from">{{ c.from }}</span>
                  <span class="pe-diff-arrow" aria-hidden="true">→</span>
                  <span class="pe-diff-to">{{ c.to }}</span>
                </li>
              </ul>
            </div>
          </div>

          <FormActions
            :dirty="isDirty"
            :can-persist="canPersist"
            :saving="f.submitting.value"
            @reset="onResetRequest"
            @cancel="onCancel"
          />
        </form>
      </UiCard>
    </template>
  </UiPageLayout>
</template>

<script setup>
import { ref, computed, reactive, onMounted, nextTick, h } from 'vue';
import { useRouter } from 'vue-router';
import {
  UiPageLayout,
  UiCard,
  UiButton,
  UiFormSection,
  UiFormField,
  UiMetricCard,
  UiStatusBadge,
  UiEmptyState,
  useForm,
  useToast,
  useConfirm,
  validators,
  format,
} from '../ui/index.js';
import { products } from '../api.js';

/* products: recurso REST REAL (/v1/products) — list/get/update do api.js.
   Preferimos GET /v1/products/{id}; se o backend ainda não o expõe, caímos para
   resolver por id sobre a listagem real (sem inventar rota). update → PUT. */

const props = defineProps({ id: { type: [String, Number], required: true } });
const id = computed(() => String(props.id));

const router = useRouter();
const toast = useToast();
const ask = useConfirm();

/* ---- rotas de DOMÍNIO do inventário (só rotas reais) -------------------- */
const listRoute = '/products';
const detailRoute = computed(() => '/products/' + id.value);

/* ---- estado de carga ----------------------------------------------------- */
const loading = ref(true);
const loadError = ref(null);
const product = ref(null);
const hasProduct = computed(() => !!product.value);
const loadErrorMessage = computed(() =>
  loadError.value ? loadError.value.message || 'Falha ao carregar o produto.' : null,
);
const emptyDescription = computed(
  () =>
    'Nenhum produto com o id ' +
    id.value +
    ' no seu estoque. Ele pode ter sido removido ou pertencer a outro tenant.',
);

/* Capacidade de gravar: só TRUE quando a API expõe a escrita. O factory tem
   .update, mas PUT /v1/products/{id} é "a criar" (screen contract). Detectamos
   por flag de ambiente; default = desabilitado (fail-closed honesto). */
const canPersist = computed(() => {
  try {
    return String(import.meta.env.VITE_PRODUCTS_WRITE_ENABLED || '').toLowerCase() === 'true';
  } catch {
    return false;
  }
});

/* ---- formulário ---------------------------------------------------------- */
const baseline = reactive({ name: '', sku: '', current_stock: '', min_stock: '' });
const nameRef = ref(null);
const currentStockRef = ref(null);
const minStockRef = ref(null);
const summaryRef = ref(null);

const f = useForm({
  initial: { name: '', sku: '', current_stock: '', min_stock: '' },
  rules: {
    name: [
      validators.required('Informe o nome do produto'),
      validators.minLen(2, 'Nome muito curto'),
      validators.maxLen(120, 'Nome muito longo (máx. 120)'),
    ],
    sku: [validators.maxLen(64, 'SKU muito longo (máx. 64)')],
    current_stock: [
      validators.required('Informe o estoque atual'),
      validators.numeric('Use apenas números'),
      integerRule('O estoque deve ser um número inteiro'),
      validators.min(0, 'O estoque não pode ser negativo'),
    ],
    min_stock: [
      validators.required('Informe o estoque mínimo'),
      validators.numeric('Use apenas números'),
      integerRule('O mínimo deve ser um número inteiro'),
      validators.min(0, 'O mínimo não pode ser negativo'),
    ],
  },
});

/* regra extra (integer) componível com o runRules do kit: (v) => '' | 'msg' */
function integerRule(msg) {
  return (v) => {
    if (v === '' || v === null || v === undefined) return '';
    const n = Number(v);
    return Number.isInteger(n) ? '' : msg;
  };
}

const FIELD_LABELS = {
  name: 'Nome do produto',
  sku: 'SKU / código',
  current_stock: 'Estoque atual',
  min_stock: 'Estoque mínimo',
};
const FIELD_REFS = {
  name: nameRef,
  current_stock: currentStockRef,
  min_stock: minStockRef,
};

/* ---- carregar produto ---------------------------------------------------- */
async function load() {
  loading.value = true;
  loadError.value = null;
  product.value = null;
  try {
    const found = await fetchProduct(id.value);
    product.value = found;
    if (found) hydrate(found);
  } catch (e) {
    loadError.value = e;
  } finally {
    loading.value = false;
  }
}

/* GET /v1/products/{id}; fallback honesto p/ resolver sobre a lista real se o
   backend ainda só expõe a coleção (404 / método não suportado). */
async function fetchProduct(pid) {
  try {
    const one = await products.get(pid);
    if (one && (one.id !== undefined || one.name !== undefined)) return one;
  } catch (e) {
    if (e && e.status && e.status !== 404 && e.status !== 405 && e.status !== 501) throw e;
  }
  const res = await products.list({ pageSize: 200 });
  const rows = (res && res.data) || [];
  const target = Number(pid);
  return rows.find((r) => Number(r.id) === target) || null;
}

function hydrate(p) {
  const vals = {
    name: p.name ?? '',
    sku: p.sku ?? '',
    current_stock: numToInput(p.current_stock),
    min_stock: numToInput(p.min_stock),
  };
  Object.assign(f.values, vals);
  Object.assign(baseline, vals);
}
/* número (inclui 0) → string p/ input; null/undefined → '' */
function numToInput(v) {
  return v === null || v === undefined ? '' : String(v);
}

onMounted(load);

/* ---- derivações vivas (refletem o formulário, não o carregado) ----------- */
const numCurrent = computed(() => toNum(f.values.current_stock));
const numMin = computed(() => toNum(f.values.min_stock));

function toNum(v) {
  if (v === '' || v === null || v === undefined) return null;
  const n = Number(v);
  return isFinite(n) ? n : null;
}

/* Status projetado seguindo a regra do backend (REQ-STOCKPILOT-0003):
   RUPTURA = no/abaixo do mínimo SEM pedido aberto; ALERTA = no/abaixo do mínimo
   COM pedido aberto; OK caso contrário. Fallback: status vindo da API. */
const liveStatus = computed(() => {
  const cur = numCurrent.value;
  const min = numMin.value;
  if (cur === null || min === null) return (product.value && product.value.status) || 'OK';
  const open = !!(product.value && product.value.has_open_order);
  if (cur <= min) return open ? 'ALERTA' : 'RUPTURA';
  return 'OK';
});

const STATUS_TEXT = { OK: 'Saudável', ALERTA: 'Em alerta', RUPTURA: 'Em ruptura' };
const STATUS_TONE = { OK: 'success', ALERTA: 'warning', RUPTURA: 'error' };
const liveStatusLabel = computed(() => STATUS_TEXT[liveStatus.value] || liveStatus.value);
const badgeTone = computed(() => STATUS_TONE[liveStatus.value] || 'neutral');
const statusMetricTone = computed(() => STATUS_TONE[liveStatus.value] || 'neutral');

const liveStockLabel = computed(() =>
  numCurrent.value === null ? '—' : format.formatNumber(numCurrent.value),
);
const liveMinLabel = computed(() =>
  numMin.value === null ? '—' : format.formatNumber(numMin.value),
);

const stockTone = computed(() => {
  const cur = numCurrent.value;
  const min = numMin.value;
  if (cur === null || min === null) return 'neutral';
  if (cur <= min) return 'error';
  if (cur <= min * 1.2) return 'warning';
  return 'success';
});
const stockHint = computed(() => {
  const cur = numCurrent.value;
  const min = numMin.value;
  if (cur === null || min === null) return 'unidades em mãos';
  const diff = cur - min;
  if (diff < 0) return format.formatNumber(Math.abs(diff)) + ' abaixo do mínimo';
  if (diff === 0) return 'exatamente no mínimo';
  return format.formatNumber(diff) + ' acima do mínimo';
});
const statusHint = computed(() => {
  switch (liveStatus.value) {
    case 'RUPTURA':
      return 'reposição automática será disparada';
    case 'ALERTA':
      return 'pedido de reposição em andamento';
    default:
      return 'dentro do nível seguro';
  }
});

/* dica contextual no campo de estoque atual: avisa quando cai abaixo do mínimo */
const currentStockHint = computed(() => {
  const cur = numCurrent.value;
  const min = numMin.value;
  if (cur !== null && min !== null && cur <= min) {
    return 'Atenção: no/abaixo do mínimo — pode disparar reposição.';
  }
  return 'Unidades em mãos agora (correção de saldo).';
});

/* ---- pré-visualização de impacto ----------------------------------------- */
const impactTone = computed(() => {
  if (!isDirty.value) return 'neutral';
  if (liveStatus.value === 'RUPTURA') return 'error';
  if (liveStatus.value === 'ALERTA') return 'warning';
  return 'success';
});
const impactGlyph = computed(() => {
  switch (impactTone.value) {
    case 'error':
      return '▲';
    case 'warning':
      return '◆';
    case 'success':
      return '●';
    default:
      return 'ℹ';
  }
});
const impactMessage = computed(() => {
  if (!isDirty.value) {
    return 'Nenhuma alteração pendente. Edite um campo para ver o impacto no estoque.';
  }
  const cur = numCurrent.value;
  const min = numMin.value;
  if (cur === null || min === null) {
    return 'Preencha estoque atual e mínimo para projetar a situação.';
  }
  if (liveStatus.value === 'RUPTURA') {
    return 'Com estas mudanças o produto fica EM RUPTURA — o sistema tende a abrir um pedido de reposição.';
  }
  if (liveStatus.value === 'ALERTA') {
    return 'Com estas mudanças o produto fica EM ALERTA — no/abaixo do mínimo, com pedido em andamento.';
  }
  return 'Com estas mudanças o produto fica SAUDÁVEL — acima do estoque mínimo.';
});

/* ---- dirty / diff / validação -------------------------------------------- */
const isDirty = computed(
  () =>
    str(f.values.name) !== str(baseline.name) ||
    str(f.values.sku) !== str(baseline.sku) ||
    str(f.values.current_stock) !== str(baseline.current_stock) ||
    str(f.values.min_stock) !== str(baseline.min_stock),
);
function str(v) {
  return v === null || v === undefined ? '' : String(v).trim();
}

/* diff legível campo-a-campo (de → para) para a pré-visualização e a confirmação */
const changeList = computed(() => {
  const out = [];
  const fields = [
    { key: 'name', label: 'Nome', kind: 'text' },
    { key: 'sku', label: 'SKU', kind: 'text' },
    { key: 'current_stock', label: 'Estoque atual', kind: 'num' },
    { key: 'min_stock', label: 'Estoque mínimo', kind: 'num' },
  ];
  for (const fld of fields) {
    if (str(f.values[fld.key]) !== str(baseline[fld.key])) {
      out.push({
        key: fld.key,
        label: fld.label,
        from: displayVal(baseline[fld.key], fld.kind),
        to: displayVal(f.values[fld.key], fld.kind),
      });
    }
  }
  return out;
});
function displayVal(v, kind) {
  const s = str(v);
  if (s === '') return '—';
  if (kind === 'num') {
    const n = toNum(s);
    return n === null ? s : format.formatNumber(n);
  }
  return s;
}

const errorList = computed(() =>
  Object.keys(f.errors)
    .filter((k) => f.errors[k])
    .map((k) => ({ key: k, label: FIELD_LABELS[k] || k, message: f.errors[k] })),
);
const showValidationSummary = computed(() => errorList.value.length > 0);

const pageTitle = computed(() => {
  if (hasProduct.value && product.value && product.value.name) {
    return 'Editar — ' + product.value.name;
  }
  return 'Editar produto';
});

/* ---- ações --------------------------------------------------------------- */
function focusField(key) {
  const r = FIELD_REFS[key];
  if (r && r.value && r.value.focus) {
    r.value.focus();
  }
}

async function onSubmit() {
  if (!canPersist.value) {
    toast.warning('Gravação indisponível', {
      detail: 'O endpoint PUT /v1/products/{id} ainda não foi publicado pela API.',
    });
    return;
  }
  // handleSubmit roda validate() e só invoca o callback se TUDO passou (retorna cedo
  // se inválido). O foco no sumário de erros fica no bloco externo, após o submit.
  await f.handleSubmit(async (vals) => {
    if (!isDirty.value) {
      toast.info('Nada para salvar', { detail: 'Nenhum campo foi alterado.' });
      return;
    }
    const ok = await ask({
      title: 'Salvar alterações do produto?',
      message: confirmMessage(),
      confirmLabel: 'Salvar alterações',
      cancelLabel: 'Revisar',
      danger: liveStatus.value === 'RUPTURA',
    });
    if (!ok) return;

    try {
      const payload = {
        name: str(vals.name),
        sku: str(vals.sku) || null,
        current_stock: Number(vals.current_stock),
        min_stock: Number(vals.min_stock),
      };
      const updated = await products.update(id.value, payload);
      product.value = updated && updated.id !== undefined ? updated : { ...product.value, ...payload };
      hydrate(product.value);
      toast.success('Produto atualizado', { detail: payload.name });
      router.push(detailRoute.value);
    } catch (e) {
      toast.error('Não foi possível salvar', {
        detail: e.message,
        code: e.status ? 'HTTP ' + e.status : '',
      });
    }
  });
  // se a validação reprovou dentro do handleSubmit, anuncia o sumário
  if (errorList.value.length) {
    await nextTick();
    focusSummary();
  }
}

function focusSummary() {
  if (summaryRef.value && summaryRef.value.focus) summaryRef.value.focus();
}

function confirmMessage() {
  const parts = changeList.value.map((c) => c.label.toLowerCase());
  const what = parts.length ? 'Alterando: ' + parts.join(', ') + '. ' : '';
  return (
    what +
    'Após salvar, a situação do produto passa a ser "' +
    liveStatusLabel.value +
    '".'
  );
}

async function onResetRequest() {
  if (!isDirty.value) return;
  const ok = await ask({
    title: 'Descartar alterações?',
    message: 'Os campos voltarão aos valores carregados do servidor. Esta ação não pode ser desfeita.',
    confirmLabel: 'Descartar',
    cancelLabel: 'Manter editando',
    danger: true,
  });
  if (!ok) return;
  Object.assign(f.values, { ...baseline });
  for (const k of Object.keys(f.errors)) delete f.errors[k];
  toast.info('Alterações descartadas');
}

async function onCancel() {
  if (isDirty.value) {
    const ok = await ask({
      title: 'Sair sem salvar?',
      message: 'Há alterações não salvas que serão perdidas.',
      confirmLabel: 'Sair sem salvar',
      cancelLabel: 'Continuar editando',
      danger: true,
    });
    if (!ok) return;
  }
  router.push(detailRoute.value);
}

/* ---- FormActions: barra de ações (componente local de layout) -------------
   Usa só UiButton do kit + classes/tokens. Render-function p/ manter o template
   enxuto; sem estado próprio. */
const FormActions = {
  name: 'FormActions',
  props: {
    dirty: { type: Boolean, default: false },
    canPersist: { type: Boolean, default: false },
    saving: { type: Boolean, default: false },
  },
  emits: ['reset', 'cancel'],
  setup(p, { emit }) {
    return () =>
      h('div', { class: 'pe-actions' }, [
        h('div', { class: 'pe-actions-left' }, [
          h(
            UiButton,
            {
              variant: 'ghost',
              type: 'button',
              disabled: !p.dirty,
              onClick: () => emit('reset'),
            },
            { default: () => 'Descartar mudanças' },
          ),
        ]),
        h('div', { class: 'pe-actions-right' }, [
          h(
            UiButton,
            { variant: 'ghost', type: 'button', onClick: () => emit('cancel') },
            { default: () => 'Cancelar' },
          ),
          h(
            UiButton,
            {
              variant: 'primary',
              type: 'submit',
              loading: p.saving,
              disabled: !p.canPersist || !p.dirty || p.saving,
            },
            { default: () => (p.canPersist ? 'Salvar alterações' : 'Salvar (indisponível)') },
          ),
        ]),
      ]);
  },
};
</script>

<style scoped>
/* ===== marca StockPilot — estoque/reposição (teal/slate) via tokens --ui-* ===== */

/* banner de capacidade */
.pe-banner {
  display: flex;
  gap: var(--ui-space-3);
  align-items: flex-start;
  padding: var(--ui-space-3) var(--ui-space-4);
  border: 1px solid rgb(var(--ui-warn) / 0.4);
  border-left: 3px solid rgb(var(--ui-warn));
  background: rgb(var(--ui-warn) / 0.1);
  border-radius: var(--ui-radius-md);
}
.pe-banner-ic {
  font-size: var(--ui-text-xl);
  color: rgb(var(--ui-warn));
  line-height: 1.4;
  flex-shrink: 0;
}
.pe-banner-txt {
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-1);
}
.pe-banner-title {
  margin: 0;
  font-weight: 700;
  font-size: var(--ui-text-sm);
}
.pe-banner-sub {
  margin: 0;
  color: rgb(var(--ui-muted));
  font-size: var(--ui-text-sm);
}
.pe-banner-sub code {
  font-size: var(--ui-text-xs);
  background: rgb(var(--ui-surface-2));
  padding: 1px 5px;
  border-radius: var(--ui-radius-sm);
}

/* resumo de métricas */
.pe-summary {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: var(--ui-space-4);
}

/* cabeçalho do card */
.pe-card-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--ui-space-3);
  flex-wrap: wrap;
}
.pe-card-headings {
  min-width: 0;
}
.pe-card-title {
  font-size: var(--ui-text-lg);
}
.pe-card-sub {
  margin: var(--ui-space-1) 0 0;
  font-size: var(--ui-text-sm);
}
.pe-req {
  color: rgb(var(--ui-danger));
  font-weight: 700;
}

/* formulário */
.pe-form {
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-2);
}
.pe-ic {
  font-size: 1.1em;
  line-height: 1;
}

/* campo somente leitura (id interno) */
.pe-readonly {
  background: rgb(var(--ui-surface-2));
  color: rgb(var(--ui-muted));
  cursor: default;
}

/* ValidationSummary */
.pe-valsum {
  border: 1px solid rgb(var(--ui-danger) / 0.4);
  background: rgb(var(--ui-danger) / 0.08);
  border-radius: var(--ui-radius-md);
  padding: var(--ui-space-3) var(--ui-space-4);
  margin-bottom: var(--ui-space-3);
}
.pe-valsum-title {
  margin: 0 0 var(--ui-space-2);
  font-weight: 700;
  font-size: var(--ui-text-sm);
  color: rgb(var(--ui-danger));
}
.pe-valsum-list {
  margin: 0;
  padding-left: var(--ui-space-4);
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-1);
}
.pe-valsum-link {
  background: none;
  border: none;
  padding: 0;
  font: inherit;
  font-size: var(--ui-text-sm);
  color: rgb(var(--ui-danger));
  cursor: pointer;
  text-align: left;
  text-decoration: underline;
}

/* pré-visualização de impacto */
.pe-impact {
  display: flex;
  align-items: flex-start;
  gap: var(--ui-space-3);
  margin: var(--ui-space-3) 0 var(--ui-space-2);
  padding: var(--ui-space-3) var(--ui-space-4);
  border-radius: var(--ui-radius-md);
  border: 1px solid rgb(var(--ui-border));
  background: rgb(var(--ui-surface-2));
}
.pe-impact-ic {
  font-size: var(--ui-text-sm);
  flex-shrink: 0;
  line-height: 1.6;
  color: rgb(var(--ui-muted));
}
.pe-impact-body {
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-2);
  min-width: 0;
}
.pe-impact-txt {
  margin: 0;
  font-size: var(--ui-text-sm);
}
.pe-impact-diff {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-1);
}
.pe-impact-diff li {
  display: flex;
  align-items: center;
  gap: var(--ui-space-2);
  flex-wrap: wrap;
  font-size: var(--ui-text-xs);
}
.pe-diff-label {
  font-weight: 700;
  color: rgb(var(--ui-fg));
  min-width: 92px;
}
.pe-diff-from {
  color: rgb(var(--ui-muted));
  text-decoration: line-through;
}
.pe-diff-arrow {
  color: rgb(var(--ui-faint));
}
.pe-diff-to {
  font-weight: 700;
  color: rgb(var(--ui-accent-strong));
}
.pe-impact[data-tone='success'] {
  border-color: rgb(var(--ui-ok) / 0.4);
  background: rgb(var(--ui-ok) / 0.08);
}
.pe-impact[data-tone='success'] .pe-impact-ic {
  color: rgb(var(--ui-ok));
}
.pe-impact[data-tone='warning'] {
  border-color: rgb(var(--ui-warn) / 0.4);
  background: rgb(var(--ui-warn) / 0.1);
}
.pe-impact[data-tone='warning'] .pe-impact-ic {
  color: rgb(var(--ui-warn));
}
.pe-impact[data-tone='error'] {
  border-color: rgb(var(--ui-danger) / 0.4);
  background: rgb(var(--ui-danger) / 0.08);
}
.pe-impact[data-tone='error'] .pe-impact-ic {
  color: rgb(var(--ui-danger));
}

/* barra de ações */
.pe-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ui-space-3);
  margin-top: var(--ui-space-4);
  padding-top: var(--ui-space-4);
  border-top: 1px solid rgb(var(--ui-border));
  flex-wrap: wrap;
}
.pe-actions-right {
  display: flex;
  gap: var(--ui-space-2);
  flex-wrap: wrap;
}

@media (max-width: 640px) {
  .pe-actions {
    flex-direction: column-reverse;
    align-items: stretch;
  }
  .pe-actions-left,
  .pe-actions-right {
    width: 100%;
  }
  .pe-actions-right {
    justify-content: stretch;
  }
  .pe-diff-label {
    min-width: 0;
  }
}
</style>
