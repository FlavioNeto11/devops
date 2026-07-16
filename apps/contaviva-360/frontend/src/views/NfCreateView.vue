<template>
  <UiPageLayout
    title="Emitir Nota Fiscal"
    eyebrow="Notas Fiscais"
    subtitle="Preencha os dados do destinatário, itens e impostos. A NF-e será submetida à SEFAZ de forma assíncrona após a emissão."
    width="default"
    :error="pageError"
    @retry="loadClients"
  >
    <template #actions>
      <UiButton variant="ghost" to="/nf">Voltar à lista</UiButton>
    </template>

    <!-- Banner: NF em processamento após submit bem-sucedido -->
    <template v-if="submitted" #banner>
      <div class="nf-banner" data-tone="info" role="status" aria-live="polite">
        <span class="nf-banner-icon" aria-hidden="true">i</span>
        <div class="nf-banner-body">
          <strong>Nota Fiscal em processamento.</strong>
          A NF-e foi recebida e está sendo submetida à SEFAZ de forma assíncrona. Acompanhe o status
          na lista de notas fiscais.
        </div>
      </div>
    </template>

    <!-- Estado de carregamento inicial -->
    <UiLoadingState v-if="clientsLoading" title="Carregando dados…" />

    <form v-if="!clientsLoading && !pageError" novalidate @submit.prevent="submit">

      <!-- ═══════════════════════════════════════════════════
           SEÇÃO 1 — Dados da Nota
           ═══════════════════════════════════════════════════ -->
      <UiCard title="Dados da Nota" subtitle="Identifique o destinatário e preencha os dados básicos da NF-e.">
        <UiFormSection :columns="2">

          <!-- Cliente NF — select com busca -->
          <UiFormField
            label="Cliente NF"
            :required="true"
            :error="f.errors.nf_client_id"
            hint="Pesquise pelo nome ou CNPJ do destinatário."
            :full-width="true"
          >
            <template #default="{ id, describedBy, hasError }">
              <div class="client-search-wrap">
                <input
                  :id="id"
                  role="combobox"
                  :aria-expanded="String(clientDropdownOpen)"
                  aria-autocomplete="list"
                  aria-controls="client-listbox"
                  :aria-activedescendant="focusedIdx >= 0 ? ('client-option-' + focusedIdx) : undefined"
                  :aria-describedby="describedBy"
                  :aria-invalid="hasError ? 'true' : undefined"
                  :aria-required="'true'"
                  :value="clientSearchQuery"
                  type="search"
                  autocomplete="off"
                  placeholder="Digite nome ou CNPJ do cliente NF…"
                  :data-error="hasError ? 'true' : null"
                  @input="onClientSearch"
                  @focus="clientDropdownOpen = clientSearchResults.length > 0"
                  @keydown.escape="clientDropdownOpen = false"
                  @keydown.down.prevent="moveFocus(1)"
                  @keydown.up.prevent="moveFocus(-1)"
                  @keydown.enter.prevent="selectFocused"
                />
                <span v-if="clientsLoading" class="client-spinner" aria-label="Carregando clientes…" role="status" />
                <span v-else-if="selectedClient" class="client-ok" aria-label="Cliente selecionado">&#10003;</span>
                <ul
                  v-if="clientDropdownOpen && clientSearchResults.length > 0"
                  id="client-listbox"
                  class="client-dropdown"
                  role="listbox"
                  :aria-label="'Clientes encontrados'"
                >
                  <li
                    v-for="(c, idx) in clientSearchResults"
                    :id="'client-option-' + idx"
                    :key="c.id"
                    class="client-dropdown-item"
                    :data-focused="focusedIdx === idx"
                    role="option"
                    :aria-selected="f.values.nf_client_id === c.id"
                    @mousedown.prevent="selectClient(c)"
                  >
                    <span class="cdi-name">{{ c.razao_social || c.nome || c.name }}</span>
                    <span v-if="c.cnpj" class="cdi-cnpj">{{ c.cnpj }}</span>
                  </li>
                </ul>
                <div v-else-if="clientDropdownOpen && clientSearchQuery.length >= 2 && !clientsLoading" class="client-no-results" role="status">
                  Nenhum cliente encontrado para "{{ clientSearchQuery }}"
                </div>
              </div>
              <div v-if="selectedClient" class="client-selected-badge" role="status" aria-live="polite">
                <span class="csb-icon" aria-hidden="true">&#9654;</span>
                <span class="csb-text">
                  <strong>{{ selectedClient.razao_social || selectedClient.nome || selectedClient.name }}</strong>
                  <span v-if="selectedClient.cnpj" class="csb-cnpj">{{ selectedClient.cnpj }}</span>
                </span>
                <button
                  type="button"
                  class="csb-clear"
                  aria-label="Remover cliente selecionado"
                  @click="clearClient"
                >&#x2715;</button>
              </div>
            </template>
          </UiFormField>

          <!-- Série -->
          <UiFormField
            label="Série"
            :error="f.errors.serie"
            hint="Série da NF-e (ex.: 1). Deixe em branco para a série padrão."
          >
            <template #default="{ id, describedBy }">
              <UiInput
                :id="id"
                :described-by="describedBy"
                :model-value="f.values.serie"
                placeholder="Ex.: 1"
                autocomplete="off"
                inputmode="numeric"
                :error="!!f.errors.serie"
                @update:model-value="f.setField('serie', $event)"
              />
            </template>
          </UiFormField>

          <!-- Data de Emissão -->
          <UiFormField
            label="Data de Emissão"
            :error="f.errors.data_emissao"
            hint="Data de emissão da nota fiscal (padrão: hoje)."
          >
            <template #default="{ id, describedBy }">
              <UiInput
                :id="id"
                :described-by="describedBy"
                type="date"
                :model-value="f.values.data_emissao"
                :error="!!f.errors.data_emissao"
                @update:model-value="f.setField('data_emissao', $event)"
              />
            </template>
          </UiFormField>

          <!-- Observações -->
          <UiFormField
            label="Observações"
            :error="f.errors.observacoes"
            hint="Informações adicionais que aparecerão no corpo da nota fiscal."
            :full-width="true"
          >
            <template #default="{ id, describedBy, hasError }">
              <textarea
                :id="id"
                :aria-describedby="describedBy"
                :aria-invalid="hasError ? 'true' : undefined"
                :value="f.values.observacoes"
                class="obs-textarea"
                rows="3"
                maxlength="2000"
                placeholder="Ex.: Referente ao contrato nº 123 — Prestação de serviços de TI — período 01/06 a 30/06/2026."
                @input="f.setField('observacoes', $event.target.value)"
              />
              <span class="char-count" aria-live="polite">{{ (f.values.observacoes || '').length }}/2000</span>
            </template>
          </UiFormField>

        </UiFormSection>
      </UiCard>

      <!-- ═══════════════════════════════════════════════════
           SEÇÃO 2 — Itens da Nota
           ═══════════════════════════════════════════════════ -->
      <UiCard
        title="Itens da Nota"
        subtitle="Adicione os produtos ou serviços que compõem esta nota fiscal. Você pode buscar do catálogo ou preencher manualmente."
      >
        <template #actions>
          <UiButton variant="ghost" size="sm" type="button" @click="addItem">
            + Adicionar Item
          </UiButton>
        </template>

        <!-- Erro de validação dos itens — banner de resumo -->
        <div v-if="itensError" class="itens-error" role="alert">
          <span class="itens-error-icon" aria-hidden="true">!</span>
          {{ itensError }}
        </div>

        <!-- Tabela de itens -->
        <div v-if="items.length > 0" class="itens-table-wrap" role="region" aria-label="Itens da nota fiscal">
          <table class="itens-table" aria-label="Itens da NF-e">
            <thead>
              <tr>
                <th scope="col" class="col-desc">Descrição / Produto</th>
                <th scope="col" class="col-qty">Qtd.</th>
                <th scope="col" class="col-unit">Vlr. Unit. (R$)</th>
                <th scope="col" class="col-aliq">ICMS %</th>
                <th scope="col" class="col-aliq">ISS %</th>
                <th scope="col" class="col-aliq">PIS %</th>
                <th scope="col" class="col-aliq">COFINS %</th>
                <th scope="col" class="col-total">Total</th>
                <th scope="col" class="col-action">
                  <span class="visually-hidden">Ações</span>
                </th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="(item, idx) in items"
                :key="item._key"
                class="item-row"
                :data-product-loaded="item._productLoaded"
              >
                <!-- Descrição / busca de produto -->
                <td class="col-desc">
                  <div class="item-desc-wrap">
                    <input
                      :id="'item-desc-' + idx"
                      role="combobox"
                      :aria-expanded="String(!!item._searchOpen && item._searchResults && item._searchResults.length > 0)"
                      aria-autocomplete="list"
                      :aria-controls="'prod-listbox-' + idx"
                      :aria-activedescendant="item._searchFocusIdx >= 0 ? ('prod-option-' + idx + '-' + item._searchFocusIdx) : undefined"
                      :aria-label="'Descrição do item ' + (idx + 1)"
                      :aria-invalid="item._errors && item._errors.descricao ? 'true' : undefined"
                      :value="item.descricao"
                      type="text"
                      class="item-input item-input--desc"
                      :class="{ 'item-input--error': item._errors && item._errors.descricao }"
                      placeholder="Buscar produto ou descrever…"
                      autocomplete="off"
                      @input="onItemDescInput(idx, $event.target.value)"
                      @focus="openProductSearch(idx)"
                      @keydown.escape="closeProductSearch(idx)"
                      @keydown.down.prevent="moveProdFocus(idx, 1)"
                      @keydown.up.prevent="moveProdFocus(idx, -1)"
                      @keydown.enter.prevent="selectFocusedProduct(idx)"
                    />
                    <span v-if="item._errors && item._errors.descricao" class="item-field-error" role="alert">
                      {{ item._errors.descricao }}
                    </span>
                    <!-- Dropdown de busca de produto -->
                    <ul
                      v-if="item._searchOpen && item._searchResults && item._searchResults.length > 0"
                      :id="'prod-listbox-' + idx"
                      class="prod-dropdown"
                      role="listbox"
                      :aria-label="'Produtos encontrados'"
                    >
                      <li
                        v-for="(p, pidx) in item._searchResults"
                        :id="'prod-option-' + idx + '-' + pidx"
                        :key="p.id"
                        class="prod-dropdown-item"
                        :data-focused="item._searchFocusIdx === pidx"
                        role="option"
                        :aria-selected="false"
                        @mousedown.prevent="selectProduct(idx, p)"
                      >
                        <span class="pdi-name">{{ p.nome || p.name || p.descricao }}</span>
                        <span v-if="p.codigo" class="pdi-code">{{ p.codigo }}</span>
                        <span v-if="p.preco_unitario != null" class="pdi-price">{{ format.formatCurrency(p.preco_unitario) }}</span>
                      </li>
                    </ul>
                    <span
                      v-if="item._searching"
                      class="item-spinner"
                      aria-label="Buscando produto…"
                      role="status"
                    />
                  </div>
                </td>

                <!-- Quantidade -->
                <td class="col-qty">
                  <input
                    :id="'item-qty-' + idx"
                    :aria-label="'Quantidade do item ' + (idx + 1)"
                    :aria-invalid="item._errors && item._errors.quantidade ? 'true' : undefined"
                    :value="item.quantidade"
                    type="number"
                    class="item-input item-input--num"
                    :class="{ 'item-input--error': item._errors && item._errors.quantidade }"
                    min="0.001"
                    step="1"
                    inputmode="decimal"
                    placeholder="1"
                    @change="onItemField(idx, 'quantidade', $event.target.value)"
                    @input="onItemField(idx, 'quantidade', $event.target.value)"
                  />
                  <span v-if="item._errors && item._errors.quantidade" class="item-field-error" role="alert">
                    {{ item._errors.quantidade }}
                  </span>
                </td>

                <!-- Valor unitário -->
                <td class="col-unit">
                  <input
                    :id="'item-unit-' + idx"
                    :aria-label="'Valor unitário do item ' + (idx + 1)"
                    :aria-invalid="item._errors && item._errors.valor_unitario ? 'true' : undefined"
                    :value="item.valor_unitario"
                    type="number"
                    class="item-input item-input--num"
                    :class="{ 'item-input--error': item._errors && item._errors.valor_unitario }"
                    min="0"
                    step="0.01"
                    inputmode="decimal"
                    placeholder="0,00"
                    @change="onItemField(idx, 'valor_unitario', $event.target.value)"
                    @input="onItemField(idx, 'valor_unitario', $event.target.value)"
                  />
                  <span v-if="item._errors && item._errors.valor_unitario" class="item-field-error" role="alert">
                    {{ item._errors.valor_unitario }}
                  </span>
                </td>

                <!-- ICMS % -->
                <td class="col-aliq">
                  <input
                    :id="'item-icms-' + idx"
                    :aria-label="'Alíquota ICMS do item ' + (idx + 1)"
                    :value="item.aliquota_icms"
                    type="number"
                    class="item-input item-input--aliq"
                    min="0"
                    max="100"
                    step="0.01"
                    inputmode="decimal"
                    placeholder="12"
                    @change="onItemField(idx, 'aliquota_icms', $event.target.value)"
                    @input="onItemField(idx, 'aliquota_icms', $event.target.value)"
                  />
                </td>

                <!-- ISS % -->
                <td class="col-aliq">
                  <input
                    :id="'item-iss-' + idx"
                    :aria-label="'Alíquota ISS do item ' + (idx + 1)"
                    :value="item.aliquota_iss"
                    type="number"
                    class="item-input item-input--aliq"
                    min="0"
                    max="100"
                    step="0.01"
                    inputmode="decimal"
                    placeholder="2"
                    @change="onItemField(idx, 'aliquota_iss', $event.target.value)"
                    @input="onItemField(idx, 'aliquota_iss', $event.target.value)"
                  />
                </td>

                <!-- PIS % -->
                <td class="col-aliq">
                  <input
                    :id="'item-pis-' + idx"
                    :aria-label="'Alíquota PIS do item ' + (idx + 1)"
                    :value="item.aliquota_pis"
                    type="number"
                    class="item-input item-input--aliq"
                    min="0"
                    max="100"
                    step="0.01"
                    inputmode="decimal"
                    placeholder="0.65"
                    @change="onItemField(idx, 'aliquota_pis', $event.target.value)"
                    @input="onItemField(idx, 'aliquota_pis', $event.target.value)"
                  />
                </td>

                <!-- COFINS % -->
                <td class="col-aliq">
                  <input
                    :id="'item-cofins-' + idx"
                    :aria-label="'Alíquota COFINS do item ' + (idx + 1)"
                    :value="item.aliquota_cofins"
                    type="number"
                    class="item-input item-input--aliq"
                    min="0"
                    max="100"
                    step="0.01"
                    inputmode="decimal"
                    placeholder="3"
                    @change="onItemField(idx, 'aliquota_cofins', $event.target.value)"
                    @input="onItemField(idx, 'aliquota_cofins', $event.target.value)"
                  />
                </td>

                <!-- Total do item -->
                <td class="col-total" aria-live="polite">
                  <span class="item-total">{{ format.formatCurrency(calcItemTotal(item)) }}</span>
                </td>

                <!-- Remover -->
                <td class="col-action">
                  <button
                    type="button"
                    class="item-remove-btn"
                    :aria-label="'Remover item ' + (idx + 1) + ': ' + (item.descricao || 'sem descrição')"
                    @click="removeItem(idx)"
                  >
                    &#x2715;
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- Estado vazio: nenhum item adicionado -->
        <div v-else class="itens-empty" role="status">
          <span class="itens-empty-icon" aria-hidden="true">&#x1F4CB;</span>
          <p class="itens-empty-title">Nenhum item adicionado</p>
          <p class="itens-empty-desc">Clique em "Adicionar Item" para incluir produtos ou serviços à nota fiscal.</p>
          <UiButton variant="ghost" type="button" @click="addItem">+ Adicionar Primeiro Item</UiButton>
        </div>
      </UiCard>

      <!-- ═══════════════════════════════════════════════════
           SEÇÃO 3 — Cálculo de Impostos e Total
           ═══════════════════════════════════════════════════ -->
      <UiCard
        v-if="items.length > 0"
        title="Resumo de Impostos e Total"
        subtitle="Cálculo automático com base nos itens e alíquotas informados."
      >
        <div class="impostos-grid" aria-live="polite" aria-label="Resumo de impostos">

          <!-- Subtotal -->
          <div class="imposto-row imposto-row--sub">
            <span class="imposto-label">Subtotal (produtos/serviços)</span>
            <span class="imposto-value">{{ format.formatCurrency(totals.subtotal) }}</span>
          </div>

          <!-- ICMS -->
          <div class="imposto-row">
            <span class="imposto-label">
              ICMS
              <span class="imposto-hint">Imposto sobre Circulação de Mercadorias e Serviços</span>
            </span>
            <span class="imposto-value">{{ format.formatCurrency(totals.icms) }}</span>
          </div>

          <!-- ISS -->
          <div class="imposto-row">
            <span class="imposto-label">
              ISS
              <span class="imposto-hint">Imposto Sobre Serviços</span>
            </span>
            <span class="imposto-value">{{ format.formatCurrency(totals.iss) }}</span>
          </div>

          <!-- PIS -->
          <div class="imposto-row">
            <span class="imposto-label">
              PIS
              <span class="imposto-hint">Programa de Integração Social</span>
            </span>
            <span class="imposto-value">{{ format.formatCurrency(totals.pis) }}</span>
          </div>

          <!-- COFINS -->
          <div class="imposto-row">
            <span class="imposto-label">
              COFINS
              <span class="imposto-hint">Contribuição para o Financiamento da Seguridade Social</span>
            </span>
            <span class="imposto-value">{{ format.formatCurrency(totals.cofins) }}</span>
          </div>

          <!-- Separador -->
          <div class="imposto-divider" role="separator" aria-hidden="true" />

          <!-- Total Impostos -->
          <div class="imposto-row imposto-row--impostos">
            <span class="imposto-label">Total de Impostos</span>
            <span class="imposto-value">{{ format.formatCurrency(totals.totalImpostos) }}</span>
          </div>

          <!-- Total NF -->
          <div class="imposto-row imposto-row--total">
            <span class="imposto-label">Total da Nota Fiscal</span>
            <span class="imposto-value imposto-value--total">{{ format.formatCurrency(totals.totalNf) }}</span>
          </div>

        </div>
      </UiCard>

      <!-- ═══════════════════════════════════════════════════
           AÇÕES
           ═══════════════════════════════════════════════════ -->
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
          :disabled="submitted"
        >
          {{ submitted ? 'Emitida — aguardando SEFAZ' : 'Emitir Nota Fiscal' }}
        </UiButton>
      </div>

    </form>
  </UiPageLayout>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import {
  UiPageLayout,
  UiCard,
  UiFormSection,
  UiFormField,
  UiInput,
  UiButton,
  UiLoadingState,
  useForm,
  useToast,
  validators,
  format,
} from '../ui/index.js';
import { resourceFactory, request } from '../api.js';

