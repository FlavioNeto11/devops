<script setup>
import { computed, onMounted, reactive, ref } from 'vue';
import {
  getTransportRuleHistory,
  listTransportRules,
  promoteTransportRuleVersion
} from '../../services/transporteService.js';
import {
  formatDateBR,
  gateLabel,
  implementationStateLabel,
  regulatoryDomainLabel,
  COMPLIANCE_GATE_OPTIONS,
  REGULATORY_DOMAIN_OPTIONS
} from './transporteUiHelpers.js';
import { useConfirmDialog } from '../../composables/useConfirmDialog.js';
import { useNotification } from '../../composables/useNotification.js';
import SicatPageLayout from '../../components/sicat/SicatPageLayout.vue';
import SicatPageHeader from '../../components/shell/SicatPageHeader.vue';
import SicatCard from '../../components/sicat/SicatCard.vue';
import SicatFiltersPanel from '../../components/sicat/SicatFiltersPanel.vue';
import SicatDataTable from '../../components/sicat/SicatDataTable.vue';
import SicatHelpHint from '../../components/sicat/SicatHelpHint.vue';
import SicatInlineAlert from '../../components/sicat/SicatInlineAlert.vue';
import SicatEmptyState from '../../components/sicat/SicatEmptyState.vue';
import SicatConfirmDialog from '../../components/sicat/SicatConfirmDialog.vue';

/**
 * Catálogo regulatório de transporte (DL-103) — nasceu READ-ONLY na Onda
 * 1.5/PR-F1 e ganhou, no PR-H2, o histórico de versões por regra e a
 * promoção (administrativa) a bloqueante — o ÚNICO caminho para
 * `blocking=true` no catálogo. Sem store dedicada: molde de telas de
 * consulta simples (ex.: CetesbAccountsHealthView.vue) — chama o service
 * direto, sem regra de negócio.
 */

const notify = useNotification();
const {
  dialogVisible, dialogTitle, dialogMessage, dialogConfirmLabel, dialogCancelLabel,
  dialogDanger, dialogShowCancel, confirm, accept, cancel
} = useConfirmDialog();

const filters = reactive({ domain: '', gate: '', vigenteEm: '' });

const rules = ref([]);
const referenceDate = ref('');
const totalItems = ref(0);
const loading = ref(false);
const error = ref('');

const headers = [
  { title: 'Código', key: 'code', sortable: false },
  { title: 'Título', key: 'title', sortable: false },
  { title: 'Gate', key: 'gate', sortable: false },
  { title: 'Estado da versão', key: 'implementationState', sortable: false },
  { title: 'Bloqueante', key: 'blocking', sortable: false },
  { title: 'Vigência', key: 'validity', sortable: false },
  { title: 'Ações', key: 'actions', sortable: false, align: 'end' }
];

const rows = computed(() =>
  rules.value.map((rule) => {
    const version = rule.currentVersion;
    return {
      code: rule.code,
      title: rule.title,
      gate: gateLabel(rule.defaultGate),
      implementationState: version ? implementationStateLabel(version.implementationState) : 'Sem versão vigente',
      blocking: version ? Boolean(version.blocking) : null,
      validity: version
        ? `${formatDateBR(version.effectiveFrom)} – ${version.effectiveUntil ? formatDateBR(version.effectiveUntil) : 'em vigor'}`
        : '-'
    };
  })
);

const activeChips = computed(() => {
  const chips = [];
  if (filters.domain) chips.push({ key: 'domain', label: `Domínio: ${regulatoryDomainLabel(filters.domain)}` });
  if (filters.gate) chips.push({ key: 'gate', label: `Gate: ${gateLabel(filters.gate)}` });
  if (filters.vigenteEm) chips.push({ key: 'vigenteEm', label: `Vigente em: ${formatDateBR(filters.vigenteEm)}` });
  return chips;
});

async function fetchRules() {
  error.value = '';
  loading.value = true;
  try {
    const response = await listTransportRules({
      domain: filters.domain || undefined,
      gate: filters.gate || undefined,
      vigenteEm: filters.vigenteEm || undefined
    });
    rules.value = Array.isArray(response.items) ? response.items : [];
    referenceDate.value = response.referenceDate || '';
    totalItems.value = Number(response.totalItems || 0);
  } catch (err) {
    rules.value = [];
    totalItems.value = 0;
    error.value = err?.detail || err?.title || err?.message || 'Falha ao listar as regras regulatórias.';
  } finally {
    loading.value = false;
  }
}

function resetFilters() {
  filters.domain = '';
  filters.gate = '';
  filters.vigenteEm = '';
  void fetchRules();
}

function removeChip(key) {
  filters[key] = '';
  void fetchRules();
}

// ---------------------------------------------------------------------
// Histórico de versões + promoção (administrativa) a bloqueante.
// ---------------------------------------------------------------------

