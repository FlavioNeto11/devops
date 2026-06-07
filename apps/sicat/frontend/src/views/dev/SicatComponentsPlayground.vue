<script setup>
import { ref } from 'vue';
import SicatPageLayout from '../../components/sicat/SicatPageLayout.vue';
import SicatCard from '../../components/sicat/SicatCard.vue';
import SicatStatusBadge from '../../components/sicat/SicatStatusBadge.vue';
import SicatLoadingState from '../../components/sicat/SicatLoadingState.vue';
import SicatEmptyState from '../../components/sicat/SicatEmptyState.vue';
import SicatErrorState from '../../components/sicat/SicatErrorState.vue';
import SicatConfirmDialog from '../../components/sicat/SicatConfirmDialog.vue';
import SicatDataTable from '../../components/sicat/SicatDataTable.vue';
import SicatFiltersPanel from '../../components/sicat/SicatFiltersPanel.vue';
import SicatActionBar from '../../components/sicat/SicatActionBar.vue';
import SicatFormSection from '../../components/sicat/SicatFormSection.vue';
import SicatFormField from '../../components/sicat/SicatFormField.vue';
import SicatSearchInput from '../../components/sicat/SicatSearchInput.vue';
import SicatMetricCard from '../../components/sicat/SicatMetricCard.vue';
import SicatStatusTimeline from '../../components/sicat/SicatStatusTimeline.vue';
import SicatPageHeader from '../../components/shell/SicatPageHeader.vue';
import { useNotification } from '../../composables/useNotification.js';
import { useConfirmDialog } from '../../composables/useConfirmDialog.js';

const notify = useNotification();
const {
  dialogVisible,
  dialogTitle,
  dialogMessage,
  dialogConfirmLabel,
  dialogCancelLabel,
  dialogDanger,
  dialogShowCancel,
  confirm,
  accept,
  cancel
} = useConfirmDialog();

const lastConfirmResult = ref(null);

async function demoConfirm() {
  const result = await confirm({
    title: 'Cancelar manifesto?',
    message: 'Esta ação é irreversível. O MTR não poderá ser reaberto depois.',
    confirmLabel: 'Cancelar MTR',
    cancelLabel: 'Manter',
    danger: true
  });
  lastConfirmResult.value = result ? 'Confirmado' : 'Cancelado';
}

const manifestStatuses = ['draft', 'queued_submit', 'processing', 'submitted', 'received', 'cancelled', 'failed'];
const jobStatuses = ['queued', 'running', 'retry_wait', 'succeeded', 'failed', 'dlq', 'cancelled'];
const cdfStatuses = ['pending', 'generating', 'ready', 'downloaded', 'failed', 'cancelled'];
const dmrStatuses = ['draft', 'pending_review', 'consolidating', 'submitted', 'failed_validation', 'failed_remote'];
const accountHealthStatuses = ['authenticated', 'degraded', 'expiring', 'expired', 'error', 'unknown'];

const tableHeaders = [
  { title: 'Número', key: 'number' },
  { title: 'Transportador', key: 'carrier' },
  { title: 'Status', key: 'status' },
  { title: 'Ações', key: 'actions', align: 'end', sortable: false }
];
const tableItems = [
  { id: 1, number: 'MTR-1001', carrier: 'Transmares Ltda', status: 'submitted' },
  { id: 2, number: 'MTR-1002', carrier: 'EcoLog SA', status: 'processing' },
  { id: 3, number: 'MTR-1003', carrier: 'Verde Transporte', status: 'failed' }
];
const tableSelected = ref([]);
const searchValue = ref('');
const demoFilters = ref([
  { key: 'status', label: 'Status: Falhou' },
  { key: 'periodo', label: 'Período: últimos 30 dias' }
]);

const timelineSteps = [
  { title: 'Rascunho criado', timestamp: '28/05 09:12', state: 'done' },
  { title: 'Enviado à CETESB', timestamp: '28/05 09:13', state: 'done' },
  { title: 'Processando', timestamp: '28/05 09:14', state: 'current' },
  { title: 'Concluído', state: 'pending' }
];

function removeDemoFilter(key) {
  demoFilters.value = demoFilters.value.filter((f) => f.key !== key);
}
</script>