// ── API resources ─────────────────────────────────────────────────────────────
const nfClientsApi = resourceFactory('nf-clients');
const nfProductsApi = resourceFactory('nf-products');

// ── Router & Toast ────────────────────────────────────────────────────────────
const router = useRouter();
const toast = useToast();

// ── Estado global da tela ─────────────────────────────────────────────────────
const pageError = ref(null);
const submitted = ref(false);

// ── Estado do cliente ─────────────────────────────────────────────────────────
const allClients = ref([]);
const clientsLoading = ref(false);
const clientSearchQuery = ref('');
const clientSearchResults = ref([]);
const clientDropdownOpen = ref(false);
const selectedClient = ref(null);
const focusedIdx = ref(-1);

async function loadClients() {
  clientsLoading.value = true;
  pageError.value = null;
  try {
    const res = await nfClientsApi.list({ pageSize: 200 });
    allClients.value = Array.isArray(res) ? res : (res.data || []);
  } catch (e) {
    pageError.value = 'Não foi possível carregar a lista de clientes NF: ' + (e.message || 'Erro desconhecido');
  } finally {
    clientsLoading.value = false;
  }
}

function filterClients(query) {
  if (!query || query.length < 1) return [];
  const q = query.toLowerCase();
  return allClients.value.filter((c) => {
    const nome = (c.razao_social || c.nome || c.name || '').toLowerCase();
    const cnpj = (c.cnpj || '').replace(/\D/g, '');
    const qDigits = query.replace(/\D/g, '');
    return nome.includes(q) || (qDigits.length >= 2 && cnpj.includes(qDigits));
  }).slice(0, 8);
}

