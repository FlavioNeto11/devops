<script setup>
import { computed, onMounted, reactive, ref } from 'vue';
import { useAuthStore } from '../../stores/auth.js';
import { useGrStore } from '../../stores/grStore.js';
import { useNotification } from '../../composables/useNotification.js';
import {
  GR_SUBJECT_TYPE_OPTIONS,
  formatDateBR,
  formatDateTimeBR,
  isGrScreeningValid,
  resolveGrScreeningBadge,
  vehicleTypeLabel
} from './transporteUiHelpers.js';
import SicatPageLayout from '../../components/sicat/SicatPageLayout.vue';
import SicatPageHeader from '../../components/shell/SicatPageHeader.vue';
import SicatCard from '../../components/sicat/SicatCard.vue';
import SicatDataTable from '../../components/sicat/SicatDataTable.vue';
import SicatStatusBadge from '../../components/sicat/SicatStatusBadge.vue';
import SicatInlineAlert from '../../components/sicat/SicatInlineAlert.vue';
import SicatHelpHint from '../../components/sicat/SicatHelpHint.vue';

/**
 * Gerenciamento de risco — pesquisas cadastrais de motorista e veículo (onda
 * F9, REQ-SICAT-0036/0037). Molde: TransporteSegurosApuracaoView.vue (tela em
 * seções) + TransporteMotoristasListView.vue (diálogo de criação).
 *
 * Duas seções em vez de uma tabela com coluna "tipo": motorista e veículo são
 * exigências SEPARADAS da apólice de roubo — a seguradora pede pesquisa válida
 * dos DOIS, e um operador que vê 8 pesquisas numa lista só não percebe que as 8
 * são de motorista e nenhum veículo foi pesquisado.
 *
 * A lista do contrato NÃO pagina (`items` + `total`) e o resource guarda, por
 * LGPD, só veredito e validade — nunca antecedentes. O NOME do alvo não vem
 * junto: é resolvido aqui contra os cadastros da conta (a mesma fonte que o
 * diálogo usa), com fallback para o ID quando o cadastro sumiu.
 *
 * O rastreamento (a outra metade do GR — TR-GR-002) é por VIAGEM e vive no
 * detalhe da operação, onde estão a carga e o veículo; esta tela não o duplica.
 */

const authStore = useAuthStore();
const store = useGrStore();
const notify = useNotification();

const {
  driverScreenings, vehicleScreenings, loadingScreenings, screeningsError,
  drivers, vehicles, loadingSubjects,
  commandLoading, commandError, screeningDisabled,
  fetchScreenings, loadSubjects, requestScreening, clearCommandState
} = store;

const driverNameById = computed(
  () => new Map(drivers.value.map((driver) => [driver.id, `${driver.partyName} · CNH ${driver.cnhNumber}`]))
);
const vehicleNameById = computed(
  () => new Map(vehicles.value.map((vehicle) => [vehicle.id, vehicle.plate]))
);

const headers = [
  { title: 'Alvo', key: 'subject', sortable: false },
  { title: 'Resultado', key: 'outcome', sortable: false },
  { title: 'Válida até', key: 'validUntil', sortable: false },
  { title: 'Provedor', key: 'provider', sortable: false },
  { title: 'Solicitada em', key: 'createdAt', sortable: false }
];

function toRows(screenings, nameById, fallbackKey) {
  return screenings.map((screening) => {
    const badge = resolveGrScreeningBadge(screening);
    const subjectId = screening[fallbackKey] || '';
    return {
      id: screening.id,
      subject: nameById.get(subjectId) || subjectId || '-',
      badgeStatus: badge.status,
      badgeLabel: badge.label,
      // Pesquisa aprovada mas VENCIDA não cobre a viagem — a linha precisa
      // dizer isso, senão o verde do veredito engana.
      expired: String(screening.outcome || '') === 'approved' && !isGrScreeningValid(screening),
      validUntil: formatDateBR(screening.validUntil),
      provider: screening.provider || '-',
      createdAt: formatDateTimeBR(screening.createdAt)
    };
  });
}

const driverRows = computed(() => toRows(driverScreenings.value, driverNameById.value, 'driverId'));
const vehicleRows = computed(() => toRows(vehicleScreenings.value, vehicleNameById.value, 'vehicleId'));

// --- Solicitar pesquisa ----------------------------------------------------

const requestDialog = ref(false);
const requestForm = reactive({ subjectType: 'driver', driverId: '', vehicleId: '', referenceDate: '' });

const driverOptions = computed(() =>
  drivers.value.map((driver) => ({ value: driver.id, label: `${driver.partyName} · CNH ${driver.cnhNumber}` }))
);
const vehicleOptions = computed(() =>
  vehicles.value.map((vehicle) => ({ value: vehicle.id, label: `${vehicle.plate} · ${vehicleTypeLabel(vehicle.vehicleType)}` }))
);

