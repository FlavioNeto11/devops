<script setup>
import { computed, onMounted, ref } from 'vue';
import {
  listAiControlAgents,
  listAiControlPolicies,
  listAiControlTools,
  listAiControlToolVersions,
  patchAiControlAgent,
  patchAiControlPolicy,
  patchAiControlTool
} from '../../services/api.js';
import { useNotification } from '../../composables/useNotification.js';
import { useConfirmDialog } from '../../composables/useConfirmDialog.js';
import SicatCard from '../../components/sicat/SicatCard.vue';
import SicatDataTable from '../../components/sicat/SicatDataTable.vue';
import SicatLoadingState from '../../components/sicat/SicatLoadingState.vue';
import SicatErrorState from '../../components/sicat/SicatErrorState.vue';
import ConfirmDialog from '../../components/sicat/SicatConfirmDialog.vue';
import AiJsonViewer from './AiJsonViewer.vue';

const emit = defineEmits(['open-traces']);

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

const RISK_LEVELS = ['R1', 'R2', 'R3', 'R4'];
const CHANNELS = ['whatsapp', 'native_chat', 'inapp'];

const subTab = ref('tools');

const tools = ref([]);
const agents = ref([]);
const policies = ref([]);

const loadingTools = ref(false);
const loadingAgents = ref(false);
const loadingPolicies = ref(false);

const errorTools = ref(null);
const errorAgents = ref(null);
const errorPolicies = ref(null);

const actionLoading = ref('');

// --- Tools edit dialog -------------------------------------------------------
const policyDialog = ref(false);
const policyEditTarget = ref(null);
const policyForm = ref({ riskLevel: 'R1', allowChannels: [], requiresConfirmation: false, isAction: false, changelog: '' });

// --- Tool schema / versions dialogs -----------------------------------------
const versionsDialog = ref(false);
const versionsTarget = ref(null);
const versionsItems = ref([]);
const versionsLoading = ref(false);
const versionsError = ref(null);

// --- Agent edit dialog -------------------------------------------------------
const agentDialog = ref(false);
const agentEditTarget = ref(null);
const agentForm = ref({ toolNames: [], focus: '', intents: [], knowledgeTopics: [] });

// --- Policy edit dialog ------------------------------------------------------
const policyRowDialog = ref(false);
const policyRowTarget = ref(null);
const policyRowForm = ref({ riskLevel: 'R1', allowChannels: [], requiresConfirmation: false, enabled: true });

const toolHeaders = [
  { title: 'Ferramenta', key: 'toolName' },
  { title: 'Categoria', key: 'category' },
  { title: 'Risco', key: 'riskLevel' },
  { title: 'Canais', key: 'allowChannels', sortable: false },
  { title: 'Confirma', key: 'requiresConfirmation', align: 'center' },
  { title: 'Ação', key: 'isAction', align: 'center' },
  { title: 'Ativa', key: 'enabled', align: 'center' },
  { title: 'Origem', key: 'source' },
  { title: 'Stats', key: 'stats', sortable: false, align: 'end' },
  { title: '', key: 'actions', sortable: false, align: 'end' }
];

const agentHeaders = [
  { title: 'Agente', key: 'agentName' },
  { title: 'Foco (o que o agente faz)', key: 'focus', sortable: false },
  { title: 'Ferramentas', key: 'toolNames', sortable: false },
  { title: 'Ativo', key: 'enabled', align: 'center' },
  { title: 'Origem', key: 'source' },
  { title: '', key: 'actions', sortable: false, align: 'end' }
];

const policyHeaders = [
  { title: 'Política', key: 'policyId' },
  { title: 'Risco', key: 'riskLevel' },
  { title: 'Canais', key: 'allowChannels', sortable: false },
  { title: 'Confirma', key: 'requiresConfirmation', align: 'center' },
  { title: 'Ativa', key: 'enabled', align: 'center' },
  { title: '', key: 'actions', sortable: false, align: 'end' }
];

const normalizedTools = computed(() =>
  tools.value.map((tool) => ({
    ...tool,
    id: tool.toolName || tool.name,
    toolName: tool.toolName || tool.name,
    // A policy vem aninhada (tool.policy.*); achatamos para a tabela e os diálogos.
    riskLevel: tool.policy?.riskLevel ?? tool.riskLevel ?? null,
    allowChannels: tool.policy?.allowChannels ?? tool.allowChannels ?? [],
    requiresConfirmation: tool.policy?.requiresConfirmation ?? tool.requiresConfirmation ?? false,
    isAction: tool.policy?.isAction ?? tool.isAction ?? false
  }))
);