let clientSearchTimer = null;

function onClientSearch(evt) {
  const val = evt.target.value;
  clientSearchQuery.value = val;
  focusedIdx.value = -1;
  clearTimeout(clientSearchTimer);
  if (selectedClient.value) {
    selectedClient.value = null;
    f.setField('nf_client_id', '');
  }
  clientSearchTimer = setTimeout(() => {
    clientSearchResults.value = filterClients(val);
    clientDropdownOpen.value = clientSearchResults.value.length > 0 && val.length >= 1;
  }, 200);
}

function selectClient(c) {
  selectedClient.value = c;
  clientSearchQuery.value = c.razao_social || c.nome || c.name || '';
  f.setField('nf_client_id', c.id);
  clientDropdownOpen.value = false;
  focusedIdx.value = -1;
}

function clearClient() {
  selectedClient.value = null;
  clientSearchQuery.value = '';
  f.setField('nf_client_id', '');
  clientSearchResults.value = [];
  clientDropdownOpen.value = false;
}

function moveFocus(dir) {
  if (!clientDropdownOpen.value || clientSearchResults.value.length === 0) return;
  focusedIdx.value = Math.max(0, Math.min(clientSearchResults.value.length - 1, focusedIdx.value + dir));
}

function selectFocused() {
  if (focusedIdx.value >= 0 && clientSearchResults.value[focusedIdx.value]) {
    selectClient(clientSearchResults.value[focusedIdx.value]);
  }
}

