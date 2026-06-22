<!--
  SupplierEditView — Editar fornecedor (REQ-STOCKPILOT-0004)
  Rota: /suppliers/:id/edit  ·  entidade: suppliers
  Edita a configuração de integração de um fornecedor (gateway URL, tipo de auth,
  segredo, timeout, tentativas, ativo, observações). É a tela que controla COMO o
  gateway resiliente fala com o fornecedor (retry/backoff/timeout vivem aqui).

  Endpoints (contrato de tela): GET /v1/suppliers/{id} e PUT /v1/suppliers/{id}.
  Ambos são "a criar" na API (a entidade declara hasEndpoints:false). Seguindo a
  regra dura "sem endpoint → não dispara a ação":
    - LEITURA: tentamos GET /v1/suppliers/{id}; se a rota de item ainda não existe
      (404), resolvemos o fornecedor por id sobre GET /v1/suppliers (lista). Se nem
      a coleção existe, mostramos um estado de erro honesto com retry.
    - ESCRITA: fica DESABILITADA por padrão (fail-closed) com banner honesto; só é
      liberada quando VITE_SUPPLIERS_WRITE_ENABLED=true sinaliza que PUT está no ar.

  Estados renderizados: loading (skeleton do PageLayout) · error (+retry) · empty
  (id não encontrado) · normal (formulário rico). CSP-safe: só classes + data-*;
  tokens --ui-* apenas; sem style inline / :style / v-html. Toda navegação aponta
  para rotas de DOMÍNIO do inventário (/suppliers, /products) — só rotas reais.
  Marca StockPilot (estoque/reposição) — teal/graphite via tokens da marca.
