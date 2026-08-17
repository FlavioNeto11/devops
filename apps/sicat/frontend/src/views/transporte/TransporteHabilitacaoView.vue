<script setup>
import { computed, onMounted, ref } from 'vue';
import { useAuthStore } from '../../stores/auth.js';
import { useTransportadoresStore } from '../../stores/transportadoresStore.js';
import { useConfirmDialog } from '../../composables/useConfirmDialog.js';
import { useNotification } from '../../composables/useNotification.js';
import { listTransportDrivers, listTransportVehicles } from '../../services/transporteService.js';
import {
  formatDateTimeBR,
  resolveInsurancePolicyStatus,
  rntrcCategoryLabel,
  rntrcStatusLabel,
  rntrcStrategyLabel
} from './transporteUiHelpers.js';
import {
  buildHabilitacaoChecklist,
  countHabilitacaoPending,
  describeTypology,
  isHabilitacaoComplete
} from './habilitacao-model.js';
import SicatPageLayout from '../../components/sicat/SicatPageLayout.vue';
import SicatPageHeader from '../../components/shell/SicatPageHeader.vue';
import SicatCard from '../../components/sicat/SicatCard.vue';
import SicatStatusBadge from '../../components/sicat/SicatStatusBadge.vue';
import SicatInlineAlert from '../../components/sicat/SicatInlineAlert.vue';
import SicatEmptyState from '../../components/sicat/SicatEmptyState.vue';
import SicatConfirmDialog from '../../components/sicat/SicatConfirmDialog.vue';
import SicatNextStep from '../../components/sicat/SicatNextStep.vue';
import SicatHelpHint from '../../components/sicat/SicatHelpHint.vue';

/**
 * "Minha habilitação" — a tela que FECHA a jornada do Transportador (onda F9,
 * REQ-SICAT-0037, com os derivados de REQ-SICAT-0033). Molde:
 * TransporteSegurosApuracaoView.vue (tela em seções, com destaque didático).
 *
 * A pergunta que ela responde é uma só: "posso rodar hoje?". Por isso não é
 * mais um CRUD — o cadastro do transportador continua vivendo em
 * `/transporte/transportadores` e NÃO é duplicado aqui. Esta tela consolida o
 * que já existe espalhado (RNTRC, frota, motoristas, apólice) na leitura do
 * operador, e a única ESCRITA que oferece é a verificação de RNTRC, porque é a
 * checagem que caduca sozinha com o tempo.
 *
 * Verificar agora usa a estratégia `open_data` (Portal de Dados Abertos da
 * ANTT): é integração externa e assíncrona, então passa por
 * `useConfirmDialog` — e o resultado é CACHE INFORMATIVO, nunca prova de
 * regularidade emitida pela ANTT (o texto do confirm diz isso). A verificação
 * MANUAL (evidência declarada por humano) tem formulário próprio no detalhe do
 * transportador; aqui só linkamos para lá, sem duplicar o formulário.
 */

const authStore = useAuthStore();
const store = useTransportadoresStore();
const notify = useNotification();
const {
  dialogVisible, dialogTitle, dialogMessage, dialogConfirmLabel, dialogCancelLabel,
  dialogDanger, dialogShowCancel, confirm, accept, cancel
} = useConfirmDialog();

const {
  filters, items, loadingList, listError,
  selected, loadingDetail,
  policies, loadingPolicies,
  commandLoading, commandError,
  fetchList, loadById, loadPolicies, verificarRntrc, syncContext
} = store;

/** Só o papel `carrier` é "minha transportadora" — as demais partes são terceiros. */
const selectedCarrierId = ref('');
const vehiclesCount = ref(0);
const driversCount = ref(0);
const loadingCounts = ref(false);

const carrierOptions = computed(() =>
  items.value.map((carrier) => ({
    value: carrier.id,
    label: carrier.tradeName ? `${carrier.legalName} (${carrier.tradeName})` : carrier.legalName
  }))
);

