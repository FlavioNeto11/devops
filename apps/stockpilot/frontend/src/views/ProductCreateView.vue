<!--
  ProductCreateView — Novo produto (REQ-STOCKPILOT-0005, REQ-STOCKPILOT-0003)
  Rota: /products/new  ·  entidade: products  ·  kind: create
  Formulario de cadastro de produto (nome, SKU, estoque atual, estoque minimo) com
  validacao, previa ao vivo do status derivado (OK/ALERTA/RUPTURA), medidor de nivel
  de estoque e painel "Adicionados recentemente" com TODOS os estados de dados.
  Persiste via POST /v1/products (api.products.create — endpoint REAL via ../api.js).
  Cancelar com dados sujos passa por useConfirm; sucesso/erro disparam toast.
  CSP-safe: SO classes + data-* em <style scoped>; tokens --ui-* apenas; sem style
  inline / :style / v-html. Marca StockPilot (teal/slate) herdada dos tokens.
  Links de dominio (back/cancelar/recentes) apontam SEMPRE para /products (só rotas reais).
-->
<template>
  <UiPageLayout
    width="default"
    eyebrow="StockPilot · Estoque"
    title="Novo produto"
    subtitle="Cadastre um item do inventário e defina o ponto de reposição automática."
  >
    <template #actions>
      <UiButton variant="ghost" :to="listRoute">
        <template #icon-left><span class="pc-ic" aria-hidden="true">‹</span></template>
        Inventário
      </UiButton>
    </template>

    <div class="pc-grid">
      <!-- ===================== COLUNA PRINCIPAL: formulário ===================== -->
      <div class="pc-main">
        <!-- ValidationSummary: só após tentativa de envio com erros -->
        <div
          v-if="showSummary"
          ref="summaryRef"
          class="pc-valsum"
          role="alert"
          tabindex="-1"
          :aria-label="'Há ' + errorList.length + ' campo(s) a corrigir'"
        >
          <div class="pc-valsum-head">
            <span class="pc-valsum-ic" aria-hidden="true">!</span>
            <div>
              <p class="pc-valsum-title">Revise os campos destacados</p>
              <p class="pc-valsum-sub">
                {{ errorList.length }}
                {{ errorList.length === 1 ? 'campo precisa' : 'campos precisam' }}
                de atenção antes de salvar.
              </p>
            </div>
          </div>
          <ul class="pc-valsum-list">
            <li v-for="item in errorList" :key="item.key">
              <button type="button" class="pc-valsum-link" @click="focusField(item.key)">
                {{ item.label }}: {{ item.message }}
              </button>
            </li>
          </ul>
        </div>

        <!-- Banner de erro de API (falha no POST) -->
        <div v-if="submitError" class="pc-apierror" role="alert">
          <span class="pc-apierror-ic" aria-hidden="true">×</span>
          <div class="pc-apierror-txt">
            <p class="pc-apierror-title">Não foi possível salvar o produto</p>
            <p class="pc-apierror-sub">{{ submitError }}</p>
          </div>
          <UiButton variant="ghost" size="sm" type="button" @click="submit">Tentar de novo</UiButton>
        </div>

        <UiCard>
          <template #header>
            <div class="pc-card-head">
              <div>
                <h3 class="pc-card-title">Dados do produto</h3>
                <p class="pc-card-sub ui-muted">
                  Campos com <span class="pc-req">*</span> são obrigatórios.
                </p>
              </div>
              <UiStatusBadge
                :status="derivedStatus"
                :tone="derivedTone"
                :label="derivedStatusLabel"
                size="lg"
              />
            </div>
          </template>

          <form class="pc-form" novalidate @submit.prevent="submit">
            <UiFormSection
              title="Identificação"
              description="Como o produto aparece nas listas, alertas e pedidos."
              :columns="2"
            >
              <UiFormField
                label="Nome do produto"
                :required="true"
                :error="f.errors.name"
                hint="Ex.: Café torrado em grãos 500g"
                :full-width="true"
              >
                <template #default="{ id, describedBy, hasError }">
                  <input
                    :id="id"
                    ref="nameRef"
                    type="text"
                    autocomplete="off"
                    placeholder="Nome comercial do item"
                    :value="f.values.name"
                    :aria-describedby="describedBy"
                    :aria-invalid="hasError ? 'true' : null"
                    @input="f.setField('name', $event.target.value)"
                    @blur="f.validateField('name')"
                  />
                </template>
              </UiFormField>

              <UiFormField
                label="SKU / código"
                :error="f.errors.sku"
                hint="Código interno ou de fornecedor (opcional)."
                :full-width="true"
              >
                <template #default="{ id, describedBy, hasError }">
                  <input
                    :id="id"
                    ref="skuRef"
                    type="text"
                    class="pc-mono"
                    autocomplete="off"
                    placeholder="Ex.: CAF-500"
                    :value="f.values.sku"
                    :aria-describedby="describedBy"
                    :aria-invalid="hasError ? 'true' : null"
                    @input="f.setField('sku', $event.target.value.toUpperCase())"
                    @blur="f.validateField('sku')"
                  />
                </template>
              </UiFormField>
            </UiFormSection>

            <UiFormSection
              title="Níveis de estoque"
              description="O estoque mínimo é o gatilho da reposição automática (REQ-STOCKPILOT-0003)."
              :columns="2"
            >
              <UiFormField
                label="Estoque atual"
                :required="true"
                :error="f.errors.current_stock"
                hint="Unidades em mãos agora."
              >
                <template #default="{ id, describedBy, hasError }">
                  <input
                    :id="id"
                    ref="currentRef"
                    type="number"
                    inputmode="numeric"
                    min="0"
                    step="1"
                    placeholder="0"
                    :value="f.values.current_stock"
                    :aria-describedby="describedBy"
                    :aria-invalid="hasError ? 'true' : null"
                    @input="f.setField('current_stock', $event.target.value)"
                    @blur="f.validateField('current_stock')"
                  />
                </template>
              </UiFormField>

              <UiFormField
                label="Estoque mínimo"
                :required="true"
                :error="f.errors.min_stock"
                hint="Abaixo disto, dispara a reposição."
              >
                <template #default="{ id, describedBy, hasError }">
                  <input
                    :id="id"
                    ref="minRef"
                    type="number"
                    inputmode="numeric"
                    min="0"
                    step="1"
                    placeholder="0"
                    :value="f.values.min_stock"
                    :aria-describedby="describedBy"
                    :aria-invalid="hasError ? 'true' : null"
                    @input="f.setField('min_stock', $event.target.value)"
                    @blur="f.validateField('min_stock')"
                  />
                </template>
              </UiFormField>
            </UiFormSection>

            <!-- Projeção do impacto da entrada -->
            <div class="pc-impact" :data-tone="impactTone" aria-live="polite">
              <span class="pc-impact-ic" aria-hidden="true">{{ impactGlyph }}</span>
              <p class="pc-impact-txt">{{ statusHint }}</p>
            </div>

            <div class="pc-actions">
              <UiButton variant="ghost" type="button" :disabled="f.submitting.value" @click="cancel">
                Cancelar
              </UiButton>
              <UiButton type="submit" :loading="f.submitting.value" :disabled="f.submitting.value">
                {{ f.submitting.value ? 'Salvando…' : 'Salvar produto' }}
              </UiButton>
            </div>
          </form>
        </UiCard>
      </div>

      <!-- ===================== COLUNA LATERAL: prévia + recentes ===================== -->
      <aside class="pc-aside">
        <!-- Prévia ao vivo + medidor de nível -->
        <UiCard title="Prévia" subtitle="Como o item entrará no inventário.">
          <dl class="pc-preview">
            <div class="pc-preview-row">
              <dt>Produto</dt>
              <dd>{{ f.values.name || '—' }}</dd>
            </div>
            <div class="pc-preview-row">
              <dt>SKU</dt>
              <dd class="pc-mono">{{ f.values.sku || '—' }}</dd>
            </div>
            <div class="pc-preview-row">
              <dt>Estoque</dt>
              <dd>{{ stockSummary }}</dd>
            </div>
            <div class="pc-preview-row">
              <dt>Situação</dt>
              <dd>
                <UiStatusBadge
                  :status="derivedStatus"
                  :tone="derivedTone"
                  :label="derivedStatusLabel"
                  with-dot
                />
              </dd>
            </div>
          </dl>

          <!-- Medidor de nível (atual vs. mínimo) — CSS-only, sem style inline -->
          <div class="pc-gauge" :data-tone="derivedTone" role="img" :aria-label="gaugeLabel">
            <div class="pc-gauge-track">
              <div class="pc-gauge-fill" :data-fill="gaugeStep" />
              <div class="pc-gauge-min" :data-pos="minMarkerStep" aria-hidden="true" />
            </div>
            <div class="pc-gauge-legend">
              <span>0</span>
              <span class="pc-gauge-minlabel">mín. {{ minLabel }}</span>
              <span>{{ gaugeMaxLabel }}</span>
            </div>
          </div>
        </UiCard>

        <!-- Dica de domínio -->
        <UiCard>
          <div class="pc-tip">
            <span class="pc-tip-ic" aria-hidden="true">✦</span>
            <p class="pc-tip-txt">
              Defina o mínimo com folga para o tempo de entrega do fornecedor. Ao cair abaixo dele
              sem pedido aberto, o StockPilot abre a reposição e enfileira o job de forma idempotente.
            </p>
          </div>
        </UiCard>

        <!-- Adicionados recentemente — TODOS os estados -->
        <UiCard title="Adicionados recentemente" subtitle="Últimos itens do inventário.">
          <template #actions>
            <UiButton variant="ghost" size="sm" :to="listRoute">Ver todos</UiButton>
          </template>

          <UiLoadingState v-if="recent.loading" variant="skeleton" :skeleton-lines="4" />

          <UiErrorState
            v-else-if="recent.error"
            :message="recent.error"
            :retryable="true"
            @retry="loadRecent"
          />

          <UiEmptyState
            v-else-if="!recent.items.length"
            title="Nenhum produto ainda"
            description="Este será o primeiro item do seu inventário."
            icon="box"
          >
            <template #action>
              <UiButton variant="subtle" size="sm" @click="focusField('name')">
                Começar pelo nome
              </UiButton>
            </template>
          </UiEmptyState>

          <ul v-else class="pc-recent">
            <li v-for="p in recent.items" :key="p.id" class="pc-recent-item">
              <button type="button" class="pc-recent-link" @click="openProduct(p)">
                <span class="pc-recent-name">{{ p.name }}</span>
                <span class="pc-recent-meta">
                  <span class="pc-mono pc-recent-sku">{{ p.sku || 's/ SKU' }}</span>
                  <UiStatusBadge
                    :status="p.status"
                    :tone="toneFor(p.status)"
                    :label="labelFor(p.status)"
                    with-dot
                    size="sm"
                  />
                </span>
              </button>
            </li>
          </ul>
        </UiCard>
      </aside>
    </div>
  </UiPageLayout>