-->
<template>
  <UiPageLayout
    width="narrow"
    eyebrow="Integrações · Fornecedores"
    :title="pageTitle"
    subtitle="Configure o gateway, a autenticação e a política de resiliência (timeout e tentativas) deste fornecedor. As mudanças passam por confirmação antes de salvar."
    :loading="loading"
    loading-message="Carregando fornecedor…"
    :error="loadErrorMessage"
    @retry="load"
  >
    <!-- AÇÕES DE TOPO (rotas de domínio — só rotas reais do inventário) -->
    <template #actions>
      <UiButton variant="ghost" :to="listRoute">
        <template #icon-left><span class="se-ic" aria-hidden="true">‹</span></template>
        Fornecedores
      </UiButton>
      <UiButton v-if="hasSupplier" variant="subtle" :to="detailRoute">Ver fornecedor</UiButton>
    </template>

    <!-- BANNER: capacidade de gravação ainda não publicada -->
    <template v-if="hasSupplier && !canPersist" #banner>
      <div class="se-banner" role="status">
        <span class="se-banner-ic" aria-hidden="true">⚑</span>
        <div class="se-banner-txt">
          <p class="se-banner-title">Gravação ainda não disponível</p>
          <p class="se-banner-sub">
            A edição depende de <code class="se-mono">PUT /v1/suppliers/{id}</code>, que ainda não foi
            publicado pela API. Você pode revisar e validar a configuração aqui; salvar será habilitado
            assim que o endpoint entrar no contrato.
          </p>
        </div>
      </div>
    </template>

    <!-- ESTADO: fornecedor inexistente (a coleção carregou, o id não bate) -->
    <UiCard v-if="!hasSupplier && !loadErrorMessage">
      <UiEmptyState
        title="Fornecedor não encontrado"
        :description="'Nenhum fornecedor com o id ' + id + ' neste tenant. Ele pode ter sido removido ou pertencer a outra conta.'"
        icon="box"
      >
        <template #action>
          <div class="se-empty-actions">
            <UiButton :to="listRoute">Voltar para fornecedores</UiButton>
            <UiButton variant="ghost" :to="productsRoute">Ver produtos</UiButton>
          </div>
        </template>
      </UiEmptyState>
    </UiCard>

    <!-- ESTADO: normal — formulário de edição -->
    <template v-else-if="hasSupplier">
      <!-- Resumo vivo da integração (reflete o formulário em tempo real) -->
      <div class="se-summary">
        <UiMetricCard label="Situação" :value="activeLabel" :tone="activeTone" :hint="activeHint" />
        <UiMetricCard label="Autenticação" :value="authLabel" tone="neutral" :hint="authHint" />
        <UiMetricCard
          label="Resiliência"
          :value="resilienceLabel"
          :tone="resilienceTone"
          hint="timeout · tentativas"
        />
      </div>

      <UiCard>
        <template #header>
          <div class="se-card-head">
            <h3 class="se-card-title">Configuração do fornecedor</h3>
            <UiStatusBadge
              :status="liveActive ? 'active' : 'inactive'"
              :tone="liveActive ? 'success' : 'neutral'"
              :label="liveActive ? 'Ativo' : 'Inativo'"
            />
          </div>
          <p class="se-card-sub se-muted">
            Identidade, conexão ao gateway e política de resiliência. Campos marcados com
            <span class="se-req" aria-hidden="true">*</span> são obrigatórios.
          </p>
        </template>

        <form class="se-form" novalidate @submit.prevent="onSubmit">
          <!-- Sumário de validação (a11y: foca/anuncia erros e linka p/ cada campo) -->
          <div
            v-if="showValidationSummary"
            ref="summaryRef"
            class="se-valsum"
            role="alert"
            tabindex="-1"
            :aria-label="'Há ' + errorList.length + ' erro(s) no formulário'"
          >
            <p class="se-valsum-title">Revise os campos abaixo</p>
            <ul class="se-valsum-list">
              <li v-for="e in errorList" :key="e.key">
                <button type="button" class="se-valsum-link" @click="focusField(e.key)">
                  {{ e.label }}: {{ e.message }}
                </button>
              </li>
            </ul>
          </div>

          <!-- SEÇÃO: Identidade -->
          <UiFormSection
            title="Identidade"
            description="Como o fornecedor aparece nas listas, alertas e pedidos de reposição."
            :columns="2"
          >
            <UiFormField label="Nome do fornecedor" :required="true" :error="f.errors.name" :full-width="true">
              <template #default="{ id: fid, describedBy }">
                <input
                  :id="fid"
                  ref="nameRef"
                  type="text"
                  autocomplete="off"
                  placeholder="Ex.: Distribuidora Central LTDA"
                  :aria-describedby="describedBy"
                  :aria-invalid="f.errors.name ? 'true' : null"
                  :value="f.values.name"
                  @input="f.setField('name', $event.target.value)"
                />
              </template>
            </UiFormField>

            <UiFormField label="ID interno">
              <template #default="{ id: fid }">
                <input
                  :id="fid"
                  class="se-readonly"
                  type="text"
                  :value="'#' + id"
                  readonly
                  aria-readonly="true"
                  tabindex="-1"
                />
              </template>
            </UiFormField>

            <UiFormField label="Criado em">
              <template #default="{ id: fid }">
                <input
                  :id="fid"
                  class="se-readonly"
                  type="text"
                  :value="createdAtLabel"
                  readonly
                  aria-readonly="true"
                  tabindex="-1"
                />
              </template>
            </UiFormField>
          </UiFormSection>

          <!-- SEÇÃO: Conexão ao gateway -->
          <UiFormSection
            title="Conexão ao gateway"
            description="Endpoint do fornecedor e como o StockPilot se autentica nele. O segredo é mascarado; deixe em branco para mantê-lo."
            :columns="2"
          >
            <UiFormField
              label="URL do gateway"
              :required="true"
              :error="f.errors.gateway_url"
              hint="Endereço HTTPS para onde os pedidos são enviados."
              :full-width="true"
            >
              <template #default="{ id: fid, describedBy }">
                <input
                  :id="fid"
                  ref="gatewayRef"
                  type="url"
                  inputmode="url"
                  autocomplete="off"
                  spellcheck="false"
                  placeholder="https://api.fornecedor.com/v1/orders"
                  :aria-describedby="describedBy"
                  :aria-invalid="f.errors.gateway_url ? 'true' : null"
                  :value="f.values.gateway_url"
                  @input="f.setField('gateway_url', $event.target.value)"
                />
              </template>
            </UiFormField>

            <UiFormField
              label="Tipo de autenticação"
              :required="true"
              :error="f.errors.auth_type"
              hint="Como o gateway autentica as chamadas."
            >
              <template #default="{ id: fid, describedBy }">
                <select
                  :id="fid"
                  ref="authRef"
                  :aria-describedby="describedBy"
                  :aria-invalid="f.errors.auth_type ? 'true' : null"
                  :value="f.values.auth_type"
                  @change="onAuthTypeChange($event.target.value)"
                >
                  <option v-for="opt in authOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
                </select>
              </template>
            </UiFormField>

            <UiFormField :label="secretLabel" :error="f.errors.secret" :hint="secretHint" :full-width="true">
              <template #default="{ id: fid, describedBy }">
                <div class="se-secret">
                  <input
                    :id="fid"
                    ref="secretRef"
                    :type="secretRevealed ? 'text' : 'password'"
                    autocomplete="new-password"
                    spellcheck="false"
                    :placeholder="secretPlaceholder"
                    :disabled="!secretApplicable"
                    :aria-describedby="describedBy"
                    :aria-invalid="f.errors.secret ? 'true' : null"
                    :value="f.values.secret"
                    @input="f.setField('secret', $event.target.value)"
                  />
                  <UiButton
                    type="button"
                    variant="ghost"
                    size="sm"
                    :disabled="!secretApplicable || !f.values.secret"
                    :aria-pressed="secretRevealed ? 'true' : 'false'"
                    :aria-label="(secretRevealed ? 'Ocultar' : 'Mostrar') + ' segredo digitado'"
                    @click="secretRevealed = !secretRevealed"
                  >{{ secretRevealed ? 'Ocultar' : 'Mostrar' }}</UiButton>
                </div>
              </template>
            </UiFormField>
          </UiFormSection>

          <!-- SEÇÃO: Resiliência -->
          <UiFormSection
            title="Resiliência"
            description="Política de timeout e novas tentativas do gateway resiliente ao falar com este fornecedor."
            :columns="2"
          >
            <UiFormField
              label="Timeout (ms)"
              :error="f.errors.timeout_ms"
              hint="Tempo máximo por requisição. Vazio = usa o padrão do gateway."
            >
              <template #default="{ id: fid, describedBy }">
                <input
                  :id="registerFieldId('timeout_ms', fid)"
                  type="number"
                  min="0"
                  step="100"
                  inputmode="numeric"
                  placeholder="Ex.: 5000"
                  :aria-describedby="describedBy"
                  :aria-invalid="f.errors.timeout_ms ? 'true' : null"
                  :value="f.values.timeout_ms"
                  @input="f.setField('timeout_ms', $event.target.value)"
                />
              </template>
            </UiFormField>

            <UiFormField
              label="Máx. de tentativas"
              :error="f.errors.max_retries"
              hint="Reenvios após a 1ª falha (retry/backoff). 0 = sem retry."
            >
              <template #default="{ id: fid, describedBy }">
                <input
                  :id="registerFieldId('max_retries', fid)"
                  type="number"
                  min="0"
                  max="10"
                  step="1"
                  inputmode="numeric"
                  placeholder="Ex.: 3"
                  :aria-describedby="describedBy"
                  :aria-invalid="f.errors.max_retries ? 'true' : null"
                  :value="f.values.max_retries"
                  @input="f.setField('max_retries', $event.target.value)"
                />
              </template>
            </UiFormField>

            <div class="se-toggle-field" data-full="true">
              <label class="se-toggle">
                <input
                  type="checkbox"
                  class="se-toggle-input"
                  :checked="liveActive"
                  @change="f.setField('active', $event.target.checked)"
                />
                <span class="se-toggle-box" aria-hidden="true" />
                <span class="se-toggle-text">
                  <span class="se-toggle-label">Fornecedor ativo</span>
                  <span class="se-toggle-hint se-muted">
                    Inativo: o StockPilot não envia pedidos automáticos a este fornecedor.
                  </span>
                </span>
              </label>
            </div>
          </UiFormSection>

          <!-- SEÇÃO: Observações -->
          <UiFormSection
            title="Observações"
            description="Notas internas sobre o fornecedor (contato, SLA, contrato)."
            :columns="1"
          >
            <UiFormField label="Observações" :error="f.errors.notes" :hint="notesHint">
              <template #default="{ id: fid, describedBy }">
                <textarea
                  :id="registerFieldId('notes', fid)"
                  rows="3"
                  autocomplete="off"
                  maxlength="500"
                  placeholder="Ex.: SLA de 48h. Contato: compras@fornecedor.com"
                  :aria-describedby="describedBy"
                  :aria-invalid="f.errors.notes ? 'true' : null"
                  :value="f.values.notes"
                  @input="f.setField('notes', $event.target.value)"
                />
              </template>
            </UiFormField>
          </UiFormSection>

          <!-- Pré-visualização do impacto da edição (anunciada a leitores de tela) -->
          <div class="se-impact" :data-tone="impactTone" aria-live="polite">
            <span class="se-impact-ic" aria-hidden="true">{{ impactGlyph }}</span>
            <p class="se-impact-txt">{{ impactMessage }}</p>
          </div>

          <!-- BARRA DE AÇÕES (FormActions — composta só de UiButton + tokens) -->
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
import { suppliers } from '../api.js';

