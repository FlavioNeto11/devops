<!-- InventoryAdjustView — Ajustar estoque (REQ-SHOPDESK-0005 / REQ-SHOPDESK-0002).
     Ajuste manual de quantidade e ponto de reposição, com MOTIVO obrigatório registrado em
     auditoria. Dois modos de ajuste (definir valor absoluto ou somar/subtrair), com PRÉVIA ao vivo
     do resultado (quantidade + situação derivada) antes de salvar. Confirmação explícita (a
     operação é auditável) + toast de sucesso/erro. CSP-safe: só classes + data-* (sem style inline /
     :style / v-html). Todos os estados: loading / not-found (empty) / error+retry / normal. -->
<template>
  <UiPageLayout
    eyebrow="Estoque"
    title="Ajustar estoque"
    subtitle="Corrija a quantidade e o ponto de reposição. Todo ajuste exige um motivo e fica registrado na auditoria."
    width="default"
    :loading="loading"
    loading-message="Carregando item de estoque…"
    :error="loadError"
    @retry="reload"
  >
    <template #actions>
      <UiButton variant="ghost" to="/inventory">Voltar ao estoque</UiButton>
    </template>

    <!-- ESTADO: item não encontrado (404 / vazio) -->
    <UiCard v-if="notFound">
      <UiEmptyState
        icon="🔍"
        title="Item de estoque não encontrado"
        description="Este item não existe mais ou o link está incorreto. Volte à lista de estoque para escolher outro."
      >
        <template #action>
          <UiButton to="/inventory">Ir para o estoque</UiButton>
        </template>
      </UiEmptyState>
    </UiCard>

    <!-- ESTADO: normal -->
    <div v-else class="ia-grid">
      <!-- Coluna esquerda: situação atual (referência) + prévia do ajuste -->
      <div class="ia-aside">
        <UiCard title="Situação atual" subtitle="Valores registrados hoje. Use como referência ao corrigir.">
          <dl class="ia-facts">
            <div class="ia-fact">
              <dt>Produto</dt>
              <dd class="ia-fact-strong">{{ item.productName || '—' }}</dd>
            </div>
            <div class="ia-fact">
              <dt>SKU</dt>
              <dd class="ui-mono">{{ item.sku || '—' }}</dd>
            </div>
            <div class="ia-fact">
              <dt>Local</dt>
              <dd>{{ item.location || 'Não informado' }}</dd>
            </div>
            <div class="ia-fact">
              <dt>Quantidade</dt>
              <dd class="ia-fact-num">{{ formatQty(item.quantity) }}</dd>
            </div>
            <div class="ia-fact">
              <dt>Ponto de reposição</dt>
              <dd class="ia-fact-num">{{ item.reorderPoint == null ? '—' : formatQty(item.reorderPoint) }}</dd>
            </div>
            <div class="ia-fact">
              <dt>Situação</dt>
              <dd>
                <UiStatusBadge
                  :status="currentStatus"
                  :tone="toneFor(currentStatus)"
                  :label="statusText(currentStatus)"
                />
              </dd>
            </div>
            <div class="ia-fact">
              <dt>Atualizado em</dt>
              <dd>{{ updatedAtLabel }}</dd>
            </div>
          </dl>
        </UiCard>

        <!-- Prévia do resultado: sempre visível, reflete o formulário ao vivo -->
        <UiCard title="Resultado do ajuste" subtitle="Prévia antes de salvar.">
          <div class="ia-preview">
            <div class="ia-preview-row">
              <span class="ia-preview-label">Quantidade</span>
              <span class="ia-preview-change">
                <span class="ia-preview-from">{{ formatQty(item.quantity) }}</span>
                <span class="ia-arrow" aria-hidden="true">→</span>
                <span class="ia-preview-to" :data-dir="qtyDirection">
                  {{ previewInvalid ? 'inválido' : formatQty(previewQuantity) }}
                </span>
              </span>
            </div>
            <!-- Resumo do resultado: única região aria-live="polite" da prévia (anuncia o efeito do
                 ajuste). As demais notas/contadores são apenas visuais para não competir no leitor. -->
            <p class="ia-preview-delta" :data-dir="qtyDirection" aria-live="polite">
              <span aria-hidden="true">{{ deltaGlyph }}</span>
              {{ deltaLabel }}
            </p>

            <div class="ia-preview-row ia-preview-row--sep">
              <span class="ia-preview-label">Ponto de reposição</span>
              <span class="ia-preview-change">
                <span class="ia-preview-from">{{ item.reorderPoint == null ? '—' : formatQty(item.reorderPoint) }}</span>
                <span class="ia-arrow" aria-hidden="true">→</span>
                <span class="ia-preview-to">{{ previewReorder == null ? '—' : formatQty(previewReorder) }}</span>
              </span>
            </div>

            <div class="ia-preview-row">
              <span class="ia-preview-label">Situação</span>
              <span class="ia-preview-change">
                <UiStatusBadge
                  :status="currentStatus"
                  :tone="toneFor(currentStatus)"
                  :label="statusText(currentStatus)"
                  size="sm"
                />
                <span class="ia-arrow" aria-hidden="true">→</span>
                <UiStatusBadge
                  :status="previewStatus"
                  :tone="toneFor(previewStatus)"
                  :label="statusText(previewStatus)"
                  size="sm"
                />
              </span>
            </div>

            <!-- Avisos de situação: apenas visuais (sem role=status) — o anúncio ao leitor de tela
                 já é coberto pela região viva única acima (ia-preview-delta). -->
            <p
              v-if="previewStatus === 'esgotado'"
              class="ia-preview-warn ia-preview-warn--danger"
            >
              Após o ajuste o item ficará <strong>esgotado</strong>.
            </p>
            <p
              v-else-if="previewStatus === 'baixo'"
              class="ia-preview-warn"
            >
              Após o ajuste o item ficará <strong>abaixo</strong> do ponto de reposição.
            </p>
          </div>
        </UiCard>
      </div>

      <!-- Coluna direita: formulário de ajuste -->
      <form class="ia-form" novalidate @submit.prevent="onSubmit">
        <UiCard>
          <template #header>
            <div class="ia-head">
              <div class="ia-head-id">
                <h2 class="ia-head-title">{{ item.productName || 'Item de estoque' }}</h2>
                <p class="ia-head-meta">
                  <span class="ui-mono">{{ item.sku || '—' }}</span>
                  <span v-if="item.location" class="ia-dot" aria-hidden="true">·</span>
                  <span v-if="item.location">{{ item.location }}</span>
                </p>
              </div>
              <UiStatusBadge
                :status="currentStatus"
                :tone="toneFor(currentStatus)"
                :label="statusText(currentStatus)"
                size="lg"
              />
            </div>
          </template>

          <!-- Modo de ajuste de quantidade -->
          <UiFormSection
            title="Quantidade"
            description="Defina o novo total ou some/subtraia da quantidade atual (ex.: entrada de mercadoria, perda, recontagem)."
            :columns="1"
          >
            <div
              class="ia-mode"
              role="radiogroup"
              aria-label="Como ajustar a quantidade"
              @keydown="onModeKeydown"
            >
              <button
                ref="modeSetBtn"
                type="button"
                class="ia-mode-opt"
                :data-active="form.values.mode === 'set' ? 'true' : null"
                role="radio"
                :aria-checked="form.values.mode === 'set'"
                :tabindex="form.values.mode === 'set' ? 0 : -1"
                @click="setMode('set')"
              >
                <span class="ia-mode-title">Definir valor</span>
                <span class="ia-mode-desc">Substitui o total (recontagem).</span>
              </button>
              <button
                ref="modeDeltaBtn"
                type="button"
                class="ia-mode-opt"
                :data-active="form.values.mode === 'delta' ? 'true' : null"
                role="radio"
                :aria-checked="form.values.mode === 'delta'"
                :tabindex="form.values.mode === 'delta' ? 0 : -1"
                @click="setMode('delta')"
              >
                <span class="ia-mode-title">Somar / subtrair</span>
                <span class="ia-mode-desc">Entrada (+) ou saída (−).</span>
              </button>
            </div>

            <!-- MODO: definir valor absoluto -->
            <UiFormField
              v-if="form.values.mode === 'set'"
              label="Nova quantidade"
              required
              :error="form.errors.setValue"
              hint="Quantidade física contada agora."
            >
              <template #default="{ id, describedBy }">
                <input
                  :id="id"
                  :value="form.values.setValue"
                  :aria-describedby="describedBy"
                  type="number"
                  min="0"
                  step="1"
                  inputmode="numeric"
                  placeholder="Ex.: 120"
                  @input="onField('setValue', $event.target.value)"
                />
              </template>
            </UiFormField>

            <!-- MODO: delta com botões rápidos -->
            <div v-else class="ia-delta">
              <UiFormField
                label="Ajuste (+/−)"
                required
                :error="form.errors.delta"
                :hint="deltaFieldHint"
              >
                <template #default="{ id, describedBy }">
                  <div class="ia-stepper">
                    <button
                      type="button"
                      class="ia-step-btn"
                      aria-label="Diminuir em 1"
                      @click="bumpDelta(-1)"
                    >−</button>
                    <input
                      :id="id"
                      :value="form.values.delta"
                      :aria-describedby="describedBy"
                      class="ia-step-input"
                      type="number"
                      step="1"
                      inputmode="numeric"
                      placeholder="0"
                      @input="onField('delta', $event.target.value)"
                    />
                    <button
                      type="button"
                      class="ia-step-btn"
                      aria-label="Aumentar em 1"
                      @click="bumpDelta(1)"
                    >+</button>
                  </div>
                </template>
              </UiFormField>
              <div class="ia-quick" aria-label="Ajustes rápidos">
                <button v-for="q in quickAdjusts" :key="q" type="button" class="ia-quick-btn" @click="bumpDelta(q)">
                  {{ q > 0 ? '+' + q : q }}
                </button>
              </div>
            </div>
          </UiFormSection>

          <!-- Ponto de reposição -->
          <UiFormSection
            title="Ponto de reposição"
            description="Quando o estoque cai até este valor, o item entra em alerta de reposição."
            :columns="1"
          >
            <UiFormField
              label="Ponto de reposição"
              :error="form.errors.reorderPoint"
              hint="Deixe em branco para não definir um alerta."
            >
              <template #default="{ id, describedBy }">
                <input
                  :id="id"
                  :value="form.values.reorderPoint"
                  :aria-describedby="describedBy"
                  type="number"
                  min="0"
                  step="1"
                  inputmode="numeric"
                  placeholder="Ex.: 20"
                  @input="onField('reorderPoint', $event.target.value)"
                />
              </template>
            </UiFormField>
          </UiFormSection>

          <!-- Motivo (ReasonField) — obrigatório, vai para a auditoria -->
          <UiFormSection
            title="Motivo do ajuste"
            description="Registrado na auditoria. Seja específico: ajuda a entender divergências depois."
            :columns="1"
          >
            <UiFormField
              label="Motivo"
              required
              :error="form.errors.reason"
              hint="Mínimo de 5 caracteres."
            >
              <template #default="{ id, describedBy }">
                <div class="ia-reason">
                  <div class="ia-reason-chips" aria-label="Motivos comuns">
                    <button
                      v-for="preset in reasonPresets"
                      :key="preset"
                      type="button"
                      class="ia-chip"
                      :data-active="form.values.reason === preset ? 'true' : null"
                      @click="pickReason(preset)"
                    >
                      {{ preset }}
                    </button>
                  </div>
                  <textarea
                    :id="id"
                    :value="form.values.reason"
                    :aria-describedby="describedBy"
                    rows="3"
                    maxlength="280"
                    placeholder="Ex.: Recontagem física do dia 22/06; encontrada divergência de 4 unidades."
                    @input="onField('reason', $event.target.value)"
                  />
                  <p class="ia-counter" :data-warn="reasonRemaining <= 20 ? 'true' : null">
                    {{ reasonRemaining }} caracteres restantes
                  </p>
                </div>
              </template>
            </UiFormField>
          </UiFormSection>

          <template #footer>
            <div class="ia-actions">
              <p v-if="hasChange" class="ia-note">
                Será registrado um ajuste e o motivo ficará na auditoria.
              </p>
              <p v-else class="ia-note ia-note--muted">
                Nenhuma alteração até agora.
              </p>
              <div class="ia-actions-btns">
                <UiButton variant="ghost" type="button" :to="cancelTo">
                  Cancelar
                </UiButton>
                <UiButton variant="subtle" type="button" :disabled="saving || !dirty" @click="discard">
                  Limpar
                </UiButton>
                <UiButton variant="primary" type="submit" :loading="saving" :disabled="!hasChange">
                  Registrar ajuste
                </UiButton>
              </div>
            </div>
          </template>
        </UiCard>
      </form>
    </div>
  </UiPageLayout>