const carrier = computed(() => selected.value);
const hasCarrier = computed(() => Boolean(carrier.value?.id));

/** Vigente = a mesma leitura da tela de Apólices (helper puro, fonte única). */
const activePoliciesCount = computed(
  () => policies.value.filter((policy) => {
    const { status } = resolveInsurancePolicyStatus(policy);
    return status === 'valid' || status === 'expiring';
  }).length
);

const typology = computed(() => describeTypology(carrier.value));

const checklist = computed(() =>
  buildHabilitacaoChecklist({
    carrier: carrier.value,
    vehiclesCount: vehiclesCount.value,
    driversCount: driversCount.value,
    activePoliciesCount: activePoliciesCount.value
  })
);

const habilitacaoComplete = computed(() => isHabilitacaoComplete(checklist.value));
const pendingCount = computed(() => countHabilitacaoPending(checklist.value));

const checklistSummary = computed(() => {
  if (!hasCarrier.value) return '';
  if (habilitacaoComplete.value) return 'Tudo pronto para operar';
  return `${pendingCount.value} ${pendingCount.value === 1 ? 'item pendente' : 'itens pendentes'}`;
});

const rntrcVerifiedLabel = computed(() => {
  if (!carrier.value?.rntrcVerifiedAt) return 'Nunca verificado';
  return `${formatDateTimeBR(carrier.value.rntrcVerifiedAt)} · fonte: ${rntrcStrategyLabel(carrier.value.rntrcVerificationSource)}`;
});

const carrierDetailPath = computed(() =>
  hasCarrier.value ? `/transporte/transportadores/${encodeURIComponent(carrier.value.id)}` : '/transporte/transportadores'
);

/**
 * Contagens de frota e motoristas: `pageSize: 1` porque só o `total` interessa
 * (o contrato devolve `total` na lista) — payload mínimo, sem trazer cadastro
 * inteiro para contar. São da CONTA, não do transportador selecionado: é assim
 * que o backend recorta os dois cadastros (tenancy por integrationAccountId).
 */
async function loadCounts() {
  loadingCounts.value = true;
  try {
    const ctx = syncContext();
    const integrationAccountId = filters.integrationAccountId || ctx.integrationAccountId;
    const [vehiclesResponse, driversResponse] = await Promise.all([
      listTransportVehicles({ integrationAccountId, page: 1, pageSize: 1 }).catch(() => null),
      listTransportDrivers({ integrationAccountId, page: 1, pageSize: 1 }).catch(() => null)
    ]);
    vehiclesCount.value = Number(vehiclesResponse?.total ?? (vehiclesResponse?.items?.length || 0));
    driversCount.value = Number(driversResponse?.total ?? (driversResponse?.items?.length || 0));
  } finally {
    loadingCounts.value = false;
  }
}

async function selectCarrier(partyId) {
  selectedCarrierId.value = partyId;
  if (!partyId) return;
  await loadById(partyId);
  await loadPolicies(partyId);
}

async function handleVerifyRntrc() {
  if (!hasCarrier.value) return;
  const ok = await confirm({
    title: 'Verificar o RNTRC agora',
    message: 'Consulta o Portal de Dados Abertos da ANTT e registra o resultado na trilha deste transportador. '
      + 'O retorno é um CACHE INFORMATIVO com data de referência própria — não é certidão de regularidade emitida pela ANTT. '
      + 'A consulta roda em segundo plano e pode levar alguns instantes.',
    confirmLabel: 'Verificar agora'
  });
  if (!ok) return;
  try {
    await verificarRntrc({ strategy: 'open_data' });
    notify.success('Verificação de RNTRC concluída — situação atualizada.');
    await loadPolicies(selectedCarrierId.value);
  } catch {
    notify.error(commandError.value || 'Não foi possível verificar o RNTRC agora.');
  }
}