/* suppliers: recurso REST REAL (/v1/suppliers) exportado por api.js (garantido pelo
   integrador). GET/PUT /v1/suppliers[/{id}] são "a criar" no contrato; tratamos isso
   com fail-soft na leitura (resolve por id sobre a lista) e fail-closed na escrita. */

const props = defineProps({ id: { type: [String, Number], required: true } });

const router = useRouter();
const toast = useToast();
const confirm = useConfirm();

/* ---- rotas de DOMÍNIO (inventário — só rotas reais) --------------------- */
const listRoute = '/suppliers';
const productsRoute = '/products';
const detailRoute = computed(() => '/suppliers/' + props.id);

/* ---- estado de carga ----------------------------------------------------- */
const loading = ref(true);
const loadError = ref(null);
const supplier = ref(null);
const hasSupplier = computed(() => !!supplier.value);
const loadErrorMessage = computed(() =>
  loadError.value ? loadError.value.message || 'Não foi possível carregar o fornecedor.' : null,
);

/* Capacidade de gravar: só TRUE quando a API expõe PUT /v1/suppliers/{id}.
   O factory já tem .update, mas o endpoint é "a criar" → fail-closed honesto. */
const canPersist = computed(() => {
  try {
    return String(import.meta.env.VITE_SUPPLIERS_WRITE_ENABLED || '').toLowerCase() === 'true';
  } catch {
    return false;
  }
});