// ── Formulário (campos cabeçalho) ─────────────────────────────────────────────
function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

const f = useForm({
  initial: {
    nf_client_id: '',
    serie: '',
    data_emissao: todayIso(),
    observacoes: '',
  },
  rules: {
    nf_client_id: [validators.required('Selecione um cliente NF')],
  },
});

// ── Itens da nota ─────────────────────────────────────────────────────────────
let _itemKey = 0;

function newItem() {
  return reactive({
    _key: ++_itemKey,
    _searchOpen: false,
    _searchResults: [],
    _searchFocusIdx: -1,
    _searching: false,
    _productLoaded: false,
    _errors: {},
    descricao: '',
    quantidade: 1,
    valor_unitario: '',
    aliquota_icms: '',
    aliquota_iss: '',
    aliquota_pis: '',
    aliquota_cofins: '',
  });
}

const items = ref([newItem()]);
const itensError = ref('');

function addItem() {
  items.value.push(newItem());
  itensError.value = '';
}

function removeItem(idx) {
  items.value.splice(idx, 1);
}

function onItemField(idx, field, val) {
  items.value[idx][field] = val;
  // Limpa o erro do campo ao editar
  if (items.value[idx]._errors && items.value[idx]._errors[field]) {
    items.value[idx]._errors[field] = '';
  }
}