onMounted(async () => {
  // `role: 'carrier'` é o recorte de "minha transportadora": o mesmo cadastro
  // guarda embarcadores, consignatários e motoristas PF da conta.
  filters.role = 'carrier';
  filters.pageSize = 50;
  await Promise.all([fetchList(), loadCounts()]);
  if (items.value.length > 0) {
    await selectCarrier(items.value[0].id);
  }
});
</script>

<template>
  <SicatPageLayout>
    <template #header>
      <SicatPageHeader
        kicker="Transporte · Habilitação"
        title="Minha habilitação"
        description="A prova de que a transportadora pode rodar: RNTRC regular, tipologia derivada da frota e o que ainda falta para operar."
      >
        <template #actions>
          <v-btn variant="text" :loading="loadingList" prepend-icon="mdi-refresh" @click="fetchList">
            Atualizar
          </v-btn>
        </template>
      </SicatPageHeader>
    </template>

    <template #banner>
      <SicatInlineAlert
        v-if="!authStore.hasActiveCetesbAccount.value"
        tone="warning"
        message="Selecione uma conta para ver a habilitação da transportadora."
      />
      <SicatInlineAlert v-else-if="listError" tone="error" :message="listError">
        <template #actions>
          <v-btn size="small" variant="text" :loading="loadingList" @click="fetchList">Tentar novamente</v-btn>
        </template>
      </SicatInlineAlert>
    </template>

    <!-- Didática do módulo: mesmos verbetes do glossário do menu (padrão do
         strip "Termos frequentes" das demais telas da vertical). -->
    <div class="transp-hab__glossary">
      <span class="transp-hab__glossary-label">Termos frequentes:</span>
      <span class="transp-hab__glossary-item">RNTRC<SicatHelpHint term="rntrc" /></span>
      <span class="transp-hab__glossary-item">TAC<SicatHelpHint term="tac" /></span>
      <span class="transp-hab__glossary-item">ETC<SicatHelpHint term="etc_transportadora" /></span>
      <span class="transp-hab__glossary-item">CNH<SicatHelpHint term="cnh" /></span>
    </div>

    <!-- Sem transportador com papel carrier a jornada nem começou: o vazio é
         didático e leva ao único lugar onde isso se resolve. -->
    <SicatCard v-if="!loadingList && !items.length" title="Minha transportadora" icon="mdi-account-hard-hat-outline">
      <SicatEmptyState
        title="Nenhuma transportadora cadastrada nesta conta"
        description="A habilitação começa pelo cadastro do transportador com papel “carrier” e o número do RNTRC. Cadastre a sua e volte aqui para acompanhar o que falta para operar."
        icon="mdi-account-hard-hat-outline"
      >
        <template #actions>
          <v-btn color="primary" variant="flat" to="/transporte/transportadores" prepend-icon="mdi-account-hard-hat-outline">
            Cadastrar transportadora
          </v-btn>
        </template>
      </SicatEmptyState>
    </SicatCard>

    <template v-else>
      <SicatCard title="Minha transportadora" icon="mdi-account-hard-hat-outline">
        <template #header-actions>
          <SicatStatusBadge
            v-if="hasCarrier"
            :status="carrier.rntrcStatus"
            :label="rntrcStatusLabel(carrier.rntrcStatus)"
            domain="rntrc-status"
            with-dot
          />
        </template>

        <SicatInlineAlert v-if="commandError" tone="error" :message="commandError" />

        <!-- Uma conta pode ter mais de uma transportadora (matriz/filial ou
             CNPJs distintos): o seletor só aparece quando há escolha real. -->
        <v-select
          v-if="carrierOptions.length > 1"
          :model-value="selectedCarrierId"
          :items="carrierOptions"
          item-title="label"
          item-value="value"
          label="Transportadora"
          density="comfortable"
          variant="outlined"
          hide-details="auto"
          class="transp-hab__select"
          @update:model-value="selectCarrier"
        />

        <div v-if="hasCarrier" class="transp-hab__identity">
          <strong>{{ carrier.legalName }}</strong>
          <span>{{ carrier.documentType }} {{ carrier.documentNumber }}</span>
        </div>

        <dl class="transp-hab__facts">
          <div>
            <dt>Número do RNTRC<SicatHelpHint term="rntrc" /></dt>
            <dd>{{ carrier?.rntrcNumber || 'Não informado' }}</dd>
          </div>
          <div>
            <dt>Categoria declarada</dt>
            <dd>{{ rntrcCategoryLabel(carrier?.rntrcCategory) }}</dd>
          </div>
          <div>
            <dt>Última verificação</dt>
            <dd>{{ rntrcVerifiedLabel }}</dd>
          </div>
        </dl>

        <div class="transp-hab__actions">
          <v-btn
            color="primary"
            variant="flat"
            prepend-icon="mdi-shield-search-outline"
            :loading="commandLoading || loadingDetail"
            :disabled="!hasCarrier"
            @click="handleVerifyRntrc"
          >
            Verificar agora
          </v-btn>
          <v-btn variant="text" :to="carrierDetailPath" prepend-icon="mdi-file-document-edit-outline">
            Registrar verificação manual
          </v-btn>
        </div>
      </SicatCard>

      <SicatCard title="Tipologia derivada da frota" icon="mdi-truck-outline">
        <template #header-actions>
          <SicatHelpHint term="tac" />
        </template>

        <div class="transp-hab__typology">
          <strong class="transp-hab__typology-label">{{ typology.label }}</strong>
          <span class="transp-hab__typology-fleet">{{ typology.fleetLabel }}</span>
        </div>
        <p class="transp-hab__typology-explain">{{ typology.explanation }}</p>

        <!-- A régua completa fica visível SEMPRE: é ela que explica por que
             cadastrar o 4º veículo muda as obrigações da empresa. -->
        <ul class="transp-hab__ladder">
          <li :data-current="typology.code === 'driver_pf' ? 'true' : 'false'">
            <strong>PF</strong> — motorista autônomo, sem frota própria registrada.
          </li>
          <li :data-current="typology.code === 'tac' ? 'true' : 'false'">
            <strong>TAC</strong> — até 3 veículos.
          </li>
          <li :data-current="typology.code === 'etc' ? 'true' : 'false'">
            <strong>ETC</strong> — 4 ou mais veículos: emite CIOT e contrata o seguro da carga.
          </li>
        </ul>

        <SicatInlineAlert
          v-if="typology.warning"
          tone="warning"
          :message="`Divergência entre a categoria DECLARADA (${rntrcCategoryLabel(carrier?.rntrcCategory)}) e a tipologia DERIVADA da frota: ${typology.warning} Isto é um aviso, não um bloqueio — corrija a categoria no cadastro ou revise os veículos vinculados.`"
        />
      </SicatCard>

      <SicatCard title="O que falta para operar" icon="mdi-clipboard-check-outline">
        <template #header-actions>
          <span class="transp-hab__summary" :data-complete="habilitacaoComplete ? 'true' : 'false'">
            {{ checklistSummary }}
          </span>
        </template>

        <ul class="transp-hab__checklist">
          <li v-for="step in checklist" :key="step.key" :data-done="step.done ? 'true' : 'false'">
            <v-icon
              :icon="step.done ? 'mdi-check-circle' : 'mdi-circle-outline'"
              size="20"
              class="transp-hab__check-icon"
              aria-hidden="true"
            />
            <div class="transp-hab__check-body">
              <strong>{{ step.label }}</strong>
              <span>{{ step.description }}</span>
            </div>
            <router-link class="transp-hab__check-link" :to="step.to">{{ step.actionLabel }}</router-link>
          </li>
        </ul>

        <div v-if="loadingCounts || loadingPolicies" class="transp-hab__loading-hint">
          Conferindo frota, motoristas e apólices…
        </div>

        <SicatNextStep
          v-if="habilitacaoComplete"
          title="Habilitação em dia"
          message="RNTRC regular, frota, motorista e apólice vigente: a transportadora está pronta para rodar."
          action-label="Registrar uma viagem"
          to="/transporte/operacoes/nova"
        />
        <SicatNextStep
          v-else
          title="Próximo passo"
          :message="`Resolva ${pendingCount === 1 ? 'o item pendente' : 'os itens pendentes'} acima — enquanto faltar algum, a viagem trava no pré-embarque.`"
          action-label="Ver pendências da operação"
          to="/transporte/pendencias"
        />
      </SicatCard>
    </template>

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
.transp-hab__glossary {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
  margin-bottom: var(--space-3);
  font-size: 0.8rem;
  color: rgba(var(--v-theme-on-surface), 0.7);
}

