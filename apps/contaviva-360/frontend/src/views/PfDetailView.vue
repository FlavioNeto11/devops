<template>
  <UiPageLayout
    :title="pfName"
    eyebrow="Pessoa Física"
    :subtitle="pfCpf ? 'CPF: ' + pfCpf : ''"
    :loading="loadingPf"
    :error="pfError"
    width="wide"
    @retry="loadPf"
  >
    <template #actions>
      <UiButton variant="ghost" :to="'/pf'">← Voltar</UiButton>
      <UiButton :to="'/pf/' + route.params.id + '/edit'">Editar</UiButton>
    </template>

    <!-- Metrics banner (sempre visível após carregamento) -->
    <div v-if="!loadingPf && !pfError && pf" class="pf-metrics">
      <UiMetricCard
        label="Patrimônio Líquido"
        :value="fmt(dashboard?.patrimonio?.total)"
        :loading="loadingDash"
        tone="primary"
      />
      <UiMetricCard
        label="Total de Bens"
        :value="fmt(dashboard?.patrimonio?.total_bens)"
        :loading="loadingDash"
        tone="success"
      />
      <UiMetricCard
        label="Total de Dívidas"
        :value="fmt(dashboard?.patrimonio?.total_dividas)"
        :loading="loadingDash"
        tone="error"
      />
      <UiMetricCard
        label="Receitas (12m)"
        :value="fmt(dashboard?.receitas_despesas?.receitas)"
        :loading="loadingDash"
        tone="success"
      />
    </div>

    <!-- Tab bar -->
    <div v-if="!loadingPf && !pfError && pf" class="pf-tabs" role="tablist" aria-label="Seções do cadastro">
      <button
        v-for="tab in tabs"
        :key="tab.id"
        role="tab"
        :aria-selected="activeTab === tab.id"
        :aria-controls="'tab-panel-' + tab.id"
        :id="'tab-btn-' + tab.id"
        class="pf-tab-btn"
        :data-active="activeTab === tab.id ? 'true' : 'false'"
        :tabindex="activeTab === tab.id ? 0 : -1"
        @click="activeTab = tab.id"
        @keydown="onTabKeydown($event, tab)"
      >{{ tab.label }}</button>
    </div>

    <!-- ── TAB PANELS (v-show preserva DOM/estado entre trocas de aba) ── -->
    <template v-if="!loadingPf && !pfError && pf">

    <!-- ── TAB: RESUMO ───────────────────────────────────────────── -->
    <div
      v-show="activeTab === 'resumo'"
      id="tab-panel-resumo"
      role="tabpanel"
      aria-labelledby="tab-btn-resumo"
      class="pf-panel"
    >
      <div class="pf-resumo-grid">
        <!-- Dados cadastrais -->
        <UiCard title="Dados Cadastrais">
          <template #actions>
            <UiButton variant="ghost" size="sm" :to="'/pf/' + route.params.id + '/edit'">Editar</UiButton>
          </template>
          <dl class="pf-dl">
            <div class="pf-dl-row">
              <dt>Nome Completo</dt>
              <dd>{{ pf.nome || '—' }}</dd>
            </div>
            <div class="pf-dl-row">
              <dt>CPF</dt>
              <dd>{{ pf.cpf || '—' }}</dd>
            </div>
            <div class="pf-dl-row">
              <dt>Data de Nascimento</dt>
              <dd>{{ pf.data_nascimento ? fmtDate(pf.data_nascimento) : '—' }}</dd>
            </div>
            <div class="pf-dl-row">
              <dt>Patrimônio Inicial</dt>
              <dd>{{ pf.patrimonio_inicial != null ? fmt(pf.patrimonio_inicial) : '—' }}</dd>
            </div>
            <div class="pf-dl-row pf-dl-full">
              <dt>Endereço</dt>
              <dd>{{ pf.endereco || '—' }}</dd>
            </div>
          </dl>
        </UiCard>

        <!-- Evolução patrimonial -->
        <UiCard title="Evolução Patrimonial" subtitle="Histórico do patrimônio líquido">
          <div v-if="loadingDash" class="chart-loading">
            <UiLoadingState variant="skeleton" :skeleton-lines="4" />
          </div>
          <div v-else-if="evolucao.length === 0" class="chart-empty">
            <UiEmptyState
              title="Sem dados de evolução"
              description="O histórico patrimonial aparecerá aqui quando disponível."
              icon="chart"
            />
          </div>
          <div v-else class="chart-wrap" aria-hidden="true">
            <!-- SVG bar chart — CSP-safe, sem lib externa, sem inline style -->
            <svg
              class="chart-svg"
              viewBox="0 0 400 120"
              aria-label="Gráfico de evolução patrimonial"
              role="img"
              preserveAspectRatio="none"
            >
              <g v-for="(point, i) in chartBars" :key="i">
                <rect
                  :x="point.x"
                  :y="point.y"
                  :width="point.w"
                  :height="point.h"
                  :class="point.tone === 'pos' ? 'chart-rect-pos' : 'chart-rect-neg'"
                  rx="2"
                />
                <text :x="point.x + point.w / 2" :y="115" class="chart-label-text" text-anchor="middle">{{ point.mes }}</text>
              </g>
            </svg>
            <!-- Legenda de valores abaixo -->
            <div class="chart-legend" aria-hidden="true">
              <span v-for="(point, i) in chartBars" :key="'lv' + i" class="chart-leg-val">{{ fmtShort(point.raw) }}</span>
            </div>
          </div>
        </UiCard>
      </div>
    </div>

    <!-- ── TAB: BENS E DÍVIDAS ───────────────────────────────────── -->
    <div
      v-show="activeTab === 'bens'"
      id="tab-panel-bens"
      role="tabpanel"
      aria-labelledby="tab-btn-bens"
      class="pf-panel"
    >
      <!-- Bens (Assets) -->
      <UiCard title="Bens" subtitle="Patrimônio ativo da pessoa física">
        <template #actions>
          <UiButton size="sm" @click="openAddAsset">+ Adicionar Bem</UiButton>
        </template>
        <UiDataTable
          :columns="assetsCols"
          :rows="assets.items.value"
          row-key="id"
          :loading="assets.loading.value"
          :error="assets.error.value"
          :empty="{ title: 'Nenhum bem cadastrado', description: 'Adicione bens para compor o patrimônio.' }"
          @retry="assets.load"
        >
          <template #cell-actions="{ row }">
            <UiButton variant="danger" size="sm" :loading="removingAssetId === row.id" @click="removeAsset(row)">Remover</UiButton>
          </template>
        </UiDataTable>
      </UiCard>

      <!-- Dívidas (Liabilities) -->
      <UiCard title="Dívidas" subtitle="Passivos e obrigações financeiras">
        <template #actions>
          <UiButton size="sm" @click="openAddLiability">+ Adicionar Dívida</UiButton>
        </template>
        <UiDataTable
          :columns="liabilitiesCols"
          :rows="liabilities.items.value"
          row-key="id"
          :loading="liabilities.loading.value"
          :error="liabilities.error.value"
          :empty="{ title: 'Nenhuma dívida cadastrada', description: 'Adicione passivos para análise completa.' }"
          @retry="liabilities.load"
        >
          <template #cell-actions="{ row }">
            <UiButton variant="danger" size="sm" :loading="removingLiabilityId === row.id" @click="removeLiability(row)">Remover</UiButton>
          </template>
        </UiDataTable>
      </UiCard>
    </div>

    <!-- ── TAB: RECEITAS E DESPESAS ──────────────────────────────── -->
    <div
      v-show="activeTab === 'receitas'"
      id="tab-panel-receitas"
      role="tabpanel"
      aria-labelledby="tab-btn-receitas"
      class="pf-panel"
    >
      <UiCard title="Receitas e Despesas" subtitle="Movimentações financeiras da pessoa física">
        <template #actions>
          <UiButton variant="ghost" size="sm" @click="incExp.load">Atualizar</UiButton>
        </template>
        <UiDataTable
          :columns="incExpCols"
          :rows="incExp.items.value"
          row-key="id"
          :loading="incExp.loading.value"
          :error="incExp.error.value"
          server-mode
          :sort="incExp.sort.value"
          :page="incExp.page.value"
          :page-size="incExp.pageSize.value"
          :total="incExp.total.value"
          paginated
          :empty="{ title: 'Sem movimentações', description: 'Nenhuma receita ou despesa registrada para esta pessoa.' }"
          @update:sort="incExp.setSort"
          @update:page="incExp.setPage"
          @retry="incExp.load"
        >
          <template #cell-tipo="{ value }">
            <UiStatusBadge :status="value" :label="value === 'receita' ? 'Receita' : 'Despesa'" />
          </template>
        </UiDataTable>
      </UiCard>
    </div>

    <!-- ── TAB: DOCUMENTOS ───────────────────────────────────────── -->
    <div
      v-show="activeTab === 'documentos'"
      id="tab-panel-documentos"
      role="tabpanel"
      aria-labelledby="tab-btn-documentos"
      class="pf-panel"
    >
      <UiCard title="Documentos" subtitle="Arquivos e documentos vinculados">
        <template #actions>
          <UiButton variant="ghost" size="sm" @click="docs.load">Atualizar</UiButton>
        </template>
        <UiDataTable
          :columns="docsCols"
          :rows="docs.items.value"
          row-key="id"
          :loading="docs.loading.value"
          :error="docs.error.value"
          :empty="{ title: 'Nenhum documento', description: 'Nenhum documento vinculado a esta pessoa física.' }"
          clickable-rows
          @row-click="openDoc"
          @retry="docs.load"
        >
          <template #cell-status="{ value }">
            <UiStatusBadge :status="value" />
          </template>
        </UiDataTable>
      </UiCard>
    </div>

    <!-- ── TAB: OBRIGAÇÕES FISCAIS ───────────────────────────────── -->
    <div
      v-show="activeTab === 'obrigacoes'"
      id="tab-panel-obrigacoes"
      role="tabpanel"
      aria-labelledby="tab-btn-obrigacoes"
      class="pf-panel"
    >
      <UiCard title="Obrigações Fiscais" subtitle="Declarações, impostos e obrigações tributárias">
        <template #actions>
          <UiButton variant="ghost" size="sm" @click="obrigacoes.load">Atualizar</UiButton>
        </template>
        <UiDataTable
          :columns="obrigacoesCols"
          :rows="obrigacoes.items.value"
          row-key="id"
          :loading="obrigacoes.loading.value"
          :error="obrigacoes.error.value"
          :empty="{ title: 'Nenhuma obrigação fiscal', description: 'Sem obrigações fiscais registradas para esta pessoa.' }"
          clickable-rows
          @row-click="openObrigacao"
          @retry="obrigacoes.load"
        >
          <template #cell-status="{ value }">
            <UiStatusBadge :status="value" />
          </template>
        </UiDataTable>
      </UiCard>
    </div>

    <!-- ── TAB: TAREFAS ──────────────────────────────────────────── -->
    <div
      v-show="activeTab === 'tarefas'"
      id="tab-panel-tarefas"
      role="tabpanel"
      aria-labelledby="tab-btn-tarefas"
      class="pf-panel"
    >
      <UiCard title="Tarefas" subtitle="Atividades e pendências vinculadas">
        <template #actions>
          <UiButton variant="ghost" size="sm" @click="tasks.load">Atualizar</UiButton>
        </template>
        <UiDataTable
          :columns="tasksCols"
          :rows="tasks.items.value"
          row-key="id"
          :loading="tasks.loading.value"
          :error="tasks.error.value"
          :empty="{ title: 'Nenhuma tarefa', description: 'Nenhuma tarefa associada a esta pessoa física.' }"
          @retry="tasks.load"
        >
          <template #cell-status="{ value }">
            <UiStatusBadge :status="value" />
          </template>
          <template #cell-priority="{ value }">
            <UiStatusBadge :status="value" />
          </template>
        </UiDataTable>
      </UiCard>
    </div>

    </template><!-- /v-if="!loadingPf && !pfError && pf" -->

    <!-- ── MODAL: Adicionar Bem ──────────────────────────────────── -->
    <UiModal :open="showAddAsset" title="Adicionar Bem" width="md" @update:open="showAddAsset = $event">
      <div class="modal-form">
        <UiFormSection title="Dados do Bem" :columns="2">
          <UiFormField label="Descrição" required :error="assetForm.errors.descricao">
            <template #default="{ id, describedBy }">
              <UiInput
                :id="id"
                :described-by="describedBy"
                type="text"
                :model-value="assetForm.values.descricao"
                placeholder="Ex: Imóvel residencial"
                :error="!!assetForm.errors.descricao"
                @update:model-value="assetForm.setField('descricao', $event)"
              />
            </template>
          </UiFormField>
          <UiFormField label="Tipo" required :error="assetForm.errors.tipo">
            <template #default="{ id, describedBy }">
              <!-- UiSelect não existe no kit — raw <select> com aria-invalid manual -->
              <select
                :id="id"
                :aria-describedby="describedBy"
                :aria-invalid="!!assetForm.errors.tipo ? 'true' : undefined"
                :value="assetForm.values.tipo"
                @change="assetForm.setField('tipo', $event.target.value)"
              >
                <option value="">Selecione...</option>
                <option value="imovel">Imóvel</option>
                <option value="veiculo">Veículo</option>
                <option value="investimento">Investimento</option>
                <option value="conta_bancaria">Conta Bancária</option>
                <option value="outros">Outros</option>
              </select>
            </template>
          </UiFormField>
          <UiFormField label="Valor (R$)" required :error="assetForm.errors.valor">
            <template #default="{ id, describedBy }">
              <UiInput
                :id="id"
                :described-by="describedBy"
                type="number"
                step="0.01"
                min="0"
                :model-value="assetForm.values.valor"
                placeholder="0,00"
                :error="!!assetForm.errors.valor"
                @update:model-value="assetForm.setField('valor', $event)"
              />
            </template>
          </UiFormField>
          <UiFormField label="Data de Aquisição" :error="assetForm.errors.data_aquisicao">
            <template #default="{ id, describedBy }">
              <UiInput
                :id="id"
                :described-by="describedBy"
                type="date"
                :model-value="assetForm.values.data_aquisicao"
                :error="!!assetForm.errors.data_aquisicao"
                @update:model-value="assetForm.setField('data_aquisicao', $event)"
              />
            </template>
          </UiFormField>
        </UiFormSection>
      </div>
      <template #footer>
        <UiButton variant="ghost" @click="showAddAsset = false">Cancelar</UiButton>
        <UiButton :loading="assetForm.submitting.value" @click="submitAsset">Adicionar Bem</UiButton>
      </template>
    </UiModal>

    <!-- ── MODAL: Adicionar Dívida ───────────────────────────────── -->
    <UiModal :open="showAddLiability" title="Adicionar Dívida" width="md" @update:open="showAddLiability = $event">
      <div class="modal-form">
        <UiFormSection title="Dados da Dívida" :columns="2">
          <UiFormField label="Descrição" required :error="liabilityForm.errors.descricao">
            <template #default="{ id, describedBy }">
              <UiInput
                :id="id"
                :described-by="describedBy"
                type="text"
                :model-value="liabilityForm.values.descricao"
                placeholder="Ex: Financiamento imobiliário"
                :error="!!liabilityForm.errors.descricao"
                @update:model-value="liabilityForm.setField('descricao', $event)"
              />
            </template>
          </UiFormField>
          <UiFormField label="Tipo" required :error="liabilityForm.errors.tipo">
            <template #default="{ id, describedBy }">
              <!-- UiSelect não existe no kit — raw <select> com aria-invalid manual -->
              <select
                :id="id"
                :aria-describedby="describedBy"
                :aria-invalid="!!liabilityForm.errors.tipo ? 'true' : undefined"
                :value="liabilityForm.values.tipo"
                @change="liabilityForm.setField('tipo', $event.target.value)"
              >
                <option value="">Selecione...</option>
                <option value="emprestimo">Empréstimo</option>
                <option value="financiamento">Financiamento</option>
                <option value="cartao_credito">Cartão de Crédito</option>
                <option value="tributo">Tributo</option>
                <option value="outros">Outros</option>
              </select>
            </template>
          </UiFormField>
          <UiFormField label="Valor (R$)" required :error="liabilityForm.errors.valor">
            <template #default="{ id, describedBy }">
              <UiInput
                :id="id"
                :described-by="describedBy"
                type="number"
                step="0.01"
                min="0"
                :model-value="liabilityForm.values.valor"
                placeholder="0,00"
                :error="!!liabilityForm.errors.valor"
                @update:model-value="liabilityForm.setField('valor', $event)"
              />
            </template>
          </UiFormField>
          <UiFormField label="Vencimento" :error="liabilityForm.errors.data_vencimento">
            <template #default="{ id, describedBy }">
              <UiInput
                :id="id"
                :described-by="describedBy"
                type="date"
                :model-value="liabilityForm.values.data_vencimento"
                :error="!!liabilityForm.errors.data_vencimento"
                @update:model-value="liabilityForm.setField('data_vencimento', $event)"
              />
            </template>
          </UiFormField>
        </UiFormSection>
      </div>
      <template #footer>
        <UiButton variant="ghost" @click="showAddLiability = false">Cancelar</UiButton>
        <UiButton :loading="liabilityForm.submitting.value" @click="submitLiability">Adicionar Dívida</UiButton>
      </template>
    </UiModal>

    <!-- ── MODAL: Detalhe de Obrigação ──────────────────────────── -->
    <UiModal
      :open="!!selectedObrigacao"
      title="Obrigação Fiscal"
      width="md"
      @update:open="v => { if (!v) selectedObrigacao = null; }"
    >
      <div v-if="selectedObrigacao" class="obrig-detail">
        <div class="obrig-row">
          <span class="obrig-label">Tipo</span>
          <span>{{ selectedObrigacao.tipo || '—' }}</span>
        </div>
        <div class="obrig-row">
          <span class="obrig-label">Status</span>
          <UiStatusBadge :status="selectedObrigacao.status" />
        </div>
        <div class="obrig-row">
          <span class="obrig-label">Vencimento</span>
          <span>{{ selectedObrigacao.data_vencimento ? fmtDate(selectedObrigacao.data_vencimento) : '—' }}</span>
        </div>
        <div v-if="selectedObrigacao.valor_estimado != null" class="obrig-row">
          <span class="obrig-label">Valor estimado</span>
          <span>{{ fmt(selectedObrigacao.valor_estimado) }}</span>
        </div>
        <div v-if="selectedObrigacao.descricao" class="obrig-row">
          <span class="obrig-label">Descrição</span>
          <span>{{ selectedObrigacao.descricao }}</span>
        </div>
      </div>
      <template #footer>
        <UiButton variant="ghost" @click="selectedObrigacao = null">Fechar</UiButton>
      </template>
    </UiModal>

    <!-- ── MODAL: Detalhe de Documento ──────────────────────────── -->
    <UiModal
      :open="!!selectedDoc"
      title="Documento"
      width="md"
      @update:open="v => { if (!v) selectedDoc = null; }"
    >
      <div v-if="selectedDoc" class="obrig-detail">
        <div class="obrig-row">
          <span class="obrig-label">Tipo</span>
          <span>{{ selectedDoc.tipo || '—' }}</span>
        </div>
        <div class="obrig-row">
          <span class="obrig-label">Nome</span>
          <span>{{ selectedDoc.nome || selectedDoc.filename || '—' }}</span>
        </div>
        <div class="obrig-row">
          <span class="obrig-label">Status</span>
          <UiStatusBadge :status="selectedDoc.status" />
        </div>
        <div class="obrig-row">
          <span class="obrig-label">Data</span>
          <span>{{ selectedDoc.created_at ? fmtDate(selectedDoc.created_at) : '—' }}</span>
        </div>
        <div v-if="selectedDoc.descricao" class="obrig-row">
          <span class="obrig-label">Descrição</span>
          <span>{{ selectedDoc.descricao }}</span>
        </div>
      </div>
      <template #footer>
        <UiButton variant="ghost" @click="selectedDoc = null">Fechar</UiButton>
        <UiButton v-if="selectedDoc?.url" :href="selectedDoc.url" target="_blank" variant="ghost">Abrir arquivo</UiButton>
      </template>
    </UiModal>
  </UiPageLayout>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import {
  UiPageLayout, UiCard, UiMetricCard, UiDataTable, UiButton,
  UiModal, UiFormField, UiFormSection, UiStatusBadge,
  UiEmptyState, UiLoadingState, UiInput,
  useResource, useToast, useConfirm, useForm, validators, format,
} from '../ui/index.js';
import { resourceFactory, request, qs } from '../api.js';