const subjectOptionsEmpty = computed(() =>
  requestForm.subjectType === 'driver' ? driverOptions.value.length === 0 : vehicleOptions.value.length === 0
);

function openRequestDialog(subjectType = 'driver') {
  Object.assign(requestForm, { subjectType, driverId: '', vehicleId: '', referenceDate: '' });
  clearCommandState();
  requestDialog.value = true;
}

async function submitRequest() {
  const targetId = requestForm.subjectType === 'driver' ? requestForm.driverId : requestForm.vehicleId;
  if (!targetId) {
    notify.warning(`Selecione ${requestForm.subjectType === 'driver' ? 'o motorista' : 'o veículo'} a pesquisar.`);
    return;
  }
  try {
    const screening = await requestScreening({
      subjectType: requestForm.subjectType,
      driverId: requestForm.driverId,
      vehicleId: requestForm.vehicleId,
      referenceDate: requestForm.referenceDate || undefined
    });
    requestDialog.value = false;
    const outcome = String(screening?.outcome || '');
    if (outcome === 'approved') notify.success('Pesquisa concluída: alvo aprovado.');
    else if (outcome === 'rejected') notify.error('Pesquisa concluída: alvo REPROVADO pelo provedor.');
    else if (outcome === 'inconclusive') notify.warning('Pesquisa concluída sem conclusão — refaça ou consulte a seguradora.');
    else notify.success('Pesquisa solicitada — o resultado chega pela reconciliação.');
  } catch {
    if (commandError.value) notify.error(commandError.value);
  }
}

onMounted(async () => {
  await Promise.all([fetchScreenings(), loadSubjects()]);
});
</script>