</template>

<script setup>
import { ref, reactive, computed, nextTick } from 'vue';
import { useRouter } from 'vue-router';
import {
  UiPageLayout,
  UiCard,
  UiButton,
  UiFormSection,
  UiFormField,
  UiStatusBadge,
  UiLoadingState,
  UiErrorState,
  UiEmptyState,
  useForm,
  useToast,
  useConfirm,
  validators,
} from '../ui/index.js';
import { products } from '../api.js';

const router = useRouter();
const toast = useToast();
const ask = useConfirm();

/* ---- rotas de DOMÍNIO (só rotas reais do inventário) -------------------- */
const listRoute = '/products';

/* ---- refs de campo (focar a partir do ValidationSummary / empty CTA) ------ */
const nameRef = ref(null);
const skuRef = ref(null);
const currentRef = ref(null);
const minRef = ref(null);
const summaryRef = ref(null);
const fieldRefs = { name: nameRef, sku: skuRef, current_stock: currentRef, min_stock: minRef };
const fieldLabels = {
  name: 'Nome do produto',
  sku: 'SKU / código',
  current_stock: 'Estoque atual',
  min_stock: 'Estoque mínimo',
};

/* ---- formulário ----------------------------------------------------------- */
const f = useForm({
  initial: { name: '', sku: '', current_stock: '', min_stock: '' },
  rules: {
    name: [validators.required('Informe o nome do produto'), validators.minLen(2, 'Nome muito curto')],
    sku: [validators.maxLen(40, 'SKU muito longo')],
    current_stock: [
      validators.required('Informe o estoque atual'),
      validators.numeric('Use apenas números'),
      validators.min(0, 'Não pode ser negativo'),
    ],
    min_stock: [
      validators.required('Informe o estoque mínimo'),
      validators.numeric('Use apenas números'),
      validators.min(0, 'Não pode ser negativo'),
    ],
  },
});