// ── Busca de produto no catálogo ─────────────────────────────────────────────
const _prodTimers = {};

function onItemDescInput(idx, val) {
  items.value[idx].descricao = val;
  items.value[idx]._searchFocusIdx = -1;
  items.value[idx]._productLoaded = false;
  // Limpa erro de descrição ao digitar
  if (items.value[idx]._errors) items.value[idx]._errors.descricao = '';

  clearTimeout(_prodTimers[idx]);
  if (val.length < 2) {
    items.value[idx]._searchResults = [];
    items.value[idx]._searchOpen = false;
    return;
  }
  _prodTimers[idx] = setTimeout(() => searchProducts(idx, val), 350);
}

async function searchProducts(idx, q) {
  items.value[idx]._searching = true;
  try {
    const res = await nfProductsApi.list({ q, pageSize: 8 });
    const list = Array.isArray(res) ? res : (res.data || []);
    items.value[idx]._searchResults = list;
    items.value[idx]._searchOpen = list.length > 0;
  } catch {
    // silencioso — o usuário pode preencher manualmente
    items.value[idx]._searchResults = [];
    items.value[idx]._searchOpen = false;
  } finally {
    items.value[idx]._searching = false;
  }
}

function openProductSearch(idx) {
  if (items.value[idx]._searchResults && items.value[idx]._searchResults.length > 0) {
    items.value[idx]._searchOpen = true;
  }
}

function closeProductSearch(idx) {
  items.value[idx]._searchOpen = false;
}

function moveProdFocus(idx, dir) {
  const item = items.value[idx];
  if (!item._searchOpen || !item._searchResults.length) return;
  item._searchFocusIdx = Math.max(0, Math.min(item._searchResults.length - 1, item._searchFocusIdx + dir));
}

function selectFocusedProduct(idx) {
  const item = items.value[idx];
  if (item._searchFocusIdx >= 0 && item._searchResults[item._searchFocusIdx]) {
    selectProduct(idx, item._searchResults[item._searchFocusIdx]);
  }
}

function selectProduct(idx, p) {
  const item = items.value[idx];
  item.descricao = p.nome || p.name || p.descricao || '';
  if (p.preco_unitario != null) item.valor_unitario = String(p.preco_unitario);
  if (p.aliquota_icms != null) item.aliquota_icms = String(p.aliquota_icms);
  if (p.aliquota_iss != null) item.aliquota_iss = String(p.aliquota_iss);
  if (p.aliquota_pis != null) item.aliquota_pis = String(p.aliquota_pis);
  if (p.aliquota_cofins != null) item.aliquota_cofins = String(p.aliquota_cofins);
  item._searchOpen = false;
  item._searchResults = [];
  item._productLoaded = true;
}

// ── Cálculo automático de impostos ──────────────────────────────────────────
function calcItemTotal(item) {
  const qty = parseFloat(item.quantidade) || 0;
  const unit = parseFloat(item.valor_unitario) || 0;
  return qty * unit;
}

function calcItemTax(item, field) {
  const base = calcItemTotal(item);
  const aliq = parseFloat(item[field]) || 0;
  return base * (aliq / 100);
}

const totals = computed(() => {
  let subtotal = 0, icms = 0, iss = 0, pis = 0, cofins = 0;
  for (const item of items.value) {
    subtotal += calcItemTotal(item);
    icms += calcItemTax(item, 'aliquota_icms');
    iss += calcItemTax(item, 'aliquota_iss');
    pis += calcItemTax(item, 'aliquota_pis');
    cofins += calcItemTax(item, 'aliquota_cofins');
  }
  const totalImpostos = icms + iss + pis + cofins;
  const totalNf = subtotal + totalImpostos;
  return { subtotal, icms, iss, pis, cofins, totalImpostos, totalNf };
});

// ── Idempotency key ───────────────────────────────────────────────────────────
function generateIdempotencyKey() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// ── Validação de itens ────────────────────────────────────────────────────────
function validateItems() {
  // Limpa erros por campo antes de revalidar
  for (const item of items.value) {
    item._errors = {};
  }

  if (items.value.length === 0) {
    itensError.value = 'Adicione ao menos um item à nota fiscal.';
    return false;
  }

  let valid = true;
  for (let i = 0; i < items.value.length; i++) {
    const item = items.value[i];
    if (!item.descricao || !item.descricao.trim()) {
      item._errors.descricao = 'Descrição obrigatória.';
      valid = false;
    }
    const qty = parseFloat(item.quantidade);
    if (!qty || qty <= 0) {
      item._errors.quantidade = 'Quantidade deve ser maior que zero.';
      valid = false;
    }
    const unit = parseFloat(item.valor_unitario);
    if (isNaN(unit) || unit < 0) {
      item._errors.valor_unitario = 'Valor unitário inválido.';
      valid = false;
    }
  }

  if (!valid) {
    itensError.value = 'Corrija os campos destacados nos itens abaixo.';
    return false;
  }

  itensError.value = '';
  return true;
}