// ── Rota ──────────────────────────────────────────────────────────
const route = useRoute();
const pfId = computed(() => route.params.id);

// ── Toast / Confirm ───────────────────────────────────────────────
const toast = useToast();
const ask = useConfirm();

// ── API resources ─────────────────────────────────────────────────
const pfApi = resourceFactory('pf');

// ── PF (detalhe) ──────────────────────────────────────────────────
const pf = ref(null);
const loadingPf = ref(true);
const pfError = ref(null);

const pfName = computed(() => pf.value?.nome || 'Pessoa Física');
const pfCpf = computed(() => pf.value?.cpf || '');

async function loadPf() {
  loadingPf.value = true;
  pfError.value = null;
  try {
    pf.value = await pfApi.get(pfId.value);
  } catch (e) {
    pfError.value = e;
  } finally {
    loadingPf.value = false;
  }
}

// ── Dashboard PF ──────────────────────────────────────────────────
const dashboard = ref(null);
const loadingDash = ref(false);

const evolucao = computed(() => dashboard.value?.patrimonio?.evolucao || []);

async function loadDashboard() {
  loadingDash.value = true;
  try {
    const data = await request('GET', '/v1/dashboard/pf/' + pfId.value);
    dashboard.value = data;
  } catch {
    // não bloqueia a tela — apenas sem gráfico
  } finally {
    loadingDash.value = false;
  }
}

