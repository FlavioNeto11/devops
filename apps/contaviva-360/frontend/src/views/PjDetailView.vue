<template>
  <UiPageLayout
    :title="pj ? pj.razao_social : 'Carregando…'"
    eyebrow="Pessoa Jurídica"
    :subtitle="pj ? pj.cnpj : ''"
    width="wide"
    :loading="loadingPj"
    :error="errorPj"
    @retry="loadPj"
  >
    <template #actions>
      <UiButton variant="ghost" to="/dashboard/pj">Voltar ao Painel</UiButton>
    </template>

    <!-- Nav de abas -->
    <nav class="pj-tabs" aria-label="Seções da Pessoa Jurídica" role="tablist">
      <button
        v-for="tab in tabs"
        :key="tab.key"
        class="pj-tab"
        :data-active="activeTab === tab.key ? 'true' : null"
        role="tab"
        :aria-selected="activeTab === tab.key"
        @click="activeTab = tab.key"
      >
        {{ tab.label }}
      </button>
    </nav>

    <!-- ABA: RESUMO -->
    <div v-if="activeTab === 'resumo'" class="pj-tab-body">
      <UiErrorState
        v-if="errorFin"
        :message="errorFin"
        @retry="loadFinSummary"
      />
      <div class="pj-kpi-row">
        <UiMetricCard
          label="Receitas (mês)"
          :value="fmt(finSummary?.receitas)"
          tone="success"
          :loading="loadingFin"
        />
        <UiMetricCard
          label="Despesas (mês)"
          :value="fmt(finSummary?.despesas)"
          tone="error"
          :loading="loadingFin"
        />
        <UiMetricCard
          label="Saldo"
          :value="fmt(finSummary?.saldo)"
          :tone="(finSummary?.saldo ?? 0) >= 0 ? 'primary' : 'error'"
          :loading="loadingFin"
        />
        <UiMetricCard
          label="Notas Fiscais"
          :value="nfCount"
          tone="neutral"
          :loading="loadingNf"
          hint="emitidas"
        />
      </div>

      <div class="pj-detail-grid">
        <UiCard title="Dados Cadastrais">
          <dl class="pj-dl">
            <div class="pj-dl-row">
              <dt class="pj-dl-label">Razão Social</dt>
              <dd class="pj-dl-value">{{ pj?.razao_social || '—' }}</dd>
            </div>
            <div class="pj-dl-row">
              <dt class="pj-dl-label">CNPJ</dt>
              <dd class="pj-dl-value">{{ pj?.cnpj || '—' }}</dd>
            </div>
            <div class="pj-dl-row">
              <dt class="pj-dl-label">Inscrição Estadual</dt>
              <dd class="pj-dl-value">{{ pj?.inscricao_estadual || '—' }}</dd>
            </div>
            <div class="pj-dl-row">
              <dt class="pj-dl-label">Inscrição Municipal</dt>
              <dd class="pj-dl-value">{{ pj?.inscricao_municipal || '—' }}</dd>
            </div>
            <div class="pj-dl-row">
              <dt class="pj-dl-label">CNAE</dt>
              <dd class="pj-dl-value">{{ pj?.cnae || '—' }}</dd>
            </div>
            <div class="pj-dl-row">
              <dt class="pj-dl-label">Regime Tributário</dt>
              <dd class="pj-dl-value">
                <UiStatusBadge v-if="pj?.regime_tributario" :status="pj.regime_tributario" :label="regimeLabel(pj.regime_tributario)" />
                <span v-else>—</span>
              </dd>
            </div>
          </dl>
        </UiCard>

        <UiCard title="Dados Bancários">
          <p class="pj-bancarios">{{ pj?.dados_bancarios || 'Nenhum dado bancário cadastrado.' }}</p>
        </UiCard>
      </div>
    </div>

    <!-- ABA: SÓCIOS -->
    <div v-if="activeTab === 'socios'" class="pj-tab-body">
      <UiCard title="Quadro Societário" subtitle="Sócios e participações">
        <template #actions>
          <UiButton variant="primary" @click="openAddPartner">Adicionar Sócio</UiButton>
        </template>
        <UiDataTable
          :columns="partnerCols"
          :rows="rPartners.items.value"
          :loading="rPartners.loading.value"
          :error="rPartners.error.value"
          row-key="id"
          :empty="{ title: 'Nenhum sócio cadastrado', description: 'Adicione o primeiro sócio da empresa.' }"
          @retry="rPartners.load"
        >
          <template #cell-participacao="{ value }">
            {{ value != null ? value + '%' : '—' }}
          </template>
          <template #cell-actions="{ row }">
            <UiButton variant="danger" size="sm" @click="removePartner(row)">Remover</UiButton>
          </template>
          <template #empty-action>
            <UiButton variant="primary" @click="openAddPartner">Adicionar Sócio</UiButton>
          </template>
        </UiDataTable>
      </UiCard>
    </div>

    <!-- ABA: FINANCEIRO -->
    <div v-if="activeTab === 'financeiro'" class="pj-tab-body">
      <div class="pj-kpi-row">
        <UiMetricCard label="Total Receitas" :value="fmt(finSummary?.receitas)" tone="success" :loading="loadingFin" />
        <UiMetricCard label="Total Despesas" :value="fmt(finSummary?.despesas)" tone="error" :loading="loadingFin" />
        <UiMetricCard
          label="Saldo"
          :value="fmt(finSummary?.saldo)"
          :tone="(finSummary?.saldo ?? 0) >= 0 ? 'primary' : 'error'"
          :loading="loadingFin"
        />
      </div>

      <UiCard title="Receitas e Despesas">
        <template #actions>
          <div class="pj-filter-row">
            <select
              class="pj-select"
              :value="finFilter"
              aria-label="Filtrar por tipo"
              @change="e => { finFilter = e.target.value; loadIncomeExpenses(); }"
            >
              <option value="">Todos</option>
              <option value="income">Receitas</option>
              <option value="expense">Despesas</option>
            </select>
          </div>
        </template>
        <UiDataTable
          :columns="finCols"
          :rows="rFin.value.items.value"
          :loading="rFin.value.loading.value"
          :error="rFin.value.error.value"
          row-key="id"
          server-mode
          paginated
          :page="rFin.value.page.value"
          :page-size="rFin.value.pageSize.value"
          :total="rFin.value.total.value"
          :empty="{ title: 'Nenhuma movimentação', description: 'Sem receitas ou despesas registradas.' }"
          @update:page="rFin.value.setPage"
          @retry="loadIncomeExpenses"
        />
      </UiCard>
    </div>

    <!-- ABA: OBRIGAÇÕES FISCAIS -->
    <div v-if="activeTab === 'obrigacoes'" class="pj-tab-body">
      <UiCard title="Obrigações Fiscais" subtitle="Vencimentos e status fiscais">
        <template #actions>
          <UiButton
            variant="primary"
            :loading="gerandoObrigacoes"
            @click="gerarObrigacoes"
          >
            Gerar Obrigações pelo Regime
          </UiButton>
        </template>
        <UiDataTable
          :columns="obrigCols"
          :rows="rObrig.items.value"
          :loading="rObrig.loading.value"
          :error="rObrig.error.value"
          row-key="id"
          server-mode
          paginated
          :page="rObrig.page.value"
          :page-size="rObrig.pageSize.value"
          :total="rObrig.total.value"
          clickable-rows
          :empty="{ title: 'Nenhuma obrigação fiscal', description: 'Clique em «Gerar Obrigações» para criar pelo regime tributário.' }"
          @row-click="openObrigModal"
          @update:page="rObrig.setPage"
          @retry="rObrig.load"
        >
          <template #empty-action>
            <UiButton variant="primary" :loading="gerandoObrigacoes" @click="gerarObrigacoes">
              Gerar Obrigações pelo Regime
            </UiButton>
          </template>
        </UiDataTable>
      </UiCard>
    </div>

    <!-- ABA: NOTAS FISCAIS -->
    <div v-if="activeTab === 'nf'" class="pj-tab-body">
      <UiCard title="Notas Fiscais" subtitle="NFs emitidas vinculadas a esta empresa">
        <UiDataTable
          :columns="nfCols"
          :rows="rNf.items.value"
          :loading="rNf.loading.value"
          :error="rNf.error.value"
          row-key="id"
          server-mode
          paginated
          :page="rNf.page.value"
          :page-size="rNf.pageSize.value"
          :total="rNf.total.value"
          :empty="{ title: 'Nenhuma nota fiscal', description: 'Ainda não há NFs vinculadas a esta empresa.' }"
          @update:page="rNf.setPage"
          @retry="rNf.load"
        />
      </UiCard>
    </div>

    <!-- ABA: DOCUMENTOS -->
    <div v-if="activeTab === 'documentos'" class="pj-tab-body">
      <UiCard title="Documentos" subtitle="Arquivos e documentos vinculados à empresa">
        <UiDataTable
          :columns="docCols"
          :rows="rDocs.items.value"
          :loading="rDocs.loading.value"
          :error="rDocs.error.value"
          row-key="id"
          server-mode
          paginated
          :page="rDocs.page.value"
          :page-size="rDocs.pageSize.value"
          :total="rDocs.total.value"
          :empty="{ title: 'Nenhum documento', description: 'Nenhum documento foi enviado ainda.' }"
          @update:page="rDocs.setPage"
          @retry="rDocs.load"
        >
          <template #cell-url="{ row }">
            <a
              v-if="row.url"
              class="pj-doc-link"
              :href="row.url"
              target="_blank"
              rel="noopener noreferrer"
            >Abrir</a>
            <span v-else>—</span>
          </template>
        </UiDataTable>
      </UiCard>
    </div>

    <!-- ABA: TAREFAS -->
    <div v-if="activeTab === 'tarefas'" class="pj-tab-body">
      <UiCard title="Tarefas" subtitle="Tarefas vinculadas a esta Pessoa Jurídica">
        <UiDataTable
          :columns="taskCols"
          :rows="rTasks.items.value"
          :loading="rTasks.loading.value"
          :error="rTasks.error.value"
          row-key="id"
          server-mode
          paginated
          :page="rTasks.page.value"
          :page-size="rTasks.pageSize.value"
          :total="rTasks.total.value"
          :empty="{ title: 'Nenhuma tarefa', description: 'Não há tarefas associadas a esta empresa.' }"
          @update:page="rTasks.setPage"
          @retry="rTasks.load"
        />
      </UiCard>
    </div>

    <!-- Modal: detalhe de obrigação -->
    <UiModal
      :open="!!selectedObrig"
      title="Obrigação Fiscal"
      width="md"
      @update:open="v => { if (!v) selectedObrig = null; }"
    >
      <div v-if="selectedObrig" class="pj-obrig-detail">
        <div class="pj-obrig-row">
          <span class="pj-obrig-label">Tipo</span>
          <span>{{ selectedObrig.tipo || '—' }}</span>
        </div>
        <div class="pj-obrig-row">
          <span class="pj-obrig-label">Vencimento</span>
          <span>{{ fmtDate(selectedObrig.data_vencimento) }}</span>
        </div>
        <div class="pj-obrig-row">
          <span class="pj-obrig-label">Status</span>
          <UiStatusBadge :status="selectedObrig.status" />
        </div>
        <div v-if="selectedObrig.valor_estimado != null" class="pj-obrig-row">
          <span class="pj-obrig-label">Valor Estimado</span>
          <span>{{ fmt(selectedObrig.valor_estimado) }}</span>
        </div>
        <div v-if="selectedObrig.descricao" class="pj-obrig-row pj-obrig-row--full">
          <span class="pj-obrig-label">Descrição</span>
          <span>{{ selectedObrig.descricao }}</span>
        </div>
      </div>
      <template #footer>
        <UiButton variant="ghost" @click="selectedObrig = null">Fechar</UiButton>
      </template>
    </UiModal>

    <!-- Modal: Adicionar Sócio -->
    <UiModal
      :open="showAddPartner"
      title="Adicionar Sócio"
      width="md"
      @update:open="v => { if (!v) closeAddPartner(); }"
    >
      <div class="pj-form-grid">
        <UiFormField label="Nome" required :error="partnerForm.errors.nome">
          <template #default="{ id, describedBy }">
            <input
              :id="id"
              :aria-describedby="describedBy"
              :value="partnerForm.values.nome"
              type="text"
              placeholder="Nome completo do sócio"
              @input="e => partnerForm.setField('nome', e.target.value)"
            />
          </template>
        </UiFormField>
        <UiFormField label="CPF/CNPJ" required :error="partnerForm.errors.cpf_cnpj">
          <template #default="{ id, describedBy }">
            <input
              :id="id"
              :aria-describedby="describedBy"
              :value="partnerForm.values.cpf_cnpj"
              type="text"
              placeholder="000.000.000-00"
              @input="e => partnerForm.setField('cpf_cnpj', e.target.value)"
            />
          </template>
        </UiFormField>
        <UiFormField label="Participação (%)" :error="partnerForm.errors.participacao">
          <template #default="{ id, describedBy }">
            <input
              :id="id"
              :aria-describedby="describedBy"
              :value="partnerForm.values.participacao"
              type="number"
              min="0"
              max="100"
              step="0.01"
              placeholder="0–100"
              @input="e => partnerForm.setField('participacao', e.target.value)"
            />
          </template>
        </UiFormField>
        <UiFormField label="Qualificação" :error="partnerForm.errors.qualificacao">
          <template #default="{ id, describedBy }">
            <input
              :id="id"
              :aria-describedby="describedBy"
              :value="partnerForm.values.qualificacao"
              type="text"
              placeholder="Ex.: Sócio-Administrador"
              @input="e => partnerForm.setField('qualificacao', e.target.value)"
            />
          </template>
        </UiFormField>
      </div>
      <template #footer>
        <UiButton variant="ghost" @click="closeAddPartner">Cancelar</UiButton>
        <UiButton variant="primary" :loading="partnerForm.submitting.value" @click="submitAddPartner">
          Adicionar
        </UiButton>
      </template>
    </UiModal>
  </UiPageLayout>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import {
  UiPageLayout, UiCard, UiMetricCard, UiDataTable, UiButton,
  UiModal, UiFormField, UiStatusBadge, UiErrorState,
  useResource, useForm, useToast, useConfirm,
  validators, format,
} from '../ui/index.js';
import { resourceFactory } from '../api.js';