const submitError = ref('');

const errorList = computed(() =>
  Object.keys(fieldLabels)
    .filter((k) => f.errors[k])
    .map((k) => ({ key: k, label: fieldLabels[k], message: f.errors[k] })),
);
const showSummary = computed(() => errorList.value.length > 0);

const isDirty = computed(
  () => !!(f.values.name || f.values.sku || f.values.current_stock !== '' || f.values.min_stock !== ''),
);

/* ---- números derivados (null quando o campo está vazio/ inválido) --------- */
function toNum(v) {
  if (v === '' || v === null || v === undefined) return null;
  const n = Number(v);
  return isFinite(n) ? n : null;
}
const numCurrent = computed(() => toNum(f.values.current_stock));
const numMin = computed(() => toNum(f.values.min_stock));

/* ---- status derivado (espelha a regra do backend OK/ALERTA/RUPTURA) ------- */
const derivedStatus = computed(() => {
  const cur = numCurrent.value;
  const min = numMin.value;
  if (cur === null || min === null) return 'neutral';
  if (cur <= 0) return 'RUPTURA';
  if (cur <= min) return 'ALERTA';
  return 'OK';
});
const STATUS_LABELS = {
  OK: 'Em estoque',
  ALERTA: 'Estoque baixo',
  RUPTURA: 'Sem estoque',
  neutral: 'A definir',
};
const STATUS_HINTS = {
  OK: 'Acima do mínimo — sem reposição necessária no cadastro.',
  ALERTA: 'No limite ou abaixo do mínimo — a reposição será disparada.',
  RUPTURA: 'Sem unidades — entra em ruptura e gera alerta multicanal.',
  neutral: 'Preencha os níveis de estoque para ver a situação projetada.',
};
const STATUS_TONES = { OK: 'success', ALERTA: 'warning', RUPTURA: 'error', neutral: 'neutral' };