// ── Assets (Bens) ─────────────────────────────────────────────────
const assetsApiForPf = {
  list: () => request('GET', '/v1/pf/' + pfId.value + '/assets').then(d => Array.isArray(d) ? { data: d, total: d.length } : d),
  create: (body) => request('POST', '/v1/pf/' + pfId.value + '/assets', body),
  remove: (assetId) => request('DELETE', '/v1/pf/' + pfId.value + '/assets/' + assetId),
};
const assets = useResource(assetsApiForPf);
const removingAssetId = ref(null);

const assetsCols = [
  { key: 'descricao', label: 'Descrição', sortable: true },
  { key: 'tipo', label: 'Tipo' },
  { key: 'valor', label: 'Valor', align: 'right', format: 'currency' },
  { key: 'data_aquisicao', label: 'Aquisição', format: 'date' },
  { key: 'actions', label: '', align: 'right' },
];

const showAddAsset = ref(false);
const assetForm = useForm({
  initial: { descricao: '', tipo: '', valor: '', data_aquisicao: '' },
  rules: {
    descricao: [validators.required()],
    tipo: [validators.required()],
    valor: [validators.required(), validators.numeric()],
  },
});

function openAddAsset() {
  assetForm.reset();
  showAddAsset.value = true;
}

async function submitAsset() {
  await assetForm.handleSubmit(async (values) => {
    try {
      await assetsApiForPf.create({ ...values, valor: Number(values.valor) });
      showAddAsset.value = false;
      toast.success('Bem adicionado com sucesso.');
      await assets.load();
      loadDashboard();
    } catch (e) {
      toast.error('Erro ao adicionar bem.', { detail: e.message });
    }
  });
}