.transp-hab__glossary-label {
  font-weight: 700;
}

.transp-hab__glossary-item {
  display: inline-flex;
  align-items: center;
  gap: 2px;
}

.transp-hab__select {
  max-width: 420px;
}

.transp-hab__identity {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.transp-hab__identity strong {
  font-size: 1.05rem;
}

.transp-hab__identity span {
  font-size: 0.85rem;
  color: rgba(var(--v-theme-on-surface), 0.68);
}

.transp-hab__facts {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: var(--space-3);
  margin: 0;
}

.transp-hab__facts dt {
  display: flex;
  align-items: center;
  gap: 2px;
  font-size: 0.75rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: rgba(var(--v-theme-on-surface), 0.6);
}

.transp-hab__facts dd {
  margin: 2px 0 0;
  font-size: 0.95rem;
  font-weight: 600;
}

.transp-hab__actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.transp-hab__typology {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 10px;
}

.transp-hab__typology-label {
  font-size: 1.05rem;
}

.transp-hab__typology-fleet {
  font-size: 0.85rem;
  color: rgba(var(--v-theme-on-surface), 0.68);
}

.transp-hab__typology-explain {
  margin: 0;
  font-size: 0.9rem;
  color: rgba(var(--v-theme-on-surface), 0.78);
}

.transp-hab__ladder {
  margin: 0;
  padding-left: 18px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 0.86rem;
  color: rgba(var(--v-theme-on-surface), 0.72);
}

.transp-hab__ladder li[data-current='true'] {
  color: rgb(var(--v-theme-primary));
  font-weight: 600;
}

.transp-hab__summary {
  font-size: 0.82rem;
  font-weight: 700;
  color: rgb(var(--v-theme-warning));
}

.transp-hab__summary[data-complete='true'] {
  color: rgb(var(--v-theme-success));
}

.transp-hab__checklist {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.transp-hab__checklist li {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 10px 12px;
  border: 1px solid rgba(var(--v-theme-on-surface), 0.12);
  border-radius: 10px;
}

.transp-hab__checklist li[data-done='true'] {
  border-color: rgba(var(--v-theme-success), 0.45);
}

.transp-hab__check-icon {
  color: rgba(var(--v-theme-on-surface), 0.4);
}

.transp-hab__checklist li[data-done='true'] .transp-hab__check-icon {
  color: rgb(var(--v-theme-success));
}

.transp-hab__check-body {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 1 1 auto;
}

.transp-hab__check-body span {
  font-size: 0.84rem;
  color: rgba(var(--v-theme-on-surface), 0.7);
}

.transp-hab__check-link {
  color: rgb(var(--v-theme-primary));
  font-weight: 600;
  font-size: 0.85rem;
  text-decoration: none;
  white-space: nowrap;
}

.transp-hab__check-link:hover {
  text-decoration: underline;
}

.transp-hab__loading-hint {
  font-size: 0.82rem;
  color: rgba(var(--v-theme-on-surface), 0.62);
}
</style>