const riskColor = (level) => {
  const key = String(level || '').toUpperCase();
  if (key === 'R4') return 'error';
  if (key === 'R3') return 'warning';
  if (key === 'R2') return 'info';
  return 'success';
};

async function loadTools() {
  loadingTools.value = true;
  errorTools.value = null;
  try {
    const data = await listAiControlTools();
    tools.value = Array.isArray(data?.items) ? data.items : (Array.isArray(data) ? data : []);
  } catch (err) {
    errorTools.value = err;
  } finally {
    loadingTools.value = false;
  }
}

async function loadAgents() {
  loadingAgents.value = true;
  errorAgents.value = null;
  try {
    const data = await listAiControlAgents();
    agents.value = Array.isArray(data?.items) ? data.items : (Array.isArray(data) ? data : []);
  } catch (err) {
    errorAgents.value = err;
  } finally {
    loadingAgents.value = false;
  }
}

async function loadPolicies() {
  loadingPolicies.value = true;
  errorPolicies.value = null;
  try {
    const data = await listAiControlPolicies();
    policies.value = Array.isArray(data?.items) ? data.items : (Array.isArray(data) ? data : []);
  } catch (err) {
    errorPolicies.value = err;
  } finally {
    loadingPolicies.value = false;
  }
}

// --- Tool actions ------------------------------------------------------------

async function toggleToolEnabled(tool) {
  const nextEnabled = !tool.enabled;
  // ACTION tools exigem confirmação ao alternar o enabled.
  if (tool.isAction) {
    const confirmed = await confirm({
      title: nextEnabled ? 'Habilitar ferramenta de ação' : 'Desabilitar ferramenta de ação',
      message: `A ferramenta "${tool.toolName}" executa ações no mundo real. Confirma ${nextEnabled ? 'habilitá-la' : 'desabilitá-la'}?`,
      confirmLabel: nextEnabled ? 'Habilitar' : 'Desabilitar',
      danger: true
    });
    if (!confirmed) return;
  }

  actionLoading.value = tool.toolName;
  try {
    await patchAiControlTool(tool.toolName, { enabled: nextEnabled, confirmed: true });
    notify.success(`Ferramenta "${tool.toolName}" ${nextEnabled ? 'habilitada' : 'desabilitada'}.`);
    await loadTools();
  } catch (err) {
    notify.error(err?.message || 'Falha ao atualizar ferramenta.');
  } finally {
    actionLoading.value = '';
  }
}

function openPolicyEdit(tool) {
  policyEditTarget.value = tool;
  policyForm.value = {
    riskLevel: String(tool.riskLevel || 'R1').toUpperCase(),
    allowChannels: Array.isArray(tool.allowChannels) ? [...tool.allowChannels] : [],
    requiresConfirmation: Boolean(tool.requiresConfirmation),
    isAction: Boolean(tool.isAction),
    changelog: ''
  };
  policyDialog.value = true;
}

async function savePolicyEdit() {
  const tool = policyEditTarget.value;
  if (!tool) return;

  // Alterar política de uma ferramenta é sensível → confirmação + confirmed:true.
  const confirmed = await confirm({
    title: 'Atualizar política da ferramenta',
    message: `Confirma alterar a política da ferramenta "${tool.toolName}"?`,
    confirmLabel: 'Salvar política',
    danger: true
  });
  if (!confirmed) return;

  actionLoading.value = tool.toolName;
  try {
    await patchAiControlTool(tool.toolName, {
      riskLevel: policyForm.value.riskLevel,
      allowChannels: policyForm.value.allowChannels,
      requiresConfirmation: policyForm.value.requiresConfirmation,
      isAction: policyForm.value.isAction,
      changelog: policyForm.value.changelog || undefined,
      confirmed: true
    });
    notify.success(`Política da ferramenta "${tool.toolName}" atualizada.`);
    policyDialog.value = false;
    await loadTools();
  } catch (err) {
    notify.error(err?.message || 'Falha ao atualizar política.');
  } finally {
    actionLoading.value = '';
  }
}