</template>

<script setup>
import { ref, computed, onMounted, nextTick } from 'vue';
import { useRoute } from 'vue-router';
import {
  UiPageLayout, UiCard, UiButton, UiFormField, UiFormSection, UiStatusBadge,
  UiEmptyState,
  useForm, useToast, useConfirm, validators, format,
} from '../ui/index.js';
import { inventory, auditLogs } from '../api.js';

// Recursos REAIS:
//  - GET/PUT /v1/inventory (export `inventory` = resource("inventory") em api.js → /v1/inventory).
//  - POST /v1/audit-logs (export `auditLogs` = resource("audit-logs")). A trilha é a razão de ser
//    desta tela: o MOTIVO precisa ficar gravado. A entidade audit_logs persiste apenas as colunas
//    declaradas (actor/action/resource/tenant/at — ver api/src/repositories/entities.js); o CRUD
//    genérico DESCARTA chaves fora dessas colunas. Por isso o motivo + o resumo do ajuste são
//    codificados em `resource` (única coluna de texto livre que persiste E aparece na Auditoria).

const route = useRoute();
const toast = useToast();
const confirm = useConfirm();

const itemId = computed(() => route.params.id);
// Cancelar volta para o DETALHE do item (rota de domínio do inventário) quando houver id;
// se não houver, cai para a lista de estoque. Sempre rotas de domínio.
const cancelTo = computed(() => (itemId.value ? '/inventory/' + itemId.value : '/inventory'));