/* ---- opções de autenticação (enum do schema) ----------------------------- */
const authOptions = [
  { value: 'api_key', label: 'API key' },
  { value: 'bearer', label: 'Bearer token' },
  { value: 'basic', label: 'Basic (usuário e senha)' },
  { value: 'none', label: 'Sem autenticação' },
];
const AUTH_LABELS = { api_key: 'API key', bearer: 'Bearer token', basic: 'Basic', none: 'Nenhuma' };
/* auth que NÃO usa segredo */
const secretApplicable = computed(() => f.values.auth_type !== 'none');

/* ---- baseline (configuração carregada do servidor) + refs de campo -------- */
const baseline = reactive({
  name: '',
  gateway_url: '',
  auth_type: 'api_key',
  secret: '',
  timeout_ms: '',
  max_retries: '',
  active: true,
  notes: '',
});
const secretRevealed = ref(false);
/* o fornecedor já tinha segredo configurado? (define o texto "manter/substituir") */
const hadSecret = ref(false);

const nameRef = ref(null);
const gatewayRef = ref(null);
const authRef = ref(null);
const secretRef = ref(null);
const summaryRef = ref(null);

const f = useForm({
  initial: {
    name: '',
    gateway_url: '',
    auth_type: 'api_key',
    secret: '',
    timeout_ms: '',
    max_retries: '',
    active: true,
    notes: '',
  },
  rules: {
    name: [validators.required('Informe o nome do fornecedor'), validators.minLen(2, 'Nome muito curto')],
    gateway_url: [
      validators.required('Informe a URL do gateway'),
      validators.pattern(/^https?:\/\/.+/i, 'Use uma URL http(s):// completa'),
    ],
    auth_type: [validators.required('Escolha o tipo de autenticação')],
    timeout_ms: [validators.numeric('Use apenas números'), validators.min(0, 'O timeout não pode ser negativo')],
    max_retries: [
      validators.numeric('Use apenas números'),
      validators.min(0, 'Não pode ser negativo'),
      validators.max(10, 'No máximo 10 tentativas'),
    ],
    notes: [validators.maxLen(500, 'Máximo de 500 caracteres')],
  },
});

const FIELD_LABELS = {
  name: 'Nome do fornecedor',
  gateway_url: 'URL do gateway',
  auth_type: 'Tipo de autenticação',
  secret: 'Segredo',
  timeout_ms: 'Timeout (ms)',
  max_retries: 'Máx. de tentativas',
  notes: 'Observações',
};

/* ---- carregar fornecedor ------------------------------------------------- */
async function load() {
  loading.value = true;
  loadError.value = null;
  supplier.value = null;
  try {
    const found = await fetchSupplier(props.id);
    supplier.value = found;
    if (found) hydrate(found);
  } catch (e) {
    loadError.value = e;
  } finally {
    loading.value = false;
  }
}

/* tenta GET /v1/suppliers/{id}; se a rota de item não existe (404), resolve por
   id sobre a coleção. Se a coleção também falhar, propaga o erro (estado de erro). */
async function fetchSupplier(id) {
  try {
    const detail = await suppliers.get(id);
    return (detail && detail.supplier) || detail || null;
  } catch (e) {
    if (e && e.status && e.status !== 404) throw e;
    const res = await suppliers.list({ pageSize: 200 });
    const rows = (res && res.data) || [];
    const idNum = Number(id);
    return rows.find((r) => Number(r.id) === idNum) || null;
  }
}