const derivedStatusLabel = computed(() => STATUS_LABELS[derivedStatus.value]);
const statusHint = computed(() => STATUS_HINTS[derivedStatus.value]);
const derivedTone = computed(() => STATUS_TONES[derivedStatus.value] || 'neutral');

function toneFor(status) {
  const key = String(status || '').toUpperCase();
  return STATUS_TONES[key] || null; // null → o badge resolve pelo próprio mapa
}
function labelFor(status) {
  const key = String(status || '').toUpperCase();
  return STATUS_LABELS[key] || ''; // '' → o badge cai no humanize() padrão
}

/* ---- projeção de impacto (banner sob o formulário) ------------------------ */
const impactTone = computed(() => derivedTone.value);
const IMPACT_GLYPHS = { success: '●', warning: '◆', error: '▲', neutral: 'ℹ' };
const impactGlyph = computed(() => IMPACT_GLYPHS[impactTone.value] || 'ℹ');

/* ---- prévia / medidor ----------------------------------------------------- */
const stockSummary = computed(() => {
  const cur = f.values.current_stock;
  const min = f.values.min_stock;
  if (cur === '' && min === '') return '—';
  const c = cur === '' ? '—' : cur;
  const m = min === '' ? '—' : min;
  return c + ' un. (mín. ' + m + ')';
});
const minLabel = computed(() => (numMin.value === null ? '—' : String(numMin.value)));

/* O medidor é discreto (0–10) para evitar geometria inline e respeitar a CSP:
   a largura/posição vão por data-fill / data-pos (classes) — nunca style inline. */
const gaugeScale = computed(() => {
  const cur = numCurrent.value || 0;
  const min = numMin.value || 0;
  // escala generosa: até ~2x o mínimo (ou o atual, se maior), mínimo 1 p/ não dividir por 0.
  return Math.max(1, min * 2, cur);
});
const gaugeMaxLabel = computed(() => (numCurrent.value === null && numMin.value === null ? '—' : String(gaugeScale.value)));

function stepOf(value) {
  if (value === null || value === undefined) return 0;
  const ratio = Math.min(1, Math.max(0, value / gaugeScale.value));
  return Math.round(ratio * 10); // 0..10
}
const gaugeStep = computed(() => stepOf(numCurrent.value));
const minMarkerStep = computed(() => stepOf(numMin.value));
const gaugeLabel = computed(() => {
  if (numCurrent.value === null) return 'Medidor de estoque — defina o estoque atual.';
  return 'Estoque atual ' + numCurrent.value + ' de mínimo ' + (numMin.value ?? '—') + '. Situação: ' + derivedStatusLabel.value + '.';
});