const reasonPresets = ['Recontagem física', 'Entrada de mercadoria', 'Perda / avaria', 'Devolução', 'Correção de erro'];
const quickAdjusts = [-10, -5, -1, 1, 5, 10];

/* ---- estados de carga ------------------------------------------------------ */
const loading = ref(true);
const loadError = ref(null);
const notFound = ref(false);
const item = ref({});
const saving = ref(false);

/* ---- formulário ------------------------------------------------------------ */
const { required, numeric, min, minLen } = validators;
const form = useForm({
  initial: { mode: 'set', setValue: '', delta: '', reorderPoint: '', reason: '' },
  rules: {
    setValue: [
      (v, all) => (all.mode === 'set' ? required('Informe a nova quantidade.')(v) : ''),
      (v, all) => (all.mode === 'set' ? numeric('Quantidade inválida.')(v) : ''),
      (v, all) => (all.mode === 'set' ? min(0, 'A quantidade não pode ser negativa.')(v) : ''),
    ],
    delta: [
      (v, all) => (all.mode === 'delta' ? required('Informe quanto somar ou subtrair.')(v) : ''),
      (v, all) => (all.mode === 'delta' ? numeric('Valor inválido.')(v) : ''),
      (v, all) => {
        if (all.mode !== 'delta') return '';
        const n = Number(v);
        if (!isFinite(n) || n === 0) return 'O ajuste deve ser diferente de zero.';
        if (Number(item.value.quantity || 0) + n < 0) return 'O resultado não pode ficar negativo.';
        return '';
      },
    ],
    reorderPoint: [numeric('Ponto de reposição inválido.'), min(0, 'Não pode ser negativo.')],
    reason: [required('Descreva o motivo do ajuste.'), minLen(5, 'Detalhe um pouco mais (mín. 5 caracteres).')],
  },
});