// ── rota ────────────────────────────────────────────────────────────────────
const route = useRoute();
const pjId = computed(() => route.params.id);

// ── apis (via resourceFactory para endpoints não pré-definidos em api.js) ──
const apiPj             = resourceFactory('pj');
const apiIncomeExpenses = resourceFactory('income-expenses');
const apiFiscalOblig    = resourceFactory('fiscal-obligations');
const apiNf             = resourceFactory('nf');
const apiDocs           = resourceFactory('documents');
const apiTasks          = resourceFactory('tasks');

// Api de parceiros usa paths especiais — wrapper manual
function partnersApi(pjId) {
  const BASE = (import.meta.env.VITE_API_BASE_URL || '/contaviva-360/api') + '/v1/pj/' + pjId + '/partners';
  async function req(method, path, body) {
    const res = await fetch(BASE + (path || ''), {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const e = new Error((data?.error?.message) || ('HTTP ' + res.status));
      e.status = res.status;
      throw e;
    }
    return data;
  }
  return {
    list: () => req('GET').then(d => Array.isArray(d) ? { data: d, total: d.length } : d),
    create: (body) => req('POST', '', body),
    remove: (partnerId) => req('DELETE', '/' + partnerId),
  };
}

// ── composables de toast e confirm ──────────────────────────────────────────
const toast   = useToast();
const confirm = useConfirm();

// ── estado da PJ (detalhe) ─────────────────────────────────────────────────
const pj        = ref(null);
const loadingPj = ref(true);
const errorPj   = ref(null);

async function loadPj() {
  loadingPj.value = true;
  errorPj.value = null;
  try {
    pj.value = await apiPj.get(pjId.value);
  } catch (e) {
    errorPj.value = e;
  } finally {
    loadingPj.value = false;
  }
}

// ── abas ────────────────────────────────────────────────────────────────────
const tabs = [
  { key: 'resumo',     label: 'Resumo' },
  { key: 'socios',     label: 'Sócios' },
  { key: 'financeiro', label: 'Financeiro' },
  { key: 'obrigacoes', label: 'Obrigações Fiscais' },
  { key: 'nf',         label: 'Notas Fiscais' },
  { key: 'documentos', label: 'Documentos' },
  { key: 'tarefas',    label: 'Tarefas' },
];
const activeTab = ref('resumo');

// ── Resumo: receitas/despesas ─────────────────────────────────────────────
const loadingFin = ref(false);
const finSummary = ref(null);
const errorFin   = ref(null);

async function loadFinSummary() {
  loadingFin.value = true;
  errorFin.value = null;
  try {
    const res = await apiIncomeExpenses.list({ entity_type: 'pj', entity_id: pjId.value, pageSize: 9999 });
    const rows = Array.isArray(res) ? res : (res.data || []);
    const receitas = rows.filter(r => r.tipo === 'income' || r.type === 'income').reduce((s, r) => s + Number(r.valor || r.amount || 0), 0);
    const despesas = rows.filter(r => r.tipo === 'expense' || r.type === 'expense').reduce((s, r) => s + Number(r.valor || r.amount || 0), 0);
    finSummary.value = { receitas, despesas, saldo: receitas - despesas };
  } catch (e) {
    errorFin.value = e;
    finSummary.value = null;
  } finally {
    loadingFin.value = false;
  }
}

// ── Financeiro: tabela paginada ────────────────────────────────────────────
const finFilter = ref('');

function makeFinResource() {
  return {
    list: (params) => apiIncomeExpenses.list({
      ...params,
      entity_type: 'pj',
      entity_id: pjId.value,
      ...(finFilter.value ? { tipo: finFilter.value } : {}),
    }),
  };
}
const rFin = ref(useResource(makeFinResource()));

function loadIncomeExpenses() {
  // recria o resource para pegar o filtro atualizado e recarrega
  rFin.value = useResource(makeFinResource());
  rFin.value.load();
}

const finCols = [
  { key: 'descricao',       label: 'Descrição',   sortable: true },
  { key: 'tipo',            label: 'Tipo',        format: 'badge' },
  { key: 'valor',           label: 'Valor',       align: 'right', format: 'currency' },
  { key: 'data_competencia',label: 'Competência', format: 'date' },
  { key: 'status',          label: 'Status',      format: 'badge' },
];

// ── Sócios ─────────────────────────────────────────────────────────────────
const partnersResource = computed(() => {
  const api = partnersApi(pjId.value);
  return { list: api.list, get: () => Promise.resolve(null), create: api.create, update: () => Promise.resolve(null), remove: api.remove };
});
const rPartners = useResource(partnersResource.value);

const partnerCols = [
  { key: 'nome',           label: 'Nome',          sortable: true },
  { key: 'cpf_cnpj',      label: 'CPF / CNPJ' },
  { key: 'qualificacao',   label: 'Qualificação' },
  { key: 'participacao',   label: 'Participação (%)', align: 'right' },
  { key: 'actions',        label: '',              align: 'right' },
];

const showAddPartner = ref(false);
const partnerForm = useForm({
  initial: { nome: '', cpf_cnpj: '', participacao: '', qualificacao: '' },
  rules: {
    nome: [validators.required()],
    cpf_cnpj: [validators.required('CPF/CNPJ obrigatório')],
  },
});

function openAddPartner() { partnerForm.reset(); showAddPartner.value = true; }
function closeAddPartner() { showAddPartner.value = false; partnerForm.reset(); }

async function submitAddPartner() {
  await partnerForm.handleSubmit(async (values) => {
    try {
      const api = partnersApi(pjId.value);
      await api.create({ ...values, participacao: values.participacao ? Number(values.participacao) : null });
      toast.success('Sócio adicionado com sucesso.');
      closeAddPartner();
      rPartners.load();
    } catch (e) {
      toast.error(e?.message || 'Erro ao adicionar sócio.');
    }
  });
}

async function removePartner(row) {
  const ok = await confirm({
    title: 'Remover Sócio',
    message: `Tem certeza que deseja remover "${row.nome}" do quadro societário?`,
    danger: true,
    confirmLabel: 'Remover',
  });
  if (!ok) return;
  try {
    const api = partnersApi(pjId.value);
    await api.remove(row.id);
    toast.success('Sócio removido.');
    rPartners.load();
  } catch (e) {
    toast.error(e?.message || 'Erro ao remover sócio.');
  }
}

// ── Obrigações Fiscais ──────────────────────────────────────────────────────
const rObrig = useResource({
  list: (params) => apiFiscalOblig.list({ ...params, entity_type: 'pj', entity_id: pjId.value }),
  get: apiFiscalOblig.get,
  create: apiFiscalOblig.create,
  update: apiFiscalOblig.update,
  remove: apiFiscalOblig.remove,
});

const obrigCols = [
  { key: 'tipo',            label: 'Obrigação',   sortable: true },
  { key: 'data_vencimento', label: 'Vencimento',  format: 'date', sortable: true },
  { key: 'status',          label: 'Status',      format: 'badge' },
  { key: 'valor_estimado',  label: 'Valor Est.',  align: 'right', format: 'currency' },
];

const selectedObrig    = ref(null);
const gerandoObrigacoes = ref(false);

function openObrigModal(row) { selectedObrig.value = row; }

async function gerarObrigacoes() {
  const ok = await confirm({
    title: 'Gerar Obrigações pelo Regime',
    message: `Gerar as obrigações fiscais automaticamente com base no regime tributário "${regimeLabel(pj.value?.regime_tributario)}"? Obrigações existentes não serão duplicadas.`,
    confirmLabel: 'Gerar',
  });
  if (!ok) return;
  gerandoObrigacoes.value = true;
  try {
    const BASE = (import.meta.env.VITE_API_BASE_URL || '/contaviva-360/api');
    const res = await fetch(BASE + '/v1/pj/' + pjId.value + '/fiscal-obligations/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error?.message || ('HTTP ' + res.status));
    toast.success('Obrigações geradas com sucesso.');
    rObrig.load();
  } catch (e) {
    toast.error(e?.message || 'Erro ao gerar obrigações.');
  } finally {
    gerandoObrigacoes.value = false;
  }
}

// ── Notas Fiscais ───────────────────────────────────────────────────────────
const rNf = useResource({
  list: (params) => apiNf.list({ ...params, nf_client_id: pjId.value }),
  get: apiNf.get,
  create: apiNf.create,
  update: apiNf.update,
  remove: apiNf.remove,
});

const loadingNf = ref(false);
const nfCount   = computed(() => rNf.total.value || rNf.items.value.length || 0);

const nfCols = [
  { key: 'numero',         label: 'Número',      sortable: true },
  { key: 'serie',          label: 'Série' },
  { key: 'data_emissao',   label: 'Emissão',     format: 'date', sortable: true },
  { key: 'valor_total',    label: 'Valor Total',  align: 'right', format: 'currency' },
  { key: 'status',         label: 'Status',       format: 'badge' },
];

// ── Documentos ──────────────────────────────────────────────────────────────
const rDocs = useResource({
  list: (params) => apiDocs.list({ ...params, entity_type: 'pj', entity_id: pjId.value }),
  get: apiDocs.get,
  create: apiDocs.create,
  update: apiDocs.update,
  remove: apiDocs.remove,
});

const docCols = [
  { key: 'nome',        label: 'Nome',       sortable: true },
  { key: 'tipo',        label: 'Tipo',       format: 'badge' },
  { key: 'created_at',  label: 'Data',       format: 'date' },
  { key: 'url',         label: 'Link' },
];

// ── Tarefas ─────────────────────────────────────────────────────────────────
const rTasks = useResource({
  list: (params) => apiTasks.list({ ...params, entity_type: 'pj', entity_id: pjId.value }),
  get: apiTasks.get,
  create: apiTasks.create,
  update: apiTasks.update,
  remove: apiTasks.remove,
});

const taskCols = [
  { key: 'title',      label: 'Tarefa',     sortable: true },
  { key: 'priority',   label: 'Prioridade', format: 'badge' },
  { key: 'due_at',     label: 'Prazo',      format: 'date' },
  { key: 'status',     label: 'Status',     format: 'badge' },
  { key: 'assignee',   label: 'Responsável' },
];

// ── helpers ──────────────────────────────────────────────────────────────────
const fmt     = (v) => format.formatCurrency(v ?? 0);
const fmtDate = (d) => d ? format.formatDate(d) : '—';

function regimeLabel(r) {
  const map = { simples: 'Simples Nacional', lucro_presumido: 'Lucro Presumido', lucro_real: 'Lucro Real' };
  return map[r] || r || '—';
}

// ── inicialização ─────────────────────────────────────────────────────────
onMounted(async () => {
  await loadPj();
  // carrega dados de todas as abas em paralelo para pré-popular métricas
  loadFinSummary();
  rFin.value.setFilters({ entity_type: 'pj', entity_id: pjId.value });
  rPartners.load();
  rObrig.load();
  rNf.load();
  rDocs.load();
  rTasks.load();
});
</script>

<style scoped>
/* ── tabs ─────────────────────────────────────────────────────────────── */
.pj-tabs {
  display: flex;
  gap: 0;
  border-bottom: 2px solid rgb(var(--ui-border));
  overflow-x: auto;
  flex-wrap: nowrap;
  scrollbar-width: none;
}
.pj-tabs::-webkit-scrollbar { display: none; }

.pj-tab {
  background: none;
  border: none;
  border-bottom: 2px solid transparent;
  margin-bottom: -2px;
  padding: var(--ui-space-3) var(--ui-space-4);
  font: inherit;
  font-size: var(--ui-text-sm);
  font-weight: 500;
  color: rgb(var(--ui-muted));
  cursor: pointer;
  white-space: nowrap;
  transition: color .15s, border-color .15s;
  border-radius: var(--ui-radius-sm) var(--ui-radius-sm) 0 0;
}
.pj-tab:hover { color: rgb(var(--ui-fg)); }
.pj-tab[data-active="true"] {
  color: rgb(var(--ui-accent-strong));
  border-bottom-color: rgb(var(--ui-accent-strong));
  font-weight: 700;
}

/* ── tab body ──────────────────────────────────────────────────────────── */
.pj-tab-body {
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-4);
}

/* ── KPI row ───────────────────────────────────────────────────────────── */
.pj-kpi-row {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: var(--ui-space-4);
}

/* ── detalhe: dl ────────────────────────────────────────────────────────── */
.pj-detail-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--ui-space-4);
}
@media (max-width: 860px) { .pj-detail-grid { grid-template-columns: 1fr; } }