<template>
  <SicatPageLayout>
    <template #header>
      <SicatPageHeader
        kicker="Transporte · Seguros"
        title="Gerenciamento de risco"
        description="As pesquisas cadastrais de motorista e veículo que a apólice de roubo exige para manter a cobertura viva."
      >
        <template #actions>
          <v-btn variant="text" :loading="loadingScreenings" prepend-icon="mdi-refresh" @click="fetchScreenings">
            Atualizar
          </v-btn>
          <v-btn color="primary" variant="flat" prepend-icon="mdi-account-search-outline" @click="openRequestDialog('driver')">
            Solicitar pesquisa
          </v-btn>
        </template>
      </SicatPageHeader>
    </template>

    <template #banner>
      <SicatInlineAlert
        v-if="!authStore.hasActiveCetesbAccount.value"
        tone="warning"
        message="Selecione uma conta para ver as pesquisas cadastrais."
      />
      <SicatInlineAlert v-else-if="screeningsError" tone="error" :message="screeningsError">
        <template #actions>
          <v-btn size="small" variant="text" :loading="loadingScreenings" @click="fetchScreenings">Tentar novamente</v-btn>
        </template>
      </SicatInlineAlert>
      <SicatInlineAlert v-else-if="screeningDisabled" tone="info" :message="commandError" />
    </template>

    <!-- POR QUE isto existe: a exigência não é da CETESB nem da ANTT — vem da
         apólice. Sem esse enquadramento a tela parece burocracia extra. -->
    <SicatCard title="Por que a seguradora exige isto" icon="mdi-shield-search-outline">
      <template #header-actions>
        <SicatHelpHint term="gr" />
      </template>
      <p class="transp-gr__intro">
        A apólice de <strong>RC-DC (roubo de carga)</strong> só responde se motorista e veículo tiverem
        <strong>pesquisa cadastral vigente</strong> na data da viagem — é o gerenciamento de risco que a seguradora
        contratou junto com a cobertura. O SICAT avalia isso no pré-embarque (regra TR-GR-001, hoje em modo aviso):
        pesquisa aprovada mas <strong>vencida</strong> não vale, e é por isso que a coluna de validade existe.
      </p>
      <div class="transp-gr__terms">
        <span class="transp-gr__term">PGR<SicatHelpHint term="pgr" /></span>
        <span class="transp-gr__term">RC-DC<SicatHelpHint term="rc_dc" /></span>
        <span class="transp-gr__term">CNH<SicatHelpHint term="cnh" /></span>
      </div>
    </SicatCard>

    <SicatCard title="Motoristas" icon="mdi-card-account-details-outline" flush-body>
      <template #header-actions>
        <v-btn size="small" variant="tonal" prepend-icon="mdi-account-search-outline" @click="openRequestDialog('driver')">
          Pesquisar motorista
        </v-btn>
      </template>
      <SicatDataTable
        :headers="headers"
        :items="driverRows"
        :loading="loadingScreenings"
        :show-footer="false"
        :items-per-page="-1"
        :empty="{
          title: 'Nenhuma pesquisa de motorista',
          description: 'Nenhum condutor desta conta foi pesquisado ainda — a apólice de roubo cobra isso antes do embarque.',
          icon: 'mdi-account-search-outline'
        }"
      >
        <template #[`item.outcome`]="{ item }">
          <SicatStatusBadge :status="item.badgeStatus" :label="item.badgeLabel" domain="gr-screening" with-dot />
        </template>
        <template #[`item.validUntil`]="{ item }">
          <span :class="item.expired ? 'transp-gr__expired' : ''">
            {{ item.validUntil }}{{ item.expired ? ' · vencida' : '' }}
          </span>
        </template>
      </SicatDataTable>
    </SicatCard>

    <SicatCard title="Veículos" icon="mdi-truck-outline" flush-body>
      <template #header-actions>
        <v-btn size="small" variant="tonal" prepend-icon="mdi-car-search-outline" @click="openRequestDialog('vehicle')">
          Pesquisar veículo
        </v-btn>
      </template>
      <SicatDataTable
        :headers="headers"
        :items="vehicleRows"
        :loading="loadingScreenings"
        :show-footer="false"
        :items-per-page="-1"
        :empty="{
          title: 'Nenhuma pesquisa de veículo',
          description: 'Nenhum veículo desta conta foi pesquisado ainda — a exigência vale para o caminhão, não só para quem dirige.',
          icon: 'mdi-car-search-outline'
        }"
      >
        <template #[`item.outcome`]="{ item }">
          <SicatStatusBadge :status="item.badgeStatus" :label="item.badgeLabel" domain="gr-screening" with-dot />
        </template>
        <template #[`item.validUntil`]="{ item }">
          <span :class="item.expired ? 'transp-gr__expired' : ''">
            {{ item.validUntil }}{{ item.expired ? ' · vencida' : '' }}
          </span>
        </template>
      </SicatDataTable>
    </SicatCard>

    <!-- Solicitar pesquisa -->
    <v-dialog v-model="requestDialog" max-width="560" persistent role="dialog" aria-modal="true">
      <v-card rounded="lg" title="Solicitar pesquisa cadastral">
        <v-card-text class="d-flex flex-column ga-3">
          <SicatInlineAlert v-if="commandError" :tone="screeningDisabled ? 'info' : 'error'" :message="commandError" />
          <p class="transp-gr__dialog-hint">
            A pesquisa consulta o provedor de GR e guarda apenas o <strong>veredito</strong> e a
            <strong>validade</strong> — nenhum antecedente é armazenado no SICAT (LGPD).
          </p>

          <v-radio-group v-model="requestForm.subjectType" hide-details="auto" inline>
            <v-radio v-for="option in GR_SUBJECT_TYPE_OPTIONS" :key="option.value" :label="option.label" :value="option.value" />
          </v-radio-group>

          <SicatInlineAlert
            v-if="!loadingSubjects && subjectOptionsEmpty"
            tone="info"
            :message="requestForm.subjectType === 'driver'
              ? 'Nenhum motorista cadastrado nesta conta — cadastre em Frota → Motoristas e volte aqui.'
              : 'Nenhum veículo cadastrado nesta conta — cadastre em Frota → Veículos e volte aqui.'"
          />

          <v-select
            v-if="requestForm.subjectType === 'driver'"
            v-model="requestForm.driverId"
            :items="driverOptions"
            item-title="label"
            item-value="value"
            label="Motorista"
            :loading="loadingSubjects"
            density="comfortable"
            variant="outlined"
            hide-details="auto"
          />
          <v-select
            v-else
            v-model="requestForm.vehicleId"
            :items="vehicleOptions"
            item-title="label"
            item-value="value"
            label="Veículo"
            :loading="loadingSubjects"
            density="comfortable"
            variant="outlined"
            hide-details="auto"
          />

          <v-text-field
            v-model="requestForm.referenceDate"
            label="Data de referência (opcional — default hoje)"
            type="date"
            density="comfortable"
            variant="outlined"
            hide-details="auto"
          />
        </v-card-text>
        <v-card-actions class="justify-end">
          <v-btn variant="text" @click="requestDialog = false">Cancelar</v-btn>
          <v-btn color="primary" variant="flat" :loading="commandLoading" @click="submitRequest">Solicitar</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </SicatPageLayout>
</template>

<style scoped>
.transp-gr__intro {
  margin: 0;
  font-size: 0.9rem;
  line-height: 1.55;
  color: rgba(var(--v-theme-on-surface), 0.78);
}

.transp-gr__terms {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
  font-size: 0.8rem;
  color: rgba(var(--v-theme-on-surface), 0.7);
}

.transp-gr__term {
  display: inline-flex;
  align-items: center;
  gap: 2px;
}

.transp-gr__expired {
  color: rgb(var(--v-theme-error));
  font-weight: 600;
}

.transp-gr__dialog-hint {
  margin: 0;
  font-size: 0.84rem;
  color: rgba(var(--v-theme-on-surface), 0.72);
}
</style>