function onField(key, value) { form.setField(key, value); }

// radiogroup de modo: roving tabindex + navegação por setas (a11y).
const modeSetBtn = ref(null);
const modeDeltaBtn = ref(null);
function focusMode(mode) {
  nextTick(() => {
    const el = mode === 'set' ? modeSetBtn.value : modeDeltaBtn.value;
    if (el && typeof el.focus === 'function') el.focus();
  });
}
function setMode(mode) {
  if (form.values.mode === mode) return;
  form.setField('mode', mode);
  // limpa erros do modo abandonado para não poluir a tela
  delete form.errors.setValue;
  delete form.errors.delta;
}
function onModeKeydown(ev) {
  const key = ev.key;
  if (key === 'ArrowRight' || key === 'ArrowDown') {
    ev.preventDefault();
    setMode('delta'); focusMode('delta');
  } else if (key === 'ArrowLeft' || key === 'ArrowUp') {
    ev.preventDefault();
    setMode('set'); focusMode('set');
  }
}
function bumpDelta(by) {
  const current = Number(form.values.delta);
  const base = isFinite(current) ? current : 0;
  form.setField('delta', String(base + by));
}
function pickReason(preset) { form.setField('reason', preset); }

/* ---- formatação / derivação ------------------------------------------------ */
const formatQty = (v) => (v == null || v === '' || !isFinite(Number(v)) ? '—' : format.formatNumber(Number(v)));
// Rótulos de NEGÓCIO da situação de estoque (mais ricos que o humanize cru de 'ok'/'baixo'/'esgotado').
const STATUS_LABELS = { ok: 'Em estoque', baixo: 'Abaixo do mínimo', esgotado: 'Esgotado' };
const statusText = (s) => STATUS_LABELS[s] || format.humanize(s);
const updatedAtLabel = computed(() => {
  const v = item.value.updatedAt || item.value.updated_at;
  return v ? format.formatDateTime(v) : '—';
});

// resolve um tom canônico do kit a partir dos estados do domínio (ok/baixo/esgotado)
function toneFor(status) {
  if (status === 'esgotado') return 'error';
  if (status === 'baixo') return 'warning';
  if (status === 'ok') return 'success';
  return 'neutral';
}

// status atual: usa o do registro, ou deriva da quantidade/ponto de reposição
function deriveStatus(qty, reorder) {
  const q = Number(qty);
  if (!isFinite(q) || q <= 0) return 'esgotado';
  const r = reorder == null || reorder === '' ? null : Number(reorder);
  if (r != null && isFinite(r) && q <= r) return 'baixo';
  return 'ok';
}
const currentStatus = computed(() => item.value.status || deriveStatus(item.value.quantity, item.value.reorderPoint));