// ── Submit ────────────────────────────────────────────────────────────────────
function submit() {
  itensError.value = '';

  f.handleSubmit(async (vals) => {
    if (!validateItems()) return;

    const idempotencyKey = generateIdempotencyKey();

    const payload = {
      nf_client_id: Number(vals.nf_client_id),
      ...(vals.serie && vals.serie.trim() ? { serie: vals.serie.trim() } : {}),
      ...(vals.data_emissao ? { data_emissao: vals.data_emissao } : {}),
      ...(vals.observacoes && vals.observacoes.trim() ? { observacoes: vals.observacoes.trim() } : {}),
      total_nf: totals.value.totalNf,
      total_impostos: totals.value.totalImpostos,
      itens: items.value.map((item) => ({
        descricao: item.descricao.trim(),
        quantidade: parseFloat(item.quantidade) || 1,
        valor_unitario: parseFloat(item.valor_unitario) || 0,
        ...(item.aliquota_icms !== '' && item.aliquota_icms != null ? { aliquota_icms: parseFloat(item.aliquota_icms) || 0 } : {}),
        ...(item.aliquota_iss !== '' && item.aliquota_iss != null ? { aliquota_iss: parseFloat(item.aliquota_iss) || 0 } : {}),
        ...(item.aliquota_pis !== '' && item.aliquota_pis != null ? { aliquota_pis: parseFloat(item.aliquota_pis) || 0 } : {}),
        ...(item.aliquota_cofins !== '' && item.aliquota_cofins != null ? { aliquota_cofins: parseFloat(item.aliquota_cofins) || 0 } : {}),
      })),
    };

    try {
      await request('POST', '/v1/nf', payload, { 'Idempotency-Key': idempotencyKey });

      submitted.value = true;
      toast.success('Nota Fiscal emitida com sucesso! Aguardando confirmação da SEFAZ.');

      // Redireciona para a lista de NFs após breve pausa
      setTimeout(() => router.push('/nf'), 1800);
    } catch (e) {
      toast.error('Erro ao emitir nota fiscal: ' + (e.message || 'Tente novamente.'));
    }
  });
}

function cancel() {
  router.push('/nf');
}

// ── Inicialização ─────────────────────────────────────────────────────────────
onMounted(loadClients);
</script>

<style scoped>
/* ── Formulário ──────────────────────────────────────────────────────────────── */
form {
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-4);
}

/* ── Banner de status ────────────────────────────────────────────────────────── */
.nf-banner {
  display: flex;
  align-items: flex-start;
  gap: var(--ui-space-3);
  padding: var(--ui-space-3) var(--ui-space-4);
  border-radius: var(--ui-radius-md);
  font-size: var(--ui-text-sm);
  border: 1px solid;
}

.nf-banner[data-tone="info"] {
  background: rgb(var(--ui-accent) / 0.08);
  border-color: rgb(var(--ui-accent) / 0.28);
  color: rgb(var(--ui-fg));
}

.nf-banner-icon {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: var(--ui-space-6);
  height: var(--ui-space-6);
  border-radius: 50%;
  background: rgb(var(--ui-accent) / 0.18);
  color: rgb(var(--ui-accent));
  font-size: var(--ui-text-xs);
  font-weight: 900;
  font-style: italic;
}


.nf-banner-body {
  flex: 1;
}

/* ── Campo de busca de cliente ───────────────────────────────────────────────── */
.client-search-wrap {
  position: relative;
}

.client-search-wrap > input[type="search"] {
  background: rgb(var(--ui-bg));
  color: rgb(var(--ui-fg));
  border: 1px solid rgb(var(--ui-border-strong));
  border-radius: var(--ui-radius-sm);
  padding: var(--ui-space-2) calc(var(--ui-space-4) + var(--ui-space-3)) var(--ui-space-2) var(--ui-space-3);
  font: inherit;
  font-size: var(--ui-text-md);
  width: 100%;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}

.client-search-wrap > input[type="search"]:focus {
  outline: none;
  border-color: rgb(var(--ui-accent));
  box-shadow: 0 0 0 3px rgb(var(--ui-accent) / 0.15);
}

.client-search-wrap > input[data-error="true"] {
  border-color: rgb(var(--ui-danger));
}

.client-search-wrap > input[data-error="true"]:focus {
  box-shadow: 0 0 0 3px rgb(var(--ui-danger) / 0.15);
}

.client-spinner {
  position: absolute;
  right: var(--ui-space-2);
  top: 50%;
  transform: translateY(-50%);
  width: var(--ui-space-4);
  height: var(--ui-space-4);
  border: 2px solid rgb(var(--ui-border-strong));
  border-top-color: rgb(var(--ui-accent));
  border-radius: 50%;
  animation: nf-spin 0.7s linear infinite;
  pointer-events: none;
}

.client-ok {
  position: absolute;
  right: var(--ui-space-3);
  top: 50%;
  transform: translateY(-50%);
  color: rgb(var(--ui-ok));
  font-weight: 700;
  font-size: var(--ui-text-sm);
  pointer-events: none;
}

/* Dropdown de clientes */
.client-dropdown,
.prod-dropdown {
  position: absolute;
  top: calc(100% + var(--ui-space-1));
  left: 0;
  right: 0;
  background: rgb(var(--ui-surface));
  border: 1px solid rgb(var(--ui-border-strong));
  border-radius: var(--ui-radius-md);
  box-shadow: 0 8px 24px rgb(0 0 0 / 0.12), 0 2px 6px rgb(0 0 0 / 0.08);
  list-style: none;
  margin: 0;
  padding: var(--ui-space-1) 0;
  z-index: 100;
  max-height: 260px;
  overflow-y: auto;
}

.client-dropdown-item,
.prod-dropdown-item {
  display: flex;
  align-items: baseline;
  gap: var(--ui-space-2);
  padding: var(--ui-space-2) var(--ui-space-3);
  cursor: pointer;
  font-size: var(--ui-text-sm);
  transition: background 0.1s ease;
}

.client-dropdown-item:hover,
.client-dropdown-item[data-focused="true"] {
  background: rgb(var(--ui-accent) / 0.08);
}

.prod-dropdown-item:hover,
.prod-dropdown-item[data-focused="true"] {
  background: rgb(var(--ui-accent) / 0.08);
}