function hydrate(s) {
  hadSecret.value = !!(s.has_secret || s.secret_set || s.auth_configured);
  const vals = {
    name: s.name ?? '',
    gateway_url: s.gateway_url ?? '',
    auth_type: normalizeAuth(s.auth_type),
    secret: '', // nunca pré-preenchemos segredo
    timeout_ms: numToInput(s.timeout_ms),
    max_retries: numToInput(s.max_retries),
    active: s.active === undefined || s.active === null ? true : !!s.active,
    notes: s.notes ?? '',
  };
  Object.assign(f.values, vals);
  Object.assign(baseline, vals);
  for (const k of Object.keys(f.errors)) delete f.errors[k];
  secretRevealed.value = false;
}
function normalizeAuth(v) {
  const t = String(v || '').toLowerCase();
  return authOptions.some((o) => o.value === t) ? t : 'api_key';
}
/* número (inclui 0) → string para o input; null/undefined → '' */
function numToInput(v) {
  return v === null || v === undefined ? '' : String(v);
}

onMounted(load);

/* ---- troca do tipo de auth: limpa segredo ao virar "none" ---------------- */
function onAuthTypeChange(value) {
  f.setField('auth_type', value);
  if (value === 'none') {
    f.setField('secret', '');
    secretRevealed.value = false;
  }
}

/* ---- derivações vivas (refletem o formulário em tempo real) -------------- */
const liveActive = computed(() => !!f.values.active);
const activeLabel = computed(() => (liveActive.value ? 'Ativo' : 'Inativo'));
const activeTone = computed(() => (liveActive.value ? 'success' : 'neutral'));
const activeHint = computed(() => (liveActive.value ? 'envia pedidos automáticos' : 'pausado para reposição'));

const authLabel = computed(() => AUTH_LABELS[f.values.auth_type] || '—');
const authHint = computed(() => (secretApplicable.value ? 'usa segredo' : 'sem credencial'));

const numTimeout = computed(() => toNum(f.values.timeout_ms));
const numRetries = computed(() => toNum(f.values.max_retries));
function toNum(v) {
  if (v === '' || v === null || v === undefined) return null;
  const n = Number(v);
  return isFinite(n) ? n : null;
}

const resilienceLabel = computed(() => {
  const t = numTimeout.value;
  const r = numRetries.value;
  const tLabel = t === null ? 'padrão' : format.formatNumber(t) + ' ms';
  const rLabel = r === null ? '—' : r + (r === 1 ? ' tentativa' : ' tentativas');
  return tLabel + ' · ' + rLabel;
});
const resilienceTone = computed(() => {
  const t = numTimeout.value;
  const r = numRetries.value;
  // timeout curtíssimo ou sem retry em fornecedor ativo → alerta
  if (t !== null && t > 0 && t < 1000) return 'warning';
  if (liveActive.value && r === 0) return 'warning';
  return 'neutral';
});

/* ---- segredo: rótulo/placeholder/hint contextual ------------------------- */
const secretLabel = computed(() => {
  if (!secretApplicable.value) return 'Segredo (não aplicável)';
  switch (f.values.auth_type) {
    case 'api_key':
      return 'API key';
    case 'bearer':
      return 'Bearer token';
    case 'basic':
      return 'Credencial (usuário:senha)';
    default:
      return 'Segredo';
  }
});
const secretPlaceholder = computed(() => {
  if (!secretApplicable.value) return 'Sem credencial para este tipo de auth';
  return hadSecret.value ? '•••••••• (configurado — deixe em branco para manter)' : 'Cole o segredo aqui';
});
const secretHint = computed(() => {
  if (!secretApplicable.value) return 'O tipo "Sem autenticação" não usa credencial.';
  if (hadSecret.value) return 'Já existe um segredo salvo. Preencha apenas para substituí-lo.';
  return 'Nunca exibimos segredos salvos — eles são mascarados pela API.';
});

const notesHint = computed(() => {
  const len = String(f.values.notes || '').length;
  const base = 'Opcional. Visível apenas para a sua equipe.';
  return len ? base + ' ' + len + '/500' : base;
});

/* ---- pré-visualização de impacto ----------------------------------------- */
const impactTone = computed(() => {
  if (!isDirty.value) return 'neutral';
  if (!liveActive.value && baseline.active) return 'warning';
  if (resilienceTone.value === 'warning') return 'warning';
  return 'success';
});
const impactGlyph = computed(() => {
  switch (impactTone.value) {
    case 'warning':
      return '◆';
    case 'success':
      return '●';
    default:
      return 'ℹ';
  }
});
const impactMessage = computed(() => {
  if (!isDirty.value) return 'Nenhuma alteração pendente. Edite um campo para ver o impacto na integração.';
  const parts = changedParts();
  const lead = parts.length ? 'Alterando: ' + parts.join(', ') + '. ' : '';
  if (!liveActive.value && baseline.active) {
    return lead + 'Ao desativar, o StockPilot deixa de enviar pedidos automáticos a este fornecedor.';
  }
  if (numTimeout.value !== null && numTimeout.value > 0 && numTimeout.value < 1000) {
    return lead + 'Timeout muito curto (< 1s) pode causar falhas e disparar reenvios com frequência.';
  }
  if (liveActive.value && numRetries.value === 0) {
    return lead + 'Sem novas tentativas: uma falha do fornecedor manda o pedido direto para a DLQ.';
  }
  return lead + 'As mudanças entram em vigor nas próximas chamadas ao gateway deste fornecedor.';
});