// quantidade resultante BRUTA segundo o modo (pode ser negativa no modo delta — usada para detectar
// o estado inválido na prévia em vez de mascarar com Math.max(0,...)).
const rawResult = computed(() => {
  const base = Number(item.value.quantity || 0);
  if (form.values.mode === 'set') {
    const v = Number(form.values.setValue);
    return form.values.setValue === '' || !isFinite(v) ? base : Math.round(v);
  }
  const d = Number(form.values.delta);
  return form.values.delta === '' || !isFinite(d) ? base : Math.round(base + d);
});
// prévia em estado inválido = o ajuste levaria a quantidade a um valor negativo (mesma regra que a
// validação do useForm cobre na l. do delta). A prévia REFLETE esse erro em vez de exibir 0 calado.
const previewInvalid = computed(() => rawResult.value < 0);
// quantidade resultante exibível (clampada apenas quando válida).
const previewQuantity = computed(() => Math.max(0, rawResult.value));
const previewReorder = computed(() => {
  if (form.values.reorderPoint === '' || form.values.reorderPoint == null) {
    return item.value.reorderPoint == null ? null : Number(item.value.reorderPoint);
  }
  const v = Number(form.values.reorderPoint);
  return isFinite(v) ? Math.max(0, Math.round(v)) : item.value.reorderPoint;
});
const previewStatus = computed(() => deriveStatus(previewQuantity.value, previewReorder.value));

const netDelta = computed(() => previewQuantity.value - Number(item.value.quantity || 0));
// direção visual: 'invalid' quando o resultado seria negativo (prévia e validação consistentes).
const qtyDirection = computed(() => {
  if (previewInvalid.value) return 'invalid';
  return netDelta.value > 0 ? 'up' : netDelta.value < 0 ? 'down' : 'flat';
});
const deltaGlyph = computed(() => {
  if (previewInvalid.value) return '⚠';
  return netDelta.value > 0 ? '▲' : netDelta.value < 0 ? '▼' : '＝';
});
const deltaLabel = computed(() => {
  if (previewInvalid.value) return 'Resultado inválido: a quantidade não pode ficar negativa.';
  const n = netDelta.value;
  if (n === 0) return 'Sem mudança na quantidade.';
  const abs = format.formatNumber(Math.abs(n));
  return (n > 0 ? 'Adiciona ' : 'Remove ') + abs + (Math.abs(n) === 1 ? ' unidade' : ' unidades');
});
const deltaFieldHint = computed(() => {
  const base = Number(item.value.quantity || 0);
  return 'Atual ' + format.formatNumber(base) + '. Use valores negativos para saída.';
});

const reasonRemaining = computed(() => 280 - String(form.values.reason || '').length);

// houve mudança de quantidade OU de ponto de reposição?
const reorderChanged = computed(() => {
  const before = item.value.reorderPoint == null ? null : Number(item.value.reorderPoint);
  return previewReorder.value !== before;
});
const hasChange = computed(() => netDelta.value !== 0 || reorderChanged.value);
// "sujo" = o usuário mexeu em algo vs. o estado recém-carregado (setValue/reorderPoint vêm pré-preenchidos).
const pristineSetValue = computed(() => String(item.value.quantity));
const pristineReorder = computed(() => (item.value.reorderPoint == null ? '' : String(item.value.reorderPoint)));
const dirty = computed(() =>
  form.values.setValue !== pristineSetValue.value ||
  form.values.delta !== '' ||
  form.values.reorderPoint !== pristineReorder.value ||
  form.values.reason !== '');

/* ---- carga do item --------------------------------------------------------- */
function hydrate(p) {
  item.value = {
    id: p.id,
    sku: p.sku || '',
    productName: p.productName || p.product_name || '',
    quantity: p.quantity == null ? 0 : Number(p.quantity),
    reorderPoint: p.reorderPoint == null && p.reorder_point == null ? null : Number(p.reorderPoint != null ? p.reorderPoint : p.reorder_point),
    location: p.location || '',
    status: p.status || '',
    updatedAt: p.updatedAt || p.updated_at || null,
  };
  // pré-preenche o "definir valor" com a quantidade atual (ponto de partida amigável numa recontagem)
  // e o ponto de reposição com o valor vigente.
  form.setField('setValue', String(item.value.quantity));
  form.setField('reorderPoint', item.value.reorderPoint == null ? '' : String(item.value.reorderPoint));
}

async function reload() {
  loading.value = true; loadError.value = null; notFound.value = false;
  try {
    if (!inventory || typeof inventory.get !== 'function') {
      throw new Error('Recurso de estoque indisponível.');
    }
    const data = await inventory.get(itemId.value);
    const p = data && data.data ? data.data : data;
    if (!p || (typeof p === 'object' && Object.keys(p).length === 0)) { notFound.value = true; return; }
    hydrate(p);
  } catch (e) {
    if (e && e.status === 404) notFound.value = true;
    else loadError.value = e && e.message ? e.message : 'Falha ao carregar o item de estoque.';
  } finally {
    loading.value = false;
  }
}

onMounted(reload);