.cdi-name {
  font-weight: 600;
  color: rgb(var(--ui-fg));
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.cdi-cnpj {
  font-size: var(--ui-text-xs);
  color: rgb(var(--ui-muted));
  flex-shrink: 0;
  font-variant-numeric: tabular-nums;
}

.pdi-name {
  font-weight: 600;
  color: rgb(var(--ui-fg));
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.pdi-code {
  font-size: var(--ui-text-xs);
  color: rgb(var(--ui-muted));
  flex-shrink: 0;
}

.pdi-price {
  font-size: var(--ui-text-xs);
  color: rgb(var(--ui-accent));
  font-weight: 600;
  flex-shrink: 0;
  font-variant-numeric: tabular-nums;
}

.client-no-results {
  padding: var(--ui-space-3) var(--ui-space-4);
  font-size: var(--ui-text-sm);
  color: rgb(var(--ui-muted));
}

/* Badge do cliente selecionado */
.client-selected-badge {
  display: flex;
  align-items: center;
  gap: var(--ui-space-2);
  margin-top: var(--ui-space-2);
  padding: var(--ui-space-2) var(--ui-space-3);
  background: rgb(var(--ui-ok) / 0.07);
  border: 1px solid rgb(var(--ui-ok) / 0.22);
  border-radius: var(--ui-radius-md);
  font-size: var(--ui-text-sm);
}

.csb-icon {
  color: rgb(var(--ui-ok));
  font-size: var(--ui-text-xs);
  flex-shrink: 0;
}

.csb-text {
  display: flex;
  align-items: baseline;
  gap: var(--ui-space-2);
  flex: 1;
  min-width: 0;
}

.csb-text strong {
  color: rgb(var(--ui-fg));
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.csb-cnpj {
  font-size: var(--ui-text-xs);
  color: rgb(var(--ui-muted));
  flex-shrink: 0;
  font-variant-numeric: tabular-nums;
}

.csb-clear {
  display: flex;
  align-items: center;
  justify-content: center;
  width: var(--ui-space-6);
  height: var(--ui-space-6);
  border: none;
  background: none;
  cursor: pointer;
  color: rgb(var(--ui-muted));
  border-radius: var(--ui-radius-sm);
  font-size: var(--ui-text-xs);
  flex-shrink: 0;
  transition: background 0.15s ease, color 0.15s ease;
  padding: 0;
}

.csb-clear:hover {
  background: rgb(var(--ui-danger) / 0.1);
  color: rgb(var(--ui-danger));
}

.csb-clear:focus-visible {
  outline: 2px solid rgb(var(--ui-accent));
  outline-offset: 2px;
}

/* ── Textarea de observações ─────────────────────────────────────────────────── */
.obs-textarea {
  width: 100%;
  background: rgb(var(--ui-bg));
  color: rgb(var(--ui-fg));
  border: 1px solid rgb(var(--ui-border-strong));
  border-radius: var(--ui-radius-sm);
  padding: var(--ui-space-2) var(--ui-space-3);
  font: inherit;
  font-size: var(--ui-text-sm);
  resize: vertical;
  min-height: 80px;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}

.obs-textarea:focus {
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

/* ── Tabela de itens ─────────────────────────────────────────────────────────── */
.itens-error {
  display: flex;
  align-items: center;
  gap: var(--ui-space-2);
  padding: var(--ui-space-2) var(--ui-space-3);
  margin-bottom: var(--ui-space-3);
  background: rgb(var(--ui-danger) / 0.07);
  border: 1px solid rgb(var(--ui-danger) / 0.25);
  border-radius: var(--ui-radius-sm);
  font-size: var(--ui-text-sm);
  color: rgb(var(--ui-danger));
  font-weight: 500;
}

.itens-error-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: var(--ui-space-5);
  height: var(--ui-space-5);
  border-radius: 50%;
  background: rgb(var(--ui-danger) / 0.15);
  font-size: var(--ui-text-xs);
  font-weight: 800;
  flex-shrink: 0;
}

.itens-table-wrap {
  overflow-x: auto;
  border-radius: var(--ui-radius-md);
  border: 1px solid rgb(var(--ui-border));
}

.itens-table {
  width: 100%;
  border-collapse: collapse;
  font-size: var(--ui-text-sm);
  min-width: 760px;
}

.itens-table thead tr {
  background: rgb(var(--ui-surface-2));
  border-bottom: 2px solid rgb(var(--ui-border-strong));
}

.itens-table th {
  padding: var(--ui-space-2) var(--ui-space-2);
  text-align: left;
  font-size: var(--ui-text-xs);
  font-weight: 700;
  color: rgb(var(--ui-muted));
  text-transform: uppercase;
  letter-spacing: 0.04em;
  white-space: nowrap;
}

.itens-table th.col-qty,
.itens-table th.col-unit,
.itens-table th.col-aliq,
.itens-table th.col-total {
  text-align: right;
}

.itens-table th.col-action {
  text-align: center;
  width: 40px;
}

.item-row {
  border-bottom: 1px solid rgb(var(--ui-border));
  transition: background 0.1s ease;
}

.item-row:last-child {
  border-bottom: none;
}

.item-row:hover {
  background: rgb(var(--ui-surface) / 0.5);
}

.item-row[data-product-loaded="true"] {
  background: rgb(var(--ui-accent) / 0.03);
}

.itens-table td {
  padding: var(--ui-space-2) var(--ui-space-2);
  vertical-align: middle;
}

.col-desc {
  min-width: 220px;
}

.col-qty {
  width: 80px;
}

.col-unit {
  width: 110px;
}

.col-aliq {
  width: 72px;
}

.col-total {
  width: 110px;
  text-align: right;
}

.col-action {
  width: 40px;
  text-align: center;
}

/* Inputs dentro da tabela */
.item-input {
  background: rgb(var(--ui-bg));
  color: rgb(var(--ui-fg));
  border: 1px solid rgb(var(--ui-border));
  border-radius: var(--ui-radius-sm);
  padding: var(--ui-space-1) var(--ui-space-2);
  font: inherit;
  font-size: var(--ui-text-sm);
  width: 100%;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}

.item-input:focus {
  outline: none;
  border-color: rgb(var(--ui-accent));
  box-shadow: 0 0 0 2px rgb(var(--ui-accent) / 0.18);
  background: rgb(var(--ui-bg));
}

.item-input--error {
  border-color: rgb(var(--ui-danger));
}

.item-input--error:focus {
  box-shadow: 0 0 0 2px rgb(var(--ui-danger) / 0.18);
}

.item-input--num,
.item-input--aliq {
  text-align: right;
  font-variant-numeric: tabular-nums;
}

.item-input--aliq {
  padding: var(--ui-space-1) var(--ui-space-1);
}

/* Mensagem de erro por campo dentro da tabela */
.item-field-error {
  display: block;
  font-size: var(--ui-text-xs);
  color: rgb(var(--ui-danger));
  margin-top: var(--ui-space-1);
}

/* Wrapper de descrição com spinner e dropdown */
.item-desc-wrap {
  position: relative;
}

.item-spinner {
  position: absolute;
  right: var(--ui-space-2);
  top: 50%;
  transform: translateY(-50%);
  width: var(--ui-space-3);
  height: var(--ui-space-3);

  border: 2px solid rgb(var(--ui-border-strong));
  border-top-color: rgb(var(--ui-accent));
  border-radius: 50%;
  animation: nf-spin 0.7s linear infinite;
  pointer-events: none;
}

.prod-dropdown {
  min-width: 280px;
}

/* Total do item */
.item-total {
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  color: rgb(var(--ui-fg));
  display: block;
  text-align: right;
}

/* Botão de remover item */
.item-remove-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: var(--ui-space-6);
  height: var(--ui-space-6);
  border: none;
  background: none;
  cursor: pointer;
  color: rgb(var(--ui-muted));
  border-radius: var(--ui-radius-sm);
  font-size: var(--ui-text-sm);
  padding: 0;
  margin: 0 auto;
  transition: background 0.15s ease, color 0.15s ease;
}

.item-remove-btn:hover {
  background: rgb(var(--ui-danger) / 0.1);
  color: rgb(var(--ui-danger));
}

.item-remove-btn:focus-visible {
  outline: 2px solid rgb(var(--ui-accent));
  outline-offset: 2px;
}

/* ── Estado vazio de itens ───────────────────────────────────────────────────── */
.itens-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--ui-space-2);
  padding: var(--ui-space-6) var(--ui-space-4);
  text-align: center;
}