/* ---- dirty / mudanças ---------------------------------------------------- */
const isDirty = computed(() => changedKeys().length > 0);

function changedKeys() {
  const keys = ['name', 'gateway_url', 'auth_type', 'timeout_ms', 'max_retries', 'notes'];
  const out = [];
  for (const k of keys) {
    if (str(f.values[k]) !== str(baseline[k])) out.push(k);
  }
  if (!!f.values.active !== !!baseline.active) out.push('active');
  if (str(f.values.secret) !== '') out.push('secret');
  return out;
}
function changedParts() {
  return changedKeys().map((k) => CHANGE_LABELS[k] || k);
}
const CHANGE_LABELS = {
  name: 'nome',
  gateway_url: 'URL do gateway',
  auth_type: 'tipo de autenticação',
  secret: 'segredo',
  timeout_ms: 'timeout',
  max_retries: 'tentativas',
  active: 'situação (ativo/inativo)',
  notes: 'observações',
};
function str(v) {
  return v === null || v === undefined ? '' : String(v).trim();
}

/* ---- validação / sumário ------------------------------------------------- */
const errorList = computed(() =>
  Object.keys(f.errors)
    .filter((k) => f.errors[k])
    .map((k) => ({ key: k, label: FIELD_LABELS[k] || k, message: f.errors[k] })),
);
const showValidationSummary = computed(() => errorList.value.length > 0);

const createdAtLabel = computed(() =>
  supplier.value && supplier.value.created_at ? format.formatDateTime(supplier.value.created_at) : '—',
);

const pageTitle = computed(() => {
  if (hasSupplier.value && supplier.value && supplier.value.name) return 'Editar — ' + supplier.value.name;
  return 'Editar fornecedor';
});

/* ---- foco em campo do sumário (a11y) ------------------------------------- */
/* Foco determinístico, independente de i18n: campos com ref nomeado focam pelo
   ref; os demais (timeout/retries/notes) registram o id que o UiFormField emite
   no slot (registerFieldId), eliminando a varredura por textContent de <label>. */
const FIELD_REFS = { name: nameRef, gateway_url: gatewayRef, auth_type: authRef, secret: secretRef };
const fieldIds = reactive({});
/* passthrough: devolve o id do slot (p/ o :id do input) e o memoriza p/ focar */
function registerFieldId(key, id) {
  fieldIds[key] = id;
  return id;
}
function focusField(key) {
  const r = FIELD_REFS[key];
  if (r && r.value && r.value.focus) {
    r.value.focus();
    return;
  }
  if (typeof document === 'undefined') return;
  const elId = fieldIds[key];
  const el = elId ? document.getElementById(elId) : null;
  if (el && el.focus) el.focus();
}

/* ---- submit (validação → confirmação → PUT) ------------------------------ */
async function onSubmit() {
  if (!canPersist.value) {
    toast.warning('Gravação indisponível', {
      detail: 'O endpoint PUT /v1/suppliers/{id} ainda não foi publicado pela API.',
    });
    return;
  }
  /* Valida ANTES de handleSubmit: handleSubmit() roda validate() e retorna sem
     executar o callback quando há erro — então o foco no sumário (a11y) precisa
     viver aqui fora. validate() popula f.errors → errorList/summary renderizam;
     nextTick garante que o nó do sumário existe antes de focá-lo. */
  if (!f.validate()) {
    await nextTick();
    focusSummary();
    return;
  }
  await f.handleSubmit(async (vals) => {
    const ok = await confirm({
      title: 'Salvar configuração do fornecedor?',
      message: confirmMessage(),
      confirmLabel: 'Salvar alterações',
      cancelLabel: 'Revisar',
      danger: !liveActive.value && baseline.active,
    });
    if (!ok) return;
    try {
      const payload = buildPayload(vals);
      const updated = await suppliers.update(props.id, payload);
      const next = updated && updated.id ? updated : { ...supplier.value, ...payload, secret: undefined };
      supplier.value = next;
      hydrate(next);
      toast.success('Fornecedor atualizado', { detail: payload.name });
      router.push(detailRoute.value);
    } catch (e) {
      toast.error('Não foi possível salvar', {
        detail: e.message,
        code: e.status ? 'HTTP ' + e.status : '',
      });
    }
  });
}

/* monta o corpo do PUT: só envia segredo se o operador digitou um novo;
   timeout/retries vazios viram null (usa padrão do gateway). */