/* ---- salvar ---------------------------------------------------------------- */
// Payload do INVENTÁRIO: só as colunas que a entidade `inventory` persiste de fato
// (quantity/reorderPoint — ver entities.js). NÃO enviamos `reason`/`adjustment` aqui: a entidade
// não tem essas colunas e o CRUD genérico as descartaria em silêncio. O motivo vai para a AUDITORIA.
function toInventoryPayload() {
  return {
    quantity: previewQuantity.value,
    reorderPoint: previewReorder.value,
  };
}

// `resource` da auditoria: única coluna de texto livre que persiste E aparece na trilha (Auditoria).
// Codifica o item + o efeito do ajuste + o motivo num resumo legível e auditável.
function buildAuditResource() {
  const sku = item.value.sku || ('#' + itemId.value);
  const from = Number(item.value.quantity || 0);
  const to = previewQuantity.value;
  const reason = String(form.values.reason || '').trim();
  const qtyPart = netDelta.value === 0
    ? 'qtd ' + format.formatNumber(to)
    : 'qtd ' + format.formatNumber(from) + '→' + format.formatNumber(to) +
      ' (' + (netDelta.value > 0 ? '+' : '') + format.formatNumber(netDelta.value) + ')';
  return sku + ' · ' + qtyPart + ' · motivo: ' + reason;
}

// Grava a auditoria do ajuste. Usa SÓ colunas reais de audit_logs (action/resource/tenant/at).
// `actor` é omitido de propósito: o front não tem fonte confiável do usuário atual (não há /v1/me
// nesta app) — a Auditoria já exibe "Sistema" quando o ator é vazio. Não fabricamos um ator.
async function writeAudit() {
  if (!auditLogs || typeof auditLogs.create !== 'function') return false;
  await auditLogs.create({
    action: 'inventory.adjust',
    resource: buildAuditResource(),
    tenant: 'default',
    at: new Date().toISOString(),
  });
  return true;
}

async function onSubmit() {
  if (!form.validate()) {
    toast.warning('Revise os campos destacados antes de salvar.');
    return;
  }
  if (!hasChange.value) {
    toast.info('Nada para ajustar — o resultado é igual ao valor atual.');
    return;
  }
  if (!inventory || typeof inventory.update !== 'function') {
    toast.error('Não é possível salvar: recurso de estoque indisponível.');
    return;
  }

  const summary = netDelta.value === 0
    ? 'Você vai atualizar o ponto de reposição deste item.'
    : 'A quantidade vai de ' + format.formatNumber(item.value.quantity) +
      ' para ' + format.formatNumber(previewQuantity.value) +
      ' (' + (netDelta.value > 0 ? '+' : '') + format.formatNumber(netDelta.value) + ').';

  // Copy do confirm é condicionada ao que de fato vai acontecer: só prometemos a auditoria quando o
  // recurso de auditoria está disponível (caso contrário não mentimos sobre o registro do motivo).
  const canAudit = !!(auditLogs && typeof auditLogs.create === 'function');
  const auditClause = canAudit
    ? ' O motivo informado ficará registrado na auditoria.'
    : ' Atenção: a trilha de auditoria está indisponível agora — o motivo NÃO será registrado.';

  const ok = await confirm({
    title: 'Registrar ajuste de estoque?',
    message: summary + auditClause,
    confirmLabel: 'Registrar ajuste',
    cancelLabel: 'Revisar',
    danger: previewStatus.value === 'esgotado' || !canAudit,
  });
  if (!ok) return;

  saving.value = true;
  try {
    const res = await inventory.update(itemId.value, toInventoryPayload());
    const saved = res && res.data ? res.data : res;

    // O PROPÓSITO da tela: gravar o motivo na auditoria. Encadeamos o POST /v1/audit-logs após o
    // PUT do inventário bem-sucedido. Como o api.js só expõe CRUD genérico (sem endpoint /adjust
    // transacional), este encadeamento é o mínimo viável. A falha da auditoria NÃO é mascarada:
    // o ajuste de quantidade já persistiu, mas avisamos honestamente que o motivo não foi registrado.
    let audited = false;
    let auditError = '';
    try {
      audited = await writeAudit();
    } catch (ae) {
      auditError = ae && ae.message ? ae.message : '';
    }

    // hydrate() já re-preenche setValue (= nova quantidade) e reorderPoint com o estado salvo;
    // aqui só zeramos os campos de ajuste pontual (delta/motivo) e voltamos ao modo "definir valor".
    hydrate({ ...item.value, ...(saved && typeof saved === 'object' ? saved : {}), id: itemId.value });
    form.setField('delta', '');
    form.setField('reason', '');
    form.setField('mode', 'set');
    delete form.errors.setValue; delete form.errors.delta; delete form.errors.reason;

    if (audited) {
      toast.success('Ajuste registrado e motivo gravado na auditoria.');
    } else {
      // Quantidade salva, auditoria não: mensagem honesta (sem afirmar que auditou).
      toast.warning('Ajuste de estoque salvo, mas o motivo NÃO foi registrado na auditoria.', {
        detail: auditError || 'A trilha de auditoria está indisponível.',
      });
    }
  } catch (e) {
    toast.error('Não foi possível registrar o ajuste.', {
      detail: e && e.message ? e.message : '',
      code: e && e.status ? 'HTTP ' + e.status : '',
    });
  } finally {
    saving.value = false;
  }
}