/* ---- recentes (estado de dados completo) ---------------------------------- */
const recent = reactive({ items: [], loading: false, error: '' });
async function loadRecent() {
  recent.loading = true;
  recent.error = '';
  try {
    const r = await products.list({ pageSize: 5, sort: 'created_at', dir: 'desc' });
    recent.items = (r.data || []).slice(0, 5);
  } catch (e) {
    recent.error = e && e.message ? e.message : 'Falha ao carregar produtos.';
  } finally {
    recent.loading = false;
  }
}
loadRecent();

/* ---- ações ---------------------------------------------------------------- */
function focusField(key) {
  const r = fieldRefs[key];
  if (r && r.value && typeof r.value.focus === 'function') r.value.focus();
}

function openProduct(p) {
  if (p && p.id != null) router.push(listRoute + '/' + p.id);
  else router.push(listRoute);
}

async function cancel() {
  if (isDirty.value) {
    const ok = await ask({
      title: 'Descartar cadastro?',
      message: 'Você preencheu campos que ainda não foram salvos. Sair agora descarta o produto.',
      confirmLabel: 'Descartar',
      cancelLabel: 'Continuar editando',
      danger: true,
    });
    if (!ok) return;
  }
  router.push(listRoute);
}

async function submit() {
  submitError.value = '';

  // Valida ANTES do handleSubmit: assim o foco-ao-sumário acontece de fato no
  // submit inválido (a11y). handleSubmit também valida e retorna cedo quando
  // inválido, então o foco precisa ficar fora do callback dele.
  if (!f.validate()) {
    await nextTick();
    if (summaryRef.value && summaryRef.value.focus) summaryRef.value.focus();
    return;
  }

  f.handleSubmit(async (vals) => {
    try {
      const payload = {
        name: String(vals.name).trim(),
        sku: vals.sku ? String(vals.sku).trim() : null,
        current_stock: Number(vals.current_stock),
        min_stock: Number(vals.min_stock),
      };
      const created = await products.create(payload);
      toast.success('Produto cadastrado', { detail: payload.name });
      router.push(created && created.id != null ? listRoute + '/' + created.id : listRoute);
    } catch (e) {
      const msg = e && e.message ? e.message : 'Erro inesperado ao salvar.';
      submitError.value = msg;
      toast.error('Falha ao cadastrar produto', {
        detail: msg,
        code: e && e.status ? 'HTTP ' + e.status : '',
      });
    }
  });
}
</script>

<style scoped>
/* ===== layout ===== */
.pc-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.7fr) minmax(0, 1fr);
  gap: var(--ui-space-5);
  align-items: start;
}
.pc-main,
.pc-aside {
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-4);
  min-width: 0;
}
.pc-ic {
  font-size: 1.1em;
  line-height: 1;
}
.pc-mono {
  font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace;
}

/* ===== ValidationSummary ===== */
.pc-valsum {
  border: 1px solid rgb(var(--ui-danger) / 0.42);
  border-left: 3px solid rgb(var(--ui-danger));
  background: rgb(var(--ui-danger) / 0.08);
  border-radius: var(--ui-radius-md);
  padding: var(--ui-space-3) var(--ui-space-4);
}
.pc-valsum-head {
  display: flex;
  align-items: flex-start;
  gap: var(--ui-space-3);
}
.pc-valsum-ic {
  flex-shrink: 0;
  width: 22px;
  height: 22px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--ui-radius-pill);
  background: rgb(var(--ui-danger) / 0.16);
  color: rgb(var(--ui-danger));
  font-weight: 800;
  font-size: var(--ui-text-sm);
  line-height: 1;
}
.pc-valsum-title {
  margin: 0;
  font-weight: 700;
  color: rgb(var(--ui-fg));
}
.pc-valsum-sub {
  margin: 2px 0 0;
  font-size: var(--ui-text-sm);
  color: rgb(var(--ui-muted));
}
.pc-valsum-list {
  list-style: none;
  margin: var(--ui-space-3) 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-1);
}
.pc-valsum-link {
  background: none;
  border: none;
  padding: 0;
  font: inherit;
  font-size: var(--ui-text-sm);
  text-align: left;
  cursor: pointer;
  color: rgb(var(--ui-danger));
  text-decoration: underline;
  text-underline-offset: 2px;
}
.pc-valsum-link:hover {
  filter: brightness(1.08);
}