async function removeAsset(row) {
  const ok = await ask({
    title: 'Remover Bem',
    message: 'Deseja remover o bem "' + (row.descricao || 'sem descrição') + '"? Esta ação não pode ser desfeita.',
    danger: true,
    confirmLabel: 'Remover',
  });
  if (!ok) return;
  removingAssetId.value = row.id;
  try {
    await assetsApiForPf.remove(row.id);
    toast.success('Bem removido.');
    await assets.load();
    loadDashboard();
  } catch (e) {
    toast.error('Erro ao remover bem.', { detail: e.message });
  } finally {
    removingAssetId.value = null;
  }
}

// ── Liabilities (Dívidas) ─────────────────────────────────────────
const liabilitiesApiForPf = {
  list: () => request('GET', '/v1/pf/' + pfId.value + '/liabilities').then(d => Array.isArray(d) ? { data: d, total: d.length } : d),
  create: (body) => request('POST', '/v1/pf/' + pfId.value + '/liabilities', body),
  remove: (liabilityId) => request('DELETE', '/v1/pf/' + pfId.value + '/liabilities/' + liabilityId),
};
const liabilities = useResource(liabilitiesApiForPf);
const removingLiabilityId = ref(null);

const liabilitiesCols = [
  { key: 'descricao', label: 'Descrição', sortable: true },
  { key: 'tipo', label: 'Tipo' },
  { key: 'valor', label: 'Valor', align: 'right', format: 'currency' },
  { key: 'data_vencimento', label: 'Vencimento', format: 'date' },
  { key: 'actions', label: '', align: 'right' },
];