.itens-empty-icon {
  font-size: 2.5rem;
  opacity: 0.35;
  line-height: 1;
}

.itens-empty-title {
  font-size: var(--ui-text-md);
  font-weight: 600;
  color: rgb(var(--ui-fg));
  margin: 0;
}

.itens-empty-desc {
  font-size: var(--ui-text-sm);
  color: rgb(var(--ui-muted));
  margin: 0;
  max-width: 360px;
}

/* ── Resumo de impostos ──────────────────────────────────────────────────────── */
.impostos-grid {
  display: flex;
  flex-direction: column;
  gap: 0;
  border-radius: var(--ui-radius-md);
  overflow: hidden;
  border: 1px solid rgb(var(--ui-border));
}

.imposto-row {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  padding: var(--ui-space-3) var(--ui-space-4);
  border-bottom: 1px solid rgb(var(--ui-border));
  gap: var(--ui-space-4);
}

.imposto-row:last-child {
  border-bottom: none;
}

.imposto-row--sub {
  background: rgb(var(--ui-surface-2) / 0.5);
}

.imposto-label {
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-1);
  font-size: var(--ui-text-sm);
  font-weight: 500;
  color: rgb(var(--ui-fg));
}

.imposto-hint {
  font-size: var(--ui-text-xs);
  font-weight: 400;
  color: rgb(var(--ui-faint));
}

.imposto-value {
  font-size: var(--ui-text-sm);
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  color: rgb(var(--ui-fg));
  flex-shrink: 0;
}

.imposto-divider {
  height: 1px;
  background: rgb(var(--ui-border-strong));
}

.imposto-row--impostos {
  background: rgb(var(--ui-warn) / 0.05);
}

.imposto-row--impostos .imposto-value {
  color: rgb(var(--ui-warn));
}

.imposto-row--total {
  background: rgb(var(--ui-accent) / 0.06);
  border-top: 2px solid rgb(var(--ui-accent) / 0.25);
}

.imposto-row--total .imposto-label {
  font-size: var(--ui-text-md);
  font-weight: 700;
}

.imposto-value--total {
  font-size: var(--ui-text-lg);
  font-weight: 800;
  color: rgb(var(--ui-accent));
}

/* ── Ações do formulário ─────────────────────────────────────────────────────── */
.form-actions {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: var(--ui-space-2);
  padding-top: var(--ui-space-2);
}

/* ── Acessibilidade ──────────────────────────────────────────────────────────── */
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

/* ── Animação de spinner ─────────────────────────────────────────────────────── */
@keyframes nf-spin {
  to { transform: rotate(360deg); }
}

@keyframes nf-spin-abs {
  to { transform: translateY(-50%) rotate(360deg); }
}

.client-spinner {
  animation: nf-spin-abs 0.7s linear infinite;
}

/* ── Responsivo ≤860px ───────────────────────────────────────────────────────── */
@media (max-width: 860px) {
  .form-actions {
    flex-direction: column-reverse;
    align-items: stretch;
  }

  .itens-table-wrap {
    border-radius: 0;
    border-left: none;
    border-right: none;
    margin: 0 calc(var(--ui-space-4) * -1);
  }

  .imposto-row {
    padding: var(--ui-space-2) var(--ui-space-3);
  }
}

@media (max-width: 640px) {
  .client-selected-badge {
    flex-wrap: wrap;
  }

  .csb-text {
    flex-direction: column;
    gap: var(--ui-space-1);
  }

  .impostos-grid {
    border-radius: var(--ui-radius-sm);
  }
}
</style>