/* ===== banner de erro de API ===== */
.pc-apierror {
  display: flex;
  align-items: center;
  gap: var(--ui-space-3);
  border: 1px solid rgb(var(--ui-danger) / 0.42);
  border-left: 3px solid rgb(var(--ui-danger));
  background: rgb(var(--ui-danger) / 0.08);
  border-radius: var(--ui-radius-md);
  padding: var(--ui-space-3) var(--ui-space-4);
}
.pc-apierror-ic {
  flex-shrink: 0;
  width: 22px;
  height: 22px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--ui-radius-pill);
  background: rgb(var(--ui-danger) / 0.16);
  color: rgb(var(--ui-danger));
  font-weight: 800;
  line-height: 1;
}
.pc-apierror-txt {
  flex: 1 1 auto;
  min-width: 0;
}
.pc-apierror-title {
  margin: 0;
  font-weight: 700;
  color: rgb(var(--ui-fg));
}
.pc-apierror-sub {
  margin: 2px 0 0;
  font-size: var(--ui-text-sm);
  color: rgb(var(--ui-muted));
  overflow-wrap: anywhere;
}

/* ===== card / formulário ===== */
.pc-card-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--ui-space-3);
  flex-wrap: wrap;
}
.pc-card-title {
  font-size: var(--ui-text-lg);
}
.pc-card-sub {
  margin: 2px 0 0;
  font-size: var(--ui-text-sm);
}
.pc-req {
  color: rgb(var(--ui-danger));
  font-weight: 700;
}
.pc-form {
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-2);
}

/* ===== projeção de impacto ===== */
.pc-impact {
  display: flex;
  align-items: center;
  gap: var(--ui-space-3);
  margin: var(--ui-space-2) 0;
  padding: var(--ui-space-3) var(--ui-space-4);
  border-radius: var(--ui-radius-md);
  border: 1px solid rgb(var(--ui-border));
  background: rgb(var(--ui-surface-2));
}
.pc-impact-ic {
  font-size: 0.85rem;
  flex-shrink: 0;
  color: rgb(var(--ui-muted));
}
.pc-impact-txt {
  margin: 0;
  font-size: var(--ui-text-sm);
}
.pc-impact[data-tone="success"] {
  border-color: rgb(var(--ui-ok) / 0.4);
  background: rgb(var(--ui-ok) / 0.08);
}
.pc-impact[data-tone="success"] .pc-impact-ic {
  color: rgb(var(--ui-ok));
}
.pc-impact[data-tone="warning"] {
  border-color: rgb(var(--ui-warn) / 0.4);
  background: rgb(var(--ui-warn) / 0.1);
}
.pc-impact[data-tone="warning"] .pc-impact-ic {
  color: rgb(var(--ui-warn));
}
.pc-impact[data-tone="error"] {
  border-color: rgb(var(--ui-danger) / 0.4);
  background: rgb(var(--ui-danger) / 0.08);
}
.pc-impact[data-tone="error"] .pc-impact-ic {
  color: rgb(var(--ui-danger));
}

/* ===== ações do formulário ===== */
.pc-actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--ui-space-2);
  margin-top: var(--ui-space-3);
  padding-top: var(--ui-space-4);
  border-top: 1px solid rgb(var(--ui-border));
  flex-wrap: wrap;
}

/* ===== prévia ===== */
.pc-preview {
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-3);
}
.pc-preview-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ui-space-3);
}
.pc-preview-row dt {
  color: rgb(var(--ui-muted));
  font-size: var(--ui-text-sm);
}
.pc-preview-row dd {
  margin: 0;
  font-weight: 600;
  color: rgb(var(--ui-fg));
  text-align: right;
  overflow-wrap: anywhere;
}