<template>
  <SicatPageLayout>
    <template #header>
      <SicatPageHeader
        title="Sicat Components Playground"
        kicker="Design System · DEV"
        description="Visualize todos os componentes do design system Sicat com suas variantes. Uso interno para validação de UI."
        compact
      />
    </template>

    <section class="playground-section">
      <h2 class="playground-section__title">SicatStatusBadge</h2>
      <p class="playground-section__hint">Domínio: manifest</p>
      <div class="playground-row">
        <SicatStatusBadge v-for="status in manifestStatuses" :key="status" :status="status" domain="manifest" with-dot />
      </div>

      <p class="playground-section__hint">Domínio: job</p>
      <div class="playground-row">
        <SicatStatusBadge v-for="status in jobStatuses" :key="status" :status="status" domain="job" with-dot />
      </div>

      <p class="playground-section__hint">Domínio: cdf</p>
      <div class="playground-row">
        <SicatStatusBadge v-for="status in cdfStatuses" :key="status" :status="status" domain="cdf" with-dot />
      </div>

      <p class="playground-section__hint">Domínio: dmr</p>
      <div class="playground-row">
        <SicatStatusBadge v-for="status in dmrStatuses" :key="status" :status="status" domain="dmr" with-dot />
      </div>

      <p class="playground-section__hint">Domínio: account-health</p>
      <div class="playground-row">
        <SicatStatusBadge v-for="status in accountHealthStatuses" :key="status" :status="status" domain="account-health" with-dot />
      </div>

      <p class="playground-section__hint">Tamanhos: sm / md / lg</p>
      <div class="playground-row">
        <SicatStatusBadge status="submitted" domain="manifest" size="sm" />
        <SicatStatusBadge status="submitted" domain="manifest" size="md" />
        <SicatStatusBadge status="submitted" domain="manifest" size="lg" />
      </div>
    </section>

    <section class="playground-section">
      <h2 class="playground-section__title">SicatCard</h2>
      <div class="playground-grid">
        <SicatCard title="Card padrão" subtitle="Variante default" icon="mdi-file-document-outline">
          <p>Corpo do card. Padding 24, sombra sm, hover-se eleva.</p>
          <template #actions>
            <v-btn color="primary" variant="flat">Ação primária</v-btn>
            <v-btn variant="text">Cancelar</v-btn>
          </template>
        </SicatCard>

        <SicatCard variant="glass" title="Variante glass" subtitle="Background com gradient + blur" icon="mdi-glass-cocktail">
          <p>Útil para dashboards e landing.</p>
        </SicatCard>

        <SicatCard variant="metric" title="Variante metric" subtitle="Compacta para KPIs" icon="mdi-chart-line">
          <p class="playground-metric">128</p>
          <template #footer>vs. 92 ontem (+39%)</template>
        </SicatCard>

        <SicatCard variant="system" title="Variante system" subtitle="Para telas SRE/admin" icon="mdi-shield-search-outline">
          <p>Borda warning para sinalizar contexto técnico.</p>
        </SicatCard>

        <SicatCard title="Clicável" subtitle="role=button, focusable" icon="mdi-cursor-default-click-outline" clickable @click="notify.info('Card clicado!')">
          <p>Clique ou Tab+Enter para acionar.</p>
        </SicatCard>

        <SicatCard title="Dense" subtitle="Padding compacto" icon="mdi-arrow-collapse-vertical" dense>
          <p>Útil para listas verticais densas.</p>
        </SicatCard>
      </div>
    </section>

    <section class="playground-section">
      <h2 class="playground-section__title">SicatLoadingState / EmptyState / ErrorState</h2>
      <div class="playground-grid">
        <SicatCard title="Loading — spinner" flush-body>
          <SicatLoadingState title="Carregando manifestos…" description="Sincronizando com CETESB." />
        </SicatCard>
        <SicatCard title="Loading — skeleton" flush-body>
          <SicatLoadingState variant="skeleton" title="" :skeleton-lines="4" />
        </SicatCard>
        <SicatCard title="Loading — progress linear" flush-body>
          <SicatLoadingState variant="progress" title="Importando arquivo CSV…" />
        </SicatCard>
        <SicatCard title="Loading — compact" flush-body>
          <SicatLoadingState compact title="Atualizando…" />
        </SicatCard>
        <SicatCard title="Empty padrão" flush-body>
          <SicatEmptyState title="Nenhum MTR encontrado" description="Ajuste os filtros ou emita um novo MTR para começar.">
            <template #actions>
              <v-btn color="primary" variant="flat" prepend-icon="mdi-plus">Emitir MTR</v-btn>
            </template>
          </SicatEmptyState>
        </SicatCard>
        <SicatCard title="Empty compact" flush-body>
          <SicatEmptyState compact title="Sem resultados" description="" />
        </SicatCard>
        <SicatCard title="Error completo" flush-body>
          <SicatErrorState
            title="Falha ao gerar CDF"
            message="O CETESB não respondeu em tempo hábil. Tentaremos novamente automaticamente."
            code="CDF_TIMEOUT · corr=abc-123"
            detail="Job 4521 expirou após 30s."
            retryable
            @retry="notify.info('Retry acionado')"
          />
        </SicatCard>
        <SicatCard title="Error compact" flush-body>
          <SicatErrorState compact message="Falha ao carregar lista. Verifique conexão." />
        </SicatCard>
      </div>
    </section>

    <section class="playground-section">
      <h2 class="playground-section__title">SicatSnackbar via useNotification()</h2>
      <p class="playground-section__hint">Cada botão dispara um toast. Stack máx 3, error não fecha sozinho.</p>
      <div class="playground-row">
        <v-btn color="success" variant="tonal" @click="notify.success('MTR emitido com sucesso.')">success</v-btn>
        <v-btn color="info" variant="tonal" @click="notify.info('Job 4521 enfileirado.', { code: 'JOB-4521' })">info</v-btn>
        <v-btn color="warning" variant="tonal" @click="notify.warning('Conta CETESB expira em 3 dias.', { actionLabel: 'Renovar', onAction: () => notify.success('Renovação enviada') })">warning + ação</v-btn>
        <v-btn color="error" variant="tonal" @click="notify.error('Falha ao gerar CDF', { detail: 'Tempo esgotado.', code: 'CDF_TIMEOUT' })">error (manual close)</v-btn>
        <v-btn variant="outlined" @click="notify.dismissAll()">Fechar todos</v-btn>
      </div>
    </section>

    <section class="playground-section">
      <h2 class="playground-section__title">SicatConfirmDialog via useConfirmDialog()</h2>
      <div class="playground-row">
        <v-btn color="error" variant="tonal" @click="demoConfirm">Abrir dialog destrutivo</v-btn>
        <span v-if="lastConfirmResult" class="playground-section__hint">Último resultado: {{ lastConfirmResult }}</span>
      </div>
    </section>

    <section class="playground-section">
      <h2 class="playground-section__title">SicatMetricCard</h2>
      <div class="playground-grid">
        <SicatMetricCard label="MTRs hoje" :value="128" icon="mdi-file-document-outline" tone="primary" :trend="39" hint="vs. 92 ontem" />
        <SicatMetricCard label="Pendências" :value="7" icon="mdi-clock-alert-outline" tone="warning" hint="aguardando ação" clickable @click="notify.info('Abrir pendências')" />
        <SicatMetricCard label="Falhas (24h)" :value="3" icon="mdi-alert-circle-outline" tone="error" :trend="-12" />
        <SicatMetricCard label="Carregando" value="—" icon="mdi-sync" tone="running" loading />
      </div>
    </section>

    <section class="playground-section">
      <h2 class="playground-section__title">SicatSearchInput + SicatFiltersPanel</h2>
      <SicatSearchInput v-model="searchValue" placeholder="Buscar por número, transportador…" />
      <p class="playground-section__hint">Valor (debounced): "{{ searchValue }}"</p>
      <SicatFiltersPanel
        :active-chips="demoFilters"
        @remove="removeDemoFilter"
        @clear="demoFilters = []"
        @apply="notify.success('Filtros aplicados')"
      >
        <v-select label="Status" :items="['Todos', 'Enviado', 'Falhou']" density="comfortable" variant="outlined" hide-details="auto" />
        <v-text-field label="Data inicial" type="date" density="comfortable" variant="outlined" hide-details="auto" />
        <v-text-field label="Data final" type="date" density="comfortable" variant="outlined" hide-details="auto" />
      </SicatFiltersPanel>
    </section>

    <section class="playground-section">
      <h2 class="playground-section__title">SicatActionBar</h2>
      <SicatActionBar :selection-count="tableSelected.length" @clear-selection="tableSelected = []">
        <template #lead><span>3 manifestos</span></template>
        <template #secondary><v-btn variant="text">Exportar</v-btn></template>
        <template #primary><v-btn color="primary" variant="flat" prepend-icon="mdi-plus">Emitir MTR</v-btn></template>
        <template #selection>
          <v-btn color="error" variant="tonal" size="small">Cancelar selecionados</v-btn>
        </template>
      </SicatActionBar>
      <p class="playground-section__hint">Selecione linhas na tabela abaixo para ver o modo seleção.</p>
    </section>

    <section class="playground-section">
      <h2 class="playground-section__title">SicatDataTable</h2>
      <SicatDataTable
        v-model:selected="tableSelected"
        :headers="tableHeaders"
        :items="tableItems"
        selectable
        :empty="{ title: 'Nenhum MTR', description: 'Ajuste os filtros.' }"
      >
        <template #[`item.status`]="{ item }">
          <SicatStatusBadge :status="item.status" domain="manifest" with-dot />
        </template>
        <template #[`item.actions`]="{ item }">
          <v-btn variant="text" size="small" @click="notify.info(`Abrir ${item.number}`)">Detalhar</v-btn>
        </template>
      </SicatDataTable>
    </section>

    <section class="playground-section">
      <h2 class="playground-section__title">SicatFormSection + SicatFormField</h2>
      <SicatFormSection title="Dados do gerador" description="Identifique a origem do resíduo." :step="1" required>
        <SicatFormField label="Razão social" required>
          <template #default="{ id }">
            <v-text-field :id="id" density="comfortable" variant="outlined" hide-details="auto" placeholder="Empresa Geradora Ltda" />
          </template>
        </SicatFormField>
        <SicatFormField label="CNPJ" required hint="Apenas números">
          <template #default="{ id }">
            <v-text-field :id="id" density="comfortable" variant="outlined" hide-details="auto" placeholder="00.000.000/0001-00" />
          </template>
        </SicatFormField>
        <SicatFormField label="E-mail" error="E-mail inválido">
          <template #default="{ id, hasError }">
            <v-text-field :id="id" :error="hasError" density="comfortable" variant="outlined" hide-details="auto" />
          </template>
        </SicatFormField>
      </SicatFormSection>
    </section>

    <section class="playground-section">
      <h2 class="playground-section__title">SicatStatusTimeline</h2>
      <SicatCard title="MTR-1001" subtitle="Linha do tempo">
        <SicatStatusTimeline :steps="timelineSteps" />
      </SicatCard>
    </section>

    <SicatConfirmDialog
      :visible="dialogVisible"
      :title="dialogTitle"
      :message="dialogMessage"
      :confirm-label="dialogConfirmLabel"
      :cancel-label="dialogCancelLabel"
      :danger="dialogDanger"
      :show-cancel="dialogShowCancel"
      @confirm="accept"
      @cancel="cancel"
      @close="cancel"
    />
  </SicatPageLayout>
</template>

<style scoped>
.playground-section {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: var(--space-5) 0;
  border-bottom: 1px solid rgba(var(--v-border-color), 0.14);
}

.playground-section__title {
  margin: 0;
  font-size: 1.15rem;
  font-weight: 700;
  color: rgba(var(--v-theme-on-surface), 0.9);
}

.playground-section__hint {
  margin: 0;
  font-size: 0.85rem;
  color: rgba(var(--v-theme-on-surface), 0.58);
}

.playground-row {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
}

.playground-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: 16px;
}

.playground-metric {
  margin: 0;
  font-size: 2.4rem;
  font-weight: 800;
  color: rgba(var(--v-theme-on-surface), 0.92);
}
</style>