function buildPayload(vals) {
  const payload = {
    name: str(vals.name),
    gateway_url: str(vals.gateway_url),
    auth_type: vals.auth_type,
    timeout_ms: toNum(vals.timeout_ms),
    max_retries: toNum(vals.max_retries),
    active: !!vals.active,
    notes: str(vals.notes) || null,
  };
  if (vals.auth_type !== 'none' && str(vals.secret) !== '') {
    payload.secret = str(vals.secret);
  }
  return payload;
}

function confirmMessage() {
  const parts = changedParts();
  const what = parts.length ? 'Alterando: ' + parts.join(', ') + '. ' : '';
  const state = liveActive.value ? 'ATIVO' : 'INATIVO';
  return what + 'Após salvar, o fornecedor fica ' + state + ' e as mudanças valem nas próximas chamadas ao gateway.';
}

function focusSummary() {
  if (summaryRef.value && summaryRef.value.focus) summaryRef.value.focus();
}

/* ---- descartar / cancelar (confirmação) ---------------------------------- */
async function onResetRequest() {
  if (!isDirty.value) return;
  const ok = await confirm({
    title: 'Descartar alterações?',
    message: 'Os campos voltarão à configuração carregada do servidor. Esta ação não pode ser desfeita.',
    confirmLabel: 'Descartar',
    cancelLabel: 'Manter editando',
    danger: true,
  });
  if (!ok) return;
  Object.assign(f.values, { ...baseline, secret: '' });
  for (const k of Object.keys(f.errors)) delete f.errors[k];
  secretRevealed.value = false;
  toast.info('Alterações descartadas');
}