/* ===== medidor de nível (CSS-only; sem style inline — passos via data-*) ===== */
.pc-gauge {
  margin-top: var(--ui-space-4);
  padding-top: var(--ui-space-4);
  border-top: 1px solid rgb(var(--ui-border));
}
.pc-gauge-track {
  position: relative;
  height: 10px;
  border-radius: var(--ui-radius-pill);
  background: rgb(var(--ui-surface-2));
  border: 1px solid rgb(var(--ui-border));
  overflow: hidden;
}
.pc-gauge-fill {
  position: absolute;
  inset: 0 auto 0 0;
  height: 100%;
  width: 0;
  border-radius: var(--ui-radius-pill);
  background: rgb(var(--ui-faint));
  transition: width 0.25s ease;
}
.pc-gauge[data-tone="success"] .pc-gauge-fill { background: rgb(var(--ui-ok)); }
.pc-gauge[data-tone="warning"] .pc-gauge-fill { background: rgb(var(--ui-warn)); }
.pc-gauge[data-tone="error"] .pc-gauge-fill { background: rgb(var(--ui-danger)); }
.pc-gauge-fill[data-fill="0"] { width: 0; }
.pc-gauge-fill[data-fill="1"] { width: 10%; }
.pc-gauge-fill[data-fill="2"] { width: 20%; }
.pc-gauge-fill[data-fill="3"] { width: 30%; }
.pc-gauge-fill[data-fill="4"] { width: 40%; }
.pc-gauge-fill[data-fill="5"] { width: 50%; }
.pc-gauge-fill[data-fill="6"] { width: 60%; }
.pc-gauge-fill[data-fill="7"] { width: 70%; }
.pc-gauge-fill[data-fill="8"] { width: 80%; }
.pc-gauge-fill[data-fill="9"] { width: 90%; }
.pc-gauge-fill[data-fill="10"] { width: 100%; }
.pc-gauge-min {
  position: absolute;
  top: -2px;
  bottom: -2px;
  width: 2px;
  background: rgb(var(--ui-fg) / 0.55);
}
.pc-gauge-min[data-pos="0"] { left: 0; }
.pc-gauge-min[data-pos="1"] { left: 10%; }
.pc-gauge-min[data-pos="2"] { left: 20%; }
.pc-gauge-min[data-pos="3"] { left: 30%; }
.pc-gauge-min[data-pos="4"] { left: 40%; }
.pc-gauge-min[data-pos="5"] { left: 50%; }
.pc-gauge-min[data-pos="6"] { left: 60%; }
.pc-gauge-min[data-pos="7"] { left: 70%; }
.pc-gauge-min[data-pos="8"] { left: 80%; }
.pc-gauge-min[data-pos="9"] { left: 90%; }
.pc-gauge-min[data-pos="10"] { left: 100%; }
.pc-gauge-legend {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: var(--ui-space-2);
  font-size: var(--ui-text-xs);
  color: rgb(var(--ui-muted));
}
.pc-gauge-minlabel {
  font-weight: 600;
  color: rgb(var(--ui-fg));
}

/* ===== dica ===== */
.pc-tip {
  display: flex;
  gap: var(--ui-space-3);
  align-items: flex-start;
}
.pc-tip-ic {
  flex-shrink: 0;
  color: rgb(var(--ui-accent-strong));
  font-size: 1rem;
  line-height: 1.4;
}
.pc-tip-txt {
  margin: 0;
  font-size: var(--ui-text-sm);
  color: rgb(var(--ui-muted));
}

/* ===== recentes ===== */
.pc-recent {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-1);
}
.pc-recent-item + .pc-recent-item {
  border-top: 1px solid rgb(var(--ui-border));
}
.pc-recent-link {
  width: 100%;
  background: none;
  border: none;
  font: inherit;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ui-space-3);
  padding: var(--ui-space-2) var(--ui-space-1);
  border-radius: var(--ui-radius-sm);
  text-align: left;
}
.pc-recent-link:hover {
  background: rgb(var(--ui-surface-2));
}
.pc-recent-name {
  font-weight: 600;
  color: rgb(var(--ui-fg));
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.pc-recent-meta {
  display: inline-flex;
  align-items: center;
  gap: var(--ui-space-2);
  flex-shrink: 0;
}
.pc-recent-sku {
  font-size: var(--ui-text-xs);
  color: rgb(var(--ui-muted));
}

/* ===== responsivo ===== */
@media (max-width: 860px) {
  .pc-grid {
    grid-template-columns: 1fr;
  }
}
@media (max-width: 640px) {
  .pc-actions {
    flex-direction: column-reverse;
    align-items: stretch;
  }
}
</style>