async function openVersions(tool) {
  versionsTarget.value = tool;
  versionsDialog.value = true;
  versionsItems.value = [];
  versionsError.value = null;
  versionsLoading.value = true;
  try {
    const data = await listAiControlToolVersions(tool.toolName);
    versionsItems.value = Array.isArray(data?.items) ? data.items : (Array.isArray(data) ? data : []);
  } catch (err) {
    versionsError.value = err;
  } finally {
    versionsLoading.value = false;
  }
}

function openTraces(tool) {
  emit('open-traces', { toolName: tool.toolName });
}

// --- Agent actions -----------------------------------------------------------

async function toggleAgentEnabled(agent) {
  const nextEnabled = !agent.enabled;
  actionLoading.value = agent.agentName;
  try {
    await patchAiControlAgent(agent.agentName, { enabled: nextEnabled });
    notify.success(`Agente "${agent.agentName}" ${nextEnabled ? 'habilitado' : 'desabilitado'}.`);
    await loadAgents();
  } catch (err) {
    notify.error(err?.message || 'Falha ao atualizar agente.');
  } finally {
    actionLoading.value = '';
  }
}

function openAgentEdit(agent) {
  agentEditTarget.value = agent;
  agentForm.value = {
    toolNames: Array.isArray(agent.toolNames) ? [...agent.toolNames] : [],
    focus: agent.focus || '',
    intents: Array.isArray(agent.intents) ? [...agent.intents] : [],
    knowledgeTopics: Array.isArray(agent.knowledgeTopics) ? [...agent.knowledgeTopics] : []
  };
  agentDialog.value = true;
}

async function saveAgentEdit() {
  const agent = agentEditTarget.value;
  if (!agent) return;
  actionLoading.value = agent.agentName;
  try {
    await patchAiControlAgent(agent.agentName, {
      toolNames: agentForm.value.toolNames,
      focus: agentForm.value.focus,
      intents: agentForm.value.intents,
      knowledgeTopics: agentForm.value.knowledgeTopics
    });
    notify.success(`Agente "${agent.agentName}" atualizado.`);
    agentDialog.value = false;
    await loadAgents();
  } catch (err) {
    notify.error(err?.message || 'Falha ao atualizar agente.');
  } finally {
    actionLoading.value = '';
  }
}

// --- Policy actions ----------------------------------------------------------

function openPolicyRowEdit(policy) {
  policyRowTarget.value = policy;
  policyRowForm.value = {
    riskLevel: String(policy.riskLevel || 'R1').toUpperCase(),
    allowChannels: Array.isArray(policy.allowChannels) ? [...policy.allowChannels] : [],
    requiresConfirmation: Boolean(policy.requiresConfirmation),
    enabled: policy.enabled !== false
  };
  policyRowDialog.value = true;
}

async function savePolicyRowEdit() {
  const policy = policyRowTarget.value;
  if (!policy) return;
  actionLoading.value = policy.policyId;
  try {
    await patchAiControlPolicy(policy.policyId, {
      riskLevel: policyRowForm.value.riskLevel,
      allowChannels: policyRowForm.value.allowChannels,
      requiresConfirmation: policyRowForm.value.requiresConfirmation,
      enabled: policyRowForm.value.enabled
    });
    notify.success(`Política "${policy.policyId}" atualizada.`);
    policyRowDialog.value = false;
    await loadPolicies();
  } catch (err) {
    notify.error(err?.message || 'Falha ao atualizar política.');
  } finally {
    actionLoading.value = '';
  }
}

const agentToolOptions = computed(() => normalizedTools.value.map((tool) => tool.toolName).filter(Boolean));

onMounted(() => {
  loadTools();
  loadAgents();
  loadPolicies();
});
</script>