.pj-dl {
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 0;
}
.pj-dl-row {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: var(--ui-space-4);
  padding: var(--ui-space-3) 0;
  border-bottom: 1px solid rgb(var(--ui-border));
}
.pj-dl-row:last-child { border-bottom: none; }
.pj-dl-label {
  font-size: var(--ui-text-sm);
  color: rgb(var(--ui-muted));
  font-weight: 500;
  flex-shrink: 0;
}
.pj-dl-value {
  font-size: var(--ui-text-sm);
  color: rgb(var(--ui-fg));
  text-align: right;
}

/* ── dados bancários ────────────────────────────────────────────────────── */
.pj-bancarios {
  font-size: var(--ui-text-sm);
  color: rgb(var(--ui-fg));
  margin: 0;
  white-space: pre-wrap;
  line-height: 1.6;
}

/* ── filtros inline ─────────────────────────────────────────────────────── */
.pj-filter-row {
  display: flex;
  gap: var(--ui-space-2);
  align-items: center;
}
.pj-select {
  background: rgb(var(--ui-bg));
  color: rgb(var(--ui-fg));
  border: 1px solid rgb(var(--ui-border-strong));
  border-radius: var(--ui-radius-sm);
  padding: var(--ui-space-2) var(--ui-space-3);
  font: inherit;
  font-size: var(--ui-text-sm);
  cursor: pointer;
}

/* ── modal: obrigação ──────────────────────────────────────────────────── */
.pj-obrig-detail {
  display: flex;
  flex-direction: column;
  gap: 0;
}
.pj-obrig-row {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: var(--ui-space-4);
  padding: var(--ui-space-3) 0;
  border-bottom: 1px solid rgb(var(--ui-border));
  font-size: var(--ui-text-sm);
}
.pj-obrig-row:last-child { border-bottom: none; }
.pj-obrig-row--full { flex-direction: column; gap: var(--ui-space-1); }
.pj-obrig-label {
  color: rgb(var(--ui-muted));
  font-weight: 500;
  flex-shrink: 0;
}

/* ── form: adicionar sócio ─────────────────────────────────────────────── */
.pj-form-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--ui-space-4);
}
@media (max-width: 560px) { .pj-form-grid { grid-template-columns: 1fr; } }

/* ── doc link ──────────────────────────────────────────────────────────── */
.pj-doc-link {
  color: rgb(var(--ui-accent-strong));
  text-decoration: none;
  font-size: var(--ui-text-sm);
}
.pj-doc-link:hover { text-decoration: underline; }
</style>