const historyDialog = ref(false);
const historyCode = ref('');
const historyVersions = ref([]);
const loadingHistory = ref(false);
const historyError = ref('');

async function openHistory(code) {
  historyCode.value = code;
  historyDialog.value = true;
  historyError.value = '';
  loadingHistory.value = true;
  try {
    const response = await getTransportRuleHistory(code);
    historyVersions.value = Array.isArray(response.versions) ? response.versions : [];
  } catch (err) {
    historyVersions.value = [];
    historyError.value = err?.detail || err?.title || err?.message || 'Falha ao carregar o histórico da regra.';
  } finally {
    loadingHistory.value = false;
  }
}

const promoteDialog = ref(false);
const promoteTarget = ref(null); // { versionLabel, blocking }
const promoteReviewNotes = ref('');
const promoteLoading = ref(false);
const promoteError = ref('');

function openPromote(version) {
  promoteTarget.value = version;
  promoteReviewNotes.value = '';
  promoteError.value = '';
  promoteDialog.value = true;
}

async function submitPromote() {
  if (!promoteReviewNotes.value.trim()) {
    notify.warning('Informe a justificativa da revisão (reviewNotes) antes de continuar.');
    return;
  }

  const nextBlocking = !promoteTarget.value.blocking;
  const ok = await confirm({
    title: nextBlocking ? 'Promover a bloqueante' : 'Reverter promoção (deixar não-bloqueante)',
    message: nextBlocking
      ? `Confirma tornar ${historyCode.value} · ${promoteTarget.value.versionLabel} BLOQUEANTE? Isto muda o resultado real do motor de compliance para todas as operações a partir de agora.`
      : `Confirma reverter ${historyCode.value} · ${promoteTarget.value.versionLabel} para NÃO-bloqueante?`,
    confirmLabel: nextBlocking ? 'Promover a bloqueante' : 'Reverter',
    danger: true
  });
  if (!ok) return;

  promoteError.value = '';
  promoteLoading.value = true;
  try {
    const versionLabel = promoteTarget.value.versionLabel;
    // O histórico expõe `version` (locking otimista) desde a correção do contrato —
    // o valor vem direto da linha aberta; um 409 significa alteração concorrente real.
    await promoteTransportRuleVersion(historyCode.value, versionLabel, {
      blocking: nextBlocking,
      reviewNotes: promoteReviewNotes.value.trim(),
      version: promoteTarget.value.version
    });
    notify.success(nextBlocking ? 'Versão promovida a bloqueante.' : 'Promoção revertida.');
    promoteDialog.value = false;
    await openHistory(historyCode.value);
    await fetchRules();
  } catch (err) {
    const code = err?.payload?.code || err?.code || '';
    promoteError.value = code === 'REGULATORY_RULE_VERSION_CONFLICT'
      ? 'A versão foi alterada por outra ação entre a leitura e esta tentativa — feche este diálogo, reabra o histórico e tente de novo.'
      : (err?.detail || err?.title || err?.message || 'Falha ao promover a versão.');
  } finally {
    promoteLoading.value = false;
  }
}

const totalLabel = computed(() => {
  const value = totalItems.value;
  const suffix = value === 1 ? 'regra encontrada' : 'regras encontradas';
  const referenceLabel = referenceDate.value ? ` · vigência resolvida em ${formatDateBR(referenceDate.value)}` : '';
  return `${value} ${suffix}${referenceLabel}`;
});

onMounted(fetchRules);
</script>