const showAddLiability = ref(false);
const liabilityForm = useForm({
  initial: { descricao: '', tipo: '', valor: '', data_vencimento: '' },
  rules: {
    descricao: [validators.required()],
    tipo: [validators.required()],
    valor: [validators.required(), validators.numeric()],
  },
});

function openAddLiability() {
  liabilityForm.reset();
  showAddLiability.value = true;
}

async function submitLiability() {
  await liabilityForm.handleSubmit(async (values) => {
    try {
      await liabilitiesApiForPf.create({ ...values, valor: Number(values.valor) });
      showAddLiability.value = false;
      toast.success('Dívida adicionada com sucesso.');
      await liabilities.load();
      loadDashboard();
    } catch (e) {
      toast.error('Erro ao adicionar dívida.', { detail: e.message });
    }
  });
}

async function removeLiability(row) {
  const ok = await ask({
    title: 'Remover Dívida',
    message: 'Deseja remover a dívida "' + (row.descricao || 'sem descrição') + '"? Esta ação não pode ser desfeita.',
    danger: true,
    confirmLabel: 'Remover',
  });
  if (!ok) return;
  removingLiabilityId.value = row.id;
  try {
    await liabilitiesApiForPf.remove(row.id);
    toast.success('Dívida removida.');
    await liabilities.load();
    loadDashboard();
  } catch (e) {
    toast.error('Erro ao remover dívida.', { detail: e.message });
  } finally {
    removingLiabilityId.value = null;
  }
}