async function discard() {
  if (!dirty.value) return;
  const ok = await confirm({
    title: 'Limpar o ajuste?',
    message: 'Os campos de quantidade, ponto de reposição e motivo voltarão ao estado inicial.',
    confirmLabel: 'Limpar',
    cancelLabel: 'Continuar',
    danger: true,
  });
  if (!ok) return;
  // volta ao estado recém-carregado: setValue = quantidade atual, reorderPoint = valor vigente.
  form.setField('setValue', pristineSetValue.value);
  form.setField('delta', '');
  form.setField('mode', 'set');
  form.setField('reorderPoint', pristineReorder.value);
  form.setField('reason', '');
  delete form.errors.setValue; delete form.errors.delta;
  delete form.errors.reorderPoint; delete form.errors.reason;
  toast.info('Ajuste limpo.');
}
</script>

<style scoped>
/* layout em duas colunas: referência/prévia + formulário */
.ia-grid { display: grid; grid-template-columns: minmax(0, 320px) minmax(0, 1fr); gap: var(--ui-space-5); align-items: start; }
.ia-aside { display: flex; flex-direction: column; gap: var(--ui-space-4); position: sticky; top: var(--ui-space-5); }
.ia-form { display: block; min-width: 0; }

/* lista de fatos (situação atual) */
.ia-facts { display: grid; grid-template-columns: 1fr; gap: var(--ui-space-3); margin: 0; }
.ia-fact { display: flex; align-items: baseline; justify-content: space-between; gap: var(--ui-space-3); }
.ia-fact dt { margin: 0; color: rgb(var(--ui-muted)); font-size: var(--ui-text-sm); }
.ia-fact dd { margin: 0; text-align: right; color: rgb(var(--ui-fg)); }
.ia-fact-strong { font-weight: 600; }
.ia-fact-num { font-family: var(--ui-font-display); font-weight: 700; font-size: var(--ui-text-md); }

/* prévia do resultado */
.ia-preview { display: flex; flex-direction: column; gap: var(--ui-space-3); }
.ia-preview-row { display: flex; align-items: center; justify-content: space-between; gap: var(--ui-space-3); flex-wrap: wrap; }
.ia-preview-row--sep { padding-top: var(--ui-space-3); border-top: 1px solid rgb(var(--ui-border)); }
.ia-preview-label { color: rgb(var(--ui-muted)); font-size: var(--ui-text-sm); }
.ia-preview-change { display: inline-flex; align-items: center; gap: var(--ui-space-2); }
.ia-preview-from { color: rgb(var(--ui-muted)); }
.ia-arrow { color: rgb(var(--ui-muted)); }
.ia-preview-to { font-family: var(--ui-font-display); font-weight: 700; font-size: var(--ui-text-lg); color: rgb(var(--ui-fg)); }
.ia-preview-to[data-dir="up"] { color: rgb(var(--ui-ok)); }
.ia-preview-to[data-dir="down"] { color: rgb(var(--ui-danger)); }
.ia-preview-to[data-dir="invalid"] { color: rgb(var(--ui-danger)); font-style: italic; }
.ia-preview-delta { margin: 0; font-size: var(--ui-text-sm); font-weight: 600; display: flex; align-items: center; gap: var(--ui-space-2); }
.ia-preview-delta[data-dir="up"] { color: rgb(var(--ui-ok)); }
.ia-preview-delta[data-dir="down"] { color: rgb(var(--ui-danger)); }
.ia-preview-delta[data-dir="invalid"] { color: rgb(var(--ui-danger)); }
.ia-preview-delta[data-dir="flat"] { color: rgb(var(--ui-muted)); }
.ia-preview-warn { margin: var(--ui-space-1) 0 0; font-size: var(--ui-text-sm); padding: var(--ui-space-2) var(--ui-space-3); border-radius: var(--ui-radius-sm); background: rgb(var(--ui-warn) / 0.12); color: rgb(var(--ui-warn)); }
.ia-preview-warn--danger { background: rgb(var(--ui-danger) / 0.12); color: rgb(var(--ui-danger)); }

/* cabeçalho do card do formulário */
.ia-head { display: flex; align-items: flex-start; justify-content: space-between; gap: var(--ui-space-4); width: 100%; }
.ia-head-title { font-size: var(--ui-text-lg); }
.ia-head-meta { margin: var(--ui-space-1) 0 0; color: rgb(var(--ui-muted)); font-size: var(--ui-text-sm); display: flex; align-items: center; gap: var(--ui-space-2); flex-wrap: wrap; }
.ia-dot { opacity: .6; }