<template>
  <SicatPageLayout>
    <template #header>
      <SicatPageHeader
        kicker="Transporte"
        title="Regras regulatórias"
        description="Catálogo de regras TR-* do motor de compliance, com a versão vigente na data de referência. Consulta read-only — não altera nada."
      />
    </template>

    <template #filters>
      <SicatFiltersPanel
        :active-chips="activeChips"
        :loading="loading"
        @apply="fetchRules"
        @clear="resetFilters"
        @remove="removeChip"
      >
        <v-select
          v-model="filters.domain"
          :items="REGULATORY_DOMAIN_OPTIONS"
          item-title="label"
          item-value="value"
          label="Domínio"
          density="comfortable"
          variant="outlined"
          hide-details="auto"
          clearable
        />
        <v-select
          v-model="filters.gate"
          :items="COMPLIANCE_GATE_OPTIONS"
          item-title="label"
          item-value="value"
          label="Gate"
          density="comfortable"
          variant="outlined"
          hide-details="auto"
          clearable
        />
        <v-text-field
          v-model="filters.vigenteEm"
          label="Vigente em"
          type="date"
          density="comfortable"
          variant="outlined"
          hide-details="auto"
          clearable
        />
      </SicatFiltersPanel>
    </template>

    <div class="transp-regras__glossary">
      <span class="transp-regras__glossary-label">Termos frequentes:</span>
      <span class="transp-regras__glossary-item">
        CIOT
        <SicatHelpHint term="ciot" />
      </span>
    </div>

    <SicatCard :title="totalLabel" flush-body>
      <SicatDataTable
        :headers="headers"
        :items="rows"
        :loading="loading"
        :error="error"
        item-value="code"
        :items-per-page="25"
        :empty="{ title: 'Nenhuma regra encontrada', description: 'Ajuste os filtros de domínio, gate ou vigência.', icon: 'mdi-gavel' }"
        @row-click="(row) => row?.code && openHistory(row.code)"
      >
        <template #[`item.blocking`]="{ item }">
          <v-chip v-if="item.blocking !== null" size="small" :color="item.blocking ? 'error' : undefined" variant="tonal">
            {{ item.blocking ? 'Sim' : 'Não' }}
          </v-chip>
          <span v-else>-</span>
        </template>
        <template #[`item.actions`]="{ item }">
          <v-btn size="small" variant="text" @click.stop="openHistory(item.code)">Histórico</v-btn>
        </template>
      </SicatDataTable>
    </SicatCard>

    <!-- Histórico de versões + promoção a bloqueante -->
    <v-dialog v-model="historyDialog" max-width="820" role="dialog" aria-modal="true">
      <v-card rounded="lg" :title="`Histórico de versões · ${historyCode}`">
        <v-card-text>
          <SicatInlineAlert v-if="historyError" tone="error" :message="historyError" />
          <SicatEmptyState
            v-else-if="!loadingHistory && !historyVersions.length"
            title="Nenhuma versão registrada"
            icon="mdi-history"
            compact
          />
          <v-table v-else density="comfortable">
            <thead>
              <tr>
                <th>Versão</th>
                <th>Estado</th>
                <th>Bloqueante</th>
                <th>Vigência</th>
                <th>Severidade</th>
                <th />
              </tr>
            </thead>
            <tbody>
              <tr v-for="version in historyVersions" :key="version.versionLabel">
                <td>{{ version.versionLabel }}</td>
                <td>{{ implementationStateLabel(version.implementationState) }}</td>
                <td>
                  <v-chip size="small" :color="version.blocking ? 'error' : undefined" variant="tonal">
                    {{ version.blocking ? 'Sim' : 'Não' }}
                  </v-chip>
                </td>
                <td>{{ formatDateBR(version.effectiveFrom) }} – {{ version.effectiveUntil ? formatDateBR(version.effectiveUntil) : 'em vigor' }}</td>
                <td>{{ version.severity }}</td>
                <td class="text-right">
                  <v-btn
                    v-if="version.implementationState === 'ACTIVE'"
                    size="small"
                    :color="version.blocking ? undefined : 'error'"
                    variant="text"
                    @click="openPromote(version)"
                  >
                    {{ version.blocking ? 'Reverter' : 'Promover a bloqueante' }}
                  </v-btn>
                </td>
              </tr>
            </tbody>
          </v-table>
        </v-card-text>
        <v-card-actions class="justify-end">
          <v-btn variant="text" @click="historyDialog = false">Fechar</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Promover/reverter -->
    <v-dialog v-model="promoteDialog" max-width="520" persistent role="dialog" aria-modal="true">
      <v-card rounded="lg" :title="promoteTarget?.blocking ? 'Reverter promoção' : 'Promover a bloqueante'">
        <v-card-text class="d-flex flex-column ga-3">
          <SicatInlineAlert v-if="promoteError" tone="error" :message="promoteError" />
          <SicatInlineAlert
            tone="warning"
            :message="`${historyCode} · ${promoteTarget?.versionLabel} — esta é uma ação administrativa que muda o resultado REAL do motor de compliance. Exige justificativa registrada e confirmação.`"
          />
          <v-textarea
            v-model="promoteReviewNotes"
            label="Justificativa da revisão (obrigatória)"
            rows="3"
            auto-grow
            density="comfortable"
            variant="outlined"
            hide-details="auto"
          />
        </v-card-text>
        <v-card-actions class="justify-end">
          <v-btn variant="text" @click="promoteDialog = false">Cancelar</v-btn>
          <v-btn
            :color="promoteTarget?.blocking ? 'primary' : 'error'"
            variant="flat"
            :disabled="!promoteReviewNotes.trim()"
            :loading="promoteLoading"
            @click="submitPromote"
          >
            {{ promoteTarget?.blocking ? 'Reverter' : 'Promover a bloqueante' }}
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

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
.transp-regras__glossary {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  font-size: 0.85rem;
  color: rgba(var(--v-theme-on-surface), 0.7);
}

.transp-regras__glossary-label {
  font-weight: 700;
}

.transp-regras__glossary-item {
  display: inline-flex;
  align-items: center;
  gap: 2px;
}
</style>