// ── Receitas e Despesas ───────────────────────────────────────────
const incExpApi = {
  list: (params) => {
    return request('GET', '/v1/income-expenses' + qs({ entity_type: 'pf', entity_id: pfId.value, ...params }))
      .then(d => Array.isArray(d) ? { data: d, total: d.length } : d);
  },
};
const incExp = useResource(incExpApi);

const incExpCols = [
  { key: 'descricao', label: 'Descrição', sortable: true },
  { key: 'tipo', label: 'Tipo' },
  { key: 'valor', label: 'Valor', align: 'right', format: 'currency' },
  { key: 'data', label: 'Data', format: 'date', sortable: true },
  { key: 'categoria', label: 'Categoria' },
];

// ── Documentos ────────────────────────────────────────────────────
const docsApi = {
  list: (params) => {
    return request('GET', '/v1/documents' + qs({ entity_type: 'pf', entity_id: pfId.value, ...params }))
      .then(d => Array.isArray(d) ? { data: d, total: d.length } : d);
  },
};
const docs = useResource(docsApi);
const selectedDoc = ref(null);

const docsCols = [
  { key: 'tipo', label: 'Tipo' },
  { key: 'nome', label: 'Nome/Arquivo' },
  { key: 'status', label: 'Status' },
  { key: 'created_at', label: 'Data', format: 'date' },
];