async function onCancel() {
  if (isDirty.value) {
    const ok = await confirm({
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

/* ---- FormActions: barra de ações (componente local de layout) ------------
   Usa só UiButton do kit + classes/tokens. Slot-less, props/eventos simples. */
const FormActions = {
  name: 'FormActions',
  props: { dirty: Boolean, canPersist: Boolean, saving: Boolean },
  emits: ['reset', 'cancel'],
  setup(p, { emit }) {
    return () =>
      h('div', { class: 'se-actions' }, [
        h('div', { class: 'se-actions-left' }, [
          h(
            UiButton,
            { variant: 'ghost', type: 'button', disabled: !p.dirty, onClick: () => emit('reset') },
            { default: () => 'Descartar mudanças' },
          ),
        ]),
        h('div', { class: 'se-actions-right' }, [
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
/* ---- marca StockPilot: integrações/fornecedores (teal/graphite) via --ui-* -- */

/* banner de capacidade */
.se-banner {
  display: flex;
  gap: var(--ui-space-3);
  align-items: flex-start;
  padding: var(--ui-space-3) var(--ui-space-4);
  border: 1px solid rgb(var(--ui-warn) / 0.4);
  border-left: 3px solid rgb(var(--ui-warn));
  background: rgb(var(--ui-warn) / 0.1);
  border-radius: var(--ui-radius-md);
}
.se-banner-ic {
  font-size: 1.2rem;
  color: rgb(var(--ui-warn));
  line-height: 1.4;
}
.se-banner-txt {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.se-banner-title {
  margin: 0;
  font-weight: 700;
  font-size: var(--ui-text-sm);
}
.se-banner-sub {
  margin: 0;
  color: rgb(var(--ui-muted));
  font-size: var(--ui-text-sm);
}
.se-banner-sub code {
  font-size: var(--ui-text-xs);
  background: rgb(var(--ui-surface-2));
  padding: 1px 5px;
  border-radius: var(--ui-radius-sm);
}

.se-mono {
  font-family: var(--ui-font-mono, ui-monospace, monospace);
}
.se-muted {
  color: rgb(var(--ui-muted));
}

/* ações do estado vazio */
.se-empty-actions {
  display: flex;
  gap: var(--ui-space-2);
  flex-wrap: wrap;
  justify-content: center;
}

/* resumo de métricas */
.se-summary {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: var(--ui-space-4);
}

/* cabeçalho do card */
.se-card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ui-space-3);
  flex-wrap: wrap;
}
.se-card-title {
  font-size: var(--ui-text-lg);
}
.se-card-sub {
  margin: 4px 0 0;
  font-size: var(--ui-text-sm);
}
.se-req {
  color: rgb(var(--ui-danger));
}

/* formulário */
.se-form {
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-2);
}
.se-ic {
  font-size: 1.1em;
  line-height: 1;
}

/* campos somente leitura (id / criado em) */
.se-readonly {
  background: rgb(var(--ui-surface-2));
  color: rgb(var(--ui-muted));
  cursor: default;
}

/* campo de segredo: input + botão mostrar/ocultar */
.se-secret {
  display: flex;
  gap: var(--ui-space-2);
  align-items: stretch;
}
.se-secret input {
  flex: 1 1 auto;
  min-width: 0;
}
.se-secret input:disabled {
  background: rgb(var(--ui-surface-2));
  color: rgb(var(--ui-muted));
  cursor: not-allowed;
}

/* toggle "ativo" estilizado (checkbox acessível) */
.se-toggle-field[data-full="true"] {
  grid-column: 1 / -1;
}
.se-toggle {
  display: flex;
  align-items: flex-start;
  gap: var(--ui-space-3);
  cursor: pointer;
  padding: var(--ui-space-3);
  border: 1px solid rgb(var(--ui-border));
  border-radius: var(--ui-radius-md);
  background: rgb(var(--ui-surface-2));
}
.se-toggle-input {
  position: absolute;
  opacity: 0;
  width: 1px;
  height: 1px;
  margin: 0;
}
.se-toggle-box {
  position: relative;
  flex-shrink: 0;
  width: 40px;
  height: 22px;
  margin-top: 1px;
  border-radius: var(--ui-radius-pill);
  background: rgb(var(--ui-muted) / 0.35);
  border: 1px solid rgb(var(--ui-border-strong));
  transition: background 0.18s ease;
}
.se-toggle-box::after {
  content: "";
  position: absolute;
  top: 2px;
  left: 2px;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: rgb(var(--ui-surface));
  box-shadow: var(--ui-shadow-sm);
  transition: transform 0.18s ease;
}
.se-toggle-input:checked + .se-toggle-box {
  background: rgb(var(--ui-accent));
  border-color: rgb(var(--ui-accent));
}
.se-toggle-input:checked + .se-toggle-box::after {
  transform: translateX(18px);
}
.se-toggle-input:focus-visible + .se-toggle-box {
  outline: 2px solid rgb(var(--ui-accent));
  outline-offset: 2px;
}
.se-toggle-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.se-toggle-label {
  font-size: var(--ui-text-sm);
  font-weight: 600;
  color: rgb(var(--ui-fg));
}
.se-toggle-hint {
  font-size: var(--ui-text-xs);
}

/* sumário de validação */
.se-valsum {
  border: 1px solid rgb(var(--ui-danger) / 0.4);
  background: rgb(var(--ui-danger) / 0.08);
  border-radius: var(--ui-radius-md);
  padding: var(--ui-space-3) var(--ui-space-4);
  margin-bottom: var(--ui-space-3);
}
.se-valsum-title {
  margin: 0 0 var(--ui-space-2);
  font-weight: 700;
  font-size: var(--ui-text-sm);
  color: rgb(var(--ui-danger));
}
.se-valsum-list {
  margin: 0;
  padding-left: var(--ui-space-4);
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.se-valsum-link {
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
.se-impact {
  display: flex;
  align-items: center;
  gap: var(--ui-space-3);
  margin: var(--ui-space-3) 0 var(--ui-space-2);
  padding: var(--ui-space-3) var(--ui-space-4);
  border-radius: var(--ui-radius-md);
  border: 1px solid rgb(var(--ui-border));
  background: rgb(var(--ui-surface-2));
}
.se-impact-ic {
  font-size: 0.85rem;
  flex-shrink: 0;
}
.se-impact-txt {
  margin: 0;
  font-size: var(--ui-text-sm);
}
.se-impact[data-tone="success"] {
  border-color: rgb(var(--ui-ok) / 0.4);
  background: rgb(var(--ui-ok) / 0.08);
}
.se-impact[data-tone="success"] .se-impact-ic {
  color: rgb(var(--ui-ok));
}
.se-impact[data-tone="warning"] {
  border-color: rgb(var(--ui-warn) / 0.4);
  background: rgb(var(--ui-warn) / 0.1);
}
.se-impact[data-tone="warning"] .se-impact-ic {
  color: rgb(var(--ui-warn));
}
.se-impact[data-tone="neutral"] .se-impact-ic {
  color: rgb(var(--ui-muted));
}

/* barra de ações */
.se-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ui-space-3);
  margin-top: var(--ui-space-4);
  padding-top: var(--ui-space-4);
  border-top: 1px solid rgb(var(--ui-border));
  flex-wrap: wrap;
}
.se-actions-right {
  display: flex;
  gap: var(--ui-space-2);
  flex-wrap: wrap;
}

@media (max-width: 640px) {
  .se-actions {
    flex-direction: column-reverse;
    align-items: stretch;
  }
  .se-actions-left,
  .se-actions-right {
    width: 100%;
  }
  .se-actions-right {
    justify-content: stretch;
  }
}
</style>