<template>
  <div class="ai-runtime">
    <v-tabs v-model="subTab" color="primary" density="compact">
      <v-tab value="tools">Ferramentas ({{ tools.length }})</v-tab>
      <v-tab value="agents">Agentes ({{ agents.length }})</v-tab>
      <v-tab value="policies">Políticas ({{ policies.length }})</v-tab>
    </v-tabs>
    <v-divider class="mb-4" />

    <v-window v-model="subTab">
      <!-- TOOLS -->
      <v-window-item value="tools">
        <SicatLoadingState v-if="loadingTools" title="Carregando ferramentas…" />
        <SicatErrorState
          v-else-if="errorTools"
          :message="errorTools?.message || 'Falha ao carregar ferramentas.'"
          retryable
          @retry="loadTools"
        />
        <SicatCard v-else flush-body>
          <SicatDataTable
            :headers="toolHeaders"
            :items="normalizedTools"
            item-value="id"
            density="compact"
            :empty="{ title: 'Nenhuma ferramenta registrada', icon: 'mdi-tools' }"
          >
            <template #[`item.riskLevel`]="{ item }">
              <v-chip :color="riskColor(item.riskLevel)" size="x-small" variant="tonal">{{ item.riskLevel || '—' }}</v-chip>
            </template>
            <template #[`item.allowChannels`]="{ item }">
              <div class="d-flex flex-wrap ga-1">
                <v-chip v-for="ch in (item.allowChannels || [])" :key="ch" size="x-small" variant="outlined">{{ ch }}</v-chip>
                <span v-if="!(item.allowChannels || []).length" class="ai-runtime__muted">—</span>
              </div>
            </template>
            <template #[`item.requiresConfirmation`]="{ item }">
              <v-icon :color="item.requiresConfirmation ? 'warning' : undefined" size="18">
                {{ item.requiresConfirmation ? 'mdi-check' : 'mdi-minus' }}
              </v-icon>
            </template>
            <template #[`item.isAction`]="{ item }">
              <v-icon :color="item.isAction ? 'error' : undefined" size="18">
                {{ item.isAction ? 'mdi-flash' : 'mdi-minus' }}
              </v-icon>
            </template>
            <template #[`item.enabled`]="{ item }">
              <v-switch
                :model-value="item.enabled"
                color="success"
                density="compact"
                hide-details
                :loading="actionLoading === item.toolName"
                @update:model-value="toggleToolEnabled(item)"
              />
            </template>
            <template #[`item.source`]="{ item }">
              <v-chip size="x-small" variant="tonal">{{ item.source || '—' }}</v-chip>
            </template>
            <template #[`item.stats`]="{ item }">
              <span class="ai-runtime__stats">
                {{ item.stats?.total ?? 0 }} / {{ item.stats?.executed ?? 0 }} / {{ item.stats?.blocked ?? 0 }}
              </span>
            </template>
            <template #[`item.actions`]="{ item }">
              <v-menu>
                <template #activator="{ props: menuProps }">
                  <v-btn v-bind="menuProps" icon="mdi-dots-vertical" variant="text" size="small" />
                </template>
                <v-list density="compact">
                  <v-list-item prepend-icon="mdi-shield-edit-outline" title="Editar política" @click="openPolicyEdit(item)" />
                  <v-list-item prepend-icon="mdi-history" title="Ver versões" @click="openVersions(item)" />
                  <v-list-item prepend-icon="mdi-text-search" title="Traces relacionados" @click="openTraces(item)" />
                </v-list>
              </v-menu>
              <AiJsonViewer
                :value="item.inputSchema || item.schema || item.parametersSchema || {}"
                label="Schema"
                :title="`Schema · ${item.toolName}`"
                button-variant="text"
                button-size="small"
                icon="mdi-code-json"
              />
            </template>
          </SicatDataTable>
        </SicatCard>
      </v-window-item>

      <!-- AGENTS -->
      <v-window-item value="agents">
        <SicatLoadingState v-if="loadingAgents" title="Carregando agentes…" />
        <SicatErrorState
          v-else-if="errorAgents"
          :message="errorAgents?.message || 'Falha ao carregar agentes.'"
          retryable
          @retry="loadAgents"
        />
        <SicatCard v-else flush-body>
          <SicatDataTable
            :headers="agentHeaders"
            :items="agents"
            item-value="agentName"
            density="compact"
            :empty="{ title: 'Nenhum agente registrado', icon: 'mdi-account-cog-outline' }"
          >
            <template #[`item.focus`]="{ item }">
              <div class="ai-runtime__focus" :title="item.focus">{{ item.focus || '—' }}</div>
            </template>
            <template #[`item.toolNames`]="{ item }">
              <div class="d-flex flex-wrap ga-1">
                <v-chip v-for="t in (item.toolNames || []).slice(0, 4)" :key="t" size="x-small" variant="outlined">{{ t }}</v-chip>
                <v-chip v-if="(item.toolNames || []).length > 4" size="x-small" variant="tonal">+{{ item.toolNames.length - 4 }}</v-chip>
              </div>
            </template>
            <template #[`item.enabled`]="{ item }">
              <v-switch
                :model-value="item.enabled"
                color="success"
                density="compact"
                hide-details
                :loading="actionLoading === item.agentName"
                @update:model-value="toggleAgentEnabled(item)"
              />
            </template>
            <template #[`item.source`]="{ item }">
              <v-chip size="x-small" variant="tonal">{{ item.source || '—' }}</v-chip>
            </template>
            <template #[`item.actions`]="{ item }">
              <v-btn icon="mdi-pencil-outline" variant="text" size="small" @click="openAgentEdit(item)" />
            </template>
          </SicatDataTable>
        </SicatCard>
      </v-window-item>

      <!-- POLICIES -->
      <v-window-item value="policies">
        <SicatLoadingState v-if="loadingPolicies" title="Carregando políticas…" />
        <SicatErrorState
          v-else-if="errorPolicies"
          :message="errorPolicies?.message || 'Falha ao carregar políticas.'"
          retryable
          @retry="loadPolicies"
        />
        <SicatCard v-else flush-body>
          <SicatDataTable
            :headers="policyHeaders"
            :items="policies"
            item-value="policyId"
            density="compact"
            :empty="{ title: 'Nenhuma política registrada', icon: 'mdi-shield-outline' }"
          >
            <template #[`item.riskLevel`]="{ item }">
              <v-chip :color="riskColor(item.riskLevel)" size="x-small" variant="tonal">{{ item.riskLevel || '—' }}</v-chip>
            </template>
            <template #[`item.allowChannels`]="{ item }">
              <div class="d-flex flex-wrap ga-1">
                <v-chip v-for="ch in (item.allowChannels || [])" :key="ch" size="x-small" variant="outlined">{{ ch }}</v-chip>
                <span v-if="!(item.allowChannels || []).length" class="ai-runtime__muted">—</span>
              </div>
            </template>
            <template #[`item.requiresConfirmation`]="{ item }">
              <v-icon :color="item.requiresConfirmation ? 'warning' : undefined" size="18">
                {{ item.requiresConfirmation ? 'mdi-check' : 'mdi-minus' }}
              </v-icon>
            </template>
            <template #[`item.enabled`]="{ item }">
              <v-icon :color="item.enabled !== false ? 'success' : undefined" size="18">
                {{ item.enabled !== false ? 'mdi-check-circle' : 'mdi-close-circle' }}
              </v-icon>
            </template>
            <template #[`item.actions`]="{ item }">
              <v-btn icon="mdi-pencil-outline" variant="text" size="small" @click="openPolicyRowEdit(item)" />
            </template>
          </SicatDataTable>
        </SicatCard>
      </v-window-item>
    </v-window>

    <!-- Dialog: editar política da ferramenta -->
    <v-dialog v-model="policyDialog" max-width="560">
      <v-card rounded="lg" :title="`Política · ${policyEditTarget?.toolName || ''}`">
        <v-card-text class="d-flex flex-column ga-3">
          <v-select
            v-model="policyForm.riskLevel"
            :items="RISK_LEVELS"
            label="Nível de risco"
            variant="outlined"
            density="comfortable"
            hide-details
          />
          <v-select
            v-model="policyForm.allowChannels"
            :items="CHANNELS"
            label="Canais permitidos"
            variant="outlined"
            density="comfortable"
            multiple
            chips
            hide-details
          />
          <v-switch v-model="policyForm.requiresConfirmation" color="warning" label="Requer confirmação" hide-details />
          <v-switch v-model="policyForm.isAction" color="error" label="É ação (executa no mundo real)" hide-details />
          <v-text-field
            v-model="policyForm.changelog"
            label="Changelog (opcional)"
            variant="outlined"
            density="comfortable"
            hide-details
          />
        </v-card-text>
        <v-card-actions class="justify-end">
          <v-btn variant="text" @click="policyDialog = false">Cancelar</v-btn>
          <v-btn color="primary" variant="flat" :loading="actionLoading === policyEditTarget?.toolName" @click="savePolicyEdit">Salvar</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Dialog: versões da ferramenta -->
    <v-dialog v-model="versionsDialog" max-width="720" scrollable>
      <v-card rounded="lg" :title="`Versões · ${versionsTarget?.toolName || ''}`">
        <v-divider />
        <v-card-text style="max-height: 60vh">
          <SicatLoadingState v-if="versionsLoading" compact title="Carregando versões…" />
          <SicatErrorState v-else-if="versionsError" compact :message="versionsError?.message || 'Falha ao carregar versões.'" />
          <v-table v-else-if="versionsItems.length" density="compact">
            <thead>
              <tr>
                <th scope="col">Versão</th>
                <th scope="col">Quando</th>
                <th scope="col">Changelog</th>
                <th scope="col">JSON</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(ver, index) in versionsItems" :key="ver.version || ver.id || index">
                <td>{{ ver.version ?? ver.id ?? index }}</td>
                <td>{{ ver.createdAt || ver.updatedAt || '—' }}</td>
                <td>{{ ver.changelog || '—' }}</td>
                <td><AiJsonViewer :value="ver" label="Ver" button-variant="text" button-size="x-small" /></td>
              </tr>
            </tbody>
          </v-table>
          <div v-else class="ai-runtime__muted">Nenhuma versão encontrada.</div>
        </v-card-text>
        <v-card-actions class="justify-end">
          <v-btn variant="text" @click="versionsDialog = false">Fechar</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Dialog: editar agente -->
    <v-dialog v-model="agentDialog" max-width="760">
      <v-card rounded="lg" :title="`Agente · ${agentEditTarget?.agentName || ''}`">
        <v-card-text class="d-flex flex-column ga-3">
          <v-textarea
            v-model="agentForm.focus"
            label="Foco / instruções do agente (o que ele faz — texto dinâmico)"
            variant="outlined"
            rows="5"
            auto-grow
            hide-details
          />
          <v-combobox
            v-model="agentForm.intents"
            label="Intents (roteamento)"
            variant="outlined"
            density="comfortable"
            multiple
            chips
            hide-details
          />
          <v-combobox
            v-model="agentForm.knowledgeTopics"
            label="Tópicos de conhecimento (RAG)"
            variant="outlined"
            density="comfortable"
            multiple
            chips
            hide-details
          />
          <v-select
            v-model="agentForm.toolNames"
            :items="agentToolOptions"
            label="Ferramentas do agente"
            variant="outlined"
            density="comfortable"
            multiple
            chips
            hide-details
          />
        </v-card-text>
        <v-card-actions class="justify-end">
          <v-btn variant="text" @click="agentDialog = false">Cancelar</v-btn>
          <v-btn color="primary" variant="flat" :loading="actionLoading === agentEditTarget?.agentName" @click="saveAgentEdit">Salvar</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Dialog: editar política (linha) -->
    <v-dialog v-model="policyRowDialog" max-width="560">
      <v-card rounded="lg" :title="`Política · ${policyRowTarget?.policyId || ''}`">
        <v-card-text class="d-flex flex-column ga-3">
          <v-select
            v-model="policyRowForm.riskLevel"
            :items="RISK_LEVELS"
            label="Nível de risco"
            variant="outlined"
            density="comfortable"
            hide-details
          />
          <v-select
            v-model="policyRowForm.allowChannels"
            :items="CHANNELS"
            label="Canais permitidos"
            variant="outlined"
            density="comfortable"
            multiple
            chips
            hide-details
          />
          <v-switch v-model="policyRowForm.requiresConfirmation" color="warning" label="Requer confirmação" hide-details />
          <v-switch v-model="policyRowForm.enabled" color="success" label="Ativa" hide-details />
        </v-card-text>
        <v-card-actions class="justify-end">
          <v-btn variant="text" @click="policyRowDialog = false">Cancelar</v-btn>
          <v-btn color="primary" variant="flat" :loading="actionLoading === policyRowTarget?.policyId" @click="savePolicyRowEdit">Salvar</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <ConfirmDialog
      :visible="dialogVisible"
      :title="dialogTitle"
      :message="dialogMessage"
      :confirm-label="dialogConfirmLabel"
      :cancel-label="dialogCancelLabel"
      :show-cancel="dialogShowCancel"
      :danger="dialogDanger"
      @confirm="accept"
      @cancel="cancel"
      @close="cancel"
    />
  </div>
</template>

<style scoped>
.ai-runtime {
  display: flex;
  flex-direction: column;
}

.ai-runtime__muted {
  color: rgba(var(--v-theme-on-surface), 0.5);
  font-size: 0.85rem;
}

.ai-runtime__stats {
  font-family: var(--font-family-mono, monospace);
  font-size: 0.78rem;
  color: rgba(var(--v-theme-on-surface), 0.7);
}

.ai-runtime__focus {
  max-width: 380px;
  font-size: 0.82rem;
  line-height: 1.35;
  color: rgba(var(--v-theme-on-surface), 0.78);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
</style>