function openDoc(row) {
  selectedDoc.value = row;
}

// ── Obrigações Fiscais ────────────────────────────────────────────
const obrigacoesApi = {
  list: (params) => {
    return request('GET', '/v1/fiscal-obligations' + qs({ entidade_tipo: 'PF', entidade_id: pfId.value, ...params }))
      .then(d => Array.isArray(d) ? { data: d, total: d.length } : d);
  },
};
const obrigacoes = useResource(obrigacoesApi);
const selectedObrigacao = ref(null);

const obrigacoesCols = [
  { key: 'tipo', label: 'Tipo', sortable: true },
  { key: 'status', label: 'Status' },
  { key: 'data_vencimento', label: 'Vencimento', format: 'date', sortable: true },
  { key: 'valor_estimado', label: 'Valor est.', align: 'right', format: 'currency' },
];

function openObrigacao(row) {
  selectedObrigacao.value = row;
}

// ── Tarefas ───────────────────────────────────────────────────────
const tasksApi = {
  list: (params) => {
    return request('GET', '/v1/tasks' + qs({ entity_type: 'pf', entity_id: pfId.value, ...params }))
      .then(d => Array.isArray(d) ? { data: d, total: d.length } : d);
  },
};
const tasks = useResource(tasksApi);

const tasksCols = [
  { key: 'title', label: 'Tarefa', sortable: true },
  { key: 'status', label: 'Status' },
  { key: 'priority', label: 'Prioridade' },
  { key: 'due_at', label: 'Prazo', format: 'date', sortable: true },
  { key: 'assigned_to', label: 'Responsável' },
];

// ── Tabs ──────────────────────────────────────────────────────────
const tabs = [
  { id: 'resumo', label: 'Resumo' },
  { id: 'bens', label: 'Bens e Dívidas' },
  { id: 'receitas', label: 'Receitas e Despesas' },
  { id: 'documentos', label: 'Documentos' },
  { id: 'obrigacoes', label: 'Obrigações Fiscais' },
  { id: 'tarefas', label: 'Tarefas' },
];
const activeTab = ref('resumo');

function onTabKeydown(e, tab) {
  const idx = tabs.findIndex(t => t.id === tab.id);
  if (e.key === 'ArrowRight') {
    e.preventDefault();
    const next = tabs[(idx + 1) % tabs.length];
    activeTab.value = next.id;
    document.getElementById('tab-btn-' + next.id)?.focus();
  } else if (e.key === 'ArrowLeft') {
    e.preventDefault();
    const prev = tabs[(idx - 1 + tabs.length) % tabs.length];
    activeTab.value = prev.id;
    document.getElementById('tab-btn-' + prev.id)?.focus();
  }
}

// ── Formatadores ──────────────────────────────────────────────────
const fmt = (v) => format.formatCurrency(v);
const fmtDate = (v) => format.formatDate(v);
const fmtShort = (v) => {
  const n = Number(v);
  if (!isFinite(n)) return '—';
  if (Math.abs(n) >= 1_000_000) return 'R$ ' + (n / 1_000_000).toFixed(1) + 'M';
  if (Math.abs(n) >= 1_000) return 'R$ ' + (n / 1_000).toFixed(0) + 'k';
  return format.formatCurrency(n);
};

// ── Chart helpers ─────────────────────────────────────────────────
const chartBars = computed(() => {
  const data = evolucao.value;
  if (!data.length) return [];
  const max = Math.max(...data.map(e => Math.abs(e.total || 0)), 1);
  const svgW = 400;
  const svgH = 100; // usable bar height (viewBox 120, last 20 for labels)
  const barW = Math.floor((svgW - (data.length + 1) * 4) / data.length);
  return data.map((point, i) => {
    const frac = Math.abs(point.total || 0) / max;
    const h = Math.max(2, Math.round(frac * svgH));
    const x = 4 + i * (barW + 4);
    const y = svgH - h;
    return {
      x, y, w: barW, h,
      tone: (point.total || 0) >= 0 ? 'pos' : 'neg',
      mes: String(point.mes || '').slice(0, 3),
      raw: point.total,
    };
  });
});

// ── Mount ─────────────────────────────────────────────────────────
onMounted(async () => {
  await loadPf();
  if (!pfError.value) {
    loadDashboard();
    assets.load();
    liabilities.load();
    incExp.load();
    docs.load();
    obrigacoes.load();
    tasks.load();
  }
});
</script>