/* seletor de modo de ajuste */
.ia-mode { display: grid; grid-template-columns: 1fr 1fr; gap: var(--ui-space-3); margin-bottom: var(--ui-space-4); }
.ia-mode-opt { display: flex; flex-direction: column; gap: var(--ui-space-1); text-align: left; padding: var(--ui-space-3) var(--ui-space-4); border: 1px solid rgb(var(--ui-border-strong)); border-radius: var(--ui-radius-md); background: rgb(var(--ui-bg)); color: rgb(var(--ui-fg)); cursor: pointer; transition: border-color .12s ease, background .12s ease; }
.ia-mode-opt:hover { border-color: rgb(var(--ui-accent)); }
.ia-mode-opt[data-active="true"] { border-color: rgb(var(--ui-accent)); background: rgb(var(--ui-accent) / 0.08); }
.ia-mode-opt:focus-visible { outline: 2px solid rgb(var(--ui-accent)); outline-offset: 2px; }
.ia-mode-title { font-weight: 600; font-size: var(--ui-text-sm); }
.ia-mode-desc { font-size: var(--ui-text-xs); color: rgb(var(--ui-muted)); }

/* stepper de delta */
.ia-delta { display: flex; flex-direction: column; gap: var(--ui-space-3); }
.ia-stepper { display: flex; align-items: stretch; gap: var(--ui-space-2); }
.ia-step-btn { width: 40px; flex-shrink: 0; border: 1px solid rgb(var(--ui-border-strong)); border-radius: var(--ui-radius-sm); background: rgb(var(--ui-surface-2)); color: rgb(var(--ui-fg)); font-size: var(--ui-text-lg); font-weight: 700; cursor: pointer; line-height: 1; }
.ia-step-btn:hover { border-color: rgb(var(--ui-accent)); color: rgb(var(--ui-accent-strong)); }
.ia-step-btn:focus-visible { outline: 2px solid rgb(var(--ui-accent)); outline-offset: 2px; }
.ia-step-input { text-align: center; font-family: var(--ui-font-display); font-weight: 700; }
.ia-quick { display: flex; flex-wrap: wrap; gap: var(--ui-space-2); }
.ia-quick-btn { padding: var(--ui-space-1) var(--ui-space-3); border: 1px solid rgb(var(--ui-border-strong)); border-radius: var(--ui-radius-pill); background: rgb(var(--ui-bg)); color: rgb(var(--ui-fg)); font-size: var(--ui-text-sm); font-weight: 600; cursor: pointer; }
.ia-quick-btn:hover { border-color: rgb(var(--ui-accent)); color: rgb(var(--ui-accent-strong)); }
.ia-quick-btn:focus-visible { outline: 2px solid rgb(var(--ui-accent)); outline-offset: 2px; }

/* motivo (ReasonField) */
.ia-reason { display: flex; flex-direction: column; gap: var(--ui-space-2); }
.ia-reason-chips { display: flex; flex-wrap: wrap; gap: var(--ui-space-2); }
.ia-chip { padding: var(--ui-space-1) var(--ui-space-3); border: 1px solid rgb(var(--ui-border-strong)); border-radius: var(--ui-radius-pill); background: rgb(var(--ui-bg)); color: rgb(var(--ui-fg)); font-size: var(--ui-text-xs); font-weight: 600; cursor: pointer; }
.ia-chip:hover { border-color: rgb(var(--ui-accent)); color: rgb(var(--ui-accent-strong)); }
.ia-chip[data-active="true"] { border-color: rgb(var(--ui-accent)); background: rgb(var(--ui-accent) / 0.12); color: rgb(var(--ui-accent-strong)); }
.ia-chip:focus-visible { outline: 2px solid rgb(var(--ui-accent)); outline-offset: 2px; }
.ia-counter { margin: 0; font-size: var(--ui-text-xs); color: rgb(var(--ui-muted)); text-align: right; }
.ia-counter[data-warn="true"] { color: rgb(var(--ui-warn)); font-weight: 600; }

/* rodapé de ações */
.ia-actions { display: flex; align-items: center; justify-content: space-between; gap: var(--ui-space-4); flex-wrap: wrap; width: 100%; }
.ia-actions-btns { display: flex; gap: var(--ui-space-2); margin-left: auto; }
.ia-note { margin: 0; font-size: var(--ui-text-sm); color: rgb(var(--ui-accent-strong)); font-weight: 600; }
.ia-note--muted { color: rgb(var(--ui-muted)); font-weight: 500; }

@media (max-width: 860px) {
  .ia-grid { grid-template-columns: 1fr; }
  .ia-aside { position: static; }
}
@media (max-width: 640px) {
  .ia-head { flex-direction: column; }
  .ia-mode { grid-template-columns: 1fr; }
  .ia-actions { flex-direction: column; align-items: stretch; }
  .ia-actions-btns { margin-left: 0; }
}
</style>