<style scoped>
/* ── Metrics strip ───────────────────────────────────────────────── */
.pf-metrics {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: var(--ui-space-4);
}

/* ── Tab bar ─────────────────────────────────────────────────────── */
.pf-tabs {
  display: flex;
  gap: 2px;
  border-bottom: 2px solid rgb(var(--ui-border));
  overflow-x: auto;
  scrollbar-width: thin;
  scrollbar-color: rgb(var(--ui-border)) transparent;
}

.pf-tab-btn {
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
  transition: color 0.15s, border-color 0.15s;
  border-radius: var(--ui-radius-sm) var(--ui-radius-sm) 0 0;
}

.pf-tab-btn:hover {
  color: rgb(var(--ui-fg));
  background: rgb(var(--ui-surface-2));
}

.pf-tab-btn:focus-visible {
  outline: 2px solid rgb(var(--ui-accent));
  outline-offset: -2px;
}

.pf-tab-btn[data-active="true"] {
  color: rgb(var(--ui-accent-strong));
  border-bottom-color: rgb(var(--ui-accent));
  font-weight: 600;
}

/* ── Tab panels ──────────────────────────────────────────────────── */
.pf-panel {
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-4);
}

/* ── Resumo grid ─────────────────────────────────────────────────── */
.pf-resumo-grid {
  display: grid;
  grid-template-columns: 1fr 2fr;
  gap: var(--ui-space-4);
  align-items: start;
}

@media (max-width: 860px) {
  .pf-resumo-grid {
    grid-template-columns: 1fr;
  }
  .pf-metrics {
    grid-template-columns: 1fr 1fr;
  }
}

@media (max-width: 480px) {
  .pf-metrics {
    grid-template-columns: 1fr;
  }
}

/* ── Definition list ─────────────────────────────────────────────── */
.pf-dl {
  display: flex;
  flex-direction: column;
  gap: 0;
  margin: 0;
}

.pf-dl-row {
  display: grid;
  grid-template-columns: 160px 1fr;
  gap: var(--ui-space-3);
  padding: var(--ui-space-3) 0;
  border-bottom: 1px solid rgb(var(--ui-border));
  align-items: baseline;
}

.pf-dl-row:last-child {
  border-bottom: none;
}

.pf-dl-row.pf-dl-full {
  grid-template-columns: 160px 1fr;
}

.pf-dl dt {
  color: rgb(var(--ui-muted));
  font-size: var(--ui-text-sm);
  font-weight: 500;
}

.pf-dl dd {
  margin: 0;
  font-size: var(--ui-text-sm);
  color: rgb(var(--ui-fg));
  word-break: break-word;
}

/* ── Chart ───────────────────────────────────────────────────────── */
.chart-loading {
  padding: var(--ui-space-4) 0;
}

.chart-empty {
  padding: var(--ui-space-4) 0;
}

.chart-wrap {
  padding: var(--ui-space-2) 0;
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-2);
}

.chart-svg {
  width: 100%;
  /* sem height fixo — viewBox + preserveAspectRatio controlam a proporção */
  overflow: visible;
  display: block;
}

.chart-rect-pos {
  fill: rgb(var(--ui-accent));
  opacity: 0.85;
}

.chart-rect-neg {
  fill: rgb(var(--ui-danger));
  opacity: 0.85;
}

.chart-label-text {
  font-size: var(--ui-text-xs);
  fill: rgb(var(--ui-muted));
  font-family: var(--ui-font-sans, sans-serif);
}

.chart-legend {
  display: flex;
  gap: var(--ui-space-1);
  justify-content: space-around;
}

.chart-leg-val {
  font-size: var(--ui-text-xs);
  color: rgb(var(--ui-muted));
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex: 1;
  text-align: center;
}

/* ── Form inputs (modal) ─────────────────────────────────────────── */
.modal-form {
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-4);
}
/* inputs de texto/número/data: UiInput do kit (ui/components/UiInput.vue) */
/* selects: elemento nativo sem classe ad-hoc — estilo padrão do browser */

/* ── Obrigação/Documento detalhe ─────────────────────────────────── */
.obrig-detail {
  display: flex;
  flex-direction: column;
  gap: 0;
}

.obrig-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: var(--ui-space-3) 0;
  border-bottom: 1px solid rgb(var(--ui-border));
  gap: var(--ui-space-3);
}

.obrig-row:last-child {
  border-bottom: none;
}

.obrig-label {
  color: rgb(var(--ui-muted));
  font-size: var(--ui-text-sm);
  font-weight: 500;
  flex-shrink: 0;
}
</style>
